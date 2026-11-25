// Recette C : sessions longues. node tools/recette/longue.mjs [partie]   partie = circuits | masque | tout (défaut)
//  - circuits : 12 circuits × 2 courses (arrivée par le pilote automatique, puis « Rejouer »), retours au menu et au garage entre les circuits ; mesure à chaque étape :
//    enfants de la scène, DOM, mémoire de three.js (géométries, textures), tas JavaScript, nombre d'écouteurs d'événements de document.
//  - masque : une course de 10 minutes dont l'onglet est masqué (vraie visibilité « hidden » : une seconde page prend le premier plan), puis ré-affiché.
// Constate seulement ; rien n'est corrigé.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, OUT, OFFLINE, sleep, startServer } from './lib.mjs';

const part = process.argv[2] || 'tout';
const port = 9900 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
const ev = (fn, arg) => page.evaluate(fn, arg);
const out = { circuits: [], masque: null, errors };

const measure = (label) => ev(async (label) => {
  const A = window.copytrack;
  let objs = 0; A.scene.traverse(() => { objs++; });
  if (window.gc) window.gc();
  const mem = performance.memory ? performance.memory.usedJSHeapSize : null;
  return { label, sceneChildren: A.scene.children.length, sceneObjects: objs, dom: document.querySelectorAll('*').length, geometries: A.renderer.info.memory.geometries, textures: A.renderer.info.memory.textures, programs: A.renderer.info.programs ? A.renderer.info.programs.length : null, heapMB: mem ? +(mem / 1048576).toFixed(1) : null, mode: A.mode };
}, label);

async function boot() {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Longue');
  await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 90000, polling: 100 });
  await ev(async () => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); const { profile, saveProfile } = await import('/js/profile.js'); profile().eggs = { ...(profile().eggs || {}), unlockAll: true }; saveProfile(); });
  await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 3000, polling: 50 }).catch(() => {});
  await ev(() => window.copytrack.ui.closeModal());
}
const botFinish = (maxCalls = 4000) => ev(async (maxCalls) => {
  const A = window.copytrack, S = A.session;
  const { Autopilot } = await import('/js/autopilot.js');
  const bot = new Autopilot(S.track.path, { latLimit: 56 * 0.8 });
  bot.reset(S.phys);
  const real = A.input.drive;
  A.input.drive = () => { if (S.state !== 'racing') return { steer: 0, throttle: false, brake: false, drift: false }; const c = bot.control(S.phys); return { steer: c.steer, throttle: !!c.throttle, brake: !!c.brake, drift: false }; };
  let calls = 0;
  while (S.state !== 'finished' && calls < maxCalls && A.session === S) { S.update(0.1); calls++; if (calls % 40 === 0) await new Promise((r) => setTimeout(r, 0)); }
  A.input.drive = real;
  return { state: S.state, calls, time: S.logic && +S.logic.time.toFixed(2) };
}, maxCalls);
const waitRacing = () => page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 90000, polling: 100 });
const waitFinish = () => page.waitForFunction(() => !document.getElementById('finish').classList.contains('hidden'), null, { timeout: 40000, polling: 100 });

try {
  await boot();
  if (part === 'circuits' || part === 'tout') {
    out.start = await measure('menu au départ');
    console.log(JSON.stringify(out.start));
    const picks = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66];
    let k = 0;
    for (const idx of picks) {
      const e0 = errors.length, row = { idx, name: await ev((i) => window.copytrack.builtins[i].def.name, idx), runs: [] };
      for (let run = 1; run <= 2; run++) {
        if (run === 1) await ev((i) => window.copytrack.playBuiltin(i), idx);
        else await page.locator('#finish [data-action="restart"]').first().evaluate((b) => b.click());
        await waitRacing(); await sleep(200);
        const r = await botFinish();
        await waitFinish().catch(() => { r.noFinishScreen = true; });
        await sleep(600);
        row.runs.push(r);
      }
      row.after = await measure(`après ${row.name} ×2`);
      // retour : menu une fois sur deux, garage l'autre
      if (k % 2 === 0) { await ev(() => window.copytrack.quitRace()); await page.waitForFunction(() => window.copytrack.mode === 'menu', null, { timeout: 20000 }); await ev(() => window.copytrack.showMenu('menu')); }
      else {
        await ev(() => window.copytrack.quitRace()); await page.waitForFunction(() => window.copytrack.mode === 'menu', null, { timeout: 20000 });
        await ev(() => window.copytrack.openGarage()); await page.waitForFunction(() => window.copytrack.mode === 'garage', null, { timeout: 20000 }); await sleep(800);
        row.garage = await measure('garage');
        await ev(() => window.copytrack.showMenu('menu'));
      }
      await sleep(300);
      row.menu = await measure(`menu après ${row.name}`);
      row.errors = errors.slice(e0);
      out.circuits.push(row);
      console.log(`${row.name} : ${JSON.stringify(row.runs)} scène ${row.after.sceneObjects} dom ${row.menu.dom} géo ${row.menu.geometries} tex ${row.menu.textures} tas ${row.menu.heapMB} Mo${row.errors.length ? ' ERREURS ' + row.errors.join(' | ') : ''}`);
      k++;
      writeFileSync(join(OUT, `longue-${part}.json`), JSON.stringify(out, null, 1));
    }
    out.end = await measure('menu à la fin');
    console.log('FIN', JSON.stringify(out.end));
  }
  if (part === 'echant') {
    // Course continue (visible) échantillonnée toutes les 30 s : la mémoire graphique (géométries, programmes), la scène et le DOM se stabilisent-ils ?
    await ev(() => window.copytrack.showMenu('menu'));
    await ev(() => window.copytrack.playBuiltin(0));
    await waitRacing();
    await page.keyboard.down('ArrowUp');
    const minutes = +(process.env.MASQUE_MIN || 8);
    out.serie = [];
    for (let t = 0; t <= minutes * 2; t++) {
      const m = await measure('t=' + (t * 30) + ' s');
      m.state = await ev(() => ({ s: window.copytrack.session.state, steps: window.copytrack.session.logic.steps, resp: window.copytrack.session.respawns || null }));
      out.serie.push(m); console.log(JSON.stringify(m));
      await sleep(30000);
    }
    await page.keyboard.up('ArrowUp');
  }
  if (part === 'gele') {
    // Onglet masqué comme un navigateur le fait : visibilité « hidden » (événement visibilitychange, comme à l'arrière-plan), puis page GELÉE (Page.setWebLifecycleState)
    // pendant N minutes (minuteries et images arrêtées), puis dégel et retour à « visible ». Chromium sans écran ne masque jamais une page : la visibilité est simulée
    // par le document (même événement que celui que le jeu écoute), le gel est le vrai gel du navigateur.
    await ev(() => window.copytrack.showMenu('menu'));
    await ev(() => window.copytrack.playBuiltin(0));
    await waitRacing();
    await page.keyboard.down('ArrowUp'); await sleep(2500);
    const before = await measure('avant masquage');
    const s0 = await ev(() => ({ steps: window.copytrack.session.logic.steps, state: window.copytrack.session.state, time: window.copytrack.session.logic.time, wall: Date.now() }));
    out.masque = { mode: 'visibilité simulée + gel du navigateur', avant: before, s0 };
    await ev(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(800);
    out.masque.pausedByHide = await ev(() => ({ state: window.copytrack.session.state, pauseShown: !document.getElementById('pause').classList.contains('hidden') }));
    console.log('après visibilitychange(hidden) :', JSON.stringify(out.masque.pausedByHide));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    const minutes = +(process.env.MASQUE_MIN || 10);
    console.log(`page gelée ${minutes} min…`);
    await sleep(minutes * 60000);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await sleep(1500);
    await ev(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(2500);
    out.masque.apres = await measure('après dégel');
    out.masque.s1 = await ev((w0) => ({ steps: window.copytrack.session.logic.steps, state: window.copytrack.session.state, time: window.copytrack.session.logic.time, wallElapsedMin: +((Date.now() - w0) / 60000).toFixed(1), pauseShown: !document.getElementById('pause').classList.contains('hidden') }), s0.wall);
    await page.keyboard.up('ArrowUp');
    console.log('GELE', JSON.stringify(out.masque));
    await page.screenshot({ path: join(OUT, 'longue-apres-gel.png') });
    if (out.masque.s1.state === 'paused') { await page.locator('#pause [data-action="resume"]').evaluate((b) => b.click()); await sleep(500); }
    await page.keyboard.down('ArrowUp'); await sleep(3000); await page.keyboard.up('ArrowUp');
    out.masque.reprise = await ev(() => ({ state: window.copytrack.session.state, steps: window.copytrack.session.logic.steps, time: window.copytrack.session.logic.time, speed: window.copytrack.session.phys.fwdSpeed }));
    console.log('REPRISE', JSON.stringify(out.masque.reprise));
  }
  if (part === 'masque' || part === 'tout') {
    // Une vraie course commencée, puis l'onglet passe en arrière-plan 10 minutes.
    await ev(() => window.copytrack.showMenu('menu'));
    await ev(() => window.copytrack.playBuiltin(0));
    await waitRacing();
    await page.keyboard.down('ArrowUp'); await sleep(2500);
    const before = await measure('avant masquage');
    const s0 = await ev(() => ({ steps: window.copytrack.session.logic.steps, state: window.copytrack.session.state, vis: document.visibilityState }));
    const page2 = await ctx.newPage();
    await page2.goto('about:blank'); await page2.bringToFront();
    await sleep(1500);
    const vis = await page.evaluate(() => document.visibilityState);
    out.masque = { visibiliteReelle: vis, avant: before, s0 };
    console.log('visibilité de la page 1 après bringToFront(page 2) :', vis);
    const minutes = +(process.env.MASQUE_MIN || 10);
    const t0 = Date.now(); let ticks = 0;
    while (Date.now() - t0 < minutes * 60000) { await sleep(30000); ticks++; if (ticks % 4 === 0) { try { const s = await page.evaluate(() => ({ steps: window.copytrack.session && window.copytrack.session.logic.steps, state: window.copytrack.session && window.copytrack.session.state, dom: document.querySelectorAll('*').length, h: document.visibilityState })); console.log(`  ${((Date.now() - t0) / 60000).toFixed(1)} min :`, JSON.stringify(s)); } catch (e) { console.log('  page 1 injoignable :', e.message.split('\n')[0]); } } }
    await page.bringToFront(); await page2.close();
    await sleep(2500);
    out.masque.apres = await measure('après ré-affichage');
    out.masque.s1 = await ev(() => ({ steps: window.copytrack.session.logic.steps, state: window.copytrack.session.state, vis: document.visibilityState, pauseShown: !document.getElementById('pause').classList.contains('hidden') }));
    await page.keyboard.up('ArrowUp');
    console.log('MASQUE', JSON.stringify(out.masque));
    // La course reprend-elle ? Reprendre puis rouler 3 s.
    await page.screenshot({ path: join(OUT, 'longue-apres-masque.png') });
    if (out.masque.s1.state === 'paused') { await page.locator('#pause [data-action="resume"]').evaluate((b) => b.click()); await sleep(500); }
    await page.keyboard.down('ArrowUp'); await sleep(3000); await page.keyboard.up('ArrowUp');
    out.masque.reprise = await ev(() => ({ state: window.copytrack.session.state, steps: window.copytrack.session.logic.steps, speed: window.copytrack.session.phys.fwdSpeed }));
    console.log('REPRISE', JSON.stringify(out.masque.reprise));
  }
} catch (e) {
  console.log('SESSION INTERROMPUE :', e.stack || e.message);
  out.interrupted = String(e.message);
} finally {
  out.errors = errors;
  writeFileSync(join(OUT, `longue-${part}.json`), JSON.stringify(out, null, 1));
  console.log('erreurs de la page :', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close(); server.kill();
}
