// Refus du serveur pour cause de version (COMPLETE-005) : le jeu reconnaît le DRAPEAU `versionMismatch` de la fonction « submit-score », pas son texte français,
// et dit au joueur ce qui se passe : « serveur en cours de mise à jour, réessaie dans quelques minutes » (le site est en avance sur la fonction pendant un déploiement)
// ou « recharge la page » (c'est la page qui est périmée). node tools/test-version-serveur.mjs   (npm test)
// Le serveur lui-même (422, drapeau, version annoncée) : tools/test-submit-handler.mjs. L'affichage dans l'écran d'arrivée : tools/test-browser.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: () => null, length: 0 };
const { online, OnlineError, versionMismatchText } = await import('../js/online.js');
const { PHYS_VER } = await import('../js/version.js');

const json = (v, status) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
// Un appel à submit-score dont le serveur répond `reply` (status 422) : renvoie l'erreur levée par le vrai client.
async function submitWith(reply, status = 422) {
  const origFetch = globalThis.fetch, orig = { ensureSession: online.ensureSession, ensurePlayer: online.ensurePlayer, session: online.session };
  online.ensureSession = async () => {}; online.ensurePlayer = async () => {}; online.session = { access_token: 'jeton' };
  globalThis.fetch = async () => json(reply, status);
  try { await online.submitScore({ trackKey: 'b-0-x', inputs: 'QUJD', time: 20, physVer: PHYS_VER }, 'Test'); return null; }
  catch (e) { return e; }
  finally { globalThis.fetch = origFetch; Object.assign(online, orig); }
}

console.log('Le client lit le drapeau du serveur');
await test('422 avec versionMismatch : erreur de code « version-mismatch » portant la version du serveur, quel que soit le texte', async () => {
  for (const error of ['Version du jeu différente (jeu 38, serveur 39) : recharge le jeu pour le mettre à jour.', 'Another message entirely', '']) {
    const e = await submitWith({ error, versionMismatch: true, serverPhysVer: PHYS_VER + 1 });
    assert.ok(e instanceof OnlineError, 'erreur du client'); assert.equal(e.code, 'version-mismatch', error); assert.equal(e.status, 422); assert.equal(e.serverPhysVer, PHYS_VER + 1);
  }
});
await test('version du serveur absente ou absurde : le drapeau suffit, la version reste inconnue (null)', async () => {
  for (const sv of [undefined, null, 'trente-neuf', NaN]) {
    const e = await submitWith({ error: 'x', versionMismatch: true, serverPhysVer: sv });
    assert.equal(e.code, 'version-mismatch'); assert.equal(e.serverPhysVer, null);
  }
});
await test('le TEXTE seul ne suffit plus : sans drapeau, même la phrase « Version du jeu différente » n\'est pas prise pour un refus de version', async () => {
  const e = await submitWith({ error: 'Version du jeu différente (jeu 38, serveur 39) : recharge le jeu pour le mettre à jour.' });
  assert.equal(e.code, 'http'); assert.notEqual(e.code, 'version-mismatch');
  const f = await submitWith({ error: 'Course non confirmée.', versionMismatch: false });
  assert.equal(f.code, 'http');
});
await test('une autre erreur du serveur garde son message (course non confirmée, limite de publications)', async () => {
  assert.equal((await submitWith({ error: 'Course non confirmée.' })).message, 'Course non confirmée.');
  assert.equal((await submitWith({ error: 'Trop de publications : réessaie dans une heure.' }, 429)).code, 'rate');
});

console.log('Le message dit la bonne chose');
const err = (serverPhysVer) => Object.assign(new OnlineError('x', 'version-mismatch', 422), { serverPhysVer });
test('serveur en RETARD sur le jeu (déploiement en cours) : « en cours de mise à jour, réessaie dans quelques minutes », pas « recharge »', () => {
  const t = versionMismatchText(err(PHYS_VER - 1), PHYS_VER);
  assert.match(t, /en cours de mise à jour/); assert.match(t, /réessaie dans quelques minutes/); assert.match(t, /Record gardé ici/); assert.doesNotMatch(t, /[Rr]echarge/);
});
test('serveur en AVANCE sur le jeu (page périmée) : « recharge la page », pas « réessaie dans quelques minutes »', () => {
  const t = versionMismatchText(err(PHYS_VER + 1), PHYS_VER);
  assert.match(t, /[Rr]echarge la page/); assert.match(t, /Record gardé ici/); assert.doesNotMatch(t, /en cours de mise à jour|quelques minutes/);
});
test('version du serveur inconnue : les deux pistes, sans rien affirmer', () => {
  const t = versionMismatchText(err(null), PHYS_VER);
  assert.match(t, /quelques minutes/); assert.match(t, /recharge la page/); assert.match(t, /Record gardé ici/);
  assert.equal(versionMismatchText(null, PHYS_VER), t, 'pas d\'erreur : même texte prudent');
});

console.log('Le jeu utilise le drapeau (garde-fou)');
test('main.js ne reconnaît plus le refus de version par une expression régulière sur le texte français', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Version du jeu différente/); assert.match(src, /code === 'version-mismatch'/); assert.match(src, /versionMismatchText/);
});

finish('Le refus de version du serveur est reconnu par son drapeau et expliqué au joueur.');
