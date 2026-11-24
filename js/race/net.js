// Multijoueur dans la course : voitures des autres joueurs et envoi de l'état local.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { RemoteCar } from '../remoteCar.js';
import { F_BOOST, F_GROUNDED } from '../net/snapshot.js';
import { checkpointProgress } from '../net/progress.js';
import { PRIO } from '../hudMessages.js';
import { softCollide, presentState, PROTECT_S } from '../net/collide.js';
export const netMethods = {
  // ---- Multijoueur : voitures des autres joueurs (RemoteCar), alimentées par les paquets WebRTC ----------------------------
  // TECH-009 (TRANS-06) : une voiture distante naît à l'arrivée d'un membre en course (évènement « members ») ou à son premier paquet, et renaît après un départ suivi
  // d'un retour (même identifiant). Avant, elles étaient créées une seule fois d'après room.list au départ : un arrivant (ou un revenu) restait invisible.
  _setupRemotes() {
    const room = this.multi.room;
    this._onSnap = (id, snap, now) => { const rc = this.remote.get(id) || this._addRemote(id); if (rc) rc.push(snap, now); };
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
    const ids = room.list.map((x) => x.id).sort();
    const rc = new RemoteCar(this.app.scene, { id, name: m.name, colorIndex: Math.max(0, ids.indexOf(id)), car: m.car, opaque: !!this.cup },
      { onTeleport: (pos) => this.app.particles.burst(pos.x, pos.y + 1.5, pos.z, 16, 6, 0.5, 0.6, '#9fe3ff', 0) });
    this.remote.set(id, rc);
    return rc;
  },

  _dropRemote(id) { const rc = this.remote.get(id); if (rc) { rc.dispose(); this.remote.delete(id); } },

  // La salle a changé : un membre arrivé (ou revenu) EN COURSE et relié a sa voiture (cachée jusqu'à son premier paquet) ; un membre parti perd la sienne.
  _syncRemotes() {
    const room = this.multi.room;
    for (const m of room.members.values()) if (m.racing && m.link === 'open' && !this.remote.has(m.id)) this._addRemote(m.id);
    for (const id of [...this.remote.keys()]) if (!room.members.has(id)) this._dropRemote(id);
  },

  // Une image : chaque voiture distante suit son tampon d'interpolation.
  _updateRemotes(now, camPos) {
    for (const rc of this.remote.values()) rc.update(now, camPos);
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

  // Avancement sur le circuit (0 à 1) : sur la ligne centrale du circuit quand il en a une, sinon d'après les checkpoints franchis.
  _updateProgress() {
    const lg = this.logic;
    if (this.state === 'finished' && !this._dnf) this.prog = 1;
    else if (this.progress.available) this.prog = Math.min(0.999, this.progress.update(this.phys.pos, this.progress.lapRange(lg.lap, lg.laps), this._jumped));
    else this.prog = Math.min(0.999, checkpointProgress(lg.collected.size, lg.cps.length, lg.lap, lg.laps));
    this._jumped = false;
  },

  // Avancement d'un autre joueur d'après son dernier paquet.
  progOf(id) { const rc = this.remote.get(id); return rc ? rc.prog : 0; },

  // Collisions douces (manche avec l'option « collisions ») : la voiture est repoussée par celles qu'elle chevauche. Ni en boucle (ruban), ni juste après un retour au
  // checkpoint, ni contre une voiture arrivée ou qui vient de réapparaître.
  _collide() {
    const p = this.phys;
    if (p.mode === 'ribbon' || this.tick < this.protectUntil || !this.remote.size) return;
    const now = performance.now(), others = [], room = this.multi.room;
    for (const [id, rc] of this.remote) {
      if (!rc.ready || rc.finished || now - rc.teleportedAtMs <= PROTECT_S * 1000) continue;
      // Collisions unifiées (E16) : l'autre voiture au même instant que la nôtre (interpolation + demi-latence rattrapées).
      const m = room.members.get(id);
      others.push(presentState(rc, rc.buffer.delay + (m && m.rtt ? m.rtt / 2000 : 0)));
    }
    if (others.length) softCollide(p, others);
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
