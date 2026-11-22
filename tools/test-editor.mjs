// Tests du pot de peinture de l'éditeur : node tools/test-editor.mjs   (npm test)
import { EditorSession } from '../js/editor.js';
import { Track } from '../js/track.js';
import assert from 'node:assert';

function mk(tool, hoverCell) {
  const track = new Track('t');
  const calls = { commit: 0, changed: 0, flash: [] };
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, tool, level: 0, hover: { cx: hoverCell[0], cz: hoverCell[1] }, surfParam: {},
    app: { ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {} } },
    _commit: () => calls.commit++, _changed: () => calls.changed++,
  });
  return { self, track, calls };
}
const add = (track, t, x, z, extra = {}) => track.add({ t, x, z, l: 0, r: 0, s: '', ...extra });

// 1. Surface : zone de 6 cases glace connectées + 1 isolée + 1 route normale au milieu
{
  const { self, track, calls } = mk('fill-surf:slow', [0, 0]);
  for (let i = 0; i < 6; i++) add(track, 'straight', i, 0, { s: 'ice' });
  add(track, 'straight', 10, 0, { s: 'ice' });          // isolée (pas connectée)
  add(track, 'straight', 0, 1);                          // voisine sans glace : hors zone
  self._floodFill();
  const slow = track.tiles.filter((t) => t.s === 'slow').length;
  assert.equal(slow, 6, 'toute la zone connectée est remplie');
  assert.equal(track.tilesAt(10, 0)[0].s, 'ice', 'zone isolée intacte');
  assert.equal(track.tilesAt(0, 1)[0].s, '', 'voisine hors prédicat intacte');
  assert.equal(calls.commit, 1, 'un seul commit');
}
// 2. Départ / arrivée comme cible : refusé, aucun commit
{
  const { self, track, calls } = mk('fill-surf:slow', [0, 0]);
  add(track, 'start', 0, 0); add(track, 'straight', 1, 0);
  self._floodFill();
  assert.equal(calls.commit, 0); assert.equal(track.tilesAt(1, 0)[0].s, '');
}
// 3. Départ dans la zone (cible = route) : il est sauté
{
  const { self, track, calls } = mk('fill-surf:slow', [1, 0]);
  add(track, 'start', 0, 0); add(track, 'straight', 1, 0); add(track, 'straight', 2, 0);
  self._floodFill();
  assert.equal(track.tilesAt(0, 0)[0].s, '', 'départ jamais modifié');
  assert.equal(track.tilesAt(2, 0)[0].s, 'slow'); assert.equal(calls.commit, 1);
}
// 4. Type de pièce : straight -> platform (même taille), grand virage (size 2) ignoré
{
  const { self, track, calls } = mk('fill-piece:platform', [0, 0]);
  for (let i = 0; i < 4; i++) add(track, 'straight', i, 0);
  self._floodFill();
  assert.equal(track.tiles.filter((t) => t.t === 'platform').length, 4);
  assert.equal(calls.commit, 1);
  // l'index reste cohérent
  for (let i = 0; i < 4; i++) assert.equal(track.tilesAt(i, 0).length, 1);
}
// 5. Valeur start comme pièce : refusé
{
  const { self, track, calls } = mk('fill-piece:start', [0, 0]);
  add(track, 'straight', 0, 0); self._floodFill();
  assert.equal(calls.commit, 0); assert.equal(track.tilesAt(0, 0)[0].t, 'straight');
}
// 6. Gros circuit : 6000 pièces, pas de dépassement de pile, rapide
{
  const { self, track } = mk('fill-surf:ice', [0, 0]);
  for (let x = 0; x < 80; x++) for (let z = 0; z < 75; z++) add(track, 'straight', x, z);
  const t0 = performance.now(); self._floodFill(); const dt = performance.now() - t0;
  assert.equal(track.tiles.filter((t) => t.s === 'ice').length, 6000);
  console.log('6000 pièces en', dt.toFixed(0), 'ms');
}
// 7. Piètes de taille différente jamais retypées
{
  const { self, track } = mk('fill-piece:bigcurve', [0, 0]);
  add(track, 'straight', 0, 0); self._floodFill();
  assert.equal(track.tilesAt(0, 0)[0].t, 'straight');
}
console.log('OK (pot de peinture)');

// ======================================================================================================================================================
// Phase 8 : UN validateur de placement (js/placement.js) pour toutes les écritures de pièces (TECH-003, TECH-052, TECH-053, TECH-037 ; TRANS-01).
import * as THREE from '../js/vendor/three.module.min.js';
import { Inspector } from '../js/inspector.js';
import { spillCells, spillConflicts } from '../js/spill.js';
import { tileEnds, compatiblePlacement } from '../js/connect.js';
import { PIECES } from '../js/pieces.js';
import { CELL, LEVEL_H, ROAD_TOP } from '../js/constants.js';
import { findDuplicateSpot, duplicateSelection } from '../js/editorTools.js';
import { test, finish, precondition } from './harness.mjs';

const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
// Une session d'éditeur sans DOM ni rendu : les vraies méthodes, la garde de placement installée comme par le constructeur (editor.js : _guardTrack).
function session(track, extra = {}) {
  const flash = [];
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, history: [], histSel: [], histRect: [], hIndex: -1, tool: 'straight', opts: {}, rot: 0, level: 0, sel: null, pasting: false, focusLevel: false, gridKey: '',
    inspector: { describe: () => null, restore() {}, refresh() {}, clear() {}, active: false, sel: null }, view: noop, target: { x: 0, z: 0 }, dist: 100,
    app: { audio: noop, ui: { flash: (m) => flash.push(m), modal() {} } }, _refreshUI() {}, _applyDecor() {}, _refreshSelBar() {}, _clearPreview() {},
    setTool(t) { this.tool = t; }, setLevel(l) { this.level = l; }, exportState() { return { code: this.track.encode() }; }, ...extra,
  });
  self._guardTrack();
  self.history = [self._snapshot()]; self.histSel = [null]; self.histRect = [null]; self.hIndex = 0;
  self.flash = flash;
  return self;
}
const aim = (s, cx, cz) => { s.hover = { cx, cz, x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL }; };
const done = (s) => clearTimeout(s._draftT);
const spillViolations = (tr) => tr.tiles.filter((t) => spillConflicts(tr, t).length);
const key = (t) => `${t.t}@${t.x},${t.z},${t.l}`;

console.log('TECH-003 : la pose ne supprime que ce que la pièce posée touche (conflits sur la pièce normalisée ; aperçu = pose)');
// Les quatre cas de la sonde de l'audit. Chaque cas vérifie d'abord (précondition) que la pièce BRUTE, avec l'option armée qu'elle refuse, réservait bien ces pièces :
// c'est ce volume fantôme que l'ancienne pose supprimait.
function probeCase({ tool, opts, at = [0, 0], level = 0, setup }) {
  const tr = new Track('p');
  const s = session(tr, { tool, opts, level });
  aim(s, ...at);
  const raw = s._candidate(), norm = Track.normalize(raw);
  const neighbours = setup(tr, raw, norm);
  const ghost = tr.conflicts(raw).filter((c) => !tr.conflicts(norm).includes(c));
  assert.ok(neighbours.length && neighbours.every((n) => ghost.includes(n)), 'précondition : la pièce brute (option armée) réservait ces pièces');
  const preview = s._placePlan(raw);
  const before = new Set(tr.tiles);
  s._act();
  const removed = [...before].filter((t) => !tr.tiles.includes(t));
  done(s);
  return { tr, s, neighbours, removed, preview, norm };
}
test('cas 1 : option « mur gauche » armée, départ posé en (0, 0) au niveau 0 : la ligne droite du niveau 2 reste (plage brute [−2, 2], réelle [0, 1])', () => {
  const r = probeCase({ tool: 'start', opts: { o: 1 }, setup: (tr) => [tr.add({ t: 'straight', x: 0, z: 0, l: 2, r: 0 })] });
  assert.deepEqual(r.removed, []);
  assert.ok(r.tr.tiles.includes(r.neighbours[0]), 'la ligne droite du niveau 2 est toujours là');
  assert.equal(r.tr.count('start'), 1);
  assert.ok(r.s.flash.some((m) => /Option ignorée : mur/.test(m)), 'l\'option refusée est signalée');
});
test('cas 2 : glissière armée + looping : les pièces voisines (cases balayées par une glissière que le looping refuse) restent', () => {
  const r = probeCase({ tool: 'loop', opts: { mv: 2 }, setup: (tr, raw, norm) => {
    const mine = new Set(Track.cellsOf(norm).map(String));
    return Track.cellsOf(raw).filter((c) => !mine.has(String(c))).map(([x, z]) => tr.add({ t: 'straight', x, z, l: 0, r: 0 }));
  } });
  assert.ok(r.neighbours.length >= 2, r.neighbours.length + ' voisines');
  assert.deepEqual(r.removed, []);
  assert.equal(r.tr.tiles.filter((t) => t.t === 'loop').length, 1, 'le looping est posé (sans glissière)');
  assert.equal(r.norm.mv, 0);
});
test('cas 3 : rotation armée + bifurcation : la couronne de voisines (diagonales comprises) reste', () => {
  const r = probeCase({ tool: 'fork', opts: { mv: 3 }, setup: (tr, raw, norm) => {
    const mine = new Set(Track.cellsOf(norm).map(String));
    return Track.cellsOf(raw).filter((c) => !mine.has(String(c))).map(([x, z]) => tr.add({ t: 'straight', x, z, l: 0, r: 0 }));
  } });
  assert.ok(r.neighbours.length >= 3, r.neighbours.length + ' voisines');
  const [x0, z0] = [r.norm.x, r.norm.z], s = PIECES.fork.size;
  assert.ok(r.neighbours.some((n) => (n.x < x0 || n.x >= x0 + s) && (n.z < z0 || n.z >= z0 + s)), 'une diagonale fait partie des voisines');
  assert.deepEqual(r.removed, []);
});
test('cas 4 : la même pièce déjà posée, option refusée armée (test « pièce identique » sur la pièce normalisée) : rien ne change, ni la pièce ni ses voisines', () => {
  const tr = new Track('p4');
  const start = tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
  const above = tr.add({ t: 'straight', x: 0, z: 0, l: 2, r: 0 });
  const s = session(tr, { tool: 'start', opts: { o: 1 } });
  aim(s, 0, 0);
  const code = tr.encode();
  s._act();
  done(s);
  assert.equal(tr.encode(), code, 'circuit identique');
  assert.ok(tr.tiles.includes(start) && tr.tiles.includes(above), 'mêmes objets');
});
test('aperçu = pose : sur 400 poses au hasard (options armées au hasard), le plan de l\'aperçu annonce exactement les pièces que le clic retire', () => {
  const TYPES = ['straight', 'curve', 'loop', 'fork', 'slope', 'start', 'platform', 'bigcurve', 'ring', 'twist'];
  const OPTS = [{}, { o: 1 }, { o: 2 }, { v: 1 }, { mv: 1 }, { mv: 2 }, { mv: 3 }, { cp: 1 }, { cp: 2 }, { tb: 1 }, { tn: 1 }];
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const tr = new Track('r');
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (const l of [0, 2]) if (rnd() < 0.5) tr.add({ t: 'straight', x, z, l, r: 0 });
  const s = session(tr);
  let removedSome = 0;
  for (let i = 0; i < 400; i++) {
    s.tool = TYPES[Math.floor(rnd() * TYPES.length)]; s.opts = OPTS[Math.floor(rnd() * OPTS.length)]; s.level = Math.floor(rnd() * 3); s.rot = Math.floor(rnd() * 4);
    aim(s, Math.floor(rnd() * 7) - 3, Math.floor(rnd() * 7) - 3);
    s._lastPaint = null;
    const cand = s._candidate(), plan = s._placePlan(cand), before = new Set(tr.tiles);
    s._act();
    const removed = [...before].filter((t) => !tr.tiles.includes(t));
    assert.deepEqual(removed.map(key).sort(), plan.ok ? plan.remove.map(key).sort() : [], `pose ${i} : ${cand.t} ${JSON.stringify(s.opts)}`);
    // et rien de ce qui est retiré n'est hors de l'empreinte réelle de la pièce posée (sauf l'ancien départ)
    const mine = new Set(Track.cellsOf(plan.norm).map(String)), [lo, hi] = Track.range(plan.norm);
    for (const t of removed) if (t.t !== 'start') { const [a, b] = Track.range(t); assert.ok(a <= hi && lo <= b && Track.cellsOf(t).some((c) => mine.has(String(c))), `pose ${i} : ${key(t)} retirée sans être touchée`); }
    removedSome += removed.length;
    assert.ok(tr.count('start') <= 1);
  }
  assert.ok(removedSome > 20, 'le tirage remplace bien des pièces (' + removedSome + ')');
  done(s);
});

console.log('TECH-052 : le débordement d\'une pente posée au mur est refusé par TOUS les chemins de modification');
// Une pente sur le mur gauche en (10, 10) au niveau 6 : son bord incliné déborde en (10, 9) (sa continuation) et en (10, 11) : la case « débordée ».
function slopeScene() {
  const tr = new Track('d', [{ t: 'slope', x: 10, z: 10, l: 6, r: 0, o: 1 }]);
  const slope = tr.tiles[0], [lo, hi] = Track.range(slope);
  const exit = tileEnds(slope).find((e) => e.exit);
  const next = Track.normalize(compatiblePlacement(exit, 'straight', { o: 1 }, {}));
  const nc = Track.cellsOf(next).map(String);
  const [cx, cz] = spillCells(slope).find((c) => !nc.includes(String(c)));
  return { tr, slope, lo, hi, cx, cz };
}
test('mise en scène : une ligne droite posée dans la case débordée, aux mêmes niveaux, est une violation', () => {
  const { tr, cx, cz, lo } = slopeScene();
  assert.deepEqual([cx, cz], [10, 11]);
  tr.add({ t: 'straight', x: cx, z: cz, l: lo, r: 1 });
  assert.equal(spillViolations(tr).length, 2);
});
test('chemin 1 — patch de l\'inspecteur (case X / Z), gizmo, Maj + glisser (niveau) : refusés', () => {
  const { tr, cx, cz, lo } = slopeScene();
  const s = session(tr);
  const o = tr.add({ t: 'straight', x: cx + 3, z: cz, l: lo, r: 1 });
  assert.equal(s._applyTilePatch(o, { x: cx }), false, 'case X');
  assert.equal(o.x, cx + 3);
  assert.match(s._refusalText(s._lastRefusal), /bord incliné/);
  const up = tr.add({ t: 'straight', x: cx, z: cz, l: 10, r: 1 });
  assert.equal(s._applyTilePatch(up, { l: 9 }), false, 'niveau (Maj + glisser, inspecteur)');
  assert.equal(up.l, 10);
  assert.equal(s._applyTilePatch(up, { l: 10.5 }), true, 'au-dessus : permis');
  assert.deepEqual(spillViolations(tr), []);
  done(s);
});
test('chemin 2 — duplication (Ctrl+D de la pièce inspectée, et d\'une zone) : la copie ne se pose jamais dans la case débordée', () => {
  const { tr, cx, cz, lo } = slopeScene();
  const s = session(tr);
  const src = tr.add({ t: 'straight', x: cx, z: cz + 1, l: lo, r: 0 });     // devant elle (cap 0 : z − 1) : la case débordée
  const ins = Object.create(Inspector.prototype);
  Object.assign(ins, { ed: s, sel: { kind: 'tile', obj: src }, clear() {}, select() {} });
  assert.equal(ins.duplicate(), true);
  assert.equal(tr.tiles.length, 3);
  assert.ok(!tr.tilesAt(cx, cz).some((t) => t.t === 'straight'), 'pas dans la case débordée');
  assert.deepEqual(spillViolations(tr), []);
  // Zone : la première place essayée (à gauche d'une zone d'une case… ) est la case débordée.
  const { tr: tr2, cx: x2, cz: z2, lo: l2 } = slopeScene();
  const a = tr2.add({ t: 'straight', x: x2 - 1, z: z2, l: l2, r: 1 });
  const spot = findDuplicateSpot(tr2, { x0: x2 - 1, z0: z2, x1: x2 - 1, z1: z2 }, [a]);
  assert.ok(spot && !(spot.dx === 1 && spot.dz === 0 && spot.dl === 0), 'la case débordée (à droite) est écartée : ' + JSON.stringify(spot));
  duplicateSelection(tr2, [a], [], spot);
  assert.deepEqual(spillViolations(tr2), []);
  done(s);
});
test('chemin 3 — option (mur, checkpoint, ascenseur) qui étend la pièce jusqu\'aux niveaux débordés : refusée (outil d\'option et inspecteur : toggleFlag)', () => {
  const { tr, cx, cz } = slopeScene();
  const s = session(tr);
  const t1 = tr.add({ t: 'straight', x: cx, z: cz, l: 11, r: 1 });
  assert.equal(tr.toggleFlag(t1, 'o', 1), false, 'mur : la plage [9, 13] touche celle de la pente');
  assert.equal(t1.o, 0);
  assert.match(s._refusalText(s._lastRefusal), /bord incliné/);
  const t2 = tr.add({ t: 'straight', x: cx, z: cz, l: 3, r: 1 });
  assert.equal(tr.toggleFlag(t2, 'cp', 1), false, 'checkpoint : le portique monte au niveau 4');
  assert.equal(tr.toggleFlag(t2, 'mv', 1), false, 'ascenseur');
  assert.equal(tr.setMover(t2, 0, 0), false, 'pas de mouvement : rien à régler');
  assert.deepEqual(spillViolations(tr), []);
  // Hors de l'éditeur (course, serveur), le circuit n'a pas de garde : le modèle se comporte comme avant.
  const { tr: free, cx: fx, cz: fz } = slopeScene();
  const f1 = free.add({ t: 'straight', x: fx, z: fz, l: 11, r: 1 });
  assert.equal(free.placementGuard, null);
  assert.equal(free.toggleFlag(f1, 'o', 1), true);
  done(s);
});
test('chemin 4 — type (inspecteur, pot de peinture par type) : une pièce dont la nouvelle hauteur touche les niveaux débordés est refusée', () => {
  const { tr, cx, cz } = slopeScene();
  const s = session(tr);
  const t = tr.add({ t: 'straight', x: cx, z: cz, l: 3, r: 1 });
  assert.equal(s._retypeTile(t, 'slope'), false, 'pente : monte au niveau 4');
  assert.equal(t.t, 'straight');
  s.tool = 'fill-piece:slope'; aim(s, cx, cz); s.hover.x = 0; s.ndc = null;
  s._floodFill();
  assert.equal(t.t, 'straight', 'pot de peinture par type : la pièce est ignorée');
  assert.deepEqual(spillViolations(tr), []);
  done(s);
});
test('chemin 5 — remplissage d\'une zone vide fermée (pot de peinture) : la case débordée reste vide', () => {
  const { tr, cx, cz, lo } = slopeScene();
  for (const [x, z] of [[cx - 1, cz], [cx + 1, cz], [cx, cz + 1]]) tr.add({ t: 'straight', x, z, l: lo, r: 0 });
  const s = session(tr, { tool: 'fill-piece:straight', level: lo });
  aim(s, cx, cz);
  s._fillEmpty();
  assert.ok(!tr.tilesAt(cx, cz).some((t) => t.t === 'straight'), 'case débordée vide');
  assert.ok(s.flash.some((m) => /Aucune pièce posée/.test(m)));
  assert.deepEqual(spillViolations(tr), []);
  done(s);
});
test('caractéristique de famille (inspecteur : ligne droite → pente) et conversion d\'un ancien checkpoint : par le même validateur', () => {
  const { tr, cx, cz } = slopeScene();
  const s = session(tr);
  const t = tr.add({ t: 'straight', x: cx, z: cz, l: 3, r: 1 });
  assert.equal(s._retypeFamily(t, 'slope'), false, 'la pente monterait au niveau 4, dans le bord débordé');
  assert.equal(t.t, 'straight');
  assert.equal(s._retypeFamily(t, 'gentle'), true, 'la pente douce (niveau 3 → 3,5) reste sous la plage de la pente au mur');
  const old = tr.add({ t: 'checkpoint', x: cx + 3, z: cz, l: 3, r: 1 });
  precondition(old.t === 'checkpoint', 'ancien checkpoint lisible');
  assert.equal(s._legacyToOption(old), true, 'conversion permise loin de la pente');
  assert.deepEqual(spillViolations(tr), []);
  done(s);
});

console.log('TECH-053 : « Prolonger » avec le départ choisi');
test('P trois fois avec le départ choisi : un seul départ (l\'ancien est retiré, comme la pose ordinaire)', () => {
  const tr = new Track('e');
  tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
  tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0 });
  const s = session(tr, { tool: 'start' });
  let ok = 0;
  for (let i = 0; i < 3; i++) if (s.extend()) ok++;
  assert.equal(ok, 3, 'les trois prolongements réussissent');
  assert.equal(tr.count('start'), 1, 'un seul départ');
  assert.deepEqual(tr.validate({ test: true }).filter((e) => /départ/i.test(e)), []);
  done(s);
});
test('Prolonger avec une ligne droite : aucun départ retiré, la route s\'allonge', () => {
  const tr = new Track('e2');
  tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
  const s = session(tr, { tool: 'straight' });
  for (let i = 0; i < 3; i++) assert.equal(s.extend(), true);
  assert.equal(tr.count('start'), 1);
  assert.equal(tr.tiles.length, 4);
  done(s);
});

console.log('TECH-037 : gizmo et demi-niveaux');
function gizmo(tile, s) {
  const ins = Object.create(Inspector.prototype);
  Object.assign(ins, { ed: s, sel: { kind: 'tile', obj: tile }, mode: 'translate', proxy: new THREE.Object3D(), tc: { axis: null }, _warned: false });
  return ins;
}
test('pièce au niveau 0,5 glissée d\'une case (flèche X) : reste au niveau 0,5', () => {
  const tr = new Track('g');
  const t = tr.add({ t: 'straight', x: 2, z: 2, l: 0.5, r: 0 });
  const s = session(tr), g = gizmo(t, s);
  g.tc.axis = 'X';
  g.proxy.position.set((t.x + 1.5) * CELL, t.l * LEVEL_H + ROAD_TOP, (t.z + 0.5) * CELL);
  g._onGizmo();
  assert.deepEqual([t.x, t.l], [3, 0.5]);
  g.tc.axis = 'XZ';
  g.proxy.position.set((t.x + 1.5) * CELL, t.l * LEVEL_H + ROAD_TOP + 0.4 * LEVEL_H, (t.z + 1.5) * CELL);      // (une dérive verticale du plan XZ n'est pas lue)
  g._onGizmo();
  assert.deepEqual([t.x, t.z, t.l], [4, 3, 0.5]);
  done(s);
});
test('flèche verticale : le niveau suit par demi-niveaux (0,5 → 1 → 1,5), jamais arrondi à l\'entier', () => {
  const tr = new Track('g2');
  const t = tr.add({ t: 'straight', x: 2, z: 2, l: 0.5, r: 0 });
  const s = session(tr), g = gizmo(t, s);
  g.tc.axis = 'Y';
  const at = (l) => { g.proxy.position.set((t.x + 0.5) * CELL, l * LEVEL_H + ROAD_TOP, (t.z + 0.5) * CELL); g._onGizmo(); return t.l; };
  assert.equal(at(0.6), 0.5);
  assert.equal(at(0.9), 1);
  assert.equal(at(1.4), 1.5);
  done(s);
});
await finish('Éditeur : pot de peinture, validateur de placement (TECH-003, 052, 053), gizmo (TECH-037).');
