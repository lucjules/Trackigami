// Tirage des saisons figé (TRANS-12, RISK-001) : node tools/test-saisons-figees.mjs   (npm test)
//                                                  node tools/test-saisons-figees.mjs --etendre   -> ajoute au fichier doré les saisons qui lui manquent (ne change JAMAIS un tirage existant)
//
// js/seasons.js : seasonTracks(n) tire les trois circuits de la saison n dans BUILTIN_TRACKS (hors décor « atelier »), d'après le numéro seulement. Le tirage dépend donc de la LISTE des circuits : en ajouter un
// (ou en retirer, ou changer leur ordre) change les circuits de TOUTES les saisons, y compris celle en cours, que le serveur vérifie (une course de saison n'est acceptée que sur un circuit de la saison : verify.js).
// tools/saisons-figees.json fige ce tirage pour les saisons passées, la saison en cours et les suivantes (au moins douze au-delà de la saison en cours). Ce test échoue si l'un de ces tirages change, ou si le fichier ne
// couvre plus les douze saisons qui suivent la saison en cours (alors : --etendre). Figer réellement le pool (pour pouvoir ajouter des circuits sans toucher aux saisons) est une étape à part, non faite ici.
// Ajouter un circuit du chapitre « Atelier » (décor atelier) ne change rien : il n'est pas dans le pool.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { seasonTracks, seasonOf, SEASON_TRACKS } from '../js/seasons.js';

const FILE = new URL('./saisons-figees.json', import.meta.url);
export const AHEAD = 12;                                // saisons qui suivent la saison en cours, que le fichier doit couvrir au moins
export const MARGIN = 52;                               // à l'écriture, on couvre en plus un an : le test ne tombe pas en panne chaque semaine
const draw = (n) => seasonTracks(n).map((d) => d.id);
const pool = () => BUILTIN_TRACKS.filter((d) => d.decor !== 'atelier').map((d) => d.id);
const load = () => JSON.parse(readFileSync(FILE, 'utf8'));
const needed = (now = Date.now()) => seasonOf(now) + AHEAD;

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
test('chaque saison figée a trois circuits distincts du pool (jamais l\'Atelier)', () => {
  const p = new Set(pool());
  for (const [n, ids] of Object.entries(golden.saisons)) { assert.equal(ids.length, SEASON_TRACKS, 'saison ' + n); assert.equal(new Set(ids).size, SEASON_TRACKS); assert.ok(ids.every((id) => p.has(id)), 'saison ' + n + ' : ' + ids); }
});

console.log('Le tirage d\'aujourd\'hui');
test('le tirage de chaque saison figée est INCHANGÉ (saisons passées, en cours et suivantes) : ajouter, retirer ou réordonner un circuit du pool le changerait', () => {
  const changed = [];
  for (let n = 1; n <= last; n++) if (draw(n).join() !== golden.saisons[n].join()) changed.push(`saison ${n} : ${golden.saisons[n].join(' ')} → ${draw(n).join(' ')}`);
  assert.deepEqual(changed, [], `${changed.length} tirage(s) changé(s) (le pool des saisons : ${pool().length} circuits, ${golden.pool} figés). Ajouter un circuit change les circuits des saisons, y compris celle en cours, que le serveur vérifie ; `
    + 'figer le pool des saisons avant d\'ajouter du contenu, ou n\'ajouter que des circuits de décor « atelier » (hors pool).\n  ' + changed.slice(0, 6).join('\n  '));
});
test('le pool (identifiants et ordre des circuits hors Atelier) est celui qui a servi à figer : le test a une cause à nommer quand il échoue', () => {
  assert.deepEqual(pool(), golden.poolIds, 'le pool a changé');
  assert.equal(golden.pool, golden.poolIds.length);
});

console.log('Le garde-fou voit bien ce qui change');
test('ajouter un circuit du pool (hors Atelier) CHANGERAIT des tirages : le test ci-dessus l\'attraperait ; un circuit d\'Atelier ne change rien', () => {
  const base = [], mk = (id, decor) => ({ ...BUILTIN_TRACKS[0], id, decor });
  for (let n = 1; n <= last; n++) base.push(draw(n).join());
  BUILTIN_TRACKS.push(mk('essai-atelier', 'atelier'));
  try { assert.deepEqual(Array.from({ length: last }, (_, i) => draw(i + 1).join()), base, 'un circuit d\'Atelier ajouté en fin ne change aucun tirage'); } finally { BUILTIN_TRACKS.pop(); }
  BUILTIN_TRACKS.push(mk('essai-desert', 'desert'));
  try {
    const now = Array.from({ length: last }, (_, i) => draw(i + 1).join());
    assert.ok(now.filter((x, i) => x !== base[i]).length > 5, 'un circuit de plus dans le pool change beaucoup de tirages');
  } finally { BUILTIN_TRACKS.pop(); }
  assert.deepEqual(Array.from({ length: last }, (_, i) => draw(i + 1).join()), base, 'et la liste est remise telle quelle');
});
test('le tirage ne dépend que du numéro de saison et du pool : deux appels, même résultat, dans l\'ordre de la carrière', () => {
  for (const n of [1, 2, 3, 15, last]) { assert.deepEqual(draw(n), draw(n)); assert.deepEqual(draw(n), golden.saisons[n]); }
});

await finish('Le tirage des saisons est figé et inchangé.');
