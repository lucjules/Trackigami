// Copie d'un circuit officiel dans l'éditeur (COMPLETE-019) : node tools/test-copie-officiel.mjs   (npm test)
// La copie s'ouvre avec sa PROPRE clé « u-… », l'original est inchangé ; une copie non modifiée ne se publie pas (règle décidée et documentée), une copie modifiée si.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, hashString } from '../js/track.js';
import { officialCopy, isOfficialCircuit, COPY_PUBLISH_REFUSAL } from '../js/officialCopy.js';
import { verifyPublish, verifyRun, replayRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { botRun } from './seed-officiels.mjs';
import { createHandler } from '../supabase/functions/submit-score/handler.js';

const defs = BUILTIN_TRACKS;
const key = (d) => `b-${d.id}-${hashString(buildBuiltin(d).encode())}`;

console.log('La copie');
test('les 84 circuits officiels : une copie a sa propre clé u-… (jamais une clé b-…), la MÊME physique que l’original, et l’original n’est pas touché', () => {
  for (const d of defs) {
    const orig = buildBuiltin(d);
    const before = { enc: orig.encode(), sig: orig.signatureText(), name: orig.name, tiles: orig.tiles.length, key: key(d) };
    const copy = officialCopy(orig);
    assert.match(copy.userKey, /^u-[0-9a-z]+$/, d.id);
    assert.equal(copy.signatureText(), before.sig, d.id + ' : même circuit physiquement (même clé u-… que le code de l’original ouvert en circuit de joueur)');
    assert.notEqual(copy, orig);
    copy.tiles.pop(); copy.name = 'x'; copy.decor = copy.decor === 'desert' ? 'polar' : 'desert';
    assert.deepEqual({ enc: orig.encode(), sig: orig.signatureText(), name: orig.name, tiles: orig.tiles.length, key: key(d) }, before, d.id + ' : l’original est inchangé après modification de la copie');
  }
});
test('nom et mention : « (copie) » au nom, « Dérivé de … » à la description, auteur et vérification vidés, bornes respectées', () => {
  const o = buildBuiltin(defs[0]);
  const c = officialCopy(o);
  assert.equal(c.name, `${o.name} (copie)`.slice(0, 40));
  assert.equal(c.desc, `Dérivé de « ${o.name} » (circuit officiel)`);
  assert.equal(c.author, ''); assert.equal(c.vt, 0); assert.equal(c.verified, false);
  const long = buildBuiltin(defs[0]); long.name = 'N'.repeat(40);
  assert.ok(officialCopy(long).name.length <= 40);
  assert.ok(Track.decode(c.encode()).desc.startsWith('Dérivé de'), 'la mention survit à l’enregistrement (code du circuit)');
});
test('la copie roule comme l’original : le pilote automatique la termine, rejeu serveur au même temps que l’original', () => {
  const d = defs.find((x) => x.id === 'canyon') || defs[1];
  const orig = buildBuiltin(d), copy = officialCopy(orig);
  const run = botRun(orig, null);
  assert.ok(run);
  const r = replayRun(copy, run.inputs);
  assert.ok(r && Math.abs(r.time - run.time) < 1e-9, 'mêmes commandes, même temps sur la copie');
  assert.equal(verifyRun({ trackKey: key(d), inputs: run.inputs, time: run.time, physVer: PHYS_VER }).ok, true, 'le classement officiel est inchangé');
});

console.log('Règle de publication');
// La preuve de l'auteur : les commandes enregistrées sur l'ORIGINAL (le pilote automatique ne court que sur un circuit officiel : la copie n'a pas sa ligne de pilote) rejouées sur la copie.
const proofFor = (track, def) => {
  const run = botRun(buildBuiltin(def), null);
  assert.ok(run);
  track.setVerified(run.time);
  return { code: track.encode(), inputs: run.inputs, time: run.time, physVer: PHYS_VER };
};
test('isOfficialCircuit : vrai pour un circuit officiel et pour sa copie, quel que soit le nom, la description ou l’auteur ; faux pour un autre circuit', () => {
  const o = buildBuiltin(defs[2]);
  assert.equal(isOfficialCircuit(o), true);
  const c = officialCopy(o); c.name = 'Tout autre nom'; c.desc = 'autre'; c.author = 'moi';
  assert.equal(isOfficialCircuit(c), true);
  assert.equal(isOfficialCircuit(new Track('vide')), false);
});
test('une copie NON modifiée, vérifiée par son auteur, est refusée à la publication par le serveur ; la même copie modifiée est acceptée', () => {
  const d = defs.find((x) => x.id === 'canyon') || defs[1];
  const copy = officialCopy(buildBuiltin(d));
  const refused = verifyPublish(proofFor(copy, d));
  assert.equal(refused.ok, false); assert.equal(refused.error, COPY_PUBLISH_REFUSAL);
  // Une modification qui change le circuit (la signature : le décor en fait partie) sans toucher à la trajectoire : les mêmes commandes arrivent au même temps.
  const mod = officialCopy(buildBuiltin(d));
  mod.decor = mod.decor === 'orbit' ? 'reef' : 'orbit';
  assert.notEqual(mod.signatureText(), buildBuiltin(d).signatureText(), 'la modification change bien la signature');
  assert.equal(isOfficialCircuit(mod), false);
  const run = botRun(buildBuiltin(d), null), again = replayRun(mod, run.inputs);
  assert.ok(again, 'les mêmes commandes arrivent sur la copie modifiée');
  mod.setVerified(again.time);
  const ok = verifyPublish({ code: mod.encode(), inputs: run.inputs, time: again.time, physVer: PHYS_VER });
  assert.equal(ok.ok, true, ok.error); assert.match(ok.key, /^u-/); assert.notEqual(ok.key, officialCopy(buildBuiltin(d)).userKey);
});
test('la fonction serveur répond 422 avec ce message, sans rien écrire (publication d’une copie non modifiée)', async () => {
  const d = defs.find((x) => x.id === 'canyon') || defs[1];
  const sub = proofFor(officialCopy(buildBuiltin(d)), d);
  const calls = [];
  const ok = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = async (url) => {
    const u = String(url); calls.push(u);
    if (u.includes('/auth/v1/user')) return ok({ id: '11111111-2222-3333-4444-555555555555', is_anonymous: false });
    if (u.includes('/rest/v1/players')) return ok([{ id: '11111111-2222-3333-4444-555555555555' }]);
    if (u.includes('rate_check')) return ok(0);
    return ok({}, 404);
  };
  const h = createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch, log: () => {} });
  const r = await h(new Request('https://fn.example/', { method: 'POST', headers: { Authorization: 'Bearer j', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish-track', name: 'Copie', ...sub }) }));
  assert.equal(r.status, 422); assert.equal((await r.json()).error, COPY_PUBLISH_REFUSAL);
  assert.ok(!calls.some((u) => u.includes('publish_track')), 'rien écrit');
});

await finish('Tous les tests de la copie d’un circuit officiel passent.');
