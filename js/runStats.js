// Statistiques d'une course, lues par les objectifs bonus (career.js : goalMet), l'Académie, les modes, l'expérience et le coach.
// Module pur, sans DOM ni rendu : la course en direct (race.js) et les outils qui valident les objectifs (tools/objectifs.mjs, tests) comptent
// avec le MÊME code, pas avec deux copies qui divergeraient.
//
// Champs publics (ce que lit goalMet, avec `vehicle`, `time` et `splits` ajoutés à l'arrivée par final()) :
//   wallHits, respawns, perfects, turbos, rings   compteurs (déjà là avant COMPLETE-012)
//   shocks       chocs contre un obstacle animé ou un bumper (COMPLETE-008) : un seul compte tant que les contacts se suivent à moins d'une demi-seconde ; jamais défaits par un retour au checkpoint
//   airBest      le plus long vol sans toucher le sol (s) ; en cours de vol, le vol en cours compte
//   vmax         vitesse maximale (m/s)
//   turboAt      pas de course (logic.steps) de chaque mini-turbo : « n mini-turbos entre deux points de passage »
//   perfectAt    idem pour les réceptions parfaites
//   via          vrai quand la voiture a traversé la case visée par l'objectif « via » (circuit forcé : la bifurcation difficile)
// Un retour au dernier checkpoint annule ce qui a été compté après lui (comme avant pour les réceptions, turbos et anneaux) : la voiture revient au point de passage,
// pas au vol, ni à la vitesse, ni à la case d'après. Les chocs (wallHits) et les réapparitions, eux, restent comptés.
import { DT, CELL, LEVEL_H } from './constants.js';

const SHOCK_GAP = Math.round(0.5 / DT);

export class RunStats {
  #snap;
  #air = 0;
  #shockAt = -1e9;
  #via;
  constructor({ goal = null } = {}) {
    this.wallHits = 0; this.respawns = 0; this.perfects = 0; this.turbos = 0; this.rings = 0; this.shocks = 0;
    this.airBest = 0; this.vmax = 0; this.turboAt = []; this.perfectAt = []; this.via = false;
    this.#via = goal && goal.id === 'via' ? goal : null;
    this.#snap = this.#take();
  }

  #take() { return { perfects: this.perfects, turbos: this.turbos, rings: this.rings, airBest: this.airBest, vmax: this.vmax, nT: this.turboAt.length, nP: this.perfectAt.length, via: this.via }; }

  // Après un pas de physique (sim.drive), pendant la course seulement : phys (état, dont phys.ev) et steps = le numéro de ce pas (le chrono, pas compris, + 1 : il avance dans sim.score),
  // la même mesure que les temps de passage (logic.splits) : un mini-turbo du pas où l'on passe le checkpoint compte dans la section qui finit là.
  step(phys, steps) {
    const ev = phys.ev;
    if (ev.wall > 4) this.wallHits++;
    if (ev.shock > 0) { if (steps - this.#shockAt > SHOCK_GAP) this.shocks++; this.#shockAt = steps; }      // (steps : le pas de course ; SHOCK_GAP : une demi-seconde)
    if (ev.landQ === 'perfect') { this.perfects++; this.perfectAt.push(steps); }
    if (ev.miniTurbo) { this.turbos++; this.turboAt.push(steps); }
    if (ev.ring) this.rings++;
    if (phys.speed > this.vmax) this.vmax = phys.speed;
    // En l'air : ni au sol ni sur un ruban (mur, looping, tube : la voiture y est tenue par la route).
    if (!phys.grounded && !phys.rib) { this.#air++; if (this.#air * DT > this.airBest) this.airBest = this.#air * DT; } else this.#air = 0;      // (des pas entiers : pas de dérive d'addition)
    if (this.#via && !this.via && inCell(phys.pos, this.#via)) this.via = true;
  }

  // Point de passage (checkpoint ou ligne d'un tour) : ce qui est compté jusqu'ici est acquis.
  checkpoint() { this.#snap = this.#take(); }

  // Retour au dernier checkpoint (touche R ou réapparition automatique).
  respawn() {
    this.respawns++;
    const s = this.#snap;
    this.perfects = s.perfects; this.turbos = s.turbos; this.rings = s.rings; this.airBest = s.airBest; this.vmax = s.vmax; this.via = s.via;
    this.turboAt.length = s.nT; this.perfectAt.length = s.nP;
    this.#air = 0;
  }

  // Ce que reçoit goalMet à l'arrivée : les compteurs + le véhicule, le chrono (s), le pas d'arrivée et les pas de passage (checkpoints puis passages de ligne, dans l'ordre).
  final(phys, logic) {
    return { ...this, vehicle: phys.vehicle, time: logic.time, steps: logic.steps, splits: logic.splits.slice() };
  }
}

// La voiture est-elle dans la case (x, z, l) du circuit (celle d'une pièce : voir Track.tilesAt) ? Case de CELL m de côté, route à l.LEVEL_H + 0,4 m ; la voiture doit être à moins de 4 m
// de la route (moins d'un niveau : une route qui passe au-dessus ou en dessous ne compte pas).
export function inCell(pos, c) {
  const h = CELL / 2;
  return Math.abs(pos.x - (c.x + 0.5) * CELL) <= h && Math.abs(pos.z - (c.z + 0.5) * CELL) <= h && Math.abs(pos.y - (c.l * LEVEL_H + 0.4)) <= 4;
}

// Nombre d'évènements (pas de course `at`) entre deux points de passage : a et b sont des numéros de point de passage (0 = le départ, k = le k-ième temps de passage,
// b absent = l'arrivée). Les bornes sont incluses au pas près.
export function countBetween(at, splitSteps, finishSteps, a = 0, b = null) {
  const s0 = a > 0 ? splitSteps[a - 1] : 0;
  const s1 = b == null ? finishSteps : splitSteps[b - 1];
  if (s0 == null || s1 == null) return 0;
  return at.filter((k) => k > s0 && k <= s1).length;
}
