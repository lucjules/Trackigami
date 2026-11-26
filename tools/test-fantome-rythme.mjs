// COMPLETE-009 : le rythme du pilote automatique du fantôme (js/pace.js). Le rythme absent reproduit EXACTEMENT l'ancien fantôme or (même pilote, mêmes poses pas à pas) ;
// le mapping ne touche qu'aux réglages existants du pilote (autopilot.js n'est pas modifié) ; plus de rythme = plus vite, moins = plus lent.
// node tools/test-fantome-rythme.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { GhostRunner } from '../js/replay.js';
import { paceOptions, BASE_V_CAP, BASE_STEER_MARGIN, PACE_MIN, PACE_MAX } from '../js/pace.js';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
// Le fantôme or d'AVANT : le pilote à la limite 56 × 0,8, mené pas à pas par sim.step (l'ancien constructeur de GhostRunner, recopié ici).
function oldGold(track, maxSteps = 14000) {
  const sim = new Simulation(track), bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
  sim.start(); bot.reset(sim.phys);
  const out = [];
  for (let k = 0; k < maxSteps; k++) {
    const inp = bot.control(sim.phys);
    if (inp.respawn) sim.rewind();
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    out.push(sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z, sim.phys.speed);
    if (ev && ev.type === 'finish') return { out, time: sim.logic.time };
  }
  return { out, time: null };
}
function ghostRun(track, opts, maxSteps = 14000) {
  const g = new GhostRunner(track, { bot: true, latK: 0.8, ...opts });
  const out = [];
  for (let k = 0; k < maxSteps && !g.done; k++) { g.step(); out.push(g.phys.pos.x, g.phys.pos.y, g.phys.pos.z, g.phys.speed); }
  return { out, time: g.logic.finished ? g.logic.time : null };
}

const SAMPLE = ['eclats', 'tremplins', 'verglas', 'lagon', 'serpent', 'phare', 'aiguillage', 'montecharge'];   // sauts, glace, moto, bateau, deltaplane, mécanismes
test('rythme absent : le fantôme est exactement l\'ancien fantôme or (positions et vitesses, pas à pas)', () => {
  for (const id of SAMPLE) {
    const tr = buildBuiltin(def(id)), a = oldGold(tr), b = ghostRun(buildBuiltin(def(id)), {}), c = ghostRun(buildBuiltin(def(id)), { pace: undefined });
    assert.ok(a.time != null, id + ' : l\'ancien fantôme finit');
    assert.equal(b.time, a.time, id + ' : même temps'); assert.deepEqual(b.out, a.out, id + ' : mêmes poses');
    assert.deepEqual(c.out, a.out, id + ' : pace undefined = absent');
  }
});
test('rythme 1 : mêmes poses que le rythme absent (les réglages numériques du mapping sont ceux du pilote)', () => {
  for (const id of SAMPLE) assert.deepEqual(ghostRun(buildBuiltin(def(id)), { pace: 1 }).out, oldGold(buildBuiltin(def(id))).out, id);
});
test('les constantes du mapping sont les réglages par défaut du pilote (si autopilot.js change, ce test le dit)', () => {
  const tr = buildBuiltin(def('eclats')), plain = new Autopilot(tr.path, { latLimit: 44.8 });
  assert.equal(plain.steerMargin, BASE_STEER_MARGIN);
  assert.equal(plain.vCap, (tr.path.pilot && tr.path.pilot.vCap) || BASE_V_CAP);
  const tr2 = buildBuiltin(def('tremplins'));      // un circuit qui règle sa vitesse visée
  assert.ok(tr2.path.pilot && tr2.path.pilot.vCap && tr2.path.pilot.vCap !== BASE_V_CAP);
  assert.equal(new Autopilot(tr2.path, { latLimit: 44.8 }).vCap, tr2.path.pilot.vCap);
  const o = paceOptions(1, tr2.path, 44.8);
  assert.deepEqual(o, { latLimit: 44.8, steerMargin: BASE_STEER_MARGIN, vCap: tr2.path.pilot.vCap });
});
test('le mapping : plus de rythme = limites plus hautes ; la vitesse visée ne descend que de moitié ; bornes', () => {
  const path = buildBuiltin(def('eclats')).path;
  const a = paceOptions(0.5, path, 44.8), b = paceOptions(1, path, 44.8), c = paceOptions(1.2, path, 44.8);
  assert.ok(a.latLimit < b.latLimit && b.latLimit < c.latLimit); assert.ok(a.steerMargin < b.steerMargin && b.steerMargin < c.steerMargin);
  assert.ok(a.vCap < b.vCap && b.vCap < c.vCap); assert.ok(Math.abs(a.vCap - b.vCap * 0.75) < 1e-9, 'rythme 0,5 : 75 % de la vitesse visée');
  assert.deepEqual(paceOptions(0, path, 44.8), paceOptions(1, path, 44.8), 'valeur absurde : retour au rythme 1');
  assert.deepEqual(paceOptions(99, path, 44.8), paceOptions(PACE_MAX, path, 44.8)); assert.deepEqual(paceOptions(0.01, path, 44.8), paceOptions(PACE_MIN, path, 44.8));
});
test('sur un circuit, plus de rythme finit plus tôt, moins de rythme plus tard (sans réapparition)', () => {
  const t = (p) => { const tr = buildBuiltin(def('eclats')), g = new GhostRunner(tr, { bot: true, latK: 0.8, pace: p }); let resp = 0; const r = g.sim.rewind.bind(g.sim); g.sim.rewind = (...a) => { resp++; return r(...a); }; while (!g.done && g.k < 9000) g.step(); return { time: g.logic.time, resp }; };
  const slow = t(0.7), mid = t(1), fast = t(1.15);
  assert.ok(slow.time > mid.time + 3 && mid.time > fast.time + 1.5, [slow.time, mid.time, fast.time].join(' < '));
  assert.equal(slow.resp + mid.resp + fast.resp, 0);
});

await finish('Tous les tests du rythme du fantôme passent.');
