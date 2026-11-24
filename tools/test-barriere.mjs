// BARRIÈRE du déploiement (COMPLETE-005) : `tools/barriere.sh` (qui relance `tools/check-deployed.mjs`) lancé contre un FAUX serveur Supabase local, et garde-fous sur
// .github/workflows/deploiement.yml (ordre des étapes, protections, aucun secret en clair). Le workflow lui-même ne peut pas tourner ici (il faut GitHub Actions et le vrai projet) ;
// ce que ce test démontre : la barrière laisse passer une fonction conforme, REFUSE une fonction périmée, inconnue ou injoignable (code de sortie 1), et RÉESSAIE le temps que la nouvelle
// fonction se mette en ligne. node tools/test-barriere.mjs   (npm test)
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';
import { readStamp } from './build-stamp.mjs';
import { PHYS_VER } from '../js/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = readStamp(readFileSync(new URL('../supabase/functions/submit-score/index.ts', import.meta.url), 'utf8'));
const recoveryRepo = readStamp(readFileSync(new URL('../supabase/functions/account-recovery/index.ts', import.meta.url), 'utf8'));
const other = repo.stamp === '0000000000000000' ? '1111111111111111' : '0000000000000000';

// Faux projet : `states` est la suite des réponses de submit-score aux GET successifs (la dernière se répète). Chaque état : { status, physVer, build }.
const GOOD = { status: 200, physVer: PHYS_VER, build: repo.stamp };
async function fake(states, { iceStatus = 401, closed = false, recovery = { build: recoveryRepo.stamp } } = {}) {
  const hits = { submit: 0 };
  const server = http.createServer((req, res) => {
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url.startsWith('/functions/v1/submit-score')) {
      const st = states[Math.min(hits.submit++, states.length - 1)];
      if (st.status !== 200) return json(st.status, { error: 'x' });
      return json(200, { ok: true, service: 'submit-score', physVer: st.physVer, rate: { max: 8, windowS: 60, globalMax: 600, anonMax: 400 }, actions: ['submit', 'publish-track'], ...(st.build ? { build: st.build } : {}) });
    }
    if (req.url.startsWith('/functions/v1/account-recovery')) return recovery === 404 ? json(404, { error: 'absente' }) : json(200, { ok: true, service: 'account-recovery', actions: ['recover'], ...(recovery.build ? { build: recovery.build } : {}) });
    if (req.url.startsWith('/functions/v1/ice')) return json(iceStatus, { error: 'jeton requis' });
    if (req.url.startsWith('/rest/v1/')) return json(200, { definitions: { tracks: { properties: { author_verified: {} } } }, paths: {} });
    return json(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  if (closed) { await new Promise((r) => server.close(r)); }
  return { port, hits, close: () => new Promise((r) => server.close(r)) };
}

// Lance le script `file` (bash) avec le faux serveur à la place du projet (js/config.js lit COPYTRACK_CONFIG) et sans proxy.
function run(file, args, port, env = {}) {
  const cfg = JSON.stringify({ supabase: { url: `http://127.0.0.1:${port}`, key: 'cle-publique-de-test' } });
  const pre = 'data:text/javascript,' + encodeURIComponent(`globalThis.COPYTRACK_CONFIG = ${cfg};`);
  return new Promise((resolve) => {
    execFile(file, args, { cwd: root, timeout: 60000, env: { ...process.env, NODE_OPTIONS: `--import ${pre}`, NODE_USE_ENV_PROXY: '', HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '', ...env } },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }));
  });
}
const barrier = async (states, opts, env = { ESSAIS: '3', PAUSE: '0' }) => {
  const f = await fake(states, opts);
  const r = await run('bash', ['tools/barriere.sh'], f.port, env);
  await f.close().catch(() => {});
  return { ...r, hits: f.hits.submit };
};

console.log('La barrière contre un faux serveur');
await test('fonction en ligne = fichier du dépôt : barrière franchie dès le 1er essai, code 0', async () => {
  const r = await barrier([GOOD]);
  assert.equal(r.code, 0, r.out); assert.match(r.out, /Barrière franchie \(essai 1\/3\)/); assert.equal(r.hits, 1);
});
await test('fonction PÉRIMÉE (autre empreinte, même physVer) : refusée après tous les essais, code 1, message qui dit que le site n\'est pas publié', async () => {
  const r = await barrier([{ ...GOOD, build: other }]);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /ÉCART\s+submit-score : empreinte déployée/); assert.match(r.out, /essai 3\/3/); assert.match(r.out, /Barrière non franchie après 3 essai/); assert.match(r.out, /PAS publié/); assert.equal(r.hits, 3);
});
await test('fonction d\'AVANT le contrôle (pas d\'empreinte), mauvaise version de physique, ancienne fonction (405), fonction absente (404) : tous refusés, code 1', async () => {
  for (const st of [{ ...GOOD, build: undefined }, { ...GOOD, physVer: PHYS_VER - 1 }, { status: 405 }, { status: 404 }]) {
    const r = await barrier([st], undefined, { ESSAIS: '2', PAUSE: '0' });
    assert.equal(r.code, 1, JSON.stringify(st) + '\n' + r.out); assert.match(r.out, /ÉCART/, JSON.stringify(st));
  }
});
await test('serveur INJOIGNABLE : « inconnu » (check-deployed sort en 2, rien n\'est prouvé) : la barrière ne passe PAS, code 1', async () => {
  const r = await barrier([GOOD], { closed: true }, { ESSAIS: '2', PAUSE: '0' });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /inconnu/); assert.match(r.out, /Barrière non franchie/);
});
await test('ice déployée sans authentification (réponse 200 à la clé publique) : pas un échec de la barrière (« inconnu » seulement), mais elle ne passe pas : rien n\'est prouvé', async () => {
  const r = await barrier([GOOD], { iceStatus: 200 }, { ESSAIS: '1', PAUSE: '0' });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /inconnu\s+ice/);
});
await test('account-recovery PÉRIMÉE ou NON déployée alors que submit-score est conforme : la barrière ne passe PAS (le site n\'est pas publié avec un « J\'ai perdu mon mot de passe » qui échouerait)', async () => {
  const stale = await barrier([GOOD], { recovery: { build: recoveryRepo.stamp === '0000000000000000' ? '1111111111111111' : '0000000000000000' } }, { ESSAIS: '2', PAUSE: '0' });
  assert.equal(stale.code, 1, stale.out); assert.match(stale.out, /ÉCART\s+account-recovery : empreinte déployée/); assert.match(stale.out, /Barrière non franchie/);
  const none = await barrier([GOOD], { recovery: 404 }, { ESSAIS: '2', PAUSE: '0' });
  assert.equal(none.code, 1, none.out); assert.match(none.out, /ÉCART\s+account-recovery : fonction NON déployée/);
});
await test('RÉESSAIE : la fonction n\'est conforme qu\'au 3e constat (le temps que le déploiement se propage) : franchie au 3e essai', async () => {
  const r = await barrier([{ ...GOOD, build: other }, { ...GOOD, build: undefined }, GOOD], undefined, { ESSAIS: '5', PAUSE: '0' });
  assert.equal(r.code, 0, r.out); assert.match(r.out, /essai 1\/5 : la production n'est pas/); assert.match(r.out, /essai 2\/5/); assert.match(r.out, /Barrière franchie \(essai 3\/5\)/); assert.equal(r.hits, 3);
});
await test('réglages absurdes (ESSAIS non numérique) : refus net, code 1, aucun appel au serveur', async () => {
  const r = await barrier([GOOD], undefined, { ESSAIS: 'beaucoup', PAUSE: '0' });
  assert.equal(r.code, 1); assert.match(r.out, /nombres entiers/); assert.equal(r.hits, 0);
});

console.log('Le workflow de déploiement (garde-fous sur le texte ; la syntaxe est contrôlée par actionlint, voir docs/DEPLOIEMENT.md)');
const wf = readFileSync(new URL('../.github/workflows/deploiement.yml', import.meta.url), 'utf8');
const job = (name) => { const m = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm').exec(wf); assert.ok(m, 'tâche ' + name); return m[1]; };
const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');       // sans les commentaires
test('déclenchement : publication de main ET lancement à la main (« à blanc » par défaut) ; un seul déploiement à la fois, jamais interrompu', () => {
  assert.match(code, /push:\n\s+branches: \[main\]/); assert.match(code, /workflow_dispatch:/);
  assert.match(code, /dry_run:[\s\S]*?default: true/); assert.match(code, /concurrency:\n\s+group: deploiement-production\n\s+cancel-in-progress: false/);
});
test('ORDRE : tests → construire → serveur → site (chaque tâche attend la précédente) ; le site n\'est jamais publié à blanc', () => {
  assert.match(job('tests'), /uses: \.\/\.github\/workflows\/test\.yml/);
  assert.match(job('construire'), /needs: tests/); assert.match(job('serveur'), /needs: construire/); assert.match(job('site'), /needs: serveur/);
  assert.match(job('site'), /if: \$\{\{ !\(github\.event_name == 'workflow_dispatch' && inputs\.dry_run\) \}\}/);
});
test('dans « serveur » : jeton vérifié, ice puis submit-score déployées, PUIS la barrière (dans cet ordre) ; déploiement jamais à blanc ; la barrière est tools/barriere.sh', () => {
  const s = job('serveur'), at = (re) => { const i = s.search(re); assert.ok(i >= 0, String(re)); return i; };
  const list = at(/functions list/), ice = at(/functions deploy ice /), sub = at(/functions deploy submit-score /), rec = at(/functions deploy account-recovery /), bar = at(/bash tools\/barriere\.sh/);
  assert.ok(list < ice && ice < sub && sub < rec && rec < bar, 'liste (jeton) < ice < submit-score < account-recovery < barrière');
  assert.equal((s.match(/DRY_RUN != 'oui'/g) || []).length, 4, 'ice, submit-score, account-recovery et barrière sont sautés à blanc');
  assert.doesNotMatch(wf, /--no-verify-jwt/, 'la vérification du jeton des appelants reste active');
});
test('protections : environnement « production » (approbation possible), droits GitHub minimaux, CLI épinglée, aucun secret affiché', () => {
  assert.match(job('serveur'), /environment: production/); assert.match(job('site'), /name: github-pages/);
  assert.match(code, /^permissions:\n\s+contents: read/m);
  assert.match(job('site'), /pages: write\n\s+id-token: write/); assert.doesNotMatch(code.replace(job('site'), ''), /pages: write|id-token: write|contents: write/);
  assert.match(wf, /SUPABASE_CLI: supabase@\d+\.\d+\.\d+/, 'version exacte de la CLI');
  for (const l of code.split('\n')) if (/secrets\./.test(l)) assert.match(l, /^\s+(TOKEN|SUPABASE_ACCESS_TOKEN): \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}$/, 'un secret ne passe que par une variable d\'environnement : ' + l);
  assert.doesNotMatch(code, /echo[^\n]*\$\{?(TOKEN|SUPABASE_ACCESS_TOKEN)\b/); assert.doesNotMatch(code, /set -x|--debug/);
});

finish('La barrière du déploiement refuse une fonction périmée, inconnue ou injoignable, et laisse passer la fonction du dépôt.');
