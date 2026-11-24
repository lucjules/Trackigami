// Tests du multijoueur (sans navigateur) : node tools/test-net.mjs   (npm test)
// Les vraies connexions WebRTC sont essayées à part dans Chromium (deux onglets) ; ici : la logique.
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { DT } from '../js/constants.js';
import { packSnapshot, unpackSnapshot, SNAPSHOT_BYTES, F_FINISHED } from '../js/net/snapshot.js';
import { SnapshotBuffer } from '../js/net/interp.js';
import { RemoteCar, darkness, FADE_NEAR, FADE_FAR, MAX_DARKEN } from '../js/remoteCar.js';
import { SupabaseSignaling, Emitter, tokenExpiry } from '../js/net/signaling.js';
import { PeerMesh, fingerprintOf } from '../js/net/transport.js';
import { Room, cleanCarMeta, newRoomCode, normalizeCode, ROOM_RE } from '../js/net/room.js';
import { RESUME_MS, RETRY_MS } from '../js/net/resume.js';
import { RaceLogic } from '../js/raceLogic.js';
import { Track } from '../js/track.js';
import { PHYS_VER, NET_VER } from '../js/version.js';
import { test, finish, precondition, bugConnu } from './harness.mjs';
import { VirtualClock, FakeRealtime, FakeRTCNet } from './fake-realtime.mjs';
import { PublicDirectory, LOBBY_CODE } from '../js/net/directory.js';
import { createIceLoader } from '../js/net/ice.js';
import { createIdentity, prove, proofText, descText, iceText, identityBusy } from '../js/net/identity.js';
import { readFileSync } from 'node:fs';
import { netMethods } from '../js/race/net.js';
import { softCollide, presentState, MAX_DV_TOTAL, MAX_IMPULSE } from '../js/net/collide.js';
import { ProgressTracker } from '../js/net/progress.js';
import { DEFAULT_LOADOUT } from '../js/cosmetics.js';

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
await test('candidats ICE signés (TECH-040) : seuls ceux que vetIce accepte sont appliqués, qu\'ils arrivent avant ou après la description distante ; ils partent avec leur preuve', async () => {
  const hub = new Hub();
  const sA = new FakeSignaling(hub, 'aaa'), sB = new FakeSignaling(hub, 'bbb');
  const vetted = [];
  const mk = (id, sig, o = {}) => new PeerMesh({ selfId: id, signaling: sig, RTC: FakePC, handlers: { onMessage() {}, onLink() {} }, ...o });
  const mA = mk('aaa', sA, { sealIce: async (to, c, fp) => ({ pub: 'P', sig: 'S:' + to + ':' + fp }) });
  const mB = mk('bbb', sB, { vetIce: async (from, c, p, fp) => { vetted.push([from, p && p.sig, fp]); return !!p && p.pub === 'P'; } });
  mA.addPeer('bbb'); mB.addPeer('aaa');
  await new Promise((r) => setTimeout(r, 60));
  const sentIce = sA.sent.filter((m) => m.data.k === 'ice');
  assert.ok(sentIce.length >= 1 && sentIce.every((m) => m.data.p && m.data.p.pub === 'P' && /^S:bbb:/.test(m.data.p.sig)), 'chaque candidat envoyé porte sa preuve (destinataire et empreinte de ma connexion)');
  const pcB = [...pcs.values()].at(-1), n0 = pcB.cands.length;
  assert.ok(n0 >= 1 && vetted.length >= 1, 'les candidats signés sont appliqués après vérification');
  // un candidat d'un autre (non signé, ou signé par une autre clé), avant ou après la description distante : jamais appliqué
  sB.emit('signal', 'aaa', { k: 'ice', c: { candidate: 'candidate:9 9 udp 1 6.6.6.6 9 typ host' } });
  sB.emit('signal', 'aaa', { k: 'ice', c: { candidate: 'candidate:9 9 udp 1 6.6.6.6 9 typ host' }, p: { pub: 'AUTRE', sig: 'x' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(pcB.cands.length, n0, 'candidats non signés ou signés par une autre clé : écartés');
  sB.emit('signal', 'aaa', { k: 'ice', c: { candidate: 'candidate:8 8 udp 1 10.0.0.9 9 typ host' }, p: { pub: 'P', sig: 'ok' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(pcB.cands.length, n0 + 1, 'un candidat vérifié est appliqué');
  mA.closeAll(); mB.closeAll();
});
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
    sig.track = (meta) => { sig.meta = meta; if (reg.get(id) !== sig) return; for (const [oid, o] of reg) if (oid !== id) { o.peers.set(id, meta); o.emit('meta', id, meta); } };      // (signalisation fermée : rien ne part)
    sig.send = () => true;
    sig.leave = () => { reg.delete(id); for (const o of reg.values()) { o.peers.delete(id); o.emit('leave', id); } };
    return sig;
  };
  const meshes = [];
  // (TECH-040) une liaison n'est crue qu'après la preuve d'identité : linkAll pose des liaisons établies (comme le ferait une vraie poignée de main),
  // proveLink joue celle d'un nouvel arrivant (il signe le défi que la salle lui a envoyé).
  // (TECH-010) … et l'ordre d'arrivée que la poignée de main donne : l'hôte y ajoute chaque arrivant, chacun le reçoit.
  const linkAll = (...rs) => {
    for (const r of rs) for (const m of r.members.values()) m.link = 'open';
    const host = rs.find((r) => r._settled && r.hostId === r.selfId) || rs[0];
    for (const r of rs) if (r !== host && !host._order.includes(r.selfId)) host._order.push(r.selfId);
    for (const r of rs) if (r !== host) { r._setOrder(host._orderPayload()); r._settled = true; r._checkHost(); }
  };
  const proveLink = async (room, id) => {
    const ident = await createIdentity();
    room.members.get(id).commit = ident.commit;
    const hi = room.mesh.ctl.filter((c) => c[1] === id && c[0].k === 'hi').at(-1)[0];
    room._onMessage(id, 'ctl', { k: 'hello', pub: ident.pub, sig: await prove(ident, proofText({ room: room.code, signer: id, verifier: room.selfId, signerFp: '', verifierFp: '', nonce: hi.n })) });
    while (identityBusy()) await new Promise((r) => globalThis.setImmediate(r));
    await new Promise((r) => globalThis.setImmediate(r));
  };
  const makeMesh = ({ selfId, handlers }) => { const m = { selfId, handlers, links: new Map(), ctl: [], state: [], addPeer(id) { this.added = (this.added || []).concat(id); }, removePeer() {}, closeAll() {}, sendCtl(msg, to) { this.ctl.push([msg, to]); }, broadcastState(b) { this.state.push(b); } }; meshes.push(m); return m; };
  return { make, makeMesh, meshes, linkAll, proveLink };
}
const settleCrypto = async () => { do { await new Promise((r) => globalThis.setImmediate(r)); } while (identityBusy()); await new Promise((r) => globalThis.setImmediate(r)); };
await test('preuve rejouée (TECH-040) : sur une autre liaison, une seconde fois, dans une autre salle : refusée ; la bonne, acceptée', async () => {
  const env = fakeRoomEnv();
  const opts = (name, o = {}) => ({ name, ...o, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const ana = await Room.create({ ...opts('Ana'), code: 'REJ234' });
  const cid = await Room.join('REJ234', opts('Cid'));
  const other = await Room.create({ ...opts('Ana'), code: 'AUT234', selfId: ana.selfId });     // une autre salle où le même joueur est hôte
  const bea = await createIdentity();
  const meta = { name: 'Bea', v: PHYS_VER, net: NET_VER, c: bea.commit };
  await env.make('bea', 'REJ234').join(meta); await env.make('bea', 'AUT234').join(meta);
  try {
    for (const r of [ana, cid, other]) r._onLink('bea', 'open');                      // la liaison s'ouvre : chacun envoie son défi
    const nonceOf = (r) => r.mesh.ctl.filter((c) => c[1] === 'bea' && c[0].k === 'hi').at(-1)[0].n;
    const hello = { k: 'hello', pub: bea.pub, sig: await prove(bea, proofText({ room: 'REJ234', signer: 'bea', verifier: ana.selfId, signerFp: '', verifierFp: '', nonce: nonceOf(ana) })) };
    cid._onMessage('bea', 'ctl', hello); await settleCrypto();
    assert.notEqual(cid.members.get('bea').link, 'open', 'la preuve faite pour Ana ne vaut pas auprès de Cid');
    other.members.get('bea').nonce = nonceOf(ana);                                       // (même défi, pour ne tester que la salle)
    other._onMessage('bea', 'ctl', hello); await settleCrypto();
    assert.notEqual(other.members.get('bea').link, 'open', 'ni dans une autre salle');
    ana._onMessage('bea', 'ctl', hello); await settleCrypto();
    assert.equal(ana.members.get('bea').link, 'open', 'la bonne preuve, sur la bonne liaison : acceptée');
    ana._onLink('bea', 'open');                                                          // nouvelle liaison (nouveau défi)
    ana._onMessage('bea', 'ctl', hello); await settleCrypto();
    assert.notEqual(ana.members.get('bea').link, 'open', 'la même preuve, une seconde fois : refusée');
  } finally { ana.leave(); cid.leave(); other.leave(); }
});
await test('description WebRTC signée (TECH-040) : seule celle de l\'identité attendue est acceptée ; rejouée vers un autre, ou réponse à une autre offre : refusée', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const ana = await Room.create({ ...opts('Ana'), code: 'DES234' });
  const cid = await Room.join('DES234', opts('Cid'));
  const bea = await createIdentity(), evil = await createIdentity();
  await env.make('bea', 'DES234').join({ name: 'Bea', v: PHYS_VER, net: NET_VER, c: bea.commit });
  try {
    const offer = { type: 'offer', sdp: 'v=0\r\na=fingerprint:sha-256 AA:01\r\n' }, answer = { type: 'answer', sdp: 'v=0\r\na=fingerprint:sha-256 BB:02\r\n' };
    const mine = { type: 'offer', sdp: 'v=0\r\na=fingerprint:sha-256 CC:03\r\n' };
    const seal = async (id, d, to, peer = '') => ({ pub: id.pub, sig: await prove(id, descText({ room: 'DES234', signer: 'bea', verifier: to, type: d.type, fp: fingerprintOf(d.sdp), peerFp: peer })) });
    assert.equal(await ana._vetDesc('bea', offer, await seal(bea, offer, ana.selfId), null), true, 'offre de Bea, pour Ana');
    assert.equal(await ana._vetDesc('bea', offer, await seal(evil, offer, ana.selfId), null), false, 'offre signée par une autre clé');
    assert.equal(await ana._vetDesc('bea', offer, null, null), false, 'offre non signée');
    assert.equal(await cid._vetDesc('bea', offer, await seal(bea, offer, ana.selfId), null), false, 'offre faite pour Ana, rejouée vers Cid');
    assert.equal(await ana._vetDesc('bea', answer, await seal(bea, answer, ana.selfId, 'CC:03'), mine), true, 'réponse à MON offre');
    assert.equal(await ana._vetDesc('bea', answer, await seal(bea, answer, ana.selfId, 'DD:04'), mine), false, 'réponse à une autre offre');
    const cand = { candidate: 'candidate:1 1 udp 2113937151 10.0.0.2 5000 typ host', sdpMid: '0' };
    const sealI = async (who, c, fp, to) => ({ pub: who.pub, sig: await prove(who, iceText({ room: 'DES234', signer: 'bea', verifier: to, fp, candidate: c.candidate })) });
    const good = await sealI(bea, cand, 'AA:01', ana.selfId);
    assert.equal(await ana._vetIce('bea', cand, good, 'AA:01'), true, 'candidat de Bea, pour Ana, de sa connexion');
    assert.equal(await ana._vetIce('bea', cand, await sealI(evil, cand, 'AA:01', ana.selfId), 'AA:01'), false, 'candidat signé par une autre clé');
    assert.equal(await ana._vetIce('bea', cand, null, 'AA:01'), false, 'candidat non signé');
    assert.equal(await ana._vetIce('bea', { ...cand, candidate: 'candidate:1 1 udp 2113937151 6.6.6.6 5000 typ host' }, good, 'AA:01'), false, 'adresse modifiée en route');
    assert.equal(await ana._vetIce('bea', cand, good, 'BB:02'), false, 'candidat d\'une autre connexion (empreinte DTLS)');
    assert.equal(await cid._vetIce('bea', cand, good, 'AA:01'), false, 'candidat fait pour Ana, rejoué vers Cid');
    const sealed = await ana._sealDesc('bea', mine, null);
    assert.deepEqual(Object.keys(sealed).sort(), ['pub', 'sig'], 'ma description porte ma clé publique et ma signature, rien d\'autre');
  } finally { ana.leave(); cid.leave(); }
});
await test('salon (0.13.1) : voiture annoncée et filtrée, prêt compté, mode de l\'hôte vu par l\'invité, revanche demandée', async () => {
  const env = fakeRoomEnv();
  const opts = (name, car) => ({ name, car, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('Hôte', { body: 'muscle', color: '#ff4fd8' }), code: 'CAR234' });
  const guest = await Room.join('CAR234', opts('Invité', { body: 'kart', color: '#36e9ff', '<img>': 'x', long: 'y'.repeat(40) }));
  const g = host.members.get(guest.selfId);
  assert.deepEqual(g.car, { body: 'kart', color: '#36e9ff' }, 'clés et valeurs douteuses retirées');
  assert.deepEqual(cleanCarMeta('pas un objet'), null); assert.deepEqual(cleanCarMeta([1, 2]), null);
  env.linkAll(host, guest);
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
  env.linkAll(host, g);                                                          // (liaisons établies et vérifiées : TECH-040)
  let started = null; g.on('start', (e) => { started = e; });
  host.selectTrack({ id: 'b-1-xyz', name: 'Premiers Éclats' });
  assert.deepEqual(host.mesh.ctl.at(-1)[0], { k: 'track', e: 0, id: 'b-1-xyz', name: 'Premiers Éclats', sig: '' }, 'le choix du circuit, avec l\'époque courante (aucun lancement)');
  assert.equal(g.start(), false, 'un invité ne peut pas lancer');
  g.members.get(host.selfId).rtt = 80;
  g._onMessage(host.selfId, 'ctl', { k: 'track', e: 0, id: 'b-1-xyz', name: 'Premiers Éclats' });
  assert.equal(started, null, 'le choix d\'un circuit ne lance rien');
  g._onMessage(host.selfId, 'ctl', { k: 'start', e: 1, trackId: 'b-1-xyz', startIn: 4000 });
  assert.equal(started.trackId, 'b-1-xyz'); assert.equal(started.startLocal, 1000 + 4000 - 40, 'départ = délai − demi-aller-retour');
  assert.equal(g.track.name, 'Premiers Éclats');
  started = null; g._onMessage('intrus', 'ctl', { k: 'start', e: 2, trackId: 'x', startIn: 10 }); assert.equal(started, null, 'départ d\'un non-hôte ignoré');
  g._onMessage(host.selfId, 'ctl', { k: 'start', e: 1, trackId: 'b-1-xyz', startIn: 4000 }); assert.equal(started, null, 'un même lancement ne relance pas');
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
  env.linkAll(host, g);
  let st = null; g.on('start', (e) => { st = e; });
  g._onMessage(host.selfId, 'ctl', { k: 'live', e: host.epoch, on: true, trackId: 'b-1-xyz', name: 'T' });   // l'hôte annonce sa course en cours au nouvel arrivant
  assert.ok(st && st.startLocal === 5000 + 1500, 'départ dans 1,5 s, à son propre rythme');
  assert.equal(g.state, 'racing');
  host.leave(); g.leave();
});
await test('chaque joueur garde son meilleur temps et son nombre d\'essais ; un temps synchronisé ne compte pas comme un essai', async () => {
  const env = fakeRoomEnv();
  const room = await Room.create({ name: 'H', code: 'ABC234', makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh, now: () => 5 });
  room.members.set('p', { id: 'p', name: 'Pierre', link: 'open', rtt: 0 }); room.members.set('q', { id: 'q', name: 'Quentin', link: 'open', rtt: 0 });
  room.selectTrack({ id: 'b-1-xyz', name: 'T' }); room.start();
  const e = room.epoch, t = 'b-1-xyz';                                          // (NET_VER 5 : un temps porte son lancement et son circuit)
  room._onMessage('p', 'ctl', { k: 'finish', e, t, steps: 4800 }); room._onMessage('p', 'ctl', { k: 'finish', e, t, steps: 4700 }); room._onMessage('p', 'ctl', { k: 'finish', e, t, steps: 4900 });
  room._onMessage('q', 'ctl', { k: 'finish', e, t, steps: 5000, sync: true });
  room._onMessage('q', 'ctl', { k: 'finish', e, t, steps: -4 }); room._onMessage('q', 'ctl', { k: 'finish', e, t, steps: 1e9 }); room._onMessage('q', 'ctl', { k: 'finish', e, t, steps: 'x' });
  room._onMessage('p', 'ctl', { k: 'finish', e: e - 1, t, steps: 1000 }); room._onMessage('p', 'ctl', { k: 'finish', e, t: 'b-autre', steps: 1000 });     // autre lancement, autre circuit : ignorés
  const p = room.results.get('p'); assert.deepEqual([p.best, p.last, p.n], [4700, 4900, 3]);
  const q = room.results.get('q'); assert.deepEqual([q.best, q.n], [5000, 0]);
  assert.deepEqual(room.ranking().map((r) => r.name), ['Pierre', 'Quentin', 'H']);
  assert.equal(room.reportFinish(4600), true, 'nouveau meilleur temps'); assert.equal(room.reportFinish(4650), false);
  assert.deepEqual(room.ranking().map((r) => r.name), ['H', 'Pierre', 'Quentin']);
  assert.equal(room.results.get(room.selfId).n, 2);
  // un nouvel arrivant reçoit mon meilleur temps
  room.members.set('z', { id: 'z', name: 'Zoé', link: 'connecting', rtt: 0 });
  room._onLink('z', 'open');
  assert.deepEqual(room.mesh.ctl.at(-1), [{ k: 'hi', n: room.members.get('z').nonce }, 'z'], 'sa liaison s\'ouvre : d\'abord le défi d\'identité (TECH-040)');
  await env.proveLink(room, 'z');
  assert.equal(room.members.get('z').link, 'open', 'il a prouvé son identité');
  assert.deepEqual(room.mesh.ctl.filter((c) => c[1] === 'z').at(-1), [{ k: 'finish', e, t, steps: 4600, sync: true }, 'z'], 'puis il reçoit mon meilleur temps');
  assert.deepEqual(room.mesh.ctl.at(-1)[0], { k: 'order', o: [[room.selfId, room.ident.commit], ['z', room.members.get('z').commit]] }, 'et l\'hôte annonce à tous l\'ordre d\'arrivée, où il entre à la fin (TECH-010)');
  room.leave();
});
await test('retour au salon : propre à ce joueur, les autres ne sont pas interrompus', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('H'), code: 'ABC234' });
  host.selectTrack({ id: 'b-1-xyz', name: 'T' }); host.start();
  const before = host.mesh.ctl.length;
  host.backToLobby();
  // (NET_VER 5) le seul message est « live : plus de course en cours chez l'hôte », pour les arrivants : il n'interrompt personne
  assert.equal(host.state, 'lobby'); assert.deepEqual(host.mesh.ctl.slice(before).map((c) => [c[0].k, c[0].on]), [['live', false]], 'aucun autre message envoyé aux autres');
  assert.equal(host.meta.racing, false);
  host.leave();
});
await test('circuit envoyé par l\'hôte (code de circuit) : morceaux, assemblage, refus des morceaux douteux', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('H'), code: 'ABC234' }); const g = await Room.join('ABC234', opts('G'));
  env.linkAll(host, g);
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
  host.mesh.ctl.length = 0; host.members.set('n', { id: 'n', name: 'N', link: 'connecting', rtt: 0 }); host._onLink('n', 'open');
  await env.proveLink(host, 'n');
  assert.deepEqual(host.mesh.ctl.map((c) => c[0].k + (c[1] ? '>' + c[1] : '')), ['hi>n', 'order>n', 'track>n', 'tcode>n', 'tcode>n', 'tcode>n', 'live>n', 'order'], 'défi d\'identité (TECH-040), puis, une fois l\'arrivant vérifié, l\'ordre d\'arrivée (TECH-010), circuit et morceaux, l\'état de la course libre ; enfin l\'ordre où il entre, à tous');
  host.leave(); g.leave();
});
await test('paquets d\'état : anti-inondation', async () => {
  const env = fakeRoomEnv();
  const room = await Room.create({ name: 'H', code: 'ABC234', makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh, now: () => 5 });
  let n = 0; room.on('snapshot', () => n++);
  const ab = packSnapshot(snap(1, 0));
  room._onMessage('intrus', 'state', ab); assert.equal(n, 0, 'paquet d\'un inconnu : ignoré (TECH-040)');
  room.members.set('p', { id: 'p', name: 'Pierre', link: 'proving', rtt: 0 });
  room._onMessage('p', 'state', ab); assert.equal(n, 0, 'paquet d\'une liaison pas encore vérifiée : ignoré');
  room.members.get('p').link = 'open';
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
  clock.busy = identityBusy;                                       // (les preuves d'identité, Web Crypto, se font hors de l'horloge simulée : on les attend)
  const rt = new FakeRealtime(clock), rtc = new FakeRTCNet(clock, rtcOpts);
  const rooms = [];
  const sigOf = (client, o = {}) => ({ code, selfId, observe }) => new SupabaseSignaling({ code, selfId, observe, WebSocketImpl: rt.socket(client), url: URL_RT, key: KEY_RT, getToken: o.getToken || rt.tokenSource(client, o.ttl || 3600000) });
  // o.selfId : un identifiant imposé (un joueur qui revient, ou un client modifié qui prend celui d'un autre) ; o.token / o.identity : ce qu'il présente pour reprendre une place.
  const opts = (client, o = {}) => ({ name: client[0].toUpperCase() + client.slice(1), selfId: o.selfId || client, now: clock.now, makeSignaling: sigOf(client, o), makeMesh: (m) => new PeerMesh({ ...m, RTC: rtc.pc(client) }),
    ...(o.getIce ? { getIce: o.getIce } : {}), ...(o.token ? { token: o.token } : {}), ...(o.identity ? { identity: o.identity } : {}) });
  const w = {
    clock, rt, rtc, rooms, sigOf,
    host: async (client, code = 'ABC234', o) => { const r = await clock.until(Room.create({ ...opts(client, o), code })); rooms.push(r); return r; },
    join: async (client, code = 'ABC234', o) => { const r = await clock.until(Room.join(code, opts(client, o))); rooms.push(r); return r; },
    tryJoin: async (client, code = 'ABC234', o) => { try { const r = await clock.until(Room.join(code, opts(client, o)), 20000); rooms.push(r); return r; } catch (e) { return e; } },
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
  ana.selectTrack({ id: 'b-un-a1', name: 'Un' }); ana.start(); await w.clock.advance(500);      // une course libre est lancée
  precondition(bea.state === 'racing', 'Bea court');
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
  ana.selectTrack({ id: 'b-un-a1', name: 'Un' }); ana.start(); await w.clock.advance(500);      // une course libre est lancée
  precondition(bea.state === 'racing', 'Bea court');
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
await test('salle à 8 avec un absent (TECH-086) : le 9e est refusé, l\'absent retrouve sa place', () => scenario(async (w) => {
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
  assert.ok(rooms.slice(0, 7).every((r) => !r.members.has('ivy')), 'le 9e reste refusé : la salle est pleine');
  void ivy;
}));
await test('salle à 8 (TECH-086) : le 9e refusé est admis dès que la place gardée est rendue', () => scenario(async (w) => {
  w.rt.ghostMs = 2000;
  const ids = ['ana', 'bea', 'cid', 'dan', 'eve', 'fay', 'gus', 'hal'];
  const rooms = [await w.host('ana')];
  for (const id of ids.slice(1)) rooms.push(await w.join(id));
  await w.clock.advance(5000);
  w.rt.cut('hal', Infinity); w.rtc.cut('hal');           // Hal ne revient pas
  await w.clock.advance(12500);
  precondition(rooms[0].members.get('hal').link === 'away', 'Hal est absent (place gardée)');
  const ivy = await w.join('ivy');
  await w.clock.advance(1500);
  precondition(!rooms[0].members.has('ivy'), 'Ivy refusée tant que la place de Hal est gardée');
  await w.clock.advance(RESUME_MS + 5000);
  assert.ok(rooms.slice(0, 7).every((r) => !r.members.has('hal')), 'place de Hal rendue');
  assert.ok(rooms.slice(0, 7).every((r) => w.linked(r, ivy)), 'Ivy admise et reliée à tous');
}));

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

console.log('État de la salle : lancements (phase 16 ; défauts reproduits avant correction)');
await test('arrivée d\'une course précédente pendant le chargement de la suivante (TECH-042) : non créditée au nouveau circuit', async () => {
  const env = fakeRoomEnv();
  const host = await Room.create({ name: 'H', code: 'ABC234', makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh, now: () => 5 });
  try {
    host.selectTrack({ id: 'b-un-a1', name: 'Un' }); host.start();
    const e1 = host.epoch;
    host.selectTrack({ id: 'b-deux-b2', name: 'Deux' }); host.start();          // relance sur un autre circuit
    host.reportFinish(4000, e1);                                                  // l'ancienne course (sur Un) finit pendant le chargement de Deux
    assert.equal(host.results.has(host.selfId), false, 'l\'arrivée de l\'ancien lancement n\'est pas créditée au nouveau');
    assert.equal(host.reportFinish(4100), true, 'la course du lancement en cours, elle, compte');
  } finally { host.leave(); }
});
await test('deux lancements rapprochés (TECH-049, circuit lent puis intégré) : la dernière demande gagne ; un lancement remplacé n\'est pas lancé', async () => {
  if (!globalThis.localStorage) {
    const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
    globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
  }
  const { multiMethods } = await import('../js/app/multi.js');
  const played = [];
  const app = {
    ui: { modalOpen: false, closeModal() {}, flash() {} }, _removeCupPanel() {}, _mountBoard() {}, multiLobby() {},
    // un circuit de la communauté lent à télécharger, puis un circuit intégré immédiat
    _resolveMultiTrack: async (room, spec) => { await new Promise((r) => setTimeout(r, spec.id.startsWith('c:') ? 60 : 5)); return { id: spec.id }; },
    playTrack: (t) => played.push(t.id),
  };
  const room = { rules: null, closed: false, backToLobby() {} };
  await Promise.all([multiMethods._startMultiRace.call(app, room, { id: 'c:lent' }, 0), multiMethods._startMultiRace.call(app, room, { id: 'b-vite' }, 0)]);
  assert.deepEqual(played, ['b-vite'], 'seule la dernière demande est lancée : ' + played.join(', '));
  // Le lancement de la salle a changé pendant le chargement (une relance de l'hôte) : la course de l'ancien n'est pas lancée.
  const room2 = { rules: null, closed: false, epoch: 3, backToLobby() {} };
  const p3 = multiMethods._startMultiRace.call(app, room2, { id: 'b-trois' }, 0, null, 3);
  room2.epoch = 4;
  await p3;
  assert.deepEqual(played, ['b-vite'], 'lancement remplacé pendant le chargement : rien n\'est lancé');
  await multiMethods._startMultiRace.call(app, room2, { id: 'b-quatre' }, 0, null, 4);
  assert.deepEqual(played, ['b-vite', 'b-quatre']);
});

console.log('Hôte, identité (phase 17 ; reproduits avant la correction, devenus tests de régression)');
const CUP2 = [{ id: 'b-un-a1', name: 'Un' }, { id: 'b-deux-b2', name: 'Deux' }];
const allLinked = (w, rs) => rs.every((a) => rs.every((b) => a === b || w.linked(a, b)));
await test('hôte coupé moins de 20 s : manche close à temps, drapeau republié, salle rejoignable (TECH-010)', () => scenario(async (w) => {
  w.rt.ghostMs = 2000;                                             // (le serveur retire vite une connexion morte : l'absente n'est plus dans l'annuaire)
  const ana = await w.host('ana'), bea = await w.join('bea'), cid = await w.join('cid');
  await w.clock.advance(3000);
  precondition(allLinked(w, [ana, bea, cid]), 'trois joueurs reliés');
  ana.startCup({ rounds: CUP2 }); await w.clock.advance(500);
  ana.reportFinish(4000); await w.clock.advance(300);              // l'hôte finit la manche… puis son réseau tombe (moins de 20 s)
  w.rt.cut('ana', 16000); w.rtc.cut('ana'); w.clock.setTimeout(() => w.rtc.heal('ana'), 16000);
  await w.clock.advance(12000);
  precondition(bea.members.get('ana').link === 'away' && cid.members.get('ana').link === 'away', 'Ana absente, place gardée');
  bea.reportFinish(4100); cid.reportFinish(4200);
  await w.clock.advance(1000);
  assert.equal(bea.cupState.phase, 'results', 'tous ont fini : la manche est close à temps, sans attendre la fin de l\'absence de l\'hôte');
  assert.ok([bea, cid].some((r) => r.isHost && r.meta.host), 'un successeur se marque hôte (drapeau republié)');
  const dan = await w.tryJoin('dan');
  assert.ok(!(dan instanceof Error), 'la salle reste rejoignable pendant l\'absence de l\'hôte : ' + (dan && dan.message));
}));
await test('hôte qui recharge et rejoint avec son secret : salle trouvée, rôle retrouvé (TECH-010)', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(3000);
  precondition(w.linked(ana, bea), 'reliés');
  const saved = ana.resumeInfo ? ana.resumeInfo().key : null;                    // ce que l'onglet garde (sessionStorage) pour revenir
  ana._dispose();                                                  // Ana recharge sa page : l'onglet se ferme sans « au revoir »
  await w.clock.advance(4000);
  const back = await w.tryJoin('ana', 'ABC234', { selfId: 'ana', token: ana.token, identity: saved });
  assert.ok(!(back instanceof Error), 'l\'hôte qui recharge rejoint sa salle : ' + (back && back.message));
  await w.clock.advance(4000);
  assert.equal(back.isHost, true, 'il retrouve son rôle d\'hôte'); assert.equal(bea.hostId, 'ana');
  assert.ok(w.linked(back, bea), 'relié');
}));
await test('retour non relié : le délai d\'absence n\'est pas remis à zéro (TECH-010)', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(3000);
  let leftAt = null; bea.on('left', (id) => { if (id === 'ana' && leftAt == null) leftAt = w.clock.now(); });
  const t0 = w.clock.now();
  const saved = ana.resumeInfo ? ana.resumeInfo().key : null;      // (son vrai secret : c'est bien elle qui revient)
  ana._dispose();                                                  // l'onglet de l'hôte se ferme
  await w.clock.advance(6000);
  precondition(bea.members.get('ana').link === 'away', 'Ana absente');
  w.rtc.cut('ana');                                                // elle revient, mais sa liaison ne s'ouvre jamais (retour non relié)
  await w.tryJoin('ana', 'ABC234', { selfId: 'ana', token: ana.token, identity: saved });
  await w.clock.advance(20000);
  assert.ok(leftAt != null && leftAt - t0 <= RESUME_MS + 3000, 'un retour non relié ne remet pas à zéro le délai d\'absence : place rendue ' + (leftAt == null ? 'jamais' : Math.round((leftAt - t0) / 1000) + ' s') + ' après la coupure');
}));
await test('le successeur qui devient hôte republie le drapeau ; un arrivant est accepté (TECH-010)', () => scenario(async (w) => {
  // L'hôte (zed) n'a PAS le plus petit identifiant : abe le prend « par défaut » quand zed s'en va.
  const zed = await w.host('zed'), abe = await w.join('abe'), cid = await w.join('cid');
  await w.clock.advance(3000);
  const saved = zed.resumeInfo ? zed.resumeInfo().key : null;
  zed._dispose();                                                  // l'hôte recharge…
  await w.clock.advance(2000);
  const back = await w.tryJoin('zed', 'ABC234', { selfId: 'zed', token: zed.token, identity: saved });      // … et revient (avec son secret, s'il en a un)
  if (!(back instanceof Error)) { back._dispose(); await w.clock.advance(500); }                                    // … puis s'en va pour de bon (onglet fermé)
  await w.clock.advance(RESUME_MS + 5000);
  const hosts = [abe, cid].filter((r) => r.isHost);
  assert.equal(hosts.length, 1, 'un hôte parmi ceux qui restaient');
  assert.equal(hosts[0].meta.host, true, 'il republie le drapeau d\'hôte');
  const dan = await w.tryJoin('dan');
  assert.ok(!(dan instanceof Error), 'un arrivant est accepté : ' + (dan && dan.message));
}));
await test('client modifié annonçant host: true : refusé (TECH-040)', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea');
  await w.clock.advance(3000);
  ana.selectTrack({ id: 'b-un-a1', name: 'Un' });
  const evil = await w.join('aaa');                                // un client modifié, au plus petit identifiant…
  evil._checkHost = () => {}; evil._resign = () => {};              // (un client modifié ne se corrige pas lui-même)
  evil.meta.host = true; evil.signaling.track(evil.meta);          // … se déclare hôte dans la présence
  await w.clock.advance(3000);
  evil.mesh.sendCtl({ k: 'start', e: 99, trackId: 'b-un-a1', name: 'Un', startIn: 1000 });
  evil.mesh.sendCtl({ k: 'rules', r: { g0: 40 } });
  await w.clock.advance(1000);
  precondition(bea.members.get('aaa') && bea.members.get('aaa').host === true, 'le drapeau « host: true » de l\'imposteur est bien dans la présence');
  assert.notEqual(bea.hostId, 'aaa', 'se déclarer hôte ne fait pas l\'hôte');
  assert.equal(bea.state, 'lobby', 'son « départ » est refusé'); assert.equal(bea.rules, null, 'ses règles aussi');
  assert.equal(ana.isHost, true);
}));
await test('hello de remplacement sans le secret (TECH-040) : la place d\'un absent n\'est pas rendue ; avec son secret, le vrai joueur la retrouve', () => scenario(async (w) => {
  w.rt.ghostMs = 2000;
  const ana = await w.host('ana'), bea = await w.join('bea'); await w.join('cid');
  await w.clock.advance(3000);
  ana.selectTrack({ id: 'b-un-a1', name: 'Un' }); ana.start(); await w.clock.advance(500);
  const saved = bea.resumeInfo().key;                              // (ce que l'onglet de Bea garde pour revenir)
  w.rt.cut('bea', 60000); w.rtc.cut('bea');                        // Bea coupée : sa place est gardée 20 s
  await w.clock.advance(12000);
  precondition(ana.members.get('bea').link === 'away', 'place de Bea gardée');
  const evil = await w.tryJoin('mallory', 'ABC234', { selfId: 'bea', token: 'n-importe-quoi' });   // un client modifié prend l'identifiant de Bea
  await w.clock.advance(3000);
  if (!(evil instanceof Error)) evil.reportFinish(1000);
  await w.clock.advance(500);
  assert.notEqual(ana.members.get('bea') && ana.members.get('bea').link, 'open', 'sans le secret de Bea, sa place n\'est pas rendue');
  assert.equal(ana.results.has('bea'), false, 'aucune arrivée comptée pour Bea');
  // Bea recharge son onglet (une autre connexion) avant la fin de ses 20 s, avec son secret : sa place lui revient, le client modifié est toujours là.
  bea._dispose();
  const back = await w.tryJoin('bea-recharge', 'ABC234', { selfId: 'bea', identity: saved });
  assert.ok(!(back instanceof Error), 'Bea revient : ' + (back && back.message));
  await w.clock.advance(3000);
  assert.equal(ana.members.get('bea').link, 'open', 'avec son secret, Bea retrouve sa place');
  assert.equal(back.isHost, false); assert.equal(back.hostId, 'ana');
  back.reportFinish(4321); await w.clock.advance(500);
  assert.equal(ana.results.has('bea'), true, 'son arrivée compte');
  assert.ok(w.linked(back, ana), 'reliée à l\'hôte');
}));

await test('arrivant (TECH-010) : le premier avis reçu n\'est pas cru d\'office ; la majorité des membres vérifiés l\'emporte, et il est tenu pour acquis quand tous ont répondu', async () => {
  const env = fakeRoomEnv();
  const opts = (name, id) => ({ name, selfId: id, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const ana = await Room.create({ ...opts('Ana', 'ana'), code: 'MAJ234' });
  const bea = await Room.join('MAJ234', opts('Bea', 'bea')), cid = await Room.join('MAJ234', opts('Cid', 'cid'));
  const dan = await Room.join('MAJ234', opts('Dan', 'dan'));
  try {
    for (const m of dan.members.values()) m.link = 'open';
    precondition(dan.hostId === null && dan._settled === false, 'avant tout avis, personne n\'a d\'autorité sur l\'arrivant');
    dan._onOrder('cid', { o: [['cid', null], ['ana', null], ['bea', null]] });          // le menteur parle le premier
    assert.equal(dan.isHost, false, 'un arrivant ne se croit jamais hôte avant d\'avoir tout entendu');
    dan._onOrder('ana', { o: [['ana', null], ['bea', null], ['cid', null]] });
    assert.equal(dan._settled, false, 'Bea n\'a pas encore répondu');
    dan._onOrder('bea', { o: [['ana', null], ['bea', null], ['cid', null]] });
    assert.deepEqual(dan._order.slice(0, 3), ['ana', 'bea', 'cid'], 'deux avis contre un');
    assert.equal(dan.hostId, 'ana'); assert.equal(dan._settled, true, 'tous les membres ont répondu');
    dan._onOrder('cid', { o: [['cid', null], ['ana', null], ['bea', null]] });          // un avis tardif du menteur : sans effet
    assert.equal(dan.hostId, 'ana');
  } finally { for (const r of [ana, bea, cid, dan]) r.leave(); }
});
await test('hôte dont la liaison est tombée (TECH-010) : sa présence fantôme (30 s côté serveur) ne le garde pas hôte ; le suivant prend la main avant la fin de ses 20 s et clôt la manche', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea'), cid = await w.join('cid');
  await w.clock.advance(3000);
  precondition(allLinked(w, [ana, bea, cid]), 'trois joueurs reliés');
  ana.startCup({ rounds: CUP2 }); await w.clock.advance(500);
  ana.reportFinish(4000); await w.clock.advance(300);
  const t0 = w.clock.now();
  w.rt.mute('ana'); w.rt.cut('ana', 60000, { mode: 'silent' }); w.rtc.cut('ana');           // son réseau tombe sans un mot : le serveur garde sa présence 30 s
  await w.clock.advance(1000);
  precondition(bea.signaling.peers.has('ana'), 'sa présence fantôme est toujours dans l\'annuaire');
  bea.reportFinish(4100); cid.reportFinish(4200);
  let at = null;
  while (w.clock.now() - t0 < 19500 && at == null) { await w.clock.advance(500); if (bea.cupState.phase === 'results') at = w.clock.now() - t0; }
  assert.ok(at != null, 'la manche est close avant la fin des 20 s de l\'hôte');
  assert.equal(bea.isHost, true); assert.equal(cid.hostId, 'bea');
  assert.ok(bea.signaling.peers.has('ana') || at < 30000, 'sans attendre que le serveur retire sa présence');
}));
await test('deux salons en même temps (TECH-010, TECH-040) : chacun a son hôte, son ordre et ses identités ; rien ne passe de l\'un à l\'autre', () => scenario(async (w) => {
  const ana = await w.host('ana', 'AAA234'), bob = await w.host('bob', 'BBB234');
  const bea = await w.join('bea', 'AAA234'), cid = await w.join('cid', 'BBB234');
  await w.clock.advance(3000);
  precondition(w.linked(ana, bea) && w.linked(bob, cid), 'chaque salon est relié');
  assert.deepEqual([ana.hostId, bea.hostId, bob.hostId, cid.hostId], ['ana', 'ana', 'bob', 'bob']);
  assert.equal(ana.members.has('bob') || ana.members.has('cid') || bob.members.has('ana') || bob.members.has('bea'), false, 'aucun joueur de l\'autre salon');
  // L'hôte du premier salon s'en va : son salon passe à Bea, l'autre salon ne bouge pas.
  ana.leave(); await w.clock.advance(1000);
  assert.equal(bea.isHost, true, 'Bea prend la suite dans son salon'); assert.equal(bea.meta.host, true);
  assert.deepEqual([bob.hostId, cid.hostId], ['bob', 'bob'], 'l\'autre salon n\'a rien vu');
  assert.equal(cid.isHost, false);
  // Un message de contrôle du premier salon ne ressemble à rien dans le second.
  assert.ok(pres(w, 'BBB234').has('bob') && !pres(w, 'BBB234').has('ana'));
}));
await test('ordre d\'arrivée (TECH-010) : un membre qui se met en tête de l\'ordre, ou qui parle au nom de l\'hôte, n\'évince personne', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea'), cid = await w.join('cid');
  await w.clock.advance(3000);
  precondition(allLinked(w, [ana, bea, cid]) && ana.hostId === 'ana', 'trois joueurs reliés, Ana hôte');
  const before = JSON.stringify(bea._order);
  // Cid (client modifié) se met en tête de l'ordre, avec de vraies identités (celles qu'il a vues) : il n'est pas l'hôte, donc on ne le croit pas.
  const forged = { k: 'order', o: [['cid', cid.ident.commit], ['ana', ana.ident.commit], ['bea', bea.ident.commit]] };
  cid.mesh.sendCtl(forged); cid.mesh.sendCtl({ k: 'hostover', o: forged.o });
  await w.clock.advance(1000);
  assert.equal(bea.hostId, 'ana', 'l\'ordre de Cid n\'est pas cru'); assert.equal(ana.hostId, 'ana'); assert.equal(JSON.stringify(bea._order), before);
  assert.equal(cid.isHost, false, 'et Cid ne se croit pas hôte non plus');
  // Cid annonce host: true dans la présence et envoie un départ : rien.
  cid._checkHost = () => {}; cid._resign = () => {};                 // (un client modifié ne se corrige pas lui-même)
  cid.meta.host = true; cid.signaling.track(cid.meta);
  cid.mesh.sendCtl({ k: 'start', e: 9, trackId: 'b-un-a1', startIn: 1000 }); cid.mesh.sendCtl({ k: 'rules', r: { g0: 40 } });
  await w.clock.advance(1000);
  assert.equal(bea.state, 'lobby', 'pas de départ'); assert.equal(bea.rules, null); assert.equal(bea.hostId, 'ana');
  // Ana (la vraie hôte) est coupée : Bea, la suivante dans l'ordre, fait l'intérim ; Cid, qui n'est que le troisième, ne peut pas la devancer.
  w.rt.ghostMs = 2000; w.rt.cut('ana', 60000); w.rtc.cut('ana');
  await w.clock.advance(12000);
  assert.equal(bea.hostId, 'bea', 'Bea fait l\'intérim'); assert.equal(cid.hostId, 'bea', 'Cid le voit de la même façon');
  const lie = { k: 'order', o: [['cid', cid.ident.commit], ['bea', bea.ident.commit], ['ana', ana.ident.commit]] };
  cid.mesh.sendCtl(lie); await w.clock.advance(1000);
  assert.equal(bea.hostId, 'bea', 'pendant l\'intérim, l\'ordre de Cid (qui passe devant Bea) est refusé'); assert.equal(bea.isHost, true);
}));
await test('arrivant (TECH-010) : l\'ordre d\'arrivée est celui de la majorité des membres vérifiés, pas celui d\'un menteur ; une salle à deux ne peut pas se défendre', () => scenario(async (w) => {
  const ana = await w.host('ana'), bea = await w.join('bea'), cid = await w.join('cid');
  await w.clock.advance(3000);
  precondition(allLinked(w, [ana, bea, cid]), 'trois joueurs reliés');
  // Cid ment aux arrivants : il se donne le rôle d'hôte dans l'ordre qu'il leur envoie.
  const real = cid._orderPayload;
  cid._orderPayload = function () { return [['cid', this.ident.commit], ...real.call(this).filter((e) => e[0] !== 'cid')]; };
  const dan = await w.join('dan');
  await w.clock.advance(8000);
  assert.equal(dan.hostId, 'ana', 'l\'arrivant croit la majorité (Ana et Bea), pas Cid');
  assert.deepEqual(dan._order.slice(0, 3), ['ana', 'bea', 'cid']);
  assert.equal(dan.isHost, false); assert.ok(w.linked(dan, ana));
}));

// ---- Phase 18 (LOT-8c) : voitures distantes, collisions douces, ressources ---------------------------------------------------------------------------
// Le côté « course » d'un joueur : les méthodes de js/race/net.js (celles de RaceSession) sur un objet minimal, branché sur une vraie salle du banc (ou sur une
// salle factice pour les paquets forgés). frame() fait ce que fait RaceSession.render pour les voitures distantes ; teardown() ce que fait RaceSession.dispose.
const CAM = new THREE.Vector3();
function raceSide(room, { cup = null } = {}) {
  const S = Object.assign(Object.create(netMethods), {
    app: { scene: new THREE.Scene(), particles: { burst() {} } },
    multi: { room }, cup, remote: new Map(), tick: 100000, protectUntil: 0, netTick: 0, teleSeq: 0, state: 'racing',
    phys: { mode: 'car', pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 } },
  });
  S._setupRemotes();
  return S;
}
const frame = (S, now) => { if (S._updateRemotes) S._updateRemotes(now, CAM); else for (const rc of S.remote.values()) rc.update(now, CAM); };
const teardown = (S) => {
  if (S._teardownRemotes) { S._teardownRemotes(); return; }
  S.multi.room.off('snapshot', S._onSnap); S.multi.room.off('left', S._onLeft);
  for (const rc of S.remote.values()) rc.dispose();
  S.remote.clear();
};
const shown = (S, id) => !!(S.remote.get(id) && S.remote.get(id).group.visible);
// Collisionnable : notre voiture, posée à 0,5 m de la voiture distante (immobile), en est-elle poussée ?
const pushedBy = (S, id, now) => {
  const rc = S.remote.get(id);
  if (!rc) return false;
  S.phys.pos = { x: rc.pos.x + 0.5, y: rc.pos.y, z: rc.pos.z }; S.phys.vel = { x: 0, y: 0, z: 0 };
  S._collide(now);
  return Math.hypot(S.phys.vel.x, S.phys.vel.z) > 0;
};
const freeRace = async (w, ...names) => {
  const [host, ...guests] = [await w.host(names[0]), ...await Promise.all(names.slice(1).map((n) => w.join(n)))];
  await w.clock.advance(3000);
  precondition([host, ...guests].every((a) => [host, ...guests].every((b) => a === b || w.linked(a, b))), 'tous reliés');
  host.selectTrack({ id: 'b-un-a1', name: 'Un' }); host.start(); await w.clock.advance(500);
  precondition(guests.every((g) => g.state === 'racing'), 'course libre lancée chez tous');
  return [host, ...guests];
};
const frames = async (w, list, ms, step = 50) => { for (let t = 0; t < ms; t += step) { await w.clock.advance(step); for (const S of list) frame(S, w.clock.now()); } };

// Salle factice (sans réseau) pour les paquets fabriqués à la main et les règles : membres, liste, règles ; 'snapshot' émis par le test.
function fakeRoom(members, { rules = null } = {}) {
  const r = new Emitter();
  r.selfId = 'moi'; r.rules = rules; r.closed = false; r.members = new Map(members.map((m) => [m.id, { link: 'open', racing: true, rtt: 0, name: m.id, ...m }]));
  Object.defineProperty(r, 'list', { get: () => [{ id: 'moi', self: true, link: 'self', rtt: 0 }, ...r.members.values()] });
  r.sendSnapshot = () => {};
  return r;
}
const pk = (s) => unpackSnapshot(packSnapshot(s));

console.log('Phase 18 : voitures distantes (TECH-009, TECH-043)');
await test('un arrivant en pleine course libre (TECH-009, TRANS-06) : toutes les voitures distantes visibles de part et d\'autre', () => scenario(async (w) => {
  const [ana, bea] = await freeRace(w, 'ana', 'bea');
  const SA = raceSide(ana), SB = raceSide(bea);
  const sends = [racing(w, ana), racing(w, bea)];
  const cid = await w.join('cid');
  await w.clock.advance(4000);
  precondition(cid.state === 'racing' && w.linked(cid, ana) && w.linked(cid, bea), 'Cid, arrivé pendant la course, y est entré et est relié');
  const SC = raceSide(cid); sends.push(racing(w, cid));
  let got = 0; ana.on('snapshot', (id) => { if (id === 'cid') got++; });
  await frames(w, [SA, SB, SC], 2000);
  precondition(got >= 30, 'Ana a reçu les paquets de Cid : ' + got);
  assert.ok(shown(SC, 'ana') && shown(SC, 'bea'), 'Cid voit Ana et Bea');
  assert.ok(SA.remote.has('cid') && SB.remote.has('cid'), `Ana et Bea ont une voiture pour Cid (${got} paquets reçus)`);
  assert.ok(shown(SA, 'cid') && shown(SB, 'cid'), 'et elle est visible');
  for (const s of sends) w.clock.clearInterval(s);
  for (const S of [SA, SB, SC]) teardown(S);
}));
await test('un joueur parti puis revenu avec le même identifiant réapparaît (TECH-009)', () => scenario(async (w) => {
  const [ana, , cid] = await freeRace(w, 'ana', 'bea', 'cid');
  const SA = raceSide(ana);
  const sends = [racing(w, cid)];
  await frames(w, [SA], 1000);
  precondition(shown(SA, 'cid'), 'Ana voit Cid');
  const saved = cid.resumeInfo().key;
  w.clock.clearInterval(sends[0]); cid.leave();                   // Cid part (au revoir) …
  await frames(w, [SA], 2000);
  precondition(!SA.remote.has('cid'), 'sa voiture est retirée');
  const back = await w.join('cid', 'ABC234', { selfId: 'cid', identity: saved });     // … et revient avec le même identifiant
  await w.clock.advance(4000);
  precondition(back.state === 'racing' && w.linked(back, ana), 'Cid est revenu dans la course');
  const SC = raceSide(back); sends.push(racing(w, back), racing(w, ana));
  await frames(w, [SA, SC], 2000);
  assert.ok(shown(SC, 'ana'), 'Cid voit Ana');
  assert.ok(shown(SA, 'cid'), 'Ana revoit Cid');
  for (const s of sends) w.clock.clearInterval(s);
  teardown(SA); teardown(SC);
}));
await test('lien mort (TECH-043) : la voiture distante est masquée et non collisionnable après ≈ 0,5 s', () => scenario(async (w) => {
  const [ana, bea] = await freeRace(w, 'ana', 'bea');
  const SA = raceSide(ana);
  const send = racing(w, bea);
  await frames(w, [SA], 1000);
  precondition(shown(SA, 'bea') && pushedBy(SA, 'bea', w.clock.now()), 'voiture de Bea visible et collisionnable');
  w.rtc.cut('bea');                                             // le lien de jeu meurt (la présence reste)
  await frames(w, [SA], 600);
  precondition(ana.signaling.peers.has('bea'), 'Bea est toujours dans l\'annuaire');
  assert.ok(!shown(SA, 'bea'), 'sans paquet depuis 0,6 s : masquée');
  assert.ok(!pushedBy(SA, 'bea', w.clock.now()), 'et plus collisionnable');
  w.rtc.heal('bea');                                            // le chemin revient (avant toute détection de panne) : ses paquets aussi
  await frames(w, [SA], 1000);
  assert.ok(shown(SA, 'bea') && pushedBy(SA, 'bea', w.clock.now()), 'paquets revenus : de nouveau visible et collisionnable');
  w.clock.clearInterval(send); teardown(SA);
}));
await test('joueur revenu au salon (TECH-043) : sa voiture disparaît de la piste', () => scenario(async (w) => {
  const [ana, bea] = await freeRace(w, 'ana', 'bea');
  const SA = raceSide(ana);
  const send = racing(w, bea);
  await frames(w, [SA], 1000);
  precondition(shown(SA, 'bea'), 'voiture de Bea visible');
  w.clock.clearInterval(send); bea.backToLobby();               // Bea revient au salon (sa course est fermée : plus de paquets)
  await frames(w, [SA], 1500);
  precondition(ana.members.get('bea') && ana.members.get('bea').racing === false, 'Ana sait que Bea est au salon');
  assert.ok(!shown(SA, 'bea') && !pushedBy(SA, 'bea', w.clock.now()), 'plus sur la piste, plus collisionnable');
  assert.equal(SA.remote.has('bea'), false, 'sa voiture est retirée');
  teardown(SA);
}));
await test('lien non ouvert ou joueur hors course (TECH-043) : masquée et hors des collisions même avec des paquets récents ; paquets en route après le retour au salon ignorés', () => {
  const room = fakeRoom([{ id: 'zoe' }]);
  const S = raceSide(room);
  let t = 0;
  const feedZoe = (ms) => { for (let k = 0; k < ms / 50; k++) { t += 6; room.emit('snapshot', 'zoe', pk(snap(t, 0)), t * DT * 1000); frame(S, t * DT * 1000 + 1); } };
  feedZoe(1000);
  precondition(shown(S, 'zoe') && pushedBy(S, 'zoe', t * DT * 1000 + 1), 'visible et collisionnable');
  room.members.get('zoe').link = 'connecting';
  feedZoe(200);
  assert.ok(!shown(S, 'zoe') && !pushedBy(S, 'zoe', t * DT * 1000 + 1), 'lien non ouvert : masquée, hors des collisions');
  room.members.get('zoe').link = 'open';
  feedZoe(200);
  precondition(shown(S, 'zoe'), 'lien rouvert : visible');
  room.members.get('zoe').racing = false;                        // au salon (présence), ses derniers paquets encore récents
  frame(S, t * DT * 1000 + 1);
  assert.ok(!shown(S, 'zoe') && !pushedBy(S, 'zoe', t * DT * 1000 + 1), 'hors course : masquée, hors des collisions');
  frame(S, t * DT * 1000 + 600);
  assert.equal(S.remote.has('zoe'), false, 'plus aucun paquet : retirée');
  room.emit('snapshot', 'zoe', pk(snap(t - 6, 0)), t * DT * 1000 + 700);       // un paquet d'avant, arrivé en retard
  assert.equal(S.remote.has('zoe'), false, 'un paquet d\'avant le retour au salon ne la recrée pas');
  room.members.get('zoe').racing = true;
  room.emit('snapshot', 'zoe', pk(snap(6, 0)), t * DT * 1000 + 3000);         // nouvelle course (son horloge repart de zéro)
  frame(S, t * DT * 1000 + 3101);
  assert.ok(S.remote.has('zoe'), 'nouvelle course : la voiture renaît');
  teardown(S);
});


console.log('Phase 18 : collisions douces (TECH-041)');
// Deux voitures sur une ligne ; chaque joueur voit l'autre avec D de retard (interpolation + latence), ramenée à l'instant présent (presentState), comme RaceSession._collide.
function duel(va, vb, gap, D, steps = 480) {
  const lag = Math.round(D / DT);
  const A = { pos: { x: -gap, y: 0, z: 0 }, vel: { x: va, y: 0, z: 0 } }, B = { pos: { x: 0, y: 0, z: 0 }, vel: { x: vb, y: 0, z: 0 } };
  const hA = [], hB = [], mA = new Map(), mB = new Map();
  for (let k = lag; k > 0; k--) { hA.push({ pos: { x: A.pos.x - va * k * DT, y: 0, z: 0 }, vel: { x: va, y: 0, z: 0 } }); hB.push({ pos: { x: B.pos.x - vb * k * DT, y: 0, z: 0 }, vel: { x: vb, y: 0, z: 0 } }); }
  let maxDv = 0;
  for (let i = 0; i < steps; i++) {
    hA.push({ pos: { ...A.pos }, vel: { ...A.vel } }); hB.push({ pos: { ...B.pos }, vel: { ...B.vel } });
    const oB = hB[hB.length - 1 - lag], oA = hA[hA.length - 1 - lag];
    const a0 = A.vel.x, b0 = B.vel.x;
    softCollide(A, [{ id: 'b', ...presentState(oB, D) }], { memo: mA });
    softCollide(B, [{ id: 'a', ...presentState(oA, D) }], { memo: mB });
    maxDv = Math.max(maxDv, Math.abs(A.vel.x - a0), Math.abs(B.vel.x - b0));
    A.pos.x += A.vel.x * DT; B.pos.x += B.vel.x * DT;
  }
  return { vA: A.vel.x, vB: B.vel.x, maxDv };
}
const STEP_CAP = MAX_DV_TOTAL;     // m/s : variation de vitesse maximale par pas de 1/120 s, toutes voitures confondues (2,5 m/s : 300 m/s², ≈ 31 g)
await test('face-à-face 2 × 50 m/s (TECH-041) : Δv plafonnée par pas, échange symétrique, jamais amplifié', () => {
  assert.equal(STEP_CAP, 2.5);
  for (const D of [0, 0.1, 0.25]) {
    const r = duel(50, -50, 6, D);
    assert.ok(r.maxDv <= STEP_CAP + 1e-9, `face-à-face 2 × 50 m/s (retard ${D} s) : Δv par pas ${r.maxDv.toFixed(2)} m/s`);
    assert.ok(Math.abs(r.vA + r.vB) < 0.5, `échange symétrique : ${r.vA.toFixed(2)} / ${r.vB.toFixed(2)}`);
    assert.ok(r.vA >= -50 * 0.35 - 0.5 && r.vB <= 50 * 0.35 + 0.5, `jamais renvoyées plus vite que la restitution ne le permet (± 17,5 m/s) : ${r.vA.toFixed(2)} / ${r.vB.toFixed(2)}`);
    assert.ok(Math.abs(r.vA) <= 50 + 1e-9 && Math.abs(r.vB) <= 50 + 1e-9, 'aucune voiture ne sort du choc plus vite qu\'elle n\'y est entrée');
  }
});
await test('rebond cohérent (TECH-041) : la vitesse de l\'autre (avant sa propre réaction) est prise en compte, l\'échange n\'est pas doublé', () => {
  const f = duel(20, -20, 6, 0.1);
  assert.ok(f.maxDv <= STEP_CAP + 1e-9, 'face-à-face 2 × 20 : Δv par pas ' + f.maxDv.toFixed(2));
  assert.ok(Math.abs(f.vA + 7) < 1 && Math.abs(f.vB - 7) < 1, `face-à-face 2 × 20 m/s : rebond de ± 7 m/s (restitution 0,35) : ${f.vA.toFixed(2)} / ${f.vB.toFixed(2)}`);
  const r = duel(40, 30, 3, 0.1);
  assert.ok(Math.abs(r.vA - 33.25) < 1 && Math.abs(r.vB - 36.75) < 1, `rattrapage 40 → 30 m/s : 33,25 / 36,75 attendus, ${r.vA.toFixed(2)} / ${r.vB.toFixed(2)} (l'échange n'est pas doublé)`);
  for (const D of [0, 0.25]) {
    const q = duel(60, 30, 3, D);
    assert.ok(Math.abs(q.vA - 40) < 1 && Math.abs(q.vB - 50) < 1 && q.maxDv <= STEP_CAP + 1e-9, `rattrapage 60 → 30 m/s (retard ${D} s) : 40 / 50 attendus, ${q.vA.toFixed(2)} / ${q.vB.toFixed(2)}`);
  }
});
await test('sept voitures empilées (TECH-041) : plafond global par pas, impulsion par contact bornée', () => {
  const self = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
  const side = []; for (let k = 0; k < 7; k++) side.push({ id: 's' + k, pos: { x: 1.0, y: 0, z: (k - 3) * 0.2 }, vel: { x: -40, y: 0, z: 0 } });
  softCollide(self, side, { memo: new Map() });
  const dv = Math.hypot(self.vel.x, self.vel.z);
  assert.ok(dv <= STEP_CAP + 1e-9, `sept voitures empilées du même côté : Δv en un pas ${dv.toFixed(2)} m/s`);
  // tout autour (sept voitures qui convergent) et pendant tout le contact : chaque pas reste sous le plafond, chaque contact sous MAX_IMPULSE
  const me = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }, memo = new Map();
  const ring = []; for (let k = 0; k < 7; k++) { const a = k * 2 * Math.PI / 7 + 0.3; ring.push({ id: 'r' + k, pos: { x: Math.cos(a) * 1.2, y: 0, z: Math.sin(a) * 1.2 }, vel: { x: -Math.cos(a) * 90, y: 0, z: -Math.sin(a) * 90 } }); }
  let worst = 0;
  for (let i = 0; i < 120; i++) { const vx = me.vel.x, vz = me.vel.z; softCollide(me, ring, { memo }); worst = Math.max(worst, Math.hypot(me.vel.x - vx, me.vel.z - vz)); for (const c of memo.values()) assert.ok(c.imp <= MAX_IMPULSE + 1e-9, 'impulsion d\'un contact : ' + c.imp); }
  assert.ok(worst <= STEP_CAP + 1e-9, 'pire pas : ' + worst.toFixed(2));
});
await test('paquets forgés (TECH-041) : 600 m/s annoncés, ou une vitesse sans rapport avec le déplacement : rejetés, la voiture n\'est pas propulsée', () => {
  // Un client modifié envoie des paquets qui « suivent » notre voiture en annonçant 600 m/s vers elle (le paquet en permet ± 655).
  const room = fakeRoom([{ id: 'evil' }]);
  const S = raceSide(room);
  const lead = 0.1;
  let t = 0, maxSpeed = 0;
  for (let i = 0; i < 240; i++) {
    if (i % 6 === 0) { t += 6; room.emit('snapshot', 'evil', pk(snap(t, S.phys.pos.x - 600 * lead - 0.5, { vel: { x: 600, y: 0, z: 0 }, pos: { x: S.phys.pos.x - 600 * lead - 0.5, y: 1, z: 0 } })), t * DT * 1000); }
    frame(S, t * DT * 1000 + 100);
    const v = S.phys.vel; S._collide(t * DT * 1000 + 100);
    S.phys.pos = { x: S.phys.pos.x + v.x * DT, y: 1, z: S.phys.pos.z + v.z * DT };
    maxSpeed = Math.max(maxSpeed, Math.hypot(S.phys.vel.x, S.phys.vel.z));
  }
  teardown(S);
  assert.ok(maxSpeed <= 30, 'des paquets fabriqués ne propulsent pas la voiture : ' + maxSpeed.toFixed(1) + ' m/s');
  // Vitesse plausible (140 m/s) mais voiture immobile, posée sur la nôtre : rejetée aussi (elle ne se déplace pas comme elle le dit).
  const room2 = fakeRoom([{ id: 'evil' }]), S2 = raceSide(room2);
  let t2 = 0, max2 = 0;
  for (let i = 0; i < 240; i++) {
    if (i % 6 === 0) { t2 += 6; room2.emit('snapshot', 'evil', pk(snap(t2, 0, { vel: { x: 140, y: 0, z: 0 }, pos: { x: -14.5, y: 1, z: 0 } })), t2 * DT * 1000); }
    frame(S2, t2 * DT * 1000 + 100);
    S2.phys.pos = { x: 0, y: 1, z: 0 }; S2._collide(t2 * DT * 1000 + 100);
    max2 = Math.max(max2, Math.hypot(S2.phys.vel.x, S2.phys.vel.z));
  }
  teardown(S2);
  assert.ok(max2 <= 1, 'une voiture immobile qui annonce 140 m/s ne pousse pas : ' + max2.toFixed(1) + ' m/s');
  // et un client honnête à 80 m/s reste crédible
  const buf = new SnapshotBuffer();
  feed(buf, [0, 6, 12, 18].map((k) => snap(k, k * DT * 80, { vel: { x: 80, y: 0, z: 0 } })));
  assert.equal(buf.sample(18 * DT * 1000 + 130).bad, false, 'vitesse cohérente avec le déplacement : crédible');
});
await test('supabase/MULTI.md dit le vrai plafond des collisions (TECH-041)', () => {
  const doc = readFileSync(new URL('../supabase/MULTI.md', import.meta.url), 'utf8');
  assert.ok(!/plafonn[ée]+ à ~4 g/.test(doc), 'supabase/MULTI.md dit encore « poussée plafonnée à ~4 g »');
  assert.ok(doc.includes('2,5 m/s par pas') && doc.includes('31 g'), 'le plafond réel (2,5 m/s par pas, ≈ 31 g) est écrit');
});

console.log('Phase 18 : ressources et défauts mineurs (TECH-087, TECH-088, TECH-089)');
await test('onglet masqué 10 minutes (TECH-087, TRANS-09) : tampon d\'interpolation borné, et la voiture repart dès le retour au premier plan', () => {
  const rc = new RemoteCar(new THREE.Scene(), { id: 'a', name: 'A' });
  for (let i = 0; i < 12000; i++) rc.push(pk(snap(i * 6, i)), i * 50);          // 10 minutes à 20 Hz, onglet masqué : aucune image, donc aucun sample()
  const n = rc.buffer.samples.length, span = rc.buffer.latest.t - rc.buffer.samples[0].t;
  assert.ok(n <= 64, 'tampon d\'interpolation borné : ' + n + ' paquets gardés');
  assert.ok(span >= 1.4 && span <= 1.6, 'les 1,5 dernières secondes : ' + span.toFixed(2) + ' s');
  assert.ok(rc.update(12000 * 50 + 100, CAM) && Math.abs(rc.pos.x - 11998) < 1.5, 'retour au premier plan : la voiture est à sa place récente : ' + rc.pos.x.toFixed(1));
  const flood = new SnapshotBuffer();
  for (let i = 0; i < 5000; i++) flood.push(pk(snap(i, i)), i);                        // un paquet par pas (6 fois trop serré)
  assert.ok(flood.samples.length <= 64, 'paquets serrés : ' + flood.samples.length);
  rc.dispose();
});
await test('règle « voitures identiques » (TECH-088) : les voitures distantes aussi ont l\'apparence d\'origine ; sans la règle, chacune garde la sienne', () => {
  const plain = fakeRoom([{ id: 'zoe', car: { color: '#ff0000', color2: '#00ff00', body: 'muscle' } }]);
  const P = raceSide(plain, { cup: { n: 0, total: 1, collisions: true } });
  plain.emit('snapshot', 'zoe', pk(snap(6, 0)), 0);
  assert.equal('#' + P.remote.get('zoe').baseColor.getHexString(), '#ff0000', 'sans la règle : sa couleur');
  assert.equal(P.remote.get('zoe').opaque, true, 'vraie voiture en championnat');
  teardown(P);
  const room = fakeRoom([{ id: 'zoe', car: { color: '#ff0000', color2: '#00ff00', body: 'muscle' } }], { rules: { sameCars: 1 } });
  const S = raceSide(room, { cup: { n: 0, total: 1, collisions: true } });
  room.emit('snapshot', 'zoe', pk(snap(6, 0)), 0);
  const rc = S.remote.get('zoe');
  precondition(rc, 'voiture de Zoé créée');
  const col = '#' + rc.baseColor.getHexString();
  teardown(S);
  assert.equal(col, DEFAULT_LOADOUT.color, 'règle « voitures identiques » : la voiture de Zoé a l\'apparence d\'origine');
});
await test('téléportation au même pas que le paquet périodique (TECH-089 a) : pas de paquet perdu, la voiture apparaît sans attendre le paquet suivant', () => {
  const buf = new SnapshotBuffer();
  feed(buf, [snap(0, 0, { seq: 1 }), snap(6, 10, { seq: 2 })]);
  const tp = pk(snap(6, 5000, { tele: 1, seq: 3 }));                // téléportation envoyée au même pas que le paquet périodique (même horloge)
  const ok = buf.push(tp, 6 * DT * 1000 + 31);
  assert.notEqual(ok, false, 'le paquet de téléportation n\'est pas jeté comme doublon');
  assert.equal(buf.samples.at(-1).pos.x, 5000);
  assert.equal(buf.samples.length, 2, 'il remplace le paquet périodique du même pas');
  let seen = 0; for (let ms = 0; ms < 400; ms += 8) { const o = buf.sample(ms + 30); if (o.teleported) { seen++; assert.equal(o.pos.x, 5000); } }
  assert.equal(seen, 1, 'téléportation vue une fois, à son instant');
  assert.equal(buf.push(pk(snap(6, 10, { seq: 2 })), 6 * DT * 1000 + 40), false, 'le périodique (plus ancien) arrivé après ne la défait pas');
  assert.equal(buf.push(pk(snap(6, 5000, { tele: 1, seq: 3 })), 6 * DT * 1000 + 41), false, 'un vrai doublon reste ignoré');
  // numéros de séquence qui reviennent à zéro (16 bits)
  const w = new SnapshotBuffer();
  w.push(pk(snap(6, 10, { seq: 65535 })), 50); assert.notEqual(w.push(pk(snap(6, 900, { tele: 1, seq: 0 })), 51), false, 'séquence 65535 puis 0 : plus récent');
});
await test('circuit sans ligne centrale (TECH-089 c) : avancement non nul et croissant, checkpoints et tours compris', () => {
  const tr = new Track('t'); tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); tr.add({ t: 'finish', x: 0, z: -3, l: 0, r: 0 });     // circuit de joueur : pas de ligne centrale, aucun checkpoint
  const logic = new RaceLogic(tr);
  const sp = logic.spawnPoint(), fin = { x: 16, z: -3 * 32 + 16 };
  const S = Object.assign(Object.create(netMethods), { track: tr, logic, progress: new ProgressTracker(tr.path), state: 'racing', prog: 0, _jumped: false,
    phys: { pos: { x: (sp.x + fin.x) / 2, y: sp.y, z: (sp.z + fin.z) / 2 } } });
  precondition(!S.progress.available && logic.cps.length === 0, 'ni ligne centrale ni checkpoint');
  S._updateProgress();
  assert.ok(S.prog > 0.25 && S.prog < 0.75, 'à mi-chemin du départ à l\'arrivée : avancement ' + S.prog);
  let last = -1;
  for (let k = 0; k <= 10; k++) { S.phys.pos = { x: sp.x + (fin.x - sp.x) * k / 10, y: sp.y, z: sp.z + (fin.z - sp.z) * k / 10 }; S._updateProgress(); assert.ok(S.prog >= last, 'croissant'); last = S.prog; }
  assert.ok(last < 1, 'jamais 100 % avant l\'arrivée');
  // un checkpoint : sa part de la course, puis le tronçon suivant
  const t2 = new Track('t2'); t2.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); t2.add({ t: 'checkpoint', x: 0, z: -2, l: 0, r: 0 }); t2.add({ t: 'finish', x: 0, z: -4, l: 0, r: 0 });
  const lg2 = new RaceLogic(t2);
  precondition(lg2.cps.length === 1, 'un checkpoint');
  const S2 = Object.assign(Object.create(netMethods), { track: t2, logic: lg2, progress: new ProgressTracker(t2.path), state: 'racing', prog: 0, _jumped: false, phys: { pos: { x: 16, y: 0, z: -48 } } });
  S2._updateProgress(); const before = S2.prog;
  assert.ok(before > 0.15 && before < 0.5, 'avant le checkpoint : ' + before);
  lg2.collected.add(lg2.cps[0]); lg2.respawn = { ...lg2.respawn, x: 16, z: -2 * 32 + 16 };
  S2.phys.pos = { x: 16, y: 0, z: -2 * 32 + 16 - 16 }; S2._updateProgress();
  assert.ok(S2.prog > 0.5 && S2.prog < 1, 'checkpoint pris, en route vers l\'arrivée : ' + S2.prog);
});
await bugConnu('TECH-089', () => scenario(async (w) => {
  const [ana, bea] = await freeRace(w, 'ana', 'bea');
  let n = 0; ana.on('results', () => n++);
  for (let i = 0; i < 2000; i++) bea.mesh.sendCtl({ k: 'finish', e: bea.epoch, t: 'b-un-a1', steps: 5000 + i });
  await w.clock.advance(1000);
  precondition(n > 0, 'les arrivées de Bea sont reçues');
  assert.ok(n <= 200, `débit des messages fiables borné : ${n} tableaux reconstruits pour 2000 « finish » en un instant`);
}), '(e) un flot de messages fiables est borné');
await bugConnu('TECH-089', () => scenario(async (w) => {
  // (f) Abe (initiateur de la liaison : le plus petit identifiant) recharge sa page et revient avec son secret ; chez Zoé, sa présence arrive 400 ms APRÈS son offre WebRTC.
  const zoe = await w.host('zoe'), abe = await w.join('abe');
  await w.clock.advance(3000);
  precondition(w.linked(zoe, abe), 'reliés');
  const saved = abe.resumeInfo().key;
  abe._dispose();
  await w.clock.advance(4000);
  precondition(zoe.members.get('abe') && zoe.members.get('abe').link === 'away', 'Abe absent chez Zoé');
  const push = w.rt._push.bind(w.rt);
  w.rt._push = (s, m) => { if (s.client === 'zoe' && m.event === 'presence_diff' && JSON.stringify(m.payload.joins || {}).includes('abe')) w.clock.setTimeout(() => push(s, m), 400); else push(s, m); };
  const back = await w.join('abe', 'ABC234', { selfId: 'abe', identity: saved });
  await w.clock.advance(3000);
  assert.ok(w.linked(zoe, back), 'relié dans les 3 s (offre arrivée avant la présence : gardée, pas perdue) : ' + (zoe.members.get('abe') || {}).link);
}), '(f) offre d\'un joueur qui revient arrivée avant sa présence : la liaison se refait sans attendre la renégociation');

await finish('Tous les tests réseau passent.');
