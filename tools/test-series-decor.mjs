// Séries de décor du garage (COMPLETE-018) : node tools/test-series-decor.mjs   (npm test)
// Un débouché aux pièces ◆ une fois le garage entier acquis : une série cosmétique par décor de la carrière (couleurs de LED, de traînée, de jante et un dessin),
// avec palette, préréglages et collection. AUCUN avantage de course : l'absence d'effet sur la physique est prouvée par tools/test-cosmetics-physics.mjs (structure, texte et
// dynamique, qui parcourent tout le catalogue, séries comprises) ; ici, la cohérence des données, l'économie, le rendu et l'achat.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const { DECOR_SERIES, DECOR_COST, DECOR_RIMS, decorThemeId } = await import('../js/decorSeries.js');
const { DECORS, CAREER_ORDER } = await import('../js/themes.js');
const { CATALOG, PRESETS, THEMES, PALETTES, sanitizeLoadout, DEFAULT_LOADOUT, itemCost } = await import('../js/cosmetics.js');
const { COLLECTIONS, COLLECTION_COINS, collectionProgress } = await import('../js/rewards.js');
const { createCar, DECAL_ART_IDS } = await import('../js/carModel.js');
const { profile, saveProfile, owns, missingItems, buy } = await import('../js/profile.js');

const CATS = ['led', 'trail', 'decal', 'wheels'];

console.log('Données');
test('une série par décor de la carrière, aucun oubli, aucun décor inconnu', () => {
  assert.deepEqual(DECOR_SERIES.map((s) => s.decor).sort(), [...CAREER_ORDER].sort());
  for (const s of DECOR_SERIES) assert.equal(s.label, DECORS[s.decor].label, 'même nom que le décor : ' + s.decor);
});
test('quatre éléments payants par série, de quatre catégories différentes, ordinaires (jamais exclusifs), au thème de la série', () => {
  for (const s of DECOR_SERIES) {
    for (const c of CATS) {
      const it = CATALOG[c].find((x) => x.id === s.decor);
      assert.ok(it, `${c}:${s.decor}`);
      assert.equal(it.cost, DECOR_COST[c]); assert.ok(it.cost > 0 && !it.exclusive);
      assert.equal(it.theme, decorThemeId(s.decor));
      assert.equal(CATALOG[c].filter((x) => x.id === s.decor).length, 1, 'identifiant unique dans la catégorie');
    }
    assert.match(CATALOG.led.find((x) => x.id === s.decor).color, /^#[0-9a-f]{6}$/i);
    assert.match(CATALOG.trail.find((x) => x.id === s.decor).color, /^#[0-9a-f]{6}$/i);
  }
});
test('aucun identifiant ni libellé en double dans les quatre catégories (les séries ne masquent aucun élément existant)', () => {
  for (const c of CATS) {
    const ids = CATALOG[c].map((x) => x.id), labels = CATALOG[c].map((x) => x.label);
    assert.equal(new Set(ids).size, ids.length, c + ' : identifiants'); assert.equal(new Set(labels).size, labels.length, c + ' : libellés');
  }
});
test('thème, palette de trois couleurs, deux préréglages valides par série ; un préréglage ne dépend d’aucun exclusif', () => {
  for (const s of DECOR_SERIES) {
    const id = decorThemeId(s.decor);
    assert.ok(THEMES.some((t) => t.id === id) && PALETTES.some((p) => p.theme === id && p.colors.length === 3));
    const mine = PRESETS.filter((p) => p.theme === id);
    assert.equal(mine.length, 2);
    for (const pr of mine) {
      const l = sanitizeLoadout(pr.loadout);
      for (const c of CATS) assert.equal(l[c], s.decor, `${pr.id} : ${c} conservé par sanitizeLoadout`);
      assert.equal(l.body, pr.loadout.body);
    }
  }
});
test('une collection par série : ses quatre éléments, une catégorie de chaque, payants', () => {
  for (const s of DECOR_SERIES) {
    const col = COLLECTIONS.find((c) => c.id === 'c-' + decorThemeId(s.decor));
    assert.ok(col, s.decor);
    assert.deepEqual(col.items.map(([c]) => c).sort(), [...CATS].sort());
    for (const [, id] of col.items) assert.equal(id, s.decor);
  }
});

console.log('Économie');
test('une série coûte plus que la prime de sa collection : un VRAI débouché pour les pièces, jamais une source', () => {
  const cost = CATS.reduce((a, c) => a + DECOR_COST[c], 0);
  assert.equal(cost, 360);
  assert.ok(cost > COLLECTION_COINS * 3, `${cost} ◆ la série contre ${COLLECTION_COINS} ◆ de prime`);
  const all = DECOR_SERIES.reduce((a, s) => a + CATS.reduce((b, c) => b + itemCost(c, s.decor), 0), 0);
  assert.equal(all, 12 * 360);
});

console.log('Rendu');
test('chaque dessin de série a son motif, chaque jante sa couleur ; la voiture se construit (voiture, moto, bateau, deltaplane) avec la série entière', () => {
  for (const s of DECOR_SERIES) {
    assert.ok(DECAL_ART_IDS.includes(s.decor), 'motif de dessin : ' + s.decor);
    const rim = DECOR_RIMS[s.decor];
    assert.ok(/^#[0-9a-f]{6}$/i.test(rim[0]) && rim[1] >= 0 && rim[1] <= 1 && rim[2] >= 0 && rim[2] <= 1);
    const pr = PRESETS.find((p) => p.theme === decorThemeId(s.decor));
    const car = createCar(sanitizeLoadout(pr.loadout));
    let meshes = 0, flat = 0;
    car.group.traverse((o) => { if (o.isMesh) { meshes++; const p = o.geometry.attributes.position; assert.ok(p && p.count > 0); for (const v of p.array) if (!Number.isFinite(v)) flat++; } });
    assert.ok(meshes > 20); assert.equal(flat, 0, 'aucun sommet NaN : ' + s.decor);
    for (const k of ['car', 'moto', 'boat', 'glider']) car.setVehicle(k, true);
  }
});
test('le dessin d’une série se voit : il ajoute des formes par rapport à la même voiture sans dessin', () => {
  const count = (l) => { let n = 0; createCar(sanitizeLoadout(l)).group.traverse((o) => { if (o.isMesh) n++; }); return n; };
  for (const s of DECOR_SERIES) assert.ok(count({ ...DEFAULT_LOADOUT, decal: s.decor }) > count({ ...DEFAULT_LOADOUT, decal: 'none' }), s.decor);
});

console.log('Achat');
test('acheter la série : seulement avec assez de pièces, une fois payée elle est à soi et se rééquipe', () => {
  const s = DECOR_SERIES[0], p = profile();
  p.owned = {}; p.coins = 100; p.wallet = undefined; saveProfile();
  const draft = sanitizeLoadout({ ...DEFAULT_LOADOUT, led: s.decor, trail: s.decor, decal: s.decor, wheels: s.decor });
  const miss = missingItems(draft);
  assert.equal(miss.length, 4);
  assert.equal(buy(miss), false); assert.equal(profile().coins, 100, 'pas assez : rien de dépensé');
  profile().coins = 360; saveProfile();
  assert.equal(buy(miss), true); assert.equal(profile().coins, 0);
  for (const c of CATS) assert.ok(owns(c, s.decor));
  assert.deepEqual(missingItems(draft), []);
  assert.equal(collectionProgress(COLLECTIONS.find((c) => c.id === 'c-' + decorThemeId(s.decor))).done, true);
});

await finish('Tous les tests des séries de décor passent.');
