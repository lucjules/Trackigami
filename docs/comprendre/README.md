# Comprendre Trackigami : carte technique du jeu

Documentation de **compréhension** (novembre 2026, bêta 0.16.0, `PHYS_VER` 38) : comment le jeu fonctionne réellement, comment ses systèmes se parlent, et ce qu'une modification risque de casser ailleurs. Elle complète, sans les répéter, [l'architecture](../ARCHITECTURE.md) (principes, procédures) et [l'index des modules](../MODULES.md) (rôle de chaque fichier, généré).

Écrite pour un développeur ou une session d'IA qui reprend le projet : lire ce fichier, puis le document du domaine touché, **avant** de modifier le code.

## Les documents

| Fichier | Contenu |
| --- | --- |
| [01-vue-ensemble.md](01-vue-ensemble.md) | le jeu, les technologies, le démarrage pas à pas, les couches, le motif des familles de méthodes, la carte des dossiers, les fichiers générés, les tests |
| [02-simulation.md](02-simulation.md) | le noyau déterministe : son périmètre exact (42 fichiers), le contrat d'un pas, les **deux chemins de pas**, le pipeline de `CarPhysics`, la gravité, le circuit vu par la physique, les checkpoints, `PHYS_VER`, les clés de classement |
| [03-course.md](03-course.md) | la boucle de l'application, `RaceSession` (états, image, pas, évènements → effets, rendu), fantômes, replay, Theater, l'arrivée, le retour |
| [04-systemes.md](04-systemes.md) | une fiche par système : application et navigation, entrées, audio, langues, garage, multijoueur, persistance et comptes, en ligne et serveur, éditeur, rendu et caméra, progression et contenus |
| [../audit/PHASE1-AUDIT-TECHNIQUE.md](../audit/PHASE1-AUDIT-TECHNIQUE.md) | **audit technique (phase 1)** : 89 problèmes identifiés (`TECH-001` à `TECH-089`), causes communes, risques de régression |
| [05-interactions-et-zones-sensibles.md](05-interactions-et-zones-sensibles.md) | carte des dépendances, parcours transverses (chargement, retour au checkpoint, gravité, checkpoint, collisions, obstacles…), ce qui continue de tourner, zones sensibles, **« si tu modifies… regarde aussi »**, défauts constatés, écarts entre docs et code |

Marques utilisées : **[V]** vérifié dans le code (avec `fichier:ligne`), **[D]** déduction raisonnable à partir du code, **[?]** incertain. Les numéros de ligne datent de la 0.16.0 : ils dérivent, les noms de fonctions restent.

## Réponses courtes

- **Où sont les systèmes ?** Noyau : `js/simulation.js`, `js/physics.js` + `js/physics/`, `js/raceLogic.js`, `js/track.js` + `js/track/`, `js/pieces.js`, `js/ribbons.js`, `js/sim/`. Course : `js/race.js` + `js/race/`. Application : `js/main.js` + `js/app/`. Éditeur : `js/editor.js` + `js/editor/`, `js/inspector*`. Rendu : `js/trackMesh.js`, `js/trackGeometry.js`, `js/scenery*`. En ligne : `js/online*.js`, `js/account.js`, `js/cloudsave.js`, `supabase/`. Multijoueur : `js/net/`, `js/app/multi.js`.
- **Comment le jeu démarre ?** `index.html` → `js/boot-guard.js` → `js/main.js` : langue, contrôle WebGL 2, écran d'accueil (qui fixe la portée du stockage), `new App`, `app.start()` (menu avec une course de démonstration en fond, boucle `requestAnimationFrame`) — `01-vue-ensemble.md` § 1.3.
- **Comment marche le gameplay ?** À chaque image, `RaceSession.update` fait des pas fixes de 1/120 s : commandes → `Simulation.drive` (physique) → effets lus dans `phys.ev` → `Simulation.score` (checkpoints, arrivée, logique) → réapparitions — `03-course.md` § 3.2.
- **Comment les systèmes communiquent ?** Appels directs depuis `App` et les sessions ; un **sac d'évènements par pas** (`CarPhysics.ev`) lu par la course ; un `Track` partagé en lecture par toutes les simulations ; des variables de module (portée du stockage, cache du profil, options de rendu) ; des évènements du salon multijoueur ; un crochet d'écriture du stockage pour la synchronisation ; et des **clés** (empreintes de circuits) qui relient records, médailles, classements et serveur — `05` § 5.1.
- **Les systèmes les plus importants ?** Le noyau de simulation, le modèle `Track` (et sa sérialisation), `RaceSession`, la persistance locale (records = progression), la fonction serveur de vérification.
- **Quelles mécaniques dépendent d'autres ?** Gravité → sol, volant, caméra, points de retour ; collisions → glisse et mini-turbo ; chrono → obstacles et pièces mobiles (qui reculent au retour au checkpoint) ; véhicule → réglages physiques et modèle 3D ; records → médailles → déblocage de la carrière — `05` § 5.2.
- **Quels fichiers examiner pour une modification ?** Tableau « Si tu modifies… » — `05` § 5.5.
- **Quels systèmes risquent d'être touchés ?** Tout ce qui est dans la fermeture de `verify.js` touche aussi replays, fantômes, classements et serveur ; tout ce qui change un code de circuit touche les clés — `05` § 5.4.
- **Les chemins d'exécution importants ?** Démarrage, boucle de l'application, une image de course, un pas, l'arrivée, le retour au checkpoint, l'essai depuis l'éditeur, l'envoi d'un temps, la publication — `02`, `03`, `05` § 5.2.
- **Ce qui reste insuffisamment compris ?** Voir « Couverture » ci-dessous.

## Couverture de cette analyse

**Méthode.** Le noyau, la course, la boucle et les parcours principaux ont été lus directement dans le code. Cinq domaines périphériques (éditeur, rendu et caméra, interface / entrées / audio / langues / garage, persistance / en ligne / serveur / SQL, multijoueur) ont été explorés en parallèle par des sous-agents en lecture seule, puis **leurs constats importants ont été revérifiés à la main** dans le code (et par de petites sondes Node) avant d'être écrits ; ce qui n'a pas été revérifié est marqué [D]. La suite `npm test` a été exécutée sur une copie du dépôt : 124 fichiers, 1 755 vérifications, toutes réussies. Rien n'a été lancé dans un navigateur ; la sensation de conduite n'a pas été éprouvée.

**Lu en détail** : `main.js`, `simulation.js`, `raceLogic.js`, `physics.js`, `physics/contact.js`, les parties gravité / entrée / sortie de `physics/ribbon.js`, `track.js`, `track/surfaces.js`, `replay.js`, `verify.js`, `race.js`, `race/finish.js`, `race/ghosts.js`, `race/replayMode.js`, `app/editorFlow.js`, `daily.js`, la construction des circuits de `tracks.js`, les verrous de `career.js` et `trackDescriptor.js`, `storage.js` (portée, records), `sim/logic.js` (`createLogic`), `sim/params.js`, l'outillage de test et la CI.

**Exploré par délégation puis vérifié par sondage** : éditeur et inspecteur, `TrackView` et caméra, navigation et entrées, multijoueur, comptes, synchronisation, fonction serveur, grants SQL.

**À approfondir** (non lu ou survolé) :
- la géométrie analytique en détail (`pieces.js : sampleLocal` par type de pièce, `ribbons.js : frameLocal`, rubans roulés), `physics/walls.js` (sondes de bordure), les véhicules v2 ;
- l'algorithme du pilote automatique (`autopilot.js`), dont dépendent le défi du jour, les médailles et le fantôme or ;
- `trackGeometry.js` pièce par pièce, `decos.js` / `decoPack.js`, `carModel.js`, `customCar.js` ;
- l'analyse (`analysis/reference.js`, `sectors.js`, `coach.js`), le HUD d'entraînement, le panneau du Theater ;
- les 19 étapes SQL ligne à ligne, les politiques RLS, `submit-score/handler.js` en détail ;
- la musique (`AudioEngine.js`), les dictionnaires, le wiki, les outils de level design (`tools/lab.mjs`, `contract.mjs`, `golden.mjs`, `medals.mjs`), le CSS.
