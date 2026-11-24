// Identité dans une salle multijoueur (TECH-040, js/net/identity.js) : engagement, preuve liée à la liaison, rejeu refusé, sauvegarde de l'onglet.
// node tools/test-identite-salle.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { createIdentity, exportIdentity, importIdentity, proofText, prove, checkProof, ctEqual, newNonce, COMMIT_RE, NONCE_RE } from '../js/net/identity.js';

const base = { room: 'ABC234', signer: 'bea', verifier: 'ana', signerFp: 'AA:BB', verifierFp: 'CC:DD', nonce: 'n'.repeat(22) };

console.log('Identité de salle : engagement et preuve');
await test('une identité : engagement SHA-256 (43 signes base64url), clé publique ; deux identités diffèrent', async () => {
  const a = await createIdentity(), b = await createIdentity();
  assert.match(a.commit, COMMIT_RE); assert.notEqual(a.commit, b.commit); assert.notEqual(a.pub, b.pub);
  assert.equal(a.priv.type, 'private');
});

await test('preuve valide acceptée ; tout changement du contexte (salle, identifiants, empreintes DTLS, défi) la fait refuser : pas de rejeu', async () => {
  const id = await createIdentity();
  const sig = await prove(id, proofText(base));
  assert.equal(await checkProof({ pub: id.pub, sig, text: proofText(base), commit: id.commit }), true);
  for (const [k, v] of [['room', 'XYZ789'], ['signer', 'eve'], ['verifier', 'cid'], ['signerFp', 'EE:FF'], ['verifierFp', 'AA:BB'], ['nonce', 'm'.repeat(22)]]) {
    assert.equal(await checkProof({ pub: id.pub, sig, text: proofText({ ...base, [k]: v }), commit: id.commit }), false, 'autre ' + k);
  }
  const swapped = proofText({ ...base, signer: base.verifier, verifier: base.signer, signerFp: base.verifierFp, verifierFp: base.signerFp });
  assert.equal(await checkProof({ pub: id.pub, sig, text: swapped, commit: id.commit }), false, 'preuve renvoyée à son auteur');
});

await test('usurpation : une autre clé ne passe pas l\'engagement de la victime ; une clé de la victime sans sa signature non plus', async () => {
  const victim = await createIdentity(), evil = await createIdentity();
  const text = proofText(base);
  const evilSig = await prove(evil, text);
  assert.equal(await checkProof({ pub: evil.pub, sig: evilSig, text, commit: victim.commit }), false, 'sa propre clé, l\'engagement de la victime');
  assert.equal(await checkProof({ pub: victim.pub, sig: evilSig, text, commit: victim.commit }), false, 'la clé publique de la victime, sa propre signature');
});

await test('entrées abîmées ou hostiles : refusées, sans exception', async () => {
  const id = await createIdentity();
  const sig = await prove(id, proofText(base));
  for (const bad of [
    { pub: null, sig, commit: id.commit }, { pub: id.pub, sig: null, commit: id.commit }, { pub: id.pub, sig, commit: 'x' },
    { pub: 'A'.repeat(120), sig, commit: id.commit }, { pub: id.pub, sig: 'A'.repeat(86), commit: id.commit }, { pub: id.pub + '<', sig, commit: id.commit },
    { pub: { toString: () => id.pub }, sig, commit: id.commit },
  ]) assert.equal(await checkProof({ ...bad, text: proofText(base) }), false, JSON.stringify(Object.keys(bad)));
});

await test('sauvegarde de l\'onglet (rechargement) : la même identité revient ; une sauvegarde abîmée ou incohérente est refusée', async () => {
  const id = await createIdentity();
  const saved = JSON.parse(JSON.stringify(await exportIdentity(id)));             // (comme dans sessionStorage)
  const back = await importIdentity(saved);
  assert.ok(back); assert.equal(back.commit, id.commit);
  const sig = await prove(back, proofText(base));
  assert.equal(await checkProof({ pub: id.pub, sig, text: proofText(base), commit: id.commit }), true, 'la clé relue prouve la même identité');
  const other = await createIdentity();
  assert.equal(await importIdentity({ pub: other.pub, jwk: saved.jwk }), null, 'clé publique d\'un autre : refusée');
  for (const bad of [null, {}, { pub: id.pub }, { pub: id.pub, jwk: { ...saved.jwk, d: 'abc' } }, { pub: id.pub, jwk: { ...saved.jwk, crv: 'P-384' } }]) assert.equal(await importIdentity(bad), null);
});

await test('le secret n\'apparaît dans rien de ce qui est publié ou envoyé (engagement, clé publique, preuve)', async () => {
  const id = await createIdentity();
  const { jwk } = await exportIdentity(id);
  const sent = [id.commit, id.pub, await prove(id, proofText(base))].join(' ');
  assert.ok(jwk.d && jwk.d.length >= 40);
  assert.equal(sent.includes(jwk.d), false);
});

test('comparaison à temps constant : égalité exacte seulement ; longueurs différentes refusées', () => {
  assert.equal(ctEqual('abc', 'abc'), true); assert.equal(ctEqual('abc', 'abd'), false); assert.equal(ctEqual('abc', 'abcd'), false); assert.equal(ctEqual('', ''), true);
});

test('défis : 16 octets aléatoires, jamais deux fois le même', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) { const n = newNonce(); assert.match(n, NONCE_RE); seen.add(n); }
  assert.equal(seen.size, 500);
});

await finish('Tous les tests de l\'identité de salle passent.');
