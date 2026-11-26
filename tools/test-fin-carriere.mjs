// Fin de carrière (COMPLETE-013) : définition de « carrière terminée / complète », épreuve finale, bilan EXACT, conclusion montrée une seule fois, fusion, textes, accessibilité.
// node tools/test-fin-carriere.mjs   (npm test)   ; l'écran réel (deux langues, animations réduites) : tools/test-browser-fin.mjs (npm run test:browser).
// Le bilan est comparé à un calcul INDÉPENDANT (ici, à partir des seuils de médailles des circuits et de temps choisis par le test), jamais à une valeur écrite en dur.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { medalFor, MEDALS } from '../js/medals.js';
import { careerSummary } from '../js/career.js';
import { FINALE_ID, finaleIndexOf, careerEnded, careerComplete, finaleReady, remainingBeforeFinale, careerBilan, formatSpan, endingSeen, credits } from '../js/ending.js';
import { mergeProgress } from '../js/progression.js';
import { mergeProfile } from '../js/cloudsave.js';
import { profile, saveProfile } from '../js/profile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const N = BUILTIN_TRACKS.length;
const FIN = finaleIndexOf(BUILTIN_TRACKS);

// Profils synthétiques : un temps par circuit, choisi par rapport à ses seuils ; l'entrée (médaille, temps, objectif) est calculée ICI, sans passer par ending.js.
const timeFor = (def, tier) => (tier == null ? null : tier === 'plus' ? def.medals.bronze + 5 : def.medals[tier] - 0.123);     // 'plus' : plus lent que le bronze : pas de médaille
const entriesOf = (tiers, goals) => BUILTIN_TRACKS.map((def, i) => {
  const t = timeFor(def, tiers(i)), m = t == null ? null : medalFor(t, def.medals);
  return { medal: m ? m.id : null, time: m ? t : null, goal: !!goals(i) };
});
const PROFILES = {
  vide: entriesOf(() => null, () => false),
  moitie: entriesOf((i) => (i < N / 2 ? 'or' : null), (i) => i % 5 === 0),
  fini: entriesOf((i) => ['bronze', 'argent', 'or', 'cristal'][i % 4], (i) => i % 3 === 0),
  completCristaux: entriesOf(() => 'cristal', () => true),
  finiSaufFinale: entriesOf((i) => (i === FIN ? 'plus' : 'bronze'), () => false),
  finaleSeule: entriesOf((i) => (i === FIN ? 'or' : null), () => false),
};

console.log('Définition');
test('l’épreuve finale est « Grande Finale » : circuit existant, le dernier de la liste, chapitre « Grandes Manœuvres » (aucun circuit n’est modifié : tools/test-cles-officielles.mjs)', () => {
  assert.equal(FINALE_ID, 'finale');
  assert.equal(FIN, N - 1);
  assert.equal(BUILTIN_TRACKS[FIN].name, 'Grande Finale');
  assert.equal(BUILTIN_TRACKS[FIN].chapitre, 'manoeuvres');
  assert.equal(finaleIndexOf([]), -1);
  assert.equal(finaleIndexOf([{ def: { id: 'x' } }, { def: { id: 'finale' } }]), 1, 'accepte aussi les circuits de l’application (b.def.id)');
});
test('carrière terminée = une médaille sur CHAQUE circuit (la définition de career.careerSummary) ; complète = en plus un cristal et un objectif partout', () => {
  const exp = { vide: [false, false], moitie: [false, false], fini: [true, false], completCristaux: [true, true], finiSaufFinale: [false, false], finaleSeule: [false, false] };
  for (const [k, e] of Object.entries(PROFILES)) {
    assert.deepEqual([careerEnded(e), careerComplete(e)], exp[k], k);
    const sm = careerSummary(e.map((x) => x.medal), e.filter((x) => x.goal).length);      // la définition déjà utilisée par l’écran des circuits
    assert.deepEqual([careerEnded(e), careerComplete(e)], [sm.finished, sm.complete], k + ' : même définition que careerSummary');
  }
  assert.equal(careerEnded([]), false, 'aucun circuit : rien n’est terminé');
});
test('un seul circuit sans médaille suffit à ne pas être terminé, quel qu’il soit', () => {
  for (const i of [0, 1, 40, FIN - 1, FIN]) {
    const e = PROFILES.completCristaux.map((x, j) => (j === i ? { ...x, medal: null, time: null } : x));
    assert.equal(careerEnded(e), false, 'circuit ' + i);
  }
});
test('épreuve finale « à finir » : tous les autres circuits ont une médaille et pas elle ; jamais pour une carrière terminée ni à moitié faite', () => {
  assert.equal(finaleReady(PROFILES.finiSaufFinale, FIN), true);
  assert.equal(remainingBeforeFinale(PROFILES.finiSaufFinale, FIN), 0);
  for (const k of ['vide', 'moitie', 'fini', 'completCristaux', 'finaleSeule']) assert.equal(finaleReady(PROFILES[k], FIN), false, k);
  assert.equal(finaleReady(PROFILES.finiSaufFinale, -1), false);
  assert.equal(remainingBeforeFinale(PROFILES.moitie, FIN), PROFILES.moitie.filter((x, i) => i !== FIN && !x.medal).length);
  assert.equal(remainingBeforeFinale(PROFILES.finaleSeule, FIN), N - 1, 'la finale seule ne compte pas parmi les circuits restants');
});

console.log('Bilan exact');
test('le bilan de chaque profil synthétique égale un calcul indépendant (médailles par palier, cristaux, objectifs, temps cumulé, temps de référence battus)', () => {
  for (const [k, e] of Object.entries(PROFILES)) {
    const b = careerBilan(e, FIN, { races: 123, level: 17 });
    // calcul indépendant : boucles et seuils, sans les fonctions de ending.js
    const want = { cristal: 0, or: 0, argent: 0, bronze: 0 };
    let goals = 0, sum = 0, timed = 0;
    BUILTIN_TRACKS.forEach((def, i) => {
      const t = timeFor(...[def, { vide: () => null, moitie: (j) => (j < N / 2 ? 'or' : null), fini: (j) => ['bronze', 'argent', 'or', 'cristal'][j % 4], completCristaux: () => 'cristal', finiSaufFinale: (j) => (j === FIN ? 'plus' : 'bronze'), finaleSeule: (j) => (j === FIN ? 'or' : null) }[k](i)]);
      if (t != null) {
        if (t <= def.medals.cristal + 1e-6) want.cristal++; else if (t <= def.medals.or + 1e-6) want.or++; else if (t <= def.medals.argent + 1e-6) want.argent++; else if (t <= def.medals.bronze + 1e-6) want.bronze++;
        if (t <= def.medals.bronze + 1e-6) { sum += t; timed++; }
      }
      if (e[i].goal) goals++;
    });
    assert.deepEqual(b.medals, want, k);
    assert.equal(b.crystals, want.cristal);
    assert.equal(b.medalled, want.cristal + want.or + want.argent + want.bronze, k);
    assert.equal(b.beaten, want.cristal + want.or, k + ' : temps de référence battus (or ou cristal)');
    assert.equal(b.goals, goals, k);
    assert.ok(Math.abs(b.time - sum) < 1e-9, k + ' : temps cumulé');
    assert.equal(b.timed, timed);
    assert.equal(b.timeComplete, timed === N);
    assert.equal(b.total, N);
    assert.deepEqual([b.races, b.level], [123, 17]);
    assert.deepEqual([b.ended, b.complete], [careerEnded(e), careerComplete(e)]);
  }
});
test('« complète avec cristaux » : N cristaux, N objectifs, aucune autre médaille ; le temps cumulé est la somme des temps de cristal choisis', () => {
  const b = careerBilan(PROFILES.completCristaux, FIN);
  assert.deepEqual(b.medals, { cristal: N, or: 0, argent: 0, bronze: 0 });
  assert.equal(b.goals, N);
  assert.ok(Math.abs(b.time - BUILTIN_TRACKS.reduce((a, d) => a + d.medals.cristal - 0.123, 0)) < 1e-6);
  assert.equal(b.complete, true);
  assert.deepEqual(b.finale, { medal: 'cristal', time: BUILTIN_TRACKS[FIN].medals.cristal - 0.123 });
});
test('profil vide : tout à zéro, rien d’inventé ; carrière à moitié finie : les compteurs suivent', () => {
  const b = careerBilan(PROFILES.vide, FIN);
  assert.deepEqual([b.medalled, b.crystals, b.goals, b.beaten, b.time, b.timed, b.ended, b.complete, b.timeComplete], [0, 0, 0, 0, 0, 0, false, false, false]);
  assert.deepEqual(b.finale, { medal: null, time: null });
  assert.equal(careerBilan([], -1).total, 0);
  const h = careerBilan(PROFILES.moitie, FIN);
  assert.equal(h.medalled, PROFILES.moitie.filter((x) => x.medal).length);
  assert.equal(h.goals, PROFILES.moitie.filter((x) => x.goal).length);
});
test('les valeurs étranges ne cassent rien : temps nul, négatif, non fini, médaille inconnue, entrée vide', () => {
  const b = careerBilan([{ medal: 'or', time: 0, goal: true }, { medal: 'x', time: -3 }, { medal: 'bronze', time: Infinity }, null, { medal: 'cristal', time: 10.5 }], -1);
  assert.deepEqual([b.medals.or, b.medals.bronze, b.medals.cristal, b.goals, b.time, b.timed], [1, 1, 1, 1, 10.5, 1]);
});
test('temps cumulé écrit en heures, minutes, secondes, séparateur décimal de la langue ; ne perd pas la seconde', () => {
  assert.equal(formatSpan(0), '0,000 s');
  assert.equal(formatSpan(59.9996), '1 min 00,000 s');
  assert.equal(formatSpan(75.5), '1 min 15,500 s');
  assert.equal(formatSpan(3600 + 23 * 60 + 45.678), '1 h 23 min 45,678 s');
  assert.equal(formatSpan(3600 + 23 * 60 + 45.678, 'en'), '1 h 23 min 45.678 s');
  assert.equal(formatSpan(7200), '2 h 00 min 00,000 s');
  assert.equal(formatSpan(NaN), '0,000 s');
});

console.log('Une seule fois, fusion des appareils');
test('conclusion vue : un profil qui ne l’a pas vue ne porte aucun champ ; la fusion de deux appareils garde la PLUS ANCIENNE date, dans les deux sens', () => {
  assert.equal(endingSeen({}), false); assert.equal(endingSeen({ endSeen: 0 }), false); assert.equal(endingSeen({ endSeen: 5 }), true);
  assert.deepEqual(mergeProgress({}, {}), {}, 'rien d’ajouté à un profil qui n’en avait pas');
  assert.equal(mergeProgress({ endSeen: 900 }, { endSeen: 400 }).endSeen, 400);
  assert.equal(mergeProgress({ endSeen: 400 }, { endSeen: 900 }).endSeen, 400);
  assert.equal(mergeProgress({ endSeen: 400 }, {}).endSeen, 400, 'vue sur un seul appareil : vue partout');
  assert.equal('endSeen' in mergeProgress({ endSeen: 'x' }, { endSeen: -4 }), false, 'valeurs abîmées ignorées');
  const m = mergeProfile({ coins: 1, endSeen: 900 }, { coins: 1 }), n = mergeProfile({ coins: 1 }, { coins: 1, endSeen: 700 });
  assert.equal(m.endSeen, 900); assert.equal(n.endSeen, 700);
  assert.equal(mergeProfile({ coins: 1, endSeen: 900 }, { coins: 1, endSeen: 100 }).endSeen, 100);
});
test('le champ du profil survit à un enregistrement / une relecture (profil réel), et se retrouve dans l’export des données et la sauvegarde partagée', () => {
  const p = profile(); p.endSeen = 4242; saveProfile();
  assert.equal(profile().endSeen, 4242);
  // le profil entier part dans les sauvegardes et l’export (clé « profile » : ni propre à l’appareil, ni filtrée champ par champ) : storage.DEVICE_ONLY_KEYS ne contient pas de clé de progression
  const stor = read('js/storage.js');
  assert.doesNotMatch(stor.match(/SECRET_DEVICE_KEYS\s*=\s*\[[^\]]*\]/)[0], /profile|endSeen/);
  assert.match(read('js/cloudsave.js'), /mergeProgress\(a, b\)/);
  delete p.endSeen; saveProfile();
});

console.log('Interface, textes, accessibilité');
test('le message de fin abrupt a disparu (français et anglais) ; les textes de la conclusion existent dans les deux langues', async () => {
  const scr = read('js/app/screens.js');
  assert.doesNotMatch(scr, /plus rien à finir/);
  assert.doesNotMatch(read('js/i18n/en/shell.js'), /plus rien à finir/);
  const en = (await import('../js/i18n/en/shell.js')).default;
  const app = read('js/app/ending.js');
  const needed = ['Carrière terminée', 'Carrière complète', 'Épreuve finale', 'Bilan de la carrière', 'Circuits terminés', 'Temps cumulé de tes meilleurs temps', 'Médailles de cristal', 'Médailles d’or', 'Médailles d’argent', 'Médailles de bronze',
    'Temps du pilote automatique battus', 'Objectifs bonus réussis', 'Courses terminées', 'Niveau du pilote', 'Générique', 'Crédits et licences', 'Rejouer l’épreuve finale', '▶ Épreuve finale', '🎬 Voir la conclusion de la carrière', '🎬 Revoir la conclusion de la carrière'];
  const missing = needed.filter((k) => !app.includes(k) && !scr.includes(k));
  assert.deepEqual(missing, [], 'textes attendus dans le code');
  const { default: hub } = await import('../js/i18n/en/hub.js');
  const miss = needed.filter((k) => !(k in en) && !(k in hub));
  assert.deepEqual(miss, [], 'traductions anglaises manquantes : ' + miss.join(' | '));
  const lines = credits(N, 14);
  for (const c of lines) { const k = (c.h || c.t).replace('{n}', '{n:w}').replace('{c}', '{c:w}'); assert.ok(k in en || k in hub || k === 'Trackigami', 'générique non traduit : ' + k); }
});
test('le générique ne contient aucun nombre écrit en dur : le nombre de circuits et de chapitres vient du jeu', () => {
  const a = credits(7, 3), b = credits(84, 14);
  assert.deepEqual(a.filter((c) => c.n == null), b.filter((c) => c.n == null), 'seule la ligne à valeurs change avec le jeu');
  assert.deepEqual(a.filter((c) => c.n != null).map((c) => [c.n, c.c]), [[7, 3]]);
  assert.doesNotMatch(a.find((c) => c.n != null).t, /\d/, 'le modèle ne contient aucun chiffre');
  assert.deepEqual(credits(84, 14).find((c) => c.n != null), { t: '{n} circuits officiels en {c} chapitres.', n: 84, c: 14 });
});
test('animations réduites : le défilement du générique est coupé par la classe « reduce-motion » du corps (réglage Accessibilité ou système) et le texte reste lisible (défilable à la main)', () => {
  const css = read('css/style.css');
  assert.match(css, /body\.reduce-motion \.end-credits \.roll \{ animation: none/);
  assert.match(css, /body\.reduce-motion \.end-credits \{ overflow-y: auto/);
  assert.match(read('js/app/settings.js'), /classList\.toggle\('reduce-motion'/);
  assert.match(read('js/app/ending.js'), /role="region"[^>]*aria-label="Générique"/);
});
test('la conclusion n’appelle aucun réseau, ne touche à aucun record, à aucune physique ni à aucun circuit', () => {
  for (const f of ['js/ending.js', 'js/app/ending.js']) assert.doesNotMatch(read(f).replace(/\/\/.*$/gm, ''), /fetch\(|XMLHttpRequest|online\.|WebSocket|submit|\.rest\(|setRecord|saveRecord/, f);
  const imports = [...read('js/ending.js').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['./medals.js'], 'le module pur ne dépend que des médailles');
  assert.deepEqual(MEDALS.map((m) => m.id), ['cristal', 'or', 'argent', 'bronze']);
});

await finish('Tous les tests de la fin de carrière passent.');
