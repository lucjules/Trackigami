// Modèle d'identité unique (TRANS-11) : node tools/test-identite.mjs   (npm test)
//   TECH-025  l'utilisateur anonyme de l'invité est CONVERTI en compte (même identifiant : temps, circuits, j'aime restent à lui) ; la déconnexion ne détruit jamais une identité
//             d'invité qui a des données ; sans conversion possible : échec explicite ou repli annoncé, jamais silencieux ;
//   TECH-024  « Garder ma progression » : migration VÉRIFIÉE (déplacement, bibliothèques comprises) ou échec annoncé sans aucune perte ;
//   TECH-026  deux onglets : renouvellement de jeton sûr (relecture, verrou, évènement « storage ») ; un refus n'invente jamais une identité sans le dire.
// Faux Supabase (tools/fake-supabase.mjs) avec jetons de renouvellement à usage unique et détection de réutilisation ; temps virtuel. Le VRAI comportement de GoTrue
// (conversion anonyme, intervalle de réutilisation des jetons) n'est pas vérifiable ici : procédure manuelle dans supabase/COMPTES.md.
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { test, finish } from './harness.mjs';
import { device, srv } from './fake-supabase.mjs';

device('A');
const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account } = await import('../js/account.js');
const { reloadProfile } = await import('../js/profile.js');

// ---- Temps virtuel ----
const clock = { now: 0 };
let seq = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, { at: clock.now + Math.max(0, +ms || 0), fn, id }); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
async function advance(ms) {
  const end = clock.now + ms;
  await flush();
  for (;;) {
    const next = [...timers.values()].filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!next) break;
    timers.delete(next.id); clock.now = Math.max(clock.now, next.at);
    try { next.fn(); } catch { /* sans importance */ }
    await flush();
  }
  clock.now = end;
}
// Une promesse menée à son terme en faisant avancer le temps virtuel (les attentes internes — repli sans verrou — ne bloquent pas le test).
async function settle(p) { let done = false, val, err; p.then((v) => { done = true; val = v; }, (e) => { done = true; err = e; }); for (let i = 0; i < 100 && !done; i++) await advance(500); if (err) throw err; return val; }

// ---- Journal : aucun jeton ne doit jamais y apparaître ----
const logged = [];
for (const m of ['log', 'info', 'warn', 'error', 'debug']) { const orig = console[m].bind(console); console[m] = (...a) => { logged.push(a.map(String).join(' ')); orig(...a); }; }

function boot(name) {
  const d = device(name);
  account.state = null; account.status = 'idle'; account.lastError = ''; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope('');
  online.session = storage.getJSON('online.session', null); online.player = storage.getJSON('online.player', null);      // (comme au chargement de la page)
  reloadProfile();
  return d;
}
const anonSignups = () => srv.calls.filter((c) => c.path === '/auth/v1/signup' && !(c.body && c.body.email)).length;
const resetSrv = () => { Object.assign(srv, { offline: false, refreshFails: false, refreshStatus: 0, singleUse: true, reuseRevokes: true, convertSupport: true, convertReady: null, autoconfirm: true, delay: {}, reuseCount: 0 }); srv.revoked.clear(); account.convertAnonymous = 'auto'; };

console.log('TECH-026 : deux onglets, jetons de renouvellement à usage unique');
const tab = async (n) => (await import('../js/online.js?onglet=' + n)).online;
const expire = (o) => { o.session = { ...o.session, expires_at: 1 }; };
const expireStored = () => { const s = storage.getJSON('online.session', null); storage.setJSON('online.session', { ...s, expires_at: 1 }); };
await test('invité, onglet 2 resté en arrière : il reprend la session renouvelée par l\'onglet 1 au lieu de réutiliser son jeton (avant : refus, puis une NOUVELLE identité qui écrase la première)', async () => {
  resetSrv();
  boot('S1'); await online.ensureSession();
  const uid = online.uid;
  const t2 = await tab(1); t2.kind = 'guest'; t2.session = storage.getJSON('online.session', null);      // (un onglet chargé : la session enregistrée)
  expire(online); expireStored(); expire(t2);
  await settle(online.ensureSession());             // onglet 1 renouvelle
  const anon0 = anonSignups();
  await settle(t2.ensureSession());                 // onglet 2, avec son jeton déjà utilisé en mémoire
  assert.equal(t2.uid, uid); assert.equal(anonSignups(), anon0, 'aucune nouvelle identité');
  assert.equal(storage.getJSON('online.session', null).user.id, uid, 'la session enregistrée est toujours celle de l\'invité');
  assert.equal(srv.reuseCount || 0, 0, 'aucun jeton réutilisé');
});
async function concurrentGuest(withLocks) {
  resetSrv();
  boot(withLocks ? 'S2' : 'S3'); await online.ensureSession();
  const uid = online.uid;
  const t2 = await tab(withLocks ? 2 : 3); t2.kind = 'guest'; t2.session = storage.getJSON('online.session', null);      // (un onglet chargé : la session enregistrée)
  expire(online); expireStored(); expire(t2);
  const anon0 = anonSignups();
  const [a, b] = await settle(Promise.all([online.ensureSession(), t2.ensureSession()]));
  assert.equal(a.user.id, uid); assert.equal(b.user.id, uid); assert.equal(anonSignups(), anon0);
  assert.equal(storage.getJSON('online.session', null).user.id, uid);
  assert.equal(srv.reuseCount, 0, 'aucun jeton envoyé deux fois (la détection de réutilisation révoquerait la famille)'); assert.equal(srv.revoked.size, 0);
}
const realLocks = globalThis.navigator && globalThis.navigator.locks;
function fakeLocks() {      // navigator.locks (Web Locks API) partagé par les « onglets » de ce processus : une file par nom
  const queues = new Map();
  return { request(name, cb) { const prev = queues.get(name) || Promise.resolve(); const run = prev.then(() => cb()); queues.set(name, run.catch(() => {})); return run; } };
}
await test('invité, deux onglets qui renouvellent EN MÊME TEMPS, verrou inter-onglets (navigator.locks) : une seule identité, aucun jeton réutilisé', async () => {
  Object.defineProperty(globalThis.navigator, 'locks', { value: fakeLocks(), configurable: true });
  try { await concurrentGuest(true); assert.equal(srv.reuseCount, 0); } finally { Object.defineProperty(globalThis.navigator, 'locks', { value: realLocks, configurable: true }); }
});
await test('invité, deux onglets en même temps SANS navigator.locks (repli : bail dans le stockage, relecture de la session) : une seule identité, aucun jeton réutilisé', async () => {
  await concurrentGuest(false);
});
await test('compte, onglet 2 resté en arrière : il ne réutilise pas le jeton (avec la détection de réutilisation, toute la famille serait révoquée) ; le compte reste connecté dans les deux onglets', async () => {
  resetSrv();
  boot('S4'); await account.signUp('Kim_08', 'motdepasse1');
  const t2 = await tab(4); t2.useAccount(storage.getGlobal('account').session);
  t2.onAccountSession = (s) => { const g = storage.getGlobal('account'); storage.setGlobal('account', { ...g, session: s }); };
  expire(online); expire(t2); { const g = storage.getGlobal('account'); storage.setGlobal('account', { ...g, session: { ...g.session, expires_at: 1 } }); }
  await settle(online.ensureSession());
  await settle(t2.ensureSession());
  assert.equal(srv.revoked.size, 0, 'aucune famille de jetons révoquée'); assert.equal(srv.reuseCount || 0, 0);
  expire(online); await settle(online.ensureSession());      // l'onglet 1 renouvelle encore : son compte n'a pas été déconnecté
  assert.ok(account.isAccount); assert.equal(t2.uid, account.uid);
});
await test('évènement « storage » : l\'autre onglet adopte tout de suite la session renouvelée (et un onglet en mode compte ignore la session d\'invité)', async () => {
  resetSrv();
  boot('S5'); await online.ensureSession();
  const t2 = await tab(5); t2.kind = 'guest'; t2.session = storage.getJSON('online.session', null);      // (un onglet chargé : la session enregistrée)
  expire(online); await settle(online.ensureSession());
  const fresh = storage.getJSON('online.session', null);
  assert.notEqual(t2.session.refresh_token, fresh.refresh_token);
  t2.storageEvent({ key: storage.scopedKey('online.session'), newValue: JSON.stringify(fresh) });
  assert.equal(t2.session.refresh_token, fresh.refresh_token);
  const t3 = await tab(6); t3.useAccount({ access_token: 'x', refresh_token: 'y', expires_at: 9e9, user: { id: 'compte-z' } });
  assert.equal(t3.storageEvent({ key: storage.scopedKey('online.session'), newValue: JSON.stringify(fresh) }), false, 'un onglet en mode compte ne prend jamais la session de l\'invité');
  assert.equal(t3.uid, 'compte-z');
});
await test('vrai refus du serveur (jeton révoqué) : une nouvelle identité d\'invité est créée ET ANNONCÉE (jamais en silence)', async () => {
  resetSrv();
  boot('S6'); await online.ensureSession();
  const old = online.uid;
  const notices = []; online.onNotice = (m) => notices.push(m);
  srv.refreshFails = true; expire(online); expireStored();
  await settle(online.ensureSession());
  online.onNotice = null; srv.refreshFails = false;
  assert.notEqual(online.uid, old);
  assert.equal(notices.length, 1, 'annoncé : ' + JSON.stringify(notices));
});

test('aucun jeton ni mot de passe dans le journal', () => {
  const toks = [...srv.tokens.keys(), ...srv.refresh.keys()];
  for (const line of logged) { assert.ok(!toks.some((t) => new RegExp('\\b' + t + '\\b').test(line)), 'jeton journalisé : ' + line.slice(0, 120)); assert.ok(!/motdepasse1/.test(line)); }
});

await finish('Tout le modèle d\'identité tient (conversion, migration, deux onglets).');
process.exit(0);
