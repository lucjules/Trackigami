// Copie d'un circuit officiel dans l'éditeur (COMPLETE-019) dans un vrai navigateur : node tools/test-browser-copie-officiel.mjs   (npm run test:browser)
// Fiche d'un circuit de la carrière › « Copier dans l'éditeur » : l'éditeur s'ouvre sur une COPIE (« Mes circuits », clé u-… propre, mention « Dérivé de … »), l'original et son
// classement ne bougent pas ; la copie non modifiée ne se publie pas ; en anglais, le bouton n'a aucun reste de français. Playwright absent : ignoré (ÉCHEC en CI / REQUIRE_BROWSER=1).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9000 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

let failures = 0;
const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
async function test(name, fn) {
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 8).join('\n       ')); }
}
async function device(locale = 'fr-FR') {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  await page.locator('#wl-name').fill('Copiste');
  await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); });
  await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 3000, polling: 50 }).catch(() => {});
  await page.evaluate(() => window.copytrack.ui.closeModal());
  return { ctx, page };
}

try {
  await test('fiche d’un circuit officiel › Copier dans l’éditeur : une copie dans « Mes circuits », ouverte dans l’éditeur ; l’original est inchangé', async () => {
    const { ctx, page } = await device();
    const before = await page.evaluate(() => { const A = window.copytrack, b = A.builtins[1]; return { key: b.key, enc: b.track.encode(), name: b.track.name }; });
    await page.evaluate(() => window.copytrack.openBuiltinHub(1, 'tracks'));
    await page.waitForSelector('[data-hub="copy"]', { timeout: 10000 });
    await page.locator('[data-hub="copy"]').evaluate((el) => el.click());
    await page.waitForFunction(() => window.copytrack.mode === 'editor', null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
      const A = window.copytrack, { listMyTracks } = await import('/js/storage.js'), { Track } = await import('/js/track.js');
      const ed = A.session, mine = listMyTracks();
      return { n: mine.length, name: mine[0] && mine[0].name, entryOk: !!ed.entryId && mine[0].id === ed.entryId, desc: ed.track.desc, key: ed.track.userKey, edName: ed.track.name, tiles: ed.track.tiles.length, ok: !!Track.decode(mine[0].code), author: ed.track.author };
    });
    assert.equal(r.n, 1); assert.equal(r.name, `${before.name} (copie)`); assert.ok(r.entryOk);
    assert.equal(r.desc, `Dérivé de « ${before.name} » (circuit officiel) `.trim()); assert.match(r.key, /^u-/); assert.notEqual(r.key, before.key); assert.equal(r.author, '');
    const after = await page.evaluate(() => { const b = window.copytrack.builtins[1]; return { key: b.key, enc: b.track.encode() }; });
    assert.deepEqual(after, { key: before.key, enc: before.enc }, 'le circuit officiel et sa clé n’ont pas bougé');
    await ctx.close();
  });
  await test('une copie non modifiée vérifiée ne se publie pas (message clair, aucune fenêtre de publication)', async () => {
    const { ctx, page } = await device();
    const res = await page.evaluate(async () => {
      const A = window.copytrack, { officialCopy } = await import('/js/officialCopy.js');
      const c = officialCopy(A.builtins[1].track); c.setVerified(30);
      const out = await A.publishTrack(c);
      return { out, modal: A.ui.modalOpen };
    });
    assert.equal(res.out, false); assert.equal(res.modal, false);
    await ctx.close();
  });
  await test('anglais : le bouton de la fiche n’a aucun reste de français', async () => {
    const { ctx, page } = await device('en-GB');
    await page.evaluate(() => window.copytrack.openBuiltinHub(1, 'tracks'));
    await page.waitForSelector('[data-hub="copy"]', { timeout: 10000 });
    await page.waitForTimeout(300);
    const t = await page.locator('[data-hub="copy"]').evaluate((el) => ({ text: el.textContent, title: el.title }));
    assert.equal(t.text, '✎ Copy to the editor'); assert.match(t.title, /editable copy/);
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests du navigateur (copie d’un circuit officiel) passent.');
