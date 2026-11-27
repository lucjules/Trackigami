// Amorces officielles, rival juste devant et duel contre un fantôme officiel dans un VRAI navigateur (Chromium) : node tools/test-browser-amorces.mjs   (npm run test:browser)
// COMPLETE-010. Le serveur Supabase est simulé (tools/fake-supabase.mjs, option social : official_runs, rival_ahead, classement) ; la VRAIE base est éprouvée par test-etape23-sql.sh.
//   - fiche d'un circuit, visiteur SANS session : les amorces sont glissées dans le classement mondial, étiquetées « Officiel · automatique », sans numéro de place (« hors
//     classement ») ; les places des joueurs restent 1, 2, 3… ; aucune inscription anonyme, aucune commande demandée ; la ligne « pour commencer » propose l'amorce la plus lente ;
//   - 👻 sur une amorce l'ajoute aux rivaux de la fiche, sous son nom « Officiel » ; « Jouer » la met en course ;
//   - avec un record local : « juste devant toi » = le vrai joueur le plus proche devant, sinon l'amorce ;
//   - onglet Saison : les amorces du circuit, « hors classement de la saison » ;
//   - Compétition › Contre un fantôme officiel, sans compte : la course part avec ce fantôme pour rival ;
//   - en anglais : aucun mot de français dans le classement ni dans la section de la compétition.
// Playwright absent : ignoré en local, ÉCHEC en CI ou avec REQUIRE_BROWSER=1.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { srv, resetSocial } from './fake-supabase.mjs';

const fakeFetch = globalThis.fetch;
const require = createRequire(import.meta.url);
let chromium;
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8800 + Math.floor(Math.random() * 90);
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
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'retry-after, content-range' };
const supabase = async (route) => {
  const req = route.request(), h = req.headers();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const r = await fakeFetch(req.url(), { method: req.method(), headers: { Authorization: h.authorization, apikey: h.apikey, Prefer: h.prefer, Range: h.range }, body: req.postData() || undefined });
  const headers = { ...CORS, 'content-type': 'application/json' };
  const cr = r.headers.get('content-range'); if (cr) headers['content-range'] = cr;
  await route.fulfill({ status: r.status, headers, body: await r.text() });
};
async function device(locale = 'fr-FR', init = null) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/supabase\.co/, supabase);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  return { ctx, page };
}
const click = (page, sel) => page.locator(sel).first().evaluate((el) => el.click());
const menu = (page) => page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000 });
const guest = async (page, name = 'Visiteur') => { await page.locator('#wl-name').fill(name); await click(page, '#wl-submit'); await menu(page); };
// Les textes restés en français dans un morceau de la page (même logique que tools/test-browser-i18n.mjs).
const frenchLeft = (page, sel) => page.evaluate(async (sel) => {
  const { looksFrench } = await import('/js/i18n.js');
  const { isInlineContainer, TRANSLATED_ATTRS } = await import('/js/i18n/dom.js');
  const out = [];
  const walk = (el) => {
    if (/^(SCRIPT|STYLE|TEXTAREA|CANVAS|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName) || el.getAttribute('data-i18n') === 'off') return;
    for (const a of TRANSLATED_ATTRS) { const v = el.getAttribute(a); if (v && looksFrench(v)) out.push(a + ' : ' + v); }
    if (isInlineContainer(el)) { if (looksFrench(el.textContent)) out.push(el.innerHTML.replace(/\s+/g, ' ').trim()); return; }
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { const t = c.nodeValue.replace(/\s+/g, ' ').trim(); if (t && /[A-Za-zÀ-ÿ]/.test(t) && looksFrench(t)) out.push(t); }
      else if (c.nodeType === 1) walk(c);
    }
  };
  for (const el of document.querySelectorAll(sel)) walk(el);
  return out;
}, sel);

const K = 'b-eclats-1ocqc5y';
const LEVELS = [['cristal', 45.8], ['or', 48.108], ['argent', 55.4], ['bronze', 65.008]];
const officialsFor = (key) => LEVELS.map(([level, time]) => ({ track_key: key, source: 'auto', level, time, ghost: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ghost_veh: [] }));
const SCORES = [
  { track_key: K, player: 'p-dave', name: 'Dave', time: 47, ghost: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', updated_at: '2026-11-15T10:00:00Z' },
  { track_key: K, player: 'p-bob', name: 'Bob', time: 50, ghost: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', updated_at: '2026-11-24T10:00:00Z' },
  { track_key: K, player: 'p-carl', name: 'Carl', time: 60, ghost: null, updated_at: '2026-11-24T10:00:00Z' },
];
const boardReady = (page) => page.waitForFunction(() => { const b = document.querySelector('#hub-board .lb-body'); return b && !/Chargement|Loading/.test(b.textContent) && document.querySelector('#hub-board .lb-ahead:not(.hidden)'); }, null, { timeout: 15000 });
const openHub = async (page, key) => {
  await page.evaluate((key) => { const a = window.copytrack, i = a.builtins.findIndex((b) => b.key === key); a.openBuiltinHub(i, 'tracks'); }, key);
  await page.waitForSelector('#race-hub:not(.hidden)', { timeout: 10000 });
};
const rowsOf = (page) => page.locator('#hub-board .board li').evaluateAll((ls) => ls.map((l) => ({ off: l.classList.contains('lb-official'), rank: l.querySelector('b').textContent.trim(), text: l.textContent.replace(/\s+/g, ' ').trim() })));

try {
  console.log('Fiche d’un circuit, sans session');
  await test('les amorces sont dans le classement, étiquetées « Officiel · automatique », hors classement ; les places des joueurs restent 1, 2, 3 ; aucun joueur anonyme créé', async () => {
    resetSocial({ scores: SCORES, officials: officialsFor(K) }); srv.calls.length = 0;
    const { ctx, page } = await device();
    await guest(page);
    await openHub(page, K);
    await boardReady(page);
    const rows = await rowsOf(page);
    assert.deepEqual(rows.map((r) => (r.off ? 'O' : r.rank)), ['O', '1', 'O', '2', 'O', '3', 'O'], 'ordre des temps : cristal 45,8, Dave 47, or 48,1, Bob 50, argent 55,4, Carl 60, bronze 65');
    for (const r of rows.filter((x) => x.off)) { assert.match(r.text, /Officiel · automatique \((cristal|or|argent|bronze)\)/); assert.match(r.text, /hors classement/); }
    assert.match(rows[0].text, /Officiel · automatique \(cristal\)/);
    assert.ok(rows.filter((x) => !x.off).every((r) => !/Officiel/.test(r.text)));
    assert.match(await page.locator('#hub-board .lb-official-note').innerText(), /ne prennent la place de personne/);
    assert.match(await page.locator('#hub-board .lb-ahead').innerText(), /Pour commencer.*Officiel · automatique \(bronze\)/s, 'sans temps : l’amorce la plus lente');
    assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0, 'aucune inscription anonyme');
    assert.ok(srv.social.calls.every((c) => !c.auth), 'aucune requête avec session');
    assert.ok(srv.social.calls.every((c) => !/inputs/.test(c.query || '')), 'les commandes ne sont jamais demandées');
    // 👻 sur l'amorce « or » : elle rejoint les rivaux de la fiche, sous son nom
    await page.locator('#hub-board .rival-btn[data-off="auto:or"]').evaluate((el) => el.click());
    await page.waitForFunction(() => /Officiel · automatique \(or\)/.test(document.getElementById('hub-launch').textContent), null, { timeout: 10000 });
    assert.match(await page.locator('#hub-launch .chip.rival').innerText(), /Officiel · automatique \(or\).*0:48|Officiel · automatique \(or\).*48/s);
    await click(page, '#hub-play');
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.rivals && window.copytrack.session.rivals.length === 1, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.copytrack.session.rivals[0].name), 'Officiel · automatique (or)', 'en course, le fantôme porte l’étiquette « Officiel »');
    await ctx.close();
  });

  await test('avec un record local : « juste devant toi » est le vrai joueur le plus proche devant (Bob, place 2) ; plus rapide que tous les joueurs : l’amorce juste devant', async () => {
    resetSocial({ scores: SCORES, officials: officialsFor(K) });
    const { ctx, page } = await device();
    await guest(page);
    const setRec = (t) => page.evaluate(async ({ K, t }) => { const st = await import('/js/storage.js'); const { PHYS_VER } = await import('/js/version.js'); st.saveRecord(K, { time: t, splits: [], ghost: null, inputs: 'AAAA', pv: PHYS_VER, date: Date.now(), name: 'Visiteur' }); }, { K, t });
    await setRec(52);
    await openHub(page, K); await boardReady(page);
    let t = await page.locator('#hub-board .lb-ahead').innerText();
    assert.match(t, /Juste devant toi.*Bob.*place 2/s, t);
    await page.evaluate(() => window.copytrack.closeRaceHub());
    await setRec(46.5);
    await openHub(page, K); await boardReady(page);
    t = await page.locator('#hub-board .lb-ahead').innerText();
    assert.match(t, /Juste devant toi.*Officiel · automatique \(cristal\)/s, 'plus rapide que Dave : personne devant parmi les joueurs, l’amorce cristal');
    assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0);
    await ctx.close();
  });

  await test('onglet Saison : les amorces du circuit, « hors classement de la saison », avec 👻', async () => {
    const { ctx, page } = await device();
    const info = await (async () => { await guest(page); return page.evaluate(async () => { const S = await import('/js/seasons.js'); const n = S.seasonOf(Date.now()); const d = S.seasonTracks(n)[0]; const a = window.copytrack; const i = a.builtins.findIndex((b) => b.def.id === d.id); return { n, i, key: a.builtins[i].key }; }); })();
    resetSocial({ scores: [], officials: officialsFor(info.key) });
    await page.evaluate(({ i, n }) => window.copytrack.openSeasonHub(i, n, 'tracks'), info);
    await page.waitForSelector('#hub-board .lb-season-off li.lb-official', { timeout: 15000 });
    const txt = await page.locator('#hub-board .lb-season-off').innerText();
    assert.match(txt, /Contre un fantôme officiel/); assert.match(txt, /hors classement de la saison/); assert.match(txt, /ne comptent ni dans les points ni dans les divisions/);
    assert.equal(await page.locator('#hub-board .lb-season-off .rival-btn').count(), 4);
    await ctx.close();
  });

  console.log('Compétition › Contre un fantôme officiel');
  await test('sans compte : la section est là ; « Courir » lance le circuit avec le fantôme officiel choisi pour rival', async () => {
    resetSocial({ scores: [], officials: officialsFor(K) });
    const { ctx, page } = await device();
    await guest(page);
    await page.evaluate(() => window.copytrack.competitionMenu());
    await page.waitForSelector('#modal-body .comp-official form', { timeout: 10000 });
    assert.match(await page.locator('#modal-body').innerText(), /demandent un compte/);
    await page.locator('#modal-body .off-track').selectOption(K);
    await page.locator('#modal-body .off-level').selectOption('cristal');
    await click(page, '#modal-body .off-duel button');
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.rivals && window.copytrack.session.rivals.length === 1, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.copytrack.session.rivals[0].name), 'Officiel · automatique (cristal)');
    assert.equal(await page.evaluate(() => window.copytrack.session.trackKey), K, 'la course ordinaire du circuit (aucune catégorie de duel)');
    assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0);
    await ctx.close();
  });
  await test('étape 23 absente : pas d’amorce, un message clair au lieu d’une course', async () => {
    srv.social = null;
    const { ctx, page } = await device();
    await guest(page);
    await page.evaluate(() => window.copytrack.competitionMenu());
    await page.waitForSelector('#modal-body .comp-official form', { timeout: 10000 });
    await click(page, '#modal-body .off-duel button');
    await page.waitForFunction(() => /Pas encore de fantôme officiel/.test(document.querySelector('#modal-body .off-err').textContent), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.copytrack.mode), 'menu');
    await ctx.close();
  });

  console.log('Anglais');
  await test('en anglais : classement avec amorces, ligne « juste devant », section de la compétition, sans un mot de français', async () => {
    resetSocial({ scores: SCORES, officials: officialsFor(K) });
    const { ctx, page } = await device('en-GB');
    await guest(page);
    await openHub(page, K); await boardReady(page);
    await page.waitForTimeout(300);
    assert.deepEqual(await frenchLeft(page, '#hub-board'), []);
    assert.match(await page.locator('#hub-board').innerText(), /Official · autopilot \(gold\)/);
    assert.match(await page.locator('#hub-board').innerText(), /not ranked/);
    await page.evaluate(() => window.copytrack.closeRaceHub());
    await page.evaluate(() => window.copytrack.competitionMenu());
    await page.waitForSelector('#modal-body .comp-official form', { timeout: 10000 });
    await page.waitForTimeout(300);
    assert.deepEqual(await frenchLeft(page, '#modal-body .comp-official'), []);
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests du navigateur (amorces officielles) passent.');
