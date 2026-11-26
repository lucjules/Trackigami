// Musique du jeu, entièrement synthétisée (AudioEngine.js) : un groove house dans les menus, une musique chill pendant les courses, dont l'intensité
// suit la vitesse. Coupure nette entre les deux. (0.12.4 : le MP3 du menu, dont l'auteur et la licence n'étaient pas connus, est retiré.)
// 0.21.0 (COMPLETE-006) : la musique de course a une variante par décor (musicVariants.js) ; sans décor (multijoueur, Académie, décor inconnu), le chill d'origine.
import { AudioEngine } from './AudioEngine.js';
import { variantFor, cleanBudget, DEFAULT_BUDGET } from './musicVariants.js';

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.volume = 0.45;
    this.synth = null;
    this.kind = null;       // morceau en cours
    this.variant = null;    // variante de décor en cours (musicVariants.js), null = chill d'origine ou menu
    this.want = null;       // morceau demandé (lancé dès que l'audio est débloqué)
    this.wantDecor = '';
    this.budget = { ...DEFAULT_BUDGET };      // budget de voix du profil de qualité (setBudget)
    this.held = false;      // onglet masqué (hold)
    this._timer = null;
  }

  // Budget de voix du profil de qualité (quality.js, champ `audio`) : pris en compte tout de suite et à chaque nouveau morceau.
  setBudget(b) {
    this.budget = cleanBudget(b);
    if (this.synth) this.synth.setBudget(this.budget);
  }

  // Onglet masqué : le séquenceur s'arrête et ne réveille pas l'AudioContext (main.js suspend le contexte) ; au retour il repart.
  hold(on) {
    this.held = !!on;
    if (this.synth) this.synth.hold(this.held);
  }

  setVolume(v) {
    this.volume = v;
    if (this.synth) this.synth.setVolume(v * 0.7);
  }

  // kind : 'menu' ou 'game'. L'ancien morceau est coupé (fondu de 0,4 s), le nouveau démarre une fois le silence fait.
  // decor : (kind 'game') le décor du circuit, dont la variante musicale est jouée ; sans décor connu, le chill d'origine. Un même morceau redemandé ne redémarre pas.
  play(kind = 'game', decor = '') {
    kind = kind === 'menu' ? 'menu' : 'game';
    const variant = kind === 'game' ? variantFor(decor) : null;
    this.want = kind; this.wantDecor = variant ? variant.id : '';
    const ctx = this.audio.ctx;
    if (!ctx || (this.kind === kind && this.variant === variant)) return;
    clearTimeout(this._timer);
    if (!this.synth) { this.synth = new AudioEngine({ volume: 1 }).init(ctx); this.synth.setBudget(this.budget); this.synth.hold(this.held); }
    const wasPlaying = this.synth.running;
    if (this.synth.running) this.synth.stop();
    this.kind = kind; this.variant = variant;
    this._timer = setTimeout(() => {
      if (this.want !== kind || this.wantDecor !== (variant ? variant.id : '')) return;
      this.synth.setVolume(this.volume * 0.7);
      this.synth.updateWithCarSpeed(kind === 'menu' ? 0.5 : 0);
      this.synth.start(kind === 'menu' ? 'house' : 'chill', variant);
    }, wasPlaying ? 450 : 0);
  }

  // Vitesse de la voiture, de 0 à 1 (au-delà : boost) ; sans effet au menu.
  // (Avec une variante, le boost (r > 1) ajoute sa couche ; le chill d'origine ne la reçoit pas, comme avant.)
  setSpeed(r) { if (this.synth && this.kind === 'game' && this.synth.running) this.synth.updateWithCarSpeed(this.variant ? r : Math.min(1, r)); }

  stop() {
    this.want = null; this.kind = null; this.variant = null; this.wantDecor = '';
    clearTimeout(this._timer);
    if (this.synth) this.synth.stop();
  }

  // Appelé quand l'AudioContext vient d'être débloqué par un clic.
  resume() {
    if (this.want) { const k = this.want; this.kind = null; this.play(k, this.wantDecor); }
  }
}
