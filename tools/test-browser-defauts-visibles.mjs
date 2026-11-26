// Petits défauts visibles (phase 4 du plan de correction, LOT-10 et RISK-002 : docs/audit/AUDIT_COMPLET.md) dans un vrai navigateur
// (Chromium sans écran, WebGL logiciel) : node tools/test-browser-defauts-visibles.mjs   (npm run test:browser)
//
// Chaque identifiant a été reproduit sur le code d'avant (le test échouait), puis corrigé : ce sont des tests de régression ordinaires.
//   TECH-019  dalle de verre brisée de nouveau visible (reconstruction du maillage, règle de logique « montrer »)
//   TECH-061  miniature périmée dans la fiche d'un circuit (modification de même longueur)
//   TECH-063  garage : minuterie de l'atelier non annulée à la sortie (voiture orpheline)
//   TECH-064  aides à la conduite : bouton « Fiche du circuit » absent à l'arrivée
//   TECH-067  démonstration du menu : vibrations du téléphone et de la manette
//   TECH-068  Theater : caméra affichée « Poursuite » alors que « Capot » est réglée
//   TECH-069  Theater : déplacement dans le temps sans les scripts, effets de logique en rafale
//   TECH-070  HUD : verrou de priorité non remis à zéro au redémarrage
//   TECH-071  anglais : ligne de récompense de l'arrivée à moitié traduite
//   RISK-002  anglais : le traducteur DOM réécrit les contenus de joueurs
//   TECH-072 / TECH-073 : « à vérifier » ; leur sort est écrit dans la section correspondante plus bas.
// Playwright absent : test ignoré en local, ÉCHEC en CI (comme tools/test-browser.mjs).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test, finish, precondition } from './harness.mjs';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
let chromium;
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9700 + Math.floor(Math.random() * 250);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;

// Une page neuve : stockage vierge, entrée en invité, tutoriel et question des statistiques écartés. `init` : script exécuté avant le chargement.
async function fresh({ lang = 'fr-FR', init } = {}) {
  const ctx = await browser.newContext({ locale: lang, viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Essai');
  await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.copytrack.ui.closeModal());
  return { ctx, page };
}
const poll = { timeout: 40000, polling: 100 };
const frames = (page, n = 8) => page.evaluate((n) => new Promise((done) => { let k = 0; const f = () => { if (++k >= n) done(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
const racingOn = async (page, i) => {
  await page.evaluate((i) => window.copytrack.playBuiltin(i), i);
  await page.waitForFunction(() => { const S = window.copytrack.session; return window.copytrack.mode === 'race' && S && !S.demo && S.state === 'racing' && S.logic.steps > 10; }, null, poll);
};
const scenario = (opts, fn) => async () => {
  const before = errors.length;
  const { ctx, page } = await fresh(opts);
  let err;
  try { await fn(page); } catch (e) { err = e; } finally { await ctx.close(); }
  const pe = errors.slice(before);
  if (pe.length) throw new Error('erreurs de la page : ' + pe.join(' | '));
  if (err) throw err;
};
const pageTest = (name, fn, opts = {}) => test(name, scenario(opts, fn));

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-019
console.log('TECH-019 : dalle de verre brisée');
// « Cristal Fêlé » : des dalles de verre. On brise la première (comme le fait la physique : ensemble `broken` + numéro de version), puis on provoque la situation fautive.
async function cristalBrisee(page) {
  await racingOn(page, await page.evaluate(() => window.copytrack.builtins.findIndex((b) => b.def.id === 'cristalfele')));
  return page.evaluate(() => {
    const A = window.copytrack, S = A.session, v = S.view;
    precondition_(v.glassGroups.length > 0, 'Cristal Fêlé a des dalles de verre');
    const tile = v.glassGroups[0].tile;
    S.phys.broken.add(tile); S.phys.brokenVer++;
    function precondition_(c, m) { if (!c) throw new Error('précondition : ' + m); }
    return { n: v.glassGroups.length };
  });
}
const glassVisible = (page) => page.evaluate(() => { const v = window.copytrack.session.view; const g = v.glassGroups[0]; return { visible: g.grp.visible, attached: g.grp.parent === v.group, broken: window.copytrack.session.phys.broken.has(g.tile) }; });
await pageTest('TECH-019 (a) : dalle brisée, puis baisse de qualité en course (reconstruction du maillage) : la dalle reste invisible', async (page) => {
  await cristalBrisee(page);
  await frames(page, 4);                                           // la boucle voit le nouveau numéro de version : la dalle disparaît
  let g = await glassVisible(page);
  precondition(g.broken && g.attached && !g.visible, 'avant la baisse de qualité, la dalle brisée est invisible : ' + JSON.stringify(g));
  const rebuilt = await page.evaluate(() => {
    const A = window.copytrack, v = A.session.view;
    let calls = 0; const rb = v.rebuild.bind(v); v.rebuild = () => { calls++; rb(); };
    A.quality.apply('ultra'); A.quality.apply('low');              // changement du budget de lumières : le maillage est reconstruit (quality.js)
    v.rebuild = rb;
    return calls;
  });
  precondition(rebuilt > 0, 'la baisse de qualité a bien reconstruit le maillage');
  await frames(page, 4);
  g = await glassVisible(page);
  assert.ok(g.broken && g.attached, 'la dalle est toujours brisée côté physique : ' + JSON.stringify(g));
  assert.equal(g.visible, false, 'la dalle brisée a été recréée visible par la reconstruction : la voiture la traverse');
});
await pageTest('TECH-019 (b) : règle de logique « montrer » sur un groupe : la dalle brisée du groupe reste invisible tant qu\'elle est brisée', async (page) => {
  await cristalBrisee(page);
  await frames(page, 4);
  const r = await page.evaluate(() => {
    const A = window.copytrack, S = A.session, v = S.view, g0 = v.glassGroups[0];
    // Une dalle de verre appartenant à un groupe de la logique du circuit (groupe 7) : mêmes champs que ceux que rebuild() écrit pour un groupe.
    g0.tile.g = 7; g0.grp.userData.g = 7;
    v.setGroupVisible(7, false);
    v.setGroupVisible(7, true);                                   // la règle « montrer » (ou _logicSync) repasse sur le groupe
    const brokenShown = g0.grp.visible;
    S.phys.broken.delete(g0.tile); S.phys.brokenVer++;            // un redémarrage la restaure
    v.setBroken(S.phys.broken);
    return { brokenShown, restoredShown: g0.grp.visible };
  });
  assert.equal(r.brokenShown, false, 'la règle « montrer » a rendu visible une dalle brisée');
  assert.equal(r.restoredShown, true, 'une fois la dalle restaurée (redémarrage), elle est de nouveau visible');
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-063
console.log('TECH-063 : garage, minuterie de l\'atelier');
await pageTest('TECH-063 : modification de l\'atelier puis sortie en moins de 120 ms : aucune voiture orpheline, aucun appel après la sortie', async (page) => {
  const r = await page.evaluate(async () => {
    // (0.17.0) La démonstration du menu tire son circuit au hasard ; certains circuits officiels ont maintenant de la pluie (effets ajoutés à la scène, libérés à la sortie) :
    // on fixe la démonstration sur le premier circuit, avant ET après le garage, pour comparer la scène à elle-même.
    const rnd = Math.random; Math.random = () => 0;
    const A = window.copytrack;
    A.showMenu('menu');
    const before = A.scene.children.length;
    A.openGarage();
    const inGarage = A.scene.children.length;
    const S = A.session;
    let voice = 0; const sv = A.audio.setVoice.bind(A.audio); A.audio.setVoice = (...a) => { if (/_rebuildCar/.test(new Error().stack)) voice++; return sv(...a); };      // (la démonstration du menu règle aussi la voix : on ne compte que la reconstruction du garage)
    S._studioSet((c) => { c.fx = { ...c.fx, spark: '#abcdef' }; });
    const voiceBefore = voice;
    A.showMenu("menu");                                            // sortie du garage avant la fin des 120 ms
    const modeAfter = A.mode;
    await new Promise((r) => setTimeout(r, 400));
    A.audio.setVoice = sv;
    const after = A.scene.children.length;
    Math.random = rnd;
    return { before, inGarage, after, modeAfter, voiceAfterExit: voice - voiceBefore };
  });
  precondition(r.modeAfter === 'menu', 'on est bien sorti du garage : ' + JSON.stringify(r));
  assert.equal(r.after, r.before, 'une voiture orpheline est restée dans la scène : ' + JSON.stringify(r));
  assert.equal(r.voiceAfterExit, 0, 'audio.setVoice a été appelé après la sortie du garage');
});
await pageTest('TECH-063 : la modification faite juste avant la sortie est quand même enregistrée', async (page) => {
  const r = await page.evaluate(async () => {
    const A = window.copytrack;
    A.openGarage();
    A.session._studioSet((c) => { c.fx = { ...c.fx, trailC: '#123456' }; });
    A.showScreen('menu');
    await new Promise((r) => setTimeout(r, 300));
    const { profile } = await import('/js/profile.js');
    return profile().loadout.custom.fx.trailC;
  });
  assert.equal(r, '#123456', 'la modification de l\'atelier, faite moins de 120 ms avant la sortie, s\'est perdue');
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-064
console.log('TECH-064 : aides à la conduite et bouton « Fiche du circuit »');
await pageTest('TECH-064 : sans aides, « Fiche du circuit » est visible à l\'arrivée (témoin)', async (page) => {
  await racingOn(page, 0);
  await page.evaluate(() => { const S = window.copytrack.session; S._finish(S.logic.steps / 120); });
  await frames(page, 4);
  assert.equal(await page.evaluate(() => document.getElementById('fin-hub').classList.contains('hidden')), false);
});
await pageTest('TECH-064 : aides à la conduite activées : « Fiche du circuit » est visible à l\'arrivée', async (page) => {
  await page.evaluate(() => { const A = window.copytrack; A.settings.aids = { ...(A.settings.aids || {}), autoGas: true }; A.saveSettings(); });
  await racingOn(page, 0);
  const k = await page.evaluate(() => { const S = window.copytrack.session; return { track: S.trackKey, opt: S.opts.trackKey, aids: !!S.aids }; });
  precondition(k.aids && k.track !== k.opt && /as-1/.test(k.track), 'la course est assistée, sa clé est suffixée : ' + JSON.stringify(k));
  await page.evaluate(() => { const S = window.copytrack.session; S._finish(S.logic.steps / 120); });
  await frames(page, 4);
  assert.equal(await page.evaluate(() => document.getElementById('fin-hub').classList.contains('hidden')), false, 'le bouton « Fiche du circuit » a disparu avec les aides');
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-067
console.log('TECH-067 : démonstration du menu et vibrations');
for (const via of ['phone', 'pad']) {
  await pageTest(`TECH-067 : démonstration du menu, haptique activé (${via === 'pad' ? 'manette' : 'téléphone'}) : aucune vibration`, async (page) => {
    const r = await page.evaluate(async (via) => {
      const A = window.copytrack;
      A.showMenu && A.showMenu();
      const t0 = performance.now();
      while (!(A.session && A.session.demo && A.session.state === 'racing') && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
      const S = A.session;
      if (!(S && S.demo)) return { error: 'pas de démonstration' };
      window.__vib = 0; window.__rumble = 0;
      navigator.vibrate = () => { window.__vib++; return true; };
      if (via === 'pad') {
        const pad = { id: 'p', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: [], vibrationActuator: { playEffect: () => { window.__rumble++; return Promise.resolve(); } } };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
      }
      A.input.touchActive = via === 'phone'; A.input.padCfg.rumble = true;
      // Les événements de la physique d'un pas : un choc, une réception, un mini-turbo (ce que le moteur écrit dans phys.ev).
      const drive = S.sim.drive.bind(S.sim);
      S.sim.drive = (inp) => { const r = drive(inp); Object.assign(S.phys.ev, { wall: 12, land: 12, miniTurbo: 1 }); return r; };
      await new Promise((r) => setTimeout(r, 600));
      S.sim.drive = drive;
      return { demo: S.demo, vib: window.__vib, rumble: window.__rumble };
    }, via);
    precondition(r.demo === true, 'une démonstration tourne : ' + JSON.stringify(r));
    assert.equal(r.vib, 0, 'navigator.vibrate appelé pendant la démonstration : ' + r.vib + ' fois');
    assert.equal(r.rumble, 0, 'la manette a vibré pendant la démonstration : ' + r.rumble + ' fois');
  });
}
await pageTest('TECH-067 témoin : en course, le même choc fait vibrer le téléphone', async (page) => {
  await racingOn(page, 0);
  const vib = await page.evaluate(async () => {
    const A = window.copytrack, S = A.session;
    window.__vib = 0; navigator.vibrate = () => { window.__vib++; return true; };
    A.input.touchActive = true;
    const drive = S.sim.drive.bind(S.sim);
    S.sim.drive = (inp) => { const r = drive(inp); Object.assign(S.phys.ev, { wall: 12, land: 12, miniTurbo: 1 }); return r; };
    await new Promise((r) => setTimeout(r, 600));
    S.sim.drive = drive;
    return window.__vib;
  });
  assert.ok(vib > 0, 'la mise en scène ne déclenche aucune vibration en course : le test de la démonstration ne prouverait rien');
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-068
console.log('TECH-068 : Theater, caméra affichée');
const corpus = JSON.parse(readFileSync(join(root, 'tools/compat/corpus.json'), 'utf8'));
const RUN = corpus.runs.find((r) => r.source === 'builtin:eclats');
async function openTheater(page, prep) {
  await page.evaluate(async ({ run, prep }) => {
    const A = window.copytrack, i = A.builtins.findIndex((b) => b.def.id === 'eclats');
    if (prep) new Function('A', 'track', prep)(A, A.builtins[i].track);
    A.openTheater({ track: A.builtins[i].track, main: { inputs: run.inputs, time: run.time, label: 'Essai' }, back: null });
  }, { run: RUN, prep });
  await page.waitForFunction(() => window.copytrack.session && window.copytrack.session._th, null, poll);
}
await pageTest('TECH-068 : caméra « Capot » réglée : le Theater affiche « Capot » et le premier C passe à la suivante', async (page) => {
  await page.evaluate(() => { const A = window.copytrack; A.settings.camera = 2; A.saveSettings(); });
  await openTheater(page);
  const r = await page.evaluate(() => {
    const S = window.copytrack.session;
    const first = S.theaterCameraName(), mode = S.camMode;
    S.theaterCamera();
    return { first, mode, second: S.theaterCameraName(), names: S.camList.map((c) => c.name) };
  });
  precondition(r.names[2] === 'Capot' && r.mode === 2, 'la caméra réglée est « Capot » : ' + JSON.stringify(r));
  assert.equal(r.first, 'Capot', 'le Theater affiche ' + r.first + ' alors que « Capot » est réglée');
  assert.equal(r.second, 'Lointaine', 'le premier C doit passer à la caméra suivante de « Capot » : ' + r.second);
});
await pageTest('TECH-068 témoin : caméra par défaut, le Theater affiche « Poursuite »', async (page) => {
  await openTheater(page);
  assert.equal(await page.evaluate(() => window.copytrack.session.theaterCameraName()), 'Poursuite');
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-069
console.log('TECH-069 : Theater, déplacement dans le temps');
await pageTest('TECH-069 : après un déplacement, les scripts de circuit sont joués (sans effets) et la file des effets de logique est vide', async (page) => {
  // 20 effets de logique posés au premier checkpoint, et un script « ciel » sur une case que la voiture traverse plus loin : rien ne doit rester en file après un saut.
  await openTheater(page, `track.setLogic({ off: [], rules: [{ on: ['cp', 1], do: Array.from({ length: 20 }, () => ['fx', 'sound', 'ding']) }] });`);
  const r = await page.evaluate(() => {
    const S = window.copytrack.session;
    S.replayPaused = true;
    S.theaterSeek(900);
    const p = S.phys.pos, cell = { x: Math.floor(p.x / 32), z: Math.floor(p.z / 32) };      // où est la voiture au pas 900
    S.theaterSeek(5);                                                                       // retour au départ : scripts et file remis à zéro
    S.track.setParams({ scripts: [{ x: cell.x, z: cell.z, a: 'sky', v: 'night' }] });
    const before = { sky: (S._scAmb || {}).sky || null, queued: S.sim.lgc.fx.length, steps: S.logic.steps };
    S.theaterSeek(1500);
    return { before, sky: (S._scAmb || {}).sky || null, queued: S.sim.lgc.fx.length, steps: S.logic.steps, cps: S.logic.collected.size };
  });
  precondition(r.steps === 1500 && r.before.steps < 100 && !r.before.sky, 'le saut part du début : ' + JSON.stringify(r));
  precondition(r.cps >= 1, 'le premier checkpoint a été franchi pendant le saut : ' + JSON.stringify(r));
  assert.equal(r.sky, 'night', 'le script de ciel posé sur une case traversée n\'a pas été joué pendant le saut : ' + JSON.stringify(r));
  assert.equal(r.queued, 0, 'des effets de logique restent en file et seront joués en rafale à l\'image suivante : ' + JSON.stringify(r));
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-070
console.log('TECH-070 : HUD, verrou de priorité au redémarrage');
await pageTest('TECH-070 : message prioritaire juste avant un redémarrage : la consigne de la leçon est affichée au GO', async (page) => {
  await racingOn(page, 0);
  const r = await page.evaluate(async () => {
    const A = window.copytrack, S = A.session, hud = A.ui.hud;
    hud.message('Incident physique : retour au checkpoint', 2.2, 3);        // PRIO.penalty
    S.restart();                                                             // hud.reset
    hud.message('Consigne de la leçon', 3, 1);                               // PRIO.info : ce que fait l'Académie au GO
    const e = document.getElementById('hud-msg');
    return { shown: e.classList.contains('on'), text: e.textContent };
  });
  assert.equal(r.text, 'Consigne de la leçon', 'la consigne a été refusée par le verrou du message précédent : ' + JSON.stringify(r));
  assert.equal(r.shown, true);
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-072
console.log('TECH-072 : message « Hors piste » au moment de l\'arrivée');
// Reproduit (« À vérifier » levé) : la voiture est dans la case de l'arrivée, toutes les portes prises, hors piste depuis 0,499 s ; un pas la fait franchir la ligne ET dépasser 0,5 s.
await pageTest('TECH-072 : arrivée franchie au pas où le délai hors piste est dépassé : aucun message « Hors piste », la course reste terminée', async (page) => {
  await racingOn(page, 0);
  const r = await page.evaluate(() => {
    const S = window.copytrack.session, said = [];
    const say = S._say.bind(S); S._say = (m) => { said.push(Array.isArray(m) ? m[0] : String(m)); return say(m); };
    const fin = S.track.tiles.find((t) => t.t === 'finish');
    S.logic.collected = new Set(S.logic.cps);
    const p = S.phys.pos;
    p.x = (fin.x + 0.5) * 32; p.z = (fin.z + 0.5) * 32; S.phys.prev.x = p.x; S.phys.prev.y = p.y; S.phys.prev.z = p.z;
    S.phys.lost = true;                                       // hors piste (phys.offTrack)
    S.sim.groundT = S.sim.offTrackLimit - 0.001;
    S._stepOnce();
    return { state: S.state, said, over: S.sim.groundT > S.sim.offTrackLimit, finished: S.logic.finished };
  });
  precondition(r.finished && r.over, 'le pas franchit la ligne et dépasse le délai hors piste : ' + JSON.stringify(r));
  assert.equal(r.state, 'finished');
  assert.ok(!r.said.includes('Hors piste'), 'message « Hors piste » affiché juste après l\'arrivée : ' + JSON.stringify(r.said));
});
await pageTest('TECH-072 témoin : hors piste plus de 0,5 s sans arrivée : message et réapparition', async (page) => {
  await racingOn(page, 0);
  const r = await page.evaluate(() => {
    const S = window.copytrack.session, said = [];
    const say = S._say.bind(S); S._say = (m) => { said.push(Array.isArray(m) ? m[0] : String(m)); return say(m); };
    S.phys.lost = true; S.sim.groundT = S.sim.offTrackLimit - 0.001;
    S._stepOnce();
    return { said };
  });
  assert.ok(r.said.includes('Hors piste'), 'le message hors piste doit rester affiché en course : ' + JSON.stringify(r.said));
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-071
console.log('TECH-071 : ligne de récompense en anglais');
await pageTest('TECH-071 : anglais : la ligne de récompense de l\'arrivée est entièrement traduite', async (page) => {
  await page.evaluate(async () => { await (await import('/js/i18n/boot.js')).switchLanguage('en', { persist: false }); });
  await frames(page, 3);
  await racingOn(page, 0);
  await page.evaluate(() => { const S = window.copytrack.session; S._finish(S.logic.steps / 120); });
  await frames(page, 4);
  const txt = await page.evaluate(() => document.getElementById('fin-reward').textContent);
  precondition(/◆/.test(txt), 'une récompense est affichée : « ' + txt + ' »');
  assert.ok(!/Bonus|fois|pièces|coinsBonus/.test(txt), 'texte français dans la ligne de récompense : « ' + txt + ' »');
  assert.match(txt, /First-time bonus ×2/, txt);
});

// ---------------------------------------------------------------------------------------------------------------------------------- TECH-061
console.log('TECH-061 : miniature de la fiche d\'un circuit');
await pageTest('TECH-061 : modification de même longueur de code : la miniature des favoris est mise à jour', async (page) => {
  const r = await page.evaluate(async () => {
    const A = window.copytrack;
    const { Track } = await import('/js/track.js'), st = await import('/js/storage.js'), { profile, saveProfile } = await import('/js/profile.js'), fav = await import('/js/favorites.js');
    const base = A.builtins[0].track;
    const code0 = base.encode(), t0 = Track.decode(code0);
    // Une variante de même longueur dont la miniature est différente : on déplace une pièce d'une case (le code garde la même longueur).
    const { thumbnail } = await import('/js/editorTools.js');
    const img0 = thumbnail(t0, null);
    let code1 = null;
    for (let i = t0.tiles.length - 1; i >= 0 && !code1; i--) {
      const t = Track.decode(code0), tile = t.tiles[i];
      for (const d of [1, -1]) {
        tile.x += d;
        try { const c = t.encode(); if (c.length === code0.length && c !== code0 && thumbnail(Track.decode(c), null) !== img0) { code1 = c; break; } } catch { /* ignoré */ }
        tile.x -= d;
      }
    }
    if (!code1) return { error: 'pas de variante de même longueur' };
    st.saveMyTrack({ id: 'essai61', name: 'Essai 61', code: code0, created: Date.now() });
    fav.toggleFavorite(profile(), 'm:essai61', 'Essai 61'); saveProfile();
    const shot = () => { const d = document.createElement('div'); A._renderFavorites(d); const im = d.querySelector('img.thumb'); return im ? im.getAttribute('src') : null; };
    const a = shot();
    st.saveMyTrack({ id: 'essai61', name: 'Essai 61', code: code1, created: Date.now() });
    const b = shot();
    return { a, b, same: code0.length === code1.length };
  });
  precondition(!r.error, r.error);
  precondition(r.same && r.a && r.b, 'deux versions de même longueur, deux miniatures : ' + JSON.stringify({ same: r.same, a: !!r.a, b: !!r.b }));
  assert.notEqual(r.a, r.b, 'la miniature de la fiche est restée celle de l\'ancienne version du circuit');
});

// ---------------------------------------------------------------------------------------------------------------------------------- RISK-002
console.log('RISK-002 : contenus de joueurs et traducteur anglais');
// « Jouer » est une clé du dictionnaire (« Play ») : un circuit, un mode, une description ou un pseudo qui porte ce nom doit s'afficher tel quel.
await pageTest('RISK-002 : anglais : un circuit, un mode et un pseudo nommés « Jouer » s\'affichent tels quels (le bouton « Jouer », lui, est traduit)', async (page) => {
  await page.evaluate(async () => { await (await import('/js/i18n/boot.js')).switchLanguage('en', { persist: false }); });
  await frames(page, 3);
  const r = await page.evaluate(async () => {
    const A = window.copytrack;
    const { Track } = await import('/js/track.js'), st = await import('/js/storage.js'), fav = await import('/js/favorites.js'), { profile, saveProfile } = await import('/js/profile.js');
    const { online } = await import('/js/online.js'), { sanitizeRules } = await import('/js/rules.js');
    const t = Track.decode(A.builtins[0].track.encode()); t.name = 'Jouer';
    const entry = { id: 'risk2', name: 'Jouer', code: t.encode(), created: Date.now() };
    st.saveMyTrack(entry);
    const next = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = {};
    // 1. « Mes circuits »
    A.showScreen('mytracks'); await next();
    out.card = [...document.querySelectorAll('#mytracks-list .card h3, .card h3')].map((e) => e.textContent).filter((x) => /Jouer|Play/.test(x));
    out.playBtn = [...document.querySelectorAll('[data-a="play"]')].map((e) => e.textContent);
    // 2. favoris
    fav.toggleFavorite(profile(), 'm:risk2', 'Jouer'); saveProfile();
    const box = document.createElement('div'); document.body.appendChild(box); A._renderFavorites(box); await next();
    out.fav = [...box.querySelectorAll('.card h3')].map((e) => e.textContent); box.remove();
    // 3. fiche du circuit
    A.openUserHub(entry, 'mytracks'); await next();
    out.hub = document.getElementById('hub-name').textContent;
    // 4. HUD
    A.playTrack(Track.decode(entry.code), { trackKey: 'u-risk2' });
    await new Promise((r) => setTimeout(r, 300)); await next();
    out.hud = document.getElementById('hud-track').textContent;
    A.showMenu('menu'); await next();
    // 5. modes de joueur
    st.saveMode({ id: 'risk2m', name: 'Jouer', desc: 'Jouer', rules: sanitizeRules({}) });
    A.modesMenu('mine'); await next();
    out.mode = [...document.querySelectorAll('.mode-card b, .mode-card .mode-desc')].map((e) => e.textContent);
    out.modeBtn = [...document.querySelectorAll('.mode-card .btn.primary')].map((e) => e.textContent);
    A.ui.closeModal(); await next();
    // 6. pseudo d'un ami
    A.identity = { ...A.identity, kind: 'account' };
    online.friends = async () => [{ id: 7, name: 'Jouer', status: 'accepted', incoming: false }];
    const fb = document.createElement('div'); document.body.appendChild(fb);
    await A._renderFriendsBox(fb); await next();
    out.friend = [...fb.querySelectorAll('.lb-name')].map((e) => e.textContent); fb.remove();
    return out;
  });
  precondition(r.playBtn.includes('Play'), 'le traducteur est actif (le bouton « Jouer » devient « Play ») : ' + JSON.stringify(r.playBtn));
  assert.deepEqual(r.card, ['Jouer'], 'carte de « Mes circuits » : ' + JSON.stringify(r.card));
  assert.deepEqual(r.fav, ['Jouer'], 'favoris : ' + JSON.stringify(r.fav));
  assert.equal(r.hub, 'Jouer', 'fiche du circuit : ' + r.hub);
  assert.equal(r.hud, 'Jouer', 'nom du circuit dans le HUD : ' + r.hud);
  assert.deepEqual(r.mode, ['Jouer', 'Jouer'], 'nom et description du mode : ' + JSON.stringify(r.mode));
  assert.deepEqual(r.modeBtn, ['Play'], 'le bouton de la carte du mode reste traduit : ' + JSON.stringify(r.modeBtn));
  assert.deepEqual(r.friend, ['Jouer'], 'pseudo d\'un ami : ' + JSON.stringify(r.friend));
});
await pageTest('RISK-002 : anglais : les circuits du jeu et le défi du jour restent traduits', async (page) => {
  await page.evaluate(async () => { await (await import('/js/i18n/boot.js')).switchLanguage('en', { persist: false }); });
  await frames(page, 3);
  const r = await page.evaluate(async () => {
    const A = window.copytrack, next = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    A.openBuiltinHub(0, 'tracks'); await next();
    return { hub: document.getElementById('hub-name').textContent, fr: A.builtins[0].def.name };
  });
  assert.notEqual(r.hub, r.fr, 'le nom d\'un circuit de la carrière doit être traduit en anglais : ' + r.hub);
});

await browser.close().catch(() => {});
server.kill();
await finish('Tous les tests des défauts visibles passent.');
