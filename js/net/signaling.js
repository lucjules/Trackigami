// Signalisation du multijoueur : annuaire des joueurs d'une salle + relais des messages WebRTC (offres, réponses, ICE).
//
// Supabase Realtime sert UNIQUEMENT à ça : trois ou quatre messages par connexion entre deux joueurs, puis plus rien.
// Les paquets de jeu (20 Hz) ne passent JAMAIS par ici : ils vont directement de navigateur à navigateur (transport.js).
//
// Deux implémentations de la même interface :
//   SupabaseSignaling : un canal Realtime « copytrack-room-<CODE> » (diffusion + présence), protocole Phoenix écrit à la main
//                       (aucune bibliothèque : le jeu reste sans dépendance) ;
//   LocalSignaling    : BroadcastChannel du navigateur, pour essayer deux onglets sans serveur (?net=local) et pour les tests.
//
// Interface : join(meta) · track(meta) · send(to, data) · leave() · peers (Map id → meta, sans soi)
//   événements : 'join'(id, meta) · 'leave'(id) · 'meta'(id, meta, info) · 'signal'(from, data) · 'closed'(reason)
//   (info.conn : ce joueur déjà présent a ouvert une NOUVELLE connexion, il s'est reconnecté ; présence suivie par connexion : voir _syncDiff)
import { ONLINE } from '../online.js';

export class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) { (this._h.get(ev) || this._h.set(ev, []).get(ev)).push(fn); return this; }
  off(ev, fn) { const a = this._h.get(ev); if (a) this._h.set(ev, a.filter((f) => f !== fn)); }
  emit(ev, ...args) { for (const f of [...(this._h.get(ev) || [])]) { try { f(...args); } catch (e) { console.error(e); } } }
}

const JOIN_TIMEOUT = 6000;
const HEARTBEAT_TIMEOUT = 10000;     // battement sans réponse au bout de 10 s : la connexion est morte sans l'avoir dit (TECH-012)
const TOKEN_MARGIN_MS = 90000;       // jeton du canal renouvelé dans sa dernière minute et demie (online.ensureSession en donne un neuf dans sa dernière minute)
const TOKEN_RETRY_MS = 15000;        // pas encore de jeton neuf : on redemande un peu plus tard (tant qu'il n'a pas expiré)
const LOST = 'Connexion au serveur de salons perdue.';

const signalingError = (message, code) => Object.assign(new Error(message), { code });

// Date d'expiration (ms) d'un jeton JWT, lue sans le vérifier (c'est le serveur qui juge) ; null s'il n'est pas lisible.
export function tokenExpiry(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return p && Number.isFinite(p.exp) ? p.exp * 1000 : null;
  } catch { return null; }
}

// Entrées de présence d'une clé (format Phoenix : { metas: [{ phx_ref, phx_ref_prev?, ...meta }] }) → [{ ref, prev, meta }] (métadonnées sans les champs Phoenix).
function metasOf(entry) {
  const metas = entry && Array.isArray(entry.metas) ? entry.metas : [];
  return metas.filter((m) => m && typeof m === 'object').map((m) => {
    const { phx_ref, phx_ref_prev, ...meta } = m;
    return { ref: typeof phx_ref === 'string' || typeof phx_ref === 'number' ? String(phx_ref) : null, prev: phx_ref_prev != null ? String(phx_ref_prev) : null, meta };
  });
}

// ---- Supabase Realtime (protocole Phoenix, version 1.0.0 : messages JSON {topic, event, payload, ref}) ----------------
export class SupabaseSignaling extends Emitter {
  // observe : écouter l'annuaire d'un canal sans s'y inscrire (liste des salons publics : on regarde, on n'apparaît pas).
  constructor({ code, selfId, getToken = null, observe = false, WebSocketImpl = globalThis.WebSocket, url = ONLINE.url, key = ONLINE.key, heartbeatMs = 25000, heartbeatTimeoutMs = HEARTBEAT_TIMEOUT }) {
    super();
    this.code = code; this.selfId = selfId; this.getToken = getToken; this.observe = observe;
    this.WS = WebSocketImpl; this.url = url; this.key = key; this.heartbeatMs = heartbeatMs; this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.topic = `realtime:copytrack-room-${code}`;
    this.peers = new Map();
    this._pres = new Map();          // clé → [{ ref, prev, meta }] : une entrée par connexion (TECH-011)
    this.ref = 0;
    this.ws = null; this.hb = null; this.joined = false;
    this.token = null; this._tokExp = null; this._hbRef = null;
  }

  // Envoie un message ; renvoie sa référence (vrai) ou false si la connexion n'est pas ouverte.
  _send(topic, event, payload) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const ref = String(++this.ref);
    try { this.ws.send(JSON.stringify({ topic, event, payload, ref })); } catch { return false; }
    return ref;
  }

  // Rejoindre le canal. Une tentative qui échoue (délai, refus, fermeture) ou qu'on abandonne (leave pendant la jonction) FERME sa connexion
  // (TECH-044) : une réponse tardive du serveur ne peut plus rien publier. Erreurs : code 'timeout' | 'refused' | 'network' | 'aborted'.
  async join(meta) {
    this.meta = meta;
    if (this._ended) throw signalingError('Connexion annulée.', 'aborted');
    const token = this.getToken ? await this.getToken().catch(() => null) : null;
    if (this._ended) throw signalingError('Connexion annulée.', 'aborted');       // abandonnée pendant l'attente du jeton (TECH-082) : rien n'est ouvert
    this.token = token || null;
    const wsUrl = this.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(this.key) + '&vsn=1.0.0';
    await new Promise((resolve, reject) => {
      let settled = false, timer = null;
      const fail = (msg, code = 'network') => {
        if (settled) return;
        settled = true; clearTimeout(timer); this._pending = null;
        this._abort();
        reject(signalingError(msg, code));
      };
      const done = () => { if (settled) return; settled = true; clearTimeout(timer); this._pending = null; resolve(); };
      this._pending = fail;
      timer = setTimeout(() => fail('Le serveur de salons ne répond pas.', 'timeout'), JOIN_TIMEOUT);
      let ws;
      try { ws = new this.WS(wsUrl); } catch { fail('Connexion impossible.'); return; }
      this.ws = ws;
      ws.onopen = () => {
        if (this._ended) return;
        this._joinRef = this._send(this.topic, 'phx_join', {
          config: { broadcast: { self: false, ack: false }, presence: { key: this.selfId }, private: false },
          ...(token ? { access_token: token } : {}),
        });
      };
      ws.onmessage = (e) => {
        if (this._ended) return;
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (!this.joined && m.topic === this.topic && m.event === 'phx_reply' && m.ref != null && String(m.ref) === this._joinRef) {
          if (m.payload && m.payload.status === 'ok') {
            this.joined = true;
            if (!this.observe) this._send(this.topic, 'presence', { type: 'presence', event: 'track', payload: this.meta });
            this.hb = setInterval(() => this._beat(), this.heartbeatMs);
            this._scheduleToken();
            // La liste des présents (presence_state) arrive juste après la réponse : on laisse un instant (une perte pendant ce temps fait échouer la jonction).
            setTimeout(done, 250);
          } else fail('Salle refusée par le serveur' + (m.payload && m.payload.response && m.payload.response.reason ? ' (' + String(m.payload.response.reason).slice(0, 80) + ')' : '.'), 'refused');
          return;
        }
        this._onMessage(m);
      };
      ws.onerror = () => { if (this._pending) fail('Connexion au serveur de salons impossible.'); else this._closed(LOST); };
      ws.onclose = () => { if (this._pending) fail('Connexion fermée.'); else this._closed(LOST); };
    });
  }

  _onMessage(m) {
    if (this._ended) return;
    if (m.topic === 'phoenix') {                        // réponse à un battement
      if (m.event === 'phx_reply' && m.ref != null && String(m.ref) === this._hbRef) { this._hbRef = null; clearTimeout(this._hbWait); }
      return;
    }
    if (m.topic !== this.topic) return;
    const p = m.payload || {};
    // TECH-012 : canal fermé ou en erreur côté serveur, ou message « system » d'erreur (jeton expiré ou refusé) : la présence est perdue, c'est une perte.
    if (m.event === 'phx_close' || m.event === 'phx_error' || (m.event === 'system' && p.status === 'error')) { this._closed(LOST); return; }
    if (m.event === 'presence_state') this._syncState(p);
    else if (m.event === 'presence_diff') this._syncDiff(p);
    else if (m.event === 'broadcast' && p.event === 'signal' && p.payload) {
      const { from, to, data } = p.payload;
      if (to === this.selfId && typeof from === 'string' && from !== this.selfId) this.emit('signal', from, data);
    }
  }

  // ---- Présence (TECH-011) : une entrée PAR CONNEXION, comme le client Phoenix (syncState / syncDiff) ---------------------------------------------
  // Un joueur a une entrée par connexion ouverte (référence phx_ref) : après une coupure, sa nouvelle connexion arrive souvent AVANT que le serveur ait fermé
  // l'ancienne ; un onglet dupliqué en a deux. Il est présent tant qu'il lui reste au moins une entrée ; ses métadonnées sont celles de l'entrée la plus récente.
  // Le départ d'une entrée (leaves) ne retire que cette entrée. Repli prudent : une entrée sans phx_ref (serveur qui ne les donnerait pas) vaut pour toute la clé.
  _syncState(state) {
    const prev = this._pres;
    this._pres = new Map();
    for (const [key, entry] of Object.entries(state && typeof state === 'object' ? state : {})) { const list = metasOf(entry); if (list.length) this._pres.set(key, list); }
    for (const key of prev.keys()) if (!this._pres.has(key)) this._presence(key, null, null);
    for (const [key, list] of this._pres) this._presence(key, list, list.filter((e) => !(prev.get(key) || []).some((o) => o.ref === e.ref)), prev.get(key) || []);
  }

  _syncDiff({ joins, leaves } = {}) {
    for (const [key, entry] of Object.entries(joins && typeof joins === 'object' ? joins : {})) {
      const before = this._pres.get(key) || [], added = metasOf(entry);
      if (!added.length) continue;
      const refs = new Set(added.map((e) => e.ref));
      const after = [...before.filter((e) => !refs.has(e.ref)), ...added];
      this._pres.set(key, after);
      this._presence(key, after, added, before);
    }
    for (const [key, entry] of Object.entries(leaves && typeof leaves === 'object' ? leaves : {})) {
      const before = this._pres.get(key);
      if (!before) continue;
      const gone = metasOf(entry);
      const after = gone.some((e) => e.ref == null) ? [] : before.filter((e) => !gone.some((g) => g.ref === e.ref));
      if (after.length === before.length) continue;
      if (after.length) this._pres.set(key, after); else this._pres.delete(key);
      this._presence(key, after.length ? after : null, [], before);
    }
  }

  // Une clé a changé : 'join' (arrivée), 'meta' (mise à jour, ou nouvelle connexion d'un joueur déjà là : info.conn), 'leave' (plus aucune connexion).
  _presence(key, list, added = [], before = []) {
    if (key === this.selfId) return;
    const had = this.peers.has(key);
    if (!list) { if (had) { this.peers.delete(key); this.emit('leave', key); } return; }
    const meta = list[list.length - 1].meta;
    const prevMeta = this.peers.get(key);
    this.peers.set(key, meta);
    if (!had) { this.emit('join', key, meta); return; }
    // Nouvelle connexion (et non simple mise à jour) : une entrée qui ne remplace aucune entrée connue (phx_ref_prev absent ou inconnu).
    const conn = added.some((e) => e.ref != null && !(e.prev != null && before.some((b) => b.ref === e.prev)));
    if (added.length || JSON.stringify(prevMeta) !== JSON.stringify(meta)) this.emit('meta', key, meta, conn ? { conn: true } : undefined);
  }

  // Métadonnées de toutes les connexions d'un joueur, de la plus ancienne à la plus récente (TECH-040 : choisir celle qui porte le bon engagement).
  metasOf(id) { return (this._pres.get(id) || []).map((e) => e.meta); }

  track(meta) { this.meta = meta; this._send(this.topic, 'presence', { type: 'presence', event: 'track', payload: meta }); }

  send(to, data) {
    return this._send(this.topic, 'broadcast', { type: 'broadcast', event: 'signal', payload: { from: this.selfId, to, data } });
  }

  // ---- Battements (TECH-012) : chaque battement attend sa réponse ; sans elle, la connexion est morte (le navigateur peut ne jamais le dire) --------------
  _beat() {
    if (this._ended) return;
    if (this._hbRef) { this._closed(LOST); return; }            // (le précédent est resté sans réponse)
    const ref = this._send('phoenix', 'heartbeat', {});
    if (!ref) { this._closed(LOST); return; }
    this._hbRef = ref;
    clearTimeout(this._hbWait);
    this._hbWait = setTimeout(() => { if (this._hbRef === ref) this._closed(LOST); }, Math.min(this.heartbeatTimeoutMs, this.heartbeatMs));
    if (this._tokExp && Date.now() >= this._tokExp - TOKEN_MARGIN_MS) this._renewToken();
  }

  // ---- Jeton d'accès du canal (TECH-012) : renouvelé AVANT son expiration (message access_token), sans quoi le serveur ferme le canal à l'échéance -------
  // Le jeton n'est jamais écrit dans un journal.
  _scheduleToken() {
    clearTimeout(this._tokTimer);
    this._tokExp = this.token ? tokenExpiry(this.token) : null;
    if (!this._tokExp || !this.getToken || this._ended) return;
    const wait = Math.max(1000, Math.min(this._tokExp - TOKEN_MARGIN_MS - Date.now(), 2 ** 31 - 1));
    this._tokTimer = setTimeout(() => this._renewToken(), wait);
  }

  async _renewToken() {
    if (this._ended || this._renewing || !this.getToken) return;
    this._renewing = true;
    let t = null;
    try { t = await this.getToken(); } catch { t = null; } finally { this._renewing = false; }
    if (this._ended) return;
    if (t && t !== this.token) {
      this.token = t;
      this._send(this.topic, 'access_token', { access_token: t });
      this._scheduleToken();
    } else if (this._tokExp && Date.now() < this._tokExp) {
      // Pas encore de jeton neuf : on redemande bientôt. Après l'échéance, le serveur ferme le canal : c'est une perte, et la reconnexion prend un jeton neuf.
      clearTimeout(this._tokTimer);
      this._tokTimer = setTimeout(() => this._renewToken(), TOKEN_RETRY_MS);
    }
  }

  _stop() {
    clearInterval(this.hb); clearTimeout(this._hbWait); clearTimeout(this._tokTimer);
    this.hb = this._hbWait = this._tokTimer = null; this._hbRef = null;
  }

  // Fin d'une tentative ou d'une connexion : plus aucun minuteur, la connexion est fermée (après un au revoir si le canal était rejoint).
  _abort() {
    this._ended = true;
    this._stop();
    const ws = this.ws;
    if (!ws) return;
    if (this.joined) this._send(this.topic, 'phx_leave', {});
    try { ws.close(); } catch { /* déjà fermé */ }
  }

  // La connexion est perdue (fermée, en erreur, canal fermé par le serveur, battement sans réponse) : on la ferme pour de bon et on le dit.
  // Pendant la jonction, c'est la jonction qui échoue (l'appelant n'a pas encore de connexion à perdre).
  _closed(reason) {
    if (this._pending) { this._pending(reason); return; }
    if (this._ended) return;
    this._ended = true;
    this._stop();
    try { if (this.ws) this.ws.close(); } catch { /* déjà fermé */ }
    this.emit('closed', reason);
  }

  // Départ (ou abandon) : pendant la jonction, celle-ci échoue (« aborted ») et sa connexion est fermée ; pendant l'attente du jeton, rien ne sera ouvert.
  leave() {
    if (this._pending) { this._pending('Connexion annulée.', 'aborted'); return; }
    if (this._ended) return;
    this._abort();
  }
}

// ---- Signalisation locale (deux onglets du même navigateur) ----------------------------------------------------------
export class LocalSignaling extends Emitter {
  constructor({ code, selfId }) {
    super();
    this.code = code; this.selfId = selfId;
    this.peers = new Map();
    this.bc = new BroadcastChannel('copytrack-room-' + code);
    this.bc.onmessage = (e) => this._onMessage(e.data);
  }
  async join(meta) {
    if (this._ended) throw signalingError('Connexion annulée.', 'aborted');
    if (Date.now() < LocalSignaling.blockedUntil) { this._end(); throw signalingError('réseau coupé (essai)', 'network'); }     // (tentative ratée : fermée, TECH-044)
    this.meta = meta;
    this._post({ k: 'hello', id: this.selfId, meta });
    await new Promise((r) => setTimeout(r, 250));      // le temps de recevoir les réponses des présents
    if (this._ended) throw signalingError('Connexion annulée.', 'aborted');
  }
  _post(m) { if (this._ended) return false; try { this.bc.postMessage(m); return true; } catch { return false; } }
  _end() { if (this._ended) return; this._ended = true; try { this.bc.close(); } catch { /* déjà fermé */ } }
  _onMessage(m) {
    if (this._ended || !m || m.id === this.selfId) return;
    if (m.k === 'hello') {
      this._set(m.id, m.meta, true);
      this._post({ k: 'here', id: this.selfId, to: m.id, meta: this.meta });
    } else if (m.k === 'here' && m.to === this.selfId) this._set(m.id, m.meta);
    else if (m.k === 'meta') this._set(m.id, m.meta);
    else if (m.k === 'bye') { if (this.peers.delete(m.id)) this.emit('leave', m.id); }
    else if (m.k === 'signal' && m.to === this.selfId) this.emit('signal', m.id, m.data);
  }
  // hello d'un joueur déjà connu : il a rouvert sa signalisation (info.conn, comme une nouvelle connexion Realtime).
  _set(id, meta, hello = false) { const had = this.peers.has(id); this.peers.set(id, meta); if (had) this.emit('meta', id, meta, hello ? { conn: true } : undefined); else this.emit('join', id, meta); }
  metasOf(id) { return this.peers.has(id) ? [this.peers.get(id)] : []; }
  track(meta) { this.meta = meta; this._post({ k: 'meta', id: this.selfId, meta }); }
  send(to, data) { return this._post({ k: 'signal', id: this.selfId, to, data }); }
  leave() { this._post({ k: 'bye', id: this.selfId }); this._end(); }
  // Essais (tests, ?net=local) : une coupure réseau de ms millisecondes. Les autres voient le joueur disparaître de l'annuaire (sans « au revoir » du
  // salon), lui perd sa signalisation, et ne peut pas la retrouver avant la fin de la coupure.
  simulateCut(ms) {
    LocalSignaling.blockedUntil = Date.now() + ms;
    this._post({ k: 'bye', id: this.selfId });
    this._end();
    this.emit('closed', 'coupure simulée');
  }
}
LocalSignaling.blockedUntil = 0;
