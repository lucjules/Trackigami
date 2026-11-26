// Identité musicale par décor (COMPLETE-006) : douze variantes de la musique de course, une par décor de themes.js. Module de DONNÉES (client) : aucun accès à Web Audio ici ;
// AudioEngine.js (via musicVariantEngine.js) les joue. Rien de ce fichier n'entre dans la fermeture du serveur ni dans le noyau de simulation.
//
// Une variante décrit un morceau court de quatre mesures (16 doubles-croches chacune) qui boucle :
//   bpm, span      tempo au repos et accélération à pleine vitesse (le tempo suit la vitesse de la voiture, comme le chill d'origine : 92 → 98 BPM)
//   root, scale    tonique (note MIDI de la basse, 28 à 48) et gamme (SCALES) ; les accords s'empilent par tierces sur les degrés de la gamme
//   prog           le degré de l'accord de chacune des quatre mesures
//   swing          retard des doubles-croches impaires (fraction d'une double-croche)
//   open           fréquence de coupure du filtre maître au repos puis à pleine vitesse : l'intensité (la musique « s'ouvre » avec la vitesse)
//   duck           profondeur du sidechain à chaque grosse caisse (fraction du niveau qui reste : plus petit = plus pompé)
//   pad, bass, lead, drums   les voix. Les motifs de la basse et des percussions sont des listes de pas (0 à 15) ; ceux de la mélodie sont [pas, décalage de degré, vitesse minimale] :
//                  une note ne joue que si la voiture va au moins à cette vitesse (0 à 1) : plus on va vite, plus la mélodie se remplit.
// Chaque variante est un choix d'auteur (tempo, tonalité, timbres, motif) : rien n'est tiré au hasard, la sélection est une simple table (variantFor).
import { DECORS } from './themes.js';

// Gammes : demi-tons depuis la tonique (6 ou 7 degrés).
export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygDom: [0, 1, 4, 5, 7, 8, 10], harmMinor: [0, 2, 3, 5, 7, 8, 11], wholeTone: [0, 2, 4, 6, 8, 10],
};
// Les timbres que le moteur sait jouer (musicVariantEngine.js) : toute autre valeur est refusée par validateVariant.
export const KINDS = {
  pad: ['', 'soft', 'glass', 'saw', 'drone', 'air'],
  bass: ['round', 'saw', 'sub', 'pulse', 'pluck'],
  lead: ['pluck', 'bell', 'marimba', 'steel', 'saw', 'pulse', 'oud', 'tick', 'blip', 'flute'],
  kick: ['', 'kick', 'soft', 'tom', 'sub'],
  snare: ['', 'clap', 'rim', 'snap', 'block', 'anvil'],
  hat: ['', 'hat', 'shaker', 'metal', 'tick'],
};
export const LIMITS = {
  bpm: [66, 124], span: [0, 10], root: [28, 48], swing: [0, 0.25], openLo: [500, 2000], openHi: [3000, 9000], duck: [0.05, 0.6], gain: [0, 1.5], oct: [0, 2], bassLen: [1, 6],
};
export const BARS = 4, STEPS = 16;

const V = (id, o) => Object.freeze({ id, ...o });

export const VARIANTS = Object.freeze({
  // Désert crépuscule : gamme phrygienne dominante (ré), luth à cordes pincées, tambours à main, balancement léger.
  desert: V('desert', {
    bpm: 98, span: 6, root: 38, scale: 'phrygDom', prog: [0, 0, 5, 6], swing: 0.12, open: [1100, 5200], duck: 0.35,
    pad: { kind: 'soft', gain: 0.8 }, bass: { kind: 'round', len: 2, gain: 1, at: [[0, 0], [3, 12], [6, 7], [10, 0], [12, 10]] },
    lead: { kind: 'oud', oct: 0, gain: 1, motifs: [[[0, 0, 0], [3, 1, 0.15], [6, 2, 0], [8, 4, 0.3], [10, 2, 0.45], [13, 1, 0.6]], [[0, 2, 0], [2, 1, 0.3], [4, 0, 0], [7, 1, 0.2], [10, 3, 0.5], [12, 2, 0.15]]] },
    drums: { kick: 'tom', kickAt: [0, 7, 10], snare: 'block', snareAt: [4, 12], hat: 'shaker', hatAt: [[2, 0.15], [6, 0.15], [10, 0.15], [14, 0.15], [5, 0.6], [13, 0.6]] },
  }),
  // Nuit polaire : la mineure (la), cloches de verre espacées, basse tenue, quasi pas de percussion : lent et froid.
  polar: V('polar', {
    bpm: 78, span: 6, root: 33, scale: 'aeolian', prog: [0, 5, 3, 4], swing: 0, open: [700, 3800], duck: 0.5,
    pad: { kind: 'glass', gain: 1 }, bass: { kind: 'sub', len: 6, gain: 0.9, at: [[0, 0], [8, 7]] },
    lead: { kind: 'bell', oct: 1, gain: 0.8, motifs: [[[0, 4, 0], [6, 2, 0.25], [11, 0, 0.5]], [[3, 2, 0], [9, 4, 0.2], [14, 6, 0.55]]] },
    drums: { kick: 'soft', kickAt: [0], snare: '', snareAt: [], hat: 'shaker', hatAt: [[10, 0.6], [14, 0.8]] },
  }),
  // Jungle néon : mode dorien (mi), marimba très bavard, tambours et blocs de bois syncopés.
  jungle: V('jungle', {
    bpm: 112, span: 8, root: 40, scale: 'dorian', prog: [0, 3, 0, 4], swing: 0.08, open: [1300, 6000], duck: 0.3,
    pad: { kind: 'soft', gain: 0.5 }, bass: { kind: 'pluck', len: 1, gain: 1, at: [[0, 0], [3, 0], [6, 7], [8, 0], [11, 12], [14, 10]] },
    lead: { kind: 'marimba', oct: 1, gain: 1, motifs: [[[0, 0, 0], [1, 2, 0.4], [3, 4, 0], [5, 2, 0.2], [8, 0, 0.1], [10, 2, 0], [12, 4, 0.5], [14, 6, 0.7]], [[0, 4, 0], [2, 2, 0.2], [3, 0, 0], [6, 2, 0.3], [9, 4, 0.1], [11, 2, 0.45], [13, 0, 0], [15, 1, 0.8]]] },
    drums: { kick: 'tom', kickAt: [0, 6, 10], snare: 'block', snareAt: [4, 12], hat: 'shaker', hatAt: [[2, 0.1], [6, 0.1], [10, 0.1], [14, 0.1], [3, 0.5], [11, 0.5]] },
  }),
  // Ville futuriste : la dièse mineur, basse carrée en croches, arpège en dents de scie, grosse caisse « quatre temps » : le plus synthwave.
  city: V('city', {
    bpm: 118, span: 6, root: 42, scale: 'aeolian', prog: [0, 5, 2, 6], swing: 0, open: [900, 8000], duck: 0.12,
    pad: { kind: 'saw', gain: 0.7 }, bass: { kind: 'pulse', len: 1, gain: 0.9, at: [[0, 0], [2, 0], [4, 0], [6, 12], [8, 0], [10, 0], [12, 0], [14, 12]] },
    lead: { kind: 'saw', oct: 1, gain: 0.8, motifs: [[[0, 0, 0.1], [2, 2, 0.2], [4, 4, 0.1], [6, 2, 0.35], [8, 0, 0.1], [10, 2, 0.45], [12, 4, 0.2], [14, 7, 0.6]], [[0, 7, 0.1], [2, 4, 0.2], [4, 2, 0.1], [6, 4, 0.35], [8, 7, 0.1], [10, 4, 0.45], [12, 2, 0.2], [14, 0, 0.6]]] },
    drums: { kick: 'kick', kickAt: [0, 4, 8, 12], snare: 'clap', snareAt: [4, 12], hat: 'hat', hatAt: [[2, 0.1], [6, 0.1], [10, 0.1], [14, 0.1], [1, 0.6], [5, 0.6], [9, 0.6], [13, 0.6]] },
  }),
  // Archipel tropical : sol majeur, pan d'acier sur une pentatonique, caisse claire sèche, balancement marqué.
  isles: V('isles', {
    bpm: 104, span: 6, root: 43, scale: 'ionian', prog: [0, 4, 5, 3], swing: 0.18, open: [1500, 6500], duck: 0.4,
    pad: { kind: 'soft', gain: 0.6 }, bass: { kind: 'round', len: 2, gain: 1, at: [[0, 0], [3, 0], [6, 7], [8, 0], [11, 7], [14, 12]] },
    lead: { kind: 'steel', oct: 1, gain: 1, motifs: [[[0, 4, 0], [3, 2, 0.2], [6, 0, 0], [8, 2, 0.3], [11, 4, 0.1], [14, 5, 0.5]], [[0, 2, 0], [2, 4, 0.4], [6, 5, 0.1], [8, 4, 0], [10, 2, 0.35], [13, 0, 0.2]]] },
    drums: { kick: 'soft', kickAt: [0, 10], snare: 'snap', snareAt: [4, 12], hat: 'shaker', hatAt: [[1, 0.2], [3, 0.2], [5, 0.2], [7, 0.2], [9, 0.2], [11, 0.2], [13, 0.2], [15, 0.2]] },
  }),
  // Volcan : do phrygien, bourdon grave, basse en dents de scie, grosse caisse longue sur deux temps : lourd et lent.
  volcano: V('volcano', {
    bpm: 88, span: 8, root: 36, scale: 'phrygian', prog: [0, 0, 1, 0], swing: 0, open: [800, 5000], duck: 0.2,
    pad: { kind: 'drone', gain: 1 }, bass: { kind: 'saw', len: 3, gain: 1, at: [[0, 0], [6, 0], [8, 1], [11, 0], [14, 7]] },
    lead: { kind: 'saw', oct: 0, gain: 0.7, motifs: [[[0, 0, 0.2], [8, 1, 0.4]], [[4, 0, 0.3], [12, 4, 0.5], [14, 1, 0.7]]] },
    drums: { kick: 'sub', kickAt: [0, 6, 10], snare: 'clap', snareAt: [8], hat: 'metal', hatAt: [[7, 0.7], [15, 0.7]] },
  }),
  // Station orbitale : mi lydien, boîte à musique dans les aigus, rien que des cœurs de grosse caisse ; la plus lente et la plus aérienne.
  orbit: V('orbit', {
    bpm: 72, span: 6, root: 40, scale: 'lydian', prog: [0, 1, 0, 4], swing: 0, open: [900, 7500], duck: 0.55,
    pad: { kind: 'glass', gain: 0.9 }, bass: { kind: 'sub', len: 6, gain: 0.8, at: [[0, 0]] },
    lead: { kind: 'tick', oct: 2, gain: 0.9, motifs: [[[0, 4, 0], [3, 6, 0.2], [6, 2, 0.1], [9, 4, 0.4], [12, 6, 0.3], [15, 8, 0.7]], [[0, 6, 0], [3, 4, 0.2], [6, 8, 0.1], [9, 6, 0.4], [12, 2, 0.3], [14, 4, 0.6]]] },
    drums: { kick: 'soft', kickAt: [0, 3], snare: '', snareAt: [], hat: 'shaker', hatAt: [[8, 0.8], [12, 0.8]] },
  }),
  // Canyon de cristal : si bémol lydien, cloches d'arpèges serrés, cliquetis métalliques, pas de grosse caisse.
  caves: V('caves', {
    bpm: 84, span: 6, root: 34, scale: 'lydian', prog: [0, 4, 1, 5], swing: 0, open: [1000, 6800], duck: 0.6,
    pad: { kind: 'air', gain: 0.9 }, bass: { kind: 'sub', len: 5, gain: 0.8, at: [[0, 0], [8, 7]] },
    lead: { kind: 'bell', oct: 2, gain: 0.8, motifs: [[[0, 0, 0], [2, 2, 0.1], [4, 4, 0], [6, 6, 0.2], [8, 4, 0.3], [10, 2, 0.1], [12, 4, 0.5], [14, 7, 0.7]], [[0, 7, 0], [2, 4, 0.1], [4, 2, 0], [6, 0, 0.2], [8, 2, 0.3], [10, 4, 0.1], [12, 6, 0.5], [14, 8, 0.7]]] },
    drums: { kick: '', kickAt: [], snare: '', snareAt: [], hat: 'metal', hatAt: [[4, 0.3], [12, 0.3], [2, 0.8], [10, 0.8]] },
  }),
  // Ville dans les nuages : la bémol majeur, flûte sur un lit aérien, caisse claire légère : clair et dégagé.
  sky: V('sky', {
    bpm: 108, span: 6, root: 44, scale: 'ionian', prog: [0, 2, 3, 4], swing: 0.1, open: [1700, 7500], duck: 0.45,
    pad: { kind: 'air', gain: 0.8 }, bass: { kind: 'round', len: 3, gain: 0.9, at: [[0, 0], [6, 7], [8, 0], [14, 7]] },
    lead: { kind: 'flute', oct: 1, gain: 1, motifs: [[[0, 4, 0], [4, 2, 0.2], [6, 4, 0], [8, 5, 0.3], [12, 4, 0.1], [14, 2, 0.5]], [[0, 2, 0], [3, 4, 0.3], [6, 5, 0.1], [8, 7, 0.2], [12, 5, 0.4], [14, 4, 0]]] },
    drums: { kick: 'soft', kickAt: [0, 8], snare: 'snap', snareAt: [4, 12], hat: 'shaker', hatAt: [[2, 0.2], [6, 0.2], [10, 0.2], [14, 0.2]] },
  }),
  // Fonds marins : ré mixolydien, bulles (sons qui montent), grosse caisse feutrée, la plus étouffée (filtre fermé) et la plus balancée.
  reef: V('reef', {
    bpm: 90, span: 6, root: 38, scale: 'mixolydian', prog: [0, 6, 3, 0], swing: 0.2, open: [800, 4200], duck: 0.4,
    pad: { kind: 'soft', gain: 0.8 }, bass: { kind: 'sub', len: 3, gain: 1, at: [[0, 0], [5, 0], [8, 7], [13, 12]] },
    lead: { kind: 'blip', oct: 1, gain: 0.9, motifs: [[[0, 4, 0], [2, 2, 0.3], [5, 4, 0.1], [7, 6, 0.5], [10, 2, 0], [13, 4, 0.4]], [[1, 2, 0.2], [4, 4, 0], [6, 6, 0.3], [9, 4, 0.1], [12, 2, 0], [14, 0, 0.6]]] },
    drums: { kick: 'soft', kickAt: [0, 9], snare: 'rim', snareAt: [12], hat: 'shaker', hatAt: [[4, 0.25], [8, 0.25], [14, 0.25]] },
  }),
  // Usine mécanique : si harmonique mineur, aucun lit de synthés, basse en doubles-croches, enclume et cliquetis : le plus rythmique.
  factory: V('factory', {
    bpm: 112, span: 8, root: 35, scale: 'harmMinor', prog: [0, 0, 5, 4], swing: 0, open: [1100, 7000], duck: 0.15,
    pad: { kind: '', gain: 0 }, bass: { kind: 'saw', len: 1, gain: 0.9, at: [[0, 0], [1, 0], [2, 0], [3, 12], [4, 0], [5, 0], [6, 0], [7, 12], [8, 0], [9, 0], [10, 0], [11, 12], [12, 0], [13, 0], [14, 7], [15, 7]] },
    lead: { kind: 'pulse', oct: 1, gain: 0.8, motifs: [[[0, 0, 0.1], [3, 0, 0.1], [6, 2, 0.4], [10, 4, 0.2], [14, 2, 0.6]], [[0, 4, 0.1], [3, 2, 0.1], [6, 0, 0.4], [10, 2, 0.2], [14, 4, 0.6]]] },
    drums: { kick: 'kick', kickAt: [0, 4, 8, 12], snare: 'anvil', snareAt: [4, 12], hat: 'metal', hatAt: [[2, 0.1], [6, 0.1], [10, 0.1], [14, 0.1], [7, 0.55], [15, 0.55]] },
  }),
  // Atelier des mécanismes : fa mixolydien, boîte à musique régulière comme un mouvement d'horloge, tic-tac et blocs de bois.
  atelier: V('atelier', {
    bpm: 100, span: 8, root: 41, scale: 'mixolydian', prog: [0, 3, 4, 3], swing: 0, open: [1400, 6200], duck: 0.5,
    pad: { kind: 'soft', gain: 0.35 }, bass: { kind: 'pluck', len: 2, gain: 0.9, at: [[0, 0], [4, 7], [8, 0], [12, 7]] },
    lead: { kind: 'tick', oct: 1, gain: 1, motifs: [[[0, 0, 0], [2, 2, 0], [4, 4, 0], [6, 2, 0.2], [8, 0, 0], [10, 2, 0.3], [12, 4, 0.1], [14, 6, 0.5]], [[0, 4, 0], [2, 2, 0], [4, 0, 0], [6, 2, 0.2], [8, 4, 0], [10, 6, 0.3], [12, 4, 0.1], [14, 2, 0.5]]] },
    drums: { kick: 'soft', kickAt: [0, 8], snare: 'block', snareAt: [4, 12], hat: 'tick', hatAt: [[2, 0], [6, 0], [10, 0], [14, 0], [1, 0.5], [9, 0.5]] },
  }),
});

export const VARIANT_IDS = Object.freeze(Object.keys(VARIANTS));

// La variante d'un décor : table pure, déterministe (le même décor donne toujours la même variante, l'objet est gelé). Un décor inconnu ou vide : aucune variante (le chill d'origine).
export const variantFor = (decor) => (typeof decor === 'string' && Object.prototype.hasOwnProperty.call(VARIANTS, decor) ? VARIANTS[decor] : null);

// Quelle musique pour une course, selon l'écran (règles d'origine de main.js, conservées) : l'ambiance d'auteur « Aucune » coupe, « Groove du menu » joue le menu, sinon la musique de
// course ; en multijoueur et à l'Académie l'ambiance d'auteur est ignorée et la musique reste toujours le chill d'origine (aucune variante : kind 'game' sans décor).
// style : remplace l'ambiance d'auteur (un script de circuit qui change la musique en route).
export function musicPlan(track, opts, style) {
  const fixed = !!(opts && (opts.multi || opts.academy));
  const mus = style !== undefined ? style : !fixed && track && track.ambiance ? track.ambiance.music : '';
  if (mus === 'none') return { kind: 'none', decor: '' };
  if (mus === 'menu') return { kind: 'menu', decor: '' };
  return { kind: 'game', decor: !fixed && track && VARIANTS[track.decor] ? track.decor : '' };
}

// Degré d'une gamme, avec report d'octave (les degrés négatifs descendent).
export function scaleNote(v, degree) {
  const s = SCALES[v.scale], n = s.length;
  const d = Math.round(degree), o = Math.floor(d / n);
  return o * 12 + s[((d % n) + n) % n];
}
// Les notes (demi-tons depuis la tonique) de l'accord bâti sur un degré : tierces empilées, 3 ou 4 voix.
export function chordOffsets(v, degree, voices = 4) {
  const out = [];
  for (let i = 0; i < voices; i++) out.push(scaleNote(v, degree + 2 * i));
  return out;
}

// Tous les défauts d'une variante (liste vide = valide) : bornes des nombres, timbres connus, motifs dans la mesure.
export function validateVariant(v) {
  const e = [];
  const inr = (x, [a, b], name) => { if (!Number.isFinite(x) || x < a || x > b) e.push(`${name} = ${x} hors de [${a}, ${b}]`); };
  if (!v || typeof v !== 'object') return ['variante absente'];
  if (!DECORS[v.id]) e.push(`id « ${v.id} » : pas un décor de themes.js`);
  inr(v.bpm, LIMITS.bpm, 'bpm'); inr(v.span, LIMITS.span, 'span'); inr(v.root, LIMITS.root, 'root'); inr(v.swing, LIMITS.swing, 'swing'); inr(v.duck, LIMITS.duck, 'duck');
  if (!SCALES[v.scale]) e.push(`gamme inconnue : ${v.scale}`);
  if (!Array.isArray(v.open) || v.open.length !== 2) e.push('open : [repos, pleine vitesse]');
  else { inr(v.open[0], LIMITS.openLo, 'open[0]'); inr(v.open[1], LIMITS.openHi, 'open[1]'); if (v.open[1] <= v.open[0]) e.push('open : la coupure doit monter avec la vitesse'); }
  if (!Array.isArray(v.prog) || v.prog.length !== BARS || !v.prog.every((d) => Number.isInteger(d) && d >= 0 && d < 7)) e.push(`prog : ${BARS} degrés entiers de 0 à 6`);
  const step = (s, name) => { if (!Number.isInteger(s) || s < 0 || s >= STEPS) e.push(`${name} : pas ${s} hors de la mesure`); };
  const kind = (what, k) => { if (!KINDS[what].includes(k)) e.push(`${what} : timbre inconnu « ${k} »`); };
  if (!v.pad || !v.bass || !v.lead || !v.drums) return [...e, 'voix manquantes (pad, bass, lead, drums)'];
  kind('pad', v.pad.kind); inr(v.pad.gain, LIMITS.gain, 'pad.gain');
  kind('bass', v.bass.kind); inr(v.bass.gain, LIMITS.gain, 'bass.gain'); inr(v.bass.len, LIMITS.bassLen, 'bass.len');
  if (!Array.isArray(v.bass.at) || !v.bass.at.length) e.push('bass.at : au moins une note');
  else for (const [s, off] of v.bass.at) { step(s, 'bass'); if (!Number.isInteger(off) || off < 0 || off > 12) e.push(`bass : décalage ${off}`); }
  kind('lead', v.lead.kind); inr(v.lead.gain, LIMITS.gain, 'lead.gain'); inr(v.lead.oct, LIMITS.oct, 'lead.oct');
  if (!Array.isArray(v.lead.motifs) || !v.lead.motifs.length || v.lead.motifs.length > 2) e.push('lead.motifs : un ou deux motifs');
  else for (const m of v.lead.motifs) {
    if (!Array.isArray(m) || !m.length) { e.push('motif vide'); continue; }
    for (const [s, off, minS] of m) { step(s, 'lead'); if (!Number.isInteger(off) || off < -3 || off > 9) e.push(`lead : décalage ${off}`); inr(minS, [0, 1], 'lead.minSpeed'); }
  }
  const d = v.drums;
  kind('kick', d.kick); kind('snare', d.snare); kind('hat', d.hat);
  for (const s of d.kickAt) step(s, 'kick');
  for (const s of d.snareAt) step(s, 'snare');
  for (const [s, minS] of d.hatAt) { step(s, 'hat'); inr(minS, [0, 1], 'hat.minSpeed'); }
  if ((d.kick === '') !== (d.kickAt.length === 0)) e.push('kick : timbre et pas vont ensemble');
  if ((d.snare === '') !== (d.snareAt.length === 0)) e.push('snare : timbre et pas vont ensemble');
  if ((d.hat === '') !== (d.hatAt.length === 0)) e.push('hat : timbre et pas vont ensemble');
  return e;
}

// Budget de voix par profil de qualité (quality.js : champ `audio` de chaque profil) : voices = nombre maximal de sources (oscillateurs, bruits) vivantes en même temps ; detail =
// 'full' (tout), 'lean' (un seul oscillateur par note de nappe, pas d'arpège de boost, hats clairsemés), 'min' (grosse caisse, basse et mélodie ; nappe réduite à deux notes, aucun hat).
export const DETAILS = ['full', 'lean', 'min'];
export const DEFAULT_BUDGET = Object.freeze({ voices: 30, detail: 'full' });
export function cleanBudget(b) {
  const voices = b && Number.isFinite(b.voices) ? Math.max(6, Math.min(48, Math.round(b.voices))) : DEFAULT_BUDGET.voices;
  return { voices, detail: b && DETAILS.includes(b.detail) ? b.detail : DEFAULT_BUDGET.detail };
}
