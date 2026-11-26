// Mécaniques de jeu (COMPLETE-007) : détection dans un circuit à partir des données existantes, profil « mécaniques découvertes », fusion entre appareils (union),
// migration d'un profil existant, export des données, textes traduits. node tools/test-mecaniques.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { scriptTrack } from '../js/track.js';
import {
  MECHANICS, MECH_GROUPS, MECH_IDS, MECH_BY_ID, isMechanic, mechanicsOf, mechanicSites, mechLevel, markMech, newMechanics, unmetMechanics, discoveredMechanics, mergeMech, seedMech, mechReminder,
} from '../js/mechanics.js';
import { OBST } from '../js/obstacles.js';
import { SURFACES } from '../js/pieces.js';
import { mergeProfile } from '../js/cloudsave.js';
import { buildExport } from '../js/dataExport.js';
import * as I from '../js/i18n.js';
import enDict from '../js/i18n/en.js';
import { profile, saveProfile } from '../js/profile.js';
import { mechanicsMethods } from '../js/app/mechanics.js';
import { mechanicsRaceMethods, mechHintsAllowed, nearSite, HINT_SECONDS } from '../js/race/mechanics.js';
import { MessageGate, PRIO } from '../js/hudMessages.js';
import { describeBuiltin } from '../js/trackDescriptor.js';

const builtins = BUILTIN_TRACKS.map((d) => ({ def: d, track: buildBuiltin(d) }));

console.log('Catalogue');
test('identifiants uniques, familles connues, textes présents et courts ; chaque revêtement, chaque obstacle et chaque véhicule a sa mécanique', () => {
  assert.equal(new Set(MECH_IDS).size, MECH_IDS.length);
  const groups = new Set(MECH_GROUPS.map((g) => g.id));
  for (const m of MECHANICS) {
    assert.ok(groups.has(m.group), m.id);
    assert.ok(m.name && m.icon, m.id);
    assert.ok(m.short.length > 15 && m.short.length <= 70, `${m.id} : rappel de ${m.short.length} caractères`);
    assert.ok(m.how.length > 40 && m.how.length <= 190, `${m.id} : carte de ${m.how.length} caractères`);
    assert.ok(mechReminder(m).length <= 110, `${m.id} : rappel en course trop long`);
  }
  for (const s of Object.keys(SURFACES)) if (s) assert.ok(isMechanic(s), 'revêtement sans mécanique : ' + s);
  for (const o of Object.keys(OBST)) assert.ok(isMechanic(o), 'obstacle sans mécanique : ' + o);
  for (const g of MECH_GROUPS) assert.ok(MECHANICS.some((m) => m.group === g.id), g.id);
});
test('tous les textes ont une traduction anglaise (nom, rappel, carte, famille), et le rappel en course se traduit en entier', () => {
  I.resetDictionary(); I.register(enDict); I.setLang('en');
  const miss = [];
  for (const m of MECHANICS) for (const k of [m.name, m.short, m.how]) if (!I.hasTranslation(k)) miss.push(k);
  for (const g of MECH_GROUPS) if (!I.hasTranslation(g.name)) miss.push(g.name);
  assert.deepEqual(miss, []);
  assert.equal(I.translate(mechReminder(MECH_BY_ID.ice)), 'New · Ice: low grip: brake before it, steer gently');
  assert.equal(I.translate(mechReminder(MECH_BY_ID.glass)), 'New · Fragile glass: the slab gives way after contact: do not linger');
  for (const m of MECHANICS) { const t = I.translate(mechReminder(m)); assert.ok(t.startsWith('New · '), m.id + ' : ' + t); assert.ok(!/[àâçéèêëîïôûùœ]/i.test(t.replace(/Fragile/g, '')), m.id + ' : reste du français : ' + t); }
  I.setLang('fr');
});

console.log('Détection');
test('les 84 circuits officiels : la détection ne modifie pas le circuit (code identique) et chaque mécanique du catalogue apparaît dans au moins un circuit', () => {
  const found = new Set();
  for (const { def, track } of builtins) {
    const code = track.encode ? track.encode() : JSON.stringify(track.tiles);
    const m = mechanicsOf(track), sites = mechanicSites(track);
    assert.equal(track.encode ? track.encode() : JSON.stringify(track.tiles), code, def.id + ' : circuit modifié');
    assert.deepEqual(Object.keys(sites).sort(), [...m].sort(), def.id);
    m.forEach((id) => found.add(id));
  }
  assert.deepEqual(MECH_IDS.filter((id) => !found.has(id)), [], 'mécaniques sans circuit');
});
test('le chapitre 1 introduit les neuf mécaniques annoncées par l\'audit (accélérateur, mur, bifurcation, carrefour, anneau, looping, tube, glace, plafond)', () => {
  const seen = new Set(), first = [];
  for (let i = 0; i < 6; i++) for (const id of mechanicsOf(builtins[i].track)) if (!seen.has(id)) { seen.add(id); first.push(id); }
  assert.deepEqual(first.sort(), ['boost', 'ceiling', 'fork', 'ice', 'junction', 'loop', 'ring', 'tube', 'wall']);
});
test('chaque mécanique est détectée sur un circuit minimal qui n\'a qu\'elle (revêtements, plaques, mur, plafond, règles de départ)', () => {
  const CODE = { ice: 'i', boost: 'b', bounce: 'j', magnet: 'm', drift: 'd', slow: 'x', wind: 'w', gravity: 'g', moto: 'o', water: 'a', boat: 'n', glider: 'e', flip: 'f', conveyor: 't', spring: 'r', glass: 'v', powder: 'p', reverse: 'y', cut: 'c' };
  for (const [id, c] of Object.entries(CODE)) {
    const tr = scriptTrack('m', `start S.${c} S finish`);
    assert.ok(mechanicsOf(tr).includes(id), `${id} (.${c})`);
    assert.ok(mechanicSites(tr)[id].length >= 1, id + ' : site');
  }
  assert.ok(mechanicsOf(scriptTrack('m', 'start S3< S finish', { l: 8 })).includes('wall'));
  assert.ok(mechanicsOf(scriptTrack('m', 'start S3^ S finish', { l: 8 })).includes('ceiling'));
  const r = scriptTrack('m', 'start S2 finish'); r.setParams({ veh0: 'boat', g0: 50, flip0: true });
  assert.deepEqual(mechanicsOf(r), ['boat', 'gravity', 'flip']);
  assert.deepEqual(mechanicSites(r).boat, [], 'règle de départ : pas de site, le rappel peut venir tout de suite');
  assert.deepEqual(mechanicsOf(scriptTrack('m', 'start S2 finish')), [], 'un circuit sans mécanique n\'en annonce aucune');
});
test('obstacles et logique : détectés sur les circuits officiels qui en ont, avec leur position', () => {
  const by = (id) => builtins.filter((b) => mechanicsOf(b.track).includes(id));
  assert.ok(by('pendulum').length && by('logic').length && by('mover').length);
  for (const b of by('hammer')) assert.ok(mechanicSites(b.track).hammer.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z) && s.r > 0));
});

console.log('Profil');
test('profil neuf : rien de découvert ; une mécanique ne se marque qu\'en montant (1 puis 2) ; les identifiants inconnus sont refusés', () => {
  const p = {};
  assert.deepEqual(discoveredMechanics(p), []);
  assert.deepEqual(newMechanics(p, ['ice', 'boost']), ['ice', 'boost']);
  assert.equal(markMech(p, 'ice', 1), true);
  assert.equal(markMech(p, 'ice', 1), false, 'déjà au niveau 1');
  assert.deepEqual(newMechanics(p, ['ice', 'boost']), ['boost'], 'la carte ne revient pas');
  assert.deepEqual(unmetMechanics(p, ['ice']), ['ice'], 'vue sur la fiche, pas encore rencontrée en course');
  assert.equal(markMech(p, 'ice', 2), true);
  assert.equal(markMech(p, 'ice', 1), false, 'jamais vers le bas');
  assert.equal(mechLevel(p, 'ice'), 2);
  assert.deepEqual(unmetMechanics(p, ['ice']), []);
  assert.equal(markMech(p, 'inconnue', 2), false);
  assert.deepEqual(p.mech, { ice: 2 });
});
test('fusion de deux appareils : union, niveau au maximum, commutative, associative, idempotente ; valeurs abîmées ignorées, identifiants futurs gardés', () => {
  const a = { ice: 2, boost: 1, futur: 1 }, b = { boost: 2, wall: 1, ice: 1, abime: 'x', neg: -3 }, c = { glass: 2 };
  const m = mergeMech(a, b);
  assert.deepEqual(m, { boost: 2, futur: 1, ice: 2, wall: 1 });
  assert.deepEqual(mergeMech(b, a), m, 'commutative');
  assert.deepEqual(mergeMech(mergeMech(a, b), c), mergeMech(a, mergeMech(b, c)), 'associative');
  assert.deepEqual(mergeMech(m, m), m, 'idempotente');
  assert.deepEqual(mergeMech(undefined, null), {});
  assert.deepEqual(mergeMech('x', [1]), {});
});
test('fusion des profils (cloudsave.mergeProfile) : le champ mech est l\'union des deux appareils, sans rien perdre du reste ; un profil sans mech reste sans mech', () => {
  const base = { id: 'AAAAA-BBBBB', coins: 10, owned: {}, medals: { 'b-x': 2 }, stats: { races: 4, earned: 0 }, eggs: {}, shards: {}, academy: { prise: 1 } };
  const A = { ...base, mech: { ice: 2, boost: 1 } }, B = { ...base, medals: { 'b-y': 1 }, mech: { boost: 2, wall: 2 } };
  const m = mergeProfile(A, B);
  assert.deepEqual(m.mech, { boost: 2, ice: 2, wall: 2 });
  assert.deepEqual(mergeProfile(B, A).mech, m.mech);
  assert.deepEqual(Object.keys(m.medals).sort(), ['b-x', 'b-y']);
  assert.deepEqual(m.academy, { prise: 1 });
  assert.ok(!('mech' in mergeProfile(base, { ...base })), 'rien d\'inventé');
  assert.deepEqual(mergeProfile({ ...base }, B).mech, { boost: 2, wall: 2 }, 'un appareil sans le champ prend celui de l\'autre');
});
test('migration d\'un profil existant : ce que le joueur a déjà rencontré (circuits avec un record) est marqué appris, une seule fois, sans rien retirer', () => {
  const p = { id: 'X', coins: 5, medals: { 'b-a': 1 } };
  const withRecord = new Set([builtins[0], builtins[1]].map((b) => b.key || b.def.id));
  const items = builtins.map((b) => ({ key: b.key || b.def.id, track: b.track }));
  assert.equal(seedMech(p, items, (k) => withRecord.has(k)), true);
  const expected = new Set([...mechanicsOf(builtins[0].track), ...mechanicsOf(builtins[1].track)]);
  assert.deepEqual(Object.keys(p.mech).sort(), [...expected].sort());
  assert.ok(Object.values(p.mech).every((v) => v === 2));
  assert.deepEqual([p.coins, p.medals], [5, { 'b-a': 1 }], 'rien d\'autre ne bouge');
  const snap = JSON.stringify(p.mech);
  assert.equal(seedMech(p, items, () => true), false, 'une seule fois');
  assert.equal(JSON.stringify(p.mech), snap);
  const neuf = {}; seedMech(neuf, items, () => false);
  assert.deepEqual(neuf.mech, {}, 'profil neuf : champ créé, vide : rien d\'appris');
});

console.log('Export des données');
test('l\'export des données du joueur contient les mécaniques découvertes (le profil est exporté tel quel)', async () => {
  const local = { profile: JSON.stringify({ id: 'AAAAA-BBBBB', coins: 3, mech: { ice: 2, boost: 1 } }) };
  const out = await buildExport({ meta: { game: 'T' }, local, uid: null, now: () => new Date('2026-11-26T10:00:00Z') });
  assert.deepEqual(out.device.profile.mech, { ice: 2, boost: 1 });
});

console.log('Carte « Nouveau » (fiche) : une seule fois par mécanique');
const fakeApp = () => ({ builtins: builtins.map((b, i) => ({ ...b, key: 'b-' + b.def.id, index: i })), ...mechanicsMethods });
const resetProfile = () => { const p = profile(); delete p.mech; p.stats = { races: 0, earned: 0 }; saveProfile(); return p; };
test('profil neuf : la carte liste les mécaniques du circuit ; rouvrir la fiche ne la remontre pas ; le circuit suivant ne montre que ses nouveautés ; un circuit verrouillé ne consomme rien', () => {
  const p = resetProfile(), app = fakeApp();
  const d0 = { track: builtins[0].track }, d1 = { track: builtins[1].track };
  const first = app._hubTakeNewMech(d0);
  assert.deepEqual(first, mechanicsOf(builtins[0].track));
  assert.equal(first.length, 4);
  assert.ok(first.every((id) => mechLevel(p, id) === 1), 'vue (niveau 1), pas encore rencontrée en course');
  assert.deepEqual(app._hubTakeNewMech(d0), [], 'une seule fois');
  const second = app._hubTakeNewMech(d1);
  assert.deepEqual(second, mechanicsOf(builtins[1].track).filter((id) => !first.includes(id)));
  assert.deepEqual(app._hubTakeNewMech({ track: builtins[5].track, locked: 'Chapitre verrouillé' }), [], 'verrouillé : rien consommé');
  assert.ok(mechanicsOf(builtins[5].track).some((id) => mechLevel(p, id) === 0), 'les mécaniques du circuit verrouillé restent à découvrir');
  assert.deepEqual(app._hubTakeNewMech(null), []);
});
test('profil existant (records sur les deux premiers circuits) : migration au premier passage, aucune carte pour ce qu\'il connaît déjà, ses données intactes', () => {
  const p = resetProfile(); p.coins = 77; p.medals = { 'b-eclats': 2 }; saveProfile();
  const app = fakeApp();
  const known = new Set(['b-eclats', 'b-canyon']);
  seedMech(profile(), app.builtins, (k) => known.has(k)); saveProfile();       // (le flux de l'application : _mechSeed lit les records du stockage ; la règle est celle-ci)
  const old = new Set([...mechanicsOf(builtins[0].track), ...mechanicsOf(builtins[1].track)]);
  assert.deepEqual(app._hubTakeNewMech({ track: builtins[0].track }), [], 'connu : pas de carte');
  assert.deepEqual(app._hubTakeNewMech({ track: builtins[1].track }), []);
  assert.deepEqual(app._hubTakeNewMech({ track: builtins[2].track }), mechanicsOf(builtins[2].track).filter((id) => !old.has(id)), 'seule la nouveauté d\'un circuit encore jamais joué');
  assert.equal(profile().coins, 77); assert.deepEqual(profile().medals, { 'b-eclats': 2 });
});
test('descripteur de circuit officiel : le verrou du chapitre est bien lu (locked) par la fiche', () => {
  const d = describeBuiltin(builtins[0].def ? { def: builtins[0].def, track: builtins[0].track, index: 0, key: 'b-eclats' } : null, { total: 84 });
  assert.equal(d.locked, null);
  assert.ok(d.track === builtins[0].track);
});

console.log('Rappel en course : discret, jamais sur un message important, une seule fois');
// Une « course » minimale : la position de la voiture, le verrou de messages du vrai HUD (hudMessages.js) et une horloge que le test fait avancer.
let clock = 0;
const realNow = performance.now.bind(performance);
const setClock = (ms) => { clock = ms; };
function fakeRace(track, extra = {}) {
  const gate = new MessageGate(), shown = [];
  const hud = { message(text, dur, prio) { if (!gate.offer(text, dur * 1000, prio, clock)) return false; shown.push(text); return true; } };
  const r = { track, demo: false, replay: null, multi: null, opts: {}, phys: { pos: { x: 0, y: 0, z: 0 } }, app: { _mechSeed() {}, ui: { hud } }, ...extra, ...mechanicsRaceMethods };
  return { r, gate, shown, hud };
}
const drive = (race, pts, stepMs = 100) => { for (const q of pts) { race.r.phys.pos.x = q[0]; race.r.phys.pos.y = q[1]; race.r.phys.pos.z = q[2]; clock += stepMs; race._tick && race._tick(); race.r._mechTick(); } };
performance.now = () => clock;
test('une course du premier circuit sur un profil neuf : chaque mécanique est annoncée UNE fois, à son approche, les unes après les autres, puis plus jamais (nouvel essai, autre course)', () => {
  const p = resetProfile(); setClock(10000);
  const tr = builtins[0].track, race = fakeRace(tr);
  race.r._mechSetup();
  assert.deepEqual(race.r._mech.pending.map((e) => e.id).sort(), mechanicsOf(tr).sort());
  drive(race, tr.path.map((q) => [q[0], q[1], q[2]]), 200);
  const want = mechanicsOf(tr).map((id) => mechReminder(MECH_BY_ID[id]));
  assert.ok(race.shown.length >= 1, 'au moins un rappel');
  assert.equal(new Set(race.shown).size, race.shown.length, 'aucun rappel répété : ' + race.shown.join(' | '));
  for (const t of race.shown) assert.ok(want.includes(t), t);
  const met = discoveredMechanics(p).filter((id) => mechLevel(p, id) === 2);
  assert.equal(met.length, race.shown.length, 'chaque rappel montré écrit le niveau 2');
  // Nouvel essai, puis autre session : ce qui a été annoncé ne revient pas
  const again = fakeRace(tr); again.r._mechSetup();
  assert.deepEqual(again.r._mech ? again.r._mech.pending.map((e) => e.id).sort() : [], mechanicsOf(tr).filter((id) => !met.includes(id)).sort(), 'seules les non annoncées reviennent');
});
test('un message important en cours bloque le rappel (jamais dessus) ; la mécanique reste à découvrir tant qu\'elle n\'a pas pu être annoncée', () => {
  resetProfile(); setClock(50000);
  const tr = scriptTrack('x', 'start S2.i S3 finish'), race = fakeRace(tr);
  race.r._mechSetup();
  const site = mechanicSites(tr).ice[0];
  race.r.phys.pos.x = site.x; race.r.phys.pos.y = site.y; race.r.phys.pos.z = site.z;
  assert.equal(race.hud.message('Hors piste', 1.0, PRIO.penalty), true);
  race.r._mechTick();
  assert.deepEqual(race.shown, ['Hors piste'], 'refusé : un message important est affiché');
  assert.equal(mechLevel(profile(), 'ice'), 0, 'pas marqué : jamais annoncé');
  setClock(clock + 1200); race.r._mechTick();
  assert.equal(race.shown.length, 2, 'le message important est fini : le rappel part');
  assert.equal(race.shown[1], mechReminder(MECH_BY_ID.ice));
  assert.equal(mechLevel(profile(), 'ice'), 2);
  // un autre message (même modeste) remplace le rappel : il est le plus discret
  assert.equal(race.hud.message('Moteur coupé', 0.9, PRIO.info), true);
});
test('une mécanique dépassée sans avoir pu être annoncée n\'est plus annoncée dans cette course, mais reste à découvrir pour la suivante', () => {
  resetProfile(); setClock(90000);
  const tr = scriptTrack('x', 'start S2.i S6 finish'), race = fakeRace(tr);
  race.r._mechSetup();
  const site = mechanicSites(tr).ice[0];
  race.r.phys.pos.x = site.x; race.r.phys.pos.y = site.y; race.r.phys.pos.z = site.z;
  race.hud.message('Piques', 5, PRIO.penalty);
  race.r._mechTick();
  race.r.phys.pos.z += 600; race.r._mechTick();
  assert.equal(race.r._mech.pending.length, 0, 'abandonné pour cette course');
  assert.equal(mechLevel(profile(), 'ice'), 0);
  const next = fakeRace(tr); next.r._mechSetup();
  assert.deepEqual(next.r._mech.pending.map((e) => e.id), ['ice'], 'la course suivante l\'annonce');
});
test('règle du circuit ou logique (aucun site) : annoncé dès le départ ; contextes sans rappel : démonstration, replay, multijoueur, Académie, essai de l\'éditeur, mode libre', () => {
  resetProfile(); setClock(200000);
  const tr = scriptTrack('x', 'start S2 finish'); tr.setParams({ veh0: 'moto' });
  const race = fakeRace(tr); race.r._mechSetup(); race.r._mechTick();
  assert.deepEqual(race.shown, [mechReminder(MECH_BY_ID.moto)]);
  for (const extra of [{ demo: true }, { replay: {} }, { multi: {} }, { opts: { academy: { index: 0 } } }, { opts: { fromEditor: true } }, { opts: { mode: 'x' } }, { opts: { theater: true } }]) {
    resetProfile(); const q = fakeRace(tr, extra); q.r._mechSetup();
    assert.equal(q.r._mech, null, JSON.stringify(extra)); assert.equal(mechHintsAllowed(q.r), false);
  }
});
test('nearSite : à l\'approche d\'un site seulement (rayon + 36 m) ; sans site, toujours', () => {
  const sites = [{ x: 0, y: 0, z: 0, r: 16 }];
  assert.equal(nearSite(sites, 0, 0, 40), true);
  assert.equal(nearSite(sites, 0, 0, 53), false);
  assert.equal(nearSite(sites, 0, 60, 0), false, 'un niveau très différent : pas à portée');
  assert.equal(nearSite([], 999, 999, 999), true);
  assert.ok(HINT_SECONDS >= 3 && HINT_SECONDS <= 6);
});
performance.now = realNow;

await finish('Tous les tests des mécaniques passent.');
