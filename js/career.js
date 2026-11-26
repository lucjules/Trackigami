// Mode carrière (v1.5) : les circuits intégrés, rangés du plus facile au plus dur,
// sont regroupés en chapitres de 6. Un chapitre s'ouvre avec 4 médailles dans le
// précédent. Chaque circuit a un objectif bonus qui rapporte des pièces une fois.
import { profile, saveProfile, addCoins } from './profile.js';
import { CAREER_ORDER, CHAPTER_KEYS, DECORS } from './themes.js';
import { DT } from './constants.js';
import { countBetween } from './runStats.js';

export const CHAPTER_SIZE = 6;
export const UNLOCK_MEDALS = 4;
const GOAL_COINS = 50;

// 0.9.6 : profils de circuits (champ `profil` des circuits intégrés). Chaque circuit est conçu pour une expérience précise ; la pastille
// de la carte de carrière l'annonce. Les mesures qui définissent chaque profil sont vérifiées par tools/contract.mjs (appliqué à tous les circuits par tools/test-niveaux.mjs).
export const PROFILS = {
  sprint: { cls: 'p-sprint', label: 'Sprint', tip: 'Presque tout droit : le chrono pur, la trajectoire fait la différence.' },
  speedway: { cls: 'p-speedway', label: 'Speedway', tip: 'Très grands virages, longues lignes droites : on garde la vitesse de pointe.' },
  technique: { cls: 'p-technique', label: 'Technique', tip: 'Freinages forts et relances rapides : la courbe d’accélération se travaille.' },
  rollercoaster: { cls: 'p-rollercoaster', label: 'Rollercoaster', tip: 'Verticalité extrême : murs, boucles et chutes.' },
  acrobatique: { cls: 'p-acrobatique', label: 'Acrobatique', tip: 'Sauts et réceptions : l’élan décide de tout.' },
  atelier: { cls: 'p-atelier', label: 'Mécanisme', tip: 'Un mécanisme à apprivoiser : obstacles et pièces mobiles, un par un. Le même vocabulaire que dans l’éditeur.' },
};

// Un chapitre par décor, dans l'ordre de CAREER_ORDER (themes.js) ; le nom du chapitre est celui du décor. 0.17.0 : puis les chapitres bonus EXTRA_CHAPTERS (leur propre nom).
const CHAPTER_DESC = {
  desert: 'Sprint, speedway, tremplins, épingles et grand huit : tous les profils de circuits, avec un wall-ride dès le premier.',
  jungle: 'Rampe de lancement, tube, rebonds de champignons et slalom en moto : la jungle au grand complet.',
  isles: 'Descente en moto, slalom en bateau et décollage en deltaplane autour du phare.',
  city: 'Tapis roulant express, boucles, métro aérien, toits et lift hill : la ville monte en puissance.',
  polar: 'Départ sur la glace, rebonds en terrasses, toboggan aimanté, hélices et poudreuse.',
  volcano: 'Collines de braises, plaque de dérive, cheminée verticale, caldeira à deux tours et éruptions.',
  orbit: 'Tube d’amarrage, basse gravité, moto, grand anneau à deux tours et apesanteur.',
  reef: 'Contre-courants, gravité lourde, pont de verre et plongée vers les abysses.',
  factory: 'Moteur coupé, bifurcation, pistons, marteau et ralentisseurs : l’usine ne pardonne rien.',
  sky: 'Vent de travers, îles sans bordures, gravité réduite, pont des vents et départ en deltaplane.',
  caves: 'Volant inversé, vrilles, inversions de gravité, plafonds et verre fragile.',
  atelier: 'Piques, balancier, marteau, balayeur, ascenseur, glissière : chaque mécanisme, un par un. Les mêmes outils que dans l’éditeur.',
  elements: 'Nuit d’auteur, trois tours, pluie, rafales, givre, ressorts : le temps qu’il fait change la conduite.',
  manoeuvres: 'Moto, portes et interrupteurs, plateaux mobiles, relais de véhicules, aiguillage par l’eau, épreuve finale.',
};
// 0.17.0 : noms des chapitres bonus qui ne sont pas un décor (EXTRA_CHAPTERS, themes.js).
const EXTRA_NAMES = { elements: 'Les Éléments', manoeuvres: 'Grandes Manœuvres' };
// Chapitre BONUS : il vient en dernier de la liste mais s'ouvre avec 4 médailles dans un chapitre précis (ici le premier), pas dans le précédent ; il ne fait pas partie de l'enchaînement
// « circuit suivant » de la carrière. (Rien ne bouge pour qui a déjà progressé : les circuits sont repérés par leur clé, et l'enchaînement des onze chapitres d'origine est intact.)
// 0.17.0 (COMPLETE-011) : deux chapitres bonus de plus, rangés après l'Atelier mais ouverts au milieu de la carrière, là où elle n'apportait plus de nouveauté :
// « Les Éléments » avec 4 médailles au chapitre 5 (Nuit polaire : il se joue avec les chapitres 6 et 7), « Grandes Manœuvres » avec 4 médailles au chapitre 9 (Usine :
// il se joue avec le chapitre 10). Leurs médailles n'ouvrent aucun autre chapitre.
const BONUS = { atelier: 'desert', elements: 'polar', manoeuvres: 'factory' };
export const CHAPTERS = CHAPTER_KEYS.map((key) => ({
  key, name: DECORS[key] && CAREER_ORDER.includes(key) ? DECORS[key].label : EXTRA_NAMES[key], ...(CAREER_ORDER.includes(key) ? { decor: key } : {}), desc: CHAPTER_DESC[key],
  ...(BONUS[key] ? { bonus: true, after: CAREER_ORDER.indexOf(BONUS[key]) } : {}),
}));
// Chapitre à réussir (4 médailles) pour ouvrir le chapitre ch : le précédent, sauf chapitre bonus.
export const prerequisiteOf = (ch) => (CHAPTERS[ch] && CHAPTERS[ch].after != null ? CHAPTERS[ch].after : ch - 1);
// « Circuit suivant » après le circuit i : le suivant de la liste, sauf en changeant de chapitre vers un chapitre bonus (ou en en sortant).
export function nextBuiltinIndex(i, total) {
  const n = i + 1;
  if (n >= total) return null;
  const a = Math.floor(i / CHAPTER_SIZE), b = Math.floor(n / CHAPTER_SIZE);
  return a !== b && ((CHAPTERS[b] && CHAPTERS[b].bonus) || (CHAPTERS[a] && CHAPTERS[a].bonus)) ? null : n;
}

// Objectifs bonus. COMPLETE-012 : en plus des anciens (muret, réapparition, réceptions, mini-turbos, anneaux, véhicule, temps), des objectifs qui reprennent ce que le circuit enseigne :
//   air      { t }              un seul vol d'au moins t s (le plus long vol sans toucher le sol : stats.airBest)
//   speed    { v }              atteindre v km/h (stats.vmax)
//   section  { a, b?, t }       la section entre le point de passage a et b (0 = le départ ; b absent = l'arrivée) en moins de t s : temps de passage, ceux de la fiche du circuit
//   turbo    { n, a?, b? }      avec a et/ou b : n mini-turbos DANS cette section seulement (sans eux : sur toute la course, comme avant)
// Les nouveaux objectifs (circuit: true) sont propres aux circuits de la carrière : ils n'ont pas de sens dans un mode de jeu libre (rules.js : sanitizeGoal les refuse).
// Mesures : stats de course (runStats.js : le même code en direct et dans tools/objectifs.mjs, qui vérifie que chaque objectif est réalisable).
const sec = (g) => (g.a > 0 ? (g.b != null ? `du point ${g.a} au point ${g.b}` : `du point ${g.a} à l'arrivée`) : `du départ au point ${g.b}`);
export const GOALS = {
  nowall: { label: 'Finir sans toucher de muret' },
  norespawn: { label: 'Finir sans réapparition' },
  perfect: { label: (n) => `${n} réception${n > 1 ? 's' : ''} parfaite${n > 1 ? 's' : ''}` },
  turbo: { label: (n, g) => (g && (g.a > 0 || g.b != null) ? `${n} mini-turbo${n > 1 ? 's' : ''} ${sec(g)}` : `${n} mini-turbo${n > 1 ? 's' : ''}`) },
  rings: { label: (n) => `Passer dans ${n} anneau${n > 1 ? 'x' : ''} turbo` },
  vehicle: { label: (v) => `Franchir l'arrivée en ${{ moto: 'moto', boat: 'bateau', glider: 'deltaplane', car: 'voiture' }[v] || v}` },
  under: { label: (t) => `Finir en moins de ${t} s` },
  air: { label: (t) => `Un seul vol de ${t} s sans toucher le sol`, circuit: true },
  speed: { label: (v) => `Atteindre ${v} km/h`, circuit: true },
  section: { label: (t, g) => `${sec(g)[0].toUpperCase()}${sec(g).slice(1)} en moins de ${t} s`, circuit: true },
};

// Les objectifs d'un mode de jeu libre (rules.js, app/modes.js) : tous sauf ceux propres à un circuit.
export const MODE_GOAL_IDS = Object.keys(GOALS).filter((id) => !GOALS[id].circuit);

export function goalFor(def, index) {
  if (def.goal) return def.goal;
  const cycle = [{ id: 'nowall' }, { id: 'norespawn' }, { id: 'turbo', n: 1 }];
  return cycle[index % cycle.length];
}

export function goalLabel(goal) {
  const G = GOALS[goal.id];
  if (!G) return '';
  return typeof G.label === 'function' ? G.label(goal.n ?? goal.v ?? goal.t, goal) : G.label;
}

// st : { wallHits, respawns, perfects, turbos, rings, airBest, vmax, turboAt, vehicle, time, steps, splits } (runStats.js : final).
export function goalMet(goal, st) {
  switch (goal.id) {
    case 'nowall': return st.wallHits === 0;
    case 'norespawn': return st.respawns === 0;
    case 'perfect': return st.perfects >= (goal.n || 1);
    case 'turbo': return (goal.a > 0 || goal.b != null ? countBetween(st.turboAt || [], st.splits || [], st.steps, goal.a || 0, goal.b) : st.turbos) >= (goal.n || 1);
    case 'rings': return st.rings >= (goal.n || 1);
    case 'vehicle': return st.vehicle === goal.v;
    case 'under': return st.time <= goal.t;
    case 'air': return (st.airBest || 0) >= goal.t - 1e-9;
    case 'speed': return (st.vmax || 0) * 3.6 >= goal.v - 1e-9;
    case 'section': return sectionTime(goal, st) <= goal.t + 1e-9;
    default: return false;
  }
}

// Le temps (s) de la section d'un objectif ; Infinity si un de ses points de passage n'a pas été pris.
export function sectionTime(goal, st) {
  const a = goal.a > 0 ? (st.splits || [])[goal.a - 1] : 0, b = goal.b != null ? (st.splits || [])[goal.b - 1] : st.steps;
  return a == null || b == null || !(b > a) ? Infinity : (b - a) * DT;
}

export function goalDone(key) {
  return !!(profile().goals || {})[key];
}

// Marque l'objectif ; renvoie les pièces gagnées (seulement la première fois).
export function completeGoal(key) {
  const p = profile();
  p.goals = p.goals || {};
  if (p.goals[key]) return 0;
  p.goals[key] = 1;
  saveProfile();
  addCoins(GOAL_COINS);
  return GOAL_COINS;
}


// medalOf(i) -> médaille du joueur sur le circuit i (ou null).
export function chapterUnlocked(ch, medalOf, total) {
  if (ch <= 0 || profile().eggs?.unlockAll) return true;
  const from = prerequisiteOf(ch);
  let n = 0;
  for (let i = from * CHAPTER_SIZE; i < Math.min(total, (from + 1) * CHAPTER_SIZE); i++) if (medalOf(i)) n++;
  return n >= UNLOCK_MEDALS;
}

// 0.9.10 : finitions de la carrière. État d'un chapitre : « terminé » = une médaille sur chacun de ses circuits, « parfait » = en plus tous les
// objectifs bonus ; « cristal » = toutes les médailles sont des cristaux. Fonctions pures (testées), l'écran ne fait que les afficher.
export function chapterState(medalIds, goalsDone, size = CHAPTER_SIZE) {
  const n = medalIds.filter(Boolean).length;
  if (n < size) return { id: 'open', label: '' };
  if (medalIds.every((m) => m === 'cristal') && goalsDone >= size) return { id: 'crystal', label: '✦ Chapitre cristal' };
  if (goalsDone >= size) return { id: 'perfect', label: '★ Chapitre parfait' };
  return { id: 'done', label: '✓ Chapitre terminé' };
}

// Bilan de toute la carrière : medalIds = id de médaille (ou null) pour chaque circuit, goalsDone = nombre d'objectifs bonus réussis.
export function careerSummary(medalIds, goalsDone) {
  const total = medalIds.length, medals = medalIds.filter(Boolean).length;
  const crystal = medalIds.filter((m) => m === 'cristal').length;
  const pct = total ? Math.round(((medals + goalsDone + crystal) / (3 * total)) * 100) : 0;
  return { total, medals, crystal, goals: goalsDone, pct, finished: total > 0 && medals === total, complete: total > 0 && medals === total && goalsDone === total && crystal === total };
}
