// Rappel discret des mécaniques en course (COMPLETE-007) : à l'approche de la PREMIÈRE pièce ou obstacle d'une mécanique que le joueur n'a encore jamais rencontrée en course, un court
// message de priorité « hint » (hudMessages.js : il ne coupe jamais un message en cours, un autre message le remplace) : « Nouveau · Verglas : peu d'adhérence… ». UNE seule fois par mécanique :
// une fois le message affiché, le niveau 2 est écrit dans le profil (mechanics.js : markMech) et la mécanique ne revient plus, dans aucune course ni sur aucun appareil (fusion = union).
// Ne LIT que la course (position de la voiture) : rien ici ne touche à la physique, au chrono ni à l'enregistrement.
// Ces méthodes s'ajoutent au prototype de RaceSession (voir race.js) : `this` est l'instance.
import { PRIO } from '../hudMessages.js';
import { profile, saveProfile } from '../profile.js';
import { mechanicsOf, mechanicSites, unmetMechanics, markMech, mechReminder, MECH_BY_ID } from '../mechanics.js';

export const HINT_SECONDS = 4;         // durée du rappel
export const HINT_GAP_MS = 500;        // temps de calme entre deux rappels (le second ne coupe jamais le premier)
export const APPROACH_M = 36;          // distance (m) au bord d'une pièce ou d'un obstacle à laquelle le rappel part

// Le rappel est-il permis dans cette course ? Seulement une course normale d'un joueur : ni démonstration, ni replay, ni Theater, ni multijoueur, ni Académie (la leçon explique déjà),
// ni essai de l'éditeur ni mode libre.
export const mechHintsAllowed = (s) => !s.demo && !s.replay && !s.multi && !s.opts.academy && !s.opts.fromEditor && !s.opts.mode && !s.opts.theater;

// Le point (x, y, z) est-il à l'approche d'un des sites de la mécanique ? Sans site (règle du circuit, logique) : oui, tout de suite.
export function nearSite(sites, x, y, z, margin = APPROACH_M) {
  if (!sites.length) return true;
  for (const s of sites) {
    const dx = x - s.x, dy = y - s.y, dz = z - s.z, r = s.r + margin;
    if (dx * dx + dy * dy + dz * dz <= r * r) return true;
  }
  return false;
}

export const mechanicsRaceMethods = {
  // À chaque départ ou nouvel essai : les mécaniques du circuit que le joueur n'a pas encore rencontrées en course.
  _mechSetup() {
    this._mech = null;
    if (!mechHintsAllowed(this)) return;
    this.app._mechSeed();
    const ids = unmetMechanics(profile(), mechanicsOf(this.track));
    if (!ids.length) return;
    const sites = mechanicSites(this.track);
    this._mech = { pending: ids.map((id) => ({ id, sites: sites[id] || [], inside: false })), nextAt: 0 };
  },

  // Toutes les 0,1 s de course (race.js : _stepBody). Une mécanique que la voiture a dépassée sans que son message ait pu s'afficher (un message plus important était en cours) n'est plus
  // annoncée dans cette course : elle reste à découvrir pour la prochaine, au lieu d'apparaître loin de son objet.
  _mechTick() {
    const M = this._mech;
    if (!M || !M.pending.length) return;
    const now = performance.now();
    const p = this.phys.pos;
    for (let i = 0; i < M.pending.length; i++) {
      const e = M.pending[i];
      if (!nearSite(e.sites, p.x, p.y, p.z)) {
        if (e.inside) M.pending.splice(i--, 1);
        continue;
      }
      e.inside = true;
      if (now < M.nextAt) return;
      const m = MECH_BY_ID[e.id];
      if (!this.app.ui.hud.message(mechReminder(m), HINT_SECONDS, PRIO.hint)) return;      // un message important en cours : on retente au prochain contrôle
      M.nextAt = now + HINT_SECONDS * 1000 + HINT_GAP_MS;
      M.pending.splice(i, 1);
      if (markMech(profile(), e.id, 2)) saveProfile();
      return;
    }
  },
};
