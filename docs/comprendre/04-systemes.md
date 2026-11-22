# 4. Les systèmes, un par un

Chaque fiche dit : rôle, fichiers, points d'entrée, dépendances, données, déclencheurs, et ce qu'une modification risque de toucher.
Le noyau de simulation et la course en direct ont leurs propres documents (`02-simulation.md`, `03-course.md`).
Marques : **[V]** vérifié dans le code, **[D]** déduction raisonnable, **[?]** incertain.

---

## 4.1 Application, écrans et navigation

**Rôle.** Une seule instance `App` (`js/main.js:52`), créée après l'écran d'accueil, porte toute l'orchestration ; ses méthodes sont réparties en familles dans `js/app/*.js` (ajoutées au prototype, `main.js:487`).

**État.** [V]
- `App.mode` ∈ `null | 'menu' | 'race' | 'editor' | 'garage'` ; le replay et le Theater tournent en `'race'`.
- `App._screen` : écran DOM affiché (`app/screens.js:38 showScreen`) ; liste des écrans dans `js/ui.js:13` (`loading, menu, tracks, race-hub, mytracks, community, profile`). Le garage n'est pas un écran : c'est l'élément `#garage`.
- `ui.setMode` (`ui.js:132`) bascule `body.in-race`, `#hud`, `#editor`, `#touch`. Les superpositions pause / arrivée (`showOverlay`) et la fenêtre (`ui.modal`, `ui.modalOpen`) sont lues **dans le DOM** (classes `hidden`) par la boucle (`main.js:442`).
- Une quarantaine de drapeaux `this._xxx` répartis sur `App` (`_hub`, `_lastDesc`, `_replayBack`, `_lastPanel`, `_editorKeep`, `_openingEditor`, `_glLost`…).

**Accueil.** Six tuiles ; chaque tuile ouvre un panneau `.menu-panel` (`app/wiring.js:132 _menuSub`) ; un délégué de clics unique sur `document` (`wiring.js:17`) dispatche les `data-action` vers `_action` (`wiring.js:151-229`).

**Lancement d'une course** [V] : sélection → **descripteur** (`js/trackDescriptor.js` : `describeBuiltin`, `describeDaily`, `describeUser`, `describeCommunity`, `describeVariant`) → **fiche du circuit** (`app/raceHub.js:57 openRaceHub`) → « Jouer » → `launchDesc(desc, extra)` (`raceHub.js:50`) → `playTrack(track, opts)` (`main.js:201`) → `new RaceSession`.

Champs de `opts` selon la source [V] :

| Source | Champs |
| --- | --- |
| carrière | `trackKey, medals, difficulty, hasNext, builtinIndex, seed, goal, goalKey` |
| défi du jour | `trackKey, medals, difficulty: 3, seed, daily` |
| mes circuits | `trackKey: userKey, userEntry, userMap, medals (dérivées si vérifié), difficulty: 2` |
| communauté | idem + `community` (médailles seulement si l'auteur a vérifié) |
| catégorie de record | `trackKey: <clé>~v1.…, variant, officialTrack, mutation?` (perd `builtinIndex`, `hasNext`, `goal`…) |
| depuis la fiche | `fromHub`, `rivals` |
| mode de jeu | `mode, trackKey: null` ; Académie : `academy, trackKey: null` ; Theater : `replay, theater, trackKey: null` |
| éditeur | `fromEditor, verify, spawn, trackKey: 'e-…'` (`app/editorFlow.js:102`) ; multijoueur : `multi, trackKey: null` |

**Impact d'une modification.** Ajouter une source de course = un descripteur + ses champs `opts` + une branche de `quitRace` (`main.js:267`) + ce que lit `race/finish.js`. Les écrans se retrouvent par des **identifiants DOM en dur** (`$('hub-play')`, `fin-*`, `pq-*`…) répartis dans de nombreux fichiers : renommer un `id` de `index.html` demande une recherche globale (`tools/test-menu.mjs` garde la structure de l'accueil).

**Observations.** [V] Échap dans la boucle revient au menu sans rouvrir `_lastPanel` (le bouton « Retour », lui, le fait) ; avec les aides à la conduite, `canHub` compare la clé `…as-1` à `_lastDesc.key` et masque le bouton « Fiche du circuit » (`race/finish.js:194`) ; `opts.variant` et `opts.modeTrack` sont écrits mais jamais lus.

---

## 4.2 Entrées (`js/input.js`, `js/app/wiring.js`, `js/aids.js`)

**Rôle.** Clavier (codes physiques `e.code`, donc QWERTY et AZERTY), manette, tactile, vers deux API : `hit(code)` / `act(action)` (appuyé **cette image**), `held`, et `drive()` (commandes de conduite).

- [V] `pressed` ne garde que les vrais appuis (pas la répétition) ; la saisie dans un `INPUT`, `TEXTAREA`, `SELECT` est ignorée (y compris curseurs et cases : un curseur de la pause qui a le focus fait ignorer Échap et P [D]).
- [V] **Arbitre (0.16.1, TRANS-03)** : un seul contexte actif (`capture`, `modal`, `overlay`, `race`, `editor`, `garage`, `menu`), calculé par `App.inputContext()` à chaque image et à l'ouverture / fermeture d'une fenêtre ou d'une superposition (`ui.js`). `Input.setContext()` vide `pressed` et `padEdges`, remet les fronts de manette sur l'état courant et verrouille « valider » (A) jusqu'à un relâchement. Le contrat complet (qui consomme quoi) est en tête de `js/input.js` et dans [ARCHITECTURE.md](../ARCHITECTURE.md).
- [V] Entrée / Espace dont la cible est un contrôle activable (bouton, lien, carte…) ne vont jamais dans `pressed` : ils activent le contrôle une fois (sinon Entrée sur « Reprendre » = « recommencer »). Sous une fenêtre, seul Échap est mis en file ; `act()` renvoie faux.
- [V] `clearHits()` est appelé à **chaque image** dans le `finally` de la boucle : une action non lue dans l'image est perdue.
- [V] Manette : `pollGamepad(mode)` (fronts par table `EDGE`) ; les fronts « menu » sont suivis à chaque image, ceux de la course / de l'éditeur dans leur contexte ; navigation spatiale des menus `_padNav` ; « retour » (B) et Échap passent par `goBack()` (clic sur le bouton « ← Retour » visible).
- [V] Tactile : les boutons retour au checkpoint / pause / recommencer appellent `input.post(action)` (file d'actions, même durée de vie que les fronts de manette) : l'action est déclenchée quelle que soit la touche qui lui est liée. Les aides qui citent des touches sont produites avec `keyLabel` (`refreshKeyHints`, `hintKey`).
- [V] Réassignation : `captureKey(cb)` (rappel `(code, raison)`) ; `cancelCapture()` est appelé à tout changement d'écran, d'onglet, de course (`_dispose`) et à l'ouverture d'une fenêtre ; la scrutation de manette de `_capturePad` s'arrête avec elle.

**Chaîne des commandes en course** [V] (`race.js:274 _input`) : `input.drive()` → `steerCurve` (réponse du volant, `aids.js:35`) → `aids.apply` (aides : gaz auto, anti-tête-à-queue… ; seulement en `racing`) → `quantSteer` → **enregistrement**. Les commandes **effectives** sont enregistrées : le rejeu ne relance pas les aides. Une course aidée va dans la catégorie `~v1.as-1`, sans médailles ; les aides sont coupées en saison, duel, tournoi (`aidedKey` renvoie `null`).

**Impact.** Changer `drive()` ou `steerCurve` ne casse pas les replays (on enregistre la sortie) mais change le ressenti ; changer `quantSteer` ou le format `InputRecorder` casse **tous** les replays, fantômes et la vérification serveur.

---

## 4.3 Audio (`js/audio.js`, `js/music.js`, `js/AudioEngine.js`)

- [V] `GameAudio` crée l'`AudioContext` au premier geste (`unlock`, écouteurs `pointerdown` / `keydown` jamais retirés, `main.js:104-106`) : sons synthétisés (moteur, glisse, vent, pluie, chocs…), aucun fichier audio.
- [V] `engine(state)` est appelé à chaque image de course **y compris la démo du menu** (`race.js:661`) ; coupé en pause, à l'arrivée, à la fermeture.
- [V] `Music` : `'menu'` (house) ou `'game'` (chill), fondu de 450 ms ; `AudioEngine` séquence par `setInterval` (25 ms) et écrit directement vers `ctx.destination` (le volume des effets ne touche pas la musique).
- [V] Onglet masqué : contexte suspendu (`main.js:150`). [D] Une reprise de la musique (minuterie) peut le réveiller dans un onglet masqué.
- Musique par écran : menu / éditeur → menu ; course → ambiance du circuit ou chill ; multijoueur et Académie → toujours chill (`main.js:212`).

---

## 4.4 Langues (`js/i18n.js`, `js/i18n/boot.js`, `js/i18n/dom.js`, `js/i18n/en/*.js`)

- [V] Le **français est la source et la clé**. `initI18n()` tourne avant l'accueil (`main.js:504`) ; le dictionnaire anglais est chargé à la demande (`import('./en.js')`, assemblage de 10 fichiers ; à clé égale, le dernier gagne).
- [V] Entrées exactes + **modèles à trous** (`{x}`, `{x:t}`, `{x:w}`), triés par longueur ; `t()` ne fait que la recherche exacte.
- [V] En anglais, `DomTranslator` parcourt toute la page puis observe le document entier (`MutationObserver` : texte, `title`, `placeholder`, `aria-label`, `alt`) et réécrit ce que le jeu écrit en français.
- **Risques.** [V] Seul `#opt-lang` est marqué `data-i18n="off"` : [D] les contenus des joueurs (noms de circuits, pseudos, commentaires) passent aussi par le dictionnaire (un circuit nommé « Jouer » s'afficherait « Play ») ; un modèle trop général peut capturer un autre texte (raison pour laquelle `logicText.js` a sa propre table). Ajouter un texte français dans le code : ajouter sa traduction dans `js/i18n/en/<domaine>.js` (`tools/test-i18n.mjs`, `tools/i18n-scan.mjs`).

---

## 4.5 Garage, cosmétiques, codes de partage (`js/garage.js`, `js/garage/studio.js`, `js/cosmetics.js`, `js/custom.js`, `js/customCar.js`, `js/mods.js`, `js/rules.js`)

- [V] **100 % visuel** : la physique ne lit jamais l'équipement (`cosmetics.js`, en-tête ; `tools/test-cosmetics-physics.mjs`).
- [V] Flux : `profile().loadout` → `createCar(loadout)` (`race.js:70`) ; la voix et le klaxon du joueur viennent aussi du profil. Le garage édite un brouillon (`GarageSession.draft`) et ne l'enregistre (`setLoadout`) que si tout est possédé.
- Codes : `SHC1:` voiture (`custom.js`), `SHX1:` paquet « mod » (voiture, interface, caméras, pièces déco, modes : `mods.js`), `SHM1:` mode de jeu (`rules.js`). [V] Deux politiques différentes pour les objets non possédés : l'atelier les garde en aperçu avec achat, le paquet les remplace par les valeurs d'origine.
- `rules.js` (modes, objectifs, descriptions) s'appuie sur `rulesCore.js` (noyau pur **dans la fermeture serveur**, car les catégories de record sont des règles).
- **Observations.** [V] La minuterie `_studioT` (`garage/studio.js:19`) n'est pas annulée par `GarageSession.dispose` (`garage.js:283`) : [D] quitter le garage dans les 120 ms qui suivent une modification peut reconstruire une voiture dans la scène suivante. [V] La règle de salon `sameCars` ne change que la voiture locale (`race.js:69`) ; les voitures distantes gardent l'apparence annoncée (`race/net.js:16`).

---

## 4.6 Multijoueur en direct (`js/net/*.js`, `js/app/multi.js`, `js/race/net.js`, `js/remoteCar.js`, `supabase/MULTI.md`)

**Architecture** [V]
- **Supabase Realtime** ne sert qu'à se trouver : un canal par salle (`realtime:copytrack-room-<CODE>`, protocole Phoenix écrit à la main, `net/signaling.js`), présence `{ name, host, ready, racing, v: PHYS_VER, net: NET_VER, car, want, mode }`, et relais des messages WebRTC (`signal`).
- **WebRTC en maillage complet** (`net/transport.js`) : par paire, un canal `state` (non ordonné, sans retransmission) et un canal `ctl` (ordonné, fiable) ; 8 joueurs au plus ; STUN + TURN à identifiants temporaires fournis par la fonction serveur `ice` (`net/ice.js`).
- **L'hôte** (créateur ; sinon le plus petit identifiant) décide du circuit (code envoyé par morceaux de 12 Ko pour un circuit de joueur), des règles, du départ, du championnat (grille, clôture des manches, points). La physique, les temps et les collisions restent **chez chaque joueur**.
- Versions : un arrivant de `PHYS_VER` / `NET_VER` différents est refusé ; les paquets d'état ont leur propre version (`SNAP_VERSION = 2`).

**En course** [V]
- Paquet d'état de 40 octets (`net/snapshot.js`) envoyé 20 fois par seconde (`SEND_EVERY_STEPS = 6`, `race.js:301`), plus à chaque réapparition, nouvel essai, arrivée.
- Réception : tampon d'interpolation (`net/interp.js` : rendu 100 ms dans le passé, Hermite, extrapolation ≤ 0,25 s) → `RemoteCar` (fantôme translucide en course libre, vraie voiture en championnat).
- Classement en direct : `ProgressTracker` sur `track.path` (sinon les checkpoints).
- Départ commun : `startLocal = maintenant + délai − rtt/2` ; le décompte de `RaceSession` lit cette heure.
- Pas de pause (Échap propose de quitter), retour au checkpoint **sans** remise du chrono (`keepClock`), aucun record, aucun classement, aucune télémétrie (`race/finish.js:82-104`).

**Collisions douces** [V] (`net/collide.js`, appelées par `RaceSession._collide` **avant** `sim.drive`) : chaque joueur applique sa moitié du choc à sa voiture, d'après la position extrapolée de l'autre. Elles modifient directement `phys.pos` / `phys.vel` : c'est la seule écriture dans l'état physique qui ne passe pas par `Simulation` (course non rejouable, ce qui est assumé). La poussée de pénétration est plafonnée ; [V] l'impulsion de vitesse peut atteindre 8 m/s **en un pas** (`collide.js:44`), contrairement à ce que laisse entendre `supabase/MULTI.md`.

**Reconnexion** [V] (`net/resume.js`, NET_VER 4) : place gardée 20 s, retentatives, état renvoyé par l'hôte, migration d'hôte au départ définitif (`hostover`). [V] Le jeton de reconnexion est stocké mais **jamais comparé** (`room.js:302`).

**Observations** [V] sauf mention :
- `_setupRemotes` (`race/net.js:10`) n'ajoute que les joueurs présents au départ : un arrivant pendant la course n'apparaît pas.
- `Room.started` n'est jamais remis à faux (`room.js:70, 315, 375`) : [D] un invité resté dans le salon est relancé chaque fois que l'hôte choisit un autre circuit.
- [D] Les écouteurs de `multiLobby` ne sont retirés que par ses boutons (Échap ou un départ les laissent) ; une voiture distante dont le lien est mort reste figée, et collisionnable en championnat.
- `net/rollback.js` est un **prototype non branché** (tests et banc seulement ; décision : `docs/ROLLBACK.md`).
- [D] Un départ de salle appelle `playTrack` quel que soit l'écran, éditeur compris.

---

## 4.7 Persistance locale et comptes (`js/storage.js`, `js/profile.js`, `js/account.js`, `js/cloudsave.js`, `js/welcome.js`)

**Portée du stockage** [V] (`storage.js:10-27`) : une variable de module `PREFIX` choisie **une fois, avant la construction d'`App`**, par l'écran d'accueil (`welcome.js : runWelcome` → `setScope`) :
- invité : `shardway.<clé>` (nom d'origine du projet, gardé pour ne pas perdre les sauvegardes) ;
- compte : `shardwayacct.<uid>.<clé>` ;
- hors portée : `copytrack.<clé>` (`copytrack.account` avec les jetons, `copytrack.lang`…) et `sessionStorage` `copytrack.guest`.

**Clés principales** (dans la portée) [V] : `settings`, `profile` (pièces, objets, équipement, médailles, statistiques, favoris…), `rec3.<clé de classement>` (record : `{ time, splits, ghost, ghostVeh, inputs, pv, date, name, bt? }`), `runs.<clé>` (10 dernières courses), `tracks` / `tracksBad` (quarantaine) / `tracksDel` (pierres tombales), `recReset`, `ghostImp.<clé>`, `draft` (brouillon de l'éditeur), `prefabs`, `cdecos`, `modes`, `vproof` (preuve de vérification d'un circuit, propre à l'appareil), `online.session`, `online.player`, files de télémétrie et d'erreurs.

**Règles** [V]
- `profile()` est un **cache de module** (`profile.js:24`) : après un changement de portée ou une restauration, `reloadProfile()` est obligatoire.
- `saveRecord` (`storage.js:246`) : record valide seulement (`validRecord`), garde `bt` (meilleur temps toutes physiques confondues : c'est lui qui donne médailles et déblocages, `medalTime`), copie en mémoire (`memRec`) si l'écriture échoue, et en cas de stockage plein `makeRoom` compacte puis **retire fantômes et commandes des records les plus anciens** (le temps n'est jamais perdu). Un record sans commandes ne peut plus être revu ni envoyé au classement.
- Chaque écriture réussie appelle `writeHook` → synchronisation du compte (`account.js`, attente de 4 s).

**Comptes et synchronisation** [V]
- Pseudo + mot de passe (le pseudo devient une adresse `…@accounts.copytrack.invalid`, `account.js:18`) via Supabase Auth ; l'option « confirmer l'adresse » doit être désactivée côté Supabase.
- `_doSync` : lit `cloud_saves`, **fusionne** (`cloudsave.js`), réécrit localement, renvoie avec contrôle de révision (`rev`, jusqu'à 4 essais). Clés synchronisées : `profile`, `tracks`, `tracksDel`, `recReset`, `rec3.*`, `daily.*`, `ghostImp.*`, `runs.*` ; jamais les réglages, le brouillon, `vproof`, `online.*`. Au-delà de 6 Mo, la copie du cloud part sans fantômes.
- Fusion : record de `pv` plus récent, sinon le plus rapide ; circuits par identifiant et date ; profil : médailles au meilleur niveau, objets réunis, pièces jamais plus que l'un des deux côtés, équipement local.
- [V] La déconnexion (`online.useGuest`, `online.js:69`) efface la session anonyme de l'invité sur l'appareil ; [D] les circuits publiés et temps de cet invité restent liés à un identifiant anonyme qui ne sera plus jamais utilisé.

**Impact.** Ajouter une donnée de progression : la ranger dans `profile` ou sous une clé synchronisée **et** écrire sa règle de fusion dans `cloudsave.js` (sinon deux appareils s'écrasent). Toute nouvelle clé lourde pèse sur le quota (quelques Mo) et sur `makeRoom`.

---

## 4.8 Services en ligne et serveur (`js/config.js`, `js/online.js`, `js/online/community.js`, `js/app/community.js`, `js/app/competition.js`, `js/ui/leaderboardPanel.js`, `supabase/`)

**Trois façons d'appeler Supabase** [V] (`online.js`) :
- **REST sur les tables** (`/rest/v1/…`, avec une session : toute lecture crée au besoin un joueur anonyme) : `players`, `accounts`, `cloud_saves`, `tracks`, `scores`, `track_likes`, `follows`…
- **Fonctions SQL** (`/rest/v1/rpc/…`) : `get_ghost`, `trending_tracks`, `toggle_like`, `publish_track` (via la fonction serveur), saisons, duels, tournois, communauté 2 (`online/community.js`), `log_runs` / `log_errors` / `submit_feedback` (sans session, seulement avec l'accord du joueur).
- **Fonctions serveur** (Deno) : `submit-score` (scores et publication) et `ice` (serveurs STUN/TURN).

**Envoi d'un temps** [V] : `RaceSession._finish` → `App.onRaceFinished` (`main.js:288`) → `online.submitScore({ trackKey, code (circuits u- : le code du circuit d'origine), inputs, time, physVer })` → `supabase/functions/submit-score/handler.js` : taille, identité (jeton), limite de débit (en base, **refus si la base de limitation manque**), forme des champs, **`verifyRun`** (`js/verify.js` : circuit retrouvé par sa clé, course **rejouée**, temps comparé à 0,5 ms), fenêtre des duels et tournois, empreinte forte du circuit (`track_binds`, SHA-256 de `signatureText`), puis `submit_best` en base. Le serveur ne garde que **son** temps rejoué, ses temps intermédiaires et son fantôme.

**Publication d'un circuit** [V] : l'auteur termine la vérification dans l'éditeur (`onEditorTestFinished` → `track.setVerified(time)`, preuve rangée dans `vproof`) → `online.publish` envoie le code et la preuve → `verifyPublish` rejoue la preuve sur **ce** code et exige `vt` égal au temps rejoué (1 ms près) → `publish_track`.

**Couplage de versions** [V] : un seul `PHYS_VER` accepté à la fois par le serveur (égalité stricte). La fonction est un **fichier groupé** (`npm run build:function` → `supabase/functions/submit-score/index.ts`, empreinte de build en dernière ligne) qui doit être **redéployée à la main** après toute modification de la fermeture de `verify.js` (physique, circuits intégrés, générateur du défi, variantes, saisons, lecture des codes, signature). Le site (GitHub Pages) se met à jour seul : entre les deux déploiements, les temps sont refusés. `node tools/check-deployed.mjs` compare l'empreinte en ligne à celle du dépôt.

**Logique dupliquée entre le jeu et la base** [V] (toute modification doit être faite des deux côtés) : début des saisons (`seasons.js` / `etape11-saisons.sql`), forme des clés de duel (`etape12`), liste des variantes et des titres, domaine des adresses et règles des pseudos (`account.js` / `etape4-comptes.sql`), limites (taille des clés, des codes, des commandes, durée maximale d'une course : 600 s côté jeu, 3 600 s côté SQL).

**Observations**
- [V] `online.leaderboard` (`online.js:320`) demande d'abord la colonne `ghost_veh` ; les étapes SQL du dépôt n'accordent sa lecture ni à `anon` ni à `authenticated` (`etape5`, `etape7`, `etape9` : seulement `track_key, player, time, phys_ver, track_name, updated_at, has_ghost, splits`). [D] Les deux premières requêtes échouent alors et la troisième, sans `has_ghost` ni titre, est utilisée : boutons de fantôme et titres absents du classement mondial. **À confirmer sur la base de production** (`supabase/verify-prod.sql` vérifie que la colonne existe, pas qu'elle est lisible).
- [V] Le message « serveur d'une autre version » est reconnu par une expression régulière sur le texte français (`main.js:314`), pas par le drapeau `versionMismatch` renvoyé par le serveur.
- [V] Le commentaire de tête de `js/verify.js` (et donc `docs/MODULES.md`) dit que la fonction serveur « le charge depuis le site du jeu » : elle l'embarque en réalité (`tools/build-function.mjs`).

---

## 4.9 Éditeur de circuits (`js/editor.js`, `js/editor/*.js`, `js/inspector.js`, `js/inspector/*.js`, `js/editorTools.js`, `js/editorPick.js`, `js/app/editorFlow.js`)

**Cycle de vie** [V]
- Chargé à la demande : `App.openEditor(state)` (`app/editorFlow.js:13`) → `import('../editor.js')` → `_dispose()` → `new EditorSession(app, state)` (`editor.js:32`). Sans état : le brouillon (`getEditorDraft`).
- La session possède un `Track` (décodé depuis `state.code`), un `TrackView` (avec toutes les décorations), des maillages d'aide (aperçu, surbrillance, grille, emprise, sélection…), l'historique, l'`Inspector` (créé avant `_bind` pour que le gizmo reçoive les clics en premier). Elle **emprunte** `app.camera`. Familles : `editor/{tools,pointer,palette,selection,history,groups,prefabs,cdeco,logicUi,scriptsUi}.js`.
- `update(dt)` (`editor.js:172`) : cascade d'Échap, actions `ed.*`, caméra, puis `_render` qui appelle `view.rebuild()` **seulement si `needsRebuild`**.
- `dispose()` (`editor.js:280`) : retire ses écouteurs, enregistre le brouillon, libère l'inspecteur, la vue et les aides.

**Modifier le circuit** [V] : toujours par les méthodes de `Track` (`add` → `normalize` → `_insert`, `remove`, `conflicts`, `Track.placeable`, `track/edit.js` : `setSurface`, `toggleFlag`, `setMover`, `addDeco`…), qui incrémentent `version`. Puis **le point central** `_changed(rebuild = true)` (`editor/history.js:119`) : `needsRebuild` (le `TrackView` ne reconstruit que les tronçons dont la signature a changé), inspecteur, badge des problèmes (`continuityIssues` + `checkTrack`, mis en cache par `track.version`), brouillon enregistré 400 ms plus tard ; et `_commit()` (`:89`) qui empile un instantané.
Exception [V] : l'inspecteur, le gizmo et le déplacement vertical (Maj + souris) modifient les **décorations directement** (`d.x = v; track.version++`, `inspector/bodies.js`, `inspector/gizmo.js`, `editor/pointer.js`), sans le nettoyage d'`addDeco`.

**Annuler / rétablir** [V] (`history.js:52 _snapshot`) : une chaîne JSON par état (pièces en lignes `TILE_FIELDS`, décorations, noms de groupes, logique, tours, nom, description, décor, ambiance, scripts, règles), 200 au plus. Non capturés : l'auteur, les calques masqués / verrouillés, la caméra, l'outil, le presse-papiers. `_restore` garde `vt` / `vh` (revenir à un état vérifié le redonne vérifié).

**Essai, vérification, publication** [V]
1. `test(verify)` (`history.js:304`) → `app.testTrack(state, spawn, verify)` (`editorFlow.js:99`) : l'état de l'éditeur est mis de côté (`_editorKeep` : historique, presse-papiers, options, calques), le circuit est **re-décodé** depuis son code, `playTrack(track, { fromEditor, verify, spawn, trackKey: 'e-<hash du code>' })`.
2. Course : pas de fantômes, `Simulation({ partial: !!spawn })` (test depuis le curseur : sans checkpoints ni arrivée obligatoire), logique en mode « annonce ».
3. Vérification terminée → `onEditorTestFinished` (`editorFlow.js:110`) : `track.setVerified(time)` (`vt` au millième, `vh = signature()`), preuve rangée (`authorProof.saveProof`, 8 au plus, liée à `PHYS_VER`) → publier (`publishTrack`, puis `verifyPublish` côté serveur) ou revenir.
4. Retour : `quitRace` → `openEditor(this.editorState)` ; l'état mis de côté n'est restauré que si le premier instantané de la nouvelle session est **identique** au dernier de l'ancienne (`editor.js:133`).
- Ce qui invalide la vérification : tout ce qui entre dans `signatureText()` (voir `02-simulation.md` § 2.9) ; un changement de `PHYS_VER` invalide aussi la preuve.

**Partagé avec le serveur / propre à l'éditeur** [V] : `Track.normalize`, `range`, `cellsOf`, `conflicts`, `addDeco`, `signature`, `encode` / `decode`, `flagAllowed`, `surfaceAllowed`, `rollFits` sont **les mêmes** dans l'éditeur et sur le serveur (fermeture de `verify.js`). Propres à l'éditeur : `connect.js`, `continuity.js` (+ `pieceFacts.js` généré), `extend.js`, `orient.js`, `spill.js`, `families.js`, `tileInfo.js`, `editorTools.js`, `prefabs.js`, `logicText.js`, `editorPick.js`, `authorProof.js`, `customDecoBuild.js`. `joins.js` n'est plus importé que par des tests et outils.

**Entrées** [V] : actions réassignables `ed.*` (`input.js:18-42` : R pivoter, E/C niveau, Tab pièce suivante, P prolonger, T tester, F2 vérifier, F3 paramètres, F4 groupes, F6 logique…) lues dans `update` (ignorées si une fenêtre est ouverte) ; raccourcis Ctrl (Z, Y, S, C, X, V, A, D) par un écouteur `keydown` séparé (`editor/pointer.js:46-59`) qui [D] ne vérifie pas si une fenêtre est ouverte.

**Observations** (défauts constatés, non corrigés)
- [V] **La pose calcule les conflits sur la pièce brute**, avec les options armées, avant normalisation (`editor/tools.js:136`), puis supprime ces conflits (`:147`). Une option que la normalisation retire (par exemple « mur » sur une pièce qui ne le permet pas) agrandit la plage de niveaux réservée (`Track.range` : `t.o ? 2 : 0`) : [D] des pièces voisines au-dessus et au-dessous peuvent être supprimées alors que la pièce posée ne les touche pas (le message « Option ignorée » apparaît). L'aperçu fait le même calcul (`pointer.js:496`).
- [V] **Retour d'essai** : les coordonnées des décorations ne sont pas arrondies en mémoire, `encode()` les arrondit (2 décimales pour x, y, z, s ; 3 pour ry ; sonde : `10.123456 → 10.12`). [D] Dès qu'une décoration posée librement a des coordonnées non arrondies, la comparaison exacte échoue et l'historique d'annulation, le presse-papiers et les calques sont perdus après chaque essai.
- [V] « Prolonger » (`tools.js:169`) ajoute la pièce sans la règle « un seul départ » appliquée par la pose ordinaire (`:148`).
- [V] La réservation des bords de pente posée au mur (`spill.js`) n'est contrôlée que par la pose, l'aperçu, le collage, le déplacement de sélection et « Prolonger » ; pas par l'inspecteur, le gizmo, le changement d'option ou de type, le remplissage, la duplication, ni à la lecture d'un code.
- [D] `extend.js` (dit « pur ») ajoute puis retire des pièces du circuit pendant sa planification, sans `try/finally` dans `widthBridge`.
- [V] Chaque essai enregistre un record local sous `e-<hash du code>` (`race/finish.js:107-123`, aucune exclusion de `fromEditor`) ; ces records sont synchronisés avec le compte (`cloudsave.js:20` : `rec3.*`) et rien ne les purge. [D] Ils grossissent la sauvegarde et peuvent, stockage plein, faire retirer les fantômes et commandes des vrais records par `makeRoom`.

---

## 4.10 Rendu, scène et caméra (`js/trackMesh.js`, `js/trackGeometry.js`, `js/geo.js`, `js/scenery.js`, `js/scenery/*`, `js/decos.js`, `js/carModel.js`, `js/quality.js`, `js/renderOptions.js`, `js/race/camera.js`, `js/camrig.js`, `js/camflip.js`, effets)

**Qui possède quoi** [V]
- `App`, une fois pour toutes (`main.js:61-73`) : `WebGLRenderer` (antialias fixé à la création : en changer demande un rechargement), `Scene`, `PerspectiveCamera`, matières du circuit (`createTrackMaterials`, partagées par toutes les vues), `Scenery` (ciel, lumières, brouillard, terrain, décor, météo), `Particles` (400 instances), `QualityManager`.
- Chaque session ajoute ses objets et les retire dans `dispose()` : course (`TrackView` dans `scenery.trackGroup`, voiture, traces, fantômes, voitures distantes, traînée, `EnvFx`), éditeur (vue + aides ; un second contexte WebGL pour l'aperçu des pièces perso), garage.
- Le terrain et le décor restent dans la scène jusqu'au prochain `scenery.setTrack`.

**`TrackView`** [V] (`trackMesh.js`)
- Maillage **statique fusionné par tronçons** de 4 × 4 cases ; signature par tronçon = options de rendu + lignes `tileToRow` des pièces + pièces d'un anneau d'une case autour + décorations. `rebuild()` ne refait que les tronçons dont la signature a changé.
- **Toujours recréés** à chaque reconstruction : pièces mobiles, verre, obstacles, plaques, lampes, maillages par groupe (`tile.g`, `d.g`).
- Par image : `updateMoving(t)` (même `track.moverOffset` que la physique, avec `Math.cos` au lieu de `dcos` : visuel), `updateLights` (lumières réparties sur les lampes proches), `setBroken` (quand `phys.brokenVer` change), `setGroupVisible` (logique, calques).
- Géométrie : `trackGeometry.js` reprend les fonctions analytiques de la physique (`sampleLocal`, `arcParams`, `sbendPoint`, `roadHalf`, `ribbonOf` + `frameLocal`, coupe des tubes). Écarts assumés : polylignes (erreur de corde de quelques centimètres), eau décalée selon la normale au lieu de la verticale, **piliers et collines du terrain purement visuels** (la physique n'a pas de terrain : le sol est à y = 0).
- `geo.js : GeoBuilder` : triangles non indexés, couleurs par sommet, ombrage facetté.

**Décor** [V] (`scenery.js`) : 12 thèmes, ambiance (moment de la journée, brume, musique : `ambiance.js`), terrain et décor tirés d'une graine (pas de `Math.random`), fosses pour les pièces enterrées (`scenery/pits.js`), météo décorative estompée sous abri (`cover.js`). Les scripts de circuit peuvent changer le décor en pleine course.

**Caméra** [V] (`race/camera.js`)
- Modes : poursuite, proche, capot, lointaine, jusqu'à 6 caméras du joueur (`camprefs.js`) ; replays : TV, orbite ; Theater : libre, cinématique (`theater/cameras.js`).
- `_cameraTick` au **pas de la physique** (deux poses A et B), `_cameraRender` les interpole par `alpha` : la caméra est aussi déterministe que la voiture qu'elle suit (à ×4 en replay, jusqu'à 48 pas de caméra par image).
- Aides de poursuite `camrig.js` (lecture seule ; en l'air, jusqu'à 60 appels de `surfaceAt` par pas pour viser la réception) ; plafonds : 5 sondes `track.ceilingAt` le long de la perche ; inversion de gravité : `CamFlip` (roulis animé 0,45 s) ; animations réduites : secousses et effets de ressenti coupés.

**Qualité** [V] (`quality.js`) : profils Ultra → Ultra Potato, banc d'essai invisible au premier lancement (sur la démo du menu), **réduction automatique en course** sous 42 i/s pendant 5 s (jamais de remontée), `fpsCap` (Ultra Potato : une image sur deux). Ce qui reconstruit : décor masqué ou budget de lumières → `view.rebuild()` ; maillage du terrain → `scenery.setTrack` (lourd : terrain, décor, carte d'environnement, météo) ; daltonisme → à la course suivante ; antialias → rechargement.

**Effets** [V] : particules, traces, traînée, `envFx.js` (flaques, givre, pluie, rafales : visuel et sonore de `sim/env.js`). `Math.random` n'apparaît que dans le visuel (particules, météo, caméra TV, choix du circuit de démonstration), jamais dans le noyau.

**Observations** (défauts constatés, non corrigés)
- [V] **Verre brisé qui réapparaît** : `setGroupVisible` rend visibles tous les objets du groupe, dalles brisées comprises (`trackMesh.js:228-232`, `:159`) ; et une réduction automatique de qualité en course reconstruit la vue (`quality.js:254`), dalles visibles, sans réappliquer `setBroken` (`race.js:552` ne réagit qu'à un changement de `brokenVer`). La physique, elle, n'a plus de collision : [D] le joueur voit une dalle qu'il traverse.
- [V] **Solides inclinés** : l'inspecteur propose inclinaison et roulis à toute décoration non-obstacle, solides compris (`inspector/bodies.js:244-248`) ; le rendu les applique, la physique (`solids.js:73 solidEntry`) les ignore ; `addDeco` ne les retire qu'à l'ajout ou à la lecture d'un code : [D] dans l'éditeur, un solide incliné s'affiche incliné mais arrête la voiture comme s'il était droit, jusqu'au prochain essai.
- [D] La réduction automatique en course déclenche des reconstructions lourdes (terrain, décor) au moment même où les images manquent.
- [D] Profils Potato : les peintures nacrée, pailletée, givrée, bonbon deviennent presque noires (`quality.js:189-190` utilise l'émissif comme couleur ; intensité 0,12-0,3 dans `carModel.js:98-100`).
- [D] Le fantôme du record est dessiné environ un pas en avance sur la voiture du joueur (`race/ghosts.js:55` contre `race.js:546`).
- [V] Fuites mineures : `SpriteMaterial` des étiquettes de nom, `InstancedMesh` d'`EnvFx` et du terrain non libérés explicitement, matières d'origine gardées par `swapMaterials` (impact faible et borné).

---

## 4.11 Progression et contenus (`js/tracks.js`, `js/career.js`, `js/medals.js`, `js/profile.js`, `js/progression.js`, `js/rewards.js`, `js/app/rewards.js`, `js/daily.js`, `js/mutations.js`, `js/seasons.js`, `js/academy.js`, `js/skills.js`, `js/rules.js`, `js/app/modes.js`)

**Circuits intégrés** [V] : 72 définitions dans `tracks.js` (script « tortue » interprété par `track.js : scriptTrack`, obstacles posés le long de la ligne centrale, médailles, objectif bonus, réglage du pilote automatique), **triées en bas du fichier** (décor selon `CAREER_ORDER`, puis difficulté) : l'index d'un circuit n'est jamais sa position dans le texte. Ils sont tous construits au démarrage (`main.js:93`) avec leur clé `b-<id>-<hash(encode())>`.

**Médailles et déblocages** [V]
- `medalFor(time, medals)` (`medals.js`) ; cristal ≤ or ≤ argent ≤ bronze.
- Chapitres de 6 ; un chapitre s'ouvre avec 4 médailles dans le précédent (`career.js:107 chapterUnlocked`), l'Atelier bonus avec le premier.
- **Le verrou se calcule à partir des records locaux** : `trackDescriptor.js : chapterLock` → `getRecord(b.key)` → `medalTime(rec)` (le meilleur temps toutes physiques confondues, `bt`) → `medalFor`. `profile().medals[trackKey]` (meilleur niveau déjà payé) ne sert qu'aux pièces (`profile.js:83 rewardCoins`).
- Conséquence vérifiée : **la clé d'un circuit intégré dépend de tout son code** (nom, auteur, décor, script, obstacles, paramètres) et **aucune migration de clé n'existe** pour les circuits intégrés (il en existe une pour les circuits de joueur : `trackDescriptor.js:93`). Modifier un circuit intégré, même son nom, rend invisibles les records de ce circuit (médaille, fantôme, replay), peut **reverrouiller** un chapitre, et vide son classement en ligne (et ses duels ou tournois en cours).

**Récompenses** : pièces ◆ (`rewardCoins` : 120 / 60 / 30 / 15 selon la médaille, doublées pour une nouvelle médaille, réduites sur un circuit de joueur), objectif bonus (`career.js : completeGoal`), expérience et niveaux, licences, défis de maîtrise (`progression.js : awardRace`), titres, exclusifs du garage, collections (`rewards.js`, rassemblés par `app/rewards.js : checkRewards`), séries du défi du jour (`rewards.js : noteRace`). Tout est visuel ou monétaire : rien ne touche à la physique.

**Défi du jour** [V] (`daily.js:63 dailyChallenge`) : graine = date UTC ; jusqu'à 40 tentatives de génération par blocs de jetons, chacune validée par **deux courses du pilote automatique** (`botTime`, physique complète) qui fixent aussi les médailles ; mis en cache par jour. Coût : plusieurs simulations complètes au premier affichage du jour (navigateur) et au rejeu serveur. Mutation du jour et séries : `mutations.js`.

**Saisons** [V] (`seasons.js`) : semaines depuis le 9 novembre 2026 UTC, trois circuits de la carrière tirés du numéro, clé `b-…~v1.sea-N` acceptée par le serveur seulement pendant la semaine (+10 min). Points et divisions calculés en base (`etape11-saisons.sql`) : la date de départ y est **dupliquée**.

**Académie** (`academy.js` : six leçons ; `skills.js` + `analysis/drill.js` : exercices notés, mesurés en rejouant la course) et **modes** (`rules.js` : règles appliquées à une copie du circuit ; `trackKey: null`, donc ni record ni classement) : leurs arrivées sortent de `_finish` avant les records (`race/finish.js:72-80`).

**Impact.** Rééquilibrer des médailles : `tools/medals.mjs`, `tools/golden.mjs`, `tools/test-niveaux.mjs` (contrat des 72 circuits). Modifier un circuit intégré : voir ci-dessus, et l'empreinte de physique, le corpus de compatibilité, la fonction serveur. Changer l'ordre ou le contenu de `BUILTIN_TRACKS` change aussi les circuits des saisons.
