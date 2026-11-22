// Règles de course (sans rendu) : checkpoints, arrivée, points de réapparition.
import { CELL, LEVEL_H, ROAD_HALF, DT } from './constants.js';
import { PIECES, RING_R, RING_Y, toLocal, sampleLocal, tileCenter, baseY, cpKind, arcParams, localToWorld, areaCentroid } from './pieces.js';
import { dcos, dsin, hypot2 } from './dmath.js';

const L = { lx: 0, lz: 0 };

// Sens de la gravité au point de réapparition posé SUR une pièce : une route retournée (tile.v) se roule au plafond, une route normale au sol ;
// seule une pièce ruban (vrille, looping, mur...) tourne et garde la gravité du moment. Sans cela, un checkpoint pris en l'air au-dessus d'une
// route à l'envers (ou l'inverse) faisait réapparaître la voiture dans un état impossible (gravité contraire à la route sous elle).
export function respawnGs(tile, phys) {
  if (tile.v) return -1;
  return phys.rib ? phys.gSign : 1;
}
const S = {};

export class RaceLogic {
  constructor(track, opts = {}) {
    this.track = track;
    this.laps = Math.max(1, track.laps || 1);
    this.partial = !!opts.partial;   // test depuis le curseur : pas besoin des checkpoints
    this.cps = track.tiles.filter((t) => cpKind(t));
    this.startTile = track.startTile;
    this.reset();
  }

  spawnPoint() {
    const t = this.startTile;
    if (!t) return { x: CELL / 2, y: 0.4, z: CELL / 2, yaw: 0 };
    const c = tileCenter(t);
    // On recule un peu pour que la voiture parte derrière la ligne.
    const back = 4;
    const fx = [0, 1, 0, -1][t.r], fz = [-1, 0, 1, 0][t.r];
    // Gravité inversée au départ : départ posé à l'envers, ou paramètre du niveau « flip0 ».
    return { x: c.x - fx * back, y: baseY(t), z: c.z - fz * back, yaw: -t.r * Math.PI / 2, gs: t.v || this.track.flip0 ? -1 : 1 };
  }

  reset() {
    if (this.ext) this.ext.reset();        // logique du circuit (sim/logic.js) : son état de départ, avant l'instantané du départ
    this.lastGround = null;
    this.collected = new Set();
    this.splits = [];
    this.finished = false;
    this.steps = 0;
    this.lap = 1;
    // Le point de retour initial est l'état de départ COMPLET (startState : véhicule, gravité, vitesse de départ) : un retour avant le premier checkpoint
    // est un « Recommencer » (TECH-013 : la vitesse de départ v0 était perdue, la voiture repartait à l'arrêt).
    this.respawn = { ...startState(this.track, this.spawnPoint()), snap: this._snap() };
    this.inFinish = false;
  }

  // État de course au passage d'un checkpoint : y revenir remet le chrono à ce temps.
  _snap() {
    const s = { steps: this.steps, splits: this.splits.length, collected: [...this.collected], lap: this.lap };
    if (this.ext) s.ext = this.ext.snapshot();      // l'état de la logique du circuit revient avec le checkpoint
    return s;
  }

  // Retour au dernier checkpoint passé (touche R ou réapparition automatique) :
  // le chrono, les temps intermédiaires et le tour reviennent à ce moment-là.
  // keepClock (multijoueur) : le chronomètre NE revient PAS en arrière, il continue de tourner : le retour au
  // checkpoint coûte donc tout le temps perdu (pénalité). Les checkpoints, le tour et les temps intermédiaires
  // reviennent, eux, à l'état du checkpoint.
  rewind({ keepClock = false } = {}) {
    const s = this.respawn.snap;
    // Le dernier sol relevé appartient à l'essai abandonné : il devient le point où l'on revient, avec son chrono (au départ, comme après « Recommencer » :
    // aucun). Sinon une voiture rendue avec sa vitesse (checkpoint aérien), déjà en l'air au relevé suivant, franchissait l'anneau avec un « dernier sol » de
    // l'essai abandonné, au-delà de l'anneau : le retour suivant l'y renvoyait, l'anneau jamais repris, l'arrivée refusée (checkpoint manquant).
    const r = this.respawn;
    this.lastGround = s && s.steps > 0 ? { x: r.x, y: r.y, z: r.z, yaw: r.yaw, gs: r.gs || 1, vehicle: r.vehicle || 'car', vel: r.vel, fwd: r.fwd, steps: s.steps } : null;
    if (s) {
      if (!keepClock) this.steps = s.steps;
      this.splits.length = Math.min(this.splits.length, s.splits);
      this.collected = new Set(s.collected);
      this.lap = s.lap;
      if (this.ext && s.ext) this.ext.restore(s.ext);
    }
    this.finished = false;
    this.inFinish = false;
    return r;
  }

  // Point de réapparition d'un checkpoint aérien : la dernière route roulable traversée
  // (mémorisée par la course), sinon l'anneau lui-même au niveau de sa base.
  // Le point de retour est l'état d'UN instant (TECH-001) : la position du dernier sol, le véhicule ET la vitesse qu'avait la voiture à ce moment-là, avec le
  // chrono de ce moment (snap.steps, voir update). Avant, le véhicule était celui de l'anneau (une plaque entre les deux l'annulait aussitôt : retour en voiture,
  // chute… sans fin) et la voiture repartait à l'arrêt, souvent à quelques mètres du vide qu'elle venait de sauter : saut impossible, chute, retour… sans fin,
  // en voiture comme en deltaplane. Le reste de l'état est celui de tout (re)départ (place : rotation, glisse, turbo à zéro).
  _ringRespawn(tile, phys) {
    if (this.lastGround) { const g = this.lastGround; return { x: g.x, y: g.y, z: g.z, yaw: g.yaw, gs: g.gs || 1, vehicle: g.vehicle, vel: g.vel, fwd: g.fwd }; }
    const c = tileCenter(tile), gs = tile.v ? -1 : 1, y = baseY(tile);
    // 0.9.59 : aucune position au sol n'a encore été relevée (anneau franchi dans le premier quart de seconde : vitesse de départ, anneau juste après le départ). Le
    // centre de l'anneau n'est un point de retour que s'il y a une ROUTE dessous : un anneau flotte le plus souvent au-dessus d'un vide, et la voiture y réapparaissait
    // sur le terrain, hors piste, donc rappelée 0,5 s plus tard au même endroit… sans fin. Sinon (null) le point de retour précédent est gardé.
    if (!this.track.offroad) {
      const s = gs > 0 ? this.track.surfaceAt(c.x, y + 0.5, c.z, S, 3, phys.excl, phys.time) : this.track.ceilingSurfaceAt(c.x, y - 0.5, c.z, S, 3, phys.excl);
      if (s.type !== 'road') return null;
    }
    return { x: c.x, y, z: c.z, yaw: phys.yaw, gs, vehicle: phys.vehicle };
  }

  get time() {
    return this.steps * DT;
  }

  // À appeler après chaque pas physique pendant la course.
  update(phys) {
    if (this.finished) return null;
    this.steps++;
    const p = phys.pos;
    // Dernière position stable au sol (sert à réapparaître avant un checkpoint aérien).
    if (phys.grounded && !phys.rib && phys.surfType === 'road' && this.steps % 30 === 0) {
      // (gs, véhicule et vitesse : ceux de CE point, pas ceux du moment où l'anneau est franchi)
      this.lastGround = { x: p.x, y: p.y, z: p.z, yaw: phys.yaw, gs: phys.gSign, vehicle: phys.vehicle, vel: [phys.vel.x, phys.vel.y, phys.vel.z], fwd: phys.fwdSpeed, steps: this.steps };
    }
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    let event = null;
    let onFinish = false;
    for (const tile of this.track.tilesAt(cx, cz)) {
      if (this.excluded && this.excluded.has(tile)) continue;      // checkpoint ou arrivée d'un groupe caché par la logique : ni pris ni franchi
      const P = PIECES[tile.t];
      const ck = cpKind(tile);
      // 'checkpoint' : pièce checkpoint d'origine ou option cp (portique / anneau) ; 'finish' : arrivée.
      const sp = ck ? 'checkpoint' : P.special;
      if (sp !== 'checkpoint' && sp !== 'finish') continue;
      const h = baseY(tile);
      if (ck === 'ring') {
        // Checkpoint aérien : il faut passer dans l'anneau.
        if (this.collected.has(tile)) continue;
        toLocal(tile, p.x, p.z, L);
        const lz1 = L.lz, lx1 = L.lx;
        toLocal(tile, phys.prev.x, phys.prev.z, L);
        if (lz1 * L.lz > 0 || lz1 === L.lz) continue;
        const k = L.lz / (L.lz - lz1);
        const lx = L.lx + (lx1 - L.lx) * k, y = phys.prev.y + (p.y - phys.prev.y) * k;
        if (hypot2(lx, y - (h + RING_Y)) > RING_R + 0.5) continue;
        // Réapparition : juste avant l'anneau, au sol de la pièce précédente si possible. Le chrono, les temps intermédiaires et
        // les checkpoints reviennent à CE moment-là (l'anneau est à repasser) : sinon le temps passé en l'air serait gagné gratuitement.
        const gl = this.lastGround;
        const snap = this._snap();                       // avant l'anneau : il reste à passer
        snap.pre = true;                                 // (instantané d'AVANT l'évènement : la logique du circuit le garde tel quel, voir Simulation.score)
        if (gl) snap.steps = gl.steps;
        const rr = this._ringRespawn(tile, phys);
        this.collected.add(tile);
        this.splits.push(this.steps);
        // (pas de point sûr près de l'anneau : la voiture reviendra au point de retour précédent, tel quel (véhicule, gravité, vitesse qu'elle y avait) ; l'anneau reste à repasser)
        this.respawn = rr ? { ...rr, grav: phys.gravMul, snap } : { ...this.respawn, snap };
        event = { type: 'checkpoint', index: this.splits.length, steps: this.steps };
        continue;
      }
      // Fenêtre haute : on peut passer un checkpoint en sautant (bosse juste avant).
      if (tile.v ? (p.y > h + 1.5 || p.y < h - LEVEL_H * 1.5) : (p.y < h - 1.5 || p.y > h + LEVEL_H * 1.5)) continue;
      toLocal(tile, p.x, p.z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint || Math.abs(S.d) > ROAD_HALF + 1.5) continue;
      if (sp === 'checkpoint' && !this.collected.has(tile)) {
        this.collected.add(tile);
        this.splits.push(this.steps);
        // Pièce checkpoint d'origine : son centre ; option sur un virage : le milieu de l'arc (le centre n'est pas sur la route).
        let c = tileCenter(tile);
        if (P.kind === 'area' && P.shape) { const g = areaCentroid(P); c = localToWorld(tile, g.x, g.z); }      // (0.9.69 : plaque triangle ou quart de disque : son centre de gravité)
        if (!P.special && P.kind === 'arc') {
          const a = arcParams(P), ang = Math.PI * 1.25;
          c = localToWorld(tile, a.cx + a.R * dcos(ang), a.cz + a.R * dsin(ang));
        }
        let base = -tile.r * Math.PI / 2;
        if (!P.special && P.kind === 'arc') base -= Math.PI / 4;       // cap de la route au milieu de l'arc (nord-est local)
        let yaw = base;
        let da = phys.yaw - base;
        if (!Number.isFinite(da)) da = 0;      // (jamais de boucle infinie sur un angle NaN ou infini)
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > Math.PI / 2) yaw = base + Math.PI;
        this.respawn = { x: c.x, y: h, z: c.z, yaw, vehicle: phys.vehicle, grav: phys.gravMul, gs: respawnGs(tile, phys), snap: this._snap() };
        event = { type: 'checkpoint', index: this.splits.length, steps: this.steps };
      } else if (sp === 'finish') {
        onFinish = true;
        if (this.inFinish) continue;
        if (this.partial || this.collected.size >= this.cps.length) {
          if (this.lap < this.laps && !this.partial) {
            // Tour suivant : les checkpoints sont à reprendre.
            this.lap++;
            this.collected.clear();
            this.splits.push(this.steps);
            // Le passage de la ligne sert aussi de point de retour pour le nouveau tour. 0.9.59 : la ligne se franchit jusqu'à 1,5 m AU-DELÀ du bord de la route (en
            // l'air, par-dessus la bordure) ; le point de retour gardait cette position hors route : la voiture réapparaissait sur le terrain, donc hors piste, donc
            // rappelée au même endroit sans fin. Il est ramené sur la chaussée (sauf si le hors-piste est permis).
            let rx = p.x, rz = p.z;
            const lim = ROAD_HALF - 1.2;
            if (!this.track.offroad && Math.abs(L.lx) > lim) { const w = localToWorld(tile, L.lx > 0 ? lim : -lim, L.lz); rx = w.x; rz = w.z; }
            this.respawn = { x: rx, y: h, z: rz, yaw: phys.yaw, vehicle: phys.vehicle, grav: phys.gravMul, gs: respawnGs(tile, phys), snap: this._snap() };
            event = { type: 'lap', lap: this.lap, laps: this.laps, index: this.splits.length, steps: this.steps };
          } else {
            this.finished = true;
            event = { type: 'finish', steps: this.steps };
          }
        } else {
          event = { type: 'missing', remaining: this.cps.length - this.collected.size };
        }
      }
    }
    this.inFinish = onFinish;
    return event;
  }
}

// « L'état au point de retour » (TRANS-04) : tout ce qu'un (re)départ rend à la voiture, en un seul objet, posé en bloc par placeState.
//   x, y, z, yaw, gs   position, cap, sens de la gravité
//   vehicle, grav      véhicule et gravité (plaque, règle g0, logique du circuit)
//   vel, fwd           vitesse (m/s, repère monde) et vitesse d'avancement : absentes = à l'arrêt. Départ : la vitesse de départ v0 du circuit ;
//                      checkpoint aérien : la vitesse qu'avait la voiture au dernier sol (raceLogic.js : _ringRespawn) ; checkpoint au sol : à l'arrêt.
//   snap               (points de retour seulement) l'état de la course à rétablir : chrono, checkpoints, tour, logique du circuit (RaceLogic._snap)
// Le reste (rotation, glisse, turbo, verre, minuteries de grâce) est remis à zéro par CarPhysics.place, et la plaque sous la voiture est verrouillée si
// elle est celle du véhicule rendu (place, TECH-001).

// État de départ au point sp (par défaut celui du circuit) : véhicule, gravité et vitesse de départ du niveau. Sert à « Recommencer » ET au point de
// retour initial (RaceLogic.reset, Simulation.start), qui sont donc le même départ.
export function startState(track, sp) {
  const st = { ...sp, vehicle: track.veh0 || 'car', grav: (track.g0 || 100) / 100 };
  const v0 = (track.v0 || 0) / 3.6;
  if (v0 > 0) { st.vel = [-dsin(sp.yaw) * v0, 0, -dcos(sp.yaw) * v0]; st.fwd = v0; }
  return st;
}

// Pose la voiture dans l'état r (départ ou point de retour) : le seul endroit où cet état est appliqué.
export function placeState(phys, r) {
  phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1, r.vehicle || 'car');      // (le véhicule avant la lecture du sol : une plaque sous la voiture en dépend, TECH-001)
  phys.gravMul = r.grav || 1;
  if (r.vel) { phys.vel.x = r.vel[0]; phys.vel.y = r.vel[1]; phys.vel.z = r.vel[2]; phys.fwdSpeed = r.fwd || 0; }
}

// Place la voiture au départ avec les paramètres du niveau (véhicule, gravité, vitesse
// de départ). sp : point de départ (par défaut celui du circuit).
export function placeAtStart(phys, logic, sp = logic.spawnPoint()) {
  placeState(phys, startState(logic.track, sp));
}
