// Fin de carrière (COMPLETE-013) dans un vrai navigateur : node tools/test-browser-fin-carriere.mjs   (npm run test:browser)
//
// Un profil dont la carrière est finie (une médaille sur chaque circuit, records écrits comme le fait le jeu) : l'écran de fin s'ouvre tout seul UNE fois à l'écran des circuits,
// se rouvre par le bouton, dans les deux langues (aucun reste de français en anglais), avec le bilan calculé et sans animation quand elles sont réduites ; un profil non fini n'en voit rien.
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
const PORT = 8700 + Math.floor(Math.random() * 90);
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

// Un contexte = un « appareil » neuf (stockage vide) avec la langue du navigateur demandée.
async function device(locale, { before, server } = {}) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  if (before) await ctx.addInitScript(before);
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  if (server) await page.route(/supabase\.co/, server);            // serveur simulé (prioritaire : déclaré après)
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  return { ctx, page, requests };
}
const text = (page, sel) => page.locator(sel).first().innerText();
const click = (page, sel) => page.locator(sel).first().evaluate((el) => el.click());
const enter = async (page, name = 'Testeur') => {
  if (await page.locator('#wl-name').isVisible()) { await page.locator('#wl-name').fill(name); await click(page, '#wl-submit'); }
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  if (await page.evaluate(() => window.copytrack.ui.modalOpen)) { await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.copytrack.ui.modalOpen); }
};

// Les textes restés en français dans la page (texte, infobulles ; un paragraphe à balises compte d'un bloc). Même logique que tools/i18n-crawl.mjs.
const frenchLeft = (page) => page.evaluate(async () => {
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
  walk(document.documentElement);
  // Les descriptions des circuits (infobulles « Départ : … ») sont vérifiées par le test Node ; ici on ne regarde que l'interface.
  // (et le « code joueur » aléatoire de l'écran Compte, XXXXX-XXXXX : un mot-outil français entouré de chiffres, comme « 5TU5 », le faisait passer pour du français : échec aléatoire constaté en phase 5)
  return out.filter((s) => s !== 'Français' && !/^[A-Z0-9]{4,6}-[A-Z0-9]{4,6}$/.test(s));
});


const seed = (page, tier) => page.evaluate(async (tier) => {
  const a = window.copytrack, { saveRecord } = await import('/js/storage.js');
  let n = 0;
  a.builtins.forEach((b, i) => { if (i < tier.count) { saveRecord(b.key, { time: b.def.medals.bronze - 0.0001, pv: 38, date: 1 }); n++; } });
  return n;
}, tier);
const modalTitle = (page) => page.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : ''));
const closeModal = async (page) => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.copytrack.ui.modalOpen); };

try {
  for (const [locale, lang, title, lead, grid] of [['fr-FR', 'fr', '🏁 Carrière accomplie', /Tu as une médaille sur chacun des 84 circuits/, /Circuits terminés/], ['en-US', 'en', '🏁 Career accomplished', /You have a medal on each of the 84 career tracks/, /Tracks finished/]]) {
    await test(`${lang} : carrière finie — l'écran de fin s'ouvre une seule fois, avec le bilan calculé, et se rouvre par le bouton`, async () => {
      const { ctx, page } = await device(locale);
      await enter(page);
      assert.equal(await seed(page, { count: 84 }), 84);
      await page.evaluate(() => window.copytrack.showScreen('tracks'));
      await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 5000 });
      assert.equal(await modalTitle(page), title);
      const body = await text(page, '#modal-body');
      assert.match(body, lead); assert.match(body, grid); assert.match(body, /84 \/ 84/); assert.match(body, /Grande Finale|Grand Finale|Final/);
      const total = await page.evaluate(async () => { const a = window.copytrack, { getRecord, medalTime, formatTime } = await import('/js/storage.js'); return formatTime(Math.round(a.builtins.reduce((s, b) => s + Math.round(medalTime(getRecord(b.key)) * 1000), 0)) / 1000); });
      assert.ok(body.includes(total), 'le temps cumulé affiché est celui des records : ' + total);
      if (lang === 'en') assert.deepEqual((await frenchLeft(page)).filter((s) => !/Grande Finale|Grand Finale|Chakra|three\.js|bêta|Trackigami/.test(s)), [], 'rien de français dans l’écran de fin en anglais');
      assert.equal(await page.evaluate(async () => !!(await import('/js/profile.js')).profile().careerEnd), true, 'la première fois est gardée dans le profil');
      await closeModal(page);
      await page.evaluate(() => { window.copytrack.showScreen('menu'); window.copytrack.showScreen('tracks'); });
      await page.waitForTimeout(1000);
      assert.equal(await modalTitle(page), '', 'il ne se rouvre pas tout seul');
      await click(page, '[data-career-end="open"]');
      await page.waitForFunction(() => window.copytrack.ui.modalOpen);
      assert.equal(await modalTitle(page), title, 'rejouable depuis le bouton');
      await click(page, '[data-career-end="finale"]');
      await page.waitForFunction(() => window.copytrack.mode !== 'menu' && !window.copytrack.ui.modalOpen, null, { timeout: 20000 });
      assert.match(await page.evaluate(() => window.copytrack.session && window.copytrack.session.opts ? String(window.copytrack.session.opts.builtinIndex) : ''), /^83$/, 'l’épreuve finale est la Grande Finale');
      await ctx.close();
    });
  }

  await test('carrière non finie : aucun écran de fin, aucun bouton', async () => {
    const { ctx, page } = await device('fr-FR');
    await enter(page);
    assert.equal(await seed(page, { count: 83 }), 83);
    await page.evaluate(() => window.copytrack.showScreen('tracks'));
    await page.waitForTimeout(1000);
    assert.equal(await modalTitle(page), '');
    assert.equal(await page.locator('[data-career-end="open"]').count(), 0);
    assert.equal(await page.evaluate(async () => !!(await import('/js/profile.js')).profile().careerEnd), false);
    await ctx.close();
  });

  await test('animations réduites : le générique est affiché d’un bloc, sans animation', async () => {
    const { ctx, page } = await device('en-US');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enter(page);
    await seed(page, { count: 84 });
    await page.evaluate(() => window.copytrack.showScreen('tracks'));
    await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 5000 });
    const st = await page.evaluate(() => [...document.querySelectorAll('.ce-credits li')].map((li) => { const c = getComputedStyle(li); return [c.animationName, c.opacity]; }));
    assert.equal(st.length, 5);
    for (const [name, op] of st) { assert.equal(name, 'none'); assert.equal(op, '1'); }
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
if (!failures && executed < 4) { console.log(`  FAIL seulement ${executed} test(s) exécuté(s) (minimum 4)`); failures++; }
console.log(failures ? `${failures} test(s) en échec` : `Tous les tests navigateur de la fin de carrière passent (${executed} exécutés)`);
process.exit(failures ? 1 : 0);
