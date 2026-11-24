// Salon multijoueur : code à 6 caractères, liste des joueurs, choix du circuit, départ commun, résultats.
//
// Rôles réseau (voir aussi signaling.js et transport.js) :
//   Supabase Realtime : annuaire des joueurs (présence) et échange des offres WebRTC, rien d'autre ;
//   WebRTC (canal « ctl », fiable)  : prêt, circuit choisi, départ, arrivée, ping ;
//   WebRTC (canal « state », rapide): la position de chaque voiture, 20 fois par seconde.
// Le salon n'a ni serveur de jeu ni hôte autoritaire : l'« hôte » (le créateur, ou à défaut l'identifiant le plus petit)
// ne fait que choisir le circuit et donner le départ. Chacun pilote sa voiture et en est seul juge.
//
// Deux modes, au choix de l'hôte :
//   LIBRE      : chacun court à son rythme sur le même circuit, recommence quand il veut (R) ; le tableau garde le meilleur temps de chacun ;
//   CHAMPIONNAT (« manche ») : plusieurs circuits à la suite (championship.js), départ commun sur une grille, points par place, classement général.
//     L'hôte ne fait que donner les départs et clore chaque manche ; son rôle passe à l'identifiant le plus petit s'il part (l'état du championnat est
//     copié chez tous les joueurs). Messages fiables : cup (le championnat) · round (départ de la manche n) · finish{rn} (mon temps) · rend (manche close,
//     temps de tous) · cupstop (l'hôte arrête). Une manche se clôt quand tous ont fini ou quitté, FINISH_GRACE_MS après la première arrivée, ou au plafond.
// Époque de lancement (NET_VER 5, TRANS-05) : chaque lancement de l'hôte (course libre, championnat, « Course ») a un numéro e, croissant dans la salle ;
//     start, track, live, cup, round, rend, cupstop et finish le portent, et un message d'une autre époque est ignoré. Le choix d'un circuit (track) ne lance
//     JAMAIS : seul start (ou cup / round) lance. « Course en cours » n'est plus un état mémorisé : l'hôte annonce sa course libre réellement en cours (live),
//     un arrivant qui ne l'a jamais courue la rejoint, un joueur revenu au salon n'y est pas renvoyé (voir supabase/MULTI.md, « Époque de lancement »).
// Reconnexion (E16, NET_VER 4 ; voir resume.js) : hello (à l'ouverture d'une liaison) · bye (départ volontaire) · hostover (un nouvel hôte se marque).
//     Une coupure n'est pas un départ : la place est gardée RESUME_MS (« away »), le joueur coupé retente de rejoindre la salle avec le même identifiant.
//     Les liaisons WebRTC ne dépendent pas de la signalisation (TECH-046) : quand seule la signalisation tombe, on continue de jouer ; une place n'est gardée
//     que quand la LIAISON tombe aussi (canal fermé, ou silence malgré les pings : _checkLinks). Arrivées non reçues : renvoyées à la réouverture.
import { Emitter, SupabaseSignaling, LocalSignaling } from './signaling.js';
import { PeerMesh } from './transport.js';
import { packSnapshot, unpackSnapshot } from './snapshot.js';
import { Championship, MAX_ROUNDS } from './championship.js';
import { PHYS_VER, NET_VER } from '../version.js';
import { sanitizeRules, isDefaultRules } from '../rules.js';
import { MAX_RUN_STEPS, MAX_TRACK_CODE_CHARS } from '../constants.js';
import { RESUME_MS, RETRY_MS, newToken } from './resume.js';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // sans 0 / O / 1 / I : pas de confusion à la dictée
export const MAX_PLAYERS = 8;
const START_DELAY_MS = 4000;                                // entre « Lancer » et « GO »
const CODE_CHUNK = 12000;                                          // un message fiable ne dépasse pas ~12 Ko (compatibilité entre navigateurs)
const MAX_PACKETS_PER_SEC = 80;                                    // au-delà, un joueur inonde : on ignore l'excédent
export const FINISH_GRACE_MS = 30000;                              // championnat : temps laissé aux autres après la première arrivée
export const MAX_ROUND_MS = 600000;                                // championnat : une manche ne dure jamais plus de 10 minutes
export const RESULTS_MS = 12000;                                   // championnat : affichage des résultats avant la manche suivante
// Une liaison « ouverte » dont on n'entend plus rien (ni pong, ni paquet) depuis LINK_SILENCE_MS, après 3 pings sans réponse, est en panne (TECH-046). Un trou
// plus court (réseau qui saute quelques secondes) est rattrapé par la liaison elle-même : les messages fiables sont retransmis.
export const LINK_SILENCE_MS = 10000;
const OUTBOX_MAX = 16;                                             // messages fiables gardés par joueur, à renvoyer quand sa liaison se rouvre

export const ROOM_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const LATE_START_MS = 1500;                                        // rejoindre une course libre déjà lancée : départ dans 1,5 s, à son rythme
// Avancement d'une manche : (n, en course < résultats) ; sans état : -1.
const phaseRank = (st) => (st ? st.n * 2 + (st.phase === 'racing' ? 0 : 1) : -1);
const trackOf = (id, name, sig) => ({ id: String(id).slice(0, 60), name: String(name || '').slice(0, 40), sig: String(sig || '').slice(0, 40) });
export const MODES = ['race', 'cup', 'free'];
export function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function newRoomCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const r = random(6);
  return Array.from(r, (b) => ROOM_CHARS[b % ROOM_CHARS.length]).join('');
}
const newPeerId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// Apparence de la voiture annoncée aux autres joueurs (0.13.1) : quelques identifiants et couleurs du garage, jamais plus. Ce qui vient d'un autre
// joueur est filtré ici (16 clés au plus, valeurs courtes) puis validé contre le catalogue au moment de construire sa voiture (sanitizeLoadout).
export function cleanCarMeta(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const out = {};
  for (const [k, v] of Object.entries(c).slice(0, 16)) if (/^[a-zA-Z0-9]{1,16}$/.test(k) && typeof v === 'string' && v.length <= 24) out[k] = v;
  return Object.keys(out).length ? out : null;
}

export class RoomError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export class Room extends Emitter {
  constructor({ code, name, car = null, selfId = newPeerId(), token = newToken(), makeSignaling, makeMesh = null, getIce = null, now = () => performance.now(), schedule = (fn, ms) => setTimeout(fn, ms) }) {
    super();
    this.code = code; this.selfId = selfId; this.now = now; this.token = token; this.schedule = schedule;
    this.reconnecting = false;          // signalisation perdue : on retente de rejoindre la salle (resume.js)
    this._pendingFinish = null;         // championnat : mon arrivée { e, rn, steps } de la manche en cours, renvoyée à l'hôte si une liaison se rouvre (TECH-084 : de CE championnat seulement)
    this.makeSignaling = makeSignaling; this.makeMesh = makeMesh; this.getIce = getIce;
    // car : apparence de ma voiture (garage), want : ce que je demande après une course ('rematch' : une revanche), annoncés par la présence.
    this.meta = { name: String(name).slice(0, 20), host: false, ready: false, racing: false, v: PHYS_VER, net: NET_VER, t: Date.now(), car: cleanCarMeta(car), want: null };
    this.members = new Map();           // id → { id, name, host, ready, racing, v, t, link, rtt, car, want }
    this.track = null;                  // circuit choisi : { id, name, sig } ; id = 'b-…' (intégré), 'c:<uuid>' (communauté), 'u:<signature>' (code envoyé par l'hôte)
    this.rules = null;                  // règles de la partie choisies par l'hôte (rules.js) ; null : aucune
    // Époque (TRANS-05) : epoch = le lancement que je suis (adopté des messages de l'hôte) ; _seenEpoch = le plus grand numéro vu (un nouvel hôte numérote
    // au-delà) ; launch = { e, kind: 'free' | 'cup', track } ; hostLive = la course libre que l'hôte court en ce moment ({ e, track }) ou null.
    this.epoch = 0; this._seenEpoch = 0; this.launch = null; this.hostLive = null;
    this.trackCodes = new Map();        // id 'u:…' → code du circuit reçu de l'hôte
    this._asm = new Map();              // assemblage des morceaux de code en cours
    this.state = 'lobby';               // lobby | racing (propre à chaque joueur : la boucle de jeu est asynchrone)
    this.results = new Map();           // id → { best, last, n } : meilleur temps, dernier temps, nombre d'essais (en pas de 1/120 s)
    this.seq = 0;
    this.buffers = new Map();           // id → SnapshotBuffer (rempli par setBufferFactory : la voiture distante)
    this.bufferFactory = null;
    this._rate = new Map();
    this.cup = null;                    // championnat en cours ou terminé (Championship) ; null en mode libre
    this.cupState = null;               // manche en cours : { phase: 'racing' | 'results' | 'done', n, roster, finishes, t0, firstAt, until }
    this.closed = false;
    this._refused = new Set();          // arrivants refusés faute de place (places gardées comprises : TECH-086), admis dès qu'une place se libère
  }

  // ---- Ouverture -----------------------------------------------------------------------------------------------------
  static async create(opts) {
    for (let i = 0; i < 4; i++) {
      const room = new Room({ ...opts, code: opts.code || newRoomCode() });
      room.meta.host = true;
      try { await room._open(); }
      catch (e) { room._dispose(); if (e.code === 'taken' && !opts.code) continue; throw e; }
      return room;
    }
    throw new RoomError('Impossible de créer une salle : réessaie.', 'taken');
  }

  static async join(code, opts) {
    const c = normalizeCode(code);
    if (!ROOM_RE.test(c)) throw new RoomError('Code invalide : 6 caractères (lettres et chiffres, sans 0, O, 1, I).', 'bad-code');
    const room = new Room({ ...opts, code: c });
    try { await room._open(); } catch (e) { room._dispose(); throw e; }
    return room;
  }

  async _open() {
    const sig = this.signaling = this.makeSignaling({ code: this.code, selfId: this.selfId });
    // Serveurs ICE (STUN + relais TURN à identifiants à durée limitée) : demandés tout de suite (sans bloquer l'ouverture), puis redemandés par le maillage à
    // chaque connexion neuve et à chaque relance (TECH-050) ; le chargeur (ice.js) ne refait la requête que lorsque leur durée est presque écoulée.
    if (this.getIce) { try { Promise.resolve(this.getIce()).catch(() => {}); } catch { /* repli : STUN de config.js */ } }
    this.mesh = (this.makeMesh || ((o) => new PeerMesh(o)))({
      selfId: this.selfId, signaling: sig, ...(this.getIce ? { getIce: this.getIce } : {}),
      isMember: (id) => this._accepts(id),
      handlers: { onMessage: (id, kind, data) => this._onMessage(id, kind, data), onLink: (id, st) => this._onLink(id, st) },
    });
    this._wire(sig);
    try { await sig.join(this.meta); }
    catch (e) { throw new RoomError(e.message || 'Connexion au serveur de salons impossible.', 'network'); }

    // Un invité qui arrive laisse un court instant à la liste des présents pour se remplir (réseau lent).
    if (!this.meta.host) for (let i = 0; i < 15 && ![...sig.peers.values()].some((m) => m.host); i++) await new Promise((r) => setTimeout(r, 100));
    const present = [...sig.peers.entries()];
    const host = present.find(([, m]) => m.host);
    if (this.meta.host) {
      if (host) throw new RoomError('Ce code est déjà utilisé.', 'taken');
    } else {
      if (!host) throw new RoomError('Salle introuvable. Vérifie le code.', 'not-found');
      if (present.length + 1 > MAX_PLAYERS) throw new RoomError(`Salle pleine (${MAX_PLAYERS} joueurs).`, 'full');
      if (host[1].v !== PHYS_VER || host[1].net !== NET_VER) throw new RoomError('Version du jeu différente de celle de l\'hôte : recharge la page.', 'version');
    }
    for (const [id, meta] of present) this._onPeer(id, meta);
    this._pingTimer = setInterval(() => { this._sweepLinks(); this._checkLinks(); this._pingAll(); this._expireAway(); }, 2000);
    this._cupTimer = setInterval(() => this._cupTick(), 400);
    this.emit('members');
  }

  _wire(sig) {
    sig.on('join', (id, meta) => { if (sig === this.signaling) this._onPeer(id, meta); });
    sig.on('meta', (id, meta, info) => { if (sig === this.signaling) this._onPeer(id, meta, info); });
    sig.on('leave', (id) => { if (sig === this.signaling) this._onLeave(id); });
    sig.on('closed', (why) => { if (sig === this.signaling) this._lost(why); });
  }

  // ---- Reconnexion (E16) ---------------------------------------------------------------------------------------------
  // La signalisation est perdue (réseau coupé, canal fermé par le serveur, battements sans réponse) : la salle reste ouverte chez nous (la course continue)
  // et on retente de la rejoindre, avec le même identifiant, à délais croissants bornés (RETRY_MS, puis le dernier). TECH-046 : les liaisons WebRTC n'en
  // dépendent pas ; tant qu'il en reste une ouverte, on continue de jouer et de réessayer ; sans aucune, on abandonne au-delà de RESUME_MS.
  _lost(why) {
    if (this.closed || this.reconnecting) return;
    this.reconnecting = true;
    this._lostAt = this.now();
    this._lostWhy = why;
    this.emit('reconnecting');
    this.emit('members');
    this._retry(0);
  }

  _openCount() { let n = 0; for (const m of this.members.values()) if (m.link === 'open') n++; return n; }

  _retry(i) {
    this.schedule(async () => {
      if (this.closed) return;
      const sig = this.makeSignaling({ code: this.code, selfId: this.selfId });
      try {
        this.signaling = sig;
        this._wire(sig);
        if (this.mesh.setSignaling) this.mesh.setSignaling(sig);       // avant join : les offres WebRTC des retrouvailles passent par la nouvelle signalisation
        // Une liaison qui n'était pas ouverte a perdu sa négociation avec l'ancienne signalisation : elle sera refaite à neuf (après la jonction, par _onPeer).
        for (const m of this.members.values()) if (m.link !== 'open' && m.link !== 'away' && m.link !== 'incompatible') { this.mesh.removePeer(m.id); m.link = 'connecting'; }
        await sig.join(this.meta);
      } catch {
        try { sig.leave(); } catch { /* déjà fermée */ }          // tentative ratée : fermée (TECH-044 ; la signalisation le fait aussi d'elle-même)
        if (this.closed) return;
        const next = RETRY_MS[Math.min(i + 1, RETRY_MS.length - 1)];
        if (this._openCount() || this.now() - this._lostAt + next < RESUME_MS) { this._retry(i + 1); return; }
        this.emit('error', new RoomError(this._lostWhy || 'Connexion perdue.', 'closed'));
        this._dispose(); this.emit('closed');
        return;
      }
      if (this.closed || this.signaling !== sig) { try { sig.leave(); } catch { /* fermé */ } return; }
      // Un autre a pris la place d'hôte pendant l'absence (hostover) : on ne la reprend pas avec un état peut-être périmé.
      if (this.meta.host && [...sig.peers.values()].some((m) => m && m.host)) { this.meta.host = false; sig.track(this.meta); }
      this.reconnecting = false;
      for (const [id, meta] of sig.peers.entries()) this._onPeer(id, meta);
      // Ceux qu'on ne retrouve pas dans l'annuaire : on continue avec ceux dont la liaison est ouverte ; les autres sont absents depuis notre coupure.
      for (const m of [...this.members.values()]) {
        if (sig.peers.has(m.id)) continue;
        m.listed = false;
        if (m.link === 'open' || m.link === 'away' || m.link === 'incompatible') continue;
        if (m.everOpen) this._markAway(m.id, this._lostAt); else this._drop(m.id);
      }
      this.emit('reconnected');
      this.emit('members');
    }, RETRY_MS[Math.min(i, RETRY_MS.length - 1)]);
  }

  // Un joueur disparaît (annuaire ET liaison) sans dire au revoir : sa place est gardée RESUME_MS.
  _markAway(id, since = this.now()) {
    const m = this.members.get(id);
    if (!m) return;
    if (m.link !== 'away') m.awaySince = since;
    m.link = 'away';
    this.mesh.removePeer(id);
  }

  // Liaison refaite à neuf (connexion neuve et nouvelle négociation).
  _relink(id) {
    if (this.mesh.restartPeer) this.mesh.restartPeer(id);
    else { this.mesh.removePeer(id); this.mesh.addPeer(id); }
  }

  // Une liaison qui marchait est tombée (canal fermé, ou silence : _checkLinks). Le joueur est encore dans l'annuaire : on refait la liaison (l'autre côté
  // voit la sienne tomber et fait de même) ; sinon (ou si c'est nous qui sommes coupés), sa place est gardée RESUME_MS. Les messages fiables qu'il n'a
  // peut-être pas reçus (envoyés depuis la dernière fois qu'on l'a entendu) lui seront renvoyés à la réouverture.
  _linkDown(id) {
    const m = this.members.get(id);
    if (!m || m.link === 'away' || m.link === 'incompatible') return;
    for (const e of m.sentLog || []) if (e.at >= (m.heardAt || 0)) this._queue(m, e.msg);
    m.sentLog = [];
    if (m.listed !== false && !this.reconnecting) { m.link = 'connecting'; this._relink(id); }
    else { this._markAway(id); this.emit('away', id); }
    this.emit('members');
  }

  // Vraie panne d'une liaison « ouverte » : plus rien reçu depuis LINK_SILENCE_MS malgré 3 pings (un ping reçoit toujours sa réponse, même d'un onglet caché).
  _checkLinks() {
    const now = this.now();
    for (const m of [...this.members.values()]) if (m.link === 'open' && (m.unanswered || 0) >= 3 && now - (m.heardAt || 0) >= LINK_SILENCE_MS) this._linkDown(m.id);
  }

  _heard(id) { const m = this.members.get(id); if (m) { m.heardAt = this.now(); m.unanswered = 0; } }

  // ---- Messages fiables renvoyés après une coupure (TECH-046) ----------------------------------------------------------
  _queue(m, msg) { m.outbox = (m.outbox || []).concat([msg]).slice(-OUTBOX_MAX); }

  // Message fiable à tous ; ceux dont la liaison n'est pas ouverte le recevront à sa réouverture.
  _sendReliable(msg) {
    const r = this.mesh.sendCtl(msg);
    const sent = new Set(Array.isArray(r) ? r : [...this.members.values()].filter((m) => m.link === 'open').map((m) => m.id));
    const at = this.now();
    for (const m of this.members.values()) {
      if (m.link === 'incompatible') continue;
      if (sent.has(m.id)) m.sentLog = (m.sentLog || []).concat([{ at, msg }]).slice(-OUTBOX_MAX);
      else this._queue(m, msg);
    }
  }

  _flushOutbox(id) {
    const m = this.members.get(id);
    if (!m || !m.outbox || !m.outbox.length) return;
    const q = m.outbox, at = this.now(); m.outbox = [];
    for (const msg of q) { this.mesh.sendCtl(msg, id); m.sentLog = (m.sentLog || []).concat([{ at, msg }]).slice(-OUTBOX_MAX); }
  }

  // TECH-045 : la signalisation n'ouvre une liaison que pour un membre présent dans l'annuaire, d'une version compatible, dont la place n'est pas « absente ».
  _accepts(id) {
    const m = this.members.get(id);
    return !this.closed && !!m && m.link !== 'incompatible' && m.link !== 'away' && !!(this.signaling && this.signaling.peers && this.signaling.peers.has(id));
  }

  // Liaisons orphelines (aucun membre, ou membre incompatible ou absent) : fermées.
  _sweepLinks() {
    const links = this.mesh && this.mesh.links;
    if (!links || typeof links.keys !== 'function') return;
    for (const id of [...links.keys()]) { const m = this.members.get(id); if (!m || m.link === 'incompatible' || m.link === 'away') this.mesh.removePeer(id); }
  }

  _expireAway() {
    const now = this.now();
    if (this.reconnecting) return;                                   // c'est NOUS qui sommes coupés : on ne juge pas les autres
    for (const m of [...this.members.values()]) if (m.link === 'away' && now - m.awaySince >= RESUME_MS) this._drop(m.id);
  }

  // Départ définitif (au revoir, ou absence au-delà de RESUME_MS).
  _drop(id) {
    if (!this.members.has(id)) return;
    const wasHost = this.isHost, hostBefore = this.hostId;
    this.members.delete(id);
    this.mesh.removePeer(id);
    this.buffers.delete(id);
    this.emit('members');
    this.emit('left', id);
    if (!wasHost && this.isHost) this._becomeHost();
    // TECH-048 : un autre prend la place d'hôte (vu ici, quel que soit l'ordre de son « hostover ») : je lui donne mon état et mon arrivée en attente.
    else if (!this.isHost && this.cup && this.hostId !== hostBefore) { this._sendCupSync(this.hostId); this._resendFinish(this.hostId); }
    this._cupTick();                 // un joueur qui part ne doit pas bloquer la manche (ni, si c'était l'hôte, la rendre orpheline)
    this._readmit();
  }

  // Une place s'est libérée : les arrivants refusés encore présents dans l'annuaire sont admis, dans l'ordre d'arrivée.
  _readmit() {
    for (const id of [...this._refused]) {
      if (this.closed || this.members.size + 1 >= MAX_PLAYERS) return;
      this._refused.delete(id);
      const meta = this.signaling && this.signaling.peers && this.signaling.peers.get(id);
      if (meta) this._onPeer(id, meta);
    }
  }

  // Nouvel hôte (l'ancien est parti) : il se marque, pour que l'ancien, s'il revient, ne reprenne pas la main.
  _becomeHost() {
    if (this.meta.host || this.closed) return;
    this.meta.host = true;
    try { this.signaling.track(this.meta); } catch { /* fermé */ }
    this.mesh.sendCtl({ k: 'hostover' });
    this.emit('hostover');
  }

  _dispose() {
    this.closed = true;
    this._refused.clear();
    clearInterval(this._pingTimer); clearInterval(this._cupTimer);
    try { this.mesh && this.mesh.closeAll(); } catch { /* déjà fermé */ }
    try { this.signaling && this.signaling.leave(); } catch { /* déjà fermé */ }
  }

  leave() {
    if (this.closed) return;
    try { this.mesh.sendCtl({ k: 'bye' }); } catch { /* liaisons déjà fermées */ }       // départ volontaire : les autres ne gardent pas la place
    this._dispose();
    this.emit('closed');
  }

  // ---- Membres -------------------------------------------------------------------------------------------------------
  get trackId() { return this.track ? this.track.id : null; }

  get hostId() {
    const flagged = [...this.members.values()].filter((m) => m.host);
    if (this.meta.host) flagged.push({ id: this.selfId });
    if (flagged.length) return flagged.map((m) => m.id).sort()[0];
    return [this.selfId, ...this.members.keys()].sort()[0];        // l'hôte est parti : l'identifiant le plus petit prend la suite
  }
  get isHost() { return this.hostId === this.selfId; }
  get list() { return [{ id: this.selfId, ...this.meta, self: true, link: 'self', rtt: 0 }, ...this.members.values()]; }

  _onPeer(id, meta, info = null) {
    if (id === this.selfId || !meta) return;
    const prev = this.members.get(id);
    // TECH-086 : 8 joueurs au plus, places gardées (absents) comprises. L'arrivant ne voit que l'annuaire (pas les absents) : ce sont les membres qui le
    // refusent (aucune liaison, aucune place sur la grille) ; il est admis dès qu'une place se libère. Un absent qui revient retrouve toujours la sienne.
    if (!prev && this.members.size + 1 >= MAX_PLAYERS) { this._refused.add(id); return; }
    this._refused.delete(id);
    const back = prev && prev.link === 'away';                     // retour d'un joueur coupé : sa liaison est à refaire
    if (back) this.mesh.removePeer(id);
    const m = { id, name: String(meta.name || '?').slice(0, 20), host: !!meta.host, ready: !!meta.ready, car: cleanCarMeta(meta.car), want: meta.want === 'rematch' ? 'rematch' : null, mode: MODES.includes(meta.mode) ? meta.mode : null, racing: !!meta.racing, v: meta.v, net: meta.net, t: meta.t || 0, link: prev && !back ? prev.link : 'connecting', rtt: prev ? prev.rtt : 0, token: prev ? prev.token : null, everOpen: !!(prev && prev.everOpen),
      listed: true, heardAt: prev ? prev.heardAt : 0, unanswered: prev ? prev.unanswered : 0, outbox: prev ? prev.outbox : [], sentLog: prev ? prev.sentLog : [] };
    this.members.set(id, m);
    if (m.v === PHYS_VER && m.net === NET_VER && !this.closed) {        // un joueur d'une autre version ne peut pas courir avec nous
      if (m.link === 'incompatible') m.link = 'connecting';
      // Il a rouvert sa signalisation (nouvelle connexion) et notre liaison n'est pas ouverte : l'initiateur la refait (l'autre attend son offre).
      if (info && info.conn && !back && m.link !== 'open' && this.selfId < id) this._relink(id);
      else this.mesh.addPeer(id);
    } else m.link = 'incompatible';
    this.emit('members');
  }

  // Disparu de l'annuaire : coupure ou départ ; sans « bye », on garde sa place RESUME_MS. TECH-046 : si sa liaison est ouverte, c'est sa signalisation qui est
  // tombée, pas lui : on continue de jouer avec lui (sa place n'est gardée qu'une fois la liaison tombée aussi, voir _linkDown).
  _onLeave(id) {
    this._refused.delete(id);
    const m = this.members.get(id);
    if (!m) return;
    m.listed = false;
    if (m.link === 'open') { this.emit('members'); return; }
    if (!m.everOpen) { this._drop(id); return; }                   // jamais relié (salle prise, introuvable, autre version…) : rien à garder
    this._markAway(id);
    this.emit('members');
    this.emit('away', id);
  }

  _onLink(id, status) {
    const m = this.members.get(id);
    // Une liaison qui marchait se ferme (l'autre a fermé la sienne, ou elle est morte) : refaite, ou place gardée (TECH-046).
    if (m && status === 'closed' && m.link === 'open') { this._linkDown(id); return; }
    // Échec d'un joueur qui n'est plus dans l'annuaire : sa place est gardée (il revient : la liaison est refaite).
    if (m && status === 'failed' && m.listed === false && m.everOpen && m.link !== 'away') { this._markAway(id); this.emit('away', id); this.emit('members'); return; }
    if (m && !(m.link === 'away' && status !== 'open') && m.link !== 'incompatible') m.link = status;      // une liaison fermée d'un joueur coupé : il reste « en reconnexion »
    if (m && status === 'open') { m.everOpen = true; m.heardAt = this.now(); m.unanswered = 0; m.sentLog = []; }
    // L'hôte informe un nouvel arrivant du circuit choisi.
    if (status === 'open') {
      this.mesh.sendCtl({ k: 'hello', token: this.token, e: this._seenEpoch }, id);
      // Mon arrivée de la manche, annoncée pendant une coupure : renvoyée à l'hôte (il l'ignore s'il l'a déjà).
      if (id === this.hostId) this._resendFinish(id);
      if (this.isHost && this.rules) this.mesh.sendCtl({ k: 'rules', r: this.rules }, id);        // les règles d'abord : elles s'appliquent au circuit qui suit
      if (this.isHost && this.cup && !this.cup.finished) this._sendCup(id);       // en championnat, un arrivant reçoit le championnat, pas le circuit seul
      else if (this.isHost) {
        if (this.track) this._sendTrack(id);
        this._sendLive(id);                                                     // ma course libre réellement en cours (ou rien) : il en déduit s'il peut la rejoindre
      }
      this._flushOutbox(id);                                                    // mes messages fiables qu'il n'a pas reçus (arrivées pendant une coupure)
      const mine = this.results.get(this.selfId);
      if (mine && this.launch && this.launch.kind === 'free') this.mesh.sendCtl({ k: 'finish', e: this.epoch, t: this.launch.track.id, steps: mine.best, sync: true }, id);   // le nouvel arrivant voit mon meilleur temps
    }
    this.emit('members');
  }

  setReady(ready) { this.meta.ready = !!ready; this.signaling.track(this.meta); this.emit('members'); }
  // Mode choisi par l'hôte (0.13.1) : 'race' (course à départ commun), 'cup' (championnat), 'free' (course libre) ; annoncé pour l'affichage des invités.
  setMode(mode) { if (!this.isHost) return; this.meta.mode = MODES.includes(mode) ? mode : null; this.signaling.track(this.meta); this.emit('members'); }
  get hostMode() { const h = this.hostId === this.selfId ? this.meta : this.members.get(this.hostId); return h && MODES.includes(h.mode) ? h.mode : null; }
  // Après une course : « je veux une revanche » (null : rien). L'hôte voit les demandes et relance.
  setWant(want) { this.meta.want = want === 'rematch' ? 'rematch' : null; this.signaling.track(this.meta); this.emit('members'); }
  // Tous les joueurs reliés (moi compris) sont-ils prêts ? et combien le sont.
  readyCount() { const l = this.list.filter((m) => m.self || m.link === 'open'); return { ready: l.filter((m) => m.ready).length, total: l.length }; }
  wantCount(want = 'rematch') { const l = this.list.filter((m) => m.self || m.link === 'open'); return { n: l.filter((m) => m.want === want).length, total: l.length }; }

  // ---- Messages fiables ----------------------------------------------------------------------------------------------
  _onMessage(from, kind, data) {
    this._heard(from);
    if (kind === 'state') return this._onState(from, data);
    const m = this.members.get(from);
    switch (data.k) {
      case 'ping': this.mesh.sendCtl({ k: 'pong', id: data.id }, from); break;
      case 'hello': if (m && typeof data.token === 'string' && data.token.length <= 32) m.token = data.token; this._see(data.e); break;
      case 'bye': this._drop(from); break;
      case 'hostover':
        // Nouvel hôte (TECH-048) : il a peut-être manqué une clôture ou des arrivées ; chacun lui donne son état et sa propre arrivée en attente.
        if (this.cup && !this.isHost) { this._sendCupSync(from); this._resendFinish(from); }
        this.emit('members');
        break;
      case 'cupsync': this._onCupSync(from, data); break;
      case 'pong': {
        const rtt = this.now() - (this._pings && this._pings.get(from + ':' + data.id));
        if (m && Number.isFinite(rtt) && rtt >= 0) m.rtt = m.rtt ? Math.min(m.rtt * 0.7 + rtt * 0.3, rtt * 3) : rtt;
        break;
      }
      case 'track': {
        // Le circuit choisi par l'hôte, pour le salon. Il ne lance JAMAIS une course (TECH-008) : seul « start » le fait.
        if (from !== this.hostId || typeof data.id !== 'string') break;
        this._see(data.e);
        if ((data.e | 0) < this.epoch) break;                       // choix d'avant un lancement plus récent : périmé
        this.track = trackOf(data.id, data.name, data.sig);
        this.emit('track');
        break;
      }
      case 'live': this._onLive(from, data); break;
      case 'rules': if (from === this.hostId) { this.rules = isDefaultRules(data.r) ? null : sanitizeRules(data.r); this.emit('rules'); } break;
      case 'tcode': this._onCodeChunk(from, data); break;
      case 'start': {
        // Un nouveau « Lancer » de l'hôte (même circuit ou autre) remet chacun au départ de ce circuit, à son rythme. Une seule fois par lancement.
        if (from !== this.hostId || typeof data.trackId !== 'string') break;
        const e = data.e | 0;
        this._see(e);
        if (!(e > this.epoch)) break;                               // déjà vu (ou plus ancien) : on ne relance pas
        this.track = trackOf(data.trackId, data.name || (this.track && this.track.name), data.sig);
        this._begin(e, this.track, Math.max(500, Math.min(15000, +data.startIn || START_DELAY_MS)) - (m ? m.rtt / 2 : 0));
        break;
      }
      case 'cup': this._onCup(from, data); break;
      case 'round': this._onRound(from, data); break;
      case 'rend': if (from === this.hostId && this._sameEpoch(data)) this._onRoundEnd(data.n | 0, data.times && typeof data.times === 'object' ? data.times : {}, +data.nextIn || 0); break;
      case 'cupstop': if (from === this.hostId && this.cup && this._sameEpoch(data)) this._cupStopped(); break;
      case 'finish': {
        if (data.rn !== undefined) { if (this._sameEpoch(data)) this._onCupFinish(from, data); break; }
        if (this.cup && !this.cup.finished) break;                 // en championnat, seuls les temps de la manche comptent
        const steps = +data.steps | 0;
        if (!m || !(steps > 0 && steps <= MAX_RUN_STEPS)) break;
        // TECH-042 : un temps compte pour SON lancement (époque) et SON circuit. Plus ancien : ignoré (pas crédité au circuit suivant). Plus récent (un
        // arrivant qui reçoit les meilleurs temps avant d'apprendre le lancement en cours) : gardé de côté pour ce lancement.
        const e = data.e | 0, t = typeof data.t === 'string' ? data.t.slice(0, 60) : '';
        this._see(e);
        if (e === this.epoch && this.launch && this.launch.kind === 'free' && t === this.launch.track.id) { this._noteResult(this.results, from, steps, !!data.sync); this.emit('results'); }
        else if (e > this.epoch) this._noteFuture(e, t, from, steps, !!data.sync);
        break;
      }
      default: break;
    }
  }

  _pingAll() {
    this._pings = this._pings || new Map();
    const id = Math.random().toString(36).slice(2, 8);
    for (const m of this.members.values()) if (m.link === 'open') { this._pings.set(m.id + ':' + id, this.now()); m.unanswered = (m.unanswered || 0) + 1; }
    this.mesh.sendCtl({ k: 'ping', id });
    if (this._pings.size > 64) this._pings.clear();
  }

  // ---- Choix du circuit, départ, retour au salon (hôte) --------------------------------------------------------------
  // spec : { id, name, sig, code? } ; code : seulement pour les circuits 'u:…' (envoyé à chaque joueur par morceaux).
  selectTrack(spec) {
    if (!this.isHost || !spec || typeof spec.id !== 'string') return;
    if (spec.code && spec.code.length > MAX_TRACK_CODE_CHARS) throw new RoomError('Circuit trop gros pour être envoyé.', 'too-big');
    this.track = { id: spec.id, name: spec.name || '', sig: spec.sig || '' };
    if (spec.code) this.trackCodes.set(spec.id, spec.code);
    this._sendTrack();
    this.emit('track');
  }

  // Règles de la partie (hôte) : envoyées à tous, et à chaque arrivant avec le circuit.
  setRules(r) {
    if (!this.isHost) return;
    this.rules = isDefaultRules(r) ? null : sanitizeRules(r);
    this.mesh.sendCtl({ k: 'rules', r: this.rules || {} });
    this.emit('rules');
  }

  _sendTrack(to = null) {
    const t = this.track;
    this.mesh.sendCtl({ k: 'track', e: this.epoch, id: t.id, name: t.name, sig: t.sig }, to);
    const code = this.trackCodes.get(t.id);
    if (code && t.id.startsWith('u:')) {
      const n = Math.ceil(code.length / CODE_CHUNK);
      for (let i = 0; i < n; i++) this.mesh.sendCtl({ k: 'tcode', id: t.id, i, n, d: code.slice(i * CODE_CHUNK, (i + 1) * CODE_CHUNK) }, to);
    }
  }

  _onCodeChunk(from, d) {
    if (from !== this.hostId || typeof d.id !== 'string' || !d.id.startsWith('u:') || typeof d.d !== 'string') return;
    const n = d.n | 0, i = d.i | 0;
    if (n < 1 || n > Math.ceil(MAX_TRACK_CODE_CHARS / CODE_CHUNK) || i < 0 || i >= n || d.d.length > CODE_CHUNK) return;
    let a = this._asm.get(d.id);
    if (!a || a.n !== n) { a = { n, parts: new Array(n).fill(null), got: 0 }; this._asm.set(d.id, a); }
    if (a.parts[i] === null) { a.parts[i] = d.d; a.got++; }
    if (a.got === n) {
      this._asm.delete(d.id);
      this.trackCodes.set(d.id, a.parts.join(''));
      this.emit('trackcode', d.id);
    }
  }

  // Le code d'un circuit 'u:…' (attend qu'il soit arrivé, au plus ms millisecondes).
  waitForCode(id, ms = 12000) {
    if (this.trackCodes.has(id)) return Promise.resolve(this.trackCodes.get(id));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.off('trackcode', on); reject(new RoomError('Le circuit n\'est pas arrivé : réessaie.', 'no-code')); }, ms);
      const on = (got) => { if (got === id) { clearTimeout(t); this.off('trackcode', on); resolve(this.trackCodes.get(id)); } };
      this.on('trackcode', on);
    });
  }

  start() {
    if (!this.isHost || !this.track) return false;
    if (this.cup) this.stopCup();       // un départ libre met fin au championnat
    const e = this._newEpoch();
    this.mesh.sendCtl({ k: 'start', e, trackId: this.track.id, name: this.track.name, sig: this.track.sig, startIn: START_DELAY_MS });
    this._begin(e, this.track, START_DELAY_MS);
    return true;
  }

  // ---- Époque de lancement (TRANS-05) -----------------------------------------------------------------------------------
  _see(e) { e = +e; if (Number.isInteger(e) && e > this._seenEpoch && e < 2 ** 31) this._seenEpoch = e; }
  _newEpoch() { this._seenEpoch = Math.max(this._seenEpoch, this.epoch) + 1; return this._seenEpoch; }
  _sameEpoch(d) { return (d.e | 0) === this.epoch; }

  // Course libre : je pars sur le lancement e. Un lancement nouveau remet le tableau à zéro (les temps d'un autre circuit ne se comparent pas) ; rejoindre
  // le même (retour du salon) garde le tableau.
  _begin(e, track, inMs) {
    if (e !== this.epoch) {
      const f = this._future && this._future.get(e);
      this.results = f && f.t === track.id ? f.results : new Map();                     // les temps déjà reçus pour ce lancement (arrivant : TECH-042)
      for (const m of this.members.values()) { m.outbox = []; m.sentLog = []; }       // (les arrivées d'avant ne sont plus à renvoyer)
    }
    if (this._future) for (const k of [...this._future.keys()]) if (k <= e) this._future.delete(k);
    this.epoch = e; this._see(e);
    this._pendingFinish = null;
    this.launch = { e, kind: 'free', track };
    this.state = 'racing';
    this.meta.racing = true; this.meta.ready = false; this.meta.want = null; this.signaling.track(this.meta);
    this.emit('start', { trackId: track.id, track, startLocal: this.now() + inMs, e });
    if (this.isHost) this._sendLive();
  }

  // Ma course libre réellement en cours (hôte) : { e, track } tant que je la cours ; null au salon, en championnat, ou sans lancement libre.
  get freeLive() { return this.isHost && this.state === 'racing' && !this.cupActive && this.launch && this.launch.kind === 'free' ? { e: this.launch.e, track: this.launch.track } : null; }

  _sendLive(to = null) {
    if (!this.isHost) return;
    const l = this.freeLive;
    this.mesh.sendCtl(l ? { k: 'live', e: l.e, on: true, trackId: l.track.id, name: l.track.name, sig: l.track.sig } : { k: 'live', e: this.epoch, on: false }, to);
  }

  // L'hôte annonce sa course libre en cours (ou sa fin). Un joueur qui ne l'a jamais courue (arrivant, ou coupé pendant le départ) la rejoint, à son rythme ;
  // un joueur revenu au salon de CE lancement n'y est pas renvoyé (il peut la rejoindre : joinLive).
  _onLive(from, d) {
    if (from !== this.hostId) return;
    const e = d.e | 0;
    this._see(e);
    if (e < this.epoch) return;
    this.hostLive = d.on && typeof d.trackId === 'string' ? { e, track: trackOf(d.trackId, d.name, d.sig) } : null;
    if (this.hostLive && e > this.epoch && !this.cupActive && (this.state === 'lobby' || (this.launch && this.launch.kind === 'free'))) {
      this.track = this.hostLive.track;
      this._begin(e, this.track, LATE_START_MS);
    }
    this.emit('members');
  }

  // Rejoindre la course libre que l'hôte court en ce moment (bouton du salon, après en être revenu).
  joinLive() {
    const l = this.hostLive;
    if (!l || this.cupActive || this.state === 'racing' || l.e < this.epoch) return false;
    this.track = l.track;
    this._begin(l.e, l.track, LATE_START_MS);
    return true;
  }

  // Retour au salon : propre à ce joueur seulement (les autres continuent de courir, chacun à son rythme).
  backToLobby() {
    this.state = 'lobby';
    this.meta.racing = false; this.meta.ready = false; this.signaling.track(this.meta);
    if (this.isHost) this._sendLive();                             // l'hôte au salon : plus de course libre « en cours » pour les arrivants
    this.emit('lobby');
    this.emit('members');
  }

  // ---- Course --------------------------------------------------------------------------------------------------------
  // s : { steps, pos, quat, vel, vehicle, flags, tele, cp, lap } de la voiture locale ; envoyé à tous, canal rapide.
  sendSnapshot(s) { this.mesh.broadcastState(packSnapshot({ ...s, seq: this.seq++ })); }

  // Une arrivée (à chaque essai) : annoncée à tous ; chacun garde le meilleur temps de chaque joueur.
  // e : l'époque de la course qui vient de finir (RaceSession : opts.multi.epoch). Une course d'un lancement précédent (encore à l'écran pendant le
  // chargement du suivant) ne compte plus (TECH-042).
  reportFinish(steps, e = this.epoch) {
    const st = this.cupState;
    if (e !== this.epoch) return false;
    if (this.cup && st && st.phase === 'racing') {                    // championnat : un seul temps par manche, annoncé avec son numéro
      if (!st.roster.includes(this.selfId) || st.finishes.has(this.selfId)) return false;
      this._noteFinish(this.selfId, steps);
      this._pendingFinish = { e: this.epoch, rn: st.n, steps };
      this.mesh.sendCtl({ k: 'finish', e: this.epoch, steps, rn: st.n });
      this.emit('live'); this._cupTick();
      return true;
    }
    if (!this.launch || this.launch.kind !== 'free') return false;
    const r = this._noteResult(this.results, this.selfId, steps, false);
    this._sendReliable({ k: 'finish', e, t: this.launch.track.id, steps });      // renvoyée après une coupure à qui ne l'a pas reçue (TECH-046)
    this.emit('results');
    return r.best === steps;      // vrai : nouveau meilleur temps personnel dans cette salle
  }

  // Mon arrivée de la manche en cours, annoncée pendant une coupure : renvoyée à l'hôte (il l'ignore s'il l'a déjà). TECH-084 : seulement pour le championnat
  // et la manche où elle a été faite ; jamais rejouée dans un autre.
  _resendFinish(to) {
    const p = this._pendingFinish, st = this.cupState;
    if (!p) return;
    if (!this.cup || p.e !== this.epoch || (st && st.n !== p.rn)) { this._pendingFinish = null; return; }       // autre championnat, autre manche : périmée
    if (!st || st.phase !== 'racing') return;
    this.mesh.sendCtl({ k: 'finish', e: p.e, steps: p.steps, rn: p.rn }, to);
  }

  // Meilleur temps, dernier temps et nombre d'essais d'un joueur (un temps synchronisé, « sync », ne compte pas comme un essai).
  _noteResult(map, id, steps, sync) {
    const r = map.get(id) || { best: steps, last: steps, n: 0 };
    r.best = Math.min(r.best, steps);
    if (!sync) { r.last = steps; r.n++; }
    map.set(id, r);
    return r;
  }

  // Temps reçus pour un lancement que je ne connais pas encore : gardés pour lui (deux lancements au plus, 8 joueurs chacun).
  _noteFuture(e, t, id, steps, sync) {
    this._future = this._future || new Map();
    let f = this._future.get(e);
    if (!f) {
      f = { t, results: new Map() }; this._future.set(e, f);
      while (this._future.size > 2) this._future.delete(Math.min(...this._future.keys()));
    }
    if (f.t !== t || (!f.results.has(id) && f.results.size >= MAX_PLAYERS)) return;
    this._noteResult(f.results, id, steps, sync);
  }

  // ---- Championnat (manches) -----------------------------------------------------------------------------------------
  // Joueurs qui partent sur la grille : moi et ceux dont la liaison est ouverte (les autres rejoindront à la manche suivante).
  cupRoster() {
    return this.list.filter((m) => m.self || m.link === 'open').map((m) => m.id);
  }

  get cupActive() { return !!(this.cup && !this.cup.finished); }

  // L'hôte lance un championnat. rounds : [{ id, name, sig }] (circuits intégrés 'b-…' ou de la communauté 'c:…', chargés par chacun) ; collisions : voitures qui se poussent.
  startCup({ rounds, collisions = true }) {
    if (!this.isHost || !Array.isArray(rounds) || !rounds.length || rounds.length > MAX_ROUNDS) return false;
    if (!rounds.every((r) => r && typeof r.id === 'string' && /^(b-|c:)/.test(r.id))) return false;
    const e = this._newEpoch();
    this.epoch = e; this.launch = { e, kind: 'cup', track: null };
    this._pendingFinish = null;
    this.cup = new Championship({ id: Math.random().toString(36).slice(2, 8), rounds, collisions });
    this.cupState = null;
    for (const m of this.list) this.cup.setName(m.id, m.name);
    this.mesh.sendCtl({ k: 'cup', e, cup: this.cup.toJSON() });
    this.emit('cup');
    this._hostBeginRound(0);
    return true;
  }

  // L'hôte arrête le championnat : tout le monde retrouve le salon.
  stopCup() {
    if (!this.cup || !this.isHost) return false;
    this.mesh.sendCtl({ k: 'cupstop', e: this.epoch });
    this._cupStopped();
    return true;
  }

  _cupStopped() {
    this.cup = null; this.cupState = null;
    this._pendingFinish = null;                                   // (TECH-084) l'arrivée en attente meurt avec son championnat
    if (this.launch && this.launch.kind === 'cup') this.launch = null;
    this.emit('cupstop');
    this.emit('members');
  }

  // Ordre de la grille : le classement général (le meilleur devant) ; à la première manche, l'ordre d'arrivée dans la salle (l'hôte devant).
  _gridOrder(ids) {
    const rank = new Map(this.cup.played ? this.cup.standings().map((r, i) => [r.id, i]) : []);
    const at = (id) => (this.members.get(id) || this.meta).t || 0;
    return [...ids].sort((a, b) => (rank.has(a) ? rank.get(a) : 99) - (rank.has(b) ? rank.get(b) : 99) || at(a) - at(b) || (a < b ? -1 : 1));
  }

  _hostBeginRound(n) {
    const cup = this.cup;
    const roster = this._gridOrder(this.cupRoster());
    const names = {};
    for (const id of roster) names[id] = id === this.selfId ? this.meta.name : (this.members.get(id) || {}).name || '?';
    this.mesh.sendCtl({ k: 'round', e: this.epoch, n, roster, names, startIn: START_DELAY_MS, prev: n > 0 ? cup.results[n - 1] || null : null });
    this._beginRound(n, roster, names, START_DELAY_MS);
  }

  _beginRound(n, roster, names, inMs) {
    const cup = this.cup;
    for (const [id, nm] of Object.entries(names || {})) cup.setName(id, nm);
    const track = cup.rounds[n];
    this.track = { ...track };
    this.cupState = { phase: 'racing', n, roster, finishes: new Map(), t0: this.now() + inMs, firstAt: null, until: 0 };
    const slot = roster.indexOf(this.selfId);
    if (slot < 0) { this.emit('cupwait', { n, total: cup.total }); this.emit('members'); return; }         // arrivé trop tard pour cette manche : il part à la suivante
    this.state = 'racing';
    this.meta.racing = true; this.meta.ready = false; this.meta.want = null; this.signaling.track(this.meta);
    this.emit('start', {
      trackId: track.id, track: this.track, startLocal: this.now() + inMs, e: this.epoch,
      cup: { n, total: cup.total, slot, count: roster.length, roster, collisions: cup.collisions },
    });
  }

  // État de la manche, tel qu'on l'envoie (cup, cupsync) : phase, numéro, grille, arrivées, délai avant la suivante, temps depuis le « GO » (négatif : à venir).
  _cupStateJSON() {
    const st = this.cupState, now = this.now();
    return st ? { phase: st.phase, n: st.n, roster: st.roster, nextIn: st.until ? Math.max(0, st.until - now) : 0, startIn: st.phase === 'racing' ? Math.round(st.t0 - now) : 0, finishes: Object.fromEntries(st.finishes) } : null;
  }

  _sendCup(to = null) { this.mesh.sendCtl({ k: 'cup', e: this.epoch, cup: this.cup.toJSON(), state: this._cupStateJSON() }, to); }

  // Un état de manche reçu, validé et borné ; null s'il est invalide.
  _cleanState(s) {
    if (!s || typeof s !== 'object' || !['racing', 'results', 'done'].includes(s.phase) || !Array.isArray(s.roster)) return null;
    const n = s.n | 0;
    if (n < 0 || n >= (this.cup ? this.cup.total : MAX_ROUNDS)) return null;
    const finishes = new Map();
    for (const [id, v] of Object.entries(s.finishes && typeof s.finishes === 'object' ? s.finishes : {}).slice(0, MAX_PLAYERS)) { const st = +v | 0; if (st > 0 && st <= MAX_RUN_STEPS) finishes.set(id, st); }
    return { phase: s.phase, n, roster: s.roster.filter((x) => typeof x === 'string').slice(0, MAX_PLAYERS), finishes,
      nextIn: Math.max(0, Math.min(RESULTS_MS * 2, +s.nextIn || 0)), startIn: Math.max(-MAX_ROUND_MS, Math.min(15000, +s.startIn || 0)) };
  }

  _onCup(from, d) {
    if (from !== this.hostId || !d.cup || typeof d.cup !== 'object') return;
    const rounds = Array.isArray(d.cup.rounds) ? d.cup.rounds : [];
    if (!rounds.length || rounds.length > MAX_ROUNDS || !rounds.every((r) => r && typeof r.id === 'string' && /^(b-|c:)/.test(r.id))) return;
    const e = d.e | 0;
    this._see(e);
    if (e < this.epoch) return;                                    // un championnat d'avant un lancement plus récent
    if (e > this.epoch || !this.cup) {
      // Un nouveau championnat, ou un arrivant : on prend celui de l'hôte. Une manche déjà commencée se suit sans la courir ; la suivante se court.
      this.epoch = e; this.launch = { e, kind: 'cup', track: null }; this.hostLive = null; this.cupState = null; this._pendingFinish = null;
      this.cup = Championship.from(d.cup);
      const s = this._cleanState(d.state);
      if (s) this._adoptPhase(s);
    } else {
      const s = this._cleanState(d.state);
      if (this._syncCup(Championship.from(d.cup), s).richer) this._sendCupSync(from);       // l'hôte en sait moins que moi (TECH-048) : je le lui dis
    }
    this.emit('cup');
    this.emit('members');
  }

  // Même championnat, état reçu d'un autre joueur : les résultats ne font que s'enrichir, les arrivées de la manche en cours se complètent, la phase ne
  // fait qu'avancer. Renvoie { changed, moved, richer } (richer : j'ai encore quelque chose que l'autre n'a pas : il faut le lui dire).
  _syncCup(remote, s) {
    const cup = this.cup;
    if (JSON.stringify(remote.rounds) !== JSON.stringify(cup.rounds)) return { changed: false, moved: false, richer: false };
    for (const [id, nm] of remote.names) if (!cup.names.has(id)) cup.setName(id, nm);
    let changed = false, moved = false;
    const touched = new Set();
    for (const r of remote.results) if (cup.mergeRound(r.n, r.times, r.order)) { changed = true; touched.add(r.n); }
    const mine = this.cupState;
    if (s && mine && s.phase === 'racing' && mine.phase === 'racing' && s.n === mine.n) {
      for (const [id, st] of s.finishes) if (!mine.finishes.has(id) && mine.roster.includes(id)) { this._noteFinish(id, st); changed = true; }
    }
    if (s && phaseRank(s) > phaseRank(mine)) { this._adoptPhase(s); moved = true; }
    else if (mine && mine.phase === 'racing' && mine.n < cup.played) {          // ma manche est close (résultats connus), sans état plus avancé : je m'arrête
      this._pendingFinish = null;
      const n = mine.n;
      this.cupState = { ...mine, phase: cup.finished ? 'done' : 'results', until: cup.finished ? 0 : this.now() + RESULTS_MS };
      this._emitRound(n); moved = true;
    } else if (mine && mine.phase !== 'racing' && touched.has(mine.n)) this._emitRound(mine.n);     // résultats affichés complétés : l'écran se met à jour
    const richer = cup.results.length > remote.results.length || cup.results.some((r) => Championship.richer(r, remote.results[r.n]))
      || (!!this.cupState && phaseRank(this.cupState) > phaseRank(s));
    return { changed, moved, richer };
  }

  // TECH-048 : état de mon championnat, envoyé à l'hôte quand j'en sais plus que lui (clôture qu'il a manquée, nouvel hôte, second « rend » plus pauvre).
  _sendCupSync(to = this.hostId) {
    if (!this.cup || to === this.selfId) return;
    this.mesh.sendCtl({ k: 'cupsync', e: this.epoch, cup: this.cup.toJSON(), state: this._cupStateJSON() }, to);
  }

  // L'hôte reçoit l'état d'un joueur : il prend l'état le plus complet (union des résultats, phase la plus avancée) et, s'il a changé, le renvoie à tous.
  _onCupSync(from, d) {
    if (!this.isHost || !this.cup || !this._sameEpoch(d) || !this.members.has(from) || !d.cup || typeof d.cup !== 'object') return;
    const r = this._syncCup(Championship.from(d.cup), this._cleanState(d.state));
    if (r.changed || r.moved) { this._sendCup(); this.emit('cup'); this.emit('members'); this._cupTick(); }
  }

  // L'état reçu est plus avancé que le mien. TECH-047 : si la manche que je courais a été close pendant mon absence, ma course est arrêtée et ses résultats
  // affichés (cupround) ; si une manche suivante est en cours, je la cours si je suis sur sa grille (départ manqué), sinon je la suis.
  _adoptPhase(s) {
    const cup = this.cup, now = this.now(), prev = this.cupState;
    const mine = prev && prev.phase === 'racing' ? prev.n : null;
    const lost = mine != null && mine < cup.played;
    if (lost) this._pendingFinish = null;
    if (s.phase === 'racing') {
      if (s.roster.includes(this.selfId) && !(prev && prev.phase === 'racing' && prev.n === s.n)) {
        if (lost) this._emitRound(mine);
        this._beginRound(s.n, s.roster, {}, Math.max(500, s.startIn));
        for (const [id, st] of s.finishes) if (!this.cupState.finishes.has(id) && s.roster.includes(id)) this._noteFinish(id, st);
        return;
      }
      this.cupState = { phase: 'racing', n: s.n, roster: s.roster, finishes: s.finishes, t0: now + s.startIn, firstAt: s.finishes.size ? now : null, until: 0 };
      if (lost) this._emitRound(mine);                                // (le panneau dit alors « manche en cours : tu joueras la suivante »)
      else this.emit('cupwait', { n: s.n, total: cup.total });
    } else {
      this.cupState = { phase: s.phase, n: s.n, roster: s.roster, finishes: s.finishes, t0: now, firstAt: s.finishes.size ? now : null, until: s.phase === 'results' ? now + s.nextIn : 0 };
      if (lost) this._emitRound(mine);
    }
  }

  _emitRound(n) {
    const st = this.cupState, cup = this.cup;
    this.emit('cupround', { n, result: cup.results[n], standings: cup.standings(), final: cup.finished, nextIn: st && st.until ? st.until - this.now() : 0 });
  }

  _onRound(from, d) {
    const cup = this.cup;
    if (from !== this.hostId || !cup || !this._sameEpoch(d)) return;
    const n = d.n | 0;
    // Un résultat manqué (liaison coupée un instant) est rattrapé avec celui que l'hôte joint au départ suivant.
    if (n > cup.played && d.prev && typeof d.prev === 'object' && (d.prev.n | 0) === cup.played) {
      cup.mergeRound(d.prev.n | 0, d.prev.times || {}, Array.isArray(d.prev.order) ? d.prev.order : Object.keys(d.prev.times || {}));
    }
    if (n !== cup.played || n >= cup.total || !Array.isArray(d.roster)) return;
    if (this.cupState && this.cupState.phase === 'racing' && this.cupState.n === n) return;       // déjà partie (un nouvel hôte la relance) : on ne repart pas
    const roster = d.roster.filter((x) => typeof x === 'string').slice(0, MAX_PLAYERS);
    const m = this.members.get(from);
    this._beginRound(n, roster, d.names && typeof d.names === 'object' ? d.names : {}, Math.max(500, Math.min(15000, +d.startIn || START_DELAY_MS)) - (m ? m.rtt / 2 : 0));
  }

  _noteFinish(id, steps) {
    const st = this.cupState;
    st.finishes.set(id, steps);
    if (st.firstAt == null) st.firstAt = this.now();
  }

  _onCupFinish(from, d) {
    const st = this.cupState;
    const steps = +d.steps | 0;
    if (!this.cup || !st || st.phase !== 'racing' || (d.rn | 0) !== st.n || !st.roster.includes(from) || st.finishes.has(from) || !(steps > 0 && steps <= MAX_RUN_STEPS)) return;
    this._noteFinish(from, steps);
    this.emit('live');
    this._cupTick();
  }

  // Horloge du championnat (toutes les 400 ms, et à chaque arrivée / départ) : seul l'hôte décide de clore une manche et d'en lancer une autre.
  _cupTick() {
    if (!this.closed) this._expireAway();
    const st = this.cupState, cup = this.cup;
    // (signalisation coupée : l'hôte continue de conduire la manche tant qu'il a des liaisons ouvertes ; les joueurs dont la liaison est tombée sont absents)
    if (!cup || !st || this.closed || !this.isHost || (this.reconnecting && !this._openCount())) return;
    const now = this.now();
    if (st.phase === 'racing') {
      const present = (id) => id === this.selfId || this.members.has(id);
      const waiting = st.roster.filter((id) => !st.finishes.has(id) && present(id));
      if (!waiting.length || (st.firstAt != null && now - st.firstAt > FINISH_GRACE_MS) || now - st.t0 > MAX_ROUND_MS) this._hostEndRound();
    } else if (st.phase === 'results' && st.until && now >= st.until && !cup.finished) this._hostBeginRound(cup.played);
  }

  _hostEndRound() {
    const st = this.cupState, cup = this.cup;
    const times = {};
    for (const id of st.roster) times[id] = st.finishes.has(id) ? st.finishes.get(id) : null;
    const nextIn = cup.played + 1 >= cup.total ? 0 : RESULTS_MS;
    this.mesh.sendCtl({ k: 'rend', e: this.epoch, n: st.n, times, nextIn });
    this._onRoundEnd(st.n, times, nextIn);
  }

  _onRoundEnd(n, times, nextIn) {
    const st = this.cupState, cup = this.cup;
    if (cup && n < cup.played) {
      // TECH-048 : manche déjà rangée (clôture d'un hôte précédent, ou second « rend » d'un nouvel hôte) : elle ne fait que s'enrichir, jamais un résultat
      // plus pauvre n'écrase le mien ; si j'en sais plus, je le dis à l'hôte.
      if (cup.mergeRound(n, times, Object.keys(times))) { if (st && st.phase !== 'racing' && st.n === n) this._emitRound(n); this.emit('cup'); }
      const r = cup.results[n];
      if (!this.isHost && r.order.some((id) => r.times[id] != null && !(+times[id] > 0))) this._sendCupSync();
      return;
    }
    if (!cup || !st || st.phase !== 'racing' || st.n !== n) return;
    this._pendingFinish = null;
    const clean = {};
    for (const id of st.roster) { const v = +times[id]; clean[id] = v > 0 && v <= MAX_RUN_STEPS ? v | 0 : null; }
    const result = cup.scoreRound(n, clean, st.roster);
    if (!result) return;
    st.phase = cup.finished ? 'done' : 'results';
    st.until = cup.finished ? 0 : this.now() + (nextIn || RESULTS_MS);
    this._emitRound(n);
    this.emit('members');
  }

  // Classement en direct de la manche : [{ id, name, finished (pas | null), prog (0 à 1), self }] ; l'avancement des autres vient de leurs paquets (progOf).
  liveEntries(progOf = () => 0) {
    const st = this.cupState;
    if (!this.cup || !st) return [];
    return st.roster.map((id) => ({
      id, name: this.cup.names.get(id) || '?', self: id === this.selfId,
      finished: st.finishes.has(id) ? st.finishes.get(id) : null, prog: progOf(id),
      gone: id !== this.selfId && !this.members.has(id),
      away: id !== this.selfId && (this.members.get(id) || {}).link === 'away',
    }));
  }

  // Classement par meilleur temps, puis ceux qui n'ont pas encore fini. Provisoire : chaque temps est annoncé par son joueur.
  ranking() {
    const rows = this.list.map((m) => { const r = this.results.get(m.id); return { id: m.id, name: m.name, self: !!m.self, best: r ? r.best : null, last: r ? r.last : null, n: r ? r.n : 0 }; });
    return rows.sort((a, b) => (a.best == null) - (b.best == null) || (a.best ?? 0) - (b.best ?? 0));
  }

  _onState(from, data) {
    const now = this.now();
    // Anti-inondation : un joueur ne peut pas nous faire traiter plus de MAX_PACKETS_PER_SEC paquets par seconde.
    let r = this._rate.get(from);
    if (!r || now - r.t0 > 1000) { r = { t0: now, n: 0 }; this._rate.set(from, r); }
    if (++r.n > MAX_PACKETS_PER_SEC) return;
    const snap = unpackSnapshot(data);
    if (!snap) return;
    this.emit('snapshot', from, snap, now);
  }
}

// Fabrique de signalisation : Supabase Realtime, ou deux onglets du même navigateur avec ?net=local (essais sans serveur).
export function defaultSignaling({ code, selfId, observe = false }, getToken) {
  const local = typeof location !== 'undefined' && new URLSearchParams(location.search).get('net') === 'local';
  return local ? new LocalSignaling({ code, selfId }) : new SupabaseSignaling({ code, selfId, getToken, observe });
}
