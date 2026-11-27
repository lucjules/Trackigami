// Boîte de réception, côté client (COMPLETE-015, js/inbox.js) : node tools/test-boite.mjs   (npm test)
//   - SANS session sur l'appareil : aucune requête (pas même une inscription anonyme : la boîte ne crée jamais de joueur pour lire) ;
//   - avec une session : UNE requête (inbox_summary, avec la date de dernière consultation), puis le cache pendant quelques minutes ; une session périmée est renouvelée,
//     jamais remplacée par une nouvelle identité ;
//   - date de dernière consultation : gardée sur l'appareil, par identité ; non lus = après cette date (un duel qui attend reste) ; 20 éléments au plus ;
//   - étape 23 absente : une erreur lisible, aucune nouvelle identité ;
//   - textes : chaque type d'événement a sa phrase française et sa traduction anglaise exacte.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device, srv, session, resetSocial } from './fake-supabase.mjs';

device('B');
const { online } = await import('../js/online.js');
const IB = await import('../js/inbox.js');

const fresh = () => { device('B' + ++fresh.n); online.useGuest(); online.session = null; online.player = null; online._authP = null; srv.calls.length = 0; IB.resetInboxCache(); };
fresh.n = 0;
const signIn = (id, expired = false) => { const s = session({ id, anon: true }); online.session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (expired ? -10 : 3600), user: { id } }; return s; };
const inboxCalls = () => srv.calls.filter((c) => c.path === '/rest/v1/rpc/inbox_summary');
const NOW = Date.parse('2026-11-27T12:00:00Z');
const ITEMS = [
  { kind: 'beaten', at: '2026-11-27T10:00:00Z', track_key: 'b-eclats-1ocqc5y', track_name: 'Éclats', who: 'Erin', my_time: 50, their_time: 48, n: 1 },
  { kind: 'duel', at: '2026-11-10T09:00:00Z', track_key: 'b-canyon-ymt2z', track_name: 'Canyon', who: 'Bob', ref: 12 },
  { kind: 'season', at: '2026-11-23T00:00:00Z', ref: 3 },
  { kind: 'follow', at: '2026-11-26T08:00:00Z', track_id: '00000000-0000-4000-8000-00000000f201', track_name: 'Nouveau d’Erin', who: 'Erin' },
];

console.log('Sans session');
await test('aucune session sur l’appareil : aucune requête, rien d’inscrit (ni la boîte, ni une session anonyme)', async () => {
  fresh(); resetSocial({ inbox: {} });
  assert.equal(online.hasStoredSession(), false);
  assert.equal(await IB.loadInbox(), null);
  assert.equal(await online.inbox(new Date().toISOString()), null);
  assert.equal(IB.cachedInbox(), null);
  assert.equal(srv.calls.length, 0, 'pas une seule requête');
  assert.equal(online.session, null, 'aucune session créée');
});

console.log('Avec une session');
await test('une requête, avec la date de dernière consultation (première fois : la dernière semaine) ; puis le cache, sans requête', async () => {
  fresh(); signIn('anon-ana'); resetSocial({ inbox: { 'anon-ana': ITEMS } });
  const r = await IB.loadInbox({ now: NOW });
  assert.equal(inboxCalls().length, 1);
  assert.equal(inboxCalls()[0].body.depuis, '2026-11-20T12:00:00.000Z', 'première ouverture : 7 jours');
  assert.deepEqual(r.items.map((x) => x.kind), ['beaten', 'duel', 'season', 'follow']);
  await IB.loadInbox({ now: NOW + 60000 }); await IB.loadInbox({ now: NOW + 4 * 60000 });
  assert.equal(inboxCalls().length, 1, 'cache : rouvrir le menu ne redemande pas');
  assert.ok(IB.cachedInbox(NOW + 60000));
  await IB.loadInbox({ now: NOW + IB.INBOX_CACHE_MS + 1 });
  assert.equal(inboxCalls().length, 2, 'cache périmé : une nouvelle requête');
  assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0);
});
await test('dernière consultation : gardée par identité ; non lus = après elle, le duel qui attend reste', async () => {
  fresh(); signIn('anon-ana'); resetSocial({ inbox: { 'anon-ana': ITEMS } });
  const r = await IB.loadInbox({ now: NOW });
  assert.deepEqual(IB.unread(r.items, r.since).map((x) => x.kind), ['beaten', 'duel', 'season', 'follow']);
  IB.markInboxSeen('anon-ana', Date.parse('2026-11-26T12:00:00Z'));
  const since = IB.inboxSince('anon-ana', NOW);
  assert.equal(since, '2026-11-26T12:00:00.000Z');
  assert.deepEqual(IB.unread(r.items, since).map((x) => x.kind), ['beaten', 'duel'], 'après la consultation : le temps battu depuis, et le duel qui attend toujours');
  assert.equal(IB.inboxSince('autre-identite', NOW), '2026-11-20T12:00:00.000Z', 'une autre identité a sa propre date');
  assert.equal(IB.inboxSince('anon-ana', Date.parse('2026-11-01T00:00:00Z')), '2026-10-25T00:00:00.000Z', 'une date dans le futur (horloge reculée) est ignorée');
  IB.resetInboxCache();
  await IB.loadInbox({ now: NOW });
  assert.equal(inboxCalls().at(-1).body.depuis, '2026-11-26T12:00:00.000Z', 'la requête suivante part de la dernière consultation');
});
await test('20 éléments au plus, même si le serveur en renvoyait davantage ; une ligne inconnue est ignorée', async () => {
  fresh(); signIn('anon-max'); resetSocial({ inbox: {} });
  const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'follow', at: `2026-11-27T0${i % 10}:00:00Z`, track_id: '00000000-0000-4000-8000-0000000000' + String(i).padStart(2, '0'), track_name: 'C' + i, who: 'Erin' }));
  const orig = online.inbox;
  online.inbox = async () => [{ kind: 'piratage', at: '2026-11-27T11:00:00Z' }, ...many];          // (un serveur qui ne bornerait pas : le client borne quand même)
  try {
    const r = await IB.loadInbox({ now: NOW });
    assert.ok(r.items.length <= IB.INBOX_MAX, r.items.length + ' éléments');
    assert.ok(r.items.every((x) => x.kind === 'follow'), 'type inconnu ignoré');
  } finally { online.inbox = orig; }
});
await test('session périmée : renouvelée (même identité), jamais remplacée par une nouvelle ; un jeton refusé : aucune nouvelle identité, aucune requête de boîte', async () => {
  fresh(); signIn('anon-old', true); resetSocial({ inbox: { 'anon-old': ITEMS } });
  const r = await IB.loadInbox({ now: NOW });
  assert.equal(r.items.length, 4);
  assert.equal(online.uid, 'anon-old');
  assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0);
  fresh(); signIn('anon-revoque', true); srv.refreshFails = true;
  try {
    assert.equal(await IB.loadInbox({ now: NOW }), null);
    assert.equal(inboxCalls().length, 0);
    assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0, 'lire ne crée jamais de joueur');
  } finally { srv.refreshFails = false; }
});
await test('étape 23 absente : erreur lisible (« étape SQL »), aucune nouvelle identité', async () => {
  fresh(); signIn('anon-x'); srv.social = null;
  await assert.rejects(IB.loadInbox({ now: NOW }), (e) => e.code === 'no-sql-step');
  assert.equal(srv.calls.filter((c) => c.path === '/auth/v1/signup').length, 0);
});

console.log('Textes');
await test('une phrase par type d’événement, et sa traduction anglaise exacte', async () => {
  const I = await import('../js/i18n.js');
  const en = (await import('../js/i18n/en.js')).default;
  const { formatTime } = await import('../js/storage.js');
  const name = () => 'Premiers Éclats';
  const cases = [
    [{ kind: 'beaten', who: 'Erin', n: 1, myTime: 50, theirTime: 48 }, `Erin a battu ton temps sur Premiers Éclats : ${formatTime(48)} contre ${formatTime(50)}.`, `Erin beat your time on First Sparks: ${formatTime(48)} against ${formatTime(50)}.`],
    [{ kind: 'beaten', who: 'Erin', n: 2 }, 'Erin et un autre pilote ont battu ton temps sur Premiers Éclats.', 'Erin and another driver beat your time on First Sparks.'],
    [{ kind: 'beaten', who: 'Erin', n: 4 }, 'Erin et 3 autres pilotes ont battu ton temps sur Premiers Éclats.', 'Erin and 3 other drivers beat your time on First Sparks.'],
    [{ kind: 'duel', who: 'Bob' }, 'Bob te défie en duel sur Premiers Éclats.', 'Bob challenges you to a duel on First Sparks.'],
    [{ kind: 'duel_win', who: 'Bob', n: 16 }, 'Duel gagné contre Bob sur Premiers Éclats (Elo +16).', 'Duel won against Bob on First Sparks (Elo +16).'],
    [{ kind: 'duel_loss', who: 'Bob', n: -16 }, 'Duel perdu contre Bob sur Premiers Éclats (Elo -16).', 'Duel lost against Bob on First Sparks (Elo -16).'],
    [{ kind: 'duel_draw', who: 'Bob' }, 'Duel nul contre Bob sur Premiers Éclats.', 'Duel drawn against Bob on First Sparks.'],
    [{ kind: 'season', ref: 3 }, 'La saison 3 a commencé : trois nouveaux circuits.', 'Season 3 has started: three new tracks.'],
    [{ kind: 'season_end', ref: 2, n: -1, m: 4 }, 'Saison 2 terminée : tu montes en division 4 (Amateur).', 'Season 2 is over: you move up to division 4 (Amateur).'],
    [{ kind: 'season_end', ref: 2, n: 1, m: 3 }, 'Saison 2 terminée : tu descends en division 3 (Confirmé).', 'Season 2 is over: you move down to division 3 (Skilled).'],
    [{ kind: 'season_end', ref: 2, n: 0, m: 5 }, 'Saison 2 terminée : tu restes en division 5 (Débutant).', 'Season 2 is over: you stay in division 5 (Beginner).'],
    [{ kind: 'follow', who: 'Erin', trackName: 'Nouveau d’Erin' }, 'Erin a publié un nouveau circuit : Nouveau d’Erin.', 'Erin published a new track: Nouveau d’Erin.'],
  ];
  I.resetDictionary(); I.register(en); I.setLang('en');
  try {
    for (const [it, fr, eng] of cases) {
      const t = IB.inboxText(it, it.kind === 'follow' ? (x) => x.trackName : name);
      assert.equal(t, fr);
      assert.equal(I.translate(t), eng);
    }
    for (const t of ['📬 Boîte de réception', 'Boîte de réception', 'Rien de nouveau depuis ta dernière visite.', 'Déjà vu', 'Répondre', 'Voir le circuit', 'Voir la saison',
      'La boîte de réception suit tes temps en ligne : qui bat ton temps, tes duels, les saisons, les circuits des auteurs que tu suis.',
      'Elle s’ouvrira dès que tu auras envoyé un temps au classement ou créé un compte.', 'Boîte de réception : 3 nouveautés', 'Boîte de réception : 1 nouveauté',
      'Ce que les autres pilotes ont fait depuis ta dernière visite (30 jours au plus, 20 éléments). Seuls des pseudos, des temps et des circuits publiés y figurent.']) assert.notEqual(I.translate(t), t, t);
  } finally { I.resetDictionary(); I.setLang('fr'); }
  assert.equal(Object.keys(IB.INBOX_ICONS).length, 8, 'chaque type a son icône');
});

finish('Boîte de réception : aucune requête sans session, une requête puis le cache, date de consultation par identité, 20 éléments au plus, textes traduits.');
