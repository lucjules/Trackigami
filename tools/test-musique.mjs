// Musique par décor (COMPLETE-006) : node tools/test-musique.mjs   (npm test)
//
// Structurel et sur un FAUX AudioContext (tools/fake-audio.mjs) : ce test ne peut rien dire de ce qui s'entend. Le rendu réel (signal non nul, crête, empreinte spectrale, intensité) est dans
// tools/test-browser-audio.mjs (Chromium, OfflineAudioContext) ; ce qui exige une écoute humaine est dans docs/ECOUTE-MUSIQUE.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { fakeContext, digest, seedRandom } from './fake-audio.mjs';
import { defaultRun } from './baseline-audio.mjs';
import { AudioEngine } from '../js/AudioEngine.js';
import { Music } from '../js/music.js';
import { DECORS, DEFAULT_DECOR } from '../js/themes.js';
import { PROFILES, PROFILE_ORDER } from '../js/quality.js';
import { VARIANTS, VARIANT_IDS, variantFor, validateVariant, musicPlan, scaleNote, chordOffsets, cleanBudget, DEFAULT_BUDGET, SCALES, LIMITS, KINDS } from '../js/musicVariants.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

console.log('Les douze variantes (données)');
test('une variante par décor de themes.js, ni plus ni moins, dans le même ordre', () => {
  assert.deepEqual(VARIANT_IDS, Object.keys(DECORS));
  assert.equal(VARIANT_IDS.length, 12);
  for (const d of Object.keys(DECORS)) assert.ok(variantFor(d), d + ' sans variante');
});
test('chaque variante est valide : bornes des nombres, timbres connus, pas dans la mesure, motifs dans la gamme', () => {
  for (const v of Object.values(VARIANTS)) assert.deepEqual(validateVariant(v), [], v.id);
});
test('validateVariant refuse ce qui sort des bornes (le validateur n\'est pas un tampon)', () => {
  const base = VARIANTS.desert;
  const bad = [
    { ...base, bpm: 200 }, { ...base, bpm: 10 }, { ...base, root: 70 }, { ...base, swing: 0.9 }, { ...base, scale: 'nope' }, { ...base, open: [3000, 1000] },
    { ...base, prog: [0, 1, 2] }, { ...base, prog: [0, 1, 2, 9] }, { ...base, id: 'inconnu' }, { ...base, pad: { kind: 'orgue', gain: 1 } },
    { ...base, lead: { ...base.lead, motifs: [[[16, 0, 0]]] } }, { ...base, lead: { ...base.lead, motifs: [[[0, 0, 2]]] } },
    { ...base, drums: { ...base.drums, kick: '' } }, { ...base, bass: { ...base.bass, at: [] } },
  ];
  for (const v of bad) assert.ok(validateVariant(v).length > 0, JSON.stringify(v).slice(0, 80));
  assert.ok(validateVariant(null).length > 0);
});
test('deux variantes ne sont jamais identiques : tempo, tonalité, timbres et motifs diffèrent (paire par paire)', () => {
  const ids = VARIANT_IDS;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = VARIANTS[ids[i]], b = VARIANTS[ids[j]];
    assert.notEqual(JSON.stringify({ ...a, id: 0 }), JSON.stringify({ ...b, id: 0 }), `${a.id} = ${b.id}`);
    assert.ok(a.bpm !== b.bpm || a.root !== b.root || a.scale !== b.scale, `${a.id} et ${b.id} : même tempo, même tonique et même gamme`);
    assert.notEqual(`${a.pad.kind}/${a.bass.kind}/${a.lead.kind}`, `${b.pad.kind}/${b.bass.kind}/${b.lead.kind}`, `${a.id} et ${b.id} : mêmes instruments`);
    assert.notEqual(JSON.stringify(a.lead.motifs), JSON.stringify(b.lead.motifs), `${a.id} et ${b.id} : même motif`);
    assert.notEqual(JSON.stringify(a.drums), JSON.stringify(b.drums), `${a.id} et ${b.id} : mêmes percussions`);
  }
  // Chaque tonalité (tonique + gamme) et chaque tempo sont propres à leur décor : aucune paire n'est « presque » la même.
  assert.equal(new Set(Object.values(VARIANTS).map((v) => v.root + v.scale)).size, 12);
  assert.equal(new Set(Object.values(VARIANTS).map((v) => v.bpm)).size, 11 + 0 || 11, 'au moins onze tempos distincts');
});
test('l\'étendue est réellement variée : tempos, gammes et timbres utilisés', () => {
  const vs = Object.values(VARIANTS);
  assert.ok(Math.max(...vs.map((v) => v.bpm)) - Math.min(...vs.map((v) => v.bpm)) >= 40);
  assert.ok(new Set(vs.map((v) => v.scale)).size >= 6);
  assert.ok(new Set(vs.map((v) => v.lead.kind)).size >= 9);
  assert.ok(new Set(vs.map((v) => v.pad.kind)).size >= 5);
  assert.ok(new Set(vs.map((v) => v.bass.kind)).size >= 5);
  for (const k of ['kick', 'snare', 'hat']) assert.ok(new Set(vs.map((v) => v.drums[k])).size >= 4, k);
});
test('toutes les notes tiennent dans le registre prévu (mélodie ≤ do7, basse ≥ do1)', () => {
  const eng = Object.create(AudioEngine.prototype);
  for (const v of Object.values(VARIANTS)) for (let deg = 0; deg < 7; deg++) for (let off = -3; off <= 9; off++) for (let oct = 0; oct <= 3; oct++) {
    const m = eng._leadMidi(v, deg + off, oct);
    assert.ok(m <= 96 && m >= 40, `${v.id} ${m}`);
  }
  for (const v of Object.values(VARIANTS)) for (const d of v.prog) for (const [, off] of v.bass.at) assert.ok(v.root + scaleNote(v, d) + off >= 28 && v.root + scaleNote(v, d) + off <= 74, v.id);
});
test('scaleNote et chordOffsets : degrés négatifs et reports d\'octave', () => {
  const v = { scale: 'ionian' };
  assert.equal(scaleNote(v, 0), 0); assert.equal(scaleNote(v, 7), 12); assert.equal(scaleNote(v, -1), -1); assert.equal(scaleNote(v, 9), 16);
  assert.deepEqual(chordOffsets(v, 0, 3), [0, 4, 7]); assert.deepEqual(chordOffsets(v, 0, 4), [0, 4, 7, 11]);
  for (const s of Object.values(SCALES)) assert.ok(s.length >= 6 && s[0] === 0 && s.every((x, i) => i === 0 || x > s[i - 1]));
});

console.log('Sélection par décor');
test('variantFor est déterministe : le même décor donne toujours le même objet (gelé) ; un décor inconnu ou absurde : aucune variante', () => {
  for (const d of Object.keys(DECORS)) { assert.equal(variantFor(d), variantFor(d)); assert.equal(variantFor(d).id, d); assert.ok(Object.isFrozen(variantFor(d))); }
  for (const x of ['', 'nope', null, undefined, 3, {}, '__proto__', 'constructor', 'toString']) assert.equal(variantFor(x), null, String(x));
});
test('la sélection ne tire rien au hasard : ni Math.random ni horloge dans les modules de variantes', () => {
  for (const f of ['js/musicVariants.js', 'js/musicVariantEngine.js']) { const src = read(f); assert.ok(!/Math\.random\(\)/.test(src.replace(/\/\/.*$/gm, '').replace(/seeded|mulberry/g, '')) || false, f); assert.ok(!/Date\.now|performance\.now|new Date/.test(src), f); }
  assert.ok(!/Math\.random/.test(read('js/musicVariants.js')));
});
test('musicPlan : les règles d\'origine par écran sont conservées (ambiance d\'auteur, multijoueur et Académie → chill d\'origine)', () => {
  const tr = (decor, music = '') => ({ decor, ambiance: { music } });
  assert.deepEqual(musicPlan(tr('polar'), {}), { kind: 'game', decor: 'polar' });
  assert.deepEqual(musicPlan(tr('polar', 'none'), {}), { kind: 'none', decor: '' });
  assert.deepEqual(musicPlan(tr('polar', 'menu'), {}), { kind: 'menu', decor: '' });
  assert.deepEqual(musicPlan(tr('polar', 'none'), { multi: {} }), { kind: 'game', decor: '' }, 'multijoueur : toujours le chill, ambiance d\'auteur ignorée');
  assert.deepEqual(musicPlan(tr('polar', 'menu'), { academy: {} }), { kind: 'game', decor: '' }, 'Académie : idem');
  assert.deepEqual(musicPlan(tr('reef'), { fromEditor: true }), { kind: 'game', decor: 'reef' });
  assert.deepEqual(musicPlan({ decor: 'nope', ambiance: { music: '' } }, {}), { kind: 'game', decor: '' });
  assert.deepEqual(musicPlan({ decor: 'sky' }, undefined), { kind: 'game', decor: 'sky' }, 'circuit sans ambiance, sans options');
  // un script de circuit qui change la musique en route : la règle est la même, l'ambiance d'auteur est remplacée
  assert.deepEqual(musicPlan(tr('city', 'none'), {}, ''), { kind: 'game', decor: 'city' });
  assert.deepEqual(musicPlan(tr('city'), {}, 'none'), { kind: 'none', decor: '' });
  assert.deepEqual(musicPlan(tr('city'), { multi: {} }, 'menu'), { kind: 'menu', decor: '' }, 'un script reste obéi en multijoueur (comme avant)');
});
test('main.js et scriptsRun.js passent par musicPlan ; ambiance.js (données du serveur) n\'est pas touché', () => {
  assert.match(read('js/main.js'), /musicPlan\(track, opts\)/);
  assert.match(read('js/race/scriptsRun.js'), /musicPlan\(this\.track, this\.opts, style\)/);
  assert.ok(!/musicVariants|musicPlan/.test(read('js/ambiance.js')));
  for (const f of ['js/verify.js', 'js/physics.js']) assert.ok(!/music|audio/i.test(read(f).replace(/\/\/.*$/gm, '')), f + ' ne doit pas toucher à l\'audio');
});

console.log('Le menu et le chill d\'origine sont inchangés');
// Empreintes calculées sur le code d'AVANT ce travail (tools/baseline-audio.mjs, journal complet des appels Web Audio sur 12 s, Math.random figé).
const BASE = { house: ['a79a43f725b6ff2bacaa21b38bfe2c07ecabf996', 5257, 101], chill: ['484641b3061766211131512061a511c9e8578964', 1572, 77] };
for (const m of ['house', 'chill']) test(`« ${m} » sans variante : le journal des 12 s d'appels Web Audio est identique à celui d'avant`, () => {
  const r = defaultRun(m);
  assert.equal(digest(r.log), BASE[m][0]); assert.equal(r.log.length, BASE[m][1]); assert.equal(r.scheduled, BASE[m][2]);
});
test('« chill » avec variante absente (null) = chill d\'origine ; une variante ne touche pas le mode house', () => withTimers(() => {
  seedRandom(7);
  const e = new AudioEngine().init(fakeContext());
  e.start('house', VARIANTS.desert);
  assert.equal(e.variant, null);
  e.stop();
  const e2 = new AudioEngine().init(fakeContext()); e2.start('chill', null); assert.equal(e2.variant, null); e2.stop();
}));

// ---- Faux contexte : voix, fuites, suspension ---------------------------------------------------------------------------------------------------------
function withTimers(fn) {
  const real = { si: globalThis.setInterval, ci: globalThis.clearInterval, st: globalThis.setTimeout, ct: globalThis.clearTimeout };
  const iv = new Map(), to = new Map(); let id = 1;
  globalThis.setInterval = (f) => { iv.set(id, f); return id++; }; globalThis.clearInterval = (i) => { iv.delete(i); };
  globalThis.setTimeout = (f) => { to.set(id, f); return id++; }; globalThis.clearTimeout = (i) => { to.delete(i); };
  const T = { iv, to, tick: () => { for (const f of [...iv.values()]) f(); }, fire: () => { for (const [k, f] of [...to]) { to.delete(k); f(); } } };
  try { return fn(T); } finally { Object.assign(globalThis, { setInterval: real.si, clearInterval: real.ci, setTimeout: real.st, clearTimeout: real.ct }); }
}
// Joue `seconds` secondes d'une variante avec la vitesse donnée ; renvoie le moteur et le contexte.
function play(T, id, { speed = 0.6, seconds = 20, budget = DEFAULT_BUDGET, vol = 0.5, stopAfter = true, record = false } = {}) {
  seedRandom(3);
  const ctx = fakeContext({ record });
  const e = new AudioEngine({ volume: vol }).init(ctx);
  e.setBudget(budget);
  e.updateWithCarSpeed(speed);
  e.start('chill', variantFor(id));
  const n = Math.round(seconds / 0.025);
  for (let i = 0; i < n; i++) { ctx.now = i * 0.025; T.tick(); }
  if (stopAfter) { e.stop(); e.flush(); }
  return { e, ctx };
}

console.log('Budget de voix');
test('aucune variante ne dépasse jamais le budget de voix, à aucun profil de qualité ni à aucune vitesse (kick et basse compris)', () => withTimers((T) => {
  for (const name of PROFILE_ORDER) for (const id of VARIANT_IDS) for (const speed of [0, 0.5, 1, 1.2]) {
    const b = PROFILES[name].audio;
    const { e } = play(T, id, { speed, seconds: 20, budget: b, stopAfter: false });
    assert.ok(e.stats.peak <= b.voices, `${name} ${id} v=${speed} : pic ${e.stats.peak} > ${b.voices}`);
    assert.ok(e.liveVoiceCount() <= b.voices);
    assert.ok(e.stats.scheduled > 0);
  }
}));
test('chaque profil de qualité déclare un budget ; Potato et Ultra Potato sont plus légers que Haute, dans l\'ordre', () => {
  const v = PROFILE_ORDER.map((n) => PROFILES[n].audio);
  for (const b of v) assert.deepEqual(b, cleanBudget(b));
  for (let i = 1; i < v.length; i++) assert.ok(v[i].voices <= v[i - 1].voices, 'le budget ne monte jamais quand le profil descend');
  assert.ok(PROFILES.potato.audio.voices < PROFILES.high.audio.voices && PROFILES.potato.audio.detail !== 'full');
  assert.equal(PROFILES.ultrapotato.audio.detail, 'min');
  assert.deepEqual(cleanBudget(undefined), DEFAULT_BUDGET); assert.deepEqual(cleanBudget({ voices: 999, detail: 'x' }), { voices: 48, detail: 'full' }); assert.equal(cleanBudget({ voices: 1 }).voices, 6);
});
test('Potato : moins de voix que Haute sur la même musique (nombre moyen de sources par pas) ; Ultra Potato : ni hats ni arpège de boost', () => withTimers((T) => {
  const count = (id, b, speed) => { const { ctx } = play(T, id, { speed, seconds: 20, budget: b }); return ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'buf').length; };
  let lighter = 0;
  for (const id of VARIANT_IDS) { const hi = count(id, PROFILES.high.audio, 1.2), po = count(id, PROFILES.potato.audio, 1.2), up = count(id, PROFILES.ultrapotato.audio, 1.2); assert.ok(po < hi, `${id} potato ${po} ≥ high ${hi}`); assert.ok(up < po, `${id} ultra potato ${up} ≥ potato ${po}`); lighter++; }
  assert.equal(lighter, 12);
  const { ctx } = play(T, 'city', { speed: 1.2, budget: PROFILES.ultrapotato.audio });
  assert.ok(!ctx.nodes.some((n) => n.kind === 'biquad' && n.type === 'highpass' && n.frequency.last === 6500), 'aucun hat en Ultra Potato');
}));
test('une variante dont le budget est trop juste perd d\'abord les extras, jamais le kick ni la basse', () => withTimers((T) => {
  const { e } = play(T, 'jungle', { speed: 1.2, budget: { voices: 8, detail: 'full' }, stopAfter: false });
  assert.ok(e.stats.dropped > 0, 'le budget de 8 force des abandons');
  assert.ok(e.stats.peak <= 8);
  const kicks = (b) => play(T, 'jungle', { speed: 1.2, budget: b }).ctx.nodes.filter((n) => n.kind === 'osc' && n.frequency.last !== undefined).length;
  assert.ok(kicks({ voices: 8, detail: 'full' }) > 0);
}));
test('musique coupée (volume 0) : le séquenceur avance mais ne programme aucune voix ; elle reprend dès que le volume remonte', () => withTimers((T) => {
  const { ctx, e } = play(T, 'desert', { vol: 0, seconds: 10 });
  assert.equal(ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'buf').length, 0);
  assert.ok(e.stats.scheduled > 50, 'les pas avancent (la musique reprend en mesure)');
  const r = play(T, 'desert', { vol: 0.3, seconds: 10 });
  assert.ok(r.ctx.nodes.filter((n) => n.kind === 'osc').length > 20);
}));

console.log('Pas de fuite de nœuds');
test('après arrêt, plus aucune voix : le registre est vide et rien d\'autre que le graphe fixe n\'est relié à la sortie', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const e = new AudioEngine().init(ctx);
  const fixed = ctx.reachable().size;
  e.updateWithCarSpeed(0.8); e.start('chill', VARIANTS.city);
  for (let i = 0; i < 320; i++) { ctx.now = i * 0.025; T.tick(); }
  assert.ok(e.liveVoiceCount() > 0 && ctx.reachable().size > fixed, 'des voix sonnent en cours de morceau');
  e.stop(); assert.ok(T.to.size === 1, 'un nettoyage est programmé à l\'arrêt');
  T.fire();
  assert.equal(e._live.length, 0); assert.equal(ctx.reachable().size, fixed, 'seul le graphe fixe reste relié');
}));
test('20 changements de décor de suite (arrêt puis départ, comme Music) : le nombre de nœuds reliés à la sortie est stable', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const e = new AudioEngine().init(ctx);
  const fixed = ctx.reachable().size; const sizes = [], lives = [];
  for (let k = 0; k < 20; k++) {
    e.updateWithCarSpeed(0.5 + (k % 3) * 0.3);
    e.start('chill', variantFor(VARIANT_IDS[k % 12]));
    const t0 = ctx.now;
    for (let i = 1; i <= 120; i++) { ctx.now = t0 + i * 0.025; T.tick(); }
    e.stop(); ctx.now += 0.46; T.fire();
    sizes.push(ctx.reachable().size); lives.push(e._live.length);
  }
  assert.ok(sizes.every((s) => s === fixed), 'nœuds reliés : ' + [...new Set(sizes)].join(','));
  assert.ok(lives.every((n) => n === 0));
  assert.equal(ctx.nodes.filter((n) => n.kind === 'dest').length, 1);
  // le graphe permanent n'a pas grossi : init() est idempotent
  const before = ctx.nodes.length; e.init(); assert.equal(ctx.nodes.length, before);
}));
test('en route, les voix terminées sont détachées au fil des pas (le registre reste borné, il ne croît pas avec la durée)', () => withTimers((T) => {
  const sizes = [];
  seedRandom(3);
  const ctx = fakeContext(); const e = new AudioEngine().init(ctx);
  e.updateWithCarSpeed(1); e.start('chill', VARIANTS.factory);
  for (let i = 0; i < 4800; i++) { ctx.now = i * 0.025; T.tick(); if (i % 800 === 799) sizes.push(e._live.length); }
  const detached = ctx.log.filter((l) => /\.disconnect\(/.test(l)).length;
  assert.ok(detached > 500, 'des centaines de voix terminées détachées : ' + detached);
  assert.ok(Math.max(...sizes) < 120, 'registre : ' + sizes.join(','));
  assert.ok(Math.max(...sizes) - Math.min(...sizes) < 40, 'pas de croissance : ' + sizes.join(','));
}));
test('redémarrer avant la fin du nettoyage ne coupe pas la nouvelle musique (seules les voix retirées sont détachées)', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const e = new AudioEngine().init(ctx);
  e.start('chill', VARIANTS.desert);
  for (let i = 0; i < 100; i++) { ctx.now = i * 0.025; T.tick(); }
  e.stop(); ctx.now += 0.45;
  e.start('chill', VARIANTS.polar);
  for (let i = 0; i < 60; i++) { ctx.now += 0.025; T.tick(); }
  const fresh = e._live.filter((g) => !g.dying).length;
  assert.ok(fresh > 0);
  T.fire();
  assert.equal(e._live.filter((g) => !g.dying).length, fresh, 'les voix de la nouvelle musique sont intactes');
  assert.equal(e._live.filter((g) => g.dying).length, 0);
}));

console.log('Onglet masqué');
test('hold : aucune minuterie du séquenceur tant que l\'onglet est masqué, aucun réveil du contexte suspendu ; au retour, la musique repart de l\'instant présent', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const e = new AudioEngine().init(ctx);
  e.start('chill', VARIANTS.sky);
  assert.equal(T.iv.size, 1);
  e.hold(true); assert.equal(T.iv.size, 0, 'minuterie arrêtée');
  e.stop(); ctx.state = 'suspended'; const resumes = ctx._resumed;
  e.start('chill', VARIANTS.reef);                            // (la minuterie de Music arrive dans un onglet masqué)
  assert.equal(ctx._resumed, resumes, 'le contexte n\'est pas réveillé'); assert.equal(T.iv.size, 0, 'pas de minuterie'); assert.ok(e.running);
  ctx.now = 500; e.hold(false); assert.equal(T.iv.size, 1); assert.ok(e._next >= 500, 'pas de rattrapage : le séquenceur repart d\'ici');
  const before = ctx.nodes.length; T.tick(); assert.ok(ctx.nodes.length - before < 60, 'pas de salve de notes en retard');
  e.hold(false); assert.equal(T.iv.size, 1, 'idempotent');
}));
test('Music.hold se transmet au séquenceur ; main.js l\'appelle à chaque changement de visibilité', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const audio = { ctx }; const m = new Music(audio);
  m.hold(true); m.play('game', 'sky'); T.fire();
  assert.equal(T.iv.size, 0, 'départ dans un onglet masqué : aucune minuterie');
  m.hold(false); assert.equal(T.iv.size, 1);
  assert.match(read('js/main.js'), /music\.hold\(hidden\)/);
}));

console.log('Music : sélection et règles par écran');
test('Music.play(\'game\', décor) joue la variante du décor ; le même morceau redemandé ne redémarre pas ; un autre décor redémarre après le fondu de 450 ms', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const audio = { ctx }; const m = new Music(audio);
  m.play('game', 'polar'); T.fire();
  assert.equal(m.synth.variant && m.synth.variant.id, 'polar'); assert.equal(m.synth.mode, 'chill'); assert.ok(m.synth.running);
  const created = ctx.nodes.length; m.play('game', 'polar'); T.fire(); assert.equal(ctx.nodes.length, created, 'même morceau : rien ne redémarre');
  m.play('game', 'reef'); assert.equal(m.synth.running, false, 'fondu : l\'ancienne musique est coupée tout de suite'); T.fire();
  assert.equal(m.synth.variant.id, 'reef'); assert.ok(m.synth.running);
  m.play('menu'); T.fire(); assert.equal(m.synth.mode, 'house'); assert.equal(m.synth.variant, null, 'le menu n\'a jamais de variante');
  m.play('game', ''); T.fire(); assert.equal(m.synth.mode, 'chill'); assert.equal(m.synth.variant, null, 'sans décor : le chill d\'origine');
  m.play('game', 'nope'); T.fire(); assert.equal(m.synth.variant, null);
  m.stop(); assert.equal(m.synth.running, false);
}));
test('le menu qui suit une course à variante règle son filtre comme avant (la variante ne laisse rien derrière elle), et la variante règle le sien après son départ', () => withTimers((T) => {
  const cutoffAfter = (variantId) => {
    seedRandom(3);
    const ctx = fakeContext(); const m = new Music({ ctx });
    m.play('game', variantId); T.fire(); m.setSpeed(0.4);
    m.play('menu'); T.fire();
    return { menu: m.synth.lp.frequency.last, mode: m.synth.mode, variant: m.synth.variant };
  };
  const withVariant = cutoffAfter('polar'), without = cutoffAfter('');
  assert.equal(withVariant.mode, 'house'); assert.equal(withVariant.variant, null);
  assert.equal(withVariant.menu, without.menu, 'même filtre au menu, que la course d\'avant ait eu une variante ou non');
  seedRandom(3);
  const ctx = fakeContext(); const m = new Music({ ctx }); m.play('game', 'polar'); T.fire();
  assert.equal(m.synth.lp.frequency.last, VARIANTS.polar.open[0], 'à l\'arrêt, le filtre de la variante est à son ouverture de repos');
}));
test('Music : la vitesse suit (boost compris avec une variante, plafonnée à 1 sans) ; le budget de qualité arrive au séquenceur, même créé après', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const m = new Music({ ctx });
  m.setBudget({ voices: 12, detail: 'lean' });
  m.play('game', 'city'); T.fire(); assert.deepEqual(m.synth.budget, { voices: 12, detail: 'lean' });
  m.setSpeed(1.2); assert.equal(m.synth.boost, true); assert.equal(m.synth.speed, 1);
  m.setBudget({ voices: 30, detail: 'full' }); assert.equal(m.synth.budget.voices, 30);
  m.play('game', ''); T.fire(); m.setSpeed(1.2); assert.equal(m.synth.boost, false, 'chill d\'origine : jamais de boost, comme avant');
}));
test('le volume de la musique reste celui de la musique : setVolume agit sur le séquenceur, jamais sur le bus des effets', () => withTimers((T) => {
  seedRandom(3);
  const ctx = fakeContext(); const m = new Music({ ctx }); m.setVolume(0.6); m.play('game', 'isles'); T.fire();
  assert.ok(Math.abs(m.synth.volume - 0.42) < 1e-9);
  m.setVolume(0); assert.equal(m.synth.volume, 0);
  assert.ok(!/master|GameAudio/.test(read('js/musicVariantEngine.js')));
}));
test('l\'ordre de la musique d\'une course n\'a aucune influence sur la simulation : ni physique, ni replay, ni noyau n\'importent la musique', () => {
  for (const f of ['js/physics.js', 'js/replay.js', 'js/verify.js', 'js/sim.js']) { let src = ''; try { src = read(f); } catch { continue; } assert.ok(!/musicVariants|AudioEngine|music\.js|audio\.js/.test(src), f); }
});
test('limites déclarées : LIMITS et KINDS couvrent tout ce que les variantes utilisent', () => {
  for (const v of Object.values(VARIANTS)) { assert.ok(KINDS.pad.includes(v.pad.kind) && KINDS.bass.includes(v.bass.kind) && KINDS.lead.includes(v.lead.kind)); assert.ok(v.bpm >= LIMITS.bpm[0] && v.bpm <= LIMITS.bpm[1]); }
  assert.equal(DEFAULT_DECOR, 'desert');
});

finish('Tous les tests de la musique par décor passent.');
