// Tirage des saisons figé (TRANS-12, RISK-001, COMPLETE-002) : node tools/test-saisons-figees.mjs   (npm test)
//                                                  node tools/test-saisons-figees.mjs --etendre   -> ajoute au fichier doré les saisons qui lui manquent (ne change JAMAIS un tirage existant)
//                                                  node tools/test-saisons-figees.mjs --bascule   -> après l'AJOUT d'une liste à SEASON_POOLS (js/seasons.js) : réécrit les saisons du fichier à partir de sa
//                                                                                                     saison de bascule, et seulement si elle vient après les douze saisons qui suivent la saison en cours
//
// js/seasons.js : seasonTracks(n) tire les trois circuits de la saison n dans une liste EXPLICITE d'identifiants (SEASON_POOLS : la dernière dont from ≤ n), d'après le numéro seulement. Depuis la 0.17.0,
// ajouter un circuit officiel ne change donc plus aucun tirage (avant, le pool était « tous les circuits hors Atelier », et un circuit de plus changeait toutes les saisons, y compris celle en cours, que le
// serveur vérifie : verify.js). tools/saisons-figees.json fige le tirage des saisons passées, de la saison en cours et des suivantes (au moins douze au-delà). Ce test échoue si l'un de ces tirages change,
// si le fichier ne couvre plus les douze saisons qui suivent la saison en cours (alors : --etendre), ou si une liste du pool est mal faite : identifiant inconnu ou de l'Atelier, liste qui ne prolonge pas la
// précédente, saison de bascule trop proche (moins de deux semaines après sa décision, ou parmi les douze saisons qui la suivaient).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { seasonTracks, seasonOf, seasonBounds, seasonPoolIds, SEASON_POOLS, SEASON_POOL_1, SEASON_TRACKS } from '../js/seasons.js';
import { rng } from '../js/daily.js';

const FILE = new URL('./saisons-figees.json', import.meta.url);
export const AHEAD = 12;                                // saisons qui suivent la saison en cours, que le fichier doit couvrir au moins
export const MARGIN = 52;                               // à l'écriture, on couvre en plus un an : le test ne tombe pas en panne chaque semaine
const draw = (n) => seasonTracks(n).map((d) => d.id);
const pool = (n = 1) => [...seasonPoolIds(n)];
const DAY = 86400000;
const load = () => JSON.parse(readFileSync(FILE, 'utf8'));
const needed = (now = Date.now()) => seasonOf(now) + AHEAD;

if (process.argv.includes('--bascule')) {
  const g = load(), cur = seasonOf(Date.now()), last = SEASON_POOLS[SEASON_POOLS.length - 1], from = last.from;
  if (SEASON_POOLS.length < 2) { console.error('Refusé : SEASON_POOLS n\'a qu\'une liste, il n\'y a pas de bascule.'); process.exit(1); }
  if (from <= cur + AHEAD) { console.error(`Refusé : la bascule (saison ${from}) tombe dans les ${AHEAD} saisons qui suivent la saison en cours (${cur}) : choisir une saison après la ${cur + AHEAD}.`); process.exit(1); }
  const bad = [];
  for (let n = 1; n < from; n++) if (g.saisons[n] && g.saisons[n].join() !== draw(n).join()) bad.push(n);
  if (bad.length) { console.error(`Refusé : le tirage des saisons ${bad.join(', ')} (avant la bascule) a changé.`); process.exit(1); }
  let k = 0;
  for (let n = from; n <= g.jusqua; n++) { g.saisons[n] = draw(n); k++; }
  g.bascules = { ...(g.bascules || {}), [from]: { pool: last.ids.length, poolIds: [...last.ids] } };
  writeFileSync(FILE, JSON.stringify(g, null, 1) + '\n');
  console.log(`tools/saisons-figees.json : saisons ${from} à ${g.jusqua} retirées dans la liste de la bascule (${k}) ; les saisons 1 à ${from - 1} sont inchangées.`);
  process.exit(0);
}

if (process.argv.includes('--etendre')) {
  const g = load(), upto = needed() + MARGIN, bad = [];
  for (let n = 1; n <= upto; n++) {
    if (g.saisons[n]) { if (g.saisons[n].join() !== draw(n).join()) bad.push(n); } else g.saisons[n] = draw(n);
  }
  if (bad.length) { console.error(`Refusé : le tirage des saisons ${bad.join(', ')} a changé (${bad.length}) : on n'étend que ce qui manque. Annuler la modification de la liste des circuits.`); process.exit(1); }
  g.jusqua = upto;
  writeFileSync(FILE, JSON.stringify(g, null, 1) + '\n');
  console.log(`tools/saisons-figees.json : saisons 1 à ${upto} (${upto - needed()} de marge au-delà des ${AHEAD} suivantes).`);
  process.exit(0);
}

const golden = load();
const first = Math.min(...Object.keys(golden.saisons).map(Number)), last = Math.max(...Object.keys(golden.saisons).map(Number));
console.log('Le fichier doré');
test('il couvre TOUTES les saisons passées, la saison en cours et les douze suivantes (sinon : node tools/test-saisons-figees.mjs --etendre)', () => {
  const now = Date.now(), cur = seasonOf(now);
  assert.equal(first, 1, 'depuis la saison 1');
  assert.ok(cur >= 1, 'la saison 1 a commencé (9 novembre 2026)');
  assert.ok(last >= needed(now), `le fichier s'arrête à la saison ${last} ; la saison en cours est la ${cur} : il faut couvrir jusqu'à la ${needed(now)} (--etendre)`);
  for (let n = 1; n <= last; n++) assert.ok(golden.saisons[n], 'saison ' + n + ' manquante');
  assert.equal(golden.jusqua, last);
});
test('chaque saison figée a trois circuits distincts du pool de SA saison (jamais l\'Atelier)', () => {
  for (const [n, ids] of Object.entries(golden.saisons)) { const p = new Set(pool(+n)); assert.equal(ids.length, SEASON_TRACKS, 'saison ' + n); assert.equal(new Set(ids).size, SEASON_TRACKS); assert.ok(ids.every((id) => p.has(id)), 'saison ' + n + ' : ' + ids); }
});

console.log('Le tirage d\'aujourd\'hui');
test('le tirage de chaque saison figée est INCHANGÉ (saisons passées, en cours et suivantes) : ajouter, retirer ou réordonner un circuit du pool le changerait', () => {
  const changed = [];
  for (let n = 1; n <= last; n++) if (draw(n).join() !== golden.saisons[n].join()) changed.push(`saison ${n} : ${golden.saisons[n].join(' ')} → ${draw(n).join(' ')}`);
  assert.deepEqual(changed, [], `${changed.length} tirage(s) changé(s) (le pool des saisons : ${pool().length} circuits, ${golden.pool} figés). Ajouter un circuit change les circuits des saisons, y compris celle en cours, que le serveur vérifie ; `
    + 'figer le pool des saisons avant d\'ajouter du contenu, ou n\'ajouter que des circuits de décor « atelier » (hors pool).\n  ' + changed.slice(0, 6).join('\n  '));
});
test('le pool des saisons d\'avant la bascule est celui qui a servi à figer (les 66 circuits hors Atelier, dans l\'ordre de la carrière d\'avant la 0.17.0) ; celui de chaque bascule aussi', () => {
  assert.deepEqual([...SEASON_POOL_1], golden.poolIds, 'le pool 1 a changé');
  assert.deepEqual(pool(1), golden.poolIds);
  assert.equal(golden.pool, golden.poolIds.length);
  assert.equal(golden.pool, 66);
  for (const p of SEASON_POOLS.slice(1)) assert.deepEqual([...p.ids], golden.bascules?.[p.from]?.poolIds, `bascule de la saison ${p.from} : son pool n'est pas celui du fichier (node tools/test-saisons-figees.mjs --bascule)`);
  assert.deepEqual(Object.keys(golden.bascules || {}).map(Number), SEASON_POOLS.slice(1).map((p) => p.from), 'une bascule par liste ajoutée, pas plus');
});
test('chaque liste du pool : identifiants connus, distincts, hors Atelier ; une liste PROLONGE la précédente (mêmes circuits, même ordre, ajouts à la fin) ; bascules croissantes', () => {
  const byId = new Map(BUILTIN_TRACKS.map((d) => [d.id, d]));
  assert.equal(SEASON_POOLS[0].from, 1);
  SEASON_POOLS.forEach((p, i) => {
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.ids), 'liste ' + i + ' figée');
    assert.equal(new Set(p.ids).size, p.ids.length, 'liste ' + i + ' : doublons');
    for (const id of p.ids) { assert.ok(byId.has(id), 'liste ' + i + ' : circuit inconnu ' + id); assert.notEqual(byId.get(id).decor, 'atelier', id); }
    if (i) {
      const prev = SEASON_POOLS[i - 1];
      assert.ok(p.from > prev.from, 'bascules croissantes');
      assert.deepEqual(p.ids.slice(0, prev.ids.length), [...prev.ids], 'liste ' + i + ' : elle doit commencer par la liste précédente, dans le même ordre');
      assert.ok(p.ids.length > prev.ids.length, 'liste ' + i + ' : elle ajoute des circuits');
    }
  });
});
test('chaque bascule est loin de sa décision : au moins deux semaines après, et après les douze saisons qui suivaient la saison en cours ce jour-là', () => {
  for (const p of SEASON_POOLS.slice(1)) {
    assert.match(p.decided || '', /^\d{4}-\d{2}-\d{2}$/, `bascule ${p.from} : date de décision (decided) attendue`);
    const d = Date.parse(p.decided + 'T00:00:00Z');
    assert.ok(seasonBounds(p.from).starts - d >= 14 * DAY, `bascule ${p.from} : moins de deux semaines après sa décision`);
    assert.ok(p.from > seasonOf(d) + AHEAD, `bascule ${p.from} : elle tombe dans les ${AHEAD} saisons qui suivaient la saison ${seasonOf(d)}`);
  }
});

console.log('Le garde-fou voit bien ce qui change');
test('ajouter un circuit officiel ne change AUCUN tirage (quel que soit son décor) : le pool est une liste explicite ; changer cette liste, elle, changerait beaucoup de tirages', () => {
  const base = [], mk = (id, decor) => ({ ...BUILTIN_TRACKS[0], id, decor });
  for (let n = 1; n <= last; n++) base.push(draw(n).join());
  for (const decor of ['atelier', 'desert', 'jungle']) {
    BUILTIN_TRACKS.push(mk('essai-' + decor, decor));
    try { assert.deepEqual(Array.from({ length: last }, (_, i) => draw(i + 1).join()), base, `un circuit « ${decor} » ajouté en fin ne change aucun tirage`); } finally { BUILTIN_TRACKS.pop(); }
  }
  // le même tirage que seasonTracks, sur une liste d'identifiants donnée : une liste d'un circuit de plus change beaucoup de saisons (d'où les bascules)
  const drawIn = (ids, n) => { const r = rng('season#' + n), out = []; while (out.length < SEASON_TRACKS) { const id = ids[Math.floor(r() * ids.length)]; if (!out.includes(id)) out.push(id); } return out.join(); };
  for (let n = 1; n <= last; n++) assert.equal(drawIn(pool(n), n), golden.saisons[n].join(), 'le tirage de référence est bien celui de seasonTracks (saison ' + n + ')');
  const longer = [...SEASON_POOL_1, 'eclats-bis'];
  assert.ok(Array.from({ length: last }, (_, i) => drawIn(longer, i + 1)).filter((x, i) => x !== drawIn(SEASON_POOL_1, i + 1)).length > 5, 'une liste d\'un circuit de plus change beaucoup de tirages');
  assert.deepEqual(Array.from({ length: last }, (_, i) => draw(i + 1).join()), base, 'et la liste des circuits est remise telle quelle');
});
test('le tirage ne dépend que du numéro de saison et du pool : deux appels, même résultat, dans l\'ordre de la carrière', () => {
  for (const n of [1, 2, 3, 15, last]) { assert.deepEqual(draw(n), draw(n)); assert.deepEqual(draw(n), golden.saisons[n]); }
});

await finish('Le tirage des saisons est figé et inchangé.');
