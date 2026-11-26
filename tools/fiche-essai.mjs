// Fiche d'essai : node tools/fiche-essai.mjs   -> docs/FICHE-ESSAI.md et docs/temps-humains.json (gabarit vide)
// Le fichier docs/FICHE-ESSAI.md est GÉNÉRÉ (ne pas le modifier à la main : tools/test-essais.mjs échoue s'il diffère de la génération). Les nombres du protocole
// (testeurs, parcours imposé, questions de ressenti) viennent de tools/essais-protocole.mjs ; les circuits et leurs médailles, de js/tracks.js ; les questions du
// formulaire du jeu, de js/feedback.js. Le texte du protocole est docs/ESSAIS.md.
// Un circuit n'a été parcouru que par le pilote automatique : cette fiche sert à les jouer une fois, à la main, et à noter ce qui cloche.
// Les meilleurs temps relevés se recopient dans docs/temps-humains.json, puis : node tools/medals.mjs --humain docs/temps-humains.json --ecrire
import { writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { PROFILS, CHAPTERS, CHAPTER_SIZE, goalFor, goalLabel } from '../js/career.js';
import { SCALES, CHOICES } from '../js/feedback.js';
import { PHYS_VER } from '../js/version.js';
import { runTrack } from './lab.mjs';
import { QUOTAS, MIN_TESTEUR, ROUTE_MIN, PARCOURS, MULTIJOUEUR, QUESTIONS_RESSENTI, QUESTIONS_LIBRES, OBSERVATION_DEBUT, parcours } from './essais-protocole.mjs';

const stars = (n) => '◆'.repeat(n) + '◇'.repeat(5 - n);
const blank = '______';
const echelle = (s) => (s.type === 'note' ? `1 ${s.ends[0].toLowerCase()} … 5 ${s.ends[1].toLowerCase()}` : `−2 ${s.ends[0].toLowerCase()} · 0 juste · +2 ${s.ends[1].toLowerCase()}`);

// → { fiche (texte), temps (gabarit des temps humains : { circuit: [] }) }
export function buildFiche(defs = BUILTIN_TRACKS) {
  const human = defs.filter((d) => d.medalsBy === 'humain').length;
  const calage = human === defs.length ? 'Les médailles de tous les circuits sont calées sur des temps de testeurs (essais précédents).'
    : human ? `Les médailles de ${human} circuits sur ${defs.length} sont calées sur des temps de testeurs, les autres sur le pilote automatique (Or = son temps).`
      : 'Les médailles sont calées sur le pilote automatique (**Or = son temps**), pas encore sur des testeurs : c’est ce que les essais vérifient.';
  const L = [];
  L.push(`# Fiche d'essai — protocole et ${defs.length} circuits`, '',
    '_Ce fichier est généré (`node tools/fiche-essai.mjs`) : ne pas le modifier à la main. Le protocole complet, le consentement et le calendrier sont dans [ESSAIS.md](ESSAIS.md)._', '',
    `Physique : **${PHYS_VER}**. ${calage}`, '',
    '## 1. Le testeur (une fiche par testeur et par appareil)', '',
    '**Aucun nom, aucune adresse, aucun pseudo sur cette fiche.** Le testeur est désigné par un code que l\'organisateur choisit (A, B, C…) ; la fiche reste hors du dépôt.', '',
    `- Code du testeur : ${blank} · Date : ${blank} · Observateur présent : oui / non`,
    '- Expérience : ' + CHOICES.experience.map(([, l]) => `[ ] ${l}`).join('  ·  '),
    '- Commandes : ' + CHOICES.controls.map(([, l]) => `[ ] ${l}`).join('  ·  '),
    '- Appareil : ' + CHOICES.device.map(([, l]) => `[ ] ${l}`).join('  ·  '),
    '- Navigateur : [ ] Chrome ou Edge  ·  [ ] Firefox  ·  [ ] Safari  ·  [ ] autre : ' + blank,
    '- Consentement lu et compris (voir ESSAIS.md, « Consentement et vie privée ») : [ ] a accepté les statistiques anonymes  ·  [ ] les a refusées (ses temps ne seront pas dans le rapport ; son avis oui s\'il l\'envoie)  ·  [ ] peut tout retirer à tout moment',
    '', '## 2. Parcours imposé', '',
    `Ordre à suivre. Il faut avoir **fini ${MIN_TESTEUR.circuits} circuits différents** (les deux premiers chapitres) et couru **au moins ${MIN_TESTEUR.courses} fois** en tout ; le rapport vérifie que chaque circuit du parcours a été essayé par au moins ${ROUTE_MIN} testeurs. Un testeur qui ne finit pas un circuit difficile n'a pas « échoué » : l'abandon est une mesure.`, '',
    '| Étape | Circuit | Pourquoi celui-là | À noter |', '| --- | --- | --- | --- |',
    '| 0 | Premières minutes | Ouverture du jeu jusqu\'à la première arrivée, sans aide, **l\'observateur ne parle pas** | voir « Premières minutes » ci-dessous |');
  parcours(defs).forEach((p, i) => L.push(`| ${i + 1} | **${p.name}** (n° ${p.index + 1}, chapitre ${p.chapter}, ${stars(p.difficulty)}, ${PROFILS[p.profil].label}) | ${p.role} | essais avant la première arrivée ; réapparitions ; meilleur temps ${blank} s ; médaille ${blank} |`));
  L.push(`| 7 | Multijoueur | ${MULTIJOUEUR} | départ commun, voitures des autres, saccades ; notes ${blank} |`, '',
    'Pour jouer un circuit précis sans passer par la carrière, ouvrir la console du navigateur (F12) et taper `copytrack.playBuiltin(N)`, où N = numéro du circuit − 1 (ordinateur seulement).', '',
    '### Premières minutes (l\'observateur note, sans rien dire)', '', ...OBSERVATION_DEBUT.map((o) => `- [ ] ${o} ${blank}`), '',
    '## 3. Questions de ressenti', '',
    'À poser **après le parcours** (ou après chaque étape si le testeur préfère), à voix haute : même échelle que le formulaire du jeu. Ce sont des réponses de testeurs, pas des mesures.', '',
    '### Dans le formulaire du jeu (Paramètres › Donner mon avis, ou proposé après 6 courses finies)', '',
    'Le testeur le remplit lui-même, dans le jeu : rien à recopier ici.', '',
    '| Question du formulaire | Échelle |', '| --- | --- |', ...SCALES.map((s) => `| ${s.label} | ${echelle(s)} |`), '',
    '### Sur la fiche seulement (non demandées par le formulaire)', '',
    '| Question | Échelle | Réponse |', '| --- | --- | --- |', ...QUESTIONS_RESSENTI.map((q) => `| ${q.label} | ${echelle(q)} | ${blank} |`), '',
    ...QUESTIONS_LIBRES.map((q) => `- ${q} ${blank}`), '',
    '## 4. Cibles du protocole (rappel)', '',
    `- Testeurs qui comptent : au moins **${QUOTAS.testeurs}** ; débutants ≥ ${QUOTAS.experience.debutant}, habitués ≥ ${QUOTAS.experience.habitue} ; clavier ≥ ${QUOTAS.controls.clavier}, écran tactile ≥ ${QUOTAS.controls.tactile}, manette ≥ ${QUOTAS.controls.manette}.`,
    '- Médailles visées par le recalage (Mode B) : bronze atteint par ~90 % des testeurs, argent ~50 %, or ~15 %, cristal rarement.', '',
    `## 5. Les ${defs.length} circuits`, '',
    'À remplir en jouant, **un circuit après l\'autre, dans l\'ordre de la carrière** (un chapitre s\'ouvre avec 4 médailles dans le précédent ; un chapitre bonus, dans le chapitre que dit sa description), par un testeur qui veut tout passer en revue : facultatif, les temps arrivent tout seuls par les statistiques.',
    'Pour chaque circuit, coche ce qui est vrai et note le meilleur temps. Le temps du pilote automatique sert de repère.', '',
    '| Case | Question |', '| --- | --- |',
    '| Départ | le départ est clair dès la première seconde, sans réapparaître |',
    '| Passage | le passage le plus dur est dur **mais juste** (on comprend pourquoi on a raté) |',
    '| Médaille | on peut décrocher au moins l\'argent en moins de 10 essais |',
    '| Bonus | l\'objectif ★ est réalisable sans se battre contre le circuit |',
    '| Checkpoint | repartir du dernier checkpoint (touche R) ne piège jamais la voiture |',
    '| Fini | rien à changer : tu es satisfait·e de ce circuit |', '');
  const tpl = {};
  defs.forEach((d, i) => {
    if (i % CHAPTER_SIZE === 0) { const c = CHAPTERS[i / CHAPTER_SIZE]; L.push(`## Chapitre ${i / CHAPTER_SIZE + 1} · ${c.name}`, '', `_${c.desc}_`, ''); }
    const S = runTrack(buildBuiltin(d)), pf = PROFILS[d.profil], route = PARCOURS.some((p) => p.id === d.id);
    tpl[d.id] = [];
    L.push(`### ${i + 1}. ${d.name} — ${pf.label}, ${stars(d.difficulty)}${route ? ' · **parcours imposé**' : ''}`, '',
      `- ${d.appris}`,
      `- Pilote automatique : **${S.time.toFixed(1)} s** · médailles : cristal ${d.medals.cristal} · or ${d.medals.or} · argent ${d.medals.argent} · bronze ${d.medals.bronze}`,
      `- Objectif bonus ★ : ${goalLabel(goalFor(d, i))}`,
      '- [ ] Départ  - [ ] Passage  - [ ] Médaille  - [ ] Bonus  - [ ] Checkpoint  - [ ] Fini',
      '- Mon meilleur temps : ______ s · Notes : ____________________________________________', '');
  });
  return { fiche: L.join('\n'), temps: JSON.stringify(tpl, null, 1) + '\n', n: defs.length };
}

if (process.argv[1] && /(^|[\\/])fiche-essai\.mjs$/.test(process.argv[1])) {
  const { fiche, temps, n } = buildFiche();
  writeFileSync(new URL('../docs/FICHE-ESSAI.md', import.meta.url), fiche);
  writeFileSync(new URL('../docs/temps-humains.json', import.meta.url), temps);
  console.log('docs/FICHE-ESSAI.md et docs/temps-humains.json écrits (' + n + ' circuits)');
}
