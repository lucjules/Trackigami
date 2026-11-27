// Un enchaînement « chapitre d'une traite » en cours (COMPLETE-014, docs/CHAPITRE-D-UNE-TRAITE.md), côté jeu. Module pur (testé sous Node : tools/test-chain.mjs).
//
// Les manches sont séquencées par le MÊME mécanisme que le championnat multijoueur (net/championship.js : rounds, nextRound, scoreRound, finished), avec un seul
// pilote ; à côté, les commandes enregistrées et la durée (en pas) de chaque manche. Le temps cumulé, les fins de manche et la soumission au serveur sont
// calculés par les fonctions de chain.js, celles que la vérification serveur utilise : le temps annoncé est exactement celui que le serveur recalcule.
import { Championship } from './net/championship.js';
import { DT } from './constants.js';
import { CHAIN_LEGS, CHAIN_SEP, chainKeyFrom, chainTime, chainSplits } from './chain.js';

const ME = 'me';

export class ChainRun {
  // ch : numéro du chapitre ; keys, names, indexes : les 6 circuits (clés b-…, noms, index dans App.builtins), dans l'ordre de la carrière.
  constructor({ ch, keys, names = [], indexes = [] }) {
    if (!Array.isArray(keys) || keys.length !== CHAIN_LEGS) throw new Error('Un enchaînement compte exactement 6 circuits.');
    this.ch = ch;
    this.keys = keys.slice();
    this.names = keys.map((_, i) => String(names[i] || ''));
    this.indexes = indexes.slice();
    this.base = chainKeyFrom(ch, this.keys);
    this.restart();
  }

  // Tout recommencer à la manche 1 (action « recommencer », T par défaut, pendant n'importe quelle manche : l'épreuve est « d'une traite »).
  restart() {
    this.cup = new Championship({ id: this.base, rounds: this.keys.map((k, i) => ({ id: k, name: this.names[i] })) });
    this.cup.setName(ME, '');
    this.legs = [];
    this.steps = [];
    this.aided = false;
  }

  get leg() { return this.cup.played; }                // manche en cours (0 à 5) ; 6 quand c'est fini
  get total() { return this.cup.total; }
  get finished() { return this.cup.finished; }
  get current() { return this.cup.nextRound; }         // { id: clé du circuit, name } de la manche à courir, null à la fin
  // Une manche courue avec les aides à la conduite : tout l'enchaînement est classé « avec aides » (~v1.as-1), comme une course seule.
  markAided() { this.aided = true; }
  get key() { return this.aided ? `${this.base}~v1.as-1` : this.base; }

  // Range la manche terminée : sa durée en pas et ses commandes enregistrées. Renvoie son numéro (0 à 5).
  record(steps, inputs) {
    if (this.finished) throw new Error('Enchaînement déjà terminé.');
    if (!Number.isInteger(steps) || steps <= 0 || typeof inputs !== 'string' || !inputs) throw new Error('Manche invalide.');
    const n = this.cup.played;
    this.cup.scoreRound(n, { [ME]: steps }, [ME]);
    this.steps.push(steps);
    this.legs.push(inputs);
    return n;
  }

  get time() { return chainTime(this.steps); }          // temps cumulé (s)
  get splits() { return chainSplits(this.steps); }      // fins de manche, en pas cumulés
  legTime(i) { return this.steps[i] * DT; }
  // Écart (s) du temps cumulé à la fin de la manche i avec celui d'un record d'enchaînement (ses fins de manche) ; null sans record comparable.
  diffAt(i, rec) {
    const s = rec && Array.isArray(rec.splits) ? rec.splits[i] : null;
    return Number.isFinite(s) && i < this.steps.length ? (this.splits[i] - s) * DT : null;
  }

  // Ce que le jeu envoie (action submit-chain) et ce qu'il garde sur l'appareil (record rec3.<clé>, synchronisé comme les autres).
  submission(physVer) {
    return { trackKey: this.key, legs: this.legs.slice(), times: this.steps.map((s) => s * DT), time: this.time, physVer };
  }
  toRecord({ name = '', physVer, date = Date.now() }) {
    return { time: this.time, splits: this.splits, inputs: this.legs.join(CHAIN_SEP), chain: true, pv: physVer, date, name, ghost: null };
  }
}

// Soumission reconstruite depuis un record d'enchaînement (bouton « Envoyer mon record » du classement) ; null s'il n'a plus ses commandes ou est illisible.
export function submissionFromRecord(key, rec, physVer) {
  if (!rec || rec.chain !== true || typeof rec.inputs !== 'string' || !Array.isArray(rec.splits) || rec.splits.length !== CHAIN_LEGS) return null;
  const legs = rec.inputs.split(CHAIN_SEP);
  if (legs.length !== CHAIN_LEGS) return null;
  const steps = rec.splits.map((s, i) => s - (i ? rec.splits[i - 1] : 0));
  if (steps.some((s) => !Number.isInteger(s) || s <= 0)) return null;
  return { trackKey: key, legs, times: steps.map((s) => s * DT), time: chainTime(steps), physVer };
}
