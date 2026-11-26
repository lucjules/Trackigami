// Effets sonores synthétisés (Web Audio API). La musique est gérée à part (voir music.js).
import { Music } from './music.js';
import { engineTargets, TIMBRES, VEHICLES } from './vehicleSound.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.engineOn = false;
    this.music = new Music(this);
  }

  setMusicVolume(v) {
    this.music.setVolume(v);
  }

  // Doit être appelé suite à une interaction utilisateur.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // Bruit blanc réutilisable
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // Moteur : deux oscillateurs + filtre passe-bas
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engFilter.Q.value = 4;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = this.voice ? this.voice.wave : 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.g2 = g2;
    // 0.21.0 (COMPLETE-017) : deux gains de passage (engMod : modulation d'amplitude de la moto ; engSwap : fondu lors d'une transformation) entre le filtre et le gain du moteur ;
    // au repos ils valent 1 (la voiture sonne exactement comme avant).
    this.engMod = ctx.createGain();
    this.engSwap = ctx.createGain();
    this.osc1.connect(this.engFilter);
    this.osc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engMod).connect(this.engSwap).connect(this.engGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // Crissement (dérapage)
    this.skid = this._loopNoise('bandpass', 1400, 2.5);
    // Vent
    this.wind = this._loopNoise('lowpass', 500, 0.7);
    // Pluie (environnements, E19 : envFx.js)
    this.rainLoop = this._loopNoise('highpass', 2600, 0.4);
    // Couches propres aux véhicules (vehicleSound.js) : sillage et clapot (bateau), souffle (deltaplane) ; deux oscillateurs lents (modulation de la moto, clapot et rafales).
    this.wake = this._loopNoise('bandpass', 900, 1.1, 0.37);
    this.chop = this._loopNoise('lowpass', 420, 0.8, 0.81);
    this.breath = this._loopNoise('bandpass', 700, 0.9, 1.23);
    this.lfoAm = ctx.createOscillator();
    this.lfoAm.frequency.value = 20;
    this.lfoAmDepth = ctx.createGain(); this.lfoAmDepth.gain.value = 0;
    this.lfoAm.connect(this.lfoAmDepth).connect(this.engMod.gain);
    this.lfoSlow = ctx.createOscillator();
    this.lfoSlow.frequency.value = 2.2;
    this.chopMod = ctx.createGain(); this.chopMod.gain.value = 0;
    this.breathMod = ctx.createGain(); this.breathMod.gain.value = 0;
    this.lfoSlow.connect(this.chopMod).connect(this.chop.g.gain);
    this.lfoSlow.connect(this.breathMod).connect(this.breath.g.gain);
    this.lfoAm.start(); this.lfoSlow.start();
    this._veh = null; this._timbre = null; this._pending = null;
    this.music.resume();
  }

  _loopNoise(type, freq, q, offset = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    if (offset) src.start(0, offset); else src.start();      // (les couches ajoutées en 0.21.0 démarrent ailleurs dans le bruit : pas de phase commune avec le vent)
    return { src, f, g };
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // Voix du véhicule choisie par le joueur (custom.js : fx.engine, fx.pitch, fx.hornPitch). Purement sonore.
  // `custom` : le joueur a choisi une forme d'onde (autre que celle par défaut) ; elle prime alors sur le timbre propre à la moto, au bateau et au deltaplane.
  setVoice(fx) {
    const WAVE = { default: 'sawtooth', saw: 'sawtooth', square: 'square', tri: 'triangle', sine: 'sine' };
    this.voice = { wave: WAVE[fx && fx.engine] || 'sawtooth', pitch: (fx && fx.pitch) || 1, hornPitch: (fx && fx.hornPitch) || 1, custom: !!(fx && fx.engine && fx.engine !== 'default' && WAVE[fx.engine]) };
    if (this.osc1) this.osc1.type = this._wave1(this._timbre || 'car');
  }

  // Forme d'onde du premier oscillateur : celle de la voix du joueur pour la voiture (comme avant) ou si elle est choisie, sinon celle du véhicule.
  _wave1(veh) { return veh === 'car' || (this.voice && this.voice.custom) ? (this.voice ? this.voice.wave : 'sawtooth') : TIMBRES[veh].wave1; }

  // Applique le timbre d'un véhicule (formes d'onde, niveau du second oscillateur, résonance) : appelé quand le moteur est (presque) muet.
  _applyTimbre(veh, t) {
    this._timbre = veh;
    this.osc1.type = this._wave1(veh);
    this.osc2.type = TIMBRES[veh].wave2;
    this.g2.gain.setValueAtTime(TIMBRES[veh].g2, t);
    this.engFilter.Q.setValueAtTime(TIMBRES[veh].q, t);
  }

  // Mise à jour continue du moteur (appelée chaque image). state.vehicle : 'car' (par défaut), 'moto', 'boat' ou 'glider' (vehicleSound.js). Purement sonore : ne lit que l'état qu'on lui donne.
  engine(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!state) {
      this.engGain.gain.setTargetAtTime(0, t, 0.08);
      this.skid.g.gain.setTargetAtTime(0, t, 0.05);
      this.wind.g.gain.setTargetAtTime(0, t, 0.1);
      this.rainLoop.g.gain.setTargetAtTime(0, t, 0.2);
      for (const l of [this.wake, this.chop, this.breath]) l.g.gain.setTargetAtTime(0, t, 0.12);
      this.chopMod.gain.setTargetAtTime(0, t, 0.12); this.breathMod.gain.setTargetAtTime(0, t, 0.12); this.lfoAmDepth.gain.setTargetAtTime(0, t, 0.05);
      this._veh = null; this._pending = null;                // la prochaine image avec un véhicule reprend à zéro (timbre posé tout de suite)
      return;
    }
    const veh = VEHICLES.includes(state.vehicle) ? state.vehicle : 'car';
    if (veh !== this._veh) {
      if (this._veh === null) { this._applyTimbre(veh, t); this.engSwap.gain.cancelScheduledValues(t); this.engSwap.gain.setValueAtTime(1, t); }
      else {                                                  // transformation en course : le moteur plonge, le timbre change quand il est quasi muet, puis il remonte (≈ 0,3 s en tout)
        this._pending = { veh, at: t + 0.1 };
        this.engSwap.gain.cancelScheduledValues(t);
        this.engSwap.gain.setTargetAtTime(0, t, 0.025);
        this.engSwap.gain.setTargetAtTime(1, t + 0.12, 0.07);
      }
      this._veh = veh;
    }
    if (this._pending && t >= this._pending.at) { this._applyTimbre(this._pending.veh, t); this._pending = null; }
    const T = engineTargets(veh, state, this.voice);
    this.osc1.frequency.setTargetAtTime(T.f1, t, 0.03);
    this.osc2.frequency.setTargetAtTime(T.f2, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(T.filt, t, 0.05);
    this.engGain.gain.setTargetAtTime(T.vol, t, 0.05);
    this.skid.g.gain.setTargetAtTime(T.skid, t, 0.04);
    this.wind.g.gain.setTargetAtTime(T.wind, t, 0.1);      // draft : aspiration derrière une voiture (feel.js), le vent siffle un peu plus
    // Couches de véhicule : lissées plus lentement que le moteur (un fondu entre deux véhicules, jamais une coupure).
    this.engMod.gain.setTargetAtTime(1 - T.amDepth / 2, t, 0.05);
    this.lfoAmDepth.gain.setTargetAtTime(T.amDepth / 2, t, 0.05);
    this.lfoAm.frequency.setTargetAtTime(T.amHz, t, 0.05);
    this.wake.g.gain.setTargetAtTime(T.wake, t, 0.12); this.wake.f.frequency.setTargetAtTime(T.wakeF, t, 0.1);
    this.chop.g.gain.setTargetAtTime(T.chop, t, 0.12); this.chopMod.gain.setTargetAtTime(T.chopDepth, t, 0.12);
    this.breath.g.gain.setTargetAtTime(T.breath, t, 0.12); this.breath.f.frequency.setTargetAtTime(T.breathF, t, 0.1); this.breathMod.gain.setTargetAtTime(T.breathDepth, t, 0.12);
    this.lfoSlow.frequency.setTargetAtTime(veh === 'glider' ? T.gustHz : T.chopHz, t, 0.2);
  }

  // Bruit de la pluie (0 à 1, environnements E19) : continu, suit l'intensité de la course.
  envLevel(k) {
    if (!this.ctx || !this.rainLoop) return;
    this.rainLoop.g.gain.setTargetAtTime(Math.min(0.12, Math.max(0, k) * 0.12), this.ctx.currentTime, 0.4);
  }

  // Une voiture traverse une flaque (0 à 1 selon la vitesse).
  splash(k = 0.5) {
    this.noise(0.35 + k * 0.25, 1200, 0.1 + k * 0.18, 'bandpass', 0, 350);
  }

  _env(node, t, a, d, peak) {
    if (!Number.isFinite(peak) || !Number.isFinite(t)) return;   // un son raté ne doit jamais bloquer le jeu
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq, dur = 0.15, type = 'sine', vol = 0.25, delay = 0, slideTo = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.01, dur, vol);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur = 0.2, freq = 800, vol = 0.3, type = 'lowpass', delay = 0, sweepTo = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.01, dur, vol);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  countdown(final) {
    this.tone(final ? 880 : 440, final ? 0.45 : 0.18, 'triangle', 0.3);
  }

  checkpoint(better) {
    const base = better === false ? 520 : 660;
    [0, 4, 7].forEach((s, i) => this.tone(base * 2 ** (s / 12), 0.18, 'triangle', 0.22, i * 0.06));
  }

  finish(record) {
    const notes = record ? [0, 4, 7, 12, 16] : [0, 4, 7, 12];
    notes.forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.35, 'triangle', 0.25, i * 0.09));
    if (record) this.noise(1.0, 3000, 0.08, 'highpass', 0.3);
  }

  miniTurbo(level) {
    this.noise(0.35, 500, 0.22, 'bandpass', 0, 2400);
    this.tone(level === 2 ? 520 : 380, 0.25, 'square', 0.06, 0, level === 2 ? 1040 : 760);
  }

  perfectLanding() {
    this.tone(660, 0.12, 'triangle', 0.12);
    this.tone(990, 0.18, 'triangle', 0.1, 0.08);
  }

  // Klaxon (cosmétique) : plusieurs timbres.
  horn(kind = 'classic') {
    const hp = this.voice ? this.voice.hornPitch : 1;
    const tone = (f, ...rest) => this.tone(f * hp, ...rest);
    if (kind === 'duo') { tone(440, 0.18, 'square', 0.08); tone(554, 0.22, 'square', 0.08, 0.2); }
    else if (kind === 'tuba') { tone(147, 0.45, 'sawtooth', 0.12); tone(196, 0.45, 'square', 0.05); }
    else if (kind === 'arcade') { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.09, 'square', 0.07, i * 0.08)); }
    else { tone(392, 0.32, 'square', 0.09); tone(494, 0.32, 'square', 0.07); }
  }

  // Petit « ding » (déclencheurs de circuit).
  ding() { this.tone(990, 0.18, 'triangle', 0.12); this.tone(1320, 0.22, 'triangle', 0.08, 0.08); }

  boost() {
    this.noise(0.6, 300, 0.3, 'bandpass', 0, 2600);
    this.tone(180, 0.4, 'sawtooth', 0.08, 0, 520);
  }

  bounce() {
    this.tone(220, 0.35, 'sine', 0.25, 0, 880);
    this.tone(330, 0.25, 'triangle', 0.12, 0.05, 990);
  }

  transform() {
    this.noise(0.5, 600, 0.2, 'bandpass', 0, 3200);
    this.tone(160, 0.5, 'sawtooth', 0.1, 0, 640);
    this.tone(640, 0.3, 'triangle', 0.12, 0.35, 1280);
  }

  whoosh() {
    this.noise(0.9, 400, 0.18, 'bandpass', 0, 1800);
  }

  thud(strength = 20) {
    const v = Math.min(0.5, (Number.isFinite(strength) ? strength : 20) * 0.025);
    if (v < 0.03) return;
    this.noise(0.18, 260, v, 'lowpass');
    this.tone(70, 0.15, 'sine', v * 0.8, 0, 40);
  }

  land(strength) {
    const v = Math.min(0.4, strength * 0.03);
    if (v < 0.04) return;
    this.noise(0.25, 180, v, 'lowpass');
  }

  respawn() {
    this.tone(300, 0.2, 'sine', 0.2, 0, 900);
  }

  click() {
    this.tone(1200, 0.05, 'square', 0.06);
  }

  place() {
    this.tone(320, 0.08, 'triangle', 0.18, 0, 520);
  }

  erase() {
    this.tone(400, 0.08, 'triangle', 0.15, 0, 200);
  }

  error() {
    this.tone(160, 0.15, 'square', 0.12);
  }
}
