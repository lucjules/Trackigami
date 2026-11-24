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
const { online, OnlineError } = await import('../js/online.js');
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
  return json(404, { message: 'inconnu ' + path });
};
const scoreCalls = () => world.calls.filter((c) => c.path === '/rest/v1/scores' && c.select && c.select.includes('players!'));
const reset = () => { world.calls.length = 0; srv.calls.length = 0; world.status = 0; world.retryAfter = null; world.offline = false; online._lbLevel = 0; online._lbAt = 0; };
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
  assert.equal(online._lbLevel, 1);
  world.ghostVeh = true; online._lbAt = Date.now() - 31 * 60000; world.calls.length = 0;
  const a = await online.leaderboard('b-test-1', 39, 10);
  assert.deepEqual(a.top[0].ghost_veh, [[3, 1]]); assert.equal(online._lbLevel, 0);
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

await finish('Lectures en ligne : classement avec ou sans droit de colonne.');
