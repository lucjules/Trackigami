# Audit complet de Trackigami — document de consolidation

**Version auditée** bêta 0.16.0 · `PHYS_VER` 38 · `NET_VER` 4 · branche `ccr-9cfa4501-wu4sko` (commit de base `f7bdf7b`).
**Rôle** Référence unique pour la phase de correction : chaque problème, chaque manque et chaque recommandation y figure avec son identifiant stable, sa priorité globale, son niveau de certitude, ses conditions, ses relations, une validation et un lot de correction. Les fiches des rapports d'origine y sont **reprises sans perte** (rubrique « Détail d'origine ») : il n'est pas nécessaire de relire les phases 1 à 3 pour traiter une entrée.
**Ce document ne corrige rien.** Aucun fichier du jeu, aucun asset, aucune configuration n'a été modifié ; aucun commit.

**Sources** [PHASE1-AUDIT-TECHNIQUE.md](PHASE1-AUDIT-TECHNIQUE.md) (89 problèmes) · [PHASE2-AUDIT-EN-JEU.md](PHASE2-AUDIT-EN-JEU.md) (9 constats, dont 5 fusionnés avec la phase 1) · [PHASE3-AUDIT-COMPLETUDE.md](PHASE3-AUDIT-COMPLETUDE.md) (24 recommandations) · [../comprendre/](../comprendre/README.md) (documentation de compréhension, reprise en annexes 6 à 11 ; écarts doc ↔ code). Limites et lacunes de ces sources : annexe 1.

## Sommaire

- [A. Vue d'ensemble](#a-vue-densemble)
- [Index général](#index-général)
- [B. Problèmes techniques](#b-problèmes-techniques)
- [C. Problèmes de gameplay et problèmes visibles](#c-problèmes-de-gameplay-et-problèmes-visibles)
- [D. Fonctionnalités et éléments manquants](#d-fonctionnalités-et-éléments-manquants)
- [E. Problèmes transversaux](#e-problèmes-transversaux)
- [F. Priorisation générale](#f-priorisation-générale)
- [G. Plan de travail recommandé](#g-plan-de-travail-recommandé)
- [H. Tests et validation](#h-tests-et-validation)
- [Vérification de la consolidation](#vérification-de-la-consolidation)
- Annexes 1 à 5 (sources, méthode, synthèse de la phase 1, phase 2, anciens numéros)
- Annexes 6 à 11 (documentation de compréhension : architecture, simulation, course, systèmes, interactions et zones sensibles)

## A. Vue d'ensemble

### A.1 État général du projet

Le jeu est **fonctionnellement complet et techniquement solide en son cœur**, mais **fragile aux frontières entre systèmes**.

- **Cœur de simulation** : déterministe et vérifié (1 755 vérifications automatiques au vert, exécutées pendant l'audit sur Node ; l'identité de l'empreinte de physique sous Deno et Chromium est garantie par la CI du dépôt mais n'a pas été rejouée ici : ni Deno ni exécution de la CI) ; une vraie course jouée dans le navigateur, avec retours au checkpoint au clavier, est retrouvée **au bit près** par le rejeu qu'utilise le serveur (51,450 s et 61,675 s sur deux circuits, dont un à obstacles). Aucun raccourci de tracé trouvé (9 tentatives ciblées sur 7 circuits), aucun checkpoint sauté par un pilote 30 % plus rapide, les 72 circuits finis par le pilote automatique, 71 objectifs bonus sur 72 atteints par un pilote qui ne les cherche pas (le 72e est faisable), leçons de l'Académie atteignables, 60 défis du jour générés. Ce sont des essais automatiques, pas des essais humains.
- **Défauts** : ils naissent de **combinaisons** (plaque de transformation + checkpoint, vitesse de départ + retour, obstacle au plafond + vérification), d'**états partagés** (touches, stockage, onglets, session), du **multijoueur à plusieurs** (état de salle, présence, identité), de la **synchronisation entre appareils**, et d'un **contenu officiel qui n'exerce qu'une petite partie du moteur**.
- **Bilan chiffré** : 129 entrées au total — **105 problèmes** (89 techniques de la phase 1, 4 nouveaux de la phase 2, 2 risques structurels, 10 écarts de documentation) et **24 recommandations** de complétude. Aucun problème P0.

| Priorité | Problèmes | Recommandations | Total |
| --- | --- | --- | --- |
| P0 | 0 | 0 | 0 |
| P1 | 13 | 4 | 17 |
| P2 | 41 | 6 | 47 |
| P3 | 51 | 7 | 58 |
| P4 | 0 | 7 | 7 |
| **Total** | **105** | **24** | **129** |

Les 98 identifiants de problèmes des rapports (TECH 89 + GAME 9) se ramènent à 93 problèmes distincts une fois fusionnés les cinq GAME qui décrivent un TECH ; GAME-001, -002, -003, -005 et -009 sont les manifestations en jeu de TECH-001, -008, -009, -013 et -002 (voir les entrées correspondantes).

### A.2 Points forts à préserver

- **Équité des classements** : physique déterministe, temps vérifiés par rejeu serveur, aucune amélioration de performance achetable ; toute correction doit préserver cette propriété.
- **Analyse de course** (Replay Theater, coach chiffré, HUD d'entraînement, laboratoire) ; **éditeur** (449 pièces, logique, groupes, prefabs, vérification d'auteur, publication) ; **mécaniques signature** (gravité retournable, murs, plafonds, quatre véhicules, 19 revêtements).
- **Respect du joueur** (cosmétique seulement, accord pour les statistiques, export des données, hors ligne) ; **accessibilité large** ; **culture de la fiabilité** (tests, empreinte, corpus de compatibilité).
- Détail : reprise intégrale de l'analyse de la phase 3 en D.5.

### A.3 Principales faiblesses

1. **Blocages de partie par combinaison de mécaniques** : TECH-001 (plaques + checkpoints), TECH-013 (vitesse de départ), TECH-002 (obstacle au plafond : circuit impossible à publier et à classer).
2. **Entrées partagées entre l'interface et la course** : une touche ou un bouton relance la course, redéfinit des touches ou agit sous une fenêtre (TECH-004, 005, 006, 017).
3. **Multijoueur à plusieurs** : salons qui lancent les invités, joueurs invisibles, hôte absent qui bloque ou ferme la salle, présence mal suivie (TECH-008 à 012 et vingt autres entrées).
4. **Synchronisation et persistance** : résultats d'écriture ignorés, fusions incomplètes, aucune coordination entre onglets (TECH-007, 022 à 030).
5. **Contenu officiel qui n'exploite pas le moteur** (92 types de pièces sur 449 ; aucune logique, pluie, ambiance d'auteur) ; **ressenti et médailles jamais validés par des joueurs** depuis la refonte des lois de conduite (COMPLETE-001, 002).
6. **Exploitation** : fonction serveur à redéployer à la main (fenêtre où tous les temps sont refusés), droits SQL non contrôlés, aucune modération en jeu, aucun moyen de récupérer un compte (COMPLETE-003, 004, 005).

### A.4 Systèmes les plus fragiles

| Système | Pourquoi | Entrées |
| --- | --- | --- |
| Multijoueur (`js/net/`, `app/multi.js`, `race/net.js`) | 25 TECH (plus GAME-008) : état de salle sans numéro de lancement, identité déclarée, présence par clé | TECH-008…012, 040…051, 082…089, GAME-008 |
| Synchronisation et persistance (`account.js`, `cloudsave.js`, `profile.js`, `storage.js`) | résultats d'écriture ignorés, fusion incomplète, onglets non coordonnés | TECH-007, 022…030, 074, 075, 077, 078 |
| Éditeur (`editor/tools.js`, `inspector/*`, `history.js`) | plusieurs chemins de modification qui ne passent pas par les mêmes contrôles | TECH-003, 033…038, 052…062 |
| Entrées et superpositions (`input.js`, `ui.js`, `main.js`, `wiring.js`) | un seul état de touches partagé par le DOM, la course et l'éditeur | TECH-004, 005, 006, 017, 020, 065 |
| Noyau de simulation (fermeture de `verify.js`) | toute modification change temps, replays, fantômes, empreinte, et exige un redéploiement manuel du serveur | TECH-001, 013, 014, GAME-004 |

### A.5 Risques majeurs pour la stabilité

- **Toute correction du noyau** (TECH-001, 013, 014, GAME-004) change `PHYS_VER` : records anciens non rejouables, empreinte, temps de référence, médailles, corpus, **redéploiement manuel** de `submit-score` avec une fenêtre où tous les temps sont refusés (voir F, G, H et COMPLETE-005).
- **Toute correction de signature ou de clé** (TECH-002, 039) change des clés de circuits existants (records locaux, classements, `track_binds`).
- **Modifier un circuit intégré** change sa clé sans migration (RISK-001).
- **Le traducteur anglais** agit sur les contenus de joueurs (RISK-002).
- **Les deux chemins de pas** (course en direct et rejeu) sont équivalents aujourd'hui ; aucun test automatique ne le garantit de bout en bout.
- **Production non vérifiée** : droits SQL réels, comportement de Supabase Realtime, limites d'inscriptions anonymes (LOT-0).

### A.6 Synthèse des problèmes et opportunités les plus importants

Les dix chantiers prioritaires sont au § G.1. Les opportunités majeures (D.5, partie E de la phase 3) : faire de la campagne la vitrine du moteur (COMPLETE-002), garder les fonctions sociales vivantes avec peu de joueurs (COMPLETE-010), donner une cible visible à chaque circuit (COMPLETE-009, 012), une identité sonore par décor (COMPLETE-006).

## Index général

Une ligne par entrée (tous types). Les entrées sont détaillées dans la section indiquée par le type : B pour les bugs techniques, sécurité, risques et documentation ; C pour les bugs de gameplay et problèmes visibles ; D pour les recommandations ; E pour les transversaux.

| ID | Titre | Type | Priorité | Certitude | Lot |
| --- | --- | --- | --- | --- | --- |
| COMPLETE-001 | Validation humaine du ressenti, de la difficulté et des médailles | Amélioration | P1 | — | LOT-9 |
| COMPLETE-002 | Contenu officiel qui exploite les systèmes déjà construits | Fonctionnalité manquante | P1 | — | LOT-9 |
| COMPLETE-003 | Gestion et récupération de compte | Fonctionnalité manquante | P1 | — | LOT-6 |
| COMPLETE-005 | Déploiement serveur sûr et automatique | Amélioration | P1 | — | LOT-7 |
| TECH-001 | Réapparition sur une plaque de transformation : le véhicule redevient voiture, boucle de réapp… | Bug gameplay | P1 | Reproduit | LOT-4 |
| TECH-002 | Obstacle roulé de 180° : signe du roulis inversé à chaque lecture, clé et vérification instabl… | Bug gameplay | P1 | Reproduit | LOT-5 |
| TECH-003 | Éditeur : la pose supprime des pièces que la nouvelle pièce ne touche pas | Bug gameplay | P1 | Confirmé | LOT-3 |
| TECH-004 | Entrée sur un bouton de la pause (ou de l'arrivée, du replay) relance la course | Bug gameplay | P1 | Confirmé | LOT-2 |
| TECH-005 | Manette : bouton A tenu = « valider » dès qu'une superposition s'ouvre (pause impossible, cour… | Bug gameplay | P1 | Confirmé | LOT-2 |
| TECH-006 | Capture de touche en attente qui survit à la navigation : touches réassignées à l'insu du joue… | Bug gameplay | P1 | Confirmé | LOT-2 |
| TECH-007 | Synchronisation du compte : sauvegarde fusionnée trop grosse → boucle sans fin, progression in… | Bug technique | P1 | Confirmé | LOT-6 |
| TECH-008 | Multijoueur : `Room.started` jamais remis à faux → invités du salon lancés en course à chaque … | Bug gameplay | P1 | Reproduit | LOT-8a |
| TECH-009 | Multijoueur : un joueur arrivé (ou revenu) pendant une course n'apparaît jamais | Bug gameplay | P1 | Reproduit | LOT-8c |
| TECH-010 | Multijoueur : hôte absent ou qui recharge → manches bloquées, « Salle introuvable », salle déf… | Bug gameplay | P1 | Confirmé | LOT-8b |
| TECH-011 | Multijoueur : un départ de présence efface le joueur même s'il a encore une connexion | Bug technique | P1 | Très probable | LOT-8b |
| TECH-012 | Multijoueur : fermeture du canal, erreur, jeton expiré ignorés → joueur isolé dans une salle m… | Bug technique | P1 | Très probable | LOT-8b |
| TECH-030 | Import d'un code joueur en « Fusionner » : écrase la progression locale, accepte des records i… | Bug technique | P1 | Confirmé | LOT-6 |
| COMPLETE-004 | Outils de modération dans le jeu | Fonctionnalité manquante | P2 | — | LOT-7 |
| COMPLETE-006 | Identité musicale par décor | Amélioration | P2 | — | LOT-11b |
| COMPLETE-007 | Introduction progressive des mécaniques | Fonctionnalité manquante | P2 | — | LOT-11b |
| COMPLETE-008 | Académie étendue à toutes les familles de mécaniques | Fonctionnalité manquante | P2 | — | LOT-11b |
| COMPLETE-009 | Fantôme de la médaille suivante | Fonctionnalité manquante | P2 | — | LOT-11a |
| COMPLETE-010 | Fonctions sociales vivantes avec peu de joueurs | Fonctionnalité manquante | P2 | — | LOT-11c |
| GAME-004 | Téléportation de 59 m sur un double looping pendant une chute | Bug gameplay | P2 | Reproduit (simulation) | LOT-4 |
| GAME-006 | Catégories de record « départ en bateau » (et « en deltaplane ») proposées sur des circuits pr… | Bug gameplay | P2 | Probable / À vérifier | LOT-9 |
| RISK-001 | Modifier un circuit intégré en change la clé : progression perdue, aucune migration | Bug technique | P2 | Confirmé | LOT-12 |
| TECH-013 | Vitesse de départ (`v0`) perdue au retour au point de départ | Bug gameplay | P2 | Reproduit | LOT-4 |
| TECH-014 | Multijoueur : règles de logique déclenchées par le temps jamais rejouées après un retour au ch… | Bug gameplay | P2 | Confirmé | LOT-4 |
| TECH-015 | Reprise après erreur de la boucle : retour au checkpoint non enregistré, record non rejouable | Bug gameplay | P2 | Confirmé | LOT-2 |
| TECH-016 | Exception dans la construction d'une course : jeu figé (mode « course » sans session) | Bug gameplay | P2 | Confirmé | LOT-2 |
| TECH-017 | Commandes de course actives sous une fenêtre ouverte | Bug gameplay | P2 | Confirmé | LOT-2 |
| TECH-018 | Résultat en ligne d'une course précédente affiché sur l'arrivée suivante | Bug gameplay | P2 | Confirmé | LOT-2 |
| TECH-019 | Dalle de verre brisée de nouveau visible alors qu'elle n'a plus de collision | Bug gameplay | P2 | Confirmé | LOT-10 |
| TECH-020 | Boutons tactiles liés en dur à `KeyR`, `Escape`, `Enter` (et textes d'aide figés) | Bug gameplay | P2 | Confirmé | LOT-2 |
| TECH-021 | Classement mondial dégradé : colonne `ghost_veh` jamais autorisée en lecture | Bug gameplay | P2 | Confirmé | LOT-7 |
| TECH-022 | Records d'essai de l'éditeur (`e-…`) jamais purgés, synchronisés, qui saturent le stockage | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-023 | Écriture faite pendant une synchronisation : jamais envoyée | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-024 | « Garder ma progression » à l'inscription : échec silencieux, bibliothèques non copiées | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-025 | Déconnexion : identité anonyme de l'invité abandonnée, ses données orphelines | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-026 | Deux onglets : jeton de renouvellement périmé → nouvelle identité d'invité, ou déconnexion du … | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-027 | Deux onglets : le cache du profil d'un onglet écrase la progression de l'autre | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-028 | Objectifs bonus non fusionnés entre appareils (récompense payée deux fois, pas de convergence) | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-029 | Fusion des pièces ◆ : des pièces gagnées sont perdues, des objets offerts sont déduits | Bug technique | P2 | Confirmé | LOT-6 |
| TECH-031 | Chaque lecture en ligne crée un joueur anonyme | Bug technique | P2 | Confirmé | LOT-7 |
| TECH-032 | Export des données (RGPD) : les temps échouent toujours, les « j'aime » manquent | Bug technique | P2 | Confirmé | LOT-7 |
| TECH-033 | Éditeur : raccourcis Ctrl actifs sous les fenêtres | Bug gameplay | P2 | Confirmé | LOT-3 |
| TECH-034 | Éditeur : retour d'essai qui perd historique, presse-papiers, calques | Bug gameplay | P2 | Confirmé | LOT-3 |
| TECH-035 | Éditeur : décorations modifiées sans normalisation (rétablir perdu, « modifié » à tort, solide… | Bug gameplay | P2 | Confirmé | LOT-3 |
| TECH-036 | Éditeur : la gomme supprime des décorations de calques verrouillés ou masqués | Bug gameplay | P2 | Confirmé | LOT-3 |
| TECH-037 | Éditeur : déplacer une pièce au gizmo change son demi-niveau | Bug gameplay | P2 | Confirmé | LOT-3 |
| TECH-038 | Éditeur : un groupe utilisé seulement par la logique est considéré libre | Bug gameplay | P2 | Confirmé | LOT-3 |
| TECH-039 | Signature : collisions de clés entre circuits physiquement différents | Bug technique | P2 | Confirmé | LOT-5 |
| TECH-040 | Multijoueur : identité déclarée par le client (prise d'une place ou du rôle d'hôte) | Bug technique | P2 | Confirmé | LOT-8d |
| TECH-041 | Multijoueur : collisions douces jusqu'à 8 m/s par pas, cumulées | Bug gameplay | P2 | Confirmé | LOT-8c |
| TECH-042 | Multijoueur : temps d'arrivée (course libre) attribué au mauvais circuit | Bug gameplay | P2 | Confirmé | LOT-8a |
| TECH-043 | Multijoueur : voitures distantes figées mais toujours collisionnables | Bug gameplay | P2 | Confirmé | LOT-8c |
| TECH-044 | Multijoueur : connexion de signalisation fantôme après un délai dépassé | Bug technique | P2 | Confirmé | LOT-8b |
| TECH-045 | Multijoueur : tout message de signalisation ouvre un lien (places épuisables) | Bug technique | P2 | Confirmé | LOT-8b |
| TECH-046 | Multijoueur : une coupure de la signalisation coupe tous les liens de jeu sains | Bug gameplay | P2 | Confirmé | LOT-8b |
| TECH-047 | Multijoueur : fin de manche manquée jamais signalée au joueur revenu | Bug gameplay | P2 | Confirmé | LOT-8a |
| TECH-048 | Multijoueur : migration d'hôte après une fin de manche manquée → classements divergents | Bug technique | P2 | Confirmé | LOT-8a |
| TECH-049 | Multijoueur : deux chargements de circuit concurrents, le dernier arrivé gagne | Bug gameplay | P2 | Confirmé | LOT-8a |
| TECH-050 | Multijoueur : serveurs ICE / TURN demandés une seule fois par salle | Bug technique | P2 | À vérifier | LOT-8b |
| TECH-051 | Multijoueur : adresses IP des joueurs diffusées à tous les abonnés du canal | Bug technique | P2 | Confirmé | LOT-8d |
| COMPLETE-011 | Rythme de la carrière (respirations, nouveautés réparties) | Amélioration | P3 | — | LOT-11a |
| COMPLETE-012 | Objectifs bonus variés et liés à chaque circuit | Amélioration | P3 | — | LOT-11a |
| COMPLETE-013 | Fin de carrière : épreuve finale et bilan | Fonctionnalité manquante | P3 | — | LOT-11a |
| COMPLETE-014 | Épreuve « chapitre d'une traite » | Fonctionnalité manquante | P3 | — | LOT-11a |
| COMPLETE-015 | Boîte de réception : « ton temps a été battu », duels en attente, nouvelle saison | Fonctionnalité manquante | P3 | — | LOT-11c |
| COMPLETE-016 | Progression de niveau récompensée jusqu'au bout | Amélioration | P3 | — | LOT-11a |
| COMPLETE-017 | Sons propres à chaque véhicule | Polish | P3 | — | LOT-11b |
| DOC-001 | `docs/ARCHITECTURE.md` (« Physique : règles communes ») : sur les routes roulées et les loopin… | Polish | P3 | Confirmé | LOT-12 |
| DOC-002 | `docs/ARCHITECTURE.md` : 182 scénarios (« Déterminisme ») et 161 (« Limites connues ») | Polish | P3 | Confirmé | LOT-12 |
| DOC-003 | `docs/ARCHITECTURE.md` (« Limites connues ») : Firefox et Safari pas essayés ; STUN seulement | Polish | P3 | Confirmé | LOT-12 |
| DOC-004 | `docs/ARCHITECTURE.md` (« Données et formats ») : la signature ignore le thème | Polish | P3 | Confirmé | LOT-12 |
| DOC-005 | `docs/ARCHITECTURE.md` (« Serveur ») : tables dans `etape1…5` | Polish | P3 | Confirmé | LOT-12 |
| DOC-006 | `docs/ARCHITECTURE.md` : records sous `shardway.rec3.*` | Polish | P3 | Confirmé | LOT-12 |
| DOC-007 | `js/verify.js` (en-tête) et donc `docs/MODULES.md` : la fonction serveur « le charge depuis le… | Polish | P3 | Confirmé | LOT-12 |
| DOC-008 | `js/joins.js` (en-tête) : utilisé par l'éditeur | Polish | P3 | Confirmé | LOT-12 |
| DOC-009 | `supabase/MULTI.md` : collisions plafonnées à ~4 g ; deux modes de salon | Polish | P3 | Confirmé | LOT-12 |
| DOC-010 | `supabase/COMPTES.md` (fin) : le temps de l'auteur est « vérifié par le jeu à la publication m… | Polish | P3 | Confirmé | LOT-12 |
| GAME-007 | Longs tronçons sans checkpoint : une chute près de la fin coûte presque toute la course | Bug gameplay | P3 | Reproduit | LOT-9 |
| GAME-008 | Arrivant pendant une « Course » (championnat d'une manche) : salon sans circuit affiché | Bug gameplay | P3 | Reproduit | LOT-8a |
| RISK-002 | Le traducteur DOM anglais agit aussi sur les contenus des joueurs | Bug technique | P3 | Confirmé | LOT-12 |
| TECH-052 | Éditeur : réservation des bords de pente au mur contournable | Bug gameplay | P3 | Confirmé | LOT-3 |
| TECH-053 | Éditeur : « Prolonger » peut poser plusieurs départs | Bug gameplay | P3 | Confirmé | LOT-3 |
| TECH-054 | Éditeur : calques gardés au chargement d'un autre circuit ; annuler garde la vérification cour… | Bug gameplay | P3 | Confirmé | LOT-3 |
| TECH-055 | Éditeur : test depuis le curseur en gravité inversée sur un circuit `flip0` | Bug gameplay | P3 | Très probable | LOT-3 |
| TECH-056 | Éditeur : la fenêtre « Circuit » arrondit la direction du vent (15° → 45°) | Bug gameplay | P3 | Confirmé | LOT-3 |
| TECH-057 | Éditeur : « Tout sélectionner » oublie les décorations hors des pièces | Bug gameplay | P3 | Confirmé | LOT-3 |
| TECH-058 | Éditeur : le collage garde les numéros de groupe | Bug gameplay | P3 | Confirmé | LOT-3 |
| TECH-059 | Éditeur : impossible de sortir si l'enregistrement automatique échoue | Bug gameplay | P3 | Confirmé | LOT-3 |
| TECH-060 | Lecture d'un code : décorations inconnues perdues sans blocage | Bug technique | P3 | Confirmé | LOT-5 |
| TECH-061 | Miniature périmée dans la fiche d'un circuit | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-062 | Éditeur : la vue par niveau montre les calques masqués | Polish / petit défaut visible | P3 | Confirmé | LOT-3 |
| TECH-063 | Garage : minuterie non annulée → voiture orpheline dans la scène suivante | Bug technique | P3 | Confirmé | LOT-10 |
| TECH-064 | Aides à la conduite : bouton « Fiche du circuit » absent à l'arrivée | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-065 | Échap : panneau de l'accueil non restauré ; aucun effet dans le garage | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-066 | Réponse du serveur après avoir quitté la course : panneau ouvert refermé, liste reconstruite | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-067 | Démonstration du menu : vibrations du téléphone et de la manette | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-068 | Replay Theater : nom de caméra affiché faux | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-069 | Replay Theater : déplacement dans le temps sans les scripts, effets de logique joués en rafale | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-070 | Messages du HUD : verrou de priorité non remis à zéro au redémarrage | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-071 | Anglais : texte français dans la ligne de récompense de l'arrivée | Polish / petit défaut visible | P3 | Confirmé | LOT-10 |
| TECH-072 | Message « hors piste » au moment de l'arrivée | Polish / petit défaut visible | P3 | À vérifier | LOT-10 |
| TECH-073 | Réduction automatique de qualité pendant un replay ×4 ou une analyse | Polish / petit défaut visible | P3 | À vérifier | LOT-10 |
| TECH-074 | Sauvegarde > 6 Mo : renvoyée à chaque synchronisation | Bug technique | P3 | Confirmé | LOT-6 |
| TECH-075 | Restauration annoncée réussie même quand le stockage est plein | Bug technique | P3 | Confirmé | LOT-6 |
| TECH-076 | Saisons : la base clôt à l'heure, le serveur accepte encore 10 minutes | Bug technique | P3 | Confirmé | LOT-7 |
| TECH-077 | Valeurs de médaille abîmées dans le cloud → cristal | Bug technique | P3 | Confirmé | LOT-6 |
| TECH-078 | Identifiant d'installation (statistiques) inclus dans le code joueur | Bug technique | P3 | Confirmé | LOT-6 |
| TECH-079 | Serveur : dates de défi du jour inexistantes acceptées | Bug technique | P3 | Confirmé | LOT-7 |
| TECH-080 | En ligne : erreurs réseau brutes, délai d'attente perdu, cache hors ligne qui grossit, page re… | Bug technique | P3 | Confirmé | LOT-7 |
| TECH-081 | Clés de variantes liées une par une (squat possible avec une collision de signature) | Bug technique | P3 | Très probable | LOT-7 |
| TECH-082 | Multijoueur : salon public fantôme après un retrait pendant l'annonce | Bug technique | P3 | Confirmé | LOT-8b |
| TECH-083 | Multijoueur : écouteurs du salon jamais retirés | Bug technique | P3 | Confirmé | LOT-8c |
| TECH-084 | Multijoueur : arrivée en attente rejouée dans un nouveau championnat | Bug technique | P3 | Confirmé | LOT-8a |
| TECH-085 | Multijoueur : classement général qui compte des joueurs n'ayant jamais couru | Bug gameplay | P3 | Confirmé | LOT-8a |
| TECH-086 | Multijoueur : capacité de 8 qui ignore les places gardées | Bug technique | P3 | Confirmé | LOT-8b |
| TECH-087 | Multijoueur : onglet masqué, tampons d'état qui grossissent sans fin | Bug technique | P3 | Confirmé | LOT-8c |
| TECH-088 | Multijoueur : règle « voitures identiques » appliquée à la seule voiture locale | Bug gameplay | P3 | Confirmé | LOT-8c |
| TECH-089 | Multijoueur : défauts mineurs (paquet de téléportation en double, grille invisible au décompte… | Bug gameplay | P3 | Confirmé | LOT-8c |
| COMPLETE-018 | Débouché des pièces ◆ après le garage complet | Amélioration | P4 | — | LOT-11a |
| COMPLETE-019 | Ouvrir une copie d'un circuit officiel dans l'éditeur | Fonctionnalité manquante | P4 | — | LOT-11b |
| COMPLETE-020 | Mode photo | Fonctionnalité manquante | P4 | — | LOT-11b |
| COMPLETE-021 | Signature visuelle « pliage » | Polish | P4 | — | LOT-11b |
| COMPLETE-022 | Langues supplémentaires | Fonctionnalité manquante | P4 | — | LOT-11c |
| COMPLETE-023 | Fiche publique de joueur | Fonctionnalité manquante | P4 | — | LOT-11c |
| COMPLETE-024 | Direction par inclinaison du téléphone | Fonctionnalité manquante | P4 | — | LOT-11b |

Transversaux : TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, TRANS-06, TRANS-07, TRANS-08, TRANS-09, TRANS-10, TRANS-11, TRANS-12, TRANS-13, TRANS-14, TRANS-15, TRANS-16 (section E).

## B. Problèmes techniques

Bugs techniques, sécurité et vie privée, risques structurels, écarts de documentation. **Les bugs dont la conséquence principale est visible en jouant** (blocages, entrées, éditeur, multijoueur, rendu) ont leur entrée principale en **C** ; ils sont listés ici dans le catalogue par système pour que B reste complet.

### B.0 Catalogue complet par système (tous les bugs TECH)

| ID | Titre | Système | P | Entrée détaillée |
| --- | --- | --- | --- | --- |
| TECH-016 | Exception dans la construction d'une course : jeu figé (mode « course » sans se… | Application | P2 | C |
| TECH-007 | Synchronisation du compte : sauvegarde fusionnée trop grosse → boucle sans fin,… | Comptes | P1 | B |
| TECH-023 | Écriture faite pendant une synchronisation : jamais envoyée | Comptes | P2 | B |
| TECH-024 | « Garder ma progression » à l'inscription : échec silencieux, bibliothèques non… | Comptes | P2 | B |
| TECH-028 | Objectifs bonus non fusionnés entre appareils (récompense payée deux fois, pas … | Comptes | P2 | B |
| TECH-029 | Fusion des pièces ◆ : des pièces gagnées sont perdues, des objets offerts sont … | Comptes | P2 | B |
| TECH-074 | Sauvegarde > 6 Mo : renvoyée à chaque synchronisation | Comptes | P3 | B |
| TECH-077 | Valeurs de médaille abîmées dans le cloud → cristal | Comptes | P3 | B |
| TECH-025 | Déconnexion : identité anonyme de l'invité abandonnée, ses données orphelines | Comptes / en ligne | P2 | B |
| TECH-015 | Reprise après erreur de la boucle : retour au checkpoint non enregistré, record… | Course | P2 | C |
| TECH-067 | Démonstration du menu : vibrations du téléphone et de la manette | Course | P3 | C |
| TECH-072 | Message « hors piste » au moment de l'arrivée | Course | P3 | C |
| TECH-018 | Résultat en ligne d'une course précédente affiché sur l'arrivée suivante | Course / en ligne | P2 | C |
| TECH-017 | Commandes de course actives sous une fenêtre ouverte | Course / interface | P2 | C |
| TECH-003 | Éditeur : la pose supprime des pièces que la nouvelle pièce ne touche pas | Éditeur | P1 | C |
| TECH-033 | Éditeur : raccourcis Ctrl actifs sous les fenêtres | Éditeur | P2 | C |
| TECH-034 | Éditeur : retour d'essai qui perd historique, presse-papiers, calques | Éditeur | P2 | C |
| TECH-035 | Éditeur : décorations modifiées sans normalisation (rétablir perdu, « modifié »… | Éditeur | P2 | C |
| TECH-036 | Éditeur : la gomme supprime des décorations de calques verrouillés ou masqués | Éditeur | P2 | C |
| TECH-037 | Éditeur : déplacer une pièce au gizmo change son demi-niveau | Éditeur | P2 | C |
| TECH-052 | Éditeur : réservation des bords de pente au mur contournable | Éditeur | P3 | C |
| TECH-053 | Éditeur : « Prolonger » peut poser plusieurs départs | Éditeur | P3 | C |
| TECH-054 | Éditeur : calques gardés au chargement d'un autre circuit ; annuler garde la vé… | Éditeur | P3 | C |
| TECH-055 | Éditeur : test depuis le curseur en gravité inversée sur un circuit `flip0` | Éditeur | P3 | C |
| TECH-056 | Éditeur : la fenêtre « Circuit » arrondit la direction du vent (15° → 45°) | Éditeur | P3 | C |
| TECH-057 | Éditeur : « Tout sélectionner » oublie les décorations hors des pièces | Éditeur | P3 | C |
| TECH-058 | Éditeur : le collage garde les numéros de groupe | Éditeur | P3 | C |
| TECH-059 | Éditeur : impossible de sortir si l'enregistrement automatique échoue | Éditeur | P3 | C |
| TECH-038 | Éditeur : un groupe utilisé seulement par la logique est considéré libre | Éditeur / logique | P2 | C |
| TECH-062 | Éditeur : la vue par niveau montre les calques masqués | Éditeur / rendu | P3 | C |
| TECH-026 | Deux onglets : jeton de renouvellement périmé → nouvelle identité d'invité, ou … | En ligne | P2 | B |
| TECH-031 | Chaque lecture en ligne crée un joueur anonyme | En ligne | P2 | B |
| TECH-032 | Export des données (RGPD) : les temps échouent toujours, les « j'aime » manquent | En ligne | P2 | B |
| TECH-080 | En ligne : erreurs réseau brutes, délai d'attente perdu, cache hors ligne qui g… | En ligne | P3 | B |
| TECH-021 | Classement mondial dégradé : colonne `ghost_veh` jamais autorisée en lecture | En ligne / SQL | P2 | C |
| TECH-076 | Saisons : la base clôt à l'heure, le serveur accepte encore 10 minutes | En ligne / SQL | P3 | B |
| TECH-005 | Manette : bouton A tenu = « valider » dès qu'une superposition s'ouvre (pause i… | Entrées | P1 | C |
| TECH-020 | Boutons tactiles liés en dur à `KeyR`, `Escape`, `Enter` (et textes d'aide figé… | Entrées | P2 | C |
| TECH-004 | Entrée sur un bouton de la pause (ou de l'arrivée, du replay) relance la course | Entrées / course | P1 | C |
| TECH-063 | Garage : minuterie non annulée → voiture orpheline dans la scène suivante | Garage | P3 | B |
| TECH-070 | Messages du HUD : verrou de priorité non remis à zéro au redémarrage | HUD | P3 | C |
| TECH-061 | Miniature périmée dans la fiche d'un circuit | Interface | P3 | C |
| TECH-064 | Aides à la conduite : bouton « Fiche du circuit » absent à l'arrivée | Interface | P3 | C |
| TECH-065 | Échap : panneau de l'accueil non restauré ; aucun effet dans le garage | Interface | P3 | C |
| TECH-066 | Réponse du serveur après avoir quitté la course : panneau ouvert refermé, liste… | Interface | P3 | C |
| TECH-071 | Anglais : texte français dans la ligne de récompense de l'arrivée | Langues | P3 | C |
| TECH-060 | Lecture d'un code : décorations inconnues perdues sans blocage | Modèle | P3 | B |
| TECH-002 | Obstacle roulé de 180° : signe du roulis inversé à chaque lecture, clé et vérif… | Modèle / éditeur / serveur | P1 | C |
| TECH-039 | Signature : collisions de clés entre circuits physiquement différents | Modèle / serveur | P2 | B |
| TECH-008 | Multijoueur : `Room.started` jamais remis à faux → invités du salon lancés en c… | Multijoueur | P1 | C |
| TECH-009 | Multijoueur : un joueur arrivé (ou revenu) pendant une course n'apparaît jamais | Multijoueur | P1 | C |
| TECH-010 | Multijoueur : hôte absent ou qui recharge → manches bloquées, « Salle introuvab… | Multijoueur | P1 | C |
| TECH-011 | Multijoueur : un départ de présence efface le joueur même s'il a encore une con… | Multijoueur | P1 | B |
| TECH-012 | Multijoueur : fermeture du canal, erreur, jeton expiré ignorés → joueur isolé d… | Multijoueur | P1 | B |
| TECH-040 | Multijoueur : identité déclarée par le client (prise d'une place ou du rôle d'h… | Multijoueur | P2 | B |
| TECH-041 | Multijoueur : collisions douces jusqu'à 8 m/s par pas, cumulées | Multijoueur | P2 | C |
| TECH-042 | Multijoueur : temps d'arrivée (course libre) attribué au mauvais circuit | Multijoueur | P2 | C |
| TECH-043 | Multijoueur : voitures distantes figées mais toujours collisionnables | Multijoueur | P2 | C |
| TECH-044 | Multijoueur : connexion de signalisation fantôme après un délai dépassé | Multijoueur | P2 | B |
| TECH-045 | Multijoueur : tout message de signalisation ouvre un lien (places épuisables) | Multijoueur | P2 | B |
| TECH-046 | Multijoueur : une coupure de la signalisation coupe tous les liens de jeu sains | Multijoueur | P2 | C |
| TECH-047 | Multijoueur : fin de manche manquée jamais signalée au joueur revenu | Multijoueur | P2 | C |
| TECH-048 | Multijoueur : migration d'hôte après une fin de manche manquée → classements di… | Multijoueur | P2 | B |
| TECH-049 | Multijoueur : deux chargements de circuit concurrents, le dernier arrivé gagne | Multijoueur | P2 | C |
| TECH-050 | Multijoueur : serveurs ICE / TURN demandés une seule fois par salle | Multijoueur | P2 | B |
| TECH-051 | Multijoueur : adresses IP des joueurs diffusées à tous les abonnés du canal | Multijoueur | P2 | B |
| TECH-082 | Multijoueur : salon public fantôme après un retrait pendant l'annonce | Multijoueur | P3 | B |
| TECH-083 | Multijoueur : écouteurs du salon jamais retirés | Multijoueur | P3 | B |
| TECH-084 | Multijoueur : arrivée en attente rejouée dans un nouveau championnat | Multijoueur | P3 | B |
| TECH-085 | Multijoueur : classement général qui compte des joueurs n'ayant jamais couru | Multijoueur | P3 | C |
| TECH-086 | Multijoueur : capacité de 8 qui ignore les places gardées | Multijoueur | P3 | B |
| TECH-087 | Multijoueur : onglet masqué, tampons d'état qui grossissent sans fin | Multijoueur | P3 | B |
| TECH-088 | Multijoueur : règle « voitures identiques » appliquée à la seule voiture locale | Multijoueur | P3 | C |
| TECH-089 | Multijoueur : défauts mineurs (paquet de téléportation en double, grille invisi… | Multijoueur | P3 | C |
| TECH-001 | Réapparition sur une plaque de transformation : le véhicule redevient voiture, … | Noyau | P1 | C |
| TECH-013 | Vitesse de départ (`v0`) perdue au retour au point de départ | Noyau | P2 | C |
| TECH-014 | Multijoueur : règles de logique déclenchées par le temps jamais rejouées après … | Noyau / logique | P2 | C |
| TECH-022 | Records d'essai de l'éditeur (`e-…`) jamais purgés, synchronisés, qui saturent … | Persistance | P2 | B |
| TECH-027 | Deux onglets : le cache du profil d'un onglet écrase la progression de l'autre | Persistance | P2 | B |
| TECH-030 | Import d'un code joueur en « Fusionner » : écrase la progression locale, accept… | Persistance | P1 | B |
| TECH-075 | Restauration annoncée réussie même quand le stockage est plein | Persistance | P3 | B |
| TECH-078 | Identifiant d'installation (statistiques) inclus dans le code joueur | Persistance | P3 | B |
| TECH-073 | Réduction automatique de qualité pendant un replay ×4 ou une analyse | Qualité | P3 | C |
| TECH-006 | Capture de touche en attente qui survit à la navigation : touches réassignées à… | Réglages / entrées | P1 | C |
| TECH-019 | Dalle de verre brisée de nouveau visible alors qu'elle n'a plus de collision | Rendu | P2 | C |
| TECH-079 | Serveur : dates de défi du jour inexistantes acceptées | Serveur | P3 | B |
| TECH-081 | Clés de variantes liées une par une (squat possible avec une collision de signa… | Serveur / SQL | P3 | B |
| TECH-068 | Replay Theater : nom de caméra affiché faux | Theater | P3 | C |
| TECH-069 | Replay Theater : déplacement dans le temps sans les scripts, effets de logique … | Theater | P3 | C |

Les identifiants des anciens constats (numérotation de `docs/comprendre/05` § 5.6) sont rappelés dans chaque entrée ; correspondance complète en annexe 5.

### B — LOT-5 — Modèle de circuit, signature et clés de classement

#### TECH-039 — Signature : collisions de clés entre circuits physiquement différents
- **Type** Bug technique (sécurité / vie privée)
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Modèle / serveur
- **Lot de correction** LOT-5 — Modèle de circuit, signature et clés de classement
- **Relations** TECH-002, TECH-081, TRANS-01, TRANS-12, TRANS-16
- **Source** Phase 1 TECH-039
- **Validation** Deux poutres (échelle 8) écartées de 4 cm : signatures différentes ; anneau et route au même x:z:l distincts dans la signature de logique ; corpus de compatibilité mis à jour (changement de clé : à annoncer).

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN (intégrité des classements ; demande un code fabriqué) · **Certitude** CONFIRMÉ (sonde de l'audit délégué ; `test-integrite.mjs` documente déjà l'arrondi des obstacles) · **Localisation** `js/track.js : signatureText()` et `_logicSig()`.
- **Description** Obstacles et solides hachés à 0,1 m et 0,01 rad alors que le code garde 0,01 m et 0,001 rad, et que la physique utilise ces valeurs : une poutre (échelle 8) décalée de 4 cm et tournée de 0,004 rad a la même clé (son extrémité bouge de ≈ 0,26 m). L'appartenance aux groupes est indexée par `x:z:l` : un anneau et la route sur laquelle il est posé ne se distinguent pas ; déplacer le groupe de l'un à l'autre change la physique, pas la signature.
- **Conséquences** Un circuit variante peut publier ses temps dans le classement de l'original (la liaison forte du serveur porte sur `signatureText`) et hériter de sa marque « vérifié ».
- **Piste** Hacher à la précision du code ; inclure le type de pièce dans la clé d'appartenance (changement de clé : migration ou acceptation de la perte des classements concernés).

#### TECH-060 — Lecture d'un code : décorations inconnues perdues sans blocage
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Modèle
- **Lot de correction** LOT-5 — Modèle de circuit, signature et clés de classement
- **Relations** TECH-039, TRANS-01, TRANS-12
- **Source** Phase 1 TECH-060
- **Validation** Code contenant une décoration inconnue : avertissement ou blocage de l'enregistrement dans l'éditeur.

**Détail d'origine (phase 1, repris sans perte)** — `track.js : lossBlocking` ignore `lost.decos` : éditer et enregistrer le code d'une version plus récente perd ces décorations sans avertissement dans l'éditeur. Piste : bloquer ou avertir aussi pour les décorations.

### B — LOT-6 — Persistance locale, comptes et synchronisation

#### TECH-007 — Synchronisation du compte : sauvegarde fusionnée trop grosse → boucle sans fin, progression invisible, état « à jour »
- **Type** Bug technique
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Confirmé
- **Système** Comptes
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-024, TECH-074, TECH-075, TECH-022, TRANS-02
- **Source** Phase 1 TECH-007
- **Validation** Cloud de 120 records + quota local réduit : statut d'erreur affiché, pas de relance automatique, aucune lecture complète répétée (compter les requêtes sur 15 s). Test avec tools/fake-supabase.mjs et quota simulé.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `js/account.js:241` ignore le résultat de `restoreAll`) ; sonde de l'audit délégué (faux Supabase, quota simulé).
- **Localisation** `js/account.js : _doSync()` (~l. 236-262) ; `js/storage.js : restoreAll()` (atomique, renvoie `false` si le quota est dépassé) ; `js/profile.js : profile()` (réécrit le profil au rechargement).
- **Description** Si la sauvegarde fusionnée ne tient pas dans le stockage local, `restoreAll` échoue sans rien écrire ; le résultat est ignoré, `reloadProfile()` réécrit le profil, ce qui relance une synchronisation 4 s plus tard, qui échoue de même.
- **Conditions** Sauvegarde du cloud plus grosse que la place libre sur l'appareil (réunion de deux appareils, ou stockage déjà occupé par l'invité).
- **Conséquences** L'appareil n'affiche jamais la progression du compte ; l'état dit « à jour » ; la sauvegarde complète (jusqu'à 6 Mo) est **téléchargée toutes les ~4 s** tant que l'onglet est ouvert. Rien n'est perdu dans le cloud.
- **Reproduction** Cloud : 120 records et 777 ◆ ; appareil à quota de 600 Ko : connexion « ok », 0 ◆ et 0 record affichés, 4 lectures complètes en 13 s, aucune écriture, sans fin.
- **Piste** Tester le résultat de `restoreAll` et le signaler ; ne jamais relancer une synchronisation depuis `reloadProfile` ; écrire localement une version allégée (sans fantômes) si nécessaire.

#### TECH-030 — Import d'un code joueur en « Fusionner » : écrase la progression locale, accepte des records invalides
- **Type** Bug technique
- **Priorité** P1 (gravité d'origine : MOYEN) — **modifiée à la consolidation** : Remonté de MOYEN (phase 1) à P1 : perte irréversible de progression pour un invité, sur le bouton principal de l'import.
- **Niveau de certitude** Confirmé
- **Système** Persistance
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-075, TECH-024, TRANS-11, TRANS-13
- **Source** Phase 1 TECH-030
- **Validation** Import « Fusionner » : XP, objectifs, Académie, licences, médailles conservés ; un record invalide ou d'une autre version de physique refusé ; brouillon et bibliothèques non écrasés.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `js/profile.js : applySave()`, branche « merge » (~l. 212-248) ; bouton principal `js/app/profile.js:275`.
- **Description** Le profil devient celui importé (expérience, objectifs, Académie, licences, statistiques, identifiant locaux perdus ; médailles rétrogradées) ; records remplacés dès que le temps importé est plus petit, sans regarder `pv` (un record fabriqué de 0,001 s remplace un vrai 30 s) ; brouillon et bibliothèques écrasés. Définitif pour un invité.
- **Piste** Réutiliser `mergeSaves` / `mergeProfile` ; refuser un record qui échoue à `validRecord` ou dont `pv` diffère.

#### TECH-022 — Records d'essai de l'éditeur (`e-…`) jamais purgés, synchronisés, qui saturent le stockage
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Persistance
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-007, TECH-074, TRANS-02
- **Source** Phase 1 TECH-022 ; ancien n° 6 de docs/comprendre/05 § 5.6
- **Validation** 30 essais d'éditeur : aucun (ou au plus N) record `e-…` conservé, aucun synchronisé ; stockage plein : les vrais records ne sont pas dépouillés en premier.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; mesures de l'audit délégué.
- **Localisation** `js/app/editorFlow.js:102` → `js/race/finish.js : _finish()` l. 107-123 → `storage.saveRecord` ; `js/cloudsave.js:20` (`rec3.*` synchronisés).
- **Description** Chaque essai terminé (hors test depuis le curseur) écrit un record complet sous une clé nouvelle à chaque modification du circuit : 21 à 43 Ko (≈ 27 Ko en moyenne) ; ≈ 190 essais remplissent 5 Mo.
- **Conséquences** Stockage plein : les **nouveaux vrais records** sont écrits sans fantôme ni commandes (pas de replay, plus de bouton « Envoyer mon record ») ; quand `makeRoom` agit, il dépouille d'abord les plus anciens, souvent les vrais records ; la sauvegarde cloud grossit vers la limite de 6 Mo (TECH-074).
- **Piste** Ne pas enregistrer les essais (ou seulement le dernier), les exclure de la synchronisation, les purger au démarrage ; faire libérer d'abord les clés non classées.

#### TECH-023 — Écriture faite pendant une synchronisation : jamais envoyée
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Comptes
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-027, TRANS-07, TRANS-13
- **Source** Phase 1 TECH-023
- **Validation** Écriture de 1 000 ◆ pendant une synchronisation de 6 s : envoyée dans la foulée (faux Supabase).

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `js/account.js : sync()` (~l. 370-379).
- **Description** La minuterie d'une écriture faite pendant une synchronisation rappelle `sync()`, qui renvoie la promesse en cours ; à sa fin, `_dirty` repasse à faux.
- **Conséquences** La modification n'atteint le cloud qu'à la prochaine écriture ou au prochain lancement ; l'autre appareil ne la voit pas d'ici là (sonde : +1 000 ◆ jamais envoyés).
- **Piste** Compteur de génération : relancer après la synchronisation en cours si une écriture a eu lieu.

#### TECH-024 — « Garder ma progression » à l'inscription : échec silencieux, bibliothèques non copiées
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Comptes
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-007, TECH-025, TECH-075, TRANS-02, TRANS-11
- **Source** Phase 1 TECH-024
- **Validation** Quota serré + inscription avec « Garder ma progression » : échec annoncé ou migration réussie ; prefabs, pièces perso, modes et preuves copiés.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `account.js:150` ignore le résultat de `restoreAll` ; sonde de l'audit délégué) .
- **Description** La copie double l'occupation du stockage ; si elle ne tient pas, rien n'est copié et rien n'est dit (sonde : 1 234 ◆ et 24 records → compte à 0). Même réussie, la copie omet `vproof` (preuves de vérification), le brouillon, les prefabs, les pièces perso et les modes (clés non synchronisées).
- **Piste** Tester le résultat, migrer au lieu de copier, signaler l'échec ; copier aussi les bibliothèques.

#### TECH-025 — Déconnexion : identité anonyme de l'invité abandonnée, ses données orphelines
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Comptes / en ligne
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-026, TECH-031, COMPLETE-003, TRANS-11
- **Source** Phase 1 TECH-025 ; ancien n° 13 de docs/comprendre/05 § 5.6
- **Validation** Invité → inscription → déconnexion → reconnexion : scores, circuits et « j'aime » restent rattachés ; pas de doublon de joueur dans les classements ; republier son circuit réussit.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `online.js:69-75 useGuest` efface la session ; sonde de l'audit délégué).
- **Description** L'inscription crée un nouvel utilisateur au lieu de convertir l'anonyme ; la déconnexion efface la session anonyme. Les temps, circuits publiés, « j'aime » de l'invité restent sous un identifiant inutilisable ; deux lignes du même nom dans les classements ; republier son propre circuit depuis le compte : « déjà publié par un autre pilote » ; chaque cycle crée un anonyme de plus.
- **Piste** Convertir l'utilisateur anonyme (adresse et mot de passe sur la session anonyme) ; ne pas effacer la session de l'invité.

#### TECH-026 — Deux onglets : jeton de renouvellement périmé → nouvelle identité d'invité, ou déconnexion du compte
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN) — Confirmé pour l'invité (sonde, jetons à usage unique simulés) ; pour le compte « très probable » (dépend de la détection de réutilisation de GoTrue).
- **Niveau de certitude** Confirmé
- **Système** En ligne
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-025, TECH-027, TRANS-07, TRANS-11
- **Source** Phase 1 TECH-026
- **Validation** Deux onglets avec jetons à usage unique : l'identité de l'invité est conservée ; le compte n'est pas déconnecté (à confirmer sur GoTrue réel).

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ pour l'invité (sonde, jetons à usage unique simulés), TRÈS PROBABLE pour le compte · **Localisation** `js/online.js : ensureSession()` (~l. 122-158 ; la session n'est lue qu'à la construction).
- **Description** L'onglet 1 renouvelle et enregistre ; l'onglet 2 renouvelle ensuite avec son jeton déjà utilisé. Invité : refus → nouvelle inscription anonyme, qui écrase la session de l'onglet 1 (identité perdue, comme TECH-025). Compte : session expirée, et avec la détection de réutilisation de Supabase, toute la famille de jetons révoquée : reconnexion forcée.
- **Piste** Relire la session enregistrée avant de renouveler ; écouter les évènements `storage`.

#### TECH-027 — Deux onglets : le cache du profil d'un onglet écrase la progression de l'autre
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Persistance
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-026, TECH-023, TRANS-07, TRANS-13
- **Source** Phase 1 TECH-027
- **Validation** Onglet 1 : achat + médaille cristal ; onglet 2 : course : achat et médaille conservés.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN (invité), FAIBLE (compte) · **Certitude** CONFIRMÉ (sonde) · **Localisation** `js/profile.js:23-45` ; aucun écouteur `storage` dans `js/`.
- **Description** Onglet 1 : achat d'un objet et médaille cristal ; onglet 2 (cache périmé) finit une course : l'objet disparaît (remboursé), la médaille est perdue. Pour un compte, la fusion du cloud ne répare que si l'onglet 1 a déjà synchronisé.
- **Piste** Recharger le cache sur l'évènement `storage`, ou fusionner avant d'écrire.

#### TECH-028 — Objectifs bonus non fusionnés entre appareils (récompense payée deux fois, pas de convergence)
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Comptes
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-029, TECH-077, TRANS-13
- **Source** Phase 1 TECH-028
- **Validation** Deux appareils : objectif réalisé sur B : A et B convergent, une seule récompense.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `profile.goals` absent de `cloudsave.js : mergeProfile`, la version locale l'emporte par `...b, ...a`).
- **Conséquences** Un objectif atteint sur l'autre appareil peut être refait : `GOAL_COINS` et l'expérience payés deux fois ; les appareils ne convergent jamais ; `title` et `xpDay` non plus, d'où une écriture à chaque synchronisation.
- **Piste** Réunir les objectifs (et fusionner `title`, `xpDay` explicitement).

#### TECH-029 — Fusion des pièces ◆ : des pièces gagnées sont perdues, des objets offerts sont déduits
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Comptes
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-028, TRANS-13
- **Source** Phase 1 TECH-029
- **Validation** Fuzz de fusion : +50 / +50 = +100 ; objet offert non déduit ; aucune inflation de pièces.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `js/cloudsave.js : mergeCoins` (l. 73-77).
- **Description** Règle « le plus grand des deux moins ce que chaque côté n'avait pas » : 100 → +50 sur chaque appareil donne 150, pas 200 ; un objet offert (clin d'œil caché, valeur 250) est déduit comme s'il avait été acheté. Aucune création de pièces trouvée.
- **Piste** Compter gains et dépenses par appareil (modèle additif), marquer les objets offerts.

#### TECH-074 — Sauvegarde > 6 Mo : renvoyée à chaque synchronisation
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Comptes
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-007, TECH-022, TRANS-02, TRANS-13
- **Source** Phase 1 TECH-074
- **Validation** Sauvegarde > 6 Mo sans changement : aucun PATCH ; à vérifier : comportement au-delà de 8 Mo compressés.

**Détail d'origine (phase 1, repris sans perte)** — `account.js:398-400` : la copie du cloud est `withoutGhosts`, la fusion garde les fantômes locaux : `sameData` n'est jamais vrai, chaque synchronisation réécrit (≈ 6 Mo) et incrémente `rev` (conflits avec les autres appareils). À VÉRIFIER : au-delà de la limite de la base (8 Mo compressés), chaque synchronisation échoue. Piste : comparer `withoutGhosts(fusion)` à la copie du cloud ; retirer aussi les commandes ou les records `e-` au-delà de la limite.

#### TECH-075 — Restauration annoncée réussie même quand le stockage est plein
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Persistance
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-007, TECH-024, TECH-030, TRANS-02
- **Source** Phase 1 TECH-075
- **Validation** Import avec stockage plein : l'échec est annoncé, jamais « Sauvegarde restaurée ! ».

**Détail d'origine (phase 1, repris sans perte)** — `profile.js:210, 248` ignorent le résultat de `restoreAll` ; `app/profile.js : _afterImport` affiche toujours « Sauvegarde restaurée ! ». Piste : propager l'échec.

#### TECH-077 — Valeurs de médaille abîmées dans le cloud → cristal
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Comptes
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-028, TRANS-13
- **Source** Phase 1 TECH-077
- **Validation** Valeur de médaille invalide dans le cloud : ignorée (jamais convertie en cristal).

**Détail d'origine (phase 1, repris sans perte)** — `cloudsave.js:85` : `num()` transforme une valeur invalide en 0, qui vaut « cristal ». Données corrompues seulement. Piste : ignorer une valeur invalide.

#### TECH-078 — Identifiant d'installation (statistiques) inclus dans le code joueur
- **Type** Bug technique (sécurité / vie privée)
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Persistance
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TRANS-11, TRANS-16
- **Source** Phase 1 TECH-078
- **Validation** Code joueur exporté : sans `telemetry.state` ni `errors.queue`.

**Détail d'origine (phase 1, repris sans perte)** — `storage.js : DEVICE_ONLY_KEYS` (l. 87) n'exclut ni `telemetry.state` (identifiant d'installation) ni `errors.queue` : un code joueur publié relie pseudo et identifiant ; l'importer en « Remplacer » fait adopter le même identifiant par un autre appareil. Piste : ajouter ces clés à la liste.

### B — LOT-7 — En ligne, SQL, serveur et exploitation

#### TECH-031 — Chaque lecture en ligne crée un joueur anonyme
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN) — La limite exacte d'inscriptions anonymes de Supabase est à vérifier (LOT-0).
- **Niveau de certitude** Confirmé
- **Système** En ligne
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TECH-025, TRANS-11
- **Source** Phase 1 TECH-031
- **Validation** Afficher classement et communauté : aucune requête /auth/v1/signup tant qu'aucune action n'exige de session.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code) ; limite exacte À VÉRIFIER · **Localisation** `js/online.js : _fetchRaw` (~l. 104-107, authentification par défaut) → `ensureSession` → inscription anonyme.
- **Conséquences** Regarder un classement ou la communauté crée un utilisateur ; la limite d'inscriptions anonymes de Supabase (par adresse IP) peut refuser les classements derrière une adresse partagée (école).
- **Piste** Faire les lectures publiques avec la clé publique, sans session.

#### TECH-032 — Export des données (RGPD) : les temps échouent toujours, les « j'aime » manquent
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** En ligne
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TECH-021, TRANS-10
- **Source** Phase 1 TECH-032
- **Validation** Export : la table des temps du joueur est exportée (colonnes autorisées), les « j'aime » sont présents.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code et règles de droits PostgreSQL) · **Localisation** `js/dataExport.js : EXPORT_TABLES`.
- **Description** `scores?select=*` exige la lecture de toutes les colonnes (`inputs`, `ghost`, `ghost_veh` non accordées) : la table des temps du joueur est **toujours** en erreur ; `track_likes` est omise ; seule la portée courante est exportée (ni l'invité, ni l'ancien anonyme).
- **Piste** Lister les colonnes accordées, ou fournir une fonction d'export côté serveur.

#### TECH-076 — Saisons : la base clôt à l'heure, le serveur accepte encore 10 minutes
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** En ligne / SQL
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TRANS-10
- **Source** Phase 1 TECH-076
- **Validation** Course terminée 5 min après la fin de saison : points affichés et divisions enregistrées cohérents.

**Détail d'origine (phase 1, repris sans perte)** — `seasons.js` accepte 10 min après la fin (`SEASON_GRACE_MS`), `etape11-saisons.sql : close_season` clôt à l'heure : les courses de la grâce entrent après les montées / descentes ; points affichés et divisions enregistrées se contredisent. Piste : clore après `ends + grâce`.

#### TECH-079 — Serveur : dates de défi du jour inexistantes acceptées
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Serveur
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TRANS-10
- **Source** Phase 1 TECH-079
- **Validation** Clé `daily-2026-02-30` rejetée par le serveur.

**Détail d'origine (phase 1, repris sans perte)** — `verify.js : trackForKey` (l. 59-60) : `Date.parse('2026-02-30T00:00:00Z')` est valide (reporté au 2 mars) : `daily-…-02-30`, `-04-31` passent le contrôle de ±2,5 jours en fin de mois et créent des classements et du calcul en plus ; la fenêtre réelle dépasse « hier, aujourd'hui, demain ». Piste : vérifier que la date relue redonne la même chaîne.

#### TECH-080 — En ligne : erreurs réseau brutes, délai d'attente perdu, cache hors ligne qui grossit, page renvoyée à la place d'un fichier
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** En ligne
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TRANS-15
- **Source** Phase 1 TECH-080
- **Validation** Réseau coupé : messages clairs ; refus 429 avec le délai du serveur ; cache du service worker borné ; fichier manquant ne renvoie pas index.html.

**Détail d'origine (phase 1, repris sans perte)** — (a) `online.js : _count` (l. 345-352) appelle `fetch` hors de `_fetchRaw` : « Failed to fetch » brut affiché ; (b) le délai précis d'un refus 429 du serveur est remplacé par un message générique (`online.js:41`) ; (c) le service worker met en cache chaque `js/version.js?u=<horodatage>` de la vérification de mise à jour (`updateCheck.js:25`) jusqu'au changement de version ; (d) hors ligne, `index.html` est renvoyé à la place d'un fichier non trouvé (`sw.js`) ; (e) `telemetry.state.attempts` garde une entrée par circuit de la communauté, sans borne.

#### TECH-081 — Clés de variantes liées une par une (squat possible avec une collision de signature)
- **Type** Bug technique (sécurité / vie privée)
- **Priorité** P3 (gravité d'origine : FAIBLE) — Très probable ; exige une collision de signature de 32 bits.
- **Niveau de certitude** Très probable
- **Système** Serveur / SQL
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TECH-039, TRANS-10, TRANS-16
- **Source** Phase 1 TECH-081
- **Validation** Variantes d'une clé déjà liée : liées à la liaison de la clé de base (tools/test-securite-sql.sh).

**Détail d'origine (phase 1, repris sans perte)** — TRÈS PROBABLE. `track_binds` lie chaque clé complète (variante comprise) séparément : quelqu'un qui dispose d'une collision de la signature de 32 bits peut s'approprier les clés de variantes d'un circuit populaire même après la liaison de sa clé de base. Piste : lier les variantes à la liaison de la clé de base.

### B — LOT-8a — Multijoueur — état de la salle et championnat

#### TECH-048 — Multijoueur : migration d'hôte après une fin de manche manquée → classements divergents
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TECH-047, TRANS-05
- **Source** Phase 1 TECH-048
- **Validation** Migration d'hôte après une fin de manche manquée : classements identiques chez tous les joueurs.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN (rare) · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `room.js : _cupTick`, `_hostEndRound` (~l. 582-615).
- **Description** Le nouvel hôte reclôt la manche avec ses arrivées incomplètes ; les autres ignorent ce second `rend`, les arrivants copient la version du nouvel hôte : deux classements différents durablement.
- **Piste** Résultats versionnés par championnat et manche ; à la migration, reprendre l'état le plus complet.

#### TECH-084 — Multijoueur : arrivée en attente rejouée dans un nouveau championnat
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TECH-008, TRANS-05
- **Source** Phase 1 TECH-084
- **Validation** Arrêt du championnat puis nouveau championnat : aucune arrivée rejouée.

**Détail d'origine (phase 1, repris sans perte)** — `room.js` (`_pendingFinish`, l. 63 / 441 / 276, effacé seulement l. 606) survit à `cupstop` et à « Relancer » ; à la réouverture d'un lien il est envoyé pour la manche 0 du nouveau championnat (sonde : un joueur crédité de 3 000 pas sans avoir couru, qui gagne). Piste : le lier au championnat, l'effacer à l'arrêt et au lancement.

### B — LOT-8b — Multijoueur — présence, signalisation, liens

#### TECH-011 — Multijoueur : un départ de présence efface le joueur même s'il a encore une connexion
- **Type** Bug technique
- **Priorité** P1 (gravité d'origine : ÉLEVÉ) — P1 sous réserve : « très probable » tant que le comportement réel de Supabase Realtime n'est pas observé ; à rétrograder en P2 si infirmé (LOT-0).
- **Niveau de certitude** Très probable
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TECH-010, TECH-012, TRANS-06
- **Source** Phase 1 TECH-011
- **Validation** Sonde de signalisation (événements join, meta, leave pour une même clé) : le pair est conservé ; confirmer avec deux connexions réelles de la même clé sur Realtime.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** TRÈS PROBABLE (signalisation CONFIRMÉE ; bout en bout dépend de l'ordre des évènements de Supabase Realtime) · **Vérification** code relu (moi : `js/net/signaling.js:88`).
- **Localisation** `js/net/signaling.js : _onMessage`, branche `presence_diff`.
- **Description** Une entrée `leaves` supprime toute la clé du joueur, même si une autre connexion de cette clé reste présente (Phoenix suit chaque connexion par sa référence).
- **Conditions** Reconnexion avant que le serveur ait fermé l'ancienne connexion (cas normal après une courte coupure) ; onglet dupliqué (le `sessionStorage` est copié).
- **Conséquences** Les autres marquent le joueur absent, le retirent au bout de 20 s alors qu'il est connecté, et ne refont jamais le lien (`_onPeer` ne relie que les absents) : il est exclu de fait.
- **Reproduction** Évènements `join`, `meta`, `leave` pour une même clé : `peers.has(bob)` faux alors que la nouvelle connexion est active.
- **Piste** Suivre les entrées de présence une par une (référence Phoenix), comme le client officiel.

#### TECH-012 — Multijoueur : fermeture du canal, erreur, jeton expiré ignorés → joueur isolé dans une salle morte
- **Type** Bug technique
- **Priorité** P1 (gravité d'origine : ÉLEVÉ) — P1 sous réserve : comportement serveur de Realtime à confirmer (LOT-0).
- **Niveau de certitude** Très probable
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TECH-010, TECH-011, TRANS-06
- **Source** Phase 1 TECH-012
- **Validation** Simuler phx_close, phx_error, jeton expiré, absence de réponse aux battements : `_lost` se déclenche et la reconnexion démarre ; confirmer l'expiration réelle du jeton.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** TRÈS PROBABLE (client CONFIRMÉ ; comportement exact du serveur À VÉRIFIER) · **Vérification** code relu (moi : aucun traitement de `phx_close`, `phx_error`).
- **Localisation** `js/net/signaling.js : _onMessage` (~l. 80-94), connexion (~l. 47-77).
- **Description** Le client ignore `phx_close`, `phx_error` et les messages « system » (jeton expiré) ; il ne renouvelle jamais le jeton d'accès du canal (valable au moment de rejoindre) ; il ne contrôle pas les réponses aux battements de cœur.
- **Conséquences** Le joueur perd sa présence sans que `_lost` se déclenche : pas de reconnexion ; les autres le retirent et coupent les liens ; il reste seul dans une salle morte.
- **Reproduction** Sonde : aucun évènement `closed`, les battements continuent, aucun message `access_token` n'est jamais envoyé.
- **Piste** Traiter ces évènements et l'absence de réponse aux battements comme une fermeture ; renouveler le jeton.

#### TECH-044 — Multijoueur : connexion de signalisation fantôme après un délai dépassé
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TECH-082, TRANS-06, TRANS-09
- **Source** Phase 1 TECH-044
- **Validation** Délai dépassé puis réponse tardive : connexion fermée, aucune présence publiée.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `net/signaling.js:50` (délai sans fermeture), `room.js : _retry` (l. 166-168, pas de `leave()`), même chose pour l'observation de l'annuaire.
- **Description** Une réponse tardive fait quand même rejoindre la connexion abandonnée : elle publie une présence et bat pour toute la durée de l'onglet (présences fantômes, « hôte » fantôme pour les arrivants, minuteries actives).
- **Piste** Fermer la connexion à chaque échec ; `leave()` sur les tentatives ratées.

#### TECH-045 — Multijoueur : tout message de signalisation ouvre un lien (places épuisables)
- **Type** Bug technique (sécurité / vie privée)
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TECH-040, TRANS-05, TRANS-16
- **Source** Phase 1 TECH-045
- **Validation** Message de signalisation d'un non-membre : aucun lien créé ; sept messages ne remplissent plus les places.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `net/transport.js : _onSignal` (~l. 294), `addPeer` (~l. 226-233).
- **Description** Un message avec un `from` inventé crée un lien WebRTC (jusqu'à `MAX_LINKS = 7`), jamais nettoyé pour un non-membre : sept messages suffisent pour empêcher les vrais joueurs de se connecter ; sans malveillance, un candidat ICE tardif d'un joueur parti recrée son lien et occupe une place.
- **Piste** N'accepter la signalisation que des membres présents ; nettoyer les liens orphelins.

#### TECH-050 — Multijoueur : serveurs ICE / TURN demandés une seule fois par salle
- **Type** Bug technique
- **Priorité** P2 (gravité d'origine : MOYEN) — Impact À VÉRIFIER : dès que le relais TURN sert réellement (LOT-0).
- **Niveau de certitude** À vérifier
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TRANS-06
- **Source** Phase 1 TECH-050
- **Validation** Salle ouverte plus d'une heure, nouvel arrivant derrière un réseau qui exige le relais : connexion établie.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN (dès que le relais TURN sert) · **Certitude** CONFIRMÉ dans le code, impact À VÉRIFIER · **Localisation** `room.js : _open` (~l. 108-114).
- **Description** Les identifiants TURN (durée limitée, 1 h par défaut) sont obtenus à l'ouverture de la salle ; les liens créés plus tard (arrivants, reconnexions) utilisent des identifiants expirés ; les réseaux qui exigent le relais ne se connectent plus après une heure.
- **Piste** Redemander les serveurs ICE à chaque `addPeer` ou `_retry` quand leur durée est presque écoulée.

#### TECH-082 — Multijoueur : salon public fantôme après un retrait pendant l'annonce
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TECH-044, TRANS-06, TRANS-09
- **Source** Phase 1 TECH-082
- **Validation** Retrait pendant l'annonce : aucun salon listé.

**Détail d'origine (phase 1, repris sans perte)** — `net/directory.js` (l. 226-232) : `retract()` pendant `announce()` (jeton ou connexion en cours) laisse la connexion se créer et publier : salon listé jusqu'à la fermeture de l'onglet, « Salle introuvable » au clic. Piste : annuler et fermer à la fin de la jonction si retiré.

#### TECH-086 — Multijoueur : capacité de 8 qui ignore les places gardées
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TRANS-06
- **Source** Phase 1 TECH-086
- **Validation** Salle à 8 avec un absent : un 9e est refusé.

**Détail d'origine (phase 1, repris sans perte)** — `room.js:127` compte la présence seulement : une salle pleine avec un absent admet un 9e ; le joueur qui revient bute sur la limite de 7 liens. Piste : compter membres absents compris.

### B — LOT-8c — Multijoueur — voitures distantes et collisions

#### TECH-083 — Multijoueur : écouteurs du salon jamais retirés
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8c — Multijoueur — voitures distantes et collisions
- **Relations** TECH-063, TRANS-09
- **Source** Phase 1 TECH-083 ; ancien n° 12 de docs/comprendre/05 § 5.6
- **Validation** Ouvrir / fermer le salon 10 fois : nombre d'écouteurs stable.

**Détail d'origine (phase 1, repris sans perte)** — `app/multi.js:366-369` : retirés seulement par les boutons (pas par Échap, ni par la fermeture lors d'un départ) : 5-6 écouteurs de plus à chaque ouverture, qui retiennent un arbre DOM détaché. Pas de double traitement visible (le contenu de la fenêtre est remplacé). Piste : `off()` dans le `onClose` de la fenêtre.

#### TECH-087 — Multijoueur : onglet masqué, tampons d'état qui grossissent sans fin
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8c — Multijoueur — voitures distantes et collisions
- **Relations** TRANS-09
- **Source** Phase 1 TECH-087
- **Validation** Onglet masqué 10 minutes : tampon d'interpolation borné.

**Détail d'origine (phase 1, repris sans perte)** — `net/interp.js` ne purge que dans `sample()` (au rendu) : onglet masqué, ≈ 4 Mo par adversaire et par 10 min. Piste : purger dans `push`.

### B — LOT-8d — Multijoueur — identité, sécurité, vie privée

#### TECH-040 — Multijoueur : identité déclarée par le client (prise d'une place ou du rôle d'hôte)
- **Type** Bug technique (sécurité / vie privée)
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8d — Multijoueur — identité, sécurité, vie privée
- **Relations** TECH-045, TECH-051, TRANS-05, TRANS-16
- **Source** Phase 1 TECH-040 ; ancien n° 7 de docs/comprendre/05 § 5.6
- **Validation** Client modifié annonçant `host: true` ou un `hello` de remplacement : refusé ; une place n'est rendue qu'avec le secret de reprise.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN (sécurité, nécessite un client modifié et le code de la salle ; les salles publiques sont listées) · **Certitude** CONFIRMÉ (code relu par moi : `room.js:302` stocke le jeton sans le comparer ; sonde de l'audit délégué).
- **Localisation** `js/net/room.js` (`hello`, `hostId`, `_onPeer` qui prend `host` de la présence) ; `js/net/signaling.js:90-93` (`from` déclaré).
- **Description** On peut reprendre la place d'un joueur coupé (pendant ses 20 s) et faire compter ses arrivées ; ou prendre le rôle d'hôte en annonçant `host: true` avec le plus petit identifiant : les autres acceptent alors ses `rend`, `cupstop`, `start`… ; le vrai joueur qui revient ne retrouve plus sa place.
- **Piste** Jeton de reprise secret, vérifié avant de rendre une place, jamais diffusé ; autorité d'hôte fondée sur l'ordre d'arrivée ou une passation explicite ; `from` lié à la présence côté serveur.

#### TECH-051 — Multijoueur : adresses IP des joueurs diffusées à tous les abonnés du canal
- **Type** Bug technique (sécurité / vie privée)
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8d — Multijoueur — identité, sécurité, vie privée
- **Relations** TECH-040, TRANS-16
- **Source** Phase 1 TECH-051
- **Validation** Observateur silencieux d'une salle publique : ne reçoit plus les adresses IP des autres (ou la page Confidentialité l'indique).

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN (vie privée) · **Certitude** CONFIRMÉ (code) · **Localisation** `net/signaling.js:90-92, 108-110` ; `net/transport.js:247, 287`.
- **Description** Offres SDP et candidats ICE sont diffusés à tous les abonnés du canal de la salle ; le filtrage par destinataire est fait par le client. Un observateur silencieux d'une salle publique recueille les adresses IP de tous les joueurs.
- **Piste** Canaux privés ou relais côté serveur ; à défaut, le mentionner dans la page Confidentialité.

### B — LOT-10 — Interface, finitions et petits défauts visibles

#### TECH-063 — Garage : minuterie non annulée → voiture orpheline dans la scène suivante
- **Type** Bug technique
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Garage
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Relations** TECH-083, TRANS-09
- **Source** Phase 1 TECH-063 ; ancien n° 12 de docs/comprendre/05 § 5.6
- **Validation** Modification de l'atelier puis sortie en < 120 ms : la scène revient à 11 objets, aucune voiture orpheline.

**Détail d'origine (phase 1, repris sans perte)** — `garage/studio.js:18-19` (`_studioT`, 120 ms) n'est pas annulée par `garage.js : dispose()` (l. 283) : quitter juste après une modification de l'atelier ajoute une voiture orpheline à la scène (elle reste en course, et s'accumule), appelle `setLoadout` et `audio.setVoice` après la sortie. Sonde Chromium de l'audit délégué : enfants de la scène 11 → 12. Piste : annuler (ou exécuter) la minuterie dans `dispose`.

### B — LOT-12 — Documentation et règles de processus

#### RISK-001 — Modifier un circuit intégré en change la clé : progression perdue, aucune migration
- **Type** Bug technique (risque structurel)
- **Priorité** P2
- **Niveau de certitude** Confirmé (code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Relations** TECH-039, COMPLETE-002, COMPLETE-011, TRANS-12
- **Source** Phase 0 / comprendre (ancien n° 5) ; Phase 1 §7.5

- **Description** La clé de classement d'un circuit intégré est `b-<id>-<empreinte de encode()>` (`js/main.js:95`). Tout ce qui est dans le code du circuit (script, nom, auteur, décor, obstacles, paramètres) change cette clé ; les médailles, les verrous de chapitre, les records locaux, les classements, les saisons et les duels y sont rattachés ; aucune migration n'existe pour les circuits intégrés (elle existe pour les circuits de joueurs : `trackDescriptor.js:93`). Les médailles (`def.medals`) ne font pas partie de `encode()` : les modifier ne change pas la clé (vérifié en phase 3).
- **Origine ou cause** Conception : la clé est une empreinte du contenu.
- **Localisation** `js/main.js:95`, `js/tracks.js : buildBuiltin`, `js/trackDescriptor.js`, `js/career.js`, `js/seasons.js`.
- **Conditions** Toute modification d'un circuit intégré, même de son nom.
- **Impact** Record, médaille, fantôme et replay du joueur invisibles pour ce circuit ; reverrouillage possible d'un chapitre ; classement en ligne vidé ; duels et tournois en cours injouables.
- **Correction ou solution envisagée** Règle de processus : ne jamais modifier un circuit existant, seulement en ajouter ; si une modification est inévitable, prévoir une table de correspondance ancienne clé → nouvelle clé (lecture des records, classement, saisons).

#### DOC-001 — `docs/ARCHITECTURE.md` (« Physique : règles communes ») : sur les routes roulées et les loopings, la route guide le cap (`headingGuided`)
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `docs/ARCHITECTURE.md` (« Physique : règles communes »)
- **Affirmation du document** sur les routes roulées et les loopings, la route guide le cap (`headingGuided`)
- **Code actuel** retiré depuis `PHYS_VER` 37 (`pieces.js:435`, `physics/ribbon.js:276`) : il faut braquer

#### DOC-002 — `docs/ARCHITECTURE.md` : 182 scénarios (« Déterminisme ») et 161 (« Limites connues »)
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `docs/ARCHITECTURE.md`
- **Affirmation du document** 182 scénarios (« Déterminisme ») et 161 (« Limites connues »)
- **Code actuel** 193 dans `tools/phys-fingerprint.json`

#### DOC-003 — `docs/ARCHITECTURE.md` (« Limites connues ») : Firefox et Safari pas essayés ; STUN seulement
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `docs/ARCHITECTURE.md` (« Limites connues »)
- **Affirmation du document** Firefox et Safari pas essayés ; STUN seulement
- **Code actuel** tâche CI `moteurs` (Firefox, WebKit) ; fonction `ice` qui fournit un relais TURN

#### DOC-004 — `docs/ARCHITECTURE.md` (« Données et formats ») : la signature ignore le thème
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `docs/ARCHITECTURE.md` (« Données et formats »)
- **Affirmation du document** la signature ignore le thème
- **Code actuel** le **décor** (`this.decor`) est en tête de `signatureText` ; seul le thème de pièce `th` est ignoré

#### DOC-005 — `docs/ARCHITECTURE.md` (« Serveur ») : tables dans `etape1…5`
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `docs/ARCHITECTURE.md` (« Serveur »)
- **Affirmation du document** tables dans `etape1…5`
- **Code actuel** 19 étapes

#### DOC-006 — `docs/ARCHITECTURE.md` : records sous `shardway.rec3.*`
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `docs/ARCHITECTURE.md`
- **Affirmation du document** records sous `shardway.rec3.*`
- **Code actuel** vrai pour l'invité ; compte : `shardwayacct.<uid>.rec3.*`

#### DOC-007 — `js/verify.js` (en-tête) et donc `docs/MODULES.md` : la fonction serveur « le charge depuis le site du jeu »
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `js/verify.js` (en-tête) et donc `docs/MODULES.md`
- **Affirmation du document** la fonction serveur « le charge depuis le site du jeu »
- **Code actuel** elle l'embarque (`tools/build-function.mjs`)

#### DOC-008 — `js/joins.js` (en-tête) : utilisé par l'éditeur
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `js/joins.js` (en-tête)
- **Affirmation du document** utilisé par l'éditeur
- **Code actuel** importé seulement par des tests et outils

#### DOC-009 — `supabase/MULTI.md` : collisions plafonnées à ~4 g ; deux modes de salon
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `supabase/MULTI.md`
- **Affirmation du document** collisions plafonnées à ~4 g ; deux modes de salon
- **Code actuel** seule la poussée de pénétration est plafonnée ; trois modes (course, championnat, libre)

#### DOC-010 — `supabase/COMPTES.md` (fin) : le temps de l'auteur est « vérifié par le jeu à la publication mais pas rejoué par la base »
- **Type** Polish (documentation)
- **Priorité** P3
- **Niveau de certitude** Confirmé (relecture du code)
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Source** docs/comprendre/05 § 5.7
- **Validation** Corriger le document puis relancer `npm test` (tools/check-docs.mjs) ; relire l'affirmation contre le code cité.

**Détail d'origine (comprendre/05, repris sans perte)**

- **Document** `supabase/COMPTES.md` (fin)
- **Affirmation du document** le temps de l'auteur est « vérifié par le jeu à la publication mais pas rejoué par la base »
- **Code actuel** la fonction serveur le rejoue avant d'appeler `publish_track` (`verify.js : verifyPublish`)

#### RISK-002 — Le traducteur DOM anglais agit aussi sur les contenus des joueurs
- **Type** Bug technique (risque structurel)
- **Priorité** P3
- **Niveau de certitude** Confirmé (mécanisme) ; effet visible non reproduit
- **Lot de correction** LOT-12 — Documentation et règles de processus
- **Relations** COMPLETE-022, TECH-071
- **Source** Phase 0 / comprendre (ancien n° 10) ; Phase 1 §7.5

- **Description** En anglais, `DomTranslator` observe tout le document et réécrit ce que le jeu écrit en français ; seul `#opt-lang` est marqué `data-i18n="off"`. Les noms de circuits, pseudos, commentaires et noms de modes de joueurs passent donc par le dictionnaire (un circuit nommé « Jouer » s'afficherait « Play ») ; un modèle trop général peut capturer un autre texte (`logicText.js` a sa propre table pour cette raison).
- **Origine ou cause** Traduction par observation du DOM, sans distinction entre texte du jeu et texte de joueur.
- **Localisation** `js/i18n/dom.js`, `js/i18n.js`, `index.html:411`.
- **Conditions** Langue anglaise ; contenu de joueur identique à une clé du dictionnaire ou capturé par un modèle.
- **Impact** Affichage incorrect de contenus de joueurs ; risque accru à chaque nouvelle langue.
- **Correction ou solution envisagée** Marquer les contenus de joueurs (`data-i18n="off"` ou attribut dédié) à l'endroit où ils sont écrits ; test avec un nom de circuit « Jouer ».

## C. Problèmes de gameplay et problèmes visibles

Tout ce qu'un joueur peut rencontrer. Entrées principales ci-dessous ; l'index thématique suivant renvoie aussi vers les entrées techniques (B) qui ont une conséquence visible.

### C.0 Index thématique

| Thème | Entrées |
| --- | --- |
| Contrôles et entrées | TECH-004, 005, 006, 017, 020, 033, 065 |
| Déplacements, physique, véhicules | GAME-004, TECH-001 (plaques), 013 (vitesse de départ) |
| Collisions | TECH-041, 043 (multijoueur) ; aucun défaut de collision au sol constaté (hypothèses écartées, annexe 4) |
| Obstacles et logique de circuit | TECH-002 (obstacle au plafond), 014 (logique + chrono), 038 |
| Interactions entre mécaniques | TECH-001, 013, 014, 019 (verre + logique / qualité) |
| Niveaux, checkpoints, mort et réinitialisation | TECH-001, 013, 014, 015, GAME-007 (longs tronçons), TECH-072 |
| Blocages et softlocks | TECH-001 (boucle de chutes), 016 (jeu figé), GAME-006 (catégories infranchissables) ; TECH-010, 012 (salle bloquée ou morte) |
| Exploits involontaires | GAME-004 (téléportation, exploitabilité à confirmer), TECH-039, 040 ; **aucun raccourci de tracé** (annexe 4) |
| Progression | TECH-002 (publication impossible), 007, 028, 029, 030 (progression perdue ou non synchronisée), GAME-006, 007 |
| Interface, navigation, feedback | TECH-018, 061, 064, 065, 066, 067, 068, 069, 070, 071, 072 ; éditeur : TECH-003, 034…038, 052…062 |
| Multijoueur (expérience) | TECH-008, 009, 010, 042, 043, 047, 049, 085, 088, 089, GAME-008 |
| Stabilité et fluidité | TECH-015, 016, 063, 073 ; session longue sans dégradation (annexe 4) |

### C — LOT-2 — Course, entrées et cycle de vie (client)

#### TECH-004 — Entrée sur un bouton de la pause (ou de l'arrivée, du replay) relance la course
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Confirmé
- **Système** Entrées / course
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-005, TECH-006, TECH-017, TECH-020, TRANS-03
- **Source** Phase 1 TECH-004
- **Validation** Chromium : pause → Entrée sur « Reprendre » : la course reprend, chrono non remis à zéro ; idem « Retour au checkpoint », et « 🎬 Vidéo » du Theater. Compléter tools/test-browser.mjs.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium de l'audit délégué ; mécanisme relu (moi : `input.js` n'ignore que les champs de saisie).
- **Localisation** `js/ui.js : showOverlay()` (~l. 149, met le focus sur `.btn.primary` avec un pointeur fin) ; liaison par défaut `restart` = Entrée ; `js/race.js : update()` l. 477 ; `js/input.js` (les `keydown` venant d'un bouton ne sont pas ignorés).
- **Description** Le bouton principal de la pause (« Reprendre ») a le focus ; Entrée l'active **et** est lue comme l'action « recommencer » à l'image suivante.
- **Cause technique** Un même appui sert à l'activation native du bouton et au jeu (`pressed`), sans arbitrage.
- **Conditions** Clavier ; pause puis Entrée ; aussi « Retour au checkpoint » + Entrée (retour puis recommencer) ; dans le Theater, Entrée sur « 🎬 Vidéo » annule l'export et relance le replay.
- **Conséquences** La course en cours est perdue (état `countdown`, chrono à zéro) au moment où le joueur voulait reprendre.
- **Reproduction** Course, P, Entrée : état `countdown`, pas de course 311 → 0.
- **Piste** Ignorer les touches dont la cible est un bouton, ou vider `pressed` lors de l'activation d'un bouton de superposition ; ne pas donner le focus automatiquement au bouton de la pause.

#### TECH-005 — Manette : bouton A tenu = « valider » dès qu'une superposition s'ouvre (pause impossible, course relancée à l'arrivée)
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Confirmé
- **Système** Entrées
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-004, TRANS-03
- **Source** Phase 1 TECH-005
- **Validation** Manette simulée avec A tenu : la pause s'ouvre et reste ouverte ; à l'arrivée, l'écran de fin s'affiche sans relance.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium (manette simulée) de l'audit délégué.
- **Localisation** `js/main.js : frame()` l. 440-447 ; `js/input.js : pollGamepad()` et table `EDGE` ; `js/app/wiring.js : _padNav()`.
- **Description** A est une touche d'accélération par défaut (`[7, 0]`). Les fronts du mode « menu » ne sont suivis que pendant qu'une superposition est ouverte : leur état précédent est périmé (faux) au moment où elle s'ouvre, A tenu produit donc un front « valider » qui clique le bouton qui a le focus.
- **Conditions** Manette, accélération sur A, pause ou arrivée.
- **Conséquences** La pause est annulée aussitôt (impossible de mettre en pause en accélérant) ; à l'arrivée, la course est **relancée** et l'écran d'arrivée n'est jamais vu.
- **Reproduction** Manette simulée, A tenu : pause → état reste `racing` ; arrivée → `countdown`, pas 0. Sans A tenu : normal.
- **Piste** Suivre les fronts « menu » à chaque image, ou initialiser l'état précédent à l'ouverture ; ignorer « valider » tant que A n'a pas été relâché une fois.

#### TECH-006 — Capture de touche en attente qui survit à la navigation : touches réassignées à l'insu du joueur
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Confirmé
- **Système** Réglages / entrées
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-004, TECH-020, TRANS-03
- **Source** Phase 1 TECH-006
- **Validation** Case de liaison cliquée, retour, course, touche tenue : aucune liaison modifiée, la touche agit normalement. Idem capture de manette.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium de l'audit délégué ; mécanisme relu (moi : `input.capture` n'est annulée que par Échap ou une touche).
- **Localisation** `js/app/settings.js : captureKey` (~l. 123), `js/input.js` (~l. 138) ; capture de manette `_capturePad` (8 s de scrutation).
- **Description** Cliquer sur une case de liaison démarre une capture ; quitter l'écran ne l'annule pas ; la première touche pressée ensuite, même en course, est **liée** à l'action et retirée de la sienne, puis enregistrée.
- **Conditions** Ouvrir Paramètres › Commandes, cliquer une case, revenir, lancer une course.
- **Conséquences** Première touche de la course avalée ; commandes corrompues **durablement** (exemple : W retiré d'« Accélérer » et lié à « Retour au checkpoint »).
- **Reproduction** Case « Retour au checkpoint », « ← Retour », course, tenir W : vitesse 0, `accelerate = ["", "ArrowUp"]`, `respawn = ["KeyW", ""]`, enregistré.
- **Piste** Annuler `input.capture` (et la scrutation de manette) à chaque changement d'écran, d'onglet, `_dispose`, `playTrack`.

#### TECH-015 — Reprise après erreur de la boucle : retour au checkpoint non enregistré, record non rejouable
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Course
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-001, TECH-013, TECH-014, TRANS-04
- **Source** Phase 1 TECH-015
- **Validation** Injecter une erreur dans la boucle pendant une course, finir : le rejeu des commandes enregistrées redonne le même temps (écart de position 0 m) ; ou course marquée non vérifiable.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `js/main.js:236` appelle `S.respawn()` sans `true`) ; sonde Chromium de l'audit délégué.
- **Localisation** `js/main.js : _loopError()`.
- **Description** À la première erreur d'une série, le jeu ramène la voiture au checkpoint sans poser le drapeau `respawn` dans l'enregistrement.
- **Conséquences** Si le joueur finit et bat son record, les commandes enregistrées rejouent **une autre course** : replay, Theater, coach, référence d'entraînement faux ; l'envoi au classement est refusé (le serveur ne retrouve pas le temps). Sonde : position live / rejeu identiques sans erreur et avec la touche R, écart de 106,6 m après une erreur injectée.
- **Piste** Appeler `respawn(true)` ; si l'erreur a eu lieu au milieu de `_stepOnce`, marquer la course comme non vérifiable.

#### TECH-016 — Exception dans la construction d'une course : jeu figé (mode « course » sans session)
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Application
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-018
- **Source** Phase 1 TECH-016
- **Validation** Record dont les commandes sont invalides (`%%%not-base64%%%`) puis « Regarder mon record » : message clair, retour au menu ou à la fiche, aucune session fantôme, scène propre.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `main.js:205-210`) ; sonde Chromium de l'audit délégué.
- **Localisation** `js/main.js : playTrack()`, `js/app/theater.js : openTheater` : `_dispose()`, `mode = 'race'`, `setMode('race')` **avant** `new RaceSession(...)`, sans `try`.
- **Description** Si le constructeur lève une exception, l'application reste en mode « course » sans session : aucun écran, HUD visible, Échap et P sans effet ; objets à moitié construits laissés dans la scène.
- **Conditions** Exemple démontré : record dont les commandes ne sont pas du base64 valide (`decodeInputs` lève) — possible après l'import d'une sauvegarde ou des données du cloud, dont les chaînes de records ne sont pas validées — puis « Regarder mon record ».
- **Piste** Construire dans un `try`, libérer les objets partiels, revenir au menu avec un message ; valider les commandes avant de proposer « Regarder ».

#### TECH-017 — Commandes de course actives sous une fenêtre ouverte
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Course / interface
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-004, TECH-033, TRANS-03
- **Source** Phase 1 TECH-017
- **Validation** Pause › Commandes puis P ; Arrivée › Classement puis T ; bilans Académie / modes puis T, C, H : rien ne se passe sous la fenêtre.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** sonde Chromium de l'audit délégué ; code relu (`race.js:467-481` ne teste pas `ui.modalOpen`).
- **Description** P, T, C, H agissent derrière une fenêtre : Pause › « Commandes » puis P relance la course sous la fenêtre ; Arrivée › 🏆 Classement puis T relance la course derrière ; bilans de l'Académie et des modes (session `finished`, sans superposition) aussi.
- **Piste** Ignorer les actions de course quand une fenêtre est ouverte ; en course, mettre en pause.

#### TECH-018 — Résultat en ligne d'une course précédente affiché sur l'arrivée suivante
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Course / en ligne
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-066, TECH-049, TRANS-08
- **Source** Phase 1 TECH-018
- **Validation** Envoi simulé à 1,5 s, recommencer, finir en 60 s : l'écran de fin n'affiche pas le résultat du premier envoi.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : la garde `this.session !== session` de `main.js:288-318` ne voit pas un redémarrage de la même session) ; sonde de l'audit délégué.
- **Description** Envoi lent ; le joueur recommence et finit plus lentement : le second écran d'arrivée affiche « Classement mondial : 1er… meilleur temps du monde ! » du premier envoi (`el.className = …` retire aussi le `hidden` posé par `showFinish`).
- **Piste** Un jeton par arrivée (compteur incrémenté par `_finish` et `restart`) vérifié après chaque `await`.

#### TECH-020 — Boutons tactiles liés en dur à `KeyR`, `Escape`, `Enter` (et textes d'aide figés)
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Entrées
- **Lot de correction** LOT-2 — Course, entrées et cycle de vie (client)
- **Relations** TECH-004, TECH-006, TRANS-03
- **Source** Phase 1 TECH-020 ; ancien n° 11 de docs/comprendre/05 § 5.6
- **Validation** Respawn réassigné à Q et caméra à R : le bouton tactile « ⟲ » réapparaît ; les textes d'aide reflètent les liaisons.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `wiring.js:289-291`) ; sonde de l'audit délégué.
- **Description** Les boutons tactiles injectent des codes de touche ; si le joueur réassigne ces actions, le bouton fait autre chose (sonde : retour lié à Q, caméra à R → « ⟲ » change de caméra au lieu de réapparaître). Textes d'aide figés sur les touches par défaut (`<kbd>R</kbd>`, « Rejouer Entrée », `MSG.stuck`, fin de replay).
- **Piste** Déclencher les actions directement (file d'actions) ; produire les textes avec `keyLabel(bindings)`.

### C — LOT-3 — Éditeur de circuits

#### TECH-003 — Éditeur : la pose supprime des pièces que la nouvelle pièce ne touche pas
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-052, TECH-053, TRANS-01
- **Source** Phase 1 TECH-003 ; ancien n° 2 de docs/comprendre/05 § 5.6
- **Validation** Option armée incompatible puis pose d'une pièce : aucune pièce hors de l'empreinte réelle n'est supprimée (4 cas de la sonde). Test dans tools/test-editor.mjs ; l'aperçu et la pose donnent le même résultat.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; sonde de l'audit délégué.
- **Localisation** `js/editor/tools.js : _act()` l. 134-147 (`this.track.conflicts(tile)` sur la pièce **brute**) ; même calcul dans l'aperçu (`editor/pointer.js`, ~l. 496).
- **Description** Les options armées (mur, anneau, checkpoint, mouvement…) restent armées quand on choisit une pièce qui les refuse ; les conflits sont calculés avec ces options, puis la pièce est posée sans elles. Toutes les pièces du volume « fantôme » sont supprimées.
- **Cause technique** `norm = Track.normalize(tile)` n'est utilisé que pour `placeable` et les débordements ; `Track.range` / `cellsOf` de la pièce brute réservent ±2 niveaux (mur), +1/+2 (portique, anneau), des cases voisines (glissière), une couronne d'une case (rotation).
- **Conditions** Une option armée incompatible avec la pièce choisie (le seul signe : la mention « Option ignorée »).
- **Conséquences** Disparition silencieuse de pièces au-dessus, au-dessous ou à côté (souvent hors de vue) ; annulable seulement si le joueur s'en aperçoit.
- **Reproduction** Option « mur gauche » armée, poser un départ en (0,0) niveau 0 : la ligne droite au niveau 2 est supprimée (plage brute [−2, 2], réelle [0, 1]). Glissière armée + looping : deux pièces voisines supprimées. Rotation armée + bifurcation : trois voisines, dont la diagonale.
- **Piste** Calculer les conflits (et le test « pièce identique ») sur la pièce normalisée ; désarmer ou signaler les options refusées par la pièce choisie.

#### TECH-033 — Éditeur : raccourcis Ctrl actifs sous les fenêtres
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-017, TECH-004, TRANS-03
- **Source** Phase 1 TECH-033
- **Validation** Fenêtre « Circuit » ouverte, Ctrl+Z / Y / A / X / D / V : sans effet sur l'éditeur.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde Chromium de l'audit délégué) · **Localisation** `js/editor/pointer.js : _h.key` (l. 46-59) : ignore les champs de saisie, pas `ui.modalOpen` ; `update()` bloque les autres touches, cet écouteur non.
- **Description** Fenêtre « Circuit » ouverte, Ctrl+Z deux fois : 6 → 4 pièces derrière la fenêtre ; Ctrl+A crée une sélection ; Ctrl+X, D, V agissent aussi. La fenêtre applique ensuite ses valeurs périmées et son `_commit` tronque la pile « rétablir » : les pièces annulées sont perdues.
- **Piste** Ignorer les raccourcis de l'éditeur quand une fenêtre est ouverte.

#### TECH-034 — Éditeur : retour d'essai qui perd historique, presse-papiers, calques
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-035, TECH-002, TRANS-01
- **Source** Phase 1 TECH-034 ; ancien n° 3 de docs/comprendre/05 § 5.6
- **Validation** Poser une décoration libre, tester, revenir : historique, presse-papiers, calques masqués / verrouillés conservés ; l'outil « pièce perso » garde ses formes.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde Node par moi ; sondes Node et Chromium de l'audit délégué) · **Localisation** `js/editor.js:133` (`keep.history[keep.hIndex] === this.history[0]`) et l'arrondi de `Track.encode` (x, y, z, s au centième ; ry au millième).
- **Description** L'accrochage par défaut des décorations est « Libre » ; rotations (pas de π/12), échelles (×1,1), déplacements au gizmo ou vertical ne sont jamais arrondis en mémoire ; l'instantané relu depuis le code diffère, l'état mis de côté est jeté.
- **Conséquences** Après chaque essai : historique d'annulation, presse-papiers, options armées, réglages de décoration et **calques masqués / verrouillés** perdus (un calque verrouillé redevient modifiable). Effet secondaire : l'outil « pièce perso » revient sans ses formes, chaque clic affiche à tort « Maximum de 500 décorations atteint ». Chromium : sans décoration, historique 2 → 2 et calque masqué gardé ; avec un cône libre, 3 → 1 et calque perdu.
- **Piste** Comparer une forme canonique (instantané relu), ou arrondir les décorations à l'écriture comme le code.

#### TECH-035 — Éditeur : décorations modifiées sans normalisation (rétablir perdu, « modifié » à tort, solides inclinés)
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-034, TECH-002, TRANS-01
- **Source** Phase 1 TECH-035 ; ancien n° 8 de docs/comprendre/05 § 5.6
- **Validation** Inclinaison via l'inspecteur, puis annuler / rétablir : le rétablissement est intact ; un solide ne reçoit ni inclinaison ni roulis.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sondes de l'audit délégué ; mécanisme relu par moi : `inspector/bodies.js:244-248`, `solids.js:73`) · **Localisation** écritures directes dans `inspector/bodies.js : _decoBody`, `inspector/gizmo.js : _onGizmo`, `editor/pointer.js : _shiftY` ; normalisation dans `track/edit.js : addDeco`, rejouée par `editor/history.js : _restore`.
- **Description** L'instantané garde les valeurs brutes, la restauration les normalise : après annuler / rétablir, le circuit n'égale plus l'instantané courant ; le premier clic qui suit empile un pas fantôme et **efface la pile « rétablir »** ; un circuit enregistré paraît « modifié ». Les solides reçoivent inclinaison, roulis, « Retourner » et le gizmo trois axes : affichés inclinés dans l'éditeur, ils redeviennent droits au premier essai, enregistrement ou annulation (la physique et la course les voient droits).
- **Piste** Une seule fonction de normalisation (idempotente) pour toutes les écritures de décorations ; masquer inclinaison et roulis pour les solides.

#### TECH-036 — Éditeur : la gomme supprime des décorations de calques verrouillés ou masqués
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Source** Phase 1 TECH-036
- **Validation** Calque verrouillé ou masqué : gomme et clic droit n'effacent pas ses décorations.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `editor/tools.js : _erase` (l. 426-428) → `editor/pointer.js : _nearestDeco` (pas de filtre `_layerOk`, contrairement au rayon).
- **Description** Une décoration verrouillée à 2-3 m du curseur est effacée par la gomme ; une décoration invisible (calque masqué) par un clic droit avec l'outil décoration.
- **Piste** Filtrer `_nearestDeco` par calque (et la pipette, par cohérence).

#### TECH-037 — Éditeur : déplacer une pièce au gizmo change son demi-niveau
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Source** Phase 1 TECH-037
- **Validation** Pièce au niveau 0,5 glissée d'une case : reste au niveau 0,5.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `inspector/gizmo.js : _onGizmo` l. 79 (niveau arrondi à l'entier).
- **Description** Une pièce au niveau 0,5 (après une pente douce) glissée d'une case passe au niveau 1 ; la flèche verticale ne sait pas atteindre les demi-niveaux. La continuité de la route est cassée sans message.
- **Piste** Garder le niveau tant que l'axe vertical n'est pas tiré ; arrondir au demi-niveau.

#### TECH-038 — Éditeur : un groupe utilisé seulement par la logique est considéré libre
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Éditeur / logique
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-058
- **Source** Phase 1 TECH-038
- **Validation** Groupe cité par la logique (cachée au départ) : non proposé par « Nouveau groupe », non réattribué par la conversion des déclencheurs.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `editor/groups.js : openGroups` (l. 74) et `logicText.js : scriptsToLogic` : ignorent `lg.off` et les groupes cités par les règles.
- **Description** Logique « groupe 1 caché au départ » dont le groupe a été vidé : « Nouveau groupe » redonne le numéro 1 ; la conversion des déclencheurs range une route dans ce groupe : elle est cachée au départ, sans collision. Le vérificateur ne prévient plus dès que le groupe a des membres.
- **Piste** Compter comme utilisés les groupes cités par la logique.

#### TECH-052 — Éditeur : réservation des bords de pente au mur contournable
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-003, TRANS-01
- **Source** Phase 1 TECH-052
- **Validation** Les cinq chemins de la sonde (patch inspecteur, duplication, option, type, remplissage) refusent le débordement.

**Détail d'origine (phase 1, repris sans perte)** — `js/spill.js : spillConflicts` n'est appelé que par la pose, l'aperçu, le collage, le déplacement / rotation de sélection et « Prolonger » ; pas par `_applyTilePatch` (inspecteur, gizmo, Maj + glisser), la duplication, `toggleFlag` / `_reshape`, `_retypeTile`, `_fillEmpty`, la chaîne `widthBridge`, ni la lecture d'un code. Conséquence : une route traversée par le bord incliné d'une pente au mur (ce que la règle 0.12.6 voulait empêcher). Sonde de l'audit délégué : cinq chemins produisent la violation. Piste : un seul validateur de placement pour toutes les modifications.

#### TECH-053 — Éditeur : « Prolonger » peut poser plusieurs départs
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-003, TRANS-01
- **Source** Phase 1 TECH-053 ; ancien n° 9 de docs/comprendre/05 § 5.6
- **Validation** P trois fois avec le départ choisi : un seul départ.

**Détail d'origine (phase 1, repris sans perte)** — `editor/tools.js : extend` (l. 161-175) et `extend.js : extendPlan` ne traitent pas le départ, contrairement à `_act` (l. 148). P trois fois avec le départ choisi : 4 départs ; essai et vérification refusés (« un seul départ ») mais le circuit s'enregistre et se partage. Piste : refuser le départ dans `extendPlan`, ou retirer les autres comme `_act`.

#### TECH-054 — Éditeur : calques gardés au chargement d'un autre circuit ; annuler garde la vérification courante
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-034
- **Source** Phase 1 TECH-054
- **Validation** Importer après avoir masqué des calques : calques remis à zéro ; annuler un « Nouveau » conserve la vérification.

**Détail d'origine (phase 1, repris sans perte)** — `history.js : loadCode` / `newTrack` conservent `hiddenGroups` / `lockedGroups` : après import, les groupes 1, 2 du nouveau circuit sont invisibles ou verrouillés. `_restore` reprend `vt` / `vh` courants : annuler un « Nouveau » ou un import rend l'ancien circuit sans sa vérification. Piste : remettre les calques à zéro au chargement ; mettre `vt` / `vh` dans l'instantané.

#### TECH-055 — Éditeur : test depuis le curseur en gravité inversée sur un circuit `flip0`
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE) — Très probable : intention de conception à confirmer (LOT-0).
- **Niveau de certitude** Très probable
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Source** Phase 1 TECH-055
- **Validation** Test depuis le curseur sur un circuit `flip0` : le sens de gravité correspond à la pièce visée (intention à confirmer).

**Détail d'origine (phase 1, repris sans perte)** — TRÈS PROBABLE (intention à confirmer). `history.js:299` : `(t.v && …) || track.flip0 ? -1 : 1` : sur un circuit qui démarre au plafond, tester depuis une route ordinaire place la voiture en gravité inversée. Piste : le sens de gravité de la pièce visée, pas la règle de départ.

#### TECH-056 — Éditeur : la fenêtre « Circuit » arrondit la direction du vent (15° → 45°)
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TRANS-01
- **Source** Phase 1 TECH-056
- **Validation** Code avec windDir 30 : ouvrir et valider la fenêtre « Circuit » ne change ni la valeur ni la signature.

**Détail d'origine (phase 1, repris sans perte)** — `editor/palette.js : openParams` propose des pas de 45° alors que la règle accepte 15° : appliquer la fenêtre réécrit 30° en 45° et change la signature (codes venus d'ailleurs). Piste : pas de 15° dans la liste.

#### TECH-057 — Éditeur : « Tout sélectionner » oublie les décorations hors des pièces
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Source** Phase 1 TECH-057
- **Validation** Tout sélectionner : les décorations hors de l'emprise des pièces sont incluses.

**Détail d'origine (phase 1, repris sans perte)** — `editor/selection.js : selectAll` : rectangle calculé sur les pièces seules ; les décorations hors de cette emprise ne sont ni déplacées ni supprimées. Piste : inclure les décorations dans l'emprise.

#### TECH-058 — Éditeur : le collage garde les numéros de groupe
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-038
- **Source** Phase 1 TECH-058
- **Validation** Coller dans un autre circuit : groupes remis à 0 (ou choix proposé).

**Détail d'origine (phase 1, repris sans perte)** — `prefabs.js : clipToCode` / `clipFromTrack` gardent `g` : des pièces collées entrent dans un calque masqué ou une cible de logique du circuit de destination. Piste : remettre `g` à 0 au collage d'un autre circuit (ou le demander).

#### TECH-059 — Éditeur : impossible de sortir si l'enregistrement automatique échoue
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Source** Phase 1 TECH-059
- **Validation** Stockage plein : une option « quitter sans enregistrer » ou « exporter le code » est proposée.

**Détail d'origine (phase 1, repris sans perte)** — `app/editorFlow.js : leaveEditor` reste dans l'éditeur quand `autoSave` échoue (stockage plein, code > 400 Ko), sans « quitter sans enregistrer » ; le bandeau de mise à jour recharge quand même. Piste : proposer de quitter sans enregistrer ou d'exporter le code.

#### TECH-062 — Éditeur : la vue par niveau montre les calques masqués
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Éditeur / rendu
- **Lot de correction** LOT-3 — Éditeur de circuits
- **Relations** TECH-019
- **Source** Phase 1 TECH-062
- **Validation** Vue par niveau : les groupes masqués ne s'affichent pas, même atténués.

**Détail d'origine (phase 1, repris sans perte)** — `trackMesh.js : rebuild` envoie les pièces atténuées des groupes masqués vers le maillage atténué : elles s'affichent. Piste : filtrer par visibilité de groupe.

### C — LOT-4 — Noyau de simulation (physique, logique) — change PHYS_VER

#### TECH-001 — Réapparition sur une plaque de transformation : le véhicule redevient voiture, boucle de réapparitions sans fin
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Reproduit en jeu (GAME-001) ; phase 1 : CONFIRMÉ
- **Système** Noyau
- **Lot de correction** LOT-4 — Noyau de simulation (physique, logique) — change PHYS_VER
- **Relations** TECH-013, TECH-014, TECH-015, COMPLETE-002, TRANS-04, TRANS-14, GAME-001 (même problème, fusionné : observations de la phase 2 ci-dessous)
- **Source** Phase 1 TECH-001 ; Phase 2 GAME-001
- **Validation** Rejouer la reproduction (circuit à plaque deltaplane + anneau, puis R) : le véhicule restauré est le deltaplane, plus aucune chute en boucle. Ajouter à tools/test-simulation.mjs un retour au checkpoint sur / après chaque plaque (moto, bateau, deltaplane) ; nouveau scénario dans l'empreinte (PHYS_VER) ; rejeu serveur identique.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi).
- **Localisation** `js/physics.js : place()` (remet `plateLock = ''`), `_setGround()` → `_transformPlate()` (bascule « même plaque = retour à la voiture ») ; `js/simulation.js : placeAtRespawn()` ; `js/raceLogic.js : update()` (point de retour d'un checkpoint) et `_ringRespawn()` (dernier sol relevé, `lastGround`).
- **Description** Quand le point de retour se trouve sur une plaque moto, bateau ou deltaplane, la voiture réapparaît avec le bon véhicule, puis le premier contact avec la plaque la **retransforme en voiture**.
- **Cause technique** `place()` réarme les plaques (`plateLock = ''`) ; `_setGround` (avec déclenchement) voit la plaque et appelle `_transformPlate`, qui bascule : `vehicle === PLATES[mod] ? 'car' : PLATES[mod]`. Le véhicule venant du point de retour, la bascule l'annule. Même effet si le point de retour est *avant* la plaque avec le véhicule d'*après* (checkpoint aérien : véhicule pris au moment de l'anneau, position du dernier sol).
- **Conditions** checkpoint (option `cp`) posé sur une plaque, ou checkpoint aérien franchi après une plaque (cas typique : plaque deltaplane puis anneaux en vol) ; un retour au checkpoint (touche R, hors-piste, noyade).
- **Conséquences** Le joueur repart en voiture là où le circuit exige un deltaplane, une moto ou un bateau : il tombe, réapparaît au même endroit en voiture… **boucle sans fin** ; seul « Recommencer » en sort. Identique au rejeu et au serveur (déterministe), donc pas d'incohérence de temps, mais blocage du joueur. Aucun circuit intégré n'est touché le long du trajet du pilote automatique (balayage des 5 circuits à plaques) ; les circuits de joueurs le sont.
- **Reproduction** Circuit `scriptTrack('g', 'start S2 S.e GC2 S3 finish')` ; gaz à fond jusqu'au checkpoint aérien ; `sim.rewind()` ; continuer gaz à fond 60 s : **43 réapparitions, jamais d'arrivée**, véhicule `car` à chaque fois. Checkpoint au sol sur plaque moto / deltaplane / bateau : après retour et 3 pas, véhicule `car`.
- **Piste** Au placement d'un point de retour, armer `plateLock` sur la plaque sous la voiture (ou mémoriser la plaque dans le point de retour) ; pour un checkpoint aérien, prendre le véhicule du moment de `lastGround`. Ajouter un scénario à l'empreinte de physique (changement voulu : `PHYS_VER`).

**Observations de la phase 2 (GAME-001, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** Reproduit (dans Chromium, au clavier) · **Type** bug · **Phase 1** [TECH-001](PHASE1-AUDIT-TECHNIQUE.md)
- **Mécanique** plaques de transformation (deltaplane, moto, bateau), checkpoints, retour au checkpoint · **Contexte** circuit partagé par lien, construit comme un joueur pourrait le faire : départ, deux lignes droites, plaque deltaplane, vide de deux cases avec un checkpoint aérien, trois lignes droites, arrivée.
- **Étapes** 1. Ouvrir le lien `#t=…` du circuit, « Jouer ». 2. Accélérer (flèche haut) : la voiture devient deltaplane sur la plaque et franchit l'anneau du checkpoint (véhicule `glider`, 42 m/s). 3. Appuyer sur R. 4. Continuer d'accélérer.
- **Observé** Après R, la voiture réapparaît **en voiture** (chrono 5,28 s), tombe dans le vide, réapparaît, retombe : 15 réapparitions en 24 s de jeu, toujours en voiture, chrono qui boucle entre 5,2 et 6,9 s ; message « Hors piste » à chaque fois (capture : voiture en pleine retransformation sous l'anneau).
- **Attendu** Réapparaître en deltaplane, comme au passage du checkpoint.
- **Conséquences** Le joueur est bloqué ; seule « Recommencer » (T) en sort, et la même chose recommence s'il réappuie sur R ou chute après l'anneau. Aucun circuit intégré n'est touché le long du trajet prévu ; tout circuit de joueur qui pose un checkpoint après une plaque l'est.
- **Systèmes** physique (`place`, `_transformPlate`), règles de course (point de retour), course en direct.
- **Piste** voir TECH-001.

#### GAME-004 — Téléportation de 59 m sur un double looping pendant une chute
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN) — À promouvoir en P1 si une trajectoire reproductible qui déclenche la téléportation est trouvée (déterministe : le serveur l'accepterait).
- **Niveau de certitude** Reproduit (simulation Node avec la physique du jeu, pas en navigateur)
- **Lot de correction** LOT-4 — Noyau de simulation (physique, logique) — change PHYS_VER
- **Relations** TECH-001, TECH-013, TRANS-04
- **Source** Phase 2 GAME-004
- **Validation** Rejouer la graine 348437 sur « Épave » : plus de saut de position > quelques mètres ; refaire le fuzz de 144 courses : aucun saut > 3 m ; nouveau scénario dans l'empreinte (PHYS_VER) ; rejeu serveur identique.

**Détail d'origine (phase 2, repris sans perte)**

- **Gravité** MOYEN · **Certitude** Reproduit (physique du jeu, déterministe : même résultat au rejeu et sur le serveur) · **Type** bug · **Phase 1** non répertorié (**nouveau**)
- **Contexte** « Épave » (chapitre 8), sous le double looping (pièce `loopDouble` en (0, −15), niveau 12).
- **Étapes** Partie maladroite (pilote automatique perturbé, graine 348437) : la voiture quitte la route et tombe à 46 m/s sous le looping, à t = 68,03 s.
- **Observé** En un seul pas de 1/120 s, la voiture passe de (70,6 ; 53,6 ; −470,5), en chute libre, à (45,2 ; 79,4 ; −423,9), **posée sur le looping, 59 m plus loin et 26 m plus haut**, avec un évènement de réception.
- **Cause** `js/physics/ribbon.js : _tryLandRibbon` cherche le point du ruban le plus proche (33 échantillons puis 4 affinages) et n'accepte la réception que si l'écart **en travers** (1,2 m) et **selon la normale** (−0,5 m) sont petits ; l'écart **le long de la route** (ici 59,3 m) n'est jamais contrôlé, et l'affinage n'a pas convergé sur ce ruban très courbe (longueur 222 m).
- **Attendu** La voiture continue de tomber (et réapparaît) ou se pose là où elle touche réellement une route.
- **Conséquences** Téléportation visible ; selon l'endroit, elle peut faire gagner ou perdre beaucoup de temps et, étant déterministe, elle serait acceptée par le serveur (raccourci exploitable si quelqu'un trouve une trajectoire qui la déclenche).
- **Piste** Refuser la réception si l'écart le long de la route dépasse quelques mètres après l'affinage ; ajouter le cas à l'empreinte de physique (changement de `PHYS_VER`).

#### TECH-013 — Vitesse de départ (`v0`) perdue au retour au point de départ
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Reproduit en jeu (GAME-005) ; phase 1 : CONFIRMÉ
- **Système** Noyau
- **Lot de correction** LOT-4 — Noyau de simulation (physique, logique) — change PHYS_VER
- **Relations** TECH-001, TECH-014, TRANS-04, GAME-005 (même problème, fusionné : observations de la phase 2 ci-dessous)
- **Source** Phase 1 TECH-013 ; Phase 2 GAME-005
- **Validation** v0 = 200 : après 30 pas puis R avant le 1er checkpoint, la vitesse est celle du départ ; mode « Départ lancé » dans Chromium ; scénario ajouté à l'empreinte ; rejeu serveur identique.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi).
- **Localisation** `js/raceLogic.js : placeAtStart()` (applique `v0`) contre `js/simulation.js : placeAtRespawn()` (ne l'applique pas) ; point de retour initial posé par `RaceLogic.reset()`.
- **Description** Un retour au checkpoint avant le premier checkpoint ramène au départ avec le chrono à zéro, mais **à l'arrêt** au lieu de la vitesse de départ.
- **Conditions** Règle `v0 > 0` : mode « Lancée » (`BUILTIN_MODES`), catégories de record `v0-100` / `v0-200` (`variants.js`), circuits de joueurs ; aussi la grille d'un championnat.
- **Conséquences** Le retour est plus pénalisant que « Recommencer » ; si l'ouverture du circuit exige l'élan (saut), le joueur tombe et réapparaît sans fin à l'arrêt. Comportement identique au rejeu (pas d'incohérence de temps).
- **Reproduction** `v0 = 200` : vitesse 55,6 m/s au départ ; après 30 pas puis `sim.rewind()` : 0 m/s, chrono 0.
- **Piste** Appliquer la vitesse de départ quand le point de retour est le départ (ou mémoriser la vitesse dans le point de retour initial) ; changement de physique (`PHYS_VER`).

**Observations de la phase 2 (GAME-005, repris sans perte)**

- **Gravité** MOYEN · **Certitude** Reproduit (Chromium, touche R) · **Type** bug · **Phase 1** [TECH-013](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** Modes › « Départ lancé » sur « Premiers Éclats » ; au départ la voiture roule à 54,8 m/s (200 km/h) ; appuyer sur R avant le premier checkpoint.
- **Observé** Retour au départ, chrono à 0,2 s, vitesse **0 m/s**.
- **Attendu** Repartir lancé (ou équivalent à « Recommencer »).
- **Conséquences** Le retour est plus pénalisant que recommencer ; si l'ouverture du circuit exige l'élan, le joueur chute en boucle. Concerne aussi les catégories de record `v0-100` / `v0-200`.

#### TECH-014 — Multijoueur : règles de logique déclenchées par le temps jamais rejouées après un retour au checkpoint
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Noyau / logique
- **Lot de correction** LOT-4 — Noyau de simulation (physique, logique) — change PHYS_VER
- **Relations** TECH-001, TECH-013, TRANS-04
- **Source** Phase 1 TECH-014
- **Validation** Groupe caché au départ + règle « à 6 s : montrer » : après un retour avec keepClock, le groupe est affiché ; couvrir dans tools/test-logique.mjs et tools/test-manche.mjs.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi).
- **Localisation** `js/raceLogic.js : rewind({ keepClock })` (restaure l'état de la logique, pas le chrono) ; `js/sim/logic.js : onStep` (`fire('time', on[1] === race.steps)`).
- **Description** En multijoueur, le chrono continue après un retour ; l'état de la logique revient à celui du checkpoint ; une règle « au temps T » déjà passée ne se redéclenche jamais.
- **Conditions** Multijoueur sur un circuit (de joueur) dont la logique utilise l'évènement « temps » ; retour à un point pris avant T.
- **Conséquences** Un groupe montré par la règle (un pont, une route) reste caché pour le reste de la course : course parfois impossible à finir.
- **Reproduction** Groupe caché au départ, règle « à 6 s : montrer » ; à 8 s, retour avec `keepClock` : 5 s plus tard (chrono 13 s) le groupe est toujours caché ; sans `keepClock` (solo), la règle se redéclenche.
- **Piste** En `keepClock`, rejouer les règles « temps » dont l'échéance est passée, ou ne pas restaurer leur état ; documenter dans le vérificateur de logique.

### C — LOT-5 — Modèle de circuit, signature et clés de classement

#### TECH-002 — Obstacle roulé de 180° : signe du roulis inversé à chaque lecture, clé et vérification instables
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Reproduit en jeu (GAME-009) ; phase 1 : CONFIRMÉ
- **Système** Modèle / éditeur / serveur
- **Lot de correction** LOT-5 — Modèle de circuit, signature et clés de classement
- **Relations** TECH-039, TECH-035, TECH-034, TRANS-01, TRANS-12, GAME-009 (même problème, fusionné : observations de la phase 2 ci-dessous)
- **Source** Phase 1 TECH-002 ; Phase 2 GAME-009
- **Validation** décoder → encoder → décoder un obstacle roulé de π : roulis et signature stables. Ajouter au corpus de compatibilité (tools/compat). Chromium : Vérifier → Retour à l'éditeur : le circuit reste « vérifié » ; verifyPublish accepte le code.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** sonde Node (moi), après l'audit délégué de l'éditeur.
- **Localisation** `js/track/edit.js : addDeco()`, bloc du roulis des obstacles (l. 147-151) ; `js/track.js : signatureText()` (`':z' + rz.toFixed(2)`).
- **Description** Un obstacle roulé de π (posé au plafond) voit son roulis passer de `3.142` à `-3.142`, puis l'inverse, à **chaque** lecture du code : la signature et la clé `u-…` alternent entre deux valeurs.
- **Cause technique** Normalisation non idempotente : la valeur est ramenée dans ]−π, π] (test `v > π + 1e-6`), arrondie à π/4, **puis** à 3 décimales : π devient `3.142`, qui est > π + 1e-6 et repasse à `-3.142` à la lecture suivante.
- **Conditions** Un obstacle « au plafond » : `orient.js : obstacleRollOn` renvoie π pour une route à l'envers, et l'inspecteur propose « Au plafond ». Aucun circuit intégré n'en contient.
- **Conséquences** Le circuit vérifié dans la course n'est plus vérifié au retour dans l'éditeur ; la publication échoue (« Circuit non vérifié ») ; **tout envoi de temps est refusé** (« Le code du circuit ne correspond pas », la clé calculée en course diffère de celle du code relu par le serveur) ; les records locaux se répartissent sur deux clés.
- **Reproduction** `addDeco({ k: 'spikes', …, rz: Math.PI })` puis `Track.decode(t.encode())` répété : `rz` = 3.142 / −3.142 / 3.142…, signature `p74uqk` / `sm24rr` en alternance.
- **Piste** Normaliser après l'arrondi, ou choisir une valeur canonique pour ±π ; ajouter un test « lire → écrire → lire » de la signature avec `rz = π` au corpus de compatibilité.

**Observations de la phase 2 (GAME-009, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** Reproduit (Chromium : éditeur, « Vérifier », course au clavier, retour) · **Type** bug · **Phase 1** [TECH-002](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** 1. Ouvrir dans l'éditeur un circuit contenant des piques roulées de 180° (posées au plafond). 2. « Vérifier » : finir la course (5,008 s) ; la fenêtre « Circuit vérifié ✔ » s'affiche. 3. « Retour à l'éditeur ».
- **Observé** L'éditeur propose de nouveau « 🏁 Vérifier et publier » : le circuit n'est **plus vérifié** (temps de l'auteur gardé, signature passée de `1j9bsfk` en course à `x1o7or` dans l'éditeur). Recommencer la vérification reproduit la même bascule.
- **Attendu** Circuit vérifié, publiable.
- **Conséquences** L'auteur ne peut jamais publier ce circuit ; s'il le partage, les temps des autres joueurs sont refusés par le classement en ligne (non observable hors ligne, démontré en phase 1).

### C — LOT-7 — En ligne, SQL, serveur et exploitation

#### TECH-021 — Classement mondial dégradé : colonne `ghost_veh` jamais autorisée en lecture
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé dans le code et le SQL du dépôt ; production à vérifier
- **Système** En ligne / SQL
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** COMPLETE-005, TRANS-10, TRANS-15
- **Source** Phase 1 TECH-021 ; ancien n° 1 de docs/comprendre/05 § 5.6
- **Validation** Après le correctif SQL : la 1re requête du classement réussit, boutons 👻, titres et véhicule affichés ; verify-prod.sql contrôle has_column_privilege ; tools/test-securite-sql.sh et test-etape*-sql.sh.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ dans le code et les étapes SQL du dépôt ; état de la base de production À VÉRIFIER · **Vérification** moi (toutes les autorisations sur `scores` relues).
- **Localisation** `js/online.js : leaderboard()` l. 320 ; `supabase/etape5-securite.sql:14-15` (révoque la lecture de la table, accorde une liste de colonnes), `etape7-fantomes.sql:20` (`has_ghost`), `etape9-secteurs.sql:15` (`splits`).
- **Description** Les deux premières requêtes demandent `ghost_veh`, jamais accordée : refus de PostgreSQL ; la troisième, sans `has_ghost` ni titre, est utilisée. Toute autre erreur passagère de la première est aussi avalée.
- **Conséquences** Pas de bouton 👻, pas de titres, colonne véhicule vide dans le classement mondial ; deux requêtes perdues à chaque affichage ; appliquer d'autres étapes plus tard n'y changera rien.
- **Piste** Accorder `select (ghost_veh)` ou ajouter un repli sans cette colonne ; faire contrôler par `verify-prod.sql` la **lisibilité** (`has_column_privilege`), pas seulement l'existence.

### C — LOT-8a — Multijoueur — état de la salle et championnat

#### TECH-008 — Multijoueur : `Room.started` jamais remis à faux → invités du salon lancés en course à chaque choix de circuit
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Reproduit en jeu (GAME-002) ; phase 1 : CONFIRMÉ
- **Système** Multijoueur
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TECH-042, TECH-084, GAME-008, TRANS-05, GAME-002 (même problème, fusionné : observations de la phase 2 ci-dessous)
- **Source** Phase 1 TECH-008 ; Phase 2 GAME-002 ; ancien n° 7 de docs/comprendre/05 § 5.6
- **Validation** Trois onglets (?net=local) : après retour au salon, l'hôte change de circuit : les invités restent au salon. Aussi après « Arrêter le championnat » et après une course unique terminée. Étendre tools/test-net.mjs / test-manche.mjs.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; scénarios multi-salles de l'audit délégué.
- **Localisation** `js/net/room.js` : champ `started` (l. 70), mis à vrai dans `_begin`, `startCup`, `_beginRound`, `_onCup` ; envoyé par `_sendTrack` (l. 375) ; appliqué par `_onMessage 'track'` (l. 315).
- **Description** Une fois une course lancée dans la salle, chaque message `track` porte `started: true` ; tout invité qui le reçoit dans le salon est lancé en course 1,5 s plus tard.
- **Conditions** L'hôte choisit un autre circuit, un lien se rouvre, un arrivant rejoint, après « Arrêter le championnat » ou une course unique terminée.
- **Conséquences** Les invités sont jetés dans une course libre à chaque fois que l'hôte parcourt la liste des circuits ; fenêtre du salon fermée, tableau effacé ; un arrivant est lancé alors que tout le monde est au salon.
- **Reproduction** Deux changements du menu de circuits par l'hôte → 3 départs pour un invité au salon ; un arrivant passe en `racing` alors que l'hôte est au salon.
- **Piste** Remettre `started` à faux au retour au salon et à la fin d'un championnat, ou le déduire de l'état réel de l'hôte ; ne jamais lancer sur un simple choix de circuit.

**Observations de la phase 2 (GAME-002, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** Reproduit (trois onglets, multijoueur local du jeu, vrai WebRTC) · **Type** bug · **Phase 1** [TECH-008](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** 1. Hôte : « Créer une salle » ; invité : lien d'invitation. 2. Mode « Course libre », circuit « Premiers Éclats », « Lancer la course ». 3. Tout le monde quitte la course et revient au salon. 4. L'hôte choisit simplement un autre circuit dans la liste (« Canyon Corail »).
- **Observé** Les deux invités quittent le salon et se retrouvent **en course** sur Canyon Corail (chrono qui tourne, capture), pendant que l'hôte est toujours au salon ; le tableau de la salle les montre avec l'hôte comme s'il courait.
- **Attendu** Les invités restent au salon jusqu'à « Lancer la course ».
- **Conséquences** Impossible de choisir tranquillement le circuit suivant : chaque essai de l'hôte éjecte ses invités ; confusion sur qui court quoi.
- **Systèmes** salle multijoueur (`Room.started`), salon (`app/multi.js`).

#### TECH-042 — Multijoueur : temps d'arrivée (course libre) attribué au mauvais circuit
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TECH-008, TECH-049, TRANS-05
- **Source** Phase 1 TECH-042
- **Validation** Arrivée envoyée pendant un changement de circuit : créditée au bon lancement ; un arrivant garde les temps synchronisés.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `room.js` (`finish`, `reportFinish`, `_begin`), `app/multi.js : _startMultiRace` (l. 400-408).
- **Description** Le message `finish` ne porte ni circuit ni numéro de lancement : une arrivée en vol pendant un changement de circuit, ou faite pendant le chargement du suivant (l'ancienne session tourne encore), est créditée au nouveau circuit ; les tableaux divergent d'un joueur à l'autre ; un arrivant perd les meilleurs temps déjà synchronisés quand le message `track` arrive après eux.
- **Piste** Numéro de lancement dans `start`, `track`, `finish` ; ignorer les messages d'un autre lancement.

#### TECH-047 — Multijoueur : fin de manche manquée jamais signalée au joueur revenu
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TECH-048, TRANS-05
- **Source** Phase 1 TECH-047
- **Validation** Joueur revenu après la clôture d'une manche : écran de résultats, course arrêtée.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `room.js : _onCup` (~l. 539-546).
- **Description** Un joueur qui revient après la clôture reçoit les résultats dans l'état mais aucun évènement `cupround` : pas d'écran de résultats, course jamais arrêtée (`cupRoundOver`), il est jeté dans la manche suivante.
- **Piste** Émettre `cupround` quand l'état reçu fait avancer la phase.

#### TECH-049 — Multijoueur : deux chargements de circuit concurrents, le dernier arrivé gagne
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TECH-018, TECH-042, TRANS-05, TRANS-08
- **Source** Phase 1 TECH-049
- **Validation** Deux lancements rapprochés (circuit lent puis intégré) : c'est la dernière demande qui gagne.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `app/multi.js : _startMultiRace` (l. 400-408).
- **Description** Un circuit de la communauté lent à télécharger, lancé juste avant un circuit intégré, remplace ce dernier à la fin de son téléchargement : l'invité court le mauvais circuit et est crédité sur l'autre tableau.
- **Piste** Ignorer un chargement qui n'est plus la dernière demande.

#### GAME-008 — Arrivant pendant une « Course » (championnat d'une manche) : salon sans circuit affiché
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Reproduit
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TECH-008, TECH-047, TRANS-05
- **Source** Phase 2 GAME-008
- **Validation** Arrivant pendant une manche en mode « Course » : circuit visible et message « manche en cours ».

**Détail d'origine (phase 2, repris sans perte)**

- **Gravité** FAIBLE · **Certitude** Reproduit (trois onglets) · **Type** feedback / bug d'affichage · **Phase 1** —
- **Observé** En mode « Course », un joueur qui rejoint pendant la manche reste au salon avec **aucun circuit choisi** (alors que les autres voient « Premiers Éclats »), même après le retour des autres au salon ; rien ne lui dit qu'une manche est en cours ni quand il pourra jouer.
- **Attendu** Voir le circuit et un message « manche en cours, tu joueras la suivante ».

#### TECH-085 — Multijoueur : classement général qui compte des joueurs n'ayant jamais couru
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8a — Multijoueur — état de la salle et championnat
- **Relations** TRANS-05
- **Source** Phase 1 TECH-085
- **Validation** Classement général sans les joueurs qui n'ont jamais couru ; départage cohérent.

**Détail d'origine (phase 1, repris sans perte)** — `room.js:469` nomme tous les membres (liens en échec, absents, incompatibles) ; départage par somme des places (`championship.js:84`) : un joueur qui n'a jamais couru passe devant des participants à 0 point ; la somme des places avantage qui a joué moins de manches. Piste : ne nommer que la grille ; moyenne des places.

### C — LOT-8b — Multijoueur — présence, signalisation, liens

#### TECH-010 — Multijoueur : hôte absent ou qui recharge → manches bloquées, « Salle introuvable », salle définitivement fermée
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TECH-011, TECH-012, TECH-046, TRANS-06
- **Source** Phase 1 TECH-010
- **Validation** Scénarios à horloge simulée (tools/test-net.mjs) : hôte coupé < 20 s, hôte qui recharge et rejoint, plus petit identifiant devenant hôte : manches closes à temps, salle rejoignable, flag hôte republié.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** scénarios de l'audit délégué (horloge simulée) ; mécanisme relu (moi : `hostId` = plus petit identifiant marqué hôte).
- **Localisation** `js/net/room.js : hostId` (~l. 237-242), `_expireAway` (~l. 192), `_drop` (~l. 199-209), `_onPeer` (~l. 251), `_open` (~l. 126).
- **Description** Pendant ses 20 s d'absence, l'hôte reste `hostId` : personne ne clôt ni ne lance de manche ; un arrivant obtient « Salle introuvable » (personne n'est marqué hôte dans la présence). L'hôte qui recharge et rejoint s'annonce non-hôte : « Salle introuvable » ; sa tentative remet à zéro son délai d'absence chez les autres (+20 s à chaque essai). Si l'invité de plus petit identifiant devient hôte par défaut, personne ne republie `host: true` : la salle n'accepte **plus jamais** d'arrivant.
- **Conditions** Coupure ou rechargement de la page de l'hôte.
- **Conséquences** Manches bloquées au moins 20 s, sans fin si l'hôte réessaie ; salle définitivement fermée aux nouveaux joueurs.
- **Reproduction** Hôte coupé : manche close 20 000 ms après ; hôte qui rejoint : `not-found`, manche close 30 000 ms après ; 25 s après, `a.isHost = true` mais `meta.host = false`, un nouveau joueur reçoit « Salle introuvable ».
- **Piste** Rendre le rôle d'hôte à celui qui revient avec un jeton de reprise valide ; ne pas remettre à zéro le délai d'absence sur un retour non relié ; appeler `_becomeHost` dès que `isHost` change ; laisser rejoindre une salle dont l'hôte est absent.

#### TECH-046 — Multijoueur : une coupure de la signalisation coupe tous les liens de jeu sains
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8b — Multijoueur — présence, signalisation, liens
- **Relations** TECH-010, TRANS-06
- **Source** Phase 1 TECH-046
- **Validation** Coupure de la signalisation de 5 s : les liens WebRTC restent ouverts, les voitures ne se figent pas.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code) · **Localisation** `room.js : _lost` (~l. 151) → `_markAway` → `mesh.removePeer` (~l. 189).
- **Description** Une coupure de la WebSocket (Realtime) ferme aussi les liens WebRTC, qui marchaient : toutes les voitures se figent ; les arrivées en course libre envoyées pendant la coupure sont perdues (seul le meilleur temps est renvoyé).
- **Piste** Garder les liens WebRTC ouverts pendant la reconnexion de la signalisation.

### C — LOT-8c — Multijoueur — voitures distantes et collisions

#### TECH-009 — Multijoueur : un joueur arrivé (ou revenu) pendant une course n'apparaît jamais
- **Type** Bug gameplay
- **Priorité** P1 (gravité d'origine : ÉLEVÉ)
- **Niveau de certitude** Reproduit en jeu (GAME-003) ; phase 1 : CONFIRMÉ
- **Système** Multijoueur
- **Lot de correction** LOT-8c — Multijoueur — voitures distantes et collisions
- **Relations** TECH-043, TECH-044, TRANS-06, GAME-003 (même problème, fusionné : observations de la phase 2 ci-dessous)
- **Source** Phase 1 TECH-009 ; Phase 2 GAME-003 ; ancien n° 7 de docs/comprendre/05 § 5.6
- **Validation** Arrivant en cours de course libre : toutes les voitures distantes visibles de part et d'autre ; même chose pour un joueur parti puis revenu avec le même identifiant.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** CONFIRMÉ · **Vérification** code relu (moi : `js/race/net.js:10-25`) ; sonde de l'audit délégué.
- **Localisation** `js/race/net.js : _setupRemotes()`.
- **Description** Les voitures distantes sont créées une fois, d'après `room.list` au début de la session ; aucun écouteur pour les arrivées ; `_onSnap` ignore les paquets d'inconnus ; `_onLeft` supprime définitivement.
- **Conditions** Course libre (où rejoindre une course en cours est annoncé) ; joueur parti (au revoir ou > 20 s) puis revenu.
- **Conséquences** L'arrivant est invisible pour tous les joueurs déjà en course jusqu'à la fin ; en championnat, aucune collision avec lui.
- **Reproduction** 40 paquets d'un arrivant reçus, `remote.has(id)` faux ; même résultat pour un joueur revenu avec le même identifiant.
- **Piste** Créer la voiture distante à l'arrivée d'un membre ou à son premier paquet ; la recréer après un départ suivi d'un retour.

**Observations de la phase 2 (GAME-003, repris sans perte)**

- **Gravité** ÉLEVÉ · **Certitude** Reproduit (trois onglets) · **Type** bug · **Phase 1** [TECH-009](PHASE1-AUDIT-TECHNIQUE.md)
- **Étapes** Course libre en cours entre l'hôte et un invité ; un troisième joueur rejoint par le lien.
- **Observé** Le nouveau joueur est lancé directement en course et voit les **deux** autres (2 voitures distantes) ; l'hôte, lui, ne voit toujours qu'**une** voiture distante, et ce jusqu'à la fin.
- **Attendu** Tous les joueurs se voient.
- **Conséquences** Course « fantôme » asymétrique, classement en direct incomplet ; en championnat, pas de collision avec ce joueur.

#### TECH-041 — Multijoueur : collisions douces jusqu'à 8 m/s par pas, cumulées
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8c — Multijoueur — voitures distantes et collisions
- **Relations** TECH-043
- **Source** Phase 1 TECH-041 ; ancien n° 7 de docs/comprendre/05 § 5.6
- **Validation** Mesures du banc (face-à-face 2 × 50 m/s, sept voitures empilées, paquets forgés) : variation de vitesse plafonnée par pas, rebond cohérent ; corriger supabase/MULTI.md.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (code relu par moi : `collide.js:44` ; mesures de l'audit délégué) · **Localisation** `js/net/collide.js` (l. 44-46) ; `js/race/net.js : _collide`.
- **Description** Seule la poussée de pénétration est plafonnée (0,32 m/s par pas, ≈ 4 g, ce que dit `supabase/MULTI.md`) ; le terme de vitesse d'approche ajoute jusqu'à 8 m/s **par pas** (≈ 100 g), additionné pour chaque voiture en contact (jusqu'à 7 × 8,32 m/s). Chaque côté applique « sa moitié » contre la vitesse **d'avant** le choc de l'autre : l'échange est environ doublé (face-à-face à 2 × 50 m/s : rebond à ± 41 m/s au lieu de ± 17,5 prévus). Des paquets fabriqués qui suivent une voiture lui donnent des centaines de m/s.
- **Piste** Plafond global par pas, terme d'approche borné, vitesse de l'autre prise en compte, vitesses distantes aberrantes rejetées ; corriger `MULTI.md`.

#### TECH-043 — Multijoueur : voitures distantes figées mais toujours collisionnables
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8c — Multijoueur — voitures distantes et collisions
- **Relations** TECH-009, TECH-041, TRANS-06
- **Source** Phase 1 TECH-043
- **Validation** Lien mort : la voiture distante est masquée et non collisionnable après ≈ 0,5 s ; joueur revenu au salon : disparaît de la piste.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ (sonde de l'audit délégué) · **Localisation** `net/interp.js` (l. 170-174 : reste « prêt » sans paquets), `remoteCar.update`, `race/net.js : _collide`, `presentState`.
- **Description** Sans paquets, la voiture reste affichée (plus 0,25 s d'extrapolation) avec sa dernière vitesse, et reste dans les collisions ; le disque de collision est en plus avancé de vitesse × (0,1 s + rtt/2). Pendant 20 s (absent), indéfiniment si le lien est mort mais la présence reste ; en course libre, les joueurs revenus au salon restent sur la piste.
- **Conséquences** Un mur invisible à quelques mètres devant une voiture qu'on traverse.
- **Piste** Masquer et exclure des collisions une voiture sans paquet depuis ≈ 0,5 s, au lien non ouvert ou à la présence `racing: false`.

#### TECH-088 — Multijoueur : règle « voitures identiques » appliquée à la seule voiture locale
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8c — Multijoueur — voitures distantes et collisions
- **Source** Phase 1 TECH-088
- **Validation** Règle « voitures identiques » : toutes les voitures, distantes comprises, ont l'apparence d'origine.

**Détail d'origine (phase 1, repris sans perte)** — `race.js:69-70` remplace l'apparence locale ; les voitures distantes gardent l'apparence annoncée (`race/net.js:16`, `m.car`). Piste : appliquer la règle aussi dans `_setupRemotes`.

#### TECH-089 — Multijoueur : défauts mineurs (paquet de téléportation en double, grille invisible au décompte, progression à 0 %, départ sans décompte, aucun débit maximal des messages fiables)
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Multijoueur
- **Lot de correction** LOT-8c — Multijoueur — voitures distantes et collisions
- **Source** Phase 1 TECH-089
- **Validation** Sous-points (a) à (f) : téléportation sans paquet perdu, grille visible au décompte, progression non nulle sans ligne centrale, départ avec décompte, débit des messages fiables borné.

**Détail d'origine (phase 1, repris sans perte)** — (a) paquet de téléportation envoyé avec le `netTick` du paquet périodique du même pas : ignoré comme doublon, téléportation visible jusqu'à 50 ms plus tard (`race.js:240`, `interp.js:109`) ; (b) aucun paquet pendant le décompte : voitures de la grille invisibles jusqu'au GO ; (c) circuits de la communauté sans ligne centrale : progression du classement en direct par checkpoints, 0 % sans checkpoint ; (d) circuit plus long à charger que le délai de départ : GO immédiat sans décompte ; (e) aucune limite de débit des messages fiables : un flot de `finish` reconstruit le tableau à chaque message ; (f) À VÉRIFIER : une offre arrivée avant la présence d'un joueur qui revient peut être détruite par `_onPeer` (« back »), selon l'ordre de livraison de Realtime.

### C — LOT-9 — Contenu officiel, équilibrage et validation humaine

#### GAME-006 — Catégories de record « départ en bateau » (et « en deltaplane ») proposées sur des circuits probablement infranchissables
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Probable (catégorie « bateau », mesures de vitesse) ; À vérifier (catégorie « deltaplane », à jouer à la main)
- **Lot de correction** LOT-9 — Contenu officiel, équilibrage et validation humaine
- **Relations** COMPLETE-002, COMPLETE-010, TRANS-14
- **Source** Phase 2 GAME-006
- **Validation** Valider chaque catégorie de record par le pilote automatique (ou une validation à la main) ; vérifier que la liste proposée ne contient que des catégories finissables ; jouer à la main « bateau » et « deltaplane » sur quelques circuits.

**Détail d'origine (phase 2, repris sans perte)**

- **Gravité** MOYEN · **Certitude** Probable (bateau) / À vérifier (deltaplane) · **Type** game design / bug de fonctionnalité · **Phase 1** non répertorié (**nouveau**)
- **Contexte** fiche de chaque circuit intégré, liste « Catégorie » (`trackDescriptor.js : hubCategories` ne vérifie que « la variante change quelque chose », `variants.js : variantFits`).
- **Observé (physique du jeu)** Un bateau sur la route plafonne à 76-89 km/h sur le plat (« Premiers Éclats », « Canyon Corail ») ; tenir sur un mur exige 30 m/s (108 km/h, `SIDE_MIN_SPEED`). Le pilote automatique ne finit la catégorie « bateau » que sur **8 circuits sur 72**, et reste coincé sans même réapparaître (il rampe sur la route) ; « deltaplane » : 36 sur 72 ; « moto » : 70 sur 71 ; « pluie », « Simulation », « sans obstacles », « véhicules v2 » : tous finis.
- **Attendu** Ne proposer une catégorie que si elle est faisable (ou l'indiquer comme défi extrême).
- **Conséquences** Le joueur choisit une catégorie avec son propre classement et ne peut pas finir ; frustration et classements vides.
- **Piste** Valider chaque catégorie par le pilote automatique (comme les circuits intégrés et le défi du jour) et ne garder que celles qu'il termine ; à défaut, avertissement « très difficile ».

#### GAME-007 — Longs tronçons sans checkpoint : une chute près de la fin coûte presque toute la course
- **Type** Bug gameplay
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Reproduit
- **Lot de correction** LOT-9 — Contenu officiel, équilibrage et validation humaine
- **Relations** COMPLETE-011, COMPLETE-002, TRANS-14
- **Source** Phase 2 GAME-007
- **Validation** Mesurer l'écart maximal entre checkpoints (pilote automatique, 72 circuits) après toute modification de contenu ; règle de conception ≤ ~30 s.

**Détail d'origine (phase 2, repris sans perte)**

- **Gravité** FAIBLE · **Certitude** Reproduit (mesure sur la course du pilote automatique) · **Type** game design / équilibrage · **Phase 1** —
- **Observé** Écart maximal entre deux checkpoints (ou checkpoint et arrivée) : 52 s sur « Double Hélice » (ch. 5, un seul checkpoint à 18 s d'une course de 70 s), 41-42 s sur « Cheminée », « Récif », « Viaduc », 40 s sur « Épave », 37-39 s sur « Montgolfières », « Rafales », « Engrenages » ; médiane des 72 circuits : 28,6 s.
- **Conséquences** Sur des tronçons techniques (spirales, loopings), une erreur renvoie très loin en arrière ; ressenti de punition disproportionnée, surtout dans les chapitres avancés.
- **Piste** Un checkpoint de plus sur ces tronçons, ou une règle de conception « au plus ~30 s sans checkpoint ».

### C — LOT-10 — Interface, finitions et petits défauts visibles

#### TECH-019 — Dalle de verre brisée de nouveau visible alors qu'elle n'a plus de collision
- **Type** Bug gameplay
- **Priorité** P2 (gravité d'origine : MOYEN)
- **Niveau de certitude** Confirmé
- **Système** Rendu
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Relations** TECH-062, TRANS-09
- **Source** Phase 1 TECH-019 ; ancien n° 4 de docs/comprendre/05 § 5.6
- **Validation** « Cristal Fêlé » : briser une dalle puis (a) baisse de qualité en course, (b) règle de logique « montrer » : la dalle reste invisible tant qu'elle est brisée.

**Détail d'origine (phase 1, repris sans perte)**

- **Gravité** MOYEN · **Certitude** CONFIRMÉ · **Vérification** code relu (moi) ; sonde Chromium de l'audit délégué (circuit intégré « Cristal Fêlé »).
- **Localisation** `js/trackMesh.js : setGroupVisible()` (l. 228-232, montre tout enfant du groupe), `rebuild()` (recrée les dalles visibles) ; `js/race.js:552` (ne réapplique `setBroken` que si `brokenVer` change) ; `js/quality.js:254` (reconstruction lors d'une baisse de qualité).
- **Conditions** (i) règle de logique qui montre / cache / bascule un groupe (`_logicSync` repasse sur tous les groupes) ; (ii) réduction automatique de qualité en course (presque chaque palier change le budget de lumières ou masque le décor).
- **Conséquences** Une dalle visible que la voiture traverse, jusqu'au prochain retour ou redémarrage.
- **Piste** Réappliquer l'état brisé à la fin de `rebuild()` ; ignorer les dalles brisées dans `setGroupVisible`.

#### TECH-061 — Miniature périmée dans la fiche d'un circuit
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Interface
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-061
- **Validation** Modification de même longueur de code : la miniature de la fiche est mise à jour.

**Détail d'origine (phase 1, repris sans perte)** — `app/raceHub.js` (~l. 414) indexe les miniatures par `id + longueur du code` : une modification de même longueur garde l'ancienne image. Piste : clé par empreinte du code (comme `screens.js:324`).

#### TECH-064 — Aides à la conduite : bouton « Fiche du circuit » absent à l'arrivée
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Interface
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-064
- **Validation** Aides à la conduite activées : le bouton « Fiche du circuit » est visible à l'arrivée.

**Détail d'origine (phase 1, repris sans perte)** — `race/finish.js:194` compare la clé assistée (`…~v1.as-1`) à `_lastDesc.key` ; `quitRace` et `openSessionHub` comparent `opts.trackKey`. Piste : comparer `this.opts.trackKey`.

#### TECH-065 — Échap : panneau de l'accueil non restauré ; aucun effet dans le garage
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Interface
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Relations** TECH-004, TRANS-03
- **Source** Phase 1 TECH-065
- **Validation** Échap depuis un panneau de l'accueil : même chemin que « ← Retour » ; Échap dans le garage revient.

**Détail d'origine (phase 1, repris sans perte)** — `main.js:450` : Échap revient à l'accueil sans rouvrir le panneau (`_lastPanel`), contrairement à « ← Retour » ; dans le garage, Échap ne fait rien. Piste : faire passer Échap par le même chemin que le bouton retour visible.

#### TECH-066 — Réponse du serveur après avoir quitté la course : panneau ouvert refermé, liste reconstruite
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Interface
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Relations** TECH-018, TRANS-08
- **Source** Phase 1 TECH-066
- **Validation** Réponse tardive du serveur : le panneau ouvert ne se referme pas, la liste n'est pas reconstruite si rien n'a changé.

**Détail d'origine (phase 1, repris sans perte)** — `main.js:303` : `_ensureLocalRecord` → `refreshProgress` (l. 333) s'exécutent avant la garde de session : le panneau de l'accueil que le joueur vient d'ouvrir se referme ; sur l'écran des circuits, la liste est reconstruite (défilement et focus perdus). Piste : ne rafraîchir que si les données affichées ont changé, sans refermer un panneau.

#### TECH-067 — Démonstration du menu : vibrations du téléphone et de la manette
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Course
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-067
- **Validation** Démonstration du menu, haptique activé : `navigator.vibrate` jamais appelé.

**Détail d'origine (phase 1, repris sans perte)** — `race.js:321, 328, 359` : vibrations de choc, de réception et de mini-turbo sans garde `!this.demo` : sur téléphone (tactile, haptique activé par défaut), `navigator.vibrate` appelé 2 à 6 fois par minute de démonstration ; manette secouée dans le menu. Piste : garde `!this.demo`.

#### TECH-068 — Replay Theater : nom de caméra affiché faux
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Theater
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-068
- **Validation** Caméra « Capot » réglée : le Theater affiche « Capot » et le premier C passe à la suivante.

**Détail d'origine (phase 1, repris sans perte)** — `race.js:84` (`replayCam = 0`) contre `race.js:106` (`camMode` = réglage du joueur) : avec la caméra « Capot » réglée, le Theater affiche « Poursuite » ; le premier C passe à « Proche ». Piste : initialiser `replayCam` à `camMode`.

#### TECH-069 — Replay Theater : déplacement dans le temps sans les scripts, effets de logique joués en rafale
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Theater
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-069
- **Validation** Seek : scripts de circuit joués sans effets ; effets de logique en file vidés après le saut.

**Détail d'origine (phase 1, repris sans perte)** — `theater/session.js : theaterSeek` : les scripts de circuit (`_scriptsUpdate`, appelé seulement dans `render`) ne sont pas joués pendant le saut (ciel, météo, musique différents de la lecture continue) ; les effets de logique en file (jusqu'à 64) sont tous joués à l'image suivante (sons et messages empilés). Le reste du saut (pas de record ni de statistique, état cohérent) est correct. Piste : jouer les scripts sans effets pendant le saut ; vider la file d'effets après.

#### TECH-070 — Messages du HUD : verrou de priorité non remis à zéro au redémarrage
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** HUD
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-070
- **Validation** Message prioritaire juste avant un redémarrage : la consigne de la leçon est affichée au GO.

**Détail d'origine (phase 1, repris sans perte)** — `ui.js:42` (`hud.reset`) retire l'affichage mais garde `gate.until` / `gate.prio` : un message prioritaire (par exemple « état physique incohérent », 2,2 s) affiché juste avant un redémarrage fait refuser la consigne de la leçon de l'Académie au GO. Piste : `gate.offer('')` dans `hud.reset` (comme `_newAttempt`).

#### TECH-071 — Anglais : texte français dans la ligne de récompense de l'arrivée
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE)
- **Niveau de certitude** Confirmé
- **Système** Langues
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-071
- **Validation** Anglais : la ligne de récompense de l'arrivée est entièrement traduite.

**Détail d'origine (phase 1, repris sans perte)** — `ui.js:240` : la ligne de récompense affiche « +276 ◆ coinsBonus 1re fois ×2 » en anglais (concaténation non traduite). Piste : un modèle traduit pour toute la ligne.

#### TECH-072 — Message « hors piste » au moment de l'arrivée
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE) — À VÉRIFIER : demande plus de 0,5 s hors piste en franchissant la ligne.
- **Niveau de certitude** À vérifier
- **Système** Course
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-072
- **Validation** Reproduire (> 0,5 s hors piste en franchissant la ligne) puis vérifier qu'aucun message « hors piste » n'apparaît.

**Détail d'origine (phase 1, repris sans perte)** — À VÉRIFIER. `race.js:427-428` : après `_event` (arrivée) dans le même pas, le contrôle de hors-piste affiche encore `MSG.offTrack` (la réapparition, elle, est bien refusée). Cosmétique ; demande plus de 0,5 s hors piste en franchissant la ligne. Piste : tester `state === 'racing'` avant le message.

#### TECH-073 — Réduction automatique de qualité pendant un replay ×4 ou une analyse
- **Type** Polish / petit défaut visible
- **Priorité** P3 (gravité d'origine : FAIBLE) — À VÉRIFIER : non observé sur une machine correcte.
- **Niveau de certitude** À vérifier
- **Système** Qualité
- **Lot de correction** LOT-10 — Interface, finitions et petits défauts visibles
- **Source** Phase 1 TECH-073
- **Validation** Replay ×4 et analyse du Theater sur machine lente : aucune baisse de qualité enregistrée.

**Détail d'origine (phase 1, repris sans perte)** — À VÉRIFIER. `quality.watch()` compte le replay et le Theater comme une course ; l'analyse du Theater bloque 75 à 145 ms par trace, le replay ×4 quadruple le coût de la physique : une machine juste peut passer sous 42 i/s et la baisse est **enregistrée**. Non observé sur une machine correcte. Piste : ne surveiller que les vraies courses.

## D. Fonctionnalités et éléments manquants

Recommandations de la phase 3, pertinentes pour l'identité du jeu (course contre-la-montre avec éditeur, classements vérifiés, communauté). **Aucune n'est un bug** ; les bugs ne sont pas répétés ici. Priorités : P1 = essentielles, P2 = importantes, P3 = à forte valeur, P4 = bonus (correspondance avec les priorités 1 à 4 de la phase 3, sauf COMPLETE-005 : voir son entrée).

### D.1 Priorité P1

#### COMPLETE-001 — Validation humaine du ressenti, de la difficulté et des médailles
- **Type** Amélioration
- **Priorité** P1 (priorité d'origine, phase 3 : 1)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Qualité / équilibrage · **Valeur** Très haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-9 — Contenu officiel, équilibrage et validation humaine
- **Relations** TRANS-14, GAME-006, GAME-007
- **Source** Phase 3 COMPLETE-001
- **Validation** Protocole d'essai (docs/ESSAIS.md, docs/FICHE-ESSAI.md) mené sur des joueurs de profils variés (clavier, manette, tactile) ; médailles recalées avec la télémétrie ; décision écrite comme docs/LOIS-PHYSIQUE.md.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Une campagne d'essais avec de vrais joueurs (débutants et confirmés, clavier, manette, tactile), puis un recalibrage des médailles et de la difficulté à partir des données.
- **Pourquoi** Depuis les lois de conduite mesurées (`PHYS_VER` 36 à 38), la sensation de conduite n'a été vérifiée que par machine (`docs/ARCHITECTURE.md`, « Limites connues ») ; les médailles ont été calées sur un petit groupe (0.13.0). Tout le reste (carrière, saisons, classements) repose sur ces deux réglages.
- **Valeur** Un jeu qui « se sent bien » et des médailles justes ; c'est ce que le joueur perçoit en premier.
- **Impact** Majeur, transversal.
- **Systèmes** Physique (réglages), `js/tracks.js` (médailles), télémétrie (`js/telemetry.js`, `tools/telemetry-report.mjs`), fiche d'essai (`docs/FICHE-ESSAI.md`, `docs/ESSAIS.md`).
- **Risques** Changer la physique change `PHYS_VER` et rend les records non comparables (procédure connue) ; changer les médailles d'un circuit intégré ne change pas sa clé (vérifié : elles ne font pas partie de `encode`), les records restent donc valables.
- **Dépendances** Corrections ÉLEVÉES des phases 1-2 (pour que les testeurs jugent le jeu, pas ses bugs) ; prévu en « phase G » de l'analyse fonctionnelle.
- **Mise en place** Protocole d'essai existant, sessions enregistrées (replays, télémétrie avec accord), décision écrite comme `docs/LOIS-PHYSIQUE.md`.

#### COMPLETE-002 — Contenu officiel qui exploite les systèmes déjà construits
- **Type** Fonctionnalité manquante
- **Priorité** P1 (priorité d'origine, phase 3 : 1)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Contenu / cohérence · **Valeur** Très haute · **Complexité estimée** Élevée
- **Lot de correction** LOT-9 — Contenu officiel, équilibrage et validation humaine
- **Relations** GAME-006, GAME-007, TECH-001, TECH-014, RISK-001, TRANS-12, TRANS-14
- **Source** Phase 3 COMPLETE-002
- **Validation** Chaque nouveau circuit passe tools/contract.mjs, golden, medals, tools/test-niveaux.mjs, l'empreinte et le corpus ; les 72 clés existantes sont inchangées ; le tirage des saisons est figé avant l'ajout.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Une série de **nouveaux** circuits officiels (un « deuxième Atelier » ou un chapitre d'extension, ou des circuits saisonniers) bâtis autour de ce que la campagne n'utilise pas : portes et interrupteurs (logique), pièces mobiles, pluie et rafales, ambiances d'auteur, circuits en plusieurs tours, tronçons en moto / bateau / deltaplane, choix de véhicule par bifurcation, revêtements rares.
- **Pourquoi** Mesuré au § F : la campagne n'emploie aucune de ces fonctions ; sans elles, le joueur qui ne construit pas ne les rencontre jamais, alors qu'elles font l'originalité du moteur.
- **Valeur** Découverte, variété, sentiment de jeu riche ; prolonge la campagne là où elle est la plus répétitive (chapitres 6, 7, 10 sans nouveauté).
- **Impact** Majeur sur la perception du jeu ; aucun nouveau système.
- **Systèmes** `js/tracks.js` (script « tortue », qui accepte déjà ces options), `js/career.js`, saisons (`js/seasons.js` tire ses circuits de la carrière).
- **Risques** Ne **jamais modifier** un circuit existant : sa clé de classement changerait, sans migration (records, médailles, verrous). Ajouter des circuits hors du décor Atelier change le tirage des circuits de chaque saison (`seasons.js : seasonTracks` tire dans tous les circuits intégrés sauf l'Atelier), y compris pour la saison en cours, que le serveur vérifie : figer le tirage (liste des circuits éligibles par saison) avant d'en ajouter. Valider chaque circuit au pilote automatique (`tools/contract.mjs`, `tools/golden.mjs`, `tools/medals.mjs`), empreinte et corpus.
- **Dépendances** Corrections TECH-001 (plaques et checkpoints) et TECH-014 (logique en multijoueur) avant de multiplier ces combinaisons.
- **Mise en place** 6 à 12 circuits, chacun centré sur une mécanique, dans l'esprit de l'Atelier actuel ; le format de règles du circuit (`RULES`) porte déjà pluie, vent, logique.

#### COMPLETE-003 — Gestion et récupération de compte
- **Type** Fonctionnalité manquante
- **Priorité** P1 (priorité d'origine, phase 3 : 1)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Fonctionnalité / confiance · **Valeur** Haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-6 — Persistance locale, comptes et synchronisation
- **Relations** TECH-025, TECH-026, TRANS-11
- **Source** Phase 3 COMPLETE-003
- **Validation** Changement de mot de passe et récupération testés (tools/test-accounts-sql.sh) ; code de secours haché côté serveur, à usage unique, avec limite de débit.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Changer de mot de passe une fois connecté ; un moyen de récupérer un compte (code de secours remis à l'inscription, ou adresse de récupération facultative) ; supprimer un compte existe déjà.
- **Pourquoi** Vérifié : aucune fonction de changement ni de récupération ; le pseudo sert d'adresse technique (`…@accounts.copytrack.invalid`), donc la récupération par courriel du service d'authentification est impossible. Un mot de passe oublié = compte et sauvegarde en ligne perdus.
- **Valeur** Confiance : on n'ose pas investir des heures dans un compte qu'on peut perdre définitivement.
- **Systèmes** `js/account.js`, `supabase/etape4-comptes.sql`, écran Profil.
- **Complexité** Moyenne (côté serveur : fonction de remise à zéro protégée par le code de secours).
- **Risques** Sécurité : le code de secours doit être haché côté serveur, à usage unique, avec limite de débit.

#### COMPLETE-005 — Déploiement serveur sûr et automatique
- **Type** Amélioration
- **Priorité** P1 (priorité d'origine, phase 3 : 2) — **modifiée à la consolidation** : Remonté de la priorité 2 (phase 3) à P1 : c'est un préalable aux corrections du noyau et des clés (chaque correction de physique ouvre une fenêtre où tous les temps sont refusés tant que la fonction n'est pas redéployée).
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Exploitation · **Valeur** Haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TECH-021, TRANS-15, LOT-4, LOT-5
- **Source** Phase 3 COMPLETE-005
- **Validation** Une publication déploie la fonction et vérifie l'empreinte (tools/check-deployed.mjs) ; verify-prod.sql contrôle aussi les droits de colonnes.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** À chaque publication du site, construire et déployer `submit-score` et `ice`, vérifier l'empreinte (`tools/check-deployed.mjs`), et contrôler la base (`supabase/verify-prod.sql`, lisibilité des colonnes comprise : TECH-021).
- **Pourquoi** Aujourd'hui, toute modification de la physique, des circuits intégrés ou du défi du jour ouvre une fenêtre où **tous les temps sont refusés** tant que la fonction n'est pas redéployée à la main (`supabase/MIGRATIONS.md`).
- **Valeur** Les classements ne tombent plus en panne à chaque mise à jour.
- **Complexité** Moyenne (secrets de déploiement, ordre site / fonction / base).

### D.2 Priorité P2

#### COMPLETE-004 — Outils de modération dans le jeu
- **Type** Fonctionnalité manquante
- **Priorité** P2 (priorité d'origine, phase 3 : 2)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Exploitation / communauté · **Valeur** Haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-7 — En ligne, SQL, serveur et exploitation
- **Relations** TRANS-16, TRANS-15
- **Source** Phase 3 COMPLETE-004
- **Validation** Un modérateur masque / rétablit un circuit et un commentaire ; un non-modérateur ne le peut pas (test SQL).

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Pour les modérateurs (table `moderators` existante) : file des contenus signalés, masquer / rétablir un circuit ou un commentaire, voir les signalements, suspendre un compte.
- **Pourquoi** Le jeu publie des contenus de joueurs (circuits, noms, commentaires, playlists) et promet une modération (`js/legal.js`) ; seul le masquage automatique à 3 signalements existe dans le jeu, le reste se fait dans la console de la base.
- **Valeur** Indirecte mais réelle : une communauté saine, des engagements tenus.
- **Complexité** Moyenne (fonctions SQL et un écran réservé).

#### COMPLETE-006 — Identité musicale par décor
- **Type** Amélioration
- **Priorité** P2 (priorité d'origine, phase 3 : 2)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Son / immersion · **Valeur** Haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Source** Phase 3 COMPLETE-006
- **Validation** Douze variantes audibles, intensité liée à la vitesse ; aucune incidence sur la physique.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Décliner le moteur de musique procédurale (`js/AudioEngine.js`) en 12 variantes : tempo, tonalité, instruments, motif propres à chaque décor ; garder l'intensité qui suit la vitesse.
- **Pourquoi** Une seule musique de course pour 72 circuits et 12 décors, une seule de menu ; aucune ambiance d'auteur sur les circuits officiels. Sur des heures de jeu, c'est la principale source de monotonie sensorielle.
- **Valeur** Personnalité des mondes, fatigue réduite.
- **Complexité** Moyenne ; aucun fichier audio (le moteur est déjà procédural), aucune incidence sur la physique.

#### COMPLETE-007 — Introduction progressive des mécaniques
- **Type** Fonctionnalité manquante
- **Priorité** P2 (priorité d'origine, phase 3 : 2)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Prise en main · **Valeur** Haute · **Complexité estimée** Faible à moyenne
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Relations** TECH-071
- **Source** Phase 3 COMPLETE-007
- **Validation** À la première rencontre d'une mécanique : carte « Nouveau » et rappel en course ; index dans le profil ; clés des circuits inchangées.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** À la **première** rencontre d'une mécanique (revêtement, plaque, obstacle, gravité, mur), une carte « Nouveau » sur la fiche du circuit et un rappel discret en course ; un index « Mécaniques découvertes » dans le profil.
- **Pourquoi** Le chapitre 1 introduit 9 mécaniques ; la fiche dit ce que le circuit « apprend » mais pas comment s'en servir ; l'explication est surtout dans le wiki, hors du jeu.
- **Valeur** Prise en main sans quitter le jeu ; moins d'échecs incompris.
- **Systèmes** `js/trackDescriptor.js`, `js/app/raceHub.js`, `js/hudMessages.js`, profil.
- **Complexité** Faible à moyenne. **Sans** déplacer les circuits existants (clés).

#### COMPLETE-008 — Académie étendue à toutes les familles de mécaniques
- **Type** Fonctionnalité manquante
- **Priorité** P2 (priorité d'origine, phase 3 : 2)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Prise en main / maîtrise · **Valeur** Moyenne à haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Relations** COMPLETE-007, GAME-006
- **Source** Phase 3 COMPLETE-008
- **Validation** Chaque leçon est réussissable (objectif mesuré par analysis/drill.js) ; essai par le pilote automatique ou par balayage de commandes.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Une courte leçon par famille : gravité et inversion, murs et plafonds, eau et bateau, deltaplane, verre, aimant, obstacles animés, portes logiques ; puis un exercice noté pour les plus techniques.
- **Pourquoi** 6 leçons et 4 exercices couvrent la conduite, le dérapage, la réception, une plaque et les obstacles ; le reste n'a pas de lieu d'apprentissage.
- **Complexité** Moyenne (le cadre `js/academy.js`, `js/skills.js`, `analysis/drill.js` existe).

#### COMPLETE-009 — Fantôme de la médaille suivante
- **Type** Fonctionnalité manquante
- **Priorité** P2 (priorité d'origine, phase 3 : 2)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Rejouabilité / maîtrise · **Valeur** Haute · **Complexité estimée** Faible à moyenne
- **Lot de correction** LOT-11a — Améliorations — progression, contenu, objectifs
- **Relations** COMPLETE-010
- **Source** Phase 3 COMPLETE-009
- **Validation** Le fantôme de la médaille suivante s'affiche jusqu'au cristal ; le fantôme or reste disponible ; aucun effet sur les records.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Toujours montrer le fantôme de la prochaine médaille à gagner (bronze → argent → or → cristal), au lieu du seul fantôme or tant que l'or n'est pas gagné.
- **Pourquoi** Après l'or, plus aucune cible visible (`race/ghosts.js : _setupGhosts`), alors que le cristal est la vraie épreuve de maîtrise.
- **Valeur** Une cible concrète à chaque essai ; s'appuie sur le HUD d'entraînement et le coach.
- **Complexité** Faible à moyenne : fantômes officiels enregistrés par niveau, ou pilote automatique réglé pour chaque médaille.

#### COMPLETE-010 — Fonctions sociales vivantes avec peu de joueurs
- **Type** Fonctionnalité manquante
- **Priorité** P2 (priorité d'origine, phase 3 : 2)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Communauté / rejouabilité · **Valeur** Très haute · **Complexité estimée** Moyenne à élevée
- **Lot de correction** LOT-11c — Améliorations — social et portée
- **Relations** COMPLETE-009, COMPLETE-005, TECH-008
- **Source** Phase 3 COMPLETE-010
- **Validation** Classements amorcés ; « rival juste devant » ; contenus officiels / automatiques clairement marqués ; divisions réelles non faussées.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Amorcer chaque classement avec des temps et fantômes officiels (développeur, testeurs, pilote automatique à plusieurs niveaux) ; proposer le **rival juste devant** le joueur ; permettre duels et saisons contre ces fantômes ; compléter les salons multijoueur par des fantômes.
- **Pourquoi** Saisons et divisions, duels, tournois, salons publics, classements, communauté supposent du monde ; le jeu est déjà fait pour l'asynchrone (rejeu vérifié, fantômes du haut du classement).
- **Valeur** Le jeu paraît habité dès le premier jour.
- **Risques** Marquer clairement ce qui est officiel ou automatique ; ne pas fausser les divisions réelles.
- **Complexité** Moyenne à élevée (données officielles, règles côté base).

### D.3 Priorité P3

#### COMPLETE-011 — Rythme de la carrière (respirations, nouveautés réparties)
- **Type** Amélioration
- **Priorité** P3 (priorité d'origine, phase 3 : 3)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Progression · **Valeur** Moyenne · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11a — Améliorations — progression, contenu, objectifs
- **Relations** GAME-007, COMPLETE-002
- **Source** Phase 3 COMPLETE-011
- **Validation** Uniquement dans de nouveaux circuits ; mesure de l'espacement des checkpoints (GAME-007).

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Dans les **nouveaux** circuits (COMPLETE-002) et l'ordre de présentation : circuits « respiration » dans les chapitres avancés, nouveautés réparties (aujourd'hui 9 au chapitre 1, 0 aux chapitres 6, 7, 10).
- **Risques** L'ordre et le contenu des circuits existants ne se touchent pas sans perdre leurs records.

#### COMPLETE-012 — Objectifs bonus variés et liés à chaque circuit
- **Type** Amélioration
- **Priorité** P3 (priorité d'origine, phase 3 : 3)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Rejouabilité · **Valeur** Haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11a — Améliorations — progression, contenu, objectifs
- **Relations** COMPLETE-009
- **Source** Phase 3 COMPLETE-012
- **Validation** Chaque objectif est réalisable (pilote automatique) et mesuré par les statistiques de course ou l'analyse.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Des objectifs qui reprennent ce que le circuit enseigne (temps en l'air, mini-turbos dans une section, prendre la bifurcation difficile, vitesse maximale, secteur sous un temps) ; éventuellement deux ou trois par circuit.
- **Pourquoi** 29 objectifs sur 72 sont « sans réapparition ».
- **Systèmes** `js/career.js` (`GOALS`, `goalMet`), statistiques de course, `analysis/` (déjà capable de mesurer secteurs et évènements).
- **Complexité** Moyenne.

#### COMPLETE-013 — Fin de carrière : épreuve finale et bilan
- **Type** Fonctionnalité manquante
- **Priorité** P3 (priorité d'origine, phase 3 : 3)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Achèvement · **Valeur** Haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11a — Améliorations — progression, contenu, objectifs
- **Relations** COMPLETE-002
- **Source** Phase 3 COMPLETE-013
- **Validation** Épreuve finale finissable ; bilan de carrière exact (temps cumulé, médailles, cristaux, objectifs).

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Une épreuve finale qui reprend les mécaniques de la campagne, un bilan de carrière (temps cumulé, médailles, cristaux, objectifs, records battus) et un générique.
- **Pourquoi** Le jeu s'arrête aujourd'hui sur « il n'y a plus rien à finir ici ».
- **Complexité** Moyenne.

#### COMPLETE-014 — Épreuve « chapitre d'une traite »
- **Type** Fonctionnalité manquante
- **Priorité** P3 (priorité d'origine, phase 3 : 3)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Rejouabilité / maîtrise · **Valeur** Moyenne · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11a — Améliorations — progression, contenu, objectifs
- **Relations** COMPLETE-001
- **Source** Phase 3 COMPLETE-014
- **Validation** Clé de classement composée ; rejeu serveur de plusieurs courses ; test de non-régression des catégories existantes.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Enchaîner les 6 circuits d'un chapitre (ou toute la carrière) avec temps cumulé et classement dédié.
- **Pourquoi** Rejouabilité de maîtrise naturelle du genre ; réutilise le mécanisme de manches du championnat et les catégories de record.
- **Complexité** Moyenne (clé de classement composée, rejeu serveur de plusieurs courses).

#### COMPLETE-015 — Boîte de réception : « ton temps a été battu », duels en attente, nouvelle saison
- **Type** Fonctionnalité manquante
- **Priorité** P3 (priorité d'origine, phase 3 : 3)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Rétention / communauté · **Valeur** Haute · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11c — Améliorations — social et portée
- **Relations** COMPLETE-010
- **Source** Phase 3 COMPLETE-015
- **Validation** Les messages reflètent des événements réels (classements, duels, saisons) ; aucune requête excessive à l'ouverture.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** À l'ouverture : « X a battu ton temps sur Y », duels en attente, nouvelle saison, circuit d'un auteur suivi publié.
- **Pourquoi** Rien aujourd'hui ne signale qu'un autre joueur a progressé : c'est la première raison de revenir dans un jeu de records.
- **Complexité** Moyenne (requêtes sur les classements et les abonnements existants ; pas de notifications système nécessaires).

#### COMPLETE-016 — Progression de niveau récompensée jusqu'au bout
- **Type** Amélioration
- **Priorité** P3 (priorité d'origine, phase 3 : 3)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Progression · **Valeur** Moyenne · **Complexité estimée** Faible
- **Lot de correction** LOT-11a — Améliorations — progression, contenu, objectifs
- **Source** Phase 3 COMPLETE-016
- **Validation** Une récompense à intervalles réguliers jusqu'au niveau 50 ; profils existants non perturbés.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Une récompense (cosmétique, titre, cadre) à intervalles réguliers jusqu'au niveau 50.
- **Pourquoi** 4 récompenses (niveaux 5, 10, 20, 30) pour 50 niveaux.
- **Complexité** Faible (`js/progression.js : LEVEL_REWARDS`).

#### COMPLETE-017 — Sons propres à chaque véhicule
- **Type** Polish
- **Priorité** P3 (priorité d'origine, phase 3 : 3)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Polish / feedback · **Valeur** Moyenne · **Complexité estimée** Faible à moyenne
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Source** Phase 3 COMPLETE-017
- **Validation** Sons distincts par véhicule ; aucun effet sur la physique ni sur le rejeu.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Timbre de moteur différent pour la moto, sillage et clapot pour le bateau, souffle pour le deltaplane.
- **Pourquoi** Vérifié : `js/audio.js` n'a qu'un moteur, quel que soit le véhicule.
- **Complexité** Faible à moyenne (synthèse).

### D.4 Priorité P4

#### COMPLETE-018 — Débouché des pièces ◆ après le garage complet
- **Type** Amélioration
- **Priorité** P4 (priorité d'origine, phase 3 : 4)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Économie · **Valeur** Faible à moyenne · **Complexité estimée** Faible à moyenne
- **Lot de correction** LOT-11a — Améliorations — progression, contenu, objectifs
- **Source** Phase 3 COMPLETE-018
- **Validation** Séries cosmétiques sans avantage de course (tools/test-cosmetics-physics.mjs).

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Nouvelles séries cosmétiques (saisonnières, liées aux décors), sans aucun avantage de course.
- **Pourquoi** Le garage entier (12 000 ◆) est acquis bien avant la fin ; les pièces cessent d'avoir un sens.

#### COMPLETE-019 — Ouvrir une copie d'un circuit officiel dans l'éditeur
- **Type** Fonctionnalité manquante
- **Priorité** P4 (priorité d'origine, phase 3 : 4)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Éditeur / apprentissage · **Valeur** Moyenne · **Complexité estimée** Faible
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Relations** TECH-052
- **Source** Phase 3 COMPLETE-019
- **Validation** La copie s'ouvre dans l'éditeur avec sa propre clé `u-…` ; l'original est inchangé.

**Détail d'origine (phase 3, repris sans perte)**

- **Pourquoi** On ne peut ouvrir que ses propres circuits ou un lien partagé ; les circuits officiels sont les meilleurs exemples de level design.
- **Complexité** Faible (la copie a sa propre clé `u-…`).

#### COMPLETE-020 — Mode photo
- **Type** Fonctionnalité manquante
- **Priorité** P4 (priorité d'origine, phase 3 : 4)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Partage / polish · **Valeur** Faible à moyenne · **Complexité estimée** Faible
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Source** Phase 3 COMPLETE-020
- **Validation** HUD masqué, image enregistrée depuis la caméra libre.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Depuis la caméra libre du Replay Theater : masquer le HUD, enregistrer une image.
- **Complexité** Faible.

#### COMPLETE-021 — Signature visuelle « pliage »
- **Type** Polish
- **Priorité** P4 (priorité d'origine, phase 3 : 4)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Identité / polish · **Valeur** Moyenne · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Source** Phase 3 COMPLETE-021
- **Validation** Purement visuel ; respecte « animations réduites ».

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Le circuit qui se « déplie » au départ, des transitions d'écran en facettes, la pose d'une pièce animée dans l'éditeur : un écho au nom.
- **Complexité** Moyenne ; purement visuel.

#### COMPLETE-022 — Langues supplémentaires
- **Type** Fonctionnalité manquante
- **Priorité** P4 (priorité d'origine, phase 3 : 4)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Portée · **Valeur** Moyenne · **Complexité estimée** Moyenne (traduction)
- **Lot de correction** LOT-11c — Améliorations — social et portée
- **Relations** RISK-002, TECH-071
- **Source** Phase 3 COMPLETE-022
- **Validation** Dictionnaire complet ; RISK-002 corrigé avant l'ajout.

**Détail d'origine (phase 3, repris sans perte)**

- **Pourquoi** L'infrastructure (dictionnaire par domaine, traducteur) est prête ; deux langues seulement.
- **Risque** Le traducteur DOM s'applique aussi aux contenus des joueurs (`../comprendre/04-systemes.md` § 4.4) : à corriger avant d'ajouter des langues.

#### COMPLETE-023 — Fiche publique de joueur
- **Type** Fonctionnalité manquante
- **Priorité** P4 (priorité d'origine, phase 3 : 4)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Communauté · **Valeur** Faible à moyenne · **Complexité estimée** Moyenne
- **Lot de correction** LOT-11c — Améliorations — social et portée
- **Relations** COMPLETE-015
- **Source** Phase 3 COMPLETE-023
- **Validation** Fiche lisible ; seulement des données publiques.

**Détail d'origine (phase 3, repris sans perte)**

- **Description** Titre, médailles, records notables, circuits publiés, abonnés ; reprend un point « fort intérêt » de l'analyse fonctionnelle.

#### COMPLETE-024 — Direction par inclinaison du téléphone
- **Type** Fonctionnalité manquante
- **Priorité** P4 (priorité d'origine, phase 3 : 4)
- **Niveau de certitude** Recommandation (non applicable : pas un bug)
- **Catégorie** Contrôles / accessibilité · **Valeur** Faible à moyenne · **Complexité estimée** Faible à moyenne
- **Lot de correction** LOT-11b — Améliorations — expérience, son, prise en main
- **Source** Phase 3 COMPLETE-024
- **Validation** Commandes quantifiées enregistrées comme les autres ; rejeu identique.

**Détail d'origine (phase 3, repris sans perte)**

- **Pourquoi** Alternative naturelle au glisser sur téléphone ; déjà citée en bonus par l'analyse fonctionnelle.
- **Risque** Les commandes restent quantifiées et enregistrées comme les autres (rejeu inchangé).

### D.5 Analyse de complétude (reprise intégrale de la phase 3)

Texte d'origine, non résumé : verdict, points forts, opportunités, gameplay et mécaniques (avec les mesures sur le contenu), progression et contenu, expérience du joueur, interface et finitions, rejouabilité, top 10 et « ce qui n'est pas nécessaire ». Les renvois « COMPLETE-0xx » désignent les entrées D.1 à D.4.

#### Phase 3, partie A — État général de complétude

**Verdict honnête : en fonctionnalités, le jeu est complet, et même au-delà de ce qu'on attend du genre. Ce qui lui manque n'est presque plus « une fonctionnalité de plus » : c'est la consolidation, la validation humaine, et un contenu officiel qui exploite ce que le moteur sait déjà faire.**

Les attentes de base du genre sont toutes là : médailles par circuit (dont une médaille d'auteur, le cristal), fantôme du record, temps intermédiaires, relance instantanée, replays, classements mondiaux et entre amis (et **vérifiés par le serveur**, ce qui est rare), éditeur, partage par lien, défi du jour, manette, tactile, hors ligne. Le jeu ajoute des couches que peu de jeux du genre réunissent : Replay Theater avec analyse, coach chiffré, HUD d'entraînement, laboratoire physique, saisons hebdomadaires à divisions, duels classés et tournois asynchrones, multijoueur en direct, logique de circuit programmable, quatre véhicules, gravité retournable, Académie notée, deux langues.

Les manques réels, mesurés :
1. **Le contenu officiel n'utilise qu'une petite partie du moteur.** La campagne emploie 92 des 449 types de pièces ; **aucun** circuit officiel n'utilise la logique de circuit, les déclencheurs, la pluie, le givre, les rafales, les ambiances d'auteur, les profils physiques ou les véhicules v2 ; les pièces mobiles n'apparaissent que sur un circuit ; deux circuits seulement se courent en plusieurs tours ; le revêtement « ressort » n'est jamais utilisé. Pour un joueur qui ne construit pas de circuits, une grande partie du jeu n'existe pas.
2. **Le jeu n'a jamais été validé par des joueurs humains depuis ses dernières lois de conduite** (`docs/ARCHITECTURE.md`, « Limites connues » ; médailles « calées sur un petit groupe » en 0.13.0).
3. **Beaucoup de fonctions supposent une communauté nombreuse** (saisons et divisions, duels, tournois, salons publics, classements, communauté) ; avec peu de joueurs, elles paraissent vides.
4. **Des finitions de produit manquent** : identité sonore (une seule musique de course pour 72 circuits et 12 décors), introduction des mécaniques (9 nouveautés au chapitre 1, aucune aux chapitres 6, 7 et 10), fin de carrière, gestion de compte (aucun changement ni récupération de mot de passe), outils d'exploitation (modération, déploiement du serveur).

**Prérequis.** Avant toute recommandation : corriger les problèmes ÉLEVÉS des phases 1 et 2 (blocages par réapparition, publication impossible, entrées qui relancent la course, salles multijoueur) ; ils ne sont pas répétés ici.

---

#### Phase 3, partie B — Points forts à préserver

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

#### Phase 3, partie E — Opportunités majeures

1. **Faire de la campagne la vitrine du moteur** (COMPLETE-002) : c'est l'écart le plus grand entre ce que le jeu *sait* faire et ce que le joueur *voit*. De nouveaux circuits officiels (jamais la modification des anciens, voir les risques) avec portes logiques, pièces mobiles, pluie et rafales, circuits en plusieurs tours, sections en moto, bateau, deltaplane, transformeraient l'image du jeu sans écrire de nouveau système.
2. **Le jeu « à une personne » qui reste vivant** (COMPLETE-010) : le jeu est construit pour l'asynchrone (fantômes, rejeu vérifié, saisons). Des temps et fantômes officiels pour amorcer chaque classement, un « rival juste devant toi », des salons complétés par des fantômes, donneraient vie aux saisons, duels et classements même quand peu de joueurs sont en ligne.
3. **Une cible toujours visible** (COMPLETE-009 + COMPLETE-012) : le fantôme de la médaille suivante et des objectifs variés donnent à chaque circuit plusieurs raisons d'être rejoué, en s'appuyant sur le pilote automatique et l'analyse qui existent déjà.
4. **Une identité sensorielle propre à chaque décor** (COMPLETE-006, COMPLETE-017) : la musique procédurale existe ; la décliner par décor (tempo, tonalité, timbres) donnerait aux 12 mondes la personnalité qu'ils ont déjà visuellement.

---

#### Phase 3, partie F — Gameplay et mécaniques

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

#### Phase 3, partie G — Progression et contenu

**Mesures.**
- Carrière : 12 chapitres de 6 ; difficulté par chapitre en dents de scie (ex. ch. 6 : ★★★★★★ = 2-3-4-4-5-5), seuls 5 circuits à une étoile sur 72.
- Nouveautés par chapitre : **9 au chapitre 1** (boost, mur, bifurcation, pente, carrefour, anneau, tube, glace, plafond), 6 au chapitre 2, 4 au chapitre 3, puis 1-2 ; **aucune aux chapitres 6, 7 et 10** ; la vrille et l'inversion de gravité n'arrivent qu'au chapitre 11.
- Objectifs bonus : 72, mais **29 « sans réapparition »** et 13 « sans toucher de muret » ; « mini-turbo » 1 fois, « réceptions parfaites » 3, « véhicule » 3. Tous sont réalisables (vérifié en phase 2).
- Niveaux : 50, mais **4 récompenses de niveau** (5, 10, 20, 30) ; rien après 30. Titres : 9 ; exclusifs : 9 ; collections : 13 ; licences : 4.
- Économie : le garage entier (128 objets) coûte 12 000 ◆ ; une carrière complète en rapporte ≈ 28 700 ◆ sans compter la répétition des courses (chaque arrivée médaillée rapporte de nouveau) : **les pièces perdent tout usage au milieu du jeu**.
- Fin : « Carrière complète… Il n'y a plus rien à finir ici » (écran des circuits) ; pas d'épreuve finale, pas de bilan ni de générique.

**Lacunes.** Démarrage dense (beaucoup de nouveautés d'un coup, peu de circuits faciles), milieu de campagne sans nouveauté de mécanique, objectifs répétitifs, progression de niveau qui s'éteint, monnaie sans débouché, fin abrupte. Le contenu, lui, n'est pas en quantité insuffisante : 72 circuits, défi quotidien, saisons et éditeur suffisent largement ; **ne pas ajouter de circuits pour le nombre**, seulement pour ce qu'ils font découvrir (COMPLETE-002).

---

#### Phase 3, partie H — Expérience du joueur

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

#### Phase 3, partie I — Interface, qualité de vie et polish

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

#### Phase 3, partie J — Rejouabilité et durée de vie

**Déjà fort** : médailles jusqu'au cristal, records et classements vérifiés, défi du jour (un circuit chaque jour, vérifié pour les 60 prochains), mutations, séries, saisons hebdomadaires, duels, tournois, modes et catégories de record, communauté et éditeur.
**Ce qui freine** : (1) une cible qui disparaît une fois l'or gagné (le fantôme or n'est montré que tant que l'or n'est pas gagné) ; (2) des fonctions sociales qui dépendent du nombre de joueurs ; (3) rien qui fasse revenir quand **quelqu'un d'autre** a progressé (record battu, duel en attente) ; (4) objectifs peu variés. → COMPLETE-009, 010, 012, 015.
**À ne pas faire** : des systèmes « pour retenir » artificiels (récompenses de connexion, compteurs à remplir) ; le jeu a déjà ses raisons de revenir, il faut les rendre visibles.

---

#### Phase 3, partie L — Les 10 améliorations les plus importantes

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

#### Phase 3, partie M — Ce qui n'est PAS nécessaire

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

Éléments à ne pas ajouter (partie M) : conservés tels quels ci-dessus ; ils font partie de la consolidation (ne pas les réintroduire dans le plan de travail).

## E. Problèmes transversaux

Une cause structurelle, plusieurs symptômes. Chaque transversal regroupe des entrées déjà décrites ailleurs (pas de nouvelle entrée de bug) ; **corriger la cause commune** plutôt que chaque symptôme. La priorité d'un transversal est la plus haute de ses membres.

### TRANS-01 — Normalisation et validation appliquées sur certains chemins seulement (mémoire ≠ code relu)
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Reproduit / Confirmé (voir chaque entrée)
- **Systèmes liés** modèle de circuit (`track.js`, `track/edit.js`), éditeur (pose, inspecteur, gizmo, historique), signature, serveur
- **Lien entre les systèmes** La même donnée (décoration, pièce, option) est écrite par plusieurs chemins : la pose passe par `addDeco` / `normalize`, mais l'inspecteur, le gizmo, le déplacement vertical, la duplication, le changement de type ou d'option écrivent directement ; l'historique stocke les valeurs brutes et les restaure par la normalisation ; `encode()` arrondit. Le résultat en mémoire, dans l'instantané et dans le code relu diverge, et la normalisation de l'obstacle roulé de π n'est pas idempotente.
- **Entrées regroupées** TECH-002 (P1), TECH-003 (P1), TECH-034 (P2), TECH-035 (P2), TECH-039 (P2), TECH-052 (P3), TECH-053 (P3), TECH-056 (P3), TECH-060 (P3)
- **Correction structurelle envisagée** Une seule fonction de normalisation, idempotente, appelée par TOUTES les écritures ; un seul validateur de placement (conflits, débordement, départ unique, calques) ; instantané d'historique canonique (round trip). À traiter ensemble : LOT-5 puis LOT-3.
- **Lots concernés** LOT-5, LOT-3
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-02 — Résultat d'écriture du stockage ignoré, pression sur le quota
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé (voir chaque entrée)
- **Systèmes liés** stockage local (`storage.js`), comptes (`account.js`), profil (`profile.js`), synchronisation
- **Lien entre les systèmes** `restoreAll` est atomique et renvoie `false` si le quota est dépassé ; ses appelants ignorent la valeur (synchronisation, inscription, import) ; en parallèle, des données lourdes inutiles (records d'essai `e-…`, fantômes) consomment le quota et sont synchronisées.
- **Entrées regroupées** TECH-007 (P1), TECH-022 (P2), TECH-024 (P2), TECH-074 (P3), TECH-075 (P3)
- **Correction structurelle envisagée** Vérifier et propager le résultat de chaque écriture groupée ; ne plus produire / synchroniser les données jetables ; politique d'éviction explicite (non classé d'abord).
- **Lots concernés** LOT-6
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-03 — Entrées partagées entre l'interface DOM et la course, états d'entrée non remis à zéro
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé (voir chaque entrée)
- **Systèmes liés** entrées (`input.js`), interface (`ui.js`, `app/wiring.js`, `app/settings.js`), course (`race.js`), éditeur (`editor/pointer.js`), manette
- **Lien entre les systèmes** Un même appui de touche ou de bouton sert à l'activation native d'un élément DOM et à une action de jeu ; les fronts de manette ne sont suivis que dans certains modes ; une capture de liaison reste armée d'un écran à l'autre ; les écouteurs globaux de l'éditeur et de la course ne tiennent pas compte des fenêtres ouvertes ; les boutons tactiles injectent des codes de touche.
- **Entrées regroupées** TECH-004 (P1), TECH-005 (P1), TECH-006 (P1), TECH-017 (P2), TECH-020 (P2), TECH-033 (P2), TECH-065 (P3)
- **Correction structurelle envisagée** Un seul arbitre des entrées : contexte actif (course, éditeur, fenêtre, capture) ; actions déclenchées directement (file d'actions) plutôt que par codes de touche ; états remis à zéro à chaque transition (ouverture / fermeture de superposition, changement d'écran).
- **Lots concernés** LOT-2, LOT-3, LOT-10
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-04 — Pipeline de réapparition : état mémorisé incomplet ou non enregistré
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Reproduit / Confirmé / Reproduit (simulation) (voir chaque entrée)
- **Systèmes liés** noyau (`physics.js : place`, `simulation.js : rewind`, `raceLogic.js`), logique de circuit, course (`race.js : respawn`), enregistrement (`replay.js`)
- **Lien entre les systèmes** Le point de retour mémorise position, véhicule, gravité, instantané de course, mais pas tout ce qui compte : plaque sous la voiture (`plateLock`), vitesse de départ, règles à l'horloge continue (multijoueur) ; la reprise après erreur de la boucle ne pose pas le drapeau de retour dans l'enregistrement.
- **Entrées regroupées** TECH-001 (P1), TECH-013 (P2), TECH-014 (P2), TECH-015 (P2), GAME-004 (P2)
- **Correction structurelle envisagée** Définir ce qui fait partie de « l'état au point de retour » et le restaurer en bloc ; un seul chemin de réapparition (course en direct et rejeu). Un seul passage sur le noyau (une seule hausse de PHYS_VER).
- **Lots concernés** LOT-4, LOT-2
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-05 — Messages réseau sans identifiant de lancement, de version ni d'émetteur vérifié
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Reproduit / Confirmé (voir chaque entrée)
- **Systèmes liés** salle multijoueur (`net/room.js`), salon (`app/multi.js`), championnat (`net/championship.js`)
- **Lien entre les systèmes** Les messages `track`, `start`, `finish`, `rend`, `cup`, `hello` ne portent ni numéro de lancement ni version ; l'émetteur est déclaré par le client ; l'état « course déjà lancée » n'est jamais remis à zéro. Conséquences : arrivées créditées au mauvais circuit, invités relancés, classements divergents, identité usurpable.
- **Entrées regroupées** TECH-008 (P1), TECH-040 (P2), TECH-042 (P2), TECH-045 (P2), TECH-047 (P2), TECH-048 (P2), TECH-049 (P2), TECH-084 (P3), TECH-085 (P3), GAME-008 (P3)
- **Correction structurelle envisagée** Numéro de lancement dans tous les messages de course ; état de salle dérivé de l'hôte plutôt que mémorisé ; résultats versionnés par championnat et manche ; secret de reprise vérifié.
- **Lots concernés** LOT-8a, LOT-8d, LOT-8b
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-06 — Présence et connexion Realtime gérées de façon simplifiée
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Reproduit / Confirmé / Très probable / À vérifier (voir chaque entrée)
- **Systèmes liés** signalisation (`net/signaling.js`), salle (`net/room.js`), transport WebRTC (`net/transport.js`), annuaire public (`net/directory.js`), voitures distantes
- **Lien entre les systèmes** La présence est suivie par clé et non par connexion ; les évènements de fermeture et d'erreur du canal sont ignorés ; le jeton n'est jamais renouvelé ; une coupure de signalisation coupe aussi les liens WebRTC sains ; l'hôte absent garde son rôle ; les connexions abandonnées ne sont pas fermées ; les voitures distantes ne sont pas recréées.
- **Entrées regroupées** TECH-009 (P1), TECH-010 (P1), TECH-011 (P1), TECH-012 (P1), TECH-043 (P2), TECH-044 (P2), TECH-046 (P2), TECH-050 (P2), TECH-082 (P3), TECH-086 (P3)
- **Correction structurelle envisagée** Suivre les entrées de présence individuellement (référence Phoenix), traiter fermeture / erreur / expiration comme une perte, découpler liens de jeu et signalisation, fermer toute connexion abandonnée, redemander les serveurs ICE. À tester d'abord avec le banc simulé (`tools/test-net.mjs`), puis sur Realtime réel.
- **Lots concernés** LOT-8c, LOT-8b
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-07 — Aucune coordination entre onglets / appareils pour des données locales partagées
- **Type** Problème transversal
- **Priorité** P2 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé (voir chaque entrée)
- **Systèmes liés** profil (cache de module), session en ligne, stockage local, synchronisation
- **Lien entre les systèmes** Le profil et la session sont lus une fois en mémoire ; aucun écouteur `storage` n'existe ; deux onglets s'écrasent mutuellement (progression, jeton de renouvellement).
- **Entrées regroupées** TECH-023 (P2), TECH-026 (P2), TECH-027 (P2)
- **Correction structurelle envisagée** Écouter l'évènement `storage`, relire avant d'écrire ou de renouveler un jeton, fusionner au lieu d'écraser.
- **Lots concernés** LOT-6
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-08 — Gardes de session par identité d'objet, réponses asynchrones tardives
- **Type** Problème transversal
- **Priorité** P2 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé (voir chaque entrée)
- **Systèmes liés** application (`main.js`), course (`race/finish.js`), multijoueur (`app/multi.js`), interface
- **Lien entre les systèmes** Après un `await` (envoi de score, téléchargement de circuit), la garde `this.session !== session` ne voit pas un redémarrage de la même session ni un changement d'écran ; le résultat d'une action ancienne s'applique à l'état courant.
- **Entrées regroupées** TECH-018 (P2), TECH-049 (P2), TECH-066 (P3)
- **Correction structurelle envisagée** Jeton de génération (par course, par lancement) comparé après chaque `await` ; ne rafraîchir l'interface que si les données ont changé.
- **Lots concernés** LOT-2, LOT-8a, LOT-10
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-09 — Minuteries, écouteurs et ressources non rattachés au cycle de vie de leur session
- **Type** Problème transversal
- **Priorité** P2 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé (voir chaque entrée)
- **Systèmes liés** garage, salon multijoueur, signalisation, tampons d'interpolation, rendu
- **Lien entre les systèmes** Des minuteries, écouteurs ou connexions survivent à la sortie de l'écran ou de la salle : `_studioT`, écouteurs du salon, connexions abandonnées, tampons d'état grossissant onglet masqué, dalles de verre reconstruites sans état.
- **Entrées regroupées** TECH-019 (P2), TECH-044 (P2), TECH-063 (P3), TECH-082 (P3), TECH-083 (P3), TECH-087 (P3)
- **Correction structurelle envisagée** Un point unique de nettoyage par session (`dispose` / `onClose`) ; chaque minuterie et écouteur enregistré auprès de lui.
- **Lots concernés** LOT-10, LOT-8b, LOT-8c
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-10 — Règles dupliquées entre le jeu et la base SQL, droits de colonnes
- **Type** Problème transversal
- **Priorité** P2 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé / Très probable (voir chaque entrée)
- **Systèmes liés** client en ligne (`online.js`, `dataExport.js`, `seasons.js`), SQL (`supabase/etape*.sql`), fonction serveur
- **Lien entre les systèmes** Saisons (début, grâce), clés de duel, titres, variantes, règles de pseudo, limites, droits de lecture par colonne : écrits deux fois, sans test commun ; les droits de colonne ne suivent pas les colonnes ajoutées.
- **Entrées regroupées** TECH-021 (P2), TECH-032 (P2), TECH-076 (P3), TECH-079 (P3), TECH-081 (P3)
- **Correction structurelle envisagée** Contrôles de cohérence automatiques (lisibilité des colonnes, constantes communes) dans `verify-prod.sql` et les tests SQL.
- **Lots concernés** LOT-7
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-11 — Identité invité / compte / session anonyme
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé / — (voir chaque entrée)
- **Systèmes liés** comptes (`account.js`), session en ligne (`online.js`), profil, import / export, SQL
- **Lien entre les systèmes** L'inscription crée un nouvel utilisateur au lieu de convertir l'anonyme ; la déconnexion efface la session anonyme ; chaque lecture en crée une ; l'import fusionne sans règle ; l'identifiant d'installation voyage dans le code joueur ; aucun moyen de récupérer un compte.
- **Entrées regroupées** TECH-024 (P2), TECH-025 (P2), TECH-026 (P2), TECH-030 (P1), TECH-031 (P2), TECH-078 (P3), COMPLETE-003 (P1)
- **Correction structurelle envisagée** Un modèle d'identité unique : l'anonyme est converti en compte ; la session de l'invité n'est jamais détruite ; récupération de compte.
- **Lots concernés** LOT-6, LOT-7
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-12 — Clés de classement fragiles et sans migration
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Reproduit / Confirmé / — (voir chaque entrée)
- **Systèmes liés** signature (`track.js`), clés `b-` / `u-` / `daily-`, serveur (`track_binds`), records locaux, saisons, duels
- **Lien entre les systèmes** Les clés sont des empreintes de contenu : une normalisation instable (TECH-002), un hachage moins précis que le code (TECH-039), une modification de circuit intégré (RISK-001) ou un ajout de circuit qui change le tirage des saisons changent des clés sans migration.
- **Entrées regroupées** TECH-002 (P1), TECH-039 (P2), TECH-060 (P3), RISK-001 (P2), COMPLETE-002 (P1)
- **Correction structurelle envisagée** Round-trip de signature dans le corpus ; règles de processus (n'ajouter que des circuits nouveaux, figer la liste éligible des saisons) ; table de correspondance si un changement est inévitable.
- **Lots concernés** LOT-5, LOT-12, LOT-9
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-13 — Fusion de données entre appareils incomplète
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé (voir chaque entrée)
- **Systèmes liés** fusion cloud (`cloudsave.js`), profil, import
- **Lien entre les systèmes** Des champs ne sont pas fusionnés (objectifs, titre, `xpDay`), la règle des pièces perd des gains et déduit des objets offerts, les valeurs invalides deviennent « cristal », l'import « Fusionner » contourne la fusion.
- **Entrées regroupées** TECH-023 (P2), TECH-027 (P2), TECH-028 (P2), TECH-029 (P2), TECH-030 (P1), TECH-074 (P3), TECH-077 (P3)
- **Correction structurelle envisagée** Modèle additif (gains et dépenses par appareil), union des ensembles, validation à la lecture ; une seule fusion pour synchronisation et import.
- **Lots concernés** LOT-6
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-14 — Contenu et catégories proposés sans validation de faisabilité
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** Probable / À vérifier / Reproduit / — (voir chaque entrée)
- **Systèmes liés** contenu (`tracks.js`, `trackDescriptor.js : hubCategories`), pilote automatique, circuits de joueurs, physique des véhicules
- **Lien entre les systèmes** Le jeu valide les circuits intégrés et le défi du jour par le pilote automatique, mais pas les catégories de record par véhicule, ni les combinaisons que les joueurs construisent (plaque + checkpoint) ; les circuits n'ont pas de règle d'espacement des checkpoints.
- **Entrées regroupées** GAME-006 (P2), GAME-007 (P3), TECH-001 (P1), COMPLETE-001 (P1), COMPLETE-002 (P1)
- **Correction structurelle envisagée** Étendre la validation automatique (catégories, espacement des checkpoints) et lancer la validation humaine (COMPLETE-001).
- **Lots concernés** LOT-9, LOT-4
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-15 — Exploitation du serveur : déploiements manuels et vérifications ponctuelles
- **Type** Problème transversal
- **Priorité** P1 (la plus haute de ses membres)
- **Niveau de certitude** — / Confirmé (voir chaque entrée)
- **Systèmes liés** fonction `submit-score`, fonction `ice`, étapes SQL, modération
- **Lien entre les systèmes** Toute modification de la fermeture de `verify.js` oblige à redéployer à la main la fonction serveur ; entre le déploiement du site et celui de la fonction, tous les temps sont refusés ; l'état de la base de production n'est vérifié que par un script d'existence ; aucune interface de modération.
- **Entrées regroupées** COMPLETE-005 (P1), COMPLETE-004 (P2), TECH-021 (P2), TECH-080 (P3)
- **Correction structurelle envisagée** Déploiement automatique ordonné (base, fonction, site) avec vérification d'empreinte ; contrôles de droits dans `verify-prod.sql`.
- **Lots concernés** LOT-7
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

### TRANS-16 — Sécurité et vie privée en ligne
- **Type** Problème transversal
- **Priorité** P2 (la plus haute de ses membres)
- **Niveau de certitude** Confirmé / Très probable / — (voir chaque entrée)
- **Systèmes liés** salle multijoueur, signalisation, comptes, serveur
- **Lien entre les systèmes** Identité déclarée par le client (places, hôte), liens ouverts par n'importe quel message, adresses IP diffusées à tous les abonnés du canal, identifiant d'installation dans le code joueur, clés de variantes liées séparément, signatures à 32 bits.
- **Entrées regroupées** TECH-039 (P2), TECH-040 (P2), TECH-045 (P2), TECH-051 (P2), TECH-078 (P3), TECH-081 (P3), COMPLETE-004 (P2)
- **Correction structurelle envisagée** Secret de reprise, autorité d'hôte non déclarable, filtrage côté serveur de la signalisation, documentation dans la page Confidentialité.
- **Lots concernés** LOT-5, LOT-8d, LOT-8b, LOT-6, LOT-7
- **Validation** réunir les validations de chaque entrée regroupée ; ajouter un test qui exerce la cause commune (et non chaque symptôme).
- **Source** Phase 1 § 7.4 (causes communes) et recoupement de la consolidation.

## F. Priorisation générale

### F.1 Définitions et répartition

| Niveau | Définition | Problèmes | Recommandations |
| --- | --- | --- | --- |
| **P0 — Critique** | blocage majeur, crash, corruption, impossibilité de jouer, extrêmement grave | 0 | 0 |
| **P1 — Prioritaire** | problème important affectant fortement le jeu ou ses mécaniques ; recommandation essentielle | 13 | 4 |
| **P2 — Normal** | bug réel ou amélioration importante, non bloquante | 41 | 6 |
| **P3 — Secondaire** | défaut mineur, polish, confort ; recommandation à forte valeur non urgente | 51 | 7 |
| **P4 — Bonus** | opportunité facultative, contenu additionnel | 0 | 7 |

**Aucun P0.** Les candidats les plus proches (TECH-001 boucle de chutes, TECH-007 synchronisation en boucle, TECH-030 écrasement de progression) exigent chacun une condition précise et ont une issue (« Recommencer », données conservées dans le cloud, import évitable). Aucun plantage général, aucune corruption généralisée, aucun moyen de faire accepter un faux temps au serveur n'a été trouvé. À réévaluer si les vérifications de production (LOT-0) révèlent un état pire que celui du dépôt.

### F.2 Règles de conversion et changements de priorité

| Source | Règle | Exceptions (justifiées) |
| --- | --- | --- |
| Phase 1 ÉLEVÉ | → P1 | TECH-011 et 012 : P1 **sous réserve** (certitude « très probable », comportement de Realtime à confirmer) |
| Phase 1 MOYEN | → P2 | **TECH-030 → P1** : perte irréversible de progression pour un invité, sur le bouton principal de l'import |
| Phase 1 FAIBLE | → P3 | — |
| Phase 2 | GAME-004, 006 → P2 ; GAME-007, 008 → P3 | GAME-004 à promouvoir en P1 si une trajectoire reproductible est trouvée |
| Phase 3, priorité 1 | → P1 | — |
| Phase 3, priorité 2 | → P2 | **COMPLETE-005 → P1** : préalable aux corrections du noyau et des clés |
| Phase 3, priorités 3 et 4 | → P3 et P4 | — |
| Risques structurels | RISK-001 → P2 (règle de processus à respecter avant d'ajouter du contenu) ; RISK-002 → P3 | — |
| Écarts de documentation | → P3 | — |

### F.3 Contenu de chaque niveau

**P1**

- COMPLETE-001 — Validation humaine du ressenti, de la difficulté et des médailles
- COMPLETE-002 — Contenu officiel qui exploite les systèmes déjà construits
- COMPLETE-003 — Gestion et récupération de compte
- COMPLETE-005 — Déploiement serveur sûr et automatique
- TECH-001 — Réapparition sur une plaque de transformation : le véhicule redevient voiture, boucle de réappariti…
- TECH-002 — Obstacle roulé de 180° : signe du roulis inversé à chaque lecture, clé et vérification instables
- TECH-003 — Éditeur : la pose supprime des pièces que la nouvelle pièce ne touche pas
- TECH-004 — Entrée sur un bouton de la pause (ou de l'arrivée, du replay) relance la course
- TECH-005 — Manette : bouton A tenu = « valider » dès qu'une superposition s'ouvre (pause impossible, course re…
- TECH-006 — Capture de touche en attente qui survit à la navigation : touches réassignées à l'insu du joueur
- TECH-007 — Synchronisation du compte : sauvegarde fusionnée trop grosse → boucle sans fin, progression invisib…
- TECH-008 — Multijoueur : `Room.started` jamais remis à faux → invités du salon lancés en course à chaque choix…
- TECH-009 — Multijoueur : un joueur arrivé (ou revenu) pendant une course n'apparaît jamais
- TECH-010 — Multijoueur : hôte absent ou qui recharge → manches bloquées, « Salle introuvable », salle définiti…
- TECH-011 — Multijoueur : un départ de présence efface le joueur même s'il a encore une connexion
- TECH-012 — Multijoueur : fermeture du canal, erreur, jeton expiré ignorés → joueur isolé dans une salle morte
- TECH-030 — Import d'un code joueur en « Fusionner » : écrase la progression locale, accepte des records invali…

**P2**

- COMPLETE-004 — Outils de modération dans le jeu
- COMPLETE-006 — Identité musicale par décor
- COMPLETE-007 — Introduction progressive des mécaniques
- COMPLETE-008 — Académie étendue à toutes les familles de mécaniques
- COMPLETE-009 — Fantôme de la médaille suivante
- COMPLETE-010 — Fonctions sociales vivantes avec peu de joueurs
- GAME-004 — Téléportation de 59 m sur un double looping pendant une chute
- GAME-006 — Catégories de record « départ en bateau » (et « en deltaplane ») proposées sur des circuits probabl…
- RISK-001 — Modifier un circuit intégré en change la clé : progression perdue, aucune migration
- TECH-013 — Vitesse de départ (`v0`) perdue au retour au point de départ
- TECH-014 — Multijoueur : règles de logique déclenchées par le temps jamais rejouées après un retour au checkpo…
- TECH-015 — Reprise après erreur de la boucle : retour au checkpoint non enregistré, record non rejouable
- TECH-016 — Exception dans la construction d'une course : jeu figé (mode « course » sans session)
- TECH-017 — Commandes de course actives sous une fenêtre ouverte
- TECH-018 — Résultat en ligne d'une course précédente affiché sur l'arrivée suivante
- TECH-019 — Dalle de verre brisée de nouveau visible alors qu'elle n'a plus de collision
- TECH-020 — Boutons tactiles liés en dur à `KeyR`, `Escape`, `Enter` (et textes d'aide figés)
- TECH-021 — Classement mondial dégradé : colonne `ghost_veh` jamais autorisée en lecture
- TECH-022 — Records d'essai de l'éditeur (`e-…`) jamais purgés, synchronisés, qui saturent le stockage
- TECH-023 — Écriture faite pendant une synchronisation : jamais envoyée
- TECH-024 — « Garder ma progression » à l'inscription : échec silencieux, bibliothèques non copiées
- TECH-025 — Déconnexion : identité anonyme de l'invité abandonnée, ses données orphelines
- TECH-026 — Deux onglets : jeton de renouvellement périmé → nouvelle identité d'invité, ou déconnexion du compte
- TECH-027 — Deux onglets : le cache du profil d'un onglet écrase la progression de l'autre
- TECH-028 — Objectifs bonus non fusionnés entre appareils (récompense payée deux fois, pas de convergence)
- TECH-029 — Fusion des pièces ◆ : des pièces gagnées sont perdues, des objets offerts sont déduits
- TECH-031 — Chaque lecture en ligne crée un joueur anonyme
- TECH-032 — Export des données (RGPD) : les temps échouent toujours, les « j'aime » manquent
- TECH-033 — Éditeur : raccourcis Ctrl actifs sous les fenêtres
- TECH-034 — Éditeur : retour d'essai qui perd historique, presse-papiers, calques
- TECH-035 — Éditeur : décorations modifiées sans normalisation (rétablir perdu, « modifié » à tort, solides inc…
- TECH-036 — Éditeur : la gomme supprime des décorations de calques verrouillés ou masqués
- TECH-037 — Éditeur : déplacer une pièce au gizmo change son demi-niveau
- TECH-038 — Éditeur : un groupe utilisé seulement par la logique est considéré libre
- TECH-039 — Signature : collisions de clés entre circuits physiquement différents
- TECH-040 — Multijoueur : identité déclarée par le client (prise d'une place ou du rôle d'hôte)
- TECH-041 — Multijoueur : collisions douces jusqu'à 8 m/s par pas, cumulées
- TECH-042 — Multijoueur : temps d'arrivée (course libre) attribué au mauvais circuit
- TECH-043 — Multijoueur : voitures distantes figées mais toujours collisionnables
- TECH-044 — Multijoueur : connexion de signalisation fantôme après un délai dépassé
- TECH-045 — Multijoueur : tout message de signalisation ouvre un lien (places épuisables)
- TECH-046 — Multijoueur : une coupure de la signalisation coupe tous les liens de jeu sains
- TECH-047 — Multijoueur : fin de manche manquée jamais signalée au joueur revenu
- TECH-048 — Multijoueur : migration d'hôte après une fin de manche manquée → classements divergents
- TECH-049 — Multijoueur : deux chargements de circuit concurrents, le dernier arrivé gagne
- TECH-050 — Multijoueur : serveurs ICE / TURN demandés une seule fois par salle
- TECH-051 — Multijoueur : adresses IP des joueurs diffusées à tous les abonnés du canal

**P3**

- COMPLETE-011 — Rythme de la carrière (respirations, nouveautés réparties)
- COMPLETE-012 — Objectifs bonus variés et liés à chaque circuit
- COMPLETE-013 — Fin de carrière : épreuve finale et bilan
- COMPLETE-014 — Épreuve « chapitre d'une traite »
- COMPLETE-015 — Boîte de réception : « ton temps a été battu », duels en attente, nouvelle saison
- COMPLETE-016 — Progression de niveau récompensée jusqu'au bout
- COMPLETE-017 — Sons propres à chaque véhicule
- DOC-001 — `docs/ARCHITECTURE.md` (« Physique : règles communes ») : sur les routes roulées et les loopings, l…
- DOC-002 — `docs/ARCHITECTURE.md` : 182 scénarios (« Déterminisme ») et 161 (« Limites connues »)
- DOC-003 — `docs/ARCHITECTURE.md` (« Limites connues ») : Firefox et Safari pas essayés ; STUN seulement
- DOC-004 — `docs/ARCHITECTURE.md` (« Données et formats ») : la signature ignore le thème
- DOC-005 — `docs/ARCHITECTURE.md` (« Serveur ») : tables dans `etape1…5`
- DOC-006 — `docs/ARCHITECTURE.md` : records sous `shardway.rec3.*`
- DOC-007 — `js/verify.js` (en-tête) et donc `docs/MODULES.md` : la fonction serveur « le charge depuis le site…
- DOC-008 — `js/joins.js` (en-tête) : utilisé par l'éditeur
- DOC-009 — `supabase/MULTI.md` : collisions plafonnées à ~4 g ; deux modes de salon
- DOC-010 — `supabase/COMPTES.md` (fin) : le temps de l'auteur est « vérifié par le jeu à la publication mais p…
- GAME-007 — Longs tronçons sans checkpoint : une chute près de la fin coûte presque toute la course
- GAME-008 — Arrivant pendant une « Course » (championnat d'une manche) : salon sans circuit affiché
- RISK-002 — Le traducteur DOM anglais agit aussi sur les contenus des joueurs
- TECH-052 — Éditeur : réservation des bords de pente au mur contournable
- TECH-053 — Éditeur : « Prolonger » peut poser plusieurs départs
- TECH-054 — Éditeur : calques gardés au chargement d'un autre circuit ; annuler garde la vérification courante
- TECH-055 — Éditeur : test depuis le curseur en gravité inversée sur un circuit `flip0`
- TECH-056 — Éditeur : la fenêtre « Circuit » arrondit la direction du vent (15° → 45°)
- TECH-057 — Éditeur : « Tout sélectionner » oublie les décorations hors des pièces
- TECH-058 — Éditeur : le collage garde les numéros de groupe
- TECH-059 — Éditeur : impossible de sortir si l'enregistrement automatique échoue
- TECH-060 — Lecture d'un code : décorations inconnues perdues sans blocage
- TECH-061 — Miniature périmée dans la fiche d'un circuit
- TECH-062 — Éditeur : la vue par niveau montre les calques masqués
- TECH-063 — Garage : minuterie non annulée → voiture orpheline dans la scène suivante
- TECH-064 — Aides à la conduite : bouton « Fiche du circuit » absent à l'arrivée
- TECH-065 — Échap : panneau de l'accueil non restauré ; aucun effet dans le garage
- TECH-066 — Réponse du serveur après avoir quitté la course : panneau ouvert refermé, liste reconstruite
- TECH-067 — Démonstration du menu : vibrations du téléphone et de la manette
- TECH-068 — Replay Theater : nom de caméra affiché faux
- TECH-069 — Replay Theater : déplacement dans le temps sans les scripts, effets de logique joués en rafale
- TECH-070 — Messages du HUD : verrou de priorité non remis à zéro au redémarrage
- TECH-071 — Anglais : texte français dans la ligne de récompense de l'arrivée
- TECH-072 — Message « hors piste » au moment de l'arrivée
- TECH-073 — Réduction automatique de qualité pendant un replay ×4 ou une analyse
- TECH-074 — Sauvegarde > 6 Mo : renvoyée à chaque synchronisation
- TECH-075 — Restauration annoncée réussie même quand le stockage est plein
- TECH-076 — Saisons : la base clôt à l'heure, le serveur accepte encore 10 minutes
- TECH-077 — Valeurs de médaille abîmées dans le cloud → cristal
- TECH-078 — Identifiant d'installation (statistiques) inclus dans le code joueur
- TECH-079 — Serveur : dates de défi du jour inexistantes acceptées
- TECH-080 — En ligne : erreurs réseau brutes, délai d'attente perdu, cache hors ligne qui grossit, page renvoyé…
- TECH-081 — Clés de variantes liées une par une (squat possible avec une collision de signature)
- TECH-082 — Multijoueur : salon public fantôme après un retrait pendant l'annonce
- TECH-083 — Multijoueur : écouteurs du salon jamais retirés
- TECH-084 — Multijoueur : arrivée en attente rejouée dans un nouveau championnat
- TECH-085 — Multijoueur : classement général qui compte des joueurs n'ayant jamais couru
- TECH-086 — Multijoueur : capacité de 8 qui ignore les places gardées
- TECH-087 — Multijoueur : onglet masqué, tampons d'état qui grossissent sans fin
- TECH-088 — Multijoueur : règle « voitures identiques » appliquée à la seule voiture locale
- TECH-089 — Multijoueur : défauts mineurs (paquet de téléportation en double, grille invisible au décompte, pro…

**P4**

- COMPLETE-018 — Débouché des pièces ◆ après le garage complet
- COMPLETE-019 — Ouvrir une copie d'un circuit officiel dans l'éditeur
- COMPLETE-020 — Mode photo
- COMPLETE-021 — Signature visuelle « pliage »
- COMPLETE-022 — Langues supplémentaires
- COMPLETE-023 — Fiche publique de joueur
- COMPLETE-024 — Direction par inclinaison du téléphone

## G. Plan de travail recommandé

### G.1 Les dix chantiers les plus prioritaires

Chantiers ordonnés par dépendance et par risque (pas seulement par valeur). Le « top 10 des améliorations » de la phase 3 (D.5, partie L) classe, lui, les recommandations de complétude par impact.

| # | Chantier | Entrées | Pourquoi d'abord |
| --- | --- | --- | --- |
| 1 | **Filet de tests de non-régression** (course en direct ↔ rejeu, retour au checkpoint sur plaques, round-trip de signature, entrées DOM / manette) | LOT-1 | À faire avant tout changement du noyau ; c'est aujourd'hui le point non couvert par les tests automatiques |
| 2 | **Réapparition : un seul passage sur le noyau** | TECH-001, 013, 014, GAME-004 (TRANS-04) | Blocages de partie ; une seule hausse de `PHYS_VER`, un seul redéploiement |
| 3 | **Déploiement serveur sûr** | COMPLETE-005, TECH-021 | Préalable au chantier 2 : évite la fenêtre où tous les temps sont refusés |
| 4 | **Normalisation unique du circuit et clés stables** | TECH-002, 039, 060, puis 034, 035, 003, 052, 053 (TRANS-01, 12) | Circuits impossibles à publier / classer ; même fonction (`addDeco`) que l'éditeur |
| 5 | **Arbitre d'entrées** | TECH-004, 005, 006, 017, 020, 033, 065 (TRANS-03) | Courses perdues et réglages corrompus par des gestes ordinaires |
| 6 | **Écritures de stockage vérifiées et fusion unique** | TECH-007, 022, 024, 023, 028, 029, 030, 075 (TRANS-02, 13) | Progression invisible ou perdue |
| 7 | **Multijoueur : état de salle, présence, voitures distantes** | TECH-008…012, 009, 042, 043, 047…049 (TRANS-05, 06) | Fonction visible dès qu'on joue à plusieurs ; à valider d'abord sur le banc simulé |
| 8 | **Modèle d'identité (invité → compte, récupération)** | TECH-025, 026, 031, COMPLETE-003 (TRANS-11) | Données orphelines et comptes perdus |
| 9 | **Validation humaine puis recalage des médailles** | COMPLETE-001, GAME-006, 007 | À faire **après** la stabilisation du noyau, sinon les médailles seraient à refaire |
| 10 | **Contenu officiel qui exploite le moteur** | COMPLETE-002, 011, 012, 013 | La plus grande valeur perçue ; dépend des chantiers 2 et 4 |

### G.2 Lots de correction

| Lot | Entrées (P) |
| --- | --- |
| **LOT-0** — Investigations et confirmations avant correction | investigations : voir G.4 |
| **LOT-1** — Filet de tests de non-régression | tests à ajouter : voir H.2 |
| **LOT-2** — Course, entrées et cycle de vie (client) | TECH-004 (P1), TECH-005 (P1), TECH-006 (P1), TECH-015 (P2), TECH-016 (P2), TECH-017 (P2), TECH-018 (P2), TECH-020 (P2) |
| **LOT-3** — Éditeur de circuits | TECH-003 (P1), TECH-033 (P2), TECH-034 (P2), TECH-035 (P2), TECH-036 (P2), TECH-037 (P2), TECH-038 (P2), TECH-052 (P3), TECH-053 (P3), TECH-054 (P3), TECH-055 (P3), TECH-056 (P3), TECH-057 (P3), TECH-058 (P3), TECH-059 (P3), TECH-062 (P3) |
| **LOT-4** — Noyau de simulation (physique, logique) — change PHYS_VER | TECH-001 (P1), GAME-004 (P2), TECH-013 (P2), TECH-014 (P2) |
| **LOT-5** — Modèle de circuit, signature et clés de classement | TECH-002 (P1), TECH-039 (P2), TECH-060 (P3) |
| **LOT-6** — Persistance locale, comptes et synchronisation | COMPLETE-003 (P1), TECH-007 (P1), TECH-030 (P1), TECH-022 (P2), TECH-023 (P2), TECH-024 (P2), TECH-025 (P2), TECH-026 (P2), TECH-027 (P2), TECH-028 (P2), TECH-029 (P2), TECH-074 (P3), TECH-075 (P3), TECH-077 (P3), TECH-078 (P3) |
| **LOT-7** — En ligne, SQL, serveur et exploitation | COMPLETE-005 (P1), COMPLETE-004 (P2), TECH-021 (P2), TECH-031 (P2), TECH-032 (P2), TECH-076 (P3), TECH-079 (P3), TECH-080 (P3), TECH-081 (P3) |
| **LOT-8a** — Multijoueur — état de la salle et championnat | TECH-008 (P1), TECH-042 (P2), TECH-047 (P2), TECH-048 (P2), TECH-049 (P2), GAME-008 (P3), TECH-084 (P3), TECH-085 (P3) |
| **LOT-8b** — Multijoueur — présence, signalisation, liens | TECH-010 (P1), TECH-011 (P1), TECH-012 (P1), TECH-044 (P2), TECH-045 (P2), TECH-046 (P2), TECH-050 (P2), TECH-082 (P3), TECH-086 (P3) |
| **LOT-8c** — Multijoueur — voitures distantes et collisions | TECH-009 (P1), TECH-041 (P2), TECH-043 (P2), TECH-083 (P3), TECH-087 (P3), TECH-088 (P3), TECH-089 (P3) |
| **LOT-8d** — Multijoueur — identité, sécurité, vie privée | TECH-040 (P2), TECH-051 (P2) |
| **LOT-9** — Contenu officiel, équilibrage et validation humaine | COMPLETE-001 (P1), COMPLETE-002 (P1), GAME-006 (P2), GAME-007 (P3) |
| **LOT-10** — Interface, finitions et petits défauts visibles | TECH-019 (P2), TECH-061 (P3), TECH-063 (P3), TECH-064 (P3), TECH-065 (P3), TECH-066 (P3), TECH-067 (P3), TECH-068 (P3), TECH-069 (P3), TECH-070 (P3), TECH-071 (P3), TECH-072 (P3), TECH-073 (P3) |
| **LOT-11a** — Améliorations — progression, contenu, objectifs | COMPLETE-009 (P2), COMPLETE-011 (P3), COMPLETE-012 (P3), COMPLETE-013 (P3), COMPLETE-014 (P3), COMPLETE-016 (P3), COMPLETE-018 (P4) |
| **LOT-11b** — Améliorations — expérience, son, prise en main | COMPLETE-006 (P2), COMPLETE-007 (P2), COMPLETE-008 (P2), COMPLETE-017 (P3), COMPLETE-019 (P4), COMPLETE-020 (P4), COMPLETE-021 (P4), COMPLETE-024 (P4) |
| **LOT-11c** — Améliorations — social et portée | COMPLETE-010 (P2), COMPLETE-015 (P3), COMPLETE-022 (P4), COMPLETE-023 (P4) |
| **LOT-12** — Documentation et règles de processus | RISK-001 (P2), DOC-001 (P3), DOC-002 (P3), DOC-003 (P3), DOC-004 (P3), DOC-005 (P3), DOC-006 (P3), DOC-007 (P3), DOC-008 (P3), DOC-009 (P3), DOC-010 (P3), RISK-002 (P3) |

### G.3 Ordre recommandé et dépendances

| Étape | Contenu | Dépend de | Remarques |
| --- | --- | --- | --- |
| 0 | **LOT-0** : investigations (G.4), en parallèle de tout | — | Aucune correction ; décisions à prendre avant les étapes 4, 6 et 7 |
| 1 | **LOT-1** : filet de tests | — | Nécessaire avant les étapes 3 et 7 |
| 2 | **COMPLETE-005** (déploiement) ; **LOT-2**, **LOT-10** : corrections client sans risque | — | LOT-2 : P1 d'entrées (TECH-004, 005, 006) ; LOT-10 : petits défauts ; livrables indépendants |
| 3 | **LOT-4 + LOT-5** en une seule livraison : noyau, normalisation, clés | étapes 1 et 2 | Une hausse de `PHYS_VER`, empreinte, temps de référence, médailles, corpus, `build:function`, redéploiement, `check-deployed` |
| 4 | **LOT-3** : éditeur | étape 3 (TECH-034, 035 reposent sur la normalisation) | Les corrections indépendantes (TECH-033, 036, 037, 038, 053, 057, 059) peuvent partir dès l'étape 2 |
| 5 | **LOT-6** : persistance, comptes, sync, COMPLETE-003 | LOT-0 (comportement de GoTrue) | Concevoir le modèle d'identité (TRANS-11) **avant** de toucher TECH-024, 025, 026 |
| 6 | **LOT-7** : en ligne, SQL, serveur (nouvelle étape SQL) | LOT-0 (droits réels de la base), COMPLETE-005 | TECH-021 et 032 dans la même étape SQL |
| 7 | **LOT-8a à 8d** : multijoueur | LOT-1 (banc simulé), LOT-0 (Realtime) ; 8b avant 8c | 8a et 8b peuvent avancer en parallèle ; TECH-040 / 051 : décider du niveau de sécurité attendu |
| 8 | **LOT-9** : validation humaine, catégories, espacement des checkpoints, contenu | étapes 3 à 7 (physique et clés stabilisées) | COMPLETE-001 d'abord, puis COMPLETE-002 / 011 / 012 / 013 |
| 9 | **LOT-11a à 11c**, **LOT-12** : améliorations P2 à P4 et documentation | selon l'entrée | COMPLETE-010 après LOT-7 ; COMPLETE-022 après RISK-002 |

**Dépendances explicites**
- LOT-1 → LOT-4, LOT-5, LOT-8 (filet de tests) ; COMPLETE-005 → LOT-4, LOT-5 (déploiement) ; LOT-5 (`addDeco`) → TECH-034, 035 ; LOT-0 → LOT-6 (TECH-026), LOT-7 (TECH-021, 031), LOT-8b (TECH-011, 012, 050).
- LOT-4, LOT-5 → COMPLETE-001 (ne pas recaler les médailles avant d'avoir stabilisé la physique) → COMPLETE-002, 011, 012, 013.
- TECH-028, 029 → TECH-030 (l'import réutilise la fusion) ; TECH-024, 025, 026 → COMPLETE-003 (même modèle d'identité).
- LOT-8b → TECH-009 (recréer les voitures à l'arrivée et au retour) ; LOT-7 (nouvelle étape SQL) → COMPLETE-010 (fantômes officiels).

**Corrections regroupables (une cause, un correctif)**
- *Réapparition* (TRANS-04) : TECH-001, 013, 014, GAME-004 ; TECH-015 (client) à livrer en même temps que la réflexion sur « l'état au point de retour ».
- *Normalisation unique* (TRANS-01) : TECH-002, 003, 034, 035, 052, 053, 056, 060, 039.
- *Arbitre d'entrées* (TRANS-03) : TECH-004, 005, 006, 017, 020, 033, 065.
- *Étape SQL* : TECH-021, 032 (droits de colonnes) ; TECH-076, 079, 081 (règles dupliquées) dans la même migration.
- *Numéro de lancement* (TRANS-05) : TECH-008, 042, 047, 048, 049, 084, 085, GAME-008. *Présence individuelle* (TRANS-06) : TECH-010, 011, 012, 044, 046, 082, 086.

**Risques de régression** : voir H.3. **Peut attendre** : P3 et P4, sauf quand l'entrée est dans un lot déjà ouvert (la livrer alors avec lui). **Ne pas faire** : voir D.5, partie M de la phase 3.

### G.4 Investigations et tests supplémentaires avant correction (LOT-0)

| Sujet | Entrées | Quoi vérifier |
| --- | --- | --- |
| Droits réels de la base de production | TECH-021, 032, COMPLETE-005 | `has_column_privilege` sur `scores.ghost_veh`, `has_ghost`, `splits` ; état des étapes 7, 8, 13 ; `supabase/verify-prod.sql` |
| Supabase Realtime | TECH-011, 012, 044, 050 | ordre des évènements de présence pour une même clé avec deux connexions ; expiration du jeton ; fermeture de canal |
| GoTrue (renouvellement, réutilisation) | TECH-026 | rotation de jeton, intervalle de réutilisation, effet sur un compte |
| Limite d'inscriptions anonymes | TECH-031 | valeur réelle par adresse IP |
| Taille maximale de la sauvegarde | TECH-074 | comportement au-delà de 8 Mo compressés |
| Exploitabilité de la téléportation | GAME-004 | existe-t-il une trajectoire reproductible qui la déclenche en course normale ? (sinon P2, sinon P1) |
| Catégories de record par véhicule | GAME-006 | jouer « bateau » et « deltaplane » à la main sur plusieurs circuits |
| Intention du test depuis le curseur sur `flip0` | TECH-055 | décision de conception |
| Message « hors piste » à l'arrivée | TECH-072 | reproduire (> 0,5 s hors piste en franchissant la ligne) |
| Qualité automatique pendant replay / analyse | TECH-073 | machine lente |
| Parcours d'interface complet | voir annexe 4 | refaire (nouveau joueur, clavier / tactile, français / anglais) |

## H. Tests et validation

### H.1 Validation par entrée

Chaque entrée (B, C, D) comporte un champ **Validation** et, pour les bugs, le détail d'origine avec **conditions**, **reproduction** et **comportement problématique**. Les entrées non reproduites (« Très probable » ou « À vérifier ») sont listées en H.4 : elles ne doivent pas être corrigées avant leur confirmation.

### H.2 Tests automatiques à ajouter (filet de LOT-1)

1. **Course en direct ↔ rejeu** : jouer une course complète par `RaceSession._stepOnce` (pilote automatique perturbé, retours au checkpoint) puis la faire vérifier par `replayRun` sur le code relu ; comparer les temps. Réalisé à la main pendant l'audit sur deux circuits (temps identiques) : à automatiser.
2. **Retour au checkpoint sur / après une plaque** (moto, bateau, deltaplane), avec point de retour sur la plaque et checkpoint aérien : véhicule restauré, pas de chute en boucle (TECH-001).
3. **Vitesse de départ** après retour (TECH-013) ; **logique « temps »** avec `keepClock` (TECH-014).
4. **Round-trip de signature** : `decode(encode(x))` stable, dont un obstacle roulé de π, décorations aux coordonnées non arrondies (TECH-002, 034, 035) ; ajout au corpus `tools/compat`.
5. **Entrées** : pause + Entrée sur un bouton focalisé, manette avec A tenu à l'ouverture d'une superposition, capture de touche + changement d'écran, fenêtre ouverte + touches de course (TECH-004, 005, 006, 017) — dans `tools/test-browser.mjs`.
6. **Éditeur** : pose avec options armées incompatibles, retour d'essai, Ctrl+Z sous une fenêtre, gomme sur calque verrouillé (TECH-003, 033, 034, 036).
7. **Synchronisation** : quota insuffisant pour la fusion, écriture pendant la synchronisation, fusion de deux appareils (objectifs, pièces), import « Fusionner » (TECH-007, 023, 028, 029, 030) — avec `tools/fake-supabase.mjs`.
8. **Multijoueur (banc simulé de `tools/test-net.mjs` / `test-manche.mjs`)** : `started` après retour au salon, arrivant en cours de course, hôte absent / rechargé, présence à deux connexions, fermeture de canal (TECH-008 à 012, 044 à 049).
9. **SQL** : lisibilité des colonnes de `scores`, droits de l'export (TECH-021, 032) dans `tools/test-securite-sql.sh` / `test-etape*-sql.sh` (PostgreSQL 16 requis).

### H.3 Régressions à surveiller, par lot

| Lot | Systèmes susceptibles de régresser | Tests existants à relancer |
| --- | --- | --- |
| LOT-4 (noyau) | tous les temps, replays, fantômes, défi du jour, médailles, classements, rejeu serveur, analyse, Académie | `npm test` (dont `phys-fingerprint`, `test-simulation`, `test-fantomes`, `test-compat`, `test-niveaux`), `npm run test:deno`, `check-deployed` ; procédure de `docs/ARCHITECTURE.md` (« Changer la physique ») |
| LOT-5 (modèle, clés) | clés `b-`, `u-`, `daily-`, records locaux, `track_binds`, publication, éditeur (vérification) | `test-circuit`, `test-registres`, `test-compat`, `test-integrite`, `test-publication`, `test-codes-fuzz` |
| LOT-2 (course, entrées) | pause, arrivée, replay, Theater, manette, tactile, réglages | `tools/test-browser.mjs`, `test-hud`, `test-interface`, `test-menu`, `test-raccourcis` |
| LOT-3 (éditeur) | pose, annulation, essai, vérification, publication, logique, groupes | `test-editor`, `test-pick`, `test-contrats`, `test-editeur-*`, `test-groups`, `test-logique`, `test-browser-editeur` |
| LOT-6 (persistance, comptes) | records, profil, médailles, sauvegardes, code joueur, import / export | `test-account`, `test-records`, `test-audit-sauvegardes`, `test-sauvegardes-fuzz`, `test-etape4` |
| LOT-7 (en ligne, SQL) | classements, communauté, saisons, export, télémétrie | `test-etape*.mjs`, `test-submit-handler`, `test-submit-fuzz`, `test-seasons`, `test-legal`, `npm run test:sql` |
| LOT-8 (multijoueur) | salons, championnats, collisions, reconnexion, annuaire | `test-net`, `test-manche`, `test-rollback` |
| LOT-9 (contenu) | 72 circuits intégrés (clés inchangées), saisons, défi du jour, médailles | `test-niveaux`, `tools/contract.mjs`, `golden`, `medals`, `test-seasons`, `test-defi` |

Après toute correction : `npm run lint`, `npm test`, puis `npm run test:browser`. Pour le noyau, aussi `npm run test:deno` et, après redéploiement, `node tools/check-deployed.mjs`.

### H.4 Entrées non reproduites ou à confirmer (ne pas les présenter comme confirmées)

| Entrée | État | Ce qui manque |
| --- | --- | --- |
| GAME-006 | Probable (catégorie « bateau », mesures de vitesse) ; À vérifier (catégorie « deltaplane … | validation à la main |
| TECH-011 | Très probable | P1 sous réserve : « très probable » tant que le comportement réel de Supabase Realtime n'est pas observé ; à rétrograder en P2 si infirmé (… |
| TECH-012 | Très probable | P1 sous réserve : comportement serveur de Realtime à confirmer (LOT-0). |
| TECH-031 | Confirmé | La limite exacte d'inscriptions anonymes de Supabase est à vérifier (LOT-0). |
| TECH-050 | À vérifier | Impact À VÉRIFIER : dès que le relais TURN sert réellement (LOT-0). |
| TECH-055 | Très probable | Très probable : intention de conception à confirmer (LOT-0). |
| TECH-072 | À vérifier | À VÉRIFIER : demande plus de 0,5 s hors piste en franchissant la ligne. |
| TECH-073 | À vérifier | À VÉRIFIER : non observé sur une machine correcte. |
| TECH-081 | Très probable | Très probable ; exige une collision de signature de 32 bits. |

En complément : TECH-021 (confirmé dans le dépôt, **production à vérifier**), TECH-026 (compte : très probable) et le parcours d'interface complet (annexe 4) n'ont pas pu être reproduits.

### H.5 Preuves et reproductions

Les reproductions sont décrites en clair dans chaque entrée. Les scripts de sonde et les captures d'écran utilisés pendant l'audit étaient dans le dossier temporaire de la session (`/tmp/claude-0/.../scratchpad/probes/`, ≈ 21 Mo dont 105 captures, 95 pour le seul parcours d'interface interrompu) et **ne sont pas conservés dans le dépôt** (ils seraient analysés par ESLint). Ils sont perdus avec le conteneur ; voir l'annexe 1.

## Vérification de la consolidation

Contrôles effectués (voir le rapport de fin de phase pour les résultats chiffrés) :

1. Les trois rapports d'audit (phases 1, 2, 3) et la documentation de compréhension ont été relus et repris ; le rapport de la phase 0 n'existe pas sous forme de document (annexe 1).
2. Chaque identifiant (TECH-001 à 089, GAME-001 à 009, COMPLETE-001 à 024) apparaît : TECH ×89 et COMPLETE ×24 comme entrées principales ; GAME-004, 006, 007, 008 comme entrées principales ; GAME-001, 002, 003, 005, 009 comme observations fusionnées dans TECH-001, 008, 009, 013, 002.
3. Les doublons sont fusionnés sans perte : le détail d'origine et les observations de la phase 2 sont repris verbatim ; aucun problème n'est fusionné avec un autre simplement parce qu'il concerne le même système.
4. Les identifiants et références croisées (Relations, transversaux, lots) ont été contrôlés automatiquement : aucune référence orpheline.
5. Les priorités sont explicites (F.2) ; les deux changements (TECH-030, COMPLETE-005) sont justifiés dans leurs entrées.
6. Les entrées non confirmées sont isolées en H.4 et G.4.
7. La documentation de compréhension est reprise sans perte en annexes 6 à 11 (contrôle automatique ligne à ligne).

## Annexe 1 — Sources, traçabilité et lacunes

| Source | Statut |
| --- | --- |
| Phase 0 (préparation) | **Aucun document** : la préparation (organisation de l'audit, méthode par phase, limites, moyens, traçabilité) a été donnée dans la conversation. Elle prévoyait un registre `docs/audit/REGISTRE.md` qui **n'a jamais été créé** ; il est remplacé par les identifiants TECH / GAME / COMPLETE et par ce document. Sa substance est reprise en annexe 2. |
| Phase 1 — `PHASE1-AUDIT-TECHNIQUE.md` | Retrouvé et repris en entier (89 fiches, synthèse en annexe 3). Les quatre sous-agents (éditeur ; persistance, en ligne et serveur ; multijoueur ; course, interface et rendu) ont rendu leurs rapports **dans la conversation uniquement** : ils ont été intégrés aux fiches ; leurs rapports bruts (par exemple les listes « examiné et trouvé correct ») ne sont conservés que dans la mesure où la phase 1 les a repris (annexe 3, § 7.7 à 7.9). |
| Phase 2 — `PHASE2-AUDIT-EN-JEU.md` | Retrouvé et repris en entier. **Incomplet** : le parcours d'interface confié à un sous-agent (premières minutes, tous les écrans et boutons, réglages, anglais, téléphone, écrans hors ligne, éditeur en joueur novice) a été interrompu par la limite d'utilisation du compte. L'agent avait écrit 34 scripts et pris 95 captures, mais **n'a laissé aucune observation écrite** : rien n'en a été tiré (aucune conclusion inventée). |
| Phase 3 — `PHASE3-AUDIT-COMPLETUDE.md` | Retrouvé et repris en entier (24 fiches ; analyse qualitative en D.5). |
| `docs/comprendre/` (6 fichiers) | Retrouvé et **repris intégralement en annexes 6 à 11** ; ses écarts documentation ↔ code (§ 5.7) deviennent aussi DOC-001 à 010, ses deux constats de conception (§ 5.6, n° 5 et n° 10) RISK-001 et 002. |
| Sondes et captures | Dossier temporaire de session, non conservé dans le dépôt (voir H.5). Elles seraient à recréer pour reproduire les fiches ; chaque fiche décrit la reproduction en clair. |
| `ANALYSE-FONCTIONNELLE.md` (0.13.0) | Relu par la phase 3 ; ses urgences ont été traitées en 0.13.1 à 0.15.0 ; ce qui reste est repris dans COMPLETE-0xx. |

Notation d'origine conservée dans les fiches : « moi » désigne l'auditeur principal (vérification personnelle d'un constat délégué).

## Annexe 2 — Méthode et outils (phases 0, 1, 2)

**Phase 0** : confirmation de l'organisation en quatre phases ; limites anticipées : pas de test humain, pas d'accès à la production, moteurs de test limités (Chromium seulement, ni Deno ni PostgreSQL local), pas de serveur Supabase local, volume (≈ 70 000 lignes), faux positifs dans un code très commenté et très testé ; moyens : lecture du dépôt, `npm test` sur une copie, sondes Node, Chromium piloté par Playwright, faux Supabase, sous-agents en lecture seule dont les constats sont revérifiés.

#### Phase 1 — méthode

- **Par parcours d'exécution et par hypothèses testées**, pas par mots-clés : chaque soupçon a été confronté au code, puis, autant que possible, **démontré par une sonde** exécutée sur une copie du dépôt (Node pour le noyau, l'éditeur, la persistance, le réseau ; Chromium piloté par Playwright pour la course, l'interface et le rendu).
- Le noyau de simulation, la cohérence course en direct / rejeu serveur et la vérification des constats les plus graves ont été faits directement. Quatre domaines (éditeur ; persistance, en ligne et serveur ; multijoueur ; cycle de vie de la course, interface et rendu) ont été audités en parallèle par des sous-agents en lecture seule, avec des sondes reproductibles ; **leurs constats les plus graves ont été revérifiés à la main** (champ « Vérification » de chaque fiche).
- Les sondes ont été écrites dans un dossier temporaire de session (non conservé) ; chaque fiche décrit donc la reproduction en clair.
- Gravité : **CRITIQUE** (bloque une part importante du jeu, plantage, perte majeure), **ÉLEVÉ** (dégrade fortement une mécanique), **MOYEN** (bug réel mais limité ou contournable), **FAIBLE** (mineur). Certitude : **CONFIRMÉ** (démontré par le code ou une sonde), **TRÈS PROBABLE** (mécanisme clair, pas entièrement reproduit), **À VÉRIFIER**.
- Les constats déjà notés dans [../comprendre/05-interactions-et-zones-sensibles.md](../comprendre/05-interactions-et-zones-sensibles.md) § 5.6 sont repris ici sous un identifiant `TECH-…` (colonne « Ancien n° »). Un problème = une cause : ses différentes conséquences sont dans la même fiche.

#### Phase 2 — comment les essais ont été faits (et leurs limites)

| Moyen | Ce qu'il permet | Limite |
| --- | --- | --- |
| Chromium piloté (Playwright), jeu servi en local | parcours réels : accueil, menus, courses au clavier, pause, arrivée, replay, garage, éditeur, réglages, anglais, téléphone simulé, captures d'écran regardées | rendu logiciel lent : pour les longues courses, les images sont avancées par le code du jeu (`session.update`, `_stepOnce`) avec les vraies commandes ; pas de son, pas de vraie manette, pas de vrai téléphone |
| Multijoueur local du jeu (`?net=local`, deux ou trois onglets) | vraies salles, vrai WebRTC entre onglets, départ commun, arrivées | une seule machine : ni latence, ni coupures réelles, ni Supabase Realtime |
| Physique du jeu sans rendu (Node) + pilote automatique du jeu, perturbé | comportements de joueur répétés sur les 72 circuits : retours au checkpoint, maladresses, coupes, catégories de record | le pilote automatique n'est pas un humain : un échec n'est pas une preuve d'impossibilité (signalé « Probable » ou « À vérifier ») |
| Serveur en ligne | **non accessible** : les requêtes vers Supabase ont été bloquées ; le jeu a été vu tel qu'un joueur hors ligne le voit | classements, communauté, comptes, publication réelle non testés |

Certitude : **Reproduit** (observé en jouant, ou rejoué à l'identique avec la physique du jeu), **Confirmé par inspection** (code), **Probable**, **À vérifier**.

## Annexe 3 — Synthèse de la phase 1 (reprise intégrale)


#### Phase 1, §7.1 — État technique général
Le **noyau de simulation est solide** : déterminisme vérifié (course en direct ↔ rejeu serveur au bit près, ordre des pièces sans effet, signature complète pour les champs physiques), points de retour robustes, collisions très défensives, 1 755 vérifications automatiques au vert. Les défauts du noyau sont des **cas de règles mal combinées** (plaques et réapparition, vitesse de départ, logique et chrono du multijoueur), pas des erreurs de calcul.
La fragilité est ailleurs : **dans les états qui traversent plusieurs systèmes** (entrées partagées entre l'interface et la course, captures et minuteries qui survivent à un changement d'écran, normalisations non idempotentes entre mémoire et code), **dans la synchronisation entre appareils et entre onglets**, et surtout **dans le multijoueur**, dont la gestion des états de salle, de l'identité et de la présence Realtime présente le plus de défauts sérieux.

#### Phase 1, §7.2 — Les problèmes les plus importants
1. TECH-001 (blocage par réapparition sur une plaque) et TECH-002 (circuits avec obstacle au plafond impossibles à publier et à classer) : invisibles pour les tests actuels, ils touchent le cœur de la boucle de jeu et du classement.
2. TECH-004, TECH-005, TECH-006 : trois façons ordinaires (Entrée sur « Reprendre », A tenu à la manette, une capture de touche oubliée) de perdre une course ou ses réglages.
3. TECH-003 : l'éditeur peut détruire des pièces sans le dire.
4. TECH-007 : un compte peut ne jamais afficher sa progression sur un appareil, en le disant « à jour ».
5. TECH-008 à TECH-012 : salles multijoueur qui lancent des invités contre leur gré, joueurs invisibles, salles bloquées ou fermées, joueurs exclus par la gestion de présence.

#### Phase 1, §7.3 — Systèmes les plus fragiles
- **Multijoueur** (`js/net/room.js`, `signaling.js`, `transport.js`, `app/multi.js`) : 25 constats ; état de salle à événements sans numéro de lancement ni de version, identité déclarée, présence Realtime simplifiée.
- **Synchronisation et persistance** (`account.js`, `cloudsave.js`, `profile.js`, `storage.js`) : résultats d'écriture ignorés, règles de fusion incomplètes, aucun suivi entre onglets.
- **Éditeur** (`editor/tools.js`, `inspector/*`, `history.js`) : plusieurs chemins de modification qui ne passent pas par les mêmes contrôles (normalisation, conflits, débordements, calques).
- **Entrées et superpositions** (`input.js`, `ui.js`, `main.js`, `wiring.js`) : un seul état de touches partagé par l'interface DOM, la course et l'éditeur.

#### Phase 1, §7.4 — Causes communes
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

#### Phase 1, §7.5 — Risques de régression (à garder en tête pour les corrections)
- **Toute correction de TECH-001, 013, 014** touche la physique ou la logique dans la fermeture de `js/verify.js` : incrément de `PHYS_VER`, empreinte, temps de référence, médailles, corpus de compatibilité, **redéploiement manuel** de `submit-score` (procédure : `docs/ARCHITECTURE.md`).
- **TECH-002 et TECH-039** changent des signatures : les clés `u-…` de circuits existants changeraient (records locaux, classements, liaisons `track_binds`).
- **Modifier un circuit intégré** change sa clé `b-` sans migration : records, médailles, verrous de chapitre, classements, saisons et duels concernés (`../comprendre/04-systemes.md` § 4.11).
- **Le traducteur anglais** agit sur tout le document, contenus des joueurs compris (`../comprendre/04-systemes.md` § 4.4) : tout texte ajouté peut être capturé par un modèle trop général.
- **Les deux chemins de pas** (`RaceSession._stepOnce` et `GhostRunner.step`) sont aujourd'hui équivalents ; toute modification de l'ordre doit être faite des deux côtés (voir § 7.8 pour la vérification faite).
- **Corrections des entrées** (TECH-004 à 006, 017) : `tools/test-browser.mjs` pilote le jeu par `window.copytrack` et par des touches ; à relancer.

#### Phase 1, §7.6 — Problèmes qui demandent un test dans le jeu ou en production
- **Production Supabase** : TECH-021 (droits réels sur `scores`), TECH-031 (limite d'inscriptions anonymes), TECH-012 et TECH-011 (comportement réel de Realtime), TECH-050 (expiration TURN), TECH-074 (limite de taille de la base). `supabase/MIGRATIONS.md` indique `submit-score` déployée en `PHYS_VER` 38 avec le build de la 0.12.3 : le code actuel n'en diffère que par des noms (vérifié), seule l'empreinte de build diffère.
- **Navigateurs réels** : TECH-004 (focus selon le pointeur), TECH-005 (manettes réelles), TECH-067 (vibration sur téléphone), TECH-073 (machines lentes), TECH-019 (lisibilité du verre).
- **Multijoueur réel à plusieurs machines** : TECH-008 à 012, 041 (ressenti des collisions), 043.

#### Phase 1, §7.7 — Hypothèses examinées et réfutées
- Réapparition à un checkpoint posé sur chaque type de pièce qui l'accepte, à l'endroit et à l'envers (30 cas) : correcte.
- Ordre des pièces dans le code : sans effet sur la physique (72 circuits × 2 ordres, au bit près).
- Champs lus par la physique absents de la signature : aucun (pièces, décorations physiques, règles du circuit).
- Mutation du circuit officiel en cache par les modes ou catégories de record : non (`applyRules` copie).
- Coût de l'écran carrière (≈ 1 100 lectures de records complets) : 28 ms pour 72 records de 21 Ko, acceptable.
- Arrondi du temps de l'auteur à la publication (`setVerified` au millième, tolérance 1 ms) : correct (13 circuits rejoués).
- Longueur des clés et expressions de la base : conformes ; fusion des records et des circuits (3 000 cas aléatoires) : rien perdu hors pierres tombales.
- Fuites GPU et de graphe de scène sur 30 courses, 15 passages au garage, 5 replays : aucune croissance.
- Pause pendant le décompte, redémarrage pendant le « GO », retours au checkpoint en rafale, perte du contexte WebGL : corrects.

#### Phase 1, §7.8 — Zones réellement examinées
- **Noyau** : `simulation.js`, `raceLogic.js`, `physics.js`, `physics/walls.js`, `physics/contact.js`, entrées / sorties de `physics/ribbon.js`, `track.js` (signature, lecture), `track/surfaces.js`, `track/edit.js` (normalisation des décorations), `sim/logic.js`, `sim/params.js`, `replay.js`, `verify.js`, `daily.js`, `rulesCore.js`, `variants.js` ; sondes sur les points de retour, les plaques, la vitesse de départ, la logique en multijoueur, l'ordre des pièces, la signature.
- **Équivalence course en direct ↔ rejeu serveur** : course réelle dans Chromium (chemin `RaceSession._stepOnce`, pilote automatique bruité, trois retours au checkpoint au clavier), puis `replayRun` sur le code relu : **temps identiques** sur « Premiers Éclats » (51,450 s) et « Laminoir », circuit à obstacles (61,675 s).
- **Éditeur** (audit délégué, revérifié) : pose, outils, inspecteur, gizmo, historique, essai et retour, calques, logique, débordements, signature.
- **Persistance, comptes, en ligne, serveur** (audit délégué, revérifié pour TECH-007, 021, 022, 024, 025, 028) : stockage, fusion, synchronisation, import, sessions, fonction `submit-score`, étapes SQL (lecture).
- **Multijoueur** (audit délégué avec salles simulées, revérifié pour TECH-008, 009, 011, 012, 040, 041) : salle, présence, signalisation, maillage, championnat, collisions, reconnexion.
- **Course, interface, rendu** (audit délégué dans Chromium, revérifié pour TECH-015, 016, 018, 019, 020, 063) : cycle de vie, superpositions, entrées, Theater, garage, qualité, fuites.

#### Phase 1, §7.9 — Zones insuffisamment explorées
- Géométrie analytique pièce par pièce (`pieces.js : sampleLocal`, `ribbons.js : frameLocal`, rubans roulés) et cohérence fine avec `trackGeometry.js` : couverte par les tests existants (`audit-pieces`, matrice, empreinte), pas réauditée.
- `physics/ribbon.js` au-delà de l'entrée, de la sortie et de la gravité ; véhicules v2 ; `autopilot.js`.
- Analyse de course (`analysis/*`), HUD d'entraînement, coach : seulement la partie qui rejoue les courses.
- Étapes SQL et politiques RLS ligne à ligne, `submit-score/handler.js` en détail, fonction `ice` : lecture partielle, aucun PostgreSQL disponible.
- Toucher, pincer, manette dans l'éditeur ; navigation clavier complète ; parcours complet en anglais.
- Fuites de mémoire JavaScript (écouteurs, fermetures, tables) hors GPU et graphe de scène.
- Comportement réel de Supabase Realtime, de WebRTC entre machines, et de la base de production.

## Annexe 4 — Phase 2 : hypothèses écartées, bilan, limites et scénarios à tester (reprise intégrale)

#### Phase 2, §3 — Essais de jeu sans défaut constaté (hypothèses écartées)

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

#### Phase 2, §4 — Bilan de la phase 2

##### Phase 2, §4.1 — Expérience de jeu observée
En jouant (clavier, Chromium) et en rejouant des milliers de situations avec la physique du jeu, le cœur de l'expérience **tient bien** : on finit tous les circuits, on peut revenir à n'importe quel checkpoint, les objectifs, leçons et défis du jour sont réalisables, aucune coupe ne permet de tricher, la course en direct est exactement celle que le serveur rejoue, aucune dégradation sur une longue session. Les problèmes trouvés se concentrent sur **des combinaisons** (plaque de transformation + checkpoint, vitesse de départ + retour, obstacle au plafond + vérification), sur **le multijoueur à plusieurs**, et sur **des catégories de record proposées sans être faisables**.

##### Phase 2, §4.2 — Synthèse
| Catégorie | Constats |
| --- | --- |
| Softlocks / situations sans issue (hors « Recommencer ») | GAME-001 ; GAME-005 si l'ouverture exige l'élan ; GAME-006 (catégories infranchissables) |
| Progression | GAME-009 (publication impossible) ; GAME-006 (classements de catégories vides) ; GAME-007 (longs tronçons sans checkpoint) |
| Comportements anormaux | GAME-004 (téléportation) |
| Multijoueur | GAME-002, GAME-003, GAME-008 |
| Phase 1 confirmée en jeu | TECH-001 (GAME-001), TECH-002 (GAME-009), TECH-008 (GAME-002), TECH-009 (GAME-003), TECH-013 (GAME-005) ; déjà reproduits dans Chromium pendant la phase 1 : TECH-004, 005, 006, 015, 016, 017, 018, 019, 020, 033, 034, 063, 064, 065, 067, 068, 071 |
| Nouveaux | GAME-004, GAME-006, GAME-007, GAME-008 |

##### Phase 2, §4.3 — Ce qui n'a pas pu être testé, et pourquoi
- **Le parcours d'interface complet en navigateur** (premières minutes, chaque écran et bouton, réglages, anglais, téléphone simulé, écrans hors ligne, éditeur en joueur novice) avait été confié à un sous-agent ; il a été **interrompu par la limite d'utilisation du compte** avant de rendre ses résultats. Ces écrans n'ont donc été vus que partiellement (course, pause, arrivée, salon multijoueur, éditeur au retour d'une vérification) ; une grande partie avait été examinée dans Chromium pendant la phase 1 (superpositions, entrées, Theater, garage, fuites). **À refaire en priorité si une suite de la phase 2 est souhaitée.**
- **Services en ligne** (classements, communauté, comptes, publication réelle, saisons, duels) : serveur inaccessible.
- **Vraie manette, vrai téléphone, son, ressenti de conduite, lisibilité à 60 images/s** : impossibles sans matériel ni carte graphique.
- **Multijoueur entre machines** (latence, coupures, Realtime) : seulement entre onglets d'un même navigateur.

##### Phase 2, §4.4 — Scénarios qui mériteraient des tests supplémentaires
1. Parcours complet d'un nouveau joueur, au clavier puis au tactile, en français et en anglais.
2. Chaque catégorie de record « véhicule » jouée à la main sur quelques circuits (confirmer GAME-006).
3. Multijoueur réel à trois ou quatre machines, avec coupures Wi-Fi et rechargements (TECH-010 à 012).
4. Éditeur : un joueur qui construit, teste, revient, annule, publie (TECH-003, 033 à 035).
5. Courses de 10 minutes et plus, onglet masqué, téléphone verrouillé.

## Annexe 5 — Correspondance des anciens numéros (`docs/comprendre/05` § 5.6)

Les constats numérotés de 1 à 13 dans la documentation de compréhension correspondent aux entrées suivantes (colonne « Ancien n° » des fiches). Les n° 5 et 10, sans bug de code, sont devenus RISK-001 et RISK-002.

| Ancien n° | Entrées |
| --- | --- |
| 1 | TECH-021 |
| 2 | TECH-003 |
| 3 | TECH-034 |
| 4 | TECH-019 |
| 5 | RISK-001 |
| 6 | TECH-022 |
| 7 | TECH-008, TECH-009, TECH-040, TECH-041 |
| 8 | TECH-035 |
| 9 | TECH-053 |
| 10 | RISK-002 |
| 11 | TECH-020 |
| 12 | TECH-063, TECH-083 |
| 13 | TECH-025 |

Tableau d'origine (docs/comprendre/05 § 5.6, repris tel quel) :


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

## Annexes 6 à 11 — Documentation de compréhension (`docs/comprendre/`, reprise intégrale)

Ces six documents expliquent **comment le jeu est construit et comment ses systèmes se parlent** ; ils sont repris ici sans coupure, pour que ce fichier contienne tout le nécessaire à la correction. Les originaux restent dans `docs/comprendre/` ; en cas d'écart, ce sont eux qui font foi (les numéros de ligne cités datent de la 0.16.0). Les liens relatifs ont été réécrits ; les titres ont été décalés de deux niveaux.

## Annexe 6 — Comprendre Trackigami — index et couverture de l'analyse (README)

*Source : `docs/comprendre/README.md`*

### Comprendre Trackigami : carte technique du jeu

Documentation de **compréhension** (novembre 2026, bêta 0.16.0, `PHYS_VER` 38) : comment le jeu fonctionne réellement, comment ses systèmes se parlent, et ce qu'une modification risque de casser ailleurs. Elle complète, sans les répéter, [l'architecture](../ARCHITECTURE.md) (principes, procédures) et [l'index des modules](../MODULES.md) (rôle de chaque fichier, généré).

Écrite pour un développeur ou une session d'IA qui reprend le projet : lire ce fichier, puis le document du domaine touché, **avant** de modifier le code.

#### Les documents

| Fichier | Contenu |
| --- | --- |
| [01-vue-ensemble.md](../comprendre/01-vue-ensemble.md) | le jeu, les technologies, le démarrage pas à pas, les couches, le motif des familles de méthodes, la carte des dossiers, les fichiers générés, les tests |
| [02-simulation.md](../comprendre/02-simulation.md) | le noyau déterministe : son périmètre exact (42 fichiers), le contrat d'un pas, les **deux chemins de pas**, le pipeline de `CarPhysics`, la gravité, le circuit vu par la physique, les checkpoints, `PHYS_VER`, les clés de classement |
| [03-course.md](../comprendre/03-course.md) | la boucle de l'application, `RaceSession` (états, image, pas, évènements → effets, rendu), fantômes, replay, Theater, l'arrivée, le retour |
| [04-systemes.md](../comprendre/04-systemes.md) | une fiche par système : application et navigation, entrées, audio, langues, garage, multijoueur, persistance et comptes, en ligne et serveur, éditeur, rendu et caméra, progression et contenus |
| [../audit/PHASE1-AUDIT-TECHNIQUE.md](../audit/PHASE1-AUDIT-TECHNIQUE.md) | **audit technique (phase 1)** : 89 problèmes identifiés (`TECH-001` à `TECH-089`), causes communes, risques de régression |
| [05-interactions-et-zones-sensibles.md](../comprendre/05-interactions-et-zones-sensibles.md) | carte des dépendances, parcours transverses (chargement, retour au checkpoint, gravité, checkpoint, collisions, obstacles…), ce qui continue de tourner, zones sensibles, **« si tu modifies… regarde aussi »**, défauts constatés, écarts entre docs et code |

Marques utilisées : **[V]** vérifié dans le code (avec `fichier:ligne`), **[D]** déduction raisonnable à partir du code, **[?]** incertain. Les numéros de ligne datent de la 0.16.0 : ils dérivent, les noms de fonctions restent.

#### Réponses courtes

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

#### Couverture de cette analyse

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

## Annexe 7 — Vue d'ensemble : le jeu, le démarrage, les couches, la carte des dossiers

*Source : `docs/comprendre/01-vue-ensemble.md`*

### 1. Vue d'ensemble : ce qu'est le jeu et comment il est construit

#### 1.1 Le jeu en une page

Jeu de course **contre-la-montre** low-poly dans le navigateur, avec **éditeur de circuits**. Le joueur pilote une voiture (qui peut devenir moto, bateau ou deltaplane sur des plaques) sur des circuits faits de **pièces posées sur une grille 3D** : routes, virages, pentes, loopings, vrilles, tubes, murs, plafonds, bifurcations, carrefours, plaques ; revêtements (glace, boost, rebond, aimant, eau, gravité, inversion…), obstacles animés, solides, pièces mobiles.

Contenus : 72 circuits intégrés en 12 chapitres de carrière (médailles bronze → cristal, objectif bonus), défi du jour généré par la date, saisons hebdomadaires, Académie (leçons et exercices notés), modes de jeu, fantômes, replays et Replay Theater, classements en ligne **vérifiés par le serveur**, communauté (publication, likes, playlists, commentaires), comptes et sauvegarde cloud, duels et tournois asynchrones, multijoueur en direct (WebRTC), garage (apparence seulement), personnalisation de l'interface et des caméras, deux langues.

Version : `bêta 0.16.0` ; physique `PHYS_VER = 38` ; protocole réseau `NET_VER = 4` (`js/version.js`).

#### 1.2 Technologies

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

#### 1.3 Le démarrage (vérifié)

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

#### 1.4 Les couches

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

#### 1.5 Le motif « familles de méthodes »

Les grosses classes (`App`, `RaceSession`, `EditorSession`, `Inspector`, `Scenery`, `Track`, `CarPhysics`, `GarageSession`) sont découpées en objets `export const xMethods = { … }` rangés dans un dossier du même nom et fusionnés par `Object.assign(Classe.prototype, …)` (par exemple `main.js:487`, `race.js:733`, `physics.js:866`, `track.js:529`).
Conséquences pratiques :
- une méthode peut être appelée depuis n'importe quel fichier de la famille : chercher `nomDeMethode(` dans tout `js/`, pas seulement dans le fichier de la classe ;
- deux familles qui définissent la même méthode s'écrasent silencieusement : `tools/test-contrats.mjs` l'interdit ;
- l'état est partagé par `this` : un champ `this._xxx` posé dans une famille est lu ailleurs.

#### 1.6 Carte des dossiers

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

#### 1.7 Fichiers générés (ne pas modifier à la main)

`sw.js` et le bloc `modulepreload` d'`index.html` (`npm run sw`), `supabase/functions/*/index.ts` (`npm run build:function`), `tools/phys-fingerprint.json`, `tools/golden-temps.json`, `tools/compat/corpus.json`, `docs/MODULES.md` (`npm run docs`, à partir de la **première phrase du commentaire de tête** de chaque module), `js/pieceFacts.js` et `docs/MATRICE-PIECES.md` (`node tools/matrice-pieces.mjs --update`), `docs/FICHE-ESSAI.md`, `wiki/`. Détail et contrôles : `docs/ARCHITECTURE.md`, « Fichiers générés ».

Conséquence : **ajouter ou renommer un fichier `.js`** oblige à régénérer `sw.js` (sinon `npm test` échoue et le jeu hors ligne manque ce fichier), et à donner au fichier un commentaire de tête (sinon `docs/MODULES.md` ne peut être régénéré).

#### 1.8 Tests et CI

- `npm test` → `tools/run-tests.mjs` : chaque `tools/test-*.mjs` dans son processus, en parallèle, plus `check-generated`, `check-docs`, `phys-fingerprint`, `audit-pieces`, `sim` (les 72 circuits au pilote automatique). **État constaté lors de cette analyse : 124 fichiers, 1 755 vérifications, toutes réussies** (exécuté sur une copie du dépôt ; deux tests demandent un dépôt git et ont été relancés dans le dépôt).
- Hors `npm test` : `npm run test:browser`, `test:deno`, `test:sql`, `lint`.
- CI (`.github/workflows/test.yml`) : lint + tests + fichiers générés à jour, Deno, navigateurs, SQL, et une tâche « gate ». Deux autres tâches planifiées : `surveillance` (site et fonction en ligne, chaque jour) et `sauvegarde` (copie chiffrée de la base, chaque semaine).
- Harnais commun : `tools/harness.mjs` (`test`, `finish`) ; un fichier de test qui n'exécute aucune vérification est compté comme un échec.

## Annexe 8 — Le noyau de simulation

*Source : `docs/comprendre/02-simulation.md`*

### 2. Le noyau de simulation

Ce qui décide d'un temps. Tout ici est **sans rendu, sans DOM, déterministe**, et tourne à l'identique dans le navigateur, sous Node (outils, tests) et sous Deno (fonction serveur `submit-score`).
Toute ligne modifiée dans ce périmètre peut changer un temps, un replay, un fantôme ou un classement.

#### 2.1 Le périmètre exact : la fermeture de `js/verify.js`

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

#### 2.2 Le contrat d'un pas (1/120 s)

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

##### Deux chemins qui doivent rester équivalents (point sensible n° 1)

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

#### 2.3 `CarPhysics.step` : le pipeline d'un pas

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

##### Les revêtements et plaques : où ils agissent

`_setGround` (`physics.js:179`) est le point unique où une surface touchée déclenche son effet : `reverse`/`cut` (`_timedMods`), `spring`, `boost` (`_boostPad`), `gravity` (`_gravityPad`), `flip` (inverse `gSign`), plaques de **transformation** `moto/boat/glider` (`_transformPlate`, repasser sur la même plaque ramène la voiture). `plateLock` empêche qu'une suite de plaques collées compte plusieurs fois. Sur un ruban, `_ribStep` applique les mêmes fonctions (`_boostPad`, etc.).

##### Gravité et orientation (comment elles s'influencent)

- `gSign` (±1) : sens de la gravité. `gravMul` : intensité (plaque gravité, règle `g0`, action `grav` de la logique). `this.g = CAR.gravity × gravMul`.
- Elle s'inverse par : plaque `flip` au sol (`_setGround`), ruban qui retourne la voiture (`ribbonInverts(tile)` ou revêtement `flip` sur le ruban, `ribbon.js:257`), règle de départ `flip0` / départ posé à l'envers (`raceLogic.js:27 spawnPoint`).
- Elle commande : quelle requête de sol est utilisée (`surfaceAt` vs `ceilingSurfaceAt`), le « haut » local du volant (`_upSign`, au plafond la droite du pilote est la gauche du monde), la balistique, la perte dans le ciel (`skyY`), la caméra (`camflip.js`, `race/camera.js`), l'orientation visuelle (`race.js:247 _orient`).
- Elle est **restaurée** au checkpoint : chaque point de retour garde `gs` (`respawnGs`, `raceLogic.js:11`), `grav` et `vehicle`.

#### 2.4 Le circuit vu par la physique (`js/track.js`, `js/track/surfaces.js`, `js/pieces.js`, `js/ribbons.js`)

- Grille : case `CELL = 32 m`, niveau `LEVEL_H = 6,4 m`, route de 24 m (`ROAD_HALF = 12`), `MAX_LEVEL = 60` (`constants.js`).
- `Track.index` : `Map` case → pièces (`track.js:171 tilesAt`). `Track.cellsOf` (`:86`) inclut les cases **balayées** par une glissière ou une rotation ; `Track.range` (`:109`) les niveaux réservés (portiques, anneaux, murs, rubans roulés, ascenseurs).
- `Track.version` est incrémenté par toute modification (`_insert`, `remove`, `setParams`, `setLogic`, `clear`, et les méthodes de `track/edit.js`) : il invalide les caches `obstacles`, `obstacleGrid`, `solidIndex`, `hasMovers`.
- `sampleLocal(tile, lx, lz)` (`pieces.js:703`) est la **géométrie analytique** d'une pièce au sol : hauteur, normale, écart latéral `d`, dans l'emprise ou non. La même fonction sert à la physique, aux checkpoints et aux maillages (`trackGeometry.js`).
- `ribbonOf(tile)` / `frameLocal(rib, u)` (`ribbons.js:30`, `:396`) : la géométrie des **rubans** (loopings, vrilles, tubes, murs, plafonds, rubans roulés `tile.o`). `isRibbon(tile)` décide si une pièce se parcourt en mode ruban.
- Sol : `surfaceAt(x, y, z, out, step, broken, time, hidden)` (`track/surfaces.js:48`) — la surface la plus haute sous le point, parmi les pièces fixes, puis les pièces mobiles **à leur position au chrono `time`**, puis le dessus des solides. Plafond : `ceilingSurfaceAt` (`:18`), pièces posées à l'envers (jamais mobiles : `OPTION_CONFLICTS`, `pieces.js:472`).
- Le circuit n'a **pas d'horloge** : chaque voiture interroge les pièces mobiles à son propre chrono (`phys.clock`). Le joueur, le fantôme or et un adversaire partagent le même `Track` sans interférer.

##### État propre à chaque voiture (jamais dans le `Track`)

Verre brisé (`phys.broken`, `glassTime`, restauré par `place()`), groupes cachés par la logique (`setLogicExclusion` → `phys.excl` et `logic.excluded`), `plateLock`, minuteries de grâce (`graceT` 1,5 s, `hazardGrace` 0,8 s après un (re)départ : ni verre, ni piques, ni obstacles), `glassSafe` (le verre sous un point de retour ne cède pas tant que la voiture ne l'a pas quitté). Cette séparation est ce qui permet plusieurs simulations sur un même circuit : **ne jamais ranger d'état de course dans `Track`**.

#### 2.5 Règles de course (`js/raceLogic.js`)

- `cps` : pièces checkpoint (`cpKind` : pièce checkpoint, option `cp` 1 portique / 2 anneau). `collected` : checkpoints pris. `splits` : pas de passage.
- `update(phys)` (`:97`) : pour chaque pièce de la case de la voiture : anneau (franchissement du plan, cercle de rayon `RING_R`), portique (fenêtre verticale, emprise, `|d| ≤ ROAD_HALF + 1,5`), arrivée (`missing` s'il manque des checkpoints, `lap` s'il reste des tours, sinon `finish`). Les pièces cachées par la logique sont ignorées.
- Chaque checkpoint pose un **point de retour** `respawn = { x, y, z, yaw, vehicle, grav, gs, snap }` ; `snap` (`_snap`, `:52`) garde `steps`, nombre de `splits`, `collected`, `lap` et l'état de la logique (`ext`). `rewind` (`:63`) restaure tout cela (sauf le chrono avec `keepClock`, en multijoueur).
- Cas particuliers vérifiés : anneau aérien → retour au dernier sol stable (`lastGround`, relevé tous les 30 pas) avec le chrono de ce moment ; ligne d'arrivée franchie hors chaussée → point de retour ramené sur la route ; cap du retour retourné si la voiture passait à contresens.

#### 2.6 Ce qui s'ajoute à la physique « derrière une donnée »

Principe (vérifié dans le code) : à leur valeur par défaut, ces options ne font **aucune opération** de plus ; l'empreinte des scénarios existants ne bouge pas.

| Donnée du circuit (`track.js : RULES`, `:32`) | Lue par | Effet |
| --- | --- | --- |
| `grip`, `wind`, `windDir` | `sim/params.js : paramsOf` → `phys.params` | adhérence et vent de tout le circuit |
| `rain`, `frost`, `gust`, `envSeed`, `envVary` | `sim/env.js : envOf` → `phys.env` (`null` par défaut) | flaques, givre, rafales tirés d'une graine et du chrono |
| `vm`, `pm` | `physics/profiles.js : specsOf`, `v2Of` | profils Arcade / Simulation, véhicules v2 |
| `offroad`, `v0`, `g0`, `veh0`, `flip0` | `raceLogic.js : placeAtStart`, `CarPhysics.offTrack` | règles de départ |
| `lg` (logique) | `sim/logic.js : createLogic` | montrer / cacher des groupes, gravité, compteurs, effets |

Chacune entre dans la **signature** (`track.js:339 signatureText`) dès qu'elle quitte sa valeur par défaut, et force le format de code v4.

#### 2.7 Obstacles, solides, logique

- **Obstacles** (`obstacles.js`, `physics/obstacles.js`) : des décorations particulières (`OBST` : piques, balanciers, marteaux, murs coulissants, balayeurs, bumpers), mouvement fonction du **chrono seul** (`obstacleLocal(d, t)`). Index spatial de 20 m sur le circuit (`Track.obstacleGrid`), parcouru dans un ordre fixe : l'ordre compte, chaque contact corrige la position avant le suivant. Piques = contact létal (`ev.spike + ev.sink`).
- **Solides** (`solids.js`) : décorations « en dur » (piliers, poutres, murs, blocs). Côtés = bordures (`walls.js : _probeSolids`), dessus = sol (`solidFloor` dans `surfaceAt`), dessous = toit (`_solidRoof`). Index de 16 m.
- **Logique** (`sim/logic.js`) : état par simulation (groupes cachés, compteurs, déclenchements), isolé (ensembles créés dans `createLogic`). Ses effets visuels (`fx`) ne sont lus que par la course en direct (`race.js:126 _logicSync`) ; les fantômes et le serveur les ignorent (file plafonnée à 64).

#### 2.8 Ce qui lie tout : `PHYS_VER`, empreinte, corpus

- `PHYS_VER` (`js/version.js:17`, actuellement 38) est écrit dans chaque record (`pv`), fantôme partagé (`v`) et envoyé au serveur ; un écart rend les commandes non rejouables (`race.js:143`) et fait refuser le temps (`verify.js : versionError`).
- `tools/phys-fingerprint.mjs` : 193 scénarios (pilote automatique et commandes pseudo-aléatoires sur les 72 circuits, défis du jour, cas spéciaux) hachés au bit près ; doit être identique sous Node, Deno et Chromium (CI).
- `tools/compat/corpus.json` (`tools/test-compat.mjs`) : clés de classement, codes de tous formats, courses enregistrées avec leur temps exact.
- Procédure de changement de physique : `docs/ARCHITECTURE.md`, « Changer la physique » (incrément de `PHYS_VER`, empreinte, temps de référence, médailles, corpus, fonction serveur **à redéployer à la main**).

#### 2.9 Clés de classement (dépendent de ce périmètre)

| Clé | Construite par | Dépend de |
| --- | --- | --- |
| `b-<id>-<hash>` | `main.js:95` : `hashString(buildBuiltin(def).encode())` | **tout** le code du circuit : script, nom, auteur (`BUILTIN_AUTHOR = 'Copytrack'`, ancien nom gardé exprès), décor, obstacles, paramètres |
| `daily-AAAA-MM-JJ` | `daily.js : dailyChallenge` | la date seule : le circuit est **régénéré** (graine de la date, tentatives validées par le pilote automatique). Un changement du générateur, des pièces ou de la physique change le circuit d'un jour passé sans changer sa clé (gardé par le corpus et l'empreinte) |
| `u-<signature>` | `track.js:362 userKey` | `signatureText()` : pièces, décorations physiques, **décor** (`this.decor` est en tête de la signature), tours, règles, logique et groupes ; pas le nom, la description, l'auteur, les couleurs, le thème de pièce `th`, l'ambiance, les scripts |
| `<clé>~v1.<variante>` | `variants.js` | la clé de base + des règles appliquées à une copie (`rulesCore.js`) ; `sea-N`, `duel-N`, `tour-N`, `as-1` (aides) |
| `e-<hash du code>` | `app/editorFlow.js:102` | essais depuis l'éditeur (jamais envoyés au serveur, mais enregistrés en local : voir zones sensibles) |

## Annexe 9 — La course en direct : boucle, états, effets, arrivée

*Source : `docs/comprendre/03-course.md`*

### 3. La course en direct : boucle, états, effets, arrivée

#### 3.1 La boucle de l'application (`js/main.js:393 start`)

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

#### 3.2 `RaceSession` (`js/race.js:41`)

Classe découpée en familles de méthodes (`Object.assign`, `race.js:733`) : `race/camera.js`, `race/ghosts.js`, `race/net.js`, `race/finish.js`, `race/replayMode.js`, `race/scriptsRun.js`, `race/training.js`, `theater/session.js`, `theater/cameras.js`.

##### Construction (`race.js:42`)
Dans cet ordre : aides à la conduite (`aids.js` : clé déplacée vers `~v1.as-1`, médailles retirées), `TrackView` (maillage, ajouté à `scenery.trackGroup`), `scenery.setTrack` (décor, ambiance), **`Simulation`**, `EnvFx`, modèle de la voiture (`createCar(profile().loadout)`), traces, voiture fantôme du record, pilote automatique (démo), replay (`decodeInputs`), fantômes simulés (`_setupGhosts` : or si la médaille d'or n'est pas gagnée et que le circuit a une ligne `track.path`, fantôme importé si même `PHYS_VER`), adversaires (multijoueur), mini-carte, rivaux, caméras, `loadRecord`, **`restart()`**, HUD d'entraînement, Theater.

##### Machine à états (`this.state`)
```
countdown ──GO (1,65 s ; en multi : startLocal convenu)──► racing ──finish──► finished
    ▲                                                      │  ▲
    └──────────── restart() (T / Entrée) ◄─────────────────┘  │
racing ⇄ paused (Échap / pause ; jamais en multijoueur ; aussi _autoPause : onglet masqué, portrait, contexte WebGL perdu)
demo, replay : démarrent directement en 'racing'
```
- `restart()` (`:151`) : `sim.start(spawn)` (grille de départ en championnat), nouvel `InputRecorder`, `tick = 0`, stats, particules, traces, HUD.
- `respawn(fromInput)` (`:215`) : `sim.rewind({ keepClock: multi })`, historique du fantôme enregistré tronqué, stats ramenées à l'instantané du checkpoint (`statsSnap`), voiture et caméra recalées (`_camCut`), en multijoueur compteur de téléportation et 2 s de protection.

##### Une image de course (`update`, `:461`)
1. Commandes de session : pause, recommencer, retour au checkpoint, caméra, klaxon.
2. Décompte (aucun pas de physique, son du moteur au point mort).
3. `acc += dt` puis `while (acc >= DT) { _stepOnce(); _cameraTick(); acc -= DT }` : **pas fixe**, la caméra avance au même pas.
4. `render(dt, acc / DT)` : interpolation `prev → pos` de la voiture, du fantôme et de la caméra.

##### Un pas (`_stepOnce`, `:287`) — voir aussi `02-simulation.md` § 2.2
`_input()` → `quantSteer` → `recorder.push` (seulement en `racing`, hors démo et replay) → `tick++` → collisions douces (championnat) → **`sim.drive`** → `_orient` (orientation visuelle lissée) → envoi réseau (multi) → contrôle du « mauvais sens » → **effets lus dans `phys.ev`** → **`sim.score()`** → échantillon du fantôme tous les `GHOST_EVERY` pas → `_event(res)` → réapparition automatique.

##### Évènement physique → effets (tous dans `_stepOnce`, `race.js:303-413`)

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

##### Rendu d'une image (`render`, `:541`)
Synchronisation de la logique du circuit (`_logicSync` : visibilité des groupes, effets), pièces mobiles et obstacles au chrono interpolé (`view.updateMoving(obsT)`), lampes, dalles brisées (`view.setBroken` quand `phys.brokenVer` change), voiture interpolée (`slerp` de `prevQuat → quat`), roues, roulis, flammes, traces de pneus, étincelles, traînée, sillage, fantômes (`_renderGhost`, `_renderSimGhosts`, `_renderRivals`), **caméra** (`_cameraRender`), mini-carte, voitures distantes, `scenery.update`, ressenti (`_feelUpdate` : aspiration, croisements, vibrations), scripts de circuit, **moteur et musique** (`audio.engine`, `music.setSpeed`), **HUD** (chrono, vitesse, lignes de vitesse).

#### 3.3 Fantômes, replay, Theater, analyse

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

#### 3.4 L'arrivée (`race/finish.js:66 _finish`)

Ordre vérifié, avec des **sorties anticipées** qui excluent des pans entiers :

1. `state = 'finished'`, moteur coupé.
2. Replay → message, fin. Académie → `app.onAcademyFinished`. Mode de jeu → `app.onModeFinished`. Championnat → temps envoyé au salon. Multijoueur libre → temps envoyé, « R : nouvel essai ». **Aucun de ces cas n'écrit de record ni ne touche au classement.**
3. Course classable : `lastRun = { inputs, time }` ; record si meilleur que l'ancien de même `PHYS_VER` (et pas un essai depuis le curseur) → **`saveRecord(trackKey, …)`** avec fantôme, commandes, `pv`, temps intermédiaires.
4. `pushRun` (10 dernières courses) pour les clés `b-`, `daily-`, `u-` hors éditeur.
5. Médaille (`medalFor`), série du défi du jour (`rewards.js : noteRace`), télémétrie, pièces (`profile.js : rewardCoins`), objectif bonus (`career.js : goalMet`, `completeGoal`), expérience et niveaux (`progression.js : awardRace`), récompenses (`app.checkRewards`).
6. Vérification depuis l'éditeur → `app.onEditorTestFinished` (`app/editorFlow.js:110` : `track.setVerified`, preuve `authorProof.saveProof`).
7. `ui.showFinish(...)`, coach (`app._finishCoach`).
8. **`app.onRaceFinished`** (`main.js:288`) : si clé `b-|daily-|u-`, record, envoi permis, pas d'éditeur ni de replay → `online.submitScore` (le serveur rejoue la course) ; au retour, `_ensureLocalRecord` et message. Le test `this.session !== session` après chaque `await` protège contre un changement d'écran pendant l'envoi.

#### 3.5 Quitter une course (`main.js:267 quitRace`)

Retour selon l'origine, dans cet ordre de priorité : salon multijoueur, Académie, modes, **éditeur** (`openEditor(this.editorState)`), fiche du circuit (`_backToHub` si `opts.fromHub` et même clé), liste des circuits (intégré ou défi), mes circuits, communauté, menu.

## Annexe 10 — Les systèmes, un par un

*Source : `docs/comprendre/04-systemes.md`*

### 4. Les systèmes, un par un

Chaque fiche dit : rôle, fichiers, points d'entrée, dépendances, données, déclencheurs, et ce qu'une modification risque de toucher.
Le noyau de simulation et la course en direct ont leurs propres documents (`02-simulation.md`, `03-course.md`).
Marques : **[V]** vérifié dans le code, **[D]** déduction raisonnable, **[?]** incertain.

---

#### 4.1 Application, écrans et navigation

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

#### 4.2 Entrées (`js/input.js`, `js/app/wiring.js`, `js/aids.js`)

**Rôle.** Clavier (codes physiques `e.code`, donc QWERTY et AZERTY), manette, tactile, vers deux API : `hit(code)` / `act(action)` (appuyé **cette image**), `held`, et `drive()` (commandes de conduite).

- [V] `pressed` ne garde que les vrais appuis (pas la répétition) ; la saisie dans un `INPUT`, `TEXTAREA`, `SELECT` est ignorée (y compris curseurs et cases : un curseur de la pause qui a le focus fait ignorer Échap et P [D]).
- [V] `clearHits()` est appelé à **chaque image** dans le `finally` de la boucle (`main.js:478`) : une action non lue dans l'image est perdue.
- [V] Manette : `pollGamepad(mode)` (fronts par table `EDGE`), navigation spatiale des menus `_padNav` (`wiring.js:345-386`).
- [V] Tactile : les boutons retour / pause / recommencer **injectent** `KeyR`, `Escape`, `Enter` dans `pressed` (`wiring.js:289-291`) ; si le joueur réassigne ces actions à d'autres touches, `act()` ne les reconnaît plus [D].
- [V] Réassignation : `captureKey(cb)` ; une capture en attente survit à un changement d'écran.

**Chaîne des commandes en course** [V] (`race.js:274 _input`) : `input.drive()` → `steerCurve` (réponse du volant, `aids.js:35`) → `aids.apply` (aides : gaz auto, anti-tête-à-queue… ; seulement en `racing`) → `quantSteer` → **enregistrement**. Les commandes **effectives** sont enregistrées : le rejeu ne relance pas les aides. Une course aidée va dans la catégorie `~v1.as-1`, sans médailles ; les aides sont coupées en saison, duel, tournoi (`aidedKey` renvoie `null`).

**Impact.** Changer `drive()` ou `steerCurve` ne casse pas les replays (on enregistre la sortie) mais change le ressenti ; changer `quantSteer` ou le format `InputRecorder` casse **tous** les replays, fantômes et la vérification serveur.

---

#### 4.3 Audio (`js/audio.js`, `js/music.js`, `js/AudioEngine.js`)

- [V] `GameAudio` crée l'`AudioContext` au premier geste (`unlock`, écouteurs `pointerdown` / `keydown` jamais retirés, `main.js:104-106`) : sons synthétisés (moteur, glisse, vent, pluie, chocs…), aucun fichier audio.
- [V] `engine(state)` est appelé à chaque image de course **y compris la démo du menu** (`race.js:661`) ; coupé en pause, à l'arrivée, à la fermeture.
- [V] `Music` : `'menu'` (house) ou `'game'` (chill), fondu de 450 ms ; `AudioEngine` séquence par `setInterval` (25 ms) et écrit directement vers `ctx.destination` (le volume des effets ne touche pas la musique).
- [V] Onglet masqué : contexte suspendu (`main.js:150`). [D] Une reprise de la musique (minuterie) peut le réveiller dans un onglet masqué.
- Musique par écran : menu / éditeur → menu ; course → ambiance du circuit ou chill ; multijoueur et Académie → toujours chill (`main.js:212`).

---

#### 4.4 Langues (`js/i18n.js`, `js/i18n/boot.js`, `js/i18n/dom.js`, `js/i18n/en/*.js`)

- [V] Le **français est la source et la clé**. `initI18n()` tourne avant l'accueil (`main.js:504`) ; le dictionnaire anglais est chargé à la demande (`import('./en.js')`, assemblage de 10 fichiers ; à clé égale, le dernier gagne).
- [V] Entrées exactes + **modèles à trous** (`{x}`, `{x:t}`, `{x:w}`), triés par longueur ; `t()` ne fait que la recherche exacte.
- [V] En anglais, `DomTranslator` parcourt toute la page puis observe le document entier (`MutationObserver` : texte, `title`, `placeholder`, `aria-label`, `alt`) et réécrit ce que le jeu écrit en français.
- **Risques.** [V] Seul `#opt-lang` est marqué `data-i18n="off"` : [D] les contenus des joueurs (noms de circuits, pseudos, commentaires) passent aussi par le dictionnaire (un circuit nommé « Jouer » s'afficherait « Play ») ; un modèle trop général peut capturer un autre texte (raison pour laquelle `logicText.js` a sa propre table). Ajouter un texte français dans le code : ajouter sa traduction dans `js/i18n/en/<domaine>.js` (`tools/test-i18n.mjs`, `tools/i18n-scan.mjs`).

---

#### 4.5 Garage, cosmétiques, codes de partage (`js/garage.js`, `js/garage/studio.js`, `js/cosmetics.js`, `js/custom.js`, `js/customCar.js`, `js/mods.js`, `js/rules.js`)

- [V] **100 % visuel** : la physique ne lit jamais l'équipement (`cosmetics.js`, en-tête ; `tools/test-cosmetics-physics.mjs`).
- [V] Flux : `profile().loadout` → `createCar(loadout)` (`race.js:70`) ; la voix et le klaxon du joueur viennent aussi du profil. Le garage édite un brouillon (`GarageSession.draft`) et ne l'enregistre (`setLoadout`) que si tout est possédé.
- Codes : `SHC1:` voiture (`custom.js`), `SHX1:` paquet « mod » (voiture, interface, caméras, pièces déco, modes : `mods.js`), `SHM1:` mode de jeu (`rules.js`). [V] Deux politiques différentes pour les objets non possédés : l'atelier les garde en aperçu avec achat, le paquet les remplace par les valeurs d'origine.
- `rules.js` (modes, objectifs, descriptions) s'appuie sur `rulesCore.js` (noyau pur **dans la fermeture serveur**, car les catégories de record sont des règles).
- **Observations.** [V] La minuterie `_studioT` (`garage/studio.js:19`) n'est pas annulée par `GarageSession.dispose` (`garage.js:283`) : [D] quitter le garage dans les 120 ms qui suivent une modification peut reconstruire une voiture dans la scène suivante. [V] La règle de salon `sameCars` ne change que la voiture locale (`race.js:69`) ; les voitures distantes gardent l'apparence annoncée (`race/net.js:16`).

---

#### 4.6 Multijoueur en direct (`js/net/*.js`, `js/app/multi.js`, `js/race/net.js`, `js/remoteCar.js`, `supabase/MULTI.md`)

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

#### 4.7 Persistance locale et comptes (`js/storage.js`, `js/profile.js`, `js/account.js`, `js/cloudsave.js`, `js/welcome.js`)

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

#### 4.8 Services en ligne et serveur (`js/config.js`, `js/online.js`, `js/online/community.js`, `js/app/community.js`, `js/app/competition.js`, `js/ui/leaderboardPanel.js`, `supabase/`)

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

#### 4.9 Éditeur de circuits (`js/editor.js`, `js/editor/*.js`, `js/inspector.js`, `js/inspector/*.js`, `js/editorTools.js`, `js/editorPick.js`, `js/app/editorFlow.js`)

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

#### 4.10 Rendu, scène et caméra (`js/trackMesh.js`, `js/trackGeometry.js`, `js/geo.js`, `js/scenery.js`, `js/scenery/*`, `js/decos.js`, `js/carModel.js`, `js/quality.js`, `js/renderOptions.js`, `js/race/camera.js`, `js/camrig.js`, `js/camflip.js`, effets)

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

#### 4.11 Progression et contenus (`js/tracks.js`, `js/career.js`, `js/medals.js`, `js/profile.js`, `js/progression.js`, `js/rewards.js`, `js/app/rewards.js`, `js/daily.js`, `js/mutations.js`, `js/seasons.js`, `js/academy.js`, `js/skills.js`, `js/rules.js`, `js/app/modes.js`)

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

## Annexe 11 — Interactions entre systèmes, zones sensibles, conséquences d'une modification

*Source : `docs/comprendre/05-interactions-et-zones-sensibles.md`*

### 5. Interactions entre systèmes, zones sensibles, conséquences d'une modification

Marques : **[V]** vérifié dans le code, **[D]** déduction raisonnable, **[?]** incertain.

#### 5.1 Carte des dépendances

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

#### 5.2 Parcours transverses (vérifiés)

##### Chargement d'un circuit : qui s'initialise, dans quel ordre
`launchDesc` → `playTrack` (`main.js:201`) : `track.validate` → `_dispose()` (ancienne session) → `mode = 'race'`, `ui.setMode('race')` → `new RaceSession` (`race.js:42`) : aides → **`TrackView`** (tous les tronçons construits d'un coup) → **`scenery.setTrack`** (terrain, décor, ambiance) → **`Simulation`** (`CarPhysics` : `paramsOf`, `envOf`, `specsOf`, `v2Of`, `setBounds`, `place` ; `RaceLogic` ; logique) → `EnvFx` → voiture, traces, fantômes, mini-carte, caméras → `loadRecord` → **`restart()`** (`sim.start`, enregistreur, HUD) → HUD d'entraînement, Theater → puis la musique (`main.js:212`).
Les caches du circuit (`obstacleGrid`, `solidIndex`, `hasMovers`) sont construits à la première requête, par version du circuit.

##### Retour au checkpoint (touche R, hors-piste, noyade, piques, état incohérent)
1. Déclencheur : `input.act('respawn')` (`race.js:478`) → `respawn(true)` ; ou automatique après `sim.score()` (`race.js:426-429`) ; en replay, drapeau `respawn` de la commande (`race.js:276`).
2. `sim.rewind({ keepClock: multi })` → `RaceLogic.rewind` (chrono, temps intermédiaires, checkpoints, tour, **état de la logique** revenus à l'instantané) → `placeAtRespawn` → `phys.place` (vitesse nulle, **verre restauré**, `graceT` 1,5 s, `hazardGrace` 0,8 s, ruban quitté, plaques réarmées), puis véhicule, gravité et sens de gravité du point de retour, `glassSafe`.
3. **Le chrono revient** (sauf multijoueur) : `phys.clock = logic.steps` au pas suivant → **pièces mobiles et obstacles reviennent à leur position de ce moment-là**.
4. `RaceSession` : fantôme enregistré tronqué, statistiques ramenées à l'instantané du checkpoint (les réceptions parfaites d'après ne comptent plus pour l'objectif bonus), aides réinitialisées, HUD, orientation et caméra recalées (`_camCut`), traînée et particules effacées ; en multijoueur, compteur de téléportation + 2 s sans collision + envoi immédiat.
5. Fantômes simulés : rien n'est rejoué, on relit leur historique à l'ancien chrono.

##### Inversion de gravité
Plaque `flip` touchée → `_setGround` inverse `gSign` (`physics.js:199`) → `_roadContact` projette la voiture vers le nouveau « bas » (`flipKick`) ; ou ruban qui retourne la voiture (`ribbon.js:257`). Ensuite : sol cherché par `ceilingSurfaceAt` (pièces à l'envers seulement) ; volant inversé par rapport au monde (`_upSign`) ; voiture perdue au-dessus de `skyY` ; `ev.flip` → message et secousse (`race.js:412`) ; caméra : roulis animé `CamFlip` ; orientation visuelle (`_orient`) ; le point de retour du checkpoint suivant garde le sens (`respawnGs`).

##### Checkpoint
`RaceLogic.update` → nouveau point de retour + instantané → évènement `checkpoint` → `Simulation.score` : règles de la logique sur l'évènement `cp`, puis instantané de la logique **après** elles (`simulation.js:84`) → `RaceSession._event` (`race/finish.js:16`) : instantané des statistiques, écart avec le record (`record.splits`), HUD, son, particules.

##### Collisions et mouvement
Bordures, solides, plaques à bordure et parois de rubans passent par **une seule règle** (`physics/contact.js`) : choc inélastique, frottement de Coulomb proportionnel à la vitesse d'approche. Effets secondaires : `ev.wall` → le pas suivant, `_driftState` casse la glisse et **annule le mini-turbo en charge** (`wallT`) ; `stunT` (encaissement) réduit adhérence et traction ; voiture plaquée à l'arrêt → `unstick` la fait pivoter. Un obstacle qui pousse la voiture déclenche une **seconde passe** des bordures (`physics.js:634`).

##### Obstacles mobiles et moteur physique
Position = fonction du chrono seul (`obstacleLocal(d, phys.clock × DT)`), donc identique au rejeu et au serveur ; le rendu les place au chrono interpolé (`race.js:546`, à un pas près) ; après l'arrivée, l'horloge continue (`Simulation.idle`) ; au retour au checkpoint, elle recule (voir plus haut). Une voiture sur un ruban subit aussi les obstacles (`ribbon.js : _ribObstacles`).

##### Changement d'état → contrôles et animations
- Plaque de transformation → `phys.vehicle` → **`this.k`** (réglages du véhicule) change au pas suivant ; `ev.transform` → `car.setVehicle(veh)` (animation), son, message ; le fantôme enregistré mémorise le changement (`ghostVeh`).
- Arrivée → `_input` renvoie « frein » (`race.js:281`), moteur coupé, plus d'enregistrement, la physique continue.
- Pause → aucun pas, moteur coupé, rendu figé (particules, traces, flammes) ; le shader de l'eau tourne encore (horloge murale).
- Démo du menu → mêmes boucles qu'une course, pilotées par `Autopilot`, sans HUD ni messages.

##### Essai depuis l'éditeur, vérification, publication
Voir `04-systemes.md` § 4.9 : état mis de côté → circuit re-décodé → course (`e-<hash>`) → `onEditorTestFinished` → `setVerified` + preuve → publication (le serveur rejoue la preuve) → retour à l'éditeur (`quitRace` → `openEditor`).

##### Envoi d'un temps
Voir `03-course.md` § 3.4 et `04-systemes.md` § 4.8.

#### 5.3 Ce qui tourne alors qu'on pourrait le croire arrêté

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

#### 5.4 Zones sensibles (par ordre de risque)

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

#### 5.5 Si tu modifies… regarde aussi

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

#### 5.6 Défauts et fragilités constatés (aucun n'a été corrigé)

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

#### 5.7 Écarts entre la documentation existante et le code

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
