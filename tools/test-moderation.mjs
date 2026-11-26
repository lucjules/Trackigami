// Modération (COMPLETE-004), côté client : node tools/test-moderation.mjs   (npm test)
// Le client ne protège rien : la base refuse tout non-modérateur (tools/test-etape22-sql.sh, avec la VRAIE base). Ce test vérifie ce que le client doit faire :
//   - n'annoncer « modérateur » que si la base l'a CONFIRMÉ pour la session de l'appareil (jamais présumé : erreur, étape SQL absente, hors ligne, sans session : « non ») ;
//   - ne JAMAIS créer de joueur invité pour le demander (aucune requête d'inscription) ni rien demander sans session ;
//   - refuser localement, avant tout réseau, une décision sans motif, un identifiant invalide ou une date passée (la base revérifie) ;
//   - passer les bons paramètres (pagination bornée) et ne jamais demander qui a signalé.
// Faux serveur : tools/fake-supabase.mjs (option moderation), qui applique les mêmes règles que la base. Source des textes : js/legal.js (engagements) vérifiés par test-legal.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device, srv, resetModeration } from './fake-supabase.mjs';

device('A');
const { online } = await import('../js/online.js');
const M = await import('../js/online/moderation.js');

const T1 = '00000000-0000-4000-8000-000000000001';
const U_AUTHOR = '00000000-0000-4000-8000-0000000000a1';
const items = () => [
  { kind: 'track', id: T1, label: 'Circuit signalé', author: U_AUTHOR, author_name: 'Carl', reports: 3, counted: 2, hidden: true, report_dates: ['2026-11-25T10:00:00Z', null] },
  { kind: 'comment', id: '7', label: 'un commentaire désagréable', author: U_AUTHOR, author_name: 'Carl', reports: 1, counted: 1, hidden: false },
  { kind: 'comment', id: '8', label: 'un autre', author: U_AUTHOR, author_name: 'Carl', reports: 2, counted: 2, hidden: false, seen: 2 },
];
const reset = (moderators = []) => { resetModeration({ moderators, items: items() }); srv.calls.length = 0; M.forgetModeratorStatus(); };
const modCalls = () => srv.calls.filter((c) => c.path.startsWith('/rest/v1/rpc/mod_'));
const signups = () => srv.calls.filter((c) => c.path === '/auth/v1/signup').length;
// Un joueur invité NEUF (l'appareil oublie son identité : sinon la session enregistrée serait reprise).
const forget = () => { const d = device('A'); d.local.m.clear(); d.session.m.clear(); online.session = null; };
const asGuest = async () => { forget(); await online.ensureSession(); return online.uid; };

console.log('Statut : la base le confirme, le client ne le présume jamais');
await test('sans session : « non », sans aucune requête (pas même d\'inscription d\'un joueur invité)', async () => {
  reset(); forget(); srv.calls.length = 0;
  assert.equal(await M.isModerator(), false);
  assert.equal(srv.calls.length, 0, 'aucune requête');
  assert.equal(signups(), 0);
});
await test('un joueur ordinaire : « non » (la base répond faux) ; un modérateur : « oui » ; le statut est lu pour la session de l\'appareil', async () => {
  reset(); const uid = await asGuest();
  assert.equal(await M.isModerator(), false);
  reset([uid]);
  assert.equal(await M.isModerator(), true);
  assert.equal(modCalls().length, 1); assert.equal(modCalls()[0].path, '/rest/v1/rpc/mod_status');
});
await test('étape SQL 22 absente (fonction introuvable), serveur en panne, hors ligne : « non », jamais d\'exception', async () => {
  reset(); const uid = await asGuest(); srv.moderators = null;
  resetModeration({ moderators: [uid] }); srv.moderation = false; M.forgetModeratorStatus();
  assert.equal(await M.isModerator(), false, 'étape absente');
  resetModeration({ moderators: [uid] }); M.forgetModeratorStatus(); srv.offline = true;
  assert.equal(await M.isModerator(), false, 'hors ligne');
  srv.offline = false; M.forgetModeratorStatus();
  assert.equal(await M.isModerator(), true, 'revenu en ligne');
});
await test('seul `true` vaut « oui » : une réponse quelconque (1, "true", objet) ne donne pas le statut', async () => {
  const uid = await asGuest(); reset([uid]);
  const orig = globalThis.fetch;
  for (const reply of [1, 'true', { ok: true }, null, []]) {
    M.forgetModeratorStatus();
    globalThis.fetch = async (url, init) => (String(url).includes('/rpc/mod_status') ? new Response(JSON.stringify(reply), { status: 200 }) : orig(url, init));
    assert.equal(await M.isModerator(), false, JSON.stringify(reply));
  }
  globalThis.fetch = orig;
});
await test('mémorisé par identité : une 2e demande ne repart pas, un autre compte repart et ne reprend pas le statut du précédent', async () => {
  const uid = await asGuest(); reset([uid]);
  assert.equal(await M.isModerator(), true); assert.equal(await M.isModerator(), true);
  assert.equal(modCalls().length, 1, 'une seule requête');
  await asGuest();                      // un autre joueur invité sur l'appareil
  assert.equal(await M.isModerator(), false, 'le statut de l\'ancien compte ne suit pas');
  const t0 = Date.now();
  const u2 = online.uid; resetModeration({ moderators: [u2] });
  assert.equal(await M.isModerator(t0), false, 'dans le délai : réponse mémorisée (non)');
  assert.equal(await M.isModerator(t0 + 6 * 60 * 1000), true, 'après 5 minutes, la base est interrogée de nouveau (un statut retiré ou accordé se voit)');
});

console.log('Un joueur ordinaire qui appelle quand même : la base refuse, le client ne contourne rien');
await test('chaque appel d\'un non-modérateur est refusé par le serveur (« Réservé aux modérateurs. ») et l\'état ne change pas', async () => {
  reset(); await asGuest();
  const hid = () => srv.mod.items.map((i) => i.hidden).join();
  const before = hid();
  await assert.rejects(() => M.queue(), /Accès refusé/);
  await assert.rejects(() => M.detail('track', T1), /Accès refusé/);
  await assert.rejects(() => M.reports('track', T1), /Accès refusé/);
  await assert.rejects(() => M.setHidden('track', T1, false, 'je veux le rétablir'), /Accès refusé/);
  await assert.rejects(() => M.suspend(U_AUTHOR, 'motif de test'), /Accès refusé/);
  await assert.rejects(() => M.unsuspend(U_AUTHOR, 'motif de test'), /Accès refusé/);
  await assert.rejects(() => M.suspensions(), /Accès refusé/);
  await assert.rejects(() => M.log(), /Accès refusé/);
  assert.equal(hid(), before); assert.equal(srv.mod.log.length, 0); assert.equal(srv.mod.suspensions.length, 0);
});

console.log('Un modérateur');
await test('la file : paramètres bornés, états et types validés, réponses remises en liste', async () => {
  const uid = await asGuest(); reset([uid]);
  const a = await M.queue(); assert.deepEqual(a.map((r) => r.id).sort(), [T1, '7'].sort(), 'à examiner : le commentaire déjà examiné (seen = reports) n\'y est pas');
  assert.equal((await M.queue({ state: 'hidden' })).length, 1);
  assert.equal((await M.queue({ state: 'all' })).length, 3);
  assert.equal((await M.queue({ kind: 'comment', state: 'all' })).length, 2);
  await M.queue({ limit: 100000, offset: -5 }); const last = modCalls().at(-1).body; assert.equal(last.lim, 100); assert.equal(last.off, 0);
  await M.queue({ limit: 0 }); assert.equal(modCalls().at(-1).body.lim, 1);
  await assert.rejects(() => M.queue({ kind: 'mode' }), /Type inconnu/); await assert.rejects(() => M.queue({ state: 'x' }), /État inconnu/);
});
await test('la fiche et les signalements : jamais l\'identité d\'un signalant (aucun champ ne la porte)', async () => {
  const uid = await asGuest(); reset([uid]);
  const d = await M.detail('track', T1); assert.equal(d.author.name, 'Carl'); assert.equal(d.hidden, true);
  const r = await M.reports('track', T1);
  assert.equal(r.length, 2);
  for (const x of r) assert.deepEqual(Object.keys(x).sort(), ['counted', 'reported_at']);
  await assert.rejects(() => M.detail('track', 'pas-un-uuid'), /Contenu inconnu/); await assert.rejects(() => M.detail('comment', 'abc'), /Contenu inconnu/); await assert.rejects(() => M.detail('mode', '1'), /Contenu inconnu/);
  assert.equal(modCalls().filter((c) => c.path.includes('mod_detail')).length, 1, 'les identifiants invalides ne partent pas au réseau');
});
await test('masquer / rétablir : motif obligatoire contrôlé AVANT le réseau (3 à 300 caractères, blancs réduits) ; le serveur applique, journalise et refuse l\'état déjà atteint', async () => {
  const uid = await asGuest(); reset([uid]);
  const n0 = modCalls().length;
  for (const bad of [undefined, null, '', '  ', 'ab', 'x'.repeat(301)]) await assert.rejects(() => M.setHidden('comment', '7', true, bad), /motif de 3 à 300/);
  assert.equal(modCalls().length, n0, 'rien n\'est parti');
  assert.equal(M.cleanReason('  Insultes \n  répétées '), 'Insultes répétées');
  await M.setHidden('comment', '7', true, '  Propos   injurieux ');
  assert.equal(srv.mod.items.find((i) => i.id === '7').hidden, true);
  assert.equal(modCalls().at(-1).body.why, 'Propos injurieux'); assert.equal(modCalls().at(-1).body.c, 7, 'identifiant de commentaire numérique');
  await assert.rejects(() => M.setHidden('comment', '7', true, 'encore une fois'), /déjà masqué/);
  await M.setHidden('comment', '7', false, 'Faux positif');
  await M.setHidden('track', T1, false, 'Description corrigée'); assert.equal(modCalls().at(-1).path, '/rest/v1/rpc/mod_set_track_hidden'); assert.equal(modCalls().at(-1).body.t, T1);
  assert.deepEqual(srv.mod.log.map((l) => l.action), ['restore', 'restore', 'hide'], 'chaque décision est au journal, la dernière d\'abord');
  assert.equal((await M.log()).length, 3); assert.equal((await M.log({ kind: 'track', id: T1 })).length, 1);
  await assert.rejects(() => M.setHidden('track', 'xyz', true, 'motif de test'), /Contenu inconnu/);
});
await test('suspendre / réactiver : motif, date de fin future contrôlés avant le réseau ; sans date : jusqu\'à réactivation ; pas un modérateur ; pas deux fois', async () => {
  const uid = await asGuest(); reset([uid]);
  await assert.rejects(() => M.suspend(U_AUTHOR, ''), /motif de 3 à 300/);
  await assert.rejects(() => M.suspend('pas-un-id', 'motif de test'), /Compte inconnu/);
  await assert.rejects(() => M.suspend(U_AUTHOR, 'motif de test', Date.now() - 1000), /dans le futur/);
  await assert.rejects(() => M.suspend(U_AUTHOR, 'motif de test', 'n\'importe quoi'), /dans le futur/);
  assert.equal(modCalls().filter((c) => c.path.includes('mod_suspend')).length, 0, 'rien n\'est parti');
  const id = await M.suspend(U_AUTHOR, 'Spam répété', Date.now() + 86400000);
  assert.ok(id > 0); assert.match(modCalls().at(-1).body.until_at, /^\d{4}-\d\d-\d\dT.*Z$/);
  await assert.rejects(() => M.suspend(U_AUTHOR, 'deuxième fois'), /déjà suspendu/);
  assert.equal((await M.suspensions()).length, 1);
  await M.unsuspend(U_AUTHOR, 'Elle s\'est excusée');
  assert.equal((await M.suspensions()).length, 0, 'plus de suspension en cours');
  await assert.rejects(() => M.unsuspend(U_AUTHOR, 'motif de test'), /n’est pas suspendu/);
  await M.suspend(U_AUTHOR, 'Sans date de fin', null); assert.equal(modCalls().at(-1).body.until_at, null);
  srv.mod.moderators.add('00000000-0000-4000-8000-0000000000b2');
  await assert.rejects(() => M.suspend('00000000-0000-4000-8000-0000000000b2', 'motif de test'), /modérateur ne se suspend pas/);
  await assert.rejects(() => M.suspend(uid, 'motif de test'), /soi-même|Compte inconnu/);
});
await test('aucune fonction du module n\'appelle une fonction hors de la liste des fonctions de modération (pas de mod_hide, pas de suppression)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/online/moderation.js', import.meta.url), 'utf8');
  const names = [...src.matchAll(/call\('([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(names)].sort(), ['mod_detail', 'mod_log', 'mod_queue', 'mod_reports', 'mod_set_comment_hidden', 'mod_set_track_hidden', 'mod_status', 'mod_suspend', 'mod_suspensions', 'mod_unsuspend']);
  assert.ok(!/delete|comment_delete|mod_hide/.test(src.replace(/\/\/.*$/gm, '')), 'le module ne supprime rien');
});

console.log('Un compte suspendu : le message de la base arrive au joueur');
await test('commenter (HTTP 400 de la base) ou publier (HTTP 403 de la fonction serveur) avec un compte suspendu : le message dit jusqu\'à quand, jamais « Accès refusé » ni « Enregistrement impossible »', async () => {
  await asGuest();
  const orig = globalThis.fetch;
  const msg = 'Compte suspendu : publier et commenter est impossible jusqu’au 28/11/2026 12:00 (UTC).';
  try {
    globalThis.fetch = async (url, init) => (String(url).includes('/rpc/comment_add') ? new Response(JSON.stringify({ code: 'P0001', message: msg }), { status: 400 })
      : String(url).includes('/functions/v1/submit-score') ? new Response(JSON.stringify({ error: msg, suspended: true }), { status: 403 }) : orig(url, init));
    for (const call of [() => online.rpc('comment_add', { t: 'x', msg: 'bonjour' }), () => online.rest('/functions/v1/submit-score', { method: 'POST', body: { action: 'publish-track' } })]) {
      const e = await call().then(() => null, (x) => x);
      assert.ok(e, 'refusé'); assert.equal(e.code, 'suspended'); assert.equal(e.message, msg);
    }
  } finally { globalThis.fetch = orig; }
});

console.log('Anglais : couverture EXACTE (le détecteur de français du navigateur est heuristique : il ne voit pas tout)');
await test('chaque libellé français de l\'écran de modération et chaque message de la base (étape 22) a sa traduction anglaise', async () => {
  const I = await import('../js/i18n.js');
  const en = (await import('../js/i18n/en.js')).default;
  const { readFileSync } = await import('node:fs');
  I.resetDictionary(); I.register(en); I.setLang('en');
  const src = readFileSync(new URL('../js/app/moderation.js', import.meta.url), 'utf8')
    .replace(/\/\/.*$/gm, '')                                                      // commentaires
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?:class|type|role|rows|maxlength|value):\s*(?:'[^']*'|String\([^)]*\))(?:\s*\+\s*\([^)]*\)[^,}]*)?/g, '')      // attributs techniques
    .replace(/'data-[a-z-]+'(?::\s*(?:'[^']*'|String\([^)]*\)|`[^`]*`))?/g, '').replace(/\[\s*'[a-z]+',\s*'À examiner'\s*\]/g, '');
  const lits = new Set();
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const t = m[1].replace(/\\'/g, '\'');
    if (/[A-Za-zÀ-ÿ]{3}/.test(t) && !/^[a-z0-9 _:.\-[\]="#]+$/.test(t.replace('date inconnue', '')) && !/^(btn|chip|mod-|tabs|lb-off|meta|srow|comm-|\.\.?\/)/.test(t)) lits.add(t);
  }
  for (const [, label] of [['pending', 'À examiner'], ['hidden', 'Contenus masqués'], ['suspended', 'Comptes suspendus'], ['log', 'Journal des décisions']]) lits.add(label);
  for (const t of ['date inconnue', 'compté', 'jusqu’à réactivation']) lits.add(t);
  const missing = [...lits].filter((t) => !/^(🎮 Mode|[\W\d]+)$/.test(t) && I.translate(t.trim()) === t.trim() && !/^(ajoutent|ouverture)/.test(t));
  assert.deepEqual(missing, [], 'libellés sans traduction anglaise');
  assert.ok(lits.size > 60, 'le test voit bien les libellés (' + lits.size + ')');
  // les messages de la base (supabase/etape22-moderation.sql) : chaque « raise exception '…' » français a sa traduction
  const sql = readFileSync(new URL('../supabase/etape22-moderation.sql', import.meta.url), 'utf8');
  const msgs = [...sql.matchAll(/raise exception (?:using message = case when hide then )?'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, '\''));
  const more = ['Ce circuit est déjà masqué.', 'Ce circuit est déjà visible.', 'Ce commentaire est déjà masqué.', 'Ce commentaire est déjà visible.', 'Ce mode est déjà masqué.', 'Ce mode est déjà visible.'];
  const dbMissing = [...new Set([...msgs, ...more])].filter((t) => /[a-zéèà]{3}/.test(t) && !t.includes('%') && I.translate(t) === t);
  assert.deepEqual(dbMissing, [], 'messages de la base sans traduction');
  assert.ok(msgs.length >= 15, 'le test voit les messages de la base (' + msgs.length + ')');
  assert.equal(I.translate('Compte suspendu : publier et commenter est impossible jusqu’au 28/11/2026 12:00 (UTC).'), 'Account suspended: publishing and commenting are not possible until 28/11/2026 12:00 (UTC).');
  assert.equal(I.translate('Compte suspendu : publier et commenter est impossible jusqu’à sa réactivation.'), 'Account suspended: publishing and commenting are not possible until it is reactivated.');
  I.resetDictionary(); I.setLang('fr');
});

finish();
