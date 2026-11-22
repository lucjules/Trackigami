// Éléments partagés par les familles de méthodes de Track (voir track.js).
// L'eau est un peu sous le niveau de la chaussée.
export const WATER_DROP = 0.35;

// Plaque bateau : une très légère montée de l'eau (entrée de la pièce, un peu sous la route) jusqu'au sol (sortie, au niveau normal).
export const boatDrop = (along) => WATER_DROP * (1 - Math.max(0, Math.min(1, along || 0)));

// Couleurs personnalisées d'une pièce : { road, line, rail } en #rrggbb (clés absentes = couleur d'origine). null si aucune.
export const COLOR_KEYS = ['road', 'line', 'rail'];

export const HEX = /^#[0-9a-f]{6}$/i;

// ---- Angles de décoration (TECH-002, phase 7) ------------------------------------------------------------------------------------------------------
// UNE fonction par sorte d'angle, et ce sont elles seules qui écrivent un roulis ou une inclinaison de décoration (Track.addDeco). Le code garde un angle au millième
// (Track.encode : toFixed(3)) ; la normalisation doit donc être IDEMPOTENTE sur cette grille : normalize(normalize(x)) === normalize(x), sinon le circuit relu n'est pas celui
// qui a été écrit, et sa signature (donc sa clé de classement u-…) change à chaque lecture. L'ancienne normalisation ramenait dans ]−π, π] (avec un seuil π + 1e-6), arrondissait
// au pas de π/4 puis au millième : π devenait 3,142, qui dépasse π de 4e-4, repassait à −3,142 à la lecture suivante, puis 3,142… (signature et clé alternaient ; la vérification
// d'auteur était perdue au retour dans l'éditeur ; tout envoi de temps était refusé).
// Ordre : ramener dans ]−π, π] (avec la demi-marge de l'arrondi, 5e-4, pour que la valeur arrondie de π soit elle-même dans l'intervalle), arrondir au millième.
// Valeur canonique de ±π : +3,142 (le millième le plus proche de π, celui que l'ancien code écrivait déjà à la première sauvegarde). Domaine des valeurs normalisées :
// [−3,141 ; 3,142].
const TAU = Math.PI * 2, QUARTER = Math.PI / 4, HALF_MILLI = 5e-4;
const milli = (v) => +v.toFixed(3) || 0;      // (|| 0 : jamais −0)

// Angle libre (inclinaison rx, roulis rz d'une décoration visuelle). v non fini : 0.
export function normalizeAngle(v) {
  if (!Number.isFinite(v)) return 0;
  let w = ((v % TAU) + TAU) % TAU;
  if (w > Math.PI + HALF_MILLI) w -= TAU;
  return milli(w);
}

// Roulis d'un OBSTACLE : multiple de π/4 seulement (la forme de contact tourne avec lui : obstacles.js, toLocalObs). Le multiple est cherché AVANT toute réduction d'angle,
// puis ramené modulo 8 dans {−3 … 4} : π (k = 4) est la valeur canonique de ±π, jamais −π, quelle que soit la façon dont le code l'a écrit (3,142 ou −3,142).
export function normalizeRoll(v) {
  if (!Number.isFinite(v)) return 0;
  const k = ((Math.round(v / QUARTER) % 8) + 8) % 8;
  return milli((k > 4 ? k - 8 : k) * QUARTER);
}

export function cleanColors(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of COLOR_KEYS) if (typeof c[k] === 'string' && HEX.test(c[k])) out[k] = c[k].toLowerCase();
  return Object.keys(out).length ? out : null;
}

export const W = { x: 0, z: 0 }, W2 = { x: 0, z: 0 };

export const MP = {};
