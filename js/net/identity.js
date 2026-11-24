// Identité d'un joueur dans une salle multijoueur (TECH-040 ; modèle de menaces : docs/MENACES-MULTIJOUEUR.md). Seulement l'API Web Crypto standard
// (ECDSA P-256 avec SHA-256, SHA-256) : aucune cryptographie maison, aucune dépendance.
//
//   secret de reprise   une clé privée ECDSA tirée à l'arrivée dans la salle. Elle ne quitte JAMAIS le navigateur : ni la présence, ni les messages, ni un journal,
//                       ni le DOM ; elle n'est gardée (sessionStorage, resume.js) que pour retrouver sa place après un rechargement de l'onglet ;
//   engagement          l'empreinte SHA-256 de la clé publique (SPKI), en base64url (43 signes) : la seule chose publiée dans la présence ;
//   preuve              à l'ouverture d'une liaison, chacun signe le défi aléatoire tiré par l'autre, lié au code de la salle, aux deux identifiants et aux deux
//                       empreintes DTLS de CETTE liaison : elle ne se rejoue ni sur une autre liaison, ni dans une autre salle, ni plus tard, et un intermédiaire
//                       qui relaierait les messages (autres empreintes DTLS de chaque côté) ne peut pas la produire.
//   description signée  chaque offre et chaque réponse WebRTC porte aussi une signature sur son empreinte DTLS (et, pour une réponse, sur celle de l'offre) ;
//                       chaque candidat ICE, une signature sur son texte et l'empreinte DTLS de la connexion de son auteur : la négociation qu'un client modifié
//                       lance ou perturbe au nom d'un autre est écartée avant d'ouvrir une liaison (transport.js, point 9).
// Pourquoi une signature et pas le secret lui-même : un membre qui recevrait le secret pourrait le rejouer aussitôt auprès d'un autre membre.

const KEY = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
export const COMMIT_RE = /^[A-Za-z0-9_-]{43}$/;          // SHA-256 en base64url sans remplissage
const PUB_RE = /^[A-Za-z0-9_-]{80,200}$/;                // SPKI d'une clé P-256 (91 octets) en base64url
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;                    // signature ECDSA P-256 au format IEEE P1363 (64 octets)
export const NONCE_RE = /^[A-Za-z0-9_-]{22}$/;           // défi : 16 octets aléatoires
const PROOF_TAG = 'trackigami-salle-v1';
const DESC_TAG = 'trackigami-desc-v1';
const ICE_TAG = 'trackigami-ice-v1';

const subtleOf = () => globalThis.crypto && globalThis.crypto.subtle;
export const identityAvailable = () => !!subtleOf();

// Opérations en cours (les bancs à horloge simulée attendent qu'elles soient finies : Web Crypto travaille hors de leur horloge).
let inflight = 0;
export const identityBusy = () => inflight > 0;
const track = async (p) => { inflight++; try { return await p; } finally { inflight--; } };

export function b64u(buf) {
  const a = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Comparaison à temps constant de deux chaînes (engagements) : le temps ne dépend que de la longueur, qui n'est pas secrète.
export function ctEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function commitOf(pub) {
  return b64u(await subtleOf().digest('SHA-256', unb64u(pub)));
}

export function newNonce() { return b64u(globalThis.crypto.getRandomValues(new Uint8Array(16))); }

// Nouvelle identité : { pub, commit, priv } (priv : CryptoKey ; extractible pour être gardée le temps de la session de l'onglet).
export function createIdentity() { return track(createIdentity0()); }
async function createIdentity0() {
  const kp = await subtleOf().generateKey(KEY, true, ['sign', 'verify']);
  const pub = b64u(await subtleOf().exportKey('spki', kp.publicKey));
  return { pub, commit: await commitOf(pub), priv: kp.privateKey };
}

// Pour sessionStorage : { pub, jwk } ; relue par importIdentity (null si elle est abîmée).
export function exportIdentity(id) { return track((async () => ({ pub: id.pub, jwk: await subtleOf().exportKey('jwk', id.priv) }))()); }
export function importIdentity(saved) { return track(importIdentity0(saved)); }
async function importIdentity0(saved) {
  try {
    if (!saved || typeof saved.pub !== 'string' || !PUB_RE.test(saved.pub) || !saved.jwk || saved.jwk.kty !== 'EC' || saved.jwk.crv !== 'P-256') return null;
    const priv = await subtleOf().importKey('jwk', saved.jwk, KEY, true, ['sign']);
    const id = { pub: saved.pub, commit: await commitOf(saved.pub), priv };
    // La clé publique gardée correspond-elle bien à la clé privée ? (une sauvegarde abîmée ne doit pas produire des preuves refusées partout)
    const t = new TextEncoder().encode('auto-vérification');
    const pubKey = await subtleOf().importKey('spki', unb64u(saved.pub), KEY, false, ['verify']);
    return (await subtleOf().verify(SIGN, pubKey, await subtleOf().sign(SIGN, priv, t), t)) ? id : null;
  } catch { return null; }
}

// Le texte signé : tout ce qui rend la preuve propre à cette salle, à cette paire, à cette liaison, à ce défi.
export function proofText({ room, signer, verifier, signerFp, verifierFp, nonce }) {
  return [PROOF_TAG, room, signer, verifier, signerFp || '', verifierFp || '', nonce].map((x) => String(x).replace(/\n/g, ' ')).join('\n');
}

// Le texte signé d'une description WebRTC : la salle, l'auteur, le destinataire, le type, l'empreinte DTLS de l'auteur et (réponse) celle de l'offre. Sans
// la clé DTLS de cette empreinte, une description rejouée n'ouvre rien ; une réponse ne sert qu'à l'offre à laquelle elle répond.
export function descText({ room, signer, verifier, type, fp, peerFp }) {
  return [DESC_TAG, room, signer, verifier, type, fp || '', peerFp || ''].map((x) => String(x).replace(/\n/g, ' ')).join('\n');
}

// Le texte signé d'un candidat ICE (adresse réseau) : il ne vaut que pour la connexion de son auteur (empreinte DTLS de SA description) et pour ce destinataire.
// Sans cela, quiconque envoie sous l'identifiant d'un joueur peut glisser ses propres adresses dans la négociation et la faire échouer (constaté en essai).
export function iceText({ room, signer, verifier, fp, candidate }) {
  return [ICE_TAG, room, signer, verifier, fp || '', candidate].map((x) => String(x).replace(/\n/g, ' ')).join('\n');
}

export function prove(id, text) { return track((async () => b64u(await subtleOf().sign(SIGN, id.priv, new TextEncoder().encode(text))))()); }

// Vrai si `pub` correspond à l'engagement attendu ET si `sig` est une signature valide de `text` par cette clé. Jamais d'exception.
export function checkProof(args) { return track(checkProof0(args)); }
async function checkProof0({ pub, sig, text, commit }) {
  try {
    if (typeof pub !== 'string' || !PUB_RE.test(pub) || typeof sig !== 'string' || !SIG_RE.test(sig) || typeof commit !== 'string' || !COMMIT_RE.test(commit)) return false;
    if (!ctEqual(await commitOf(pub), commit)) return false;
    const key = await subtleOf().importKey('spki', unb64u(pub), KEY, false, ['verify']);
    return await subtleOf().verify(SIGN, key, unb64u(sig), new TextEncoder().encode(text));
  } catch { return false; }
}
