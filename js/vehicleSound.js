// Sons propres à chaque véhicule (COMPLETE-017) : les paramètres que GameAudio.engine (audio.js) vise à chaque image. Module PUR : aucun accès à Web Audio, aucune dépendance, aucune écriture
// dans l'état de la course ; il lit l'état qu'on lui donne (vitesse, gaz, dérapage, boost, aspiration, véhicule) et rend des nombres.
//
//   car     le moteur d'origine, formules inchangées (dent de scie + carré à l'octave, filtre qui s'ouvre avec le régime) ;
//   moto    plus aiguë et plus rageuse, modulée en amplitude au rythme des explosions (un « brrr » grave aux bas régimes qui se fond en bourdonnement) ;
//   boat    moteur hors-bord étouffé (triangle grave), SILLAGE (bruit filtré qui monte et s'intensifie avec la vitesse) et CLAPOT (clapotis lent, modulé, même à l'arrêt) ;
//   glider  presque plus de moteur : le SOUFFLE (bruit de vent filtré, plus aigu et plus fort avec la vitesse, en rafales lentes) et un sifflement fin des haubans.
// Le passage d'un véhicule à l'autre (plaque de transformation) est adouci côté audio.js : fondu du moteur, bascule du timbre à l'instant où il est quasi muet.
export const VEHICLES = ['car', 'moto', 'boat', 'glider'];

const GEARS = [0, 16, 31, 46, 61, 76, 90, 999];            // 0.9.5 : calées sur la vitesse de pointe de 0.9.4 (95 m/s, 112 en boost)

// Timbres : forme d'onde des deux oscillateurs, niveau du second, résonance du filtre, et ce que chaque couche (cf. ci-dessous) vaut pour ce véhicule.
export const TIMBRES = {
  car: { wave1: 'sawtooth', wave2: 'square', g2: 0.35, q: 4 },
  moto: { wave1: 'sawtooth', wave2: 'square', g2: 0.22, q: 2.2 },
  boat: { wave1: 'triangle', wave2: 'sawtooth', g2: 0.3, q: 1.6 },
  glider: { wave1: 'sine', wave2: 'sine', g2: 0.15, q: 0.7 },
};

const num = (x) => (Number.isFinite(x) ? x : 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// state : { vehicle, speed, throttle, slip, boost, draft } ; voice : { pitch } (la voix choisie par le joueur : seule sa hauteur compte ici).
// Renvoie les cibles (valeurs finales, lissées côté audio.js) :
//   f1, f2, filt, q, vol, g2     oscillateurs, filtre et niveau du moteur
//   skid, wind                   crissement et vent (communs à tous, dosés par véhicule)
//   amDepth, amHz                modulation d'amplitude du moteur (moto)
//   wake, wakeF                  sillage : niveau et fréquence centrale (bateau)
//   chop, chopDepth, chopHz      clapot : niveau, profondeur de la modulation lente, fréquence de la modulation (bateau)
//   breath, breathF, breathDepth, gustHz   souffle : niveau, fréquence centrale, profondeur des rafales, fréquence des rafales (deltaplane)
export function engineTargets(vehicle, state, voice) {
  const veh = VEHICLES.includes(vehicle) ? vehicle : 'car';
  const sp = Math.min(998, Math.abs(num(state.speed)));        // (au-delà de la dernière vitesse de la table, l'ancien code rendait NaN : plafonné ici)
  let g = 0;
  while (sp > GEARS[g + 1]) g++;
  const frac = (sp - GEARS[g]) / (GEARS[g + 1] - GEARS[g]);
  const rpm = Math.min(1.15, 0.25 + frac * 0.85);
  const pm = voice && Number.isFinite(voice.pitch) ? voice.pitch : 1;
  const thr = !!state.throttle, boost = !!state.boost;
  const slip = num(state.slip), draft = num(state.draft);
  const T = { f1: 0, f2: 0, filt: 0, q: TIMBRES[veh].q, vol: 0, g2: TIMBRES[veh].g2, skid: 0, wind: 0, amDepth: 0, amHz: 20, wake: 0, wakeF: 900, chop: 0, chopDepth: 0, chopHz: 2.2, breath: 0, breathF: 700, breathDepth: 0, gustHz: 0.35 };
  const skid = Math.min(0.22, Math.max(0, slip - 3) * 0.03);
  const wind = Math.min(0.3, sp * sp * 0.00006 + draft * 0.07);

  if (veh === 'car') {
    // Formules d'origine (audio.js avant la 0.21.0), à l'identique.
    const base = 55 + g * 6 + rpm * 120 + (boost ? 25 : 0);
    T.f1 = base * pm; T.f2 = base * 0.5 * pm;
    T.filt = 500 + rpm * 1500 + (thr ? 600 : 0);
    T.vol = (thr ? 0.16 : 0.09) + rpm * 0.05;
    T.skid = skid; T.wind = wind;
  } else if (veh === 'moto') {
    const base = 85 + g * 9 + rpm * 210 + (boost ? 35 : 0);
    T.f1 = base * pm; T.f2 = base * 0.5 * pm;
    T.filt = 900 + rpm * 3000 + (thr ? 900 : 0);
    T.vol = (thr ? 0.14 : 0.08) + rpm * 0.045;
    T.amDepth = 0.5 - 0.3 * clamp((rpm - 0.25) / 0.9, 0, 1);                 // plus marquée au ralenti, presque lissée à haut régime
    T.amHz = clamp(base * 0.25, 14, 60);
    T.skid = skid; T.wind = wind * 0.85;
  } else if (veh === 'boat') {
    const base = 38 + rpm * 70 + (boost ? 15 : 0);
    T.f1 = base * pm; T.f2 = base * 0.5 * pm;
    T.filt = 240 + rpm * 650 + (thr ? 250 : 0);
    T.vol = (thr ? 0.12 : 0.07) + rpm * 0.035;
    T.wake = 0.2 * (1 - Math.exp(-sp / 25)); T.wakeF = 500 + sp * 14;
    T.chop = 0.03 + Math.min(0.17, sp * 0.0026); T.chopDepth = 0.5 * T.chop; T.chopHz = 2.2 + sp * 0.04;
    T.skid = skid * 0.3; T.wind = wind * 0.6;
  } else {
    T.f1 = (300 + sp * 8) * pm; T.f2 = T.f1 * 1.5;
    T.filt = 4200;
    T.vol = Math.min(0.05, 0.004 + sp * 0.0009);
    T.breath = Math.min(0.28, 0.02 + sp * sp * 0.00008); T.breathF = 350 + sp * 38; T.breathDepth = 0.35 * T.breath; T.gustHz = 0.35 + sp * 0.004;
    T.skid = skid * 0.3; T.wind = wind * 0.5;
  }
  return T;
}
