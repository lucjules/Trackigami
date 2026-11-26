// Jeu des variantes musicales (musicVariants.js) : les voix, le budget et la mise au rebut des nœuds. Ces méthodes s'ajoutent au prototype d'AudioEngine (voir AudioEngine.js) ;
// `this` est le moteur. Rien de ce fichier ne tourne tant qu'aucune variante n'est demandée : le menu (« house ») et le chill d'origine passent par le code d'avant, inchangé.
//
// Légèreté et fuites :
//  - chaque voix est un petit groupe de sources jetables (oscillateurs, bruits) relié au bus par UN nœud de sortie ; le groupe est inscrit dans `_live` ;
//  - le budget (profil de qualité) borne le nombre de sources vivantes en même temps : kick et basse passent toujours, la mélodie, la nappe et les extras cèdent dans cet ordre ;
//  - à chaque pas, les groupes terminés sont détachés (`out.disconnect()`) ; à l'arrêt, les groupes encore sonnants sont raccourcis puis détachés (flush) : rien ne survit au changement de musique ;
//  - aucune minuterie ni aucun calcul tant que la musique est suspendue (onglet masqué : hold) ou coupée (volume nul : on n'ordonnance rien).
import { scaleNote, chordOffsets, STEPS } from './musicVariants.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const HEADROOM = [0, 2, 3, 5];            // sources laissées libres au-dessus de chaque priorité : 0 kick et basse (jusqu'au plafond), 1 mélodie et caisse claire (laissent de la place au kick), 2 nappe, 3 extras (hats, arpège)
const P_CORE = 0, P_LEAD = 1, P_PAD = 2, P_EXTRA = 3;
const hashId = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export const variantMethods = {
  // Au démarrage d'une variante : générateur déterministe (les départs dans le bruit ne sont pas tirés avec Math.random), compteurs remis à zéro.
  _vStart(v) {
    this._rnd = mulberry(hashId(v.id));
    this.stats.dropped = 0; this.stats.peak = 0; this.stats.scheduled = 0;
  },

  // ---- Registre des voix vivantes ---------------------------------------------------------------------------------------------
  _grp(t, end) { return { t0: t, end, srcs: [], out: null, dying: false }; },

  // Y a-t-il de la place pour n sources entre t et end ? Compte les sources des groupes qui sonnent encore à t. Le plafond du budget n'est JAMAIS dépassé (kick et basse compris).
  _take(n, t, end, prio) {
    let live = 0;
    for (const g of this._live) if (g.end > t) live += g.srcs.length;
    const cap = this.budget.voices;
    if (live + n > cap - HEADROOM[prio]) { this.stats.dropped++; return false; }
    if (live + n > this.stats.peak) this.stats.peak = live + n;
    return true;
  },

  _o(g, type, freq, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end);
    g.srcs.push(o);
    return o;
  },

  _nz(g, t, dur, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.connect(dest); s.start(t, this._rnd() * 0.5, dur); s.stop(t + dur + 0.02);
    g.srcs.push(s);
    return s;
  },

  _fin(g, out) { g.out = out; this._live.push(g); },

  _venv(g, t, a, peak, d) { this._env(g, t, a, Math.max(0.0002, peak), d); },

  // Détache les groupes terminés (appelé à chaque pas). Hors ligne (horloge à 0) rien n'est jamais terminé : le rendu d'un test n'est pas coupé.
  _reap() {
    const now = this.ctx.currentTime;
    const live = this._live;
    let j = 0;
    for (let i = 0; i < live.length; i++) {
      const g = live[i];
      if (g.end + 0.1 < now) { try { g.out.disconnect(); } catch { /* déjà détaché */ } } else live[j++] = g;
    }
    live.length = j;
  },

  // Arrêt de la musique : les groupes qui sonnent encore sont raccourcis (la sortie est déjà en fondu) et seront détachés par flush().
  _retire() {
    if (!this._live.length) return;
    const t = this.ctx.currentTime;
    for (const g of this._live) { g.dying = true; for (const s of g.srcs) { try { s.stop(Math.min(g.end + 0.05, t + 0.45)); } catch { /* source déjà finie */ } } }
    clearTimeout(this._flushT);
    this._flushT = setTimeout(() => this.flush(), 520);
  },

  // Détache TOUT ce qui a été retiré (ou, musique arrêtée, tout le reste). À appeler aussi à la main (tests, changement de contexte).
  flush() {
    clearTimeout(this._flushT); this._flushT = null;
    const keep = [];
    for (const g of this._live) {
      if (g.dying || !this.running) { for (const s of g.srcs) { try { s.stop(); } catch { /* déjà arrêtée */ } } try { g.out.disconnect(); } catch { /* déjà détaché */ } } else keep.push(g);
    }
    this._live = keep;
  },

  // Sources qui sonnent encore à l'instant t (par défaut l'instant présent de l'horloge audio).
  liveVoiceCount(t = this.ctx ? this.ctx.currentTime : 0) { let n = 0; for (const g of this._live) if (g.t0 <= t && g.end > t) n += g.srcs.length; return n; },

  // ---- Un pas de la variante ------------------------------------------------------------------------------------------------------
  _playVariant(step, t0) {
    const v = this.variant, s = this.speed, d = v.drums, det = this.budget.detail;
    this.stats.scheduled++;
    this._reap();
    if (this.volume < 0.0005) return;                                   // musique coupée (réglage de volume à zéro) : on avance sans rien programmer
    const dur = 60 / this.bpm / 4;
    const t = t0 + (step & 1 ? v.swing * dur : 0);
    const deg = v.prog[this._bar];
    const lvl = 0.8 + 0.2 * s;                                          // les percussions gagnent en présence avec la vitesse (l'énergie du kick et de la basse, grave, ne suffirait pas à faire entendre l'intensité)
    const rootMidi = v.root + scaleNote(v, deg);

    if (d.kick && d.kickAt.includes(step)) { this._vKick(d.kick, t, (step === 0 ? 1 : 0.8) * lvl); this._duck(t, v.duck); }
    for (const [st, off] of v.bass.at) if (st === step) this._vBass(v.bass, t, rootMidi + off, dur);
    if (det !== 'min' && d.snare && d.snareAt.includes(step)) this._vSnare(d.snare, t, (0.55 + 0.4 * s) * lvl);
    if (det !== 'min') for (const [st, minS] of d.hatAt) if (st === step && s >= minS && (det === 'full' || (step & 1) === 0)) this._vHat(d.hat, t, (0.35 + 0.4 * s) * lvl);
    if (step === 0 && v.pad.kind) this._vPad(v.pad, t, deg, dur * STEPS * 0.97, det);
    const motif = v.lead.motifs[this._bar % v.lead.motifs.length];
    for (const [st, off, minS] of motif) if (st === step && s >= minS) this._vLead(v.lead.kind, t, this._leadMidi(v, deg + off, v.lead.oct), (0.5 + 0.5 * s) * v.lead.gain, P_LEAD);
    if (this.boost && det === 'full' && (step & 1) === 0) this._vLead(v.lead.kind, t, this._leadMidi(v, deg + ((step >> 1) % 3) * 2, v.lead.oct + 1), 0.45 * v.lead.gain, P_EXTRA);   // couche de boost : arpège d'une octave plus haut
  },

  _leadMidi(v, degree, oct) {
    let m = v.root + 36 + 12 * oct + scaleNote(v, degree);
    while (m > 96) m -= 12;                                             // jamais au-delà de do7 (≈ 2,1 kHz)
    return m;
  },

  // ---- Percussions ---------------------------------------------------------------------------------------------------------------------
  _vKick(kind, t, vel) {
    const click = kind === 'kick' && this.budget.detail === 'full';          // le clic d'attaque (un bruit en plus) n'existe qu'en plein détail
    if (!this._take(click ? 2 : 1, t, t + 0.6, P_CORE)) return;
    const ctx = this.ctx, g = this._grp(t, t + 0.6), o = ctx.createOscillator(), og = ctx.createGain();
    const P = { kick: [165, 46, 0.09, 0.3, 1], soft: [120, 50, 0.07, 0.22, 0.8], tom: [200, 95, 0.12, 0.28, 0.9], sub: [100, 38, 0.14, 0.55, 1] }[kind];
    o.type = 'sine'; o.frequency.setValueAtTime(P[0], t); o.frequency.exponentialRampToValueAtTime(P[1], t + P[2]);
    this._venv(og, t, 0.003, vel * P[4], P[3]);
    o.connect(og); og.connect(this.drums); o.start(t); o.stop(t + P[3] + 0.06); g.srcs.push(o);
    if (click) {
      const c = ctx.createBufferSource(), cg = ctx.createGain();
      c.buffer = this.noise; this._venv(cg, t, 0.001, 0.35, 0.012);
      c.connect(cg); cg.connect(og); c.start(t, 0, 0.03); g.srcs.push(c);
    }
    this._fin(g, og);
  },

  _vSnare(kind, t, v) {
    const n = { clap: 3, rim: 2, snap: 2, block: 1, anvil: 3 }[kind];
    if (!this._take(n, t, t + 0.45, P_LEAD)) return;
    const ctx = this.ctx, g = this._grp(t, t + 0.45), out = ctx.createGain();
    out.connect(this.drums);
    const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(out); return b; };
    if (kind === 'clap') {
      for (let i = 0; i < 3; i++) { const e = ctx.createGain(), tt = t + i * 0.011; e.connect(filt('bandpass', 1500, 0.8)); this._venv(e, tt, 0.002, v * 0.45, i === 2 ? 0.16 : 0.012); this._nz(g, tt, 0.22, e); }
    } else if (kind === 'rim') {
      const e = ctx.createGain(); e.connect(filt('bandpass', 1900, 1.2)); this._venv(e, t, 0.001, v * 0.5, 0.03); this._nz(g, t, 0.06, e);
      const e2 = ctx.createGain(); e2.connect(out); this._venv(e2, t, 0.001, v * 0.3, 0.04); this._o(g, 'sine', 430, t, t + 0.1, e2);
    } else if (kind === 'snap') {
      const e = ctx.createGain(); e.connect(filt('highpass', 3200, 0.7)); this._venv(e, t, 0.001, v * 0.45, 0.07); this._nz(g, t, 0.12, e);
      const e2 = ctx.createGain(); e2.connect(out); this._venv(e2, t, 0.002, v * 0.3, 0.05); this._o(g, 'triangle', 210, t, t + 0.12, e2);
    } else if (kind === 'block') {
      const e = ctx.createGain(); e.connect(filt('lowpass', 2400, 0.7)); this._venv(e, t, 0.001, v * 0.4, 0.05); this._o(g, 'triangle', 900, t, t + 0.12, e);
    } else {
      const e = ctx.createGain(); e.connect(filt('bandpass', 2300, 5)); this._venv(e, t, 0.001, v * 0.5, 0.28); this._nz(g, t, 0.35, e);
      for (const [f, pk] of [[330, 0.3], [497, 0.2]]) { const e2 = ctx.createGain(); e2.connect(out); this._venv(e2, t, 0.001, v * pk, 0.25); this._o(g, 'sine', f, t, t + 0.35, e2); }
    }
    this._fin(g, out);
  },

  _vHat(kind, t, v) {
    if (!this._take(1, t, t + 0.3, P_EXTRA)) return;
    const ctx = this.ctx, g = this._grp(t, t + 0.3), e = ctx.createGain();
    e.connect(this.drums);
    if (kind === 'tick') { this._venv(e, t, 0.001, v * 0.22, 0.012); this._o(g, 'sine', 3200, t, t + 0.05, e); }
    else {
      const f = ctx.createBiquadFilter(); f.connect(e);
      if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 6500; this._venv(e, t, 0.001, v * 0.4, 0.04); }
      else if (kind === 'shaker') { f.type = 'bandpass'; f.frequency.value = 5500; f.Q.value = 0.9; this._venv(e, t, 0.01, v * 0.3, 0.07); }
      else { f.type = 'bandpass'; f.frequency.value = 7400; f.Q.value = 7; this._venv(e, t, 0.001, v * 0.5, 0.09); }
      this._nz(g, t, 0.14, f);
    }
    this._fin(g, e);
  },

  // ---- Basse ---------------------------------------------------------------------------------------------------------------------------
  _vBass(b, t, midi, stepDur) {
    const len = Math.min(1.6, b.len * stepDur), end = t + len + 0.1, kind = b.kind;
    const n = kind === 'pluck' ? 1 : 2;
    if (!this._take(n, t, end, P_CORE)) return;
    const ctx = this.ctx, g = this._grp(t, end), f = ctx.createBiquadFilter(), out = ctx.createGain();
    f.type = 'lowpass'; f.connect(out); out.connect(this.bassBus);
    const sp = this.speed;
    const add = (type, m, vol, det) => { const og = ctx.createGain(); og.gain.value = vol; og.connect(f); this._o(g, type, mtof(m), t, end, og, det); };
    if (kind === 'round') { f.Q.value = 1.5; f.frequency.value = 700; add('triangle', midi, 0.9); add('sine', midi - 12, 0.7); }
    else if (kind === 'sub') { f.Q.value = 0.7; f.frequency.value = 400; add('sine', midi, 1); add('sine', midi + 12, 0.15); }
    else if (kind === 'saw') { f.Q.value = 7; f.frequency.setValueAtTime(260 + 900 * (0.3 + sp), t); f.frequency.exponentialRampToValueAtTime(110, t + len); add('sawtooth', midi, 0.7); add('square', midi - 12, 0.5); }
    else if (kind === 'pulse') { f.Q.value = 3; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(400, t + len); add('square', midi, 0.6); add('square', midi, 0.4, 7); }
    else { f.Q.value = 2; f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(200, t + len); add('triangle', midi, 1); }
    this._venv(out, t, 0.005, 0.6 * b.gain, len);
    this._fin(g, out);
  },

  // ---- Nappe ---------------------------------------------------------------------------------------------------------------------------
  _vPad(p, t, deg, len, det) {
    const v = this.variant;
    let notes = chordOffsets(v, deg, 4);
    if (det === 'min') notes = [notes[0], notes[2]];
    const per = det === 'full' ? 2 : 1;                                 // deux oscillateurs par note en plein détail, un seul sinon
    const count = p.kind === 'drone' ? 3 : notes.length * per;
    if (!this._take(count, t, t + len + 0.1, P_PAD)) return;
    const ctx = this.ctx, g = this._grp(t, t + len + 0.1), f = ctx.createBiquadFilter(), out = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 0.7; f.connect(out); out.connect(this.synthBus);
    const base = v.root + 24, end = t + len + 0.05, k = p.gain * 0.085 * Math.sqrt(8 / Math.max(2, count));
    const att = p.kind === 'glass' || p.kind === 'air' ? 0.8 : 0.35;
    if (p.kind === 'saw') { f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1400, t + len * 0.6); }
    else if (p.kind === 'glass') { f.frequency.value = 5000; }
    else if (p.kind === 'drone') { f.frequency.value = 600; }
    else { f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(p.kind === 'air' ? 2600 : 1800, t + len * 0.6); }
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(Math.max(0.0002, k), t + att); out.gain.linearRampToValueAtTime(0.0001, t + len);
    if (p.kind === 'drone') {
      this._o(g, 'sine', mtof(v.root + 12 + scaleNote(v, deg)), t, end, f);
      this._o(g, 'triangle', mtof(v.root + 12 + scaleNote(v, deg) + 7), t, end, f);
      this._o(g, 'sine', mtof(v.root + 24 + scaleNote(v, deg)), t, end, f);
    } else for (const m of notes) {
      const fr = mtof(base + m);
      if (p.kind === 'soft') { this._o(g, 'triangle', fr, t, end, f, -9); if (per === 2) this._o(g, 'triangle', fr, t, end, f, 9); }
      else if (p.kind === 'saw') { this._o(g, 'sawtooth', fr, t, end, f, -7); if (per === 2) this._o(g, 'sawtooth', fr, t, end, f, 7); }
      else if (p.kind === 'glass') { this._o(g, 'sine', fr, t, end, f); if (per === 2) this._o(g, 'sine', fr * 2, t, end, f, 4); }
      else { this._o(g, 'triangle', fr, t, end, f, -14); if (per === 2) this._o(g, 'sine', fr, t, end, f, 14); }
    }
    this._fin(g, out);
  },

  // ---- Mélodie ---------------------------------------------------------------------------------------------------------------------
  _vLead(kind, t, midi, vel, prio) {
    const n = { pluck: 1, bell: 2, marimba: 2, steel: 2, saw: 1, pulse: 1, oud: 2, tick: 2, blip: 1, flute: 2 }[kind];
    const dec = { pluck: 0.5, bell: 1.0, marimba: 0.3, steel: 0.45, saw: 0.35, pulse: 0.25, oud: 0.4, tick: 0.4, blip: 0.16, flute: 0.5 }[kind];
    const end = t + dec + 0.15;
    if (!this._take(n, t, end, prio)) return;
    const ctx = this.ctx, g = this._grp(t, end), f = ctx.createBiquadFilter(), out = ctx.createGain(), fr = mtof(midi);
    f.type = 'lowpass'; f.Q.value = 0.7; f.frequency.value = 6000; f.connect(out); out.connect(this.synthBus);
    const peak = vel * 0.32;
    if (kind === 'pluck') { f.frequency.value = 2400; this._venv(out, t, 0.004, peak * 1.2, dec); this._o(g, 'sine', fr, t, end, f); }
    else if (kind === 'bell') {
      this._venv(out, t, 0.003, peak, dec);
      const c = this._o(g, 'sine', fr, t, end, f), m = ctx.createOscillator(), mg = ctx.createGain();
      m.type = 'sine'; m.frequency.value = fr * 3.5; mg.gain.setValueAtTime(fr * 1.6, t); mg.gain.exponentialRampToValueAtTime(fr * 0.02, t + dec);
      m.connect(mg); mg.connect(c.frequency); m.start(t); m.stop(end); g.srcs.push(m);
    }
    else if (kind === 'marimba') { this._venv(out, t, 0.002, peak, dec); this._o(g, 'triangle', fr, t, end, f); const h = ctx.createGain(); h.gain.value = 0.25; h.connect(f); this._o(g, 'sine', fr * 4, t, end, h); }
    else if (kind === 'steel') { this._venv(out, t, 0.002, peak, dec); this._o(g, 'sine', fr, t, end, f); const h = ctx.createGain(); h.gain.value = 0.5; h.connect(f); this._o(g, 'sine', fr * 2, t, end, h, 6); }
    else if (kind === 'saw') { f.Q.value = 3; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + dec); this._venv(out, t, 0.004, peak * 0.7, dec); this._o(g, 'sawtooth', fr, t, end, f); }
    else if (kind === 'pulse') { f.Q.value = 2; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(500, t + dec); this._venv(out, t, 0.003, peak * 0.6, dec); this._o(g, 'square', fr, t, end, f); }
    else if (kind === 'oud') { f.Q.value = 1.5; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(450, t + dec); this._venv(out, t, 0.003, peak, dec); this._o(g, 'triangle', fr, t, end, f); const h = ctx.createGain(); h.gain.value = 0.2; h.connect(f); this._o(g, 'sine', fr * 2, t, end, h); }
    else if (kind === 'tick') { this._venv(out, t, 0.002, peak * 0.8, dec); this._o(g, 'sine', fr, t, end, f); const h = ctx.createGain(); h.gain.value = 0.18; h.connect(f); this._o(g, 'sine', fr * 3, t, end, h); }
    else if (kind === 'blip') { this._venv(out, t, 0.004, peak, dec); const o = this._o(g, 'sine', fr * 0.8, t, end, f); o.frequency.setValueAtTime(fr * 0.8, t); o.frequency.exponentialRampToValueAtTime(fr * 1.25, t + 0.06); }
    else { out.gain.setValueAtTime(0.0002, t); out.gain.linearRampToValueAtTime(Math.max(0.0002, peak * 0.9), t + 0.04); out.gain.exponentialRampToValueAtTime(0.0002, t + dec); this._o(g, 'sine', fr, t, end, f); const h = ctx.createGain(); h.gain.value = 0.12; h.connect(f); this._o(g, 'sine', fr * 2, t, end, h); }
    this._fin(g, out);
  },
};
