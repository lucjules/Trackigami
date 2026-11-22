// Éditeur dans un vrai navigateur (Chromium) : node tools/test-browser-editeur.mjs   (npm run test:browser)
// Phase 1 après l'audit 0.9.59 : touche P (Prolonger) pour dérouler une route, pastille et fenêtre des problèmes (raccord impossible),
// annuler / rétablir (Ctrl+Z) avec la sélection de zone, fenêtre lisible sur un petit écran. Playwright absent : test ignoré (REQUIRE_BROWSER / CI : échec).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { verifyPublish } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
let chromium;
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9800 + Math.floor(Math.random() * 150);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
const shots = process.env.PW_SHOTS; if (shots) mkdirSync(shots, { recursive: true });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); } catch (e) { server.kill(); skip('Chromium introuvable'); }
let failures = 0, n = 0;
const errors = [];
async function test(name, fn) { n++; try { await fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 7).join('\n       ')); } }

async function open(w, h) {
  const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await new Promise((r) => setTimeout(r, 500));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Ed'); await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.settings.edGuided = false; A.saveSettings(); A.ui.closeModal(); });
  await page.waitForTimeout(700); await page.evaluate(() => window.copytrack.ui.closeModal());
  await page.evaluate(async () => {
    const { scriptTrack } = await import('/js/track.js');
    await window.copytrack.openEditor({ code: scriptTrack('Essai', 'start', { l: 8 }).encode(), name: 'Essai' });
  });
  await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor', null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.ui.closeModal(); A.settings.tutorialDone = true; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const ed = window.copytrack.session; ed.setTab && ed.setTab('pieces'); ed.setTool('straight'); });
  return { ctx, page };
}
const ed = (page, fn, arg) => page.evaluate(fn, arg);
// Une touche = une pose : on attend que la pose soit faite avant la suivante (le rendu logiciel est lent : deux appuis dans la même image n'en feraient qu'un).
const press = async (page, key, n = 1) => {
  for (let i = 0; i < n; i++) {
    const before = await page.evaluate(() => window.copytrack.session.track.tiles.length);
    await page.keyboard.press(key);
    await page.waitForFunction((b) => window.copytrack.session.track.tiles.length !== b, before, { timeout: 8000, polling: 50 });
  }
};

try {
  await test('touche P (Prolonger) : une route se déroule sans viser les cases : ligne, virage, pente, mur (orientation reprise) ; chaque pièce est raccordée', async () => {
    const { ctx, page } = await open(1280, 720);
    const seq = [['straight', 3], ['curve', 1], ['straight', 1], ['cro1', 1], ['straight', 1], ['tr01s', 1], ['straight', 2], ['curve', 1], ['tr10s', 1], ['straight', 1]];
    for (const [t, k] of seq) { await ed(page, (t) => window.copytrack.session.setTool(t), t); await press(page, 'KeyP', k); }
    const r = await ed(page, async () => { const E = window.copytrack.session; const { checkTrack } = await import('/js/editorTools.js'); const { continuityIssues } = await import('/js/continuity.js'); return { n: E.track.tiles.length, types: E.track.tiles.map((t) => t.t + (t.o ? '/o' + t.o : '')), free: checkTrack(E.track).filter((i) => /extrémité/.test(i.msg) && i.level === 'error').length, bad: continuityIssues(E.track).filter((i) => i.level !== 'info').map((i) => i.code) }; });
    assert.equal(r.n, 1 + 3 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 + 1, r.types.join(' '));
    assert.ok(r.types.includes('straight/o1') && r.types.includes('curve/o1'), 'la route sur le mur garde son orientation : ' + r.types.join(' '));
    assert.deepEqual(r.bad, [], 'aucun défaut de continuité');
    assert.equal(r.free, 1, 'une seule extrémité libre : le bout de la route');
    await ctx.close();
  });
  await test('raccord impossible (route à l\'endroit contre une route au plafond) : la pastille devient ⛔, la fenêtre dit où / pourquoi / conséquence / remède', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, (t) => window.copytrack.session.setTool(t), 'straight'); await press(page, 'KeyP', 3);
    // (phase 2 : la vrille sans « Inversion de gravité » n\'est plus une erreur, la gravité suit la route : on fabrique un vrai défaut, une route posée à l\'envers face à une route à l\'endroit)
    await ed(page, async () => { const E = window.copytrack.session; const { Track } = await import('/js/track.js'); const last = E.track.tiles[E.track.tiles.length - 1]; E.track.add(Track.normalize({ t: 'straight', x: last.x, z: last.z - 1, l: last.l, r: last.r, v: 1 })); E._changed(); });
    await page.waitForTimeout(300);
    const badge = await page.locator('#ed-warn').textContent();
    assert.match(badge, /⛔/, 'pastille : ' + badge);
    await page.locator('#ed-warn').evaluate((el) => el.click());
    await page.waitForSelector('.ed-issue.error', { timeout: 5000 });
    assert.ok(!/reliée à rien/.test(await page.locator('.ed-issue.error').first().innerText()), 'une extrémité libre n\'est pas une erreur bloquante');
    if (shots) await page.screenshot({ path: join(shots, 'editeur-problemes.png') });
    const txt = await page.locator('.ed-issue.error').first().innerText();
    assert.match(txt, /Où \/ pourquoi/); assert.match(txt, /Conséquence/); assert.match(txt, /Comment corriger/);
    assert.equal(await page.locator('.ed-issue.error button.primary').count(), 0, 'plus de correction en un clic : la règle « invert » n\'existe plus');
    await ctx.close();
  });
  await test('orientations 3D (phase 3) : huit pastilles d\'orientation ; une orientation armée qui n\'est pas celle de la route insère les transitions et pose la pièce, en un seul pas d\'annulation ; la pastille de la barre reste sans erreur', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, (t) => window.copytrack.session.setTool(t), 'straight'); await press(page, 'KeyP', 2);
    const chips = await page.evaluate(() => [...document.querySelectorAll('.chip[data-flag="o"]')].map((b) => b.textContent));
    assert.equal(chips.length, 7, 'orientation : ' + chips.join(' | '));      // (+ « Plafond », qui est le drapeau v : 8 orientations en tout)
    assert.ok(await page.evaluate(() => !!document.querySelector('.chip[data-flag="v"]')));
    const before = await ed(page, () => window.copytrack.session.track.tiles.length);
    await ed(page, () => window.copytrack.session._optClick('o', 3));
    await press(page, 'KeyP', 1);
    const r = await ed(page, () => window.copytrack.session.track.tiles.map((t) => t.t + (t.o ? '/o' + t.o : '')));
    assert.equal(r.length, before + 2, r.join(' '));
    assert.deepEqual(r.slice(-2), ['tr04s', 'straight/o3']);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    assert.equal(await ed(page, () => window.copytrack.session.track.tiles.length), before, 'annuler retire la transition ET la pièce');
    await ctx.close();
  });
  await test('sélection de zone : supprimer puis Ctrl+Z redonne les pièces ET le rectangle (avant : le rectangle restait tel quel) ; la barre de sélection suit', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, (t) => window.copytrack.session.setTool(t), 'straight'); await press(page, 'KeyP', 5);
    await ed(page, () => { const E = window.copytrack.session; E.setTool('select'); E.sel = { x0: 0, z0: -4, x1: 0, z1: -2 }; E._noteSel(); E._refreshSelBar(); });
    const before = await ed(page, () => window.copytrack.session.track.tiles.length);
    await ed(page, () => window.copytrack.session.deleteSel());
    assert.equal(await ed(page, () => window.copytrack.session.track.tiles.length), before - 3);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    const r = await ed(page, () => { const E = window.copytrack.session; return { n: E.track.tiles.length, sel: E.sel, bar: !document.getElementById('ed-selbar').classList.contains('hidden') }; });
    assert.equal(r.n, before); assert.deepEqual(r.sel, { x0: 0, z0: -4, x1: 0, z1: -2 }); assert.equal(r.bar, true, 'la barre de sélection est affichée');
    await ctx.close();
  });
  await test('petit écran (640 × 360) : la fenêtre des problèmes reste dans l\'écran, défile, et son bouton « Fermer » est atteignable', async () => {
    const { ctx, page } = await open(640, 360);
    for (const [t, k] of [['straight', 2], ['twist', 1], ['straight', 1]]) { await ed(page, (t) => window.copytrack.session.setTool(t), t); await press(page, 'KeyP', k); }
    await page.waitForTimeout(300);
    await page.locator('#ed-warn').evaluate((el) => el.click());
    await page.waitForSelector('.ed-issue', { timeout: 5000 });
    const r = await page.evaluate(() => { const p = document.querySelector('#modal .modal-panel').getBoundingClientRect(), b = [...document.querySelectorAll('#modal-actions button')].map((x) => x.getBoundingClientRect()); return { top: p.top, bottom: p.bottom, h: window.innerHeight, w: window.innerWidth, left: p.left, right: p.right, btn: b.map((x) => [x.top, x.bottom]) }; });
    assert.ok(r.top >= -1 && r.bottom <= r.h + 1 && r.left >= -1 && r.right <= r.w + 1, JSON.stringify(r));
    assert.ok(r.btn.every(([t, b]) => t >= 0 && b <= r.h + 1), 'bouton Fermer à l\'écran : ' + JSON.stringify(r.btn));
    await ctx.close();
  });
  await test('un circuit correct : la pastille ne montre que des conseils (ℹ), jamais ⛔ ni ⚠', async () => {
    const { ctx, page } = await open(1280, 720);
    for (const [t, k] of [['straight', 3], ['loop', 1], ['straight', 2], ['curve', 1], ['straight', 1], ['finish', 1]]) { await ed(page, (t) => window.copytrack.session.setTool(t), t); await press(page, 'KeyP', k); }
    await page.waitForTimeout(300);
    const badge = (await page.locator('#ed-warn').textContent()) || '';
    assert.ok(!/⛔|⚠/.test(badge), 'pastille : « ' + badge + ' »');
    await ctx.close();
  });
  // 0.12.0 : nouveau rangement, avec de vrais clics et de vrais glissés de souris.
  await test('rangement 0.12 : le rail change d’outil et de panneau ; une famille et ses réglages ; « Remplir » propre à l’outil ; la recherche trouve « route large · montée »', async () => {
    const { ctx, page } = await open(1366, 768);
    const state = () => ed(page, () => { const E = window.copytrack.session; const vis = (id) => !document.querySelector(`#ed-palette [data-panel="${id}"]`).hidden; return { tool: E.tool, panels: ['pieces', 'paint', 'decos', 'select', 'inspect', 'erase'].filter(vis) }; });
    await page.click('#ed-tools [data-tool="paint"]');
    assert.deepEqual((await state()).panels, ['paint']);
    await page.click('#ed-tools [data-tool="decos"]');
    assert.match((await state()).tool, /^deco:/);
    await page.click('#ed-tools [data-tool="pieces"]');
    await page.click('#ed-palette .lib-tile[data-fam="turn"]');
    assert.equal((await state()).tool, 'curve');
    await page.selectOption('#ed-pset-traits select[aria-label="Virage : Largeur"]', 'w');
    assert.equal((await state()).tool, 'wbigcurve', 'virage large : le serré n’existe pas, on passe au grand');
    await page.click('#ed-palette [data-panel="pieces"] [data-seg="fill"]');
    assert.equal((await state()).tool, 'fill-piece:wbigcurve');
    await page.click('#ed-tools [data-tool="paint"]');
    assert.ok(!(await state()).tool.startsWith('fill-'), 'la peinture garde son propre interrupteur');
    await page.click('#ed-tools [data-tool="pieces"]');
    await page.click('#ed-palette [data-panel="pieces"] [data-seg="place"]');
    await page.fill('#ed-search', 'route large montée');
    const hits = await page.evaluate(() => [...document.querySelectorAll('#ed-results .lib-tile')].map((b) => b.dataset.piece));
    assert.deepEqual(hits, ['wslU05', 'wslU1', 'wslU2', 'wslU4']);
    await page.click('#ed-results .lib-tile[data-piece="wslU2"]');
    assert.equal((await state()).tool, 'wslU2');
    await ctx.close();
  });
  await test('rangement 0.12 : sélection tracée à la souris, barre flottante entre le panneau et la Vue, la zone se déplace en la glissant (un seul Ctrl+Z)', async () => {
    const { ctx, page } = await open(1366, 768);
    await ed(page, () => { const E = window.copytrack.session; E.pitch = 1.5; E.dist = 260; E.target.set(16, E.levelY(), -48); E.setMode('select'); });
    await page.waitForTimeout(400);
    // Écran : le centre de la case (x, z) ; on trace une zone qui couvre le départ et les deux premières pièces.
    const scr = (x, z) => ed(page, ([x, z]) => { const E = window.copytrack.session, v = E.target.clone().set((x + 0.5) * 32, E.levelY(), (z + 0.5) * 32).project(window.copytrack.camera), r = window.copytrack.renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, [x, z]);
    const n0 = await ed(page, () => window.copytrack.session.track.tiles.length);
    const [ax, ay] = await scr(0, 0), [bx, by] = await scr(0, -2);
    await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up();
    const sel = await ed(page, () => window.copytrack.session.sel);
    assert.deepEqual(sel, { x0: 0, z0: -2, x1: 0, z1: 0 });
    const geo = await page.evaluate(() => { const b = (id) => document.getElementById(id).getBoundingClientRect(); return { bar: b('ed-selbar'), pal: b('ed-palette'), view: b('ed-view'), shown: !document.getElementById('ed-selbar').classList.contains('hidden') }; });
    assert.ok(geo.shown && geo.bar.left >= geo.pal.right && geo.bar.right <= geo.view.left, 'barre entre le panneau et la Vue : ' + JSON.stringify(geo));
    // Glisser DANS la zone : elle se déplace de deux cases vers l'est.
    const [cx, cy] = await scr(0, -1), [dx, dy] = await scr(2, -1);
    const before = await ed(page, () => window.copytrack.session.track.encode());
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(dx, dy, { steps: 8 }); await page.mouse.up();
    const after = await ed(page, () => { const E = window.copytrack.session; return { sel: E.sel, start: E.track.startTile.x, n: E.track.tiles.length }; });
    assert.deepEqual(after.sel, { x0: 2, z0: -2, x1: 2, z1: 0 }); assert.equal(after.start, 2); assert.equal(after.n, n0);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    assert.equal(await ed(page, () => window.copytrack.session.track.encode()), before, 'un seul Ctrl+Z ramène la zone');
    await ctx.close();
  });
  await test('rangement 0.12 : fenêtre « Circuit » à onglets (Course → Logique applique ce qui a changé) ; Échap referme puis quitte en enregistrant', async () => {
    const { ctx, page } = await open(1366, 768);
    await page.click('[data-ed="params"]');
    await page.waitForSelector('.pp-tabs [data-ptab="course"]');
    await page.click('.pp-tabs [data-ptab="course"]');
    assert.equal(await page.evaluate(() => document.querySelector('.pp-tab[data-pt="course"]').hidden), false);
    await page.selectOption('#pp-veh', 'moto');
    await page.click('.pp-tabs [data-ptab="logic"]');
    await page.waitForSelector('#lg-new');
    assert.equal(await ed(page, () => window.copytrack.session.track.veh0), 'moto', 'le véhicule de départ est appliqué en changeant d’onglet');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.copytrack.ui.modalOpen);
    await ed(page, () => { const E = window.copytrack.session; E.setTool('inspect'); E.inspector.select('tile', E.track.tiles[0]); });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    assert.equal(await ed(page, () => window.copytrack.session.inspector.active), false, 'Échap referme l’inspecteur');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.copytrack.mode === 'menu', null, { timeout: 8000 });
    const saved = await page.evaluate(async () => (await import('/js/storage.js')).listMyTracks().map((t) => t.name));
    assert.ok(saved.includes('Essai'), 'le circuit modifié est dans « Mes circuits » : ' + saved.join(', '));
    await ctx.close();
  });
  // GAME-009 / TECH-002 (phase 7) : piques roulées de 180° (posées au plafond), « Vérifier », « Retour à l'éditeur » : le circuit reste vérifié (avant : signature passée de `1j9bsfk` en
  // course à `x1o7or` dans l'éditeur, « Vérifier et publier » de nouveau proposé, publication et envoi de temps refusés). La route est droite : la vérification n'a besoin que des gaz.
  await test('GAME-009 : piques roulées de π, « Vérifier » puis « Retour à l\'éditeur » : le circuit reste vérifié (signature identique), et le serveur accepte le code (verifyPublish)', async () => {
    const { ctx, page } = await open(1280, 720);
    const before = await page.evaluate(async () => {
      const { scriptTrack } = await import('/js/track.js');
      const t = scriptTrack('Plafond', 'start S4 finish');
      t.addDeco({ k: 'spikes', x: 300, y: 0, z: -60, ry: 0, s: 1, rz: Math.PI });
      await window.copytrack.openEditor({ code: t.encode(), name: 'Plafond' });
      return { sig: t.signature(), rz: t.decos[0].rz };
    });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor' && window.copytrack.session.track.name === 'Plafond', null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => { const A = window.copytrack; A.ui.closeModal(); });
    const sigEd = await ed(page, () => window.copytrack.session.track.signature());
    assert.equal(sigEd, before.sig, 'la signature du circuit rouvert dans l\'éditeur est celle du circuit posé');
    await page.evaluate(() => { const A = window.copytrack; A.input.drive = () => ({ steer: 0, throttle: true, brake: false, drift: false }); A.session.test(true); });
    await page.waitForFunction(() => { const m = document.getElementById('modal'); return m && !m.classList.contains('hidden') && /Circuit vérifié/.test(m.textContent); }, null, { timeout: 150000, polling: 200 });
    const run = await page.evaluate(() => {
      const A = window.copytrack, S = A.session, lr = S.lastRun;
      return { code: A.editorState.code, inputs: lr && lr.inputs, time: lr && lr.time, sigRace: S.track.signature(), verifiedRace: S.track.verified };
    });
    assert.equal(run.verifiedRace, true, 'vérifié en course');
    assert.equal(run.sigRace, before.sig, 'la signature en course est celle du circuit posé (avant : elle changeait)');
    await page.evaluate(() => { [...document.querySelectorAll('#modal button')].find((b) => /Retour à l.éditeur/.test(b.textContent)).click(); });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor', null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => { const T = window.copytrack.session.track; return { verified: T.verified, sig: T.signature(), vt: T.vt, rz: T.decos[0].rz }; });
    assert.equal(back.verified, true, 'le circuit reste « vérifié » au retour dans l\'éditeur (avant : il ne l\'était plus, « Vérifier et publier » était de nouveau proposé)');
    assert.equal(back.sig, before.sig, 'même signature (donc même clé de classement u-…)');
    assert.equal(back.rz, 3.142, 'le roulis garde sa valeur canonique');
    const pub = verifyPublish({ code: run.code, inputs: run.inputs, time: run.time, physVer: PHYS_VER });
    assert.equal(pub.ok, true, 'verifyPublish devrait accepter le code : ' + pub.error);
    await ctx.close();
  });
  // TECH-060 (phase 7) : un code d'une version plus récente (décoration inconnue) ouvert dans l'éditeur : le circuit d'origine n'est jamais réécrit (l'éditeur s'en détache : un nouvel
  // enregistrement crée une copie) ET le joueur est prévenu. Avant : lossBlocking ne regardait que les pièces et les options, rien n'était dit et la décoration disparaissait à l'enregistrement.
  await test('TECH-060 : un code avec une décoration inconnue ouvert dans l\'éditeur : avertissement explicite, détaché de l\'entrée d\'origine, le reste du circuit est gardé', async () => {
    const { ctx, page } = await open(1280, 720);
    await page.evaluate(async () => {
      const { scriptTrack } = await import('/js/track.js');
      const t = scriptTrack('Futur', 'start S4 finish');
      for (let i = 0; i < 3; i++) t.addDeco({ k: 'cone', x: 40 + i * 5, y: 0, z: -20, ry: 0, s: 1 });
      const data = JSON.parse(atob(t.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/')));
      data.o[1][0] = 9999;
      const code = 'SHW3:' + btoa(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await window.copytrack.openEditor({ code, entryId: 'entree-d-origine', name: 'Futur' });
    });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor' && window.copytrack.session.track.name === 'Futur', null, { timeout: 30000, polling: 100 });
    const st = await page.evaluate(() => { const E = window.copytrack.session; return { issue: E.loadIssue, entry: E.entryId, decos: E.track.decos.length, lost: E.track.lost }; });
    assert.equal(st.issue, 'Ce code contient 1 décoration(s) que ce jeu ne peut pas lire.');
    assert.equal(st.entry, null, 'détaché de l\'entrée d\'origine : ce que le joueur enregistre en fait une copie');
    assert.equal(st.decos, 2, 'les décorations lisibles sont gardées');
    await page.waitForFunction(() => { const t = document.getElementById('toast'); return t.classList.contains('on') && /décoration/.test(t.textContent); }, null, { timeout: 8000, polling: 100 });
    const toast = await page.evaluate(() => document.getElementById('toast').textContent);
    assert.match(toast, /Ce code contient 1 décoration\(s\) que ce jeu ne peut pas lire\. Le circuit d'origine reste intact dans « Mes circuits » ; ce que tu enregistres ici en fait une copie\./);
    await ctx.close();
  });
  // TECH-039 (phase 7, 0.16.6) : la clé d'un circuit avec solides ou obstacles a changé ; un circuit vérifié avant (vt / vh de l'ancienne signature) n'est plus « vérifié » : l'auteur
  // doit en connaître la raison, et ses records locaux doivent le suivre sous la nouvelle clé.
  await test('TECH-039 : un circuit vérifié avec l\'ancienne signature : la fenêtre de partage et le refus de publier disent pourquoi (une course de vérification suffit) ; un record d\'avant est retrouvé à l\'ouverture de la fiche', async () => {
    const { ctx, page } = await open(1280, 720);
    const r = await page.evaluate(async () => {
      const A = window.copytrack;
      const { Track, scriptTrack, hashString } = await import('/js/track.js');
      const t = scriptTrack('Ancien', 'start S4 finish');
      t.addDeco({ k: 'pillar', x: 80.123, y: 0, z: -60, ry: 0.5, s: 1 });             // un solide : sa clé a changé (signature au pas du code)
      const data = JSON.parse(atob(t.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/')));
      data.vt = 12.5; data.vh = hashString(t.legacySignatureText());                  // ce que l'éditeur de la 0.16.5 avait écrit à la vérification
      const code = 'SHW3:' + btoa(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const track = Track.decode(code);
      const legacy = track.legacyUserKeys()[0], key = track.userKey;
      localStorage.setItem('shardway.rec3.' + legacy, JSON.stringify({ time: 12.5, pv: 38, date: 1000 }));      // un record d'avant, sous l'ancienne clé
      A.shareModal(code, 'Ancien', track);
      const share = document.getElementById('modal').textContent;
      A.ui.closeModal();
      const pub = await A.publishTrack(track);
      const toast = document.getElementById('toast').textContent;
      const before = localStorage.getItem('shardway.rec3.' + key);
      A.openUserHub({ id: 'm1', name: 'Ancien', code }, 'mytracks');
      await new Promise((res) => setTimeout(res, 600));
      return { verified: track.verified, vt: track.vt, share, pub, toast, legacy, key, before, after: JSON.parse(localStorage.getItem('shardway.rec3.' + key) || 'null'), kept: !!localStorage.getItem('shardway.rec3.' + legacy) };
    });
    assert.equal(r.verified, false); assert.equal(r.vt, 12.5);
    assert.notEqual(r.legacy, r.key);
    assert.match(r.share, /Non vérifié/);
    assert.match(r.share, /Ce circuit avait été vérifié, mais il a changé depuis \(ou le jeu a changé la façon de calculer sa clé de classement\) : une course de vérification suffit pour le revérifier\./);
    assert.equal(r.pub, false);
    assert.match(r.toast, /Vérifie d’abord ton circuit.*Ce circuit avait été vérifié, mais il a changé depuis/);
    assert.equal(r.before, null, 'avant l\'ouverture de la fiche : rien sous la nouvelle clé');
    assert.ok(r.after && r.after.time === 12.5, 'la fiche rapatrie le record d\'avant sous la nouvelle clé : ' + JSON.stringify(r.after));
    assert.ok(r.kept, 'l\'ancien record reste en place');
    await ctx.close();
  });
  // Phase 8 (TECH-003) : avec une option armée que la pièce choisie refuse (« Mur gauche » sur un départ), l'aperçu montré sous la vraie souris annonce exactement ce que le clic
  // fait : la pièce normalisée, sans le volume fantôme de l'option ; la ligne droite du niveau 2 n'est ni annoncée ni supprimée.
  await test('TECH-003 : « Mur gauche » armé, départ visé en (0, 0) sous la souris : l\'aperçu et la pose donnent le même résultat ; la ligne droite du niveau 2 reste', async () => {
    const { ctx, page } = await open(1280, 720);
    await page.evaluate(async () => {
      const { Track } = await import('/js/track.js');
      const t = new Track('Sonde');
      t.add({ t: 'start', x: 6, z: 0, l: 0, r: 0 }); t.add({ t: 'straight', x: 0, z: 0, l: 2, r: 0 }); t.add({ t: 'straight', x: 1, z: 0, l: 0, r: 0 });
      await window.copytrack.openEditor({ code: t.encode(), name: 'Sonde' });
    });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor' && window.copytrack.session.track.name === 'Sonde', null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => { const A = window.copytrack, E = A.session; A.ui.closeModal(); E.setTool('start'); E._optClick('o', 1); E.setLevel(0); E.target.set(16, E.levelY(), 16); E.dist = 160; });
    await page.waitForTimeout(500);
    const pt = await page.evaluate(async () => {
      const THREE = await import('/js/vendor/three.module.min.js');
      const A = window.copytrack, E = A.session, r = A.renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector3(16, E.levelY(), 16).project(A.camera);
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, opts: { ...E.opts } };
    });
    if (!pt.opts.o) throw new Error('précondition : l\'option « Mur gauche » est armée');
    await page.mouse.move(pt.x, pt.y);
    await page.waitForFunction(() => { const E = window.copytrack.session; return E.hover && E.hover.cx === 0 && E.hover.cz === 0 && E._previewPlan && E._previewPlan.norm.x === 0 && E._previewPlan.norm.z === 0; }, null, { timeout: 8000, polling: 50 });
    const pv = await ed(page, () => { const E = window.copytrack.session, p = E._previewPlan; return { ok: p.ok, o: p.norm.o, dropped: p.dropped, remove: p.remove.map((t) => `${t.t}@${t.x},${t.z},${t.l}`).sort(), red: E.previewMat.emissive.getHex() !== 0, visible: E.preview.visible }; });
    assert.equal(pv.ok, true); assert.equal(pv.o, 0, 'aperçu : la pièce normalisée (sans mur)'); assert.deepEqual(pv.dropped, ['o']);
    assert.deepEqual(pv.remove, ['start@6,0,0'], 'aperçu : seul l\'ancien départ sera retiré');
    assert.equal(pv.red, false, 'aperçu : aucune pièce remplacée (pas de rouge)');
    const before = await ed(page, () => window.copytrack.session.track.tiles.map((t) => `${t.t}@${t.x},${t.z},${t.l}`).sort());
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(() => window.copytrack.session.track.tiles.some((t) => t.t === 'start' && t.x === 0), null, { timeout: 8000, polling: 50 });
    const after = await ed(page, () => window.copytrack.session.track.tiles.map((t) => `${t.t}@${t.x},${t.z},${t.l}`).sort());
    assert.deepEqual(before.filter((k) => !after.includes(k)), pv.remove, 'la pose retire exactement ce que l\'aperçu annonçait');
    assert.ok(after.includes('straight@0,0,2'), 'la ligne droite du niveau 2 est toujours là');
    assert.equal(after.filter((k) => k.startsWith('start')).length, 1);
    await ctx.close();
  });
  // Phase 8 (TECH-034) : une décoration posée « Libre » à la souris (coordonnées quelconques), puis Essai, puis retour : tout ce que l'éditeur avait mis de côté revient.
  // Avant : l'instantané du circuit rouvert (relu du code, arrondi) différait de celui qu'on avait quitté, et l'état gardé était jeté (historique 3 → 1, calques perdus…).
  await test('TECH-034 : décoration libre posée à la souris, Essai, retour : historique, presse-papiers, calques masqués / verrouillés conservés ; la « pièce perso » garde ses formes', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, (t) => window.copytrack.session.setTool(t), 'straight'); await press(page, 'KeyP', 3);
    await ed(page, (t) => window.copytrack.session.setTool(t), 'finish'); await press(page, 'KeyP', 1);
    // Calques : une ligne droite dans le groupe 2 (masqué), une autre dans le groupe 3 (verrouillé) ; presse-papiers : une zone copiée.
    await ed(page, () => {
      const E = window.copytrack.session, T = E.track;
      T.tiles[1].g = 2; T.tiles[2].g = 3; T.version++; E._changed(); E._commit();
      E.setGroupHidden(2, true); E.setGroupLocked(3, true);
      E.setTool('select'); E.sel = { x0: -6, z0: -12, x1: 6, z1: 6 }; E.copySel(true); E.sel = null;      // (les pièces des calques masqué et verrouillé ne sont pas copiées : les autres le sont)
      E.setTool('deco:cone'); E.deco.snap = 0; E.target.set(16, E.levelY(), -48); E.dist = 140;
    });
    await page.waitForTimeout(500);
    const nDecos = await ed(page, () => window.copytrack.session.track.decos.length);
    await page.mouse.move(611, 377); await page.mouse.move(613, 379);
    await page.waitForTimeout(300);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction((n) => window.copytrack.session.track.decos.length === n + 1, nDecos, { timeout: 8000, polling: 50 });
    // La pièce perso : l'outil garde ses formes (E.deco.cp) ; une première pose.
    const before = await ed(page, async () => {
      const E = window.copytrack.session, d = E.track.decos[E.track.decos.length - 1];
      const { sanitizeDecoParts } = await import('/js/customDeco.js');
      E.deco.cp = sanitizeDecoParts([{ s: 'box', x: 0, y: 1, z: 0, sx: 2, sy: 1, sz: 1, ry: 0, c: '#ff0000' }, { s: 'sphere', x: 0, y: 2.5, z: 0, sx: 1, sy: 1, sz: 1, ry: 0, c: '#00ff00' }]);
      E.setTool('deco:custom');
      return { x: d.x, z: d.z, offGrid: Math.abs(d.x * 2 - Math.round(d.x * 2)) > 1e-6 || Math.abs(d.z * 2 - Math.round(d.z * 2)) > 1e-6, hist: E.history.length, hIndex: E.hIndex, clip: !!E.clip, cp: E.deco.cp.length, tool: E.tool };
    });
    if (!before.offGrid) throw new Error('précondition : la décoration est posée hors de la grille (Libre) : ' + JSON.stringify(before));
    if (before.hist < 4 || !before.clip) throw new Error('précondition : historique et presse-papiers en place : ' + JSON.stringify(before));
    await page.evaluate(() => window.copytrack.session.test());
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind !== 'editor' && window.copytrack.mode === 'race', null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.copytrack.quitRace());
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor', null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(500);
    const back = await ed(page, () => {
      const E = window.copytrack.session;
      return { hist: E.history.length, hIndex: E.hIndex, clip: !!E.clip, hidden: E.hiddenGroups ? [...E.hiddenGroups] : [], locked: E.lockedGroups ? [...E.lockedGroups] : [], cp: E.deco.cp ? E.deco.cp.length : 0, tool: E.tool, dirty: E.isDirty() };
    });
    assert.equal(back.hist, before.hist, 'historique d\'annulation conservé');
    assert.equal(back.hIndex, before.hIndex);
    assert.equal(back.clip, true, 'presse-papiers conservé');
    assert.deepEqual(back.hidden, [2], 'calque masqué conservé');
    assert.deepEqual(back.locked, [3], 'calque verrouillé conservé');
    assert.equal(back.tool, 'deco:custom');
    assert.equal(back.cp, before.cp, 'la pièce perso garde ses formes');
    // Une pose avec la pièce perso : elle réussit (avant : « Maximum de 500 décorations atteint », l'outil n'avait plus de formes).
    const n2 = await ed(page, () => window.copytrack.session.track.decos.length);
    await page.mouse.move(640, 400); await page.mouse.move(642, 402); await page.waitForTimeout(300);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction((n) => window.copytrack.session.track.decos.length === n + 1, n2, { timeout: 8000, polling: 50 });
    const undo = await ed(page, () => { const E = window.copytrack.session; E.undo(); E.undo(); return E.track.decos.length; });
    assert.equal(undo, n2 - 1, 'annuler remonte l\'historique d\'avant l\'essai (la décoration libre est retirée)');
    await ctx.close();
  });
  // Phase 8 (TECH-035) : l'inspecteur écrit par la normalisation du modèle ; un solide ne propose ni inclinaison ni roulis.
  await test('TECH-035 : inclinaison de 37,5° saisie dans l\'inspecteur, annuler / rétablir : le rétablissement est intact (pas de pas fantôme) ; un pilier n\'a ni inclinaison, ni roulis, ni « Retourner »', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, () => {
      const E = window.copytrack.session;
      E.track.addDeco({ k: 'cone', x: 20.5, y: 0, z: 20.5, ry: 0, s: 1 }); E.track.addDeco({ k: 'pillar', x: 60, y: 0, z: 20, ry: 0, s: 1 });
      E._changed(); E._commit(); E.setTool('inspect'); E.inspector.select('deco', E.track.decos[0]);
    });
    await page.waitForTimeout(300);
    const input = page.locator('#ed-insp label.insp-row', { hasText: 'Inclinaison (X)' }).locator('input[type=number]');
    await input.fill('37.5'); await input.dispatchEvent('change');
    await page.waitForTimeout(200);
    const r = await ed(page, () => {
      const E = window.copytrack.session, d = E.track.decos[0];
      const rx = d.rx, n = E.history.length;
      E.undo(); const undone = E.track.decos[0].rx || 0;
      E.redo(); const same = E._snapshot() === E.history[E.hIndex];
      E.undo(); E._commit();      // (un clic de l'inspecteur qui ne change rien)
      const kept = E.history.length; E.redo();
      return { rx, n, undone, same, kept, after: E.track.decos[0].rx, dirty: E.isDirty() };
    });
    assert.equal(r.rx, 0.654, 'au millième');
    assert.equal(r.undone, 0);
    assert.equal(r.same, true, 'après annuler / rétablir, le circuit égale l\'instantané courant');
    assert.equal(r.kept, r.n, 'aucun pas fantôme : la pile « rétablir » est intacte');
    assert.equal(r.after, 0.654, 'rétablir redonne l\'inclinaison');
    await ed(page, () => { const E = window.copytrack.session; E.inspector.select('deco', E.track.decos[1]); });
    await page.waitForTimeout(300);
    const panel = await page.locator('#ed-insp').innerText();
    assert.match(panel, /Cap \(Y\)/);
    assert.doesNotMatch(panel, /Inclinaison \(X\)|Roulis \(Z\)|Retourner|Remettre droit/, 'un solide n\'expose ni inclinaison ni roulis');
    await ctx.close();
  });
  // ---- Phase 9 : défauts indépendants de l'éditeur ----------------------------------------------------------------------------------------------------
  // Écran d'un point 3D (le projeté de la caméra de l'éditeur).
  const screenOf = (page, x, y, z) => page.evaluate(async ([x, y, z]) => {
    const THREE = await import('/js/vendor/three.module.min.js');
    const A = window.copytrack, r = A.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3(x, y, z).project(A.camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, [x, y, z]);
  await test('TECH-036 : clic droit (outil décoration) et gomme à la souris : une décoration d\'un calque verrouillé ou masqué n\'est pas effacée ; celle d\'un calque libre l\'est', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, () => {
      const E = window.copytrack.session, T = E.track;
      T.clear(); T.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
      T.addDeco({ k: 'cone', x: 16, y: 0, z: 16, ry: 0, s: 1, g: 2 }); T.addDeco({ k: 'cone', x: 16, y: 0, z: 48, ry: 0, s: 1, g: 3 }); T.addDeco({ k: 'cone', x: 16, y: 0, z: 80, ry: 0, s: 1 });
      E._changed(); E._commit(); E.setGroupLocked(2, true); E.setGroupHidden(3, true);
      E.target.set(16, E.levelY(), 48); E.dist = 160;
    });
    await page.waitForTimeout(400);
    for (const [z, tool, button] of [[16, 'deco:tree', 'right'], [48, 'deco:tree', 'right'], [16, 'erase', 'left'], [48, 'erase', 'left']]) {
      await ed(page, (t) => window.copytrack.session.setTool(t), tool);
      const p = await screenOf(page, 16, 0, z);
      await page.mouse.move(p.x, p.y); await page.mouse.move(p.x + 1, p.y + 1); await page.waitForTimeout(150);
      await page.mouse.click(p.x + 1, p.y + 1, { button });
      await page.waitForTimeout(150);
      assert.equal(await ed(page, () => window.copytrack.session.track.decos.filter((d) => d.g).length), 2, `${tool} / ${button} sur z = ${z} : décoration protégée intacte`);
    }
    await ed(page, (t) => window.copytrack.session.setTool(t), 'erase');
    const p = await screenOf(page, 16, 0, 80);
    await page.mouse.move(p.x, p.y); await page.mouse.move(p.x + 1, p.y + 1); await page.waitForTimeout(150);
    await page.mouse.click(p.x + 1, p.y + 1);
    await page.waitForFunction(() => window.copytrack.session.track.decos.length === 2, null, { timeout: 5000, polling: 50 });
    await ctx.close();
  });
  await test('TECH-038 : un groupe cité seulement par la logique n\'est pas proposé par « Nouveau groupe » (fenêtre « Groupes et calques »)', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, () => {
      const E = window.copytrack.session, T = E.track;
      T.clear(); T.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); T.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0 });
      T.setLogic({ v: 1, off: [1], vars: 0, rules: [{ on: ['start'], if: [], do: [['show', 1]], once: true }] });
      E._changed(); E._commit(); E.setTool('select'); E.sel = { x0: 0, z0: -1, x1: 0, z1: -1 }; E.openGroups();
    });
    await page.waitForSelector('.ed-groups [data-a="new"]');
    await page.locator('.ed-groups [data-a="new"]').click();
    await page.waitForTimeout(200);
    const r = await ed(page, () => { const T = window.copytrack.session.track; return { groups: T.tiles.map((t) => t.g), lg: T.logicGroups() }; });
    assert.deepEqual(r.groups, [0, 2], 'la pièce est rangée dans le groupe 2, pas dans le groupe 1 de la logique (caché au départ)');
    await ctx.close();
  });
  await test('TECH-057 : Ctrl+A sélectionne aussi les décorations hors de l\'emprise des pièces ; Suppr les efface', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, () => { const E = window.copytrack.session, T = E.track; T.clear(); T.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); T.addDeco({ k: 'tree', x: 500, y: 0, z: -400, ry: 0, s: 1 }); E._changed(); E._commit(); E.setTool('inspect'); });
    await page.keyboard.press('Control+a'); await page.waitForTimeout(200);
    assert.equal(await ed(page, () => window.copytrack.session._selDecos().length), 1);
    await ed(page, () => window.copytrack.session.deleteSel(true));
    assert.equal(await ed(page, () => window.copytrack.session.track.decos.length), 0);
    await ctx.close();
  });
  await test('TECH-054 / 058 : importer un circuit après avoir masqué des calques : calques remis à zéro, un presse-papiers d\'avant colle sans groupes ; annuler l\'import rend l\'ancien circuit vérifié', async () => {
    const { ctx, page } = await open(1280, 720);
    const r = await ed(page, async () => {
      const E = window.copytrack.session, T = E.track, { scriptTrack } = await import('/js/track.js');
      T.clear(); T.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); T.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0, g: 1 }); T.setVerified(11.5);
      E._changed(); E._commit();
      E.setTool('select'); E.sel = { x0: 0, z0: -1, x1: 0, z1: -1 }; E.copySel(true); E.sel = null;      // (copié AVANT de masquer : un calque masqué ne se copie pas)
      E.setGroupHidden(1, true); E.setGroupLocked(1, true);
      const other = scriptTrack('Autre', 'start S2 finish'); other.tiles[1].g = 1;
      E.loadCode(other.encode());
      const a = { hidden: E.hiddenGroups.size, locked: E.lockedGroups.size, mine: E._layerOk(T.tiles[1]), verified: T.verified };
      E.setTool('select'); E.hover = { cx: 6, cz: 6 }; E.level = 0; E.doPaste();
      const pasted = T.tiles.filter((t) => t.x === 6 && t.z === 6).map((t) => t.g | 0);
      E.undo(); E.undo();
      return { ...a, pasted, back: { name: T.name, verified: T.verified, vt: T.vt } };
    });
    assert.deepEqual([r.hidden, r.locked, r.mine, r.verified], [0, 0, true, false]);
    assert.deepEqual(r.pasted, [0], 'collé dans un autre circuit : groupe 0');
    assert.equal(r.back.verified, true, 'annuler l\'import rend l\'ancien circuit vérifié : ' + JSON.stringify(r.back));
    await ctx.close();
  });
  await test('TECH-056 : un code avec windDir 30 : ouvrir « Circuit » et valider ne change ni la direction ni la signature du vent', async () => {
    const { ctx, page } = await open(1280, 720);
    const before = await page.evaluate(async () => {
      const { scriptTrack } = await import('/js/track.js'), t = scriptTrack('Vent', 'start S4 finish');
      t.setParams({ wind: 40, windDir: 30 });
      await window.copytrack.openEditor({ code: t.encode(), name: 'Vent' });
      return { dir: t.windDir, sig: t.signature() };
    });
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.kind === 'editor' && window.copytrack.session.track.name === 'Vent', null, { timeout: 30000, polling: 100 });
    assert.equal(before.dir, 30);
    await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack.session.openParams('cond'); });
    await page.waitForSelector('#pp-winddir');
    assert.equal(await page.locator('#pp-winddir').inputValue(), '30', 'la liste propose 30°');
    await page.locator('#modal-actions button.primary').click();      // « Appliquer »
    await page.waitForTimeout(300);
    const after = await ed(page, () => { const T = window.copytrack.session.track; return { dir: T.windDir, wind: T.wind, sig: T.signature() }; });
    assert.equal(after.wind, 40);
    assert.equal(after.dir, 30, 'la direction reste 30° (avant : réécrite en 45°)'); assert.equal(after.sig, before.sig, 'la signature ne change pas');
    await ctx.close();
  });
  await test('TECH-062 : vue par niveau : les pièces estompées d\'un calque masqué ne s\'affichent pas', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, () => {
      const E = window.copytrack.session, T = E.track;
      T.clear(); T.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); T.add({ t: 'straight', x: 0, z: -1, l: 5, r: 0, g: 4 });
      E._changed(); E._commit(); E.focusLevel = true; E.setLevel(0); E.needsRebuild = true;
    });
    await page.waitForTimeout(600);
    const count = () => ed(page, () => { const V = window.copytrack.session.view; return V.group.children.filter((c) => c.material === V.dimMat && c.visible).length; });
    assert.ok(await count() >= 1, 'précondition : la pièce du niveau 5 est estompée');
    await ed(page, () => window.copytrack.session.setGroupHidden(4, true));
    assert.equal(await count(), 0, 'calque masqué : rien d\'estompé à l\'écran');
    await ed(page, () => { const E = window.copytrack.session; E.needsRebuild = true; E.setLevel(1); E.setLevel(0); });
    await page.waitForTimeout(500);
    assert.equal(await count(), 0, 'après reconstruction : toujours masquée');
    await ctx.close();
  });
  await test('TECH-059 : stockage plein : « Retour » reste dans l\'éditeur et propose d\'exporter le code ou de quitter sans enregistrer ; le bandeau « Recharger » ne recharge pas dans le dos du joueur', async () => {
    const { ctx, page } = await open(1280, 720);
    await ed(page, () => { const E = window.copytrack.session; E.track.clear(); E.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); E.track.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0 }); E._changed(); E._commit(); window.__keepAlive = 'oui'; });
    await page.evaluate(() => { const S = window.Storage, real = S.prototype.setItem; window.__realSet = real; S.prototype.setItem = function (k, v) { if (/track|mine|draft|editor/i.test(k)) throw new window.DOMException('plein', 'QuotaExceededError'); return real.call(this, k, v); }; });
    await page.evaluate(() => window.copytrack.leaveEditor());
    await page.waitForFunction(() => /Circuit non enregistré/.test(document.getElementById('modal').textContent), null, { timeout: 5000 });
    const labels = await page.evaluate(() => [...document.querySelectorAll('#modal-actions button')].map((b) => b.textContent));
    assert.deepEqual(labels, ['Rester dans l’éditeur', 'Exporter le code', 'Quitter sans enregistrer']);
    assert.equal(await ed(page, () => window.copytrack.session.kind), 'editor', 'toujours dans l\'éditeur');
    // bandeau de mise à jour : pas de rechargement
    await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack._newVersion = 'bêta 99'; window.copytrack.maybeShowUpdate(); document.querySelector('#update-bar [data-up="reload"]').click(); });
    await page.waitForFunction(() => /Circuit non enregistré/.test(document.getElementById('modal').textContent) && [...document.querySelectorAll('#modal-actions button')].some((b) => /Recharger sans enregistrer/.test(b.textContent)), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__keepAlive), 'oui', 'la page n\'a pas été rechargée');
    // exporter le code
    await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack.leaveEditor(); });
    await page.waitForFunction(() => /Circuit non enregistré/.test(document.getElementById('modal').textContent));
    await page.evaluate(() => [...document.querySelectorAll('#modal-actions button')].find((b) => /Exporter/.test(b.textContent)).click());
    await page.waitForFunction(() => /Partager le circuit/.test(document.getElementById('modal-title').textContent), null, { timeout: 5000 });
    assert.match(await page.locator('#modal-body textarea').inputValue(), /^SHW3:/, 'le code du circuit est proposé');
    // quitter sans enregistrer
    await page.evaluate(() => { window.copytrack.ui.closeModal(); window.copytrack.leaveEditor(); });
    await page.waitForFunction(() => /Circuit non enregistré/.test(document.getElementById('modal').textContent));
    await page.evaluate(() => [...document.querySelectorAll('#modal-actions button')].find((b) => /Quitter sans/.test(b.textContent)).click());
    await page.waitForFunction(() => window.copytrack.mode === 'menu', null, { timeout: 8000 });
    await page.evaluate(() => { window.Storage.prototype.setItem = window.__realSet; });
    await ctx.close();
  });
  await test('rangement 0.12 sur téléphone (844 × 390) : le panneau est un tiroir, il se referme après un choix ; la vue reste dégagée', async () => {
    const { ctx, page } = await open(844, 390);
    const drawer = () => page.evaluate(() => { const r = document.getElementById('ed-palette').getBoundingClientRect(); return r.right > 60 && r.left < 70; });
    assert.equal(await drawer(), false, 'fermé au départ');
    await page.click('#ed-tools [data-tool="pieces"]');
    await page.waitForTimeout(300);
    assert.equal(await drawer(), true, 'toucher l’outil actif ouvre le tiroir');
    await page.click('#ed-palette .lib-tile[data-fam="loop"]');
    await page.waitForTimeout(300);
    assert.equal(await drawer(), false, 'il se referme après le choix');
    assert.match(await ed(page, () => window.copytrack.session.tool), /^loop/);
    await ctx.close();
  });
} finally {
  await browser.close(); server.kill();
}
if (errors.length) { failures++; console.log('  FAIL erreurs de page : ' + errors.slice(0, 3).join(' | ')); }
console.log(failures ? `\n${failures} échec(s) sur ${n}` : `\nTous les tests navigateur de l'éditeur (phase 1) passent (${n}).`);
process.exit(failures ? 1 : 0);
