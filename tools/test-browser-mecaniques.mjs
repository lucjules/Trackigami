// Mécaniques (COMPLETE-007) dans un vrai navigateur : node tools/test-browser-mecaniques.mjs   (npm run test:browser)
//
// Un profil neuf, en français puis en anglais : la carte « Nouveau » de la fiche du premier circuit (une seule fois), le rappel discret en course (priorité basse, une seule fois, jamais sur un
// message important), l'index « Mécaniques » du profil ; un profil qui a déjà des records ne voit pas de carte pour ce qu'il connaît ; l'Académie et la fiche d'un circuit verrouillé ne consomment rien.
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
const PORT = 8800 + Math.floor(Math.random() * 90);
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

async function device(locale, { before } = {}) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  if (before) await ctx.addInitScript(before);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  return { ctx, page };
}
const text = (page, sel) => page.locator(sel).first().innerText();
const click = (page, sel) => page.locator(sel).first().evaluate((el) => el.click());
const enter = async (page, name = 'Testeur') => {
  if (await page.locator('#wl-name').isVisible()) { await page.locator('#wl-name').fill(name); await click(page, '#wl-submit'); }
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  if (await page.evaluate(() => window.copytrack.ui.modalOpen)) { await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.copytrack.ui.modalOpen); }
};
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
  walk(document.getElementById('race-hub')); walk(document.getElementById('profile')); walk(document.getElementById('hud'));
  return out.filter((s) => s !== 'Français' && !/^[A-Z0-9]{4,6}-[A-Z0-9]{4,6}$/.test(s));
});
const mech = (page) => page.evaluate(async () => ({ ...(((await import('/js/profile.js')).profile().mech) || {}) }));
// Ouvre la fiche du circuit i comme le joueur : écran des circuits, clic sur la carte.
async function openCard(page, i) {
  await page.evaluate(() => window.copytrack.showScreen('tracks'));
  await page.waitForSelector('#track-list .card');
  await page.evaluate((i) => document.querySelectorAll('#track-list .card')[i].click(), i);
  await page.waitForFunction(() => !document.getElementById('race-hub').classList.contains('hidden'));
  await page.waitForTimeout(300);
}
const back = async (page) => { await click(page, '#race-hub [data-action="hub-back"]'); await page.waitForTimeout(200); };

try {
  for (const [locale, lang, names, newTitle, reminder, idx] of [
    ['fr-FR', 'fr', ['Accélérateur', 'Mur', 'Bifurcation', 'Carrefour'], 'Nouveau sur ce circuit', /^Nouveau · /, /Mécaniques découvertes/i],
    ['en-US', 'en', ['Accelerator', 'Wall', 'Fork', 'Junction'], 'New on this track', /^New · /, /Discovered mechanics/i],
  ]) {
    await test(`${lang} : profil neuf — la carte « Nouveau » de la fiche du premier circuit, une seule fois ; le rappel discret en course, une seule fois ; l'index du profil`, async () => {
      const { ctx, page } = await device(locale);
      await enter(page);
      // 1. la fiche
      await openCard(page, 0);
      assert.equal(await page.locator('#hub-new').isVisible(), true, 'la carte est visible');
      const cards = await page.locator('#hub-new .mech-cards li').allInnerTexts();
      assert.equal(cards.length, 4, 'les quatre mécaniques du premier circuit');
      for (const n of names) assert.ok(cards.some((c) => c.includes(n)), n + ' dans les cartes : ' + cards.join(' / '));
      assert.ok((await text(page, '#hub-new h3')).includes(newTitle));
      if (lang === 'en') assert.deepEqual(await frenchLeft(page), [], 'rien de français sur la fiche en anglais');
      assert.deepEqual(Object.values(await mech(page)), [1, 1, 1, 1], 'vues : niveau 1');
      // une seule fois : on quitte la fiche et on la rouvre
      await back(page); await openCard(page, 0);
      assert.equal(await page.locator('#hub-new').isVisible(), false, 'la carte ne revient pas');
      // 2. la course : le rappel arrive à l'approche d'une mécanique, discret, unique
      await click(page, '#hub-play');
      await page.waitForFunction(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 30000 });
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(() => { const e = document.getElementById('hud-msg'); return e.classList.contains('on') && e.classList.contains('hint'); }, null, { timeout: 40000 });
      const msg = (await text(page, '#hud-msg')).trim();
      assert.match(msg, reminder);
      assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('hud-msg')).fontSize) === '15px', 'discret : petit');
      if (lang === 'en') assert.deepEqual(await frenchLeft(page), [], 'rien de français dans le rappel en anglais');
      const met = Object.entries(await mech(page)).filter(([, v]) => v === 2);
      assert.equal(met.length, 1, 'une mécanique rencontrée, écrite au niveau 2 : ' + JSON.stringify(await mech(page)));
      // un message important coupe le rappel (jamais l'inverse)
      await page.evaluate(() => window.copytrack.ui.hud.message('Hors piste', 1, 3));
      assert.equal((await text(page, '#hud-msg')).trim().replace(/^Off track$/, 'Hors piste'), 'Hors piste');
      assert.equal(await page.evaluate(() => document.getElementById('hud-msg').classList.contains('hint')), false);
      // et un rappel ne passe pas sur un message important en cours
      const refused = await page.evaluate(() => { window.copytrack.ui.hud.message('Piques', 1.5, 3); return window.copytrack.ui.hud.message('Nouveau · test', 4, 0); });
      assert.equal(refused, false, 'le verrou refuse un rappel pendant un message important');
      await page.keyboard.up('ArrowUp');
      await page.keyboard.press('Escape');
      await ctx.close();
    });

    await test(`${lang} : l'index « Mécaniques » du profil — compte, familles, mécaniques cachées, tout traduit`, async () => {
      const { ctx, page } = await device(locale);
      await enter(page);
      await openCard(page, 0);
      await page.evaluate(() => { window.copytrack.profileTab = 'mech'; window.copytrack.showScreen('profile'); });
      await page.waitForSelector('#prog-mech .mech-row');
      const body = await text(page, '#prog-mech');
      assert.match(body, idx);
      assert.match(body, /4 \/ 36/);
      assert.equal(await page.locator('#prog-mech .mech-row:not(.locked)').count(), 4, 'les quatre vues');
      assert.equal(await page.locator('#prog-mech .mech-row.locked').count(), 32, 'les autres restent à découvrir');
      assert.equal(await page.locator('#prog-mech .mech-row.locked').first().evaluate((el) => !el.textContent.includes('Verglas') && !el.textContent.includes('Ice')), true, 'une mécanique non vue ne se dévoile pas');
      if (lang === 'en') assert.deepEqual(await frenchLeft(page), [], 'rien de français dans l\'index en anglais');
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#prof-tabs .tab')].map((t) => t.dataset.ptab)), ['records', 'level', 'stats', 'unlocks', 'mech']);
      await ctx.close();
    });
  }

  await test('profil existant (records sur les deux premiers circuits, aucun champ mech) : migration au premier passage, pas de carte pour ce qui est connu, une carte pour la nouveauté', async () => {
    const { ctx, page } = await device('fr-FR');
    await enter(page);
    await page.evaluate(async () => {
      const a = window.copytrack, { saveRecord } = await import('/js/storage.js'), P = await import('/js/profile.js');
      a.builtins.slice(0, 2).forEach((b) => saveRecord(b.key, { time: b.def.medals.bronze - 0.0001, pv: 39, date: 1 }));
      const p = P.profile(); delete p.mech; p.coins = 123; P.saveProfile();
    });
    await openCard(page, 0);
    assert.equal(await page.locator('#hub-new').isVisible(), false, 'connu : pas de carte');
    await back(page); await openCard(page, 1);
    assert.equal(await page.locator('#hub-new').isVisible(), false);
    await back(page); await openCard(page, 2);
    assert.equal(await page.locator('#hub-new').isVisible(), true, 'le troisième circuit apporte l\'anneau turbo');
    assert.ok((await text(page, '#hub-new')).includes('Anneau turbo'));
    assert.equal(await page.evaluate(async () => (await import('/js/profile.js')).profile().coins), 123, 'le reste du profil est intact');
    await ctx.close();
  });

  await test('un circuit verrouillé ne consomme pas ses cartes (elles restent à découvrir)', async () => {
    const { ctx, page } = await device('fr-FR');
    await enter(page);
    await page.evaluate(() => window.copytrack.openBuiltinHub(40, 'tracks'));
    await page.waitForFunction(() => !document.getElementById('race-hub').classList.contains('hidden'));
    assert.equal(await page.locator('#hub-new').isVisible(), false, 'circuit verrouillé : pas de carte');
    assert.deepEqual(await mech(page), {}, 'rien de consommé');
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
if (!failures && executed < 5) { console.log(`  FAIL seulement ${executed} test(s) exécuté(s) (minimum 5)`); failures++; }
console.log(failures ? `${failures} test(s) en échec` : `Tous les tests navigateur des mécaniques passent (${executed} exécutés)`);
process.exit(failures ? 1 : 0);
