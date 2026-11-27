// Point d'entrée : crée le moteur de rendu et orchestre menu / course / éditeur.
import * as THREE from './vendor/three.module.min.js';
import { Scenery } from './scenery.js';
import { createTrackMaterials } from './trackMesh.js';
import { renderOptions } from './renderOptions.js';
import { Particles } from './particles.js';
import { Input } from './input.js';
import { GarageSession } from './garage.js';
import { CATEGORIES, CATEGORY_GROUPS } from './cosmetics.js';
import { profile, onProfileChange } from './profile.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { $, esc } from './dom.js';
import { RaceSession } from './race.js';
import { BUILTIN_TRACKS, buildBuiltin, authorLabel } from './tracks.js';
import { Track, hashString, lossBlocking } from './track.js';
import { lossMessage, lossNote } from './lossMessage.js';
import { adoptLegacyKeys } from './keyAlias.js';
import { installBuiltinKeyAliases, migrateBuiltinKeys } from './builtinKeys.js';
import { VERSION, PHYS_VER, GAME_NAME } from './version.js';
import { online, versionMismatchText } from './online.js';
import { account } from './account.js';
import { runWelcome } from './welcome.js';
import { initI18n } from './i18n/boot.js';
import { describeBuiltin, describeUser } from './trackDescriptor.js';
import { loadSettings, saveSettings, getRecord, saveRecord, saveMyTrack, newId, formatTime, purgeOldRecords, purgeEditorTrials, getJSON, setJSON } from './storage.js';
import { dayKey } from './daily.js';
import { Telemetry } from './telemetry.js';
import { ErrorReport } from './errorReport.js';
import { ghostFromHash } from './replay.js';
import { QualityManager, PROFILE_LABELS, wantAntialias } from './quality.js';
import { musicPlan } from './musicVariants.js';
import { multiMethods } from './app/multi.js';
import { academyMethods } from './app/academy.js';
import { competitionMethods } from './app/competition.js';
import { inboxMethods } from './app/inbox.js';
import { labMethods } from './app/lab.js';
import { rewardsMethods } from './app/rewards.js';
import { careerEndMethods } from './app/careerEnd.js';
import { mechanicsMethods } from './app/mechanics.js';
import { communityMethods } from './app/community.js';
import { moderationMethods } from './app/moderation.js';
import { screenMethods } from './app/screens.js';
import { settingsMethods } from './app/settings.js';
import { profileMethods } from './app/profile.js';
import { wiringMethods } from './app/wiring.js';
import { editorFlowMethods } from './app/editorFlow.js';
import { uiCustomMethods } from './app/uicustom.js';
import { modesMethods } from './app/modes.js';
import { raceHubMethods } from './app/raceHub.js';
import { theaterAppMethods } from './app/theater.js';
import { legalMethods } from './app/legal.js';
import { feedbackMethods } from './app/feedback.js';
import { updateMethods } from './app/update.js';

// Tous les modules sont chargés et liés : la garde du démarrage (js/boot-guard.js) se désarme.
window.__copytrackBooted = true;

const MENU_FPS_CAP = 30;     // images par seconde au plus dans les menus

class App {
  // identity : { kind: 'guest' | 'account', username } décidé par l'écran d'accueil (welcome.js), toujours avant le menu.
  constructor(identity) {
    this.identity = identity;
    this.settings = loadSettings();
    this.settings.playerName = identity.username;      // jamais de pseudo par défaut : celui de l'invité ou du compte
    // Une seule fois : les anciennes installations avaient « Haute » par défaut ; elles passent en détection automatique.
    if (!this.settings.gfxMigrated) { this.settings.gfxMigrated = 1; this.settings.quality = 'auto'; }
    saveSettings(this.settings);
    const canvas = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: wantAntialias(this.settings), powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 5000);
    this.materials = createTrackMaterials();
    this.scenery = new Scenery(this.scene, this.settings.quality);
    this.particles = new Particles(this.scene);
    this.quality = new QualityManager({
      renderer: this.renderer, scene: this.scene, camera: this.camera, scenery: this.scenery, particles: this.particles,
      resize: () => this._resize(), views: () => (this.session && this.session.view ? [this.session.view] : []), setDecoHidden: (v) => { renderOptions.hideDecos = !!v; }, setLights: (b) => { renderOptions.lightBudget = b || { point: 0, spot: 0 }; }, setAudioBudget: (b) => { if (this.audio) this.audio.music.setBudget(b); },
    });
    this.input = new Input();
    this.telemetry = new Telemetry({ store: { get: getJSON, set: setJSON }, send: (events) => online.logRuns(events), enabled: () => this.settings.telemetry === true });
    // (0.12.5) Erreurs du jeu, anonymes, avec le même accord que les statistiques (js/errorReport.js) : erreurs non rattrapées, promesses rejetées, boucle de jeu.
    this.errors = new ErrorReport({ store: { get: getJSON, set: setJSON }, send: (events) => online.logErrors(events), enabled: () => this.settings.telemetry === true,
      install: () => this.telemetry.installId, origin: location.origin, userAgent: navigator.userAgent });
    window.addEventListener('error', (ev) => { if (ev.error || ev.message) this.errors.capture('error', ev.error || ev.message, { file: ev.filename, line: ev.lineno, col: ev.colno }); });
    window.addEventListener('unhandledrejection', (ev) => { const r = ev.reason; if (!(r && r.code === 'offline')) this.errors.capture('rejection', r); });      // (hors ligne : attendu, pas un défaut)
    this.input.setBindings(this.settings.keys, this.settings.pad);
    this.input.setPadConfig({ deadzone: this.settings.padDeadzone, sens: this.settings.padSens, rumble: this.settings.haptics });
    purgeOldRecords();
    purgeEditorTrials();      // les essais de l'éditeur d'avant ne servent plus (TECH-022) : 21 à 43 Ko chacun
    profile();
    $('menu-foot').textContent = `${GAME_NAME} ${VERSION} · un jeu de course original · propulsé par three.js`;
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMusicVolume(this.settings.musicVolume);
    this.ui = new UI(this);
    this.input.sync = () => this._syncInput();      // (arbitre d'entrées : le contexte suit les captures qui s'arment ou se terminent, voir js/input.js)
    this.session = null;
    this.mode = null;

    this.builtins = BUILTIN_TRACKS.map((def, index) => {
      const track = buildBuiltin(def);
      return { def, track, index, key: `b-${def.id}-${hashString(track.encode())}` };
    });
    // Alias de clés des circuits officiels (RISK-001, js/builtinKeys.js ; table vide tant qu'aucun circuit n'a été modifié) : la lecture des records retrouve l'ancienne clé, puis on les copie.
    installBuiltinKeyAliases();
    migrateBuiltinKeys();

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { document.body.classList.add('touch'); this.input.touchActive = true; }
    document.body.classList.toggle('drag-steer', this.settings.touchMode === 'drag');
    this._applyQuality();
    this._applyAccess();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this._wire();
    this._wireUiCustom();
    this._wireTouch();
    this._wireEggs();
    window.addEventListener('orientationchange', () => this._resize());
    document.addEventListener('fullscreenchange', () => this._resize());
    document.addEventListener('visibilitychange', () => this._onVisibility());
    // (0.12.6) Contexte WebGL perdu (mémoire graphique saturée, pilote réinitialisé, onglet longtemps en arrière-plan sur mobile) : three.js garde de quoi
    // le rétablir ; le jeu met la course en pause et le dit, puis propose de recharger si le navigateur ne le rend pas.
    canvas.addEventListener('webglcontextlost', () => this._onContextLost());
    canvas.addEventListener('webglcontextrestored', () => this._onContextRestored());
  }

  _onContextLost() {
    this._autoPause();
    this._glLost = true;
    try { this.ui.flash('L’affichage 3D a été interrompu par le navigateur : reprise en cours…', 6); } catch { /* interface pas encore prête */ }
    clearTimeout(this._glTimer);
    this._glTimer = setTimeout(() => {
      if (!this._glLost) return;
      this.ui.modal({
        title: 'Affichage 3D interrompu',
        body: '<p>Le navigateur a coupé l’affichage 3D (mémoire graphique saturée ou pilote réinitialisé) et ne l’a pas rendu. Recharger la page le rétablit ; tes records, tes circuits et ta progression sont enregistrés.</p>',
        actions: [{ label: 'Recharger', primary: true, onClick: () => { location.reload(); } }, { label: 'Attendre' }],
      });
    }, 8000);
  }

  _onContextRestored() {
    this._glLost = false;
    clearTimeout(this._glTimer);
    try { this.ui.flash('Affichage 3D rétabli.', 2); } catch { /* */ }
  }

  // Course en solo interrompue par autre chose que le joueur (onglet masqué, téléphone verrouillé, écran « tourne ton téléphone ») : elle passe en pause. Avant 0.9.59 la
  // boucle s'arrêtait seulement (plus d'images dans un onglet masqué) et la course reprenait d'elle-même au retour, voiture lancée, sans prévenir ; en portrait sur un
  // téléphone elle continuait même SOUS l'écran qui demande de tourner l'appareil. En multijoueur il n'y a pas de pause (les autres courent) : rien ne change.
  _autoPause() {
    const S = this.session;
    if (this.mode === 'race' && S && !S.multi && !S.replay && !S.demo && (S.state === 'racing' || S.state === 'countdown') && typeof S.pause === 'function') S.pause();
  }

  // Onglet masqué : pause (voir _autoPause) et son coupé (la musique continuait de jouer dans un onglet en arrière-plan) ; il revient avec l'onglet.
  _onVisibility() {
    const hidden = document.visibilityState === 'hidden';
    if (hidden) this._autoPause();
    if (this.audio) this.audio.music.hold(hidden);      // le séquenceur de la musique s'arrête (aucune minuterie de 25 ms dans un onglet masqué) et ne réveille pas le contexte
    const ctx = this.audio && this.audio.ctx;
    if (!ctx || typeof ctx.suspend !== 'function') return;
    if (hidden && ctx.state === 'running') { this._audioHeld = true; ctx.suspend().catch(() => {}); }
    else if (!hidden && this._audioHeld) { this._audioHeld = false; if (ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  }

  saveSettings() {
    saveSettings(this.settings);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.session && this.session.kind === 'editor') this.session._refreshUI();
    const portrait = h > w && document.body.classList.contains('touch');
    const rotate = portrait && (this.mode === 'race' || this.mode === 'editor');
    $('rotate-hint').classList.toggle('hidden', !rotate);
    if (rotate) this._autoPause();          // l'écran « tourne ton téléphone » recouvre tout : la course n'avance pas derrière lui
    this._fsButton();
  }

  // Bouton plein écran (tactile) : en course et sur l'écran d'accueil seulement ; sur les autres écrans, il recouvrirait leurs boutons du bas
  // (sur un téléphone en paysage, « Jouer » de la fiche d'un circuit : trouvé par le parcours tactile, E22). Profil › Options › Plein écran reste là.
  _fsButton() {
    $('fs-btn').classList.toggle('hidden', !(document.body.classList.contains('touch') && (this.mode === 'race' || (this.mode === 'menu' && (this._screen || 'menu') === 'menu')) && !document.fullscreenElement));
  }

  // ------------------------------------------------------------ Navigation
  // Contexte d'entrée actif (voir l'en-tête de js/input.js) : un seul à la fois, du plus prioritaire au moins prioritaire.
  inputContext() {
    if (this.input.capture) return 'capture';
    if (this.ui && this.ui.modalOpen) return 'modal';
    if (this.mode === 'race') return !$('finish').classList.contains('hidden') || !$('pause').classList.contains('hidden') ? 'overlay' : 'race';
    return this.mode === 'editor' ? 'editor' : this.mode === 'garage' ? 'garage' : 'menu';
  }

  // Recalcule le contexte ; à chaque transition l'arbitre vide les appuis en attente et réinitialise les fronts de manette (Input.setContext).
  // Appelé à chaque image, et tout de suite à l'ouverture / la fermeture d'une fenêtre ou d'une superposition (ui.js) : une touche arrivée entre deux
  // images ne doit pas être lue dans le contexte précédent.
  _syncInput() {
    if (!this.input || !this.ui) return 'menu';
    const ctx = this.inputContext();
    this.input.setContext(ctx);
    return ctx;
  }

  _dispose() {
    this.input.cancelCapture();         // une capture de liaison en attente ne survit pas à un changement d'écran, de course ou de mode (TECH-006)
    $('garage').classList.add('hidden');
    $('replay-bar').classList.add('hidden');
    if (this.session) this.session.dispose();
    this.session = null;
    this._removeBoard();
    this.ui.closeModal();
  }

  // Descripteur d'un circuit de la carrière (trackDescriptor.js) : clé, médailles, objectif, verrou de chapitre et options de lancement.
  describeBuiltin(i) {
    return describeBuiltin(this.builtins[i], { total: this.builtins.length, builtins: this.builtins, getRecord });
  }

  playBuiltin(i, extra = {}) {
    this.launchDesc(this.describeBuiltin(i), extra);
  }

  playTrack(track, opts) {
    // Un essai lancé depuis l'éditeur n'exige pas d'arrivée (Phase 3) ; la vérification et les courses normales, si.
    const errs = track.validate({ test: !!(opts && opts.fromEditor && !opts.verify) });
    if (errs.length) { this.ui.flash(errs.join(' ')); return; }
    this._dispose();
    this.mode = 'race';
    this.ui.showScreen(null);
    this.ui.setMode('race');
    $('replay-bar').classList.add('hidden');
    try { this.session = new RaceSession(this, track, opts); } catch (e) { this._raceBuildFailed(e, opts); return; }
    // Musique du circuit : celle de l'auteur (ambiance.js) ou la musique de course du décor (musicVariants.js) ; en multijoueur ou en leçon, toujours le chill d'origine.
    const plan = musicPlan(track, opts);
    if (plan.kind === 'none') this.audio.music.stop(); else this.audio.music.play(plan.kind, plan.decor);
    this._resize();
  }

  // Une erreur dans une image de la boucle (voir `loop`). Rien n'est avalé en silence : elle est journalisée (console, window.__ctErrors). Pendant une course :
  // 1re erreur d'une série : retour au dernier checkpoint (l'état de la course est peut-être incohérent) ; 2e dans les 5 s : la course est abandonnée proprement
  // (retour au menu, message) ; au-delà, le jeu continue de tourner sans rien tenter de plus.
  _loopError(e) {
    const now = performance.now();
    (window.__ctErrors || (window.__ctErrors = [])).push({ t: Math.round(now), msg: String(e && e.message || e), stack: String(e && e.stack || '').split('\n').slice(0, 4).join(' | ') });
    if (window.__ctErrors.length > 20) window.__ctErrors.shift();
    if (this.errors) this.errors.capture('loop', e);
    if (this.mode !== 'race' || !this.session) {      // hors course : rien à reprendre, la boucle continue ; mais le joueur doit le savoir (au plus un message toutes les 15 s : une erreur peut revenir à chaque image)
      this._errTimes = [];
      if (window.__ctErrors.length <= 2) console.error(GAME_NAME + ' : erreur dans la boucle de jeu', e);
      if (!this._errFlashAt || now - this._errFlashAt > 15000) { this._errFlashAt = now; try { this.ui.flash('Une erreur d’affichage est survenue (détails dans la console du navigateur).', 3.5); } catch { /* l'interface elle-même peut être la cause */ } }
      return;
    }
    this._errTimes = (this._errTimes || []).filter((x) => now - x < 5000);
    this._errTimes.push(now);
    if (this._errTimes.length === 1 || this._errTimes.length === 2) console.error(GAME_NAME + ' : erreur dans la boucle de jeu', e);
    try {
      const S = this.session;
      // Une exception au milieu d'un pas : l'état de la voiture et l'enregistrement ne sont plus garantis d'accord. La course continue, mais elle est marquée
      // non vérifiable : ni record, ni envoi au classement, ni replay (race/finish.js : _finishUnverified). Une erreur hors d'un pas (rendu, interface) laisse la
      // simulation intacte : le retour au checkpoint, lui, est ENREGISTRÉ (respawn(true)), si bien que les commandes rejouent la même course (TECH-015).
      if (S._stepping && !S.demo && !S.replay) { S.unverifiable = true; S._stepping = false; }
      if (this._errTimes.length === 1 && S.state === 'racing' && !S.replay && typeof S.respawn === 'function') { S.respawn(true); this.ui.flash('Incident : retour au dernier checkpoint.', 2.5); }
      else if (this._errTimes.length === 2) { this.quitRace(); this.ui.flash('Une erreur est survenue : la course a été interrompue.', 4); }
    } catch (e2) { console.error(GAME_NAME + ' : la reprise après erreur a échoué', e2); }
  }

  playCode(code, entryId = null) {
    let track;
    try { track = Track.decode(code); } catch { this.ui.flash('Code de circuit invalide.'); return; }
    // Circuits de joueurs : médailles déduites du temps de l'auteur, seulement s'il l'a fini (trackDescriptor.js).
    adoptLegacyKeys(track);      // (records et courses rangés sous l'ancienne clé : TECH-039, js/keyAlias.js)
    this.launchDesc(describeUser(track, entryId ? { id: entryId } : null));
  }

  // ---- Replays et fantômes ------------------------------------------------
  // « Revoir la course » (écran d'arrivée) : le Replay Theater, avec le record d'avant (ou le record) à côté pour comparer.
  watchReplay() {
    const s = this.session;
    if (!(s instanceof RaceSession) || !s.lastRun) return;
    const compare = [];
    if (s.prevRun && Math.abs(s.prevRun.time - s.lastRun.time) > 1e-9) compare.push({ kind: 'inputs', label: s.lastRunWasRecord ? 'Ancien record' : 'Mon record', inputs: s.prevRun.inputs, time: s.prevRun.time });
    this.openTheater({ track: s.track, opts: s.opts, main: { ...s.lastRun, label: 'Cette course' }, compare, back: { track: s.track, opts: { ...s.opts } } });
  }

  endReplay() {
    $('replay-bar').classList.add('hidden');
    const back = this._replayBack;
    this._replayBack = null;
    if (!back) { this.showMenu('menu'); return; }
    if (back.hub) { this._backToHub(back.hub, back.from); return; }        // replay ouvert depuis la fiche du circuit (raceHub.js)
    this.playTrack(back.track, back.opts);
  }

  // La construction d'une course a levé (TECH-016) : RaceSession a libéré ce qu'elle avait créé ; on remet l'application en état cohérent (aucune session
  // fantôme, pas de mode « course » sans session), on revient où le joueur était (menu, liste, fiche du circuit, salon) et on le lui dit. back : le « retour »
  // d'un Replay Theater ({ hub, from } ou { track, opts }).
  _raceBuildFailed(e, opts = {}, back = null) {
    console.error(GAME_NAME + ' : la course n’a pas pu être construite', e);
    try { if (this.errors) this.errors.capture('build', e); } catch { /* sans importance */ }
    this.session = null;
    try {
      if (back && back.hub) this._backToHub(back.hub, back.from);
      else this._leaveTo(back ? {} : opts);
    } catch (e2) {
      console.error(GAME_NAME + ' : le retour après une course avortée a échoué', e2);
      this.session = null;
      try { this.showMenu('menu'); } catch { /* dernier recours : le menu lui-même est en cause */ }
    }
    this.ui.flash('Cette course n’a pas pu démarrer (données illisibles). Retour en arrière.', 4.5);
  }

  quitRace() {
    this._leaveTo(this.session ? this.session.opts : {});
  }

  // Où l'on retourne en quittant une course lancée avec `opts` (ou une course qui n'a pas pu démarrer).
  _leaveTo(opts) {
    if (opts.multi) { this._leaveRaceToLobby(opts.multi.room); return; }
    if (opts.academy) { this.showMenu('menu'); this.academyMenu(); return; }
    if (opts.mode) { this.showMenu('menu'); this.modesMenu(); return; }
    if (opts.fromEditor) this.openEditor(this.editorState);
    else if (opts.fromHub && this._lastDesc && this._lastDesc.key === opts.trackKey) this._backToHub(this._lastDesc, opts.fromHub);     // course lancée depuis la fiche : on y revient
    else if (opts.builtinIndex != null || opts.daily) this.showMenu('tracks');
    else if (opts.userEntry) this.showMenu('mytracks');
    else if (opts.community) this.showMenu('community');
    else this.showMenu('menu');
  }

  // ------------------------------------------------------------ Multijoueur
  // Salons : création / jonction par code. Supabase Realtime ne sert qu'à se trouver ; la course passe en WebRTC (net/).
  _tokenFn() { return () => online.ensureSession().then((s) => s.access_token); }

  _removeBoard() { if (this._board) { this._board.el.remove(); this._board = null; } }

  // ---- Classements en ligne --------------------------------------------------------
  // Fin de course : si c'est un record local, on l'envoie (le serveur rejoue la course).
  // Tout ce qui suit un `await` doit se demander si CETTE arrivée est toujours celle de l'écran : le joueur a pu recommencer (la même session, donc la garde
  // par identité d'objet ne le voit pas), quitter la course ou changer d'écran pendant l'attente. `gen` (jeton de génération de la session, incrémenté par chaque
  // arrivée et chaque redémarrage) le dit ; un résultat périmé n'est jamais rendu (TECH-018). Les commandes et les temps intermédiaires de l'arrivée sont lus
  // AVANT l'attente : session.lastRun et logic.splits appartiennent à la course suivante dès qu'on recommence.
  async onRaceFinished(session, time, isRecord) {
    const key = session.trackKey;
    if (!key || !/^(b-|daily-|u-)/.test(key) || session.opts.fromEditor || session.opts.spawn || session.replay) return;
    if (this.settings.onlineScores === false || !isRecord || !session.lastRun) return;
    const gen = session._finishGen, run = session.lastRun, splits = session.logic ? session.logic.splits.slice() : [];
    const current = () => this.session === session && session._finishGen === gen;
    const el = $('fin-online');
    // (classList et non className : showFinish pose `hidden` sur ce bloc quand une arrivée n'est pas classable ; l'écraser le rendrait visible, TECH-018)
    const say = (cls, text) => { el.classList.remove('hidden', 'ok', 'ko'); el.classList.add('fin-online'); if (cls) el.classList.add(cls); el.textContent = text; };
    say('', '🌍 Envoi au classement…');
    try {
      const r = await online.submitScore({
        trackKey: key, code: key.startsWith('u-') ? (session.opts.officialTrack || session.track).encode() : '',      // variante : le code du circuit d'origine
        inputs: run.inputs, time, physVer: PHYS_VER,
      }, this.settings.playerName);
      // Le serveur a accepté la course : on s'assure que la progression locale la contient (mise à jour sûre si l'écriture de
      // fin de course avait échoué : stockage plein, autre onglet…), avec les commandes de CETTE arrivée, même si le joueur est parti ;
      // l'écran n'est rafraîchi que si cette écriture a changé quelque chose (TECH-066). Les médailles et le menu se lisent depuis ces records.
      if (this._ensureLocalRecord(key, time, { inputs: run.inputs, splits })) this.refreshProgress();
      if (!current()) return;
      say('ok', r.improved
        ? `🌍 Classement mondial : ${r.rank}${r.rank === 1 ? 'er' : 'e'} sur ${r.total}${r.rank === 1 ? ' — meilleur temps du monde !' : ''}`
        : `🌍 Meilleur temps en ligne : ${formatTime(r.best)} (${r.rank}${r.rank === 1 ? 'er' : 'e'} sur ${r.total})`);
    } catch (e) {
      if (!current()) return;
      // Version de physique différente (drapeau `versionMismatch` du serveur, devenu le code 'version-mismatch' : online.js) : soit la fonction serveur « submit-score »
      // est en cours de mise à jour (le site est en avance sur elle), soit cette page est périmée. Le record reste enregistré sur l'appareil.
      say('ko', e && e.code === 'version-mismatch' ? versionMismatchText(e, PHYS_VER) : '🌍 Classement : ' + e.message);
    }
  }

  // Garantit que le record local de `key` est au moins aussi bon que `time` (commandes et temps intermédiaires de l'arrivée dans `extra`). Renvoie vrai si
  // elle a dû l'écrire : seulement alors les listes affichées sont périmées.
  _ensureLocalRecord(key, time, { inputs = null, splits = [] } = {}) {
    const cur = getRecord(key);
    if (cur && time >= cur.time - 1e-9) return false;
    saveRecord(key, { time, splits, ghost: null, inputs, pv: PHYS_VER, date: Date.now(), name: this.settings.playerName });
    return true;
  }

  // Les données de l'écran de menu affiché ont changé (record écrit après coup) : on les met à jour SANS fermer le panneau ouvert, ni voler le focus, ni
  // perdre le défilement (TECH-066). Accueil : le seul chiffre qui en dépend ; listes (niveaux, mes circuits) : reconstruites, défilement et focus rendus.
  refreshProgress() {
    if (this.mode !== 'menu') return;
    const scr = this._screen;
    if (scr === 'menu') {
      const r = getRecord('daily-' + dayKey());
      $('daily-best').textContent = r ? formatTime(r.time) : 'nouveau';
      return;
    }
    if (scr !== 'tracks' && scr !== 'mytracks') return;
    const root = $(scr), top = [...root.querySelectorAll('*'), root].filter((e) => e.scrollTop > 0).map((e) => [e, e.scrollTop]);
    const focusables = () => [...root.querySelectorAll('button, [tabindex], a[href], select, input')];
    const fi = focusables().indexOf(document.activeElement), n = focusables().length;
    if (scr === 'tracks') this._renderTracks(); else this._renderMyTracks();
    for (const [e, t] of top) if (e.isConnected) e.scrollTop = t;
    const again = focusables();
    if (fi >= 0 && again.length === n) again[fi].focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ Garage / profil
  openGarage() {
    this._dispose();
    this.mode = 'garage';
    this.ui.showScreen(null);
    this.ui.setMode('garage');
    this.session = new GarageSession(this);
    $('garage').classList.remove('hidden');
    const tabs = $('garage-tabs');
    tabs.innerHTML = '';
    // (0.15.0) Onglets rangés en quatre familles (CATEGORY_GROUPS) : une rangée de familles, puis les seuls onglets de la famille choisie
    // (GarageSession._render cache les autres). Avant : 14 onglets d'un bloc, sur quatre ou cinq rangées.
    const groups = document.createElement('div');
    groups.className = 'gtab-groups';
    groups.setAttribute('role', 'group');
    groups.setAttribute('aria-label', 'Familles');
    const sub = document.createElement('div');
    sub.className = 'gtab-sub';
    CATEGORY_GROUPS.forEach((g, gi) => {
      const gb = document.createElement('button');
      gb.className = 'gtab';
      gb.type = 'button';
      gb.dataset.group = String(gi);
      gb.textContent = g.label;
      gb.onclick = () => { this.audio.click(); const s = this.session; s.setCat(s.lastCat && g.cats.includes(s.lastCat[gi]) ? s.lastCat[gi] : g.cats[0]); };
      groups.appendChild(gb);
      for (const id of g.cats) {
        const c = CATEGORIES.find((x) => x.id === id);
        if (!c) continue;
        const b = document.createElement('button');
        b.className = 'tab';
        b.dataset.cat = c.id;
        b.dataset.group = String(gi);
        b.textContent = c.label;
        b.onclick = () => { this.audio.click(); this.session.setCat(c.id); };
        sub.appendChild(b);
      }
    });
    tabs.append(groups, sub);
    this.session._render();
    this._resize();
  }

  toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const p = el.requestFullscreen ? el.requestFullscreen() : null;
    if (p && p.then) {
      p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => this.ui.flash('Plein écran indisponible sur cet appareil.'));
    }
  }

  // Écran Profil : quatre onglets (Compte, Sauvegardes, Options, Commandes).
  setProfileTab(tab) { this.input.cancelCapture(); this.profileTab = tab; this._renderProfile(); }

  // ------------------------------------------------------------ Boucle
  start() {
    const hash = location.hash;
    this.refreshKeyHints();
    this.showMenu('menu');
    this._startBench();
    this.telemetry.scheduleFlush(15000);
    this.errors.scheduleFlush(20000);
    setTimeout(() => this.askTelemetry(), 4000);
    setTimeout(() => this.checkRewards(), 2500);          // rattrape ce qui est déjà mérité (joueur existant)
    this.startUpdateCheck();                              // (0.13.1) nouvelle version en ligne : bandeau « Recharger » (app/update.js)
    // Premier lancement : petit tutoriel (sauf si on arrive par un lien de circuit).
    if (!this.settings.tutorialDone && !hash.startsWith('#t=') && !hash.startsWith('#g=') && !hash.startsWith('#salle=')) setTimeout(() => { if (!this.ui.modalOpen) this.tutorial(); }, 700);
    // (0.13.1) lien d'invitation à une salle multijoueur : #salle=CODE
    if (hash.startsWith('#salle=')) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => this.joinFromLink(decodeURIComponent(hash.slice(7))), 400); }
    if (hash.startsWith('#g=')) {
      try {
        const ghost = ghostFromHash(hash);
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => this.openGhostLink(ghost), 400);
      } catch (e) { history.replaceState(null, '', location.pathname + location.search); this.ui.flash(e.message, 4); }
    }
    if (hash.startsWith('#t=')) {
      try {
        const track = Track.decode(hash);
        history.replaceState(null, '', location.pathname + location.search);
        // Phase 4 : un lien qui perdrait des pièces à la lecture (version plus récente du jeu) peut se jouer (pour voir) mais pas s'enregistrer ni s'ouvrir dans l'éditeur.
        const loss = lossMessage(track), blocked = lossBlocking(track);
        this.ui.modal({
          title: 'Circuit partagé',
          body: `<p>« ${esc(track.name)} » · ${track.tiles.length} pièces${track.author ? ' · par ' + esc(authorLabel(track.author)) : ''}</p>${loss ? `<p class="mp-err" role="alert">${esc(loss)}${blocked ? ' ' + esc(lossNote.updateToEdit()) : ''}</p>` : ''}`,
          actions: [
            { label: 'Jouer', primary: true, onClick: () => this.playCode(track.encode()) },
            ...(blocked ? [] : [{ label: 'Ouvrir dans l’éditeur', onClick: () => {
              const entry = saveMyTrack({ id: newId(), name: track.name, code: track.encode() });
              this.openEditor({ code: entry.code, entryId: entry.id, name: entry.name });
            } }]),
            { label: 'Annuler' },
          ],
        });
      } catch { this.ui.flash('Lien de circuit invalide.'); }
    }
    let last = performance.now();
    let rawLast = last;
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      rawLast = last;
      last = now;
      // Arbitre d'entrées : le contexte de l'image décide quels fronts de manette sont suivis. Les fronts « menu » le sont à CHAQUE image (A tenu en course :
      // son état précédent est exact quand une superposition s'ouvre, TECH-005) ; ceux de la course / de l'éditeur seulement dans leur contexte.
      const ctx = this._syncInput();
      this.input.pollGamepad('menu');
      if (ctx === 'race' || ctx === 'overlay') this.input.pollGamepad('race');
      else if (ctx === 'editor') this.input.pollGamepad('editor');
      if (ctx === 'modal' || ctx === 'overlay' || ctx === 'menu' || ctx === 'garage') {
        const m = this.input.padMenu();
        if (m && (m.dx || m.dy || m.confirm || m.back)) this._padNav(m);
      }
      if (this._disco && this.scenery) this.scenery.sky.material.uniforms.horizon.value.setHSL((now / 4000) % 1, 0.8, 0.55);
      if (this.ui.modalOpen && this.input.hit('Escape')) this.ui.closeModal();
      // Échap dans un écran, un panneau de l'accueil ou le garage : le même chemin que le bouton « ← Retour » visible (TECH-065). Sans bouton retour (écran
      // sans panneau d'origine), on retombe sur l'accueil.
      if ((ctx === 'menu' || ctx === 'garage') && this.input.hit('Escape') && !this.goBack() && this.mode === 'menu') { if (this._screen === 'race-hub') this.closeRaceHub(); else if (this._screen !== 'menu') this.showScreen('menu'); }
      if (this.session) this.session.update(dt);
      // Profil Ultra Potato : on ne dessine qu'une image sur deux (la physique et les commandes continuent à pleine vitesse). Dans les menus (rien à
      // piloter, une simple animation de fond) on dessine à 30 images/s au plus : la machine chauffe moins et la batterie dure. Le banc d'essai de la
      // qualité, qui mesure justement cette animation, passe avant.
      const profileCap = this.quality.profile && this.quality.profile.fpsCap;
      const cap = this.mode === 'menu' && !this.bench ? Math.min(MENU_FPS_CAP, profileCap || MENU_FPS_CAP) : profileCap;
      if (!cap || now - (this._lastDraw || 0) >= 1000 / cap - 4) { this._lastDraw = now; this.renderer.render(this.scene, this.camera); }
      this.quality.tick();
      if (this.bench) {
        // La mesure ne compte que l'animation du menu, visible et sans fenêtre ouverte ; si le joueur part ailleurs, on se rabat sur un profil sûr.
        if (this.mode !== 'menu') { this.bench.abort(); this.bench = null; this._renderQualityInfo(); }
        else this.bench.frame(now, !this.ui.modalOpen && document.visibilityState === 'visible');
      } else {
        const racing = this.mode === 'race' && this.session && this.session.state === 'racing';
        const nm = this.quality.watch((now - rawLast) / 1000, racing, this.settings.quality === 'auto');
        if (nm) { this.settings.gfxProfile = nm; this.saveSettings(); this.ui.flash(`Qualité réduite automatiquement : ${PROFILE_LABELS[nm]}`, 2.5); this._renderQualityInfo(); }
      }
      if (this.settings.showFps) {
        this._fpsN = (this._fpsN || 0) + 1; this._fpsT = (this._fpsT || 0) + dt;
        if (this._fpsT >= 0.5) { $('fps').textContent = `${Math.round(this._fpsN / this._fpsT)} i/s`; this._fpsN = 0; this._fpsT = 0; }
      }
    };
    // La boucle du jeu NE DOIT JAMAIS S'ARRÊTER : avant 0.9.54, `requestAnimationFrame(loop)` était la dernière instruction du corps, donc UNE exception (physique, course,
    // rendu, interface) la tuait pour de bon : écran figé jusqu'au rechargement, sans message, alors que les boutons de la page répondaient encore (le « gel complet »).
    // Désormais la prochaine image est toujours demandée, les touches « appuyées cette image » toujours effacées, et l'erreur est traitée (voir _loopError).
    const loop = (now) => {
      try { frame(now); } catch (e) { this._loopError(e); } finally {
        try { this.input.clearHits(); } catch { /* sans importance */ }
        requestAnimationFrame(loop);
      }
    };
    requestAnimationFrame(loop);
  }
}

// Les familles de méthodes vivent dans app/ ; elles s'ajoutent au prototype (`this` est l'instance).
Object.assign(App.prototype, multiMethods, academyMethods, competitionMethods, inboxMethods, labMethods, rewardsMethods, careerEndMethods, mechanicsMethods, communityMethods, moderationMethods, screenMethods, settingsMethods, profileMethods, wiringMethods, editorFlowMethods, uiCustomMethods, modesMethods, raceHubMethods, theaterAppMethods, legalMethods, feedbackMethods, updateMethods);


// Application installable et jouable hors ligne (service worker), si le contexte le permet.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* pas grave : le jeu marche sans */ }); });
}

// (0.12.6) three.js r170 demande WebGL 2. Sans lui, rien ne peut s'afficher : le joueur le sait AVANT de choisir un pseudo, avec quoi faire.
function webgl2Available() {
  try { const c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch { return false; }
}
const NO_WEBGL = 'Ce navigateur n’a pas pu démarrer la 3D (WebGL 2). Active l’accélération matérielle dans ses réglages, mets-le à jour, ou essaie un navigateur récent (Chrome, Edge, Firefox, Safari).';

(async () => {
  try {
    // 0. La langue d'abord (réglage de l'appareil) : l'écran d'accueil lui-même est traduit.
    await initI18n();
    if (!webgl2Available()) { const e = new Error(NO_WEBGL); e.noWebGL = true; throw e; }
    // 1. Pseudo d'abord : invité (session) ou compte. Le menu et le jeu ne se chargent qu'ensuite.
    const identity = await runWelcome();
    // 2. Le jeu, avec la progression du bon joueur (la portée de stockage est déjà choisie).
    const app = new App(identity);
    window.copytrack = app;      // accès de débogage et des tests navigateur (tools/test-browser.mjs)
    app.start();
    account.onNotice = (msg) => app.ui.flash(msg, 6);      // l'espace de l'appareil ne suffit pas à la sauvegarde du compte (TECH-007) : le joueur le sait
    online.onNotice = (msg) => app.ui.flash(msg, 6);      // une nouvelle identité d'invité n'est jamais créée en silence (TECH-026)
    onProfileChange(() => app.ui.updateCoins());          // un autre onglet a écrit le profil (TECH-027) : les pièces affichées suivent
    // (une synchronisation peut rapporter les records qu'un autre appareil, d'avant le changement de clé d'un circuit, gardait sous l'ancienne clé : on les copie, puis l'écran se met à jour)
    if (identity.kind === 'account') account.sync().then(() => { if (migrateBuiltinKeys()) app.refreshProgress(); }).catch(() => { /* hors ligne : reprise plus tard */ });
  } catch (err) {
    console.error(err);
    const l = document.getElementById('loading');
    l.classList.remove('hidden');
    l.querySelector('.tagline').textContent = err && err.noWebGL ? NO_WEBGL : /webgl/i.test(String(err && err.message)) ? NO_WEBGL : 'Le jeu n’a pas pu démarrer : ' + (err && err.message) + '. Recharge la page.';
  }
})();
