// Empreintes du comportement PAR DÉFAUT de la musique (menu « house » et course « chill » sans variante) : calculées une fois sur le code d'origine, puis comparées par test-musique.mjs.
//   node tools/baseline-audio.mjs     affiche les empreintes courantes
import { AudioEngine } from '../js/AudioEngine.js';
import { fakeContext, digest, seedRandom } from './fake-audio.mjs';

// Joue 12 s de musique : le séquenceur est piloté à la main (l'horloge du faux contexte avance par pas de 25 ms, comme la minuterie), la vitesse change en route.
export function defaultRun(mode, { speeds = [0, 0.3, 0.7, 1, 1.2] } = {}) {
  seedRandom(7);
  const ctx = fakeContext();
  const timers = [];
  const real = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  globalThis.setInterval = (fn) => { timers.push(fn); return timers.length; };
  globalThis.clearInterval = () => {};
  try {
    const e = new AudioEngine({ volume: 0.5 }).init(ctx);
    e.updateWithCarSpeed(speeds[0]);
    e.start(mode);
    for (let i = 0; i < 480; i++) {
      ctx.now = i * 0.025;
      if (i % 96 === 0) e.updateWithCarSpeed(speeds[Math.floor(i / 96) % speeds.length]);
      for (const fn of timers) fn();
    }
    e.stop();
    return { log: ctx.log, scheduled: e.stats.scheduled };
  } finally { globalThis.setInterval = real.setInterval; globalThis.clearInterval = real.clearInterval; }
}

if (process.argv[1] && process.argv[1].endsWith('baseline-audio.mjs')) {
  for (const m of ['house', 'chill']) { const r = defaultRun(m); console.log(m, r.log.length, r.scheduled, digest(r.log)); }
}
