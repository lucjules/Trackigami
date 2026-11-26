// COMPLETE-009 : le fantôme de la médaille suivante. Choix de la médaille (bronze → cristal), table des rythmes à jour (contrôle comme golden), fantôme monté par la course
// (race/ghosts.js : _setupGhosts), absent sans ligne de course, sans effet sur les records ni sur le circuit. node tools/test-fantome-medaille.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, hashString } from '../js/track.js';
import { GhostRunner } from '../js/replay.js';
import { ghostTarget, nextMedal, paceEntry, UP, SHOW_TOLERANCE } from '../js/ghostTarget.js';
import { GHOST_PACES, GHOST_PACE_ORDER } from '../js/ghostPaces.js';
import { ghostMethods } from '../js/race/ghosts.js';
import { saveRecord, getRecord, medalTime } from '../js/storage.js';
import { medalFor } from '../js/medals.js';
import { checkEntry, measurePace, MEDAL_ORDER, TOLERANCE } from './ghost-rythmes.mjs';

const keyOf = (d, tr = buildBuiltin(d)) => `b-${d.id}-${hashString(tr.encode())}`;
const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
// Une session pour _setupGhosts : seulement ce que la méthode lit (réglages, scène, circuit, médailles, clé).
const session = (d, settings = {}, track = buildBuiltin(d), key = keyOf(d, track)) => ({ app: { settings: { ghostGold: true, ghostImported: true, ...settings }, scene: { add() {} } }, track, trackKey: key, medals: d.medals, ghosts: [], _setupGhosts: ghostMethods._setupGhosts });
const setup = (s) => { s._setupGhosts(); return s.ghosts; };

test('la prochaine médaille : bronze sans temps, puis argent, or, cristal ; plus rien une fois le cristal gagné ; les seuils sont inclus', () => {
  const m = { cristal: 45, or: 48, argent: 55, bronze: 65 };
  assert.deepEqual([null, 70, 65.01, 65, 55.5, 55, 48.2, 48, 45.1, 45, 30].map((t) => nextMedal(t, m)), ['bronze', 'bronze', 'bronze', 'argent', 'argent', 'or', 'or', 'cristal', 'cristal', null, null]);
  assert.equal(nextMedal(10, null), null, 'sans médailles (circuit libre) : rien');
  assert.deepEqual(UP, ['bronze', 'argent', 'or', 'cristal']);
  for (const t of [60, 50, 46]) assert.notEqual(nextMedal(t, m), medalFor(t, m).id, 'la prochaine n\'est jamais celle qu\'on a déjà');
});

test('la table des rythmes est à jour : mêmes circuits (empreinte), mêmes seuils, et le fantôme à chaque rythme finit dans le temps enregistré sans réapparition ni choc (node tools/ghost-rythmes.mjs --update)', () => {
  assert.deepEqual(Object.keys(GHOST_PACES), BUILTIN_TRACKS.map((d) => d.id), 'un circuit de plus ou de moins : relancer l\'outil');
  assert.deepEqual(GHOST_PACE_ORDER, MEDAL_ORDER);
  const bad = BUILTIN_TRACKS.map((d) => [d.id, checkEntry(d, GHOST_PACES[d.id])]).filter(([, p]) => p.length);
  assert.deepEqual(bad, []);
});

// Les écarts calibrés : presque tous à moins de 1 %. Ce qui dépasse la tolérance est écrit ICI, par nom : un nouvel écart, ou un écart qui disparaît, est une décision.
const HORS_TOLERANCE = ['archipel cristal', 'helice cristal', 'miroir cristal', 'apesanteur bronze', 'plateaux bronze', 'montecharge bronze', 'ressorts bronze'];
test('écarts du fantôme à son seuil : tous à ±3 % sauf une liste connue (cristal que le pilote ne tient pas proprement ; bronze d\'un circuit à sauts qui demandent de la vitesse), jamais à plus de 15 %', () => {
  const over = [];
  for (const d of BUILTIN_TRACKS) MEDAL_ORDER.forEach((k, i) => { const e = GHOST_PACES[d.id], err = e.t[i] / e.m[i] - 1; if (Math.abs(err) > TOLERANCE) over.push(`${d.id} ${k}`); assert.ok(Math.abs(err) < 0.15, `${d.id} ${k} : ${(err * 100).toFixed(1)} %`); });
  assert.deepEqual(over.sort(), [...HORS_TOLERANCE].sort());
  assert.ok(BUILTIN_TRACKS.length * 4 - over.length >= 329);
});

test('le cristal : le pilote automatique poussé finit au temps du cristal (à 3 %) sur au moins 80 circuits sur 84 ; les autres : le meilleur rythme propre, montré tel quel jusqu\'à 6 %', () => {
  const ok = BUILTIN_TRACKS.filter((d) => Math.abs(GHOST_PACES[d.id].t[0] / d.medals.cristal - 1) <= TOLERANCE);
  assert.ok(ok.length >= 80, ok.length + ' circuits');
  for (const d of BUILTIN_TRACKS) assert.ok(GHOST_PACES[d.id].p[0] >= 1, d.id + ' : le cristal se tient au rythme 1 ou plus');
});

test('ghostTarget : sur chaque circuit, un fantôme à chaque essai jusqu\'au cristal (bronze → argent → or → cristal), et plus rien après le cristal', () => {
  for (const d of BUILTIN_TRACKS) {
    const key = keyOf(d), m = d.medals;
    const at = (best) => ghostTarget({ trackKey: key, medals: m, best });
    assert.equal(at(null).next, 'bronze'); assert.equal(at(m.bronze + 5).next, 'bronze'); assert.equal(at(m.bronze).next, 'argent'); assert.equal(at(m.argent).next, 'or');
    assert.equal(at(m.or).next, 'cristal'); assert.ok(at(m.or), d.id + ' : après l\'or, un fantôme cible reste (le cristal)');
    assert.equal(at(m.cristal), null, d.id + ' : cristal gagné, plus de médaille à viser');
    for (const best of [null, m.bronze + 9, m.bronze, m.argent, m.or]) { const g = at(best); assert.ok(g && UP.includes(g.medal) && (g.pace == null || g.pace > 0), d.id + ' ' + best); assert.ok(UP.indexOf(g.medal) >= UP.indexOf(g.next), d.id + ' : jamais une médaille déjà gagnée'); }
  }
});
test('ghostTarget : une médaille dont le pilote ne tient pas le seuil se montre sous celle d\'au-dessus ; réglage « toujours l\'or » : le fantôme or d\'avant (rythme absent), même après l\'or', () => {
  const d = def('apesanteur'), key = keyOf(d);
  const g = ghostTarget({ trackKey: key, medals: d.medals, best: null });
  assert.equal(g.next, 'bronze'); assert.equal(g.medal, 'argent', 'bronze hors tolérance : le fantôme argent');
  for (const best of [null, d.medals.or, d.medals.cristal - 1]) { const o = ghostTarget({ trackKey: key, medals: d.medals, best, mode: 'or' }); assert.equal(o.medal, 'or'); assert.equal(o.pace, null); }
  const e = def('eclats'), k2 = keyOf(e);
  assert.equal(ghostTarget({ trackKey: k2, medals: e.medals, best: null }).medal, 'bronze');
  assert.equal(ghostTarget({ trackKey: k2, medals: e.medals, best: null, mode: 'or' }).medal, 'or');
  assert.equal(ghostTarget({ trackKey: k2, medals: null, best: null }), null);
  assert.ok(SHOW_TOLERANCE > TOLERANCE);
});
test('hors table : défi du jour, circuit modifié, seuils modifiés → le fantôme or d\'avant tant que l\'or n\'est pas gagné, rien ensuite', () => {
  const d = def('eclats'), m = d.medals;
  const daily = (best) => ghostTarget({ trackKey: 'daily-2026-11-26', medals: m, best });
  assert.deepEqual([null, m.bronze, m.argent].map((b) => daily(b).medal), ['or', 'or', 'or']); assert.equal(daily(m.or), null); assert.equal(daily(m.cristal), null);
  assert.equal(daily(null).pace, null);
  assert.equal(paceEntry('b-eclats-zzz', m), null, 'empreinte d\'un autre circuit');
  assert.equal(paceEntry(keyOf(d), { ...m, or: m.or + 0.1 }), null, 'seuils changés depuis le calcul');
  assert.equal(ghostTarget({ trackKey: keyOf(d), medals: { ...m, argent: m.argent + 1 }, best: null }).medal, 'or', 'seuils modifiés : comme avant');
  assert.equal(paceEntry('__proto__', m), null); assert.equal(paceEntry('b-constructor-x', m), null);
});

test('_setupGhosts : le fantôme monté est celui de la prochaine médaille, couleur et rythme compris ; le fantôme or d\'avant avec « toujours l\'or »', () => {
  const d = def('eclats'), m = d.medals;
  const run = (settings, best) => { const s = session(d, settings); if (best != null) saveRecord(s.trackKey, { time: best, splits: [], inputs: '', pv: 0, date: 1 }); const g = setup(s); return { g, s }; };
  const none = run({}, null), bronze = none.g[0];
  assert.equal(none.g.length, 1); assert.equal(bronze.label, 'Bronze'); assert.equal(bronze.runner.bot.steerMargin, 0.85 * GHOST_PACES.eclats.p[3]);
  const sTrack = session(d, {}); saveRecord(sTrack.trackKey, { time: m.argent - 0.01, splits: [], inputs: '', pv: 0, date: 2 });
  assert.equal(setup(sTrack)[0].label, 'Or', 'argent gagné : le fantôme or');
  saveRecord(sTrack.trackKey, { time: m.or - 0.01, splits: [], inputs: '', pv: 0, date: 3 }); sTrack.ghosts = [];
  const cr = setup(sTrack); assert.equal(cr.length, 1); assert.equal(cr[0].label, 'Cristal'); assert.equal(cr[0].runner.bot.steerMargin, 0.85 * GHOST_PACES.eclats.p[0]);
  saveRecord(sTrack.trackKey, { time: m.cristal - 0.01, splits: [], inputs: '', pv: 0, date: 4 }); sTrack.ghosts = [];
  assert.equal(setup(sTrack).length, 0, 'cristal gagné : plus de fantôme de médaille');
  sTrack.app.settings.ghostMedal = 'or'; sTrack.ghosts = [];
  const gold = setup(sTrack); assert.equal(gold.length, 1); assert.equal(gold[0].label, 'Or');
  assert.equal(gold[0].runner.bot.steerMargin, 0.85, 'le pilote d\'avant : aucun réglage de rythme'); assert.equal(gold[0].runner.bot.latLimit, 56 * 0.8);
});
test('_setupGhosts : médaille meilleure que le record (le meilleur temps compte : medalTime) ; ghostGold coupé : aucun fantôme de médaille', () => {
  const d = def('canyon'), m = d.medals, s = session(d);
  saveRecord(s.trackKey, { time: m.bronze + 3, splits: [], inputs: '', pv: 0, date: 1 });
  saveRecord(s.trackKey, { time: m.argent - 0.5, splits: [], inputs: '', pv: 0, date: 2 });      // le meilleur temps est le dernier ; un record plus lent ne le remplace pas
  assert.ok(medalTime(getRecord(s.trackKey)) <= m.argent);
  assert.equal(setup(s)[0].label, 'Or');
  const off = session(d, { ghostGold: false }); assert.equal(setup(off).length, 0);
});
test('circuit sans ligne de course (circuit de joueur, circuit décodé) : aucun fantôme de médaille, comme le fantôme or d\'avant', () => {
  const d = def('eclats'), tr = buildBuiltin(d), player = Track.decode(tr.encode());
  assert.ok(tr.path && !player.path, 'un circuit de joueur n\'a pas de path');
  const s = session(d, {}, player, `u-${hashString(player.encode())}`); assert.equal(setup(s).length, 0);
  const s2 = session(d, {}, player, keyOf(d)); assert.equal(setup(s2).length, 0, 'même avec la clé officielle : sans path, pas de pilote');
});

test('sans effet : monter puis faire rouler le fantôme ne touche ni au circuit (code, signature), ni aux records, et son temps est celui de la table', () => {
  const d = def('tremplins'), tr = buildBuiltin(d), s = session(d, {}, tr), code = tr.encode(), sig = tr.signature();
  const before = JSON.stringify(getRecord(s.trackKey));
  const g = setup(s)[0];
  for (let k = 0; k < 20000 && !g.runner.done; k++) g.runner.step();
  assert.equal(+g.runner.logic.time.toFixed(2), GHOST_PACES.tremplins.t[3]);
  assert.equal(tr.encode(), code); assert.equal(tr.signature(), sig); assert.equal(JSON.stringify(getRecord(s.trackKey)), before, 'aucun record écrit');
  // La course du joueur sur le même circuit reste celle d'avant : même temps avec ou sans fantôme (seconde simulation indépendante).
  const solo = new GhostRunner(buildBuiltin(d), { bot: true, latK: 0.8 }); while (!solo.done) solo.step();
  const withGhost = new GhostRunner(tr, { bot: true, latK: 0.8 }); while (!withGhost.done) { withGhost.step(); if (withGhost.k % 7 === 0 && !g.runner.done) g.runner.step(); }
  assert.equal(withGhost.logic.time, solo.logic.time);
});
test('fantômes de médaille d\'un échantillon : le temps de chaque fantôme monté par la course est celui de la table (les 4 médailles)', () => {
  for (const id of ['verglas', 'phare', 'aiguillage', 'plateaux']) {
    const d = def(id), tr = buildBuiltin(d);
    MEDAL_ORDER.forEach((k, i) => { const e = GHOST_PACES[id], m = measurePace(tr, e.p[i] === 1 ? null : e.p[i]); assert.equal(+m.t.toFixed(2), e.t[i], id + ' ' + k); });
  }
});

await finish('Tous les tests du fantôme de médaille passent.');
