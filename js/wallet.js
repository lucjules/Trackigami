// Portefeuille de pièces ◆ : modèle ADDITIF, fusionnable entre appareils sans rien perdre ni rien créer (TECH-029, 0.16.10). Module pur (aucun stockage, aucun réseau).
//
// Le profil garde `coins` (le solde affiché, que lisent aussi les anciens clients) et ajoute `wallet` (versionné, v: 1) :
//   base  : la LIGNE DE BASE commune : le solde d'un profil d'avant ce modèle, repris tel quel à sa première lecture (migration : le total ne change pas) ;
//   pre   : { objet: 1 } les objets possédés à la migration (déjà payés dans `base`) ;
//   dev   : { appareil: [gagné, retiré] } des compteurs MONOTONES par appareil : chaque appareil n'écrit que les siens ;
//   paid  : { objet: prix } les achats faits depuis (un objet n'est payé qu'une fois, même acheté sur deux appareils hors ligne) ;
//   gift  : { objet: 1 } les objets OFFERTS (code caché, récompense) : jamais déduits.
// Solde = base + Σ gagné − Σ retiré − Σ prix payés − prix catalogue des objets possédés que rien n'explique (achetés par un ANCIEN client après la migration).
//
// Fusion de deux profils (cloudsave.mergeProfile) : compteurs au maximum par appareil, achats et cadeaux réunis (prix le plus élevé), lignes de base par l'ancienne règle
// (le plus favorable des deux, moins le prix des objets de l'autre ligne de base qu'il n'avait pas). Chaque partie est un demi-treillis (commutative, associative, idempotente) :
// les appareils convergent quel que soit l'ordre des synchronisations.
//
// INVARIANT (prouvé par tools/test-fusion-fuzz.mjs) : solde ≤ base + somme des gains RÉELS − prix des objets réellement achetés ; égalité quand tous les appareils ont ce modèle.
// Pourquoi : un gain n'est écrit que dans le compteur de l'appareil qui l'a fait (un compteur ne se copie jamais sous un autre nom), le maximum de deux versions d'un même compteur
// est la plus récente, et un achat est une clé (réunie, comptée une fois).
// Ancien client (avant 0.16.10) encore ouvert : il ne lit que `coins` ; ses gains sur un profil déjà migré sont perdus (comme le faisait l'ancienne règle), ses achats sont
// déduits au prix du catalogue : jamais de pièces créées. Un profil SANS portefeuille (jamais touché par ce modèle) est migré : `base` = son solde.
import { itemCost, exclusiveOf } from './cosmetics.js';

export const WALLET_V = 1;
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const pos = (x) => (Number.isFinite(+x) && +x > 0 ? +x : 0);
const ITEM = /^[a-z0-9_-]{1,30}:[a-z0-9_.-]{1,40}$/i;
const DEV = /^[a-z0-9_-]{1,40}$/i;
const split = (k) => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
// Prix d'un objet au catalogue ; un exclusif (jamais en vente) ne coûte rien.
export const catalogCost = (k) => { const [c, id] = split(k); return exclusiveOf(c, id) ? 0 : pos(itemCost(c, id)); };
const owned = (p) => Object.keys(obj(p && p.owned)).filter((k) => obj(p.owned)[k] && ITEM.test(k));
// Offert sans marque : un exclusif, ou la LED arc-en-ciel du code Konami (js/app/wiring.js) que donnait un client d'avant la marque.
const giftLike = (p, k) => { const [c, id] = split(k); return !!exclusiveOf(c, id) || (k === 'led:rainbow' && !!obj(p && p.eggs).konami); };

const keySet = (x) => Object.fromEntries(Object.keys(obj(x)).filter((k) => ITEM.test(k) && obj(x)[k]).sort().map((k) => [k, 1]));
// Le portefeuille v1 d'un profil, nettoyé (valeurs abîmées ignorées), ou null.
export function readWallet(p) {
  const w = p && p.wallet;
  if (!w || typeof w !== 'object' || Array.isArray(w) || w.v !== WALLET_V) return null;
  const dev = {};
  for (const [id, v] of Object.entries(obj(w.dev))) if (DEV.test(id) && Array.isArray(v)) dev[id] = [pos(v[0]), pos(v[1])];
  const paid = {};
  for (const [k, v] of Object.entries(obj(w.paid))) if (ITEM.test(k)) paid[k] = pos(v);
  return { v: WALLET_V, base: pos(w.base), pre: keySet(w.pre), dev, paid, gift: keySet(w.gift) };
}
// Migration d'un profil sans portefeuille : sa ligne de base est son solde, les objets qu'il possède (hors cadeaux) sont réputés payés dedans.
function migrate(p) {
  return { v: WALLET_V, base: pos(p && p.coins), pre: Object.fromEntries(owned(p).filter((k) => !giftLike(p, k)).sort().map((k) => [k, 1])), dev: {}, paid: {}, gift: {} };
}
export const walletOf = (p) => readWallet(p) || migrate(p);

export function balance(p, w = walletOf(p)) {
  let b = w.base;
  for (const [e, s] of Object.values(w.dev)) b += e - s;
  for (const v of Object.values(w.paid)) b -= v;
  for (const k of owned(p)) if (!(k in w.paid) && !(k in w.pre) && !(k in w.gift) && !giftLike(p, k)) b -= catalogCost(k);
  return b;
}

// Le profil (mutable) prend un portefeuille complet et un solde qui en découle ; ce que le code de CET appareil a changé directement dans `coins` depuis (addCoins, une
// remise à zéro…) est d'abord porté au compteur de l'appareil `devId`. Renvoie le profil.
export function settle(p, devId) {
  const w = walletOf(p);
  const target = Number.isFinite(+p.coins) ? +p.coins : null;
  const delta = target == null ? 0 : target - balance(p, w);
  if (delta && devId && DEV.test(devId)) {
    const c = w.dev[devId] || [0, 0];
    w.dev[devId] = delta > 0 ? [c[0] + delta, c[1]] : [c[0], c[1] - delta];
  }
  p.wallet = w;
  p.coins = balance(p, w);
  return p;
}
// Le profil lu sur le disque ou reçu : le portefeuille fait foi (un `coins` modifié par un ancien client n'est pas une source de pièces).
export function fromWallet(p) {
  const w = walletOf(p);
  p.wallet = w;
  p.coins = balance(p, w);
  return p;
}

// Achat : les objets sont payés au prix du catalogue (une fois chacun).
export function recordPurchase(p, items) {
  const w = walletOf(p);
  for (const [c, id] of items) { const k = c + ':' + id; w.paid[k] = Math.max(w.paid[k] || 0, pos(itemCost(c, id))); }
  p.wallet = w;
}
// Cadeau : l'objet est marqué offert (jamais déduit, ni par ce modèle ni par l'ancienne règle de repli).
export function recordGift(p, k) {
  const w = walletOf(p);
  if (ITEM.test(k)) w.gift[k] = 1;
  p.wallet = w;
}

// Fusion de deux portefeuilles (profils a et b : leurs objets et leurs cadeaux servent aux lignes de base). Résultat trié (comparaison stable, sans réécriture inutile).
export function mergeWallets(pa, pb) {
  const a = walletOf(pa), b = walletOf(pb);
  const costOf = (keys) => keys.reduce((s, k) => s + catalogCost(k), 0);
  const notIn = (x, y) => Object.keys(x).filter((k) => !(k in y));
  const base = Math.max(0, a.base - costOf(notIn(b.pre, a.pre)), b.base - costOf(notIn(a.pre, b.pre)));
  const dev = {};
  for (const id of [...new Set([...Object.keys(a.dev), ...Object.keys(b.dev)])].sort()) {
    const x = a.dev[id] || [0, 0], y = b.dev[id] || [0, 0];
    dev[id] = [Math.max(x[0], y[0]), Math.max(x[1], y[1])];
  }
  const paid = {};
  for (const k of [...new Set([...Object.keys(a.paid), ...Object.keys(b.paid)])].sort()) paid[k] = Math.max(a.paid[k] || 0, b.paid[k] || 0);
  return { v: WALLET_V, base, pre: keySet({ ...a.pre, ...b.pre }), dev, paid, gift: keySet({ ...a.gift, ...b.gift }) };
}
