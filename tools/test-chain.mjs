// Épreuve « chapitre d'une traite » (COMPLETE-014) : clé composée, liste recalculée, contrôles de forme, rejeu serveur de plusieurs courses, cloisonnement avec
// les courses seules et non-régression des catégories existantes.   node tools/test-chain.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { CHAPTER_KEYS } from '../js/themes.js';
import { CHAPTER_SIZE } from '../js/career.js';
import { DT, MAX_RUN_SECONDS } from '../js/constants.js';
import { PHYS_VER } from '../js/version.js';
import { verifyChain, verifyRun, trackForKey } from '../js/verify.js';
import { aidedKey } from '../js/aids.js';
import {
  CHAIN_LEGS, MAX_CHAIN_SECONDS, MAX_CHAIN_INPUTS_CHARS, CHAIN_KEY_RE, chainChapters, chainLegIndexes, chainKey, chainKeyFrom, chainForKey, chainTime, chainSplits,
  chainShapeError, isChainKey,
} from '../js/chain.js';
import { botRun } from './seed-officiels.mjs';
import { ChainRun, submissionFromRecord } from '../js/chainRun.js';
import { Championship } from '../js/net/championship.js';
import { validRecord } from '../js/storage.js';
import { readFileSync } from 'node:fs';

const keyOfDef = (d) => `b-${d.id}-${hashString(buildBuiltin(d).encode())}`;

console.log('Clé composée');
test('un chapitre = 6 circuits (CHAIN_LEGS = CHAPTER_SIZE), 14 chapitres, ordre de la carrière', () => {
  assert.equal(CHAIN_LEGS, CHAPTER_SIZE);
  assert.equal(chainChapters(), 14);
  assert.equal(chainChapters() * CHAIN_LEGS, BUILTIN_TRACKS.length);
  assert.deepEqual(chainLegIndexes(2), [12, 13, 14, 15, 16, 17]);
  assert.throws(() => chainLegIndexes(14), /Chapitre inconnu/);
  assert.throws(() => chainLegIndexes(-1), /Chapitre inconnu/);
});

test('clé de chaque chapitre : forme, longueur ≤ 80 (avec aides), aucune collision, déterministe', () => {
  const seen = new Set();
  for (let ch = 0; ch < chainChapters(); ch++) {
    const k = chainKey(ch), ka = chainKey(ch, { aided: true });
    assert.match(k, CHAIN_KEY_RE);
    assert.match(ka, CHAIN_KEY_RE);
    assert.ok(k.startsWith(`ch-${CHAPTER_KEYS[ch]}-`), k);
    assert.ok(ka.length <= 80 && /^[A-Za-z0-9_~.:-]{1,80}$/.test(ka), 'clé acceptée par le serveur (TRACK_KEY_RE) : ' + ka);
    assert.equal(chainKey(ch), k);
    assert.ok(!seen.has(k)); seen.add(k);
  }
});

test('la clé dépend des 6 clés de circuit, dans l’ordre (un circuit modifié ou un ordre différent : un autre classement)', () => {
  const keys = chainLegIndexes(0).map((i) => keyOfDef(BUILTIN_TRACKS[i]));
  assert.equal(chainKeyFrom(0, keys), chainKey(0));
  assert.notEqual(chainKeyFrom(0, [...keys].reverse()), chainKey(0));
  const changed = [...keys]; changed[3] = changed[3].replace(/-[0-9a-z]+$/, '-zzzz');
  assert.notEqual(chainKeyFrom(0, changed), chainKey(0));
  assert.throws(() => chainKeyFrom(0, keys.slice(0, 5)), /invalide/);
  assert.throws(() => chainKeyFrom(0, [...keys.slice(0, 5), 'u-abc']), /invalide/);
});

test('chainForKey : retrouve les mêmes circuits, refuse une empreinte, un chapitre, une catégorie inconnus', () => {
  const c = chainForKey(chainKey(4));
  assert.equal(c.ch, 4);
  assert.equal(c.tracks.length, 6);
  assert.deepEqual(c.keys, chainLegIndexes(4).map((i) => keyOfDef(BUILTIN_TRACKS[i])));
  assert.equal(c.aided, false);
  assert.equal(chainForKey(chainKey(4, { aided: true })).aided, true);
  assert.throws(() => chainForKey('ch-desert-abc'), /Version de l’enchaînement différente/);
  assert.throws(() => chainForKey(chainKey(0).replace('ch-desert-', 'ch-jungle-')), /Version/);
  assert.throws(() => chainForKey(chainKey(0).replace('ch-desert-', 'ch-inconnu-')), /Chapitre inconnu/);
  for (const v of ['v1.veh-moto', 'v1.as-1.veh-moto', 'v1.sea-3', 'v1.duel-4', 'v1.as-2', 'v1.lap-2']) {
    assert.throws(() => chainForKey(`${chainKey(0)}~${v}`), /catégorie|Catégorie/i, v);
  }
  assert.throws(() => chainForKey('b-eclats-123'), /invalide/);
  assert.throws(() => chainForKey(''), /invalide/);
});

test('aides : aidedKey pose la catégorie « as-1 » sur une clé d’enchaînement, comme sur un circuit', () => {
  assert.equal(aidedKey(chainKey(1)), chainKey(1, { aided: true }));
  assert.equal(aidedKey(chainKey(1, { aided: true })), chainKey(1, { aided: true }));
  assert.ok(isChainKey(chainKey(1)) && !isChainKey('b-eclats-1') && !isChainKey(null));
});

test('temps cumulé et fins de manche : en pas, sans écart d’arrondi', () => {
  assert.equal(chainTime([120, 240]), 360 * DT);
  assert.deepEqual(chainSplits([10, 20, 30]), [10, 30, 60]);
});

console.log('Forme de la soumission (avant tout rejeu)');
const L = (n = 8) => 'A'.repeat(n);
const ok6 = { legs: Array(6).fill(L()), times: [10, 10, 10, 10, 10, 10], time: 60 };
test('une soumission bien formée passe', () => assert.equal(chainShapeError(ok6), ''));
test('refus : nombre de manches, commandes vides ou non base64, trop longues', () => {
  assert.match(chainShapeError({ ...ok6, legs: ok6.legs.slice(0, 5) }), /exactement 6/);
  assert.match(chainShapeError({ ...ok6, times: ok6.times.slice(0, 5) }), /exactement 6/);
  assert.match(chainShapeError({ ...ok6, legs: [...ok6.legs.slice(0, 5), ''] }), /invalides/);
  assert.match(chainShapeError({ ...ok6, legs: [...ok6.legs.slice(0, 5), 'a,b'] }), /invalides/);
  assert.match(chainShapeError({ ...ok6, legs: [...ok6.legs.slice(0, 5), 42] }), /invalides/);
  const big = Math.ceil(MAX_CHAIN_INPUTS_CHARS / 6);
  assert.match(chainShapeError({ ...ok6, legs: Array(6).fill(L(big)) }), /trop long/);
  assert.equal(chainShapeError({ ...ok6, legs: Array(6).fill(L(Math.floor((MAX_CHAIN_INPUTS_CHARS - 5) / 6))) }), '', 'à la limite exacte (jointure comprise) : accepté');
});
test('refus : temps d’une manche, temps total, somme incohérente', () => {
  assert.match(chainShapeError({ ...ok6, times: [0, 10, 10, 10, 10, 10] }), /manche invalide/);
  assert.match(chainShapeError({ ...ok6, times: [NaN, 10, 10, 10, 10, 10] }), /manche invalide/);
  assert.match(chainShapeError({ ...ok6, times: [MAX_RUN_SECONDS + 1, 10, 10, 10, 10, 10], time: MAX_RUN_SECONDS + 51 }), /manche invalide/);
  assert.match(chainShapeError({ ...ok6, times: Array(6).fill(201), time: 1206 }), /total invalide/);
  assert.ok(1206 > MAX_CHAIN_SECONDS);
  assert.match(chainShapeError({ ...ok6, time: 61 }), /somme/);
  assert.match(chainShapeError({ ...ok6, time: '60' }), /total invalide/);
});

console.log('Rejeu serveur de plusieurs courses (chapitre 14 « Grandes Manœuvres », pilote automatique)');
const CH = 13;
const chKey = chainKey(CH);
const runs = chainLegIndexes(CH).map((i) => botRun(buildBuiltin(BUILTIN_TRACKS[i]), null));
test('le pilote automatique finit les 6 manches', () => assert.ok(runs.every(Boolean)));
const legs = runs.map((r) => r.inputs), times = runs.map((r) => r.time);
const total = chainTime(times.map((t) => Math.round(t / DT)));
const sub = { trackKey: chKey, legs, times, time: total, physVer: PHYS_VER };

let cpuMs = 0;
test('enchaînement complet accepté : temps du REJEU, fins de manche, commandes jointes par « , »', () => {
  const t0 = performance.now();
  const r = verifyChain(sub);
  cpuMs = performance.now() - t0;
  assert.equal(r.ok, true, r.error);
  assert.equal(r.time, total);
  assert.equal(r.splits.length, 6);
  assert.equal(r.splits[5], Math.round(total / DT));
  assert.equal(r.inputs, legs.join(','));
  assert.ok(r.inputs.length <= MAX_CHAIN_INPUTS_CHARS);
  assert.equal(r.aided, false);
  assert.match(r.name, /Chapitre 14/);
  assert.ok(!('ghost' in r), 'pas de fantôme fabriqué');
});
test('budget processeur : mesuré, et rapporté à la durée maximale (≤ 2 s estimées pour 1 200 s de course)', () => {
  const perS = cpuMs / total;
  console.log(`       rejeu : ${cpuMs.toFixed(0)} ms pour ${total.toFixed(1)} s de course (${perS.toFixed(2)} ms/s) → ${(perS * MAX_CHAIN_SECONDS).toFixed(0)} ms estimées au pire`);
  assert.ok(perS * MAX_CHAIN_SECONDS < 2000, 'au-delà, la limite processeur d’une fonction serveur serait en danger');
});
test('la catégorie « avec aides » est acceptée avec les mêmes commandes (les aides ne changent pas le rejeu)', () => {
  const r = verifyChain({ ...sub, trackKey: chainKey(CH, { aided: true }) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.aided, true);
});
test('refus : une manche truquée, deux manches inversées, un temps de manche faux, un total faux, une autre physique', () => {
  const bad = [...legs]; bad[2] = legs[1];
  const r1 = verifyChain({ ...sub, legs: bad });
  assert.equal(r1.ok, false); assert.equal(r1.leg, 2);
  const swapped = [...legs]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const st = [...times]; [st[0], st[1]] = [st[1], st[0]];
  assert.equal(verifyChain({ ...sub, legs: swapped, times: st }).ok, false);
  const tt = [...times]; tt[4] -= 0.01; tt[5] += 0.01;
  const r3 = verifyChain({ ...sub, times: tt });
  assert.equal(r3.ok, false); assert.match(r3.error, /manche 5/);
  assert.match(verifyChain({ ...sub, time: total - 0.002 }).error, /total ne correspond pas/);
  const v = verifyChain({ ...sub, physVer: PHYS_VER + 1 });
  assert.equal(v.ok, false); assert.equal(v.versionMismatch, true);
  assert.equal(verifyChain({ ...sub, trackKey: chainKey(CH - 1) }).ok, false, 'les mêmes manches sur un autre chapitre');
});
test('cloisonnement : une clé d’enchaînement est refusée par la course seule, une clé de circuit par l’enchaînement', () => {
  assert.throws(() => trackForKey(chKey), /invalide/);
  assert.throws(() => trackForKey(chainKey(CH, { aided: true })), /invalide/);
  const one = verifyRun({ trackKey: chKey, inputs: legs[0], time: times[0], physVer: PHYS_VER });
  assert.equal(one.ok, false);
  const bKey = keyOfDef(BUILTIN_TRACKS[chainLegIndexes(CH)[0]]);
  assert.equal(verifyChain({ ...sub, trackKey: bKey }).ok, false);
});

console.log('Côté jeu : séquencement des manches (mécanisme du championnat) et soumission');
const KEYS13 = chainLegIndexes(CH).map((i) => keyOfDef(BUILTIN_TRACKS[i]));
test('ChainRun : 6 manches séquencées par un Championship, temps cumulé, « recommencer » remet tout à zéro', () => {
  const run = new ChainRun({ ch: CH, keys: KEYS13, names: ['a', 'b', 'c', 'd', 'e', 'f'], indexes: chainLegIndexes(CH) });
  assert.ok(run.cup instanceof Championship);
  assert.equal(run.key, chKey); assert.equal(run.leg, 0); assert.equal(run.current.id, KEYS13[0]);
  run.record(1200, 'AAAA'); run.record(600, 'BBBB');
  assert.equal(run.leg, 2); assert.equal(run.current.id, KEYS13[2]); assert.equal(run.time, 1800 * DT); assert.deepEqual(run.splits, [1200, 1800]);
  assert.equal(run.diffAt(1, { splits: [1100, 1900] }), -100 * DT);
  assert.equal(run.diffAt(1, null), null);
  run.markAided(); assert.equal(run.key, chainKey(CH, { aided: true }));
  run.restart();
  assert.equal(run.leg, 0); assert.equal(run.time, 0); assert.equal(run.key, chKey, 'un nouvel enchaînement repart sans aides');
  assert.throws(() => run.record(0, 'A'), /invalide/); assert.throws(() => run.record(10, ''), /invalide/);
  for (let i = 0; i < 6; i++) run.record(10, 'A');
  assert.ok(run.finished); assert.equal(run.current, null);
  assert.throws(() => run.record(10, 'A'), /terminé/);
  assert.throws(() => new ChainRun({ ch: CH, keys: KEYS13.slice(0, 5) }), /6 circuits/);
});
test('les manches du pilote automatique, rangées par ChainRun : soumission acceptée par le serveur ; record local relu à l’identique', () => {
  const run = new ChainRun({ ch: CH, keys: KEYS13 });
  runs.forEach((r) => run.record(Math.round(r.time / DT), r.inputs));
  const sub = run.submission(PHYS_VER);
  const v = verifyChain(sub);
  assert.equal(v.ok, true, v.error);
  assert.equal(v.time, sub.time, 'temps annoncé = temps rejoué, au bit près');
  const rec = run.toRecord({ name: 'x', physVer: PHYS_VER, date: 1 });
  assert.equal(rec.chain, true); assert.equal(rec.time, run.time);
  assert.deepEqual(submissionFromRecord(chKey, rec, PHYS_VER), sub);
  assert.equal(submissionFromRecord(chKey, { ...rec, inputs: null }, PHYS_VER), null);
  assert.equal(submissionFromRecord(chKey, { ...rec, chain: undefined }, PHYS_VER), null);
});
test('stockage : un record d’enchaînement peut dépasser 600 s (jusqu’à 1 200), un record de circuit non', () => {
  assert.equal(validRecord({ time: 900, pv: PHYS_VER, chain: true }), true);
  assert.equal(validRecord({ time: 1200, pv: PHYS_VER, chain: true }), true);
  assert.equal(validRecord({ time: 1201, pv: PHYS_VER, chain: true }), false);
  assert.equal(validRecord({ time: 900, pv: PHYS_VER }), false, 'inchangé pour une course seule');
  assert.equal(validRecord({ time: 600, pv: PHYS_VER }), true);
});

console.log('Non-régression');
test('les clés des circuits officiels ne changent pas (tools/builtin-keys.json)', () => {
  const ref = JSON.parse(readFileSync(new URL('./builtin-keys.json', import.meta.url), 'utf8'));
  for (const d of BUILTIN_TRACKS) assert.equal(keyOfDef(d), ref[d.id], 'clé officielle inchangée : ' + d.id);
});
test('une course seule et ses catégories restent vérifiées comme avant (manche 1 en course seule, et dans la catégorie « avec aides »)', () => {
  const bKey = keyOfDef(BUILTIN_TRACKS[chainLegIndexes(CH)[0]]);
  assert.equal(verifyRun({ trackKey: bKey, inputs: legs[0], time: times[0], physVer: PHYS_VER }).ok, true);
  assert.equal(verifyRun({ trackKey: aidedKey(bKey), inputs: legs[0], time: times[0], physVer: PHYS_VER }).ok, true);
});

await finish('Tous les tests de l’épreuve « chapitre d’une traite » passent.');
