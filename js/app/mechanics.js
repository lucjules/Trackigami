// Mécaniques de jeu (COMPLETE-007), côté écrans : la carte « Nouveau » de la fiche d'un circuit (Race Hub) et l'index « Mécaniques découvertes » du profil (Progression › Mécaniques).
// Les règles (catalogue, détection, niveaux, fusion) sont dans mechanics.js (pur, testé) ; le rappel en course, dans race/mechanics.js.
// Ces méthodes s'ajoutent au prototype de App (voir main.js) : `this` est l'instance.
import { $, esc } from '../dom.js';
import { profile, saveProfile } from '../profile.js';
import { getRecord } from '../storage.js';
import {
  MECHANICS, MECH_GROUPS, MECH_BY_ID, mechanicsOf, mechLevel, markMech, newMechanics, seedMech, discoveredMechanics,
} from '../mechanics.js';
import { MECH_LESSONS } from '../academyMech.js';
import { LESSONS } from '../academy.js';

export const HUB_NEW_MAX = 4;        // cartes montrées sur la fiche (les autres sont dans l'index)

// Nom de la leçon de l'Académie qui enseigne une mécanique (ou null).
export function lessonOf(m) {
  if (!m.lesson) return null;
  const core = LESSONS.findIndex((L) => L.id === m.lesson);
  if (core >= 0) return { kind: 'core', index: core, name: LESSONS[core].name };
  const ext = MECH_LESSONS.findIndex((L) => L.id === m.lesson);
  return ext >= 0 ? { kind: 'mech', index: ext, name: MECH_LESSONS[ext].name } : null;
}

export const mechanicsMethods = {
  // Profil d'avant la 0.20.0 (pas encore de champ mech) : ce que le joueur a déjà rencontré dans la carrière compte comme appris (mechanics.js : seedMech). Une seule fois.
  _mechSeed() {
    const p = profile();
    if (p.mech !== undefined || !this.builtins || !this.builtins.length) return;
    if (seedMech(p, this.builtins, (k) => !!getRecord(k))) saveProfile();
  },

  // À l'ouverture de la fiche : les mécaniques du circuit que le joueur n'a jamais vues. La carte les montre cette fois-là SEULEMENT (niveau 1 écrit tout de suite : elle ne revient pas),
  // le rappel en course (niveau 2) les annoncera à la première rencontre. Un circuit verrouillé ne consomme rien : on ne peut pas encore y jouer.
  _hubTakeNewMech(desc) {
    if (!desc || desc.locked || !desc.track) return [];
    this._mechSeed();
    const p = profile(), ids = newMechanics(p, mechanicsOf(desc.track));
    if (!ids.length) return [];
    for (const id of ids) markMech(p, id, 1);
    saveProfile();
    return ids;
  },

  _renderHubNew() {
    const box = $('hub-new'), ids = (this._hub && this._hub.newMech) || [];
    if (!box) return;
    box.classList.toggle('hidden', !ids.length);
    if (!ids.length) { box.innerHTML = ''; return; }
    const shown = ids.slice(0, HUB_NEW_MAX), more = ids.length - shown.length;
    box.innerHTML = `<h3>🆕 Nouveau sur ce circuit</h3>
      <ul class="mech-cards">${shown.map((id) => { const m = MECH_BY_ID[id]; return `<li data-mech="${esc(id)}"><span class="mech-ico" aria-hidden="true">${m.icon}</span><div><b>${esc(m.name)}</b><p>${esc(m.how)}</p></div></li>`; }).join('')}</ul>
      <p class="meta mech-more">${more > 0 ? `Et ${more} de plus : voir l’index. ` : ''}<button type="button" class="link-btn" data-hub="mech-index">Mécaniques découvertes</button></p>`;
    box.querySelector('[data-hub="mech-index"]').onclick = () => { this.audio.click(); this.mechIndexModal(); };
  },

  // L'index : toutes les mécaniques, par famille ; celles que le joueur n'a pas encore vues restent cachées (« À découvrir »).
  _renderMechIndex(box) {
    this._mechSeed();
    const p = profile(), found = discoveredMechanics(p).length;
    const rows = (g) => MECHANICS.filter((m) => m.group === g.id).map((m) => {
      const lv = mechLevel(p, m.id);
      if (!lv) return `<li class="mech-row locked" data-mech="${esc(m.id)}"><span class="mech-ico" aria-hidden="true">❔</span><div><b>À découvrir</b><p class="meta">Elle apparaîtra dans un circuit de la carrière.</p></div></li>`;
      const L = lessonOf(m);
      return `<li class="mech-row${lv >= 2 ? ' met' : ''}" data-mech="${esc(m.id)}"><span class="mech-ico" aria-hidden="true">${m.icon}</span>
        <div><b>${esc(m.name)}</b>${lv >= 2 ? ' <small class="meta">✓ rencontrée</small>' : ''}<p>${esc(m.how)}</p>${L ? `<button type="button" class="btn small" data-mech-lesson="${L.kind}:${L.index}">🎓 Leçon · ${esc(L.name)}</button>` : ''}</div></li>`;
    }).join('');
    box.innerHTML = `<h3 class="opt-h">Mécaniques découvertes</h3>
      <p class="prof-note">${found} / ${MECHANICS.length} mécaniques découvertes. Chaque mécanique est présentée à sa première rencontre ; retrouve ici ce qu’elle fait et comment t’en servir.</p>
      <div class="mech-bar"><i style="width:${Math.round((100 * found) / MECHANICS.length)}%"></i></div>
      ${MECH_GROUPS.map((g) => `<h3 class="opt-h"><span aria-hidden="true">${g.icon}</span> ${esc(g.name)}</h3><ul class="mech-list">${rows(g)}</ul>`).join('')}`;
    for (const b of box.querySelectorAll('[data-mech-lesson]')) {
      b.onclick = () => {
        this.audio.click();
        const [kind, i] = b.dataset.mechLesson.split(':');
        if (this.ui.closeModal) this.ui.closeModal();
        if (kind === 'core') this.lessonIntro(+i); else this.mechLessonIntro(+i);
      };
    }
  },

  // L'index en fenêtre (depuis la carte de la fiche).
  mechIndexModal() {
    const body = document.createElement('div');
    body.className = 'mech-index';
    this._renderMechIndex(body);
    this.ui.modal({ title: '📖 Mécaniques', body, actions: [{ label: 'Fermer', primary: true }] });
  },
};
