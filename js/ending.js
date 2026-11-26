// Fin de carrière (COMPLETE-013) : définition de « carrière terminée », épreuve finale, bilan, générique. Module PUR (aucun réseau, aucun navigateur) : l'application lui donne une
// ligne par circuit officiel (médaille, meilleur temps, objectif) et il calcule tout ; rien du bilan n'est écrit en dur ni mémorisé (il se recalcule à chaque ouverture).
//
// DÉFINITIONS (celles du code existant, career.careerSummary, plus une épreuve finale nommée) :
//   • carrière TERMINÉE  : une médaille (bronze ou mieux) sur CHACUN des circuits officiels (84 aujourd'hui, les chapitres bonus compris), l'épreuve finale comprise.
//   • carrière COMPLÈTE  : terminée ET un cristal sur chaque circuit ET tous les objectifs bonus réussis (le « complete » de careerSummary : le bilan le dit autrement, c'est la même condition).
//   • ÉPREUVE FINALE     : « Grande Finale » (id `finale`, dernier circuit de la liste, chapitre « Grandes Manœuvres » : pluie, moto, ascenseur, glissière, portes et pont : la plupart des
//                          mécaniques de la carrière). Circuit existant, NON modifié. Elle est « à finir » quand tous les AUTRES circuits ont une médaille et pas encore elle.
// Le joueur qui avait déjà fini la carrière avant cette version voit la conclusion à sa prochaine visite de l'écran des circuits (une seule fois), puis la rouvre à volonté.
import { MEDALS } from './medals.js';

export const FINALE_ID = 'finale';
// Rang de l'épreuve finale dans une liste de circuits (objets avec `id`, ou `def.id`) ; -1 si elle n'y est pas.
export const finaleIndexOf = (list) => list.findIndex((b) => b && (b.id === FINALE_ID || (b.def && b.def.id === FINALE_ID)));

// entries : une par circuit officiel { medal: 'cristal'|'or'|'argent'|'bronze'|null, time: meilleur temps de médaille (s) ou null, goal: objectif bonus réussi }.
export const careerEnded = (entries) => entries.length > 0 && entries.every((e) => e && e.medal);
export const careerComplete = (entries) => careerEnded(entries) && entries.every((e) => e.medal === 'cristal' && e.goal);
// L'épreuve finale est à finir : tous les autres circuits ont une médaille, pas elle.
export const finaleReady = (entries, finale) => finale >= 0 && finale < entries.length && !entries[finale].medal && entries.every((e, i) => i === finale || (e && e.medal));
// Combien de circuits (hors épreuve finale) attendent encore une médaille.
export const remainingBeforeFinale = (entries, finale) => entries.filter((e, i) => i !== finale && !(e && e.medal)).length;

// Le bilan : tout est compté dans `entries` et le profil ; `extra` : { races, level, coins } lus dans le profil par l'appelant.
export function careerBilan(entries, finale = -1, extra = {}) {
  const total = entries.length, medals = Object.fromEntries(MEDALS.map((m) => [m.id, 0]));
  let goals = 0, time = 0, timed = 0;
  for (const e of entries) {
    if (!e) continue;
    if (e.medal && e.medal in medals) medals[e.medal]++;
    if (e.goal) goals++;
    if (e.time != null && Number.isFinite(+e.time) && +e.time > 0) { time += +e.time; timed++; }
  }
  const fe = finale >= 0 ? entries[finale] : null;
  return {
    total, medals, crystals: medals.cristal, goals,
    medalled: MEDALS.reduce((n, m) => n + medals[m.id], 0),
    // « Records battus » : les circuits où le temps du joueur bat ou égale le temps du pilote automatique de référence (la médaille d'or est ce temps ; l'or et le cristal le battent).
    beaten: medals.cristal + medals.or,
    time, timed, timeComplete: total > 0 && timed === total,           // temps cumulé de tous les meilleurs temps (exact quand chaque circuit en a un)
    finale: fe ? { medal: fe.medal || null, time: fe.time ?? null } : null,
    ended: careerEnded(entries), complete: careerComplete(entries),
    races: Math.max(0, extra.races | 0), level: Math.max(0, extra.level | 0),
  };
}

// Le temps cumulé écrit « 1 h 23 min 45,678 s » : heures, minutes, secondes (3 décimales, comme les temps du jeu). Pur.
export function formatSpan(sec, lang = 'fr') {
  const ms = Math.round(Math.max(0, +sec || 0) * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = (ms % 60000) / 1000;
  const sTxt = (h || m ? s.toFixed(3).padStart(6, '0') : s.toFixed(3)).replace('.', lang === 'en' ? '.' : ',');      // (les secondes ont deux chiffres quand des minutes les précèdent)
  return `${h ? `${h} h ` : ''}${h || m ? `${String(m).padStart(h ? 2 : 1, '0')} min ` : ''}${sTxt} s`;
}

// Le profil a-t-il déjà vu la conclusion ? (champ `endSeen` : date de la première ouverture ; fusion : la plus ancienne, progression.mergeProgress).
export const endingSeen = (p) => Number.isFinite(+p.endSeen) && +p.endSeen > 0;

// Générique : des lignes { h: titre } et { t: texte }, dans l'ordre (le nombre de circuits et de chapitres est celui du jeu, jamais écrit en dur). Pas de noms inventés :
// ce qui est dit est vrai de ce dépôt (licences : js/legal.js, crédits et licences).
export const credits = (tracks, chapters) => [
  { h: 'Trackigami' },
  { t: 'Un jeu de course contre-la-montre, dans le navigateur.' },
  { h: 'Circuits' },
  { t: '{n} circuits officiels en {c} chapitres.', n: tracks, c: chapters },
  { h: 'Décors, véhicules, pièces, icônes' },
  { t: 'Créés pour le jeu.' },
  { h: 'Musique et sons' },
  { t: 'Synthétisés en direct par le jeu : aucun fichier audio.' },
  { h: 'Moteur 3D' },
  { t: 'three.js, licence MIT.' },
  { h: 'Polices' },
  { t: 'Chakra Petch, Unbounded, IBM Plex : SIL Open Font License 1.1.' },
  { h: 'Merci d’avoir joué' },
  { t: 'Chaque temps est le tien.' },
];
