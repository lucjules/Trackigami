// Vérifie que js/categoriesFaisables.js (catégories de record que le pilote automatique finit) est à jour : node tools/check-categories.mjs   (npm test)
// Il REFAIT la mesure (tools/categories-faisables.mjs : chaque circuit officiel × chaque catégorie proposée par la fiche, au pilote automatique) et compare au fichier ; il échoue si un circuit a changé,
// si un circuit a été ajouté, ou si la physique ou le pilote ont changé le résultat d'une catégorie. Si ce contrôle échoue : npm run categories  (puis relire le diff : une catégorie qui devient « non finie » est annoncée au joueur).
import { readFileSync } from 'node:fs';
import { measureAll, renderModule, OUT } from './categories-faisables.mjs';

const measure = await measureAll();
const want = renderModule(measure), have = readFileSync(OUT, 'utf8');
if (want === have) {
  const n = Object.values(measure).reduce((a, m) => a + Object.keys(m.cats).length, 0);
  console.log(`  ok   js/categoriesFaisables.js est à jour (${Object.keys(measure).length} circuits, ${n} couples circuit × catégorie)`);
} else {
  const a = have.split('\n'), b = want.split('\n'), diff = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff.push(`  - ${(a[i] || '').trim().slice(0, 150)}\n  + ${(b[i] || '').trim().slice(0, 150)}`);
  console.log(`FAIL js/categoriesFaisables.js n'est pas à jour (${diff.length} ligne(s) différente(s)) : lancer « npm run categories »\n${diff.slice(0, 12).join('\n')}`);
  process.exit(1);
}
