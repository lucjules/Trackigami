// Outil d'amorce officielle (COMPLETE-010, tools/seed-officiels.mjs) : node tools/test-seed-officiels.mjs   (npm test)
//   - déterministe : deux calculs donnent le même fichier, octet pour octet ;
//   - chaque amorce se REJOUE par la vérification du serveur (verifyRun) au temps exact, et son fantôme se lit comme celui d'un record (parseGhost) ;
//   - étiquettes honnêtes : niveau gardé seulement à moins de 6 % du seuil de sa médaille, source « auto » sans pseudo ; clés conformes à la contrainte de la table ;
//   - testeurs : un code de fantôme du jeu rejoué ; un temps falsifié, une autre physique, un autre circuit sont refusés ;
//   - envoi : jamais sans clé de service ; « upsert » sur la clé primaire, par lots ; une ligne qui ne se rejoue plus n'est jamais envoyée ; à blanc, rien ne part.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { verifyRun } from '../js/verify.js';
import { parseGhost, GHOST_EVERY } from '../js/ghostFormat.js';
import { encodeGhost } from '../js/replay.js';
import { PHYS_VER } from '../js/version.js';
import { DT } from '../js/constants.js';
import { SHOW_TOLERANCE } from '../js/ghostTarget.js';
import { computeAll, serialize, digest, checkFile, send, testerRun, seedTrack, keyOf, KEY_RE, LEVELS, TOOL } from './seed-officiels.mjs';

const IDS = ['eclats', 'lagon', 'apesanteur'];          // route, bateau, et un circuit dont le bronze du pilote est trop lent (niveau écarté)
const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const a = computeAll({ ids: IDS }), b = computeAll({ ids: IDS });
const textA = serialize(a.runs), textB = serialize(b.runs);

test('déterministe : deux calculs donnent le même fichier (même texte, même empreinte), sans aucune date', () => {
  assert.ok(a.runs.length >= 10, 'des amorces sont produites');
  assert.equal(textA, textB);
  assert.equal(digest(textA), digest(textB));
  assert.ok(!/20\d\d-\d\d-\d\dT/.test(textA), 'aucune date dans le fichier');
  assert.deepEqual(JSON.parse(textA).runs.map((r) => r.track_key + ' ' + r.level), a.runs.map((r) => r.track_key + ' ' + r.level));
});

test('chaque fantôme se rejoue : verifyRun (la vérification des temps des joueurs) redonne le temps exact et le même fantôme ; il se lit comme un record', () => {
  for (const r of a.runs) {
    const v = verifyRun({ trackKey: r.track_key, inputs: r.inputs, time: r.time, physVer: PHYS_VER, withGhost: true });
    assert.ok(v.ok, r.track_key + ' ' + r.level + ' : ' + v.error);
    assert.equal(v.time, r.time, r.level + ' : temps exact');
    assert.equal(v.ghost, r.ghost, r.level + ' : même fantôme');
    const g = parseGhost(r.ghost, r.ghost_veh);
    assert.ok(g, r.level + ' : fantôme lisible');
    const frames = g.data.length / 7, expected = Math.round(r.time / DT / GHOST_EVERY);
    assert.ok(Math.abs(frames - expected) <= 2, `${r.level} : ${frames} poses pour ${r.time} s`);
  }
});

test('étiquettes honnêtes : source « auto », pas de pseudo, niveau à moins de 6 % du seuil de sa médaille ; ce qui est trop loin est écarté et dit', () => {
  for (const r of a.runs) {
    const d = BUILTIN_TRACKS.find((x) => keyOf(x) === r.track_key);
    assert.equal(r.source, 'auto'); assert.equal(r.pilot, null); assert.equal(r.tool, TOOL); assert.equal(r.phys_ver, PHYS_VER);
    assert.ok(LEVELS.includes(r.level));
    assert.ok(Math.abs(r.time / d.medals[r.level] - 1) <= SHOW_TOLERANCE, `${d.id} ${r.level} : ${r.time} pour un seuil de ${d.medals[r.level]}`);
    assert.match(r.track_key, KEY_RE, 'la clé passe la contrainte de la table');
  }
  assert.ok(a.skipped.some((s) => /^apesanteur bronze : à -1\d\.\d %/.test(s)), 'le bronze trop lent d’Apesanteur est écarté, avec la raison : ' + a.skipped.join(' | '));
  assert.ok(!a.runs.some((r) => r.track_key === keyOf(def('apesanteur')) && r.level === 'bronze'));
  const eclats = a.runs.filter((r) => r.track_key === keyOf(def('eclats')));
  assert.deepEqual(eclats.map((r) => r.level), LEVELS, 'les quatre niveaux d’Éclats, du plus lent au plus rapide');
  for (let i = 1; i < eclats.length; i++) assert.ok(eclats[i].time < eclats[i - 1].time, 'chaque niveau est plus rapide que le précédent');
});

test('un circuit sans rythmes calibrés (ou modifié depuis) ne reçoit aucune amorce, plutôt qu’une amorce fausse', () => {
  const r = seedTrack(def('eclats'), { table: {} });
  assert.equal(r.runs.length, 0); assert.equal(r.skipped.length, 4);
});

test('testeurs : le code de fantôme d’un testeur est rejoué et rangé sous « testeur » avec son pseudo ; un temps falsifié, une autre physique, un autre circuit sont refusés', () => {
  const src = a.runs.find((r) => r.track_key === keyOf(def('eclats')) && r.level === 'or');
  const ok = testerRun(encodeGhost({ trackKey: src.track_key, time: src.time, name: 'Élodie T.', inputs: src.inputs }));
  assert.ok(ok.run, ok.error);
  assert.equal(ok.run.source, 'testeur'); assert.equal(ok.run.pilot, 'Élodie T.'); assert.equal(ok.run.level, 'elodie-t'); assert.equal(ok.run.time, src.time);
  assert.ok(testerRun(encodeGhost({ trackKey: src.track_key, time: src.time - 1, name: 'Triche', inputs: src.inputs })).error);
  assert.ok(testerRun('SHG1:' + Buffer.from(JSON.stringify({ k: src.track_key, t: src.time, n: 'X', i: src.inputs, v: PHYS_VER - 1 })).toString('base64')).error);
  assert.ok(testerRun(encodeGhost({ trackKey: 'u-abc', time: src.time, name: 'X', inputs: src.inputs })).error);
  assert.ok(testerRun(encodeGhost({ trackKey: src.track_key, time: src.time, name: '', inputs: src.inputs })).error, 'pas de pseudo, pas de course de testeur');
  assert.ok(testerRun('pas un code').error);
  const withTester = computeAll({ ids: ['eclats'], testerCodes: [encodeGhost({ trackKey: src.track_key, time: src.time, name: 'Élodie T.', inputs: src.inputs })] });
  assert.equal(withTester.runs.at(-1).source, 'testeur');
  assert.equal(checkFile(JSON.parse(serialize(withTester.runs))), 5);
});

test('fichier revérifié avant envoi : autre physique, ligne falsifiée (temps, fantôme, niveau, clé de variante), doublon : refus', () => {
  const data = JSON.parse(textA);
  assert.equal(checkFile(data), a.runs.length);
  const bad = (f) => { const d = JSON.parse(textA); f(d); return () => checkFile(d); };
  assert.throws(bad((d) => { d.physVer = PHYS_VER - 1; }), /physique/);
  assert.throws(bad((d) => { d.runs[0].time -= 0.5; }), /rejoue/);
  assert.throws(bad((d) => { d.runs[0].ghost = d.runs[1].ghost; }), /rejoue/);
  assert.throws(bad((d) => { d.runs[0].level = 'platine'; }), /invalide/);
  assert.throws(bad((d) => { d.runs[0].track_key += '~v1.sea-2'; }), /invalide/);
  assert.throws(bad((d) => { d.runs[0].pilot = 'Quelqu’un'; }), /invalide/);
  assert.throws(bad((d) => { d.runs.push({ ...d.runs[0] }); }), /double/);
  assert.throws(bad((d) => { d.tool = 'autre'; }), /illisible/);
});

await test('envoi : clé de service exigée ; « upsert » sur la clé primaire, par lots, en-têtes de la clé ; à blanc, aucune requête', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 201 }); };
  await assert.rejects(send({ url: '', key: 'k', runs: a.runs, fetchImpl }), /SUPABASE_URL/);
  await assert.rejects(send({ url: 'https://x.supabase.co', key: '', runs: a.runs, fetchImpl }), /SERVICE_ROLE_KEY/);
  assert.equal(calls.length, 0);
  const n = await send({ url: 'https://x.supabase.co/', key: 'service-key', runs: a.runs, fetchImpl, batch: 4, log: () => {} });
  assert.equal(n, a.runs.length);
  assert.equal(calls.length, Math.ceil(a.runs.length / 4));
  for (const c of calls) {
    assert.equal(c.url, 'https://x.supabase.co/rest/v1/official_runs?on_conflict=track_key,phys_ver,source,level');
    assert.equal(c.init.method, 'POST');
    assert.equal(c.init.headers.Authorization, 'Bearer service-key'); assert.equal(c.init.headers.apikey, 'service-key');
    assert.match(c.init.headers.Prefer, /resolution=merge-duplicates/);
    for (const row of JSON.parse(c.init.body)) { assert.equal(row.source, 'auto'); assert.ok(row.inputs && row.ghost); assert.ok(!('id' in row)); }
  }
  calls.length = 0;
  await send({ url: 'https://x.supabase.co', key: 'service-key', runs: a.runs, fetchImpl, dry: true, log: () => {} });
  assert.equal(calls.length, 0, 'à blanc : rien ne part');
  const refused = async () => new Response('permission denied for table official_runs', { status: 403 });
  await assert.rejects(send({ url: 'https://x.supabase.co', key: 'anon-key', runs: a.runs, fetchImpl: refused, log: () => {} }), /403/);
});

test('en ligne de commande : --send sans clé de service s’arrête sans rien envoyer ; sans option, l’aide', () => {
  const env = { ...process.env }; delete env.SUPABASE_URL; delete env.SUPABASE_SERVICE_ROLE_KEY;
  const r = spawnSync(process.execPath, ['tools/seed-officiels.mjs', '--send', 'inexistant.json'], { env, encoding: 'utf8' });
  assert.equal(r.status, 1); assert.match(r.stderr, /SUPABASE_SERVICE_ROLE_KEY/); assert.match(r.stderr, /rien n’a été envoyé/);
  const h = spawnSync(process.execPath, ['tools/seed-officiels.mjs'], { env, encoding: 'utf8' });
  assert.equal(h.status, 1); assert.match(h.stdout, /--out/);
});

finish('L’outil d’amorce officielle est déterministe, ses fantômes se rejouent, rien ne part sans clé de service.');
