// Catégories de record finissables par le pilote automatique (GAME-006, TRANS-14) :
//   node tools/categories-faisables.mjs             -> mesure (circuit × catégorie) et écrit js/categoriesFaisables.js   (npm run categories)
//   node tools/categories-faisables.mjs --tableau   -> mesure et affiche le tableau détaillé, n'écrit rien
//   node tools/categories-faisables.mjs --ecrire-tableau docs/audit/X.md   -> en plus, écrit le tableau en Markdown
//
// La fiche d'un circuit propose les catégories de HUB_CATEGORIES (js/trackDescriptor.js) dont la variante « change quelque chose ». Rien ne disait si l'une d'elles se FINIT. Ici, le pilote automatique (tools/lab.mjs :
// runTrack, le même que celui des contrats de circuit) roule chaque couple (circuit officiel × catégorie proposée) avec un délai BORNÉ (MAX_SIM_SECONDS secondes de simulation, déterministe : pas d'horloge),
// à plusieurs vitesses visées (PILOT_SPEEDS) ; est « finie » une course qui atteint l'arrivée à l'une d'elles avec au plus MAX_RESPAWNS_OK réapparitions. Un échec n'est PAS une preuve d'impossibilité (un pilote automatique n'est pas un humain : un bateau plafonne à 76-89 km/h sur le plat, un joueur peut avoir
// une autre trajectoire) : la fiche l'indique « Défi extrême » sans retirer la catégorie ni la rendre non sélectionnable. Les circuits de joueurs, le défi du jour et les catégories des modes ne sont pas mesurés.
//
// Le résultat est un module CLIENT (js/categoriesFaisables.js) : il n'est PAS dans la fermeture de la vérification serveur. Il porte l'empreinte `h` de chaque circuit : si un circuit change, sa mesure n'est
// plus utilisée (aucune étiquette) et tools/check-categories.mjs échoue tant que le fichier n'est pas régénéré. Un circuit AJOUTÉ est mesuré et ajouté de la même façon.
import { writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { applyVariant, variantKey, MAX_KEY } from '../js/variants.js';
import { HUB_CATEGORIES } from '../js/trackDescriptor.js';
import { hashString } from '../js/track.js';
import { runTrack } from './lab.mjs';

export const MAX_SIM_SECONDS = 240;                         // durée de simulation au-delà de laquelle une catégorie est tenue pour non finie (la course la plus longue d'un circuit officiel dure environ 100 s)
// Vitesses visées du pilote essayées, en part de celle du circuit (path.pilot.vCap, 52 m/s par défaut) : le réglage du pilote est calé pour la voiture ; un deltaplane ou une moto qui réussit à 80 % ou 65 % est finissable
// (mesuré : le deltaplane passe de 27 circuits finis à 58 quand on laisse le pilote ralentir). Une catégorie n'est « non finie » que si AUCUNE de ces vitesses ne la termine.
export const PILOT_SPEEDS = [1, 0.8, 0.65, 0.5, 0.4];
// Une arrivée obtenue à force de réapparitions n'est pas une preuve de faisabilité : au-delà de ce nombre, la course ne compte pas comme finie (mesure : 69 des 71 arrivées de la catégorie « deltaplane » en ont 0 ou 1, une seule en a 5).
export const MAX_RESPAWNS_OK = 2;
export const OUT = fileURLToPath(new URL('../js/categoriesFaisables.js', import.meta.url));

// Mesure d'un circuit : { h, cats: { id catégorie : { ok, time, respawns, reason } } } pour les catégories que la fiche lui propose (mêmes conditions que hubCategories).
export function measureCircuit(def) {
  const official = buildBuiltin(def), h = hashString(official.encode()), key = `b-${def.id}-${h}`, cats = {};
  for (const c of HUB_CATEGORIES) {
    let fits = false;
    try { fits = variantKey(key, c.v).length <= MAX_KEY; if (fits) applyVariant(official, c.v); } catch { fits = false; }
    if (!fits) continue;
    const base = (official.path && official.path.pilot && official.path.pilot.vCap) || 52;
    let first = null, S = null, used = 0;
    for (const k of PILOT_SPEEDS) {
      S = runTrack(applyVariant(buildBuiltin(def), c.v), { maxTime: MAX_SIM_SECONDS, vCap: +(base * k).toFixed(1) });
      if (!first) first = S;
      if (S.ok && S.respawns <= MAX_RESPAWNS_OK) { used = k; break; }
    }
    cats[c.id] = used ? { ok: true, time: +S.time.toFixed(2), respawns: S.respawns, k: used, reason: '' } : { ok: false, time: null, respawns: first.respawns, k: 0, reason: first.reason };
  }
  return { h, cats };
}

// Mesure de tous les circuits (en parallèle, par fils d'exécution : le résultat ne dépend pas de leur nombre). Renvoie { id circuit : mesure } dans l'ordre de BUILTIN_TRACKS.
export async function measureAll({ jobs = Math.max(1, Math.min(8, availableParallelism())) } = {}) {
  const ids = BUILTIN_TRACKS.map((d) => d.id), out = {};
  if (jobs <= 1) { for (const d of BUILTIN_TRACKS) out[d.id] = measureCircuit(d); return out; }
  const shards = Array.from({ length: Math.min(jobs, ids.length) }, (_, k) => ids.filter((_, i) => i % Math.min(jobs, ids.length) === k));
  const parts = await Promise.all(shards.map((mine) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { ids: mine } });
    w.once('message', resolve); w.once('error', reject);
    w.once('exit', (code) => { if (code) reject(new Error('fil de mesure arrêté (code ' + code + ')')); });
  })));
  const all = Object.assign({}, ...parts);
  for (const id of ids) out[id] = all[id];
  return out;
}

// Le fichier de données (texte exact de js/categoriesFaisables.js) pour une mesure.
export function renderModule(measure) {
  const lines = Object.entries(measure).map(([id, m]) => {
    const ok = Object.keys(m.cats).filter((c) => m.cats[c].ok), ko = Object.keys(m.cats).filter((c) => !m.cats[c].ok);
    const arr = (a) => '[' + a.map((x) => `'${x}'`).join(', ') + ']';
    return `    ${id}: { h: '${m.h}', ok: ${arr(ok)}, ko: ${arr(ko)} },`;
  });
  return `// Catégories de record que le pilote automatique FINIT, par circuit officiel (GAME-006) : données GÉNÉRÉES par tools/categories-faisables.mjs (npm run categories), à ne pas modifier à la main.
// Pour chaque circuit : \`h\` l'empreinte de son code (si le circuit change, la mesure n'est plus utilisée), \`ok\` les catégories finies, \`ko\` celles que le pilote n'a finies à aucune de ses vitesses (${PILOT_SPEEDS.map((k) => Math.round(k * 100) + ' %').join(', ')} de celle du circuit)
// en ${MAX_SIM_SECONDS} s de simulation et ${MAX_RESPAWNS_OK} réapparitions au plus (la fiche du circuit les marque « Défi extrême » sans les retirer : un pilote automatique n'est pas un humain). Les catégories absentes des deux listes ne sont pas proposées sur ce circuit.
// Module client : hors de la fermeture de la vérification serveur. Vérifié à jour par tools/check-categories.mjs (npm test).
export const CATEGORY_FINISH = {
  maxSimSeconds: ${MAX_SIM_SECONDS},
  circuits: {
${lines.join('\n')}
  },
};
`;
}

// Tableau lisible : une ligne par circuit, une colonne par catégorie : temps du pilote (« @65 » : à 65 % de sa vitesse habituelle, « r2 » : 2 réapparitions), ou ✕ (non fini, réapparitions de la course à pleine vitesse), – (non proposée) ; puis les totaux.
export function renderTable(measure, { markdown = false } = {}) {
  const ids = HUB_CATEGORIES.map((c) => c.id);
  const cell = (m, c) => { const r = m.cats[c]; return !r ? '–' : r.ok ? r.time.toFixed(1) + (r.k < 1 ? ` @${Math.round(r.k * 100)}` : '') + (r.respawns ? ` r${r.respawns}` : '') : `✕ r${r.respawns}`; };
  const rows = Object.entries(measure).map(([id, m]) => [id, ...ids.map((c) => cell(m, c))]);
  const total = ids.map((c) => { const v = Object.values(measure).filter((m) => m.cats[c]); return `${v.filter((m) => m.cats[c].ok).length}/${v.length}`; });
  const head = ['circuit', ...ids];
  if (markdown) return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`), `| **finies / proposées** | ${total.map((t) => `**${t}**`).join(' | ')} |`].join('\n');
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length), i ? total[i - 1].length : 0));
  const line = (r) => r.map((x, i) => String(x).padEnd(w[i])).join('  ');
  return [line(head), ...rows.map(line), line(['finies/proposées', ...total])].join('\n');
}

// ---- fil de mesure ------------------------------------------------------------------------------------------------------------------
if (!isMainThread && workerData && workerData.ids) {
  const by = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, d])), res = {};
  for (const id of workerData.ids) res[id] = measureCircuit(by[id]);
  parentPort.postMessage(res);
} else if (process.argv[1] && process.argv[1].endsWith('categories-faisables.mjs')) {
  const t0 = Date.now(), measure = await measureAll();
  const argv = process.argv.slice(2);
  if (argv.includes('--tableau') || argv.includes('--ecrire-tableau')) {
    console.log(renderTable(measure));
    const i = argv.indexOf('--ecrire-tableau');
    if (i >= 0) { writeFileSync(argv[i + 1], `# Catégories de record finissables par le pilote automatique (GAME-006)

Généré par \`node tools/categories-faisables.mjs --ecrire-tableau docs/audit/CATEGORIES-FAISABLES.md\` (mesure du jour ; la version vérifiée par \`npm test\` est \`js/categoriesFaisables.js\`). Pour chaque circuit officiel et chaque catégorie de la fiche : le temps du pilote automatique (« @65 » : à 65 % de sa vitesse habituelle ; « r1 » : une réapparition), « ✕ » : non finie à aucune des vitesses essayées (${PILOT_SPEEDS.map((k) => Math.round(k * 100) + ' %').join(', ')}) en ${MAX_SIM_SECONDS} s de simulation et ${MAX_RESPAWNS_OK} réapparitions au plus (« r » : réapparitions de la course à pleine vitesse), « – » : catégorie non proposée sur ce circuit (elle ne change rien). **Un échec n'est pas une preuve d'impossibilité** : un pilote automatique n'est pas un humain ; la fiche du circuit marque ces catégories « Défi extrême » sans les retirer.

` + renderTable(measure, { markdown: true }) + '\n'); console.log('\ntableau écrit :', argv[i + 1]); }
  }
  if (!argv.includes('--tableau')) {
    writeFileSync(OUT, renderModule(measure));
    const ko = Object.values(measure).reduce((n, m) => n + Object.values(m.cats).filter((c) => !c.ok).length, 0), all = Object.values(measure).reduce((n, m) => n + Object.keys(m.cats).length, 0);
    console.log(`js/categoriesFaisables.js écrit : ${Object.keys(measure).length} circuits, ${all} couples (circuit × catégorie), ${all - ko} finis, ${ko} non finis (${((Date.now() - t0) / 1000).toFixed(0)} s).`);
  }
}
