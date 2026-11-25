// Clés des circuits officiels et alias (RISK-001, TRANS-12) : node tools/test-cles-officielles.mjs   (npm test)
//
// La clé d'un circuit intégré (« b-<id>-<empreinte de encode()> ») est l'identité de ses records, médailles, verrous de chapitre et classements. Ce fichier garde :
//   1. le fichier doré tools/builtin-keys.json : les 72 clés actuelles lui sont ÉGALES ; toute différence échoue en disant quoi faire (ajouter l'alias, ou annuler la modification du circuit) ;
//   2. la table d'alias (js/builtinKeys.js) : vide au départ, cohérente, résolution des chaînes, des catégories « ~v1… » et des clés inconnues ;
//   3. ce que fait un alias sur l'appareil : un record rangé sous l'ancienne clé est retrouvé sous la nouvelle (médaille et verrou de chapitre compris), puis copié sans rien perdre ;
//   4. que ce module reste CLIENT : il n'est pas dans la fermeture de la vérification serveur (js/verify.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish, precondition } from './harness.mjs';

class Store {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const disk = new Store();
globalThis.localStorage = new Proxy(disk, { ownKeys: () => [...disk.m.keys()], getOwnPropertyDescriptor: (t, k) => (disk.m.has(k) ? { enumerable: true, configurable: true, value: disk.m.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)) });
globalThis.sessionStorage = new Store();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { hashString } = await import('../js/track.js');
const { BUILTIN_KEY_ALIASES, resolveBuiltinKey, legacyKeysOf, checkAliases, installBuiltinKeyAliases, migrateBuiltinKeys } = await import('../js/builtinKeys.js');
const { getRecord, saveRecord, listRuns, pushRun, medalTime, dumpAll, clearRecords } = await import('../js/storage.js');
const { profile, saveProfile, reloadProfile } = await import('../js/profile.js');
const { chapterLock, describeBuiltin } = await import('../js/trackDescriptor.js');
const { medalFor } = await import('../js/medals.js');
const { CHAPTER_SIZE } = await import('../js/career.js');
const { currentKeys, loadGolden, diffKeys, problems } = await import('./builtin-keys.mjs');

const builtins = BUILTIN_TRACKS.map((def, index) => { const track = buildBuiltin(def); return { def, track, index, key: `b-${def.id}-${hashString(track.encode())}` }; });
const total = builtins.length;
const golden = loadGolden();
const REC = (time, extra = {}) => ({ time, splits: [], ghost: null, inputs: 'ab', pv: 39, date: 1000, name: 'T', ...extra });
const wipe = () => { clearRecords(); disk.m.clear(); reloadProfile(); installBuiltinKeyAliases({}); };

// Les 72 circuits officiels d'avant la 0.17.0, dans l'ordre de la carrière (ils ne bougent jamais).
const OLD_72 = [
  'eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour', 'lianes', 'canopee', 'spores',
  'serpent', 'racines', 'temple', 'lagon', 'recif', 'phare', 'vrille', 'lunaire', 'archipel',
  'neons', 'boulevard', 'hyper', 'metro', 'tours', 'viaduc', 'aurore', 'banquise', 'glacier',
  'helice', 'couronne', 'blizzard', 'braises', 'coulee', 'basalte', 'cheminee', 'caldeira', 'eruption',
  'quai', 'navette', 'ceinture', 'grandanneau', 'apesanteur', 'zenith', 'courant', 'corail', 'epave',
  'meduses', 'abysses', 'barriere', 'chaine', 'laminoir', 'engrenages', 'fonderie', 'presse', 'usinefolle',
  'envol', 'suspendues', 'rafales', 'montgolfieres', 'pontvents', 'cite', 'galerie', 'plafond', 'cristalfele',
  'miroir', 'vrilles', 'coeur', 'garde', 'cadence', 'pendule', 'rotors', 'montecharge', 'grandatelier',
];
console.log('Fichier doré des clés (72 circuits d’avant la 0.17.0, puis les circuits ajoutés)');
test('les clés actuelles des circuits officiels sont EXACTEMENT celles de tools/builtin-keys.json (84 circuits : les 72 d’avant en tête, mêmes identifiants, même ordre)', () => {
  const now = currentKeys();
  // 0.17.0 : 12 circuits AJOUTÉS (chapitres 13 et 14) ; les 72 d'avant sont toujours les premiers, dans le même ordre (le fichier doré dit leur clé)
  assert.equal(Object.keys(golden).length, 84);
  assert.deepEqual(Object.keys(golden).slice(0, 72), OLD_72);
  assert.deepEqual(Object.keys(now), BUILTIN_TRACKS.map((d) => d.id));
  assert.deepEqual(now, golden, problems(diffKeys(golden, now)).join('\n'));
  for (const b of builtins) assert.equal(b.key, golden[b.def.id], 'la clé que calcule le jeu (js/main.js) est celle du fichier : ' + b.def.id);
  assert.deepEqual(problems(diffKeys(golden, now)), []);
});
test('un circuit officiel MODIFIÉ (clé changée, même son nom) échoue en demandant une entrée d\'alias ; avec l\'alias, il demande seulement la mise à jour du fichier', () => {
  const now = currentKeys(), id = 'canyon';
  const changed = { ...now, [id]: `b-${id}-zzz999` };
  const d = diffKeys(golden, changed);
  assert.deepEqual(d.changed.map((c) => [c.id, c.old, c.now, c.aliased]), [[id, golden[id], `b-${id}-zzz999`, false]]);
  const p = problems(d);
  assert.equal(p.length, 1);
  assert.match(p[0], /un circuit officiel a été modifié/); assert.match(p[0], /BUILTIN_KEY_ALIASES/); assert.ok(p[0].includes(golden[id]) && p[0].includes(`b-${id}-zzz999`));
  const withAlias = diffKeys(golden, changed, { [golden[id]]: `b-${id}-zzz999` });
  assert.equal(withAlias.changed[0].aliased, true);
  assert.match(problems(withAlias)[0], /--update/);
});
test('un circuit RETIRÉ échoue (on ne retire jamais un circuit officiel) ; un circuit AJOUTÉ demande seulement la mise à jour du fichier', () => {
  const now = currentKeys();
  const { eclats, ...without } = now;
  precondition(eclats, 'eclats existe');
  const p1 = problems(diffKeys(golden, without));
  assert.equal(p1.length, 1); assert.match(p1[0], /retiré/);
  const p2 = problems(diffKeys(golden, { ...now, nouveau: 'b-nouveau-abc' }));
  assert.equal(p2.length, 1); assert.match(p2[0], /nouveau circuit « nouveau »/); assert.match(p2[0], /--update/);
});

console.log('Table d\'alias');
test('la table est VIDE au départ (aucun circuit officiel n\'a été modifié) et cohérente avec les clés actuelles', () => {
  assert.deepEqual(BUILTIN_KEY_ALIASES, {});
  assert.ok(Object.isFrozen(BUILTIN_KEY_ALIASES));
  assert.deepEqual(checkAliases(BUILTIN_KEY_ALIASES, Object.values(golden)), []);
});
test('résolution : clé inconnue inchangée, chaîne suivie jusqu\'à la clé actuelle, catégorie « ~v1… » conservée, boucle sans effet', () => {
  const A = { 'b-x-a1': 'b-x-b2', 'b-x-b2': 'b-x-c3', 'b-y-p': 'b-y-q', 'b-l-1': 'b-l-2', 'b-l-2': 'b-l-1' };
  assert.equal(resolveBuiltinKey('b-x-a1', A), 'b-x-c3');
  assert.equal(resolveBuiltinKey('b-x-b2', A), 'b-x-c3');
  assert.equal(resolveBuiltinKey('b-x-c3', A), 'b-x-c3');
  assert.equal(resolveBuiltinKey('b-x-a1~v1.veh-moto', A), 'b-x-c3~v1.veh-moto');
  assert.equal(resolveBuiltinKey('b-inconnu-zz', A), 'b-inconnu-zz');
  assert.equal(resolveBuiltinKey('daily-2026-11-25', A), 'daily-2026-11-25');
  assert.equal(resolveBuiltinKey('u-abc', A), 'u-abc');
  assert.equal(resolveBuiltinKey('b-l-1', A), 'b-l-1', 'un alias qui boucle ne fait rien');
  assert.deepEqual(legacyKeysOf('b-x-c3', A).sort(), ['b-x-a1', 'b-x-b2']);
  assert.deepEqual(legacyKeysOf('b-x-c3~v1.rn-60', A).sort(), ['b-x-a1~v1.rn-60', 'b-x-b2~v1.rn-60']);
  assert.deepEqual(legacyKeysOf('b-x-a1', A), [], 'une ancienne clé n\'a pas d\'anciennes clés');
  assert.deepEqual(legacyKeysOf('b-zz-1', A), []);
  assert.deepEqual(legacyKeysOf('b-x-c3', {}), []);
});
test('checkAliases nomme les alias incohérents : vers un circuit qui n\'existe pas, depuis une clé actuelle, mal formés, en boucle', () => {
  const cur = ['b-x-c3', 'b-z-9'];
  assert.deepEqual(checkAliases({ 'b-x-a1': 'b-x-c3' }, cur), []);
  assert.match(checkAliases({ 'b-x-a1': 'b-x-zzz' }, cur).join(), /n'aboutit à aucun circuit actuel/);
  assert.match(checkAliases({ 'b-z-9': 'b-x-c3' }, cur).join(), /aussi la clé d'un circuit actuel/);
  assert.match(checkAliases({ 'x': 'b-x-c3' }, cur).join(), /mal formé/);
  assert.match(checkAliases({ 'b-l-1': 'b-l-2', 'b-l-2': 'b-l-1' }, cur).join(), /boucle|aucun circuit/);
});

console.log('Ce que fait un alias sur l\'appareil');
// Quatre circuits du chapitre 1 « modifiés » : leurs records sont sous une ancienne clé.
const olds = builtins.slice(0, 4).map((b) => [`b-${b.def.id}-old${b.index}`, b.key]);
const ALIAS = Object.fromEntries(olds);
const goldOf = (b) => ({ time: b.def.medals.or + 0.2, bt: b.def.medals.or });
test('SANS alias, un record rangé sous une ancienne clé est invisible (le défaut de RISK-001) : aucune médaille, chapitre 2 verrouillé', () => {
  wipe();
  olds.forEach(([old], i) => saveRecord(old, REC(builtins[i].def.medals.or)));
  for (const [, now] of olds) assert.equal(getRecord(now), null);
  assert.match(chapterLock(CHAPTER_SIZE, builtins, getRecord), /Chapitre verrouillé/);
});
test('AVEC l\'alias : le record de l\'ancienne clé est retrouvé sous la nouvelle (médaille, bt et verrou de chapitre compris), AVANT toute migration', () => {
  wipe();
  olds.forEach(([old], i) => saveRecord(old, REC(goldOf(builtins[i]).time, { bt: goldOf(builtins[i]).bt })));
  installBuiltinKeyAliases(ALIAS);
  olds.forEach(([, now], i) => {
    const r = getRecord(now);
    assert.ok(r, 'record retrouvé sous ' + now);
    assert.equal(r.time, goldOf(builtins[i]).time); assert.equal(medalTime(r), goldOf(builtins[i]).bt, 'bt conservé');
    assert.equal(medalFor(medalTime(r), builtins[i].def.medals).id, 'or', 'médaille d\'or');
  });
  assert.equal(chapterLock(CHAPTER_SIZE, builtins, getRecord), null, 'quatre médailles au chapitre 1 : le chapitre 2 est ouvert');
  assert.equal(describeBuiltin(builtins[CHAPTER_SIZE], { total, builtins, getRecord }).locked, null, 'et la fiche du circuit le dit');
  assert.equal(getRecord(olds[0][0]).time, goldOf(builtins[0]).time, 'l\'ancienne clé garde son record');
});
test('clé inconnue (sans alias) : rien ne change, ni en lecture ni en migration (le stockage reste octet pour octet le même)', () => {
  wipe();
  installBuiltinKeyAliases(ALIAS);
  saveRecord('b-inconnu-zz', REC(12.3));
  pushRun('b-inconnu-zz', { time: 12.3, date: 5 });
  const other = builtins[10].key;
  assert.equal(getRecord(other), null);
  assert.equal(getRecord('b-inconnu-zz~v1.veh-moto'), null);
  const before = JSON.stringify(dumpAll());
  migrateBuiltinKeys({});                 // table vide (l'état réel du jeu)
  migrateBuiltinKeys(ALIAS);              // table dont aucune ancienne clé n'a de données
  assert.equal(JSON.stringify(dumpAll()), before, 'aucune écriture');
  assert.equal(getRecord(other), null);
});
test('migration : record, catégories (~v1…), dernières courses, médaille, objectif bonus et maîtrise sont COPIÉS sous la nouvelle clé ; l\'ancienne reste ; idempotent', () => {
  wipe();
  const [old, now] = olds[0], p = profile();
  saveRecord(old, REC(20.5, { bt: 19.9, ghost: 'gg', inputs: 'in' }));
  saveRecord(old + '~v1.veh-moto', REC(22.2));
  saveRecord(old + '~v1.rn-60', REC(21.1));
  pushRun(old, { time: 20.5, date: 9000 }); pushRun(old, { time: 21.5, date: 8000 });
  p.medals[old] = 1; p.goals = { [old + '#goal']: 1 }; p.mastery = { [old]: 5 }; saveProfile();
  const n = migrateBuiltinKeys(ALIAS);
  assert.ok(n >= 7, `${n} éléments copiés`);
  const r = getRecord(now);
  assert.deepEqual([r.time, r.bt, r.ghost, r.inputs], [20.5, 19.9, 'gg', 'in'], 'record entier, bt compris');
  assert.equal(getRecord(now + '~v1.veh-moto').time, 22.2); assert.equal(getRecord(now + '~v1.rn-60').time, 21.1);
  assert.deepEqual(listRuns(now), [{ time: 20.5, date: 9000 }, { time: 21.5, date: 8000 }]);
  assert.equal(profile().medals[now], 1); assert.equal(profile().goals[now + '#goal'], 1); assert.equal(profile().mastery[now], 5);
  assert.equal(profile().medals[old], 1, 'copié, pas déplacé');
  assert.equal(migrateBuiltinKeys(ALIAS), 0, 'idempotent');
});
test('migration : un record déjà présent sous la nouvelle clé n\'est JAMAIS écrasé ; seul un meilleur temps de médaille (bt) de l\'ancienne clé le complète ; une meilleure médaille du profil est gardée', () => {
  wipe();
  const [old, now] = olds[1], p = profile();
  saveRecord(now, REC(30, { bt: 28, inputs: 'neuf' }));
  saveRecord(old, REC(25, { bt: 24, inputs: 'vieux' }));
  p.medals[now] = 2; p.medals[old] = 0; saveProfile();
  migrateBuiltinKeys(ALIAS);
  const r = getOwn(now);
  assert.equal(r.time, 30, 'le temps du record de la nouvelle clé ne change pas'); assert.equal(r.inputs, 'neuf');
  assert.equal(medalTime(r), 24, 'mais la médaille gagnée sous l\'ancienne clé n\'est pas perdue');
  assert.equal(profile().medals[now], 0, 'le meilleur palier du profil');
  // pire sous l'ancienne clé : rien ne bouge
  wipe();
  saveRecord(now, REC(30, { bt: 24 })); saveRecord(old, REC(25, { bt: 27 }));
  profile().medals[now] = 0; profile().medals[old] = 2; saveProfile();
  migrateBuiltinKeys(ALIAS);
  assert.equal(medalTime(getOwn(now)), 24); assert.equal(profile().medals[now], 0);
});
test('un nouveau record sous la nouvelle clé garde le meilleur temps de médaille de l\'ancienne clé (saveRecord lit l\'alias)', () => {
  wipe();
  const [old, now] = olds[2];
  saveRecord(old, REC(25, { bt: 24 }));
  installBuiltinKeyAliases(ALIAS);
  saveRecord(now, REC(26));
  assert.equal(getRecord(now).time, 26); assert.equal(medalTime(getRecord(now)), 24, 'la médaille ne redescend pas');
  wipe();
});
test('le déroulé complet d\'une migration : chaîne A → B → C, records sous A et sous B, tout aboutit sous C', () => {
  wipe();
  const C = builtins[5].key, B = 'b-chaine-bbb', A = 'b-chaine-aaa';
  const chain = { [A]: B, [B]: C };
  saveRecord(A, REC(40, { bt: 38 })); saveRecord(B, REC(35));
  installBuiltinKeyAliases(chain);
  assert.equal(getRecord(C).time, 35, 'la plus récente ancienne clé d\'abord');
  migrateBuiltinKeys(chain);
  assert.equal(getOwn(C).time, 35); assert.equal(medalTime(getOwn(C)), 35, 'le record de la clé la plus récente (B) est copié ; A, plus ancienne, ne complète que la médaille si elle est meilleure');
  assert.equal(migrateBuiltinKeys(chain), 0);
  wipe();
});

console.log('Module client');
test('js/builtinKeys.js (et les alias) ne sont PAS dans la fermeture de la vérification serveur (js/verify.js)', () => {
  const seen = new Set(), todo = [resolve(root, 'js/verify.js')];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) todo.push(resolve(dirname(f), m[1] || m[2]));
  }
  const files = [...seen].map((f) => relative(root, f));
  for (const f of ['js/builtinKeys.js', 'js/keyAlias.js', 'js/storage.js', 'js/profile.js']) assert.ok(!files.includes(f), f + ' ne doit pas être exécuté par le serveur');
  assert.ok(files.includes('js/tracks.js'), 'la fermeture contient bien les circuits');
});

// (lecture sans repli : le record rangé sous cette clé exactement)
function getOwn(key) { return JSON.parse(disk.getItem('shardway.rec3.' + key)); }

await finish('Tous les tests des clés officielles passent.');
