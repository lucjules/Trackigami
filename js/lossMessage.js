// Ce que la lecture d'un code de circuit n'a pas pu garder, DIT au joueur dans sa langue (TECH-060, phase 7). Les données viennent du noyau (track.js : lossParts, lossBlocking, qui n'importe
// pas l'i18n : il est dans la fermeture de js/verify.js) ; les phrases sont des modèles du dictionnaire (i18n/en/editor.js), assemblés par t() : en français le texte est exactement celui de
// track.js : lossText. Utilisé par l'éditeur (ouverture d'un circuit, import d'un code), l'import communautaire et le lien de partage.
import { t } from './i18n.js';
import { lossParts } from './track.js';

const PART = {
  unknown: '{n:w} pièce(s) d\'une version plus récente du jeu',
  options: '{n:w} option(s) de pièce inconnues de cette version',
  overlap: '{n:w} pièce(s) qui en recouvrent une autre',
  decos: '{n:w} décoration(s)',
};

// La phrase complète ('' si rien n'a été perdu).
export function lossMessage(track) {
  const parts = lossParts(track).map(([k, n]) => t(PART[k], { n }));
  return parts.length ? t('Ce code contient {list} que ce jeu ne peut pas lire.', { list: parts.join(', ') }) : '';
}

// Les phrases qui suivent, selon ce que l'écran peut faire du circuit.
export const lossNote = {
  detached: () => t('Le circuit d\'origine reste intact dans « Mes circuits » ; ce que tu enregistres ici en fait une copie.'),      // ouverture dans l'éditeur : détaché de l'entrée
  incomplete: () => t('Ce que tu enregistres sera une copie incomplète.'),                                                          // code collé dans l'éditeur
  updateToImport: () => t('Mets le jeu à jour avant de l’importer.'),                                                               // import refusé
  updateToEdit: () => t('Mets le jeu à jour pour l’enregistrer ou l’éditer.'),                                                      // lien de partage : jouable, ni enregistrable ni éditable
};
