// Boîte de réception (COMPLETE-015) : le bouton « 📬 » du menu principal et sa fenêtre. Les données et les textes : js/inbox.js (une requête à l'ouverture du jeu, cache de
// quelques minutes, AUCUNE requête sans session). Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { $, esc } from '../dom.js';
import { online } from '../online.js';
import { locale } from '../i18n.js';
import { splitKey, parseVariant } from '../variants.js';
import { seasonTracks } from '../seasons.js';
import { CHAPTER_KEYS } from '../themes.js';
import { loadInbox, cachedInbox, markInboxSeen, unread, inboxText, INBOX_ICONS } from '../inbox.js';

const when = (d) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };

export const inboxMethods = {
  // Le badge du bouton (menu principal) : le cache s'il est frais, sinon UNE requête (seulement avec une session sur l'appareil).
  _refreshInbox() {
    const btn = $('menu-inbox');
    if (!btn) return;
    const show = (r) => {
      const n = r ? unread(r.items, r.since).length : 0, b = $('menu-inbox-n');
      if (b) { b.textContent = n ? String(n) : ''; b.classList.toggle('hidden', !n); }
      btn.classList.toggle('has-news', n > 0);
      btn.setAttribute('aria-label', n ? `Boîte de réception : ${n} nouveauté${n > 1 ? 's' : ''}` : 'Boîte de réception');
    };
    const c = cachedInbox();
    if (c || !online.hasStoredSession()) { show(c); return; }
    if (this._inboxP) return;
    this._inboxP = loadInbox().then(show, () => show(null)).finally(() => { this._inboxP = null; });
  },

  // Le nom d'un circuit à afficher : celui de la carrière (traduit avec le jeu), sinon celui que la base a rangé.
  _inboxTrack(it) {
    const { base } = splitKey(it.trackKey || '');
    const b = base && this.builtins.find((x) => x.key === base);
    return b ? b.def.name : it.trackName || '?';
  },

  // Ce que fait le bouton d'un élément : { label, run } ou null.
  _inboxAction(it) {
    const { base, variant } = splitKey(it.trackKey || '');
    const i = base ? this.builtins.findIndex((x) => x.key === base) : -1;
    if (it.kind === 'duel' || it.kind.startsWith('duel_')) return { label: it.kind === 'duel' ? 'Répondre' : 'Voir', run: () => this.competitionMenu() };
    // Enchaînement « chapitre d'une traite » (COMPLETE-014, clé ch-<chapitre>-…) : son classement dédié.
    const chm = it.kind === 'beaten' ? /^ch-([a-z]+)-/.exec(base || '') : null;
    if (chm && CHAPTER_KEYS.indexOf(chm[1]) >= 0) return { label: 'Voir le classement', run: () => this.chainBoard(it.trackKey, CHAPTER_KEYS.indexOf(chm[1])) };
    if (it.kind === 'beaten' && i >= 0) {
      let sea = null;
      try { sea = variant ? +parseVariant(variant).sea || null : null; } catch { sea = null; }
      return { label: 'Voir le circuit', run: () => (sea ? this.openSeasonHub(i, sea, 'tracks') : this.openBuiltinHub(i, 'tracks')) };
    }
    if (it.kind === 'season' && it.ref > 0) {
      let d = null;
      try { d = seasonTracks(it.ref)[0]; } catch { d = null; }
      const j = d ? this.builtins.findIndex((x) => x.def.id === d.id) : -1;
      return j >= 0 ? { label: 'Voir la saison', run: () => this.openSeasonHub(j, it.ref, 'tracks') } : null;
    }
    if (it.kind === 'follow' && it.trackId) return { label: 'Voir le circuit', run: async () => {
      let row;
      try { row = await online.trackById(it.trackId); } catch (e) { this.ui.flash(`Communauté indisponible : ${e.message}`); return; }
      if (!row) { this.ui.flash('Ce circuit a été retiré de la communauté.'); return; }
      this.openCommunityHub(row, 'menu');
    } };
    return null;
  },

  async openInbox() {
    const body = document.createElement('div');
    body.className = 'inbox';
    this.ui.modal({ title: '📬 Boîte de réception', body, actions: [{ label: 'Fermer', primary: true }] });
    if (!online.hasStoredSession()) {
      // Aucune session sur cet appareil : la boîte n'a rien à lire, et ne crée pas de joueur pour le savoir.
      body.innerHTML = '<p>La boîte de réception suit tes temps en ligne : qui bat ton temps, tes duels, les saisons, les circuits des auteurs que tu suis.</p><p class="meta">Elle s’ouvrira dès que tu auras envoyé un temps au classement ou créé un compte.</p>';
      return;
    }
    body.innerHTML = '<p class="meta">Chargement…</p>';
    let r;
    try { r = await loadInbox(); }
    catch (e) { body.innerHTML = `<p class="lb-off">Boîte de réception indisponible : ${esc(String(e.message || 'hors ligne').replace(/[.\s]+$/, ''))}.</p>`; return; }
    if (!document.body.contains(body)) return;
    if (!r) { body.innerHTML = '<p class="meta">Elle s’ouvrira dès que tu auras envoyé un temps au classement ou créé un compte.</p>'; return; }
    const news = unread(r.items, r.since), old = r.items.filter((x) => !news.includes(x));
    const row = (it, k) => {
      const a = this._inboxAction(it);
      return `<li class="inbox-item${news.includes(it) ? ' new' : ''}"><span class="inbox-ico" aria-hidden="true">${INBOX_ICONS[it.kind] || '•'}</span><span class="inbox-text">${esc(inboxText(it, (x) => this._inboxTrack(x)))}</span>
        <small class="meta">${esc(when(it.at))}</small>${a ? `<button class="btn small" data-inbox="${k}">${esc(a.label)}</button>` : ''}</li>`;
    };
    const all = [...news, ...old];
    body.innerHTML = `${news.length ? `<ul class="inbox-list">${news.map((it) => row(it, all.indexOf(it))).join('')}</ul>` : '<p>Rien de nouveau depuis ta dernière visite.</p>'}
      ${old.length ? `<h3>Déjà vu</h3><ul class="inbox-list old">${old.map((it) => row(it, all.indexOf(it))).join('')}</ul>` : ''}
      <p class="meta">Ce que les autres pilotes ont fait depuis ta dernière visite (30 jours au plus, 20 éléments). Seuls des pseudos, des temps et des circuits publiés y figurent.</p>`;
    for (const b of body.querySelectorAll('[data-inbox]')) b.onclick = () => { const a = this._inboxAction(all[+b.dataset.inbox]); if (!a) return; this.audio.click(); this.ui.closeModal(); a.run(); };
    markInboxSeen(online.uid);                      // ouverte : tout ce qui est arrivé jusqu'ici est lu
    this._refreshInbox();
  },
};
