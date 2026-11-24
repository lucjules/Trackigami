// Banc simulé du multijoueur (tools/test-net.mjs) : horloge virtuelle, faux serveur Supabase Realtime, faux WebRTC.
//
// Ce que le banc d'avant permettait : un faux WebSocket qu'on remplit à la main (messages Phoenix écrits dans le test), un faux RTCPeerConnection qui relie deux
// navigateurs sans réseau, et un faux annuaire sans protocole (fakeRoomEnv, lan() de test-manche). Ni horloge simulée (les battements de 25 s, le délai de 6 s, la place
// gardée 20 s, l'expiration d'un jeton d'une heure étaient hors de portée), ni serveur qui suive la présence comme Phoenix (une entrée PAR CONNEXION), ni pannes.
//
// Ce module ajoute :
//   VirtualClock   remplace setTimeout / setInterval / Date.now le temps d'un scénario (install()) ; advance(ms) exécute les minuteries dans l'ordre, en laissant
//                  les promesses se résoudre entre deux ; until(promesse) fait avancer le temps jusqu'à ce qu'elle se règle ;
//   FakeRealtime   serveur Realtime (protocole Phoenix 1.0.0, JSON) : phx_join (clé de présence, jeton d'accès), presence_state / presence_diff avec phx_ref et
//                  phx_ref_prev, diffusion sans retour à l'envoyeur, réponses aux battements, access_token, phx_leave ; jetons à date d'expiration (canal fermé
//                  par un message « system » puis phx_close à l'expiration, comme Supabase l'annonce) ; pannes : phx_close, phx_error, expiration forcée,
//                  battements sans réponse, réponse de jonction tardive, coupure du réseau d'un joueur (« abrupte » : son navigateur voit la fermeture ; « silencieuse » :
//                  personne ne voit rien), connexion fantôme que le serveur ne retire qu'après ghostMs ;
//   FakeRTCNet     WebRTC : offre / réponse avec empreinte DTLS et ufrag par connexion, candidats ICE (refusés s'ils viennent d'une autre session), canaux (fiable :
//                  file gardée pendant une coupure ; non fiable : perdu), états de connexion (déconnecté après disconnectMs, échec après failMs, retour si le chemin revient),
//                  relance ICE, fermeture vue de l'autre côté.
//
// C'est une MODÉLISATION : l'ordre exact des messages de Supabase, ses délais et le comportement réel de Chrome (relance ICE, empreinte qui change) ne sont pas observés
// ici. Le code du jeu est écrit pour être correct quel que soit cet ordre ; la liste des vérifications à faire sur le vrai Realtime est dans supabase/MULTI.md.

export const flush = () => new Promise((r) => globalThis.setImmediate(r));          // (vide la file des promesses : setImmediate passe après toutes les microtâches)

// ---- Horloge virtuelle ---------------------------------------------------------------------------------------------------------------------------
export class VirtualClock {
  constructor(t0 = 1_800_000_000_000) {
    this.t = t0; this.timers = new Map(); this.seq = 0;
    this.now = () => this.t;
    this.setTimeout = (fn, ms = 0, ...args) => this._add(fn, ms, 0, args);
    this.setInterval = (fn, ms = 0, ...args) => this._add(fn, ms, Math.max(1, +ms || 0), args);
    this.clearTimeout = (id) => { this.timers.delete(id); };
    this.clearInterval = (id) => { this.timers.delete(id); };
  }
  _add(fn, ms, every, args) {
    if (typeof fn !== 'function') return 0;
    const id = ++this.seq;
    this.timers.set(id, { id, at: this.t + Math.max(0, +ms || 0), fn, every, args });
    return id;
  }
  // Le temps du scénario : les minuteries globales et Date.now passent par cette horloge. Renvoie la fonction qui remet tout en place.
  install() {
    const g = globalThis, saved = { st: g.setTimeout, ct: g.clearTimeout, si: g.setInterval, ci: g.clearInterval, now: Date.now };
    g.setTimeout = this.setTimeout; g.clearTimeout = this.clearTimeout; g.setInterval = this.setInterval; g.clearInterval = this.clearInterval; Date.now = this.now;
    return () => { g.setTimeout = saved.st; g.clearTimeout = saved.ct; g.setInterval = saved.si; g.clearInterval = saved.ci; Date.now = saved.now; };
  }
  _next(limit) {
    let best = null;
    for (const t of this.timers.values()) if (t.at <= limit && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
    return best;
  }
  async advance(ms) {
    const end = this.t + Math.max(0, ms);
    await flush();
    for (let n = 0; ; n++) {
      if (n > 2_000_000) throw new Error('horloge virtuelle : minuteries sans fin');
      const t = this._next(end);
      if (!t) break;
      this.t = Math.max(this.t, t.at);
      if (t.every) t.at += t.every; else this.timers.delete(t.id);
      try { t.fn(...t.args); } catch (e) { console.error(e); }
      await flush();
    }
    this.t = end;
    await flush();
  }
  // Fait avancer le temps par pas jusqu'à ce que la promesse se règle (au plus maxMs de temps simulé).
  async until(p, maxMs = 60000, step = 50) {
    let done = false, value, error, failed = false;
    p.then((v) => { done = true; value = v; }, (e) => { done = true; failed = true; error = e; });
    for (let spent = 0; !done && spent < maxMs; spent += step) await this.advance(step);
    await flush();
    if (!done) throw new Error(`promesse toujours en attente après ${maxMs} ms de temps simulé`);
    if (failed) throw error;
    return value;
  }
}

// ---- Jetons d'accès (JWT de forme réelle, signature factice) -------------------------------------------------------------------------------------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function expOf(token) {
  try { const p = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()); return Number.isFinite(p.exp) ? p.exp * 1000 : null; } catch { return null; }
}

// ---- Faux serveur Supabase Realtime ----------------------------------------------------------------------------------------------------------------
const reply = (topic, ref, status = 'ok', response = {}) => ({ topic, event: 'phx_reply', payload: { status, response }, ref });

export class FakeRealtime {
  constructor(clock, { latency = 5, ghostMs = 30000 } = {}) {
    this.clock = clock; this.latency = latency;
    this.ghostMs = ghostMs;            // une connexion disparue sans fermeture n'est retirée (présence comprise) qu'au bout de ghostMs
    this.socks = new Set();
    this.nets = new Map();
    this.n = 0;
    this.replyHeartbeats = true;
    this.joinDelay = 0;                // réponse au phx_join retardée de joinDelay ms
    this.received = [];                // tout ce que le serveur a reçu : { client, sock, topic, event, payload }
    this.issued = [];                  // jetons fabriqués (pour vérifier qu'aucun n'apparaît dans un journal)
    clock.setInterval(() => this._expireTokens(), 1000);
  }

  net(client) { if (!this.nets.has(client)) this.nets.set(client, { up: true }); return this.nets.get(client); }

  // Classe WebSocket d'un joueur (SupabaseSignaling({ WebSocketImpl })).
  socket(client) {
    const server = this;
    return class FakeSocket {
      constructor(url) { server._connect(this, client, url); }
      send(text) { server._fromClient(this, text); }
      close() { server._clientClose(this); }
    };
  }

  // Source de jetons qui se comporte comme online.ensureSession : le même jeton tant qu'il vaut encore plus d'une minute, un neuf sinon.
  tokenSource(client, ttlMs = 3600000) {
    let cur = null;
    return async () => {
      if (!cur || expOf(cur) - this.clock.t <= 60000) cur = this.issueToken(client, ttlMs);
      return cur;
    };
  }
  issueToken(sub, ttlMs) {
    const t = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub, role: 'anon', exp: Math.floor((this.clock.t + ttlMs) / 1000), n: ++this.n }) + '.sig' + this.n;
    this.issued.push(t);
    return t;
  }
  checkToken(t) {
    if (t == null) return { ok: true, exp: null };
    const exp = expOf(t);
    if (exp == null) return { ok: true, exp: null };
    if (exp <= this.clock.t) return { ok: false, reason: 'Token has expired', exp };
    return { ok: true, exp };
  }

  // ---- connexions ----
  _connect(ws, client, url) {
    ws.readyState = 0; ws.url = url;
    const s = { ws, client, id: ++this.n, channels: new Map(), open: false, cdead: false, sdead: false, broken: false };
    ws._s = s; this.socks.add(s);
    this.clock.setTimeout(() => {
      if (s.cdead) return;
      if (!this.net(client).up) { this._clientSide(s, true); s.sdead = true; return; }
      s.open = true; ws.readyState = 1;
      if (ws.onopen) ws.onopen({});
    }, 1);
  }
  _fromClient(ws, text) {
    const s = ws._s;
    if (ws.readyState === 0) throw new Error('InvalidStateError: WebSocket encore en connexion');
    if (ws.readyState !== 1 || s.cdead || s.sdead || s.broken || !this.net(s.client).up) return;
    const m = JSON.parse(text);
    this.clock.setTimeout(() => { if (!s.sdead && !s.broken) this._handle(s, m); }, this.latency);
  }
  _push(s, m) {
    if (s.sdead || !s.open) return;
    this.clock.setTimeout(() => {
      if (s.sdead || s.cdead || s.broken || !this.net(s.client).up || s.ws.readyState !== 1) return;
      if (s.ws.onmessage) s.ws.onmessage({ data: JSON.stringify(m) });
    }, this.latency);
  }
  // Fermeture vue par le navigateur (erreur éventuelle puis close).
  _clientSide(s, error = false) {
    if (s.cdead) return;
    s.cdead = true; s.ws.readyState = 3;
    this.clock.setTimeout(() => { if (error && s.ws.onerror) s.ws.onerror({}); if (s.ws.onclose) s.ws.onclose({ code: error ? 1006 : 1000 }); }, 1);
  }
  _clientClose(ws) {
    const s = ws._s;
    if (s.cdead) return;
    this._clientSide(s);
    // Le serveur l'apprend aussitôt si la trame de fermeture passe ; sinon, comme pour une connexion disparue, après ghostMs.
    if (this.net(s.client).up && !s.broken) this.clock.setTimeout(() => this._serverDrop(s), this.latency);
    else this.clock.setTimeout(() => this._serverDrop(s), this.ghostMs);
  }
  _serverDrop(s) {
    if (s.sdead) return;
    s.sdead = true;
    for (const ch of [...s.channels.values()]) this._closeChannel(s, ch, false);
  }

  // ---- protocole ----
  _handle(s, m) {
    this.received.push({ client: s.client, sock: s.id, topic: m.topic, event: m.event, payload: m.payload, ref: m.ref });
    if (m.topic === 'phoenix') {
      if (m.event === 'heartbeat' && this.replyHeartbeats && !s.mute) this._push(s, reply('phoenix', m.ref));
      return;
    }
    if (m.event === 'phx_join') { this._join(s, m); return; }
    const ch = s.channels.get(m.topic);
    if (!ch) return;
    const p = m.payload || {};
    if (m.event === 'presence' && p.event === 'track') this._track(s, ch, p.payload || {});
    else if (m.event === 'presence' && p.event === 'untrack') this._untrack(ch);
    else if (m.event === 'broadcast') { for (const o of this._members(m.topic)) if (o.s !== s) this._push(o.s, { topic: m.topic, event: 'broadcast', payload: p, ref: null }); }
    else if (m.event === 'access_token') {
      const v = this.checkToken(p.access_token);
      if (!v.ok) { this._kick(s, ch, 'Invalid token'); return; }
      ch.exp = v.exp;
      this._push(s, reply(m.topic, m.ref));
    } else if (m.event === 'phx_leave') { this._push(s, reply(m.topic, m.ref)); this._closeChannel(s, ch, true); }
  }
  _join(s, m) {
    const p = m.payload || {}, cfg = p.config || {};
    const key = cfg.presence && typeof cfg.presence.key === 'string' ? cfg.presence.key : '';
    const answer = () => {
      if (s.sdead) return;
      const v = this.checkToken(p.access_token);
      if (!v.ok) { this._push(s, reply(m.topic, m.ref, 'error', { reason: v.reason })); return; }
      const ch = { topic: m.topic, key, exp: v.exp, pres: null };
      s.channels.set(m.topic, ch);
      this._push(s, reply(m.topic, m.ref, 'ok', { postgres_changes: [] }));
      this._push(s, { topic: m.topic, event: 'presence_state', payload: this._state(m.topic), ref: null });
    };
    if (this.joinDelay) this.clock.setTimeout(answer, this.joinDelay); else answer();
  }
  _members(topic) { const out = []; for (const s of this.socks) { const ch = !s.sdead && s.channels.get(topic); if (ch) out.push({ s, ch }); } return out; }
  _state(topic) {
    const st = {};
    for (const { ch } of this._members(topic)) if (ch.pres) (st[ch.key] = st[ch.key] || { metas: [] }).metas.push({ ...ch.pres.meta, phx_ref: ch.pres.ref });
    return st;
  }
  _diff(topic, joins, leaves) { for (const { s } of this._members(topic)) this._push(s, { topic, event: 'presence_diff', payload: { joins, leaves }, ref: null }); }
  _track(s, ch, meta) {
    const ref = 'F' + (++this.n), prev = ch.pres;
    ch.pres = { ref, meta: { ...meta } };
    this._diff(ch.topic, { [ch.key]: { metas: [{ ...meta, phx_ref: ref, ...(prev ? { phx_ref_prev: prev.ref } : {}) }] } }, prev ? { [ch.key]: { metas: [{ ...prev.meta, phx_ref: prev.ref }] } } : {});
  }
  _untrack(ch) {
    const prev = ch.pres; if (!prev) return;
    ch.pres = null;
    this._diff(ch.topic, {}, { [ch.key]: { metas: [{ ...prev.meta, phx_ref: prev.ref }] } });
  }
  _closeChannel(s, ch, notify) {
    if (s.channels.get(ch.topic) !== ch) return;
    s.channels.delete(ch.topic);
    if (ch.pres) { const prev = ch.pres; ch.pres = null; this._diff(ch.topic, {}, { [ch.key]: { metas: [{ ...prev.meta, phx_ref: prev.ref }] } }); }
    if (notify) this._push(s, { topic: ch.topic, event: 'phx_close', payload: {}, ref: null });
  }
  _kick(s, ch, message) {
    this._push(s, { topic: ch.topic, event: 'system', payload: { status: 'error', extension: 'system', message, channel: ch.topic.replace(/^realtime:/, '') }, ref: null });
    this._closeChannel(s, ch, true);
  }
  _expireTokens() {
    for (const s of this.socks) {
      if (s.sdead) continue;
      for (const ch of [...s.channels.values()]) if (ch.exp && ch.exp <= this.clock.t) this._kick(s, ch, `Token has expired ${Math.round((this.clock.t - ch.exp) / 1000)} seconds ago`);
    }
  }

  // ---- pannes scriptables ----
  _live(client) { return [...this.socks].filter((s) => s.client === client && !s.sdead); }
  pushClose(client) { for (const s of this._live(client)) for (const ch of [...s.channels.values()]) this._closeChannel(s, ch, true); }
  pushError(client) {
    for (const s of this._live(client)) for (const ch of [...s.channels.values()]) { this._push(s, { topic: ch.topic, event: 'phx_error', payload: {}, ref: null }); this._closeChannel(s, ch, false); }
  }
  expire(client) { for (const s of this._live(client)) for (const ch of s.channels.values()) ch.exp = this.clock.t; this._expireTokens(); }
  mute(client) { for (const s of this._live(client)) s.mute = true; }        // le serveur ne répond plus à ses battements (la connexion est morte sans le dire)
  // Coupure du réseau d'un joueur pendant ms : ses connexions tombent (« abrupt » : son navigateur le voit ; « silent » : personne ne le voit), aucune
  // connexion neuve n'aboutit avant la fin ; le serveur ne retire les anciennes qu'après ghostMs.
  cut(client, ms, { mode = 'abrupt' } = {}) {
    const net = this.net(client);
    net.up = false;
    for (const s of this._live(client)) {
      if (s.cdead) continue;
      s.broken = true;
      if (mode === 'abrupt') this._clientSide(s, true);
      this.clock.setTimeout(() => this._serverDrop(s), this.ghostMs);
    }
    if (Number.isFinite(ms)) this.clock.setTimeout(() => { net.up = true; }, ms);
  }
  heal(client) { this.net(client).up = true; }
  reap(client) { for (const s of this._live(client)) if (s.broken || s.cdead) this._serverDrop(s); }
  // Vue du serveur : clé → nombre d'entrées de présence (une par connexion) sur un canal.
  presence(topic) { const m = new Map(); for (const { ch } of this._members(topic)) if (ch.pres) m.set(ch.key, (m.get(ch.key) || 0) + 1); return m; }
  connections(client) { return this._live(client).filter((s) => !s.cdead).length; }
  count(client, event, topic = null) { return this.received.filter((r) => r.client === client && r.event === event && (!topic || r.topic === topic)).length; }
}

// ---- Faux WebRTC ---------------------------------------------------------------------------------------------------------------------------------
const domErr = (name, msg = name) => Object.assign(new Error(msg), { name });

class FakeChannel {
  constructor(pc, label, opts = {}) {
    this.pc = pc; this.label = label; this.ordered = opts.ordered !== false; this.maxRetransmits = opts.maxRetransmits;
    this.reliable = this.ordered && opts.maxRetransmits == null;
    this.readyState = 'connecting'; this.bufferedAmount = 0; this.binaryType = 'blob';
    this.peer = null; this.queue = []; this.sent = 0;
  }
  send(data) {
    if (this.readyState !== 'open') throw domErr('InvalidStateError', 'canal non ouvert');
    this.sent++;
    const net = this.pc.net, peer = this.peer;
    if (!peer) return;
    if (!net.flowing(this.pc, peer.pc)) { if (this.reliable) this.queue.push(data); return; }   // fiable : retransmis plus tard ; non fiable : perdu
    net.deliver(this, data);
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    const net = this.pc.net;
    net.clock.setTimeout(() => { if (this.onclose) this.onclose({}); }, 1);
    if (this.peer && net.pathUp(this.pc.client, this.peer.pc.client)) net.remoteClose(this.peer);
  }
}

class FakePeer {
  constructor(net, client, cfg) {
    this.net = net; this.client = client; this.id = ++net.n; net.pcs.set(this.id, this); net.created.push(this);
    this.config = { ...(cfg || {}) };
    this.connectionState = 'new'; this.signalingState = 'stable';
    this.localDescription = null; this.remoteDescription = null;
    this.session = 0; this.remotePc = null; this.remoteSession = null; this.candOk = false; this.closed = false;
    this.channels = []; this.cands = [];
  }
  getConfiguration() { return { ...this.config }; }
  setConfiguration(c) { this.config = { ...c }; }
  createDataChannel(label, opts) { const ch = new FakeChannel(this, label, opts); ch.local = true; this.channels.push(ch); return ch; }
  _sdp() { return `v=0\r\na=x-pc:${this.id}\r\na=x-session:${this.session}\r\na=ice-ufrag:u${this.id}s${this.session}\r\na=fingerprint:sha-256 FP:${String(this.id).padStart(4, '0')}\r\n`; }
  async createOffer(o = {}) {
    if (this.closed) throw domErr('InvalidStateError');
    if (o && o.iceRestart || !this.session) this.session++;
    return { type: 'offer', sdp: this._sdp() };
  }
  async createAnswer() {
    if (this.closed || this.signalingState !== 'have-remote-offer') throw domErr('InvalidStateError');
    if (!this.session) this.session = 1;
    return { type: 'answer', sdp: this._sdp() };
  }
  async setLocalDescription(d) {
    if (this.closed) throw domErr('InvalidStateError');
    if (d.type === 'offer') { if (this.signalingState !== 'stable' && this.signalingState !== 'have-local-offer') throw domErr('InvalidStateError'); this.signalingState = 'have-local-offer'; }
    else if (d.type === 'answer') { if (this.signalingState !== 'have-remote-offer') throw domErr('InvalidStateError'); this.signalingState = 'stable'; }
    else throw new TypeError('type de description inconnu');
    this.localDescription = { type: d.type, sdp: d.sdp, toJSON() { return { type: d.type, sdp: d.sdp }; } };
    if (this.connectionState === 'new') this._state('connecting');
    const sess = this.session;
    this.net.clock.setTimeout(() => {
      if (this.closed || this.session !== sess || !this.onicecandidate) return;
      const c = `candidate:${this.id} u${this.id}s${sess}`;
      this.onicecandidate({ candidate: { candidate: c, sdpMid: '0', toJSON: () => ({ candidate: c, sdpMid: '0' }) } });
      this.onicecandidate({ candidate: null });
    }, 2);
    this._try();
  }
  async setRemoteDescription(d) {
    if (this.closed) throw domErr('InvalidStateError');
    if (!d || (d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string') throw new TypeError('description invalide');
    const pcId = +((/a=x-pc:(\d+)/.exec(d.sdp) || [])[1]), sess = +((/a=x-session:(\d+)/.exec(d.sdp) || [])[1]);
    // Une autre connexion distante (autre empreinte DTLS) sur un RTCPeerConnection existant : refusée (comportement exact de Chrome à vérifier ; le jeu repart
    // d'une connexion neuve dans ce cas, qu'elle soit refusée ou non).
    if (this.remotePc && pcId !== this.remotePc) throw domErr('InvalidAccessError', 'empreinte DTLS différente');
    if (d.type === 'offer') {
      if (this.signalingState !== 'stable') throw domErr('InvalidStateError');
      this.signalingState = 'have-remote-offer';
      if (this.remoteSession != null && this.remoteSession !== sess) this.session++;      // relance ICE de l'autre : on change de session aussi
    } else {
      if (this.signalingState !== 'have-local-offer') throw domErr('InvalidStateError');
      this.signalingState = 'stable';
    }
    if (this.remoteSession !== sess) this.candOk = false;
    this.remotePc = pcId; this.remoteSession = sess;
    this.remoteDescription = { type: d.type, sdp: d.sdp };
    this._try();
  }
  async addIceCandidate(c) {
    if (this.closed) throw domErr('InvalidStateError');
    if (!this.remoteDescription) throw domErr('InvalidStateError', 'candidat avant la description distante');
    if (!c || !c.candidate) return;
    const m = /^candidate:(\d+) u(\d+)s(\d+)$/.exec(String(c.candidate));
    if (!m || +m[1] !== this.remotePc || +m[3] !== this.remoteSession) throw domErr('OperationError', 'candidat d\'une autre connexion');
    this.cands.push(c); this.candOk = true;
    this._try();
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.connectionState = 'closed'; this.signalingState = 'closed';
    this.net.clock.clearTimeout(this.lossT); this.net.clock.clearTimeout(this.failT);
    for (const ch of this.channels) {            // (spécification : pas d'évènement « close » de ce côté ; l'autre côté voit ses canaux se fermer)
      if (ch.readyState === 'closed') continue;
      ch.readyState = 'closed';
      if (ch.peer && this.net.pathUp(this.client, ch.peer.pc.client)) this.net.remoteClose(ch.peer);
    }
    this.net.recheck();
  }
  _state(s) { if (this.closed || this.connectionState === s) return; this.connectionState = s; if (this.onconnectionstatechange) this.onconnectionstatechange({}); }
  _try() {
    const peer = this.net.pcs.get(this.remotePc);
    if (!peer || peer.closed || this.closed) return;
    const agreed = this.signalingState === 'stable' && peer.signalingState === 'stable' && this.localDescription && peer.localDescription
      && peer.remotePc === this.id && peer.remoteSession === this.session && this.remoteSession === peer.session && this.candOk && peer.candOk;
    if (agreed) this.net.connect(this, peer);
  }
}

export class FakeRTCNet {
  constructor(clock, { latency = 10, connectMs = 30, disconnectMs = 5000, failMs = 30000 } = {}) {
    this.clock = clock; this.latency = latency; this.connectMs = connectMs; this.disconnectMs = disconnectMs; this.failMs = failMs;
    this.pcs = new Map(); this.created = []; this.n = 0; this.down = new Set();
  }
  pc(client) { const net = this; return class RTCPeerConnection extends FakePeer { constructor(cfg) { super(net, client, cfg); } }; }
  pathUp(a, b) { return !this.down.has(a) && !this.down.has(b); }
  // Coupure du chemin pair à pair d'un joueur (son réseau pour le jeu) ; heal la rétablit.
  cut(client) { this.down.add(client); this.recheck(); }
  heal(client) { this.down.delete(client); this.recheck(); }
  flowing(a, b) { return !a.closed && !b.closed && a.connectionState === 'connected' && b.connectionState === 'connected' && this.pathUp(a.client, b.client) && a.remotePc === b.id && b.remotePc === a.id; }
  deliver(ch, data) {
    const peer = ch.peer;
    this.clock.setTimeout(() => { if (peer.readyState === 'open' && peer.onmessage) peer.onmessage({ data }); }, this.latency);
  }
  remoteClose(ch) {
    this.clock.setTimeout(() => { if (ch.readyState === 'closed') return; ch.readyState = 'closed'; if (ch.onclose) ch.onclose({}); }, this.latency);
  }
  connect(a, b) {
    if (a.pairing || (this.flowing(a, b) && a.linkedSession === a.session)) return;
    a.pairing = true;
    this.clock.setTimeout(() => {
      a.pairing = false;
      if (a.closed || b.closed || a.remotePc !== b.id || b.remotePc !== a.id) return;
      if (!this.pathUp(a.client, b.client)) { a.waiting = b.waiting = true; return; }
      a.linkedSession = a.session; b.linkedSession = b.session;
      a.waiting = b.waiting = false;
      a._state('connected'); b._state('connected');
      this._pairChannels(a, b); this._pairChannels(b, a);
      this._flush(a); this._flush(b);
    }, this.connectMs);
  }
  _pairChannels(a, b) {
    for (const ch of a.channels) {
      if (!ch.local || ch.peer) continue;
      const mirror = new FakeChannel(b, ch.label, { ordered: ch.ordered, maxRetransmits: ch.maxRetransmits });
      mirror.peer = ch; ch.peer = mirror; b.channels.push(mirror);
      if (b.ondatachannel) b.ondatachannel({ channel: mirror });
      this.clock.setTimeout(() => {
        for (const c of [ch, mirror]) if (c.readyState === 'connecting' && !c.pc.closed) { c.readyState = 'open'; if (c.onopen) c.onopen({}); }
      }, 1);
    }
  }
  _flush(pc) { for (const ch of pc.channels) while (ch.queue.length && ch.peer && this.flowing(pc, ch.peer.pc)) this.deliver(ch, ch.queue.shift()); }
  // Après une coupure ou une fermeture : déconnecté au bout de disconnectMs, échec au bout de failMs ; retour à « connecté » si le chemin revient avant.
  recheck() {
    for (const a of this.pcs.values()) {
      if (a.closed) continue;
      const b = this.pcs.get(a.remotePc);
      if (a.waiting && b && !b.closed && this.pathUp(a.client, b.client)) { a.waiting = false; a._try(); b._try(); continue; }
      if (a.connectionState !== 'connected' && a.connectionState !== 'disconnected' && a.connectionState !== 'failed') continue;
      const ok = b && !b.closed && this.pathUp(a.client, b.client) && b.remotePc === a.id;
      if (!ok && !a.lossT && a.connectionState === 'connected') {
        a.lossT = this.clock.setTimeout(() => { a.lossT = null; a._state('disconnected'); }, this.disconnectMs);
        a.failT = this.clock.setTimeout(() => { a.failT = null; a._state('failed'); }, this.failMs);
      } else if (ok) {
        this.clock.clearTimeout(a.lossT); this.clock.clearTimeout(a.failT); a.lossT = a.failT = null;
        if (a.connectionState === 'disconnected') { a._state('connected'); this._flush(a); }
      }
    }
  }
}
