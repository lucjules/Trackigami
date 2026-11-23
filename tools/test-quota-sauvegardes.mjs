// Cause commune TRANS-02 (écriture groupée dont l'échec est ignoré, pression sur le quota) : node tools/test-quota-sauvegardes.mjs   (npm test)
//   TECH-007  synchronisation sous quota insuffisant : erreur visible, version allégée écrite, aucune relance automatique, aucune lecture complète répétée ;
//   TECH-022  essais de l'éditeur (e-…) : ni conservés (au plus 3), ni synchronisés, ni exportés ; purgés au démarrage ; l'éviction sacrifie le non classé d'abord ;
//   TECH-074  sauvegarde cloud > limite : aucun PATCH si rien n'a changé ; commandes retirées au-delà de la limite ;
//   TECH-075  import avec stockage plein : l'échec est annoncé ; TECH-078 : code joueur sans telemetry.state ni errors.queue.
// Le serveur Supabase est simulé (tools/fake-supabase.mjs), le quota du navigateur aussi, et le TEMPS est virtuel : on compte les requêtes sur 15 s sans attendre.
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { test, finish } from './harness.mjs';
import { device, srv } from './fake-supabase.mjs';

device('A');
const storage = await import('../js/storage.js');
const { online } = await import('../js/online.js');
const { account } = await import('../js/account.js');
const { profile, reloadProfile } = await import('../js/profile.js');

// ---- Temps virtuel : setTimeout / clearTimeout remplacés ; advance(ms) fait avancer l'horloge en laissant les promesses se résoudre ----
let now = 0, seq = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, id }); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
async function advance(ms) {
  const end = now + ms;
  await flush();
  for (;;) {
    const next = [...timers.values()].filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!next) break;
    timers.delete(next.id); now = Math.max(now, next.at);
    try { next.fn(); } catch { /* sans importance */ }
    await flush();
  }
  now = end;
}

// ---- Appareils ----
function boot(name) {
  const d = device(name);
  account.state = null; account.status = 'idle'; account.lastError = ''; account.note = ''; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope('');
  reloadProfile();
  d.local.quota = Infinity;
  return d;
}
// Quota simulé : setItem échoue au-delà de `quota` caractères (clés + valeurs), comme un navigateur dont le stockage est plein.
function setQuota(d, quota) {
  if (!d.local._real) d.local._real = d.local.setItem.bind(d.local);
  d.local.quota = quota;
  d.local.setItem = (k, v) => {
    v = String(v);
    let used = 0;
    for (const [kk, vv] of d.local.m) used += kk === k ? 0 : kk.length + vv.length;
    if (used + k.length + v.length > d.local.quota) throw new Error('QuotaExceededError');
    d.local._real(k, v);
  };
}
const usedOf = (d) => { let n = 0; for (const [k, v] of d.local.m) n += k.length + v.length; return n; };
const rec = (time, date, extra = {}) => ({ time, pv: 38, splits: [0.5, 0.9], inputs: 'x'.repeat(40), date, name: 'x', ghost: null, ...extra });
const gets = () => srv.calls.filter((c) => c.method === 'GET' && c.path === '/rest/v1/cloud_saves').length;
const patches = () => srv.calls.filter((c) => c.method === 'PATCH' && c.path === '/rest/v1/cloud_saves').length;

// Cloud d'un joueur à 120 records (fantôme 6 Ko + commandes 2,5 Ko chacun) et 777 ◆ : ≈ 1 Mo, ne tient pas dans un quota de 600 Ko.
function bigCloud() {
  const data = { profile: { id: 'AAAAA-BBBBB', coins: 777, owned: {}, medals: {}, stats: { races: 40, earned: 900 }, eggs: {}, shards: {}, loadout: {}, presets: [null, null, null] } };
  for (let i = 0; i < 120; i++) data['rec3.b-t' + i + '-x'] = rec(20 + i * 0.1, 1000 + i, { ghost: 'g'.repeat(6000), inputs: 'i'.repeat(2500) });
  return data;
}
async function newCloudAccount(name, data) {
  boot('A');
  await account.signUp(name, 'motdepasse1');
  const uid = account.uid;
  srv.saves.set(uid, { data, rev: 5 });
  return uid;
}

console.log('TECH-007 : synchronisation sous quota insuffisant');
await test('cloud de 120 records + 777 ◆, quota de 600 Ko : la progression s\'affiche (version allégée), le dit, et ne relance rien (une seule lecture complète en 15 s virtuelles)', async () => {
  await newCloudAccount('Quo_01', bigCloud());
  const d = boot('Q');
  setQuota(d, 600_000);
  srv.calls.length = 0;
  const r = await account.signIn('Quo_01', 'motdepasse1');
  assert.equal(r.kind, 'account');
  await advance(15_000);
  assert.equal(profile().coins, 777, 'les 777 ◆ du compte s\'affichent');
  const n = Object.keys(storage.dumpAll()).filter((k) => k.startsWith('rec3.')).length;
  assert.equal(n, 120, '120 records affichés');
  assert.equal(storage.getRecord('b-t5-x').time, 20.5);
  assert.ok(usedOf(d) <= 600_000);
  assert.equal(account.status, 'ok');
  assert.ok(account.note && /allégée|alleg/i.test(account.note), 'la version allégée est dite : ' + account.note);
  assert.equal(gets(), 1, 'une seule lecture complète du cloud sur 15 s virtuelles (avant : une toutes les ~4 s)');
  assert.equal(timers.size, 0, 'aucune synchronisation en attente');
});
await test('quota si petit que même le profil ne tient pas : statut « erreur » visible avec message, aucune relance automatique, une seule lecture complète, rien écrit à moitié', async () => {
  await newCloudAccount('Quo_02', bigCloud());
  const d = boot('Q3');
  // Plus de place du tout pour la progression du compte : toute valeur de plus de 60 caractères refusée dans sa portée (le profil de 777 ◆, un circuit, même un record allégé).
  const real = d.local.setItem.bind(d.local);
  d.local.setItem = (k, v) => { if (k.startsWith('shardwayacct.') && String(v).length > 60) throw new Error('QuotaExceededError'); real(k, v); };
  const notices = [];
  account.onNotice = (m) => notices.push(m);
  srv.calls.length = 0;
  await account.signIn('Quo_02', 'motdepasse1').catch(() => {});
  await advance(15_000);
  account.onNotice = null;
  assert.equal(account.status, 'error', 'état « erreur » (avant : « ok », « à jour »)');
  assert.ok(/espace insuffisant/i.test(account.lastError), 'message : ' + account.lastError);
  assert.equal(notices.length, 1, 'le joueur est prévenu, une seule fois');
  assert.equal(gets(), 1, 'aucune lecture répétée');
  assert.equal(timers.size, 0, 'aucune synchronisation en attente');
  assert.ok(![...d.local.m.keys()].some((k) => k.includes('rec3.')), 'aucun record écrit à moitié');
  assert.notEqual(profile().coins, 777, 'le profil du cloud n\'a pas été écrit');
  // « Synchroniser maintenant » après avoir libéré de la place : la progression arrive.
  d.local.setItem = real;
  await account.sync();
  assert.equal(account.status, 'ok'); assert.equal(profile().coins, 777); assert.equal(account.note, '');
});
await test('la progression du compte ne se perd pas dans le cloud : une copie locale allégée ne réécrit JAMAIS le cloud avec moins (fantômes et commandes du cloud intacts)', async () => {
  const data = bigCloud();
  const uid = await newCloudAccount('Quo_03', data);
  const d = boot('Q4');
  setQuota(d, 600_000);
  await account.signIn('Quo_03', 'motdepasse1');
  assert.equal(account.status, 'ok'); assert.ok(account.note);
  storage.saveRecord('b-nouveau', rec(5, 5000));      // une vraie partie : le prochain envoi part
  await account.sync();
  const cloud = srv.saves.get(uid).data;
  assert.equal(Object.keys(cloud).filter((k) => k.startsWith('rec3.')).length, 121);
  assert.equal(cloud['rec3.b-t7-x'].ghost.length, 6000, 'le fantôme du cloud est intact');
  assert.equal(cloud['rec3.b-t7-x'].inputs.length, 2500, 'les commandes du cloud sont intactes');
  assert.equal(cloud['rec3.b-nouveau'].time, 5);
});
await test('plusieurs niveaux d\'allègement : sans fantômes d\'abord ; si cela ne suffit pas, sans commandes des plus anciens ; puis records absents d\'ici (les plus récents d\'abord) ; le profil et les circuits passent avant tout', async () => {
  const mk = (n) => { const x = bigCloud(); for (const k of Object.keys(x)) if (k.startsWith('rec3.')) x[k] = rec(20 + +k.split('-t')[1].split('-')[0] * 0.1, 1000 + +k.split('-t')[1].split('-')[0], { ghost: 'g'.repeat(6000), inputs: 'i'.repeat(n) }); x.tracks = [{ id: 'c1', name: 'C', code: 'SHW3:abc', updated: 5 }]; return x; };
  const levels = [];
  for (const quota of [500_000, 100_000, 10_000]) {
    await newCloudAccount('Quo_L' + quota, mk(2500));
    const d = boot('QL' + quota);
    setQuota(d, quota);
    await account.signIn('Quo_L' + quota, 'motdepasse1');
    assert.equal(account.status, 'ok', quota + ' : ' + account.lastError);
    assert.equal(profile().coins, 777, quota + ' : le profil est là');
    assert.equal(storage.listMyTracks().length, 1, quota + ' : le circuit est là');
    assert.ok(usedOf(d) <= quota);
    levels.push([...d.local.m.keys()].filter((k) => k.includes('rec3.')).length + ':' + (account.note.match(/\d+/) || [''])[0]);
    const best = storage.getRecord('b-t0-x');
    if (best) assert.equal(best.time, 20, quota + ' : les temps affichés sont exacts');
  }
  assert.equal(levels[0].split(':')[0], '120', 'quota large : les 120 records, allégés');
  assert.ok(+levels[2].split(':')[0] < 120, 'quota étroit : seuls les plus récents tiennent : ' + levels.join(' | '));
  const d3 = device('QL10000');
  assert.ok(d3.local.m.has(`shardwayacct.${account.uid}.rec3.b-t119-x`), 'le plus récent est gardé');
  assert.ok(!d3.local.m.has(`shardwayacct.${account.uid}.rec3.b-t0-x`), 'le plus ancien est le premier à ne pas tenir (le cloud le garde)');
  assert.ok(/n’y sont pas écrits/.test(account.note), account.note);
});

console.log('TECH-074 : sauvegarde au-delà de la limite d\'envoi (6 Mo)');
const bytes = (o) => JSON.stringify(o).length;
const bigLocal = (n, ghost, inputs) => { for (let i = 0; i < n; i++) storage.saveRecord('b-g' + i + '-x', rec(30 + i * 0.1, 2000 + i, { ghost: ghost ? 'g'.repeat(ghost) : null, inputs: inputs ? 'i'.repeat(inputs) : 'x' })); };
await test('sauvegarde > 6 Mo (fantômes) sans changement : un seul envoi (sans fantômes), puis AUCUN PATCH et `rev` ne bouge plus (avant : ≈ 6 Mo renvoyés à chaque synchronisation)', async () => {
  boot('A');
  await account.signUp('Big_01', 'motdepasse1');
  const uid = account.uid;
  bigLocal(110, 60000, 0);
  assert.ok(bytes(storage.dumpAll()) > 6_000_000);
  await account.sync();
  const first = srv.saves.get(uid);
  assert.ok(bytes(first.data) <= 6_000_000, 'ce qui est parti tient dans la limite : ' + bytes(first.data));
  assert.equal(first.data['rec3.b-g3-x'].ghost, null, 'sans fantômes');
  const rev = first.rev;
  srv.calls.length = 0;
  for (let i = 0; i < 3; i++) assert.equal(await account.sync(), 'à jour');
  assert.equal(patches(), 0, 'aucun PATCH');
  assert.equal(srv.saves.get(uid).rev, rev, 'rev inchangé : pas de conflit inutile avec les autres appareils');
  assert.equal(storage.getRecord('b-g3-x').ghost.length, 60000, 'l\'appareil garde ses fantômes');
});
await test('au-delà de la limite MÊME sans fantômes (commandes lourdes) : les commandes des plus anciens records sont retirées de l\'envoi, pas d\'échec ; aucun PATCH ensuite ; l\'appareil garde tout ; un second appareil ne réécrit rien', async () => {
  boot('A');
  await account.signUp('Big_02', 'motdepasse1');
  const uid = account.uid;
  bigLocal(110, 0, 60000);
  assert.ok(bytes(storage.dumpAll()) > 6_000_000);
  await account.sync();
  const cloud = srv.saves.get(uid);
  assert.ok(bytes(cloud.data) <= 6_000_000, 'tient dans la limite : ' + bytes(cloud.data));
  const cut = Object.keys(cloud.data).filter((k) => k.startsWith('rec3.') && !cloud.data[k].inputs);
  assert.ok(cut.length > 0 && cut.length < 110, 'commandes retirées pour une partie des records seulement : ' + cut.length);
  assert.ok(cloud.data['rec3.b-g109-x'].inputs, 'les plus récents gardent leurs commandes'); assert.ok(!cloud.data['rec3.b-g0-x'].inputs, 'les plus anciens les perdent');
  assert.equal(cloud.data['rec3.b-g0-x'].time, 30, 'le temps reste');
  const rev = cloud.rev; srv.calls.length = 0;
  assert.equal(await account.sync(), 'à jour'); assert.equal(patches(), 0);
  assert.equal(storage.getRecord('b-g0-x').inputs.length, 60000, 'l\'appareil garde les commandes');
  // un second appareil reçoit la version allégée et ne réécrit rien ; le premier garde tout
  boot('B');
  await account.signIn('Big_02', 'motdepasse1');
  srv.calls.length = 0;
  assert.equal(await account.sync(), 'à jour'); assert.equal(patches(), 0);
  assert.equal(srv.saves.get(uid).rev, rev);
  boot('A'); await account.restore();
  assert.equal(await account.sync(), 'à jour');
  assert.equal(storage.getRecord('b-g0-x').inputs.length, 60000);
});
await test('la fusion ne laisse pas une copie plus pauvre écraser le même record plus complet (à temps et physique égaux, le plus complet gagne ; un meilleur temps gagne toujours)', async () => {
  const { mergeSaves } = await import('../js/cloudsave.js');
  const full = rec(20, 5, { ghost: 'g'.repeat(100), inputs: 'i'.repeat(100) }), poor = rec(20, 5, { ghost: null, inputs: null });
  assert.equal(mergeSaves({ 'rec3.b-x': poor }, { 'rec3.b-x': full })['rec3.b-x'].ghost.length, 100);
  assert.equal(mergeSaves({ 'rec3.b-x': full }, { 'rec3.b-x': poor })['rec3.b-x'].ghost.length, 100);
  assert.equal(mergeSaves({ 'rec3.b-x': { ...poor, time: 19 } }, { 'rec3.b-x': full })['rec3.b-x'].time, 19, 'un meilleur temps l\'emporte toujours');
});

console.log('TECH-078 : clés propres à l\'appareil');
const { exportCode, parseCode, applySave } = await import('../js/profile.js');
const { buildExport, readableLocal } = await import('../js/dataExport.js');
await test('le code joueur ne contient NI telemetry.state (identifiant d\'installation) NI errors.queue ; il garde les réglages et les records', async () => {
  boot('G1');
  storage.setJSON('telemetry.state', { install: '0123456789abcdef', attempts: {} });
  storage.setJSON('errors.queue', [{ key: 'k', kind: 'error', message: 'boum', hits: 1, ts: 1 }]);
  storage.setJSON('online.session', { access_token: 'secret' });
  storage.saveRecord('b-a-1', rec(21, 5));
  const dump = storage.dumpAll({ shareable: true });
  assert.ok(!('telemetry.state' in dump) && !('errors.queue' in dump) && !('online.session' in dump));
  assert.ok('rec3.b-a-1' in dump);
  const code = await exportCode();
  const obj = await parseCode(code);
  assert.ok(!('telemetry.state' in obj.data) && !('errors.queue' in obj.data), 'rien d\'identifiant dans le code : ' + Object.keys(obj.data).join(','));
  assert.ok(!code.includes('0123456789abcdef'));
});
await test('importer un code en « Remplacer » ne fait pas adopter l\'identifiant d\'installation d\'un autre appareil ; celui de CET appareil survit', async () => {
  const d = boot('G2');
  storage.setJSON('telemetry.state', { install: 'aaaaaaaaaaaaaaaa', attempts: {} });
  const foreign = { v: 1, id: 'p', t: 1, data: { settings: '{"volume":0.2}', 'telemetry.state': JSON.stringify({ install: 'bbbbbbbbbbbbbbbb', attempts: {} }), 'errors.queue': '[{"message":"x"}]' } };
  applySave(foreign, 'replace');
  assert.ok(d.local.m.get('shardway.telemetry.state').includes('aaaaaaaaaaaaaaaa'), 'l\'identifiant de cet appareil est gardé');
  assert.ok(!d.local.m.has('shardway.errors.queue'), 'la file d\'erreurs de l\'autre appareil n\'est pas importée');
  assert.equal(storage.getJSON('settings').volume, 0.2);
});
await test('export des données du joueur (RGPD) : l\'identifiant d\'installation y reste (c\'est SA donnée) ; ni session, ni profil en ligne, ni preuve, ni essais d\'éditeur', async () => {
  boot('G3');
  storage.setJSON('telemetry.state', { install: '0123456789abcdef', attempts: {} });
  storage.setJSON('online.session', { access_token: 'secret' }); storage.setJSON('online.player', { id: 'x' }); storage.setJSON('vproof', { a: 1 });
  storage.saveRecord('e-abc', rec(30, 1)); storage.saveRecord('b-a-1', rec(21, 5));
  const out = await buildExport({ meta: {}, local: storage.dumpAll({ portability: true }) });
  assert.deepEqual(out.device['telemetry.state'], { install: '0123456789abcdef', attempts: {} });
  for (const k of ['online.session', 'online.player', 'vproof', 'rec3.e-abc']) assert.ok(!(k in out.device), k);
  assert.ok('rec3.b-a-1' in out.device);
  assert.ok(readableLocal);
});

console.log('TECH-022 : essais de l\'éditeur (e-…) et éviction du non classé');
const trial = (i, size = 30000) => rec(40 + i * 0.01, 1000 + i, { ghost: 'g'.repeat(size / 2), inputs: 'i'.repeat(size / 2) });
await test('30 essais d\'éditeur : au plus 3 records e-… sur le disque (les plus récents), aucun dans la sauvegarde cloud, aucun dans le code joueur ; les vrais records sont intacts', async () => {
  const d = boot('E1');
  await account.signUp('Edi_01', 'motdepasse1');
  storage.saveRecord('b-a-1', rec(21, 5, { ghost: 'g'.repeat(500) })); storage.saveRecord('u-xyz', rec(33, 6)); storage.saveRecord('daily-2026-01-01', rec(44, 7));
  for (let i = 0; i < 30; i++) assert.equal(storage.saveRecord('e-t' + i, trial(i)), true);
  const eKeys = [...d.local.m.keys()].filter((k) => k.includes('rec3.e-'));
  assert.ok(eKeys.length <= 3 && eKeys.length >= 1, 'essais conservés : ' + eKeys.length);
  assert.ok(eKeys.every((k) => /e-t(27|28|29)$/.test(k)), 'ce sont les derniers : ' + eKeys.join(','));
  assert.equal(storage.getRecord('e-t29').time, 40.29, 'l\'essai en cours garde son record (fantôme du circuit essayé)');
  await advance(5000);
  assert.ok(!Object.keys(srv.saves.get(account.uid).data).some((k) => k.startsWith('rec3.e-')), 'aucun essai dans le cloud');
  assert.ok(!Object.keys(srv.saves.get(account.uid).data).some((k) => k.includes('e-t')));
  assert.ok(!Object.keys((await parseCode(await exportCode())).data).some((k) => k.startsWith('rec3.e-')), 'aucun essai dans le code joueur');
  assert.deepEqual(['b-a-1', 'u-xyz', 'daily-2026-01-01'].map((k) => storage.getRecord(k).time), [21, 33, 44]);
  assert.equal(account.hasGuestProgress(), true);
});
await test('un joueur qui n\'a fait QUE des essais d\'éditeur n\'a pas de « progression » à reprendre à l\'inscription', () => {
  boot('E2');
  storage.saveRecord('e-only', trial(1));
  assert.equal(account.hasGuestProgress(), false);
});
await test('une écriture d\'essai ne planifie AUCUNE synchronisation', async () => {
  boot('E3');
  await account.signUp('Edi_03', 'motdepasse1');
  await advance(10_000);
  srv.calls.length = 0;
  storage.saveRecord('e-zz', trial(2));
  assert.equal(timers.size, 0, 'rien de planifié');
  await advance(10_000);
  assert.equal(srv.calls.length, 0, 'aucune requête');
});
await test('un cloud qui contient des essais (ancien client) : ils ne reviennent pas sur l\'appareil, et la synchronisation suivante les retire du cloud ; les vrais records y restent', async () => {
  const data = { 'rec3.b-a-1': rec(21, 5), 'rec3.u-xyz': rec(33, 6), 'rec3.daily-2026-01-01': rec(44, 7) };
  for (let i = 0; i < 40; i++) data['rec3.e-old' + i] = trial(i, 2000);
  await newCloudAccount('Edi_04', data);
  const d = boot('E4');
  srv.calls.length = 0;
  await account.signIn('Edi_04', 'motdepasse1');
  assert.ok(![...d.local.m.keys()].some((k) => k.includes('rec3.e-')), 'aucun essai reçu');
  assert.deepEqual(['b-a-1', 'u-xyz', 'daily-2026-01-01'].map((k) => storage.getRecord(k).time), [21, 33, 44]);
  const cloud = srv.saves.get(account.uid).data;
  assert.ok(!Object.keys(cloud).some((k) => k.startsWith('rec3.e-')), 'le cloud est nettoyé');
  assert.deepEqual(Object.keys(cloud).filter((k) => k.startsWith('rec3.')).sort(), ['rec3.b-a-1', 'rec3.daily-2026-01-01', 'rec3.u-xyz']);
});
await test('purge au démarrage : tous les essais d\'éditeur de l\'appareil (invité ET comptes) partent ; rien d\'autre (b-, u-, daily-, ghostImp, runs, profil, circuits)', () => {
  const d = boot('E5');
  const keep = ['shardway.rec3.b-a-1', 'shardway.rec3.u-xyz', 'shardway.rec3.daily-2026-01-01', 'shardway.rec3.b-e-faux-abc', 'shardway.ghostImp.b-a-1', 'shardway.runs.b-a-1', 'shardway.profile', 'shardway.tracks',
    'shardwayacct.u-9.rec3.b-a-1', 'shardwayacct.u-9.rec3.u-e-abc', 'shardwayacct.u-9.profile', 'shardwayacct.u-9.rec3.daily-2026-01-01~v1.mut-e-x'];
  for (const k of keep) d.local.m.set(k, JSON.stringify(rec(20, 1)));
  const gone = ['shardway.rec3.e-1', 'shardway.rec3.e-2', 'shardway.rec3.e-abc~v1.x', 'shardwayacct.u-9.rec3.e-3', 'shardwayacct.u-9.rec3.e-4'];
  for (const k of gone) d.local.m.set(k, JSON.stringify(rec(20, 1)));
  assert.equal(storage.purgeEditorTrials(), gone.length);
  for (const k of gone) assert.ok(!d.local.m.has(k), k);
  for (const k of keep) assert.ok(d.local.m.has(k), k + ' conservée');
});
await test('stockage plein : l\'éviction libère d\'abord les essais d\'éditeur ; le nouveau vrai record garde son fantôme et ses commandes ; les vrais records ne sont PAS dépouillés', () => {
  const d = boot('E6');
  const reals = ['b-a-1', 'u-xyz', 'daily-2026-01-01'];
  reals.forEach((k, i) => storage.saveRecord(k, rec(20 + i, 100 + i, { ghost: 'g'.repeat(3000), inputs: 'i'.repeat(3000) })));
  for (let i = 0; i < 3; i++) d.local.m.set('shardway.rec3.e-pre' + i, JSON.stringify(trial(i, 20000)));      // (écrits avant la mise à jour : plus de 3)
  setQuota(d, usedOf(d) + 2000);
  const full = rec(19, 200, { ghost: 'g'.repeat(9000), inputs: 'i'.repeat(9000) });
  assert.equal(storage.saveRecord('b-new-1', full), true);
  const got = storage.getRecord('b-new-1');
  assert.equal(got.ghost.length, 9000, 'fantôme du nouveau record gardé'); assert.equal(got.inputs.length, 9000, 'commandes gardées');
  for (const k of reals) { const r = storage.getRecord(k); assert.equal(r.ghost.length, 3000, k + ' garde son fantôme'); assert.equal(r.inputs.length, 3000, k + ' garde ses commandes'); }
  assert.ok(![...d.local.m.keys()].some((k) => k.includes('rec3.e-pre')), 'les essais ont été libérés');
});
await test('éviction : sans essais, ce sont les fantômes importés (le plus gros d\'abord) puis les dernières courses qui partent AVANT le fantôme d\'un vrai record ; les temps b-/u-/daily- ne sont JAMAIS perdus, même plein à craquer', () => {
  const d = boot('E7');
  const reals = ['b-a-1', 'u-xyz', 'daily-2026-01-01'];
  reals.forEach((k, i) => storage.saveRecord(k, rec(20 + i, 100 + i, { ghost: 'g'.repeat(3000), inputs: 'i'.repeat(3000) })));
  storage.setImportedGhost('b-a-1', { time: 20, ghost: 'x'.repeat(4000) }); storage.setImportedGhost('b-b-2', { time: 21, ghost: 'x'.repeat(1000) });
  storage.setRuns('b-a-1', [{ time: 20, date: 5 }]);
  setQuota(d, usedOf(d) + 1500);
  assert.equal(storage.saveRecord('b-new-1', rec(19, 200, { ghost: 'g'.repeat(5000), inputs: 'i'.repeat(1000) })), true);
  assert.equal(storage.getRecord('b-new-1').ghost.length, 5000);
  for (const k of reals) assert.equal(storage.getRecord(k).ghost.length, 3000, k + ' garde son fantôme');
  assert.equal(storage.getImportedGhost('b-a-1'), null, 'le plus gros fantôme importé a été libéré');
  // puis plus rien à libérer hors vrais records : les temps survivent à tout
  setQuota(d, usedOf(d) + 100);
  storage.saveRecord('daily-2026-02-02', rec(55, 300, { ghost: 'g'.repeat(20000), inputs: 'i'.repeat(20000) }));
  for (const [k, t] of [['b-a-1', 20], ['u-xyz', 21], ['daily-2026-01-01', 22], ['b-new-1', 19]]) assert.equal(storage.getRecord(k).time, t, k + ' : temps jamais perdu');
});

console.log('TECH-075 : restauration (import) avec le stockage plein');
const { profileMethods } = await import('../js/app/profile.js');
const { StorageFullError } = storage;
const importCode = (data) => ({ v: 1, id: 'AAAAA-BBBBB', t: 1, data });
await test('import « Remplacer » ou « Fusionner » avec le stockage plein : StorageFullError (storage-full), RIEN n\'est modifié sur l\'appareil', async () => {
  for (const mode of ['replace', 'merge']) {
    const d = boot('I' + mode);
    storage.saveRecord('b-a-1', rec(21, 5, { ghost: 'g'.repeat(2000) })); storage.setJSON('settings', { volume: 0.3 });
    const before = new Map(d.local.m);
    setQuota(d, usedOf(d) + 300);
    const imp = importCode({ settings: '{"volume":0.9}', 'rec3.b-z-9': JSON.stringify(rec(9, 9, { ghost: 'g'.repeat(5000) })), tracks: '[]' });
    assert.throws(() => applySave(imp, mode), (e) => e instanceof StorageFullError && e.code === 'storage-full', mode);
    assert.deepEqual([...d.local.m.entries()].sort(), [...before.entries()].sort(), mode + ' : stockage identique à l\'avant-import');
  }
});
await test('même plein, les essais d\'éditeur (jetables) sont libérés et l\'import réussit ; un vrai record n\'est pas touché', async () => {
  const d = boot('Itrial');
  storage.saveRecord('b-a-1', rec(21, 5, { ghost: 'g'.repeat(1000) }));
  for (let i = 0; i < 3; i++) d.local.m.set('shardway.rec3.e-x' + i, JSON.stringify(rec(40, 1, { ghost: 'g'.repeat(20000) })));
  setQuota(d, usedOf(d) + 500);
  applySave(importCode({ settings: '{"volume":0.9}', 'rec3.b-z-9': JSON.stringify(rec(9, 9, { ghost: 'g'.repeat(5000) })) }), 'merge');
  assert.equal(storage.getRecord('b-z-9').time, 9); assert.equal(storage.getRecord('b-a-1').ghost.length, 1000);
  assert.ok(![...d.local.m.keys()].some((k) => k.includes('rec3.e-')));
});
await test('à l\'écran : stockage plein → message d\'échec, JAMAIS « Sauvegarde restaurée ! » ; stockage libre → « Sauvegarde restaurée ! »', async () => {
  const flashes = []; let after = 0;
  const fakeApp = { ui: { flash: (m) => flashes.push(m) }, _afterImport() { after++; this.ui.flash('Sauvegarde restaurée !'); }, _applyImport: profileMethods._applyImport };
  const d = boot('Iui');
  storage.setJSON('settings', { volume: 0.3 });
  const imp = importCode({ settings: '{"volume":0.9}', 'rec3.b-z-9': JSON.stringify(rec(9, 9, { ghost: 'g'.repeat(5000) })) });
  const real = d.local.setItem.bind(d.local);
  d.local.setItem = () => { throw new Error('QuotaExceededError'); };
  fakeApp._applyImport(imp, 'replace');
  assert.equal(after, 0, 'pas d\'après-import'); assert.equal(flashes.length, 1);
  assert.ok(/plein/i.test(flashes[0]) && !/restaurée !/.test(flashes[0]), flashes[0]);
  d.local.setItem = real;
  fakeApp._applyImport(imp, 'replace');
  assert.equal(after, 1); assert.equal(flashes.at(-1), 'Sauvegarde restaurée !');
  assert.equal(storage.getRecord('b-z-9').time, 9);
});
await test('les nouveaux textes sont traduits en anglais (note de copie allégée, erreur d\'espace, import refusé)', async () => {
  const I = await import('../js/i18n.js'); const { default: en } = await import('../js/i18n/en.js');
  I.resetDictionary(); I.register(en); I.setLang('en');
  const fr = [
    'Espace insuffisant sur cet appareil : la sauvegarde du compte n’a pas pu y être écrite (le cloud la garde). Libère de la place sur l’appareil, puis « Synchroniser maintenant ».',
    'Espace insuffisant sur cet appareil : copie du compte allégée (90 records sans fantôme ni commandes ; le cloud les garde en entier).',
    'Espace insuffisant sur cet appareil : 119 records du compte n’y sont pas écrits (le cloud les garde en entier).',
    'Stockage plein : la sauvegarde n’a pas été restaurée, rien n’a été modifié. Libère de la place sur l’appareil, puis réessaie.',
    'erreur : Espace insuffisant sur cet appareil : 119 records du compte n’y sont pas écrits (le cloud les garde en entier).',
  ];
  for (const t of fr) { const out = I.translate(t); assert.notEqual(out, t, 'non traduit : ' + t); assert.ok(!/[éèà]/.test(out.replace(/[“”’]/g, '')) || /Sync now/.test(out), out); }
  assert.match(I.translate(fr[1]), /90 records/);
  I.setLang('fr');
});

await finish('Tous les tests de la cause commune TRANS-02 passent.');
process.exit(0);
