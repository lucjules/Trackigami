// Course EN DIRECT ↔ rejeu du serveur, dans un vrai navigateur : node tools/test-live-replay.mjs   (npm run test:browser)
//
// Le noyau a deux chemins qui doivent rester équivalents (annexe 8 de docs/audit/AUDIT_COMPLET.md, « point sensible n° 1 ») :
//   B. la course en direct : RaceSession.update → _stepOnce (commandes, effets, retours au checkpoint demandés par la touche R ou décidés par la course) ;
//   A. le rejeu : GhostRunner.step, que verify.js (replayRun) emploie côté serveur, pour les fantômes, l'analyse…
// Jusqu'ici aucun test automatique ne finissait une vraie course par B (avec retours au checkpoint) pour la faire rejouer par A : l'audit de phase 1 l'a fait à la main. Ce fichier le fait :
//   1. « Premiers Éclats » puis « Laminoir » (obstacles : bumper, piques) sont courus dans Chromium ; le pilote automatique du jeu, bruité (générateur à graine fixe : coups de volant lissés,
//      freinages brefs), fournit les commandes par input.drive(), donc par le vrai _input() de la session ; les images sont avancées par RaceSession.update (dt = 0,1 s : douze pas fixes) ;
//   2. trois retours au checkpoint par la VRAIE touche R (événements clavier de Chromium, lus par input.act('respawn') dans update) ;
//   3. à l'arrivée, côté Node (un autre moteur de calcul que celui de la page, comme le serveur) : le code du circuit est relu (Track.decode(track.encode())) ; replayRun redonne le temps et
//      les temps intermédiaires de la course ; GhostRunner redonne la position de la voiture à CHAQUE pas (écart 0 m au bit près) ; verifyRun, la vérification complète du serveur, accepte la course.
//   4. Régression TECH-015 : une exception injectée dans la boucle de l'application (hors d'un pas) ; _loopError ramène la voiture au checkpoint par respawn(true), retour ENREGISTRÉ : le rejeu redonne la même course.
// Déterminisme : la page est « tenue » (la boucle du jeu n'avance plus la session) ; seuls nos appels à update() font avancer la course, avec des dt fixes. Seules les touches R viennent de Chromium.
// Playwright absent : test ignoré en local, ÉCHEC en CI (comme tools/test-browser.mjs).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { test, finish, precondition } from './harness.mjs';
import { Track } from '../js/track.js';
import { replayRun, verifyRun } from '../js/verify.js';
import { GhostRunner } from '../js/replay.js';
import { PHYS_VER } from '../js/version.js';
import { ghostTarget } from '../js/ghostTarget.js';
import { BUILTIN_TRACKS } from '../js/tracks.js';

const require = createRequire(import.meta.url);
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
let chromium;
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9100 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());

// Une erreur de la page pendant un test = un échec (et jamais « défaut connu ») ; seule une assertion Node reste une assertion.
const guard = (fn) => async () => {
  const before = errors.length;
  let err;
  try { await fn(); } catch (e) { err = e; }
  const pe = errors.slice(before);
  if (pe.length) throw new Error('erreurs de la page : ' + pe.join(' | '));
  if (err) throw err;
};
const pageTest = (name, fn) => test(name, guard(fn));

// ---------------------------------------------------------------------------------------------------------------------------------- mise en route
async function boot() {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.locator('#wl-name').fill('Rejeu');
  await page.locator('#wl-submit').evaluate((el) => el.click());
  await page.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 60000, polling: 100 });
  await page.evaluate(async () => {
    const A = window.copytrack;
    A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal();
    const { profile, saveProfile } = await import('/js/profile.js');
    profile().eggs = { ...(profile().eggs || {}), unlockAll: true }; saveProfile();       // (tous les chapitres jouables : « Laminoir » est au chapitre suivant)
  });
  // La fenêtre de bienvenue est programmée 700 ms après le démarrage (main.js : start) quand le tutoriel n'était pas fait À CE MOMENT-LÀ : poser tutorialDone
  // ensuite ne l'annule pas. Elle s'ouvrait donc pendant la première course, qui passait en pause (une fenêtre ouverte met la course en pause, TECH-017) :
  // on l'attend (3 s au plus), puis on la ferme.
  await page.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 3000, polling: 50 }).catch(() => {});
  await page.evaluate(() => window.copytrack.ui.closeModal());
}

// Lance un circuit et prend la main : la session n'avance plus que par nos appels (« tenue »), avec le pilote automatique bruité comme source des commandes.
async function launch(id, seed, amp = 0.2, modeId = '', script = null) {
  await page.evaluate(async ({ id, seed, amp, modeId, script }) => {
    const A = window.copytrack;
    const [{ RaceSession }, { Autopilot }] = await Promise.all([import('/js/race.js'), import('/js/autopilot.js')]);
    const L = window.__lr = { hold: true, inject: false, trace: [], inputRespawns: 0, autoRespawns: 0, rBack: [], rSpeed: [] };
    const proto = RaceSession.prototype;
    if (!proto.__real) {
      proto.__real = proto.update;
      proto.update = function (dt) {
        const W = window.__lr;
        if (W && this === A.session && !this.demo) {
          if (W.inject) { W.inject = false; throw new Error('exception de test (TECH-015)'); }
          if (W.hold) return undefined;       // la boucle du jeu n'avance pas la course : c'est le test qui le fait
        }
        return proto.__real.call(this, dt);
      };
      const clear = A.input.clearHits.bind(A.input);
      A.input.clearHits = () => { if (!(window.__lr && window.__lr.hold)) clear(); };      // (une touche appuyée attend l'update suivant : pas d'effacement entre deux images de la boucle)
    }
    const idx = A.builtins.findIndex((b) => b.def.id === id);
    L.index = idx; L.key = idx >= 0 ? A.builtins[idx].key : null;
    if (script) {                                                    // circuit construit par script dans la page (ligne du pilote comprise), sans clé de classement
      const { scriptTrack } = await import('/js/track.js');
      const t = scriptTrack('plaque', script.code);
      if (script.cpOn) t.tiles.find((x) => x.s === script.cpOn).cp = 1;
      A.playTrack(t, { trackKey: null, seed: 'live-replay', difficulty: 1 });
      L.key = null;
    } else if (modeId) {                                                    // mode de jeu (règles appliquées à une copie du circuit : App.playMode), sans clé de classement
      const { BUILTIN_MODES } = await import('/js/rules.js');
      A.playMode(BUILTIN_MODES.find((m) => m.id === modeId), A.builtins[idx].track);
      L.key = null;
    } else A.playBuiltin(idx);
    const S = L.S = A.session;
    if (!(S && S.constructor === RaceSession && !S.demo)) throw new Error('la session de course n\'est pas là');
    // Pilote automatique bruité, graine fixe : bruit de volant lissé (processus AR(1) à entrées centrées) + freinages brefs. Une seule lecture par pas de course.
    const bot = L.bot = new Autopilot(S.track.path, { latLimit: 56 * 0.8 });
    bot.reset(S.phys);
    let st = seed >>> 0, n = 0, brakeLeft = 0;
    const rnd = () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296;
    L.realDrive = A.input.drive;
    A.input.drive = () => {
      if (S.state !== 'racing') return { steer: 0, throttle: false, brake: false, drift: false };
      const c = bot.control(S.phys);
      n = 0.97 * n + amp * (rnd() + rnd() + rnd() - 1.5);
      if (brakeLeft > 0) brakeLeft--; else if (rnd() < 0.002) brakeLeft = 15 + Math.floor(rnd() * 25);
      return { steer: Math.max(-1, Math.min(1, c.steer + n)), throttle: brakeLeft > 0 ? false : !!c.throttle, brake: brakeLeft > 0 ? true : !!c.brake, drift: false };
    };
    // Observation (sans rien changer) : position et chrono après chaque pas de course ; retours demandés par la touche (respawn(true)) et décidés par la course.
    const stepOnce = S._stepOnce.bind(S);
    S._stepOnce = () => { const was = S.state; stepOnce(); if (was === 'racing') L.trace.push(S.phys.pos.x, S.phys.pos.y, S.phys.pos.z, S.logic.steps); };
    const respawn = S.respawn.bind(S);
    S.respawn = (fromInput) => { const was = S.state; respawn(fromInput); if (was === 'racing') { if (fromInput === true) { L.inputRespawns++; L.rBack.push(S.logic.steps); L.rSpeed.push(Math.hypot(S.phys.vel.x, S.phys.vel.z)); L.rVeh = (L.rVeh || []).concat(S.phys.vehicle); } else L.autoRespawns++; bot.reset(S.phys); } };
  }, { id, seed, amp, modeId, script });
}

// Avance la course (update, dt = 0,1 s : douze pas fixes par appel) jusqu'au pas de course `tick` (ou l'arrivée).
// splits : et au moins ce nombre de checkpoints pris.
const advance = (tick, maxCalls = 1500, splits = 0) => page.evaluate(({ tick, maxCalls, splits }) => {
  const L = window.__lr, S = L.S;
  for (let i = 0; i < maxCalls && S.state !== 'finished' && !(S.state === 'racing' && S.tick >= tick && S.logic.splits.length >= splits); i++) S.constructor.prototype.__real.call(S, 0.1);
  return { tick: S.tick, state: S.state, steps: S.logic.steps, splits: S.logic.splits.length, inputRespawns: L.inputRespawns, autoRespawns: L.autoRespawns };
}, { tick, maxCalls, splits });

// Trois retours au checkpoint par la vraie touche R : le premier avant tout checkpoint (retour au départ), les deux autres APRÈS un checkpoint pris (retour à ce checkpoint, chrono remis à son temps).
const R_PLAN = [{ tick: 400, splits: 0 }, { tick: 300, splits: 1 }, { tick: 200, splits: 2 }];      // tick : pas de course à attendre APRÈS le dernier événement ; splits : checkpoints pris
async function pressR() {
  await page.keyboard.press('KeyR');                      // vraie touche : keydown / keyup de Chromium → input.pressed → input.act('respawn') dans update()
}
async function runRace() {
  let s = await advance(1);
  precondition(s.state === 'racing', `la course est partie (état : ${s.state})`);
  for (const step of R_PLAN) {
    s = await advance(s.tick + step.tick, 1500, step.splits);
    precondition(s.state === 'racing', `la course n'est pas finie au pas ${s.tick} (état : ${s.state})`);
    await pressR();
    s = await advance(s.tick + 1);
  }
  return s;
}
const injectError = async () => {
  await page.evaluate(() => { window.__lr.inject = true; });
  await page.waitForFunction(() => !window.__lr.inject, null, { timeout: 20000, polling: 50 });      // la boucle du jeu (requestAnimationFrame) a lancé l'exception ; _loopError l'a traitée
};
async function finishRace() {
  const s = await advance(Infinity, 3000);
  precondition(s.state === 'finished', `la course est allée jusqu'à l'arrivée (état : ${s.state}, pas ${s.tick})`);
  return page.evaluate(() => {
    const L = window.__lr, S = L.S, A = window.copytrack;
    const run = S.opts.mode ? { inputs: S.recorder.encode(), time: S.logic.time } : S.lastRun;      // (mode de jeu : ni record ni lastRun, l'enregistreur reste)
    return { inputs: run.inputs, time: run.time, liveTime: S.logic.time, rSpeed: L.rSpeed.slice(), rVeh: (L.rVeh || []).slice(), vehicle: S.phys.vehicle, splits: S.logic.splits.slice(), code: S.track.encode(), key: L.key, trace: L.trace.slice(), inputRespawns: L.inputRespawns, autoRespawns: L.autoRespawns, rBack: L.rBack.slice(), ticks: S.tick, statsRespawns: S.stats.respawns, finishShown: !document.getElementById('finish').classList.contains('hidden'), mode: A.mode };
  });
}
async function release() {
  await page.evaluate(() => { const A = window.copytrack, L = window.__lr; if (L) { L.hold = false; if (L.realDrive) A.input.drive = L.realDrive; } });
  await page.evaluate(() => window.copytrack.quitRace());
  await page.waitForFunction(() => window.copytrack.mode === 'menu' || !document.getElementById('race-hub').classList.contains('hidden'), null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => { const A = window.copytrack; if (A.closeRaceHub && !document.getElementById('race-hub').classList.contains('hidden')) A.closeRaceHub(); A.showMenu('menu'); });
}

// ---------------------------------------------------------------------------------------------------------------------------------- le contrôle côté Node (autre moteur que la page)
// Le code relu, replayRun, GhostRunner pas à pas, et verifyRun. Chaque assert dit ce qui diverge.
function compareLiveToReplay(d) {
  const track = Track.decode(d.code);                                  // le code du circuit RELU, comme le serveur
  assert.equal(track.signature(), Track.decode(track.encode()).signature(), 'le circuit se relit à l\'identique');
  // 1. replayRun : le temps et les temps intermédiaires
  const rr = replayRun(track, d.inputs);
  assert.notEqual(rr, null, 'le rejeu des commandes enregistrées n\'atteint pas l\'arrivée');
  assert.equal(rr.time, d.time, `temps : rejeu ${rr.time} s, course en direct ${d.time} s`);
  assert.deepEqual(rr.splits, d.splits, 'temps intermédiaires');
  // 2. GhostRunner : la position à chaque pas (le trace contient x, y, z, chrono après chaque pas de course)
  const g = new GhostRunner(track, { inputs: d.inputs });
  const n = d.trace.length / 4;
  let worst = 0;
  for (let k = 0; k < n; k++) {
    g.step();
    const p = g.phys.pos, o = k * 4;
    const dist = Math.hypot(p.x - d.trace[o], p.y - d.trace[o + 1], p.z - d.trace[o + 2]);
    if (dist > worst) worst = dist;
    if (dist !== 0 || g.logic.steps !== d.trace[o + 3]) assert.fail(`pas ${k} : la voiture rejouée est à ${dist.toFixed(3)} m de la voiture en direct (chrono ${g.logic.steps} contre ${d.trace[o + 3]})`);
  }
  assert.equal(worst, 0, 'écart de position maximal');
  assert.ok(g.logic.finished && g.done, 'le rejeu est arrivé en même temps que la course');
  assert.equal(g.k, n, 'même nombre de pas');
}

// [circuit, nom, graine, amplitude du bruit, réapparitions automatiques exigées]. Bruit 0,2 : conduite propre, seulement les touches R. Bruit 0,5 : conduite maladroite, la course
// elle-même ramène la voiture au checkpoint (hors piste plus de 0,5 s, noyade, piques : la décision que le chemin B refait à part, voir race.js) ; graines choisies pour qu'elle finisse.
const circuits = [['eclats', 'Premiers Éclats', 11, 0.2, false], ['laminoir', 'Laminoir', 23, 0.2, false], ['eclats', 'Premiers Éclats', 8, 0.5, true], ['laminoir', 'Laminoir', 12, 0.5, true]];

try {
  await boot();
  for (const [id, nom, seed, amp, wantAuto] of circuits) {
    await pageTest(`course en direct puis rejeu : « ${nom} », pilote automatique bruité (graine ${seed}, bruit ${amp}${wantAuto ? ', conduite maladroite : réapparitions automatiques' : ''}), 3 retours au checkpoint par la touche R → temps identiques, écart de position 0 m, verifyRun accepte`, async () => {
      await launch(id, seed, amp);
      try {
        await runRace();
        const d = await finishRace();
        assert.equal(d.inputRespawns, 3, 'les trois retours demandés par la touche R ont eu lieu');
        assert.ok(d.rBack.some((t) => t > 0), `au moins un retour ramène à un vrai checkpoint (chrono de retour, en pas : ${d.rBack.join(', ')})`);
        assert.ok(d.ticks > 2400, `${d.ticks} pas de course (au moins 20 s)`);
        if (wantAuto) assert.ok(d.autoRespawns >= 1, `la conduite maladroite provoque au moins une réapparition automatique (${d.autoRespawns})`);
        assert.equal(d.finishShown, true, 'l\'écran d\'arrivée est affiché');
        assert.equal(d.ticks, d.trace.length / 4);
        console.log(`       ${nom} : ${d.ticks} pas, temps ${d.time.toFixed(3)} s, ${d.inputRespawns} retours par la touche R (chronos de retour : ${d.rBack.map((t) => (t / 120).toFixed(2) + ' s').join(', ')}), ${d.autoRespawns} réapparitions automatiques, ${d.splits.length} temps intermédiaires`);
        compareLiveToReplay(d);
        const v = verifyRun({ trackKey: d.key, inputs: d.inputs, time: d.time, physVer: PHYS_VER });
        assert.equal(v.ok, true, v.error);
        assert.equal(v.time, d.time);
      } finally { await release(); }
    });
  }

  // TECH-013 : mode « Départ lancé » (v0 = 200 km/h) ; la VRAIE touche R avant le premier checkpoint ramène au départ : la voiture repart lancée, comme « Recommencer ».
  await pageTest('mode « Départ lancé » sur « Premiers Éclats » : touche R avant le premier checkpoint → retour au départ à 200 km/h (chrono à zéro) ; course puis rejeu identiques', async () => {
    await launch('eclats', 11, 0.2, 'lancee');
    try {
      let s = await advance(1);
      precondition(s.state === 'racing', `la course est partie (état : ${s.state})`);
      const v0 = await page.evaluate(() => { const S = window.__lr.S; return { v0: S.track.v0, mode: S.opts.mode && S.opts.mode.id }; });
      precondition(v0.v0 === 200 && v0.mode === 'lancee', `mode « Départ lancé » appliqué (${JSON.stringify(v0)})`);
      s = await advance(s.tick + 60);
      precondition(s.state === 'racing' && s.splits === 0, `avant le premier checkpoint (${s.splits} pris)`);
      await pressR();
      s = await advance(s.tick + 1);
      const d0 = await page.evaluate(() => ({ rBack: window.__lr.rBack.slice(), rSpeed: window.__lr.rSpeed.slice() }));
      assert.deepEqual(d0.rBack, [0], 'retour au départ : chrono à zéro');
      assert.ok(Math.abs(d0.rSpeed[0] - 200 / 3.6) < 1e-6, `vitesse juste après le retour : ${(d0.rSpeed[0] * 3.6).toFixed(1)} km/h (attendu 200)`);
      const d = await finishRace();
      assert.equal(d.inputRespawns, 1);
      compareLiveToReplay(d);
    } finally { await release(); }
  });

  // TECH-001 : la course EN DIRECT (chemin B : RaceSession._stepOnce, vraie touche R) sur des plaques de transformation, puis son rejeu côté Node (chemin A).
  for (const [label, code, cpOn] of [['checkpoint posé sur une plaque moto', 'start S2 S.o S3 S3 finish', 'moto'], ['anneau-checkpoint après une plaque moto et un tremplin', 'start S2 S.o S UU GC2 S3 finish', '']]) {
    await pageTest(`course en direct sur plaque (${label}) : touche R après le checkpoint → la moto est rendue, sans retour en voiture ni chute ; rejeu identique`, async () => {
      await launch('', 7, 0.05, '', { code, cpOn });
      try {
        let s = await advance(1);
        precondition(s.state === 'racing', `la course est partie (état : ${s.state})`);
        s = await advance(s.tick + 1, 1500, 1);
        precondition(s.state === 'racing' && s.splits === 1, `checkpoint pris (${s.splits})`);
        s = await advance(s.tick + 2);
        await pressR();
        s = await advance(s.tick + 3);
        const d = await finishRace();
        assert.equal(d.inputRespawns, 1);
        assert.deepEqual(d.rVeh, ['moto'], 'véhicule rendu par le retour');
        assert.equal(d.autoRespawns, 0, 'aucune chute ni réapparition automatique après le retour');
        assert.equal(d.vehicle, 'moto', 'arrivée en moto');
        compareLiveToReplay(d);
      } finally { await release(); }
    });
  }

  // Sans retour : le même circuit, mêmes commandes bruitées : témoin que la comparaison passe aussi quand rien d'autre que la conduite n'intervient.
  await pageTest('témoin : « Premiers Éclats » sans aucun retour (ni touche R, ni erreur) : même comparaison, même résultat', async () => {
    await launch('eclats', 5);
    try {
      await advance(1);
      const d = await finishRace();
      assert.equal(d.inputRespawns, 0);
      compareLiveToReplay(d);
    } finally { await release(); }
  });

  // COMPLETE-009 : le fantôme de la médaille suivante est de l'affichage pur. La même course (mêmes commandes bruitées, graine fixe) avec le fantôme puis sans : mêmes commandes
  // enregistrées, même temps, même record sur le disque ; le fantôme tourne pendant la course ; la session suivante monte le fantôme de la médaille d'après.
  await pageTest('fantôme de médaille : « Premiers Éclats » avec puis sans fantôme (mêmes commandes) → même record enregistré, mêmes commandes, même temps ; le fantôme avance pendant la course ; la session suivante monte le fantôme de la médaille suivante', async () => {
    const one = async (ghostOn) => {
      await page.evaluate(async (on) => { const A = window.copytrack, { clearRecords } = await import('/js/storage.js'); clearRecords(); A.settings.ghostGold = on; A.settings.ghostMedal = 'next'; A.saveSettings(); }, ghostOn);
      await launch('eclats', 5);
      try {
        await advance(1);
        await advance(700);
        const g1 = await page.evaluate(() => window.__lr.S.ghosts.map((g) => ({ label: g.label, visible: g.car.group.visible, x: g.car.group.position.x, z: g.car.group.position.z })));
        await advance(900);
        const g2 = await page.evaluate(() => window.__lr.S.ghosts.map((g) => ({ x: g.car.group.position.x, z: g.car.group.position.z })));
        const d = await finishRace();
        const rec = await page.evaluate(async () => { const { getRecord } = await import('/js/storage.js'), r = getRecord(window.__lr.key); return r ? { time: r.time, inputs: r.inputs, splits: r.splits } : null; });
        return { d, rec, g1, g2 };
      } finally { await release(); }
    };
    const on = await one(true), off = await one(false);
    assert.equal(on.g1.length, 1, 'le fantôme de médaille est monté'); assert.equal(on.g1[0].label, 'Bronze', 'aucun record : la première médaille à gagner'); assert.equal(off.g1.length, 0, 'réglage coupé : aucun fantôme');
    assert.ok(on.g1[0].visible, 'le fantôme est visible en course'); assert.ok(Math.hypot(on.g2[0].x - on.g1[0].x, on.g2[0].z - on.g1[0].z) > 20, 'le fantôme avance pendant la course');
    assert.equal(on.d.inputs, off.d.inputs, 'mêmes commandes enregistrées'); assert.equal(on.d.time, off.d.time, 'même temps'); assert.deepEqual(on.d.splits, off.d.splits, 'mêmes temps intermédiaires');
    assert.ok(on.rec && off.rec, 'un record est enregistré dans les deux cas'); assert.deepEqual(on.rec, off.rec, 'le même record, avec ou sans fantôme');
    compareLiveToReplay(on.d);
    // La session suivante (le record de la première course est en place) : le fantôme est celui de la médaille d'après.
    await page.evaluate(() => { const A = window.copytrack; A.settings.ghostGold = true; A.saveSettings(); });
    await page.evaluate(async (rec) => { const { saveRecord } = await import('/js/storage.js'); saveRecord(window.copytrack.builtins.find((b) => b.def.id === 'eclats').key, { time: rec.time, splits: rec.splits, inputs: rec.inputs, pv: 0, date: 1 }); }, on.rec);
    await launch('eclats', 5);
    try {
      const label = await page.evaluate(() => (window.__lr.S.ghosts[0] || {}).label || null);
      const want = ghostTarget({ trackKey: on.d.key, medals: BUILTIN_TRACKS.find((d) => d.id === 'eclats').medals, best: on.rec.time });
      assert.equal(label, want ? want.label : null, `après un record de ${on.rec.time.toFixed(2)} s : le fantôme de la médaille suivante`);
    } finally { await release(); }
  });

  // Régression TECH-015 : _loopError (main.js) ramenait la voiture au dernier checkpoint par S.respawn() SANS le drapeau « retour » de l'enregistrement : les commandes enregistrées rejouaient
  // une autre course. Corrigé (respawn(true) pour une erreur hors d'un pas) : le retour est enregistré comme celui de la touche R, et le rejeu redonne la même course.
  await pageTest('régression TECH-015 : erreur injectée dans la boucle (hors d\'un pas) puis arrivée : le retour au checkpoint est enregistré, le rejeu des commandes redonne la même course', async () => {
    await launch('eclats', 11);
    let d;
    try {
      let s = await advance(300, 1500, 1);
      s = await advance(s.tick + 300);
      precondition(s.state === 'racing' && s.splits >= 1, 'la course est en cours, un checkpoint est pris');
      const { inputRespawns, autoRespawns } = s;
      await injectError();
      s = await advance(s.tick + 1);
      assert.equal(s.inputRespawns, inputRespawns + 1, 'la reprise après erreur de la boucle a ramené la voiture au checkpoint par un retour ENREGISTRÉ (respawn(true))');
      assert.equal(s.autoRespawns, autoRespawns, 'aucun retour non enregistré');
      d = await finishRace();
    } finally {
      for (let i = errors.length - 1; i >= 0; i--) if (/exception de test \(TECH-015\)/.test(errors[i])) errors.splice(i, 1);      // (les erreurs provoquées ne sont pas des erreurs de page)
      await release();
    }
    compareLiveToReplay(d);
  });
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
await finish('La course en direct et son rejeu concordent, y compris après une erreur de la boucle (TECH-015).');
