// Faux navigateur (un « appareil » = un localStorage + un sessionStorage) et faux Supabase (Auth + REST) en mémoire, pour les tests du client (comptes, cloud).
// Extrait de test-account.mjs : refreshStatus simule une panne du serveur (500, 429) au renouvellement de session ; delay, une sauvegarde lente.

// ---- Faux navigateur : un « appareil » = un localStorage + un sessionStorage ------------------------------------
class Store {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
Object.defineProperty(Store.prototype, Symbol.iterator, { value: undefined });
export const devices = {};
export function device(name) {
  const d = devices[name] || (devices[name] = { local: new Store(), session: new Store() });
  globalThis.localStorage = new Proxy(d.local, { ownKeys: () => [...d.local.m.keys()], getOwnPropertyDescriptor: (t, k) => (d.local.m.has(k) ? { enumerable: true, configurable: true, value: d.local.m.get(k) } : undefined) });
  globalThis.sessionStorage = d.session;
  return d;
}
device('A');

// ---- Faux Supabase ----------------------------------------------------------------------------------------------
// Options (toutes inactives par défaut : les suites existantes voient le serveur d'avant) :
//   singleUse       jetons de renouvellement à USAGE UNIQUE (comme GoTrue avec la rotation) : un jeton déjà utilisé est refusé (400) ;
//   reuseRevokes    … et sa réutilisation révoque toute la FAMILLE de jetons de la session (détection de réutilisation de GoTrue) ;
//   convertSupport  la base crée la ligne `accounts` quand un utilisateur anonyme est converti (PUT /auth/v1/user) ; sans elle, la conversion réussit côté Auth seulement ;
//                   la fonction rpc/account_conversion_ready répond vrai (ou srv.convertReady, pour simuler un projet mal réglé) ; absente sinon (PGRST202) ;
//   recovery        code de secours (supabase/etape21-recuperation.sql + fonction account-recovery) : rpc recovery_status / recovery_code_new (exige un jeton ISSU D'UNE CONNEXION PAR MOT DE PASSE,
//                   comme la revendication `amr` de la base), /auth/v1/logout, /functions/v1/account-recovery (échec UNIQUE, usage unique, sessions révoquées) ; absentes sinon (PGRST202 / 404) ;
//   autoconfirm     /auth/v1/settings : « Confirm email » désactivé (vrai par défaut, comme le demande supabase/COMPTES.md).
// Données en ligne simulées : scores (clé circuit:joueur), circuits publiés (par code), j'aime (joueur:circuit), via la fonction submit-score et les RPC.
export const srv = { users: new Map(), tokens: new Map(), refresh: new Map(), saves: new Map(), accounts: new Map(), players: new Map(), calls: [], refreshFails: false, refreshStatus: 0, offline: false, beforeNextPatch: null, n: 0, delay: {},
  singleUse: false, reuseRevokes: false, convertSupport: false, autoconfirm: true, scores: new Map(), tracks: new Map(), likes: new Set(), revoked: new Set(),
  recovery: false, recoveryCodes: new Map(), recoveryUsed: new Map(), pwTokens: new Set(), codeSeq: 0, logouts: [], recoveryCalls: [] };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export function session(user, family = 'f' + ++srv.n) {
  const at = 'at' + ++srv.n, rt = 'rt' + ++srv.n;
  srv.tokens.set(at, user); srv.refresh.set(rt, { user, family, used: false });
  return { access_token: at, refresh_token: rt, expires_in: 3600, user: { id: user.id, is_anonymous: !!user.anon, email: user.email } };
}
globalThis.fetch = async (url, init = {}) => {
  if (srv.offline) throw new TypeError('network down');
  const u = new URL(url), path = u.pathname, q = u.searchParams, method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  const auth = (init.headers || {}).Authorization;
  const user = auth ? srv.tokens.get(auth.replace('Bearer ', '')) : null;
  srv.calls.push({ method, path, body });
  // Latence simulée par méthode sur la sauvegarde (srv.delay = { GET: ms, PATCH: ms }) : avec un temps virtuel, une « synchronisation de 6 s » sans attendre.
  if (path === '/rest/v1/cloud_saves' && srv.delay[method]) await new Promise((r) => setTimeout(r, srv.delay[method]));
  if (path === '/auth/v1/signup') {
    if (body.email) {
      if (srv.users.has(body.email)) return json(422, { error_code: 'user_already_exists', msg: 'User already registered' });
      const user = { id: 'u-' + ++srv.n, email: body.email, pw: body.password, username: body.data && body.data.username };
      srv.users.set(body.email, user); srv.accounts.set(user.id, user.username);
      return json(200, session(user));
    }
    const anon = { id: 'anon-' + ++srv.n, anon: true };
    return json(200, session(anon));
  }
  if (path === '/auth/v1/token') {
    if (q.get('grant_type') === 'password') {
      const user = srv.users.get(body.email);
      if (!user || user.pw !== body.password) return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const s = session(user);
      srv.pwTokens.add(s.access_token);          // (la base ne voit une authentification par mot de passe récente que dans CE jeton)
      return json(200, s);
    }
    if (srv.refreshStatus) return json(srv.refreshStatus, { message: 'indisponible' });
    const r = srv.refresh.get(body.refresh_token);
    if (srv.refreshFails || !r || srv.revoked.has(r.family)) return json(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    if (r.used && srv.singleUse) {
      if (srv.reuseRevokes) srv.revoked.add(r.family);          // réutilisation : toute la famille est révoquée (les jetons des autres onglets aussi)
      srv.reuseCount = (srv.reuseCount || 0) + 1;
      return json(400, { error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' });
    }
    r.used = true;
    return json(200, session(r.user, r.family));
  }
  if (path === '/auth/v1/settings') return json(200, { external: { anonymous_users: true, email: true }, mailer_autoconfirm: srv.autoconfirm, disable_signup: false });
  if (path === '/auth/v1/user' && method === 'PUT') {
    // Conversion d'un utilisateur anonyme (même identifiant) : adresse + mot de passe + pseudo. Sans « Confirm email » désactivé, l'adresse reste en attente.
    if (!user) return json(401, { message: 'JWT expired' });
    if (body.email && [...srv.users.values()].some((x) => x.email === body.email && x !== user)) return json(422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
    if (!srv.autoconfirm) { user.new_email = body.email; return json(200, { id: user.id, email: null, new_email: body.email, is_anonymous: true }); }
    if (body.email) { user.email = body.email; user.anon = false; srv.users.set(body.email, user); }
    if (body.password) user.pw = body.password;
    if (body.data && body.data.username) user.username = body.data.username;
    if (srv.convertSupport && !user.anon && user.username) srv.accounts.set(user.id, user.username);
    return json(200, { id: user.id, email: user.email, is_anonymous: !!user.anon, user_metadata: { username: user.username } });
  }
  if (path === '/rest/v1/rpc/account_conversion_ready') {
    const ready = srv.convertReady != null ? srv.convertReady : srv.convertSupport;
    return ready ? json(200, true) : json(404, { code: 'PGRST202', message: 'Could not find the function public.account_conversion_ready without parameters in the schema cache' });
  }
  if (path === '/rest/v1/rpc/username_available') return json(200, ![...srv.accounts.values()].some((n) => n.toLowerCase() === body.n.toLowerCase()));
  if (path === '/auth/v1/logout') {
    srv.logouts.push({ scope: q.get('scope'), token: (auth || '').replace('Bearer ', '') });
    if (user) for (const [t, u] of [...srv.tokens]) { if (u === user && (q.get('scope') === 'others' ? t !== auth.replace('Bearer ', '') : q.get('scope') === 'local' ? t === auth.replace('Bearer ', '') : true)) srv.tokens.delete(t); }
    return new Response(null, { status: 204 });
  }
  if (path === '/functions/v1/account-recovery') {
    // La fonction serveur, au niveau du CLIENT : une seule réponse d'échec ; le bon code est consommé, le mot de passe change, les sessions du compte tombent. (Sa vraie logique : tools/test-recovery-handler.mjs.)
    if (!srv.recovery) return json(404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
    srv.recoveryCalls.push(body);
    const id = [...srv.accounts].find(([, n]) => n.toLowerCase() === String(body.username).toLowerCase());
    const target = id && [...srv.users.values()].find((x) => x.id === id[0]);
    if (!target || srv.recoveryCodes.get(target.id) !== body.code) return json(400, { error: 'Pseudo ou code de secours incorrect, ou trop d’essais sur ce pseudo : réessaie dans 15 minutes.', code: 'recovery-failed' });
    target.pw = body.password; srv.recoveryCodes.delete(target.id); srv.recoveryUsed.set(target.id, true);
    for (const [t, u] of [...srv.tokens]) if (u === target) srv.tokens.delete(t);
    for (const [t, r] of [...srv.refresh]) if (r.user === target) srv.refresh.delete(t);
    return json(200, { ok: true });
  }
  if (path === '/rest/v1/rpc/recovery_status' || path === '/rest/v1/rpc/recovery_code_new') {
    if (!srv.recovery) return json(404, { code: 'PGRST202', message: 'Could not find the function public.' + path.split('/').pop() + ' without parameters in the schema cache' });
    if (!user) return json(401, { message: 'JWT expired' });
    if (path.endsWith('recovery_status')) return json(200, { account: srv.accounts.has(user.id), has_code: srv.recoveryCodes.has(user.id), created_at: srv.recoveryCodes.has(user.id) ? '2026-11-24T10:00:00Z' : null, used_at: srv.recoveryUsed.has(user.id) ? '2026-11-23T10:00:00Z' : null });
    if (!srv.accounts.has(user.id)) return json(400, { message: 'Ce n\'est pas un compte' });
    if (!srv.pwTokens.has(auth.replace('Bearer ', ''))) return json(400, { message: 'Mot de passe à confirmer : reconnecte-toi pour créer un code de secours.' });
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let code = ''; for (let i = 0, n = ++srv.codeSeq * 7919; i < 16; i++, n = Math.floor(n / 3) + 17 * (i + 3)) code += A[(n + i * 5) % 32];
    srv.recoveryCodes.set(user.id, code); srv.recoveryUsed.delete(user.id);
    return json(200, code.replace(/(.{4})(?=.)/g, '$1-'));
  }
  if (path === '/rest/v1/rpc/delete_account') { srv.users.delete(user.email); srv.saves.delete(user.id); srv.accounts.delete(user.id); return json(200, null); }
  if (!user) return json(401, { message: 'JWT expired' });
  if (path === '/rest/v1/accounts') return json(200, srv.accounts.has(user.id) ? [{ username: srv.accounts.get(user.id) }] : []);
  if (path === '/rest/v1/players') { srv.players.set(body.id, body.name); return new Response('', { status: 201 }); }
  if (path === '/functions/v1/submit-score') {
    if (body.action === 'publish-track') {
      const t = srv.tracks.get(body.code);
      if (t && t.author !== user.id) return json(409, { error: 'Ce circuit est déjà publié par un autre pilote.', taken: true });
      const row = t || { id: '00000000-0000-4000-8000-' + String(++srv.n).padStart(12, '0'), code: body.code, author: user.id, name: body.name };
      srv.tracks.set(body.code, row); return json(200, { id: row.id, author_time: body.time });
    }
    srv.scores.set(body.trackKey + ':' + user.id, { player: user.id, time: body.time }); return json(200, { ok: true, time: body.time });
  }
  if (path === '/rest/v1/rpc/toggle_like') { const k = user.id + ':' + body.t; if (srv.likes.has(k)) srv.likes.delete(k); else srv.likes.add(k); return json(200, srv.likes.has(k)); }
  if (path === '/rest/v1/cloud_saves') {
    if (method === 'GET') { const r = srv.saves.get(user.id); return json(200, r ? [{ data: r.data, rev: r.rev }] : []); }
    if (method === 'POST') {
      if (body.user_id !== user.id) return json(403, { message: 'new row violates row-level security policy' });
      if (srv.saves.has(user.id)) return json(409, { code: '23505', message: 'duplicate key' });
      srv.saves.set(user.id, { data: body.data, rev: 1 }); return new Response('', { status: 201 });
    }
    if (method === 'PATCH') {
      if (srv.beforeNextPatch) { const f = srv.beforeNextPatch; srv.beforeNextPatch = null; f(user); }
      const r = srv.saves.get(user.id), want = Number(q.get('rev').replace('eq.', ''));
      if (!r || r.rev !== want) return json(200, []);
      r.data = body.data; r.rev++; return json(200, [{ rev: r.rev }]);
    }
  }
  return json(404, { message: 'inconnu ' + path });
};
