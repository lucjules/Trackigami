// Recette D4 : sauvegarde cloud SIMULÉE (tools/fake-supabase.mjs) sous quota de stockage serré, temps virtuel.
//   node tools/recette/quota.mjs
// Un compte dont le cloud pèse ≈ 0,5 Mo est ouvert sur un appareil dont le stockage est limité à des tailles de plus en plus petites ; on regarde : la connexion aboutit-elle, la
// progression (pièces) s'affiche-t-elle, le joueur est-il prévenu, le cloud perd-il quelque chose (pièces, records), combien de requêtes partent (pas de boucle), les valeurs
// écrites sont-elles toutes du JSON valide (rien d'écrit à moitié). Puis une modification locale sous le même quota, et un second appareil sans limite relit le cloud.
// Ne vérifie PAS un vrai Supabase (impossible ici).
import { setImmediate } from 'node:timers';
import { device, srv } from '../fake-supabase.mjs';

device('A');
const storage = await import('../../js/storage.js');
const { online } = await import('../../js/online.js');
const { account } = await import('../../js/account.js');
const { profile, reloadProfile, saveProfile } = await import('../../js/profile.js');
const { PHYS_VER } = await import('../../js/version.js');

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
function boot(name) {
  const d = device(name);
  account.state = null; account.status = 'idle'; account.lastError = ''; account.note = ''; clearTimeout(account._timer); account._running = null; account._dirty = false;
  online.useGuest(); online.onAccountSession = null; online._authP = null;
  storage.setScope('');
  reloadProfile();
  d.local.quota = Infinity;
  return d;
}
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
const rec = (time, date, extra = {}) => ({ time, pv: PHYS_VER, splits: [0.5, 0.9], inputs: 'x'.repeat(40), date, name: 'x', ghost: null, ...extra });
function cloud(n) {
  const data = { profile: { id: 'AAAAA-BBBBB', coins: 777, owned: {}, medals: {}, stats: { races: 40, earned: 900 }, eggs: {}, shards: {}, loadout: {}, presets: [null, null, null] } };
  for (let i = 0; i < n; i++) data['rec3.b-t' + i + '-x'] = rec(20 + i * 0.1, 1000 + i, { ghost: 'g'.repeat(3000), inputs: 'i'.repeat(1500) });
  return data;
}
const calls = (m) => srv.calls.filter((c) => c.method === m && c.path === '/rest/v1/cloud_saves').length;
const badJson = (d) => { const bad = []; for (const [k, v] of d.local.m) { try { if (/^[[{]/.test(v)) JSON.parse(v); } catch { bad.push(k); } } return bad; };

const rows = [];
const log = (r) => { rows.push(r); console.log(JSON.stringify(r)); };
// Cloud de départ, créé par un premier appareil sans limite.
boot('A');
await account.signUp('Quota_01', 'motdepasse1');
const uid = account.uid;
srv.saves.set(uid, { data: cloud(120), rev: 5 });          // ≈ 0,55 Mo
const cloudBytes = JSON.stringify(srv.saves.get(uid).data).length;
console.log('cloud de départ :', cloudBytes, 'caractères, 120 records, 777 ◆');

for (const quota of [2_000_000, 600_000, 300_000, 150_000, 60_000, 20_000, 5_000, 1_000]) {
  const row = { quota };
  try {
    const d = boot('Q' + quota);
    setQuota(d, quota);
    srv.calls.length = 0;
    const t0 = Date.now();
    let res, thrown = null;
    try { res = await account.signIn('Quota_01', 'motdepasse1'); } catch (e) { thrown = String(e.message); }
    await advance(20_000);
    row.signIn = thrown ? 'EXCEPTION ' + thrown : (res && res.kind);
    row.status = account.status; row.note = account.note || ''; row.lastError = account.lastError || '';
    row.coinsAffichees = profile().coins;
    row.recordsLocaux = Object.keys(storage.dumpAll()).filter((k) => k.startsWith('rec3.')).length;
    row.utilise = usedOf(d);
    row.jsonInvalide = badJson(d);
    row.getsPatchs = [calls('GET'), calls('PATCH')];
    row.timersEnAttente = timers.size;
    // modification locale (pièces + 1 record) puis synchronisation
    profile().coins += 10; let savedErr = null;
    try { saveProfile(); } catch (e) { savedErr = String(e.message); }
    let recErr = null;
    try { storage.saveRecord('b-tnew-x', rec(19.9, 5000)); } catch (e) { recErr = String(e.message); }
    srv.calls.length = 0;
    await advance(20_000);
    row.apresModif = { saveProfileExc: savedErr, saveRecordExc: recErr, status: account.status, note: account.note || '', cloudCoins: srv.saves.get(uid).data.profile.coins, cloudRecords: Object.keys(srv.saves.get(uid).data).filter((k) => k.startsWith('rec3.')).length, getsPatchs: [calls('GET'), calls('PATCH')], jsonInvalide: badJson(d) };
    row.ms = Date.now() - t0;
  } catch (e) { row.erreurInattendue = String(e.stack || e.message).split('\n').slice(0, 3).join(' / '); }
  log(row);
  // le cloud n'a-t-il rien perdu ? (remis à son état initial pour la ligne suivante)
  if (quota !== 1_000) srv.saves.set(uid, { data: cloud(120), rev: 5 });
}
// Second appareil sans limite : relit le cloud après les essais.
const d2 = boot('Z');
d2.local.quota = Infinity;
await account.signIn('Quota_01', 'motdepasse1'); await advance(20_000);
console.log('second appareil sans limite (après toutes les lignes, cloud de la dernière) : pièces', profile().coins, 'records', Object.keys(storage.dumpAll()).filter((k) => k.startsWith('rec3.')).length);
process.exit(0);
