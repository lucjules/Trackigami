// Catégories de record finissables (GAME-006, TRANS-14) : node tools/test-categories.mjs   (npm test)
//
// La fiche de chaque circuit propose des catégories de record (départ en bateau, en deltaplane, en moto, sans obstacles, pluie, profils, véhicules v2) dont la variante « change quelque chose » ; le pilote automatique
// ne les finit pas toutes. js/categoriesFaisables.js (généré par tools/categories-faisables.mjs, vérifié à jour par tools/check-categories.mjs) le dit ; la fiche marque « Défi extrême » celles qu'il n'a pas finies,
// SANS en retirer aucune et sans les rendre non sélectionnables. Ce fichier garde :
//   1. les données : les 72 circuits, l'empreinte de chacun, une catégorie finie OU non finie (jamais les deux, jamais une catégorie que la fiche ne propose pas) ;
//   2. hubCategories : le marquage exact, AUCUNE catégorie retirée par rapport à la liste d'avant, toutes encore choisissables (describeVariant) ;
//   3. l'honnêteté : rien n'est affirmé sur un circuit non mesuré, modifié depuis la mesure, du défi du jour ou d'un joueur ;
//   4. le texte (traduit) et le module client (hors de la fermeture de la vérification serveur) ;
//   5. la mesure elle-même sur un circuit.
// Le texte affiché dans la fiche et la catégorie encore choisissable dans la page se vérifient en navigateur (tools/test-browser.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString, Track } from '../js/track.js';
import { CATEGORY_FINISH } from '../js/categoriesFaisables.js';
import { HUB_CATEGORIES, hubCategories, describeBuiltin, describeVariant, describeUser, isExtremeCategory, EXTREME_LABEL } from '../js/trackDescriptor.js';
import { variantFits, variantKey, MAX_KEY } from '../js/variants.js';
import { measureCircuit, PILOT_SPEEDS, MAX_RESPAWNS_OK, MAX_SIM_SECONDS } from './categories-faisables.mjs';
import { seasonTracks, SEASON_EPOCH } from '../js/seasons.js';
import en from '../js/i18n/en/hub.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const builtins = BUILTIN_TRACKS.map((def, index) => { const track = buildBuiltin(def); return { def, track, index, key: `b-${def.id}-${hashString(track.encode())}` }; });
const total = builtins.length;
const desc = (b) => describeBuiltin(b, { total, builtins, getRecord: () => null });
// La liste d'avant GAME-006 (hubCategories ne vérifiait que « la variante change quelque chose »), écrite ici pour comparer.
const before = (b) => HUB_CATEGORIES.filter((c) => { try { return variantKey(b.key, c.v).length <= MAX_KEY && variantFits(b.track, c.v); } catch { return false; } }).map((c) => c.id);
const own = (cats) => cats.filter((c) => !c.season && !c.mutation);      // (sans la saison de la semaine ni la mutation du jour : ce ne sont pas des catégories mesurées)

console.log('Données');
test('les 72 circuits sont mesurés, avec l\'empreinte de leur code d\'aujourd\'hui, dans l\'ordre de la carrière', () => {
  assert.deepEqual(Object.keys(CATEGORY_FINISH.circuits), BUILTIN_TRACKS.map((d) => d.id));
  assert.equal(CATEGORY_FINISH.maxSimSeconds, MAX_SIM_SECONDS);
  for (const b of builtins) assert.equal(`b-${b.def.id}-${CATEGORY_FINISH.circuits[b.def.id].h}`, b.key, b.def.id);
});
test('pour chaque circuit : finies + non finies = les catégories que la fiche propose, ni plus ni moins, sans doublon', () => {
  for (const b of builtins) {
    const m = CATEGORY_FINISH.circuits[b.def.id];
    assert.equal(new Set([...m.ok, ...m.ko]).size, m.ok.length + m.ko.length, b.def.id + ' : une catégorie à la fois finie et non finie, ou en double');
    assert.deepEqual([...m.ok, ...m.ko].sort(), before(b).sort(), b.def.id);
  }
});
test('les chiffres réels : moto et pluie presque partout, bateau presque nulle part (le pilote automatique plafonne à la vitesse du bateau), deltaplane entre les deux', () => {
  const count = (id) => { let ok = 0, n = 0; for (const m of Object.values(CATEGORY_FINISH.circuits)) { if (m.ok.includes(id)) { ok++; n++; } else if (m.ko.includes(id)) n++; } return [ok, n]; };
  assert.deepEqual(count('veh-moto'), [71, 71]);
  assert.deepEqual(count('rn-60'), [72, 72]);
  assert.deepEqual(count('pm-sim'), [72, 72]);
  const [boat, nBoat] = count('veh-boat'), [glider, nGlider] = count('veh-glider');
  assert.equal(nBoat, 72); assert.equal(nGlider, 72);
  assert.ok(boat <= 10, `bateau : ${boat}/72`); assert.ok(glider > boat && glider < 72, `deltaplane : ${glider}/72`);
});

console.log('La fiche (hubCategories)');
test('AUCUNE catégorie n\'est retirée : la liste de la fiche est celle d\'avant, circuit par circuit (72 circuits), dans le même ordre', () => {
  for (const b of builtins) assert.deepEqual(own(hubCategories(desc(b))).map((c) => c.id), before(b), b.def.id);
});
test('« Défi extrême » est posé exactement sur les catégories non finies, et sur elles seules ; le libellé, l\'identifiant et la variante ne changent pas', () => {
  let marked = 0;
  for (const b of builtins) {
    const m = CATEGORY_FINISH.circuits[b.def.id];
    for (const c of own(hubCategories(desc(b)))) {
      const ref = HUB_CATEGORIES.find((x) => x.id === c.id);
      assert.equal(!!c.extreme, m.ko.includes(c.id), `${b.def.id} / ${c.id}`);
      assert.equal(c.label, ref.label); assert.deepEqual(c.v, ref.v);
      marked += c.extreme ? 1 : 0;
    }
  }
  assert.equal(marked, Object.values(CATEGORY_FINISH.circuits).reduce((n, m) => n + m.ko.length, 0));
  assert.ok(marked > 0);
});
test('une catégorie « Défi extrême » reste CHOISISSABLE : sa fiche se décrit, a sa clé de classement et son propre lancement, comme les autres', () => {
  const b = builtins.find((x) => x.def.id === 'eclats'), d = desc(b), boat = hubCategories(d).find((c) => c.id === 'veh-boat');
  assert.ok(boat && boat.extreme, 'le bateau est marqué sur « Premiers Éclats »');
  const dv = describeVariant(d, boat.v);
  assert.equal(dv.key, `${b.key}~v1.veh-boat`); assert.equal(dv.launch.trackKey, dv.key); assert.equal(dv.launch.variant, 'v1.veh-boat'); assert.equal(dv.locked, null);
  assert.deepEqual(dv.recordKeys, [dv.key]);
  const moto = hubCategories(d).find((c) => c.id === 'veh-moto');
  assert.ok(moto && !moto.extreme, 'la moto n\'est pas marquée');
  for (const bb of builtins) for (const c of own(hubCategories(desc(bb)))) { const x = describeVariant(desc(bb), c.v); assert.ok(x.key.endsWith('~v1.' + c.id) && x.launch.trackKey === x.key, bb.def.id + ' ' + c.id); }
});
test('une course de la saison de la semaine garde sa catégorie en tête, sans marque (ce n\'est pas une variante du circuit)', () => {
  const real = Date.now;
  const b = builtins.find((x) => x.def.id === seasonTracks(1)[0].id);
  Date.now = () => SEASON_EPOCH + 3600e3;
  try { const cats = hubCategories(desc(b)); assert.ok(cats[0].season === 1 && !cats[0].extreme); } finally { Date.now = real; }
});

console.log('Honnêteté : aucune affirmation sans mesure');
test('circuit non mesuré, ou modifié depuis la mesure, ou défi du jour ou circuit de joueur : jamais de « Défi extrême »', () => {
  const b = builtins[0], d = desc(b), data = (h, ko) => ({ circuits: { [b.def.id]: { h, ok: [], ko } } });
  assert.equal(isExtremeCategory(d, 'veh-boat', data(CATEGORY_FINISH.circuits[b.def.id].h, ['veh-boat'])), true);
  assert.equal(isExtremeCategory(d, 'veh-boat', data('autre', ['veh-boat'])), false, 'circuit modifié depuis la mesure : on ne dit rien');
  assert.equal(isExtremeCategory(d, 'veh-boat', { circuits: {} }), false, 'circuit non mesuré');
  assert.equal(isExtremeCategory(d, 'veh-moto', data(CATEGORY_FINISH.circuits[b.def.id].h, ['veh-boat'])), false);
  assert.equal(isExtremeCategory(null, 'veh-boat'), false);
  assert.equal(isExtremeCategory({ ...d, source: 'daily' }, 'veh-boat'), false);
  const user = describeUser(Track.decode(b.track.encode()));
  assert.ok(hubCategories(user).every((c) => !c.extreme), 'un circuit de joueur n\'est jamais marqué');
});

console.log('Texte, traduction, module client');
test('le texte est « Défi extrême (non finissable par le pilote automatique) » et il est traduit en anglais', () => {
  assert.equal(EXTREME_LABEL, 'Défi extrême (non finissable par le pilote automatique)');
  assert.ok(Object.hasOwn(en, EXTREME_LABEL) && /extreme/i.test(en[EXTREME_LABEL]));
  const raceHub = readFileSync(join(root, 'js/app/raceHub.js'), 'utf8');
  assert.ok(raceHub.includes('EXTREME_LABEL') && raceHub.includes('chip-extreme'), 'la fiche affiche le texte dans la catégorie');
  const hint = /Le pilote automatique n’a pas fini cette catégorie sur ce circuit\.[^<]*/.exec(raceHub);
  assert.ok(hint && Object.hasOwn(en, hint[0]), 'et l\'indication sous les catégories est traduite');
});
test('js/categoriesFaisables.js n\'est PAS dans la fermeture de la vérification serveur (js/verify.js)', () => {
  const seen = new Set(), todo = [resolve(root, 'js/verify.js')];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:import|export)\s[^;]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) todo.push(resolve(dirname(f), m[1] || m[2]));
  }
  const files = [...seen].map((f) => relative(root, f));
  for (const f of ['js/categoriesFaisables.js', 'js/trackDescriptor.js']) assert.ok(!files.includes(f), f + ' est du client');
});

console.log('La mesure');
test('la mesure d\'un circuit redonne les données : Premiers Éclats finit moto, deltaplane, pluie et profils, pas le bateau ; un échec n\'est jamais compté fini', () => {
  const m = measureCircuit(BUILTIN_TRACKS[0]), ref = CATEGORY_FINISH.circuits.eclats;
  assert.equal(m.h, ref.h);
  assert.deepEqual(Object.keys(m.cats).filter((c) => m.cats[c].ok), ref.ok);
  assert.deepEqual(Object.keys(m.cats).filter((c) => !m.cats[c].ok), ref.ko);
  for (const r of Object.values(m.cats)) { if (r.ok) assert.ok(r.time > 0 && r.respawns <= MAX_RESPAWNS_OK && PILOT_SPEEDS.includes(r.k)); else assert.equal(r.time, null); }
  assert.deepEqual(PILOT_SPEEDS, [...PILOT_SPEEDS].sort((a, b) => b - a), 'du plus vite au plus lent');
});

await finish('Tous les tests des catégories passent.');
