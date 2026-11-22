// Validateur de placement de l'éditeur (phase 8 : TECH-003, TECH-052, TECH-053 ; transversal TRANS-01). UNE fonction dit si une pièce peut être posée
// (ou une pièce existante modifiée) et ce que la pose retire : toutes les écritures de pièces de l'éditeur passent par elle (pose et aperçu, collage, inspecteur,
// gizmo, Maj + glisser, duplication, options et mouvement — par la garde du circuit, Track.placementGuard —, changement de type, pot de peinture, Prolonger
// et ses raccords automatiques).
// Avant, chaque chemin faisait ses propres contrôles : la pose calculait les conflits sur la pièce BRUTE avec les options armées qu'elle refusait (mur, anneau,
// checkpoint, mouvement…) et supprimait des pièces que la pièce posée ne touchait pas (TECH-003) ; le débordement des pentes posées au mur (js/spill.js) n'était
// contrôlé que par cinq chemins sur douze (TECH-052) ; « Prolonger » posait un second départ (TECH-053).
// Ordre des contrôles : pièce NORMALISÉE (options refusées retirées, signalées dans `dropped`) → dans les niveaux de l'éditeur (Track.placeable) → pièces
// occupées (remplacées ou refus) → calques verrouillés ou masqués → débordement d'une pente au mur → départ unique.
// Module pur (aucun rendu, aucun DOM) ; il ne modifie pas le circuit (applyPlacement et reshapeTile, plus bas, appliquent un plan accepté). La lecture d'un code
// (Track.decode) n'y passe PAS : les codes existants se relisent à l'identique.
import { PIECES } from './pieces.js';
import { Track } from './track.js';
import { spillConflicts } from './spill.js';

// Options d'une pièce que l'éditeur arme (mêmes clés que editor/shared.js : OPT_KEYS).
export const PLACE_OPTS = ['v', 'o', 'nb', 'tn', 'mv', 'cp', 'tb', 'th', 'gs', 'eb'];
const isStart = (t) => PIECES[t.t] && PIECES[t.t].special === 'start';

// tile : la pièce voulue (brute : options armées comprises). Options :
//   replace  : les pièces occupées sont retirées par la pose (pose, collage) ; sinon la pose est refusée (« occupied »).
//   self     : la pièce que `tile` remplace sur place (inspecteur, gizmo, option, type…) : ignorée partout.
//   ignore   : autres pièces ignorées (sélection déplacée en bloc).
//   layerOk  : faux pour une pièce qu'on ne doit pas retirer (calque verrouillé ou masqué) → refus « locked ».
//   start    : 'replace' (les autres départs sont retirés, comme la pose ordinaire) ou 'refuse' (refus « start » s'il y en a déjà un).
//   keepStart: le départ du circuit n'est jamais retiré par une autre pièce (collage) → refus « start ».
//   detectSame : une pièce IDENTIQUE déjà là est un refus « same » (la pose ordinaire ne refait rien) ; sinon c'est un conflit comme un autre.
// Renvoie { ok, why, norm, conflicts, remove, dropped, blocker } :
//   why : '' | 'bounds' | 'same' (pièce identique déjà là) | 'occupied' | 'locked' | 'spill' | 'start' ;
//   remove : pièces que la pose retire (conflits remplacés, autres départs) ; dropped : options armées que la pièce n'a pas gardées.
export function placementPlan(track, tile, { replace = false, self = null, ignore = [], layerOk = null, start = 'refuse', keepStart = false, detectSame = false } = {}) {
  const norm = Track.normalize(tile);
  const dropped = PLACE_OPTS.filter((k) => tile[k] && norm[k] !== tile[k]);
  const out = (why, extra = {}) => ({ ok: !why, why, norm, conflicts: [], remove: [], dropped, blocker: null, ...extra });
  if (!Track.placeable(norm)) return out('bounds');
  const skip = new Set(ignore);
  if (self) skip.add(self);
  // (sur la pièce NORMALISÉE : une option refusée ne réserve plus ni niveaux ni cases — TECH-003)
  const conflicts = track.conflicts(norm).filter((c) => !skip.has(c));
  if (detectSame && conflicts.length === 1) {
    const c = conflicts[0];
    if (c.t === norm.t && c.x === norm.x && c.z === norm.z && c.l === norm.l && c.r === norm.r && PLACE_OPTS.every((k) => (c[k] | 0) === (norm[k] | 0))) return out('same', { conflicts, blocker: c });
  }
  if (conflicts.length && !replace) return out('occupied', { conflicts, blocker: conflicts[0] });
  const remove = replace ? conflicts.slice() : [];
  const guarded = (list) => (layerOk ? list.find((c) => !layerOk(c)) : null);
  let g = guarded(remove);
  if (g) return out('locked', { conflicts, blocker: g });
  if (keepStart && !isStart(norm)) { const s = remove.find(isStart); if (s) return out('start', { conflicts, blocker: s }); }
  if (isStart(norm)) {
    const others = track.tiles.filter((t) => isStart(t) && !skip.has(t) && !remove.includes(t));
    if (others.length && start !== 'replace') return out('start', { conflicts, blocker: others[0] });
    g = guarded(others);
    if (g) return out('locked', { conflicts, blocker: g });
    remove.push(...others);
  }
  const spill = spillConflicts(track, norm, [...skip, ...remove]);
  if (spill.length) return out('spill', { conflicts, blocker: spill[0] });
  return out('', { conflicts, remove });
}

// Applique un plan accepté : retire ce qu'il retire, pose la pièce normalisée. Renvoie la pièce posée.
export function applyPlacement(track, plan) {
  for (const t of plan.remove) track.remove(t);
  return track.add(plan.norm);
}

// Modifie `tile` sur place (même objet : la sélection de l'inspecteur reste valable) en `cand` si le validateur l'accepte. Renvoie le plan (plan.ok : fait).
export function reshapeTile(track, tile, cand, opts = {}) {
  const plan = placementPlan(track, cand, { ...opts, self: tile });
  if (!plan.ok) return plan;
  for (const t of plan.remove) track.remove(t);
  track.remove(tile);
  Object.assign(tile, plan.norm);
  track._insert(tile);
  return plan;
}
