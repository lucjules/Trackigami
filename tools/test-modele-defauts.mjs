// Défauts CONNUS du modèle de circuit (phase « filet de sécurité », audit docs/audit/AUDIT_COMPLET.md) : node tools/test-modele-defauts.mjs   (npm test)
// Même principe que tools/test-noyau-defauts.mjs : `bugConnu(id, …)` réussit tant que le défaut existe et échoue dès qu'il est corrigé ; les tests ordinaires à côté prouvent que la
// mise en scène est bonne. Rien n'est corrigé ici.
//   TECH-002  obstacle roulé de 180° (au plafond) : le signe du roulis s'inverse à chaque lecture du code ; signature, clé de classement et vérification instables
//   TECH-034  décoration aux coordonnées non arrondies : l'état relu depuis le code diffère de l'état en mémoire (l'éditeur jette alors historique, presse-papiers, calques au retour d'un essai)
//   TECH-035  écritures directes de l'inspecteur / du gizmo sans normalisation : rétablir perdu après annuler, solides inclinés dans l'éditeur puis redressés
// Corriger TECH-002 change des clés de circuits existantes (voir TRANS-12 de l'audit) ; TECH-034 et 035 ne touchent pas la physique.
import assert from 'node:assert/strict';
import { test, finish, bugConnu, precondition } from './harness.mjs';
import { Track, scriptTrack } from '../js/track.js';
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
bugConnu('TECH-002', () => {
  let t = spikesTrack(Math.PI);
  const sigs = [t.signature()], rolls = [t.decos[0].rz];
  for (let i = 0; i < 4; i++) { t = reread(t); sigs.push(t.signature()); rolls.push(t.decos[0].rz); }
  assert.equal(new Set(rolls).size, 1, `le roulis change à chaque lecture du code : ${rolls.join(' / ')}`);
  assert.equal(new Set(sigs).size, 1, `la signature (donc la clé de classement u-…) change à chaque lecture : ${sigs.join(' / ')}`);
}, 'addDeco({ k: \'spikes\', rz: π }) puis Track.decode(t.encode()) répété : roulis et signature restent stables');

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
bugConnu('TECH-002', () => {
  const { t, inputs, time } = verifiedTrack();
  precondition(t.verified, 'le circuit est vérifié en mémoire');
  const r = verifyPublish({ code: t.encode(), inputs, time, physVer: PHYS_VER });
  assert.equal(r.ok, true, 'verifyPublish devrait accepter le code d\'un circuit vérifié : ' + r.error);
}, 'verifyPublish accepte le code d\'un circuit vérifié contenant un obstacle roulé de π (aujourd\'hui : « Circuit non vérifié »)');
bugConnu('TECH-002', () => {
  const { t, inputs, time } = verifiedTrack();
  const r = verifyRun({ trackKey: t.userKey, code: t.encode(), inputs, time, physVer: PHYS_VER });
  assert.equal(r.ok, true, 'le serveur devrait accepter le temps (la clé calculée en course doit être celle du code relu) : ' + r.error);
}, 'verifyRun accepte un temps envoyé avec la clé calculée en course (aujourd\'hui : « Le code du circuit ne correspond pas »)');
bugConnu('TECH-002', () => {
  const { t } = verifiedTrack();
  assert.equal(reread(t).verified, true, 'le circuit vérifié reste « vérifié » quand l\'éditeur le relit depuis son code (« Retour à l\'éditeur »)');
}, 'un circuit vérifié reste vérifié après lecture de son code (retour de la vérification dans l\'éditeur)');

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

// Posé « Libre » comme le fait l'éditeur par défaut : aucune valeur n'est arrondie en mémoire (addDeco ne touche ni x, y, z ni ry).
const FREE = { k: 'cone', x: 16.123456, y: 0.987654, z: -40.5555, ry: 0.123456, s: 1.1 };
test('TECH-034 contrôle : une décoration posée sur la grille du code (centièmes, ry au millième) se relit à l\'identique, en mémoire et dans l\'instantané de l\'éditeur', () => {
  const t = base(); t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 });
  const s = session(t), s2 = session(reread(t));
  assert.equal(s._snapshot(), s2._snapshot());
  assert.deepEqual(reread(t).decos, t.decos);
  done(s); done(s2);
});
test('TECH-034 mise en scène : coordonnées libres gardées telles quelles en mémoire, arrondies dans le code (x, y, z au centième, ry au millième)', () => {
  const t = base(); t.addDeco(FREE);
  assert.equal(t.decos[0].x, 16.123456);
  const r = reread(t).decos[0];
  assert.deepEqual([r.x, r.y, r.z, r.ry], [16.12, 0.99, -40.56, 0.123]);
});
bugConnu('TECH-034', () => {
  const t = base(); t.addDeco(FREE);
  assert.deepEqual(reread(t).decos, t.decos, 'décorations relues du code ≠ décorations en mémoire');
}, 'décoration aux coordonnées non arrondies : l\'état relu depuis le code égale l\'état en mémoire');
bugConnu('TECH-034', () => {
  // Le retour d'un essai : l'éditeur ne garde historique / presse-papiers / calques que si l'instantané du circuit rouvert (depuis son code) est celui qu'il a quitté (editor.js, `kept`).
  const t = base(); t.addDeco(FREE);
  const s = session(t);
  const quitte = s._snapshot();
  const rouvert = session(Track.decode(s.exportState().code))._snapshot();
  done(s);
  assert.equal(rouvert, quitte, 'l\'instantané du circuit rouvert diffère : l\'état mis de côté (historique, presse-papiers, options armées, calques masqués ou verrouillés) est jeté');
}, 'retour d\'un essai : l\'instantané relu depuis le code égale l\'instantané quitté (sinon historique et calques perdus)');

test('TECH-035 contrôle : annuler puis rétablir retrouve, à l\'identique, l\'instantané du pas d\'historique quand les valeurs sont celles du code', () => {
  const t = base(); const s = session(t);
  t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 }); s._commit();
  t.decos[0].ry = 0.5; t.version++; s._commit();
  s.undo(); s.redo();
  assert.equal(s._snapshot(), s.history[s.hIndex]);
  done(s);
});
bugConnu('TECH-035', () => {
  // Inclinaison saisie dans l'inspecteur (inspector/bodies.js : d.rx = v * π / 180, écriture directe), puis annuler / rétablir.
  const t = base(); const s = session(t);
  t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 }); s._commit();
  t.decos[0].rx = 37.5 * Math.PI / 180; t.version++; s._commit();      // 0,6544984… rad : jamais arrondi en mémoire
  assert.equal(s.hIndex, 2);
  s.undo(); s.redo();
  const apres = s._snapshot();
  done(s);
  assert.equal(apres, s.history[s.hIndex], 'après annuler puis rétablir, le circuit n\'égale plus l\'instantané courant : le premier clic suivant empile un pas fantôme et efface la pile « rétablir »');
}, 'inclinaison saisie à l\'inspecteur, annuler puis rétablir : le circuit égale l\'instantané courant (la pile « rétablir » reste intacte)');
test('TECH-035 NON reproduit pour les positions : une décoration déplacée par écriture directe (Maj + souris, gizmo : x, y, z) se restaure à l\'identique, car addDeco ne normalise que rx et rz', () => {
  const t = base(); const s = session(t);
  t.addDeco({ k: 'cone', x: 16.12, y: 0.98, z: -40.55, ry: 0.123, s: 1.1 }); s._commit();
  t.decos[0].y += 0.00456; t.decos[0].x += 0.00123; t.version++; s._commit();
  s.undo(); s.redo();
  const apres = s._snapshot();
  done(s);
  assert.equal(apres, s.history[s.hIndex]);
});
bugConnu('TECH-035', () => {
  // Un solide (pilier) incliné dans l'éditeur (écriture directe de rx / rz par l'inspecteur, qui les propose pour toute décoration non obstacle) : il redevient droit au premier essai,
  // enregistrement ou annulation, alors que l'éditeur l'affichait incliné ; la physique le voit droit.
  const t = base(); t.addDeco({ k: 'pillar', x: 80, y: 0, z: -60, ry: 0, s: 1 });
  const d = t.decos[0];
  precondition(!('rx' in d) && !('rz' in d), 'la pose normalise : un solide neuf est droit');
  d.rx = 0.4; d.rz = 0.2; t.version++;
  const relu = reread(t).decos[0];
  assert.deepEqual([relu.rx || 0, relu.rz || 0], [d.rx, d.rz], 'le solide incliné en mémoire est relu droit : l\'éditeur montrait une inclinaison que la course ne verra jamais');
}, 'solide incliné par écriture directe : l\'état relu égale l\'état en mémoire (aujourd\'hui : le solide redevient droit)');

await finish('Les défauts connus du modèle sont tous reproduits (ou corrigés : voir les échecs ci-dessus).');
