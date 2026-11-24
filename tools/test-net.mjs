// Tests du multijoueur (sans navigateur) : node tools/test-net.mjs   (npm test)
// Les vraies connexions WebRTC sont essayées à part dans Chromium (deux onglets) ; ici : la logique.
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { DT } from '../js/constants.js';
import { packSnapshot, unpackSnapshot, SNAPSHOT_BYTES, F_FINISHED } from '../js/net/snapshot.js';
import { SnapshotBuffer } from '../js/net/interp.js';
import { RemoteCar, darkness, FADE_NEAR, FADE_FAR, MAX_DARKEN } from '../js/remoteCar.js';
import { SupabaseSignaling, Emitter, tokenExpiry } from '../js/net/signaling.js';
import { PeerMesh } from '../js/net/transport.js';
import { Room, cleanCarMeta, newRoomCode, normalizeCode, ROOM_RE } from '../js/net/room.js';
import { RESUME_MS, RETRY_MS } from '../js/net/resume.js';
import { RaceLogic } from '../js/raceLogic.js';
import { Track } from '../js/track.js';
import { PHYS_VER, NET_VER } from '../js/version.js';
import { test, finish, bugConnu, precondition } from './harness.mjs';
import { VirtualClock, FakeRealtime, FakeRTCNet } from './fake-realtime.mjs';
import { PublicDirectory, LOBBY_CODE } from '../js/net/directory.js';
import { createIceLoader } from '../js/net/ice.js';

const snap = (steps, x, o = {}) => ({ steps, flags: 0, tele: 0, vehicle: 'car', seq: steps, pos: { x, y: 1, z: 0 }, quat: new THREE.Quaternion(), vel: { x: 0, y: 0, z: 0 }, cp: 0, lap: 1, ...o });
// Reçoit une suite de paquets (émetteur à 20 Hz) avec une latence fixe de 30 ms.
function feed(buf, list, lat = 30) { for (const s of list) { const u = unpackSnapshot(packSnapshot(s)); buf.push(u, s.steps * DT * 1000 + lat); } }

console.log('Paquets');
await test('un paquet fait 40 octets et se relit à l\'identique (précision de la quantification, avancement compris)', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), 2.1);
  const s = snap(123456, -1234.5678, { flags: F_FINISHED, tele: 7, vehicle: 'glider', cp: 3, lap: 2, prog: 0.4321, quat: q, vel: { x: 55.5, y: -3.25, z: 120 } });
  const ab = packSnapshot(s);
  assert.equal(ab.byteLength, SNAPSHOT_BYTES); assert.equal(SNAPSHOT_BYTES, 40);
  const u = unpackSnapshot(ab);
  assert.equal(u.steps, 123456); assert.equal(u.tele, 7); assert.equal(u.vehicle, 'glider'); assert.equal(u.cp, 3); assert.equal(u.lap, 2); assert.equal(u.flags, F_FINISHED);
  assert.ok(Math.abs(u.pos.x - -1234.5678) < 1e-3);
  assert.ok(Math.abs(u.prog - 0.4321) < 2e-5, 'avancement ' + u.prog);
  assert.equal(unpackSnapshot(packSnapshot(snap(1, 0))).prog, 0, 'sans avancement : 0');
  assert.equal(unpackSnapshot(packSnapshot(snap(1, 0, { prog: 7 }))).prog, 1, 'borné à 1');
  assert.ok(Math.abs(u.vel.x - 55.5) < 0.02 && Math.abs(u.vel.z - 120) < 0.02);
  const dq = new THREE.Quaternion(u.quat.x, u.quat.y, u.quat.z, u.quat.w).angleTo(q);
  assert.ok(dq < 0.001, 'orientation à 0,06° près : ' + dq);
});
await test('paquets venus d\'un autre joueur : jamais de confiance (taille, version, NaN, quaternion nul)', () => {
  assert.equal(unpackSnapshot(new ArrayBuffer(10)), null);
  assert.equal(unpackSnapshot('x'), null); assert.equal(unpackSnapshot(null), null);
  const ok = packSnapshot(snap(1, 0));
  const bad = ok.slice(0); new DataView(bad).setUint8(0, 9); assert.equal(unpackSnapshot(bad), null, 'version');
  const nan = ok.slice(0); new DataView(nan).setFloat32(10, NaN, true); assert.equal(unpackSnapshot(nan), null, 'NaN');
  const far = ok.slice(0); new DataView(far).setFloat32(10, 1e9, true); assert.equal(unpackSnapshot(far), null, 'hors du monde');
  const zero = ok.slice(0); for (const o of [22, 24, 26, 28]) new DataView(zero).setInt16(o, 0, true); assert.equal(unpackSnapshot(zero), null, 'quaternion nul');
  assert.ok(unpackSnapshot(new Uint8Array(ok)), 'accepte aussi un Uint8Array');
});

console.log('Interpolation (tampon de 100 ms)');
await test('entre deux paquets : position lissée et orientation par slerp', () => {
  const buf = new SnapshotBuffer();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.0);
  feed(buf, [snap(0, 0, { quat: qa }), snap(6, 10, { quat: qb }), snap(12, 20), snap(18, 30)]);
  const t = (steps) => steps * DT * 1000 + 30 + 100;      // l'instant local où l'on voit l'état de « steps »
  const o = buf.sample(t(3));                              // à mi-chemin entre les deux premiers
  assert.ok(o.ready && !o.teleported);
  assert.ok(Math.abs(o.pos.x - 5) < 0.05, 'x ' + o.pos.x);
  assert.ok(Math.abs(o.quat.angleTo(qa) - 0.5) < 0.01, 'slerp à mi-angle');
  assert.ok(buf.sample(t(9)).pos.x > 14.9 && buf.sample(t(9)).pos.x < 15.1);
});
await test('il affiche l\'état d\'il y a 100 ms (jamais le dernier paquet reçu)', () => {
  const buf = new SnapshotBuffer();
  feed(buf, [0, 6, 12, 18, 24].map((s, i) => snap(s, i * 10)));
  const nowMs = 24 * DT * 1000 + 30;                       // on vient de recevoir le dernier (x = 40)
  assert.ok(buf.sample(nowMs).pos.x < 40 - 15, 'retard d\'environ 100 ms : ' + buf.sample(nowMs).pos.x);
});
await test('paquets dans le désordre et doublons : ordre remis, doublon ignoré', () => {
  const buf = new SnapshotBuffer();
  const u = (s, x) => unpackSnapshot(packSnapshot(snap(s, x)));
  buf.push(u(0, 0), 0); buf.push(u(12, 20), 100); buf.push(u(6, 10), 130); // 6 arrive après 12
  assert.equal(buf.push(u(6, 10), 140), false, 'doublon');
  assert.deepEqual(buf.samples.map((s) => s.t), [0, 6 * DT, 12 * DT]);
});
await test('paquets perdus : interpolation sans à-coup, puis arrêt sur place (pas de dérive infinie)', () => {
  const buf = new SnapshotBuffer();
  feed(buf, [snap(0, 0, { vel: { x: 100, y: 0, z: 0 } }), snap(12, 10, { vel: { x: 100, y: 0, z: 0 } })]);
  const lerp = buf.sample(6 * DT * 1000 + 30 + 100);
  assert.ok(lerp.pos.x > 4 && lerp.pos.x < 6);
  // plus aucun paquet pendant 3 s : extrapolation limitée à 0,25 s (25 m à 100 m/s), puis elle ne bouge plus
  const far = buf.sample(12 * DT * 1000 + 30 + 100 + 3000);
  assert.ok(far.pos.x <= 10 + 100 * 0.25 + 1e-6 && far.pos.x > 10, 'x ' + far.pos.x);
});

console.log('Téléportation (retour au checkpoint)');
await test('la voiture reste sur place puis APPARAÎT à l\'arrivée : jamais de glissement', () => {
  const buf = new SnapshotBuffer();
  // x monte de 10 par paquet, puis téléportation de x = 40 à x = 5000 (compteur tele 0 → 1), puis ça repart de là.
  feed(buf, [snap(0, 0), snap(6, 10), snap(12, 20), snap(18, 30), snap(24, 40), snap(30, 5000, { tele: 1 }), snap(36, 5010, { tele: 1 }), snap(42, 5020, { tele: 1 })]);
  let prev = null, maxJump = 0, tpFrames = 0;
  for (let ms = 0; ms < 42 * DT * 1000 + 400; ms += 8) {   // ~120 images par seconde
    const o = buf.sample(ms + 30);
    if (!o.ready) continue;
    if (o.teleported) tpFrames++;
    if (prev !== null && !o.teleported) maxJump = Math.max(maxJump, Math.abs(o.pos.x - prev));
    prev = o.pos.x;
  }
  assert.equal(tpFrames, 1, 'exactement une image « apparition »');
  assert.ok(maxJump < 3, 'aucune image entre 40 et 5000 : saut max hors téléportation = ' + maxJump);
});
await test('compteur de téléportation : détecté même si le paquet « avant » est perdu', () => {
  const buf = new SnapshotBuffer();
  feed(buf, [snap(0, 0), snap(6, 10), snap(12, 20, { tele: 1 }), snap(18, 1000, { tele: 2 }), snap(24, 1010, { tele: 2 })]);   // le paquet tele 1 → 2 montre un saut direct
  let n = 0; for (let ms = 0; ms < 24 * DT * 1000 + 300; ms += 8) { if (buf.sample(ms + 30).teleported) n++; }
  assert.equal(n, 2, 'deux téléportations vues');
});

console.log('RemoteCar : assombrissement avec la distance');
await test('darkness : 0 de près, maximum de loin, croissante et lisse', () => {
  assert.equal(darkness(0), 0); assert.equal(darkness(FADE_NEAR), 0);
  assert.ok(Math.abs(darkness(FADE_FAR) - MAX_DARKEN) < 1e-9); assert.ok(Math.abs(darkness(5000) - MAX_DARKEN) < 1e-9);
  let prev = -1; for (let d = 0; d <= 400; d += 5) { const k = darkness(d); assert.ok(k >= prev - 1e-12); prev = k; }
  assert.ok(darkness((FADE_NEAR + FADE_FAR) / 2) > 0.3 * MAX_DARKEN && darkness((FADE_NEAR + FADE_FAR) / 2) < 0.7 * MAX_DARKEN);
});
await test('la couleur des matériaux devient plus sombre quand la voiture s\'éloigne de la caméra', () => {
  const scene = new THREE.Scene();
  const rc = new RemoteCar(scene, { id: 'a', name: 'Zoé', colorIndex: 1 });
  assert.ok(rc.mats.size > 0);
  const lum = () => { let l = 0, n = 0; for (const m of rc.mats) if (m.color) { l += m.color.r + m.color.g + m.color.b; n++; } return l / n; };
  rc.push(unpackSnapshot(packSnapshot(snap(0, 0))), 0); rc.push(unpackSnapshot(packSnapshot(snap(12, 0))), 100);
  const cam = new THREE.Vector3(0, 0, 0);
  const seen = [];
  for (const dist of [5, 60, 120, 200, 400]) { cam.set(dist, 1, 0); rc.update(500, cam); seen.push(lum()); }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1] + 1e-9, 'décroissante : ' + seen);
  assert.ok(seen[4] < seen[0] * 0.25, 'au loin, nettement plus sombre : ' + seen);
  rc.update(500, cam.set(3, 1, 0)); assert.ok(Math.abs(lum() - seen[0]) < 1e-6, 'retour à la couleur pleine de près');
  // deux voitures : matériaux indépendants (assombrir l'une ne touche pas l'autre)
  const rc2 = new RemoteCar(scene, { id: 'b', name: 'Max', colorIndex: 2 });
  for (const m of rc2.mats) assert.ok(!rc.mats.has(m));
  rc.dispose(); rc2.dispose();
});
await test('RemoteCar : invisible avant le premier paquet ; téléportation signalée', () => {
  const scene = new THREE.Scene(); let tp = 0;
  const rc = new RemoteCar(scene, { id: 'a', name: 'A' }, { onTeleport: () => tp++ });
  assert.equal(rc.update(0, new THREE.Vector3()), false); assert.equal(rc.group.visible, false);
  const pk = (s, x, t) => unpackSnapshot(packSnapshot(snap(s, x, { tele: t })));
  [pk(0, 0, 0), pk(6, 10, 0), pk(12, 900, 1), pk(18, 910, 1)].forEach((p) => rc.push(p, p.steps * DT * 1000));
  for (let ms = 0; ms < 400; ms += 8) rc.update(ms + 100, new THREE.Vector3());
  assert.equal(tp, 1); assert.equal(rc.group.visible, true);
  rc.dispose();
});

console.log('Chrono et retour au checkpoint');
await test('solo : le chrono revient au checkpoint ; multijoueur : il continue de tourner', () => {
  const tr = new Track('t'); tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); tr.add({ t: 'finish', x: 0, z: -2, l: 0, r: 0 });
  const mk = () => { const l = new RaceLogic(tr); l.respawn = { x: 0, y: 0, z: 0, yaw: 0, snap: { steps: 100, splits: 0, collected: [], lap: 1 } }; l.steps = 900; return l; };
  const solo = mk(); solo.rewind(); assert.equal(solo.steps, 100);
  const multi = mk(); multi.rewind({ keepClock: true }); assert.equal(multi.steps, 900, 'le temps perdu est une pénalité');
});

console.log('Salon et code');
await test('code de salle : 6 caractères sans confusion possible, saisie tolérante', () => {
  for (let i = 0; i < 200; i++) assert.ok(ROOM_RE.test(newRoomCode()), newRoomCode());
  assert.equal(normalizeCode(' ab-c d23 '), 'ABCD23'); assert.ok(!ROOM_RE.test('ABC0EF') && !ROOM_RE.test('ABCDE') && !ROOM_RE.test('ABCDEFG'));
});

console.log('Signalisation Supabase Realtime (protocole Phoenix, faux WebSocket)');
class FakeWS {
  static last = null;
  constructor(url) { this.url = url; this.sent = []; this.readyState = 0; FakeWS.last = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
  send(t) {
    const m = JSON.parse(t); this.sent.push(m);
    // Comme un vrai serveur Phoenix, il répond à chaque battement (sans réponse, la connexion est tenue pour morte : TECH-012).
    if (m.topic === 'phoenix' && m.event === 'heartbeat') setTimeout(() => { if (this.readyState === 1) this.recv({ topic: 'phoenix', event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: m.ref }); }, 0);
  }
  close() { this.readyState = 3; this.onclose && this.onclose(); }
  recv(m) { this.onmessage({ data: JSON.stringify(m) }); }
}
await test('rejoindre : bon topic, bonne config, présence et signaux filtrés', async () => {
  const sig = new SupabaseSignaling({ code: 'ABC234', selfId: 'me', WebSocketImpl: FakeWS, url: 'https://x.supabase.co', key: 'K', getToken: async () => 'TOK', heartbeatMs: 20 });
  const joined = []; const left = []; const sigs = [];
  sig.on('join', (id, m) => joined.push([id, m])); sig.on('leave', (id) => left.push(id)); sig.on('signal', (f, d) => sigs.push([f, d]));
  const p = sig.join({ name: 'Zoé', host: true });
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWS.last;
  assert.ok(ws.url.startsWith('wss://x.supabase.co/realtime/v1/websocket?apikey=K&vsn=1.0.0'), ws.url);
  const j = ws.sent[0];
  assert.equal(j.topic, 'realtime:copytrack-room-ABC234'); assert.equal(j.event, 'phx_join');
  assert.equal(j.payload.config.presence.key, 'me'); assert.equal(j.payload.config.broadcast.self, false); assert.equal(j.payload.config.private, false); assert.equal(j.payload.access_token, 'TOK');
  ws.recv({ topic: j.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: j.ref });
  ws.recv({ topic: j.topic, event: 'presence_state', payload: { me: { metas: [{ phx_ref: 'r0', name: 'Zoé' }] }, bob: { metas: [{ phx_ref: 'r1', name: 'Bob', host: false, v: 18 }] } } });
  await p;
  assert.deepEqual(joined, [['bob', { name: 'Bob', host: false, v: 18 }]], 'soi-même exclu, métadonnées Phoenix retirées');
  assert.ok(ws.sent.some((m) => m.event === 'presence' && m.payload.event === 'track' && m.payload.payload.name === 'Zoé'));
  // diff : arrivée et départ
  ws.recv({ topic: j.topic, event: 'presence_diff', payload: { joins: { cat: { metas: [{ phx_ref: 'r2', name: 'Cat' }] } }, leaves: { bob: { metas: [{}] } } } });
  assert.equal(joined.length, 2); assert.deepEqual(left, ['bob']);
  // signal : seulement ceux qui me sont destinés
  ws.recv({ topic: j.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'signal', payload: { from: 'cat', to: 'me', data: { k: 'ice' } } } });
  ws.recv({ topic: j.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'signal', payload: { from: 'cat', to: 'autre', data: { k: 'ice' } } } });
  assert.equal(sigs.length, 1);
  sig.send('cat', { k: 'desc' });
  const b = ws.sent.at(-1); assert.equal(b.event, 'broadcast'); assert.deepEqual(b.payload.payload, { from: 'me', to: 'cat', data: { k: 'desc' } });
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(ws.sent.some((m) => m.topic === 'phoenix' && m.event === 'heartbeat'), 'battement de cœur');
  sig.leave();
});
await test('serveur qui refuse la salle : erreur claire', async () => {
  const sig = new SupabaseSignaling({ code: 'ABC234', selfId: 'me', WebSocketImpl: FakeWS, url: 'https://x.supabase.co', key: 'K' });
  const p = sig.join({});
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWS.last, j = ws.sent[0];
  ws.recv({ topic: j.topic, event: 'phx_reply', payload: { status: 'error', response: { reason: 'Unauthorized' } }, ref: j.ref });
  await assert.rejects(p, /refusée.*Unauthorized/);
});

console.log('Négociation WebRTC (faux RTCPeerConnection en mémoire)');
// Deux faux navigateurs reliés : la logique d'offre / réponse / candidats, pas le réseau.
class Hub { constructor() { this.sig = new Map(); } }
class FakeSignaling extends Emitter {
  constructor(hub, id) { super(); this.hub = hub; this.id = id; hub.sig.set(id, this); this.sent = []; this.peers = new Map(); }
  send(to, data) { this.sent.push({ to, data }); queueMicrotask(() => { const t = this.hub.sig.get(to); if (t) t.emit('signal', this.id, JSON.parse(JSON.stringify(data))); }); return true; }
}
const pcs = new Map();   // pc id → instance
class FakeChannel { constructor(label, opts) { this.label = label; this.opts = opts; this.readyState = 'connecting'; this.bufferedAmount = 0; this.sent = []; this.peer = null; }
  send(d) { this.sent.push(d); if (this.peer && this.peer.onmessage) { const data = typeof d === 'string' ? d : d; queueMicrotask(() => this.peer.onmessage({ data })); } }
  close() { this.readyState = 'closed'; if (this.onclose) this.onclose(); } }
let PC_N = 0;
class FakePC {
  constructor() { this.id = ++PC_N; this.channels = []; this.cands = []; this.remote = null; this.local = null; this.closed = false; pcs.set(this.id, this); }
  createDataChannel(label, opts) { const c = new FakeChannel(label, opts); this.channels.push(c); return c; }
  async createOffer() { return { type: 'offer', sdp: 'offer-' + this.id }; }
  async createAnswer() { return { type: 'answer', sdp: 'answer-' + this.id }; }
  async setLocalDescription(d) { this.local = d; this.localDescription = { ...d, toJSON() { return { type: d.type, sdp: d.sdp }; } }; setTimeout(() => this.onicecandidate && this.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'cand-' + this.id }) } }), 0); }
  async setRemoteDescription(d) {
    if (!d || !d.type) throw new Error('bad');
    this.remote = d;
    if (d.type === 'offer' && this.ondatachannel) {      // l'autre côté reçoit des canaux miroirs
      const other = [...pcs.values()].find((p) => p !== this && p.channels.length && !p.paired && p.local && p.local.sdp === d.sdp);
      if (other) { other.paired = true; this.paired = true; for (const c of other.channels) { const m = new FakeChannel(c.label, c.opts); m.peer = c; c.peer = m; this.channels.push(m); queueMicrotask(() => this.ondatachannel({ channel: m })); setTimeout(() => { m.readyState = 'open'; c.readyState = 'open'; m.onopen && m.onopen(); c.onopen && c.onopen(); }, 5); } }
    }
  }
  async addIceCandidate(c) { if (!this.remote) throw new Error('candidat avant la description distante'); this.cands.push(c); }
  close() { this.closed = true; }
}
await test('une seule offre par paire (le plus petit identifiant initie), candidats mis en file, canaux ouverts', async () => {
  const hub = new Hub();
  const sA = new FakeSignaling(hub, 'aaa'), sB = new FakeSignaling(hub, 'bbb');
  const got = { A: [], B: [] }, links = { A: [], B: [] };
  const mk = (id, sig, k) => new PeerMesh({ selfId: id, signaling: sig, RTC: FakePC, handlers: { onMessage: (from, kind, d) => got[k].push([from, kind, d]), onLink: (from, st) => links[k].push([from, st]) } });
  const mA = mk('aaa', sA, 'A'), mB = mk('bbb', sB, 'B');
  mA.addPeer('bbb'); mB.addPeer('aaa');                                  // les deux se voient en même temps
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(sA.sent.filter((m) => m.data.k === 'desc').length, 1, 'A (initiateur) envoie une offre');
  assert.equal(sB.sent.filter((m) => m.data.k === 'desc').length, 1, 'B envoie la réponse, pas une offre');
  assert.equal(sA.sent.find((m) => m.data.k === 'desc').data.d.type, 'offer');
  assert.equal(sB.sent.find((m) => m.data.k === 'desc').data.d.type, 'answer');
  const pcB = [...pcs.values()].at(-1); assert.ok(pcB.cands.length >= 1, 'candidat appliqué (après la description distante)');
  assert.deepEqual(links.A.at(-1), ['bbb', 'open']); assert.deepEqual(links.B.at(-1), ['aaa', 'open']);
  const chA = mA.links.get('bbb').state;
  assert.equal(chA.opts.ordered, false); assert.equal(chA.opts.maxRetransmits, 0, 'canal d\'état non fiable');
  assert.equal(mA.links.get('bbb').ctl.opts.ordered, true);
  // messages fiables et paquets d'état de bout en bout
  mA.sendCtl({ k: 'hi', n: 1 }); mA.broadcastState(new Uint8Array([1, 2, 3]).buffer);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got.B.find((g) => g[1] === 'ctl'), ['aaa', 'ctl', { k: 'hi', n: 1 }]);
  assert.ok(got.B.some((g) => g[1] === 'state'));
  // file d'envoi pleine : le paquet est sauté, pas empilé
  chA.bufferedAmount = 1e6; const before = chA.sent.length; mA.broadcastState(new ArrayBuffer(38)); assert.equal(chA.sent.length, before); assert.equal(mA.stats.skipped, 1);
  // départ d'un joueur
  mA.removePeer('bbb'); assert.equal(mA.links.has('bbb'), false);
});
await test('signalisation invalide ou tardive : ignorée sans planter', async () => {
  const hub = new Hub(); const s = new FakeSignaling(hub, 'aaa');
  const mesh = new PeerMesh({ selfId: 'aaa', signaling: s, RTC: FakePC, handlers: { onMessage() {}, onLink() {} } });
  for (const bad of [null, 5, 'x', { k: 'desc' }, { k: 'desc', d: { type: 'rien' } }, { k: 'ice', c: { candidate: 'x' } }]) s.emit('signal', 'zzz', bad);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(mesh.links.size, 0, 'aucune liaison pour un inconnu (TECH-045)');
});

console.log('Salon (hôte, jonction, version, départ)');
function fakeRoomEnv() {
  const peers = new Map();       // code → Map id → signaling
  const make = (id, code) => {
    const reg = peers.get(code) || peers.set(code, new Map()).get(code);
    const sig = new Emitter(); sig.peers = new Map(); sig.sentTo = []; sig.id = id;
    sig.join = async (meta) => { sig.meta = meta; for (const [oid, o] of reg) { sig.peers.set(oid, o.meta); } reg.set(id, sig); for (const [oid, o] of reg) if (oid !== id) { o.peers.set(id, meta); o.emit('join', id, meta); } };
    sig.track = (meta) => { sig.meta = meta; for (const [oid, o] of reg) if (oid !== id) { o.peers.set(id, meta); o.emit('meta', id, meta); } };
    sig.send = () => true;
    sig.leave = () => { reg.delete(id); for (const o of reg.values()) { o.peers.delete(id); o.emit('leave', id); } };
    return sig;
  };
  const meshes = [];
  const makeMesh = ({ selfId, handlers }) => { const m = { selfId, handlers, links: new Map(), ctl: [], state: [], addPeer(id) { this.added = (this.added || []).concat(id); }, removePeer() {}, closeAll() {}, sendCtl(msg, to) { this.ctl.push([msg, to]); }, broadcastState(b) { this.state.push(b); } }; meshes.push(m); return m; };
  return { make, makeMesh, meshes };
}
await test('salon (0.13.1) : voiture annoncée et filtrée, prêt compté, mode de l\'hôte vu par l\'invité, revanche demandée', async () => {
  const env = fakeRoomEnv();
  const opts = (name, car) => ({ name, car, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('Hôte', { body: 'muscle', color: '#ff4fd8' }), code: 'CAR234' });
  const guest = await Room.join('CAR234', opts('Invité', { body: 'kart', color: '#36e9ff', '<img>': 'x', long: 'y'.repeat(40) }));
  const g = host.members.get(guest.selfId);
  assert.deepEqual(g.car, { body: 'kart', color: '#36e9ff' }, 'clés et valeurs douteuses retirées');
  assert.deepEqual(cleanCarMeta('pas un objet'), null); assert.deepEqual(cleanCarMeta([1, 2]), null);
  for (const m of [host, guest]) for (const x of m.members.values()) x.link = 'open';
  assert.deepEqual(host.readyCount(), { ready: 0, total: 2 });
  guest.setReady(true);
  assert.deepEqual(host.readyCount(), { ready: 1, total: 2 });
  host.setMode('race');
  assert.equal(guest.hostMode, 'race', 'l\'invité voit le mode choisi');
  guest.setMode('free'); assert.equal(host.hostMode, 'race', 'seul l\'hôte choisit');
  guest.setWant('rematch');
  assert.deepEqual(host.wantCount(), { n: 1, total: 2 });
  guest.setWant(null); assert.deepEqual(host.wantCount(), { n: 0, total: 2 });
  host.leave(); guest.leave();
});

await test('voiture d\'un adversaire (0.13.1) : à son apparence ; vraie voiture qui garde ses couleurs en course à départ commun, fantôme de SA couleur en course libre', () => {
  const scene = { add() {} };
  const real = new RemoteCar(scene, { id: 'a', name: 'Ana', car: { body: 'muscle', color: '#ff4fd8' }, opaque: true });
  assert.equal(real.opaque, true); assert.equal('#' + real.baseColor.getHexString(), '#ff4fd8');
  const before = [...real.base.keys()].map((m) => m.color.getHex());
  real.setDistance(500);
  assert.deepEqual([...real.base.keys()].map((m) => m.color.getHex()), before, 'pas d\'assombrissement pour une vraie voiture');
  const ghost = new RemoteCar(scene, { id: 'b', name: 'Bea', car: { color: '#36e9ff' }, opaque: false });
  assert.equal(ghost.opaque, false); assert.equal('#' + ghost.baseColor.getHexString(), '#36e9ff');
  const old = new RemoteCar(scene, { id: 'c', name: 'Cid', colorIndex: 1 });
  assert.equal(old.opaque, false, 'sans apparence annoncée : couleur de joueur, comme avant');
  for (const r of [real, ghost, old]) r.dispose();
});

await test('créer puis rejoindre par code ; code inconnu, code pris, salle pleine, mauvaise version', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('Hôte'), code: 'ABC234' });
  assert.ok(host.isHost && host.code === 'ABC234');
  await assert.rejects(() => Room.create({ ...opts('Autre'), code: 'ABC234' }), (e) => e.code === 'taken');
  await assert.rejects(() => Room.join('zzz', opts('X')), (e) => e.code === 'bad-code');
  await assert.rejects(() => Room.join('QQQQQ2', opts('X')), (e) => e.code === 'not-found');
  const guest = await Room.join('abc 234', opts('Invité'));            // saisie tolérante
  assert.equal(guest.members.size, 1); assert.equal(host.members.size, 1);
  assert.ok(!guest.isHost && host.isHost);
  assert.equal(guest.mesh.added.length, 1, 'le joueur présent est ajouté au maillage');
  // version différente : l'hôte ne s'y connecte pas
  host.signaling.peers.set('old', { name: 'Vieux', v: PHYS_VER - 1 }); host._onPeer('old', { name: 'Vieux', v: PHYS_VER - 1 });
  assert.equal(host.members.get('old').link, 'incompatible');
  host._onPeer('old2', { name: 'Autre protocole', v: PHYS_VER, net: NET_VER - 1 });
  assert.equal(host.members.get('old2').link, 'incompatible', 'même physique mais autre protocole réseau');
  // hôte parti : migration vers l'identifiant le plus petit
  host.leave();
  assert.equal(guest.isHost, true, 'le seul restant devient hôte');
  guest.leave();
});
await test('le départ est donné par l\'hôte seulement, avec un délai commun', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const t = 1000; const now = () => t;
  const host = await Room.create({ ...opts('H'), code: 'ABC234', now }); const g = await Room.join('ABC234', { ...opts('G'), now });
  let started = null; g.on('start', (e) => { started = e; });
  host.selectTrack({ id: 'b-1-xyz', name: 'Premiers Éclats' });
  assert.deepEqual(host.mesh.ctl.at(-1)[0], { k: 'track', id: 'b-1-xyz', name: 'Premiers Éclats', sig: '', started: false });
  assert.equal(g.start(), false, 'un invité ne peut pas lancer');
  g.members.get(host.selfId).rtt = 80;
  g._onMessage(host.selfId, 'ctl', { k: 'track', id: 'b-1-xyz', name: 'Premiers Éclats' });
  g._onMessage(host.selfId, 'ctl', { k: 'start', trackId: 'b-1-xyz', startIn: 4000 });
  assert.equal(started.trackId, 'b-1-xyz'); assert.equal(started.startLocal, 1000 + 4000 - 40, 'départ = délai − demi-aller-retour');
  assert.equal(g.track.name, 'Premiers Éclats');
  started = null; g._onMessage('intrus', 'ctl', { k: 'start', trackId: 'x', startIn: 10 }); assert.equal(started, null, 'départ d\'un non-hôte ignoré');
  host.leave(); g.leave();
});

console.log('Boucle asynchrone : essais à son rythme, arrivants, circuits transmis');
await test('on peut rejoindre une salle où la course a déjà commencé : départ immédiat, sans attendre personne', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const t = 5000; const now = () => t;
  const host = await Room.create({ ...opts('H'), code: 'ABC234', now });
  host.selectTrack({ id: 'b-1-xyz', name: 'T' }); host.start();
  const g = await Room.join('ABC234', { ...opts('G'), now });                  // plus de refus « course en cours »
  let st = null; g.on('start', (e) => { st = e; });
  g._onMessage(host.selfId, 'ctl', { k: 'track', id: 'b-1-xyz', name: 'T', started: true });   // l'hôte renseigne le nouvel arrivant
  assert.ok(st && st.startLocal === 5000 + 1500, 'départ dans 1,5 s, à son propre rythme');
  assert.equal(g.state, 'racing');
  host.leave(); g.leave();
});
await test('chaque joueur garde son meilleur temps et son nombre d\'essais ; un temps synchronisé ne compte pas comme un essai', async () => {
  const env = fakeRoomEnv();
  const room = await Room.create({ name: 'H', code: 'ABC234', makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh, now: () => 5 });
  room.members.set('p', { id: 'p', name: 'Pierre', link: 'open', rtt: 0 }); room.members.set('q', { id: 'q', name: 'Quentin', link: 'open', rtt: 0 });
  room._onMessage('p', 'ctl', { k: 'finish', steps: 4800 }); room._onMessage('p', 'ctl', { k: 'finish', steps: 4700 }); room._onMessage('p', 'ctl', { k: 'finish', steps: 4900 });
  room._onMessage('q', 'ctl', { k: 'finish', steps: 5000, sync: true });
  room._onMessage('q', 'ctl', { k: 'finish', steps: -4 }); room._onMessage('q', 'ctl', { k: 'finish', steps: 1e9 }); room._onMessage('q', 'ctl', { k: 'finish', steps: 'x' });
  const p = room.results.get('p'); assert.deepEqual([p.best, p.last, p.n], [4700, 4900, 3]);
  const q = room.results.get('q'); assert.deepEqual([q.best, q.n], [5000, 0]);
  assert.deepEqual(room.ranking().map((r) => r.name), ['Pierre', 'Quentin', 'H']);
  assert.equal(room.reportFinish(4600), true, 'nouveau meilleur temps'); assert.equal(room.reportFinish(4650), false);
  assert.deepEqual(room.ranking().map((r) => r.name), ['H', 'Pierre', 'Quentin']);
  assert.equal(room.results.get(room.selfId).n, 2);
  // un nouvel arrivant reçoit mon meilleur temps
  room.members.set('z', { id: 'z', name: 'Zoé', link: 'connecting', rtt: 0 });
  room._onLink('z', 'open');
  assert.deepEqual(room.mesh.ctl.at(-1), [{ k: 'finish', steps: 4600, sync: true }, 'z']);
  room.leave();
});
await test('retour au salon : propre à ce joueur, les autres ne sont pas interrompus', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('H'), code: 'ABC234' });
  host.selectTrack({ id: 'b-1-xyz', name: 'T' }); host.start();
  const before = host.mesh.ctl.length;
  host.backToLobby();
  assert.equal(host.state, 'lobby'); assert.equal(host.mesh.ctl.length, before, 'aucun message envoyé aux autres');
  assert.equal(host.meta.racing, false);
  host.leave();
});
await test('circuit envoyé par l\'hôte (code de circuit) : morceaux, assemblage, refus des morceaux douteux', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('H'), code: 'ABC234' }); const g = await Room.join('ABC234', opts('G'));
  const code = 'SHW3:' + 'x'.repeat(29995);                                     // ~30 Ko : 3 morceaux de 12 Ko
  host.selectTrack({ id: 'u:abc', name: 'Mon circuit', sig: 'abc', code });
  const sent = host.mesh.ctl.map((c) => c[0]);
  assert.equal(sent[0].k, 'track'); const chunks = sent.filter((m) => m.k === 'tcode'); assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.d.length <= 12000 && c.n === 3));
  let got = null; g.on('trackcode', (id) => { got = id; });
  const waiter = g.waitForCode('u:abc', 500);
  for (const c of [chunks[2], chunks[0]]) g._onMessage(host.selfId, 'ctl', c);   // dans le désordre
  g._onMessage('intrus', 'ctl', chunks[1]);                                       // pas l'hôte : ignoré
  assert.equal(got, null);
  g._onMessage(host.selfId, 'ctl', chunks[1]);
  assert.equal(await waiter, code); assert.equal(got, 'u:abc');
  g._onMessage(host.selfId, 'ctl', { k: 'tcode', id: 'u:evil', i: 0, n: 9999, d: 'x' });          // trop de morceaux
  g._onMessage(host.selfId, 'ctl', { k: 'tcode', id: 'u:evil', i: 0, n: 1, d: 'x'.repeat(50000) }); // morceau trop gros
  g._onMessage(host.selfId, 'ctl', { k: 'tcode', id: 'b-faux', i: 0, n: 1, d: 'x' });               // pas un circuit 'u:'
  assert.equal(g.trackCodes.has('u:evil') || g.trackCodes.has('b-faux'), false);
  assert.throws(() => host.selectTrack({ id: 'u:big', name: 'x', code: 'y'.repeat(400001) }), (e) => e.code === 'too-big');
  await assert.rejects(() => g.waitForCode('u:jamais', 30), (e) => e.code === 'no-code');
  // nouvel arrivant : l'hôte renvoie circuit ET morceaux
  host.mesh.ctl.length = 0; host.members.set('n', { id: 'n', name: 'N', link: 'open', rtt: 0 }); host._onLink('n', 'open');
  assert.deepEqual(host.mesh.ctl.map((c) => c[0].k + (c[1] ? '>' + c[1] : '')), ['hello>n', 'track>n', 'tcode>n', 'tcode>n', 'tcode>n'], 'bonjour (E16), puis circuit et morceaux');
  host.leave(); g.leave();
});
await test('paquets d\'état : anti-inondation', async () => {
  const env = fakeRoomEnv();
  const room = await Room.create({ name: 'H', code: 'ABC234', makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh, now: () => 5 });
  let n = 0; room.on('snapshot', () => n++);
  const ab = packSnapshot(snap(1, 0));
  for (let i = 0; i < 300; i++) room._onMessage('p', 'state', ab);
  assert.equal(n, 80, 'au plus 80 paquets par seconde et par joueur');
  room._onMessage('p', 'state', new ArrayBuffer(5)); assert.equal(n, 80);
  room.leave();
});
await test('nouvel essai : l\'horloge d\'envoi ne recule pas et la téléportation est signalée (pas de paquet « trop ancien »)', () => {
  // Un joueur qui recommence : son horloge de course repart de 0 mais son horloge d'envoi (netTick) continue.
  const buf = new SnapshotBuffer();
  const feed2 = (tick, x, tele) => buf.push(unpackSnapshot(packSnapshot(snap(tick, x, { tele }))), tick * DT * 1000 + 30);
  for (let k = 0; k <= 10; k++) feed2(k * 6, k * 20, 0);                     // essai 1 : va de 0 à 200
  for (let k = 11; k <= 20; k++) feed2(k * 6, 5 + (k - 11) * 20, 1);         // essai 2 : retour au départ, tele = 1
  let tp = 0; for (let ms = 0; ms < 20 * 6 * DT * 1000 + 300; ms += 8) { if (buf.sample(ms + 30).teleported) tp++; }
  assert.equal(tp, 1); assert.equal(buf.length, 21, 'aucun paquet refusé');
  // le piège : si l\'horloge reculait, les paquets du nouvel essai seraient rejetés comme périmés
  const bad = new SnapshotBuffer(); feed.call(null, bad, [snap(600, 0)]); assert.equal(bad.push(unpackSnapshot(packSnapshot(snap(5, 0, { tele: 1 }))), 5000), false, 'rappel : une horloge qui recule est refusée');
});

// ---- Banc simulé : horloge virtuelle, faux Supabase Realtime (présence par connexion), faux WebRTC (tools/fake-realtime.mjs) ----------------------------
// Chaque scénario remplace setTimeout / setInterval / Date.now par l'horloge virtuelle le temps de son exécution : les battements de 25 s, le délai de 6 s, la place
// gardée 20 s, l'expiration d'un jeton se jouent en quelques millisecondes. Le comportement réel du serveur n'est PAS observé ici (voir supabase/MULTI.md).
const URL_RT = 'https://fake.supabase.co', KEY_RT = 'cle-publique';
const topicOf = (code) => 'realtime:copytrack-room-' + code;
async function scenario(fn, { rtc: rtcOpts = {} } = {}) {
  const clock = new VirtualClock(); const restore = clock.install();
  const rt = new FakeRealtime(clock), rtc = new FakeRTCNet(clock, rtcOpts);
  const rooms = [];
  const sigOf = (client, o = {}) => ({ code, selfId, observe }) => new SupabaseSignaling({ code, selfId, observe, WebSocketImpl: rt.socket(client), url: URL_RT, key: KEY_RT, getToken: o.getToken || rt.tokenSource(client, o.ttl || 3600000) });
  const opts = (client, o = {}) => ({ name: client[0].toUpperCase() + client.slice(1), selfId: client, now: clock.now, makeSignaling: sigOf(client, o), makeMesh: (m) => new PeerMesh({ ...m, RTC: rtc.pc(client) }), ...(o.getIce ? { getIce: o.getIce } : {}) });
  const w = {
    clock, rt, rtc, rooms, sigOf,
    host: async (client, code = 'ABC234', o) => { const r = await clock.until(Room.create({ ...opts(client, o), code })); rooms.push(r); return r; },
    join: async (client, code = 'ABC234', o) => { const r = await clock.until(Room.join(code, opts(client, o))); rooms.push(r); return r; },
    linked: (a, b) => !!(a.members.get(b.selfId) && a.members.get(b.selfId).link === 'open' && b.members.get(a.selfId) && b.members.get(a.selfId).link === 'open'),
    raw: (client, selfId, o = {}) => new SupabaseSignaling({ code: o.code || 'ABC234', selfId, observe: !!o.observe, WebSocketImpl: rt.socket(client), url: URL_RT, key: KEY_RT, getToken: o.getToken || null }),
  };
  try { await fn(w); } finally {
    for (const r of rooms) { try { r.leave(); } catch { /* déjà sortie */ } }
    try { await clock.advance(500); } catch { /* rien */ }
    restore();
  }
}
const pres = (w, code = 'ABC234') => w.rt.presence(topicOf(code));

console.log('Banc simulé : présence par connexion (TECH-011)');
await test('présence (TECH-011) : join, meta, leave pour une même clé (deux connexions) : le pair est conservé', async () => {
  const sig = new SupabaseSignaling({ code: 'ABC234', selfId: 'me', WebSocketImpl: FakeWS, url: 'https://x.supabase.co', key: 'K' });
  const left = []; sig.on('leave', (id) => left.push(id));
  const p = sig.join({ name: 'Moi' });
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWS.last, j = ws.sent[0], T = j.topic;
  ws.recv({ topic: T, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: j.ref });
  ws.recv({ topic: T, event: 'presence_state', payload: { bob: { metas: [{ phx_ref: 'b1', name: 'Bob' }] } } });
  await p;
  try {
    precondition(sig.peers.has('bob'), 'Bob présent');
    // Bob se reconnecte : sa nouvelle connexion (b2) arrive AVANT que le serveur ait fermé l'ancienne (b1) ; il met à jour sa présence sur la nouvelle (b3 remplace b2).
    ws.recv({ topic: T, event: 'presence_diff', payload: { joins: { bob: { metas: [{ phx_ref: 'b2', name: 'Bob' }] } }, leaves: {} } });
    ws.recv({ topic: T, event: 'presence_diff', payload: { joins: { bob: { metas: [{ phx_ref: 'b3', phx_ref_prev: 'b2', name: 'Bob', ready: true }] } }, leaves: { bob: { metas: [{ phx_ref: 'b2', name: 'Bob' }] } } } });
    // Le serveur ferme enfin l'ancienne connexion.
    ws.recv({ topic: T, event: 'presence_diff', payload: { joins: {}, leaves: { bob: { metas: [{ phx_ref: 'b1', name: 'Bob' }] } } } });
    assert.ok(sig.peers.has('bob'), 'Bob a encore une connexion : il est toujours là');
    assert.deepEqual(left, [], 'aucun départ annoncé');
    assert.equal(sig.peers.get('bob').ready, true, 'métadonnées de la connexion la plus récente');
    ws.recv({ topic: T, event: 'presence_diff', payload: { joins: {}, leaves: { bob: { metas: [{ phx_ref: 'b3', name: 'Bob' }] } } } });
    assert.deepEqual(left, ['bob'], 'sa dernière connexion fermée : il part');
  } finally { sig.leave(); }
});

await test('reconnexion avant que le serveur ait fermé l\'ancienne connexion (TECH-011, TECH-046) : aucun faux départ, liaison gardée', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  w.rt.cut('bea', 1000);                                 // le réseau de Bea saute 1 s : son navigateur voit la fermeture, le serveur ne retire l'ancienne connexion qu'après 30 s
  await w.clock.advance(8000);
  precondition(!bea.reconnecting && !bea.closed, 'Bea est revenue par une nouvelle connexion');
  precondition(pres(w).get('bea') === 2, 'le serveur a deux connexions de la clé « bea »');
  await w.clock.advance(30000);                          // le serveur retire l'ancienne connexion
  assert.ok(ana.signaling.peers.has('bea'), 'Ana voit toujours Bea');
  await w.clock.advance(25000);
  assert.ok(ana.members.has('bea') && ana.members.get('bea').link === 'open', 'Bea n\'est ni marquée absente ni retirée : ' + JSON.stringify(ana.members.get('bea') && ana.members.get('bea').link));
}));

console.log('Banc simulé : fermeture, erreur, expiration, battements (TECH-012)');
const lossCase = (label, hurt) => test(label + ' (TECH-012) : _lost se déclenche et la reconnexion démarre', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  let lost = 0; bea.on('reconnecting', () => lost++);
  const joins = w.rt.count('bea', 'phx_join');
  await hurt(w);
  assert.ok(lost >= 1, label + ' : la perte est détectée (_lost)');
  await w.clock.advance(20000);
  assert.ok(w.rt.count('bea', 'phx_join') > joins, 'une nouvelle connexion a été tentée');
  assert.equal(bea.reconnecting, false, 'reconnectée'); assert.equal(bea.closed, false);
  assert.ok(pres(w).has('bea') && ana.signaling.peers.has('bea'), 'de nouveau présente');
}));
await lossCase('phx_close', async (w) => { w.rt.pushClose('bea'); await w.clock.advance(500); });
await lossCase('phx_error', async (w) => { w.rt.pushError('bea'); await w.clock.advance(500); });
await lossCase('message « system » : jeton expiré', async (w) => { w.rt.expire('bea'); await w.clock.advance(500); });
await lossCase('battements sans réponse (connexion morte sans fermeture)', async (w) => { w.rt.cut('bea', 15000, { mode: 'silent' }); await w.clock.advance(40000); });
await test('jeton d\'accès du canal renouvelé avant expiration (TECH-012 ; jetons de 2 min, 6 min de jeu)', () => scenario(async (w) => {
  const ana = await w.host('ana', 'ABC234', { ttl: 120000 }), bea = await w.join('bea', 'ABC234', { ttl: 120000 });     // jetons de 2 minutes
  let lost = 0; for (const r of [ana, bea]) r.on('reconnecting', () => lost++);
  for (let t = 0; t < 6; t++) { await w.clock.advance(60000); assert.ok(pres(w).has('ana') && pres(w).has('bea'), `toujours présents après ${t + 1} min`); }
  assert.ok(w.rt.count('ana', 'access_token') >= 2 && w.rt.count('bea', 'access_token') >= 2, 'jeton du canal renouvelé avant expiration');
  assert.equal(lost, 0, 'aucune coupure : le serveur n\'a jamais fermé le canal');
}));

test('tokenExpiry : échéance d\'un JWT (base64url, sans remplissage) ; null si le jeton est illisible', () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.equal(tokenExpiry(enc({ alg: 'HS256' }) + '.' + enc({ exp: 1800000123, sub: 'é?>' }) + '.x'), 1800000123000);
  for (const bad of [null, '', 'TOK', 'a.b.c', 'a.' + enc({ sub: 'x' }) + '.c', 'a.' + enc({ exp: 'demain' }) + '.c']) assert.equal(tokenExpiry(bad), null, String(bad));
});

console.log('Banc simulé : tentatives abandonnées (TECH-044, TECH-082)');
await test('délai dépassé puis réponse tardive (TECH-044) : connexion fermée, aucune présence publiée', () => scenario(async (w) => {
  w.rt.joinDelay = 8000;                                 // la réponse arrive après le délai de 6 s du client
  const sig = w.raw('zed', 'zed');
  await assert.rejects(w.clock.until(sig.join({ name: 'Zed' }), 7000), /ne répond pas/);
  await w.clock.advance(60000);
  assert.equal(pres(w).has('zed'), false, 'aucune présence publiée par la réponse tardive');
  assert.equal(w.rt.connections('zed'), 0, 'connexion fermée');
  assert.equal(w.rt.count('zed', 'heartbeat'), 0, 'aucun battement');
}));
await test('reconnexion (TECH-044) : la tentative abandonnée (délai) ne laisse ni connexion ni présence fantôme', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  w.rt.joinDelay = 8000;                                 // la première tentative de reconnexion de Bea n'aura sa réponse qu'après son délai
  w.rt.cut('bea', 500);
  await w.clock.advance(5000);
  w.rt.joinDelay = 0;
  await w.clock.advance(60000);
  precondition(!bea.closed && !bea.reconnecting, 'Bea reconnectée');
  assert.equal(w.rt.connections('bea'), 1, 'une seule connexion : la tentative abandonnée est fermée');
  assert.equal(pres(w).get('bea'), 1, 'une seule présence');
  void ana;
}));
await test('annuaire (TECH-044) : l\'écoute qui dépasse le délai est fermée', () => scenario(async (w) => {
  w.rt.joinDelay = 8000;
  const dir = new PublicDirectory({ makeSignaling: ({ selfId, observe }) => w.raw('obs', selfId, { code: LOBBY_CODE, observe }), selfId: 'o' });
  await assert.rejects(w.clock.until(dir.watch(() => {}), 7000));
  await w.clock.advance(60000);
  assert.equal(w.rt.connections('obs'), 0, 'connexion de l\'annuaire fermée');
  assert.equal(w.rt.count('obs', 'heartbeat'), 0, 'aucun battement');
}));
const listing = (code) => ({ code, host: 'Ana', track: 'Un', players: 1, max: 8, mode: 'free', round: 0, rounds: 0, v: PHYS_VER, net: NET_VER });
await test('retrait pendant l\'annonce (TECH-082) : aucun salon listé, aucune erreur', () => scenario(async (w) => {
  const slow = async () => { await new Promise((r) => setTimeout(r, 500)); return w.rt.issueToken('hote', 3600000); };      // jeton lent à venir
  const dir = new PublicDirectory({ makeSignaling: ({ selfId, observe }) => w.raw('hote', selfId, { code: LOBBY_CODE, observe, getToken: slow }), selfId: 'h' });
  const p = dir.announce(listing('ABC234'));
  await w.clock.advance(100);
  dir.retract();                                         // l'hôte décoche « Salon public » pendant l'annonce
  const r = await w.clock.until(p.then(() => 'ok', (e) => e), 10000);
  await w.clock.advance(3000);
  assert.equal(pres(w, LOBBY_CODE).size, 0, 'aucun salon listé');
  assert.equal(w.rt.connections('hote'), 0, 'connexion fermée');
  assert.equal(r, 'ok', 'un retrait voulu n\'est pas une erreur');
  const watcher = new PublicDirectory({ makeSignaling: ({ selfId, observe }) => w.raw('obs', selfId, { code: LOBBY_CODE, observe }), selfId: 'o' });
  let rows = null; const stop = await w.clock.until(watcher.watch((x) => { rows = x; }));
  assert.deepEqual(rows, [], 'l\'annuaire est vide');
  stop();
}));
await test('retrait pendant l\'annonce (TECH-082), signalisation qui ne sait pas abandonner : fermée dès la fin de la jonction', async () => {
  const live = new Set();
  const make = ({ selfId }) => { const sig = new Emitter(); sig.peers = new Map(); sig.join = async () => { await new Promise((r) => setTimeout(r, 30)); live.add(selfId); }; sig.leave = () => { live.delete(selfId); }; sig.track = () => {}; return sig; };
  const dir = new PublicDirectory({ makeSignaling: make, selfId: 'h' });
  const p = dir.announce(listing('ABC234'));
  dir.retract();
  await p;
  assert.equal(live.size, 0, 'la connexion qui a fini par aboutir est refermée');
  await dir.announce(listing('ABC234')); assert.equal(live.size, 1, 'une nouvelle annonce marche'); dir.close(); assert.equal(live.size, 0);
});

console.log('Banc simulé : signalisation des seuls membres (TECH-045)');
await test('signalisation (TECH-045) : un non-membre ne crée aucun lien ; un candidat tardif d\'un joueur parti non plus', () => scenario(async (w) => {
  const ana = await w.host('ana');
  const intrus = w.raw('intrus', 'intrus', { observe: true });       // abonné au canal, absent de la présence
  await w.clock.until(intrus.join({}));
  const forge = (from, data) => intrus._send(intrus.topic, 'broadcast', { type: 'broadcast', event: 'signal', payload: { from, to: 'ana', data } });
  for (let i = 0; i < 7; i++) forge('faux' + i, { k: 'ice', c: { candidate: 'candidate:1 u1s1' } });
  await w.clock.advance(1000);
  assert.equal(ana.mesh.links.size, 0, 'sept messages d\'un non-membre : aucun lien');
  const bea = await w.join('bea');
  await w.clock.advance(3000);
  assert.ok(w.linked(ana, bea), 'un vrai joueur se relie toujours');
  bea.leave();                                          // départ (au revoir) ; un candidat ICE tardif de sa part ne doit rien recréer
  await w.clock.advance(1000);
  precondition(!ana.members.has('bea'), 'Bea est partie');
  forge('bea', { k: 'ice', c: { candidate: 'candidate:2 u2s1' } });
  forge('bea', { k: 'desc', d: { type: 'offer', sdp: 'v=0' } });
  await w.clock.advance(1000);
  assert.equal(ana.mesh.links.has('bea'), false, 'aucun lien recréé pour un joueur parti');
  ana.mesh.addPeer('orphelin');                        // une liaison sans membre (ne devrait plus exister) : nettoyée au tour suivant
  await w.clock.advance(2500);
  assert.equal(ana.mesh.links.has('orphelin'), false, 'liaison orpheline fermée');
  intrus.leave();
}));

console.log('Banc simulé : liens de jeu découplés de la signalisation (TECH-046)');
const racing = (w, r) => { let tick = 0; return w.clock.setInterval(() => { if (!r.closed) r.sendSnapshot(snap(tick += 6, tick / 10)); }, 50); };
await test('coupure de la signalisation (TECH-046, 5 s) : liens WebRTC ouverts, voitures non figées, arrivée reçue', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  const pcA = ana.mesh.links.get('bea').pc, pcB = bea.mesh.links.get('ana').pc;
  let snaps = 0; ana.on('snapshot', (id) => { if (id === 'bea') snaps++; });
  const send = racing(w, bea);
  w.rt.cut('bea', 5000);                                 // coupure de 5 s de la SIGNALISATION seule
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const before = snaps;
    if (i === 4) bea.reportFinish(4321);                 // une arrivée (course libre) pendant la coupure
    await w.clock.advance(500);
    seen.push([ana.members.get('bea').link, bea.members.get('ana').link, snaps - before]);
  }
  w.clock.clearInterval(send);
  assert.ok(seen.every(([a, b, n]) => a === 'open' && b === 'open' && n > 0), 'liens ouverts et voiture non figée pendant la coupure : ' + JSON.stringify(seen));
  assert.ok(ana.mesh.links.get('bea').pc === pcA && bea.mesh.links.get('ana').pc === pcB, 'mêmes connexions WebRTC');
  assert.equal(ana.results.get('bea') && ana.results.get('bea').n, 1, 'l\'arrivée envoyée pendant la coupure est reçue');
  await w.clock.advance(10000);
  assert.equal(bea.reconnecting, false, 'signalisation retrouvée');
}));
await test('vraie coupure (TECH-046 ; signalisation et liens, 12 s) : liaison refaite, arrivée renvoyée après reconnexion', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  w.rt.cut('bea', 12000); w.rtc.cut('bea');              // vraie coupure du réseau de Bea (signalisation ET pair à pair), 12 s
  w.clock.setTimeout(() => w.rtc.heal('bea'), 12000);
  await w.clock.advance(4000);
  bea.reportFinish(4321);                                // arrivée annoncée pendant la coupure
  await w.clock.advance(40000);
  assert.ok(w.linked(ana, bea), 'liaison refaite après la coupure');
  assert.equal(ana.results.get('bea') && ana.results.get('bea').n, 1, 'l\'arrivée faite pendant la coupure est renvoyée et comptée');
  assert.equal(ana.results.get('bea').best, 4321);
}));
await test('panne du lien seul (TECH-046) : détectée, refaite quand le chemin revient', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  w.rtc.cut('bea');                                      // seul le chemin pair à pair tombe (40 s) ; la signalisation marche
  await w.clock.advance(40000);
  w.rtc.heal('bea');
  await w.clock.advance(20000);
  assert.ok(w.linked(ana, bea), 'la liaison en panne est refaite et rouverte des deux côtés : ' + ana.members.get('bea').link + ' / ' + bea.members.get('ana').link);
}));
await test('signalisation absente 40 s, liaisons saines (TECH-046) : la salle reste ouverte, la reconnexion continue (délais bornés) puis aboutit', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  w.rt.cut('bea', 40000);
  await w.clock.advance(39000);
  assert.equal(bea.closed, false, 'au-delà des 20 s, la salle reste ouverte : la liaison avec Ana marche');
  assert.equal(bea.reconnecting, true);
  assert.ok(w.linked(ana, bea), 'liaison ouverte pendant toute la coupure');
  await w.clock.advance(1000 + RETRY_MS[RETRY_MS.length - 1] + 1000);       // fin de la coupure + une attente bornée (la plus longue) + la jonction
  assert.equal(bea.reconnecting, false, 'reconnectée au plus une attente maximale après la fin de la coupure'); assert.ok(pres(w).has('bea'));
}));
await test('sans aucune liaison ouverte, la reconnexion abandonne après les 20 s de place gardée (inchangé)', () => scenario(async (w) => {
  w.rt.ghostMs = 5000;                                   // (le serveur retire la connexion morte au bout de 5 s ; Ana ne peut rendre la place qu'après l'avoir vue partir)
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(2000);
  w.rt.cut('bea', 120000); w.rtc.cut('bea');
  await w.clock.advance(RESUME_MS + 15000);
  assert.equal(bea.closed, true, 'Bea, isolée, a fini par sortir');
  assert.equal(ana.members.has('bea'), false, 'sa place est rendue chez Ana');
}));

console.log('Banc simulé : serveurs ICE (TECH-050)');
await test('serveurs ICE (TECH-050) redemandés quand leur durée est presque écoulée : arrivant tardif, liaison refaite', () => scenario(async (w) => {
  const loader = () => { let n = 0; return createIceLoader({ url: 'https://x.test/ice', key: 'k', fallback: [{ urls: ['stun:s.example:3478'] }], now: w.clock.now,
    fetchImpl: async () => { n++; return new Response(JSON.stringify({ iceServers: [{ urls: ['turn:t.example:3478'], username: 'u' + n, credential: 'c' + n }], ttl: 600 }), { status: 200 }); } }); };
  const ana = await w.host('ana', 'ABC234', { getIce: loader() });
  await w.clock.advance(500000);                         // 500 s : au-delà des 3/4 de la durée de vie (600 s) des identifiants
  const bea = await w.join('bea', 'ABC234', { getIce: loader() });
  await w.clock.advance(3000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  const cfg = ana.mesh.links.get('bea').pc.getConfiguration();
  assert.equal(cfg.iceServers[0].credential, 'c2', 'la liaison créée après 500 s utilise des identifiants TURN redemandés');
  // Liaison tombée puis refaite après l'échéance des identifiants c2 (obtenus à 500 s, valables jusqu'à 950 s) : la connexion neuve en a d'autres.
  await w.clock.advance(460000);
  w.rtc.cut('bea'); await w.clock.advance(15000); w.rtc.heal('bea'); await w.clock.advance(20000);
  precondition(w.linked(ana, bea), 'liaison refaite');
  assert.equal(ana.mesh.links.get('bea').pc.getConfiguration().iceServers[0].credential, 'c3', 'liaison refaite avec des identifiants redemandés');
}));
await test('serveurs ICE (TECH-050) : une relance ICE garde sa connexion et prend des identifiants à jour', () => scenario(async (w) => {
  let n = 0;
  const getIce = createIceLoader({ url: 'https://x.test/ice', key: 'k', fallback: [{ urls: ['stun:s.example:3478'] }], now: w.clock.now,
    fetchImpl: async () => { n++; return new Response(JSON.stringify({ iceServers: [{ urls: ['turn:t.example:3478'], username: 'u' + n, credential: 'c' + n }], ttl: 600 }), { status: 200 }); } });
  const ana = await w.host('ana', 'ABC234', { getIce }), bea = await w.join('bea', 'ABC234', { getIce });
  await w.clock.advance(3000);
  precondition(w.linked(ana, bea), 'liaison ouverte');
  await w.clock.advance(460000);                         // les identifiants ont dépassé les 3/4 de leur durée
  const pc = ana.mesh.links.get('bea').pc;
  w.rtc.cut('bea'); await w.clock.advance(2500); w.rtc.heal('bea');         // échec ICE au bout de 2 s (réseau qui change) : Ana, initiatrice, relance
  await w.clock.advance(3000);
  assert.equal(ana.mesh.links.get('bea').pc, pc, 'même connexion (relance ICE, pas une connexion neuve)');
  assert.equal(pc.getConfiguration().iceServers[0].credential, 'c2', 'la relance a pris des identifiants redemandés');
  assert.ok(w.linked(ana, bea), 'liaison de nouveau ouverte');
}, { rtc: { disconnectMs: 1000, failMs: 2000 } }));
await test('serveurs ICE : sans réponse du chargeur, une liaison n\'attend pas plus de 2,5 s (derniers serveurs connus)', () => scenario(async (w) => {
  const never = () => new Promise(() => {});
  const ana = await w.host('ana', 'ABC234', { getIce: never }), bea = await w.join('bea', 'ABC234', { getIce: never });
  await w.clock.advance(4000);
  assert.ok(w.linked(ana, bea), 'reliés avec les serveurs par défaut');
}));

console.log('Banc simulé : capacité (TECH-086)');
await bugConnu('TECH-086', () => scenario(async (w) => {
  w.rt.ghostMs = 2000;
  const ids = ['ana', 'bea', 'cid', 'dan', 'eve', 'fay', 'gus', 'hal'];
  const rooms = [await w.host('ana')];
  for (const id of ids.slice(1)) rooms.push(await w.join(id));
  await w.clock.advance(5000);
  precondition(rooms.every((r) => r.members.size === 7 && [...r.members.values()].every((m) => m.link === 'open')), 'huit joueurs reliés');
  w.rt.cut('hal', 13000); w.rtc.cut('hal');              // Hal perd le réseau : sa place est gardée
  w.clock.setTimeout(() => w.rtc.heal('hal'), 13000);
  await w.clock.advance(12500);
  precondition(rooms[0].members.get('hal').link === 'away', 'Hal est absent (place gardée)');
  const ivy = await w.join('ivy');                       // un 9e arrive
  await w.clock.advance(1500);
  assert.equal(rooms[0].members.has('ivy'), false, 'le 9e n\'est pas admis : la salle est pleine, place gardée comprise');
  assert.ok(rooms.slice(0, 7).every((r) => !r.mesh.links.has('ivy')), 'aucun lien pour le 9e');
  await w.clock.advance(15000);
  assert.ok(rooms.slice(0, 7).every((r) => r.members.get('hal') && r.members.get('hal').link === 'open'), 'Hal revenu retrouve sa place et ses liaisons');
  void ivy;
}), 'salle à 8 avec un absent : le 9e est refusé, l\'absent retrouve sa place');

await test('banc : aucun jeton dans les journaux (connexion, renouvellement, expiration)', () => scenario(async (w) => {
  const out = [];
  const saved = {}; for (const k of ['log', 'warn', 'error', 'info', 'debug']) { saved[k] = console[k]; console[k] = (...a) => { out.push(a.map(String).join(' ')); }; }
  try {
    const ana = await w.host('ana', 'ABC234', { ttl: 120000 }); const bea = await w.join('bea', 'ABC234', { ttl: 120000 });
    await w.clock.advance(300000); w.rt.expire('bea'); await w.clock.advance(20000);
    void ana; void bea;
  } finally { for (const k of Object.keys(saved)) console[k] = saved[k]; }
  precondition(w.rt.issued.length >= 2, 'des jetons ont circulé');
  const leaks = out.filter((line) => w.rt.issued.some((t) => line.includes(t) || line.includes(t.split('.')[1])));
  assert.deepEqual(leaks, []);
}));

await finish('Tous les tests réseau passent.');
