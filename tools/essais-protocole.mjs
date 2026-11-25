// Protocole des essais humains (COMPLETE-001) : les nombres et le parcours imposé, écrits UNE fois, lus par la fiche générée (tools/fiche-essai.mjs →
// docs/FICHE-ESSAI.md), par le rapport d'après-essais (tools/essais.mjs) et par leurs tests. Le texte du protocole est docs/ESSAIS.md ; si un nombre change, il
// change ici, la fiche se régénère (node tools/fiche-essai.mjs) et docs/ESSAIS.md se relit (tools/test-essais.mjs en vérifie les nombres).
//
// Ce module ne mesure rien de lui-même : il compare des exports (statistiques de jeu : table run_stats ; avis : table feedback) au protocole. Les deux se
// relient par l'identifiant d'installation (16 caractères hexadécimaux aléatoires, jamais lié à un nom : voir supabase/TELEMETRIE.md). Le rapport appelle les
// testeurs T01, T02… : aucun identifiant ni pseudo n'a besoin d'être écrit dans un document du dépôt.
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { CHAPTER_SIZE } from '../js/career.js';

// ---- Qui teste ---------------------------------------------------------------------------------------------------------------------------------------
// Un testeur « compte » quand il a fini au moins MIN_TESTEUR.circuits circuits intégrés différents (les deux premiers chapitres) ; il en faut TESTEURS.
export const MIN_TESTEUR = { circuits: 12, courses: 30 };
export const QUOTAS = {
  testeurs: 8,
  experience: { debutant: 3, habitue: 3 },
  controls: { clavier: 3, tactile: 2, manette: 1 },
};
// Ce que le rapport ne peut PAS mesurer (le formulaire ne demande pas le navigateur) : à déclarer à la main, une ligne dans le journal d'essai.
export const DECLARE = { navigateurs: { 'Firefox ou Safari': 2 }, multijoueur: { 'salon à deux appareils, course finie': 2 } };
export const ROUTE_MIN = 6;       // au moins 6 testeurs ont essayé (arrivée ou abandon) chaque circuit du parcours imposé

// ---- Le parcours imposé ---------------------------------------------------------------------------------------------------------------------------------
// Six circuits de la carrière, de ◆ à ◆◆◆◆◆, qui couvrent les cinq profils ; deux d'entre eux servent aussi de circuit « à gravité » et « à plaques ».
// tools/test-essais.mjs vérifie ces rôles sur le code des circuits (si un circuit change, le test dit lequel remplacer).
export const PARCOURS = [
  { id: 'eclats', role: 'Premières minutes : le tout premier circuit de la carrière.' },
  { id: 'tremplins', role: 'Circuit à plaques : plateformes carrées (plaques 2×2 et 3×3) à viser en vol et à quitter en vitesse.' },
  { id: 'verglas', role: 'Dérapage sur la glace, virages serrés : le ressenti de la glisse.' },
  { id: 'racines', role: 'Circuit à gravité : départ au plafond, la route suit la gravité retournée (tube, loopings).' },
  { id: 'temple', role: 'Technique ◆4 : freinages, chicanes, tubes.' },
  { id: 'archipel', role: 'Vitesse ◆5 : le plus dur du parcours (chapitre 3 : s’ouvre avec 4 médailles au chapitre 2).' },
];
export const MULTIJOUEUR = 'Menu principal › Multijoueur, deux personnes sur deux appareils : l’une choisit « Créer une salle » (mode « Course »), l’autre « Rejoindre » avec le code à 6 caractères. ' +
  'Courir Premiers Éclats ensemble (départ commun), puis la revanche ; ensuite un « Championnat » de deux circuits. Chacun note si le départ commun, les autres voitures et les éventuelles saccades se sentent.';

export function parcours(defs = BUILTIN_TRACKS) {
  return PARCOURS.map((p) => {
    const index = defs.findIndex((d) => d.id === p.id);
    if (index < 0) throw new Error('circuit du parcours inconnu : ' + p.id);
    const d = defs[index];
    return { ...p, name: d.name, difficulty: d.difficulty, profil: d.profil, index, chapter: Math.floor(index / CHAPTER_SIZE) + 1 };
  });
}

// ---- Lire les exports --------------------------------------------------------------------------------------------------------------------------------
const num = (v) => (v === '' || v == null ? null : +v);
export const TOO_FAST = 0.6;      // comme tools/essais.mjs : un temps plus de 40 % plus rapide que le pilote n'est pas une arrivée de testeur

// Parties de chaque installation sur les circuits de la carrière, à cette version de la physique, depuis cette date.
// → Map(install → { courses, finishes, quits, circuits: Set (finis), tried: Set (essayés), respawnsOnFinish, finishRuns })
export function statsParTesteur(rows, { golden, pv, since = null, tooFast = TOO_FAST }) {
  const out = new Map(), t0 = since ? Date.parse(since) : null;
  for (const r of rows) {
    const install = String(r.install || ''), track = String(r.track || ''), time = num(r.time);
    if (!install || !golden[track] || !(time > 0) || (r.outcome !== 'finish' && r.outcome !== 'quit')) continue;
    if (num(r.phys_ver ?? r.pv) !== pv) continue;
    if (t0 && r.created_at && Date.parse(r.created_at) < t0) continue;
    if (r.outcome === 'finish' && time < golden[track] * tooFast) continue;
    if (!out.has(install)) out.set(install, { courses: 0, finishes: 0, quits: 0, circuits: new Set(), tried: new Set(), respawnsOnFinish: 0, finishRuns: 0 });
    const s = out.get(install);
    s.courses++; s.tried.add(track);
    if (r.outcome === 'finish') { s.finishes++; s.circuits.add(track); s.respawnsOnFinish += num(r.respawns) || 0; s.finishRuns++; }
    else s.quits++;
  }
  return out;
}

// Un avis par installation (le dernier), avec le profil. → Map(install → { experience, controls, device })
export function profils(feedbackRows, { since = null } = {}) {
  const t0 = since ? Date.parse(since) : null, last = new Map();
  for (const r of [...feedbackRows].filter((x) => x && x.install && (!t0 || !x.created_at || Date.parse(x.created_at) >= t0))
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) last.set(r.install, { experience: r.experience, controls: r.controls, device: r.device });
  return last;
}

// T01, T02… dans l'ordre de l'identifiant (aléatoire : l'ordre ne dit rien du testeur).
export function etiquettes(installs) {
  return new Map([...new Set(installs)].sort().map((id, i) => [id, 'T' + String(i + 1).padStart(2, '0')]));
}

// ---- Le protocole est-il rempli ? ---------------------------------------------------------------------------------------------------------------
// → { testers: [{ id, label, profile, courses, finishes, circuits, qualified, route: { circuit: 'fini'|'essayé'|'—' } }], unlinked, quotas: [{ label, need, have, ok }], route: [{ id, tried, finished, ok }], ok }
export function couverture(stats, prof, { quotas = QUOTAS, min = MIN_TESTEUR, route = PARCOURS, routeMin = ROUTE_MIN } = {}) {
  const labels = etiquettes([...stats.keys()]);
  const testers = [...stats].map(([id, s]) => ({
    id, label: labels.get(id), profile: prof.get(id) || null, courses: s.courses, finishes: s.finishes, circuits: s.circuits.size,
    qualified: s.circuits.size >= min.circuits && s.courses >= min.courses,
    route: Object.fromEntries(route.map((p) => [p.id, s.circuits.has(p.id) ? 'fini' : s.tried.has(p.id) ? 'essayé' : '—'])),
  })).sort((a, b) => a.label.localeCompare(b.label));
  const Q = testers.filter((t) => t.qualified);
  const rows = [{ label: 'testeurs qui ont fini ' + min.circuits + ' circuits en ' + min.courses + ' courses ou plus', need: quotas.testeurs, have: Q.length }];
  for (const [k, need] of Object.entries(quotas.experience)) rows.push({ label: 'expérience : ' + k, need, have: Q.filter((t) => t.profile && t.profile.experience === k).length });
  for (const [k, need] of Object.entries(quotas.controls)) rows.push({ label: 'commandes : ' + k, need, have: Q.filter((t) => t.profile && t.profile.controls === k).length });
  const tours = route.map((p) => ({ id: p.id, tried: Q.filter((t) => t.route[p.id] !== '—').length, finished: Q.filter((t) => t.route[p.id] === 'fini').length }))
    .map((r) => ({ ...r, ok: r.tried >= routeMin }));
  const quotasOk = rows.map((r) => ({ ...r, ok: r.have >= r.need }));
  return { testers, unlinked: testers.filter((t) => !t.profile).length, quotas: quotasOk, route: tours, ok: quotasOk.every((r) => r.ok) && tours.every((r) => r.ok) };
}

// Par profil (expérience, commandes, appareil) : nombre de testeurs, niveau moyen (temps du testeur / temps du pilote, modèle commun de tools/essais.mjs),
// part des circuits essayés qui ont été finis, réapparitions par arrivée, abandons par testeur. fit : le résultat de fitPooled / fitRobust (ou null).
// → { experience: { debutant: {...}, habitue: {...} }, controls: {...}, device: {...} }
export function parProfil(stats, prof, fit = null) {
  const out = { experience: {}, controls: {}, device: {} };
  for (const dim of Object.keys(out)) {
    const groups = new Map();
    for (const [id, s] of stats) { const p = prof.get(id); if (!p || !p[dim]) continue; if (!groups.has(p[dim])) groups.set(p[dim], []); groups.get(p[dim]).push([id, s]); }
    for (const [v, list] of groups) {
      const tried = list.reduce((a, [, s]) => a + s.tried.size, 0), fin = list.reduce((a, [, s]) => a + s.circuits.size, 0);
      const finRuns = list.reduce((a, [, s]) => a + s.finishRuns, 0), resp = list.reduce((a, [, s]) => a + s.respawnsOnFinish, 0);
      const lv = fit ? list.map(([id]) => (fit.a.has(id) ? Math.exp(fit.mu + fit.a.get(id)) : null)).filter((x) => x != null) : [];
      out[dim][v] = {
        testers: list.length, courses: list.reduce((a, [, s]) => a + s.courses, 0),
        completion: tried ? fin / tried : null,                                   // circuits finis / circuits essayés (chaque testeur compte pour ses circuits)
        respawnsPerFinish: finRuns ? resp / finRuns : null,
        quitsPerTester: list.reduce((a, [, s]) => a + s.quits, 0) / list.length,
        level: lv.length ? lv.reduce((a, x) => a + x, 0) / lv.length : null,       // 0,80 = 20 % plus vite que le pilote automatique
        levelN: lv.length,
      };
    }
  }
  return out;
}
