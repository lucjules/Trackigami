// Chapitres bonus 13 et 14 (0.17.0, COMPLETE-002, COMPLETE-011) : node tools/test-extension.mjs   (npm test)
//
// Douze circuits officiels AJOUTÉS (jamais un circuit d'avant modifié), chacun centré sur une mécanique que la carrière n'employait pas. Le contrat de chaque circuit (pilote
// automatique, ±10 % de vitesse, repartir de chaque checkpoint, espacement ≤ 30 s, médailles, objectif bonus, champ `meca`) est appliqué par tools/test-niveaux.mjs. Ce fichier
// vérifie ce que le contrat ne voit pas : que la mécanique CHANGE la course (sans elle, le circuit ne se court plus pareil, ou plus du tout), et la place des chapitres.
//   - structure : deux chapitres de six, rangés après l'Atelier (les 72 gardent leur rang), ouverts par les chapitres 5 et 9, une respiration (◆1) au début de chacun ;
//   - logique : la porte est fermée au départ, l'interrupteur l'ouvre, le checkpoint la referme, un retour au checkpoint rend l'état du checkpoint ; sans logique, pas d'arrivée ;
//   - véhicules : la suite des véhicules du pilote (moto, bateau, deltaplane) ; l'aiguillage se finit par l'eau ET par la route ;
//   - ressorts, gravité, pluie, givre, vent, ambiance, déclencheurs, tours : chacun est présent et agit ;
//   - saisons : les nouveaux circuits ne changent aucun tirage d'avant la bascule.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { CHAPTERS, CHAPTER_SIZE, chapterUnlocked, prerequisiteOf, nextBuiltinIndex, PROFILS } = await import('../js/career.js');
const { EXTRA_CHAPTERS, CAREER_ORDER, CHAPTER_KEYS, chapterKeyOf } = await import('../js/themes.js');
const { Simulation } = await import('../js/simulation.js');
const { Autopilot } = await import('../js/autopilot.js');
const { RaceLogic } = await import('../js/raceLogic.js');
const { runTrack } = await import('./lab.mjs');
const { envOf } = await import('../js/sim/env.js');
const { isDefaultAmbiance } = await import('../js/ambiance.js');
const { checkTrack } = await import('../js/editorTools.js');
const { scriptTrack, Track } = await import('../js/track.js');
const { CELL } = await import('../js/constants.js');
const { seasonPoolIds, SEASON_POOL_1 } = await import('../js/seasons.js');
const { MECA } = await import('./contract.mjs');
const { loadGolden } = await import('./builtin-keys.mjs');

const NEW = {
  elements: ['clairdelune', 'manege', 'averse', 'bourrasques', 'givre', 'ressorts'],
  manoeuvres: ['balade', 'interrupteurs', 'plateaux', 'relais', 'aiguillage', 'finale'],
};
const ALL_NEW = [...NEW.elements, ...NEW.manoeuvres];
const by = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, d]));

// Une course du pilote automatique qui note ce que les contrôles du contrat ne gardent pas : véhicules successifs, groupes cachés de la logique à chaque pas, ressorts, gravité.
// rewindAfterCp : après le passage de ce checkpoint ET une fois que `rewindWhen(sim)` est vrai, retour au checkpoint (comme la touche R), une seule fois.
function drive(track, { rewindAfterCp = 0, rewindWhen = null, maxSteps = 120 * 200 } = {}) {
  const sim = new Simulation(track);
  sim.start();
  const bot = new Autopilot(track.path, { ...(track.path.pilot || {}) });
  bot.reset(sim.phys);
  const out = { ok: false, time: 0, vehicles: [], springs: 0, gravs: new Set(), hidden: [], cps: 0, rewound: false, respawns: 0, lgAtRewind: null, lgAfterRewind: null, scriptCells: [] };
  let cpSeen = 0;
  for (let i = 0; i < maxSteps; i++) {
    sim.drive(bot.control(sim.phys));
    const P = sim.phys;
    if (out.vehicles[out.vehicles.length - 1] !== P.vehicle) out.vehicles.push(P.vehicle);
    if (P.ev.spring) out.springs++;
    out.gravs.add(Math.round(P.gravMul * 100));
    const cell = `${Math.floor(P.pos.x / CELL)},${Math.floor(P.pos.z / CELL)}`;
    if (out.scriptCells[out.scriptCells.length - 1] !== cell) out.scriptCells.push(cell);
    const ev = sim.score();
    if (sim.lgc) out.hidden.push([...sim.lgc.state.hidden].sort((a, b) => a - b).join(','));
    if (ev && ev.type === 'checkpoint') { out.cps++; cpSeen = ev.index; }
    if (ev && ev.type === 'finish') { out.ok = true; out.time = sim.logic.time; break; }
    if (rewindAfterCp && !out.rewound && cpSeen >= rewindAfterCp && (!rewindWhen || rewindWhen(sim))) {
      out.lgAtRewind = [...sim.lgc.state.hidden].sort((a, b) => a - b).join(',');
      sim.rewind(); bot.reset(sim.phys); out.rewound = true;
      out.lgAfterRewind = [...sim.lgc.state.hidden].sort((a, b) => a - b).join(',');
      continue;
    }
    if (sim.lost) { out.respawns++; if (out.respawns > 8) break; sim.rewind(); bot.reset(sim.phys); }
  }
  return out;
}

console.log('Les deux chapitres bonus');
test('12 circuits ajoutés APRÈS les 72 (qui gardent leur rang, leur chapitre et leur clé), en deux chapitres de six, dans l’ordre de la carrière', () => {
  const golden = loadGolden(), old = Object.keys(golden).slice(0, 72);
  assert.equal(BUILTIN_TRACKS.length, 84);
  assert.deepEqual(BUILTIN_TRACKS.slice(0, 72).map((d) => d.id), old, 'les 72 circuits d’avant, au même rang');
  assert.ok(BUILTIN_TRACKS.slice(0, 72).every((d) => !d.chapitre), 'aucun circuit d’avant n’a de champ chapitre');
  assert.deepEqual(EXTRA_CHAPTERS, ['elements', 'manoeuvres']);
  assert.deepEqual(CHAPTER_KEYS, [...CAREER_ORDER, ...EXTRA_CHAPTERS]);
  assert.deepEqual(BUILTIN_TRACKS.slice(72, 78).map((d) => d.id), NEW.elements);
  assert.deepEqual(BUILTIN_TRACKS.slice(78, 84).map((d) => d.id), NEW.manoeuvres);
  for (const [k, ids] of Object.entries(NEW)) for (const id of ids) assert.equal(chapterKeyOf(by[id]), k, id);
});
test('chapitres 13 et 14 : bonus, nommés, décrits ; ouverts par 4 médailles au chapitre 5 (Nuit polaire) et au chapitre 9 (Usine) ; leurs médailles n’ouvrent rien d’autre', () => {
  assert.equal(CHAPTERS.length, 14);
  const [e, m] = [CHAPTERS[12], CHAPTERS[13]];
  assert.deepEqual([e.key, e.name, e.bonus, e.after, 'decor' in e], ['elements', 'Les Éléments', true, CAREER_ORDER.indexOf('polar'), false]);
  assert.deepEqual([m.key, m.name, m.bonus, m.after, 'decor' in m], ['manoeuvres', 'Grandes Manœuvres', true, CAREER_ORDER.indexOf('factory'), false]);
  assert.equal(prerequisiteOf(12), 4); assert.equal(prerequisiteOf(13), 8);
  for (let ch = 1; ch <= 10; ch++) assert.equal(prerequisiteOf(ch), ch - 1, 'les onze chapitres d’origine s’enchaînent comme avant');
  assert.equal(prerequisiteOf(11), 0, 'l’Atelier s’ouvre toujours par le chapitre 1');
  const total = BUILTIN_TRACKS.length, medalsIn = (chs, n) => (i) => (chs.includes(Math.floor(i / CHAPTER_SIZE)) && i % CHAPTER_SIZE < n ? { id: 'or' } : null);
  assert.equal(chapterUnlocked(12, medalsIn([4], 3), total), false, '3 médailles au chapitre 5 ne suffisent pas');
  assert.equal(chapterUnlocked(12, medalsIn([4], 4), total), true);
  assert.equal(chapterUnlocked(13, medalsIn([8], 4), total), true);
  assert.equal(chapterUnlocked(13, medalsIn([4, 7], 6), total), false, 'le chapitre 14 attend le chapitre 9');
  assert.equal(chapterUnlocked(5, medalsIn([12], 6), total), false, 'les médailles des Éléments n’ouvrent pas le chapitre 6');
  assert.equal(chapterUnlocked(10, medalsIn([13], 6), total), false, 'celles des Grandes Manœuvres n’ouvrent pas le chapitre 11');
  assert.equal(nextBuiltinIndex(71, total), null, 'après le Grand Atelier : pas d’enchaînement vers un autre chapitre bonus');
  assert.equal(nextBuiltinIndex(72, total), 73); assert.equal(nextBuiltinIndex(77, total), null); assert.equal(nextBuiltinIndex(78, total), 79); assert.equal(nextBuiltinIndex(83, total), null);
  for (let i = 0; i < 71; i++) assert.equal(nextBuiltinIndex(i, total), nextBuiltinIndex(i, 72), 'l’enchaînement des 72 est inchangé (' + i + ')');
});
test('rythme (COMPLETE-011) : chaque chapitre commence par une RESPIRATION (◆1), la difficulté ne baisse jamais, trois respirations en tout ; une épreuve finale ◆5 en dernier', () => {
  for (const ids of Object.values(NEW)) {
    assert.equal(by[ids[0]].difficulty, 1, ids[0]);
    for (let i = 0; i + 1 < ids.length; i++) assert.ok(by[ids[i]].difficulty <= by[ids[i + 1]].difficulty, ids[i]);
  }
  assert.deepEqual(ALL_NEW.filter((id) => by[id].difficulty === 1), ['clairdelune', 'manege', 'balade']);
  assert.equal(by.finale.difficulty, 5); assert.equal(BUILTIN_TRACKS[83].id, 'finale');
});
test('une mécanique déclarée par circuit (champ meca), toutes connues du contrat ; ensemble elles couvrent ce que la carrière n’employait pas', () => {
  for (const id of ALL_NEW) { assert.ok(by[id].meca && by[id].meca.length >= 1, id); for (const m of by[id].meca) assert.ok(MECA[m], id + ' : ' + m); assert.ok(PROFILS[by[id].profil], id); }
  const covered = new Set(ALL_NEW.flatMap((id) => by[id].meca));
  for (const m of ['logic', 'lift', 'slide', 'pluie', 'vent', 'rafales', 'givre', 'tours', 'ressort', 'gravite', 'moto', 'bateau', 'deltaplane', 'ambiance', 'declencheurs', 'aiguillage']) assert.ok(covered.has(m), m);
  // avant la 0.17.0, aucun des 72 n'avait de logique, de pluie, de givre, de rafales, d'ambiance, de déclencheurs ni de ressort
  for (const d of BUILTIN_TRACKS.slice(0, 72)) {
    const tr = buildBuiltin(d);
    assert.ok(!tr.lg && !tr.rain && !tr.frost && !tr.gust && isDefaultAmbiance(tr.ambiance) && !(tr.scripts || []).length && !tr.tiles.some((t) => t.s === 'spring'), d.id);
  }
});
test('décors variés (dix décors différents pour douze circuits) ; ouvertures toutes différentes de celles des 72', () => {
  assert.ok(new Set(ALL_NEW.map((id) => by[id].decor)).size >= 10);
  const open = (d) => d.script.trim().split(/\s+/).slice(1, 4).join(' ');
  const olds = new Set(BUILTIN_TRACKS.slice(0, 72).map(open));
  for (const id of ALL_NEW) assert.ok(!olds.has(open(by[id])), id + ' : ' + open(by[id]));
  assert.equal(new Set(ALL_NEW.map((id) => open(by[id]))).size, 12);
});

console.log('Portes et interrupteurs (logique du circuit)');
test('Interrupteurs : porte fermée au départ, ouverte par l’interrupteur, refermée derrière au checkpoint ; le second interrupteur ouvre la dernière porte et montre le pont ; arrivée', () => {
  const R = drive(buildBuiltin(by.interrupteurs));
  assert.ok(R.ok && R.respawns === 0, 'le pilote finit sans réapparition');
  const states = R.hidden.filter((s, i) => s !== R.hidden[i - 1]);
  // départ : pont caché (5) ; interrupteur 1 : porte 2 cachée (ouverte) ; checkpoint : porte 2 de nouveau là ; interrupteur 3 : porte 4 ouverte, pont 5 montré
  assert.deepEqual(states, ['5', '2,5', '5', '4']);
});
test('Interrupteurs : SANS la logique, la porte reste fermée et le pilote ne finit pas (la logique change bien la course)', () => {
  const S = runTrack(buildBuiltin({ ...by.interrupteurs, lg: undefined }));
  assert.ok(!S.ok || S.respawns > 0, 'sans logique : ' + (S.ok ? S.respawns + ' réapparitions' : S.reason));
  const T = runTrack(buildBuiltin({ ...by.interrupteurs, lgZones: undefined }));
  assert.ok(!T.ok || T.respawns > 0, 'sans interrupteurs : la porte ne s’ouvre jamais');
});
test('Interrupteurs : retour au checkpoint APRÈS le second interrupteur : la logique revient à l’état du checkpoint (porte 2 fermée, porte 4 fermée, pont caché), puis on repasse et on finit', () => {
  const tr = buildBuiltin(by.interrupteurs);
  const R = drive(tr, { rewindAfterCp: 1, rewindWhen: (sim) => !sim.lgc.state.hidden.has(5) });
  assert.ok(R.rewound);
  assert.equal(R.lgAtRewind, '4', 'au moment du retour : porte 4 ouverte, pont montré');
  assert.equal(R.lgAfterRewind, '5', 'après le retour : l’état du checkpoint (porte 2 refermée, porte 4 fermée, pont caché)');
  assert.ok(R.ok && R.respawns === 0, 'on repasse sur l’interrupteur et on finit');
});
test('Grande Finale : même logique (porte, pont) sous la pluie, avec moto, ascenseur et glissière ; sans logique, pas d’arrivée', () => {
  const R = drive(buildBuiltin(by.finale));
  assert.ok(R.ok && R.respawns === 0);
  assert.deepEqual(R.hidden.filter((s, i) => s !== R.hidden[i - 1]), ['5', '2,5', '2', '']);
  assert.deepEqual(R.vehicles, ['car', 'moto', 'car']);
  const S = runTrack(buildBuiltin({ ...by.finale, lg: undefined }));
  assert.ok(!S.ok || S.respawns > 0);
  const tr = buildBuiltin(by.finale);
  assert.ok(tr.rain > 0 && tr.tiles.some((t) => t.mv === 1) && tr.tiles.some((t) => t.mv === 2));
});
test('la logique et ses groupes voyagent dans le code du circuit (partage, vérification serveur) et entrent dans sa signature', () => {
  for (const id of ['interrupteurs', 'finale']) {
    const tr = buildBuiltin(by[id]), back = Track.decode(tr.encode());
    assert.deepEqual(back.lg, tr.lg, id);
    assert.deepEqual(back.tiles.filter((t) => t.g).map((t) => [t.x, t.z, t.l, t.g]), tr.tiles.filter((t) => t.g).map((t) => [t.x, t.z, t.l, t.g]), id);
    assert.deepEqual(back.decos.filter((d) => d.g).map((d) => d.g), tr.decos.filter((d) => d.g).map((d) => d.g), id);
    assert.notEqual(tr.signature(), buildBuiltin({ ...by[id], lg: undefined }).signature(), id + ' : la logique est dans la signature');
  }
});

console.log('Véhicules');
test('Balade à Moto : voiture → moto → voiture ; Relais : moto → voiture → bateau → voiture → deltaplane (arrivée en deltaplane)', () => {
  assert.deepEqual(drive(buildBuiltin(by.balade)).vehicles, ['car', 'moto', 'car']);
  const R = drive(buildBuiltin(by.relais));
  assert.ok(R.ok && R.respawns === 0);
  assert.deepEqual(R.vehicles, ['car', 'moto', 'car', 'boat', 'car', 'glider']);
});
test('Aiguillage : le VÉHICULE est une décision. Par l’eau (pilote) : voiture → bateau → voiture ; par la route : toujours en voiture ; les deux voies se finissent sans réapparition, l’eau plus vite', () => {
  const water = drive(buildBuiltin(by.aiguillage));
  assert.ok(water.ok && water.respawns === 0);
  assert.deepEqual(water.vehicles, ['car', 'boat', 'car']);
  const roadDef = { ...by.aiguillage, script: by.aiguillage.script.replace(' ALTP ', ' ALT ') };
  assert.notEqual(roadDef.script, by.aiguillage.script);
  const road = drive(buildBuiltin(roadDef));
  assert.ok(road.ok && road.respawns === 0, 'la route se finit');
  assert.deepEqual(road.vehicles, ['car']);
  for (const k of [0.9, 1.1]) { const S = runTrack(buildBuiltin(roadDef), { vCap: 52 * k }); assert.ok(S.ok && !S.respawns && !S.wallHits, 'route à ' + k); }
  assert.ok(water.time < road.time && road.time - water.time < 4, `eau ${water.time.toFixed(2)} s, route ${road.time.toFixed(2)} s : un choix, pas une évidence`);
  assert.ok(by.aiguillage.goal.id === 'under' && by.aiguillage.goal.t < road.time && by.aiguillage.goal.t > water.time, 'l’objectif bonus demande l’eau');
  // les deux voies sont dans le circuit, quel que soit le chemin du pilote : même circuit, même clé
  assert.equal(buildBuiltin(roadDef).encode(), buildBuiltin(by.aiguillage).encode());
});

console.log('Ressorts et gravité');
test('Ressorts : trois ressorts latéraux pris (un saut de voie chacun), deux gravités (40 % et 100 %) ; sans ressort, la voie s’arrête et l’on tombe', () => {
  const R = drive(buildBuiltin(by.ressorts));
  assert.ok(R.ok && R.respawns === 0);
  assert.equal(R.springs, 3);
  assert.ok(R.gravs.has(40) && R.gravs.has(100));
  const noSpring = runTrack(buildBuiltin({ ...by.ressorts, script: by.ressorts.script.replace(/S\.r1?50 /g, 'S ') }));
  assert.ok(!noSpring.ok || noSpring.respawns > 0, 'sans ressort, pas d’arrivée propre');
});
test('LJR / LJL (constructeur) : la route reprend dans la colonne voisine, même niveau, même cap ; une instruction inconnue des circuits d’avant (aucun ne l’emploie)', () => {
  const a = scriptTrack('t', 'start S S.r150 LJR S2 finish'), b = scriptTrack('t', 'start S S.r50 LJL S2 finish');
  const xs = (t) => t.tiles.map((x) => x.x);
  assert.deepEqual(xs(a), [0, 0, 0, 1, 1, 1]); assert.deepEqual(xs(b), [0, 0, 0, -1, -1, -1]);
  assert.ok(a.tiles.every((t) => t.l === 0));
  for (const d of BUILTIN_TRACKS.slice(0, 72)) assert.ok(!/\bLJ[RL]\b/.test(d.script), d.id);
});
test('vérificateur de l’éditeur : un ressort au bout d’une voie, vers une route parallèle du côté où il pousse, est un saut (aucune alerte) ; sans ressort, du mauvais côté, ou sans poussée : « reliée à rien »', () => {
  const err = (s) => checkTrack(scriptTrack('t', s)).filter((i) => /reliée à rien/.test(i.msg)).length;
  assert.equal(err('start S S.r150 LJR S2 finish'), 0);
  assert.equal(err('start S S.r50 LJL S2 finish'), 0);
  assert.ok(err('start S S LJR S2 finish') > 0, 'sans ressort');
  assert.ok(err('start S S.r50 LJR S2 finish') > 0, 'le ressort pousse à gauche, la route est à droite');
  assert.ok(err('start S S.r100 LJR S2 finish') > 0, 'force 100 % : aucune poussée');
  assert.deepEqual(checkTrack(buildBuiltin(by.ressorts)), []);
});

console.log('Environnements, ambiance, déclencheurs, tours');
test('Averse, Bourrasques, Nuit de Givre, Grande Finale : un environnement déterministe (graine) ; sans lui, le pilote ne met pas le même temps', () => {
  const strip = (d) => { const p = { ...d.params }; for (const k of ['rain', 'frost', 'gust', 'wind', 'envVary']) delete p[k]; return { ...d, params: p }; };
  for (const id of ['averse', 'bourrasques', 'givre', 'finale']) {
    const tr = buildBuiltin(by[id]), env = envOf(tr);
    assert.ok(env, id);
    const S = runTrack(tr), S0 = runTrack(buildBuiltin(strip(by[id])));
    assert.ok(S.ok && S0.ok, id);
    assert.ok(Math.abs(S.time - S0.time) > 0.1, `${id} : ${S.time.toFixed(2)} s avec, ${S0.time.toFixed(2)} s sans`);
    assert.equal(runTrack(buildBuiltin(by[id])).time, S.time, id + ' : même graine, même course');
  }
  assert.ok(envOf(buildBuiltin(by.averse)).patches.some((p) => p.kind === 'puddle') && by.averse.params.envVary);
  assert.ok(envOf(buildBuiltin(by.givre)).patches.filter((p) => p.kind === 'frost').length >= 8);
  const B = buildBuiltin(by.bourrasques); assert.ok(B.wind > 0 && B.gust > 0);
});
test('Clair de Lune : une ambiance d’auteur (nuit, brume, musique) et trois déclencheurs posés sur la trajectoire du pilote (aube, brume, éclat) ; hors signature', () => {
  const tr = buildBuiltin(by.clairdelune);
  assert.deepEqual([tr.ambiance.sky, tr.ambiance.fog, tr.ambiance.music], ['night', 'misty', 'menu']);
  assert.deepEqual(tr.scripts.map((s) => s.a), ['sky', 'fog', 'burst']);
  const R = drive(tr);
  assert.ok(R.ok);
  for (const s of tr.scripts) assert.ok(R.scriptCells.includes(`${s.x},${s.z}`), 'le pilote passe sur le déclencheur ' + s.a);
  assert.equal(tr.signature(), buildBuiltin({ ...by.clairdelune, params: undefined }).signature(), 'ambiance et déclencheurs ne changent ni la physique ni la vérification');
  assert.notEqual(tr.encode(), buildBuiltin({ ...by.clairdelune, params: undefined }).encode(), 'mais ils sont dans le code (et donc la clé b-)');
});
test('Manège : trois tours (deux passages de ligne, points de retour), la boucle se referme ; le pilote met à peu près le même temps à chaque tour', () => {
  const tr = buildBuiltin(by.manege);
  assert.equal(tr.laps, 3);
  const S = runTrack(tr);
  assert.ok(S.ok && !S.respawns);
  assert.equal(S.lapTimes.length, 2);
  const laps = [S.lapTimes[0], S.lapTimes[1] - S.lapTimes[0], S.time - S.lapTimes[1]];
  assert.ok(Math.max(...laps) - Math.min(...laps) < 3, laps.join(' '));
  assert.ok(new RaceLogic(tr).cps.length >= 1);
});

console.log('Saisons');
test('les nouveaux circuits ne sont pas dans le pool d’avant la bascule : aucun tirage d’avant la bascule ne peut les tirer', () => {
  for (const id of ALL_NEW) assert.ok(!SEASON_POOL_1.includes(id), id);
  assert.deepEqual([...seasonPoolIds(1)], [...SEASON_POOL_1]);
});

await finish('Les chapitres bonus 13 et 14 sont en place.');
