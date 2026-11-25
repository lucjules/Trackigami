// Recette D : interactions entre les corrections des phases précédentes, dans Chromium.
//   D1  course EN DIRECT avec retours au checkpoint (vraie touche R) puis vérification par le chemin du serveur (verifyRun, replayRun, GhostRunner dans Node), sur trois circuits ;
//   D2  circuit publié → modifié → vérifié : publication (serveur simulé), modification, état « non vérifié », nouvelle vérification, nouvelle publication ;
//   D3  deux onglets du même navigateur modifient le profil (pièces, favoris, réglages, records) : rien ne se perd.
//   node tools/recette/interactions.mjs [d1|d2|d3|tout]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, OUT, OFFLINE, sleep, startServer } from './lib.mjs';
import { Track } from '../../js/track.js';
import { replayRun, verifyRun } from '../../js/verify.js';
import { GhostRunner } from '../../js/replay.js';
import { PHYS_VER } from '../../js/version.js';

const part = process.argv[2] || 'tout';
const port = 9600 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const errors = [];
const hook = async (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ` + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push(`${tag} console: ` + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  return p;
};
const page = await hook(await ctx.newPage(), 'A');
const results = [];
const note = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'ok     ' : 'CONSTAT '} ${id} — ${detail}`); writeFileSync(join(OUT, 'interactions.json'), JSON.stringify({ results, errors }, null, 1)); };

async function bootPage(p, name) {
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  if (await p.locator('#welcome').isVisible().catch(() => false)) { await p.locator('#wl-name').fill(name); await p.locator('#wl-submit').evaluate((el) => el.click()); }
  await p.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 90000, polling: 100 });
  await p.evaluate(async () => { const A = window.copytrack; A.settings.tutorialDone = true; A.settings.telemetry = false; A.saveSettings(); A.ui.closeModal(); const { profile, saveProfile } = await import('/js/profile.js'); profile().eggs = { ...(profile().eggs || {}), unlockAll: true }; saveProfile(); });
  await p.waitForFunction(() => window.copytrack.ui.modalOpen, null, { timeout: 3000, polling: 50 }).catch(() => {});
  await p.evaluate(() => window.copytrack.ui.closeModal());
}

// ------------------------------------------------------------------------------------------------------------------------------ D1
// Même mécanique que tools/test-live-replay.mjs (session « tenue » : seuls nos appels à update() font avancer la course ; commandes du pilote automatique bruité ; touches R réelles).
async function launch(id, seed, amp) {
  await page.evaluate(async ({ id, seed, amp }) => {
    const A = window.copytrack;
    const [{ RaceSession }, { Autopilot }] = await Promise.all([import('/js/race.js'), import('/js/autopilot.js')]);
    const L = window.__lr = { hold: true, trace: [], inputRespawns: 0, autoRespawns: 0, rBack: [] };
    const proto = RaceSession.prototype;
    if (!proto.__real) {
      proto.__real = proto.update;
      proto.update = function (dt) { if (window.__lr && this === A.session && !this.demo && window.__lr.hold) return undefined; return proto.__real.call(this, dt); };
      const clear = A.input.clearHits.bind(A.input);
      A.input.clearHits = () => { if (!(window.__lr && window.__lr.hold)) clear(); };
    }
    const idx = A.builtins.findIndex((b) => b.def.id === id);
    L.key = A.builtins[idx].key;
    A.playBuiltin(idx);
    const S = L.S = A.session;
    const bot = new Autopilot(S.track.path, { latLimit: 56 * 0.8 });
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
    const stepOnce = S._stepOnce.bind(S);
    S._stepOnce = () => { const was = S.state; stepOnce(); if (was === 'racing') L.trace.push(S.phys.pos.x, S.phys.pos.y, S.phys.pos.z, S.logic.steps); };
    const respawn = S.respawn.bind(S);
    S.respawn = (fromInput) => { const was = S.state; respawn(fromInput); if (was === 'racing') { if (fromInput === true) { L.inputRespawns++; L.rBack.push(S.logic.steps); } else L.autoRespawns++; } };
  }, { id, seed, amp });
}
const advance = (tick, maxCalls = 1500, splits = 0) => page.evaluate(({ tick, maxCalls, splits }) => {
  const L = window.__lr, S = L.S;
  for (let i = 0; i < maxCalls && S.state !== 'finished' && !(S.state === 'racing' && S.tick >= tick && S.logic.splits.length >= splits); i++) S.constructor.prototype.__real.call(S, 0.1);
  return { tick: S.tick, state: S.state, steps: S.logic.steps, splits: S.logic.splits.length };
}, { tick, maxCalls, splits });

function compare(d) {
  const track = Track.decode(d.code);
  const rr = replayRun(track, d.inputs);
  if (!rr) return 'replayRun : pas d’arrivée';
  if (rr.time !== d.time) return `temps : rejeu ${rr.time}, direct ${d.time}`;
  if (JSON.stringify(rr.splits) !== JSON.stringify(d.splits)) return 'temps intermédiaires différents';
  const g = new GhostRunner(track, { inputs: d.inputs });
  const n = d.trace.length / 4;
  for (let k = 0; k < n; k++) {
    g.step();
    const p = g.phys.pos, o = k * 4, dist = Math.hypot(p.x - d.trace[o], p.y - d.trace[o + 1], p.z - d.trace[o + 2]);
    if (dist !== 0 || g.logic.steps !== d.trace[o + 3]) return `pas ${k} : écart ${dist} m`;
  }
  return null;
}

async function d1() {
  await bootPage(page, 'Verif');
  const plan = [['eclats', 'Premiers Éclats (circuit de la phase 1)', [11, 5, 3]], ['hyper', 'Hyperboucle', [11, 5, 3]], ['recif', 'Récif', [11, 5, 3]]];
  for (const [id, nom, seeds] of plan) {
    let done = false;
    for (const seed of seeds) {
      await launch(id, seed, 0.2);
      try {
        let s = await advance(1);
        if (s.state !== 'racing') { note(`D1 ${id}`, false, 'la course ne part pas : ' + s.state); break; }
        for (const step of [{ tick: 400, splits: 0 }, { tick: 300, splits: 1 }, { tick: 200, splits: 2 }]) {
          s = await advance(s.tick + step.tick, 1500, step.splits);
          if (s.state !== 'racing') break;
          await page.keyboard.press('KeyR');
          s = await advance(s.tick + 1);
        }
        s = await advance(Infinity, 3000);
        if (s.state !== 'finished') { continue; }       // cette graine ne finit pas : la suivante
        const d = await page.evaluate(() => { const L = window.__lr, S = L.S; const run = S.lastRun; return { inputs: run.inputs, time: run.time, splits: S.logic.splits.slice(), code: S.track.encode(), key: L.key, trace: L.trace.slice(), inputRespawns: L.inputRespawns, autoRespawns: L.autoRespawns, rBack: L.rBack.slice() }; });
        const diff = compare(d);
        const v = verifyRun({ trackKey: d.key, inputs: d.inputs, time: d.time, physVer: PHYS_VER });
        const ok = !diff && v.ok === true && v.time === d.time;
        note(`D1 ${id}`, ok, `${nom} : graine ${seed}, ${d.trace.length / 4} pas, temps ${d.time}, ${d.inputRespawns} retours par la touche R (aux pas ${d.rBack.join(', ')}), ${d.autoRespawns} réapparitions automatiques ; rejeu : ${diff || 'identique (0 m)'} ; verifyRun : ${v.ok ? 'accepté' : v.error}`);
        done = true;
      } finally {
        await page.evaluate(() => { const A = window.copytrack, L = window.__lr; if (L) { L.hold = false; if (L.realDrive) A.input.drive = L.realDrive; } A.quitRace(); });
        await page.waitForFunction(() => window.copytrack.mode === 'menu' || !document.getElementById('race-hub').classList.contains('hidden'), null, { timeout: 30000 });
        await page.evaluate(() => { const A = window.copytrack; if (!document.getElementById('race-hub').classList.contains('hidden')) A.closeRaceHub(); A.showMenu('menu'); });
      }
      if (done) break;
    }
    if (!done) note(`D1 ${id}`, false, `${nom} : aucune graine parmi ${seeds} ne mène à l’arrivée (non testé)`);
  }
}

// ------------------------------------------------------------------------------------------------------------------------------ D2
// circuit publié → modifié → vérifié : aux vrais boutons de l'éditeur ; seul le serveur de publication est simulé (on garde ce qui lui est envoyé).
async function d2() {
  await bootPage(page, 'Publie');
  await page.evaluate(async () => {
    const { online } = await import('/js/online.js');
    window.__pub = [];
    online.publish = async (track, playerName, proof) => { window.__pub.push({ name: track.name, verified: !!track.verified, vt: track.vt, hasProof: !!proof, proofTime: proof && proof.time, sig: track.signature(), tiles: track.tiles.length }); return { id: '00000000-0000-0000-0000-00000000aaaa' }; };
    const { scriptTrack } = await import('/js/track.js');
    const code = scriptTrack('Mon essai', 'start S4 R S3 finish').encode();
    window.copytrack.openEditor({ name: 'Mon essai', code, fresh: false });
  });
  await page.waitForFunction(() => window.copytrack.mode === 'editor' && window.copytrack.session && window.copytrack.session.track, null, { timeout: 30000 });
  await sleep(1000);
  const st = () => page.evaluate(() => { const t = window.copytrack.session.track; return { tiles: t.tiles.length, verified: !!t.verified, vt: t.vt, sig: t.signature() }; });
  const finishVerify = () => page.evaluate(async () => {
    const A = window.copytrack, S = A.session; const { Autopilot } = await import('/js/autopilot.js'), { centerlineWorld } = await import('/js/ribbons.js');
    let path = S.track.path;
    if (!path) { path = []; for (const t of S.track.tiles) for (const p of centerlineWorld(t, 8)) { const q = path[path.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[2] - p[2]) > 0.5) path.push(p); } }
    const bot = new Autopilot(path, { latLimit: 56 * 0.8 }); bot.reset(S.phys);
    const real = A.input.drive; A.input.drive = () => { if (S.state !== 'racing') return { steer: 0, throttle: false, brake: false, drift: false }; const c = bot.control(S.phys); return { steer: c.steer, throttle: !!c.throttle, brake: !!c.brake, drift: false }; };
    let calls = 0; while (S.state !== 'finished' && calls < 4000 && A.session === S) { S.update(0.1); calls++; if (calls % 40 === 0) await new Promise((r) => setTimeout(r, 0)); }
    A.input.drive = real; return { state: S.state, time: S.logic.time };
  });
  const verify = async () => {
    await page.locator('#editor [data-ed="verify"]').evaluate((b) => b.click());
    await page.waitForFunction(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, { timeout: 90000, polling: 100 });
    const f = await finishVerify();
    await page.waitForFunction(() => window.copytrack.ui.modalOpen && /vérifié|verified/i.test(document.getElementById('modal-title').textContent), null, { timeout: 20000 }).catch(() => {});
    return f;
  };
  const s0 = await st();
  const f1 = await verify();
  const t1 = await page.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : null));
  note('D2 vérification initiale', /vérifié|verified/i.test(t1 || ''), `${s0.tiles} pièces, course ${f1.state} en ${f1.time} s, fenêtre « ${t1} »`);
  // Publier : bouton 1 de « Circuit vérifié », puis le formulaire de publication
  await page.locator('#modal-actions button').first().evaluate((b) => b.click());
  await page.waitForFunction(() => document.getElementById('pub-name'), null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => { const n = document.getElementById('pub-name'); if (n) { n.value = 'Mon essai'; document.getElementById('pub-ok').click(); } });
  await page.locator('#modal-actions button').last().evaluate((b) => b.click());
  await sleep(2500);
  const pub1 = await page.evaluate(() => window.__pub.slice());
  note('D2 publication du circuit vérifié', pub1.length === 1 && pub1[0].verified && pub1[0].hasProof, `envoi au serveur simulé : ${JSON.stringify(pub1)}`);
  await page.evaluate(() => { if (window.copytrack.ui.modalOpen) window.copytrack.ui.closeModal(); });
  await page.waitForFunction(() => window.copytrack.mode === 'editor', null, { timeout: 30000 }).catch(() => {});
  await sleep(1000);
  const afterPub = await st();
  // Modifier : la gomme efface l'arrivée d'un vrai clic (au pixel où la pièce est dessinée) → autre circuit, autre signature
  const px = await page.evaluate(async () => {
    const A = window.copytrack, S = A.session; const THREE = await import('/js/vendor/three.module.min.js'), { CELL } = await import('/js/constants.js'), { PIECES } = await import('/js/pieces.js');
    S.setTool('erase');
    const t = S.track.tiles[S.track.tiles.length - 1], P = PIECES[t.t], v = new THREE.Vector3((t.x + P.size / 2) * CELL, t.l ? t.l * 4 : 0, (t.z + P.size / 2) * CELL);
    S.dist && 0;
    v.project(A.camera);
    const r = A.renderer.domElement.getBoundingClientRect();
    return { x: Math.round(r.left + (v.x + 1) / 2 * r.width), y: Math.round(r.top + (1 - v.y) / 2 * r.height), type: t.t };
  });
  await page.mouse.move(px.x, px.y); await sleep(200); await page.mouse.click(px.x, px.y); await sleep(600);
  const mod = await st();
  note('D2 modification après publication (gomme sur la dernière pièce) : le circuit n’est plus « vérifié »', mod.verified === false && mod.sig !== afterPub.sig, `pièce visée : ${px.type} en (${px.x}, ${px.y}) ; avant : ${JSON.stringify(afterPub)} ; après : ${JSON.stringify(mod)}`);
  await page.locator('#ed-menu-btn').evaluate((b) => b.click()); await sleep(300);
  await page.locator('#ed-menu [data-ed="export"]').evaluate((b) => b.click()); await sleep(900);
  const shareTxt = await page.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-body').textContent.replace(/\s+/g, ' ').slice(0, 300) : 'aucune fenêtre'));
  await page.screenshot({ path: join(OUT, 'd2-partager-non-verifie.png') });
  note('D2 « Partager » d’un circuit modifié', /Non vérifié|Not verified/i.test(shareTxt), `fenêtre : « ${shareTxt} »`);
  await page.evaluate(() => { if (window.copytrack.ui.modalOpen) window.copytrack.ui.closeModal(); });
  // tenter de publier le circuit modifié (sans le revérifier)
  const refused = await page.evaluate(async () => { const A = window.copytrack; const ok = await A.publishTrack(A.session.track); return { ok, toast: document.getElementById('toast').textContent, sent: window.__pub.length }; });
  note('D2 publication refusée tant que le circuit modifié n’est pas revérifié', refused.ok === false && refused.sent === 1, JSON.stringify(refused));
  // Reposer une arrivée (Prolonger), revérifier, republier
  await page.evaluate(() => { const S = window.copytrack.session; S.setTool && S.setTool('finish'); S.extend && S.extend(); }); await sleep(500);
  const f2 = await verify();
  const t2 = await page.evaluate(() => (window.copytrack.ui.modalOpen ? document.getElementById('modal-title').textContent : null));
  note('D2 revérification après modification', /vérifié|verified/i.test(t2 || ''), `course ${f2.state} en ${f2.time} s, fenêtre « ${t2} »`);
  await page.locator('#modal-actions button').first().evaluate((b) => b.click());
  await page.waitForFunction(() => document.getElementById('pub-name'), null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => { const n = document.getElementById('pub-name'); if (n) { n.value = 'Mon essai 2'; document.getElementById('pub-ok').click(); } });
  await page.locator('#modal-actions button').last().evaluate((b) => b.click());
  await sleep(2500);
  const pub2 = await page.evaluate(() => window.__pub.slice());
  note('D2 nouvelle publication du circuit modifié puis revérifié', pub2.length === 2 && pub2[1].verified && pub2[1].hasProof && pub2[1].sig !== pub2[0].sig, `envois : ${JSON.stringify(pub2.map((p) => ({ n: p.name, v: p.verified, sig: p.sig && p.sig.slice(0, 10), tiles: p.tiles, proofTime: p.proofTime })))}`);
}

// ------------------------------------------------------------------------------------------------------------------------------ D3
async function d3() {
  const A = page;
  await bootPage(A, 'Deux');
  const B = await hook(await ctx.newPage(), 'B');
  await bootPage(B, 'Deux');
  const snap = (p) => p.evaluate(async () => { const { profile } = await import('/js/profile.js'); const P = profile(); return { coins: P.coins, fav: (P.favorites || []).map((f) => f.ref), owned: Object.keys(P.owned || {}).length, races: (P.stats || {}).races || 0 }; });
  const s0 = await snap(A);
  // A gagne 100 pièces et met un circuit en favori ; B (sans rechargement) en gagne 30 et met un autre favori, puis chacun enregistre un record différent.
  await A.evaluate(async () => { const { profile, saveProfile } = await import('/js/profile.js'), { toggleFavorite } = await import('/js/favorites.js'); const P = profile(); P.coins += 100; toggleFavorite(P, 'b:fav_a', 'A'); saveProfile(); });
  await B.evaluate(async () => { const { profile, saveProfile } = await import('/js/profile.js'), { toggleFavorite } = await import('/js/favorites.js'); const P = profile(); P.coins += 30; toggleFavorite(P, 'b:fav_b', 'B'); saveProfile(); });
  await sleep(1500);
  const a1 = await snap(A), b1 = await snap(B);
  // Rechargement : ce que le stockage garde
  await A.reload({ waitUntil: 'load' }); await A.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 90000, polling: 100 });
  const a2 = await snap(A);
  note('D3 profil modifié depuis deux onglets (pièces)', a2.coins === s0.coins + 130, `départ ${s0.coins} ◆ ; A +100, B +30 sans rechargement ; A voit ${a1.coins}, B voit ${b1.coins} ; après rechargement : ${a2.coins} (attendu ${s0.coins + 130} si rien ne se perd)`);
  note('D3 favoris des deux onglets', a2.fav.includes('b:fav_a') && a2.fav.includes('b:fav_b'), `après rechargement : ${JSON.stringify(a2.fav)}`);
  // Records : deux circuits différents, un dans chaque onglet
  await A.evaluate(async () => { const s = await import('/js/storage.js'), { PHYS_VER: pv } = await import('/js/version.js'); s.saveRecord(window.copytrack.builtins[3].key, { time: 33.3, inputs: 'x', pv, date: Date.now(), splits: [] }); });
  await B.evaluate(async () => { const s = await import('/js/storage.js'), { PHYS_VER: pv } = await import('/js/version.js'); s.saveRecord(window.copytrack.builtins[4].key, { time: 44.4, inputs: 'x', pv, date: Date.now(), splits: [] }); });
  await sleep(800);
  await A.reload({ waitUntil: 'load' }); await A.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 90000, polling: 100 });
  const recs = await A.evaluate(async () => { const s = await import('/js/storage.js'); const a = window.copytrack.builtins; return [s.getRecord(a[3].key), s.getRecord(a[4].key)].map((r) => r && r.time); });
  note('D3 records des deux onglets', recs[0] === 33.3 && recs[1] === 44.4, `après rechargement : ${JSON.stringify(recs)}`);
  // Réglages : A change la qualité, B le volume
  await A.evaluate(() => { const a = window.copytrack; a.settings.fovAdd = 7; a.saveSettings(); });
  await B.evaluate(() => { const a = window.copytrack; a.settings.volume = 0.31; a.saveSettings(); });
  await sleep(600);
  await A.reload({ waitUntil: 'load' }); await A.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 90000, polling: 100 });
  const st = await A.evaluate(() => ({ fov: window.copytrack.settings.fovAdd, volume: window.copytrack.settings.volume }));
  note('D3 réglages des deux onglets', st.fov === 7 && st.volume === 0.31, `après rechargement : ${JSON.stringify(st)} (attendu fov 7 et volume 0,31)`);
  // Même essai avec un délai réaliste : A enregistre, l'autre onglet est laissé 2 s pour apprendre le changement, PUIS B enregistre une autre modification.
  await A.evaluate(async () => { const { profile, saveProfile } = await import('/js/profile.js'), { toggleFavorite } = await import('/js/favorites.js'); const P = profile(); toggleFavorite(P, 'b:fav_a2', 'A2'); saveProfile(); const a = window.copytrack; a.settings.fovAdd = 9; a.saveSettings(); });
  await sleep(2000);
  await B.evaluate(async () => { const { profile, saveProfile } = await import('/js/profile.js'), { toggleFavorite } = await import('/js/favorites.js'); const P = profile(); toggleFavorite(P, 'b:fav_b2', 'B2'); saveProfile(); const a = window.copytrack; a.settings.volume = 0.22; a.saveSettings(); });
  await sleep(1500);
  await A.reload({ waitUntil: 'load' }); await A.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 90000, polling: 100 });
  const fin = await A.evaluate(async () => { const { profile } = await import('/js/profile.js'); return { fav: (profile().favorites || []).map((f) => f.ref), fov: window.copytrack.settings.fovAdd, volume: window.copytrack.settings.volume }; });
  note('D3b modifications espacées de 2 s (l’autre onglet a eu le temps d’apprendre)', fin.fav.includes('b:fav_a2') && fin.fav.includes('b:fav_b2') && fin.fov === 9 && fin.volume === 0.22, `après rechargement : ${JSON.stringify(fin)} (attendu : b:fav_a2 et b:fav_b2, fov 9, volume 0,22)`);
  await B.close();
}

try {
  if (part === 'd1' || part === 'tout') await d1();
  if (part === 'd2' || part === 'tout') await d2();
  if (part === 'd3' || part === 'tout') await d3();
} catch (e) {
  console.log('INTERROMPU :', e.stack || e.message);
  note('INTERROMPU', false, String(e.message).slice(0, 400));
} finally {
  writeFileSync(join(OUT, 'interactions.json'), JSON.stringify({ results, errors }, null, 1));
  console.log('erreurs de la page :', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close(); server.kill();
}
