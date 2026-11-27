// Persistance locale (navigateur) : réglages, records + fantômes, circuits perso.
//
// Portée (« scope ») : un invité écrit dans « shardway.* » (les sauvegardes d'avant les comptes restent donc
// valables) ; chaque compte écrit dans « shardwayacct.<id du compte>.* ». Les deux familles de clés ne se
// recouvrent pas : la progression d'un compte et celle d'un invité ne se mélangent jamais sur un même navigateur.
// La portée se règle une fois, au lancement, avant que le jeu ne lise quoi que ce soit.
import { MAX_RUN_SECONDS, MAX_CHAIN_SECONDS, MAX_TRACK_CODE_CHARS } from './constants.js';
import { compactGhost } from './ghostFormat.js';

const GUEST_PREFIX = 'shardway.';
let PREFIX = GUEST_PREFIX;

export function setScope(accountId) {
  PREFIX = accountId ? 'shardwayacct.' + accountId + '.' : GUEST_PREFIX;
}
export const getScope = () => (PREFIX === GUEST_PREFIX ? '' : PREFIX.slice('shardwayacct.'.length, -1));

// Clés hors portée (identité du compte, marqueur de session invité) : lues avant de choisir la portée.
export const globalKey = (key) => 'copytrack.' + key;
export function getGlobal(key, fallback = null) {
  try { const v = localStorage.getItem('copytrack.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function setGlobal(key, value) {
  try {
    if (value == null) localStorage.removeItem('copytrack.' + key); else localStorage.setItem('copytrack.' + key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
export function getSessionFlag(key) { try { return sessionStorage.getItem('copytrack.' + key); } catch { return null; } }
export function setSessionFlag(key, value) {
  try { if (value == null) sessionStorage.removeItem('copytrack.' + key); else sessionStorage.setItem('copytrack.' + key, String(value)); } catch { /* sans importance */ }
}

// Appelé après chaque écriture réussie (sert à la synchronisation du compte).
let writeHook = null;
export function onWrite(fn) { writeHook = fn; }

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v == null) return fallback;
    const parsed = JSON.parse(v);
    return parsed;
  } catch {
    return fallback;
  }
}

// lastWriteOk : la DERNIÈRE écriture a-t-elle réussi ? (stockage plein, navigation privée, quota : setItem lève une exception). Les appelants dont la donnée ne se
// refabrique pas (un circuit qu'on enregistre) s'en servent pour le dire au joueur au lieu d'annoncer un succès.
let lastWriteOk = true;
export const wroteOk = () => lastWriteOk;
function write(key, value, quiet = false) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    if (writeHook && !quiet) writeHook(key);
    lastWriteOk = true;
    return true;
  } catch {
    lastWriteOk = false;
    return false;
  }
}

// Retire des clés de la portée courante (synchronisation du compte : ce que la fusion a écarté, voir account.js) ; la copie en mémoire des records suit.
export function removeKeys(keys) {
  for (const k of keys) {
    try { localStorage.removeItem(PREFIX + k); } catch { /* stockage indisponible */ }
    if (k.startsWith(REC)) memRec.delete(PREFIX + k.slice(REC.length));
  }
}

function listPrefixedKeys() {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return [];
  }
}

// Accès bruts (profil, sauvegarde complète).
export function getJSON(key, fallback) { return read(key, fallback); }
// Le texte stocké d'une clé (ou null) et son nom complet dans le navigateur (évènement « storage » d'un autre onglet : profile.js, TECH-027).
export function getRaw(key) { try { return localStorage.getItem(PREFIX + key); } catch { return null; } }
export const scopedKey = (key) => PREFIX + key;
// Une clé de la portée de l'INVITÉ, quelle que soit la portée courante (un compte connecté ne la voit pas autrement) : l'export des données retrouve ainsi l'identité en ligne de l'invité
// gardée à côté d'un compte (TECH-032). Lecture seule.
export function getGuestJSON(key, fallback = null) {
  try { const v = localStorage.getItem(GUEST_PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
// quiet : écriture qui NE relance PAS la synchronisation du compte (le profil relu après une synchronisation : sinon chaque synchronisation en rappelait une autre, TECH-007).
export function setJSON(key, value, { quiet = false } = {}) { return write(key, value, quiet); }

// Clés qui n'appartiennent qu'à CET appareil et ne doivent JAMAIS voyager dans un code joueur, une sauvegarde partagée ou une restauration : la session en ligne
// de l'invité (jeton d'accès et de renouvellement = son identité en ligne : classements, circuits publiés) et son profil en ligne. Un code joueur se copie, se
// poste, se confie ; s'il contenait la session, quiconque l'importerait deviendrait ce pilote (et l'importer chez soi écraserait sa propre identité en ligne).
// Même raison pour l'identifiant d'installation des statistiques (telemetry.state) et la file d'erreurs (errors.queue, qui le porte aussi à l'envoi) : un code joueur publié relierait
// le pseudo à cet identifiant, et l'importer en « Remplacer » ferait adopter le même identifiant par un autre appareil (TECH-078).
export const SECRET_DEVICE_KEYS = ['online.session', 'online.player', 'vproof'];      // vproof : la course de vérification d'un circuit (js/authorProof.js), lourde et propre à l'appareil
export const DEVICE_ONLY_KEYS = [...SECRET_DEVICE_KEYS, 'telemetry.state', 'errors.queue'];

// Essais de l'éditeur : un record « e-<empreinte du code> » par version du circuit essayé (js/app/editorFlow.js : testTrack). Données JETABLES (TECH-022) : ni synchronisées (cloudsave.js),
// ni exportées, ni restaurées ; l'appareil n'en garde que les EDITOR_TRIALS_MAX derniers (pour reprendre le fantôme du circuit en cours d'essai), et en purge le reste au démarrage.
export const EDITOR_TRIALS_MAX = 3;
export const isTrialName = (name) => /^rec3\.e-/.test(name);

// Toutes les données du jeu (clés « shardway.* », gardées pour ne perdre aucune sauvegarde) sous forme d'objet.
//   shareable : pour un code joueur ou une sauvegarde partagée (sans les clés propres à l'appareil, sans les essais de l'éditeur) ;
//   portability : pour l'export des données du joueur (RGPD, js/dataExport.js) : tout ce qui est SIENNE, sauf ses secrets (session, profil en ligne, preuve) et les essais jetables.
export function dumpAll({ shareable = false, portability = false } = {}) {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const name = k.slice(PREFIX.length);
      if ((shareable || portability) && isTrialName(name)) continue;
      if (shareable && DEVICE_ONLY_KEYS.includes(name)) continue;
      if (portability && SECRET_DEVICE_KEYS.includes(name)) continue;
      out[name] = localStorage.getItem(k);
    }
  } catch { /* stockage indisponible */ }
  return out;
}

// Restauration ATOMIQUE (phase 4) : on écrit d'abord tout ce qui vient de la sauvegarde (en gardant l'ancienne valeur de chaque clé touchée), et ce n'est qu'ensuite qu'on retire
// ce que la sauvegarde ne contient pas. Si une écriture échoue en route (stockage plein, navigation privée), tout est remis comme avant : avant, les clés étaient d'abord TOUTES
// effacées, puis réécrites une à une : un quota atteint à mi-chemin laissait un joueur avec une moitié de sauvegarde et aucune trace de l'ancienne.
export function restoreAll(data, keep = false) {
  const entries = Object.entries(data || {}).filter(([, v]) => typeof v === 'string');
  const written = [];
  try {
    const stale = keep ? [] : listPrefixedKeys().filter((k) => !(k.slice(PREFIX.length) in (data || {}) && typeof data[k.slice(PREFIX.length)] === 'string'));
    const staleVals = stale.map((k) => [k, localStorage.getItem(k)]);
    for (const [k, v] of entries) {
      const full = PREFIX + k;
      const before = localStorage.getItem(full);
      localStorage.setItem(full, v);
      written.push([full, before]);
    }
    for (const [k] of staleVals) localStorage.removeItem(k);
    if (!keep) for (const k of [...memRec.keys()]) if (k.startsWith(PREFIX)) memRec.delete(k);      // (la copie en mémoire des records ne doit pas masquer ceux qu'on vient de restaurer)
    return true;
  } catch {
    for (const [full, before] of written.reverse()) {
      try { if (before == null) localStorage.removeItem(full); else localStorage.setItem(full, before); } catch { /* on continue : le plus possible est remis */ }
    }
    return false;
  }
}

// Restauration qui s'ADAPTE au quota (TECH-007) : comme restoreAll(data, true), mais si tout ne tient pas, on écrit une version ALLÉGÉE plutôt que rien (et on le dit à l'appelant).
// Ordre de la politique, du moins coûteux au plus coûteux ; chaque étape est atomique (restoreAll) et la plus légère qui tient est gardée (recherche dichotomique) :
//   0. les essais de l'éditeur (jetables) sont retirés, puis tout est écrit tel quel ('full') ;
//   1. sans fantômes, des plus anciens records aux plus récents, uniquement ceux qui GROSSISSENT ce qui est déjà sur l'appareil ('noGhost') ;
//   2. puis sans leurs commandes, des plus anciens aux plus récents ('noInputs') ;
//   3. puis, seuls le profil, les circuits et les records de l'appareil comptent : les records absents d'ici ne sont écrits que dans la limite de la place, les plus récents d'abord ('partial') ;
//   4. si même le profil et les circuits ne tiennent pas : rien n'est écrit ('failed'), l'appareil est exactement comme avant.
// Le cloud, lui, garde tout : seule la copie locale est allégée. Renvoie { ok, level, lightened (records sans fantôme ni commandes), dropped (records non écrits ici) }.
const CORE_KEYS = ['profile', 'tracks', 'tracksDel', 'recReset'];
export function restoreFitting(data) {
  const res = (level, lightened = 0, dropped = 0) => ({ ok: level !== 'failed', level, lightened, dropped });
  if (restoreAll(data, true)) return res('full');
  if (purgeEditorTrials() && restoreAll(data, true)) return res('full');
  const cur = (k) => { try { return localStorage.getItem(PREFIX + k); } catch { return null; } };
  const changed = Object.entries(data || {}).filter(([k, v]) => typeof v === 'string' && v !== cur(k));
  const parsed = new Map();         // clé de record -> { obj, grows, isNew }
  for (const [k, v] of changed) {
    if (!k.startsWith(REC)) continue;
    let obj = null; try { obj = JSON.parse(v); } catch { /* abîmé : écrit tel quel */ }
    const old = cur(k);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) parsed.set(k, { obj, grows: v.length > (old ? old.length : 0), isNew: old == null });
  }
  const byDate = (a, b) => (parsed.get(a).obj.date || 0) - (parsed.get(b).obj.date || 0);
  const growing = [...parsed.keys()].filter((k) => parsed.get(k).grows).sort(byDate);      // (seuls les records qui grossissent la copie locale ont besoin d'être allégés)
  const gList = growing.filter((k) => parsed.get(k).obj.ghost), iList = growing.filter((k) => parsed.get(k).obj.inputs);
  const build = (ghostN, inputsN, skip = new Set()) => {
    const out = {};
    const noGhost = new Set(gList.slice(0, ghostN)), noInputs = new Set(iList.slice(0, inputsN));
    for (const [k, v] of changed) {
      if (skip.has(k)) continue;
      out[k] = !noGhost.has(k) && !noInputs.has(k) ? v : JSON.stringify({ ...parsed.get(k).obj, ...(noGhost.has(k) ? { ghost: null } : {}), ...(noInputs.has(k) ? { inputs: null } : {}) });
    }
    return out;
  };
  // Cherche le plus petit k de [1, n] pour lequel make(k) tient (make(n) d'abord ; make(k) écrit à chaque succès, ce qui reste sur le disque est toujours le dernier succès).
  const smallest = (n, make) => {
    if (n < 1 || !restoreAll(make(n), true)) return 0;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (restoreAll(make(mid), true)) hi = mid; else lo = mid; }
    return hi;
  };
  const gN = gList.length, iN = iList.length;
  let k = smallest(gN, (g) => build(g, 0));
  if (k) return res('noGhost', k);
  k = smallest(iN, (i) => build(gN, i));
  if (k) return res('noInputs', new Set([...gList, ...iList.slice(0, k)]).size);
  // 3. Seuls le cœur (profil, circuits…) et les records déjà présents ici (allégés) sont sûrs ; les records nouveaux, du plus récent au plus ancien, dans la limite de la place.
  const fresh = [...parsed.keys()].filter((x) => parsed.get(x).isNew).sort((a, b) => byDate(b, a));
  const partial = (m) => { const skip = new Set(fresh.slice(m)); for (const [x] of changed) if (!CORE_KEYS.includes(x) && !x.startsWith(REC)) skip.add(x); return build(gN, iN, skip); };
  const m = smallestDown(fresh.length, (j) => restoreAll(partial(j), true));
  if (m >= 0) return res('partial', new Set([...gList, ...iList]).size, fresh.length - m);
  return res('failed');
}
// Plus grand m de [0, n] pour lequel ok(m) réussit (le dernier succès reste écrit) ; -1 si même ok(0) échoue.
function smallestDown(n, ok) {
  if (ok(n)) return n;
  if (!ok(0)) return -1;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

// Le stockage de l'appareil n'a pas la place d'écrire une restauration (stockage plein, navigation privée) : rien n'a été modifié (restoreAll est atomique).
export class StorageFullError extends Error {
  constructor(message = 'Stockage plein') { super(message); this.name = 'StorageFullError'; this.code = 'storage-full'; }
}
// restoreAll, mais l'échec ne passe plus inaperçu (TECH-075) : après avoir libéré les essais d'éditeur (jetables), une seconde tentative ; sinon StorageFullError.
export function restoreAllOrThrow(data, keep = false) {
  if (restoreAll(data, keep)) return true;
  // (la seconde tentative n'écrit pas les essais d'éditeur que `data` reprendrait de l'appareil : ils viennent d'être purgés)
  if (purgeEditorTrials() && restoreAll(Object.fromEntries(Object.entries(data || {}).filter(([k]) => !isTrialName(k))), keep)) return true;
  throw new StorageFullError();
}

export const DEFAULT_SETTINGS = {
  volume: 0.7,
  quality: 'auto',         // auto | ultra | high | medium | low | potato | ultrapotato (voir quality.js)
  gfxProfile: '',          // dernier profil trouvé par la détection automatique
  gfxV: 0,                 // version des profils au moment de la détection
  gfxFps: 0,               // images par seconde mesurées à ce moment-là
  carColor: '#ffd23e',
  ghost: true,
  camera: 0,
  playerName: '',         // aucun pseudo par défaut : l'écran d'accueil le demande (voir welcome.js)
  touchMode: 'buttons',   // buttons | drag
  haptics: true,
  padDeadzone: 0.15,
  padSens: 1,
  // v1.5
  musicVolume: 0.45,
  fovAdd: 0,          // champ de vision en plus (degrés)
  speedFx: true,      // lignes de vitesse
  shakeAmt: 1,        // intensité des tremblements de caméra (0 à 1)
  colorblind: false,  // couleurs de revêtements adaptées + motifs renforcés
  uiScale: 1,         // taille de l'interface
  showFps: false,
  tutorialDone: false,
  ghostGold: true,
  ghostMedal: 'next',    // quel fantôme de médaille : 'next' = la prochaine médaille à gagner (bronze → cristal), 'or' = toujours l'or (ghostTarget.js)
  ghostImported: true,
  onlineScores: true,
  ui: {},                 // thème et disposition de l'interface (uitheme.js)
  hudProfile: 'classic',  // profil du HUD : classic | competitive | training | minimal (hudProfile.js)
  training: null,         // HUD d'entraînement : { ref, w } (hudProfile.js : sanitizeTraining) ; null = réglages par défaut
  cameras: [],            // caméras de course personnalisées (camprefs.js)
  feel: 1,                // sensations de course : 0 (aucun effet ajouté) à 1,5 ; voir feel.js
  editorGuided: null,     // éditeur en mode guidé (l'essentiel) : null = non (joueur qui connaît déjà l'éditeur), true = oui (voir editor/palette.js)
  telemetry: null,        // statistiques anonymes (voir telemetry.js) : null = pas encore demandé, true = accepté, false = refusé
  aids: {},               // aides à la conduite (aids.js) : { autoGas, brakeAssist, steerAssist, antiSpin, smoothSteer } ; une course aidée est classée « assisté »
  steerCurve: 1,          // réponse du volant analogique (manette, pouce) : 1 linéaire à 2 très progressive (aids.js)
  reduceMotion: 'auto',   // animations : 'auto' (réglage du système), 'on' (réduites), 'off' (normales) ; voir a11y.js
};

export function loadSettings() {
  const saved = read('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...(saved && typeof saved === 'object' ? saved : {}),
    keys: { ...((saved && saved.keys) || {}) },
    pad: { ...((saved && saved.pad) || {}) },
  };
}

export function saveSettings(s) {
  write('settings', s);
}

// ---- Records -------------------------------------------------------------
// v1.1 : pistes plus larges et physique revue => les records v1.0 (préfixe
// "rec.") ne sont plus comparables. On utilise "rec2." et on purge l'ancien.
// v1.5 : nouvelle physique (assiette en l'air, réceptions, mini-turbo) => "rec3.".
const REC = 'rec3.';

export function purgeOldRecords() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'rec.') || k.startsWith(PREFIX + 'rec2.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage indisponible */ }
}

// ---- Fantômes importés (code SHG1) et défi du jour --------------------------------
export function getImportedGhost(trackKey) {
  return read('ghostImp.' + trackKey, null);
}

export function setImportedGhost(trackKey, g) {
  write('ghostImp.' + trackKey, g);
}

export function clearRecords() {
  for (const k of [...memRec.keys()]) if (k.startsWith(PREFIX)) memRec.delete(k);
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'rec') || k.startsWith(PREFIX + RUNS))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage indisponible */ }
  // Pierre tombale : sans elle, la synchronisation du compte ramènerait les records effacés depuis le cloud.
  write('recReset', Date.now());
}

// Copie en mémoire des records de cette session : si le stockage du navigateur est plein ou refuse d'écrire, le menu affiche
// quand même le temps et les médailles qui viennent d'être gagnés (la progression ne dépend plus de la place disponible).
const memRec = new Map();
const slim = (rec) => ({ ...rec, ghost: null, inputs: null });

// Un record lisible (phase 4) : un temps fini, > 0 et dans les bornes d'une course. Un record dont le temps est 0, négatif, NaN ou démesuré (donnée abîmée ou fabriquée) n'est JAMAIS
// le « meilleur temps » : il donnerait une médaille de cristal et déverrouillerait la carrière. Il reste sur le disque (rien n'est effacé) mais n'est plus lu.
// Un record d'enchaînement « chapitre d'une traite » (clé ch-…, `chain: true`, js/chainRun.js) cumule 6 manches : jusqu'à MAX_CHAIN_SECONDS (1 200 s) ; tout autre record, une course.
export function validRecord(rec) {
  const max = rec && rec.chain === true ? MAX_CHAIN_SECONDS : MAX_RUN_SECONDS;
  return !!rec && typeof rec === 'object' && Number.isFinite(+rec.time) && +rec.time > 0 && +rec.time <= max
    && (rec.pv === undefined || (Number.isInteger(+rec.pv) && +rec.pv >= 0 && +rec.pv <= 100000))
    && (rec.bt === undefined || rec.bt === null || (Number.isFinite(+rec.bt) && +rec.bt > 0 && +rec.bt <= max));
}

// Anciennes clés d'une clé de circuit intégré (js/builtinKeys.js : alias, RISK-001) : fournies par le jeu au démarrage (setLegacyKeyProvider), jamais importées ici (ce module
// n'a pas à connaître les circuits). Sans fournisseur, ou sans alias pour la clé : getRecord se comporte exactement comme avant.
let legacyKeyProvider = null;
export function setLegacyKeyProvider(fn) { legacyKeyProvider = typeof fn === 'function' ? fn : null; }

// Le record rangé sous CETTE clé, sans repli sur ses anciennes clés (la migration, js/keyAlias.js, doit savoir s'il y en a déjà un).
export function getOwnRecord(trackKey) {
  const raw = read(REC + trackKey, null);
  const disk = validRecord(raw) ? raw : null;
  const mem = memRec.get(PREFIX + trackKey);
  if (!disk) return mem || null;
  // La copie en mémoire de cette session ne l'emporte que si elle est de la même physique et meilleure, ou d'une physique plus récente : sinon une synchronisation qui
  // rapporte le record d'une physique plus récente (autre appareil) restait cachée derrière un meilleur temps d'une ancienne physique.
  if (!mem) return disk;
  const mp = +mem.pv || 0, dp = +disk.pv || 0;
  return mp === dp ? (mem.time < disk.time - 1e-9 ? mem : disk) : (mp > dp ? mem : disk);
}

// Le record d'un circuit : celui de sa clé, sinon (alias d'un circuit intégré dont la clé a changé) celui de sa plus récente ancienne clé qui en a un. Les médailles, les verrous de
// chapitre, le fantôme et le meilleur temps (bt) le lisent tous ici : un record rangé sous l'ancienne clé n'est jamais « perdu », même avant la migration (qui le copie, js/builtinKeys.js).
export function getRecord(trackKey) {
  const own = getOwnRecord(trackKey);
  if (own || !legacyKeyProvider) return own;
  for (const k of legacyKeyProvider(trackKey)) { const r = getOwnRecord(k); if (r) return r; }
  return null;
}

// Meilleur temps JAMAIS réalisé sur ce circuit, toutes versions de la physique confondues (rec.bt) : c'est lui qui donne les médailles et les déblocages.
// Une mise à jour de la physique rend les anciens temps non comparables (le record est alors remplacé par la première arrivée sous la nouvelle
// physique, même plus lente) : sans cette mémoire, une médaille d'or gagnée avant la mise à jour pouvait redescendre en argent, et reverrouiller
// la suite de la carrière. Le temps du record (rec.time), lui, reste celui de la physique courante (classements, fantôme, replay).
export const medalTime = (rec) => (rec ? Math.min(rec.time, Number.isFinite(+rec.bt) && +rec.bt > 0 ? +rec.bt : rec.time) : null);
// Écrit le record, quitte à perdre ce qui prend de la place, dans l'ordre de la politique d'éviction ci-dessous (le non classé d'abord, puis le fantôme et les commandes). Le temps, lui,
// n'est jamais perdu. Renvoie true si le record est bien sur le disque.
export function saveRecord(trackKey, rec) {
  if (!validRecord(rec)) { lastWriteOk = false; return false; }      // (jamais un temps impossible dans les records : l'appelant voit false)
  const old = getRecord(trackKey);
  if (old) { const bt = Math.min(medalTime(old), medalTime(rec)); if (bt < rec.time - 1e-9) rec = { ...rec, bt }; }
  memRec.set(PREFIX + trackKey, slim(rec));
  // D'abord le record entier ; s'il ne tient pas, on libère de la place (makeRoom) AVANT de lui retirer son fantôme, puis ses commandes.
  const ok = makeRoom([() => write(REC + trackKey, rec), () => write(REC + trackKey, { ...rec, ghost: null }), () => write(REC + trackKey, slim(rec))], PREFIX + REC + trackKey);
  if (ok && trackKey.startsWith('e-')) trimTrials(PREFIX + REC + trackKey);
  return ok;
}

// ---- Politique d'éviction (stockage plein) : on sacrifie le NON CLASSÉ d'abord (TECH-022) -----------------------------------------------------------------------------------
// Un record classé (b-… circuits intégrés, daily-… défi du jour, u-… circuits de joueurs) ne perd JAMAIS son temps : au pire son fantôme, puis ses commandes (un replay, pas une médaille).
// makeRoom essaie `tries[0]` (l'écriture voulue, la plus complète) après chacune de ces étapes, de la moins coûteuse à la plus coûteuse, et s'arrête dès qu'elle réussit :
//   1. les essais de l'éditeur (e-…) : jetables, retirés en entier ;
//   2. les fantômes des autres records, COMPACTÉS (ancien format → « G2 », ×3,9, rien de perdu) ;
//   3. les fantômes importés (ghostImp.…) : le plus gros d'abord (se réimportent par leur code), puis les dernières courses (runs.…, se refont en jouant ; un compte les retrouve du cloud) ;
//   4. l'écriture elle-même dégradée (`tries[1…]` : sans fantôme, puis sans commandes) ;
//   5. le fantôme et les commandes des AUTRES records classés, du plus ancien au plus récent (tries[0] essayée après chacun).
// Renvoie true dès qu'une écriture réussit.
function makeRoom(tries, except = '') {
  tries = typeof tries === 'function' ? [tries] : tries;
  if (tries[0]()) return true;
  let all;
  try { all = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)); } catch { return false; }
  const drop = (k) => { try { localStorage.removeItem(k); } catch { /* on continue */ } };
  const size = (k) => { try { return (localStorage.getItem(k) || '').length; } catch { return 0; } };
  // 1. essais de l'éditeur
  const trials = all.filter((k) => isTrialName(k.slice(PREFIX.length)) && k !== except);
  if (trials.length) { trials.forEach(drop); if (tries[0]()) return true; }
  const readRec = (k) => { try { return { k, v: JSON.parse(localStorage.getItem(k)) }; } catch { return null; } };
  const others = all.filter((k) => k.startsWith(PREFIX + REC) && k !== except && !trials.includes(k)).map(readRec)
    .filter((o) => o && o.v && (o.v.ghost || o.v.inputs)).sort((a, b) => (a.v.date || 0) - (b.v.date || 0));
  // 2. compactage, sans rien perdre
  for (const o of others) {
    const g = compactGhost(o.v.ghost);
    if (g === o.v.ghost) continue;
    try { localStorage.setItem(o.k, JSON.stringify({ ...o.v, ghost: g })); } catch { /* on continue */ }
    if (tries[0]()) return true;
  }
  // 3. non classé importé ou refaisable
  for (const k of all.filter((x) => x.startsWith(PREFIX + 'ghostImp.')).sort((a, b) => size(b) - size(a))) { drop(k); if (tries[0]()) return true; }
  const lastRun = (k) => { try { return Math.max(0, ...JSON.parse(localStorage.getItem(k)).map((r) => +r.date || 0)); } catch { return 0; } };
  for (const k of all.filter((x) => x.startsWith(PREFIX + RUNS)).sort((a, b) => lastRun(a) - lastRun(b))) { drop(k); if (tries[0]()) return true; }
  // 4. l'écriture elle-même, allégée
  for (const t of tries.slice(1)) if (t()) return true;
  // 5. les autres records classés : fantôme et commandes (le temps, lui, reste)
  for (const o of others) {
    try { localStorage.setItem(o.k, JSON.stringify(slim(o.v))); } catch { /* on continue */ }
    if (tries.some((t) => t())) return true;
  }
  return false;
}

// Garde les EDITOR_TRIALS_MAX essais d'éditeur les plus récents (celui qu'on vient d'écrire, `keep`, toujours) : un essai par version du circuit, 21 à 43 Ko chacun, ne s'accumulent plus (TECH-022).
function trimTrials(keep) {
  let keys;
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) && isTrialName(k.slice(PREFIX.length))); } catch { return; }
  if (keys.length <= EDITOR_TRIALS_MAX) return;
  const dated = keys.map((k) => { try { return [k, +JSON.parse(localStorage.getItem(k)).date || 0]; } catch { return [k, 0]; } }).sort((a, b) => (a[0] === keep ? -1 : b[0] === keep ? 1 : b[1] - a[1]));
  for (const [k] of dated.slice(EDITOR_TRIALS_MAX)) { try { localStorage.removeItem(k); } catch { /* on continue */ } }
}

// Au démarrage : purge de TOUS les essais d'éditeur de cet appareil (invité et comptes). Ciblé : seules les clés « …rec3.e-… » partent, jamais un record b-, u- ni daily-. Renvoie le nombre de clés retirées.
export function purgeEditorTrials() {
  let n = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if (/^shardway(?:acct\.[^.]+\.|\.)rec3\.e-/.test(k)) { localStorage.removeItem(k); n++; }
    }
  } catch { /* stockage indisponible */ }
  return n;
}

// ---- Dernières courses d'un circuit (Race Hub, onglet Personnel) ---------------------------------------------------------------------------
// « runs.<clé> » : les RUNS_MAX dernières courses terminées, de la plus récente à la plus ancienne : { time, date } (ni fantôme ni commandes :
// le record garde les siennes). Synchronisé avec le compte (cloudsave.js : fusion par date).
const RUNS = 'runs.';
export const RUNS_MAX = 10;
export function cleanRuns(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((r) => r && Number.isFinite(+r.time) && +r.time > 0 && Number.isFinite(+r.date))
    .map((r) => ({ time: +r.time, date: +r.date }))
    .sort((a, b) => b.date - a.date)
    .filter((r) => { const k = r.date + ':' + r.time; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, RUNS_MAX);
}
export function listRuns(trackKey) { return cleanRuns(read(RUNS + trackKey, [])); }
export function setRuns(trackKey, list) { return !!trackKey && write(RUNS + trackKey, cleanRuns(list)); }

// Clés de la portée courante qui commencent par `prefix`, sans le préfixe de portée (alias de clés de circuit : js/keyAlias.js).
export function listKeys(prefix) {
  return listPrefixedKeys().map((k) => k.slice(PREFIX.length)).filter((k) => k.startsWith(prefix));
}
export function pushRun(trackKey, run) {
  if (!trackKey) return false;
  return write(RUNS + trackKey, cleanRuns([{ time: run.time, date: run.date || Date.now() }, ...listRuns(trackKey)]));
}

// ---- Circuits personnels ---------------------------------------------------
// Une entrée de la liste des circuits est lisible (phase 4) : un identifiant, un code de circuit (texte, d'une taille permise). Une entrée abîmée (null, sans code, code d'un autre
// type) ne s'affiche pas et ne plante rien ; elle n'est pas effacée pour autant : à la prochaine écriture de la liste elle part en QUARANTAINE (clé « tracksBad »), récupérable.
export const validTrackEntry = (t) => !!t && typeof t === 'object' && typeof t.id === 'string' && t.id !== '' && typeof t.code === 'string' && t.code.length > 0 && t.code.length <= MAX_TRACK_CODE_CHARS;
export const TRACKS_BAD_MAX = 30;
function splitTracks() {
  const raw = read('tracks', []);
  const arr = Array.isArray(raw) ? raw : [];
  const good = [], bad = [];
  const seen = new Set();
  for (const t of arr) {
    if (validTrackEntry(t) && !seen.has(t.id)) { seen.add(t.id); good.push(typeof t.name === 'string' ? t : { ...t, name: 'Circuit' }); } else if (t != null) bad.push(t);
  }
  return { good, bad, nonArray: raw != null && !Array.isArray(raw) ? raw : null };
}
export function listMyTracks() { return splitTracks().good; }
export function listBadTracks() { const l = read('tracksBad', []); return Array.isArray(l) ? l : []; }
// Écrit la liste ; ce qu'elle laisse de côté (entrées abîmées, doublons d'identifiant, liste qui n'était pas un tableau) est mis en quarantaine AVANT l'écriture.
function writeTracks(list, bad, nonArray) {
  const q = [...(nonArray != null ? [{ lost: nonArray, at: Date.now() }] : []), ...bad.map((b) => ({ lost: b, at: Date.now() })), ...listBadTracks()].slice(0, TRACKS_BAD_MAX);
  if (q.length && (bad.length || nonArray != null)) write('tracksBad', q);
  return write('tracks', list);
}

export function saveMyTrack(entry) {
  if (!validTrackEntry(entry)) { lastWriteOk = false; return entry; }      // (un circuit sans code ne s'enregistre pas ; wroteOk() le dit à l'appelant)
  const { good: list, bad, nonArray } = splitTracks();
  const i = list.findIndex((t) => t.id === entry.id);
  entry.updated = Date.now();
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  // Un circuit ne se refabrique pas : si le stockage est plein, on fait de la place (fantômes des records) avant de renoncer. L'appelant vérifie wroteOk() :
  // avant 0.9.59 l'écriture ratée passait inaperçue et l'éditeur annonçait « Circuit enregistré » (circuit perdu à la fermeture de la page).
  makeRoom([() => writeTracks(list, bad, nonArray)]);
  return entry;
}

// ---- Prefabs de l'éditeur (bibliothèque locale : jusqu'à PREFAB_MAX ; elle ne se synchronise pas avec le compte, le partage se fait par le code « SHP1: ») ----
export const PREFAB_MAX = 40;
export function listPrefabs() {
  const l = read('prefabs', []);
  return Array.isArray(l) ? l.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.code === 'string' && p.code.startsWith('SHP1:')).slice(0, PREFAB_MAX) : [];
}
export function savePrefab({ id, name, code }) {
  const entry = { id: String(id).slice(0, 30), name: String(name).slice(0, 40) || 'Prefab', code: String(code), updated: Date.now() };
  const list = listPrefabs().filter((p) => p.id !== entry.id);
  list.unshift(entry);
  write('prefabs', list.slice(0, PREFAB_MAX));
  return entry;
}
export function deletePrefab(id) {
  write('prefabs', listPrefabs().filter((p) => p.id !== id));
}

// ---- Pièces décoratives perso (bibliothèque locale, customDeco.js) : jusqu'à CDECO_MAX ; le partage se fait par le code « SHD1: » ----
export const CDECO_MAX = 30;
export function listCustomDecos() {
  const l = read('cdecos', []);
  return Array.isArray(l) ? l.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.parts)).slice(0, CDECO_MAX) : [];
}
export function saveCustomDeco({ id, name, parts }) {
  const entry = { id: String(id).slice(0, 30), name: String(name).slice(0, 24) || 'Ma pièce', parts, updated: Date.now() };
  const list = listCustomDecos().filter((p) => p.id !== entry.id);
  list.unshift(entry);
  write('cdecos', list.slice(0, CDECO_MAX));
  return entry;
}
export function deleteCustomDeco(id) { write('cdecos', listCustomDecos().filter((p) => p.id !== id)); }

// ---- Modes de jeu du joueur (rules.js) : jusqu'à MAX_MODES ; ils se partagent par le code « SHM1: » ----
export const MODES_MAX = 20;
export function listModes() {
  const l = read('modes', []);
  return Array.isArray(l) ? l.filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && m.rules && typeof m.rules === 'object').slice(0, MODES_MAX) : [];
}
export function saveMode(mode) {
  const entry = { id: String(mode.id).slice(0, 30), name: String(mode.name).slice(0, 24), desc: String(mode.desc || '').slice(0, 100), rules: mode.rules, goal: mode.goal || null, updated: Date.now() };
  const list = listModes().filter((m) => m.id !== entry.id);
  list.unshift(entry);
  write('modes', list.slice(0, MODES_MAX));
  return entry;
}
export function deleteMode(id) { write('modes', listModes().filter((m) => m.id !== id)); }

export function deleteMyTrack(id) {
  const { good, bad, nonArray } = splitTracks();
  writeTracks(good.filter((t) => t.id !== id), bad, nonArray);
  // Pierre tombale : sans elle, la synchronisation du compte ressusciterait le circuit depuis un autre appareil.
  const gone = read('tracksDel', {});
  write('tracksDel', { ...(gone && typeof gone === 'object' ? gone : {}), [id]: Date.now() });
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getEditorDraft() {
  return read('draft', null);
}

export function setEditorDraft(d) {
  write('draft', d);
}

// ---- Fantômes : Float32Array <-> base64 (le codec vit dans ghostFormat.js, partagé avec la fonction serveur) ----
export { encodeFloats, decodeFloats, packGhost } from './ghostFormat.js';

export function formatTime(sec, sign = false) {
  if (sec == null || !isFinite(sec)) return '--:--.---';
  const neg = sec < 0;
  // Arrondi au millième AVANT de séparer minutes et secondes : 59,9996 s s'écrivait « 00:60.000 » (le chrono l'affichait une image à chaque passage de minute).
  const ms = Math.round(Math.abs(sec) * 1000);
  const m = Math.floor(ms / 60000);
  const txt = String(m).padStart(2, '0') + ':' + ((ms - m * 60000) / 1000).toFixed(3).padStart(6, '0');
  if (sign) return (neg ? '-' : '+') + txt;
  return (neg ? '-' : '') + txt;
}

