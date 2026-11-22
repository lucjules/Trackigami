// Clés de classement des circuits de joueurs (u-…) : ce qui NE change PAS, ce qui change, et comment l'appareil retrouve ce qu'il avait : node tools/test-cles.mjs   (npm test)
//
// Phase 7 (0.16.6, TECH-039) : la signature d'un circuit (Track.signatureText, donc sa clé u-…) hache les obstacles et les solides AU PAS DU CODE (0,01 m ; 0,001 rad) et repère les pièces d'un
// groupe de logique par leur type (un anneau et la route dessous occupent la même case). L'ancien algorithme reste calculable (Track.legacySignatureText) : js/keyAlias.js retrouve, sous la
// nouvelle clé, les records et les dernières courses rangés sous l'ancienne. Ce fichier garde :
//   1. les INVARIANTS : les 72 clés b-, les 60 clés daily- et toute clé u- de circuit SANS obstacle, solide ni groupe de logique sont celles d'avant ;
//   2. TECH-039 : deux circuits physiquement différents n'ont plus la même clé (poutres de 4 cm, tous les obstacles et solides, anneau et route) ; la signature se relit à l'identique ;
//   3. l'ancien algorithme figé, comparé aux clés d'AVANT (capturées avec le code de la 0.16.5) : 72 circuits officiels, la collision anneau / route, les deux clés de l'obstacle roulé de π ;
//   4. l'alias local : un record, ses variantes et les dernières courses rangés sous l'ancienne clé sont retrouvés (lecture) puis copiés (migration) sous la nouvelle ;
//   5. la vérification d'auteur (vt / vh) d'avant devient « non vérifié » : le temps de l'auteur reste dans le code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const { Track, scriptTrack, hashString } = await import('../js/track.js');
const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { dailyChallenge } = await import('../js/daily.js');
const { OBST, isObstacle } = await import('../js/obstacles.js');
const { SOLIDS, isSolid } = await import('../js/solids.js');
const { getRecord, saveRecord, listRuns, pushRun, clearRecords } = await import('../js/storage.js');
const { adoptLegacyKeys, resetAliasSession } = await import('../js/keyAlias.js');
const { describeUser, personalRecord } = await import('../js/trackDescriptor.js');
const corpus = JSON.parse(readFileSync(new URL('./compat/corpus.json', import.meta.url), 'utf8'));
const lcg = (s) => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const asUser = (def) => Track.decode(buildBuiltin(def).encode());
const hasPhysical = (t) => t.decos.some((o) => isObstacle(o.k) || isSolid(o.k)) || (!!t.lg && (t.tiles.some((x) => x.g) || t.decos.some((o) => o.g)));

// Les clés u-… des 72 circuits officiels exportés en code joueur, d'AVANT la phase 7 : capturées avec le code de la 0.16.5 (commit 4314247).
const OLD_OFFICIAL = {
  eclats: 'u-1y4g7pp', canyon: 'u-a8mnw8', tremplins: 'u-dgnu6', spirale: 'u-nnm92v', verglas: 'u-1f9gymb', grandtour: 'u-c22sqx', lianes: 'u-10nyz2d',
  canopee: 'u-1v5qqc2', spores: 'u-i50noh', serpent: 'u-116t067', racines: 'u-r7dgq', temple: 'u-xspggu', lagon: 'u-1k5mbkm', recif: 'u-1boifeu',
  phare: 'u-1ip850', vrille: 'u-e29z35', lunaire: 'u-axztba', archipel: 'u-1qv42q8', neons: 'u-1jiesff', boulevard: 'u-ggdr6s', hyper: 'u-chtmqm',
  metro: 'u-sl1hoh', tours: 'u-ciw1mn', viaduc: 'u-9x7dfn', aurore: 'u-fkbfrw', banquise: 'u-1icxc6h', glacier: 'u-1o8md56', helice: 'u-1pio65m',
  couronne: 'u-r9v8js', blizzard: 'u-1q7he59', braises: 'u-1qw47zx', coulee: 'u-1n02i6p', basalte: 'u-8pmluw', cheminee: 'u-jfajrf',
  caldeira: 'u-15hs9ps', eruption: 'u-30zt59', quai: 'u-xfusa5', navette: 'u-11nw9h1', ceinture: 'u-szpyme', grandanneau: 'u-5kk01j',
  apesanteur: 'u-aqinx0', zenith: 'u-14271ok', courant: 'u-1pf4fni', corail: 'u-1git5ru', epave: 'u-1n8ggdp', meduses: 'u-15vi29c', abysses: 'u-6i8q13',
  barriere: 'u-1hkaz3t', chaine: 'u-xyh76y', laminoir: 'u-rpb85s', engrenages: 'u-14waaeu', fonderie: 'u-1hq6sl9', presse: 'u-ww9bh',
  usinefolle: 'u-10dh4to', envol: 'u-yw2ynt', suspendues: 'u-jrmn25', rafales: 'u-m7so18', montgolfieres: 'u-1b6avph', pontvents: 'u-16rx6xv',
  cite: 'u-nh8y6q', galerie: 'u-fypaw0', plafond: 'u-1pkrnst', cristalfele: 'u-1jav3n1', miroir: 'u-at09rx', vrilles: 'u-dy0o3x', coeur: 'u-tv4kzc',
  garde: 'u-19q7puh', cadence: 'u-1jgqopy', pendule: 'u-82q4pd', rotors: 'u-1sh7okr', montecharge: 'u-1tdykjg', grandatelier: 'u-12jb5q5',
};
// Un circuit à logique dont un groupe de deux pièces s'ouvre au checkpoint : le groupe est posé sur la route (variante A) ou sur l'anneau de la même case (variante B).
// Avant la phase 7, les deux avaient la même clé (collision) ; capturée avec le code de la 0.16.5.
const OLD_RING_ROAD = 'u-1e7zjyg';
const ringRoad = (onRing) => {
  const t = new Track('groupe');
  t.add({ t: 'start', x: 0, z: 3, l: 0, r: 0 }); t.add({ t: 'straight', x: 0, z: 2, l: 0, r: 0 }); t.add({ t: 'ring', x: 0, z: 2, l: 0, r: 0 }); t.add({ t: 'straight', x: 0, z: 1, l: 0, r: 0 }); t.add({ t: 'finish', x: 0, z: 0, l: 0, r: 0 });
  t.tiles.find((x) => x.x === 0 && x.z === 2 && x.t === (onRing ? 'ring' : 'straight')).g = 2;
  t.setLogic({ off: [2], rules: [{ on: ['cp', 1], do: [['show', 2]] }] });
  return t;
};
// L'obstacle roulé de π : les deux clés que l'ancien code lui donnait en alternance (TECH-002), capturées avec le code de la 0.16.5.
const OLD_PI = ['u-qckjgn', 'u-2732aa'];
const spikesPi = () => { const t = scriptTrack('o', 'start S4 finish'); t.addDeco({ k: 'spikes', x: 300, y: 0, z: -60, ry: 0, s: 1, rz: Math.PI }); return t; };

// ---------------------------------------------------------------------------------------------------------------------------------- 1. invariants
console.log('1. Ce qui ne change pas');
test('les 72 clés b-… (empreinte du CODE du circuit intégré, pas sa signature) et les 60 clés daily-… (la date seule) sont celles d\'avant', () => {
  for (const d of BUILTIN_TRACKS) assert.equal(`b-${d.id}-${hashString(buildBuiltin(d).encode())}`, corpus.builtinKeys[d.id], d.id);
  assert.equal(Object.keys(corpus.builtinKeys).length, 72);
  let n = 0;
  for (let m = 11; m <= 12; m++) for (let dd = 1; dd <= 30; dd++) { const day = `2026-${m}-${String(dd).padStart(2, '0')}`, c = dailyChallenge(day); assert.equal(c.key, 'daily-' + day); n++; }
  assert.equal(n, 60);
});
test('une clé u-… ne change que pour un circuit AVEC obstacle, solide ou groupe de logique : les 72 officiels exportés (4 sans solide gardent leur clé, 68 changent), les codes SHW1 et SHW2 du corpus, le lien de partage', () => {
  let same = 0, changed = 0;
  for (const d of BUILTIN_TRACKS) {
    const t = asUser(d), old = OLD_OFFICIAL[d.id];
    precondition(!!old, `clé d'avant de ${d.id}`);
    assert.equal(t.userKey === old, !hasPhysical(t), `${d.id} : la clé change si, et seulement si, le circuit a un obstacle, un solide ou un groupe de logique`);
    assert.deepEqual(t.legacyUserKeys(), t.userKey === old ? [] : [old], d.id);
    if (t.userKey === old) same++; else changed++;
  }
  assert.deepEqual([same, changed], [4, 68]);
  for (const e of corpus.codes.filter((x) => /SHW1|SHW2|Lien de partage/.test(x.label))) assert.deepEqual(e.legacyKeys, [], e.label);
});
test('circuits SANS obstacle, solide ni groupe de logique (pièces, revêtements, règles, décorations visuelles, groupes sans logique, tours) : texte de signature identique à l\'ancien, clé identique, aucune ancienne clé', () => {
  const r = lcg(20261122);
  const surf = ['', '.i', '.b', '.j', '.d', '.v', '.x', '.p'];
  for (let i = 0; i < 300; i++) {
    const code = 'start ' + Array.from({ length: 3 + Math.floor(r() * 5) }, () => `S${1 + Math.floor(r() * 3)}${surf[Math.floor(r() * surf.length)]}`).join(' ') + (r() < 0.5 ? ' C S2' : '') + ' finish';
    const t = scriptTrack('p' + i, code);
    t.setParams({ grip: 60 + Math.floor(r() * 80), v0: Math.floor(r() * 100), g0: r() < 0.3 ? 50 : 100 });
    if (r() < 0.4) t.laps = 2 + Math.floor(r() * 3);
    for (let k = 0; k < Math.floor(r() * 5); k++) t.addDeco({ k: ['tree', 'cone', 'rock', 'tent'][Math.floor(r() * 4)], x: (r() - 0.5) * 200, y: 0, z: -r() * 100, ry: r() * 6, s: 0.5 + Math.floor(r() * 10) / 10, rx: r() < 0.3 ? r() : 0, rz: r() < 0.3 ? Math.PI : 0 });
    if (r() < 0.4) t.tiles[1 + Math.floor(r() * (t.tiles.length - 2))].g = 1 + Math.floor(r() * 5);      // un groupe SANS logique : la signature l'ignore
    assert.ok(!hasPhysical(t), 'mise en scène');
    const u = Track.decode(t.encode());                // (un circuit LU d'un code : c'est de lui que viennent les clés)
    assert.equal(u.signatureText(), u.legacySignatureText(), code);
    assert.equal(u.userKey, 'u-' + hashString(u.legacySignatureText()));
    assert.deepEqual(u.legacyUserKeys(), []);
    assert.equal(Track.decode(u.encode()).userKey, u.userKey, 'et se relit à l\'identique');
    assert.equal(t.userKey, u.userKey, 'la clé du circuit en mémoire (coordonnées libres) est celle du code relu (avant : ≈ 5 % des coordonnées différaient aux frontières de l\'arrondi)');
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------- 2. TECH-039
console.log('2. TECH-039 : deux circuits physiquement différents n\'ont plus la même clé');
test('deux poutres d\'échelle 8 écartées de 4 cm (cap +0,004 rad) : signatures et clés différentes (avant : identiques, alors que l\'extrémité bouge de ≈ 0,26 m)', () => {
  const mk = (dx, dry) => { const t = scriptTrack('b', 'start S3 finish'); t.addDeco({ k: 'beam', x: 16 + dx, y: 0, z: 16, ry: dry, s: 8 }); return t; };
  const a = mk(0, 0), b = mk(0.04, 0.004);
  assert.notEqual(a.signature(), b.signature()); assert.notEqual(a.userKey, b.userKey);
  assert.notEqual(a.signatureText(), b.signatureText(), 'le serveur lie la clé à SHA-256 de ce texte : la collision est détectée');
  assert.equal(a.legacySignatureText(), b.legacySignatureText(), 'avec l\'ancien algorithme : la collision (c\'est le défaut)');
  assert.deepEqual(a.legacyUserKeys(), b.legacyUserKeys());
});
test('chaque sorte d\'obstacle et de solide : un décalage de 0,01 m en x, en y, en z, ou de 0,001 rad de cap change la signature ; la hauteur et le décalage de phase aussi', () => {
  const kinds = [...Object.keys(OBST), ...Object.keys(SOLIDS)];
  assert.ok(kinds.length >= 12, kinds.join());
  for (const k of kinds) {
    const mk = (f) => { const t = scriptTrack('k', 'start S3 finish'); const d = t.addDeco({ k, x: 40, y: 1, z: -20, ry: 0.5, s: 1 }); precondition(!!d, k + ' acceptée'); f(d); return t.signature(); };
    const s0 = mk(() => {});
    for (const [name, f] of Object.entries({ x: (d) => { d.x += 0.01; }, y: (d) => { d.y += 0.01; }, z: (d) => { d.z += 0.01; }, ry: (d) => { d.ry += 0.001; }, s: (d) => { d.s = Math.min(d.s + 0.01, 2); } })) assert.notEqual(mk(f), s0, `${k} : ${name}`);
  }
});
test('la signature d\'un obstacle ou d\'un solide posé aux coordonnées libres (non arrondies) est celle du code relu, à chaque lecture (200 circuits au hasard : mémoire = code relu)', () => {
  const r = lcg(99), obst = Object.keys(OBST), sol = Object.keys(SOLIDS);
  for (let i = 0; i < 200; i++) {
    const t = scriptTrack('f' + i, 'start S3 finish');
    for (let k = 0; k < 4; k++) t.addDeco({ k: (r() < 0.5 ? obst : sol)[Math.floor(r() * 5)] || 'pillar', x: (r() - 0.5) * 300, y: r() * 20, z: -r() * 200, ry: (r() - 0.5) * 8, s: 0.5 + r(), ph: Math.floor(r() * 20) / 20, rz: r() < 0.3 ? ((Math.floor(r() * 9) - 4) * Math.PI) / 4 : 0 });
    const s0 = t.signature();
    let u = t;
    for (let n = 1; n <= 3; n++) { u = Track.decode(u.encode()); assert.equal(u.signature(), s0, `circuit ${i}, lecture ${n}`); }
  }
});
test('anneau et route sur la même case : le groupe de logique posé sur l\'un ou sur l\'autre donne deux signatures (avant : la même, alors que déplacer le groupe change la physique)', () => {
  const road = ringRoad(false), ring = ringRoad(true);
  precondition(road.tiles.filter((x) => x.x === 0 && x.z === 2).length === 2, 'un anneau et une route sur la même case');
  assert.notEqual(road.signature(), ring.signature()); assert.notEqual(road.userKey, ring.userKey);
  assert.equal(road.legacySignatureText(), ring.legacySignatureText(), 'avec l\'ancien algorithme : la collision');
  assert.equal(road.signature(), Track.decode(road.encode()).signature(), 'et chacune se relit à l\'identique');
  // sans logique, les groupes ne sont pas dans la signature (rien ne change pour les circuits qui n'en ont pas)
  const noLogic = ringRoad(false); noLogic.lg = null;
  assert.equal(noLogic.signatureText(), noLogic.legacySignatureText());
});

// ---------------------------------------------------------------------------------------------------------------------------------- 3. l'ancien algorithme figé
console.log('3. L\'ancien algorithme (signature « legacy ») reproduit les clés d\'avant');
test('72 circuits officiels exportés : legacySignatureText redonne EXACTEMENT la clé u-… calculée par le code de la 0.16.5', () => {
  for (const d of BUILTIN_TRACKS) assert.equal('u-' + hashString(asUser(d).legacySignatureText()), OLD_OFFICIAL[d.id], d.id);
});
test('la collision anneau / route : les deux variantes ont la MÊME ancienne clé (celle de la 0.16.5) et deux nouvelles clés distinctes', () => {
  const road = ringRoad(false), ring = ringRoad(true);
  assert.deepEqual(road.legacyUserKeys(), [OLD_RING_ROAD]); assert.deepEqual(ring.legacyUserKeys(), [OLD_RING_ROAD]);
  assert.ok(road.userKey !== OLD_RING_ROAD && ring.userKey !== OLD_RING_ROAD && road.userKey !== ring.userKey);
});
test('obstacle roulé de π : ses DEUX anciennes clés (celles que l\'ancien code alternait, TECH-002) sont retrouvées ; la nouvelle est unique et stable', () => {
  const t = spikesPi();
  assert.deepEqual(t.legacyUserKeys(), OLD_PI);
  for (let i = 0; i < 4; i++) assert.equal(Track.decode(t.encode()).userKey, t.userKey);
  assert.ok(!OLD_PI.includes(t.userKey));
});

// ---------------------------------------------------------------------------------------------------------------------------------- 4. l'alias local
console.log('4. L\'alias local : les records, variantes et courses d\'avant se retrouvent sous la nouvelle clé');
const clean = () => { clearRecords(); disk.m.clear(); resetAliasSession(); };      // (clearRecords : la copie en mémoire des records de la session aussi)
const REC = (time, extra = {}) => ({ time, pv: 38, date: 1000, ...extra });
test('lecture avec repli : sans rien migrer, la fiche (descripteur) et « Mes circuits » trouvent le record rangé sous l\'ancienne clé ; la clé actuelle passe avant', () => {
  clean();
  const t = asUser(BUILTIN_TRACKS.find((d) => d.id === 'canyon'));
  const old = t.legacyUserKeys()[0];
  precondition(old === OLD_OFFICIAL.canyon && old !== t.userKey, 'canyon exporté a une ancienne clé');
  assert.deepEqual(t.userRecordKeys().slice(0, 2), [t.userKey, old]);
  assert.deepEqual(describeUser(t).recordKeys, t.userRecordKeys());
  assert.equal(personalRecord(describeUser(t), getRecord), null);
  saveRecord(old, REC(31.5));
  assert.equal(personalRecord(describeUser(t), getRecord).time, 31.5, 'le record d\'avant est lu sous l\'ancienne clé');
  saveRecord(t.userKey, REC(30.1, { pv: 39 }));
  assert.equal(personalRecord(describeUser(t), getRecord).time, 30.1, 'la clé actuelle prime');
});
test('migration : un record sous l\'ancienne clé est COPIÉ sous la nouvelle (jamais écrasé), avec ses variantes (~v1…) et ses dernières courses ; idempotent ; l\'ancien reste en place', () => {
  clean();
  const t = asUser(BUILTIN_TRACKS.find((d) => d.id === 'grandatelier')), old = t.legacyUserKeys()[0], K = t.userKey;
  precondition(old && old !== K, 'ancienne clé');
  saveRecord(old, REC(41.2, { inputs: 'abc', ghost: 'g' }));
  saveRecord(old + '~v1.veh-moto', REC(44.4));
  saveRecord(old + '~v1.v0-100', REC(39.9));
  pushRun(old, { time: 41.2, date: 5000 }); pushRun(old, { time: 42.0, date: 4000 });
  const n = adoptLegacyKeys(t);
  assert.equal(n, 4, `${n} éléments copiés : le record, deux variantes, les dernières courses`);
  assert.equal(getRecord(K).time, 41.2); assert.equal(getRecord(K).inputs, 'abc', 'le record est copié en entier (commandes et fantôme compris)');
  assert.equal(getRecord(K + '~v1.veh-moto').time, 44.4); assert.equal(getRecord(K + '~v1.v0-100').time, 39.9);
  assert.deepEqual(listRuns(K), [{ time: 41.2, date: 5000 }, { time: 42, date: 4000 }]);
  assert.equal(getRecord(old).time, 41.2, 'l\'ancien record reste en place (copié, pas déplacé : une même ancienne clé a pu servir à plusieurs circuits)');
  assert.equal(adoptLegacyKeys(t), 0, 'idempotent dans la session');
  resetAliasSession();
  assert.equal(adoptLegacyKeys(t), 0, 'et d\'une session à l\'autre : rien de plus à copier');
});
test('migration : un record déjà présent sous la nouvelle clé n\'est JAMAIS écrasé, même s\'il est moins bon ; les courses se fusionnent sans doublon', () => {
  clean();
  const t = asUser(BUILTIN_TRACKS.find((d) => d.id === 'canyon')), old = t.legacyUserKeys()[0], K = t.userKey;
  saveRecord(old, REC(25.0)); saveRecord(K, REC(30.0, { pv: 39 }));
  pushRun(old, { time: 25, date: 100 }); pushRun(K, { time: 30, date: 200 }); pushRun(K, { time: 25, date: 100 });
  adoptLegacyKeys(t);
  assert.equal(getRecord(K).time, 30.0);
  assert.deepEqual(listRuns(K), [{ time: 30, date: 200 }, { time: 25, date: 100 }]);
});
test('obstacle roulé de π : les records rangés sous les DEUX anciennes clés sont retrouvés (celui de la première clé l\'emporte s\'il y en a un sous chacune)', () => {
  clean();
  const t = spikesPi();
  saveRecord(OLD_PI[1], REC(9.9)); assert.equal(adoptLegacyKeys(t), 1); assert.equal(getRecord(t.userKey).time, 9.9);
  clean(); saveRecord(OLD_PI[0], REC(8.8)); saveRecord(OLD_PI[1], REC(9.9)); adoptLegacyKeys(t);
  assert.equal(getRecord(t.userKey).time, 8.8);
});
test('un circuit dont la clé n\'a pas changé : rien n\'est lu ni écrit (aucune écriture dans le stockage)', () => {
  clean();
  const t = asUser(BUILTIN_TRACKS.find((d) => d.id === 'verglas'));
  precondition(t.legacyUserKeys().length === 0, 'verglas exporté : clé inchangée');
  saveRecord(t.userKey, REC(20));
  const before = JSON.stringify([...disk.m]);
  assert.equal(adoptLegacyKeys(t), 0);
  assert.equal(JSON.stringify([...disk.m]), before);
});
test('copier un circuit à l\'ancienne clé partagée : deux circuits qui avaient la MÊME ancienne clé retrouvent chacun le record d\'avant (aucune perte)', () => {
  clean();
  const road = ringRoad(false), ring = ringRoad(true);
  saveRecord(OLD_RING_ROAD, REC(12.3));
  adoptLegacyKeys(road); adoptLegacyKeys(ring);
  assert.equal(getRecord(road.userKey).time, 12.3); assert.equal(getRecord(ring.userKey).time, 12.3);
  assert.equal(getRecord(OLD_RING_ROAD).time, 12.3);
});

// ---------------------------------------------------------------------------------------------------------------------------------- 5. vérification d'auteur
console.log('5. Vérification d\'auteur liée à l\'ancienne signature');
test('un code vérifié AVEC l\'ancienne signature (vh) devient « non vérifié » : le temps de l\'auteur (vt) reste dans le code, mais plus de médailles déduites ; un circuit sans obstacle ni solide reste vérifié', () => {
  // Le code tel que l'éditeur de la 0.16.5 l'a écrit à la vérification : le circuit, plus vt (temps de l'auteur) et vh (sa signature de l'époque). On l'écrit à la main : encode() n'écrit
  // vt / vh que pour un circuit vérifié, et celui-ci ne l'est plus.
  const withProof = (t, vt) => { const data = JSON.parse(Buffer.from(t.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); data.vt = vt; data.vh = hashString(t.legacySignatureText()); return 'SHW3:' + Buffer.from(JSON.stringify(data)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const t = asUser(BUILTIN_TRACKS.find((d) => d.id === 'canyon'));
  const back = Track.decode(withProof(t, 31.5));
  assert.equal(back.vt, 31.5, 'le temps de l\'auteur est lu');
  assert.equal(back.verified, false, 'non vérifié : la signature a changé');
  assert.equal(back.derivedMedals, null, 'plus de médailles déduites tant que le circuit n\'est pas revérifié');
  // revérifié avec la nouvelle signature : de nouveau vérifié, et stable
  back.setVerified(31.4);
  const again = Track.decode(back.encode());
  assert.equal(again.verified, true); assert.equal(again.vt, 31.4);
  // un circuit dont la clé n'a pas changé garde sa vérification
  const plain = asUser(BUILTIN_TRACKS.find((d) => d.id === 'verglas'));
  assert.equal(Track.decode(withProof(plain, 20.2)).verified, true);
});

await finish('Clés de classement : invariants, TECH-039, ancien algorithme, alias local et vérification d\'auteur.');
