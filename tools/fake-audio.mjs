// Faux AudioContext pour les tests Node de l'audio (musique : AudioEngine.js, music.js ; effets : audio.js). Aucun son n'est produit : le faux contexte ENREGISTRE chaque appel
// (création d'un nœud, réglage d'un paramètre, connexion, démarrage, arrêt) et sait compter ce qui est encore relié à la sortie.
//
//   const ctx = fakeContext();            ctx.log : les appels, une ligne chacun (dans l'ordre) ;  ctx.now = 1.25 : l'horloge avance à la main
//   digest(ctx.log)                       empreinte SHA-1 du journal : « rien n'a changé » se démontre en comparant deux empreintes
//   ctx.reachable()                       nœuds encore reliés (de proche en proche) à ctx.destination : ce que le fil audio calculerait
//   seedRandom(1)                         Math.random déterministe (le bruit partagé et les départs des claps en dépendent)
import { createHash } from 'node:crypto';

export function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const num = (x) => (typeof x === 'number' ? String(+x.toPrecision(10)) : String(x));

export function fakeContext({ sampleRate = 44100, record = true } = {}) {
  const log = [];                         // record: false : pas de journal (les gros balayages de test n'en ont pas besoin ; il coûte cher)
  const nodes = [];                       // tous les nœuds créés
  const edges = new Map();                // nœud -> Set des nœuds vers lesquels il est relié
  let nextId = 0;
  const L = record ? (x) => log.push(x) : () => {};
  const ctx = { log, nodes, sampleRate, now: 0, state: 'running', _resumed: 0, _suspended: 0 };
  Object.defineProperty(ctx, 'currentTime', { get() { return ctx.now; } });

  const param = (owner, name, init = 0) => {
    const p = { value: init, name: owner + '.' + name };
    const rec = (m) => (...a) => { record && L(`${p.name}.${m}(${a.map(num).join(',')})`); if (m === 'setValueAtTime' || m === 'setTargetAtTime') p.last = a[0]; return p; };
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) p[m] = rec(m);
    let v = init;
    Object.defineProperty(p, 'value', { get: () => v, set: (x) => { v = x; p.last = x; record && L(`${p.name}=${num(x)}`); } });
    p.connect = (dst) => { record && L(`${p.name}.connect`); return dst; };
    return p;
  };

  const make = (kind, params = {}, extra = {}) => {
    const id = kind + '#' + nextId++;
    const n = { id, kind, ended: false };
    n.raw = n;                                      // (les nœuds sont rendus par un Proxy : `raw` redonne l'objet d'origine, clé des liaisons)
    for (const [k, init] of Object.entries(params)) n[k] = param(id, k, init);
    Object.assign(n, extra);
    n.connect = (dst) => { record && L(`${id}.connect(${dst.id || '?'})`); if (dst.id) { if (!edges.has(n)) edges.set(n, new Set()); edges.get(n).add(dst.raw); } return dst; };
    n.disconnect = (dst) => { record && L(`${id}.disconnect(${dst ? dst.id : ''})`); if (dst) { if (edges.has(n)) edges.get(n).delete(dst.raw); } else edges.delete(n); };
    const proxy = new Proxy(n, { set(t, k, v) { if (typeof v !== 'object' && typeof v !== 'function') record && L(`${id}.${String(k)}=${num(v)}`); t[k] = v; return true; } });
    nodes.push(n);
    return proxy;
  };
  const src = (kind, params) => make(kind, params, {
    start(...a) { record && L(`${this.id}.start(${a.map(num).join(',')})`); this.started = a[0] ?? 0; },
    stop(...a) { record && L(`${this.id}.stop(${a.map(num).join(',')})`); this.stopAt = a[0] ?? ctx.now; },
  });

  ctx.createGain = () => make('gain', { gain: 1 });
  ctx.createBiquadFilter = () => make('biquad', { frequency: 350, Q: 1, gain: 0, detune: 0 }, { type: 'lowpass' });
  ctx.createDynamicsCompressor = () => make('comp', { threshold: -24, ratio: 12, attack: 0.003, release: 0.25, knee: 30 });
  ctx.createOscillator = () => src('osc', { frequency: 440, detune: 0 });
  ctx.createBufferSource = () => src('buf', { playbackRate: 1, detune: 0 });
  ctx.createBuffer = (ch, len, sr) => ({ id: 'buffer', length: len, sampleRate: sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) });
  ctx.destination = make('dest');
  ctx.resume = () => { ctx._resumed++; record && L('ctx.resume'); ctx.state = 'running'; return Promise.resolve(); };
  ctx.suspend = () => { ctx._suspended++; record && L('ctx.suspend'); ctx.state = 'suspended'; return Promise.resolve(); };

  // Nœuds encore reliés (de proche en proche) à la sortie : un nœud détaché d'un bout à l'autre ne compte plus.
  ctx.reachable = () => {
    const back = new Map();
    for (const [a, set] of edges) for (const b of set) { if (!back.has(b)) back.set(b, new Set()); back.get(b).add(a); }
    const seen = new Set(), stack = [nodes.find((n) => n.kind === 'dest')];
    while (stack.length) { const n = stack.pop(); if (!n || seen.has(n)) continue; seen.add(n); for (const a of back.get(n) || []) stack.push(a); }
    return seen;
  };
  return ctx;
}

export const digest = (log) => createHash('sha1').update(log.join('\n')).digest('hex');
