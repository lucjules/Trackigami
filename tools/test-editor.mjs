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

console.log('TECH-034 / 035 : décorations écrites par le gizmo et Maj + glisser, annuler / rétablir');
const decoTrack = () => { const t = new Track('dd'); t.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); return t; };
const decoGizmo = (s, d, mode) => {
  const ins = Object.create(Inspector.prototype);
  Object.assign(ins, { ed: s, sel: { kind: 'deco', obj: d }, mode, proxy: new THREE.Object3D(), tc: { axis: 'XYZ' } });
  s.deco = { snap: 0 }; s.inspector = { ...s.inspector, dragging: false };
  return ins;
};
test('gizmo, décoration libre : position et angles écrits au pas du code ; annuler / rétablir intact, aucun pas fantôme', () => {
  const tr = decoTrack(); const s = session(tr);
  const d = tr.addDeco({ k: 'cone', x: 10, y: 1, z: 10, ry: 0, s: 1 }); s._commit();
  const g = decoGizmo(s, d, 'translate');
  g.proxy.position.set(12.345678, 1.98765, -3.14159);
  g._onGizmo(); s._commit();
  assert.deepEqual([d.x, d.y, d.z], [12.35, 1.99, -3.14]);
  g.mode = 'rotate'; g.proxy.rotation.order = 'YXZ'; g.proxy.rotation.set(0.33333, 1.23456, -0.1111);
  g._onGizmo(); s._commit();
  assert.deepEqual([d.ry, d.rx, d.rz], [1.235, 0.333, -0.111]);
  const n = s.history.length;
  s.undo(); s.redo();
  assert.equal(s._snapshot(), s.history[s.hIndex]);
  s.undo(); s._commit();
  assert.equal(s.history.length, n, 'la pile « rétablir » reste intacte');
  done(s);
});
test('gizmo, solide (pilier) : seulement le cap, jamais d\'inclinaison ni de roulis', () => {
  const tr = decoTrack(); const s = session(tr);
  const d = tr.addDeco({ k: 'pillar', x: 10, y: 0, z: 10, ry: 0, s: 1 });
  const g = decoGizmo(s, d, 'rotate');
  g.proxy.rotation.order = 'YXZ'; g.proxy.rotation.set(0.4, 0.7, 0.2);
  g._onGizmo();
  assert.ok(!('rx' in d) && !('rz' in d));
  assert.ok(d.ry > 0.6 && d.ry < 0.8, 'le cap suit : ' + d.ry);
  done(s);
});
test('Maj + glisser, décoration : la hauteur suit le geste au centième (même par pas plus fins que le centimètre), un seul pas d\'annulation, rétablir intact', () => {
  const tr = decoTrack(); const s = session(tr);
  const d = tr.addDeco({ k: 'cone', x: 10, y: 1, z: 10, ry: 0, s: 1 }); s._commit();
  Object.assign(s, { tool: 'inspect', camLocked: false, _metersPerPixel: () => 0.0031 });
  Object.defineProperty(s, 'menuOpen', { value: false });
  s.inspector = { ...s.inspector, dragging: false, sel: { kind: 'deco', obj: d } };
  for (let i = 0; i < 10; i++) s._shiftY(-1);      // 10 × 3,1 mm vers le haut
  s._endShiftY();
  assert.equal(d.y, 1.03, 'le reste sous le centimètre n\'est pas perdu');
  assert.equal(s.history.length, 3);
  s.undo(); assert.equal(tr.decos[0].y, 1); s.redo(); assert.equal(tr.decos[0].y, 1.03);
  assert.equal(s._snapshot(), s.history[s.hIndex]);
  done(s);
});
test('sélection : déplacer, pivoter, monter une zone avec des décorations libres : elles restent au pas du code, annuler / rétablir intact', () => {
  const tr = decoTrack(); const s = session(tr);
  tr.add({ t: 'straight', x: 1, z: 0, l: 0, r: 0 });
  tr.addDeco({ k: 'cone', x: 40.004, y: 0.333, z: 8.123, ry: 0.4444, s: 1.234 }); s._commit();
  s.sel = { x0: 1, z0: 0, x1: 1, z1: 0 }; s.tool = 'select';
  s.moveSel(1, 0); s.rotateSel(); s.shiftSel(1);
  const d = tr.decos[0];
  for (const k of ['x', 'y', 'z', 's']) assert.equal(d[k], +d[k].toFixed(2), k);
  assert.equal(d.ry, +d.ry.toFixed(3));
  const n = s.history.length;
  while (s.hIndex > 0) s.undo();
  while (s.hIndex < n - 1) { s.redo(); assert.equal(s._snapshot(), s.history[s.hIndex]); }
  done(s);
});

// ======================================================================================================================================================
// Phase 9 : défauts indépendants de l'éditeur (TECH-036, 038, 054, 055, 056, 057, 058, 059, 062).
import { scriptsToLogic } from '../js/logicText.js';
import { clipWithoutGroups } from '../js/editorTools.js';
import { scriptTrack } from '../js/track.js';
import { canonicalSnapshot, withoutVerification, testGravity } from '../js/editor/history.js';
const layerSession = (track, extra = {}) => { const s = session(track, extra); s.hiddenGroups = new Set(); s.lockedGroups = new Set(); s.view = { setGroupVisible() {}, rebuild() {} }; s.circuitId = 'c-test'; return s; };

console.log('TECH-036 : calques verrouillés ou masqués et décorations');
test('gomme et clic droit (outil décoration) n\'effacent pas une décoration d\'un calque verrouillé ou masqué ; la pipette ne la reprend pas ; un calque libre reste effaçable', () => {
  for (const mode of ['locked', 'hidden']) {
    const tr = decoTrack(); const s = layerSession(tr);
    const d = tr.addDeco({ k: 'cone', x: 20, y: 0, z: 20, ry: 0, s: 1, g: 2 });
    if (mode === 'locked') s.setGroupLocked(2, true); else s.setGroupHidden(2, true);
    s.eraseFilter = 'all'; s.ndc = { x: 9, y: 9 }; s.raycaster = { setFromCamera() {} };      // (aucun rayon : repli « décoration la plus proche »)
    aim(s, 0, 0); s.hover.x = 20; s.hover.z = 20;
    for (const tool of ['erase', 'deco:cone']) { s.tool = tool; s._erase(); assert.deepEqual(tr.decos, [d], `${mode} / ${tool}`); }
    s.tool = 'deco:tree'; s._pick();
    assert.equal(s.tool, 'deco:tree', mode + ' : la pipette ne reprend pas la décoration du calque');
    assert.equal(s._nearestDeco(), null);
    if (mode === 'locked') s.setGroupLocked(2, false); else s.setGroupHidden(2, false);
    s.tool = 'erase'; s._erase();
    assert.equal(tr.decos.length, 0, mode + ' : calque libre : la gomme efface');
    done(s);
  }
});

console.log('TECH-038 : groupes cités par la logique');
test('un groupe cité par la logique (caché au départ, vidé de ses pièces) n\'est pas proposé par « Nouveau groupe » ni réattribué par la conversion des déclencheurs', () => {
  const tr = decoTrack(); const s = layerSession(tr);
  tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0 });
  tr.setLogic({ v: 1, off: [1], vars: 0, rules: [{ on: ['zone', 2], if: [['hidden', 3]], do: [['show', 1], ['toggle', 4]], once: true }] });
  assert.deepEqual(tr.usedGroups(), [], 'mise en scène : aucune pièce rangée dans un groupe');
  assert.deepEqual(tr.logicGroups(), [1, 2, 3, 4]);
  assert.equal(s._freeGroup(), 5, '« Nouveau groupe » ne redonne ni 1, ni 2, 3, 4');
  tr.setParams({ scripts: [{ a: 'msg', x: 0, z: -1, v: 'Ici' }] });
  const conv = scriptsToLogic(tr);
  assert.ok(conv, 'la conversion est possible');
  assert.deepEqual(conv.assign.map(([, g]) => g), [5], 'la route de la case est rangée dans le groupe 5, pas dans un groupe de la logique');
  assert.deepEqual(layerSession(new Track('x'))._freeGroup(), 1);
  done(s);
});

console.log('TECH-057 : tout sélectionner');
test('Tout sélectionner : les décorations hors de l\'emprise des pièces sont incluses (Suppr, copier, déplacer les prennent) ; un circuit sans pièce mais avec décorations se sélectionne', () => {
  const tr = decoTrack(); const s = layerSession(tr);
  const far = tr.addDeco({ k: 'tree', x: 400, y: 0, z: -300, ry: 0, s: 1 });
  tr.addDeco({ k: 'tree', x: -90, y: 0, z: 70, ry: 0, s: 1 });
  s.selectAll();
  assert.equal(s._selDecos().length, 2);
  assert.ok(s._selDecos().includes(far));
  s.deleteSel(true);
  assert.equal(tr.decos.length, 0);
  const only = new Track('d'); only.addDeco({ k: 'tree', x: 50, y: 0, z: 50, ry: 0, s: 1 });
  const s2 = layerSession(only); s2.selectAll();
  assert.ok(s2.sel && s2._selDecos().length === 1);
  done(s); done(s2);
});

console.log('TECH-058 : coller dans un autre circuit');
test('coller dans un AUTRE circuit (ou un prefab) remet les groupes à 0 ; dans le même circuit, ils sont gardés', () => {
  const src = decoTrack(); const s1 = layerSession(src);
  src.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0, g: 3 }); src.addDeco({ k: 'tree', x: 20, y: 0, z: -40, ry: 0, s: 1, g: 3 });
  s1.sel = { x0: 0, z0: -2, x1: 0, z1: -1 }; assert.equal(s1.copySel(true), true);
  const clip = s1.clip;
  assert.ok(clip.tiles.some((t) => t.g === 3), 'mise en scène : le presse-papiers porte le groupe 3');
  // même circuit
  aim(s1, 5, 5); s1.doPaste();
  assert.ok(src.tiles.filter((t) => t.g === 3).length >= 2 && src.decos.every((d) => d.g === 3), 'même circuit : groupe gardé');
  // autre circuit (autre session) : groupes à 0
  const dst = decoTrack(); const s2 = layerSession(dst); s2.circuitId = 'c-autre'; s2.clip = clip; aim(s2, 5, 5); s2.doPaste();
  assert.ok(dst.tiles.length > 1 && dst.tiles.every((t) => !t.g) && dst.decos.length && dst.decos.every((d) => !d.g), 'autre circuit : groupes à 0');
  assert.match(s2.app.ui.last || s2.flash.join('|'), /groupes/);
  // prefab (origine inconnue)
  const s3 = layerSession(decoTrack()); const bare = { ...clip }; delete bare.origin; s3.clip = bare; aim(s3, 5, 5); s3.doPaste();
  assert.ok(s3.track.tiles.every((t) => !t.g));
  assert.equal(clipWithoutGroups({ ...clip }).reset, 2);
  // rotation du presse-papiers : l'origine suit
  s1.clip = clip; s1.rotateClipboard(); assert.equal(s1.clip.origin, 'c-test');
  done(s1); done(s2); done(s3);
});

console.log('TECH-054 : un autre circuit chargé dans la session');
const verifiedTrack = () => { const t = scriptTrack('v', 'start S3 finish'); t.setVerified(12.345); return t; };
const loadable = (track) => { const s = layerSession(track); s.target = { x: 0, z: 0, set() {} }; s._savedSnap = s._saveKey(); return s; };
test('importer après avoir masqué et verrouillé des calques : calques remis à zéro (les groupes du nouveau circuit sont visibles et modifiables) ; le presse-papiers sait qu\'il vient d\'un autre circuit', () => {
  const tr = verifiedTrack(); tr.tiles[1].g = 1; tr.version++;
  const shown = [];
  const s = loadable(tr); s.view = { setGroupVisible: (g, v) => shown.push([g, v]), rebuild() {} };
  s.setGroupHidden(1, true); s.setGroupLocked(2, true); shown.length = 0;
  const before = s.circuitId;
  const other = scriptTrack('autre', 'start S2 finish'); other.tiles[1].g = 1; other.tiles[2].g = 2;
  s.loadCode(other.encode());
  assert.equal(s.hiddenGroups.size, 0); assert.equal(s.lockedGroups.size, 0);
  assert.deepEqual(shown, [[1, true]], 'le groupe 1 est ré-affiché dans la vue');
  assert.ok(s._layerOk(s.track.tiles[1]) && s._layerOk(s.track.tiles[2]), 'les groupes 1 et 2 du circuit importé sont libres');
  assert.notEqual(s.circuitId, before);
  s.newTrack();
  assert.equal(s.hiddenGroups.size + s.lockedGroups.size, 0);
  done(s);
});
test('annuler un « Nouveau » ou un import rend le circuit d\'avant AVEC sa vérification ; rétablir rend le nouveau (non vérifié)', () => {
  for (const how of ['newTrack', 'loadCode']) {
    const tr = verifiedTrack(), sig = tr.signature();
    precondition(tr.verified, 'le circuit est vérifié');
    const s = loadable(tr);
    if (how === 'newTrack') s.newTrack(); else s.loadCode(scriptTrack('autre', 'start S2 finish').encode());
    assert.equal(tr.verified, false, how + ' : le nouveau circuit n\'est pas vérifié');
    s.undo();
    assert.equal(tr.signature(), sig, how + ' : le circuit d\'avant est revenu');
    assert.equal(tr.verified, true, how + ' : avec sa vérification');
    assert.equal(tr.vt, 12.345);
    s.redo();
    assert.equal(tr.verified, false, how + ' : rétabli : le nouveau circuit');
    done(s);
  }
});
test('revenir à un état déjà vérifié le redonne vérifié (la vérification courante est gardée par un instantané qui n\'en a pas)', () => {
  const tr = scriptTrack('v', 'start S3 finish'); const s = layerSession(tr); s._commit();
  tr.setVerified(9.5); precondition(tr.verified, 'vérifié');
  tr.add({ t: 'straight', x: 3, z: 0, l: 0, r: 0 }); s._commit();
  assert.equal(tr.verified, false, 'modifié : plus vérifié');
  s.undo();
  assert.equal(tr.verified, true, 'annulé : l\'état vérifié est revenu vérifié');
  done(s);
});
test('retour d\'essai : une vérification terminée pendant l\'essai ne fait pas jeter l\'historique (le contenu est le même) et n\'ajoute pas de pas fantôme', () => {
  const tr = decoTrack(); tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0 });
  const s = layerSession(tr); s._commit();
  const quitte = canonicalSnapshot(s._snapshot());
  tr.setVerified(7);
  const rouvert = session(Track.decode(tr.encode()))._snapshot();
  assert.notEqual(quitte, rouvert, 'mise en scène : le texte diffère par la vérification');
  assert.equal(withoutVerification(quitte), withoutVerification(rouvert));
  done(s);
});

console.log('TECH-055 : test depuis le curseur et gravité');
test('test depuis le curseur : le sens de gravité est celui de la pièce visée, pas celui de la règle « gravité inversée au départ »', () => {
  const tr = new Track('f'); tr.setParams({ flip0: true });
  tr.add({ t: 'start', x: 0, z: 0, l: 6, r: 0, v: 1 });
  const ground = tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0 }), ceiling = tr.add({ t: 'straight', x: 0, z: -2, l: 6, r: 0, v: 1 }), twist = tr.add({ t: 'twist', x: 3, z: 0, l: 3, r: 0 });
  assert.equal(testGravity(ground), 1, 'route au sol d\'un circuit flip0 : gravité normale');
  assert.equal(testGravity(ceiling), -1, 'route posée au plafond : inversée');
  assert.equal(testGravity(twist), 1, 'un ruban retourne la voiture lui-même');
  // de bout en bout : testHere transmet ce sens
  const s = layerSession(tr); const got = [];
  s.app.testTrack = (st, spawn) => got.push(spawn.gs);
  s._targetTile = () => ground; s.testHere();
  s._targetTile = () => ceiling; s.testHere();
  assert.deepEqual(got, [1, -1]);
  done(s);
});

console.log('TECH-059 : sortir quand l\'enregistrement échoue');
test('stockage plein : on reste dans l\'éditeur ET une fenêtre propose « Rester », « Exporter le code » et « Quitter sans enregistrer » ; quitter sans enregistrer sort (puis va où on allait)', async () => {
  const { editorFlowMethods } = await import('../js/app/editorFlow.js');
  const tr = decoTrack(); const s = layerSession(tr);
  const modals = [], menus = [], shared = [], after = [];
  s.kind = 'editor'; s.autoSave = () => 'failed';
  const app = { ...editorFlowMethods, session: s, ui: { modal: (m) => modals.push(m), flash() {} }, showMenu: (m) => menus.push(m), shareModal: (code, name) => shared.push([code, name]), _editorKeep: {} };
  global.document = global.document || { createElement: () => ({ set innerHTML(v) { this.html = v; } }) };
  assert.equal(app.leaveEditor(() => after.push('mytracks')), false, 'on reste');
  assert.deepEqual(menus, [], 'pas de sortie');
  assert.equal(modals.length, 1);
  assert.deepEqual(modals[0].actions.map((a) => a.label), ['Rester dans l’éditeur', 'Exporter le code', 'Quitter sans enregistrer']);
  modals[0].actions[1].onClick(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(shared.length, 1, 'l\'export ouvre la fenêtre de partage avec le code du circuit');
  assert.equal(shared[0][0], tr.encode());
  assert.deepEqual(menus, []);
  modals[0].actions[2].onClick(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(menus, ['menu'], 'quitter sans enregistrer sort');
  assert.deepEqual(after, ['mytracks'], 'et va où on allait');
  assert.equal(app._editorKeep, null);
  done(s);
});

await finish('Éditeur : pot de peinture, validateur de placement (TECH-003, 052, 053), gizmo (TECH-037), décorations normalisées (TECH-034, 035).');
