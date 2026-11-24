// Export des données du joueur (RGPD : droit d'accès et de portabilité, 0.12.4) : un fichier JSON lisible avec ce que cet appareil garde (stockage local
// du joueur en cours) et, s'il a une session en ligne, ce que le serveur garde à son nom, lu table par table avec SES droits (ce qu'il peut lire, rien de
// plus : les règles de la base s'appliquent). Aucun jeton de session n'entre dans le fichier. Module pur (testé sous Node : tools/test-legal.mjs).

// Colonnes de scores que le jeu a le DROIT de lire (supabase/etape5-securite.sql, etape7, etape9) : `select=*` exige TOUTES les colonnes et PostgreSQL refuse alors la requête entière
// (inputs, ghost : jamais lisibles ; TECH-032) : la table des temps du joueur était toujours en erreur. Ni `inputs` (les commandes de la course) ni `ghost` (les poses, très volumineuses)
// ne sont exportés ; `ghost_veh` non plus (droit accordé seulement par l'étape 20 : l'export doit marcher avec ou sans). Un test SQL (tools/test-securite-sql.sh) exécute ces requêtes
// pour de bon sous le rôle du jeu.
export const SCORE_COLUMNS = 'track_key,player,time,phys_ver,track_name,updated_at,has_ghost,splits';

// Tables lues, le filtre qui désigne les lignes du joueur ({u} : son identifiant) et, au besoin, les colonnes demandées (sinon toutes : `select=*`).
export const EXPORT_TABLES = [
  ['accounts', 'user_id=eq.{u}'], ['players', 'id=eq.{u}'], ['cloud_saves', 'user_id=eq.{u}'],
  ['scores', 'player=eq.{u}', SCORE_COLUMNS], ['scores_archive', 'player=eq.{u}'], ['tracks', 'author=eq.{u}'], ['track_comments', 'author=eq.{u}'],
  ['track_likes', 'player=eq.{u}', 'track_id,player'],
  ['follows', 'follower=eq.{u}'], ['friends', 'or=(a.eq.{u},b.eq.{u})'], ['duels', 'or=(challenger.eq.{u},opponent.eq.{u})'],
  ['tournament_players', 'player=eq.{u}'], ['ratings', 'player=eq.{u}'], ['season_divisions', 'player=eq.{u}'], ['division_history', 'player=eq.{u}'],
  ['playlists', 'owner=eq.{u}'], ['community_modes', 'owner=eq.{u}'],
];
// Les tables que n'importe quelle session peut lire pour n'importe quel joueur (règles de lecture publiques) : seules ces tables sont demandées pour une autre identité dont on n'a
// pas la session (sinon une table privée renverrait « vide » : ce serait faux, pas « rien »).
export const PUBLIC_EXPORT_TABLES = ['players', 'scores', 'tracks'];

const SECRET_KEY = /session|token|password|secret|vproof/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stockage local (clé -> texte) rendu lisible : les valeurs JSON sont décodées ; les clés qui ressemblent à un secret sont écartées.
export function readableLocal(dump = {}) {
  const out = {};
  for (const [k, v] of Object.entries(dump)) {
    if (SECRET_KEY.test(k) || typeof v !== 'string') continue;
    try { out[k] = JSON.parse(v); } catch { out[k] = v; }
  }
  return out;
}

// meta : { game, version, identity: { kind, username } } ; local : dumpAll() ; uid : identifiant en ligne ou null ; get(path) : lecture REST authentifiée.
// identities : les AUTRES identités en ligne connues de cet appareil (l'invité gardé à côté d'un compte, l'ancien anonyme) : [{ label, uid, get, complete }]. `complete` : on a la session
// de cette identité (toutes ses tables sont lues) ; sinon seules les tables publiques le sont (scope « public-only »).
export async function buildExport({ meta = {}, local = {}, uid = null, get = null, identities = [], now = () => new Date() } = {}) {
  const out = { format: 'export-joueur-1', ...meta, exportedAt: now().toISOString(), device: readableLocal(local), server: null };
  if (!uid || !UUID.test(uid) || typeof get !== 'function') { out.server = { status: 'no-online-session' }; return out; }
  out.server = { status: 'ok', uid, omitted: { scores: ['inputs', 'ghost', 'ghost_veh'] } };
  await readTables(out.server, EXPORT_TABLES, uid, get);
  const others = [];
  for (const id of Array.isArray(identities) ? identities : []) {
    if (!id || typeof id.get !== 'function' || !UUID.test(String(id.uid)) || id.uid === uid || others.some((o) => o.uid === id.uid)) continue;
    const rec = { label: String(id.label || ''), uid: id.uid, scope: id.complete ? 'complete' : 'public-only' };
    await readTables(rec, id.complete ? EXPORT_TABLES : EXPORT_TABLES.filter(([t]) => PUBLIC_EXPORT_TABLES.includes(t)), id.uid, id.get);
    others.push(rec);
  }
  if (others.length) out.server.otherIdentities = others;
  return out;
}

async function readTables(into, tables, uid, get) {
  for (const [table, filter, columns] of tables) {
    try { into[table] = await get(`/rest/v1/${table}?select=${columns || '*'}&${filter.replaceAll('{u}', uid)}`); }
    catch (e) { into[table] = { error: String((e && e.message) || e) }; }
  }
}
