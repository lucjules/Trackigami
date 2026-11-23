// Sauvegarde cloud : quelles données partent dans le cloud, et comment fusionner deux versions.
//
// Module pur (aucun réseau, aucun navigateur) : il travaille sur des « dumps » {clé: texte JSON} comme dumpAll(),
// et sur leur forme cloud {clé: valeur JSON} (jsonb côté base). La fusion ne perd jamais de progression :
//  - records : le meilleur temps gagne (à version de physique égale) ;
//  - circuits : union par identifiant, le plus récent gagne ; les pierres tombales effacent les circuits supprimés ;
//  - profil : médailles et objets réunis, statistiques au maximum, pièces additives (js/wallet.js : rien de perdu, rien d'inventé) ; favoris réunis (pierres tombales) ;
//    exercices de l'Académie : meilleur niveau et meilleure mesure ; mutations du jour réunies, meilleure série au maximum ;
//    expérience au maximum, licences réunies (date la plus ancienne), défis de maîtrise réunis ; objectifs bonus réunis ; titre : le dernier choisi ;
//    premières arrivées du jour : le jour le plus récent (circuits réunis) ;
//  - dernières courses (runs.*) : réunies, les plus récentes gardées.
import { mergeWallets, balance } from './wallet.js';
import { mergeFavorites } from './favorites.js';
import { cleanRuns, validRecord, validTrackEntry, isTrialName } from './storage.js';
import { mergeDrills } from './skills.js';
import { mergeProgress } from './progression.js';

// Ce qui suit un compte d'un appareil à l'autre : progression, circuits créés, records. Les réglages
// (volume, touches, qualité...) restent propres à chaque appareil, le brouillon de l'éditeur aussi.
// Les essais de l'éditeur (rec3.e-…, storage.js : isTrialName) sont JETABLES et ne partent jamais (TECH-022) : ni envoyés, ni reçus ; la prochaine écriture du cloud en retire ceux d'avant.
export const isSyncKey = (k) =>
  k === 'profile' || k === 'tracks' || k === 'tracksDel' || k === 'recReset' || (/^(rec3|daily|ghostImp|runs)\./.test(k) && !isTrialName(k));

export const pickSynced = (dump) => Object.fromEntries(Object.entries(dump || {}).filter(([k, v]) => isSyncKey(k) && typeof v === 'string'));

// {clé: texte} -> {clé: valeur} (les valeurs illisibles sont ignorées)
export function toCloud(dump) {
  const out = {};
  for (const [k, v] of Object.entries(pickSynced(dump))) {
    try { out[k] = JSON.parse(v); } catch { /* abîmé : on ne l'envoie pas */ }
  }
  return out;
}
// {clé: valeur} -> {clé: texte}
export function fromCloud(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) if (isSyncKey(k) && v !== undefined) out[k] = JSON.stringify(v);
  return out;
}

const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const num = (x) => (Number.isFinite(+x) ? +x : 0);

function mergeRecord(a, b) {
  if (!a) return b;
  if (!b) return a;
  // Un record abîmé (temps nul, négatif, non fini ou démesuré) ne l'emporte JAMAIS sur un bon, quel que soit son temps ou sa version (phase 4) ; s'il n'y a que des abîmés on garde le local.
  const va = validRecord(a), vb = validRecord(b);
  if (!va || !vb) return va ? a : vb ? b : a;
  // Une physique plus récente remplace l'ancienne (les temps ne sont plus comparables) ; sinon le meilleur temps.
  const pa = num(a.pv), pb = num(b.pv);
  // À temps ET physique égaux (le même record, vu des deux côtés), celui qui a gardé le plus (fantôme, commandes) l'emporte : une copie allégée faute de place (storage.restoreFitting,
  // TECH-007) ou une sauvegarde sans fantômes (withoutGhosts, TECH-074) ne doit pas écraser dans le cloud, ni ailleurs, le même record complet.
  const weight = (r) => (r.ghost ? String(r.ghost).length : 0) + (r.inputs ? String(r.inputs).length : 0);
  const pick = pa !== pb ? (pb > pa ? b : a) : num(b.time) !== num(a.time) ? (num(b.time) < num(a.time) ? b : a) : (weight(b) > weight(a) ? b : a);
  // Le meilleur temps de toutes les physiques (bt, voir storage.medalTime) ne se perd jamais : médailles et déblocages en dépendent.
  const best = (r) => (num(r.bt) > 0 ? Math.min(num(r.bt), num(r.time) || Infinity) : num(r.time) || Infinity);
  const bt = Math.min(best(a), best(b));
  return Number.isFinite(bt) && bt < num(pick.time) - 1e-9 ? { ...pick, bt } : pick;
}

function mergeTracks(a, b, gone) {
  const map = new Map();
  for (const t of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!t || t.id == null) continue;
    const cur = map.get(t.id);
    // Une entrée lisible (id + code) l'emporte sur une entrée abîmée du même id, même plus récente : sinon une copie tronquée effaçait le circuit entier (phase 4).
    const vt = validTrackEntry(t), vc = cur ? validTrackEntry(cur) : false;
    if (!cur || (vt && !vc) || (vt === vc && num(t.updated) > num(cur.updated))) map.set(t.id, t);
  }
  // Un circuit supprimé après sa dernière modification disparaît partout.
  return [...map.values()].filter((t) => !(gone[t.id] != null && num(gone[t.id]) >= num(t.updated)));
}

export function mergeProfile(local, remote) {
  const a = obj(local), b = obj(remote);
  if (!Object.keys(a).length) return { ...b };
  if (!Object.keys(b).length) return { ...a };
  const owned = { ...obj(a.owned), ...obj(b.owned) };
  const medals = { ...obj(b.medals) };
  for (const [k, tier] of Object.entries(obj(a.medals))) medals[k] = k in medals ? Math.min(num(tier), num(medals[k])) : tier;   // 0 = cristal : le plus petit est le meilleur
  const eggs = { ...obj(b.eggs), ...obj(a.eggs) };
  const shards = { ...obj(b.shards), ...obj(a.shards) };
  const stats = { ...obj(b.stats), ...obj(a.stats), races: Math.max(num(a.stats && a.stats.races), num(b.stats && b.stats.races)), earned: Math.max(num(a.stats && a.stats.earned), num(b.stats && b.stats.earned)) };
  const academy = { ...obj(b.academy), ...obj(a.academy) };                   // leçons réussies : on réunit
  const collections = { ...obj(b.collections), ...obj(a.collections) };      // collections récompensées : on réunit
  const dailyDays = [...new Set([...(Array.isArray(a.dailyDays) ? a.dailyDays : []), ...(Array.isArray(b.dailyDays) ? b.dailyDays : [])])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-400);
  const mutDays = [...new Set([...(Array.isArray(a.mutDays) ? a.mutDays : []), ...(Array.isArray(b.mutDays) ? b.mutDays : [])])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-400);   // mutations du jour terminées (E13)
  const titlesSeen = [...new Set([...(Array.isArray(a.titlesSeen) ? a.titlesSeen : []), ...(Array.isArray(b.titlesSeen) ? b.titlesSeen : [])])].filter((t) => typeof t === 'string').sort().slice(0, 40);   // (trié : même résultat quel que soit l'ordre)
  // Objectifs bonus de la carrière (TECH-028) : réunis ; un objectif réussi sur un appareil l'est partout (il ne se repaie pas).
  const goals = Object.fromEntries([...new Set([...Object.keys(obj(a.goals)), ...Object.keys(obj(b.goals))])].filter((k) => obj(a.goals)[k] || obj(b.goals)[k]).sort().map((k) => [k, 1]));
  // Titre affiché : le DERNIER choisi (ou retiré) l'emporte (titleAt : date du choix, rewards.chooseTitle) ; à date égale (profils d'avant), le plus grand identifiant, pour converger.
  const ta = num(a.titleAt), tb = num(b.titleAt), sa = typeof a.title === 'string' ? a.title : '', sb = typeof b.title === 'string' ? b.title : '';
  const title = a.title !== undefined || b.title !== undefined || ta || tb ? { title: ta !== tb ? (ta > tb ? sa : sb) : (sa >= sb ? sa : sb), ...(ta || tb ? { titleAt: Math.max(ta, tb) } : {}) } : {};
  // Premières arrivées du jour (xpDay, progression.awardRace) : le jour le plus récent ; le même jour, les circuits des deux côtés (triés) : le bonus n'est pas repayé ailleurs.
  const xd = (x) => (x && typeof x === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(x.day) && Array.isArray(x.keys) ? x : null);
  const xa = xd(a.xpDay), xb = xd(b.xpDay);
  const day = xa && xb ? (xa.day > xb.day ? xa.day : xb.day) : (xa || xb || {}).day;
  const dayKeys = [xa, xb].filter((x) => x && x.day === day).flatMap((x) => x.keys);
  const xpDay = xa || xb ? { xpDay: { day, keys: [...new Set(dayKeys)].filter((k) => typeof k === 'string').sort().slice(0, 300) } } : {};
  stats.turbos = Math.max(num(a.stats && a.stats.turbos), num(b.stats && b.stats.turbos));
  const daily2 = a.mutDays || b.mutDays || a.dailyBest || b.dailyBest ? { mutDays, dailyBest: Math.max(num(a.dailyBest), num(b.dailyBest)) } : {};   // meilleure série : au maximum
  const presets = Array.isArray(a.presets) && a.presets.some(Boolean) ? a.presets : (Array.isArray(b.presets) ? b.presets : a.presets);
  const fav = (a.favorites || b.favorites || a.favDel || b.favDel) ? mergeFavorites(a, b) : {};      // favoris du Race Hub (favorites.js)
  const drills = a.drills || b.drills ? { drills: mergeDrills(a.drills, b.drills) } : {};         // exercices de l'Académie (skills.js) : meilleur niveau, meilleure mesure
  // Pièces (TECH-029) : modèle additif (js/wallet.js : compteurs par appareil, achats et cadeaux réunis) ; un profil sans portefeuille (ancien client, ancienne sauvegarde)
  // y entre par sa ligne de base, fusionnée par l'ancienne règle (le plus favorable, moins le prix de ce qu'il n'avait pas ; jamais le prix d'un cadeau).
  const out = {
    ...b, ...a, ...fav, ...drills, ...daily2, ...mergeProgress(a, b), ...title, ...xpDay,
    id: b.id || a.id,                    // l'identifiant du joueur reste celui du compte
    owned, medals, eggs, shards, stats, presets, academy, collections, dailyDays, titlesSeen, ...(a.goals || b.goals ? { goals } : {}),
    loadout: a.loadout || b.loadout,     // l'appareil courant garde sa personnalisation
  };
  out.wallet = mergeWallets(a, b);
  out.coins = balance(out, out.wallet);
  return out;
}

// local, remote : formes cloud {clé: valeur}. Renvoie la forme cloud fusionnée.
export function mergeSaves(local, remote) {
  let a = obj(local), b = obj(remote);
  const out = {};
  // « Effacer les records » : les records plus anciens que la dernière remise à zéro sont écartés AVANT la fusion (sinon un ancien
  // record, meilleur, l'emporterait sur le nouveau puis serait supprimé).
  const resetAt = Math.max(num(a.recReset), num(b.recReset));
  if (resetAt) {
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !(k.startsWith('rec3.') && num(obj(v).date) <= resetAt && num(obj(v).rt) <= resetAt))      // (rt : record restauré APRÈS la remise à zéro, voir profile.applySave)
      .map(([k, v]) => [k, k.startsWith('runs.') && Array.isArray(v) ? v.filter((r) => num(r && r.date) > resetAt) : v]));
    a = clean(a); b = clean(b);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const gone = { ...obj(b.tracksDel), ...obj(a.tracksDel) };
  for (const k of Object.keys(obj(b.tracksDel))) gone[k] = Math.max(num(a.tracksDel && a.tracksDel[k]), num(b.tracksDel[k]));
  for (const k of keys) {
    if (!isSyncKey(k)) continue;
    if (k === 'tracksDel') out[k] = gone;
    else if (k === 'tracks') out[k] = mergeTracks(a[k], b[k], gone);
    else if (k === 'profile') out[k] = mergeProfile(a[k], b[k]);
    else if (k.startsWith('rec3.')) out[k] = mergeRecord(a[k], b[k]);
    else if (k.startsWith('runs.')) out[k] = cleanRuns([...(Array.isArray(a[k]) ? a[k] : []), ...(Array.isArray(b[k]) ? b[k] : [])]);    // dernières courses : réunies, les plus récentes
    else out[k] = a[k] !== undefined ? a[k] : b[k];                 // fantômes importés, défi du jour : le local d'abord
  }
  if (resetAt) out.recReset = resetAt;
  if (!('tracksDel' in out) && Object.keys(gone).length) out.tracksDel = gone;
  if (!('tracks' in out) && (a.tracks || b.tracks)) out.tracks = mergeTracks(a.tracks, b.tracks, gone);
  return out;
}

// Deux formes cloud sont-elles identiques ? (évite d'écrire pour rien)
export const sameData = (x, y) => JSON.stringify(sortKeys(x)) === JSON.stringify(sortKeys(y));
function sortKeys(o) {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  return o;
}

// Version allégée (sans les fantômes enregistrés) si la sauvegarde dépasse la taille permise.
export function withoutGhosts(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = k.startsWith('rec3.') && v && typeof v === 'object' ? { ...v, ghost: null } : v;
  return out;
}

// Ce qui part réellement dans le cloud : `data` tel quel s'il tient dans `max` caractères ; sinon sans les fantômes (withoutGhosts), puis, si cela ne suffit pas, sans les commandes des plus
// anciens records, jusqu'à tenir (TECH-074). Le temps, les temps intermédiaires et la version de physique ne sont jamais retirés. Les anciens clients lisent ces records comme ceux d'un
// appareil qui n'a pas gardé la rejouabilité (inputs: null existe déjà : storage.slim).
export function fitCloud(data, max) {
  const len = (v) => JSON.stringify(v).length;
  if (len(data) <= max) return data;
  const out = withoutGhosts(data);
  let size = len(out);
  if (size <= max) return out;
  const withInputs = Object.keys(out).filter((k) => k.startsWith('rec3.') && out[k] && typeof out[k] === 'object' && out[k].inputs).sort((a, b) => num(out[a].date) - num(out[b].date));
  for (const k of withInputs) {
    size -= len(out[k].inputs) - len(null);
    out[k] = { ...out[k], inputs: null };
    if (size <= max) break;
  }
  return out;
}
