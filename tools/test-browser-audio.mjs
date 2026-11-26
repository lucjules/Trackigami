// Audio dans un vrai navigateur (COMPLETE-006, COMPLETE-017) : node tools/test-browser-audio.mjs   (npm run test:browser)
//
// Rendu HORS LIGNE (OfflineAudioContext) dans Chromium : chaque variante de musique et chaque timbre de véhicule est rendu, puis mesuré (signal non nul, crête < 1, empreinte spectrale distincte,
// intensité qui croît avec la vitesse, aucune fuite de nœud sur 20 changements, menu et chill d'origine inchangés). Rien de tout cela ne dit si c'est BEAU : voir docs/ECOUTE-MUSIQUE.md.
//   AUDIO_CAPTURE=1 node tools/test-browser-audio.mjs   n'affiche que les mesures du comportement par défaut (utilisé une fois, sur le code d'AVANT, pour figer les références ci-dessous).
// Playwright n'est pas une dépendance du projet : sans lui (ou sans Chromium), le test est ignoré.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
const REQUIRED = !!(process.env.CI || process.env.REQUIRE_BROWSER);
const skip = (why) => { console.log((REQUIRED ? '  FAIL ' : '  skip ') + why + (REQUIRED ? ' : le test navigateur est OBLIGATOIRE ici (CI / REQUIRE_BROWSER)' : ' : test navigateur ignoré')); process.exit(REQUIRED ? 1 : 0); };
try { ({ chromium } = require('playwright')); } catch { skip('playwright introuvable'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
let browser;
try { browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] }); }
catch (e) { server.kill(); skip('Chromium introuvable (' + String(e.message).split('\n')[0] + ')'); }

let failures = 0;
const errors = [];
const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
async function test(name, fn) {
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('erreurs de la page : ' + errors.slice(before).join(' | ')); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); }
}
const log = (...a) => console.log('       ' + a.join(' '));

// ---- Bibliothèque de mesure, injectée dans la page ---------------------------------------------------------------------------------------------------------------
function lib() {
  const SR = 22050;
  const fft = (re, im) => {                                   // FFT itérative (taille puissance de 2), en place
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  };
  // Mesures d'un signal : crête, RMS, centroïde spectral (Hz), empreinte (24 bandes log de 60 Hz à 9,5 kHz, en dB, centrées), sur [from, to[ secondes.
  const measure = (x, from, to) => {
    const a = Math.floor(from * SR), b = Math.min(x.length, Math.floor(to * SR));
    let peak = 0, s2 = 0;
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    for (let i = a; i < b; i++) s2 += x[i] * x[i];
    const rms = Math.sqrt(s2 / Math.max(1, b - a));
    const N = 2048, P = new Float64Array(N / 2), win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    let frames = 0;
    for (let s = a; s + N <= b; s += N) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
      fft(re, im);
      for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
      frames++;
    }
    const hz = (k) => k * SR / N;
    let num = 0, den = 0;
    for (let k = 1; k < N / 2; k++) { num += hz(k) * P[k]; den += P[k]; }
    const edges = Array.from({ length: 25 }, (_, i) => 60 * Math.pow(9500 / 60, i / 24));
    const bands = [];
    for (let i = 0; i < 24; i++) { let e = 0; for (let k = 1; k < N / 2; k++) if (hz(k) >= edges[i] && hz(k) < edges[i + 1]) e += P[k]; bands.push(10 * Math.log10(e / Math.max(1, frames) + 1e-12)); }
    const mean = bands.reduce((u, v) => u + v, 0) / bands.length;
    let hf = 0; for (let k = 1; k < N / 2; k++) if (hz(k) >= 1000) hf += P[k];
    return { peak, rms, centroid: den ? num / den : 0, fp: bands.map((v) => v - mean), frames, hf: Math.sqrt(hf / Math.max(1, frames)) / N };
  };
  const dist = (p, q) => Math.sqrt(p.reduce((u, v, i) => u + (v - q[i]) ** 2, 0) / p.length);
  // Programme les pas d'un moteur jusqu'à `until` (code d'avant : boucle recopiée ; code d'après : _advance).
  const advance = (e, until) => {
    if (e._advance) return e._advance(until);
    while (e._next < until) { e._play(e._step, e._next); e._next += 60 / e.bpm / 4; if (++e._step >= 16) { e._step = 0; e._bar = (e._bar + 1) % 4; } }
  };
  const seed = (n) => { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // Rend `seconds` secondes de musique : mode 'house' | 'chill', variante (ou null), vitesse, budget.
  const music = async (mod, { mode = 'chill', variant = null, speed = 0.6, seconds = 8, budget, volume = 0.7, boostSpeed } = {}) => {
    seed(11);
    const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
    ctx.resume = () => Promise.resolve();
    const e = new mod.AudioEngine(variant ? { volume, seed: 5 } : { volume });          // (sans variante : le bruit vient de Math.random figé, comme avant)
    e.init(ctx);
    if (budget && e.setBudget) e.setBudget(budget);
    e.updateWithCarSpeed(boostSpeed ?? speed);
    if (e.hold) e.hold(true);                                 // pas de minuterie : le séquenceur est piloté à la main
    e.start(mode, variant);
    clearInterval(e._timer);
    advance(e, seconds + 0.3);
    const buf = await ctx.startRendering();
    return { x: buf.getChannelData(0), e, ctx };
  };
  // Graphe réel : liaisons suivies pour compter ce qui est relié (de proche en proche) à la sortie.
  const watch = () => {
    const edges = new Map(), oc = AudioNode.prototype.connect, od = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (dst, ...r) { if (dst instanceof AudioNode) { if (!edges.has(this)) edges.set(this, new Set()); edges.get(this).add(dst); } return oc.call(this, dst, ...r); };
    AudioNode.prototype.disconnect = function (dst, ...r) { if (dst === undefined) edges.delete(this); else if (dst instanceof AudioNode && edges.has(this)) edges.get(this).delete(dst); return od.call(this, ...(dst === undefined ? [] : [dst, ...r])); };
    const reachable = (ctx) => {
      const back = new Map();
      for (const [a, set] of edges) for (const b of set) { if (!back.has(b)) back.set(b, new Set()); back.get(b).add(a); }
      const seen = new Set(), st = [ctx.destination];
      while (st.length) { const n = st.pop(); if (seen.has(n)) continue; seen.add(n); for (const a of back.get(n) || []) st.push(a); }
      return seen.size;
    };
    return { reachable, stop: () => { AudioNode.prototype.connect = oc; AudioNode.prototype.disconnect = od; } };
  };
  // Rend `seconds` secondes du moteur d'un véhicule ; steps = [[t, état]] : l'état est posé à chaque image de 50 ms (comme la boucle de rendu).
  const engine = async (GameAudio, seconds, stateAt) => {
    seed(21);
    const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
    window.AudioContext = function () { return ctx; };
    const a = new GameAudio();
    a.unlock();
    const step = 0.05;
    const jobs = [];
    for (let t = step; t < seconds - 0.1; t += step) jobs.push(ctx.suspend(t).then(() => { a.engine(stateAt(t)); ctx.resume(); }));
    a.engine(stateAt(0));
    const done = ctx.startRendering();
    await Promise.all(jobs);
    const buf = await done;
    return { x: buf.getChannelData(0), a };
  };
  // Part de l'énergie 5-200 Hz du carré du signal (moyenne retirée) qui tombe à ± 2 Hz de `hz` : la raie d'une modulation d'amplitude à cette fréquence.
  const amLine = (x, from, to, hz) => {
    const N = 1 << 16, a = Math.floor(from * SR), re = new Float64Array(N), im = new Float64Array(N);
    let m = 0; for (let i = 0; i < N; i++) { const v = x[a + i] || 0; re[i] = v * v; m += re[i]; } m /= N;
    for (let i = 0; i < N; i++) re[i] = (re[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    fft(re, im);
    let tot = 0, line = 0; for (let k = 1; k < N / 2; k++) { const f = k * SR / N, p = re[k] * re[k] + im[k] * im[k]; if (f >= 5 && f <= 200) { tot += p; if (Math.abs(f - hz) <= 2) line += p; } }
    return tot ? line / tot : 0;
  };
  window.__A = { SR, measure, dist, music, watch, engine, seed, amLine };
}

// Valeurs de référence : mesures du menu (« house ») et du chill d'origine sur 8 s à vitesse 0,6, prises sur le code d'AVANT ce travail (AUDIO_CAPTURE=1, mêmes graines).
const REF = {"house": {"rms": 0.09174563442653401, "centroid": 163.49298343718337, "fp": [8.98, 14.71, 17.5, 21.39, 20.87, 11.51, 8.79, 5.98, 3.17, 4.93, 4.78, 4.05, 5.31, 2.52, 0.21, -0.64, -0.86, -2.46, -6.65, -12.75, -17.96, -25.25, -28.44, -39.69]}, "chill": {"rms": 0.054584487692963625, "centroid": 195.05685697966553, "fp": [12.03, 16.9, 20.37, 23.07, 20.56, 9.25, 12.27, 15.65, 15.67, 16.2, 17.07, 6.13, -1.72, 4.1, -2.46, -3.21, -11.23, -11.36, -12.61, -20.29, -21.3, -28.49, -30.64, -45.94]}};

const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 }, serviceWorkers: 'block' })).newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/legal.html`, { waitUntil: 'load' });
await page.evaluate(lib);

if (process.env.AUDIO_CAPTURE) {
  const out = await page.evaluate(async () => {
    const A = window.__A, mod = await import('/js/AudioEngine.js'), res = {};
    for (const m of ['house', 'chill']) { const { x } = await A.music(mod, { mode: m, speed: 0.6, seconds: 8 }); const f = A.measure(x, 2, 8); res[m] = { rms: f.rms, centroid: f.centroid, peak: f.peak, fp: f.fp }; }
    return res;
  });
  console.log(JSON.stringify(out));
  await browser.close(); server.kill(); process.exit(0);
}

const FEAT = {};         // mesures de chaque variante (rapport)

console.log('Musique : douze variantes rendues hors ligne');
await test('chaque variante produit un signal non nul, sans écrêtage (crête < 1, au volume maximal du réglage), de 8 s, sans valeur non finie', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, mod = await import('/js/AudioEngine.js'), V = await import('/js/musicVariants.js'), out = {};
    for (const id of V.VARIANT_IDS) {
      const { x } = await A.music(mod, { variant: V.VARIANTS[id], speed: 0.6, seconds: 8 });
      const f = A.measure(x, 2, 8);
      let bad = 0; for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) bad++;
      const boost = A.measure((await A.music(mod, { variant: V.VARIANTS[id], speed: 1.2, boostSpeed: 1.2, seconds: 8 })).x, 2, 8);
      out[id] = { rms: f.rms, peak: f.peak, centroid: f.centroid, fp: f.fp, bad, boostPeak: boost.peak, boostRms: boost.rms, len: x.length };
    }
    return out;
  });
  Object.assign(FEAT, r);
  for (const [id, f] of Object.entries(r)) {
    assert.equal(f.bad, 0, id + ' : valeurs non finies');
    assert.ok(f.rms > 0.005, `${id} : signal quasi nul (rms ${f.rms})`);
    assert.ok(f.peak < 1, `${id} : crête ${f.peak} ≥ 1`);
    assert.ok(f.boostPeak < 1 && f.boostRms > 0.005, `${id} : boost, crête ${f.boostPeak}`);
    assert.equal(f.len, 22050 * 8);
  }
  log('variante   rms     crête   centroïde(Hz)  [vitesse 0,6]   crête au boost');
  for (const [id, f] of Object.entries(r)) log(id.padEnd(9), f.rms.toFixed(4), f.peak.toFixed(3), String(Math.round(f.centroid)).padStart(6), '                ', f.boostPeak.toFixed(3));
});

await test('les douze variantes sont mesurablement distinctes : l\'empreinte spectrale de chaque paire diffère (distance en dB) et le centroïde aussi', async () => {
  const ids = Object.keys(FEAT);
  assert.equal(ids.length, 12);
  const d = await page.evaluate((fps) => { const A = window.__A, out = []; const ids = Object.keys(fps); for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j], A.dist(fps[ids[i]], fps[ids[j]])]); return out; }, Object.fromEntries(ids.map((i) => [i, FEAT[i].fp])));
  d.sort((p, q) => p[2] - q[2]);
  log('paires les plus proches :', d.slice(0, 3).map(([a, b, v]) => `${a}/${b} ${v.toFixed(2)} dB`).join(' ; '));
  log('distance moyenne :', (d.reduce((u, v) => u + v[2], 0) / d.length).toFixed(2), 'dB ; plus grande :', d[d.length - 1].slice(0, 2).join('/'), d[d.length - 1][2].toFixed(2));
  for (const [a, b, v] of d) assert.ok(v > 1.0, `${a} et ${b} : empreintes trop proches (${v.toFixed(2)} dB)`);
  const cs = ids.map((i) => FEAT[i].centroid).sort((p, q) => p - q);
  assert.ok(cs[cs.length - 1] / cs[0] > 1.5, 'les centroïdes spectraux ne se recouvrent pas tous : ' + cs.map(Math.round).join(', '));
});

await test('un même décor rendu deux fois donne le même signal (la sélection et le rendu sont déterministes)', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, mod = await import('/js/AudioEngine.js'), V = await import('/js/musicVariants.js');
    const a = (await A.music(mod, { variant: V.VARIANTS.city, seconds: 4 })).x, b = (await A.music(mod, { variant: V.VARIANTS.city, seconds: 4 })).x;
    let diff = 0; for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    return diff;
  });
  assert.ok(r < 1e-6, 'écart maximal ' + r);
});

await test('l\'intensité croît avec la vitesse : énergie des hautes fréquences et brillance (centroïde) montent de 0,1 à 0,5 à 1,0 pour CHAQUE variante, sans que le niveau global baisse', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, mod = await import('/js/AudioEngine.js'), V = await import('/js/musicVariants.js'), out = {};
    for (const id of V.VARIANT_IDS) {
      out[id] = [];
      for (const speed of [0.1, 0.5, 1.0]) { const f = A.measure((await A.music(mod, { variant: V.VARIANTS[id], speed, seconds: 10 })).x, 4, 10); out[id].push({ speed, rms: f.rms, centroid: f.centroid, peak: f.peak, hf: f.hf }); }
    }
    return out;
  });
  log('variante   rms(0,1) rms(0,5) rms(1,0)   hautes>1kHz(0,1) (0,5) (1,0)   centroïde(0,1) (0,5) (1,0)');
  for (const [id, v] of Object.entries(r)) {
    log(id.padEnd(9), v.map((f) => f.rms.toFixed(4)).join(' '), '  ', v.map((f) => f.hf.toFixed(5)).join(' '), '  ', v.map((f) => String(Math.round(f.centroid)).padStart(5)).join(' '));
    // Le niveau global est porté par le grave (kick, basse), presque constant : l'intensité se lit dans les hautes fréquences (filtre qui s'ouvre, mélodie, hats) et la brillance ; le niveau global ne doit pas baisser.
    assert.ok(v[0].hf < v[1].hf && v[1].hf < v[2].hf, `${id} : l'énergie au-dessus de 1 kHz ne croît pas avec la vitesse (${v.map((f) => f.hf.toFixed(5))})`);
    assert.ok(v[2].rms > v[0].rms && v[1].rms > v[0].rms * 0.9, `${id} : le niveau global baisse avec la vitesse (${v.map((f) => f.rms.toFixed(4))})`);
    assert.ok(v[0].centroid < v[1].centroid && v[1].centroid < v[2].centroid, `${id} : la brillance ne croît pas avec la vitesse (${v.map((f) => Math.round(f.centroid))})`);
    for (const f of v) assert.ok(f.peak < 1, `${id} crête ${f.peak}`);
  }
});

await test('profils de qualité : Potato et Ultra Potato rendent un signal non nul, sans écrêtage, plus léger (moins d\'énergie haute) que Haute', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, mod = await import('/js/AudioEngine.js'), V = await import('/js/musicVariants.js'), Q = await import('/js/quality.js'), out = {};
    for (const id of V.VARIANT_IDS) {
      out[id] = {};
      for (const name of ['high', 'potato', 'ultrapotato']) { const { x, e } = await A.music(mod, { variant: V.VARIANTS[id], speed: 1.1, boostSpeed: 1.1, seconds: 8, budget: Q.PROFILES[name].audio }); const f = A.measure(x, 2, 8); out[id][name] = { rms: f.rms, peak: f.peak, peakVoices: e.stats.peak, dropped: e.stats.dropped }; }
    }
    return out;
  });
  let dropped = { high: 0, potato: 0, ultrapotato: 0 };
  for (const [id, v] of Object.entries(r)) for (const [name, f] of Object.entries(v)) {
    assert.ok(f.rms > 0.003 && f.peak < 1, `${id} ${name} : rms ${f.rms} crête ${f.peak}`);
    dropped[name] += f.dropped;
  }
  const maxV = (n) => Math.max(...Object.values(r).map((v) => v[n].peakVoices));
  log('voix simultanées au plus (douze variantes, vitesse 1,1 avec boost) : haute', maxV('high'), '; potato', maxV('potato'), '; ultra potato', maxV('ultrapotato'), '(plafonds 30 / 12 / 8)');
  log('notes abandonnées faute de budget : haute', dropped.high, '; potato', dropped.potato, '; ultra potato', dropped.ultrapotato);
  assert.ok(maxV('high') <= 30 && maxV('potato') <= 12 && maxV('ultrapotato') <= 8);
  assert.ok(maxV('potato') < maxV('high') && maxV('ultrapotato') < maxV('potato'));
});

await test('la musique de menu (« house ») et le chill d\'origine sont inchangés : même niveau et même centroïde que ceux mesurés avant ce travail', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, mod = await import('/js/AudioEngine.js'), out = {};
    for (const m of ['house', 'chill']) { const { x } = await A.music(mod, { mode: m, speed: 0.6, seconds: 8 }); const f = A.measure(x, 2, 8); out[m] = { rms: f.rms, centroid: f.centroid, peak: f.peak, fp: f.fp }; }
    return out;
  });
  for (const m of ['house', 'chill']) {
    log(m.padEnd(6), 'rms', r[m].rms.toFixed(5), 'centroïde', Math.round(r[m].centroid), 'crête', r[m].peak.toFixed(3));
    assert.ok(r[m].peak < 1 && r[m].rms > 0.005, m);
    assert.ok(Math.abs(r[m].rms / REF[m].rms - 1) < 0.01, `${m} : niveau ${r[m].rms} ≠ référence ${REF[m].rms}`);
    assert.ok(Math.abs(r[m].centroid / REF[m].centroid - 1) < 0.01, `${m} : centroïde ${r[m].centroid} ≠ référence ${REF[m].centroid}`);
    const dmax = Math.max(...r[m].fp.map((v, i) => Math.abs(v - REF[m].fp[i])));
    assert.ok(dmax < 0.5, `${m} : empreinte spectrale écartée de ${dmax.toFixed(2)} dB de la référence`);
  }
});

console.log('Musique : fuites, onglet masqué');
await test('20 changements de décor de suite : le nombre de nœuds reliés à la sortie est stable (graphe réel, arrêt puis départ)', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, mod = await import('/js/AudioEngine.js'), V = await import('/js/musicVariants.js');
    const w = A.watch();
    try {
      A.seed(3);
      const ctx = new OfflineAudioContext(1, 22050 * 2, 22050); ctx.resume = () => Promise.resolve();
      const e = new mod.AudioEngine({ volume: 0.5, seed: 1 }); e.init(ctx); e.hold(true);
      const fixed = w.reachable(ctx), sizes = [], lives = [];
      for (let k = 0; k < 20; k++) {
        e.updateWithCarSpeed(0.4 + (k % 3) * 0.35);
        e.start('chill', V.VARIANTS[V.VARIANT_IDS[k % 12]]);
        e._advance(e._next + 3);                            // trois secondes de pas programmés
        const during = w.reachable(ctx);
        e.stop(); e.flush();
        sizes.push(w.reachable(ctx)); lives.push(e._live.length + (during > fixed ? 0 : 1000));
      }
      return { fixed, sizes, lives };
    } finally { w.stop(); }
  });
  assert.ok(r.sizes.every((s) => s === r.fixed), `nœuds reliés après chaque changement : ${[...new Set(r.sizes)]} (graphe fixe : ${r.fixed})`);
  assert.ok(r.lives.every((n) => n === 0), 'registre vidé et des voix bien présentes en cours de morceau');
  log('graphe fixe :', r.fixed, 'nœuds ; après chacun des 20 changements :', [...new Set(r.sizes)].join(','));
});

await test('dans l\'application : chaque décor joue sa variante, le menu n\'en a pas, onglet masqué le séquenceur s\'arrête et ne réveille rien, au retour il repart', async () => {
  const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })).newPage();
  p2.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p2.on('console', (m) => { if (m.type() === 'error' && !OFFLINE.test(m.text() + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  await p2.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await p2.waitForSelector('#wl-name', { state: 'visible', timeout: 20000 });
  await p2.locator('#wl-name').fill('Testeur'); await p2.locator('#wl-submit').evaluate((el) => el.click());
  await p2.waitForFunction(() => window.copytrack && window.copytrack.mode === 'menu', null, { timeout: 30000 });
  await p2.mouse.click(300, 300);                                                    // un geste : l'AudioContext est débloqué
  await p2.waitForFunction(() => window.copytrack.audio.ctx, null, { timeout: 5000 });
  const r = await p2.evaluate(async () => {
    const app = window.copytrack, out = { decors: {} };
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(600);
    out.menu = { kind: app.audio.music.kind, mode: app.audio.music.synth && app.audio.music.synth.mode, variant: app.audio.music.synth && app.audio.music.synth.variant && app.audio.music.synth.variant.id };
    for (const d of ['desert', 'polar', 'factory', 'atelier']) {
      const b = app.builtins.find((x) => x.def.decor === d);
      app.playBuiltin(app.builtins.indexOf(b));
      await wait(1200);
      const m = app.audio.music;
      out.decors[d] = { decor: app.session.track.decor, kind: m.kind, variant: m.synth.variant && m.synth.variant.id, mode: m.synth.mode, running: m.synth.running, scheduled: m.synth.stats.scheduled, state: app.audio.ctx.state };
    }
    // onglet masqué
    const m = app.audio.music;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    app._onVisibility(); await wait(100);
    out.hidden = { held: m.synth._held, timer: m.synth._timer !== null, ctx: app.audio.ctx.state };
    const s0 = m.synth.stats.scheduled; await wait(400); out.hidden.advanced = m.synth.stats.scheduled - s0;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    app._onVisibility(); await wait(500);
    out.visible = { held: m.synth._held, timer: m.synth._timer !== null, ctx: app.audio.ctx.state, advanced: m.synth.stats.scheduled - s0 };
    app.showMenu && app.showMenu();
    await wait(1200);
    out.back = { kind: app.audio.music.kind, mode: app.audio.music.synth.mode, variant: app.audio.music.synth.variant && app.audio.music.synth.variant.id };
    return out;
  });
  assert.deepEqual(r.menu, { kind: 'menu', mode: 'house', variant: null });
  for (const d of ['desert', 'polar', 'factory', 'atelier']) {
    assert.equal(r.decors[d].decor, d); assert.equal(r.decors[d].variant, d, JSON.stringify(r.decors[d])); assert.equal(r.decors[d].mode, 'chill'); assert.ok(r.decors[d].running);
  }
  assert.equal(r.hidden.held, true); assert.equal(r.hidden.timer, false, 'minuterie arrêtée'); assert.equal(r.hidden.advanced, 0, 'aucun pas programmé onglet masqué'); assert.equal(r.hidden.ctx, 'suspended');
  assert.equal(r.visible.held, false); assert.equal(r.visible.timer, true); assert.equal(r.visible.ctx, 'running'); assert.ok(r.visible.advanced > 0, 'la musique repart');
  assert.deepEqual(r.back, { kind: 'menu', mode: 'house', variant: null });
  await p2.context().close();
});

console.log('Sons de véhicule : rendus hors ligne');
await test('chaque timbre (voiture, moto, bateau, deltaplane) produit un signal non nul, sans écrêtage, et les quatre empreintes spectrales sont distinctes', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, { GameAudio } = await import('/js/audio.js'), out = {};
    for (const veh of ['car', 'moto', 'boat', 'glider']) {
      const { x } = await A.engine(GameAudio, 5, () => ({ vehicle: veh, speed: 40, throttle: true, slip: 0, boost: false, draft: 0 }));
      const f = A.measure(x, 2, 5);
      let bad = 0; for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) bad++;
      out[veh] = { rms: f.rms, peak: f.peak, centroid: f.centroid, fp: f.fp, bad };
    }
    const names = Object.keys(out), dist = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) dist.push([names[i], names[j], A.dist(out[names[i]].fp, out[names[j]].fp)]);
    return { out, dist };
  });
  log('véhicule   rms     crête   centroïde(Hz)  [40 m/s, gaz]');
  for (const [v, f] of Object.entries(r.out)) { log(v.padEnd(9), f.rms.toFixed(4), f.peak.toFixed(3), String(Math.round(f.centroid)).padStart(6)); assert.equal(f.bad, 0); assert.ok(f.rms > 0.003, v + ' : signal quasi nul'); assert.ok(f.peak < 1, v + ' : crête ' + f.peak); }
  log('distances spectrales :', r.dist.map(([a, b, d]) => `${a}/${b} ${d.toFixed(1)} dB`).join(' ; '));
  for (const [a, b, d] of r.dist) assert.ok(d > 3, `${a} et ${b} : timbres trop proches (${d.toFixed(2)} dB)`);
});

await test('le sillage et le clapot du bateau, le souffle du deltaplane et la modulation de la moto sont bien dans le signal (et croissent avec la vitesse pour les deux premiers)', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, { GameAudio } = await import('/js/audio.js'), out = {};
    const run = async (veh, speed, throttle = false) => A.measure((await A.engine(GameAudio, 5, () => ({ vehicle: veh, speed, throttle, slip: 0, boost: false, draft: 0 }))).x, 2, 5);
    out.boat = [await run('boat', 2), await run('boat', 25), await run('boat', 60)];
    out.glider = [await run('glider', 2), await run('glider', 25), await run('glider', 60)];
    out.carIdle = await run('car', 0); out.boatIdle = await run('boat', 0);
    // moto : modulation d'amplitude. Le carré du signal porte une raie à la fréquence de modulation (moteur au ralenti : 1 m/s) ; on compare sa part dans l'énergie 5-200 Hz à celle de la voiture au même endroit.
    const V = await import('/js/vehicleSound.js'), st = { speed: 1, throttle: false, slip: 0, boost: false, draft: 0 };
    const fam = V.engineTargets('moto', st).amHz;
    const line = async (veh) => { const x = (await A.engine(GameAudio, 6, () => ({ vehicle: veh, ...st }))).x; return A.amLine(x, 2, 6, fam); };
    out.mod = { car: await line('car'), moto: await line('moto'), fam };
    return out;
  });
  log('bateau  rms à 2/25/60 m/s :', r.boat.map((f) => f.rms.toFixed(4)).join(' / '), '; centroïde', r.boat.map((f) => Math.round(f.centroid)).join(' / '));
  log('deltaplane rms à 2/25/60 m/s :', r.glider.map((f) => f.rms.toFixed(4)).join(' / '), '; centroïde', r.glider.map((f) => Math.round(f.centroid)).join(' / '));
  log('bateau à l\'arrêt (clapot seul) rms', r.boatIdle.rms.toFixed(4), 'contre voiture au point mort', r.carIdle.rms.toFixed(4), '; part de la raie de modulation à', r.mod.fam.toFixed(1), 'Hz : voiture', r.mod.car.toFixed(4), 'moto', r.mod.moto.toFixed(4));
  assert.ok(r.boat[0].rms < r.boat[1].rms && r.boat[1].rms < r.boat[2].rms, 'sillage : le niveau monte avec la vitesse');
  assert.ok(r.glider[0].rms < r.glider[1].rms && r.glider[1].rms < r.glider[2].rms, 'souffle : le niveau monte avec la vitesse');
  assert.ok(r.glider[0].centroid < r.glider[2].centroid, 'le souffle devient plus aigu');
  assert.ok(r.boatIdle.rms > 0.002, 'le clapot se fait entendre à l\'arrêt');
  assert.ok(r.mod.moto > r.mod.car * 3 && r.mod.moto > 0.02, 'la moto est modulée en amplitude, pas la voiture');
});

await test('transformation en course (voiture → moto → bateau → deltaplane → voiture) : passage en douceur, aucun clic, aucun silence prolongé, aucune crête', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, { GameAudio } = await import('/js/audio.js');
    const order = ['car', 'moto', 'boat', 'glider', 'car'];
    const veh = (t) => order[Math.min(4, Math.floor(t / 2))];
    const { x } = await A.engine(GameAudio, 10, (t) => ({ vehicle: veh(t), speed: 40, throttle: true, slip: 0, boost: false, draft: 0 }));
    const sr = A.SR, w = Math.round(0.01 * sr);
    const env = []; for (let i = 0; i + w < x.length; i += w) { let s = 0; for (let k = 0; k < w; k++) s += x[i + k] * x[i + k]; env.push(Math.sqrt(s / w)); }
    // sauts d'amplitude : comparés à ce que fait déjà un moteur sans changement (réf. : les 2 premières secondes) ; on isole les 0,4 s qui suivent chaque transformation
    const jump = (a, b) => { let m = 0; for (let i = Math.floor(a * sr) + 1; i < Math.floor(b * sr); i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };
    const steady = jump(1, 1.9);
    const at = [2, 4, 6, 8].map((t) => ({ t, jump: jump(t - 0.05, t + 0.45), min: Math.min(...env.slice(Math.floor(t * 100), Math.floor((t + 0.5) * 100))), before: env.slice(Math.floor((t - 0.5) * 100), Math.floor(t * 100)).reduce((u, v) => u + v, 0) / 50 }));
    let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    // plus long silence (enveloppe < 5 % de la médiane) en dehors du plongeon attendu
    const med = [...env].sort((p, q) => p - q)[Math.floor(env.length / 2)];
    let run = 0, longest = 0; for (const v of env.slice(10)) { if (v < med * 0.05) { run++; longest = Math.max(longest, run); } else run = 0; }
    return { steady, at, peak, med, longest };
  });
  log('saut max hors transformation', r.steady.toFixed(4), '; pendant : ', r.at.map((a) => `t=${a.t}s ${a.jump.toFixed(4)} (creux ${(a.min / a.before).toFixed(2)}×)`).join(' ; '), '; plus long silence', r.longest * 10, 'ms');
  assert.ok(r.peak < 1);
  for (const a of r.at) assert.ok(a.jump < Math.max(0.25, r.steady * 3), `clic à t=${a.t} s : saut ${a.jump}`);
  assert.ok(r.longest <= 12, 'silence prolongé : ' + r.longest * 10 + ' ms');
  for (const a of r.at) assert.ok(a.min < a.before, 'le moteur plonge puis revient : fondu et non coupure');
});

await test('20 changements de véhicule de suite : GameAudio ne crée aucun nœud (le nombre de nœuds reliés à la sortie ne bouge pas)', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__A, { GameAudio } = await import('/js/audio.js'), w = A.watch();
    try {
      const ctx = new OfflineAudioContext(1, 22050, 22050); window.AudioContext = function () { return ctx; };
      const a = new GameAudio(); a.unlock();
      const fixed = w.reachable(ctx); const sizes = [];
      for (let k = 0; k < 20; k++) { for (let i = 0; i < 30; i++) a.engine({ vehicle: ['car', 'moto', 'boat', 'glider'][(k + (i >> 3)) % 4], speed: 10 + i, throttle: true, slip: 0, boost: false }); sizes.push(w.reachable(ctx)); }
      return { fixed, sizes };
    } finally { w.stop(); }
  });
  assert.ok(r.sizes.every((s) => s === r.fixed), `${r.fixed} → ${[...new Set(r.sizes)]}`);
  log('nœuds reliés à la sortie :', r.fixed, '(stable sur 20 changements)');
});

await test('aucun fichier audio n\'est chargé : aucune requête vers un .mp3/.ogg/.wav/.m4a pendant tout le test', async () => {
  const hits = [];
  const p3 = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  p3.on('request', (q) => { if (/\.(mp3|ogg|wav|m4a|flac|aac|opus)(\?|$)/i.test(q.url())) hits.push(q.url()); });
  await p3.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await p3.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await p3.waitForTimeout(1500);
  await p3.context().close();
  assert.deepEqual(hits, []);
});

await browser.close();
server.kill();
console.log(failures ? `\n${failures} test(s) en échec` : '\nTous les tests audio du navigateur passent.');
process.exit(failures ? 1 : 0);
