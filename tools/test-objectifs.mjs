// COMPLETE-012 : objectifs bonus variés. Mesures exactes des statistiques de course (js/runStats.js : vol le plus long, vitesse maximale, temps de section, mini-turbos en section,
// retour au checkpoint), évaluation (career.js : goalMet), textes, objectif réalisable de chacun des 84 circuits (tools/objectifs.mjs), variété, clé b- inchangée par un objectif modifié,
// récompense versée une seule fois, modes de jeu intacts. node tools/test-objectifs.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { GhostRunner } from '../js/replay.js';
import { RunStats, countBetween, inCell } from '../js/runStats.js';
import { GOALS, MODE_GOAL_IDS, goalMet, goalLabel, goalFor, sectionTime, completeGoal, goalDone } from '../js/career.js';
import { sanitizeGoal, sanitizeMode } from '../js/rules.js';
import { mergeProfile } from '../js/cloudsave.js';
import { profile, saveProfile } from '../js/profile.js';
import { DT, CELL, LEVEL_H } from '../js/constants.js';
import { measureRun, GestureDriver } from './goalrun.mjs';
import { checkGoal, loadRecipes } from './objectifs.mjs';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const phys = (o = {}) => ({ ev: { wall: 0, landQ: '', miniTurbo: 0, ring: false, ...(o.ev || {}) }, speed: 0, grounded: true, rib: null, pos: { x: 0, y: 0, z: 0 }, vehicle: 'car', ...o, ev2: undefined });
const run = (st, n, o) => { for (let i = 0; i < n; i++) st.step(phys(o), 0); };

console.log('Statistiques de course : mesures exactes (suites de pas écrites à la main)');
test('vol le plus long : séries de pas sans toucher le sol, un ruban ne compte pas, le plus long l\'emporte, un vol en cours compte', () => {
  const st = new RunStats();
  run(st, 60, { grounded: false });          // 0,5 s
  run(st, 10, { grounded: true });
  run(st, 30, { grounded: false });          // 0,25 s
  assert.equal(st.airBest, 60 * DT);
  run(st, 5, { grounded: true });
  run(st, 90, { grounded: false });          // 0,75 s, en cours
  assert.equal(st.airBest, 90 * DT);
  run(st, 200, { grounded: false, rib: { tile: {} } });      // sur un ruban (mur, looping) : la voiture est tenue, ce n'est pas un vol
  assert.equal(st.airBest, 90 * DT);
});
test('vitesse maximale : le plus grand speed vu (m/s) ; km/h = × 3,6', () => {
  const st = new RunStats(); for (const v of [10, 55.5, 70, 40]) st.step(phys({ speed: v }), 0);
  assert.equal(st.vmax, 70); assert.ok(goalMet({ id: 'speed', v: 252 }, st) && !goalMet({ id: 'speed', v: 252.1 }, st));
});
test('compteurs : chocs (> 4), réceptions parfaites, mini-turbos (avec leur pas), anneaux', () => {
  const st = new RunStats(), P = (ev) => st.step(phys({ ev }), 0);
  st.step(phys({ ev: { wall: 4 } }), 1); st.step(phys({ ev: { wall: 4.1 } }), 2); st.step(phys({ ev: { landQ: 'ok' } }), 3); st.step(phys({ ev: { landQ: 'perfect' } }), 4);
  st.step(phys({ ev: { miniTurbo: 1 } }), 5); st.step(phys({ ev: { miniTurbo: 2 } }), 9); st.step(phys({ ev: { ring: true } }), 10); P({});
  assert.deepEqual({ w: st.wallHits, p: st.perfects, t: st.turbos, r: st.rings, ta: st.turboAt, pa: st.perfectAt }, { w: 1, p: 1, t: 2, r: 1, ta: [5, 9], pa: [4] });
});
test('retour au checkpoint : ce qui est compté après lui (vols, vitesse, turbos, réceptions, anneaux) est annulé ; les chocs et les réapparitions restent comptés', () => {
  const st = new RunStats();
  st.step(phys({ speed: 40, grounded: false, ev: { miniTurbo: 1 } }), 10); run(st, 30, { grounded: false });
  const air0 = st.airBest;
  st.checkpoint();
  st.step(phys({ speed: 80, grounded: false, ev: { miniTurbo: 1, landQ: 'perfect', ring: true, wall: 9 } }), 20); run(st, 300, { grounded: false });
  assert.equal(st.turbos, 2); assert.ok(st.airBest > air0 && st.vmax === 80);
  st.respawn();
  assert.deepEqual({ t: st.turbos, ta: st.turboAt, p: st.perfects, pa: st.perfectAt, r: st.rings, v: st.vmax, w: st.wallHits, resp: st.respawns }, { t: 1, ta: [10], p: 0, pa: [], r: 0, v: 40, w: 1, resp: 1 });
  assert.equal(st.airBest, air0);
  st.step(phys({ grounded: false }), 21);       // le vol d'avant le retour ne se prolonge pas par-dessus le retour
  assert.ok(st.airBest <= air0 + 1e-9 || st.airBest === 1 * DT || st.airBest === air0);
  st.respawn(); assert.equal(st.respawns, 2);
});
test('la voiture traverse une case (objectif via) : x, z de la case, route à l.LEVEL_H + 0,4 m à 4 m près ; mémorisé jusqu\'au retour au checkpoint', () => {
  const g = { id: 'via', x: 3, z: -2, l: 2 }, at = (x, z, y) => phys({ pos: { x, z, y } });
  const st = new RunStats({ goal: g });
  st.step(at(3.5 * CELL, -1.5 * CELL, 2 * LEVEL_H + 0.4 + 6.5), 1); assert.equal(st.via, false, 'une route au-dessus ne compte pas');
  st.step(at(4.6 * CELL, -1.5 * CELL, 2 * LEVEL_H + 0.9), 2); assert.equal(st.via, false, 'à côté de la case');
  st.checkpoint(); st.step(at(3.5 * CELL, -1.5 * CELL, 2 * LEVEL_H + 0.9), 3); assert.equal(st.via, true); assert.ok(inCell({ x: 3 * CELL, z: -2 * CELL, y: 2 * LEVEL_H }, g));
  st.respawn(); assert.equal(st.via, false);
  assert.equal(new RunStats().via, false);
});

console.log('Objectifs : évaluation et textes');
test('goalMet : bornes incluses pour chaque type ; points de passage manquants = non réussi', () => {
  const base = { wallHits: 0, respawns: 0, perfects: 2, turbos: 3, rings: 1, airBest: 2.5, vmax: 250 / 3.6, vehicle: 'car', time: 50, steps: 6000, splits: [1000, 3000], turboAt: [900, 1500, 2900] };
  const m = (g, o = {}) => goalMet(g, { ...base, ...o });
  assert.ok(m({ id: 'air', t: 2.5 }) && !m({ id: 'air', t: 2.51 }) && !m({ id: 'air', t: 1 }, { airBest: 0.99 }));
  assert.ok(m({ id: 'speed', v: 250 }) && !m({ id: 'speed', v: 251 }));
  assert.ok(m({ id: 'section', a: 1, b: 2, t: (3000 - 1000) * DT }) && !m({ id: 'section', a: 1, b: 2, t: (3000 - 1000) * DT - 0.01 }));
  assert.ok(m({ id: 'section', a: 0, b: 1, t: 1000 * DT }), 'du départ au premier point'); assert.ok(m({ id: 'section', a: 2, t: (6000 - 3000) * DT }) && !m({ id: 'section', a: 2, t: (6000 - 3000) * DT - 0.01 }), 'du dernier point à l\'arrivée');
  assert.equal(m({ id: 'section', a: 1, b: 3, t: 999 }), false, 'un point de passage pris deux fois de moins : jamais réussi'); assert.equal(m({ id: 'section', a: 3, t: 999 }), false);
  assert.ok(m({ id: 'turbo', n: 3 }), 'sans section : toute la course, comme avant');
  assert.ok(m({ id: 'turbo', n: 2, a: 1, b: 2 }) && !m({ id: 'turbo', n: 3, a: 1, b: 2 }), 'deux mini-turbos entre les points 1 et 2 (pas 1500 et 2900), pas le troisième (pas 900)');
  assert.ok(m({ id: 'turbo', n: 1, b: 1 }) && !m({ id: 'turbo', n: 2, b: 1 }), 'du départ au point 1 : le pas 900 seulement');
  assert.ok(!m({ id: 'turbo', n: 1, a: 2 }), 'du point 2 à l\'arrivée : aucun (le point 2 est au pas 3000, après 2900)');
  assert.ok(!m({ id: 'air', t: 1 }, { airBest: undefined }) && !m({ id: 'nope' }));
  for (const old of [{ id: 'nowall' }, { id: 'norespawn' }, { id: 'perfect', n: 2 }, { id: 'turbo', n: 3 }, { id: 'rings', n: 1 }, { id: 'vehicle', v: 'car' }, { id: 'under', t: 50 }]) assert.ok(m(old), JSON.stringify(old));
});
test('countBetween : bornes (début exclu, fin incluse) ; sectionTime', () => {
  assert.equal(countBetween([10, 20, 30], [10, 30], 50, 0, 1), 1); assert.equal(countBetween([10, 20, 30], [10, 30], 50, 1, 2), 2); assert.equal(countBetween([10, 20, 30, 50], [10, 30], 50, 2), 1);
  assert.equal(sectionTime({ a: 1, b: 2 }, { splits: [100, 220], steps: 500 }), 120 * DT);
});
test('textes des objectifs (français ; les 3 nouveaux types et les mini-turbos en section)', () => {
  const L = (g) => goalLabel(g);
  assert.equal(L({ id: 'air', t: 2.5 }), 'Un seul vol de 2.5 s sans toucher le sol'); assert.equal(L({ id: 'speed', v: 250 }), 'Atteindre 250 km/h');
  assert.equal(L({ id: 'section', a: 0, b: 1, t: 21.7 }), 'Du départ au point 1 en moins de 21.7 s'); assert.equal(L({ id: 'section', a: 1, b: 2, t: 30 }), 'Du point 1 au point 2 en moins de 30 s'); assert.equal(L({ id: 'section', a: 2, t: 36.6 }), 'Du point 2 à l\'arrivée en moins de 36.6 s');
  assert.equal(L({ id: 'turbo', n: 2, a: 1, b: 2 }), '2 mini-turbos du point 1 au point 2'); assert.equal(L({ id: 'turbo', n: 1, b: 1 }), '1 mini-turbo du départ au point 1'); assert.equal(L({ id: 'turbo', n: 2 }), '2 mini-turbos');
  assert.equal(L({ id: 'nowall' }), 'Finir sans toucher de muret'); assert.equal(L({ id: 'under', t: 50 }), 'Finir en moins de 50 s'); assert.equal(L({ id: 'zzz' }), '');
});

console.log('Mesures sur de vraies courses (même code en direct et dans les outils)');
const episodes = (track, driver) => {          // mesure INDÉPENDANTE : on ne regarde que la physique et la logique, pas RunStats
  const sim = new Simulation(track), bot = driver || new Autopilot(track.path, {}); sim.start(); bot.reset(sim.phys);
  const o = { air: 0, airBest: 0, vmax: 0, turboSteps: [], splits: [], steps: 0 };
  for (let k = 0; k < 40000; k++) {
    const inp = bot.control(sim.phys, sim.logic); inp.steer = Math.round(Math.max(-1, Math.min(1, inp.steer)) * 100) / 100;
    sim.drive(inp);
    const p = sim.phys; o.vmax = Math.max(o.vmax, p.speed);
    if (!p.grounded && !p.rib) { o.air++; o.airBest = Math.max(o.airBest, o.air * DT); } else o.air = 0;
    if (p.ev.miniTurbo) o.turboSteps.push(sim.logic.steps + 1);
    const ev = sim.score(); if (ev && ev.type === 'finish') { o.steps = sim.logic.steps; o.splits = sim.logic.splits.slice(); return o; }
    if (p.ev.sink || p.ev.invalid || sim.groundT > sim.offTrackLimit) throw new Error('réapparition : cette mesure n\'en prévoit pas');
  }
  throw new Error('pas d\'arrivée');
};
test('pilote automatique : vol le plus long, vitesse maximale et points de passage de RunStats = ceux d\'une mesure indépendante, sur 8 circuits', () => {
  for (const id of ['eclats', 'tremplins', 'phare', 'neons', 'apesanteur', 'caldeira', 'courant', 'cadence']) {
    const tr = buildBuiltin(def(id)), want = episodes(tr), got = measureRun(buildBuiltin(def(id))).stats;
    assert.equal(got.airBest, want.airBest, id + ' : vol'); assert.equal(got.vmax, want.vmax, id + ' : vitesse'); assert.deepEqual(got.splits, want.splits, id + ' : points de passage'); assert.equal(got.steps, want.steps, id);
    assert.deepEqual(got.turboAt, want.turboSteps, id + ' : mini-turbos');
  }
});
test('geste du mini-turbo : les mini-turbos pris dans une section sont comptés entre les bons points de passage (mesure indépendante)', () => {
  const R = loadRecipes();
  for (const id of ['metro', 'zenith', 'givre', 'verglas']) {
    const tr = buildBuiltin(def(id)), want = episodes(tr, new GestureDriver(tr, R[id])), got = measureRun(buildBuiltin(def(id)), { driver: new GestureDriver(tr, R[id]) }).stats;
    assert.deepEqual(got.turboAt, want.turboSteps, id); assert.ok(got.turbos >= 2, id + ' : ' + got.turbos);
    for (let a = 0; a <= want.splits.length; a++) for (let b = a + 1; b <= want.splits.length + 1; b++) {
      const bb = b > want.splits.length ? null : b, s0 = a > 0 ? want.splits[a - 1] : 0, s1 = bb == null ? want.steps : want.splits[bb - 1];
      assert.equal(countBetween(got.turboAt, got.splits, got.steps, a, bb), want.turboSteps.filter((k) => k > s0 && k <= s1).length, `${id} ${a}→${bb}`);
    }
  }
});
test('la course mesurée et son rejeu par le moteur du serveur (GhostRunner sur les commandes enregistrées) comptent pareil : tous les champs de RunStats', () => {
  const R = loadRecipes();
  for (const [id, driver] of [['metro', true], ['zenith', true], ['tremplins', false], ['neons', false], ['caldeira', false]]) {
    const tr = buildBuiltin(def(id)), M = measureRun(tr, { driver: driver ? new GestureDriver(tr, R[id]) : null, record: true });
    assert.ok(M.ok && M.stats.respawns === 0, id);
    const g = new GhostRunner(buildBuiltin(def(id)), { inputs: M.inputs }), st = new RunStats();
    let cps = 0;
    while (!g.done) { g.step(); st.step(g.phys, g.logic.steps); if (g.logic.splits.length > cps) { cps = g.logic.splits.length; st.checkpoint(); } }
    const got = st.final(g.phys, g.logic), want = M.stats;
    for (const k of ['airBest', 'vmax', 'wallHits', 'respawns', 'perfects', 'turbos', 'rings', 'steps', 'time', 'vehicle']) assert.equal(got[k], want[k], id + ' ' + k);
    for (const k of ['turboAt', 'perfectAt', 'splits']) assert.deepEqual(got[k], want[k], id + ' ' + k);
  }
});

console.log('Les 84 circuits');
test('chaque circuit a un objectif connu, bien formé, et la course qui le réalise existe (pilote automatique, ou geste du mini-turbo pour les mini-turbos) : sans choc, sans réapparition', () => {
  const rec = loadRecipes(), bad = [];
  for (const d of BUILTIN_TRACKS) {
    const g = d.goal;
    assert.ok(GOALS[g.id], d.id); assert.ok(goalLabel(g).length > 5, d.id);
    if (['perfect', 'turbo', 'rings'].includes(g.id)) assert.ok(g.n >= 1, d.id);
    if (g.id === 'turbo' && (g.a != null || g.b != null)) assert.ok(g.n >= 1 && (g.a || 0) >= 0 && (g.b == null || g.b > (g.a || 0)), d.id + ' : section');
    if (g.id === 'air') assert.ok(g.t >= 1 && g.t <= 15, d.id); if (g.id === 'speed') assert.ok(g.v >= 100 && g.v <= 400, d.id);
    if (g.id === 'section') { assert.ok(g.t > 5 && (g.a || 0) >= 0 && (g.b == null || g.b > (g.a || 0)), d.id); }
    if (g.id === 'turbo') assert.ok(rec[d.id], d.id + ' : un objectif de mini-turbos a sa recette (tools/objectifs-recettes.json)');
    const { ok, R } = checkGoal(d, rec);
    if (!ok) bad.push(`${d.id} : ${goalLabel(g)} (${R.ok ? R.time.toFixed(1) + ' s' : 'pas d\'arrivée'})`);
    if (g.id === 'section') assert.ok(R.ok && sectionTime(g, R.stats) < g.t + 1e-9 && g.t < sectionTime(g, R.stats) * 1.25, d.id + ' : seuil à 25 % de la course du pilote au plus');
    if (g.id === 'air') assert.ok(R.stats.airBest < g.t * 2 + 1, d.id + ' : seuil proche de ce que fait le pilote'); if (g.id === 'speed') assert.ok(R.stats.vmax * 3.6 < g.v * 1.2, d.id);
  }
  assert.deepEqual(bad, []);
});
test('variété : au moins sept types d\'objectifs, chacun utilisé au moins quatre fois ; « sans réapparition » et « sans muret » ne dominent plus (29 sur 72 avant)', () => {
  const n = {}; for (const d of BUILTIN_TRACKS) n[d.goal.id] = (n[d.goal.id] || 0) + 1;
  assert.ok(Object.keys(n).length >= 8, JSON.stringify(n));
  for (const k of ['under', 'speed', 'air', 'section', 'turbo']) assert.ok(n[k] >= 4, k + ' : ' + n[k]);
  assert.ok(n.norespawn <= 8 && n.nowall <= 8, JSON.stringify(n));
  const mt = BUILTIN_TRACKS.filter((d) => d.goal.id === 'turbo' && (d.goal.a != null || d.goal.b != null)).length; assert.ok(mt >= 8, 'mini-turbos en section : ' + mt);
  console.log('       ' + JSON.stringify(n));
});
test('un objectif lié à ce que le circuit enseigne : la vitesse aux circuits de vitesse, les vols aux circuits à sauts, les mini-turbos aux circuits techniques', () => {
  for (const d of BUILTIN_TRACKS) {
    if (d.goal.id === 'speed') assert.ok(['speedway', 'rollercoaster', 'sprint'].includes(d.profil), d.id);
    if (d.goal.id === 'air') assert.ok(['rollercoaster', 'acrobatique'].includes(d.profil), d.id);
    if (d.goal.id === 'turbo') assert.ok(d.profil === 'technique', d.id);
  }
});

console.log('Clé, profils, modes');
test('modifier le goal d\'un circuit ne change PAS sa clé b- (le test qui décide du périmètre) : 84 circuits × 6 objectifs', () => {
  const key = (d) => `b-${d.id}-${hashString(buildBuiltin(d).encode())}`;
  for (const d of BUILTIN_TRACKS) {
    const before = key(d);
    for (const g of [{ id: 'nowall' }, { id: 'air', t: 9 }, { id: 'speed', v: 999 }, { id: 'section', a: 1, b: 2, t: 1 }, { id: 'turbo', n: 5, a: 1, b: 2 }, undefined]) assert.equal(key({ ...d, goal: g }), before, d.id + ' ' + JSON.stringify(g));
  }
});
test('un objectif réussi ne se repaie jamais : ni en le refaisant, ni après un changement d\'objectif du circuit, ni après la fusion de deux appareils (union)', () => {
  const p = profile(); p.goals = {}; p.coins = 0; saveProfile();
  const key = 'b-eclats-1ocqc5y#goal';
  assert.equal(completeGoal(key), 50); assert.equal(completeGoal(key), 0); assert.equal(profile().coins, 50);
  const d = def('eclats'), old = d.goal; d.goal = { id: 'air', t: 1.5 };
  try { assert.equal(goalDone(key), true, 'l\'étoile gagnée avec l\'ancien objectif reste gagnée'); assert.equal(completeGoal(key), 0); assert.equal(profile().coins, 50); } finally { d.goal = old; }
  const a = { ...profile(), goals: { [key]: 1 } }, b = { ...profile(), goals: { 'b-canyon-ymt2z#goal': 1 } };
  const m = mergeProfile(a, b); assert.deepEqual(Object.keys(m.goals).sort(), ['b-canyon-ymt2z#goal', key].sort());
  assert.deepEqual(mergeProfile(m, a).goals, m.goals); assert.deepEqual(mergeProfile(a, m).goals, m.goals);
  p.goals = {}; p.coins = 0; saveProfile();
});
test('profil existant : goalFor garde l\'objectif écrit dans le circuit ; un circuit sans objectif reprend le cycle d\'avant', () => {
  assert.deepEqual(goalFor(def('canyon'), 1), def('canyon').goal);
  assert.deepEqual([0, 1, 2, 3].map((i) => goalFor({}, i).id), ['nowall', 'norespawn', 'turbo', 'nowall']);
});
test('modes de jeu : les objectifs propres aux circuits n\'y sont pas offerts ni acceptés (code de mode, éditeur de mode) ; les anciens restent', () => {
  assert.deepEqual(MODE_GOAL_IDS.sort(), ['norespawn', 'nowall', 'perfect', 'rings', 'turbo', 'under', 'vehicle']);
  for (const id of ['air', 'speed', 'section']) assert.equal(sanitizeGoal({ id, t: 3, v: 200 }), null, id);
  assert.deepEqual(sanitizeGoal({ id: 'turbo', n: 2, a: 1, b: 2 }), { id: 'turbo', n: 2 }, 'un mode ne connaît pas les sections');
  assert.equal(sanitizeMode({ name: 'x', goal: { id: 'air', t: 3 } }).goal, null);
  assert.deepEqual(sanitizeGoal({ id: 'under', t: 40 }), { id: 'under', t: 40 });
});

await finish('Tous les tests des objectifs passent.');
