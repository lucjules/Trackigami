# 2. Le noyau de simulation

Ce qui décide d'un temps. Tout ici est **sans rendu, sans DOM, déterministe**, et tourne à l'identique dans le navigateur, sous Node (outils, tests) et sous Deno (fonction serveur `submit-score`).
Toute ligne modifiée dans ce périmètre peut changer un temps, un replay, un fantôme ou un classement.

## 2.1 Le périmètre exact : la fermeture de `js/verify.js`

Calculée à partir des imports (vérifié, 42 fichiers ; `tools/test-determinisme.mjs` la recalcule et la contrôle) :

| Rôle | Fichiers |
| --- | --- |
| Pas de simulation | `simulation.js`, `raceLogic.js`, `replay.js` (GhostRunner, InputRecorder), `verify.js` |
| Physique | `physics.js`, `physics/walls.js`, `physics/ribbon.js`, `physics/obstacles.js`, `physics/contact.js`, `physics/specs.js`, `physics/profiles.js`, `physics/vehicles/{moto2,boat2,glider2}.js` |
| Géométrie analytique | `pieces.js`, `ribbons.js`, `solids.js`, `obstacles.js`, `constants.js`, `dmath.js`, `mathutil.js` |
| Modèle de circuit | `track.js`, `track/surfaces.js`, `track/edit.js`, `track/shared.js` |
| Paramètres et environnement | `sim/params.js`, `sim/env.js`, `sim/logic.js` |
| Contenus et clés | `tracks.js` (72 circuits), `daily.js`, `seasons.js`, `variants.js`, `rulesCore.js`, `autopilot.js`, `ghostFormat.js`, `version.js` |
| Données tirées par `track.js` | `themes.js`, `ambiance.js`, `scripts.js`, `decoData.js`, `decoPackData.js`, `customDeco.js` |

Les six derniers sont des modules de **données** : ils ne changent pas la physique, mais ils sont exécutés par le serveur. Une erreur de syntaxe ou un import ajouté vers un module du navigateur y casse la fonction serveur (régénérée par `npm run build:function`).

Règles (ESLint sur une liste partielle de ces fichiers, `tools/test-determinisme.mjs` sur toute la fermeture) : ni `Math.sin/cos/tan/atan/atan2/asin/acos/exp/log/pow/hypot/random`, ni `**` ; utiliser `dsin`, `dcos`, `datan2`, `dpow`, `dexp`, `hypot2`, `hypot3` de `js/dmath.js`. `Math.PI`, `sqrt`, `abs`, `min`, `max`, `floor`, `round`, `sign`, `imul` restent permis. Aucune horloge, sauf `verify.js`, `daily.js` et `seasons.js` qui lisent la date pour choisir une **clé** (jamais pour la physique).

## 2.2 Le contrat d'un pas (1/120 s)

`DT = 1/120` (`js/constants.js:46`). Une commande par pas : `{ steer ∈ [-1,1] quantifié au centième, throttle, brake, respawn }` (`replay.js:12` `quantSteer`, `replay.js:17` `InputRecorder.push`).

`Simulation` (`js/simulation.js:25`) possède **une** voiture (`CarPhysics`), ses règles (`RaceLogic`) et la logique du circuit (`createLogic`, ou `null`).

```
[respawn demandé]  sim.rewind()                       simulation.js:57   (RaceLogic.rewind + placeAtRespawn)
drive(inp)         phys.clock = logic.steps (+ idle après l'arrivée)   simulation.js:67
                   phys.step(inp)                    physics.js:341
                   sank = ev.sink || ev.invalid
score()            ev = logic.update(phys)           raceLogic.js:97   (checkpoints, tours, arrivée)
                   lgc.onStep(ev)                    sim/logic.js      (règles ÉVÉNEMENT → ACTIONS)
                   suivi du hors-piste : groundT += DT si phys.offTrack
                   lost = finish ? '' : sank ? 'sink' : groundT > 0,5 s ? 'offTrack' : ''
[lost]             sim.rewind()                       (fait par l'appelant)
```

`step(inp)` = `drive` + `score` (`simulation.js:94`). L'arrivée franchie l'emporte sur une réapparition du même pas.

### Deux chemins qui doivent rester équivalents (point sensible n° 1)

| Chemin | Où | Utilisé par |
| --- | --- | --- |
| **A. `GhostRunner.step`** (`replay.js:119`) : `inp.respawn → rewind` ; `sim.step(inp)` ; `sim.lost → rewind` | | fantômes (or, importé), vérification serveur (`verify.js : replayRun`), analyse (`analysis/trace.js : TraceRunner`), défi du jour (`daily.js : botTime` utilise `sim.step` directement), outils |
| **B. `RaceSession._stepOnce`** (`race.js:287`) : `_input()` (en replay : `inputAt` puis `respawn()` si drapeau) ; `recorder.push` ; `sim.drive` ; **effets** (sons, particules, HUD, à partir de `phys.ev`) ; `sim.score()` ; réapparition décidée **à nouveau** par la course (`race.js:426-429`, tests de `sank` et de `sim.groundT`) | | course en direct, replay en jeu, Replay Theater |

Le chemin B ne lit pas `sim.lost` : il refait la même décision (`sank && state === 'racing'`, puis `groundT > offTrackLimit`), et `respawn()` ne fait rien si l'état n'est plus `racing` (arrivée du même pas). C'est équivalent aujourd'hui à la lecture du code. Les tests vérifient le chemin A (`tools/test-simulation.mjs:15` : `Simulation` et `GhostRunner` donnent la même course ; `tools/test-fantomes.mjs`, `tools/test-croises.mjs` : rejeu et `verifyRun`) et la cohérence interne du chemin B (Theater : un déplacement dans le temps redonne la lecture continue, `tools/test-browser.mjs:374`). Aucun test automatique ne termine une vraie course en direct (chemin B, avec des retours au checkpoint) puis la fait vérifier par le chemin A ; l'audit de phase 1 l'a fait à la main dans Chromium (pilote automatique bruité, trois retours au clavier, deux circuits dont un à obstacles) : **temps identiques au bit près** ([../audit/PHASE1-AUDIT-TECHNIQUE.md](../audit/PHASE1-AUDIT-TECHNIQUE.md) § 7.8). Toute modification de l'ordre ou des conditions doit être faite des deux côtés, et revérifiée de la même façon.

Autres différences assumées du chemin B :
- le retour au checkpoint demandé au clavier est exécuté **tout de suite** dans `update()` (`race.js:478` → `respawn(true)`), et le drapeau `respawn` est écrit avec la commande du **pas suivant** (`_pendingRespawn`, `race.js:292`) : au rejeu, `GhostRunner` fait le `rewind` au début de ce pas, donc au même moment ;
- les réapparitions automatiques ne sont **jamais** enregistrées : elles se reproduisent d'elles-mêmes au rejeu ;
- `tick` (index du replay, ne recule jamais) ≠ `logic.steps` (chrono, revient en arrière au checkpoint) ;
- le décompte ne fait aucun pas de physique ; après l'arrivée la physique continue (`state 'finished'`) sans enregistrement ;
- en championnat avec collisions, `_collide()` (`race.js:298`) modifie la voiture **avant** `drive` : cette course n'est pas rejouable, et en effet le multijoueur n'enregistre ni record ni classement (`race/finish.js:82-104`).

## 2.3 `CarPhysics.step` : le pipeline d'un pas

`physics.js:349 _stepCore` :

1. `_beginStep` (`:361`) : minuteries (`graceT`, `hazardGrace`), remise à zéro de **`this.ev`** (le sac d'évènements du pas : `wall`, `land`, `boostHit`, `loopIn/Out/Fall`, `transform`, `gravity`, `miniTurbo`, `landQ`, `sink`, `ring`, `flip`, `glass`, `spring`, `reverse`, `cut`, `spike`, `shock`, `wallOff`, `invalid`), `prev = pos`.
2. `_controls` (`:373`) : volant inversé (revêtement `reverse`), moteur coupé (`cut`), volant progressif (`steerIn/steerOut`), minuteries boost / rebond / choc.
3. `_driftState` (`:399`) : dérapage (frein + volant franc + vitesse), entretien, sortie, charge et libération du **mini-turbo**, transfert de charge d'un coup de volant.
4. Modèles v2 (`moto2Idle`) si `track.vm === 2` ou profil `sim`.
5. **Sur un ruban** (`this.rib`) : `_ribStep` (`physics/ribbon.js:232`) et fin du pas. **Sinon** :
   - au sol : `_driveGround` (`:454`) — repère du sol, tapis / pièce mobile (vitesse d'entraînement), gravité projetée, coefficients du revêtement (`physics/specs.js : surfaceCoeffs`), eau et noyade (`sinkT > 1,2 s → ev.sink`), vent de pièce, adhérence et vent du circuit (`this.params`), pluie / givre / rafales (`this.env`), v2, moteur (`_longitudinal`, `:735`), pneus (`_tires`, modèle bicyclette, `:284`), assistance de glisse, dégagement d'un mur (`unstick`), verre (`_glassCheck`) ;
   - en l'air : `_flyAir` (`:567`) — balistique, aucun gaz ni volant sauf un léger lacet (`airYaw`) et une bascule aux pédales (`airLean`) ; le frein est un aérofrein ; le deltaplane a son propre vol (`_glide`, `:780`).
6. `_collide` (`:613`) : intégration de la position, **anneaux** turbo / checkpoints aériens (`_rings`), **entrée de ruban** (`_tryEnterRibbon`) ou **réception sur un ruban** (`_tryLandRibbon`), coque des tubes, **bordures** (`_walls`), toits de tunnel, dalles, dessous des solides, voiture plaquée sous un toit en gravité inversée (`pinT > 1 s → lost`), **obstacles** (`_obstacles`), seconde passe des bordures si un obstacle a poussé la voiture, **limites du monde** (`_bounds`).
7. `_roadContact` (`:640`) : sol sous la voiture (`track.surfaceAt` ou `ceilingSurfaceAt` selon `gSign`), aimant, **décollage** (vitesse normale > `CAR.launch`), **réception** (`_landing` : qualité `perfect / ok / bad`, perte de vitesse), plaques à effet unique (rebond, inversion, ressort), voiture perdue dans le ciel.
8. `step` (`:341`) : contrôle de cohérence `_sane()` (NaN, infini, valeurs démesurées → `ev.invalid` → traité comme une noyade) ; chute sous `floorY` → `lost`.

`offTrack` (`:100`) = posée sur le terrain (`surfType 'ground'`) sans la règle `offroad`, ou `lost`.

### Les revêtements et plaques : où ils agissent

`_setGround` (`physics.js:179`) est le point unique où une surface touchée déclenche son effet : `reverse`/`cut` (`_timedMods`), `spring`, `boost` (`_boostPad`), `gravity` (`_gravityPad`), `flip` (inverse `gSign`), plaques de **transformation** `moto/boat/glider` (`_transformPlate`, repasser sur la même plaque ramène la voiture). `plateLock` empêche qu'une suite de plaques collées compte plusieurs fois. Sur un ruban, `_ribStep` applique les mêmes fonctions (`_boostPad`, etc.).

### Gravité et orientation (comment elles s'influencent)

- `gSign` (±1) : sens de la gravité. `gravMul` : intensité (plaque gravité, règle `g0`, action `grav` de la logique). `this.g = CAR.gravity × gravMul`.
- Elle s'inverse par : plaque `flip` au sol (`_setGround`), ruban qui retourne la voiture (`ribbonInverts(tile)` ou revêtement `flip` sur le ruban, `ribbon.js:257`), règle de départ `flip0` / départ posé à l'envers (`raceLogic.js:27 spawnPoint`).
- Elle commande : quelle requête de sol est utilisée (`surfaceAt` vs `ceilingSurfaceAt`), le « haut » local du volant (`_upSign`, au plafond la droite du pilote est la gauche du monde), la balistique, la perte dans le ciel (`skyY`), la caméra (`camflip.js`, `race/camera.js`), l'orientation visuelle (`race.js:247 _orient`).
- Elle est **restaurée** au checkpoint : chaque point de retour garde `gs` (`respawnGs`, `raceLogic.js:11`), `grav` et `vehicle`.

## 2.4 Le circuit vu par la physique (`js/track.js`, `js/track/surfaces.js`, `js/pieces.js`, `js/ribbons.js`)

- Grille : case `CELL = 32 m`, niveau `LEVEL_H = 6,4 m`, route de 24 m (`ROAD_HALF = 12`), `MAX_LEVEL = 60` (`constants.js`).
- `Track.index` : `Map` case → pièces (`track.js:171 tilesAt`). `Track.cellsOf` (`:86`) inclut les cases **balayées** par une glissière ou une rotation ; `Track.range` (`:109`) les niveaux réservés (portiques, anneaux, murs, rubans roulés, ascenseurs).
- `Track.version` est incrémenté par toute modification (`_insert`, `remove`, `setParams`, `setLogic`, `clear`, et les méthodes de `track/edit.js`) : il invalide les caches `obstacles`, `obstacleGrid`, `solidIndex`, `hasMovers`.
- `sampleLocal(tile, lx, lz)` (`pieces.js:703`) est la **géométrie analytique** d'une pièce au sol : hauteur, normale, écart latéral `d`, dans l'emprise ou non. La même fonction sert à la physique, aux checkpoints et aux maillages (`trackGeometry.js`).
- `ribbonOf(tile)` / `frameLocal(rib, u)` (`ribbons.js:30`, `:396`) : la géométrie des **rubans** (loopings, vrilles, tubes, murs, plafonds, rubans roulés `tile.o`). `isRibbon(tile)` décide si une pièce se parcourt en mode ruban.
- Sol : `surfaceAt(x, y, z, out, step, broken, time, hidden)` (`track/surfaces.js:48`) — la surface la plus haute sous le point, parmi les pièces fixes, puis les pièces mobiles **à leur position au chrono `time`**, puis le dessus des solides. Plafond : `ceilingSurfaceAt` (`:18`), pièces posées à l'envers (jamais mobiles : `OPTION_CONFLICTS`, `pieces.js:472`).
- Le circuit n'a **pas d'horloge** : chaque voiture interroge les pièces mobiles à son propre chrono (`phys.clock`). Le joueur, le fantôme or et un adversaire partagent le même `Track` sans interférer.

### État propre à chaque voiture (jamais dans le `Track`)

Verre brisé (`phys.broken`, `glassTime`, restauré par `place()`), groupes cachés par la logique (`setLogicExclusion` → `phys.excl` et `logic.excluded`), `plateLock`, minuteries de grâce (`graceT` 1,5 s, `hazardGrace` 0,8 s après un (re)départ : ni verre, ni piques, ni obstacles), `glassSafe` (le verre sous un point de retour ne cède pas tant que la voiture ne l'a pas quitté). Cette séparation est ce qui permet plusieurs simulations sur un même circuit : **ne jamais ranger d'état de course dans `Track`**.

## 2.5 Règles de course (`js/raceLogic.js`)

- `cps` : pièces checkpoint (`cpKind` : pièce checkpoint, option `cp` 1 portique / 2 anneau). `collected` : checkpoints pris. `splits` : pas de passage.
- `update(phys)` (`:97`) : pour chaque pièce de la case de la voiture : anneau (franchissement du plan, cercle de rayon `RING_R`), portique (fenêtre verticale, emprise, `|d| ≤ ROAD_HALF + 1,5`), arrivée (`missing` s'il manque des checkpoints, `lap` s'il reste des tours, sinon `finish`). Les pièces cachées par la logique sont ignorées.
- Chaque checkpoint pose un **point de retour** `respawn = { x, y, z, yaw, vehicle, grav, gs, snap }` ; `snap` (`_snap`, `:52`) garde `steps`, nombre de `splits`, `collected`, `lap` et l'état de la logique (`ext`). `rewind` (`:63`) restaure tout cela (sauf le chrono avec `keepClock`, en multijoueur).
- Cas particuliers vérifiés : anneau aérien → retour au dernier sol stable (`lastGround`, relevé tous les 30 pas) avec le chrono de ce moment ; ligne d'arrivée franchie hors chaussée → point de retour ramené sur la route ; cap du retour retourné si la voiture passait à contresens.

## 2.6 Ce qui s'ajoute à la physique « derrière une donnée »

Principe (vérifié dans le code) : à leur valeur par défaut, ces options ne font **aucune opération** de plus ; l'empreinte des scénarios existants ne bouge pas.

| Donnée du circuit (`track.js : RULES`, `:32`) | Lue par | Effet |
| --- | --- | --- |
| `grip`, `wind`, `windDir` | `sim/params.js : paramsOf` → `phys.params` | adhérence et vent de tout le circuit |
| `rain`, `frost`, `gust`, `envSeed`, `envVary` | `sim/env.js : envOf` → `phys.env` (`null` par défaut) | flaques, givre, rafales tirés d'une graine et du chrono |
| `vm`, `pm` | `physics/profiles.js : specsOf`, `v2Of` | profils Arcade / Simulation, véhicules v2 |
| `offroad`, `v0`, `g0`, `veh0`, `flip0` | `raceLogic.js : placeAtStart`, `CarPhysics.offTrack` | règles de départ |
| `lg` (logique) | `sim/logic.js : createLogic` | montrer / cacher des groupes, gravité, compteurs, effets |

Chacune entre dans la **signature** (`track.js:339 signatureText`) dès qu'elle quitte sa valeur par défaut, et force le format de code v4.

## 2.7 Obstacles, solides, logique

- **Obstacles** (`obstacles.js`, `physics/obstacles.js`) : des décorations particulières (`OBST` : piques, balanciers, marteaux, murs coulissants, balayeurs, bumpers), mouvement fonction du **chrono seul** (`obstacleLocal(d, t)`). Index spatial de 20 m sur le circuit (`Track.obstacleGrid`), parcouru dans un ordre fixe : l'ordre compte, chaque contact corrige la position avant le suivant. Piques = contact létal (`ev.spike + ev.sink`).
- **Solides** (`solids.js`) : décorations « en dur » (piliers, poutres, murs, blocs). Côtés = bordures (`walls.js : _probeSolids`), dessus = sol (`solidFloor` dans `surfaceAt`), dessous = toit (`_solidRoof`). Index de 16 m.
- **Logique** (`sim/logic.js`) : état par simulation (groupes cachés, compteurs, déclenchements), isolé (ensembles créés dans `createLogic`). Ses effets visuels (`fx`) ne sont lus que par la course en direct (`race.js:126 _logicSync`) ; les fantômes et le serveur les ignorent (file plafonnée à 64).

## 2.8 Ce qui lie tout : `PHYS_VER`, empreinte, corpus

- `PHYS_VER` (`js/version.js:17`, actuellement 38) est écrit dans chaque record (`pv`), fantôme partagé (`v`) et envoyé au serveur ; un écart rend les commandes non rejouables (`race.js:143`) et fait refuser le temps (`verify.js : versionError`).
- `tools/phys-fingerprint.mjs` : 193 scénarios (pilote automatique et commandes pseudo-aléatoires sur les 72 circuits, défis du jour, cas spéciaux) hachés au bit près ; doit être identique sous Node, Deno et Chromium (CI).
- `tools/compat/corpus.json` (`tools/test-compat.mjs`) : clés de classement, codes de tous formats, courses enregistrées avec leur temps exact.
- Procédure de changement de physique : `docs/ARCHITECTURE.md`, « Changer la physique » (incrément de `PHYS_VER`, empreinte, temps de référence, médailles, corpus, fonction serveur **à redéployer à la main**).

## 2.9 Clés de classement (dépendent de ce périmètre)

| Clé | Construite par | Dépend de |
| --- | --- | --- |
| `b-<id>-<hash>` | `main.js:95` : `hashString(buildBuiltin(def).encode())` | **tout** le code du circuit : script, nom, auteur (`BUILTIN_AUTHOR = 'Copytrack'`, ancien nom gardé exprès), décor, obstacles, paramètres |
| `daily-AAAA-MM-JJ` | `daily.js : dailyChallenge` | la date seule : le circuit est **régénéré** (graine de la date, tentatives validées par le pilote automatique). Un changement du générateur, des pièces ou de la physique change le circuit d'un jour passé sans changer sa clé (gardé par le corpus et l'empreinte) |
| `u-<signature>` | `track.js:362 userKey` | `signatureText()` : pièces, décorations physiques, **décor** (`this.decor` est en tête de la signature), tours, règles, logique et groupes ; pas le nom, la description, l'auteur, les couleurs, le thème de pièce `th`, l'ambiance, les scripts |
| `<clé>~v1.<variante>` | `variants.js` | la clé de base + des règles appliquées à une copie (`rulesCore.js`) ; `sea-N`, `duel-N`, `tour-N`, `as-1` (aides) |
| `e-<hash du code>` | `app/editorFlow.js:102` | essais depuis l'éditeur (jamais envoyés au serveur, mais enregistrés en local : voir zones sensibles) |
