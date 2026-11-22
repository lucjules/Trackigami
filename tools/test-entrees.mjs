// Arbitre d'entrées (TRANS-03) : node tools/test-entrees.mjs   (npm test)
// Le contrat est décrit en tête de js/input.js ; ici on exerce la cause commune (un seul état d'entrée, partagé), pas chaque symptôme :
//  - TECH-004 : Entrée / Espace sur un contrôle activable n'est jamais une action de jeu ; un contexte « fenêtre » ne met en file que Échap ;
//  - TECH-005 : à chaque transition, fronts de manette remis sur l'état courant, « valider » verrouillé jusqu'à un relâchement ;
//  - TECH-006 : une capture est annulable (et remplacée proprement) ;
//  - TECH-017 / 020 : sous une fenêtre aucune action de jeu ; les boutons tactiles déclenchent l'action directement (post).
// Les parcours dans un vrai navigateur (pause + Entrée, manette A tenu…) sont dans tools/test-browser.mjs.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const listeners = {};
globalThis.window = { addEventListener: (t, f) => { (listeners[t] ||= []).push(f); } };
let pad = null;
Object.defineProperty(globalThis.navigator, 'getGamepads', { value: () => (pad ? [pad] : []), configurable: true });
const { Input, defaultKeys, defaultPad } = await import('../js/input.js');

const mkPad = () => ({ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const press = (i, on) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; };
const fire = (type, code, target = { tagName: 'BODY', closest: () => null }, extra = {}) => { for (const f of listeners[type] || []) f({ code, key: code, target, preventDefault() {}, ...extra }); };
const el = (tag, sel) => ({ tagName: tag.toUpperCase(), closest: (q) => (q.split(',').map((x) => x.trim()).includes(sel || tag) ? { tagName: tag } : null) });
const fresh = () => { pad = null; for (const k in listeners) listeners[k].length = 0; const i = new Input(); i.setBindings(defaultKeys(), defaultPad()); return i; };

console.log('Arbitre d\'entrées');

test('TECH-004 : Entrée / Espace sur un bouton activent le bouton, jamais une action ; sur la page ils restent « recommencer » ; une autre touche reste lue', () => {
  const i = fresh(); i.setContext('overlay');
  fire('keydown', 'Enter', el('button'));
  assert.equal(i.act('restart'), false, 'Entrée sur un bouton n\'est pas « recommencer »');
  fire('keyup', 'Enter', el('button'));
  fire('keydown', 'Space', el('a', 'a[href]'));
  assert.equal(i.hit('Space'), false);
  fire('keydown', 'Enter', { tagName: 'DIV', closest: (q) => (q.includes('.card') ? {} : null) });
  assert.equal(i.act('restart'), false, 'ni sur une carte');
  fire('keyup', 'Enter');
  fire('keydown', 'Enter');
  assert.equal(i.act('restart'), true, 'Entrée sur la page : « Rejouer Entrée » marche toujours');
  fire('keydown', 'KeyR', el('button'));
  assert.equal(i.act('respawn'), true, 'R depuis un bouton focalisé reste un retour au checkpoint (éditeur : barre d\'outils)');
});

test('TECH-004 : une transition (ouverture / fermeture d\'une superposition) vide les appuis en attente', () => {
  const i = fresh(); i.setContext('race');
  fire('keydown', 'KeyT'); fire('keydown', 'Enter');
  assert.ok(i.pressed.has('KeyT'));
  assert.equal(i.setContext('overlay'), true);
  assert.equal(i.pressed.size, 0, 'ouverture : vidé');
  fire('keydown', 'KeyC');
  assert.equal(i.setContext('race'), true);
  assert.equal(i.pressed.size, 0, 'fermeture : vidé');
  assert.equal(i.setContext('race'), false, 'même contexte : rien ne change');
  fire('keydown', 'KeyC'); fire('keyup', 'KeyC'); fire('keydown', 'KeyW');
  i.setContext('overlay');
  assert.ok(i.keys.has('KeyW'), 'les touches tenues ne sont pas touchées (le pilotage continue)');
});

test('contexte « fenêtre » : seul Échap est mis en file ; « capture » : rien ; aucune action de jeu ne sort', () => {
  const i = fresh(); i.setContext('modal');
  for (const c of ['KeyP', 'KeyT', 'KeyC', 'KeyH', 'KeyR', 'Enter', 'Escape']) fire('keydown', c);
  assert.deepEqual([...i.pressed], ['Escape'], 'Échap seul (pour fermer la fenêtre)');
  for (const a of ['pause', 'restart', 'camera', 'horn', 'respawn']) assert.equal(i.act(a), false, a);
  i.pressed.clear(); i.setContext('capture');
  fire('keydown', 'KeyP');
  assert.equal(i.pressed.size, 0);
});

test('TECH-005 : A tenu à l\'ouverture d\'une superposition : pas de « valider » ; relâché puis pressé : « valider »', () => {
  const i = fresh(); pad = mkPad();
  i.setContext('race');
  press(0, true);                                  // A : accélérer ET valider
  i.pollGamepad('menu'); i.pollGamepad('race');    // suivi à chaque image, même en course
  i.clearHits();
  i.setContext('overlay');                         // la pause s'ouvre, A toujours tenu
  i.pollGamepad('menu'); i.pollGamepad('race');
  assert.equal(i.padMenu().confirm, false, 'A tenu : aucun « valider »');
  i.clearHits();
  press(0, false); i.pollGamepad('menu');
  i.clearHits();
  press(0, true); i.pollGamepad('menu');
  assert.equal(i.padMenu().confirm, true, 'après relâchement, A valide');
});

test('TECH-005 : même si l\'état précédent est périmé, le verrou exige un relâchement de A après la transition', () => {
  const i = fresh(); pad = mkPad();
  press(0, true);
  i.gamepadPrev.confirm = false;                   // état précédent périmé (le défaut d'origine : fronts « menu » non suivis en course)
  i.setContext('overlay');
  i.gamepadPrev.confirm = false;                   // on force l'état périmé APRÈS la transition : le verrou doit tenir seul
  i.pollGamepad('menu');
  assert.equal(i.padMenu().confirm, false, 'verrou : A n\'a pas été relâché');
  press(0, false); i.pollGamepad('menu'); i.clearHits();
  press(0, true); i.pollGamepad('menu');
  assert.equal(i.padMenu().confirm, true);
});

test('TECH-005 : la pause à la manette (Start) tenue à l\'ouverture n\'est pas relue comme un nouvel appui', () => {
  const i = fresh(); pad = mkPad();
  i.setContext('race');
  press(9, true); i.pollGamepad('race');
  assert.equal(i.act('pause'), true, 'front de Start en course');
  i.setContext('overlay');                         // la pause s'ouvre
  i.pollGamepad('race');
  assert.equal(i.act('pause'), false, 'Start toujours tenu : pas de second front (la pause ne se referme pas)');
});

test('TECH-006 : captureKey / cancelCapture : le rappel reçoit (null, raison) ; une capture remplacée est annulée ; la touche suivante n\'est plus avalée', () => {
  const i = fresh(); const log = [];
  i.captureKey((c, why) => log.push(['A', c, why]));
  assert.ok(i.capture);
  i.captureKey((c, why) => log.push(['B', c, why]));
  assert.deepEqual(log, [['A', null, 'replace']], 'la première capture est annulée quand une autre s\'arme');
  assert.equal(i.cancelCapture(), true);
  assert.equal(i.capture, null);
  assert.deepEqual(log[1], ['B', null, 'cancel']);
  assert.equal(i.cancelCapture(), false, 'rien à annuler');
  fire('keydown', 'KeyW');
  assert.equal(i.hit('KeyW'), true, 'après l\'annulation, W est une touche normale');
  let got; i.captureKey((c) => { got = c; });
  fire('keydown', 'KeyQ');
  assert.equal(got, 'KeyQ'); assert.equal(i.capture, null);
  i.captureKey((c) => { got = c; }); fire('keydown', 'Escape');
  assert.equal(got, null, 'Échap annule');
});

test('TECH-006 : le contexte suit la capture (crochet App.sync)', () => {
  const i = fresh(); let n = 0; i.sync = () => { n++; };
  i.captureKey(() => {}); i.cancelCapture();
  assert.equal(n, 2, 'armée puis annulée : le contexte est recalculé à chaque fois');
});

test('TECH-020 : post() déclenche l\'action directement, une fois, quelle que soit sa liaison ; ignoré sous une fenêtre', () => {
  const i = fresh(); i.setContext('race');
  i.bindings.respawn = ['KeyQ', '']; i.bindings.camera = ['KeyR', ''];
  i.post('respawn');
  assert.equal(i.act('camera'), false, 'R (caméra) n\'est pas déclenchée par le bouton « ⟲ »');
  assert.equal(i.act('respawn'), true);
  assert.equal(i.act('respawn'), false, 'une seule fois');
  i.setContext('modal');
  assert.equal(i.post('pause'), false, 'sous une fenêtre : ignoré');
  i.setContext('race'); i.post('pause'); i.clearHits();
  assert.equal(i.act('pause'), false, 'la file vit une image, comme padEdges');
});

finish('Tous les tests de l\'arbitre d\'entrées passent.');
