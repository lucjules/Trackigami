// Collisions douces entre voitures (manche multijoueur, option « collisions ») : chaque voiture est un disque de rayon CAR_R ; deux voitures qui se
// chevauchent se repoussent. Aucun serveur, aucun arbitre : CHAQUE joueur applique SA moitié du choc à SA voiture, à partir de la position (interpolée) que
// l'autre affiche. Le résultat est symétrique à quelques centimètres près ; la variation de vitesse par pas est plafonnée (voir softCollide), une voiture qui vient
// d'apparaître (retour au checkpoint), qui a fini ou dont les paquets n'arrivent plus ne bouscule personne et n'est pas bousculée.
// Ce n'est PAS de la physique rejouable : ni records, ni classements en ligne en manche (le chrono multijoueur n'est jamais vérifié par le serveur).
//
// Collisions UNIFIÉES (E16) : la voiture de l'autre est affichée telle qu'elle était il y a ~100 ms (interpolation) plus une demi-latence. Comparer
// SA voiture d'aujourd'hui à cette position d'hier faisait voir le contact à des instants différents des deux côtés (l'un se cognait à une voiture
// fantôme, l'autre passait au travers). presentState ramène l'autre AU MÊME INSTANT (position + vitesse × retard) : les deux joueurs voient le même
// contact, au même moment, et chacun applique sa moitié.

export const CAR_R = 1.15;               // m : demi-largeur d'une voiture + marge
export const REACH_Y = 1.8;              // m : au-delà de cet écart de hauteur, on passe au-dessus / en dessous (pont, looping)
export const RESTITUTION = 0.35;
export const MAX_DV_STEP = 0.32;         // m/s : poussée de séparation (chevauchement) au plus par pas de 1/120 s (≈ 38 m/s², environ 4 g)
export const MAX_DV_TOTAL = 2.5;         // m/s : variation de vitesse TOTALE due aux collisions par pas, toutes voitures confondues (300 m/s², ≈ 31 g ; TECH-041)
export const MAX_IMPULSE = 30;           // m/s : impulsion de choc au plus par contact (un contact dure tant que les deux disques se chevauchent)
export const MAX_NET_SPEED = 150;        // m/s : vitesse horizontale d'une autre voiture au-delà de laquelle son paquet est aberrant (le jeu plafonne vers 95 m/s)
export const SEP_SPEED = 1;              // m/s : on ne pousse plus deux voitures qui s'écartent déjà au moins à cette vitesse
export const MAX_SHIFT_STEP = 0.05;      // m de déplacement de correction au plus par pas
export const CONTACT_SLACK = 0.6;        // m : un contact commencé dure tant que les disques sont à moins de cette distance (l'échange se termine même si le chevauchement cesse)
export const PROTECT_S = 2.0;            // s de protection après un retour au checkpoint
export const MAX_LEAD_S = 0.25;          // s : au-delà, on n'extrapole plus (paquets perdus : la voiture affichée s'arrête de toute façon)

// État de l'autre voiture ramené à l'instant présent : leadS = retard de l'affichage (interpolation + demi-latence), en secondes.
export function presentState(o, leadS) {
  const l = Math.max(0, Math.min(MAX_LEAD_S, +leadS || 0));
  return { pos: { x: o.pos.x + o.vel.x * l, y: o.pos.y + o.vel.y * l, z: o.pos.z + o.vel.z * l }, vel: o.vel };
}

// Le choc (TECH-041). Avant : par voiture en contact et PAR PAS, notre moitié de l'impulsion (jusqu'à 8 m/s) recalculée contre la vitesse AFFICHÉE de l'autre, qui ne
// montre sa propre réaction que 100 ms plus tard (interpolation) : chacun appliquait sa moitié plusieurs fois (échange doublé : 40 → 30 m/s donnait 30 / 40 au lieu de
// 33 / 37 ; face-à-face 2 × 20 m/s : rebond de ± 22 au lieu de ± 7), et les contacts s'additionnaient (sept voitures : 43 m/s en un pas).
// Maintenant, par CONTACT (memo : un état par voiture tant que les disques se chevauchent) :
//   - la vitesse d'approche du début du contact fixe la vitesse de séparation visée (restitution) ;
//   - chacun suppose que l'autre reçoit la même impulsion que lui, en sens contraire (règle symétrique), tant qu'il ne la voit pas : la vitesse de l'autre utilisée est
//     sa vitesse affichée diminuée de la part de sa réaction pas encore visible. L'impulsion s'arrête quand la séparation visée est atteinte : rien n'est appliqué deux fois ;
//   - un contact commencé dure tant que les disques restent à moins de CONTACT_SLACK l'un de l'autre (sans poussée hors du chevauchement) : sous le plafond par
//     pas, l'échange se termine même quand le chevauchement est bref ;
//   - impulsion par contact plafonnée (MAX_IMPULSE), poussée de séparation seulement si les deux voitures ne s'écartent pas déjà (SEP_SPEED) ;
//   - plafond GLOBAL par pas (MAX_DV_TOTAL, toutes voitures confondues) ; vitesse de l'autre au-delà de MAX_NET_SPEED : contact ignoré (paquet aberrant).
// Sans memo (ou sans id), chaque pas est un contact neuf : l'impulsion est recalculée à chaque pas, toujours sous le plafond global.
// À plus de 2 × 30 m/s d'approche (face-à-face à pleine vitesse), le plafond par pas ne suffit plus à arrêter les voitures dans le chevauchement : elles se traversent
// en perdant la même vitesse (au plus quelques m/s), au lieu d'être renvoyées.

// self : { pos, vel } (modifié) ; others : [{ id?, pos, vel }] déjà filtrés (vivants, ni arrivés ni téléportés à l'instant) ; memo : Map gardée par l'appelant d'un pas à
// l'autre (contacts en cours). Renvoie le nombre de contacts.
export function softCollide(self, others, { radius = CAR_R, reachY = REACH_Y, memo = null } = {}) {
  let hits = 0, dvx = 0, dvz = 0, sx = 0, sz = 0;
  const min = radius * 2, used = [], seen = memo ? new Set() : null;
  for (const o of others) {
    const key = o.id != null ? o.id : null;
    const prev = memo && key != null ? memo.get(key) : null, far = prev ? min + CONTACT_SLACK : min;      // (un contact en cours se suit un peu au-delà du chevauchement)
    const dx = self.pos.x - o.pos.x, dz = self.pos.z - o.pos.z, dy = self.pos.y - o.pos.y;
    if (Math.abs(dy) > reachY || Math.abs(dx) >= far || Math.abs(dz) >= far) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 >= far * far) continue;
    const ovx = +o.vel.x, ovz = +o.vel.z;
    if (!(Math.hypot(ovx, ovz) <= MAX_NET_SPEED)) continue;            // vitesse aberrante (ou NaN) : on ne croit pas ce contact
    let d = Math.sqrt(d2), nx, nz;
    if (d < 1e-4) {                       // exactement superposées (départ identique) : on se sépare selon sa propre vitesse, à défaut selon l'axe x
      const sp = Math.hypot(self.vel.x, self.vel.z);
      nx = sp > 0.5 ? -self.vel.z / sp : 1; nz = sp > 0.5 ? self.vel.x / sp : 0; d = 0;
    } else { nx = dx / d; nz = dz / d; }
    const pen = Math.max(0, min - d);
    // Vitesses le long de la normale (qui va de l'autre vers nous) : sn la nôtre, on la sienne ; sn − on < 0 : on se rapproche.
    const sn = self.vel.x * nx + self.vel.z * nz, on = ovx * nx + ovz * nz;
    let c = prev;
    if (c && c.nx * nx + c.nz * nz < 0) c = null;                      // les voitures se sont traversées : c'est un autre contact
    if (!c && pen <= 0) continue;                                     // (un contact ne commence qu'au chevauchement)
    if (!c) { c = { nx, nz, rv0: sn - on, on0: on, given: 0, imp: 0 }; if (memo && key != null) memo.set(key, c); }
    if (seen && key != null) seen.add(key);
    // Sa réaction pas encore visible : ce que je me suis donné, moins ce que sa vitesse affichée montre déjà de recul (on0 − on).
    const unseen = Math.max(0, c.given - Math.max(0, c.on0 - on));
    const rv = sn - (on - unseen);
    const target = RESTITUTION * Math.max(0, -c.rv0);                  // vitesse de séparation visée
    const j = Math.min(Math.max(0, (target - rv) / 2), Math.max(0, MAX_IMPULSE - c.imp));
    const push = rv < SEP_SPEED ? Math.min(MAX_DV_STEP, pen * 1.2) : 0;
    dvx += nx * (j + push); dvz += nz * (j + push); used.push([c, j, push]);
    const sh = Math.min(MAX_SHIFT_STEP, pen * 0.5);
    sx += nx * sh; sz += nz * sh;
    hits++;
  }
  if (memo) for (const k of [...memo.keys()]) if (!seen.has(k)) memo.delete(k);       // contacts terminés
  if (!hits) return 0;
  const m = Math.hypot(dvx, dvz), k = m > MAX_DV_TOTAL ? MAX_DV_TOTAL / m : 1;
  self.vel.x += dvx * k; self.vel.z += dvz * k;
  for (const [c, j, push] of used) { c.imp += j * k; c.given += (j + push) * k; }
  const sl = Math.hypot(sx, sz), ks = sl > MAX_SHIFT_STEP ? MAX_SHIFT_STEP / sl : 1;
  self.pos.x += sx * ks; self.pos.z += sz * ks;
  return hits;
}
