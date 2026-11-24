// Mot de passe et code de secours dans un VRAI navigateur (Chromium) : node tools/test-browser-recuperation.mjs   (npm run test:browser)  — COMPLETE-003
//   - accueil : « J'ai perdu mon mot de passe » (pseudo + code + nouveau mot de passe), validation locale, réponse d'échec identique pour un pseudo inconnu et un mauvais code ;
//   - inscription : le code de secours est montré UNE fois (case « J'ai noté… » exigée), il n'est écrit nulle part (stockage local et de session), effacé de la page ensuite ;
//   - Garage › Compte : changer le mot de passe (re-authentification), régénérer le code (confirmation par mot de passe, l'ancien ne sert plus), compte ancien sans code : proposé sans jamais bloquer ;
//   - ANGLAIS COMPLET : l'accueil, l'écran du code, les fenêtres du compte et leurs messages, sans un mot de français (détecteur du test d'i18n).
// Le serveur Supabase est simulé (tools/fake-supabase.mjs, branché par interception des requêtes) : la VRAIE base et la VRAIE fonction sont éprouvées par test-etape21-sql.sh et test-recovery-handler.mjs.
// Playwright absent : ignoré en local, ÉCHEC en CI ou avec REQUIRE_BROWSER=1.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { srv } from './fake-supabase.mjs';

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
const openAccount = async (page) => {
  await page.evaluate(() => { window.copytrack.profileTab = 'account'; window.copytrack.showScreen('profile'); });
  await page.waitForSelector('#prof-account [data-a="pw"]', { state: 'visible' });
  await page.waitForFunction(() => document.getElementById('acct-recovery') && document.getElementById('acct-recovery').children.length > 0, null, { timeout: 10000 }).catch(() => {});
};
const modalDone = (page) => page.waitForFunction(() => !window.copytrack.ui.modalOpen, null, { timeout: 15000 });
const action = (page, label) => page.locator('#modal-actions button', { hasText: label }).first().evaluate((el) => el.click());
const deviceDump = (page) => page.evaluate(() => [...Object.entries(localStorage), ...Object.entries(sessionStorage)].map(([k, v]) => k + '=' + v).join('\n'));
const user = (name) => [...srv.users.values()].find((u) => u.username && u.username.toLowerCase() === name.toLowerCase());
const addUser = (name, pw, code) => { const u = { id: 'u-' + name, email: name.toLowerCase() + '@accounts.copytrack.invalid', pw, username: name }; srv.users.set(u.email, u); srv.accounts.set(u.id, name); if (code) srv.recoveryCodes.set(u.id, code); return u; };
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

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

Object.assign(srv, { recovery: true, autoconfirm: true });
const PW = 'mot-de-passe-1';

try {
  console.log('Accueil : « J\'ai perdu mon mot de passe »');
  await test('le lien n\'apparaît que sur la connexion ; il ouvre le formulaire (pseudo, code, nouveau mot de passe) et le retour est possible', async () => {
    const { ctx, page } = await device();
    assert.equal(await page.locator('#wl-forgot-wrap').isVisible(), false, 'pas pour l\'invité');
    await click(page, '[data-wl="signup"]');
    assert.equal(await page.locator('#wl-forgot-wrap').isVisible(), false, 'pas pour l\'inscription');
    await click(page, '[data-wl="login"]');
    assert.equal(await page.locator('#wl-forgot-wrap').isVisible(), true);
    assert.equal(await page.locator('#wl-code-wrap').isVisible(), false);
    await click(page, '#wl-forgot');
    assert.equal(await page.locator('#wl-code-wrap').isVisible(), true, 'champ du code de secours');
    assert.equal(await page.locator('#wl-pw2-wrap').isVisible(), true, 'confirmation du nouveau mot de passe');
    assert.match(await text(page, '#wl-submit'), /Récupérer mon compte/);
    assert.match(await text(page, '#wl-pw-wrap'), /Nouveau mot de passe/);
    assert.equal(await page.locator('#wl-pw').getAttribute('autocomplete'), 'new-password', 'le gestionnaire de mots de passe propose d\'enregistrer le nouveau');
    assert.equal(await page.locator('[data-wl="login"]').getAttribute('aria-selected'), 'true', 'se lit comme la suite de la connexion');
    assert.match(await text(page, '#wl-forgot'), /Retour à la connexion/);
    await click(page, '#wl-forgot');
    assert.equal(await page.locator('#wl-code-wrap').isVisible(), false);
    assert.match(await text(page, '#wl-submit'), /Se connecter/);
    await ctx.close();
  });

  await test('formulaire mal rempli : refusé sur place (aucun appel à la fonction) ; pseudo inconnu et mauvais code reçoivent EXACTEMENT le même message', async () => {
    addUser('Zoe', 'ancien-mdp-123', 'ABCD1234EFGH5678');
    const { ctx, page } = await device();
    await click(page, '[data-wl="login"]'); await click(page, '#wl-forgot');
    const calls = () => srv.recoveryCalls.length;
    const submit = async (name, code, pw, pw2 = pw) => { await page.locator('#wl-name').fill(name); await page.locator('#wl-code').fill(code); await page.locator('#wl-pw').fill(pw); await page.locator('#wl-pw2').fill(pw2); await click(page, '#wl-submit'); };
    const before = calls();
    await submit('a', 'AAAA0000BBBB1111', 'nouveau-mdp-456');
    await page.waitForFunction(() => document.getElementById('wl-error').textContent.length > 0);
    assert.match(await text(page, '#wl-error'), /pseudo d’un compte/);
    await submit('Zoe', 'pas un code', 'nouveau-mdp-456');
    await page.waitForFunction(() => /16 signes/.test(document.getElementById('wl-error').textContent));
    await submit('Zoe', 'AAAA0000BBBB1111', 'court');
    await page.waitForFunction(() => /8 caractères/.test(document.getElementById('wl-error').textContent));
    await submit('Zoe', 'AAAA0000BBBB1111', 'nouveau-mdp-456', 'autre-mdp-45678');
    await page.waitForFunction(() => /pas identiques/.test(document.getElementById('wl-error').textContent));
    assert.equal(calls(), before, 'aucune de ces erreurs n\'a atteint la fonction');
    // Attend l'appel RÉEL à la fonction puis l'apparition du message (le message précédent est effacé au départ de chaque envoi).
    const attempt = async (name, code) => {
      const n = srv.recoveryCalls.length;
      await submit(name, code, 'nouveau-mdp-456');
      for (let i = 0; i < 100 && srv.recoveryCalls.length === n; i++) await page.waitForTimeout(100);
      assert.equal(srv.recoveryCalls.length, n + 1, 'la fonction a été appelée');
      await page.waitForFunction(() => document.getElementById('wl-error').textContent.length > 0, null, { timeout: 15000 });
      return text(page, '#wl-error');
    };
    const wrongCode = await attempt('Zoe', 'AAAA0000BBBB1111');                 // mauvais code, pseudo connu
    assert.match(wrongCode, /Pseudo ou code de secours incorrect/);
    const unknown = await attempt('Fantome_9', 'ABCD1234EFGH5678');            // pseudo inconnu, (même) code valide d'un autre
    assert.equal(unknown, wrongCode, 'indiscernable');
    assert.equal(user('Zoe').pw, 'ancien-mdp-123', 'rien n\'a changé');
    await ctx.close();
  });

  await test('récupération réussie : mot de passe changé, connecté, NOUVEAU code montré une fois (l\'ancien est consommé), jamais écrit sur l\'appareil', async () => {
    const { ctx, page } = await device();
    const old = 'ABCD1234EFGH5678';
    await click(page, '[data-wl="login"]'); await click(page, '#wl-forgot');
    await page.locator('#wl-name').fill('zoe');
    await page.locator('#wl-code').fill('abcd 1234 efgh 5678');          // saisi à la main : minuscules et espaces
    await page.locator('#wl-pw').fill('nouveau-mdp-456'); await page.locator('#wl-pw2').fill('nouveau-mdp-456');
    await click(page, '#wl-submit');
    await page.waitForSelector('#wl-recovery', { state: 'visible', timeout: 20000 });
    assert.match(await text(page, '#wl-rc-intro'), /mot de passe est changé/);
    const code = await text(page, '#wl-rc-code');
    assert.match(code, CODE_RE);
    assert.notEqual(code.replace(/-/g, ''), old);
    assert.equal(srv.recoveryCodes.get(user('Zoe').id), code.replace(/-/g, ''), 'c\'est le nouveau code du serveur');
    assert.equal(user('Zoe').pw, 'nouveau-mdp-456');
    assert.equal(await page.locator('#wl-form').isVisible(), false, 'le formulaire a laissé la place au code');
    const dump = await deviceDump(page);
    for (const secret of [code, code.replace(/-/g, ''), old, 'nouveau-mdp-456', 'ancien-mdp-123']) assert.ok(!dump.includes(secret), 'écrit sur l\'appareil : ' + secret);
    await click(page, '#wl-rc-go');
    assert.match(await text(page, '#wl-rc-error'), /Coche la case/);
    assert.equal(await page.locator('#wl-recovery').isVisible(), true, 'on ne passe pas sans avoir noté le code');
    await click(page, '#wl-rc-ok'); await click(page, '#wl-rc-go');
    await menu(page);
    assert.equal(await page.evaluate(() => document.getElementById('wl-rc-code').textContent), '', 'le code a quitté la page');
    assert.equal(await page.evaluate(() => window.copytrack.identity.username), 'Zoe');
    const after = await deviceDump(page);
    assert.ok(!after.includes(code.replace(/-/g, '')) && !after.includes(code), 'toujours rien sur l\'appareil');
    await ctx.close();
  });

  console.log('Inscription, Garage › Compte');
  let signedUp;
  await test('inscription : le code de secours est montré UNE fois, une case « J\'ai noté » est exigée, rien n\'est écrit sur l\'appareil', async () => {
    const d = await device(); signedUp = d;
    const { page } = d;
    await click(page, '[data-wl="signup"]');
    await page.locator('#wl-name').fill('Alice1'); await page.locator('#wl-pw').fill(PW); await page.locator('#wl-pw2').fill(PW);
    await click(page, '#wl-age'); await click(page, '#wl-submit');
    await page.waitForSelector('#wl-recovery', { state: 'visible', timeout: 20000 });
    assert.match(await text(page, '#wl-rc-intro'), /Ton compte est créé/);
    const code = await text(page, '#wl-rc-code');
    assert.match(code, CODE_RE);
    assert.equal(srv.recoveryCodes.get(user('Alice1').id), code.replace(/-/g, ''));
    const dump = await deviceDump(page);
    assert.ok(!dump.includes(code) && !dump.includes(code.replace(/-/g, '')), 'jamais écrit sur l\'appareil');
    await click(page, '#wl-rc-go');
    assert.match(await text(page, '#wl-rc-error'), /Coche la case/);
    await click(page, '#wl-rc-ok'); await click(page, '#wl-rc-go');
    await menu(page);
    srv.firstCode = code;
  });

  await test('Garage › Compte (compte avec code) : « Changer le mot de passe » exige l\'actuel ; erreurs claires ; succès : mot de passe changé, fenêtre fermée', async () => {
    const { page } = signedUp;
    await openAccount(page);
    assert.match(await text(page, '#acct-recovery'), /Code de secours : actif depuis le/);
    await click(page, '#prof-account [data-a="pw"]');
    assert.match(await text(page, '#modal-title'), /Changer le mot de passe/);
    const fill = async (cur, next, again) => { await page.locator('#modal-body [name="current-password"]').fill(cur); await page.locator('#modal-body [name="new-password"]').fill(next); await page.locator('#modal-body [name="new-password2"]').fill(again); await action(page, 'Changer le mot de passe'); };
    const err = () => text(page, '#modal-body .mp-err');
    await fill('', 'nouveau-mdp-789', 'nouveau-mdp-789'); assert.match(await err(), /mot de passe actuel/);
    await fill(PW, 'court', 'court'); assert.match(await err(), /8 caractères/);
    await fill(PW, 'nouveau-mdp-789', 'autre-mdp-7890'); assert.match(await err(), /pas identiques/);
    await fill('pas-le-bon-mdp', 'nouveau-mdp-789', 'nouveau-mdp-789');
    await page.waitForFunction(() => /actuel est incorrect|actuel incorrect/.test(document.querySelector('#modal-body .mp-err').textContent), null, { timeout: 10000 });
    assert.equal(user('Alice1').pw, PW, 'inchangé');
    await fill(PW, 'nouveau-mdp-789', 'nouveau-mdp-789');
    await modalDone(page);
    assert.equal(user('Alice1').pw, 'nouveau-mdp-789');
    assert.match(await text(page, '#toast'), /Mot de passe changé/);
    const dump = await deviceDump(page);
    assert.ok(!dump.includes('nouveau-mdp-789') && !dump.includes(PW), 'aucun mot de passe sur l\'appareil');
  });

  await test('régénérer le code : mot de passe redemandé ; le NOUVEAU code est montré une fois ; l\'ancien ne sert plus ; fermer sans l\'avoir noté est signalé', async () => {
    const { page } = signedUp;
    await openAccount(page);
    await click(page, '[data-a="rc-regen"]');
    assert.match(await text(page, '#modal-title'), /Régénérer mon code de secours/);
    await page.locator('#modal-body [name="password"]').fill('pas-le-bon-mdp'); await action(page, 'Régénérer mon code');
    await page.waitForFunction(() => /Mot de passe incorrect/.test(document.querySelector('#modal-body .mp-err').textContent), null, { timeout: 10000 });
    assert.equal(srv.recoveryCodes.get(user('Alice1').id), srv.firstCode.replace(/-/g, ''), 'rien n\'a changé');
    await page.locator('#modal-body [name="password"]').fill('nouveau-mdp-789'); await action(page, 'Régénérer mon code');
    await page.waitForFunction(() => document.querySelector('#modal-body .rc-code'), null, { timeout: 10000 });
    const code = await text(page, '#modal-body .rc-code');
    assert.match(code, CODE_RE); assert.notEqual(code, srv.firstCode);
    assert.equal(srv.recoveryCodes.get(user('Alice1').id), code.replace(/-/g, ''), 'le nouveau remplace l\'ancien côté serveur');
    await action(page, 'Terminé');
    assert.match(await text(page, '#modal-body .mp-err'), /Coche la case/);
    assert.equal(await page.evaluate(() => window.copytrack.ui.modalOpen), true);
    await click(page, '#modal-body input[type="checkbox"]'); await action(page, 'Terminé');
    await modalDone(page);
    assert.equal(await page.evaluate(() => (document.querySelector('#modal-body .rc-code') || { textContent: '' }).textContent), '', 'le code quitte la page à la fermeture');
    assert.ok(!(await deviceDump(page)).includes(code.replace(/-/g, '')), 'jamais sur l\'appareil');
    // Échap sans avoir noté : le joueur est prévenu, le code est effacé de la page.
    await click(page, '[data-a="rc-regen"]');
    await page.locator('#modal-body [name="password"]').fill('nouveau-mdp-789'); await action(page, 'Régénérer mon code');
    await page.waitForFunction(() => document.querySelector('#modal-body .rc-code'), null, { timeout: 10000 });
    await page.keyboard.press('Escape');
    await modalDone(page);
    assert.match(await text(page, '#toast'), /Code de secours non noté/);
    assert.equal(await page.evaluate(() => (document.querySelector('#modal-body .rc-code') || { textContent: '' }).textContent), '');
    await signedUp.ctx.close();
  });

  await test('compte ANCIEN sans code : le jeu démarre normalement (aucune fenêtre forcée), l\'écran du compte propose d\'en créer un ; une fois créé, la proposition disparaît', async () => {
    addUser('Vieux', 'ancien-mdp-123', null);
    const { ctx, page } = await device();
    await click(page, '[data-wl="login"]');
    await page.locator('#wl-name').fill('Vieux'); await page.locator('#wl-pw').fill('ancien-mdp-123'); await click(page, '#wl-submit');
    await menu(page);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.copytrack.ui.modalOpen), false, 'rien ne bloque le jeu');
    await openAccount(page);
    assert.match(await text(page, '#acct-recovery'), /Pas de code de secours\./);
    await click(page, '[data-a="rc-create"]');
    assert.match(await text(page, '#modal-title'), /Créer mon code de secours/);
    await page.locator('#modal-body [name="password"]').fill('ancien-mdp-123'); await action(page, 'Créer mon code');
    await page.waitForFunction(() => document.querySelector('#modal-body .rc-code'), null, { timeout: 10000 });
    const code = await text(page, '#modal-body .rc-code');
    assert.match(code, CODE_RE);
    assert.equal(srv.recoveryCodes.get(user('Vieux').id), code.replace(/-/g, ''));
    await click(page, '#modal-body input[type="checkbox"]'); await action(page, 'Terminé');
    await modalDone(page);
    await page.waitForFunction(() => /actif depuis le/.test(document.getElementById('acct-recovery').textContent), null, { timeout: 10000 });
    assert.equal(await page.locator('#acct-recovery .acct-warn').count(), 0, 'plus de proposition');
    await ctx.close();
  });

  await test('serveur SANS l\'étape 21 : aucun code proposé, l\'écran du compte n\'affiche rien de cassé, « Changer le mot de passe » reste disponible', async () => {
    addUser('Ancien2', 'ancien-mdp-123', null);
    srv.recovery = false;
    try {
      const { ctx, page } = await device();
      await click(page, '[data-wl="login"]');
      await page.locator('#wl-name').fill('Ancien2'); await page.locator('#wl-pw').fill('ancien-mdp-123'); await click(page, '#wl-submit');
      await menu(page);
      await openAccount(page);
      assert.equal((await text(page, '#acct-recovery')).trim(), '');
      assert.equal(await page.locator('#prof-account [data-a="pw"]').isVisible(), true);
      await ctx.close();
    } finally { srv.recovery = true; }
  });

  console.log('Anglais complet');
  await test('anglais : formulaire de récupération, erreurs, écran du code, Garage › Compte et ses fenêtres : aucun mot de français', async () => {
    addUser('Zed', 'old-password-12', 'ZZZZ1111YYYY2222');
    const { ctx, page } = await device('en-US');
    await click(page, '[data-wl="login"]');
    assert.match(await text(page, '#wl-forgot'), /I lost my password/);
    await click(page, '#wl-forgot');
    assert.match(await text(page, '#wl-submit'), /Recover my account/);
    assert.match(await text(page, '#wl-pw-wrap'), /New password/);
    assert.match(await text(page, '#wl-code-wrap'), /Recovery code/);
    assert.deepEqual(await frenchLeft(page), [], 'formulaire de récupération');
    await page.locator('#wl-name').fill('Zed'); await page.locator('#wl-code').fill('AAAA0000BBBB1111');
    await page.locator('#wl-pw').fill('new-password-34'); await page.locator('#wl-pw2').fill('new-password-34'); await click(page, '#wl-submit');
    await page.waitForFunction(() => /Incorrect username or recovery code/.test(document.getElementById('wl-error').textContent), null, { timeout: 15000 });
    assert.deepEqual(await frenchLeft(page), [], 'message d\'échec');
    await page.locator('#wl-code').fill('short');
    await click(page, '#wl-submit');
    await page.waitForFunction(() => /16 characters/.test(document.getElementById('wl-error').textContent));
    assert.deepEqual(await frenchLeft(page), [], 'validation locale');
    await page.locator('#wl-code').fill('ZZZZ-1111-YYYY-2222'); await click(page, '#wl-submit');
    await page.waitForSelector('#wl-recovery', { state: 'visible', timeout: 20000 });
    assert.match(await text(page, '#wl-rc-intro'), /Your password is changed/);
    assert.deepEqual(await frenchLeft(page), [], 'écran du code de secours');
    await click(page, '#wl-rc-go');
    await page.waitForFunction(() => /Tick the box/.test(document.getElementById('wl-rc-error').textContent));
    assert.deepEqual(await frenchLeft(page), []);
    await click(page, '#wl-rc-ok'); await click(page, '#wl-rc-go');
    await menu(page);
    await openAccount(page);
    assert.deepEqual(await frenchLeft(page), [], 'Garage › Compte');
    assert.match(await text(page, '#acct-recovery'), /Recovery code: active since/);
    await click(page, '#prof-account [data-a="pw"]');
    assert.deepEqual(await frenchLeft(page), [], 'fenêtre « Change password »');
    await page.locator('#modal-body [name="current-password"]').fill('wrong-password-9'); await page.locator('#modal-body [name="new-password"]').fill('another-pass-56'); await page.locator('#modal-body [name="new-password2"]').fill('another-pass-56');
    await action(page, 'Change password');
    await page.waitForFunction(() => /Current password is incorrect/.test(document.querySelector('#modal-body .mp-err').textContent), null, { timeout: 10000 });
    assert.deepEqual(await frenchLeft(page), [], 'erreur de changement');
    await action(page, 'Cancel');
    await click(page, '[data-a="rc-regen"]');
    assert.match(await text(page, '#modal-title'), /Regenerate my recovery code/);
    await page.locator('#modal-body [name="password"]').fill('new-password-34'); await action(page, 'Regenerate my code');
    await page.waitForFunction(() => document.querySelector('#modal-body .rc-code'), null, { timeout: 10000 });
    assert.deepEqual(await frenchLeft(page), [], 'code montré dans la fenêtre');
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nLe changement de mot de passe, le code de secours et la récupération fonctionnent dans un vrai navigateur, en français et en anglais.');
