// Régénère sw.js : liste des fichiers à garder en cache pour jouer hors ligne.
// À lancer après avoir ajouté un fichier : node tools/gen-sw.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
async function walk(dir) {
  const out = [];
  let list = [];
  try { list = await readdir(dir, { withFileTypes: true }); } catch { return out; }   // dossier absent (ex. assets/)
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}
// (0.12.6) Aucune exclusion : js/verify.js, longtemps gardé hors du cache (« seul le serveur l'exécute »), est importé par l'écran Communauté
// (replayTime) ; absent du cache, il faisait échouer tout le démarrage hors ligne (le service worker répondait par la page HTML).
const SERVER_ONLY = new Set();
// legal.html : la page légale autonome (lien partageable) ; sans elle dans la copie, elle ne marchait hors ligne que si on l'avait déjà ouverte (le cache gardait alors n'importe quelle page visitée).
const files = ['index.html', 'legal.html', 'manifest.webmanifest'];
for (const d of ['css', 'js', 'icons', 'assets']) {
  for (const f of await walk(join(root, d))) {
    const rel = relative(root, f).split('\\').join('/');
    if (SERVER_ONLY.has(rel)) continue;
    if (/\.(js|css|png|svg|txt|woff2)$/.test(f)) files.push(rel);
  }
}
files.sort();

// ---- index.html : modulepreload des modules chargés au démarrage ---------------------------------------------------------------------
// Sans cela le navigateur découvre les ~60 modules l'un après l'autre (chacun n'est connu qu'une fois son parent analysé) : une cascade de
// requêtes. On liste donc la fermeture des import STATIQUES de js/main.js, en largeur d'abord (les import() dynamiques, comme l'éditeur,
// ne sont pas préchargés : ils ne sont chargés qu'à la demande).
function staticClosure(entry) {
  const order = [], seen = new Set([entry]);
  for (let i = 0, q = [entry]; i < q.length; i++) {
    order.push(q[i]);
    const text = readFileSync(join(root, q[i]), 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
      const target = relative(root, join(root, dirname(q[i]), m[1] || m[2])).split('\\').join('/');
      if (!seen.has(target)) { seen.add(target); q.push(target); }
    }
  }
  return order;
}
const preload = staticClosure('js/main.js').map((f) => `  <link rel="modulepreload" href="${f}">`).join('\n');
{
  const indexPath = join(root, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const re = /( {2}<!-- modulepreload:start[^\n]*-->)[\s\S]*?(\n {2}<!-- modulepreload:end -->)/;
  if (!re.test(html)) throw new Error('index.html : marqueurs modulepreload absents');
  html = html.replace(re, (_, a, b) => a + '\n' + preload + b);
  writeFileSync(indexPath, html);
}
const h = createHash('sha1');
for (const f of files) h.update(f).update(await readFile(join(root, f)));
const version = h.digest('hex').slice(0, 10);
const src = `// Service worker généré par tools/gen-sw.mjs : ne pas modifier à la main.
// Jeu hors ligne : les fichiers du jeu sont gardés en cache ; le réseau reste prioritaire
// pour récupérer les mises à jour quand il est disponible.
const CACHE = 'copytrack-${version}';
const FILES = ${JSON.stringify(['./', ...files], null, 2)};

self.addEventListener('install', (e) => {
  // cache: 'reload' : la copie hors ligne vient du réseau, jamais d'un cache HTTP qui pourrait encore tenir un fichier de la version précédente.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

// Les chemins que la copie hors ligne connaît (TECH-080 c) : SEULS ces fichiers entrent dans le cache, chacun sous son chemin sans paramètres. Avant, toute réponse 200 de même origine était
// gardée sous son adresse complète : la vérification de mise à jour (js/version.js?u=<horodatage>, une adresse nouvelle toutes les 30 minutes) remplissait le cache jusqu'au changement de version.
const KNOWN = new Set(FILES.map((f) => new URL(f, self.registration.scope).pathname));
const keyOf = (url) => new Request(url.origin + url.pathname);

// Hors ligne, un fichier absent de la copie n'est JAMAIS remplacé par index.html (TECH-080 d : un module, une feuille de style ou une image « trouvés » sous la forme d'une page HTML font
// échouer le démarrage de façon incompréhensible). Une page demandée (navigation) reçoit un court message ; tout autre fichier, une vraie réponse « introuvable ».
const missing = (req) => (req.mode === 'navigate'
  ? new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Trackigami</title><p>Cette page n’est pas disponible hors ligne. · This page is not available offline.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  : new Response('', { status: 404, statusText: 'Not Found' }));

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith('shardway-') || k.startsWith('copytrack-')) && k !== CACHE).map((k) => caches.delete(k))))
    // Le cache courant ne garde que les fichiers connus (une copie plus ancienne de ce même cache, jamais élaguée, aurait pu en contenir d'autres).
    .then(() => caches.open(CACHE)).then((c) => c.keys().then((reqs) => Promise.all(reqs.filter((r) => { const u = new URL(r.url); return u.search || !KNOWN.has(u.pathname); }).map((r) => c.delete(r)))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Vérification d'une nouvelle version (js/updateCheck.js) : toujours au réseau, jamais servie ni gardée par le cache (TECH-080 c). Hors ligne, la requête échoue et le jeu s'en passe.
  if (url.pathname.endsWith('/js/version.js') && url.search) return;
  const known = KNOWN.has(url.pathname);
  // cache: 'no-cache' : chaque fichier est revalidé auprès du serveur (une réponse 304 ne coûte presque rien). Sans cela, juste après une mise en ligne,
  // le cache HTTP du navigateur (GitHub Pages : 10 min) pouvait servir un ancien module à côté des nouveaux, et le jeu ne démarrait pas (0.9.65).
  const fresh = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' });
  e.respondWith(
    fetch(fresh).then((res) => {
      // Seules les réponses complètes (200) des fichiers CONNUS se gardent : une réponse partielle (206) ferait échouer cache.put, et le reste n'a rien à faire dans le cache.
      if (res.status === 200 && known) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(keyOf(url), copy)).catch(() => {})); }
      return res;
    }).catch(() => (known ? caches.match(keyOf(url)).then((r) => r || missing(req)) : missing(req))),
  );
});
`;
await writeFile(join(root, 'sw.js'), src);
console.log(`sw.js : ${files.length} fichiers, cache ${version}`);
