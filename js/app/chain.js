// Épreuve « chapitre d'une traite » (COMPLETE-014, docs/CHAPITRE-D-UNE-TRAITE.md) : lancement depuis la carrière, entracte entre les manches, recommencer
// (action « recommencer », T par défaut : tout l'enchaînement, à la manche 1), arrivée (record local, envoi au classement dédié, rejoué par le serveur) et classement.
//
// Les manches sont des courses SANS clé de classement (comme les modes de jeu) : ni record par circuit, ni médaille, ni pièces, ni objectif bonus, ni envoi au
// classement du circuit. RaceSession les reconnaît à `opts.chain` (le ChainRun en cours) et appelle onChainLegFinished à l'arrivée, avant tout le reste.
// Méthodes ajoutées au prototype d'App (main.js) : `this` est l'application.
import { ChainRun, submissionFromRecord } from '../chainRun.js';
import { chainLegIndexes } from '../chain.js';
import { chapterLock } from '../trackDescriptor.js';
import { CHAPTERS } from '../career.js';
import { getRecord, saveRecord, formatTime } from '../storage.js';
import { online, versionMismatchText } from '../online.js';
import { PHYS_VER } from '../version.js';
import { DT } from '../constants.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { renderWorldBoard } from '../ui/leaderboardPanel.js';

// Texte français à trous, SANS traduction ici : quand un trou est lui-même à traduire ({x:t} : nom de circuit, de chapitre, touche), c'est le traducteur DOM
// (i18n/dom.js) qui traduit la phrase affichée ET la valeur captée. (t() ne traduit pas les valeurs : en anglais, il laisserait le nom en français.)
const fr = (tpl, vars) => tpl.replace(/\{(\w+)(?::[tw]+)?\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
const sign = (d) => (d == null ? '' : `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(3)} s`);

export const chainMethods = {
  // Le ChainRun d'un chapitre (sans le lancer) : ses 6 circuits, dans l'ordre de la carrière.
  _newChain(ch) {
    const idx = chainLegIndexes(ch);
    const bs = idx.map((i) => this.builtins[i]);
    return new ChainRun({ ch, keys: bs.map((b) => b.key), names: bs.map((b) => b.def.name), indexes: idx });
  },

  _chainTitle(icon, ch) { return fr('{i:w} Chapitre {n:w} · {name:t} · d’une traite', { i: icon, n: ch + 1, name: (CHAPTERS[ch] && CHAPTERS[ch].name) || '' }); },

  // Fenêtre de départ (carte du chapitre) : règles, record, classement, départ. Chapitre fermé : refusé, avec la raison de la carrière.
  chainMenu(ch) {
    const lock = chapterLock(ch * 6, this.builtins, getRecord);
    if (lock) { this.ui.flash(lock); this.audio.error(); return; }
    const run = this._newChain(ch);
    const rec = getRecord(run.base), recA = getRecord(`${run.base}~v1.as-1`);
    const body = `<p>${esc(t('Les 6 circuits du chapitre à la suite, dans l’ordre de la carrière : le chrono est le temps cumulé des 6 manches.'))}</p>
      <ol class="chain-legs">${run.names.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
      <p class="meta">${esc(fr('Recommencer ({k:t}) reprend tout l’enchaînement à la manche 1 ; le retour au checkpoint reste permis. Pas de record par circuit, ni médaille, ni pièces : un classement à part, et chaque temps est rejoué par le serveur.', { k: this.hintKey('restart') || '—' }))}</p>
      <p class="chain-best">${rec ? esc(t('Mon record : {t:w}', { t: formatTime(rec.time) })) : esc(t('Pas encore de temps sur cet enchaînement.'))}${recA ? ` · ${esc(t('avec aides : {t:w}', { t: formatTime(recA.time) }))}` : ''}</p>`;
    this.ui.modal({
      title: this._chainTitle('⏱', ch), body,
      actions: [
        { label: t('Annuler') },
        { label: '🏆 ' + t('Classement'), onClick: () => { setTimeout(() => this.chainBoard(run.base, ch), 0); return true; } },
        { label: t('Partir'), primary: true, attrs: { 'data-chain-go': '1' }, onClick: () => { setTimeout(() => this.startChain(ch), 0); return true; } },
      ],
    });
  },

  startChain(ch) {
    if (chapterLock(ch * 6, this.builtins, getRecord)) return;
    this._chain = this._newChain(ch);
    this._playChainLeg();
  },

  // Lance la manche en cours de l'enchaînement (une course ordinaire du circuit, sans clé de classement).
  _playChainLeg() {
    const run = this._chain;
    if (!run || run.finished) return;
    const n = run.leg, b = this.builtins[run.indexes[n]];
    this.playTrack(b.track, { chain: run, chainLeg: n, trackKey: null, seed: b.key, difficulty: b.def.difficulty });
    this.ui.flash(n
      ? fr('⏱ Manche {n:w}/{m:w} · {name:t} · temps cumulé {t:w}', { n: n + 1, m: run.total, name: b.def.name, t: formatTime(run.time) })
      : fr('⏱ Manche {n:w}/{m:w} · {name:t}', { n: n + 1, m: run.total, name: b.def.name }), 3);
  },

  // Tout recommencer (action « recommencer » : T par défaut, « Recommencer » de la pause ou des fenêtres de l'enchaînement) : manche 1, temps à zéro.
  restartChain() {
    const run = this._chain;
    if (!run) return;
    run.restart();
    this.ui.closeModal();
    const s = this.session;
    if (s && s.opts && s.opts.chain === run && s.opts.chainLeg === 0) { this.ui.hideOverlay('pause'); s.restart(); return; }
    this._playChainLeg();
  },

  // Arrivée d'une manche (race/finish.js). unverified : un incident pendant un pas (TECH-015) : la manche ne se rejouerait pas, l'enchaînement est perdu.
  onChainLegFinished(session, time, { unverified = false } = {}) {
    const run = session.opts.chain;
    if (!run || run !== this._chain) return;
    this.ui.hud.time(time, true);
    if (unverified) {
      this.ui.modal({
        title: t('Incident pendant la manche'),
        body: `<p>${esc(t('Cette manche ne pourrait pas être vérifiée : l’enchaînement est annulé.'))}</p>`,
        actions: [{ label: t('Quitter'), onClick: () => { setTimeout(() => this.quitRace(), 0); return true; } }, { label: t('Recommencer l’enchaînement'), primary: true, onClick: () => { setTimeout(() => this.restartChain(), 0); return true; } }],
      });
      return;
    }
    const n = run.record(Math.round(time / DT), session.recorder.encode());
    if (run.finished) { this._chainFinished(run); return; }
    const best = getRecord(run.key);
    const d = run.diffAt(n, best && best.pv === PHYS_VER ? best : null);
    const next = run.current;
    let chosen = false;
    const choose = (fn) => () => { chosen = true; setTimeout(fn, 0); return true; };
    const show = () => this.ui.modal({
      title: t('Manche {n:w}/{m:w} terminée', { n: n + 1, m: run.total }),
      body: `<p><b>${esc(run.names[n])}</b> · ${formatTime(run.legTime(n))}</p>
        <p class="chain-total">${esc(t('Temps cumulé : {t:w}', { t: formatTime(run.time) }))}${d != null ? ` <span class="${d <= 0 ? 'ok' : 'ko'}">(${esc(sign(d))} ${esc(t('sur mon record'))})</span>` : ''}</p>
        <p class="meta">${esc(fr('Manche suivante : {name:t}. Le chrono ne tourne pas pendant cet entracte.', { name: next ? next.name : '' }))}</p>`,
      onClose: () => { if (!chosen) setTimeout(() => { if (this._chain === run && this.session === session && !this.ui.modalOpen && !run.finished && run.leg === n + 1) show(); }, 0); },
      actions: [
        { label: t('Abandonner'), onClick: choose(() => this.quitRace()) },
        { label: t('Recommencer l’enchaînement'), onClick: choose(() => this.restartChain()) },
        { label: t('Manche suivante'), primary: true, attrs: { 'data-chain-next': '1' }, onClick: choose(() => this._playChainLeg()) },
      ],
    });
    show();
  },

  // Les 6 manches sont finies : record local (rec3.<clé>), bilan, envoi au classement dédié si c'est un record.
  _chainFinished(run) {
    const key = run.key, prev = getRecord(key);
    const prevValid = prev && prev.pv === PHYS_VER;
    const time = run.time, isRecord = !prevValid || time < prev.time - 1e-9;
    if (isRecord) saveRecord(key, run.toRecord({ name: this.settings.playerName, physVer: PHYS_VER }));
    this.audio.finish(isRecord);
    const rows = run.names.map((nm, i) => `<li><span>${esc(nm)}</span><em>${formatTime(run.legTime(i))}</em></li>`).join('');
    const body = document.createElement('div');
    body.innerHTML = `<p class="chain-total"><b>${formatTime(time)}</b>${isRecord ? ` · ${esc(t('nouveau record !'))}` : prevValid ? ` · ${esc(t('record : {t:w}', { t: formatTime(prev.time) }))}` : ''}</p>
      ${run.aided ? `<p class="meta">${esc(t('Avec aides à la conduite : classement « avec aides », à part.'))}</p>` : ''}
      <ol class="chain-legs">${rows}</ol><p class="fin-online hidden" id="chain-online" role="status"></p>`;
    this.ui.modal({
      title: this._chainTitle('🏁', run.ch), body,
      actions: [
        { label: t('Carrière'), onClick: () => { setTimeout(() => this.quitRace(), 0); return true; } },
        { label: '🏆 ' + t('Classement'), onClick: () => { setTimeout(() => this.chainBoard(key, run.ch), 0); return true; } },
        { label: t('Recommencer l’enchaînement'), primary: true, onClick: () => { setTimeout(() => this.restartChain(), 0); return true; } },
      ],
    });
    if (isRecord) this._submitChain(run.submission(PHYS_VER), body.querySelector('#chain-online'));
  },

  // Envoi au serveur (action submit-chain) : il rejoue les 6 manches. say : l'élément où écrire le résultat (peut avoir quitté l'écran).
  async _submitChain(sub, el) {
    if (this.settings.onlineScores === false) return null;
    const say = (cls, text) => { if (!el) return; el.classList.remove('hidden', 'ok', 'ko'); if (cls) el.classList.add(cls); el.textContent = text; };
    say('', t('🌍 Envoi au classement…'));
    try {
      const r = await online.submitChain(sub, this.settings.playerName);
      say('ok', r.improved ? t('🌍 Classement de l’enchaînement : {r:w} sur {n:w}', { r: r.rank, n: r.total }) : t('🌍 Meilleur temps en ligne : {t:w} ({r:w} sur {n:w})', { t: formatTime(r.best), r: r.rank, n: r.total }));
      return r;
    } catch (e) {
      // Fonction serveur d'avant cette épreuve (« Action inconnue. ») : pas encore redéployée. Le record reste sur l'appareil, il pourra être envoyé depuis le classement.
      if (e && /Action inconnue/.test(e.message || '')) say('ko', t('🌍 Le serveur n’accepte pas encore les enchaînements (mise à jour en attente) : ton temps reste sur l’appareil.'));
      else say('ko', e && e.code === 'version-mismatch' ? versionMismatchText(e, PHYS_VER) : fr('🌍 Classement : {m:t}', { m: (e && e.message) || '' }));
      return null;
    }
  },

  // Classement dédié d'un enchaînement (le même panneau que les circuits, sans fantômes : un enchaînement n'en a pas).
  chainBoard(key, ch) {
    const body = document.createElement('div');
    body.className = 'lb-panel';
    this.ui.modal({ title: this._chainTitle('🏆', ch), body, actions: [{ label: t('Fermer'), primary: true }] });
    renderWorldBoard(body, { key, track: null, recordKeys: [key], chain: true }, { app: this });
  },

  // Soumission reconstruite depuis le record (bouton « Envoyer mon record » du classement).
  chainSubmissionOf(key) { return submissionFromRecord(key, getRecord(key), PHYS_VER); },
};
