// Recette : l'éditeur par un joueur NOVICE (mode guidé), de bout en bout, aux vrais boutons.
//   node tools/recette/editeur.mjs <fr|en> <kb|land|port>
// poser un circuit complet (Départ, routes, Virage, Arrivée avec « Prolonger »), annuler / rétablir, tester, quitter l'essai, vérifier (course complète au pilote automatique), modifier après vérification,
// enregistrer, quitter avec une modification non enregistrée, revenir par « Mes circuits », publier (sans réseau).
import { Recette, launchBrowser, startServer, sleep } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'kb';
const port = 9700 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await launchBrowser();
const R = new Recette(browser, port, lang, input, '-ed');
const fast = input !== 'kb';
const modalTitle = () => R.$(() => (window.copytrack.ui.modalOpen ? (document.getElementById('modal-title') || {}).textContent : null));
const modalOpen = () => R.$(() => window.copytrack.ui.modalOpen);
const tiles = () => R.$(() => window.copytrack.session.track.tiles.length);
const rot = async (land) => { if (input === 'port') { await R.page.setViewportSize(land ? { width: 844, height: 390 } : { width: 390, height: 844 }); await sleep(700); } };
async function closeModal() { if (!(await modalOpen())) return; await R.key('Escape'); await sleep(250); if (await modalOpen()) await R.$(() => window.copytrack.ui.closeModal()); }
async function racing() {
  if (input === 'port') { await rot(true); await sleep(800); }
  await R.until(() => window.copytrack.session && (window.copytrack.session.state === 'racing' || window.copytrack.session.state === 'paused'), null, 90000);
  if (await R.$(() => window.copytrack.session.state === 'paused')) { await R.press('#pause [data-action="resume"]').catch(() => {}); await sleep(400); }
  await R.until(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 90000);
}
const btn = (sel) => R.press(sel);
const tapGround = async (fx, fy) => { const vp = R.page.viewportSize(); const x = Math.round(vp.width * fx), y = Math.round(vp.height * fy); if (R.touch) await R.page.touchscreen.tap(x, y); else { await R.page.mouse.move(x, y); await sleep(120); await R.page.mouse.click(x, y); } await sleep(400); };
// Sur un petit écran la bibliothèque est repliée : un novice touche d'abord l'outil « Pistes » (rail de gauche) pour l'ouvrir.
const ensurePalette = async () => { const vis = await R.$(() => { const r = document.getElementById('ed-palette').getBoundingClientRect(); return r.right > 20 && r.left < window.innerWidth - 20 && r.height > 20; }); if (!vis) { await R.press('#ed-tools .tool-btn'); await sleep(600); X.paletteOpenedByTool = true; } };
const pickTile = async (sel) => { await ensurePalette(); await R.press(`#ed-palette ${sel}`); await sleep(300); };
const extend = async () => { await ensurePalette(); await R.press('[data-pact="extend"]'); await sleep(300); };
const pauseNow = async () => { if (R.touch) { await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerdown'); await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerup'); } else await R.key('Escape'); await R.until(() => window.copytrack.session.state === 'paused', null, 15000); await sleep(300); };
const X = {};

try {
  await R.init(); await R.load('Novice'); await R.enter('Novice');
  if (fast) await R.$(() => window.copytrack.quality.apply('ultrapotato'));
  await R.until(() => window.copytrack.ui.modalOpen, null, 10000).catch(() => {});
  if (await modalOpen()) { await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(400); }
  await R.until(() => window.copytrack.ui.modalOpen, null, 14000).catch(() => {});
  if (await modalOpen()) { await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(400); }
  X.guided = await R.$(() => window.copytrack.settings.editorGuided);

  await R.step('éditeur : ouverture (Créer › Éditeur de circuits)', async () => { await R.press('#menu [data-action="sub-create"]'); await sleep(300); await R.press('#menu-sub-create [data-action="editor"]'); await R.until(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.track, null, 30000); await sleep(1500); });
  if (input === 'port') { X.portraitEditor = await R.$(() => { const h = document.getElementById('rotate-hint'); return h ? getComputedStyle(h).display + ' / ' + h.textContent.trim().slice(0, 80) : 'absent'; }); await rot(true); }
  await R.step('éditeur : poser le Départ', async () => { await pickTile('.lib-tile[data-piece="start"]'); await tapGround(0.55, 0.6); if ((await tiles()) !== 1) throw new Error('départ non posé : ' + (await tiles()) + ' pièces'); });
  await R.step('éditeur : Prolonger ×4 avec la Ligne droite', async () => { await pickTile('.lib-tile[data-fam="straight"]'); for (let i = 0; i < 4; i++) { await extend(); } if ((await tiles()) < 5) throw new Error('pièces : ' + (await tiles())); });
  await R.step('éditeur : un Virage puis deux droites', async () => { await pickTile('.lib-tile[data-fam="turn"]'); await extend(); await pickTile('.lib-tile[data-fam="straight"]'); for (let i = 0; i < 2; i++) { await extend(); } });
  await R.step('éditeur : l’Arrivée', async () => { await pickTile('.lib-tile[data-piece="finish"]'); await extend(); X.built = await tiles(); X.warn = await R.$(() => document.getElementById('ed-warn').textContent.trim()); });
  await R.step('éditeur : annuler ×2 puis rétablir ×2 (boutons)', async () => { const a = await tiles(); await btn('#editor [data-ed="undo"]'); await btn('#editor [data-ed="undo"]'); const b = await tiles(); await btn('#editor [data-ed="redo"]'); await btn('#editor [data-ed="redo"]'); const c = await tiles(); X.undo = [a, b, c]; if (!(b < a) || c !== a) throw new Error(`${a} → ${b} → ${c}`); });
  await R.step('éditeur : Tester', async () => { await btn('#editor [data-ed="test"]'); await racing(); await R.gas(true); await sleep(2000); await R.gas(false); });
  await R.step('éditeur : quitter l’essai → même circuit dans l’éditeur', async () => { const a = X.built; await pauseNow(); await R.press('#pause [data-action="quit"]'); await R.until(() => window.copytrack.mode === 'editor', null, 30000); await rot(true); await sleep(800); const b = await tiles(); if (b !== a) throw new Error(`${a} → ${b}`); });
  await R.step('éditeur : Vérifier et publier → course de vérification', async () => { await btn('#editor [data-ed="verify"]'); await racing(); });
  await R.step('éditeur : la course de vérification est menée à son terme', async () => {
    const f = await R.finishWithBot(); X.verifyRun = f;
    await R.until(() => window.copytrack.ui.modalOpen, null, 20000); X.verifyTitle = await modalTitle(); await sleep(500);
  });
  await R.step('éditeur : fenêtre « Circuit vérifié »', async () => { X.verifyButtons = await R.$(() => [...document.querySelectorAll('#modal-actions button')].map((b) => b.textContent.trim())); });
  await R.step('éditeur : « Retour à l’éditeur »', async () => { await R.page.locator('#modal-actions button').nth(1).evaluate((b) => b.click()); await R.until(() => window.copytrack.mode === 'editor', null, 30000); await rot(true); await sleep(900); X.verifiedAfter = await R.$(() => window.copytrack.session.track.verified); });
  await R.step('éditeur : modifier après la vérification (annuler la dernière pièce)', async () => { await btn('#editor [data-ed="undo"]'); await sleep(500); X.verifiedAfterUndo = await R.$(() => window.copytrack.session.track.verified); X.tilesAfterUndo = await tiles(); X.warnAfterUndo = await R.$(() => document.getElementById('ed-warn').textContent.trim()); });
  await R.step('éditeur : remettre l’Arrivée (Prolonger) : le circuit n’est plus « vérifié »', async () => { await pickTile('.lib-tile[data-piece="finish"]'); await extend(); await sleep(400); X.verifiedAfterRestore = await R.$(() => window.copytrack.session.track.verified); X.tilesAfterRestore = await tiles(); });
  await R.step('éditeur : Vérifier et publier de nouveau', async () => { await btn('#editor [data-ed="verify"]'); await racing(); await R.finishWithBot(); await R.until(() => window.copytrack.ui.modalOpen, null, 20000); X.verify2Title = await modalTitle(); await sleep(400); });
  await R.step('éditeur : « Publier » sans réseau (message attendu)', async () => { await R.page.locator('#modal-actions button').first().evaluate((b) => b.click()); await sleep(2500); X.publishResult = await R.$(() => ({ modal: window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent + ' — ' + document.getElementById('modal-body').textContent.replace(/\s+/g, ' ').slice(0, 260) : null, toast: document.getElementById('toast').textContent, mode: window.copytrack.mode })); });
  await closeModal();
  await R.step('éditeur : retour à l’éditeur après la publication refusée', async () => { if ((await R.$(() => window.copytrack.mode)) !== 'editor') { if (await R.$(() => window.copytrack.session && window.copytrack.mode === 'race')) { await R.$(() => window.copytrack.quitRace()); } await R.until(() => window.copytrack.mode === 'editor', null, 30000); await rot(true); await sleep(800); } X.verifiedAfterPublishTry = await R.$(() => window.copytrack.session.track.verified); });
  await R.step('éditeur : Fichier › Enregistrer', async () => { await btn('#ed-menu-btn'); await sleep(300); await btn('#ed-menu [data-ed="save"]'); await sleep(900); });
  await R.step('éditeur : Fichier › Nouveau circuit (avec un circuit enregistré)', async () => { await btn('#ed-menu-btn'); await sleep(300); await btn('#ed-menu [data-ed="new"]'); await sleep(900); X.afterNew = { modal: await modalTitle(), tiles: await tiles() }; });
  if (await modalOpen()) { await R.step('éditeur : fenêtre après « Nouveau »', null); X.newButtons = await R.$(() => [...document.querySelectorAll('#modal-actions button')].map((b) => b.textContent.trim())); await closeModal(); }
  await R.step('éditeur : modifier puis quitter par Fichier › Retour au menu', async () => {
    if ((await tiles()) < 1) { await pickTile('.lib-tile[data-piece="start"]'); await tapGround(0.5, 0.6); }
    await pickTile('.lib-tile[data-fam="straight"]'); await extend();
    await btn('#ed-menu-btn'); await sleep(300); await btn('#ed-menu [data-ed="menu"]'); await sleep(1000);
    X.quitDirty = { modal: await modalTitle(), mode: await R.$(() => window.copytrack.mode) };
  });
  if (await modalOpen()) { X.quitButtons = await R.$(() => [...document.querySelectorAll('#modal-actions button')].map((b) => b.textContent.trim())); await R.step('éditeur : fenêtre à la sortie non enregistrée', null); await R.page.locator('#modal-actions button').first().evaluate((b) => b.click()); await sleep(900); }
  await R.until(() => window.copytrack.mode !== 'editor', null, 15000).catch(() => {});
  await R.step('après la sortie de l’éditeur : où est-on ?', null);
  await R.step('Mes circuits : le circuit enregistré', async () => { await R.$(() => { const A = window.copytrack; if (A.mode !== 'menu') A.showMenu('menu'); }); await R.until(() => window.copytrack.mode === 'menu', null, 15000); await rot(false); await R.press('#menu [data-action="sub-create"]'); await sleep(300); await R.press('#menu-sub-create [data-action="mytracks"]'); await sleep(900); X.myTracks = await R.$(() => document.querySelectorAll('#mytracks .card').length); });
  await R.step('Mes circuits : rouvrir le circuit (nombre de pièces conservé)', async () => {
    const got = await R.$(() => { const b = [...document.querySelectorAll('#mytracks button')].find((x) => /Modifier|Éditer|Edit/.test(x.textContent)); if (b) { b.click(); return true; } return false; });
    if (!got) throw new Error('aucun bouton Modifier / Edit');
    await R.until(() => window.copytrack.mode === 'editor', null, 20000); await sleep(1200); X.reopened = await tiles();
  });
  await R.step('éditeur rouvert : Vérifier et publier sans réseau (message attendu)', async () => { X.verifiedReopened = await R.$(() => window.copytrack.session.track.verified); });
  await R.step('éditeur : réglages du circuit (⚙)', async () => { await btn('#editor [data-ed="params"]'); await sleep(900); });
  await closeModal();
  await R.step('éditeur : aide', async () => { await btn('#ed-menu-btn'); await sleep(300); await btn('#ed-menu [data-ed="help"]'); await sleep(900); });
  await closeModal();
  await R.step('éditeur : Fichier › Partager', async () => { await btn('#ed-menu-btn'); await sleep(300); await btn('#ed-menu [data-ed="export"]'); await sleep(900); });
  await closeModal();
  await R.step('éditeur : changement vers « Tout afficher »', async () => { await R.$(() => document.querySelector('#ed-palette .pal-guided button').click()); await sleep(900); });
} catch (e) {
  console.log('PARCOURS INTERROMPU :', e.stack || e.message);
  R.steps.push({ n: ++R.n, label: 'PARCOURS INTERROMPU', status: 'defaut', issues: [String(e.message).slice(0, 400)], errors: [] });
  try { await R.page.screenshot({ path: R.dir + '/zz-interrompu.png' }); } catch { /* page fermée */ }
} finally {
  R.save();
  console.log('EXTRA ' + JSON.stringify(X));
  console.log(`\n=== ${R.id} : ${R.steps.length} étapes, ${R.steps.filter((s) => s.status !== 'ok').length} avec constat ===`);
  await browser.close(); server.kill();
}
