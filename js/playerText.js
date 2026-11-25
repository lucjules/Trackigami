// Texte de joueur, côté traduction (RISK-002) : le traducteur DOM anglais (i18n/dom.js) réécrit tout ce que le jeu écrit en français, y compris, sans cela, le nom d'un
// circuit, un pseudo ou un commentaire. Les gabarits `innerHTML` marquent leurs contenus de joueurs avec OFF (dom.js) ; ce module sert aux textes écrits en
// `textContent` dont la source peut être OFFICIELLE (circuits de la carrière, défi du jour : à traduire) ou d'un joueur (à laisser tel quel).
import { BUILTIN_TRACKS } from './tracks.js';

const OFFICIAL = new Set(BUILTIN_TRACKS.map((d) => d.name));
const DAILY = /^Défi du \d{2}\/\d{2}\/\d{4}$/;
const DEFAULT_NAME = 'Mon circuit';      // le nom que le jeu donne à un circuit neuf : texte du jeu, traduit

// Ce nom de circuit est-il celui d'un joueur (circuit de « Mes circuits », de la communauté, d'un code ouvert) ? Un circuit d'un joueur qui porte le nom d'un circuit officiel
// se traduit comme lui : c'est le même texte.
export const isPlayerTrackName = (name) => { const n = String(name == null ? '' : name); return !OFFICIAL.has(n) && !DAILY.test(n) && n !== DEFAULT_NAME; };

// Pose ou retire data-i18n="off" sur un élément qui reçoit ce texte.
export function markPlayerText(el, isPlayer) {
  if (!el) return;
  if (isPlayer) el.setAttribute('data-i18n', 'off'); else if (el.getAttribute('data-i18n') === 'off') el.removeAttribute('data-i18n');
}
