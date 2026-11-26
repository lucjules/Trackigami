// Espacement des points de retour (GAME-007, TRANS-14) : node tools/test-espacement.mjs   (npm test)
//
// Une erreur ramène au dernier point de retour (départ, checkpoint, passage de ligne d'un tour). RÈGLE pour les circuits : au plus 30 s entre deux points de retour consécutifs (le dernier : l'arrivée), mesurés sur la
// course du pilote automatique ; tools/contract.mjs l'applique à tout circuit qui n'est pas dans la liste figée tools/checkpoints-exceptions.json (les circuits d'avant la règle, qu'on ne modifie pas : RISK-001).
// Ce fichier garde : la mesure (celle de l'audit, retrouvée), la liste figée (exactement les circuits hors règle, aucun n'a grandi), la règle (un circuit de 45 s sans checkpoint échoue, avec un checkpoint
// au milieu il passe, les 72 circuits existants passent) et son application par checkDef.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { scriptTrack } from '../js/track.js';
import { runTrack } from './lab.mjs';
import { checkDef } from './contract.mjs';
import { MAX_GAP, TOLERANCE, spacing, spacingFails, loadExceptions, measureAllSpacing } from './checkpoints-espacement.mjs';

const ex = loadExceptions();
const cache = {};
function runCache(id) { return (cache[id] ||= runTrack(buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === id)))); }
const r1 = (x) => Math.round(x * 10) / 10;
const rows = measureAllSpacing(), by = Object.fromEntries(rows.map((r) => [r.id, r]));
const long = (mid) => scriptTrack('long', 'start ' + Array.from({ length: 70 }, (_, i) => (mid && i === 35 ? 'C' : 'S')).join(' ') + ' finish', { decor: 'desert' });

console.log('La mesure');
test('l\'écart se mesure entre points de retour consécutifs (départ, checkpoints, tours, arrivée) ; la médiane et l\'écart maximal sont ceux de la course', () => {
  const sp = spacing({ cps: [18, 30], lapTimes: [], time: 70 });
  assert.deepEqual(sp.gaps, [18, 12, 40]); assert.equal(sp.max, 40); assert.equal(sp.median, 18);
  assert.deepEqual(sp.where, { from: 'checkpoint 2', to: 'arrivée', t0: 30, t1: 70 });
  const lap = spacing({ cps: [20], lapTimes: [40], time: 78 });
  assert.deepEqual(lap.gaps, [20, 20, 38]); assert.equal(lap.maxCpOnly, 58, 'sans le passage de ligne (mesure de l\'audit) : 58 s, avec : 38 s');
});
test('les chiffres de l\'audit sont retrouvés : « Double Hélice » 52 s, « Cheminée » 41,7 s, « Récif » 41,1 s, « Viaduc » 41 s, « Épave » 40,2 s ; médiane des 72 circuits 28,6 s', () => {
  const rows72 = rows.slice(0, 72);      // les circuits de l'audit (0.17.0 : 12 circuits ajoutés après eux, voir le test suivant)
  assert.equal(rows.length, 84);
  assert.ok(rows.every((r) => r.ok && r.respawns === 0), 'le pilote finit les 84 circuits sans réapparition');
  assert.deepEqual([by.helice.max, by.cheminee.max, by.recif.max, by.viaduc.max, by.epave.max].map(r1), [52, 41.7, 41.1, 41, 40.2]);
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return (s[35] + s[36]) / 2; };
  assert.ok(Math.abs(med(rows72.map((r) => r.maxCpOnly)) - 28.6) < 0.2, 'médiane (checkpoints seuls, comme l\'audit) : ' + med(rows72.map((r) => r.maxCpOnly)));
  assert.equal(by.helice.checkpoints, 1);
});
test('les circuits à plusieurs tours comptent la ligne comme point de retour : « Grand Anneau » et « Caldeira » passent la règle, alors qu\'à checkpoints seuls ils la dépasseraient', () => {
  for (const id of ['grandanneau', 'caldeira']) { assert.ok(by[id].maxCpOnly > MAX_GAP, id); assert.ok(by[id].max <= MAX_GAP, id); assert.ok(!Object.hasOwn(ex, id), id + ' n\'est pas une exception'); }
});

test('0.17.0 : les 12 circuits ajoutés (après la règle) la respectent tous, sans exception : 30 s au plus entre deux points de retour, sur la course du pilote', () => {
  const added = rows.slice(72);
  assert.equal(added.length, 12);
  for (const r of added) { assert.ok(r.max <= MAX_GAP, `${r.id} : ${r.max} s`); assert.ok(!Object.hasOwn(ex, r.id), r.id); assert.ok(r.checkpoints >= 1, r.id); }
});

console.log('La liste figée');
test('tools/checkpoints-exceptions.json est EXACTEMENT l\'ensemble des circuits au-dessus de 30 s, chacun avec son écart mesuré ; aucun circuit de la liste n\'a grandi', () => {
  const over = rows.filter((r) => r.max > MAX_GAP).map((r) => r.id);
  assert.deepEqual(Object.keys(ex).sort(), over.sort(), 'les circuits hors règle');
  for (const id of Object.keys(ex)) { assert.ok(by[id], id + ' existe'); assert.ok(by[id].max <= ex[id] + TOLERANCE, `${id} : ${by[id].max} > ${ex[id]} figé`); assert.ok(Math.abs(by[id].max - ex[id]) < 0.1, `${id} : valeur figée à remettre à jour (${ex[id]} → ${by[id].max})`); }
  assert.equal(over.length, 26);
});
test('les 84 circuits existants passent la règle (les exceptions passent, figées) ; un circuit de la liste qui grandirait, ou qui respecterait la règle sans être retiré, échoue', () => {
  for (const r of rows) assert.deepEqual(spacingFails(r.id, runCache(r.id), ex), [], r.id);
  const S = runCache('helice');
  assert.match(spacingFails('helice', S, { helice: 45 }).join(), /plus que les 45\.0 s figés/, 'un écart qui grandit');
  assert.match(spacingFails('canyon', runCache('canyon'), { canyon: 31 }).join(), /retirer « canyon »/, 'exception devenue inutile');
});

console.log('La règle sur un nouveau circuit');
test('un circuit de test de 45 s SANS checkpoint échoue : 30 s au plus entre deux points de retour', () => {
  const S = runTrack(long(false));
  assert.ok(S.ok && S.cps.length === 0 && S.time > 44 && S.time < 47, `circuit de test : ${S.time.toFixed(1)} s, ${S.cps.length} checkpoint`);
  const f = spacingFails('nouveau-test', S, ex);
  assert.equal(f.length, 1); assert.match(f[0], /^espacement : 4\d\.\d s sans point de retour entre départ \(0\.0 s\) et arrivée/); assert.match(f[0], /30 s au plus/);
});
test('le même circuit avec un checkpoint au milieu passe (deux tronçons sous 30 s) ; les exceptions sont des identifiants : un circuit nouveau portant la même course qu\'une exception échoue', () => {
  const S = runTrack(long(true));
  assert.equal(S.cps.length, 1);
  assert.deepEqual(spacingFails('nouveau-test', S, ex), []);
  assert.ok(spacing(S).max <= MAX_GAP, 'tronçons : ' + spacing(S).gaps.join(' / '));
  assert.deepEqual(spacingFails('helice', runCache('helice'), ex), [], 'l\'exception figée passe');
  assert.equal(spacingFails('helice-2', runCache('helice'), ex).length, 1, 'le même circuit sous un autre identifiant échoue');
});
test('checkDef (le contrat que tout nouveau circuit doit passer) applique la règle : « Double Hélice » passe sous son identifiant, la même définition sous un nouvel identifiant échoue sur l\'espacement', () => {
  const def = BUILTIN_TRACKS.find((d) => d.id === 'helice');
  assert.ok(!checkDef({ ...def }).fails.some((x) => /espacement/.test(x)), 'exception figée');
  const f = checkDef({ ...def, id: 'helice-nouveau' }).fails.filter((x) => /espacement/.test(x));
  assert.equal(f.length, 1); assert.match(f[0], /52\.0 s sans point de retour/);
  const ok = BUILTIN_TRACKS.find((d) => d.id === 'eclats');
  assert.ok(!checkDef({ ...ok, id: 'eclats-nouveau' }).fails.some((x) => /espacement/.test(x)), 'un circuit en règle n\'est pas touché');
});

await finish('Tous les tests d\'espacement des checkpoints passent.');
