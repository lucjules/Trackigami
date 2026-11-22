// État du circuit dans l'éditeur : instantanés, annuler / rétablir, enregistrement, nouveau circuit, essai.
// Ces méthodes s'ajoutent au prototype de EditorSession (voir editor.js) : `this` est l'instance.
import { CELL, MAX_TRACK_CODE_CHARS } from '../constants.js';
import { PIECES } from '../pieces.js';
import { Track, tileToRow, rowToTile, lossBlocking, normalizeDeco } from '../track.js';
import { lossMessage, lossNote } from '../lossMessage.js';
import { setEditorDraft, saveMyTrack, newId, wroteOk } from '../storage.js';
import { centerlineWorld } from '../ribbons.js';
import { newCircuitId } from './shared.js';
export const historyMethods = {
  exportState() {
    return {
      code: this.track.encode(),
      entryId: this.entryId,
      name: this.track.name,
      tool: this.tool,
      eraseFilter: this.eraseFilter,
      rot: this.rot,
      level: this.level,
      cam: { tx: this.target.x, tz: this.target.z, dist: this.dist, yaw: this.yaw, pitch: this.pitch },
      dirty: this.isDirty(),      // (0.12.0 : un brouillon rouvert sait s'il reste quelque chose à enregistrer)
    };
  },

  // ---------------------------------------------------------------- Enregistré ou pas (0.12.0)
  // Le circuit diffère-t-il de ce qui est enregistré dans « Mes circuits » ? `_savedSnap` est l'instantané du dernier enregistrement (ou de l'ouverture d'un
  // circuit enregistré) ; null : rien d'enregistré pour cet état.
  isDirty() { return this._savedSnap !== this._saveKey(); },
  _markSaved() { this._savedSnap = this._saveKey(); this._lastDirty = undefined; this._refreshSaved(); },
  // Ce qui compte pour « enregistré » : le contenu (instantané d'historique) ET la vérification de l'auteur (une course de vérification change le code partagé).
  _saveKey() { return this._snapshot() + '#' + this.track.vt + ':' + this.track.vh; },
  _refreshSaved() {
    const d = this.isDirty();
    if (d === this._lastDirty) return;
    this._lastDirty = d;
    const el = typeof document !== 'undefined' ? document.getElementById('ed-saved') : null;
    if (el) { el.classList.toggle('dirty', d); el.title = d ? 'Modifications non enregistrées (Ctrl + S)' : 'Enregistré dans « Mes circuits »'; el.setAttribute('aria-label', el.title); }
  },
  // Un circuit qui ne contient que le départ (nouveau circuit jamais touché) : rien à protéger.
  // (0.12.0 : un départ seul MAIS des réglages, une logique, des déclencheurs ou une description : c'est déjà du travail, il s'enregistre)
  _isTrivial() {
    const t = this.track;
    return !this.entryId && !t.decos.length && t.tiles.every((x) => x.t === 'start') && !t.lg && !(t.scripts && t.scripts.length) && !t.desc
      && JSON.stringify(t.rulesState()) === JSON.stringify(new Track('').rulesState());
  },
  // Enregistrement automatique quand on quitte l'éditeur, qu'on ouvre un autre circuit ou qu'on en commence un nouveau : avant 0.12.0, « Retour » ne gardait le travail que dans
  // l'unique brouillon, que la session suivante écrasait (le circuit modifié était perdu sans un mot). Renvoie 'saved', 'failed' ou '' (rien à faire).
  autoSave() {
    if (!this.isDirty() || this._isTrivial()) return '';
    return this.save(true) ? 'saved' : 'failed';
  },

  // ---------------------------------------------------------------- Historique
  // Phase 8 (TECH-035) : l'instantané est CANONIQUE (snapshotOf, en bas du fichier) : écrit puis relu (_restore), il redonne exactement le même texte.
  _snapshot() { return snapshotOf(this.track); },

  _restore(snap) {
    const data = JSON.parse(snap);
    const { vt, vh, decor } = this.track;
    fillFromSnapshot(this.track, data);
    // (TECH-054 : la vérification est dans l'instantané — annuler un « Nouveau » ou un import rend le circuit d'avant AVEC la sienne. Un instantané sans vérification garde celle
    // du moment : revenir à un état qu'on avait vérifié le redonne vérifié, la signature (vh) décide.)
    if (data.v && data.v[0] > 0) { this.track.vt = data.v[0]; this.track.vh = data.v[1]; } else { this.track.vt = vt; this.track.vh = vh; }
    if (this.track.decor !== decor) { this._applyDecor(); this.gridKey = ''; }
    this._changed(false);
    this.needsRebuild = true;
    this._lastDirty = undefined; this._refreshSaved();
    this.inspector.restore(this.histSel[this.hIndex]);   // l'objet inspecté revient avec l'état annulé / rétabli
    // Le rectangle de sélection de zone aussi (copié : le modifier ensuite ne change pas l'historique).
    const r = this.histRect && this.histRect[this.hIndex];
    const changed = JSON.stringify(this.sel || null) !== JSON.stringify(r || null) || this.pasting;
    this.sel = r ? { ...r } : null; this.selDrag = null; this.pasting = false; this.previewKey = '';
    if (changed) this._refreshSelBar();
  },

  _commit() {
    if (!this.histRect) this.histRect = this.histSel.map(() => null);
    const snap = this._snapshot();
    if (snap === this.history[this.hIndex]) { this.histSel[this.hIndex] = this.inspector.describe(); this.histRect[this.hIndex] = this.sel ? { ...this.sel } : null; return; }
    this._lastDirty = undefined;
    this.history.length = this.hIndex + 1;
    this.histSel.length = this.hIndex + 1;
    this.histRect.length = this.hIndex + 1;
    this.history.push(snap);
    this.histSel.push(this.inspector.describe());
    this.histRect.push(this.sel ? { ...this.sel } : null);
    if (this.history.length > 200) { this.history.shift(); this.histSel.shift(); this.histRect.shift(); }
    this.hIndex = this.history.length - 1;
    this._refreshSaved();
  },

  undo() {
    if (this.hIndex <= 0) return;
    this.hIndex--;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  },

  redo() {
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  },

  _changed(rebuild = true) {
    if (rebuild) this.needsRebuild = true;
    this.previewKey = '';
    this.inspector.refresh();
    this._refreshUI();
    clearTimeout(this._draftT);
    this._draftT = setTimeout(() => setEditorDraft(this.exportState()), 400);
  },

  // silent : enregistrement automatique (l'appelant le dit lui-même).
  save(silent = false) {
    const code = this.track.encode();
    // Un code trop long ne tient pas dans « Mes circuits » (MAX_TRACK_CODE_CHARS) : on le dit, au lieu d'accuser le stockage du navigateur.
    if (code.length > MAX_TRACK_CODE_CHARS) {
      this.app.ui.flash(`Circuit trop grand pour être enregistré (${Math.round(code.length / 1000)} Ko de code, ${Math.round(MAX_TRACK_CODE_CHARS / 1000)} Ko au plus) : retire des pièces ou des décorations.`, 7);
      this.app.audio.error();
      return false;
    }
    const entry = saveMyTrack({ id: this.entryId || newId(), name: this.track.name, code });
    const ok = wroteOk();
    if (ok) { this.entryId = entry.id; this._markSaved(); }
    setEditorDraft(this.exportState());
    if (ok && !silent) this.app.ui.flash('Circuit enregistré dans « Mes circuits »');
    else if (!ok) { this.app.ui.flash('Enregistrement impossible : le stockage du navigateur est plein ou bloqué. Copie le code du circuit (Partager) pour ne pas le perdre.', 7); this.app.audio.error(); }
    return ok;
  },

  // « Enregistrer une copie » : une nouvelle entrée de « Mes circuits » ; l'éditeur travaille ensuite sur la copie.
  saveCopy() {
    const id = this.entryId;
    this.entryId = null;
    if (this.save(true)) this.app.ui.flash(`Copie de « ${this.track.name} » enregistrée dans « Mes circuits ».`, 2.4);
    else this.entryId = id;
  },

  // Renommer le circuit (clic sur son nom dans la barre du haut). Le nom n'est pas dans la signature : la vérification et les records restent.
  renameDialog() {
    const f = document.createElement('div');
    f.className = 'form';
    f.innerHTML = '<label>Nom du circuit<input id="ed-rename" maxlength="40" spellcheck="false" autocomplete="off"></label>';
    const input = f.querySelector('#ed-rename');
    input.value = this.track.name;
    const ok = () => {
      const nm = input.value.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!nm) { this.app.ui.flash('Donne un nom au circuit.'); return false; }
      if (nm !== this.track.name) { this.track.name = nm; this._changed(false); this._commit(); }
      return true;
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (ok()) this.app.ui.closeModal(); } });
    this.app.ui.modal({ title: 'Renommer le circuit', body: f, actions: [{ label: 'Annuler' }, { label: 'Renommer', primary: true, onClick: ok }] });
    setTimeout(() => { input.focus(); input.select(); }, 60);
  },

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.app.ui.flash(this.showGrid ? 'Grille' : 'Sans grille', 1.2);
    this._refreshUI();
  },

  // Message d'un enregistrement automatique (après autoSave).
  _autoSaveNote(r) {
    if (r === 'saved') this.app.ui.flash(`« ${this.track.name} » enregistré dans « Mes circuits ».`, 2.4);
  },

  // Un autre circuit est chargé dans la session (Nouveau, Importer) : ce qui n'appartient qu'au circuit d'avant est remis à zéro — calques masqués et verrouillés (TECH-054 :
  // les groupes 1, 2 du nouveau circuit restaient invisibles ou verrouillés) et circuit d'origine du presse-papiers (TECH-058).
  _resetForOtherTrack() {
    for (const g of this.hiddenGroups || []) this.view.setGroupVisible(g, true);
    this.hiddenGroups = new Set(); this.lockedGroups = new Set();
    this.circuitId = newCircuitId();
    this.selGroup = 0;
  },

  newTrack() {
    const r = this.autoSave();
    if (r === 'failed') return;
    this._commit();      // (l'état d'avant, avec sa vérification, est le dernier pas : « annuler » le rend tel quel — TECH-054)
    this._resetForOtherTrack();
    this.track.clear();
    this.track.name = 'Mon circuit';
    this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    this.entryId = null;
    this.level = 0;
    this.target.set(CELL / 2, this.levelY(), CELL / 2);
    this._commit();
    this._changed();
    this._savedSnap = null; this._markSaved();      // un circuit neuf n'a rien à enregistrer
    this._autoSaveNote(r);
  },

  // ---------------------------------------------------------------- Aller-retour éditeur → essai → éditeur (0.12.0)
  // L'essai remplace la session de l'éditeur par une course ; au retour, une session neuve est créée. Avant 0.12.0 tout ce qui n'était pas dans le code du circuit se
  // perdait à chaque essai : l'historique d'annulation, le presse-papiers, les options armées, les réglages de décor, les calques masqués… On le confie à
  // l'application le temps de l'essai, et la session suivante le reprend si elle rouvre exactement le même état.
  _keepState() {
    return {
      id: Date.now() + ':' + Math.random(),
      history: this.history, hIndex: this.hIndex, histSel: this.histSel, histRect: this.histRect,
      clip: this.clip, opts: { ...this.opts }, famTraits: { ...this.famTraits }, deco: { ...this.deco }, surfParam: { ...this.surfParam },
      hiddenGroups: this.hiddenGroups ? [...this.hiddenGroups] : [], lockedGroups: this.lockedGroups ? [...this.lockedGroups] : [],
      circuitId: this.circuitId, focusLevel: this.focusLevel, freeCam: !!this.freeCam, showGrid: this.showGrid, lastBrush: this._lastBrush, hinted: this._hinted ? [...this._hinted] : [],
      savedSnap: this._savedSnap, lastTile: this._lastTile ? this.track.tiles.indexOf(this._lastTile) : -1, ui: this._uiKeep ? this._uiKeep() : null,
    };
  },

  _restoreKeep(k) {
    this.history = k.history; this.hIndex = k.hIndex; this.histSel = k.histSel; this.histRect = k.histRect;
    this.clip = k.clip; this.opts = { ...this.opts, ...k.opts }; this.famTraits = k.famTraits; this.deco = { ...this.deco, ...k.deco }; this.surfParam = k.surfParam;
    if (k.hiddenGroups.length) { this.hiddenGroups = new Set(k.hiddenGroups); for (const g of k.hiddenGroups) this.view.setGroupVisible(g, false); }
    if (k.lockedGroups.length) this.lockedGroups = new Set(k.lockedGroups);
    if (k.circuitId) this.circuitId = k.circuitId;
    this.focusLevel = k.focusLevel; if (k.focusLevel) this.needsRebuild = true;
    this.freeCam = k.freeCam; this.showGrid = k.showGrid; this._lastBrush = k.lastBrush; this._hinted = new Set(k.hinted);
    this._savedSnap = k.savedSnap;
    if (k.lastTile >= 0) this._lastTile = this.track.tiles[k.lastTile];
    this._keptUi = k.ui;
  },

  // Remplace le circuit de l'éditeur par celui d'un code (Importer, « Charger dans l'éditeur »). Tout est repris, y compris la logique, les noms de groupes, l'auteur
  // et la vérification (avant 0.12.0 la logique et les groupes se perdaient : la signature changeait et la vérification de l'auteur avec).
  loadCode(code) {
    const t = Track.decode(code);
    const r = this.autoSave();
    if (r === 'failed') return;
    this._commit();      // (voir newTrack)
    this._resetForOtherTrack();
    const tr = this.track;
    tr.clear();
    for (const tile of t.tiles) tr.add(tile);
    for (const d of t.decos) tr.addDeco(d);
    tr.name = t.name;
    tr.author = t.author;
    tr.decor = t.decor;
    tr.laps = t.laps;
    tr.setParams(t);
    tr.groups = { ...t.groups };
    tr.lg = t.lg ? JSON.parse(JSON.stringify(t.lg)) : null;
    tr.vt = t.vt; tr.vh = t.vh;
    tr.version++;
    this._applyDecor();
    this.entryId = null;
    this.recenter();
    this._commit();
    this._changed();
    this._autoSaveNote(r);
    if (lossBlocking(t)) this.app.ui.flash(lossMessage(t) + ' ' + lossNote.incomplete(), 7);
  },

  recenter() {
    const c = this._fitCamera();
    this.target.set(c.tx, this.levelY(), c.tz);
    this.dist = c.dist;
  },

  // Caméra libre (E22) : inclinaison jusqu'au ras du sol (et légèrement en contre-plongée), rapprochement à 3 m, pour voir le circuit comme
  // le pilote. Sortie : la vue revient dans les bornes habituelles.
  toggleFreeCam() {
    this.freeCam = !this.freeCam;
    if (!this.freeCam) { this.pitch = Math.max(0.2, this.pitch); this.dist = Math.max(25, this.dist); }
    else { this.pitch = Math.min(this.pitch, 0.12); this.dist = Math.min(this.dist, 40); }
    this.app.ui.flash(this.freeCam ? 'Caméra libre : au ras du sol, approche jusqu’à 3 m (V pour revenir)' : 'Caméra habituelle', 2);
    this._refreshUI();
  },
  minDist() { return this.freeCam ? 3 : 25; },

  toggleTopView() {
    if (this.pitch < 1.4) { this._prevPitch = this.pitch; this.pitch = 1.5; }
    else this.pitch = this._prevPitch || 0.95;
    this._refreshUI();
  },

  // État confié à l'application avant un essai (voir _keepState) ; l'identifiant suit l'état exporté.
  _stateForTest() {
    const st = this.exportState();
    this.app._editorKeep = this._keepState();
    st.keepId = this.app._editorKeep.id;
    return st;
  },

  testHere() {
    const t = this._targetTile();
    if (!t || ['ring', 'area'].includes(PIECES[t.t].kind)) { this.app.ui.flash('Vise une pièce de route.'); this.app.audio.error(); return; }
    // Une route sur un mur (ou une transition qui part d'un mur) ne peut pas servir de départ : la voiture y tomberait.
    if (t.o || (PIECES[t.t].roll && PIECES[t.t].roll[0] !== 0)) { this.app.ui.flash('Teste depuis une route au sol (ou une transition qui part du sol) : on ne démarre pas sur un mur.'); this.app.audio.error(); return; }
    let pts = centerlineWorld(t, 6);
    // Sens de départ : celui qui s'éloigne de la pièce de départ du circuit.
    const st = this.track.startTile;
    if (st && st !== t) {
      const sp = centerlineWorld(st, 2)[1];
      const d = (p) => Math.hypot(p[0] - sp[0], p[2] - sp[2]);
      if (d(pts[0]) > d(pts[pts.length - 1])) pts = pts.slice().reverse();
    }
    const a = pts[0], b = pts[1];
    const yaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    const gs = testGravity(t);
    this.app.testTrack(this._stateForTest(), { x: a[0] + (b[0] - a[0]) * 0.5, y: a[1], z: a[2] + (b[2] - a[2]) * 0.5, yaw, gs });
  },

  // Phase 3 : un simple essai ne demande plus d'arrivée (on roule librement) ; la vérification, elle, en exige une.
  test(verify = false) {
    const errs = this.track.validate({ test: !verify });
    if (errs.length) {
      this.app.ui.flash(errs.join(' '));
      this.app.audio.error();
      return;
    }
    this.app.testTrack(this._stateForTest(), null, verify);
  },
};

// Sens de gravité d'un test lancé depuis le curseur (TECH-055, décision D-2 par défaut) : celui de la PIÈCE VISÉE (à l'envers : -1), et non celui de la règle « gravité inversée
// au départ » (flip0), qui ne vaut que pour la pièce de départ (raccordRaceLogic : placeAtStart). Avant, sur un circuit qui démarre au plafond, tester depuis une route
// ordinaire posée au sol mettait la voiture en gravité inversée : elle tombait vers le ciel. Les rubans (vrille, looping…) retournent la voiture eux-mêmes : gravité normale.
export const testGravity = (t) => (t.v && PIECES[t.t].kind !== 'ribbon' && PIECES[t.t].kind !== 'loop' ? -1 : 1);

// ---- Instantanés d'historique (phase 8 : TECH-034, TECH-035 ; transversal TRANS-01) -------------------------------------------------------------------------------
// Une chaîne JSON par état : pièces (lignes TILE_FIELDS), décorations NORMALISÉES (normalizeDeco, la normalisation du modèle : ce que la restauration redonne), noms de
// groupes, logique, tours, réglages. Écriture = relecture : snapshotOf(fillFromSnapshot(t, s)) === s pour tout instantané s écrit par snapshotOf. Avant, l'instantané gardait les
// valeurs brutes d'une décoration et la restauration les normalisait : après annuler / rétablir le circuit n'égalait plus l'instantané courant.
const decoRow = (o) => { const n = normalizeDeco(o) || o; return [n.k, n.x, n.y, n.z, n.ry, n.s, n.c, n.u, n.ph || 0, n.cc || '', n.cp || null, n.g || 0, n.rx || 0, n.rz || 0]; };      // (cp : formes d'une pièce perso, sans elles l'annulation la perdait)
export function snapshotOf(track) {
  return JSON.stringify({
    ...(track.vt > 0 ? { v: [track.vt, track.vh] } : {}),      // vérification de l'auteur (TECH-054) : absente tant que le circuit n'a jamais été vérifié
    t: track.tiles.map(tileToRow),
    d: track.decos.map(decoRow),
    gn: track.groupNames(),
    lg: track.lg,
    lp: track.laps || 1,
    pr: { name: track.name, desc: track.desc, decor: track.decor, ambiance: track.ambiance, scripts: track.scripts, ...track.rulesState() },      // (ambiance et scripts : sans eux, annuler / rétablir les remettait à zéro)
  });
}

// Remplace le contenu de `track` par celui d'un instantané (objet déjà lu). vt / vh ne sont pas dans l'instantané : l'appelant les garde.
export function fillFromSnapshot(track, data) {
  track.clear();
  for (const row of data.t) track.add(rowToTile(row));
  for (const [k, x, y, z, ry, sc, c, u, ph, cc, cp, g, rx, rz] of data.d) track.addDeco({ k, x, y, z, ry, s: sc, c, u, ph, cc, cp: cp || undefined, g, rx, rz });
  for (const [g, n] of data.gn || []) track.setGroupName(g, n);
  track.lg = data.lg || null;
  track.laps = data.lp || 1;
  if (data.pr) {
    track.setParams(data.pr);
    if (data.pr.name) track.name = data.pr.name;
    if (data.pr.decor) track.decor = data.pr.decor;
  }
  return track;
}

// Forme canonique d'un instantané : celui du circuit qu'on obtient en l'écrivant dans un code puis en relisant ce code (c'est ce que fait l'essai : le circuit est re-décodé, puis
// rouvert dans l'éditeur). Sert à comparer, au retour d'un essai, l'état mis de côté et l'état rouvert (TECH-034) sans dépendre d'une valeur gardée plus finement en mémoire.
export function canonicalSnapshot(snap) {
  return snapshotOf(Track.decode(fillFromSnapshot(new Track(''), JSON.parse(snap)).encode()));
}

// Le même instantané sans la vérification de l'auteur : elle change quand on vérifie (course de vérification), sans que le CONTENU du circuit change ; le retour d'un essai
// compare le contenu (TECH-034 / 054).
export function withoutVerification(snap) {
  const d = JSON.parse(snap);
  delete d.v;
  return JSON.stringify(d);
}
