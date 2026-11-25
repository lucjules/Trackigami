// Alias de clés des circuits intégrés : ancienne clé b-… → nouvelle clé (RISK-001), pour qu'un circuit officiel dont la clé change ne fasse perdre ni records, ni médailles, ni verrous.
//
// La clé d'un circuit intégré est « b-<id>-<empreinte de encode()> » (js/main.js) : tout ce qui est dans son code (script, nom, auteur, décor, obstacles, paramètres) la change, et les
// médailles, les verrous de chapitre, les records locaux, les classements, les saisons et les duels y sont rattachés. RÈGLE (docs/ARCHITECTURE.md, « Circuits officiels ») : on n'AJOUTE que
// des circuits, on ne modifie JAMAIS un circuit officiel. Si une modification est inévitable, son auteur écrit ICI une entrée ancienne clé → nouvelle clé (BUILTIN_KEY_ALIASES) ; le test
// tools/test-cles-officielles.mjs compare les 72 clés à tools/builtin-keys.json et échoue tant que cette entrée manque.
//
// Ce que l'alias fait (sur l'appareil seulement) :
//   - LECTURE : storage.getRecord retrouve le record rangé sous une ancienne clé quand la nouvelle n'en a pas (setLegacyKeyProvider : médailles, verrous de chapitre, fantôme, bt) ;
//   - MIGRATION au démarrage et après une synchronisation (migrateBuiltinKeys) : les records et leurs catégories (« ~v1.… »), les dernières courses, la médaille et l'objectif bonus du profil
//     sont COPIÉS sous la nouvelle clé s'il n'y en a pas déjà (jamais écrasés ; un meilleur temps de médaille « bt » de l'ancienne clé n'est jamais perdu) ; rien n'est effacé ; idempotent.
// Ce que l'alias NE fait PAS : les classements en ligne (le serveur ne connaît que la clé actuelle d'un circuit et refuse l'ancienne : « Version du circuit différente »), les saisons, duels et
// tournois en cours sous l'ancienne clé, ni les fantômes importés. Un classement en ligne d'une ancienne clé reste figé sur le serveur ; la nouvelle clé en commence un neuf.
//
// Module CLIENT : il n'est PAS dans la fermeture de la vérification serveur (js/verify.js) ; tools/test-cles-officielles.mjs le vérifie. Il est pur hors migrateBuiltinKeys (stockage, profil).
import { profile, saveProfile } from './profile.js';
import { setLegacyKeyProvider } from './storage.js';
import { adopt } from './keyAlias.js';

// ancienne clé → nouvelle clé (une chaîne A → B → C est suivie jusqu'à la clé actuelle). VIDE au départ : aucun circuit officiel n'a été modifié.
export const BUILTIN_KEY_ALIASES = Object.freeze({});

const splitVariant = (key) => { const k = String(key || ''), i = k.indexOf('~'); return i < 0 ? [k, ''] : [k.slice(0, i), k.slice(i)]; };

// La clé actuelle d'une clé (éventuellement ancienne), catégorie « ~v1.… » comprise ; la clé elle-même si elle n'a pas d'alias, ou si l'alias boucle.
export function resolveBuiltinKey(key, aliases = BUILTIN_KEY_ALIASES) {
  const [base, suffix] = splitVariant(key);
  let cur = base;
  const seen = new Set();
  while (Object.hasOwn(aliases, cur) && !seen.has(cur)) { seen.add(cur); cur = aliases[cur]; }
  return seen.has(cur) ? String(key) : cur + suffix;
}

// Les anciennes clés d'une clé actuelle (la plus récemment remplacée d'abord), catégorie comprise : [] sans alias.
export function legacyKeysOf(key, aliases = BUILTIN_KEY_ALIASES) {
  const [base, suffix] = splitVariant(key);
  const olds = Object.keys(aliases);
  if (!olds.length) return [];
  return olds.filter((o) => o !== base && resolveBuiltinKey(o, aliases) === base).reverse().map((o) => o + suffix);
}

// La table est-elle cohérente avec les clés actuelles ? Renvoie les défauts (phrases lisibles) : clé mal formée, alias vers une clé qui n'existe plus, ancienne clé qui est aussi une clé actuelle.
export function checkAliases(aliases, currentKeys) {
  const cur = new Set(currentKeys), bad = [];
  for (const [o, n] of Object.entries(aliases)) {
    if (!/^b-[a-z0-9_]+-[a-z0-9]+$/.test(o) || !/^b-[a-z0-9_]+-[a-z0-9]+$/.test(n)) { bad.push(`alias mal formé : ${o} → ${n}`); continue; }
    if (cur.has(o)) bad.push(`l'ancienne clé ${o} est aussi la clé d'un circuit actuel : un alias ne peut pas la rediriger`);
    const end = resolveBuiltinKey(o, aliases);
    if (!cur.has(end)) bad.push(`l'alias ${o} → ${n} n'aboutit à aucun circuit actuel (${end})`);
    if (end === o) bad.push(`l'alias ${o} boucle`);
  }
  return bad;
}

// Fournit à storage.getRecord les anciennes clés de chaque clé (une fois, au démarrage).
export function installBuiltinKeyAliases(aliases = BUILTIN_KEY_ALIASES) {
  setLegacyKeyProvider(Object.keys(aliases).length ? (key) => legacyKeysOf(key, aliases) : null);
}

// Copie sous chaque nouvelle clé ce que l'appareil garde sous ses anciennes clés (voir l'en-tête). Renvoie le nombre d'éléments copiés ou complétés. Sans alias : ne fait rien.
export function migrateBuiltinKeys(aliases = BUILTIN_KEY_ALIASES) {
  const olds = Object.keys(aliases);
  if (!olds.length) return 0;
  let n = 0, touched = false;
  const p = profile();
  const medals = p.medals && typeof p.medals === 'object' ? p.medals : (p.medals = {});
  const goals = p.goals && typeof p.goals === 'object' ? p.goals : null;
  const mastery = p.mastery && typeof p.mastery === 'object' && !Array.isArray(p.mastery) ? p.mastery : null;
  for (const old of olds.slice().reverse()) {      // (les alias les plus récents d'abord : le record de la clé la plus récente est celui qui est copié, les plus anciens ne complètent que la médaille)
    const key = resolveBuiltinKey(old, aliases);
    if (key === old) continue;
    n += adopt(old, key, { keepBestMedal: true });
    // Profil : médaille (le meilleur palier : 0 cristal … 3 bronze), objectif bonus réussi (pas de nouvelles pièces : « goals » est déjà acquis) et défis de maîtrise (bits réunis).
    if (Number.isInteger(medals[old]) && (medals[key] == null || medals[old] < medals[key])) { medals[key] = medals[old]; n++; touched = true; }
    if (goals && goals[old + '#goal'] && !goals[key + '#goal']) { goals[key + '#goal'] = 1; n++; touched = true; }
    if (mastery && (mastery[old] | 0) && ((mastery[key] | 0) | (mastery[old] | 0)) !== (mastery[key] | 0)) { mastery[key] = (mastery[key] | 0) | (mastery[old] | 0); n++; touched = true; }
  }
  if (touched) saveProfile();
  return n;
}
