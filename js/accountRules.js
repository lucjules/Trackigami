// Règles des comptes PARTAGÉES entre le jeu (js/account.js) et la fonction serveur « account-recovery » (supabase/functions/account-recovery) : pseudo, mot de passe, code de secours.
// Fichier PUR (aucun import, aucun accès au navigateur ni au stockage) : le même code tourne dans le navigateur, sous Node (tests) et sous Deno (fonction). Une règle de plus ou de moins
// ici vaut des deux côtés : le client refuse avant d'envoyer, le serveur redit non (il ne fait jamais confiance au client).
// Les règles de PSEUDO sont aussi dans supabase/etape4-comptes.sql (domaine des adresses, format) : à tenir ensemble.

const FORBIDDEN_NAMES = ['player', 'pilote'];

// Pseudo : jamais « Player » / « Pilote ». Invité : 2 à 20 caractères lisibles ; compte : 3 à 20 lettres, chiffres ou _.
export function checkPseudo(raw, { account = false } = {}) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Choisis un pseudo.' };
  if (FORBIDDEN_NAMES.includes(name.toLowerCase())) return { ok: false, error: '« Player » et « Pilote » sont réservés : choisis ton propre pseudo.' };
  if (account) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return { ok: false, error: 'Le pseudo d’un compte fait 3 à 20 caractères : lettres, chiffres ou _ (sans espace ni accent).' };
  } else if (!/^[\p{L}\p{N} _.'-]{2,20}$/u.test(name)) {
    return { ok: false, error: 'Le pseudo fait 2 à 20 caractères (lettres, chiffres, espace, _ . - \').' };
  }
  return { ok: true, name };
}

// Mot de passe : 8 caractères au moins ; 72 octets au plus (bcrypt ignore la suite).
export function checkPassword(pw, pseudo = '') {
  const s = String(pw ?? '');
  if (s.length < 8) return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
  if (new TextEncoder().encode(s).length > 72) return { ok: false, error: 'Le mot de passe est trop long (72 octets au plus).' };
  if (pseudo && s.toLowerCase() === String(pseudo).toLowerCase()) return { ok: false, error: 'Le mot de passe ne doit pas être ton pseudo.' };
  return { ok: true };
}

// ---- Code de secours (supabase/etape21-recuperation.sql : recovery_code_new) -------------------------------------------------------------------------------
// 16 signes tirés dans cet alphabet de 32 (base 32 de Crockford : ni I, L, O ni U, qu'on confond avec 1, 0 et V) = 80 bits d'aléa. Affiché « XXXX-XXXX-XXXX-XXXX ».
// Le code ne sert qu'une fois, ne se range jamais dans le stockage de l'appareil, et n'est jamais envoyé à la base : la fonction serveur n'en transmet que l'empreinte SHA-256.
export const RECOVERY_CODE_LENGTH = 16;
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;

// Forme canonique d'un code saisi : majuscules, sans espace ni tiret, et les confusions usuelles corrigées comme le fait Crockford (O → 0, I et L → 1).
// { ok: true, code: '16 signes' } ou { ok: false } (jamais de message : un refus de forme ne dit rien du compte).
export function normalizeRecoveryCode(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return { ok: false };
  const code = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE_RE.test(code) ? { ok: true, code } : { ok: false };
}

// « XXXX-XXXX-XXXX-XXXX » pour l'affichage et la copie.
export function formatRecoveryCode(code) {
  const c = String(code ?? '').replace(/[\s-]/g, '');
  return c.match(/.{1,4}/g)?.join('-') ?? '';
}
