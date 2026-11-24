// Fonction serveur « account-recovery » : le gestionnaire (supabase/functions/account-recovery/handler.js) avec un Supabase simulé : node tools/test-recovery-handler.mjs   (npm test)
// Chaque ligne du modèle de menaces (supabase/COMPTES.md, « Changer et récupérer son mot de passe ») y est vérifiée :
//   M1 énumération  : pseudo inconnu, compte sans code, mauvais code, pseudo verrouillé, code réservé, pseudo ou code mal formés → réponse INDISCERNABLE (statut, en-têtes, corps, durée) ;
//   M2 force brute  : verrouillage après N échecs (même le bon code est alors refusé), frein par adresse, plafond de la base ;
//   M3 rejeu        : code à usage unique (second usage refusé), deux requêtes simultanées avec le bon code (une seule passe), sessions révoquées ;
//   M4 fuite        : ni code, ni mot de passe, ni pseudo, ni adresse dans les journaux ; le code n'atteint jamais la base (seulement son empreinte) ; le mot de passe ne va qu'à Auth ;
//   M7 abus         : taille de la requête (413, déclarée ou non), cadence (429), base indisponible (503, jamais « ouvert »).
// Le faux serveur reproduit la SÉMANTIQUE de supabase/etape21-recuperation.sql (réservation à jeton, verrou à 5 échecs…) ; la VRAIE base est éprouvée par tools/test-etape21-sql.sh.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const { ReadableStream } = globalThis;
import { test, finish } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { readStamp } from './build-stamp.mjs';
import { createRecoveryHandler, MAX_BODY_BYTES, MIN_DURATION_MS, FAIL_MESSAGE } from '../supabase/functions/account-recovery/handler.js';

const sha = (t) => createHash('sha256').update(t).digest('hex');
const ALICE = { id: '11111111-2222-3333-4444-555555555555', name: 'Alice', code: 'ABCD1234EFGH5678' };
const BOB = { id: '66666666-7777-8888-9999-000000000000', name: 'Bob_2', code: 'ZZZZ9999YYYY8888' };
const PW = 'nouveau-mot-de-passe-9';
const URL_ = 'https://x.supabase.co', KEY = 'cle-de-service-secrete';

// ---- Temps virtuel : now() avance par sleep() et par la latence simulée de chaque appel (la base « travaille » 120 ms, Auth 200 ms…) ------------------------------------
function clock() { let t = 1_000_000; return { now: () => t, sleep: async (ms) => { t += ms; }, tick: (ms) => { t += ms; } }; }

// ---- Faux Supabase : Auth (API d'administration) + recovery_begin / finish / abort, avec la logique de l'étape 21 -------------------------------------------------------
function fakeSupabase(clk, { users = [ALICE, BOB], noCodeFor = [], rpcStatus = 200, authPut = 'ok', rateOverride = null, finishFails = false, finishFailsOnce = false, finishSessions = 2 } = {}) {
  const st = { calls: [], rpcArgs: [], authBodies: [], passwords: new Map(), codes: new Map(), pending: new Map(), fails: new Map(), locks: new Map(), ipFails: new Map(), sessionsRevoked: [], logins: 0 };
  for (const u of users) if (!noCodeFor.includes(u.id)) st.codes.set(u.id, sha(u.code));
  const byName = (n) => users.find((u) => u.name.toLowerCase() === n.toLowerCase());
  const ok = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const U_MAX = 5;
  const fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : undefined;
    st.calls.push({ url: u, method: init.method ?? 'GET', headers: init.headers, body });
    if (u.includes('/rest/v1/rpc/recovery_begin')) {
      st.rpcArgs.push({ fn: 'begin', ...body });
      clk.tick(120);                                        // un bcrypt, dans TOUS les cas
      if (rpcStatus !== 200) return ok({ code: 'PGRST202' }, rpcStatus);
      if (rateOverride) return ok(rateOverride);
      const lname = body.uname.trim().toLowerCase(), user = byName(lname);
      if ((st.ipFails.get(body.ip_key) || 0) >= 20) return ok({ status: 'rate', retry: 3500 });
      const locked = (st.locks.get(lname) || 0) > clk.now();
      const reserved = user && st.pending.has(user.id) && st.pending.get(user.id).until > clk.now();
      const h = user && st.codes.get(user.id);
      if (!locked && !reserved && h && h === body.code_sha) {
        const nonce = '99999999-aaaa-bbbb-cccc-' + String(st.pending.size + 1).padStart(12, '0');
        st.pending.set(user.id, { nonce, until: clk.now() + 120_000 });
        st.fails.set(lname, 0);
        return ok({ status: 'ok', user_id: user.id, nonce });
      }
      const f = (st.fails.get(lname) || 0) + 1;
      if (f >= U_MAX) { st.fails.set(lname, 0); st.locks.set(lname, clk.now() + 15 * 60_000); } else st.fails.set(lname, f);
      st.ipFails.set(body.ip_key, (st.ipFails.get(body.ip_key) || 0) + 1);
      return ok({ status: 'fail' });
    }
    if (u.includes('/rest/v1/rpc/recovery_finish')) {
      st.rpcArgs.push({ fn: 'finish', ...body });
      if (finishFails) return ok({ message: 'boom' }, 500);
      if (finishFailsOnce && !st.finishTried) { st.finishTried = true; return ok({ message: 'boom' }, 500); }
      const p = st.pending.get(body.p_uid);
      if (!p || p.nonce !== body.p_nonce) return ok({ consumed: false });
      st.codes.delete(body.p_uid); st.pending.delete(body.p_uid); st.sessionsRevoked.push(body.p_uid);
      return ok({ consumed: true, sessions: finishSessions, tokens: 0 });
    }
    if (u.includes('/rest/v1/rpc/recovery_abort')) {
      st.rpcArgs.push({ fn: 'abort', ...body });
      const p = st.pending.get(body.p_uid);
      if (p && p.nonce === body.p_nonce) { st.pending.delete(body.p_uid); return ok(true); }
      return ok(false);
    }
    if (u.includes('/auth/v1/admin/users/')) {
      clk.tick(200);
      st.authBodies.push(body);
      if (authPut === 'weak') return ok({ error_code: 'weak_password', msg: 'Password is known to be weak' }, 422);
      if (authPut === 'down') return ok({ msg: 'boom' }, 500);
      if (authPut === 'throw') throw new Error('réseau coupé');
      const id = u.split('/auth/v1/admin/users/')[1];
      st.passwords.set(id, body.password);
      return ok({ id });
    }
    return ok({}, 404);
  };
  return { fetch, st };
}
const make = (opts = {}, sbOpts = {}) => {
  const clk = clock(), sb = fakeSupabase(clk, sbOpts), logs = [];
  const h = createRecoveryHandler({ supabaseUrl: URL_, serviceKey: KEY, fetch: sb.fetch, now: clk.now, sleep: clk.sleep, log: (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')), ...opts });
  return { h, clk, sb, logs };
};
const post = (body, { ip = '203.0.113.9', headers = {} } = {}) =>
  new Request('https://fn.example/account-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ask = (m, body, o) => m.h(post(body, o));
// Empreinte complète d'une réponse : statut, TOUS les en-têtes, corps, durée virtuelle.
async function shape(m, body, o) {
  const t0 = m.clk.now(), r = await ask(m, body, o), t = m.clk.now() - t0;
  return JSON.stringify({ status: r.status, headers: [...r.headers.entries()].sort(), body: await r.text(), ms: t });
}
const attempt = (u, over = {}) => ({ username: u.name, code: u.code, password: PW, ...over });

console.log('Récupération réussie');
test('GET : état du service, rien de secret ni du compte', async () => {
  const m = make();
  const r = await m.h(new Request('https://fn.example/account-recovery', { method: 'GET' }));
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(j).sort(), ['actions', 'build', 'limits', 'ok', 'service']);
  assert.equal(j.service, 'account-recovery');
  assert.ok(!JSON.stringify(j).includes(KEY));
});

test('bon code : nouveau mot de passe posé par Auth (API d\'administration), code consommé, sessions révoquées', async () => {
  const m = make();
  const r = await ask(m, attempt(ALICE));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(m.sb.st.passwords.get(ALICE.id), PW, 'Auth a reçu le nouveau mot de passe, pour CE compte');
  const put = m.sb.st.calls.find((c) => c.url.includes('/auth/v1/admin/users/'));
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, `${URL_}/auth/v1/admin/users/${ALICE.id}`);
  assert.equal(put.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(Object.keys(put.body), ['password'], 'seul le mot de passe est modifié');
  assert.ok(!m.sb.st.codes.has(ALICE.id), 'usage unique : le haché du code est effacé');
  assert.deepEqual(m.sb.st.sessionsRevoked, [ALICE.id]);
  assert.equal(m.sb.st.passwords.has(BOB.id), false, 'l\'autre compte n\'est pas touché');
});

test('le code se tape comme on peut : minuscules, espaces, tirets, O pour 0, I/L pour 1', async () => {
  const m = make({}, { users: [{ id: ALICE.id, name: 'Alice', code: 'AB0D1134EFGH5678' }, BOB] });      // contient un 0 et deux 1
  const r = await ask(m, attempt(ALICE, { code: ' abod-il34 efgh-56 78 ' }));                          // saisi : o pour 0, i et l pour 1, minuscules, espaces, tirets
  assert.equal(r.status, 200, 'o→0, i→1, l→1, tirets et espaces ignorés');
  assert.equal(m.sb.st.rpcArgs.find((a) => a.fn === 'begin').code_sha, sha('AB0D1134EFGH5678'), 'la base reçoit l\'empreinte de la forme canonique');
});

console.log('M3 : usage unique, concurrence');
test('M3 : le même code une SECONDE fois est refusé (réponse d\'échec standard)', async () => {
  const m = make();
  assert.equal((await ask(m, attempt(ALICE))).status, 200);
  const r2 = await ask(m, attempt(ALICE, { password: 'un-autre-mdp-4567' }));
  assert.equal(r2.status, 400);
  assert.equal((await r2.json()).error, FAIL_MESSAGE);
  assert.equal(m.sb.st.passwords.get(ALICE.id), PW, 'le mot de passe n\'a pas été changé par le rejeu');
});

test('M3 : deux requêtes SIMULTANÉES avec le bon code : une seule pose le mot de passe', async () => {
  const m = make();
  const [a, b] = await Promise.all([ask(m, attempt(ALICE, { password: 'premier-mdp-1234' })), ask(m, attempt(ALICE, { password: 'second-mdp-12345' }))]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  assert.equal(m.sb.st.calls.filter((c) => c.url.includes('/auth/v1/admin/users/')).length, 1, 'un seul appel à Auth');
});

test('Auth refuse le mot de passe (panne) : réservation levée, code TOUJOURS valable, réponse 503', async () => {
  const m = make({}, { authPut: 'down' });
  const r = await ask(m, attempt(ALICE));
  assert.equal(r.status, 503);
  assert.ok(m.sb.st.codes.has(ALICE.id), 'le code n\'est pas consommé');
  assert.ok(m.sb.st.rpcArgs.some((a) => a.fn === 'abort'), 'recovery_abort appelée');
  assert.ok(!m.sb.st.rpcArgs.some((a) => a.fn === 'finish'));
  assert.equal(m.sb.st.pending.size, 0, 'plus de réservation');
});

test('Auth injoignable (exception réseau) : même traitement, jamais d\'erreur interne', async () => {
  const m = make({}, { authPut: 'throw' });
  const r = await ask(m, attempt(ALICE));
  assert.equal(r.status, 503);
  assert.ok(m.sb.st.codes.has(ALICE.id));
});

test('Auth refuse un mot de passe trop faible (422) : message dédié, code conservé', async () => {
  const m = make({}, { authPut: 'weak' });
  const r = await ask(m, attempt(ALICE));
  const j = await r.json();
  assert.equal(r.status, 400);
  assert.equal(j.code, 'weak-password');
  assert.ok(m.sb.st.codes.has(ALICE.id));
});

test('mot de passe refusé par les règles du jeu : AUCUN essai de code (le code n\'est pas consommé ni compté), même réponse pseudo connu ou non', async () => {
  const m = make();
  const a = await shape(m, attempt(ALICE, { password: 'court' }));
  const b = await shape(m, { username: 'Inconnu_9', code: ALICE.code, password: 'court' });
  assert.equal(JSON.parse(a).status, 400);
  assert.equal(JSON.parse(a).body, JSON.parse(b).body, 'indépendant de l\'existence du pseudo');
  assert.equal(m.sb.st.rpcArgs.length, 0, 'la base n\'a pas été interrogée');
  for (const bad of ['alice', 'x'.repeat(73)]) assert.equal((await ask(m, attempt(ALICE, { password: bad }))).status, 400);
  assert.equal((await ask(m, attempt(ALICE))).status, 200, 'et le bon code marche toujours ensuite');
});

console.log('M1 : indiscernable');
test('M1 : pseudo inconnu, compte sans code, mauvais code, pseudo verrouillé, code réservé, pseudo ou code mal formés → réponse STRICTEMENT identique (statut, en-têtes, corps, durée)', async () => {
  const CLEO = { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'Cleo', code: 'CCCC3333DDDD4444' };
  const base = { users: [ALICE, BOB, CLEO], noCodeFor: [CLEO.id] };
  const shapes = {};
  const run = async (label, prep, body, opts) => { const m = make({}, base); if (prep) await prep(m); shapes[label] = await shape(m, body, opts); return m; };
  await run('inconnu', null, { username: 'Fantome_1', code: ALICE.code, password: PW });
  await run('mauvais code', null, attempt(ALICE, { code: 'AAAA0000BBBB1111' }));
  await run('sans code', null, { username: CLEO.name, code: CLEO.code, password: PW });
  await run('verrouillé (bon code)', async (m) => { for (let i = 0; i < 5; i++) await ask(m, attempt(BOB, { code: 'AAAA0000BBBB1111' }), { ip: '198.51.100.' + i }); }, attempt(BOB), { ip: '198.51.100.77' });
  await run('réservé (bon code, une pose en cours)', async (m) => { m.sb.st.pending.set(ALICE.id, { nonce: '99999999-aaaa-bbbb-cccc-000000000099', until: m.clk.now() + 100_000 }); }, attempt(ALICE));
  await run('pseudo mal formé', null, { username: 'a', code: ALICE.code, password: PW });
  await run('pseudo avec caractères interdits', null, { username: 'al ice!', code: ALICE.code, password: PW });
  await run('code mal formé', null, attempt(ALICE, { code: 'trop court' }));
  await run('code absent de l\'alphabet', null, attempt(ALICE, { code: 'UUUUUUUUUUUUUUUU' }));
  const all = Object.entries(shapes);
  const ref = all[0][1];
  for (const [label, s] of all) assert.equal(s, ref, `« ${label} » se distingue de « inconnu » :\n${s}\n${ref}`);
  const j = JSON.parse(ref);
  assert.equal(j.status, 400);
  assert.equal(j.ms, MIN_DURATION_MS, 'durée plancher : toutes les voies (avec ou sans appel à la base) prennent le même temps');
  assert.equal(JSON.parse(j.body).error, FAIL_MESSAGE);
});

test('M1 : la durée plancher couvre aussi une voie plus lente que la normale (base lente)', async () => {
  const m = make({ minDurationMs: 1500 });
  const slow = m.sb.fetch;
  const t0 = m.clk.now();
  await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB1111' }));
  assert.equal(m.clk.now() - t0, 1500);
  assert.ok(slow);
});

test('M1 : la réponse d\'échec ne contient ni le pseudo, ni le code, ni le mot de passe, ni un identifiant', async () => {
  const m = make();
  const r = await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB1111' }));
  const txt = JSON.stringify([...r.headers.entries()]) + (await r.text());
  for (const secret of [ALICE.name, ALICE.id, 'AAAA0000BBBB1111', PW, KEY]) assert.ok(!txt.includes(secret), `la réponse contient « ${secret} »`);
});

console.log('M2 : force brute');
test('M2 : après 5 échecs sur un pseudo, le BON code est refusé aussi (verrouillé) — réponse identique à un échec', async () => {
  const m = make();
  for (let i = 0; i < 5; i++) { const r = await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB111' + i }), { ip: '198.51.100.' + i }); assert.equal(r.status, 400); }
  const good = await ask(m, attempt(ALICE), { ip: '198.51.100.50' });
  assert.equal(good.status, 400, 'verrouillé');
  assert.ok(!m.sb.st.calls.some((c) => c.url.includes('/auth/v1/admin/users/')), 'Auth n\'a jamais été appelée');
  m.clk.tick(16 * 60_000);
  assert.equal((await ask(m, attempt(ALICE), { ip: '198.51.100.51' })).status, 200, 'le verrou est temporaire (15 min)');
});

test('M2 : un rechargement de page ou un autre onglet ne remet rien à zéro : le compteur est en base (même pseudo, autre instance de la fonction)', async () => {
  const clk = clock(), sb = fakeSupabase(clk);
  const mk = () => createRecoveryHandler({ supabaseUrl: URL_, serviceKey: KEY, fetch: sb.fetch, now: clk.now, sleep: clk.sleep, log: () => {} });
  for (let i = 0; i < 5; i++) await mk()(post(attempt(ALICE, { code: 'AAAA0000BBBB111' + i }), { ip: '198.51.100.' + i }));      // 5 « instances » fraîches
  const r = await mk()(post(attempt(ALICE), { ip: '198.51.100.60' }));
  assert.equal(r.status, 400);
});

test('M2 : l\'adresse est verrouillée par la base (« rate » : 429 avec Retry-After plafonné), sans rien dire du pseudo', async () => {
  const m = make({}, { rateOverride: { status: 'rate', retry: 99999 } });
  const r = await ask(m, attempt(ALICE));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('Retry-After'), '3600', 'plafonné à 1 h');
  const r2 = await ask(m, { username: 'Fantome_1', code: ALICE.code, password: PW });
  assert.equal((await r2.json()).error, (await (await ask(m, attempt(ALICE))).json()).error, 'même message pour un pseudo inconnu et pour un connu');
});

test('M7 : frein en mémoire par adresse : la 11e requête de la minute est refusée SANS toucher la base ; une autre adresse passe ; la minute suivante aussi', async () => {
  const m = make({ minDurationMs: 0 });
  for (let i = 0; i < 10; i++) assert.equal((await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB1111' }))).status, 400);
  const calls = m.sb.st.calls.length;
  const r = await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB1111' }));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('Retry-After')) >= 1);
  assert.equal(m.sb.st.calls.length, calls, 'aucun appel supplémentaire à la base');
  assert.notEqual((await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB1111' }), { ip: '198.51.100.200' })).status, 429);
  m.clk.tick(61_000);
  assert.notEqual((await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB1111' }))).status, 429);
});

console.log('M4 : fuites');
test('M4 : le CODE n\'atteint jamais la base (seulement son empreinte SHA-256) et le MOT DE PASSE ne va qu\'à Auth', async () => {
  const m = make();
  await ask(m, attempt(ALICE));
  const dbBodies = JSON.stringify(m.sb.st.rpcArgs);
  assert.ok(!dbBodies.includes(ALICE.code), 'le code en clair n\'est dans aucun paramètre SQL');
  assert.ok(!dbBodies.includes(PW), 'le mot de passe n\'est dans aucun paramètre SQL');
  const begin = m.sb.st.rpcArgs.find((a) => a.fn === 'begin');
  assert.equal(begin.code_sha, sha(ALICE.code));
  assert.match(begin.ip_key, /^[0-9a-f]{64}$/);
  assert.ok(!dbBodies.includes('203.0.113.9'), 'l\'adresse n\'est transmise que sous forme d\'empreinte');
  const authTargets = m.sb.st.calls.filter((c) => c.body && JSON.stringify(c.body).includes(PW)).map((c) => c.url);
  assert.deepEqual(authTargets, [`${URL_}/auth/v1/admin/users/${ALICE.id}`]);
});

test('M4 : les journaux ne contiennent ni code, ni mot de passe, ni pseudo, ni adresse, ni clé — dans tous les scénarios, y compris les pannes', async () => {
  const lines = [];
  const scenarios = [
    [{}, attempt(ALICE)], [{}, attempt(ALICE, { code: 'AAAA0000BBBB1111' })], [{}, attempt(ALICE, { password: 'court' })],
    [{ authPut: 'down' }, attempt(ALICE)], [{ authPut: 'weak' }, attempt(ALICE)], [{ authPut: 'throw' }, attempt(ALICE)], [{ rpcStatus: 404 }, attempt(ALICE)], [{ finishFails: true }, attempt(ALICE)],
    [{ finishSessions: -1 }, attempt(ALICE)],
  ];
  for (const [sbOpts, body] of scenarios) { const m = make({}, sbOpts); await ask(m, body); lines.push(...m.logs); }
  const m2 = make({ supabaseUrl: '' }); await ask(m2, attempt(ALICE)); lines.push(...m2.logs);
  await ask(make(), '{pas du json');
  const all = lines.join('\n');
  assert.ok(lines.length >= 6, 'les pannes sont bien journalisées (sinon le test ne prouve rien) : ' + lines.length);
  for (const secret of [ALICE.code, 'AAAA0000BBBB1111', PW, 'court', ALICE.name, ALICE.id, '203.0.113.9', KEY, sha(ALICE.code)]) assert.ok(!all.includes(secret), `un journal contient « ${secret} » :\n${all}`);
});

test('M4 : une panne de recovery_finish est journalisée comme ALERTE, le mot de passe reste le nouveau (le joueur peut se connecter) — réponse 200', async () => {
  const m = make({}, { finishFails: true });
  const r = await ask(m, attempt(ALICE));
  assert.equal(r.status, 200);
  assert.ok(m.logs.some((l) => /ALERTE/.test(l)));
  assert.equal(m.sb.st.passwords.get(ALICE.id), PW);
});

test('M3 : un échec PASSAGER de recovery_finish est réessayé : le code est bien consommé (il ne redevient pas valable), aucune alerte', async () => {
  const m = make({}, { finishFailsOnce: true });
  assert.equal((await ask(m, attempt(ALICE))).status, 200);
  assert.ok(!m.sb.st.codes.has(ALICE.id), 'code consommé malgré le premier échec');
  assert.equal(m.sb.st.rpcArgs.filter((a) => a.fn === 'finish').length, 2);
  assert.ok(!m.logs.some((l) => /ALERTE/.test(l)));
  assert.equal((await ask(m, attempt(ALICE, { password: 'un-autre-mdp-4567' }))).status, 400, 'et le rejeu est refusé');
});
test('M4 : sessions non révoquées côté base (-1) : alerte journalisée', async () => {
  const m = make({}, { finishSessions: -1 });
  assert.equal((await ask(m, attempt(ALICE))).status, 200);
  assert.ok(m.logs.some((l) => /sessions/.test(l) && /ALERTE/.test(l)));
});

console.log('M7 : abus');
test('M7 : requête trop grosse : 413 avant toute lecture, ou en cours de lecture (en-tête absent ou mensonger) — la base n\'est pas appelée', async () => {
  const m = make();
  const big = JSON.stringify({ username: 'Alice', code: ALICE.code, password: 'x'.repeat(MAX_BODY_BYTES) });
  const r1 = await m.h(new Request('https://fn.example/x', { method: 'POST', headers: { 'content-length': String(big.length), 'x-forwarded-for': '1.1.1.1' }, body: big }));
  assert.equal(r1.status, 413);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const r2 = await m.h(new Request('https://fn.example/x', { method: 'POST', headers: { 'x-forwarded-for': '1.1.1.2' }, body: stream, duplex: 'half' }));
  assert.equal(r2.status, 413);
  assert.equal(m.sb.st.calls.length, 0);
});

test('M7 : corps illisible, tableau, champs manquants ou trop longs : 400 « Requête invalide » (pas de 500), base non appelée', async () => {
  const m = make();
  for (const b of ['{pas du json', '[]', '"texte"', 'null', '{}', JSON.stringify({ username: 5, code: 'x', password: 'y' }), JSON.stringify({ username: 'a'.repeat(65), code: 'x', password: 'yyyyyyyyyyyy' }), JSON.stringify({ username: 'Alice', code: 'c'.repeat(65), password: 'yyyyyyyyyyyy' }), JSON.stringify({ username: 'Alice', code: ALICE.code, password: 'y'.repeat(257) })]) {
    const r = await ask(m, b);
    assert.equal(r.status, 400, b.slice(0, 40));
    assert.equal((await r.json()).code, 'bad-request');
  }
  assert.equal(m.sb.st.calls.length, 0);
});

test('M7 : base indisponible ou étape SQL 21 absente (404/500/exception) : 503, JAMAIS « ouvert » (Auth n\'est pas appelée)', async () => {
  for (const status of [404, 500]) {
    const m = make({}, { rpcStatus: status });
    const r = await ask(m, attempt(ALICE));
    assert.equal(r.status, 503);
    assert.ok(r.headers.get('Retry-After'));
    assert.ok(!m.sb.st.calls.some((c) => c.url.includes('/auth/v1/')));
  }
  const m = make({ fetch: async () => { throw new Error('réseau'); } });
  assert.equal((await ask(m, attempt(ALICE))).status, 503);
});

test('M7 : réponse inattendue de la base (statut inconnu, identifiants malformés) : fermé par défaut', async () => {
  const mk = (resp) => make({ fetch: async (u) => (String(u).includes('recovery_begin') ? new Response(JSON.stringify(resp), { status: 200 }) : new Response('{}', { status: 200 })) });
  assert.equal((await ask(mk({ status: 'peut-être' }), attempt(ALICE))).status, 400);
  assert.equal((await ask(mk(null), attempt(ALICE))).status, 503);
  assert.equal((await ask(mk({ status: 'ok', user_id: '../../etc', nonce: 'x' }), attempt(ALICE))).status, 503, 'un identifiant qui n\'est pas un UUID n\'est jamais mis dans une URL');
});

test('configuration absente : 500 sans rien dire, jamais ouvert ; méthodes : OPTIONS ok, PUT/DELETE 405', async () => {
  const m = make({ supabaseUrl: '' });
  assert.equal((await ask(m, attempt(ALICE))).status, 500);
  const n = make();
  assert.equal((await n.h(new Request('https://fn.example/x', { method: 'OPTIONS' }))).status, 200);
  for (const method of ['PUT', 'DELETE', 'PATCH']) assert.equal((await n.h(new Request('https://fn.example/x', { method }))).status, 405);
});

test('toute réponse : Cache-Control no-store, CORS réglé par ALLOWED_ORIGIN', async () => {
  const m = make({ allowedOrigin: 'https://jeu.example' });
  for (const r of [await ask(m, attempt(ALICE)), await ask(m, attempt(ALICE, { code: 'AAAA0000BBBB1111' })), await ask(m, '{x')]) {
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://jeu.example');
  }
});

console.log('Le fichier GÉNÉRÉ (celui qu\'on déploie)');
test('account-recovery/index.ts : autonome (aucun import), empreinte valide ; chargé avec un Deno simulé, son GET annonce cette empreinte et un POST sans configuration est refusé (500, jamais ouvert)', async () => {
  const text = readFileSync(new URL('../supabase/functions/account-recovery/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /^\s*import\s/m, 'aucun import');
  const stamp = readStamp(text);
  assert.ok(stamp && stamp.valid, 'empreinte valide : sinon `npm run build:function` n\'a pas été relancé');
  let served = null;
  const keep = globalThis.Deno;
  globalThis.Deno = { serve: (fn) => { served = fn; }, env: { get: () => undefined, toObject: () => ({}) } };
  try { await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64')); } finally { globalThis.Deno = keep; }
  assert.equal(typeof served, 'function', 'la fonction se branche sur Deno.serve');
  const g = await (await served(new Request('https://fn.example/x', { method: 'GET' }))).json();
  assert.equal(g.service, 'account-recovery');
  assert.equal(g.build, stamp.stamp, 'le GET annonce l\'empreinte du fichier');
  assert.equal((await served(post(attempt(ALICE)))).status, 500);
});

finish('Tous les tests de la fonction account-recovery passent.');
