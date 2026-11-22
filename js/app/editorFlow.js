// Passages entre le menu et l'éditeur : ouverture, aide, retour, essai d'un circuit.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { keyLabel } from '../input.js';
import { medalIcon } from '../ui.js';
import { esc } from '../dom.js';
import { MEDALS } from '../medals.js';
import { Track, hashString } from '../track.js';
import { getEditorDraft, formatTime } from '../storage.js';
import { saveProof } from '../authorProof.js';
export const editorFlowMethods = {
  // L'éditeur (et l'inspecteur, les outils de remplissage, les familles de pièces…) pèse un quart du code du jeu : il n'est chargé qu'à la première
  // ouverture, pas au démarrage. Un second appel pendant le chargement est ignoré.
  async openEditor(state) {
    if (this._openingEditor) return;
    this._openingEditor = true;
    try {
      const { EditorSession } = await import('../editor.js');
      this._dispose();
      this.mode = 'editor';
      this.ui.showScreen(null);
      this.ui.setMode('editor');
      // Le brouillon d'une version d'avant 0.12.0 ne dit pas s'il était enregistré : on le considère modifié (au pire, un enregistrement de trop).
      let st = state;
      if (!st) { st = getEditorDraft() || {}; if (st.code && st.dirty === undefined) st.dirty = true; }
      // Un autre circuit s'ouvre : l'état gardé pour un retour d'essai ne le concerne pas.
      if (!st.keepId) this._editorKeep = null;
      this.session = new EditorSession(this, st);
      this.audio.music.play('menu');
      this._resize();
    } finally { this._openingEditor = false; }
  },

  _keysOf(action) {
    // (Pendant un déplacement silencieux du Replay Theater, `app.input` est un objet muet : ses « liaisons » n'ont rien d'une liste. Les messages qui citent une touche
    // — « bloqué », fin de replay — sont alors calculés pour rien ; ils ne doivent pas lever d'exception.)
    const b = this.input.bindings[action];
    const k = (Array.isArray(b) ? b : []).filter(Boolean).map(keyLabel);
    return k.length ? k.join(' / ') : '—';
  },

  editorHelp() {
    const L = (a) => this._keysOf(a);
    const rows = [
      ['Clic', 'Poser (glisser : plusieurs)'],
      ['Clic droit', 'Supprimer'],
      ['Clic droit glissé', 'Tourner la vue'],
      ['Clic molette', 'Pipette'],
      ['Clic molette glissé', 'Déplacer la vue'],
      ['Molette', 'Zoom (Alt : taille du décor)'],
      ['Maj + molette', 'Niveau + / −'],
      ['Maj + souris', 'Inspecter : déplacer à la verticale'],
      [L('ed.levelUp') + ' / ' + L('ed.levelDown'), 'Niveau + / −'],
      [L('ed.rotate'), 'Pivoter (Maj : sens inverse)'],
      [L('ed.mirror'), 'Miroir gauche / droite'],
      [L('ed.orient'), 'Orientation suivante : à l’endroit, à l’envers, sur un mur (Maj : précédente)'],
      [L('ed.nextPiece'), 'Pièce suivante (Maj : précédente)'],
      [L('ed.extend'), 'Prolonger : pose la pièce choisie au bout de la dernière pièce, raccordée'],
      ['Q', 'Sélection de zone (glisser DANS la zone : la déplacer)'],
      [L('ed.inspect'), 'Inspecter (propriétés, gizmos)'],
      ['Ctrl + D', 'Dupliquer toute la zone sélectionnée (ou la pièce inspectée)'],
      ['Ctrl + C / X / V / A', 'Copier / couper / coller / tout'],
      [L('ed.levelView'), 'Vue par niveau'],
      [L('ed.verify'), 'Vérifier le circuit'],
      [L('ed.params'), 'Circuit : nom, décor, départ, conditions, ambiance, déclencheurs, logique'],
      [L('ed.groups') + ' · ' + L('ed.logic'), 'Calques et groupes · logique du circuit'],
      ['Échap', 'Refermer l’inspecteur ou la sélection, puis revenir au menu (le circuit modifié est enregistré)'],
      ['Maj + ' + L('ed.test'), 'Tester depuis la pièce visée'],
      [L('ed.surface'), 'Revêtement suivant'],
      [L('ed.fill'), 'Remplir une zone (interrupteur des outils Pistes et Peinture)'],
      [L('ed.snap'), 'Accrochage des décors'],
      [L('ed.scaleUp') + ' / ' + L('ed.scaleDown'), 'Taille du décor'],
      [L('ed.erase'), 'Gomme (répéter : filtre)'],
      [`${L('accelerate')} ${L('left')} ${L('brake')} ${L('right')}`, 'Déplacer la vue'],
      [L('ed.recenter') + ' · ' + L('ed.topView') + ' · ' + L('ed.grid'), 'Recentrer · dessus · grille'],
      [L('ed.test'), 'Tester'],
      ['Ctrl + Z / Y / S', 'Annuler / rétablir / enregistrer'],
      ['Manette', 'Stick droit : curseur · A : poser · B : effacer · X : pivoter · Y : tester · LB/RB : niveau'],
    ];
    this.ui.modal({
      title: 'Raccourcis de l’éditeur',
      wide: true,
      body: `<div class="kbd-list">${rows.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>
        <p style="margin-top:14px">Touches modifiables : Paramètres › Commandes.</p>`,
      actions: [{ label: 'OK', primary: true }],
    });
  },

  // Quitter l'éditeur enregistre le circuit dans « Mes circuits » s'il a changé (0.12.0) : avant, seul l'unique brouillon le gardait, et la session suivante l'écrasait.
  // Si l'enregistrement échoue (stockage plein, code trop long), on reste dans l'éditeur ET une fenêtre propose les trois issues (TECH-059) : rester, exporter le code du
  // circuit (le copier pour ne pas le perdre), ou quitter sans enregistrer (le brouillon reste, s'il tient). Avant, aucune issue : on ne pouvait plus sortir que par un
  // rechargement de la page, qui perdait le travail.
  // next : ce qu'on fait une fois sorti (aller à « Mes circuits »…) ; discard : quitter sans enregistrer (choix fait dans la fenêtre).
  leaveEditor(next = null, { discard = false } = {}) {
    const ed = this.session && this.session.kind === 'editor' ? this.session : null;
    const r = ed && !discard ? ed.autoSave() : '';
    if (r === 'failed') { this.saveFailedModal(ed, { leaveLabel: 'Quitter sans enregistrer', onLeave: () => this.leaveEditor(next, { discard: true }) }); return false; }
    const name = ed ? ed.track.name : '';
    this._editorKeep = null;
    this.showMenu('menu');
    if (r === 'saved') this.ui.flash(`« ${name} » enregistré dans « Mes circuits ».`, 2.6);
    if (next) next();
    return true;
  },

  // Fenêtre « l'enregistrement a échoué » : le circuit n'est pas enregistré (stockage plein ou bloqué, code trop long). leaveLabel / onLeave : l'issue qui abandonne le travail
  // non enregistré (quitter, recharger la page pour la nouvelle version).
  saveFailedModal(ed, { leaveLabel, onLeave }) {
    const body = document.createElement('div');
    body.innerHTML = `<p>« ${esc(ed.track.name)} » n’a pas pu être enregistré dans « Mes circuits » : le stockage du navigateur est plein ou bloqué, ou le circuit est trop grand.</p><p class="meta">Exporte le code du circuit pour ne pas le perdre, ou reste dans l’éditeur pour le réduire (retirer des pièces ou des décorations).</p>`;
    this.ui.modal({
      title: 'Circuit non enregistré', body,
      actions: [
        { label: 'Rester dans l’éditeur', primary: true },
        { label: 'Exporter le code', onClick: () => { setTimeout(() => this.shareModal(ed.track.encode(), ed.track.name, ed.track), 0); return true; } },
        { label: leaveLabel, danger: true, onClick: () => { setTimeout(onLeave, 0); return true; } },
      ],
    });
  },

  // Test depuis l'éditeur. verify : course complète qui vérifie le circuit (temps de l'auteur).
  testTrack(state, spawn = null, verify = false) {
    this.editorState = state;
    const track = Track.decode(state.code);
    this.playTrack(track, { fromEditor: true, verify: verify && !spawn, trackKey: 'e-' + hashString(state.code), seed: 'editeur-test', spawn });
    if (!track.count('finish') && !verify) this.ui.flash('Essai libre : ce circuit n’a pas d’arrivée (Échap pour revenir à l’éditeur).', 3);
    else if (spawn) this.ui.flash('Test depuis la pièce visée : sans checkpoints, médaille ni vérification.', 2.6);
    else if (verify) this.ui.flash('Vérification : termine le circuit. Ton temps deviendra la médaille cristal.', 2.6);
  },

  // Appelé quand le joueur termine la vérification de son circuit depuis l'éditeur :
  // il choisit alors de publier ou de revenir à l'éditeur.
  onEditorTestFinished(time, track) {
    // « Refaire un meilleur temps » : on garde le meilleur des deux.
    if (!(track.verified && track.vt <= time)) {
      track.setVerified(time);
      const run = this.session && this.session.lastRun;
      if (run) saveProof(track, run);      // la course de vérification : le serveur la rejouera à la publication (js/authorProof.js)
    }
    time = track.vt;
    if (this.editorState) { this.editorState.code = track.encode(); }
    const m = track.derivedMedals;
    setTimeout(() => {
      this.ui.modal({
        title: 'Circuit vérifié ✔',
        body: `<p>Ton temps <b>${formatTime(time)}</b> devient la médaille <b>cristal</b> de « ${esc(track.name)} ».</p>
          <p class="meta">${MEDALS.map((x) => `${medalIcon(x)}${formatTime(m[x.id])}`).join(' · ')}</p>
          <p>Publie-le, ou modifie-le (le tracé devra être revérifié).</p>`,
        actions: [
          { label: '🌐 Publier', primary: true, onClick: () => { this.publishTrack(track).then((ok) => { if (ok) this.quitRace(); }); return true; } },
          { label: 'Retour à l’éditeur', onClick: () => { this.quitRace(); return true; } },
          { label: 'Refaire un meilleur temps', onClick: () => { if (this.session && this.session.restart) this.session.restart(); return true; } },
        ],
      });
    }, 900);
  },
};
