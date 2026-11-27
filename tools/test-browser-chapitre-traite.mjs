// Épreuve « chapitre d'une traite » (COMPLETE-014) dans un vrai navigateur : node tools/test-browser-chapitre-traite.mjs   (npm run test:browser)
//
// Le chapitre 14 (« Grandes Manœuvres », le plus court) est couru EN DIRECT dans Chromium, manche après manche, par le pilote automatique du jeu branché sur input.drive() (le vrai
// _input() de la session, les commandes enregistrées comme celles d'un joueur) ; les images sont avancées par RaceSession.update (dt = 0,1 s). On vérifie :
//   - le bouton « D'une traite » n'apparaît que sur un chapitre ouvert ; la fenêtre de départ ; l'entracte entre les manches ; la touche T (« recommencer ») qui remet TOUT
//     l'enchaînement à la manche 1 ; la fin : record local `rec3.ch-…` (chain: true), bilan, envoi au serveur (action submit-chain) ;
//   - côté Node (un autre moteur que la page, comme le serveur) : la soumission capturée est rejouée par verifyChain, la vérification du serveur, qui la confirme au temps près ;
//   - les manches n'ont rien écrit pour leurs circuits (ni record, ni pièces) ;
//   - en anglais : la fenêtre de départ et le bouton n'ont aucun reste de français.
// Playwright absent : test ignoré en local, ÉCHEC en CI ou avec REQUIRE_BROWSER=1 (comme les autres tests navigateur).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import './fake-supabase.mjs';
import { verifyChain } from '../js/verify.js';
import { chainKey } from '../js/chain.js';
import { PHYS_VER } from '../js/version.js';

const fakeFetch = globalThis.fetch;
const require = createRequire(import.meta.url);
let chromium;
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

let failures = 0;
const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED|status of 40[0-9]|status of 50[0-9]/;
async function test(name, fn) {
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 8).join('\n       ')); }
}

// Supabase simulé (tools/fake-supabase.mjs) ; l'action submit-chain est jugée par la VRAIE vérification du serveur (verifyChain), et la soumission est gardée pour le test.
const chainPosts = [];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'retry-after, content-range' };
const supabase = async (route) => {
  const req = route.request(), h = req.headers();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (req.url().includes('/functions/v1/submit-score') && req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    if (body.action === 'submit-chain') {
      chainPosts.push(body);
      const v = verifyChain(body);
      return route.fulfill({ status: v.ok ? 200 : 422, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(v.ok ? { ok: true, improved: true, best: v.time, rank: 1, total: 1 } : { error: v.error }) });
    }
  }
  const r = await fakeFetch(req.url(), { method: req.method(), headers: { Authorization: h.authorization, apikey: h.apikey, Prefer: h.prefer, Range: h.range }, body: req.postData() || undefined });
  const headers = { ...CORS, 'content-type': 'application/json' };
  const cr = r.headers.get('content-range'); if (cr) headers['content-range'] = cr;
  await route.fulfill({ status: r.status, headers, body: await r.text() });
};
async function device(locale = 'fr-FR') {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/supabase\.co/, supabase);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  await page.locator('#wl-name').fill('Traite');
  await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); });
  await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 3000, polling: 50 }).catch(() => {});
  await page.evaluate(() => window.copytrack.ui.closeModal());
  return { ctx, page };
}
const frenchLeft = (page, sel) => page.evaluate(async (sel) => {
  const { looksFrench } = await import('/js/i18n.js');
  const out = [];
  for (const root of document.querySelectorAll(sel)) {
    const w = document.createTreeWalker(root, 4);      // (4 : NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) { const s = n.nodeValue.trim(); if (s && looksFrench(s) && n.parentElement.offsetParent !== null) out.push(s); }
    for (const el of root.querySelectorAll('[title]')) if (looksFrench(el.title)) out.push('title: ' + el.title);
  }
  return out;
}, sel);

// La session de course est « tenue » (la boucle du jeu ne l'avance plus) ; le test l'avance par update(0,1 s), et le pilote automatique fournit les commandes.
async function hold(page) {
  await page.evaluate(async () => {
    const A = window.copytrack;
    const [{ RaceSession }, { Autopilot }] = await Promise.all([import('/js/race.js'), import('/js/autopilot.js')]);
    window.__ch = { hold: true, Autopilot };
    const proto = RaceSession.prototype;
    if (!proto.__real) {
      proto.__real = proto.update;
      proto.update = function (dt) { if (window.__ch && window.__ch.hold && this === A.session && !this.demo) return undefined; return proto.__real.call(this, dt); };
    }
    let bot = null, forS = null;
    A.input.drive = () => {
      const S = A.session;
      if (!S || S.state !== 'racing') return { steer: 0, throttle: false, brake: false, drift: false };
      if (forS !== S || S.__botReset) { forS = S; S.__botReset = false; bot = new window.__ch.Autopilot(S.track.path, { latLimit: 56 * 0.8 }); bot.reset(S.phys); }
      return bot.control(S.phys);
    };
  });
}
const advance = (page, maxCalls = 6000, untilTick = Infinity) => page.evaluate(({ maxCalls, untilTick }) => {
  const S = window.copytrack.session;
  for (let i = 0; i < maxCalls && S.state !== 'finished' && !(S.state === 'racing' && S.tick >= untilTick); i++) S.constructor.prototype.__real.call(S, 0.1);
  return { state: S.state, tick: S.tick, leg: S.opts.chainLeg };
}, { maxCalls, untilTick });
const sessionLeg = (page) => page.evaluate(() => { const S = window.copytrack.session; return S && S.opts && S.opts.chain ? S.opts.chainLeg : null; });

try {
  await test('carrière : le bouton « D’une traite » n’apparaît que sur un chapitre ouvert et complet', async () => {
    const { ctx, page } = await device();
    await page.evaluate(() => window.copytrack.showMenu('tracks'));
    await page.waitForSelector('.chain-btn', { timeout: 10000 });
    const shown = await page.evaluate(() => [...document.querySelectorAll('.chain-btn')].map((b) => +b.dataset.chain));
    assert.deepEqual(shown, [0], 'nouveau joueur : seul le chapitre 1 est ouvert');
    await page.evaluate(() => window.copytrack.chainMenu(1));            // chapitre fermé : refusé (même raison que la carrière)
    assert.equal(await page.evaluate(() => window.copytrack.ui.modalOpen), false);
    await ctx.close();
  });

  await test('chapitre 14 couru en direct : entracte, T recommence tout, 6 manches, record, envoi rejoué et confirmé par la vérification du serveur', async () => {
    const { ctx, page } = await device();
    await page.evaluate(async () => {
      const { profile, saveProfile } = await import('/js/profile.js');
      profile().eggs = { ...(profile().eggs || {}), unlockAll: true }; saveProfile();
      window.__coins0 = profile().coins;
      window.copytrack.showMenu('tracks');
    });
    await page.waitForSelector('.chain-btn[data-chain="13"]', { timeout: 10000 });
    await page.locator('.chain-btn[data-chain="13"]').evaluate((el) => el.click());
    await page.waitForSelector('[data-chain-go]', { timeout: 5000 });
    assert.match(await page.locator('#modal-body').innerText(), /Relais|Balade/);
    await hold(page);
    await page.locator('[data-chain-go]').evaluate((el) => el.click());
    await page.waitForFunction(() => { const S = window.copytrack.session; return S && S.opts && S.opts.chain && S.opts.chainLeg === 0; }, null, { timeout: 15000 });
    // Manche 1 courue jusqu'au bout, puis début de la manche 2, et la vraie touche T (« recommencer ») : retour à la manche 1, temps à zéro.
    let r = await advance(page);
    assert.equal(r.state, 'finished');
    await page.waitForSelector('[data-chain-next]', { timeout: 5000 });
    assert.match(await page.locator('#modal-title').innerText(), /Manche 1\/6 terminée/);
    await page.locator('[data-chain-next]').evaluate((el) => el.click());
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.opts.chainLeg === 1, null, { timeout: 15000 });
    await advance(page, 400, 300);
    await page.evaluate(() => { window.__ch.hold = false; });
    await page.keyboard.press('KeyT');
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.opts.chainLeg === 0, null, { timeout: 15000 });
    await page.evaluate(() => { window.__ch.hold = true; });
    assert.equal(await page.evaluate(() => window.copytrack._chain.leg), 0, 'T : l’enchaînement repart de la manche 1');
    // Les 6 manches, d'une traite.
    for (let n = 0; n < 6; n++) {
      assert.equal(await sessionLeg(page), n);
      r = await advance(page);
      assert.equal(r.state, 'finished', 'manche ' + (n + 1) + ' finie');
      if (n < 5) {
        await page.waitForSelector('[data-chain-next]', { timeout: 5000 });
        assert.match(await page.locator('#modal-body').innerText(), /Temps cumulé/);
        await page.locator('[data-chain-next]').evaluate((el) => el.click());
        await page.waitForFunction((k) => window.copytrack.session && window.copytrack.session.opts.chainLeg === k, n + 1, { timeout: 15000 });
      }
    }
    await page.waitForFunction(() => /nouveau record/.test(document.getElementById('modal-body').innerText), null, { timeout: 5000 });
    await page.waitForFunction(() => /Classement de l’enchaînement : 1 sur 1/.test(document.getElementById('modal-body').innerText), null, { timeout: 10000 });
    const key = chainKey(13);
    const local = await page.evaluate(async (key) => {
      const { getRecord } = await import('/js/storage.js');
      const { profile } = await import('/js/profile.js');
      const A = window.copytrack, idx = A._chain.indexes;
      return { rec: getRecord(key), legRecs: idx.map((i) => getRecord(A.builtins[i].key)), coins: profile().coins, coins0: window.__coins0, medals: idx.map((i) => profile().medals[A.builtins[i].key] ?? null) };
    }, key);
    assert.ok(local.rec && local.rec.chain === true && local.rec.pv === PHYS_VER, 'record local de l’enchaînement');
    assert.equal(local.rec.splits.length, 6);
    assert.deepEqual(local.legRecs, [null, null, null, null, null, null], 'aucun record par circuit');
    assert.deepEqual(local.medals, [null, null, null, null, null, null], 'aucune médaille');
    assert.equal(local.coins, local.coins0, 'aucune pièce');
    assert.equal(chainPosts.length, 1, 'une seule soumission');
    const sub = chainPosts[0];
    assert.equal(sub.trackKey, key);
    assert.equal(sub.legs.length, 6);
    const v = verifyChain(sub);
    assert.equal(v.ok, true, v.error);
    assert.equal(v.time, local.rec.time, 'le serveur retrouve EXACTEMENT le temps du jeu');
    assert.deepEqual(v.splits, local.rec.splits);
    await ctx.close();
  });

  await test('anglais : bouton, fenêtre de départ, entracte et bilan sans reste de français', async () => {
    const { ctx, page } = await device('en-GB');
    await page.evaluate(() => window.copytrack.showMenu('tracks'));
    await page.waitForSelector('.chain-btn', { timeout: 10000 });
    await page.waitForTimeout(300);
    assert.deepEqual(await frenchLeft(page, '.chapter-head'), []);
    await page.evaluate(() => window.copytrack.chainMenu(0));
    await page.waitForSelector('[data-chain-go]', { timeout: 5000 });
    await page.waitForTimeout(300);
    assert.deepEqual(await frenchLeft(page, '#modal'), []);
    // Entracte et bilan (textes seulement : manches simulées, envoi en ligne coupé ; la course réelle est vérifiée plus haut, en français).
    await page.evaluate(() => {
      const A = window.copytrack;
      A.ui.closeModal();
      A.settings.onlineScores = false;
      A._chain = A._newChain(0);
      A.__fake = { opts: { chain: A._chain }, recorder: { encode: () => 'AAAA' } };
      A.onChainLegFinished(A.__fake, 50);
    });
    await page.waitForSelector('[data-chain-next]', { timeout: 5000 });
    await page.waitForTimeout(300);
    assert.deepEqual(await frenchLeft(page, '#modal'), []);
    assert.match(await page.locator('#modal-title').innerText(), /Leg 1\/6 done/);
    await page.evaluate(() => { const A = window.copytrack; for (let i = 1; i < 6; i++) { A.ui.closeModal(); A.onChainLegFinished(A.__fake, 50 + i); } });
    await page.waitForFunction(() => /in one go/.test(document.getElementById('modal-title').innerText), null, { timeout: 5000 });
    await page.waitForTimeout(300);
    assert.deepEqual(await frenchLeft(page, '#modal'), []);
    assert.match(await page.locator('#modal-body').innerText(), /new record!/);
    // Boîte de réception : « ton temps a été battu » sur un enchaînement mène à son classement dédié.
    const label = await page.evaluate((k) => { const A = window.copytrack; A.ui.closeModal(); const a = A._inboxAction({ kind: 'beaten', trackKey: k }); if (a) a.run(); return a && a.label; }, chainKey(0));
    assert.equal(label, 'Voir le classement');
    await page.waitForFunction(() => /🏆 Chapter 1 · .* · in one go/.test(document.getElementById('modal-title').innerText), null, { timeout: 5000 });
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests du navigateur (chapitre d’une traite) passent.');
