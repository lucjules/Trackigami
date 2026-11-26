# Historique des versions

Une section par version, la plus récente en haut. Le numéro de version affiché au joueur est `VERSION` dans `js/version.js` (et `package.json`) ;
`PHYS_VER`, dans le même fichier, est la version de la **physique** : les records, replays, fantômes importés, classements en ligne et salons
multijoueurs y sont liés. Une version qui change `PHYS_VER` impose de **redéployer la fonction serveur `submit-score`** (voir le README).

*Les nombres des sections anciennes (portées en cases, vitesses de saut…) sont ceux du monde de leur époque ; le monde est passé de cases de 24 m à 32 m en 0.9.11.*

## Bêta 0.20.0 — les mécaniques présentées à leur première rencontre, et huit leçons de plus à l'Académie (COMPLETE-007, COMPLETE-008)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 ; non modifié), **`NET_VER` reste 5**. Aucune mécanique du moteur, aucun circuit officiel (les 84 clés `b-` sont celles de `tools/builtin-keys.json`, inchangées), aucun temps de référence ne change ; `js/tracks.js` n'est pas touché. L'empreinte de la physique (230 scénarios) est identique.

- **Mécaniques (COMPLETE-007)** — `js/mechanics.js` : un catalogue de **36 mécaniques** (19 revêtements, 3 véhicules et l'eau, gravité et inversion, mur, plafond, looping, tube, vrille, bifurcation, carrefour, anneau turbo, 7 obstacles, pièces mobiles, logique), chacune avec un nom, une demi-phrase de rappel et un « comment s'en servir » vérifié contre la physique (par exemple : il faut ~110 km/h pour tenir sur un mur, les piques sont mortelles, une voiture dans l'eau patine et coule si elle s'arrête). **La détection part des données existantes** (revêtements `s`/`s2`, plaques, orientation `o`, plafond `v`, tunnel, mouvement `mv`, décorations-obstacles, règles `veh0`/`g0`/`flip0`, logique `lg`) : aucun circuit n'est modifié, aucune clé ne change. Sur les 84 circuits officiels, les 36 sont présentes ; le chapitre 1 en introduit **exactement les neuf annoncées par l'audit** (accélérateur, mur, bifurcation, carrefour, anneau, looping, tube, glace, plafond).
  - **Carte « Nouveau »** sur la fiche du circuit (Race Hub) : les mécaniques du circuit que le joueur n'a jamais vues, avec comment s'en servir ; **une seule fois par mécanique** (le niveau 1 est écrit à l'ouverture), quatre cartes au plus puis un renvoi à l'index ; un circuit verrouillé ne consomme rien.
  - **Rappel discret en course** (`js/race/mechanics.js`) : à l'approche de la première pièce ou du premier obstacle d'une mécanique jamais rencontrée en course, un court message de priorité **`hint`** (nouveau niveau du verrou de messages, `hudMessages.js` : le plus bas) : il ne coupe **jamais** un message en cours (refusé : on réessaie à l'approche, et une mécanique dépassée sans avoir pu être annoncée reste à découvrir pour la course suivante), n'importe quel autre message le remplace, et il part **une seule fois** (le niveau 2 est écrit au moment de l'affichage). Style plus petit, sans italique. Pas de rappel en démonstration, replay, Theater, multijoueur, Académie, essai de l'éditeur ni mode libre. Ne lit que la position de la voiture : rien ne touche la physique, le chrono ni l'enregistrement.
  - **Index « Mécaniques découvertes »** : nouvel onglet **Progression › Mécaniques** (aussi depuis la carte de la fiche) : les mécaniques vues, par famille, avec leur explication, ✓ pour celles rencontrées en course, un bouton vers la leçon de l'Académie qui les enseigne ; celles qu'on n'a pas encore vues restent cachées (une ligne « N à découvrir » par famille).
  - **Profil** : champ `mech` = `{ mécanique: 1 (vue) | 2 (rencontrée en course ou apprise à l'Académie) }`. **Fusion entre appareils = union**, niveau au maximum (commutative, associative, idempotente ; les identifiants inconnus d'une version plus récente sont gardés) ; le champ est exporté tel quel avec le reste du profil (« Exporter mes données », code joueur). **Migration d'un profil existant sans perte** : au premier passage, ce que le joueur a déjà rencontré dans la carrière (circuits ayant un record local) est marqué appris : il ne revoit pas de carte pour ce qu'il connaît depuis longtemps ; aucune autre donnée n'est touchée.
- **Académie (COMPLETE-008)** — `js/academyMech.js` : **huit leçons par mécanique**, à part des six d'origine (qui ne changent pas, ni leur diplôme de 60 ◆) : gravité et inversion, murs/looping/plafond, eau et bateau, deltaplane, verre fragile, aimant, obstacles animés, portes logiques (+20 ◆ la première fois, comme les autres, sans bonus de diplôme ; réussites dans `profile.academy`, déjà réunies à la fusion). Chaque leçon est un circuit scripté **hors des 84 officiels** (aucune clé `b-`, pas dans la fermeture du serveur : `js/verify.js` n'importe ni `academy.js` ni `academyMech.js`). Jouer une leçon marque ses mécaniques comme rencontrées.
  - **Chaque leçon est démontrée réussissable ET non triviale** (`tools/test-academy.mjs`, mêmes statistiques que la course en direct : `RunStats` et `goalMet`) : le pilote automatique atteint l'objectif sans réapparition à 90, 100 et 110 % de sa vitesse (vol de 3,23 s en gravité réduite contre 2,03 s à 100 % ; 5,46 s en deltaplane ; arrivée en bateau ; 0 choc, 0 muret…) ; et sans ce qu'elle enseigne le même pilote échoue (sans zone de gravité : vol trop court ; sans plaque bateau : il coule ; sans deltaplane : le vide n'est pas franchi ; sans aimant : la bosse l'envoie hors de la route ; trop lent : il décroche du mur ; un coup de frein sur le verre : il tombe ; sans la logique : le mur reste fermé). Les obstacles animés dépendent du chrono, que le pilote ne sait pas attendre : le balayage des commandes (départ retenu de 0,25 à 6 s) montre 4 départs sur 24 sans choc, les autres heurtent un obstacle. **Chaque leçon est aussi jouée pour de bon dans Chromium** (le pilote automatique du jeu aux commandes de la vraie course, jusqu'à l'écran « Leçon réussie » ; `tools/test-browser-academie-mecaniques.mjs`).
  - **Nouvel objectif `noshock`** (« Finir sans heurter d'obstacle ») et **compteur `shocks`** dans `RunStats` (un choc contre un obstacle animé ou un bumper ; un compte tant que les contacts se suivent à moins d'une demi-seconde ; jamais défait par un retour au checkpoint) ; objectif propre aux circuits (`circuit: true` : absent des modes libres, `MODE_GOAL_IDS` inchangé).
  - **Deux exercices notés de plus** (`skills.js`, mesurés en rejouant la course, `analysis/drill.js`) : **Vitesse sur le mur** (vitesse moyenne sur le mur : 130, 155, 175 km/h ; calés sur le pilote à 38, 46 et 52 m/s visés : 134, 163 et 184 km/h, et 120 km/h à 34 m/s sans note) et **Obstacles animés** (nombre de chocs : 3 au plus, 1 au plus, aucun ; démontrés par le départ retenu 0,25, 0,75 et 0,5 s : 2, 1 et 0 chocs). La trace d'analyse note désormais les chocs (`shock`). Les deux sont de la compétence « Trajectoire » (aucune compétence ajoutée : les récompenses « toutes les compétences » ne changent pas).
- **Réparation hors périmètre (justifiée)** : la fusion des deux versions de COMPLETE-013 (#107 et #108) laissait `_maybeShowEnding()` dans `app/screens.js`, méthode d'une implémentation non branchée (`js/app/ending.js`) : l'écran des circuits plantait dans le navigateur (`TypeError`). L'appel est retiré (l'ouverture de la conclusion passe déjà par `_maybeCareerEnd`). **Non réparé** : les modules `js/ending.js`, `js/app/ending.js` et `tools/test-browser-fin.mjs` (implémentation en double, non branchée) existent toujours ; `tools/test-contrats.mjs` signale `_careerEndButton` défini dans `careerEnd.js` et `ending.js` (échec déjà présent avant ce travail) : à supprimer par le propriétaire du dépôt.
- **Non fait / limites** : pas de leçon pour les revêtements simples (verglas, accélérateur, rebond, dérive, ralentisseur, vent, tapis, ressort, poudreuse, volant inversé, moteur coupé) : la carte, le rappel et l'index suffisent ; pas de rappel en multijoueur ni à l'Académie ; la compréhension par un vrai nouveau joueur reste à observer (recette manuelle).

## Bêta 0.19.0 — une conclusion à la carrière et des récompenses de niveau jusqu'au 50 (COMPLETE-013, COMPLETE-016)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 ; non modifié), **`NET_VER` reste 5**. Aucune mécanique, aucune clé de circuit, aucun temps de référence ne change ; le garage reste purement visuel (`tools/test-cosmetics-physics.mjs` vert).

- **Fin de carrière (COMPLETE-013)** : la carrière est *complète* quand chacun des 84 circuits officiels a une médaille (au moins bronze). L'écran de fin s'ouvre tout seul **une seule fois** à l'écran des circuits (la date est gardée dans le profil : `careerEnd`), puis se rouvre par un bouton (écran des circuits, Progression › Records). Il montre l'épreuve finale (*Grande Finale*, circuit existant et inchangé, rejouable), un **bilan calculé** d'après les records et le profil locaux (circuits terminés, médailles par palier, objectifs bonus, temps cumulé des meilleurs temps, circuits chronométrés, courses, niveau) et un générique ; aucun appel réseau. Le message « il n'y a plus rien à finir ici » disparaît. Un joueur qui avait déjà fini la carrière voit l'écran une fois au prochain passage. Fusion entre appareils : la date la plus ancienne. Textes fr/en ; animations réduites respectées.
- **Récompenses de niveau (COMPLETE-016)** : une récompense tous les cinq niveaux, du 5 au 50 (avant : 5, 10, 20, 30). Six objets visuels gratuits s'ajoutent : Azur (15), Traînée solaire (25), Rubis (35), Traînée jade (40), Améthyste (45), Prisme (50). Les joueurs déjà au-dessus d'un palier reçoivent les objets manquants au prochain contrôle, sans doublon ni perte.
- **Non fait** : pas de nouveau titre (la liste est dupliquée côté serveur, `set_title`) ; pas de compteur de « records battus » (aucun historique : il serait faux pour les profils existants).

## Bêta 0.18.0 — le fantôme de la médaille suivante et des objectifs bonus liés à ce que chaque circuit enseigne (COMPLETE-009, COMPLETE-012)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 ; non modifié), **`NET_VER` reste 5**. Aucune mécanique du moteur, aucun circuit (code), aucune médaille ne change : l'empreinte de la physique (230 scénarios), les **84 clés `b-`** (`tools/builtin-keys.json`), les temps de référence (`tools/golden-temps.json`), le défi du jour et le tirage des saisons sont identiques au bit près. `autopilot.js` n'est pas modifié.

- **Fantôme de la médaille suivante (COMPLETE-009)** : la course monte le fantôme de la **prochaine médaille à gagner** (bronze → argent → or → cristal ; plus rien une fois le cristal gagné), de la couleur de cette médaille. C'est le pilote automatique, à un **rythme** (`pace`, `js/pace.js`) : option de `GhostRunner`, **absente par défaut** (le fantôme or d'avant, pas à pas à l'identique : `tools/test-fantome-rythme.mjs`). Le rythme n'agit que sur des réglages que le pilote a déjà (limite latérale, marge de braquage, vitesse visée) : 1 = le pilote des médailles, moins = plus calme, plus = poussé.
  - **Rythmes calibrés hors ligne**, par circuit et par médaille (`tools/ghost-rythmes.mjs` → `js/ghostPaces.js`, généré ; contrôlé par `npm test` comme les temps de référence : empreinte du circuit, seuils des médailles, et le fantôme à chaque rythme finit dans son temps **sans réapparition ni choc**). Sur 84 circuits × 4 médailles, **329 fantômes sur 336 finissent à ±3 % du seuil** (la plupart à moins de 0,1 %) ; l'or est le rythme 1.
  - **Le cristal** (0,95 × le pilote) demande de faire mieux que lui : le pilote poussé propre l'atteint à ±3 % sur **81 circuits sur 84** (rythmes de 1,01 à 1,24) ; sur *Archipel* (+4,6 %), *Hélice* (+4,2 %) et *Miroir* (+4,3 %) le meilleur rythme propre reste un peu plus lent que le seuil, et le fantôme est montré sous le nom de cristal (il est à moins de 6 %). Bronze trop lent pour des sauts calés sur une vitesse : *Apesanteur* (−14,6 %), *Plateaux* (−10,3 %), *Monte-charge* (−8,7 %) ; le fantôme montré alors est celui d'argent (`ghostTarget`, tolérance 6 %).
  - **Fantôme or conservé** : réglage *Quel fantôme de médaille* (Paramètres › Jeu) : « La prochaine médaille à gagner » (défaut) ou « Toujours l'or » (le fantôme or d'avant, même une fois l'or gagné) ; la case *Fantôme de médaille* l'éteint ; la puce de la fiche est nommée comme la médaille visée (« Fantôme bronze »…). Hors table (défi du jour : seuils et circuit du jour) : comme avant, le fantôme or tant que l'or n'est pas gagné. **Aucun fantôme sans ligne de course** (`track.path`) : circuits de joueurs, de la communauté et de l'éditeur, comme le fantôme or d'avant.
  - **Aucun effet de bord** : seconde simulation indépendante, rien n'est écrit ni envoyé (records, classements, rejeu, télémétrie, expérience) ; `tools/test-live-replay.mjs` court la même course avec puis sans fantôme dans Chromium : mêmes commandes, même temps, même record.
- **Objectifs bonus variés (COMPLETE-012)** : 29 des 72 objectifs d'origine étaient « sans réapparition » (32 sur 84 avant ce changement), 17 « sans toucher de muret ». Quatre nouveaux types, mesurés par les **statistiques de course** (`js/runStats.js`, un seul code pour la course en direct et les outils) :
  - `air` — un seul vol d'au moins *t* s sans toucher le sol ; `speed` — atteindre *v* km/h ; `section` — la section entre deux points de passage (départ, checkpoints, passages de ligne, arrivée) sous *t* s ; `turbo` avec section (`a`, `b`) — *n* mini-turbos **dans** cette section. Un retour au checkpoint annule ce qui a été compté après lui (vols, vitesses, mini-turbos, réceptions, anneaux) ; les chocs et les réapparitions restent comptés.
  - **43 circuits changent d'objectif** (11 vitesses sur les circuits de vitesse et grands huit, 4 vols sur ceux à sauts, 15 sections, 13 mini-turbos en section sur les circuits techniques) ; les 41 autres gardent le leur. Répartition : *moins de t s* 23, sections 15, mini-turbos 14, vitesse 11, réceptions 4, anneaux 4, vols 4, sans muret 4, véhicule 3, sans réapparition 2.
  - **Chaque objectif est prouvé réalisable** (`tools/objectifs.mjs`, `tools/test-objectifs.mjs`) : course finie sans choc ni réapparition qui le remplit, au pilote automatique, ou — pour les mini-turbos, que le pilote ne fait pas — avec le **geste du mini-turbo** de l'Académie greffé sur lui (réglages dans `tools/objectifs-recettes.json`, cherchés par balayage). Seuils : à 85 % du vol, 96 % de la vitesse, 104 % du temps de section de cette course. Le test vérifie aussi que la course en direct (Chromium) et son rejeu serveur comptent les mêmes statistiques, retours au checkpoint compris.
  - **Le test qui décide du périmètre** : changer le `goal` d'un circuit **ne change pas sa clé `b-`** (la clé est l'empreinte de `encode()`, qui n'a pas l'objectif) : 84 circuits × 6 objectifs, `tools/test-objectifs.mjs`. Les objectifs des circuits existants peuvent donc changer sans toucher à un record, une médaille ou un classement.
  - **Profils et récompenses** : un objectif reste un drapeau par circuit (`clé#goal`), sans changement du modèle de progression ni migration : 50 pièces **une seule fois** ; la fusion des profils réunit les objectifs (union). **Conséquence connue** : un joueur qui avait réussi l'ancien objectif d'un des 43 circuits garde son étoile (✓) devant le nouvel objectif, sans l'avoir fait ; personne ne perd rien, rien n'est payé deux fois.
  - **Modes de jeu libres** : les types propres aux circuits (vol, vitesse, section) ne sont ni proposés ni acceptés (`sanitizeGoal`, `MODE_GOAL_IDS`) ; les anciens objectifs de mode sont inchangés. **Non fait** : « prendre la bifurcation difficile » (objectif sur la route prise) : il faudrait un pilote automatique par branche ; voir le rapport.
- **Textes traduits** : étiquettes des objectifs, réglage et puces du fantôme. README, `docs/comprendre/03-course.md`, `docs/MODULES.md`, fiche d'essai, wiki, `sw.js` et fonction serveur régénérés (`replay.js` : l'option `pace`, inactive côté serveur).
- **Tests** : `test-fantome-rythme` (le rythme absent reproduit l'ancien fantôme or pas à pas), `test-fantome-medaille` (table à jour, choix de la médaille, fantôme monté par la course, sans circuit à ligne de course : aucun, aucun effet sur un record), `test-objectifs` (mesures exactes, 84 objectifs réalisables, variété, clé inchangée, récompense unique, modes), `test-live-replay` (fantôme sans effet sur le record ; statistiques en direct = rejeu), `test-i18n` (84 objectifs traduits).

## Bêta 0.17.0 — deux chapitres bonus de douze circuits qui exploitent ce que la carrière n'employait pas ; pool des saisons figé (COMPLETE-002, COMPLETE-011, TRANS-12, TRANS-14)

**`PHYS_VER` reste 39** : aucune mécanique du moteur n'est modifiée ; les **206 scénarios** de l'empreinte d'avant sont identiques au bit près, **24 scénarios s'ajoutent** (pilote automatique et commandes pseudo-aléatoires sur chaque nouveau circuit : 230). **`NET_VER` reste 5.** **Aucun circuit officiel n'est modifié** : les 72 clés `b-`, leurs temps de référence, leurs médailles et leur rang dans la carrière sont ceux d'avant (fichiers dorés : `tools/builtin-keys.json`, `tools/golden-temps.json`, corpus `tools/compat/corpus.json` : 12 clés ajoutées, rien d'autre ne change). **La fonction serveur `submit-score` est régénérée** (`tracks.js`, `track.js` et `seasons.js` sont dans sa fermeture) : **à redéployer** par le pipeline, en même temps que le site. Aucune étape SQL.

- **Douze circuits officiels ajoutés**, rangés après l'Atelier (rangs 73 à 84), en deux chapitres bonus qui ne sont pas un décor (champ `chapitre`, `EXTRA_CHAPTERS`) et chacun centré sur UNE mécanique (champ `meca`). Médailles du pilote automatique (or = son temps) ; **à valider en jeu par des joueurs**.
  - **Chapitre 13 · Les Éléments** (s'ouvre avec 4 médailles au chapitre 5, donc en même temps que les chapitres 6 et 7, qui n'avaient aucune nouveauté) : *Clair de Lune* (◆1, respiration : ambiance d'auteur — nuit, brume, musique — et trois déclencheurs), *Manège* (◆1, respiration : trois tours d'une boucle courte), *Averse* (◆2 : pluie qui forcit et faiblit, flaques), *Bourrasques* (◆3 : vent et rafales), *Nuit de Givre* (◆3 : plaques de givre), *Ressorts* (◆4 : ressorts latéraux et plaques de gravité).
  - **Chapitre 14 · Grandes Manœuvres** (s'ouvre avec 4 médailles au chapitre 9, donc en même temps que le chapitre 10) : *Balade à Moto* (◆1, respiration : un tronçon en moto), *Interrupteurs* (◆2 : portes et interrupteurs par la logique du circuit — la porte s'ouvre à l'interrupteur, se referme au checkpoint, un pont apparaît), *Plateaux Mobiles* (◆3 : deux ascenseurs et deux glissières), *Relais* (◆3 : moto, bateau, deltaplane), *Aiguillage* (◆4 : bifurcation « l'eau en bateau » contre « la route en voiture » ; le véhicule est une décision : 46,3 s par l'eau, 48,0 s par la route pour le pilote ; l'objectif bonus demande l'eau), *Grande Finale* (◆5 : pluie, moto, pièces mobiles, porte et pont).
  - Premières apparitions dans la carrière : la logique de circuit, les groupes, la pluie, le givre, les rafales, le vent de circuit, les ambiances d'auteur, les déclencheurs, le revêtement « ressort ». Circuits à plusieurs tours : 3 (au lieu de 2) ; circuits à pièces mobiles : 4 (au lieu de 1). Objectifs bonus variés (moins de N s, sans muret, sans réapparition, deux réceptions parfaites).
  - Chaque circuit passe le contrat (`tools/contract.mjs`) : fini par le pilote automatique sans réapparition ni choc, à ±10 % de vitesse, repartir à l'arrêt de chaque checkpoint, **30 s au plus entre deux points de retour** (écart maximal : de 12,1 à 24,2 s), médailles du pilote, objectif réalisable, partage identique, vérificateur de l'éditeur sans alerte. Pièces mobiles calées par recherche : le pilote passe de 75 à 115 % de sa vitesse.
- **Pool des saisons figé** (TRANS-12, avant tout ajout) : `seasonTracks(n)` tire dans une liste explicite (`SEASON_POOLS`) et non plus dans « tous les circuits hors Atelier ». **Saisons 1 à 15 : les 66 circuits d'avant** (tirages inchangés, dont les saisons passées 1 et 2, la saison 3 en cours et les douze suivantes). **Saison de bascule : la 16 (lundi 22 février 2027, 00:00 UTC)**, à partir de laquelle le pool comprend aussi les 12 nouveaux circuits ; elle suppose un déploiement au plus tard le 8 février 2027 (sinon, la repousser avant de déployer : `docs/ARCHITECTURE.md`, « Saisons figées »). Le serveur applique la même règle (même module). `tools/saisons-figees.json` : saisons 16 à 67 retirées dans la liste étendue (`--bascule`, refusé si la bascule tombe dans les douze saisons à venir).
- **Constructeur des circuits officiels** (aucun effet sur les 72 : leurs codes sont identiques) : `obst[].g` (groupe d'une porte), `lgZones` (interrupteur : une pièce du chemin rejoint un groupe), `lg` (règles) dans `buildBuiltin` ; instruction `LJR` / `LJL` de `scriptTrack` (la route reprend dans la colonne voisine : saut de voie par ressort latéral).
- **Vérificateur de l'éditeur** : un ressort latéral au bout d'une route, vers une route parallèle du côté où il pousse, est reconnu comme un saut (il était signalé « une extrémité n'est reliée à rien », y compris dans les circuits des joueurs) ; sans ressort, du mauvais côté ou à force 100 %, l'erreur reste.
- **Contrat** : `MECA` vérifie chaque mécanique déclarée (logique, pièces mobiles, pluie, vent, rafales, givre, tours, ressort, gravité, moto, bateau, deltaplane, ambiance, déclencheurs, aiguillage), pour tous les profils.
- **Textes traduits** (noms, descriptions, chapitres). Wiki, fiche d'essai (84 circuits, 14 chapitres), catégories finissables (12 circuits mesurés), `sw.js`, `docs/MODULES.md` régénérés.
- **Tests** : `tools/test-extension.mjs` (nouveau : la mécanique de chaque circuit change la course — sans logique, pas d'arrivée ; ouverture, fermeture et retour au checkpoint des portes ; suite des véhicules ; aiguillage fini par l'eau ET par la route ; ressorts ; environnements, ambiance, déclencheurs, tours ; places et ouverture des chapitres ; saisons) ; `tools/test-browser-extension.mjs` (nouveau, Chromium : les 12 circuits lancés depuis la carrière, joués et finis, portes et pont qui disparaissent et apparaissent dans la scène). Tests qui comptaient « 72 » ou supposaient « un chapitre = un décor » : ils vérifient la même chose sur les 72 d'avant et s'étendent aux 12 nouveaux, sans relâcher une exigence (détail dans le message de commit). Deux tests navigateur (`test-browser`, TECH-016 ; `test-browser-defauts-visibles`, TECH-063) comparaient la scène d'une démonstration du menu à celle d'une autre, tirée au hasard : une démonstration sous la pluie a plus d'objets (libérés à la sortie) ; ils fixent la démonstration sur le premier circuit. Constaté, non corrigé : un circuit à pluie ou à givre tourné dans l'éditeur a ses flaques ailleurs (tirées d'après la grille : `tools/test-piece-rotations.mjs`).

## Bêta 0.16.21 — garde-fous avant d'ajouter du contenu officiel : alias de clés, catégories finissables, espacement des checkpoints, saisons figées (RISK-001, GAME-006, GAME-007, TRANS-12, TRANS-14)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 ; non modifié), **`NET_VER` reste 5**. **Aucun circuit officiel n'est modifié** (décision D-5) : les 72 clés `b-`, les clés `daily-` et le tirage des saisons sont celles d'avant, ce que prouvent les tests dorés ci-dessous. Aucune fonction serveur (le fichier généré de `submit-score` est identique) ni étape SQL ; aucun changement de physique.

- **Alias de clés des circuits officiels (RISK-001)** : `js/builtinKeys.js`, table ancienne clé → nouvelle clé (`BUILTIN_KEY_ALIASES`, **vide** : aucun circuit n'a été modifié), résolution des chaînes et des catégories `~v1…`, et migration au démarrage et après une synchronisation du compte : record et catégories, dernières courses, médaille, objectif bonus et défis de maîtrise sont COPIÉS sous la nouvelle clé (jamais écrasés ; le meilleur temps de médaille `bt` de l'ancienne clé n'est jamais perdu ; rien n'est effacé ; idempotent). `storage.getRecord` retrouve en plus le record de l'ancienne clé quand la nouvelle n'en a pas (médailles et verrous de chapitre compris) ; un fantôme partagé sous une ancienne clé est importé sous la nouvelle. **Ne sont PAS migrés** : les classements en ligne (le serveur ne reconnaît que la clé actuelle ; la nouvelle clé en commence un neuf), les saisons, duels et tournois en cours, les fantômes importés. `tools/builtin-keys.json` (fichier doré des 72 clés, égal au corpus de compatibilité) et `tools/test-cles-officielles.mjs` : toute clé qui diffère échoue en demandant l'entrée d'alias, un circuit retiré échoue. Règle écrite dans `docs/ARCHITECTURE.md` : **on n'ajoute que des circuits, on ne modifie jamais un circuit officiel**. Module client, hors de la fermeture de `verify.js` (testé).
- **Catégories finissables (GAME-006)** : `tools/categories-faisables.mjs` (`npm run categories`) roule le pilote automatique sur chaque circuit × catégorie proposée (449 couples ; cinq vitesses du pilote, 240 s de simulation, 2 réapparitions au plus) et écrit `js/categoriesFaisables.js` (client) ; `tools/check-categories.mjs` (`npm test`) le vérifie à jour. **Mesuré : bateau 3 circuits sur 72, deltaplane 58 sur 72, moto 71 sur 71 ; pluie, profils Arcade et Simulation : 72 sur 72 ; sans obstacles 11 sur 11 ; véhicules v2 6 sur 6.** (L'audit comptait 8 et 36 pour le bateau et le deltaplane : le résultat dépend de la vitesse visée du pilote ; à pleine vitesse seule il finit 27 deltaplanes, avec une vitesse réduite 58.) La fiche marque **« Défi extrême (non finissable par le pilote automatique) »** (texte traduit) les 83 catégories non finies, avec une indication quand on en choisit une ; **aucune catégorie n'est retirée ni rendue non sélectionnable**. Aucune affirmation sans mesure : circuit modifié depuis la mesure, défi du jour et circuits de joueurs ne sont jamais marqués.
- **Espacement des checkpoints (GAME-007)** : `tools/checkpoints-espacement.mjs` (écart maximal et médian par circuit, passages de ligne des tours compris) ; **règle : 30 s au plus entre deux points de retour pour tout nouveau circuit**, ajoutée à `tools/contract.mjs`. Les **26** circuits d'avant la règle qui la dépassent sont des exceptions figées (`tools/checkpoints-exceptions.json`) : ils passent, leur écart ne peut pas grandir, un circuit qui respecte la règle ne peut pas y rester, un nouveau circuit fautif échoue. Chiffres de l'audit retrouvés (Double Hélice 52 s, Cheminée 41,7 s, Récif 41,1 s, Viaduc 41 s, Épave 40,2 s ; médiane 28,6 s à checkpoints seuls). Rapport des huit pires circuits, où un checkpoint aiderait et ce que cela coûterait : `docs/audit/ESPACEMENT-CHECKPOINTS.md` (non appliqué).
- **Saisons (TRANS-12)** : `tools/test-saisons-figees.mjs` fige `seasonTracks(n)` pour les saisons 1 à 67 (passées, en cours, douze suivantes et une année de marge) dans `tools/saisons-figees.json` ; il échoue si un tirage change (ajouter un circuit hors Atelier le changerait : le test le prouve) et demande `--etendre` quand le fichier ne couvre plus les douze saisons à venir. `js/seasons.js` n'est pas modifié ; figer réellement le pool reste à faire.
- **Divers** : `tools/lab.mjs` : `runTrack` renvoie aussi `lapTimes` (passages de ligne). Tests : `test-cles-officielles`, `test-categories`, `test-espacement`, `test-saisons-figees`, un test navigateur de la fiche (étiquette, catégorie encore choisissable) ; `check-categories` rejoint les contrôles de `npm test`.

## Bêta 0.16.20 — essais humains : protocole à jour, outils de mesure et de recalage prêts (COMPLETE-001, mode A)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 ; non modifié), **`NET_VER` reste 5**. Aucun changement de physique, de circuit, de clé ni de médaille ; aucune fonction serveur ni étape SQL. **Aucune donnée d'essai n'était disponible : seul le mode A (préparer la campagne) est fait ; le mode B (recaler les médailles, décision écrite sur le ressenti) attend des données réelles.** Les 72 circuits gardent les médailles du pilote automatique (aucun ne porte `medalsBy: 'humain'`).

- **Protocole** (`docs/ESSAIS.md`, réécrit) : profils et quotas (8 testeurs qui comptent : 3 débutants, 3 habitués ; clavier 3, tactile 2, manette 1 ; Firefox ou Safari et multijoueur à déclarer à la main), minimum de 12 circuits finis en 30 courses par testeur, **parcours imposé** de 6 circuits (◆1 à ◆5, cinq profils : Premiers Éclats, Tremplins du Crépuscule à plaques, Lac Gelé, Racines Boueuses à gravité retournée, Temple, Grand Archipel) puis multijoueur à deux appareils, déroulé, message aux testeurs, **consentement et vie privée** (ce qui part, ce qui ne part pas, retrait, aucune donnée personnelle dans le dépôt), mesures et leur source, calendrier sur deux semaines, règles de lecture du ressenti, gabarit de la décision écrite.
- **Fiche d'essai générée** (`node tools/fiche-essai.mjs`, ne plus la modifier à la main) : fiche du testeur sans nom (un code), parcours, observation des premières minutes, questions de ressenti (celles du formulaire et celles qu'il ne pose pas : accélération, freinage, volant, tenue de route, commandes, gravité, plaques, multijoueur, médailles), cibles ; les 72 circuits comme avant.
- **`tools/essais-protocole.mjs`** (nouveau) : les nombres du protocole en un seul endroit ; couverture (testeurs par profil, parcours essayé), niveau par profil.
- **`tools/essais.mjs`** : section « Le protocole est-il rempli ? » (verdict, qui manque), « Par profil » (expérience, commandes, appareil), avis par commandes (clavier, manette, tactile), nombre de testeurs atteignant chaque médaille avec les médailles actuelles et proposées ; **testeurs T01, T02… et aucun pseudo sans `--pseudos`** (le rapport ne contient plus d'identifiant d'installation) ; `--ecrire` refuse sans les avis, sans protocole rempli, ou si des médailles proposées ne sont pas ordonnées, et **relit les 72 clés `b-` après l'écriture** (`--verifier-cles`).
- **`tools/telemetry-report.mjs`** : abandons (nombre et part), réapparitions par arrivée et par abandon, part des finisseurs qui atteignent bronze, argent, or, cristal.
- **`.gitignore`** : `essais-donnees/` (exports bruts des essais).
- **Tests** : les médailles ne font pas partie des 72 clés `b-` (médailles, objectif et `medalsBy` changés : mêmes clés) ; seuils actuels ordonnés ; parcours vérifié sur le code des circuits (gravité retournée, plaques, difficultés, profils) ; campagne simulée de 8 testeurs (protocole rempli ou non, chaque exigence manquée nommée) ; rapport sans identifiant ni pseudo ; fiche et `ESSAIS.md` identiques à leur génération et d'accord avec le code et le SQL. `sw.js`, qui n'était pas à jour, est régénéré.

## Bêta 0.16.19 — documentation remise d'accord avec le code (DOC-001 à DOC-010)

**`PHYS_VER` reste 39, `NET_VER` reste 5** : aucun changement de comportement, de physique ni de protocole. Aucune fonction serveur (le fichier généré de `submit-score` est identique) ni étape SQL. Seuls changent des textes : `docs/ARCHITECTURE.md`, `docs/TESTS.md`, `README.md`, `supabase/COMPTES.md`, les commentaires de tête de `js/verify.js` et `js/joins.js` (et donc `docs/MODULES.md`, régénéré).

- **Physique** (`DOC-001`) : plus de « la route guide le cap » sur les rubans (retiré en `PHYS_VER` 37) : il faut braquer.
- **Empreinte** (`DOC-002`) : 206 scénarios (le document en annonçait 161 et 182 ; `docs/TESTS.md` 193).
- **Navigateurs et réseau** (`DOC-003`) : Firefox et WebKit sont éprouvés par la tâche CI `moteurs` ; la fonction `ice` fournit STUN + TURN à identifiants limités (aucun relais n'est fourni par le dépôt).
- **Signature** (`DOC-004`), **stockage** (`DOC-006`), **étapes SQL** (`DOC-005` : 21 étapes), **fonction serveur** (`DOC-007` : elle embarque `verify.js`), **joins.js** (`DOC-008` : importé seulement par des tests et outils), **publication** (`DOC-010` : rejouée par la fonction serveur avant `publish_track`). `DOC-009` (`supabase/MULTI.md`) avait été corrigé en 0.16.17.
- **Autres documents** : nombre de tests et durée de `npm test`, tâches de la CI, fichiers générés (les trois fonctions, le wiki), étapes 16 et 18 à 21 et fonction `account-recovery` dans le README, multijoueur (trois modes, identité de salle, `NET_VER` 5), cycle de vie des fichiers `bugConnu` (plus aucun défaut connu), Échap sans effet dans un champ de texte.

## Bêta 0.16.18 — multijoueur : créer et rejoindre un salon refonctionne (politique de sécurité de la page)

**`PHYS_VER` reste 39, `NET_VER` reste 5** : aucun changement de physique ni de protocole. Aucune fonction serveur ni étape SQL.

- **« Connexion au serveur de salons impossible. » à chaque création ou jonction de salon, sur tous les appareils** : la politique de sécurité de la page (`connect-src` d'`index.html`, depuis 0.9.64) n'autorisait le projet Supabase qu'en `https://` ; Chrome n'en déduit pas `wss://`, et le WebSocket de la signalisation (Supabase Realtime) était refusé avant même de partir (aucune trace côté Supabase). Le projet est maintenant cité en `https://` **et** en `wss://`. Les essais à plusieurs onglets passaient par la signalisation locale (`?net=local`) et ne l'avaient jamais vu.
- **Tests** : `tools/test-securite-client.mjs` exige les deux origines ; `tools/test-browser.mjs` ouvre la vraie signalisation sous la vraie politique (aucun refus ; un autre serveur reste refusé). Les deux échouent sur la page d'avant. Essai réel contre le vrai Supabase Realtime (deux pages Chromium) : salon créé, rejoint, liaison WebRTC ouverte des deux côtés.
- Hébergement personnalisé : `README.md`, `js/config.js` et `supabase/MULTI.md` disent de citer son projet en `https://` et en `wss://`.

## Bêta 0.16.17 — multijoueur : voitures distantes qui naissent, vivent et disparaissent avec les joueurs, collisions douces bornées et cohérentes, ressources libérées (TECH-009, TECH-041, TECH-043, TECH-083, TECH-087, TECH-088, TECH-089, LOT-8c)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 ; non modifié : la physique solo, les replays et le déterminisme ne changent pas, les collisions douces ne s'appliquent qu'en championnat). **`NET_VER` reste 5** : aucun format de message ne change (le numéro de séquence départage deux paquets du même pas, il était déjà dans le paquet). Aucune fonction serveur ni étape SQL.

Audit : `TECH-009` (P1, reproduit en jeu : GAME-003), `TECH-041`, `TECH-043`, `TECH-083`, `TECH-087`, `TECH-088`, `TECH-089` ; causes communes `TRANS-06` (voitures distantes jamais recréées) et `TRANS-09` (écouteurs et tampons hors du cycle de vie de leur session). Un commit par identifiant (et par sous-point de TECH-089), après un commit qui reproduit chaque défaut sur le code d'avant.

- **Voitures distantes** (`TECH-009`, `TRANS-06`) : une voiture naît à l'arrivée d'un membre en course ou à son premier paquet, et renaît après un départ suivi d'un retour : un arrivant en pleine course libre est vu de tous (avant : invisible pour ceux qui couraient déjà, et sans collision en championnat).
- **Plus de voiture fantôme collisionnable** (`TECH-043`) : sans paquet depuis 0,5 s, au lien non ouvert ou hors course, une voiture est masquée et sort des collisions (avant : figée à sa dernière place, un mur invisible) ; un joueur revenu au salon disparaît de la piste ; un paquet en retard ne le fait pas réapparaître.
- **Collisions douces bornées et cohérentes** (`TECH-041`) : variation de vitesse due aux collisions d'au plus **2,5 m/s par pas, toutes voitures confondues** (≈ 31 g ; avant : jusqu'à 8,32 m/s par pas et par voiture, 43 m/s en un pas avec sept voitures) ; une impulsion par **contact**, qui suppose que l'autre reçoit la même tant que sa réaction n'est pas visible : l'échange n'est plus doublé (rattrapage 40 → 30 m/s : 33,2 / 36,8 au lieu de 30 / 40 ; face-à-face 2 × 20 m/s : rebond de ± 7 au lieu de ± 22) ; impulsion d'un contact ≤ 30 m/s ; vitesses annoncées aberrantes (au-delà de 150 m/s, ou sans rapport avec le déplacement) rejetées (paquets forgés : 465 m/s avant, 0 après). Un face-à-face à pleine vitesse (2 × 50 m/s) traverse en perdant la même vitesse de part et d'autre, au lieu de renvoyer les voitures. `supabase/MULTI.md` dit les vrais plafonds (il annonçait « ~4 g ») et les trois modes de salon.
- **Ressources** (`TRANS-09`) : les écouteurs du salon sont retirés à la fermeture de sa fenêtre, quelle qu'elle soit (`TECH-083` : 5 de plus à chaque ouverture par Échap ou départ) ; le tampon d'interpolation est purgé à chaque paquet (`TECH-087` : onglet masqué 10 min, 12 000 paquets gardés avant, 32 après).
- **Voitures identiques** (`TECH-088`) : la règle vaut aussi pour les voitures distantes.
- **Défauts mineurs** (`TECH-089`) : (a) une téléportation envoyée au même pas que le paquet périodique n'est plus jetée ; (b) la grille est visible pendant le décompte (chacun envoie son état avant le GO) ; (c) circuit sans ligne centrale : l'avancement du classement en direct suit le tronçon en cours (avant : 0 % sans checkpoint) ; (d) un circuit plus long à charger que le délai de départ donne un décompte de 3 s au lieu d'un GO immédiat ; (e) débit des messages fiables borné (120 d'un coup, puis 40 par seconde : un flot de « finish » ne reconstruit plus le classement 2 000 fois) ; (f) **démontré sur le banc** : l'offre d'un joueur qui revient, arrivée avant sa présence, était perdue et la liaison attendait la renégociation (12 s) ; elle est maintenant gardée 5 s, sans rien ouvrir, et rejouée quand il redevient membre.
- **Tests** : `tools/test-net.mjs` (banc simulé et salle factice) : chaque défaut reproduit (`bugConnu`) puis devenu test de régression ; `tools/test-browser.mjs` : écouteurs du salon stables sur 10 ouvertures et fermetures ; deux onglets (vrai WebRTC) : grille visible au décompte, décompte après un chargement trop long, joueur revenu au salon qui disparaît. Des mutations (réaction de l'autre non prédite, plafond global retiré, décompte non rallongé) font échouer ces tests. **Non éprouvé** : le ressenti des collisions et le seuil de 0,5 s sur de vraies machines et de vrais réseaux (liste dans `supabase/MULTI.md`).

## Bêta 0.16.16 — multijoueur : une salle qui survit à l'absence de l'hôte, identité et rôle d'hôte qu'un client modifié ne peut pas usurper, vie privée documentée (TECH-010, TECH-040, TECH-051, LOT-8d)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 ; non modifié). **`NET_VER` reste 5** : cette phase change le protocole (poignée de main d'identité, ordre d'arrivée, descriptions signées), mais la 0.16.15 avait déjà porté `NET_VER` de 4 à 5 sans avoir été publiée (branche de travail) ; selon la règle commune on ne le réincrémente pas. **À faire avant toute publication qui laisserait en jeu des joueurs en 0.16.15** : réincrémenter, sinon ils ne répondent pas au défi d'identité et restent « en connexion… ». Aucune fonction serveur ni étape SQL.

Modèle de menaces écrit d'abord : [docs/MENACES-MULTIJOUEUR.md](docs/MENACES-MULTIJOUEUR.md) (ce qu'un pair à pair peut et ne peut pas garantir). Décision D-3 : secret de reprise, membres seuls, autorité d'hôte non déclarable ; canaux privés et relais côté serveur **hors périmètre**. Un pair à pair n'est pas inviolable : voir « ce qui reste exposé » ci-dessous.

- **Identité par un secret de reprise** (`TECH-040`, `TRANS-06`) : à son arrivée chaque joueur tire une clé ECDSA P-256 (API Web Crypto, aucune cryptographie maison, aucune dépendance) ; la clé privée **ne quitte jamais le navigateur** (ni présence, ni message, ni journal, ni DOM : vérifié) ; seul son **engagement** (empreinte SHA-256 de la clé publique) est publié. Chaque liaison ouverte passe par une **poignée de main** : défi aléatoire, puis signature liée au code de la salle, aux deux identifiants et **aux deux empreintes DTLS de la liaison** : elle ne se rejoue ni ailleurs ni plus tard, et un intermédiaire ne peut pas la produire. Comparaison de l'engagement à temps constant, engagement épinglé à la première preuve. Offres, réponses **et candidats ICE** WebRTC signés : la négociation lancée au nom d'un autre est écartée avant d'ouvrir une liaison (les candidats non signés d'un imposteur suffisaient, en essai, à bloquer la liaison du vrai joueur). Une place gardée n'est rendue qu'à celui qui présente le secret : un client modifié qui prend l'identifiant d'un joueur coupé n'obtient ni liaison ni arrivées. L'ancien jeton aléatoire (envoyé dans la présence) disparaît ; l'onglet garde `{ identifiant, clé }` en `sessionStorage` (valable 20 s, renouvelé toutes les 5 s tant que la salle est ouverte : avant, il expirait 20 s après le dernier événement, donc dans un salon calme).
- **Autorité d'hôte non déclarable** (`TECH-010`, `TECH-040`, `TRANS-16`) : l'hôte n'est plus celui que la présence dit (`host: true`, plus petit identifiant) mais **le premier présent de l'ordre d'arrivée**, tenu par l'hôte et envoyé à chacun (`order`, `hostover`) ; chaque membre le recalcule et n'en croit un que de l'hôte qu'il connaît et s'il ne devance personne dont il garde la place. Un arrivant croit la **majorité** des membres vérifiés. Le drapeau de présence n'est plus qu'une indication.
- **Une salle qui survit à l'absence de l'hôte** (`TECH-010`) : dès que la liaison de l'hôte est tombée depuis 6 s (la présence d'une connexion morte reste jusqu'à 30 s côté serveur), le suivant de l'ordre fait l'intérim : il se marque hôte (drapeau republié), annonce `hostover`, **clôt les manches à temps** (état du championnat repris de chacun, comme en 0.16.15) ; la salle reste **rejoignable** (elle existe tant que quelqu'un y est : plus de « Salle introuvable » ni de salle fermée pour toujours) ; l'hôte qui recharge sa page **retrouve son rôle** avec son secret, après avoir reçu l'état de la salle ; un retour qui ne s'est pas relié ne remet plus à zéro le délai d'absence (+20 s à chaque essai avant).
- **Vie privée dite honnêtement** (`TECH-051`) : la page Confidentialité (français et anglais) explique que les offres et candidats WebRTC, qui contiennent les adresses IP, passent par un canal Realtime **public** dont le nom est le code de la salle : tout abonné les lit **sans figurer parmi les joueurs**, et le code d'un salon public est listé ; aucun chiffrement ni salle privée n'est promis (chiffrer avec le code serait sans objet : il est le nom du canal). **Ce qui reste exposé** : les adresses IP aux joueurs de la salle et aux abonnés du canal ; seul un canal privé (hors périmètre) le changerait. **Limite constatée en essai** : un abonné du canal lit les offres destinées à un joueur et peut y répondre pour **empêcher** l'ouverture de sa liaison (déni de service) ; il ne peut ni prendre sa place, ni son rôle, ni faire compter un temps (voir `supabase/MULTI.md`). Documenté aussi dans `supabase/MULTI.md`.
- **Tests** : chaque défaut a d'abord été reproduit (`bugConnu`) sur le code d'avant, puis est devenu test de régression : hôte coupé moins de 20 s (avec ou sans présence fantôme), hôte qui recharge, retour non relié, successeur sans drapeau, client modifié annonçant `host: true`, place d'un absent prise sans secret ; ajoutés : preuve rejouée (autre liaison, seconde fois, autre salle), descriptions signées, ordre usurpé, majorité de l'arrivant, deux salons simultanés, hôte qui recharge en pleine manche, page Confidentialité ; **Chromium, trois onglets, vrai WebRTC et vrai Web Crypto** : l'hôte recharge sa page, l'invitée fait l'intérim, un imposteur est refusé, l'hôte reprend la main. Des mutations (ordre cru de tous, premier avis cru, drapeau décisif, grâce de présence infinie) font échouer ces tests. **Non éprouvé** : de vraies machines sur des réseaux différents et le vrai Realtime (liste dans `supabase/MULTI.md`).

## Bêta 0.16.15 — multijoueur : époque de lancement, état de la salle dérivé de l'hôte, résultats de manche qui convergent (TRANS-05, LOT-8a)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 depuis plusieurs versions ; il n'est pas modifié) ; **`NET_VER` passe à 5** (changement de protocole : le précédent changement de phase, 0.16.14, l'avait laissé à 4) : un joueur 0.16.14 et un joueur 0.16.15 ne se retrouvent pas dans la même salle ; le plus ancien est refusé à l'entrée avec « Version du jeu différente de celle de l'hôte : recharge la page. », et un membre d'une autre version est marqué « autre version ». Aucune fonction serveur ni étape SQL ; aucune clé de classement, aucun code de circuit ne change.

Audit : `TECH-008` (P1, reproduit en jeu : GAME-002), `TECH-042`, `TECH-047`, `TECH-048`, `TECH-049`, `TECH-084`, `TECH-085`, `GAME-008` ; causes communes `TRANS-05` (messages sans numéro de lancement) et `TRANS-08` (réponses asynchrones tardives). Un commit par identifiant, après un commit qui reproduit chaque défaut sur le code d'avant.

- **Époque de lancement** (`TRANS-05`) : chaque lancement de l'hôte (course libre, championnat, « Course », revanche) a un numéro croissant ; `start`, `track`, `cup`, `round`, `rend`, `cupstop`, `finish` et `hello` le portent ; un message d'une autre époque est ignoré, un même lancement ne relance jamais.
- **Choisir un circuit ne lance plus personne** (`TECH-008`) : `track` ne fait que changer le circuit affiché ; le départ est toujours un `start` explicite. L'état « course déjà lancée » (`started`), jamais remis à zéro, est supprimé : l'hôte annonce sa course libre **réellement en cours** (`live`). Un arrivant qui ne l'a jamais courue y entre (décompte de 1,5 s, comme avant) ; quand l'hôte est au salon, personne n'est lancé ; un joueur revenu au salon n'y est plus renvoyé et peut la rejoindre (« Rejoindre la course »). Vrai après un retour au salon, après « Arrêter le championnat » et après une course unique.
- **Arrivées créditées au bon lancement** (`TECH-042`) : `finish` porte son époque et son circuit ; une arrivée en vol pendant un changement de circuit, ou celle de l'ancienne course encore à l'écran pendant le chargement de la suivante, ne compte plus pour le nouveau circuit ; un arrivant garde les meilleurs temps reçus avant l'état de l'hôte.
- **Joueur revenu après la clôture d'une manche** (`TECH-047`) : l'état reçu de l'hôte fait avancer sa phase : sa course s'arrête, il voit les résultats de SA manche ; si la manche suivante est déjà partie sans lui, il la suit (« Manche k/N en cours : tu joueras la suivante ») et court celle d'après.
- **Migration d'hôte après une clôture manquée** (`TECH-048`) : une manche rangée ne fait que s'enrichir (union des arrivées, un temps connu n'est jamais remplacé) ; un joueur qui en sait plus que l'hôte lui envoie son état (`cupsync` : à l'annonce d'un nouvel hôte, quand il voit l'hôte changer, quand il reçoit un résultat plus pauvre) ; l'hôte reprend l'état le plus complet et le renvoie à tous : classements identiques chez tous, arrivants compris. Un nouvel hôte qui relance une manche déjà partie ne refait partir personne.
- **Deux départs rapprochés** (`TECH-049`, `TRANS-08`) : seul le dernier demandé est lancé ; le chargement d'un circuit lent, ou d'un lancement remplacé entre-temps, est abandonné (son échec ne ramène personne au salon).
- **Arrivée en attente** (`TECH-084`) : liée à son championnat et à sa manche ; effacée à l'arrêt, à « Relancer » et à tout nouveau lancement ; jamais rejouée ailleurs.
- **Classement général** (`TECH-085`) : seulement les joueurs de la grille (un membre qui n'a jamais couru n'est ni nommé ni classé) ; départage par **moyenne** des places (et non plus la somme, qui avantageait qui avait joué moins de manches) : règle documentée dans `js/net/championship.js` et `supabase/MULTI.md`.
- **Arrivant pendant une « Course »** (`GAME-008`) : il voit le circuit et « Manche en cours : tu joueras la suivante » ; après la course, le circuit reste affiché.
- Textes nouveaux traduits (« Rejoindre la course », « Manche en cours : tu joueras la suivante. », « Manche k/N … en cours : tu joueras la suivante. »).
- Tests : `tools/test-manche.mjs` et `tools/test-net.mjs` : chaque défaut reproduit (`bugConnu`) sur le code d'avant puis devenu test de régression, plus des témoins (arrivant pendant une vraie course, arrivée en attente bien renvoyée dans le même championnat, réponse perdue à la migration, fusion des résultats dans n'importe quel ordre, départ de manche en double). Tests adaptés au nouveau format de message (époque, `live` au lieu de `track` avec `started`), avec les mêmes propriétés ; l'attente « l'arrivant figure au classement avec 0 point avant d'avoir couru » (le défaut TECH-085) devient « il n'y figure pas, puis il y entre avec ses seuls points ». `tools/test-browser.mjs` : essai à **trois onglets** (vrai WebRTC) : choisir un circuit ne lance personne après un retour au salon, un arrêt de championnat et une course unique ; une arrivante pendant une « Course » voit le circuit et le message. **Non éprouvé** : de vraies machines sur des réseaux différents (liste dans `supabase/MULTI.md`, « Époque de lancement », « À vérifier sur de vraies machines »).

## Bêta 0.16.14 — multijoueur : présence par connexion, pertes détectées, liaisons de jeu découplées de la signalisation (TRANS-06, LOT-8b)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 depuis plusieurs versions ; il n'est pas modifié) ; **`NET_VER` reste 4** : aucun format de message ne change (signalisation, présence, messages du salon, paquets). Aucune fonction serveur ni étape SQL ; aucune clé de classement, aucun code de circuit ne change. Un joueur 0.16.13 et un joueur 0.16.14 jouent ensemble.

Audit : `TECH-011` (P1), `TECH-012` (P1), `TECH-044`, `TECH-045`, `TECH-046`, `TECH-050`, `TECH-082`, `TECH-086` ; cause commune `TRANS-06` (présence et connexion Realtime gérées de façon simplifiée). Un commit par identifiant, après un commit qui reproduit chaque défaut sur le code d'avant.

- **Présence par connexion** (`TECH-011`) : comme le client Phoenix officiel, une entrée par connexion (`phx_ref`) ; un joueur reste présent tant qu'une de ses connexions l'est. Une reconnexion arrivée avant que le serveur ferme l'ancienne connexion, ou un onglet dupliqué, ne le fait plus retirer au bout de 20 s.
- **Pertes détectées** (`TECH-012`) : `phx_close`, `phx_error`, un message `system` d'erreur (jeton expiré) et un battement resté 10 s sans réponse ferment la connexion et lancent la reconnexion. Le **jeton du canal est renouvelé** (`access_token`) avant son échéance ; il n'apparaît dans aucun journal.
- **Tentatives abandonnées fermées** (`TECH-044`) : délai dépassé, refus, fermeture ou départ pendant la jonction : la connexion est fermée ; une réponse tardive ne publie plus de présence fantôme et ne bat plus. Même règle pour la reconnexion et l'annuaire. **Salon public retiré pendant l'annonce** (`TECH-082`) : rien n'est listé, aucune erreur affichée.
- **Signalisation des seuls membres** (`TECH-045`) : un message d'un identifiant inventé, ou un candidat ICE tardif d'un joueur parti, n'ouvre plus de liaison (sept messages suffisaient à remplir la salle) ; une liaison sans membre est fermée.
- **Liaisons de jeu découplées** (`TECH-046`) : une coupure de la signalisation ne ferme plus les liaisons WebRTC : les voitures ne se figent plus, les arrivées passent. Une liaison n'est refaite que si elle tombe vraiment (canal fermé, ou 10 s de silence malgré les pings), à neuf, des deux côtés ; les arrivées de course libre non reçues sont renvoyées à la réouverture. Reconnexion à délais croissants bornés, tant qu'une liaison est ouverte ; sans aucune, abandon au-delà des 20 s de place gardée (inchangé). L'hôte conduit la manche tant qu'il a des liaisons ouvertes.
- **Serveurs ICE à jour** (`TECH-050`) : redemandés à chaque connexion neuve et avant une relance ICE (le chargeur ne refait la requête qu'aux 3/4 de leur durée) : un arrivant tardif ou une reconnexion n'utilise plus des identifiants TURN expirés. L'ouverture de la salle n'attend plus ces serveurs.
- **Capacité** (`TECH-086`) : 8 joueurs places gardées comprises : les membres refusent un 9e tant qu'un absent garde sa place, et l'admettent dès qu'elle est rendue. Limite : le 9e n'en est pas averti par un message (il faudrait `NET_VER` 5) ; il voit les joueurs « en connexion ».
- Textes nouveaux traduits (« Connexion annulée. », « Connexion impossible. »).
- Tests : **banc simulé** `tools/fake-realtime.mjs` (horloge virtuelle, faux serveur Realtime à présence par connexion et pannes scriptables, faux WebRTC) ; `tools/test-net.mjs` : chaque défaut reproduit (`bugConnu`) sur le code d'avant puis devenu test de régression, plus la signalisation absente 40 s, l'abandon sans liaison, la relance ICE, l'admission du 9e. `tools/test-manche.mjs` : signalisation de l'hôte coupée en pleine manche ; le faux réseau `lan()` ferme aussi les liaisons lors d'une vraie coupure (c'est désormais la chute de la liaison, et non celle de l'annuaire, qui met une place en attente). `tools/test-browser.mjs` (deux onglets, vrai WebRTC) : coupure de la signalisation seule (même connexion, paquets qui continuent d'arriver, personne d'absent) puis vraie coupure (place gardée, liaison refaite). Le faux WebSocket du test « rejoindre » répond désormais aux battements, comme un vrai serveur. **Non observé** : le vrai Supabase Realtime (ordre des messages de présence, délai de retrait d'une connexion morte, forme du message d'expiration) et le WebRTC entre deux machines : procédure dans `supabase/MULTI.md`, « À vérifier sur le vrai Realtime ».

## Bêta 0.16.13 — changer son mot de passe et récupérer un compte avec un code de secours (COMPLETE-003)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 depuis plusieurs versions ; il n'est pas modifié) : aucune physique, aucune clé de classement, aucun code de circuit ne change ; la fonction `submit-score` et la fermeture de `js/verify.js` sont **inchangées** (`npm run build:function` redonne `submit-score/index.ts` et `ice/index.ts` à l'identique). **Étape SQL 21** (`supabase/etape21-recuperation.sql`, à lancer **à la main**, relançable, ne supprime rien) et **nouvelle fonction serveur `account-recovery`** : ordre **SQL → fonction → site** (`supabase/MIGRATIONS.md`, « Étape 21 » ; `supabase/COMPTES.md`). **Rien de cela n'a été exécuté sur la production.** Le jeu 0.16.13 fonctionne sans l'étape ni la fonction : le code de secours est alors simplement absent.

Audit : `COMPLETE-003` (P1). Un mot de passe oublié coûtait le compte et sa sauvegarde en ligne ; la récupération par courriel de Supabase est impossible (le pseudo n'est pas une adresse). Décision D-6 : pas de courriel.

- **Changer son mot de passe** (Garage › Compte) : le mot de passe actuel est redemandé (connexion de preuve jugée par Supabase Auth), le nouveau suit les règles de l'inscription (désormais dans `js/accountRules.js`, pur, partagé avec la fonction serveur) ; les autres appareils sont déconnectés.
- **Code de secours** : 16 signes (80 bits, `gen_random_bytes`), `XXXX-XXXX-XXXX-XXXX`, montré **une seule fois** à l'inscription (case « J'ai noté mon code » exigée) et régénérable (mot de passe redemandé ; l'ancien ne vaut plus rien). **Jamais stocké en clair** : la base garde `bcrypt(SHA-256(code))` (pgcrypto, sel par code, contrainte qui refuse tout autre format) ; le code n'est jamais un paramètre SQL ; il n'est écrit ni dans le stockage de l'appareil ni dans un journal. Créer ou régénérer exige une authentification par mot de passe de moins de 10 minutes (revendication `amr`) : une session volée ne suffit pas.
- **Récupération** (accueil › Connexion › « J'ai perdu mon mot de passe », sans session) : pseudo + code + nouveau mot de passe. Fonction `account-recovery` : usage unique, réservation de 2 minutes, mot de passe posé par l'API d'administration d'Auth, **sessions du compte révoquées**, nouveau code remis. **Réponse d'échec UNIQUE** (statut, corps, en-têtes, durée plancher de 1,5 s) pour pseudo inconnu, compte sans code, mauvais code, pseudo verrouillé, code mal formé : pas d'énumération de pseudos. Limites **en base** (un rechargement ne les remet pas à zéro) : 5 échecs par pseudo saisi → 15 min, 20 par adresse et par heure, 300 essais par 10 min en tout ; taille de requête 2 Ko ; base indisponible : 503, jamais « ouvert ». Aucun code, mot de passe, pseudo ni adresse dans les journaux.
- **Comptes existants** : l'écran Garage › Compte propose de créer un code quand il manque (bloc d'avertissement), sans jamais bloquer le jeu ; rien n'est montré si le serveur n'a pas l'étape 21 ou hors ligne.
- **Déploiement** : `account-recovery` est construite (`npm run build:function`, empreinte de build), comparée par `tools/check-deployed.mjs` (la barrière refuse une fonction périmée ou absente), déployée par `deploiement.yml` avant la barrière (« Verify JWT » reste activé : le workflow n'ajoute jamais `--no-verify-jwt`), et contrôlée par la CI.
- **Un refus 429** dont le message est « Trop de demandes » garde désormais le délai annoncé par le serveur (`js/online.js`, `explain1`) ; avant, ce message était classé « social » et le délai était perdu.
- Anglais complet (accueil, écran du code, fenêtres du compte, messages du client et de la fonction).
- Tests : nouveaux `tools/test-etape21-sql.sh` (PostgreSQL réel : 46 contrôles + sessions simultanées, `npm run test:sql`), `tools/test-recovery-handler.mjs` (28 : modèle de menaces ligne à ligne, dont des mutations du gestionnaire détectées), `tools/test-recuperation-client.mjs` (21), `tools/test-browser-recuperation.mjs` (Chromium, `npm run test:browser`) ; étendus `test-securite-sql.sh` (rejoue les attaques après l'étape 21), `test-accounts-sql.sh`, `test-barriere`, `test-build-stamp`, `fake-supabase`. **Non éprouvé** : la vraie base Supabase, la vraie fonction déployée, le comportement réel de GoTrue (revendication `amr`, API d'administration, révocation des sessions) : liste de vérifications dans `supabase/COMPTES.md`, « À vérifier sur un VRAI projet ».

## Bêta 0.16.12 — lire n'est plus agir, droits de colonne suivis, règles du jeu et de la base alignées (TRANS-10, LOT-7)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 depuis plusieurs versions ; il n'est pas modifié) : aucune physique, aucune clé de classement, aucun code de circuit ne change. **Étape SQL 20** (`supabase/etape20-droits-et-regles.sql`, relançable, aucune donnée supprimée) à appliquer **À LA MAIN** par le propriétaire, puis `verify-prod.sql` ; **la fonction `submit-score` doit être redéployée** (`js/verify.js` change : TECH-079, build reconstruit). **Rien n'a été exécuté en production** : voir `supabase/MIGRATIONS.md` (« Étape 20 », ordre d'application et vérifications attendues). Le jeu fonctionne AVEC ou SANS l'étape 20.

Audit : `TECH-021`, `TECH-031`, `TECH-032`, `TECH-076`, `TECH-079`, `TECH-080` (a à e), `TECH-081` ; cause commune `TRANS-10` (règles dupliquées entre le jeu et la base, droits de colonne qui ne suivent pas).

- **Classement mondial** (`TECH-021`) : la colonne `scores.ghost_veh`, demandée par le jeu depuis l'étape 7, n'était accordée en lecture par aucune étape : refus de PostgreSQL, deux requêtes perdues, repli sans boutons 👻, titres ni véhicule. L'étape 20 l'accorde (UNE colonne ; `inputs` et `ghost` restent illisibles) ; le jeu lit le classement avec ou sans ce droit (la colonne que PostgreSQL nomme est retirée, au plus trois relectures ; une autre erreur remonte au lieu d'être avalée). `verify-prod.sql` contrôle la **lisibilité** (`has_column_privilege`), les tests SQL exécutent les lectures du jeu pour de bon sous les rôles `anon` et `authenticated`.
- **Lire ne crée plus de joueur anonyme** (`TECH-031`) : classement, communauté, tendances, fantômes, secteurs, saisons, commentaires, playlists, modes et statistiques se lisent avec la clé publique seule (ou la session déjà présente : « ma place », mes « j'aime ») ; la session anonyme n'est créée que par une action. Un jeton refusé ne fabrique plus de nouvel invité pour lire. Liste des fonctions lues sans session : `PUBLIC_RPC`, comparée à la base par `tools/test-securite-sql.sh`.
- **Export des données** (`TECH-032`) : la table des temps est lue par **colonnes autorisées** (le `select=*` était toujours refusé) ; `track_likes` exportée ; l'invité gardé à côté d'un compte est inclus (session valable : toutes ses tables ; sinon seulement les tables publiques, dit dans le fichier) ; le fichier liste ce qui n'est pas exporté (`inputs`, `ghost`, `ghost_veh`).
- **Saisons** (`TECH-076`) : la base clôt après la **fin + la grâce** de 10 minutes que le jeu et le serveur acceptent déjà ; les points affichés et les divisions enregistrées viennent de la même clôture. La grâce est liée par des tests (`SEASON_GRACE_MS` = 600 s dans `close_season`).
- **Défi du jour** (`TECH-079`) : la date relue doit redonner la même chaîne (`daily-2026-02-30`, `-04-31` étaient acceptés) ; la fenêtre est exactement hier, aujourd'hui, demain en UTC (avant : ± 2,5 jours autour de l'instant).
- **En ligne** (`TECH-080`) : (a) le nombre de temps du classement passe par la même voie que le reste (plus de « Failed to fetch » brut) ; (b) un refus 429 dit le délai du serveur (« Trop de demandes : réessaie dans 17 s / 10 min », traduit) ; (c) le cache du service worker est **borné** : seuls les fichiers de la liste, sans paramètres, la vérification de mise à jour n'y entre plus, l'activation élague le reste ; (d) hors ligne, un fichier absent n'est plus remplacé par `index.html` (vrai 404 ; une page absente reçoit un message hors ligne) ; `legal.html` entre dans la copie hors ligne ; (e) la table des essais de la télémétrie garde les 200 circuits les plus récents.
- **Variantes de circuit** (`TECH-081`) : `submit_best` lie l'empreinte d'un circuit de joueur à la clé de **base** : on ne peut plus squatter les variantes d'un circuit populaire avec une collision de la signature de 32 bits. Les éventuels squats d'avant l'étape 20 ne sont pas supprimés (ligne d'information dans `verify-prod.sql`).
- Tests : nouveaux `tools/test-lectures-en-ligne.mjs`, `tools/test-etape20-sql.sh` ; étendus `test-securite-sql.sh` (82 contrôles), `test-hors-ligne`, `test-legal`, `test-telemetry`, `test-fixes`, `test-submit-handler`, `test-seasons`. Deux tests existants adaptés à l'échelle de repli du classement (`test-fantomes` : 2 requêtes au lieu de 3 ; `test-recompenses` : le refus nomme la colonne comme PostgREST). Chaque contrôle nouveau échoue sans le correctif correspondant.

## Bêta 0.16.11 — un seul modèle d'identité : l'invité devient le compte, sa session n'est plus détruite, renouvellement sûr entre onglets (TRANS-11)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 depuis plusieurs versions) ; aucune clé de classement, aucun code de circuit ne change. **Fonction `submit-score` inchangée. Aucune étape SQL** n'est ajoutée ni appliquée : la conversion d'un invité attend un prérequis serveur décrit dans `supabase/COMPTES.md` (« Modèle d'identité »), sans lequel le jeu ne la tente pas.

Audit : `TECH-024`, `TECH-025`, `TECH-026`. Un commit par identifiant, plus la documentation du modèle.

- **L'invité devient le compte** (`TECH-025`) : à l'inscription, l'utilisateur anonyme de l'invité est **converti** (adresse technique, mot de passe et pseudo posés sur la même session : `PUT /auth/v1/user`) ; il garde son identifiant, donc ses temps, circuits publiés et « j'aime » ; une seule ligne au classement ; republier son circuit ne répond plus « déjà publié par un autre pilote ». Le jeu ne convertit que si le serveur l'annonce (fonction `account_conversion_ready`, à installer) et si *Confirm email* est désactivé ; il vérifie ensuite que la base a créé le compte, sinon échec explicite et le joueur reste l'invité qu'il était. Le déploiement peut couper la conversion (`CONFIG.accounts.convertAnonymous = false`). **Sans conversion possible** (cas du serveur actuel) : un nouvel utilisateur, comme avant, mais le joueur est prévenu que son identité d'invité reste à part.
- **La déconnexion ne détruit plus l'identité de l'invité** (`TECH-025`) : elle la retrouve (avant : effacée, données orphelines, un anonyme de plus à chaque cycle). Un compte né d'une conversion EST l'ancien invité : la déconnexion ouvre un invité neuf, rien d'orphelin.
- **« Garder ma progression »** (`TECH-024`) : la progression est **déplacée** et vérifiée : copiée dans le compte (atomique), relue clé par clé, seulement ensuite effacée de l'invité, bibliothèques comprises (prefabs, pièces perso, modes, brouillon, preuves de vérification). Stockage plein : avec conversion, l'inscription échoue en le disant et rien ne change ; sans conversion, le compte est créé, l'invité garde tout et le joueur reçoit la marche à suivre (code joueur). Avant : 1 234 ◆ et 24 records devenaient un compte à 0, en silence.
- **Deux onglets** (`TECH-026`) : avant de renouveler, le jeu relit la session enregistrée (le jeton, à usage unique, a pu être consommé par l'autre onglet) ; renouvellement sous verrou entre onglets (`navigator.locks`, repli : bail dans le stockage) ; l'évènement `storage` fait suivre la session. Un invité ne change plus d'identité, un compte n'est plus déconnecté par la course de deux onglets. Un vrai refus du serveur crée une nouvelle identité d'invité **annoncée**, jamais en silence.
- Tests : `tools/test-identite.mjs` (16 scénarios contre un faux Supabase à jetons de renouvellement à usage unique et détection de réutilisation ; 15 échouent sur le code d'avant), vérification qu'aucun jeton n'apparaît dans le journal. **Non vérifiable ici** : le comportement réel de GoTrue (conversion d'un anonyme, intervalle de réutilisation des jetons) : procédure manuelle dans `supabase/COMPTES.md`. Textes nouveaux traduits.

## Bêta 0.16.10 — une seule fusion pour la synchronisation et l'import, pièces additives, deux onglets (TRANS-07, TRANS-13)

**`PHYS_VER` reste 39** (la consigne disait 38 : le dépôt est à 39 depuis plusieurs versions) ; aucune clé de classement, aucun code de circuit ne change. **Fonction `submit-score` inchangée.** Le format de la sauvegarde reste lisible par les anciens clients : `coins` est toujours le solde ; le portefeuille additif est un champ versionné à côté (`profile.wallet`, `v: 1`) qu'un ancien client ignore et recopie.

Audit : `TECH-023`, `TECH-027`, `TECH-028`, `TECH-029`, `TECH-030` (P1), `TECH-077`. Un commit par identifiant, plus le fuzz de bout en bout.

- **Pièces ◆ : modèle additif** (`TECH-029`, nouveau module `js/wallet.js`). Le profil garde, à côté du solde, une ligne de base, des compteurs de gains **par appareil** (monotones), les achats **par objet** (payés une fois) et les objets **offerts** (jamais déduits). Fusion : maximum par appareil, achats et cadeaux réunis. +50 sur chacun de deux appareils donne maintenant +100 (avant : +50) ; la LED arc-en-ciel du code caché (valeur 250) n'est plus déduite de l'autre appareil. **Migration sans changement de total** : un profil d'avant devient la ligne de base commune, à sa première lecture ; deux copies anciennes divergentes suivent l'ancienne règle (le plus favorable, moins le prix de ce qu'il n'avait pas ; jamais le prix d'un cadeau). **Invariant** : jamais plus de pièces que la ligne de base + la somme des gains réels − le prix des objets achetés ; égalité quand tous les appareils sont à jour. Un ancien client encore ouvert : ses gains sur un profil déjà migré ne sont pas comptés (l'ancienne règle les perdait aussi), ses achats sont déduits ; jamais de pièces créées. Un objet acheté hors ligne sur deux appareils n'est payé qu'une fois. Deux achats différents hors ligne qui dépassent le solde peuvent le rendre négatif (c'est ce qui a été dépensé). Après un import « Remplacer », l'appareil prend un nouvel identifiant de compteur (un compteur ne recule jamais).
- **Objectifs, titre, premières arrivées du jour** (`TECH-028`) : les objectifs bonus sont réunis (un objectif réussi sur un appareil ne se repaie plus sur l'autre) ; le titre affiché est le dernier choisi (daté) ; `xpDay` garde le jour le plus récent et réunit ses circuits ; les ensembles sont triés : deux appareils convergent et une synchronisation sans changement n'écrit plus rien.
- **Médaille abîmée** (`TECH-077`) : une valeur invalide est ignorée à la fusion ; elle ne devient plus un cristal.
- **Import « Fusionner »** (`TECH-030`) : c'est désormais la fusion de la synchronisation (`mergeSaves`), sur la progression seulement : expérience, objectifs, Académie, licences, médailles, pièces, records et circuits sont conservés et réunis ; les réglages, le brouillon, les prefabs, les pièces perso et les modes ne sont plus touchés ; l'identité du joueur reste la sienne. Un record importé qui n'est pas lisible ou d'une autre physique est refusé (avant : un 0,001 s sans version remplaçait un vrai 30 s). « Remplacer » ne change pas de sens. Une pierre tombale de circuit dépassée par une version plus récente est retirée par la fusion.
- **Deux onglets** (`TECH-027`) : avant toute lecture ou écriture, le cache du profil fusionne la version écrite par un autre onglet (ou par une synchronisation) ; l'évènement `storage` est écouté (les pièces affichées suivent). Un achat ou une médaille faits dans un onglet ne sont plus annulés par une course finie dans l'autre. Un cache n'est jamais mélangé avec le profil d'une autre portée (invité / compte).
- **Écriture pendant une synchronisation** (`TECH-023`) : compteur de génération ; si quelque chose a été écrit pendant la synchronisation, une autre part aussitôt (avant : 1 000 ◆ gagnés pendant une synchronisation lente n'étaient jamais envoyés).
- Tests : `tools/test-fusion-fuzz.mjs` (2 500 scénarios × 2 et 3 appareils, 1 500 ordres de fusion, 2 000 parties avec un ancien client, 5 000 médailles abîmées, migration) et `tools/test-fusion-profils.mjs` (les six reproductions, qui échouent sur le code d'avant, 400 parties à deux onglets, 500 parties de bout en bout avec le faux Supabase). Texte affiché : aucun nouveau.

## Bêta 0.16.9 — sauvegardes : l'écriture locale est vérifiée, le jetable ne s'accumule plus (TRANS-02)

**`PHYS_VER` reste 39** (le texte de la consigne disait 38 : le dépôt est à 39 depuis plusieurs versions) ; aucune clé de classement ne change, aucun code de circuit non plus. **Fonction `submit-score` inchangée.** Le format de la sauvegarde cloud reste lisible par les anciens clients : aucune clé nouvelle ; un record peut simplement y avoir `inputs: null` (comme un record qu'un appareil plein a dû alléger) et les essais d'éditeur n'y sont plus.

Audit : `TECH-007` (P1), `TECH-022`, `TECH-074`, `TECH-075`, `TECH-078` ; cause commune `TRANS-02` (résultat d'écriture ignoré, pression sur le quota). Quatre commits : clés propres à l'appareil et essais d'éditeur ; synchronisation ; limite d'envoi ; import.

- **La synchronisation ne ment plus quand l'appareil est plein** (`TECH-007`) : le résultat de `restoreAll` est testé. Si la sauvegarde fusionnée ne tient pas, une version allégée est écrite plutôt que rien — sans fantômes (des plus anciens aux plus récents, seulement ceux qui grossissent la copie locale), puis sans les commandes des plus anciens, puis, en dernier, seuls le profil, les circuits et les records déjà présents (les records absents d'ici ne sont écrits que dans la limite de la place, les plus récents d'abord) ; chaque étape est atomique et la plus légère qui tient est gardée. L'écran Profil et un message le disent (« copie du compte allégée… », « N records n'y sont pas écrits ») ; si même le profil ne tient pas, rien n'est écrit et l'état est « erreur : espace insuffisant… », jamais « à jour ». Le cloud garde tout. **Plus de boucle** : `reloadProfile()` n'écrit plus le profil avec le crochet de synchronisation (il en relançait une 4 s plus tard, à l'infini quand la restauration échouait : 4 lectures complètes en 15 s mesurées, une seule maintenant). Réessayer : « Synchroniser maintenant », ou la prochaine écriture du joueur.
- **Une copie allégée n'écrase pas le cloud avec moins** (conséquence de `TECH-007`/`TECH-074`) : à temps et physique égaux, la fusion garde le record le plus complet (fantôme, commandes). Un meilleur temps l'emporte toujours (règle inchangée).
- **Les essais de l'éditeur ne s'accumulent plus** (`TECH-022`) : les records `e-…` (21 à 43 Ko chacun) ne sont plus synchronisés, ni exportés dans le code joueur, ni restaurés par un import ; l'appareil n'en garde que les 3 plus récents (le fantôme du circuit en cours d'essai reste) et purge les autres au démarrage (invité et comptes, clés `…rec3.e-…` uniquement : jamais un `b-`, `u-` ni `daily-`). Le cloud d'un joueur qui en avait les perd à sa prochaine synchronisation. Quand le stockage est plein, l'éviction suit un ordre explicite : essais d'éditeur, fantômes des autres records compactés (rien de perdu), fantômes importés (le plus gros d'abord), dernières courses, puis l'écriture elle-même allégée, et seulement alors le fantôme et les commandes des autres records classés (du plus ancien au plus récent). Un temps `b-`/`u-`/`daily-` n'est jamais perdu.
- **Une sauvegarde de plus de 6 Mo n'est plus renvoyée à chaque synchronisation** (`TECH-074`) : on compare ce qui partirait (fusion allégée) à la copie du cloud : plus de PATCH de ≈ 6 Mo ni de `rev` incrémenté pour rien. Au-delà de la limite, sans fantômes, puis sans les commandes des plus anciens records, jusqu'à tenir. À confirmer en production : le comportement réel au-delà de la limite de la base (8 Mo compressés évoqués par l'audit) n'a pas pu être essayé ici.
- **Un import avec le stockage plein n'annonce plus « Sauvegarde restaurée ! »** (`TECH-075`) : `applySave` lève `StorageFullError`, rien n'est modifié (écriture atomique), le joueur lit « Stockage plein : la sauvegarde n'a pas été restaurée… ». Les essais d'éditeur sont libérés avant de renoncer.
- **Le code joueur ne contient plus l'identifiant d'installation** (`TECH-078`) : `telemetry.state` et `errors.queue` rejoignent `DEVICE_ONLY_KEYS` (jamais exportés, jamais importés, ceux de l'appareil survivent à un « Remplacer »). L'export des données du joueur (RGPD) garde l'identifiant (c'est sa donnée) mais jamais la session, le profil en ligne, la preuve ni les essais d'éditeur.
- Tests : `tools/test-quota-sauvegardes.mjs` (22 tests, tous en échec sur le code d’avant), temps virtuel et quota simulés (`tools/fake-supabase.mjs`).

## Bêta 0.16.8 — éditeur : neuf défauts indépendants (calques, groupes, états gardés, sélection, collage, sortie)

**`PHYS_VER` reste 39** ; aucune clé de classement ne change, les circuits existants et les 72 circuits officiels se relisent à l'identique (aucun changement du format du code, de la signature ni de la physique). **Fonction `submit-score` régénérée** (`npm run build:function`) : seul `Track` y gagne deux méthodes de lecture (`logicGroups`, `reservedGroups`) ; rien n'est déployé.

Audit : `TECH-036`, `TECH-038`, `TECH-054`, `TECH-055`, `TECH-056`, `TECH-057`, `TECH-058`, `TECH-059`, `TECH-062` (lot LOT-3, éditeur). Deux commits : calques, groupes, sélection, collage, vue par niveau ; puis états gardés au mauvais moment et sortie.

- **La gomme et le clic droit n'effacent plus de décorations de calques verrouillés ou masqués** (`TECH-036`) : le repli « décoration la plus proche » ne filtrait pas les calques (le rayon, lui, le faisait) ; la pipette non plus.
- **Un groupe cité par la logique n'est plus « libre »** (`TECH-038`) : « Nouveau groupe », la liste des groupes, les listes de l'éditeur de logique et la conversion des déclencheurs de cases comptent les groupes cachés au départ, cibles de règles, de conditions ou d'actions, même vidés de leurs pièces. Avant, « Nouveau groupe » redonnait le numéro 1 d'un groupe caché au départ par la logique, et la conversion rangeait une route dedans : elle devenait cachée au départ.
- **Annuler un « Nouveau » ou un import rend le circuit d'avant avec sa vérification ; un autre circuit chargé remet les calques à zéro** (`TECH-054`) : la vérification de l'auteur est dans l'instantané d'historique (absente tant que le circuit n'a jamais été vérifié ; un état déjà vérifié annulé puis rétabli reste vérifié), et Nouveau / Importer remettent à zéro les calques masqués et verrouillés. Le retour d'un essai compare le contenu sans la vérification : une vérification terminée pendant l'essai ne fait pas jeter l'historique.
- **Test depuis le curseur : le sens de gravité est celui de la pièce visée** (`TECH-055`, décision D-2 par défaut). Avant, sur un circuit dont la règle « gravité inversée au départ » est cochée, tester depuis une route posée au sol mettait la voiture en gravité inversée : elle tombait vers le ciel. La règle ne vaut que pour la pièce de départ (comme `placeAtStart`).
- **La direction du vent se règle par pas de 15°** (`TECH-056`), comme la règle : avec les pas de 45° de la liste, valider la fenêtre « Circuit » sur un code venu d'ailleurs avec 30° le réécrivait en 45° et changeait sa signature.
- **« Tout sélectionner » prend les décorations hors des pièces** (`TECH-057`), et fonctionne sur un circuit réduit à des décorations.
- **Coller dans un autre circuit remet les groupes à 0** (`TECH-058`) : le presse-papiers retient le circuit d'où il vient ; un prefab (origine inconnue) est traité de même. Dans le même circuit, les groupes sont gardés. Un message le dit.
- **Plus d'impasse quand l'enregistrement échoue** (`TECH-059`) : « Retour » (ou « Mes circuits ») avec un stockage plein ou un code trop long ouvre une fenêtre « Circuit non enregistré » : rester, exporter le code, ou quitter sans enregistrer. Le bandeau « Recharger » (nouvelle version) ne recharge plus dans le dos du joueur : même fenêtre, avec « Recharger sans enregistrer ».
- **La vue par niveau ne montre plus les calques masqués** (`TECH-062`) : les pièces estompées d'un groupe ont leur propre maillage, masqué avec le calque.
- Tests : un test par identifiant dans `tools/test-editor.mjs` (et `tools/test-trackview.mjs` pour `TECH-062`), tous échouent sur le code d'avant ; dans Chromium, sept scénarios de l'éditeur (souris, Ctrl+A, fenêtres « Groupes et calques », « Circuit », stockage plein, bandeau de mise à jour).

## Bêta 0.16.7 — éditeur : un validateur de placement, une normalisation de décoration

**`PHYS_VER` reste 39** : la physique ne change pas. Aucune clé de classement ne change ; les codes de circuits existants se relisent à l'identique (corpus de compatibilité, codes au hasard, 72 circuits officiels). **Fonction `submit-score` régénérée** (`npm run build:function`) : y changent la garde de placement de l'éditeur (absente hors de l'éditeur) et la normalisation de décoration (un code écrit par le jeu est déjà au pas du code : sa lecture ne change pas) ; rien n'est déployé.

Audit : `TECH-003`, `TECH-052`, `TECH-053`, `TECH-037` (sous-étape 1, pièces), `TECH-034`, `TECH-035` (sous-étape 2, décorations et historique) ; cause commune `TRANS-01` (normalisation et validation appliquées sur certains chemins seulement). Un commit par sous-étape.

- **La pose ne supprime plus de pièces que la nouvelle pièce ne touche pas** (`TECH-003`). Une option armée que la pièce choisie refuse (mur, anneau, checkpoint, mouvement…) réservait encore ses niveaux ou ses cases : avec « Mur gauche » armé, un départ posé au niveau 0 supprimait la ligne droite du niveau 2 ; une glissière armée sur un looping, une rotation armée sur une bifurcation supprimaient leurs voisines (diagonales comprises). Les conflits sont maintenant calculés sur la pièce **normalisée** ; l'option refusée est toujours signalée (« Option ignorée »). L'aperçu et la pose passent par le **même plan** : ce que l'aperçu annonce est exactement ce que le clic retire.
- **Un seul validateur de placement pour toutes les modifications de pièces** (`TECH-052`, `js/placement.js`) : niveaux de l'éditeur, place occupée (remplacée ou refusée), calques verrouillés ou masqués, bord incliné d'une pente posée au mur qui déborde dans la case voisine (règle 0.12.6), départ unique. Avant, le débordement n'était contrôlé que par la pose, l'aperçu, le collage, le déplacement de sélection et « Prolonger » ; l'inspecteur (case, niveau, rotation), le gizmo, Maj + glisser, la duplication (pièce ou zone), les options et le mouvement, le changement de type ou de caractéristique, le pot de peinture (zone vide ou par type) et les raccords automatiques de « Prolonger » (largeur, orientation) pouvaient faire traverser une route par ce bord. Ils passent tous par le validateur, et un refus dit sa raison. La lecture d'un code n'y passe pas : un circuit existant s'ouvre tel quel.
- **« Prolonger » ne pose plus plusieurs départs** (`TECH-053`) : un départ prolongé remplace l'ancien, comme la pose ordinaire (« l'ancien départ est retiré »). Avant, P trois fois avec le départ choisi donnait quatre départs : l'essai et la vérification étaient refusés, mais le circuit s'enregistrait et se partageait.
- **Le gizmo garde le demi-niveau d'une pièce** (`TECH-037`) : le niveau ne change que si la flèche verticale (ou un plan qui la contient) est tirée, et par demi-niveaux. Avant, une pièce au niveau 0,5 glissée d'une case passait au niveau 1, et la route était cassée sans message.
- **Une seule normalisation de décoration, idempotente, pour toutes les écritures** (`TECH-035`, `js/track/edit.js : normalizeDeco`, `Track.setDeco`). L'ajout (pose, collage, duplication, prefab, lecture d'un code, restauration de l'historique) et la modification d'une décoration posée (inspecteur, gizmo, Maj + glisser, déplacement / rotation / niveau d'une sélection, calques) y passent ; elle arrondit au pas du code (x, y, z et échelle au centième, cap au millième). Avant, l'inspecteur, le gizmo et Maj + glisser écrivaient les valeurs brutes, la restauration les normalisait : après annuler / rétablir, le circuit n'égalait plus l'instantané courant, le premier clic suivant empilait un pas fantôme et **effaçait la pile « rétablir »**, un circuit enregistré paraissait « modifié ». Quatre rotations en place d'une zone redonnent exactement le circuit d'origine (quart de tour au pas du code). Les circuits **générés** (circuits officiels, défi du jour) gardent leurs valeurs exactes : leur physique et leurs clés ne bougent pas.
- **Les solides ne s'inclinent plus** (`TECH-035`) : un pilier, une poutre, un mur, un bloc… n'exposent ni inclinaison, ni roulis, ni « Retourner » dans l'inspecteur, et le gizmo ne les tourne qu'autour de la verticale. Avant, ils s'affichaient inclinés dans l'éditeur et redevenaient droits au premier essai, enregistrement ou annulation (la course les voyait droits).
- **Retour d'essai sans perte** (`TECH-034`) : l'instantané d'historique est canonique (écrit puis relu, il redonne le même texte) et l'état mis de côté est comparé, au retour, sur sa forme canonique (celle du circuit écrit en code puis relu). Avant, une seule décoration posée « Libre » faisait jeter à chaque essai l'historique d'annulation, le presse-papiers, les options armées, les réglages de décoration et les **calques masqués / verrouillés** ; l'outil « pièce perso » revenait sans ses formes (« Maximum de 500 décorations atteint » à chaque clic).
- Tests : `tools/test-modele-defauts.mjs` (les reproductions de `TECH-034` et `TECH-035` deviennent des tests ordinaires ; idempotence sur 3 000 décorations au hasard), `tools/test-editor.mjs` (gizmo, Maj + glisser, sélection : annuler / rétablir intact), `tools/test-pieces-speciales.mjs` (la décoration posée est au pas du code) ; dans Chromium, décoration libre posée à la souris, essai, retour (historique, presse-papiers, calques masqués / verrouillés, formes de la pièce perso conservés) et inclinaison saisie dans l'inspecteur puis annuler / rétablir.
- Tests : `tools/test-editor.mjs` (les quatre cas de la sonde, aperçu = pose sur 400 poses au hasard, les chemins de `TECH-052`, P trois fois, demi-niveau au gizmo), `tools/test-audit-editeur.mjs` (8 400 opérations au hasard : aucune pièce traversée par un bord débordé, en plus de la structure et de l'historique), `tools/test-debordement.mjs` (le débordement n'est plus vérifié qu'en un endroit, que tous les chemins appellent) ; dans Chromium, l'aperçu sous la vraie souris et le clic donnent le même résultat.

## Bêta 0.16.6 — clés de classement stables : normalisation idempotente, décorations perdues signalées, signature au pas du code

**`PHYS_VER` reste 39** : la physique ne change pas (empreinte des 206 scénarios, temps de référence des 72 circuits et médailles identiques). **Fonction `submit-score` à redéployer** (`npm run build:function` est fait dans le dépôt ; rien n'est déployé : jalon D1, `docs/DEPLOIEMENT.md`, puis `node tools/check-deployed.mjs`). Le serveur calcule la clé d'un circuit comme le jeu : tant que la fonction en ligne est l'ancienne, les temps d'un circuit dont la clé change sont refusés (« Le code du circuit ne correspond pas »), et ceux d'un circuit à obstacle roulé de π, déjà refusés avant, le restent.

Audit : `TECH-002` (et `GAME-009`), `TECH-060`, `TECH-039` ; causes communes `TRANS-01` (normalisation et validation) et `TRANS-12` (clés de classement fragiles). Deux commits : la sous-étape A (`TECH-002`, `TECH-060` : aucune clé existante ne bouge, sauf un code qui contenait −3,142) et la sous-étape B (`TECH-039` : décision D-1, changement de clés, séparée pour pouvoir être retirée seule).

- **Un obstacle roulé de π (posé au plafond) se relit à l'identique** (`TECH-002`). La normalisation du roulis n'était pas idempotente : π devenait 3,142, qui dépasse π, repassait à −3,142 à la lecture suivante, puis 3,142… La signature et la clé `u-…` alternaient ; le circuit vérifié en course ne l'était plus au retour dans l'éditeur ; la publication échouait (« Circuit non vérifié ») et tout envoi de temps était refusé. Une seule fonction par sorte d'angle (`js/track/shared.js : normalizeAngle`, `normalizeRoll`), idempotente ; valeur canonique de ±π : **+3,142** (celle que l'ancien code écrivait déjà à la première sauvegarde : ces codes gardent leur clé). Les autres valeurs d'une décoration (x, y, z, cap, échelle) ne sont pas arrondies en mémoire : c'est le sujet de l'éditeur (phase 8, `TECH-034` et `TECH-035`).
- **Les décorations perdues à la lecture d'un code sont signalées** (`TECH-060`). Décoration inconnue (code d'une version plus récente), illisible ou en trop : comptée, et elle BLOQUE comme les pièces et les options. L'éditeur ouvre alors le circuit détaché de son entrée (un enregistrement crée une copie, l'original reste intact) et le dit pendant 8 s ; l'import d'un code, l'import communautaire et le lien de partage le disent aussi (le lien reste jouable, ni enregistrable ni éditable). Textes traduits (`js/lossMessage.js`).
- **La signature d'un circuit est au pas du code** (`TECH-039`). Les obstacles et les solides sont hachés au centième de mètre et au millième de radian (avant : 0,1 m et 0,01 rad) ; une poutre d'échelle 8 décalée de 4 cm et tournée de 4 mrad (son extrémité bouge de 0,26 m) avait la même clé qu'une autre : plus aucune collision de ce genre. Les pièces d'un groupe de logique sont repérées par leur type et leur case (un anneau et la route dessous occupent la même case). Les décorations visuelles gardent leur texte, calculé après l'arrondi du code : la signature d'un circuit en mémoire est celle de son code relu.

**Ce qui change de clé — liste exacte**
- **Changent** : les clés `u-…` (circuits de joueurs, circuits ouverts par un code, par un lien ou depuis la communauté) des circuits qui contiennent **au moins un obstacle** (piques, balancier, marteau, mur coulissant, balayeur, bumper), **au moins un solide** (pilier, poutre, mur, bloc, cale, pyramide) **ou une logique avec des groupes de pièces**. Pour un obstacle roulé de π, deux anciennes clés (l'ancien code alternait) deviennent une seule.
- **Ne changent pas** : les 72 clés `b-…` des circuits intégrés (empreinte de leur code, pas de leur signature), les 60 clés `daily-…` mesurées (la date seule), les clés `u-…` de tout circuit SANS obstacle, solide ni groupe de logique (pièces, revêtements, règles, décorations visuelles, groupes sans logique, tours), les catégories de record qui en dérivent (`<clé>~v1…`) pour ces circuits. Mesure : parmi les 72 circuits intégrés exportés en code joueur, **68 changent et 4 gardent leur clé** (`tremplins`, `spirale`, `verglas`, `spores` : sans solide) ; dans le corpus de compatibilité, 5 codes sur 8 changent (SHW1, SHW2 et le lien de partage gardent la leur). Les circuits de joueurs réels ne se comptent que sur la production, que ce dépôt ne voit pas.
- **Records locaux, dernières courses, catégories (`~v1…`)** : retrouvés sous la nouvelle clé (lecture avec repli, puis copie à l'ouverture de la fiche, au lancement ou à l'ouverture d'un code : `js/keyAlias.js`). Copiés, pas déplacés : plusieurs circuits physiquement différents pouvaient partager l'ancienne clé (c'était le défaut), chacun retrouve ce qu'il avait. Favoris (références `b:` / `m:` / `c:`) et médailles des circuits de joueurs (déduites du code) n'ont pas de clé à migrer. Les fantômes importés d'avant sont d'une autre physique : inutilisables, non migrés.
- **Classements en ligne** : **non migrés**. Ils restent sous l'ancienne clé, figés ; la nouvelle clé en commence un neuf. La fiche d'un circuit publié dont la clé change affiche donc un classement vide jusqu'aux premiers temps.
- **Vérification d'auteur** : un circuit vérifié avant (`vt` / `vh` de l'ancienne signature) est **« non vérifié »** : son temps d'auteur reste lisible mais plus de médailles déduites, et la publication demande une nouvelle vérification. La fenêtre de partage et le refus de publier en donnent la raison (« Ce circuit avait été vérifié, mais il a changé depuis (ou le jeu a changé la façon de calculer sa clé de classement) : une course de vérification suffit »). Comme pour tout circuit non vérifié, l'enregistrer sans le revérifier n'écrit plus ce temps d'auteur dans son code.
- Le dépôt garde l'ancien algorithme figé (`Track.legacySignatureText`) et le corpus épingle les anciennes clés : `tools/test-cles.mjs` le compare aux 72 clés d'avant, capturées avec le code de la 0.16.5.
- Tests : `tools/test-cles.mjs` (nouveau) ; test de propriété d'idempotence ; corpus de compatibilité (un circuit vérifié avec un obstacle roulé de π, `legacyKeys`) ; dans Chromium, `GAME-009` (Vérifier → Retour à l'éditeur : le circuit reste vérifié, `verifyPublish` accepte le code), `TECH-060` et le message à l'auteur ; le test qui documentait la « limite connue » de 0,1 m devient une garantie.

## Bêta 0.16.5 — réception sur ruban : plus de téléportation sur un looping

**`PHYS_VER` reste 39** : la 0.16.4 (qui l'a introduit) n'a jamais été déployée, aucun temps n'existe sous ce numéro. **Fonction `submit-score` à redéployer** : c'est celle de la **0.16.5** (`npm run build:function` est fait dans le dépôt) qu'il faut mettre en ligne, pas celle de la 0.16.4 (rien n'est déployé : jalon D1, `docs/DEPLOIEMENT.md`, puis `node tools/check-deployed.mjs`).

Audit : `GAME-004`. **Aucun circuit intégré n'est touché** : temps de référence, médailles, `npm run sim` (72 circuits) et les 204 scénarios d'empreinte existants sont identiques au bit près ; 2 scénarios sont ajoutés (206).

- **Une réception sur un ruban (looping, vrille, tube, mur…) n'est acceptée que là où la voiture touche vraiment la route.** Sur le double looping d'« Épave », une voiture tombée du haut du looping pouvait y être posée en un pas 52 à 56 m plus loin et 22 m plus haut : la recherche du point du ruban le plus proche n'avait pas convergé (ruban de 265 m, très courbe) et l'écart le long de la route n'était jamais contrôlé. Désormais, si la recherche ne converge pas, une recherche fine reprend (échantillons proportionnels à la longueur et à la courbure du ruban, affinage borné) ; et la voiture n'est posée que si elle est au droit du point trouvé (écart le long de la route ≤ vitesse × 1/120 s + 2 m). Sinon elle continue de tomber et elle est rappelée au checkpoint.
- **Aucune réception légitime n'est refusée** : les 227 réceptions des courses mesurées (pilote automatique et pilote perturbé sur les 72 circuits, défis du jour) ont un écart d'au plus 1 mm et restent identiques ; un balayage de 50 160 arrivées en vol sur les 128 types de rubans (4 vitesses, 5 angles, tubes compris) donne exactement les mêmes réceptions avant et après.
- **Exploitabilité** (recherche bornée, 8 190 manœuvres simples à partir du pilote automatique sur « Épave ») : 5 trajectoires déclenchaient la téléportation, chacune dans une fenêtre de 4 pas (33 ms), et aucune ne faisait gagner de temps (+2,00 s). Aucun raccourci trouvé.
- L'entrée par une extrémité de ruban a été vérifiée : pas le même défaut (recalage borné par construction, au plus 3,0 m mesurés sur 1 532 entrées), non modifiée.
- Tests : `tools/test-receptions.mjs` (balayage, recherche fine, cas d'« Épave ») ; les reproductions `bugConnu` GAME-004 de `tools/test-noyau-defauts.mjs` sont devenues des tests ordinaires (fuzz de 144 courses perturbées : aucun saut de plus de 3 m en un pas).

## Bêta 0.16.4 — retour au checkpoint : la voiture revient dans l'état complet du point de retour

**`PHYS_VER` passe à 39 ; fonction `submit-score` à redéployer** (`npm run build:function` est fait dans le dépôt ; le déploiement, lui, n'est PAS fait : jalon D1, procédure `docs/DEPLOIEMENT.md`, puis `node tools/check-deployed.mjs`). Tant que la fonction en ligne rejoue `PHYS_VER` 38, les temps de cette version sont refusés (« le serveur est en cours de mise à jour ») et restent sur l'appareil. Les records et replays d'avant ne sont plus rejouables (leur `pv` est 38) : ils restent affichés comme temps.

Audit : `TECH-001` (et `GAME-001`), `TECH-013` (et `GAME-005`), `TECH-014`, cause commune `TRANS-04` (« état au point de retour incomplet »). **Aucun circuit intégré n'est touché** : temps de référence (`tools/golden.mjs`) et médailles (`tools/medals.mjs --check`) identiques sur les 72 circuits ; les 193 scénarios historiques de l'empreinte sont identiques au bit près, 11 scénarios « retour au checkpoint » sont ajoutés (204).

- **L'état au point de retour est défini et rendu en bloc** (`js/raceLogic.js` : `startState`, `placeState`) : position, cap, sens de la gravité, véhicule, gravité, vitesse. Le départ (« Recommencer ») et tout retour au checkpoint passent par le même code ; la course en direct et le rejeu (fantômes, vérification serveur) appellent le même `Simulation.rewind`, la décision de réapparaître n'a pas changé.
- **Plus de retour en voiture sur une plaque de transformation** (`TECH-001`). Un checkpoint posé sur une plaque moto, bateau ou deltaplane rend le véhicule de la plaque, qui ne le retransforme plus au premier contact (la plaque est verrouillée jusqu'à ce qu'on la quitte ; la repasser ramène la voiture, comme avant). Un checkpoint aérien rend la position, le véhicule ET la vitesse du dernier sol, avec le chrono de cet instant : la voiture (ou le deltaplane) ne repart plus à l'arrêt au bord du vide qu'elle venait de sauter, ce qui faisait chuter et réapparaître sans fin, même sans plaque. Un départ en moto posé sur une plaque moto reste une moto.
- **« Retour au checkpoint » avant le premier checkpoint = « Recommencer »** (`TECH-013`) : la vitesse de départ (mode « Départ lancé », catégories `v0-100` / `v0-200`, grille d'un championnat) est rendue.
- **Multijoueur : les règles de logique « à T s » ne se perdent plus au retour** (`TECH-014`). Le chrono ne recule pas en multijoueur ; les règles dont l'heure est passée depuis le checkpoint sont rejouées au pas suivant, une fois chacune, dans l'ordre de leurs heures (un pont montré « à 6 s » revient). Règle documentée dans le vérificateur de logique (`js/logicText.js`). En solo, rien ne change.
- Tests : les reproductions `bugConnu` de TECH-001, 013 et 014 sont devenues des tests ordinaires (`tools/test-noyau-defauts.mjs`) ; retours sur / après chaque plaque, vitesse de départ, course puis rejeu identiques (`tools/test-simulation.mjs`) ; règles « temps » au chrono conservé (`tools/test-logique.mjs`, `tools/test-manche.mjs`) ; dans Chromium, mode « Départ lancé » et deux courses sur une plaque moto avec la vraie touche R, puis rejeu identique (`tools/test-live-replay.mjs`, dont la fenêtre de bienvenue, qui mettait la première course en pause, est maintenant fermée avant de rouler). Le test 0.9.59 « anneau franchi avant le premier relevé » (`tools/test-audit-physique.mjs`) supposait un retour à l'arrêt : il vérifie maintenant que ce retour au départ vaut « Recommencer », et qu'il n'y a plus de boucle là où le saut est possible.
- Le circuit de reproduction de l'audit (`start S2 S.e GC2 S3 finish`) ne peut pas se finir, même sans retour : au niveau 0 le « vide » est le terrain. L'arrivée après un retour est vérifiée sur la même situation avec un vrai vide (niveau 4) et sur un saut en voiture.

## Bêta 0.16.3 — déploiement ordonné : la fonction avant le site, avec une barrière visible

**`PHYS_VER` reste 38**, rien ne change dans la course ni dans la fermeture de `js/verify.js` (la fonction générée est inchangée).

Audit : `COMPLETE-005` (déploiement serveur sûr), partie « contrôle » de `TECH-021`, `TRANS-15`. Rien de ceci n'a été exécuté sur GitHub ni sur Supabase ; procédure du propriétaire : `docs/DEPLOIEMENT.md`.

- **Workflow `deploiement.yml`** : tests → construction → (approbation de l'environnement `production`) → déploiement de `ice` et `submit-score` → barrière `tools/barriere.sh` (`check-deployed.mjs`, écart ou point non vérifié = échec) → site par GitHub Pages seulement si la barrière passe. Lancement sur `main` ou à la main, « à blanc » par défaut ; un seul secret (`SUPABASE_ACCESS_TOKEN`). Le site est aujourd'hui publié depuis une branche : les réglages à changer sont dans `docs/DEPLOIEMENT.md`.
- **Le refus de version est reconnu par son drapeau** (`versionMismatch`), plus par le texte français ; le joueur lit « le serveur est en cours de mise à jour, réessaie dans quelques minutes » (serveur en retard) ou « recharge la page » (page périmée).
- **`verify-prod.sql`** vérifie la lisibilité des colonnes lues par le jeu (`has_column_privilege`) : un ÉCART sur `scores.ghost_veh` est attendu jusqu'au correctif SQL de la phase 13 (`MIGRATIONS.md`).
- **`verification-base.yml`** (optionnel, désactivé par défaut) : `verify-prod.sql` en lecture seule avec `SUPABASE_DB_URL`.
- Tests : `test-barriere.mjs`, `test-version-serveur.mjs`, `test-verify-prod-report.mjs`, un parcours dans `test-browser.mjs`.

## Bêta 0.16.2 — le cycle de vie d'une course : plus de record faux, plus de jeu figé, plus de résultat périmé

**`PHYS_VER` reste 38**, rien ne change dans la course : records, replays, fantômes, médailles et classements restent valables. Aucune commande enregistrée ne change pour une course sans erreur (le test live ↔ rejeu reste vert) ; aucun fichier de la fermeture de `js/verify.js` n'est touché.

Cause commune corrigée (audit, `TRANS-08` et `TRANS-04` côté client) : des gardes par identité d'objet (`this.session !== session`) et des états qui n'étaient pas remis à zéro aux transitions. Désormais un **jeton de génération** par arrivée / redémarrage est vérifié après chaque attente, la construction d'une course échoue proprement, et l'enregistrement est toujours fidèle à la course jouée.

- **Erreur dans la boucle : le record reste rejouable** (`TECH-015`). Le retour au checkpoint qui suit une erreur est maintenant enregistré. Si l'erreur a interrompu un pas (l'état de la voiture est incertain), la course est marquée non vérifiable : à l'arrivée, ni record (local ou envoyé), ni fantôme, ni récompense, ni replay, et l'écran le dit. Règle : on n'écrit jamais un record dont les commandes ne reproduisent pas le temps.
- **Une course qui ne peut pas se construire ne fige plus le jeu** (`TECH-016`). Les objets déjà créés sont libérés, l'application revient au menu, à la liste, à la fiche du circuit ou au salon avec un message clair, sans session fantôme. « Regarder mon record » et « Laboratoire » ne sont proposés que si les commandes du record sont lisibles.
- **Un résultat d'envoi n'apparaît plus sur la mauvaise arrivée** (`TECH-018`). Si l'on recommence pendant l'envoi, la réponse du premier envoi n'est plus affichée sur l'arrivée suivante, et le bloc caché de l'écran d'arrivée le reste.
- **Une réponse tardive du serveur ne touche plus à l'interface** (`TECH-066`). Le panneau ouvert reste ouvert, le focus et le défilement sont gardés, et une liste n'est reconstruite que si le record local a vraiment dû être écrit.
- Contrat et choix (dont celui du record local) : `docs/ARCHITECTURE.md`, « Cycle de vie d'une session de course ». Textes anglais ajoutés dans `js/i18n/en/race.js`.
- Tests : quatre parcours « cycle de vie » dans `tools/test-browser.mjs` (erreur injectée en pleine course, record aux commandes invalides, envoi simulé à 1,5 s, réponse tardive).

## Bêta 0.16.1 — un arbitre d'entrées : plus de course perdue ni de réglage corrompu par un geste ordinaire

**`PHYS_VER` reste 38**, rien ne change dans la course : records, replays, fantômes, médailles et classements restent valables. Aucune commande enregistrée ne change (le format `quantSteer` / `InputRecorder` et `input.drive()` sont intacts ; le test live ↔ rejeu reste vert).

Cause commune corrigée (audit, `TRANS-03`) : un seul état de touches était partagé par les pages du jeu, la course et l'éditeur, sans arbitre ni remise à zéro aux transitions. Désormais **un contexte actif** (capture de touche, fenêtre, pause / arrivée, course, éditeur, garage, menu) décide ce qui est pris en compte ; les états sont remis à zéro à chaque transition. Le contrat (qui consomme quoi, dans quel contexte) est en tête de `js/input.js` et dans `docs/ARCHITECTURE.md`.

- **Entrée sur « Reprendre » ne relance plus la course** (`TECH-004`). Entrée / Espace sur un bouton, un lien ou une carte l'active une seule fois, sans autre effet (même chose pour « Retour au checkpoint » et « 🎬 Vidéo » du Theater). Le bouton reste activable au clavier.
- **Manette : A tenu ne valide plus rien tout seul** (`TECH-005`). La pause reste ouverte quand on accélère avec A, l'écran d'arrivée n'est plus relancé aussitôt. Les fronts « menu » de la manette sont suivis à chaque image et « valider » exige un relâchement de A après l'ouverture d'une superposition. La navigation à la manette est inchangée.
- **Une case de liaison oubliée ne corrompt plus les commandes** (`TECH-006`). La capture d'une touche ou d'un bouton de manette (scrutation de 8 s) est annulée à tout changement d'écran, d'onglet, de course ou d'ouverture d'une fenêtre ; une capture remplacée par une autre rend sa case.
- **Plus de commande de course sous une fenêtre** (`TECH-017`). P, T, C, H, R n'agissent plus derrière « Commandes », « Classement » ou un bilan ; en solo, ouvrir une fenêtre en pleine course met la course en pause (jamais en multijoueur). La fenêtre prend le focus clavier (Entrée n'active plus un bouton caché derrière elle) et le rend à la fermeture.
- **Éditeur : raccourcis Ctrl sans effet sous une fenêtre** (`TECH-033`). Ctrl+Z / Y / A / X / D / V et « ? » ne touchent plus au circuit pendant que la fenêtre « Circuit » (ou calques, logique…) est ouverte.
- **Boutons tactiles** (`TECH-020`) : « ⟲ », « ↺ » et « ❚❚ » déclenchent directement leur action, même si le joueur a réassigné les touches. Les aides qui citaient R, Entrée ou Échap (pause, arrivée, barre du replay, fin de replay, message « bloqué », fenêtre « Commandes ») suivent maintenant les liaisons du joueur (traduites en anglais).
- **Échap** (`TECH-065`) passe par le même chemin que « ← Retour » : il rouvre le panneau de l'accueil d'où l'on venait, et revient dans le garage.
- Tests : `tools/test-entrees.mjs` (arbitre, sans navigateur) ; `tools/test-browser.mjs` (sept parcours : Entrée sur les boutons, manette A tenu, capture oubliée, fenêtres, tactile, éditeur, Échap) ; `test-i18n` (aides traduites quelles que soient les touches).

## Bêta 0.16.0 — le jeu s'appelle Trackigami

**`PHYS_VER` reste 38**, rien ne change dans la course : records, fantômes, médailles et classements restent valables.

- **Nouveau nom : Trackigami** (« track » + origami : des circuits pliés en facettes, comme le style low-poly du jeu).
  - Côté joueur : titre de la page, logos (accueil, menu, écran de bienvenue), manifeste de l'application installée, pied du menu, partage d'une invitation, pages légales, thème d'interface par défaut, auteur affiché des circuits officiels, wiki.
  - Fichiers téléchargés (vidéos, sauvegardes) : préfixés `trackigami-`.
  - Côté projet : README, documentation, commentaires du code, en-têtes des étapes SQL et des fonctions serveur, historique des versions.
- **Rien n'est perdu.**
  - Les identifiants techniques ne changent pas : clés de sauvegarde du navigateur, adresse du dépôt et du site, projet du serveur, tâche de purge nocturne déjà planifiée.
  - L'auteur écrit dans le code des circuits officiels non plus, car il fait partie de leur clé de classement ; l'écran affiche le nom du jeu à sa place.
- **Historique des versions relu** : plus aucune référence à un autre jeu. Les passages sur les lois de conduite décrivent ce que fait le jeu.
- Test : `test-legal` vérifie aussi que l'ancien nom n'apparaît plus nulle part dans le dépôt.

## Bêta 0.15.1 — wiki à jour, bouton « Continuer la carrière » lisible

**`PHYS_VER` reste 38.**

- **Wiki à jour des versions 0.13.1 à 0.15.0.**
  - Pages mises à jour : première course guidée, tuile Garage, pause, mini-carte et « mauvais sens », caméra stable, « Continuer la carrière », garage en quatre familles, écran Modes à onglets.
  - Nouvelle rubrique « Jouer à plusieurs » : lien d'invitation, salon, prêt, modes, revanche, relais pour les réseaux fermés.
  - Captures des menus refaites, et deux nouvelles : la pause en course et le salon multijoueur.
  - Chiffres des tests mis à jour.
- **Corrigé** : le petit texte du bouton « ▶ Continuer la carrière » (« Chapitre 1 · … ») était clair sur fond corail ; il prend la couleur du bouton.
- En production : l'étape SQL 19 (avis des testeurs) est appliquée et le relais TURN (Cloudflare) est en place, tous deux vérifiés.

## Bêta 0.15.0 — parcours du joueur : pause complète, carrière, modes, garage, mini-carte, mauvais sens

**`PHYS_VER` reste 38**, rien ne change dans la course : records, fantômes et médailles restent valables. Phase B (parcours du joueur) de
[docs/ANALYSE-FONCTIONNELLE.md](docs/ANALYSE-FONCTIONNELLE.md).

- **Pause complète.** En plus de Reprendre, Recommencer et Quitter : « Retour au checkpoint » (R), « 🎥 Caméra » (change de vue et affiche son nom),
  « Commandes », et des réglages rapides sans quitter la course : volume des effets et de la musique, tremblements de la caméra, champ de vision.
- **« ▶ Continuer la carrière »** en haut de l'écran de la carrière (Jouer › Carrière) : ouvre directement le prochain circuit à médailler du premier chapitre ouvert.
  Les chapitres viennent d'abord ; le défi du jour et la saison passent après.
- **Écran Modes à onglets** : Modes fournis, Mes modes, Modes publiés, Paquets (mods). Chaque mode est une carte avec une icône (moto, bateau,
  gravité, tours, hors-piste…), ses règles en étiquettes, son objectif et « Jouer ». Avant : une longue liste d'un bloc.
- **« Ou jouer ce circuit en mode… »** sur la fiche d'un circuit : une liste déroulante lance le circuit avec les règles d'un mode (fourni ou à soi).
- **Garage en entrée principale.** La tuile « Profil » de l'accueil devient « Garage » (voiture, compte, sauvegardes) et le garage vient en premier.
  Ses 14 onglets sont rangés en quatre familles (Voiture, Peinture, Effets, Mes créations) : une rangée de familles, puis les onglets de la famille choisie.
- **Première course guidée.** La première fenêtre du tutoriel propose « 🏁 Première course guidée » : la leçon 1 de l'Académie, avec ses consignes.
- **Mini-carte** en course, en haut à gauche : le tracé vu de dessus, ta voiture, ton fantôme (or) et les autres joueurs (à leur couleur).
  Elle se cache dans Interface › masquer, et le profil d'interface « minimal » la retire.
- **« ⛔ Mauvais sens »** quand la voiture roule à contre-sens du tracé pendant plus d'une demi-seconde (au sol, au-delà de 8 m/s) ; jamais à tort
  sur les 18 circuits vérifiés en entier.
- **Corrigé** : un Échap qui venait de fermer un panneau de l'accueil pouvait refermer aussitôt l'écran ouvert juste après (la fiche d'un circuit
  ouverte depuis les records se refermait). C'était la cause du test « records et médailles » qui échouait par moments.
- **Corrigé** : une voiture distante sans couleur connue ne fait plus planter la mini-carte.
- Tests : `test-minimap` (nouveau), `test-menu`, `test-browser-moteurs`.

## Bêta 0.14.0 — multijoueur : lien d'invitation, salon en grand, course à départ commun, revanche

**`PHYS_VER` reste 38.** Phase C (fondations du multijoueur) de [docs/ANALYSE-FONCTIONNELLE.md](docs/ANALYSE-FONCTIONNELLE.md), sauf le relais
réseau (TURN), qui attend le choix d'un service par l'éditeur.

- **Lien d'invitation.** « 🔗 Copier le lien d'invitation » (et « 📤 Partager » sur téléphone) donne l'adresse du jeu suivie de `#salle=CODE`.
  L'ouvrir lance le jeu et rejoint la salle directement, après le pseudo.
- **Salon en grand, sur deux colonnes.**
  - À gauche : le code, l'invitation et les joueurs, chacun avec la couleur de sa voiture, ★ pour l'hôte, son état (prêt, pas prêt, en course) et sa liaison.
  - À droite : le mode, le circuit avec son aperçu (circuits intégrés), les collisions, le salon public et les règles. L'invité voit le mode et le circuit choisis par l'hôte.
- **Prêt.** Chacun clique « Je suis prêt » (« 1 / 2 prêts »). Si quelqu'un n'est pas prêt, le premier « Lancer » de l'hôte avertit ; le second part quand même.
- **Course à départ commun** (nouveau mode, choisi par défaut) : un circuit (intégré ou de la communauté), départ sur une grille, classement en direct, « 🏁 Course terminée » à l'arrivée. Le championnat (plusieurs manches) et la course libre (fantômes, chacun à son rythme) restent.
- **Revanche.** À la fin d'une course ou d'un championnat, les invités cliquent « 🔁 Je veux une revanche » (l'hôte voit « Revanche demandée : 1 / 2 ») ; l'hôte relance les mêmes circuits pour tous en un clic.
- **Les voitures des autres ont leur apparence du garage** : de vraies voitures dans une course à départ commun ou un championnat, des fantômes de leur couleur en course libre. Avant : un fantôme d'une couleur de joueur.
- **Connexion impossible expliquée** dans le salon, avec la cause (réseaux qui bloquent la connexion directe : 4G, école, entreprise) et quoi essayer.
- Tests : `test-net` (voiture annoncée et filtrée, prêt, mode de l'hôte, revanche, apparence des voitures), `test-browser` (lien, prêt, course, revanche à deux onglets ; le championnat déclare ses joueurs prêts).

## Bêta 0.13.1 — caméra stable, boutons lisibles, néons et moto corrigés, nouvelle version annoncée

**`PHYS_VER` reste 38**, rien ne change dans la course : records, fantômes et médailles restent valables. Phase A du plan tiré de l'analyse
fonctionnelle ([docs/ANALYSE-FONCTIONNELLE.md](docs/ANALYSE-FONCTIONNELLE.md)).

- **La caméra ne tremble plus.**
  - Elle est calculée au pas de la physique (120 fois par seconde), puis lissée entre deux pas à l'affichage, comme la voiture. Avant, elle tremblait sur les écrans 120/144 Hz et quand le nombre d'images variait.
  - La visée de la zone de réception pendant un saut était la plus grosse source d'à-coups. Le point de chute est maintenant interpolé (il sautait de plusieurs mètres d'un calcul à l'autre) et lissé dans le temps. La pente visée et la vitesse compensée sont lissées aussi.
  - Mesure (centile 99 des à-coups de rotation, 16 circuits) : en moyenne **199 → 46** à 144 images/s, **51 → 26** à 60 images/s. Exemples : Braises 429 → 70, Garde 537 → 70.
  - La secousse après un choc est un mouvement doux, plus un tirage au hasard à chaque image. Les accélérateurs ne secouent plus la caméra (le coup de champ de vision reste).
  - Entrée et sortie des loopings, tubes et murs fondues sur 0,35 s ; caméra remontée en douceur au-dessus du sol ; passage sous un pont fondu.
- **Boutons lisibles sur tout décor.** Les boutons des menus ont un liseré clair et une ombre ; chaque thème a ses couleurs de bouton (Crépuscule, Forêt, Minuit, Mono, Contraste élevé). Avant, ils disparaissaient sur un décor sombre (« noir sur noir »).
- **Nouvelle version annoncée.** Un onglet resté ouvert vérifie toutes les 30 minutes, et au retour sur l'onglet, si une version plus récente est en ligne. Il propose alors « Recharger », jamais pendant une course.
- **Néons ajustés à chaque carrosserie.** Les barres restent entre les roues et le halo épouse la voiture ; sous la moto, plus de barres dans le vide. Les jantes néon se voient sur la moto.
- **Pilote de moto refait** : cuisses, jambes et pieds aux repose-pieds, bras jusqu'aux poignées du guidon (aussi sur le chopper).
- **Téléphone en paysage** : la fenêtre d'arrivée passe sur deux colonnes et tient dans l'écran avec ses deux rangées de boutons. Les messages s'affichent en haut.
- **Éditeur** : les réglages de la pièce, collés en bas de la palette, se replient d'un clic sur leur titre (choix gardé) et prennent moins de place.
- **Publication d'un circuit** : en cas d'échec, la fenêtre reste ouverte avec l'erreur et on peut réessayer (avant, elle se fermait et il fallait tout refaire) ; fermer avec Échap compte comme « Annuler ».
- Tests : `test-vehicules`, `test-mise-a-jour`, des contrôles de caméra en plus (`test-camera`, `test-camrig`, à-coups à 144 images/s dans `test-browser-camera`), des boutons de chaque thème (`test-contraste`), de l'arrivée sur téléphone en paysage (`test-browser`), de la publication, de la nouvelle version et des réglages repliables (`test-browser-moteurs`).

## Bêta 0.13.0 — version d'essai : avis des testeurs dans le jeu, médailles calées sur un petit groupe

**`PHYS_VER` reste 38**, rien ne change dans la course. Phase 4 du plan de la 1.0 : les essais humains. Protocole, message aux testeurs et suite :
[docs/ESSAIS.md](docs/ESSAIS.md). **Demande l'étape SQL 19** (`supabase/etape19-avis.sql`, à appliquer avant la mise en ligne :
[supabase/MIGRATIONS.md](supabase/MIGRATIONS.md)).

- **« Donner mon avis »** (Paramètres, et en bas de l'accueil) : appareil, commandes, expérience des jeux de course, plaisir de jeu, caméra, et
  quatre équilibrages de « trop dur » à « trop facile » (dérapage, chocs contre les murs, contrôle en l'air, difficulté des circuits), deux textes
  libres courts. Anonyme : le pseudo n'est joint que si le joueur coche la case. Proposé **une seule fois**, après 6 courses finies, aux joueurs qui
  ont accepté les statistiques anonymes. Conservé 12 mois (page Confidentialité mise à jour, en français et en anglais).
- **Étape SQL 19** : table `feedback` fermée à la lecture, envoi par `submit_feedback` (valeurs bornées, adresses web retirées, 5 avis par
  appareil et par jour), avis dans la purge nocturne et dans le rapport de santé (`tools/surveillance.mjs` les compte).
- **Médailles calées sur 8 testeurs** (`tools/essais.mjs`) : chaque meilleur temps est rapporté au temps du pilote automatique du même circuit ;
  un modèle commun « niveau du testeur × difficulté du circuit » donne les médailles des **72** circuits même quand chacun n'a que quelques temps
  (cible : bronze pour 90 % des testeurs, argent la moitié, or 15 %, cristal 3 %). Les temps impossibles et les raccourcis isolés sont écartés, et
  le rapport nomme les circuits concernés. Il donne aussi les facteurs à reporter sur le circuit du jour (où chaque arrivée décroche aujourd'hui le
  Cristal) et résume les avis par groupe (débutants, habitués, appareil). Les médailles ne seront écrites qu'après les essais.
- Une fenêtre qui s'ouvre juste après un appui sur Échap ne se referme plus toute seule.
- CSV du tableau de bord Supabase lus correctement (virgules et retours à la ligne dans un champ) par `tools/telemetry-report.mjs`.

## Bêta 0.12.6 — qualité et plateformes : Firefox et Safari vérifiés, hors ligne réparé, clavier, contraste

**`PHYS_VER` reste 38**, rien ne change dans la course. Phase 3 du plan de la 1.0. Cibles, mesures et vérifications : [docs/PLATEFORMES.md](docs/PLATEFORMES.md).

- **Hors ligne réparé** : après une première visite, le jeu ne redémarrait plus sans réseau. `js/verify.js`, importé par l'écran Communauté, était
  exclu de la copie du service worker ; la garde de démarrage prenait l'échec pour une mise à jour et **effaçait la copie hors ligne**. Les deux sont
  corrigés : tout le code du jeu est dans la copie, et la garde n'efface plus rien hors ligne (elle le dit, avec « Réessayer »).
- **Firefox et WebKit (Safari)** vérifiés à chaque envoi (`tools/test-browser-moteurs.mjs`, tâche CI `moteurs`) : accueil, menu, 3D, course,
  éditeur, contexte WebGL perdu, clavier, anglais, pages légales.
- **Contexte WebGL perdu** (mémoire graphique, pilote réinitialisé) : la course passe en pause et le joueur est prévenu ; l'affichage reprend quand
  le navigateur le rend, sinon « Recharger » est proposé au bout de 8 s.
- **Sans WebGL 2** : un message dit quoi faire (accélération matérielle, mise à jour, autre navigateur) au lieu d'un écran d'accueil inutile ;
  les autres échecs de démarrage disent de recharger, traduits.
- **Clavier** : les flèches parcourent les menus, le garage et les fenêtres (même navigation que la manette) ; Entrée choisit, Échap revient.
- **Contraste** vérifié pour les six thèmes (WCAG, 4,5:1 pour le texte) ; les messages d'erreur des thèmes Crépuscule et Forêt sont éclaircis.
- **Pentes posées au mur** : leur bord incliné déborde dans la case d'avant et d'après ; l'éditeur y refuse désormais une pièce qui ne les prolonge
  pas, avec un message (pose, aperçu, prolonger, collage, déplacement). Les circuits existants se lisent comme avant. Pièces verticales sans
  poteau : style « suspendu » assumé (décision écrite dans `docs/AUDIT-RENDU-0.12.2.md`).
- **Multijoueur en direct marqué « bêta »** pour la 1.0.
- **Chargement mesuré** (`tools/mesure-chargement.mjs`, GitHub Pages simulé) : accueil en 1,2 s et menu en 2,1 s en 4G à la première visite,
  0,4 s ensuite. Objectif tenu : pas de compilation à la publication.
- CI : relançable à la main (pour éprouver sa stabilité) ; tests `test-debordement`, `test-contraste`, `test-hors-ligne`, deux de plus dans
  `test-browser-boot` (hors ligne, sans WebGL 2).

## Bêta 0.12.5 — la base prête pour la 1.0 : sécurité, conservation, erreurs remontées, surveillance

**`PHYS_VER` reste 38.** Phase 2 du plan de la 1.0 (base et serveur). **Étape SQL 18 appliquée en production le 19 novembre 2026 et vérifiée**
(`supabase/etape18-maintenance.sql`, relançable, ne supprime rien en s'appliquant : [supabase/MIGRATIONS.md](supabase/MIGRATIONS.md)). La logique
des fonctions serveur ne change pas ; `submit-score` sera redéployée avec la mise en ligne (son empreinte de build suit le nom du jeu).

- **Sécurité de la base** : chemin de recherche fixé sur les 5 fonctions signalées par Supabase ; les fonctions de déclencheur ne s'appellent plus
  par l'API (elles se déclenchent toujours).
- **Performance** : un index pour chacune des 10 clés étrangères qui n'en avaient pas ; 16 règles d'accès réécrites pour n'évaluer le joueur
  qu'une fois par requête (mêmes conditions) ; clés primaires sur les deux tables de compteurs.
- **Conservation des données appliquée par la base**, comme l'annonce la page Confidentialité : chaque nuit, les sessions invitées sans activité
  depuis 12 mois (et ce qui leur appartient), les statistiques de plus de 12 mois, les erreurs de plus de 90 jours et les compteurs anti-abus sont
  effacés (`purge_expired()`, `pg_cron`). Les comptes ne sont jamais purgés.
- **Erreurs du jeu remontées**, anonymes et seulement avec l'accord déjà donné pour les statistiques (`js/errorReport.js`) : message nettoyé
  (sans adresse, identifiant ni e-mail), fichier et ligne du code, version, famille de navigateur. Le texte d'accord, l'infobulle du réglage et la
  page Confidentialité le disent.
- **Surveillance quotidienne** (`tools/surveillance.mjs`, `.github/workflows/surveillance.yml`) : site, fonction `submit-score`, santé de la base
  (`health_report()`) ; une alerte envoie un e-mail au propriétaire du dépôt. Elle garde aussi le projet gratuit actif (pas de mise en pause).
- **Sauvegarde hebdomadaire chiffrée** hors de Supabase (`.github/workflows/sauvegarde.yml`), dès que ses deux secrets sont réglés ; procédure de
  restauration et essai à faire : [docs/EXPLOITATION.md](docs/EXPLOITATION.md).
- **Archivage des temps des anciennes physiques préparé** (`scores_archive`, `archive_old_scores`) : lancé une seule fois à la sortie de la 1.0.
  Décision : la physique est gelée pour toute la 1.x. L'export des données du joueur inclut ses temps archivés.
- Tests : `tools/test-etape18-sql.sh` (33 contrôles ; les 73 attaques de `test-securite-sql.sh` rejouées après l'étape 18), `test-erreurs`,
  `test-surveillance` ; `verify-prod.sql` a une section « étape 18 ». Test navigateur « aides à la conduite » : course corrigée (le passage
  « animations réduites » oui puis non tombait parfois avant le même rendu, et l'évènement attendu n'arrivait jamais).
- **À faire par l'éditeur** : activer la protection contre les mots de passe divulgués (Supabase › Authentication) ; régler les secrets de la
  sauvegarde ; décider offre gratuite ou Pro avant la 1.0 ; faire une fois l'essai de restauration sur un projet de test.

## Bêta 0.12.4 — un seul nom pour le jeu ; licences, confidentialité et mentions légales

**`PHYS_VER` reste 38**, rien ne change dans la course. Phase 1 du plan de la version 1.0 (légal et identité).

- **Un seul nom affiché.** Titre, menu, écran d'accueil, manifeste, wiki, auteur des circuits officiels, fichiers téléchargés (préfixés du nom du jeu).
  Le nom vient d'une seule constante, `GAME_NAME` (`js/version.js`). Les identifiants techniques ne bougent pas (clés de sauvegarde,
  dépôt, projet du serveur) : aucune progression n'est perdue.
- **Notes de version, wiki, commentaires du code et tests relus et réécrits** ; les lois de conduite et leurs tests sont décrits dans
  [docs/LOIS-PHYSIQUE.md](docs/LOIS-PHYSIQUE.md).
- **Licence MIT** ([LICENSE](LICENSE)) et liste des composants tiers ([THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)).
- **Pages Confidentialité, Mentions légales, Règles de la communauté, Crédits et licences**, en français et en anglais : dans le jeu (barre du bas du menu,
  Paramètres › Confidentialité et licences) et sur [legal.html](legal.html), lisible sans lancer le jeu. Une seule source : `js/legal.js`.
- **15 ans ou plus** (ou l'accord d'un parent) : case à cocher à la création d'un compte et à la publication d'un circuit, avec les règles de la communauté ;
  rappel des règles sous les commentaires.
- **Exporter mes données** (Profil › Sauvegardes) : un fichier JSON avec ce que l'appareil et le serveur gardent au nom du joueur, sans aucun jeton.
- **Musique du menu** : le fichier MP3 (2,1 Mo), dont l'auteur et la licence n'étaient pas connus, est retiré ; le menu joue la musique synthétisée du jeu.
  Chargement plus léger d'autant.
- **Polices servies par le jeu** (Chakra Petch, et les polices du wiki) au lieu de Google Fonts : plus aucune adresse IP de joueur envoyée à un service de
  polices ; la politique de sécurité du contenu n'autorise plus aucun serveur de polices extérieur.
- Wiki : la carte « En l'air » décrit le contrôle en l'air de la 0.12.3.
- Tests : `tools/test-legal.mjs` (nom unique, licences, pages dans les deux langues, case d'âge, export, statistiques sans
  accord) ; `test-securite-client` vérifie qu'aucune page ne charge de police extérieure.
- **À faire par l'éditeur** : régler une adresse de contact réservée au jeu (`legal.contact` dans `js/config.js`) ; vérifier le nom du jeu auprès de
  l'INPI et de l'EUIPO avant la 1.0. Les durées de conservation annoncées (12 mois) seront appliquées par la base en phase 2.

## Bêta 0.12.3 — la voiture se pilote un peu en l'air

**`PHYS_VER` reste 38** (la 0.12.2 n'est pas encore publiée ; le redéploiement de `submit-score` qu'elle demande couvre aussi ce changement).

- **Bascule aux pédales en l'air** : l'accélérateur penche la voiture vers l'avant (le nez descend), le frein vers l'arrière (le nez remonte), jusqu'à
  22° au plus, atteints en une seconde environ ; au relâché, la voiture revient doucement. Elle s'ajoute à la rotation prise au décollage, toujours gardée :
  impossible de faire un tour complet aux pédales. Avant, l'effet des gaz était imperceptible (0,5 °/s²).
- **Le frein amortit toujours la rotation** (aérofrein). **Frein et accélérateur ensemble** : l'aérofrein seul, sans bascule.
- **Volant en l'air** : il tourne la voiture en douceur, comme le vent sur une voile (26 °/s au plus), et s'arrête quand on le lâche. Avant, il ne faisait
  rien en l'air.
- Tout est dans la physique : la bascule se voit au replay, sur les fantômes et en multijoueur, et compte à la réception comme l'assiette.
- Pilote automatique : il garde sa conduite d'avant (aérofrein avec les deux pédales, volant au neutre en l'air) ; ses temps bougent de 0,03 à 0,09 s,
  médailles inchangées.
- Textes de l'académie, du défi de saut et de l'aide mis à jour (français et anglais).
- Tests : `test-sans-aide` (bascule bornée, lacet doux, frein + gaz), `test-physique-corrections` (réceptions avec chaque pédale).

## Bêta 0.12.2 — audit complet du rendu : poteaux, tapis, tubes, marquages, terrain, météo, caméra

**`PHYS_VER` passe à 38** : le tube a désormais une coque pleine (voir plus bas). **Redéployer `submit-score`** (`npm run build:function` est fait ; la fonction
embarque la physique) au moment de publier cette version : un record envoyé avec l'ancienne physique ne se rejoue plus pareil.

Audit de tout ce qui se dessine, piloté par des outils neufs (`tools/audit-rendu/`) : une matrice de toutes les pièces dans toutes les orientations
(1 346 combinaisons, 30 000 variantes de revêtements et d'options), des sondes qui mesurent au lieu de regarder, un banc de rendu (le vrai moteur sans
menus), une machine à captures, des tours automatiques des 72 circuits officiels et des mesures de performance. Défauts corrigés :

- **Poteaux qui traversaient la route** dans les pentes et les virages qui montent (260 pièces, jusqu'à 2,85 m ; 66 circuits officiels sur 72) : le chapeau
  du poteau, plat et calé au centre, suit maintenant le dessous de la dalle. Le poteau des **plaques triangle** est sous leur centre de gravité (il était
  sur le bord, à moitié dans le vide).
- **Poteaux sous les rubans posés en hauteur** (virages relevés, tubes, tire-bouchons, transitions vers un mur…), qui flottaient : jusqu'à trois, sous les
  passages à plat. Les pièces verticales (mur, sommet de looping) restent sans support.
- **Tapis roulant** : les chevrons pointent dans le sens de la poussée (au réglage par défaut, ils pointaient à l'envers ; ils n'étaient justes qu'en marche
  arrière) ; à 0 km/h, plus de chevrons.
- **Pièces qui passaient sous le terrain** : la vrille (−11,6 m), le tire-bouchon (−3,85 m), les loopings double et triple (−0,4 m) ne se posent plus
  aussi bas dans l'éditeur (vrille : niveau 2 au moins ; tire-bouchon : 1 ; loopings double et triple : ½). Dans un circuit existant, le terrain est
  creusé sous elles (une fosse). Les circuits générés (défis du jour) se reconstruisent comme avant.
- **Marquages des revêtements** à la largeur de la route : ils débordaient de 5 m dans le vide sur une route étroite et ne couvraient que le milieu d'une
  route large. La **cale du bateau** sur une route étroite redessinait la route à la largeur normale (24 m au lieu de 12).
- **Vent** : dans un virage, les flèches gardent la direction de la poussée (l'axe de la pièce) au lieu de tourner avec la route ; leur longueur dit la
  force ; à 100 % (aucun vent), plus de flèches.
- **Tube** (physique) : la coque est pleine. Une voiture décrochée en haut du tube y reste et retombe au fond ; une voiture qui tombe sur le tube reste
  dehors (avant : elle traversait la coque et se retrouvait dedans, comme téléportée). Les temps du pilote changent de 0,1 à 0,9 s sur 22 circuits
  officiels où la voiture frôlait la paroi en sortie de tube : leurs médailles sont recalées (or = temps du pilote).
- **Météo** (pluie, neige, braises…) : elle s'estompe dans un tunnel, dans un tube et sous une route (elle tombait à travers le toit).
- **Caméra** : en gravité inversée au-dessus d'une route ordinaire, elle n'entre plus dans la dalle (on voyait à travers, sur « Cristal Fêlé »).
- **Scintillement** des marquages et des revêtements animés au loin (et de près sur les appareils à tampon de profondeur 16 bits) : décalage de profondeur.
- Détails : courbes en S raides et chicanes posées sur un mur dessinées plus finement (la route dessinée s'écartait de 12 à 26 cm de celle de la physique) ;
  plus de traces de pneus sur l'eau ; la texture des immeubles du décor « ville » est libérée à chaque changement de circuit (une de plus à chaque chargement).
- Vérifié sans défaut : la route dessinée suit celle de la physique partout (8 cm), les anneaux sont là où ils se déclenchent, les 341 décors se construisent,
  aucune fuite de géométrie, 19 à 90 ms pour construire un circuit officiel, 1 à 12 ms par modification dans l'éditeur.
- Tests : `tools/test-audit-rendu.mjs` (chaque sonde d'un défaut corrigé ne trouve plus rien), `tools/test-familles.mjs` (looping triple au niveau 0).
  Rapport : `docs/AUDIT-RENDU-0.12.2.md`.

## Bêta 0.12.1 — l'orientation se choisit avec la pièce

**`PHYS_VER` reste 37.**

- Éditeur : une liste **Orientation** dans les réglages de la pièce choisie, à côté de Largeur, Rayon, Inclinaison, Sens : *à l'endroit (sol)*, *à l'envers
  (plafond)*, *sur le côté gauche* ou *droit (mur)*, et inclinée ou en surplomb à 45° / 135°. La pièce se pose directement ainsi (avant : chercher l'option dans
  « Options de la pièce », repliées, ou corriger chaque pièce posée dans l'Inspecteur). Les orientations qu'une pièce refuse sont grisées, avec leur raison.
  **Touche O** : orientation suivante (Maj + O : précédente).
- Test : `tools/test-rangement.mjs`.

## Bêta 0.12.0 — l'éditeur rangé en quatre zones, des familles de pièces complètes, onze défauts corrigés

**`PHYS_VER` reste 37** : la physique des pièces existantes ne change pas (empreinte identique), les circuits intégrés non plus. **Redéployer `submit-score`** : la fonction
embarque `pieces.js` ; sans cela, un circuit qui utilise une des nouvelles pièces ne peut pas être vérifié par le serveur.

- **Rangement de l'éditeur en quatre zones**, un rôle chacune :
  - **en haut, le circuit** : menu *Fichier* (nouveau, ouvrir, importer, partager, enregistrer, enregistrer une copie, aide), le nom du circuit (un clic le renomme ;
    un point orange tant qu'il n'est pas enregistré), *⚙ Circuit*, annuler / rétablir, la pastille des problèmes, *▶ Tester ▾* et *🏁 Vérifier et publier* ;
  - **à gauche** : un rail de six outils (Pistes, Peinture, Décors, Sélection, Inspecter, Gomme) et le panneau de l'outil. Pistes : bibliothèque par sections,
    recherche, pièces récentes ; sous la pièce choisie, ses caractéristiques, ses options et Pivoter / Miroir / Prolonger. L'onglet Options disparaît (ses deux usages :
    les réglages de la pièce, et l'Inspecteur ou « Option… » de la barre de sélection) ; le pot de peinture devient l'interrupteur « Remplir » de chaque outil.
    Décors : cinq familles au lieu de 35 catégories en ligne, les solides (qui comptent pour la course) à part ; recherche ;
  - **à droite, la vue** : niveau, ce niveau seul, dessus, recentrer, ras du sol, grille, calques (avec leurs libellés) ;
  - la **barre de sélection** flotte au-dessus de la zone ; **glisser dans la zone la déplace** (un seul pas d'annulation) ;
  - la fenêtre **« Circuit »** a six onglets (général, course, conditions, ambiance, déclencheurs, logique) ; changer d'onglet applique ce qui a été modifié ;
  - sur **téléphone**, le panneau devient un tiroir qui se referme après un choix, la colonne Vue se replie ; une ligne du bas rappelle la pièce choisie et les gestes.
- **Familles de pièces complètes** (270 pièces nouvelles, 442 au total) : chaque combinaison de chaque famille existe, ou est grisée avec sa raison
  (`families.js : missingReason`, vérifié par `tools/test-familles-completes.mjs`).
  - **Largeur** (étroite, normale, large) : caractéristique de la Ligne droite, de la Courbe et du Virage. Route large en pente (3×3 : montée 1 = 3 niveaux), courbes
    étroites et larges, virages étroits (tous rayons) et larges (grand, très grand, géant : même rayon que la route normale, empreinte plus grande d'une case) ;
    élargissement étroite → large. « Prolonger » pose les raccords de largeur dans le bon sens et les insère tout seul.
  - Très grand virage incliné ; **virages relevés qui montent ou descendent** (grand, très grand, géant, ↱ / ↰) ; courbe en S de 2 et 4 niveaux ; grand S rapide (4×4,
    deux colonnes) ; transitions de 90° entre orientations inclinées, et les transitions de 45° rangées dans la famille Transition.
  - Tube, Looping modulaire, Tire-bouchon et Bifurcation deviennent des familles.
  - La matrice de compatibilité roule chaque nouvelle pièce : deux seules ne passent pas au sol (`ncvd4`, `ncvdL4`, le virage serré étroit qui descend de 4 niveaux),
    comme leurs équivalentes de largeur normale ; le vérificateur les signale.
- **Défauts corrigés** :
  - **perte de travail** : quitter l'éditeur, ouvrir un autre circuit, « Nouveau » ou l'import enregistrent le circuit modifié dans « Mes circuits » (avant : seul
    l'unique brouillon le gardait, et la session suivante l'écrasait) ;
  - **Échap** referme l'inspecteur, retire la sélection, puis ramène au menu (la touche était perdue au premier test) ;
  - **vérificateur** : extrémités rangées par cubes de 2 m (5 000 pièces : 3,9 s → 0,12 s par pose, résultats identiques sur 360 circuits) ; pastille différée sur un
    grand circuit, et à jour après les paramètres du niveau ;
  - « Charger dans l'éditeur » garde la logique, les noms de groupes, l'auteur et la vérification ; « Convertir les déclencheurs » ne perd plus les règles ;
  - les calques verrouillés ou masqués ne sont plus remplacés par la pose, le collage ni le pot de peinture ; le collage n'efface plus le départ ;
  - un pincement à deux doigts ne pose plus de pièce ; la pipette pendant un collage le quitte ; matériaux libérés en quittant l'éditeur ;
  - l'**historique d'annulation**, le presse-papiers, les options armées et les calques traversent un **essai**.
- Tests : `test-editeur-012`, `test-familles-completes`, `test-rangement` (nouveaux) ; quatre tests navigateur de l'éditeur (vrais clics et glissés) ; familles, matrice,
  traductions anglaises, wiki (section Éditeur réécrite, captures de l'éditeur refaites).

## Bêta 0.11.4 — familles : la bifurcation en T, le virage géant relevé et incliné

**`PHYS_VER` reste 37** (pas encore publiée). **Redéployer `submit-score`** : onze circuits changent.

- **Bifurcation en T** (script `TSPL … TALT … TMRG`, branche à gauche : `TSPLL`) : le carrefour en T sert enfin. On arrive par son pied, on choisit **tout droit**
  ou **la branche** ; les deux voies se rejoignent à un second T, la branche arrivant par le côté. Le virage à 90° dans un T est serré : le choix intéressant est
  « risque contre sécurité ». Dans les circuits, la voie directe **saute un vide**, la branche **fait le tour** (8 s de plus, sans risque).
  Vérificateur : un T n'est plus pris pour un raccourci (la règle de la 0.11.0 ne vise plus que les croisements) ; il signale un checkpoint posé dans une voie
  (tous doivent être pris : qui prend l'autre voie ne finirait plus).
- **Virage géant relevé** et **virages géants inclinés** (montée ou descente de ½ à 4 niveaux, ↱ / ↰) : la famille Virage a maintenant toutes ses combinaisons
  au rayon Géant (17 pièces, script `XBR`, `XUR n`, `XDR n`).
- **Circuits** :
  - bifurcation en T : **Temple** (avant le croisement) et **Viaduc Vertical** (au sommet) ;
  - la boucle « croisement + trois virages géants plats », répétée sur neuf circuits, est variée : relevée (Lagon, Néons, Éclats, Cadence), en pente
    (Lianes, Quai), qui plonge et remonte (Barrière), relevée et en pente (Archipel, Galerie).
  Les 72 circuits tiennent leur contrat ; temps quasi inchangés, médailles inchangées.
- Correction : le réglage « animations réduites : Système » suit le changement du réglage du système même quand le navigateur ne le signale pas (relu toutes
  les 2 s) ; c'était la cause d'un test navigateur instable.
- Tests : `tools/test-familles-04.mjs` (nouveau) ; familles, accessibilité. Wiki : carrefours, jetons de script, glossaire.
- Pas faits dans cette phase (repoussés) : largeur variable des virages et des pentes, chicanes relevées ou inclinées, plaques inclinées, tubes de grand rayon ou en
  pente, checkpoint posé sur un carrefour.

## Bêta 0.11.3 — wall-rides 2.0 : la route monte le long du mur, des blocs à passer par-dessus

**`PHYS_VER` reste 37** (pas encore publiée : une seule remise à zéro des records avec la 0.11.1). **Redéployer `submit-score`** : douze circuits changent.

- **Chicane posée sur un mur** (nouveau, éditeur et script `ZL< ZR4> …`) : roulée sur le mur, son décalage d'une colonne devient une **montée ou une descente de 32 m le
  long du mur** (64 m pour le grand S), en S lisse. Deux à la suite font une **bosse** : la route monte, puis redescend (« un virage, mais sur le côté »). Elle se pilote
  au volant (rien ne guide), à partir de 150 km/h ; la chicane rapide (4 cases) passe jusqu'à 260 km/h, la courte qui descend est trop brusque (signalée par le vérificateur).
  Sur un mur gauche, la chicane vers la gauche monte ; sur un mur droit, celle vers la droite.
- **Blocs sur un mur** : un solide (bloc, pilier…) arrête maintenant une voiture qui roule sur un mur, un looping ou un tube (avant, elle le traversait). Dans un circuit,
  un obstacle `{ wall: 'bas' }` se colle sur le bas du mur (il faut passer **au-dessus**), `{ wall: 'haut' }` sur le haut (passer **dessous**) ; le pilote automatique
  change de ligne avant le bloc.
- **Douze circuits** reçoivent ces wall-rides (un ou deux par chapitre) :
  - **slalom entre deux blocs** sur le mur : Canyon Corail, Couronne Boréale, Canopée ;
  - **un bloc sur chaque mur** : Hyperboucle, Engrenages, Épave Engloutie, Tourbillon Tropical ;
  - **bosse sur le mur** (monter de 32 m, redescendre) : Viaduc Vertical, Cheminée du Volcan, Montgolfières, Vrilles Souterraines, Ceinture d'Astéroïdes
    (médailles recalculées : leur mur est plus long, de 2,6 à 3 s).
  Les 72 circuits tiennent leur contrat ; le pilote humain imparfait du banc n'y touche pas un bloc.
- Correction : une décoration à la position illisible (code de circuit abîmé) est refusée ; gardée, elle devenait 0 au ré-encodage.
- Tests : `tools/test-wall-ride.mjs` (nouveau) ; chicanes (sur un mur gauche ou droit), matrice des pièces (la chicane courte qui descend un mur rejoint les CHUTE
  documentées), coach. Wiki : wall-ride, deux captures, jetons de script.

## Bêta 0.11.2 — en l'air, les pédales penchent la voiture d'un rien

**`PHYS_VER` reste 37** (la 0.11.1 n'a pas été publiée : une seule remise à zéro des records). **Redéployer `submit-score`** avec la 0.11.1.

- **En l'air, gaz = le nez descend d'un rien, frein = il remonte d'un rien** (`airTilt`, 0,5 °/s²), en plus de l'aérofrein qui amortit la rotation. Réglé par
  essais (15 vols, en appuyant une fois en l'air) : l'aérofrein amortit la rotation (1,0 /s, contre 0,1 /s sans lui) ; l'effet des gaz reste très faible
  (moins d'un degré après 1,2 s d'appui), juste assez pour se sentir. Le volant, lui, n'agit toujours pas.
- Pilote automatique : il accélère en l'air quand il arriverait trop cabré sur la réception. Circuits, temps et médailles inchangés (72/72 sans choc, contrats tenus).
- Textes (leçon, exercice, aide des commandes, wiki) : l'accélérateur penche le nez d'un rien en l'air.

## Bêta 0.11.1 — loopings et murs à piloter, petit contrôle en l'air : plus aucune aide

**`PHYS_VER` 36 → 37** : records, replays et fantômes repartent de zéro. **Redéployer `submit-score`** (`npm run build:function`, déjà régénérée).

- **Loopings, tire-bouchons, transitions vers un mur : il faut braquer.** La route ne guide plus le cap de la voiture le long de sa courbure (`headingGuided`, une aide
  ajoutée en PHYS_VER 36). Mains lâchées, un looping décalé jette la voiture contre la bordure, un tire-bouchon la sort de la route ; au volant, on passe comme avant.
- **Murs (wall-rides) : la gravité tire vers le bas, le nez pique.** Plus de maintien « magique » au-dessus de 80 km/h (`SIDE_HOLD`, supprimé) : la gravité tire
  pleinement vers le bas du mur et le nez de la voiture pique d'autant plus qu'elle est lente (`SIDE_DROP`, 0,5 · g / v rad/s). Il faut tenir le volant un peu vers le
  haut pour garder sa ligne, plus pour monter ; mains lâchées on tombe, même d'un mur de deux cases. Les pneus gardent toute leur adhérence : un virage posé sur un mur se
  pilote comme au sol. (Une adhérence réduite sur les murs a été essayée : elle rendait impraticables les grands virages sur un mur, la base des wall-rides de la phase 3.)
- **En l'air (nouvelles lois)** : en quittant un bord, la voiture **bascule nez en bas**, d'autant plus qu'elle est lente (65 °/s à
  39 km/h, 38 à 78, 26 à 140, 16 à 225 : `airTip`), et **rien ne la redresse** (le ressort d'assiette qui la reposait d'elle-même est supprimé). Ni les gaz ni le volant
  n'agissent (vérifié : 0,00 °/s de lacet volant tenu). **Seul le frein (aérofrein) freine la rotation** : c'est le petit contrôle en l'air. Bien dosé, il
  amène la voiture à la pente de la réception (réception parfaite) ; oublié, la voiture se pose piquée et perd de la vitesse (à 100 km/h sur un tremplin d'essai : −29 %
  sans aérofrein, −11 % avec).
- **Pilote automatique** (fantôme d'or, démo, validation) : il braque sur les rubans avec une anticipation de la courbure de la pièce et du nez qui pique sur un mur, vise
  la direction de marche sur un mur (en crabe), arrive aligné à l'entrée d'un ruban, et **dose l'aérofrein** : il prévoit où et avec quelle assiette il retombe, et freine
  tant que la rotation l'amènerait au-delà de la pente de la réception (il épargne le lacet d'un saut pris en virage). Réceptions parfaites sur les 72 circuits : 67 → 85.
- **Circuits** : les 72 finissent sans un choc, contrats tenus ; temps quasi inchangés (écart médian 0,00 s, quatre circuits de plus de 0,3 s). **Abysses** : la
  voiture tombait du haut de son looping modulaire (65 km/h au sommet), même avant ; deux boosters de plus avant lui (médailles recalculées, or 45,6 s). **Épave** : une
  section de tube de plus avant la sortie (on retombait du tube sur la route étroite).
- **Académie et exercices** : la leçon *Saut et réception parfaite* et l'exercice *Trois réceptions* se posent maintenant sur une **pente** (sur une terrasse plate, la
  bascule rendait la réception parfaite impossible) ; leurs textes, l'aide des commandes et les conseils du bilan expliquent l'aérofrein (français et anglais).
- **Matrice des pièces** : 71 cases CHUTE (24 avant) : les pentes et courbes en pente raides posées de côté, et le virage serré en surplomb, tournent la route plus vite
  que le volant ne le permet à la vitesse d'un mur ; le vérificateur de l'éditeur les signale.
- **Tests** : `tools/test-sans-aide.mjs` (nouveau) ; mis à jour : murs à 90° (volant tenu / mains lâchées), sauts (aérofrein), looping trop haut, orientations 3D,
  matrice. Wiki : pilotage, commandes, schéma du saut.

## Bêta 0.11.0 — plus de raccourcis : chaque boucle de carrefour a son checkpoint

**`PHYS_VER` inchangé (36)**, temps et médailles inchangés. **Redéployer `submit-score`** : 25 circuits changent (un checkpoint en plus), leurs clés de classement aussi.

- **Défaut corrigé** : 26 croisements, sur 25 circuits, se laissaient **couper** : au premier passage, on tournait directement vers la sortie et on sautait toute la boucle (de 5 à 16 s de gagnées). Chaque boucle a maintenant un **checkpoint** (portique à pylônes), posé à la place d'une ligne droite : le tracé et les temps ne changent pas. Circuits concernés : Premiers Éclats, Lac Gelé (deux boucles), Lianes Néon, Serpent, Temple, Lagon Turquoise, Récif, Grand Archipel, Néons Express, Métro Aérien, Glacier Magnétique, Blizzard, Champs de Basalte, Quai d'Amarrage, Navette, Station Zénith, Jardin de Corail, Grande Barrière, Laminoir, Usine Folle, Rafales, Galerie de Cristal, Plafond Renversé, Cœur de la Montagne, En Cadence.
- **Vérificateur de l'éditeur** : il prévient quand un carrefour traversé deux fois laisse couper la boucle qui revient sur lui (aucun checkpoint, départ ou arrivée entre deux de ses bras) : « Pose un checkpoint dans la boucle. » Le contrat des circuits officiels l'applique aussi.
- **`tools/test-raccourcis.mjs`** (`npm test`) : le vérificateur signale la boucle sans checkpoint et se tait avec ; un pilote qui coupe finit la course sans checkpoint et ne la finit plus avec ; aucun circuit officiel ne se coupe.
- Wiki régénéré (vérificateur, glossaire).

## Bêta 0.10.12 — le wiki du jeu, accessible depuis le menu

**`PHYS_VER` inchangé (36)**, circuits inchangés : rien à redéployer.

- **Wiki du jeu** (`wiki/index.html`, en français) : tout le jeu expliqué, du joueur au développeur. Démarrer et commandes, pilotage (avec un schéma d'un saut), carrière (médailles, objectifs bonus, profils et leur contrat, les 12 chapitres), **les 72 circuits** avec leur carte vue du dessus tracée depuis le chemin du pilote de référence, leurs médailles, leur difficulté et leur objectif (filtres par chapitre et par profil), les 19 revêtements, les véhicules et le garage, les familles de pièces et un **catalogue des pièces avec les icônes de l'éditeur**, les décors solides, les obstacles et les 35 catégories de décorations, l'éditeur et ses raccourcis, les modes et le jeu en ligne, l'architecture (schémas des couches et d'un pas de simulation, codes de partage, langage des circuits intégrés, contrat, tests, mise en ligne), l'historique des versions et un glossaire. Recherche, thème clair ou sombre, lisible sur téléphone ; illustré par des captures du jeu.
- **Dans le jeu** : un bouton **📖 Wiki du jeu** dans la barre du bas de l'accueil, et une entrée *Wiki du jeu* dans le panneau **Créer** (rubrique des pièces). Le wiki s'ouvre dans un nouvel onglet ; il demande le réseau (il n'est pas dans le cache hors ligne : ses images pèsent 2 Mo).
- **`npm run wiki`** (`tools/wiki/build.mjs`) régénère la page à partir du code (circuits, cartes, médailles, icônes de `js/editor/palette.js`, revêtements, obstacles, décorations, versions du CHANGELOG) dans le modèle `tools/wiki/modele.html` ; `node tools/wiki/shots.mjs` refait les captures, le jeu étant servi. `tools/test-wiki.mjs` (`npm test`) vérifie que la page est à jour, que le menu y mène et que ses données et ses images sont là.

## Bêta 0.10.11 — chapitre 12 (Atelier des mécanismes) refait : les 72 circuits sont construits autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits de l'Atelier changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits de l'Atelier gardent leur leçon **telle quelle** : le début du tracé et les mécanismes d'origine (bumpers, piques, piques escamotables, balancier, mur coulissant, marteau, balayeur, ascenseur, glissière) sont au même point du chemin, donc franchis au même instant. Une **vitrine des nouvelles pièces** suit la leçon :
  - **Garde-Fous** (35,2 s) : chicanes longues, route large sous un portique, grand S, murs pleins et blocs ; 19 nouveautés.
  - **En Cadence** (43,7 s) : chicanes longues, croisement traversé deux fois (trois virages géants), passage étroit ; 16 nouveautés.
  - **Le Pendule** (35,2 s) : chicanes longues, route large, tube qui tourne ; 17 nouveautés.
  - **Rotors** (33,9 s) : chicanes longues, **plaque** traversée par la route, route large ; 16 nouveautés.
  - **Monte-Charge** (32,7 s) : chicanes longues, petit **looping modulaire**, route large, murs en L ; 16 nouveautés.
  - **Le Grand Atelier** (39,4 s) : chicanes rapides, route large, tube qui tourne ; 17 nouveautés.
- Contrat du profil « mécanisme » : 14 à **45 s** (32 avant). `tools/test-etape6.mjs` couvre maintenant **les 12 chapitres** (Atelier : 25 à 45 s ; les autres : 45 à 85 s).
- Difficulté estimée : seuils des étoiles recalés une dernière fois sur les 72 circuits refaits (`[7.3, 9.8, 14.1, 20.9]`).

## Bêta 0.10.10 — chapitre 11 (Canyon de cristal) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 11 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits du Canyon de cristal sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés) :
  - **Galerie de Cristal** (sprint, 48,2 s) : volant inversé entre deux cristaux, chicanes rapides, route large, croisement traversé deux fois, grand S ; 20 nouveautés. Objectif « moins de 49,5 s ».
  - **Plafond Renversé** (technique, 59,4 s) : lacets au plafond, passage étroit entre des stalactites, chicanes serrées, cales de cristal, croisement traversé deux fois ; 19 nouveautés.
  - **Cristal Fêlé** (acrobatique, 46,2 s) : cinq inversions sol ↔ plafond, la dernière retombe sur une **plaque**, chicanes longues, route large, passage étroit ; 22 nouveautés. Objectif « moins de 47,5 s ».
  - **Miroir** (speedway, 49,0 s) : route large, chicane rapide, pont de verre entre deux **murs pleins**, grand S, tube qui tourne en miroir ; 19 nouveautés. Objectif inchangé : aucune bordure touchée.
  - **Vrilles Souterraines** (rollercoaster, 47,3 s) : double looping, chicanes longues, route large, **looping modulaire**, tube qui tourne ; 20 nouveautés.
  - **Cœur de la Montagne** (technique, 52,1 s) : passage étroit, chicanes serrées, pyramides de cristal, croisement traversé deux fois ; 20 nouveautés.
- `tools/test-contacts.mjs` : la traversée des dalles en gravité inversée se vérifie sur Cristal Fêlé par rapport à sa médaille d'or (le temps du pilote), plus par rapport à 36 s figées.
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 11.

## Bêta 0.10.9 — chapitre 10 (Ville dans les nuages) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 10 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits de la Ville dans les nuages sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés) :
  - **Premier Envol** (sprint, 46,9 s) : vent entre deux dalles, chicanes rapides, route large, tube qui tourne, grand S ; 23 nouveautés. Objectif « moins de 48 s ».
  - **Îles Suspendues** (acrobatique sans bordures, 48,1 s) : trois sauts reçus sur des **plaques sans bordures** (`*0`), blocs flottants, chicanes longues, route large et grand S sans bordures ; 24 nouveautés. Objectif « moins de 49,5 s ».
  - **Rafales** (technique, 62,1 s) : passage étroit entre des piliers, chicanes serrées, **murets** coupe-vent, croisement traversé deux fois ; 20 nouveautés.
  - **Montgolfières** (rollercoaster, 46,4 s) : **looping modulaire**, route large, tube qui tourne, passage étroit ; 24 nouveautés.
  - **Pont des Vents** (speedway sans bordures, 45,3 s) : murs coupe-vent, route large, chicane rapide, grand S, tube qui tourne ; 19 nouveautés. Objectif inchangé : aucune bordure touchée.
  - **Cité Céleste** (acrobatique, deltaplane, 48,8 s) : vol au-dessus d'une avenue de piliers et d'immeubles, deux sauts reçus sur des plaques ; 27 nouveautés. Objectif « moins de 50 s ».
- **Difficulté estimée (étoiles)** : seuils recalés sur les circuits refaits (`[7.1, 9.7, 13.2, 20.5]`, avant `[4.6, 8, 10, 14]`) : deux fois plus longs, ils montaient presque tous d'une étoile (il ne restait que 3 circuits à une étoile). La répartition visée ne change pas (environ 15, 40, 65 et 88 % des circuits intégrés sous chaque seuil).
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 10.

## Bêta 0.10.8 — chapitre 9 (Usine mécanique) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 9 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits de l'Usine mécanique sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés). Leurs obstacles (bumpers, piques, piques escamotables, marteau) sont gardés et replacés sur des lignes droites du nouveau tracé :
  - **Chaîne de Montage** (sprint, 47,3 s) : moteur coupé entre deux **murs pleins**, chicanes rapides, route large, tube qui tourne, grand S ; 23 nouveautés. Objectif « moins de 48,5 s ».
  - **Laminoir** (technique, 61,7 s) : passage étroit entre des piliers, chicanes serrées, blocs d'acier, croisement traversé deux fois ; 20 nouveautés.
  - **Engrenages** (rollercoaster, 48,2 s) : triple looping, poutres en croix, route large, tube qui tourne ; 19 nouveautés.
  - **Fonderie** (speedway, 48,0 s) : route large, chicane rapide, blocs de fonte, grand S, tube qui tourne ; 19 nouveautés. Objectif inchangé : aucune bordure touchée.
  - **Presse Hydraulique** (acrobatique, 45,3 s) : trois sauts reçus sur des **plaques**, chicanes longues, route large ; 27 nouveautés. Objectif « moins de 46,5 s ».
  - **Usine Folle** (technique, 55,1 s) : passage étroit, marteau, chicanes serrées, croisement traversé deux fois ; 20 nouveautés.
- Textes anglais : « facades » sans cédille (le test de l'anglais prenait la lettre ç pour un reste de français) ; l'atelier de refonte le vérifie désormais pour chaque texte.
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 9.

## Bêta 0.10.7 — chapitre 8 (Fonds marins) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 8 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits des Fonds marins sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés) :
  - **Courant Chaud** (sprint, 45,7 s) : chicanes rapides, pyramides de corail, route large sous un portique, tube qui tourne, grand S ; 22 nouveautés. Objectif « moins de 47 s ».
  - **Jardin de Corail** (technique, 54,7 s) : passage étroit entre des coraux, chicanes serrées, cales de roche, croisement traversé deux fois ; 20 nouveautés.
  - **Épave Engloutie** (rollercoaster, 45,8 s) : morceaux d'épave (**mur en L**, poutre), **looping modulaire**, route large, tube qui tourne, passage étroit ; 25 nouveautés.
  - **Méduses Électriques** (acrobatique en gravité lourde, 51,6 s) : deux sauts prolongés par des **plaques**, chicanes longues, route large ; 25 nouveautés. Objectif « moins de 53 s ».
  - **Abysses** (rollercoaster, 50,1 s) : rochers, chicanes longues, looping modulaire, route large, tube qui tourne ; 22 nouveautés.
  - **Grande Barrière** (speedway, 55,1 s) : route large, chicane rapide, grand S, croisement traversé deux fois ; 19 nouveautés. Objectif inchangé : aucune bordure touchée.
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 8.

## Bêta 0.10.6 — chapitre 7 (Station orbitale) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 7 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits de la Station orbitale sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés) :
  - **Quai d'Amarrage** (sprint, 49,8 s) : le grand saut en basse gravité se reçoit sur une **plaque** d'amarrage entre deux modules, chicanes rapides, route large, croisement traversé deux fois ; 21 nouveautés.
  - **Navette** (technique en moto, 45,4 s) : deux coursives étroites, chicanes serrées, modules en dalles, croisement traversé deux fois ; 24 nouveautés.
  - **Ceinture d'Astéroïdes** (rollercoaster, 45,6 s) : chicanes longues, tube qui tourne, **looping modulaire**, route large ; 20 nouveautés.
  - **Grand Anneau** (speedway, 78,1 s) : **deux tours au lieu de trois**, sur un anneau agrandi (route large, chicanes serrées, longues puis rapides) : trois tours dépassaient 85 s dès qu'on ajoutait des pièces ; 20 nouveautés. Objectif inchangé : aucune bordure touchée.
  - **Apesanteur** (acrobatique, 73,5 s) : une plaque entre deux modules, chicanes longues, route large ; 20 nouveautés. Objectif « moins de 76 s ».
  - **Station Zénith** (technique, 54,6 s) : coursive étroite entre des piliers, blocs de la station, chicanes serrées, croisement traversé deux fois ; 20 nouveautés.
- Description du chapitre (carrière) : « grand anneau à deux tours ».
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 7.

## Bêta 0.10.5 — chapitre 6 (Volcan) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 6 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits du Volcan sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés) :
  - **Braises** (sprint, 45,7 s) : chicanes rapides, pyramides de lave, route large sous un portique, tube qui tourne, grand S ; 21 nouveautés. Objectif « moins de 47 s ».
  - **Coulée Ardente** (speedway, 47,1 s) : route large, chicane rapide, colonnes de basalte, grand S, tube qui tourne ; 19 nouveautés. Objectif inchangé : aucune bordure touchée.
  - **Champs de Basalte** (technique, 55,2 s) : route étroite entre des colonnes, **murets**, chicanes serrées, croisement traversé deux fois ; 20 nouveautés.
  - **Cheminée du Volcan** (rollercoaster, 46,6 s) : la cheminée, **looping modulaire**, route large, tube qui tourne, route étroite ; 24 nouveautés.
  - **Caldeira** (speedway en deux tours, 77,9 s) : chaque côté de la boucle allongé d'autant (route large, chicanes rapides et longues) pour qu'elle se referme toujours ; 17 nouveautés.
  - **Éruption** (acrobatique, 46,2 s) : sauts reçus sur des **plaques** de lave refroidie entre des cônes, chicanes longues, route large ; 26 nouveautés. Objectif « moins de 47,5 s ».
- Test navigateur du laboratoire : sur Lianes Néon, comme le test Node (Serpent refait ne se court plus sous le profil Simulation).
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 6.

## Bêta 0.10.4 — chapitre 5 (Nuit polaire) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 5 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits de la Nuit polaire sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés) :
  - **Aurore Naissante** (sprint, 47,2 s) : grand S, route large sous un portique, chicanes rapides, tube qui tourne, blocs de glace ; 22 nouveautés. Objectif « moins de 48,5 s ».
  - **Banquise Rebondissante** (acrobatique, 46,3 s) : quatre rebonds dont deux reçus sur des **plaques** de banquise entre des blocs de glace, chicanes longues, route large ; 28 nouveautés. Objectif « moins de 47,5 s ».
  - **Glacier Magnétique** (technique, 64,5 s) : route étroite entre des stalagmites, bosse aimantée entre deux cales, chicanes serrées, croisement traversé deux fois ; 20 nouveautés.
  - **Double Hélice** (rollercoaster, 70,2 s) : double hélice, double looping, route large, **looping modulaire** ; 17 nouveautés.
  - **Couronne Boréale** (speedway, 53,9 s) : deux routes larges sous des portiques, chicane rapide, grand S, tube qui tourne ; 23 nouveautés. Objectif inchangé : aucune bordure touchée.
  - **Blizzard** (technique, 61,1 s) : route étroite entre des piliers, chicanes serrées, dalles de neige, croisement traversé deux fois ; 20 nouveautés.
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 5.

## Bêta 0.10.3 — chapitre 4 (Ville futuriste) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 4 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits de la Ville futuriste sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés) :
  - **Néons Express** (speedway, 56,8 s) : départ sur le tapis roulant entre deux **murs pleins** (façades), deux avenues larges sous des portiques, chicane rapide, grand S, croisement traversé deux fois ; 23 nouveautés. Objectif inchangé : aucune bordure touchée.
  - **Boulevard Sans Fin** (sprint, 46,2 s) : chicanes rapides, immeubles en blocs, avenue large sous un portique, chicanes longues, tube qui tourne sous la ville ; 23 nouveautés. Objectif « moins de 47,5 s ».
  - **Hyperboucle** (rollercoaster, 51,4 s) : deux loopings décalés, grand looping, avenue large, **looping modulaire**, tube qui tourne ; 20 nouveautés.
  - **Métro Aérien** (technique, 58,4 s) : quai étroit entre des colonnes, chicanes serrées, croisement traversé deux fois ; 18 nouveautés.
  - **Tours Jumelles** (acrobatique, 46,0 s) : trois sauts de toit en toit, toits en **plaques**, chicanes longues, avenue large ; 21 nouveautés. Objectif « moins de 47,5 s ».
  - **Viaduc Vertical** (rollercoaster, 50,0 s) : lift hill accéléré, grand looping, looping modulaire, avenue large, tube qui tourne ; 20 nouveautés.
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 4.

## Bêta 0.10.2 — chapitre 3 (Archipel tropical) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 3 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Les six circuits de l'Archipel tropical sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures, véhicules et objectifs gardés) :
  - **Lagon Turquoise** (sprint en moto, 48,3 s) : deux sauts à anneau (le second reçu sur une **plaque**), chicanes rapides, route large sous un portique, croisement traversé deux fois, grand S, pyramides de roche ; 21 nouveautés.
  - **Récif** (technique en bateau, 62,9 s) : route étroite sur une jetée entre des piliers fins, chicanes serrées, croisement traversé deux fois ; 20 nouveautés.
  - **Phare** (acrobatique, deltaplane, 52,7 s) : deux sauts reçus sur des plaques, chicanes longues, hélice autour du phare, route large au sommet ; 22 nouveautés.
  - **Tourbillon Tropical** (rollercoaster, 54,7 s) : triple looping, **looping modulaire**, tube qui tourne, route large sous un portique ; 21 nouveautés.
  - **Sauts Lunaires** (acrobatique en basse gravité, 53,7 s) : trois grands sauts lunaires, plaques entre des cratères (pyramides, cale), chicanes longues ; 25 nouveautés.
  - **Grand Archipel** (speedway, 59,9 s) : route large, chicane rapide, croisement traversé deux fois (trois virages géants), grand S ; 19 nouveautés. Objectif « moins de 61,5 s ».
- `tools/test-etape6.mjs` couvre maintenant les chapitres 1 à 3.
- Correction : le contrôle « pas de départ classique » (contrat et `tools/test-niveaux.mjs`) ignorait les circuits dont le départ porte un style de portique (`start*2 …`, depuis 0.9.68) : il les vérifie de nouveau (aucun n'était en faute). Les tests des départs spéciaux (bateau, deltaplane, tapis roulant) acceptent aussi ce style.

## Bêta 0.10.1 — chapitre 2 (Jungle néon) refait autour des nouvelles pièces

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 2 changent (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- Comme le chapitre 1 en 0.9.74, les six circuits de la Jungle néon sont **construits autour des nouvelles pièces** (noms, thèmes, profils, ouvertures et objectifs gardés ; deux fois plus longs environ) :
  - **Lianes Néon** (sprint, 48,6 s) : chicanes rapides après la rampe à anneau, pont de lianes sans bordures, S relevé, clairière (route large sous un portique entre quatre piliers), croisement traversé deux fois ; 18 nouveautés.
  - **Canopée** (speedway, 60,5 s, 201 km/h de moyenne) : deux routes larges sous des portiques, grand S, chicane longue, tube qui tourne à droite puis à gauche ; 23 nouveautés. Objectif « moins de 62 s ».
  - **Spores** (acrobatique, 49,7 s, 10,7 s en l'air) : quatre rebonds en escalier reçus sur des **plaques**, chicanes longues entre les rebonds ; 23 nouveautés.
  - **Serpent** (technique, en moto, 54,2 s) : deux routes étroites (l'une entre des piliers fins), chicanes serrées, croisement traversé deux fois ; 22 nouveautés.
  - **Racines Boueuses** (rollercoaster, 52,4 s) : looping modulaire, route large sous un portique, tube qui tourne, double looping ; 18 nouveautés.
  - **Temple** (technique, 69,7 s) : blocs de pierre, route étroite, chicanes serrées, **arche pleine entre deux murs**, croisement traversé deux fois ; 24 nouveautés.
- `tools/test-etape6.mjs` applique la règle du chapitre 1 (12 nouveautés dont 6 pièces de route, 3 familles ; les 9 familles par chapitre ; 45 à 85 s) à chaque chapitre refait.
- Tests adaptés aux circuits refaits : le conseil « tu freines plus tôt » du coach est vérifié sur Serpent (sur le nouveau Temple, avancer un freinage envoie toujours la voiture au mur) ; la comparaison du laboratoire sous le profil Simulation, sur Lianes Néon.
- Vérificateur de l'éditeur : un saut depuis un **Rebond** peut se recevoir sur une plaque plus haute que le départ, jusqu'aux 85 % de la hauteur du rebond (comme pour une route).

## Bêta 0.10.0 — les nouvelles pièces et le chapitre 1 refait autour d'elles

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** (les six circuits du chapitre 1 ont changé depuis la dernière mise en ligne, leurs clés de classement aussi). Version qui rassemble les versions 0.9.68 à 0.9.74 ; rien d'autre ne change par rapport à 0.9.74.

- **Nouvelles pièces et décorations** (détail dans les sections 0.9.68 à 0.9.72) :
  - **chicanes** (courbes en S) : normale, longue, rapide et grand S, dans les deux sens ;
  - **panneaux** (flèches, danger, interdit, demi-tour), **portiques** de départ, d'arrivée et de checkpoint en quatre styles (portique, ligne au sol, arche, pylônes), **piliers et poutres** ;
  - **murs pleins**, **blocs pleins** (bloc, dalle, cale, pyramide, arche) qui arrêtent la voiture et dont le dessus se roule ;
  - **plaques** libres (rectangles, triangles, secteurs) aux bordures choisies côté par côté ;
  - **largeur de route variable** : route étroite (12 m) et route large (56 m), avec leurs transitions ;
  - **carrefours** en croix et en T ;
  - **looping modulaire** (hauteur réglable, de 0 à 6 murs) et **tube en virage**.
- **Le chapitre 1 (Désert) est refait autour de ces pièces** (détail dans la section 0.9.74) : Premiers Éclats, Canyon Corail, Tremplins du Crépuscule, Spirale Prismatique, Lac Gelé et Le Grand Tour contiennent chacun au moins 12 nouveautés, dont 6 pièces de route, de 3 familles au moins ; les 9 familles sont toutes présentes sur le chapitre.
- Éditeur : familles Chicane, Plaque, Largeur et Carrefour dans la palette, options Portique et Bordures dans l'inspecteur, le vérificateur connaît toutes les nouvelles pièces (un saut peut se recevoir sur une plaque).

## Bêta 0.9.74 — le chapitre 1 refait AUTOUR des nouvelles pièces (circuits de référence)

**`PHYS_VER` inchangé (36)**. **Redéployer `submit-score`** : les six circuits du chapitre 1 changent encore (leurs clés de classement aussi). Empreinte de physique, temps de référence et corpus de compatibilité régénérés pour cette raison seulement.

- En 0.9.73, les nouvelles pièces avaient été ajoutées par petites touches (2 à 3 pièces de route par circuit). Les six circuits du chapitre 1 sont maintenant **construits autour d'elles**, pour montrer ce qu'elles permettent (noms, thèmes, profils et bifurcations gardés) :
  - **Premiers Éclats** (sprint, 48,2 s) : départ sous une arche, slalom de chicanes rapides, premier wall-ride, un **croisement traversé deux fois** (boucle de trois virages géants), route large sous un portique entre quatre piliers, chicanes longues ; 23 nouveautés.
  - **Canyon Corail** (speedway, 47,6 s, 243 km/h de moyenne) : la vallée s'élargit et se resserre **trois fois** sous des portiques, chicanes rapides, wall-ride le long d'une rangée de piliers ; 23 nouveautés.
  - **Tremplins du Crépuscule** (acrobatique, 58,9 s, 17,5 s en l'air ; finissable de 158 à 230 km/h à l'abord des rampes) : quatre sauts reçus sur des **plaques** bordées (dont un qui retombe deux niveaux plus bas sans rampe de réception), chicanes longues entre les sauts, un wall-ride court entre le deuxième et le troisième saut ; 18 nouveautés.
  - **Spirale Prismatique** (rollercoaster, 72,5 s) : **trois loopings modulaires** de hauteurs différentes (dont l'ouverture), un tube qui tourne à gauche puis à droite, chicanes longues ; 13 nouveautés.
  - **Lac Gelé** (technique, 83,4 s, 23 virages serrés) : départ sur une route étroite, **deux nœuds en 8** par des croisements, chicanes en S, seconde route étroite ; 17 nouveautés.
  - **Le Grand Tour** (rollercoaster, 82,4 s) : deux loopings modulaires, route large sous un portique, tube qui tourne, arche pleine entre deux murs pleins, chicanes longues ; 19 nouveautés.
- **Règle relevée** (`tools/test-etape6.mjs`) : au moins 12 nouveautés par circuit, dont 6 pièces de route nouvelles, de 3 familles au moins ; les 9 familles sur le chapitre.
- **Vérificateur de l'éditeur** : un saut peut se recevoir sur une **plaque** (avant : seule une extrémité de route comptait, et le saut passait pour « relié à rien »).
- Les panneaux et solides posés le long d'un circuit intégré ont un cap exact (multiple de π/8, dans ]−π, π]) : quatre quarts de tour dans l'éditeur redonnent le même circuit. Les obstacles existants gardent leur calcul au bit près.
- Banc du pilote humain imparfait (`tools/test-maniabilite.mjs`) : aucun contact sur les nouveaux sprint et speedway.
- Contrat des circuits : les nouvelles pièces comptent dans le vocabulaire (« 4 pièces nouvelles au moins »), un looping modulaire compte comme un looping. Ouvertures du chapitre 1 mises à jour (toutes différentes des 66 autres). Médailles des six circuits recalculées ; textes français et anglais refaits.

## Bêta 0.9.73 — nouvelles pièces, étape 6 : le chapitre 1 refait avec les nouvelles pièces

**`PHYS_VER` inchangé (36)** : la physique ne change pas. **Redéployer `submit-score`** : le serveur vérifie les records des circuits intégrés avec sa propre copie de `js/tracks.js`, et les six circuits du chapitre 1 ont changé (leurs clés de classement aussi). L'empreinte de physique est régénérée parce que plusieurs de ses scénarios roulent sur ces circuits.

- **Les six circuits du chapitre 1 (Désert) utilisent les nouvelles pièces**, en gardant noms, thèmes, profils, ouvertures et bifurcations :
  - **Premiers Éclats** : départ sous une arche, virages géants annoncés par des chevrons, deux chicanes rapides, arrivée entre deux pylônes (48,6 s).
  - **Canyon Corail** : rangée de piliers le long du wall-ride, la vallée s'élargit (route de 56 m sous un portique en poutres) puis se resserre (53,2 s).
  - **Tremplins du Crépuscule** : le premier saut se reçoit sur une grande plaque 3×3 bordée, checkpoints sous deux pylônes, chevrons de montée avant les rampes (59,9 s).
  - **Spirale Prismatique** : looping modulaire à gauche au lieu du grand looping, virages dans un tube (droite puis gauche), arrivée sous une arche (68,9 s).
  - **Lac Gelé** : route étroite dès la sortie de l'épingle, chicane en S après le mur, et un **nœud en 8** pour finir : la route repasse par le même croisement (77,8 s).
  - **Le Grand Tour** : looping modulaire à droite au lieu du grand looping, arche pleine entre deux murs pleins avant l'arrivée (76,9 s).
- **Règle vérifiée par un test** (`tools/test-etape6.mjs`, recensement : `tools/nouveautes.mjs`) : chaque circuit du chapitre 1 contient au moins 4 nouveautés de 2 familles au moins, et le chapitre montre les 9 familles (chicane, panneau, portique, pilier / poutre, mur / bloc, plaque, largeur, carrefour, looping / tube) ; les pièces nouvelles sont sur le tracé.
- Les 72 circuits respectent leur contrat (pilote à ±10 %, reprise à l'arrêt depuis chaque checkpoint, vérificateur de l'éditeur) ; médailles de Canyon, Spirale, Lac Gelé et Grand Tour recalculées ; textes « ce qu'il enseigne » en français et en anglais.
- Les circuits intégrés peuvent poser panneaux et solides le long du parcours (`obst` : rotation `rot`, hauteur `dy`).

## Bêta 0.9.72 — nouvelles pièces, étape 5 : looping modulaire, tube en virage

**`PHYS_VER` inchangé (36)** : sur les circuits existants rien ne change. **Redéployer `submit-score`** (nouvelles pièces). Ajoutées à la FIN de l'ordre d'encodage.

- **Looping modulaire** : la Montée en L mène à des murs verticaux (autant qu'on veut), puis au nouveau **Sommet de looping** (↱ / ↰ : demi-cercle de 16 m qui passe par-dessus et redescend une colonne à côté), puis à d'autres murs et à une Montée en L parcourue à l'envers. On obtient des loopings de toutes les hauteurs ; plus il est haut, plus il faut d'élan (le pilote passe jusqu'à 6 murs de chaque côté, ~80 m ; à 8, il retombe). La route guide le cap de la voiture pendant le glissement d'une colonne, comme sur les loopings décalés. Scripts : `LPR n` / `LPL n` (n murs de chaque côté).
- **Tube en virage** (↱ / ↰, 2×2, rayon 48 m) : section de tube fermée qui tourne ; il s'enchaîne aux sections de tube (`TI TM TRR TM TO`). Scripts : `TRR` / `TLL`.
- Éditeur : les quatre pièces dans la palette (miroirs ↱ / ↰ dans l'Inspecteur) ; étiquettes « Looping » et « Tube » des circuits.
- **Tests** : `tools/test-etape5.mjs` (7 tests).

## Bêta 0.9.71 — nouvelles pièces, étape 4 : carrefours en T et en croix

**`PHYS_VER` inchangé (36)** : sur les circuits existants rien ne change. **Redéployer `submit-score`** (nouvelles pièces). Ajoutées à la FIN de l'ordre d'encodage.

- **Croisement** (4 bras) et **carrefour en T** (3 bras ; la pièce tourne pour mettre la branche où l'on veut), au même niveau, famille « Carrefour » de l'éditeur. La chaussée est l'union du carré central et des bras ; les bordures suivent tout le contour (angle droit plein entre deux bras), une voiture lancée vers le côté fermé d'un T est retenue. Marquage : tirets sur les bras, ligne d'arrêt pointillée à l'entrée du carré.
- **Circuit en 8** : un circuit peut repasser par le même croisement (perpendiculairement, ou dans l'autre sens). Scripts : `JX` (tout droit), `JXR` / `JXL` (tourner), `JT` / `JTL` (T, branche à droite / à gauche, tout droit), `JTD` / `JTG` (prendre la branche), `JR` / `JL` (arriver par la branche et tourner) ; le même jeton au même endroit réutilise le carrefour déjà posé (erreur claire s'il n'a pas de bras dans ce sens).
- Mini-carte : un trait par bras. Vérificateur : un bout par bras.
- **Tests** : `tools/test-etape4.mjs` (7 tests).

## Bêta 0.9.70 — nouvelles pièces, étape 3 : largeur de route variable

**`PHYS_VER` inchangé (36)** : sur les circuits existants rien ne change. **Redéployer `submit-score`** (nouvelles pièces). Ajoutées à la FIN de l'ordre d'encodage.

- **Route étroite** (12 m de chaussée au lieu de 24), **rétrécissement** (24 → 12 m en biais sur une case ; tourné d'un demi-tour, il élargit), **élargissement** (24 → 56 m sur 3×3) et **route large** (56 m, 3×3). Famille « Largeur » de l'éditeur. Options : sans bordures, à l'envers, thème. Scripts : `N` (route étroite, `N4`…), `NI` / `NO` (rétrécissement, retour à 24 m), `WI` / `W` / `WO` (route large).
- La chaussée et ses bordures suivent exactement le bord (en biais sur un raccord) : le sol, les bordures, les dalles et les checkpoints n'ont rien de particulier à savoir, et une voiture lancée en travers d'une route étroite est retenue à 6 m de l'axe.
- **Vérificateur de l'éditeur** : deux routes de largeurs différentes bout à bout (sans rétrécissement) donnent une alerte : le bout de la bordure de la route étroite barre la route large.
- **Difficulté estimée** : une route étroite compte un peu (0,15 par case).
- **Tests** : `tools/test-etape3.mjs` (8 tests).

## Bêta 0.9.69 — nouvelles pièces, étape 2 : murs pleins, plaques, blocs pleins

**`PHYS_VER` inchangé (36)** : sur les circuits existants rien ne change (empreinte de physique, temps de référence, corpus de compatibilité ; la plateforme garde sa géométrie au bit près). **Redéployer `submit-score`** (plaques, bordures de plaque et nouveaux solides). Tout est ajouté à la FIN des ordres d'encodage.

- **Murs pleins** (catégorie « Murs pleins », des solides comme les piliers) : mur droit (16 m × 4 m), muret (1,2 m : plus haut qu'une marche, il arrête la voiture), murs en L, en T, en croix, et mur courbe (quart de cercle de 16 m de rayon, fait de pavés tournés sans trou).
- **Plaques** (surfaces libres, famille « Plaque » de l'éditeur ; la plateforme en est la plaque carrée 1×1) : carrées 2×2 et 3×3, triangles et quarts de disque de 1 à 3 cases. Seule leur forme porte la voiture. **Bordures au choix** : « Bordures tout autour » dans les Options, ou bord par bord dans l'Inspecteur (avant, droit, arrière, gauche ; diagonale ; arc) ; elles arrêtent la voiture comme une bordure de route et entrent dans la signature. Scripts : `[plate3]` (centrée sur la route), suffixe `*n` = masque des bordures (`[plate3]*10` : bords gauche et droit). Un checkpoint posé sur une plaque triangle ou en quart de disque ramène à son centre de gravité. Mini-carte : les plaques sont dessinées à leur forme.
- **Blocs pleins** (catégorie « Blocs pleins ») : bloc (8 m), dalle (16 × 16 × 1,2 m), cale (4 m sur 16 m) et cale raide (4 m sur 8 m) qu'on monte pour sauter, pyramide (5 m) qui se monte aussi, arche pleine (on passe dessous, 29 m de large). Leur dessus porte la voiture ; une cale prise par sa face haute est un mur.
- **Vérificateur de l'éditeur** : une plaque de plusieurs cases est reliée à ses voisines tout autour de son empreinte ; une plaque triangle ne couvre que sa moitié de case.
- **Tests** : `tools/test-etape2.mjs` (17 tests).

## Bêta 0.9.68 — nouvelles pièces, étape 1 : chicanes, panneaux, portiques, piliers et poutres

**`PHYS_VER` inchangé (36)** : sur les circuits existants rien ne change (empreinte de physique, temps de référence et corpus de compatibilité identiques). **Redéployer `submit-score`** : le serveur rejoue les records avec sa propre copie de la physique, qui doit connaître les chicanes et les solides. Toutes les nouveautés sont ajoutées à la FIN des ordres d'encodage : aucun code de circuit existant ne change.

- **Chicanes** (courbes en S latérales) : la route se décale d'une ou deux colonnes sans changer de cap. Huit pièces : courte 2×2 (rayon 40 m, ≈ 125 km/h au pilote), longue 3×3 (80 m, ≈ 190 km/h), rapide 4×4 (136 m, presque à fond), grand S 3×3 sur deux colonnes (52 m) ; vers la droite ou la gauche. Deux arcs tangents au milieu, géométrie exacte pour les murs et le sol. Éditeur : famille « Chicane » (longueur, décalage, sens) ; options à l'envers, sans bordures, tunnel, thème. Scripts : `ZR` / `ZL` (`ZR3`, `ZR4`), `ZZR` / `ZZL`.
- **Panneaux de bord de route** (décorations, catégorie « Panneaux ») : chevrons gauche / droite / montée / descente, panneau danger, panneau interdit, et deux panneaux simples (descente, demi-tour).
- **Portiques** : option « Portique » (visuelle, ne change ni la signature ni les records) pour un départ, une arrivée ou un checkpoint : portique classique, ligne au sol, arche, pylônes. Scripts : suffixe `*n` (`start*2`, `C*3`, `finish*1`). Le départ, l'arrivée et le checkpoint peuvent aussi être posés sans bordures.
- **Piliers et poutres : les premiers SOLIDES** (catégorie « Piliers et poutres ») : pilier, pilier sur socle, poteau, poutre, poutres en L, en T, en croix, potence, portique en poutres. La voiture ne les traverse pas : leurs côtés se comportent comme une bordure (même choc sans rebond, même frottement), leur dessus porte la voiture, et une voiture qui saute dessous s'y cogne la tête. Ils se posent librement (position, hauteur, cap, échelle ×0,25 à ×8), jamais inclinés, et restent affichés même quand les décorations sont masquées (qualité basse). Leur position, leur hauteur et leur cap entrent dans la signature du circuit.
- **Tests** : `tools/test-etape1.mjs` (20 tests). Les tests d'ordre d'encodage vérifient désormais des index fixes (le virage géant reste en 135, `custom` en 311) plutôt que « le dernier ».

## Bêta 0.9.67 — chapitre 1 refait, bifurcations à deux chemins, virage géant

**`PHYS_VER` inchangé (36)** : la physique ne change pas. **Redéployer `submit-score`** : le serveur vérifie les records des circuits intégrés avec sa propre copie de `js/tracks.js`, et les six circuits du chapitre 1 ont changé (leurs clés de classement aussi). L'empreinte de physique est régénérée parce que plusieurs de ses scénarios roulent sur ces circuits.

- **Les six circuits du chapitre 1 (Désert) refaits**, deux fois plus longs et plus proches de l'esprit du genre : relief, longues descentes qui lancent la voiture, sauts, murs, grandes courbes, peu de boosters. Noms, thèmes, profils et ouvertures gardés. Temps du pilote de référence : Premiers Éclats 48 s (avant 23), Canyon Corail 51 s (32), Tremplins du Crépuscule 59 s (39), Spirale Prismatique 64 s (41), Lac Gelé 68 s (42), Le Grand Tour 79 s (37). Médailles, objectifs et textes « ce qu'il enseigne » (français et anglais) refaits ; les 72 circuits respectent leur contrat, et le pilote humain imparfait n'y touche aucune bordure.
- **Bifurcation à deux chemins libres, puis fusion** (une par circuit du chapitre 1) : dans le langage des circuits, `SPL` (voie déportée à droite ; `SPLL` : à gauche) … voie directe … `ALT` (ou `ALTP` : le pilote automatique prend la déportée) … voie déportée … `MRG`. Chaque voie suit son propre chemin (un saut, un mur, un détour, de la glace) et elles se rejoignent sur une fusion ; le constructeur refuse, avec un message clair, deux voies qui ne se rejoignent pas. Avant, `Y3` ne faisait que deux voies parallèles collées.
- **Nouvelle pièce : virage géant** (5×5, rayon 144 m ; `XR` / `XL` dans les scripts ; famille « Virage », rayon « Géant » dans l'éditeur). Avec le braquage borné selon la vitesse, c'est le seul virage qui se prenne vers 220-280 km/h (le très grand virage 3×3 plafonne vers 190). Ajoutée à la FIN de l'ordre d'encodage : aucun code de circuit existant ne change.
- **Pilote automatique** : à la reprise (départ, réapparition, essai « repartir du checkpoint »), il cherche son point sur tout le tracé, dans son sens de marche (avant : les 400 premiers points seulement ; sur un circuit long il se raccrochait au premier passage voisin et faisait demi-tour). Temps de référence des 66 autres circuits identiques.
- **Contrat du profil sprint** : 12 à 50 s (avant 30) et 6 grands virages au plus (avant 3), pour des sprints plus longs.
- **Tests** : `tools/test-fusion-geant.mjs` (bifurcations : construction, erreurs, voie suivie par le pilote, partage ; virage géant : géométrie, vitesse, famille, encodage ; chapitre 1 : durées, une bifurcation par circuit). Tremplins se finit de 158 à 238 km/h à l'abord des rampes.

## Bêta 0.9.66 — démarrage après une mise en ligne

**`PHYS_VER` inchangé (36)** : physique, empreinte, temps de référence et records identiques. Rien à redéployer côté serveur (`submit-score` inchangé).

- **Correction : le jeu pouvait rester bloqué sur « Chargement… » juste après une mise en ligne.** GitHub Pages laisse le navigateur garder chaque fichier 10 minutes ; après la 0.9.65, un ancien `js/pieces.js` resté dans ce cache était chargé à côté des nouveaux modules, qui lui demandaient `headingGuided` : tout le graphe de modules échouait, sans aucun message.
- **`js/boot-guard.js`** (script classique, chargé avant `js/main.js`) : si les modules ne se chargent pas, il redemande une fois tous les fichiers du jeu au serveur en contournant le cache, vide le cache hors ligne et recharge la page ; si cela ne suffit pas, il affiche un message et un bouton « Réessayer » (jamais de boucle). Rien après 30 s : même message, sans rechargement d'office.
- **Service worker** : chaque fichier est revalidé auprès du serveur (`cache: 'no-cache'`, une réponse 304 ne coûte presque rien) et la copie hors ligne s'installe depuis le réseau (`cache: 'reload'`) : deux versions ne se mélangent plus.
- **Test** : `tools/test-browser-boot.mjs` (dans `npm run test:browser`) imite GitHub Pages et sert l'ancien `js/pieces.js` : sans la garde, le jeu reste bloqué (vérifié) ; avec, il démarre après un seul rechargement ; un serveur durablement incohérent donne le message, pas une boucle.
- **Pour un navigateur déjà bloqué** (avant cette version) : recharger en vidant le cache (Ctrl + Maj + R), ou attendre 10 minutes.

## Bêta 0.9.65 — nouvelles lois de conduite (`PHYS_VER` 36)

**`PHYS_VER` 36** : records, replays, fantômes importés, classements en ligne et salons de la 35 ne sont **plus rejouables** (ils restent affichés comme temps). **Redéployer `submit-score`** (paquet régénéré), puis `node tools/check-deployed.mjs`. Aucune migration SQL.
De nouvelles lois de conduite ([docs/LOIS-PHYSIQUE.md](docs/LOIS-PHYSIQUE.md)) remplacent les anciennes ; l'enveloppe de vitesse (290 km/h, turbo 340), les revêtements, les véhicules et le mini-turbo ne changent pas.

- **Moteur et freins** : a = 16 − (16 / v_max)·v gaz à fond, a = −(16 / v_max)·v à vide (frein moteur linéaire ≈ 0,2 /s) : 100 km/h en 2,1 s, 200 en 5,9 s, 250 en 9,9 s. Frein 52 + 0,5·v m/s² (≈ 3,5 × la poussée), marche arrière 8 m/s² jusqu'à 54 km/h. Ralentisseur : résistance = poussée × paramètre.
- **Direction** : l'angle de braquage PERMIS diminue avec la vitesse, min(23,5° ; 22,93 · v^−1,566) (23,5° jusqu'à 47 km/h, 7° à 100, 2,7° à 200) ; plein braquage en 0,1 s ; c'est lui, plus l'adhérence, qui borne le virage (rayon ≈ empattement / angle : 13 m à 72 km/h, 40 m à 144, 80 m à 216). Moto 29,1 / 27°, bateau 21,2 / 20°. **L'adhérence d'ambiance** (pluie, flaques, givre, adhérence du circuit, modèles v2 de la moto et du bateau) rétrécit cette enveloppe : sous une pluie à 100 %, −15 % d'angle. Profil Arcade : +10 % d'angle ; Simulation : −10 %.
- **Glisse** : frein + volant, **contre-braquage automatique** (les roues avant suivent la trajectoire de l'essieu avant) ; la glisse se referme d'elle-même en ≈ 1 s et ne coûte presque plus de vitesse sur l'asphalte. Mini-turbo livré quand la glisse se referme ; niveaux à 0,45 et 0,85 s de charge (volant rendu tôt : simple ; volant tenu à fond jusqu'au bout : renforcé). Revêtement Dérive : l'arrière garde 0,85 − 0,5·f de son adhérence (sinon le braquage borné ne le faisait plus décrocher).
- **En l'air** : ni volant ni gaz (rotation du décollage conservée) ; le frein est un **aérofrein** qui amortit la rotation (≈ 1 /s) et fige l'assiette. Le deltaplane garde ses commandes.
- **Murs** : inélastiques, frottement de Coulomb 0,7 ; plus de rebond, de perte forfaitaire, de pivot ajouté ni d'« encaissement ». Un frôlement ne coûte presque rien, un choc franc à 45° garde ≈ 21 % de l'élan ; la voiture n'est jamais clouée (≥ 50 km/h 5 s après, volant au neutre).
- **Pièces 3D** : sur les routes roulées (mur, 45°, surplomb, transitions) et sur les loopings, vrilles et tire-bouchons (`headingGuided`, `js/pieces.js`), la route guide le cap le long de sa courbure : sans cela le braquage borné ne permettrait pas de les suivre (une aide du jeu). Bordure intérieure des pentes : la sonde suit la pente aussi juste après le décollage (une traversée sur 300 essais).
- **Pilote automatique** (démo, fantôme d'or, validation) : vitesse cible bornée aussi par l'angle permis (85 % de la vitesse où il suffit), selon le véhicule, le profil et l'adhérence d'ambiance ; plus aucune commande en l'air ; vitesse de virage sur les rubans ; gains de direction 3,6 et anticipation 0,35 s·v (sans quoi il dépassait son cap en sortie de grand virage et décollait de travers).
- **Circuits** : les 72 finissent, respectent leur contrat (tolérance ±10 %, départ arrêté de chaque checkpoint) et ont leurs médailles et objectifs recalés. Temps du pilote : **+9,1 % en moyenne** (médiane +6,3 %, de +0,5 % à Lagon à +23,9 % au Laminoir : les virages serrés se prennent au volant). Banquise : terrasse de réception allongée d'une case (le dernier rebond retombait sur le mur) ; Monte-Charge : glissière d'une demi-case. Contrats de profil : sprint 30 s au plus et 55 % du temps au-dessus de 180 km/h, speedway 10 % au-dessus de 220 et 185 km/h de moyenne, technique 1 % de freinage.
- **Académie** : leçon « Saut et réception parfaite » refaite (saut de terrasse en terrasse : décoller droit) ; exercice « Trois réceptions » refait (deux sauts juste après un virage : redresser avant le bord) ; seuils des chicanes (69 / 75,5 / 83 km/h) et du freinage (8,8 / 8,35 / 7,8 s) recalés, mini-turbo renforcé « tenu jusqu'au bout », arrivée en 9 s. Textes d'aide, conseils et traductions anglaises sans plus aucune mention du tangage aux pédales.
- **Banc de maniabilité** : le « pilote humain imparfait » braque en courbe (|volant|^1,25) au lieu d'être plafonné à 80 % du volant ; 0,1 contact par minute en moyenne sur les 72 circuits.
- **Tests** réécrits sur les nouvelles lois, avec la valeur attendue en commentaire : maniabilité, vitesse et murs, corrections physiques (bordures, dérapage, sauts), pentes, environnements, Académie, exercices, coach, véhicules v2, orientations 3D, atelier, intégrité. Fichiers de référence régénérés : empreinte (193 scénarios), temps de référence, corpus de compatibilité, matrice des pièces (24 cases CHUTE au lieu de 30), fiche d'essai.
- **Reste à juger à la main** : la sensation de conduite n'a été jugée que par machine ; gravité (19 m/s²) et traînée en l'air inchangées ; le guidage du cap sur les pièces 3D est une aide du jeu ; deux nouvelles cases CHUTE (cvd4 sur le mur gauche, cvdL4 sur le mur droit, miroirs de cases déjà CHUTE).

## Bêta 0.9.64 — phase 5 : sécurité du backend et préparation à la production

**`PHYS_VER` inchangé (35)**. **Rien n'est déployé** : l'étape SQL 17 et le redéploiement de `submit-score` / `ice` attendent une autorisation explicite (ordre et vérifications : `supabase/MIGRATIONS.md`, « Étape 17 »). Compte-rendu complet (failles, preuves, risques restants, opérations de production) : [docs/AUDIT-PHASE5-SECURITE.md](docs/AUDIT-PHASE5-SECURITE.md).

- **Failles confirmées par attaque réelle** (base reproduisant Supabase : rôles `anon` / `authenticated`, droits par défaut, RLS) et corrigées par **`supabase/etape17-securite.sql`** (idempotente, aucune donnée supprimée, compatible avec le jeu et la fonction actuels) : un circuit masqué par la modération se rétablissait quand son auteur le signalait ; trois sessions invitées masquaient le circuit de n'importe qui (désormais seuls les comptes comptent) ; on pouvait signaler son propre circuit ; `mode_played` gonflait sans limite le compteur qui classe les modes ; les modérateurs étaient listables par `anon` ; `log_runs` (sans session) autorisait 4 millions de lignes par jour ; ni plafond de circuits par auteur ni budget de fantômes (saturation du stockage) ; compteurs d'aimés et de signalements perdus sous concurrence (7 pour 8, 6 pour 8) ; trois fonctions de règlement ouvertes sans session.
- **Fonctions serveur** : délai de 8 s sur chaque appel à Supabase et réponse **503 + `Retry-After`** (au lieu d'une fonction qui pend ou d'une « erreur interne ») ; refus clair « 100 circuits au plus » (422).
- **Politique de sécurité du contenu** dans `index.html` : scripts du site seulement, ni script en ligne ni `eval`, deux serveurs extérieurs (Supabase, Google Fonts). La police ne s'active plus par un gestionnaire `onload` en ligne. Hébergement personnalisé : voir `js/config.js`.
- **Tests de sécurité** : `tools/test-securite-sql.sh` (67 contrôles : inventaire des droits, un joueur contre un autre, sans session, fonctions réservées au serveur, abus, 6 manches de 8 pilotes simultanés ; `AVANT=1` le rejoue sans l'étape 17 et doit y voir les failles ; inclus dans `npm run test:sql` et la CI) ; `tools/test-securite-client.mjs` (14 tests : CSP ↔ `js/config.js`, pas de code dynamique ni d'hôte tiers, aucun secret dans l'arbre, échappement des écrans en ligne) ; 13 tests de plus pour `submit-score` (identité du jeton, corps et types hostiles, fuites de secrets, CORS, 503 / délai / idempotence) ; `verify-prod.sql` vérifie l'étape 17.
- **Ce qui reste** (détail dans le compte-rendu) : sessions anonymes gratuites (CAPTCHA recommandé), saturation du stockage par de nombreuses sessions, pas de limitation de débit native sur l'API, triche « parfaite » par pilote automatique, pas de récupération de mot de passe (choix de produit).

## Bêta 0.9.63 — phase 4 : intégrité et validation globale (signature, lecture des codes, sauvegardes, records)

**`PHYS_VER` inchangé (35)** : empreinte de la physique, temps de référence, médailles et corpus de compatibilité identiques. **Redéployer `submit-score`** (le paquet `supabase/functions/submit-score/index.ts` est régénéré) : sans cela la faille n° 1 ci-dessous reste exploitable côté serveur.
Aucune migration SQL, aucune donnée supprimée. Compte-rendu complet (problèmes, données incompatibles, risques restants, opérations de production) : [docs/AUDIT-PHASE4-INTEGRITE.md](docs/AUDIT-PHASE4-INTEGRITE.md).

- **Signature des circuits** : le **roulis d'un obstacle** (`rz`, phase 3) est maintenant signé. Avant, deux circuits qui ne différaient que par ce roulis avaient la même clé de classement (un obstacle tourné de 180° tue ou non selon sa forme de contact). Les clés des circuits sans roulis d'obstacle ne changent pas.
- **Serveur** : un temps NaN / absent / non numérique n'est plus « confirmé » (`NaN > 0,0005` était faux) ; message explicite quand un circuit contient des pièces que le serveur ne connaît pas (version plus récente) au lieu de « le code ne correspond pas ».
- **Lecture des codes** : `Track.decode` **compte ce qu'il perd** (pièces inconnues, options inconnues, pièces superposées, décorations en trop). L'import refuse un code qui perdrait des pièces ou des options, le lien partagé n'offre plus « Ouvrir dans l'éditeur » dans ce cas, et l'éditeur détache l'entrée d'origine (il n'écrase plus le circuit enregistré).
- **Sauvegardes locales** : restauration **atomique** (une écriture refusée à mi-chemin remet tout comme avant) ; entrées de circuits abîmées mises en **quarantaine** (`tracksBad`) au lieu d'être affichées ou effacées ; la fusion cloud préfère toujours une entrée valide.
- **Records** : un temps de 0, négatif, NaN ou démesuré n'est jamais lu comme record, jamais écrit, jamais choisi à la fusion cloud (rien n'est effacé du disque). Preuve de vérification d'auteur liée à `PHYS_VER`.
- Tests : **`test-integrite`** (29 vérifications : signature, lecture des codes, sauvegardes avec stockage plein et rechargement, records et progression, circuits modifiés / temps falsifiés / versions, simulation locale = rejeu serveur, parcours complet créer → enregistrer → recharger → courir → record → serveur → classement → fantôme, avec déconnexion, actualisation et données incomplètes).
- **Ce qui reste** : arrondi de position des obstacles à 0,1 m dans la signature, badge « vérifié » en retard après un changement de physique, clients anciens qui ignorent les pièces des versions récentes (détail dans le compte-rendu).

## Bêta 0.9.62 — phase 3 : construction 3D (orientations, rubans roulés, raccord automatique)

**`PHYS_VER` inchangé (35)** : la physique n'a pas bougé (empreinte, temps de référence, médailles et corpus de compatibilité identiques), seuls la géométrie des pièces, l'éditeur et les obstacles évoluent. **Redéployer `submit-score`** à la mise en ligne : la vérification rejoue le circuit avec le code du serveur, une version plus ancienne ignorerait les nouvelles pièces. Compte-rendu complet (familles, mesures, limites et leurs raisons) : [docs/AUDIT-PHASE3-CONSTRUCTION-3D.md](docs/AUDIT-PHASE3-CONSTRUCTION-3D.md).

- **Huit orientations** : en plus du sol, des murs et du plafond, des routes **inclinées à 45°** et en **surplomb à 135°** (`tile.o` de 1 à 6), pour 64 types de lignes, virages, pentes et courbes ; **16 transitions de 45°** (une case) pour passer du sol au plafond par pas de 45°.
- **Rubans roulés** (une seule règle, `ribbons.js : rollWrap`) : **loopings sur un mur** (cercle dans le plan horizontal, hélice de 5 à 15 niveaux), **vrilles inclinées**, **tire-bouchons sur un mur** ; quelle pièce dans quelle orientation est décidé par la géométrie (le ruban roulé doit tenir dans son empreinte et sortir sur la grille).
- **Obstacles** : roulis `rz` par pas de 45°, la forme de contact tourne avec l'obstacle ; posé **à plat** tout seul sur un mur, un plan incliné, un surplomb ou le plafond (rayon de l'éditeur sur les rubans).
- **Éditeur** : sept pastilles d'orientation + Plafond, miroir pour tous les roulis, **raccordement automatique** (Prolonger insère les transitions manquantes, un seul pas d'annulation, refus expliqué), vérificateur qui compare les roulis et nomme les transitions à intercaler, script `( ) { }`.
- **Matrice de compatibilité** : 128 pièces × 8 orientations, mesurée par le vrai moteur ; une confusion roulis / pente (60 faux « RACCORD ») corrigée dans `rollGap`.
- Tests : `test-orientations-3d` (34), banc `tools/chain3d.mjs` ; `test-browser-editeur` (orientation et raccord automatique) ; plusieurs tests existants adaptés (`test-pentes-murs`, `test-continuite`, `test-deco-rotation`, `test-editeur-phase1`).
- **Ce qui reste** : plateformes inclinées / courbes / verticales (une surface à deux dimensions demande un nouveau mode de contact), transitions courbes, loopings à 45°, 30 cases CHUTE de la famille des montées raides, ressenti à valider par des essais humains.

## Bêta 0.9.61 — phase 2 : corrections physiques (gravité, murs, dérapage, sauts)

`PHYS_VER` 34 → **35** (un seul changement, tout groupé). **Redéployer `submit-score`** à la mise en ligne (voir « Opérations serveur » du compte-rendu) : sans cela le serveur refuse les temps de la 35.
Les records, replays et classements de la 34 restent affichés mais ne sont plus rejouables ni comparables ; rien n'est supprimé, aucune migration SQL. Compte-rendu complet (avant / après mesurés, ce qui
reste, pourquoi) : [docs/AUDIT-PHASE2-PHYSIQUE.md](docs/AUDIT-PHASE2-PHYSIQUE.md). Aucune pièce, aucun circuit, véhicule ou profil supprimé ; aucune nouvelle famille de pièces.

- **Gravité, une seule règle** (`js/ribbons.js : ribbonInverts`) : toute pièce-ruban qui retourne la voiture (entrée et sortie de côtés opposés) fait suivre la gravité à la route, sans liste de pièces.
  La vrille et les transitions retournées n'ont plus besoin du revêtement « Inversion de gravité » (qui reste un choix volontaire). Matrice des pièces : 29 → 16 cases CHUTE, aucune nouvelle ;
  l'erreur `invert` du vérificateur de l'éditeur et son bouton « Corriger » disparaissent (inatteignables).
- **Murs et bordures, une réponse à un impact** (`js/physics/contact.js`, sol et rubans) : frôlement (l'élan est conservé : 100 km/h à 2° ne passe plus à 23 km/h collé 7 s mais accélère), modéré
  (rotation, encaissement), violent (perte globale plafonnée) selon la vitesse d'approche normale ; restitution nulle sous 2 m/s ; frottement visqueux de contact 2/s → 0,12/s ; la voiture pressée contre
  une bordure repart seule (contact retenu 0,2 s pour le dégagement) ; mêmes règles au plafond.
- **Dérapage, une mécanique de pilotage** : déclenché par frein + volant, avec ou sans gaz ; la vitesse est conservée (≈ 70 à 77 % à 1,7 s contre 14 % ou aucun dérapage) ; angle réglé par le volant
  (≈ 16° à 60 %, 22° à plein volant) ; sortie progressive ; mini-turbo gagné par une glisse contrôlée (+20 puis +30 km/h), perdu sur un mur ou un tête-à-queue (bug de lecture de l'impact corrigé) ;
  fonctionne sur glace, moto, profils Arcade / Simulation ; les revêtements Dérapage et Ralentisseur gardent leur identité.
- **Sauts et réceptions** : les gaz ou le frein tenus en l'air ne coûtent plus −43 % (réception « ratée », tangage 1,4 rad) mais −11 à −17 % ; l'assiette au décollage est conservée, stabilisée en vol,
  alignée en partie sur la pente à l'approche du sol, corrigée par un compensateur borné.
- Temps de référence des 72 circuits : 22 bougent, au plus −1,4 % (`viaduc`), moyenne −0,03 % ; médailles et contrats de niveau inchangés dans leurs écarts. Empreinte identique sous Deno.
- Tests : `test-physique-corrections` (23 tests, banc `tools/mesures-physique.mjs`) ; adaptés : `test-coach`, `test-vitesse-et-murs`, `test-contacts`, `test-continuite`, `test-editeur-phase1`,
  `test-skills`, `test-vehicles2`, `test-browser-editeur`.
- **Ce qui reste** : 16 cases CHUTE (montées raides roulées sur un mur, rampe `cvd4`) ; le dérapage reste ~18 % plus lent que la trajectoire à l'adhérence sur un virage isolé (choix assumé) ; textes de
  l'Académie à reprendre ; ressenti à valider par des essais humains.

## Bêta 0.9.60 — phase 1 après l'audit d'expérience : caméra, éditeur, matrice des pièces

**`PHYS_VER` inchangé (34)** : aucune ligne de physique, de collision, de gravité ni de circuit intégré n'a changé ; l'empreinte des 193 scénarios, les temps de référence, les
médailles et le corpus de compatibilité sont identiques. Pas de redéploiement de `submit-score`. Compte-rendu complet (constats vérifiés, hypothèses, limites) :
[docs/AUDIT-PHASE1-CAMERA-EDITEUR.md](docs/AUDIT-PHASE1-CAMERA-EDITEUR.md) ; matrice pièces × orientations : [docs/MATRICE-PIECES.md](docs/MATRICE-PIECES.md).

- **Caméra de course** (`js/camrig.js`, `js/race/camera.js`) : anticipation des virages, compensation du retard de suivi (la caméra ne s'éloigne plus de 12 à 18 m quand on accélère :
  la voiture garde 5,4 % de la largeur à 280 km/h au lieu de 3,5 %), visée qui suit la pente et qui glisse vers la zone de réception pendant un saut, sortie de mur / looping / vrille
  où la caméra accompagne la voiture puis rejoint l'horizon en ≈ 0,6 s (roulis résiduel à 0,3 s : 6° au lieu de 31°). Purement visuelle, réglage « Sensations » (0 : aucune aide).
- **Vérificateur de continuité** (`js/continuity.js`, `js/connect.js`) : raccords de roulis de toutes les pièces (sol ↔ plafond, mur gauche ↔ mur droit…), gravité propagée depuis le départ,
  pièces qui retournent la voiture sans gravité (vrille sans « Inversion de gravité », transition retournée), raccords manqués de peu, combinaisons qui ne passent pas (mesurées),
  conseils (mur ≥ 108 km/h, rupture de pente). Trois niveaux : bloquant probable / à vérifier / conseil ; rien n'empêche de construire. Fenêtre « Problèmes du circuit » (où, pourquoi,
  conséquence, remède, bouton « Voir », correction en un clic de la vrille).
- **Éditeur** : outil **Prolonger** (touche P, bouton ➜, `js/extend.js`), annuler / rétablir restaurent le rectangle de sélection, aide à la pose, pastille qui ne crie plus pendant qu'on construit.
- **Matrice de compatibilité** (`tools/matrice-pieces.mjs`) : 112 pièces × 4 orientations roulées par le vrai moteur ; la table lue par le vérificateur (`js/pieceFacts.js`) en est générée.
- Tests : `test-continuite`, `test-camrig`, `test-editeur-phase1` (npm test) ; `test-browser-camera`, `test-browser-editeur` (npm run test:browser).

## Bêta 0.9.59 — audit complet (physique, éditeur, interface, sauvegardes, sécurité)

`PHYS_VER` 33 → **34** : la physique et les règles de course changent (dernier commit de la série, isolé : voir « Physique » ci-dessous). **Redéployer `submit-score`**
après la mise en ligne, sinon le serveur refuse les nouveaux temps (« serveur d'une autre version ») ; les records restent affichés, leurs replays et les classements de la
version 33 ne sont plus comparables (au moment de l'audit la production ne comptait que 2 temps en version 33). Le rapport complet, avec ce qui n'a PAS été corrigé et ce
qui n'a PAS pu être testé, est dans [docs/AUDIT-0.9.59.md](docs/AUDIT-0.9.59.md).
- **Méthode** : exploration aléatoire du vrai moteur (5 000 circuits tirés au hasard, 30 millions de pas, invariants vérifiés à chaque pas, rejeu comparé à la course),
  150 000 opérations d'éditeur au hasard (structure du circuit et historique vérifiés après chacune), parcours de tous les écrans à huit tailles dans Chromium
  (360 × 640 à 1920 × 1080), cycles répétés course / éditeur / garage (fuites), lecture seule de la base de production.
- **Physique** (`PHYS_VER` 34 ; empreinte : 2 scénarios sur 193 changent ; temps de référence des 72 circuits, médailles et corpus de compatibilité **inchangés**) :
  - *Ralentisseur* à 100 % et plus (100 % est le réglage par défaut) : sa résistance égalait ou dépassait la poussée du moteur, une voiture arrêtée dessus ne repartait
    **jamais** (0,1 m/s gaz à fond). Elle garde maintenant, sous les gaz, 3 m/s² jusqu'à 11 km/h : elle traverse au pas. Au-dessus, le ralentisseur freine comme avant.
  - *Bateau hors de l'eau* : totalement immobile (poussée 4 m/s², résistance 7) alors qu'il devait « se traîner sur la route » : même pas rampant.
  - *Nez dans la paroi d'un ruban* (virage relevé, looping, vrille, tire-bouchon) presque à l'arrêt : plaquée pour toujours gaz à fond (le dégagement de la 0.9.54 ne
    valait qu'au sol). La paroi fait maintenant pivoter la voiture le long d'elle.
  - *Bordure intérieure d'un virage montant serré* : une voiture qui glissait de côté vers elle la traversait (13 cas sur 300, jusqu'à 2,8 m au-delà). La hauteur de la
    bordure est maintenant jugée à la hauteur de la voiture au-dessus de la route, pour une voiture posée sur une pièce en pente.
  - *Checkpoint aérien franchi avant le premier relevé de position* (vitesse de départ, anneau juste après le départ, au-dessus d'un vide) : le point de retour était
    le vide sous l'anneau → retour automatique en boucle, sans issue. Le point de retour précédent est gardé.
  - *Nouveau tour franchi en l'air à côté de la route* : le point de retour gardait la position hors route → même boucle. Il est ramené sur la chaussée.
- **Pilote automatique** : volant inversé à tort sur les rubans posés à l'envers (virage relevé, tire-bouchon, looping au plafond) : il finissait contre la paroi.
- **Éditeur** : coller une zone ou descendre une sélection pouvait enterrer des pièces (à l'envers, pente descendante, route sur un mur : le prefab « Wall-ride » collé
  au sol descendait 9 m sous terre) → la zone collée est remontée, le décalage refusé ; un décalage de niveau **refusé** modifiait quand même le circuit (ordre des
  pièces, objets recréés, sans pas d'annulation) ; « Sélectionner le groupe » prenait toutes les pièces du rectangle englobant, départ compris ; le vérificateur signale
  la règle « gravité inversée au départ » sans départ au plafond (retours en boucle) ; codes de circuit fabriqués : cases bornées, réglage non numérique écarté.
- **Interface** : accueil à six tuiles sur 5 + 1 (1366 × 768 et 1920 × 1080) → une rangée ou 3 + 3 ; garage sur téléphone en portrait : la voiture était sous le
  panneau ; garage en paysage bas : un seul élément visible ; Paramètres › Commandes : titre, onglets et consigne des touches à même la scène 3D ; arrivée franchie au
  plafond : la caméra d'arrivée (et l'orbite et le poste TV des replays) passait derrière la route retournée ; « 3 » du décompte effacé après un recommencement
  rapide ; chrono « 00:60.000 » au passage d'une minute.
- **Comportement** : onglet masqué ou écran « tourne ton téléphone » pendant une course en solo → pause (la course reprenait seule, ou avançait derrière l'écran) ; son
  suspendu dans un onglet masqué ; voiture immobile gaz à fond depuis 3 s → message « Bloqué ? R : retour au checkpoint ».
- **Sauvegardes** : « Effacer les records » sur un appareil ne retirait pas les records du stockage de l'autre appareil du même compte ; enregistrer un circuit avec un
  stockage plein annonçait « Circuit enregistré » sans rien écrire (on libère d'abord la place des fantômes des plus anciens records, l'échec est annoncé).
- **Supabase** (production lue en LECTURE SEULE, rien n'a été modifié) : étapes 1 à 15 conformes, 15b toujours à appliquer, sécurité au niveau des lignes active sur
  les 27 tables, commandes des courses et fantômes non lisibles par le jeu. Proposé, **non appliqué** : `supabase/etape16-durcissement.sql` (retrait des droits de
  table par défaut de Supabase que le jeu n'utilise pas : uniquement des `revoke`, testé par `tools/test-etape16-sql.sh`).
- **Tests ajoutés** : `tools/test-audit-physique.mjs`, `tools/test-audit-editeur.mjs`, `tools/test-audit-sauvegardes.mjs` (dans `npm test` : 88 fichiers),
  `tools/test-browser-audit.mjs` (8 essais dans Chromium, `npm run test:browser`), `tools/test-etape16-sql.sh` (`npm run test:sql`). Chaque test de correction échoue
  sur le code d'avant. Un test existant a été ajusté, avec sa justification mesurée : `test-coach` (le conseil « retour au checkpoint » n'est plus forcément le
  premier : la voiture qui restait plaquée contre un ruban se dégage maintenant et racle les murs, que le coach signale à juste titre).

## Bêta 0.9.58 — phase 7 : finalisation (physique, duplication, rotation, garage, serveur)

`PHYS_VER` 32 → **33** (la physique change : records, fantômes et classements de la version 32 ne sont plus comparables ; la 32 n'a JAMAIS été déployée : la production est en 31, **il n'y a donc qu'un seul changement de version à subir**) ; **redéployer `submit-score`** (`npm run build:function`). Les 72 temps de référence du pilote automatique sont **inchangés** (`tools/golden.mjs`).
- **Physique** :
  - *Volant tenu à fond* (`js/physics.js`, `_tires`) : à basse vitesse, la composante longitudinale de la force du pneu avant braqué (jusqu'à 20 m/s²) dépassait la poussée du moteur (14 m/s²) : la voiture se stabilisait à **1,9 m/s sur un petit cercle, gaz à fond, indéfiniment**, au milieu d'une plateforme comme contre un mur (reproduit, mesuré, `tools/test-contacts.mjs`). Ce frottement est maintenant plafonné à 60 % de la poussée du moteur sous 8 m/s et au-delà de 0,4 rad de braquage ; au-delà, ou volant modéré, rien ne change.
  - *Voiture pressée contre un mur* (`js/physics/walls.js`) : un « choc » (perte de vitesse jusqu'à 65 %, rotation, moteur coupé) se payait à CHAQUE pas de 1/120 s tant que le volant poussait vers le mur (2 % de vitesse perdus par pas) : la voiture restait écrasée sous 2 m/s. Après 0,12 s de contact continu et sous 8 m/s, c'est du frottement (`wallScrape`, inchangé) ; un vrai choc, et le raclage à vive allure, coûtent comme avant.
  - *Toit d'un tunnel en gravité inversée* : il retient maintenant la voiture (elle en sortait par le haut, jusqu'à 84 m) ; plaquée dessous sans surface roulable, elle est ramenée au checkpoint après 1 s.
  - *Dalles pleines en gravité inversée* : **non bloquées, volontairement** : « Cristal Fêlé » (circuit officiel) monte de 8 niveaux en traversant les routes intermédiaires ; les bloquer le fait passer de 33 s à 70 s. Documenté et figé par un test (`docs/PHYSIQUE-CONTACTS.md`).
  - Épreuves : le volant à fond (plateforme, 12 impacts contre un mur des deux côtés), le toit de tunnel, la dalle traversée, le circuit officiel ; 250 courses aléatoires (`explore`) : mêmes anomalies connues qu'avant, aucune nouvelle.
- **Duplication (Ctrl + D)** : la sélection du **départ seul** ne crée plus rien ET ne l'annonçait pas comme un succès : plus de « Dupliqué : 0 pièce », plus de pas d'historique, sélection inchangée. Tout ou rien : si une copie est refusée (limite de décorations), ce qui venait d'être posé est retiré. Tests : Node (`tools/test-duplicate.mjs`, 15 cas) et navigateur avec la VRAIE touche (départ seul, une pièce, décorations seules, mélange, répétition, Ctrl + Z / Ctrl + Y exacts).
- **Rotation** : le gizmo 3D des décorations propose maintenant les cercles X, Y et Z (pas réglable : 1°, 5°, 15°, 45°, 90°) ; saisie d'angle au demi-degré à côté de chaque curseur ; angles affichés au dixième de degré. **Les pièces de circuit n'ont PAS de rotation libre** (cap par quarts de tour, quatre orientations, inclinaison par type de pièce) : raisons techniques et limites dans `docs/ROTATIONS.md` ; `tools/test-piece-rotations.mjs` prouve que 24 circuits couvrant 93 types de pièces / orientations / obstacles se conduisent aux MÊMES temps tournés de 90°, 180° et 270°.
- **Garage** : vérification visuelle réelle (`tools/garage-sheets.mjs` : captures de chaque modèle, trois vues) et mesures sur le modèle 3D (`tools/test-garage-geometry.mjs`, dans `npm test`). Défauts trouvés et corrigés : anneau et planche de surf de l'aileron qui flottaient ; planche de surf (ornement) trop fine pour se voir ; motifs de flanc posés à hauteur fixe (flottant au-dessus d'une caisse basse, débordant des caisses courtes) : ils s'adaptent à chaque carrosserie ; finitions « givrée » et « pailletée » qui délavaient la couleur (lueur blanche) ; traîneau sans patins. Nouveaux tests navigateur : équipement acheté, enregistré, retrouvé dans une NOUVELLE page ; quatre klaxons ; les 18 traînées sur une vraie course. `docs/GARAGE.md` dit aussi ce qui n'est PAS vérifié (rendu logiciel : reflets et ombres variables).
- **Supabase** : étape 15 durcie (verrou de signature à la publication ; valeurs revérifiées dans `publish_track` ; droits d'écriture directs retirés explicitement sur `tracks` et `scores` ; `search_path` fermé) ; **tests de concurrence ajoutés** (deux pilotes publient la même signature en même temps ; droits) ; `supabase/verify-prod.sql` (LECTURE SEULE, vérifié sur une base « étapes 1 à 14 » et sur la base complète) ; procédure de mise à jour complète avec vérification à chaque étape et compatibilité des anciennes versions du jeu (`supabase/MIGRATIONS.md`) ; `ice` : identifiants de **1 h** (2 h au plus ; 2 h / 6 h avant).
- **Production Supabase (phase 8, opérations réelles, journal dans `supabase/MIGRATIONS.md`)** : trois défauts que les tests locaux ne pouvaient pas voir, trouvés en comparant la base réelle à une base de référence et par un essai de bout en bout :
  - les **étapes SQL 7 et 8 n'avaient jamais été jouées** en production et `track_comments_list` était une ancienne édition de l'étape 13 (or `submit_best`, étape 15, écrit `scores.ghost`) ; `verify-prod.sql` les contrôle maintenant, l'étape 13 se rejoue (`drop` avant `create`) ;
  - **un nouveau joueur ne pouvait pas créer son profil** (HTTP 403) : le jeu utilise un « upsert » (`ON CONFLICT … DO UPDATE SET id, name`) et l'étape 14 n'accordait que `update (name)` ; corrigé dans l'étape 15 (`grant update (id, name)`, la politique RLS impose `id = auth.uid()`), testé avec l'instruction exacte de PostgREST ;
  - la ligne « APRÈS 15b » de `verify-prod.sql` annonçait « 15b appliquée » alors que la publication directe restait ouverte sur 8 colonnes.

## Bêta 0.9.57 — éditeur (Ctrl+D de zone, rotations) et personnalisation des véhicules (thèmes de saison)

`PHYS_VER` inchangé (**32**) : rien ne touche à la physique (empreinte identique ; voir `tools/test-cosmetics-physics.mjs`). `submit-score` n'a pas à être redéployé pour cette version.
- **Éditeur · Ctrl+D** duplique maintenant TOUTE la zone sélectionnée (outil Sélection) : pièces et décorations copiées d'un coup sur la première place libre (à droite, en dessous, à gauche, au-dessus, puis un niveau plus haut ou plus bas), sans rien écraser, en un seul pas d'annulation ; la copie devient la sélection (Ctrl+D répété enchaîne les copies) ; le départ reste unique. Sans zone, ou avec l'outil Inspecter : la pièce inspectée, comme avant.
- **Éditeur · rotations** (inspecteur) : pièces : **Cap** (↶ 90° / 0° 90° 180° 270° / ↷ 90°) et **Roulis** (sol, mur gauche, mur droit, plafond) réunis dans « Rotation » ; l'inclinaison reste celle du type de pièce. Décorations : **Cap (Y)**, **Inclinaison (X)** et **Roulis (Z)** de −180° à 180°, boutons ±90°, « Remettre droit », « Retourner », « Tout à zéro ». L'inclinaison et le roulis sont **purement visuels** : refusés sur un obstacle (sa forme de contact ne tourne qu'autour de la verticale), absents de la signature des temps, et un circuit sans inclinaison garde EXACTEMENT son code (13e et 14e valeurs de la décoration, écrites seulement si elles servent). Gardés par annuler / rétablir, le copier-coller et le pivotement d'une zone (ordre YXZ : un quart de tour de la zone ne change que le cap).
- **Véhicules** : 9 carrosseries (Kart, Cabriolet, Coupé GT, Hot rod, Tout-terrain, Fourgonnette, Bulle, Limousine, Traîneau), 4 finitions (Pailletée, Givrée, Bonbon, Chromée), 3 jeux de roues (Chromées, Chaînes à neige, Jaune soleil), 2 ailerons (Planche, Anneau), 12 motifs de flancs, 13 ornements (bonnet de Père Noël, bois de renne, mini-sapin, bonhomme de neige, chapeau de fête, parasol, planche de surf, bouée, cornet de glace, chapeau de sorcière, citrouille, oreilles de lapin, ballon cœur ; aussi sur la moto), 9 LED et 9 traînées.
- **Thèmes de saison** : Noël, Nouvel An, Hiver, Plage, Été, Halloween, Printemps, Automne, Saint-Valentin : 21 préréglages (regroupés par thème dans Presets), 13 palettes de couleurs (onglet Couleurs : un clic règle peinture, secondaire et dessins ; gratuit), 16 couleurs de plus, 9 collections de saison (+100 ◆ une fois, comme les autres).
- **Garantie (test `tools/test-cosmetics-physics.mjs`, dans `npm test`)** : le code de la physique, de la course simulée et de la vérification serveur n'importe aucun module de personnalisation, même indirectement ; aucun fichier de physique ne lit d'équipement ; construire les 160 variantes de véhicule ne change pas un seul bit d'une course simulée ni les constantes `CAR`. Épreuves par mutation faites (import ajouté, `CAR` modifié par le modèle : détectés).

## Bêta 0.9.56 — phase 4 : validation finale, aucun succès silencieux

`PHYS_VER` inchangé (**32**) : l'empreinte de la physique (193 scénarios) est identique ; le bundle `submit-score` est régénéré (`npm run build:function`) parce qu'il embarque `js/physics.js` (une remise à zéro sans effet sur les empreintes) : **redéployer `submit-score` une seule fois**, avec la version 0.9.55.
- **Les deux anciens échecs navigateur (« pixel du garage », « onglet Amis du profil »)** : cause trouvée et reproduite. Le tutoriel du premier lancement s'ouvre 700 ms après le démarrage par un minuteur de la page ; sur une machine lente le minuteur part tard, après le contrôle unique du test, et le voile de la fenêtre (`<div id="modal" class="overlay">`) intercepte alors tout clic SOURIS réel (les autres tests cliquaient par script, qui traverse le voile). Le test ATTEND la fenêtre, vérifie ce qui recouvre un élément avant de cliquer (`realClick`, message explicite au lieu d'un délai de 30 s). Le jeu n'était pas en cause. Suite complète : 49/49 sous charge (2 cœurs saturés).
- **Aucun succès sans résultat observable** : `tools/test-browser*.mjs` échouent (au lieu d'« ignorer ») si Playwright ou Chromium manquent en CI (`CI` ou `REQUIRE_BROWSER`), et si moins de 40 / 5 tests ont tourné ; `tools/run-tests.mjs` échoue si un fichier de tests n'exécute aucune vérification ou cache une ligne `FAIL` ; le journal complet d'appel de Playwright et une capture sont gardés pour chaque test en échec.
- **Workflow `.github/workflows/test.yml`** : permissions minimales, durée maximale par tâche, `test-submit-handler` et `test-ice` exécutés aussi sous Deno (le moteur de production), tâche `gate` qui échoue si UNE des quatre tâches n'est pas en `success` (échec, annulée ou ignorée) : à exiger dans la protection de branche. Un premier essai de ce fichier était invalide (`runner` non permis dans `env` d'une tâche) : GitHub n'a lancé aucune tâche, ce que `gate` rend désormais visible.
- **Test navigateur encore instable sur le runner GitHub (constaté, non résolu)** : à code de test identique, le run 168 est vert et le run 169 rouge (« records et médailles » et « aides à la conduite » : attentes de 30 s expirées). Cause non établie. Les attentes (`waitApp`) sondent désormais toutes les 100 ms (et non à chaque image, que le rendu logiciel espace de plusieurs secondes) et, en cas de délai dépassé, l'échec indique l'état de la page (écran visible, fenêtre ouverte, nombre d'images dessinées en 1,5 s : « page bloquée » ou « condition fausse ») : le prochain échec sera diagnostiquable.
- **`js/main.js`** : une erreur de la boucle hors course est maintenant SIGNALÉE au joueur (au plus un message toutes les 15 s), pas seulement journalisée.
- **`js/physics.js`** : le dégagement du mur (`unstick`) est remis à zéro sur un ruban (valeur périmée sans effet visible, mais non déterministe par construction).
- **`tools/check-deployed.mjs`** (nouveau, LECTURE SEULE) : compare le dépôt à ce qui est en ligne (version de physique de `submit-score`, actions, authentification de `ice`, colonne `tracks.author_verified`).

## Bêta 0.9.55 — phase 3 : causes profondes des gels et blocages au contact

`PHYS_VER` 31 → **32** (la physique change : records, fantômes et classements de la version 31 ne sont plus comparables ; **redéployer `submit-score`** : `npm run build:function`). Analyse complète, preuves et limites : `docs/PHYSIQUE-CONTACTS.md`.
- **Boucle du jeu (`js/main.js`)** : `requestAnimationFrame(loop)` était la dernière instruction du corps de la boucle. UNE exception (physique, course, rendu, interface) la tuait pour de bon : écran figé jusqu'au rechargement, sans message, alors que les boutons de la page répondaient encore. C'est le « gel complet ». La prochaine image est maintenant toujours demandée ; l'erreur est journalisée (`window.__ctErrors`) ; en course, la 1re erreur ramène au dernier checkpoint, la 2e (dans les 5 s) abandonne proprement la course.
- **Voiture écrasée par un obstacle mobile (`physics/obstacles.js`)** : un mur coulissant (ou autre bloc) qui écrasait la voiture contre une bordure la poussait, quand son centre entrait dans le bloc, par la face DU BAS : 2 m sous la chaussée. Sous le sol, plus aucune surface n'était cherchée : chute **sans fin**, aucun retour automatique (y < −800 m après 12 s). Corrigé en trois points : la face du côté du sol n'est jamais choisie, un obstacle ne pousse jamais une voiture posée dans la route, et une voiture qui passe 60 m sous le circuit est déclarée perdue (même retour automatique que le ciel en gravité inversée).
- **Bordures après un obstacle** : l'obstacle poussait la voiture APRÈS la résolution des bordures ; au pas suivant `_walls` croyait la voiture dehors (sa position précédente dépassait la moitié du rail) et la plaquait contre l'extérieur : éjectée de la route (12 cas sur 96 testés). Les bordures sont ré-appliquées après un obstacle.
- **Bumper** : actif à n'importe quelle hauteur (un bumper posé sur un pont frappait les voitures qui passent dessous, à 12 ou 40 m) ; borné comme les piques.
- **Voiture plaquée nez au mur** : gaz à fond, volant droit ou faible, elle restait collée indéfiniment (frottement du mur ≥ poussée du moteur à basse vitesse). Le contact la fait maintenant pivoter vers la tangente du mur, jusqu'à ce que le nez s'en écarte ; armé seulement quand elle est plaquée ou rampe (< 4 m/s, 0,25 s) ; une voiture qui roule n'est jamais touchée. 1,7 à 6 s pour repartir au gaz seul (avant : jamais).
- **États invalides** : un état NaN / infini (ou démesuré) est détecté au pas même et déclenche le retour au checkpoint (même décision au rejeu et sur le serveur) ; `dt` NaN ne fige plus l'accumulateur de la physique ; un angle non fini ne peut plus faire boucler le calcul du cap de réapparition.
- **Tests** : `tools/test-contacts.mjs` (dans `npm test`) fait évoluer le VRAI moteur sur des scénarios de contact (verre, piques, bumper, obstacles mobiles, contacts multiples, bordures, gravité inversée, aimants, checkpoints, téléportation, chute sans fin, valeurs invalides) et des essais de charge à graine fixe ; le test navigateur vérifie que la boucle survit à une exception. Chaque correction a été éprouvée par mutation (le test échoue quand on la retire).
- **Limites connues** : voir `docs/PHYSIQUE-CONTACTS.md` (gravité inversée sous une dalle pleine ou un tunnel, volant tenu à fond contre un mur, gel jamais reproduit autrement que par ces causes).

## Bêta 0.9.54 — backend sûr : limitation, meilleur temps atomique, temps d'auteur rejoué

`PHYS_VER` inchangé (31). **Lancer `supabase/etape15-backend.sql` AVANT de redéployer `submit-score` et `ice`**, puis mettre le jeu en ligne, puis `supabase/etape15b-publication-verifiee.sql`. Ordre, preuves à relever, retour arrière : `supabase/MIGRATIONS.md`. Ces étapes et déploiements ne sont **pas** appliqués par ce commit : rien n'est présenté comme appliqué sans preuve.
- **Meilleur temps (confirmé par l'audit)** : lecture puis écriture séparées — deux soumissions simultanées pouvaient laisser un temps plus lent à la place d'un meilleur record. Désormais une seule fonction SQL (`submit_best`), verrouillée par pilote : le temps moins bon, ou d'une physique plus ancienne, ne remplace jamais le record ; le fantôme et les temps intermédiaires sont toujours ceux de la course retenue (avant, un record plus rapide pouvait garder le fantôme d'une course plus lente).
- **Plafond de 2 000 temps (confirmé)** : à 2 000 lignes, un pilote ne pouvait plus améliorer un temps existant (l'« upsert » déclenchait le plafond) ; et deux insertions simultanées à 1 999 donnaient 2 001 (prouvé : 2 001 avec l'ancien déclencheur, 2 000 avec le nouveau, sessions `psql` simultanées).
- **Limitation de cadence** : persistante (en base), partagée entre instances, atomique (verrou par type), plafond global et sous-plafond des sessions anonymes (elles ne peuvent plus épuiser le plafond au détriment des comptes). **Base indisponible : 503** (avant : la limite partagée était ignorée, « ouvert »).
- **Version de physique** : message d'erreur avec les deux versions et `serverPhysVer` ; `GET` sur `submit-score` renvoie la version de physique réellement déployée (preuve observable). Une version plus ancienne ou plus récente est refusée avant tout rejeu, pour les courses comme pour les publications.
- **Circuits de joueurs** : la signature qui sert de clé de classement n'a que 32 bits ; une paire de circuits différents de même clé a été trouvée (la position d'un arbre diffère) et le rejeu seul accepte une course de l'un sous la clé de l'autre. Chaque clé `u-…` est désormais liée à une empreinte SHA-256 du contenu (`track_binds`) : l'autre circuit est refusé (409).
- **Temps d'auteur** : jamais accepté parce que le client l'annonce. La publication passe par la fonction serveur (`publish-track`) qui REJOUE la course de vérification de l'auteur sur ce code ; `author_time` est le temps rejoué, `author_verified = true`. Les circuits déjà publiés restent « non vérifiés » (affiché, sans médailles déduites) jusqu'à republication par leur auteur. Médailles : elles restent calculées par le jeu à partir de temps rejoués ; la médaille envoyée avec les statistiques anonymes n'est pas vérifiable et n'est lue par aucune fonction du serveur.
- **Publication directe** : `created_at` (limite de 10 publications par heure contournable en antidatant), `picked_at` (« Sélection ») et les compteurs n'étaient pas protégés ; droits par colonne (étape 15), insertion directe fermée à l'étape 15b.
- **`ice` (TURN)** : sans `SUPABASE_URL` / clé de service la fonction **refuse** au lieu de s'ouvrir ; limite en base (10/min par pilote, 300/min en tout, 200 pour les sessions anonymes) ; identifiants de 2 h par défaut (6 h au plus, avant 6 h par défaut et 24 h au plus) ; 503 si la limite ne peut pas être tenue.
- **Tests** : `tools/test-accounts-sql.sh` échouait en silence (code de sortie 0 même avec un test en échec) : il échoue maintenant ; concurrence réelle en SQL ; `test-submit-handler` réécrit contre une base simulée avec état ; `test-publication`, `test-ice` étendus.

## Bêta 0.9.53 — phase 6 : consolidation finale

`PHYS_VER` inchangé (31). Bilan détaillé, avec l'état de chaque problème (confirmé, corrigé, testé, validé, non validé, restant) : `docs/PLAN-FINALISATION.md`. Procédures de test : `docs/TESTS.md`.
- **Lint** : 19 erreurs ESLint dans les fichiers de test écrits pendant ce chantier (variables inutilisées, `const`, globaux du navigateur) : la CI aurait échoué. Corrigées ; `npm run lint` passe.
- **Record en mémoire** (`storage.getRecord`) : la copie du record faite pendant la session passait devant un record synchronisé d'une physique plus récente dès qu'elle avait un meilleur temps (d'une ancienne physique). La physique la plus récente l'emporte maintenant ; à physique égale, le meilleur temps.
- **Traduction** : « un circuit reçu d'un ami » s'affichait « d'un friend » en anglais (trouvé par le test navigateur de langue).
- **Essais croisés** (`tools/test-croises.mjs`, dans `npm test`) : verre × obstacles mobiles × gravité inversée × aimant × volant inversé × checkpoints × retours sur chaque surface spéciale × groupes logiques × replays (avec retours volontaires) × circuits personnalisés × vérification des scores (code modifié, temps falsifié, autre physique, circuit officiel mis à jour) × code découpé en morceaux (multijoueur) × sauvegardes de deux appareils × invité → compte × 300 opérations d'édition au hasard (aucune pièce ne se chevauche, l'index reste cohérent).
- **Performances mesurées** : 8 µs par pas de physique (budget : 8 300 µs à 120 Hz), identique avant et après les corrections de ce chantier ; les écouteurs d'événements de l'éditeur sont bien retirés à sa fermeture ; aucune dégradation de la précision physique.
- **Test navigateur** : aperçu du pot de peinture (zone surlignée avant le clic, circuit inchangé, un seul pas d'annulation).
- **Documentation** : `docs/TESTS.md` (toutes les procédures, PostgreSQL jetable, limites), plan de suivi avec le bilan final.

## Bêta 0.9.52 — phase 5 : accueil à six catégories, écrans rangés

`PHYS_VER` inchangé (31). Suivi : `docs/PLAN-FINALISATION.md`.
- **Accueil** : six catégories — **Jouer**, **Créer**, **Multijoueur**, **Progression**, **Profil**, **Paramètres** — au lieu de six tuiles mêlant jeu, création et réglages plus deux sous-menus et une barre de raccourcis. Chaque catégorie ouvre un **panneau** d'actions (titre, ← Retour, Échap, bouton retour de la manette), au lieu d'un sous-menu qui s'ouvrait sous les tuiles ; un écran ouvert depuis un panneau y ramène au retour. Chaque action n'apparaît qu'une fois ; rien n'est supprimé : *Multijoueur* (salons) n'était accessible que depuis l'écran Communauté, il est maintenant dans son propre panneau. Aucun bouton ne mène à une fonction absente (pas de « Reprendre une partie » : le jeu n'a pas de sauvegarde de course en cours).
- **Un écran à onglets pour trois entrées** : *Profil* (Compte, Amis, Sauvegardes), *Progression* (Records et médailles, Niveau et licences, Statistiques, Déblocages) et *Paramètres* (Audio, Graphismes, Accessibilité, Jeu, Interface, Commandes). Avant, tout cela tenait dans un seul onglet « Options » d'une soixantaine de réglages mélangés (le nom du pilote au milieu des commandes tactiles, « Effacer tous les records » au bas des options). Le nom du pilote est dans Compte, « Effacer les records » dans Sauvegardes (zone sensible), la langue dans Audio, les commandes tactiles dans Commandes, la taille de l'interface dans Accessibilité.
- **Progression** (nouveaux écrans, faits de données déjà présentes) : bilan de la carrière et **tous les records et médailles** circuit par circuit (une ligne ouvre la fiche du circuit), statistiques, chapitres ouverts ou à gagner, titres, récompenses de niveau.
- **Nettoyage** : boutons de l'ancien accueil (`profile`, `options`, `controls`) et leurs règles CSS retirés ; bouton « Multijoueur » en double dans l'en-tête de la Communauté retiré ; classes CSS orphelines retirées (le test de style les trouvait). Les chemins cités dans les messages du jeu suivent la nouvelle organisation (« Paramètres › Interface », « Multijoueur › Amis »…), en français et en anglais.
- **Tests** : `tools/test-menu.mjs` réécrit (six catégories, panneaux, aucun bouton mort, chaque onglet a son panneau, aucun réglage perdu ou en double) ; le test navigateur parcourt les trois entrées et tous leurs onglets, les six panneaux sur 5 tailles d'écran (entrées touchables, 40 px au moins), Échap, le retour, et ouvre une fiche depuis les records.

## Bêta 0.9.51 — phase 4 : comptes, cloud, scores, multijoueur

`PHYS_VER` inchangé (31). **Lancer `supabase/etape14-securite.sql`** (relançable, aucune suppression) et **redéployer les fonctions `submit-score` et `ice`** (`npm run build:function`, déjà régénérées ici). Suivi : `docs/PLAN-FINALISATION.md`.
- **Sécurité (réel défaut)** : le **code joueur** contenait la session en ligne de l'invité (jeton d'accès et de renouvellement) : quiconque recevait ce code et l'importait **devenait ce pilote** (scores, circuits publiés), et l'importer chez soi effaçait sa propre identité en ligne. Le code ne la contient plus, l'import l'ignore (les anciens codes aussi) et une restauration en « remplacer » garde l'identité de l'appareil.
- **Sessions** : une panne du serveur (500, 502, 503) ou un « trop d'essais » (429) au renouvellement de la session **déconnectait le compte** et **donnait à l'invité une nouvelle identité anonyme** (donc un autre pilote : ses scores et circuits lui échappaient). Seul un jeton refusé par le serveur (400, 401, 403) expire la session ; le reste est une erreur passagère.
- **Restauration face aux suppressions** : restaurer une ancienne sauvegarde ne ressuscitait pas durablement ce qu'on avait supprimé (la pierre tombale du cloud l'effaçait à la synchronisation suivante), ni les records antérieurs à une remise à zéro. Les circuits et records restaurés sont maintenant marqués plus récents que les suppressions ; une suppression ou une remise à zéro volontaire reste valable pour tout ce qui n'a pas été restauré après. Pierres tombales réunies (la plus récente de chacune) à l'import en fusion.
- **`submit-score`** : le corps de la requête était lu en entier AVANT toute vérification de sa taille réelle (seul l'en-tête `Content-Length`, absent ou falsifiable, était contrôlé) ; la lecture est maintenant **progressive, limitée en octets** (le flux est annulé au-delà). **Cadence partagée** entre instances en base (`etape14` : fenêtre glissante par pilote, atomique, plus un plafond global de rejeux) en plus du frein en mémoire de chaque instance (insuffisant seul : une rafale répartie sur plusieurs instances le contournait) ; si la base ne répond pas, la fonction garde sa limite en mémoire et le journalise. Forme des champs resserrée (clé de circuit, commandes en base64, temps de 0 à 600 s, version de physique).
- **Supabase (RLS, droits)** : revue complète des 13 étapes (RLS sur les 24 tables, fonctions à droits explicites, `search_path` sur toutes les fonctions `security definer`). Défaut corrigé (`etape14`) : un pilote pouvait modifier la date de création de son profil (`created_at`) et contourner la règle « un signalement ne compte que s'il vient d'un profil de plus de 24 h » ; il ne peut plus écrire que `id` et `name` (et le titre seulement par `set_title`). `log_runs` (ouverte aux anonymes) reçoit un plafond global par minute. Tests : `npm run test:sql` (étapes 1 à 14, 145 contrôles) sur un vrai PostgreSQL.
- **`ice`** (relais TURN) : n'importe qui, avec la clé publique lisible dans la page, obtenait des identifiants TURN. La fonction exige maintenant une session Supabase (le jeu envoie le jeton du pilote) ; cadence par pilote.
- **Multijoueur** : le tampon d'interpolation ignore un paquet isolé à l'horloge fausse et repart après 3 paquets confirmant une nouvelle horloge (avant, tous étaient écartés comme « trop anciens » : voiture distante figée). Les limites de l'architecture (pas de rollback branché, collisions douces non rejouables, temps de manche annoncés par chaque joueur) sont écrites dans `supabase/MULTI.md`.
- **Tests** : `tools/test-phase4.mjs` (9 essais rouges avant, verts après : sessions, code joueur, restauration, convergence de la synchronisation de deux appareils sur 60 parties aléatoires, tampon d'interpolation), `tools/test-submit-handler.mjs` (lecture progressive, `Content-Length` mensonger, formes, limite partagée entre deux instances), `tools/test-ice.mjs` (authentification), `tools/fake-supabase.mjs` (faux navigateur et faux Supabase partagés).

## Bêta 0.9.50 — phase 3 : éditeur, logique, progression

`PHYS_VER` 31. **Redéployer `submit-score`** (déjà régénérée ici). Les records, replays, fantômes et classements de la 0.9.49 (physique 30) ne sont plus valables, mais **les médailles et déblocages sont conservés** (voir « Progression »). Suivi : `docs/PLAN-FINALISATION.md`.
- **Annuler / rétablir** : annuler ou rétablir (même une seule fois) remettait à zéro l'**ambiance** (moment de la journée, brume, météo, musique) et les **déclencheurs de cases** du circuit : l'instantané de l'historique ne les contenait pas. Corrigé ; test : 40 modifications au hasard annulées puis rétablies une à une, chaque état retombe exactement (code partagé identique), et aller-retour sans perte sur les 72 circuits.
- **Sélection** : nouvelles actions, tout ou rien (si une pièce gêne, rien ne bouge) : **pivoter la sélection en place** (R ou ⟳), **la déplacer d'une case** (← ↑ ↓ →) et **la dupliquer** (Dupliquer, puis clic pour poser le double). Pièces, décorations, obstacles (leur cap tourne avec la pièce) et déclencheurs de cases suivent. Tests : la géométrie physique du circuit tourné (hauteur et revêtement en 400 points de 6 circuits) est exactement celle de l'original tourné ; quatre quarts de tour redonnent le circuit d'origine ; l'ordre des pièces est conservé.
- **Pot de peinture** : la zone est maintenant calculée par une fonction partagée (`fillZone`, parcours itératif, borné à 8 000 pièces : au-delà le remplissage est refusé en entier, rien n'est modifié) et **prévisualisée avant validation** : toutes les pièces qui changeraient sont surlignées en orange (en rouge si la cible est refusée ou la zone trop grande). Tests : zones séparées, différence de hauteur de plus de 2 niveaux, 1 600 pièces en moins de 500 ms, l'aperçu ne modifie rien.
- **Groupes logiques** : une pièce cachée par une règle PENDANT que la voiture la parcourt en ruban (looping, mur, tube) ne la portait plus… mais la voiture continuait à rouler sur la route invisible jusqu'au bout. Elle se détache et tombe maintenant (physique). Tests : retour au checkpoint (groupes cachés, compteurs, règles jouées et gravité reviennent exactement à l'état du checkpoint), obstacle caché sans contact / visible avec contact, 50 jeux de règles aléatoires sur des circuits officiels (jamais d'exception, effets bornés, résultats identiques deux fois de suite).
- **Replays** : tests de lecture identique à la course (verre, inversions de gravité, retours au checkpoint) sur trois circuits, et de la timeline (relire une ancienne pose donne la même pose, aucun saut de plus de 40 m).
- **Circuits officiels** : test sur les 72 : un départ, une arrivée au moins, aucune erreur du vérificateur, code partageable identique à l'aller-retour, la voiture se pose au sol au départ. Aucun circuit officiel n'a été modifié.
- **Progression** : les médailles se déduisaient du temps du record ; après une mise à jour de la physique, la première arrivée remplace l'ancien record même si elle est plus lente, et une médaille d'or pouvait redescendre en argent (puis reverrouiller la suite de la carrière). Le record garde maintenant le **meilleur temps de toutes les physiques** (`bt`) pour les médailles, les déblocages, les récompenses et le Race Hub ; la fusion de sauvegardes du compte le conserve dans les deux sens. Le temps du record (classement, fantôme, replay) reste celui de la physique courante.

## Bêta 0.9.49 — phase 2 (suite) : plus de boucle de réapparition sur du verre

`PHYS_VER` 30. **Redéployer `submit-score`** (déjà régénérée ici).
- **Boucle sans fin sur le verre** : un checkpoint (ou un point de retour) posé sur une dalle de verre ramenait la voiture sur une dalle qui cède ; un joueur qui attendait voyait « dalle brisée → chute → hors piste → retour au checkpoint » se répéter toutes les 2,6 s à l'infini (reproduit : 16 retours en 100 s). Le verre sous le point de réapparition ne cède plus tant que la voiture ne l'a pas quitté (`glassSafe`, `placeAtRespawn`). Le départ, lui, est inchangé.
- Tests ajoutés dans `tools/test-physique-phase2.mjs` (rouges avant, verts après). Seul le noyau de la boucle de jeu (pas fixe plafonné à 0,1 s par image, évènements remis à zéro à chaque pas) a été relu : aucun autre gel trouvé.

## Bêta 0.9.48 — phase 2 : réparation de la physique

`PHYS_VER` 29 (physique changée). **Redéployer `submit-score`** (déjà régénérée ici). Les records, replays, fantômes et classements de la 0.9.47 (physique 28) ne sont plus valables. Suivi du chantier : `docs/PLAN-FINALISATION.md`.
- **Obstacles sur les rubans** (looping, mur, tube, vrille) : les piques, bumpers, marteaux, balanciers, murs coulissants et balayeurs n'y avaient **aucun effet** (la collision n'était calculée qu'au sol : la voiture les traversait). Le contact est maintenant calculé sur le ruban avec la même fonction qu'au sol, puis le déplacement et la vitesse sont ramenés dans le repère du ruban (`_ribObstacles`, `js/physics/ribbon.js`). Un choc ne détache pas la voiture du ruban.
- **Voiture coincée contre un mur** : à l'arrêt, nez au mur, le volant n'avait aucun effet (pas de vitesse, donc pas de rotation) et le gaz ne la libérait pas ; seule la marche arrière la sortait. Après 0,35 s plaquée contre un mur à moins de 2,5 m/s, le volant la fait pivoter sur place (1,2 rad/s à fond de volant) jusqu'à ce qu'elle reparte. Hors contact avec un mur, rien ne change.
- **Retour au checkpoint : gravité cohérente avec la route** : un point de réapparition posé sur une route retournée (ou normale) a toujours la gravité de CETTE route (`respawnGs`) ; un anneau-checkpoint pris après une inversion de gravité gardait la gravité du moment du franchissement, pas celle du point de réapparition (voiture réapparue dans le ciel, à l'envers sur un sol normal).
- **Vérifié sans défaut** (essais conservés) : aucun obstacle n'est traversé de 60 à 340 km/h (aucun nombre non fini, aucun enfoncement dans un poteau) ; le verre (voisines indépendantes, dalles empilées, plafond, ruban, retour au checkpoint et redémarrage qui restaurent tout, rejeu identique) ; le volant inversé n'agit que sur une pièce qui l'a ; la caméra se retourne en 0,45 s (essais existants) ; aimant / volant inversé / accélérateur / verre à l'envers ; 72 circuits × 4 000 pas avec surfaces, verre, inversions et obstacles ajoutés au hasard : jamais de voiture figée ni de valeur non finie.
- **Tests** : `tools/test-physique-phase2.mjs` (échoue sans les correctifs : 4 essais rouges avant, tous verts après). Régénérés : empreinte physique, corpus de compatibilité, `sw.js`, fonction `submit-score`.

## Bêta 0.9.47 — remise à niveau : accueil allégé

`PHYS_VER` inchangé (28). Suivi du chantier : `docs/PLAN-FINALISATION.md`.
- **Accueil** : 8 boutons visibles au lieu de 12 : **6 tuiles** (Course rapide, Carrière, Défi du jour, Créer, En ligne, Garage), deux **sous-menus** (Créer : éditeur, mes circuits, importer, modes ; En ligne : communauté, compétition) et une barre d'accès rapides (Académie, Profil). Un clic ailleurs referme le sous-menu ; `aria-expanded` et `aria-controls` pour les lecteurs d'écran. Rien n'est supprimé : toutes les actions restent atteignables.
- **Tests** : `tools/test-menu.mjs` (au plus 8 boutons visibles, aucune action perdue, aucun bouton mort) ; le test navigateur parcourt les sous-menus sur trois tailles d'écran. Deux courses de vitesse du test navigateur sont réparées : l'enchaînement des fenêtres du premier lancement bloquait le toucher sur « Carrière », et un panneau d'amis redessiné laissait une lecture sur `null`.
- **Fenêtres hautes** : une fenêtre plus haute que l'écran (l'Académie sur un écran de 700 px) débordait en haut et en bas : le titre et les boutons étaient hors d'atteinte. Elle défile maintenant (`.overlay .panel`) ; test navigateur ajouté (échoue sans le correctif : haut −187 px, bas 887 px sur 700).
- **Test « aucun bouton inaccessible »** (navigateur) : 13 écrans et fenêtres × 5 tailles d'écran ; chaque bouton, champ ou liste doit être dans l'écran ou dans un conteneur qui défile jusqu'à lui. Sans le correctif ci-dessus, l'Académie perdait des boutons sur les quatre tailles testées (jusqu'à 1366×768).
- **Robustesse vérifiée par essais aléatoires** (aucun défaut trouvé, tests conservés) : `tools/test-submit-fuzz.mjs` (300 requêtes déformées au serveur de scores : toujours une réponse, jamais de 5xx, jamais d'écriture sans 200), `tools/test-sauvegardes-fuzz.mjs` (fusions de sauvegardes : jamais d'exception, aucune médaille / record / leçon perdu, stable), `tools/test-codes-fuzz.mjs` (2000 codes de circuit abîmés : refus propre ou circuit jouable).
- **Test navigateur** : les courses de vitesse du panneau de compétition (redessiné après chaque réponse du serveur) sont réessayées au lieu d'échouer au hasard.

## Bêta 0.9.46 — moteur propre au jeu, avec une vraie vitesse de pointe

`PHYS_VER` 28 (physique changée). **Redéployer `submit-score`** (déjà régénérée ici). Les records, replays, fantômes et classements de la 0.9.45 (physique 27) ne sont plus valables, comme ceux d'avant (physique 26 ou moins).

- **Moteur** (le réglage de la 0.9.45 n'avait aucune vraie limite de vitesse : 450 km/h en 10 s, 855 km/h en théorie) :
  - **plafond à 290 km/h**, et à **340 km/h sous turbo** ;
  - poussée forte au départ, qui s'essouffle près du plafond : 0 à 100 km/h en 2,2 s, 200 km/h en 5,5 s, 250 km/h en 9 s, environ 280 km/h au bout de 14 s ;
  - **gravité 19 m/s²** (16 en 0.9.45, 25 avant) : des sauts entre les deux ;
  - **lever le pied** freine un peu des deux façons (une résistance constante et une résistance proportionnelle à la vitesse), plus doucement qu'avant la 0.9.45.
  - Moto, bateau et deltaplane gardent leurs écarts avec la voiture.
- **Circuits** : sur 72, seuls 3 ont dû être retouchés.
  - *Double Hélice* : une case de plus avant la grande descente, vitesse du pilote 40.
  - *Monte-Charge* : vitesse du pilote 64.
  - *En Cadence* : les phases de ses deux piques sont déplacées (le moteur change l'instant d'arrivée).
  - Médailles, temps de référence, deux objectifs bonus (Aurore, Chaîne) et fiche d'essai recalculés ; contrat des 72 circuits tenu.
- **Académie** : la leçon « Réception » et l'exercice « Trois réceptions » ont une case de vide au lieu de deux entre la rampe et la réception (le pilote y réussit des réceptions parfaites) ; les exercices de dérapage retrouvent leurs trois cases d'élan ; seuils de l'exercice de freinage recalés.
- **Affichage** (repéré en parcourant tous les écrans sur ordinateur, téléphone en paysage et en portrait, en français et en anglais) :
  - **la feuille de style était tronquée** : une fusion de branches y avait laissé un marqueur de conflit (`=======`) et un commentaire jamais fermé, si bien que des règles étaient ignorées sans erreur visible. Réparé, et le nouveau test `tools/test-css.mjs` attrape ce genre de reste ;
  - **accueil sur téléphone en paysage** : les tuiles s'empilaient en deux colonnes coupées en haut et en bas (une règle de l'ancien menu à six boutons). Désormais six tuiles par rangée, logo réduit, et l'écran défile s'il est encore trop bas ;
  - **accueil en portrait** : le bouton plein écran recouvrait le pied de page ; il passe en haut à gauche (en course, il reste en bas au centre) ;
  - **onglets** : ceux du classement de la fiche (« Personnel » coupé) et ceux de la Communauté (9 onglets, dont deux étirés sur toute la largeur) sont plus petits et passent à la ligne ;
  - **barre du haut** des écrans de liste et de la fiche : elle colle au bord de l'écran (24 px de décor au-dessus) ;
  - **fiche du circuit** : « Comparer avec » ne recouvre plus sa liste ; en anglais, « Pièces » (nombre de pièces du circuit) s'affichait « Coins » (pièces de monnaie), c'est maintenant « Track pieces » ;
  - **options** : la liste « Qualité graphique » recouvrait son titre ;
  - **modes de jeu** : le nom d'un mode et sa description ne forment plus qu'une ligne collée ;
  - **éditeur** : sur un écran bas, la colonne de droite défile au lieu d'être coupée.
  - Test navigateur : sur trois tailles de téléphone, les 12 tuiles de l'accueil sont entières, aucune n'est recouverte.
- **Nettoyage** :
  - un dossier de données importé (34 Mo) et la note qui s'y référait sont retirés, et le dossier est ajouté au `.gitignore` ;
  - les deux erreurs de lint de la 0.9.45 sont corrigées ;
  - nouvel outil `tools/recaler.mjs` pour recaler les médailles après un changement de moteur.

## Bêta 0.9.45 — moteur et gravité calés sur des mesures, circuits recalés, menus refaits

`PHYS_VER` 27 (physique changée). **Redéployer `submit-score`** ; les records, les replays et les défis du jour passés changent (le générateur du défi valide avec le pilote).
- **Moteur** : poussée 19,0 m/s² − 0,080·v sous les gaz, résistance à vide −0,1065·v, gravité 16 m/s² (mesures sur trajectoires relevées ; wall-rides, freinage et marche arrière non mesurés, inchangés). Plus de « collage » à la route (`CAR.launch` 0,6), boosters 10 m/s² pendant 1,2 s, voiture plus maniable (adhérence 80, `frontShare` 0,42).
- **Pilote automatique** : freinage planifié 10 m/s² (au lieu de 20), vitesse maximale respectée sur les murs, volant inversé pris en compte.
- **Circuits** (72) : vitesses du pilote, Verglas, Archipel, Cité Céleste, Cadence, Grand Atelier (obstacles) ; médailles, objectifs, temps de référence, fiche d'essai, corpus de compatibilité régénérés. Contrat : speedway > 220 km/h pendant 35 %, freinage ≤ 14 %, technique ≤ 170 km/h.
- **Académie** : leçons « Obstacles » et « Dérapage » raccourcies (élan d'une case) ; exercices de freinage (seuils 7,0 / 6,5 / 6,05 s) et de mini-turbo recalés.
- **Menus** : accueil en 12 tuiles inclinées avec icônes (logo, deux rangées), onglets, cartes de circuits (CSS).
- **Tests** : bancs de maniabilité (`tools/maniabilite.mjs`, `tools/test-maniabilite.mjs`) ; tests de sauts, de courbe d'accélération, du coach, du défi du jour et de la moto réécrits sur le comportement mesuré. Aucun humain n'a rejoué les circuits avec ce moteur.

## Bêta 0.9.44 — aides à la conduite, accessibilité, ressenti, caméra libre de l'éditeur

Étape E22 de Trackigami Evolution (fin du bloc 6). `PHYS_VER` inchangé (26). **Redéployer `submit-score`** (déjà régénérée ici) : elle connaît la catégorie « assisté ».

- **Aides à la conduite** (Profil › Options) :
  - accélération automatique ;
  - freinage assisté et direction assistée (guidés par la ligne de course : carrière et défi du jour) ;
  - anti-tête-à-queue ;
  - volant adouci.

  Elles agissent sur les **commandes**, avant leur enregistrement : le replay, les fantômes et le serveur rejouent les commandes effectives, et la course se rejoue à l'identique (un test le vérifie au pas près).
- **Catégorie « assisté »** : une course aidée a son propre classement (étiquette `as-1` ajoutée à sa catégorie). Elle se joue sans médailles ni pièces. Elle ne compte ni en saison, ni en duel, ni en tournoi : les aides y sont coupées, et le serveur refuse de toute façon ces combinaisons. La fiche du circuit et le départ le rappellent.
- **Réglage du ressenti** : *Réponse du volant* (manette et pouce : linéaire à très progressive).

  S'ajoute aux réglages existants : sensations de course, tremblements, champ de vision, effet de vitesse, zone morte et sensibilité de la manette.
- **Animations réduites** : nouveau réglage *Réduire les animations* (Système, Oui, Non). Quand il est actif :
  - les transitions des écrans et des fenêtres sont coupées ;
  - les tremblements et les effets de caméra du ressenti sont à zéro.

  Avec *Système*, le jeu suit `prefers-reduced-motion` et ses changements.
- **Transitions** : les écrans et les fenêtres apparaissent en fondu court.
- **Parcours complet au tactile**, testé sur un téléphone en paysage simulé : accueil, carrière, fiche, course aux boutons tactiles, pause, quitter. Ce test a trouvé un vrai défaut, corrigé : le bouton plein écran recouvrait « ▶ Jouer » de la fiche. Il ne s'affiche plus qu'en course et sur l'écran d'accueil.
- **Caméra libre de l'éditeur** (🎥, touche V ; reportée depuis E9) : inclinaison jusqu'au ras du sol, approche jusqu'à 3 m, jamais sous le terrain.
- Sous le capot :
  - `js/aids.js`, `js/a11y.js` ;
  - `tools/test-aids.mjs` ;
  - tests navigateur : aides, animations réduites, caméra libre, parcours tactile ;
  - `PW_ONLY` pour lancer un seul test navigateur pendant la mise au point.
- **Limites** :
  - le réglage final du ressenti (aides, profils, véhicules v2) demande des essais manette en main par un humain ;
  - la **bibliothèque de matériaux** de l'éditeur, reportée depuis E9, n'est **pas faite** : elle reste à concevoir (quels matériaux, effet ou non sur la course, compatibilité du format).

## Bêta 0.9.43 — communauté : commentaires, playlists, sélection, découverte, statistiques, modes publiés

Étape E21 de Trackigami Evolution. `PHYS_VER` inchangé (26), rien ne change dans la course. **Lancer l'étape SQL 13** (`supabase/etape13-communaute.sql`) et **ajouter les modérateurs** à la main (voir le README) ; `submit-score` n'a pas besoin d'être redéployée pour cette étape.

Ce qui existait déjà et reste tel quel : la fiche détaillée (Race Hub), les j'aime, les signalements de circuits (masqués à 3), les abonnements, les tendances de la semaine, la recherche, les favoris. Nouveau :
- **Commentaires** sur la fiche d'un circuit de la communauté :
  - comptes seulement, 280 caractères ;
  - **limitation de débit** en base : un toutes les 20 s, 10 par heure, 40 par jour ;
  - **masqués après 3 signalements** de comptes distincts ;
  - supprimables par leur auteur, l'auteur du circuit ou un modérateur.
- **Playlists** (🎵 sur la fiche, onglet *Playlists*) :
  - listes ordonnées de 50 circuits au plus, publiques ou privées, 20 par pilote ;
  - *Jouer dans l'ordre* : la fiche de chaque circuit indique la position et propose le suivant.
- **Sélection** (onglet 🏅) : les circuits choisis par les modérateurs.
- **Découverte** :
  - 🎲 *Au hasard* : un circuit jamais joué de préférence, sans retomber sur les derniers tirés ;
  - ✨ *Pour toi* : les circuits aimés par les pilotes qui aiment les mêmes circuits que toi, puis ceux des auteurs suivis.
- **Statistiques de circuit** sur la fiche : pilotes, part des parties qui vont au bout, temps médian, temps des 10 % les plus rapides.
  - Elles sont calculées par la base depuis les statistiques anonymes (`run_stats`).
  - Rien n'est affiché sous 5 installations.
  - Les circuits de joueur y entrent désormais, identifiés par leur seule empreinte (avec l'accord déjà demandé pour les statistiques, qui couvrait « chaque circuit »).
  - Le rapport d'équilibrage des médailles reste limité à la carrière et au défi.
- **Modes publiés** (🌐 dans *Mes modes*, liste *Modes publiés*) :
  - les règles d'un mode sont une **catégorie de record** : sur chaque circuit de la carrière, son classement est celui de cette catégorie ;
  - *Jouer (classé)* ouvre la fiche sur cette catégorie ;
  - un mode dont les règles ne correspondent à aucune catégorie ne se publie pas ;
  - 5 publications par jour, 20 par pilote, masqués après 3 signalements.
- **Modération** : table `moderators` ; `pick_track` (Sélection) et `mod_hide` (masquer ou rétablir un circuit, un commentaire, un mode) leur sont réservés.
- Sous le capot :
  - `js/online/community.js` ;
  - `tools/test-communaute2.mjs` (client, correspondance mode ↔ catégorie) ;
  - 29 vérifications SQL de plus (débit, masquage, suppression, RLS, quotas, statistiques sous le seuil) ;
  - test navigateur avec un serveur simulé.

## Bêta 0.9.42 — véhicules v2, profils physiques, laboratoire

Étape E20 de Trackigami Evolution. `PHYS_VER` inchangé (26) : les modèles de toujours restent identiques au bit près (les 186 scénarios de l'empreinte sont identiques), les nouveaux modèles n'entrent en service que par une règle du circuit ou une catégorie de record. **Redéployer `submit-score`** (déjà régénérée ici) : nouvelles règles et catégories.

- **Profils physiques** (règle `pm` du circuit, catégories de record « 🕹️ Profil Arcade » et « 🎛️ Profil Simulation ») :
  - **Arcade** : plus d'adhérence latérale, lacet plus amorti, arrière qui décroche moins, volant qui revient plus vite ;
  - **Classique** : la physique de toujours (par défaut) ;
  - **Simulation** : pneus plus progressifs, moins d'adhérence et d'amortissement, freins plus longs, et les véhicules v2 en service ;
  - **aucun profil ne rend un véhicule plus rapide en ligne droite** : vitesse de pointe, accélération et boost sont les mêmes (un test le vérifie). Ce sont des catégories de classement, jamais des achats.
- **Véhicules v2** (règle `vm`, case *Véhicules v2* de l'éditeur, catégorie « 🧪 Véhicules v2 » sur les circuits qui ont autre chose qu'une voiture) :
  - **moto** : elle penche selon l'accélération latérale, avec un temps de bascule (changer de cap plus vite coûte de l'adhérence) ; au freinage la charge passe sur l'avant, à l'accélération sur l'arrière (à basse vitesse, plein gaz lève l'avant) ; le frein mord moins sur l'angle. La moto penche aussi à l'écran ;
  - **bateau** : houle déterministe (monter une vague freine, la descendre relance, la coque la suit à l'écran) et courant le long de chaque pièce d'eau ;
  - **deltaplane** : ascendances tirées de la graine des conditions, portance qui baisse en altitude, vent et rafales du circuit qui portent l'aile.
- **Laboratoire** (🧪, fiche du circuit, section Records) : les commandes de ton record rejouées à l'identique sous deux réglages au choix :
  - circuit tel quel, Classique v1 ou v2, Arcade, Simulation, adhérence 80 %, pluie ;
  - l'écran affiche les deux résultats, le secteur où les courses se séparent, la courbe de l'écart le long du circuit et le tableau des secteurs (analyse d'E4) ;
  - le circuit n'est jamais modifié.
- Sous le capot :
  - `js/physics/profiles.js`, `js/physics/vehicles/moto2.js`, `boat2.js`, `glider2.js` ;
  - `js/analysis/lab.js`, `js/app/lab.js` ;
  - 7 scénarios `pm:*` et `v2:*` dans l'empreinte ;
  - `tools/test-vehicles2.mjs` ;
  - tests navigateur (réglages de l'éditeur, laboratoire).
- **Limite** : le réglage fin du ressenti des profils et des véhicules v2 demande des essais manette en main ; les valeurs actuelles sont un premier jet mesuré par les tests et le pilote automatique.

## Bêta 0.9.41 — environnements déterministes : pluie et flaques, givre, rafales

Étape E19 de Trackigami Evolution (début du bloc 6). `PHYS_VER` inchangé (26) : les circuits, records et replays existants courent exactement comme avant (les 182 scénarios de l'empreinte de la physique sont identiques). **Redéployer `submit-score`** (déjà régénérée ici) : la vérification connaît les nouvelles règles du circuit et la catégorie « sous la pluie ».

- **Cinq règles de circuit**, dans *Paramètres du niveau* de l'éditeur, absentes par défaut :
  - **Pluie** (0 à 100 %) : la piste glisse un peu partout (jusqu'à 15 % d'adhérence en moins), et beaucoup dans les **flaques** (jusqu'à moitié moins) ;
  - **Givre** (0 à 100 %) : des plaques de verglas (35 % de l'adhérence) ;
  - **Rafales** (0 à 100 %) : des coups de vent, par à-coups, dans la direction du vent du circuit ;
  - **Conditions qui varient** : la pluie forcit et faiblit pendant la course ;
  - **Graine des conditions** (🎲) : elle place les flaques, les plaques et les rafales.
- **Déterministe, au pas près** : tout vient de la graine et du chrono de la course, en entiers et en `dmath`. Même graine, mêmes flaques au même endroit et mêmes rafales au même instant, pour tout le monde, dans les fantômes, les replays et la vérification serveur. Les flaques et les plaques ne vont que sur des lignes droites plates, en route ordinaire, fixes, au sol.
- Ces règles entrent dans la signature du circuit (leur propre classement) et passent son code au format 4. Le Race Hub les affiche.
- **Effets** (purement visuels et sonores) :
  - flaques et plaques de givre posées sur la route ;
  - pluie dont la densité suit l'intensité de la course, avec son bruit continu ;
  - éclaboussure et bruit d'eau dans une flaque, crissement sur le givre, souffle quand une rafale se lève.
- **Catégorie de record « 🌧️ Sous la pluie »** (variante `rn-60`, graine fixe) dans la fiche de chaque circuit classé.
- **Défi du jour** : nouvelle mutation **Averse** (pluie à 60 %). À partir du vendredi 20 novembre 2026, le vendredi alterne averse et brouillard. Les jours d'avant gardent leur mutation et leur classement.
- Sous le capot :
  - `js/sim/env.js` ;
  - la physique ne fait aucune opération de plus sans conditions (`envOf` renvoie `null`) ;
  - 4 scénarios `env:*` dans l'empreinte (identiques sous Node, Deno et Chromium) ;
  - `tools/test-env.mjs` : même graine mêmes flaques, adhérence, variation, rafales jamais à contre-sens, course vérifiée par le serveur et refusée sur le circuit sec ;
  - tests navigateur (réglages de l'éditeur, effets en course).

## Bêta 0.9.40 — prototype de rollback : décision GO (hors interface)

Étape E18 de Trackigami Evolution (fin du bloc 5). `PHYS_VER` inchangé (26), `NET_VER` inchangé (4), rien à redéployer. **Rien ne change pour le joueur** : le prototype n'est branché sur aucun écran, et les collisions douces d'E16 restent celles du jeu.

- **La question** : de vraies collisions déterministes entre 2 à 4 voitures sont-elles possibles ? Le rapport complet est dans [docs/ROLLBACK.md](docs/ROLLBACK.md).
- **Le prototype** (`js/net/rollback.js`) :
  - un monde à plusieurs voitures (la simulation du jeu pour chacune), avec des chocs entre voitures déterministes (+ − × ÷ √ seulement) ;
  - la sauvegarde et la restauration exactes de son état ;
  - un joueur qui prédit les commandes des autres et revient jusqu'à 15 pas en arrière quand la vraie arrive (au-delà, il attend).
- **Mesures**, conteneur à 4 processeurs virtuels, Xeon à 2,1 GHz :
  - coût du pire cas par image (4 voitures, 15 pas rejoués à chaque image), au 95e centile : 3,3 ms sous Node, 2,2 ms dans Chromium (critère : moins de 4 ms) ;
  - **aucune désynchronisation** sur 10 000 pas : 4 joueurs, 0 à 10 pas de retard, 10 % de paquets perdus, 16 717 pas avec contact, environ 13 000 retours en arrière ;
  - le même monde sous Node, Deno et Chromium.
- **Décision : GO** pour le prototype : les deux critères sont tenus.
- **Réserves** :
  - à mesurer sur des appareils modestes (un téléphone peut être 3 à 5 fois plus lent) ;
  - circuits à logique non pris en charge (refusés plutôt que désynchronisés) ;
  - l'intégration reste à faire : transport des commandes, horloges, affichage, arrivées en cours de route, `NET_VER` 5.
- **Corrigé en chemin, dans le banc lui-même** :
  - une commande perdue trois fois de suite laissait un trou que rien ne comblait (les paquets répètent maintenant toute la fenêtre de retour) ;
  - le banc comparait les mondes avant l'arrivée des derniers paquets.
- Tests : `tools/test-rollback.mjs` (déterminisme, 300 retours au hasard au bit près, chocs, réseau simulé, attente, circuit à logique refusé ; aussi sous Deno) ; test navigateur (même monde dans Chromium que sous Node) ; `node tools/bench-rollback.mjs` pour la mesure complète.

## Bêta 0.9.39 — compétition asynchrone : duels classés, tournois privés

Étape E17 de Trackigami Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (4). **Infrastructure à mettre en place** (le jeu dit ce qui manque, sans faux résultat) :
- l'étape SQL 12 (`supabase/etape12-competition.sql`) ;
- **redéployer `submit-score`** (déjà régénérée ici) : elle vérifie en base la fenêtre d'un duel ou d'un tournoi avant d'accepter un temps ;
- facultatif : pg_cron, pour régler duels et tournois à l'heure dite (sinon, à la première consultation).

- **Écran Compétition** (menu principal ; comptes seulement) :
  - **duels entre amis**, sur un circuit de la carrière : on défie, l'autre accepte ou refuse ; 24 h pour courir, son meilleur temps compte ;
  - à l'échéance : plus rapide gagne, un seul temps gagne contre aucun, égalité parfaite = nul, aucun temps = annulé ;
  - **classement Elo** (départ 1200, K = 32), le sien et celui de ses amis ; historique des duels avec les deux temps (celui de l'adversaire seulement à la fin) et l'Elo gagné ou perdu ; face-à-face par adversaire (en base : `head_to_head`) ;
  - **tournois privés** : un nom, un circuit, une durée de 1 à 14 jours, un code à 6 caractères pour entrer ; classement en direct ; **clos automatiquement** à sa date, classement figé.
- **Aucun résultat déclaré par le jeu** : les temps sont des catégories de record (`…~v1.duel-N`, `…~v1.tour-N`), rejouées par le serveur comme toutes les autres. Le serveur les accepte des seuls participants, pendant la compétition (`competition_open`, lu en base). Les résultats, l'Elo et la clôture sont calculés en SQL depuis la table `scores`.
- Sous le capot : étiquettes `duel` et `tour` dans `variants.js`, `verify.js` et `submit-score` (fenêtre lue en base), `js/app/competition.js`, client en ligne. Règlement idempotent (`settle_due`, une seule fois par duel et par tournoi), à la demande du jeu ou par pg_cron.
- Tests :
  - SQL (107 vérifications en tout) : Elo ; duels réservés aux amis et aux comptes ; fenêtre lue par le serveur ; temps de l'autre caché jusqu'à la fin ; règlement à l'échéance, une seule fois ; victoire, nul, annulation ; Elo non modifiable par le jeu ; tournoi par code, invisible des non-inscrits, clos à sa date, classement figé ;
  - fonction serveur (fenêtre ouverte, fermée, étape SQL absente ; refus avant la base) ;
  - navigateur, français et anglais, avec un serveur simulé (accepter, défier, rejoindre, classement, course de duel sous sa clé).

## Bêta 0.9.38 — multijoueur robuste : reconnexion, hôte remplacé, collisions unifiées

Étape E16 de Trackigami Evolution. `PHYS_VER` inchangé (26). **`NET_VER` passe à 4** : un joueur de 0.9.37 et un joueur de 0.9.38 ne peuvent plus être dans la même salle (le salon le dit, comme à chaque changement de protocole). Rien à redéployer. **Infrastructure facultative** : un relais TURN (voir `supabase/MULTI.md`).

- **Une coupure ne fait plus sortir de la salle** (`js/net/resume.js`) :
  - le joueur coupé garde sa salle ouverte et sa course continue ; il retente seul de la rejoindre, avec le même identifiant ;
  - les autres lui gardent sa place 20 s (« ⏳ reconnexion ») : il reste sur la grille, la manche ne se clôt pas sans lui, son arrivée compte ;
  - à son retour, l'hôte lui renvoie l'état complet, arrivées de la manche en cours comprises, et lui renvoie l'arrivée qu'il aurait annoncée pendant la coupure ;
  - un onglet rechargé retrouve sa place s'il revient dans les 20 s.
  Messages : `hello`, `bye` (départ volontaire : la place n'est pas gardée), `hostover`.
- **Hôte remplacé** : la migration d'hôte existait déjà. Le nouvel hôte se **marque** désormais : l'ancien, revenu après coup, ne reprend pas la main avec un état périmé, et le championnat se termine avec le même classement chez tous.
- **Collisions unifiées** : pour les collisions douces, la voiture de l'autre est ramenée au même instant que la sienne (interpolation et demi-latence rattrapées). Avec 160 ms de retard d'affichage, les deux joueurs voyaient le contact à 0,3 s et à 1,4 s d'intervalle ; ils le voient maintenant ensemble, au bon moment.
- **Corrigé** : la fermeture d'une liaison WebRTC écrasait l'état « reconnexion » d'un joueur par « déconnecté ».
- **TURN** : le code est prêt depuis 0.9.21 (fonction `ice`). Sa **mise en service** demande des identifiants TURN (Cloudflare Realtime ou coturn) dans les secrets Supabase : sans eux, 10 à 20 % des paires de joueurs (NAT symétrique) ne se relient pas. Je ne peux pas le faire à ta place.
- Tests :
  - protocole (`tools/test-manche.mjs`) : coupure de 10 s en pleine manche (place gardée, arrivée pendant la coupure comptée à sa place) ; arrivées manquées rattrapées sans remettre la manche à zéro ; coupure de plus de 20 s ; hôte coupé, remplacé, revenu sans reprendre la main, championnat terminé ; mémoire de la place ; collisions unifiées ;
  - navigateur : championnat à **deux onglets** avec une **coupure simulée de 3 s** (vraie liaison WebRTC refaite, manche poursuivie jusqu'au podium).

## Bêta 0.9.37 — social, saisons hebdomadaires, classements par secteur

Étape E15 de Trackigami Evolution (début du bloc 5). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). **Infrastructure à mettre en place** (rien ne marche en ligne sans elle, et le jeu le dit) :
- les étapes SQL 9, 10 et 11 (`supabase/etape9-secteurs.sql`, `etape10-social.sql`, `etape11-saisons.sql`) ;
- **redéployer `submit-score`** (déjà régénérée ici) : temps intermédiaires des records, et catégorie de saison acceptée seulement pendant sa semaine ;
- facultatif : l'extension **pg_cron**, pour une clôture des saisons à l'heure dite (sinon, elles se closent à la première consultation après la fin de la semaine) ;
- facultatif : `tools/backfill-sectors.mjs`, pour les temps intermédiaires des records déjà enregistrés.

- **Classements par secteur** (onglet ⏱ Secteurs de la fiche) : un secteur va d'un passage (checkpoint, ligne d'un tour) au suivant. On voit les meilleurs secteurs parmi les records vérifiés, et le sien à côté. Le serveur range les temps intermédiaires en rejouant la course : ce sont ceux du record, pas le meilleur secteur jamais roulé.
- **Amis** (Profil › Amis, comptes seulement) : demande par pseudo, acceptée ou refusée par l'autre, retrait. Une demande n'est visible que des deux intéressés. Au plus 20 demandes par jour et 200 amis. Onglet 👥 Amis dans les classements : les mêmes temps vérifiés, entre amis.
- **Abonnements** : « ➕ Suivre » sur la fiche d'un circuit de la communauté ; onglet « ⭐ Abonnements » de la communauté (les circuits des auteurs suivis). La liste de ses abonnements est privée, le nombre d'abonnés d'un auteur public.
- **Saisons hebdomadaires** :
  - chaque semaine (du lundi 00:00 UTC au lundi suivant ; la saison 1 commence le 9 novembre 2026), trois circuits de la carrière, les mêmes pour tout le monde, dans un groupe « Saison de la semaine » de l'écran Circuits et en tête des catégories de leur fiche ;
  - les temps de saison sont une catégorie à part (`…~v1.sea-N`), qui n'efface pas le record officiel ;
  - points : sur chaque circuit, 1000 × meilleur temps ÷ ton temps ;
  - **divisions** 1 (Élite) à 5 (Débutant) : à la clôture, les 20 % premiers de chaque division montent, les 20 % derniers descendent, et l'historique est gardé ;
  - aucun point n'est déclaré par le jeu : tout est calculé en base, depuis les temps rejoués par le serveur.
- **Choix à signaler** : les saisons se closent sans pg_cron (`close_due_seasons`, idempotente, appelée par le jeu avant d'afficher une saison) ; pg_cron devient un confort. Les trois circuits sont tirés par le jeu d'après le numéro de la saison (le même code sert au jeu et au serveur), plutôt que rangés dans une table.
- Sous le capot : `js/seasons.js` (dans la fermeture de la vérification), étiquette `sea` dans `variants.js` (elle ne transforme pas le circuit), `verify.js` (fenêtre de la saison, temps intermédiaires), onglets du classement (`ui/leaderboardPanel.js`), client en ligne (`online.js`).
- Tests :
  - SQL (`npm run test:sql`, 82 vérifications) : secteurs ; demandes d'amis invisibles d'un inconnu, refus, retrait, cadence, classement entre amis, abonnements privés ; saisons (points, clôture une seule fois, montées et descentes, ma saison, écritures refusées) ;
  - `tools/test-seasons.mjs` (dates, circuits, fenêtre du serveur, temps intermédiaires, remplissage) et fonction serveur ;
  - navigateur, français et anglais, avec un serveur Supabase **simulé** : saison, secteurs, amis, profil, abonnements.

## Bêta 0.9.36 — progression du pilote : expérience, niveaux, licences, défis de maîtrise

Étape E14 de Trackigami Evolution (fin du bloc 4). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer.

- **Expérience et niveaux** (1 à 50 ; niveau 2 à 100 XP, niveau 10 à 4 500 XP). L'expérience vient **seulement des courses terminées et des objectifs** :
  - première arrivée du jour sur un circuit : 20 XP ; les suivantes : 2 XP ;
  - chaque palier de médaille atteint pour la première fois (bronze 20, argent 40, or 60, cristal 100 ; carrière et défi du jour) ;
  - objectif bonus 30, défi du jour 40, mutation du jour 30, palier de série 50 ;
  - leçon de l'Académie 30 ; note d'exercice 20, 30, 50 ;
  - défi de maîtrise 40.
  Les arrivées répétées sur le même circuit, le même jour, ne rapportent presque rien. Les médailles d'un circuit de joueur ne comptent pas, et un circuit non vérifié n'a pas de bonus de première arrivée : on ne fabrique pas son expérience. L'écran d'arrivée détaille ce que la course a rapporté, avec la barre de niveau.
- **Défis de maîtrise** : quatre par circuit de la carrière (or, cristal, objectif bonus, arrivée sans choc ni réapparition), affichés dans la fiche du circuit.
- **Licences C, B, A et S** : des paliers mesurés sur ce qui a été accompli (niveau, leçons, médailles, compétences de l'Académie, défis de maîtrise). Elles ne verrouillent rien : le profil montre celles obtenues et ce qui manque pour la suivante.
- **Déblocages cosmétiques** : quatre éléments exclusifs du garage, aux niveaux 5, 10, 20 et 30 (lumières et traînées). **Aucun avantage de vitesse**, et c'est vérifié :
  - aucun module de la simulation ni de la vérification serveur n'importe le profil, la progression ou le garage (le test parcourt leurs imports) ;
  - la même course donne le même résultat au bit près avec un profil débutant et un profil niveau 50 tout équipé.
- **Profils existants** : l'expérience de départ est calculée une fois d'après ce qui a déjà été accompli (médailles, objectifs, leçons, exercices, défis, courses). Les défis de maîtrise déjà acquis (or, cristal, objectif) sont déduits ; « sans choc » demande une nouvelle arrivée.
- Sous le capot : `js/progression.js` (barème, niveaux, maîtrise, licences, expérience de départ, fusion) ; profil `xp`, `licences`, `mastery` (fusion cloud : maximum, union avec la date la plus ancienne, OU bit à bit).
- Tests : `tools/test-progression.mjs` (niveaux, barème, arrivées répétées, médailles, maîtrise, origine de l'expérience, expérience de départ, licences, fusion, récompenses, absence d'avantage) ; test navigateur (expérience à l'arrivée, maîtrise dans la fiche, profil) et anglais.

## Bêta 0.9.35 — Défi du jour 2 : mutation du jour, séries, récompenses

Étape E13 de Trackigami Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des mutations « verglas » et « vent » (catégories `gp` et `wd`, nouvelles). Le défi du jour et toutes les autres catégories sont vérifiés comme avant.

- **Mutation du jour** : chaque défi du jour a sa mutation, la même pour tout le monde, proposée en tête des catégories de record de sa fiche, avec son propre classement. Une par jour de la semaine (UTC) :
  - lundi : verglas (adhérence à 60 %) ;
  - mardi : vent de travers (25 %, direction tirée de la date) ;
  - mercredi : moto imposée ;
  - jeudi : gravité légère (70 %) ;
  - vendredi : verglas dans le brouillard (adhérence à 80 %, brouillard épais, purement visuel) ;
  - samedi : moto sur la Lune (moto et gravité à 70 %) ;
  - dimanche : gravité lourde (130 %).
  Une mutation n'est retenue que si le pilote automatique finit le défi muté ; sinon, la suivante dans la semaine. Aucune ne rend une voiture plus rapide : elles changent la piste pour tout le monde.
- **Le défi lui-même ne change pas** : la mutation est une catégorie (une variante d'E3 : `daily-AAAA-MM-JJ~v1.gp-60`…), pas un autre circuit. Les défis passés, ceux de l'empreinte de la physique et leurs records restent identiques au bit près. Le document d'architecture prévoyait des mutateurs datés dans le défi : l'empreinte fige justement des défis de décembre 2026, et une catégorie fait le même travail sans rien casser.
- **Séries** : nombre de jours consécutifs avec un défi du jour terminé (le défi, sa mutation ou une autre catégorie), calculé depuis les jours déjà enregistrés (`dailyDays`) ; la série est encore vivante tant que le défi d'hier est fait. Elle s'affiche sur la carte du défi, dans sa fiche (meilleure série, prochain palier) et à l'arrivée.
- **Récompenses** :
  - paliers de série : 3, 7, 14 et 30 jours (30, 70, 140 et 300 ◆), une seule fois chacun, quand la meilleure série les atteint ;
  - mutation du jour : +30 ◆ à la première arrivée, chaque jour ;
  - deux exclusifs du garage : la traînée givrée (une série de 7 jours) et la lumière toxique (10 mutations terminées).
- Sous le capot : `js/mutations.js` (mutations, `dailyMutation`, `streakOf`), règles `grip` et `wind` dans `rulesCore.js` (absentes tant qu'elles ne changent rien : les règles, modes et salons d'avant gardent exactement leur forme), catégories `gp` et `wd` dans `variants.js`, profil `mutDays` et `dailyBest` (fusion cloud : union, maximum).
- **Limite assumée** : pas de « sens inversé » ni de miroir pour l'instant. Il faudrait transformer géométriquement chaque type de pièce (virages, bifurcations, pièces dissymétriques), avec une empreinte dédiée : c'est un chantier à part.
- Tests : `tools/test-defi.mjs` (défi inchangé, deux semaines de mutations, vérification serveur d'une mutation, règles, fiche, séries, paliers, exclusifs, fusion) ; test navigateur (série et mutation dans la fiche, course de la mutation, bonus, série) et anglais.

## Bêta 0.9.34 — Académie 2 : compétences et exercices évalués

Étape E12 de Trackigami Evolution (début du bloc 4). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer (rien ne touche à la course ni au serveur).

- **Exercices évalués** (Académie, sous les six leçons) : quatre **compétences** (trajectoire, freinage, dérapage, sauts et réceptions), un exercice chacune, noté **bronze, argent ou or**. Le niveau d'une compétence est la meilleure note de ses exercices.
  - **Chicanes** (trajectoire) : la vitesse moyenne dans deux séries de quatre virages serrés (100, 114, 124 km/h).
  - **Freiner tard** (freinage) : le temps passé dans les deux zones de freinage, de l'approche à la sortie du virage (6,26, 5,87, 5,62 s).
  - **Mini-turbo renforcé** (dérapage) : un mini-turbo, puis un renforcé, puis un renforcé sans choc avec une arrivée en 11,5 s ou moins.
  - **Trois réceptions** (sauts) : une, deux ou trois réceptions parfaites.
- **Mesuré par l'analyse** : à l'arrivée, la course est rejouée à partir de ses commandes et mesurée (`js/analysis/drill.js`), exactement comme dans les tests. Les seuils sont calés sur le pilote automatique : à 60 % de son adhérence, bronze ; à 80 %, argent ; à 100 %, or. Chaque note est démontrée par une course scriptée dans `tools/test-skills.mjs` (pilote automatique à plusieurs niveaux, geste de dérapage, frein tenu en l'air), pas seulement par un humain.
- **Conseils adaptés** :
  - le menu de l'Académie désigne le **point faible** (la compétence la plus basse) et son exercice ;
  - le bilan d'un exercice donne la mesure, les trois objectifs et un conseil : celui du coach face au pilote de référence dans la zone mesurée, ou ce que le geste a manqué (« Mini-turbo simple : la glisse s'est arrêtée trop tôt… ») ;
  - à l'arrivée d'une course, quand un conseil du coach désigne un geste (freinage, trajectoire, saut), un bouton « 🎓 S'entraîner » mène à l'exercice correspondant.
- **Les six leçons** restent jouables et comptées comme avant (diplôme, titre, exclusif). Pièces : 10, 15 et 25 ◆ la première fois qu'une note est atteinte, une seule fois par note.
- Sous le capot : `js/skills.js` (compétences, exercices, notes, profil `drills` : `{ id: { lvl, best } }`), `js/analysis/drill.js` (mesure et conseil), fusion cloud `mergeDrills` (meilleur niveau, meilleure mesure dans le bon sens). Le document d'architecture parlait d'un champ `skills` par compétence : il est rangé par exercice, le niveau de compétence s'en déduit.
- **Limite assumée** : un exercice par compétence pour l'instant. Le dérapage se juge sur un seul virage, car aucun geste scripté fiable n'enchaîne plusieurs mini-turbos (la leçon « en série » de 0.9.15 non plus) : une note qui ne serait démontrée par aucune course n'aurait pas sa place.
- Tests : `tools/test-skills.mjs` (exercices, notes démontrées, conseils, profil, fusion) ; test navigateur (menu, consignes, course mesurée notée or, conseil adapté à l'arrivée) et anglais (consignes, bilans).

## Bêta 0.9.33 — logique du circuit : des règles « quand… si… alors… »

Étapes E10 et E11 de Trackigami Evolution (fin du bloc 3). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des **seuls** circuits qui ont une logique (comme pour l'adhérence et le vent de 0.9.31) ; tous les autres sont vérifiés comme avant.

- **Logique du circuit** (éditeur, bouton ⚙ ou **F6**) : des règles **ÉVÉNEMENT → CONDITIONS → ACTIONS** qui agissent sur les groupes d'E9.
  - Événements : le départ, le passage d'un checkpoint (le n-ième, ou chacun), le début d'un tour, un temps de course, la voiture qui entre sur un groupe, la voiture qui change de véhicule.
  - Conditions (toutes vraies) : checkpoints passés, tour, compteurs, véhicule, groupe visible ou caché.
  - Actions : **montrer, cacher, basculer un groupe** (une pièce cachée n'est plus dessinée et n'a plus de collision, ses obstacles non plus ; un checkpoint ou une arrivée cachés ne comptent pas), régler la **gravité**, changer un **compteur** (jusqu'à 4), jouer un **effet** visuel ou sonore (les mêmes que les déclencheurs de cases, sans effet sur la course).
  - « Une seule fois par essai », groupes **cachés au départ**. Bornes : 32 règles, 8 conditions et 8 actions par règle.
- **Jouée dans la simulation**, donc identique en course, dans les fantômes, les replays et la **vérification serveur**. Un retour au checkpoint revient à l'état de ce checkpoint : une porte ouverte en le passant reste ouverte. La logique (et l'appartenance aux groupes qu'elle touche) entre dans la signature du circuit : à revérifier après chaque changement.
- **L'éditeur de logique** : la liste des règles, chacune **lue en une phrase** (« Quand le checkpoint n° 1 est passé, si compteur 1 ≥ 2 : montrer « Porte », gravité à 60 %. (une fois) »), à monter, descendre, modifier ou supprimer ; un éditeur de règle par menus (la phrase se met à jour en direct) ; des **vérifications sans rouler** (une arrivée cachée que rien ne montre : erreur ; groupe vide, checkpoint ou tour qui n'arrivera jamais, compteur absent : avertissements). Pendant un essai depuis l'éditeur (T), chaque règle déclenchée s'affiche.
- **Conversion** des déclencheurs de cases (lot 12) : chaque case devient un groupe, ses effets une règle « quand la voiture entre sur ce groupe ». Les déclencheurs de cases restent lus comme avant tant qu'on ne convertit pas.
- **Additif, et c'est vérifié** : un circuit sans logique roule exactement comme avant (sans logique, l'ensemble exclu de la physique est celui du verre brisé lui-même) ; les **177 scénarios** de l'empreinte sont identiques, **5 nouveaux** (porte, zones, obstacles cachés) s'y ajoutent, identiques sous Node, Deno et Chromium.
- Sous le capot : `js/sim/logic.js` (dans la fermeture de la vérification : ni horloge, ni hasard, ni trigonométrie), champ `lg` du circuit (format 4), `CarPhysics.excl`, état de la logique dans l'instantané d'un checkpoint (`RaceLogic`, champ `ext`), `RaceSession._logicSync` (groupes montrés ou cachés sans reconstruire la piste, effets) ; `js/logicText.js` (phrases, vérifications, conversion ; une table de phrases par langue) et `js/editor/logicUi.js`.
- **Limites assumées** : pas encore d'actions sur les pièces mobiles ni sur les revêtements (elles demandent d'autres états dans la simulation) ; pas d'éditeur visuel en nœuds : des règles en phrases, plus simples à lire.
- Tests : `tools/test-logique.mjs` (format, signature, porte fermée puis ouverte, retour au checkpoint, compteurs, zones, une seule fois, effets sans effet, vérification serveur, fantômes, phrases en français et en anglais, vérifications, conversion ; aussi sous Deno), empreinte (182 scénarios), test navigateur (une porte qui s'ouvre au checkpoint, construite dans l'éditeur, essayée, puis vérifiée) et anglais.

## Bêta 0.9.32 — groupes et calques dans l'éditeur, aperçu 3D des pièces perso

Étape E9 de Trackigami Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer (les groupes n'ont aucun effet sur la course : ils n'entrent pas dans la signature ; la logique du circuit, E10, s'en servira).

- **Groupes et calques** (éditeur, bouton ▦ ou **F4**) : ranger des pièces et des décorations dans des **groupes** numérotés (1 à 63) et **nommés**, puis, pendant l'édition, **masquer** un calque (ni dessiné ni visable) ou le **verrouiller** (visible mais ni sélectionnable ni modifiable) ; sélectionner tout un groupe ; sortir la sélection de son groupe. Les groupes et leurs noms voyagent dans le code du circuit (format 4) ; masquer et verrouiller restent des états de l'éditeur. Tout s'annule comme le reste.
- **Vue par niveau** (◐, Z) : la sélection (copier, couper, supprimer, monter, descendre) ne prend plus que les pièces du niveau affiché.
- **Atelier « Mes pièces »** : un **aperçu 3D** de la pièce en plus des vues de face et de dessus, construit exactement comme sur la piste ; il tourne seul, glisser pour le tourner soi-même.
- **Corrigé** : annuler une action dans l'éditeur effaçait toutes les **pièces perso** posées (leurs formes n'étaient pas gardées par l'historique, depuis 0.9.24).
- Sous le capot : champ `g` des pièces (table `TILE_FIELDS`) et des décorations, noms dans `gn` ; `TrackView` dessine chaque groupe dans son propre maillage et sait le montrer ou le cacher sans tout reconstruire (`setGroupVisible`), ce dont la logique du circuit aura besoin en course ; filtres de visée et de sélection (`js/editor/groups.js`, `js/editor/preview3d.js`).
- **Reportés** (ils étaient dans le plan d'E9) : la bibliothèque de matériaux (couleurs nommées réutilisables) et une caméra libre dédiée dans l'éditeur ; ils iront avec les finitions (E22).
- Tests : `tools/test-groups.mjs` (bornes, noms, code, signature inchangée, annulation avec pièces perso, filtre de copie) ; test navigateur (panneau, masquer, verrouiller, nommer, code, annuler, aperçu 3D) et anglais.

## Bêta 0.9.31 — adhérence et vent sur tout le circuit (paramètres de simulation)

Étape E8 de Trackigami Evolution (début du bloc 3). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des **seuls** circuits qui utilisent ces réglages ; tous les autres sont vérifiés comme avant.

- **Éditeur › Paramètres du niveau** : **Adhérence de la piste** (25 à 150 %, en plus de celle des revêtements) et **Vent** (0 à 100 %, huit directions ; le nord est en haut de l'éditeur), sur le sol comme sur les loopings, murs et tubes. Ils changent la course : ils entrent dans la signature du circuit (donc dans sa clé de classement) et le code passe au format 4. La fiche du circuit les affiche.
- **Additifs, et c'est vérifié** : à leur valeur par défaut, rien ne change, ni la course (la physique ne fait même pas l'opération), ni la signature, ni le code. Les **173 scénarios** de l'empreinte de la physique sont identiques ; **4 scénarios nouveaux** (adhérence 70 % et 140 %, vent sur la route et dans les loopings) s'y ajoutent, identiques sous Node, Deno et Chromium.
- Sous le capot : trois lignes de la table `RULES` de `js/track.js` (`grip`, `wind`, `windDir` : constructeur, copie, signature, code, historique de l'éditeur s'en déduisent), `js/sim/params.js` (`paramsOf`, mathématiques déterministes). Le document d'architecture parlait d'un champ `sp` séparé : la table existante fait le même travail sans rien ajouter au format. Le vent garde la direction choisie même sans vent : l'éditeur la remet à zéro pour ne pas toucher à la signature.
- **Limites assumées** : le vent ne souffle que sur la route (pas en vol : le deltaplane n'y est pas sensible) et il est constant (les rafales et la météo qui change en course viendront avec les environnements, E19).
- Tests : `tools/test-sim-params.mjs` (défauts sans effet, bornes, signature, code, course plus lente, poussée du vent dans sa direction, vérification serveur d'un circuit à paramètres), empreinte (177 scénarios), test navigateur (réglages de l'éditeur, signature).

## Bêta 0.9.30 — le coach

Étape E7 de Trackigami Evolution (dernière du bloc 2). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer.

- **Conseils à l'arrivée** : jusqu'à trois conseils, chacun **à un endroit** (un secteur) et **chiffré**, face à une référence plus rapide (ton record, sinon le fantôme or) :
  - retour au checkpoint (le temps qu'il a coûté), chocs contre le mur ;
  - freinage **trop tardif** (« tu freines 45 m plus tard que la référence et tu en ressors à 59 km/h au lieu de 91 ») ou **trop tôt** ;
  - **vitesse mini** trop basse dans un virage, **temps en l'air** de trop, **trajectoire** plus large que la référence ;
  - sinon, le secteur où le temps se perd, avec les vitesses maxi.
  Rien n'est conseillé là où aucun temps n'a été perdu : une course identique à la référence n'a aucun conseil. Calculé après l'affichage de l'écran (deux courses rejouées), jamais pendant la course. Bouton « 🎬 Voir ces passages dans le Replay Theater ».
- **Dans le Replay Theater** : face à la première course comparée, les conseils sont marqués sur la barre de temps (repères bleus) et listés dans le panneau d'analyse ; ▶ amène trois secondes avant le passage.
- `js/analysis/coach.js` (pur) ; un freinage est montré là où il a lieu (la cause), même si le temps se perd un peu plus loin.
- **Limites assumées** : les règles sont des seuils simples (8 m pour un freinage, 3 m/s de vitesse mini, 0,3 s en l'air, 3 m de trajectoire), pas un apprentissage ; les conseils de freinage demandent les commandes des deux courses (pas face à un fantôme en ligne) ; le pilote automatique freine peu (il lève le pied) : la règle du freinage tardif est testée sur des courses synthétiques, les autres sur de vraies courses modifiées.
- Tests : `tools/test-coach.mjs` (course identique : aucun conseil ; freinage avancé, retour au checkpoint et virages prudents sur de vraies courses ; freinage tardif sur des traces synthétiques ; traduction anglaise de chaque conseil) ; test navigateur (conseils à l'arrivée, repères et conseils cliquables dans le Theater).

## Bêta 0.9.29 — Replay Theater

Étape E6 de Trackigami Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer.

- **Le replay devient une salle d'analyse.** « 🎬 Revoir la course » (arrivée) et « 🎬 Regarder mon record » (fiche du circuit) ouvrent le Theater :
  - **barre de temps** : on va et vient dans la course (en arrière comme en avant), avec les **secteurs**, les **retours au checkpoint** et les **chocs** marqués dessus ; lecture, pause, ×0,25 à ×4, comme avant au clavier (Espace, ← →, C, Entrée, Échap) ;
  - **comparaison** : jusqu'à trois courses sur la piste en même temps que celle regardée, chacune de sa couleur, avec son temps et son écart. À l'arrivée : la course contre le record (ou l'ancien record, si elle en est un nouveau). Depuis la fiche : « Comparer avec » le fantôme or, le record mondial ou les rivaux choisis ;
  - **caméras** : en plus des caméras de course, de la TV et de l'orbite, **Libre** (glisser pour tourner autour de la voiture, molette pour s'approcher) et **Cinématique** (poursuite basse, travelling, grue, poste fixe qui s'enchaînent) ;
  - **📈 Analyse** : les trajectoires de toutes les courses sur la carte du circuit (avec les voitures en direct), la vitesse de chacune et l'écart avec la course regardée le long du parcours, et le tableau des 12 secteurs (meilleur temps en violet).
- **Exact** : revenir en arrière recommence la course et la rejoue sans image ni son jusqu'au pas voulu ; on retombe sur exactement la même voiture qu'en lecture continue (vérifié dans le test navigateur, retour au checkpoint compris) ; aller au bout d'une course d'une minute prend quelques dizaines de millisecondes.
- **Construit sur le mode replay de la course** (même rendu, mêmes caméras, même export vidéo WebM) plutôt que sur une nouvelle session comme le prévoyait le document d'architecture : rien n'est dupliqué, et tout ce qui marchait dans le replay marche dans le Theater.
- **Limites assumées** : les caméras suivent la course regardée (pas une course comparée) ; un fantôme en ligne n'a que des positions (pas de courbes de commandes) ; avant un retour au checkpoint, le panneau d'analyse ne montre que la course finale (la partie effacée par le retour n'a pas de secteurs) ; le nombre d'images par seconde avec quatre courses n'a pas été mesuré sur une vraie carte graphique (le test navigateur tourne en rendu logiciel) : seul le coût de l'interface du Theater l'est.
- Tests : test navigateur (record comparé au fantôme or, déplacement dans le temps exact, temps final identique, repères, secteurs, caméras, retour à la fiche, « Revoir la course » avec l'ancien record) et anglais.

## Bêta 0.9.28 — HUD d'entraînement et profils de HUD

Étapes E4 et E5 de Trackigami Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), rien à redéployer. **Rien ne change pour qui garde le profil Classique** (le profil par défaut).

- **Profils de HUD** (Options › Personnalisation › Profil du HUD) : *Classique* (tout, comme avant), *Compétitif* (sans aide des touches, médailles ni nom du circuit), *Entraînement* (les outils ci-dessous), *Minimaliste* (chrono et vitesse). Un profil cache ses éléments **en plus** de ceux que tu as cachés toi-même.
- **HUD d'entraînement** : à gauche de l'écran, l'**écart en direct** avec une course de référence (au passage d'un checkpoint, c'est l'écart officiel à 1/30 s près : testé), les **mini-secteurs** (12, temps et écart), la **vitesse maxi**, les **forces g**, et trois secondes de **courbes** gaz / frein / vitesse. Sur la piste : la **ligne de la référence** (verte quand elle accélère, rouge quand elle freine, blanche en roue libre) et des **repères à ses points de freinage**. Chaque outil se coupe à part.
  - **Référence** au choix : mon record (ses commandes rejouées : la course exacte), le fantôme or (le pilote automatique, circuits intégrés) ou le record mondial (positions du n° 1 en ligne). Si elle manque, on prend la suivante et on l'écrit (« à défaut »). Un nouveau record devient la référence à l'essai suivant.
  - Puce **🎯 HUD d'entraînement** dans la fiche du circuit pour l'activer d'un geste.
  - Coût mesuré dans le test navigateur : **moins de 0,3 ms par image** (le texte se met à jour 10 fois par seconde, le suivi à chaque image). La ligne et les repères ne lisent que la course : rien ne touche à la physique ni au chrono.
- **Noyau d'analyse** (`js/analysis/`, pur, testé sous Node) : `trace.js` rejoue une course avec le GhostRunner du jeu et note tout ce qu'il faut (ses positions sont celles du fantôme enregistré, au bit près) ; `reference.js` (ligne de course, projection) ; `sectors.js` (mini-secteurs dont la somme est le temps de la course, écarts, freinages) ; `live.js` (le suivi en direct) ; `events.js`. Il servira au Replay Theater et au coach.
- **Limites assumées** : la ligne de la référence est un trait fin (pas un ruban) ; sur un circuit de l'éditeur, la « distance » est mesurée le long de la course de référence (il n'y a pas de ligne centrale continue) ; le record mondial comme référence ne donne ni courbes de commandes ni repères de freinage (le serveur ne publie que les positions).
- Tests : `tools/test-analyse.mjs` (trace au bit près sur le corpus, secteurs, deux styles de pilotage, les 72 circuits, écart en direct contre l'écart officiel sur trois circuits, recalage après un retour, coût), `tools/test-interface.mjs` (profils), test navigateur (HUD d'entraînement, coût par image, Classique inchangé) et anglais.

## Bêta 0.9.27 — catégories de records : départ en moto, en bateau, en deltaplane, sans obstacles

Étape E3 de Trackigami Evolution. `PHYS_VER` inchangé (26), `NET_VER` inchangé (3), **aucune étape SQL** : une catégorie voyage dans la clé de classement (`<clé officielle>~v1.veh-moto`, 80 caractères au plus comme avant). **À redéployer : la fonction `submit-score`** (`npm run build:function`, déjà régénérée ici) : sans elle, le serveur refuse les temps des catégories (« Clé de circuit invalide »), le reste marche.

- **Fiche du circuit › Catégorie de record** : *Officiel*, *Départ en moto*, *en bateau*, *en deltaplane* (ou *en voiture* sur un circuit qui part autrement) et *Sans obstacles* (circuits à obstacles). Seules les catégories qui changent vraiment la course sont proposées. Chacune a **son classement mondial, son record et ses dernières courses** ; le record officiel n'est jamais touché. Pas de médailles ni de pièces dans une catégorie (elles sont calibrées sur le circuit officiel). Après la course, « Retour » ramène à la fiche dans la même catégorie.
- **Vérifié par le serveur** comme le reste : `js/variants.js` (dans la fermeture de la vérification) lit la catégorie, `js/rulesCore.js` (les règles des modes, sorties de `rules.js` sans changer son interface) l'applique à une copie du circuit, puis la course est rejouée. Une écriture non canonique (noms dans le désordre, valeur hors liste, doublon) ou une catégorie sans effet sur ce circuit est refusée : deux écritures d'une même catégorie ne feront jamais deux classements.
- Autres catégories prêtes côté serveur pour la suite (modes publiés, défi du jour) : gravité de départ (40, 70, 130, 180 %), vitesse de départ, hors-piste, nombre de tours ; elles ne sont pas proposées dans la fiche.
- Circuit de joueur : c'est le code du circuit **d'origine** qui part au serveur (il applique la catégorie lui-même), depuis l'arrivée comme depuis le classement.
- Tests : `tools/test-variants.mjs` (grammaire, refus, copie, clés des 72 circuits, vérification d'une vraie course en moto acceptée dans sa catégorie et refusée au classement officiel, fonction serveur avec Supabase simulé), `tools/test-hub.mjs` (descripteur et catégories proposées) ; test navigateur (choix « Départ en moto », la course part en moto, sans médailles, retour dans la catégorie).

## Bêta 0.9.26 — la fiche du circuit (Race Hub), la course rapide, et un filet de compatibilité

Première livraison de **Trackigami Evolution** (étapes E0 à E2 du plan d'architecture). `PHYS_VER` inchangé (26), `NET_VER` inchangé (3). Le Race Hub lit les tables existantes (classement, fantômes de l'étape 7, titres de l'étape 8) : aucune étape SQL nouvelle. Aucun record, code ou replay ne change.

**À redéployer : la fonction `submit-score`.** Son paquet (`supabase/functions/submit-score/index.ts`) n'avait pas été régénéré depuis 0.9.15 : il ignorait la décoration « pièce perso » (0.9.24), donc la signature d'un circuit qui en contient différait côté serveur et **ses records en ligne étaient refusés** (« Le code du circuit ne correspond pas »). Le paquet est régénéré ici (`npm run build:function`) ; la CI le vérifie (`git diff --exit-code`).

- **Fiche du circuit (Race Hub)** : choisir un circuit, d'où qu'on vienne (carte de la carrière, défi du jour, carte de Mes circuits ou de la communauté, favoris), ouvre sa fiche au lieu de lancer la course. On y trouve :
  - une **grande carte** vue de dessus, **zoomable** (molette, pincement, glisser, double clic, touches + − 0 et flèches) : départ, arrivée, checkpoints (numérotés quand l'ordre est connu, c'est-à-dire sur les circuits intégrés ; sinon « dans l'ordre de ton choix »), zones (accélérateurs, verglas, eau, plaques…), pièces mobiles et obstacles, avec sa légende ;
  - difficulté, **distance** (de course pour les circuits intégrés ; longueur de piste posée, estimée, pour les autres), tours, pièces, profil, médailles et **objectif bonus** ;
  - le **classement** à onglets : **Mondial** (les 10 premiers vérifiés par le serveur, **véhicule à l'arrivée** tiré du fantôme enregistré, date, ta place, « Envoyer mon record ») et **Personnel** (record, temps intermédiaires, **tes 10 dernières courses**). Un onglet n'apparaît que si ses données existent (« Amis » et « Saison » viendront avec leurs étapes SQL) ; hors ligne, l'onglet Mondial le dit et le reste marche ;
  - le **lancement** : record, fantômes (mon record, or, importé : les mêmes réglages qu'Options), jusqu'à **3 rivaux en ligne** choisis avec 👻 dans le classement, et **▶ Jouer** (Entrée ; toujours visible en bas sur téléphone) ;
  - **🎬 Regarder mon record** (le replay exact, retour à la fiche ensuite) et **★ Favori**.
  La fiche s'affiche tout de suite (moins de 100 ms, mesuré dans le test navigateur) : seul le classement mondial attend le réseau, dans son panneau. Après une course lancée depuis la fiche, « Retour » y ramène ; l'écran d'arrivée a un bouton **🗺 Fiche du circuit**. La fenêtre « 🏆 » des cartes utilise le même classement.
- **Course rapide** (menu) : un clic lance le prochain circuit de la carrière sans médaille (dans un chapitre ouvert) ; toute la carrière médaillée : le défi du jour.
- **Favoris** : groupe « ★ Favoris » en tête de l'écran Circuits (circuits intégrés, de Mes circuits et de la communauté, relus sur le serveur à l'ouverture). Rangés dans le profil, donc **synchronisés avec le compte** (fusion avec pierres tombales : un favori retiré ne revient pas).
- **Dernières courses** : chaque arrivée classable est notée (`runs.<clé>` : temps et date, 10 par circuit, sans fantôme), synchronisée avec le compte ; « Effacer les records » les efface aussi.
- **Sous le capot** : `js/trackDescriptor.js` décrit un circuit quelle que soit sa source ; **toutes les entrées passent par lui**, avec des options de lancement identiques à celles d'avant (test sur les 72 circuits). `js/ui/trackMap.js` est le noyau unique de la carte et des miniatures (les 80 miniatures comparées dans Chromium avant/après sont identiques au pixel près). `js/ui/leaderboardPanel.js` : classement à fournisseurs. `online.trackById` (favoris de la communauté).
- **Filet de compatibilité** (`tools/compat/corpus.json`, `tools/test-compat.mjs`) : les clés de classement des 72 circuits, des défis du jour passés, des codes de circuit de tous les formats (SHW1, SHW2, SHW3 v3 et v4), les codes de partage (SHG1, SHC1, SHD1, SHM1, SHX1, SHP1), 5 courses enregistrées avec leur temps exact (retour au checkpoint, bateau, défi du jour, circuit exporté en code joueur), d'anciens réglages et la fusion des sauvegardes sont figés et relus à chaque `npm test`.
- **Limites assumées** : les records en ligne se **regardent en course** (rivaux 👻 : leurs positions, pas leurs commandes) ; les regarder seuls, sous plusieurs caméras, viendra avec le Replay Theater. La distance d'un circuit de joueur est la somme des pièces posées (un raccourci compte aussi). Le choix de la catégorie de record (véhicule, aides) n'est pas encore là : il arrive avec les variantes de records.
- Tests : `tools/test-hub.mjs` (descripteur, carte, course rapide, véhicule à l'arrivée, dernières courses, favoris), `tools/test-compat.mjs` ; test navigateur (fiche complète, favori, replay du record et retour, course rapide, fiche d'un circuit de la communauté) ; test navigateur anglais (fiche traduite).

## Bêta 0.9.25 — règles de partie, modes de jeu à toi et paquets de personnalisation

`PHYS_VER` inchangé (26) ; **`NET_VER` passe à 3** (nouveau message « rules » du salon : tout le monde doit recharger la page pour jouer ensemble). Rien à redéployer côté serveur. **Aucune voiture ne change de performances** et aucune physique nouvelle : une règle n'est qu'un réglage que les circuits savent déjà porter (gravité, véhicule et vitesse de départ, hors-piste, tours) ou le retrait des obstacles.

- **Règles de la partie** (salon multijoueur, l'hôte) : gravité de départ, véhicule de départ, vitesse de départ, hors-piste, nombre de tours (circuits fermés), **sans obstacles**, **voitures identiques** (même apparence pour tous, la tienne comprise). Envoyées à tous (et à chaque arrivant), **revalidées à la réception**, appliquées au circuit de chacun ; un invité ne peut pas en imposer. `js/rules.js`.
- **Modes de jeu** (nouveau bouton **Modes** du menu) : un mode = des règles + un **objectif** (les objectifs bonus de la carrière : sans muret, sans réapparition, N réceptions parfaites, N mini-turbos, N anneaux, finir en moto/bateau/deltaplane, finir sous un temps) + un nom. Six modes fournis (*Sauts lunaires*, *Pieds de plomb*, *Route libre*, *Tout en moto*, *Départ lancé*, *Marathon*), création et modification des siens (20), jeu sur le circuit de son choix (intégré ou à soi), bilan « réussi / raté », **code `SHM1:`** à partager. Pas de records, pas de classement (le circuit transformé n'est plus celui des classements) et **pas de pièces à gagner** : sinon un mode « 1 000 pièces pour rien » casserait l'économie.
- **Paquets (mods)** (Modes › Paquets) : un code **`SHX1:`** regroupe ma voiture, mon interface, mes caméras, mes pièces décoratives et mes modes. **Rien d'exécutable** : chaque morceau repasse par le valideur de son module (champ inconnu ignoré, valeur bornée, 30 000 caractères au plus), l'import se fait élément par élément (cases à cocher) et **les éléments payants du catalogue ne sont pas offerts** (remplacés par l'élément d'origine). `js/mods.js`.
- **Corrigé au passage** : `Object.hasOwn` pour les noms de thème, de police, de compteur et d'objectif (un thème « __proto__ » aurait fait planter l'application de l'interface) ; la copie d'un circuit intégré par une règle garde sa ligne centrale (classement en direct) et la refait pour un autre nombre de tours.
- **Limites assumées** : les modes se partagent par code, pas par un serveur (aucune publication en ligne) ; les règles ne couvrent pas la gravité en cours de course (ce serait de la physique) ; « voitures identiques » ne change que l'apparence ; la personnalisation de la voiture n'est toujours pas envoyée aux autres joueurs.
- Tests : `tools/test-modes.mjs`, `tools/test-manche.mjs` (règles du salon), `tools/test-interface.mjs` (noms hérités) ; test navigateur (modes, bilan, paquet exporté puis réimporté, règle appliquée chez les deux joueurs d'un championnat).

## Bêta 0.9.24 — des décors réglables, tes propres pièces, des effets sur le circuit

`PHYS_VER` inchangé (26) ; rien à redéployer. **Rien ici ne touche à la conduite** : tout est visuel ou sonore, hors signature (changer un décor, une pièce ou un déclencheur ne fait perdre ni la vérification ni les records).

- **Ambiance avancée** (Paramètres du niveau, éditeur) : **météo** (pluie, neige, braises, poussière, pétales), **direction du soleil** (azimut, la hauteur est gardée), **teinte du ciel**, **teinte du sol**, **couleur de la brume**, et **heure qui défile** (aube → plein jour → coucher → nuit, en 2 min ou 50 s, 5 mises à jour par seconde). La météo est un nuage de points qui suit la caméra (`js/weather.js`), coupée aux profils les plus légers. Les anciens codes (trois champs) restent identiques.
- **Mes pièces** (onglet Prefabs de l'éditeur) : un atelier de **pièces décoratives** — jusqu'à 12 formes (bloc, sphère, cylindre, cône, cale, anneau) avec position, taille, rotation, couleur et **lumineuse** — vues de face et de dessus, bibliothèque locale (30), **code `SHD1:`** à partager. Une pièce se pose comme n'importe quelle décoration (taille, rotation, couleur) et **ses formes voyagent dans le code du circuit** (jusqu'à 10 par circuit) : celui qui l'ouvre la voit. Nouvelle décoration `custom` ajoutée à la fin de l'ordre existant.
- **Déclencheurs de circuit** (Paramètres du niveau › Déclencheurs…) : jusqu'à 16 effets posés sur des cases, joués une fois par essai quand la voiture passe : **message**, **moment de la journée**, **météo**, **brume**, **musique**, **éclat de couleur**, **secousse**, **son**. Le départ d'un nouvel essai remet décor et musique. **Volontairement aucun effet sur la conduite** (gravité, obstacles, vitesse) : ce serait de la physique, donc une autre version pour tout le monde.
- `js/ambiance.js` (étendu), `js/weather.js`, `js/customDeco.js`, `js/scripts.js` (purs, testés), `js/editor/cdeco.js`, `js/editor/scriptsUi.js`, `js/race/scriptsRun.js`.
- **Limites assumées** : le déclencheur se joue sur une case, à n'importe quelle hauteur (un pont qui en croise une autre déclenche aussi) ; la pièce perso est dessinée en 2D (face / dessus), sans aperçu 3D ; l'heure qui défile ne rafraîchit pas les reflets de l'environnement du profil Ultra ; la teinte du sol ne se met à jour qu'au chargement du circuit.
- Tests : `tools/test-pieces-perso.mjs`, `tools/test-scripts.mjs`, `tools/test-ambiance.mjs` (étendu) ; test navigateur (météo, heure qui défile, déclencheur en course, pièce perso dans le code, ateliers de l'éditeur).

## Bêta 0.9.23 — l'interface et les caméras à ton goût

`PHYS_VER` inchangé (26) ; rien à redéployer. Visuel uniquement : la conduite, les temps et les classements ne changent pas.

- **Profil › Options › Personnalisation** :
  - **6 thèmes** (Trackigami, Minuit, Crépuscule, Forêt, Mono, **Contraste élevé**), **deux couleurs d'accent** au choix, **opacité des panneaux**, **arrondi des boutons**, **5 polices** (Chakra Petch, système, arrondie, machine, classique).
  - **Compteur de vitesse** : chiffres, énorme, discret, **jauge** ou **cadran** ; **taille du chrono** (petit, normal, gros) ; **taille du HUD** (70 à 150 %) ; **cacher** l'écart, le record, les médailles, la jauge de boost, l'aide des touches, le nom du circuit.
  - **Disposer le HUD** : le vrai HUD s'affiche et on **glisse** le chrono, le bloc circuit, le bloc record, la vitesse et l'aide des touches où on veut (les positions sont en vw/vh : elles suivent la taille de l'écran) ; « Remettre » et « Réinitialiser » rendent tout.
  - **Mes caméras** : jusqu'à 6 caméras de course en plus des 4 d'origine (distance, hauteur, regard devant et en hauteur, champ de vision, nom), « Utiliser en course » ; la touche caméra fait le tour de la liste complète (replays compris).
- `js/uitheme.js` et `js/camprefs.js` (purs, testés), `js/app/uicustom.js` (application à la page, éditeurs). Réglages enregistrés dans les réglages du profil (`ui`, `cameras`), validés à chaque lecture.
- **Limites assumées** : pas d'aperçu en direct de la caméra pendant son réglage (on l'essaie en course) ; le thème « Contraste élevé » couvre les couleurs du HUD et des panneaux mais pas les textures du jeu ; les positions du HUD ne sont pas réajustées en tactile (le HUD tactile garde sa disposition).
- Tests : `tools/test-interface.mjs` ; test navigateur (thème posé, compteur, glisser le chrono, caméra du joueur en course).

## Bêta 0.9.22 — l'atelier de voiture : une voiture vraiment à toi

`PHYS_VER` inchangé (26) ; rien à redéployer. **Aucune de ces options ne touche aux performances** : la voiture roule exactement pareil (la physique ne dépend pas du modèle 3D ; empreinte de physique identique).

- **Garage › Atelier** (nouvel onglet, gratuit) avec cinq sous-onglets :
  - **Formes** : jusqu'à 24 pièces libres (bloc, sphère, cylindre, cône, cale, anneau) posées où tu veux sur la voiture et le deltaplane : position, taille, rotation, couleur, **symétrique** (copie de l'autre côté), **lumineuse**, dupliquer, supprimer.
  - **Peinture** : dégradé (deux sens), 6 motifs (rayures, alvéoles, camouflage, damier, pois, vagues) avec couleur et intensité, **texte**, **numéro de course** et **plaque d'immatriculation**, sur les deux flancs et à l'arrière.
  - **Dessin** : une grille 16 × 16 (crayon, pot de peinture, gomme, 15 couleurs) collée sur les flancs, ou **import d'une image** ramenée à la grille (couleur la plus proche).
  - **Effets** : couleur et longueur de la traînée (qui peut exister sans traînée du catalogue), couleur des étincelles et de la fumée de dérapage, **timbre** et hauteur du moteur, hauteur du klaxon.
  - **Code** : un code **`SHC1:`** contient toute la voiture, à envoyer à un ami (les éléments payants du catalogue restent à débloquer chez lui).
- `js/custom.js` (données, validation, codec, dessin : pur, testé) et `js/customCar.js` (rendu) ; `js/garage/studio.js` (interface). Tout ce qui vient de l'extérieur (code, profil, cloud) passe par `sanitizeCustom` : bornes, jeux de caractères (aucun HTML), longueurs.
- **Limites assumées** : les pièces libres ne s'appliquent pas à la moto ni au bateau ; la personnalisation n'est pas envoyée aux autres joueurs en multijoueur (ils voient la voiture de base) ; le dessin est une grille 16 × 16 (pas de pinceau 3D) ; **pas de modération** des textes et des dessins (ils ne sont visibles que sur ta voiture ou chez qui importe ton code).
- Tests : `tools/test-voiture.mjs` ; test navigateur (atelier complet, enregistrement dans le profil, aller-retour par le code).

## Bêta 0.9.21 — le jeu parle anglais (français / anglais)

`PHYS_VER` inchangé (26) ; rien à redéployer, côté serveur comme côté physique. **Rien ici ne touche à la course** (empreinte de physique, records, replays, classements identiques).

- **Deux langues** : français et anglais, une seule base de code. Le français reste la langue **source** et sert de clé : le code, le HTML et les données du jeu ne sont pas réécrits (~25 000 lignes) ; en anglais, le texte réellement affiché est traduit au dernier moment. Pas de dictionnaire chargé en français : rien ne change pour un joueur francophone (ni poids, ni écritures dans la page).
- **Choix de la langue** : au premier lancement d'un *nouvel appareil*, celle du navigateur (français si le navigateur est en français, anglais sinon) ; un appareil qui a déjà des données de jeu **reste en français** (on ne change pas la langue de quelqu'un sans qu'il l'ait demandé). Un sélecteur **Français / English** est sur l'écran d'accueil, et **Profil › Options › Langue** bascule en direct, sans recharger, dans les deux sens ; le français revient exactement à l'identique. La langue est un réglage de l'**appareil** (elle est connue avant l'identification du joueur).
- **Couverture : ~1 700 entrées** : accueil, menus, carrière (chapitres, objectifs bonus, **noms et descriptions des 72 circuits**), profil, options, commandes et noms de touches, tutoriel, Académie, garage et cosmétiques, titres, communauté, multijoueur, bandeau d'aide et messages de course, arrivée, replay, **éditeur** (barre d'outils, palette, catalogue de pièces et de **décorations**, inspecteur, prefabs, raccourcis, messages), erreurs du serveur et du réseau.
- **Comment ça marche** (`js/i18n.js`, `js/i18n/`) : un traducteur DOM (`MutationObserver`, qui s'exécute avant le dessin : aucun flash de français) traduit les textes, les infobulles (`title`, `aria-label`, `placeholder`) et les paragraphes à balises (`<b>…</b>`) *d'un bloc*, car l'ordre des mots change d'une langue à l'autre. Les textes à valeurs (« Tour 2/3 », « 12 pièces · modifié le… ») sont reconnus par des **modèles à trous** (`{n}`, `{name:t}` : valeur traduite à son tour, `{n:w}` : un seul mot, pour qu'un modèle « Montée {n} » n'avale pas une phrase) ; les pluriels anglais sont des fonctions. Dates et heures suivent la langue. `t('Tour {n}', {n})` existe pour le texte qui ne passe pas par la page (presse-papiers, partage).
- **Un trou de traduction est une phrase française, jamais un écran cassé** : un texte sans entrée reste tel quel.
- **Limites assumées** : (1) la traduction **n'a pas été relue par un anglophone natif** ; (2) le texte écrit par les joueurs (pseudos, noms et descriptions de circuits publiés) n'est évidemment pas traduit — et un pseudo qui serait *exactement* un mot de l'interface (« Jouer », « Retour ») s'afficherait traduit, cas très rare ; (3) les écrans qui demandent un salon réseau réel (salle multijoueur en cours, classements en ligne détaillés) sont couverts par le scan du code et les modèles, pas par une vérification en navigateur ; (4) le README, les docs `supabase/` et les messages de console restent en français ; (5) ajouter une troisième langue = un fichier `js/i18n/<code>.js` + une ligne dans `DICTIONARIES` (`i18n/boot.js`) et `LANGS` (`i18n.js`).
- **Corrigé au passage** : le message de fin de carrière (« ✦ Carrière complète : … ») affichait littéralement `${sm.total}` (apostrophes au lieu d'une chaîne gabarit).
- **Outils** : `tools/i18n-scan.mjs` (inventaire des textes français et de leur couverture ; `--keys` pour amorcer un dictionnaire), `tools/i18n-crawl.mjs` (parcourt les écrans en anglais dans un vrai navigateur et liste ce qui reste en français).
- **Tests** : `tools/test-i18n.mjs` (noyau, intégrité du dictionnaire — trous et balises conservés, pas de traduction contradictoire —, **couverture de `index.html` et de toutes les données**, y compris les 72 descriptions de circuits) ; `tools/test-browser-i18n.mjs` (langue au premier lancement dans les trois cas, bascule en direct dans les deux sens, retour exact au français, aucun reste de français sur les écrans principaux, en course, à la pause, à l'arrivée et dans l'éditeur). `test-browser.mjs` impose maintenant la locale `fr-FR` (Playwright démarre en `en-US`).

## Bêta 0.9.20 — le ressenti de course : de la ponctuation autour de la conduite

`PHYS_VER` inchangé (26) ; rien à redéployer. **Rien ici ne touche à la physique** : la voiture roule exactement pareil avec ou sans (empreinte de physique, records et replays identiques) ; ce sont des retours visuels, sonores et tactiles.

- **Lignes de vitesse graduées** : elles naissent dès 126 km/h et montent jusqu'au plein effet vers 360 km/h (avant : rien avant 223 km/h, puis tout d'un coup).
- **Coup de champ de vision** (+5°, retombe en 0,4 s) au départ d'un turbo ou d'un mini-turbo.
- **Tassement de la caméra à la réception** : plus le choc est fort, plus elle descend (jusqu'à 65 cm), puis remonte doucement.
- **Aspiration** : rouler derrière une autre voiture (fantôme du record, fantôme d'or ou importé, rival du classement, joueur distant), dans son axe et à moins de 30 m, renforce les lignes de vitesse et fait siffler le vent.
- **Vibrations de manette graduées** (avant : seulement des coups ponctuels) : un grondement léger qui monte avec la vitesse, plus fort hors piste et en dérapage, des pulsations en turbo.
- **Bruit de croisement** quand on double ou croise une autre voiture à moins de 6 m en travers.
- **Réglage « Sensations de course »** (Profil › Options, 0 à 150 %, 100 % par défaut) : à 0, aucun de ces effets (et les lignes de vitesse reviennent à l'ancien comportement).
- `js/feel.js` : fonctions pures (sans rendu), testées. **Limite assumée** : ces dosages (intensités, durées, seuils) sont raisonnables d'après les ordres de grandeur du jeu mais **n'ont pas été jugés à la manette** : c'est le seul point du diagnostic qui demande un joueur
  aux commandes ; le réglage « Sensations » et les constantes en tête de `feel.js` sont faits pour être ajustés.
- Tests : `tools/test-ressenti.mjs` ; test navigateur (coup de FOV, aspiration, vibrations, réglage à 0).

## Bêta 0.9.19 — l'éditeur : des prefabs et une ambiance par circuit

`PHYS_VER` inchangé (26) ; rien à redéployer côté serveur.

- **Prefabs** (onglet « Prefabs » de la palette) : six morceaux fournis — *Chicane*, *Épingle*, *Slalom*, *Saut*, *Looping*, *Wall-ride* — qu'on colle comme le presse-papiers (clic sur la grille, `R` pour pivoter, aux quatre orientations et à tout niveau).
  « Enregistrer la sélection » (outil Sélection) crée **ses propres prefabs** (jusqu'à 40, dans ce navigateur) ; ⧉ copie le **code `SHP1:`** à envoyer à un ami, « Importer un code » ajoute celui d'un ami. Un code venu de l'extérieur est validé
  (préfixe, taille, 400 pièces et 300 décorations au plus, circuit non vide) avec un message lisible. Absents du mode guidé de l'éditeur.
- **Ambiance par circuit** (Paramètres du niveau) : **moment de la journée** (aube, plein jour, coucher de soleil, nuit), **brume** (dégagé, brumeux, épais) et **musique** (chill de course, groove du menu, aucune), par-dessus le décor : ciel, soleil, lumière,
  étoiles, brouillard. L'ambiance voyage dans le code de partage (champ `am`, absent par défaut : **le code d'un circuit sans ambiance ne change pas d'un octet**) et dans les circuits publiés, mais elle est **hors signature** : la changer ne fait perdre ni la
  vérification ni les records. Valeurs inconnues ou hostiles ignorées. Elle ne s'applique pas en multijoueur ni en leçon pour la musique (toujours le chill).
- Nouveaux modules : `js/ambiance.js` (réglages purs, sans rendu), `js/prefabs.js` (format, code, morceaux fournis), `js/editor/prefabs.js` (interface). La zone « Zones » (vitesse imposée, caméra spéciale) du diagnostic **n'est pas faite** : elle changerait la physique
  des circuits (donc `PHYS_VER` et la vérification serveur) ; à décider à part.
- Tests : `tools/test-ambiance.mjs` (code, signature, rendu de chaque décor × moment de la journée), `tools/test-prefabs.mjs` (morceaux collés aux quatre orientations, codes hostiles, bibliothèque), test navigateur (ambiance appliquée à la scène, prefab collé, enregistré, exporté, supprimé, importé, caché en mode guidé).

## Bêta 0.9.18 — trouver de bons circuits, et des récompenses qui se méritent

`PHYS_VER` inchangé (26) ; **facultatif côté serveur** : `supabase/etape8-decouverte.sql` (sans lui, rien ne casse : l'onglet « Cette semaine » retombe sur « Plus joués », les titres restent locaux).

- **Découverte dans la communauté** : un onglet **🔥 Cette semaine** (les circuits où le plus de pilotes *différents* ont couru ces 7 derniers jours, d'après `track_plays`) et, en tête de l'écran, le **⭐ Circuit de la semaine**
  (le premier de cette liste, à partir de deux pilotes). Chaque carte affiche une **difficulté estimée** (◆◆◆◇◇ + libellé) et la fenêtre de publication la montre avant de publier.
- **Indice de difficulté** (`js/difficulty.js`) : estimé d'après la **géométrie** seulement (virages serrés, murs, loopings, rubans, plaques, obstacles pondérés, pièces mobiles, pièges, longueur, tours), sans simulation : instantané, valable
  pour tout circuit d'éditeur (qui n'a pas de ligne centrale pour le pilote automatique). Les seuils des étoiles sont les centiles des 72 circuits intégrés. **Limite assumée** : c'est une indication, pas une mesure ; elle ne voit
  pas, par exemple, un enchaînement de sauts très délicat.
- **Titres** : neuf titres décoratifs (Diplômé, Mécano, Globe-trotter, Cristallin, Légende, Fidèle, Collectionneur, Vétéran, Maître du dérapage), calculés d'après la progression ; on en choisit un dans Profil, il s'affiche à côté du pseudo dans
  les classements en ligne. Le serveur ne vérifie que la liste (il ne connaît pas la progression) : un titre est cosmétique.
- **Exclusifs du garage** (jamais en vente) : *Traînée dorée* (7 défis du jour différents), *LED Émeraude* (une médaille sur chacun des 6 circuits de l'Atelier), *LED Crépuscule* (diplôme de l'Académie) ; le garage dit comment les obtenir.
- **Collections** à thème (Néon, Feu, Royal, Course) : quatre éléments qui vont ensemble ; les posséder tous rapporte **100 ◆ une fois** ; un nouvel onglet « Collections » du garage montre l'avancement.
- Le profil retient les jours de défi du jour et les mini-turbos cumulés ; la fusion des sauvegardes cloud réunit leçons, collections, jours de défi et titres vus. Les récompenses sont données (et annoncées) à la fin d'une course, d'une leçon, et au démarrage
  pour un joueur qui les mérite déjà.
- Tests : `tools/test-difficulte.mjs`, `tools/test-recompenses.mjs` (dont la liste blanche SQL comparée à celle du jeu), SQL (étape 8 : tendances, fenêtre, pagination, titres), navigateur (communauté simulée, profil, garage).

## Bêta 0.9.17 — partager un record : un lien qui lance le défi, et le replay en vidéo

`PHYS_VER` inchangé (26) ; rien à redéployer côté serveur.

- **Lien de défi** : « Partager mon fantôme » propose maintenant **Copier le lien** en plus du code. Le lien (`…#g=SHG1…`) ouvre le jeu sur « Défi partagé » : *X t'envoie son fantôme, saurais-tu le battre ?* ;
  « Courir contre lui » importe le fantôme (violet) et lance le circuit (circuits intégrés et défi du jour ; pour un circuit de joueur, le fantôme est gardé jusqu'à ce que tu joues ce circuit). Le code reste dans la
  partie « # » de l'adresse : il ne part jamais vers un serveur. Un lien trop long pour certaines messageries (plus de 7 000 caractères) est signalé, avec le code à copier à la place ; un lien cassé, coupé
  ou d'une autre version du jeu donne un message lisible.
- **Export vidéo du replay** : la barre de replay a un bouton **🎬 Vidéo** : le replay repart du début, la scène 3D est enregistrée (`MediaRecorder`, WebM VP9/VP8, 8 Mb/s, 60 i/s, sans son ni interface) et le fichier
  `trackigami-<circuit>-<temps>.webm` est proposé au téléchargement, après une seconde et demie sur la ligne d'arrivée ; un second appui, Échap ou la fermeture du replay annule. Le navigateur qui ne sait pas enregistrer
  (anciens Safari, notamment) l'annonce au lieu de planter. **Pas de GIF** : un GIF de plusieurs secondes pèse bien plus lourd qu'un WebM et demande un encodeur à embarquer ; le WebM s'importe partout où un GIF animé servirait.
- Nouveaux modules : `js/videoExport.js` (enregistreur de canvas, sans dépendance au jeu) ; `ghostLink` / `ghostFromHash` dans `js/replay.js`.
- Tests : `tools/test-partage.mjs` (aller-retour du lien, liens cassés ou coupés, formats vidéo, enregistreur, nom de fichier) ; test navigateur : lien ouvert dans un autre onglet, course contre le fantôme partagé,
  **export vidéo réel** (fichier WebM reçu en téléchargement).

## Bêta 0.9.16 — l'Académie : six leçons guidées et un éditeur qui démarre simple

`PHYS_VER` inchangé (26) ; rien à redéployer côté serveur.

- **Académie** (menu principal) : six leçons de deux minutes, chacune sur un seul geste — *Prise en main*, *Dérapage et mini-turbo*, *Mini-turbos en série*, *Saut et réception parfaite*, *Plaque de transformation*, *Obstacles* —
  chacune avec un court circuit, une introduction (avec les touches réelles du joueur, ou les boutons à l'écran sur tactile), une consigne qui s'affiche au départ, un **objectif** (les mêmes règles que les objectifs bonus
  de la carrière) et un bilan qui dit quoi corriger. Pas de chrono, de médaille ni de statistique. **+20 ◆** la première fois qu'une leçon est réussie, **+60 ◆** au diplôme. Jusqu'ici le dérapage et le mini-turbo, le cœur
  de la conduite, ne se découvraient que par hasard.
- Le **tutoriel** de premier lancement propose de commencer l'Académie, et mentionne l'Atelier.
- **Éditeur guidé** : pour un **nouveau** joueur (à la fin du premier tutoriel), l'éditeur n'affiche que l'essentiel — les familles Droite (avec les pentes) et Virage, le départ, l'arrivée et le checkpoint ; les autres pièces,
  options, revêtements et décors se débloquent d'un clic sur « Tout afficher » (ou dans Profil › Options : « Éditeur guidé »). Rien n'est retiré à qui connaît déjà l'éditeur : le mode ne s'active pas pour les joueurs existants.
- Vérifié : le pilote automatique réussit les objectifs des leçons 1, 4, 5 et 6 (muret, réception parfaite, moto, piques sans réapparition, à 90 et 110 % de sa vitesse) ; pour le mini-turbo, le **geste décrit dans la leçon**
  (volant à fond, frein 0,8 s) déclenche bien un mini-turbo dans le grand virage sans toucher de muret. **Limite assumée** : l'objectif de la leçon 3 (deux mini-turbos d'affilée) n'a pas de joueur automatique qui le prouve ;
  il se joue à la main.
- Tests : `tools/test-academy.mjs` ; test navigateur (menu, leçon jouée et réussie, bilan, récompense unique ; éditeur guidé, pièces refusées, « Tout afficher »).

## Bêta 0.9.15 — l'Atelier des mécanismes : un chapitre bonus qui montre chaque obstacle et chaque pièce mobile

**`PHYS_VER` inchangé (26)** : records, replays et fantômes sont conservés, et le défi du jour est identique à celui d'avant (vérifié). Six circuits s'ajoutent : **la fonction `submit-score` doit être
redéployée** (`npm run build:function`, puis `index.ts`) pour qu'elle connaisse leurs clés ; tant qu'elle ne l'est pas, leurs classements en ligne refusent les temps (« Circuit intégré inconnu »).

- **Chapitre 12, l'Atelier** (nouveau décor « Atelier des mécanismes ») : six circuits courts du profil *Mécanisme* qui enseignent les sept obstacles du jeu et l'ascenseur / la glissière **un par un** :
  *Garde-Fous* (bumpers et piques fixes) → *En Cadence* (piques escamotables sur la route) → *Le Pendule* (balancier + mur coulissant) → *Rotors* (marteau + balayeur) → *Monte-Charge* (ascenseur + glissière)
  → *Le Grand Atelier* (tout ensemble). Jusqu'ici 6 circuits sur 66 portaient un obstacle et aucun une pièce mobile : la moitié de ce que l'éditeur sait faire ne se voyait jamais en carrière.
- Chaque circuit a été **placé par recherche** avec le pilote automatique (positions et phases des obstacles) : il passe sans choc ni réapparition à 90, 100 et 110 % de sa vitesse, et peut repartir de chaque
  checkpoint à l'arrêt ; la fenêtre de passage est large (les phases voisines passent aussi). Nouveau contrat de profil `atelier` dans `tools/contract.mjs` (temps, mécanismes déclarés présents).
- **Chapitre bonus** : il vient en dernier de la liste mais s'ouvre avec 4 médailles dans le **premier** chapitre ; il ne fait pas partie de l'enchaînement « circuit suivant » (rien ne bouge pour qui a déjà progressé).
- Le **défi du jour** ne tire que dans les onze décors d'origine (`DAILY_DECORS`) : en ajouter un douzième aurait changé le circuit de chaque jour.
- `scriptTrack` : paramètres des pièces mobiles dans les circuits scriptés (`movers`) et drapeau `%` (rotation). La **rotation n'est pas utilisée** : elle réserve une couronne de cases autour d'elle, donc ne se pose pas
  au milieu d'une route (voir `Track.cellsOf`) ; elle reste un outil d'éditeur.
- `tools/phys-fingerprint.mjs` distingue désormais un circuit *ajouté* (nouveaux scénarios : on enregistre, sans toucher à `PHYS_VER`) d'une physique *modifiée*.
- Tests : `tools/test-atelier.mjs` ; `test-niveaux` / `test-registres` passent à 72 circuits et 12 décors ; le test navigateur compte 72 cartes.

## Bêta 0.9.14 — affronter le top 10 : fantômes des classements en ligne

**`PHYS_VER` inchangé (26)** : records, replays et fantômes sont conservés. **La fonction `submit-score` doit être redéployée** (`npm run build:function`, puis `index.ts`) et `supabase/etape7-fantomes.sql`
lancé dans Supabase (dans n'importe quel ordre : sans les colonnes, le temps est enregistré sans fantôme).

- **Fantôme du record côté serveur** : la fonction qui rejoue déjà chaque course (pour en vérifier le temps) en tire aussi le fantôme : une pose (position + orientation) tous les 4 pas et les
  changements de véhicule, au format exact du fantôme enregistré en local. Le fantôme ne contient **jamais les commandes** : il ne permet pas de renvoyer la course d'un autre sous son nom
  (c'est pourquoi l'étape 5 avait rendu les replays illisibles). Un record d'avant l'étape 7 en reçoit un quand son auteur renvoie le même temps, ou via `tools/backfill-ghosts.mjs`.
- **Classement** : un bouton 👻 sur chacun des dix premiers (là où le fantôme existe) ; il lance (ou relance) le circuit avec ce rival affiché, étiqueté de son nom et de son temps (jusqu'à trois à la fois
  côté code), et le jeu indique à l'arrivée de combien tu le bats (ou de combien il reste devant).
- Lecture : la fonction SQL `get_ghost` (n° 1 à 10 d'un circuit et d'une version de physique) ; la colonne n'est pas lisible directement. Tout fantôme reçu est validé (format, bornes) avant d'être dessiné.
- `js/ghostFormat.js` (nouveau, sans rendu) regroupe le format des fantômes (constantes, orientation d'après la pose, codec) : il sert au jeu et à la fonction serveur. `GhostRunner` sait enregistrer le fantôme
  pendant le rejeu (même règle que la course en direct : un retour au checkpoint efface les poses qui le suivent).
- Tests : `tools/test-fantomes.mjs` (orientation identique à celle du jeu, enregistrement, retour au checkpoint, client, outil de rattrapage), test du gestionnaire serveur (fantôme rangé, colonnes absentes, rattrapage),
  SQL (colonne illisible, `get_ghost`), test navigateur (rival affiché et étiqueté).

## Bêta 0.9.13 — multijoueur « championnat », salons publics, relais TURN, télémétrie et médailles calibrées sur de vrais joueurs

`PHYS_VER` reste à 26 (physique inchangée) : **records, replays et fantômes sont conservés**, et la fonction `submit-score` n'a pas à être redéployée. Le **protocole réseau**
change (`NET_VER` 2 : le paquet d'état passe de 38 à 40 octets) : un joueur resté sur l'ancienne version ne peut plus courir avec ceux de la nouvelle (la nouvelle version le signale « autre version » et refuse de rejoindre l'hôte d'une ancienne : « Version du jeu
différente »). Côté serveur, deux ajouts facultatifs : `supabase/etape6-telemetrie.sql` (statistiques anonymes) et la fonction `ice` (relais TURN) ; sans eux, tout marche comme avant.

### Multijoueur : le mode « Championnat » (manches)
- **Plusieurs circuits à la suite**, tirés au sort sans doublon du plus facile au plus dur (tous les circuits, faciles, moyens, difficiles, ou un thème au hasard), de 2 à 6 manches.
  Départ **commun** (décompte synchronisé) sur une **grille** de huit places, quatre de front ; la grille de la manche suivante suit le classement général.
- **Points par place** (10, 8, 6, 5, 4, 3, 2, 1 ; rien sans arrivée) et **classement général** (égalité : victoires, puis somme des places). Une manche se clôt quand tous ont fini ou quitté,
  30 s après la première arrivée, ou après 10 min ; les résultats, le classement et le compte à rebours de la manche suivante s'affichent sans repasser par le salon ; podium à la fin.
- **Classement en direct** pendant la course (place, avancement sur le circuit — mesuré sur la ligne centrale, envoyé dans le paquet d'état — ou temps d'arrivée).
- **Collisions douces** en option : les voitures se repoussent (poussée plafonnée, rien en loopings, rien 2 s après un retour au checkpoint, rien contre une voiture arrivée).
- L'hôte ne fait que donner les départs et clore les manches ; **s'il part, l'identifiant le plus petit prend la suite** (l'état du championnat est copié chez tous). Un arrivant en cours de route
  reçoit le championnat, suit la manche et part à la suivante. Un résultat manqué est rattrapé au départ suivant.
- **Salons publics** : « Salon public » dans le salon publie une fiche (hôte, circuit, joueurs, mode) dans un annuaire commun (`js/net/directory.js`) ; « Salons publics » dans le menu multijoueur la liste, sans code à échanger.
- **Relais TURN** : `js/net/ice.js` demande à la fonction serveur `supabase/functions/ice` des serveurs STUN + TURN à identifiants **à durée limitée** (Cloudflare Realtime TURN ou coturn auto-hébergé),
  avec repli sur le STUN de `js/config.js`. Sans relais, 10 à 20 % des paires de joueurs (réseaux d'entreprise, 4G) ne se voyaient pas.
- Limites assumées : chacun reste seul juge de son temps (pas de serveur de jeu : un tricheur peut annoncer un faux temps ; aucun record, aucune pièce, aucun classement en ligne n'en dépend) ;
  les collisions sont calculées chez chacun d'après la position affichée de l'autre (décalage de ~100 ms).

### Télémétrie anonyme et médailles sur de vrais joueurs
- **Statistiques de jeu anonymes**, seulement avec l'accord du joueur (réglage + question posée une fois) : identifiant d'installation aléatoire, circuit intégré, issue (arrivée ou abandon), temps, progression
  à l'abandon, retours au checkpoint, numéro d'essai, médaille, version de la physique. Rien d'autre (ni pseudo, ni compte, ni position, ni commandes). File locale bornée, envoi par lots, reprise après échec.
  Côté serveur : `supabase/etape6-telemetrie.sql` (table `run_stats` fermée en lecture, fonction `log_runs` à cadence limitée). `node tools/telemetry-report.mjs` lit les données et signale
  les circuits trop durs / trop faciles ; `tools/medals.mjs --humain` propose de nouveaux temps de médailles d'après les percentiles réels (3 / 12 / 40 / 75 %).

### Corrections en jeu
- **Fantôme du record** : il restait une voiture quand le joueur se transformait en moto, bateau ou deltaplane (l'enregistrement ne gardait que position et orientation). Les changements de véhicule sont maintenant enregistrés avec le record (`ghostVeh`) ; les anciens records restent des voitures.
- **Décor « Ville »** : les enseignes néon étaient semées au hasard entre 30 et 150 m de haut, sans immeuble : elles flottaient. Elles sont collées à la façade d'un immeuble.
- **Décor « Jungle »** : les canopées lumineuses étaient semées à part des troncs et flottaient ; elles se posent au sommet d'un tronc.
- **Fantômes** : ils se transforment avec la même animation que le joueur (instantanément après un retour au checkpoint ou un redémarrage). **Particules** : un retour au checkpoint efface celles de l'endroit quitté.
- **Pause** : le monde est vraiment figé (plus de particules de boost, de poussière ni de traces qui naissent autour de la voiture arrêtée, plus de scintillement des flammes) ; la voiture ne recule plus d'un pas à l'instant de la pause. Même chose en replay mis en pause.
- **Après l'arrivée** : l'horloge des obstacles et des pièces mobiles continue pour la physique (elle restait figée alors que leur dessin bougeait : on pouvait heurter un obstacle là où il n'était plus).
- **Autres joueurs (multijoueur)** : ils se transforment avec l'animation et leurs roues tournent. **Dalles de verre** : le rendu suit un numéro de version, plus le nombre de dalles brisées. **Traces de pneus** : collées à la chaussée retournée en gravité inversée.
- `tools/test-decors.mjs` : aucun élément de ces décors ne flotte (testé sur plusieurs graines).


## Bêta 0.9.12 — audit d'architecture : une seule physique partout, un code découpé, des garde-fous

Aucune nouvelle fonction de jeu : un audit complet du dépôt (code mort, chantiers inachevés, dette technique, performances) a été traité de bout en bout.
Seule la physique change (`PHYS_VER` 26) : les records, replays et fantômes d'avant sont écartés, comme à chaque changement de physique ; les **temps de
référence des 66 circuits et leurs médailles sont inchangés**. **La fonction `submit-score` doit être redéployée** (`npm run build:function`, puis `index.ts`).

### Physique et vérification des temps
- **Mathématiques déterministes** (`js/dmath.js`) : `sin`, `cos`, `atan2`, `exp`, `pow`, `hypot`… n'étaient pas garanties identiques d'un moteur JavaScript à l'autre,
  et la fonction serveur (Deno) rejoue les courses pour les vérifier : 152 des 161 scénarios de `tools/phys-fingerprint.mjs` différaient entre Node 22 et Deno 2.9, donc
  une course honnête pouvait être refusée, un fantôme dériver d'une machine à l'autre et le défi du jour changer selon le navigateur. Tout le noyau de simulation
  n'utilise plus que + − × ÷ et `sqrt` (arrondis imposés par IEEE 754). Les 161 scénarios sont maintenant **identiques sous Node, Deno et Chromium** ;
  `tools/test-determinisme.mjs` et une règle ESLint interdisent d'y revenir.
- **Bifurcation** : la physique gardait le seuil de l'ancienne route de 18 m (2 × 9) au lieu de `2 × ROAD_HALF` : entre 18 et 24 m d'écart, un muret invisible séparait des voies
  que le rendu dessinait encore soudées (`tools/test-scale.mjs`).
- **L'arrivée l'emporte** sur une réapparition automatique du même pas (course en direct, fantôme et serveur concluent pareil).
- **Un seul pas de simulation** (`js/simulation.js`) pour la course, les fantômes, la vérification serveur, le défi du jour et les outils : l'ordre horloge → physique →
  règles → réapparitions n'existe plus en cinq exemplaires.
- `Track.time`, un canal caché écrit par chaque voiture, est supprimé : le chrono est un paramètre (`CarPhysics.time`). Index d'obstacles porté par le circuit, tampons sans
  allocation, pièces mobiles retrouvées par l'index de cases, `ribbonOf` sans clé en chaîne.
- `physics.js` (1 500 lignes) devient `physics.js` + `physics/{specs,walls,obstacles,ribbon}.js` ; `step()` (260 lignes) est découpé en phases.

### Code
- Code mort supprimé : exports orphelins, ré-exports, variables masquées par `void`, attributs inutilisés. Aucun commentaire ni test ne le mentionne plus.
- Une seule description pour chaque chose : règles de course (`RULES`), champs d'une pièce (`TILE_FIELDS`), options incompatibles (`OPTION_CONFLICTS`), décorations
  (`decoData.js`), décors (`themes.js`), médailles, limites (`constants.js`), versions (`version.js`).
- Les gros fichiers sont découpés en familles de méthodes (même code, mêmes noms) : `editor.js` 2 200 → 280 lignes (+ `editor/`), `main.js` 1 870 → 360 (+ `app/`), `race.js`,
  `scenery.js`, `inspector.js`, `track.js`, `trackMesh.js` (+ `trackGeometry.js`).
- ESLint sans dépendance (`eslint.config.mjs`, `npm run lint`), 69 remarques corrigées.
- `js/config.js` : le serveur en ligne (Supabase) et le relais réseau (TURN) se règlent à un seul endroit, ou sans toucher au code par `window.COPYTRACK_CONFIG`.

### Rendu et chargement
- **Maillage du circuit par tronçons** (4 × 4 cases) reconstruits à la demande : un grand circuit d'éditeur (270 pièces, 300 décorations) coûtait ~130 ms par modification, il
  en coûte ~2 ms quand rien ne change et un tronçon quand une pièce change ; boîte englobante par tronçon (la caméra ne dessine que ce qu'elle voit).
- **Fantômes** : l'historique de leurs poses est conservé ; un retour au checkpoint ou un redémarrage relit une ligne au lieu de rejouer le fantôme depuis le départ.
- L'éditeur est chargé à la première ouverture (import dynamique) ; `index.html` précharge les modules du démarrage (`modulepreload`, généré par `tools/gen-sw.mjs`) ;
  la police ne bloque plus le premier affichage ; menus à 30 images/s.
- Service worker : seules les réponses complètes entrent dans le cache ; `js/verify.js` (serveur seulement) n'y est plus.
- Réglages de rendu réunis dans `js/renderOptions.js` ; caches de couleurs et de miniatures bornés ; couleur des lampes analysée une fois.

### Serveur
- `submit-score` : la logique est dans `handler.js` (testée sous Node avec un Supabase simulé et la vraie vérification de course : `tools/test-submit-handler.mjs`).
  Nouveau : requête trop volumineuse refusée avant lecture (413), cadence par pilote (429), erreurs internes jamais renvoyées telles quelles, origine autorisée réglable (`ALLOWED_ORIGIN`).
- Les scripts SQL, étape 5 comprise, sont testés sur PostgreSQL 16 (`npm run test:sql`) et relançables.

### Outils, tests et CI
- `tools/phys-fingerprint.mjs` : l'état exact de la voiture (bits des flottants) sur 161 scénarios ; il échoue si la physique change sans que `PHYS_VER` bouge.
- `tools/test-browser.mjs` : le jeu dans Chromium (écrans, course, éditeur, garage, profil…), et la même empreinte de physique.
- Tests en parallèle (`tools/run-tests.mjs`, 36 s → ~17 s), harnais commun, tests de la simulation, du maillage par tronçons, de l'échelle, du déterminisme, des mathématiques.
- CI en quatre jobs : lint + tests + fichiers générés, Deno (même physique que Node), navigateur (Playwright), SQL (PostgreSQL 16).
- README allégé (cet historique en est sorti) ; `docs/ARCHITECTURE.md` et `docs/MODULES.md` (index généré) ; `tools/check-docs.mjs` vérifie liens, versions et index.

## Bêta 0.9.11 — la voiture décolle vraiment, des pistes plus grandes, une voiture qui pardonne

Trois demandes : « on est collé à la route comme avec un aimant », « les boosters sont trop forts avec les nouvelles vitesses », « des pistes plus grandes et une meilleure maniabilité : je ne veux pas me cogner toutes les 2 secondes ».
*Les chiffres des sections 0.9.6 à 0.9.10 plus bas (portées en cases, vitesses de saut…) sont ceux de l'ancien monde de 24 m ; les tableaux de circuits ci-dessus sont remesurés.*

- **Physique des sauts** : la voiture restait collée à la route à n'importe quelle vitesse tant que le raccord faisait moins de 12° (`stickAngle`) : une bosse, un sommet de côte ou une pente qui change prise à 250 km/h ne décollait jamais.
  L'exemption est supprimée : seule compte la vitesse avec laquelle la route « tombe » sous la voiture (`launch`, 2 → 0,6 m/s). Un raccord doux pris lentement reste collé, le même pris très vite décolle (vérifié sur sommets, bosses, descentes, entre 45 et 80 m/s).
  Un vol de moins de 0,35 s ne coûte rien à la réception. Conséquence mesurée : un circuit de sauts demande une vitesse minimale (Tremplins : 56 m/s à l'abord des rampes au lieu de 48).
- **Boosters** : poussée 30 → 10 m/s², durée 1,6 → 1,2 s. Ils donnent un coup de fouet au lieu de doubler la vitesse ; la pointe sans booster reste vers 240 km/h. Les circuits ont été réglés en conséquence (Viaduc Vertical : deux bandes de boost sur la montée,
  Méduses : gravité 130 % au lieu de 200 %, que les pentes rendaient infranchissable, Grand Tour : un booster avant le looping de 24 m de rayon).
- **Pistes plus grandes** : case 24 → **32 m**, route 18 → **24 m** de large, niveau 4,8 → 6,4 m, loopings proportionnels (rayon ×4/3). Les 66 circuits ont été réajustés (écarts de saut, hauteurs, obstacles latéraux ×4/3, vitesses du pilote), les médailles et les objectifs « moins de t s » recalculés sur le pilote.
- **Voiture plus maniable** : adhérence latérale 56 → 80 m/s² (≈ 2,5 g), braquage un peu plus ample et plus rapide, et surtout un train avant moins accrocheur que l'arrière (`frontShare` 0,48 → 0,42) : en limite d'adhérence la voiture sous-vire au lieu de partir en tête-à-queue.
  Moto et bateau suivent. Le pilote automatique ne demande plus que 62 % de l'adhérence (il en demandait 80 %).
- **Les tests mesurent la maniabilité** (`node tools/maniabilite.mjs [--circuits]`, `tools/test-maniabilite.mjs`) : rayon de braquage, g latéral, temps de réponse au volant, retour droit après un coup de volant lâché, distance pour changer de voie, puis un **pilote humain imparfait**
  (réaction 0,10 s, braquage plus mou, volant qui tremble, mauvais jugement des freinages) sur les 66 circuits : contacts avec les bordures par minute et taux d'arrivée sans réapparition.

| Mesure (même pilote imparfait, 3 graines par circuit) | 0.9.10 | 0.9.11 |
| --- | --- | --- |
| contacts avec une bordure par minute (moyenne des 66 circuits) | 1,1 | **0,1** |
| circuits avec au moins un contact | 26 sur 66 | **5 sur 66** |
| parcours finis sans réapparition | 178 sur 198 | **189 sur 198** |
| rayon de braquage à 144 km/h | 31,8 m (1,3 case de 24 m) | **25,7 m (0,8 case de 32 m)** |
| g latéral en virage à fond (144 km/h) | 2,0 | **2,5** |
| changer de voie (une demi-route) à 216 km/h | 76 m = 3,2 cases | **84 m = 2,6 cases** |

  Ce que le banc a aussi trouvé : sur une dalle « volant inversé » le pilote automatique ne tenait pas compte de l'inversion (toute correction aggravait l'écart) ; Galerie de Cristal passait de 5,8 contacts par minute à 0.
  Limites connues : les parcours non finis par le pilote imparfait (Cité Céleste au deltaplane, Apesanteur, Cristal Fêlé) viennent de la loi de commande du pilote automatique, qui oscille dès que le retard dépasse ~0,1 s, pas de la voiture ;
  **aucun humain n'a rejoué les circuits** depuis cette version (voir `docs/FICHE-ESSAI.md`, à refaire).
- Autres : `PHYS_VER` 25 (les rejeu et fantômes de la 0.9.10 sont écartés), `tools/golden-temps.json` et la fiche d'essai régénérés, `tools/patch-circuit.mjs` modifie un champ d'un circuit sans toucher à son commentaire, `npm test` compte un fichier de plus (`test-maniabilite.mjs`).
  **À faire en ligne** : redéployer la fonction `submit-score` (nouveau `index.ts`) ; les records des circuits repartent de zéro (le tracé a changé).

## Bêta 0.9.10 — finitions (rien de nouveau, tout ce qui manquait pour dire « c'est fini »)

- **Fiche d'essai** : `node tools/fiche-essai.mjs` écrit `docs/FICHE-ESSAI.md` (une case par circuit : départ clair, passage juste, médaille atteignable, bonus réalisable, checkpoint sûr, « fini ») et un gabarit `docs/temps-humains.json`.
  Jusqu'ici seul le pilote automatique avait parcouru les circuits : c'est la liste de ce qu'il reste à jouer à la main.
- **Médailles calées sur de vrais joueurs** : `node tools/medals.mjs --humain docs/temps-humains.json [--ecrire]` propose Cristal = meilleur temps relevé, Or ×1,05, Argent ×1,2, Bronze ×1,4 ; avec `--ecrire` le circuit passe en
  `medalsBy: 'humain'` (le contrat ne le recale plus sur le pilote) et son objectif « moins de t s » reste entre l'or et l'argent.
- **Courbe de difficulté** : `node tools/difficulte.mjs` calcule un indice par circuit (virages, murs, loopings, sauts, freinages, vitesse, obstacles). Il a montré que trois sprints (Boulevard Sans Fin, Premier Envol, Galerie de Cristal) étaient notés
  3 étoiles pour un indice de 3 : ils passent à 2 (Boulevard Sans Fin remonte d'un rang dans le chapitre 4). Règles testées : le premier circuit d'un chapitre a au plus 3 étoiles, le dernier au moins 4, un sprint au plus 2.
- **Départs** : le départ de Tours Jumelles (rampe, comme Éruption) devient « trois boosters → petit looping → rampe de toit », celui de Vrilles Souterraines (looping, comme cinq autres) « plongeon → vrille ». Il reste cinq départs avec un looping (Spirale, Hyperboucle, Tourbillon, Montgolfières, Tours), tous différents (simple, deux en S, triple, basse gravité, petit looping avant une rampe) ; trois départs en rampe (Lianes, Éruption, Viaduc).
- **Carrière** : un bilan en haut de l'écran (pourcentage, médailles, cristaux, objectifs bonus, message à la fin), un badge « Chapitre terminé / parfait / cristal » sur chaque chapitre, et une **infobulle** sur chaque carte (« Départ : … Au programme : … », champ `appris`).
- **Garde-fous** : `tools/golden-temps.json` mémorise le temps du pilote sur chacun des 66 circuits (un test échoue en nommant ceux qui bougent) ; chaque circuit décodé garde ses tours, son véhicule et sa gravité de départ ;
  les commandes du pilote rejouées sur le circuit décodé redonnent la même arrivée au même pas (plafond, deltaplane, tapis, rebonds, verre…).
- README : anciennes listes de départs « prévus » supprimées, aide-mémoire de mise en ligne ci-dessus. Version 0.9.10.

## Bêta 0.9.9 — refonte du level design, fin : les 51 circuits restants

Les **66 circuits intégrés sont tous refaits** (les lots 4 à 14 sont livrés d'un coup). Chaque chapitre propose maintenant les **cinq profils** (Sprint, Speedway, Technique, Rollercoaster, Acrobatique),
jamais deux fois le même de suite, et chaque circuit a une **ouverture qui n'est celle d'aucun autre** (66 ouvertures différentes, vérifiées par les tests).

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 16 | Tourbillon Tropical | Rollercoaster | quatre boosters → **looping triple** (4×4) | slalom de wall-rides gauche / droite, grand double looping, plongeon de 8 niveaux : 15 niveaux de dénivelé |
| 17 | Sauts Lunaires | Acrobatique | la plaque de départ règle la **gravité à 50 %** : la voiture flotte de 6 niveaux | trois sauts de cinq cases en basse gravité, longues réceptions |
| 18 | Grand Archipel | Speedway | **aucun booster** : une pente douce de six cases lance dans un très grand virage relevé | cinq virages relevés, wall-ride de quatre cases, plongeon, 61 % du tour au-dessus de 240 km/h |
| 19 | Néons Express | Speedway | **tapis roulant** à +200 km/h (trois cases) : près de 290 km/h sans booster | quatre virages relevés, wall-ride sur la façade d'une tour, 88 % au-dessus de 240 km/h |
| 20 | Boulevard Sans Fin | Sprint | départ **sans bordures** (six cases) | vague douce, tunnel de quatre cases, un seul très grand virage plat |
| 21 | Hyperboucle | Rollercoaster | trois boosters → **deux loopings** qui s'enchaînent en S | trois loopings, deux wall-rides, plongeon de 8 niveaux |
| 22 | Métro Aérien | Technique | **montée en lacets** : deux courbes montantes serrées | 13 virages serrés : slalom sans bordures sur le viaduc, épingles, chicane sur un mur, slalom sous un tunnel |
| 23 | Tours Jumelles | Acrobatique | trois boosters → **petit looping** → rampe de toit | trois sauts de toit en toit, wall-ride sur une façade, réception de 10 niveaux |
| 24 | Viaduc Vertical | Rollercoaster | trois boosters → **lift hill** de 16 niveaux | plongeon de 12 niveaux, grand looping, slalom de wall-rides |
| 25 | Aurore Naissante | Sprint | **départ sur la glace** : verglas, trois boosters, verglas | vague douce, deux très grands virages plats, descente finale |
| 26 | Banquise Rebondissante | Acrobatique | verglas, deux boosters, **rebond** vers une terrasse plus basse | quatre rebonds de plus en plus puissants et longs : la Banquise **descend** de terrasse en terrasse (Spores monte) |
| 27 | Glacier Magnétique | Technique | **toboggan** de 10 niveaux dès le départ | huit virages serrés, glace avant les épingles, aimants sur la bosse centrale |
| 28 | Double Hélice | Rollercoaster | **tire-bouchon** pris à l'élan, sans booster | hélice montante (16 niveaux) puis descendante dans l'autre sens, double looping, wall-rides |
| 29 | Couronne Boréale | Speedway | **directement dans un très grand virage relevé**, sans booster | six virages relevés en couronne, wall-ride, 60 % du tour au-dessus de 240 km/h |
| 30 | Blizzard | Technique | départ dans la **poudreuse** | neuf virages serrés, vent avant les épingles, neige épaisse en sortie |
| 31 | Braises | Sprint | deux boosters → **colline douce** | vague en S, S relevé 2×2, un très grand virage plat |
| 32 | Coulée Ardente | Speedway | un booster → **S de virages relevés 2×2** | six virages relevés, wall-ride, plongeon, 4 % de freinage |
| 33 | Champs de Basalte | Technique | départ sur une **plaque de dérive** (l'arrière n'accroche presque plus) | huit virages serrés dont trois sur dérive, chicane sur un mur |
| 34 | Cheminée du Volcan | Rollercoaster | trois boosters → **tube** → montée verticale de quatre niveaux | plongeon de 8 niveaux, grand looping, slalom de wall-rides |
| 35 | Caldeira | Speedway | deux boosters → **montée douce** vers la crête ; circuit fermé, **2 tours** | quatre virages relevés en anneau, wall-ride, 64 % du temps au-dessus de 240 km/h |
| 36 | Éruption | Acrobatique | trois boosters → **rampe sans virage d'entrée** : saut de cinq cases, réception 10 niveaux plus bas | quatre éruptions, anneau turbo, wall-ride |
| 37 | Quai d'Amarrage | Sprint | un booster → **tube** | saut en **basse gravité** (40 %) avec anneau turbo, très grand virage plat |
| 38 | Navette | Technique | **départ en moto** (plaque), slalom R L R L immédiat | huit virages serrés, chicane, arrivée en moto (objectif bonus) |
| 39 | Ceinture d'Astéroïdes | Rollercoaster | **tire-bouchon** à l'élan → trois boosters → grand double looping | slalom de wall-rides, tube, plongeon |
| 40 | Grand Anneau | Speedway | deux boosters → **tube court** ; circuit fermé, **3 tours** | quatre virages relevés, wall-ride, 58 % au-dessus de 240 km/h |
| 41 | Apesanteur | Acrobatique | deux boosters → plaque de **gravité 20 %** | trois vols de 8 à 10 s en l'air (28 niveaux de dénivelé), wall-rides |
| 42 | Station Zénith | Technique | départ sur une **plateforme** d'amarrage | neuf virages serrés, chicane sur un mur |
| 43 | Courant Chaud | Sprint | deux boosters → **contre-courant** (−122 km/h) puis courant favorable (+138 km/h) | vague, très grand virage plat, tapis de trois cases |
| 44 | Jardin de Corail | Technique | un booster → **courant favorable** vers une première épingle | huit virages serrés, dalle de verre fragile, chicane |
| 45 | Épave Engloutie | Rollercoaster | trois boosters → **wall-ride** sur le flanc de la coque | double looping, second wall-ride, plongeon de 8 niveaux |
| 46 | Méduses Électriques | Acrobatique | cinq boosters → plaque de **gravité 130 %** (la pression des profondeurs) | quatre sauts brefs, réceptions violentes, wall-ride |
| 47 | Abysses | Rollercoaster | un booster → **plongeon de 12 niveaux** → grand looping au fond | slalom de wall-rides, remontée en hélice |
| 48 | Grande Barrière | Speedway | deux boosters → **pont de verre** → virage relevé | cinq virages relevés, wall-ride, courant favorable, 62 % au-dessus de 240 km/h |
| 49 | Chaîne de Montage | Sprint | trois boosters → **trois cases à moteur coupé** | tapis roulant, vague, deux très grands virages plats ; bumper et piques sur les bords |
| 50 | Laminoir | Technique | **bifurcation** : la voie de droite porte un booster | huit virages serrés, ralentisseur, chicane ; bumper et piques |
| 51 | Engrenages | Rollercoaster | deux boosters → **hélice montante** de 8 niveaux | looping triple, wall-rides, plongeon ; piques escamotables |
| 52 | Fonderie | Speedway | trois boosters → **tunnel** de quatre cases → virage relevé | cinq virages relevés, wall-ride, deux cases à moteur coupé, bumpers |
| 53 | Presse Hydraulique | Acrobatique | deux boosters → **tapis de quatre pistons** (rebonds en chaîne) | rampe raide, rebond vers une terrasse, wall-ride, rampe douce |
| 54 | Usine Folle | Technique | deux boosters → **deux dalles ralentisseur** juste avant le slalom | neuf virages serrés, moteur coupé, chicane ; marteau, piques, bumper |
| 55 | Premier Envol | Sprint | trois boosters → **vent latéral** | vague en S, deux très grands virages plats, descente |
| 56 | Îles Suspendues | Acrobatique | trois boosters → **rampe sans bordures** (les îles n'ont pas de barrière) | trois sauts avec anneaux turbo, wall-ride |
| 57 | Rafales | Technique | deux boosters → **vent fort** (180 %) juste avant la première épingle | neuf virages serrés, du vent à chaque relance |
| 58 | Montgolfières | Rollercoaster | trois boosters → plaque de **gravité 40 %** → grand looping | slalom de wall-rides, plongeon, pesanteur rétablie avant l'arrivée |
| 59 | Pont des Vents | Speedway | deux boosters → vent sur un pont **sans bordures** → virage relevé sans bordure | quatre virages relevés, wall-ride, 60 % au-dessus de 240 km/h |
| 60 | Cité Céleste | Acrobatique | **départ en deltaplane** : plaque sur la ligne, chute de 6 niveaux | avenue de 10 cases, rampe raide, wall-ride, rampe douce avec anneau |
| 61 | Galerie de Cristal | Sprint | deux boosters → **volant inversé** (trois cases en ligne droite) | vague en S, deux très grands virages plats, descente |
| 62 | Plafond Renversé | Technique | un booster → **vrille** : la route se retourne, gravité inversée | huit virages serrés dont quatre au plafond |
| 63 | Cristal Fêlé | Acrobatique | deux boosters → **inversion de gravité** : la voiture « tombe » au plafond, 8 niveaux plus haut | trois allers-retours sol / plafond, verre fragile au plafond |
| 64 | Miroir | Speedway | trois boosters → **S de deux très grands virages relevés** en miroir | six virages relevés, wall-ride, trois dalles de verre |
| 65 | Vrilles Souterraines | Rollercoaster | un booster → **plongeon** de 4 niveaux → vrille | parcours au plafond, double looping, slalom de wall-rides |
| 66 | Cœur de la Montagne | Technique | un booster → **deux dalles de verre fragile** (5 s de résistance) → slalom | huit virages serrés, chicane sur un mur : le dernier circuit |

- **Le contrat est une fonction.** `tools/contract.mjs` (`checkDef`) définit « un circuit bien fait » : construction, profil mesuré sur le pilote automatique, ouverture jamais classique, pas de départ lancé, au moins quatre pièces de la 0.9.3,
  pilote sans réapparition, choc, pique ni obstacle touché, wall-rides ≥ 130 km/h, vérificateur de l'éditeur sans alerte, finissable à ±10 % de vitesse (et à +25 % hors acrobatique), **repartir à l'arrêt de chaque checkpoint**,
  médailles à ±2 % du temps du pilote, objectif bonus réalisable, partage SHW sans perte. `node tools/contract.mjs fichier.mjs [--map] [--out defs.json]` juge des candidats, `--builtin [id…]` les circuits intégrés ;
  `node tools/inject.mjs defs.json` les écrit dans `js/tracks.js` à la place de ceux de même identifiant. `tools/test-niveaux.mjs` applique ce contrat aux 66 circuits (en 66 tests), puis vérifie ce qui se joue entre eux :
  cinq profils par chapitre, jamais le même de suite, **66 ouvertures différentes** (la liste est écrite dans le test), ordre de la carrière, difficultés, médailles croissantes, objectifs, obstacles, circuits à tours.
- **Obstacles.** Un obstacle mobile au milieu de la route est une loterie pour le pilote (un balayeur provoque des dizaines de chocs et peut même bloquer la voiture) : les circuits de l'usine n'ont que des obstacles sur les **bords**
  (bumpers, piques, piques escamotables), plus un marteau au milieu d'Usine Folle, placé là où le pilote passe sans le toucher aux trois vitesses testées. Les anciennes listes d'obstacles figées (`js/builtinObstacles.js`, calées sur les anciens
  parcours) sont supprimées : un circuit n'a que le champ `obst` de sa définition.
- **Ce que ce lot a appris sur la physique** (mesuré avec `tools/lab.mjs`) :
  - un **tapis roulant** ajoute sa vitesse à celle de la voiture (jusqu'à 447 km/h mesurés sur +200 km/h) ; à contresens, il empêche de partir (jamais un tapis inverse sur le premier carreau) ;
  - un **ralentisseur** posé juste après le départ ou un checkpoint empêche de repartir à l'arrêt (mesuré), et un **moteur coupé** ne relance rien : on place toujours un booster avant ; un **tire-bouchon** se prend à l'élan (≈ 180 km/h), pas à la sortie d'un booster ni à pleine vitesse ;
  - **basse gravité** : un saut de 2 niveaux porte à 14 cases à 40 % de gravité, à plus de 20 cases à 20 % : il faut alors une réception de huit cases en pente douce ; **gravité lourde** (200 %) : les vides se réduisent à 1 ou 2 cases ;
  - un **rebond** à 100 % porte à ≈ 4 cases à 200 km/h, à 200 % à ≈ 6 cases (proportionnel à la vitesse) ; un tapis de rebonds enchaîne les sauts ; le **ressort latéral** éjecte la voiture hors de la route (inutilisable avec le pilote) ;
  - le **deltaplane** reste actif jusqu'à la plaque suivante et se pose au hasard de l'élan : les circuits qui l'emploient le font suivre d'une longue piste ; un vol dure ≈ 15 s ;
  - une **chaîne d'anneaux turbo** dans un seul saut rend la portée imprévisible : un anneau par saut ;
  - au **plafond**, chaque pièce doit être retournée (`^`) : une droite à l'endroit au milieu des virages du plafond laisse un trou ; les virages relevés ne se prennent pas au plafond ;
  - deux **virages relevés de sens contraire** se prennent avec une case entre eux ; un checkpoint se place à plus de trois cases de la réception d'un grand saut (sinon un saut un peu long le survole) ;
  - une **bifurcation** ralentit à ≈ 130 km/h (la voie déportée est un S) : elle convient aux circuits techniques, pas aux sprints.
- **Chapitres** : les descriptions des chapitres 4 à 11 sont réécrites. Le chapitre 9 (usine) est le seul à garder des obstacles, parce que c'est son thème.
- **Bibliothèque d'ouvertures** (une par circuit, jamais deux fois la même) : booster → wall-ride · booster → virage relevé · chute libre · épingle descendante · montée verticale · looping (simple, double, triple) · rampe de lancement (avec ou sans anneau) ·
  départ en tube · rebond · bifurcation · plafond · tunnel · descente en moto · eau · deltaplane · basse gravité · gravité lourde · pente douce · tapis roulant · sans bordures · montée en lacets · glace · toboggan · tire-bouchon · poudreuse ·
  collines · dérive · plateforme · contre-courant · moteur coupé · pistons · vent · volant inversé · vrille · inversion de gravité · verre fragile · lift hill · hélice.
- Les records des 51 circuits refaits repartent de zéro (la clé de classement contient l'empreinte du circuit) ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré). `PHYS_VER` reste 24.
- **Limites assumées** : aucun humain n'a joué ces 66 circuits ; le pilote automatique est la référence (médailles = son temps). Les médailles Cristal et Or pourront être resserrées après de vraies parties. Le deltaplane reste le plus irrégulier.

## Bêta 0.9.8 — refonte du level design (lot 3 / 14)

Fin de la Jungle néon (chapitre 2, qui propose maintenant les cinq profils) et début de l'Archipel tropical (chapitre 3).

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 11 | Racines Boueuses | Rollercoaster | **départ au plafond** (la course commence en gravité inversée) | deux **tonneaux** complets (plafond → mur gauche → sol → mur droit → plafond), plongeon, virage relevé, boue et vent, double looping |
| 12 | Temple | Technique | **départ dans un tunnel**, épingle immédiate | douze virages serrés (épingles dans un tube, hélice descendante, slalom sous un tunnel), un booster à chaque relance |
| 13 | Lagon Turquoise | Sprint | **départ en moto**, lancé par une descente de 7 niveaux (sans booster) | deux sauts en chapelet avec un anneau turbo chacun, très grand virage plat |
| 14 | Récif | Technique | **départ sur l'eau** (plaque bateau, slalom R L R L dans un chenal) | épingles en voiture entre deux chenaux, petit saut sur un mur, arrivée franchie **en bateau** (objectif bonus) |
| 15 | Phare | Acrobatique | trois boosters → **décollage en deltaplane** | vol de cinq cases, montée du phare (+8 niveaux), deux sauts de voiture avec anneau turbo |

- **Récif n'est pas un Speedway.** Je l'avais annoncé comme tel : la physique l'interdit. Le bateau plafonne vers 200 km/h (accélération 8 m/s², glisse), ne peut pas rouler sur un virage relevé
  (l'eau n'existe pas sur ces pièces), et ni un booster, ni un checkpoint, ni l'arrivée ne se posent sur l'eau. Il devient donc un circuit Technique, et le Speedway du chapitre 3 viendra plus loin.
- **Départ au plafond** : `start^` suffit (la course démarre alors en gravité inversée) ; les transitions de mur enchaînent un tonneau complet.
- **Deltaplane** : l'autopilote ne tient pas une portée de vol constante (selon l'élan, le deltaplane se pose entre 12 et 22 cases plus loin) ; le circuit laisse une longue piste d'atterrissage avant la plaque qui rend la voiture, et
  le contrat « sauts » compte les vols de plus d'une seconde (et non plus les réceptions parfaites, que le pilote réussit au hasard de l'élan).
- Nouveautés de l'outillage : `tools/lab.mjs` accepte `params` (gravité inversée, véhicule de départ), compte les **sauts** et le véhicule d'arrivée ; le contrat des Acrobatiques devient « ≥ 6 s en l'air, ≥ 3 sauts, ≥ 8 niveaux ».
- Bibliothèque d'ouvertures : la liste complète et définitive des 66 départs est dans la section Bêta 0.9.9 (et écrite dans `tools/test-niveaux.mjs`).
- Les records des cinq circuits refaits repartent de zéro ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré). `PHYS_VER` reste 24.

## Bêta 0.9.7 — refonte du level design (lot 2 / 14)

Suite de la refonte : le dernier circuit du chapitre 1 (Spirale Prismatique) et les quatre premiers de la Jungle néon (chapitre 2). Chacun a son profil et une ouverture qui
n'a jamais servi.

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 4 | Spirale Prismatique | Rollercoaster | trois boosters → **directement un grand looping** | hélice montante de 16 niveaux (quatre grandes courbes inclinées), plongeon de 16 niveaux à 38°, slalom de wall-rides gauche / droite |
| 7 | Lianes Néon | Sprint | trois boosters → **rampe de lancement** avec anneau turbo dans le saut | vagues douces, pont de lianes **sans bordures** à plus de 230 km/h, S de virages relevés, très grand virage plat |
| 8 | Canopée | Speedway | **départ en tube** propulsé, qui débouche sur un virage relevé 3×3 | S relevés, wall-ride de 5 cases sur le mur gauche, tube à pleine vitesse, 35 % du temps au-dessus de 240 km/h |
| 9 | Spores | Acrobatique | deux boosters → **rebond géant** (palier 2 niveaux plus haut) | quatre champignons en escalier en zigzag (+8 niveaux), plongeon final ; la portée d'un rebond est proportionnelle à la vitesse, le circuit est très tolérant |
| 10 | Serpent | Technique | **bifurcation dès le départ** : la voie de droite porte la plaque moto | douze virages serrés en slaloms (R L R L), descente en lacets, petit saut sur un mur, moto → voiture → moto |

- **Le chapitre 1 est complet** et propose les cinq profils. Spirale est maintenant le n°4 (difficulté 3) et Lac Gelé le n°5 : deux Rollercoasters ne se suivent plus
  (règle vérifiée : deux circuits consécutifs d'un chapitre n'ont jamais le même profil). Le Grand Tour reste le final (n°6).
- Nouveautés de l'outillage : `tools/test-v096.mjs` devient **`tools/test-niveaux.mjs`** (contrat de tous les circuits qui ont un `profil`, plus les ouvertures de chaque lot) ;
  `tools/lab.mjs` compte maintenant les anneaux et le véhicule d'arrivée ; objectifs bonus vérifiés (chrono, réceptions parfaites, anneaux, moto à l'arrivée).
- Ce que ce lot a appris sur la physique : un **rebond** (`.j`, hauteur 200 % au maximum) donne 28 m/s vers le haut, soit un palier de **+2 niveaux** au plus ; il n'est
  posé que sur des droites plates. Une **sortie qui repasse au-dessus du départ** perturbe le premier saut (constaté sur Spores, dont le plongeon final passait juste au-dessus du premier rebond) : le dernier virage s'écarte de la tour.
- Bibliothèque d'ouvertures : la liste complète et définitive des 66 départs est dans la section Bêta 0.9.9 (et écrite dans `tools/test-niveaux.mjs`).
- **Correctif du lot 1 (Tremplins du Crépuscule).** Un contrôle nouveau a montré que, après une chute, la réapparition (qui remet la voiture **à l'arrêt**) la posait devant une rampe
  qu'elle ne pouvait plus prendre, et qu'un départ lancé (`v0`) ne se rejoue pas non plus après une réapparition avant le premier checkpoint. Le circuit est refait : chute libre
  depuis l'arrêt, un checkpoint avant chaque rampe suivi de deux boosters, anneau turbo au lieu du checkpoint aérien (sa réapparition tombait sur la rampe). Le contrat vérifie maintenant,
  pour **chaque checkpoint** de **chaque circuit refait**, que le pilote qui réapparaît à l'arrêt termine sans nouvelle chute, et qu'aucun circuit refait n'utilise `v0`.
- **Correctif des tests.** Trois tests de `tools/test-niveaux.mjs` (marge sur les murs, vérificateur de l'éditeur, partage SHW) étaient asynchrones et le script s'arrêtait avant qu'ils ne
  s'exécutent : ils affichaient « ok » sans rien vérifier. Ils sont maintenant synchrones (un test asynchrone est refusé) et passent réellement ; le vérificateur de l'éditeur a été
  complété pour les rebonds (réception plus haute que le départ jusqu'aux 4/5 de la hauteur du rebond).
- Les records des cinq circuits refaits repartent de zéro ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré). `PHYS_VER` reste 24.

## Bêta 0.9.6 — refonte du level design (lot 1 / 14)

Les 66 circuits intégrés sont refaits par lots de 5 (un lot par version). Les circuits d'avant la 0.9.4 étaient tous bâtis sur la même recette
(`start B S2 R S L S2 C…`) et calés sur l'ancienne physique. Chaque circuit refait porte un **profil** (champ `profil`, pastille colorée sur la carte
de carrière) et une **ouverture** qui n'a rien à voir avec celle des autres.

**Lot 1 : le chapitre 1, Désert crépuscule (5 des 6 circuits)**

| # | Circuit | Profil | Ouverture | Ce qu'il enseigne |
| --- | --- | --- | --- | --- |
| 1 | Premiers Éclats | Sprint | deux boosters → premier wall-ride (transitions douces 2×2) | vitesse de pointe, trajectoire dans les très grands virages plats, courbes progressives |
| 2 | Canyon Corail | Speedway | un booster → directement un très grand virage relevé | virages relevés 3×3 à plus de 240 km/h, wall-ride de 6 cases sur la paroi du canyon, descente douce |
| 3 | Tremplins du Crépuscule | Acrobatique | **chute libre** immédiate depuis 66 m (la voiture quitte la plateforme de départ, à l'arrêt) | rampes progressives et à 38°, réceptions sur longues pentes, checkpoint aérien, saut sur un mur |
| 4 | Lac Gelé | Technique | épingle descendante dès le départ | 11 virages serrés, un booster à chaque relance, glace avant les épingles, chicane sur un mur |
| 5 | Le Grand Tour | Rollercoaster | trois boosters → **montée verticale** (montée en L, mur, sommet) | chute, slalom de wall-rides gauche / droite, grand looping, arche mur → plafond → mur |

**Les profils sont mesurés, pas seulement annoncés** (`tools/test-niveaux.mjs`, sur la course du pilote automatique) :

| Profil | Contrat |
| --- | --- |
| Sprint | aucun virage serré, ≤ 3 très grands virages, 12 à 26 s, plus de 180 km/h pendant 60 % du temps, au moins 40 % de lignes droites |
| Speedway | aucun virage serré, ≥ 4 très grands virages, plus de 240 km/h pendant 35 % du temps, freinage ≤ 8 %, moyenne ≥ 200 km/h |
| Technique | ≥ 8 virages serrés, freinage ≥ 3 % du temps, ≥ 15 % du temps sous 120 km/h, moyenne ≤ 155 km/h, un booster par relance |
| Rollercoaster | ≥ 6 niveaux de hauteur, ≥ 8 cases sur un mur (des deux côtés), au moins un looping |
| Acrobatique | ≥ 6 s en l'air, ≥ 3 réceptions parfaites, ≥ 8 niveaux de hauteur |

Règles communes à tout circuit refait : ouverture différente de toutes les autres, **aucun départ lancé** (`v0`), jamais le départ « classique », au moins quatre pièces de la 0.9.3
(wall-rides, courbes progressives, inclinaisons, très grands virages), wall-rides pris avec ≥ 130 km/h (le décrochage est à 108), **finissable sans choc ni
réapparition à ±10 % de vitesse** (un joueur n'a jamais la vitesse exacte du pilote), médailles à jour, objectif bonus réalisable.

**Ce que la physique impose au level design** (mesuré avec `tools/lab.mjs`) : sur le plat, la voiture plafonne vers 237 km/h (traînée) ; seuls les boosters
(jusqu'à 300 km/h), les descentes et les virages relevés permettent d'aller plus vite. Un virage serré se prend à ≤ 93 km/h, un grand à ≤ 162, un très grand
plat à ≤ 207 ; un très grand virage relevé laisse passer plus de 240 km/h. La portée d'un saut varie avec le carré de la vitesse : on le rend tolérant avec
de longues réceptions en pente, et on place les checkpoints **avant** les rampes (un saut trop long survole un checkpoint posé juste après), suivis de boosters : la réapparition remet la voiture **à l'arrêt**.

Bibliothèque d'ouvertures : voir la section Bêta 0.9.9 (liste complète des 66 départs, écrite dans `tools/test-niveaux.mjs`).

**Outils** : `node tools/lab.mjs "script" --l 4 --map --profile --robust` (carte, profil de vitesse, tolérance à la vitesse) ou `--id eclats` ou `--all` ;
`node tools/medals.mjs eclats` propose les médailles (or = temps du pilote, cristal 0,95 ×, argent 1,15 ×, bronze 1,35 ×) et `--check` les vérifie.

- Les records des circuits refaits repartent de zéro (la clé de classement contient l'empreinte du circuit) ; **la fonction `submit-score` doit être redéployée** (`index.ts` régénéré, elle connaît les circuits intégrés).
- `PHYS_VER` reste 24.

## Bêta 0.9.5

Audit de l'interface et des textes, sans changement de physique (`PHYS_VER` reste 24, rien à redéployer côté serveur) :

- **HUD** : les pastilles « ◆ 0 / 3 » et « Record » retrouvent leur fond (une règle `.chip` de l'éditeur les écrasait) ; les règles sont maintenant limitées à `#hud` et `#editor`.
- **Écrans** : « + Nouveau » ne passe plus sous le compteur de pièces (Mes circuits, Circuits, Profil) ; l'écran Communauté a son fond flouté et un champ de recherche lisible ; les listes déroulantes d'Options ne dépassent plus de l'écran sur téléphone ; le champ de vision affiche « normal » à 0.
- **Éditeur** : palette **repliable** (▾, choix mémorisé), moins haute sur téléphone en paysage ; le vérificateur `checkTrack` (code resté sans appel) est de nouveau branché sur le badge ⚠, et son clic fait clignoter les pièces en cause (`_markIssues`). Les plaques de gravité inversée ne sont plus prises pour des routes coupées.
- **Textes** : le turbo annonce « jusqu'à 403 km/h » (vitesse visée), le tutoriel parle de la vitesse, des murs et du décrochage, le réglage « effet de vitesse » annonce 220 km/h.
- **Son et effets** : rapports de boîte du moteur et lignes de vitesse recalés sur la vitesse de pointe de 0.9.4.
- **Code** : 9 classes CSS mortes et les règles `.ed-status` / `.ed-help` supprimées, doublons `.pal-param` fusionnés, avertissement sur l'ordre des circuits dans `tracks.js` ; nouveaux tests `tools/test-v095.mjs`.

## Bêta 0.9.4

Recalibrage de la physique vers un feeling plus technique (arcade exigeant) :

- **Accélération et vitesse de pointe** : le moteur vise 95 m/s (342 km/h, turbo 112 m/s) au lieu de 54 m/s, mais la poussée décroît tout le long (`accel × (1 − (v / vmax)^1,5)`, `accel` 11 au lieu de 28, traînée 0,0009 au lieu de 0,0023) : 100 km/h en ~3 s, 180 km/h en ~7 s, 216 km/h en ~11 s, puis la vitesse monte très lentement vers 240 km/h et plus. Une bonne sortie de virage se paie en distance sur toute la ligne droite suivante ; les freins sont plus puissants (52 au lieu de 42 m/s²).
- **Les murs se paient** : un choc rebondit (`wallE`), fait perdre 5 % de la vitesse par m/s d'impact (jusqu'à 65 %), fait pivoter la voiture et lui coupe moteur et adhérence 0,1 à 0,8 s (« encaisse ») ; racler un mur freine en continu (2 /s). Mêmes règles sur les parois des rubans (loopings, tubes…).
- **Murs à 90° sans magie** : vitesse minimale de 30 m/s (108 km/h) ; en dessous la gravité reprend toute la paroi et, passé 0,3 s sur un plan penché de plus de 45°, la voiture décroche et tombe en gardant sa vitesse (message « Trop lent »).
- Pilote automatique (démo, validation, fantôme d'or) : vitesse visée plafonnée (52 m/s, réglable par circuit : `pilot` dans `tracks.js`), freinage plus prudent ; quelques circuits retouchés pour rester finissables (plus de boosts / de lancer avant certains sauts, glace du Blizzard) et **médailles recalculées** (temps du pilote automatique : +12 % en moyenne).
- La physique change (`PHYS_VER` 24) : records et replays repartent de zéro ; **la fonction `submit-score` doit être redéployée**.

## Bêta 0.9.3

- **Orientation** : Sol, Mur gauche, Mur droit, Plafond sont une **caractéristique** (onglet Options, liste *Orientation* de l'Inspecteur) des lignes droites et des virages ordinaires, pentes comprises : plus de pièces 90° à part. Les anciennes pièces « Route sur le côté » (0.9.2) se lisent comme une transition ou une ligne droite orientée, à l'identique.
- **Transitions d'orientation** (famille *Transition*, 16 pièces) : Sol ↔ Mur gauche, Sol ↔ Mur droit, Mur ↔ Plafond, chacune **franche** (1 case) ou **douce** (2×2). Entrée sur le mur, retour à l'horizontale, et de quoi refaire un plafond puis revenir au sol.
- **Pentes** : la **descente** existe (Ligne droite, Virage, Courbe), avec ses raccords doux (début doux, fin douce, S). La descente est exactement la montée parcourue à l'envers, mais se pose dans son sens, et le niveau suit tout seul à la pose.
- **Physique** : un défaut de raccord de moins de ~12° (haut d'une pente, pente douce, raccord doux pris à très grande vitesse) ne fait plus décoller la voiture ; un tremplin (2 niveaux et plus), lui, décolle toujours. Entre un mur et le plafond la gravité locale suit la route (3° de marge pour ne pas rester « à l'envers » en revenant sur le mur).
- **Éditeur** : l'orientation se pose avec la pièce (aperçu compris) ou s'applique à une pièce posée ; messages clairs quand la place manque (un mur, un plafond ou une descente ne tiennent pas au ras du sol) ; une route sur un mur se sélectionne dans la scène et ne peut pas servir de point de départ pour « Tester ici ».
- **Éditeur (corrections)** : en profil *Potato* / *Ultra Potato* (portée 450 m, brouillard à 180 m) le circuit disparaissait quand on dézoomait : l'éditeur éloigne maintenant la portée et le brouillard (le profil de la course revient en sortant) ; une pièce posée à l'envers au niveau 0 est refusée avec un message au lieu de passer sous le sol ; l'éditeur avertit (pastille ⚠) quand un mur touche le sol sans transition ; `M` échange Mur gauche / Mur droit.
- **Audit** : `node tools/audit-pieces.mjs` relève l'entrée et la sortie de chaque pièce (pente, roulis, dénivelé, virage), vérifie qu'aucune sortie n'est un cul-de-sac et que **toute pièce existe aussi parcourue à l'envers** ; `tools/test-v093.mjs` conduit des pentes, des murs et un plafond, et tire 150 circuits au hasard.
- Le format reste compatible : 52 types ajoutés **à la suite** de `PIECE_ORDER`, l'orientation est un champ optionnel (`o`, dans `data.e`) ; un circuit sans mur garde exactement la même signature.
- La physique change (`PHYS_VER` 23) : records et replays repartent de zéro ; **la fonction `submit-score` doit être redéployée** (`npm run build:function`, puis la déployer).

## Bêta 0.9.2

- **Pièces** : *Courbe* (rampe qui se courbe progressivement), *Inclinaison* pour le *Virage* (comme la ligne droite), *Route sur le côté* (transition et ligne droite à 90° : il faut de la vitesse, sinon on glisse et on tombe). Icône pour la *Ligne droite · inclinaison 4*.
- **Plaque bateau** : une très légère montée de l'eau au sol ; eau pour le bateau, route normale pour les autres.
- **Bifurcation** : le revêtement de la voie déportée ne déborde plus sur la voie directe (il commence là où la voie déportée sort de la voie directe) et ses motifs sont centrés sur elle.
- **Éditeur** : plus de raccourcis pour choisir une pièce ; `I` = Inspecter ; `Ctrl + D` duplique la pièce ou la décoration inspectée ; le pot de peinture remplit aussi une **zone vide fermée** par des pièces ; *Checkpoint* est une simple case à cocher (portique sur route, balise sur plateforme ; l'anneau aérien disparaît de l'éditeur, les anciens circuits restent lisibles) ; nom et description dans les paramètres du niveau.
- **Décors** : catégories *Lumières* (projecteur tournant, projecteur, lanternes, lampadaire : de vraies lumières, de la couleur de l'objet), *Véhicules*, *Noël* et *Halloween*.
- **Jeu** : deltaplane plus maniable ; traînée du véhicule permanente (intensité selon la vitesse et le boost) ; plus de bruit de moteur à l'arrivée ; textes plus courts ; menu Communauté (icône cristal pour le temps de l'auteur, boutons réorganisés).
- La physique change (`PHYS_VER` 22) : records et replays repartent de zéro ; **la fonction `submit-score` doit être redéployée**.

## Bêta 0.9.1

- **Qualité graphique** : profils Ultra, Haute, Moyenne, Basse et Potato, détection automatique par un benchmark invisible sur l'animation du menu, réduction automatique si le jeu rame.
- **Records locaux** : le temps et les médailles ne dépendent plus de la place disponible dans le navigateur.
- **Corrections** : le dessous et la tranche des dalles sont solides (un deltaplane ne traverse plus une rampe), un pont au-dessus d'un checkpoint ou de l'arrivée ne les déclenche plus, « Effacer les records » efface vraiment (y compris dans le cloud), un record d'une ancienne version de la physique ne bloque plus un nouveau, le retour au checkpoint annule les anneaux / réceptions / mini-turbos d'après le checkpoint, un checkpoint aérien ne fait plus gagner le temps passé en l'air, les circuits de joueurs ne rapportent des pièces que pour une nouvelle médaille.
- **Serveur** : replays refusés avant dépliage s'ils sont trop longs, défis du jour limités à hier / aujourd'hui / demain, replays des classements non lisibles publiquement (`supabase/etape5-securite.sql`, à lancer une fois).

## Bêta 0.9

**Pilotage**
- **T** recommence le niveau ; **R** revient au dernier checkpoint et remet le chrono au temps de ce checkpoint.
- Vent latéral et Dérive réparés (le vent pousse vraiment, la dérive fait glisser l'arrière).
- Aimant : colle toujours au maximum. Conduite identique au sol sur les pièces spéciales (virages relevés, loopings, tubes).
- Un peu plus de contrôle en l'air ; le nez se relève plus vite avec S. La caméra suit la route dans les loopings, vrilles et virages relevés.

**Gravité inversée et pièces à l'envers**
- Revêtement **Inversion de gravité** : la plaque projette la voiture vers le haut, une pièce posée à l'envers la réceptionne ; une 2e plaque la remet à l'endroit. Sur une vrille, la gravité suit la route.
- **Toutes les pièces** peuvent être posées à l'envers (au moins un niveau au-dessus du sol) : on n'y roule qu'en gravité inversée.

**Revêtements**
- Sur **toutes les pièces** (virages relevés, loopings, tubes, plafond), mêmes effets partout ; tableau de compatibilité dans l'éditeur.
- Nouveaux : **Tapis roulant**, **Ressort latéral** (saut d'une voie), **Verre fragile** (cède si on est trop lent ou si on atterrit trop fort), **Poudreuse**, **Volant inversé**, **Moteur coupé**.
- Eau animée (houle, écume), tapis qui défile, verre qui scintille, neige qui pétille ; motifs plus parlants pour tous les revêtements.

**Obstacles et pièces mobiles**
- Obstacles (catégorie de décor) : piques et piques escamotables (retour au checkpoint), boule balancier, marteau tournant, mur coulissant, balayeur, bumper (chocs physiques).
- Pièces en mouvement : **ascenseur** (monte de 2 niveaux), **glissière** (se décale d'une case) et **rotation** (tourne autour de son centre et emporte la voiture). Vitesse et amplitude se règlent dans l'Inspecteur. Tout bouge selon le chrono : identique en replay et après un retour au checkpoint.

**Éditeur**
- **Inspecteur** (outil Inspecter) : onglet *Propriétés* (position, caractéristiques de la pièce, revêtement, options, réglages des pièces mobiles) et onglet *Couleurs* (route, lignes, bordures d'une pièce ; couleur libre d'une décoration). Une flèche blanche semi-transparente indique le sens de parcours de la pièce inspectée.
- **Paramètres du niveau** (F3) : décor, tours, hors piste autorisé, vitesse, gravité et véhicule de départ, **inversion de gravité au départ** (`inversionGraviteDepart` : la course démarre au plafond). Hauteur maximale : 60 niveaux.
- **Visée par rayon** : revêtements, options, pot de peinture et pipette ciblent la pièce exacte sous le curseur, à n'importe quelle hauteur. Les **décorations** se posent n'importe où (coordonnées flottantes, là où le curseur touche la route ou le sol) ; **Maj + souris** déplace la pièce ou la décoration ciblée sur l'axe vertical seul. Les anneaux se posent sur des cases déjà occupées ; l'**anneau turbo** existe aussi en option d'une ligne droite.
- **Essai sans arrivée** : le bouton Tester accepte un circuit sans pièce Arrivée (la vérification, elle, en exige une).
- **✔ Vérifier** lance la course complète ; à l'arrivée : Publier, Retour à l'éditeur ou Refaire un meilleur temps. **Ton temps devient la médaille cristal**, les autres sont déduites.
- Nom et description modifiables après publication ; les classements ne dépendent plus du nom.
- Palette sur toute la largeur (jusqu'à 3 lignes), barre du haut réorganisée, 39 nouvelles décorations (Souterrain, Nuages, Fonds marins, Usine, Espace, Circuit).

**Thèmes et circuits**
- 4 nouveaux thèmes : **Canyon de cristal**, **Ville dans les nuages**, **Fonds marins**, **Usine mécanique** ; la Station orbitale gagne Voie lactée, nébuleuses, galaxie spirale et étoiles filantes.
- **66 circuits** (24 nouveaux) ; la carrière compte **11 chapitres, un par thème**, du plus facile au plus dur.
- Défi du jour calculé en temps universel (le même pour tout le monde). Éclats secrets retirés.
- La physique ayant changé, les records repartent de zéro ; **la fonction serveur `submit-score` doit être redéployée** (fichier `supabase/functions/submit-score/index.ts` régénéré).

## Bêta 0.8

- **Classements par circuit** (circuits intégrés, défi du jour, circuits de la communauté) : chaque nouveau record est envoyé et vérifié par rejeu côté serveur ; place mondiale affichée à l'arrivée, top 10 avec le bouton 🏆. Option pour ne pas envoyer ses temps.

- **Communauté** (en ligne, avec Supabase) : publier un circuit vérifié depuis « Partager », le retrouver dans le menu Communauté (récents, populaires, plus joués, mes publications, recherche), le jouer sans code, l'aimer, le copier dans « Mes circuits », le signaler. Pilote anonyme : seul le pseudo est enregistré.
- La base se prépare avec `supabase/etape1-communaute.sql` (à lancer dans l'éditeur SQL de Supabase) ; la connexion anonyme doit être activée. Sans réseau, le jeu marche comme avant.

## Bêta 0.7

- À la place de l'ancien demi-tube : un **tube modulaire** (entrée, sections, sortie = entrée retournée). Dans un tube long, on peut rouler sur la paroi, au plafond, et faire des tours complets ; la voiture garde sa position sur la paroi d'une section à l'autre. Les sections peuvent recevoir un accélérateur ou une gravité réduite.
- Des tubes longs ajoutés dans 6 circuits (dont Glacier Magnétique, à l'endroit de l'ancien demi-tube) et dans le défi du jour. Médailles recalculées.

## Bêta 0.6

- **Bosses réalistes** : quand une pente monte puis redescend (ou passe au plat), la route « tombe » sous la voiture et elle décolle, d'autant plus haut qu'elle va vite. Avant, elle restait collée au sol comme sur un revêtement Aimant (seul l'Aimant garde cet effet).
- Une bosse de pente se prend sans perte de vitesse à la réception (tolérance d'assiette un peu plus large).
- Un checkpoint passé en sautant juste au-dessus compte bien.
- Éditeur : Ctrl + C / V / X / Z ne déclenchent plus en même temps l'action de la touche seule (niveau −, vrille, gomme, vue par niveau) ; « Tester ici » part dans le bon sens.
- Téléphone en paysage : le menu principal tient sur l'écran (deux colonnes).
- La barre de replay disparaît toujours en quittant un replay ; le klaxon est indiqué dans l'aide de course.

## Bêta 0.5

- Le jeu passe en version bêta (0.5).
- Le demi-tube est retiré (dans les anciens codes de circuit, il devient une ligne droite).

## Nouveautés de la v1.5 (devenue bêta 0.5)

- 42 circuits (12 nouveaux, les 30 autres retravaillés), du plus facile au plus dur, deux nouveaux décors : Volcan et Station orbitale.
- Nouvelles pièces : virages relevés, tube, tire-bouchons, bifurcations, anneaux turbo, checkpoints aériens et en virage, pente douce.
- Bateau, deltaplane et revêtement Eau.
- Mode carrière avec objectifs bonus, défi du jour, replays, fantômes de la médaille d'or et d'amis.
- Assiette en l'air, réceptions, mini-turbo, traces de pneus, caméra lointaine.
- Éditeur : sélection et copier-coller, test depuis le curseur, vérificateur (badge ⚠), vue par niveau, tours multiples, miniatures.
- Garage : carrosseries Pick-up et Monoplace, moto Chopper, finitions, traînées, klaxons.
- Musique, accessibilité, qualité graphique moyenne, compteur d'images, application installable hors ligne, tutoriel.
- La physique ayant changé, les records repartent de zéro (les pièces, le garage et les circuits enregistrés sont conservés).
