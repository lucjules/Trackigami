// Le harnais de test lui-même : le mécanisme « défaut connu » (bugConnu) de tools/harness.mjs : node tools/test-harnais.mjs   (npm test)
//   - un défaut présent (la fonction échoue sur une assertion) : le test réussit ;
//   - un défaut corrigé (la fonction passe) : le test échoue avec le message exact « le défaut <id> est corrigé : retire bugConnu et garde ce test comme test de régression » ;
//   - une exception qui n'est pas une assertion (test cassé, précondition ratée) : le test échoue, il ne passe JAMAIS pour un défaut « connu ».
import assert from 'node:assert/strict';
import { test, finish, bugConnu, jugeBugConnu, precondition } from './harness.mjs';

console.log('Harnais : bugConnu');
test('défaut présent (assertion qui échoue, synchrone) : le jugement se résout', async () => {
  await jugeBugConnu('X-1', () => assert.equal(1, 2));
});
test('défaut présent (assertion qui échoue, asynchrone) : le jugement se résout', async () => {
  await jugeBugConnu('X-2', async () => { await Promise.resolve(); assert.deepEqual([1], [2]); });
});
test('défaut corrigé (la fonction passe) : échec avec le message exact, synchrone et asynchrone', async () => {
  const msg = (id) => `le défaut ${id} est corrigé : retire bugConnu et garde ce test comme test de régression`;
  await assert.rejects(jugeBugConnu('X-3', () => {}), { message: msg('X-3') });
  await assert.rejects(jugeBugConnu('X-4', async () => { await Promise.resolve(); }), { message: msg('X-4') });
});
test('une exception qui n\'est pas une assertion n\'est pas un défaut connu (test cassé : échec, avec la cause)', async () => {
  await assert.rejects(jugeBugConnu('X-5', () => { null.x; }), /erreur inattendue dans le test du défaut X-5.*Cannot read properties of null/s);
  await assert.rejects(jugeBugConnu('X-6', async () => { throw new RangeError('délai dépassé'); }), /erreur inattendue.*délai dépassé/s);
});
test('precondition : une mise en scène ratée est une erreur ordinaire, pas un défaut connu', async () => {
  precondition(true, 'rien');
  await assert.rejects(jugeBugConnu('X-7', () => precondition(false, 'le circuit est chargé')), /erreur inattendue.*précondition du test non remplie : le circuit est chargé/s);
});
// Utilisation réelle : ce test est « ok » parce que son assertion échoue (c'est le défaut imaginaire X-8).
bugConnu('X-8', () => assert.equal(2 + 2, 5), 'exemple d\'usage : réussit parce que l\'assertion échoue');
bugConnu('X-9', async () => { await Promise.resolve(); assert.ok(false, 'défaut asynchrone'); }, 'exemple asynchrone');

await finish('Le mécanisme bugConnu se comporte comme prévu.');
