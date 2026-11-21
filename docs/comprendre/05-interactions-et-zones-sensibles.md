# 5. Interactions entre systèmes, zones sensibles, conséquences d'une modification

Marques : **[V]** vérifié dans le code, **[D]** déduction raisonnable, **[?]** incertain.

## 5.1 Carte des dépendances

Nature : **directe** (appel), **état partagé** (même objet ou variable de module), **évènement** (sac `phys.ev`, évènements du salon, `writeHook`), **indirecte** (par une clé, une empreinte, un texte).

| Système | Dépend de | Nature | Ce qui circule |
| --- | --- | --- | --- |
| `CarPhysics` | `Track` (surfaces, index, obstacles, solides), `pieces.js`, `ribbons.js`, `specs`, `params`, `env`, logique | directe + état partagé (`Track` en lecture seule) | requêtes de sol, de plafond, de rubans, au chrono `phys.clock` |
| `RaceLogic` | `CarPhysics` (position, `prev`, `grounded`, `rib`, `gSign`, `vehicle`, `gravMul`), `Track` | directe | checkpoints, points de retour |
| Logique du circuit | `RaceLogic`, `CarPhysics` | état partagé (`phys.excl`, `logic.excluded`, `logic.ext`, `phys.gravMul`) | groupes cachés, gravité, effets |
| `RaceSession` | `Simulation`, `TrackView`, `Scenery`, `Input`, `Audio`, `UI`, `Particles`, `storage`, `profile` | directe ; **évènement** (lit `phys.ev` à chaque pas) | commandes, effets, HUD, records |
| Caméra | état de `CarPhysics` (pose, normale, `gSign`, `rib`), `track.ceilingAt`, `surfaceAt` | directe (lecture) | aucune écriture vers la physique |
| `TrackView` | `Track` (pièces, décorations, groupes), `phys.broken`, état de la logique, `renderOptions` | état partagé (variable de module `renderOptions`) | maillages, visibilité |
| Fantômes simulés | une seconde `Simulation` sur **le même** `Track` | état partagé en lecture | poses par pas |
| Records, médailles, déblocages | clés de classement (`b-`, `daily-`, `u-`) | **indirecte** (empreinte du code du circuit) | `rec3.<clé>` |
| Classements en ligne | `PHYS_VER`, clés, code du circuit, fonction serveur **déployée** | indirecte | course rejouée |
| Synchronisation du compte | toute écriture locale d'une clé synchronisée | **évènement** (`storage.onWrite`) | sauvegarde fusionnée |
| Multijoueur | `Room` (Realtime + WebRTC), `RaceSession` | évènements (`room.on('snapshot'…)`) ; **écriture directe** dans `phys` (collisions douces) | positions, temps, départ |
| Interface traduite | tout texte écrit dans le DOM | **indirecte** (le traducteur observe le document) | textes français → anglais |
| Hors ligne | liste des fichiers | indirecte (`sw.js` généré) | cache |

## 5.2 Parcours transverses (vérifiés)

### Chargement d'un circuit : qui s'initialise, dans quel ordre
`launchDesc` → `playTrack` (`main.js:201`) : `track.validate` → `_dispose()` (ancienne session) → `mode = 'race'`, `ui.setMode('race')` → `new RaceSession` (`race.js:42`) : aides → **`TrackView`** (tous les tronçons construits d'un coup) → **`scenery.setTrack`** (terrain, décor, ambiance) → **`Simulation`** (`CarPhysics` : `paramsOf`, `envOf`, `specsOf`, `v2Of`, `setBounds`, `place` ; `RaceLogic` ; logique) → `EnvFx` → voiture, traces, fantômes, mini-carte, caméras → `loadRecord` → **`restart()`** (`sim.start`, enregistreur, HUD) → HUD d'entraînement, Theater → puis la musique (`main.js:212`).
Les caches du circuit (`obstacleGrid`, `solidIndex`, `hasMovers`) sont construits à la première requête, par version du circuit.

### Retour au checkpoint (touche R, hors-piste, noyade, piques, état incohérent)
1. Déclencheur : `input.act('respawn')` (`race.js:478`) → `respawn(true)` ; ou automatique après `sim.score()` (`race.js:426-429`) ; en replay, drapeau `respawn` de la commande (`race.js:276`).
2. `sim.rewind({ keepClock: multi })` → `RaceLogic.rewind` (chrono, temps intermédiaires, checkpoints, tour, **état de la logique** revenus à l'instantané) → `placeAtRespawn` → `phys.place` (vitesse nulle, **verre restauré**, `graceT` 1,5 s, `hazardGrace` 0,8 s, ruban quitté, plaques réarmées), puis véhicule, gravité et sens de gravité du point de retour, `glassSafe`.
3. **Le chrono revient** (sauf multijoueur) : `phys.clock = logic.steps` au pas suivant → **pièces mobiles et obstacles reviennent à leur position de ce moment-là**.
4. `RaceSession` : fantôme enregistré tronqué, statistiques ramenées à l'instantané du checkpoint (les réceptions parfaites d'après ne comptent plus pour l'objectif bonus), aides réinitialisées, HUD, orientation et caméra recalées (`_camCut`), traînée et particules effacées ; en multijoueur, compteur de téléportation + 2 s sans collision + envoi immédiat.
5. Fantômes simulés : rien n'est rejoué, on relit leur historique à l'ancien chrono.

### Inversion de gravité
Plaque `flip` touchée → `_setGround` inverse `gSign` (`physics.js:199`) → `_roadContact` projette la voiture vers le nouveau « bas » (`flipKick`) ; ou ruban qui retourne la voiture (`ribbon.js:257`). Ensuite : sol cherché par `ceilingSurfaceAt` (pièces à l'envers seulement) ; volant inversé par rapport au monde (`_upSign`) ; voiture perdue au-dessus de `skyY` ; `ev.flip` → message et secousse (`race.js:412`) ; caméra : roulis animé `CamFlip` ; orientation visuelle (`_orient`) ; le point de retour du checkpoint suivant garde le sens (`respawnGs`).

### Checkpoint
`RaceLogic.update` → nouveau point de retour + instantané → évènement `checkpoint` → `Simulation.score` : règles de la logique sur l'évènement `cp`, puis instantané de la logique **après** elles (`simulation.js:84`) → `RaceSession._event` (`race/finish.js:16`) : instantané des statistiques, écart avec le record (`record.splits`), HUD, son, particules.

### Collisions et mouvement
Bordures, solides, plaques à bordure et parois de rubans passent par **une seule règle** (`physics/contact.js`) : choc inélastique, frottement de Coulomb proportionnel à la vitesse d'approche. Effets secondaires : `ev.wall` → le pas suivant, `_driftState` casse la glisse et **annule le mini-turbo en charge** (`wallT`) ; `stunT` (encaissement) réduit adhérence et traction ; voiture plaquée à l'arrêt → `unstick` la fait pivoter. Un obstacle qui pousse la voiture déclenche une **seconde passe** des bordures (`physics.js:634`).

### Obstacles mobiles et moteur physique
Position = fonction du chrono seul (`obstacleLocal(d, phys.clock × DT)`), donc identique au rejeu et au serveur ; le rendu les place au chrono interpolé (`race.js:546`, à un pas près) ; après l'arrivée, l'horloge continue (`Simulation.idle`) ; au retour au checkpoint, elle recule (voir plus haut). Une voiture sur un ruban subit aussi les obstacles (`ribbon.js : _ribObstacles`).

### Changement d'état → contrôles et animations
- Plaque de transformation → `phys.vehicle` → **`this.k`** (réglages du véhicule) change au pas suivant ; `ev.transform` → `car.setVehicle(veh)` (animation), son, message ; le fantôme enregistré mémorise le changement (`ghostVeh`).
- Arrivée → `_input` renvoie « frein » (`race.js:281`), moteur coupé, plus d'enregistrement, la physique continue.
- Pause → aucun pas, moteur coupé, rendu figé (particules, traces, flammes) ; le shader de l'eau tourne encore (horloge murale).
- Démo du menu → mêmes boucles qu'une course, pilotées par `Autopilot`, sans HUD ni messages.

### Essai depuis l'éditeur, vérification, publication
Voir `04-systemes.md` § 4.9 : état mis de côté → circuit re-décodé → course (`e-<hash>`) → `onEditorTestFinished` → `setVerified` + preuve → publication (le serveur rejoue la preuve) → retour à l'éditeur (`quitRace` → `openEditor`).

### Envoi d'un temps
Voir `03-course.md` § 3.4 et `04-systemes.md` § 4.8.

## 5.3 Ce qui tourne alors qu'on pourrait le croire arrêté

| Quoi | Pourquoi | Statut |
| --- | --- | --- |
| Course de démonstration dans tous les menus (physique, pilote automatique, audio du moteur, rendu) | `showMenu` crée toujours une `RaceSession({ demo: true })` | [V] voulu ; la boucle de rendu est plafonnée à 30 i/s, pas la physique |
| Fantôme or | simulé en direct **dans le rendu** (`poseAt` → `seek`), un grand saut dans le temps fait de nombreux pas d'un coup | [V] |
| Physique après l'arrivée | la voiture roule encore, horloge des obstacles comprise | [V] voulu |
| `AudioEngine` (séquenceur 25 ms), surveillance des animations réduites (2 s), vérification de mise à jour (30 min), files de télémétrie | minuteries globales de l'application | [V] voulu |
| Minuterie `_studioT` du garage | non annulée par `GarageSession.dispose` | [V] défaut mineur |
| Écouteurs du salon multijoueur (`multiLobby`) | retirés seulement par ses boutons | [V] |
| Reconnexion à la signalisation qui expire | sa WebSocket n'est pas fermée | [D] |
| Capture de touche en attente | survit à un changement d'écran | [V] |
| Écouteurs globaux (fenêtre, document, `Input`, i18n) | jamais retirés | [V] sans conséquence : `App` est unique |

## 5.4 Zones sensibles (par ordre de risque)

1. **Le noyau déterministe** (fermeture de `verify.js`, 42 fichiers, `02-simulation.md` § 2.1). Toute modification change potentiellement temps, replays, fantômes, empreinte, défis du jour passés, et exige un redéploiement manuel de la fonction serveur. Règles de calcul imposées (`dmath`).
2. **Les deux chemins de pas** : `GhostRunner.step` / `Simulation.step` d'un côté, `RaceSession._stepOnce` de l'autre (décision de réapparition refaite à la main). Non couverts par un test de bout en bout commun [V].
3. **Les clés de classement et ce qui en dépend** : `b-<hash(encode())>` (nom, auteur `'Copytrack'`, décor, script…), `u-<signature>` (décor compris), `daily-<date>` (circuit régénéré, sans empreinte). Elles portent les records locaux, donc **les médailles et le déverrouillage de la carrière**, les classements, les saisons, les duels. Aucune migration pour les circuits intégrés [V].
4. **Les registres de sérialisation qui n'acceptent que des ajouts en fin** : `PIECE_ORDER`, `SURFACE_CODES`, `DECO_ORDER`, `TILE_FIELDS`, `RULES` (ordre de la signature et du code) [V] — réordonner casse tous les codes partagés (`tools/test-registres.mjs`, corpus de compatibilité).
5. **`Track.normalize` / `flagAllowed` / `OPTION_CONFLICTS` / `Track.range` / `cellsOf`** : partagés par l'éditeur, la lecture des codes et le serveur. Un changement modifie ce qu'un code relu contient (`track.lost`).
6. **État de module partagé** [V] : `storage.js : PREFIX` (portée invité / compte), cache `profile()`, `renderOptions`, `rollFitHook` (`pieces.js:444`, rempli par un effet de bord de l'import de `ribbons.js`), tampons de calcul de module (`ribbons.js`, `track/surfaces.js`, `race/shared.js : tmpV, tmpV2, tmpM`, `physics/*`), réutilisés à chaque appel : une fonction qui garde une référence à l'un d'eux d'un appel à l'autre lit une valeur écrasée.
7. **`App` et ses ~40 drapeaux `this._xxx`**, navigation lue en partie dans les classes CSS du DOM, identifiants DOM en dur dans de nombreux fichiers.
8. **Logique dupliquée entre le jeu et la base SQL** (`04-systemes.md` § 4.8) et entre fichiers (deux recherches d'extrémités : `editorTools.endpoints` et `connect.js` ; plage de niveaux approchée dans `trackMesh.js`).
9. **Familles de méthodes** : un nom de méthode peut être défini dans n'importe quel fichier du dossier (contrôle anti-doublon : `tools/test-contrats.mjs`).
10. **Traducteur DOM** : agit sur tout le document, contenus des joueurs compris.

## 5.5 Si tu modifies… regarde aussi

| Modification | À vérifier / refaire |
| --- | --- |
| Physique (`physics*`, `pieces.js`, `ribbons.js`, `solids.js`, `obstacles.js`, `sim/*`, `raceLogic.js`, `simulation.js`) | incrémenter `PHYS_VER` ; `node tools/phys-fingerprint.mjs --update`, `node tools/golden.mjs`, `node tools/medals.mjs --check`, `node tools/compat-gen.mjs --update` ; `npm run build:function`, `npm run sw`, `npm test` ; **redéployer `submit-score`** ; `node tools/check-deployed.mjs` (procédure : `docs/ARCHITECTURE.md`) |
| Un circuit intégré (`tracks.js`) | sa clé `b-` change : records locaux, médailles, verrous de chapitre, classement, saisons, duels ; empreinte, temps de référence, contrat (`tools/test-niveaux.mjs`), fonction serveur |
| `Track.encode`, `signatureText`, `hashString` | toutes les clés `b-` et `u-`, `track_binds` côté serveur, corpus de compatibilité, vérification des circuits publiés (`vh`) |
| Le générateur du défi du jour | circuits des jours passés sous la même clé ; empreinte ; serveur |
| Une nouvelle pièce | ajouter **à la fin** de `PIECE_ORDER` ; `PIECES` (géométrie analytique), `trackGeometry.js` (maillage), familles et palette, `flagAllowed`, `Track.range`, `spill.js`, `connect.js`, matrice (`tools/matrice-pieces.mjs --update`), textes et traductions, `tools/audit-pieces.mjs`, empreinte |
| Un nouveau revêtement | **à la fin** de `SURFACE_CODES` ; `SURFACES`, `surfaceCoeffs`, `_setGround` et `_ribStep`, couleurs du maillage, `surfaceAllowed`, traductions |
| Une nouvelle décoration / un obstacle / un solide | **à la fin** de `DECO_ORDER` ; obstacle ou solide = physique (signature, empreinte, serveur) ; simple décoration = rendu seulement |
| `RaceSession._stepOnce` ou `GhostRunner.step` | faire la même chose dans l'autre ; rejouer une vraie course enregistrée et comparer le temps |
| Une donnée de progression ou une clé de stockage | règle de fusion dans `cloudsave.js`, liste `DEVICE_ONLY_KEYS`, export des données (`dataExport.js`), quota |
| Un texte affiché | sa traduction dans `js/i18n/en/<domaine>.js` (`tools/test-i18n.mjs`) |
| Un fichier `.js` ajouté ou renommé | commentaire de tête, `npm run docs`, `npm run sw` ; un nouveau dossier doit être cité dans `docs/ARCHITECTURE.md` (`tools/check-docs.mjs`) |
| Un `id` ou un `data-action` d'`index.html` | recherche dans tout `js/` ; `tools/test-menu.mjs`, `tools/test-browser.mjs` (qui pilote `window.copytrack`) |
| Une règle partagée avec la base (saisons, duels, variantes, titres, pseudos, limites) | l'étape SQL correspondante, à appliquer à la main (`supabase/MIGRATIONS.md`) |
| Le protocole multijoueur | `NET_VER`, `SNAP_VERSION`, `supabase/MULTI.md`, `tools/test-net.mjs` |

## 5.6 Défauts et fragilités constatés (aucun n'a été corrigé)

Classés par effet sur le joueur. Détail et références dans les fiches.

| # | Constat | Statut | Fiche |
| --- | --- | --- | --- |
| 1 | Classement mondial : les requêtes demandent `ghost_veh`, jamais accordée en lecture dans les étapes SQL du dépôt ; repli sans fantômes ni titres | [V] code et SQL du dépôt ; [?] production | 4.8 |
| 2 | Éditeur : la pose calcule les conflits avant normalisation et peut supprimer des pièces voisines quand une option armée est ignorée | [V] mécanisme | 4.9 |
| 3 | Éditeur : retour d'essai qui perd historique, presse-papiers et calques dès qu'une décoration a des coordonnées non arrondies | [V] mécanisme | 4.9 |
| 4 | Verre brisé de nouveau visible (logique « montrer », réduction de qualité en course) alors qu'il n'a plus de collision | [V] mécanisme | 4.10 |
| 5 | Modifier un circuit intégré efface en pratique la progression du joueur sur ce circuit (clé changée, aucune migration) | [V] | 4.11 |
| 6 | Records d'essai `e-…` jamais purgés, synchronisés avec le compte | [V] | 4.9 |
| 7 | Multijoueur : `started` jamais remis à faux (relance d'un invité resté au salon), arrivants en cours de course invisibles, jeton de reconnexion jamais comparé, impulsion de collision jusqu'à 8 m/s en un pas | [V] | 4.6 |
| 8 | Solides inclinés à l'affichage, droits pour la physique (dans l'éditeur) | [V] mécanisme | 4.10 |
| 9 | « Prolonger » peut poser un second départ | [V] | 4.9 |
| 10 | Traducteur anglais appliqué aux contenus des joueurs | [V] mécanisme | 4.4 |
| 11 | Boutons tactiles liés en dur à `KeyR`, `Escape`, `Enter` | [V] | 4.2 |
| 12 | Minuterie du garage non annulée, écouteurs du salon non retirés | [V] | 4.5, 4.6 |
| 13 | Déconnexion d'un compte : la session anonyme de l'invité est oubliée (ses publications restent sur un identifiant abandonné) | [V] / [D] | 4.7 |

## 5.7 Écarts entre la documentation existante et le code

| Document | Affirmation | Code actuel |
| --- | --- | --- |
| `docs/ARCHITECTURE.md` (« Physique : règles communes ») | sur les routes roulées et les loopings, la route guide le cap (`headingGuided`) | retiré depuis `PHYS_VER` 37 (`pieces.js:435`, `physics/ribbon.js:276`) : il faut braquer |
| `docs/ARCHITECTURE.md` | 182 scénarios (« Déterminisme ») et 161 (« Limites connues ») | 193 dans `tools/phys-fingerprint.json` |
| `docs/ARCHITECTURE.md` (« Limites connues ») | Firefox et Safari pas essayés ; STUN seulement | tâche CI `moteurs` (Firefox, WebKit) ; fonction `ice` qui fournit un relais TURN |
| `docs/ARCHITECTURE.md` (« Données et formats ») | la signature ignore le thème | le **décor** (`this.decor`) est en tête de `signatureText` ; seul le thème de pièce `th` est ignoré |
| `docs/ARCHITECTURE.md` (« Serveur ») | tables dans `etape1…5` | 19 étapes |
| `docs/ARCHITECTURE.md` | records sous `shardway.rec3.*` | vrai pour l'invité ; compte : `shardwayacct.<uid>.rec3.*` |
| `js/verify.js` (en-tête) et donc `docs/MODULES.md` | la fonction serveur « le charge depuis le site du jeu » | elle l'embarque (`tools/build-function.mjs`) |
| `js/joins.js` (en-tête) | utilisé par l'éditeur | importé seulement par des tests et outils |
| `supabase/MULTI.md` | collisions plafonnées à ~4 g ; deux modes de salon | seule la poussée de pénétration est plafonnée ; trois modes (course, championnat, libre) |
| `supabase/COMPTES.md` (fin) | le temps de l'auteur est « vérifié par le jeu à la publication mais pas rejoué par la base » | la fonction serveur le rejoue avant d'appeler `publish_track` (`verify.js : verifyPublish`) |
