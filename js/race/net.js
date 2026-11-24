// Multijoueur dans la course : voitures des autres joueurs et envoi de l'état local.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { RemoteCar } from '../remoteCar.js';
import { F_BOOST, F_GROUNDED, SEND_EVERY_STEPS } from '../net/snapshot.js';
import { DT } from '../constants.js';
import { checkpointProgress, legFraction } from '../net/progress.js';
import { PIECES, tileCenter } from '../pieces.js';
import { PRIO } from '../hudMessages.js';
import { DEFAULT_LOADOUT } from '../cosmetics.js';
import { softCollide, presentState, PROTECT_S } from '../net/collide.js';

const LATE_MS = 1000, LATE_COUNTDOWN_MS = 3000;     // TECH-089 (d) : moins de 1 s avant le départ prévu quand la course est prête : décompte complet de 3 s
const GONE_MS = 1000;        // après le retrait de sa voiture (retour au salon), les paquets d'avant d'un joueur sont ignorés pendant 1 s (ceux qui étaient en route)
export const netMethods = {
  // ---- Multijoueur : voitures des autres joueurs (RemoteCar), alimentées par les paquets WebRTC ----------------------------
  // TECH-009 (TRANS-06) : une voiture distante naît à l'arrivée d'un membre en course (évènement « members ») ou à son premier paquet, et renaît après un départ suivi
  // d'un retour (même identifiant). Avant, elles étaient créées une seule fois d'après room.list au départ : un arrivant (ou un revenu) restait invisible.
  _setupRemotes() {
    const room = this.multi.room;
    this._gone = new Map();          // id → { t, at } : joueur revenu au salon (voiture retirée) ; ses paquets encore en route sont ignorés
    this._onSnap = (id, snap, now) => {
      let rc = this.remote.get(id);
      if (!rc) {
        const g = this._gone.get(id);
        if (g && now - g.at < GONE_MS && snap.t <= g.t) return;      // paquet d'avant son retour au salon, arrivé après : pas de voiture fantôme d'une demi-seconde
        rc = this._addRemote(id);
      }
      if (rc) rc.push(snap, now);
    };
    this._onLeft = (id) => this._dropRemote(id);
    this._onMembers = () => this._syncRemotes();
    room.on('snapshot', this._onSnap);
    room.on('left', this._onLeft);
    room.on('members', this._onMembers);
    for (const m of room.list) if (!m.self) this._addRemote(m.id);
  },

  // Voiture d'un membre de la salle (null : inconnu, soi-même, autre version).
  _addRemote(id) {
    const room = this.multi.room;
    if (this.remote.has(id)) return this.remote.get(id);
    const m = room.members.get(id);
    if (!m || id === room.selfId || m.link === 'incompatible') return null;
    // (0.13.1) à son apparence ; une vraie voiture dans une course à départ commun (championnat), un fantôme de sa couleur en course libre. Couleur de repli : son
    // rang dans la liste triée des identifiants (la même chez tous tant que la salle ne change pas).
    // TECH-088 : la règle « voitures identiques » vaut pour TOUTES les voitures (race.js l'applique à la mienne) : l'apparence d'origine, pas celle annoncée.
    const ids = room.list.map((x) => x.id).sort(), same = !!(room.rules && room.rules.sameCars);
    const rc = new RemoteCar(this.app.scene, { id, name: m.name, colorIndex: Math.max(0, ids.indexOf(id)), car: same ? DEFAULT_LOADOUT : m.car, opaque: !!this.cup },
      { onTeleport: (pos) => this.app.particles.burst(pos.x, pos.y + 1.5, pos.z, 16, 6, 0.5, 0.6, '#9fe3ff', 0) });
    this.remote.set(id, rc);
    return rc;
  },

  _dropRemote(id, now = null) {
    const rc = this.remote.get(id);
    if (!rc) return;
    if (now != null && rc.buffer.latest) this._gone.set(id, { t: rc.buffer.latest.t, at: now });
    rc.dispose(); this.remote.delete(id);
  },

  _roomNow() { const r = this.multi.room; return typeof r.now === 'function' ? r.now() : performance.now(); },

  // La salle a changé : un membre arrivé (ou revenu) EN COURSE et relié a sa voiture (cachée jusqu'à son premier paquet) ; un membre parti perd la sienne, comme
  // un membre revenu au salon (présence racing: false) dont plus aucun paquet n'arrive (TECH-043).
  _syncRemotes(now = this._roomNow()) {
    const room = this.multi.room;
    for (const m of room.members.values()) if (m.racing && m.link === 'open' && !this.remote.has(m.id)) this._addRemote(m.id);
    for (const [id, rc] of [...this.remote]) {
      const m = room.members.get(id);
      if (!m) this._dropRemote(id);
      else if (m.racing === false && !rc.buffer.fresh(now)) this._dropRemote(id, now);
    }
  },

  // Voiture « vivante » (TECH-043) : un paquet depuis moins de STALE_MS, un lien ouvert, un joueur en course. Sinon elle est masquée et hors des collisions.
  _remoteLive(id, rc, now) {
    const m = this.multi.room.members.get(id);
    return !!m && m.link === 'open' && m.racing !== false && rc.ready && rc.buffer.fresh(now);
  },

  // Une image : chaque voiture distante suit son tampon d'interpolation ; seules les vivantes sont montrées.
  _updateRemotes(now, camPos) {
    for (const [id, rc] of this.remote) {
      rc.update(now, camPos);
      rc.live = this._remoteLive(id, rc, now);
      if (!rc.live) rc.group.visible = false;
    }
    this._syncRemotes(now);
  },

  // Fin de session (dispose, construction interrompue) : écouteurs retirés, voitures libérées.
  _teardownRemotes() {
    const room = this.multi && this.multi.room;
    if (room && this._onSnap) { room.off('snapshot', this._onSnap); room.off('left', this._onLeft); room.off('members', this._onMembers); }
    for (const rc of this.remote ? this.remote.values() : []) rc.dispose();
    if (this.remote) this.remote.clear();
  },

  // État de la voiture locale, envoyé aux autres (20 fois par seconde, et à chaque téléportation / arrivée).
  _sendNet(extraFlags = 0) {
    if (!this.multi || this.multi.room.closed) return;
    const p = this.phys, q = this.quat;
    this.multi.room.sendSnapshot({
      steps: this.netTick,
      pos: p.pos, quat: q, vel: p.vel, vehicle: p.vehicle,
      flags: extraFlags | (p.boost > 0 ? F_BOOST : 0) | (p.grounded ? F_GROUNDED : 0),
      tele: this.teleSeq, cp: this.logic.collected.size, lap: this.logic.lap, prog: this.prog,
    });
  },

  // TECH-089 (b) : pendant le décompte les pas de course ne tournent pas, donc rien n'était envoyé : les voitures de la grille restaient invisibles jusqu'au GO. L'état
  // (la voiture à sa place sur la grille) part au même rythme qu'en course, à l'horloge d'envoi (netTick avance avec le temps réel, comme pendant la course).
  _netIdle(dt) {
    this._netAcc = Math.min(0.25, (this._netAcc || 0) + (Number.isFinite(dt) ? Math.max(0, dt) : 0));
    while (this._netAcc >= DT) {
      this._netAcc -= DT;
      if (++this.netTick % SEND_EVERY_STEPS === 0) this._sendNet();
    }
  },

  // Heure locale du GO (départ commun). TECH-089 (d) : un circuit plus long à charger que le délai de départ donnait un GO immédiat, sans décompte ; si la course est
  // prête moins de LATE_MS avant le départ prévu (ou après), le décompte recommence : 3, 2, 1, GO (ce joueur part un peu après les autres ; son chrono est le sien).
  // Fixée à la première image du décompte.
  _startAt() {
    if (this._goAt == null) { const now = performance.now(), at = this.multi.startLocal; this._goAt = at - now < LATE_MS ? now + LATE_COUNTDOWN_MS : at; }
    return this._goAt;
  },

  // Avancement sur le circuit (0 à 1) : sur la ligne centrale du circuit quand il en a une, sinon d'après les checkpoints franchis.
  _updateProgress() {
    const lg = this.logic;
    if (this.state === 'finished' && !this._dnf) this.prog = 1;
    else if (this.progress.available) this.prog = Math.min(0.999, this.progress.update(this.phys.pos, this.progress.lapRange(lg.lap, lg.laps), this._jumped));
    else this.prog = Math.min(0.999, checkpointProgress(lg.collected.size, lg.cps.length, lg.lap, lg.laps, this._legFrac()));
    this._jumped = false;
  },

  // TECH-089 (c) : sans ligne centrale, la part du tronçon en cours : du dernier point de passage (point de retour : départ, checkpoint, ligne) vers le checkpoint restant
  // le plus proche, ou l'arrivée quand ils sont tous pris (les checkpoints se prennent dans n'importe quel ordre).
  _legFrac() {
    const lg = this.logic, pos = this.phys.pos;
    if (!this._legs) {
      const tiles = (lg.track && lg.track.tiles) || [];
      this._legs = { cps: new Map(lg.cps.map((t) => [t, tileCenter(t)])), fin: tiles.filter((t) => PIECES[t.t] && PIECES[t.t].special === 'finish').map((t) => tileCenter(t)) };
    }
    const near = (list) => { let best = null, bd = Infinity; for (const c of list) { const d = Math.hypot(c.x - pos.x, c.z - pos.z); if (d < bd) { bd = d; best = c; } } return best; };
    const left = [...this._legs.cps].filter(([t]) => !lg.collected.has(t)).map(([, c]) => c);
    return legFraction(pos, lg.respawn, near(left.length ? left : this._legs.fin));
  },

  // Avancement d'un autre joueur d'après son dernier paquet.
  progOf(id) { const rc = this.remote.get(id); return rc ? rc.prog : 0; },

  // Collisions douces (manche avec l'option « collisions ») : la voiture est repoussée par celles qu'elle chevauche. Ni en boucle (ruban), ni juste après un retour au
  // checkpoint, ni contre une voiture arrivée ou qui vient de réapparaître.
  // TECH-043 : seulement contre une voiture vivante (voir _remoteLive) : jamais contre une voiture figée faute de paquets.
  _collide(now = performance.now()) {
    const p = this.phys;
    const contacts = this._contacts || (this._contacts = new Map());      // contacts en cours (TECH-041 : une impulsion par contact, pas par pas)
    if (p.mode === 'ribbon' || this.tick < this.protectUntil || !this.remote.size) { contacts.clear(); return; }
    const others = [], room = this.multi.room;
    for (const [id, rc] of this.remote) {
      if (!this._remoteLive(id, rc, now) || !rc.trusted || rc.finished || now - rc.teleportedAtMs <= PROTECT_S * 1000) continue;
      // Collisions unifiées (E16) : l'autre voiture au même instant que la nôtre (interpolation + demi-latence rattrapées).
      const m = room.members.get(id);
      others.push({ id, ...presentState(rc, rc.buffer.delay + (m && m.rtt ? m.rtt / 2000 : 0)) });
    }
    softCollide(p, others, { memo: contacts });                         // (même sans voiture proche : les contacts finis sont oubliés)
  },

  // Fin de manche décidée par l'hôte (temps écoulé pour ceux qui n'ont pas fini) : la voiture est arrêtée, sans temps.
  cupRoundOver() {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this._dnf = true;
    this.state = 'finished';
    this.app.audio.engine(null);
    this.app.ui.hud.message('⏱ Manche terminée', 4, PRIO.final);
  },
};
