// Saisons hebdomadaires (Trackigami Evolution, E15) : la saison N dure une semaine, du lundi 00:00 UTC au lundi suivant (la saison 1 commence le
// 9 novembre 2026, comme supabase/etape11-saisons.sql : un test compare les deux). Ses trois circuits, tirés de la carrière d'après le numéro, sont
// les mêmes pour tout le monde ; leurs temps sont des catégories de record « b-…~v1.sea-N » (variants.js), que le serveur n'accepte que pendant la
// semaine N (verify.js). Le pool de chaque saison est FIGÉ (SEASON_POOLS, plus bas). Les points et les divisions se calculent en base, depuis les temps vérifiés (aucun point n'est déclaré par le jeu).
// Ce module est dans la fermeture de la vérification serveur : pur, sans profil ni stockage.
import { BUILTIN_TRACKS } from './tracks.js';
import { rng } from './daily.js';

export const SEASON_EPOCH = Date.UTC(2026, 10, 9);          // lundi 9 novembre 2026, 00:00 UTC
export const SEASON_MS = 7 * 86400000;
export const SEASON_TRACKS = 3;
// Une course finie juste après minuit (lundi) compte encore pour la saison qui vient de finir. La base ne CLÔT une saison (montées, descentes) qu'après sa fin + cette grâce :
// `close_season` (supabase/etape20-droits-et-regles.sql, `make_interval(secs => 600)`). Les deux valeurs changent ENSEMBLE : tools/test-seasons.mjs et tools/test-etape20-sql.sh le vérifient.
export const SEASON_GRACE_MS = 10 * 60000;

// Numéro de la saison à l'instant t (ms) ; 0 avant la saison 1.
export const seasonOf = (t = Date.now()) => (t < SEASON_EPOCH ? 0 : Math.floor((t - SEASON_EPOCH) / SEASON_MS) + 1);
export const seasonBounds = (n) => ({ starts: SEASON_EPOCH + (n - 1) * SEASON_MS, ends: SEASON_EPOCH + n * SEASON_MS });

// POOL FIGÉ (TRANS-12, COMPLETE-002) : la saison n tire ses circuits dans une liste EXPLICITE d'identifiants, et non plus dans « tous les circuits intégrés hors
// Atelier » : ajouter un circuit officiel ne change donc plus le tirage d'aucune saison (ni passée, ni en cours, que le serveur vérifie, ni à venir).
// SEASON_POOLS : [{ from, ids }], par saison de départ croissante ; la saison n tire dans la DERNIÈRE liste dont from ≤ n. L'ordre des identifiants compte
// (le tirage choisit un rang) : on ne réordonne jamais une liste, on n'en retire rien. Pour faire entrer de nouveaux circuits dans les saisons, on AJOUTE une
// entrée { from: N, ids: [...liste précédente, ...nouveaux] } dont la saison de bascule N est postérieure aux douze saisons qui suivent la saison en cours au
// moment de la livraison, et au moins deux semaines après le déploiement (tools/test-saisons-figees.mjs le vérifie ; docs/ARCHITECTURE.md, « Saisons »).
// Liste 1 : les 66 circuits de la carrière d'avant la 0.17.0, hors Atelier, dans l'ordre de la carrière (celui qu'avait le tirage).
export const SEASON_POOL_1 = Object.freeze([
  'eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour',
  'lianes', 'canopee', 'spores', 'serpent', 'racines', 'temple',
  'lagon', 'recif', 'phare', 'vrille', 'lunaire', 'archipel',
  'neons', 'boulevard', 'hyper', 'metro', 'tours', 'viaduc',
  'aurore', 'banquise', 'glacier', 'helice', 'couronne', 'blizzard',
  'braises', 'coulee', 'basalte', 'cheminee', 'caldeira', 'eruption',
  'quai', 'navette', 'ceinture', 'grandanneau', 'apesanteur', 'zenith',
  'courant', 'corail', 'epave', 'meduses', 'abysses', 'barriere',
  'chaine', 'laminoir', 'engrenages', 'fonderie', 'presse', 'usinefolle',
  'envol', 'suspendues', 'rafales', 'montgolfieres', 'pontvents', 'cite',
  'galerie', 'plafond', 'cristalfele', 'miroir', 'vrilles', 'coeur',
]);
export const SEASON_POOLS = Object.freeze([
  Object.freeze({ from: 1, ids: SEASON_POOL_1 }),
]);

// Identifiants dans lesquels tire la saison n.
export function seasonPoolIds(n) {
  let ids = SEASON_POOLS[0].ids;
  for (const p of SEASON_POOLS) if (n >= p.from) ids = p.ids;
  return ids;
}

// Les circuits de la saison n : trois circuits distincts du pool de la saison (seasonPoolIds), tirés d'après le numéro.
export function seasonTracks(n) {
  const pool = seasonPoolIds(n).map((id) => BUILTIN_TRACKS.find((d) => d.id === id));
  if (pool.some((d) => !d)) throw new Error('Saison ' + n + ' : un circuit du pool n’existe pas.');
  const r = rng('season#' + n), out = [];
  while (out.length < SEASON_TRACKS) {
    const d = pool[Math.floor(r() * pool.length)];
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

// Une course de la saison n peut-elle être acceptée à l'instant t ? '' si oui, sinon la raison.
export function seasonOpen(n, t = Date.now()) {
  const { starts, ends } = seasonBounds(n);
  if (!(n >= 1) || t < starts) return 'Cette saison n’a pas encore commencé.';
  if (t >= ends + SEASON_GRACE_MS) return 'Cette saison est terminée : les temps ne comptent plus.';
  return '';
}

export const DIVISIONS = ['', 'Élite', 'Expert', 'Confirmé', 'Amateur', 'Débutant'];
