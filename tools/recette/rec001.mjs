// Recette : sonde de REC-001 — « Rétablir » après un essai ou une vérification de l'éditeur (mode guidé, joueur novice, vrais boutons).
//   node tools/recette/rec001.mjs <fr|en> <kb|land>
// Quatre scénarios sur un circuit de 5 pièces : (T) témoin sans essai ; (A) après « Tester » puis « Quitter » ; (B) après « Vérifier et publier » puis « Retour à l'éditeur » ;
// (C) après les deux de suite. Pour chacun : ↶ ×3 puis ↷ ×3, nombre de pièces et état de l'historique relevés après chaque appui. Ne corrige rien.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Recette, launchBrowser, startServer, sleep, OUT } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'kb';
const port = 9800 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await launchBrowser();
const R = new Recette(browser, port, lang, input, '-rec001');
const tiles = () => R.$(() => window.copytrack.session.track.tiles.length);
const hist = () => R.$(() => { const e = window.copytrack.session; return e && e.history ? { n: e.history.length, i: e.hIndex } : null; });
const tapGround = async (fx, fy) => { const vp = R.page.viewportSize(); const x = Math.round(vp.width * fx), y = Math.round(vp.height * fy); if (R.touch) await R.page.touchscreen.tap(x, y); else { await R.page.mouse.move(x, y); await sleep(120); await R.page.mouse.click(x, y); } await sleep(400); };
const ensurePalette = async () => { await sleep(700); const vis = await R.$(() => { const r = document.getElementById('ed-palette').getBoundingClientRect(); return r.right > 20 && r.left < window.innerWidth - 20 && r.height > 20; }); if (!vis) { await R.press('#ed-tools .tool-btn'); await sleep(600); } };
const pickTile = async (sel) => { await ensurePalette(); await R.press(`#ed-palette ${sel}`); await sleep(300); };
const extend = async () => { await ensurePalette(); await R.press('[data-pact="extend"]'); await sleep(300); };
const btn = (sel) => R.press(sel);
const racing = async () => {
  await R.until(() => window.copytrack.session && (window.copytrack.session.state === 'racing' || window.copytrack.session.state === 'paused'), null, 90000);
  if (await R.$(() => window.copytrack.session.state === 'paused')) { await R.press('#pause [data-action="resume"]').catch(() => {}); await sleep(400); }
  await R.until(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 90000);
};
const pauseNow = async () => { if (R.touch) { await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerdown'); await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerup'); } else await R.key('Escape'); await R.until(() => window.copytrack.session.state === 'paused', null, 15000); await sleep(300); };
const dismiss = async () => { for (const wait of [10000, 14000]) { await R.until(() => window.copytrack.ui.modalOpen, null, wait).catch(() => {}); if (await R.$(() => window.copytrack.ui.modalOpen)) { await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(400); } } };

async function build() {
  await R.press('#menu [data-action="sub-create"]'); await sleep(300); await R.press('#menu-sub-create [data-action="editor"]');
  await R.until(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.track, null, 60000); await sleep(1200);
  await pickTile('.lib-tile[data-piece="start"]'); await tapGround(0.55, 0.6);
  await pickTile('.lib-tile[data-fam="straight"]'); for (let i = 0; i < 3; i++) await extend();
  await pickTile('.lib-tile[data-piece="finish"]'); await extend();
}
async function undoRedo() {
  const out = { undo: [], redo: [], h: [] };
  for (let i = 0; i < 3; i++) { await btn('#editor [data-ed="undo"]'); await sleep(300); out.undo.push(await tiles()); out.h.push(await hist()); }
  for (let i = 0; i < 3; i++) { await btn('#editor [data-ed="redo"]'); await sleep(300); out.redo.push(await tiles()); out.h.push(await hist()); }
  return out;
}
const result = { lang, input };
async function fresh(tag) {
  await R.$(() => { try { localStorage.clear(); } catch { /* sans importance */ } });
  await R.page.reload({ waitUntil: 'load' }); await R.page.locator('#welcome').waitFor({ state: 'visible', timeout: 60000 }); await R.enter('Novice');
  if (input !== 'kb') await R.$(() => window.copytrack.quality.apply('ultrapotato'));
  await dismiss();
  result[tag] = { guided: await R.$(() => window.copytrack.settings.editorGuided) };
  await build(); result[tag].built = await tiles();
}
const test = async () => { await btn('#editor [data-ed="test"]'); await racing(); await R.gas(true); await sleep(1500); await R.gas(false); await pauseNow(); await R.press('#pause [data-action="quit"]'); await R.until(() => window.copytrack.mode === 'editor', null, 30000); await sleep(1000); };
const verify = async () => { await btn('#editor [data-ed="verify"]'); await racing(); await R.finishWithBot(); await R.until(() => window.copytrack.ui.modalOpen, null, 20000); await sleep(500); await R.page.locator('#modal-actions button').nth(1).evaluate((b) => b.click()); await R.until(() => window.copytrack.mode === 'editor', null, 30000); await sleep(1000); };

try {
  await R.init(); await R.load('Novice');
  await fresh('T'); result.T.run = await undoRedo();
  await fresh('A'); await test(); result.A.afterTest = { tiles: await tiles(), h: await hist() }; result.A.run = await undoRedo();
  await fresh('B'); await verify(); result.B.afterVerify = { tiles: await tiles(), h: await hist() }; result.B.run = await undoRedo();
  await fresh('C'); await test(); await verify(); result.C.afterBoth = { tiles: await tiles(), h: await hist() }; result.C.run = await undoRedo();
  console.log(JSON.stringify(result));
} catch (e) { result.error = String(e.message).split('\n')[0]; console.log('ERREUR', result.error, JSON.stringify(result)); } finally {
  writeFileSync(join(OUT, `rec001-${lang}-${input}.json`), JSON.stringify(result, null, 1));
  await browser.close(); server.kill();
  process.exit(0);
}
