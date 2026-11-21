# Audit de complétude — Phase 3 (bêta 0.16.0)

Ce que le jeu devrait encore avoir, **une fois corrigés les bugs des phases 1 et 2** ([PHASE1-AUDIT-TECHNIQUE.md](PHASE1-AUDIT-TECHNIQUE.md), [PHASE2-AUDIT-EN-JEU.md](PHASE2-AUDIT-EN-JEU.md)), pour être un jeu complet, cohérent et abouti. Aucun fichier du jeu n'a été modifié.

**Méthode.** Inventaire chiffré du contenu réel (code et données du jeu), mesures sur les 72 circuits avec la physique du jeu, relecture des parcours joués en phases 1 et 2, comparaison avec ce qu'attendent les joueurs de **jeux de course contre-la-montre avec éditeur de circuits** (comparaison de genre, sans titre précis : le projet a fait le choix de ne citer aucun autre jeu). L'analyse fonctionnelle existante ([../ANALYSE-FONCTIONNELLE.md](../ANALYSE-FONCTIONNELLE.md), écrite pour la 0.13.0) a été relue : ses urgences ont été traitées en 0.13.1-0.15.0 ; ce qui en reste est repris ici en le citant, pas recopié.

---

## A. État général de complétude

**Verdict honnête : en fonctionnalités, le jeu est complet, et même au-delà de ce qu'on attend du genre. Ce qui lui manque n'est presque plus « une fonctionnalité de plus » : c'est la consolidation, la validation humaine, et un contenu officiel qui exploite ce que le moteur sait déjà faire.**

Les attentes de base du genre sont toutes là : médailles par circuit (dont une médaille d'auteur, le cristal), fantôme du record, temps intermédiaires, relance instantanée, replays, classements mondiaux et entre amis (et **vérifiés par le serveur**, ce qui est rare), éditeur, partage par lien, défi du jour, manette, tactile, hors ligne. Le jeu ajoute des couches que peu de jeux du genre réunissent : Replay Theater avec analyse, coach chiffré, HUD d'entraînement, laboratoire physique, saisons hebdomadaires à divisions, duels classés et tournois asynchrones, multijoueur en direct, logique de circuit programmable, quatre véhicules, gravité retournable, Académie notée, deux langues.

Les manques réels, mesurés :
1. **Le contenu officiel n'utilise qu'une petite partie du moteur.** La campagne emploie 92 des 449 types de pièces ; **aucun** circuit officiel n'utilise la logique de circuit, les déclencheurs, la pluie, le givre, les rafales, les ambiances d'auteur, les profils physiques ou les véhicules v2 ; les pièces mobiles n'apparaissent que sur un circuit ; deux circuits seulement se courent en plusieurs tours ; le revêtement « ressort » n'est jamais utilisé. Pour un joueur qui ne construit pas de circuits, une grande partie du jeu n'existe pas.
2. **Le jeu n'a jamais été validé par des joueurs humains depuis ses dernières lois de conduite** (`docs/ARCHITECTURE.md`, « Limites connues » ; médailles « calées sur un petit groupe » en 0.13.0).
3. **Beaucoup de fonctions supposent une communauté nombreuse** (saisons et divisions, duels, tournois, salons publics, classements, communauté) ; avec peu de joueurs, elles paraissent vides.
4. **Des finitions de produit manquent** : identité sonore (une seule musique de course pour 72 circuits et 12 décors), introduction des mécaniques (9 nouveautés au chapitre 1, aucune aux chapitres 6, 7 et 10), fin de carrière, gestion de compte (aucun changement ni récupération de mot de passe), outils d'exploitation (modération, déploiement du serveur).

**Prérequis.** Avant toute recommandation : corriger les problèmes ÉLEVÉS des phases 1 et 2 (blocages par réapparition, publication impossible, entrées qui relancent la course, salles multijoueur) ; ils ne sont pas répétés ici.

---

## B. Points forts à préserver

| Point fort | Pourquoi le préserver |
| --- | --- |
| **Physique déterministe et classements vérifiés par rejeu** | C'est la garantie d'équité qui donne de la valeur à chaque record ; aucune recommandation ci-dessous ne doit l'affaiblir (pas de performance achetable, pas d'aléatoire dans la course). |
| **L'analyse de course** (Replay Theater, coach localisé et chiffré, HUD d'entraînement, laboratoire) | Rare dans le genre ; c'est le meilleur outil de maîtrise du jeu. À mettre davantage en avant, pas à multiplier. |
| **L'éditeur** (449 pièces, logique, groupes, déclencheurs, prefabs, vérificateur de continuité, vérification d'auteur, publication) | Le moteur de rejouabilité à long terme. |
| **Les mécaniques signature** : gravité retournable, murs et plafonds, quatre véhicules, plaques, revêtements | Elles donnent son identité au jeu ; elles méritent plus de place dans le contenu officiel (C, E). |
| **Structure claire** : 12 décors × 6 circuits, profils de circuit, médailles, objectifs bonus, défi du jour, saisons | Lisible et généreuse ; ne pas la complexifier. |
| **Respect du joueur** : cosmétique seulement, aucun achat, accord explicite pour les statistiques, export des données, pages légales, hors ligne, sans installation | Une qualité de produit à garder telle quelle. |
| **Accessibilité déjà large** : aides à la conduite (classées à part), réponse du volant, touches réassignables, manette, tactile, animations réduites, daltonisme, HUD personnalisable, deux langues | Au-dessus de la moyenne du genre. |
| **Culture de la fiabilité** : 1 755 vérifications automatiques, empreinte de physique, corpus de compatibilité | Ce qui permet de faire évoluer le jeu sans tout casser. |

---

## C. Manques essentiels (priorité 1)

- **COMPLETE-001 — Validation humaine du ressenti, de la difficulté et des médailles.**
- **COMPLETE-002 — Un contenu officiel qui fait découvrir les systèmes déjà construits.**
- **COMPLETE-003 — Gestion et récupération de compte.**

Détails au § K.

## D. Manques importants (priorité 2)

COMPLETE-004 (outils de modération), COMPLETE-005 (déploiement serveur sûr), COMPLETE-006 (identité musicale par décor), COMPLETE-007 (introduction progressive des mécaniques), COMPLETE-008 (Académie étendue), COMPLETE-009 (fantôme de la médaille suivante), COMPLETE-010 (fonctions sociales vivantes avec peu de joueurs).

## E. Opportunités majeures

1. **Faire de la campagne la vitrine du moteur** (COMPLETE-002) : c'est l'écart le plus grand entre ce que le jeu *sait* faire et ce que le joueur *voit*. De nouveaux circuits officiels (jamais la modification des anciens, voir les risques) avec portes logiques, pièces mobiles, pluie et rafales, circuits en plusieurs tours, sections en moto, bateau, deltaplane, transformeraient l'image du jeu sans écrire de nouveau système.
2. **Le jeu « à une personne » qui reste vivant** (COMPLETE-010) : le jeu est construit pour l'asynchrone (fantômes, rejeu vérifié, saisons). Des temps et fantômes officiels pour amorcer chaque classement, un « rival juste devant toi », des salons complétés par des fantômes, donneraient vie aux saisons, duels et classements même quand peu de joueurs sont en ligne.
3. **Une cible toujours visible** (COMPLETE-009 + COMPLETE-012) : le fantôme de la médaille suivante et des objectifs variés donnent à chaque circuit plusieurs raisons d'être rejoué, en s'appuyant sur le pilote automatique et l'analyse qui existent déjà.
4. **Une identité sensorielle propre à chaque décor** (COMPLETE-006, COMPLETE-017) : la musique procédurale existe ; la décliner par décor (tempo, tonalité, timbres) donnerait aux 12 mondes la personnalité qu'ils ont déjà visuellement.

---

## F. Gameplay et mécaniques

**Ce qui est riche.** Conduite à modèle de pneus, dérapage contrôlé et mini-turbos, contrôle en l'air (aérofrein, bascule), rubans 3D (loopings, vrilles, tubes, murs, plafonds), gravité variable et retournable, 19 revêtements, 7 obstacles animés, 21 solides, 4 véhicules aux physiques distinctes, pièces mobiles, logique programmable, environnements déterministes. Les combinaisons possibles sont très nombreuses.

**Ce qui est sous-exploité** (mesuré sur la campagne) :

| Mécanique | Présence dans les 72 circuits officiels |
| --- | --- |
| Logique de circuit (portes, interrupteurs, compteurs) | 0 |
| Pluie, givre, rafales ; vent et adhérence de circuit | 0 |
| Ambiances d'auteur (heure, brume, musique) ; déclencheurs | 0 |
| Profils physiques, véhicules v2 | 0 (seulement en catégories de record) |
| Pièces mobiles | 1 circuit |
| Plusieurs tours | 2 circuits |
| Moto / bateau / deltaplane | 5 circuits ; plaques posées 5, 3 et 4 fois en tout |
| Tunnels, routes au plafond | 4 et 5 circuits |
| Revêtement « ressort » | jamais |
| Types de pièces | 92 sur 449 |

**Lacunes de profondeur.** Le gameplay n'en manque pas ; ce qui manque, c'est **l'occasion de le pratiquer** dans le contenu officiel (C, E). Une seule réserve, de conception : les véhicules ne sont presque jamais une **décision** du joueur (on subit la plaque) ; des tronçons à choix (bifurcation « en bateau par l'eau » contre « en voiture par la route ») exploiteraient ce qui existe (bifurcations et plaques) sans rien inventer → intégré à COMPLETE-002.

**Lié à un bug, pas à un manque.** Les catégories de record « départ en bateau » et « en deltaplane » sont proposées sur des circuits probablement infranchissables (GAME-006) : le correctif est de les valider ; le manque éventuel derrière (catégories conçues pour un véhicule) relève de COMPLETE-002.

---

## G. Progression et contenu

**Mesures.**
- Carrière : 12 chapitres de 6 ; difficulté par chapitre en dents de scie (ex. ch. 6 : ★★★★★★ = 2-3-4-4-5-5), seuls 5 circuits à une étoile sur 72.
- Nouveautés par chapitre : **9 au chapitre 1** (boost, mur, bifurcation, pente, carrefour, anneau, tube, glace, plafond), 6 au chapitre 2, 4 au chapitre 3, puis 1-2 ; **aucune aux chapitres 6, 7 et 10** ; la vrille et l'inversion de gravité n'arrivent qu'au chapitre 11.
- Objectifs bonus : 72, mais **29 « sans réapparition »** et 13 « sans toucher de muret » ; « mini-turbo » 1 fois, « réceptions parfaites » 3, « véhicule » 3. Tous sont réalisables (vérifié en phase 2).
- Niveaux : 50, mais **4 récompenses de niveau** (5, 10, 20, 30) ; rien après 30. Titres : 9 ; exclusifs : 9 ; collections : 13 ; licences : 4.
- Économie : le garage entier (128 objets) coûte 12 000 ◆ ; une carrière complète en rapporte ≈ 28 700 ◆ sans compter la répétition des courses (chaque arrivée médaillée rapporte de nouveau) : **les pièces perdent tout usage au milieu du jeu**.
- Fin : « Carrière complète… Il n'y a plus rien à finir ici » (écran des circuits) ; pas d'épreuve finale, pas de bilan ni de générique.

**Lacunes.** Démarrage dense (beaucoup de nouveautés d'un coup, peu de circuits faciles), milieu de campagne sans nouveauté de mécanique, objectifs répétitifs, progression de niveau qui s'éteint, monnaie sans débouché, fin abrupte. Le contenu, lui, n'est pas en quantité insuffisante : 72 circuits, défi quotidien, saisons et éditeur suffisent largement ; **ne pas ajouter de circuits pour le nombre**, seulement pour ce qu'ils font découvrir (COMPLETE-002).

---

## H. Expérience du joueur

| Dimension | Constat | Recommandation |
| --- | --- | --- |
| Compréhension | Bonne base (tutoriel, première course guidée, Académie de 6 leçons, wiki, mode guidé de l'éditeur). Mais 19 revêtements, 7 obstacles, 4 véhicules, la gravité et la logique sont expliqués surtout hors du jeu (wiki) ; la fiche du circuit dit ce qu'il « apprend », pas comment. | COMPLETE-007, COMPLETE-008 |
| Feedback | Riche (sons, particules, messages courts priorisés, écarts aux temps intermédiaires, coach). Manque : un son propre à chaque véhicule (le bateau et le deltaplane ont le moteur de la voiture). | COMPLETE-017 |
| Fluidité | Relance instantanée, « Continuer la carrière », course rapide, fiche avant chaque course. Les transitions et l'enchaînement des écrans n'ont pas pu être jugés à la main (phase 2, § 4.3). | — |
| Satisfaction | Mini-turbo, réception parfaite, médailles, coach : bonne boucle courte. La boucle longue (que faire après l'or ?) manque de cible visible. | COMPLETE-009, COMPLETE-012 |
| Frustration | Longs tronçons sans checkpoint (52 s sur « Double Hélice », GAME-007) ; une seule musique de course pendant des heures. | COMPLETE-006, GAME-007 |
| Immersion | 12 décors très typés visuellement, mais même musique partout, pas d'ambiance d'auteur sur les circuits officiels. | COMPLETE-006, COMPLETE-002 |
| Lisibilité | Mini-carte, mauvais sens, HUD personnalisable. | — |
| Accessibilité | Large (voir B). Possible ajout : direction par inclinaison du téléphone (bonus). | COMPLETE-024 |
| Prise en main | Bonne pour la conduite ; plus difficile pour comprendre ce qui se passe sur les revêtements et plaques rencontrés pour la première fois. | COMPLETE-007 |

---

## I. Interface, qualité de vie et polish

- **Présent et à garder** : fiche du circuit, classements à onglets, statistiques, personnalisation de l'interface et des caméras, export vidéo, lien de défi, sauvegarde par code, mise à jour annoncée.
- **Manquant** :
  - changement et récupération de mot de passe (COMPLETE-003) ;
  - ouvrir une copie d'un circuit officiel dans l'éditeur pour apprendre (COMPLETE-019) ;
  - mode photo (COMPLETE-020) ;
  - sons par véhicule (COMPLETE-017).
- **Polish d'identité** : le nom « Trackigami » (circuits pliés en facettes) n'a pas encore d'écho dans la présentation (transitions, apparition du circuit) → COMPLETE-021, bonus.
- **Exploitation** (invisible pour le joueur, indispensable au produit) :
  - pas d'interface de modération en jeu (les signalements existent, l'action se fait hors du jeu) : COMPLETE-004 ;
  - redéploiement manuel de la fonction serveur à chaque changement de physique, avec une fenêtre où les temps sont refusés : COMPLETE-005.

---

## J. Rejouabilité et durée de vie

**Déjà fort** : médailles jusqu'au cristal, records et classements vérifiés, défi du jour (un circuit chaque jour, vérifié pour les 60 prochains), mutations, séries, saisons hebdomadaires, duels, tournois, modes et catégories de record, communauté et éditeur.
**Ce qui freine** : (1) une cible qui disparaît une fois l'or gagné (le fantôme or n'est montré que tant que l'or n'est pas gagné) ; (2) des fonctions sociales qui dépendent du nombre de joueurs ; (3) rien qui fasse revenir quand **quelqu'un d'autre** a progressé (record battu, duel en attente) ; (4) objectifs peu variés. → COMPLETE-009, 010, 012, 015.
**À ne pas faire** : des systèmes « pour retenir » artificiels (récompenses de connexion, compteurs à remplir) ; le jeu a déjà ses raisons de revenir, il faut les rendre visibles.

---

## K. Liste complète des recommandations

| ID | Nom | Catégorie | Priorité | Valeur | Complexité |
| --- | --- | --- | --- | --- | --- |
| COMPLETE-001 | Validation humaine du ressenti, de la difficulté et des médailles | Qualité / équilibrage | 1 | Très haute | Moyenne |
| COMPLETE-002 | Contenu officiel qui exploite les systèmes déjà construits | Contenu / cohérence | 1 | Très haute | Élevée |
| COMPLETE-003 | Gestion et récupération de compte | Fonctionnalité / confiance | 1 | Haute | Moyenne |
| COMPLETE-004 | Outils de modération dans le jeu | Exploitation / communauté | 2 | Haute | Moyenne |
| COMPLETE-005 | Déploiement serveur sûr et automatique | Exploitation | 2 | Haute | Moyenne |
| COMPLETE-006 | Identité musicale par décor | Son / immersion | 2 | Haute | Moyenne |
| COMPLETE-007 | Introduction progressive des mécaniques | Prise en main | 2 | Haute | Faible à moyenne |
| COMPLETE-008 | Académie étendue à toutes les familles de mécaniques | Prise en main / maîtrise | 2 | Moyenne à haute | Moyenne |
| COMPLETE-009 | Fantôme de la médaille suivante | Rejouabilité / maîtrise | 2 | Haute | Faible à moyenne |
| COMPLETE-010 | Fonctions sociales vivantes avec peu de joueurs | Communauté / rejouabilité | 2 | Très haute | Moyenne à élevée |
| COMPLETE-011 | Rythme de la carrière (respirations, nouveautés réparties) | Progression | 3 | Moyenne | Moyenne |
| COMPLETE-012 | Objectifs bonus variés et liés à chaque circuit | Rejouabilité | 3 | Haute | Moyenne |
| COMPLETE-013 | Fin de carrière : épreuve finale et bilan | Achèvement | 3 | Haute | Moyenne |
| COMPLETE-014 | Épreuve « chapitre d'une traite » | Rejouabilité / maîtrise | 3 | Moyenne | Moyenne |
| COMPLETE-015 | Boîte de réception : « ton temps a été battu », duels en attente, nouvelle saison | Rétention / communauté | 3 | Haute | Moyenne |
| COMPLETE-016 | Progression de niveau récompensée jusqu'au bout | Progression | 3 | Moyenne | Faible |
| COMPLETE-017 | Sons propres à chaque véhicule | Polish / feedback | 3 | Moyenne | Faible à moyenne |
| COMPLETE-018 | Débouché des pièces ◆ après le garage complet | Économie | 4 | Faible à moyenne | Faible à moyenne |
| COMPLETE-019 | Ouvrir une copie d'un circuit officiel dans l'éditeur | Éditeur / apprentissage | 4 | Moyenne | Faible |
| COMPLETE-020 | Mode photo | Partage / polish | 4 | Faible à moyenne | Faible |
| COMPLETE-021 | Signature visuelle « pliage » | Identité / polish | 4 | Moyenne | Moyenne |
| COMPLETE-022 | Langues supplémentaires | Portée | 4 | Moyenne | Moyenne (traduction) |
| COMPLETE-023 | Fiche publique de joueur | Communauté | 4 | Faible à moyenne | Moyenne |
| COMPLETE-024 | Direction par inclinaison du téléphone | Contrôles / accessibilité | 4 | Faible à moyenne | Faible à moyenne |

### Fiches

#### COMPLETE-001 — Validation humaine du ressenti, de la difficulté et des médailles · Priorité 1
- **Description** Une campagne d'essais avec de vrais joueurs (débutants et confirmés, clavier, manette, tactile), puis un recalibrage des médailles et de la difficulté à partir des données.
- **Pourquoi** Depuis les lois de conduite mesurées (`PHYS_VER` 36 à 38), la sensation de conduite n'a été vérifiée que par machine (`docs/ARCHITECTURE.md`, « Limites connues ») ; les médailles ont été calées sur un petit groupe (0.13.0). Tout le reste (carrière, saisons, classements) repose sur ces deux réglages.
- **Valeur** Un jeu qui « se sent bien » et des médailles justes ; c'est ce que le joueur perçoit en premier.
- **Impact** Majeur, transversal.
- **Systèmes** Physique (réglages), `js/tracks.js` (médailles), télémétrie (`js/telemetry.js`, `tools/telemetry-report.mjs`), fiche d'essai (`docs/FICHE-ESSAI.md`, `docs/ESSAIS.md`).
- **Risques** Changer la physique change `PHYS_VER` et rend les records non comparables (procédure connue) ; changer les médailles d'un circuit intégré ne change pas sa clé (vérifié : elles ne font pas partie de `encode`), les records restent donc valables.
- **Dépendances** Corrections ÉLEVÉES des phases 1-2 (pour que les testeurs jugent le jeu, pas ses bugs) ; prévu en « phase G » de l'analyse fonctionnelle.
- **Mise en place** Protocole d'essai existant, sessions enregistrées (replays, télémétrie avec accord), décision écrite comme `docs/LOIS-PHYSIQUE.md`.

#### COMPLETE-002 — Contenu officiel qui exploite les systèmes déjà construits · Priorité 1
- **Description** Une série de **nouveaux** circuits officiels (un « deuxième Atelier » ou un chapitre d'extension, ou des circuits saisonniers) bâtis autour de ce que la campagne n'utilise pas : portes et interrupteurs (logique), pièces mobiles, pluie et rafales, ambiances d'auteur, circuits en plusieurs tours, tronçons en moto / bateau / deltaplane, choix de véhicule par bifurcation, revêtements rares.
- **Pourquoi** Mesuré au § F : la campagne n'emploie aucune de ces fonctions ; sans elles, le joueur qui ne construit pas ne les rencontre jamais, alors qu'elles font l'originalité du moteur.
- **Valeur** Découverte, variété, sentiment de jeu riche ; prolonge la campagne là où elle est la plus répétitive (chapitres 6, 7, 10 sans nouveauté).
- **Impact** Majeur sur la perception du jeu ; aucun nouveau système.
- **Systèmes** `js/tracks.js` (script « tortue », qui accepte déjà ces options), `js/career.js`, saisons (`js/seasons.js` tire ses circuits de la carrière).
- **Risques** Ne **jamais modifier** un circuit existant : sa clé de classement changerait, sans migration (records, médailles, verrous). Ajouter des circuits hors du décor Atelier change le tirage des circuits de chaque saison (`seasons.js : seasonTracks` tire dans tous les circuits intégrés sauf l'Atelier), y compris pour la saison en cours, que le serveur vérifie : figer le tirage (liste des circuits éligibles par saison) avant d'en ajouter. Valider chaque circuit au pilote automatique (`tools/contract.mjs`, `tools/golden.mjs`, `tools/medals.mjs`), empreinte et corpus.
- **Dépendances** Corrections TECH-001 (plaques et checkpoints) et TECH-014 (logique en multijoueur) avant de multiplier ces combinaisons.
- **Mise en place** 6 à 12 circuits, chacun centré sur une mécanique, dans l'esprit de l'Atelier actuel ; le format de règles du circuit (`RULES`) porte déjà pluie, vent, logique.

#### COMPLETE-003 — Gestion et récupération de compte · Priorité 1
- **Description** Changer de mot de passe une fois connecté ; un moyen de récupérer un compte (code de secours remis à l'inscription, ou adresse de récupération facultative) ; supprimer un compte existe déjà.
- **Pourquoi** Vérifié : aucune fonction de changement ni de récupération ; le pseudo sert d'adresse technique (`…@accounts.copytrack.invalid`), donc la récupération par courriel du service d'authentification est impossible. Un mot de passe oublié = compte et sauvegarde en ligne perdus.
- **Valeur** Confiance : on n'ose pas investir des heures dans un compte qu'on peut perdre définitivement.
- **Systèmes** `js/account.js`, `supabase/etape4-comptes.sql`, écran Profil.
- **Complexité** Moyenne (côté serveur : fonction de remise à zéro protégée par le code de secours).
- **Risques** Sécurité : le code de secours doit être haché côté serveur, à usage unique, avec limite de débit.

#### COMPLETE-004 — Outils de modération dans le jeu · Priorité 2
- **Description** Pour les modérateurs (table `moderators` existante) : file des contenus signalés, masquer / rétablir un circuit ou un commentaire, voir les signalements, suspendre un compte.
- **Pourquoi** Le jeu publie des contenus de joueurs (circuits, noms, commentaires, playlists) et promet une modération (`js/legal.js`) ; seul le masquage automatique à 3 signalements existe dans le jeu, le reste se fait dans la console de la base.
- **Valeur** Indirecte mais réelle : une communauté saine, des engagements tenus.
- **Complexité** Moyenne (fonctions SQL et un écran réservé).

#### COMPLETE-005 — Déploiement serveur sûr et automatique · Priorité 2
- **Description** À chaque publication du site, construire et déployer `submit-score` et `ice`, vérifier l'empreinte (`tools/check-deployed.mjs`), et contrôler la base (`supabase/verify-prod.sql`, lisibilité des colonnes comprise : TECH-021).
- **Pourquoi** Aujourd'hui, toute modification de la physique, des circuits intégrés ou du défi du jour ouvre une fenêtre où **tous les temps sont refusés** tant que la fonction n'est pas redéployée à la main (`supabase/MIGRATIONS.md`).
- **Valeur** Les classements ne tombent plus en panne à chaque mise à jour.
- **Complexité** Moyenne (secrets de déploiement, ordre site / fonction / base).

#### COMPLETE-006 — Identité musicale par décor · Priorité 2
- **Description** Décliner le moteur de musique procédurale (`js/AudioEngine.js`) en 12 variantes : tempo, tonalité, instruments, motif propres à chaque décor ; garder l'intensité qui suit la vitesse.
- **Pourquoi** Une seule musique de course pour 72 circuits et 12 décors, une seule de menu ; aucune ambiance d'auteur sur les circuits officiels. Sur des heures de jeu, c'est la principale source de monotonie sensorielle.
- **Valeur** Personnalité des mondes, fatigue réduite.
- **Complexité** Moyenne ; aucun fichier audio (le moteur est déjà procédural), aucune incidence sur la physique.

#### COMPLETE-007 — Introduction progressive des mécaniques · Priorité 2
- **Description** À la **première** rencontre d'une mécanique (revêtement, plaque, obstacle, gravité, mur), une carte « Nouveau » sur la fiche du circuit et un rappel discret en course ; un index « Mécaniques découvertes » dans le profil.
- **Pourquoi** Le chapitre 1 introduit 9 mécaniques ; la fiche dit ce que le circuit « apprend » mais pas comment s'en servir ; l'explication est surtout dans le wiki, hors du jeu.
- **Valeur** Prise en main sans quitter le jeu ; moins d'échecs incompris.
- **Systèmes** `js/trackDescriptor.js`, `js/app/raceHub.js`, `js/hudMessages.js`, profil.
- **Complexité** Faible à moyenne. **Sans** déplacer les circuits existants (clés).

#### COMPLETE-008 — Académie étendue · Priorité 2
- **Description** Une courte leçon par famille : gravité et inversion, murs et plafonds, eau et bateau, deltaplane, verre, aimant, obstacles animés, portes logiques ; puis un exercice noté pour les plus techniques.
- **Pourquoi** 6 leçons et 4 exercices couvrent la conduite, le dérapage, la réception, une plaque et les obstacles ; le reste n'a pas de lieu d'apprentissage.
- **Complexité** Moyenne (le cadre `js/academy.js`, `js/skills.js`, `analysis/drill.js` existe).

#### COMPLETE-009 — Fantôme de la médaille suivante · Priorité 2
- **Description** Toujours montrer le fantôme de la prochaine médaille à gagner (bronze → argent → or → cristal), au lieu du seul fantôme or tant que l'or n'est pas gagné.
- **Pourquoi** Après l'or, plus aucune cible visible (`race/ghosts.js : _setupGhosts`), alors que le cristal est la vraie épreuve de maîtrise.
- **Valeur** Une cible concrète à chaque essai ; s'appuie sur le HUD d'entraînement et le coach.
- **Complexité** Faible à moyenne : fantômes officiels enregistrés par niveau, ou pilote automatique réglé pour chaque médaille.

#### COMPLETE-010 — Fonctions sociales vivantes avec peu de joueurs · Priorité 2
- **Description** Amorcer chaque classement avec des temps et fantômes officiels (développeur, testeurs, pilote automatique à plusieurs niveaux) ; proposer le **rival juste devant** le joueur ; permettre duels et saisons contre ces fantômes ; compléter les salons multijoueur par des fantômes.
- **Pourquoi** Saisons et divisions, duels, tournois, salons publics, classements, communauté supposent du monde ; le jeu est déjà fait pour l'asynchrone (rejeu vérifié, fantômes du haut du classement).
- **Valeur** Le jeu paraît habité dès le premier jour.
- **Risques** Marquer clairement ce qui est officiel ou automatique ; ne pas fausser les divisions réelles.
- **Complexité** Moyenne à élevée (données officielles, règles côté base).

#### COMPLETE-011 — Rythme de la carrière · Priorité 3
- **Description** Dans les **nouveaux** circuits (COMPLETE-002) et l'ordre de présentation : circuits « respiration » dans les chapitres avancés, nouveautés réparties (aujourd'hui 9 au chapitre 1, 0 aux chapitres 6, 7, 10).
- **Risques** L'ordre et le contenu des circuits existants ne se touchent pas sans perdre leurs records.

#### COMPLETE-012 — Objectifs bonus variés et liés à chaque circuit · Priorité 3
- **Description** Des objectifs qui reprennent ce que le circuit enseigne (temps en l'air, mini-turbos dans une section, prendre la bifurcation difficile, vitesse maximale, secteur sous un temps) ; éventuellement deux ou trois par circuit.
- **Pourquoi** 29 objectifs sur 72 sont « sans réapparition ».
- **Systèmes** `js/career.js` (`GOALS`, `goalMet`), statistiques de course, `analysis/` (déjà capable de mesurer secteurs et évènements).
- **Complexité** Moyenne.

#### COMPLETE-013 — Fin de carrière : épreuve finale et bilan · Priorité 3
- **Description** Une épreuve finale qui reprend les mécaniques de la campagne, un bilan de carrière (temps cumulé, médailles, cristaux, objectifs, records battus) et un générique.
- **Pourquoi** Le jeu s'arrête aujourd'hui sur « il n'y a plus rien à finir ici ».
- **Complexité** Moyenne.

#### COMPLETE-014 — Épreuve « chapitre d'une traite » · Priorité 3
- **Description** Enchaîner les 6 circuits d'un chapitre (ou toute la carrière) avec temps cumulé et classement dédié.
- **Pourquoi** Rejouabilité de maîtrise naturelle du genre ; réutilise le mécanisme de manches du championnat et les catégories de record.
- **Complexité** Moyenne (clé de classement composée, rejeu serveur de plusieurs courses).

#### COMPLETE-015 — Boîte de réception · Priorité 3
- **Description** À l'ouverture : « X a battu ton temps sur Y », duels en attente, nouvelle saison, circuit d'un auteur suivi publié.
- **Pourquoi** Rien aujourd'hui ne signale qu'un autre joueur a progressé : c'est la première raison de revenir dans un jeu de records.
- **Complexité** Moyenne (requêtes sur les classements et les abonnements existants ; pas de notifications système nécessaires).

#### COMPLETE-016 — Progression de niveau récompensée jusqu'au bout · Priorité 3
- **Description** Une récompense (cosmétique, titre, cadre) à intervalles réguliers jusqu'au niveau 50.
- **Pourquoi** 4 récompenses (niveaux 5, 10, 20, 30) pour 50 niveaux.
- **Complexité** Faible (`js/progression.js : LEVEL_REWARDS`).

#### COMPLETE-017 — Sons propres à chaque véhicule · Priorité 3
- **Description** Timbre de moteur différent pour la moto, sillage et clapot pour le bateau, souffle pour le deltaplane.
- **Pourquoi** Vérifié : `js/audio.js` n'a qu'un moteur, quel que soit le véhicule.
- **Complexité** Faible à moyenne (synthèse).

#### COMPLETE-018 — Débouché des pièces ◆ · Priorité 4
- **Description** Nouvelles séries cosmétiques (saisonnières, liées aux décors), sans aucun avantage de course.
- **Pourquoi** Le garage entier (12 000 ◆) est acquis bien avant la fin ; les pièces cessent d'avoir un sens.

#### COMPLETE-019 — Ouvrir une copie d'un circuit officiel dans l'éditeur · Priorité 4
- **Pourquoi** On ne peut ouvrir que ses propres circuits ou un lien partagé ; les circuits officiels sont les meilleurs exemples de level design.
- **Complexité** Faible (la copie a sa propre clé `u-…`).

#### COMPLETE-020 — Mode photo · Priorité 4
- **Description** Depuis la caméra libre du Replay Theater : masquer le HUD, enregistrer une image.
- **Complexité** Faible.

#### COMPLETE-021 — Signature visuelle « pliage » · Priorité 4
- **Description** Le circuit qui se « déplie » au départ, des transitions d'écran en facettes, la pose d'une pièce animée dans l'éditeur : un écho au nom.
- **Complexité** Moyenne ; purement visuel.

#### COMPLETE-022 — Langues supplémentaires · Priorité 4
- **Pourquoi** L'infrastructure (dictionnaire par domaine, traducteur) est prête ; deux langues seulement.
- **Risque** Le traducteur DOM s'applique aussi aux contenus des joueurs (`../comprendre/04-systemes.md` § 4.4) : à corriger avant d'ajouter des langues.

#### COMPLETE-023 — Fiche publique de joueur · Priorité 4
- **Description** Titre, médailles, records notables, circuits publiés, abonnés ; reprend un point « fort intérêt » de l'analyse fonctionnelle.

#### COMPLETE-024 — Direction par inclinaison du téléphone · Priorité 4
- **Pourquoi** Alternative naturelle au glisser sur téléphone ; déjà citée en bonus par l'analyse fonctionnelle.
- **Risque** Les commandes restent quantifiées et enregistrées comme les autres (rejeu inchangé).

---

## L. Les 10 améliorations les plus importantes

1. **COMPLETE-001 — Validation humaine.** Tout le reste (carrière, médailles, saisons, classements) suppose une conduite agréable et des médailles justes ; c'est le seul grand pan du jeu jamais vérifié par des joueurs depuis la refonte des lois de conduite.
2. **COMPLETE-002 — Contenu officiel qui exploite le moteur.** Le plus grand écart du projet : des systèmes riches et testés que le joueur ne rencontre jamais. Aucun nouveau système à écrire ; un impact maximal sur la perception du jeu.
3. **COMPLETE-010 — Social vivant avec peu de joueurs.** Sans lui, saisons, duels, salons et classements risquent de paraître vides ; avec lui, le jeu tire parti de ce qu'il fait déjà le mieux (les fantômes vérifiés).
4. **COMPLETE-007 — Introduction progressive des mécaniques.** Neuf nouveautés au chapitre 1 et des explications surtout hors du jeu : c'est là que se jouent les premières minutes, et donc la rétention.
5. **COMPLETE-009 — Fantôme de la médaille suivante.** Peu coûteux, il donne une cible à chaque essai et prolonge naturellement la vie de chacun des 72 circuits.
6. **COMPLETE-006 — Identité musicale par décor.** Une seule musique de course pendant des heures ; le moteur procédural rend la variation possible sans fichiers ni droits.
7. **COMPLETE-003 — Gestion et récupération de compte.** Un compte qu'on peut perdre sans recours décourage d'en créer un, et donc d'utiliser la sauvegarde en ligne et la communauté.
8. **COMPLETE-005 — Déploiement serveur sûr.** Chaque mise à jour peut aujourd'hui casser les classements ; c'est le socle des fonctions en ligne qui font la valeur des records.
9. **COMPLETE-013 — Fin de carrière.** Donne au parcours principal une conclusion et un sentiment d'accomplissement, que le jeu n'offre pas aujourd'hui.
10. **COMPLETE-012 — Objectifs variés.** Transforme 72 objectifs majoritairement identiques en autant de petits défis qui font rejouer chaque circuit autrement.

Juste après : COMPLETE-008 (Académie étendue), COMPLETE-015 (boîte de réception), COMPLETE-004 (modération).

---

## M. Ce qui n'est PAS nécessaire

| Tentation | Pourquoi s'en abstenir |
| --- | --- |
| **Adversaires IA en course** (voitures pilotées qui se battent avec le joueur) | Le genre est le contre-la-montre ; les fantômes (record, médailles, rivaux, classements) remplissent ce rôle sans fausser la course. Le pilote automatique sert mieux comme **fantôme** (COMPLETE-009, 010) que comme adversaire. |
| **Améliorations de performance des véhicules** (moteur, adhérence achetables) | Casseraient l'équité, les classements vérifiés et la physique commune ; le garage doit rester purement visuel. |
| **Plus de types de pièces** | 449 types, dont 92 utilisés par la campagne : le besoin est d'**exploiter** les pièces, pas d'en ajouter. |
| **Plus de modes et de règles** | 6 modes, 9 catégories, mods, saisons, duels, tournois : déjà plus que ce que la population peut faire vivre. |
| **Plus de circuits « pour le nombre »** | 72 circuits, un défi quotidien, l'éditeur : n'ajouter que des circuits qui montrent quelque chose de neuf (COMPLETE-002). |
| **Modes multijoueur supplémentaires** (élimination, équipes), **spectateur**, **émotes**, **vote**, **écran partagé** | Pertinents seulement avec une base de joueurs active ; à reconsidérer après COMPLETE-010 et une mesure de fréquentation. |
| **Scénario, personnages, monde ouvert** | Hors de l'identité du jeu ; la progression par décors et médailles suffit. |
| **Récompenses de connexion, coffres, monnaie premium** | Contraires au respect du joueur qui fait partie de l'identité du projet. |
| **Applications natives** | Le jeu s'installe déjà comme application et joue hors ligne. |
| **Météo, logique, véhicules supplémentaires** | Les systèmes existent ; ils manquent dans le contenu, pas dans le moteur. |

**Quand s'arrêter.** Une fois corrigés les bugs des phases 1 et 2 et réalisées les recommandations de priorité 1 et 2, le jeu peut être considéré comme **complet** : la suite relève du contenu (nouveaux circuits, saisons) et de la vie de la communauté, pas de nouveaux systèmes. Le risque principal du projet n'est plus le manque de fonctionnalités, c'est leur nombre : chaque nouveau système ajoute de la surface à maintenir, à tester et à expliquer.
