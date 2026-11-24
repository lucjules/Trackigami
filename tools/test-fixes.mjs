// Régressions des corrections de l'audit : node tools/test-fixes.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

// Stockage du navigateur simulé (records, profil).
const m = new Map();
const base = { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
globalThis.localStorage = new Proxy(base, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : undefined) });

const { scriptTrack } = await import('../js/track.js');
const { CarPhysics } = await import('../js/physics.js');
const { RaceLogic, placeAtStart } = await import('../js/raceLogic.js');
const { CELL, LEVEL_H } = await import('../js/constants.js');
const { saveRecord, getRecord, clearRecords } = await import('../js/storage.js');
const { decodeInputs } = await import('../js/replay.js');
const { MAX_RUN_STEPS: MAX_REPLAY_STEPS } = await import('../js/constants.js');
const { trackForKey, replayTime } = await import('../js/verify.js');
const { mergeSaves } = await import('../js/cloudsave.js');
const { rewardCoins, profile } = await import('../js/profile.js');

console.log('Checkpoint et arrivée');
test('un pont 2 niveaux au-dessus du checkpoint ou de l\'arrivée ne les déclenche pas', () => {
  const tr = scriptTrack('t', 'start S2 C S2 finish');
  tr.add({ t: 'straight', x: 0, z: -3, l: 2, r: 0 }); tr.add({ t: 'straight', x: 0, z: -6, l: 2, r: 0 });
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr);
  placeAtStart(phys, logic);
  phys.place(12, 2 * LEVEL_H + 0.4, -3 * CELL + 12, 0, 1);
  assert.equal(logic.update(phys), null); assert.equal(logic.collected.size, 0);
  phys.place(12, 2 * LEVEL_H + 0.4, -6 * CELL + 12, 0, 1);
  const ev = logic.update(phys);
  assert.ok(!ev || ev.type !== 'finish'); assert.equal(logic.finished, false);
});
test('un checkpoint pris en sautant juste au-dessus compte toujours', () => {
  const tr = scriptTrack('t', 'start S2 C S2 finish');
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr);
  placeAtStart(phys, logic);
  phys.pos.x = 12; phys.pos.z = -3 * CELL + 12; phys.pos.y = 0.4 + 3;
  assert.equal(logic.update(phys).type, 'checkpoint');
});

console.log('Records');
test('« Effacer les records » vide aussi la copie en mémoire', () => {
  saveRecord('b-x-1', { time: 20.5, date: Date.now(), pv: 20 });
  assert.equal(getRecord('b-x-1').time, 20.5);
  clearRecords();
  assert.equal(getRecord('b-x-1'), null);
});
test('la synchronisation cloud ne ramène pas les records effacés', () => {
  const old = { time: 20, date: 1000, pv: 20 }, fresh = { time: 25, date: 5000, pv: 20 };
  const out = mergeSaves({ recReset: 3000, 'rec3.a': fresh }, { 'rec3.a': old, 'rec3.b': old });
  assert.equal(out['rec3.b'], undefined, 'record ancien effacé');
  assert.equal(out['rec3.a'].time, 25, 'record posterieur gardé');
  assert.equal(out.recReset, 3000);
});
test('circuit de joueur : pièces seulement pour une nouvelle médaille', () => {
  const key = 'u-test-' + Math.random();
  assert.ok(rewardCoins({ tier: 0, difficulty: 2, trackKey: key, user: true }).coins > 0);
  assert.equal(rewardCoins({ tier: 0, difficulty: 2, trackKey: key, user: true }).coins, 0);
  assert.ok(rewardCoins({ tier: 0, difficulty: 1, trackKey: 'b-x-' + key, user: false }).coins > 0, 'circuits intégrés : inchangé');
  void profile;
});

console.log('Vérification serveur');
test('un enregistrement qui se déplierait en trop de pas est refusé avant d\'être déplié', () => {
  const bytes = Buffer.alloc(300000);
  for (let i = 0; i < bytes.length; i += 3) { bytes[i] = 255; bytes[i + 1] = 0; bytes[i + 2] = 1; }
  const b64 = bytes.toString('base64');
  assert.ok(b64.length <= 400000);
  const before = process.memoryUsage().heapUsed;
  assert.throws(() => decodeInputs(b64), /trop long/);
  assert.ok(process.memoryUsage().heapUsed - before < 100e6, 'pas de dépliage en mémoire');
  const tr = scriptTrack('t', 'start S2 finish');
  assert.equal(replayTime(tr, b64), null);
  assert.equal(MAX_REPLAY_STEPS, 72000);
});
test('défi du jour : seules les dates plausibles sont acceptées', () => {
  const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  assert.equal(trackForKey('daily-' + d(0)).kind, 'daily');
  for (const bad of ['daily-abc', 'daily-9999-99-99', 'daily-2020-01-01', 'daily-' + d(30), 'daily-']) assert.throws(() => trackForKey(bad), undefined, bad);
});

test('défi du jour (TECH-079) : une date qui n’existe pas est refusée (2026-02-30, 2026-04-31…), la date relue doit redonner la même chaîne', () => {
  const now = Date.UTC(2026, 1, 28, 12);      // 28 février 2026 (non bissextile), midi UTC : le 30 février serait « reporté » au 2 mars, à 2 jours : l'ancienne fenêtre de 2,5 jours l'acceptait
  assert.equal(trackForKey('daily-2026-02-28', '', now).kind, 'daily');
  assert.equal(trackForKey('daily-2026-03-01', '', now).kind, 'daily', 'demain : accepté');
  for (const bad of ['daily-2026-02-30', 'daily-2026-02-29', 'daily-2026-02-31', 'daily-2026-13-01', 'daily-2026-00-10', 'daily-2026-03-00', 'daily-2026-03-32']) assert.throws(() => trackForKey(bad, '', now), /introuvable/, bad);
  const apr = Date.UTC(2026, 3, 30, 12);      // 30 avril : « 31 avril » est reporté au 1er mai (demain, à 1 jour : accepté par l'ancien code)
  assert.equal(trackForKey('daily-2026-04-30', '', apr).kind, 'daily');
  assert.throws(() => trackForKey('daily-2026-04-31', '', apr), /introuvable/);
  const leap = Date.UTC(2028, 1, 29, 8);       // année bissextile : le 29 février existe
  assert.equal(trackForKey('daily-2028-02-29', '', leap).kind, 'daily');
});
test('défi du jour (TECH-079) : la fenêtre est EXACTEMENT hier, aujourd’hui, demain en UTC, de minuit à minuit, à tout instant de la journée', () => {
  const day = Date.UTC(2026, 5, 10);          // 10 juin 2026, 00:00 UTC
  const key = (n) => 'daily-' + new Date(day + n * 86400000).toISOString().slice(0, 10);
  for (const at of [0, 1, 12 * 3600000, 86400000 - 1]) {    // minuit pile, une milliseconde après, midi, la dernière milliseconde du jour
    const now = day + at;
    for (const n of [-1, 0, 1]) assert.equal(trackForKey(key(n), '', now).kind, 'daily', `jour ${n} à +${at} ms`);
    for (const n of [-3, -2, 2, 3]) assert.throws(() => trackForKey(key(n), '', now), /hors dates valides/, `jour ${n} à +${at} ms`);
  }
  // Une milliseconde avant minuit, « aujourd’hui » est encore le 10 ; à minuit pile c’est le 11 : le 9 sort de la fenêtre.
  assert.equal(trackForKey(key(-1), '', day + 86400000 - 1).kind, 'daily');
  assert.throws(() => trackForKey(key(-1), '', day + 86400000), /hors dates valides/);
  assert.equal(trackForKey(key(2), '', day + 86400000).kind, 'daily');
});
test('défi du jour (TECH-079) : une variante d’un défi inexistant est refusée aussi (la clé de base est vérifiée)', () => {
  const now = Date.UTC(2026, 1, 28, 12);
  assert.throws(() => trackForKey('daily-2026-02-30~v1.veh-moto', '', now), /introuvable/);
  assert.equal(trackForKey('daily-2026-03-01~v1.veh-moto', '', now).kind, 'daily');
});

console.log('Dalles solides');
test('un deltaplane qui monte sous une dalle ne la traverse pas, ni la face d\'une plate-forme', () => {
  const tr = scriptTrack('t', 'start S U S4 finish');
  const phys = new CarPhysics(tr);
  const fly = (x, y, z, yaw, vy, brake) => {
    phys.place(x, y, z, yaw, 1); phys.vehicle = 'glider'; phys.grounded = false; phys.graceT = 0; phys.hazardGrace = 0;
    phys.pos.y = y; phys.prev.y = y; phys.vel.x = -Math.sin(yaw) * 35; phys.vel.z = -Math.cos(yaw) * 35; phys.vel.y = vy;
    let inside = 0; const o = {};
    for (let i = 0; i < 360; i++) {
      phys.step({ steer: 0, throttle: false, brake });
      const s = tr.surfaceAt(phys.pos.x, phys.pos.y + 100, phys.pos.z, o, 1.6);
      if (s.type === 'road' && s.h > 3 && phys.pos.y < s.h - 0.3 && phys.pos.y > s.h - 0.8) inside++;
    }
    return inside;
  };
  assert.equal(fly(12, 1, -3 * CELL + 10, 0, 6, true), 0, 'par dessous');
  assert.equal(fly(12, 3, -8 * CELL, Math.PI, 3, false), 0, 'de face');
});

await finish('Tous les tests des corrections passent.');
