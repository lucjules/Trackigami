// Fin de carrière (COMPLETE-013) : la définition de « carrière complète », le bilan exact et la règle « l'écran de fin s'affiche une fois ».
// Module pur (aucun réseau, aucun navigateur) : app/careerEnd.js rassemble les circuits, les records et le profil, puis affiche.
//
// DÉFINITION : la carrière est COMPLÈTE quand le joueur a une médaille (au moins le bronze) sur CHAQUE circuit officiel de la liste, c'est-à-dire
// careerSummary(...).finished (career.js) : les 84 circuits, chapitres bonus compris, « Grande Finale » (l'épreuve finale, dernier circuit du chapitre
// Grandes Manœuvres) comprise. Les cristaux et les objectifs bonus ne sont PAS exigés : ils restent un but de maîtrise (c'est careerSummary(...).complete, qui garde
// son message « chapitre cristal » dans l'écran des circuits). Aucune clé de circuit, aucun temps de référence et aucune médaille n'est touché.
import { careerSummary } from './career.js';
import { MEDALS } from './medals.js';

// L'épreuve finale : un circuit EXISTANT, inchangé (tracks.js : id « finale »).
export const FINALE_ID = 'finale';

// Une ligne par circuit officiel d'après les records et le profil locaux ; les lectures sont passées en paramètre (le module reste pur, et le test les remplace).
// builtins : [{ def, key }] ; read : { getRecord, medalTime, medalFor, goalDone }.
export function careerRows(builtins, read) {
  return builtins.map((b) => {
    const rec = read.getRecord(b.key), time = rec ? read.medalTime(rec) : null, m = rec ? read.medalFor(time, b.def.medals) : null;
    return { id: b.def.id, name: b.def.name, time, medal: m ? m.id : null, goal: !!read.goalDone(b.key + '#goal') };
  });
}

// rows : un élément par circuit officiel { id, name, time (meilleur temps toutes physiques confondues, ou null), medal (id de médaille, ou null), goal (objectif bonus réussi) }.
// stats : { races } (profil). Tout est CALCULÉ ici d'après les records et le profil locaux, rien n'est écrit en dur.
export function careerReport(rows, stats = {}) {
  const total = rows.length;
  const byMedal = Object.fromEntries(MEDALS.map((m) => [m.id, 0]));
  let ms = 0, timed = 0, goals = 0;
  for (const r of rows) {
    if (r.medal && r.medal in byMedal) byMedal[r.medal]++;
    if (Number.isFinite(r.time) && r.time > 0) { ms += Math.round(r.time * 1000); timed++; }
    if (r.goal) goals++;
  }
  const sm = careerSummary(rows.map((r) => r.medal || null), goals);
  const fr = rows.find((r) => r.id === FINALE_ID) || null;
  return {
    total, medals: sm.medals, byMedal, crystal: sm.crystal, goals, timed,
    totalTime: timed ? ms / 1000 : null,           // temps cumulé des meilleurs temps (s) ; null sans aucun record
    races: Math.max(0, Math.floor(+stats.races || 0)),
    pct: sm.pct, finished: sm.finished, complete: sm.complete,
    finale: fr ? { id: fr.id, name: fr.name, time: Number.isFinite(fr.time) ? fr.time : null, medal: fr.medal || null } : null,
  };
}

// L'écran de fin s'ouvre tout seul UNE fois : quand la carrière est finie et que le profil ne porte pas encore la date de la première fois (careerEnd).
export const careerEndSeen = (p) => Number.isFinite(+(p && p.careerEnd)) && +p.careerEnd > 0;
export const shouldShowCareerEnd = (p, finished) => !!finished && !careerEndSeen(p);
export function markCareerEnd(p, now = Date.now()) {
  if (careerEndSeen(p)) return false;
  p.careerEnd = Math.max(1, Math.floor(+now) || 1);
  return true;
}

// Fusion de deux profils (cloudsave.js) : la date la plus ancienne (positive) ; une carrière dont l'écran de fin a été vu sur un appareil ne le rejoue pas sur l'autre.
export function mergeCareerEnd(a, b) {
  const d = [a && a.careerEnd, b && b.careerEnd].filter((x) => Number.isFinite(+x) && +x > 0).map(Number);
  return d.length ? { careerEnd: Math.min(...d) } : {};
}
