// Outil d'après-essais (tools/essais.mjs) : modèle commun « niveau du testeur × difficulté du circuit » sur un PETIT groupe, médailles proposées pour les
// 84 circuits, exports CSV du tableau de bord, résumé des avis, écriture dans js/tracks.js (sur un texte, jamais sur le vrai fichier).
//   node tools/test-essais.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, finish } from './harness.mjs';
import { parseCsv, bestTimes, fitPooled, fitRobust, proposePooled, humanFactors, enoughData, reach, summariseFeedback, toMarkdown, weightedQuantile, verifierCles, medailleDesordre, ESSAI_QUANTILES } from './essais.mjs';
import { buildFiche } from './fiche-essai.mjs';
import { statsParTesteur, profils, couverture, parProfil, etiquettes, parcours, PARCOURS, QUOTAS, MIN_TESTEUR, ROUTE_MIN, QUESTIONS_RESSENTI } from './essais-protocole.mjs';
import { SCALES } from '../js/feedback.js';
import { writeMedals } from './medals.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { PHYS_VER, VERSION } from '../js/version.js';

const golden = JSON.parse(readFileSync(new URL('./golden-temps.json', import.meta.url), 'utf8'));
const ids = BUILTIN_TRACKS.map((d) => d.id);

// Hasard reproductible.
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// 8 testeurs (du débutant au très bon), qui jouent la carrière dans l'ordre jusqu'à un circuit différent, 1 à 6 essais par circuit.
function simulate({ testers = 8, seed = 7 } = {}) {
  const r = rng(seed), rows = [], truth = { a: new Map(), b: new Map(), mu: Math.log(0.8) };
  for (const id of ids) truth.b.set(id, gauss(r) * 0.08);
  for (let p = 0; p < testers; p++) {
    const install = p.toString(16).padStart(16, 'a'), a = -0.2 + (0.4 * p) / (testers - 1);
    truth.a.set(install, a);
    const upTo = 12 + Math.floor(r() * 30);
    for (const id of ids.slice(0, upTo)) {
      const tries = 1 + Math.floor(r() * 6);
      for (let k = 0; k < tries; k++) rows.push({ install, track: id, outcome: 'finish', time: (golden[id] * Math.exp(truth.mu + a + truth.b.get(id) + gauss(r) * 0.05)).toFixed(3), phys_ver: String(PHYS_VER), created_at: '2026-11-25T10:00:00Z' });
      rows.push({ install, track: id, outcome: 'quit', time: '9.1', progress: '0.4', phys_ver: String(PHYS_VER) });
    }
  }
  return { rows, truth };
}

test('CSV du tableau de bord : guillemets, virgules et retours à la ligne dans un champ, BOM, fin de fichier', () => {
  const rows = parseCsv('﻿install,comment,fun\r\n"abc","Trop dur, vraiment ""dur""\nsur Temple",4\r\ndef,,2\n');
  assert.deepEqual(rows, [{ install: 'abc', comment: 'Trop dur, vraiment "dur"\nsur Temple', fun: '4' }, { install: 'def', comment: '', fun: '2' }]);
});

test('meilleurs temps : un par testeur et par circuit, physique du jeu seulement, arrivées seulement, temps impossibles et circuits de joueur écartés', () => {
  const g = { eclats: 40 };
  const rows = [
    { install: 'a', track: 'eclats', outcome: 'finish', time: '35', phys_ver: PHYS_VER }, { install: 'a', track: 'eclats', outcome: 'finish', time: '33.5', phys_ver: PHYS_VER },
    { install: 'a', track: 'eclats', outcome: 'quit', time: '20', phys_ver: PHYS_VER }, { install: 'b', track: 'eclats', outcome: 'finish', time: '12', phys_ver: PHYS_VER },
    { install: 'c', track: 'eclats', outcome: 'finish', time: '30', phys_ver: PHYS_VER - 1 }, { install: 'd', track: 'u_xyz', outcome: 'finish', time: '30', phys_ver: PHYS_VER },
    { install: 'e', track: 'eclats', outcome: 'finish', time: '31', phys_ver: PHYS_VER, created_at: '2026-01-01T00:00:00Z' },
  ];
  const { best, dropped, droppedBy } = bestTimes(rows, { golden: g, since: '2026-11-20' });
  assert.deepEqual([...best.keys()], ['a']); assert.equal(best.get('a').get('eclats'), 33.5); assert.equal(dropped, 1);
  assert.deepEqual([...droppedBy.get('eclats')], ['b'], 'le circuit et le testeur du temps écarté sont connus (raccourci à regarder)');
  assert.equal(bestTimes(rows, { golden: g, since: '2026-11-20', tooFast: 0.25 }).best.get('b').get('eclats'), 12, 'seuil réglable');
});

test('quantile pondéré : chaque testeur compte autant, quel que soit son nombre de circuits', () => {
  const s = [{ v: 0, w: 1 }, { v: 1, w: 1 }, { v: 2, w: 1 }];
  assert.equal(weightedQuantile(s, 0.5), 1); assert.equal(weightedQuantile(s, 0), 0); assert.equal(weightedQuantile(s, 1), 2);
  // dix valeurs d'un même testeur (poids 1/10 chacune) pèsent autant qu'une seule valeur d'un autre
  const t = [...Array(10)].map(() => ({ v: 0, w: 0.1 })).concat([{ v: 10, w: 1 }]);
  assert.ok(weightedQuantile(t, 0.6) > 0 && weightedQuantile(t, 0.4) === 0);
});

test('modèle commun sur 8 testeurs simulés : niveau moyen, niveaux et difficultés retrouvés', () => {
  const { rows, truth } = simulate();
  const { best } = bestTimes(rows, { golden });
  const fit = fitPooled(best, golden);
  // le meilleur temps de plusieurs essais est un peu sous la moyenne : tolérance de 5 %
  assert.ok(Math.abs(fit.mu - truth.mu) < 0.05, `niveau moyen ${Math.exp(fit.mu).toFixed(3)} (vrai 0.8)`);
  const ps = [...truth.a.keys()];
  const order = (m) => ps.slice().sort((x, y) => m.get(x) - m.get(y)).join();
  assert.equal(order(fit.a), order(truth.a), 'testeurs rangés du plus rapide au plus lent');
  const played = ids.filter((id) => fit.nT.get(id) >= 6), err = played.map((id) => Math.abs(fit.b.get(id) - truth.b.get(id)));
  assert.ok(played.length >= 8 && Math.max(...err) < 0.07, 'difficultés propres retrouvées à 7 % près sur les circuits joués par 6 testeurs ou plus');
  assert.ok(fit.sigma > 0.02 && fit.sigma < 0.08, 'bruit ±' + fit.sigma.toFixed(3));
});

test('médailles proposées : 84 circuits, croissantes, les testeurs atteignent bronze ~90 %, or ~15 %, cristal rarement ; circuits non joués extrapolés', () => {
  const { rows } = simulate();
  const { best } = bestTimes(rows, { golden });
  const fit = fitPooled(best, golden), P = proposePooled(fit, golden);
  assert.equal(P.length, BUILTIN_TRACKS.length);
  for (const p of P) assert.ok(p.medals.cristal < p.medals.or && p.medals.or < p.medals.argent && p.medals.argent < p.medals.bronze, p.id + ' ' + JSON.stringify(p.medals));
  const byId = new Map(P.map((p) => [p.id, p])), R = reach(best, (t) => byId.get(t).medals);
  const f = (k) => R[k] / R.n;
  assert.ok(f('bronze') > 0.8 && f('bronze') < 0.97, 'bronze ' + f('bronze'));
  assert.ok(f('argent') > 0.35 && f('argent') < 0.65, 'argent ' + f('argent'));
  assert.ok(f('or') > 0.07 && f('or') < 0.28, 'or ' + f('or'));
  assert.ok(f('cristal') < 0.1, 'cristal ' + f('cristal'));
  const F = humanFactors(fit);
  assert.ok(F.cristal < F.or && F.or < F.argent && F.argent < F.bronze && F.or > 0.6 && F.bronze < 1.2, 'facteurs du circuit du jour ' + JSON.stringify(F));
  const ex = P.filter((p) => p.extrapolated);
  assert.ok(ex.length > 0 && ex.every((p) => Math.abs(p.factor - Math.exp(fit.mu)) < 1e-9), 'un circuit non joué reçoit la difficulté moyenne');
});

test('un raccourci trouvé par un seul testeur (temps isolé bien trop rapide pour lui) est écarté avant de régler les médailles', () => {
  const { rows } = simulate();
  const { best } = bestTimes(rows, { golden });
  const p = [...best.keys()][7], t = [...best.get(p).keys()][2], honest = fitPooled(best, golden);      // le testeur le plus lent (~98 % du pilote)
  best.get(p).set(t, golden[t] * 0.62);           // au-dessus du seuil absolu, mais ~35 % plus vite que ce testeur ailleurs
  const naive = fitPooled(best, golden), robust = fitRobust(best, golden);
  assert.deepEqual(robust.outliers.map((o) => [o.p, o.t]), [[p, t]], JSON.stringify(robust.outliers));
  assert.ok(Math.abs(robust.b.get(t) - honest.b.get(t)) < Math.abs(naive.b.get(t) - honest.b.get(t)) / 3, 'la difficulté du circuit revient près de la vraie');
  assert.equal(fitRobust(bestTimes(simulate().rows, { golden }).best, golden).outliers.length, 0, 'sans raccourci : rien n’est écarté');
});

test('trop peu de données : refusé pour l’écriture (5 testeurs avec 3 circuits et 40 temps au minimum)', () => {
  assert.equal(enoughData(bestTimes(simulate({ testers: 3 }).rows, { golden }).best).ok, false);
  assert.equal(enoughData(bestTimes(simulate().rows, { golden }).best).ok, true);
});

test('avis : un par installation (le dernier), moyennes par groupe, signaux d’équilibrage, textes', () => {
  const base = { version: VERSION, device: 'ordinateur', controls: 'clavier', fun: '4', camera: '4', drift: '-1', walls: '0', air: '0', difficulty: '-1', tracks_note: '', comment: '' };
  const rows = [
    { ...base, install: 'a', experience: 'debutant', drift: '2', created_at: '2026-11-20' }, { ...base, install: 'a', experience: 'debutant', drift: '-2', created_at: '2026-11-21', comment: 'Le dérapage, dur' },
    { ...base, install: 'b', experience: 'habitue', device: 'telephone', controls: 'tactile', created_at: '2026-11-21' },
    { ...base, install: 'c', experience: 'habitue', created_at: '2026-11-22', tracks_note: 'Temple bloquant', pseudo: 'Bea' },
  ];
  const S = summariseFeedback(rows);
  assert.equal(S.n, 3); assert.equal(S.sent, 4);
  const drift = S.scales.find((s) => s.key === 'drift');
  assert.equal(drift.groups.tous.mean, -4 / 3); assert.equal(drift.groups.debutant.mean, -2); assert.equal(drift.signal, 'Trop dur à tenir');
  assert.equal(S.scales.find((s) => s.key === 'walls').signal, null);
  assert.equal(S.counts.device.telephone, 1); assert.equal(S.texts.length, 2); assert.equal(S.experienceOf.get('a'), 'debutant');
});

test('écriture dans js/tracks.js (sur un texte) : médailles remplacées, medalsBy une seule fois, objectif « moins de » entre or et argent', () => {
  const src = "  {\n    id: 'eclats', name: 'X',\n    goal: { id: 'under', t: 50.5 },\n    medals: { cristal: 45.8, or: 48.2, argent: 55.4, bronze: 65 },\n  },\n  {\n    id: 'canyon', name: 'Y',\n    medals: { cristal: 1, or: 2, argent: 3, bronze: 4 },\n  },\n";
  const m = { cristal: 33, or: 36.1, argent: 40.2, bronze: 47 };
  let out = writeMedals(src, { id: 'eclats', goal: { id: 'under', t: 50.5 } }, m);
  out = writeMedals(out, { id: 'eclats', goal: { id: 'under', t: 38 } }, m);
  assert.match(out, /medals: \{ cristal: 33, or: 36\.1, argent: 40\.2, bronze: 47 \},\n {4}medalsBy: 'humain',\n {2}\},\n/);
  assert.equal((out.match(/medalsBy/g) || []).length, 1);
  assert.match(out, /goal: \{ id: 'under', t: 38 \}/);
  assert.match(out, /id: 'canyon', name: 'Y',\n {4}medals: \{ cristal: 1, or: 2, argent: 3, bronze: 4 \},\n {2}\},/, 'le circuit suivant ne bouge pas');
  assert.throws(() => writeMedals(src, { id: 'inconnu' }, m), /introuvable/);
});

test('les vrais circuits sont tous réinscriptibles (structure de js/tracks.js reconnue)', () => {
  let src = readFileSync(new URL('../js/tracks.js', import.meta.url), 'utf8');
  const before = src.length;
  for (const d of BUILTIN_TRACKS) src = writeMedals(src, d, d.medals);
  assert.equal((src.match(/medalsBy: 'humain'/g) || []).length, BUILTIN_TRACKS.length);
  assert.ok(src.length > before);
});

// Recaler les médailles ne doit JAMAIS changer la clé d'un circuit (records, fantômes, classements en ligne y sont rangés) : la clé « b-<id>-<empreinte> » est celle du
// CODE du circuit (Track.encode), où les médailles, l'objectif bonus et medalsBy n'entrent pas. Ce test le prouve sur les 84 circuits (les 72 d'avant et les 12 de la 0.17.0), avant tout recalage.
const keyOf = (d) => `b-${d.id}-${hashString(buildBuiltin(d).encode())}`;
const corpus = JSON.parse(readFileSync(new URL('./compat/corpus.json', import.meta.url), 'utf8'));
test('les médailles ne font pas partie de la clé : 84 clés b- identiques à celles du corpus, quelles que soient les médailles, l’objectif et medalsBy', () => {
  assert.equal(BUILTIN_TRACKS.length, 84);
  for (const d of BUILTIN_TRACKS) {
    const f = (k) => Math.round(d.medals[k] * 1.37 * 10) / 10 + 3;
    const other = { ...d, medals: { cristal: f('cristal'), or: f('or'), argent: f('argent'), bronze: f('bronze') }, medalsBy: 'humain', ...(d.goal && d.goal.id === 'under' ? { goal: { ...d.goal, t: d.goal.t + 7 } } : {}) };
    assert.notDeepEqual(other.medals, d.medals);
    assert.equal(keyOf(other), keyOf(d), d.id + ' : la clé suit les médailles');
    assert.equal(keyOf(d), corpus.builtinKeys[d.id], d.id + ' : clé différente de celle d’avant');
  }
});

test('seuils de médailles actuels : pour chacun des 84 circuits, cristal ≤ or ≤ argent ≤ bronze, tous positifs', () => {
  for (const d of BUILTIN_TRACKS) { const m = d.medals; assert.ok(m.cristal > 0 && m.cristal <= m.or && m.or <= m.argent && m.argent <= m.bronze, d.id + ' ' + JSON.stringify(m)); }
});

test('rapport et ligne de commande : rapport écrit, --ecrire refuse avec trop peu de testeurs', () => {
  const { rows } = simulate();
  const { best, dropped } = bestTimes(rows, { golden }), fit = fitPooled(best, golden);
  const md = toMarkdown({ fit, proposals: proposePooled(fit, golden), best, dropped, data: enoughData(best), fb: summariseFeedback([]), pv: PHYS_VER });
  for (const h of ['## Temps', '### Testeurs', '### Circuits', '## Avis', 'extrapolé', 'Circuit du jour']) assert.ok(md.includes(h), h);
  assert.match(md, new RegExp(`bronze ${Math.round(ESSAI_QUANTILES.bronze * 100)} %`));
  const none = bestTimes([{ install: 'a', track: 'daily', outcome: 'finish', time: '40', phys_ver: PHYS_VER }], { golden });
  assert.match(toMarkdown({ fit: fitPooled(none.best, golden), proposals: [], best: none.best, dropped: 0, data: enoughData(none.best), fb: null, pv: PHYS_VER }), /Aucun meilleur temps sur un circuit de la carrière/);
  const dir = mkdtempSync(join(tmpdir(), 'essais-'));
  const csv = (list) => ['install,track,outcome,time,phys_ver', ...list.map((r) => [r.install, r.track, r.outcome, r.time, r.phys_ver].join(','))].join('\n');
  writeFileSync(join(dir, 'runs.csv'), csv(simulate({ testers: 3 }).rows));
  const run = spawnSync(process.execPath, [new URL('./essais.mjs', import.meta.url).pathname, '--temps', join(dir, 'runs.csv'), '--md', join(dir, 'r.md'), '--ecrire'], { encoding: 'utf8' });
  assert.equal(run.status, 1); assert.match(run.stdout, /Trop peu de données/);
  assert.match(readFileSync(join(dir, 'r.md'), 'utf8'), /# Rapport des essais humains/);
});


// ---- Le protocole (docs/ESSAIS.md, tools/essais-protocole.mjs) ------------------------------------------------------------------------------------------------
// Avis simulés : huit testeurs de profils variés (3 débutants, 5 habitués ; 4 claviers, 3 tactiles, 1 manette), reliés aux courses par l'identifiant d'installation.
const PROFILS_SIM = [['debutant', 'clavier', 'ordinateur'], ['debutant', 'tactile', 'telephone'], ['debutant', 'clavier', 'ordinateur'], ['habitue', 'clavier', 'ordinateur'], ['habitue', 'tactile', 'tablette'], ['habitue', 'manette', 'ordinateur'], ['habitue', 'clavier', 'ordinateur'], ['habitue', 'tactile', 'telephone']];
const avisSim = (n = 8) => Array.from({ length: n }, (_, p) => ({ install: p.toString(16).padStart(16, 'a'), version: VERSION, experience: PROFILS_SIM[p][0], controls: PROFILS_SIM[p][1], device: PROFILS_SIM[p][2],
  fun: '4', camera: '4', drift: '-1', walls: '0', air: '0', difficulty: '-1', tracks_note: p === 3 ? 'Temple trop dur' : '', comment: p === 5 ? 'Manette : le braquage est mou' : '', pseudo: p === 3 ? 'ZoéSecrète' : '', created_at: '2026-11-26T09:00:00Z' }));
// 8 testeurs qui ont tous fini au moins 18 circuits (le parcours imposé va jusqu'au numéro 18), 2 essais finis et 1 abandon par circuit.
function campagne(testers = 8) {
  const r = rng(11), rows = [];
  for (let p = 0; p < testers; p++) {
    const install = p.toString(16).padStart(16, 'a');
    for (const id of ids.slice(0, 18 + p)) {
      for (let k = 0; k < 2; k++) rows.push({ install, track: id, outcome: 'finish', time: (golden[id] * Math.exp(Math.log(0.8) - 0.1 + p * 0.03 + gauss(r) * 0.04)).toFixed(3), respawns: String(k), phys_ver: String(PHYS_VER), created_at: '2026-11-25T10:00:00Z' });
      rows.push({ install, track: id, outcome: 'quit', time: '9.1', progress: '0.4', respawns: '1', phys_ver: String(PHYS_VER), created_at: '2026-11-25T10:00:00Z' });
    }
  }
  return rows;
}

test('parcours imposé : 6 circuits de la carrière, de ◆1 à ◆5, les cinq profils, un circuit à gravité inversée, un à plaques, tous dans les trois premiers chapitres', async () => {
  const P = parcours();
  assert.equal(P.length, 6); assert.equal(new Set(P.map((p) => p.id)).size, 6);
  assert.deepEqual([...new Set(P.map((p) => p.difficulty))].sort(), [1, 2, 3, 4, 5], 'toutes les difficultés');
  assert.equal(new Set(P.map((p) => p.profil)).size, 5, 'les cinq profils de circuit du parcours (hors Atelier)');
  assert.equal(P[0].index, 0, 'le premier circuit de la carrière');
  assert.ok(P.every((p) => p.chapter <= 3), 'atteignable après deux chapitres');
  const { buildBuiltin: build } = await import('../js/tracks.js'), { ribbonInverts } = await import('../js/ribbons.js'), { PIECES } = await import('../js/pieces.js');
  const tiles = (id) => build(BUILTIN_TRACKS.find((d) => d.id === id)).tiles;
  assert.ok(P.some((p) => tiles(p.id).some((t) => ribbonInverts(t))), 'un circuit dont la route suit la gravité retournée');
  assert.ok(P.some((p) => tiles(p.id).some((t) => /^Plaque/.test((PIECES[t.t] || {}).label || ''))), 'un circuit à plaques');
  assert.match(PARCOURS.find((p) => /gravité/.test(p.role)).id, /^racines$/); assert.ok(tiles('racines').some((t) => ribbonInverts(t)), 'racines : gravité');
  assert.ok(tiles('tremplins').some((t) => /^Plaque/.test((PIECES[t.t] || {}).label || '')), 'tremplins : plaques');
});

test('protocole rempli : 8 testeurs de profils variés, courses reliées aux avis, parcours essayé par assez de monde ; chaque exigence manquée est nommée', () => {
  const rows = campagne(), prof = profils(avisSim()), stats = statsParTesteur(rows, { golden, pv: PHYS_VER });
  const c = couverture(stats, prof);
  assert.equal(c.testers.length, 8); assert.equal(c.unlinked, 0);
  assert.ok(c.ok, JSON.stringify(c.quotas.filter((q) => !q.ok)) + JSON.stringify(c.route.filter((r) => !r.ok)));
  const q = Object.fromEntries(c.quotas.map((x) => [x.label.replace(/^testeurs.*/, 'total'), x.have]));
  assert.equal(q.total, 8); assert.equal(q['expérience : debutant'], 3); assert.equal(q['commandes : tactile'], 3); assert.equal(q['commandes : manette'], 1);
  assert.deepEqual(c.route.map((r) => r.id), PARCOURS.map((p) => p.id)); assert.ok(c.route.every((r) => r.finished === 8));
  // trop peu : 7 testeurs, ou aucun avis (profil inconnu), ou un testeur qui n'a pas fini 12 circuits
  assert.equal(couverture(statsParTesteur(campagne(7), { golden, pv: PHYS_VER }), prof).ok, false);
  const sans = couverture(stats, profils([]));
  assert.equal(sans.ok, false); assert.equal(sans.unlinked, 8);
  const court = campagne().filter((r) => !(r.install === 'aaaaaaaaaaaaaaa0' && ids.indexOf(r.track) >= 10));
  const c2 = couverture(statsParTesteur(court, { golden, pv: PHYS_VER }), prof);
  assert.equal(c2.testers.find((t) => t.id === 'aaaaaaaaaaaaaaa0').qualified, false); assert.equal(c2.ok, false);
  assert.ok(c2.quotas.some((x) => !x.ok && /expérience : debutant/.test(x.label)));
  assert.equal(MIN_TESTEUR.circuits, 12); assert.equal(QUOTAS.testeurs, 8); assert.equal(ROUTE_MIN, 6);
});

test('une autre physique, une autre date et les temps impossibles ne comptent pas comme des courses de testeur', () => {
  const g = { eclats: 40 }, row = (o) => ({ install: 'a', track: 'eclats', outcome: 'finish', time: '35', phys_ver: String(PHYS_VER), created_at: '2026-11-25T00:00:00Z', ...o });
  const s = statsParTesteur([row({}), row({ phys_ver: String(PHYS_VER - 1) }), row({ created_at: '2026-01-01T00:00:00Z' }), row({ time: '12' }), row({ outcome: 'quit', time: '9' }), row({ track: 'daily' })], { golden: g, pv: PHYS_VER, since: '2026-11-20' }).get('a');
  assert.equal(s.courses, 2); assert.equal(s.finishes, 1); assert.equal(s.quits, 1);
});

test('par profil : nombre de testeurs, circuits finis sur essayés, réapparitions par arrivée, niveau par groupe', () => {
  const rows = campagne(), stats = statsParTesteur(rows, { golden, pv: PHYS_VER }), prof = profils(avisSim());
  const fit = fitPooled(bestTimes(rows, { golden }).best, golden), P = parProfil(stats, prof, fit);
  assert.equal(P.experience.debutant.testers, 3); assert.equal(P.experience.habitue.testers, 5);
  assert.equal(P.controls.manette.testers, 1); assert.equal(P.controls.tactile.testers, 3); assert.equal(P.device.telephone.testers, 2);
  assert.equal(P.experience.debutant.completion, 1, 'tous les circuits essayés sont finis dans cette campagne');
  assert.equal(P.experience.habitue.respawnsPerFinish, 0.5, 'une arrivée sans réapparition, une avec : 0,5 en moyenne');
  assert.ok(P.experience.debutant.level > 0.6 && P.experience.debutant.level < 1.1);
  assert.ok(P.experience.habitue.level > P.experience.debutant.level - 0.2, 'niveau en pourcentage du pilote');
});

test('rapport des essais : testeurs T01…, aucun identifiant ni pseudo sans --pseudos, protocole et profils présents, avis par commandes', () => {
  const rows = campagne(), avis = avisSim(), { best, dropped } = bestTimes(rows, { golden }), fit = fitRobust(best, golden);
  const stats = statsParTesteur(rows, { golden, pv: PHYS_VER }), prof = profils(avis), labels = etiquettes([...stats.keys()]);
  const mk = (pseudos) => toMarkdown({ fit, proposals: proposePooled(fit, golden), best, dropped, data: enoughData(best), fb: summariseFeedback(avis), pv: PHYS_VER, couv: couverture(stats, prof), profil: parProfil(stats, prof, fit), labels, pseudos });
  const md = mk(false);
  for (const h of ['## Le protocole est-il rempli ?', '## Par profil', 'Verdict : **oui', '| T01 |', '| T08 |', 'Atteint (actuelles)', '| Clavier | Manette | Tactile |', 'Temple trop dur', 'Manette : le braquage est mou', 'controls'.replace('controls', 'tactile')]) assert.ok(md.includes(h), h);
  assert.ok(!md.includes('aaaaaa'), 'aucun identifiant d’installation (même tronqué à 6 caractères)');
  assert.ok(!md.includes('ZoéSecrète'), 'pseudo jamais écrit par défaut'); assert.ok(mk(true).includes('ZoéSecrète'), 'seulement avec --pseudos');
  assert.match(md, /dérapage|Dérapage/); assert.match(md, /Verdict : \*\*oui/);
  const manque = toMarkdown({ fit, proposals: proposePooled(fit, golden), best, dropped, data: enoughData(best), fb: null, pv: PHYS_VER, couv: couverture(statsParTesteur(campagne(7), { golden, pv: PHYS_VER }), prof), labels });
  assert.match(manque, /Verdict : \*\*non/); assert.match(manque, /manque 1/);
});

test('avis : groupes par commandes (clavier, manette, tactile) et filtre de date', () => {
  const S = summariseFeedback([...avisSim(), { ...avisSim()[0], install: 'b'.repeat(16), created_at: '2026-01-01T00:00:00Z' }], { since: '2026-11-20' });
  assert.equal(S.n, 8);
  const d = S.scales.find((x) => x.key === 'drift').groups;
  assert.equal(d.clavier.n, 4); assert.equal(d.manette.n, 1); assert.equal(d.tactile.n, 3);
  assert.equal(summariseFeedback(avisSim()).n, 8);
});

test('clés des 84 circuits : vérifiables (--verifier-cles), un écart est nommé ; ordre des médailles proposées contrôlé', () => {
  assert.deepEqual(verifierCles(), { ok: true, changed: [], missing: [], n: 84 });
  const corpus = JSON.parse(readFileSync(new URL('./compat/corpus.json', import.meta.url), 'utf8')).builtinKeys;
  const bad = verifierCles(BUILTIN_TRACKS, { ...corpus, eclats: 'b-eclats-xxxx' });
  assert.equal(bad.ok, false); assert.equal(bad.changed[0].id, 'eclats');
  const run = spawnSync(process.execPath, [new URL('./essais.mjs', import.meta.url).pathname, '--verifier-cles'], { encoding: 'utf8' });
  assert.equal(run.status, 0); assert.match(run.stdout, /84 clés b-… sont inchangées/);
  assert.deepEqual(medailleDesordre([{ id: 'a', medals: { cristal: 1, or: 2, argent: 3, bronze: 4 } }, { id: 'b', medals: { cristal: 3, or: 2, argent: 3, bronze: 4 } }]), ['b']);
  const fit = fitPooled(bestTimes(simulate().rows, { golden }).best, golden);
  assert.deepEqual(medailleDesordre(proposePooled(fit, golden)), [], 'les médailles proposées par le modèle sont toujours ordonnées');
});

test('--ecrire ne touche pas à js/tracks.js sans avis (profils inconnus) ni protocole rempli, même avec assez de temps ; --forcer reste nécessaire', () => {
  const before = readFileSync(new URL('../js/tracks.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'essais-'));
  const csv = (list) => ['install,track,outcome,time,respawns,phys_ver', ...list.map((r) => [r.install, r.track, r.outcome, r.time, r.respawns || 0, r.phys_ver].join(','))].join('\n');
  writeFileSync(join(dir, 'runs.csv'), csv(campagne()));
  const cli = (...a) => spawnSync(process.execPath, [new URL('./essais.mjs', import.meta.url).pathname, ...a], { encoding: 'utf8' });
  const sansAvis = cli('--temps', join(dir, 'runs.csv'), '--ecrire');
  assert.equal(sansAvis.status, 1); assert.match(sansAvis.stdout, /protocole ne peut pas être vérifié/);
  const fbCsv = ['install,version,experience,controls,device,fun,camera,drift,walls,air,difficulty,tracks_note,comment,pseudo,created_at', ...avisSim(3).map((r) => [r.install, `"${r.version}"`, r.experience, r.controls, r.device, r.fun, r.camera, r.drift, r.walls, r.air, r.difficulty, '', '', '', r.created_at].join(','))].join('\n');
  writeFileSync(join(dir, 'fb.csv'), fbCsv);
  const incomplet = cli('--temps', join(dir, 'runs.csv'), '--avis', join(dir, 'fb.csv'), '--md', join(dir, 'r.md'), '--ecrire');
  assert.equal(incomplet.status, 1); assert.match(incomplet.stdout, /protocole n'est pas rempli/);
  assert.match(readFileSync(join(dir, 'r.md'), 'utf8'), /Verdict : \*\*non/);
  assert.equal(readFileSync(new URL('../js/tracks.js', import.meta.url), 'utf8'), before, 'js/tracks.js intact');
});


// ---- Le document, la fiche générée et le code disent la même chose ---------------------------------------------------------------------------------------------
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('docs/FICHE-ESSAI.md et docs/temps-humains.json sont la sortie de tools/fiche-essai.mjs (sinon : node tools/fiche-essai.mjs), avec le parcours, les questions et les 84 circuits', () => {
  const { fiche, temps, n } = buildFiche();
  assert.equal(n, 84);
  assert.equal(read('docs/FICHE-ESSAI.md'), fiche, 'FICHE-ESSAI.md n’est pas à jour : node tools/fiche-essai.mjs (ne pas la modifier à la main)');
  assert.equal(read('docs/temps-humains.json'), temps, 'temps-humains.json n’est pas à jour : node tools/fiche-essai.mjs');
  for (const p of parcours()) assert.ok(fiche.includes(`**${p.name}** (n° ${p.index + 1}`) && fiche.includes('· **parcours imposé**'), p.id);
  for (const s of SCALES) assert.ok(fiche.includes(`| ${s.label} |`), 'question du formulaire : ' + s.label);
  for (const q of QUESTIONS_RESSENTI) assert.ok(fiche.includes(`| ${q.label} |`), 'question de la fiche : ' + q.key);
  assert.equal((fiche.match(/^### \d+\. /gm) || []).length, 84); assert.equal((fiche.match(/^## Chapitre /gm) || []).length, 14);
  assert.ok(!/[0-9a-f]{16}/.test(fiche.replace(/[0-9a-f]{16,}(?=\.mjs)/g, '')), 'aucun identifiant d’installation dans la fiche');
  assert.match(fiche, new RegExp(`Physique : \\*\\*${PHYS_VER}\\*\\*`));
});

test('docs/ESSAIS.md : mêmes nombres que le code (testeurs, profils, courses, parcours), options de l’outil et requêtes qui existent, consentement et vie privée', () => {
  const md = read('docs/ESSAIS.md'), sql6 = read('supabase/etape6-telemetrie.sql'), sql19 = read('supabase/etape19-avis.sql'), tool = read('tools/essais.mjs');
  const row = (label, n) => assert.ok(new RegExp('\\| ' + label + '[^|]*\\| ' + n + ' \\|').test(md), `tableau des profils : « ${label} » doit valoir ${n}`);
  row('Testeurs qui comptent', QUOTAS.testeurs); row('Joueurs qui jouent \\*\\*rarement\\*\\*', QUOTAS.experience.debutant); row('Joueurs qui jouent \\*\\*souvent\\*\\*', QUOTAS.experience.habitue);
  row('Commandes : \\*\\*clavier\\*\\*', QUOTAS.controls.clavier); row('Commandes : \\*\\*écran tactile\\*\\*[^|]*', QUOTAS.controls.tactile); row('Commandes : \\*\\*manette\\*\\*', QUOTAS.controls.manette);
  assert.ok(md.includes(`**fini ${MIN_TESTEUR.circuits} circuits différents**`) && md.includes(`**${MIN_TESTEUR.courses} courses au moins**`), 'minimum de circuits et de courses par testeur');
  assert.ok(md.includes(`essayés par ${ROUTE_MIN} testeurs qui comptent au moins`), 'minimum de testeurs par circuit du parcours');
  for (const p of parcours()) assert.ok(md.includes(`| ${p.name} (n° ${p.index + 1}, ◆${p.difficulty})`), 'parcours : ' + p.id);
  assert.ok(md.includes('| 7 | Multijoueur |'));
  // options citées → elles existent dans l'un des outils cités
  const known = new Set(['essais', 'telemetry-report', 'medals', 'golden', 'contract'].flatMap((t) => [...read(`tools/${t}.mjs`).matchAll(/--[a-z][a-z-]*/g)].map((m) => m[0])));
  assert.deepEqual([...new Set(md.match(/ --[a-z][a-z-]*/g).map((x) => x.trim()))].filter((o) => !known.has(o)), [], 'options citées par ESSAIS.md et inconnues des outils');
  for (const o of ['--pseudos', '--verifier-cles', '--ecrire', '--forcer', '--depuis', '--pv', '--md', '--avis', '--temps']) assert.ok(md.includes(o) && tool.includes(`'${o}'`), 'option du protocole : ' + o);
  // requêtes SQL : colonnes qui existent ; l'export des avis n'a PAS la colonne pseudo
  const q = [...md.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(q.length, 1);
  const [runs, avis] = q[0].split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const cols = (sql) => /^select (.*?) from/.exec(sql)[1].split(',').map((c) => c.trim());
  for (const c of cols(runs)) assert.match(sql6, new RegExp(`\\b${c} `), 'run_stats : ' + c);
  for (const c of cols(avis)) assert.match(sql19, new RegExp(`\\b${c} `), 'feedback : ' + c);
  assert.ok(!cols(avis).includes('pseudo') && !/\*/.test(avis), 'l’export des avis ne prend pas le pseudo');
  for (const c of ['install', 'track', 'outcome', 'time', 'progress', 'respawns', 'attempt', 'phys_ver', 'medal', 'created_at']) assert.ok(cols(runs).includes(c), 'le rapport de télémétrie lit « ' + c + ' »');
  // la vie privée
  for (const t of ['Consentement et vie privée', 'ignoré par git', 'essais-donnees/', 'T01, T02', 'Aucune donnée personnelle dans le dépôt', '12 mois', 'ne voit pas son identifiant', 'décoche', 'Paramètres › Jeu', 'phase séparée', 'PHYS_VER']) assert.ok(md.includes(t), 'ESSAIS.md ne dit pas : ' + t);
  assert.match(read('.gitignore'), /^essais-donnees\/$/m, 'les exports bruts sont ignorés par git');
  // aucun identifiant d'installation (16 caractères hexadécimaux) ni adresse électronique dans le protocole
  assert.ok(!/\b[0-9a-f]{16}\b/.test(md) && !/[\w.-]+@[\w-]+\.\w+/.test(md), 'aucune donnée personnelle dans le protocole');
});

await finish('Les médailles se calent sur un petit groupe de testeurs, circuit par circuit, et leurs avis se résument en un rapport.');
