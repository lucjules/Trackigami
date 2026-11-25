// Recette : écrans d'erreur et hors ligne. node tools/recette/horsligne.mjs <fr|en> [kb|land|port]
//  1. service worker réel : une première visite, puis le réseau est coupé (setOffline) et la page rechargée : le jeu démarre-t-il, mène-t-il à une course ?
//  2. navigateur sans WebGL 2 : message de l'écran de chargement (langue comprise) ;
//  3. un module du jeu qui ne se charge pas : que voit le joueur ?
//  4. réseau coupé en cours de jeu (setOffline) : communauté, classement d'une fiche.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, OUT, OFFLINE, sleep, startServer, auditPage, VIEWPORTS } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'kb';       // kb (défaut) | land | port : téléphone simulé, écran et événements tactiles
const tag = input === 'kb' ? '' : '-' + input;
const port = 9500 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const base = `http://127.0.0.1:${port}/`;
const res = [], errors = [];
const note = (id, ok, detail) => { res.push({ id, ok, detail }); console.log(`${ok ? 'ok     ' : 'CONSTAT '} ${id} — ${detail}`); writeFileSync(join(OUT, `horsligne-${lang}${tag}.json`), JSON.stringify({ res, errors }, null, 1)); };
const newCtx = (extra = {}) => browser.newContext({ locale: lang === 'en' ? 'en-US' : 'fr-FR', viewport: input === 'kb' ? { width: 1100, height: 650 } : VIEWPORTS[input], hasTouch: input !== 'kb', isMobile: input !== 'kb', deviceScaleFactor: 1, ...extra });
const hook = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ` + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push(`${tag} console: ` + m.text()); });
  return p;
};
const shot = (p, n) => p.screenshot({ path: join(OUT, `horsligne-${lang}${tag}-${n}.png`) });
const fonts = (p) => p.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());

try {
  // ---------------------------------------------------------------------------------------------------- 1. service worker réel, puis hors ligne
  {
    const c = await newCtx({ serviceWorkers: 'allow' });
    const p = hook(await c.newPage(), 'sw'); await fonts(p);
    await p.goto(base, { waitUntil: 'load' });
    if (lang === 'en') await p.locator('#welcome [data-lang="en"]').evaluate((b) => b.click()).catch(() => {});
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== undefined, null, { timeout: 20000 }).catch(() => {});
    const reg = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await new Promise((x) => setTimeout(x, 6000)); const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length; return { active: !!(r && r.active), caches: keys.length, entries: n }; });
    note('hors ligne : service worker installé et cache rempli', reg.active && reg.entries > 20, JSON.stringify(reg));
    await c.setOffline(true);
    await p.reload({ waitUntil: 'load' }).catch((e) => note('hors ligne : rechargement', false, e.message.split('\n')[0]));
    await sleep(2500);
    const welcome = await p.locator('#welcome').isVisible().catch(() => false);
    note('hors ligne : la page de bienvenue s’affiche après rechargement sans réseau', welcome, welcome ? 'oui' : 'non : ' + (await p.evaluate(() => document.body.innerText.slice(0, 200)).catch(() => '?')));
    if (welcome) {
      await p.locator('#wl-name').fill('Hors'); await p.locator('#wl-submit').evaluate((el) => el.click());
      await p.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 }).catch(() => {});
      const mode = await p.evaluate(() => window.copytrack && window.copytrack.mode);
      note('hors ligne : menu atteint', mode === 'menu', 'mode ' + mode);
      await p.evaluate(() => { const a = window.copytrack; a.settings.tutorialDone = true; a.settings.telemetry = false; a.saveSettings(); a.ui.closeModal(); a.quality.apply('ultrapotato'); });
      await sleep(1800); await p.evaluate(() => window.copytrack.ui.closeModal());       // (le tutoriel s'ouvre 700 ms après le démarrage et met une course en pause : TECH-017)
      await p.evaluate(() => window.copytrack.playBuiltin(0));
      const racing = await p.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 60000 }).then(() => true).catch(() => false);
      note('hors ligne : une course démarre', racing, racing ? 'oui' : 'non');
      await p.evaluate(() => window.copytrack.quitRace()); await sleep(800);
      // communauté et classement sans réseau
      await p.evaluate(() => window.copytrack.showMenu('community')); await sleep(3000);
      let a = await auditPage(p, { lang, touch: false });
      note('hors ligne : écran communauté', !a.covered.length && !a.french.length && !a.bad.length, `texte : « ${a.text.slice(0, 200)} » ; recouvert ${a.covered.length}, non traduit ${a.french.length}`);
      await shot(p, 'communaute');
      await p.evaluate(() => window.copytrack.showMenu('menu')); await p.evaluate(() => { const A = window.copytrack; A.showMenu('tracks'); A.openBuiltinHub(1, 'tracks'); }); await sleep(3500);
      a = await auditPage(p, { lang, touch: false });
      const board = await p.evaluate(() => document.getElementById('hub-board').textContent.replace(/\s+/g, ' ').trim().slice(0, 200));
      note('hors ligne : fiche, classement', !a.covered.length && !a.french.length, `classement : « ${board} »`);
      await shot(p, 'fiche');
    }
    await c.close();
  }
  // ---------------------------------------------------------------------------------------------------- 2. sans WebGL 2
  {
    const c = await newCtx({ serviceWorkers: 'block' });
    await c.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { if (/webgl/i.test(t)) return null; return orig.call(this, t, ...r); }; });
    const p = hook(await c.newPage(), 'nogl'); await fonts(p);
    await p.goto(base, { waitUntil: 'load' }); await sleep(2500);
    const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
    const a = await auditPage(p, { lang, touch: false });
    note('sans WebGL 2 : message', /webgl/i.test(txt), `texte : « ${txt.slice(0, 260)} » ; non traduit : ${JSON.stringify(a.french.slice(0, 3))}`);
    await shot(p, 'sans-webgl');
    await c.close();
  }
  // ---------------------------------------------------------------------------------------------------- 3. un module qui ne se charge pas
  {
    const c = await newCtx({ serviceWorkers: 'block' });
    const p = hook(await c.newPage(), 'mod'); await fonts(p);
    await p.route('**/js/trackMesh.js', (r) => r.abort());
    await p.goto(base, { waitUntil: 'load' }); await sleep(4000);
    const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
    note('module du jeu injoignable : ce que voit le joueur', txt.length > 20, `texte : « ${txt.slice(0, 300)} »`);
    await shot(p, 'module-bloque');
    await c.close();
  }
  // ---------------------------------------------------------------------------------------------------- 4. réseau coupé en cours de jeu
  {
    const c = await newCtx({ serviceWorkers: 'block' });
    const p = hook(await c.newPage(), 'cut'); await fonts(p);
    await p.goto(base, { waitUntil: 'load' });
    if (lang === 'en') await p.locator('#welcome [data-lang="en"]').evaluate((b) => b.click());
    await p.locator('#wl-name').fill('Coupe'); await p.locator('#wl-submit').evaluate((el) => el.click());
    await p.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
    await p.evaluate(() => { const a = window.copytrack; a.settings.tutorialDone = true; a.settings.telemetry = false; a.saveSettings(); a.ui.closeModal(); a.quality.apply('ultrapotato'); });
    await sleep(1800); await p.evaluate(() => window.copytrack.ui.closeModal());
    await c.setOffline(true);
    await p.evaluate(() => window.copytrack.showMenu('community')); await sleep(3500);
    const a = await auditPage(p, { lang, touch: false });
    note('réseau coupé : communauté', !a.french.length && !a.bad.length, `texte : « ${a.text.slice(0, 220)} »`);
    await shot(p, 'coupe-communaute');
    await p.evaluate(() => { const A = window.copytrack; A.showMenu('menu'); A.multiMenu(); }); await sleep(1200);
    const m = await p.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-body').textContent.replace(/\s+/g, ' ').slice(0, 260) : 'aucune fenêtre'));
    note('réseau coupé : salons', true, `fenêtre : « ${m} »`);
    await shot(p, 'coupe-salons');
    await c.close();
  }
} catch (e) {
  console.log('INTERROMPU :', e.stack || e.message);
  note('INTERROMPU', false, String(e.message).slice(0, 300));
} finally {
  writeFileSync(join(OUT, `horsligne-${lang}${tag}.json`), JSON.stringify({ res, errors }, null, 1));
  console.log('erreurs de la page :', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close(); server.kill();
}
