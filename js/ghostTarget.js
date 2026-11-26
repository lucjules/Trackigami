// Quel fantôme de médaille montrer (COMPLETE-009) : la prochaine médaille à gagner (bronze → argent → or → cristal), au rythme calibré de ce circuit (js/ghostPaces.js, js/pace.js).
// Module pur (testé sous Node) : la course (race/ghosts.js) lui donne la clé du circuit, les seuils de médailles, le meilleur temps et le réglage ; il répond { medal, pace, ... } ou null.
//
// Réglage `ghostMedal` : 'next' (par défaut) = la prochaine médaille à gagner ; 'or' = toujours le fantôme or, celui d'avant (rythme absent), même une fois l'or gagné.
// Hors table (défi du jour : circuit tiré du jour, seuils qui ne sont pas ceux calibrés) : comme avant, le fantôme or tant que l'or n'est pas gagné, rien après.
import { GHOST_PACES, GHOST_PACE_ORDER } from './ghostPaces.js';

export const UP = ['bronze', 'argent', 'or', 'cristal'];              // du plus facile au plus dur
export const GHOST_COLORS = { bronze: '#d98a4a', argent: '#cfd8e6', or: '#ffd23e', cristal: '#6fe7ff' };
export const GHOST_LABELS = { bronze: 'Bronze', argent: 'Argent', or: 'Or', cristal: 'Cristal' };
// Écart toléré entre le temps du fantôme calibré et le seuil de sa médaille pour s'annoncer sous son nom (voir tools/ghost-rythmes.mjs : presque toutes les entrées sont à moins de 1 %).
export const SHOW_TOLERANCE = 0.06;

// La prochaine médaille à gagner avec ce meilleur temps (null : aucun temps → bronze ; cristal déjà gagné → null).
export function nextMedal(best, medals) {
  if (!medals) return null;
  if (best == null) return 'bronze';
  for (const m of UP) if (best > medals[m] + 1e-6) return m;
  return null;
}

// L'entrée de la table pour ce circuit, si elle a été calculée pour CE circuit (empreinte de sa clé b-) et CES seuils ; sinon null.
export function paceEntry(trackKey, medals, table = GHOST_PACES) {
  const m = /^b-([a-z0-9]+)-([a-z0-9]+)$/.exec(String(trackKey || ''));
  const e = m && Object.hasOwn(table, m[1]) ? table[m[1]] : null;
  if (!e || e.h !== m[2] || !medals) return null;
  return GHOST_PACE_ORDER.every((k, i) => e.m[i] === medals[k]) ? e : null;
}

// { medal (celle dont le fantôme est montré), next (celle à gagner), pace (null : le fantôme or d'avant), t (son temps, s), color, label } ou null.
export function ghostTarget({ trackKey, medals, best, mode = 'next' }, table = GHOST_PACES) {
  if (!medals) return null;
  const entry = (m, e, i) => ({ medal: m, pace: e.p[i] === 1 ? null : e.p[i], t: e.t[i], color: GHOST_COLORS[m], label: GHOST_LABELS[m] });
  const gold = () => ({ medal: 'or', pace: null, t: null, color: GHOST_COLORS.or, label: GHOST_LABELS.or });
  if (mode === 'or') return { ...gold(), next: nextMedal(best, medals) };
  const next = nextMedal(best, medals);
  if (!next) return null;
  const e = paceEntry(trackKey, medals, table);
  if (!e) return next === 'cristal' ? null : { ...gold(), next };
  // Le fantôme de cette médaille, sinon celui de la suivante si le pilote ne sait pas tourner à son seuil (sauts qui demandent de la vitesse : un bronze trop lent n'existe pas).
  for (let j = UP.indexOf(next); j < UP.length; j++) {
    const i = GHOST_PACE_ORDER.indexOf(UP[j]);
    if (Math.abs(e.t[i] / e.m[i] - 1) <= SHOW_TOLERANCE) return { ...entry(UP[j], e, i), next };
  }
  return { ...gold(), next };
}
