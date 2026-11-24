// Trackigami : logique de la fonction serveur « account-recovery » (sans rien de propre à Deno : elle se teste sous Node, voir tools/test-recovery-handler.mjs).
//
// Récupérer un compte dont on a perdu le mot de passe, avec le CODE DE SECOURS remis à l'inscription (COMPLETE-003, décision D-6 : pas de courriel). POST { username, code, password }.
// Modèle de menaces complet : supabase/COMPTES.md, « Changer et récupérer son mot de passe ». Étapes, dans l'ordre :
//   1. forme de la requête (méthode, taille avant lecture, JSON, longueurs) ; le mot de passe est jugé par les règles du jeu (js/accountRules.js) AVANT tout essai de code
//      (un mot de passe refusé ne consomme ni essai ni code, et son refus ne dit rien du compte) ;
//   2. frein de première ligne en mémoire de l'instance (par adresse) ; la vraie limite est EN BASE (recovery_begin : par pseudo saisi, par adresse, globale) ;
//   3. recovery_begin(pseudo, SHA-256 du code, SHA-256 de l'adresse) : le code lui-même n'est jamais transmis à la base ;
//   4. le bon code (réservé deux minutes) : le nouveau mot de passe est posé par l'API d'ADMINISTRATION de Supabase Auth (aucun hachage ici : c'est Auth qui hache) ;
//   5. recovery_finish : le code est consommé (usage unique) et les sessions du compte sont révoquées ; si Auth a refusé le mot de passe : recovery_abort, le code reste valable.
// UNIFORMITÉ (pas d'énumération de pseudos) : pseudo inconnu, compte sans code, mauvais code, pseudo verrouillé, code déjà réservé, pseudo ou code mal formés : UNE seule réponse
// (même statut, même corps, mêmes en-têtes), et une durée plancher identique pour toute réponse (minDurationMs) ; la base fait le même travail dans tous ces cas.
// Ne journalise JAMAIS un code, un mot de passe, un pseudo, une adresse ni un jeton (seulement des messages fixes et le statut des appels amont).
import { checkPseudo, checkPassword, normalizeRecoveryCode } from '../../../js/accountRules.js';

export const MAX_BODY_BYTES = 2048;                  // un pseudo, un code et un mot de passe : bien moins que cela
export const MIN_DURATION_MS = 1500;                 // durée plancher de toute réponse à un POST : la plus lente des voies d'échec la dépasse largement moins
export const UPSTREAM_TIMEOUT_MS = 8_000;            // au-delà, 503 plutôt qu'une fonction qui pend
export const RATE_LIMIT = { max: 10, windowMs: 60_000 };      // frein en mémoire, par adresse (la limite durable est en base)

// Le message de TOUT échec lié au pseudo ou au code : il ne dit pas lequel des deux est faux, ni si le pseudo existe, ni s'il est verrouillé.
export const FAIL_MESSAGE = 'Pseudo ou code de secours incorrect, ou trop d’essais sur ce pseudo : réessaie dans 15 minutes.';
export const WEAK_MESSAGE_CODE = 'weak-password';

const sha256hex = async (text) => [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
class Upstream extends Error {}      // Supabase injoignable, trop lent ou réponse illisible : panne passagère (503), jamais « erreur interne »

// Lecture PROGRESSIVE du corps avec une limite stricte en octets (comme submit-score : l'en-tête Content-Length n'est qu'une indication). Renvoie le texte, ou null si trop gros.
export async function readBodyLimited(req, maxBytes) {
  if (!req.body) { const t = await req.text(); return new TextEncoder().encode(t).length > maxBytes ? null : t; }
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch { /* flux déjà fermé */ } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

export function createRecoveryHandler({
  supabaseUrl = '', serviceKey = '', allowedOrigin = '*', fetch: rawFetch = globalThis.fetch, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  minDurationMs = MIN_DURATION_MS, upstreamTimeoutMs = UPSTREAM_TIMEOUT_MS, rateLimit = RATE_LIMIT, log = console.error, build = null,
} = {}) {
  const buildStamp = () => { const b = build ?? globalThis.__COPYTRACK_BUILD__; return typeof b === 'string' && /^[0-9a-f]{16}$/.test(b) ? b : null; };
  const fetchImpl = async (url, init = {}) => {
    try { return await rawFetch(url, { ...init, signal: AbortSignal.timeout(upstreamTimeoutMs) }); }
    catch (e) { throw new Upstream(e && e.message); }
  };
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
  // La réponse d'échec UNIQUE : construite au même endroit pour tous les cas (rien ne peut les distinguer par inadvertance).
  const fail = () => json(400, { error: FAIL_MESSAGE, code: 'recovery-failed' });

  const rpc = (name, args) => fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });

  const hits = new Map();       // empreinte d'adresse -> instants (ms) de ses dernières requêtes
  function tooFast(who) {
    const t = now();
    const recent = (hits.get(who) ?? []).filter((x) => t - x < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) { hits.set(who, recent); return Math.max(1, Math.ceil((rateLimit.windowMs - (t - recent[0])) / 1000)); }
    recent.push(t);
    hits.set(who, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < rateLimit.windowMs)) hits.delete(k);
    return 0;
  }

  // Le traitement d'un POST (sans la durée plancher, ajoutée par handle).
  async function recover(req) {
    if (!supabaseUrl || !serviceKey) { log('account-recovery : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes : refus'); return json(500, { error: 'Fonction mal configurée.' }); }
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return json(413, { error: 'Requête trop volumineuse.' });
    const text = await readBodyLimited(req, MAX_BODY_BYTES);
    if (text === null) return json(413, { error: 'Requête trop volumineuse.' });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { error: 'Requête invalide.', code: 'bad-request' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.username !== 'string' || typeof body.code !== 'string' || typeof body.password !== 'string'
      || body.username.length > 64 || body.code.length > 64 || body.password.length > 256) return json(400, { error: 'Requête invalide.', code: 'bad-request' });

    // Adresse : première valeur de x-forwarded-for (renseignée par la plateforme). Absente : un seau commun (la limite par pseudo et la limite globale tiennent sans elle).
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'inconnue').split(',')[0].trim().slice(0, 64);
    const ipKey = await sha256hex('copytrack-recovery-ip|' + ip);
    const wait = tooFast(ipKey);
    if (wait) return json(429, { error: `Trop de demandes : réessaie dans ${wait} s.`, code: 'rate' }, { 'Retry-After': String(wait) });

    // Mot de passe : les règles du jeu. Indépendant du compte (son refus ne dit rien du pseudo) ; jugé avant l'essai du code, qui n'est donc pas consommé pour rien.
    const pseudo = checkPseudo(body.username, { account: true });
    const pw = checkPassword(body.password, pseudo.ok ? pseudo.name : '');
    if (!pw.ok) return json(400, { error: pw.error, code: WEAK_MESSAGE_CODE });
    // Pseudo ou code mal formés : la MÊME réponse que tout autre échec (aucun appel à la base : ils ne peuvent correspondre à rien).
    const code = normalizeRecoveryCode(body.code);
    if (!pseudo.ok || !code.ok) return fail();

    const codeSha = await sha256hex(code.code);
    let begin;
    try {
      const r = await rpc('recovery_begin', { uname: pseudo.name, code_sha: codeSha, ip_key: ipKey });
      if (!r.ok) throw new Upstream('recovery_begin ' + r.status);      // étape SQL 21 absente (404), panne : 503, jamais « ouvert »
      begin = await r.json();
    } catch (e) {
      log('account-recovery : recovery_begin indisponible (étape SQL 21 appliquée ?) :', e && e.message);
      return json(503, { error: 'Service momentanément indisponible : réessaie dans un instant.', code: 'unavailable' }, { 'Retry-After': '30' });
    }
    if (!begin || typeof begin !== 'object') { log('account-recovery : réponse inattendue de recovery_begin'); return json(503, { error: 'Service momentanément indisponible : réessaie dans un instant.', code: 'unavailable' }, { 'Retry-After': '30' }); }
    if (begin.status === 'rate') {
      const retry = Number.isInteger(begin.retry) ? Math.min(3600, Math.max(1, begin.retry)) : 60;
      return json(429, { error: `Trop de demandes : réessaie dans ${retry < 90 ? retry + ' s' : Math.ceil(retry / 60) + ' min'}.`, code: 'rate' }, { 'Retry-After': String(retry) });
    }
    if (begin.status !== 'ok') return fail();           // 'fail' et tout ce qui n'est pas explicitement « ok » : fermé par défaut
    const uid = String(begin.user_id || ''), nonce = String(begin.nonce || '');
    if (!UUID_RE.test(uid) || !UUID_RE.test(nonce)) { log('account-recovery : identifiants invalides dans recovery_begin'); return json(503, { error: 'Service momentanément indisponible : réessaie dans un instant.', code: 'unavailable' }, { 'Retry-After': '30' }); }

    // Le bon code est réservé : nouveau mot de passe par l'API d'administration (Auth hache). Un échec lève la réservation : le code reste valable.
    const abort = async () => { try { await rpc('recovery_abort', { p_uid: uid, p_nonce: nonce }); } catch { /* la réservation expire seule en deux minutes */ } };
    let put;
    try {
      put = await fetchImpl(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
        method: 'PUT', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: body.password }),
      });
    } catch (e) { await abort(); log('account-recovery : Auth injoignable :', e && e.message); return json(503, { error: 'Service momentanément indisponible : réessaie dans un instant.', code: 'unavailable' }, { 'Retry-After': '10' }); }
    if (!put.ok) {
      await abort();
      let ec = '';
      try { const j = await put.json(); ec = String((j && (j.error_code || j.code)) || ''); } catch { /* corps illisible */ }
      log('account-recovery : Auth a refusé le nouveau mot de passe, statut', put.status, ec);
      if (put.status === 422 || ec === 'weak_password') return json(400, { error: 'Mot de passe refusé par le serveur (trop faible ou déjà divulgué) : choisis-en un autre.', code: WEAK_MESSAGE_CODE });
      return json(503, { error: 'Service momentanément indisponible : réessaie dans un instant.', code: 'unavailable' }, { 'Retry-After': '10' });
    }
    // Le mot de passe est changé : le code est consommé et les sessions révoquées. Un échec passager ne doit pas laisser le code redevenir valable au bout des deux minutes de réservation :
    // l'appel est donc tenté deux fois. Si les deux échouent, le mot de passe est tout de même le nouveau (le joueur peut se connecter) et on le journalise (sans rien de secret) pour que
    // l'exploitant sache qu'un code ou des sessions sont à revoir.
    let out = null;
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      try {
        const r = await rpc('recovery_finish', { p_uid: uid, p_nonce: nonce });
        if (!r.ok) throw new Upstream('recovery_finish ' + r.status);
        out = await r.json();
      } catch (e) { if (attempt === 1) log('account-recovery : ALERTE : recovery_finish a échoué (le code n’est pas marqué consommé) :', e && e.message); }
    }
    if (out && out.consumed !== true) log('account-recovery : ALERTE : le code n’a pas pu être marqué consommé (réservation expirée ?) : à vérifier dans recovery_log');
    else if (out && out.sessions === -1) log('account-recovery : ALERTE : les sessions n’ont pas pu être révoquées côté base : à vérifier (auth.sessions)');
    return json(200, { ok: true });
  }

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    // État du service (sans authentification, rien de secret ni du compte) : preuve observable de la version déployée (tools/check-deployed.mjs).
    if (req.method === 'GET') return json(200, { ok: true, service: 'account-recovery', build: buildStamp(), actions: ['recover'], limits: { maxBodyBytes: MAX_BODY_BYTES, perMinute: rateLimit.max } });
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
    const t0 = now();
    let res;
    try { res = await recover(req); }
    catch (e) {
      log('account-recovery : erreur interne :', e instanceof Upstream ? e.message : e && e.message);
      res = e instanceof Upstream ? json(503, { error: 'Service momentanément indisponible : réessaie dans un instant.', code: 'unavailable' }, { 'Retry-After': '10' }) : json(500, { error: 'Erreur interne.' });
    }
    // Durée plancher : une réponse rapide (pseudo mal formé, rejet immédiat) attend autant qu'une réponse qui a fait travailler la base : la durée ne trahit pas la voie suivie.
    const left = minDurationMs - (now() - t0);
    if (left > 0) await sleep(left);
    return res;
  };
}
