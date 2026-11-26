// Écran de modération dans un VRAI navigateur (Chromium) : node tools/test-browser-moderation.mjs   (npm run test:browser)  — COMPLETE-004
//   - un joueur ordinaire (compte), et un visiteur sans session : le bouton « Modération » n'apparaît pas, l'écran ne s'ouvre pas, AUCUNE fonction mod_* n'est appelée sauf mod_status
//     (et rien du tout, pas même une inscription invitée, sans session) ;
//   - un modérateur : bouton visible, file à examiner, fiche, masquer / rétablir avec un motif obligatoire et une confirmation, suspendre / réactiver l'auteur, journal ;
//   - un refus du serveur (état déjà atteint) est affiché dans la confirmation, sans rien changer ;
//   - ANGLAIS COMPLET : la file, la fiche, la confirmation, les onglets, sans un mot de français (détecteur du test d'i18n).
// Le serveur Supabase est simulé (tools/fake-supabase.mjs, option moderation : mêmes règles que la base) : la VRAIE base est éprouvée par test-etape22-sql.sh.
// Playwright absent : ignoré en local, ÉCHEC en CI ou avec REQUIRE_BROWSER=1.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { srv, resetModeration } from './fake-supabase.mjs';

const fakeFetch = globalThis.fetch;       // (fake-supabase remplace fetch ; Playwright n'en dépend pas)
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

// Interception : chaque requête vers Supabase est confiée au faux serveur (qui renvoie des Response ; CORS posé ici, comme le ferait le vrai).
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'retry-after' };
const supabase = async (route) => {
  const req = route.request(), h = req.headers();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const r = await fakeFetch(req.url(), { method: req.method(), headers: { Authorization: h.authorization, apikey: h.apikey }, body: req.postData() || undefined });
  await route.fulfill({ status: r.status, headers: { ...CORS, 'content-type': 'application/json' }, body: await r.text() });
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
  return { ctx, page };
}
const click = (page, sel) => page.locator(sel).first().evaluate((el) => el.click());
const text = (page, sel) => page.locator(sel).first().innerText();
const menu = (page) => page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000 });
const addUser = (name, pw, code) => { const u = { id: 'u-' + name, email: name.toLowerCase() + '@accounts.copytrack.invalid', pw, username: name }; srv.users.set(u.email, u); srv.accounts.set(u.id, name); if (code) srv.recoveryCodes.set(u.id, code); return u; };
// Les textes restés en français dans la page (même logique que tools/test-browser-i18n.mjs).
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
  return out.filter((s) => s !== 'Français' && !/^[A-Z0-9]{4,6}-[A-Z0-9]{4,6}$/.test(s));
});

const PW = 'mot-de-passe-1';
const T1 = '00000000-0000-4000-8000-000000000001';
const AUTHOR = '00000000-0000-4000-8000-0000000000a1';
const state = (moderators) => resetModeration({ moderators, items: [
  { kind: 'track', id: T1, label: 'Circuit signalé', author: AUTHOR, author_name: 'Carl', reports: 3, counted: 2, hidden: true, description: 'Une description', plays: 12, likes: 3, report_dates: ['2026-11-25T10:00:00Z', null] },
  { kind: 'comment', id: '7', label: 'un commentaire désagréable', author: AUTHOR, author_name: 'Carl', reports: 1, counted: 1, hidden: false },
  { kind: 'comment', id: '8', label: 'déjà examiné', author: AUTHOR, author_name: 'Carl', reports: 2, counted: 2, hidden: false, seen: 2 },
] });
const login = async (page, name) => {
  await click(page, '[data-wl="login"]');
  await page.locator('#wl-name').fill(name); await page.locator('#wl-pw').fill(PW);
  await click(page, '#wl-submit');
  await menu(page);
};
const openCommunity = async (page) => {
  await page.evaluate(() => window.copytrack.showScreen('community'));
  await page.waitForSelector('#community:not(.hidden)', { timeout: 10000 });
  await page.waitForFunction(() => document.getElementById('comm-status').textContent !== 'Chargement…' && document.getElementById('comm-status').textContent !== 'Loading…', null, { timeout: 15000 });
};
const modCalls = () => srv.mod.calls.map((c) => c.fn);
const modalTitle = (page) => page.locator('#modal-title').innerText();
const clickIn = (page, sel) => page.locator('#modal-body ' + sel).first().evaluate((el) => el.click());
const waitList = (page) => page.waitForFunction(() => document.querySelector('#modal-body .mod-status') && !/Chargement|Loading/.test(document.querySelector('#modal-body .mod-status').textContent), null, { timeout: 10000 });
const rows = (page) => page.locator('#modal-body .mod-row').count();

try {
  console.log('Pas modérateur : l\'écran n\'existe pas');
  await test('un visiteur sans session : bouton caché, aucune requête de modération, aucun joueur invité créé', async () => {
    state(['u-Mona']); srv.calls.length = 0;
    const { ctx, page } = await device();
    // jouer en invité : un pseudo, « Jouer » ; aucune session en ligne n'existe tant qu'aucune action ne l'exige
    await page.locator('#wl-name').fill('Visiteur'); await click(page, '#wl-submit'); await menu(page);
    await openCommunity(page);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#comm-mod').isVisible(), false);
    assert.deepEqual(modCalls(), [], 'pas une seule requête de modération sans session');
    assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0, 'aucun joueur invité créé pour la demander');
    await ctx.close();
  });
  await test('un joueur ordinaire (compte) : bouton caché ; la base répond « faux » ; ouvrir l\'écran de force est refusé et n\'appelle rien d\'autre', async () => {
    state(['u-Mona']); addUser('Nora', PW);
    const { ctx, page } = await device();
    await login(page, 'Nora');
    await openCommunity(page);
    await page.waitForFunction(() => window.copytrack._modReq >= 1, null, { timeout: 10000 });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#comm-mod').isVisible(), false, 'bouton caché');
    assert.ok(modCalls().includes('mod_status'), 'la base a été interrogée');
    await page.evaluate(() => window.copytrack.openModeration());
    await page.waitForTimeout(500);
    assert.notEqual(await page.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : '')), 'Modération', 'aucune fenêtre de modération');
    assert.deepEqual([...new Set(modCalls())], ['mod_status'], 'rien d\'autre que le statut n\'est parti');
    // même en forçant le bouton visible, le serveur refuse tout
    await page.evaluate(() => document.getElementById('comm-mod').classList.remove('hidden'));
    await click(page, '#comm-mod'); await page.waitForTimeout(500);
    assert.notEqual(await page.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : '')), 'Modération');
    assert.deepEqual([...new Set(modCalls())], ['mod_status']);
    await ctx.close();
  });

  console.log('Modérateur : file, fiche, décisions, journal');
  await test('un modérateur : bouton visible, la file « à examiner » (le circuit masqué et le commentaire signalé, pas le commentaire déjà examiné)', async () => {
    state(['u-Mona']); addUser('Mona', PW);
    const { ctx, page } = await device();
    await login(page, 'Mona');
    await openCommunity(page);
    await page.waitForSelector('#comm-mod:not(.hidden)', { timeout: 10000 });
    await click(page, '#comm-mod');
    await page.waitForFunction(() => window.copytrack.ui.modalOpen);
    assert.equal(await modalTitle(page), 'Modération');
    await waitList(page);
    assert.equal(await rows(page), 2);
    assert.match(await text(page, '#modal-body .mod-row[data-mod-kind="track"]'), /Circuit signalé[\s\S]*Carl[\s\S]*Contenu masqué/);
    assert.match(await text(page, '#modal-body .mod-row[data-mod-kind="comment"]'), /un commentaire désagréable/);
    // onglet « Contenus masqués »
    await clickIn(page, '[data-mod-tab="hidden"]'); await waitList(page);
    assert.equal(await rows(page), 1);
    await clickIn(page, '[data-mod-tab="pending"]'); await waitList(page);
    // fiche du commentaire
    await clickIn(page, '.mod-row[data-mod-kind="comment"] [data-mod-open]');
    await page.waitForSelector('#modal-body .mod-detail');
    const fiche = await text(page, '#modal-body .mod-detail');
    assert.match(fiche, /un commentaire désagréable/); assert.match(fiche, /Carl/); assert.match(fiche, /sans le nom de ceux qui ont signalé/);
    assert.equal(await page.locator('#modal-body [data-mod-act="hide"]').count(), 1);
    // masquer : la confirmation exige un motif (bouton inactif tant qu'il est trop court), puis journalise
    await clickIn(page, '[data-mod-act="hide"]');
    await page.waitForSelector('#modal-body .mod-reason');
    assert.equal(await page.locator('#modal-body [data-mod-confirm]').isDisabled(), true, 'sans motif : pas de décision');
    await page.locator('#modal-body .mod-reason').fill('ab');
    assert.equal(await page.locator('#modal-body [data-mod-confirm]').isDisabled(), true, 'motif trop court');
    await page.locator('#modal-body .mod-reason').fill('Propos injurieux');
    assert.equal(await page.locator('#modal-body [data-mod-confirm]').isDisabled(), false);
    await clickIn(page, '[data-mod-confirm]');
    await page.waitForFunction(() => document.querySelector('#modal-body [data-mod-act="restore"]'), null, { timeout: 10000 });
    assert.equal(srv.mod.items.find((i) => i.id === '7').hidden, true, 'le serveur a masqué');
    assert.equal(srv.mod.log[0].reason, 'Propos injurieux'); assert.equal(srv.mod.log[0].action, 'hide');
    // annuler une confirmation ne change rien
    await clickIn(page, '[data-mod-act="restore"]'); await page.waitForSelector('#modal-body .mod-reason');
    await clickIn(page, '[data-mod-cancel]'); await page.waitForSelector('#modal-body .mod-detail');
    assert.equal(srv.mod.items.find((i) => i.id === '7').hidden, true); assert.equal(srv.mod.log.length, 1);
    // le serveur refuse (un autre modérateur l'a déjà rétabli entre-temps) : l'erreur est dite dans la confirmation, rien ne change
    srv.mod.items.find((i) => i.id === '7').hidden = false;
    await clickIn(page, '[data-mod-act="restore"]'); await page.waitForSelector('#modal-body .mod-reason');
    await page.locator('#modal-body .mod-reason').fill('Faux positif'); await clickIn(page, '[data-mod-confirm]');
    await page.waitForFunction(() => /déjà visible/.test(document.querySelector('#modal-body .mod-error').textContent), null, { timeout: 10000 });
    assert.equal(srv.mod.log.length, 1, 'aucune ligne de journal pour un refus');
    await ctx.close();
  });
  await test('suspendre l\'auteur (motif + durée), il apparaît dans « Comptes suspendus », le journal garde tout ; le réactiver', async () => {
    state(['u-Mona']); addUser('Mona', PW);
    const { ctx, page } = await device();
    await login(page, 'Mona');
    await openCommunity(page);
    await page.waitForSelector('#comm-mod:not(.hidden)');
    await click(page, '#comm-mod'); await waitList(page);
    await clickIn(page, '.mod-row[data-mod-kind="track"] [data-mod-open]'); await page.waitForSelector('#modal-body .mod-detail');
    assert.match(await text(page, '#modal-body .mod-detail'), /Aucune décision pour l’instant/);
    await clickIn(page, '[data-mod-act="suspend"]'); await page.waitForSelector('#modal-body .mod-reason');
    assert.match(await text(page, '#modal-body'), /ne pourra plus publier ni commenter/);
    await page.locator('#modal-body .mod-duration').selectOption('30');
    await page.locator('#modal-body .mod-reason').fill('Spam de circuits'); await clickIn(page, '[data-mod-confirm]');
    await page.waitForFunction(() => document.querySelector('#modal-body [data-mod-act="unsuspend"]'), null, { timeout: 10000 });
    const sus = srv.mod.suspensions.at(-1);
    assert.equal(sus.user_id, AUTHOR); assert.equal(sus.reason, 'Spam de circuits');
    const days = (Date.parse(sus.until) - Date.now()) / 86400000;
    assert.ok(days > 29.9 && days < 30.1, 'fin dans 30 jours : ' + days);
    assert.match(await text(page, '#modal-body .mod-detail'), /Spam de circuits/, 'la fiche annonce la suspension en cours');
    await clickIn(page, '.btn.small'); await waitList(page);          // ← Retour à la liste
    await clickIn(page, '[data-mod-tab="suspended"]'); await waitList(page);
    assert.equal(await rows(page), 1);
    assert.match(await text(page, '#modal-body .mod-row'), /Spam de circuits/);
    await clickIn(page, '.mod-row .btn'); await page.waitForSelector('#modal-body .mod-reason');
    await page.locator('#modal-body .mod-reason').fill('Elle s’est excusée'); await clickIn(page, '[data-mod-confirm]');
    await waitList(page);
    assert.equal(srv.mod.suspensions.at(-1).lifted_at !== null, true, 'levée');
    assert.equal(await rows(page), 0);
    assert.match(await text(page, '#modal-body .mod-status'), /Aucun compte suspendu/);
    await clickIn(page, '[data-mod-tab="log"]'); await waitList(page);
    assert.equal(await rows(page), 2, 'la suspension et la réactivation sont au journal');
    assert.match(await text(page, '#modal-body'), /Compte suspendu/); assert.match(await text(page, '#modal-body'), /Compte réactivé/);
    await ctx.close();
  });
  await test('un modérateur ne peut pas suspendre un autre modérateur : le bouton n\'est pas proposé (et la base le refuse)', async () => {
    state(['u-Mona', AUTHOR]); addUser('Mona', PW);
    const { ctx, page } = await device();
    await login(page, 'Mona');
    await openCommunity(page);
    await page.waitForSelector('#comm-mod:not(.hidden)');
    await click(page, '#comm-mod'); await waitList(page);
    await clickIn(page, '.mod-row[data-mod-kind="track"] [data-mod-open]'); await page.waitForSelector('#modal-body .mod-detail');
    assert.equal(await page.locator('#modal-body [data-mod-act="suspend"]').count(), 0);
    assert.match(await text(page, '#modal-body .mod-detail'), /Cet auteur est modérateur/);
    await ctx.close();
  });
  await test('changer de compte : le statut de l\'ancien ne reste pas (le bouton disparaît pour le joueur suivant sur le même écran)', async () => {
    state(['u-Mona']); addUser('Mona', PW); addUser('Paul', PW);
    const { ctx, page } = await device();
    await login(page, 'Mona');
    await openCommunity(page);
    await page.waitForSelector('#comm-mod:not(.hidden)');
    // déconnexion puis connexion d'un autre compte (l'identité change, le cache de statut est par identité)
    await page.evaluate(async () => { const { forgetModeratorStatus } = await import('/js/online/moderation.js'); forgetModeratorStatus(); });
    srv.mod.moderators.delete('u-Mona');
    await page.evaluate(() => window.copytrack.showScreen('menu'));
    await page.evaluate(() => window.copytrack.showScreen('community'));
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#comm-mod').isVisible(), false, 'statut retiré à la base : le bouton disparaît');
    await ctx.close();
  });

  console.log('Anglais');
  await test('anglais : file, fiche, confirmation, suspensions et journal, sans un mot de français', async () => {
    state(['u-Mona']); addUser('Mona', PW);
    const { ctx, page } = await device('en-US');
    await login(page, 'Mona');
    await openCommunity(page);
    await page.waitForSelector('#comm-mod:not(.hidden)');
    assert.match(await text(page, '#comm-mod'), /Moderation/);
    assert.deepEqual(await frenchLeft(page), [], 'écran Communauté avec le bouton');
    await click(page, '#comm-mod'); await waitList(page);
    assert.equal(await modalTitle(page), 'Moderation');
    assert.deepEqual(await frenchLeft(page), [], 'file à examiner');
    await clickIn(page, '[data-mod-tab="hidden"]'); await waitList(page);
    assert.deepEqual(await frenchLeft(page), [], 'contenus masqués');
    await clickIn(page, '.mod-row[data-mod-kind="track"] [data-mod-open]'); await page.waitForSelector('#modal-body .mod-detail');
    assert.deepEqual(await frenchLeft(page), [], 'fiche d\'un circuit');
    await clickIn(page, '[data-mod-act="restore"]'); await page.waitForSelector('#modal-body .mod-reason');
    assert.deepEqual(await frenchLeft(page), [], 'confirmation (rétablir)');
    await page.locator('#modal-body .mod-reason').fill('Fixed by the author'); await clickIn(page, '[data-mod-confirm]');
    await page.waitForFunction(() => document.querySelector('#modal-body [data-mod-act="hide"]'), null, { timeout: 10000 });
    assert.deepEqual(await frenchLeft(page), [], 'fiche après décision (historique)');
    await clickIn(page, '[data-mod-act="suspend"]'); await page.waitForSelector('#modal-body .mod-reason');
    assert.deepEqual(await frenchLeft(page), [], 'confirmation (suspendre)');
    assert.match(await text(page, '#modal-body'), /will no longer be able to publish or comment/);
    await page.locator('#modal-body .mod-reason').fill('Spam'); await clickIn(page, '[data-mod-confirm]');
    await page.waitForFunction(() => /Spam/.test((document.querySelector('#modal-body .mod-detail') || {}).textContent || ''), null, { timeout: 10000 });
    assert.deepEqual(await frenchLeft(page), [], 'fiche avec suspension en cours');
    await page.locator('#modal-body .btn.small').first().evaluate((el) => el.click()); await waitList(page);
    await clickIn(page, '[data-mod-tab="suspended"]'); await waitList(page);
    assert.deepEqual(await frenchLeft(page), [], 'comptes suspendus');
    await clickIn(page, '[data-mod-tab="log"]'); await waitList(page);
    assert.deepEqual(await frenchLeft(page), [], 'journal');
    await clickIn(page, '[data-mod-tab="pending"]'); await waitList(page);
    assert.deepEqual(await frenchLeft(page), [], 'file après décisions');
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests du navigateur (modération) passent.');
