// Aides DOM partagées par tous les écrans.
//
// Règle d'écriture : un texte qui vient d'un joueur (pseudo, nom ou description de circuit, message…) ne se colle jamais tel quel dans un
// gabarit `innerHTML` : on l'échappe avec esc(), ou bien on construit l'élément avec h() (les chaînes y sont ajoutées comme du texte).

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Contenu de joueur (nom de circuit, pseudo, commentaire, nom de mode ou de playlist) : le traducteur anglais (i18n/dom.js) ne le touche jamais (RISK-002).
// Sans cela, un circuit nommé « Jouer » s'afficherait « Play ». OFF s'écrit dans la balise qui contient le texte de joueur : `<h3${OFF}>${esc(nom)}</h3>` ; un nom placé
// à côté d'autres mots s'enveloppe : `par <span${OFF}>${esc(nom)}</span>` (le reste de la phrase reste traduit, le nom non). L'échappement esc() reste écrit à
// l'endroit de l'insertion (tools/test-securite-client.mjs le vérifie sur le texte du gabarit).
export const OFF = ' data-i18n="off"';

// h('button', { class: 'btn', onclick: fn, disabled: true }, 'Texte', autreElement) : élément DOM sans passer par innerHTML.
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}
