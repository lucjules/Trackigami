// Sons propres à chaque véhicule (COMPLETE-017) : node tools/test-vehicules-son.mjs   (npm test)
//
// Paramètres (js/vehicleSound.js, pur) et branchement dans GameAudio (js/audio.js) sur un FAUX AudioContext (tools/fake-audio.mjs). Ce test ne peut pas juger ce qui s'entend : le rendu réel
// (signal non nul, sans écrêtage, timbres distincts) est dans tools/test-browser-audio.mjs ; ce qui exige une écoute humaine est dans docs/audit/ECOUTE_MUSIQUE.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { fakeContext, seedRandom } from './fake-audio.mjs';
import { engineTargets, TIMBRES, VEHICLES } from '../js/vehicleSound.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// RÉFÉRENCE : le moteur d'origine, recopié mot pour mot de js/audio.js avant la 0.21.0 (engine(state), lignes « gears » à « wind »).
function originalEngine(state, voice) {
  const sp = Math.abs(state.speed);
  const gears = [0, 16, 31, 46, 61, 76, 90, 999];
  let g = 0;
  while (sp > gears[g + 1]) g++;
  const frac = (sp - gears[g]) / (gears[g + 1] - gears[g]);
  const rpm = Math.min(1.15, 0.25 + frac * 0.85);
  const base = 55 + g * 6 + rpm * 120 + (state.boost ? 25 : 0);
  const pm = voice ? voice.pitch : 1;
  return {
    f1: base * pm, f2: base * 0.5 * pm, filt: 500 + rpm * 1500 + (state.throttle ? 600 : 0), vol: (state.throttle ? 0.16 : 0.09) + rpm * 0.05,
    skid: Math.min(0.22, Math.max(0, state.slip - 3) * 0.03), wind: Math.min(0.3, sp * sp * 0.00006 + (state.draft || 0) * 0.07),
  };
}
const grid = [];
for (const speed of [0, 0.3, 4, 15.9, 16, 22, 31.5, 46, 60, 75.99, 90, 95, 112, 140, -8, -40]) for (const throttle of [false, true]) for (const boost of [false, true]) for (const slip of [0, 2, 3.5, 9, 40]) for (const draft of [0, 0.4, 1]) grid.push({ speed, throttle, boost, slip, draft });

console.log('Paramètres par véhicule');
test('la voiture sonne EXACTEMENT comme avant : mêmes fréquences, filtre, niveau, crissement et vent que le code d\'origine, sur 480 états et deux voix', () => {
  for (const voice of [undefined, { pitch: 1 }, { pitch: 0.7 }, { pitch: 1.6 }]) for (const s of grid) {
    const ref = originalEngine(s, voice), now = engineTargets('car', s, voice);
    for (const k of Object.keys(ref)) assert.equal(now[k], ref[k], `${k} à ${JSON.stringify(s)}`);
    assert.equal(now.q, 4); assert.equal(now.g2, 0.35);
    for (const k of ['amDepth', 'wake', 'chop', 'chopDepth', 'breath', 'breathDepth']) assert.equal(now[k], 0, `${k} muet pour la voiture`);
  }
});
test('un véhicule inconnu ou absent (rejeu ancien, état incomplet) sonne comme la voiture', () => {
  const s = { speed: 30, throttle: true, boost: false, slip: 5, draft: 0.2 };
  for (const v of [undefined, null, '', 'tank', 'CAR']) assert.deepEqual(engineTargets(v, s), engineTargets('car', s));
});
test('quatre véhicules, quatre timbres : formes d\'onde et résonances distinctes deux à deux', () => {
  assert.deepEqual(VEHICLES, ['car', 'moto', 'boat', 'glider']);
  const sig = VEHICLES.map((v) => `${TIMBRES[v].wave1}/${TIMBRES[v].wave2}/${TIMBRES[v].q}/${TIMBRES[v].g2}`);
  assert.equal(new Set(sig).size, 4, sig.join(' | '));
  for (const v of VEHICLES) for (const w of ['wave1', 'wave2']) assert.ok(['sine', 'square', 'sawtooth', 'triangle'].includes(TIMBRES[v][w]));
});
test('chaque véhicule a sa couche : modulation (moto), sillage + clapot (bateau), souffle (deltaplane) ; aucune n\'existe chez les autres', () => {
  const s = { speed: 40, throttle: true, boost: false, slip: 0, draft: 0 };
  const T = Object.fromEntries(VEHICLES.map((v) => [v, engineTargets(v, s)]));
  assert.ok(T.moto.amDepth > 0.15 && T.car.amDepth === 0 && T.boat.amDepth === 0 && T.glider.amDepth === 0);
  assert.ok(T.boat.wake > 0.1 && T.boat.chop > 0.05 && T.boat.chopDepth > 0);
  for (const v of ['car', 'moto', 'glider']) assert.ok(T[v].wake === 0 && T[v].chop === 0 && T[v].chopDepth === 0, v);
  assert.ok(T.glider.breath > 0.1 && T.glider.breathDepth > 0);
  for (const v of ['car', 'moto', 'boat']) assert.ok(T[v].breath === 0 && T[v].breathDepth === 0, v);
  // les fondamentales ne se recouvrent pas : la moto est plus aiguë que la voiture, le bateau plus grave, le deltaplane siffle
  assert.ok(T.moto.f1 > T.car.f1 * 1.3 && T.boat.f1 < T.car.f1 * 0.7);
  assert.ok(T.boat.filt < T.car.filt && T.moto.filt > T.car.filt, 'le bateau est étouffé, la moto plus brillante');
  assert.ok(T.glider.vol < T.car.vol * 0.5, 'le deltaplane n\'a presque plus de moteur');
});
test('le sillage et le souffle montent avec la vitesse ; le clapot est audible même à l\'arrêt et accélère ; le deltaplane se tait à l\'arrêt', () => {
  const at = (v, speed) => engineTargets(v, { speed, throttle: false, boost: false, slip: 0, draft: 0 });
  let prev = at('boat', 0);
  assert.equal(prev.wake, 0); assert.ok(prev.chop > 0.02, 'clapotis à l\'arrêt');
  for (const sp of [5, 15, 30, 50, 80]) { const n = at('boat', sp); assert.ok(n.wake > prev.wake && n.wakeF > prev.wakeF && n.chop > prev.chop && n.chopHz > prev.chopHz, 'bateau ' + sp); prev = n; }
  prev = at('glider', 0); assert.ok(prev.breath <= 0.021);
  for (const sp of [5, 15, 30, 50]) { const n = at('glider', sp); assert.ok(n.breath > prev.breath && n.breathF > prev.breathF && n.f1 > prev.f1, 'deltaplane ' + sp); prev = n; }
  assert.ok(at('glider', 90).breath >= prev.breath && at('glider', 90).breath <= 0.28);
  prev = at('moto', 0);
  for (const sp of [5, 15, 30]) { const n = at('moto', sp); assert.ok(n.f1 > prev.f1 || sp === 15, 'moto ' + sp); prev = n; }
});
test('toutes les cibles sont des nombres finis et dans une plage sûre, même pour un état absurde (NaN, négatif, champ absent)', () => {
  const weird = [{}, { speed: NaN }, { speed: Infinity, slip: -5 }, { speed: -1e6, throttle: 1, boost: 'oui', slip: NaN, draft: NaN }, ...grid];
  for (const v of VEHICLES) for (const s of weird) {
    if (s.speed === Infinity) continue;
    const T = engineTargets(v, s, { pitch: 1.2 });
    for (const [k, x] of Object.entries(T)) assert.ok(Number.isFinite(x) && x >= 0, `${v}.${k} = ${x} pour ${JSON.stringify(s)}`);
    assert.ok(T.vol <= 0.25 && T.wind <= 0.3 && T.skid <= 0.22 && T.wake <= 0.2 && T.chop <= 0.2 && T.breath <= 0.28, v);
    assert.ok(T.chopDepth <= T.chop && T.breathDepth <= T.breath && T.amDepth <= 0.5, 'la modulation ne dépasse jamais le niveau (pas de gain négatif)');
  }
});
test('le module est pur : aucun accès à Web Audio, au DOM, à Math.random, aux horloges, ni à la course', () => {
  const src = read('js/vehicleSound.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\.random|Date|performance|window|document|AudioContext|import /.test(src), 'dépendances ou hasard');
});

// ---- GameAudio sur un faux contexte --------------------------------------------------------------------------------------------------------------------------
const { GameAudio } = await import('../js/audio.js');
function makeAudio() {
  seedRandom(5);
  const ctx = fakeContext({ record: false });
  globalThis.window = { AudioContext: function () { return ctx; } };
  const a = new GameAudio();
  a.unlock();
  return { a, ctx };
}
const S = (o) => Object.freeze({ speed: 30, throttle: true, slip: 0, boost: false, draft: 0, ...o });

console.log('GameAudio (faux contexte)');
test('le moteur de la voiture vise les mêmes valeurs qu\'avant sur le vrai graphe (osc1, osc2, filtre, gain, crissement, vent)', () => {
  const { a, ctx } = makeAudio();
  for (const s of grid.slice(0, 200)) {
    ctx.now += 0.016;
    a.engine(s);
    const ref = originalEngine(s, a.voice);
    assert.equal(a.osc1.frequency.last, ref.f1); assert.equal(a.osc2.frequency.last, ref.f2); assert.equal(a.engFilter.frequency.last, ref.filt);
    assert.equal(a.engGain.gain.last, ref.vol); assert.equal(a.skid.g.gain.last, ref.skid); assert.equal(a.wind.g.gain.last, ref.wind);
  }
  assert.equal(a.osc1.type, 'sawtooth'); assert.equal(a.osc2.type, 'square'); assert.equal(a.g2.gain.last, 0.35); assert.equal(a.engFilter.Q.last, 4);
  assert.equal(a.engSwap.gain.value, 1); assert.equal(a.engMod.gain.last, 1);
});
test('engine() ne crée aucun nœud : 3000 images avec des changements de véhicule au hasard, le nombre de nœuds ne bouge pas', () => {
  const { a, ctx } = makeAudio();
  const n0 = ctx.nodes.length, reach = ctx.reachable().size;
  let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 3000; i++) { ctx.now += 0.016; a.engine(S({ speed: rnd() * 100, vehicle: VEHICLES[Math.floor(rnd() * 4)], boost: rnd() < 0.1 })); if (i % 500 === 499) a.engine(null); }
  assert.equal(ctx.nodes.length, n0); assert.equal(ctx.reachable().size, reach);
});
test('transformation : le moteur plonge, le timbre ne change qu\'une fois quasi muet (≈ 0,1 s), puis le moteur revient ; pas de coupure sèche', () => {
  const { a, ctx } = makeAudio();
  ctx.now = 1; a.engine(S({ vehicle: 'car' }));
  assert.equal(a.osc1.type, 'sawtooth');
  ctx.now = 1.016; a.engine(S({ vehicle: 'moto' }));
  assert.equal(a.osc1.type, 'sawtooth', 'pas encore changé'); assert.equal(a.osc2.type, 'square');
  assert.ok(a._pending && a._pending.veh === 'moto' && a._pending.at > 1.1);
  ctx.now = 1.2; a.engine(S({ vehicle: 'moto' }));
  assert.equal(a._timbre, 'moto'); assert.equal(a.g2.gain.last, TIMBRES.moto.g2); assert.equal(a.engFilter.Q.last, TIMBRES.moto.q);
  // car → boat : le triangle prend le relais après le plongeon
  ctx.now = 2; a.engine(S({ vehicle: 'boat' })); assert.equal(a.osc1.type, 'sawtooth'); ctx.now = 2.15; a.engine(S({ vehicle: 'boat' })); assert.equal(a.osc1.type, 'triangle'); assert.equal(a.osc2.type, 'sawtooth');
  ctx.now = 3; a.engine(S({ vehicle: 'glider' })); ctx.now = 3.15; a.engine(S({ vehicle: 'glider' })); assert.equal(a.osc1.type, 'sine'); assert.equal(a.osc2.type, 'sine');
  // retour à la voiture (repasser sur la plaque)
  ctx.now = 4; a.engine(S({ vehicle: 'car' })); ctx.now = 4.15; a.engine(S({ vehicle: 'car' })); assert.equal(a.osc1.type, 'sawtooth'); assert.equal(a.osc2.type, 'square'); assert.equal(a.g2.gain.last, 0.35);
});
test('transformations en rafale : la dernière gagne, rien ne reste en attente à tort', () => {
  const { a, ctx } = makeAudio();
  ctx.now = 1; a.engine(S({ vehicle: 'car' }));
  for (const [t, v] of [[1.02, 'moto'], [1.04, 'boat'], [1.06, 'glider']]) { ctx.now = t; a.engine(S({ vehicle: v })); }
  ctx.now = 1.3; a.engine(S({ vehicle: 'glider' }));
  assert.equal(a._timbre, 'glider'); assert.equal(a._pending, null); assert.equal(a.osc1.type, 'sine');
});
test('pause puis reprise (engine(null)) : les couches se taisent ; le timbre est reposé tout de suite à la reprise', () => {
  const { a, ctx } = makeAudio();
  ctx.now = 1; a.engine(S({ vehicle: 'boat', speed: 50 })); assert.ok(a.wake.g.gain.last > 0.1);
  ctx.now = 1.1; a.engine(null);
  for (const l of [a.wake, a.chop, a.breath, a.skid, a.wind, a.rainLoop]) assert.equal(l.g.gain.last, 0);
  assert.equal(a.engGain.gain.last, 0); assert.equal(a.chopMod.gain.last, 0); assert.equal(a.lfoAmDepth.gain.last, 0);
  ctx.now = 1.2; a.engine(S({ vehicle: 'glider', speed: 20 })); assert.equal(a.osc1.type, 'sine', 'timbre posé tout de suite (le moteur est muet)'); assert.equal(a._pending, null);
});
test('la voix choisie par le joueur reste respectée : sa forme d\'onde prime hors voiture, sa hauteur multiplie toujours', () => {
  const { a, ctx } = makeAudio();
  a.setVoice({ engine: 'square', pitch: 1.5, hornPitch: 1 });
  ctx.now = 1; a.engine(S({ vehicle: 'moto' })); assert.equal(a.osc1.type, 'square', 'forme choisie');
  assert.equal(a.osc1.frequency.last, engineTargets('moto', S({ vehicle: 'moto' }), { pitch: 1.5 }).f1);
  a.setVoice({ engine: 'default', pitch: 1, hornPitch: 1 });
  assert.equal(a.osc1.type, 'sawtooth', 'voix par défaut : le timbre de la moto (dent de scie)');
  ctx.now = 2; a.engine(null); a.engine(S({ vehicle: 'boat' })); assert.equal(a.osc1.type, 'triangle', 'voix par défaut : le timbre du bateau');
  a.setVoice({ engine: 'sine', pitch: 1, hornPitch: 1 }); assert.equal(a.osc1.type, 'sine');
  a.setVoice(undefined); assert.equal(a.voice.custom, false);
});
test('engine() ne modifie pas l\'état qu\'on lui donne (objet gelé accepté) ; sans AudioContext il ne fait rien', () => {
  const { a } = makeAudio();
  a.engine(Object.freeze({ speed: 10, throttle: true, slip: 0, boost: false, vehicle: 'boat' }));
  const mute = new GameAudio(); assert.doesNotThrow(() => mute.engine({ speed: 1, vehicle: 'moto' })); assert.doesNotThrow(() => mute.engine(null));
});

console.log('Aucune incidence sur la physique ni sur les commandes enregistrées');
test('race.js ne fait que LIRE le véhicule pour l\'audio ; la physique, le rejeu et la vérification ne connaissent pas l\'audio', () => {
  const race = read('js/race.js');
  assert.equal((race.match(/app\.audio\.engine\(\{[^}]*vehicle: [^}]*\}\)/g) || []).length, 2, 'deux appels avec le véhicule (décompte, course)');
  assert.ok(/vehicle: this\.phys\.vehicle \}\)/.test(race) && /vehicle: p\.vehicle \}\)/.test(race));
  assert.ok(!/(this\.phys|\bp)\.vehicle\s*=[^=]/.test(race), 'aucune écriture du véhicule dans race.js');
  for (const f of ['js/physics.js', 'js/replay.js', 'js/verify.js', 'js/sim.js', 'js/recorder.js']) { let src = ''; try { src = read(f); } catch { continue; } assert.ok(!/vehicleSound|audio\.js|AudioEngine/.test(src), f); }
});

finish('Tous les tests des sons de véhicule passent.');
