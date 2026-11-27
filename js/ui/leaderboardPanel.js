// Classement à onglets (Race Hub, fenêtre « 🏆 ») : chaque onglet est un FOURNISSEUR de données enregistré ici. Un onglet dont le fournisseur
// n'est pas disponible n'est pas affiché (jamais d'onglet vide ou factice). Amis, Secteurs et Saison (E15) demandent les étapes SQL 9 à 11 :
// sans elles, l'onglet dit qu'elles manquent, il ne montre pas de faux classement.
//
//   registerBoard({ id, label, order, available(desc, ctx), render(el, desc, ctx) })
//   mountLeaderboard(root, desc, ctx, { tab })  -> { tab, select(id), refresh(), boards }
// ctx : { app, onRival(row) (bouton 👻 d'une ligne), rivalOn(rank) (le rival est-il choisi ?), onChange() (après un envoi de record) }
import { esc, OFF } from '../dom.js';
import { online, ONLINE } from '../online.js';
import { PHYS_VER } from '../version.js';
import { getRecord, listRuns, formatTime } from '../storage.js';
import { medalFor } from '../medals.js';
import { medalIcon } from '../ui.js';
import { titleLabel } from '../rewards.js';
import { profile } from '../profile.js';
import { locale } from '../i18n.js';
import { personalRecord, finishVehicle } from '../trackDescriptor.js';
import { DT } from '../constants.js';            // les temps intermédiaires sont enregistrés en pas de simulation (raceLogic.js)
import { cpKind } from '../pieces.js';
import { DIVISIONS, seasonBounds } from '../seasons.js';
import { officialRuns, officialGhost, officialName, officialBadge, officialsInBoard, rivalAhead } from '../online/officials.js';

const BOARDS = [];
export function registerBoard(b) {
  const i = BOARDS.findIndex((x) => x.id === b.id);
  if (i >= 0) BOARDS.splice(i, 1);
  BOARDS.push(b);
  BOARDS.sort((x, y) => (x.order || 0) - (y.order || 0));
}
export const boardsFor = (desc, ctx) => BOARDS.filter((b) => b.available(desc, ctx));

export const VEHICLE_LABELS = { car: ['🚗', 'Voiture'], moto: ['🏍', 'Moto'], boat: ['⛵', 'Bateau'], glider: ['🪂', 'Deltaplane'] };
const vehCell = (v) => (v ? `<span class="lb-veh" title="${esc(VEHICLE_LABELS[v][1])}">${VEHICLE_LABELS[v][0]}</span>` : '<span class="lb-veh" title="Véhicule inconnu (temps d’avant l’enregistrement des fantômes)">—</span>');
const day = (d) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toLocaleDateString(locale()) : ''; };

export function mountLeaderboard(root, desc, ctx, { tab = null } = {}) {
  const boards = boardsFor(desc, ctx);
  root.innerHTML = '';
  root.classList.add('lb-panel');
  const tabs = document.createElement('div');
  tabs.className = 'tabs lb-tabs';
  tabs.setAttribute('role', 'tablist');
  const body = document.createElement('div');
  body.className = 'lb-body';
  body.setAttribute('role', 'tabpanel');
  root.append(tabs, body);
  const api = { tab: null, boards };
  api.select = (id) => {
    const b = boards.find((x) => x.id === id) || boards[0];
    if (!b) { body.innerHTML = '<p class="meta">Aucun classement pour ce circuit.</p>'; return; }
    api.tab = b.id;
    for (const t of tabs.children) { const on = t.dataset.tab === b.id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); }
    b.render(body, desc, ctx);
  };
  api.refresh = () => api.select(api.tab);
  for (const b of boards) {
    const t = document.createElement('button');
    t.className = 'tab'; t.dataset.tab = b.id; t.textContent = b.label; t.setAttribute('role', 'tab');
    t.addEventListener('click', () => { if (ctx.app) ctx.app.audio.click(); api.select(b.id); });
    tabs.appendChild(t);
  }
  tabs.classList.toggle('hidden', boards.length < 2);
  api.select(tab);
  return api;
}

// ---- Mondial : classement vérifié par le serveur (submit-score rejoue chaque course) --------------------------------------------------
const onlineConfigured = () => !!(ONLINE && ONLINE.url && ONLINE.key);
// Seuls les circuits à clé de classement en ligne : intégrés, défi du jour, circuits de joueur.
const rankedKey = (desc) => !!desc.key && /^(b-|daily-|u-)/.test(desc.key);

// Clé de rival (bouton 👻) d'une ligne : le rang pour le top 10 (comme avant), « o:source:niveau » pour une amorce officielle, « p:place » pour un joueur plus bas.
export const rivalKey = (row, rank) => (row && row.official ? `o:${row.source}:${row.level}` : rank);
// Le fantôme d'une ligne (bouton 👻) : amorce officielle, rival juste devant (déjà téléchargé), ou n° rank du classement (get_ghost, top 10).
export async function rivalGhost(desc, row, rank) {
  if (row && row.official) return officialGhost(desc.key, row.source, row.level, PHYS_VER);
  if (row && row.ahead) return row.ghost ? { name: row.name, time: row.time, ghost: row.ghost, veh: row.veh || [] } : null;
  return online.ghost(desc.key, rank, PHYS_VER);
}
// Libellé d'un rival choisi (puce, Theater) : « 3. Ana » pour un rang du classement, le nom seul sinon (une amorce dit déjà « Officiel »).
export const rivalLabel = (key, g) => (typeof key === 'number' ? `${key}. ${g.name}` : g.name);

const placeText = (n) => `place ${n}`;
// Ligne « rival juste devant » (COMPLETE-010) : d'abord un vrai joueur, à défaut l'amorce officielle immédiatement plus rapide ; sans temps, l'amorce la plus lente.
function aheadHtml(r, ctx) {
  if (!r) return '<span>🏆 Personne devant toi : ni joueur, ni amorce officielle.</span>';
  const head = r.first ? '<span>🎯 Pour commencer :</span>' : '<span>🎯 Juste devant toi :</span>';
  const who = r.kind === 'player' ? `<b class="lb-name"${OFF}>${esc(r.name)}</b>${r.place ? ` <small class="meta">${placeText(r.place)}</small>` : ''}` : `<b>${esc(r.name)}</b>`;
  const key = r.kind === 'player' ? (r.place && r.place <= 10 ? r.place : `p:${r.place}`) : rivalKey(r.row);
  const on = ctx.rivalOn ? ctx.rivalOn(key) : false;
  const can = ctx.onRival && (r.kind === 'official' ? r.row.has_ghost : !!r.ghost);
  return `${head} ${who} <em>${formatTime(r.time)}</em>${can ? ` <button class="btn rival-btn${on ? ' on' : ''}" data-ahead="1" aria-pressed="${on}" title="Affronter ce fantôme">👻</button>` : ''}`;
}

export function renderWorldBoard(el, desc, ctx) {
  const key = desc.key;
  el.innerHTML = '<p class="meta">Chargement du classement…</p>';
  const req = (el._lbReq = (el._lbReq || 0) + 1);
  (async () => {
    let lb, offs;
    try { [lb, offs] = await Promise.all([online.leaderboard(key, PHYS_VER, 10), officialRuns(key, PHYS_VER).catch(() => [])]); } catch (e) {
      if (req === el._lbReq) el.innerHTML = `<p class="lb-off">Classement indisponible : ${esc(String(e.message || 'hors ligne').replace(/[.\s]+$/, ''))}.</p><p class="meta">Le reste de la fiche marche sans réseau ; ton record local est dans l’onglet Personnel.</p>`;
      return;
    }
    if (req !== el._lbReq) return;
    const app = ctx.app;
    const rec = personalRecord(desc, getRecord);
    const canSend = rec && rec.inputs && rec.pv === PHYS_VER && (!lb.me || rec.time < lb.me.time - 1e-6) && (!app || app.settings.onlineScores !== false);
    // Amorces officielles (étape SQL 23) : glissées à leur temps parmi les joueurs, SANS numéro de place (hors classement), et seulement dans la partie montrée du classement.
    const shown = officialsInBoard(offs, lb.top, lb.total);
    const medals = desc.medals || (desc.official && desc.official.medals) || null;
    const items = [...lb.top.map((r, i) => ({ r, rank: i + 1, time: r.time })), ...shown.map((o) => ({ o, time: o.time }))].sort((x, y) => x.time - y.time || (x.o ? 1 : 0) - (y.o ? 1 : 0));
    const realRow = ({ r, rank }) => {
      const name = (r.players && r.players.name) || '—', ttl = r.players && titleLabel(r.players.title);
      const on = ctx.rivalOn ? ctx.rivalOn(rank) : false;
      return `<li class="${r.player === online.uid ? 'me' : ''}${rank <= 3 ? ' r' + rank : ''}"><b>${rank}</b><span class="lb-name"${OFF}>${esc(name)}${ttl ? ` <small class="ttl">${esc(ttl)}</small>` : ''}</span>
        ${vehCell(finishVehicle(r.ghost_veh, !!r.has_ghost))}<em>${formatTime(r.time)}</em><small class="lb-date">${day(r.updated_at)}</small>
        ${r.has_ghost && ctx.onRival ? `<button class="btn rival-btn${on ? ' on' : ''}" data-rank="${rank}" aria-pressed="${on}" title="Affronter le fantôme de ${esc(name)}">👻</button>` : '<span class="lb-noghost"></span>'}</li>`;
    };
    const offRow = ({ o }) => {
      const k = rivalKey(o), on = ctx.rivalOn ? ctx.rivalOn(k) : false, m = medals ? medalFor(o.time, medals) : null;
      return `<li class="lb-official"><b title="Hors classement">·</b><span class="lb-name"><span>${esc(officialName(o))}</span> <small class="ttl lb-official-tag">${esc(officialBadge(o))}</small></span>
        ${m ? `<span class="lb-veh">${medalIcon(m)}</span>` : vehCell(finishVehicle(o.ghost_veh, !!o.has_ghost))}<em>${formatTime(o.time)}</em><small class="lb-date">hors classement</small>
        ${o.has_ghost && ctx.onRival ? `<button class="btn rival-btn${on ? ' on' : ''}" data-off="${esc(o.source + ':' + o.level)}" aria-pressed="${on}" title="Affronter ce fantôme officiel">👻</button>` : '<span class="lb-noghost"></span>'}</li>`;
    };
    const rows = items.map((it) => (it.o ? offRow(it) : realRow(it))).join('');
    el.innerHTML = `${items.length ? `<ol class="board${shown.length ? ' with-off' : ''}">${rows}</ol>` : ''}${lb.top.length ? '' : shown.length ? '<p>Aucun joueur classé pour l’instant : sois le premier !</p>' : '<p>Aucun temps pour l’instant : sois le premier !</p>'}
      ${shown.length ? '<p class="meta lb-official-note">Les lignes « Officiel » sont des temps du pilote automatique du jeu (ou d’un testeur) : hors classement, elles ne prennent la place de personne et ne comptent ni dans les points, ni dans les divisions.</p>' : ''}
      <p class="lb-ahead hidden" role="status"></p>
      ${(lb.top.some((r) => r.has_ghost) || shown.some((o) => o.has_ghost)) && ctx.onRival ? '<p class="meta">👻 : affronte le fantôme d’un des dix premiers (sa course rejouée par le serveur ; seulement ses positions, jamais ses commandes).</p>' : ''}
      <p class="mp-err lb-err" role="alert"></p>
      <p class="meta">${lb.total} pilote${lb.total > 1 ? 's' : ''} classé${lb.total > 1 ? 's' : ''}${lb.me ? ` · ta place : <b>${lb.me.rank}${lb.me.rank === 1 ? 'er' : 'e'}</b> (${formatTime(lb.me.time)})` : ''}.
      Chaque temps est vérifié : le serveur rejoue la course avant de l’accepter.</p>
      ${canSend ? `<button class="btn primary lb-send">Envoyer mon record (${formatTime(rec.time)})</button>` : ''}`;
    const err = el.querySelector('.lb-err');
    const pick = async (b, row, rank) => {
      b.disabled = true; err.textContent = '';
      try { await ctx.onRival(row, rank, b); } catch (e) { err.textContent = e.message || 'Fantôme indisponible.'; }
      b.disabled = false;
    };
    for (const b of el.querySelectorAll('.rival-btn[data-rank]')) b.onclick = () => pick(b, lb.top[+b.dataset.rank - 1], +b.dataset.rank);
    for (const b of el.querySelectorAll('.rival-btn[data-off]')) b.onclick = () => { const o = shown.find((x) => x.source + ':' + x.level === b.dataset.off); pick(b, o, rivalKey(o)); };
    // Rival juste devant : mon temps en ligne, sinon mon record local de cette physique ; sans temps, l'amorce la plus lente pour commencer.
    const box = el.querySelector('.lb-ahead');
    const myTime = lb.me ? lb.me.time : rec && rec.pv === PHYS_VER ? rec.time : null;
    if (box && (offs.length || myTime > 0)) {
      rivalAhead(key, PHYS_VER, myTime).then((r) => {
        if (req !== el._lbReq || !document.body.contains(box)) return;
        if (!r && !offs.length && !lb.top.length) return;
        box.innerHTML = aheadHtml(r, ctx);
        box.classList.remove('hidden');
        const b = box.querySelector('[data-ahead]');
        if (b && r) b.onclick = () => (r.kind === 'player'
          ? pick(b, { ahead: true, name: r.name, time: r.time, ghost: r.ghost, veh: r.veh, place: r.place }, r.place && r.place <= 10 ? r.place : `p:${r.place}`)
          : pick(b, r.row, rivalKey(r.row)));
      }).catch(() => { /* hors ligne : pas de ligne « juste devant » */ });
    }
    const send = el.querySelector('.lb-send');
    if (send) send.onclick = async () => {
      send.disabled = true; send.textContent = 'Vérification…';
      try {
        if (profile().title) online.setTitle(profile().title).catch(() => { /* sans l'étape 8 : le titre reste local */ });
        if (desc.chain) {      // enchaînement « chapitre d'une traite » (COMPLETE-014) : les 6 manches du record, rejouées par le serveur (action submit-chain)
          const sub = app && app.chainSubmissionOf(key);
          if (!sub) throw new Error('Ce record n’a plus ses commandes : refais l’enchaînement.');
          await online.submitChain(sub, app.settings.playerName);
        } else await online.submitScore({ trackKey: key, code: key.startsWith('u-') ? (desc.official || desc).track.encode() : '', inputs: rec.inputs, time: rec.time, physVer: PHYS_VER }, app ? app.settings.playerName : '');
        renderWorldBoard(el, desc, ctx);
        if (ctx.onChange) ctx.onChange();
      } catch (e) { send.textContent = e.message; }
    };
  })();
}

registerBoard({ id: 'world', label: '🌍 Mondial', order: 10, available: (desc) => onlineConfigured() && rankedKey(desc), render: renderWorldBoard });

// ---- Personnel : mon record (temps intermédiaires) et mes dernières courses, sur cet appareil et le compte ---------------------------------
export function renderPersonalBoard(el, desc) {
  const rec = personalRecord(desc, getRecord);
  const runs = desc.key ? listRuns(desc.key) : [];
  const m = (t) => (desc.medals ? medalIcon(medalFor(t, desc.medals)) : '');
  const splits = rec && Array.isArray(rec.splits) && rec.splits.length ? rec.splits : null;
  el.innerHTML = `${rec ? `<div class="lb-pb"><span class="meta">Mon record</span><b>${m(rec.time)} ${formatTime(rec.time)}</b>${rec.date ? `<small class="lb-date">${day(rec.date)}</small>` : ''}</div>` : '<p>Pas encore de temps sur ce circuit.</p>'}
    ${splits ? `<div class="lb-splits"><span class="meta">Temps intermédiaires du record</span><ol>${splits.map((t, i) => `<li><span>CP ${i + 1}</span><em>${formatTime(t * DT)}</em></li>`).join('')}</ol></div>` : ''}
    ${runs.length ? `<div class="lb-runs"><span class="meta">${runs.length > 1 ? `Mes ${runs.length} dernières courses` : 'Ma dernière course'}</span><ol class="board">${runs.map((r) => `<li class="${rec && Math.abs(r.time - rec.time) < 1e-9 ? 'me' : ''}"><span>${m(r.time)}</span><em>${formatTime(r.time)}</em><small class="lb-date">${day(r.date)}</small></li>`).join('')}</ol></div>` : ''}`;
}

registerBoard({ id: 'personal', label: '👤 Personnel', order: 20, available: (desc) => !!desc.key, render: renderPersonalBoard });

// ---- Amis (E15, supabase/etape10-social.sql) : le classement entre amis, comptes seulement ---------------------------------------------
const offline = (e) => `<p class="lb-off">Classement indisponible : ${esc(String((e && e.message) || 'hors ligne').replace(/[.\s]+$/, ''))}.</p>`;
export function renderFriendsBoard(el, desc) {
  el.innerHTML = '<p class="meta">Chargement…</p>';
  const req = (el._lbReq = (el._lbReq || 0) + 1);
  (async () => {
    let rows;
    try { rows = await online.friendsBoard(desc.key, PHYS_VER, 20); } catch (e) { if (req === el._lbReq) el.innerHTML = offline(e); return; }
    if (req !== el._lbReq) return;
    el.innerHTML = `${rows.length ? `<ol class="board">${rows.map((r) => `<li class="${r.player === online.uid ? 'me' : ''}"><b>${r.rank}</b><span class="lb-name"${OFF}>${esc(r.name || '—')}</span><em>${formatTime(r.time)}</em><small class="lb-date">${day(r.updated_at)}</small></li>`).join('')}</ol>` : '<p>Ni toi ni tes amis n’avez de temps sur ce circuit.</p>'}
      <p class="meta">${rows.length <= 1 ? 'Ajoute des amis dans <b>Multijoueur › Amis</b> pour comparer vos temps. ' : ''}Mêmes temps vérifiés que le classement mondial.</p>`;
  })();
}
registerBoard({ id: 'friends', label: '👥 Amis', order: 12, available: (desc) => onlineConfigured() && rankedKey(desc) && online.kind === 'account', render: renderFriendsBoard });

// ---- Secteurs (E15, etape9-secteurs.sql) : meilleurs secteurs parmi les records ------------------------------------------------------
// Un secteur va d'un passage (checkpoint, ou ligne d'un tour) au suivant : il y en a (checkpoints + 1) × tours.
export const sectorCount = (track) => (track.tiles.filter((t) => cpKind(t)).length + 1) * Math.max(1, track.laps || 1);
const sectorOf = (splits, time, i) => {           // en pas ; null si les temps intermédiaires manquent
  if (!Array.isArray(splits) || i < 1 || i > splits.length + 1) return null;
  const end = i <= splits.length ? splits[i - 1] : Math.round(time / DT), start = i === 1 ? 0 : splits[i - 2];
  return end - start;
};
export function renderSectorBoard(el, desc) {
  const n = sectorCount(desc.track), rec = personalRecord(desc, getRecord);
  if (el._sector == null || el._sector > n) el._sector = 1;
  const draw = () => {
    const i = el._sector, mine = rec ? sectorOf(rec.splits, rec.time, i) : null;
    el.innerHTML = `<div class="lb-sectors" role="radiogroup" aria-label="Secteur">${Array.from({ length: n }, (_, k) => `<button class="chip${k + 1 === i ? ' on' : ''}" role="radio" aria-checked="${k + 1 === i}" data-sector="${k + 1}">S${k + 1}</button>`).join('')}</div>
      <div class="lb-sector-body"><p class="meta">Chargement…</p></div>`;
    for (const b of el.querySelectorAll('[data-sector]')) b.onclick = () => { el._sector = +b.dataset.sector; draw(); };
    const body = el.querySelector('.lb-sector-body'), req = (el._lbReq = (el._lbReq || 0) + 1);
    (async () => {
      let rows;
      try { rows = await online.sectorBoard(desc.key, PHYS_VER, i, 10); } catch (e) { if (req === el._lbReq) body.innerHTML = offline(e); return; }
      if (req !== el._lbReq) return;
      body.innerHTML = `${rows.length ? `<ol class="board">${rows.map((r) => `<li class="${r.player === online.uid ? 'me' : ''}"><b>${r.rank}</b><span class="lb-name"${OFF}>${esc(r.name || '—')}</span><em>${formatTime(r.sector_steps * DT)}</em><small class="lb-date">🏁 ${formatTime(r.time)}</small></li>`).join('')}</ol>` : '<p>Pas encore de secteur enregistré pour ce circuit.</p>'}
        <p class="meta">${i === 1 ? 'Du départ au premier passage' : i === n ? 'Du dernier passage à l’arrivée' : `Du passage ${i - 1} au passage ${i}`}${mine != null ? ` · mon record : <b>${formatTime(mine * DT)}</b>` : ''}. Ce sont les secteurs des records vérifiés.</p>`;
    })();
  };
  draw();
}
registerBoard({ id: 'sectors', label: '⏱ Secteurs', order: 15, available: (desc) => onlineConfigured() && rankedKey(desc) && !!desc.track, render: renderSectorBoard });

// ---- Saison (E15, etape11-saisons.sql) : le classement de la semaine (points sur ses trois circuits) et ma division ------------------
export function renderSeasonBoard(el, desc, ctx = {}) {
  const n = desc.season;
  el.innerHTML = '<p class="meta">Chargement…</p>';
  const req = (el._lbReq = (el._lbReq || 0) + 1);
  (async () => {
    let rows, me = null, offs = [];
    try {
      [rows, offs] = await Promise.all([online.seasonStandings(n, 20), officialRuns(desc.key, PHYS_VER).catch(() => [])]);
      if (online.uid) me = await online.mySeason(n).catch(() => null);
    } catch (e) { if (req === el._lbReq) el.innerHTML = offline(e); return; }
    if (req !== el._lbReq) return;
    const ends = new Date(seasonBounds(n).ends - 1);
    el.innerHTML = `${me ? `<p class="lb-season-me"><span>Division <b>${me.division} · ${esc(DIVISIONS[me.division])}</b></span> <span>· ${me.points} points</span>${me.rank ? ` <span>· ${me.rank}${me.rank === 1 ? 'er' : 'e'} sur ${me.in_division}</span>` : ''}${me.closed ? ` <span>${me.moved < 0 ? '· ⬆ montée' : me.moved > 0 ? '· ⬇ descente' : '· maintien'}</span>` : ''}</p>` : ''}
      ${rows.length ? `<ol class="board">${rows.map((r) => `<li class="${r.player === online.uid ? 'me' : ''}"><b>${r.rank}</b><span class="lb-name"${OFF}>${esc(r.name || '—')} <small class="ttl">D${r.division}</small></span><em>${r.points} pts</em><small class="lb-date">${r.tracks} / 3</small></li>`).join('')}</ol>` : '<p>Personne n’a encore couru cette saison.</p>'}
      <p class="meta">Saison ${n}, jusqu’au ${ends.getUTCDate()}/${ends.getUTCMonth() + 1} (UTC). Sur chacun des trois circuits : 1000 × meilleur temps ÷ ton temps. À la fin de la semaine, les 20 % premiers de chaque division montent, les 20 % derniers descendent.</p>
      ${offs.length ? `<div class="lb-season-off"><p><b>Contre un fantôme officiel</b> <small class="meta">(entraînement : hors classement de la saison)</small></p>
        <ol class="board with-off">${offs.map((o) => { const k = rivalKey(o), on = ctx.rivalOn ? ctx.rivalOn(k) : false; return `<li class="lb-official"><b title="Hors classement">·</b><span class="lb-name"><span>${esc(officialName(o))}</span></span><span class="lb-veh"></span><em>${formatTime(o.time)}</em><small class="lb-date">hors classement</small>${o.has_ghost && ctx.onRival ? `<button class="btn rival-btn${on ? ' on' : ''}" data-off="${esc(o.source + ':' + o.level)}" aria-pressed="${on}" title="Affronter ce fantôme officiel">👻</button>` : '<span class="lb-noghost"></span>'}</li>`; }).join('')}</ol>
        <p class="meta">Les amorces officielles ne comptent ni dans les points ni dans les divisions : seuls les temps des joueurs, rejoués par le serveur, comptent.</p><p class="mp-err lb-err" role="alert"></p></div>` : ''}`;
    const err = el.querySelector('.lb-season-off .lb-err');
    for (const b of el.querySelectorAll('.lb-season-off .rival-btn[data-off]')) b.onclick = async () => {
      const o = offs.find((x) => x.source + ':' + x.level === b.dataset.off);
      b.disabled = true; err.textContent = '';
      try { await ctx.onRival(o, rivalKey(o), b); } catch (e) { err.textContent = e.message || 'Fantôme indisponible.'; }
      b.disabled = false;
    };
  })();
}
registerBoard({ id: 'season', label: '📅 Saison', order: 5, available: (desc) => onlineConfigured() && desc.season > 0, render: renderSeasonBoard });
