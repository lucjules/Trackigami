// Chapitres bonus 13 et 14 (0.17.0, COMPLETE-002) dans un vrai navigateur (Chromium sans écran, WebGL logiciel) : node tools/test-browser-extension.mjs   (npm run test:browser)
//
// Chacun des 12 circuits ajoutés (une mécanique chacun) est lancé depuis la carrière comme le ferait le joueur (window.copytrack.playBuiltin), joué jusqu'à l'arrivée par le pilote
// automatique branché sur les commandes de la vraie course (RaceSession, rendu compris), et fini sans erreur de la page. Par mécanique, ce que la scène montre :
//   portes et interrupteurs : le mur de la porte disparaît de la scène quand l'interrupteur est franchi, revient au checkpoint, et le pont apparaît ;
//   véhicules : la suite des véhicules de la voiture affichée ; ressorts : trois sauts de voie ; tours : deux passages de ligne ; ambiance : nuit d'auteur ;
//   environnements : la course se finit sous la pluie, le givre et les rafales.
// Playwright absent : test ignoré en local, ÉCHEC en CI (comme tools/test-browser.mjs).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
let chromium;
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9950 + Math.floor(Math.random() * 40);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.locator('#wl-name').fill('Essai');
await page.locator('#wl-submit').evaluate((el) => el.click());
await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
await page.waitForTimeout(900);
await page.evaluate(() => window.copytrack.ui.closeModal());
const poll = { timeout: 40000, polling: 100 };

// Lance le circuit `id` depuis la carrière, attend la fin du décompte, puis le fait courir par le pilote automatique, image par image (1/60 s), rendu toutes les 30 images.
// Renvoie l'arrivée et ce qu'on a vu en route.
async function race(id) {
  const i = await page.evaluate((id) => window.copytrack.builtins.findIndex((b) => b.def.id === id), id);
  assert.ok(i >= 72, id + ' : un circuit ajouté (rang ' + i + ')');
  await page.evaluate((i) => window.copytrack.playBuiltin(i), i);
  await page.waitForFunction(() => { const S = window.copytrack.session; return window.copytrack.mode === 'race' && S && !S.demo && S.state === 'racing'; }, null, poll);
  return page.evaluate(async () => {
    const { Autopilot } = await import('/js/autopilot.js');
    const A = window.copytrack, S = A.session, real = S.update.bind(S);
    S.update = () => {};                                   // la boucle du jeu n'avance plus la course : on l'avance ici
    const bot = new Autopilot(S.track.path, { ...(S.track.path.pilot || {}) });
    bot.reset(S.phys);
    let lastR = S.logic.respawn;
    A.input.drive = () => bot.control(S.phys);
    const seen = { vehicles: [], springs: 0, laps: 0, respawns: 0, groups: {}, frames: 0, ambiance: { ...S.track.ambiance }, rain: S.track.rain, frost: S.track.frost, gust: S.track.gust };
    const springTiles = new Set();
    const groupVis = () => { const v = {}; for (const c of S.view.group.children) if (c.userData.g) v[c.userData.g] = c.visible; return v; };
    for (let f = 0; f < 60 * 150 && S.state !== 'finished'; f++) {
      const lap0 = S.logic.lap;
      real(1 / 60);
      seen.frames++;
      if (S.logic.respawn !== lastR) { lastR = S.logic.respawn; bot.reset(S.phys); }
      if (S.logic.lap !== lap0) seen.laps++;
      const veh = S.phys.vehicle; if (seen.vehicles[seen.vehicles.length - 1] !== veh) seen.vehicles.push(veh);
      const st = S.phys.surfTile; if (st && st.s === 'spring' && !springTiles.has(st)) { springTiles.add(st); seen.springs++; }      // (un évènement de ressort ne dure qu'un pas : on compte les dalles prises)
      for (const [g, v] of Object.entries(groupVis())) { const l = (seen.groups[g] = seen.groups[g] || []); if (l[l.length - 1] !== v) l.push(v); }
      if (f % 30 === 0) A.renderer.render(A.scene, A.camera);
    }
    A.renderer.render(A.scene, A.camera);
    return { state: S.state, time: S.logic.time, finished: S.logic.finished, ...seen };
  });
}
const back = () => page.evaluate(() => { window.copytrack.quitRace ? window.copytrack.quitRace() : window.copytrack.showMenu(); });
const golden = JSON.parse((await import('node:fs')).readFileSync(new URL('./golden-temps.json', import.meta.url), 'utf8'));
const finished = (R, id) => {
  assert.equal(R.state, 'finished', id + ' : ' + JSON.stringify(R).slice(0, 300));
  assert.ok(R.finished && R.time > 0);
  assert.ok(Math.abs(R.time - golden[id]) / golden[id] < 0.1, `${id} : ${R.time.toFixed(2)} s dans la page, ${golden[id]} s pour le pilote sous Node`);
};
const pageTest = (name, fn) => test(name, async () => {
  const before = errors.length;
  try { await fn(); } finally { await back().catch(() => {}); }
  const pe = errors.slice(before);
  if (pe.length) throw new Error('erreurs de la page : ' + pe.join(' | '));
});

console.log('Chapitre 13 · Les Éléments');
await pageTest('Clair de Lune (ambiance d’auteur, déclencheurs) : nuit brumeuse, finie', async () => {
  const R = await race('clairdelune'); finished(R, 'clairdelune');
  assert.deepEqual([R.ambiance.sky, R.ambiance.fog], ['night', 'misty']);
});
await pageTest('Manège (trois tours) : deux passages de ligne, fini', async () => {
  const R = await race('manege'); finished(R, 'manege');
  assert.equal(R.laps, 2);
});
await pageTest('Averse (pluie) : finie sous la pluie', async () => { const R = await race('averse'); finished(R, 'averse'); assert.ok(R.rain > 0); });
await pageTest('Bourrasques (vent et rafales) : finie', async () => { const R = await race('bourrasques'); finished(R, 'bourrasques'); assert.ok(R.gust > 0); });
await pageTest('Nuit de Givre (givre) : finie', async () => { const R = await race('givre'); finished(R, 'givre'); assert.ok(R.frost > 0); });
await pageTest('Ressorts (ressort latéral et gravité) : trois sauts de voie, fini', async () => { const R = await race('ressorts'); finished(R, 'ressorts'); assert.equal(R.springs, 3); });

console.log('Chapitre 14 · Grandes Manœuvres');
await pageTest('Balade à Moto : voiture, moto, voiture ; finie', async () => { const R = await race('balade'); finished(R, 'balade'); assert.deepEqual(R.vehicles, ['car', 'moto', 'car']); });
await pageTest('Interrupteurs (logique) : dans la scène, la porte 2 s’ouvre puis se referme, la porte 4 s’ouvre, le pont 5 apparaît ; fini', async () => {
  const R = await race('interrupteurs'); finished(R, 'interrupteurs');
  assert.deepEqual(R.groups['2'], [true, false, true], 'porte 2 : fermée, ouverte par l’interrupteur, refermée au checkpoint');
  assert.deepEqual(R.groups['4'], [true, false], 'porte 4 : ouverte par le second interrupteur');
  assert.deepEqual(R.groups['5'], [false, true], 'pont : caché au départ, montré');
});
await pageTest('Plateaux Mobiles (ascenseurs, glissières) : fini', async () => { const R = await race('plateaux'); finished(R, 'plateaux'); });
await pageTest('Relais : moto, voiture, bateau, voiture, deltaplane ; fini en deltaplane', async () => { const R = await race('relais'); finished(R, 'relais'); assert.deepEqual(R.vehicles, ['car', 'moto', 'car', 'boat', 'car', 'glider']); });
await pageTest('Aiguillage : le pilote prend l’eau en bateau, finit en voiture', async () => { const R = await race('aiguillage'); finished(R, 'aiguillage'); assert.deepEqual(R.vehicles, ['car', 'boat', 'car']); });
await pageTest('Grande Finale : pluie, moto, pièces mobiles, porte et pont ; finie', async () => {
  const R = await race('finale'); finished(R, 'finale');
  assert.deepEqual(R.vehicles, ['car', 'moto', 'car']);
  assert.deepEqual(R.groups['2'], [true, false, true]); assert.deepEqual(R.groups['5'], [false, true]);
});

await ctx.close();
await browser.close();
server.kill();
await finish('Les douze circuits des chapitres bonus se lancent, se jouent et se finissent dans le navigateur.');
