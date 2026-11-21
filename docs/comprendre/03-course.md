# 3. La course en direct : boucle, états, effets, arrivée

## 3.1 La boucle de l'application (`js/main.js:393 start`)

Une seule boucle `requestAnimationFrame` pour tout le jeu (`main.js:476 loop`), protégée : une exception est passée à `_loopError` (`:220`) et l'image suivante est **toujours** demandée.

Chaque image (`frame`, `:435`) :
1. `dt = min(0,1 s, écoulé)` ;
2. `input.pollGamepad(mode)` ; navigation des menus à la manette (`_padNav`) si un menu ou une fenêtre est ouvert ;
3. Échap : ferme la fenêtre, la fiche circuit ou revient au menu ;
4. **`this.session.update(dt)`** — la session courante (course, démo du menu, éditeur, garage) ;
5. rendu (`renderer.render`) plafonné : 30 i/s dans les menus, `fpsCap` du profil de qualité ;
6. `quality.tick()`, banc d'essai au premier lancement ou surveillance (`quality.watch`, réduction automatique) ;
7. `finally` : `input.clearHits()` (les touches « appuyées cette image » sont effacées).

`App.session` est **toujours** une session : dans les menus c'est une course de **démonstration** (`app/screens.js:30`, `RaceSession(..., { demo: true })` sur un circuit intégré tiré au hasard, piloté par `Autopilot`). Tout code qui teste `this.session instanceof RaceSession` doit donc aussi tester `demo` (exemple : `main.js:146 _autoPause`).

Changer d'écran passe par `App._dispose()` (`main.js:183`) : `session.dispose()`, fermeture de la fenêtre, du tableau de manche ; puis une nouvelle session (`playTrack`, `showMenu`, `openEditor`, `openGarage`).

## 3.2 `RaceSession` (`js/race.js:41`)

Classe découpée en familles de méthodes (`Object.assign`, `race.js:733`) : `race/camera.js`, `race/ghosts.js`, `race/net.js`, `race/finish.js`, `race/replayMode.js`, `race/scriptsRun.js`, `race/training.js`, `theater/session.js`, `theater/cameras.js`.

### Construction (`race.js:42`)
Dans cet ordre : aides à la conduite (`aids.js` : clé déplacée vers `~v1.as-1`, médailles retirées), `TrackView` (maillage, ajouté à `scenery.trackGroup`), `scenery.setTrack` (décor, ambiance), **`Simulation`**, `EnvFx`, modèle de la voiture (`createCar(profile().loadout)`), traces, voiture fantôme du record, pilote automatique (démo), replay (`decodeInputs`), fantômes simulés (`_setupGhosts` : or si la médaille d'or n'est pas gagnée et que le circuit a une ligne `track.path`, fantôme importé si même `PHYS_VER`), adversaires (multijoueur), mini-carte, rivaux, caméras, `loadRecord`, **`restart()`**, HUD d'entraînement, Theater.

### Machine à états (`this.state`)
```
countdown ──GO (1,65 s ; en multi : startLocal convenu)──► racing ──finish──► finished
    ▲                                                      │  ▲
    └──────────── restart() (T / Entrée) ◄─────────────────┘  │
racing ⇄ paused (Échap / pause ; jamais en multijoueur ; aussi _autoPause : onglet masqué, portrait, contexte WebGL perdu)
demo, replay : démarrent directement en 'racing'
```
- `restart()` (`:151`) : `sim.start(spawn)` (grille de départ en championnat), nouvel `InputRecorder`, `tick = 0`, stats, particules, traces, HUD.
- `respawn(fromInput)` (`:215`) : `sim.rewind({ keepClock: multi })`, historique du fantôme enregistré tronqué, stats ramenées à l'instantané du checkpoint (`statsSnap`), voiture et caméra recalées (`_camCut`), en multijoueur compteur de téléportation et 2 s de protection.

### Une image de course (`update`, `:461`)
1. Commandes de session : pause, recommencer, retour au checkpoint, caméra, klaxon.
2. Décompte (aucun pas de physique, son du moteur au point mort).
3. `acc += dt` puis `while (acc >= DT) { _stepOnce(); _cameraTick(); acc -= DT }` : **pas fixe**, la caméra avance au même pas.
4. `render(dt, acc / DT)` : interpolation `prev → pos` de la voiture, du fantôme et de la caméra.

### Un pas (`_stepOnce`, `:287`) — voir aussi `02-simulation.md` § 2.2
`_input()` → `quantSteer` → `recorder.push` (seulement en `racing`, hors démo et replay) → `tick++` → collisions douces (championnat) → **`sim.drive`** → `_orient` (orientation visuelle lissée) → envoi réseau (multi) → contrôle du « mauvais sens » → **effets lus dans `phys.ev`** → **`sim.score()`** → échantillon du fantôme tous les `GHOST_EVERY` pas → `_event(res)` → réapparition automatique.

### Évènement physique → effets (tous dans `_stepOnce`, `race.js:303-413`)

| `phys.ev` | Son (`app.audio`) | Particules / caméra / manette | Message (`hudMessages.js`) |
| --- | --- | --- | --- |
| `boostHit`, `miniTurbo` | `boost`, `miniTurbo` | coup de champ de vision (`_feel.punchT`), étincelles | — |
| `wall > 3` | `thud` | étincelles, secousse, vibration | — |
| `land > 4`, `landQ` | `land`, `perfectLanding` | poussière, tassement de caméra | `badLanding` |
| `transform` | `transform` | éclat de la couleur du revêtement, `car.setVehicle` | véhicule |
| `sink` / `spike` / `invalid` | `thud` | éclats | `sink`, `spikes`, `invalid` |
| `glass` | `thud` | éclats de verre | `glass` |
| `flip`, `gravity` | — | secousse | `flip`, `gravity` |
| `reverse`, `cut`, `spring`, `bounce`, `ring`, `loopIn`, `loopFall` | divers | divers | divers |

Ces effets **ne modifient jamais** l'état physique : ils lisent `phys` et écrivent dans l'audio, les particules, la caméra (`shake`), la manette et le HUD. `Math.random` n'y sert qu'au visuel.

Compteurs de course (`this.stats` : chocs, réapparitions, réceptions parfaites, turbos, anneaux, mauvais sens) : lus par l'objectif bonus de carrière, l'expérience, la télémétrie, le coach.

### Rendu d'une image (`render`, `:541`)
Synchronisation de la logique du circuit (`_logicSync` : visibilité des groupes, effets), pièces mobiles et obstacles au chrono interpolé (`view.updateMoving(obsT)`), lampes, dalles brisées (`view.setBroken` quand `phys.brokenVer` change), voiture interpolée (`slerp` de `prevQuat → quat`), roues, roulis, flammes, traces de pneus, étincelles, traînée, sillage, fantômes (`_renderGhost`, `_renderSimGhosts`, `_renderRivals`), **caméra** (`_cameraRender`), mini-carte, voitures distantes, `scenery.update`, ressenti (`_feelUpdate` : aspiration, croisements, vibrations), scripts de circuit, **moteur et musique** (`audio.engine`, `music.setSpeed`), **HUD** (chrono, vitesse, lignes de vitesse).

## 3.3 Fantômes, replay, Theater, analyse

| Quoi | Source | Comment il roule |
| --- | --- | --- |
| Fantôme du record | `record.ghost` (poses tous les 4 pas, format compact `G2`) | **relu** au chrono du joueur (`race/ghosts.js : _drawRecorded`) |
| Fantôme or | `GhostRunner({ bot: true })` : pilote automatique, **simulé en direct** sur le même `Track` | `poseAt(logic.steps)` : historique ; un retour au checkpoint relit une ligne plus ancienne |
| Fantôme importé (`SHG1:`) | `GhostRunner({ inputs })` | idem |
| Rivaux du classement | poses téléchargées (`setRivals`) | relus comme le fantôme du record |
| Replay en jeu | `opts.replay.inputs` | **`RaceSession` elle-même** rejoue ses commandes par `_stepOnce` (`race/replayMode.js:8`), vitesse ×0,25 à ×4, export vidéo |
| Replay Theater | `opts.theater` | construit sur le replay ; se déplacer en arrière = recommencer et rejouer sans image ni son (`NOOP`, `theater/session.js`) |
| Analyse, coach, Académie, laboratoire | `analysis/trace.js : traceFromInputs` (un `GhostRunner` qui prend des notes) | hors temps réel |

Seuls les circuits **scriptés** (intégrés, défi du jour, Académie) ont une ligne `track.path` : les circuits d'éditeur et de la communauté n'ont donc ni fantôme or, ni pilote automatique, ni avertissement de mauvais sens (`race.js:95 wayTrack`).

## 3.4 L'arrivée (`race/finish.js:66 _finish`)

Ordre vérifié, avec des **sorties anticipées** qui excluent des pans entiers :

1. `state = 'finished'`, moteur coupé.
2. Replay → message, fin. Académie → `app.onAcademyFinished`. Mode de jeu → `app.onModeFinished`. Championnat → temps envoyé au salon. Multijoueur libre → temps envoyé, « R : nouvel essai ». **Aucun de ces cas n'écrit de record ni ne touche au classement.**
3. Course classable : `lastRun = { inputs, time }` ; record si meilleur que l'ancien de même `PHYS_VER` (et pas un essai depuis le curseur) → **`saveRecord(trackKey, …)`** avec fantôme, commandes, `pv`, temps intermédiaires.
4. `pushRun` (10 dernières courses) pour les clés `b-`, `daily-`, `u-` hors éditeur.
5. Médaille (`medalFor`), série du défi du jour (`rewards.js : noteRace`), télémétrie, pièces (`profile.js : rewardCoins`), objectif bonus (`career.js : goalMet`, `completeGoal`), expérience et niveaux (`progression.js : awardRace`), récompenses (`app.checkRewards`).
6. Vérification depuis l'éditeur → `app.onEditorTestFinished` (`app/editorFlow.js:110` : `track.setVerified`, preuve `authorProof.saveProof`).
7. `ui.showFinish(...)`, coach (`app._finishCoach`).
8. **`app.onRaceFinished`** (`main.js:288`) : si clé `b-|daily-|u-`, record, envoi permis, pas d'éditeur ni de replay → `online.submitScore` (le serveur rejoue la course) ; au retour, `_ensureLocalRecord` et message. Le test `this.session !== session` après chaque `await` protège contre un changement d'écran pendant l'envoi.

## 3.5 Quitter une course (`main.js:267 quitRace`)

Retour selon l'origine, dans cet ordre de priorité : salon multijoueur, Académie, modes, **éditeur** (`openEditor(this.editorState)`), fiche du circuit (`_backToHub` si `opts.fromHub` et même clé), liste des circuits (intégré ou défi), mes circuits, communauté, menu.
