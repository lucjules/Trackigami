// Amorces officielles et rival juste devant (COMPLETE-010) : le client de supabase/etape23-amorces.sql.
//   - Les AMORCES sont des temps et des fantômes du pilote automatique du jeu (un par niveau de médaille) ou de testeurs qui l'acceptent, produits par le propriétaire
//     (tools/seed-officiels.mjs) dans la table `official_runs`, SÉPARÉE des temps des joueurs. Le jeu les montre TOUJOURS étiquetés « Officiel · automatique » (ou « testeur »),
//     sans numéro de place : ils ne prennent la place de personne, et la base ne s'en sert ni pour les places, ni pour les points, ni pour les divisions, ni pour l'Elo.
//   - Le RIVAL JUSTE DEVANT : le temps immédiatement meilleur que le mien. D'abord un vrai joueur (fonction rival_ahead : le plus proche devant, fantôme compris) ; à défaut
//     (je suis premier, ou personne n'a couru), l'amorce officielle immédiatement plus rapide que moi ; sans temps à moi, l'amorce la plus lente, pour commencer.
// Tout est LECTURE PUBLIQUE (clé publique, session de l'appareil seulement si elle existe) : afficher ne crée jamais de joueur anonyme (TECH-031).
// Sans l'étape 23 sur le serveur : aucune amorce, aucun rival en ligne, sans erreur affichée (l'étape absente est retenue 30 min : pas une requête perdue à chaque fiche).
import { online } from '../online.js';
import { parseVariant, splitKey } from '../variants.js';

export const OFFICIAL_LEVELS = ['bronze', 'argent', 'or', 'cristal'];
const TAGS = new Set(['sea', 'duel', 'tour']);                  // étiquettes qui ne changent pas le circuit (saison, duel, tournoi)
const KEY = /^b-[a-z0-9]{1,40}-[a-z0-9]{1,16}$/;

// La clé sous laquelle chercher les amorces d'une clé de classement : celle d'un circuit de la carrière, ou sa clé de base si la variante n'est qu'une étiquette (saison,
// duel, tournoi : même circuit, même course). Une variante qui change le circuit (véhicule, gravité, tours…) n'a pas d'amorce : null.
export function officialKeyOf(key) {
  const { base, variant } = splitKey(key);
  if (!KEY.test(base)) return null;
  if (!variant) return base;
  let v;
  try { v = parseVariant(variant); } catch { return null; }
  return Object.keys(v).every((n) => TAGS.has(n)) ? base : null;
}

// Le nom affiché d'une amorce, en entier (les textes du jeu se cherchent dans le code pour être traduits). Toujours avec le mot « Officiel ».
const AUTO_NAMES = { bronze: 'Officiel · automatique (bronze)', argent: 'Officiel · automatique (argent)', or: 'Officiel · automatique (or)', cristal: 'Officiel · automatique (cristal)' };
export function officialName(row) {
  if (row && row.source === 'testeur') return `Officiel · testeur ${String(row.pilot || '').slice(0, 20)}`;
  return AUTO_NAMES[row && row.level] || 'Officiel · automatique';
}
// Petite étiquette à côté du nom dans un classement.
export const officialBadge = (row) => (row && row.source === 'testeur' ? 'Officiel · testeur' : 'Officiel · automatique');

// ---- Choix du rival juste devant (pur, testé sous Node) ----
// myTime : mon temps (en ligne, sinon mon record local de la même physique) ou null. real : la ligne de rival_ahead (le vrai joueur le plus proche devant, avec son fantôme)
// ou null. officials : les amorces du circuit (n'importe quel ordre). Devant = STRICTEMENT plus rapide : un ex æquo n'est pas devant.
// Renvoie { kind: 'player', name, time, place, ghost, veh } | { kind: 'official', row, name, time, first? } | null (personne devant : je suis devant tout le monde).
export function pickRivalAhead({ myTime = null, real = null, officials = [] } = {}) {
  const offs = (officials || []).filter((o) => o && o.time > 0).slice().sort((a, b) => a.time - b.time);
  if (!(myTime > 0)) {
    const slow = offs[offs.length - 1];
    return slow ? { kind: 'official', row: slow, name: officialName(slow), time: slow.time, first: true } : null;
  }
  if (real && real.time > 0 && real.time < myTime) return { kind: 'player', name: String(real.name || '—'), time: +real.time, place: +real.place || null, ghost: real.ghost || null, veh: real.ghost_veh || [] };
  let best = null;
  for (const o of offs) if (o.time < myTime && (!best || o.time > best.time)) best = o;
  return best ? { kind: 'official', row: best, name: officialName(best), time: best.time } : null;
}

// ---- Lectures (publiques) ----
const CACHE_MS = 10 * 60000, ABSENT_MS = 30 * 60000;
const cache = new Map();                  // `${clé}|${physique}` -> { at, rows }
let absentAt = 0;                         // l'étape 23 manque sur le serveur : retenu 30 min
export function resetOfficialCache() { cache.clear(); absentAt = 0; }
const missingStep = (e) => !!e && (e.code === 'no-schema' || e.code === 'no-sql-step' || (e.code === 'http' && (e.status === 404 || /official_runs|rival_ahead/.test(e.message || ''))));

// Les amorces d'un circuit (clé de classement quelconque : la clé de base est cherchée), du plus rapide au plus lent : [{ source, level, pilot, time, has_ghost, ghost_veh }].
// [] : aucune amorce, une variante qui change le circuit, ou l'étape 23 absente. Une autre erreur (réseau, 429) remonte.
export async function officialRuns(key, physVer) {
  const k = officialKeyOf(key);
  if (!k || (absentAt && Date.now() - absentAt < ABSENT_MS)) return [];
  const id = k + '|' + physVer, hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  let rows;
  try {
    rows = await online.read(`/rest/v1/official_runs?select=source,level,pilot,time,has_ghost,ghost_veh&track_key=eq.${encodeURIComponent(k)}&phys_ver=eq.${physVer | 0}&order=time.asc&limit=20`);
  } catch (e) {
    if (missingStep(e)) { absentAt = Date.now(); return []; }
    throw e;
  }
  rows = (Array.isArray(rows) ? rows : []).filter((r) => r && r.time > 0 && (r.source === 'auto' ? OFFICIAL_LEVELS.includes(r.level) : r.source === 'testeur' && r.pilot)).map((r) => ({ ...r, time: +r.time, official: true }));
  cache.set(id, { at: Date.now(), rows });
  return rows;
}

// Le fantôme d'une amorce : { name, time, ghost (base64), veh, official: true } ou null.
export async function officialGhost(key, source, level, physVer) {
  const k = officialKeyOf(key);
  if (!k || !/^[a-z0-9-]{1,24}$/.test(String(level)) || !['auto', 'testeur'].includes(source)) return null;
  let rows;
  try { rows = await online.read(`/rest/v1/official_runs?select=source,level,pilot,time,ghost,ghost_veh&track_key=eq.${encodeURIComponent(k)}&phys_ver=eq.${physVer | 0}&source=eq.${source}&level=eq.${level}&limit=1`); }
  catch (e) { if (missingStep(e)) return null; throw e; }
  const r = Array.isArray(rows) ? rows[0] : null;
  return r && typeof r.ghost === 'string' ? { name: officialName(r), time: +r.time, ghost: r.ghost, veh: r.ghost_veh || [], official: true, source: r.source, level: r.level } : null;
}

// Le rival juste devant mon temps sur cette clé : voir pickRivalAhead. myTime null : aucune requête au serveur pour un vrai joueur (rien à comparer).
export async function rivalAhead(key, physVer, myTime) {
  const offs = await officialRuns(key, physVer).catch(() => []);
  let real = null;
  if (myTime > 0 && !(absentAt && Date.now() - absentAt < ABSENT_MS)) {
    try { const r = await online.readRpc('rival_ahead', { k: key, pv: physVer, t: myTime }); real = Array.isArray(r) && r[0] ? r[0] : null; }
    catch (e) { if (!missingStep(e)) throw e; }
  }
  return pickRivalAhead({ myTime, real, officials: offs });
}

// Les amorces à glisser dans un classement de joueurs (affichage seulement) : celles qui tombent DANS la partie montrée du classement (sinon, sous le 10e, une amorce
// paraîtrait devant des joueurs qui ne sont pas affichés). top : les lignes affichées (triées) ; total : le nombre de joueurs classés.
export function officialsInBoard(officials, top, total) {
  const all = (officials || []).slice().sort((a, b) => a.time - b.time);
  if (!top || !top.length || total <= top.length) return all;
  const last = top[top.length - 1].time;
  return all.filter((o) => o.time <= last);
}
