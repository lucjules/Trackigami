// Une seule fusion, déterministe, pour la synchronisation ET l'import (TRANS-07, TRANS-13) : node tools/test-fusion-profils.mjs   (npm test)
//   TECH-029  pièces ◆ : modèle additif (gains par appareil, achats par objet, objets offerts jamais déduits) ; +50 / +50 = +100 ;
//   TECH-028  objectifs réunis (une seule récompense), titre et premières arrivées du jour (xpDay) fusionnés : plus d'écriture à chaque synchronisation ;
//   TECH-077  une valeur de médaille invalide est ignorée (jamais « cristal ») ;
//   TECH-030  import « Fusionner » = la fusion de la synchronisation ; records invalides ou d'une autre physique refusés ; brouillon et bibliothèques intacts ;
//   TECH-027  deux onglets : le cache du profil d'un onglet n'écrase plus la progression de l'autre ;
//   TECH-023  une écriture faite pendant une synchronisation part dans la foulée.
// Serveur Supabase simulé (tools/fake-supabase.mjs), temps virtuel (une « synchronisation de 6 s » sans attendre).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device, srv } from './fake-supabase.mjs';

device('A');
const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account } = await import('../js/account.js');
const P = await import('../js/profile.js');
const { profile, saveProfile, reloadProfile, addCoins, buy } = P;
const { itemCost } = await import('../js/cosmetics.js');

// ---- Temps virtuel (setTimeout remplacé : une « synchronisation de 6 s » sans attendre) ----
const clock = { now: 0 };
let seq = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, { at: clock.now + Math.max(0, +ms || 0), fn, id }); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };

function boot(name) {
  const d = device(name);
  account.state = null; account.status = 'idle'; account.lastError = ''; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope('');
  reloadProfile();
  return d;
}
async function on(name) { boot(name); await account.restore(); reloadProfile(); }      // « recharger la page » sur cet appareil (compte repris, son profil relu comme au lancement)
const cloudOf = () => srv.saves.get(account.uid).data;
let nAcc = 0;
async function twoDevices() {
  const name = 'Fus_' + ++nAcc;
  srv.offline = false; srv.delay = {};
  boot('A' + nAcc); await account.signUp(name, 'motdepasse1');
  boot('B' + nAcc); await account.signIn(name, 'motdepasse1');
  return ['A' + nAcc, 'B' + nAcc];
}

console.log('TECH-029 : pièces ◆, modèle additif');
await test('100 ◆ sur les deux appareils, +50 sur CHACUN hors ligne : 200 ◆ partout après synchronisation (avant : 150)', async () => {
  const [A, B] = await twoDevices();
  await on(A); addCoins(100); await account.sync();
  await on(B); await account.sync(); assert.equal(profile().coins, 100);
  srv.offline = true;
  await on(A); addCoins(50);
  await on(B); addCoins(50);
  srv.offline = false;
  for (const d of [A, B, A]) { await on(d); await account.sync(); }
  assert.equal(profile().coins, 200, 'A'); await on(B); await account.sync(); assert.equal(profile().coins, 200, 'B');
  assert.equal(cloudOf().profile.coins, 200, 'cloud');
});
await test('objet OFFERT (clin d\'œil caché : LED arc-en-ciel, valeur 250) sur B pendant que A gagne 200 ◆ : rien n\'est déduit (500 + 100 + 200 = 800 ; avant : 600)', async () => {
  const [A, B] = await twoDevices();
  await on(A); addCoins(500); await account.sync();
  await on(B); await account.sync();
  srv.offline = true;
  await on(A); addCoins(200);
  await on(B); { const p = profile(); p.eggs.konami = 1; p.owned['led:rainbow'] = 1; addCoins(100); saveProfile(); }      // (comme js/app/wiring.js : le code Konami)
  srv.offline = false;
  for (const d of [A, B, A]) { await on(d); await account.sync(); }
  assert.equal(profile().coins, 800); assert.ok(profile().owned['led:rainbow']);
  await on(B); await account.sync(); assert.equal(profile().coins, 800);
});
await test('achat sur A, gains sur B : l\'achat est déduit UNE fois, les gains de B gardés (300 − prix + 40)', async () => {
  const [A, B] = await twoDevices();
  await on(A); addCoins(300); await account.sync();
  await on(B); await account.sync();
  const cost = itemCost('spoiler', 'gt');
  srv.offline = true;
  await on(A); assert.equal(buy([['spoiler', 'gt']]), true);
  await on(B); addCoins(40);
  srv.offline = false;
  for (const d of [A, B, A, B]) { await on(d); await account.sync(); }
  assert.equal(profile().coins, 300 - cost + 40); assert.ok(profile().owned['spoiler:gt']);
});

console.log('TECH-028 : objectifs, titre, premières arrivées du jour');
const { completeGoal, goalDone } = await import('../js/career.js');
const { chooseTitle, emptyContext } = await import('../js/rewards.js');
const { awardRace } = await import('../js/progression.js');
const patches = () => srv.calls.filter((c) => c.method === 'PATCH' && c.path === '/rest/v1/cloud_saves').length;
await test('objectif réussi sur B : A le voit réussi, ne le repaie pas ; les deux convergent (une seule récompense)', async () => {
  const [A, B] = await twoDevices();
  await on(A); completeGoal('b-a-1#goal'); await account.sync();
  await on(B); await account.sync(); completeGoal('b-b-2#goal'); await account.sync();
  await on(A); await account.sync();
  assert.ok(goalDone('b-b-2#goal'), 'l\'objectif de B est réussi sur A');
  const before = profile().coins;
  assert.equal(completeGoal('b-b-2#goal'), 0, 'pas de seconde récompense'); assert.equal(profile().coins, before);
  await account.sync(); await on(B); await account.sync();
  assert.ok(goalDone('b-a-1#goal') && goalDone('b-b-2#goal'));
  assert.equal(profile().coins, 100, 'deux objectifs, deux récompenses de 50 ◆, pas trois');
});
await test('titre et premières arrivées du jour différents sur A et B : ils convergent, puis plus AUCUNE écriture (avant : une à chaque synchronisation)', async () => {
  const [A, B] = await twoDevices();
  const ctx = { ...emptyContext(), races: 250, turbos: 150 };
  await on(A); awardRace({ trackKey: 'b-a-1', tier: -1 }, '2026-11-20'); chooseTitle('veteran', ctx); await account.sync();
  await on(B); await account.sync(); awardRace({ trackKey: 'b-b-2', tier: -1 }, '2026-11-20'); clock.now += 1000; chooseTitle('derapeur', ctx); await account.sync();
  await on(A); await account.sync();
  await on(B); await account.sync();
  await on(A); await account.sync();
  srv.calls.length = 0;
  for (const d of [A, B, A, B]) { await on(d); assert.equal(await account.sync(), 'à jour', d); }
  assert.equal(patches(), 0, 'aucune écriture');
  assert.deepEqual([...profile().xpDay.keys].sort(), ['b-a-1', 'b-b-2'], 'premières arrivées du jour réunies');
  const titleB = profile().title; await on(A); assert.equal(profile().title, titleB, 'même titre partout');
});

console.log('TECH-077 : valeur de médaille invalide');
const { mergeProfile } = await import('../js/cloudsave.js');
test('une valeur de médaille invalide est ignorée : jamais convertie en cristal (0)', () => {
  for (const junk of ['x', null, -1, 7, 1.5, NaN, {}, [], '']) {
    const m = mergeProfile({ id: 'A', medals: { k: junk, j: 2 } }, { id: 'B', medals: { j: 3 } });
    assert.notEqual(m.medals.k, 0, 'valeur ' + JSON.stringify(junk) + ' devenue cristal');
    assert.equal(m.medals.j, 2);
    const n = mergeProfile({ id: 'A', medals: { k: junk } }, { id: 'B', medals: { k: 2 } });
    assert.equal(n.medals.k, 2, 'la valeur valide de l\'autre côté est gardée (' + JSON.stringify(junk) + ')');
  }
});

console.log('TECH-030 : import « Fusionner »');
const { applySave } = P;
const { PHYS_VER } = await import('../js/version.js');
await test('import « Fusionner » : XP, objectifs, Académie, licences, médailles conservés ; record fabriqué ou d\'une autre physique refusé ; brouillon et bibliothèques intacts', async () => {
  boot('I1');
  const p = profile();
  Object.assign(p, { xp: 900, goals: { 'b-a-1#goal': 1 }, academy: { prise: 1 }, licences: { C: 1700000000000 }, medals: { 'b-a-1': 0 }, drills: { trajectoire: { lvl: 2, best: 50 } } });
  saveProfile();
  storage.saveRecord('b-a-1', { time: 30, pv: PHYS_VER, splits: [], date: 5, inputs: 'i' });
  storage.setEditorDraft({ code: 'BROUILLON-LOCAL' });
  storage.savePrefab({ id: 'pf1', name: 'Mon prefab', code: 'SHP1:local' });
  storage.saveCustomDeco({ id: 'cd1', name: 'Ma pièce', parts: [] });
  storage.saveMode({ id: 'm1', name: 'Mon mode', rules: { a: 1 } });
  const imp = { v: 1, id: 'AUTRE-JOUEUR', t: 1, data: {
    profile: JSON.stringify({ id: 'AUTRE-JOUEUR', coins: 10, xp: 5, medals: { 'b-a-1': 3, 'b-c-3': 2 }, goals: { 'b-c-3#goal': 1 }, owned: {} }),
    'rec3.b-a-1': JSON.stringify({ time: 0.001, splits: [], date: 9 }),                                 // fabriqué : sans version de physique
    'rec3.b-x-7': JSON.stringify({ time: 12, pv: PHYS_VER - 1, splits: [], date: 9 }),                  // autre physique
    'rec3.b-y-8': JSON.stringify({ time: 0, pv: PHYS_VER, splits: [], date: 9 }),                       // invalide
    'rec3.b-c-3': JSON.stringify({ time: 25, pv: PHYS_VER, splits: [], date: 9 }),                      // bon
    draft: JSON.stringify({ code: 'BROUILLON-IMPORTÉ' }),
    prefabs: JSON.stringify([{ id: 'x', name: 'Importé', code: 'SHP1:imp' }]), cdecos: '[]', modes: '[]',
  } };
  applySave(imp, 'merge');
  const q = profile();
  assert.equal(q.xp, 900); assert.ok(q.goals['b-a-1#goal'] && q.goals['b-c-3#goal']); assert.ok(q.academy.prise); assert.equal(q.licences.C, 1700000000000);
  assert.equal(q.medals['b-a-1'], 0, 'cristal gardé'); assert.equal(q.medals['b-c-3'], 2); assert.equal(q.drills.trajectoire.lvl, 2);
  assert.equal(storage.getRecord('b-a-1').time, 30, 'le vrai 30 s n\'est pas remplacé par un 0,001 s fabriqué');
  assert.equal(storage.getRecord('b-x-7'), null, 'record d\'une autre physique refusé');
  assert.equal(storage.getRecord('b-y-8'), null);
  assert.equal(storage.getRecord('b-c-3').time, 25, 'un bon record importé est gardé');
  assert.equal(storage.getEditorDraft().code, 'BROUILLON-LOCAL');
  assert.deepEqual(storage.listPrefabs().map((x) => x.id), ['pf1']); assert.deepEqual(storage.listCustomDecos().map((x) => x.id), ['cd1']); assert.deepEqual(storage.listModes().map((x) => x.id), ['m1']);
  assert.notEqual(q.id, 'AUTRE-JOUEUR', 'l\'identité du joueur ne change pas');
});
await test('import « Remplacer » garde son sens : tout est remplacé (y compris un record d\'une autre physique)', async () => {
  boot('I2');
  const p = profile(); p.xp = 900; saveProfile();
  applySave({ v: 1, id: 'X', t: 1, data: { profile: JSON.stringify({ coins: 3, xp: 5 }), 'rec3.b-x-7': JSON.stringify({ time: 12, pv: PHYS_VER - 1, splits: [], date: 9 }) } }, 'replace');
  assert.equal(profile().xp, 5); assert.equal(profile().coins, 3); assert.equal(storage.getRecord('b-x-7').time, 12);
});

await finish('Toutes les reproductions de la fusion passent.');
process.exit(0);
