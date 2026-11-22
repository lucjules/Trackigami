// Modifications du circuit : revêtements, options des pièces, mouvement, couleurs, décorations.
// Ces méthodes s'ajoutent au prototype de Track (voir track.js) : `this` est l'instance.
import { MAX_DECOS } from '../constants.js';
import { PIECES, SURFACES, surfaceAllowed, flagAllowed, clampMover, THEMES, clearConflicts, plateAllEdges } from '../pieces.js';
import { isObstacle } from '../obstacles.js';
import { isSolid, SOLID_SCALE } from '../solids.js';
import { DECO_ORDER } from '../decoData.js';
import { sanitizeDecoParts, MAX_CUSTOM_DECOS } from '../customDeco.js';
import { HEX, cleanColors, normalizeAngle, normalizeRoll } from './shared.js';
import { Track } from '../track.js';

// ---- Décorations (phase 8 : TECH-034, TECH-035 ; transversal TRANS-01) -------------------------------------------------------------------------------------------
// UNE normalisation, idempotente : normalizeDeco(normalizeDeco(d)) est normalizeDeco(d). Toutes les écritures de décoration y passent : l'ajout (pose, collage, duplication,
// prefab, lecture d'un code, restauration de l'historique : Track.addDeco) et la modification d'une décoration posée (Track.setDeco : inspecteur, gizmo, Maj + glisser,
// sélection, calques). Elle borne et nettoie (échelle, phase, inclinaison et roulis : ce que faisait addDeco), puis ARRONDIT au pas du code (Track.encode : x, y, z et
// échelle au centième, cap au millième) : la décoration en mémoire est exactement celle que le code relu redonnera, donc l'instantané d'historique, la signature et l'état
// rouvert après un essai sont les mêmes (avant : une décoration posée « Libre » gardait 16,123456 m en mémoire et 16,12 dans le code ; au retour d'un essai l'éditeur jetait
// l'historique, le presse-papiers et les calques).
// exact : les circuits GÉNÉRÉS (circuits officiels, défi du jour, scriptTrack) gardent leurs valeurs telles que calculées — leur physique est jouée depuis la mémoire, pas
// depuis le code, et ne doit pas changer d'un bit. Les codes existants sont déjà au pas du code : leur lecture ne change rien.
const centi = (v) => +v.toFixed(2) || 0;      // (|| 0 : jamais −0 ; même pas que Track.encode)
const milliRy = (v) => +v.toFixed(3) || 0;
export function normalizeDeco(d, { exact = false } = {}) {
  if (!d || !DECO_ORDER.includes(d.k)) return null;
  const deco = {
    k: d.k, x: +d.x, y: +d.y, z: +d.z, ry: +d.ry || 0, s: Math.max(0.2, Math.min(20, +d.s || 1)),
    c: d.c | 0, u: d.u ? String(d.u).slice(0, 400) : '',
  };
  const g = Math.max(0, Math.min(63, d.g | 0));
  if (g) deco.g = g;                     // groupe (calque de l'éditeur ; logique du circuit)
  // Obstacles : décalage de phase (0 à 1) pour désynchroniser plusieurs obstacles.
  if (isObstacle(deco.k)) { deco.ph = Math.max(0, Math.min(0.95, Math.round((+d.ph || 0) * 20) / 20)); deco.s = Math.max(0.5, Math.min(2.5, deco.s)); }
  // 0.11.3 : une position illisible (code abîmé : coordonnée vide) refuse la décoration, comme pour un solide : gardée, elle devenait 0 au ré-encodage (circuit instable).
  if (!Number.isFinite(deco.x) || !Number.isFinite(deco.y) || !Number.isFinite(deco.z)) return null;
  // 0.9.68 : un solide (pilier, poutre, mur, bloc) compte pour la physique : jamais incliné ni roulé (rx, rz ignorés), échelle bornée (voir solids.js).
  const solid = isSolid(deco.k);
  if (solid) {
    deco.s = Math.max(SOLID_SCALE[0], Math.min(SOLID_SCALE[1], deco.s));
    if (!Number.isFinite(deco.ry)) return null;
  }
  if (!exact) {
    deco.x = centi(deco.x); deco.y = centi(deco.y); deco.z = centi(deco.z); deco.s = centi(deco.s);
    deco.ry = Number.isFinite(deco.ry) ? milliRy(deco.ry) : 0;
  }
  // Inclinaison (rx : nez vers le bas / le haut) et roulis (rz) : purement VISUELS pour une décoration ; pour un obstacle seul le roulis rz compte (physique), par pas de 45°.
  // Ramenés dans ]−π, π] puis arrondis au millième, de façon IDEMPOTENTE (track/shared.js) ; absents (0) quand la décoration est droite, pour que les codes existants ne changent pas.
  if (isObstacle(deco.k)) {
    // Phase 3 : un obstacle peut être ROULÉ autour de son axe z (posé sur un mur, un plan incliné ou au plafond : son haut est la normale de la route). Multiples de 45° seulement
    // (la forme de contact tourne avec lui, voir obstacles.js : toLocalObs) ; l'inclinaison rx reste refusée.
    // (TECH-002 : normalizeRoll est idempotente : π reste π à chaque lecture du code ; voir track/shared.js)
    const r = normalizeRoll(+d.rz);
    if (r) deco.rz = r;
  } else if (!solid) {
    for (const a of ['rx', 'rz']) {
      const r = normalizeAngle(+d[a]);
      if (r) deco[a] = r;
    }
  }
  // Couleur personnalisée (#rrggbb) : prend le pas sur l'index de couleur c.
  if (typeof d.cc === 'string' && HEX.test(d.cc)) deco.cc = d.cc.toLowerCase();
  // Pièce perso : ses formes voyagent avec la décoration ; jamais vide (au plus MAX_CUSTOM_DECOS par circuit : Track.addDeco).
  if (deco.k === 'custom') {
    deco.cp = sanitizeDecoParts(d.cp);
    if (!deco.cp.length) return null;
  }
  return deco;
}

export const editMethods = {
  // Revêtement (avec paramètre en %). Renvoie true si quelque chose a changé.
  setSurface(tile, s, p = 0) {
    if (!surfaceAllowed(tile.t, s, tile.o)) return false;
    const S2 = SURFACES[s];
    const np = S2 && S2.def != null ? Math.max(S2.min, Math.min(S2.max, p || S2.def)) : 0;
    if (tile.s === s && (tile.p || 0) === np) return false;
    tile.s = s; tile.p = np;
    this.version++;
    return true;
  },

  // Bascule un drapeau (v : à l'envers, nb : sans bordures, tn : tunnel, mv : mouvement 1/2/3, cp : checkpoint 1/2, th : thème).
  toggleFlag(tile, flag, val = 1) {
    // Orientation : val 1 = mur gauche, 2 = mur droit (même valeur : retour au sol) ; val 0 = retour au sol (aussi depuis le plafond).
    if (flag === 'o') {
      const target = val | 0;
      if (target && !flagAllowed(tile.t, 'o', null, target)) return false;      // seul le type compte : le plafond, le tunnel, etc. sont retirés (le dernier choix l'emporte)
      const cand = { ...tile };
      if (!target || tile.o === target) { cand.o = 0; if (!target) cand.v = 0; }
      else { cand.o = target; clearConflicts(cand, 'o'); }
      return this._reshape(tile, cand);
    }
    if (!flagAllowed(tile.t, flag, tile, val)) return false;
    if (flag === 'th') {
      const th = tile.th === val ? 0 : val;
      if (!THEMES.some((h) => h.id === th)) return false;
      tile.th = th;
      this.version++;
      return true;
    }
    if (flag === 'eb') {      // 0.9.69 : bordures d'une plaque (toutes ↔ aucune ; bord par bord : setEdges)
      tile.eb = tile.eb ? 0 : val & plateAllEdges(PIECES[tile.t]);
      this.version++;
      return true;
    }
    if (flag === 'gs') {      // style du portique (visuel, comme le thème)
      tile.gs = tile.gs === val ? 0 : val;
      this.version++;
      return true;
    }
    // Ces options changent les cases ou les niveaux occupés (mouvement, checkpoint, anneau, orientation, plafond) : on vérifie la place
    // (et qu'une pièce à l'envers ne sort pas du sol), puis on réindexe.
    if (flag === 'mv' || flag === 'cp' || flag === 'tb' || flag === 'v') {
      const cand = { ...tile };
      if (flag === 'mv') { cand.mv = tile.mv === val ? 0 : val; cand.ms = 0; cand.ma = 0; }     // (flagAllowed a déjà refusé le cas d'un checkpoint ou d'un anneau)
      else if (flag === 'cp') { cand.cp = tile.cp === val ? 0 : val; }
      else if (flag === 'tb') { cand.tb = tile.tb ? 0 : 1; }
      else if (tile.v) cand.v = 0;
      else { cand.v = 1; clearConflicts(cand, 'v'); }
      return this._reshape(tile, cand);
    }
    tile[flag] = tile[flag] ? 0 : 1;
    this.version++;
    return true;
  },

  // Remplace `tile` par `cand` (normalisée : options devenues impossibles retirées, revêtement incompatible effacé) si la place et les niveaux
  // le permettent ; sinon rien ne change. Même objet : la sélection de l'inspecteur reste valable.
  // Phase 8 (TECH-052) : dans l'éditeur, la garde de placement (placementGuard, js/placement.js) a aussi son mot à dire : débordement d'une pente posée au mur,
  // départ unique, niveaux de l'éditeur. Hors de l'éditeur (course, serveur) elle est absente (null) : rien ne change.
  _reshape(tile, cand) {
    const n = Track.normalize(cand);
    if (this.placementGuard && !this.placementGuard(n, tile)) return false;
    this.remove(tile);
    if (this.conflicts(n).length || !Track.inBounds(n)) { this._insert(tile); return false; }
    Object.assign(tile, n);
    this._insert(tile);
    return true;
  },

  // Réglage d'une pièce mobile (vitesse en %, amplitude). Change les cases / niveaux balayés : vérifie la place.
  setMover(tile, ms, ma) {
    if (!tile.mv) return false;
    const m = clampMover(tile.mv, ms === undefined ? tile.ms : ms, ma === undefined ? tile.ma : ma);
    if (m.ms === (tile.ms || 0) && m.ma === (tile.ma || 0)) return true;
    const cand = { ...tile, ms: m.ms, ma: m.ma };
    if (this.placementGuard && !this.placementGuard(Track.normalize(cand), tile)) return false;      // (phase 8 : garde de l'éditeur, voir _reshape)
    this.remove(tile);
    if (this.conflicts(cand).length || !Track.inBounds(cand)) { this._insert(tile); return false; }
    tile.ms = m.ms; tile.ma = m.ma;
    this._insert(tile);
    return true;
  },

  // Couleurs personnalisées { road, line, rail } (null / {} : couleurs d'origine).
  setColors(tile, col) {
    tile.col = cleanColors(col);
    this.version++;
    return true;
  },

  // 2e revêtement d'une bifurcation (voie déportée).
  setSurface2(tile, s, p = 0) {
    if (PIECES[tile.t].kind !== 'fork') return false;
    if (s && s !== '-' && !surfaceAllowed(tile.t, s, tile.o)) return false;
    const S2 = SURFACES[s];
    const np = S2 && S2.def != null ? Math.max(S2.min, Math.min(S2.max, p || S2.def)) : 0;
    if ((tile.s2 || '') === s && (tile.p2 || 0) === np) return false;
    tile.s2 = s; tile.p2 = np;
    this.version++;
    return true;
  },

  // 0.9.69 : bordures d'une plaque, bord par bord (masque de bits, voir pieces.js plateEdges). Renvoie true si quelque chose a changé.
  setEdges(tile, mask) {
    const P = PIECES[tile.t];
    if (!P || P.kind !== 'area') return false;
    const m = (mask | 0) & plateAllEdges(P);
    if ((tile.eb | 0) === m) return false;
    tile.eb = m;
    this.version++;
    return true;
  },

  // Ajoute une décoration, NORMALISÉE (normalizeDeco, plus haut) ; null si elle est refusée (limite de MAX_DECOS, de pièces perso, kind inconnu, position illisible).
  // exact : circuits GÉNÉRÉS seulement (circuits officiels, scriptTrack) — valeurs gardées à la précision du calcul (voir normalizeDeco).
  addDeco(d, { exact = false } = {}) {
    if (this.decos.length >= MAX_DECOS) return null;
    const deco = normalizeDeco(d, { exact });
    if (!deco) return null;
    if (deco.k === 'custom' && this.decos.filter((o) => o.k === 'custom').length >= MAX_CUSTOM_DECOS) return null;
    this.decos.push(deco);
    this.version++;
    return deco;
  },

  // Phase 8 (TECH-035) : LA façon de modifier une décoration posée (inspecteur, gizmo, Maj + glisser, déplacement / rotation / niveau d'une sélection, calques) : la
  // décoration modifiée est renormalisée comme à l'ajout, puis recopiée dans le MÊME objet (la sélection de l'inspecteur reste valable) ; un champ que la normalisation
  // retire (inclinaison d'un solide, roulis nul, couleur libre effacée…) disparaît. Faux si la décoration modifiée serait refusée (position illisible…) : rien ne change.
  // Avant, ces chemins écrivaient les valeurs brutes (d.rx = …) : l'instantané d'historique les gardait, la restauration les normalisait ; après annuler / rétablir le
  // circuit n'égalait plus l'instantané (pas fantôme, pile « rétablir » effacée, circuit enregistré « modifié »), et un solide incliné l'était dans l'éditeur seulement.
  setDeco(d, patch) {
    const n = normalizeDeco({ ...d, ...patch });
    if (!n) return false;
    if (JSON.stringify(n) === JSON.stringify(d)) return true;
    for (const k of Object.keys(d)) if (!(k in n)) delete d[k];
    Object.assign(d, n);
    this.version++;
    return true;
  },

  removeDeco(d) {
    const i = this.decos.indexOf(d);
    if (i < 0) return;
    this.decos.splice(i, 1);
    this.version++;
  },
};
