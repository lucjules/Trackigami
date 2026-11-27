// Boîte de réception (COMPLETE-015) : ce qui s'est passé depuis la dernière fois que le joueur l'a ouverte. « X a battu ton temps sur Y », duels qui l'attendent ou
// réglés, nouvelle saison et fin de saison, circuits publiés par les auteurs qu'il suit. Le client de la fonction inbox_summary (supabase/etape23-amorces.sql).
//   - UNE requête à l'ouverture du jeu (au premier passage au menu), puis rien pendant INBOX_CACHE_MS : rouvrir le menu ne redemande pas.
//   - AUCUNE requête sans session sur l'appareil : la boîte ne crée jamais de joueur anonyme pour lire (TECH-031) ; elle dit alors à quoi elle sert.
//   - La date de dernière consultation est gardée sur l'appareil, par identité en ligne (clé globale `inbox.seen.<uid>` : jamais dans le code joueur ni le cloud).
//   - Les textes sont des phrases françaises entières (les modèles à trous du dictionnaire anglais les traduisent).
// Aucune notification système, aucune récompense : seulement des raisons de revenir qui viennent d'autres joueurs (hors périmètre voulu : docs/audit, COMPLETE-015).
import { online } from './online.js';
import { getGlobal, setGlobal, formatTime } from './storage.js';
import { DIVISIONS } from './seasons.js';

export const INBOX_CACHE_MS = 5 * 60000;
export const INBOX_MAX = 20;
export const FIRST_VISIT_DAYS = 7;          // première ouverture sur cet appareil : la dernière semaine (la base borne de toute façon à 30 jours)

const seenKey = (uid) => 'inbox.seen.' + String(uid || '').replace(/[^0-9a-zA-Z-]/g, '').slice(0, 40);
// La date (ISO) à partir de laquelle un événement est « nouveau » pour cette identité.
export function inboxSince(uid, now = Date.now()) {
  const v = getGlobal(seenKey(uid), null);
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return new Date(Number.isFinite(t) && t <= now ? t : now - FIRST_VISIT_DAYS * 86400000).toISOString();
}
// Le joueur a ouvert sa boîte : tout ce qui est arrivé jusqu'ici est lu.
export function markInboxSeen(uid, now = Date.now()) { if (uid) setGlobal(seenKey(uid), new Date(now).toISOString()); }

// Les éléments non lus : arrivés après la dernière consultation ; un duel qui attend une réponse reste tant qu'il attend.
export const unread = (items, since) => (items || []).filter((x) => x.kind === 'duel' || (x.at && x.at > since));

// ---- Lecture (une requête, puis le cache) ----
let cache = null;            // { uid, at, items }
export function resetInboxCache() { cache = null; }
// { items, since } ; null : pas de session sur l'appareil (aucune requête n'est partie). Lève l'erreur du serveur (réseau, étape absente : code « no-sql-step »).
export async function loadInbox({ force = false, now = Date.now() } = {}) {
  if (!online.hasStoredSession()) return null;                        // ni session, ni jeton de renouvellement : rien à demander, et surtout pas d'inscription anonyme
  const uid = online.uid, since = inboxSince(uid, now);
  if (!force && cache && cache.uid === uid && now - cache.at < INBOX_CACHE_MS) return { items: cache.items, since };
  const rows = await online.inbox(since);
  if (rows == null) return null;                                     // (la session n'a pas pu être reprise : rien n'est parti en son nom)
  const items = (Array.isArray(rows) ? rows : []).slice(0, INBOX_MAX).map(clean).filter(Boolean);
  cache = { uid, at: now, items };
  return { items, since };
}
// Le cache, sans requête (le badge du menu) : null s'il n'y a rien de frais pour cette identité.
export function cachedInbox(now = Date.now()) {
  if (!cache || cache.uid !== online.uid || now - cache.at >= INBOX_CACHE_MS) return null;
  return { items: cache.items, since: inboxSince(cache.uid, now) };
}
const KINDS = ['beaten', 'duel', 'duel_win', 'duel_loss', 'duel_draw', 'season', 'season_end', 'follow'];
const num = (x) => (x == null || !Number.isFinite(+x) ? null : +x);
function clean(r) {
  if (!r || !KINDS.includes(r.kind)) return null;
  return { kind: r.kind, at: typeof r.at === 'string' ? r.at : null, trackKey: typeof r.track_key === 'string' ? r.track_key : null, trackName: String(r.track_name || '').slice(0, 60),
    trackId: typeof r.track_id === 'string' ? r.track_id : null, who: String(r.who || '').slice(0, 20), myTime: num(r.my_time), theirTime: num(r.their_time), ref: num(r.ref), n: num(r.n), m: num(r.m) };
}

// ---- Textes ----
// trackName(item) : le nom à afficher du circuit (celui de la carrière, traduit avec le jeu, sinon celui rangé par la base).
export function inboxText(it, trackName = (x) => x.trackName || '?') {
  const track = trackName(it), who = it.who || '?';
  switch (it.kind) {
    case 'beaten':
      if (it.n > 2) return `${who} et ${it.n - 1} autres pilotes ont battu ton temps sur ${track}.`;
      if (it.n === 2) return `${who} et un autre pilote ont battu ton temps sur ${track}.`;
      return `${who} a battu ton temps sur ${track} : ${formatTime(it.theirTime)} contre ${formatTime(it.myTime)}.`;
    case 'duel': return `${who} te défie en duel sur ${track}.`;
    case 'duel_win': return `Duel gagné contre ${who} sur ${track} (Elo +${it.n || 0}).`;
    case 'duel_loss': return `Duel perdu contre ${who} sur ${track} (Elo ${it.n || 0}).`;
    case 'duel_draw': return `Duel nul contre ${who} sur ${track}.`;
    case 'season': return `La saison ${it.ref} a commencé : trois nouveaux circuits.`;
    case 'season_end': {
      const d = `division ${it.m} (${DIVISIONS[it.m] || '?'})`;
      if (it.n < 0) return `Saison ${it.ref} terminée : tu montes en ${d}.`;
      if (it.n > 0) return `Saison ${it.ref} terminée : tu descends en ${d}.`;
      return `Saison ${it.ref} terminée : tu restes en ${d}.`;
    }
    case 'follow': return `${who} a publié un nouveau circuit : ${track}.`;
    default: return '';
  }
}
export const INBOX_ICONS = { beaten: '⏱', duel: '⚔', duel_win: '🏆', duel_loss: '⚔', duel_draw: '⚔', season: '📅', season_end: '📅', follow: '🆕' };
