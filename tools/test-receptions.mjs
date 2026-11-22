// Réceptions sur ruban (GAME-004, phase 6) : node tools/test-receptions.mjs   (npm test)
//
// Une réception n'est acceptée que là où la voiture touche réellement le ruban (physics/ribbon.js : _tryLandRibbon) : près de la surface, sur la chaussée ET au droit
// du point retenu (écart le long de la route ≤ vitesse × DT + 2 m). Si l'affinage historique ne converge pas (ruban long et très courbe), une recherche fine
// (_closestRibbonU) reprend le point le plus proche. Ce fichier vérifie :
//   1. aucune réception légitime refusée : 50 160 arrivées en vol sur la chaussée des 128 types de rubans (5 points, 3 écarts en travers, 4 vitesses, 5 angles,
//      2 caps), dont les tubes (section courbe). Résultat mesuré AVANT le correctif : 50 026 posées, 134 non posées ; APRÈS : exactement les mêmes, au bit près ;
//   2. la recherche fine converge sur tous les rubans (écart le long de la route < 1 mm au point trouvé, distance = distance vraie à la surface) ;
//   3. le cas GAME-004 (« Épave », double looping) : plus de téléportation, la voiture continue de tomber et elle est rappelée au checkpoint.
import assert from 'node:assert/strict';
import { test, finish, precondition } from './harness.mjs';
import { PIECES, isRibbon } from '../js/pieces.js';
import { Track } from '../js/track.js';
import { CarPhysics } from '../js/physics.js';
import { ribbonOf } from '../js/ribbons.js';
import { frameWorld } from '../js/physics/ribbon.js';
import { DT } from '../js/constants.js';
import { Simulation } from '../js/simulation.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { Autopilot } from '../js/autopilot.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';

const TYPES = Object.keys(PIECES).filter((t) => { try { return isRibbon({ t, x: 0, z: 0, l: 8, r: 0 }); } catch { return false; } });
const IDLE = { steer: 0, throttle: false, brake: false, drift: false };
const ribTile = (t, r) => { const tr = new Track('receptions'); tr.add({ t, x: 0, z: 0, l: 8, r }); return { tr, tile: tr.tiles[0] }; };
// Point de la chaussée à l'écart `lat` du centre, et sa normale (section courbe des tubes : même formule que _cross).
function surfacePoint(F, lat) {
  if (!(F.kc > 1e-4)) return { x: F.px + F.rx * lat, y: F.py + F.ry * lat, z: F.pz + F.rz * lat, nx: F.nx, ny: F.ny, nz: F.nz };
  const phi = F.kc * lat, c = Math.cos(phi), s = Math.sin(phi), X = s / F.kc, Y = (1 - c) / F.kc;
  return { x: F.px + F.rx * X + F.nx * Y, y: F.py + F.ry * X + F.ny * Y, z: F.pz + F.rz * X + F.nz * Y, nx: F.nx * c - F.rx * s, ny: F.ny * c - F.ry * s, nz: F.nz * c - F.rz * s };
}

console.log('Réceptions légitimes : balayage des rubans');
test(`balayage : arrivées en vol sur la chaussée des ${TYPES.length} types de rubans (boucles, vrilles, tubes, murs, virages relevés ; 4 vitesses, 5 angles d'arrivée) : aucune réception refusée, aucune téléportation`, () => {
  let n = 0, landed = 0, worstJump = 0, tubes = 0, tubesLanded = 0;
  const notLanded = [];
  for (const t of TYPES) for (const r of [0, 1]) {
    const { tr, tile } = ribTile(t, r);
    const rib = ribbonOf(tile);
    for (const u of [0.15, 0.3, 0.5, 0.7, 0.85]) for (const lat of [0, -6, 6]) {
      const F = frameWorld(tile, rib, u, {});
      const S = surfacePoint(F, lat);
      if (S.ny < 0.35) continue;                                   // on ne se pose que sur une route face à la gravité
      for (const sp of [5, 15, 30, 50]) for (const ang of [0, 35, -35, 65, -65]) {
        const a = (ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        const vx = (-S.nx * ca + F.tx * sa) * sp, vy = (-S.ny * ca + F.ty * sa) * sp, vz = (-S.nz * ca + F.tz * sa) * sp;
        const P = new CarPhysics(tr);
        P.pos.x = S.x + S.nx * 0.6 - vx * 2 * DT; P.pos.y = S.y + S.ny * 0.6 - vy * 2 * DT; P.pos.z = S.z + S.nz * 0.6 - vz * 2 * DT;
        P.prev.x = P.pos.x; P.prev.y = P.pos.y; P.prev.z = P.pos.z;
        P.vel.x = vx; P.vel.y = vy; P.vel.z = vz;
        P.grounded = false; P.rib = null; P.yaw = Math.atan2(-F.tx, -F.tz); P._updateFwd();
        let ok = false;
        for (let i = 0; i < 90 && !ok; i++) {
          const x = P.pos.x, y = P.pos.y, z = P.pos.z;
          P.clock = i; P.step(IDLE);
          worstJump = Math.max(worstJump, Math.hypot(P.pos.x - x, P.pos.y - y, P.pos.z - z) - P.speed * DT);
          if (P.rib && P.ev.land > 0) ok = true;
          else if (P.rib || P.grounded) break;                      // entrée par une extrémité, ou posée ailleurs
        }
        n++; if (F.kc > 1e-4) { tubes++; if (ok) tubesLanded++; }
        if (ok) landed++; else notLanded.push({ t, u, lat, sp, ang });
      }
    }
  }
  assert.equal(n, 50160, 'nombre d\'arrivées du balayage');
  assert.ok(worstJump < 1, `pire déplacement d'un pas au-delà de vitesse × DT : ${worstJump.toFixed(3)} m (une téléportation se compterait en dizaines de mètres)`);
  // Mesuré avant le correctif : 50 026 posées sur 50 160. Les 134 autres sont des arrivées rasantes (35° ou 65°), au bord de la chaussée (6 m), sur des pièces qui
  // TOURNENT (vrille, transitions vers le mur ou le plafond) : la route se dérobe sous la voiture avant qu'elle la touche. Le correctif ne doit en refuser aucune autre.
  assert.equal(landed, 50026, `${landed} réceptions sur 50 160 (avant le correctif : 50 026)`);
  assert.ok(notLanded.every((c) => /^(tr\d|roll|twist)/.test(c.t) && Math.abs(c.ang) >= 35 && Math.abs(c.lat) === 6), 'les seules arrivées non posées sont rasantes, au bord, sur une pièce qui tourne');
  assert.equal(tubesLanded, tubes, `tubes : ${tubesLanded} réceptions sur ${tubes}`);
});

console.log('Recherche fine du point le plus proche (_closestRibbonU)');
test('recherche fine : sur les 128 types de rubans, pour des points proches de la chaussée, elle converge (écart le long de la route < 1 mm) et trouve la distance vraie', () => {
  const P = new CarPhysics(ribTile('loop', 0).tr);
  let cases = 0, worstAlong = 0, worstErr = 0;
  for (const t of TYPES) {
    const { tile } = ribTile(t, 0);
    const rib = ribbonOf(tile);
    for (let k = 1; k < 40; k++) for (const lat of [0, -6, 6]) for (const off of [-1, 0.5, 1.5]) {
      const F0 = frameWorld(tile, rib, k / 40, {});
      if (F0.kc > 1e-4 && lat) continue;
      const p = { x: F0.px + F0.rx * lat + F0.nx * off, y: F0.py + F0.ry * lat + F0.ny * off, z: F0.pz + F0.rz * lat + F0.nz * off };
      const u = P._closestRibbonU(tile, rib, p);
      const F = frameWorld(tile, rib, u, {});
      const along = (p.x - F.px) * F.tx + (p.y - F.py) * F.ty + (p.z - F.pz) * F.tz;
      const dist = Math.hypot(p.x - F.px, p.y - F.py, p.z - F.pz);
      cases++;
      worstAlong = Math.max(worstAlong, Math.abs(along));
      worstErr = Math.max(worstErr, dist - Math.hypot(lat, off));      // jamais plus loin que le point d'où l'on est parti (il peut trouver plus près : une autre spire)
    }
  }
  assert.ok(cases > 10000, `${cases} points`);
  assert.ok(worstAlong < 1e-3, `écart le long de la route au point trouvé : ${worstAlong} m`);
  assert.ok(worstErr < 1e-3, `distance trouvée au-delà de la distance vraie : ${worstErr} m`);
});

console.log('GAME-004 : la réception d\'« Épave » (double looping)');
// Même modèle de perturbation que tools/test-noyau-defauts.mjs (le pilote automatique du jeu, avec des épisodes de maladresse tirés d'un générateur à graine fixe).
const EPAVE = BUILTIN_TRACKS.find((d) => d.id === 'epave');
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const EPISODES = ['jerk', 'brake', 'cut', 'drift', 'stop', 'uturn'];
function perturbed(seed, steps, onStep) {
  const tr = buildBuiltin(EPAVE), sim = new Simulation(tr), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(tr.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  const r = lcg(seed);
  let ep = '', left = 0;
  for (let i = 0; i < steps; i++) {
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
    sim.step(inp);
    onStep(i, sim, Math.hypot(sim.phys.pos.x - x, sim.phys.pos.y - y, sim.phys.pos.z - z));
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
  }
}
// [graine, pas de l'ancienne téléportation] : avant le correctif, la voiture tombée du haut du double looping y était posée 52 à 55 m plus loin, 22 m plus haut.
for (const [seed, at] of [[349198, 4138], [349322, 2666]]) {
  test(`GAME-004 (corrigé) : graine ${seed} (« Épave ») : au pas ${at}, plus de téléportation sur le double looping ; la voiture continue de tomber et elle est rappelée au checkpoint`, () => {
    let fallen = false, onLoopAt = null, worst = 0, recalled = -1;
    perturbed(seed, at + 400, (i, sim, d) => {
      const P = sim.phys;
      if (!P.ev.loopIn) worst = Math.max(worst, d - P.speed * DT);
      if (i === at - 1) fallen = !P.rib && !P.grounded && P.pos.y < 60;
      if (i === at) onLoopAt = P.rib ? P.rib.tile.t : '';
      if (i > at && recalled < 0 && sim.lost) recalled = i;
    });
    precondition(fallen, 'la voiture tombe sous le double looping juste avant le pas visé (mise en scène de GAME-004)');
    assert.equal(onLoopAt, '', 'elle n\'est pas posée sur le ruban au pas de l\'ancienne téléportation');
    assert.ok(worst < 1, `pire déplacement d'un pas au-delà de vitesse × DT : ${worst.toFixed(2)} m`);
    assert.ok(recalled > at && recalled - at < 120 * 3, `rappelée au checkpoint ${((recalled - at) / 120).toFixed(2)} s plus tard`);
  });
}

await finish('Tous les tests des réceptions sur ruban passent.');
