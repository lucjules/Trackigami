// Lectures en ligne (audit LOT-7) : node tools/test-lectures-en-ligne.mjs   (npm test)
//   TECH-021  le classement mondial marche AVEC ou SANS le droit de lecture de scores.ghost_veh (étape SQL 20) : un refus de colonne fait passer au niveau suivant,
//             une autre erreur (réseau, 429) ne déclenche aucune requête de repli ;
//   TECH-031  afficher classement et communauté ne crée AUCUN joueur anonyme (aucune requête /auth/v1/signup) tant qu'aucune action n'exige de session ;
//   TECH-080  (a) le nombre de temps passe par la même voie que le reste (erreurs lisibles) ; (b) un refus 429 garde le délai du serveur ; (e) la table des essais est bornée.
// Faux serveur REST de lecture (PostgREST) par-dessus le faux Supabase d'authentification (tools/fake-supabase.mjs) : il compte chaque requête, dit si elle portait une
// session, et refuse les colonnes que son « monde » n'accorde pas, avec les mêmes statuts que PostgREST (403 / 42501 : droit ; 400 / 42703 : colonne absente).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device, srv } from './fake-supabase.mjs';

device('A');
const { online, OnlineError, PUBLIC_RPC, waitText, parseRetryAfter } = await import('../js/online.js');
const community = await import('../js/online/community.js');
const { session } = await import('./fake-supabase.mjs');
const storage = await import('../js/storage.js');
const authFetch = globalThis.fetch;

// ---- Le monde du faux serveur de lecture ----
const world = { ghostVeh: false, title: true, hasGhost: true, status: 0, retryAfter: null, offline: false, total: 7, calls: [] };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const ROW = (full) => ({ time: 41.2, player: '0b9f3c2e-1111-4222-8333-444455556666', updated_at: '2026-11-20T10:00:00Z', players: { name: 'Ana', ...(full.title ? { title: 'Pro' } : {}) }, ...(full.hasGhost ? { has_ghost: true } : {}), ...(full.ghostVeh ? { ghost_veh: [[3, 1]] } : {}) });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), path = u.pathname, method = init.method || 'GET', h = init.headers || {};
  if (path.startsWith('/auth/v1/') || path === '/rest/v1/players' || path === '/functions/v1/submit-score') return authFetch(url, init);
  if (world.offline) throw new TypeError('Failed to fetch');
  world.calls.push({ method, path, select: u.searchParams.get('select'), authorization: h.Authorization || null, apikey: h.apikey || null });
  srv.calls.push({ method, path, body: null });
  if (world.status) return json(world.status, { message: 'Too many requests', code: 'over_request_rate_limit' }, world.retryAfter != null ? { 'Retry-After': String(world.retryAfter) } : {});
  if (path === '/rest/v1/scores') {
    const sel = u.searchParams.get('select') || '';
    if (sel.includes('ghost_veh') && !world.ghostVeh) return json(403, { code: '42501', message: 'permission denied for table scores' });
    if (sel.includes('title') && !world.title) return json(400, { code: '42703', message: 'column players_1.title does not exist' });
    if (sel.includes('has_ghost') && !world.hasGhost) return json(400, { code: '42703', message: 'column scores.has_ghost does not exist' });
    if (sel === 'player' || sel.startsWith('time') && !sel.includes(',')) return new Response('[]', { status: 206, headers: { 'content-range': `0-0/${world.total}`, 'content-type': 'application/json' } });
    return json(200, [ROW({ title: sel.includes('title'), hasGhost: sel.includes('has_ghost'), ghostVeh: sel.includes('ghost_veh') })]);
  }
  if (path === '/rest/v1/tracks') return json(200, [{ id: '11111111-2222-4333-8444-555555555555', name: 'Circuit', players: { name: 'Ana' } }]);
  if (path === '/rest/v1/track_likes') return json(200, h.Authorization ? [{ track_id: '11111111-2222-4333-8444-555555555555' }] : []);
  if (path === '/rest/v1/follows') return json(200, []);
  if (path.startsWith('/rest/v1/rpc/')) {
    const name = path.slice('/rest/v1/rpc/'.length);
    if (PUBLIC_RPC.includes(name)) return json(200, name === 'random_track' ? null : []);
    if (!h.Authorization) return json(401, { code: '42501', message: 'permission denied for function ' + name });      // (close_due_seasons, toggle_like… : réservées aux sessions)
    return json(200, name === 'toggle_like' ? true : 0);
  }
  return json(404, { message: 'inconnu ' + path });
};
const scoreCalls = () => world.calls.filter((c) => c.path === '/rest/v1/scores' && c.select && c.select.includes('players!'));
const reset = () => { world.calls.length = 0; srv.calls.length = 0; world.status = 0; world.retryAfter = null; world.offline = false; online._lbFlags = null; online._lbAt = 0; };
const signups = () => srv.calls.filter((c) => c.path === '/auth/v1/signup').length;

console.log('TECH-021 : classement mondial avec ou sans le droit de lecture de ghost_veh');
await test('sans le droit (état de la production avant l’étape 20) : la 2e requête réussit, avec boutons de fantôme et titres ; le niveau est retenu', async () => {
  reset(); world.ghostVeh = false;
  const a = await online.leaderboard('b-test-1', 39, 10);
  assert.equal(a.top[0].has_ghost, true); assert.equal(a.top[0].players.title, 'Pro'); assert.equal(a.top[0].ghost_veh, undefined);
  assert.equal(scoreCalls().length, 2, 'la requête complète est refusée, la suivante réussit');
  world.calls.length = 0;
  await online.leaderboard('b-test-1', 39, 10);
  assert.equal(scoreCalls().length, 1, 'le niveau qui a marché est retenu : plus de requête perdue');
});
await test('avec le droit (après l’étape 20) : une seule requête, véhicule compris', async () => {
  reset(); world.ghostVeh = true;
  const a = await online.leaderboard('b-test-1', 39, 10);
  assert.deepEqual(a.top[0].ghost_veh, [[3, 1]]); assert.equal(a.top[0].players.title, 'Pro'); assert.equal(scoreCalls().length, 1);
});
await test('après l’étape 20 appliquée, le jeu retrouve le niveau complet sans recharger (au bout de 30 min)', async () => {
  reset(); world.ghostVeh = false;
  await online.leaderboard('b-test-1', 39, 10);
  assert.equal(online._lbFlags.veh, false);
  world.ghostVeh = true; online._lbAt = Date.now() - 31 * 60000; world.calls.length = 0;
  const a = await online.leaderboard('b-test-1', 39, 10);
  assert.deepEqual(a.top[0].ghost_veh, [[3, 1]]); assert.equal(online._lbFlags.veh, true);
});
await test('étapes 7 et 8 absentes : repli jusqu’à la lecture la plus simple', async () => {
  reset(); world.ghostVeh = false; world.title = false; world.hasGhost = false;
  const a = await online.leaderboard('b-test-1', 39, 10);
  assert.equal(a.top[0].players.name, 'Ana'); assert.equal(a.top[0].has_ghost, undefined);
  world.title = true; world.hasGhost = true;
});
await test('une autre erreur que « colonne refusée » (réseau coupé, 429) remonte tout de suite : aucune requête de repli', async () => {
  reset(); world.status = 429;
  await assert.rejects(online.leaderboard('b-test-1', 39, 10), (e) => e.code === 'rate');
  assert.equal(scoreCalls().length, 1, '429 : une seule requête, pas de repli');
  reset(); world.offline = true;
  await assert.rejects(online.leaderboard('b-test-1', 39, 10), (e) => e.code === 'offline');
  assert.equal(scoreCalls().length, 0);
});


// ---- TECH-031 : lire ne crée aucun joueur ----
const READS = [
  ['circuits de la communauté (récents)', () => online.listTracks({ sort: 'recent' })],
  ['circuits populaires, recherche', () => online.listTracks({ sort: 'popular', search: 'a' })],
  ['circuits des auteurs suivis', () => online.listTracks({ authors: ['0b9f3c2e-1111-4222-8333-444455556666'] })],
  ['« mes circuits » (aucune session : aucun circuit)', async () => assert.deepEqual(await online.listTracks({ mine: true }), [])],
  ['un circuit par son identifiant', () => online.trackById('11111111-2222-4333-8444-555555555555')],
  ['tendances', () => online.trending({ limit: 4 })],
  ['classement mondial (haut, nombre de temps)', () => online.leaderboard('b-test-1', 39, 10)],
  ['fantôme du classement', () => online.ghost('b-test-1', 1, 39)],
  ['classement par secteur', () => online.sectorBoard('b-test-1', 39, 0, 10)],
  ['classement de saison', () => online.seasonStandings(1, 20)],
  ['nombre d’abonnés', () => online.followerCount('0b9f3c2e-1111-4222-8333-444455556666')],
  ['mes « j’aime » (sans session : aucun)', async () => assert.equal((await online.myLikes()).size, 0)],
  ['mes abonnements (sans session : aucun)', async () => assert.equal((await online.myFollows()).size, 0)],
  ['commentaires', () => community.comments('11111111-2222-4333-8444-555555555555')],
  ['playlists publiques', () => community.playlists()],
  ['modes publiés', () => community.communityModes()],
  ['sélection de la rédaction', () => community.picks()],
  ['circuit au hasard', () => community.randomTrack()],
  ['circuits recommandés', () => community.recommended()],
  ['statistiques d’un circuit', () => community.trackStats('eclats', 39)],
];
function freshDevice(name) { const d = device(name); online.useGuest(); online.session = null; online.player = null; online._authP = null; return d; }
await test('TECH-031 : afficher le classement et la communauté ne crée aucun joueur anonyme (aucune requête /auth/v1/signup, aucune session écrite)', async () => {
  reset(); freshDevice('lecteur'); world.ghostVeh = true;
  for (const [label, read] of READS) { await read(); assert.equal(signups(), 0, label + ' : une inscription anonyme a été créée'); }
  assert.equal(online.session, null); assert.equal(storage.getJSON('online.session', null), null);
  assert.ok(world.calls.length >= READS.length - 3, 'les lectures ont bien eu lieu (trois n’ont rien à demander sans session)');
  assert.ok(world.calls.every((c) => c.authorization === null && c.apikey), 'sans session : clé publique seule, aucun jeton');
});
await test('TECH-031 : avec une session déjà présente, les lectures la présentent (« ma place », mes j’aime) sans en créer d’autre', async () => {
  reset(); freshDevice('connu');
  const sess = session({ id: 'anon-lecteur', anon: true });
  online.session = { access_token: sess.access_token, refresh_token: sess.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'anon-lecteur' } };
  assert.equal((await online.myLikes()).size, 1);
  await online.leaderboard('b-test-1', 39, 10);
  assert.equal(signups(), 0);
  assert.ok(world.calls.filter((c) => c.path === '/rest/v1/scores').every((c) => /^Bearer /.test(c.authorization || '')), 'la session existante est présentée');
});
await test('TECH-031 : session périmée mais renouvelable : renouvelée, sans inscription ; jeton refusé : lecture publique quand même, toujours sans inscription', async () => {
  reset(); freshDevice('perime');
  const sess = session({ id: 'anon-perime', anon: true });
  online.session = { access_token: sess.access_token, refresh_token: sess.refresh_token, expires_at: Math.floor(Date.now() / 1000) - 10, user: { id: 'anon-perime' } };
  await online.leaderboard('b-test-1', 39, 10);
  assert.equal(signups(), 0); assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/token').length >= 1, true);
  srv.refreshFails = true; online.session = { ...online.session, expires_at: Math.floor(Date.now() / 1000) - 10 };
  reset(); srv.refreshFails = true;
  const a = await online.leaderboard('b-test-1', 39, 10);
  assert.ok(a.top.length === 1); assert.equal(signups(), 0, 'un jeton refusé ne fabrique pas de nouveau joueur pour LIRE');
  srv.refreshFails = false;
});
await test('une ACTION exige toujours une session : aimer un circuit en crée une (témoin : le faux serveur compte bien les inscriptions)', async () => {
  reset(); freshDevice('acteur');
  await online.toggleLike('11111111-2222-4333-8444-555555555555', 'Ana').catch(() => {});
  assert.equal(signups(), 1);
});
await test('PUBLIC_RPC : liste fermée (une fonction hors liste n’est pas appelable sans session par readRpc)', () => {
  assert.throws(() => online.readRpc('toggle_like', {}), (e) => e instanceof OnlineError);
  assert.ok(PUBLIC_RPC.length >= 10 && new Set(PUBLIC_RPC).size === PUBLIC_RPC.length);
});

// ---- TECH-080 (a) : le nombre de temps passe par la même voie ; (b) le délai d'un refus 429 est gardé ----
await test('TECH-080 a : réseau coupé pendant le décompte du classement : « Serveur injoignable », jamais « Failed to fetch » brut', async () => {
  reset(); freshDevice('coupe');
  let calls = 0; const f = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (/select=player/.test(String(url))) { calls++; throw new TypeError('Failed to fetch'); } return f(url, init); };
  try { await assert.rejects(online._count('track_key=eq.b-test-1'), (e) => e instanceof OnlineError && e.code === 'offline' && !/Failed to fetch/.test(e.message)); } finally { globalThis.fetch = f; }
  assert.equal(calls, 1);
});
await test('TECH-080 a : le nombre de temps d’un classement refusé en 429 garde le délai du serveur', async () => {
  reset(); freshDevice('limite'); world.status = 429; world.retryAfter = 42;
  await assert.rejects(online._count('track_key=eq.b-test-1'), (e) => e.code === 'rate' && e.retryAfter === 42 && e.message === waitText(42));
});
await test('TECH-080 b : un refus 429 avec Retry-After dit le délai du serveur (secondes, puis minutes), pas « dans quelques minutes »', async () => {
  reset(); freshDevice('lent'); world.status = 429; world.retryAfter = 17;
  await assert.rejects(online.listTracks({}), (e) => e.code === 'rate' && e.message === 'Trop de demandes : réessaie dans 17 s.' && e.retryAfter === 17);
  world.retryAfter = 600;
  await assert.rejects(online.listTracks({}), (e) => e.message === 'Trop de demandes : réessaie dans 10 min.');
  world.retryAfter = null;
  await assert.rejects(online.listTracks({}), (e) => e.code === 'rate' && /quelques minutes/.test(e.message), 'sans délai connu : le message générique');
  world.status = 0;
});
await test('TECH-080 b : Retry-After en date HTTP, texte du serveur « réessaie dans 12 s » (submit-score), valeurs absurdes ignorées', async () => {
  assert.equal(parseRetryAfter('30'), 30); assert.equal(parseRetryAfter(''), null); assert.equal(parseRetryAfter('abc'), null); assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(new Date(Date.now() + 20000).toUTCString(), Date.now()) >= 19, true);
  assert.equal(parseRetryAfter('0'), 1);
  reset(); freshDevice('score');
  const f = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('/functions/v1/submit-score') ? new Response(JSON.stringify({ error: 'Trop de courses envoyées : réessaie dans 12 s.' }), { status: 429 }) : f(url, init));
  try { await assert.rejects(online._send('/functions/v1/submit-score', { method: 'POST', body: {}, auth: false }), (e) => e.code === 'rate' && e.message === 'Trop de demandes : réessaie dans 12 s.' && e.retryAfter === 12); } finally { globalThis.fetch = f; }
});

await test('TECH-080 b : les messages de délai sont traduits en anglais', async () => {
  const I = await import('../js/i18n.js');
  const en = (await import('../js/i18n/en.js')).default || (await import('../js/i18n/en.js'));
  I.register(typeof en === 'function' ? en() : en);
  I.setLang('en');
  try {
    assert.equal(I.translate(waitText(17)), 'Too many requests: try again in 17 s.');
    assert.equal(I.translate(waitText(600)), 'Too many requests: try again in 10 min.');
    assert.equal(I.translate('Trop de courses envoyées : réessaie dans un instant.'), 'Too many runs sent: try again in a moment.');
  } finally { I.setLang('fr'); }
});

await finish('Lectures en ligne : classement avec ou sans droit de colonne.');
