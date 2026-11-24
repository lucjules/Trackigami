// Mot de passe et code de secours, côté CLIENT (COMPLETE-003) : node tools/test-recuperation-client.mjs   (npm test)
//   (a) changer son mot de passe (re-authentification par le mot de passe actuel) ; (b) code de secours : remis à l'inscription (jamais écrit sur l'appareil), régénéré sur confirmation
//   du mot de passe ; (c) « J'ai perdu mon mot de passe » : pseudo + code + nouveau mot de passe, sans session ; (d) comptes existants : l'écran du compte sait qu'il manque un code.
// Faux Supabase (tools/fake-supabase.mjs, option `recovery`) : il impose, comme la base, qu'un code ne se crée qu'avec un jeton issu d'une connexion PAR MOT DE PASSE. La vraie base est
// éprouvée par tools/test-etape21-sql.sh, la vraie fonction (gestionnaire) par tools/test-recovery-handler.mjs ; l'interface réelle par tools/test-browser-recuperation.mjs.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device, devices, srv } from './fake-supabase.mjs';
import { checkPassword, normalizeRecoveryCode, formatRecoveryCode, RECOVERY_ALPHABET } from '../js/accountRules.js';

device('A');
const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account, checkPassword: accountCheckPassword } = await import('../js/account.js');
const { reloadProfile } = await import('../js/profile.js');
const { CONFIG } = await import('../js/config.js');

// ---- Journal et réseau observés ----
const logged = [];
for (const m of ['log', 'info', 'warn', 'error', 'debug']) { const orig = console[m].bind(console); console[m] = (...a) => { logged.push(a.map(String).join(' ')); orig(...a); }; }
const realFetch = globalThis.fetch;
const sent = [];       // { path, auth, body }
globalThis.fetch = async (url, init = {}) => { sent.push({ path: new URL(url).pathname, auth: (init.headers || {}).Authorization || '', body: init.body || '' }); return realFetch(url, init); };

const PW = 'mot-de-passe-1', PW2 = 'mot-de-passe-2', PW3 = 'mot-de-passe-3';
function boot() {
  device('A');
  account.state = null; account.status = 'idle'; account.lastError = ''; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope('');
  online.session = storage.getJSON('online.session', null); online.player = storage.getJSON('online.player', null);
  reloadProfile();
}
const reset = (over = {}) => {
  Object.assign(srv, { offline: false, refreshFails: false, refreshStatus: 0, singleUse: false, reuseRevokes: false, convertSupport: false, convertReady: null, autoconfirm: true, recovery: true, ...over });
  sent.length = 0;
};
const quiet = () => { clearTimeout(account._timer); };
const user = (name) => [...srv.users.values()].find((u) => u.username && u.username.toLowerCase() === name.toLowerCase());
const callsTo = (path) => sent.filter((c) => c.path === path);
// Tout ce que l'appareil garde (stockage local et de session de TOUS les « appareils » de ce test), à plat.
const deviceDump = () => Object.values(devices).map((d) => [...d.local.m.entries(), ...d.session.m.entries()].map(([k, v]) => k + '=' + v).join('\n')).join('\n');
const raw = (code) => code.replace(/-/g, '');

console.log('Règles partagées (js/accountRules.js)');
test('checkPassword : mêmes règles qu\'avant, et account.js les réexporte', () => {
  assert.equal(accountCheckPassword, checkPassword);
  assert.equal(checkPassword('court').ok, false);
  assert.equal(checkPassword('x'.repeat(73)).ok, false);
  assert.equal(checkPassword('Alice1234', 'alice1234').ok, false);
  assert.equal(checkPassword('mot-de-passe-1', 'alice').ok, true);
});
test('code de secours : alphabet de 32 signes sans I, L, O, U ; normalisation tolérante (casse, tirets, espaces, O→0, I/L→1) ; formes impossibles refusées', () => {
  assert.equal(RECOVERY_ALPHABET.length, 32);
  assert.equal(new Set(RECOVERY_ALPHABET).size, 32);
  for (const c of 'ILOU') assert.ok(!RECOVERY_ALPHABET.includes(c));
  assert.deepEqual(normalizeRecoveryCode(' abod-il34 efgh-56 78 '), { ok: true, code: 'AB0D1134EFGH5678' });
  assert.equal(formatRecoveryCode('AB0D1134EFGH5678'), 'AB0D-1134-EFGH-5678');
  for (const bad of ['', 'trop court', 'ABCD1234EFGH567', 'ABCD1234EFGH56789', 'ABCD1234EFGH567U', 'ABCD1234EFGH567*', null, undefined, 12, 'A'.repeat(65), 'AB0D-1134-EFGH-5678-9']) assert.equal(normalizeRecoveryCode(bad).ok, false, String(bad));
});

console.log('(b) Inscription : le code de secours est remis UNE fois');
await test('inscription directe : un code « XXXX-XXXX-XXXX-XXXX » est rendu ; il est créé après une connexion PAR MOT DE PASSE ; la session de preuve est fermée', async () => {
  boot(); reset();
  const r = await account.signUp('Alice', PW);
  quiet();
  assert.match(r.recoveryCode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.equal(srv.recoveryCodes.get(user('Alice').id), raw(r.recoveryCode), 'c\'est bien le code que le serveur a enregistré');
  assert.ok(callsTo('/auth/v1/token').length >= 1, 'connexion neuve par mot de passe (le jeton du signup ne porte pas la preuve)');
  assert.ok(srv.logouts.some((l) => l.scope === 'local'), 'la session de preuve est fermée');
});
await test('le code n\'est écrit NULLE PART : ni stockage de l\'appareil (local ou de session), ni journal, ni état du compte', async () => {
  const r = await (async () => { boot(); reset(); const x = await account.signUp('Bea', PW); quiet(); return x; })();
  for (const form of [r.recoveryCode, raw(r.recoveryCode)]) {
    assert.ok(!deviceDump().includes(form), 'stockage de l\'appareil');
    assert.ok(!logged.join('\n').includes(form), 'journal');
    assert.ok(!JSON.stringify(account.state).includes(form), 'état du compte');
  }
  assert.ok(!deviceDump().includes(PW), 'le mot de passe non plus');
});
await test('inscription avec CONVERSION de l\'invité (même identifiant) : le code accompagne aussi ce chemin', async () => {
  boot(); reset({ convertSupport: true });
  await online.ensureSession();                       // l'invité a une identité en ligne
  const r = await account.signUp('Cyril', PW);
  quiet();
  assert.equal(r.guestIdentity, 'converted');
  assert.match(r.recoveryCode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.equal(srv.recoveryCodes.get(user('Cyril').id), raw(r.recoveryCode));
});
await test('serveur SANS l\'étape SQL 21 : le compte est créé quand même, sans code (recoveryCode: null), aucune erreur ; l\'écran du compte ne propose rien', async () => {
  boot(); reset({ recovery: false });
  const r = await account.signUp('Dora', PW);
  quiet();
  assert.equal(r.kind, 'account');
  assert.equal(r.recoveryCode, null);
  assert.deepEqual(await account.recoveryStatus(), { state: 'unavailable' });
  await assert.rejects(account.createRecoveryCode(PW), (e) => e.code === 'no-sql-step' && /étape SQL 21/.test(e.message));
});

console.log('(d) Comptes existants');
await test('recoveryStatus : « none » pour un compte sans code (proposer d\'en créer un), « active » après création, « unavailable » pour un invité', async () => {
  boot(); reset({ recovery: false });
  await account.signUp('Eli', PW); quiet();                      // un compte d'AVANT l'étape 21 : aucun code
  srv.recovery = true;
  assert.deepEqual(await account.recoveryStatus(), { state: 'none', usedAt: null });
  const code = await account.createRecoveryCode(PW);
  assert.match(code, /^[0-9A-HJKMNP-TV-Z-]{19}$/);
  const st = await account.recoveryStatus();
  assert.equal(st.state, 'active'); assert.ok(st.createdAt);
  boot(); reset();
  assert.deepEqual(await account.recoveryStatus(), { state: 'unavailable' }, 'invité : rien à proposer');
});
await test('hors ligne ou serveur en panne : recoveryStatus ne lève rien (l\'écran du compte reste utilisable, rien n\'est proposé)', async () => {
  boot(); reset();
  await account.signUp('Fred', PW); quiet();
  srv.offline = true;
  assert.deepEqual(await account.recoveryStatus(), { state: 'unavailable' });
  srv.offline = false;
});

console.log('(b) Régénérer le code');
await test('régénération : le mot de passe est redemandé ; faux mot de passe = refus sans rien créer ; le NOUVEAU code remplace l\'ancien (l\'ancien ne sert plus)', async () => {
  boot(); reset();
  const first = (await account.signUp('Gaby', PW)).recoveryCode; quiet();
  const id = user('Gaby').id;
  await assert.rejects(account.createRecoveryCode('mauvais-mdp-12'), (e) => e.code === 'bad-credentials' && e.message === 'Mot de passe incorrect.');
  assert.equal(srv.recoveryCodes.get(id), raw(first), 'rien n\'a changé');
  await assert.rejects(account.createRecoveryCode(''), (e) => e.code === 'invalid');
  const second = await account.createRecoveryCode(PW);
  assert.notEqual(second, first);
  assert.equal(srv.recoveryCodes.get(id), raw(second));
  boot();                                              // « J'ai perdu mon mot de passe » avec l'ANCIEN code : refusé
  await assert.rejects(account.recoverAccount('Gaby', first, PW2), (e) => /Pseudo ou code de secours incorrect/.test(e.message));
});
await test('sans connexion récente par mot de passe, la base refuse : une session volée ne crée pas de code (le serveur le fait respecter ; le client ne triche pas avec le jeton d\'inscription)', async () => {
  boot(); reset();
  await account.signUp('Hana', PW); quiet();
  // Appel direct avec le jeton de la session COURANTE (pas issu d'un mot de passe) : refusé par le serveur.
  await assert.rejects(online.rest('/rest/v1/rpc/recovery_code_new', { method: 'POST', body: {} }), (e) => /Mot de passe à confirmer/.test(e.message));
});

console.log('(a) Changer son mot de passe');
await test('changement : mot de passe actuel redemandé ; mauvais actuel, nouveau trop faible ou identique : refusés (les deux premiers sans toucher au serveur)', async () => {
  boot(); reset();
  await account.signUp('Iris', PW); quiet();
  const u = user('Iris');
  sent.length = 0;
  await assert.rejects(account.changePassword(PW, 'court'), (e) => e.code === 'invalid');
  await assert.rejects(account.changePassword(PW, PW), (e) => /différent de l’actuel/.test(e.message));
  await assert.rejects(account.changePassword(PW, 'iris'), (e) => e.code === 'invalid');
  assert.equal(sent.length, 0, 'refus local : aucun appel réseau');
  await assert.rejects(account.changePassword('pas-le-bon-mdp', PW2), (e) => e.code === 'bad-credentials' && e.message === 'Mot de passe actuel incorrect.');
  assert.equal(u.pw, PW, 'le mot de passe n\'a pas changé');
  assert.equal(callsTo('/auth/v1/user').filter((c) => c.body.includes('password')).length, 0, 'aucune écriture de mot de passe');
});
await test('changement réussi : nouveau mot de passe effectif (l\'ancien ne connecte plus), appareil courant toujours connecté, autres sessions révoquées, session de preuve fermée', async () => {
  boot(); reset();
  await account.signUp('Jade', PW); quiet();
  const u = user('Jade');
  // Un autre appareil connecté au même compte.
  const other = (await realFetch(`${CONFIG.supabase.url}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email: 'jade@accounts.copytrack.invalid', password: PW }) }).then((r) => r.json()));
  assert.ok(srv.tokens.has(other.access_token));
  await account.changePassword(PW, PW2);
  assert.equal(u.pw, PW2);
  assert.ok(srv.logouts.some((l) => l.scope === 'others'), 'les autres appareils sont déconnectés');
  assert.ok(!srv.tokens.has(other.access_token), 'la session de l\'autre appareil est révoquée');
  assert.ok(srv.tokens.has(online.session.access_token), 'cet appareil reste connecté');
  assert.ok(srv.logouts.some((l) => l.scope === 'local'), 'la session de preuve est fermée');
  await assert.rejects(realFetch(`${CONFIG.supabase.url}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email: 'jade@accounts.copytrack.invalid', password: PW }) }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error_code); }), /invalid_credentials/);
  boot();
  assert.equal((await account.signIn('Jade', PW2)).kind, 'account'); quiet();
  assert.ok(!deviceDump().includes(PW2), 'le nouveau mot de passe n\'est stocké nulle part');
});
await test('changement sans compte (invité) : refusé', async () => {
  boot(); reset();
  await assert.rejects(account.changePassword(PW, PW2), (e) => e.code === 'invalid');
});

console.log('(c) J\'ai perdu mon mot de passe');
await test('récupération : bon code → le mot de passe change, on est CONNECTÉ, un NOUVEAU code est remis (l\'ancien est consommé) ; l\'ancien mot de passe ne marche plus', async () => {
  boot(); reset();
  const first = (await account.signUp('Kim', PW)).recoveryCode; quiet();
  const u = user('Kim');
  boot();                                              // l'appareil a tout oublié : il n'y a pas de session
  sent.length = 0;
  const r = await account.recoverAccount('kim', first.toLowerCase().replace(/-/g, ' '), PW2);
  quiet();
  assert.equal(r.kind, 'account'); assert.equal(r.recovered, true);
  assert.equal(account.isAccount, true);
  assert.equal(u.pw, PW2);
  assert.notEqual(r.recoveryCode, first); assert.match(r.recoveryCode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.equal(srv.recoveryCodes.get(u.id), raw(r.recoveryCode), 'le nouveau code est celui du serveur');
  assert.ok(!sent.some((c) => c.body.includes(raw(first)) && c.path !== '/functions/v1/account-recovery'), 'le code ne part que vers la fonction de récupération');
  assert.ok(!sent.some((c) => c.path !== '/auth/v1/token' && c.path !== '/auth/v1/user' && c.path !== '/functions/v1/account-recovery' && c.body.includes(PW2)), 'le mot de passe ne part que vers la fonction et Auth');
});
await test('la fonction est appelée SANS session, avec la clé publique du jeu (jamais un jeton d\'utilisateur), et le code envoyé est sa forme canonique', async () => {
  boot(); reset();
  const code = (await account.signUp('Lea', PW)).recoveryCode; quiet();
  boot(); sent.length = 0;
  await account.recoverAccount('Lea', code, PW2); quiet();
  const [c] = callsTo('/functions/v1/account-recovery');
  assert.equal(c.auth, 'Bearer ' + CONFIG.supabase.key);
  assert.deepEqual(JSON.parse(c.body), { username: 'Lea', code: raw(code), password: PW2 });
});
await test('code consommé : le même code une SECONDE fois est refusé', async () => {
  boot(); reset();
  const code = (await account.signUp('Max', PW)).recoveryCode; quiet();
  boot(); await account.recoverAccount('Max', code, PW2); quiet();
  boot();
  await assert.rejects(account.recoverAccount('Max', code, PW3), (e) => /Pseudo ou code de secours incorrect/.test(e.message));
  assert.equal(user('Max').pw, PW2);
});
await test('pseudo inconnu et mauvais code : le MÊME message (rien ne dit si le pseudo existe)', async () => {
  boot(); reset();
  const code = (await account.signUp('Nina', PW)).recoveryCode; quiet();
  boot();
  const bad = await account.recoverAccount('Nina', 'AAAA0000BBBB1111', PW2).catch((e) => e);
  const unknown = await account.recoverAccount('Fantome_9', code, PW2).catch((e) => e);
  assert.ok(bad instanceof Error && unknown instanceof Error);
  assert.equal(bad.message, unknown.message);
  assert.equal(bad.code, unknown.code);
  assert.equal(user('Nina').pw, PW, 'rien n\'a changé');
});
await test('formulaire mal rempli : refusé AVANT tout appel réseau (pseudo, forme du code, mot de passe) avec un message qui dit quoi corriger', async () => {
  boot(); reset(); sent.length = 0;
  await assert.rejects(account.recoverAccount('a', 'AAAA0000BBBB1111', PW2), (e) => e.code === 'invalid');
  await assert.rejects(account.recoverAccount('Nina', 'pas un code', PW2), (e) => e.code === 'invalid' && /XXXX-XXXX-XXXX-XXXX/.test(e.message));
  await assert.rejects(account.recoverAccount('Nina', 'AAAA0000BBBB1111', 'court'), (e) => e.code === 'invalid' && /8 caractères/.test(e.message));
  await assert.rejects(account.recoverAccount('Nina', 'AAAA0000BBBB1111', 'nina'), (e) => e.code === 'invalid');
  assert.equal(sent.length, 0);
});
await test('fonction non déployée (404) ou refusée par la passerelle (401/403) : messages clairs, jamais « submit-score introuvable »', async () => {
  boot(); reset({ recovery: false });
  await assert.rejects(account.recoverAccount('Nina', 'AAAA0000BBBB1111', PW2), (e) => e.code === 'no-function' && /account-recovery/.test(e.message) && !/submit-score/.test(e.message));
  reset();
  const keep = srv.recovery;
  globalThis.fetch = async (url, init) => (String(url).includes('/functions/v1/account-recovery') ? new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 }) : realFetch(url, init));
  try { await assert.rejects(account.recoverAccount('Nina', 'AAAA0000BBBB1111', PW2), (e) => e.code === 'denied' && /account-recovery/.test(e.message)); } finally { globalThis.fetch = async (url, init = {}) => { sent.push({ path: new URL(url).pathname, auth: (init.headers || {}).Authorization || '', body: init.body || '' }); return realFetch(url, init); }; }
  assert.ok(keep);
});
await test('trop d\'essais : le délai annoncé par le serveur (Retry-After) est dit au joueur', async () => {
  boot(); reset();
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('/functions/v1/account-recovery')
    ? new Response(JSON.stringify({ error: 'Trop de demandes : réessaie dans 42 s.', code: 'rate' }), { status: 429, headers: { 'Retry-After': '42' } }) : orig(url, init));
  try { await assert.rejects(account.recoverAccount('Nina', 'AAAA0000BBBB1111', PW2), (e) => e.code === 'rate' && e.retryAfter === 42 && /42/.test(e.message)); } finally { globalThis.fetch = orig; }
});

console.log('Aucun secret dans les journaux');
test('aucun code, mot de passe ni jeton n\'a été écrit dans la console pendant tous ces scénarios', () => {
  const all = logged.join('\n');
  for (const secret of [PW, PW2, PW3]) assert.ok(!all.includes(secret), secret);
  for (const t of srv.tokens.keys()) assert.ok(!all.includes(t), 'jeton ' + t);
  for (const c of srv.recoveryCodes.values()) assert.ok(!all.includes(c), 'code ' + c);
});

finish('Le changement de mot de passe, le code de secours et la récupération de compte fonctionnent côté client.');
