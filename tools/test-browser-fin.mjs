// Fin de carrière (COMPLETE-013) dans un vrai navigateur (Chromium sans écran) : node tools/test-browser-fin.mjs   (npm run test:browser)
//   • épreuve finale annoncée quand il ne reste qu'elle ; aucune conclusion avant la dernière médaille ;
//   • carrière terminée : la conclusion s'ouvre d'elle-même UNE fois (écran des circuits), puis se rouvre à la demande ; le message « plus rien à finir » n'existe plus ;
//   • bilan affiché = calcul indépendant fait ici à partir des seuils des circuits ; en français ET en anglais ; aucune requête réseau pour l'afficher ;
//   • animations réduites : le générique ne défile pas.
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
const PORT = 9990 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

const errors = [], requests = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
page.on('request', (r) => { if (!r.url().startsWith(`http://127.0.0.1:${PORT}/`) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.locator('#wl-name').fill('Essai');
await page.locator('#wl-submit').evaluate((el) => el.click());
await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
await page.waitForTimeout(900);
await page.evaluate(() => window.copytrack.ui.closeModal());

// Écrit les records et objectifs voulus : tier(i) ∈ null | 'cristal' | 'or' | 'argent' | 'bronze' ; goal(i) booléen. Les seuils sont ceux de chaque circuit.
const seed = (tiers, goalsFn) => page.evaluate(async ({ tiers, goals }) => {
  const S = await import('/js/storage.js'), P = await import('/js/profile.js'), V = await import('/js/version.js');
  const A = window.copytrack, p = P.profile();
  p.goals = {}; delete p.endSeen;
  A.builtins.forEach((b, i) => {
    const t = tiers[i];
    if (t) S.saveRecord(b.key, { time: b.def.medals[t] - 0.123, date: Date.now(), pv: V.PHYS_VER, ghost: null, inputs: null });
    if (goals[i]) p.goals[b.key + '#goal'] = 1;
  });
  P.saveProfile();
}, { tiers, goals: tiers.map((_, i) => !!goalsFn(i)) });
const N = await page.evaluate(() => window.copytrack.builtins.length);
const FIN = await page.evaluate(() => window.copytrack.builtins.findIndex((b) => b.def.id === 'finale'));
const medals = await page.evaluate(() => window.copytrack.builtins.map((b) => b.def.medals));
const poll = { timeout: 15000, polling: 100 };
const txt = (sel) => page.locator(sel).first().innerText();
const modalOpen = () => page.evaluate(() => !document.getElementById('modal').classList.contains('hidden'));
const closeModal = () => page.evaluate(() => window.copytrack.ui.closeModal());
const resetRecords = () => page.evaluate(async () => { (await import('/js/storage.js')).clearRecords(); });

console.log('Épreuve finale et conclusion');
await test('il ne reste que l’épreuve finale : elle est annoncée sur l’écran des circuits, la conclusion n’est pas ouverte', async () => {
  await resetRecords();
  await seed(Array.from({ length: N }, (_, i) => (i === FIN ? null : 'bronze')), () => false);
  await page.evaluate(() => window.copytrack.showScreen('tracks'));
  await page.waitForSelector('#track-list .career-end [data-finale]', poll);
  assert.equal(await page.locator('#track-list .career-end [data-finale]').getAttribute('data-finale'), String(FIN));
  assert.match(await txt('#track-list .career-end'), /Épreuve finale/);
  await page.waitForTimeout(700);
  assert.equal(await modalOpen(), false, 'pas de conclusion avant la dernière médaille');
  assert.equal(await page.locator('#track-list .career-end [data-ending]').count(), 0);
});
await test('une carrière à moitié faite : ni épreuve finale annoncée, ni conclusion', async () => {
  await resetRecords();
  await seed(Array.from({ length: N }, (_, i) => (i < N / 2 ? 'or' : null)), () => false);
  await page.evaluate(() => window.copytrack.showScreen('tracks'));
  await page.waitForSelector('#track-list .career-summary', poll);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#track-list .career-end').count(), 0);
  assert.equal(await modalOpen(), false);
});

// Profil de la carrière terminée : tiers variés, objectifs sur un circuit sur trois.
const tiersFini = Array.from({ length: N }, (_, i) => ['bronze', 'argent', 'or', 'cristal'][i % 4]);
const goalsFini = (i) => i % 3 === 0;
// Calcul indépendant du bilan attendu.
const expected = (tiers, goalsOf) => {
  const m = { cristal: 0, or: 0, argent: 0, bronze: 0 }; let time = 0, goals = 0;
  tiers.forEach((t, i) => { m[t]++; time += medals[i][t] - 0.123; if (goalsOf(i)) goals++; });
  return { m, time, goals };
};
const span = (s, en) => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, sec = (ms % 60000) / 1000; const st = (h || mi ? sec.toFixed(3).padStart(6, '0') : sec.toFixed(3)).replace('.', en ? '.' : ','); return `${h ? h + ' h ' : ''}${h || mi ? String(mi).padStart(h ? 2 : 1, '0') + ' min ' : ''}${st} s`; };
const rows = async () => { const r = {}; const cells = await page.locator('.ending-page .end-bilan > *').allInnerTexts(); for (let i = 0; i < cells.length; i += 2) r[cells[i]] = cells[i + 1]; return r; };

await test('carrière terminée : la conclusion s’ouvre d’elle-même UNE fois, avec le bilan exact (français)', async () => {
  await resetRecords();
  await seed(tiersFini, goalsFini);
  const net0 = requests.length;
  await page.evaluate(() => window.copytrack.showScreen('tracks'));
  await page.waitForSelector('.ending-page', poll);
  const e = expected(tiersFini, goalsFini), r = await rows();
  assert.equal(await txt('#modal-title'), 'Carrière terminée');
  assert.equal(r['Circuits terminés'], `${N} / ${N}`);
  assert.equal(r['Médailles de cristal'], String(e.m.cristal));
  assert.equal(r['Médailles d’or'], String(e.m.or));
  assert.equal(r['Médailles d’argent'], String(e.m.argent));
  assert.equal(r['Médailles de bronze'], String(e.m.bronze));
  assert.equal(r['Temps du pilote automatique battus'], `${e.m.cristal + e.m.or} / ${N}`);
  assert.equal(r['Objectifs bonus réussis'], `${e.goals} / ${N}`);
  assert.equal(r['Temps cumulé de tes meilleurs temps'], span(e.time, false));
  assert.match(await txt('.ending-page .end-finale'), /Grande Finale/);
  assert.match(await txt('.end-credits'), new RegExp(`${N} circuits officiels en \\d+ chapitres`));
  assert.equal(requests.length, net0, 'aucune requête hors de l’hôte du jeu pour l’afficher : ' + requests.slice(net0).join(', '));
  assert.ok(!/plus rien à finir/.test(await page.evaluate(() => document.body.innerText)));
});
await test('fermée, la conclusion ne se rouvre pas d’elle-même ; un bouton la rouvre ; le champ endSeen est écrit une fois', async () => {
  const at = await page.evaluate(async () => (await import('/js/profile.js')).profile().endSeen);
  assert.ok(at > 0);
  await closeModal();
  await page.evaluate(() => window.copytrack.showScreen('tracks'));
  await page.waitForSelector('#track-list .career-end [data-ending]', poll);
  await page.waitForTimeout(800);
  assert.equal(await modalOpen(), false, 'pas de seconde ouverture automatique');
  assert.equal(await page.evaluate(async () => (await import('/js/profile.js')).profile().endSeen), at, 'la date de la première vue est gardée');
  await page.locator('#track-list .career-end [data-ending]').click();
  await page.waitForSelector('.ending-page', poll);
  assert.equal(await page.evaluate(async () => (await import('/js/profile.js')).profile().endSeen), at);
  await closeModal();
});
await test('rejouable depuis la Progression (Records et médailles)', async () => {
  await page.evaluate(() => { window.copytrack.profileTab = 'records'; window.copytrack.showScreen('records'); });
  await page.waitForSelector('#prog-records [data-ending]', poll);
  await page.locator('#prog-records [data-ending]').click();
  await page.waitForSelector('.ending-page', poll);
  await closeModal();
});
await test('anglais : mêmes nombres, textes traduits, temps cumulé avec le point décimal', async () => {
  await page.evaluate(async () => { (await import('/js/i18n/boot.js')).switchLanguage('en', { persist: false }); });
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.evaluate(() => { window.copytrack.showScreen('tracks'); });
  await page.waitForSelector('#track-list .career-end [data-ending]', poll);
  await page.locator('#track-list .career-end [data-ending]').click();
  await page.waitForSelector('.ending-page', poll);
  await page.waitForTimeout(300);
  const e = expected(tiersFini, goalsFini), r = await rows();
  assert.equal(await txt('#modal-title'), 'Career finished');
  assert.equal(r['Tracks finished'], `${N} / ${N}`);
  assert.equal(r['Crystal medals'], String(e.m.cristal));
  assert.equal(r['Gold medals'], String(e.m.or));
  assert.equal(r['Silver medals'], String(e.m.argent));
  assert.equal(r['Bronze medals'], String(e.m.bronze));
  assert.equal(r['Autopilot times beaten'], `${e.m.cristal + e.m.or} / ${N}`);
  assert.equal(r['Total of your best times'], span(e.time, true));
  assert.match(await txt('.ending-page .end-finale'), /Final trial/);
  assert.match(await txt('.end-credits'), new RegExp(`${N} official tracks in \\d+ chapters`));
  assert.match(await txt('.end-credits'), /Thanks for playing/);
  const left = await page.locator('.ending-page').evaluate((el) => el.innerText.match(/Épreuve|Médailles|Générique|Bilan/g));
  assert.equal(left, null, 'aucun libellé français resté');
  await closeModal();
});
await test('carrière complète (cristaux et objectifs partout) : titre et message « complète », sans « plus rien à finir »', async () => {
  await page.evaluate(async () => { (await import('/js/i18n/boot.js')).switchLanguage('fr', { persist: false }); });
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  await resetRecords();
  await seed(Array.from({ length: N }, () => 'cristal'), () => true);
  await page.evaluate(() => window.copytrack.showScreen('tracks'));
  await page.waitForSelector('.ending-page.complete', poll);
  assert.equal(await txt('#modal-title'), 'Carrière complète');
  const r = await rows();
  assert.equal(r['Médailles de cristal'], String(N)); assert.equal(r['Objectifs bonus réussis'], `${N} / ${N}`);
  await closeModal();
  assert.match(await txt('#track-list .career-summary .cs-msg'), /Carrière complète : \d+ cristaux et \d+ objectifs\. Bravo/);
});
await test('animations réduites : le générique ne défile pas ; animations normales : il défile', async () => {
  const anim = () => page.locator('.end-credits .roll').evaluate((el) => getComputedStyle(el).animationName);
  await page.evaluate(() => { const A = window.copytrack; A.settings.reduceMotion = 'off'; A._applyAccess(); A.showEnding(); });
  await page.waitForSelector('.end-credits .roll', poll);
  assert.equal(await anim(), 'end-roll');
  await closeModal();
  await page.evaluate(() => { const A = window.copytrack; A.settings.reduceMotion = 'on'; A._applyAccess(); A.showEnding(); });
  await page.waitForSelector('.end-credits .roll', poll);
  assert.equal(await anim(), 'none');
  assert.equal(await page.locator('.end-credits').evaluate((el) => getComputedStyle(el).overflowY), 'auto', 'texte lisible et défilable à la main');
  await closeModal();
  await page.evaluate(() => { const A = window.copytrack; A.settings.reduceMotion = 'auto'; A._applyAccess(); });
});
await test('aucune erreur de page pendant tout le test', () => { assert.deepEqual(errors, []); });

await browser.close(); server.kill();
await finish('Tous les tests de la fin de carrière (navigateur) passent.');
