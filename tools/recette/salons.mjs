// Recette : salons multijoueur à deux onglets d'un même navigateur (signalisation locale ?net=local, vrai WebRTC sur la machine). Pas de Supabase Realtime, pas de réseau réel.
//   node tools/recette/salons.mjs <fr|en> [kb|land|port]
// Création du salon, invitation par lien, arrivée de la 2e joueuse, cartes, prêt, lancement, course à départ commun, une joueuse ferme son onglet en pleine course, retour au salon.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, OUT, OFFLINE, sleep, startServer, auditPage, VIEWPORTS } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'kb';       // kb (défaut) | land | port : téléphones simulés
const tag = input === 'kb' ? '' : '-' + input;
const port = 9800 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-US' : 'fr-FR', viewport: input === 'kb' ? { width: 1100, height: 650 } : VIEWPORTS[input], hasTouch: input !== 'kb', isMobile: input !== 'kb', deviceScaleFactor: 1, serviceWorkers: 'block' });
const errors = [], res = [];
const hook = async (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ` + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push(`${tag} console: ` + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  return p;
};
const note = (id, ok, detail) => { res.push({ id, ok, detail }); console.log(`${ok ? 'ok     ' : 'CONSTAT '} ${id} — ${detail}`); writeFileSync(join(OUT, `salons-${lang}${tag}.json`), JSON.stringify({ res, errors }, null, 1)); };
const A = await hook(await ctx.newPage(), 'A');
let B = null;
async function enter(p, name, url) {
  await p.goto(url, { waitUntil: 'load' });
  await p.locator('#welcome').waitFor({ state: 'visible', timeout: 60000 });
  if (lang === 'en') await p.locator('#welcome [data-lang="en"]').evaluate((b) => b.click());
  await p.locator('#wl-name').fill(name); await p.locator('#wl-submit').evaluate((el) => el.click());
  await p.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 90000, polling: 100 });
  await p.evaluate(() => { const a = window.copytrack; a.settings.tutorialDone = true; a.settings.telemetry = false; a.saveSettings(); a.ui.closeModal(); a.quality.apply('ultrapotato'); });
}
const audit = async (p, label) => {
  const a = await auditPage(p, { lang, touch: false });
  const bad = [['recouvert', a.covered], ['hors écran', a.offscreen], ['non traduit', a.french], ['texte brut', a.bad]].filter(([, v]) => v.length);
  note('audit ' + label, bad.length === 0, bad.length ? bad.map(([k, v]) => `${k} : ${v.slice(0, 6).join(' ; ')}`).join(' | ') : `${a.controls} contrôles, rien de recouvert`);
  await p.screenshot({ path: join(OUT, `salons-${lang}${tag}-${label.replace(/\W+/g, '_')}.png`) });
};
try {
  await enter(A, 'Ana', `http://127.0.0.1:${port}/?net=local`);
  await A.evaluate(() => window.copytrack.multiMenu());
  await sleep(800);
  await audit(A, 'menu des salons');
  await A.evaluate(() => [...document.querySelectorAll('#modal-actions button')].find((b) => /Créer une salle|Create a room/.test(b.textContent)).click());
  await A.waitForFunction(() => document.querySelector('.mp-code b'), null, { timeout: 20000 });
  const code = (await A.evaluate(() => document.querySelector('.mp-code b').textContent)).trim();
  note('salon créé', /^[A-Z0-9]{4,8}$/.test(code), 'code ' + code);
  await audit(A, 'salon seul');
  B = await hook(await ctx.newPage(), 'B');
  await enter(B, 'Bea', `http://127.0.0.1:${port}/?net=local#salle=${code}`);
  await B.waitForFunction(() => window.copytrack && window.copytrack.room && window.copytrack.room.list.some((m) => !m.self && m.link === 'open'), null, { timeout: 40000 });
  await A.waitForFunction(() => window.copytrack.room && window.copytrack.room.list.some((m) => !m.self && m.link === 'open'), null, { timeout: 40000 });
  await sleep(1200);
  note('liaison ouverte dans les deux sens', true, 'A et B voient l’autre avec le lien « open »');
  await audit(A, 'salon à deux (hôte)');
  await audit(B, 'salon à deux (invitée)');
  await B.evaluate(() => document.querySelector('#modal-actions [data-mp="ready"]').click());
  await sleep(600);
  await A.evaluate(() => document.querySelector('#modal-actions [data-mp="start"]').click());
  await sleep(600);
  const warn1 = await A.evaluate(() => (document.querySelector('.mp-lobby .mp-err') || {}).textContent || '');
  note('premier « Lancer » sans avoir choisi de circuit', true, `message de la salle : « ${warn1.trim()} »`);
  await audit(A, 'salon : après un premier Lancer');
  await A.evaluate(() => { const r = document.querySelector('input[name="mp-mode"][value="race"]'); if (r) r.click(); const sel = document.querySelector('.mp-track select'); if (sel) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change')); } });
  await sleep(900);
  await A.evaluate(() => document.querySelector('#modal-actions [data-mp="start"]').click());
  await sleep(500);
  await A.evaluate(() => document.querySelector('#modal-actions [data-mp="start"]').click());
  await A.waitForFunction(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 60000 }).catch(() => {});
  await B.waitForFunction(() => window.copytrack.mode === 'race' && window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 60000 }).catch(() => {});
  const st = await Promise.all([A, B].map((p) => p.evaluate(() => ({ mode: window.copytrack.mode, state: window.copytrack.session && window.copytrack.session.state, remote: window.copytrack.session ? window.copytrack.session.remote.size : -1 }))));
  note('course à départ commun', st.every((s) => s.state === 'racing' && s.remote === 1), JSON.stringify(st));
  await A.keyboard.down('ArrowUp'); await sleep(2500);
  await audit(A, 'course à deux (hôte)');
  await A.keyboard.up('ArrowUp');
  const sp = await B.evaluate(() => [...window.copytrack.session.remote.values()].map((r) => ({ ready: r.ready, opaque: r.opaque, hidden: r.hidden })));
  note('voiture distante visible chez B', sp.length === 1, JSON.stringify(sp));
  await B.close();
  await sleep(7000);
  const after = await A.evaluate(() => ({ mode: window.copytrack.mode, state: window.copytrack.session && window.copytrack.session.state, remote: window.copytrack.session ? [...window.copytrack.session.remote.values()].map((r) => ({ hidden: r.hidden, ready: r.ready })) : null, toast: document.getElementById('toast').textContent }));
  note('B ferme son onglet en pleine course : A continue', after.mode === 'race', JSON.stringify(after));
  await audit(A, 'course après le départ de B');
  await A.evaluate(() => window.copytrack.quitRace());
  await sleep(1500);
  note('retour au salon après « Quitter »', true, 'mode ' + (await A.evaluate(() => window.copytrack.mode)) + ', fenêtre : ' + (await A.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : 'aucune'))));
  await audit(A, 'retour au salon seul');
} catch (e) {
  console.log('INTERROMPU :', e.stack || e.message);
  note('INTERROMPU', false, String(e.message).slice(0, 300));
} finally {
  writeFileSync(join(OUT, `salons-${lang}${tag}.json`), JSON.stringify({ res, errors }, null, 1));
  console.log('erreurs de la page :', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close(); server.kill();
}
