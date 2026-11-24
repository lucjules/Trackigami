// Jeu hors ligne (phase 3 de la 1.0) : tout fichier dont le démarrage a besoin est dans la copie du service worker (sw.js), et la garde de démarrage
// n'efface jamais cette copie hors ligne. Le parcours réel (première visite, puis redémarrage sans réseau) est dans tools/test-browser-boot.mjs.
//   node tools/test-hors-ligne.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const FILES = new Set(JSON.parse(/const FILES = (\[[\s\S]*?\]);/.exec(read('sw.js'))[1]));

// Modules atteints depuis js/main.js, par import statique ET dynamique (import('…') à chemin fixe) : tous peuvent être demandés hors ligne.
function closure(entry) {
  const seen = new Set([entry]), q = [entry];
  for (let i = 0; i < q.length; i++) {
    const text = read(q[i]);
    const specs = [...text.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/gm)].map((m) => m[1] || m[2] || m[3]);
    for (const s of specs) {
      const f = relative(root, join(root, dirname(q[i]), s)).split('\\').join('/');
      if (!seen.has(f)) { seen.add(f); q.push(f); }
    }
  }
  return [...seen];
}

test('chaque module du jeu (imports statiques et dynamiques depuis js/main.js) est dans la copie hors ligne du service worker', () => {
  const missing = closure('js/main.js').filter((f) => !FILES.has(f));
  assert.deepEqual(missing, []);
  for (const f of ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'js/boot-guard.js', 'js/verify.js']) assert.ok(FILES.has(f), f);
  for (const f of FILES) if (/\.woff2$/.test(f)) assert.match(f, /^assets\/fonts\//);
});

test('la garde de démarrage n’efface jamais la copie hors ligne quand le réseau est coupé', () => {
  const g = read('js/boot-guard.js');
  const i = g.indexOf('function repair()'), j = g.indexOf('caches.delete', i);
  assert.ok(i > 0 && j > i);
  assert.match(g.slice(i, j), /if \(navigator\.onLine === false\) \{ say\(T\.offline, true\); return; \}/);
});


// ---- Le service worker lui-même (TECH-080 c, d), exécuté dans un bac à sable avec de faux `caches` et un faux réseau ----
const SW_SRC = read('sw.js');
const ORIGIN = 'https://jeu.test', SCOPE = ORIGIN + '/';
function loadSW(network) {
  const handlers = {}, store = new Map();
  const bucket = (n) => { if (!store.has(n)) store.set(n, new Map()); return store.get(n); };
  const url = (r) => (typeof r === 'string' ? r : r.url);
  const caches = {
    open: async (n) => { const m = bucket(n); return {
      put: async (r, res) => { m.set(url(r), res); },
      addAll: async (rs) => { for (const r of rs) { const res = await network(r); if (!res.ok) throw new Error('addAll ' + url(r)); m.set(new URL(url(r), SCOPE).href, res); } },
      keys: async () => [...m.keys()].map((u) => new Request(u)), delete: async (r) => m.delete(url(r)) }; },
    match: async (r) => { for (const m of store.values()) if (m.has(url(r))) return m.get(url(r)).clone(); return undefined; },
    keys: async () => [...store.keys()], delete: async (n) => store.delete(n),
  };
  const self = { location: new URL(SCOPE + 'sw.js'), registration: { scope: SCOPE }, addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} } };
  // (dans un vrai service worker, une adresse relative se résout par rapport à sw.js : même chose ici)
  class SWRequest extends Request { constructor(i, init) { super(typeof i === 'string' ? new URL(i, SCOPE).href : i, init); } }
  vm.runInNewContext(SW_SRC, { self, caches, fetch: (r) => network(r), Request: SWRequest, Response, URL, Promise });
  const ev = async (type, extra = {}) => { let resp; const waits = []; handlers[type]({ ...extra, respondWith: (p) => { resp = p; }, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); return { responded: resp !== undefined, response: resp ? await resp : undefined }; };
  // une requête : { url, mode } ; navigate : objet simple (un vrai Request ne peut pas avoir ce mode)
  const get = (u, mode = 'cors') => ev('fetch', { request: mode === 'navigate' ? { url: new URL(u, SCOPE).href, method: 'GET', mode } : new Request(new URL(u, SCOPE).href) });
  const cacheName = () => [...store.keys()][0];
  const size = () => (store.size ? [...store.values()].reduce((n, m) => n + m.size, 0) : 0);
  const keys = () => [...store.values()].flatMap((m) => [...m.keys()]);
  return { ev, get, store, size, keys, cacheName };
}
const online = async (r) => new Response('contenu de ' + new URL(typeof r === 'string' ? r : r.url, SCOPE).pathname, { status: 200 });
const offline = async () => { throw new TypeError('Failed to fetch'); };

await test('TECH-080 c : la vérification de mise à jour (js/version.js?u=…) ne passe pas par le cache : jamais gardée, quel que soit le nombre de vérifications', async () => {
  const sw = loadSW(online);
  await sw.ev('install'); const before = sw.size();
  assert.equal(before, FILES.size, 'installation : exactement la liste des fichiers');
  for (let i = 0; i < 200; i++) { const r = await sw.get('js/version.js?u=' + (1700000000 + i * 1800)); assert.equal(r.responded, false, 'le service worker laisse passer la requête au réseau'); }
  assert.equal(sw.size(), before, 'le cache n’a pas grossi');
  assert.ok(!sw.keys().some((k) => k.includes('?')), 'aucune adresse à paramètres dans le cache');
  assert.match(read('js/updateCheck.js'), /js\/version\.js\?u=/, 'c’est bien cette adresse que le jeu demande');
});
await test('TECH-080 c : le cache est borné : seuls les fichiers connus entrent, sans paramètres (mille adresses inconnues ou à paramètres, rien de plus)', async () => {
  const sw = loadSW(online); await sw.ev('install'); const before = sw.size();
  for (let i = 0; i < 300; i++) {
    await sw.get(`wiki/page-${i}.html`); await sw.get(`index.html?x=${i}`); await sw.get(`js/main.js?v=${i}`); await sw.get(`assets/inconnu-${i}.png`); await sw.get(`?utm=${i}`, 'navigate');
  }
  assert.equal(sw.size(), before, 'aucune entrée ajoutée');
  assert.ok(sw.keys().every((k) => !k.includes('?') && FILES.has(new URL(k).pathname.slice(1) || './')), 'toutes les entrées sont des fichiers de la liste, sans paramètres');
  assert.ok(FILES.has('legal.html'), 'la page légale autonome fait partie de la copie hors ligne');
});
await test('TECH-080 c : à l’activation, le cache courant est élagué des entrées inconnues et les anciens caches disparaissent', async () => {
  const sw = loadSW(online); await sw.ev('install');
  const c = await (async () => { const m = sw.store.get(sw.cacheName()); return m; })();
  c.set(SCOPE + 'js/version.js?u=1', new Response('x')); c.set(SCOPE + 'js/main.js?v=3', new Response('x')); c.set(SCOPE + 'wiki/index.html', new Response('x'));
  sw.store.set('copytrack-ancien', new Map([[SCOPE + 'a', new Response('x')]])); sw.store.set('autre-site', new Map([[SCOPE + 'b', new Response('x')]]));
  await sw.ev('activate');
  assert.ok(!sw.store.has('copytrack-ancien'), 'ancien cache supprimé'); assert.ok(sw.store.has('autre-site'), 'ce qui n’est pas à nous n’est pas touché');
  assert.equal(c.size, FILES.size, 'entrées inconnues retirées, fichiers connus gardés');
});
await test('TECH-080 d : hors ligne, un fichier connu est servi depuis la copie ; un fichier ABSENT n’est jamais remplacé par index.html (module, feuille de style, image : vraie réponse « introuvable »)', async () => {
  let net = online; const sw = loadSW((r) => net(r)); await sw.ev('install');
  net = offline;
  const known = await sw.get('js/main.js'); assert.equal(known.response.status, 200); assert.equal(await known.response.text(), 'contenu de /js/main.js');
  assert.equal(await (await sw.get('index.html?x=1')).response.text(), 'contenu de /index.html', 'un fichier connu avec des paramètres : sa copie');
  for (const missing of ['js/absent.js', 'css/absent.css', 'assets/absent.png', 'wiki/index.html', 'js/version.js?u=1700000000']) {
    const r = (await sw.get(missing)).response;
    if (missing.includes('?u=')) { assert.equal(r, undefined, 'la vérification de version n’est pas interceptée : le jeu reçoit l’échec réseau et s’en passe'); continue; }
    assert.equal(r.status, 404, missing); assert.equal(await r.text(), '', missing + ' : aucun contenu HTML');
  }
});
await test('TECH-080 d : hors ligne, la page du jeu (adresse de départ) vient de la copie ; une AUTRE page absente reçoit un court message hors ligne, pas le jeu', async () => {
  let net = online; const sw = loadSW((r) => net(r)); await sw.ev('install');
  net = offline;
  const home = await sw.get('./', 'navigate'); assert.equal(home.response.status, 200); assert.equal(await home.response.text(), 'contenu de /');
  const idx = await sw.get('index.html', 'navigate'); assert.equal(await idx.response.text(), 'contenu de /index.html');
  const legal = await sw.get('legal.html?p=confidentialite', 'navigate'); assert.equal(await legal.response.text(), 'contenu de /legal.html', 'la page légale est dans la copie');
  const other = await sw.get('wiki/index.html', 'navigate');
  assert.equal(other.response.status, 503); const body = await other.response.text();
  assert.match(body, /hors ligne/); assert.match(body, /offline/); assert.ok(!body.includes('contenu de /'), 'ce n’est pas index.html');
});
await test('TECH-080 c/d : en ligne, tout passe par le réseau (revalidation), les réponses partielles ou en erreur ne sont pas gardées, d’autres origines ne sont pas touchées', async () => {
  let status = 200; const sw = loadSW(async () => new Response('corps', { status }));
  sw.store.set('x', new Map());
  const ok = await sw.get('js/main.js'); assert.equal(ok.response.status, 200); assert.ok(sw.keys().includes(SCOPE + 'js/main.js'));
  const n = sw.size(); status = 206; await sw.get('js/boot-guard.js'); status = 500; await sw.get('css/style.css'); assert.equal(sw.size(), n, '206 et 500 : rien de gardé');
  const cross = await sw.ev('fetch', { request: new Request('https://autre.example/x.js') }); assert.equal(cross.responded, false);
  const post = await sw.ev('fetch', { request: new Request(SCOPE + 'js/main.js', { method: 'POST', body: 'x' }) }); assert.equal(post.responded, false);
});
await test('le générateur est la source : sw.js est identique à sa génération (un correctif à la main serait écrasé) ; il écrit les règles ci-dessus', () => {
  const gen = read('tools/gen-sw.mjs');
  for (const part of ['const KNOWN', "url.pathname.endsWith('/js/version.js') && url.search", 'status: 404', 'status: 503', 'res.status === 200 && known']) assert.ok(gen.includes(part), part);
  assert.ok(!/caches\.match\('\.\/index\.html'\)/.test(read('sw.js')), 'plus de repli sur index.html');
});

await finish('Le jeu redémarre hors ligne : tout son code est dans la copie du service worker.');
