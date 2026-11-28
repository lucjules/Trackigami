// Copie d'un circuit officiel dans l'éditeur (COMPLETE-019). Module pur (ni rendu ni navigateur), dans la FERMETURE de la vérification serveur (verify.js) : le jeu et le serveur
// appliquent la même règle de publication.
//
//   officialCopy(track)      une COPIE du circuit officiel : un circuit de joueur ordinaire, décodé depuis le code du circuit (le chemin de tout circuit ouvert dans l'éditeur), avec sa
//                            propre clé « u-… » (la signature : elle ne dépend ni du nom ni de la description) ; l'original n'est jamais touché. Le nom reçoit « (copie) », la description
//                            « Dérivé de « … » (circuit officiel) » (la mention suit la copie jusqu'à sa publication ; elle ne change pas la clé). L'auteur est vidé, la vérification aussi.
//   isOfficialCircuit(track) ce circuit est-il (physiquement) un circuit officiel, au nom et à la description près ? Une copie NON MODIFIÉE l'est : la RÈGLE (docs/ARCHITECTURE.md,
//                            « Copie d'un circuit officiel ») est qu'elle ne se publie pas : ce n'est pas le travail de son auteur (les règles de la communauté demandent « ce circuit est le mien »)
//                            et elle doublerait un circuit de la carrière dans la communauté. Il suffit de la MODIFIER (une pièce, un réglage) pour pouvoir la publier.
import { Track } from './track.js';
import { BUILTIN_TRACKS, buildBuiltin } from './tracks.js';

export const COPY_SUFFIX = ' (copie)';
export const COPY_PUBLISH_REFUSAL = 'Ce circuit est identique à un circuit officiel : modifie-le avant de le publier (une copie non modifiée n’est pas ton travail).';

export function officialCopy(track) {
  const t = Track.decode(track.encode());
  const from = String(track.name || '').trim();
  t.name = (from + COPY_SUFFIX).slice(0, 40);
  t.desc = `Dérivé de « ${from} » (circuit officiel)`.slice(0, 200);
  t.author = '';
  t.vt = 0; t.vh = '';
  return t;
}

// Textes de signature de tous les circuits officiels, calculés une fois (84 circuits construits à la première demande).
let texts = null;
export function isOfficialCircuit(track) {
  if (!texts) texts = new Set(BUILTIN_TRACKS.map((d) => buildBuiltin(d).signatureText()));
  return texts.has(track.signatureText());
}
