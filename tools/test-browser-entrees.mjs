// Entrées clavier et manette dans un vrai navigateur (Chromium sans écran, WebGL logiciel) : node tools/test-browser-entrees.mjs   (npm run test:browser)
//
// Défauts relevés par la phase « filet de sécurité » (docs/audit/AUDIT_COMPLET.md, lot LOT-2 ; TRANS-03 : un seul état d'entrées partagé par l'interface et la course), écrits d'abord en
// « défauts connus » (tools/harness.mjs). Tous sont corrigés depuis (arbitre d'entrées, js/input.js) : ces scénarios sont désormais des tests de régression ordinaires. Ce que chacun empêchait :
// Les touches sont de VRAIS événements clavier de Chromium (page.keyboard) ; la manette est simulée par un objet que navigator.getGamepads() renvoie (injecté avant le chargement de la page).
//   TECH-004  pause puis Entrée sur « Reprendre » : la course est relancée (chrono à zéro) au lieu de reprendre
//   TECH-005  manette, A tenu à l'ouverture de la pause ou de l'arrivée : A « valide » le bouton focalisé (la pause se referme, la course est relancée à l'arrivée)
//   TECH-006  case de liaison cliquée puis écran quitté : la première touche de la course est liée à l'action (W retiré de « Accélérer »), réglage enregistré
//   TECH-017  fenêtre « Commandes » ouverte : P, T, C, H agissent derrière elle
// Chaque scénario a son contexte de navigateur neuf (stockage vierge : TECH-006 écrit des réglages qui survivent). Des témoins (tests ordinaires, sans défaut) prouvent que la mise en scène
// fonctionne : la même séquence sans le déclencheur du défaut se comporte bien.
// Playwright absent : test ignoré en local, ÉCHEC en CI (comme tools/test-browser.mjs).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { test, finish, precondition } from './harness.mjs';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
let chromium;
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9400 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;

// Une page neuve : stockage vierge, manette simulée (éteinte : __padOn), entrée en invité, tutoriel et question des statistiques écartés.
async function fresh() {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    window.__pad = { id: 'Manette de test', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__padOn = false;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (window.__padOn ? [window.__pad, null, null, null] : [null, null, null, null]) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Entrées');
  await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.copytrack.ui.closeModal());
  return { ctx, page };
}
const poll = { timeout: 30000, polling: 100 };
// Attend n images de la boucle du jeu (et non une durée) : l'effet d'une touche arrive à l'image suivante, quelle que soit la lenteur du rendu logiciel. Sans elle, une régression pourrait
// passer inaperçue « parce que la machine était lente » (l'effet de la touche n'aurait pas encore eu lieu).
const frames = (page, n = 12) => page.evaluate((n) => new Promise((done) => { let k = 0; const f = () => { if (++k >= n) done(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
// Course lancée sur « Premiers Éclats », décompte passé, quelques dixièmes de seconde de course.
async function racing(page) {
  await page.evaluate(() => window.copytrack.playBuiltin(0));
  await page.waitForFunction(() => { const S = window.copytrack.session; return window.copytrack.mode === 'race' && S && !S.demo && S.state === 'racing' && S.logic.steps > 40; }, null, { timeout: 40000, polling: 100 });
}
const state = (page) => page.evaluate(() => { const s = window.copytrack.session; return { state: s.state, steps: s.logic.steps, modal: window.copytrack.ui.modalOpen, pauseShown: !document.getElementById('pause').classList.contains('hidden'), finishShown: !document.getElementById('finish').classList.contains('hidden') }; });

// Un scénario : page neuve, fermée ensuite ; une erreur de la page est un échec, une assertion Node reste une assertion.
const scenario = (fn) => async () => {
  const before = errors.length;
  const { ctx, page } = await fresh();
  let err;
  try { await fn(page); } catch (e) { err = e; } finally { await ctx.close(); }
  const pe = errors.slice(before);
  if (pe.length) throw new Error('erreurs de la page : ' + pe.join(' | '));
  if (err) throw err;
};
const pageTest = (name, fn) => test(name, scenario(fn));
const pageRegression = (id, fn, titre) => test(`régression ${id} : ${titre}`, scenario(fn));      // un défaut corrigé : le nom dit lequel et ce que le jeu doit faire

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-004
console.log('TECH-004 : Entrée sur le bouton focalisé de la pause');
// La pause : P ; le bouton « Reprendre » a le focus (pointeur fin) ; Entrée l'active ET est lue comme « Recommencer » (liaison par défaut : T, Entrée).
async function pauseWithFocusOnResume(page) {
  await racing(page);
  const before = await state(page);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.copytrack.session.state === 'paused', null, poll);
  const focus = await page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  precondition(focus === 'resume', `le bouton « Reprendre » a le focus (focus : ${focus})`);
  precondition((await state(page)).steps >= before.steps, 'la pause garde le chrono');
  return before;
}
await pageTest('TECH-004 témoin : pause puis clic sur « Reprendre » : la course reprend, le chrono n\'est pas remis à zéro', async (page) => {
  await pauseWithFocusOnResume(page);
  const paused = await state(page);
  await page.locator('#pause [data-action="resume"]').evaluate((el) => el.click());
  await frames(page);
  const after = await state(page);
  assert.equal(after.state, 'racing');
  assert.ok(after.steps >= paused.steps, `chrono ${paused.steps} → ${after.steps}`);
});
await pageRegression('TECH-004', async (page) => {
  await pauseWithFocusOnResume(page);
  const paused = await state(page);
  await page.keyboard.press('Enter');                       // vraie touche Entrée sur le bouton focalisé
  await frames(page);
  const after = await state(page);
  assert.ok(after.state === 'racing' && after.steps >= paused.steps, `Entrée sur « Reprendre » devait reprendre la course sans toucher au chrono ; état « ${after.state} », chrono ${paused.steps} → ${after.steps} pas (la course a été relancée)`);
}, 'pause puis Entrée sur « Reprendre » : la course reprend, le chrono n\'est pas remis à zéro');

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-005
console.log('TECH-005 : manette, bouton A tenu à l\'ouverture d\'une superposition');
// A (bouton 0) est une touche d'accélération par défaut ET « Valider » dans les menus : tenu quand la pause ou l'arrivée s'ouvre, il « valide » le bouton focalisé.
const padA = (page, on) => page.evaluate((on) => { const b = window.__pad.buttons[0]; b.pressed = on; b.value = on ? 1 : 0; window.__padOn = true; }, on);
async function racingWithPad(page, aHeld) {
  await racing(page);
  await page.evaluate(() => { const S = window.copytrack.session; window.__calls = { pause: 0, finish: 0 }; const p = S.pause.bind(S); S.pause = () => { window.__calls.pause++; p(); }; });
  await padA(page, aHeld);
  await frames(page);
  precondition(await page.evaluate(() => !!window.copytrack.input.gamepad()), 'la manette simulée est vue par le jeu');
  if (aHeld) precondition(await page.evaluate(() => window.copytrack.input.drive().throttle), 'A tenu = accélérer');
}
const openPause = async (page) => { await page.keyboard.press('KeyP'); await page.waitForFunction(() => window.__calls.pause >= 1, null, poll); };
const arrive = (page) => page.evaluate(() => { const S = window.copytrack.session; S._finish(S.logic.steps / 120); });
await pageTest('TECH-005 témoin : sans A tenu, la pause s\'ouvre et reste ouverte ; l\'arrivée affiche son écran sans relance', async (page) => {
  await racingWithPad(page, false);
  await openPause(page);
  await frames(page);
  assert.equal((await state(page)).state, 'paused');
  await page.evaluate(() => window.copytrack.session.resume());
  await arrive(page);
  await frames(page);
  const s = await state(page);
  assert.ok(s.state === 'finished' && s.finishShown, JSON.stringify(s));
});
await pageRegression('TECH-005', async (page) => {
  await racingWithPad(page, true);
  await openPause(page);
  await frames(page);
  const s = await state(page);
  assert.ok(s.state === 'paused' && s.pauseShown, `pause ouverte avec A tenu : elle devait rester ouverte ; état « ${s.state} », écran de pause ${s.pauseShown ? 'affiché' : 'fermé'} (A a validé « Reprendre »)`);
}, 'manette simulée avec A tenu à l\'ouverture de la pause : la pause s\'ouvre et reste ouverte');
await pageRegression('TECH-005', async (page) => {
  await racingWithPad(page, true);
  await arrive(page);
  await frames(page);
  const s = await state(page);
  assert.ok(s.state === 'finished' && s.finishShown, `arrivée avec A tenu : l'écran de fin devait rester affiché ; état « ${s.state} », chrono ${s.steps} pas (A a validé « Rejouer » : la course est relancée)`);
}, 'manette simulée avec A tenu à l\'arrivée : l\'écran de fin s\'affiche sans relance de la course');

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-006
console.log('TECH-006 : capture de touche en attente qui survit à la navigation');
const DEFAULT_KEYS = async (page) => page.evaluate(async () => (await import('/js/input.js')).defaultKeys());
async function armCapture(page) {
  await page.evaluate(() => window.copytrack.showScreen('controls'));
  await page.waitForSelector('#bind-list .bind-key', { state: 'visible', timeout: 10000 });
  // la case « Dernier checkpoint » (action « respawn », 1re colonne), comme dans la reproduction de l'audit
  const idx = await page.evaluate(() => { const lbls = [...document.querySelectorAll('#bind-list .lbl')]; const i = lbls.findIndex((l) => /^Dernier checkpoint/.test(l.textContent)); return i; });
  precondition(idx >= 0, 'la ligne « Dernier checkpoint » existe dans Paramètres › Commandes');
  await page.locator('#bind-list .bind-key').nth(idx * 2).evaluate((el) => el.click());
  precondition(await page.evaluate(() => typeof window.copytrack.input.capture === 'function'), 'une capture de touche est en attente');
}
async function backToMenu(page) {
  await page.locator('#controls [data-action="back"], .screen:not(.hidden) [data-action="back"]').first().evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack.mode === 'menu', null, poll);
}
await pageTest('TECH-006 témoin : sans case cliquée, W accélère et les liaisons restent celles par défaut', async (page) => {
  const def = await DEFAULT_KEYS(page);
  await racing(page);
  await page.keyboard.down('KeyW');
  await frames(page);
  const r = await page.evaluate(() => ({ v: Math.abs(window.copytrack.session.phys.fwdSpeed), keys: window.copytrack.input.bindings }));
  await page.keyboard.up('KeyW');
  assert.ok(r.v > 3, `vitesse ${r.v}`);
  assert.deepEqual(r.keys, def);
});
await pageRegression('TECH-006', async (page) => {
  const def = await DEFAULT_KEYS(page);
  await armCapture(page);
  await backToMenu(page);                                   // « ← Retour » : la capture n'est pas annulée
  await racing(page);
  await page.keyboard.down('KeyW');                         // la première touche de la course
  await page.waitForFunction(() => Math.abs(window.copytrack.session.phys.fwdSpeed) > 3, null, { timeout: 8000, polling: 100 }).catch(() => {});
  await frames(page);
  const r = await page.evaluate(() => ({ v: Math.abs(window.copytrack.session.phys.fwdSpeed), keys: window.copytrack.input.bindings }));
  await page.keyboard.up('KeyW');
  assert.deepEqual(r.keys, def, `liaisons modifiées à l'insu du joueur : accélérer = ${JSON.stringify(r.keys.accelerate)}, retour au checkpoint = ${JSON.stringify(r.keys.respawn)}`);
  assert.ok(r.v > 3, `la touche W doit accélérer (vitesse ${r.v.toFixed(2)} m/s)`);
}, 'case de liaison cliquée, retour, course, touche W tenue : aucune liaison modifiée, la touche agit normalement');

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-017
console.log('TECH-017 : commandes de course actives sous une fenêtre ouverte');
await pageTest('TECH-017 témoin : sans fenêtre, P met en pause puis reprend ; la fenêtre « Commandes » s\'ouvre bien depuis la pause', async (page) => {
  await racing(page);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.copytrack.session.state === 'paused', null, poll);
  await page.locator('#pause [data-action="help"]').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack.ui.modalOpen && /Commandes/.test(document.getElementById('modal-title').textContent), null, poll);
  await page.keyboard.press('Escape');                       // Échap ferme la fenêtre (et seulement elle)
  await page.waitForFunction(() => !window.copytrack.ui.modalOpen, null, poll);
  assert.equal((await state(page)).state, 'paused');
});
await pageRegression('TECH-017', async (page) => {
  await racing(page);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.copytrack.session.state === 'paused', null, poll);
  const before = await state(page);
  await page.locator('#pause [data-action="help"]').evaluate((el) => el.click());      // Pause › Commandes
  await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, poll);
  await page.keyboard.press('KeyP');
  await frames(page);
  const after = await state(page);
  assert.ok(after.modal, 'la fenêtre est toujours ouverte');
  assert.equal(after.state, 'paused', `P sous la fenêtre « Commandes » : la course ne doit pas reprendre derrière elle (état « ${after.state} », chrono ${before.steps} → ${after.steps} pas)`);
}, 'Pause › Commandes puis P : rien ne se passe sous la fenêtre (la course reste en pause)');

// Arrivée (course « finished », sans superposition de pause) puis la fenêtre « Commandes » ; les bilans de l'Académie et des modes sont dans le même cas (session terminée, aucune superposition).
async function finishedWithWindow(page) {
  await racing(page);
  await page.evaluate(() => {
    const A = window.copytrack, S = A.session;
    window.__horn = 0; A.audio.horn = () => { window.__horn++; };
    S._finish(S.logic.steps / 120);
  });
  await page.waitForFunction(() => window.copytrack.session.state === 'finished', null, poll);
  await page.evaluate(() => window.copytrack.helpModal());
  await page.waitForFunction(() => window.copytrack.ui.modalOpen && /Commandes/.test(document.getElementById('modal-title').textContent), null, poll);
  await frames(page);
}
await pageTest('TECH-017 témoin : sans fenêtre, à l\'arrivée, T relance la course, C change de caméra et H klaxonne (les touches testées existent)', async (page) => {
  await racing(page);
  await page.evaluate(() => { const A = window.copytrack, S = A.session; window.__horn = 0; A.audio.horn = () => { window.__horn++; }; S._finish(S.logic.steps / 120); window.__cam0 = S.camMode; });
  await page.waitForFunction(() => window.copytrack.session.state === 'finished', null, poll);
  await page.keyboard.press('KeyC'); await page.keyboard.press('KeyH');
  await frames(page);
  const r = await page.evaluate(() => ({ cam: window.copytrack.session.camMode !== window.__cam0, horn: window.__horn }));
  assert.equal(r.cam, true, 'C change de caméra'); assert.equal(r.horn, 1, 'H klaxonne');
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => window.copytrack.session.state === 'countdown' || window.copytrack.session.logic.steps === 0, null, poll);
});
for (const [touche, quoi, mesure, attendu] of [
  ['KeyT', 'T (recommencer)', (s) => s.state, 'finished'],
  ['KeyC', 'C (changer de caméra)', (s) => s.cam, 'inchangée'],
  ['KeyH', 'H (klaxon)', (s) => s.horn, 0],
]) {
  await pageRegression('TECH-017', async (page) => {
    await finishedWithWindow(page);
    await page.evaluate(() => { window.__cam0 = window.copytrack.session.camMode; });
    await page.keyboard.press(touche);
    await frames(page);
    const s = await page.evaluate(() => { const S = window.copytrack.session; return { state: S.state, steps: S.logic.steps, cam: S.camMode === window.__cam0 ? 'inchangée' : 'changée', horn: window.__horn, modal: window.copytrack.ui.modalOpen }; });
    assert.ok(s.modal, 'la fenêtre est toujours ouverte');
    assert.equal(mesure(s), attendu, `${quoi} sous la fenêtre « Commandes » : rien ne doit se passer derrière elle (état « ${s.state} », chrono ${s.steps} pas, caméra ${s.cam}, ${s.horn} coup(s) de klaxon)`);
  }, `fenêtre « Commandes » ouverte à l'arrivée puis ${quoi} : rien ne se passe sous la fenêtre`);
}

await browser.close().catch(() => {});
server.kill();
await finish('Les entrées se comportent comme prévu (régressions TECH-004, 005, 006 et 017).');
