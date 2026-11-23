// Profil du joueur : pièces, objets débloqués, équipement, code de sauvegarde.
// Le jeu est 100 % statique (aucun serveur) : le « code joueur » est la sauvegarde
// elle-même, compressée, à copier / coller ou à télécharger sous forme de fichier.
import { getJSON, setJSON, getGlobal, setGlobal, dumpAll, restoreAllOrThrow, removeKeys, validRecord, DEVICE_ONLY_KEYS, isTrialName } from './storage.js';
import { mergeSaves, toCloud, fromCloud } from './cloudsave.js';
import { PHYS_VER } from './version.js';
import { DEFAULT_LOADOUT, itemCost, sanitizeLoadout, itemsOf, exclusiveOf } from './cosmetics.js';
import { hashString } from './track.js';
import { settle, fromWallet, recordPurchase, recordGift } from './wallet.js';

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newPlayerId() {
  let s = '';
  const a = new Uint8Array(10);
  (globalThis.crypto || { getRandomValues: (x) => x.map(() => Math.random() * 256) }).getRandomValues(a);
  for (let i = 0; i < 10; i++) s += ID_CHARS[a[i] % ID_CHARS.length] + (i === 4 ? '-' : '');
  return s;
}

// Identifiant de CET appareil pour les compteurs de pièces (wallet.js) : aléatoire, propre au navigateur (clé globale « copytrack.device », hors de toute portée : jamais dans un
// code joueur, une sauvegarde partagée ni l'export ; il ne sert qu'à nommer les compteurs de l'appareil dans le profil). Renouvelé après un import « Remplacer » : les compteurs
// importés de cet appareil pourraient être plus anciens que ceux du cloud, et un compteur ne doit jamais reculer.
const DEVICE_RE = /^[a-z0-9]{10}$/;
export function deviceId() {
  let id = getGlobal('device', '');
  if (!DEVICE_RE.test(id || '')) { id = newDeviceId(); setGlobal('device', id); }
  return id;
}
export function rotateDevice() { const id = newDeviceId(); setGlobal('device', id); return id; }
function newDeviceId() {
  const a = new Uint8Array(10);
  (globalThis.crypto || { getRandomValues: (x) => x.map(() => Math.random() * 256) }).getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

const DEFAULT = () => ({
  id: newPlayerId(), coins: 0, owned: {}, loadout: { ...DEFAULT_LOADOUT },
  presets: [null, null, null], medals: {}, stats: { races: 0, earned: 0 }, eggs: {}, shards: {},
});

let cache = null;
let quietLoad = false;       // true pendant reloadProfile : la remise en forme du profil relu n'est pas une modification du joueur (elle ne relance pas la synchronisation)
export function profile() {
  if (!cache) {
    const raw = getJSON('profile', {});
    cache = { ...DEFAULT(), ...(raw && typeof raw === 'object' ? raw : {}) };
    cache.loadout = sanitizeLoadout(cache.loadout);
    cache.owned = cache.owned && typeof cache.owned === 'object' ? cache.owned : {};
    cache.medals = cache.medals && typeof cache.medals === 'object' ? cache.medals : {};
    cache.stats = { races: 0, earned: 0, ...(cache.stats || {}) };
    if (!cache.id) cache.id = newPlayerId();
    fromWallet(cache);          // pièces : le portefeuille fait foi ; un profil d'avant 0.16.10 y est migré (ligne de base = son solde : le total ne change pas)
    setJSON('profile', cache, { quiet: quietLoad });
  }
  return cache;
}

// (les pièces changées par le code de cet appareil depuis la dernière écriture sont portées à son compteur : wallet.settle)
export function saveProfile() {
  if (cache) { settle(cache, deviceId()); setJSON('profile', cache); }
}

// Relit le profil depuis le stockage (après une restauration, une synchronisation, un changement de compte). Ne déclenche JAMAIS de synchronisation : elle écrit le profil remis en forme
// sans prévenir le compte (TECH-007 : avant, chaque synchronisation réécrivait le profil, donc en relançait une 4 s plus tard, sans fin quand la restauration échouait).
export function reloadProfile() {
  cache = null;
  quietLoad = true;
  try { return profile(); } finally { quietLoad = false; }
}

export const owns = (cat, id) => (itemCost(cat, id) === 0 && !exclusiveOf(cat, id)) || !!profile().owned[cat + ':' + id];

export function missingItems(loadout) {
  return itemsOf(loadout).filter(([c, id]) => !owns(c, id));
}

export function totalCost(items) {
  return items.reduce((a, [c, id]) => a + itemCost(c, id), 0);
}

export function buy(items) {
  const p = profile();
  const cost = totalCost(items);
  if (cost > p.coins) return false;
  if (items.some(([c, id]) => exclusiveOf(c, id))) return false;       // un exclusif ne s'achète jamais
  settle(p, deviceId());                     // (le solde d'avant l'achat est bien celui du portefeuille)
  p.coins -= cost;
  for (const [c, id] of items) p.owned[c + ':' + id] = 1;
  recordPurchase(p, items);                  // l'achat est une clé du portefeuille : payé une fois, même s'il est refait hors ligne sur un autre appareil
  saveProfile();
  return true;
}

// Objet OFFERT (code caché, exclusif mérité) : possédé, et marqué pour n'être jamais déduit des pièces à la fusion (TECH-029). L'appelant écrit le profil.
export function grantGift(cat, id) {
  const p = profile(), k = cat + ':' + id;
  p.owned[k] = 1;
  recordGift(p, k);
}

export function addCoins(n) {
  const p = profile();
  p.coins += Number.isFinite(+n) ? +n : 0;
  p.stats.earned += Number.isFinite(+n) ? +n : 0;
  saveProfile();
}

export function setLoadout(l) {
  const p = profile();
  p.loadout = sanitizeLoadout(l);
  saveProfile();
}

// Pièces gagnées en fin de course. tier : 0 cristal ... 3 bronze, -1 aucune médaille.
const TIER_COINS = [120, 60, 30, 15];
export function rewardCoins({ tier, difficulty = 1, trackKey, user = false }) {
  const p = profile();
  let base = tier >= 0 ? TIER_COINS[tier] : 3;
  base *= 1 + 0.15 * (difficulty - 1);
  const best = p.medals[trackKey];
  const first = tier >= 0 && (best == null || tier < best);
  if (first) { base *= 2; p.medals[trackKey] = tier; }
  if (user) base *= 0.5;
  // Circuit de joueur : la médaille vient du temps de son auteur, donc une arrivée répétée sur un circuit minuscule ne doit pas
  // rapporter à l'infini : seule une nouvelle médaille (meilleure que la précédente) rapporte des pièces.
  const n = user && !first ? 0 : Math.max(1, Math.round(base));
  p.stats.races += 1;
  addCoins(n);
  return { coins: n, first };
}

// ---- Code joueur (sauvegarde complète) -------------------------------------
async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const toB64 = (u8) => {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s) => {
  if (typeof s !== 'string' || !s) throw new Error('Code joueur invalide');
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

export async function exportCode() {
  saveProfile();
  const data = dumpAll({ shareable: true });      // sans la session en ligne de cet appareil (storage.DEVICE_ONLY_KEYS)
  const json = JSON.stringify({ v: 1, id: profile().id, t: Date.now(), data });
  const raw = new TextEncoder().encode(json);
  const chk = hashString(json);
  if (typeof CompressionStream !== 'undefined') {
    const z = await pipe(raw, new CompressionStream('deflate-raw'));
    return `SHWP1:${chk}:${toB64(z)}`;
  }
  return `SHWP0:${chk}:${toB64(raw)}`;
}

export async function parseCode(code) {
  const m = /^\s*(SHWP[01]):([a-z0-9]+):([A-Za-z0-9_-]+)\s*$/.exec(code || '');
  if (!m) throw new Error('Code joueur invalide');
  let raw;
  try {
    raw = fromB64(m[3]);
  } catch {
    throw new Error('Code joueur invalide');
  }
  if (m[1] === 'SHWP1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Navigateur trop ancien pour lire ce code');
    raw = await pipe(raw, new DecompressionStream('deflate-raw'));
  }
  const json = new TextDecoder().decode(raw);
  if (hashString(json) !== m[2]) throw new Error('Code joueur abîmé (somme de contrôle incorrecte)');
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('Code joueur invalide');
  }
  if (!obj || !obj.data) throw new Error('Code joueur invalide');
  return obj;
}

// Ce qu'une restauration accepte d'un code joueur : des clés de forme connue, des valeurs texte, et jamais la session en ligne d'un autre appareil
// (les anciens codes la contenaient : l'importer faisait de vous le pilote qui l'avait exporté, et effaçait votre propre identité en ligne).
const importable = (data) => {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) if (typeof v === 'string' && /^[\w.~:-]{1,160}$/.test(k) && !DEVICE_ONLY_KEYS.includes(k) && !isTrialName(k)) out[k] = v;      // (ni les essais d'éditeur d'un ancien code : jetables, TECH-022)
  return out;
};
const parse = (txt, fallback) => { try { const x = JSON.parse(txt); return x == null ? fallback : x; } catch { return fallback; } };

// Restaurer une ancienne sauvegarde est un geste VOLONTAIRE plus récent que les suppressions déjà synchronisées (pierres tombales de circuits, remise
// à zéro des records : voir cloudsave.js). Sans marque, la synchronisation suivante supprimait de nouveau ce que la restauration vient de rendre :
//  - circuits absents (ou supprimés) ici : `updated` passe à maintenant, il bat la pierre tombale ; la pierre tombale locale est retirée ;
//  - records absents ou meilleurs que ceux d'ici : `rt` (restauré le) = maintenant ; la remise à zéro ne retire que les records NI plus récents NI restaurés après elle.
// Ce qui existait déjà ici avec le même identifiant garde sa date : la règle habituelle (le plus récent gagne) s'applique.
function stampRestored(imp, cur, now) {
  const out = { ...imp };
  const have = new Set(parse(cur.tracks, []).map((t) => t && t.id));
  const gone = parse(cur.tracksDel, {});
  const dead = { ...parse(imp.tracksDel, {}) };
  for (const [id, t] of Object.entries(gone)) dead[id] = Math.max(Number(dead[id]) || 0, Number(t) || 0);      // la suppression la plus récente de chaque circuit
  if (typeof out.tracks === 'string') {
    const list = parse(out.tracks, []);
    if (Array.isArray(list)) {
      const revived = [];
      out.tracks = JSON.stringify(list.map((t) => {
        if (!t || t.id == null || (have.has(t.id) && !(t.id in dead))) return t;
        revived.push(t.id);
        return { ...t, updated: Math.max(Number(t.updated) || 0, now) };
      }));
      const keep = { ...dead };
      for (const id of revived) delete keep[id];
      out.tracksDel = JSON.stringify(keep);
    }
  }
  for (const [k, v] of Object.entries(out)) {
    if (!/^rec3\./.test(k)) continue;
    const r = parse(v, null), c = parse(cur[k], null);
    if (r && typeof r === 'object' && (!c || Number(r.time) < Number(c.time) - 1e-9)) out[k] = JSON.stringify({ ...r, rt: now });
  }
  return out;
}

// mode : 'replace' remplace tout (explicite : y compris records d'autres physiques, réglages, bibliothèques) ; 'merge' fusionne la progression comme une synchronisation.
// Lève StorageFullError (code « storage-full ») si l'appareil n'a pas la place d'écrire la restauration : RIEN n'a alors été modifié (écriture atomique, voir storage.restoreAll) ; l'appelant
// l'annonce au lieu d'un succès (TECH-075).
export function applySave(obj, mode = 'replace', now = Date.now()) {
  if (!obj || !obj.data || typeof obj.data !== 'object') return reloadProfile();
  const cur = dumpAll();
  const imp = stampRestored(importable(obj.data), cur, now);
  obj = { ...obj, data: imp };

  if (mode === 'replace') {
    const own = {};
    for (const k of DEVICE_ONLY_KEYS) if (typeof cur[k] === 'string') own[k] = cur[k];      // l'identité en ligne de CET appareil survit à une restauration
    restoreAllOrThrow({ ...obj.data, ...own });
    rotateDevice();          // les compteurs de pièces importés de cet appareil peuvent être plus anciens que ceux du cloud : les gains qui suivent vont à un compteur neuf (wallet.js)
  } else {
    // « Fusionner » (TECH-030) : LA fusion de la synchronisation (cloudsave.mergeSaves / mergeProfile), sur la progression seulement : expérience, objectifs, Académie, licences,
    // médailles, pièces (modèle additif), records, circuits… réunis selon les mêmes règles. Le reste de l'appareil (réglages, brouillon, prefabs, pièces perso, modes) n'est pas
    // touché. Un record importé qui n'est pas lisible (validRecord) ou d'une autre physique que celle du jeu est REFUSÉ (avant : un 0,001 s sans version remplaçait un vrai 30 s).
    const acceptable = ([k, v]) => !k.startsWith('rec3.') || ((r) => validRecord(r) && r.pv === PHYS_VER)(parse(v, null));
    const local = toCloud(cur);
    const merged = mergeSaves(local, toCloud(Object.fromEntries(Object.entries(imp).filter(acceptable))));
    if (merged.profile && local.profile && local.profile.id) merged.profile = { ...merged.profile, id: local.profile.id };      // l'identité du joueur ne change pas
    const dropped = Object.keys(local).filter((k) => !(k in merged));                  // (comme une synchronisation : les records d'avant une remise à zéro importée)
    restoreAllOrThrow(fromCloud(merged), true);
    if (dropped.length) removeKeys(dropped);
  }
  return reloadProfile();
}


