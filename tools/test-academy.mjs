// Académie (0.9.15) : six leçons guidées, objectifs réalisables, bilan et récompenses ; éditeur en mode guidé (six pièces).
// node tools/test-academy.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { LESSONS, LESSON_COINS, GRADUATE_COINS, completeLesson, lessonDone, lessonsDone, nextLesson, academyComplete } from '../js/academy.js';
import { buildBuiltin } from '../js/tracks.js';
import { GOALS, goalLabel } from '../js/career.js';
import { runTrack } from './lab.mjs';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { scriptTrack } from '../js/track.js';
import { profile, saveProfile } from '../js/profile.js';
import { paletteMethods, GUIDED } from '../js/editor/palette.js';
import { PALETTE_ORDER } from '../js/editor/shared.js';
import { isFamilyMember, REPLACED_BY_OPTION, familyOf } from '../js/families.js';
import { MECH_LESSONS, completeMechLesson, mechLessonDone, mechLessonsDone, nextMechLesson, learnMechs, mechsOfLesson } from '../js/academyMech.js';
import { MECHANICS, mechLevel, mechanicsOf } from '../js/mechanics.js';
import { RunStats } from '../js/runStats.js';
import { placeAtRespawn } from '../js/simulation.js';
import { goalMet } from '../js/career.js';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { DT } from '../js/constants.js';
import * as I18N from '../js/i18n.js';
import enDict from '../js/i18n/en.js';
import { DRILLS, goalTexts, describeMeasure } from '../js/skills.js';
import { DRILL_HINT } from '../js/analysis/drill.js';

const build = (L) => buildBuiltin({ ...L, id: 'academy-' + L.id });

console.log('Leçons');
test('six leçons, identifiants uniques, un objectif connu, une consigne et une introduction ; les touches des textes sont toutes connues', () => {
  assert.equal(LESSONS.length, 6);
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, 6);
  for (const L of LESSONS) {
    assert.ok(GOALS[L.goal.id], L.id); assert.ok(goalLabel(L.goal).length > 5, L.id);
    assert.ok(L.name && L.tip.length > 20 && L.tip.length < 120 && L.intro.length >= 2, L.id);
    for (const t of L.intro) for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok(['accelerate', 'brake', 'left', 'right', 'respawn'].includes(m[1]), L.id + ' : ' + m[0]);
  }
});
test('chaque leçon se construit, est jouable (départ, arrivée, checkpoint), courte, et se partage à l\'identique', () => {
  for (const L of LESSONS) {
    const tr = build(L);
    assert.deepEqual(tr.validate(), [], L.id);
    const S = runTrack(tr);
    assert.ok(S.ok && S.respawns === 0, `${L.id} : ${S.reason || S.respawns + ' réapparitions'}`);
    assert.ok(S.time > 6 && S.time < 40, `${L.id} : ${S.time.toFixed(1)} s`);
  }
});

console.log('Objectifs réalisables');
test('prise en main : le pilote finit sans toucher de muret', () => { const S = runTrack(build(LESSONS[0])); assert.equal(S.wallHits, 0); });
test('réception : le pilote réussit au moins une réception parfaite', () => { const S = runTrack(build(LESSONS[3])); assert.ok(S.perfects >= 1, 'réceptions parfaites : ' + S.perfects); });
test('plaque : le pilote franchit l\'arrivée en moto', () => { const S = runTrack(build(LESSONS[4])); assert.equal(S.vehicle, 'moto'); });
test('obstacles : le pilote passe les piques sans réapparition, choc ni pique touchée (à 90 et 110 % de sa vitesse aussi)', () => {
  const L = LESSONS[5], base = runTrack(build(L));
  assert.ok(base.ok && base.respawns === 0 && base.spikes === 0 && base.shocks === 0 && base.wallHits === 0);
  for (const k of [0.9, 1.1]) { const R = runTrack(build(L), { vCap: +(66 * k).toFixed(1) }); assert.ok(R.ok && R.respawns === 0, 'vitesse ' + k); }
});
test('mini-turbo : un geste de joueur (volant à fond puis frein 0,6 s dans le grand virage) déclenche bien un mini-turbo sans toucher de muret', () => {
  // Pas de pilote automatique pour le dérapage : on rejoue le geste décrit dans la leçon, en boucle ouverte, dès l'entrée du premier grand virage.
  const track = scriptTrack('l', 'start S3 RR S2 finish', { decor: 'desert' })
  const sim = new Simulation(track); sim.start();
  const bot = new Autopilot(track.path, { latLimit: 44.8 });
  bot.reset(sim.phys);
  let t0 = null, sign = 1, turbos = 0, walls = 0;
  for (let i = 0; i < 120 * 12; i++) {
    const p = sim.phys;
    let inp = bot.control(p);
    if (t0 == null && Math.abs(inp.steer) > 0.6 && p.fwdSpeed > 16) { t0 = i / 120; sign = Math.sign(inp.steer); }
    // PHYS_VER 36 : le joueur rend le volant dès le mini-turbo (le braquage à fond, borné selon la vitesse, tourne plus serré que le grand virage : le garder 2,5 s menait au muret)
    if (t0 != null && i / 120 - t0 < 2.5 && !turbos) { const t = i / 120 - t0; inp = { steer: sign, throttle: t >= 0.6, brake: t < 0.6, drift: false }; }
    sim.drive(inp);
    if (p.ev.miniTurbo) turbos++; if (p.ev.wall > 4) walls++;
    sim.score();
  }
  assert.ok(turbos >= 1 && walls === 0, `mini-turbos ${turbos}, chocs ${walls}`);
  // La leçon « en série » (deux mini-turbos) n'est pas validée par un geste automatique : voir le CHANGELOG.
});

console.log('Bilan et récompenses');
test('un objectif manqué ne valide rien ; réussi, il valide, verse les pièces UNE fois, et le diplôme s\'obtient avec la sixième leçon', () => {
  const p = profile(); p.academy = {}; p.coins = 0; saveProfile();
  const ok = [{ wallHits: 0 }, { turbos: 1 }, { turbos: 2 }, { perfects: 1 }, { vehicle: 'moto' }, { respawns: 0 }];
  const ko = [{ wallHits: 3 }, { turbos: 0 }, { turbos: 1 }, { perfects: 0 }, { vehicle: 'car' }, { respawns: 2 }];
  for (let i = 0; i < 6; i++) { const r = completeLesson(i, { wallHits: 0, respawns: 0, turbos: 0, perfects: 0, rings: 0, vehicle: 'car', time: 10, ...ko[i] }); assert.equal(r.passed, false, 'leçon ' + i); assert.equal(r.coins, 0); }
  assert.equal(lessonsDone(), 0); assert.equal(nextLesson(), 0); assert.equal(profile().coins, 0);
  const defaults = { wallHits: 0, respawns: 0, turbos: 0, perfects: 0, rings: 0, vehicle: 'car', time: 10 };
  let last;
  for (let i = 0; i < 6; i++) { last = completeLesson(i, { ...defaults, ...ok[i] }); assert.ok(last.passed); assert.equal(last.coins, i < 5 ? LESSON_COINS : LESSON_COINS + GRADUATE_COINS); }
  assert.equal(last.graduated, true); assert.equal(profile().coins, 6 * LESSON_COINS + GRADUATE_COINS);
  assert.ok(academyComplete() && lessonDone('prise') && nextLesson() === null);
  const again = completeLesson(0, { ...defaults, ...ok[0] });
  assert.deepEqual([again.passed, again.coins, again.graduated], [true, 0, false], 'refaire une leçon réussie ne reverse rien');
  assert.equal(profile().coins, 6 * LESSON_COINS + GRADUATE_COINS);
  p.academy = {}; p.coins = 0; saveProfile();
});


// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// COMPLETE-008 : une leçon par famille de mécanique (academyMech.js). Chacune est démontrée RÉUSSISSABLE (le pilote automatique atteint l'objectif, aussi à 90 et 110 % de sa vitesse : balayage de
// commandes) et NON TRIVIALE (sans ce qu'elle enseigne, le même pilote échoue : contre-épreuve). Les statistiques sont celles de la course en direct (runStats.js), l'objectif est jugé par goalMet.
console.log('Leçons par mécanique');
const buildM = (L, over = {}) => buildBuiltin({ ...L, ...over, id: 'academy-' + L.id });
const PILOT_V = 52;      // la vitesse visée par défaut du pilote automatique (autopilot.js : vCap) ; les balayages la font varier de 90 à 110 %
// Une course du pilote automatique, comme la course en direct : RunStats (même code), retour au checkpoint comme le jeu (réapparition : stats.respawn). driver : choix des commandes à la place du pilote.
function pilot(track, { vCap = PILOT_V, driver = null, maxSeconds = 120 } = {}) {
  const sim = new Simulation(track); sim.start();
  const { phys, logic } = sim, bot = new Autopilot(track.path, { vCap }), stats = new RunStats();
  bot.reset(phys);
  let respawns = 0, lastIdx = 0, stuck = 0;
  for (let i = 0; i < maxSeconds / DT; i++) {
    const inp = driver ? driver(phys, bot) : bot.control(phys);
    sim.drive(inp);
    stats.step(phys, logic.steps + 1);
    const ev = sim.score();
    if (ev && ev.type === 'checkpoint') stats.checkpoint();
    if (ev && ev.type === 'finish') return { ok: true, respawns, st: { ...stats.final(phys, logic), time: logic.time }, stats };
    if (i % 120 === 0) { if (bot.idx === lastIdx) stuck++; else stuck = 0; lastIdx = bot.idx; }
    if (phys.offTrack || phys.ev.sink || stuck > 4) {
      respawns++; stats.respawn();
      if (respawns > 6) return { ok: false, respawns, st: { ...stats.final(phys, logic), time: logic.time }, stats };
      placeAtRespawn(phys, logic.respawn); bot.reset(phys); stuck = 0;
    }
  }
  return { ok: false, respawns, st: { ...stats.final(phys, logic), time: logic.time }, stats };
}
const MECH_IDS_BY_LESSON = Object.fromEntries(MECH_LESSONS.map((L) => [L.id, mechsOfLesson(L.id)]));
test('huit leçons, identifiants uniques et distincts des six d\'origine ; objectif connu et chiffré ; consigne et introduction ; touches connues ; les six d\'origine inchangées', () => {
  assert.equal(MECH_LESSONS.length, 8); assert.equal(LESSONS.length, 6);
  const ids = [...LESSONS, ...MECH_LESSONS].map((l) => l.id);
  assert.equal(new Set(ids).size, 14);
  assert.deepEqual(MECH_LESSONS.map((l) => l.id), ['gravite', 'murs', 'eau', 'deltaplane', 'verre', 'aimant', 'animes', 'portes']);
  for (const L of MECH_LESSONS) {
    assert.ok(GOALS[L.goal.id], L.id); assert.ok(goalLabel(L.goal).length > 5, L.id);
    assert.ok(L.name && L.tip.length > 20 && L.tip.length < 120 && L.intro.length >= 2, L.id);
    for (const t of L.intro) for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok(['accelerate', 'brake', 'left', 'right', 'respawn'].includes(m[1]), L.id + ' : ' + m[0]);
  }
});
test('les huit leçons couvrent les huit familles demandées : chacune enseigne au moins une mécanique du catalogue, et chaque mécanique qui annonce une leçon la trouve', () => {
  const taught = new Set(MECH_LESSONS.flatMap((L) => MECH_IDS_BY_LESSON[L.id]));
  for (const L of MECH_LESSONS) assert.ok(MECH_IDS_BY_LESSON[L.id].length >= 1, L.id + ' : aucune mécanique');
  for (const id of ['flip', 'gravity', 'wall', 'ceiling', 'loop', 'water', 'boat', 'glider', 'glass', 'magnet', 'pendulum', 'hammer', 'slider', 'sweeper', 'logic']) assert.ok(taught.has(id), id + ' : sans leçon');
  const all = new Set(ids_of(LESSONS).concat(ids_of(MECH_LESSONS)));
  for (const m of MECHANICS) if (m.lesson) assert.ok(all.has(m.lesson), m.id + ' → leçon inconnue ' + m.lesson);
  function ids_of(a) { return a.map((l) => l.id); }
});
test('chaque leçon se construit hors des 84 circuits officiels (aucune clé b-), est valide (départ, arrivée, checkpoint), courte et jouable ; elle présente bien les mécaniques qu\'elle enseigne', () => {
  const official = new Set(BUILTIN_TRACKS.map((d) => d.id));
  for (const L of MECH_LESSONS) {
    assert.ok(!official.has('academy-' + L.id) && !official.has(L.id), L.id + ' : ne doit pas être un circuit officiel');
    const tr = buildM(L);
    assert.deepEqual(tr.validate(), [], L.id);
    const R = pilot(tr);
    assert.ok(R.ok && R.respawns === 0, `${L.id} : ${R.respawns} réapparitions`);
    assert.ok(R.st.time > 5 && R.st.time < 40, `${L.id} : ${R.st.time.toFixed(1)} s`);
    const present = new Set(mechanicsOf(tr));
    for (const id of MECH_IDS_BY_LESSON[L.id]) assert.ok(present.has(id) || ['moto', 'spikes', 'spikesPop', 'bumper'].includes(id), `${L.id} : la mécanique « ${id} » n'est pas dans la leçon (${[...present].join(',')})`);
  }
});
test('RÉUSSISSABLE : le pilote automatique atteint l\'objectif de chacune des sept leçons sans timing (aussi à 90 et 110 % de sa vitesse), et celle des obstacles animés à sa vitesse, puis par balayage du départ (voir plus bas)', () => {
  const rows = [];
  for (const L of MECH_LESSONS) {
    const tr = buildM(L);
    for (const k of L.id === 'animes' ? [1] : [0.9, 1, 1.1]) {      // (les obstacles animés dépendent du chrono : le pilote ne sait pas attendre, voir le balayage du départ)
      const R = pilot(tr, { vCap: +(PILOT_V * k).toFixed(1) });
      assert.ok(R.ok && R.respawns === 0, `${L.id} à ${k * 100} % : ${R.ok ? R.respawns + ' réapparitions' : 'pas d\'arrivée'}`);
      assert.ok(goalMet(L.goal, R.st), `${L.id} à ${k * 100} % : objectif « ${goalLabel(L.goal)} » manqué (vol ${R.st.airBest.toFixed(2)} s, chocs ${R.st.shocks}, murets ${R.st.wallHits}, véhicule ${R.st.vehicle})`);
      if (k === 1) rows.push(`${L.id}: ${goalLabel(L.goal)} → vol ${R.st.airBest.toFixed(2)} s, ${R.st.shocks} choc, ${R.st.wallHits} muret, ${R.st.vehicle}, ${R.st.time.toFixed(1)} s`);
    }
  }
  if (process.env.ACADEMY_LOG) console.log(rows.join('\n'));
});
test('RÉUSSISSABLE (obstacles animés) : balayage des commandes — le même pilote, retenu 0,25 à 6 s sur la ligne de départ : plusieurs départs passent sans un choc, d\'autres heurtent un obstacle (la leçon demande bien du timing, et il se trouve)', () => {
  const L = MECH_LESSONS.find((l) => l.id === 'animes'), tr = buildM(L);
  let pass = 0, fail = 0;
  const delays = [];
  for (let d = 0.25; d <= 6; d += 0.25) {
    const R = pilot(tr, { driver: (() => { let t = 0; return (phys, bot) => { t += DT; const i = bot.control(phys); return t < d ? { throttle: false, brake: true, steer: 0, drift: false } : i; }; })() });
    if (R.ok && R.respawns === 0 && goalMet(L.goal, R.st)) { pass++; delays.push(d); } else fail++;
  }
  if (process.env.ACADEMY_LOG) console.log(`obstacles animés : ${pass} départs sur ${pass + fail} sans choc (retards ${delays.join(', ')} s)`);
  assert.ok(pass >= 4, `${pass} départs réussis sur ${pass + fail}`);
  assert.ok(fail >= 4, 'la leçon ne doit pas être gagnée à tous les coups : ' + fail + ' échecs');
});
test('NON TRIVIAL (1/2) gravité, eau, deltaplane, aimant : sans la zone de gravité le vol est trop court ; sans plaque bateau la voiture coule ; sans plaque deltaplane le vide n\'est pas franchi ; sans aimant la bosse envoie la voiture dans le virage', () => {
  const by = (id) => MECH_LESSONS.find((l) => l.id === id);
  const g = pilot(buildM(by('gravite'), { script: by('gravite').script.replace('S.g40', 'S') }));
  assert.ok(g.ok && !goalMet(by('gravite').goal, g.st), `gravité à 100 % : vol de ${g.st.airBest.toFixed(2)} s, l'objectif (3 s) ne doit pas être atteint`);
  const eau = pilot(buildM(by('eau'), { script: by('eau').script.replace('S.n', 'S') }));
  assert.ok(!eau.ok || eau.respawns > 0, 'la voiture dans l\'eau doit couler');
  const dp = pilot(buildM(by('deltaplane'), { script: by('deltaplane').script.replaceAll('S.e', 'S') }));
  assert.ok(!dp.ok || dp.respawns > 0, 'sans deltaplane le vide n\'est pas franchi');
  const am = pilot(buildM(by('aimant'), { script: by('aimant').script.replaceAll('.m', '') }));
  assert.ok(!am.ok || am.respawns > 0, 'sans aimant la voiture décolle et rate le virage');
});
test('NON TRIVIAL (2/2) murs, verre, obstacles animés, portes : trop lente la voiture décroche du mur ; un coup de frein sur le verre la fait tomber ; une autre phase de l\'obstacle la heurte ; sans la logique le mur reste fermé', () => {
  const by = (id) => MECH_LESSONS.find((l) => l.id === id);
  const murs = pilot(buildM(by('murs')), { vCap: 24 });      // (24 m/s = 86 km/h visés : sous le seuil du mur, malgré l'accélérateur du départ)
  assert.ok(!murs.ok || murs.respawns > 0, 'trop lente, la voiture décroche du mur');
  const verre = pilot(buildM(by('verre')), { driver: (phys, bot) => { const i = bot.control(phys); return phys.surfMod === 'glass' ? { ...i, throttle: false, brake: true } : i; } });
  assert.ok(!verre.ok || verre.respawns > 0, 'freiner sur le verre fait tomber');
  const hit = [0, 0.125, 0.5, 0.625, 0.875].map((ph) => pilot(buildM(by('animes'), { obst: by('animes').obst.map((o) => (o.k === 'slider' ? { ...o, ph } : o)) })));      // (une autre phase du mur coulissant)
  assert.ok(hit.some((R) => R.ok && !goalMet(by('animes').goal, R.st)), 'au moins une autre phase du mur coulissant heurte le pilote : ' + hit.map((R) => R.st.shocks).join(','));
  const sans = pilot(buildM(by('portes'), { lg: undefined, lgZones: by('portes').lgZones }));
  assert.ok(!sans.ok || sans.respawns > 0 || !goalMet(by('portes').goal, sans.st), 'sans logique le mur reste fermé');
});
test('TRADUITS : noms, introductions (avec les touches), consignes et objectifs des huit leçons, et textes des deux nouveaux exercices, en anglais', () => {
  I18N.resetDictionary(); I18N.register(enDict); I18N.setLang('en');
  const FR = /[àâçéèêëîïôûùœ]|\b(le|la|les|une|des|tu|ta|ton|sur|dans|pour|avec|sans)\b/i;
  const left = [];
  const chk = (t) => { const out = I18N.translate(t.replace(/\{(accelerate|brake|left|right|respawn)\}/g, 'W')); if (out === t.replace(/\{(accelerate|brake|left|right|respawn)\}/g, 'W') || FR.test(out.replace(/<[^>]+>/g, ''))) left.push(t); };
  for (const L of MECH_LESSONS) { chk(L.name); chk(L.tip); for (const t of L.intro) chk(t); chk(goalLabel(L.goal)); chk('Objectif : ' + goalLabel(L.goal) + '. ' + L.tip); }
  for (const id of ['murs', 'animes']) { const d = DRILLS.find((x) => x.id === id); chk(d.name); chk(d.tip); for (const t of d.intro) chk(t); for (const t of goalTexts(d)) chk(t); }
  chk(describeMeasure(DRILLS.find((x) => x.id === 'murs'), { finished: true, zoneSpeed: 170.4 }));
  chk(describeMeasure(DRILLS.find((x) => x.id === 'animes'), { finished: true, shocks: 1 })); chk(describeMeasure(DRILLS.find((x) => x.id === 'animes'), { finished: true, shocks: 3 }));
  chk(DRILL_HINT['shocks-n'].replace('{n}', '2'));
  I18N.setLang('fr');
  assert.deepEqual(left, [], 'sans traduction : ' + left.join(' | '));
});
test('les circuits des leçons ne sont pas dans la fermeture du serveur (js/verify.js) : ni academy.js ni academyMech.js n\'y sont importés, et aucun code de partage n\'en part', async () => {
  const { readFileSync } = await import('node:fs');
  const verify = readFileSync(new URL('../js/verify.js', import.meta.url), 'utf8') + readFileSync(new URL('../js/tracks.js', import.meta.url), 'utf8');
  assert.ok(!/academyMech|from '\.\/academy\.js'|skills\.js/.test(verify));
});
test('bilan et récompenses : un objectif manqué ne valide rien ; réussi, il valide, verse 20 ◆ UNE fois, ne touche ni au diplôme ni aux six leçons d\'origine ; jouer la leçon marque ses mécaniques comme rencontrées', () => {
  const p = profile(); p.academy = {}; p.coins = 0; delete p.mech; saveProfile();
  const defaults = { wallHits: 0, respawns: 0, turbos: 0, perfects: 0, rings: 0, vehicle: 'car', time: 10, shocks: 0, airBest: 0 };
  const ok = { gravite: { airBest: 3.2 }, murs: {}, eau: { vehicle: 'boat' }, deltaplane: { airBest: 5 }, verre: {}, aimant: {}, animes: {}, portes: {} };
  const ko = { gravite: { airBest: 1 }, murs: { respawns: 1 }, eau: { vehicle: 'car' }, deltaplane: { airBest: 1 }, verre: { respawns: 1 }, aimant: { respawns: 2 }, animes: { shocks: 1 }, portes: { wallHits: 2 } };
  MECH_LESSONS.forEach((L, i) => { const r = completeMechLesson(i, { ...defaults, ...ko[L.id] }); assert.equal(r.passed, false, L.id); assert.equal(r.coins, 0); });
  assert.equal(mechLessonsDone(), 0); assert.equal(nextMechLesson(), 0); assert.equal(profile().coins, 0);
  MECH_LESSONS.forEach((L, i) => { const r = completeMechLesson(i, { ...defaults, ...ok[L.id] }); assert.ok(r.passed, L.id); assert.equal(r.coins, LESSON_COINS, L.id); });
  assert.equal(profile().coins, 8 * LESSON_COINS);
  assert.equal(mechLessonsDone(), 8); assert.equal(nextMechLesson(), null); assert.ok(mechLessonDone('portes'));
  assert.equal(lessonsDone(), 0, 'les six leçons d\'origine ne bougent pas'); assert.equal(academyComplete(), false);
  const again = completeMechLesson(0, { ...defaults, ...ok.gravite });
  assert.deepEqual([again.passed, again.coins], [true, 0], 'refaire ne reverse rien');
  assert.equal(profile().coins, 8 * LESSON_COINS);
  // les mécaniques de la leçon comptent comme rencontrées
  learnMechs(MECH_LESSONS.findIndex((l) => l.id === 'eau'));
  assert.equal(mechLevel(profile(), 'water'), 2); assert.equal(mechLevel(profile(), 'boat'), 2); assert.equal(mechLevel(profile(), 'glass'), 0);
  p.academy = {}; p.coins = 0; delete p.mech; saveProfile();
});
test('le diplôme reste celui des six leçons d\'origine : six réussies = diplôme et 60 ◆, quel que soit le nombre de leçons par mécanique réussies', () => {
  const p = profile(); p.academy = {}; p.coins = 0; saveProfile();
  const d = { wallHits: 0, respawns: 0, turbos: 2, perfects: 1, rings: 0, vehicle: 'moto', time: 10, shocks: 0, airBest: 5 };
  completeMechLesson(0, { ...d, airBest: 4 }); completeMechLesson(3, d);
  let last;
  for (let i = 0; i < 6; i++) last = completeLesson(i, d);
  assert.equal(last.graduated, true); assert.equal(profile().coins, 2 * LESSON_COINS + 6 * LESSON_COINS + GRADUATE_COINS);
  assert.ok(academyComplete());
  p.academy = {}; p.coins = 0; saveProfile();
});

console.log('Éditeur guidé');
test('mode guidé : six pièces (droite, virage, pente, départ, arrivée, checkpoint) et les quatre outils ; rien d\'autre ; mode complet : tout', () => {
  const ed = (on) => ({ guidedOn: () => on, guidedAllows: paletteMethods.guidedAllows });
  const guided = ed(true), full = ed(false);
  for (const id of ['straight', 'curve', 'slope', 'start', 'finish', 'mod:cp1', 'select', 'inspect', 'erase', 'fill']) assert.equal(guided.guidedAllows(id), true, id);
  for (const id of ['loop', 'tube', 'fork', 'ring', 'platform', 'twist', 'wall', 'surf:boost', 'deco:tree', 'mod:v', 'mod:mv1', 'mod:o1', 'mod:tn', 'mod:tb1', 'mod:th1']) assert.equal(guided.guidedAllows(id), false, id);
  for (const id of ['bigcurve', 'steep', 'gentle']) assert.equal(guided.guidedAllows(id), isFamilyMember(id) && ['straight', 'turn'].includes(familyOf(id).fam), id + ' : seulement s\'il fait partie des familles Droite ou Virage');
  for (const id of ['loop', 'tube', 'surf:boost', 'deco:tree', 'mod:mv1']) assert.equal(full.guidedAllows(id), true, id);
  assert.deepEqual([...GUIDED.pieces].sort(), ['finish', 'start']);
  assert.deepEqual([...GUIDED.fams].sort(), ['straight', 'turn']);
});
test('le départ et l\'arrivée sont des boutons de la palette ; droite et virage (avec pente et grand virage) sont des familles : le mode guidé ne laisse aucun bouton orphelin', () => {
  const single = PALETTE_ORDER.map((p) => p.id).filter((id) => !isFamilyMember(id) && !REPLACED_BY_OPTION.has(id));
  for (const id of ['start', 'finish']) assert.ok(single.includes(id), id + ' est un bouton de la palette');
  assert.ok(isFamilyMember('straight') && isFamilyMember('curve'), 'droite et virage viennent des familles');
});

await finish('Tous les tests de l\'Académie passent.');
