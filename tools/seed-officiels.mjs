// Amorces officielles (COMPLETE-010) : des temps et des fantômes du PILOTE AUTOMATIQUE du jeu, un par niveau de médaille, pour chaque circuit de la carrière, rangés dans
// la table SÉPARÉE `official_runs` (supabase/etape23-amorces.sql), jamais dans `scores` : places, points, divisions et Elo des joueurs ne les voient pas.
// Le jeu les montre étiquetés « Officiel · automatique », sans numéro de place, comme cible quand peu de joueurs ont couru.
//
// DEUX TEMPS, pour que rien ne parte par erreur :
//   1. calcul, hors ligne (aucun réseau) :   node tools/seed-officiels.mjs --out amorces.json [id…]
//        pour chaque circuit (tous, ou ceux nommés) et chaque niveau (bronze, argent, or, cristal : rythmes calibrés de js/ghostPaces.js), le pilote automatique court ;
//        ses commandes (volant quantifié au centième, comme une course du jeu) sont enregistrées, puis la course est REJOUÉE par la vérification du serveur (js/verify.js,
//        verifyRun : celle qui accepte les temps des joueurs) qui en fabrique le fantôme. Seuls sont gardés : les courses qui finissent sans réapparition, dont le rejeu
//        redonne exactement le temps, et dont le temps est à moins de 6 % du seuil de la médaille (sinon l'étiquette « niveau bronze » mentirait ; même tolérance que
//        le fantôme de médaille du jeu, js/ghostTarget.js). Le fichier est DÉTERMINISTE : deux calculs donnent le même fichier, octet pour octet (aucune date).
//        --testeurs codes.txt : ajoute des courses de testeurs (codes de fantôme « SHG1: » du jeu, un par ligne). À n'utiliser QU'AVEC L'ACCORD du testeur : son pseudo
//        (celui du code) sera public, étiqueté « Officiel · testeur ». Chaque course est rejouée de même ; une course qui ne se rejoue pas est refusée.
//   2. envoi, par le PROPRIÉTAIRE du projet, sur sa machine :
//        SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=… node tools/seed-officiels.mjs --send amorces.json [--dry]
//        relit le fichier, REVÉRIFIE chaque course (même PHYS_VER que ce dépôt, rejeu exact), puis l'écrit par « upsert » (relancer remplace, n'ajoute pas de doublon).
//        La clé de SERVICE ne doit jamais être dans le jeu ni dans un dépôt. --dry : vérifie et dit ce qui partirait, sans rien envoyer.
// Les amorces d'une ancienne physique restent en base sans gêner (le jeu ne lit que celles de son PHYS_VER) ; après un changement de physique, recalculer et renvoyer.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { GhostRunner, InputRecorder, quantSteer, decodeGhost } from '../js/replay.js';
import { verifyRun } from '../js/verify.js';
import { paceEntry, SHOW_TOLERANCE } from '../js/ghostTarget.js';
import { GHOST_PACES, GHOST_PACE_ORDER } from '../js/ghostPaces.js';
import { PHYS_VER } from '../js/version.js';
import { MAX_RUN_STEPS } from '../js/constants.js';

export const TOOL = 'seed-officiels/1';
export const LEVELS = ['bronze', 'argent', 'or', 'cristal'];                   // du plus lent au plus rapide (ordre du fichier)
export const KEY_RE = /^b-[a-z0-9]{1,40}-[a-z0-9]{1,16}$/;                    // la contrainte de official_runs.track_key (étape 23)
const LEVEL_RE = /^[a-z0-9-]{1,24}$/;

export const keyOf = (def) => `b-${def.id}-${hashString(buildBuiltin(def).encode())}`;

// Une course du pilote automatique au rythme `pace` (null : le fantôme or d'origine), commandes ENREGISTRÉES telles que le jeu les enregistre (volant au centième) :
// c'est la course quantifiée qui roule, pas une course continue « approchée » ensuite. { time, inputs, respawns } ou null (pas d'arrivée).
export function botRun(track, pace) {
  const g = new GhostRunner(track, { bot: true, latK: 0.8, pace });
  if (!g.bot) return null;
  const rec = new InputRecorder();
  const control = g.bot.control.bind(g.bot);
  g.bot.control = (phys) => {
    const c = control(phys);
    const q = { steer: quantSteer(c.steer), throttle: !!c.throttle, brake: !!c.brake, drift: false, respawn: !!c.respawn };
    rec.push(q, q.respawn);
    return q;
  };
  let respawns = 0;
  const rewind = g.sim.rewind.bind(g.sim);
  g.sim.rewind = (...a) => { respawns++; return rewind(...a); };
  while (!g.done && g.k < MAX_RUN_STEPS) g.step();
  if (!g.logic.finished) return null;
  return { time: g.logic.time, inputs: rec.encode(), respawns };
}

// Les amorces d'un circuit : [{ track_key, phys_ver, source, level, pilot, time, inputs, ghost, ghost_veh, splits, tool }], niveaux dans l'ordre LEVELS ; `skipped` dit pourquoi un niveau manque.
export function seedTrack(def, { table = GHOST_PACES } = {}) {
  const track = buildBuiltin(def), key = keyOf(def), runs = [], skipped = [];
  const entry = paceEntry(key, def.medals, table);
  if (!entry || !track.path) return { runs, skipped: LEVELS.map((l) => [l, entry ? 'pas de ligne de pilotage' : 'rythmes non calibrés pour ce circuit (js/ghostPaces.js)']) };
  for (const level of LEVELS) {
    const i = GHOST_PACE_ORDER.indexOf(level), pace = entry.p[i] === 1 ? null : entry.p[i];
    const run = botRun(track, pace);
    if (!run) { skipped.push([level, 'pas d’arrivée']); continue; }
    if (run.respawns) { skipped.push([level, `${run.respawns} réapparition(s)`]); continue; }
    const gap = run.time / def.medals[level] - 1;
    if (Math.abs(gap) > SHOW_TOLERANCE) { skipped.push([level, `à ${(gap * 100).toFixed(1)} % du seuil`]); continue; }
    const v = verifyRun({ trackKey: key, inputs: run.inputs, time: run.time, physVer: PHYS_VER, withGhost: true });
    if (!v.ok || v.time !== run.time) { skipped.push([level, 'le rejeu ne redonne pas le temps : ' + (v.error || v.time)]); continue; }
    runs.push({ track_key: key, phys_ver: PHYS_VER, source: 'auto', level, pilot: null, time: v.time, inputs: run.inputs, ghost: v.ghost, ghost_veh: v.ghostVeh, splits: v.splits, tool: TOOL });
  }
  return { runs, skipped };
}

// Une course de testeur (code « SHG1: » du jeu) : rejouée par la vérification du serveur. { run } ou { error }.
export const slug = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'testeur';
export function testerRun(code) {
  let g;
  try { g = decodeGhost(code); } catch (e) { return { error: e.message }; }
  if (g.v !== PHYS_VER) return { error: `physique ${g.v}, ce dépôt est en ${PHYS_VER}` };
  const def = BUILTIN_TRACKS.find((d) => keyOf(d) === g.trackKey);
  if (!def) return { error: 'ce n’est pas un circuit de la carrière (clé ' + g.trackKey + ')' };
  const name = String(g.name || '').trim().slice(0, 20);
  if (!name || name === '—') return { error: 'pseudo absent' };
  const v = verifyRun({ trackKey: g.trackKey, inputs: g.inputs, time: g.time, physVer: PHYS_VER, withGhost: true });
  if (!v.ok) return { error: v.error };
  return { run: { track_key: g.trackKey, phys_ver: PHYS_VER, source: 'testeur', level: slug(name), pilot: name, time: v.time, inputs: g.inputs, ghost: v.ghost, ghost_veh: v.ghostVeh, splits: v.splits, tool: TOOL } };
}

// Le fichier : { tool, physVer, runs } (ordre : carrière, puis niveaux ; testeurs à la fin, par circuit puis pseudo). Texte stable : aucune date, clés dans un ordre fixe.
const FIELDS = ['track_key', 'phys_ver', 'source', 'level', 'pilot', 'time', 'inputs', 'ghost', 'ghost_veh', 'splits', 'tool'];
export function serialize(runs) {
  const order = new Map(BUILTIN_TRACKS.map((d, i) => [keyOf(d), i]));
  const sorted = runs.slice().sort((a, b) => (a.source === b.source ? 0 : a.source === 'auto' ? -1 : 1) || (order.get(a.track_key) - order.get(b.track_key)) || (a.source === 'auto' ? LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) : a.level.localeCompare(b.level)));
  const rows = sorted.map((r) => '  ' + JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? null]))));
  return `{\n "tool": ${JSON.stringify(TOOL)},\n "physVer": ${PHYS_VER},\n "runs": [\n${rows.join(',\n')}\n ]\n}\n`;
}
export const digest = (text) => createHash('sha256').update(text).digest('hex');

export function computeAll({ ids = [], testerCodes = [], log = () => {} } = {}) {
  const defs = BUILTIN_TRACKS.filter((d) => !ids.length || ids.includes(d.id));
  const runs = [], skipped = [];
  for (const def of defs) {
    const r = seedTrack(def);
    runs.push(...r.runs);
    for (const [level, why] of r.skipped) skipped.push(`${def.id} ${level} : ${why}`);
    log(`  ${def.id} : ${r.runs.map((x) => `${x.level} ${x.time.toFixed(3)} s`).join(', ') || 'aucune amorce'}`);
  }
  for (const code of testerCodes) {
    const r = testerRun(code);
    if (r.error) { skipped.push('testeur : ' + r.error); continue; }
    if (runs.some((x) => x.track_key === r.run.track_key && x.source === 'testeur' && x.level === r.run.level)) { skipped.push(`testeur ${r.run.pilot} : deux courses sur le même circuit (la première est gardée)`); continue; }
    runs.push(r.run);
  }
  return { runs, skipped };
}

// Ce qu'un fichier contient, revérifié : chaque ligne bien formée (contraintes de la table), même physique que ce dépôt, rejeu exact. Lève une erreur au premier défaut.
export function checkFile(data) {
  if (!data || data.tool !== TOOL || !Array.isArray(data.runs)) throw new Error('Fichier d’amorces illisible (outil ' + (data && data.tool) + ').');
  if (data.physVer !== PHYS_VER) throw new Error(`Fichier calculé en physique ${data.physVer} ; ce dépôt est en ${PHYS_VER} : recalcule-le (--out).`);
  const seen = new Set();
  for (const r of data.runs) {
    const id = `${r.track_key} ${r.source} ${r.level}`;
    if (!KEY_RE.test(r.track_key) || r.phys_ver !== PHYS_VER || !['auto', 'testeur'].includes(r.source) || !LEVEL_RE.test(r.level)) throw new Error('Ligne invalide : ' + id);
    if (r.source === 'auto' && (!LEVELS.includes(r.level) || r.pilot !== null)) throw new Error('Ligne automatique invalide : ' + id);
    if (r.source === 'testeur' && !(typeof r.pilot === 'string' && r.pilot.length >= 1 && r.pilot.length <= 20)) throw new Error('Testeur sans pseudo : ' + id);
    if (seen.has(id)) throw new Error('Ligne en double : ' + id);
    seen.add(id);
    const v = verifyRun({ trackKey: r.track_key, inputs: r.inputs, time: r.time, physVer: r.phys_ver, withGhost: true });
    if (!v.ok || v.time !== r.time || v.ghost !== r.ghost) throw new Error('La course ne se rejoue pas à l’identique : ' + id + (v.error ? ' (' + v.error + ')' : ''));
  }
  return data.runs.length;
}

// Envoi par la clé de service (upsert : la clé primaire de la table décide ; relancer remplace). Par lots, pour rester sous la taille d'une requête.
export async function send({ url, key, runs, fetchImpl = globalThis.fetch, batch = 20, dry = false, log = console.log }) {
  if (!url || !/^https?:\/\//.test(url) || !key) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires (clé de SERVICE, sur ta machine seulement).');
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  let sent = 0;
  for (let i = 0; i < runs.length; i += batch) {
    const part = runs.slice(i, i + batch).map((r) => ({ ...Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? null])), updated_at: new Date().toISOString() }));
    if (dry) { log(`  (à blanc) ${part.length} amorce(s) : ${part.map((r) => r.track_key + ' ' + r.level).join(', ')}`); sent += part.length; continue; }
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/official_runs?on_conflict=track_key,phys_ver,source,level`, { method: 'POST', headers: H, body: JSON.stringify(part) });
    if (!res.ok) throw new Error(`Écriture refusée (${res.status}) : l'étape SQL 23 est-elle appliquée, la clé est-elle celle de service ? ${(await res.text()).slice(0, 200)}`);
    sent += part.length;
    log(`  ✓ ${sent} / ${runs.length}`);
  }
  return sent;
}

const USAGE = `usage :
  node tools/seed-officiels.mjs --out amorces.json [--testeurs codes.txt] [id…]      calcule (hors ligne, déterministe)
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/seed-officiels.mjs --send amorces.json [--dry]      envoie (propriétaire du projet)`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {          // (lancé, pas importé : le test l'importe)
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const fileArgs = new Set([val('--out'), val('--send'), val('--testeurs')].filter(Boolean));
  const ids = args.filter((a) => !a.startsWith('--') && !fileArgs.has(a));
  try {
    if (args.includes('--send')) {
      const file = val('--send');
      if (!file) throw new Error(USAGE);
      const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires pour --send (rien n’a été envoyé).\n' + USAGE);
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const n = checkFile(data);
      console.log(`${n} amorce(s) revérifiée(s) (physique ${PHYS_VER}, rejeu exact).`);
      const sent = await send({ url, key, runs: data.runs, dry: args.includes('--dry') });
      console.log(args.includes('--dry') ? `Essai à blanc : ${sent} amorce(s) partiraient ; rien n'a été envoyé.` : `${sent} amorce(s) écrite(s) dans official_runs.`);
    } else if (args.includes('--out')) {
      const out = val('--out');
      if (!out) throw new Error(USAGE);
      const testerCodes = val('--testeurs') ? readFileSync(val('--testeurs'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('SHG1:')) : [];
      const { runs, skipped } = computeAll({ ids, testerCodes, log: console.log });
      const text = serialize(runs);
      writeFileSync(out, text);
      console.log(`${out} : ${runs.length} amorce(s), physique ${PHYS_VER}, empreinte ${digest(text).slice(0, 16)}.`);
      if (skipped.length) console.log(`Non retenues (${skipped.length}) :\n  ${skipped.join('\n  ')}`);
    } else { console.log(USAGE); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
