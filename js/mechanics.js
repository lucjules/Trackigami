// Mécaniques de jeu (COMPLETE-007) : le catalogue de ce qu'un circuit peut faire découvrir (revêtements, plaques, obstacles, murs et plafonds, gravité, logique…),
// leur détection dans un circuit À PARTIR DES DONNÉES EXISTANTES (aucun circuit n'est touché : les clés b- restent celles de tracks.js), et le champ de profil
// « mécaniques découvertes » (profile.mech) avec sa règle de fusion entre appareils. Module pur (aucun DOM, aucun réseau) : testé sous Node (tools/test-mecaniques.mjs).
//
// Profil : mech = { idMécanique: niveau } ; niveau 1 : la carte « Nouveau » de la fiche du circuit a été montrée ; niveau 2 : la mécanique a été rencontrée en course
// (rappel montré) ou apprise à l'Académie. Fusion de deux appareils : UNION des identifiants, niveau au maximum (une découverte ne se perd jamais, ne se refait pas).
//
// Textes : name (nom), short (rappel en course, une demi-phrase), how (la carte : comment s'en servir). Le français est la clé de la traduction (i18n/en/mechanics.js).
import { PIECES, SURFACE_ALIAS } from './pieces.js';
import { isObstacle } from './obstacles.js';
import { CELL, LEVEL_H } from './constants.js';

// Familles : l'ordre est celui de l'index du profil.
export const MECH_GROUPS = [
  { id: 'surface', name: 'Revêtements', icon: '🛣️' },
  { id: 'vehicle', name: 'Véhicules et eau', icon: '🔁' },
  { id: 'gravity', name: 'Gravité', icon: '🌀' },
  { id: 'shape', name: 'Murs, plafonds et formes', icon: '🧱' },
  { id: 'obstacle', name: 'Obstacles', icon: '⚠️' },
  { id: 'logic', name: 'Logique et pièces mobiles', icon: '⚙️' },
];

// lesson : l'identifiant de la leçon de l'Académie qui l'enseigne (academyMech.js ; ou, pour la plaque moto et les obstacles, l'une des six d'origine), s'il y en a une.
export const MECHANICS = [
  // ---- revêtements
  { id: 'boost', group: 'surface', icon: '⏩', name: 'Accélérateur', short: 'roule dessus pour une poussée de vitesse', how: 'Une plaque de turbo : la rouler te pousse vers l’avant. Aligne-toi dessus et prépare déjà le virage suivant.' },
  { id: 'ice', group: 'surface', icon: '🧊', name: 'Verglas', short: 'peu d’adhérence : freine avant, braque en douceur', how: 'La glace : la voiture glisse et tourne mal. Freine avant la plaque, braque doucement et évite les corrections brusques.' },
  { id: 'bounce', group: 'surface', icon: '🟣', name: 'Rebond', short: 'la voiture rebondit : prépare ta réception', how: 'Cette dalle te lance en l’air. Reste droit, puis freine en l’air (aérofrein) pour retomber à plat.' },
  { id: 'magnet', group: 'surface', icon: '🧲', name: 'Aimant', short: 'la route te retient, même sur une bosse', how: 'Sur une route aimantée la voiture adhère mieux et ne décolle plus des bosses : garde les gaz, elle suit la route.', lesson: 'aimant' },
  { id: 'drift', group: 'surface', icon: '💨', name: 'Dérive', short: 'l’arrière décroche : braque doucement', how: 'Sur une dérive l’arrière n’accroche presque plus : au moindre coup de volant la voiture part en glisse. Braque doucement.' },
  { id: 'slow', group: 'surface', icon: '🐢', name: 'Ralentisseur', short: 'ralentit la voiture : arrive avec la bonne vitesse', how: 'Cette dalle freine la voiture dès qu’elle roule dessus : anticipe pour ne pas perdre trop de temps.' },
  { id: 'wind', group: 'surface', icon: '🌬️', name: 'Vent latéral', short: 'pousse la voiture sur le côté : corrige au volant', how: 'Un souffle latéral pousse la voiture vers un côté de la route : compense au volant, sans trop braquer.' },
  { id: 'conveyor', group: 'surface', icon: '🟨', name: 'Tapis roulant', short: 'la bande t’entraîne, avec ou contre toi', how: 'Un tapis roulant ajoute (ou retranche) de la vitesse à la voiture : tiens compte du sens de la bande avant les virages.' },
  { id: 'spring', group: 'surface', icon: '🟩', name: 'Ressort latéral', short: 'te projette sur le côté : reste maître du volant', how: 'Un ressort latéral te projette sur le côté de la route : reprends vite le volant pour ne pas sortir.' },
  { id: 'glass', group: 'surface', icon: '🪟', name: 'Verre fragile', short: 'la dalle cède après un contact : ne t’y attarde pas', how: 'Une dalle de verre se brise quand tu y restes trop longtemps (la voiture tombe). Traverse vite et sans coup de frein.', lesson: 'verre' },
  { id: 'powder', group: 'surface', icon: '❄️', name: 'Poudreuse', short: 'neige épaisse : elle freine la voiture', how: 'La poudreuse est molle : la voiture adhère mal, patine et ralentit. Prends de l’élan, garde les gaz et braque doucement.' },
  { id: 'reverse', group: 'surface', icon: '🙃', name: 'Volant inversé', short: 'gauche et droite sont inversés sur la dalle', how: 'Sur cette dalle le volant est inversé : braque à l’opposé. Anticipe, et rends le volant avant la sortie.' },
  { id: 'cut', group: 'surface', icon: '🔇', name: 'Moteur coupé', short: 'le moteur coupe un instant : laisse-toi porter', how: 'Le moteur est coupé un court instant : l’accélérateur ne sert à rien, laisse filer la voiture et garde ta ligne.' },
  // ---- véhicules et eau
  { id: 'moto', group: 'vehicle', icon: '🏍', name: 'Plaque moto', short: 'devient une moto : plus vive, elle penche', how: 'Roule sur la plaque : ta voiture devient une moto, plus vive. Repasser sur la même plaque te rend ta voiture.', lesson: 'plaque' },
  { id: 'water', group: 'vehicle', icon: '🌊', name: 'Eau', short: 'en voiture, tu patines et tu coules : prends un bateau', how: 'En voiture, l’eau te ralentit presque à l’arrêt, et si tu t’arrêtes tu coules (retour au checkpoint). Il faut d’abord rouler sur une plaque bateau.', lesson: 'eau' },
  { id: 'boat', group: 'vehicle', icon: '⛵', name: 'Plaque bateau', short: 'devient un bateau : il roule sur l’eau', how: 'La plaque transforme la voiture en bateau, qui flotte. Hors de l’eau il avance très mal : repasse sur la plaque pour redevenir voiture.', lesson: 'eau' },
  { id: 'glider', group: 'vehicle', icon: '🪂', name: 'Plaque deltaplane', short: 'devient un deltaplane : il plane au-dessus du vide', how: 'La plaque transforme la voiture en deltaplane, qui plane. Décolle droit et vite depuis un bord, puis repasse sur la plaque pour redevenir voiture.', lesson: 'deltaplane' },
  // ---- gravité
  { id: 'gravity', group: 'gravity', icon: '🌙', name: 'Gravité', short: 'la pesanteur change : sauts plus longs ou plus courts', how: 'Une zone de gravité change la pesanteur : en dessous de 100 %, la voiture flotte (sauts plus hauts et plus longs), au-dessus elle retombe plus vite.', lesson: 'gravite' },
  { id: 'flip', group: 'gravity', icon: '🔃', name: 'Inversion de gravité', short: 'la gravité s’inverse : la route continue au plafond', how: 'Une plaque d’inversion retourne la gravité : la voiture roule alors au plafond. Une seconde plaque la remet à l’endroit.', lesson: 'gravite' },
  // ---- murs, plafonds et formes
  { id: 'wall', group: 'shape', icon: '🧱', name: 'Mur', short: 'route sur un mur : garde de la vitesse', how: 'La route monte sur un mur : il faut de la vitesse (environ 110 km/h au moins) et les gaz. Trop lente, la voiture décroche et tu reviens au checkpoint.', lesson: 'murs' },
  { id: 'ceiling', group: 'shape', icon: '🔝', name: 'Plafond', short: 'route à l’envers : la voiture roule au plafond', how: 'La route est retournée : la voiture roule au plafond. Reste sur la route, avec de la vitesse, et regarde loin devant.', lesson: 'gravite' },
  { id: 'loop', group: 'shape', icon: '🎢', name: 'Looping', short: 'looping : assez de vitesse à l’entrée', how: 'Un looping demande de la vitesse à l’entrée : lève le pied trop tôt et la voiture décroche. Garde les gaz jusqu’au sommet.', lesson: 'murs' },
  { id: 'tube', group: 'shape', icon: '🛞', name: 'Tube', short: 'tube : la route tourne autour de toi', how: 'Dans un tube la route tourne tout autour de la voiture : garde ta vitesse et laisse-toi guider.' },
  { id: 'twist', group: 'shape', icon: '🌀', name: 'Vrille', short: 'la route se retourne : reste sur la ligne', how: 'La route se retourne sur elle-même : garde de la vitesse et reste dans l’axe jusqu’à la sortie.' },
  { id: 'fork', group: 'shape', icon: '🔀', name: 'Bifurcation', short: 'deux voies : choisis la tienne', how: 'La route se sépare en deux voies qui se rejoignent plus loin : choisis la tienne tôt. Elles n’ont pas toujours le même revêtement.' },
  { id: 'junction', group: 'shape', icon: '➕', name: 'Carrefour', short: 'carrefour : reste dans l’axe', how: 'La route en croise une autre : va tout droit et suis la ligne du circuit, sans te laisser tenter par l’autre voie.' },
  { id: 'ring', group: 'shape', icon: '⭕', name: 'Anneau turbo', short: 'passe dans l’anneau pour une poussée', how: 'Un anneau flottant donne une poussée de vitesse si tu le traverses : vise son centre.' },
  // ---- obstacles
  { id: 'spikes', group: 'obstacle', icon: '🔺', name: 'Piques', short: 'piques fixes : les toucher te renvoie au checkpoint', how: 'Les piques fixes sont mortelles : au contact, retour au checkpoint. Reste à distance et passe sur le côté libre de la route.', lesson: 'obstacles' },
  { id: 'spikesPop', group: 'obstacle', icon: '⏱', name: 'Piques escamotables', short: 'sortent et rentrent : passe quand elles sont rentrées', how: 'Ces piques sortent et rentrent au rythme du chrono, et elles sont mortelles quand elles sont sorties : observe-les, puis passe quand elles sont rentrées.', lesson: 'obstacles' },
  { id: 'bumper', group: 'obstacle', icon: '🔴', name: 'Bumper', short: 'repousse la voiture : passe à côté', how: 'Un bumper repousse la voiture avec force : passe à distance, et reste au milieu de la route.', lesson: 'obstacles' },
  { id: 'pendulum', group: 'obstacle', icon: '🪀', name: 'Boule balancier', short: 'boule qui balance : passe quand elle s’éloigne', how: 'La boule se balance d’un bord à l’autre de la route au rythme du chrono : regarde où elle va, puis passe du côté d’où elle s’éloigne.', lesson: 'animes' },
  { id: 'hammer', group: 'obstacle', icon: '🔨', name: 'Marteau tournant', short: 'marteau tournant : passe entre deux coups', how: 'Le marteau tourne sur place : observe son rythme et passe juste après son coup, sans ralentir.', lesson: 'animes' },
  { id: 'slider', group: 'obstacle', icon: '🧱', name: 'Mur coulissant', short: 'mur qui coulisse : passe par le côté ouvert', how: 'Le mur va et vient en travers de la route : passe du côté ouvert, au bon moment.', lesson: 'animes' },
  { id: 'sweeper', group: 'obstacle', icon: '🪭', name: 'Balayeur', short: 'barre qui balaie : passe quand elle est loin', how: 'La barre balaie la route : passe quand elle vient de te dépasser, et garde ta vitesse.', lesson: 'animes' },
  // ---- logique et pièces mobiles
  { id: 'mover', group: 'logic', icon: '🛗', name: 'Pièce mobile', short: 'la dalle bouge : monte au bon moment', how: 'Cette dalle monte, glisse ou tourne selon le chrono : attends le bon moment, et garde ta vitesse pour la traverser.' },
  { id: 'logic', group: 'logic', icon: '🚪', name: 'Portes logiques', short: 'des portes s’ouvrent selon ta course : cherche ce qui les ouvre', how: 'Des portes apparaissent ou disparaissent selon ce que tu fais (checkpoint passé, plaque, tour). Si la route est coupée, cherche ce qui l’ouvre.', lesson: 'portes' },
];
export const MECH_BY_ID = Object.fromEntries(MECHANICS.map((m) => [m.id, m]));
export const MECH_IDS = MECHANICS.map((m) => m.id);
export const isMechanic = (id) => Object.prototype.hasOwnProperty.call(MECH_BY_ID, id);

// Texte du rappel en course : « Nouveau · Verglas : peu d'adhérence… » (le français est la clé de la traduction : { id } -> MSG en hudMessages.js).
export const mechReminder = (m) => `Nouveau · ${m.name} : ${m.short}`;

// ---- détection ------------------------------------------------------------------------------------------------------------------------
const TUBE = new Set(['tube', 'tubeIn', 'tubeMid', 'tubeTurn', 'tubeTurnL']);
const TWIST = new Set(['twist', 'cork', 'corkL']);
const WALLP = new Set(['wall', 'ramp90', 'crest90']);

// La mécanique d'une pièce (ou plusieurs) : [id, …]. Un revêtement vide ('') n'est pas une mécanique.
function tileMechanics(t) {
  const out = [];
  const P = PIECES[t.t];
  if (!P) return out;
  for (const raw of [t.s, t.s2]) {
    const s = SURFACE_ALIAS[raw] || raw;
    if (s && s !== '-' && isMechanic(s)) out.push(s);
  }
  if (t.o || P.roll || WALLP.has(t.t)) out.push('wall');
  if (t.v) out.push('ceiling');
  if (P.kind === 'loop' || P.loopTop) out.push('loop');
  if (TUBE.has(t.t) || t.tn) out.push('tube');
  if (TWIST.has(t.t)) out.push('twist');
  if (P.kind === 'fork') out.push('fork');
  if (P.kind === 'junction') out.push('junction');
  if (t.t === 'ring') out.push('ring');
  if (t.mv) out.push('mover');
  return out;
}

// Mécaniques de départ : les règles du circuit (véhicule, gravité, inversion) comptent comme la plaque ou la zone correspondante, au départ.
function ruleMechanics(tr) {
  const out = [];
  if (tr.veh0 && tr.veh0 !== 'car' && isMechanic(tr.veh0)) out.push(tr.veh0);
  if (tr.g0 != null && tr.g0 !== 100) out.push('gravity');
  if (tr.flip0) out.push('flip');
  return out;
}
const hasLogic = (tr) => !!(tr.lg && Array.isArray(tr.lg.rules) && tr.lg.rules.length);

// Les mécaniques présentes dans un circuit, dans l'ordre du catalogue.
export function mechanicsOf(track) {
  const found = new Set();
  if (!track) return [];
  for (const t of track.tiles || []) for (const id of tileMechanics(t)) found.add(id);
  for (const d of track.decos || []) if (d && isObstacle(d.k) && isMechanic(d.k)) found.add(d.k);
  for (const id of ruleMechanics(track)) found.add(id);
  if (hasLogic(track)) found.add('logic');
  return MECH_IDS.filter((id) => found.has(id));
}

// Où on les rencontre : { id: [{ x, y, z, r }, …] } (mètres : centre de la pièce ou de l'obstacle, et son rayon). Une liste VIDE : la mécanique agit dès le départ (règle du circuit,
// logique) : le rappel peut venir tout de suite. Sert au rappel en course (race/mechanics.js), jamais à la physique.
export function mechanicSites(track) {
  const sites = {};
  const add = (id, x, y, z, r) => { (sites[id] || (sites[id] = [])).push({ x, y, z, r }); };
  for (const id of mechanicsOf(track)) sites[id] = [];
  if (!track) return sites;
  for (const t of track.tiles || []) {
    const P = PIECES[t.t];
    if (!P) continue;
    const size = P.size || 1;
    const x = (t.x + size / 2) * CELL, z = (t.z + size / 2) * CELL, y = (t.l + Math.max(0, P.rise || 0) / 2) * LEVEL_H;
    for (const id of tileMechanics(t)) add(id, x, y, z, (size * CELL) / 2);
  }
  for (const d of track.decos || []) if (d && isObstacle(d.k) && isMechanic(d.k)) add(d.k, d.x, d.y || 0, d.z, 8);
  return sites;
}

// ---- profil ---------------------------------------------------------------------------------------------------------------------------
const objOf = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const lvl = (v) => (v === 1 || v === 2 ? v : v >= 2 ? 2 : v >= 1 ? 1 : 0);
export const mechLevel = (p, id) => lvl(objOf(p && p.mech)[id]);
export const mechSeen = (p, id) => mechLevel(p, id) >= 1;
export const mechMet = (p, id) => mechLevel(p, id) >= 2;
// Marque une mécanique au niveau donné (jamais vers le bas) ; vrai si le profil a changé.
export function markMech(p, id, level = 2) {
  if (!p || !isMechanic(id)) return false;
  const cur = mechLevel(p, id), nv = Math.min(2, Math.max(1, level | 0));
  if (nv <= cur) return false;
  p.mech = { ...objOf(p.mech), [id]: nv };
  return true;
}
// Mécaniques de la liste que le joueur n'a pas encore vues (la carte « Nouveau » les montre) / pas encore rencontrées en course (le rappel les annonce).
export const newMechanics = (p, ids) => ids.filter((id) => !mechSeen(p, id));
export const unmetMechanics = (p, ids) => ids.filter((id) => !mechMet(p, id));
// Mécaniques découvertes (niveau 1 ou 2), dans l'ordre du catalogue.
export const discoveredMechanics = (p) => MECH_IDS.filter((id) => mechSeen(p, id));

// Fusion de deux profils (cloudsave.js) : l'UNION des mécaniques, au plus haut niveau. Les identifiants inconnus de cette version sont gardés (une version plus récente peut en connaître d'autres).
export function mergeMech(a, b) {
  const A = objOf(a), B = objOf(b), out = {};
  for (const id of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()) {
    const v = Math.max(lvl(A[id]), lvl(B[id]));
    if (v) out[id] = v;
  }
  return out;
}

// Migration d'un profil d'avant la 0.20.0 : ce que le joueur a déjà rencontré dans la carrière (un circuit avec un record local) compte comme appris, au niveau 2 : il ne revoit pas
// de carte « Nouveau » pour ce qu'il connaît depuis longtemps. Ne retire rien, ne s'applique qu'une fois (le champ mech existe ensuite, même vide).
// builtins : [{ key, track }] ; hasRecord(key) -> bool.
export function seedMech(p, builtins, hasRecord) {
  if (!p || p.mech !== undefined) return false;
  const mech = {};
  for (const b of builtins || []) {
    if (!hasRecord(b.key)) continue;
    for (const id of mechanicsOf(b.track)) mech[id] = 2;
  }
  p.mech = mech;
  return true;
}
