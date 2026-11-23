// Fuzz de la fusion des profils entre appareils (TRANS-13) : node tools/test-fusion-fuzz.mjs   (npm test)
// Des appareils (2 ou 3) partent du même profil d'avant le modèle additif, font des opérations au hasard (gains, achats, cadeaux, code caché, objectifs, titre, premières
// arrivées du jour, médailles…) et se
// synchronisent avec un cloud dans un ordre au hasard. On vérifie, pour CHAQUE scénario :
//   - convergence : après deux tours de synchronisation, tous les appareils et le cloud ont le même profil (quel que soit l'ordre) ; fusionner dans n'importe quel ordre donne le même résultat ;
//   - pièces : solde final = solde de départ + somme des gains réels − prix des objets achetés (une fois chacun) ; jamais plus ; les cadeaux ne sont jamais déduits ;
//   - rien de perdu : objets, médailles (le meilleur niveau), objectifs ;
//   - avec un ANCIEN client (avant 0.16.10) dans la partie : jamais plus de pièces que la vérité (aucune inflation).
// Graines fixes : un échec se rejoue à l'identique (le message donne la graine).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { mergeProfile, sameData } from '../js/cloudsave.js';
import { settle, fromWallet, recordPurchase, recordGift, catalogCost, walletOf, balance } from '../js/wallet.js';
import { CATALOG, itemCost } from '../js/cosmetics.js';

const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const clone = (x) => JSON.parse(JSON.stringify(x));
const BUYABLE = Object.entries(CATALOG).flatMap(([c, list]) => list.filter((x) => x.cost > 0 && !x.exclusive).map((x) => c + ':' + x.id)).slice(0, 14);
const EXCL = Object.entries(CATALOG).flatMap(([c, list]) => list.filter((x) => x.exclusive).map((x) => c + ':' + x.id)).slice(0, 4);
const TRACKS = ['b-a-1', 'b-b-2', 'b-c-3', 'daily-2026-11-20'];
const GOALS = TRACKS.map((k) => k + '#goal');
const GOAL_COINS = 50;

// L'ancienne règle des pièces (client d'avant 0.16.10), recopiée pour simuler un ancien client dans la partie.
function oldMerge(a, b) {
  const owned = { ...(a.owned || {}), ...(b.owned || {}) };
  const lacking = (side) => Object.keys(owned).filter((k) => !(k in (side.owned || {}))).reduce((s, k) => { const [c, ...id] = k.split(':'); return s + (+itemCost(c, id.join(':')) || 0); }, 0);
  const coins = Math.max(0, (+a.coins || 0) - lacking(a), (+b.coins || 0) - lacking(b));
  const medals = { ...(b.medals || {}) };
  for (const [k, t] of Object.entries(a.medals || {})) medals[k] = k in medals ? Math.min(+t || 0, +medals[k] || 0) : t;
  return { ...b, ...a, owned, medals, coins };
}

// Un scénario : renvoie { devices, cloud, truth } ; old : index d'un appareil qui reste un ancien client (ou -1).
function scenario(seed, nDev, { old = -1, ops = 30 } = {}) {
  const rnd = lcg(seed), int = (n) => Math.floor(rnd() * n), pick = (a) => a[int(a.length)];
  const start = { id: 'JOUEUR', coins: 100 + int(900), owned: { [BUYABLE[0]]: 1 }, medals: {}, goals: {}, eggs: {}, stats: { races: 0, earned: 0 } };      // profil d'avant le modèle additif
  const truth = { coins: start.coins, bought: new Set(), spentAll: 0, medals: {}, goals: new Set(), owned: new Set(Object.keys(start.owned)), oldGain: 0 };      // spentAll : chaque achat réel (un objet acheté sur deux appareils hors ligne compte deux fois)
  const devs = Array.from({ length: nDev }, (_, i) => ({ id: 'dev' + i, old: i === old, p: i === old ? clone(start) : fromWallet(clone(start)) }));
  let cloud = clone(start);
  const earn = (d, n) => { d.p.coins = (+d.p.coins || 0) + n; if (!d.old) settle(d.p, d.id); else truth.oldGain += n; truth.coins += n; };
  const sync = (d) => {
    if (d.old) { const m = oldMerge(d.p, cloud); d.p = clone(m); cloud = clone(m); return; }
    const m = mergeProfile(d.p, cloud);
    d.p = clone(m); cloud = clone(m);
  };
  for (let i = 0; i < ops; i++) {
    const d = pick(devs), r = rnd();
    if (r < 0.3) earn(d, 1 + int(120));
    else if (r < 0.45) {                    // achat
      const k = pick(BUYABLE);
      if (!d.old) settle(d.p, d.id);
      if (d.p.owned && d.p.owned[k]) continue;
      const cost = catalogCost(k);
      if ((+d.p.coins || 0) < cost) continue;
      d.p.coins -= cost; d.p.owned = { ...(d.p.owned || {}), [k]: 1 };
      if (!d.old) { recordPurchase(d.p, [k.split(':')]); settle(d.p, d.id); }
      if (!truth.owned.has(k)) truth.bought.add(k);
      truth.spentAll += cost;
      truth.owned.add(k);
    } else if (r < 0.52) {                  // exclusif mérité (offert)
      const k = pick(EXCL);
      if (d.p.owned && d.p.owned[k]) continue;
      d.p.owned = { ...(d.p.owned || {}), [k]: 1 };
      if (!d.old) { recordGift(d.p, k); settle(d.p, d.id); }
      truth.owned.add(k);
    } else if (r < 0.56) {                  // code Konami : la LED arc-en-ciel offerte (valeur 250) et +100 ◆, une fois par appareil qui ne l'a pas encore vu
      if (d.p.eggs && d.p.eggs.konami) continue;
      d.p.eggs = { ...(d.p.eggs || {}), konami: 1 }; d.p.owned = { ...(d.p.owned || {}), 'led:rainbow': 1 };
      if (!d.old) recordGift(d.p, 'led:rainbow');
      truth.owned.add('led:rainbow');
      earn(d, 100);
    } else if (r < 0.66) {                  // objectif bonus : payé seulement s'il n'est pas déjà réussi sur cet appareil
      const k = pick(GOALS);
      d.p.goals = { ...(d.p.goals || {}) };
      if (d.p.goals[k]) continue;
      d.p.goals[k] = 1; truth.goals.add(k);
      earn(d, GOAL_COINS);
    } else if (r < 0.70) {                  // titre choisi (daté, comme rewards.chooseTitle)
      d.p.title = pick(['', 'veteran', 'derapeur', 'fidele']); d.p.titleAt = 1000 + i;
    } else if (r < 0.74) {                  // première arrivée du jour sur un circuit (progression.awardRace)
      const day = pick(['2026-11-20', '2026-11-21']), k = pick(TRACKS);
      const xd = d.p.xpDay && d.p.xpDay.day === day ? d.p.xpDay : { day, keys: [] };
      if (!xd.keys.includes(k)) xd.keys = [...xd.keys, k];
      d.p.xpDay = xd;
    } else if (r < 0.80) {                  // médaille
      const k = pick(TRACKS), t = int(4);
      d.p.medals = { ...(d.p.medals || {}) };
      if (!(k in d.p.medals) || t < d.p.medals[k]) d.p.medals[k] = t;
      truth.medals[k] = Math.min(truth.medals[k] ?? 9, t);
    } else sync(d);
  }
  const before = devs.map((d) => clone(d.p));
  for (let round = 0; round < 2; round++) for (const d of devs) sync(d);
  // (un ancien client réécrit le portefeuille du cloud avec sa copie, sans le lire : les nouveaux appareils, qui gardent leurs compteurs, le rétablissent en se synchronisant)
  if (old >= 0) for (let round = 0; round < 2; round++) for (const d of devs) if (!d.old) sync(d);
  return { devs, cloud, truth, before, start };
}
const priceOf = (keys) => [...keys].reduce((s, k) => s + catalogCost(k), 0);
const shared = (p) => ({ coins: p.coins, wallet: p.wallet, owned: p.owned, medals: p.medals, eggs: p.eggs, goals: p.goals, title: p.title, titleAt: p.titleAt, xpDay: p.xpDay });

console.log('Pièces : modèle additif, 2 et 3 appareils');
for (const nDev of [2, 3]) {
  test(`${nDev} appareils, 2 500 scénarios : convergence (pièces, objets, médailles, objectifs, titre, premières arrivées du jour), solde = départ + gains réels − achats (une fois), cadeaux jamais déduits, rien de perdu`, () => {
    for (let s = 1; s <= 2500; s++) {
      const seed = s * 7919 + nDev;
      const { devs, cloud, truth } = scenario(seed, nDev);
      for (const d of devs) assert.ok(sameData(shared(d.p), shared(cloud)), `graine ${seed} : l'appareil ${d.id} a convergé`);
      const expect = truth.coins - priceOf(truth.bought);
      assert.equal(cloud.coins, expect, `graine ${seed} : pièces ${cloud.coins}, attendu ${expect} (aucun gain perdu, aucune pièce créée)`);
      assert.equal(cloud.coins, balance(cloud, walletOf(cloud)));
      for (const k of truth.owned) assert.ok(cloud.owned[k], `graine ${seed} : objet ${k} perdu`);
      for (const [k, t] of Object.entries(truth.medals)) assert.equal(cloud.medals[k], t, `graine ${seed} : médaille ${k}`);
      for (const k of truth.goals) assert.ok(cloud.goals && cloud.goals[k], `graine ${seed} : objectif ${k} perdu`);
    }
  });
}
test('l\'ordre ne compte pas : fusionner les versions des appareils dans n\'importe quel ordre donne le même profil partagé (pièces, objets, objectifs, titre…) ; fusionner avec soi-même ne change rien (1 500 scénarios à 3 appareils)', () => {
  for (let s = 1; s <= 1500; s++) {
    const seed = s * 104729;
    const { before } = scenario(seed, 3, { ops: 25 });
    const orders = [[0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0], [0, 2, 1], [2, 0, 1]];
    const results = orders.map((o) => o.map((i) => before[i]).reduce((acc, p) => mergeProfile(acc, p)));
    for (const r of results) assert.ok(sameData(shared(r), shared(results[0])), `graine ${seed} : l'ordre de fusion change le résultat`);
    for (const r of results) assert.ok(sameData(shared(mergeProfile(r, r)), shared(r)), `graine ${seed} : fusionner avec soi-même change le résultat`);
  }
});
test('avec un ANCIEN client dans la partie (2 000 scénarios) : jamais plus de pièces que la vérité, aucun achat oublié ; les nouveaux appareils convergent', () => {
  let lost = 0;
  for (let s = 1; s <= 2000; s++) {
    const seed = s * 31337;
    const { devs, cloud, truth } = scenario(seed, 3, { old: 2 });
    const expect = truth.coins - priceOf(truth.bought);
    const news = devs.filter((d) => !d.old);
    for (const d of news) assert.ok(d.p.coins <= expect, `graine ${seed} : ${d.p.coins} > ${expect} : pièces créées`);
    for (const d of news) assert.ok(sameData(shared(d.p), shared(news[0].p)), `graine ${seed} : les nouveaux appareils divergent`);
    // seuls des gains de l'ANCIEN client peuvent manquer (ceux qu'il a écrits dans un cloud encore sans portefeuille sont repris par la ligne de base) : aucun gain d'un nouvel
    // appareil n'est oublié ; au pire, un objet acheté À LA FOIS par l'ancien client et par un nouvel appareil est payé deux fois (il l'a réellement été)
    const floor = truth.coins - truth.oldGain - truth.spentAll;
    assert.ok(news[0].p.coins >= floor, `graine ${seed} : ${news[0].p.coins} < ${floor} : un gain d'un nouvel appareil est perdu`);
    if (news[0].p.coins < expect) lost++;
    assert.ok(cloud);
  }
  console.log(`       (scénarios où des gains de l'ancien client ne sont pas comptés : ${lost} / 2000 — attendu, l'ancienne règle les perdait aussi)`);
});

console.log('Migration d\'un profil d\'avant le modèle additif');
test('un ancien profil (pièces, objets achetés, cadeaux) est migré SANS changement de total ; deux copies divergentes suivent l\'ancienne règle sans jamais déduire un cadeau', () => {
  const old = { id: 'X', coins: 1234, owned: { [BUYABLE[1]]: 1, 'led:rainbow': 1, [EXCL[0]]: 1 }, eggs: { konami: 1 } };
  const p = fromWallet(clone(old));
  assert.equal(p.coins, 1234); assert.equal(p.wallet.base, 1234);
  assert.ok(!('led:rainbow' in p.wallet.pre) && !(EXCL[0] in p.wallet.pre), 'les cadeaux ne sont pas des achats');
  assert.equal(mergeProfile(p, clone(old)).coins, 1234, 'avec sa propre copie ancienne : inchangé');
  assert.equal(mergeProfile(clone(old), p).coins, 1234);
  // Deux copies anciennes divergentes : A a gagné 300 de plus, B a reçu la LED offerte (sans rien payer) : 1 534, rien de déduit pour la LED.
  const A = { id: 'X', coins: 1534, owned: { [BUYABLE[1]]: 1 } }, B = { id: 'X', coins: 1234, owned: { [BUYABLE[1]]: 1, 'led:rainbow': 1 }, eggs: { konami: 1 } };
  assert.equal(mergeProfile(fromWallet(clone(A)), fromWallet(clone(B))).coins, 1534);
  // B a ACHETÉ un objet (avant le modèle) que A n'a pas : son prix est déduit du côté de A (l'ancienne règle) : max(1534 − prix, 1234 − prix) … jamais plus.
  const C = { id: 'X', coins: 1234 - catalogCost(BUYABLE[2]), owned: { [BUYABLE[1]]: 1, [BUYABLE[2]]: 1 } };
  assert.equal(mergeProfile(fromWallet(clone(A)), fromWallet(clone(C))).coins, 1534 - catalogCost(BUYABLE[2]));
});

finish('Toutes les fusions de profils tiennent (convergence, aucune inflation, aucune perte).');
