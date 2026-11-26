// Rythmes des fantômes de médaille (COMPLETE-009) : pour chaque circuit officiel, le rythme du pilote automatique (js/pace.js) qui fait tourner le fantôme au seuil de chaque
// médaille (bronze, argent, or, cristal). Les données sont GÉNÉRÉES dans js/ghostPaces.js ; ce programme les recalcule et les vérifie, comme tools/golden.mjs pour les temps de référence.
//
//   node tools/ghost-rythmes.mjs                  vérifie que js/ghostPaces.js est à jour (npm test : tools/test-fantome-rythme.mjs) : mêmes circuits (clé), mêmes seuils, et le fantôme
//                                                 au rythme enregistré finit bien dans le temps enregistré, sans réapparition ni choc
//   node tools/ghost-rythmes.mjs --update [id…]   recalcule (tous les circuits, ou ceux nommés) et réécrit js/ghostPaces.js (en parallèle : un processus par cœur)
//   node tools/ghost-rythmes.mjs --report         tableau des écarts (temps du fantôme / seuil de la médaille)
//
// Méthode : le fantôme est le vrai GhostRunner du jeu (même pilote, mêmes réglages). Une course est « propre » quand il finit sans réapparition ni choc de mur (sinon le fantôme
// téléporterait ou frotterait la paroi). L'or est le rythme 1 : c'est le fantôme or d'avant, tel quel. Bronze et argent : on ralentit (rythme < 1), cristal : on pousse le pilote
// (rythme > 1). Balayage par pas de 0,1 jusqu'à passer le seuil, puis dichotomie entre les deux rythmes qui l'encadrent ; on garde le rythme propre dont le temps est le plus proche.
// Un cristal que le pilote ne peut pas atteindre proprement reste au meilleur rythme propre (écart enregistré : le cristal demande de faire mieux que le pilote, c'est voulu).
import { writeFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { GhostRunner } from '../js/replay.js';
import { PACE_MIN, PACE_MAX } from '../js/pace.js';
import { DT } from '../js/constants.js';

const FILE = new URL('../js/ghostPaces.js', import.meta.url);
export const MEDAL_ORDER = ['cristal', 'or', 'argent', 'bronze'];
export const TOLERANCE = 0.03;          // « à peu près » : à 3 % du seuil de la médaille
const MAX_STEPS = Math.round(400 / DT);

// Une course du fantôme à ce rythme : { t (null si pas d'arrivée), resp, walls, clean }.
export function measurePace(track, pace) {
  const g = new GhostRunner(track, { bot: true, latK: 0.8, pace });
  let resp = 0, walls = 0;
  const rw = g.sim.rewind.bind(g.sim);
  g.sim.rewind = (...a) => { resp++; return rw(...a); };
  while (!g.done && g.k < MAX_STEPS) { g.step(); if (g.phys.ev.wall > 4) walls++; if (resp > 3) break; }
  const t = g.logic.finished ? g.logic.time : null;
  return { t, resp, walls, clean: t != null && resp === 0 && walls === 0 };
}

const r4 = (x) => Math.round(x * 1e4) / 1e4;
// Cherche le rythme dont le temps est le plus proche de `target` dans le sens `dir` (-1 : plus lent que 1, +1 : plus rapide).
function search(track, target, dir, base) {
  const seen = [{ pace: 1, ...base }];
  const ev = (pace) => { pace = r4(Math.max(PACE_MIN, Math.min(PACE_MAX, pace))); const hit = seen.find((s) => s.pace === pace); if (hit) return hit; const m = { pace, ...measurePace(track, pace) }; seen.push(m); return m; };
  let prev = seen[0], bracket = null, bad = 0, edge = null;       // edge : le dernier rythme propre et le premier raté qui le suit (la limite de ce que le pilote tient)
  for (let p = 1 + dir * 0.1; p >= PACE_MIN - 1e-9 && p <= PACE_MAX + 1e-9; p += dir * 0.1) {
    const m = ev(p);
    if (!m.clean) { if (!edge) edge = [prev.pace, m.pace]; if (++bad >= 3) break; continue; }
    bad = 0; edge = null;
    if ((m.t - target) * (prev.t - target) <= 0) { bracket = [prev.pace, m.pace]; break; }
    prev = m;
    if ((dir < 0 && m.t > target * 1.2) || (dir > 0 && m.t < target * 0.8)) break;
  }
  if (bracket) {
    let a = bracket[0], b = bracket[1];
    for (let i = 0; i < 9; i++) {
      const mid = (a + b) / 2, m = ev(mid);
      if (!m.clean) { b = mid; continue; }       // un rythme trop poussé qui rate : on se rapproche du côté propre
      if ((m.t - target) * (ev(a).t - target) <= 0) b = mid; else a = mid;
    }
  }
  else if (edge) {
    // Pas de rythme propre au-delà du seuil : on cherche le plus extrême que le pilote tient (le meilleur qu'il puisse faire proprement dans ce sens).
    let a = edge[0], b = edge[1];
    for (let i = 0; i < 9; i++) { const mid = (a + b) / 2; if (ev(mid).clean) a = mid; else b = mid; }
  }
  const clean = seen.filter((s) => s.clean);
  clean.sort((x, y) => Math.abs(x.t - target) - Math.abs(y.t - target));
  return clean[0];
}

export const keyHash = (def) => hashString(buildBuiltin(def).encode());

// Les entrées d'un circuit : { h, m: seuils [cristal, or, argent, bronze], p: rythmes, t: temps du fantôme }.
export function calibrate(def) {
  const track = buildBuiltin(def), gold = measurePace(track, null);
  const out = { h: keyHash(def), m: MEDAL_ORDER.map((k) => def.medals[k]), p: [], t: [] };
  for (const k of MEDAL_ORDER) {
    const target = def.medals[k];
    const best = k === 'or' ? { pace: 1, ...gold } : search(track, target, k === 'cristal' ? 1 : -1, gold);
    if (!best) { out.p.push(1); out.t.push(+gold.t.toFixed(2)); continue; }
    out.p.push(best.pace); out.t.push(+best.t.toFixed(2));
  }
  return out;
}

export const loadTable = async () => (await import('../js/ghostPaces.js?' + Date.now())).GHOST_PACES;
export function writeTable(table) {
  const lines = Object.keys(table).map((id) => { const e = table[id]; return ` ${id}: { h: '${e.h}', m: ${JSON.stringify(e.m)}, p: ${JSON.stringify(e.p)}, t: ${JSON.stringify(e.t)} },`; });
  writeFileSync(FILE, `// FICHIER GÉNÉRÉ par tools/ghost-rythmes.mjs (COMPLETE-009) : ne pas modifier à la main. Pour chaque circuit officiel : h = empreinte du circuit (la fin de sa clé b-), m = les seuils des médailles
// [cristal, or, argent, bronze] pour lesquels les rythmes ont été calculés, p = le rythme du pilote automatique (js/pace.js) qui fait tourner le fantôme à ce seuil, t = le temps que fait alors
// le fantôme (s). Le jeu n'utilise une entrée que si h et m sont ceux du circuit joué (sinon : le fantôme or, comme avant). Vérifié par npm test ; refaire : node tools/ghost-rythmes.mjs --update
export const GHOST_PACE_ORDER = ['cristal', 'or', 'argent', 'bronze'];
export const GHOST_PACES = {
${lines.join('\n')}
};
`);
}

// Ce qui n'est plus à jour dans l'entrée d'un circuit (liste vide : à jour). run : refaire courir le fantôme à chaque rythme enregistré (sinon : seulement l'empreinte et les seuils).
export function checkEntry(def, e, run = true) {
  if (!e) return ['ABSENT'];
  const probs = [];
  if (e.h !== keyHash(def)) probs.push('circuit modifié (empreinte)');
  if (JSON.stringify(e.m) !== JSON.stringify(MEDAL_ORDER.map((k) => def.medals[k]))) probs.push('seuils de médailles modifiés');
  if (!probs.length && run) {
    const track = buildBuiltin(def);
    MEDAL_ORDER.forEach((k, i) => {
      const m = measurePace(track, e.p[i] === 1 ? null : e.p[i]);
      if (!m.clean || +m.t.toFixed(2) !== e.t[i]) probs.push(`${k} : rythme ${e.p[i]} donne ${m.t == null ? 'pas d\'arrivée' : m.t.toFixed(2) + ' s'}${m.clean ? '' : ' (pas propre)'}, enregistré ${e.t[i]} s`);
    });
  }
  return probs;
}

const idsOf = (a) => a.filter((x) => !x.startsWith('--'));
if (process.argv[1] && process.argv[1].endsWith('ghost-rythmes.mjs')) {
  const args = process.argv.slice(2);
  if (args.includes('--worker')) {          // enfant : calibre les circuits reçus et renvoie le résultat
    process.on('message', (ids) => {
      const out = {};
      for (const id of ids) out[id] = calibrate(BUILTIN_TRACKS.find((d) => d.id === id));
      process.send(out, () => process.exit(0));
    });
  } else if (args.includes('--update')) {
    const want = idsOf(args);
    const defs = BUILTIN_TRACKS.filter((d) => !want.length || want.includes(d.id));
    let table = {};
    try { table = { ...(await loadTable()) }; } catch { /* première écriture */ }
    const n = Math.max(1, Math.min(availableParallelism(), defs.length));
    const chunks = Array.from({ length: n }, (_, i) => defs.filter((_d, j) => j % n === i).map((d) => d.id));
    await Promise.all(chunks.map((ids) => new Promise((resolve, reject) => {
      const c = fork(fileURLToPath(import.meta.url), ['--worker']);
      c.on('message', (r) => { Object.assign(table, r); });
      c.on('exit', (code) => (code ? reject(new Error('calibrage interrompu')) : resolve()));
      c.send(ids);
    })));
    const ordered = Object.fromEntries(BUILTIN_TRACKS.filter((d) => table[d.id]).map((d) => [d.id, table[d.id]]));
    writeTable(ordered);
    console.log(`js/ghostPaces.js écrit : ${Object.keys(ordered).length} circuits`);
  } else {
    const table = await loadTable();
    const report = args.includes('--report');
    let bad = 0;
    for (const d of BUILTIN_TRACKS) {
      const e = table[d.id], probs = checkEntry(d, e, !report);
      if (report && e) console.log(d.id.padEnd(14), MEDAL_ORDER.map((k, i) => `${k} ${String(e.p[i]).padStart(6)} → ${String(e.t[i]).padStart(6)} s (${((e.t[i] / e.m[i] - 1) * 100).toFixed(1).padStart(5)} %)`).join('   '));
      if (probs.length) { bad++; console.log(d.id.padEnd(14), probs.join(' ; ')); }
    }
    if (!report) console.log(bad ? `${bad} circuit(s) à recalculer : node tools/ghost-rythmes.mjs --update` : 'Les rythmes des fantômes de médaille sont à jour.');
    process.exitCode = bad && !report ? 1 : 0;
  }
}
