// Amorces officielles et rival juste devant, côté client (COMPLETE-010, js/online/officials.js) : node tools/test-officiels-client.mjs   (npm test)
//   - quelle clé porte les amorces (circuit de la carrière ; saison, duel, tournoi : la clé de base ; une variante qui change la course : aucune) ;
//   - « rival juste devant » : premier du classement, dernier, ex æquo, sans joueurs réels, sans temps à moi, devant tout le monde ;
//   - avec un faux serveur (tools/fake-supabase.mjs, option social) : lectures SANS session, aucun joueur anonyme créé, les commandes jamais demandées ; étape 23 absente :
//     aucune amorce, aucune erreur, retenu (pas une requête par fiche) ; cache ; les étiquettes « Officiel » partout, traduites en anglais.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device, srv, resetSocial } from './fake-supabase.mjs';

device('O');
const O = await import('../js/online/officials.js');
const { online } = await import('../js/online.js');
const { PHYS_VER } = await import('../js/version.js');

const K = 'b-eclats-1ocqc5y';
const OFFS = [
  { source: 'auto', level: 'cristal', time: 45.8 }, { source: 'auto', level: 'or', time: 48.108 },
  { source: 'auto', level: 'argent', time: 55.4 }, { source: 'auto', level: 'bronze', time: 65.008 },
];
const reset = () => { srv.calls.length = 0; O.resetOfficialCache(); };
const signups = () => srv.calls.filter((c) => c.path === '/auth/v1/signup').length;

console.log('Clé des amorces');
test('circuit de la carrière : sa clé ; saison, duel, tournoi : la clé de base (même circuit) ; une variante qui change la course, un circuit de joueur, le défi du jour : aucune', () => {
  assert.equal(O.officialKeyOf(K), K);
  assert.equal(O.officialKeyOf(K + '~v1.sea-3'), K);
  assert.equal(O.officialKeyOf(K + '~v1.duel-12'), K);
  assert.equal(O.officialKeyOf(K + '~v1.tour-4'), K);
  assert.equal(O.officialKeyOf(K + '~v1.veh-moto'), null);
  assert.equal(O.officialKeyOf(K + '~v1.lap-2'), null);
  assert.equal(O.officialKeyOf(K + '~v1.as-1'), null, 'la catégorie « assisté » est un classement à part');
  assert.equal(O.officialKeyOf(K + '~v1.sea-03'), null, 'variante mal écrite');
  assert.equal(O.officialKeyOf('u-abc123'), null);
  assert.equal(O.officialKeyOf('daily-2026-11-27'), null);
});

console.log('Rival juste devant (choix)');
const REAL = (name, time, place) => ({ name, time, place, ghost: 'GG', ghost_veh: [] });
test('un vrai joueur devant passe AVANT les amorces, même si une amorce est plus proche', () => {
  const r = O.pickRivalAhead({ myTime: 50, real: REAL('Ana', 47, 3), officials: OFFS });
  assert.equal(r.kind, 'player'); assert.equal(r.name, 'Ana'); assert.equal(r.time, 47); assert.equal(r.place, 3); assert.equal(r.ghost, 'GG');
});
test('premier du classement (aucun joueur devant) : l’amorce immédiatement plus rapide que moi', () => {
  const r = O.pickRivalAhead({ myTime: 50, real: null, officials: OFFS });
  assert.equal(r.kind, 'official'); assert.equal(r.row.level, 'or'); assert.equal(r.name, 'Officiel · automatique (or)');
});
test('dernier du classement : le joueur juste au-dessus (celui que la base renvoie)', () => {
  const r = O.pickRivalAhead({ myTime: 90, real: REAL('Zoé', 70, 12), officials: OFFS });
  assert.equal(r.kind, 'player'); assert.equal(r.name, 'Zoé'); assert.equal(r.place, 12);
});
test('ex æquo : un temps égal n’est pas devant (ni un joueur, ni une amorce)', () => {
  assert.equal(O.pickRivalAhead({ myTime: 48.108, real: REAL('Bob', 48.108, 2), officials: OFFS }).row.level, 'cristal', 'Bob ex æquo et l’or ex æquo sont ignorés');
  assert.equal(O.pickRivalAhead({ myTime: 45.8, real: null, officials: OFFS }), null, 'à égalité avec le cristal : personne devant');
});
test('sans joueurs réels : les amorces ; au milieu des niveaux, la plus proche devant', () => {
  assert.equal(O.pickRivalAhead({ myTime: 60, officials: OFFS }).row.level, 'argent');
  assert.equal(O.pickRivalAhead({ myTime: 100, officials: OFFS }).row.level, 'bronze');
});
test('sans temps à moi : l’amorce la plus lente, pour commencer ; sans amorce ni temps : rien', () => {
  const r = O.pickRivalAhead({ myTime: null, officials: OFFS });
  assert.equal(r.row.level, 'bronze'); assert.equal(r.first, true);
  assert.equal(O.pickRivalAhead({ myTime: null, officials: [] }), null);
});
test('devant tout le monde (plus rapide que le cristal, aucun joueur devant) : rien', () => {
  assert.equal(O.pickRivalAhead({ myTime: 40, real: null, officials: OFFS }), null);
});
test('dans un classement, une amorce n’est montrée que dans la partie affichée (sinon elle paraîtrait devant des joueurs cachés)', () => {
  const top = Array.from({ length: 10 }, (_, i) => ({ time: 44 + i }));
  assert.deepEqual(O.officialsInBoard(OFFS, top, 30).map((o) => o.level), ['cristal', 'or']);
  assert.deepEqual(O.officialsInBoard(OFFS, top, 10).map((o) => o.level), ['cristal', 'or', 'argent', 'bronze'], 'tout le classement est affiché : toutes');
  assert.deepEqual(O.officialsInBoard(OFFS, [], 0).map((o) => o.level), ['cristal', 'or', 'argent', 'bronze'], 'personne n’a couru : toutes');
});

console.log('Faux serveur (lectures publiques)');
const SCORES = [
  { track_key: K, player: 'p-dave', name: 'Dave', time: 47, ghost: 'GD', updated_at: '2026-11-15T10:00:00Z' },
  { track_key: K, player: 'p-bob', name: 'Bob', time: 48, ghost: 'GB', updated_at: '2026-11-24T10:00:00Z' },
  { track_key: K, player: 'p-erin', name: 'Erin', time: 48, ghost: 'GE', updated_at: '2026-11-25T10:00:00Z' },
  { track_key: K, player: 'p-carl', name: 'Carl', time: 52, ghost: null },
];
const OFF_ROWS = OFFS.map((o) => ({ track_key: K, ...o, ghost: 'OG-' + o.level }));
await test('sans session : amorces et rival juste devant se lisent avec la clé publique, aucun joueur anonyme créé, les commandes jamais demandées', async () => {
  reset(); online.session = null;
  const S = resetSocial({ scores: SCORES, officials: OFF_ROWS });
  const rows = await O.officialRuns(K, PHYS_VER);
  assert.deepEqual(rows.map((r) => r.level), ['cristal', 'or', 'argent', 'bronze']);
  assert.ok(rows.every((r) => r.official === true));
  const r = await O.rivalAhead(K, PHYS_VER, 50);
  assert.equal(r.kind, 'player'); assert.equal(r.name, 'Erin'); assert.equal(r.place, 2, 'Erin et Bob ex æquo à 48 s : la plus récente, classée juste au-dessus');
  assert.equal(signups(), 0, 'aucune inscription anonyme');
  assert.ok(S.calls.every((c) => !c.auth), 'aucune requête ne porte de session');
  assert.ok(S.calls.filter((c) => c.path).every((c) => !/inputs/.test(c.query)), 'les commandes ne sont jamais demandées');
  const g = await O.officialGhost(K + '~v1.sea-3', 'auto', 'or', PHYS_VER);
  assert.deepEqual(g, { name: 'Officiel · automatique (or)', time: 48.108, ghost: 'OG-or', veh: [], official: true, source: 'auto', level: 'or' });
});
await test('premier du classement en ligne (aucun joueur devant) : l’amorce juste devant ; sans joueurs du tout : les amorces', async () => {
  reset(); resetSocial({ scores: SCORES, officials: OFF_ROWS });
  const r = await O.rivalAhead(K, PHYS_VER, 46);
  assert.equal(r.kind, 'official'); assert.equal(r.row.level, 'cristal');
  reset(); resetSocial({ scores: [], officials: OFF_ROWS });
  assert.equal((await O.rivalAhead(K, PHYS_VER, 60)).row.level, 'argent');
  assert.equal((await O.rivalAhead(K, PHYS_VER, null)).row.level, 'bronze');
});
await test('dernier du classement en ligne : le joueur juste au-dessus ; un joueur sans fantôme est sauté', async () => {
  reset(); resetSocial({ scores: SCORES, officials: OFF_ROWS });
  assert.equal((await O.rivalAhead(K, PHYS_VER, 70)).name, 'Erin', 'Carl (52 s) n’a pas de fantôme');
  assert.equal((await O.rivalAhead(K, PHYS_VER, 48)).name, 'Dave', 'ex æquo avec Bob et Erin : le rival est Dave');
});
await test('sans temps à moi : aucune demande de rival au serveur (rien à comparer), seulement les amorces', async () => {
  reset(); const S = resetSocial({ scores: SCORES, officials: OFF_ROWS });
  await O.rivalAhead(K, PHYS_VER, null);
  assert.equal(S.calls.filter((c) => c.fn === 'rival_ahead').length, 0);
});
await test('cache : la même fiche rouverte ne relit pas les amorces (10 min)', async () => {
  reset(); const S = resetSocial({ scores: SCORES, officials: OFF_ROWS });
  await O.officialRuns(K, PHYS_VER); await O.officialRuns(K + '~v1.sea-3', PHYS_VER); await O.officialRuns(K, PHYS_VER);
  assert.equal(S.calls.filter((c) => c.path === '/rest/v1/official_runs').length, 1);
});
await test('une variante qui change la course : aucune requête, aucune amorce', async () => {
  reset(); const S = resetSocial({ scores: SCORES, officials: OFF_ROWS });
  assert.deepEqual(await O.officialRuns(K + '~v1.veh-moto', PHYS_VER), []);
  assert.equal(await O.officialGhost(K + '~v1.veh-moto', 'auto', 'or', PHYS_VER), null);
  assert.equal(S.calls.length, 0);
});
await test('étape 23 absente sur le serveur : aucune amorce, aucune erreur, aucun rival en ligne ; l’absence est retenue (une seule requête)', async () => {
  reset(); srv.social = null;
  assert.deepEqual(await O.officialRuns(K, PHYS_VER), []);
  assert.equal(await O.rivalAhead(K, PHYS_VER, 50), null);
  assert.deepEqual(await O.officialRuns('b-canyon-ymt2z', PHYS_VER), []);
  assert.equal(srv.calls.filter((c) => /official_runs|rival_ahead/.test(c.path)).length, 1, 'une seule requête : l’absence est retenue');
  assert.equal(signups(), 0);
});
await test('une panne réseau remonte (elle n’est pas prise pour une étape absente)', async () => {
  reset(); resetSocial({ scores: SCORES, officials: OFF_ROWS }); srv.offline = true;
  try { await assert.rejects(O.officialRuns(K, PHYS_VER), /injoignable|connexion/i); } finally { srv.offline = false; }
});

console.log('Étiquettes');
await test('chaque amorce est nommée « Officiel » (automatique ou testeur), et chaque libellé a sa traduction anglaise', async () => {
  for (const l of O.OFFICIAL_LEVELS) assert.match(O.officialName({ source: 'auto', level: l }), /^Officiel · automatique \(/);
  assert.equal(O.officialName({ source: 'testeur', pilot: 'Ana', level: 'ana' }), 'Officiel · testeur Ana');
  assert.equal(O.officialBadge({ source: 'auto' }), 'Officiel · automatique');
  const I = await import('../js/i18n.js');
  const en = (await import('../js/i18n/en.js')).default;
  I.resetDictionary(); I.register(en); I.setLang('en');
  try {
    assert.equal(I.translate(O.officialName({ source: 'auto', level: 'or' })), 'Official · autopilot (gold)');
    assert.equal(I.translate(O.officialName({ source: 'auto', level: 'cristal' })), 'Official · autopilot (crystal)');
    assert.equal(I.translate(O.officialName({ source: 'testeur', pilot: 'Ana' })), 'Official · tester Ana');
    const { readFileSync } = await import('node:fs');
    const texts = [];
    for (const f of ['../js/online/officials.js', '../js/ui/leaderboardPanel.js', '../js/app/competition.js']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ [^'`\n]*$/gm, '');          // (sans les commentaires)
      for (const m of src.matchAll(/(Officiel[^'`<]*|hors classement|Hors classement|🎯 [^<]+|🏆 Personne[^<]+|Contre un fantôme officiel|\(entraînement[^<]+\)|Les lignes « Officiel »[^<]+|Les amorces officielles[^<]+|Niveau (?:bronze|argent|or|cristal)|Le fantôme du pilote automatique[^<]+|Pas encore de fantôme officiel[^']+|Affronter ce fantôme[^"]*|Aucun joueur classé[^<]+)/g)) texts.push(m[1].replace(/\$\{[^}]*\}.*$/, '').trim());
    }
    const missing = [...new Set(texts)].filter((t) => t.length > 3 && !/[{$]/.test(t) && I.translate(t) === t);
    assert.deepEqual(missing, [], 'libellés sans traduction anglaise');
    assert.ok(texts.length >= 15, 'le test voit bien les libellés (' + texts.length + ')');
  } finally { I.resetDictionary(); I.setLang('fr'); }
});

finish('Amorces et rival juste devant : clés, choix du rival, lectures publiques sans joueur anonyme, étape absente, étiquettes.');
