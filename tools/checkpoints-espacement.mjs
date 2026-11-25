// Espacement des checkpoints (GAME-007, TRANS-14) :
//   node tools/checkpoints-espacement.mjs                 -> par circuit officiel : points de retour, écart maximal et médian (course du pilote automatique), et la règle
//   node tools/checkpoints-espacement.mjs --rapport FICHIER.md   -> en plus : les huit pires circuits, où un checkpoint aiderait et ce que cela coûterait (rien n'est modifié)
//
// Une chute ramène au dernier POINT DE RETOUR : le départ, un checkpoint, ou le passage de la ligne d'un tour (js/raceLogic.js). L'écart entre deux points de retour consécutifs (le dernier : l'arrivée) est le temps
// qu'une erreur peut faire perdre. Mesure (sur la course du pilote automatique, comme tout le contrat des circuits) : le temps d'arrivée de chaque point de retour. Médiane des 72 circuits (écart maximal de chacun) : 28,6 s.
//
// RÈGLE (tools/contract.mjs : checkDef) : au plus MAX_GAP secondes entre deux points de retour. Les circuits d'aujourd'hui qui la dépassent sont dans tools/checkpoints-exceptions.json (figé : id → écart
// maximal mesuré au gel) ; ils passent, mais l'écart d'un circuit de la liste ne peut pas grandir, un circuit qui respecte la règle n'y figure pas, et un NOUVEAU circuit qui la dépasse échoue.
// On ne modifie pas un circuit officiel pour la respecter (changer son code change sa clé : docs/ARCHITECTURE.md, « Circuits officiels ») ; ce rapport dit seulement ce que coûterait un correctif.
import { readFileSync, writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { RaceLogic } from '../js/raceLogic.js';
import { runTrack } from './lab.mjs';
import { computeFingerprint } from './fingerprint-core.mjs';

export const MAX_GAP = 30;
export const EXCEPTIONS_FILE = new URL('./checkpoints-exceptions.json', import.meta.url);
export const TOLERANCE = 0.05;            // s : un circuit de la liste ne grandit pas de plus (même tolérance que les temps de référence : golden.mjs)
export const loadExceptions = () => JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8'));

const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const r2 = (x) => Math.round(x * 100) / 100;

// Écarts d'une course du pilote automatique S (runTrack). points : [{ t, kind }] (départ, checkpoints, tours, arrivée) ; gaps : leurs écarts ; max / median ; where : l'écart maximal (de quel point à quel point).
// onlyCps : les mêmes écarts sans compter les passages de ligne (la mesure de l'audit).
export function spacing(S) {
  const points = [{ t: 0, kind: 'départ' }, ...S.cps.map((t, i) => ({ t, kind: `checkpoint ${i + 1}` })), ...(S.lapTimes || []).map((t, i) => ({ t, kind: `tour ${i + 1}` })), { t: S.time, kind: 'arrivée' }].sort((a, b) => a.t - b.t);
  const gaps = points.slice(1).map((p, i) => r2(p.t - points[i].t));
  const max = Math.max(...gaps), at = gaps.indexOf(max);
  const cp = [0, ...S.cps, S.time].sort((a, b) => a - b), cpGaps = cp.slice(1).map((t, i) => r2(t - cp[i]));
  return { points, gaps, max, median: r2(median(gaps)), where: { from: points[at].kind, to: points[at + 1].kind, t0: points[at].t, t1: points[at + 1].t }, maxCpOnly: Math.max(...cpGaps) };
}

// Défauts de la règle pour le circuit `id` dont la course du pilote est S : [] si elle est respectée, ou si le circuit est une exception figée et n'a pas grandi.
export function spacingFails(id, S, exceptions = loadExceptions()) {
  const sp = spacing(S), frozen = Object.hasOwn(exceptions, id) ? exceptions[id] : null;
  const where = `entre ${sp.where.from} (${sp.where.t0.toFixed(1)} s) et ${sp.where.to} (${sp.where.t1.toFixed(1)} s)`;
  if (frozen == null) return sp.max > MAX_GAP ? [`espacement : ${sp.max.toFixed(1)} s sans point de retour ${where} (${MAX_GAP} s au plus) : ajouter un checkpoint, ou raccourcir ce tronçon`] : [];
  const f = [];
  if (sp.max > frozen + TOLERANCE) f.push(`espacement : ${sp.max.toFixed(1)} s ${where}, plus que les ${frozen.toFixed(1)} s figés dans tools/checkpoints-exceptions.json (un circuit de la liste ne grandit pas)`);
  if (sp.max <= MAX_GAP) f.push(`espacement : ${sp.max.toFixed(1)} s, la règle (${MAX_GAP} s) est respectée : retirer « ${id} » de tools/checkpoints-exceptions.json`);
  return f;
}

// Course du pilote automatique d'un circuit officiel, et son espacement.
export function measureSpacing(def) {
  const track = buildBuiltin(def), S = runTrack(track), sp = spacing(S);
  return { id: def.id, ok: S.ok, time: S.time, respawns: S.respawns, checkpoints: new RaceLogic(track).cps.length, laps: def.laps || 1, ...sp };
}
export const measureAllSpacing = () => BUILTIN_TRACKS.map(measureSpacing);

// ---- Et si on ajoutait un checkpoint ? (analyse seulement : rien n'est écrit dans js/tracks.js) ---------------------------------------------------------------
// Pour un circuit : chaque jeton « S » (une droite) du script est remplacé, à tour de rôle, par un checkpoint « C » ; on garde ce qui ramène l'écart maximal le plus bas (puis celui dont le temps du pilote bouge le moins).
// Une candidate doit aussi laisser le pilote finir sans réapparition et permettre de repartir À L'ARRÊT du nouveau checkpoint (la même exigence que le contrat).
const tokensOf = (script) => script.trim().split(/\s+/);
export function whatIf(def, S0 = null) {
  const base = S0 || runTrack(buildBuiltin(def)), sp0 = spacing(base), toks = tokensOf(def.script), style = (toks.find((t) => /^C(\*\d)?$/.test(t)) || 'C');
  const tried = [];
  toks.forEach((t, i) => {
    if (t !== 'S') return;
    const script = toks.map((x, k) => (k === i ? style : x)).join(' ');
    let d2;
    try { d2 = { ...def, script }; const S = runTrack(buildBuiltin(d2)); if (!S.ok || S.respawns) return;
      const n = new RaceLogic(buildBuiltin(d2)).cps.length, back = runTrack(buildBuiltin(d2), { rewindAtCp: n });
      const sp = spacing(S);
      tried.push({ index: i, token: t, as: style, max: sp.max, time: S.time, restart: back.ok && !back.respawns, gaps: sp.gaps, key: `b-${def.id}-${hashString(buildBuiltin(d2).encode())}`, script });
    } catch { /* candidate impossible (construction refusée) : ignorée */ }
  });
  const good = tried.filter((c) => c.restart).sort((a, b) => a.max - b.max || Math.abs(a.time - base.time) - Math.abs(b.time - base.time));
  return { before: sp0, time0: base.time, tried: tried.length, best: good[0] || null, fixes: good.filter((c) => c.max <= MAX_GAP).length };
}

// ---- ligne de commande ---------------------------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('checkpoints-espacement.mjs')) {
  const rows = measureAllSpacing(), ex = loadExceptions();
  const pad = (x, n) => String(x).padEnd(n);
  console.log(`${pad('circuit', 14)} ${pad('tours', 5)} ${pad('cps', 3)} ${pad('temps', 6)} ${pad('max', 6)} ${pad('médiane', 7)} ${pad('max (cp seuls)', 14)} écart maximal entre…`);
  for (const r of rows) console.log(`${pad(r.id, 14)} ${pad(r.laps, 5)} ${pad(r.checkpoints, 3)} ${pad(r.time.toFixed(1), 6)} ${pad(r.max.toFixed(1), 6)} ${pad(r.median.toFixed(1), 7)} ${pad(r.maxCpOnly.toFixed(1), 14)} ${r.where.from} → ${r.where.to}${r.max > MAX_GAP ? (Object.hasOwn(ex, r.id) ? '   [exception figée]' : '   ✕ HORS RÈGLE') : ''}`);
  const maxes = rows.map((r) => r.max);
  console.log(`\n${rows.length} circuits : médiane des écarts maximaux ${median(maxes).toFixed(1)} s ; ${rows.filter((r) => r.max > MAX_GAP).length} au-dessus de ${MAX_GAP} s ; mesure de l'audit (checkpoints seuls) : médiane ${median(rows.map((r) => r.maxCpOnly)).toFixed(1)} s, ${rows.filter((r) => r.maxCpOnly > MAX_GAP).length} au-dessus.`);
  const bad = rows.filter((r) => spacingFails(r.id, { cps: r.points.filter((p) => /^checkpoint/.test(p.kind)).map((p) => p.t), lapTimes: r.points.filter((p) => /^tour/.test(p.kind)).map((p) => p.t), time: r.time }, ex).length);
  if (bad.length) { console.log('Hors règle ou exception périmée : ' + bad.map((r) => r.id).join(', ')); process.exitCode = 1; }
  const i = process.argv.indexOf('--rapport');
  if (i >= 0 && process.argv[i + 1]) {
    const worst = rows.slice().sort((a, b) => b.max - a.max).slice(0, 8), by = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, d]));
    const out = [];
    for (const w of worst) { const f = whatIf(by[w.id]); f.key0 = `b-${w.id}-${hashString(buildBuiltin(by[w.id]).encode())}`; out.push({ w, f, def: by[w.id], fp: f.best ? fingerprintChanges(by[w.id], f.best.script) : null }); }
    writeFileSync(process.argv[i + 1], renderReport(rows, out));
    console.log('rapport écrit :', process.argv[i + 1]);
  }
}

// Les scénarios de l'empreinte de physique (tools/phys-fingerprint.json) qui changeraient si le script de `def` devenait `script` (calcul en mémoire : la définition est remise telle qu'elle était).
export function fingerprintChanges(def, script) {
  const ref = JSON.parse(readFileSync(new URL('./phys-fingerprint.json', import.meta.url), 'utf8')), saved = def.script;
  try { def.script = script; const now = computeFingerprint(); return Object.keys(now.scenarios).filter((k) => now.scenarios[k] !== ref.scenarios[k]); } finally { def.script = saved; }
}

// Rapport Markdown des huit pires circuits.
export function renderReport(rows, analysed) {
  const f1 = (x) => x.toFixed(1), maxes = rows.map((r) => r.max);
  const L = [];
  L.push('# Espacement des checkpoints : rapport (GAME-007)', '',
    `Généré par \`node tools/checkpoints-espacement.mjs --rapport\` (environ une minute et demie). **Aucun circuit officiel n'est modifié** : l'analyse « et si » remplace un jeton \`S\` du script par un checkpoint dans une COPIE du circuit, en mémoire, et mesure ; on ne l'applique pas (décision D-5 : on ne modifie pas un circuit officiel ici).`, '',
    `**Mesure** : course du pilote automatique de chaque circuit ; points de retour = départ, checkpoints, passages de ligne d'un tour ; écart = temps entre deux points de retour consécutifs (le dernier : l'arrivée). **Règle pour les nouveaux circuits : ${MAX_GAP} s au plus** (\`tools/contract.mjs\`, exceptions figées dans \`tools/checkpoints-exceptions.json\`).`, '',
    `**Résultat** : ${rows.length} circuits, médiane des écarts maximaux **${f1(median(maxes))} s** ; **${rows.filter((r) => r.max > MAX_GAP).length}** dépassent ${MAX_GAP} s (exceptions figées). À checkpoints seuls (la mesure de l'audit) : médiane ${f1(median(rows.map((r) => r.maxCpOnly)))} s, ${rows.filter((r) => r.maxCpOnly > MAX_GAP).length} au-dessus ; la différence vient des deux circuits à deux tours, dont la ligne est aussi un point de retour.`, '',
    '## Les huit pires circuits', '',
    '| circuit | écart max | entre… | checkpoints | temps pilote | candidate : jeton remplacé | écart max après |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...analysed.map(({ w, f }) => `| ${w.id} | ${f1(w.max)} s | ${w.where.from} (${f1(w.where.t0)} s) → ${w.where.to} (${f1(w.where.t1)} s) | ${w.checkpoints} | ${f1(w.time)} s | ${f.best ? `n° ${f.best.index + 1} (\`S\` → \`${f.best.as}\`)` : 'aucune'} | ${f.best ? f1(f.best.max) + ' s' : '–'} |`), '',
    '## Ce que coûterait un correctif (le même pour chaque circuit)', '',
    'Ajouter un checkpoint change le code du circuit, donc **sa clé de classement `b-<id>-<empreinte>`**. Il faudrait :', '',
    '1. une entrée d\'alias ancienne clé → nouvelle clé dans `BUILTIN_KEY_ALIASES` (`js/builtinKeys.js`) : records, médaille, verrous de chapitre, dernières courses, objectif et maîtrise suivent alors **sur l\'appareil** ;',
    '2. `node tools/builtin-keys.mjs --update` (fichier doré des clés) et `node tools/compat-gen.mjs --update` (corpus de compatibilité), puis l\'annoncer au CHANGELOG ;',
    '3. `npm run build:function` et le **redéploiement de la fonction serveur** (les circuits sont dans la fermeture de `js/verify.js`) AVANT le site : sans cela le serveur refuse les temps du circuit (« Version du circuit différente ») ;',
    '4. **perdu, non migrable** : le classement mondial de l\'ancienne clé (il reste figé sur le serveur ; la nouvelle clé en commence un neuf), les saisons, duels et tournois en cours sur ce circuit (leur clé change), les fantômes importés, et les temps de saison déjà envoyés si le circuit est dans la saison de la semaine ;',
    '5. `PHYS_VER` : voir « empreinte de physique » ci-dessous, mesurée pour chaque candidate. Les temps du pilote, donc les médailles et `tools/golden-temps.json`, ne bougent pas quand le temps est « inchangé ».', '',
    '## Où un checkpoint aiderait', '',
    'Chaque droite simple (`S`) du script est essayée comme checkpoint (`C`, avec le style de portique des autres checkpoints du circuit). On garde la candidate qui ramène l\'écart maximal le plus bas parmi celles qui laissent le pilote finir sans réapparition ET permettent de repartir à l\'arrêt du checkpoint (exigence du contrat). Le numéro du jeton compte à partir de 1 (le jeton 1 est le départ). Ce sont des candidates MESURÉES AU PILOTE AUTOMATIQUE : le choix final de l\'emplacement, et l\'essai à la main, reviennent à la conception du circuit.', '');
  for (const { w, f, fp, def } of analysed) {
    L.push(`### ${w.id} : ${f1(w.max)} s sans point de retour (${w.where.from} ${f1(w.where.t0)} s → ${w.where.to} ${f1(w.where.t1)} s)`, '');
    if (!f.best) { L.push(`Aucune droite simple (\`S\`) du script ne convient (${f.tried} essayée(s)) : il faudrait redessiner le tronçon, ce qui est plus qu'un checkpoint.`, ''); continue; }
    const b = f.best, toks = tokensOf(def.script), ctx = toks.slice(Math.max(0, b.index - 3), b.index).join(' ') + ` **\`${b.as}\`** ` + toks.slice(b.index + 1, b.index + 4).join(' ');
    L.push(`- **Où** : jeton n° ${b.index + 1} du script, entre ${f1(w.where.t0)} s et ${f1(w.where.t1)} s de la course du pilote : « … ${ctx} … ». Écarts après : ${b.gaps.map(f1).join(' / ')} s (maximum **${f1(b.max)} s**${b.max <= MAX_GAP ? `, la règle de ${MAX_GAP} s est respectée` : `, encore au-dessus de ${MAX_GAP} s`}). ${f.fixes} candidate(s) sur ${f.tried} respectent la règle.`);
    L.push(`- **Temps du pilote** : ${f1(f.time0)} s → ${f1(b.time)} s (${Math.abs(b.time - f.time0) < 0.05 ? 'inchangé' : 'changé : médailles et temps de référence à recaler'}). Repartir à l'arrêt du nouveau checkpoint : ${b.restart ? 'oui' : 'non'}.`);
    L.push(`- **Nouvelle clé** : \`${f.key0}\` → \`${b.key}\`.`);
    L.push(`- **Empreinte de physique** (\`tools/phys-fingerprint.json\`) : ${fp == null ? 'non mesurée' : fp.length ? `change (${fp.join(', ')}) : \`PHYS_VER\` à incrémenter, ce qui rend injouables les replays de TOUS les circuits` : 'inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`'}.`, '');
  }
  return L.join('\n') + '\n';
}
