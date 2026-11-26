// Écran de modération (COMPLETE-004) : la file des contenus signalés, la fiche d'un contenu, masquer / rétablir, suspendre / réactiver un compte, le journal.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
//
// RÉSERVÉ AUX MODÉRATEURS, PAR LA BASE : le bouton n'apparaît que si le serveur a répondu « vrai » à mod_status pour la session de cet appareil (js/online/moderation.js), et
// chaque action est de toute façon refusée par la base à qui n'est pas modérateur (supabase/etape22-moderation.sql). Cet écran est une commodité, jamais une protection.
// Aucune décision sans motif (3 à 300 caractères) ni confirmation ; masquer ne supprime rien. Un moderateur ne voit que des données publiques (texte du contenu, pseudo de l'auteur)
// et le nombre de signalements : jamais QUI a signalé.
//
// i18n : les libellés sont des PHRASES COMPLÈTES et distinctes (le dictionnaire anglais est global : un mot générique comme « Motif » ou « Rétablir » a déjà un autre sens ailleurs).
import { h, $ } from '../dom.js';
import { locale } from '../i18n.js';
import * as M from '../online/moderation.js';

const OFF = { 'data-i18n': 'off' };      // un texte de joueur (pseudo, nom de circuit, commentaire) n'est jamais traduit
const TABS = [['pending', 'À examiner'], ['hidden', 'Contenus masqués'], ['suspended', 'Comptes suspendus'], ['log', 'Journal des décisions']];
const DURATIONS = [[1, '1 jour'], [7, '7 jours'], [30, '30 jours'], [0, 'Jusqu’à réactivation']];
const KIND_LABEL = { track: '🏁 Circuit', comment: '💬 Commentaire', account: '👤 Compte', mode: '🎮 Mode' };
const ACTION_LABEL = { hide: 'Contenu masqué', restore: 'Contenu rétabli', suspend: 'Compte suspendu', unsuspend: 'Compte réactivé' };

export const moderationMethods = {
  // Appelée à chaque ouverture de la communauté : le bouton « Modération » n'est montré que si la base confirme le statut (jamais présumé ; erreur ou étape absente : caché).
  async _refreshModeration() {
    const btn = $('comm-mod');
    if (!btn) return;
    if (!btn._wired) { btn._wired = true; btn.addEventListener('click', () => { this.audio.click(); this.openModeration(); }); }
    const req = (this._modReq = (this._modReq || 0) + 1);
    let ok = false;
    try { ok = await M.isModerator(); } catch { ok = false; }
    if (req === this._modReq) btn.classList.toggle('hidden', !ok);
  },

  async openModeration() {
    // Revérifié au clic (le compte a pu changer depuis l'ouverture de l'écran) ; sans effet de sécurité : la base refuserait de toute façon.
    M.forgetModeratorStatus();
    if (!(await M.isModerator())) { const b = $('comm-mod'); if (b) b.classList.add('hidden'); this.ui.flash('Cet écran est réservé aux modérateurs.', 3); return; }
    const S = { tab: 'pending', offset: 0, view: 'list', req: 0, loading: false };
    const root = h('div', { class: 'mod-screen' });
    const when = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '—');
    const until = (iso) => (iso ? when(iso) : 'jusqu’à réactivation');

    // ---------------------------------------------------------------- liste
    const tabsBar = () => h('div', { class: 'tabs mod-tabs', role: 'tablist' }, ...TABS.map(([id, label]) => h('button',
      { class: 'tab' + (S.tab === id ? ' on' : ''), type: 'button', role: 'tab', 'data-mod-tab': id, 'aria-selected': String(S.tab === id), onclick: () => { S.tab = id; show(); } }, label)));

    async function fetchPage(tab, offset) {
      if (tab === 'suspended') return M.suspensions({ activeOnly: true, offset });
      if (tab === 'log') return M.log({ offset });
      return M.queue({ state: tab, offset });
    }
    const rowEl = (r) => {
      if (S.tab === 'suspended') {
        return h('div', { class: 'mod-row', 'data-mod-user': r.user_id },
          h('div', { class: 'mod-row-main' }, h('b', OFF, r.name || '—'), h('span', { class: 'meta' }, 'Fin de la suspension : '), h('span', {}, until(r.until)), h('span', { class: 'meta' }, 'Motif de la suspension : '), h('span', OFF, r.reason)),
          h('button', { class: 'btn small', type: 'button', onclick: () => confirmView({ type: 'unsuspend', userId: r.user_id, name: r.name || '—', back: () => show() }) }, 'Réactiver ce compte'));
      }
      if (S.tab === 'log') {
        return h('div', { class: 'mod-row', 'data-mod-log': r.id },
          h('div', { class: 'mod-row-main' }, h('b', {}, ACTION_LABEL[r.action] || r.action), h('span', {}, KIND_LABEL[r.kind] || r.kind),
            h('span', { class: 'meta' }, when(r.at)), h('span', { class: 'meta' }, 'Décision prise par : '), h('span', OFF, r.actor_name || '—'),
            h('span', { class: 'meta' }, 'Motif de la décision : '), h('span', OFF, r.reason)));
      }
      return h('div', { class: 'mod-row' + (r.hidden ? ' is-hidden' : ''), 'data-mod-kind': r.kind, 'data-mod-id': r.id },
        h('div', { class: 'mod-row-main' },
          h('span', { class: 'chip' }, KIND_LABEL[r.kind] || r.kind),
          h('b', OFF, r.label),
          h('span', { class: 'meta' }, 'Auteur du contenu : '), h('span', OFF, r.author_name || '—'),
          h('span', {}, `⚑ ${r.reports}`), r.hidden ? h('span', { class: 'chip' }, 'Contenu masqué') : null, r.pending ? h('span', { class: 'chip on' }, 'Nouveaux signalements') : null),
        h('button', { class: 'btn small primary', type: 'button', 'data-mod-open': '1', onclick: () => detailView(r.kind, r.id, () => show()) }, 'Examiner ce contenu'));
    };
    const EMPTY = { pending: 'Rien à examiner : aucun contenu signalé depuis la dernière décision.', hidden: 'Aucun contenu masqué.', suspended: 'Aucun compte suspendu en ce moment.', log: 'Le journal est vide.' };
    // Une page de la liste. Une requête plus récente (autre onglet) rend la réponse en retard sans effet ; « Voir plus » ne part pas deux fois.
    async function load(reset) {
      if (!reset && S.loading) return;
      const req = ++S.req;
      S.loading = true;
      const status = root.querySelector('.mod-status'), list = root.querySelector('.mod-list'), more = root.querySelector('.mod-more');
      if (reset) { S.offset = 0; list.replaceChildren(); }
      status.textContent = 'Chargement…';
      more.classList.add('hidden');
      const tab = S.tab;
      try {
        const rows = await fetchPage(tab, S.offset);
        if (req !== S.req || S.view !== 'list') return;
        S.offset += rows.length;
        for (const r of rows) list.appendChild(rowEl(r));
        status.textContent = !rows.length && reset ? EMPTY[tab] : '';
        more.classList.toggle('hidden', rows.length < M.PAGE);
      } catch (e) {
        if (req === S.req && S.view === 'list') status.replaceChildren(h('b', {}, 'Modération indisponible : '), h('span', OFF, e.message));
      } finally { if (req === S.req) S.loading = false; }
    }
    const show = () => {
      S.view = 'list';
      root.replaceChildren(
        h('p', { class: 'meta' }, 'Réservé aux modérateurs. Chaque décision demande un motif et reste au journal. Masquer ne supprime rien : un contenu masqué se rétablit à tout moment.'),
        tabsBar(), h('div', { class: 'mod-status comm-status' }), h('div', { class: 'mod-list' }),
        h('div', { class: 'comm-more' }, h('button', { class: 'btn mod-more hidden', type: 'button', onclick: () => { this.audio.click(); load(false); } }, 'Voir plus')));
      load(true);
    };

    // ---------------------------------------------------------------- fiche d'un contenu
    const detailView = async (kind, id, back) => {
      S.view = 'detail';
      root.replaceChildren(h('button', { class: 'btn small', type: 'button', onclick: back }, '← Retour à la liste'), h('p', { class: 'meta mod-status' }, 'Chargement…'));
      let d, reps;
      try { [d, reps] = await Promise.all([M.detail(kind, id), M.reports(kind, id)]); }
      catch (e) { root.replaceChildren(h('button', { class: 'btn small', type: 'button', onclick: back }, '← Retour à la liste'), h('p', { class: 'lb-off mod-status' }, e.message)); return; }
      if (S.view !== 'detail') return;
      const au = d.author || {}, sus = au.suspension;
      const line = (k, ...v) => h('div', { class: 'srow' }, h('span', { class: 'meta' }, k), ...v);
      const body = d.kind === 'track'
        ? [line('Circuit', h('b', OFF, d.name)), d.description ? line('Description du circuit', h('span', OFF, d.description)) : null,
          line('Parties jouées · mentions j’aime', h('span', {}, `▶ ${d.plays} · ♥ ${d.likes}`))]
        : [line('Commentaire signalé', h('span', OFF, d.body)), line('Sous le circuit', h('b', OFF, d.track && d.track.name), d.track && d.track.hidden ? h('span', { class: 'chip' }, 'Ce circuit est masqué') : null)];
      const refresh = () => detailView(kind, id, back);
      const actions = h('div', { class: 'mod-actions' },
        h('button', { class: 'btn ' + (d.hidden ? 'primary' : 'danger'), type: 'button', 'data-mod-act': d.hidden ? 'restore' : 'hide',
          onclick: () => confirmView({ type: d.hidden ? 'restore' : 'hide', kind, id, label: d.kind === 'track' ? d.name : d.body, back: refresh }) }, d.hidden ? 'Rétablir ce contenu' : 'Masquer ce contenu'),
        au.id && !au.moderator ? (sus
          ? h('button', { class: 'btn', type: 'button', 'data-mod-act': 'unsuspend', onclick: () => confirmView({ type: 'unsuspend', userId: au.id, name: au.name, back: refresh }) }, 'Réactiver l’auteur')
          : h('button', { class: 'btn danger', type: 'button', 'data-mod-act': 'suspend', onclick: () => confirmView({ type: 'suspend', userId: au.id, name: au.name, back: refresh }) }, 'Suspendre l’auteur')) : null);
      root.replaceChildren(
        h('button', { class: 'btn small', type: 'button', onclick: back }, '← Retour à la liste'),
        h('div', { class: 'mod-detail', 'data-mod-detail': `${d.kind}:${d.id}` },
          h('h3', {}, KIND_LABEL[d.kind] || d.kind), ...body,
          line('Nombre de signalements (dont comptés)', h('span', {}, `⚑ ${d.reports} · ✓ ${d.counted}`)),
          line('État du contenu', h('b', {}, d.hidden ? 'Contenu masqué' : 'Contenu visible')),
          line('Date de publication', h('span', {}, when(d.created_at))),
          line('Auteur du contenu', h('b', OFF, au.name || '—'), au.moderator ? h('span', { class: 'chip' }, 'Cet auteur est modérateur') : null),
          line('Circuits publiés · circuits masqués · commentaires masqués (cet auteur)', h('span', {}, `${au.tracks ?? 0} · ${au.hidden_tracks ?? 0} · ${au.hidden_comments ?? 0}`)),
          sus ? line('Compte suspendu jusqu’au', h('span', {}, until(sus.until)), h('span', { class: 'meta' }, 'Motif de la suspension : '), h('span', OFF, sus.reason)) : null,
          h('h4', {}, 'Signalements reçus (sans le nom de ceux qui ont signalé)'),
          reps.length ? h('ul', { class: 'mod-list-plain' }, ...reps.map((r) => h('li', {}, r.reported_at ? when(r.reported_at) : 'date inconnue', ' · ', r.counted ? 'compté' : 'non compté (invité ou compte récent)'))) : h('p', { class: 'meta' }, 'Aucun signalement enregistré.'),
          h('h4', {}, 'Décisions déjà prises sur ce contenu'),
          (d.history || []).length ? h('ul', { class: 'mod-list-plain' }, ...d.history.map((x) => h('li', {}, ACTION_LABEL[x.action] || x.action, ' · ', when(x.at), ' · ', h('span', OFF, x.actor_name || '—'), ' · ', h('span', OFF, x.reason)))) : h('p', { class: 'meta' }, 'Aucune décision pour l’instant.'),
          actions));
    };

    // ---------------------------------------------------------------- confirmation : motif obligatoire (et durée pour une suspension)
    const confirmView = (op) => {
      S.view = 'confirm';
      const TITLE = { hide: 'Masquer ce contenu ?', restore: 'Rétablir ce contenu ?', suspend: 'Suspendre ce compte ?', unsuspend: 'Réactiver ce compte ?' };
      const WHAT = {
        hide: 'Il disparaît de la communauté pour les autres joueurs. Rien n’est supprimé : tu pourras le rétablir.',
        restore: 'Il redevient visible de tous les joueurs.',
        suspend: 'Ce compte ne pourra plus publier ni commenter. Ses temps, ses classements et ses contenus déjà publiés ne changent pas.',
        unsuspend: 'Ce compte pourra de nouveau publier et commenter.',
      };
      const reason = h('textarea', { class: 'mod-reason', rows: '3', maxlength: String(M.REASON_MAX), placeholder: 'Écris le motif de cette décision (3 à 300 caractères)', 'aria-label': 'Motif de la décision' });
      const dur = op.type === 'suspend' ? h('select', { class: 'mod-duration', 'aria-label': 'Durée de la suspension' }, ...DURATIONS.map(([d, t]) => h('option', { value: String(d) }, t))) : null;
      if (dur) dur.value = '7';
      const err = h('p', { class: 'lb-off mod-error' });
      const ok = h('button', { class: 'btn ' + (op.type === 'restore' || op.type === 'unsuspend' ? 'primary' : 'danger'), type: 'button', 'data-mod-confirm': op.type, disabled: true }, 'Confirmer la décision');
      const valid = () => { ok.disabled = !M.cleanReason(reason.value); };
      reason.addEventListener('input', valid);
      ok.addEventListener('click', async () => {
        const why = M.cleanReason(reason.value);
        if (!why) return;
        ok.disabled = true; err.textContent = '';
        try {
          if (op.type === 'hide' || op.type === 'restore') await M.setHidden(op.kind, op.id, op.type === 'hide', why);
          else if (op.type === 'suspend') { const days = +dur.value; await M.suspend(op.userId, why, days ? Date.now() + days * 86400000 : null); }
          else await M.unsuspend(op.userId, why);
          this.audio.checkpoint(true);
          this.ui.flash(({ hide: 'Contenu masqué.', restore: 'Contenu rétabli.', suspend: 'Compte suspendu.', unsuspend: 'Compte réactivé.' })[op.type], 2.5);
          op.back();
        } catch (e) { err.textContent = (e && e.message) || 'Décision impossible pour le moment.'; valid(); }
      });
      root.replaceChildren(
        h('h3', {}, TITLE[op.type]),
        op.type === 'suspend' || op.type === 'unsuspend' ? h('p', {}, h('span', { class: 'meta' }, 'Compte : '), h('b', OFF, op.name)) : h('p', {}, h('b', OFF, String(op.label || '').slice(0, 120))),
        h('p', { class: 'meta' }, WHAT[op.type]),
        dur ? h('label', { class: 'srow' }, h('span', {}, 'Durée de la suspension'), dur) : null,
        h('label', { class: 'mod-reason-label' }, h('span', {}, 'Motif de la décision (obligatoire, gardé au journal)'), reason),
        err,
        h('div', { class: 'mod-actions' }, h('button', { class: 'btn', type: 'button', 'data-mod-cancel': '1', onclick: () => op.back() }, 'Annuler'), ok));
      reason.focus();
    };

    show();
    this.ui.modal({ title: 'Modération', body: root, actions: [{ label: 'Fermer' }], wide: true, panelClass: 'mod-panel' });
  },
};
