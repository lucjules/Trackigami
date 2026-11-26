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

await finish('Tous les tests des mécaniques passent.');
