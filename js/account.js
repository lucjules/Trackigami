// Comptes Trackigami : pseudo + mot de passe, sauvegarde cloud entre appareils. Les invités restent locaux.
//
// Mots de passe : jamais stockés ni vus par le jeu. Ils partent en HTTPS vers Supabase Auth (GoTrue), qui ne garde
// qu'un hachage bcrypt salé (auth.users.encrypted_password). Le pseudo sert d'identifiant : l'adresse technique
// « pseudo@accounts.copytrack.invalid » n'est jamais utilisée pour envoyer un e-mail (voir supabase/COMPTES.md).
//
// Données : chaque compte a sa propre portée de stockage local (storage.js : setScope) et une ligne cloud
// (table cloud_saves, lisible et modifiable par son seul propriétaire). La synchronisation fusionne (cloudsave.js)
// au lieu d'écraser : aucune progression perdue si deux appareils ont joué.
import { online, OnlineError } from './online.js';
import {
  getGlobal, setGlobal, setScope, getScope, getSessionFlag, setSessionFlag, dumpAll, restoreAll, restoreFitting, restoreAllOrThrow, getRaw, onWrite, loadSettings, saveSettings, removeKeys,
  isTrialName, StorageFullError,
} from './storage.js';
import { toCloud, fromCloud, mergeSaves, sameData, pickSynced, fitCloud, isSyncKey } from './cloudsave.js';
import { reloadProfile } from './profile.js';
import { CONFIG } from './config.js';
import { checkPseudo, checkPassword, normalizeRecoveryCode, formatRecoveryCode } from './accountRules.js';

// Domaine technique des adresses (doit être le même que dans supabase/etape4-comptes.sql).
const ACCOUNT_EMAIL_DOMAIN = 'accounts.copytrack.invalid';
const MAX_CLOUD_BYTES = 6_000_000;     // au-delà, les fantômes enregistrés (puis les commandes des plus anciens records) ne partent pas dans le cloud (cloudsave.fitCloud)

// Messages quand la copie locale du compte ne tient pas dans le stockage de l'appareil (le cloud, lui, garde tout).
const FIT_FAILED = 'Espace insuffisant sur cet appareil : la sauvegarde du compte n’a pas pu y être écrite (le cloud la garde). Libère de la place sur l’appareil, puis « Synchroniser maintenant ».';
// « Garder ma progression » (TECH-024) : ce qui passe de l'invité au compte : TOUTE la progression et les bibliothèques (circuits, records, profil, prefabs, pièces perso, modes,
// brouillon, preuves de vérification…). Restent à l'appareil : ses réglages, l'identité en ligne de l'invité, les statistiques et erreurs en attente, les essais de l'éditeur (jetables).
const STAY_ON_DEVICE = new Set(['settings', 'online.session', 'online.player', 'telemetry.state', 'telemetry.queue', 'errors.queue']);
// Modèle d'identité (TECH-025, schéma en tête de js/online.js) : messages des cas où l'invité ne devient pas le compte, toujours dits au joueur.
export const GUEST_KEPT = 'Compte créé. Ton identité d’invité (temps et circuits publiés) reste séparée de ce compte : tu la retrouves en te déconnectant.';
const CONVERSION_UNSUPPORTED = 'Le serveur n’a pas enregistré le compte (conversion des invités mal installée, voir supabase/COMPTES.md) : tu restes invité, rien n’est perdu.';
const CONFIRM_REQUIRED = 'Le serveur exige une confirmation d’adresse (« Confirm email ») : impossible de créer le compte depuis l’invité (voir supabase/COMPTES.md). Rien n’a changé.';
const STORAGE_FULL_KEEP = 'Pas assez de place sur cet appareil pour reprendre ta progression dans le compte : rien n’a changé, elle reste en mode invité. Libère de la place, ou crée le compte sans la reprendre.';
export const MIGRATION_FAILED = 'Compte créé, mais ta progression d’invité n’a pas pu y être reprise (stockage plein) : elle reste, intacte, en mode invité sur cet appareil. Pour la reprendre : en mode invité, Profil › Sauvegardes › Exporter le code joueur, puis importe-le dans le compte.';
const fitNote = (fit) => (fit.level === 'partial'
  ? `Espace insuffisant sur cet appareil : ${fit.dropped} records du compte n’y sont pas écrits (le cloud les garde en entier).`
  : `Espace insuffisant sur cet appareil : copie du compte allégée (${fit.lightened} records sans fantôme ni commandes ; le cloud les garde en entier).`);

// Récupération de compte et code de secours (COMPLETE-003 ; modèle de menaces : supabase/COMPTES.md).
const RECOVERY_NOT_INSTALLED = 'Le code de secours n’est pas encore installé sur le serveur (étape SQL 21 de supabase/COMPTES.md) : rien n’a été créé.';
const RECOVERY_FN_MISSING = 'La récupération de compte n’est pas encore installée sur le serveur (fonction « account-recovery » à déployer, voir supabase/COMPTES.md).';
const RECOVERY_DENIED = 'Le serveur a refusé la demande de récupération (réglage de la fonction « account-recovery » à vérifier : voir supabase/COMPTES.md).';
const BAD_RECOVERY_CODE = 'Le code de secours fait 16 signes (chiffres et lettres), notés par groupes de 4 : XXXX-XXXX-XXXX-XXXX.';

export const accountEmail = (name) => String(name).trim().toLowerCase() + '@' + ACCOUNT_EMAIL_DOMAIN;

// Pseudo et mot de passe : js/accountRules.js (pur, partagé avec la fonction serveur account-recovery) ; réexportés ici pour les écrans et les tests.
export { checkPseudo, checkPassword };

class Account {
  constructor() {
    this.state = null;            // { uid, username, session } quand un compte est connecté
    this.status = 'idle';         // idle | syncing | ok | offline | error
    this.lastSync = 0;
    this.lastError = '';
    this.note = '';               // information (pas une erreur) sur la dernière synchronisation : copie locale allégée faute de place (TECH-007)
    this._onNotice = null;        // (message) => … : l'application le montre au joueur (espace de l'appareil, reprise de la progression…) ; avant qu'elle soit prête, c'est gardé
    this._pending = [];
    this.convertAnonymous = CONFIG.accounts.convertAnonymous;      // 'auto' | false (js/config.js)
    this._lastNotice = '';
    this._storageFull = false;
    this._timer = null;
    this._running = null;
    this._dirty = false;
    this._gen = 0;
    this._wired = false;
  }

  get onNotice() { return this._onNotice; }
  set onNotice(fn) { this._onNotice = fn; if (fn) for (const m of this._pending.splice(0)) this._say(m); }
  _say(msg) { if (!this._onNotice) { this._pending.push(msg); return; } try { this._onNotice(msg); } catch { /* l'affichage ne casse rien */ } }

  get isAccount() { return !!this.state; }
  get username() { return this.state ? this.state.username : ''; }
  get uid() { return this.state ? this.state.uid : ''; }

  // ---- Démarrage ---------------------------------------------------------------------------
  // Un compte déjà connecté sur cet appareil est repris sans rien redemander. { kind: 'account' | 'expired' | 'none' }
  async restore() {
    const st = getGlobal('account', null);
    if (!st || !st.uid || !st.username || !st.session || !st.session.refresh_token) return { kind: 'none' };
    this._adopt(st);
    try {
      // Réseau lent ou absent : on n'attend pas plus de 6 s, le jeu démarre avec la sauvegarde locale du compte.
      await Promise.race([online.ensureSession(), new Promise((_, rej) => setTimeout(() => rej(new OnlineError('Délai dépassé.', 'offline')), 6000))]);
    } catch (e) {
      if (e.code === 'session-expired') { const name = st.username; this._forget(); return { kind: 'expired', username: name }; }
      // hors ligne : on joue avec la sauvegarde locale du compte, la synchronisation reprendra plus tard
    }
    setScope(st.uid);
    this._wire();
    return { kind: 'account', username: this.state.username };
  }

  _adopt(st) {
    this.state = st;
    online.useAccount(st.session);
    online.onAccountSession = (session) => { if (this.state) { this.state.session = session; setGlobal('account', this.state); } };
  }

  // Retour à l'invité (déconnexion, suppression, session expirée). D'abord la portée de l'invité : useGuest() y REPREND l'identité d'invité de cet appareil, jamais effacée
  // (TECH-025). Un compte né d'une conversion EST l'ancien invité : sa session d'invité a été retirée à la conversion, l'invité qui revient est donc neuf (rien d'orphelin).
  _forget() {
    this.state = null;
    setGlobal('account', null);
    online.onAccountSession = null;
    setScope('');
    online.useGuest();
  }

  // ---- Invité ------------------------------------------------------------------------------
  // Pseudo temporaire : valable pour cette session du navigateur ; la progression reste locale (portée « invité »).
  startGuest(rawName) {
    const c = checkPseudo(rawName);
    if (!c.ok) throw new OnlineError(c.error, 'invalid');
    setScope('');
    const s = loadSettings();
    s.playerName = c.name;
    saveSettings(s);
    setSessionFlag('guest', '1');
    return { kind: 'guest', username: c.name };
  }

  // Invité de cette session ? (pseudo valide mémorisé + marqueur de session)
  resumeGuest() {
    if (getSessionFlag('guest') !== '1') return null;
    const c = checkPseudo(loadSettings().playerName);
    return c.ok ? { kind: 'guest', username: c.name } : null;
  }

  lastGuestName() { const c = checkPseudo(loadSettings().playerName); return c.ok ? c.name : ''; }
  lastAccountName() { return getGlobal('lastAccount', ''); }
  // Y a-t-il quelque chose à reprendre ? (un profil vierge, créé au premier lancement, ne compte pas)
  hasGuestProgress() {
    const d = pickSynced(dumpAll());
    if (Object.keys(d).some((k) => k.startsWith('rec3.') || k.startsWith('ghostImp.'))) return true;
    try { if (JSON.parse(d.tracks || '[]').length) return true; } catch { /* abîmé : ignoré */ }
    try {
      const p = JSON.parse(d.profile || '{}');
      return !!((p.stats && p.stats.races) || p.coins || Object.keys(p.owned || {}).length || Object.keys(p.medals || {}).length);
    } catch { return false; }
  }
  leaveGuest() { setSessionFlag('guest', null); }

  // ---- Comptes -----------------------------------------------------------------------------
  async usernameAvailable(name) {
    try {
      return await online.rest('/rest/v1/rpc/username_available', { method: 'POST', auth: false, body: { n: name } }) === true;
    } catch (e) {
      if (e.code === 'offline') throw e;
      throw new OnlineError('Comptes non installés sur le serveur (étape 4 SQL).', 'no-schema');
    }
  }

  // Inscription. keepGuest : la progression de l'invité de cet appareil est DÉPLACÉE dans le compte (TECH-024) : copiée, vérifiée, et seulement ensuite effacée de l'invité ;
  // si elle ne tient pas, l'invité garde tout et le joueur le sait. Renvoie { kind, username, migration: 'none' | 'done' | 'failed' }.
  async signUp(rawName, password, { keepGuest = false } = {}) {
    const c = checkPseudo(rawName, { account: true });
    if (!c.ok) throw new OnlineError(c.error, 'invalid');
    const p = checkPassword(password, c.name);
    if (!p.ok) throw new OnlineError(p.error, 'invalid');
    // La progression de l'invité est lue AVANT de changer de portée.
    const guestData = keepGuest ? this._guestData() : null;
    const tutorialDone = !!loadSettings().tutorialDone;
    if (!(await this.usernameAvailable(c.name))) throw new OnlineError('Ce pseudo est déjà pris.', 'name-taken');
    // L'invité de cet appareil a une identité en ligne (session anonyme) : elle DEVIENT le compte si le serveur sait le faire (TECH-025). Sinon (projet sans la conversion,
    // ou réglage du déploiement), un nouvel utilisateur est créé, l'identité d'invité reste intacte sur l'appareil, et le joueur le sait.
    const guest = online.kind === 'guest' && online.session && online.session.user && online.session.user.id ? online.session.user.id : '';
    if (guest && this.convertAnonymous !== false && (await this._conversionReady())) return this._withRecoveryCode(await this._convert(c.name, password, guestData, tutorialDone), password);
    const d = await online.rest('/auth/v1/signup', { method: 'POST', auth: false, body: { email: accountEmail(c.name), password, data: { username: c.name } } });
    if (!d || !d.access_token) throw new OnlineError('Compte créé, mais le serveur exige une confirmation par e-mail (voir COMPTES.md).', 'server-config');
    this._begin(d, c.name);
    let migration = keepGuest ? 'done' : 'none';
    if (guestData) {
      try {
        this._copyTo(this.state.uid, guestData);                  // 1. copie vérifiée dans le compte (rien n'est écrit si tout ne tient pas)
        this._dropFrom('', Object.keys(guestData));               // 2. seulement alors, l'invité n'en garde pas de double
      } catch (e) {
        if (!(e && e.code === 'storage-full')) throw e;
        migration = 'failed';
        this._say(MIGRATION_FAILED);
      }
    }
    if (guest) this._say(GUEST_KEPT);
    this._finishSignUp(c.name, tutorialDone);
    try { await online.ensurePlayer(c.name); await this.sync(); } catch { /* le compte existe ; la synchronisation reprendra */ }
    return this._withRecoveryCode({ kind: 'account', username: c.name, migration, guestIdentity: guest ? 'kept' : 'none' }, password);
  }

  _finishSignUp(name, tutorialDone) {
    const s = loadSettings(); s.playerName = name; s.tutorialDone = tutorialDone; saveSettings(s);
    reloadProfile();
  }

  // Le serveur sait-il convertir un invité (sa base crée la ligne `accounts` quand un utilisateur anonyme reçoit une adresse : voir supabase/COMPTES.md) ? Sans la fonction
  // account_conversion_ready (projet d'avant), la réponse est non : rien n'est tenté.
  async _conversionReady() {
    try { return (await online.rest('/rest/v1/rpc/account_conversion_ready', { method: 'POST', auth: false, body: {} })) === true; }
    catch (e) { if (e.code === 'offline') throw e; return false; }
  }

  // CONVERSION de l'invité en compte : même utilisateur, même identifiant ; il reçoit l'adresse technique, le mot de passe et le pseudo (API d'Auth prévue pour cela :
  // PUT /auth/v1/user sur la session anonyme). Aucune étape destructive avant la réussite des précédentes :
  //   1. réglage du projet : « Confirm email » doit être désactivé (sinon l'adresse resterait en attente et le compte serait inutilisable) ;
  //   2. progression copiée et vérifiée dans la portée du compte (même identifiant), si demandé ; stockage plein : rien n'a changé, on le dit ;
  //   3. conversion ; 4. la base a-t-elle créé le compte ? Non : échec explicite, le joueur reste l'invité ;
  //   5. nouveau jeton (plus « anonyme ») ; 6. seulement alors : les jetons quittent la portée de l'invité, la copie de l'invité est effacée, le compte prend la main.
  async _convert(name, password, guestData, tutorialDone) {
    let set = null;
    try { set = await online.rest('/auth/v1/settings', { auth: false }); } catch (e) { if (e.code === 'offline') throw e; }
    if (set && set.mailer_autoconfirm === false) throw new OnlineError(CONFIRM_REQUIRED, 'server-config');
    await online.ensureSession();
    const uid = online.uid;
    if (guestData) {
      try { this._copyTo(uid, guestData); } catch (e) { if (e && e.code === 'storage-full') throw new OnlineError(STORAGE_FULL_KEEP, 'storage-full'); throw e; }
    }
    const undo = () => { if (guestData) this._dropFrom(uid, Object.keys(guestData)); };
    const email = accountEmail(name);
    let user, rows;
    try {
      user = await online.rest('/auth/v1/user', { method: 'PUT', body: { email, password, data: { username: name } } });
      if (!user || user.is_anonymous !== false || String(user.email || '').toLowerCase() !== email) throw new OnlineError(CONFIRM_REQUIRED, 'server-config');
      rows = await online.rest('/rest/v1/accounts?select=username&user_id=eq.' + encodeURIComponent(uid));
      if (!Array.isArray(rows) || !rows[0]) throw new OnlineError(CONVERSION_UNSUPPORTED, 'conversion-unsupported');
    } catch (e) { undo(); throw e; }
    let session = online.session;
    try { session = await online.refreshNow(); } catch { /* le jeton actuel reste valable jusqu'à son expiration */ }
    online.forgetGuestSession();                                  // l'identité de l'invité EST celle du compte : ses jetons ne restent pas chez l'invité
    if (guestData) this._dropFrom('', Object.keys(guestData));    // et sa progression n'y laisse pas de double
    const username = rows[0].username || name;
    this._begin(session, username);
    this._finishSignUp(username, tutorialDone);
    try { await online.ensurePlayer(username); await this.sync(); } catch { /* le compte existe ; la synchronisation reprendra */ }
    return { kind: 'account', username, migration: guestData ? 'done' : 'none', guestIdentity: 'converted' };
  }

  // La progression et les bibliothèques de l'invité (portée courante : celle de l'invité), sans ce qui reste à l'appareil (STAY_ON_DEVICE) ni les essais jetables.
  _guestData() {
    return Object.fromEntries(Object.entries(dumpAll()).filter(([k, v]) => typeof v === 'string' && !STAY_ON_DEVICE.has(k) && !isTrialName(k)));
  }
  // Copie VÉRIFIÉE de `data` dans la portée `uid` : atomique (storage.restoreAllOrThrow : rien n'est écrit si tout ne tient pas), puis relue clé par clé. Lève StorageFullError
  // (code « storage-full ») ; la portée courante est rendue telle qu'elle était.
  _copyTo(uid, data) {
    const back = getScope();
    setScope(uid);
    try {
      restoreAllOrThrow(data, true);
      if (Object.keys(data).some((k) => getRaw(k) !== data[k])) { removeKeys(Object.keys(data)); throw new StorageFullError(); }
    } finally { setScope(back); }
  }
  _dropFrom(scopeId, keys) {
    const back = getScope();
    setScope(scopeId);
    try { removeKeys(keys); } finally { setScope(back); }
  }

  // ---- Mot de passe et code de secours (COMPLETE-003) -----------------------------------------------------------------------------------------------------
  // Preuve de mot de passe : une connexion NEUVE par mot de passe (le serveur d'authentification juge ; rien n'est comparé ici). Son jeton porte la date de cette
  // connexion, que la base exige récente (recovery_code_new : une session volée ne suffit pas à prendre le compte). Cette session de preuve n'est jamais adoptée.
  async _prove(password, wrongMessage) {
    if (!this.state) throw new OnlineError('Connecte-toi à un compte d’abord.', 'invalid');
    if (!password) throw new OnlineError('Entre ton mot de passe.', 'invalid');
    try { return await online.rest('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: accountEmail(this.state.username), password } }); }
    catch (e) { if (e && e.code === 'bad-credentials') throw new OnlineError(wrongMessage, 'bad-credentials'); throw e; }
  }
  async _closeProof(proof) {
    try { await online.rest('/auth/v1/logout?scope=local', { method: 'POST', auth: false, headers: { Authorization: 'Bearer ' + proof.access_token }, body: {} }); } catch { /* la session de preuve expire seule */ }
  }

  // Changer son mot de passe : le mot de passe ACTUEL est redemandé (re-authentification) ; le nouveau suit les règles de l'inscription. Les autres appareils sont déconnectés
  // (leurs jetons de renouvellement tombent : ils redemandent le nouveau mot de passe) ; l'appareil courant reste connecté.
  async changePassword(current, next) {
    if (!this.state) throw new OnlineError('Connecte-toi à un compte d’abord.', 'invalid');
    const p = checkPassword(next, this.state.username);
    if (!p.ok) throw new OnlineError(p.error, 'invalid');
    if (next === current) throw new OnlineError('Le nouveau mot de passe doit être différent de l’actuel.', 'invalid');
    const proof = await this._prove(current, 'Mot de passe actuel incorrect.');
    try {
      await online.rest('/auth/v1/user', { method: 'PUT', body: { password: next } });
      try { await online.rest('/auth/v1/logout?scope=others', { method: 'POST', body: {} }); } catch { /* le mot de passe est changé ; les autres sessions expireront */ }
    } finally { await this._closeProof(proof); }
    return { ok: true };
  }

  // Le compte a-t-il un code de secours valable ? { state: 'active' | 'none' | 'unavailable', createdAt, usedAt } ('unavailable' : étape SQL 21 absente, hors ligne, invité : rien à proposer).
  async recoveryStatus() {
    if (!this.state) return { state: 'unavailable' };
    try {
      const r = await online.rest('/rest/v1/rpc/recovery_status', { method: 'POST', body: {} });
      if (!r || r.account !== true) return { state: 'unavailable' };
      return r.has_code ? { state: 'active', createdAt: r.created_at || null, usedAt: r.used_at || null } : { state: 'none', usedAt: r.used_at || null };
    } catch { return { state: 'unavailable' }; }
  }

  // Crée (ou REMPLACE : l'ancien code ne vaut plus rien) le code de secours, après confirmation du mot de passe. Renvoie « XXXX-XXXX-XXXX-XXXX », à montrer UNE fois : il n'est écrit nulle
  // part (ni stockage de l'appareil, ni journal), la base n'en garde qu'un haché.
  async createRecoveryCode(password) {
    const proof = await this._prove(password, 'Mot de passe incorrect.');
    try {
      const code = await online.rest('/rest/v1/rpc/recovery_code_new', { method: 'POST', auth: false, headers: { Authorization: 'Bearer ' + proof.access_token }, body: {} });
      const n = typeof code === 'string' ? normalizeRecoveryCode(code) : { ok: false };
      if (!n.ok) throw new OnlineError('Réponse inattendue du serveur : aucun code créé.', 'http');
      return formatRecoveryCode(n.code);
    } catch (e) {
      if (e && e.code === 'no-sql-step') throw new OnlineError(RECOVERY_NOT_INSTALLED, 'no-sql-step');
      throw e;
    } finally { await this._closeProof(proof); }
  }

  // À l'inscription : le code accompagne le compte. Jamais bloquant : sans l'étape SQL 21 ou sur une panne, le compte existe quand même (recoveryCode: null) et l'écran du compte le propose.
  async _withRecoveryCode(result, password) {
    try { result.recoveryCode = await this.createRecoveryCode(password); } catch { result.recoveryCode = null; }
    return result;
  }

  // « J'ai perdu mon mot de passe » : pseudo + code de secours + nouveau mot de passe, SANS session (la fonction serveur « account-recovery » : modèle de menaces dans supabase/COMPTES.md).
  // Réussi : on se connecte tout de suite avec le nouveau mot de passe, et un nouveau code est créé (l'ancien vient d'être consommé : usage unique).
  async recoverAccount(rawName, rawCode, newPassword) {
    const c = checkPseudo(rawName, { account: true });
    if (!c.ok) throw new OnlineError(c.error, 'invalid');
    const code = normalizeRecoveryCode(rawCode);
    if (!code.ok) throw new OnlineError(BAD_RECOVERY_CODE, 'invalid');
    const p = checkPassword(newPassword, c.name);
    if (!p.ok) throw new OnlineError(p.error, 'invalid');
    try {
      await online.rest('/functions/v1/account-recovery', { method: 'POST', auth: false, headers: { Authorization: 'Bearer ' + CONFIG.supabase.key }, body: { username: c.name, code: code.code, password: newPassword } });
    } catch (e) {
      if (e && e.code === 'no-function') throw new OnlineError(RECOVERY_FN_MISSING, 'no-function');
      if (e && e.code === 'denied') throw new OnlineError(RECOVERY_DENIED, 'denied');
      throw e;
    }
    let r;
    try { r = await this.signIn(c.name, newPassword); }
    catch (e) { throw new OnlineError('Mot de passe changé, mais la connexion a échoué : connecte-toi avec ton nouveau mot de passe.', e && e.code ? e.code : 'http'); }
    return this._withRecoveryCode({ ...r, recovered: true }, newPassword);
  }

  async signIn(rawName, password) {
    const c = checkPseudo(rawName, { account: true });
    if (!c.ok || !password) throw new OnlineError('Pseudo ou mot de passe incorrect.', 'bad-credentials');
    const d = await online.rest('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: accountEmail(c.name), password } });
    this._begin(d, c.name);
    // Casse exacte du pseudo, telle qu'enregistrée.
    try {
      const rows = await online.rest('/rest/v1/accounts?select=username&user_id=eq.' + encodeURIComponent(this.state.uid));
      if (rows && rows[0] && rows[0].username) { this.state.username = rows[0].username; setGlobal('account', this.state); online.player = { id: this.state.uid, name: this.state.username }; }
    } catch { /* le pseudo saisi fait foi */ }
    const s = loadSettings(); s.playerName = this.state.username; saveSettings(s);
    reloadProfile();
    online.ensurePlayer(this.state.username).catch(() => {});      // profil en ligne (classements, circuits) : sans bloquer
    try { await this.sync(); } catch (e) { if (e.code === 'session-expired') throw e; /* hors ligne : reprise plus tard */ }
    return { kind: 'account', username: this.state.username };
  }

  _begin(d, name) {
    const session = online._norm(d);
    this._adopt({ uid: session.user.id, username: name, session });
    setGlobal('account', this.state);
    setGlobal('lastAccount', name);
    setScope(this.state.uid);
    setSessionFlag('guest', null);
    this._wire();
  }

  // Déconnexion : dernière synchronisation, puis retour à l'invité (la page doit être rechargée ensuite).
  async signOut() {
    if (!this.state) return;
    try { await this.sync(); } catch { /* hors ligne : les données restent dans la portée locale du compte */ }
    this._forget();
    setSessionFlag('guest', null);
  }

  // Suppression définitive du compte et de ses données cloud ; les données locales du compte sont effacées aussi.
  async deleteAccount() {
    if (!this.state) return;
    await online.rest('/rest/v1/rpc/delete_account', { method: 'POST', body: {} });
    restoreAll({}, false);      // efface la portée locale du compte
    this._forget();
    setSessionFlag('guest', null);
  }

  // ---- Synchronisation ----------------------------------------------------------------------
  _wire() {
    if (this._wired) return;
    this._wired = true;
    onWrite((key) => { if (this.state && isSyncKey(key)) this.scheduleSync(); });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { if (this._dirty) this.sync().catch(() => {}); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && this._dirty) this.sync().catch(() => {}); });
    }
  }

  scheduleSync(delay = 4000) {
    if (!this.state) return;
    this._dirty = true;
    this._gen++;                 // génération des écritures : une synchronisation sait si quelque chose a été écrit PENDANT qu'elle tournait (TECH-023)
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this.sync().catch(() => {}); }, delay);
  }

  // Lit le cloud, fusionne avec le local, écrit le résultat (avec contrôle de version : jamais d'écrasement aveugle).
  sync() {
    if (!this.state) return Promise.resolve('guest');
    if (this._running) return this._running;
    clearTimeout(this._timer);
    this.status = 'syncing';
    // Une écriture faite PENDANT la synchronisation (après sa lecture du stockage local) n'en fait pas partie : avant (TECH-023), sa minuterie rappelait sync(), qui renvoyait la
    // promesse en cours, puis _dirty repassait à faux : la modification n'atteignait le cloud qu'à la prochaine écriture. Si la génération a bougé, on relance tout de suite, une fois.
    const gen = this._gen;
    this._running = this._doSync()
      .then((r) => { this.status = 'ok'; this.lastSync = Date.now(); this.lastError = ''; if (this._gen === gen) this._dirty = false; return r; })
      .catch((e) => { this.status = e.code === 'offline' ? 'offline' : 'error'; this.lastError = e.message; throw e; })
      .finally(() => {
        this._running = null; this._notify();
        if (this.state && this._gen !== gen && this.status === 'ok') { clearTimeout(this._timer); this.sync().catch(() => {}); }
      });
    return this._running;
  }

  // Ce qui touche à l'ESPACE de l'appareil se dit au joueur, une fois par message (le bloc « compte » du profil l'affiche en permanence).
  _notify() {
    const msg = this.status === 'error' && this._storageFull ? this.lastError : this.status === 'ok' ? this.note : '';
    if (!msg) { this._lastNotice = ''; return; }
    if (msg === this._lastNotice) return;
    this._lastNotice = msg;
    if (this._onNotice) { try { this._onNotice(msg); } catch { /* l'affichage ne doit jamais casser la synchronisation */ } }
  }

  async _doSync() {
    const uid = this.state.uid;
    this._storageFull = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const rows = await online.rest(`/rest/v1/cloud_saves?select=data,rev&user_id=eq.${encodeURIComponent(uid)}`);
      const row = rows && rows[0];
      const local = toCloud(dumpAll());
      const merged = row ? mergeSaves(local, row.data) : local;
      // Le résultat fusionné devient aussi la version locale (sans déclencher de nouvelle synchronisation). Si l'appareil n'a pas la place (TECH-007), on écrit une version ALLÉGÉE
      // (storage.restoreFitting : sans fantômes, puis sans commandes…) ; si même cela ne tient pas, rien n'est écrit, la synchronisation finit en ERREUR visible, jamais en « à jour ».
      let fit = null;
      if (!sameData(merged, local)) {
        // Ce que la fusion a ÉCARTÉ doit aussi quitter cet appareil : les records d'avant un « Effacer les records » fait ailleurs. Avant 0.9.59 ils restaient sur le
        // disque (restoreAll ajoute et remplace, ne retire rien) : effacés sur un appareil, toujours affichés sur l'autre, pour toujours. (Avant l'écriture : cela libère de la place.)
        const dropped = Object.keys(local).filter((k) => !(k in merged));
        if (dropped.length) removeKeys(dropped);
        fit = restoreFitting(fromCloud(merged));
        if (fit.ok) reloadProfile();
      }
      const finish = (result) => {
        this.note = '';
        if (fit && !fit.ok) {
          this._storageFull = true; this._dirty = false;      // (rien à relancer tout seul : la place ne reviendra pas d'elle-même ; « Synchroniser maintenant » ou une nouvelle écriture réessaie)
          throw new OnlineError(FIT_FAILED, 'storage-full');
        }
        if (fit && fit.level !== 'full') this.note = fitNote(fit);
        return result;
      };
      // Ce qui PARTIRAIT (la fusion, allégée si elle dépasse la limite) se compare à la copie du cloud : avant (TECH-074), on comparait la fusion complète, qui garde les fantômes locaux,
      // à une copie du cloud qui n'en a plus : jamais égales, donc ≈ 6 Mo renvoyés et `rev` incrémenté à CHAQUE synchronisation (et des conflits avec les autres appareils).
      const data = fitCloud(merged, MAX_CLOUD_BYTES);
      if (row && sameData(data, row.data)) return finish('à jour');
      if (!row) {
        try {
          await online.rest('/rest/v1/cloud_saves', { method: 'POST', body: { user_id: uid, data }, headers: { Prefer: 'return=minimal' } });
          return finish('envoyé');
        } catch (e) { if (e.code === 'duplicate' || /23505|duplicate/i.test(e.message)) continue; throw e; }
      }
      const done = await online.rest(`/rest/v1/cloud_saves?user_id=eq.${encodeURIComponent(uid)}&rev=eq.${row.rev}`, {
        method: 'PATCH', body: { data }, headers: { Prefer: 'return=representation' },
      });
      if (Array.isArray(done) && done.length) return finish('envoyé');
      // Un autre appareil a écrit entre-temps : on relit et on refusionne.
    }
    throw new OnlineError('Synchronisation interrompue (conflit répété) : réessaie dans un instant.', 'conflict');
  }
}

export const account = new Account();
