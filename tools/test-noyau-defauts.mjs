// Défauts CONNUS du noyau de simulation (phase « filet de sécurité », audit docs/audit/AUDIT_COMPLET.md) : node tools/test-noyau-defauts.mjs   (npm test)
//
// Ce fichier ne corrige rien. Chaque défaut listé est reproduit dans un `bugConnu(id, …)` (tools/harness.mjs) qui écrit ce que le jeu DEVRAIT faire : le test réussit tant que le
// défaut existe, et échoue dès qu'il est corrigé (« retire bugConnu et garde ce test comme test de régression »). À côté, des tests ordinaires (préconditions, contrôles) prouvent
// que la mise en scène est bonne : sans eux, un test cassé passerait pour un défaut présent.
//   TECH-001  retour au checkpoint sur / après une plaque de transformation : le véhicule redevient une voiture (boucle de réapparitions sans fin)
//   TECH-013  vitesse de départ (v0) perdue au retour au point de départ
//   TECH-014  multijoueur : règle de logique « à T s » jamais rejouée après un retour avec chrono conservé (keepClock)
//   GAME-004  téléportation (> 3 m en un pas) à la réception sur un ruban (double looping d'« Épave Engloutie »)
// Corriger l'un d'eux change PHYS_VER (fermeture de js/verify.js) : voir docs/ARCHITECTURE.md, « Changer la physique ».
import assert from 'node:assert/strict';
import { test, finish, bugConnu, precondition } from './harness.mjs';
import { Simulation } from '../js/simulation.js';
import { GhostRunner, InputRecorder, quantSteer } from '../js/replay.js';
import { Autopilot } from '../js/autopilot.js';
import { scriptTrack } from '../js/track.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';

const GAS = { steer: 0, throttle: true, brake: false, drift: false };
const IDLE = { steer: 0, throttle: false, brake: false, drift: false };

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-001
console.log('TECH-001 : retour au checkpoint et plaques de transformation');

// Gaz à fond jusqu'au premier checkpoint ; renvoie la simulation à cet instant.
function untilCheckpoint(track, maxSteps = 120 * 20) {
  const sim = new Simulation(track);
  sim.start();
  for (let i = 0; i < maxSteps; i++) {
    const ev = sim.step(GAS);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'checkpoint') return { sim, steps: i + 1 };
  }
  throw new Error('aucun checkpoint atteint');
}

const AIR = 'start S2 S.e GC2 S3 finish';       // plaque deltaplane, vide de 2 cases, checkpoint aérien (anneau), puis la route et l'arrivée
test('TECH-001 mise en scène : le checkpoint aérien est franchi en deltaplane et son point de retour mémorise bien le deltaplane', () => {
  const { sim } = untilCheckpoint(scriptTrack('g', AIR));
  assert.equal(sim.phys.vehicle, 'glider');
  assert.equal(sim.logic.respawn.vehicle, 'glider', 'le point de retour garde le véhicule du moment');
  assert.ok(sim.logic.respawn.snap.pre, 'checkpoint aérien : instantané d\'avant l\'anneau');
});
test('TECH-001 contrôle : sans plaque, le retour au checkpoint garde la voiture (la sonde ne confond pas tout)', () => {
  const sim = new Simulation(scriptTrack('c', 'start S2 C S3 finish'));
  sim.start();
  for (let i = 0; i < 120 * 6 && sim.logic.splits.length < 1; i++) sim.step(GAS);
  precondition(sim.logic.splits.length === 1, 'le checkpoint est pris');
  sim.rewind();
  for (let i = 0; i < 3; i++) sim.step(GAS);
  assert.equal(sim.phys.vehicle, 'car');
});
bugConnu('TECH-001', () => {
  const { sim } = untilCheckpoint(scriptTrack('g', AIR));
  sim.rewind();
  assert.equal(sim.phys.vehicle, 'glider', 'juste après le retour');
  for (let i = 0; i < 3; i++) sim.step(GAS);
  assert.equal(sim.phys.vehicle, 'glider', 'après 3 pas : la plaque ne doit pas retransformer le deltaplane en voiture');
}, 'checkpoint aérien (plaque deltaplane puis anneau) : après retour et 3 pas, le véhicule est celui du checkpoint');
bugConnu('TECH-001', () => {
  const { sim } = untilCheckpoint(scriptTrack('g', AIR));
  sim.rewind();
  let respawns = 0, finished = false;
  for (let i = 0; i < 120 * 60 && !finished; i++) {
    const ev = sim.step(GAS);
    if (sim.lost) { sim.rewind(); respawns++; }
    if (ev && ev.type === 'finish') finished = true;
  }
  assert.ok(respawns <= 3, `${respawns} réapparitions en 60 s de gaz à fond : chute en boucle (la voiture revient en voiture à chaque fois)`);
}, 'pas de chute en boucle après le retour (60 s, gaz à fond ; l\'audit mesure 43 à 45 réapparitions, jamais d\'arrivée)');

// Checkpoint posé SUR une plaque (option cp d'une pièce de route ; la pièce est modifiée avant la création de la simulation, qui lit la liste des checkpoints).
const PLATES = [['moto', 'o', 'moto'], ['bateau', 'n', 'boat'], ['deltaplane', 'e', 'glider']];
const plateTrack = (code, surf) => {
  const tr = scriptTrack('p', `start S2 S.${code} S3 finish`);
  const plate = tr.tiles.find((t) => t.s === surf);
  precondition(!!plate, `la plaque ${surf} existe`);
  plate.cp = 1;
  return tr;
};
for (const [label, code, veh] of PLATES) {
  const surf = { moto: 'moto', boat: 'boat', glider: 'glider' }[veh];
  test(`TECH-001 mise en scène : checkpoint sur la plaque ${label} : pris au sol avec le véhicule ${veh}`, () => {
    const { sim } = untilCheckpoint(plateTrack(code, surf));
    assert.equal(sim.phys.vehicle, veh);
    assert.equal(sim.logic.respawn.vehicle, veh);
    assert.ok(!sim.logic.respawn.snap.pre, 'checkpoint au sol, pas un anneau');
    assert.equal(sim.phys.surfMod, surf, 'la voiture est bien sur la plaque');
  });
  bugConnu('TECH-001', () => {
    const { sim } = untilCheckpoint(plateTrack(code, surf));
    sim.rewind();
    for (let i = 0; i < 3; i++) sim.step(GAS);
    assert.equal(sim.phys.vehicle, veh, `après retour et 3 pas, le véhicule doit être celui du checkpoint (${veh})`);
  }, `checkpoint au sol sur la plaque ${label} : après retour et 3 pas, le véhicule est celui du checkpoint`);
}

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-013
console.log('TECH-013 : vitesse de départ (v0) et retour au départ');
const v0Track = (kmh) => { const tr = scriptTrack('v', 'start S6 finish'); tr.v0 = kmh; return tr; };
const speed = (sim) => Math.hypot(sim.phys.vel.x, sim.phys.vel.z);
test('TECH-013 contrôle : v0 = 200 → 55,6 m/s au départ et après « Recommencer » (start) ; sans v0, à l\'arrêt', () => {
  const sim = new Simulation(v0Track(200));
  sim.start();
  assert.ok(Math.abs(speed(sim) - 200 / 3.6) < 1e-9, `départ : ${speed(sim)}`);
  for (let i = 0; i < 30; i++) sim.step(GAS);
  assert.equal(sim.logic.steps, 30);
  sim.start();
  assert.ok(Math.abs(speed(sim) - 200 / 3.6) < 1e-9, 'recommencer redonne la vitesse de départ');
  const none = new Simulation(v0Track(0)); none.start();
  assert.equal(speed(none), 0);
});
bugConnu('TECH-013', () => {
  const sim = new Simulation(v0Track(200));
  sim.start();
  for (let i = 0; i < 30; i++) sim.step(GAS);
  sim.rewind();
  assert.equal(sim.logic.steps, 0, 'le chrono revient à zéro');
  assert.ok(Math.abs(speed(sim) - 200 / 3.6) < 0.01, `après le retour au point de départ la vitesse devrait être celle du départ (55,6 m/s), elle est de ${speed(sim).toFixed(2)} m/s`);
}, 'v0 = 200, 30 pas, sim.rewind() : la vitesse de départ est rétablie');

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-014
console.log('TECH-014 : logique « temps » et retour avec chrono conservé (keepClock)');
// Une route d'un seul tenant dont les cases 3 et 4 forment le groupe 2 (« Pont »), caché au départ ; la règle le montre à 6 s (720 pas). Aucun checkpoint : le retour ramène au départ.
const bridge = () => {
  const tr = scriptTrack('d', 'start S3 S3 S3 S3 finish');
  tr.tiles[3].g = 2; tr.tiles[4].g = 2;
  tr.setGroupName(2, 'Pont');
  tr.setLogic({ off: [2], rules: [{ on: ['time', 720], do: [['show', 2]] }] });
  return tr;
};
const hidden = (sim) => sim.lgc.state.hidden.has(2);
const idle = (sim, n) => { for (let i = 0; i < n; i++) sim.step(IDLE); };
test('TECH-014 contrôle : le groupe est caché au départ, montré à 6 s ; en solo (chrono qui revient) un retour à 8 s le rejoue : montré 6,7 s plus tard', () => {
  const sim = new Simulation(bridge());
  sim.start();
  assert.ok(hidden(sim), 'caché au départ');
  idle(sim, 719); assert.ok(hidden(sim), 'toujours caché juste avant 6 s');
  idle(sim, 1); assert.ok(!hidden(sim), 'montré à 6 s');
  idle(sim, 240);
  assert.equal(sim.logic.steps, 960, '8 s');
  sim.rewind();                                       // solo : le chrono revient à 0, l'état de la logique aussi
  assert.equal(sim.logic.steps, 0);
  assert.ok(hidden(sim), 'caché de nouveau');
  idle(sim, 800);
  assert.ok(!hidden(sim), 'la règle « à 6 s » se redéclenche (solo)');
});
bugConnu('TECH-014', () => {
  const sim = new Simulation(bridge());
  sim.start();
  idle(sim, 960);                                    // 8 s : la règle a eu lieu à 6 s
  precondition(!hidden(sim), 'le groupe est montré à 8 s');
  sim.rewind({ keepClock: true });                   // multijoueur : le chrono ne recule pas, l'état de la logique revient à celui du départ
  assert.equal(sim.logic.steps, 960, 'chrono conservé');
  idle(sim, 600);                                    // 5 s plus tard : chrono 13 s
  assert.equal(sim.logic.steps, 1560);
  assert.ok(!hidden(sim), 'à 13 s le groupe devrait être montré (la règle « à 6 s » est passée) ; il reste caché : le pont ne revient jamais');
}, 'groupe caché au départ, règle « à 6 s : montrer », retour avec keepClock à 8 s : le groupe est montré');

// ---------------------------------------------------------------------------------------------------------------------------------- GAME-004
console.log('GAME-004 : réception sur un ruban (« Épave Engloutie », double looping) : saut de position en un pas');
// Les sondes d'origine de l'audit (« pilote automatique perturbé, graine 348437 ») sont PERDUES : le modèle de perturbation exact ne peut pas être reconstitué. Ce fichier en fournit un
// autre, déterministe (générateur congruentiel à graine fixe) : le pilote automatique du jeu, mais avec des épisodes de maladresse (coups de volant, freinages, dérapages, arrêts, demi-tours).
// Il retrouve le MÊME phénomène (réception à 52-55 m de l'endroit de la chute, évènement « land », sur « Épave »), pas la même trajectoire : la graine 348437 de l'audit n'est PAS
// retrouvée avec ce modèle (voir le contrôle ci-dessous et le rapport de la phase).
const EPAVE = BUILTIN_TRACKS.find((d) => d.id === 'epave');
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const EPISODES = ['jerk', 'brake', 'cut', 'drift', 'stop', 'uturn'];
const JUMP_M = 3;            // un pas de 1/120 s ne déplace jamais la voiture de plus de 1 m (≈ 100 m/s) : au-delà de 3 m, c'est une téléportation

// Une course perturbée sur « Épave » ; s'arrête à la première téléportation si stopAtJump. L'entrée en ruban (évènement loopIn) recale légèrement la voiture (3,0 à 3,2 m observés à basse
// vitesse) : ce n'est pas la réception de GAME-004, elle est écartée du décompte et signalée à part.
function perturbedRun(seed, { maxSeconds = 130, stopAtJump = false, trace = false } = {}) {
  const tr = buildBuiltin(EPAVE), sim = new Simulation(tr), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(tr.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  const r = lcg(seed);
  let ep = '', left = 0;
  const jumps = [], snaps = [], path = [];
  for (let i = 0; i < 120 * maxSeconds; i++) {
    let inp = bot.control(sim.phys);
    if (left <= 0 && r() < 0.004) { ep = EPISODES[Math.floor(r() * EPISODES.length)]; left = 20 + Math.floor(r() * 150); }
    if (left > 0) {
      left--;
      if (ep === 'jerk') inp = { ...inp, steer: r() < 0.5 ? -1 : 1 };
      else if (ep === 'brake') inp = { ...inp, throttle: false, brake: true };
      else if (ep === 'cut') inp = { ...inp, throttle: false, brake: false };
      else if (ep === 'drift') inp = { ...inp, brake: true, steer: inp.steer < 0 ? -1 : 1 };
      else if (ep === 'stop') inp = { steer: 0, throttle: false, brake: true };
      else inp = { steer: 1, throttle: true, brake: false };
    }
    inp = { steer: quantSteer(inp.steer), throttle: !!inp.throttle, brake: !!inp.brake, drift: false };
    rec.push(inp, false);
    const x = sim.phys.pos.x, y = sim.phys.pos.y, z = sim.phys.pos.z;
    const ev = sim.step(inp);
    const d = Math.hypot(sim.phys.pos.x - x, sim.phys.pos.y - y, sim.phys.pos.z - z);
    if (d > JUMP_M) {
      const names = Object.keys(sim.phys.ev).filter((k) => sim.phys.ev[k]).join('+');
      (sim.phys.ev.loopIn ? snaps : jumps).push({ step: i, metres: +d.toFixed(1), events: names, from: [x, y, z].map((v) => +v.toFixed(1)), to: [sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z].map((v) => +v.toFixed(1)) });
      if (stopAtJump && !sim.phys.ev.loopIn) { if (trace) path.push([sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z]); break; }
    }
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (trace) path.push([sim.phys.pos.x, sim.phys.pos.y, sim.phys.pos.z]);
    if (ev && ev.type === 'finish') break;
  }
  return { jumps, snaps, steps: rec.length, inputs: rec.encode(), trace: path };
}
const FUZZ_FROM = 349100, FUZZ_COUNT = 144, FUZZ_BUDGET_MS = 90000;
const KNOWN_SEEDS = [349198, 349322];            // deux graines de ce modèle qui téléportent la voiture (55,4 m au pas 4138 ; 52,4 m au pas 2666)

test('GAME-004 contrôle : la graine d\'origine de l\'audit (348437) ne téléporte pas avec ce modèle de perturbation (le cas d\'origine n\'est pas retrouvé tel quel) ; la course est valide', () => {
  const o = perturbedRun(348437);
  assert.deepEqual(o.jumps, []);
  assert.ok(o.steps > 2000, `${o.steps} pas joués`);
});
test('GAME-004 contrôle : la trajectoire perturbée (téléportation comprise) est rejouée à l\'identique, pas par pas, par le chemin du serveur (GhostRunner) : le serveur verrait la même chose', () => {
  const o = perturbedRun(KNOWN_SEEDS[0], { stopAtJump: true, trace: true });
  const g = new GhostRunner(buildBuiltin(EPAVE), { inputs: o.inputs });
  for (let k = 0; k < o.steps; k++) {
    g.step();
    const p = g.phys.pos, t = o.trace[k];
    if (p.x !== t[0] || p.y !== t[1] || p.z !== t[2]) assert.fail(`pas ${k} : le rejeu est en (${p.x}, ${p.y}, ${p.z}), la course en (${t.join(', ')})`);
  }
  assert.ok(o.steps > 1000, `${o.steps} pas comparés, un à un, au bit près`);
});
bugConnu('GAME-004', () => {
  for (const seed of KNOWN_SEEDS) {
    const o = perturbedRun(seed, { stopAtJump: true });
    assert.deepEqual(o.jumps, [], `graine ${seed} : téléportation de la voiture en un seul pas`);
  }
}, 'graines 349198 et 349322 sur « Épave » : aucun saut de position > 3 m en un pas');
bugConnu('GAME-004', () => {
  const t0 = Date.now();
  let done = 0, found = null;
  for (let s = FUZZ_FROM; s < FUZZ_FROM + FUZZ_COUNT && !found; s++) {
    if (Date.now() - t0 > FUZZ_BUDGET_MS) throw new Error(`budget de temps du fuzz dépassé après ${done} courses sur ${FUZZ_COUNT} : le résultat n'est pas concluant (ce n'est pas « défaut corrigé »)`);
    const o = perturbedRun(s, { stopAtJump: true });
    done++;
    if (o.jumps.length) found = { seed: s, ...o.jumps[0] };
  }
  assert.equal(found, null, `fuzz de ${FUZZ_COUNT} courses perturbées (graines ${FUZZ_FROM} à ${FUZZ_FROM + FUZZ_COUNT - 1}) : ${found ? `saut de ${found.metres} m en un pas (graine ${found.seed}, pas ${found.step}, évènements ${found.events}, de ${found.from} à ${found.to})` : ''}`);
}, `fuzz de ${FUZZ_COUNT} courses perturbées (graines ${FUZZ_FROM} à ${FUZZ_FROM + FUZZ_COUNT - 1}) : aucun saut de position > 3 m en un pas`);

await finish('Les défauts connus du noyau sont tous reproduits (ou corrigés : voir les échecs ci-dessus).');
