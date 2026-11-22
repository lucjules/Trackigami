// Entrées : clavier (codes physiques => QWERTY et AZERTY), manette, tactile.
// Toutes les actions sont reconfigurables (Paramètres › Commandes).
//
// ── Arbitre d'entrées (TRANS-03) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Un seul état d'entrée (`keys`, `pressed`, `padEdges`) sert la course, l'éditeur, le garage, les menus et les fenêtres. Pour qu'une touche, un
// bouton de manette ou un bouton tactile n'agisse jamais à la place d'un autre, UN contexte est actif à la fois ; `App.inputContext()` (main.js) le
// calcule à chaque image et à chaque ouverture / fermeture de fenêtre, de superposition ou d'écran, puis appelle `setContext()`.
//
//   contexte   quand                                                    qui consomme quoi
//   ─────────  ───────────────────────────────────────────────────────  ──────────────────────────────────────────────────────────────────────
//   capture    une case de liaison attend une touche / un bouton       TOUT va à la capture (touche ou bouton lu une fois, Échap annule) ;
//                                                                       ni course, ni éditeur, ni navigation de menu
//   modal      une fenêtre (ui.modal) est ouverte                      menu seulement : Échap / « retour » la ferme, flèches et « valider »
//                                                                       à la manette ; AUCUNE action de course ni raccourci de l'éditeur
//   overlay    pause ou arrivée affichée (mode « course »)             la course (Échap / P reprend, T / Entrée rejoue à l'arrivée…) ET la
//                                                                       navigation de menu ; « valider » exige un relâchement préalable
//   race       course, sans superposition                              actions de course (touches, manette « course », boutons tactiles)
//   editor     éditeur de circuits                                     raccourcis de l'éditeur ; les raccourcis Ctrl ne marchent que dans ce contexte
//   garage     garage                                                  navigation de menu (Échap : retour)
//   menu       accueil, listes, profil, paramètres                     navigation de menu (Échap : même chemin que « ← Retour »)
//
// Règles :
//  1. À CHAQUE changement de contexte (`setContext`) : `pressed` et `padEdges` sont vidés, l'état précédent des boutons de manette est réinitialisé
//     sur l'état courant (un bouton tenu n'est jamais un « nouvel appui » après la transition), et « valider » (A) reste verrouillé tant qu'il n'a
//     pas été relâché une fois. `keys` (touches tenues) n'est pas touché : le pilotage continue, les `keyup` restent exacts.
//  2. Un `keydown` d'activation (Entrée, Espace) dont la cible est un contrôle activable (bouton, lien, carte…) active ce contrôle UNE fois : il
//     n'est jamais converti en action de jeu (sinon Entrée sur « Reprendre » relancerait la course : Entrée = « recommencer »).
//  3. En contexte `modal`, seul Échap est mis en file (pour fermer la fenêtre) ; en contexte `capture`, rien.
//  4. Les boutons tactiles ne fabriquent pas de codes de touche : ils déclenchent l'action par `post(action)` (file d'actions, même durée de vie que
//     `padEdges`), si bien qu'une action réassignée garde son bouton.
//  5. Une capture (touche ou bouton de manette) est annulée par `cancelCapture()` à tout changement d'écran, d'onglet, de course, de fenêtre.
// Le FORMAT des commandes enregistrées (`drive()`, quantSteer, InputRecorder) est hors de ce contrat : rien ici ne le modifie.

// [action, libellé, touches par défaut]
export const KEY_ACTIONS = {
  race: [
    ['accelerate', 'Accélérer', ['KeyW', 'ArrowUp']],
    ['brake', 'Freiner / marche arrière', ['KeyS', 'ArrowDown']],
    ['left', 'Tourner à gauche', ['KeyA', 'ArrowLeft']],
    ['right', 'Tourner à droite', ['KeyD', 'ArrowRight']],
    ['respawn', 'Dernier checkpoint (chrono remis à ce temps)', ['KeyR', '']],
    ['restart', 'Recommencer le niveau', ['KeyT', 'Enter']],
    ['camera', 'Changer de caméra', ['KeyC', '']],
    ['horn', 'Klaxon', ['KeyH', '']],
    ['pause', 'Pause', ['Escape', 'KeyP']],
  ],
  editor: [
    ['ed.rotate', 'Pivoter la pièce / décoration', ['KeyR', '']],
    ['ed.levelUp', 'Monter d’un niveau', ['KeyE', 'PageUp']],
    ['ed.levelDown', 'Descendre d’un niveau', ['KeyC', 'PageDown']],
    ['ed.nextPiece', 'Pièce suivante', ['Tab', '']],
    ['ed.extend', 'Prolonger : poser la pièce choisie au bout de la dernière pièce', ['KeyP', '']],
    ['ed.surface', 'Revêtement suivant', ['KeyB', '']],
    ['ed.fill', 'Pot de peinture (remplir une zone)', ['Backquote', '']],
    ['ed.inspect', 'Inspecter (propriétés et gizmos)', ['KeyI', 'Backslash']],
    ['ed.mirror', 'Miroir (looping gauche / droite)', ['KeyM', '']],
    ['ed.orient', 'Orientation suivante (à l’endroit, à l’envers, sur un mur)', ['KeyO', '']],
    ['ed.snap', 'Accrochage des décorations', ['KeyN', '']],
    ['ed.scaleUp', 'Décoration : agrandir', ['BracketRight', '']],
    ['ed.scaleDown', 'Décoration : réduire', ['BracketLeft', '']],
    ['ed.erase', 'Gomme', ['KeyX', 'Delete']],
    ['ed.test', 'Tester le circuit', ['KeyT', '']],
    ['ed.recenter', 'Recentrer la vue', ['KeyF', 'Home']],
    ['ed.topView', 'Vue de dessus', ['KeyH', '']],
    ['ed.freeCam', 'Caméra libre (au ras du sol)', ['KeyV', '']],
    ['ed.grid', 'Afficher / masquer la grille', ['KeyG', '']],
    ['ed.help', 'Liste des raccourcis', ['F1', '']],
    ['ed.levelView', 'Vue par niveau (estomper les autres)', ['KeyZ', '']],
    ['ed.verify', 'Vérifier le circuit (course complète)', ['F2', '']],
    ['ed.params', 'Paramètres du niveau', ['F3', '']],
    ['ed.groups', 'Groupes et calques', ['F4', '']],
    ['ed.logic', 'Logique du circuit', ['F6', '']],
  ],
};

// Boutons de manette (mapping standard) par défaut : deux emplacements par action.
// 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Select, 9 Start, 10 L3, 11 R3, 12-15 croix.
export const PAD_ACTIONS = {
  race: [
    ['accelerate', 'Accélérer', [7, 0]],
    ['brake', 'Freiner', [6, 1]],
    ['respawn', 'Dernier checkpoint', [3, -1]],
    ['restart', 'Recommencer', [8, -1]],
    ['camera', 'Caméra', [5, -1]],
    ['horn', 'Klaxon', [10, -1]],
    ['pause', 'Pause', [9, -1]],
  ],
  menu: [
    ['confirm', 'Valider', [0, -1]],
    ['back', 'Retour', [1, -1]],
  ],
  editor: [
    ['ed.place', 'Poser', [0, -1]],
    ['ed.erase', 'Supprimer', [1, -1]],
    ['ed.pick', 'Pipette', [11, -1]],
    ['ed.rotate', 'Pivoter', [2, -1]],
    ['ed.test', 'Tester', [3, -1]],
    ['ed.levelUp', 'Niveau +', [5, -1]],
    ['ed.levelDown', 'Niveau −', [4, -1]],
    ['ed.nextPiece', 'Pièce suivante', [10, -1]],
  ],
};
const ALL_PAD = Object.values(PAD_ACTIONS).flat();
const EDGE = {
  race: ['respawn', 'restart', 'camera', 'pause'],
  menu: ['confirm', 'back'],
  editor: ['pause', 'ed.place', 'ed.erase', 'ed.pick', 'ed.rotate', 'ed.test', 'ed.levelUp', 'ed.levelDown', 'ed.nextPiece'],
};

const ALL_EDGE_IDS = [...new Set(Object.values(EDGE).flat())];

// Contrôle activable au clavier (Entrée / Espace l'activent nativement) : une touche d'activation dont la cible en est un n'est pas une action de jeu.
const ACTIVATION_CODES = new Set(['Enter', 'NumpadEnter', 'Space']);
const ACTIVABLE = 'button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"], [role="link"], [role="option"], .card, .gcard';
const isActivable = (el) => !!(el && el.closest && el.closest(ACTIVABLE));

export function defaultKeys() {
  const out = {};
  for (const group of Object.values(KEY_ACTIONS)) for (const [id, , keys] of group) out[id] = keys.slice();
  return out;
}

export function defaultPad() {
  const out = {};
  for (const [id, , b] of ALL_PAD) out[id] = b.slice();
  return out;
}

const NAMES = {
  Space: 'Espace', Enter: 'Entrée', Backspace: 'Retour', Escape: 'Échap', Tab: 'Tab',
  ShiftLeft: 'Maj G', ShiftRight: 'Maj D', ControlLeft: 'Ctrl G', ControlRight: 'Ctrl D',
  AltLeft: 'Alt', AltRight: 'Alt Gr', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  PageUp: 'Page ↑', PageDown: 'Page ↓', Home: 'Début', End: 'Fin', Delete: 'Suppr', Insert: 'Inser',
  NumpadEnter: 'Entrée (pavé)', CapsLock: 'Verr. maj', BracketLeft: '[', BracketRight: ']', Backquote: '` ²', Backslash: '\\', Slash: '/',
};
let layoutMap = null;
if (typeof navigator !== 'undefined' && navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then((m) => { layoutMap = m; }).catch(() => {});
}
const learned = {};

// Libellé lisible d'une touche, adapté à la disposition du clavier si possible.
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  const fromLayout = (layoutMap && layoutMap.get(code)) || learned[code];
  if (fromLayout) return fromLayout.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Pavé ' + code.slice(6);
  return code;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Home'];
export function padLabel(i) {
  return i == null || i < 0 ? '—' : PAD_NAMES[i] || 'Bouton ' + i;
}

const dz = (v, d) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // touches enfoncées depuis la dernière lecture
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false, analog: null };
    this.gamepadPrev = {};
    this.bindings = defaultKeys();
    this.pad = defaultPad();
    this.padCfg = { deadzone: 0.15, sens: 1, rumble: true };
    this.capture = null;
    this.padEdges = new Set();
    this.navT = 0;
    this.ctx = 'menu';           // contexte actif (voir l'en-tête) ; App.inputContext() le fixe
    this.sync = null;            // crochet posé par App : recalcule le contexte quand une capture s'arme ou se termine
    this._confirmLock = false;   // « valider » (A) verrouillé jusqu'au premier relâchement
    window.addEventListener('keydown', (e) => {
      if (e.key && e.key.length === 1) learned[e.code] = e.key;
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        this._changed();
        cb(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      // Avec Ctrl / Cmd, la touche sert à un raccourci (copier, coller, annuler...) :
      // elle ne compte pas comme un appui « simple » (C, V, X, Z... ont leur propre action).
      const mod = e.ctrlKey || e.metaKey;
      // Entrée / Espace sur un bouton (lien, carte…) l'ACTIVENT : ce n'est pas une action de jeu (Entrée = « recommencer » relancerait la course).
      const activation = ACTIVATION_CODES.has(e.code) && isActivable(e.target);
      if (!this.keys.has(e.code) && !mod && !activation && this._queues(e.code)) this.pressed.add(e.code);
      if (!mod || e.code.startsWith('Control') || e.code.startsWith('Meta')) this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Tab', 'F1', 'Home'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.pressed.clear(); });
  }

  // ---- Arbitre : contexte actif ----
  // Une touche est-elle mise en file dans le contexte courant ? (modal : seul Échap, pour fermer la fenêtre ; capture : rien, la capture l'a déjà lue)
  _queues(code) {
    if (this.ctx === 'capture') return false;
    if (this.ctx === 'modal') return code === 'Escape';
    return true;
  }

  _changed() { if (this.sync) this.sync(); }

  // Change de contexte (règle 1 de l'en-tête). Renvoie vrai s'il a changé.
  setContext(ctx) {
    if (ctx === this.ctx) return false;
    this.ctx = ctx;
    this.reset();
    return true;
  }

  // Vide les appuis en attente et réinitialise les fronts de manette sur l'état courant ; verrouille « valider » s'il est tenu.
  reset() {
    this.pressed.clear();
    this.padEdges.clear();
    const p = this.gamepad();
    for (const id of ALL_EDGE_IDS) this.gamepadPrev[id] = !!p && this._anyOn(p, id);
    this._confirmLock = !!p && this._anyOn(p, 'confirm');
  }

  setBindings(keys, pad) {
    // On ne garde que les actions qui existent encore (l'ancien « dérapage » est ignoré).
    const keep = (def, saved) => {
      const out = { ...def };
      for (const k in saved || {}) if (k in def) out[k] = saved[k];
      return out;
    };
    // 0.9 : « Recommencer » passe sur T ; on met à jour l'ancien réglage par défaut.
    if (keys && JSON.stringify(keys.restart) === JSON.stringify(['Enter', 'Backspace'])) keys = { ...keys, restart: ['KeyT', 'Enter'] };
    this.bindings = keep(defaultKeys(), keys);
    this.pad = keep(defaultPad(), pad);
  }

  setPadConfig(cfg) {
    this.padCfg = { ...this.padCfg, ...cfg };
  }

  // Attend la prochaine touche (null si Échap). Une capture déjà en attente est annulée d'abord (rappelée avec (null, 'replace')) : sans cela sa
  // scrutation de manette continuerait et lierait un bouton à l'ancienne case.
  captureKey(cb) {
    this.cancelCapture('replace');
    this.capture = cb;
    this._changed();
  }

  // Annule la capture en attente, s'il y en a une (changement d'écran, d'onglet, de course, ouverture d'une fenêtre) : le rappel reçoit (null, why).
  cancelCapture(why = 'cancel') {
    const cb = this.capture;
    if (!cb) return false;
    this.capture = null;
    this._changed();
    cb(null, why);
    return true;
  }

  // Action déclenchée directement (boutons tactiles) : même durée de vie qu'un front de manette, consommée par act(). Ignorée sous une fenêtre ou une capture.
  post(action) {
    if (this.ctx === 'modal' || this.ctx === 'capture') return false;
    this.padEdges.add(action);
    return true;
  }

  down(...codes) {
    for (const c of codes) if (c && this.keys.has(c)) return true;
    return false;
  }

  // Vrai une seule fois par appui.
  hit(code) {
    if (code && this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  // Action reconfigurable maintenue.
  held(action) {
    const b = this.bindings[action];
    return b ? this.down(...b) : false;
  }

  // Action reconfigurable déclenchée (une fois par appui).
  act(action) {
    if (this.ctx === 'modal' || this.ctx === 'capture') return false;      // sous une fenêtre ou une capture, aucune action de jeu
    const b = this.bindings[action];
    if (!b) return false;
    let r = false;
    for (const c of b) if (this.hit(c)) r = true;
    if (this.padEdges.delete(action)) r = true;
    return r;
  }

  clearHits() {
    this.pressed.clear();
    this.padEdges.clear();
  }

  gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  _on(p, i) {
    const b = i >= 0 ? p.buttons[i] : null;
    return !!(b && (b.pressed || b.value > 0.3));
  }

  _anyOn(p, action) {
    return (this.pad[action] || []).some((i) => this._on(p, i));
  }

  // Détecte les nouveaux appuis de manette et les convertit en actions (padEdges).
  // mode : 'race' | 'editor' | 'menu'
  pollGamepad(mode) {
    const p = this.gamepad();
    this.hasPad = !!p;
    if (!p) return;
    for (const id of EDGE[mode] || []) {
      const on = this._anyOn(p, id);
      if (on && !this.gamepadPrev[id]) this.padEdges.add(id);
      this.gamepadPrev[id] = on;
    }
    // « Valider » reste verrouillé tant que A n'a pas été relâché une fois depuis la dernière transition (A est aussi « accélérer »).
    if (this._confirmLock) {
      if (this._anyOn(p, 'confirm')) this.padEdges.delete('confirm');
      else this._confirmLock = false;
    }
  }

  // Bouton de manette nouvellement enfoncé (pour la configuration).
  padButtonPressed() {
    const p = this.gamepad();
    if (!p) return -1;
    for (let i = 0; i < p.buttons.length; i++) {
      const on = this._on(p, i);
      const was = this.gamepadPrev['cfg' + i];
      this.gamepadPrev['cfg' + i] = on;
      if (on && !was) return i;
    }
    return -1;
  }

  // Navigation dans les menus : renvoie {dx, dy, confirm, back} (avec répétition).
  padMenu() {
    const p = this.gamepad();
    if (!p) return null;
    const ax = dz(p.axes[0] || 0, 0.5), ay = dz(p.axes[1] || 0, 0.5);
    let dx = ax > 0 ? 1 : ax < 0 ? -1 : 0, dy = ay > 0 ? 1 : ay < 0 ? -1 : 0;
    if (this._on(p, 14)) dx = -1; if (this._on(p, 15)) dx = 1;
    if (this._on(p, 12)) dy = -1; if (this._on(p, 13)) dy = 1;
    const now = performance.now();
    let mx = 0, my = 0;
    if (dx || dy) {
      if (!this._navHeld) { mx = dx; my = dy; this._navHeld = true; this.navT = now + 380; }
      else if (now > this.navT) { mx = dx; my = dy; this.navT = now + 130; }
    } else this._navHeld = false;
    return { dx: mx, dy: my, confirm: this.padEdges.delete('confirm'), back: this.padEdges.delete('back') };
  }

  // Éditeur à la manette : déplacement (stick gauche / croix), curseur (stick droit), zoom (gâchettes).
  padEditor() {
    const p = this.gamepad();
    if (!p) return null;
    const d = this.padCfg.deadzone;
    let mx = dz(p.axes[0] || 0, d), mz = -dz(p.axes[1] || 0, d);
    if (this._on(p, 14)) mx = -1; if (this._on(p, 15)) mx = 1;
    if (this._on(p, 12)) mz = 1; if (this._on(p, 13)) mz = -1;
    const cx = dz(p.axes[2] || 0, d), cy = dz(p.axes[3] || 0, d);
    const zoom = ((p.buttons[7] && p.buttons[7].value) || 0) - ((p.buttons[6] && p.buttons[6].value) || 0);
    return {
      moveX: mx, moveZ: -mz, cx, cy, orbit: 0, zoom,
      place: this.padEdges.delete('ed.place'), erase: this.padEdges.delete('ed.erase'), pick: this.padEdges.delete('ed.pick'),
    };
  }

  // Vibration (manette) ou impulsion (téléphone).
  rumble(strong = 0.5, weak = 0.3, ms = 120) {
    if (!this.padCfg.rumble) return;
    const p = this.gamepad();
    if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
      p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    } else if (navigator.vibrate && this.touchActive) navigator.vibrate(Math.min(80, ms));
  }

  drive() {
    const t = this.touch;
    let steer = 0;
    if (this.held('left') || t.left) steer -= 1;
    if (this.held('right') || t.right) steer += 1;
    if (t.analog != null) steer = t.analog;
    let throttle = this.held('accelerate') || t.gas;
    let brake = this.held('brake') || t.brake;
    const p = this.gamepad();
    if (p) {
      const ax = dz(p.axes[0] || 0, this.padCfg.deadzone);
      if (ax) steer = Math.max(-1, Math.min(1, ax * this.padCfg.sens));
      if (this._on(p, 14)) steer = -1;
      if (this._on(p, 15)) steer = 1;
      const pa = (id) => (this.pad[id] || []).reduce((m, i) => Math.max(m, i >= 0 && p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0), 0);
      if (pa('accelerate') > 0.2) throttle = true;
      if (pa('brake') > 0.2) brake = true;
    }
    // Pas de bouton de dérapage : freiner en virage suffit.
    return { steer, throttle, brake, drift: false };
  }
}
