# Audit technique — Phase 1 (bêta 0.16.0, `PHYS_VER` 38, `NET_VER` 4)

Audit du code à la recherche de bugs, d'incohérences et de risques techniques. **Aucun fichier du jeu n'a été modifié** ; aucune correction, aucun commit.
Base de compréhension : [../comprendre/README.md](../comprendre/README.md).

## 1. Méthode

- **Par parcours d'exécution et par hypothèses testées**, pas par mots-clés : chaque soupçon a été confronté au code, puis, autant que possible, **démontré par une sonde** exécutée sur une copie du dépôt (Node pour le noyau, l'éditeur, la persistance, le réseau ; Chromium piloté par Playwright pour la course, l'interface et le rendu).
- Le noyau de simulation, la cohérence course en direct / rejeu serveur et la vérification des constats les plus graves ont été faits directement. Quatre domaines (éditeur ; persistance, en ligne et serveur ; multijoueur ; cycle de vie de la course, interface et rendu) ont été audités en parallèle par des sous-agents en lecture seule, avec des sondes reproductibles ; **leurs constats les plus graves ont été revérifiés à la main** (champ « Vérification » de chaque fiche).
- Les sondes ont été écrites dans un dossier temporaire de session (non conservé) ; chaque fiche décrit donc la reproduction en clair.
- Gravité : **CRITIQUE** (bloque une part importante du jeu, plantage, perte majeure), **ÉLEVÉ** (dégrade fortement une mécanique), **MOYEN** (bug réel mais limité ou contournable), **FAIBLE** (mineur). Certitude : **CONFIRMÉ** (démontré par le code ou une sonde), **TRÈS PROBABLE** (mécanisme clair, pas entièrement reproduit), **À VÉRIFIER**.
- Les constats déjà notés dans [../comprendre/05-interactions-et-zones-sensibles.md](../comprendre/05-interactions-et-zones-sensibles.md) § 5.6 sont repris ici sous un identifiant `TECH-…` (colonne « Ancien n° »). Un problème = une cause : ses différentes conséquences sont dans la même fiche.

## 2. Bilan chiffré

| Gravité | Nombre |
| --- | --- |
| CRITIQUE | 0 |
| ÉLEVÉ | 12 |
| MOYEN | 39 |
| FAIBLE | 38 |
| **Total** | **89** |

Aucun problème ne m'a paru mériter « CRITIQUE » : aucun plantage général, aucune perte définitive de données dans le cloud, aucun moyen de faire accepter un faux temps par le serveur. Les douze problèmes « ÉLEVÉ » bloquent ou ruinent une partie, une fonctionnalité ou une salle dans des conditions réalistes.

## 3. Liste de tous les problèmes

| ID | Titre | Gravité | Certitude | Système | Ancien n° |
| --- | --- | --- | --- | --- | --- |
| TECH-001 | Réapparition sur une plaque de transformation : le véhicule redevient voiture, boucle de réapparitions sans fin | ÉLEVÉ | CONFIRMÉ | Noyau | — |
| TECH-002 | Obstacle roulé de 180° : signe du roulis inversé à chaque lecture, clé et vérification instables | ÉLEVÉ | CONFIRMÉ | Modèle / éditeur / serveur | — |
| TECH-003 | Éditeur : la pose supprime des pièces que la nouvelle pièce ne touche pas | ÉLEVÉ | CONFIRMÉ | Éditeur | 2 |
| TECH-004 | Entrée sur un bouton de la pause (ou de l'arrivée, du replay) relance la course | ÉLEVÉ | CONFIRMÉ | Entrées / course | — |
| TECH-005 | Manette : bouton A tenu = « valider » dès qu'une superposition s'ouvre (pause impossible, course relancée à l'arrivée) | ÉLEVÉ | CONFIRMÉ | Entrées | — |
| TECH-006 | Capture de touche en attente qui survit à la navigation : touches réassignées à l'insu du joueur | ÉLEVÉ | CONFIRMÉ | Réglages / entrées | — |
| TECH-007 | Synchronisation du compte : sauvegarde fusionnée trop grosse → boucle sans fin, progression invisible, état « à jour » | ÉLEVÉ | CONFIRMÉ | Comptes | — |
| TECH-008 | Multijoueur : `Room.started` jamais remis à faux → invités du salon lancés en course à chaque choix de circuit | ÉLEVÉ | CONFIRMÉ | Multijoueur | 7 |
| TECH-009 | Multijoueur : un joueur arrivé (ou revenu) pendant une course n'apparaît jamais | ÉLEVÉ | CONFIRMÉ | Multijoueur | 7 |
| TECH-010 | Multijoueur : hôte absent ou qui recharge → manches bloquées, « Salle introuvable », salle définitivement fermée | ÉLEVÉ | CONFIRMÉ | Multijoueur | — |
| TECH-011 | Multijoueur : un départ de présence efface le joueur même s'il a encore une connexion | ÉLEVÉ | TRÈS PROBABLE | Multijoueur | — |
| TECH-012 | Multijoueur : fermeture du canal, erreur, jeton expiré ignorés → joueur isolé dans une salle morte | ÉLEVÉ | TRÈS PROBABLE | Multijoueur | — |
| TECH-013 | Vitesse de départ (`v0`) perdue au retour au point de départ | MOYEN | CONFIRMÉ | Noyau | — |
| TECH-014 | Multijoueur : règles de logique déclenchées par le temps jamais rejouées après un retour au checkpoint | MOYEN | CONFIRMÉ | Noyau / logique | — |
| TECH-015 | Reprise après erreur de la boucle : retour au checkpoint non enregistré, record non rejouable | MOYEN | CONFIRMÉ | Course | — |
| TECH-016 | Exception dans la construction d'une course : jeu figé (mode « course » sans session) | MOYEN | CONFIRMÉ | Application | — |
| TECH-017 | Commandes de course actives sous une fenêtre ouverte | MOYEN | CONFIRMÉ | Course / interface | — |
| TECH-018 | Résultat en ligne d'une course précédente affiché sur l'arrivée suivante | MOYEN | CONFIRMÉ | Course / en ligne | — |
| TECH-019 | Dalle de verre brisée de nouveau visible alors qu'elle n'a plus de collision | MOYEN | CONFIRMÉ | Rendu | 4 |
| TECH-020 | Boutons tactiles liés en dur à `KeyR`, `Escape`, `Enter` (et textes d'aide figés) | MOYEN | CONFIRMÉ | Entrées | 11 |
| TECH-021 | Classement mondial dégradé : colonne `ghost_veh` jamais autorisée en lecture | MOYEN | CONFIRMÉ (prod. à vérifier) | En ligne / SQL | 1 |
| TECH-022 | Records d'essai de l'éditeur (`e-…`) jamais purgés, synchronisés, qui saturent le stockage | MOYEN | CONFIRMÉ | Persistance | 6 |
| TECH-023 | Écriture faite pendant une synchronisation : jamais envoyée | MOYEN | CONFIRMÉ | Comptes | — |
| TECH-024 | « Garder ma progression » à l'inscription : échec silencieux, bibliothèques non copiées | MOYEN | CONFIRMÉ | Comptes | — |
| TECH-025 | Déconnexion : identité anonyme de l'invité abandonnée, ses données orphelines | MOYEN | CONFIRMÉ | Comptes / en ligne | 13 |
| TECH-026 | Deux onglets : jeton de renouvellement périmé → nouvelle identité d'invité, ou déconnexion du compte | MOYEN | CONFIRMÉ (invité) | En ligne | — |
| TECH-027 | Deux onglets : le cache du profil d'un onglet écrase la progression de l'autre | MOYEN | CONFIRMÉ | Persistance | — |
| TECH-028 | Objectifs bonus non fusionnés entre appareils (récompense payée deux fois, pas de convergence) | MOYEN | CONFIRMÉ | Comptes | — |
| TECH-029 | Fusion des pièces ◆ : des pièces gagnées sont perdues, des objets offerts sont déduits | MOYEN | CONFIRMÉ | Comptes | — |
| TECH-030 | Import d'un code joueur en « Fusionner » : écrase la progression locale, accepte des records invalides | MOYEN | CONFIRMÉ | Persistance | — |
| TECH-031 | Chaque lecture en ligne crée un joueur anonyme | MOYEN | CONFIRMÉ | En ligne | — |
| TECH-032 | Export des données (RGPD) : les temps échouent toujours, les « j'aime » manquent | MOYEN | CONFIRMÉ | En ligne | — |
| TECH-033 | Éditeur : raccourcis Ctrl actifs sous les fenêtres | MOYEN | CONFIRMÉ | Éditeur | — |
| TECH-034 | Éditeur : retour d'essai qui perd historique, presse-papiers, calques | MOYEN | CONFIRMÉ | Éditeur | 3 |
| TECH-035 | Éditeur : décorations modifiées sans normalisation (rétablir perdu, « modifié » à tort, solides inclinés) | MOYEN | CONFIRMÉ | Éditeur | 8 |
| TECH-036 | Éditeur : la gomme supprime des décorations de calques verrouillés ou masqués | MOYEN | CONFIRMÉ | Éditeur | — |
| TECH-037 | Éditeur : déplacer une pièce au gizmo change son demi-niveau | MOYEN | CONFIRMÉ | Éditeur | — |
| TECH-038 | Éditeur : un groupe utilisé seulement par la logique est considéré libre | MOYEN | CONFIRMÉ | Éditeur / logique | — |
| TECH-039 | Signature : collisions de clés entre circuits physiquement différents | MOYEN | CONFIRMÉ | Modèle / serveur | — |
| TECH-040 | Multijoueur : identité déclarée par le client (prise d'une place ou du rôle d'hôte) | MOYEN | CONFIRMÉ | Multijoueur | 7 |
| TECH-041 | Multijoueur : collisions douces jusqu'à 8 m/s par pas, cumulées | MOYEN | CONFIRMÉ | Multijoueur | 7 |
| TECH-042 | Multijoueur : temps d'arrivée (course libre) attribué au mauvais circuit | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-043 | Multijoueur : voitures distantes figées mais toujours collisionnables | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-044 | Multijoueur : connexion de signalisation fantôme après un délai dépassé | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-045 | Multijoueur : tout message de signalisation ouvre un lien (places épuisables) | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-046 | Multijoueur : une coupure de la signalisation coupe tous les liens de jeu sains | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-047 | Multijoueur : fin de manche manquée jamais signalée au joueur revenu | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-048 | Multijoueur : migration d'hôte après une fin de manche manquée → classements divergents | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-049 | Multijoueur : deux chargements de circuit concurrents, le dernier arrivé gagne | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-050 | Multijoueur : serveurs ICE / TURN demandés une seule fois par salle | MOYEN | À VÉRIFIER | Multijoueur | — |
| TECH-051 | Multijoueur : adresses IP des joueurs diffusées à tous les abonnés du canal | MOYEN | CONFIRMÉ | Multijoueur | — |
| TECH-052 | Éditeur : réservation des bords de pente au mur contournable | FAIBLE | CONFIRMÉ | Éditeur | — |
| TECH-053 | Éditeur : « Prolonger » peut poser plusieurs départs | FAIBLE | CONFIRMÉ | Éditeur | 9 |
| TECH-054 | Éditeur : calques gardés au chargement d'un autre circuit ; annuler garde la vérification courante | FAIBLE | CONFIRMÉ | Éditeur | — |
| TECH-055 | Éditeur : test depuis le curseur en gravité inversée sur un circuit `flip0` | FAIBLE | TRÈS PROBABLE | Éditeur | — |
| TECH-056 | Éditeur : la fenêtre « Circuit » arrondit la direction du vent (15° → 45°) | FAIBLE | CONFIRMÉ | Éditeur | — |
| TECH-057 | Éditeur : « Tout sélectionner » oublie les décorations hors des pièces | FAIBLE | CONFIRMÉ | Éditeur | — |
| TECH-058 | Éditeur : le collage garde les numéros de groupe | FAIBLE | CONFIRMÉ | Éditeur | — |
| TECH-059 | Éditeur : impossible de sortir si l'enregistrement automatique échoue | FAIBLE | CONFIRMÉ | Éditeur | — |
| TECH-060 | Lecture d'un code : décorations inconnues perdues sans blocage | FAIBLE | CONFIRMÉ | Modèle | — |
| TECH-061 | Miniature périmée dans la fiche d'un circuit | FAIBLE | CONFIRMÉ | Interface | — |
| TECH-062 | Éditeur : la vue par niveau montre les calques masqués | FAIBLE | CONFIRMÉ | Éditeur / rendu | — |
| TECH-063 | Garage : minuterie non annulée → voiture orpheline dans la scène suivante | FAIBLE | CONFIRMÉ | Garage | 12 |
| TECH-064 | Aides à la conduite : bouton « Fiche du circuit » absent à l'arrivée | FAIBLE | CONFIRMÉ | Interface | — |
| TECH-065 | Échap : panneau de l'accueil non restauré ; aucun effet dans le garage | FAIBLE | CONFIRMÉ | Interface | — |
| TECH-066 | Réponse du serveur après avoir quitté la course : panneau ouvert refermé, liste reconstruite | FAIBLE | CONFIRMÉ | Interface | — |
| TECH-067 | Démonstration du menu : vibrations du téléphone et de la manette | FAIBLE | CONFIRMÉ | Course | — |
| TECH-068 | Replay Theater : nom de caméra affiché faux | FAIBLE | CONFIRMÉ | Theater | — |
| TECH-069 | Replay Theater : déplacement dans le temps sans les scripts, effets de logique joués en rafale | FAIBLE | CONFIRMÉ | Theater | — |
| TECH-070 | Messages du HUD : verrou de priorité non remis à zéro au redémarrage | FAIBLE | CONFIRMÉ | HUD | — |
| TECH-071 | Anglais : texte français dans la ligne de récompense de l'arrivée | FAIBLE | CONFIRMÉ | Langues | — |
| TECH-072 | Message « hors piste » au moment de l'arrivée | FAIBLE | À VÉRIFIER | Course | — |
| TECH-073 | Réduction automatique de qualité pendant un replay ×4 ou une analyse | FAIBLE | À VÉRIFIER | Qualité | — |
| TECH-074 | Sauvegarde > 6 Mo : renvoyée à chaque synchronisation | FAIBLE | CONFIRMÉ | Comptes | — |
| TECH-075 | Restauration annoncée réussie même quand le stockage est plein | FAIBLE | CONFIRMÉ | Persistance | — |
| TECH-076 | Saisons : la base clôt à l'heure, le serveur accepte encore 10 minutes | FAIBLE | CONFIRMÉ | En ligne / SQL | — |
| TECH-077 | Valeurs de médaille abîmées dans le cloud → cristal | FAIBLE | CONFIRMÉ | Comptes | — |
| TECH-078 | Identifiant d'installation (statistiques) inclus dans le code joueur | FAIBLE | CONFIRMÉ | Persistance | — |
| TECH-079 | Serveur : dates de défi du jour inexistantes acceptées | FAIBLE | CONFIRMÉ | Serveur | — |
| TECH-080 | En ligne : erreurs réseau brutes, délai d'attente perdu, cache hors ligne qui grossit, page renvoyée à la place d'un fichier | FAIBLE | CONFIRMÉ | En ligne | — |
| TECH-081 | Clés de variantes liées une par une (squat possible avec une collision de signature) | FAIBLE | TRÈS PROBABLE | Serveur / SQL | — |
| TECH-082 | Multijoueur : salon public fantôme après un retrait pendant l'annonce | FAIBLE | CONFIRMÉ | Multijoueur | — |
| TECH-083 | Multijoueur : écouteurs du salon jamais retirés | FAIBLE | CONFIRMÉ | Multijoueur | 12 |
| TECH-084 | Multijoueur : arrivée en attente rejouée dans un nouveau championnat | FAIBLE | CONFIRMÉ | Multijoueur | — |
| TECH-085 | Multijoueur : classement général qui compte des joueurs n'ayant jamais couru | FAIBLE | CONFIRMÉ | Multijoueur | — |
| TECH-086 | Multijoueur : capacité de 8 qui ignore les places gardées | FAIBLE | CONFIRMÉ | Multijoueur | — |
| TECH-087 | Multijoueur : onglet masqué, tampons d'état qui grossissent sans fin | FAIBLE | CONFIRMÉ | Multijoueur | — |
| TECH-088 | Multijoueur : règle « voitures identiques » appliquée à la seule voiture locale | FAIBLE | CONFIRMÉ | Multijoueur | — |
| TECH-089 | Multijoueur : défauts mineurs (paquet de téléportation en double, grille invisible au décompte, progression à 0 %, départ sans décompte, aucun débit maximal des messages fiables) | FAIBLE | CONFIRMÉ | Multijoueur | — |

Le constat ancien n° 5 (modifier un circuit intégré efface la progression : clé changée, aucune migration) et le n° 10 (traducteur appliqué aux contenus des joueurs) relèvent de la conception et de la maintenance plus que d'un bug de code : ils sont traités au § 6.5 (risques de régression).

## 4. Fiches détaillées — gravité ÉLEVÉE

### TECH-001 — Réapparition sur une plaque de transformation : le véhicule redevient voiture, boucle de réapparitions sans fin
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi).
- **Localisation** `js/physics.js : place()` (remet `plateLock = ''`), `_setGround()` → `_transformPlate()` (bascule « même plaque = retour à la voiture ») ; `js/simulation.js : placeAtRespawn()` ; `js/raceLogic.js : update()` (point de retour d'un checkpoint) et `_ringRespawn()` (dernier sol relevé, `lastGround`).
- **Description** Quand le point de retour se trouve sur une plaque moto, bateau ou deltaplane, la voiture réapparaît avec le bon véhicule, puis le premier contact avec la plaque la **retransforme en voiture**.
- **Cause technique** `place()` réarme les plaques (`plateLock = ''`) ; `_setGround` (avec déclenchement) voit la plaque et appelle `_transformPlate`, qui bascule : `vehicle === PLATES[mod] ? 'car' : PLATES[mod]`. Le véhicule venant du point de retour, la bascule l'annule. Même effet si le point de retour est *avant* la plaque avec le véhicule d'*après* (checkpoint aérien : véhicule pris au moment de l'anneau, position du dernier sol).
- **Conditions** checkpoint (option `cp`) posé sur une plaque, ou checkpoint aérien franchi après une plaque (cas typique : plaque deltaplane puis anneaux en vol) ; un retour au checkpoint (touche R, hors-piste, noyade).
- **Conséquences** Le joueur repart en voiture là où le circuit exige un deltaplane, une moto ou un bateau : il tombe, réapparaît au même endroit en voiture… **boucle sans fin** ; seul « Recommencer » en sort. Identique au rejeu et au serveur (déterministe), donc pas d'incohérence de temps, mais blocage du joueur. Aucun circuit intégré n'est touché le long du trajet du pilote automatique (balayage des 5 circuits à plaques) ; les circuits de joueurs le sont.
- **Reproduction** Circuit `scriptTrack('g', 'start S2 S.e GC2 S3 finish')` ; gaz à fond jusqu'au checkpoint aérien ; `sim.rewind()` ; continuer gaz à fond 60 s : **43 réapparitions, jamais d'arrivée**, véhicule `car` à chaque fois. Checkpoint au sol sur plaque moto / deltaplane / bateau : après retour et 3 pas, véhicule `car`.
- **Piste** Au placement d'un point de retour, armer `plateLock` sur la plaque sous la voiture (ou mémoriser la plaque dans le point de retour) ; pour un checkpoint aérien, prendre le véhicule du moment de `lastGround`. Ajouter un scénario à l'empreinte de physique (changement voulu : `PHYS_VER`).

### TECH-002 — Obstacle roulé de 180° : signe du roulis inversé à chaque lecture, clé et vérification instables
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi), après l'audit délégué de l'éditeur.
- **Localisation** `js/track/edit.js : addDeco()`, bloc du roulis des obstacles (l. 147-151) ; `js/track.js : signatureText()` (`':z' + rz.toFixed(2)`).
- **Description** Un obstacle roulé de π (posé au plafond) voit son roulis passer de `3.142` à `-3.142`, puis l'inverse, à **chaque** lecture du code : la signature et la clé `u-…` alternent entre deux valeurs.
- **Cause technique** Normalisation non idempotente : la valeur est ramenée dans ]−π, π] (test `v > π + 1e-6`), arrondie à π/4, **puis** à 3 décimales : π devient `3.142`, qui est > π + 1e-6 et repasse à `-3.142` à la lecture suivante.
- **Conditions** Un obstacle « au plafond » : `orient.js : obstacleRollOn` renvoie π pour une route à l'envers, et l'inspecteur propose « Au plafond ». Aucun circuit intégré n'en contient.
- **Conséquences** Le circuit vérifié dans la course n'est plus vérifié au retour dans l'éditeur ; la publication échoue (« Circuit non vérifié ») ; **tout envoi de temps est refusé** (« Le code du circuit ne correspond pas », la clé calculée en course diffère de celle du code relu par le serveur) ; les records locaux se répartissent sur deux clés.
- **Reproduction** `addDeco({ k: 'spikes', …, rz: Math.PI })` puis `Track.decode(t.encode())` répété : `rz` = 3.142 / −3.142 / 3.142…, signature `p74uqk` / `sm24rr` en alternance.
- **Piste** Normaliser après l'arrondi, ou choisir une valeur canonique pour ±π ; ajouter un test « lire → écrire → lire » de la signature avec `rz = π` au corpus de compatibilité.

### TECH-003 — Éditeur : la pose supprime des pièces que la nouvelle pièce ne touche pas
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; sonde de l'audit délégué.
- **Localisation** `js/editor/tools.js : _act()` l. 134-147 (`this.track.conflicts(tile)` sur la pièce **brute**) ; même calcul dans l'aperçu (`editor/pointer.js`, ~l. 496).
- **Description** Les options armées (mur, anneau, checkpoint, mouvement…) restent armées quand on choisit une pièce qui les refuse ; les conflits sont calculés avec ces options, puis la pièce est posée sans elles. Toutes les pièces du volume « fantôme » sont supprimées.
- **Cause technique** `norm = Track.normalize(tile)` n'est utilisé que pour `placeable` et les débordements ; `Track.range` / `cellsOf` de la pièce brute réservent ±2 niveaux (mur), +1/+2 (portique, anneau), des cases voisines (glissière), une couronne d'une case (rotation).
- **Conditions** Une option armée incompatible avec la pièce choisie (le seul signe : la mention « Option ignorée »).
- **Conséquences** Disparition silencieuse de pièces au-dessus, au-dessous ou à côté (souvent hors de vue) ; annulable seulement si le joueur s'en aperçoit.
- **Reproduction** Option « mur gauche » armée, poser un départ en (0,0) niveau 0 : la ligne droite au niveau 2 est supprimée (plage brute [−2, 2], réelle [0, 1]). Glissière armée + looping : deux pièces voisines supprimées. Rotation armée + bifurcation : trois voisines, dont la diagonale.
- **Piste** Calculer les conflits (et le test « pièce identique ») sur la pièce normalisée ; désarmer ou signaler les options refusées par la pièce choisie.

### TECH-004 — Entrée sur un bouton de la pause (ou de l'arrivée, du replay) relance la course
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium de l'audit délégué ; mécanisme relu (moi : `input.js` n'ignore que les champs de saisie).
- **Localisation** `js/ui.js : showOverlay()` (~l. 149, met le focus sur `.btn.primary` avec un pointeur fin) ; liaison par défaut `restart` = Entrée ; `js/race.js : update()` l. 477 ; `js/input.js` (les `keydown` venant d'un bouton ne sont pas ignorés).
- **Description** Le bouton principal de la pause (« Reprendre ») a le focus ; Entrée l'active **et** est lue comme l'action « recommencer » à l'image suivante.
- **Cause technique** Un même appui sert à l'activation native du bouton et au jeu (`pressed`), sans arbitrage.
- **Conditions** Clavier ; pause puis Entrée ; aussi « Retour au checkpoint » + Entrée (retour puis recommencer) ; dans le Theater, Entrée sur « 🎬 Vidéo » annule l'export et relance le replay.
- **Conséquences** La course en cours est perdue (état `countdown`, chrono à zéro) au moment où le joueur voulait reprendre.
- **Reproduction** Course, P, Entrée : état `countdown`, pas de course 311 → 0.
- **Piste** Ignorer les touches dont la cible est un bouton, ou vider `pressed` lors de l'activation d'un bouton de superposition ; ne pas donner le focus automatiquement au bouton de la pause.

### TECH-005 — Manette : bouton A tenu = « valider » dès qu'une superposition s'ouvre
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium (manette simulée) de l'audit délégué.
- **Localisation** `js/main.js : frame()` l. 440-447 ; `js/input.js : pollGamepad()` et table `EDGE` ; `js/app/wiring.js : _padNav()`.
- **Description** A est une touche d'accélération par défaut (`[7, 0]`). Les fronts du mode « menu » ne sont suivis que pendant qu'une superposition est ouverte : leur état précédent est périmé (faux) au moment où elle s'ouvre, A tenu produit donc un front « valider » qui clique le bouton qui a le focus.
- **Conditions** Manette, accélération sur A, pause ou arrivée.
- **Conséquences** La pause est annulée aussitôt (impossible de mettre en pause en accélérant) ; à l'arrivée, la course est **relancée** et l'écran d'arrivée n'est jamais vu.
- **Reproduction** Manette simulée, A tenu : pause → état reste `racing` ; arrivée → `countdown`, pas 0. Sans A tenu : normal.
- **Piste** Suivre les fronts « menu » à chaque image, ou initialiser l'état précédent à l'ouverture ; ignorer « valider » tant que A n'a pas été relâché une fois.

### TECH-006 — Capture de touche en attente qui survit à la navigation : touches réassignées à l'insu du joueur
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium de l'audit délégué ; mécanisme relu (moi : `input.capture` n'est annulée que par Échap ou une touche).
- **Localisation** `js/app/settings.js : captureKey` (~l. 123), `js/input.js` (~l. 138) ; capture de manette `_capturePad` (8 s de scrutation).
- **Description** Cliquer sur une case de liaison démarre une capture ; quitter l'écran ne l'annule pas ; la première touche pressée ensuite, même en course, est **liée** à l'action et retirée de la sienne, puis enregistrée.
- **Conditions** Ouvrir Paramètres › Commandes, cliquer une case, revenir, lancer une course.
- **Conséquences** Première touche de la course avalée ; commandes corrompues **durablement** (exemple : W retiré d'« Accélérer » et lié à « Retour au checkpoint »).
- **Reproduction** Case « Retour au checkpoint », « ← Retour », course, tenir W : vitesse 0, `accelerate = ["", "ArrowUp"]`, `respawn = ["KeyW", ""]`, enregistré.
- **Piste** Annuler `input.capture` (et la scrutation de manette) à chaque changement d'écran, d'onglet, `_dispose`, `playTrack`.

### TECH-007 — Synchronisation du compte : sauvegarde fusionnée trop grosse → boucle sans fin, progression invisible
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `js/account.js:241` ignore le résultat de `restoreAll`) ; sonde de l'audit délégué (faux Supabase, quota simulé).
- **Localisation** `js/account.js : _doSync()` (~l. 236-262) ; `js/storage.js : restoreAll()` (atomique, renvoie `false` si le quota est dépassé) ; `js/profile.js : profile()` (réécrit le profil au rechargement).
- **Description** Si la sauvegarde fusionnée ne tient pas dans le stockage local, `restoreAll` échoue sans rien écrire ; le résultat est ignoré, `reloadProfile()` réécrit le profil, ce qui relance une synchronisation 4 s plus tard, qui échoue de même.
- **Conditions** Sauvegarde du cloud plus grosse que la place libre sur l'appareil (réunion de deux appareils, ou stockage déjà occupé par l'invité).
- **Conséquences** L'appareil n'affiche jamais la progression du compte ; l'état dit « à jour » ; la sauvegarde complète (jusqu'à 6 Mo) est **téléchargée toutes les ~4 s** tant que l'onglet est ouvert. Rien n'est perdu dans le cloud.
- **Reproduction** Cloud : 120 records et 777 ◆ ; appareil à quota de 600 Ko : connexion « ok », 0 ◆ et 0 record affichés, 4 lectures complètes en 13 s, aucune écriture, sans fin.
- **Piste** Tester le résultat de `restoreAll` et le signaler ; ne jamais relancer une synchronisation depuis `reloadProfile` ; écrire localement une version allégée (sans fantômes) si nécessaire.

### TECH-008 — Multijoueur : `Room.started` jamais remis à faux
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; scénarios multi-salles de l'audit délégué.
- **Localisation** `js/net/room.js` : champ `started` (l. 70), mis à vrai dans `_begin`, `startCup`, `_beginRound`, `_onCup` ; envoyé par `_sendTrack` (l. 375) ; appliqué par `_onMessage 'track'` (l. 315).
- **Description** Une fois une course lancée dans la salle, chaque message `track` porte `started: true` ; tout invité qui le reçoit dans le salon est lancé en course 1,5 s plus tard.
- **Conditions** L'hôte choisit un autre circuit, un lien se rouvre, un arrivant rejoint, après « Arrêter le championnat » ou une course unique terminée.
- **Conséquences** Les invités sont jetés dans une course libre à chaque fois que l'hôte parcourt la liste des circuits ; fenêtre du salon fermée, tableau effacé ; un arrivant est lancé alors que tout le monde est au salon.
- **Reproduction** Deux changements du menu de circuits par l'hôte → 3 départs pour un invité au salon ; un arrivant passe en `racing` alors que l'hôte est au salon.
- **Piste** Remettre `started` à faux au retour au salon et à la fin d'un championnat, ou le déduire de l'état réel de l'hôte ; ne jamais lancer sur un simple choix de circuit.

### TECH-009 — Multijoueur : un joueur arrivé (ou revenu) pendant une course n'apparaît jamais
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `js/race/net.js:10-25`) ; sonde de l'audit délégué.
- **Localisation** `js/race/net.js : _setupRemotes()`.
- **Description** Les voitures distantes sont créées une fois, d'après `room.list` au début de la session ; aucun écouteur pour les arrivées ; `_onSnap` ignore les paquets d'inconnus ; `_onLeft` supprime définitivement.
- **Conditions** Course libre (où rejoindre une course en cours est annoncé) ; joueur parti (au revoir ou > 20 s) puis revenu.
- **Conséquences** L'arrivant est invisible pour tous les joueurs déjà en course jusqu'à la fin ; en championnat, aucune collision avec lui.
- **Reproduction** 40 paquets d'un arrivant reçus, `remote.has(id)` faux ; même résultat pour un joueur revenu avec le même identifiant.
- **Piste** Créer la voiture distante à l'arrivée d'un membre ou à son premier paquet ; la recréer après un départ suivi d'un retour.

### TECH-010 — Multijoueur : hôte absent ou qui recharge → manches bloquées, salle introuvable, puis fermée
- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** scénarios de l'audit délégué (horloge simulée) ; mécanisme relu (moi : `hostId` = plus petit identifiant marqué hôte).
- **Localisation** `js/net/room.js : hostId` (~l. 237-242), `_expireAway` (~l. 192), `_drop` (~l. 199-209), `_onPeer` (~l. 251), `_open` (~l. 126).
- **Description** Pendant ses 20 s d'absence, l'hôte reste `hostId` : personne ne clôt ni ne lance de manche ; un arrivant obtient « Salle introuvable » (personne n'est marqué hôte dans la présence). L'hôte qui recharge et rejoint s'annonce non-hôte : « Salle introuvable » ; sa tentative remet à zéro son délai d'absence chez les autres (+20 s à chaque essai). Si l'invité de plus petit identifiant devient hôte par défaut, personne ne republie `host: true` : la salle n'accepte **plus jamais** d'arrivant.
- **Conditions** Coupure ou rechargement de la page de l'hôte.
- **Conséquences** Manches bloquées au moins 20 s, sans fin si l'hôte réessaie ; salle définitivement fermée aux nouveaux joueurs.
- **Reproduction** Hôte coupé : manche close 20 000 ms après ; hôte qui rejoint : `not-found`, manche close 30 000 ms après ; 25 s après, `a.isHost = true` mais `meta.host = false`, un nouveau joueur reçoit « Salle introuvable ».
- **Piste** Rendre le rôle d'hôte à celui qui revient avec un jeton de reprise valide ; ne pas remettre à zéro le délai d'absence sur un retour non relié ; appeler `_becomeHost` dès que `isHost` change ; laisser rejoindre une salle dont l'hôte est absent.

### TECH-011 — Multijoueur : un départ de présence efface le joueur même s'il a encore une connexion
- **Gravité** ÉLEVÉ · **Certitude** TRÈS PROBABLE (signalisation CONFIRMÉE ; bout en bout dépend de l'ordre des évènements de Supabase Realtime) · **Vérification** code relu (moi : `js/net/signaling.js:88`).
- **Localisation** `js/net/signaling.js : _onMessage`, branche `presence_diff`.
- **Description** Une entrée `leaves` supprime toute la clé du joueur, même si une autre connexion de cette clé reste présente (Phoenix suit chaque connexion par sa référence).
- **Conditions** Reconnexion avant que le serveur ait fermé l'ancienne connexion (cas normal après une courte coupure) ; onglet dupliqué (le `sessionStorage` est copié).
- **Conséquences** Les autres marquent le joueur absent, le retirent au bout de 20 s alors qu'il est connecté, et ne refont jamais le lien (`_onPeer` ne relie que les absents) : il est exclu de fait.
- **Reproduction** Évènements `join`, `meta`, `leave` pour une même clé : `peers.has(bob)` faux alors que la nouvelle connexion est active.
- **Piste** Suivre les entrées de présence une par une (référence Phoenix), comme le client officiel.

### TECH-012 — Multijoueur : fermeture du canal, erreur, jeton expiré ignorés
- **Gravité** ÉLEVÉ · **Certitude** TRÈS PROBABLE (client CONFIRMÉ ; comportement exact du serveur À VÉRIFIER) · **Vérification** code relu (moi : aucun traitement de `phx_close`, `phx_error`).
- **Localisation** `js/net/signaling.js : _onMessage` (~l. 80-94), connexion (~l. 47-77).
- **Description** Le client ignore `phx_close`, `phx_error` et les messages « system » (jeton expiré) ; il ne renouvelle jamais le jeton d'accès du canal (valable au moment de rejoindre) ; il ne contrôle pas les réponses aux battements de cœur.
- **Conséquences** Le joueur perd sa présence sans que `_lost` se déclenche : pas de reconnexion ; les autres le retirent et coupent les liens ; il reste seul dans une salle morte.
- **Reproduction** Sonde : aucun évènement `closed`, les battements continuent, aucun message `access_token` n'est jamais envoyé.
- **Piste** Traiter ces évènements et l'absence de réponse aux battements comme une fermeture ; renouveler le jeton.

## 5. Fiches détaillées — gravité MOYENNE

### TECH-013 — Vitesse de départ (`v0`) perdue au retour au point de départ
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi).
- **Localisation** `js/raceLogic.js : placeAtStart()` (applique `v0`) contre `js/simulation.js : placeAtRespawn()` (ne l'applique pas) ; point de retour initial posé par `RaceLogic.reset()`.
- **Description** Un retour au checkpoint avant le premier checkpoint ramène au départ avec le chrono à zéro, mais **à l'arrêt** au lieu de la vitesse de départ.
- **Conditions** Règle `v0 > 0` : mode « Lancée » (`BUILTIN_MODES`), catégories de record `v0-100` / `v0-200` (`variants.js`), circuits de joueurs ; aussi la grille d'un championnat.
- **Conséquences** Le retour est plus pénalisant que « Recommencer » ; si l'ouverture du circuit exige l'élan (saut), le joueur tombe et réapparaît sans fin à l'arrêt. Comportement identique au rejeu (pas d'incohérence de temps).
- **Reproduction** `v0 = 200` : vitesse 55,6 m/s au départ ; après 30 pas puis `sim.rewind()` : 0 m/s, chrono 0.
- **Piste** Appliquer la vitesse de départ quand le point de retour est le départ (ou mémoriser la vitesse dans le point de retour initial) ; changement de physique (`PHYS_VER`).

### TECH-014 — Multijoueur : règles de logique déclenchées par le temps jamais rejouées après un retour au checkpoint
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi).
- **Localisation** `js/raceLogic.js : rewind({ keepClock })` (restaure l'état de la logique, pas le chrono) ; `js/sim/logic.js : onStep` (`fire('time', on[1] === race.steps)`).
- **Description** En multijoueur, le chrono continue après un retour ; l'état de la logique revient à celui du checkpoint ; une règle « au temps T » déjà passée ne se redéclenche jamais.
- **Conditions** Multijoueur sur un circuit (de joueur) dont la logique utilise l'évènement « temps » ; retour à un point pris avant T.
- **Conséquences** Un groupe montré par la règle (un pont, une route) reste caché pour le reste de la course : course parfois impossible à finir.
- **Reproduction** Groupe caché au départ, règle « à 6 s : montrer » ; à 8 s, retour avec `keepClock` : 5 s plus tard (chrono 13 s) le groupe est toujours caché ; sans `keepClock` (solo), la règle se redéclenche.
- **Piste** En `keepClock`, rejouer les règles « temps » dont l'échéance est passée, ou ne pas restaurer leur état ; documenter dans le vérificateur de logique.

### TECH-015 — Reprise après erreur de la boucle : retour au checkpoint non enregistré
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `js/main.js:236` appelle `S.respawn()` sans `true`) ; sonde Chromium de l'audit délégué.
- **Localisation** `js/main.js : _loopError()`.
- **Description** À la première erreur d'une série, le jeu ramène la voiture au checkpoint sans poser le drapeau `respawn` dans l'enregistrement.
- **Conséquences** Si le joueur finit et bat son record, les commandes enregistrées rejouent **une autre course** : replay, Theater, coach, référence d'entraînement faux ; l'envoi au classement est refusé (le serveur ne retrouve pas le temps). Sonde : position live / rejeu identiques sans erreur et avec la touche R, écart de 106,6 m après une erreur injectée.
- **Piste** Appeler `respawn(true)` ; si l'erreur a eu lieu au milieu de `_stepOnce`, marquer la course comme non vérifiable.

### TECH-016 — Exception pendant la construction d'une course : jeu figé
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `main.js:205-210`) ; sonde Chromium de l'audit délégué.
- **Localisation** `js/main.js : playTrack()`, `js/app/theater.js : openTheater` : `_dispose()`, `mode = 'race'`, `setMode('race')` **avant** `new RaceSession(...)`, sans `try`.
- **Description** Si le constructeur lève une exception, l'application reste en mode « course » sans session : aucun écran, HUD visible, Échap et P sans effet ; objets à moitié construits laissés dans la scène.
- **Conditions** Exemple démontré : record dont les commandes ne sont pas du base64 valide (`decodeInputs` lève) — possible après l'import d'une sauvegarde ou des données du cloud, dont les chaînes de records ne sont pas validées — puis « Regarder mon record ».
- **Piste** Construire dans un `try`, libérer les objets partiels, revenir au menu avec un message ; valider les commandes avant de proposer « Regarder ».

### TECH-017 — Commandes de course actives sous une fenêtre ouverte
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium de l'audit délégué ; code relu (`race.js:467-481` ne teste pas `ui.modalOpen`).
- **Description** P, T, C, H agissent derrière une fenêtre : Pause › « Commandes » puis P relance la course sous la fenêtre ; Arrivée › 🏆 Classement puis T relance la course derrière ; bilans de l'Académie et des modes (session `finished`, sans superposition) aussi.
- **Piste** Ignorer les actions de course quand une fenêtre est ouverte ; en course, mettre en pause.

### TECH-018 — Résultat en ligne d'une course précédente affiché sur l'arrivée suivante
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : la garde `this.session !== session` de `main.js:288-318` ne voit pas un redémarrage de la même session) ; sonde de l'audit délégué.
- **Description** Envoi lent ; le joueur recommence et finit plus lentement : le second écran d'arrivée affiche « Classement mondial : 1er… meilleur temps du monde ! » du premier envoi (`el.className = …` retire aussi le `hidden` posé par `showFinish`).
- **Piste** Un jeton par arrivée (compteur incrémenté par `_finish` et `restart`) vérifié après chaque `await`.

### TECH-019 — Dalle de verre brisée de nouveau visible alors qu'elle n'a plus de collision
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; sonde Chromium de l'audit délégué (circuit intégré « Cristal Fêlé »).
- **Localisation** `js/trackMesh.js : setGroupVisible()` (l. 228-232, montre tout enfant du groupe), `rebuild()` (recrée les dalles visibles) ; `js/race.js:552` (ne réapplique `setBroken` que si `brokenVer` change) ; `js/quality.js:254` (reconstruction lors d'une baisse de qualité).
- **Conditions** (i) règle de logique qui montre / cache / bascule un groupe (`_logicSync` repasse sur tous les groupes) ; (ii) réduction automatique de qualité en course (presque chaque palier change le budget de lumières ou masque le décor).
- **Conséquences** Une dalle visible que la voiture traverse, jusqu'au prochain retour ou redémarrage.
- **Piste** Réappliquer l'état brisé à la fin de `rebuild()` ; ignorer les dalles brisées dans `setGroupVisible`.

### TECH-020 — Boutons tactiles liés en dur à `KeyR`, `Escape`, `Enter`
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `wiring.js:289-291`) ; sonde de l'audit délégué.
- **Description** Les boutons tactiles injectent des codes de touche ; si le joueur réassigne ces actions, le bouton fait autre chose (sonde : retour lié à Q, caméra à R → « ⟲ » change de caméra au lieu de réapparaître). Textes d'aide figés sur les touches par défaut (`<kbd>R</kbd>`, « Rejouer Entrée », `MSG.stuck`, fin de replay).
- **Piste** Déclencher les actions directement (file d'actions) ; produire les textes avec `keyLabel(bindings)`.

### TECH-021 — Classement mondial dégradé : colonne `ghost_veh` jamais autorisée en lecture
- **Gravité** MOYEN · **Certitude** CONFIRMÉ dans le code et les étapes SQL du dépôt ; état de la base de production À VÉRIFIER · **Vérification** moi (toutes les autorisations sur `scores` relues).
- **Localisation** `js/online.js : leaderboard()` l. 320 ; `supabase/etape5-securite.sql:14-15` (révoque la lecture de la table, accorde une liste de colonnes), `etape7-fantomes.sql:20` (`has_ghost`), `etape9-secteurs.sql:15` (`splits`).
- **Description** Les deux premières requêtes demandent `ghost_veh`, jamais accordée : refus de PostgreSQL ; la troisième, sans `has_ghost` ni titre, est utilisée. Toute autre erreur passagère de la première est aussi avalée.
- **Conséquences** Pas de bouton 👻, pas de titres, colonne véhicule vide dans le classement mondial ; deux requêtes perdues à chaque affichage ; appliquer d'autres étapes plus tard n'y changera rien.
- **Piste** Accorder `select (ghost_veh)` ou ajouter un repli sans cette colonne ; faire contrôler par `verify-prod.sql` la **lisibilité** (`has_column_privilege`), pas seulement l'existence.

### TECH-022 — Records d'essai de l'éditeur (`e-…`) jamais purgés, synchronisés, qui saturent le stockage
- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; mesures de l'audit délégué.
- **Localisation** `js/app/editorFlow.js:102` → `js/race/finish.js : _finish()` l. 107-123 → `storage.saveRecord` ; `js/cloudsave.js:20` (`rec3.*` synchronisés).
- **Description** Chaque essai terminé (hors test depuis le curseur) écrit un record complet sous une clé nouvelle à chaque modification du circuit : 21 à 43 Ko (≈ 27 Ko en moyenne) ; ≈ 190 essais remplissent 5 Mo.
- **Conséquences** Stockage plein : les **nouveaux vrais records** sont écrits sans fantôme ni commandes (pas de replay, plus de bouton « Envoyer mon record ») ; quand `makeRoom` agit, il dépouille d'abord les plus anciens, souvent les vrais records ; la sauvegarde cloud grossit vers la limite de 6 Mo (TECH-074).
- **Piste** Ne pas enregistrer les essais (ou seulement le dernier), les exclure de la synchronisation, les purger au démarrage ; faire libérer d'abord les clés non classées.

### TECH-023 — Écriture faite pendant une synchronisation : jamais envoyée
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `js/account.js : sync()` (~l. 370-379).
- **Description** La minuterie d'une écriture faite pendant une synchronisation rappelle `sync()`, qui renvoie la promesse en cours ; à sa fin, `_dirty` repasse à faux.
- **Conséquences** La modification n'atteint le cloud qu'à la prochaine écriture ou au prochain lancement ; l'autre appareil ne la voit pas d'ici là (sonde : +1 000 ◆ jamais envoyés).
- **Piste** Compteur de génération : relancer après la synchronisation en cours si une écriture a eu lieu.

### TECH-024 — « Garder ma progression » à l'inscription : échec silencieux, bibliothèques non copiées
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `account.js:150` ignore le résultat de `restoreAll` ; sonde de l'audit délégué) .
- **Description** La copie double l'occupation du stockage ; si elle ne tient pas, rien n'est copié et rien n'est dit (sonde : 1 234 ◆ et 24 records → compte à 0). Même réussie, la copie omet `vproof` (preuves de vérification), le brouillon, les prefabs, les pièces perso et les modes (clés non synchronisées).
- **Piste** Tester le résultat, migrer au lieu de copier, signaler l'échec ; copier aussi les bibliothèques.

### TECH-025 — Déconnexion : identité anonyme de l'invité abandonnée
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `online.js:69-75 useGuest` efface la session ; sonde de l'audit délégué).
- **Description** L'inscription crée un nouvel utilisateur au lieu de convertir l'anonyme ; la déconnexion efface la session anonyme. Les temps, circuits publiés, « j'aime » de l'invité restent sous un identifiant inutilisable ; deux lignes du même nom dans les classements ; republier son propre circuit depuis le compte : « déjà publié par un autre pilote » ; chaque cycle crée un anonyme de plus.
- **Piste** Convertir l'utilisateur anonyme (adresse et mot de passe sur la session anonyme) ; ne pas effacer la session de l'invité.

### TECH-026 — Deux onglets : jeton de renouvellement périmé
- **Gravité** MOYEN · **Certitude** CONFIRMÉ pour l'invité (sonde, jetons à usage unique simulés), TRÈS PROBABLE pour le compte · **Localisation** `js/online.js : ensureSession()` (~l. 122-158 ; la session n'est lue qu'à la construction).
- **Description** L'onglet 1 renouvelle et enregistre ; l'onglet 2 renouvelle ensuite avec son jeton déjà utilisé. Invité : refus → nouvelle inscription anonyme, qui écrase la session de l'onglet 1 (identité perdue, comme TECH-025). Compte : session expirée, et avec la détection de réutilisation de Supabase, toute la famille de jetons révoquée : reconnexion forcée.
- **Piste** Relire la session enregistrée avant de renouveler ; écouter les évènements `storage`.

### TECH-027 — Deux onglets : le cache du profil d'un onglet écrase la progression de l'autre
- **Gravité** MOYEN (invité), FAIBLE (compte) · **Certitude** CONFIRMÉ (sonde) · **Localisation** `js/profile.js:23-45` ; aucun écouteur `storage` dans `js/`.
- **Description** Onglet 1 : achat d'un objet et médaille cristal ; onglet 2 (cache périmé) finit une course : l'objet disparaît (remboursé), la médaille est perdue. Pour un compte, la fusion du cloud ne répare que si l'onglet 1 a déjà synchronisé.
- **Piste** Recharger le cache sur l'évènement `storage`, ou fusionner avant d'écrire.

### TECH-028 — Objectifs bonus non fusionnés entre appareils
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `profile.goals` absent de `cloudsave.js : mergeProfile`, la version locale l'emporte par `...b, ...a`).
- **Conséquences** Un objectif atteint sur l'autre appareil peut être refait : `GOAL_COINS` et l'expérience payés deux fois ; les appareils ne convergent jamais ; `title` et `xpDay` non plus, d'où une écriture à chaque synchronisation.
- **Piste** Réunir les objectifs (et fusionner `title`, `xpDay` explicitement).

### TECH-029 — Fusion des pièces ◆ : pièces gagnées perdues, objets offerts déduits
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `js/cloudsave.js : mergeCoins` (l. 73-77).
- **Description** Règle « le plus grand des deux moins ce que chaque côté n'avait pas » : 100 → +50 sur chaque appareil donne 150, pas 200 ; un objet offert (clin d'œil caché, valeur 250) est déduit comme s'il avait été acheté. Aucune création de pièces trouvée.
- **Piste** Compter gains et dépenses par appareil (modèle additif), marquer les objets offerts.

### TECH-030 — Import d'un code joueur en « Fusionner » : écrase la progression locale, accepte des records invalides
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `js/profile.js : applySave()`, branche « merge » (~l. 212-248) ; bouton principal `js/app/profile.js:275`.
- **Description** Le profil devient celui importé (expérience, objectifs, Académie, licences, statistiques, identifiant locaux perdus ; médailles rétrogradées) ; records remplacés dès que le temps importé est plus petit, sans regarder `pv` (un record fabriqué de 0,001 s remplace un vrai 30 s) ; brouillon et bibliothèques écrasés. Définitif pour un invité.
- **Piste** Réutiliser `mergeSaves` / `mergeProfile` ; refuser un record qui échoue à `validRecord` ou dont `pv` diffère.

### TECH-031 — Chaque lecture en ligne crée un joueur anonyme
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code) ; limite exacte À VÉRIFIER · **Localisation** `js/online.js : _fetchRaw` (~l. 104-107, authentification par défaut) → `ensureSession` → inscription anonyme.
- **Conséquences** Regarder un classement ou la communauté crée un utilisateur ; la limite d'inscriptions anonymes de Supabase (par adresse IP) peut refuser les classements derrière une adresse partagée (école).
- **Piste** Faire les lectures publiques avec la clé publique, sans session.

### TECH-032 — Export des données (RGPD) incomplet
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code et règles de droits PostgreSQL) · **Localisation** `js/dataExport.js : EXPORT_TABLES`.
- **Description** `scores?select=*` exige la lecture de toutes les colonnes (`inputs`, `ghost`, `ghost_veh` non accordées) : la table des temps du joueur est **toujours** en erreur ; `track_likes` est omise ; seule la portée courante est exportée (ni l'invité, ni l'ancien anonyme).
- **Piste** Lister les colonnes accordées, ou fournir une fonction d'export côté serveur.

### TECH-033 — Éditeur : raccourcis Ctrl actifs sous les fenêtres
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde Chromium de l'audit délégué) · **Localisation** `js/editor/pointer.js : _h.key` (l. 46-59) : ignore les champs de saisie, pas `ui.modalOpen` ; `update()` bloque les autres touches, cet écouteur non.
- **Description** Fenêtre « Circuit » ouverte, Ctrl+Z deux fois : 6 → 4 pièces derrière la fenêtre ; Ctrl+A crée une sélection ; Ctrl+X, D, V agissent aussi. La fenêtre applique ensuite ses valeurs périmées et son `_commit` tronque la pile « rétablir » : les pièces annulées sont perdues.
- **Piste** Ignorer les raccourcis de l'éditeur quand une fenêtre est ouverte.

### TECH-034 — Éditeur : retour d'essai qui perd historique, presse-papiers, calques
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde Node par moi ; sondes Node et Chromium de l'audit délégué) · **Localisation** `js/editor.js:133` (`keep.history[keep.hIndex] === this.history[0]`) et l'arrondi de `Track.encode` (x, y, z, s au centième ; ry au millième).
- **Description** L'accrochage par défaut des décorations est « Libre » ; rotations (pas de π/12), échelles (×1,1), déplacements au gizmo ou vertical ne sont jamais arrondis en mémoire ; l'instantané relu depuis le code diffère, l'état mis de côté est jeté.
- **Conséquences** Après chaque essai : historique d'annulation, presse-papiers, options armées, réglages de décoration et **calques masqués / verrouillés** perdus (un calque verrouillé redevient modifiable). Effet secondaire : l'outil « pièce perso » revient sans ses formes, chaque clic affiche à tort « Maximum de 500 décorations atteint ». Chromium : sans décoration, historique 2 → 2 et calque masqué gardé ; avec un cône libre, 3 → 1 et calque perdu.
- **Piste** Comparer une forme canonique (instantané relu), ou arrondir les décorations à l'écriture comme le code.

### TECH-035 — Éditeur : décorations modifiées sans normalisation
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sondes de l'audit délégué ; mécanisme relu par moi : `inspector/bodies.js:244-248`, `solids.js:73`) · **Localisation** écritures directes dans `inspector/bodies.js : _decoBody`, `inspector/gizmo.js : _onGizmo`, `editor/pointer.js : _shiftY` ; normalisation dans `track/edit.js : addDeco`, rejouée par `editor/history.js : _restore`.
- **Description** L'instantané garde les valeurs brutes, la restauration les normalise : après annuler / rétablir, le circuit n'égale plus l'instantané courant ; le premier clic qui suit empile un pas fantôme et **efface la pile « rétablir »** ; un circuit enregistré paraît « modifié ». Les solides reçoivent inclinaison, roulis, « Retourner » et le gizmo trois axes : affichés inclinés dans l'éditeur, ils redeviennent droits au premier essai, enregistrement ou annulation (la physique et la course les voient droits).
- **Piste** Une seule fonction de normalisation (idempotente) pour toutes les écritures de décorations ; masquer inclinaison et roulis pour les solides.

### TECH-036 — Éditeur : la gomme supprime des décorations de calques verrouillés ou masqués
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `editor/tools.js : _erase` (l. 426-428) → `editor/pointer.js : _nearestDeco` (pas de filtre `_layerOk`, contrairement au rayon).
- **Description** Une décoration verrouillée à 2-3 m du curseur est effacée par la gomme ; une décoration invisible (calque masqué) par un clic droit avec l'outil décoration.
- **Piste** Filtrer `_nearestDeco` par calque (et la pipette, par cohérence).

### TECH-037 — Éditeur : déplacer une pièce au gizmo change son demi-niveau
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `inspector/gizmo.js : _onGizmo` l. 79 (niveau arrondi à l'entier).
- **Description** Une pièce au niveau 0,5 (après une pente douce) glissée d'une case passe au niveau 1 ; la flèche verticale ne sait pas atteindre les demi-niveaux. La continuité de la route est cassée sans message.
- **Piste** Garder le niveau tant que l'axe vertical n'est pas tiré ; arrondir au demi-niveau.

### TECH-038 — Éditeur : un groupe utilisé seulement par la logique est considéré libre
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `editor/groups.js : openGroups` (l. 74) et `logicText.js : scriptsToLogic` : ignorent `lg.off` et les groupes cités par les règles.
- **Description** Logique « groupe 1 caché au départ » dont le groupe a été vidé : « Nouveau groupe » redonne le numéro 1 ; la conversion des déclencheurs range une route dans ce groupe : elle est cachée au départ, sans collision. Le vérificateur ne prévient plus dès que le groupe a des membres.
- **Piste** Compter comme utilisés les groupes cités par la logique.

### TECH-039 — Signature : collisions de clés entre circuits physiquement différents
- **Gravité** MOYEN (intégrité des classements ; demande un code fabriqué) · **Certitude** CONFIRMÉ (sonde de l'audit délégué ; `test-integrite.mjs` documente déjà l'arrondi des obstacles) · **Localisation** `js/track.js : signatureText()` et `_logicSig()`.
- **Description** Obstacles et solides hachés à 0,1 m et 0,01 rad alors que le code garde 0,01 m et 0,001 rad, et que la physique utilise ces valeurs : une poutre (échelle 8) décalée de 4 cm et tournée de 0,004 rad a la même clé (son extrémité bouge de ≈ 0,26 m). L'appartenance aux groupes est indexée par `x:z:l` : un anneau et la route sur laquelle il est posé ne se distinguent pas ; déplacer le groupe de l'un à l'autre change la physique, pas la signature.
- **Conséquences** Un circuit variante peut publier ses temps dans le classement de l'original (la liaison forte du serveur porte sur `signatureText`) et hériter de sa marque « vérifié ».
- **Piste** Hacher à la précision du code ; inclure le type de pièce dans la clé d'appartenance (changement de clé : migration ou acceptation de la perte des classements concernés).

### TECH-040 — Multijoueur : identité déclarée par le client
- **Gravité** MOYEN (sécurité, nécessite un client modifié et le code de la salle ; les salles publiques sont listées) · **Certitude** CONFIRMÉ (code relu par moi : `room.js:302` stocke le jeton sans le comparer ; sonde de l'audit délégué).
- **Localisation** `js/net/room.js` (`hello`, `hostId`, `_onPeer` qui prend `host` de la présence) ; `js/net/signaling.js:90-93` (`from` déclaré).
- **Description** On peut reprendre la place d'un joueur coupé (pendant ses 20 s) et faire compter ses arrivées ; ou prendre le rôle d'hôte en annonçant `host: true` avec le plus petit identifiant : les autres acceptent alors ses `rend`, `cupstop`, `start`… ; le vrai joueur qui revient ne retrouve plus sa place.
- **Piste** Jeton de reprise secret, vérifié avant de rendre une place, jamais diffusé ; autorité d'hôte fondée sur l'ordre d'arrivée ou une passation explicite ; `from` lié à la présence côté serveur.

### TECH-041 — Multijoueur : collisions douces jusqu'à 8 m/s par pas, cumulées
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `collide.js:44` ; mesures de l'audit délégué) · **Localisation** `js/net/collide.js` (l. 44-46) ; `js/race/net.js : _collide`.
- **Description** Seule la poussée de pénétration est plafonnée (0,32 m/s par pas, ≈ 4 g, ce que dit `supabase/MULTI.md`) ; le terme de vitesse d'approche ajoute jusqu'à 8 m/s **par pas** (≈ 100 g), additionné pour chaque voiture en contact (jusqu'à 7 × 8,32 m/s). Chaque côté applique « sa moitié » contre la vitesse **d'avant** le choc de l'autre : l'échange est environ doublé (face-à-face à 2 × 50 m/s : rebond à ± 41 m/s au lieu de ± 17,5 prévus). Des paquets fabriqués qui suivent une voiture lui donnent des centaines de m/s.
- **Piste** Plafond global par pas, terme d'approche borné, vitesse de l'autre prise en compte, vitesses distantes aberrantes rejetées ; corriger `MULTI.md`.

### TECH-042 — Multijoueur : temps d'arrivée (course libre) attribué au mauvais circuit
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `room.js` (`finish`, `reportFinish`, `_begin`), `app/multi.js : _startMultiRace` (l. 400-408).
- **Description** Le message `finish` ne porte ni circuit ni numéro de lancement : une arrivée en vol pendant un changement de circuit, ou faite pendant le chargement du suivant (l'ancienne session tourne encore), est créditée au nouveau circuit ; les tableaux divergent d'un joueur à l'autre ; un arrivant perd les meilleurs temps déjà synchronisés quand le message `track` arrive après eux.
- **Piste** Numéro de lancement dans `start`, `track`, `finish` ; ignorer les messages d'un autre lancement.

### TECH-043 — Multijoueur : voitures distantes figées mais toujours collisionnables
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `net/interp.js` (l. 170-174 : reste « prêt » sans paquets), `remoteCar.update`, `race/net.js : _collide`, `presentState`.
- **Description** Sans paquets, la voiture reste affichée (plus 0,25 s d'extrapolation) avec sa dernière vitesse, et reste dans les collisions ; le disque de collision est en plus avancé de vitesse × (0,1 s + rtt/2). Pendant 20 s (absent), indéfiniment si le lien est mort mais la présence reste ; en course libre, les joueurs revenus au salon restent sur la piste.
- **Conséquences** Un mur invisible à quelques mètres devant une voiture qu'on traverse.
- **Piste** Masquer et exclure des collisions une voiture sans paquet depuis ≈ 0,5 s, au lien non ouvert ou à la présence `racing: false`.

### TECH-044 — Multijoueur : connexion de signalisation fantôme après un délai dépassé
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `net/signaling.js:50` (délai sans fermeture), `room.js : _retry` (l. 166-168, pas de `leave()`), même chose pour l'observation de l'annuaire.
- **Description** Une réponse tardive fait quand même rejoindre la connexion abandonnée : elle publie une présence et bat pour toute la durée de l'onglet (présences fantômes, « hôte » fantôme pour les arrivants, minuteries actives).
- **Piste** Fermer la connexion à chaque échec ; `leave()` sur les tentatives ratées.

### TECH-045 — Multijoueur : tout message de signalisation ouvre un lien
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `net/transport.js : _onSignal` (~l. 294), `addPeer` (~l. 226-233).
- **Description** Un message avec un `from` inventé crée un lien WebRTC (jusqu'à `MAX_LINKS = 7`), jamais nettoyé pour un non-membre : sept messages suffisent pour empêcher les vrais joueurs de se connecter ; sans malveillance, un candidat ICE tardif d'un joueur parti recrée son lien et occupe une place.
- **Piste** N'accepter la signalisation que des membres présents ; nettoyer les liens orphelins.

### TECH-046 — Multijoueur : une coupure de la signalisation coupe tous les liens de jeu sains
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code) · **Localisation** `room.js : _lost` (~l. 151) → `_markAway` → `mesh.removePeer` (~l. 189).
- **Description** Une coupure de la WebSocket (Realtime) ferme aussi les liens WebRTC, qui marchaient : toutes les voitures se figent ; les arrivées en course libre envoyées pendant la coupure sont perdues (seul le meilleur temps est renvoyé).
- **Piste** Garder les liens WebRTC ouverts pendant la reconnexion de la signalisation.

### TECH-047 — Multijoueur : fin de manche manquée jamais signalée au joueur revenu
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `room.js : _onCup` (~l. 539-546).
- **Description** Un joueur qui revient après la clôture reçoit les résultats dans l'état mais aucun évènement `cupround` : pas d'écran de résultats, course jamais arrêtée (`cupRoundOver`), il est jeté dans la manche suivante.
- **Piste** Émettre `cupround` quand l'état reçu fait avancer la phase.

### TECH-048 — Multijoueur : migration d'hôte après une fin de manche manquée → classements divergents
- **Gravité** MOYEN (rare) · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `room.js : _cupTick`, `_hostEndRound` (~l. 582-615).
- **Description** Le nouvel hôte reclôt la manche avec ses arrivées incomplètes ; les autres ignorent ce second `rend`, les arrivants copient la version du nouvel hôte : deux classements différents durablement.
- **Piste** Résultats versionnés par championnat et manche ; à la migration, reprendre l'état le plus complet.

### TECH-049 — Multijoueur : deux chargements de circuit concurrents, le dernier arrivé gagne
- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `app/multi.js : _startMultiRace` (l. 400-408).
- **Description** Un circuit de la communauté lent à télécharger, lancé juste avant un circuit intégré, remplace ce dernier à la fin de son téléchargement : l'invité court le mauvais circuit et est crédité sur l'autre tableau.
- **Piste** Ignorer un chargement qui n'est plus la dernière demande.

### TECH-050 — Multijoueur : serveurs ICE / TURN demandés une seule fois par salle
- **Gravité** MOYEN (dès que le relais TURN sert) · **Certitude** CONFIRMÉ dans le code, impact À VÉRIFIER · **Localisation** `room.js : _open` (~l. 108-114).
- **Description** Les identifiants TURN (durée limitée, 1 h par défaut) sont obtenus à l'ouverture de la salle ; les liens créés plus tard (arrivants, reconnexions) utilisent des identifiants expirés ; les réseaux qui exigent le relais ne se connectent plus après une heure.
- **Piste** Redemander les serveurs ICE à chaque `addPeer` ou `_retry` quand leur durée est presque écoulée.

### TECH-051 — Multijoueur : adresses IP des joueurs diffusées à tous les abonnés du canal
- **Gravité** MOYEN (vie privée) · **Certitude** CONFIRMÉ (code) · **Localisation** `net/signaling.js:90-92, 108-110` ; `net/transport.js:247, 287`.
- **Description** Offres SDP et candidats ICE sont diffusés à tous les abonnés du canal de la salle ; le filtrage par destinataire est fait par le client. Un observateur silencieux d'une salle publique recueille les adresses IP de tous les joueurs.
- **Piste** Canaux privés ou relais côté serveur ; à défaut, le mentionner dans la page Confidentialité.

## 6. Fiches détaillées — gravité FAIBLE

Format resserré : chaque fiche donne localisation, mécanisme, conditions et conséquences, reproduction, piste. Toutes CONFIRMÉES sauf mention.

### Éditeur et modèle
- **TECH-052 — Réservation des bords de pente au mur contournable.** `js/spill.js : spillConflicts` n'est appelé que par la pose, l'aperçu, le collage, le déplacement / rotation de sélection et « Prolonger » ; pas par `_applyTilePatch` (inspecteur, gizmo, Maj + glisser), la duplication, `toggleFlag` / `_reshape`, `_retypeTile`, `_fillEmpty`, la chaîne `widthBridge`, ni la lecture d'un code. Conséquence : une route traversée par le bord incliné d'une pente au mur (ce que la règle 0.12.6 voulait empêcher). Sonde de l'audit délégué : cinq chemins produisent la violation. Piste : un seul validateur de placement pour toutes les modifications.
- **TECH-053 — « Prolonger » peut poser plusieurs départs.** `editor/tools.js : extend` (l. 161-175) et `extend.js : extendPlan` ne traitent pas le départ, contrairement à `_act` (l. 148). P trois fois avec le départ choisi : 4 départs ; essai et vérification refusés (« un seul départ ») mais le circuit s'enregistre et se partage. Piste : refuser le départ dans `extendPlan`, ou retirer les autres comme `_act`.
- **TECH-054 — Calques gardés au chargement d'un autre circuit ; annuler garde la vérification courante.** `history.js : loadCode` / `newTrack` conservent `hiddenGroups` / `lockedGroups` : après import, les groupes 1, 2 du nouveau circuit sont invisibles ou verrouillés. `_restore` reprend `vt` / `vh` courants : annuler un « Nouveau » ou un import rend l'ancien circuit sans sa vérification. Piste : remettre les calques à zéro au chargement ; mettre `vt` / `vh` dans l'instantané.
- **TECH-055 — Test depuis le curseur en gravité inversée sur un circuit `flip0`.** TRÈS PROBABLE (intention à confirmer). `history.js:299` : `(t.v && …) || track.flip0 ? -1 : 1` : sur un circuit qui démarre au plafond, tester depuis une route ordinaire place la voiture en gravité inversée. Piste : le sens de gravité de la pièce visée, pas la règle de départ.
- **TECH-056 — La fenêtre « Circuit » arrondit la direction du vent.** `editor/palette.js : openParams` propose des pas de 45° alors que la règle accepte 15° : appliquer la fenêtre réécrit 30° en 45° et change la signature (codes venus d'ailleurs). Piste : pas de 15° dans la liste.
- **TECH-057 — « Tout sélectionner » oublie des décorations.** `editor/selection.js : selectAll` : rectangle calculé sur les pièces seules ; les décorations hors de cette emprise ne sont ni déplacées ni supprimées. Piste : inclure les décorations dans l'emprise.
- **TECH-058 — Le collage garde les numéros de groupe.** `prefabs.js : clipToCode` / `clipFromTrack` gardent `g` : des pièces collées entrent dans un calque masqué ou une cible de logique du circuit de destination. Piste : remettre `g` à 0 au collage d'un autre circuit (ou le demander).
- **TECH-059 — Impossible de sortir si l'enregistrement automatique échoue.** `app/editorFlow.js : leaveEditor` reste dans l'éditeur quand `autoSave` échoue (stockage plein, code > 400 Ko), sans « quitter sans enregistrer » ; le bandeau de mise à jour recharge quand même. Piste : proposer de quitter sans enregistrer ou d'exporter le code.
- **TECH-060 — Décorations inconnues perdues sans blocage.** `track.js : lossBlocking` ignore `lost.decos` : éditer et enregistrer le code d'une version plus récente perd ces décorations sans avertissement dans l'éditeur. Piste : bloquer ou avertir aussi pour les décorations.
- **TECH-061 — Miniature périmée dans la fiche d'un circuit.** `app/raceHub.js` (~l. 414) indexe les miniatures par `id + longueur du code` : une modification de même longueur garde l'ancienne image. Piste : clé par empreinte du code (comme `screens.js:324`).
- **TECH-062 — La vue par niveau montre les calques masqués.** `trackMesh.js : rebuild` envoie les pièces atténuées des groupes masqués vers le maillage atténué : elles s'affichent. Piste : filtrer par visibilité de groupe.

### Course, interface, rendu
- **TECH-063 — Garage : minuterie non annulée.** `garage/studio.js:18-19` (`_studioT`, 120 ms) n'est pas annulée par `garage.js : dispose()` (l. 283) : quitter juste après une modification de l'atelier ajoute une voiture orpheline à la scène (elle reste en course, et s'accumule), appelle `setLoadout` et `audio.setVoice` après la sortie. Sonde Chromium de l'audit délégué : enfants de la scène 11 → 12. Piste : annuler (ou exécuter) la minuterie dans `dispose`.
- **TECH-064 — Aides à la conduite : « Fiche du circuit » absente à l'arrivée.** `race/finish.js:194` compare la clé assistée (`…~v1.as-1`) à `_lastDesc.key` ; `quitRace` et `openSessionHub` comparent `opts.trackKey`. Piste : comparer `this.opts.trackKey`.
- **TECH-065 — Échap incohérent.** `main.js:450` : Échap revient à l'accueil sans rouvrir le panneau (`_lastPanel`), contrairement à « ← Retour » ; dans le garage, Échap ne fait rien. Piste : faire passer Échap par le même chemin que le bouton retour visible.
- **TECH-066 — Réponse du serveur après avoir quitté la course.** `main.js:303` : `_ensureLocalRecord` → `refreshProgress` (l. 333) s'exécutent avant la garde de session : le panneau de l'accueil que le joueur vient d'ouvrir se referme ; sur l'écran des circuits, la liste est reconstruite (défilement et focus perdus). Piste : ne rafraîchir que si les données affichées ont changé, sans refermer un panneau.
- **TECH-067 — Démonstration du menu : vibrations.** `race.js:321, 328, 359` : vibrations de choc, de réception et de mini-turbo sans garde `!this.demo` : sur téléphone (tactile, haptique activé par défaut), `navigator.vibrate` appelé 2 à 6 fois par minute de démonstration ; manette secouée dans le menu. Piste : garde `!this.demo`.
- **TECH-068 — Replay Theater : nom de caméra faux.** `race.js:84` (`replayCam = 0`) contre `race.js:106` (`camMode` = réglage du joueur) : avec la caméra « Capot » réglée, le Theater affiche « Poursuite » ; le premier C passe à « Proche ». Piste : initialiser `replayCam` à `camMode`.
- **TECH-069 — Replay Theater : déplacement dans le temps.** `theater/session.js : theaterSeek` : les scripts de circuit (`_scriptsUpdate`, appelé seulement dans `render`) ne sont pas joués pendant le saut (ciel, météo, musique différents de la lecture continue) ; les effets de logique en file (jusqu'à 64) sont tous joués à l'image suivante (sons et messages empilés). Le reste du saut (pas de record ni de statistique, état cohérent) est correct. Piste : jouer les scripts sans effets pendant le saut ; vider la file d'effets après.
- **TECH-070 — Verrou de priorité des messages non remis à zéro.** `ui.js:42` (`hud.reset`) retire l'affichage mais garde `gate.until` / `gate.prio` : un message prioritaire (par exemple « état physique incohérent », 2,2 s) affiché juste avant un redémarrage fait refuser la consigne de la leçon de l'Académie au GO. Piste : `gate.offer('')` dans `hud.reset` (comme `_newAttempt`).
- **TECH-071 — Anglais : texte français à l'arrivée.** `ui.js:240` : la ligne de récompense affiche « +276 ◆ coinsBonus 1re fois ×2 » en anglais (concaténation non traduite). Piste : un modèle traduit pour toute la ligne.
- **TECH-072 — Message « hors piste » à l'arrivée.** À VÉRIFIER. `race.js:427-428` : après `_event` (arrivée) dans le même pas, le contrôle de hors-piste affiche encore `MSG.offTrack` (la réapparition, elle, est bien refusée). Cosmétique ; demande plus de 0,5 s hors piste en franchissant la ligne. Piste : tester `state === 'racing'` avant le message.
- **TECH-073 — Réduction de qualité pendant un replay ×4 ou une analyse.** À VÉRIFIER. `quality.watch()` compte le replay et le Theater comme une course ; l'analyse du Theater bloque 75 à 145 ms par trace, le replay ×4 quadruple le coût de la physique : une machine juste peut passer sous 42 i/s et la baisse est **enregistrée**. Non observé sur une machine correcte. Piste : ne surveiller que les vraies courses.

### Persistance, comptes, en ligne, serveur
- **TECH-074 — Sauvegarde > 6 Mo renvoyée à chaque synchronisation.** `account.js:398-400` : la copie du cloud est `withoutGhosts`, la fusion garde les fantômes locaux : `sameData` n'est jamais vrai, chaque synchronisation réécrit (≈ 6 Mo) et incrémente `rev` (conflits avec les autres appareils). À VÉRIFIER : au-delà de la limite de la base (8 Mo compressés), chaque synchronisation échoue. Piste : comparer `withoutGhosts(fusion)` à la copie du cloud ; retirer aussi les commandes ou les records `e-` au-delà de la limite.
- **TECH-075 — Restauration annoncée réussie quand le stockage est plein.** `profile.js:210, 248` ignorent le résultat de `restoreAll` ; `app/profile.js : _afterImport` affiche toujours « Sauvegarde restaurée ! ». Piste : propager l'échec.
- **TECH-076 — Saisons : clôture sans le délai de grâce.** `seasons.js` accepte 10 min après la fin (`SEASON_GRACE_MS`), `etape11-saisons.sql : close_season` clôt à l'heure : les courses de la grâce entrent après les montées / descentes ; points affichés et divisions enregistrées se contredisent. Piste : clore après `ends + grâce`.
- **TECH-077 — Médaille abîmée dans le cloud → cristal.** `cloudsave.js:85` : `num()` transforme une valeur invalide en 0, qui vaut « cristal ». Données corrompues seulement. Piste : ignorer une valeur invalide.
- **TECH-078 — Identifiant d'installation dans le code joueur.** `storage.js : DEVICE_ONLY_KEYS` (l. 87) n'exclut ni `telemetry.state` (identifiant d'installation) ni `errors.queue` : un code joueur publié relie pseudo et identifiant ; l'importer en « Remplacer » fait adopter le même identifiant par un autre appareil. Piste : ajouter ces clés à la liste.
- **TECH-079 — Dates de défi du jour inexistantes acceptées.** `verify.js : trackForKey` (l. 59-60) : `Date.parse('2026-02-30T00:00:00Z')` est valide (reporté au 2 mars) : `daily-…-02-30`, `-04-31` passent le contrôle de ±2,5 jours en fin de mois et créent des classements et du calcul en plus ; la fenêtre réelle dépasse « hier, aujourd'hui, demain ». Piste : vérifier que la date relue redonne la même chaîne.
- **TECH-080 — Défauts mineurs du client en ligne.** (a) `online.js : _count` (l. 345-352) appelle `fetch` hors de `_fetchRaw` : « Failed to fetch » brut affiché ; (b) le délai précis d'un refus 429 du serveur est remplacé par un message générique (`online.js:41`) ; (c) le service worker met en cache chaque `js/version.js?u=<horodatage>` de la vérification de mise à jour (`updateCheck.js:25`) jusqu'au changement de version ; (d) hors ligne, `index.html` est renvoyé à la place d'un fichier non trouvé (`sw.js`) ; (e) `telemetry.state.attempts` garde une entrée par circuit de la communauté, sans borne.
- **TECH-081 — Clés de variantes liées une par une.** TRÈS PROBABLE. `track_binds` lie chaque clé complète (variante comprise) séparément : quelqu'un qui dispose d'une collision de la signature de 32 bits peut s'approprier les clés de variantes d'un circuit populaire même après la liaison de sa clé de base. Piste : lier les variantes à la liaison de la clé de base.

### Multijoueur
- **TECH-082 — Salon public fantôme.** `net/directory.js` (l. 226-232) : `retract()` pendant `announce()` (jeton ou connexion en cours) laisse la connexion se créer et publier : salon listé jusqu'à la fermeture de l'onglet, « Salle introuvable » au clic. Piste : annuler et fermer à la fin de la jonction si retiré.
- **TECH-083 — Écouteurs du salon jamais retirés.** `app/multi.js:366-369` : retirés seulement par les boutons (pas par Échap, ni par la fermeture lors d'un départ) : 5-6 écouteurs de plus à chaque ouverture, qui retiennent un arbre DOM détaché. Pas de double traitement visible (le contenu de la fenêtre est remplacé). Piste : `off()` dans le `onClose` de la fenêtre.
- **TECH-084 — Arrivée en attente rejouée dans un nouveau championnat.** `room.js` (`_pendingFinish`, l. 63 / 441 / 276, effacé seulement l. 606) survit à `cupstop` et à « Relancer » ; à la réouverture d'un lien il est envoyé pour la manche 0 du nouveau championnat (sonde : un joueur crédité de 3 000 pas sans avoir couru, qui gagne). Piste : le lier au championnat, l'effacer à l'arrêt et au lancement.
- **TECH-085 — Classement général qui compte des non-participants.** `room.js:469` nomme tous les membres (liens en échec, absents, incompatibles) ; départage par somme des places (`championship.js:84`) : un joueur qui n'a jamais couru passe devant des participants à 0 point ; la somme des places avantage qui a joué moins de manches. Piste : ne nommer que la grille ; moyenne des places.
- **TECH-086 — Capacité de 8 qui ignore les places gardées.** `room.js:127` compte la présence seulement : une salle pleine avec un absent admet un 9e ; le joueur qui revient bute sur la limite de 7 liens. Piste : compter membres absents compris.
- **TECH-087 — Onglet masqué : tampons qui grossissent.** `net/interp.js` ne purge que dans `sample()` (au rendu) : onglet masqué, ≈ 4 Mo par adversaire et par 10 min. Piste : purger dans `push`.
- **TECH-088 — « Voitures identiques » appliquée à la seule voiture locale.** `race.js:69-70` remplace l'apparence locale ; les voitures distantes gardent l'apparence annoncée (`race/net.js:16`, `m.car`). Piste : appliquer la règle aussi dans `_setupRemotes`.
- **TECH-089 — Défauts mineurs.** (a) paquet de téléportation envoyé avec le `netTick` du paquet périodique du même pas : ignoré comme doublon, téléportation visible jusqu'à 50 ms plus tard (`race.js:240`, `interp.js:109`) ; (b) aucun paquet pendant le décompte : voitures de la grille invisibles jusqu'au GO ; (c) circuits de la communauté sans ligne centrale : progression du classement en direct par checkpoints, 0 % sans checkpoint ; (d) circuit plus long à charger que le délai de départ : GO immédiat sans décompte ; (e) aucune limite de débit des messages fiables : un flot de `finish` reconstruit le tableau à chaque message ; (f) À VÉRIFIER : une offre arrivée avant la présence d'un joueur qui revient peut être détruite par `_onPeer` (« back »), selon l'ordre de livraison de Realtime.

## 7. Synthèse

### 7.1 État technique général
Le **noyau de simulation est solide** : déterminisme vérifié (course en direct ↔ rejeu serveur au bit près, ordre des pièces sans effet, signature complète pour les champs physiques), points de retour robustes, collisions très défensives, 1 755 vérifications automatiques au vert. Les défauts du noyau sont des **cas de règles mal combinées** (plaques et réapparition, vitesse de départ, logique et chrono du multijoueur), pas des erreurs de calcul.
La fragilité est ailleurs : **dans les états qui traversent plusieurs systèmes** (entrées partagées entre l'interface et la course, captures et minuteries qui survivent à un changement d'écran, normalisations non idempotentes entre mémoire et code), **dans la synchronisation entre appareils et entre onglets**, et surtout **dans le multijoueur**, dont la gestion des états de salle, de l'identité et de la présence Realtime présente le plus de défauts sérieux.

### 7.2 Les problèmes les plus importants
1. TECH-001 (blocage par réapparition sur une plaque) et TECH-002 (circuits avec obstacle au plafond impossibles à publier et à classer) : invisibles pour les tests actuels, ils touchent le cœur de la boucle de jeu et du classement.
2. TECH-004, TECH-005, TECH-006 : trois façons ordinaires (Entrée sur « Reprendre », A tenu à la manette, une capture de touche oubliée) de perdre une course ou ses réglages.
3. TECH-003 : l'éditeur peut détruire des pièces sans le dire.
4. TECH-007 : un compte peut ne jamais afficher sa progression sur un appareil, en le disant « à jour ».
5. TECH-008 à TECH-012 : salles multijoueur qui lancent des invités contre leur gré, joueurs invisibles, salles bloquées ou fermées, joueurs exclus par la gestion de présence.

### 7.3 Systèmes les plus fragiles
- **Multijoueur** (`js/net/room.js`, `signaling.js`, `transport.js`, `app/multi.js`) : 25 constats ; état de salle à événements sans numéro de lancement ni de version, identité déclarée, présence Realtime simplifiée.
- **Synchronisation et persistance** (`account.js`, `cloudsave.js`, `profile.js`, `storage.js`) : résultats d'écriture ignorés, règles de fusion incomplètes, aucun suivi entre onglets.
- **Éditeur** (`editor/tools.js`, `inspector/*`, `history.js`) : plusieurs chemins de modification qui ne passent pas par les mêmes contrôles (normalisation, conflits, débordements, calques).
- **Entrées et superpositions** (`input.js`, `ui.js`, `main.js`, `wiring.js`) : un seul état de touches partagé par l'interface DOM, la course et l'éditeur.

### 7.4 Causes communes
| Cause | Problèmes |
| --- | --- |
| Normalisation non idempotente ou appliquée sur certains chemins seulement (mémoire ≠ code relu) | TECH-002, 003, 034, 035, 052, 039 |
| Résultat d'écriture ignoré (`restoreAll`, stockage plein) | TECH-007, 024, 075, 022 |
| Une touche lue à la fois par le DOM et par le jeu ; états d'entrée non remis à zéro aux transitions | TECH-004, 005, 006, 017, 020, 033 |
| État mémorisé qui ignore une autre règle au moment de la réapparition | TECH-001, 013, 014 |
| Messages réseau sans identifiant de lancement / version / émetteur vérifié | TECH-008, 040, 042, 047, 048, 049, 084 |
| Présence et connexion Realtime gérées de façon simplifiée | TECH-010, 011, 012, 044, 046, 082 |
| Absence de coordination entre onglets (`storage` jamais écouté) | TECH-026, 027 |
| Garde de session par identité d'objet, pas par course | TECH-018, 066 |
| Minuterie ou écouteur non rattaché au cycle de vie de la session | TECH-063, 083, 044 |
| Logique dupliquée entre le jeu et la base SQL | TECH-021, 032, 076 |

### 7.5 Risques de régression (à garder en tête pour les corrections)
- **Toute correction de TECH-001, 013, 014** touche la physique ou la logique dans la fermeture de `js/verify.js` : incrément de `PHYS_VER`, empreinte, temps de référence, médailles, corpus de compatibilité, **redéploiement manuel** de `submit-score` (procédure : `docs/ARCHITECTURE.md`).
- **TECH-002 et TECH-039** changent des signatures : les clés `u-…` de circuits existants changeraient (records locaux, classements, liaisons `track_binds`).
- **Modifier un circuit intégré** change sa clé `b-` sans migration : records, médailles, verrous de chapitre, classements, saisons et duels concernés (`../comprendre/04-systemes.md` § 4.11).
- **Le traducteur anglais** agit sur tout le document, contenus des joueurs compris (`../comprendre/04-systemes.md` § 4.4) : tout texte ajouté peut être capturé par un modèle trop général.
- **Les deux chemins de pas** (`RaceSession._stepOnce` et `GhostRunner.step`) sont aujourd'hui équivalents ; toute modification de l'ordre doit être faite des deux côtés (voir § 7.8 pour la vérification faite).
- **Corrections des entrées** (TECH-004 à 006, 017) : `tools/test-browser.mjs` pilote le jeu par `window.copytrack` et par des touches ; à relancer.

### 7.6 Problèmes qui demandent un test dans le jeu ou en production
- **Production Supabase** : TECH-021 (droits réels sur `scores`), TECH-031 (limite d'inscriptions anonymes), TECH-012 et TECH-011 (comportement réel de Realtime), TECH-050 (expiration TURN), TECH-074 (limite de taille de la base). `supabase/MIGRATIONS.md` indique `submit-score` déployée en `PHYS_VER` 38 avec le build de la 0.12.3 : le code actuel n'en diffère que par des noms (vérifié), seule l'empreinte de build diffère.
- **Navigateurs réels** : TECH-004 (focus selon le pointeur), TECH-005 (manettes réelles), TECH-067 (vibration sur téléphone), TECH-073 (machines lentes), TECH-019 (lisibilité du verre).
- **Multijoueur réel à plusieurs machines** : TECH-008 à 012, 041 (ressenti des collisions), 043.

### 7.7 Hypothèses examinées et réfutées
- Réapparition à un checkpoint posé sur chaque type de pièce qui l'accepte, à l'endroit et à l'envers (30 cas) : correcte.
- Ordre des pièces dans le code : sans effet sur la physique (72 circuits × 2 ordres, au bit près).
- Champs lus par la physique absents de la signature : aucun (pièces, décorations physiques, règles du circuit).
- Mutation du circuit officiel en cache par les modes ou catégories de record : non (`applyRules` copie).
- Coût de l'écran carrière (≈ 1 100 lectures de records complets) : 28 ms pour 72 records de 21 Ko, acceptable.
- Arrondi du temps de l'auteur à la publication (`setVerified` au millième, tolérance 1 ms) : correct (13 circuits rejoués).
- Longueur des clés et expressions de la base : conformes ; fusion des records et des circuits (3 000 cas aléatoires) : rien perdu hors pierres tombales.
- Fuites GPU et de graphe de scène sur 30 courses, 15 passages au garage, 5 replays : aucune croissance.
- Pause pendant le décompte, redémarrage pendant le « GO », retours au checkpoint en rafale, perte du contexte WebGL : corrects.

### 7.8 Zones réellement examinées
- **Noyau** : `simulation.js`, `raceLogic.js`, `physics.js`, `physics/walls.js`, `physics/contact.js`, entrées / sorties de `physics/ribbon.js`, `track.js` (signature, lecture), `track/surfaces.js`, `track/edit.js` (normalisation des décorations), `sim/logic.js`, `sim/params.js`, `replay.js`, `verify.js`, `daily.js`, `rulesCore.js`, `variants.js` ; sondes sur les points de retour, les plaques, la vitesse de départ, la logique en multijoueur, l'ordre des pièces, la signature.
- **Équivalence course en direct ↔ rejeu serveur** : course réelle dans Chromium (chemin `RaceSession._stepOnce`, pilote automatique bruité, trois retours au checkpoint au clavier), puis `replayRun` sur le code relu : **temps identiques** sur « Premiers Éclats » (51,450 s) et « Laminoir », circuit à obstacles (61,675 s).
- **Éditeur** (audit délégué, revérifié) : pose, outils, inspecteur, gizmo, historique, essai et retour, calques, logique, débordements, signature.
- **Persistance, comptes, en ligne, serveur** (audit délégué, revérifié pour TECH-007, 021, 022, 024, 025, 028) : stockage, fusion, synchronisation, import, sessions, fonction `submit-score`, étapes SQL (lecture).
- **Multijoueur** (audit délégué avec salles simulées, revérifié pour TECH-008, 009, 011, 012, 040, 041) : salle, présence, signalisation, maillage, championnat, collisions, reconnexion.
- **Course, interface, rendu** (audit délégué dans Chromium, revérifié pour TECH-015, 016, 018, 019, 020, 063) : cycle de vie, superpositions, entrées, Theater, garage, qualité, fuites.

### 7.9 Zones insuffisamment explorées
- Géométrie analytique pièce par pièce (`pieces.js : sampleLocal`, `ribbons.js : frameLocal`, rubans roulés) et cohérence fine avec `trackGeometry.js` : couverte par les tests existants (`audit-pieces`, matrice, empreinte), pas réauditée.
- `physics/ribbon.js` au-delà de l'entrée, de la sortie et de la gravité ; véhicules v2 ; `autopilot.js`.
- Analyse de course (`analysis/*`), HUD d'entraînement, coach : seulement la partie qui rejoue les courses.
- Étapes SQL et politiques RLS ligne à ligne, `submit-score/handler.js` en détail, fonction `ice` : lecture partielle, aucun PostgreSQL disponible.
- Toucher, pincer, manette dans l'éditeur ; navigation clavier complète ; parcours complet en anglais.
- Fuites de mémoire JavaScript (écouteurs, fermetures, tables) hors GPU et graphe de scène.
- Comportement réel de Supabase Realtime, de WebRTC entre machines, et de la base de production.
