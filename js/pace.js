// Rythme du pilote automatique d'un fantôme (COMPLETE-009 : le fantôme de la prochaine médaille).
//
// `pace` est un nombre : 1 = le pilote des médailles (le fantôme or d'avant, à l'identique), moins de 1 = il roule plus calmement, plus de 1 = il se pousse.
// Absent (null), il ne change RIEN : GhostRunner construit le même pilote qu'avant (tools/test-fantome-rythme.mjs le vérifie bit à bit).
// Le rythme n'agit que sur les réglages que le pilote a déjà (Autopilot : latLimit, steerMargin, vCap) : autopilot.js n'est pas touché, donc ni le défi du jour,
// ni l'empreinte de la physique, ni la vérification des temps en ligne.
//   - latLimit (adhérence latérale visée) et steerMargin (part de l'angle de braquage utilisée) sont multipliés par le rythme : le pilote entre plus lentement dans les virages ;
//   - vCap (vitesse visée) suit le rythme vers le haut, mais ne descend que de moitié : les sauts des circuits sont calés pour une vitesse, un pilote trop lent ne les passerait plus.
// La table des rythmes qui font tourner le fantôme au seuil de chaque médaille de chaque circuit est dans js/ghostPaces.js (générée : tools/ghost-rythmes.mjs).
export const BASE_V_CAP = 52;          // la vitesse visée du pilote quand le circuit n'en règle pas une (autopilot.js : opts.vCap ?? path.pilot.vCap ?? 52)
export const BASE_STEER_MARGIN = 0.85; // la marge de braquage du pilote (autopilot.js : opts.steerMargin ?? 0.85)
export const PACE_MIN = 0.3, PACE_MAX = 1.6;

// Réglages de l'Autopilot pour ce rythme. latLimit : la limite latérale du fantôme de base (GhostRunner : 56 × latK).
export function paceOptions(pace, path, latLimit) {
  const p = Math.max(PACE_MIN, Math.min(PACE_MAX, +pace || 1));
  const base = (path && path.pilot && path.pilot.vCap) || BASE_V_CAP;
  return { latLimit: latLimit * p, steerMargin: BASE_STEER_MARGIN * p, vCap: base * (p < 1 ? 0.5 + 0.5 * p : p) };
}
