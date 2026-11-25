// Recette : parcours d'un joueur qui a passé ses premières minutes : réglages (commandes réassignées puis course), modes, Académie, défi du jour,
// communauté et classements (réseau coupé, puis serveur simulé), changement de langue en cours de route,
// erreur de course, états de synchronisation.
//   node tools/recette/journey2.mjs <fr|en> <kb|land|port>
import { Recette, launchBrowser, startServer, sleep } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'kb';
const port = 9300 + Math.floor(Math.random() * 500);
const server = startServer(port);
const browser = await launchBrowser();
const R = new Recette(browser, port, lang, input, '-2');
const fast = input !== 'kb';

const modalTitle = () => R.$(() => (window.copytrack.ui.modalOpen ? (document.getElementById('modal-title') || {}).textContent : null));
const modalOpen = () => R.$(() => window.copytrack.ui.modalOpen);
async function closeModal() {
  if (!(await modalOpen())) return true;
  await R.key('Escape'); await sleep(250);
  if (await modalOpen()) { await R.$(() => window.copytrack.ui.closeModal()); return false; }
  return true;
}
async function toMenu() {
  await closeModal();
  await R.$(() => { const A = window.copytrack; if (A.mode === 'race' || A.mode === 'replay') A.quitRace(); });
  await sleep(300);
  await R.$(() => { const A = window.copytrack; if (A.mode === 'editor') A.leaveEditor(); });
  await sleep(300);
  await R.$(() => { const A = window.copytrack; if (A.mode !== 'menu' || document.getElementById('menu').classList.contains('hidden')) A.showMenu('menu'); });
  await R.until(() => window.copytrack.mode === 'menu' && !document.getElementById('menu').classList.contains('hidden'), null, 20000);
  await rot(false);
  await R.$(() => { const A = window.copytrack; if (!document.getElementById('menu-tiles').classList.contains('hidden')) return; A._lastPanel = null; A._menuSub(null, true); });
}
const rot = async (land) => { if (input === 'port') { await R.page.setViewportSize(land ? { width: 844, height: 390 } : { width: 390, height: 844 }); await sleep(700); } };
async function racing() {
  if (input === 'port' && (await R.$(() => !!window.copytrack.session && window.copytrack.mode === 'race'))) { await rot(true); await sleep(800); }
  await R.until(() => window.copytrack.session && (window.copytrack.session.state === 'racing' || window.copytrack.session.state === 'paused'), null, 90000);
  if (await R.$(() => window.copytrack.session.state === 'paused') && !(await R.$(() => window.copytrack.mode !== 'race'))) { await R.press('#pause [data-action="resume"]').catch(() => {}); await sleep(400); }
  await R.until(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 90000);
}
const panelEntry = async (p, a) => { await toMenu(); await R.press(`#menu [data-action="sub-${p}"]`); await sleep(250); await R.press(`#menu-sub-${p} [data-action="${a}"]`); await sleep(800); };

try {
  await R.init();
  await R.load('Novice');
  await R.enter('Novice');
  if (fast) await R.$(() => window.copytrack.quality.apply('ultrapotato'));
  // Joueur novice : le tutoriel est passé par son bouton « Passer » (le jeu met alors l'éditeur en mode guidé : _tutorialDone).
  await R.until(() => window.copytrack.ui.modalOpen, null, 10000).catch(() => {});
  if (await modalOpen()) { await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(400); }
  await R.until(() => window.copytrack.ui.modalOpen, null, 14000).catch(() => {});
  if (await modalOpen()) { await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(400); }
  R.guided = await R.$(() => window.copytrack.settings.editorGuided);
  await R.step('départ : profil de joueur novice (éditeur guidé = ' + R.guided + ')', null);

  // ------------------------------------------------------------------------------------------------------------------------------------ commandes : réassigner puis courir
  await R.step('réglages › commandes : ouverture', async () => { await panelEntry('settings', 'tab-controls'); await sleep(500); });
  await R.step('commandes : onglets Course / Éditeur / Manette', async () => {
    for (const t of ['editor', 'pad', 'race']) { await R.press(`#bind-tabs [data-tab="${t}"]`); await sleep(300); const n = await R.$(() => document.querySelectorAll('#bind-list *').length); if (n < 5) throw new Error('liste vide pour ' + t); }
  });
  let before;
  await R.step('commandes : réassigner « accélérer » (case 1) à la touche I', async () => {
    before = await R.$(() => window.copytrack.input.bindings.accelerate.slice());
    await R.press('#bind-list .bind-key'); await sleep(300);
    if (!(await R.$(() => document.querySelector('#bind-list .bind-key.wait')))) throw new Error('la case ne passe pas en attente');
    await R.key('KeyI'); await sleep(400);
    const now = await R.$(() => window.copytrack.input.bindings.accelerate.slice());
    R.rebind = [before, now];
    if (now[0] !== 'KeyI') {
      // tactile : pas de clavier physique ; la réassignation par un vrai événement clavier reste possible
      throw new Error('liaison inchangée : ' + JSON.stringify(now));
    }
  });
  await R.step('commandes : course avec la nouvelle touche', async () => {
    await toMenu(); await R.press('#menu [data-action="sub-play"]'); await sleep(250); await R.press('#menu-sub-play [data-action="quick"]');
    await racing();
    if (R.touch) { await R.gas(true); await sleep(2000); await R.gas(false); } else { await R.page.keyboard.down('KeyI'); await sleep(2200); await R.page.keyboard.up('KeyI'); }
    const v = await R.$(() => window.copytrack.session.phys.fwdSpeed);
    if (!(v > 3)) throw new Error('la voiture n’avance pas avec la touche réassignée (' + v + ' m/s)');
    R.rebindSpeed = v;
  });
  await R.step('commandes : course, l’ancienne touche (flèche haut) n’accélère plus', async () => {
    if (R.touch) return;
    await R.$(() => window.copytrack.session.restart && window.copytrack.session.restart()); await racing();
    await R.page.keyboard.down('ArrowUp'); await sleep(1800); await R.page.keyboard.up('ArrowUp');
    const v = await R.$(() => window.copytrack.session.phys.fwdSpeed);
    const slot2 = await R.$(() => window.copytrack.input.bindings.accelerate.slice());
    if (v > 3 && !slot2.includes('ArrowUp')) throw new Error('la flèche haut accélère encore alors qu’elle n’est plus liée (' + v.toFixed(1) + ' m/s ; liaisons ' + slot2 + ')');
  }, { audit: false });
  await toMenu();
  await R.step('commandes : « Rétablir par défaut »', async () => {
    await panelEntry('settings', 'tab-controls'); await R.press('#bind-tabs [data-action="reset-keys"]'); await sleep(500);
    if (await R.$(() => !!document.getElementById('modal-title') && window.copytrack.ui.modalOpen)) { await R.step('commandes : confirmation', null); await R.page.locator('#modal-actions button').first().evaluate((b) => b.click()); await sleep(400); }
    const now = await R.$(() => window.copytrack.input.bindings.accelerate.slice());
    if (now[0] === 'KeyI') throw new Error('les liaisons ne sont pas rétablies : ' + now);
  });

  // ------------------------------------------------------------------------------------------------------------------------------------ modes, Académie, défi du jour
  await R.step('modes : menu', async () => { await panelEntry('play', 'modes'); });
  await R.step('modes : un mode intégré, fiche « Jouer le mode »', async () => {
    await R.press('#modal-body [data-mode] button, #modal-body [data-mode]'); await sleep(900);
    R.modeModal = await modalTitle();
  });
  await closeModal();
  await R.step('Académie : menu des leçons', async () => { await panelEntry('play', 'academy'); });
  await R.step('Académie : leçon 1, consignes', async () => { await R.press('#modal-body [data-lesson="0"]'); await sleep(800); });
  await R.step('Académie : « Retour » ramène au menu des leçons', async () => { const bs = await R.$(() => [...document.querySelectorAll('#modal-actions button')].map((b) => b.textContent.trim())); await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(500); const t = await modalTitle(); if (!/cadémie|cademy/.test(t || '')) throw new Error('titre après retour : ' + t + ' (boutons : ' + bs + ')'); });
  await closeModal();
  await R.step('défi du jour : fiche', async () => { await panelEntry('play', 'daily'); await sleep(1500); });
  await R.step('défi du jour : jouer', async () => { await R.press('#hub-play'); await R.until(() => window.copytrack.mode === 'race', null, 40000); await racing(); await R.gas(true); await sleep(1500); await R.gas(false); });
  await toMenu();

  // (L'éditeur en joueur novice a son propre parcours : tools/recette/editeur.mjs.)

  // ------------------------------------------------------------------------------------------------------------------------------------ communauté, hors ligne, puis serveur simulé
  await R.step('communauté : réseau indisponible (message propre)', async () => { await panelEntry('play', 'community'); await sleep(2500); });
  await R.step('communauté : chaque onglet', async () => {
    const tabs = await R.$(() => [...document.querySelectorAll('#comm-tabs .tab')].map((t) => t.dataset.sort));
    for (const s of tabs) { await R.press(`#comm-tabs [data-sort="${s}"]`); await sleep(600); }
    R.commTabs = tabs;
  }, { shot: false });
  await R.step('communauté : onglet Playlists', async () => { await R.press('#comm-tabs [data-sort="playlists"]'); await sleep(700); });
  await toMenu();
  await R.step('communauté (serveur simulé) : liste, cartes, fiche', async () => {
    await R.$(async () => {
      const { online } = await import('/js/online.js');
      const mk = (i, n) => { const b = window.copytrack.builtins[i]; return { id: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`, name: n, decor: b.def.decor, code: b.track.encode(), author_time: 20, pieces: b.track.tiles.length, laps: 1, plays: 10, likes: 3, created_at: '2026-01-01', author: 'Autrice', author_id: 'a1', verified: true }; };
      online.listTracks = async () => [mk(0, 'Récent A'), mk(40, 'Récent B'), mk(12, 'Un circuit au nom très très très long pour tester les cartes')];
      online.trending = async () => [mk(40, 'Star')];
      online.myLikes = async () => new Set();
      window.copytrack._comm = null; window.copytrack._featured = null;
    });
    await panelEntry('play', 'community');
    await R.until(() => document.querySelectorAll('#comm-list .card').length >= 3, null, 15000); await sleep(500);
  });
  await R.step('communauté (simulé) : ouvrir une carte → fiche', async () => { await R.page.locator('#comm-list .card h3').first().evaluate((h) => h.click()); await R.until(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 15000); await sleep(1500); });
  await R.step('fiche communautaire : classement (serveur simulé en erreur 500)', async () => {
    await R.$(async () => { const { online } = await import('/js/online.js'); online.leaderboard = async () => { throw new Error('HTTP 500'); }; });
    await R.$(() => window.copytrack.openCommunityHub && null); await sleep(1200);
  });
  await toMenu();

  // ------------------------------------------------------------------------------------------------------------------------------------ langue en cours de route
  const other = lang === 'en' ? 'fr' : 'en';
  await R.step(`langue : Paramètres › Audio › Langue → ${other}`, async () => {
    await panelEntry('settings', 'tab-audio');
    await R.page.locator('#opt-lang').selectOption(other); await sleep(900);
    R.lang = other;
  });
  await R.step(`langue (${other}) : menu`, async () => { await R.press('#profile [data-action="back"]'); await sleep(500); await R.press('#menu-sub-settings [data-action="sub-back"]').catch(() => {}); await sleep(400); });
  for (const [p, a] of [['play', 'play'], ['progress', 'tab-stats'], ['profile', 'garage']]) await R.step(`langue (${other}) : ${p} › ${a}`, async () => { await panelEntry(p, a); await sleep(500); });
  await R.step(`langue (${other}) : course, pause`, async () => {
    await toMenu(); await R.press('#menu [data-action="sub-play"]'); await sleep(250); await R.press('#menu-sub-play [data-action="quick"]');
    await racing();
    await R.gas(true); await sleep(1200); await R.gas(false);
    if (R.touch) { await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerdown'); await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerup'); } else await R.key('Escape');
    await R.until(() => window.copytrack.session.state === 'paused', null, 10000); await sleep(400);
  });
  await R.step(`langue (${other}) : arrivée`, async () => {
    await R.press('#pause [data-action="resume"]'); await sleep(400);
    await R.finishWithBot(); await R.until(() => !document.getElementById('finish').classList.contains('hidden'), null, 30000); await sleep(1500);
  });
  await toMenu();
  await R.step(`langue : retour à ${lang}`, async () => { await panelEntry('settings', 'tab-audio'); await R.page.locator('#opt-lang').selectOption(lang); await sleep(700); R.lang = lang; });
  await R.step('langue : l’éditeur dans la langue choisie', async () => { await toMenu(); await panelEntry('create', 'editor'); await R.until(() => window.copytrack.mode === 'editor', null, 30000); await sleep(1500); });
  await toMenu();

  // ------------------------------------------------------------------------------------------------------------------------------------ erreur de course (phase « erreurs de course »)
  await R.step('erreur de course : exception unique dans la boucle', async () => {
    await R.press('#menu [data-action="sub-play"]'); await sleep(250); await R.press('#menu-sub-play [data-action="quick"]');
    await racing();
    await R.gas(true); await sleep(1500);
    await R.$(() => { const S = window.copytrack.session, real = S.update.bind(S); let n = 0; S.update = (...a) => { if (n++ === 0) throw new Error('exception de recette'); return real(...a); }; });
    await sleep(1800);
    R.afterOnce = await R.$(() => ({ mode: window.copytrack.mode, state: window.copytrack.session && window.copytrack.session.state, toast: document.getElementById('toast').textContent, modal: window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : null }));
    await R.gas(false);
  });
  await R.step('erreur de course : exceptions répétées → la course est arrêtée proprement', async () => {
    await R.$(() => { const S = window.copytrack.session; if (S) S.update = () => { throw new Error('exception répétée de recette'); }; });
    await sleep(3500);
    R.afterRepeat = await R.$(() => ({ mode: window.copytrack.mode, session: !!window.copytrack.session, toast: document.getElementById('toast').textContent, modal: window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : null }));
  }, { audit: true });
  R.errors.length = 0;       // les exceptions voulues ci-dessus ne sont pas des constats
  await toMenu();

  // ------------------------------------------------------------------------------------------------------------------------------------ synchronisation (invité)
  await R.step('compte : état de synchronisation (invité)', async () => { await panelEntry('profile', 'tab-account'); await sleep(900); });
  await R.step('sauvegardes : code joueur, export, import', async () => { await R.press('#prof-tabs [data-ptab="saves"]'); await sleep(900); });
  await R.step('amis (invité hors ligne)', async () => { await R.press('#prof-tabs [data-ptab="friends"]'); await sleep(1200); });
} catch (e) {
  console.log('PARCOURS INTERROMPU :', e.stack || e.message);
  R.steps.push({ n: ++R.n, label: 'PARCOURS INTERROMPU', status: 'defaut', issues: [String(e.message).slice(0, 400)], errors: [] });
  try { await R.page.screenshot({ path: R.dir + '/zz-interrompu.png' }); } catch { /* page fermée */ }
} finally {
  R.save();
  const extra = { rebind: R.rebind, rebindSpeed: R.rebindSpeed, guided: R.guided, edGuided: R.edGuided, edPlaced: R.edPlaced, edUndo: R.edUndo, edQuit: R.edQuit, edQuitButtons: R.edQuitButtons, myTracks: R.myTracks, commTabs: R.commTabs, afterOnce: R.afterOnce, afterRepeat: R.afterRepeat, modeModal: R.modeModal };
  console.log('EXTRA ' + JSON.stringify(extra));
  const bad = R.steps.filter((s) => s.status !== 'ok').length;
  console.log(`\n=== ${R.id} : ${R.steps.length} étapes, ${bad} avec constat, ${R.net} erreurs réseau filtrées ===`);
  await browser.close(); server.kill();
}
