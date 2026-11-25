// Recette de stabilisation (phase 21) : outils communs des parcours d'interface. Ce n'est PAS un test de la suite (aucun `test-*.mjs`, rien dans `npm test`) :
// ces scripts constatent et écrivent un rapport JSON, ils ne corrigent rien et ne modifient aucun fichier du jeu.
//   Sorties (captures, JSON) : RECETTE_OUT (par défaut /tmp/recette) : hors du dépôt.
//   Playwright n'est pas une dépendance du projet (voir docs/TESTS.md).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = process.env.RECETTE_OUT || '/tmp/recette';
mkdirSync(OUT, { recursive: true });

// Les polices Google et Supabase ne sont pas joignables ici : ces échecs réseau ne sont pas des erreurs du jeu (même filtre que tools/test-browser.mjs).
export const OFFLINE = /fonts\.(googleapis|gstatic)|supabase\.co|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function startServer(port) {
  return spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
}
export const launchBrowser = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--disable-features=WebRtcHideLocalIpsWithMdns'] });

// Configurations : langue × mode d'entrée. kb = clavier + souris ; land / port = téléphone simulé (écran tactile, 844×390 / 390×844).
export const VIEWPORTS = { kb: { width: 1280, height: 720 }, land: { width: 844, height: 390 }, port: { width: 390, height: 844 } };
export function ctxOptions(lang, input) {
  const touch = input !== 'kb';
  return { locale: lang === 'en' ? 'en-US' : 'fr-FR', viewport: VIEWPORTS[input], deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' };
}

// Audit d'un écran, exécuté DANS la page. Ne modifie rien (hormis le défilement pour atteindre un bouton). Retourne ce qu'il constate.
//   covered : bouton dont le centre est recouvert par autre chose ; offscreen : bouton qu'aucun défilement n'amène à l'écran ;
//   small (tactile seulement) : cible de moins de 32 px ; french (anglais seulement) : texte qui ressemble à du français (heuristique du jeu, looksFrench) ;
//   bad : « NaN », « undefined », « [object », « null » dans le texte affiché ; clipped : texte plus large que sa boîte (indicatif) ; hscroll : la page défile en largeur.
export async function auditPage(page, { lang, touch }) {
  return page.evaluate(async ({ lang, touch }) => {
    const vis = (el) => { try { return el.checkVisibility({ checkVisibilityCSS: true }); } catch { return !!el.offsetParent; } };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    const desc = (el) => el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.dataset && el.dataset.action ? '[' + el.dataset.action + ']' : '') + (el.dataset && el.dataset.t ? '[t=' + el.dataset.t + ']' : '') + ' « ' + label(el) + ' »' : 'rien';
    const out = { layer: 'aucune', covered: [], offscreen: [], small: [], french: [], bad: [], clipped: [], hscroll: false, controls: 0, text: '' };
    const overlays = [...document.querySelectorAll('.overlay, .theater-panel')].filter(vis);
    const welcome = document.getElementById('welcome');
    const top = overlays.length ? overlays[overlays.length - 1] : (welcome && vis(welcome) ? welcome : null);
    out.layer = top ? (top.id || top.className) : 'aucune';
    const scope = top || document.body;
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=button], [role=switch], [role=checkbox], [data-action], [data-t], summary';
    const seen = new Set();
    const scrolled = [...document.querySelectorAll('*')].filter((e) => (e.scrollTop || e.scrollLeft)).map((e) => [e, e.scrollTop, e.scrollLeft]);
    const restore = () => { for (const e of document.querySelectorAll('*')) { if (e.scrollTop || e.scrollLeft) { const k = scrolled.find((q) => q[0] === e); e.scrollTop = k ? k[1] : 0; e.scrollLeft = k ? k[2] : 0; } } for (const [e, t, l] of scrolled) { e.scrollTop = t; e.scrollLeft = l; } };
    for (const el of scope.querySelectorAll(sel)) {
      if (seen.has(el) || !vis(el)) continue;
      seen.add(el);
      if (!top && el.closest('.overlay, .welcome, #loading')) continue;       // sous une fenêtre fermée : rien
      let r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.controls++;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) { try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch { /* sans importance */ } r = el.getBoundingClientRect(); }
      if (r.right <= 0 || r.left >= window.innerWidth) { out.folded = (out.folded || 0) + 1; continue; }       // panneau replié hors de l'écran à gauche ou à droite (tiroir) : pas un défaut en soi
      if (r.bottom <= 0 || r.top >= window.innerHeight) { out.offscreen.push(desc(el)); continue; }
      const x = Math.min(window.innerWidth - 1, Math.max(0, r.x + r.width / 2)), y = Math.min(window.innerHeight - 1, Math.max(0, r.y + r.height / 2));
      const test = () => { const rr = el.getBoundingClientRect(); const xx = Math.min(window.innerWidth - 1, Math.max(0, rr.x + rr.width / 2)), yy = Math.min(window.innerHeight - 1, Math.max(0, rr.y + rr.height / 2)); const h = document.elementFromPoint(xx, yy), lab = el.closest('label'); return { h, ok: !!h && (el === h || el.contains(h) || (lab && lab.contains(h))) }; };
      let t = test();
      // Un bouton hors de la zone visible de son conteneur qui défile n'est pas « recouvert » : le joueur fait défiler. On le ramène au centre, puis on juge.
      if (!t.ok) { try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch { /* sans importance */ } t = test(); }
      if (!t.ok && t.h && t.h.closest && t.h.closest('#rotate-hint')) out.rotate = true;
      else if (!t.ok) out.covered.push(desc(el) + ' ← ' + desc(t.h));
      void x; void y;
      if (touch && (r.width < 32 || r.height < 32) && !el.closest('.touch-hidden')) out.small.push(desc(el) + ` ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // texte affiché
    const texts = [];
    const walker = document.createTreeWalker(scope, window.NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || !vis(p) || p.closest('[data-i18n="off"]') || (p.closest('[lang]') && p.closest('[lang]') !== document.documentElement) || p.closest('canvas')) continue;
      if (!top && p.closest('.overlay, .welcome, #loading')) continue;
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t) texts.push(t);
    }
    out.text = texts.join(' | ').slice(0, 6000);
    for (const t of texts) if (/\bNaN\b|\bundefined\b|\[object |\bnull\b|\{\{|\$\{/.test(t)) out.bad.push(t.slice(0, 80));
    if (lang === 'en') {
      const { looksFrench } = await import('/js/i18n.js');
      const seenT = new Set();
      const FR_WORDS = /(^|[^\p{L}])(le|la|les|des|une|du|pour|avec|sans|dans|est|pas|serveur|injoignable|connexion|nouveau|nouvelle|réessaie|erreur|impossible|réseau|chargement|joueurs?|aucun|aucune)([^\p{L}]|$)/iu;
      for (const t of texts) { const fr = /[A-Za-zÀ-ÿ]{3}/.test(t) && looksFrench(t), w = !fr && FR_WORDS.test(t); if ((fr || w) && !seenT.has(t)) { seenT.add(t); out.french.push((w ? '[mot français] ' : '') + t.slice(0, 90)); } }
    }
    let nc = 0;
    for (const el of scope.querySelectorAll('*')) {
      if (nc >= 8) break;
      if (!vis(el) || el.clientWidth < 8 || !el.childElementCount === false) continue;
      const cs = getComputedStyle(el);
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 3 && label(el).length > 2 && !/canvas/i.test(el.tagName)) { out.clipped.push(desc(el) + ` ${el.scrollWidth}>${el.clientWidth}`); nc++; }
    }
    restore();
    out.hscroll = document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1;
    return out;
  }, { lang, touch });
}

// Une exécution : une configuration (langue, entrée), un profil neuf, des étapes consignées une à une dans OUT/<id>.json.
export class Recette {
  constructor(browser, port, lang, input, tag = '') {
    this.browser = browser; this.port = port; this.lang = lang; this.input = input; this.touch = input !== 'kb';
    this.id = `${lang}-${input}${tag}`;
    this.dir = join(OUT, this.id); mkdirSync(this.dir, { recursive: true });
    this.steps = []; this.errors = []; this.net = 0; this.n = 0;
    this.base = `http://127.0.0.1:${port}/`;
  }
  async init(extraCtx = {}) {
    this.ctx = await this.browser.newContext({ ...ctxOptions(this.lang, this.input), ...extraCtx });
    this.page = await this.ctx.newPage();
    this.hook(this.page);
    return this;
  }
  hook(p) {
    p.on('pageerror', (e) => this.errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') { const t = m.text() + (m.location().url || ''); if (OFFLINE.test(t)) this.net++; else this.errors.push('console: ' + m.text()); } });
    p.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  }
  get page_() { return this.page; }
  save() { writeFileSync(join(OUT, this.id + '.json'), JSON.stringify({ id: this.id, lang: this.lang, input: this.input, net: this.net, steps: this.steps }, null, 1)); }
  // Une étape : fn() puis audit. status = ok si aucune exception, aucune erreur console et aucun constat d'audit ; sinon « défaut » (avec le détail).
  async step(label, fn, { audit = true, shot = true, soft = ['cible < 32 px'] } = {}) {
    const t0 = Date.now(), e0 = this.errors.length;
    const rec = { n: ++this.n, label, status: 'ok', issues: [], errors: [], shot: null, ms: 0, state: null };
    try { if (fn) await fn(); } catch (e) { rec.status = 'defaut'; rec.issues.push('étape interrompue : ' + String(e.message).split('\n')[0].slice(0, 300)); }
    try {
      if (audit) {
        const a = await auditPage(this.page, { lang: this.lang, touch: this.touch });
        rec.layer = a.layer; rec.controls = a.controls; rec.text = a.text;
        const add = (k, arr, keep = 8) => { if (arr.length && !soft.includes(k)) { rec.status = 'defaut'; rec.issues.push(`${k} (${arr.length}) : ` + arr.slice(0, keep).join(' ; ')); } else if (arr.length) rec.issues.push(`(indicatif) ${k} (${arr.length}) : ` + arr.slice(0, keep).join(' ; ')); };
        add('recouvert', a.covered); add('hors écran', a.offscreen); add('non traduit', a.french, 12); add('texte brut', a.bad); add('cible < 32 px', a.small);
        if (a.folded) rec.issues.push(`(indicatif) ${a.folded} contrôles dans un panneau replié hors de l’écran`);
        if (a.rotate) rec.issues.push('(indicatif) l’invite « Tourne ton téléphone » recouvre l’écran (voulu en portrait pendant une course)');
        if (a.hscroll) { rec.status = 'defaut'; rec.issues.push('la page défile en largeur'); }
        if (a.clipped.length) rec.issues.push('(indicatif) texte plus large que sa boîte (' + a.clipped.length + ') : ' + a.clipped.slice(0, 5).join(' ; '));
      }
      rec.state = await this.page.evaluate(() => { const A = window.copytrack; return A ? { mode: A.mode, screens: [...document.querySelectorAll('.screen:not(.hidden)')].map((e) => e.id).join('+'), modal: A.ui && A.ui.modalOpen ? (document.getElementById('modal-title') || {}).textContent : null, session: A.session && A.session.state } : null; }).catch(() => null);
      if (shot) { rec.shot = join(this.dir, String(rec.n).padStart(3, '0') + '-' + label.replace(/[^a-zA-Z0-9À-ÿ]+/g, '_').slice(0, 40) + '.png'); await this.page.screenshot({ path: rec.shot }); }
    } catch (e) { rec.issues.push('audit impossible : ' + String(e.message).split('\n')[0].slice(0, 200)); rec.status = 'defaut'; }
    rec.errors = this.errors.slice(e0);
    if (rec.errors.length) rec.status = 'defaut';
    rec.ms = Date.now() - t0;
    this.steps.push(rec);
    console.log(`[${this.id}] ${String(rec.n).padStart(3)} ${rec.status === 'ok' ? 'ok    ' : 'DEFAUT'} ${label}${rec.issues.length ? '\n        ' + rec.issues.join('\n        ').slice(0, 900) : ''}${rec.errors.length ? '\n        erreurs: ' + rec.errors.join(' | ').slice(0, 400) : ''}`);
    this.save();
    return rec;
  }
  // --- gestes -------------------------------------------------------------------------------------------------------------------------------------
  // Clic souris réel (clavier) ou toucher réel (tactile) au centre de l'élément, après avoir VÉRIFIÉ que le point visé lui appartient : sinon l'échec dit ce qui le recouvre.
  async press(sel, timeout = 8000) {
    const p = this.page, loc = p.locator(sel).first();
    await loc.waitFor({ state: 'visible', timeout });
    await loc.scrollIntoViewIfNeeded({ timeout });
    await p.waitForTimeout(200);
    const r = await loc.evaluate((el) => { const b = el.getBoundingClientRect(), x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2), hit = document.elementFromPoint(x, y); const d = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ').join('.') : '') : 'rien'; return { x, y, ok: !!hit && (el === hit || el.contains(hit)), hit: d(hit) }; });
    if (!r.ok) throw new Error(`${sel} est recouvert par ${r.hit} en (${r.x}, ${r.y})`);
    if (this.touch) await p.touchscreen.tap(r.x, r.y); else await p.mouse.click(r.x, r.y);
  }
  // Sans vérification de recouvrement (boutons animés ou hors fenêtre) : clic programmatique.
  async fire(sel) { await this.page.locator(sel).first().evaluate((el) => el.click()); }
  async until(fn, arg, timeout = 20000) { await this.page.waitForFunction(fn, arg, { timeout, polling: 100 }); }
  $(fn, arg) { return this.page.evaluate(fn, arg); }
  async key(k) { await this.page.keyboard.press(k); }
  // Accélérer (tenir) / relâcher : clavier ou bouton tactile (événements pointeur : un vrai maintien tactile n'est pas simulable par Playwright).
  async gas(on) {
    if (this.touch) await this.page.locator('#touch [data-t="gas"]').dispatchEvent(on ? 'pointerdown' : 'pointerup');
    else await this.page.keyboard[on ? 'down' : 'up']('ArrowUp');
  }
  // Démarrage : accueil → pseudo → menu ; retourne quand le jeu est au menu.
  async load(name = 'Recette') {
    for (let i = 0; i < 60; i++) { try { const r = await fetch(this.base); if (r.ok) break; } catch { /* le serveur démarre */ } await sleep(250); }
    await this.page.goto(this.base, { waitUntil: 'load' });
    await this.page.locator('#welcome').waitFor({ state: 'visible', timeout: 60000 });
    this.name = name;
  }
  async enter(name = this.name) {
    await this.page.locator('#wl-name').fill(name);
    await this.fire('#wl-submit');
    await this.until(() => window.copytrack && window.copytrack.mode === 'menu', null, 60000);
  }
  // Fait terminer la course en cours par le pilote automatique, en avançant la session « à la main » (le vrai écran d'arrivée s'affiche ensuite par la vraie boucle).
  async finishWithBot(maxCalls = 4000) {
    await this.until(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 60000);
    const r = await this.page.evaluate(async (maxCalls) => {
      const A = window.copytrack, S = A.session;
      const { Autopilot } = await import('/js/autopilot.js');
      // Un circuit de joueur (éditeur) n'a pas de ligne du pilote : on la tire de l'axe des pièces, dans l'ordre de pose.
      let path = S.track.path;
      if (!path) { const { centerlineWorld } = await import('/js/ribbons.js'); path = []; for (const t of S.track.tiles) for (const p of centerlineWorld(t, 8)) { const q = path[path.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[2] - p[2]) > 0.5) path.push(p); } }
      const bot = new Autopilot(path, { latLimit: 56 * 0.8 });
      bot.reset(S.phys);
      const real = A.input.drive;
      A.input.drive = () => { if (S.state !== 'racing') return { steer: 0, throttle: false, brake: false, drift: false }; const c = bot.control(S.phys); return { steer: c.steer, throttle: !!c.throttle, brake: !!c.brake, drift: false }; };
      let calls = 0;
      while (S.state !== 'finished' && S.state !== 'idle' && calls < maxCalls && A.session === S) { S.update(0.1, 1); calls++; if (calls % 40 === 0) await new Promise((r) => setTimeout(r, 0)); }
      A.input.drive = real;
      return { state: S.state, calls, time: S.logic && S.logic.time };
    }, maxCalls);
    return r;
  }
}
