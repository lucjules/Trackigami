// Bilan de supabase/verify-prod.sql lu depuis la sortie de psql (tools/verify-prod-report.mjs) : écart inattendu = échec, écart attendu = affiché mais toléré, sortie vide = « rien prouvé ».
// node tools/test-verify-prod-report.mjs   (npm test)
// Ce test ne lit que du TEXTE : verify-prod.sql lui-même a besoin d'un PostgreSQL (aucun dans `npm test` ; la tâche `sql` de la CI n'a pas de test pour ce fichier).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test, finish } from './harness.mjs';
import { analyse, parseCsv } from './verify-prod-report.mjs';

// (sortie de `psql --csv -t` : un champ n'est entouré de guillemets que s'il contient une virgule, un guillemet ou un retour à la ligne)
const q = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const T = (...rows) => rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
const OK = ['table scores', 'présente', 'présente', 'ok'];
const INFO = ['circuits publiés', 'info', '0 sur 14', 'info'];
const GHOST = ['lisibilité (TECH-021) : scores (lues par le jeu) pour le rôle authenticated', 'toutes lisibles', 'ILLISIBLES : ghost_veh', 'ÉCART'];

test('tout est ok (et des lignes « info ») : code 0, « Aucun MANQUE ni ÉCART »', () => {
  const r = analyse(T(OK, INFO)); assert.equal(r.code, 0); assert.match(r.md, /2 ligne\(s\)/); assert.match(r.md, /Aucun MANQUE ni ÉCART/);
});
test('un ÉCART ou un MANQUE non attendu : code 1, la ligne est dans le bilan', () => {
  assert.equal(analyse(T(OK, GHOST)).code, 1);
  const r = analyse(T(OK, ['table rate_hits', 'présente', 'absente', 'MANQUE'])); assert.equal(r.code, 1); assert.match(r.md, /MANQUE.*table rate_hits/); assert.match(r.md, /1 écart\(s\) NON attendu/);
});
test('écart ATTENDU (fragment de libellé) : code 0 MAIS la ligne reste affichée, étiquetée « attendu » (jamais cachée) ; un autre écart en plus : code 1', () => {
  const r = analyse(T(OK, GHOST), ['lisibilité (TECH-021) : scores']);
  assert.equal(r.code, 0); assert.match(r.md, /ÉCART \(attendu/); assert.match(r.md, /ILLISIBLES : ghost_veh/); assert.match(r.md, /Seuls des écarts attendus/);
  assert.equal(analyse(T(OK, GHOST, ['RLS activée : tracks', 'oui', 'NON', 'ÉCART']), ['lisibilité (TECH-021) : scores']).code, 1);
});
test('sortie vide ou mal formée (connexion échouée, pas 4 colonnes) : code 2, « rien n\'est prouvé »', () => {
  for (const bad of ['', '\n\n', 'psql: error: connection refused\n', 'a,b,c\n']) { const r = analyse(bad); assert.equal(r.code, 2, JSON.stringify(bad)); assert.match(r.md, /rien n'est prouvé/); }
});
test('lecteur CSV : champs entre guillemets, virgules, guillemets doublés et retours à la ligne dans un champ', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\nx,"l1\nl2",y\n'), [['a', 'b, c', 'd "e"'], ['x', 'l1\nl2', 'y']]);
  assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
  assert.deepEqual(parseCsv(''), []);
});
test('en ligne de commande : lit l\'entrée standard, lit ECARTS_ATTENDUS, code de sortie conforme', () => {
  const run = (input, env) => spawnSync(process.execPath, ['tools/verify-prod-report.mjs'], { input, env: { ...process.env, ...env }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(run(T(OK, GHOST), {}).status, 1);
  const r = run(T(OK, GHOST), { ECARTS_ATTENDUS: 'autre chose ¦ lisibilité (TECH-021) : scores' }); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /attendu/);
  assert.equal(run('', {}).status, 2);
});

finish('Le bilan de verify-prod distingue écart attendu, écart inattendu et rien de prouvé.');
