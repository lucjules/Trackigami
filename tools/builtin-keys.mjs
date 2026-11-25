// Clés de classement des circuits officiels (RISK-001) : node tools/builtin-keys.mjs            -> compare les clés actuelles au fichier doré tools/builtin-keys.json
//                                                         node tools/builtin-keys.mjs --update   -> y ajoute les NOUVEAUX circuits (refuse une clé changée ou un circuit retiré)
//
// tools/builtin-keys.json : { id du circuit : « b-<id>-<empreinte de encode()> » } pour les circuits officiels. C'est la mémoire des clés que les joueurs ont dans leurs records, leurs médailles
// et leurs classements. Règle : on n'AJOUTE que des circuits. Si la clé d'un circuit existant change (circuit modifié, même son nom), `--update` refuse tant que js/builtinKeys.js n'a pas
// l'entrée « ancienne clé → nouvelle clé » ; alors seulement la clé du fichier est remplacée (l'ancienne reste dans la table d'alias). Un circuit retiré est refusé : il n'existe pas d'alias pour lui.
import { readFileSync, writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { hashString } from '../js/track.js';
import { BUILTIN_KEY_ALIASES, resolveBuiltinKey } from '../js/builtinKeys.js';

const FILE = new URL('./builtin-keys.json', import.meta.url);
export const keyOf = (def) => `b-${def.id}-${hashString(buildBuiltin(def).encode())}`;
export const currentKeys = () => Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, keyOf(d)]));
export const loadGolden = () => JSON.parse(readFileSync(FILE, 'utf8'));

// Écart entre le fichier doré et les clés actuelles : { added, removed, changed: [{ id, old, now, aliased }] }. `aliased` : l'ancienne clé aboutit déjà à la nouvelle dans la table d'alias.
export function diffKeys(golden, now, aliases = BUILTIN_KEY_ALIASES) {
  const added = Object.keys(now).filter((id) => !(id in golden));
  const removed = Object.keys(golden).filter((id) => !(id in now));
  const changed = Object.keys(now).filter((id) => id in golden && golden[id] !== now[id]).map((id) => ({ id, old: golden[id], now: now[id], aliased: resolveBuiltinKey(golden[id], aliases) === now[id] }));
  return { added, removed, changed };
}

// Phrases lisibles de ce qui doit être fait (liste vide : rien à faire).
export function problems(d) {
  const f = [];
  for (const id of d.removed) f.push(`circuit « ${id} » retiré : on ne retire jamais un circuit officiel (ses records, médailles et classements existent chez les joueurs)`);
  for (const c of d.changed) f.push(c.aliased
    ? `« ${c.id} » : clé changée (${c.old} → ${c.now}) ; l'alias existe : lancer « node tools/builtin-keys.mjs --update » pour mettre le fichier doré à jour`
    : `« ${c.id} » : la clé a CHANGÉ (${c.old} → ${c.now}) : un circuit officiel a été modifié. Ajouter l'entrée d'alias '${c.old}': '${c.now}' à BUILTIN_KEY_ALIASES (js/builtinKeys.js), puis « node tools/builtin-keys.mjs --update ». Sinon : annuler la modification.`);
  for (const id of d.added) f.push(`nouveau circuit « ${id} » absent du fichier doré : lancer « node tools/builtin-keys.mjs --update »`);
  return f;
}

if (process.argv[1] && process.argv[1].endsWith('builtin-keys.mjs')) {
  const now = currentKeys();
  if (process.argv.includes('--init')) {      // première écriture du fichier (il n'existe pas encore) : seulement si absent
    try { readFileSync(FILE); console.error('tools/builtin-keys.json existe déjà : utiliser --update.'); process.exit(1); } catch { /* absent : on l'écrit */ }
    writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
    console.log(`tools/builtin-keys.json créé : ${Object.keys(now).length} circuits.`);
  } else {
    const d = diffKeys(loadGolden(), now);
    if (process.argv.includes('--update')) {
      const blocked = [...d.removed.map((id) => `« ${id} » retiré`), ...d.changed.filter((c) => !c.aliased).map((c) => `« ${c.id} » : clé changée sans alias (${c.old} → ${c.now})`)];
      if (blocked.length) { console.error('Refusé :\n  - ' + blocked.join('\n  - ') + '\nAjouter l\'alias dans js/builtinKeys.js (ou annuler la modification du circuit), puis relancer.'); process.exit(1); }
      writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
      console.log(`tools/builtin-keys.json écrit : ${Object.keys(now).length} circuits (${d.added.length} ajouté(s), ${d.changed.length} clé(s) remplacée(s) avec alias).`);
    } else {
      const f = problems(d);
      console.log(f.length ? f.join('\n') : `Les ${Object.keys(now).length} clés des circuits officiels sont celles du fichier doré.`);
      process.exitCode = f.length ? 1 : 0;
    }
  }
}
