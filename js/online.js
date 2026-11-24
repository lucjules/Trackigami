// Fonctions en ligne (Supabase) : pilote anonyme, circuits de la communauté.
// Client minimal en fetch (aucune bibliothèque) : l'API REST de la base et l'API
// d'authentification. Seule la clé PUBLIQUE est ici : la sécurité vient des règles
// de la base (voir supabase/etape1-communaute.sql). Sans réseau, le jeu marche
// normalement et ces fonctions répondent simplement « hors ligne ».
//
// MODÈLE D'IDENTITÉ (TRANS-11 ; détails, prérequis serveur et vérification réelle : supabase/COMPTES.md)
//
//   première action en ligne                 inscription (« Créer mon compte »)                    déconnexion
//   ───────────────────────► INVITÉ ─────────────────────────────────────────────► COMPTE ───────────────────► INVITÉ
//   session anonyme créée      uid A  ── conversion (serveur prêt) : MÊME uid A ──►  uid A    (l'invité était A : sa session a été
//   (POST /auth/v1/signup)            │  PUT /auth/v1/user : adresse, mot de passe          retirée ; un invité NEUF, rien d'orphelin)
//                                     └─ sinon (annoncé) : nouvel utilisateur uid B ──► uid B ──────────────► INVITÉ uid A retrouvé
//   connexion à un compte existant : l'invité A reste tel quel sur l'appareil ; la déconnexion le retrouve.
//
//   Où sont les sessions : invité → `online.session` dans la portée de l'invité (storage.js, jamais dans un code joueur : DEVICE_ONLY_KEYS) ;
//   compte → la clé globale `copytrack.account` (account.js). Une session d'invité n'est retirée QUE lorsqu'elle est devenue celle d'un compte.
//   Renouvellement (jeton à usage unique) : relire la session enregistrée, puis renouveler sous verrou entre onglets (navigator.locks ; repli : bail
//   `copytrack.authLease`), écouter l'évènement « storage ». Un vrai refus du serveur (jeton révoqué) : compte → « session expirée » ; invité → une
//   nouvelle identité, ANNONCÉE (onNotice). Aucun jeton n'est jamais écrit dans un journal.
import { getJSON, setJSON, getGuestJSON, getGlobal, setGlobal, scopedKey, globalKey } from './storage.js';
import { CONFIG } from './config.js';
import { MAX_PUBLISH_CHARS, MAX_PUBLISH_PIECES } from './constants.js';
import { PHYS_VER } from './version.js';

export const ONLINE = CONFIG.supabase;      // { url, key } : voir js/config.js

// Fonctions de la base appelables SANS session (droit execute de anon : voir verify-prod.sql et tools/test-securite-sql.sh, qui comparent cette liste à la base).
export const PUBLIC_RPC = ['follower_count', 'get_ghost', 'modes_list', 'playlists_list', 'random_track', 'recommended_tracks', 'season_standings', 'sector_board', 'track_comments_list', 'track_stats', 'trending_tracks'];

export class OnlineError extends Error {
  constructor(message, code = '', status = 0) { super(message); this.code = code; this.status = status; }
}

// Messages d'erreur compréhensibles.
function explain(status, body, retryAfter = null) {
  const e = explain1(status, body, retryAfter);
  e.status = status;
  return e;
}

// Refus « trop de demandes » (HTTP 429, ou limite de la fonction serveur) : le délai que le serveur annonce est CONSERVÉ (TECH-080 b), au lieu d'un « dans quelques minutes » générique.
// Il vient de l'en-tête Retry-After (secondes ou date HTTP) ; à défaut, du texte du serveur (« réessaie dans 12 s »). Sans délai connu : le message générique.
export function parseRetryAfter(header, now = Date.now()) {
  const h = String(header == null ? '' : header).trim();
  if (!h) return null;
  if (/^\d{1,6}$/.test(h)) return Math.max(1, +h);
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.max(1, Math.ceil((t - now) / 1000)) : null;
}
const delayInText = (msg) => { const m = /réessaie dans (\d{1,5}) ?(s|min|h)\b/i.exec(msg || ''); return m ? Math.max(1, +m[1] * (m[2].toLowerCase() === 'h' ? 3600 : m[2].toLowerCase() === 'min' ? 60 : 1)) : null; };
// « réessaie dans 12 s » (jusqu'à 90 s), puis en minutes ; ces deux phrases sont dans le dictionnaire anglais.
export function waitText(sec) {
  const n = Math.max(1, Math.ceil(sec));
  return n <= 90 ? `Trop de demandes : réessaie dans ${n} s.` : `Trop de demandes : réessaie dans ${Math.ceil(n / 60)} min.`;
}
function rateError(body, retryAfter, msg, generic) {
  const wait = retryAfter != null ? retryAfter : delayInText(msg);
  const e = new OnlineError(wait != null ? waitText(wait) : generic, 'rate');
  if (wait != null) e.retryAfter = wait;
  return e;
}
function explain1(status, body, retryAfter = null) {
  const msg = (body && (body.message || body.msg || body.error_description || body.error)) || '';
  // Le serveur refuse une course ou une publication parce que sa version de physique n'est pas celle du jeu : il le dit par un DRAPEAU (`versionMismatch`, avec `serverPhysVer`),
  // jamais par son texte (la phrase française peut changer ou être traduite). Les deux cas se distinguent par `serverPhysVer` : voir versionMismatchText.
  if (body && body.versionMismatch === true) {
    const e = new OnlineError(msg || 'Version du jeu différente.', 'version-mismatch');
    e.serverPhysVer = typeof body.serverPhysVer === 'number' && Number.isFinite(body.serverPhysVer) ? body.serverPhysVer : null;
    return e;
  }
  if (/anonymous/i.test(msg) && /disabled/i.test(msg)) return new OnlineError('Connexion anonyme désactivée sur le serveur.', 'anon-disabled');
  if (body && body.code === '42P01' || /relation .* does not exist|Could not find the table/i.test(msg)) return new OnlineError('Base non prête (étape 1 SQL manquante).', 'no-schema');
  if (body && body.code === '23505') return new OnlineError('Ce circuit est déjà publié.', 'duplicate');
  if (body && body.code === 'PGRST202' || /Could not find the function/i.test(msg)) return new OnlineError('Fonction en ligne absente : une étape SQL n’est pas encore lancée sur le serveur.', 'no-sql-step');
  if (/compte est nécessaire|Aucun compte ne porte|propre pseudo|Trop de demandes|Liste d.amis pleine|Trop d.abonnements|On ne se suit pas|ses amis|Dix duels|tournoi|Tournoi|invalide \(circuits/.test(msg)) return new OnlineError(msg, 'social');
  if (status === 404 && body && body.code === 'NOT_FOUND' && /function/i.test(msg)) {
    return new OnlineError('Fonction « submit-score » introuvable sur le serveur.', 'no-function');
  }
  if (/Trop de publications/.test(msg)) return new OnlineError(msg, 'rate');
  if (status === 429 && /Trop de courses/.test(msg)) return rateError(body, retryAfter, msg, 'Trop de courses envoyées : réessaie dans un instant.');
  // Comptes (Supabase Auth)
  const ec = (body && (body.error_code || body.code)) || '';
  if (ec === 'user_already_exists' || /already registered|already been registered/i.test(msg)) return new OnlineError('Ce pseudo est déjà pris.', 'name-taken');
  if (ec === 'invalid_credentials' || /Invalid login credentials/i.test(msg)) return new OnlineError('Pseudo ou mot de passe incorrect.', 'bad-credentials');
  if (ec === 'weak_password') return new OnlineError('Mot de passe trop faible : au moins 8 caractères.', 'weak-password');
  if (ec === 'email_address_invalid' || ec === 'validate_failed' || /email address.*invalid/i.test(msg)) return new OnlineError('Le serveur refuse les comptes (voir COMPTES.md).', 'server-config');
  if (ec === 'signup_disabled') return new OnlineError('Les inscriptions sont désactivées sur le serveur.', 'server-config');
  if (ec === 'over_request_rate_limit' || ec === 'over_email_send_rate_limit' || status === 429) return rateError(body, retryAfter, msg, 'Trop d’essais : réessaie dans quelques minutes.');
  if (/Database error saving new user/i.test(msg)) return new OnlineError('Ce pseudo est déjà pris ou invalide.', 'name-taken');
  if (/appartient à un compte/.test(msg)) return new OnlineError('Ce pseudo appartient à un compte : choisis-en un autre.', 'name-taken');
  if (status === 401 || status === 403) { const d = new OnlineError('Accès refusé par le serveur.', 'denied'); d.permission = !!body && body.code === '42501'; return d; }
  return new OnlineError(msg || `Erreur du serveur (${status}).`, 'http');
}

// Message affiché au joueur quand le serveur a refusé un temps pour cause de version (erreur de code 'version-mismatch') ; physVer : la version de physique de CE jeu.
//  - serveur en retard (serverPhysVer < physVer) : la fonction « submit-score » n'est pas encore à jour, ce qui arrive pendant un déploiement : recharger la page ne sert à rien, il faut attendre ;
//  - serveur en avance (serverPhysVer > physVer) : c'est CETTE page qui est périmée (ancienne version en cache) : la recharger ;
//  - version du serveur inconnue : les deux pistes. Dans tous les cas, le record reste enregistré sur l'appareil.
export function versionMismatchText(err, physVer) {
  const sv = err && typeof err.serverPhysVer === 'number' ? err.serverPhysVer : null;
  if (sv !== null && sv > physVer) return '🌍 Classement indisponible : ton jeu n’est plus à jour. Recharge la page. Record gardé ici.';
  if (sv !== null && sv < physVer) return '🌍 Classement indisponible : le serveur est en cours de mise à jour, réessaie dans quelques minutes. Record gardé ici.';
  return '🌍 Classement indisponible : le serveur et ton jeu ne sont pas à la même version. Réessaie dans quelques minutes, ou recharge la page. Record gardé ici.';
}

// Le serveur a-t-il REFUSÉ le jeton de renouvellement (périmé, déjà utilisé, révoqué) ? 400 / 401 / 403 ; tout le reste (réseau, 5xx, 429) est passager.
const refusedToken = (e) => !!e && (e.status === 400 || e.status === 401 || e.status === 403);
const transient = (e) => (e && e.code === 'offline' ? e : new OnlineError('Serveur momentanément indisponible : réessaie dans un instant.', 'offline', e && e.status));

const AUTH_LOCK = 'trackigami-auth';
// Une session encore valable au moins une minute.
const fresh = (s) => !!(s && s.access_token && s.expires_at && s.expires_at * 1000 > Date.now() + 60000);
const sessionOf = (txt) => { try { const s = JSON.parse(txt); return s && typeof s === 'object' && s.access_token && s.refresh_token && s.user && s.user.id ? s : null; } catch { return null; } };
export const NEW_GUEST_IDENTITY = 'Ta session d’invité n’est plus reconnue par le serveur : une nouvelle identité en ligne a été créée (tes anciens temps et circuits publiés restent sous l’ancienne).';

class OnlineClient {
  constructor() {
    this.kind = 'guest';                 // 'guest' : session anonyme ; 'account' : session du compte (voir account.js)
    this.session = getJSON('online.session', null);
    this.player = getJSON('online.player', null);
    this.onAccountSession = null;        // appelé quand la session du compte est renouvelée (pour la mémoriser)
    this._authP = null;
    this._onNotice = null; this._pending = [];
  }

  // Ce que le joueur doit savoir (une nouvelle identité d'invité, jamais en silence) : l'application le montre ; en attendant qu'elle soit prête, c'est gardé.
  get onNotice() { return this._onNotice; }
  set onNotice(fn) { this._onNotice = fn; if (fn) for (const m of this._pending.splice(0)) { try { fn(m); } catch { /* l'affichage ne casse rien */ } } }
  _announce(msg) { if (this._onNotice) { try { this._onNotice(msg); } catch { /* idem */ } } else this._pending.push(msg); }

  // Passe en mode compte : la session est celle du compte, jamais une session anonyme de remplacement.
  useAccount(session) {
    this.kind = 'account';
    this.session = session;
    this.player = null;                  // le profil en ligne (table players) est créé au premier besoin : ensurePlayer
  }

  // Retour au mode invité (déconnexion ; la portée de stockage est déjà celle de l'invité) : on REPREND l'identité d'invité de cet appareil, telle qu'elle est enregistrée.
  // Avant (TECH-025), elle était effacée : ses temps, circuits publiés et « j'aime » devenaient inaccessibles, et chaque déconnexion fabriquait un anonyme de plus. Il n'y en a
  // pas (première visite, ou identité devenue celle d'un compte : forgetGuestSession) : une session anonyme neuve sera créée au premier besoin.
  useGuest() {
    this.kind = 'guest';
    this.session = getJSON('online.session', null);
    this.player = getJSON('online.player', null);
  }

  // L'identité d'invité de cet appareil est DEVENUE celle d'un compte (conversion, account.js) : ses jetons ne doivent plus rester dans la portée de l'invité (sinon, après une
  // déconnexion, l'invité serait encore connecté au compte). Seul chemin qui retire une session d'invité, et seulement quand rien ne s'y rattache plus.
  forgetGuestSession() {
    setJSON('online.session', null);
    setJSON('online.player', null);
  }

  // La session telle qu'enregistrée sur l'appareil (un autre onglet a pu la renouveler) : celle de l'invité dans sa portée, celle du compte dans la clé globale du compte.
  _stored() {
    if (this.kind === 'account') { const g = getGlobal('account', null); return g && g.session && g.uid === this.uid ? g.session : null; }
    return getJSON('online.session', null);
  }
  // Reprend la session enregistrée si elle est plus récente que la nôtre (même compte ; pour l'invité : l'identité de l'appareil). Renvoie true si elle a été reprise.
  _adoptStored() {
    const st = this._stored();
    if (!st || !st.access_token || !st.refresh_token || !st.user || !st.user.id) return false;
    const s = this.session;
    if (s && st.refresh_token === s.refresh_token) return false;
    if (s && this.kind === 'account' && st.user.id !== s.user.id) return false;
    if (s && st.user.id === s.user.id && (+st.expires_at || 0) < (+s.expires_at || 0)) return false;
    this.session = st;
    if (this.kind === 'guest') this.player = getJSON('online.player', null);
    return true;
  }
  // Évènement « storage » (un autre onglet a écrit) : la session renouvelée là-bas est reprise ici tout de suite.
  storageEvent(e) {
    if (!e || typeof e.key !== 'string') return false;
    if (this.kind === 'guest' && e.key !== scopedKey('online.session')) return false;
    if (this.kind === 'account' && e.key !== globalKey('account')) return false;
    if (this.kind === 'guest' && !sessionOf(e.newValue)) return false;
    return this._adoptStored();
  }

  // Verrou entre onglets pour renouveler (Web Locks API : un seul onglet à la fois, les autres attendent puis relisent la session enregistrée). Sans navigator.locks
  // (navigateur ancien), REPLI : un bail dans le stockage (clé globale « authLease » : qui renouvelle, jusqu'à quand), écrit puis relu après un court délai ; il n'est pas
  // atomique (deux onglets peuvent, rarement, se croire seuls), d'où aussi la relecture de la session avant d'envoyer le jeton et l'attente, sur un refus, qu'un autre onglet ait
  // enregistré la sienne (_awaitOther). Un bail abandonné (onglet fermé) expire seul au bout de 8 s.
  _withLock(fn) {
    const locks = typeof navigator !== 'undefined' && navigator && navigator.locks;
    return locks && typeof locks.request === 'function' ? locks.request(AUTH_LOCK, fn) : this._leaseLock(fn);
  }
  async _leaseLock(fn) {
    const me = this._tab || (this._tab = Math.random().toString(36).slice(2, 10));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 24; i++) {
      const l = getGlobal('authLease', null);
      if (!l || !(l.until > Date.now()) || l.owner === me) {
        setGlobal('authLease', { owner: me, until: Date.now() + 8000 });
        await wait(60);                                    // (un autre onglet qui écrit en même temps se manifeste)
        const l2 = getGlobal('authLease', null);
        if (l2 && l2.owner === me) {
          try { return await fn(); } finally { const l3 = getGlobal('authLease', null); if (l3 && l3.owner === me) setGlobal('authLease', null); }
        }
      }
      await wait(250);
    }
    return fn();                                           // (bail jamais obtenu en ~7 s : on renouvelle quand même, la relecture protège encore)
  }
  async _awaitOther(used) {
    for (let i = 0; i < 6; i++) {
      if (this._adoptStored() && this.session.refresh_token !== used) return this.session;
      await new Promise((r) => setTimeout(r, 500));
    }
    return this._adoptStored() && this.session.refresh_token !== used ? this.session : null;
  }
  // Renouvelle tout de suite (après une conversion en compte : le nouveau jeton n'est plus marqué « anonyme »), sous le même verrou entre onglets.
  async refreshNow() {
    const s = await this._withLock(async () => { this._adoptStored(); return this._refresh(this.session); });
    this.session = s;
    this._save();
    return s;
  }
  async _refresh(s) {
    return this._norm(await this._fetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s && s.refresh_token }, auth: false }));
  }

  // Les AUTRES identités en ligne connues de cet appareil, pour l'export des données (TECH-032) : l'invité gardé à côté d'un compte connecté (inscription sans conversion, ou
  // connexion à un compte existant : sa session anonyme reste dans la portée de l'invité). Sa session sert à lire SES tables privées tant que son jeton est valable ; sinon (jeton
  // périmé : on ne le renouvelle pas ici, ce serait consommer son jeton de renouvellement pour un export) seules les tables publiques sont lues, et l'export le dit.
  otherIdentities() {
    if (this.kind !== 'account') return [];
    const g = getGuestJSON('online.session', null);
    const uid = g && g.user && g.user.id;
    if (typeof uid !== 'string' || uid === this.uid) return [];
    return [{ label: 'guest', uid, token: fresh(g) ? g.access_token : null }];
  }
  // Lecture avec un jeton donné (jamais celui de la session courante) : export de l'identité de l'invité.
  restWith(token, path) { return this._fetch(path, { auth: false, headers: { Authorization: 'Bearer ' + token } }); }

  // Appel REST authentifié (utilisé par account.js).
  rest(path, opts = {}) { return this._fetch(path, opts); }

  get uid() { return this.session && this.session.user && this.session.user.id; }

  _save() {
    if (this.kind === 'account') { if (this.onAccountSession) this.onAccountSession(this.session); return; }
    setJSON('online.session', this.session);
    setJSON('online.player', this.player);
  }

  // Toute lecture de circuits demande aussi author_verified (étape SQL 15 : le temps de l'auteur a-t-il été REJOUÉ par le serveur ?). Colonne absente (étape pas
  // lancée) : on relit sans elle, et tous les temps d'auteur sont alors « non vérifiés » (jamais présumés exacts).
  async _fetch(path, opts = {}) {
    const wantsVerified = (opts.method || 'GET') === 'GET' && this.hasVerified !== false && /^\/rest\/v1\/tracks\?/.test(path) && path.includes('author_time') && !path.includes('author_verified');
    if (!wantsVerified) return this._fetchRaw(path, opts);
    try { return await this._fetchRaw(path.replace('author_time', 'author_time%2Cauthor_verified'), opts); }
    catch (e) {
      if (!/author_verified/i.test((e && e.message) || '')) throw e;
      this.hasVerified = false;
      return this._fetchRaw(path, opts);
    }
  }

  // Lecture ou écriture REST. auth : true (défaut : session exigée, créée au besoin), false (clé publique seule, aucune session) ou 'optional' (la session de l'appareil si elle
  // existe et peut être reprise, sinon la clé publique : une LECTURE PUBLIQUE ne crée jamais de joueur anonyme, TECH-031). Renvoie { res, data } : toute requête passe ici,
  // donc toute erreur réseau devient la même OnlineError lisible (TECH-080 a).
  async _send(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OnlineError('Pas de connexion internet.', 'offline');
    const h = { apikey: ONLINE.key, 'Content-Type': 'application/json', ...headers };
    if (auth === true) {
      await this.ensureSession();
      h.Authorization = 'Bearer ' + this.session.access_token;
    } else if (auth === 'optional') {
      const s = await this._optionalSession();
      if (s) h.Authorization = 'Bearer ' + s.access_token;
    }
    let res;
    try {
      res = await fetch(ONLINE.url + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    } catch {
      throw new OnlineError('Serveur injoignable (connexion internet ?).', 'offline');
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw explain(res.status, data, parseRetryAfter(res.headers && res.headers.get && res.headers.get('retry-after')));
    return { res, data };
  }
  async _fetchRaw(path, opts = {}) { return (await this._send(path, opts)).data; }

  // La session de l'appareil pour une lecture publique : celle qui existe (renouvelée si besoin), jamais une neuve. Aucune ne marche : null (clé publique seule).
  async _optionalSession() {
    try { return await this.ensureSession(false); } catch { return null; }
  }

  // Lectures PUBLIQUES (clé publique, session de l'appareil seulement si elle existe) : classement, circuits, fantômes, saisons… Une action (publier, aimer, jouer un temps)
  // exige toujours une session, créée à ce moment-là seulement. PUBLIC_RPC : les fonctions que la base ouvre à anon (vérifié par tools/test-securite-sql.sh).
  read(path) { return this._fetch(path, { auth: 'optional' }); }
  readRpc(name, body = {}) {
    if (!PUBLIC_RPC.includes(name)) throw new OnlineError('Fonction non publique : ' + name, 'no-sql-step');
    return this._fetch('/rest/v1/rpc/' + name, { method: 'POST', body, auth: 'optional' });
  }

  // Session anonyme : créée au premier besoin, rafraîchie avant expiration. Deux onglets (TECH-026) : chacun relit la session ENREGISTRÉE avant de renouveler (un autre a pu
  // le faire : son jeton de renouvellement, à usage unique, est alors déjà consommé), sous un verrou entre onglets ; un refus n'est un vrai refus qu'après relecture.
  // create = false : ne JAMAIS inscrire un nouvel utilisateur anonyme (lecture publique, TECH-031) ; renvoie null si la session de l'appareil ne peut pas être reprise.
  async ensureSession(create = true) {
    if (!fresh(this.session)) this._adoptStored();
    if (fresh(this.session)) return this.session;
    if (!create) return this.session && this.session.refresh_token ? this._withLock(() => this._renew(false)) : null;
    // (le verrou ne sert qu'à RENOUVELER un jeton existant : une toute première session n'a rien à protéger)
    if (!this._authP) this._authP = Promise.resolve(this.session && this.session.refresh_token ? this._withLock(() => this._renew()) : this._renew()).finally(() => { this._authP = null; });
    return this._authP;
  }

  async _renew(create = true) {
    this._adoptStored();                                  // (pendant l'attente du verrou, un autre onglet a peut-être renouvelé)
    if (fresh(this.session)) return this.session;
    const s = this.session;
    if (this.kind === 'account') {
      // Compte : on renouvelle SA session. Jamais de repli sur une session anonyme (ce serait un autre joueur).
      try { this.session = await this._refresh(s); } catch (e) {
        if (!refusedToken(e)) throw transient(e);        // réseau coupé, serveur en panne ou trop d'essais : la session est conservée, on réessaiera
        const other = await this._awaitOther(s && s.refresh_token);
        if (other) return other;                           // un autre onglet l'avait renouvelée : rien n'est perdu
        throw new OnlineError('Session expirée : reconnecte-toi.', 'session-expired');
      }
      this._save();
      return this.session;
    }
    if (s && s.refresh_token) {
      try {
        this.session = await this._refresh(s);
        this._save();
        return this.session;
      } catch (e) {
        // Seul un jeton REFUSÉ par le serveur donne une nouvelle session anonyme (donc un autre pilote). Une panne passagère (réseau, 5xx, trop
        // d'essais) ne doit pas faire perdre son identité à l'invité : l'erreur remonte et la session est gardée pour le prochain essai.
        if (!refusedToken(e)) throw transient(e);
        const other = await this._awaitOther(s.refresh_token);
        if (other) return other;
      }
    }
    if (!create) return null;                              // lecture publique : jamais d'inscription (la prochaine ACTION en créera une, annoncée)
    const had = !!(s && s.user && s.user.id);
    this.session = this._norm(await this._fetch('/auth/v1/signup', { method: 'POST', body: { data: {} }, auth: false }));
    this.player = null;
    this._save();
    if (had) this._announce(NEW_GUEST_IDENTITY);           // l'ancienne identité est perdue côté serveur : le joueur le sait
    return this.session;
  }

  _norm(d) {
    if (!d || !d.access_token) throw new OnlineError('Connexion refusée par le serveur.', 'auth');
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: { id: d.user && d.user.id } };
  }

  // Profil du pilote (pseudo). Créé ou mis à jour si le pseudo a changé.
  async ensurePlayer(name) {
    await this.ensureSession();
    // Compte : le pseudo du compte, toujours. Invité : son pseudo de session, jamais un nom par défaut.
    const clean = String(this.kind === 'account' && this.player ? this.player.name : name || '').trim().slice(0, 20);
    if (!clean) throw new OnlineError('Choisis d’abord un pseudo.', 'no-name');
    if (/^(player|pilote)$/i.test(clean)) throw new OnlineError('« Player » et « Pilote » sont réservés : choisis ton propre pseudo.', 'no-name');
    if (this.player && this.player.id === this.uid && this.player.name === clean) return this.player;
    await this._fetch('/rest/v1/players', {
      method: 'POST', body: { id: this.uid, name: clean },
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    this.player = { id: this.uid, name: clean };
    this._save();
    return this.player;
  }

  // ---- Circuits de la communauté ---------------------------------------------------
  // Le pseudo de l'auteur : lien précisé (plusieurs liens existent entre circuits et pilotes).
  static FIELDS = 'id,name,decor,code,author_time,pieces,laps,plays,likes,created_at,author,players!tracks_author_fkey(name)';

  // La colonne « description » arrive avec l'étape 3 (SQL) : tant qu'elle n'existe pas,
  // tout marche sans elle.
  static noDesc(e) { return /description/i.test((e && e.message) || ''); }

  async listTracks(opts = {}) {
    if (this.hasDesc !== false) {
      try { const r = await this._listTracks(opts, true); this.hasDesc = true; return r; } catch (e) {
        if (!OnlineClient.noDesc(e)) throw e;
        this.hasDesc = false;
      }
    }
    return this._listTracks(opts, false);
  }

  async _listTracks({ sort = 'recent', search = '', mine = false, authors = null, limit = 30, offset = 0 } = {}, desc = true) {
    const q = new URLSearchParams();
    q.set('select', OnlineClient.FIELDS + (desc ? ',description' : ''));
    if (mine) { const s = await this._optionalSession(); if (!s) return []; q.set('author', 'eq.' + s.user.id); }       // « mes circuits » : sans session sur cet appareil, il n'y en a pas (rien à créer pour le savoir)
    else if (Array.isArray(authors)) q.set('author', 'in.(' + authors.filter((x) => /^[0-9a-f-]{36}$/.test(x)).join(',') + ')');     // auteurs suivis (E15)
    if (search.trim()) q.set('name', 'ilike.*' + search.trim().replace(/[*,()]/g, ' ') + '*');
    q.set('order', sort === 'popular' ? 'likes.desc,plays.desc,created_at.desc' : sort === 'played' ? 'plays.desc,created_at.desc' : 'created_at.desc');
    q.set('limit', String(limit));
    q.set('offset', String(offset));
    return this.read('/rest/v1/tracks?' + q.toString());
  }

  // Un circuit de la communauté par son identifiant (favoris du Race Hub) : la ligne complète, ou null s'il a été retiré.
  async trackById(id) {
    if (!/^[0-9a-f-]{36}$/.test(String(id))) return null;
    const q = new URLSearchParams();
    q.set('select', OnlineClient.FIELDS + (this.hasDesc === false ? '' : ',description'));
    q.set('id', 'eq.' + id);
    let rows;
    try { rows = await this.read('/rest/v1/tracks?' + q.toString()); }
    catch (e) { if (!OnlineClient.noDesc(e)) throw e; this.hasDesc = false; q.set('select', OnlineClient.FIELDS); rows = await this.read('/rest/v1/tracks?' + q.toString()); }
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  // Les circuits les plus joués ces derniers jours (étape 8). Renvoie les lignes complètes (comme listTracks), dans l'ordre, avec week_players ; [] si la fonction n'existe pas.
  async trending({ days = 7, limit = 24, offset = 0 } = {}) {
    let ranks;
    try { ranks = await this.readRpc('trending_tracks', { days, lim: limit, off: offset }); }
    catch (e) { if (e && e.code === 'http' && /trending_tracks|function|404/i.test(e.message)) return null; throw e; }
    if (!Array.isArray(ranks) || !ranks.length) return [];
    const ids = ranks.map((r) => r.id).filter((id) => /^[0-9a-f-]{36}$/.test(id));
    const q = new URLSearchParams();
    q.set('select', OnlineClient.FIELDS + (this.hasDesc === false ? '' : ',description'));
    q.set('id', 'in.(' + ids.join(',') + ')');
    let rows;
    try { rows = await this.read('/rest/v1/tracks?' + q.toString()); }
    catch (e) { if (!OnlineClient.noDesc(e)) throw e; this.hasDesc = false; q.set('select', OnlineClient.FIELDS); rows = await this.read('/rest/v1/tracks?' + q.toString()); }
    const by = new Map((rows || []).map((r) => [r.id, r]));
    return ranks.filter((r) => by.has(r.id)).map((r) => ({ ...by.get(r.id), week_players: +r.week_players || 0 }));
  }

  // Publication VÉRIFIÉE : le code du circuit et la course de vérification de l'auteur (proof : { inputs, time }, voir js/authorProof.js) partent à la fonction
  // serveur, qui rejoue la course sur ce code. Le temps de l'auteur publié est celui du rejeu ; plus aucune insertion directe dans la base.
  async publish(track, playerName, proof) {
    const code = track.encode();
    if (code.length > MAX_PUBLISH_CHARS) throw new OnlineError(`Circuit trop gros (${code.length} / ${MAX_PUBLISH_CHARS} caractères).`, 'too-big');
    if (track.tiles.length > MAX_PUBLISH_PIECES) throw new OnlineError(`Circuit trop gros (${track.tiles.length} / ${MAX_PUBLISH_PIECES} pièces).`, 'too-big');
    if (!proof || typeof proof.inputs !== 'string' || !(proof.time > 0)) throw new OnlineError('Refais la vérification de ton circuit (« ✔ Vérifier » dans l’éditeur) : le serveur rejoue ta course pour confirmer ton temps.', 'no-proof');
    await this.ensurePlayer(playerName);
    return this._fetch('/functions/v1/submit-score', { method: 'POST', body: {
      action: 'publish-track', code, inputs: proof.inputs, time: proof.time, physVer: PHYS_VER,
      name: track.name.slice(0, 40) || 'Sans titre', description: track.desc || '',
    } });
  }

  // Modifier le nom et la description d'un circuit publié (le sien seulement).
  async updateTrackMeta(id, name, description) {
    try {
      await this._fetch('/rest/v1/rpc/update_track_meta', { method: 'POST', body: { t: id, n: name, d: description } });
    } catch (e) {
      if (e.code === 'http' && /update_track_meta|function/i.test(e.message)) throw new OnlineError('Modification indisponible (étape 3 SQL manquante).', 'no-schema');
      throw e;
    }
  }

  async deleteTrack(id) {
    await this._fetch('/rest/v1/tracks?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }

  // Titre affiché à côté de mon pseudo dans les classements (décoratif ; liste blanche côté serveur : supabase/etape8-decouverte.sql). '' = aucun.
  async setTitle(id) {
    await this.ensureSession();
    return this._fetch('/rest/v1/rpc/set_title', { method: 'POST', body: { t: id || '' } });
  }

  // Statistiques de jeu anonymes (voir telemetry.js, supabase/etape6-telemetrie.sql) : pas de session, pas de pseudo.
  async logRuns(events) {
    return this._fetch('/rest/v1/rpc/log_runs', { method: 'POST', body: { events }, auth: false });
  }

  // Avis d'un testeur (js/feedback.js, supabase/etape19-avis.sql) : sans session ; renvoie l'identifiant de l'avis, ou 0 si un plafond est atteint.
  async sendFeedback(f) {
    return this._fetch('/rest/v1/rpc/submit_feedback', { method: 'POST', body: { f }, auth: false });
  }

  // Erreurs du jeu (js/errorReport.js, supabase/etape18-maintenance.sql) : sans session, comme les statistiques.
  async logErrors(events) {
    return this._fetch('/rest/v1/rpc/log_errors', { method: 'POST', body: { events }, auth: false });
  }

  async played(id) {
    try { await this._fetch('/rest/v1/rpc/track_played', { method: 'POST', body: { t: id } }); } catch { /* sans importance */ }
  }

  async toggleLike(id, playerName) {
    await this.ensurePlayer(playerName);
    return this._fetch('/rest/v1/rpc/toggle_like', { method: 'POST', body: { t: id } });
  }

  async report(id, playerName) {
    await this.ensurePlayer(playerName);
    await this._fetch('/rest/v1/rpc/report_track', { method: 'POST', body: { t: id } });
  }

  // ---- Classements ------------------------------------------------------------------
  // Envoie une course terminée : la fonction serveur la rejoue avant d'accepter le temps.
  async submitScore({ trackKey, code = '', inputs, time, physVer }, playerName) {
    await this.ensurePlayer(playerName);
    return this._fetch('/functions/v1/submit-score', { method: 'POST', body: { trackKey, code, inputs, time, physVer } });
  }

  // Colonnes demandées au classement (TECH-021). Trois sont récentes et peuvent manquer, ou ne pas être ACCORDÉES en lecture :
  //   ghost (has_ghost, étape 7), title (players.title, étape 8 + droits de l'étape 14), veh (ghost_veh, étape 7 ; lecture accordée par l'étape 20 : avant elle, PostgreSQL
  //   refusait la requête complète). Le jeu marche AVEC ou SANS chacune : on demande tout, et un refus de COLONNE retire celle qu'il nomme (PostgreSQL nomme une colonne absente ;
  //   un droit refusé ne nomme rien : la colonne véhicule, seule jamais accordée avant l'étape 20, saute la première). Au plus trois relectures. Une autre erreur (réseau,
  //   serveur, trop d'essais, session) remonte tout de suite.
  static lbSelect(f) {
    return ['time,player,updated_at', f.ghost && 'has_ghost', f.ghost && f.veh && 'ghost_veh', `players!scores_player_fkey(${f.title ? 'name,title' : 'name'})`].filter(Boolean).join(',');
  }
  // Une erreur qui vient d'un schéma ou d'un droit qui diffère : colonne absente (400), relation inconnue, droit de colonne refusé (42501), ou le même texte venu d'ailleurs.
  static schemaMismatch(e) {
    if (!e || e.code === 'offline' || e.code === 'rate') return false;
    if (e.code === 'denied') return e.permission === true;                  // 403/401 par DROIT (42501) ; un jeton refusé (session) n'est pas un schéma différent
    if (e.code === 'http' && (e.status === 400 || e.status === 404)) return true;
    return /does not exist|column|relationship|schema cache/i.test(e.message || '');
  }
  // Les colonnes à demander après ce refus, ou null s'il n'y a plus rien à retirer.
  static lbDegrade(f, e) {
    const m = String((e && e.message) || ''), n = { ...f };
    if (/has_ghost/.test(m)) { n.ghost = false; n.veh = false; }
    else if (/ghost_veh/.test(m)) n.veh = false;
    else if (/title/.test(m)) n.title = false;
    else if (n.ghost && n.veh) n.veh = false;
    else if (n.title) n.title = false;
    else if (n.ghost) n.ghost = false;
    return n.ghost === f.ghost && n.veh === f.veh && n.title === f.title ? null : n;
  }

  // Lit le classement avec les colonnes que la base accorde ; le résultat est retenu 30 min (après l'étape 20 appliquée, le jeu retrouve la lecture complète sans recharger).
  async _leaderboardRows(q) {
    const now = Date.now();
    if (!this._lbFlags || now - (this._lbAt || 0) > 30 * 60000) this._lbFlags = { ghost: true, veh: true, title: true };
    let f = this._lbFlags;
    for (;;) {
      q.set('select', OnlineClient.lbSelect(f));
      try {
        const rows = await this.read('/rest/v1/scores?' + q.toString());
        this._lbFlags = f; this._lbAt = now;
        return rows;
      } catch (e) {
        const next = OnlineClient.schemaMismatch(e) ? OnlineClient.lbDegrade(f, e) : null;
        if (!next) throw e;
        f = next;
      }
    }
  }

  async leaderboard(trackKey, physVer, limit = 10) {
    const q = new URLSearchParams();
    q.set('track_key', 'eq.' + trackKey);
    q.set('phys_ver', 'eq.' + physVer);
    q.set('order', 'time.asc,updated_at.asc');
    q.set('limit', String(limit));
    const top = await this._leaderboardRows(q);
    // Ma place, si j'ai un temps.
    let me = null;
    if (this.uid) {
      const mine = await this.read(`/rest/v1/scores?select=time&track_key=eq.${encodeURIComponent(trackKey)}&phys_ver=eq.${physVer}&player=eq.${this.uid}`);
      if (mine && mine.length) {
        const before = await this._count(`track_key=eq.${encodeURIComponent(trackKey)}&phys_ver=eq.${physVer}&time=lt.${mine[0].time}`);
        me = { time: mine[0].time, rank: before + 1 };
      }
    }
    const total = await this._count(`track_key=eq.${encodeURIComponent(trackKey)}&phys_ver=eq.${physVer}`);
    return { top: top || [], me, total };
  }

  // Le fantôme du n° rank (1 à 10) du classement d'un circuit : { name, time, ghost (base64), veh } ou null (record d'avant l'étape 7, ou hors du top 10).
  async ghost(trackKey, rank, physVer) {
    const rows = await this.readRpc('get_ghost', { k: trackKey, r: rank, pv: physVer });
    const g = Array.isArray(rows) ? rows[0] : null;
    return g && typeof g.ghost === 'string' ? { name: String(g.name || '?'), time: +g.time, ghost: g.ghost, veh: g.ghost_veh || [] } : null;
  }

  // Nombre de lignes de scores qui répondent au filtre (en-tête Content-Range) : par la MÊME voie que les autres lectures (erreurs réseau lisibles, délai d'un 429 gardé :
  // TECH-080 a, b) et sans session obligatoire (TECH-031).
  async _count(query) {
    const { res } = await this._send(`/rest/v1/scores?${query}&select=player`, { auth: 'optional', headers: { Prefer: 'count=exact', Range: '0-0' } });
    return parseInt((res.headers.get('content-range') || '*/0').split('/')[1], 10) || 0;
  }

  // ---- Amis et abonnements (supabase/etape10-social.sql, E15) : comptes seulement pour les amis ---------------------------
  rpc(name, body = {}) { return this._fetch('/rest/v1/rpc/' + name, { method: 'POST', body }); }
  async friends() { const r = await this.rpc('my_friends'); return Array.isArray(r) ? r : []; }
  async friendRequest(name, playerName) { await this.ensurePlayer(playerName); return this.rpc('friend_request', { target_name: String(name || '').trim() }); }
  async friendRespond(id, accept) { return this.rpc('friend_respond', { other: id, accept: !!accept }); }
  async friendRemove(id) { return this.rpc('friend_remove', { other: id }); }
  async friendsBoard(trackKey, physVer, limit = 20) { const r = await this.rpc('friends_board', { k: trackKey, pv: physVer, lim: limit }); return Array.isArray(r) ? r : []; }
  async follow(authorId, playerName) { await this.ensurePlayer(playerName); return this.rpc('follow', { author_id: authorId }); }
  async unfollow(authorId) { return this.rpc('unfollow', { author_id: authorId }); }
  async followerCount(authorId) { return +(await this.readRpc('follower_count', { author_id: authorId })) || 0; }
  async myFollows() { const s = await this._optionalSession(); if (!s) return new Set(); const r = await this.read('/rest/v1/follows?select=author&follower=eq.' + s.user.id); return new Set((r || []).map((x) => x.author)); }

  // ---- Classements par secteur (etape9-secteurs.sql) ----------------------------------------------------------------------
  async sectorBoard(trackKey, physVer, i, limit = 10) { const r = await this.readRpc('sector_board', { k: trackKey, pv: physVer, i, lim: limit }); return Array.isArray(r) ? r : []; }

  // ---- Saisons (etape11-saisons.sql) : la base clôt les saisons finies avant qu'on les lise ---------------------------------
  // La clôture (close_due_seasons) exige une session : sans session sur l'appareil, on lit le classement tel quel (la clôture se fera à la prochaine lecture d'un joueur connecté).
  async seasonStandings(n, limit = 20) {
    if (await this._optionalSession()) { try { await this.rpc('close_due_seasons'); } catch (e) { if (e.code === 'no-sql-step') throw e; } }
    const r = await this.readRpc('season_standings', { n, lim: limit });
    return Array.isArray(r) ? r : [];
  }
  async mySeason(n) { const r = await this.rpc('my_season', { n }); return Array.isArray(r) && r[0] ? r[0] : null; }

  // ---- Compétition asynchrone (etape12-competition.sql) : la base règle duels et tournois échus avant qu'on les lise ---------------
  async settleDue() { try { await this.rpc('settle_due'); } catch (e) { if (e.code === 'no-sql-step') throw e; } }
  async duels() { await this.settleDue(); const r = await this.rpc('my_duels', { lim: 30 }); return Array.isArray(r) ? r : []; }
  async duelChallenge(targetId, trackKey, trackName, playerName) { await this.ensurePlayer(playerName); return +(await this.rpc('duel_challenge', { target: targetId, track: trackKey, tname: String(trackName || '').slice(0, 60) })); }
  async duelRespond(id, accept) { return this.rpc('duel_respond', { duel: id, accept: !!accept }); }
  async friendsRatings() { const r = await this.rpc('friends_ratings'); return Array.isArray(r) ? r : []; }
  async headToHead(id) { const r = await this.rpc('head_to_head', { other: id }); return Array.isArray(r) && r[0] ? r[0] : { wins: 0, draws: 0, losses: 0 }; }
  async tournaments() { await this.settleDue(); const r = await this.rpc('my_tournaments'); return Array.isArray(r) ? r : []; }
  async tournamentCreate(name, trackKey, trackName, days, playerName) { await this.ensurePlayer(playerName); const r = await this.rpc('tournament_create', { tname: name, track: trackKey, trackname: String(trackName || '').slice(0, 60), days }); return Array.isArray(r) ? r[0] : r; }
  async tournamentJoin(code, playerName) { await this.ensurePlayer(playerName); return +(await this.rpc('tournament_join', { jcode: String(code || '').trim() })); }
  async tournamentBoard(id) { const r = await this.rpc('tournament_board', { tid: id }); return Array.isArray(r) ? r : []; }

  async myLikes() {
    const s = await this._optionalSession();
    if (!s) return new Set();                                            // aucune session sur cet appareil : rien n'a été aimé (et afficher la communauté ne crée pas de joueur)
    const rows = await this.read('/rest/v1/track_likes?select=track_id&player=eq.' + s.user.id);
    return new Set((rows || []).map((r) => r.track_id));
  }
}

export const online = new OnlineClient();
// Un autre onglet a renouvelé la session (TECH-026) : on la reprend sans attendre le prochain appel.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('storage', (e) => online.storageEvent(e));
