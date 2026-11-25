// Recette : parcours d'un NOUVEAU joueur (premières minutes), un profil neuf par exécution.
//   node tools/recette/journey.mjs <fr|en> <kb|land|port>
// accueil, tutoriel, première course guidée, tour de chaque entrée de menu, onglets du profil / progression / paramètres, carrière, fiche de circuit, course, pause (toutes les entrées),
// arrivée (tous les boutons), replay, Theater, garage (chaque famille). Rapport : OUT/<langue>-<entrée>.json, captures dans OUT/<langue>-<entrée>/.
// Constate seulement. Ne corrige rien.
import { Recette, launchBrowser, startServer, sleep } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'kb';
const port = 8700 + Math.floor(Math.random() * 600);
const server = startServer(port);
const browser = await launchBrowser();
const R = new Recette(browser, port, lang, input);
const fast = input !== 'kb';       // écran de téléphone simulé : rendu allégé (le jeu le fait lui-même sur mobile ; ce n'est pas l'objet du parcours)

const modalTitle = () => R.$(() => (window.copytrack.ui.modalOpen ? (document.getElementById('modal-title') || {}).textContent : null));
const modalBtns = () => R.$(() => [...document.querySelectorAll('#modal-actions button')].map((b) => b.textContent.trim()));
const mode = () => R.$(() => window.copytrack.mode);
async function closeModal() {
  if (!(await R.$(() => window.copytrack.ui.modalOpen))) return true;
  await R.key('Escape'); await sleep(250);
  if (await R.$(() => window.copytrack.ui.modalOpen)) { await R.$(() => window.copytrack.ui.closeModal()); return false; }      // fermée seulement par l'API : Échap ne la ferme pas
  return true;
}
const modalPress = async (i) => { await R.page.locator('#modal-actions button').nth(i).waitFor({ state: 'visible', timeout: 8000 }); await R.press(`#modal-actions button:nth-child(${i + 1})`); await sleep(350); };
async function pauseNow() {
  if (R.touch) { await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerdown'); await R.page.locator('#touch [data-t="pause"]').dispatchEvent('pointerup'); } else await R.key('Escape');
  await R.until(() => window.copytrack.session && window.copytrack.session.state === 'paused', null, 15000);
  await sleep(300);
}
const rot = async (land) => { if (input === 'port') { await R.page.setViewportSize(land ? { width: 844, height: 390 } : { width: 390, height: 844 }); await sleep(700); } };
// Portrait : une course démarre en pause sous l'invite « Tourne ton téléphone » (voulu) ; on tourne l'écran puis on reprend, comme un joueur.
async function racing() {
  if (input === 'port' && (await R.$(() => !!window.copytrack.session && window.copytrack.mode === 'race'))) { await rot(true); await sleep(800); }
  await R.until(() => window.copytrack.session && (window.copytrack.session.state === 'racing' || window.copytrack.session.state === 'paused'), null, 90000);
  if (await R.$(() => window.copytrack.session.state === 'paused') && !(await R.$(() => window.copytrack.mode !== 'race'))) { await R.press('#pause [data-action="resume"]').catch(() => {}); await sleep(400); }
  await R.until(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 90000);
}
async function toMenu() {
  await closeModal();
  await R.$(() => { const A = window.copytrack; if (A.mode === 'race' || A.mode === 'replay') A.quitRace(); });
  await sleep(300);
  await R.$(() => { const A = window.copytrack; if (A.mode !== 'menu' || document.getElementById('menu').classList.contains('hidden')) A.showMenu('menu'); });
  await R.until(() => window.copytrack.mode === 'menu' && !document.getElementById('menu').classList.contains('hidden'), null, 20000);
  await rot(false);
  await R.$(() => { const A = window.copytrack; if (!document.getElementById('menu-tiles').classList.contains('hidden')) return; A._lastPanel = null; A._menuSub(null, true); });
}

try {
  // ------------------------------------------------------------------------------------------------------------------------------------ accueil
  await R.init();
  await R.load('Recette');
  await R.step('accueil : bienvenue (invité)', null);
  if (lang === 'en') await R.step('accueil : choix de English', () => R.press('#welcome [data-lang="en"]'));
  else {
    await R.step('accueil : bascule vers English', async () => { R.lang = 'en'; await R.press('#welcome [data-lang="en"]'); await sleep(300); });
    R.lang = 'fr';
    await R.step('accueil : retour à Français', () => R.press('#welcome [data-lang="fr"]'));
  }
  for (const tab of ['login', 'signup']) await R.step(`accueil : onglet ${tab}`, () => R.press(`#welcome [data-wl="${tab}"]`));
  await R.step('accueil : création de compte sans accepter les règles (message attendu)', async () => {
    await R.page.locator('#wl-name').fill('Recette');
    await R.page.locator('#wl-pw').fill('motdepasse-123'); await R.page.locator('#wl-pw2').fill('motdepasse-123');
    await R.press('#wl-submit'); await sleep(900);
    const err = await R.$(() => document.getElementById('wl-error').textContent.trim());
    if (!err) throw new Error('aucun message d’erreur affiché');
    R.lastWlError = err;
  });
  await R.step('accueil : connexion hors ligne (message attendu, pas d’erreur)', async () => {
    await R.press('#welcome [data-wl="login"]');
    await R.page.locator('#wl-name').fill('Recette'); await R.page.locator('#wl-pw').fill('motdepasse-123');
    await R.press('#wl-submit'); await sleep(2500);
    const err = await R.$(() => document.getElementById('wl-error').textContent.trim());
    if (!err) throw new Error('aucun message : la connexion hors ligne n’a rien dit');
    R.lastWlError2 = err;
  });
  await R.step('accueil : invité sans pseudo (message attendu)', async () => {
    await R.press('#welcome [data-wl="guest"]');
    await R.page.locator('#wl-name').fill('');
    await R.press('#wl-submit'); await sleep(600);
    const err = await R.$(() => document.getElementById('wl-error').textContent.trim());
    if (!err) throw new Error('aucun message d’erreur affiché pour un pseudo vide');
  });
  await R.page.locator('#wl-name').fill('Recette');
  await R.press('#wl-submit');
  await R.until(() => window.copytrack && window.copytrack.mode === 'menu', null, 90000);
  if (fast) await R.$(() => window.copytrack.quality.apply('ultrapotato'));

  // ------------------------------------------------------------------------------------------------------------------------------------ premières fenêtres
  await R.step('menu juste après l’accueil', null);
  // Le tutoriel s'ouvre 700 ms après le démarrage (nouveau joueur) ; la question des statistiques arrive ensuite (≥ 4 s, 8 s tant qu'une fenêtre est ouverte).
  await R.until(() => window.copytrack.ui.modalOpen, null, 10000).catch(() => {});
  let t = await modalTitle();
  R.firstModal = t;
  if (t && /\(1\/3\)/.test(t)) {
    await R.step('tutoriel 1/3', null);
    R.tutoButtons = await modalBtns();
    await R.step('tutoriel : Suivant → 2/3', () => modalPress(1));
    await R.step('tutoriel : Suivant → 3/3', () => modalPress(1));
    await R.step('tutoriel : Précédent → 2/3', () => modalPress(0));
    await R.step('tutoriel : Précédent → 1/3', () => modalPress(0));
    await R.step('tutoriel : Première course guidée (démarre la leçon 1)', async () => { await R.press('#modal-actions [data-tuto="guided"]'); await sleep(800); });
    await R.until(() => window.copytrack.mode === 'race' || window.copytrack.session, null, 60000).catch(() => {});
    await sleep(500);
    // La leçon s'ouvre sur une fenêtre de consignes (« Commencer ») ou démarre directement.
    for (let i = 0; i < 3 && (await R.$(() => window.copytrack.ui.modalOpen)); i++) {
      await R.step(`leçon 1 : fenêtre « ${(await modalTitle()) || ''} »`, null);
      const bs = await modalBtns();
      await modalPress(bs.length > 1 ? 0 : 0);
    }
    await racing().catch(() => {});
    await R.step('leçon 1 : course guidée au départ (consignes à l’écran)', null);
    await R.gas(true); await sleep(3500);
    await R.step('leçon 1 : en roulant', async () => { const v = await R.$(() => window.copytrack.session.phys.fwdSpeed); if (!(v > 3)) throw new Error('la voiture n’avance pas (' + v + ' m/s)'); });
    await R.gas(false);
    await R.step('leçon 1 : pause', () => pauseNow());
    await R.step('leçon 1 : quitter la leçon', async () => { await R.press('#pause [data-action="quit"]'); await R.until(() => window.copytrack.mode === 'menu' || !!document.querySelector('#modal-title'), null, 20000); await sleep(500); });
    await closeModal();
  } else if (t) { await R.step('première fenêtre : ' + t, null); await closeModal(); }
  // La question des statistiques anonymes
  await R.until(() => window.copytrack.ui.modalOpen, null, 14000).catch(() => {});
  t = await modalTitle();
  if (t) { await R.step('fenêtre suivante : ' + t, null); R.secondModal = t; await modalPress((await modalBtns()).length - 1); }
  await toMenu();
  await R.step('menu après les premières fenêtres', null);

  // ------------------------------------------------------------------------------------------------------------------------------------ tour du menu
  const panels = ['play', 'create', 'multi', 'progress', 'profile', 'settings'];
  for (const p of panels) {
    await R.step(`menu : panneau ${p}`, async () => { await toMenu(); await R.press(`#menu [data-action="sub-${p}"]`); await sleep(350); });
    const entries = await R.$((p) => [...document.querySelectorAll(`#menu-sub-${p} .menu-entry`)].map((e) => ({ a: e.dataset.action || null, href: e.getAttribute('href'), txt: (e.querySelector('b') || e).textContent.trim() })), p);
    for (const e of entries) {
      const lbl = `menu › ${p} › ${e.a || e.txt}`;
      if (e.href) { await R.step(lbl + ' (lien ' + e.href + ')', async () => { const tg = await R.$((p) => document.querySelector(`#menu-sub-${p} a.menu-entry`).target, p); if (tg !== '_blank') throw new Error('target=' + tg); }, { audit: false, shot: false }); continue; }
      if (e.a === 'quick') continue;      // course : vue plus bas
      if (e.a === 'editor') continue;      // vu dans journey2 (éditeur en joueur novice)
      await R.step(lbl, async () => {
        await toMenu(); await R.press(`#menu [data-action="sub-${p}"]`); await sleep(300);
        await R.press(`#menu-sub-${p} [data-action="${e.a}"]`); await sleep(900);
      });
      // retour : « ← Retour » / fermeture de la fenêtre, comme un joueur
      await R.step(lbl + ' : retour', async () => {
        if (await R.$(() => window.copytrack.ui.modalOpen)) { if (!(await closeModal())) throw new Error('Échap ne ferme pas la fenêtre « ' + (await modalTitle()) + ' »'); }
        else {
          const sel = await R.$(() => { const A = window.copytrack; return A.mode === 'garage' ? '#garage [data-action="garage-back"]' : ['#race-hub [data-action="hub-back"]', '.screen:not(.hidden) [data-action="back"]'].find((q) => { const el = document.querySelector(q); return el && el.checkVisibility(); }) || null; });
          if (!sel) throw new Error('aucun bouton « Retour » visible sur cet écran');
          await R.press(sel); await sleep(500);
        }
        const m = await mode(); if (m !== 'menu') throw new Error('après « Retour », mode = ' + m);
      }, { audit: false, shot: false });
    }
  }
  await toMenu();

  // ------------------------------------------------------------------------------------------------------------------------------------ profil, progression, paramètres : chaque onglet
  for (const [hub, act] of [['profile', 'tab-account'], ['progress', 'tab-records'], ['settings', 'tab-audio']]) {
    await toMenu();
    await R.step(`écran ${hub} : ouverture`, async () => { await R.press(`#menu [data-action="sub-${hub}"]`); await sleep(300); await R.press(`#menu-sub-${hub} [data-action="${act}"]`); await sleep(800); });
    const tabs = await R.$(() => [...document.querySelectorAll('#prof-tabs .tab')].map((t) => ({ p: t.dataset.ptab, txt: t.textContent.trim() })));
    for (const tb of tabs) await R.step(`écran ${hub} › onglet ${tb.p}`, async () => { await R.press(`#prof-tabs [data-ptab="${tb.p}"]`); await sleep(500); });
    await R.step(`écran ${hub} : retour`, async () => { await R.press('#profile [data-action="back"]'); await sleep(500); const m = await mode(); if (m !== 'menu') throw new Error('mode ' + m); }, { audit: false, shot: false });
  }

  // ------------------------------------------------------------------------------------------------------------------------------------ carrière → fiche → course
  await toMenu();
  await R.step('carrière : liste des circuits', async () => { await R.press('#menu [data-action="sub-play"]'); await sleep(300); await R.press('#menu-sub-play [data-action="play"]'); await R.until(() => document.querySelectorAll('#track-list .card .num').length > 5, null, 20000); await sleep(600); });
  await R.step('carrière : défilement de la liste (le dernier chapitre est atteignable)', async () => {
    const r = await R.$(() => { const l = document.getElementById('track-list'); const sc = [...document.querySelectorAll('#tracks, #track-list')].find((e) => e.scrollHeight > e.clientHeight + 5) || document.scrollingElement; sc.scrollTop = sc.scrollHeight; return { n: document.querySelectorAll('#track-list .card').length, lockedLast: !!document.querySelector('#track-list .card.locked:last-of-type'), l: !!l }; });
    if (r.n < 72) throw new Error('moins de 72 cartes : ' + r.n);
    await R.$(() => { const sc = [...document.querySelectorAll('#tracks, #track-list')].find((e) => e.scrollTop > 0) || document.scrollingElement; sc.scrollTop = 0; });
  }, { shot: false });
  await R.step('carrière : fiche du premier circuit', async () => { await R.press('#track-list .card:has(.num) .thumb'); await R.until(() => !document.getElementById('race-hub').classList.contains('hidden'), null, 15000); await sleep(1200); });
  await R.step('fiche : zoom de la carte, favori', async () => { await R.press('[data-action="hub-zoom-in"]'); await R.press('[data-action="hub-zoom-fit"]'); await R.press('#hub-fav'); await sleep(300); });
  await R.step('fiche : onglet Personnel', async () => { await R.press('#hub-board .lb-tabs [data-tab="personal"]'); await sleep(300); }, { soft: [] });
  await R.step('fiche : Jouer → décompte', async () => { await R.press('#hub-play'); await R.until(() => window.copytrack.mode === 'race', null, 30000); await sleep(1200); });
  await racing();
  await R.step('course : au départ', null);
  await R.gas(true); await sleep(3000);
  await R.step('course : en roulant (HUD, boutons)', async () => { const v = await R.$(() => window.copytrack.session.phys.fwdSpeed); if (!(v > 3)) throw new Error('la voiture n’avance pas (' + v + ' m/s)'); });
  await R.gas(false);

  // ------------------------------------------------------------------------------------------------------------------------------------ pause : toutes les entrées
  await R.step('pause : ouverture', () => pauseNow());
  await R.step('pause : Caméra (change)', async () => { const a = await R.$(() => window.copytrack.session.cameraMode || window.copytrack.session.camMode || document.getElementById('pq-cam').textContent); await R.press('#pause [data-action="pause-camera"]'); await sleep(300); const b = await R.$(() => window.copytrack.session.cameraMode || window.copytrack.session.camMode || document.getElementById('pq-cam').textContent); R.camChange = [a, b]; });
  await R.step('pause : Commandes (aide-mémoire), Échap ramène à la pause', async () => {
    await R.press('#pause [data-action="help"]'); await sleep(500);
    if (!(await R.$(() => window.copytrack.ui.modalOpen))) throw new Error('aucune fenêtre');
    await R.step('pause › Commandes (fenêtre)', null);
    await closeModal(); await sleep(300);
    const st = await R.$(() => window.copytrack.session.state);
    if (st !== 'paused') throw new Error('après la fenêtre, état de la course : ' + st);
  });
  await R.step('pause : réglages rapides (curseurs)', async () => {
    const r = await R.$(() => { const ids = ['pq-volume', 'pq-music', 'pq-shake', 'pq-fov']; return ids.map((id) => { const el = document.getElementById(id); if (!el) return id + ':absent'; const old = el.value; el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); el.value = old; el.dispatchEvent(new Event('input', { bubbles: true })); return id + ':ok'; }); });
    if (r.some((x) => /absent/.test(x))) throw new Error(r.join(' '));
  }, { shot: false });
  await R.step('pause : Retour au checkpoint (reprend la course)', async () => { await R.press('#pause [data-action="pause-respawn"]'); await sleep(600); const st = await R.$(() => window.copytrack.session.state); if (st !== 'racing') throw new Error('état ' + st); });
  await pauseNow();
  await R.step('pause : Recommencer', async () => { await R.press('#pause [data-action="restart"]'); await sleep(600); });
  await racing();
  await R.gas(true); await sleep(1500); await R.gas(false);
  await pauseNow();
  await R.step('pause : Reprendre', async () => { await R.press('#pause [data-action="resume"]'); await sleep(500); const st = await R.$(() => window.copytrack.session.state); if (st !== 'racing') throw new Error('état ' + st); });
  if (!R.touch) {
    await R.step('pause au clavier : Échap, Échap reprend ; R ; Entrée recommence', async () => {
      await pauseNow(); await R.key('Escape'); await R.until(() => window.copytrack.session.state === 'racing', null, 8000);
      await R.gas(true); await sleep(1200); await R.gas(false);
      await R.key('KeyR'); await sleep(500);
      await R.key('Enter'); await sleep(700);
      const steps = await R.$(() => window.copytrack.session.logic.steps);
      if (steps > 90) throw new Error('Entrée n’a pas recommencé (pas ' + steps + ')');
    }, { audit: false, shot: false });
  }
  await racing();
  await R.step('course : arrière-plan (onglet masqué 2 s, retour)', async () => {
    await R.$(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(2000);
    await R.$(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(800);
  }, { soft: [] });
  await toMenu();

  // ------------------------------------------------------------------------------------------------------------------------------------ arrivée
  await R.step('course rapide : un clic', async () => { await R.press('#menu [data-action="sub-play"]'); await sleep(300); await R.press('#menu-sub-play [data-action="quick"]'); await R.until(() => window.copytrack.mode === 'race', null, 40000); }, { audit: false, shot: false });
  await racing();
  const fin = await R.finishWithBot();
  R.finish1 = fin;
  await R.until(() => !document.getElementById('finish').classList.contains('hidden'), null, 30000).catch(() => {});
  await sleep(1500);
  await R.step('arrivée : écran (' + JSON.stringify(fin) + ')', null);
  await R.step('arrivée › Classement (hors ligne)', async () => { await R.press('#fin-board'); await sleep(1500); await R.step('arrivée › Classement (fenêtre)', null); await closeModal(); await sleep(300); });
  await R.step('arrivée › Partager mon fantôme', async () => { await R.press('#fin-ghost'); await sleep(900); await R.step('arrivée › Partager mon fantôme (fenêtre)', null); await closeModal(); await sleep(300); });
  await R.step('arrivée › Revoir la course (replay)', async () => { await R.press('#fin-replay'); await sleep(2500); });
  await R.step('replay : barre, pause', async () => { await R.key('Space').catch(() => {}); await sleep(300); });
  await R.step('replay : quitter', async () => {
    const q = await R.$(() => { const b = document.querySelector('#replay-bar [data-action="quit"], #replay-bar [data-action="replay-quit"]'); return !!b; });
    if (R.touch || !q) await R.$(() => window.copytrack.quitRace()); else await R.key('Escape');
    await sleep(800);
  });
  await R.step('après le replay : où est-on ?', null);
  await R.$(() => { const A = window.copytrack; if (A.mode === 'menu') { A.showMenu('tracks'); A.openBuiltinHub(window.copytrack._lastQuick || 0, 'tracks'); } });
  await sleep(500);
  await R.step('fiche après arrivée : Regarder le record (Theater)', async () => {
    if (!(await R.$(() => !document.getElementById('race-hub').classList.contains('hidden')))) await R.$(() => { const A = window.copytrack; A.showMenu('tracks'); A.openBuiltinHub(A.builtins.findIndex((b) => b.key === (A.session && A.session.key)) >= 0 ? 0 : 0, 'tracks'); });
    await R.press('#hub-watch', 8000);
    await R.until(() => window.copytrack.session && window.copytrack.session._th && window.copytrack.session._th.traces, null, 30000);
    await sleep(1500);
  });
  await R.step('Theater : analyse (panneau)', async () => { const has = await R.$(() => !!document.querySelector('#theater-panel, #theater')); if (!has) throw new Error('pas de Theater'); await sleep(300); });
  await R.step('Theater : quitter', async () => { await R.$(() => window.copytrack.quitRace()); await sleep(1000); });
  await toMenu();

  // ------------------------------------------------------------------------------------------------------------------------------------ garage : chaque famille
  await R.step('garage : ouverture', async () => { await R.press('#menu [data-action="sub-profile"]'); await sleep(300); await R.press('#menu-sub-profile [data-action="garage"]'); await R.until(() => window.copytrack.mode === 'garage', null, 20000); await sleep(1500); });
  const groups = await R.$(() => [...document.querySelectorAll('#garage-tabs .gtab')].map((g) => ({ g: g.dataset.group, txt: g.textContent.trim() })));
  R.garageGroups = groups.length;
  for (const g of groups) {
    await R.step(`garage › famille ${g.txt}`, async () => { await R.press(`#garage-tabs .gtab[data-group="${g.g}"]`); await sleep(400); });
    const subs = await R.$((g) => [...document.querySelectorAll(`#garage-tabs .gtab-sub .tab[data-group="${g}"]`)].map((t) => ({ cat: t.dataset.cat, txt: t.textContent.trim() })), g.g);
    for (const s of subs) await R.step(`garage › ${g.txt} › ${s.txt}`, async () => { await R.press(`#garage-tabs .tab[data-cat="${s.cat}"]`); await sleep(600); });
  }
  await R.step('garage : choisir un élément, Débloquer / Annuler, moto', async () => {
    const n = await R.$(() => document.querySelectorAll('#garage-list .garage-item, #garage-list .item, #garage-list button, #garage-list > *').length);
    if (n === 0) throw new Error('la liste du garage est vide');
    await R.page.locator('#garage-list > *').nth(Math.min(1, n - 1)).evaluate((el) => el.click());
    await sleep(500);
    if (await R.$(() => !document.getElementById('garage-moto').classList.contains('hidden'))) { await R.press('#garage-moto'); await sleep(500); await R.press('#garage-moto'); await sleep(300); }
  });
  await R.step('garage : retour', async () => { await R.press('#garage [data-action="garage-back"]'); await R.until(() => window.copytrack.mode === 'menu', null, 15000); }, { audit: false, shot: false });
  await R.step('fin du parcours : menu', null);
} catch (e) {
  console.log('PARCOURS INTERROMPU :', e.stack || e.message);
  R.steps.push({ n: ++R.n, label: 'PARCOURS INTERROMPU', status: 'defaut', issues: [String(e.message).slice(0, 400)], errors: [] });
  try { await R.page.screenshot({ path: R.dir + '/zz-interrompu.png' }); } catch { /* page fermée */ }
} finally {
  R.save();
  console.log('EXTRA ' + JSON.stringify({ firstModal: R.firstModal, secondModal: R.secondModal, tutoButtons: R.tutoButtons, camChange: R.camChange, finish1: R.finish1, garageGroups: R.garageGroups, wl: [R.lastWlError, R.lastWlError2] }));
  const bad = R.steps.filter((s) => s.status !== 'ok').length;
  console.log(`\n=== ${R.id} : ${R.steps.length} étapes, ${bad} avec constat, ${R.net} erreurs réseau filtrées ===`);
  await browser.close(); server.kill();
}
