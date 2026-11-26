// Fin de carrière (COMPLETE-013) : l'écran de conclusion (épreuve finale, bilan exact, générique). Les règles et le calcul du bilan sont dans careerEnd.js (pur, testé) ;
// ici on rassemble les circuits, les records et le profil LOCAUX (aucun appel réseau) et on affiche. Ces méthodes s'ajoutent au prototype de App (voir main.js).
import { $, esc } from '../dom.js';
import { profile, saveProfile } from '../profile.js';
import { getRecord, medalTime, formatTime } from '../storage.js';
import { medalFor, MEDALS } from '../medals.js';
import { goalDone } from '../career.js';
import { medalIcon } from '../ui.js';
import { levelOf } from '../progression.js';
import { GAME_NAME, VERSION } from '../version.js';
import { careerRows, careerReport, shouldShowCareerEnd, markCareerEnd, careerEndSeen, FINALE_ID } from '../careerEnd.js';

export const careerEndMethods = {
  // Une ligne par circuit officiel : meilleur temps (toutes physiques confondues), médaille, objectif bonus.
  _careerRows() { return careerRows(this.builtins, { getRecord, medalTime, medalFor, goalDone }); },
  _careerReport() { return careerReport(this._careerRows(), profile().stats); },

  // Appelé en ouvrant l'écran des circuits : la PREMIÈRE fois que la carrière est finie, l'écran de fin s'ouvre tout seul (une seule fois, la date est gardée dans le profil) ;
  // ensuite il se rouvre à la demande (écran des circuits, Progression › Records). Un joueur qui avait déjà fini la carrière le voit une fois, au prochain passage.
  _maybeCareerEnd() {
    const p = profile();
    if (!this.builtins.length || !shouldShowCareerEnd(p, this._careerReport().finished)) return;
    markCareerEnd(p);
    saveProfile();
    setTimeout(() => { if (this._screen === 'tracks' && $('modal').classList.contains('hidden')) this.careerEndModal(); }, 450);
  },

  careerEndModal() {
    const r = this._careerReport(), f = r.finale, fi = this.builtins.findIndex((b) => b.def.id === FINALE_ID);
    const row = (label, value) => `<span>${esc(label)}</span><b>${value}</b>`;
    const medalRow = MEDALS.map((m) => `<span class="ce-medal">${medalIcon(m)} ${r.byMedal[m.id]}</span>`).join('');
    const body = document.createElement('div');
    body.className = 'career-end';
    body.innerHTML = `<p class="ce-lead">${r.finished ? `Tu as une médaille sur chacun des ${r.total} circuits de la carrière : elle est terminée.` : `Il te reste ${r.total - r.medals} circuits sans médaille pour terminer la carrière.`}</p>
      ${f ? `<h3 class="opt-h">Épreuve finale</h3>
      <p class="ce-finale"><b>${esc(f.name)}</b> · ${f.medal ? medalIcon(MEDALS.find((m) => m.id === f.medal)) : ''} <span class="ce-time">${formatTime(f.time)}</span></p>` : ''}
      <h3 class="opt-h">Bilan de ta carrière</h3>
      <div class="prof-grid ce-grid">
        ${row('Circuits terminés', `${r.medals} / ${r.total}`)}
        <span>Médailles</span><b class="ce-medals">${medalRow}</b>
        ${row('Objectifs bonus réussis', `${r.goals} / ${r.total}`)}
        ${row('Temps cumulé de tes meilleurs temps', formatTime(r.totalTime))}
        ${row('Circuits chronométrés', `${r.timed} / ${r.total}`)}
        ${row('Courses terminées', r.races)}
        ${row('Niveau du pilote', levelOf(profile().xp).level)}
      </div>
      ${r.complete ? '<p class="ce-lead">✦ Tous les cristaux et tous les objectifs bonus : la carrière est complète, au sens le plus strict.</p>' : '<p class="meta">Il reste des cristaux et des objectifs bonus à décrocher, si tu veux pousser la maîtrise plus loin.</p>'}
      <h3 class="opt-h">Générique</h3>
      <ul class="ce-credits" aria-label="Générique">
        <li class="ce-big">${esc(GAME_NAME)} <small>${esc(VERSION)}</small></li>
        <li>Circuits officiels, véhicules, pièces, décors et icônes : créés pour le jeu</li>
        <li>Musique et sons : synthétisés en direct par le jeu</li>
        <li>Moteur 3D : three.js · Police : Chakra Petch</li>
        <li class="ce-big">Merci d’avoir joué jusqu’au bout !</li>
      </ul>`;
    const actions = [];
    if (fi >= 0) actions.push({ label: `🏁 Rejouer l’épreuve finale`, onClick: () => { setTimeout(() => this.playBuiltin(fi), 0); return true; }, attrs: { 'data-career-end': 'finale' } });
    actions.push({ label: 'Crédits et licences', onClick: () => { setTimeout(() => this.showLegal('credits'), 0); return true; }, attrs: { 'data-career-end': 'credits' } });
    actions.push({ label: 'Fermer', primary: true });
    this.ui.modal({ title: r.finished ? '🏁 Carrière accomplie' : 'Bilan de ta carrière', body, actions, panelClass: 'career-end-panel' });
    return r;
  },

  // Le bouton « Revoir la conclusion » (écran des circuits, Progression › Records) : seulement une fois la carrière finie.
  _careerEndButton(parent) {
    if (!parent || !this._careerReport().finished) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn small career-end-btn'; b.dataset.careerEnd = 'open';
    b.textContent = careerEndSeen(profile()) ? '🎬 Revoir la conclusion de la carrière' : '🎬 Conclusion de la carrière';
    b.addEventListener('click', () => { this.audio.click(); this.careerEndModal(); });
    parent.appendChild(b);
  },
};
