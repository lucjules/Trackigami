// Objectifs bonus de la carrière (COMPLETE-012) : mesure, proposition et preuve de faisabilité.
//
//   node tools/objectifs.mjs                  vérifie que l'objectif de CHAQUE circuit est réalisable (pilote automatique, ou le geste de mini-turbo de tools/objectifs-recettes.json)
//   node tools/objectifs.mjs --propose [id…]  mesure les circuits et propose des objectifs (air, vitesse, section, mini-turbos en section) avec leurs seuils
//   node tools/objectifs.mjs --recettes       cherche les réglages du geste qui réalisent les objectifs de mini-turbos et réécrit tools/objectifs-recettes.json
//
// Réalisable = une course qui finit et remplit l'objectif, comptée exactement comme la course en direct (tools/goalrun.mjs → js/runStats.js), sans réapparition,
// avec le pilote automatique des médailles (ou, pour les mini-turbos que le pilote ne fait pas, le geste du joueur greffé sur lui) ; aucun objectif ne demande
// plus que ce qu'une de ces courses a réellement fait. Les seuils proposés gardent la marge de l'objectif « moins de t s » : entre l'or et l'argent, à portée d'un bon joueur.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { goalMet, goalLabel, sectionTime, GOALS } from '../js/career.js';
import { measureRun, GestureDriver } from './goalrun.mjs';
import { DT } from '../js/constants.js';

const RECIPES = new URL('./objectifs-recettes.json', import.meta.url);
export const loadRecipes = () => (existsSync(RECIPES) ? JSON.parse(readFileSync(RECIPES, 'utf8')) : {});

// Le conducteur qui prouve l'objectif d'un circuit : le geste de sa recette s'il en a une, sinon le pilote automatique.
export function proofRun(def, goal = def.goal, recipes = loadRecipes()) {
  const track = buildBuiltin(def), r = recipes[def.id];
  const driver = r && goal.id === 'turbo' ? new GestureDriver(track, r) : null;
  return measureRun(track, { goal, driver });
}

// Une ligne de contrôle : { ok (objectif rempli), run (la course), detail }.
export function checkGoal(def, recipes = loadRecipes()) {
  const R = proofRun(def, def.goal, recipes);
  const clean = R.ok && (def.goal.id === 'turbo' ? R.stats.wallHits === 0 : true);
  return { ok: R.ok && clean && goalMet(def.goal, R.stats), R, clean };
}

// Mesures d'un circuit au pilote automatique : vol le plus long, vitesse maximale, durée et vitesse moyenne de chaque section (entre points de passage).
export function measureCircuit(def) {
  const track = buildBuiltin(def), R = measureRun(track), st = R.stats;
  const n = st.splits.length + 1, bounds = [0, ...st.splits, st.steps];
  const sections = [];
  for (let i = 0; i < n; i++) sections.push({ a: i, b: i < st.splits.length ? i + 1 : null, t: (bounds[i + 1] - bounds[i]) * DT });
  return { R, st, sections };
}

const r05 = (x) => Math.floor(x * 2 + 1e-9) / 2;
export function propose(def) {
  const { R, st, sections } = measureCircuit(def);
  const out = { ok: R.ok, time: R.time, air: null, speed: null, section: null };
  if (st.airBest >= 2) out.air = { id: 'air', t: r05(st.airBest * 0.85) };
  out.speed = { id: 'speed', v: Math.floor((st.vmax * 3.6 * 0.96) / 5) * 5 };
  // La section la plus longue : c'est là que se joue le circuit (à égalité de goût, la plus lente en moyenne se devine mal : on prend la durée).
  const best = [...sections].sort((x, y) => y.t - x.t)[0];
  if (best && best.t >= 8) { const g = { id: 'section', a: best.a, ...(best.b != null ? { b: best.b } : {}), t: Math.ceil(best.t * 1.04 * 10) / 10 }; out.section = g; }
  out.feat = { airBest: +st.airBest.toFixed(2), vmax: Math.round(st.vmax * 3.6), perfects: st.perfects, rings: st.rings, splits: st.splits.map((s) => +(s * DT).toFixed(1)) };
  return out;
}

// Réglages du geste pour réaliser un objectif de mini-turbos (n, dans sa section) : on balaie le départ du geste, le frein et la durée du volant.
export function searchRecipe(def, goal) {
  const track = buildBuiltin(def);
  for (const hold of [0.6, 0.5, 0.7]) for (const lock of [1.4, 1.0, 1.8]) {
    for (let start = 0; start < 90; start += 1) {
      const r = { start, hold, lock, count: Math.max(1, goal.n || 1) };
      const R = measureRun(track, { goal, driver: new GestureDriver(track, r) });
      if (R.ok && R.stats.wallHits === 0 && R.stats.respawns === 0 && goalMet(goal, R.stats)) return r;
    }
  }
  return null;
}

if (process.argv[1] && process.argv[1].split('/').pop() === 'objectifs.mjs') {
  const args = process.argv.slice(2), ids = args.filter((a) => !a.startsWith('--'));
  const defs = BUILTIN_TRACKS.filter((d) => !ids.length || ids.includes(d.id));
  if (args.includes('--propose')) {
    for (const d of defs) {
      const P = propose(d);
      console.log(d.id.padEnd(13), (d.profil || '').padEnd(13), JSON.stringify(d.goal).padEnd(30), 'air', P.air ? P.air.t : '-', ' speed', P.speed.v, ' section', P.section ? `${P.section.a}→${P.section.b ?? 'fin'} ${P.section.t}` : '-', ' ', JSON.stringify(P.feat));
    }
  } else if (args.includes('--recettes')) {
    const recipes = loadRecipes();
    for (const d of defs) {
      if (d.goal.id !== 'turbo') continue;
      const r = searchRecipe(d, d.goal);
      console.log(d.id.padEnd(13), r ? JSON.stringify(r) : 'AUCUNE RECETTE');
      if (r) recipes[d.id] = r; else delete recipes[d.id];
    }
    writeFileSync(RECIPES, JSON.stringify(recipes, null, 1) + '\n');
  } else {
    let bad = 0;
    for (const d of defs) {
      const { ok, R } = checkGoal(d);
      if (!ok) bad++;
      if (!ok || args.includes('--all')) console.log((ok ? 'ok     ' : 'ÉCHEC  ') + d.id.padEnd(13), goalLabel(d.goal).padEnd(44), R.ok ? `course ${R.time.toFixed(1)} s, ${R.stats.wallHits} chocs, ${R.stats.respawns} réapp., air ${R.stats.airBest.toFixed(2)} s, vmax ${(R.stats.vmax * 3.6).toFixed(0)} km/h, turbos ${R.stats.turbos}` : 'pas d\'arrivée');
    }
    console.log(bad ? `${bad} objectif(s) non prouvé(s).` : `Les ${defs.length} objectifs sont réalisables.`);
    process.exitCode = bad ? 1 : 0;
  }
}
void GOALS; void sectionTime;
