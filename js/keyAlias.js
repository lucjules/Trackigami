// Alias local des clés de circuits de joueurs : ancienne clé u-… → nouvelle (TECH-039, phase 7, 0.16.6).
//
// Depuis la 0.16.6 la signature d'un circuit (donc sa clé de classement u-…) hache les obstacles et les solides au pas du code, et repère les pièces d'un groupe de logique par leur type
// (Track.signatureText). Les circuits qui en ont changent de clé ; les records, courses et classements rangés sous l'ancienne clé ne sont pas perdus pour autant :
//   - LECTURE avec repli : Track.userRecordKeys() donne la clé actuelle puis les anciennes (Track.legacyUserKeys, l'ancien algorithme figé) ; l'écran « Mes circuits » et la fiche du
//     circuit (trackDescriptor.js : recordKeys) lisent le premier record trouvé ;
//   - puis MIGRATION (adoptLegacyKeys, appelée quand un circuit de joueur est ouvert ou lancé) : le record de l'ancienne clé et ses variantes (« u-…~v1.… ») sont COPIÉS sous la nouvelle
//     clé s'il n'y en a pas déjà un (jamais écrasé), de même que les dernières courses (fusionnées). COPIÉS, pas déplacés : plusieurs circuits physiquement différents pouvaient partager
//     l'ancienne clé (c'était le défaut) ; chacun retrouve ainsi ce qu'il avait, et rien n'est effacé. Idempotent.
// Ne sont PAS migrés : les classements EN LIGNE (ils restent sous l'ancienne clé, figés : la nouvelle clé en commence un neuf), les fantômes importés (d'avant la physique actuelle :
// inutilisables), les favoris (références stables b: / m: / c:, jamais des clés) ni les médailles (celles d'un circuit de joueur se déduisent du temps de l'auteur dans son code).
import { getRecord, saveRecord, listRuns, setRuns, listKeys, cleanRuns } from './storage.js';

const done = new Set();                      // « ancienne>nouvelle » déjà adoptées pendant cette session (une fois suffit)
export const resetAliasSession = () => done.clear();

// Copie ce qui est rangé sous oldKey (et ses variantes) vers newKey ; renvoie le nombre d'éléments copiés.
function adopt(oldKey, newKey) {
  let n = 0;
  const suffixes = new Set(['']);                              // '' : le circuit lui-même ; '~v1.veh-moto'… : ses catégories de record
  for (const k of [...listKeys('rec3.' + oldKey + '~'), ...listKeys('runs.' + oldKey + '~')]) suffixes.add(k.slice(k.indexOf('~')));
  for (const s of suffixes) {
    const from = oldKey + s, to = newKey + s;
    const rec = getRecord(from);
    if (rec && !getRecord(to) && saveRecord(to, rec)) n++;
    const runs = listRuns(from);
    if (runs.length) {
      const cur = listRuns(to), merged = cleanRuns([...cur, ...runs]);
      if (JSON.stringify(merged) !== JSON.stringify(cur) && setRuns(to, merged)) n++;
    }
  }
  return n;
}

// À appeler avant d'utiliser la clé d'un circuit de joueur (fiche, lancement, ouverture d'un code) : rapatrie ce que l'appareil garde sous ses anciennes clés.
export function adoptLegacyKeys(track) {
  if (!track || typeof track.legacyUserKeys !== 'function') return 0;
  const legacy = track.legacyUserKeys();
  if (!legacy.length) return 0;
  const key = track.userKey;
  let n = 0;
  for (const old of legacy) {
    const id = old + '>' + key;
    if (done.has(id)) continue;
    done.add(id);
    n += adopt(old, key);
  }
  return n;
}
