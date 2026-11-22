// Défauts du MODÈLE de circuit relevés par l'audit (docs/audit/AUDIT_COMPLET.md) : node tools/test-modele-defauts.mjs   (npm test)
// Même principe que tools/test-noyau-defauts.mjs : `bugConnu(id, …)` réussit tant que le défaut existe et échoue dès qu'il est corrigé ; les tests ordinaires à côté prouvent que la
// mise en scène est bonne.
//   TECH-002  obstacle roulé de 180° (au plafond) : le signe du roulis s'inversait à chaque lecture du code ; signature, clé de classement et vérification instables
//             — CORRIGÉ en phase 7 (0.16.6, normalisation idempotente : js/track/shared.js) : ses reproductions sont devenues des tests ordinaires, ci-dessous
//   TECH-034  décoration aux coordonnées non arrondies : l'état relu depuis le code différait de l'état en mémoire (l'éditeur jetait alors historique, presse-papiers, calques au retour d'un essai)
//   TECH-035  écritures directes de l'inspecteur / du gizmo sans normalisation : rétablir perdu après annuler, solides inclinés dans l'éditeur puis redressés
//             — CORRIGÉS en phase 8 (0.16.7 : une normalisation de décoration, idempotente, pour toutes les écritures : track/edit.js, normalizeDeco, Track.setDeco ; instantané
//             d'historique canonique : editor/history.js) : leurs reproductions sont devenues des tests ordinaires, ci-dessous. La physique ne change pas.
import assert from 'node:assert/strict';
import { test, finish, precondition } from './harness.mjs';
import { Track, scriptTrack, normalizeDeco } from '../js/track.js';
import { DECO_ORDER } from '../js/decoData.js';
import { canonicalSnapshot } from '../js/editor/history.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { verifyPublish, verifyRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { EditorSession } from '../js/editor.js';

const reread = (t, n = 1) => { let c = t; for (let i = 0; i < n; i++) c = Track.decode(c.encode()); return c; };
const base = () => scriptTrack('o', 'start S4 finish');       // 4 cases droites, route en x = 16, de z = -16 à -112 environ

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-002
console.log('TECH-002 : obstacle roulé de π (au plafond), lire → écrire → lire');
// Les piques sont posées loin de la route (x = 300) : elles n'influencent pas la course de vérification du pilote automatique.
const spikesTrack = (rz) => { const t = base(); t.addDeco({ k: 'spikes', x: 300, y: 0, z: -60, ry: 0, s: 1, rz }); return t; };
test('TECH-002 contrôle : un obstacle roulé de π/2 (sur un mur) ou de −π/2 se relit à l\'identique, signature stable ; sans roulis, pas de champ rz', () => {
  for (const rz of [Math.PI / 2, -Math.PI / 2, Math.PI / 4, 0]) {
    const t = spikesTrack(rz), r1 = reread(t), r2 = reread(r1);
    assert.equal(r1.decos[0].rz, r2.decos[0].rz, `rz = ${rz}`);
    assert.equal(r1.signature(), r2.signature(), `signature, rz = ${rz}`);
    assert.equal(r1.signature(), t.signature(), `signature relue = signature en mémoire, rz = ${rz}`);
  }
  assert.ok(!('rz' in spikesTrack(0).decos[0]));
});
test('TECH-002 mise en scène : un obstacle posé avec rz = π est bien gardé tel quel à la pose (la normalisation de addDeco l\'arrondit à 3,142)', () => {
  assert.equal(spikesTrack(Math.PI).decos[0].rz, 3.142);
});
test('TECH-002 (corrigé) : addDeco({ k: \'spikes\', rz: π }) puis Track.decode(t.encode()) répété : roulis, signature et code restent stables', () => {
  let t = spikesTrack(Math.PI);
  const sigs = [t.signature()], rolls = [t.decos[0].rz], codes = [t.encode()];
  for (let i = 0; i < 6; i++) { t = reread(t); sigs.push(t.signature()); rolls.push(t.decos[0].rz); codes.push(t.encode()); }
  assert.equal(new Set(rolls).size, 1, `le roulis change à chaque lecture du code : ${rolls.join(' / ')}`);
  assert.equal(new Set(sigs).size, 1, `la signature (donc la clé de classement u-…) change à chaque lecture : ${sigs.join(' / ')}`);
  assert.equal(new Set(codes).size, 1, 'le code change à chaque lecture');
  assert.equal(rolls[0], 3.142, 'valeur canonique de ±π : +3,142 (celle que l\'ancien code écrivait déjà à la première sauvegarde : les codes déjà enregistrés gardent leur clé)');
});
test('TECH-002 (corrigé) : un code qui contient −3,142 (deuxième génération de l\'ancien code) se relit en +3,142, de façon stable ; la signature est celle de +3,142', () => {
  const ref = spikesTrack(Math.PI);
  const code = ref.encode();
  const old = code.replace(/^SHW3:/, '');
  const data = JSON.parse(Buffer.from(old.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  precondition(data.o[0][13] === 3.142, 'le roulis est le 14e champ de la décoration');
  data.o[0][13] = -3.142;
  const neg = 'SHW3:' + Buffer.from(JSON.stringify(data)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const t = Track.decode(neg);
  assert.equal(t.decos[0].rz, 3.142);
  assert.equal(t.signature(), ref.signature());
  assert.equal(reread(t, 3).encode(), t.encode());
});

// Une vraie course de vérification (pilote automatique) sur ce circuit, puis la marque « vérifié » comme le fait le jeu (setVerified), puis les deux contrôles du serveur.
function verifiedTrack() {
  const t = spikesTrack(Math.PI);
  const sim = new Simulation(t), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(t.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 60; i++) {
    const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') { t.setVerified(sim.logic.time); return { t, inputs: rec.encode(), time: sim.logic.time }; }
  }
  throw new Error('le pilote automatique ne termine pas');
}
test('TECH-002 contrôle : sans roulis de π, la même chaîne (vérifier → code → verifyPublish / verifyRun) est acceptée par le serveur', () => {
  const t = base(); t.addDeco({ k: 'spikes', x: 300, y: 0, z: -60, ry: 0, s: 1, rz: Math.PI / 2 });
  const sim = new Simulation(t), rec = new InputRecorder(); sim.start();
  const bot = new Autopilot(t.path, { latLimit: 56 * 0.8 }); bot.reset(sim.phys);
  let time = 0;
  for (let i = 0; i < 120 * 60 && !time; i++) { const inp = bot.control(sim.phys); inp.steer = quantSteer(inp.steer); rec.push(inp, false); const ev = sim.step(inp); if (sim.lost) sim.rewind(); if (ev && ev.type === 'finish') time = sim.logic.time; }
  precondition(time > 0, 'la course de vérification est terminée');
  t.setVerified(time);
  const inputs = rec.encode();
  const pub = verifyPublish({ code: t.encode(), inputs, time, physVer: PHYS_VER });
  assert.equal(pub.ok, true, pub.error);
  const run = verifyRun({ trackKey: t.userKey, code: t.encode(), inputs, time, physVer: PHYS_VER });
  assert.equal(run.ok, true, run.error);
});
test('TECH-002 (corrigé) : verifyPublish accepte le code d\'un circuit vérifié contenant un obstacle roulé de π', () => {
  const { t, inputs, time } = verifiedTrack();
  precondition(t.verified, 'le circuit est vérifié en mémoire');
  const r = verifyPublish({ code: t.encode(), inputs, time, physVer: PHYS_VER });
  assert.equal(r.ok, true, 'verifyPublish devrait accepter le code d\'un circuit vérifié : ' + r.error);
});
test('TECH-002 (corrigé) : verifyRun accepte un temps envoyé avec la clé calculée en course (obstacle roulé de π)', () => {
  const { t, inputs, time } = verifiedTrack();
  const r = verifyRun({ trackKey: t.userKey, code: t.encode(), inputs, time, physVer: PHYS_VER });
  assert.equal(r.ok, true, 'le serveur devrait accepter le temps (la clé calculée en course doit être celle du code relu) : ' + r.error);
});
test('TECH-002 (corrigé) : un circuit vérifié reste vérifié après lecture de son code, plusieurs fois (retour de la vérification dans l\'éditeur)', () => {
  const { t } = verifiedTrack();
  for (let i = 1; i <= 4; i++) assert.equal(reread(t, i).verified, true, `après ${i} lecture(s) : le circuit vérifié reste « vérifié »`);
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-034 / 035
console.log('TECH-034 / 035 : décorations aux coordonnées non arrondies, écritures directes');
// Une session d'éditeur sans DOM ni rendu : les vraies méthodes (EditorSession.prototype : _snapshot, _commit, undo, redo), des bouchons pour l'interface (même procédé que test-audit-editeur).
const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
const session = (track) => {
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, history: [], histSel: [], hIndex: -1, histRect: [], inspector: { describe: () => null, restore() {}, refresh() {}, duplicate() { return false; } },
    app: { audio: noop, ui: { flash() {}, modal() {} } }, _refreshUI() {}, _applyDecor() {}, gridKey: '', tool: 'select', sel: null, pasting: false, level: 0, focusLevel: false,
    _refreshSelBar() {}, _clearPreview() {}, setTool(t) { this.tool = t; }, setLevel(l) { this.level = l; }, hover: null, view: noop, exportState() { return { code: this.track.encode() }; },
  });
  self.history = [self._snapshot()]; self.histSel = [null]; self.histRect = [null]; self.hIndex = 0;
  return self;
};
const done = (s) => clearTimeout(s._draftT);

// Posé « Libre » comme le fait l'éditeur par défaut. Phase 8 (TECH-034, TECH-035 — CORRIGÉS) : la normalisation de décoration du modèle (track/edit.js : normalizeDeco), appelée
// par toutes les écritures (ajout, modification par Track.setDeco, restauration), arrondit au pas du code : la mémoire, l'instantané et le code relu sont le même état.
const FREE = { k: 'cone', x: 16.123456, y: 0.987654, z: -40.5555, ry: 0.123456, s: 1.1 };
test('TECH-034 contrôle : une décoration posée sur la grille du code (centièmes, ry au millième) se relit à l\'identique, en mémoire et dans l\'instantané de l\'éditeur', () => {
  const t = base(); t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 });
  const s = session(t), s2 = session(reread(t));
  assert.equal(s._snapshot(), s2._snapshot());
  assert.deepEqual(reread(t).decos, t.decos);
  done(s); done(s2);
});
test('TECH-034 (corrigé) : coordonnées libres arrondies DÈS l\'écriture, au pas du code (x, y, z au centième, ry au millième) ; un circuit généré garde ses valeurs exactes', () => {
  const t = base(); t.addDeco(FREE);
  const d = t.decos[0];
  assert.deepEqual([d.x, d.y, d.z, d.ry], [16.12, 0.99, -40.56, 0.123]);
  const r = reread(t).decos[0];
  assert.deepEqual([r.x, r.y, r.z, r.ry], [16.12, 0.99, -40.56, 0.123]);
  const g = base(); g.addDeco(FREE, { exact: true });
  assert.equal(g.decos[0].x, 16.123456, 'exact (circuits officiels, scriptTrack) : la valeur calculée est gardée, leur physique ne change pas');
});
test('TECH-034 (corrigé) : décoration aux coordonnées non arrondies : l\'état relu depuis le code égale l\'état en mémoire', () => {
  const t = base(); t.addDeco(FREE);
  assert.deepEqual(reread(t).decos, t.decos, 'décorations relues du code ≠ décorations en mémoire');
});
test('TECH-034 (corrigé) : retour d\'un essai : l\'instantané relu depuis le code égale l\'instantané quitté (historique et calques gardés)', () => {
  // Le retour d'un essai : l'éditeur ne garde historique / presse-papiers / calques que si l'instantané du circuit rouvert (depuis son code) est celui qu'il a quitté (editor.js, `kept`).
  const t = base(); t.addDeco(FREE);
  const s = session(t);
  const quitte = s._snapshot();
  const rouvert = session(Track.decode(s.exportState().code))._snapshot();
  done(s);
  assert.equal(rouvert, quitte, 'l\'instantané du circuit rouvert diffère : l\'état mis de côté (historique, presse-papiers, options armées, calques masqués ou verrouillés) est jeté');
});
test('TECH-034 (corrigé) : la comparaison du retour d\'essai se fait sur la forme canonique : même un instantané gardé avec des valeurs plus fines (session d\'avant la 0.16.7) est reconnu', () => {
  const t = base(); t.addDeco(FREE);
  const raw = JSON.parse(session(t)._snapshot());
  raw.d[0][1] = 16.123456; raw.d[0][4] = 0.123456;      // (ce qu'écrivait l'ancien instantané : les valeurs brutes)
  const rouvert = session(Track.decode(t.encode()))._snapshot();
  assert.notEqual(JSON.stringify(raw), rouvert, 'mise en scène : les deux textes diffèrent');
  assert.equal(canonicalSnapshot(JSON.stringify(raw)), rouvert);
});

test('TECH-035 contrôle : annuler puis rétablir retrouve, à l\'identique, l\'instantané du pas d\'historique quand les valeurs sont celles du code', () => {
  const t = base(); const s = session(t);
  t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 }); s._commit();
  t.setDeco(t.decos[0], { ry: 0.5 }); s._commit();
  s.undo(); s.redo();
  assert.equal(s._snapshot(), s.history[s.hIndex]);
  done(s);
});
test('TECH-035 (corrigé) : inclinaison saisie à l\'inspecteur (37,5°), annuler puis rétablir : le circuit égale l\'instantané courant, la pile « rétablir » reste intacte', () => {
  // L'inspecteur écrit par Track.setDeco (inspector/bodies.js), comme le gizmo et Maj + glisser.
  const t = base(); const s = session(t);
  t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 }); s._commit();
  assert.equal(t.setDeco(t.decos[0], { rx: 37.5 * Math.PI / 180 }), true); s._commit();
  assert.equal(s.hIndex, 2);
  assert.equal(t.decos[0].rx, 0.654, 'au millième, comme le code');
  s.undo(); s.redo();
  assert.equal(s._snapshot(), s.history[s.hIndex], 'après annuler puis rétablir, le circuit égale l\'instantané courant');
  s.undo();
  s._commit();      // (un clic qui ne change rien : avant, il empilait un pas fantôme et effaçait la pile « rétablir »)
  assert.equal(s.history.length, 3, 'la pile « rétablir » est intacte');
  s.redo();
  assert.equal(t.decos[0].rx, 0.654);
  done(s);
});
test('TECH-035 : une décoration déplacée (Maj + souris, gizmo : x, y, z) se restaure à l\'identique', () => {
  const t = base(); const s = session(t);
  t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 }); s._commit();
  t.setDeco(t.decos[0], { y: t.decos[0].y + 0.00456, x: t.decos[0].x + 0.0123 }); s._commit();
  s.undo(); s.redo();
  const apres = s._snapshot();
  done(s);
  assert.equal(apres, s.history[s.hIndex]);
});
test('TECH-035 (corrigé) : un solide ne reçoit ni inclinaison ni roulis : l\'état en mémoire est celui que la course et le code relu verront (droit)', () => {
  const t = base(); t.addDeco({ k: 'pillar', x: 80, y: 0, z: -60, ry: 0, s: 1 });
  const d = t.decos[0];
  precondition(!('rx' in d) && !('rz' in d), 'la pose normalise : un solide neuf est droit');
  assert.equal(t.setDeco(d, { rx: 0.4, rz: 0.2 }), true);
  assert.ok(!('rx' in d) && !('rz' in d), 'le solide reste droit en mémoire');
  const relu = reread(t).decos[0];
  assert.deepEqual(relu, d, 'le solide relu est celui de la mémoire');
});
test('normalisation de décoration idempotente : 3 000 décorations au hasard (toutes sortes, valeurs hors bornes, angles quelconques) : normaliser deux fois = une fois, et écrire puis relire le code ne change rien', () => {
  let seed = 11; const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const kinds = DECO_ORDER.filter((k) => k !== 'custom');
  for (let i = 0; i < 3000; i++) {
    const d = { k: kinds[Math.floor(r() * kinds.length)], x: (r() - 0.5) * 2000, y: (r() - 0.3) * 80, z: (r() - 0.5) * 2000, ry: (r() - 0.5) * 40, s: r() * 30, c: Math.floor(r() * 9), ph: r() * 1.5, rx: r() < 0.5 ? (r() - 0.5) * 30 : 0, rz: r() < 0.5 ? (r() - 0.5) * 30 : 0, g: Math.floor(r() * 70) };
    const n1 = normalizeDeco(d), n2 = normalizeDeco(n1);
    assert.deepEqual(n2, n1, JSON.stringify(d));
    const t = base(); t.addDeco(d);
    assert.deepEqual(reread(t).decos, t.decos, JSON.stringify(d));
  }
});

await finish('Modèle de circuit : TECH-002, TECH-034 et TECH-035 corrigés (tests de régression).');
