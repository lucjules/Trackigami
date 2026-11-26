// Fin de carrière (COMPLETE-013) : définition de « carrière complète », bilan exact, écran de fin affiché une fois, fusion entre appareils, texte anglais.
// node tools/test-fin-carriere.mjs   (npm test). L'affichage dans un vrai navigateur (deux langues, animations réduites) : tools/test-browser-fin-carriere.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { device } from './fake-supabase.mjs';

device('A');
const { BUILTIN_TRACKS } = await import('../js/tracks.js');
const { getRecord, saveRecord, medalTime, clearRecords } = await import('../js/storage.js');
const { medalFor, MEDALS } = await import('../js/medals.js');
const { profile, saveProfile } = await import('../js/profile.js');
const { goalDone } = await import('../js/career.js');
const { careerRows, careerReport, shouldShowCareerEnd, markCareerEnd, careerEndSeen, mergeCareerEnd, FINALE_ID } = await import('../js/careerEnd.js');
const { mergeProfile } = await import('../js/cloudsave.js');
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const builtins = BUILTIN_TRACKS.map((def, i) => ({ def, key: `b-${def.id}-synth${i}` }));
const N = builtins.length;
// Profil synthétique : tier(i) = niveau de médaille voulu sur le circuit i (0 cristal … 3 bronze), null = pas de record ; goal(i) = objectif réussi.
function setup(tier, goal = () => false, races = 0) {
  const p = profile();
  clearRecords();
  p.goals = {}; p.stats = { races, earned: 0 }; delete p.careerEnd;
  builtins.forEach((b, i) => {
    const t = tier(i);
    if (t != null) { assert.ok(saveRecord(b.key, { time: b.def.medals[MEDALS[t].id] - 0.0001 * (i % 7), pv: 1, date: 1 })); }
    if (goal(i)) p.goals[b.key + '#goal'] = 1;
  });
  saveProfile();
  return p;
}
const rowsNow = () => careerRows(builtins, { getRecord, medalTime, medalFor, goalDone });
// Calcul INDÉPENDANT : directement depuis les records du disque et les seuils de médailles des circuits, sans passer par careerRows/careerReport.
function independent() {
  let ms = 0, timed = 0, med = 0, goals = 0;
  const by = { cristal: 0, or: 0, argent: 0, bronze: 0 };
  builtins.forEach((b) => {
    const raw = getRecord(b.key);
    if (raw) {
      const t = Math.min(raw.time, raw.bt > 0 ? raw.bt : raw.time);
      ms += Math.round(t * 1000); timed++;
      const tier = ['cristal', 'or', 'argent', 'bronze'].find((id) => t <= b.def.medals[id] + 1e-6);
      if (tier) { by[tier]++; med++; }
    }
    if (profile().goals[b.key + '#goal']) goals++;
  });
  return { ms, timed, med, goals, by };
}

console.log('Définition et bilan');
test('l’épreuve finale est un circuit existant (« Grande Finale », le dernier) ; il y a 84 circuits', () => {
  assert.equal(N, 84);
  const f = builtins.filter((b) => b.def.id === FINALE_ID);
  assert.equal(f.length, 1); assert.equal(f[0].def.name, 'Grande Finale'); assert.equal(builtins.indexOf(f[0]), N - 1);
});
const cases = {
  'carrière vide': { tier: () => null, finished: false, complete: false },
  'carrière à moitié finie': { tier: (i) => (i < N / 2 ? 2 : null), goal: (i) => i % 3 === 0, races: 120, finished: false, complete: false },
  'carrière finie (bronze partout)': { tier: () => 3, races: 400, finished: true, complete: false },
  'carrière finie, un seul circuit sans médaille': { tier: (i) => (i === N - 1 ? null : 3), finished: false, complete: false },
  'carrière complète avec cristaux et objectifs': { tier: () => 0, goal: () => true, races: 999, finished: true, complete: true },
  'carrière mélangée (cristal, or, argent, bronze)': { tier: (i) => i % 4, goal: (i) => i % 2 === 0, races: 77, finished: true, complete: false },
};
for (const [name, c] of Object.entries(cases)) {
  test(`${name} : détection et bilan exacts (comparés à un calcul indépendant)`, () => {
    setup(c.tier, c.goal, c.races || 0);
    const r = careerReport(rowsNow(), profile().stats), ind = independent();
    assert.equal(r.total, N);
    assert.equal(r.finished, c.finished, 'carrière finie');
    assert.equal(r.complete, c.complete, 'carrière complète au sens strict');
    assert.equal(r.medals, ind.med); assert.deepEqual(r.byMedal, ind.by); assert.equal(r.crystal, ind.by.cristal);
    assert.equal(r.goals, ind.goals); assert.equal(r.timed, ind.timed);
    assert.equal(r.totalTime, ind.timed ? ind.ms / 1000 : null);
    assert.equal(r.races, c.races || 0);
    assert.equal(r.medals, Object.values(r.byMedal).reduce((a, b) => a + b, 0), 'les médailles par palier s’additionnent');
    assert.equal(r.finale.name, 'Grande Finale');
  });
}
test('le bilan ne dépend que des données locales : le module est pur (aucun réseau)', () => {
  const src = read('js/careerEnd.js') + read('js/app/careerEnd.js');
  assert.ok(!/fetch\(|XMLHttpRequest|online\.|WebSocket|sendBeacon/.test(src));
  assert.deepEqual(Object.keys(careerReport([], {})).includes('totalTime'), true);
  assert.equal(careerReport([], {}).finished, false, 'aucun circuit : jamais « finie »');
});

console.log('Écran de fin : une fois, rejouable');
test('il s’ouvre une seule fois (date gardée dans le profil), se rouvre à la demande, jamais avant la fin', () => {
  const p = setup(() => 3);
  const fin = careerReport(rowsNow(), p.stats).finished;
  assert.equal(shouldShowCareerEnd(p, fin), true);
  assert.equal(markCareerEnd(p, 12345), true); assert.equal(p.careerEnd, 12345);
  assert.equal(shouldShowCareerEnd(p, fin), false, 'déjà vu : plus tout seul');
  assert.equal(markCareerEnd(p, 99999), false); assert.equal(p.careerEnd, 12345, 'la date de la première fois ne bouge pas');
  assert.equal(careerEndSeen(p), true);
  const q = setup((i) => (i === 0 ? null : 3));
  assert.equal(shouldShowCareerEnd(q, careerReport(rowsNow(), q.stats).finished), false, 'carrière non finie : rien');
  for (const bad of [0, -5, NaN, 'x', null, undefined]) assert.equal(careerEndSeen({ careerEnd: bad }), false);
});
test('le câblage : ouverture à l’écran des circuits, bouton « Revoir » (circuits, Progression › Records), jamais pendant une fenêtre ouverte', () => {
  const scr = read('js/app/screens.js'), app = read('js/app/careerEnd.js'), prof = read('js/app/profile.js'), main = read('js/main.js');
  assert.match(scr, /this\._renderTracks\(\); this\._maybeCareerEnd\(\)/);
  assert.match(scr, /_careerEndButton\(box\)/); assert.match(prof, /_careerEndButton\(/);
  assert.match(main, /careerEndMethods/);
  assert.match(app, /classList\.contains\('hidden'\)/);
  assert.ok(!/Il n’y a plus rien à finir ici/.test(scr), 'le message de fin abrupt a disparu');
});

console.log('Fusion entre appareils');
test('careerEnd : la date la plus ancienne l’emporte, des deux côtés, dans les deux ordres ; rien d’ajouté à un profil qui n’en a pas', () => {
  const a = { id: 'X', careerEnd: 500, coins: 1 }, b = { id: 'X', careerEnd: 200, coins: 2 }, c = { id: 'X', coins: 3 };
  assert.equal(mergeProfile(a, b).careerEnd, 200); assert.equal(mergeProfile(b, a).careerEnd, 200);
  assert.equal(mergeProfile(a, c).careerEnd, 500); assert.equal(mergeProfile(c, a).careerEnd, 500);
  assert.equal('careerEnd' in mergeProfile(c, { id: 'X', coins: 4 }), false);
  assert.deepEqual(mergeCareerEnd({ careerEnd: 'x' }, { careerEnd: -3 }), {});
  assert.equal(mergeProfile({ ...a, careerEnd: 'abîmé' }, b).careerEnd, 200, 'une valeur abîmée est ignorée');
});
test('careerEnd est une donnée de progression du profil : elle suit le compte (profil synchronisé), n’est pas propre à l’appareil, et part dans l’export', async () => {
  const { DEVICE_ONLY_KEYS, dumpAll } = await import('../js/storage.js');
  assert.ok(!DEVICE_ONLY_KEYS.some((k) => /career/i.test(k)) && DEVICE_ONLY_KEYS.includes('vproof'));
  const p = setup(() => 3); markCareerEnd(p, 777); saveProfile();
  const dump = dumpAll({ portability: true });
  assert.match(dump.profile, /"careerEnd":777/);
});

console.log('Textes');
test('chaque texte français de l’écran de fin a sa traduction anglaise', async () => {
  const I = await import('../js/i18n.js');
  const { default: EN } = await import('../js/i18n/en.js').catch(() => ({ default: null }));
  const dict = EN || (await import('../js/i18n/en.js')).EN || {};
  I.resetDictionary(); I.register(dict); I.setLang('en');
  const src = read('js/app/careerEnd.js');
  for (const fr of ['🏁 Carrière accomplie', 'Bilan de ta carrière', 'Épreuve finale', 'Circuits terminés', 'Temps cumulé de tes meilleurs temps', 'Circuits chronométrés', 'Niveau du pilote', 'Générique',
    'Merci d’avoir joué jusqu’au bout !', '🏁 Rejouer l’épreuve finale', 'Crédits et licences', '🎬 Conclusion de la carrière', '🎬 Revoir la conclusion de la carrière',
    'Moteur 3D : three.js · Police : Chakra Petch', 'Musique et sons : synthétisés en direct par le jeu']) {
    assert.ok(src.includes(fr), 'texte présent dans l’écran : ' + fr);
    assert.notEqual(I.translate(fr), fr, 'non traduit : ' + fr);
  }
  assert.equal(I.translate('Tu as une médaille sur chacun des 84 circuits de la carrière : elle est terminée.'), 'You have a medal on each of the 84 career tracks: it is finished.');
  assert.equal(I.translate('Il te reste 3 circuits sans médaille pour terminer la carrière.'), '3 tracks still have no medal before the career is finished.');
  assert.equal(I.translate('✦ Carrière complète : 84 cristaux et 84 objectifs. Chaque circuit est maîtrisé.'), '✦ Career complete: 84 crystals and 84 goals. Every track is mastered.');
  I.resetDictionary(); I.setLang('fr');
});
test('animations réduites : le générique n’est plus animé (réglage de l’app et préférence système)', () => {
  const css = read('css/style.css');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.career-end \.ce-credits li \{ animation: none; opacity: 1; \} \}/);
  assert.match(css, /body\.reduce-motion \.career-end \.ce-credits li \{ animation: none; opacity: 1; \}/);
});

finish('Tous les tests de la fin de carrière passent.');
