# 1. Vue d'ensemble : ce qu'est le jeu et comment il est construit

## 1.1 Le jeu en une page

Jeu de course **contre-la-montre** low-poly dans le navigateur, avec **éditeur de circuits**. Le joueur pilote une voiture (qui peut devenir moto, bateau ou deltaplane sur des plaques) sur des circuits faits de **pièces posées sur une grille 3D** : routes, virages, pentes, loopings, vrilles, tubes, murs, plafonds, bifurcations, carrefours, plaques ; revêtements (glace, boost, rebond, aimant, eau, gravité, inversion…), obstacles animés, solides, pièces mobiles.

Contenus : 72 circuits intégrés en 12 chapitres de carrière (médailles bronze → cristal, objectif bonus), défi du jour généré par la date, saisons hebdomadaires, Académie (leçons et exercices notés), modes de jeu, fantômes, replays et Replay Theater, classements en ligne **vérifiés par le serveur**, communauté (publication, likes, playlists, commentaires), comptes et sauvegarde cloud, duels et tournois asynchrones, multijoueur en direct (WebRTC), garage (apparence seulement), personnalisation de l'interface et des caméras, deux langues.

Version : `bêta 0.16.0` ; physique `PHYS_VER = 38` ; protocole réseau `NET_VER = 4` (`js/version.js`).

## 1.2 Technologies

| | |
| --- | --- |
| Langage | JavaScript, modules ES natifs, **aucune compilation** (`package.json` n'a aucune dépendance) |
| Rendu | three.js r170 fourni dans `js/vendor/three.module.min.js` (WebGL 2 obligatoire), `TransformControls` pour l'éditeur |
| Son | Web Audio, tout synthétisé (aucun fichier audio) |
| Serveur | Supabase : PostgreSQL + RLS (`supabase/etape*.sql`, 19 étapes appliquées à la main), Auth, Realtime (présence, signalisation), deux fonctions Deno (`submit-score`, `ice`) |
| Réseau de jeu | WebRTC pair à pair, maillage complet |
| Hors ligne | service worker généré (`sw.js`), application installable (`manifest.webmanifest`) |
| Outils | Node 22 (tests, outils), Deno 2.9 (même physique que le serveur), Playwright / Chromium, Firefox, WebKit (tests navigateur), PostgreSQL 16 (tests SQL), ESLint |
| Hébergement | site statique (GitHub Pages), `npm start` en local (`tools/serve.mjs`) |

## 1.3 Le démarrage (vérifié)

```
index.html
 ├─ <link rel=modulepreload> ×175  (bloc GÉNÉRÉ par tools/gen-sw.mjs : la fermeture des imports statiques de js/main.js)
 ├─ js/boot-guard.js  (script classique) : si le graphe de modules échoue (fichiers de deux versions), recharge une fois sans cache
 └─ js/main.js (module) — l’import lui-même charge et exécute ces 175 modules (données des pièces, 72 définitions de circuits…)
      window.__copytrackBooted = true                (désarme la garde)
      async () :
        1. initI18n()                (js/i18n/boot.js : langue, dictionnaire anglais à la demande, traducteur DOM)
        2. contrôle WebGL 2          (message clair sinon)
        3. runWelcome()              (js/welcome.js : compte restauré, invité de cette session, ou formulaire ;
                                      fixe la PORTÉE du stockage local : storage.setScope)
        4. new App(identity)         (main.js:54) : réglages, WebGLRenderer, scène, caméra, matières du circuit, Scenery,
                                      Particles, QualityManager, Input, Telemetry, ErrorReport, GameAudio, UI,
                                      CONSTRUCTION DES 72 CIRCUITS INTÉGRÉS et de leurs clés (main.js:93), écouteurs globaux, _wire*()
        5. app.start()               (main.js:393) : showMenu('menu') = course de DÉMONSTRATION en fond, banc d'essai graphique,
                                      télémétrie, récompenses, vérification de mise à jour, tutoriel ; liens #t= (circuit), #g= (fantôme),
                                      #salle= (salon) ; boucle requestAnimationFrame
        6. account.sync()            (compte : fusion de la sauvegarde cloud)
```

Seuls l'éditeur (`app/editorFlow.js:17`, `import('../editor.js')`, environ un quart du code) et le dictionnaire anglais sont chargés à la demande.

## 1.4 Les couches

```
            ┌───────────────────────────── Application (navigateur) ─────────────────────────────┐
 DOM ──────►│ App (main.js + app/*)  ──  UI (ui.js, ui/*)  ──  Input  ──  Audio  ──  i18n         │
            │   │ une session à la fois : RaceSession (race.js + race/*, theater/*)                │
            │   │                         EditorSession (editor.js + editor/*, inspector*) [lazy]  │
            │   │                         GarageSession (garage.js + garage/*)                     │
            │   ▼                                                                                  │
            │ Rendu three.js : TrackView (trackMesh.js/trackGeometry.js), Scenery, carModel, effets │
            └───────┬───────────────────────────────┬──────────────────────────────────────────────┘
                    │ lit l'état                    │ appelle
            ┌───────▼─────── Noyau déterministe (fermeture de js/verify.js, 42 fichiers) ──────────┐
            │ Simulation · CarPhysics (+ physics/) · RaceLogic · sim/logic · sim/env · sim/params   │
            │ Track (+ track/) · pieces · ribbons · solids · obstacles · dmath · tracks · daily …   │
            └───────▲───────────────────────────────▲──────────────────────────────────────────────┘
                    │ GhostRunner (fantômes,         │ verify.js (rejeu)
                    │ analyse, outils)               │
              tools/*.mjs (Node)            supabase/functions/submit-score (Deno, fichier groupé)

 À côté : persistance (storage, profile, cloudsave, account), en ligne (online, online/community, config),
          multijoueur (net/*, app/multi.js, race/net.js) — voir 04-systemes.md
```

Règle de dépendance (vérifiée par `tools/test-determinisme.mjs`) : **le noyau n'importe rien du rendu, du DOM ni du stockage**. Le sens inverse est libre : le rendu et l'application lisent le noyau.

## 1.5 Le motif « familles de méthodes »

Les grosses classes (`App`, `RaceSession`, `EditorSession`, `Inspector`, `Scenery`, `Track`, `CarPhysics`, `GarageSession`) sont découpées en objets `export const xMethods = { … }` rangés dans un dossier du même nom et fusionnés par `Object.assign(Classe.prototype, …)` (par exemple `main.js:487`, `race.js:733`, `physics.js:866`, `track.js:529`).
Conséquences pratiques :
- une méthode peut être appelée depuis n'importe quel fichier de la famille : chercher `nomDeMethode(` dans tout `js/`, pas seulement dans le fichier de la classe ;
- deux familles qui définissent la même méthode s'écrasent silencieusement : `tools/test-contrats.mjs` l'interdit ;
- l'état est partagé par `this` : un champ `this._xxx` posé dans une famille est lu ailleurs.

## 1.6 Carte des dossiers

| Dossier / fichier | Contenu | Doc |
| --- | --- | --- |
| `index.html`, `css/style.css` | toute la structure DOM (écrans, superpositions, HUD, éditeur, garage) ; un seul fichier CSS | — |
| `js/main.js`, `js/app/` | `App` : orchestration, navigation, branchements, multijoueur, communauté, compétition, réglages, profil… | 4.1 |
| `js/race.js`, `js/race/`, `js/theater/` | session de course, caméra, fantômes, replay, arrivée, HUD d'entraînement, Theater | 3 |
| `js/simulation.js`, `js/physics.js`, `js/physics/`, `js/raceLogic.js`, `js/sim/` | noyau de simulation | 2 |
| `js/track.js`, `js/track/`, `js/pieces.js`, `js/ribbons.js`, `js/solids.js`, `js/obstacles.js` | modèle de circuit et géométrie analytique | 2.4 |
| `js/tracks.js`, `js/daily.js`, `js/seasons.js`, `js/career.js`, `js/academy.js`, `js/skills.js`, `js/rules*.js`, `js/variants.js`, `js/mutations.js` | contenus et règles de jeu | 4.11 |
| `js/editor.js`, `js/editor/`, `js/inspector*.js`, `js/editorTools.js`, `js/connect.js`, `js/continuity.js`, `js/extend.js`, `js/orient.js`… | éditeur | 4.9 |
| `js/trackMesh.js`, `js/trackGeometry.js`, `js/scenery*.js`, `js/decos.js`, `js/carModel.js`, effets | rendu | 4.10 |
| `js/net/`, `js/remoteCar.js` | multijoueur | 4.6 |
| `js/storage.js`, `js/profile.js`, `js/account.js`, `js/cloudsave.js`, `js/online.js`, `js/online/` | persistance, comptes, en ligne | 4.7, 4.8 |
| `js/analysis/` | trace rejouée, référence de parcours, secteurs, coach, laboratoire, exercices | 3.3 |
| `js/i18n*`, `js/ui*`, `js/input.js`, `js/audio.js`, `js/music.js` | interface, langues, entrées, son | 4.1-4.4 |
| `supabase/` | étapes SQL, fonctions serveur, docs du serveur (`COMPTES.md`, `MULTI.md`, `MIGRATIONS.md`, `TELEMETRIE.md`) | 4.8 |
| `tools/` | 126 fichiers `test-*.mjs` (dont 7 de navigateur) et 5 tests SQL `.sh`, outils de level design, générateurs, wiki | 1.8 |
| `wiki/` | wiki **généré** (`npm run wiki`) | — |
| `docs/` | architecture, index des modules (généré), audits, décisions | — |

## 1.7 Fichiers générés (ne pas modifier à la main)

`sw.js` et le bloc `modulepreload` d'`index.html` (`npm run sw`), `supabase/functions/*/index.ts` (`npm run build:function`), `tools/phys-fingerprint.json`, `tools/golden-temps.json`, `tools/compat/corpus.json`, `docs/MODULES.md` (`npm run docs`, à partir de la **première phrase du commentaire de tête** de chaque module), `js/pieceFacts.js` et `docs/MATRICE-PIECES.md` (`node tools/matrice-pieces.mjs --update`), `docs/FICHE-ESSAI.md`, `wiki/`. Détail et contrôles : `docs/ARCHITECTURE.md`, « Fichiers générés ».

Conséquence : **ajouter ou renommer un fichier `.js`** oblige à régénérer `sw.js` (sinon `npm test` échoue et le jeu hors ligne manque ce fichier), et à donner au fichier un commentaire de tête (sinon `docs/MODULES.md` ne peut être régénéré).

## 1.8 Tests et CI

- `npm test` → `tools/run-tests.mjs` : chaque `tools/test-*.mjs` dans son processus, en parallèle, plus `check-generated`, `check-docs`, `phys-fingerprint`, `audit-pieces`, `sim` (les 72 circuits au pilote automatique). **État constaté lors de cette analyse : 124 fichiers, 1 755 vérifications, toutes réussies** (exécuté sur une copie du dépôt ; deux tests demandent un dépôt git et ont été relancés dans le dépôt).
- Hors `npm test` : `npm run test:browser`, `test:deno`, `test:sql`, `lint`.
- CI (`.github/workflows/test.yml`) : lint + tests + fichiers générés à jour, Deno, navigateurs, SQL, et une tâche « gate ». Deux autres tâches planifiées : `surveillance` (site et fonction en ligne, chaque jour) et `sauvegarde` (copie chiffrée de la base, chaque semaine).
- Harnais commun : `tools/harness.mjs` (`test`, `finish`) ; un fichier de test qui n'exécute aucune vérification est compté comme un échec.
