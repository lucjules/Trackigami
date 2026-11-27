// Compétition asynchrone (Trackigami Evolution, E17) : duels classés entre amis (Elo) et tournois privés. Tout se joue sur des circuits de la carrière,
// sous des catégories de record « …~v1.duel-N » et « …~v1.tour-N » (variants.js) : la course est rejouée par le serveur comme toute autre, et les
// résultats, le classement Elo et la clôture sont calculés en base (supabase/etape12-competition.sql). Ces méthodes s'ajoutent au prototype de App.
import { esc, OFF } from '../dom.js';
import { online } from '../online.js';
import { formatTime } from '../storage.js';
import { locale } from '../i18n.js';
import { describeVariant } from '../trackDescriptor.js';
import { officialGhost, OFFICIAL_LEVELS } from '../online/officials.js';
import { PHYS_VER } from '../version.js';

const when = (d) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };

export const competitionMethods = {
  async competitionMenu() {
    const body = document.createElement('div');
    body.className = 'competition';
    this.ui.modal({ title: '⚔ Compétition', body, actions: [{ label: 'Fermer', primary: true }] });
    // Contre un fantôme officiel (COMPLETE-010) : pour tout le monde, compte ou non, même seul en ligne. Un entraînement : ni Elo, ni division, ni classement à part.
    const official = this._officialDuelSection();
    if (this.identity.kind !== 'account') {
      body.innerHTML = '<p>Les duels et les tournois demandent un <b>compte</b> : leurs résultats et le classement Elo sont gardés en ligne.</p>';
      body.prepend(official);
      return;
    }
    body.innerHTML = '<p class="meta">Chargement…</p>';
    let duels, tours, ratings, friends;
    try { [duels, tours, ratings, friends] = await Promise.all([online.duels(), online.tournaments(), online.friendsRatings(), online.friends()]); }
    catch (e) { body.innerHTML = `<p class="lb-off">Compétition indisponible : ${esc(e.message)}</p>`; body.prepend(official); return; }
    if (!document.body.contains(body)) return;
    const me = ratings.find((r) => r.player === online.uid);
    const okFriends = friends.filter((f) => f.status === 'accepted');
    const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
    const tracks = this.builtins.filter((b) => b.def.decor !== 'atelier').map((b) => opt(b.key, b.def.name)).join('');
    // Le nom du circuit : celui de la carrière (traduit avec le reste du jeu), sinon celui rangé avec le duel.
    const tname = (key, fallback) => { const b = this.builtins.find((x) => x.key === key); return b ? b.def.name : fallback || key; };
    const duelRow = (d) => {
      const head = `<b>${esc(d.opponent_name)}</b> · <span>${esc(tname(d.track_key, d.track_name))}</span>`;
      const until = d.status === 'pending' && !d.mine ? `te défie, jusqu’au ${when(d.ends_at)}` : `${d.status === 'pending' ? 'en attente de sa réponse · ' : ''}jusqu’au ${when(d.ends_at)}${d.my_time ? ` · mon temps : ${formatTime(d.my_time)}` : ''}`;
      if (d.status === 'pending' && !d.mine) return `<li>${head} <small class="meta">${until}</small> <button class="btn small primary" data-duel-yes="${d.id}">Accepter</button><button class="btn small" data-duel-no="${d.id}">Refuser</button></li>`;
      if (d.status === 'pending' || d.status === 'accepted') return `<li>${head} <small class="meta">${until}</small> <button class="btn small primary" data-duel-play="${d.id}">Jouer</button></li>`;
      if (d.status === 'settled') return `<li class="${d.result === 'win' ? 'duel-win' : ''}">${head} <small><span>${d.result === 'win' ? '🏆 Victoire' : d.result === 'loss' ? 'Défaite' : 'Nul'}</span> · ${d.my_time ? formatTime(d.my_time) : '—'} — ${d.their_time ? formatTime(d.their_time) : '—'} · Elo ${d.delta > 0 ? '+' : ''}${d.delta}</small></li>`;
      return `<li class="duel-void">${head} <small class="meta">${d.status === 'declined' ? 'refusé' : 'annulé (pas de temps)'}</small></li>`;
    };
    const tourRow = (t) => `<li><b${OFF}>${esc(t.name)}</b> · <span>${esc(tname(t.track_key, t.track_name))}</span> <small class="meta"><span>${t.closed ? `terminé${t.my_rank ? ` · ma place : ${t.my_rank}` : ''}` : `jusqu’au ${when(t.ends_at)} · code ${esc(t.code)}`}</span> · <span>${t.players} pilote${t.players > 1 ? 's' : ''}</span></small>
      ${t.closed ? '' : `<button class="btn small primary" data-tour-play="${t.id}">Jouer</button>`}<button class="btn small" data-tour-board="${t.id}">Classement</button></li>`;
    body.innerHTML = `
      <section><h3>Classement Elo</h3>
        <p>${me ? `Mon classement : <b>${me.rating}</b> · duels : ${me.games} · victoires : ${me.wins}` : 'Pas encore de duel.'}</p>
        ${ratings.length > 1 ? `<ol class="board">${ratings.map((r) => `<li class="${r.player === online.uid ? 'me' : ''}"><b>${r.rank}</b><span class="lb-name"${OFF}>${esc(r.name)}</span><em>${r.rating}</em></li>`).join('')}</ol>` : ''}
        <p class="meta">Calculé par le serveur à la fin de chaque duel (départ 1200). Personne ne déclare de résultat : seuls comptent les temps rejoués par le serveur.</p></section>
      <section><h3>Duels</h3>
        ${duels.length ? `<ul class="duel-list">${duels.map(duelRow).join('')}</ul>` : '<p class="meta">Aucun duel pour l’instant.</p>'}
        ${okFriends.length ? `<form class="duel-new row"><select class="duel-friend" aria-label="Ami à défier">${okFriends.map((f) => opt(f.id, f.name)).join('')}</select><select class="duel-track" aria-label="Circuit du duel">${tracks}</select><button class="btn primary" type="submit">Défier (24 h)</button></form>` : '<p class="meta">Ajoute des amis (Multijoueur › Amis) pour les défier.</p>'}
        <p class="meta">Un duel dure 24 h : chacun court quand il veut, son meilleur temps compte. Plus rapide gagne ; égalité parfaite : nul ; aucun temps : annulé.</p></section>
      <section><h3>Tournois privés</h3>
        ${tours.length ? `<ul class="tour-list">${tours.map(tourRow).join('')}</ul>` : '<p class="meta">Aucun tournoi.</p>'}
        <form class="tour-join row"><input type="text" maxlength="8" placeholder="Code du tournoi" aria-label="Code du tournoi"><button class="btn" type="submit">Rejoindre</button></form>
        <form class="tour-new row"><input type="text" maxlength="40" placeholder="Nom du tournoi" aria-label="Nom du tournoi" required><select class="tour-track" aria-label="Circuit du tournoi">${tracks}</select><select class="tour-days" aria-label="Durée">${[1, 2, 3, 7, 14].map((n) => opt(String(n), `${n} jour${n > 1 ? 's' : ''}`)).join('')}</select><button class="btn primary" type="submit">Créer</button></form>
        <div class="tour-board"></div></section>
      <p class="mp-err comp-err" role="alert"></p>`;
    body.prepend(official);
    const err = body.querySelector('.comp-err'), redo = () => this.competitionMenu();
    const act = async (fn) => { err.textContent = ''; try { await fn(); } catch (e) { err.textContent = e.message; } };
    for (const b of body.querySelectorAll('[data-duel-yes]')) b.onclick = () => act(async () => { await online.duelRespond(+b.dataset.duelYes, true); redo(); });
    for (const b of body.querySelectorAll('[data-duel-no]')) b.onclick = () => act(async () => { await online.duelRespond(+b.dataset.duelNo, false); redo(); });
    for (const b of body.querySelectorAll('[data-duel-play]')) b.onclick = () => { const d = duels.find((x) => x.id === +b.dataset.duelPlay); this._playCompetition(d.track_key, { duel: String(d.id) }); };
    for (const b of body.querySelectorAll('[data-tour-play]')) b.onclick = () => { const t = tours.find((x) => x.id === +b.dataset.tourPlay); this._playCompetition(t.track_key, { tour: String(t.id) }); };
    for (const b of body.querySelectorAll('[data-tour-board]')) b.onclick = () => act(async () => {
      const rows = await online.tournamentBoard(+b.dataset.tourBoard);
      body.querySelector('.tour-board').innerHTML = rows.length ? `<ol class="board">${rows.map((r) => `<li class="${r.player === online.uid ? 'me' : ''}"><b>${r.rank}</b><span class="lb-name"${OFF}>${esc(r.name)}</span><em>${r.time ? formatTime(r.time) : '—'}</em></li>`).join('')}</ol>` : '<p class="meta">Personne inscrit.</p>';
    });
    const dn = body.querySelector('.duel-new');
    if (dn) dn.onsubmit = (e) => { e.preventDefault(); act(async () => { const key = dn.querySelector('.duel-track').value, b = this.builtins.find((x) => x.key === key); await online.duelChallenge(dn.querySelector('.duel-friend').value, key, b ? b.def.name : '', this.settings.playerName); this.ui.flash('Défi envoyé : 24 h pour courir.', 2.4); redo(); }); };
    body.querySelector('.tour-join').onsubmit = (e) => { e.preventDefault(); act(async () => { await online.tournamentJoin(body.querySelector('.tour-join input').value, this.settings.playerName); this.ui.flash('Inscrit au tournoi.', 2); redo(); }); };
    body.querySelector('.tour-new').onsubmit = (e) => {
      e.preventDefault();
      act(async () => {
        const f = body.querySelector('.tour-new'), key = f.querySelector('.tour-track').value, b = this.builtins.find((x) => x.key === key);
        const r = await online.tournamentCreate(f.querySelector('input').value, key, b ? b.def.name : '', +f.querySelector('.tour-days').value, this.settings.playerName);
        this.ui.flash(`Tournoi créé : partage le code ${r && r.code ? r.code : ''}.`, 4);
        redo();
      });
    };
  },

  // « Duel » contre un fantôme officiel (amorce du pilote automatique, étape SQL 23) : la course ordinaire du circuit, ce fantôme en rival. À l'arrivée, le jeu dit qui
  // gagne (comme pour tout rival). Aucun duel n'est créé en base : ni Elo, ni division, ni classement à part ; le temps compte au classement du circuit comme toute course.
  _officialDuelSection() {
    const sec = document.createElement('section');
    sec.className = 'comp-official';
    const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
    const LEVEL_LABELS = { bronze: 'Niveau bronze', argent: 'Niveau argent', or: 'Niveau or', cristal: 'Niveau cristal' };
    sec.innerHTML = `<h3>Contre un fantôme officiel</h3>
      <form class="off-duel row"><select class="off-track" aria-label="Circuit">${this.builtins.filter((b) => b.def.decor !== 'atelier').map((b) => opt(b.key, b.def.name)).join('')}</select>
        <select class="off-level" aria-label="Niveau du fantôme">${OFFICIAL_LEVELS.map((l) => opt(l, LEVEL_LABELS[l])).join('')}</select><button class="btn primary" type="submit">Courir</button></form>
      <p class="meta">Le fantôme du pilote automatique du jeu, réglé sur une médaille : un entraînement, sans Elo ni division. Ton temps compte au classement du circuit, comme toute course.</p>
      <p class="mp-err off-err" role="alert"></p>`;
    const f = sec.querySelector('.off-duel'), err = sec.querySelector('.off-err');
    f.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      const key = f.querySelector('.off-track').value, level = f.querySelector('.off-level').value, btn = f.querySelector('button');
      btn.disabled = true;
      let g = null;
      try { g = await officialGhost(key, 'auto', level, PHYS_VER); } catch (x) { err.textContent = x.message; btn.disabled = false; return; }
      btn.disabled = false;
      if (!g) { err.textContent = 'Pas encore de fantôme officiel pour ce circuit à ce niveau (le serveur n’a pas reçu les amorces).'; return; }
      this.ui.closeModal();
      this.raceWithRivals(key, null, [g]);
    };
    return sec;
  },

  // Une course de duel ou de tournoi : le circuit de la carrière sous sa catégorie (le record local et l'envoi au serveur suivent cette clé).
  _playCompetition(trackKey, v) {
    const i = this.builtins.findIndex((b) => b.key === trackKey);
    if (i < 0) { this.ui.flash('Ce circuit a changé depuis : la compétition ne peut plus s’y courir.', 3); return; }
    this.ui.closeModal();
    this.launchDesc(describeVariant(this.describeBuiltin(i), v));
  },
};
