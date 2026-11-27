// Modération (COMPLETE-004) : le client des fonctions de supabase/etape22-moderation.sql. Réservé aux modérateurs.
//
// LA SÉCURITÉ N'EST PAS ICI. Ce module ne fait que demander à la base « suis-je modérateur ? » et appeler ses fonctions mod_* ; c'est la base qui refuse tout non-modérateur,
// avant toute lecture ou écriture (le premier geste de chaque fonction est `is_moderator(auth.uid())`). Si l'on contournait l'écran, ou ce fichier, rien ne s'ouvrirait de plus.
// L'écran (js/app/moderation.js) n'apparaît que si la base a répondu « vrai » pour la session de CET appareil : une ergonomie, pas une protection.
//
// Sans l'étape SQL 22 sur le serveur, mod_status est introuvable : le jeu n'est pas modérateur (l'écran n'apparaît pour personne). Une erreur réseau ou de session vaut aussi « non ».
import { online } from '../online.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const KINDS = ['track', 'comment'];
export const STATES = ['pending', 'hidden', 'all'];
export const REASON_MIN = 3;
export const REASON_MAX = 300;
export const PAGE = 20;
const list = (r) => (Array.isArray(r) ? r : []);

// Appel d'une fonction de la base AVEC la session de l'appareil si elle existe (jamais une session invitée créée pour l'occasion : un visiteur qui ouvre la communauté
// ne devient pas un joueur de plus). Sans session, la clé publique seule part et la base refuse : la réponse est « non ».
const call = (name, body = {}) => online.rest('/rest/v1/rpc/' + name, { method: 'POST', body, auth: 'optional' });

// Le motif d'une décision : de 3 à 300 caractères, blancs réduits. Renvoie le texte nettoyé, ou null s'il est inacceptable (la base revérifie).
export function cleanReason(text) {
  const r = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return r.length >= REASON_MIN && r.length <= REASON_MAX ? r : null;
}
const need = (text) => {
  const r = cleanReason(text);
  if (!r) throw new Error(`Un motif de ${REASON_MIN} à ${REASON_MAX} caractères est obligatoire.`);
  return r;
};
const needId = (kind, id) => {
  const s = String(id);
  if (!KINDS.includes(kind) || !(kind === 'track' ? UUID.test(s) : /^\d{1,18}$/.test(s))) throw new Error('Contenu inconnu.');
  return s;
};

// ---- Statut : la base, et elle seule, dit si cet appareil est modérateur. Mémorisé par identité (changer de compte l'oublie), brièvement : un statut retiré à la base
// ne reste pas affiché longtemps. Aucune requête sans session.
const STATUS_TTL_MS = 5 * 60 * 1000;
let cached = null;      // { uid, ok, at }
export function forgetModeratorStatus() { cached = null; }
export async function isModerator(now = Date.now()) {
  let s = null;
  try { s = await online.ensureSession(false); } catch { s = null; }
  const uid = s && s.user && s.user.id;
  if (!uid) { cached = null; return false; }
  if (cached && cached.uid === uid && now - cached.at < STATUS_TTL_MS) return cached.ok;
  let ok = false;
  try { ok = (await call('mod_status')) === true; } catch { ok = false; }          // étape SQL absente, hors ligne, session refusée : pas modérateur
  cached = { uid, ok, at: now };
  return ok;
}

// ---- File et fiches ----
// Les contenus signalés ou masqués : { kind, id, label, author, author_name, reports, counted, hidden, created_at, last_report_at, pending }.
export async function queue({ kind = 'all', state = 'pending', limit = PAGE, offset = 0 } = {}) {
  if (kind !== 'all' && !KINDS.includes(kind)) throw new Error('Type inconnu.');
  if (!STATES.includes(state)) throw new Error('État inconnu.');
  return list(await call('mod_queue', { k: kind, st: state, lim: Math.max(1, Math.min(100, limit | 0)), off: Math.max(0, offset | 0) }));
}
export const detail = async (kind, id) => call('mod_detail', { k: kind, tid: needId(kind, id) });
// Les signalements d'un contenu : { reported_at (null : d'avant l'étape 22), counted }. JAMAIS qui a signalé (la base ne le donne pas).
export const reports = async (kind, id) => list(await call('mod_reports', { k: kind, tid: needId(kind, id) }));

// ---- Décisions (motif obligatoire) ----
export async function setHidden(kind, id, hide, reason) {
  const why = need(reason), tid = needId(kind, id);
  if (kind === 'track') return call('mod_set_track_hidden', { t: tid, hide: !!hide, why });
  return call('mod_set_comment_hidden', { c: +tid, hide: !!hide, why });
}
// until : une date (Date, nombre de millisecondes ou texte ISO) ou null (jusqu'à réactivation).
export async function suspend(userId, reason, until = null) {
  const why = need(reason);
  if (!UUID.test(String(userId))) throw new Error('Compte inconnu.');
  let u = null;
  if (until != null) {
    const d = new Date(until);
    if (!Number.isFinite(d.getTime()) || d.getTime() <= Date.now()) throw new Error('La date de fin doit être dans le futur.');
    u = d.toISOString();
  }
  return +(await call('mod_suspend', { u: userId, why, until_at: u }));
}
export async function unsuspend(userId, reason) {
  const why = need(reason);
  if (!UUID.test(String(userId))) throw new Error('Compte inconnu.');
  return call('mod_unsuspend', { u: userId, why });
}
export const suspensions = async ({ activeOnly = true, limit = PAGE, offset = 0 } = {}) => list(await call('mod_suspensions', { active_only: !!activeOnly, lim: Math.max(1, Math.min(100, limit | 0)), off: Math.max(0, offset | 0) }));
export const log = async ({ kind = null, id = null, limit = PAGE, offset = 0 } = {}) => list(await call('mod_log', { k: kind, tid: id == null ? null : String(id), lim: Math.max(1, Math.min(100, limit | 0)), off: Math.max(0, offset | 0) }));
