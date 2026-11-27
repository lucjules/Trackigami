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
//   moderation      étape 22 (supabase/etape22-moderation.sql) : rpc mod_status / mod_queue / mod_detail / mod_reports / mod_set_*_hidden / mod_suspend / mod_unsuspend / mod_suspensions / mod_log,
//                   avec les MÊMES règles que la base : un non-modérateur reçoit 403 « Réservé aux modérateurs. » (mod_status répond faux), motif de 3 à 300 caractères, « déjà masqué », pas de
//                   suspension d'un modérateur ni de soi-même, journal tenu ; absentes sans l'option (PGRST202). L'état est `srv.mod` (voir resetModeration).
//   autoconfirm     /auth/v1/settings : « Confirm email » désactivé (vrai par défaut, comme le demande supabase/COMPTES.md).
// Données en ligne simulées : scores (clé circuit:joueur), circuits publiés (par code), j'aime (joueur:circuit), via la fonction submit-score et les RPC.
export const srv = { users: new Map(), tokens: new Map(), refresh: new Map(), saves: new Map(), accounts: new Map(), players: new Map(), calls: [], refreshFails: false, refreshStatus: 0, offline: false, beforeNextPatch: null, n: 0, delay: {},
  singleUse: false, reuseRevokes: false, convertSupport: false, autoconfirm: true, scores: new Map(), tracks: new Map(), likes: new Set(), revoked: new Set(),
  recovery: false, recoveryCodes: new Map(), recoveryUsed: new Map(), pwTokens: new Set(), codeSeq: 0, logouts: [], recoveryCalls: [], moderation: false, mod: null };
// État de la modération simulée : modérateurs (identifiants), contenus signalés, journal, suspensions. `items` : { kind, id, label, author, author_name, reports, counted, hidden, created_at,
// last_report_at, seen (signalements vus à la dernière décision), description, plays, likes, report_dates }.
export function resetModeration({ moderators = [], items = [], suspensions = [] } = {}) {
  srv.moderation = true;
  srv.mod = { moderators: new Set(moderators), items: items.map((i) => ({ reports: 0, counted: 0, hidden: false, seen: 0, created_at: '2026-11-20T10:00:00Z', last_report_at: null, plays: 0, likes: 0, report_dates: [], description: '', ...i })),
    log: [], suspensions: suspensions.map((x, n) => ({ id: n + 1, created_at: '2026-11-21T10:00:00Z', until: null, lifted_at: null, ...x })), calls: [], seq: 100 };
  return srv.mod;
}
const WHY = 'Un motif de 3 à 300 caractères est obligatoire.';
function moderationRpc(fn, body, user) {
  const m = srv.mod;
  m.calls.push({ fn, body, user: user.id });
  if (fn === 'mod_status') return json(200, m.moderators.has(user.id));
  if (!m.moderators.has(user.id)) return json(403, { code: '42501', message: 'Réservé aux modérateurs.' });
  const bad = (message) => json(400, { code: 'P0001', message });
  const page = (rows) => rows.slice(Math.max(0, body.off | 0), Math.max(0, body.off | 0) + Math.min(100, Math.max(1, body.lim ?? 30)));
  const find = (kind, id) => m.items.find((i) => i.kind === kind && String(i.id) === String(id));
  const active = (x) => !x.lifted_at && (!x.until || Date.parse(x.until) > Date.now());
  const logPush = (action, kind, target, reason, extra = {}) => m.log.unshift({ id: ++m.seq, at: new Date().toISOString(), actor_name: m.names?.[m.actor] || 'Moi', action, kind, target: String(target), target_name: null, reason, reports_seen: null, ...extra });
  const authorOf = (i) => ({ id: i.author, name: i.author_name, tracks: 1, hidden_tracks: 0, hidden_comments: 0, moderator: m.moderators.has(i.author), suspension: (() => { const x = m.suspensions.find((y) => y.user_id === i.author && active(y)); return x ? { id: x.id, reason: x.reason, until: x.until } : null; })() });
  m.actor = user.id;
  if (fn === 'mod_queue') {
    if (!['all', 'track', 'comment'].includes(body.k)) return bad('Type inconnu.');
    if (!['pending', 'hidden', 'all'].includes(body.st)) return bad('État inconnu.');
    const rows = m.items.filter((i) => (body.k === 'all' || i.kind === body.k) && (i.reports > 0 || i.hidden)).map((i) => ({ ...i, pending: i.reports > i.seen }))
      .filter((i) => (body.st === 'pending' ? i.pending : body.st === 'hidden' ? i.hidden : true));
    return json(200, page(rows).map((i) => ({ kind: i.kind, id: String(i.id), label: i.label, author: i.author, author_name: i.author_name, reports: i.reports, counted: i.counted, hidden: i.hidden, created_at: i.created_at, last_report_at: i.last_report_at, pending: i.pending })));
  }
  if (fn === 'mod_detail' || fn === 'mod_reports') {
    const i = find(body.k, body.tid);
    if (!i) return bad('Contenu introuvable.');
    if (fn === 'mod_reports') return json(200, i.report_dates.map((d) => ({ reported_at: d, counted: true })));
    const hist = m.log.filter((l) => l.kind === i.kind && l.target === String(i.id)).slice(0, 20);
    return json(200, { kind: i.kind, id: i.id, name: i.label, body: i.label, description: i.description, plays: i.plays, likes: i.likes, reports: i.reports, counted: i.counted, hidden: i.hidden, created_at: i.created_at,
      track: i.kind === 'comment' ? { id: 't0', name: 'Circuit du commentaire', hidden: false } : undefined, author: authorOf(i), history: hist });
  }
  if (fn === 'mod_set_track_hidden' || fn === 'mod_set_comment_hidden') {
    const kind = fn === 'mod_set_track_hidden' ? 'track' : 'comment', id = kind === 'track' ? body.t : body.c, why = String(body.why || '').trim();
    if (why.length < 3 || why.length > 300) return bad(WHY);
    const i = find(kind, id);
    if (!i) return bad(kind === 'track' ? 'Circuit introuvable.' : 'Commentaire introuvable.');
    if (i.hidden === !!body.hide) return bad(kind === 'track' ? (body.hide ? 'Ce circuit est déjà masqué.' : 'Ce circuit est déjà visible.') : (body.hide ? 'Ce commentaire est déjà masqué.' : 'Ce commentaire est déjà visible.'));
    i.hidden = !!body.hide; i.seen = i.reports;
    logPush(body.hide ? 'hide' : 'restore', kind, id, why, { reports_seen: i.reports });
    return json(200, null);
  }
  if (fn === 'mod_suspend' || fn === 'mod_unsuspend') {
    const why = String(body.why || '').trim();
    if (why.length < 3 || why.length > 300) return bad(WHY);
    const cur = m.suspensions.find((x) => x.user_id === body.u && active(x));
    if (fn === 'mod_unsuspend') {
      if (!cur) return bad('Ce compte n’est pas suspendu.');
      cur.lifted_at = new Date().toISOString(); cur.lift_reason = why; logPush('unsuspend', 'account', body.u, why);
      return json(200, null);
    }
    if (body.u === user.id) return bad('On ne se suspend pas soi-même.');
    if (m.moderators.has(body.u)) return bad('Un modérateur ne se suspend pas : retire d’abord son statut.');
    if (body.until_at && (Date.parse(body.until_at) <= Date.now())) return bad('La date de fin doit être dans le futur, et dans moins de 10 ans.');
    if (cur) return bad('Ce compte est déjà suspendu : réactive-le d’abord pour changer la suspension.');
    const row = { id: ++m.seq, user_id: body.u, name: (m.items.find((i) => i.author === body.u) || {}).author_name || null, reason: why, created_at: new Date().toISOString(), until: body.until_at || null, lifted_at: null, created_by_name: 'Moi' };
    m.suspensions.push(row); logPush('suspend', 'account', body.u, why);
    return json(200, row.id);
  }
  if (fn === 'mod_suspensions') {
    return json(200, page(m.suspensions.filter((x) => !body.active_only || active(x)).slice().reverse()).map((x) => ({ id: x.id, user_id: x.user_id, name: x.name || null, reason: x.reason, created_at: x.created_at, created_by_name: 'Moi', until: x.until, lifted_at: x.lifted_at, lift_reason: x.lift_reason || null, active: active(x) })));
  }
  if (fn === 'mod_log') return json(200, page(m.log.filter((l) => (!body.k || l.kind === body.k) && (!body.tid || l.target === body.tid))));
  return json(404, { code: 'PGRST202', message: 'Could not find the function public.' + fn + ' in the schema cache' });
}
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
  if (path.startsWith('/rest/v1/rpc/mod_')) {
    const fn = path.split('/').pop();
    return srv.moderation ? moderationRpc(fn, body || {}, user) : json(404, { code: 'PGRST202', message: 'Could not find the function public.' + fn + ' in the schema cache' });
  }
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
