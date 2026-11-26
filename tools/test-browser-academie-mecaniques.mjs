// Académie, leçons par mécanique (COMPLETE-008) dans un vrai navigateur : node tools/test-browser-academie-mecaniques.mjs   (npm run test:browser)
//
// Le menu de l'Académie propose les huit leçons ; CHACUNE est jouée pour de bon dans la vraie course (le pilote automatique du jeu aux commandes, injecté dans la session) jusqu'à l'écran
// de bilan « Leçon réussie » : objectif atteint, pièces versées une fois, mécaniques marquées rencontrées. En français (les huit) et en anglais (deux : textes traduits, aucun reste de français).
// Playwright n'est pas une dépendance du projet : sans lui (ou sans Chromium), le test est ignoré.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
// Playwright / Chromium absents : ignoré en local, ÉCHEC en CI ou avec REQUIRE_BROWSER=1 (un job « navigateur » ne passe jamais au vert sans avoir rien lancé).
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

let failures = 0, executed = 0;
const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
async function test(name, fn) {
  const before = errors.length;
  executed++;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); }
}
async function device(locale) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  return { ctx, page };
}
const click = (page, sel) => page.locator(sel).first().evaluate((el) => el.click());
const enter = async (page, name = 'Testeur') => {
  if (await page.locator('#wl-name').isVisible()) { await page.locator('#wl-name').fill(name); await click(page, '#wl-submit'); }
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  if (await page.evaluate(() => window.copytrack.ui.modalOpen)) { await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.copytrack.ui.modalOpen); }
};
const frenchLeft = (page, rootSel) => page.evaluate(async (rootSel) => {
  const { looksFrench } = await import('/js/i18n.js');
  const { isInlineContainer, TRANSLATED_ATTRS } = await import('/js/i18n/dom.js');
  const out = [];
  const walk = (el) => {
    if (/^(SCRIPT|STYLE|TEXTAREA|CANVAS|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || el.getAttribute('data-i18n') === 'off') return;
    for (const a of TRANSLATED_ATTRS) { const v = el.getAttribute(a); if (v && looksFrench(v)) out.push(a + ' : ' + v); }
    if (isInlineContainer(el)) { if (looksFrench(el.textContent)) out.push(el.innerHTML.replace(/\s+/g, ' ').trim()); return; }
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { const t = c.nodeValue.replace(/\s+/g, ' ').trim(); if (t && /[A-Za-zÀ-ÿ]/.test(t) && looksFrench(t)) out.push(t); }
      else if (c.nodeType === 1) walk(c);
    }
  };
  walk(document.querySelector(rootSel));
  return out.filter((s) => s !== 'Français');
}, rootSel);
const modalTitle = (page) => page.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : ''));

// Joue la leçon i dans la vraie course, le pilote automatique du jeu aux commandes ; renvoie le titre du bilan.
async function playLesson(page, i) {
  await page.evaluate((i) => window.copytrack.playMechLesson(i), i);
  await page.waitForFunction(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 30000 });
  await page.evaluate(async () => {
    const s = window.copytrack.session, { Autopilot } = await import('/js/autopilot.js');
    s.bot = new Autopilot(s.track.path); s.bot.reset(s.phys);
  });
  await page.waitForFunction(() => window.copytrack.ui.modalOpen && /Leçon réussie|Lesson passed|Pas tout à fait|Not quite/.test(document.getElementById('modal-title').textContent), null, { timeout: 120000 });
  return modalTitle(page);
}

try {
  await test('fr : le menu de l\'Académie propose les huit leçons par mécanique, avec leur objectif, et chaque leçon ouvre son introduction', async () => {
    const { ctx, page } = await device('fr-FR');
    await enter(page);
    await page.evaluate(() => window.copytrack.academyMenu());
    await page.waitForSelector('[data-mlesson]');
    assert.equal(await page.locator('[data-mlesson]').count(), 8);
    const body = await page.locator('#modal-body').innerText();
    for (const n of ['Gravité et inversion', 'Murs, looping et plafond', 'Eau et bateau', 'Deltaplane', 'Verre fragile', 'Aimant', 'Obstacles animés', 'Portes logiques']) assert.ok(body.includes(n), n);
    assert.match(body, /0 \/ 8 leçons par mécanique réussies/);
    assert.match(body, /Vitesse sur le mur/); assert.match(body, /Obstacles animés/);
    assert.equal(await page.locator('[data-drill]').count(), 6, 'six exercices : les quatre d\'origine et les deux nouveaux');
    await click(page, '[data-mlesson="2"]');
    await page.waitForFunction(() => /Mécanique · Eau et bateau/.test(document.getElementById('modal-title').textContent));
    assert.match(await text(page, '#modal-body'), /plaque bateau/); assert.match(await text(page, '#modal-body'), /Objectif : Franchir l.arrivée en bateau/);
    await ctx.close();
  });

  for (const [locale, lang, picks] of [['fr-FR', 'fr', [0, 1, 2, 3, 4, 5, 6, 7]], ['en-US', 'en', [0, 7]]]) {
    await test(`${lang} : ${picks.length} leçon(s) jouée(s) pour de bon, le pilote automatique du jeu aux commandes : « Leçon réussie », pièces versées une fois, mécaniques marquées rencontrées`, async () => {
      const { ctx, page } = await device(locale);
      await enter(page);
      for (const i of picks) {
        const before = await page.evaluate(async () => (await import('/js/profile.js')).profile().coins);
        const title = await playLesson(page, i);
        assert.match(title, /Leçon réussie|Lesson passed/, `leçon ${i} : ${title}`);
        const st = await page.evaluate(async (i) => {
          const P = (await import('/js/profile.js')).profile(), { MECH_LESSONS } = await import('/js/academyMech.js');
          const L = MECH_LESSONS[i];
          return { done: P.academy[L.id], coins: P.coins, id: L.id, mech: { ...(P.mech || {}) }, stats: { ...window.copytrack.session.stats }, goal: L.goal };
        }, i);
        assert.equal(st.done, 1, st.id + ' réussie');
        assert.equal(st.coins - before, 20, st.id + ' : +20 ◆ la première fois');
        assert.ok(Object.values(st.mech).includes(2), 'les mécaniques de la leçon sont marquées rencontrées : ' + JSON.stringify(st.mech));
        if (lang === 'en') assert.deepEqual(await frenchLeft(page, '#modal'), [], 'rien de français dans le bilan en anglais');
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        await page.evaluate(() => window.copytrack.quitRace && window.copytrack.quitRace());
        await page.waitForFunction(() => window.copytrack.mode !== 'race', null, { timeout: 15000 });
        if (await page.evaluate(() => window.copytrack.ui.modalOpen)) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      }
      if (lang === 'en') {
        await page.evaluate(() => window.copytrack.academyMenu());
        await page.waitForSelector('[data-mlesson]');
        assert.deepEqual(await frenchLeft(page, '#modal'), [], 'rien de français dans le menu de l\'Académie en anglais');
        assert.match(await text(page, '#modal-body'), /2 \/ 8 mechanic lessons passed/);
      }
      const academy = await page.evaluate(async () => { const a = await import('/js/academy.js'); return { core: a.lessonsDone(), complete: a.academyComplete() }; });
      assert.deepEqual(academy, { core: 0, complete: false }, 'le diplôme des six leçons d\'origine n\'est pas touché');
      await ctx.close();
    });
  }
} finally {
  await browser.close();
  server.kill();
}
async function text(page, sel) { return page.locator(sel).first().innerText(); }
if (!failures && executed < 3) { console.log(`  FAIL seulement ${executed} test(s) exécuté(s) (minimum 3)`); failures++; }
console.log(failures ? `${failures} test(s) en échec` : `Tous les tests navigateur des leçons par mécanique passent (${executed} exécutés)`);
process.exit(failures ? 1 : 0);
