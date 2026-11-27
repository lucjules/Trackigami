// Épreuve « chapitre d'une traite » (COMPLETE-014, docs/CHAPITRE-D-UNE-TRAITE.md) : les 6 circuits d'un chapitre de la carrière à la suite, au temps cumulé,
// avec un classement dédié. Module pur (ni rendu ni navigateur), dans la FERMETURE de la vérification serveur (verify.js : verifyChain) : le jeu et le serveur
// calculent la même clé et retrouvent les mêmes circuits.
//
//   clé ::= 'ch-' chapitre '-' empreinte [ '~v1.as-1' ]
//     chapitre   clé du chapitre (themes.js : CHAPTER_KEYS), ex. desert, manoeuvres
//     empreinte  hashString des 6 clés b-<id>-<hash> du chapitre, dans l'ordre de la carrière, jointes par « | »
//     ~v1.as-1   catégorie « avec aides à la conduite » (aids.js), comme pour une course seule ; aucune autre catégorie de record n'est acceptée
//   ex. ch-desert-1k2f9az      ch-manoeuvres-0x7d3kq~v1.as-1
//
// L'empreinte change dès qu'un des 6 circuits change (leur clé dépend de tout leur code) : un enchaînement modifié ouvre un nouveau classement (même règle
// que pour un circuit, RISK-001). Le serveur RECALCULE la liste à partir de ses propres circuits et exige la même clé : le client n'envoie jamais la liste.
// La carrière entière n'est pas proposée : elle dépasse les limites de la table `scores` (temps < 3 600 s, commandes ≤ 400 000 caractères).
import { BUILTIN_TRACKS, buildBuiltin } from './tracks.js';
import { hashString } from './track.js';
import { CHAPTER_KEYS } from './themes.js';
import { DT, MAX_RUN_SECONDS, MAX_CHAIN_SECONDS } from './constants.js';
import { splitKey, parseVariant } from './variants.js';

export const CHAIN_LEGS = 6;                    // = CHAPTER_SIZE de career.js (module avec stockage, hors de la fermeture serveur) : tools/test-chain.mjs vérifie l'égalité
export { MAX_CHAIN_SECONDS };                   // durée totale maximale, 1 200 s (constants.js : le stockage la lit aussi) : 2,3 × la plus grande somme des temps bronze d'un chapitre (530 s), < 3 600 s de scores.time
export const MAX_LEG_SECONDS = MAX_RUN_SECONDS; // une manche : comme une course seule (600 s)
export const MAX_CHAIN_INPUTS_CHARS = 400000;   // les 6 commandes jointes par « , » (scores.inputs ≤ 400 000 caractères)
export const CHAIN_SEP = ',';                   // absent de l'alphabet base64 : la jonction se relit sans ambiguïté
export const CHAIN_TIME_TOLERANCE = 0.003;      // somme annoncée des temps des manches contre le temps total annoncé (contrôle de forme, avant tout rejeu)
export const CHAIN_KEY_RE = /^ch-([a-z]{1,20})-([0-9a-z]{1,16})(?:~([a-z0-9.-]{1,40}))?$/;

const builtinKey = (def) => `b-${def.id}-${hashString(buildBuiltin(def).encode())}`;

// Nombre de chapitres complets (14 : 11 décors, l'Atelier et deux chapitres bonus).
export const chainChapters = () => Math.min(CHAPTER_KEYS.length, Math.floor(BUILTIN_TRACKS.length / CHAIN_LEGS));

// Index (dans BUILTIN_TRACKS, l'ordre de la carrière) des 6 circuits du chapitre ch.
export function chainLegIndexes(ch) {
  if (!Number.isInteger(ch) || ch < 0 || ch >= chainChapters()) throw new Error('Chapitre inconnu.');
  return Array.from({ length: CHAIN_LEGS }, (_, i) => ch * CHAIN_LEGS + i);
}

// Clé (sans catégorie) d'un chapitre, à partir des clés de ses 6 circuits (déjà connues du jeu : App.builtins).
export function chainKeyFrom(ch, keys) {
  if (!Array.isArray(keys) || keys.length !== CHAIN_LEGS || keys.some((k) => typeof k !== 'string' || !k.startsWith('b-'))) throw new Error('Enchaînement invalide.');
  return `ch-${CHAPTER_KEYS[ch]}-${hashString(keys.join('|'))}`;
}

// Clé d'un chapitre ; aided : catégorie « avec aides ». keys : les clés des circuits si on les a déjà (sinon recalculées).
export function chainKey(ch, { aided = false, keys = null } = {}) {
  const k = chainKeyFrom(ch, keys || chainLegIndexes(ch).map((i) => builtinKey(BUILTIN_TRACKS[i])));
  return aided ? `${k}~v1.as-1` : k;
}

export const isChainKey = (key) => typeof key === 'string' && key.startsWith('ch-');

// Clé -> { ch, chapter, base, aided, keys, tracks, name }. Les circuits sont construits à neuf (le rejeu ne doit pas hériter d'un état). Lève une erreur
// sur une clé mal formée, un chapitre inconnu, une catégorie autre que « avec aides », ou une empreinte qui ne correspond pas à CES circuits.
export function chainForKey(key) {
  const m = CHAIN_KEY_RE.exec(String(key || ''));
  if (!m) throw new Error('Clé d’enchaînement invalide.');
  const { base, variant } = splitKey(key);
  let aided = false;
  if (variant) {
    const v = parseVariant(variant);         // (lève « Catégorie de record inconnue. » sur une écriture non canonique)
    if (Object.keys(v).length !== 1 || v.as !== '1') throw new Error('Cette catégorie n’existe pas pour un enchaînement.');
    aided = true;
  }
  const ch = CHAPTER_KEYS.indexOf(m[1]);
  if (ch < 0 || ch >= chainChapters()) throw new Error('Chapitre inconnu.');
  const defs = chainLegIndexes(ch).map((i) => BUILTIN_TRACKS[i]);
  const tracks = defs.map((d) => buildBuiltin(d));
  const keys = defs.map((d, i) => `b-${d.id}-${hashString(tracks[i].encode())}`);
  if (chainKeyFrom(ch, keys) !== base) throw new Error('Version de l’enchaînement différente : mets le jeu à jour.');
  return { ch, chapter: m[1], base, aided, keys, tracks, name: `Chapitre ${ch + 1} · d'une traite${aided ? ' (aides)' : ''}` };
}

// Temps cumulé (s) d'une suite de manches données en pas de simulation : la même opération chez le jeu et au serveur (pas d'écart d'arrondi).
export const chainTime = (steps) => steps.reduce((a, b) => a + b, 0) * DT;
// Fins de manche en pas cumulés (les « temps intermédiaires » d'un enchaînement).
export function chainSplits(steps) {
  let s = 0;
  return steps.map((x) => (s += x));
}

// Contrôle de FORME d'une soumission (aucun rejeu) : { legs: [6 commandes base64], times: [6 temps], time }. Renvoie '' si elle est acceptable, sinon la raison.
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
export function chainShapeError({ legs, times, time }) {
  if (!Array.isArray(legs) || legs.length !== CHAIN_LEGS || !Array.isArray(times) || times.length !== CHAIN_LEGS) return `Un enchaînement compte exactement ${CHAIN_LEGS} manches.`;
  let chars = CHAIN_LEGS - 1;
  for (const l of legs) {
    if (typeof l !== 'string' || !l || !B64.test(l)) return 'Commandes d’une manche invalides.';
    chars += l.length;
  }
  if (chars > MAX_CHAIN_INPUTS_CHARS) return 'Enchaînement trop long (commandes).';
  let sum = 0;
  for (const t of times) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t > MAX_LEG_SECONDS) return 'Temps d’une manche invalide.';
    sum += t;
  }
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time > MAX_CHAIN_SECONDS) return 'Temps total invalide ou trop long.';
  if (!(Math.abs(sum - time) <= CHAIN_TIME_TOLERANCE)) return 'Le temps total n’est pas la somme des manches.';
  return '';
}
