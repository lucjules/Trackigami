// Course mesurée (COMPLETE-012) : fait rouler un conducteur (par défaut le pilote automatique) sur un circuit en comptant EXACTEMENT comme la course en direct
// (RaceSession._stepOnce : drive → statistiques → score → point de passage ; retour au checkpoint hors piste ou noyade) avec le même module (js/runStats.js).
// Sert à valider qu'un objectif bonus est réalisable (tools/objectifs.mjs), à mesurer les circuits et aux tests. Module sans effet de bord.
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { quantSteer, InputRecorder } from '../js/replay.js';
import { RunStats } from '../js/runStats.js';
import { DT } from '../js/constants.js';

// driver : { control(phys) → { steer, throttle, brake, … }, reset(phys) } (le pilote automatique si absent) ; opts : réglages du pilote automatique.
export function measureRun(track, { goal = null, driver = null, opts = {}, maxSeconds = 240, quant = true, record = false } = {}) {
  const sim = new Simulation(track), { phys, logic } = sim;
  sim.start();
  const bot = driver || new Autopilot(track.path, opts);
  bot.reset(phys);
  const st = new RunStats({ goal }), rec = record ? new InputRecorder() : null;
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps; i++) {
    const inp = bot.control(phys, logic);
    if (quant) inp.steer = quantSteer(inp.steer);
    if (rec) rec.push(inp, false);
    sim.drive(inp);
    st.step(phys, logic.steps + 1);      // (le chrono avance dans sim.score : ce pas est le pas n° steps + 1, comme dans race.js)
    const res = sim.score();
    if (res && (res.type === 'checkpoint' || res.type === 'lap')) st.checkpoint();
    if (res && res.type === 'finish') return { ok: true, stats: st.final(phys, logic), time: logic.time, ...(rec ? { inputs: rec.encode() } : {}) };
    if (phys.ev.sink || phys.ev.invalid || sim.groundT > sim.offTrackLimit) {
      sim.rewind();
      st.respawn();
      bot.reset(phys);
      if (st.respawns > 12) break;
    }
  }
  return { ok: false, stats: st.final(phys, logic), time: logic.time };
}

// Le geste du mini-turbo (celui que décrit la leçon de l'Académie) greffé sur le pilote automatique : dès qu'un virage appelle un braquage franc, volant à fond, frein `hold` s,
// puis gaz en gardant le volant `lock` s au total ; `count` gestes au plus, le premier après `start` s de course, `cool` s entre deux. C'est un balayage de commandes, pas un joueur :
// il sert à prouver qu'un objectif de mini-turbos est réalisable (tools/objectifs.mjs en cherche les réglages, tools/objectifs-recettes.json les garde).
export class GestureDriver {
  constructor(track, { start = 0, hold = 0.6, lock = 1.4, count = 99, minSteer = 0.6, minSpeed = 16, cool = 1.5 } = {}) {
    this.bot = new Autopilot(track.path, { latLimit: 44.8 });
    Object.assign(this, { start, hold, lock, count, minSteer, minSpeed, cool });
    this.reset();
  }
  reset(phys) { if (phys) this.bot.reset(phys); this.t0 = null; this.next = this.start; this.done = 0; }
  control(phys, logic) {
    const inp = this.bot.control(phys), now = logic.steps * DT;
    if (this.t0 == null && this.done < this.count && now >= this.next && phys.grounded && !phys.rib && Math.abs(inp.steer) > this.minSteer && phys.fwdSpeed > this.minSpeed) { this.t0 = now; this.sign = Math.sign(inp.steer); }
    if (this.t0 != null) {
      const t = now - this.t0;
      if (t < this.lock) return { steer: this.sign, throttle: t >= this.hold, brake: t < this.hold, drift: false };
      this.t0 = null; this.done++; this.next = now + this.cool;
    }
    return inp;
  }
}
