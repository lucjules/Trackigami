# Audit en conditions de jeu — Phase 2 (bêta 0.16.0)

Le jeu a été **réellement lancé et joué** dans Chromium (Playwright, sans écran, rendu logiciel), au clavier, à la souris, en tactile simulé et par son interface interne ; les comportements de joueur sur les 72 circuits ont été rejoués **avec la physique du jeu, sans rendu** (Node) pour couvrir plus de situations. Rien n'a été modifié dans le jeu ; aucun commit.
Les problèmes déjà décrits en phase 1 ([PHASE1-AUDIT-TECHNIQUE.md](PHASE1-AUDIT-TECHNIQUE.md)) sont **reliés à leur identifiant `TECH-…`** au lieu d'être recopiés ; seule leur manifestation en jeu est décrite ici.

## 1. Comment les essais ont été faits (et leurs limites)

| Moyen | Ce qu'il permet | Limite |
| --- | --- | --- |
| Chromium piloté (Playwright), jeu servi en local | parcours réels : accueil, menus, courses au clavier, pause, arrivée, replay, garage, éditeur, réglages, anglais, téléphone simulé, captures d'écran regardées | rendu logiciel lent : pour les longues courses, les images sont avancées par le code du jeu (`session.update`, `_stepOnce`) avec les vraies commandes ; pas de son, pas de vraie manette, pas de vrai téléphone |
| Multijoueur local du jeu (`?net=local`, deux ou trois onglets) | vraies salles, vrai WebRTC entre onglets, départ commun, arrivées | une seule machine : ni latence, ni coupures réelles, ni Supabase Realtime |
| Physique du jeu sans rendu (Node) + pilote automatique du jeu, perturbé | comportements de joueur répétés sur les 72 circuits : retours au checkpoint, maladresses, coupes, catégories de record | le pilote automatique n'est pas un humain : un échec n'est pas une preuve d'impossibilité (signalé « Probable » ou « À vérifier ») |
| Serveur en ligne | **non accessible** : les requêtes vers Supabase ont été bloquées ; le jeu a été vu tel qu'un joueur hors ligne le voit | classements, communauté, comptes, publication réelle non testés |

Certitude : **Reproduit** (observé en jouant, ou rejoué à l'identique avec la physique du jeu), **Confirmé par inspection** (code), **Probable**, **À vérifier**.

## 2. Constats issus de mes essais de jeu

### GAME-001 — Réapparition sur une plaque de transformation : boucle de chutes sans fin
- **Gravité** ÉLEVÉ · **Certitude** Reproduit (dans Chromium, au clavier) · **Type** bug · **Phase 1** [TECH-001](PHASE1-AUDIT-TECHNIQUE.md)
- **Mécanique** plaques de transformation (deltaplane, moto, bateau), checkpoints, retour au checkpoint · **Contexte** circuit partagé par lien, construit comme un joueur pourrait le faire : départ, deux lignes droites, plaque deltaplane, vide de deux cases avec un checkpoint aérien, trois lignes droites, arrivée.
- **Étapes** 1. Ouvrir le lien `#t=…` du circuit, « Jouer ». 2. Accélérer (flèche haut) : la voiture devient deltaplane sur la plaque et franchit l'anneau du checkpoint (véhicule `glider`, 42 m/s). 3. Appuyer sur R. 4. Continuer d'accélérer.
- **Observé** Après R, la voiture réapparaît **en voiture** (chrono 5,28 s), tombe dans le vide, réapparaît, retombe : 15 réapparitions en 24 s de jeu, toujours en voiture, chrono qui boucle entre 5,2 et 6,9 s ; message « Hors piste » à chaque fois (capture : voiture en pleine retransformation sous l'anneau).
- **Attendu** Réapparaître en deltaplane, comme au passage du checkpoint.
- **Conséquences** Le joueur est bloqué ; seule « Recommencer » (T) en sort, et la même chose recommence s'il réappuie sur R ou chute après l'anneau. Aucun circuit intégré n'est touché le long du trajet prévu ; tout circuit de joueur qui pose un checkpoint après une plaque l'est.
- **Systèmes** physique (`place`, `_transformPlate`), règles de course (point de retour), course en direct.
- **Piste** voir TECH-001.

### GAME-002 — Multijoueur (course libre) : les invités du salon sont lancés en course dès que l'hôte change de circuit
- **Gravité** ÉLEVÉ · **Certitude** Reproduit (trois onglets, multijoueur local du jeu, vrai WebRTC) · **Type** bug · **Phase 1** [TECH-008](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** 1. Hôte : « Créer une salle » ; invité : lien d'invitation. 2. Mode « Course libre », circuit « Premiers Éclats », « Lancer la course ». 3. Tout le monde quitte la course et revient au salon. 4. L'hôte choisit simplement un autre circuit dans la liste (« Canyon Corail »).
- **Observé** Les deux invités quittent le salon et se retrouvent **en course** sur Canyon Corail (chrono qui tourne, capture), pendant que l'hôte est toujours au salon ; le tableau de la salle les montre avec l'hôte comme s'il courait.
- **Attendu** Les invités restent au salon jusqu'à « Lancer la course ».
- **Conséquences** Impossible de choisir tranquillement le circuit suivant : chaque essai de l'hôte éjecte ses invités ; confusion sur qui court quoi.
- **Systèmes** salle multijoueur (`Room.started`), salon (`app/multi.js`).

### GAME-003 — Multijoueur : un joueur arrivé pendant la course est invisible pour ceux qui couraient déjà
- **Gravité** ÉLEVÉ · **Certitude** Reproduit (trois onglets) · **Type** bug · **Phase 1** [TECH-009](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** Course libre en cours entre l'hôte et un invité ; un troisième joueur rejoint par le lien.
- **Observé** Le nouveau joueur est lancé directement en course et voit les **deux** autres (2 voitures distantes) ; l'hôte, lui, ne voit toujours qu'**une** voiture distante, et ce jusqu'à la fin.
- **Attendu** Tous les joueurs se voient.
- **Conséquences** Course « fantôme » asymétrique, classement en direct incomplet ; en championnat, pas de collision avec ce joueur.

### GAME-004 — Téléportation de 59 m sur un double looping pendant une chute
- **Gravité** MOYEN · **Certitude** Reproduit (physique du jeu, déterministe : même résultat au rejeu et sur le serveur) · **Type** bug · **Phase 1** non répertorié (**nouveau**)
- **Contexte** « Épave » (chapitre 8), sous le double looping (pièce `loopDouble` en (0, −15), niveau 12).
- **Étapes** Partie maladroite (pilote automatique perturbé, graine 348437) : la voiture quitte la route et tombe à 46 m/s sous le looping, à t = 68,03 s.
- **Observé** En un seul pas de 1/120 s, la voiture passe de (70,6 ; 53,6 ; −470,5), en chute libre, à (45,2 ; 79,4 ; −423,9), **posée sur le looping, 59 m plus loin et 26 m plus haut**, avec un évènement de réception.
- **Cause** `js/physics/ribbon.js : _tryLandRibbon` cherche le point du ruban le plus proche (33 échantillons puis 4 affinages) et n'accepte la réception que si l'écart **en travers** (1,2 m) et **selon la normale** (−0,5 m) sont petits ; l'écart **le long de la route** (ici 59,3 m) n'est jamais contrôlé, et l'affinage n'a pas convergé sur ce ruban très courbe (longueur 222 m).
- **Attendu** La voiture continue de tomber (et réapparaît) ou se pose là où elle touche réellement une route.
- **Conséquences** Téléportation visible ; selon l'endroit, elle peut faire gagner ou perdre beaucoup de temps et, étant déterministe, elle serait acceptée par le serveur (raccourci exploitable si quelqu'un trouve une trajectoire qui la déclenche).
- **Piste** Refuser la réception si l'écart le long de la route dépasse quelques mètres après l'affinage ; ajouter le cas à l'empreinte de physique (changement de `PHYS_VER`).

### GAME-005 — « Départ lancé » : un retour au checkpoint avant le premier checkpoint repart à l'arrêt
- **Gravité** MOYEN · **Certitude** Reproduit (Chromium, touche R) · **Type** bug · **Phase 1** [TECH-013](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** Modes › « Départ lancé » sur « Premiers Éclats » ; au départ la voiture roule à 54,8 m/s (200 km/h) ; appuyer sur R avant le premier checkpoint.
- **Observé** Retour au départ, chrono à 0,2 s, vitesse **0 m/s**.
- **Attendu** Repartir lancé (ou équivalent à « Recommencer »).
- **Conséquences** Le retour est plus pénalisant que recommencer ; si l'ouverture du circuit exige l'élan, le joueur chute en boucle. Concerne aussi les catégories de record `v0-100` / `v0-200`.

### GAME-006 — Catégories de record « départ en bateau » (et « en deltaplane ») proposées sur des circuits probablement infranchissables
- **Gravité** MOYEN · **Certitude** Probable (bateau) / À vérifier (deltaplane) · **Type** game design / bug de fonctionnalité · **Phase 1** non répertorié (**nouveau**)
- **Contexte** fiche de chaque circuit intégré, liste « Catégorie » (`trackDescriptor.js : hubCategories` ne vérifie que « la variante change quelque chose », `variants.js : variantFits`).
- **Observé (physique du jeu)** Un bateau sur la route plafonne à 76-89 km/h sur le plat (« Premiers Éclats », « Canyon Corail ») ; tenir sur un mur exige 30 m/s (108 km/h, `SIDE_MIN_SPEED`). Le pilote automatique ne finit la catégorie « bateau » que sur **8 circuits sur 72**, et reste coincé sans même réapparaître (il rampe sur la route) ; « deltaplane » : 36 sur 72 ; « moto » : 70 sur 71 ; « pluie », « Simulation », « sans obstacles », « véhicules v2 » : tous finis.
- **Attendu** Ne proposer une catégorie que si elle est faisable (ou l'indiquer comme défi extrême).
- **Conséquences** Le joueur choisit une catégorie avec son propre classement et ne peut pas finir ; frustration et classements vides.
- **Piste** Valider chaque catégorie par le pilote automatique (comme les circuits intégrés et le défi du jour) et ne garder que celles qu'il termine ; à défaut, avertissement « très difficile ».

### GAME-007 — Longs tronçons sans checkpoint : une chute près de la fin coûte presque toute la course
- **Gravité** FAIBLE · **Certitude** Reproduit (mesure sur la course du pilote automatique) · **Type** game design / équilibrage · **Phase 1** —
- **Observé** Écart maximal entre deux checkpoints (ou checkpoint et arrivée) : 52 s sur « Double Hélice » (ch. 5, un seul checkpoint à 18 s d'une course de 70 s), 41-42 s sur « Cheminée », « Récif », « Viaduc », 40 s sur « Épave », 37-39 s sur « Montgolfières », « Rafales », « Engrenages » ; médiane des 72 circuits : 28,6 s.
- **Conséquences** Sur des tronçons techniques (spirales, loopings), une erreur renvoie très loin en arrière ; ressenti de punition disproportionnée, surtout dans les chapitres avancés.
- **Piste** Un checkpoint de plus sur ces tronçons, ou une règle de conception « au plus ~30 s sans checkpoint ».

### GAME-008 — Arrivant pendant une « Course » (championnat d'une manche) : salon sans circuit affiché
- **Gravité** FAIBLE · **Certitude** Reproduit (trois onglets) · **Type** feedback / bug d'affichage · **Phase 1** —
- **Observé** En mode « Course », un joueur qui rejoint pendant la manche reste au salon avec **aucun circuit choisi** (alors que les autres voient « Premiers Éclats »), même après le retour des autres au salon ; rien ne lui dit qu'une manche est en cours ni quand il pourra jouer.
- **Attendu** Voir le circuit et un message « manche en cours, tu joueras la suivante ».

### GAME-009 — Circuit avec un obstacle au plafond : la vérification de l'auteur disparaît au retour dans l'éditeur, publication impossible
- **Gravité** ÉLEVÉ · **Certitude** Reproduit (Chromium : éditeur, « Vérifier », course au clavier, retour) · **Type** bug · **Phase 1** [TECH-002](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** 1. Ouvrir dans l'éditeur un circuit contenant des piques roulées de 180° (posées au plafond). 2. « Vérifier » : finir la course (5,008 s) ; la fenêtre « Circuit vérifié ✔ » s'affiche. 3. « Retour à l'éditeur ».
- **Observé** L'éditeur propose de nouveau « 🏁 Vérifier et publier » : le circuit n'est **plus vérifié** (temps de l'auteur gardé, signature passée de `1j9bsfk` en course à `x1o7or` dans l'éditeur). Recommencer la vérification reproduit la même bascule.
- **Attendu** Circuit vérifié, publiable.
- **Conséquences** L'auteur ne peut jamais publier ce circuit ; s'il le partage, les temps des autres joueurs sont refusés par le classement en ligne (non observable hors ligne, démontré en phase 1).

## 3. Essais de jeu sans défaut constaté (hypothèses écartées)

| Essai | Comment | Résultat |
| --- | --- | --- |
| Appuyer sur R juste après chaque checkpoint, sur les 72 circuits | pilote automatique, retour immédiat, reprise à l'arrêt | on repart et on finit **partout** (aucun checkpoint placé juste avant un saut qui demande de l'élan) |
| Course en direct ↔ rejeu du serveur | Chromium, trois retours au clavier, deux circuits dont un à obstacles | temps identiques au bit près (déjà noté en phase 1) |
| Couper le tracé (raccourcis) | endroits où le tracé repasse à moins de 40 m de lui-même sans checkpoint entre les deux, puis coupe réelle gaz à fond ; même essai en se laissant tomber d'une route haute sur une partie plus basse | **aucun raccourci** exploitable (9 tentatives sur 7 circuits : bordures, chutes, réapparitions) |
| Joueur 30 % plus rapide que prévu | pilote automatique à vitesse de consigne × 1,3 sur les 72 circuits | **aucun checkpoint sauté** par-dessus, aucune arrivée refusée |
| Joueur maladroit | 144 courses : coups de volant brusques, freinages, dérapages, arrêts, demi-tours | 108 arrivées ; une téléportation (GAME-004) ; pas d'état physique incohérent, pas de vitesse aberrante ; les arrêts observés (rampe vers un mur ou looping pris trop lentement, plaque « moteur coupé ») se résolvent en reculant ou par R, que le jeu suggère après 3 s |
| Plaques de vent latéral | voiture arrêtée, plaquée contre la bordure, vent de 1 à 200 % | on repart gaz à fond et volant droit, ou en marche arrière ; on ne reste bloqué qu'en braquant à fond contre la bordure |
| Objectifs bonus de la carrière | pilote automatique sur les 72 circuits, plus un contrôle statique (anneaux disponibles, véhicule à l'arrivée, temps par rapport au cristal) | 71 sur 72 atteints par un pilote qui ne les cherche pas ; le dernier (2 mini-turbos) demande de déraper : faisable |
| Leçons de l'Académie | recherche systématique de commandes simples | réception parfaite : 187 réglages d'aérofrein sur 696 la réussissent ; mini-turbos : jusqu'à 3 par simple coup de frein dans le virage |
| Défi du jour | génération des 60 prochains jours | un défi chaque jour, temps « or » de 34,7 à 64,8 s |
| Longue session | 12 circuits × 2 courses, retours au menu, garage, dans Chromium | graphe de scène stable (11 objets), DOM stable après la première arrivée, aucune erreur ; la mémoire JavaScript mesurée par Chromium sans écran est arrondie et n'a pas été jugée probante |
| « GO ! » qui resterait affiché | vu sur une capture prise pendant un pas à pas accéléré | avec la vraie boucle du jeu, le texte s'efface après 0,6 s : artefact de mon outil, **non retenu** |

## 4. Bilan de la phase 2

### 4.1 Expérience de jeu observée
En jouant (clavier, Chromium) et en rejouant des milliers de situations avec la physique du jeu, le cœur de l'expérience **tient bien** : on finit tous les circuits, on peut revenir à n'importe quel checkpoint, les objectifs, leçons et défis du jour sont réalisables, aucune coupe ne permet de tricher, la course en direct est exactement celle que le serveur rejoue, aucune dégradation sur une longue session. Les problèmes trouvés se concentrent sur **des combinaisons** (plaque de transformation + checkpoint, vitesse de départ + retour, obstacle au plafond + vérification), sur **le multijoueur à plusieurs**, et sur **des catégories de record proposées sans être faisables**.

### 4.2 Synthèse
| Catégorie | Constats |
| --- | --- |
| Softlocks / situations sans issue (hors « Recommencer ») | GAME-001 ; GAME-005 si l'ouverture exige l'élan ; GAME-006 (catégories infranchissables) |
| Progression | GAME-009 (publication impossible) ; GAME-006 (classements de catégories vides) ; GAME-007 (longs tronçons sans checkpoint) |
| Comportements anormaux | GAME-004 (téléportation) |
| Multijoueur | GAME-002, GAME-003, GAME-008 |
| Phase 1 confirmée en jeu | TECH-001 (GAME-001), TECH-002 (GAME-009), TECH-008 (GAME-002), TECH-009 (GAME-003), TECH-013 (GAME-005) ; déjà reproduits dans Chromium pendant la phase 1 : TECH-004, 005, 006, 015, 016, 017, 018, 019, 020, 033, 034, 063, 064, 065, 067, 068, 071 |
| Nouveaux | GAME-004, GAME-006, GAME-007, GAME-008 |

### 4.3 Ce qui n'a pas pu être testé, et pourquoi
- **Le parcours d'interface complet en navigateur** (premières minutes, chaque écran et bouton, réglages, anglais, téléphone simulé, écrans hors ligne, éditeur en joueur novice) avait été confié à un sous-agent ; il a été **interrompu par la limite d'utilisation du compte** avant de rendre ses résultats. Ces écrans n'ont donc été vus que partiellement (course, pause, arrivée, salon multijoueur, éditeur au retour d'une vérification) ; une grande partie avait été examinée dans Chromium pendant la phase 1 (superpositions, entrées, Theater, garage, fuites). **À refaire en priorité si une suite de la phase 2 est souhaitée.**
- **Services en ligne** (classements, communauté, comptes, publication réelle, saisons, duels) : serveur inaccessible.
- **Vraie manette, vrai téléphone, son, ressenti de conduite, lisibilité à 60 images/s** : impossibles sans matériel ni carte graphique.
- **Multijoueur entre machines** (latence, coupures, Realtime) : seulement entre onglets d'un même navigateur.

### 4.4 Scénarios qui mériteraient des tests supplémentaires
1. Parcours complet d'un nouveau joueur, au clavier puis au tactile, en français et en anglais.
2. Chaque catégorie de record « véhicule » jouée à la main sur quelques circuits (confirmer GAME-006).
3. Multijoueur réel à trois ou quatre machines, avec coupures Wi-Fi et rechargements (TECH-010 à 012).
4. Éditeur : un joueur qui construit, teste, revient, annule, publie (TECH-003, 033 à 035).
5. Courses de 10 minutes et plus, onglet masqué, téléphone verrouillé.
