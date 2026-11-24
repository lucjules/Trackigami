// Écran d'accueil : le menu principal ne s'ouvre qu'une fois le pseudo défini.
//   Invité   : pseudo pour la session, progression locale sur cet appareil ;
//   Compte   : pseudo + mot de passe, progression sauvegardée dans le cloud (récupérable depuis n'importe quel appareil).
// Un compte déjà connecté sur cet appareil, ou un invité de la session en cours, passe directement.
import { account, checkPseudo, checkPassword } from './account.js';
import { normalizeRecoveryCode } from './accountRules.js';
import { $ } from './dom.js';


const MODES = {
  guest: {
    submit: 'Jouer en invité',
    hint: 'Choisis un pseudo. Progression sur cet appareil ; un compte la suit partout.',
    pw: false, pw2: false, keep: false, age: false,
  },
  login: {
    submit: 'Se connecter',
    hint: 'Retrouve ta progression, tes circuits et tes records depuis n’importe quel appareil.',
    pw: true, pw2: false, keep: false, age: false,
  },
  signup: {
    submit: 'Créer mon compte',
    hint: 'Pseudo unique de 3 à 20 lettres, chiffres ou _ ; mot de passe de 8 caractères au moins. Sans e-mail : un code de secours te sera remis pour récupérer ton compte, note-le.',
    pw: true, pw2: true, keep: true, age: true,
  },
  // « J'ai perdu mon mot de passe » (COMPLETE-003) : ce n'est pas un onglet, on y arrive depuis la connexion. Le pseudo, le code de secours remis à l'inscription et un nouveau mot de passe.
  recover: {
    submit: 'Récupérer mon compte',
    hint: 'Entre ton pseudo, le code de secours remis à la création du compte et un nouveau mot de passe. Un code ne sert qu’une fois : un nouveau t’est remis ensuite.',
    pw: true, pw2: true, keep: false, age: false, code: true,
  },
};

// Résout { kind: 'guest' | 'account', username } quand le joueur est identifié.
export async function runWelcome() {
  const restored = await account.restore();
  if (restored.kind === 'account') return restored;
  const guest = account.resumeGuest();
  if (guest) return guest;
  return new Promise((resolve) => showForm(resolve, restored.kind === 'expired' ? restored.username : ''));
}

function showForm(done, expiredName) {
  const root = $('welcome'), form = $('wl-form');
  const name = $('wl-name'), pw = $('wl-pw'), pw2 = $('wl-pw2'), keep = $('wl-keep'), age = $('wl-age'), err = $('wl-error'), submit = $('wl-submit'), code = $('wl-code');
  const forgot = $('wl-forgot');
  const tabs = [...root.querySelectorAll('[data-wl]')];
  let mode = expiredName ? 'login' : 'guest';
  const guestProgress = account.hasGuestProgress();

  const setError = (m) => { err.textContent = m || ''; };
  function setMode(m, focus = true) {
    mode = m;
    const cfg = MODES[m];
    const tab = m === 'recover' ? 'login' : m;            // (la récupération se lit comme une suite de la connexion)
    tabs.forEach((t) => { const on = t.dataset.wl === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    $('wl-hint').textContent = cfg.hint;
    $('wl-code-wrap').hidden = !cfg.code;
    $('wl-pw-wrap').hidden = !cfg.pw;
    $('wl-pw2-wrap').hidden = !cfg.pw2;
    $('wl-pw-wrap').firstElementChild.textContent = m === 'recover' ? 'Nouveau mot de passe' : 'Mot de passe';
    $('wl-pw2-wrap').firstElementChild.textContent = m === 'recover' ? 'Confirmer le nouveau mot de passe' : 'Confirmer le mot de passe';
    $('wl-forgot-wrap').hidden = !(m === 'login' || m === 'recover');
    forgot.textContent = m === 'recover' ? '← Retour à la connexion' : 'J’ai perdu mon mot de passe';
    $('wl-keep-wrap').hidden = !(cfg.keep && guestProgress);
    $('wl-age-wrap').hidden = !cfg.age;
    pw.autocomplete = m === 'signup' || m === 'recover' ? 'new-password' : 'current-password';
    code.value = '';
    submit.textContent = cfg.submit;
    name.value = m === 'guest' ? account.lastGuestName() : (m === 'login' || m === 'recover' ? expiredName || account.lastAccountName() : '');
    pw.value = ''; pw2.value = '';
    setError(m === 'login' && expiredName ? 'Ta session a expiré : reconnecte-toi.' : '');
    if (focus) (name.value && cfg.pw ? (cfg.code ? code : pw) : name).focus();
  }
  tabs.forEach((t) => { t.onclick = () => setMode(t.dataset.wl); });
  forgot.onclick = () => setMode(mode === 'recover' ? 'login' : 'recover');
  root.querySelector('.wl-tabs').onkeydown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabs.findIndex((t) => t.dataset.wl === (mode === 'recover' ? 'login' : mode));
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setMode(n.dataset.wl); n.focus();
  };

  let busy = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    // Validation locale d'abord : messages précis, sans appel réseau.
    const c = checkPseudo(name.value, { account: mode !== 'guest' });
    if (!c.ok && !(mode === 'login')) { setError(c.error); name.focus(); return; }
    if (mode === 'login' && !pw.value) { setError('Entre ton mot de passe.'); pw.focus(); return; }
    if (mode === 'recover') {
      // Mêmes règles que l'inscription, jugées ici avant tout appel ; le serveur les redit (il ne fait jamais confiance au client).
      if (!c.ok) { setError(c.error); name.focus(); return; }
      if (!normalizeRecoveryCode(code.value).ok) { setError('Le code de secours fait 16 signes (chiffres et lettres), notés par groupes de 4 : XXXX-XXXX-XXXX-XXXX.'); code.focus(); return; }
      const p = checkPassword(pw.value, c.name);
      if (!p.ok) { setError(p.error); pw.focus(); return; }
      if (pw.value !== pw2.value) { setError('Les deux mots de passe ne sont pas identiques.'); pw2.focus(); return; }
    }
    if (mode === 'signup') {
      const p = checkPassword(pw.value, c.name);
      if (!p.ok) { setError(p.error); pw.focus(); return; }
      if (pw.value !== pw2.value) { setError('Les deux mots de passe ne sont pas identiques.'); pw2.focus(); return; }
      // (0.12.4) Un compte permet de publier : 15 ans au moins, ou l'accord d'un parent (article 45 de la loi Informatique et Libertés), et les règles acceptées.
      if (!age.checked) { setError('Coche la case : 15 ans ou plus (ou l’accord d’un parent) et les règles de la communauté.'); age.focus(); return; }
    }
    busy = true; submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = mode === 'guest' ? '…' : 'Un instant…';
    try {
      let id;
      if (mode === 'guest') id = account.startGuest(name.value);
      else if (mode === 'login') id = await account.signIn(name.value, pw.value);
      else if (mode === 'recover') id = await account.recoverAccount(name.value, code.value, pw.value);
      else id = await account.signUp(name.value, pw.value, { keepGuest: keep.checked && guestProgress });
      pw.value = ''; pw2.value = ''; code.value = '';
      // Le code de secours (inscription, ou nouveau code après une récupération) est montré UNE fois, avant d'entrer : il n'est écrit nulle part.
      if (id.recoveryCode) await showRecoveryCode(root, form, id.recoveryCode, id.recovered ? 'recovered' : 'signup');
      delete id.recoveryCode;
      root.classList.add('hidden');
      done(id);
    } catch (ex) {
      setError(ex && ex.message ? ex.message : 'Une erreur est survenue.');
      busy = false; submit.disabled = false; submit.textContent = label;
      (ex && (ex.code === 'bad-credentials') ? pw : ex && ex.code === 'name-taken' ? name : mode === 'recover' ? code : pw).focus();
    }
  };

  root.classList.remove('hidden');
  setMode(mode);
}

// Affiche le code de secours UNE fois, à la place du formulaire ; rend la main quand le joueur a coché « J'ai noté… » et continué. Le code reste dans CET élément (jamais dans le stockage de l'appareil) ;
// il est effacé de la page dès la sortie. Tant qu'il n'est pas noté, fermer l'onglet demande une confirmation (le code ne se retrouve pas ; on peut en créer un autre dans Profil › Compte).
function showRecoveryCode(root, form, code, why) {
  const box = $('wl-recovery'), out = $('wl-rc-code'), ok = $('wl-rc-ok'), go = $('wl-rc-go'), err = $('wl-rc-error'), copy = $('wl-rc-copy');
  $('wl-title').hidden = true; root.querySelector('.wl-tabs').hidden = true; form.hidden = true;
  $('wl-rc-intro').textContent = why === 'recovered'
    ? 'Ton mot de passe est changé et tu es connecté. L’ancien code est consommé : voici ton NOUVEAU code de secours. Il ne s’affiche qu’une fois : note-le (papier, gestionnaire de mots de passe).'
    : 'Ton compte est créé. Voici ton code de secours : c’est le seul moyen de retrouver ton compte si tu perds ton mot de passe. Il ne s’affiche qu’une fois : note-le (papier, gestionnaire de mots de passe).';
  out.textContent = code;
  ok.checked = false; err.textContent = '';
  box.hidden = false;
  const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', guard);
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(code); copy.textContent = 'Code copié'; }
    catch { const r = document.createRange(); r.selectNodeContents(out); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); err.textContent = 'Copie impossible ici : le code est sélectionné, copie-le à la main.'; }
  };
  return new Promise((resolve) => {
    go.onclick = () => {
      if (!ok.checked) { err.textContent = 'Coche la case une fois ton code noté.'; ok.focus(); return; }
      window.removeEventListener('beforeunload', guard);
      out.textContent = '';
      box.hidden = true;
      resolve();
    };
    copy.focus();
  });
}
