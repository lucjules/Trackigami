// Fenêtres du COMPTE (Garage › Compte) : changer le mot de passe, créer / régénérer le code de secours, et le bloc d'état du code (COMPLETE-003).
// Le code de secours n'est montré qu'UNE fois, dans cet élément ; il n'est écrit nulle part (ni stockage de l'appareil, ni journal) et il est effacé de la page à la fermeture.
// L'écran d'accueil a son propre affichage du code (js/welcome.js), car l'application n'existe pas encore à ce moment-là.
import { h } from './dom.js';
import { account } from './account.js';
import { checkPassword } from './accountRules.js';
import { locale } from './i18n.js';

const field = (label, input) => h('label', { class: 'wl-field' }, h('span', {}, label), input);
const pwInput = (name, autocomplete) => h('input', { type: 'password', name, maxlength: '72', autocomplete, required: true });

// Écrit dans l'élément d'erreur d'une fenêtre ; rend le champ à corriger au joueur.
const say = (el, msg) => { el.textContent = msg || ''; };

// ---- Changer le mot de passe (re-authentification par le mot de passe ACTUEL) ---------------------------------------------------------------------------------
export function openChangePassword(ui) {
  const cur = pwInput('current-password', 'current-password'), next = pwInput('new-password', 'new-password'), again = pwInput('new-password2', 'new-password');
  const err = h('p', { class: 'mp-err', role: 'alert' });
  let busy = false;
  const body = h('form', { class: 'acct-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('p', { class: 'prof-note' }, 'Pour ta sécurité, entre ton mot de passe actuel. Les autres appareils connectés à ce compte devront se reconnecter avec le nouveau.'),
    field('Mot de passe actuel', cur), field('Nouveau mot de passe', next), field('Confirmer le nouveau mot de passe', again), err);
  async function submit() {
    if (busy) return;
    say(err, '');
    const p = checkPassword(next.value, account.username);
    if (!cur.value) { say(err, 'Entre ton mot de passe actuel.'); cur.focus(); return; }
    if (!p.ok) { say(err, p.error); next.focus(); return; }
    if (next.value !== again.value) { say(err, 'Les deux mots de passe ne sont pas identiques.'); again.focus(); return; }
    busy = true;
    try {
      await account.changePassword(cur.value, next.value);
      cur.value = next.value = again.value = '';
      ui.closeModal();
      ui.flash('Mot de passe changé. Les autres appareils devront se reconnecter.', 4);
    } catch (e) {
      say(err, e && e.message ? e.message : 'Une erreur est survenue.');
      (e && e.code === 'bad-credentials' ? cur : next).focus();
    } finally { busy = false; }
  }
  ui.modal({ title: 'Changer le mot de passe', body, actions: [{ label: 'Changer le mot de passe', primary: true, onClick: () => { submit(); return false; } }, { label: 'Annuler' }] });
  setTimeout(() => cur.focus(), 50);
}

// ---- Code de secours : montré UNE fois ---------------------------------------------------------------------------------------------------------------------------
export function showCodeOnce(ui, code, { title = 'Ton code de secours', intro } = {}) {
  const out = h('span', { 'data-i18n': 'off' }, code);            // (le code n'est jamais traduit ; l'étiquette du <output>, elle, l'est)
  const box = h('output', { class: 'rc-code', 'aria-label': 'Code de secours' }, out);
  const err = h('p', { class: 'mp-err', role: 'alert' });
  const ok = h('input', { type: 'checkbox' });
  const copy = h('button', { type: 'button', class: 'btn', onclick: async () => {
    try { await navigator.clipboard.writeText(code); copy.textContent = 'Code copié'; }
    catch { const r = document.createRange(); r.selectNodeContents(out); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); say(err, 'Copie impossible ici : le code est sélectionné, copie-le à la main.'); }
  } }, 'Copier le code');
  let acknowledged = false;
  const body = h('div', { class: 'acct-form' },
    h('p', { class: 'prof-note' }, intro || 'Voici ton code de secours : c’est le seul moyen de retrouver ton compte si tu perds ton mot de passe. Il ne s’affiche qu’une fois : note-le (papier, gestionnaire de mots de passe).'),
    box, h('div', { class: 'row' }, copy),
    h('label', { class: 'wl-check' }, ok, h('span', {}, 'J’ai noté mon code de secours en lieu sûr.')), err);
  ui.modal({
    title, body,
    actions: [{ label: 'Terminé', primary: true, onClick: () => {
      if (!ok.checked) { say(err, 'Coche la case une fois ton code noté.'); ok.focus(); return false; }
      acknowledged = true;
      return true;
    } }],
    // Fermée sans l'avoir noté (Échap, clic ailleurs) : le code est perdu, on le dit et on montre où en créer un autre. Dans tous les cas il quitte la page.
    onClose: () => { out.textContent = ''; if (!acknowledged) ui.flash('Code de secours non noté : crée-en un nouveau dans Garage › Compte.', 6); },
  });
  setTimeout(() => copy.focus(), 50);
}

// ---- Créer / régénérer le code (confirmation par mot de passe) ----------------------------------------------------------------------------------------------
export function openRecoveryCode(ui, { regenerate = false, onDone = () => {} } = {}) {
  const pw = pwInput('password', 'current-password');
  const err = h('p', { class: 'mp-err', role: 'alert' });
  let busy = false;
  const body = h('form', { class: 'acct-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('p', { class: 'prof-note' }, regenerate
      ? 'Un nouveau code remplace l’ancien, qui ne servira plus. Entre ton mot de passe pour confirmer.'
      : 'Le code de secours te permet de retrouver ton compte si tu perds ton mot de passe (il n’y a pas d’e-mail). Entre ton mot de passe pour le créer.'),
    field('Mot de passe', pw), err);
  async function submit() {
    if (busy) return;
    say(err, '');
    if (!pw.value) { say(err, 'Entre ton mot de passe.'); pw.focus(); return; }
    busy = true;
    try {
      const code = await account.createRecoveryCode(pw.value);
      pw.value = '';
      showCodeOnce(ui, code, { title: regenerate ? 'Ton nouveau code de secours' : 'Ton code de secours' });
      onDone();
    } catch (e) { say(err, e && e.message ? e.message : 'Une erreur est survenue.'); pw.focus(); } finally { busy = false; }
  }
  ui.modal({ title: regenerate ? 'Régénérer mon code de secours' : 'Créer mon code de secours', body,
    actions: [{ label: regenerate ? 'Régénérer mon code' : 'Créer mon code', primary: true, onClick: () => { submit(); return false; } }, { label: 'Annuler' }] });
  setTimeout(() => pw.focus(), 50);
}

// ---- Bloc d'état du code dans l'écran du compte ---------------------------------------------------------------------------------------------------------------
// Compte SANS code valable (compte d'avant l'étape 21, ou code déjà servi) : on le propose, sans jamais bloquer le jeu ni ouvrir de fenêtre de force. Serveur sans l'étape 21,
// hors ligne : rien n'est montré. Avec un code : la date et « Régénérer ».
export async function fillRecoveryBlock(box, ui) {
  box.textContent = '';
  const st = await account.recoveryStatus();
  if (!box.isConnected) return;
  if (st.state === 'none') {
    box.append(h('div', { class: 'acct-warn' },
      h('p', { class: 'prof-note' }, h('b', {}, 'Pas de code de secours.'), ' Si tu perds ton mot de passe, ce compte et sa sauvegarde en ligne seront perdus. Crée ton code maintenant : il tient en une ligne à noter.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', 'data-a': 'rc-create', onclick: () => openRecoveryCode(ui, { onDone: () => fillRecoveryBlock(box, ui) }) }, 'Créer mon code de secours'))));
  } else if (st.state === 'active') {
    const d = st.createdAt ? new Date(st.createdAt).toLocaleDateString(locale()) : '';
    box.append(h('div', { class: 'meta' }, d ? `Code de secours : actif depuis le ${d} · ` : 'Code de secours : actif · ',
      h('button', { type: 'button', class: 'link-btn', 'data-a': 'rc-regen', onclick: () => openRecoveryCode(ui, { regenerate: true, onDone: () => fillRecoveryBlock(box, ui) }) }, 'Régénérer mon code')));
  }
}
