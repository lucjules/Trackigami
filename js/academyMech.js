// Académie, leçons par famille de mécanique (COMPLETE-008) : huit courtes leçons pour ce que la carrière fait rencontrer sans l'enseigner ailleurs que dans le wiki : gravité et inversion, murs et
// plafonds, eau et bateau, deltaplane, verre, aimant, obstacles animés, portes logiques. Les six leçons d'origine (academy.js : conduite, dérapage, mini-turbo, réception, plaque, obstacles) ne
// changent pas, ni leur diplôme ; ces huit-ci sont à part (« Mécaniques » dans le menu de l'Académie), ne comptent pas dans le diplôme, et rapportent les mêmes pièces la première fois.
//
// Données et règles pures ; l'écran et le lancement sont dans app/academy.js. Aucune médaille, aucun record, aucune statistique : on s'entraîne. Chaque leçon est un circuit SCRIPTÉ hors des 84
// circuits officiels (aucune clé b-, aucun code partagé : js/tracks.js n'est pas touché ; ces circuits ne sont pas dans la fermeture du serveur, js/verify.js ne les importe pas) construit par
// buildBuiltin comme celles d'academy.js, avec un objectif mesuré par les statistiques de course (career.js : goalMet).
// CHAQUE leçon est démontrée réussissable ET non triviale (tools/test-academy.mjs) : le pilote automatique atteint l'objectif, aussi à d'autres vitesses ; et ce qu'elle enseigne est nécessaire
// (sans la plaque, sans l'aimant, sans la logique, ou en freinant sur le verre, le même pilote échoue).
import { goalMet, goalLabel } from './career.js';
import { profile, saveProfile, addCoins } from './profile.js';
import { LESSON_COINS } from './academy.js';
import { MECHANICS, markMech } from './mechanics.js';

// Une porte logique : un mur commandé par un interrupteur, un pont qui n'apparaît qu'au second (voir js/tracks.js, « Interrupteurs » : même mécanisme, en plus court).
const PORTES = {
  lg: { off: [5], rules: [{ on: ['zone', 1], do: [['hide', 2], ['fx', 'sound', 'ding']] }, { on: ['cp', 1], do: [['show', 2]] }, { on: ['zone', 3], do: [['show', 5], ['fx', 'burst', '#ffd23e']] }] },
  lgZones: [{ g: 1, at: 0.1 }, { g: 3, at: 0.55 }, { g: 5, at: 0.78 }, { g: 5, at: 0.82 }],
};

// {accelerate} {brake} {left} {right} {respawn} dans les textes : remplacés par les touches réelles du joueur (voir app/academy.js).
export const MECH_LESSONS = [
  {
    id: 'gravite', name: 'Gravité et inversion', decor: 'orbit',
    script: 'start B S.g40 G2 V-6 S2 C S.f V8 S4^ S.f^ V-8 S2 finish', opts: { l: 14 },
    goal: { id: 'air', t: 3 },
    intro: ['Une <b>zone de gravité</b> change la pesanteur. Ici elle est à 40 % : la voiture flotte. Garde les gaz : ton saut est plus haut et plus long qu’à l’ordinaire.', 'Plus loin, une <b>plaque d’inversion</b> (rose) retourne la gravité : la voiture est attirée vers le haut et roule <b>au plafond</b> d’une route suspendue. Une seconde plaque la remet à l’endroit.', 'Objectif : un seul vol de 3 secondes sans toucher le sol, grâce à la gravité réduite.'],
    tip: 'Garde les gaz : la gravité réduite allonge ton saut. Les plaques roses inversent la gravité.',
  },
  {
    id: 'murs', name: 'Murs, looping et plafond', decor: 'caves',
    script: 'start B2 [tr01s] S3< [tr10s] S C B2 O S2 finish', opts: { l: 4 },
    goal: { id: 'norespawn' },
    intro: ['La route monte sur un <b>mur</b> : il faut de la vitesse (environ 110 km/h au moins) et les <b>gaz</b>. Trop lente, la voiture décroche et tu reviens au checkpoint.', 'Le <b>looping</b> demande le même élan : lève le pied et la voiture décroche. À son sommet la route est <b>au plafond</b> : reste sur la route et garde les gaz.', 'Objectif : finir sans réapparaître.'],
    tip: 'Garde les gaz sur le mur et dans le looping : sans vitesse, la voiture décroche.',
  },
  {
    id: 'eau', name: 'Eau et bateau', decor: 'reef',
    script: 'start S S.n S4.a R.a L.a S.a C.a S.a finish', opts: { l: 2 },
    goal: { id: 'vehicle', v: 'boat' },
    intro: ['En voiture, l’<b>eau</b> te ralentit presque à l’arrêt, et tu coules si tu t’arrêtes. Il faut d’abord rouler sur une <b>plaque bateau</b> (bleu clair) : la voiture devient un bateau, qui flotte et file sur l’eau.', 'Reste sur l’eau : un bateau hors de l’eau avance très mal. Une seconde plaque bateau te rendrait ta voiture.', 'Objectif : franchir l’arrivée <b>en bateau</b>.'],
    tip: 'Roule sur la plaque bleu clair : tu deviens un bateau. Reste sur l’eau jusqu’à l’arrivée.',
  },
  {
    id: 'deltaplane', name: 'Deltaplane', decor: 'sky',
    script: 'start B3 S.e UU GR4 DD S5 S.e C S finish', opts: { l: 4 },
    goal: { id: 'air', t: 4 },
    intro: ['La <b>plaque deltaplane</b> (blanche) transforme la voiture en deltaplane : au lieu de tomber, il <b>plane</b> au-dessus du vide.', 'Prends de la vitesse, décolle droit au bout de la rampe, puis garde la route dans l’axe. L’anneau turbo au milieu du vide te donne un coup de pouce.', 'Une seconde plaque, à l’atterrissage, te rend ta voiture. Objectif : un seul vol de 4 secondes sans toucher le sol.'],
    tip: 'Roule sur la plaque blanche, décolle droit au bout de la rampe et plane jusqu’à l’autre côté.',
  },
  {
    id: 'verre', name: 'Verre fragile', decor: 'reef',
    script: 'start B S4.v S C B S4.v S2 finish', opts: { l: 2 },
    goal: { id: 'norespawn' },
    intro: ['Le <b>verre fragile</b> cède quand la voiture y reste trop longtemps : la dalle disparaît et la voiture tombe.', 'Traverse vite, sans lever le pied : un coup de <b>{brake}</b> sur le verre et tu tombes.', 'Objectif : finir sans réapparaître.'],
    tip: 'Ne freine pas sur le verre : garde les gaz et traverse sans t’arrêter.',
  },
  {
    id: 'aimant', name: 'Aimant', decor: 'polar',
    script: 'start B2 S UU.m DD.m R.m S.m C UU.m DD.m L.m S2 finish', opts: { l: 4 },
    goal: { id: 'norespawn' },
    intro: ['Une route <b>aimantée</b> (violette) retient la voiture : elle adhère mieux et ne décolle plus des bosses.', 'Sans aimant, une bosse prise à cette vitesse te lance dans les airs, juste avant un virage. Ici, garde les gaz : la voiture reste collée à la route et tourne.', 'Objectif : finir sans réapparaître.'],
    tip: 'Garde les gaz sur la route violette : les bosses ne te font pas décoller.',
  },
  {
    id: 'animes', name: 'Obstacles animés', decor: 'atelier',
    script: 'start B2 S2 C S5 S4 S2 finish', opts: { l: 6 },
    obst: [{ k: 'pendulum', at: 0.34, side: 0, s: 1, ph: 0 }, { k: 'hammer', at: 0.5, side: 0, s: 1, ph: 0.25 }, { k: 'sweeper', at: 0.64, side: 9, s: 1, ph: 0.25 }, { k: 'slider', at: 0.8, side: 0, s: 1, ph: 0.25 }],
    goal: { id: 'noshock' },
    intro: ['Une <b>boule balancier</b>, un <b>marteau tournant</b>, un <b>balayeur</b> et un <b>mur coulissant</b> bougent au rythme du chrono, toujours de la même façon : regarde-les avant de passer.', 'Passe quand le chemin est libre ; ralentis ou attends si besoin : un choc te repousse et te fait perdre du temps.', 'Objectif : finir sans heurter d’obstacle.'],
    tip: 'Observe le rythme de chaque obstacle, puis passe quand le chemin est libre.',
  },
  {
    id: 'portes', name: 'Portes logiques', decor: 'factory',
    script: 'start B2 S3 C S2 S3 S2 finish', opts: { l: 2 },
    obst: [{ k: 'wallS', at: 0.22, side: 0, s: 1.5, g: 2 }], ...PORTES,
    goal: { id: 'nowall' },
    intro: ['Les portes de ce circuit sont commandées par des <b>règles de logique</b> : « quand ceci arrive, fais cela ». Un mur barre la route jusqu’à ce que tu passes sur le premier <b>interrupteur</b> : alors il s’ouvre. Au checkpoint, il se referme derrière toi.', 'Le <b>pont</b> de l’arrivée n’apparaît qu’au second interrupteur. Tu peux écrire tes propres règles dans l’éditeur (outil Logique).', 'Objectif : finir sans toucher de muret.'],
    tip: 'Va tout droit : les interrupteurs ouvrent le mur et font apparaître le pont.',
  },
];

// Les mécaniques que chaque leçon enseigne (mechanics.js : champ lesson) : elles comptent comme rencontrées dès qu'on joue la leçon (plus de rappel « Nouveau » en course).
export const mechsOfLesson = (id) => MECHANICS.filter((m) => m.lesson === id).map((m) => m.id);

export const mechLessonDone = (id) => !!(profile().academy || {})[id];
export const mechLessonsDone = () => MECH_LESSONS.filter((l) => mechLessonDone(l.id)).length;
export const nextMechLesson = () => { const i = MECH_LESSONS.findIndex((l) => !mechLessonDone(l.id)); return i < 0 ? null : i; };

// Marque comme rencontrées les mécaniques qu'enseigne la leçon i (au lancement). Vrai si le profil a changé.
export function learnMechs(i) {
  const L = MECH_LESSONS[i];
  if (!L) return false;
  const p = profile();
  let changed = false;
  for (const id of mechsOfLesson(L.id)) changed = markMech(p, id, 2) || changed;
  if (changed) saveProfile();
  return changed;
}

// Résultat d'une leçon : { passed, text, coins }. st : statistiques de la course (RaceSession.stats + vehicle + time). Marque la leçon et verse les pièces la première fois (comme academy.js,
// sans bonus de diplôme : les six leçons d'origine gardent le leur). Les réussites sont dans profile.academy (union à la fusion des appareils : aucune règle de plus).
export function completeMechLesson(i, st) {
  const L = MECH_LESSONS[i];
  const passed = !!L && goalMet(L.goal, st);
  const out = { passed, text: L ? goalLabel(L.goal) : '', coins: 0 };
  if (!passed) return out;
  const p = profile();
  p.academy = p.academy || {};
  if (!p.academy[L.id]) {
    p.academy[L.id] = 1;
    out.coins = LESSON_COINS;
    saveProfile();
    addCoins(out.coins);
  }
  return out;
}
