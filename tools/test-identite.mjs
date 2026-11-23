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
const { profile, saveProfile, reloadProfile } = await import('../js/profile.js');
const { PHYS_VER } = await import('../js/version.js');

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
const fakeTrack = (code) => ({ encode: () => code, tiles: [], name: 'Mon circuit', desc: '' });
const proof = { inputs: 'aW5wdXRz', time: 30 };
const resetSrv = () => { Object.assign(srv, { offline: false, refreshFails: false, refreshStatus: 0, singleUse: true, reuseRevokes: true, convertSupport: true, convertReady: null, autoconfirm: true, delay: {}, reuseCount: 0 }); srv.revoked.clear(); srv.calls.length = 0; account.convertAnonymous = 'auto'; };
const rec = (time, date) => ({ time, pv: PHYS_VER, splits: [], inputs: 'x', date, name: 'x', ghost: null });

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
  boot('S4'); await settle(account.signUp('Kim_08', 'motdepasse1'));
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

console.log('TECH-024 : « Garder ma progression » (sans conversion)');
function richGuest(name) {
  const d = boot(name); account.startGuest('Ana_05');
  const p = profile(); p.coins = 1234; saveProfile();
  for (let i = 0; i < 24; i++) storage.saveRecord('b-t' + i + '-x', rec(30 + i, 100 + i));
  storage.savePrefab({ id: 'pf1', name: 'Rampe', code: 'SHP1:x' });
  storage.saveCustomDeco({ id: 'cd1', name: 'Arche', parts: [] });
  storage.saveMode({ id: 'm1', name: 'Mon mode', rules: { a: 1 } });
  storage.setJSON('vproof', { t1: { inputs: 'v', time: 30 } });
  storage.setEditorDraft({ code: 'BROUILLON' });
  storage.saveMyTrack({ id: 'c1', name: 'Circuit', code: 'SHW3:abc' });
  return d;
}
const guestKeys = (d) => [...d.local.m.keys()].filter((k) => k.startsWith('shardway.'));
const setQuota = (d, quota) => {
  const real = d.local.setItem.bind(d.local);
  d.local.setItem = (k, v) => { let used = 0; for (const [kk, vv] of d.local.m) used += kk === k ? 0 : kk.length + vv.length; if (used + k.length + String(v).length > quota) throw new Error('QuotaExceededError'); real(k, v); };
  return () => { d.local.setItem = real; };
};
const usedOf = (d) => { let n = 0; for (const [k, v] of d.local.m) n += k.length + v.length; return n; };
await test('repli sans conversion + stockage serré : le compte est créé, la reprise échoue en le DISANT (avec la marche à suivre) ; l\'invité garde tout', async () => {
  resetSrv(); srv.convertSupport = false;
  const d = richGuest('M3');
  const before = new Map([...d.local.m].filter(([k]) => k.startsWith('shardway.')));
  const off = setQuota(d, usedOf(d) + 3000);
  const notices = []; account.onNotice = (m) => notices.push(m);
  const r = await settle(account.signUp('Ana_07', 'motdepasse1', { keepGuest: true }));
  account.onNotice = null; off();
  assert.equal(r.migration, 'failed');
  assert.ok(notices.some((m) => /code joueur/i.test(m)), 'le joueur sait quoi faire : ' + JSON.stringify(notices));
  for (const [k, v] of before) assert.equal(d.local.m.get(k), v, k + ' intacte dans l\'invité');
});

await test('repli sans conversion + place suffisante : la progression est DÉPLACÉE et vérifiée (pièces, records, circuits, prefabs, pièces perso, modes, preuve, brouillon) ; l\'invité n\'en garde pas de double', async () => {
  resetSrv(); srv.convertSupport = false;
  const d = richGuest('M4');
  const r = await settle(account.signUp('Ana_08', 'motdepasse1', { keepGuest: true }));
  assert.equal(r.migration, 'done');
  assert.equal(profile().coins, 1234); assert.equal(Object.keys(storage.dumpAll()).filter((k) => k.startsWith('rec3.')).length, 24);
  assert.deepEqual([storage.listPrefabs().length, storage.listCustomDecos().length, storage.listModes().length, storage.listMyTracks().length], [1, 1, 1, 1]);
  assert.ok(storage.getJSON('vproof', null).t1); assert.equal(storage.getEditorDraft().code, 'BROUILLON');
  const left = guestKeys(d).map((k) => k.slice('shardway.'.length)).filter((k) => /^(rec3\.|profile$|tracks$|prefabs$|cdecos$|modes$|vproof$|draft$)/.test(k));
  assert.deepEqual(left, [], 'déplacée, pas copiée : ' + left.join(', '));
  assert.ok(d.local.m.has('shardway.settings'), 'les réglages de l\'appareil restent à l\'invité');
});

console.log('TECH-025 : l\'invité devient le compte (conversion), la déconnexion ne détruit rien');
await test('invité → inscription → déconnexion → reconnexion : temps, circuit publié et « j\'aime » restent rattachés ; un seul joueur ; republier son circuit réussit ; aucun anonyme de plus', async () => {
  resetSrv();
  boot('C1'); account.startGuest('Zoe_01');
  await online.ensurePlayer('Zoe_01');
  const guest = online.uid;
  await online.submitScore({ trackKey: 'b-a-1', inputs: 'aQ', time: 20, physVer: PHYS_VER }, 'Zoe_01');
  await online.publish(fakeTrack('SHW3:circuit-de-zoe'), 'Zoe_01', proof);
  await online.toggleLike('t-42', 'Zoe_01');
  const anon0 = anonSignups();
  await settle(account.signUp('Zoe_01', 'motdepasse1', { keepGuest: true }));
  assert.equal(account.uid, guest, 'le compte EST l\'ancienne identité de l\'invité (même identifiant)');
  await online.publish(fakeTrack('SHW3:circuit-de-zoe'), 'Zoe_01', proof);              // republier : avant, « déjà publié par un autre pilote »
  assert.equal([...srv.players.values()].filter((n) => n.toLowerCase() === 'zoe_01').length, 1, 'une seule ligne de joueur pour ce pseudo');
  await account.signOut();
  assert.ok(!online.uid, 'nouvel invité propre : pas d\'identité tant qu\'il n\'en a pas besoin');
  boot('C1'); await account.signIn('Zoe_01', 'motdepasse1');
  assert.equal(account.uid, guest);
  assert.ok(srv.scores.has('b-a-1:' + guest), 'le temps de l\'invité est au compte'); assert.ok(srv.likes.has(guest + ':t-42'), 'le j\'aime aussi');
  assert.equal(srv.tracks.get('SHW3:circuit-de-zoe').author, guest);
  await online.publish(fakeTrack('SHW3:circuit-de-zoe'), 'Zoe_01', proof);
  assert.equal(anonSignups(), anon0, 'aucune session anonyme créée par ce cycle');
});
await test('projet où la conversion n\'est pas installée (la base ne l\'annonce pas) : un nouvel utilisateur, ANNONCÉ ; la session de l\'invité survit à la déconnexion (ses données restent à lui, aucun anonyme de plus)', async () => {
  resetSrv(); srv.convertSupport = false;
  boot('C2'); account.startGuest('Lou_02');
  await online.ensurePlayer('Lou_02');
  const guest = online.uid;
  await online.publish(fakeTrack('SHW3:circuit-de-lou'), 'Lou_02', proof);
  const notices = []; account.onNotice = (m) => notices.push(m);
  const r = await settle(account.signUp('Lou_02', 'motdepasse1', { keepGuest: true }));
  account.onNotice = null;
  assert.notEqual(account.uid, guest);
  assert.equal(r.guestIdentity, 'kept', 'le repli est dit à l\'appelant');
  assert.ok(notices.some((m) => /invité/i.test(m)), 'et au joueur : ' + JSON.stringify(notices));
  const anon0 = anonSignups();
  await account.signOut();
  boot('C2');
  await online.ensureSession();
  assert.equal(online.uid, guest, 'retour à l\'invité : la MÊME identité (avant : effacée, un nouvel anonyme)');
  assert.equal(anonSignups(), anon0);
  await online.publish(fakeTrack('SHW3:circuit-de-lou'), 'Lou_02', proof);            // c'est toujours son circuit
});
await test('projet mal réglé (la base annonce la conversion mais ne crée pas le compte) : échec EXPLICITE, le joueur reste l\'invité qu\'il était, sa progression intacte', async () => {
  resetSrv(); srv.convertSupport = false; srv.convertReady = true;
  boot('C3'); account.startGuest('Max_03');
  await online.ensurePlayer('Max_03');
  const guest = online.uid;
  storage.saveRecord('b-a-1', rec(22, 5));
  await assert.rejects(() => settle(account.signUp('Max_03', 'motdepasse1', { keepGuest: true })), (e) => e.code === 'conversion-unsupported' && /COMPTES\.md/.test(e.message));
  assert.equal(account.isAccount, false); assert.equal(online.kind, 'guest'); assert.equal(online.uid, guest);
  assert.equal(storage.getScope(), ''); assert.equal(storage.getRecord('b-a-1').time, 22, 'la progression de l\'invité est intacte');
});
await test('« Confirm email » activé sur le projet : la conversion n\'est pas tentée, message clair, rien n\'a changé', async () => {
  resetSrv(); srv.autoconfirm = false;
  boot('C4'); account.startGuest('Noe_04');
  await online.ensurePlayer('Noe_04');
  const guest = online.uid;
  await assert.rejects(() => settle(account.signUp('Noe_04', 'motdepasse1', { keepGuest: true })), (e) => e.code === 'server-config');
  assert.equal(online.uid, guest); assert.ok(!srv.calls.some((c) => c.path === '/auth/v1/user' && c.method === 'PUT'), 'aucune modification de l\'utilisateur');
});

await test('la conversion se désactive par la configuration du déploiement (CONFIG.accounts.convertAnonymous = false) : nouvel utilisateur, annoncé', async () => {
  resetSrv(); account.convertAnonymous = false;
  boot('C5'); account.startGuest('Eva_09');
  await online.ensurePlayer('Eva_09');
  const guest = online.uid;
  const r = await settle(account.signUp('Eva_09', 'motdepasse1'));
  assert.notEqual(account.uid, guest); assert.equal(r.guestIdentity, 'kept');
  assert.ok(!srv.calls.some((c) => c.path === '/rest/v1/rpc/account_conversion_ready'), 'le serveur n\'est même pas interrogé');
});

console.log('TECH-024 + TECH-025 : la progression suit l\'invité converti');
await test('stockage serré : l\'inscription avec « Garder ma progression » échoue en le DISANT, et l\'invité garde TOUT (rien de déplacé, aucun compte à 0 ◆)', async () => {
  resetSrv();
  const d = richGuest('M1');
  await online.ensurePlayer('Ana_05');
  const before = new Map(d.local.m);
  const off = setQuota(d, usedOf(d) + 3000);
  await assert.rejects(() => settle(account.signUp('Ana_05', 'motdepasse1', { keepGuest: true })), (e) => e.code === 'storage-full' && /rien n.a changé|reste/i.test(e.message));
  off();
  assert.equal(account.isAccount, false, 'pas de compte créé à moitié');
  for (const [k, v] of before) if (!k.startsWith('copytrack.')) assert.equal(d.local.m.get(k), v, k + ' intacte');
  assert.ok(![...d.local.m.keys()].some((k) => k.startsWith('shardwayacct.')), 'aucune copie partielle laissée');
  assert.equal(profile().coins, 1234); assert.equal(storage.listPrefabs().length, 1);
});
await test('place suffisante : la progression est DÉPLACÉE et vérifiée : pièces, 24 records, circuits, prefabs, pièces perso, modes, preuve de vérification, brouillon ; l\'invité n\'en garde pas de double', async () => {
  resetSrv();
  const d = richGuest('M2');
  await settle(account.signUp('Ana_06', 'motdepasse1', { keepGuest: true }));
  assert.ok(account.isAccount);
  assert.equal(profile().coins, 1234);
  assert.equal(Object.keys(storage.dumpAll()).filter((k) => k.startsWith('rec3.')).length, 24);
  assert.deepEqual(storage.listPrefabs().map((x) => x.id), ['pf1']); assert.deepEqual(storage.listCustomDecos().map((x) => x.id), ['cd1']); assert.deepEqual(storage.listModes().map((x) => x.id), ['m1']);
  assert.ok(storage.getJSON('vproof', null).t1); assert.equal(storage.getEditorDraft().code, 'BROUILLON'); assert.equal(storage.listMyTracks().length, 1);
  const left = guestKeys(d).map((k) => k.slice('shardway.'.length)).filter((k) => /^(rec3\.|profile$|tracks$|prefabs$|cdecos$|modes$|vproof$|draft$)/.test(k));
  assert.deepEqual(left, [], 'déplacée, pas copiée : ' + left.join(', '));
  assert.equal(srv.saves.get(account.uid).data.profile.coins, 1234, 'et partie dans le cloud du compte');
});
test('aucun jeton ni mot de passe dans le journal', () => {
  const toks = [...srv.tokens.keys(), ...srv.refresh.keys()];
  for (const line of logged) { assert.ok(!toks.some((t) => new RegExp('\\b' + t + '\\b').test(line)), 'jeton journalisé : ' + line.slice(0, 120)); assert.ok(!/motdepasse1/.test(line)); }
});

await finish('Tout le modèle d\'identité tient (conversion, migration, deux onglets).');
process.exit(0);
