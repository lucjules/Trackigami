// Interface DOM : écrans, HUD, fenêtres modales, notifications.
import { formatTime, medalTime } from './storage.js';
import { MEDALS } from './medals.js';
import { keyLabel } from './input.js';
import { profile } from './profile.js';
import { MessageGate, PRIO } from './hudMessages.js';
import { $, esc } from './dom.js';
import { markPlayerText, isPlayerTrackName } from './playerText.js';

export function medalIcon(m) {
  return `<i class="medal ${m ? m.id : 'none'}" title="${m ? m.label : 'Aucune médaille'}"></i>`;
}

const SCREENS = ['loading', 'menu', 'tracks', 'race-hub', 'mytracks', 'community', 'profile'];

class Hud {
  constructor() {
    this.el = {
      time: $('hud-time'), split: $('hud-split'), cp: $('hud-cp'), best: $('hud-best'),
      medals: $('hud-medals'), speed: $('hud-speed'), boost: $('hud-boost'), center: $('hud-center'),
      msg: $('hud-msg'), hint: $('hud-hint'), track: $('hud-track'),
    };
    this.root = $('hud');
    this._last = {};
    this.gate = new MessageGate();
  }

  reset(session) {
    const e = this.el;
    markPlayerText(e.track, isPlayerTrackName(session.track.name));      // (RISK-002 : le nom d'un circuit de joueur n'est pas traduit)
    e.track.textContent = session.track.name;
    this.checkpoints(0, session.logic.cps.length);
    const rec = session.record;
    e.best.innerHTML = rec ? `Record ${formatTime(rec.time)}` : 'Pas encore de record';
    const medals = session.medals;
    if (medals) {
      e.medals.innerHTML = MEDALS.map((m) => {
        const got = rec && medalTime(rec) <= medals[m.id];
        return `<div class="${got ? 'got' : ''}">${medalIcon(m)}${formatTime(medals[m.id])}</div>`;
      }).join('');
    } else e.medals.innerHTML = '';
    e.split.textContent = '';
    e.center.textContent = '';
    e.msg.classList.remove('on');
    clearTimeout(this._msgT);
    this.gate.offer('', 0, 0, 0);      // (TECH-070) le verrou de priorité repart à zéro : un message prioritaire d'avant le redémarrage ne fait pas refuser la consigne de la leçon au GO
    this.time(0);
    const inp = session.app.input;
    session.app.refreshKeyHints();      // (pause, arrivée, barre du replay : les touches citées suivent les liaisons actuelles, TECH-020)
    const k = (id) => (inp.bindings[id] || []).filter(Boolean).map(keyLabel).join(' / ') || '—';
    e.hint.textContent = `${k('accelerate')} ${k('brake')} ${k('left')} ${k('right')} · frein en virage : dérapage · ${k('respawn')} : dernier checkpoint · ${k('restart')} : recommencer · ${k('camera')} : caméra · ${k('horn')} : klaxon · ${k('pause')} : pause`;
    e.hint.style.opacity = '1';
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { e.hint.style.opacity = '0'; }, 7000);
  }

  time(t, final = false) {
    const txt = formatTime(t);
    if (txt !== this._last.time) { this.el.time.textContent = txt; this._last.time = txt; }
    this.el.time.style.color = final ? 'var(--good)' : '';
  }

  split(diff, t) {
    const e = this.el.split;
    clearTimeout(this._splitT);
    if (diff == null) {
      e.className = 'hud-split';
      e.textContent = formatTime(t);
    } else {
      e.className = 'hud-split ' + (diff <= 0 ? 'good' : 'bad');
      e.textContent = formatTime(diff, true);
    }
    e.style.opacity = '1';
    this._splitT = setTimeout(() => { e.style.opacity = '0'; }, 2600);
  }

  checkpoints(n, m, lap = 0, laps = 1) {
    const lp = laps > 1 ? ` · Tour ${lap} / ${laps}` : '';
    this.el.cp.textContent = (m ? `◆ ${n} / ${m}` : '◆ —') + lp;
  }

  speed(kmh, boost) {
    const v = Math.round(kmh);
    if (v !== this._last.speed) { this.el.speed.textContent = v; this._last.speed = v; }
    const b = Math.round((boost / 1.6) * 100);
    if (b !== this._last.boost) { this.el.boost.style.width = b + '%'; this._last.boost = b; }
    const s = Math.min(100, Math.round((kmh / 400) * 100));
    if (s !== this._last.spd) { this.root.style.setProperty('--spd', String(s / 100)); this._last.spd = s; }
  }

  center(text, pop = false) {
    const e = this.el.center;
    e.textContent = text;
    if (pop) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
  }

  // prio : voir hudMessages.js (un message moins important ne coupe pas le courant ; pas de répétition immédiate). Renvoie true si le message est affiché (false : refusé par le verrou).
  // prio hint : le rappel discret d'une mécanique (petit, sans italique : css .hud-msg.hint).
  message(text, dur = 1.5, prio = PRIO.info) {
    const e = this.el.msg;
    if (!text) { clearTimeout(this._msgT); e.classList.remove('on'); this.gate.offer('', 0, 0, 0); return false; }
    if (!this.gate.offer(text, dur * 1000, prio, performance.now())) return false;
    e.textContent = text;
    e.classList.toggle('hint', prio === PRIO.hint);
    e.classList.add('on');
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => e.classList.remove('on'), dur * 1000);
    return true;
  }
}

export class UI {
  constructor(app) {
    this.app = app;
    this.hud = new Hud();
  }

  showScreen(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    $('coins').classList.toggle('hidden', !['menu', 'tracks', 'mytracks', 'profile'].includes(name));
    const first = name && $(name).querySelector('button');
    if (first && matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
  }

  updateCoins() {
    const c = $('coins');
    if (c) c.textContent = `◆ ${profile().coins}`;
  }

  // Lignes de vitesse sur les bords de l'écran (0 = rien, 1 = plein effet).
  speedFx(k) {
    const el = $('speedfx');
    if (!el) return;
    const v = k < 0.02 ? 0 : k;
    if (Math.abs(v - (this._fx || 0)) < 0.02 && v !== 0) return;
    this._fx = v;
    el.style.opacity = String(v * 0.55);
  }

  setMode(mode) {
    if (mode !== 'race') this.speedFx(0);
    document.body.classList.toggle('in-race', mode === 'race');      // (css : place du bouton plein écran du tactile)
    const showCoins = mode === 'menu';
    $('coins').classList.toggle('hidden', !showCoins);
    this.updateCoins();
    $('hud').classList.toggle('hidden', mode !== 'race');
    $('editor').classList.toggle('hidden', mode !== 'editor');
    $('touch').classList.toggle('hidden', !(mode === 'race' && document.body.classList.contains('touch')));
    this.hideOverlay('pause');
    this.hideOverlay('finish');
    this._syncInput();
  }

  // Arbitre d'entrées : l'ouverture ou la fermeture d'une superposition / d'une fenêtre change le contexte tout de suite (js/input.js), ce qui vide les
  // appuis en attente : l'Entrée qui active « Reprendre » ne doit pas être relue ensuite comme « recommencer ».
  _syncInput() { if (this.app && this.app._syncInput) this.app._syncInput(); }

  showOverlay(id) {
    $(id).classList.remove('hidden');
    document.body.classList.add('ov-open');
    const b = $(id).querySelector('.btn.primary');
    if (b && matchMedia('(pointer: fine)').matches) b.focus({ preventScroll: true });
    this._syncInput();
  }

  hideOverlay(id) {
    $(id).classList.add('hidden');
    if (['pause', 'finish'].every((o) => $(o).classList.contains('hidden'))) document.body.classList.remove('ov-open');
    this._syncInput();
  }

  flash(text, dur = 2.4) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), dur * 1000);
  }

  // actions : [{ label, primary, danger, onClick }] ; onClick renvoie false pour garder la fenêtre ouverte.
  // onClose : appelé une fois quand la fenêtre se ferme (bouton, Échap, ou remplacée par une autre) : arrêter une écoute, un minuteur...
  modal({ title, body, actions = [], wide = false, onClose = null, panelClass = '' }) {
    if (this.app.input) this.app.input.cancelCapture();      // une fenêtre qui s'ouvre prend la main : la capture de liaison en attente est annulée (TECH-006)
    this._fireModalClose();
    this._onModalClose = onClose;
    $('modal-title').textContent = title;
    const panel = $('modal').querySelector('.modal-panel');
    panel.classList.toggle('wide', !!wide);     // large : raccourcis, listes en colonnes
    if (this._panelClass) panel.classList.remove(this._panelClass);      // (0.13.1) classe propre à une fenêtre (salon multijoueur en grand) : retirée à la suivante
    this._panelClass = panelClass || '';
    if (panelClass) panel.classList.add(panelClass);
    const b = $('modal-body');
    b.innerHTML = '';
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    const a = $('modal-actions');
    a.innerHTML = '';
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (act.primary ? ' primary' : '') + (act.danger ? ' danger' : '');
      btn.textContent = act.label;
      if (act.attrs) for (const [k, v] of Object.entries(act.attrs)) btn.setAttribute(k, v);
      btn.addEventListener('click', () => {
        this.app.audio.click();
        const keep = act.onClick ? act.onClick() === false : false;
        if (!keep) this.closeModal();
      });
      a.appendChild(btn);
    }
    // Le focus clavier appartient à la fenêtre : sans cela, Entrée activerait encore le bouton focalisé DERRIÈRE elle (« Rejouer » de l'arrivée, par exemple).
    // On ne met le focus sur aucun bouton (rien à activer par un Entrée tenu) : sur la fenêtre elle-même ; Tab et les flèches y entrent. Rendu à la fermeture.
    if (!this.modalOpen) this._returnFocus = document.activeElement;
    $('modal').classList.remove('hidden');
    this.modalOpen = true;
    if (!panel.contains(document.activeElement)) { panel.tabIndex = -1; panel.focus({ preventScroll: true }); }
    // Un Échap appuyé AVANT l'ouverture (pas encore lu par la boucle) ne doit pas refermer cette fenêtre au tour suivant.
    if (this.app.input && this.app.input.pressed) this.app.input.pressed.delete('Escape');
    this._syncInput();
  }

  _fireModalClose() { const f = this._onModalClose; this._onModalClose = null; if (f) f(); }

  closeModal() {
    const wasOpen = this.modalOpen;
    $('modal').classList.add('hidden');
    this.modalOpen = false;
    this._syncInput();
    // Le focus revient où il était avant la fenêtre (s'il y est encore et visible) : le clavier ne perd pas sa place.
    const back = this._returnFocus;
    this._returnFocus = null;
    if (wasOpen && back && back.isConnected && back !== document.body && back.offsetParent !== null) back.focus({ preventScroll: true });
    this._fireModalClose();
  }

  showFinish(info) {
    $('fin-replay').classList.toggle('hidden', !info.canReplay);
    $('fin-online').classList.add('hidden');
    $('fin-board').classList.toggle('hidden', !info.canBoard);
    $('fin-hub').classList.toggle('hidden', !info.canHub);
    const gl = $('fin-goal');
    if (gl) {
      gl.classList.toggle('hidden', !info.goal);
      if (info.goal) {
        const g = info.goal;
        gl.className = 'fin-goal ' + (g.met || g.already ? 'ok' : 'ko');
        gl.textContent = `★ Objectif bonus : ${g.label} — ${g.met ? (g.coins ? `réussi ! +${g.coins} ◆` : 'réussi') : g.already ? 'déjà réussi' : 'raté'}`;
      }
    }
    $('fin-ghost').classList.toggle('hidden', !info.canShareGhost);
    $('fin-title').textContent = info.isRecord ? (info.prevTime == null ? 'Premier temps !' : 'Nouveau record !') : 'Arrivée !';
    $('fin-title').className = info.isRecord ? 'fin-record' : '';
    $('fin-time').textContent = formatTime(info.time);
    $('fin-medal').innerHTML = info.medals ? medalIcon(info.medal) : '';
    const lines = [];
    if (info.prevTime != null) {
      const d = info.time - info.prevTime;
      lines.push(`Ancien record : <b>${formatTime(info.prevTime)}</b> (${formatTime(d, true)})`);
    }
    if (info.medals) {
      if (info.medal) lines.push(`${info.newMedal ? 'Médaille obtenue' : 'Médaille'} : <b>${info.medal.label}</b>`);
      const best = Math.min(info.time, info.prevTime ?? Infinity);
      const next = [...MEDALS].reverse().find((m) => best > info.medals[m.id]);
      if (next) lines.push(`Prochain objectif : ${medalIcon(next)}<b>${formatTime(info.medals[next.id])}</b>`);
      else lines.push('Toutes les médailles sont à toi ✦');
    }
    const rw = $('fin-reward');
    if (info.incident) {
      rw.innerHTML = '<small>Incident pendant la course : arrivée non enregistrée (ni record, ni récompense, ni replay).</small>';
    } else if (info.reward) {
      rw.innerHTML = `+${info.reward.coins} ◆ pièces${info.reward.first ? '<small>Bonus 1re fois ×2</small>' : ''}`;
    } else if (info.verified) {
      rw.innerHTML = 'Circuit vérifié ✔<small>Ton temps = médaille cristal.</small>';
    } else if (info.unverifiedUser) {
      rw.innerHTML = '<small>Circuit non vérifié : pas de médailles ni de pièces.</small>';
    } else rw.innerHTML = '';
    if (info.verified && info.derived) {
      lines.push(MEDALS.slice().reverse().map((m) => `${medalIcon(m)}<b>${formatTime(info.derived[m.id])}</b>`).join(' · '));
    }
    $('fin-detail').innerHTML = lines.join('<br>');
    // Progression du pilote (E14) : l'expérience gagnée et le niveau.
    const fx = $('fin-xp');
    if (fx) {
      fx.classList.toggle('hidden', !info.xp);
      if (info.xp) {
        const x = info.xp, pct = x.max ? 100 : Math.round((x.into / Math.max(1, x.need)) * 100);
        fx.innerHTML = `<span class="xp-gain">+${x.xp} XP</span> <span class="xp-lv">Niveau ${x.level}${x.level > x.prevLevel ? ' ⬆' : ''}</span>
          <span class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>
          <small class="xp-why">${x.parts.map(([w, n]) => `<span>${esc(w)} +${n}</span>`).join(' · ')}</small>`;
      }
    }
    $('fin-next').classList.toggle('hidden', !info.hasNext);
    $('fin-quit').textContent = info.fromEditor ? 'Retour à l’éditeur' : 'Menu';
    this.showOverlay('finish');
  }
}

