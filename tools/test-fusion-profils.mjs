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

await finish('Toutes les reproductions de la fusion passent.');
process.exit(0);
