// Recette : mesures de défilement sur téléphone (REC-002, REC-003, REC-005). Constate seulement ; ne corrige rien.
//   node tools/recette/defilement.mjs <fr|en> <land|port>
//  (a) accueil, onglets « Connexion » / « Créer un compte » : haut de la carte et défilement possible ;
//  (b) fiche du premier circuit : position du classement, défilement par glisser (vrais événements tactiles via CDP) sur la carte, sur « Jouer » et sur la marge ;
//  (c) première arrivée d'un profil neuf : hauteur de la carte d'arrivée, position des boutons du second rang.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Recette, launchBrowser, startServer, sleep, OUT } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'land';
const port = 9500 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await launchBrowser();
const R = new Recette(browser, port, lang, input, '-defil');
const out = { lang, input };
const cdp = async () => R.ctx.newCDPSession(R.page);
async function drag(c, x0, y0, x1, y1) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 8; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8 }] }); await sleep(25); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
}
try {
  await R.init(); await R.load('Defil');
  out.vp = R.page.viewportSize();
  for (const tab of ['login', 'signup']) {
    await R.press(`#welcome [data-wl="${tab}"]`).catch(async () => { await R.fire(`#welcome [data-wl="${tab}"]`); });
    await sleep(500);
    out['accueil_' + tab] = await R.$(() => { const w = document.getElementById('welcome'), card = w.firstElementChild.getBoundingClientRect(), lang = [...w.querySelectorAll('button')].find((b) => /^(Français|English)$/.test(b.textContent.trim())); const lb = lang ? lang.getBoundingClientRect() : null; w.scrollTop = 0; const top0 = Math.round(card.top); w.scrollTop = -9999; return { innerHeight: window.innerHeight, cardTop: top0, cardHeight: Math.round(card.height), scrollHeight: w.scrollHeight, clientHeight: w.clientHeight, scrollTopAfterUp: w.scrollTop, langTop: lb ? Math.round(lb.top) : null }; });
  }
  await R.fire('#welcome [data-wl="guest"]'); await sleep(300);
  await R.enter('Defil');
  if (R.touch) await R.$(() => window.copytrack.quality.apply('ultrapotato'));
  await R.until(() => window.copytrack.ui.modalOpen, null, 10000).catch(() => {});
  for (let k = 0; k < 2; k++) { if (await R.$(() => window.copytrack.ui.modalOpen)) { await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(500); } await R.until(() => window.copytrack.ui.modalOpen, null, k ? 3000 : 14000).catch(() => {}); }
  await R.press('#menu [data-action="sub-play"]'); await sleep(300); await R.press('#menu-sub-play [data-action="play"]');
  await R.until(() => document.querySelectorAll('#track-list .card .num').length > 5, null, 20000); await sleep(600);
  await R.press('#track-list .card:has(.num) .thumb'); await R.until(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 15000); await sleep(1200);
  out.fiche = await R.$(() => { const h = document.getElementById('race-hub'), t = [...h.querySelectorAll('button')].find((b) => /Mondial|World/.test(b.textContent)); const r = t ? t.getBoundingClientRect() : null; return { innerHeight: window.innerHeight, hubScrollHeight: h.scrollHeight, hubClient: h.clientHeight, hubScrollTop: h.scrollTop, leaderboardTabTop: r ? Math.round(r.top) : null }; });
  if (R.touch) {
    const c = await cdp(), vp = R.page.viewportSize();
    const map = await R.$(() => { const m = document.querySelector('#race-hub canvas'); if (!m) return null; const r = m.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 3) }; });
    const play = await R.$(() => { const r = document.getElementById('hub-play').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
    const st = () => R.$(() => document.getElementById('race-hub').scrollTop);
    out.fiche.dragOnMap = null; out.fiche.dragOnPlay = null; out.fiche.dragOnMargin = null;
    if (map) { await drag(c, map.x, Math.min(vp.height - 20, map.y + 120), map.x, Math.max(10, map.y - 120)); out.fiche.dragOnMap = await st(); }
    await drag(c, play.x, play.y, play.x, Math.max(5, play.y - 150)); out.fiche.dragOnPlay = await st();
    await drag(c, 8, vp.height - 40, 8, 10); out.fiche.dragOnMargin = await st();
    out.fiche.hubScrollWheelOnMap = null;
  }
  await R.press('#hub-play'); await R.until(() => window.copytrack.mode === 'race', null, 30000); await sleep(1200);
  if (input === 'port') { await R.page.setViewportSize({ width: 844, height: 390 }); await sleep(800); }
  await R.finishWithBot(); await sleep(2500);
  out.arrivee = await R.$(() => {
    const s = [...document.querySelectorAll('.screen:not(.hidden), .overlay:not(.hidden)')].map((e) => e.id).filter(Boolean);
    const b = [...document.querySelectorAll('button')].filter((x) => /Revoir la course|Partager mon fantôme|Classement|Fiche du circuit|Watch the replay|Share my ghost|Leaderboard|Track page/.test(x.textContent) && x.checkVisibility());
    const card = document.querySelector('#finish .finish-panel');
    const r = card ? card.getBoundingClientRect() : null;
    return { innerHeight: window.innerHeight, screens: s, cardHeight: r ? Math.round(r.height) : null, cardScrollHeight: card ? card.scrollHeight : null, cardClient: card ? card.clientHeight : null, secondRow: b.map((x) => x.textContent.trim().slice(0, 24) + ' @y=' + Math.round(x.getBoundingClientRect().top)) };
  });
  await R.page.screenshot({ path: join(R.dir, 'arrivee.png') });
  console.log(JSON.stringify(out));
} catch (e) { out.error = String(e.message).split('\n')[0]; console.log('ERREUR', out.error, JSON.stringify(out)); } finally {
  writeFileSync(join(OUT, `defil-${lang}-${input}.json`), JSON.stringify(out, null, 1));
  await browser.close(); server.kill(); process.exit(0);
}
