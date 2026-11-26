// Fin de carrière dans l'application (COMPLETE-013) : l'écran de conclusion (épreuve finale, bilan exact, générique), montré UNE fois à la première visite de l'écran des circuits
// après la dernière médaille, puis rouvert à volonté (écran des circuits et Progression › Records et médailles). Les règles et les calculs sont dans ending.js (pur) ; ici on lit
// les records et le profil de CET appareil et on dessine. Aucun appel réseau.
import { esc } from '../dom.js';
import { profile, saveProfile } from '../profile.js';
import { getRecord, medalTime, formatTime } from '../storage.js';
import { medalFor } from '../medals.js';
import { medalIcon } from '../ui.js';
import { goalDone, CHAPTERS } from '../career.js';
import { levelOf } from '../progression.js';
import { getLang } from '../i18n.js';
import { finaleIndexOf, careerBilan, careerEnded, finaleReady, remainingBeforeFinale, formatSpan, endingSeen, credits } from '../ending.js';

export const endingMethods = {
  // Une ligne par circuit officiel : médaille (selon le meilleur temps de tous les temps, comme partout), temps, objectif.
  _careerEntries() {
    return this.builtins.map((b) => {
      const rec = getRecord(b.key), time = rec ? medalTime(rec) : null, m = rec ? medalFor(time, b.def.medals) : null;
      return { medal: m ? m.id : null, time: m ? time : null, goal: goalDone(b.key + '#goal') };
    });
  },
  _careerBilan() {
    const entries = this._careerEntries(), p = profile();
    return { entries, finale: finaleIndexOf(this.builtins), bilan: careerBilan(entries, finaleIndexOf(this.builtins), { races: p.stats && p.stats.races, level: levelOf(p.xp).level }) };
  },

  // Épreuve finale à finir (tous les autres circuits ont une médaille) et conclusion à voir : les états que l'écran des circuits affiche.
  _careerEndState() {
    const { entries, finale, bilan } = this._careerBilan();
    return { bilan, finale, ended: careerEnded(entries), finaleReady: finaleReady(entries, finale), left: remainingBeforeFinale(entries, finale), seen: endingSeen(profile()) };
  },

  // Boutons de la carrière (écran des circuits, Records et médailles) : l'épreuve finale à finir, ou la conclusion à revoir. Renvoie un élément, ou null.
  _careerEndButton() {
    const st = this._careerEndState();
    if (!st.ended && !st.finaleReady) return null;
    const box = document.createElement('div');
    box.className = 'career-end';
    if (st.finaleReady) {
      const b = this.builtins[st.finale];
      box.innerHTML = `<p class="cs-msg">🏆 Épreuve finale : plus qu’un circuit.</p>`;
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'btn primary'; go.dataset.finale = String(st.finale);
      go.innerHTML = `<span>▶ Épreuve finale</span> <small>${esc(b.def.name)}</small>`;
      go.addEventListener('click', () => { this.audio.click(); this.openBuiltinHub(st.finale, 'tracks'); });
      box.appendChild(go);
    } else {
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'btn primary'; go.dataset.ending = '1';
      go.textContent = st.bilan.complete ? '🎬 Revoir la conclusion de la carrière' : '🎬 Voir la conclusion de la carrière';
      go.addEventListener('click', () => { this.audio.click(); this.showEnding(); });
      box.appendChild(go);
    }
    return box;
  },

  // À l'ouverture de l'écran des circuits : la conclusion s'ouvre d'elle-même la toute première fois (jamais deux fois : `endSeen`, réuni par la fusion des appareils).
  _maybeShowEnding() {
    const st = this._careerEndState();
    if (!st.ended || st.seen) return false;
    setTimeout(() => { if (this._screen === 'tracks' && !this.ui.modalOpen && !endingSeen(profile())) this.showEnding(); }, 350);
    return true;
  },

  // En fin de course : la carrière vient d'être terminée ? un message, une seule fois par session (la conclusion elle-même s'ouvre depuis l'écran des circuits).
  noteCareerEnd() {
    if (this._endingHinted) return;
    const st = this._careerEndState();
    if (st.ended && !st.seen) { this._endingHinted = true; setTimeout(() => this.ui.flash('🏁 Carrière terminée ! Ta conclusion t’attend dans l’écran des circuits.', 4), 1600); }
    else if (st.finaleReady) { this._endingHinted = true; setTimeout(() => this.ui.flash('🏆 Il ne reste que l’épreuve finale.', 3.4), 1600); }
  },

  showEnding() {
    const { entries, finale, bilan } = this._careerBilan();
    if (!careerEnded(entries)) return;
    const p = profile();
    if (!endingSeen(p)) { p.endSeen = Date.now(); saveProfile(); }
    const lang = getLang(), fe = bilan.finale, fb = finale >= 0 ? this.builtins[finale] : null;
    const row = (label, value) => `<span>${esc(label)}</span><b>${value}</b>`;
    const m = bilan.medals;
    const body = document.createElement('div');
    body.className = 'ending-page' + (bilan.complete ? ' complete' : '');
    body.innerHTML = `<p class="end-lead">${bilan.complete
      ? 'Un cristal et un objectif bonus sur chaque circuit : tu as tout fini. Reste à battre tes propres temps.'
      : 'Une médaille sur chaque circuit, jusqu’à l’épreuve finale : la carrière est terminée. Les cristaux et les objectifs bonus t’attendent encore.'}</p>
      ${fb ? `<div class="end-finale"><span>Épreuve finale</span><b>${esc(fb.def.name)}</b>${fe && fe.medal ? medalIcon({ id: fe.medal }) : ''}<b class="end-time">${fe && fe.time != null ? formatTime(fe.time) : '—'}</b></div>` : ''}
      <h3 class="opt-h">Bilan de la carrière</h3>
      <div class="prof-grid end-bilan">
        ${row('Circuits terminés', `${bilan.medalled} / ${bilan.total}`)}
        ${row('Temps cumulé de tes meilleurs temps', esc(formatSpan(bilan.time, lang)))}
        ${row('Médailles de cristal', m.cristal)}
        ${row('Médailles d’or', m.or)}
        ${row('Médailles d’argent', m.argent)}
        ${row('Médailles de bronze', m.bronze)}
        ${row('Temps du pilote automatique battus', `${bilan.beaten} / ${bilan.total}`)}
        ${row('Objectifs bonus réussis', `${bilan.goals} / ${bilan.total}`)}
        ${row('Courses terminées', bilan.races)}
        ${row('Niveau du pilote', bilan.level)}
      </div>
      <h3 class="opt-h">Générique</h3>
      <div class="end-credits" tabindex="0" role="region" aria-label="Générique"><div class="roll"></div></div>`;
    const roll = body.querySelector('.roll');
    for (const c of credits(this.builtins.length, CHAPTERS.length)) {
      const el = document.createElement(c.h ? 'h4' : 'p');
      el.textContent = c.h || (c.n != null ? c.t.replace('{n}', c.n).replace('{c}', c.c) : c.t);      // (« 84 circuits officiels en 14 chapitres » : un modèle à trous du dictionnaire)
      roll.appendChild(el);
    }
    const actions = [{ label: 'Crédits et licences', onClick: () => { this.showLegal('credits'); return false; } }];
    if (fb) actions.push({ label: 'Rejouer l’épreuve finale', onClick: () => { this.openBuiltinHub(finale, 'tracks'); } });
    actions.push({ label: 'Fermer', primary: true });
    this.ui.modal({ title: bilan.complete ? 'Carrière complète' : 'Carrière terminée', body, wide: true, panelClass: 'ending', actions });
  },
};
