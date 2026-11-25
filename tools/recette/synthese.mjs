// Synthèse des JSON écrits par les parcours : node tools/recette/synthese.mjs [dossier]
// Pour chaque configuration : nombre d'étapes, étapes sans constat, étapes avec constat (hors « indicatif »), puis la liste des constats regroupés par libellé d'étape.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || process.env.RECETTE_OUT || '/tmp/recette';
const files = readdirSync(dir).filter((f) => /^(fr|en)-(kb|land|port)(-2|-ed)?\.json$/.test(f)).sort();
const rows = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const soft = (i) => i.startsWith('(indicatif)') || i.startsWith('cible < 32 px');
  const real = d.steps.filter((s) => s.errors.length || s.issues.some((i) => !soft(i)));
  rows.push({ id: d.id, steps: d.steps.length, ok: d.steps.length - real.length, bad: real, net: d.net });
}
console.log('| configuration | étapes | sans constat | avec constat |\n| --- | ---: | ---: | ---: |');
for (const r of rows) console.log(`| ${r.id} | ${r.steps} | ${r.ok} | ${r.bad.length} |`);
console.log();
for (const r of rows) {
  if (!r.bad.length) continue;
  console.log(`## ${r.id}`);
  for (const s of r.bad) console.log(`- ${s.n} ${s.label} : ${[...s.issues.filter((i) => !(i.startsWith('(indicatif)') || i.startsWith('cible < 32 px'))), ...(s.errors.length ? ['erreurs : ' + s.errors.join(' | ')] : [])].join(' // ').slice(0, 420)}`);
}
