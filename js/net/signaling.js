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
  constructor({ code, selfId, getToken = null, observe = false, WebSocketImpl = globalThis.WebSocket, url = ONLINE.url, key = ONLINE.key, heartbeatMs = 25000 }) {
    super();
    this.code = code; this.selfId = selfId; this.getToken = getToken; this.observe = observe;
    this.WS = WebSocketImpl; this.url = url; this.key = key; this.heartbeatMs = heartbeatMs;
    this.topic = `realtime:copytrack-room-${code}`;
    this.peers = new Map();
    this._pres = new Map();          // clé → [{ ref, prev, meta }] : une entrée par connexion (TECH-011)
    this.ref = 0;
    this.ws = null; this.hb = null; this.joined = false;
  }

  _send(topic, event, payload) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ topic, event, payload, ref: String(++this.ref) }));
    return true;
  }

  async join(meta) {
    this.meta = meta;
    const token = this.getToken ? await this.getToken().catch(() => null) : null;
    const wsUrl = this.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(this.key) + '&vsn=1.0.0';
    await new Promise((resolve, reject) => {
      let done = false;
      const fail = (m) => { if (!done) { done = true; reject(new Error(m)); } };
      const timer = setTimeout(() => fail('Le serveur de salons ne répond pas.'), JOIN_TIMEOUT);
      let ws;
      try { ws = new this.WS(wsUrl); } catch { clearTimeout(timer); fail('Connexion impossible.'); return; }
      this.ws = ws;
      ws.onopen = () => {
        this._send(this.topic, 'phx_join', {
          config: { broadcast: { self: false, ack: false }, presence: { key: this.selfId }, private: false },
          ...(token ? { access_token: token } : {}),
        });
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.topic === this.topic && m.event === 'phx_reply' && !this.joined) {
          clearTimeout(timer);
          if (m.payload && m.payload.status === 'ok') {
            this.joined = true;
            if (!this.observe) this._send(this.topic, 'presence', { type: 'presence', event: 'track', payload: this.meta });
            this.hb = setInterval(() => this._send('phoenix', 'heartbeat', {}), this.heartbeatMs);
            // La liste des présents (presence_state) arrive juste après la réponse : on laisse un instant.
            setTimeout(() => { if (!done) { done = true; resolve(); } }, 250);
          } else fail('Salle refusée par le serveur' + (m.payload && m.payload.response && m.payload.response.reason ? ' (' + m.payload.response.reason + ')' : '.'));
          return;
        }
        this._onMessage(m);
      };
      ws.onerror = () => { clearTimeout(timer); fail('Connexion au serveur de salons impossible.'); };
      ws.onclose = () => { clearTimeout(timer); fail('Connexion fermée.'); this._closed('Connexion au serveur de salons perdue.'); };
    });
  }

  _onMessage(m) {
    if (m.topic !== this.topic) return;
    const p = m.payload || {};
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

  track(meta) { this.meta = meta; this._send(this.topic, 'presence', { type: 'presence', event: 'track', payload: meta }); }

  send(to, data) {
    return this._send(this.topic, 'broadcast', { type: 'broadcast', event: 'signal', payload: { from: this.selfId, to, data } });
  }

  _closed(reason) {
    if (this._ended) return;
    this._ended = true;
    clearInterval(this.hb);
    this.emit('closed', reason);
  }

  leave() {
    if (this._ended) return;
    this._send(this.topic, 'phx_leave', {});
    this._ended = true;
    clearInterval(this.hb);
    try { this.ws && this.ws.close(); } catch { /* déjà fermé */ }
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
    if (Date.now() < LocalSignaling.blockedUntil) throw new Error('réseau coupé (essai)');
    this.meta = meta;
    this.bc.postMessage({ k: 'hello', id: this.selfId, meta });
    await new Promise((r) => setTimeout(r, 250));      // le temps de recevoir les réponses des présents
  }
  _onMessage(m) {
    if (!m || m.id === this.selfId) return;
    if (m.k === 'hello') {
      this._set(m.id, m.meta);
      this.bc.postMessage({ k: 'here', id: this.selfId, to: m.id, meta: this.meta });
    } else if (m.k === 'here' && m.to === this.selfId) this._set(m.id, m.meta);
    else if (m.k === 'meta') this._set(m.id, m.meta);
    else if (m.k === 'bye') { if (this.peers.delete(m.id)) this.emit('leave', m.id); }
    else if (m.k === 'signal' && m.to === this.selfId) this.emit('signal', m.id, m.data);
  }
  _set(id, meta) { const had = this.peers.has(id); this.peers.set(id, meta); this.emit(had ? 'meta' : 'join', id, meta); }
  track(meta) { this.meta = meta; this.bc.postMessage({ k: 'meta', id: this.selfId, meta }); }
  send(to, data) { this.bc.postMessage({ k: 'signal', id: this.selfId, to, data }); return true; }
  leave() { this.bc.postMessage({ k: 'bye', id: this.selfId }); this.bc.close(); }
  // Essais (tests, ?net=local) : une coupure réseau de ms millisecondes. Les autres voient le joueur disparaître de l'annuaire (sans « au revoir » du
  // salon), lui perd sa signalisation, et ne peut pas la retrouver avant la fin de la coupure.
  simulateCut(ms) {
    LocalSignaling.blockedUntil = Date.now() + ms;
    this.bc.postMessage({ k: 'bye', id: this.selfId });
    this.bc.close();
    this.emit('closed', 'coupure simulée');
  }
}
LocalSignaling.blockedUntil = 0;
