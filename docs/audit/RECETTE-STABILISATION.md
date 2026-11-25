# Recette de stabilisation (phase 21, seconde passe sur la 0.16.19)

Date : 2026-11-25. Code recetté : `main` au commit `9dddf69` (branche de travail `claude/friendly-feynman-55abp4`, identique), **version 0.16.19**, `PHYS_VER` 39, `NET_VER` 5. **Aucun fichier du jeu n'est modifié** (`git status` : seulement `tools/recette/` et ce rapport). La version n'est pas changée.

Une première passe (même phase, sur la 0.16.18, base `1b4614e`) existait déjà dans ce fichier. Le code a changé depuis (fusions de `main`, correctifs « petits défauts visibles », documentation) : **tout a été refait sur le code actuel**, les scripts de `tools/recette/` ont été rejoués et complétés. Les identifiants **REC-001 à REC-014 sont ceux de la première passe**, avec leur état aujourd'hui ; REC-015 à REC-018 sont nouveaux.

Référence : `docs/audit/AUDIT_COMPLET.md`, annexe 1 et annexe 4 §4.3 (« parcours d'interface à refaire en priorité »), §4.4 (scénarios 1, 4, 5).

Trois mots, partout dans ce document :

- **constaté** : observé dans cette recette, avec reproduction ou capture décrite ;
- **non testé** : possible, mais pas fait ici (la raison est dite) ;
- **impossible ici** : demande du matériel ou un service que ce conteneur n'a pas (vraie manette, vrai téléphone, son, ressenti de conduite, Supabase réel, Realtime, vrai réseau WebRTC).

## 0. Verdict

1. **La stabilisation n'est pas tout à fait terminée : un échec de `npm test` est reproduit deux fois (REC-015, P2) et une régression d'éditeur subsiste (REC-001, P2).** Tout le reste passe : lint, `test:browser` (10 scripts, 176 vérifications), Deno, PostgreSQL (21 étapes), empreinte de la physique ; courses en direct = rejeu du serveur au bit près sur trois circuits ; 12 circuits × 2 courses et 10 minutes de course sans erreur ni fuite mesurée. **Aucun P1.**
2. **Ce qui reste** : (a) `sw.js` n'est plus à jour depuis les fusions de `main` (le test `check-generated` échoue, la CI aussi, et le nom du cache hors ligne ne change pas avec le contenu) ; (b) « Rétablir » de l'éditeur saute à un état faux après un essai ou une vérification (REC-001, inchangé) ; (c) 16 constats P3 : interface sur téléphone en paysage, textes français restants en anglais, Échap sans effet dans deux fenêtres à champ de texte, réglages écrasés entre deux onglets.
3. **Hors de portée d'un conteneur** : manette, vrai téléphone, son, ressenti, Supabase / Realtime réels, WebRTC entre machines (§6). Les 30 lignes de parcours ont été visitées dans les deux langues et les trois modes d'écran (clavier, téléphone paysage, téléphone portrait) sauf les exceptions notées « non testé » (§2).

### Régressions signalées en tête

| Constat | Phase probable | Preuve |
| --- | --- | --- |
| **REC-015** (P2) : `npm test` échoue : `check-generated.mjs` — « sw.js n'est pas à jour : lancer « npm run sw » » (cache `copytrack-04caf27146` au lieu de `copytrack-bc5c78478a`) | **fusions de `main` sans régénération** : `1d1884d` (« Merge branch 'main' into … phase-4-bugs ») puis `aa9f216` (« Merge branch 'main' into claude/magical-darwin-8jrpii ») ; les commits de version `6c866b9` et `9f766ac` sont à jour, leurs fusions non (sections « Preuve » de REC-015) | reproduit deux fois (`npm test` entier ×2, puis `check-generated` seul) ; régénération faite sur une copie hors dépôt |
| **REC-001** (P2) : « Rétablir » après un retour d'essai ou de vérification de l'éditeur redonne un état faux (1 pièce au lieu de 5) ; après un essai puis une vérification, l'historique est vide | **phase éditeur, 0.16.8** : `f8a93bb` (« états gardés au mauvais moment », TECH-054) a ajouté `js/editor.js` ligne 139 `this.history[this.hIndex] = this.history[0]` ; en 0.16.7 (conservation de l'historique, TECH-034) la ligne n'existait pas | reproduit à nouveau (français clavier, anglais clavier, anglais paysage) avec `tools/recette/rec001.mjs`, témoin sans essai correct |

Aucune autre régression par rapport à une phase n'a été constatée : les autres constats existent dans le code d'avant le chantier ou portent sur des cas que les phases n'ont pas traités.

## 1. Régression globale : les commandes

Machine : Linux, 4 cœurs, 16 Go ; Node 22.23.5 ; Chromium de Playwright 1.63.0 (WebGL logiciel SwiftShader) ; Deno 2.9.6 (`npx`) ; PostgreSQL 16.15 jetable monté selon `docs/TESTS.md` (« PostgreSQL jetable »).

| Commande | Résultat réel | Durée | Référence du début du chantier |
| --- | --- | --- | --- |
| `npm run lint` | 0 erreur (ESLint 10.1.0, `tools/recette/` compris, vérifié après l'ajout de mes scripts) | 8,4 s | — |
| `npm test` | **141 fichiers, 2 167 vérifications réussies, 1 échec** : `check-generated.mjs` (REC-015). Relancé : **même résultat** (141 fichiers, 2 167, 1 échec, `check-generated.mjs`) | 142,0 s puis 143,0 s | 124 fichiers, 1 776 vérifications, 0 échec → **+17 fichiers, +391 vérifications**, mais **1 échec nouveau** |
| `npm run test:browser` (10 scripts) | **tout vert : 176 vérifications, 0 échec** | 1 003 s cumulés | 57 tests, 0 échec (le seul `test-browser.mjs` en compte maintenant 75) |
| `npm run test:deno` | `dmath` et empreinte de la physique sous Deno : 0 échec | 12 s | — |
| `npm run test:sql` | **exit 0**, 451 lignes `ok`, étapes 1 à 21, concurrence réelle, sur PostgreSQL 16.15 | 39 s | — |
| `node tools/phys-fingerprint.mjs` | identique : `PHYS_VER` 39, **206 scénarios** | 10 s | — |
| `node tools/test-browser-moteurs.mjs` (Chromium seulement ; hors `npm run test:browser`) | 12 étapes ok, aucune erreur JavaScript | 23 s | — |
| `node tools/check-deployed.mjs` (production) | **impossible ici** (aucun accès à la production) | — | — |

Détail de `test:browser`, dans l'ordre du `package.json` : `test-browser` 75 ok (558 s) · `test-browser-i18n` 9 (46 s) · `test-browser-audit` 8 (71 s) · `test-browser-camera` 6 (31 s) · `test-browser-editeur` 23 (111 s) · `test-browser-boot` 5 (7 s) · `test-live-replay` 9 (16 s) · `test-browser-entrees` 13 (65 s) · `test-browser-recuperation` 9 (28 s) · `test-browser-defauts-visibles` 19 (70 s, nouveau depuis la première passe). Le décompte est celui des lignes « ok » de chaque script.

Aucun test instable : le seul échec (`check-generated`) est déterministe. Les autres commandes n'ont tourné qu'une fois, sans échec à départager.

Écarts de documentation : `docs/TESTS.md` dit maintenant « 136 fichiers + 5 contrôles » et « 206 scénarios » : conforme aux commandes (c'était REC-014, volet documentation : **corrigé**).

## 2. Parcours d'interface

### 2.1 Méthode

Scripts : `tools/recette/` (voir son `README.md`). Une exécution par configuration, profil neuf à chaque fois : **langue** français / anglais × **entrée** clavier + souris (1280×720), téléphone simulé en **paysage** (844×390, écran et événements tactiles) et en **portrait** (390×844). Six configurations × trois scripts de parcours (nouveau joueur 893 étapes, joueur installé 204, éditeur novice 174) = **1 271 étapes**, chacune suivie d'un audit dans la page (bouton dont le centre est recouvert, bouton hors écran même après défilement, `NaN` / `undefined` / `[object` dans le texte, texte français en anglais, page qui défile en largeur) et d'une capture à `deviceScaleFactor` 1. Les clics sont de vrais clics souris ou de vrais touchers au centre du bouton, **après vérification que le point visé lui appartient**. S'y ajoutent des scripts de sonde ponctuels (`rec001.mjs`, `defilement.mjs`, `academie.mjs`) et les variantes tactiles de `horsligne.mjs` et `salons.mjs`.

Limites de la méthode, dites une fois : (a) tenir une pédale au toucher n'est pas simulable : les boutons ▲ / ▼ sont pilotés par événements `pointerdown` / `pointerup` ; (b) l'arrivée d'une course est obtenue par le **pilote automatique** (le vrai écran d'arrivée s'affiche ensuite par la vraie boucle) ; (c) rendu logiciel : en tactile, qualité `ultrapotato` ; (d) **1 142 captures prises, 16 regardées une à une** (listées en §2.4) ; les autres n'ont été jugées que par l'audit automatique, qui ne voit pas un texte coupé ou un chevauchement partiel : ce qui n'a pas été regardé n'est pas affirmé ; (e) l'audit « non traduit » a un angle mort (un mot isolé, une phrase mêlant les deux langues) et peut signaler un contenu de joueur ; chaque constat ci-dessous a été confirmé par un texte lu dans la page ou une capture ; (f) deux parcours ont tourné en parallèle sur 4 cœurs : les durées ne sont pas des mesures de performance.

Accident de mon lanceur (pas du jeu) : le parcours « nouveau joueur, français, portrait » a été marqué `rc=127` parce que j'avais modifié le script lanceur pendant son exécution ; son rapport (149 étapes) est complet. Le premier passage de l'éditeur en anglais sur téléphone paysage s'est interrompu sur une course contre l'animation du tiroir (script) ; il a été corrigé dans `editeur.mjs` et rejoué proprement (9 pièces, 29 étapes).

Aucune erreur console du jeu pendant tous les parcours (hors erreurs réseau attendues vers Supabase et les polices, filtrées comme le fait `tools/test-browser.mjs`, hors les deux exceptions que le parcours 2 injecte volontairement dans la boucle de course, et hors l'erreur « WebGL 2 » du scénario volontaire sans WebGL).

### 2.2 Tableau écran par écran

✔ vu sans défaut · ⚠ défaut (REC-nnn) · ○ non testé. Colonnes : FR / EN × clavier (K), téléphone paysage (P), téléphone portrait (V).

| Écran ou fonction | FR K | EN K | FR P | EN P | FR V | EN V |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Accueil : invité, Connexion, Créer un compte, messages d'erreur hors ligne, bascule de langue | ✔ | ✔ | ⚠ 002 | ⚠ 002 | ✔ | ✔ |
| 2. Tutoriel (3 pages, Précédent / Suivant / Passer) | ✔ | ✔ | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 3. Première course guidée (leçon 1 : consignes, roulage, pause, quitter) | ⚠ 014 | ⚠ 014 | ⚠ 017 | ⚠ 017 | ✔ (après rotation, 012) | ✔ (idem) |
| 4. Menu principal, 6 panneaux, 28 entrées, chaque « ← Retour » | ⚠ 006 | ⚠ 006, 008 | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 5. Carrière : 72 cartes, défilement jusqu'au dernier chapitre | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 6. Fiche de circuit : carte, zoom, favori, onglets, Jouer | ✔ | ⚠ 007, 010 | ⚠ 003 | ⚠ 003, 007, 010 | ✔ | ⚠ 007, 010 |
| 7. Défi du jour : fiche, course | ✔ | ⚠ 007, 008, 010 | ⚠ 003 | ⚠ 003, 007, 008, 010 | ✔ | ⚠ 007, 008, 010 |
| 8. Modes (menu, fiche d'un mode) | ✔ | ⚠ 008 | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 9. Académie : menu, 6 leçons et 4 exercices évalués jusqu'au bilan (§2.3) | ✔ | ✔ | ✔ | ✔ | ✔ (menu) | ✔ (menu) |
| 10. Course : décompte, HUD, boutons tactiles, mini-carte | ✔ | ✔ | ✔ | ✔ | ✔ (012) | ✔ (012) |
| 11. Pause : Reprendre, Retour au checkpoint, Recommencer, Caméra, Commandes, curseurs, Quitter ; au clavier Échap, R, Entrée | ✔ | ⚠ 008 | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 12. Arrivée : Rejouer, Classement, Partager mon fantôme, Revoir la course, Fiche du circuit | ⚠ 014 | ⚠ 007, 014 | ⚠ 005, 014 | ⚠ 005, 007, 014 | ⚠ 005 | ⚠ 005, 007 |
| 13. Replay (barre, pause, quitter) | ✔ | ✔ | ⚠ 004 | ⚠ 004 | ⚠ 004 | ⚠ 004 |
| 14. Replay Theater (record comparé, panneau, quitter) | ⚠ 014 | ⚠ 014 | ⚠ 004 | ⚠ 004 | ⚠ 004 | ⚠ 004 |
| 15. Garage : 4 familles, 14 onglets, choix d'un élément, moto | ✔ | ⚠ 008 | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 16. Profil : Compte, Amis, Sauvegardes (invité) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 17. Progression : Records, Niveau, Statistiques, Déblocages | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 18. Réglages : 6 onglets | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 19. Commandes : réassigner « accélérer » à I, courir, rétablir | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 20. Créer : Mes circuits, Importer un code, Wiki (lien) | ⚠ 006 | ⚠ 006 | ✔ | ✔ | ✔ | ✔ |
| 21. Éditeur en joueur novice (poser, tester, vérifier, quitter, revenir, annuler, enregistrer) | ⚠ 001 | ⚠ 001, 009 | ⚠ 001, 018 | ⚠ 001, 009, 018 | ⚠ 012, 001 | ⚠ 012, 001, 009 |
| 22. Communauté : réseau coupé, puis serveur simulé (liste, cartes, fiche) | ✔ | ⚠ 007, 008 | ⚠ 003 | ⚠ 003, 007, 008 | ✔ | ⚠ 007, 008 |
| 23. Multijoueur : menu des salons (fenêtre) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 23 bis. Salons à deux onglets : créer, rejoindre par lien, prêt, course commune, un joueur part (§2.3) | ✔ | ⚠ 008 | ✔ | ⚠ 008 | ○ | ○ |
| 24. Compétition (ouverture) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 25. Confidentialité, Crédits, Mentions, Donner mon avis (ouverture, fermeture) | ✔ (013) | ✔ | ✔ (013) | ✔ | ✔ (013) | ✔ |
| 26. Écrans d'erreur et hors ligne (§2.3) | ✔ | ⚠ 007 | ✔ | ⚠ 007 | ✔ (012) | ⚠ 007, 012 |
| 27. Changement de langue en cours de route (menus, garage, course, pause, arrivée, éditeur, aller et retour) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 28. Erreur de course : exception unique, puis exceptions répétées | ✔ | ⚠ 007 | ✔ | ⚠ 007 | ✔ | ⚠ 007 |
| 29. États de synchronisation du compte (invité seulement ; Node : §4, D4) | ✔ (invité) | ✔ (invité) | ○ | ○ | ○ | ○ |

« ⚠ 006 » (lignes 4 et 20) ne concerne que le clavier : sur téléphone il n'y a pas de touche Échap (le parcours en a tapé une et a refermé la fenêtre par son bouton). Ligne 11, EN : la fenêtre « Commandes » de la pause dit « Échap / P » (008). Ligne 26, V : la course ne passe pas à « en course » en portrait (elle démarre en pause sous l'invite de rotation, 012) : ce n'est pas un défaut du hors ligne. « Tous les boutons répondent » : chaque entrée de menu, chaque onglet, chaque bouton de la pause, de l'arrivée, du garage (4 familles, 14 onglets), de l'Académie et de l'éditeur a été activé par un clic ou un toucher réel et a ouvert ce qu'il annonce. **Non manipulés un par un** : les cases à cocher et curseurs des réglages (hors langue, commandes et curseurs de la pause), les boutons d'export et d'import de la fenêtre Sauvegardes, les achats du garage (le joueur neuf a 0 ◆).

### 2.3 Fonctions des phases récentes et écrans particuliers

- **Éditeur novice, ce qui a été observé de bout en bout** (clavier FR, EN, paysage, portrait après rotation ; `editeur.mjs`) : le mode guidé n'offre que Ligne droite, Virage, Départ, Arrivée ; Départ posé d'un clic ; « Prolonger » raccorde les pièces ; l'indicateur de problèmes (⚠ n) disparaît quand le circuit est complet ; ↶ ×2 / ↷ ×2 corrects avant tout essai (9 → 7 → 9 pièces) ; « Tester » lance la course, « Quitter » rend le même circuit ; « Vérifier et publier » fait courir (8,7 s), la fenêtre « Circuit vérifié ✔ » propose Publier / Retour à l'éditeur / Refaire un meilleur temps ; « Publier » sans réseau ouvre le formulaire de publication ; « Fichier › Nouveau circuit » demande confirmation ; Fichier › Enregistrer : « Mes circuits » le liste et « Éditer » le rouvre avec le même nombre de pièces, vérifié ; sur téléphone la bibliothèque est un tiroir qu'on ouvre par l'outil « Pistes » (et qui se referme après chaque choix : REC-018) ; défaut : REC-001.
- **Arbitre d'entrées** (0.16.1) : `test-browser-entrees` passe (13). Dans les parcours : Échap, R, Entrée à la pause et à l'arrivée sans double déclenchement ; la touche réassignée (I) est la seule à accélérer, la course l'utilise (vitesse 33,1 m/s mesurée) ; « Rétablir par défaut » rend la touche d'origine. Un cas non traité : REC-006.
- **Erreurs de course** (0.16.2) : une exception unique dans la boucle de course → « Incident : retour au dernier checkpoint. », la course continue (état `racing`) ; des exceptions répétées → « Une erreur est survenue : la course a été interrompue. », retour au menu, plus de session de course. Constaté sur les six configurations ; les deux messages restent en français en anglais (REC-007).
- **Hors ligne, vrai service worker** (`horsligne.mjs`, FR et EN, clavier, paysage et portrait) : première visite, 241 entrées en cache ; réseau coupé, rechargement : la page d'accueil s'affiche, le menu s'atteint, **une course démarre** (en portrait elle démarre en pause : 012), la communauté et le classement d'une fiche affichent « indisponible » avec un texte clair (en anglais : REC-007). Navigateur sans WebGL 2 : message traduit, sans pseudo demandé. Module du jeu injoignable : « Le jeu n'a pas pu démarrer : une mise à jour est peut-être en cours… Réessayer » (traduit). Réseau coupé en cours de jeu : communauté et salons ouverts sans erreur.
- **Salons à deux onglets** (`salons.mjs`, signalisation locale `?net=local`, vrai WebRTC sur la machine, clavier et téléphone paysage) : créer la salle, l'invitée rejoint par le lien, liaison ouverte dans les deux sens, cartes, « Prêt », choix du circuit, course à départ commun (voiture distante vue, opaque), une joueuse ferme son onglet en pleine course : l'autre continue ; « Quitter » ramène au salon. Aucune erreur console. En anglais : « (toi) », « ● connecté · 2 ms », « Manche 1/1 · Premiers Éclats » restent en français (008). **Non concluant** : la mesure « premier Lancer sans circuit choisi » a lu un élément qui n'est pas celui du message (`.mp-err` vide) ; le texte réellement affiché n'a pas été vu. **Impossible ici** : Supabase Realtime réel, latence, coupures Wi-Fi.
- **Académie** (`academie.mjs`, FR et EN, clavier et paysage ; profil neuf, leçons non verrouillées) : les 6 leçons et les 4 exercices évalués démarrent, vont à l'arrivée et ouvrent leur bilan sans erreur console ni texte brut ; en anglais, tous les textes sont traduits (« ✓ Lesson passed », « Not quite… », « 🥇 Grade: gold », « Weak spot: Brake late »). Le pilote automatique réussit les leçons 1, 4, 5, 6 et les exercices 1, 2, 4 (or) ; il échoue les leçons 2 et 3 (« Pas tout à fait… ») et n'a pas de note à l'exercice 3 : ces deux leçons et cet exercice demandent un geste que le pilote ne fait pas (mini-turbo) — **non testé** : leur réussite par un humain.
- **États de synchronisation** : l'onglet Compte d'un invité dit « Mode invité · Progression locale. Un compte la suit partout. » Les états réels (« ok », « erreur », « copie allégée ») n'ont été vus que côté Node (§4, D4) ; création de compte réussie, synchronisation : **non testé** dans les parcours (couvert par `test-browser-recuperation`, vert).

### 2.4 Captures regardées une à une

Clavier FR : accueil, menu, leçon 1 au départ, pause, arrivée (premier temps), Theater, garage (Voiture). Clavier EN : panneau Jouer (tuile « Défi du jour · nouveau »). Téléphone paysage FR : accueil (onglet Connexion), fiche (carte et barre Jouer), leçon 1 au départ, arrivée, replay, éditeur (Tout afficher). Téléphone paysage EN : éditeur (premier passage, tiroir fermé). Portrait FR : éditeur sous l'invite de rotation. Les mesures de bannière, de défilement et de tiroir (REC-002, 003, 005, 017, 018) sont des mesures en page, pas des captures.

Description de ce qui a été vu : l'accueil est une carte centrée (« Qui joue ? », trois onglets, champ Pseudo, bouton « Jouer en invité », liens légaux) ; le menu a six tuiles inclinées et le pied de page « Trackigami bêta 0.16.19 » ; la pause est une carte avec trois gros boutons, une rangée Caméra / Commandes, quatre curseurs et Quitter ; l'arrivée montre le médaillon, le temps 00:48.225, « +60 ◆ pièces », l'expérience, « Médaille obtenue : Argent », l'objectif bonus, la ligne de classement en rouge (« Serveur injoignable (connexion internet ?). »), les conseils, trois boutons visibles et un toast « Niveau 2 ! » posé sur le bouton « Voir ces passages dans le Replay Theater » ; le Theater est une barre de temps (« Mon record 48.225 », ❚❚, −, ×1, +, Proche, Analyse, Quitter) sous le bandeau haut qui dit pourtant « Pas encore de record » ; le garage est un panneau à droite avec quatre familles (Voiture, Peinture, Effets, Mes créations), des sous-onglets et une grille d'objets avec leur prix.

## 3. Sessions longues

Script `longue.mjs` (Chromium avec `--expose-gc` et mémoire précise ; mesures : enfants de la scène, objets de la scène, nœuds du DOM, géométries, programmes, tas JavaScript après ramassage forcé).

**12 circuits × 2 courses** (Premiers Éclats, Lianes Néon, Lagon Turquoise, Néons Express, Aurore Naissante, Braises, Quai d'Amarrage, Courant Chaud, Chaîne de Montage, Premier Envol, Galerie de Cristal, Garde-Fous ; « Rejouer » pour la seconde, puis retour au menu une fois sur deux et au garage l'autre fois) : **les 24 courses vont à l'arrivée** (les deux temps d'un même circuit sont voisins : 48,42 / 48,47 s, 48,97 / 48,92 s, 56,98 / 57,02 s, 35,67 / 35,52 s…), **aucune erreur console**.

| | départ (menu) | fin (menu) | plage sur les 12 circuits |
| --- | --- | --- | --- |
| enfants de la scène | 11 | 11 | — (mesure faite au menu) |
| objets de la scène | 249 | 246 | 342 à 361 en fin de circuit |
| nœuds du DOM | 926 | 2 341 | 2 276 à 2 351 après la première arrivée |
| géométries de three.js | 49 | 30 | 28 à 39 |
| programmes | 6 | 10 | — |
| tas JavaScript | 18,3 Mo | 24,3 Mo | 21,9 à 31,3 Mo |

Le DOM passe de 926 à ~2 300 nœuds à la première arrivée (écrans de l'arrivée et du garage construits une fois) puis **reste stable** (± 40), le tas oscille sans tendance, la scène retrouve ses 11 enfants. Pas de fuite visible sur cette mesure (la mémoire réelle d'un téléphone est **impossible ici**).

**Course de 10 minutes, page visible, voiture tenue à fond** (`longue.mjs masque`, relevés toutes les 2 min) : état « racing » à chaque relevé, aucune erreur ; avant / après : enfants de la scène 12 → 12, objets 346 → 346, DOM 935 → 935, programmes 8 → 8, géométries 55 → 72 (la course gelée de la mesure suivante part déjà de 72 : la valeur se stabilise ; pas d'échantillonnage intermédiaire des géométries cette fois), tas 27,3 → 22,1 Mo. La reprise après la mesure se fait normalement (état « racing », vitesse 44,6 m/s).

**Onglet masqué, 10 minutes** : Chromium sans écran ne masque jamais une page (`document.visibilityState` reste « visible » même après `bringToFront` d'une seconde page : le script l'a constaté). Ce qui a été fait à la place (`longue.mjs gele`) : course en cours, `visibilityState` forcé à « hidden » avec l'événement `visibilitychange` (ce que le jeu écoute), puis **page gelée par le navigateur** pendant 10 minutes (10,1 min mesurées), dégel, retour à « visible ». Constaté : la course passe en pause dès l'événement (fenêtre de pause affichée) ; après 10 minutes, même état (« paused »), même chrono (2,675 s → 2,725 s), même DOM (935), mêmes objets de scène (346), mêmes géométries (72) ; « Reprendre » relance normalement (état « racing », 749 pas, 6,24 s). Aucune erreur. **Non testé / impossible ici** : téléphone verrouillé, onglet masqué par le système, contexte WebGL perdu par un vrai pilote (le cas est couvert par `test-browser-moteurs`, vert).

## 4. Interactions entre les corrections

**D1. Course en direct avec retours au checkpoint, puis chemin du serveur** (`interactions.mjs d1`, session « tenue » comme `tools/test-live-replay.mjs`, pilote automatique bruité à graine fixe, **vraie touche R**, puis `replayRun`, `GhostRunner` pas à pas et `verifyRun` dans Node, un autre moteur que la page) : **constaté** sur trois circuits, tous identiques au bit près (écart de position 0 m à chaque pas) et acceptés par `verifyRun` :

| Circuit | Graine | Pas | Temps | Retours par R (pas) | Rejeu | `verifyRun` |
| --- | --- | --- | --- | --- | --- | --- |
| Premiers Éclats (circuit du test de la phase 1) | 11 | 7 407 | 58,125 s | 3 (0, 1 334, 4 428) | identique | accepté |
| Hyperboucle | 11 | 7 701 | 60,625 s | 2 (0, 3 222 ; le plan en prévoyait 3, le troisième palier n'a pas été atteint) | identique | accepté |
| Récif | 11 | 8 696 | 68,867 s | 3 (0, 5 356, 5 808) | identique | accepté |

(`test-live-replay` dans `test:browser` : 9 vérifications vertes, dont les retours automatiques et l'exception injectée.)

**D2. Circuit publié → modifié → vérifié** (`interactions.mjs d2`, éditeur aux vrais boutons ; seul le serveur de publication est simulé) : **constaté, conforme**. Circuit de 10 pièces : course de vérification (9,475 s), fenêtre « Circuit vérifié ✔ », « Publier » : le serveur simulé reçoit un circuit vérifié avec preuve et signature `1es0vc2`. Retour à l'éditeur, gomme sur l'arrivée : 9 pièces, **plus vérifié**, signature `1bwl1lw` ; « Partager » dit « ⚠ Non vérifié : … Ce circuit avait été vérifié, mais il a changé depuis… une course de vérification suffit » ; `publishTrack` est refusé (message « Vérifie d'abord ton circuit… », rien envoyé en plus) ; l'arrivée reposée, nouvelle vérification (9,35 s), nouvelle publication acceptée avec la même signature (`1es0vc2`) : normal, c'est le même circuit. Le même parcours par un novice (§2.2, ligne 21) : le circuit enregistré se rouvre avec ses pièces et reste « vérifié » ; après un essai puis une vérification, l'annulation ne fait rien (REC-001).

**D3. Deux onglets qui modifient le profil** (`interactions.mjs d3`, deux pages d'un même navigateur, même pseudo invité) :

| | Constat |
| --- | --- |
| pièces : A +100, B +30 sans rechargement (départ 197 ◆) | **327 ◆** dans les deux onglets, puis après rechargement (aucune perte) |
| favoris posés dans chaque onglet (API `toggleFavorite`) | les deux présents après rechargement |
| records de deux circuits différents, un par onglet | les deux présents (33,3 s et 44,4 s) |
| **réglages** : A change le champ de vision, B change `volume` (sans attendre, puis 2 s plus tard) | **REC-011** : seul le réglage du dernier onglet à enregistrer survit (champ de vision 0, volume 0,31 ; puis 0 et 0,22) |

**D4. Sauvegarde cloud simulée sous quota serré** (`quota.mjs`, faux Supabase en Node, temps virtuel ; un compte dont le cloud pèse 552 501 caractères : 120 records, 777 ◆) : sur des appareils limités à 2 000 000, 600 000, 300 000, 150 000, 60 000, 20 000, 5 000 et 1 000 caractères :
- la connexion aboutit toujours (« account »), aucune valeur écrite n'est du JSON tronqué, une requête de lecture et une d'écriture par synchronisation, aucune relance, aucune minuterie en attente ;
- la progression affichée est 777 ◆ jusqu'à 5 000 caractères ; **à 1 000 caractères elle est 0 ◆ et 0 record local (REC-016)** ;
- sous 600 000 : note visible « Espace insuffisant sur cet appareil : copie du compte allégée (86 records sans fantôme ni commandes ; le cloud les garde en entier) » (à 150 000 et en dessous : 120 records) ; à 5 000 : « 103 records du compte n'y sont pas écrits (le cloud les garde en entier) » ;
- à 1 000 : statut « erreur » avec le message « … Libère de la place sur l'appareil, puis « Synchroniser maintenant » », **rien n'est envoyé** au cloud (il garde 777 ◆ et 120 records) ;
- une modification locale (+10 ◆) est envoyée au cloud tant que le profil tient (787 ◆, 121 records) ; sans exception de `saveProfile` / `saveRecord` ; **l'annonce visible faite au joueur** quand un nouveau record ne peut pas s'écrire n'a pas été observée (script Node, pas d'interface) ;
- un second appareil sans limite relit le cloud intact (777 ◆, 120 records).

## 5. Constats

Gravité : P1 bloquant ou perte de données ; P2 défaut réel d'une fonction centrale ; P3 gêne, finition, cas limite. Chaque constat est reproductible d'après sa fiche ; « K / P / V » = clavier / téléphone paysage / téléphone portrait. « État » : **inchangé** = présent déjà dans la première passe (0.16.18) et toujours là en 0.16.19 ; **nouveau** = absent du rapport précédent.

| Id | Gravité | Système | Constat | Audit | Phase probable | État |
| --- | --- | --- | --- | --- | --- | --- |
| REC-001 | **P2** | éditeur | Rétablir après un retour d'essai ou de vérification : état faux ; historique perdu après les deux | TECH-034, TECH-054 | **0.16.8 (éditeur)** — régression | inchangé |
| REC-015 | **P2** | fichiers générés, CI | `sw.js` périmé : `npm test` échoue (`check-generated`), le nom du cache hors ligne ne suit plus le contenu | — (DOC / chaîne de livraison) | **fusions de `main` `1d1884d` et `aa9f216`** (0.16.19) | nouveau |
| REC-002 | P3 | accueil | téléphone paysage : sélecteur de langue inaccessible (Connexion, Créer un compte) | — | antérieur au chantier | inchangé |
| REC-003 | P3 | fiche de circuit | téléphone paysage : classement, records et options sous la carte plein écran, défilement seulement par une marge de 17 px | — | 0.15.0, antérieur au chantier | inchangé |
| REC-004 | P3 | replay, Theater | commandes tactiles de conduite affichées sous le Theater, en partie recouvertes | TECH-068, TECH-069 (voisins) | antérieur au chantier | inchangé |
| REC-005 | P3 | arrivée | téléphone paysage : la carte déborde, second rang de boutons sous le pli, toast sur du texte | TECH-064 (voisin) | antérieur au chantier | inchangé |
| REC-006 | P3 | entrées | Échap ne ferme pas une fenêtre dont un champ de texte a le focus | TRANS-03, TECH-017 | arbitre d'entrées (0.16.1) n'a pas traité ce cas ; ligne antérieure au chantier | inchangé |
| REC-007 | P3 | i18n | anglais : messages d'erreur réseau et de course en français | TECH-071 (même famille) | antérieur au chantier | inchangé |
| REC-008 | P3 | i18n | anglais : libellés d'écran restés en français | TECH-071 (même famille) | antérieur au chantier | inchangé |
| REC-009 | P3 | i18n, éditeur | anglais : publication et messages de l'éditeur en français | — | antérieur au chantier | inchangé |
| REC-010 | P3 | i18n | anglais : date et décimale au format français | — | antérieur au chantier | inchangé |
| REC-011 | P3 | persistance | deux onglets : les réglages d'un onglet écrasent ceux de l'autre | TRANS-07, TECH-027 | 0.16.10 (fusion du profil, pas des réglages) | inchangé |
| REC-012 | P3 | interface mobile | portrait : l'invite de rotation recouvre l'éditeur et la pause ; une course démarre en pause et le reste après rotation | — | antérieur au chantier (peut être voulu) | inchangé |
| REC-013 | P3 | accessibilité | cibles tactiles de moins de 32 px, nombreuses | — | antérieur au chantier | inchangé |
| REC-014 | P3 | finition | petits chevauchements, un bandeau périmé, un conseil absurde (le volet « documentation » est **corrigé** : `docs/TESTS.md`) | — | antérieur au chantier | inchangé (sauf doc) |
| REC-016 | P3 | sauvegarde cloud | quota de 1 000 caractères : connexion réussie mais profil affiché vide (0 ◆, 0 record) ; **corrige une phrase du rapport précédent** | — | antérieur au chantier (même résultat sur le code de la première passe) | nouveau (constaté) |
| REC-017 | P3 | interface mobile | téléphone paysage : la bannière d'objectif d'une leçon est plus large que l'écran (coupée aux deux bords) | — | antérieur au chantier | nouveau |
| REC-018 | P3 | éditeur mobile | téléphone paysage : le tiroir « Pistes » se referme après chaque choix de pièce, « Prolonger » est dans le tiroir : il faut le rouvrir à chaque pièce | — | antérieur au chantier (peut être voulu) | nouveau |

### REC-015 (P2) — `sw.js` périmé : `npm test` échoue, le cache hors ligne ne change pas avec le contenu

- **Reproduction** : depuis la racine, `npm test` : `▶ check-generated.mjs (0.2 s, 0 ok, 1 échec(s))`, `FAIL sw.js n'est pas à jour : lancer « npm run sw »`, `141 fichiers, 2167 vérifications réussies, 1 échec(s)`. Relancé : même résultat ; `node tools/check-generated.mjs` seul : même sortie.
- **Mesure** : sur une copie du dépôt hors de l'arbre (rien n'est modifié ici), `node tools/gen-sw.mjs` ne change que la ligne 4 de `sw.js` : `const CACHE = 'copytrack-04caf27146'` devient `'copytrack-bc5c78478a'` (`index.html` est à jour).
- **Preuve de l'origine** (régénération sur des copies de chaque commit, `git archive`) : `6c866b9` à jour ; `1d1884d` périmé (`a787545737` au lieu de `d4494c9367`) ; `010bd34` périmé (idem) ; `9f766ac` à jour ; `aa9f216` et `9dddf69` (HEAD) périmés (`04caf27146` au lieu de `bc5c78478a`). Les commits qui régénèrent `sw.js` sont à jour ; **les deux fusions de `main` qui rapprochent les deux lignes ne l'ont pas régénéré**.
- **Conséquence (lue dans `tools/gen-sw.mjs`, non observée ici)** : le nom du cache (`CACHE`) est un condensé du contenu ; tant qu'il n'est pas recalculé, un joueur qui a déjà la copie hors ligne du jeu d'une version qui portait ce même nom ne la voit pas remplacée par les fichiers fusionnés (le navigateur ne voit aucun changement de `sw.js`). La CI (`npm test`) est rouge sur `main`. **Non vérifié ici** : quelle version a réellement été déployée sous le nom `copytrack-04caf27146`.

### REC-001 (P2) — Éditeur : « Rétablir » après un essai ou une vérification saute à un état faux ; l'historique disparaît après les deux

- **Reproduction** (script `tools/recette/rec001.mjs`, profil neuf, éditeur guidé, circuit de 5 pièces : Départ, trois Lignes droites, Arrivée) : ↶ ×3 puis ↷ ×3, nombre de pièces relevé après chaque appui.

| Scénario | ↶ ×3 | ↷ ×3 | Historique (entrées, pas courant) |
| --- | --- | --- | --- |
| T. témoin, sans essai | 4, 3, 2 | 3, 4, **5** | 6 entrées, pas 5 à la fin : correct |
| A. après « Tester » puis « Quitter » | 4, 3, 2 | 3, 4, **1** | 6 entrées, pas 5 à la fin, mais l'état affiché est celui du pas 0 |
| B. après « Vérifier et publier » puis « Retour à l'éditeur » | 4, 3, 2 | 3, 4, **1** | idem |
| C. après A puis B de suite | 5, 5, 5 (↶ sans effet) | 5, 5, 5 | **1 entrée, pas 0** : l'historique est vide |

- Identique en français clavier, anglais clavier, anglais téléphone paysage (trois exécutions). Rien n'est perdu sur disque ; c'est la pile « rétablir » qui est infidèle (le pas le plus récent de l'historique a été remplacé par l'état initial).
- Lieu probable : `js/editor.js` ligne 139, `if (kept) { this._restoreKeep(keep); this.history[this.hIndex] = this.history[0]; }`, écrit en 0.16.8 (commit `f8a93bb`). C'est ce que fait un novice qui « pose, teste, vérifie, revient, annule » : après les deux allers-retours, « annuler » laisse le circuit entier et « vérifié » (`editeur.mjs`, six configurations).
- Pourquoi les tests passent : `test-browser-editeur` (TECH-034) vérifie que l'historique, le presse-papiers et les calques reviennent ; il n'enchaîne pas « annuler plusieurs fois puis rétablir jusqu'au bout après un essai ».

### REC-002 (P3) — Accueil, téléphone paysage : le sélecteur de langue est inaccessible sur « Connexion » et « Créer un compte »

- **Reproduction** : contexte tactile 844×390, ouvrir le jeu, toucher « Créer un compte » (ou « Connexion »), script `defilement.mjs fr land`.
- **Mesure** : onglet Connexion : carte de 520 px pour 390 d'écran, haut de la carte à −65 px, boutons Français / English à y = −50 ; `scrollHeight` 471, et pousser vers le haut laisse `scrollTop` à 0 : **aucun défilement n'y mène**. Onglet Créer un compte : carte de 630 px, haut à −120 px, langue à −105 px, `scrollHeight` 526. L'onglet Invité tient (le sélecteur est visible, capture de l'accueil).
- **Capture vue** (Connexion) : « Qui joue ? » collé au bord supérieur, logo coupé, pas de sélecteur de langue ; le bas (« Se connecter ») est atteignable.

### REC-003 (P3) — Fiche de circuit, téléphone paysage : le classement est sous la carte et seule une marge de 17 px fait défiler

- **Reproduction** : 844×390 tactile, Jouer › Carrière › premier circuit (`defilement.mjs fr land`, vrais glissers tactiles par CDP).
- **Mesure** : `#race-hub` défile (hauteur 1 431 pour 390) ; l'onglet « Mondial » du classement est à y = 978 pour un écran de 390 ; un glisser sur la carte laisse `scrollTop` à 0, un glisser sur « Jouer » aussi ; un glisser sur la marge gauche de 8 px l'amène à 325.
- **Capture vue** : la carte du tracé et la barre « Jouer » occupent l'écran, la légende (Départ, Arrivée, Checkpoints) passe sous la barre ; un toast « « Premiers Éclats » ajouté aux favoris » recouvre le titre. Le portrait est conforme (colonne unique). Même défaut sur la fiche du défi du jour et sur la fiche d'un circuit de la communauté (serveur simulé).

### REC-004 (P3) — Replay et Theater au tactile : les boutons de conduite restent affichés dessous

- **Reproduction** : 844×390 tactile, finir une course, « Revoir la course » (ou « Regarder » depuis la fiche).
- **Constaté** : ⟲, ↺, ❚❚ et ◀ ▶ ▼ ▲ restent visibles, **recouverts en partie par la barre du Theater** (`elementFromPoint` rend `div#theater` pour « Dernier checkpoint », « Recommencer » et « Pause ») et inutiles en lecture. **Capture vue** : le bouton plein écran se superpose à la pastille « REPLAY » et la vitesse « 140 km/h » passe sous la barre.

### REC-005 (P3) — Arrivée, téléphone paysage : le second rang de boutons est sous l'écran

- **Reproduction** : 844×390 tactile, profil neuf, première arrivée d'un circuit (niveau gagné, objectif bonus, conseils) ; `defilement.mjs fr land`.
- **Mesure** : la carte d'arrivée défile en interne (`scrollHeight` 510 pour 376 visibles) ; « Revoir la course », « Partager mon fantôme » et « Classement » sont à y = 417, « Fiche du circuit » à y = 465 (écran 390). **Capture vue** : « Rejouer », « Circuit suivant », « Menu » visibles ; le texte du bas (« Défis de… ») est coupé ; le toast « Niveau 2 ! » chevauche « Médaille obtenue : Or ». `test-browser` annonce « toute la fenêtre tient sans défiler » pour 844×390 : il ne couvre pas ce cas chargé.

### REC-006 (P3) — Échap ne ferme pas « Importer un circuit » ni la fenêtre des salons

- **Reproduction** (clavier) : Créer › Importer un code (ou Multijoueur › Salons), le champ de texte a le focus, **Échap** : la fenêtre reste ouverte (le parcours échoue « Échap ne ferme pas la fenêtre » aux deux endroits, six configurations). Les fenêtres sans champ (Modes, Académie, Compétition, Avis) se ferment.
- **Cause lue** : `js/input.js` ignore tout `keydown` dont la cible est `INPUT`, `TEXTAREA` ou `SELECT`, y compris Échap. `docs/ARCHITECTURE.md` le dit désormais (0.16.19, « Échap sans effet dans un champ de texte ») : c'est donc documenté, pas corrigé.

### REC-007 (P3) — Anglais : messages d'erreur réseau et de course restés en français

- Textes vus (lecture de la page) : « Leaderboard unavailable: **Serveur injoignable (connexion internet ?).** » (fiche, défi du jour ; l'arrivée dit « 🌍 **Classement** : Serveur injoignable… ») ; « Community unavailable | : **Pas de connexion internet.** » ; « Leaderboard unavailable: **Pas de connexion internet.** » (hors ligne) ; toasts « **Incident : retour au dernier checkpoint.** » et « **Une erreur est survenue : la course a été interrompue.** ».
- **Reproduction** : langue English, réseau coupé (ou jeu servi sans Supabase), ouvrir une fiche ou finir une course ; pour les toasts, lever une exception dans `session.update` pendant une course (parcours 2).

### REC-008 (P3) — Anglais : libellés d'écran restés en français

Vus en anglais (texte lu et captures) : tuile « Daily challenge » avec le sous-titre « **nouveau** » (capture vue) ; panneau Profil : « Sauvegardes — **code joueur, import, export** » ; Modes : « 🎯 Finir sans réapparition », « 🎯 Finir sans toucher de muret », « 🎯 Franchir l'arrivée en moto », « 🎯 1 réception parfaite » ; objectif bonus « ★ Finir en moins de 50.5 s ✓ » ; tutoriel sur téléphone, page 1 : « **Boutons ▲ / ▼ à droite**: accelerate / brake », « **Boutons ◀ ▶ à gauche : tourner** » ; garage : « 🔒 Terminer 10 mutations du day » (mélange), préréglages et collections (« Noël », « Été », « Bonnet de Père Noël · Sapins… »), outils de l'atelier « + Sphère », « + Cône » ; multijoueur : « (toi) », « ● connecté · 2 ms », « Manche 1/1 · … » ; carte communautaire « non vérifié » ; aide : touche « Échap / P ». Les noms de circuits français restent (contenu, voulu).

### REC-009 (P3) — Anglais : publication et messages de l'éditeur

Vus : bouton « **🌐 Publier** » dans « Track verified ✔ » (et dans le formulaire de publication) ; « Estimated difficulty: ◆◇◇◇◇ **Très facile** » ; titre « **Nouveau circuit ?** » (Fichier › Nouveau) ; messages « **Arrivée posée** », « **Ligne droite posée** », « **Aucune pièce où prolonger : pose d'abord le départ.** » ; aide : « Touches modifiables : Paramètres › Commandes. » ; le nom par défaut « Mon circuit » reste dans la phrase « …medal of “Mon circuit” », alors que l'en-tête dit « My track ».

### REC-010 (P3) — Anglais : format régional

La fiche du défi du jour (anglais) dit « Daily challenge · **25/11/2026** » (jour/mois/année) et la fiche d'un circuit « Race distance **2,9 km** » (virgule décimale) ; la fiche communautaire « ≈ **3,0 km** ». Les séparateurs sont mêlés même en français : l'arrivée dit « 0.12 s perdues » à côté de « 2,9 km ».

### REC-011 (P3) — Deux onglets : les réglages d'un onglet écrasent ceux de l'autre

- **Reproduction** (`interactions.mjs d3`) : deux pages d'un même navigateur, même pseudo invité, toutes deux au menu ; page A : change le champ de vision puis enregistre ; page B (sans recharger) : `volume = 0,31` puis enregistre ; recharger : volume 0,31, champ de vision 0. Avec 2 s d'écart : champ de vision perdu, volume 0,22 gardé.
- Ce que la fusion de 0.16.10 couvre fonctionne (pièces 197 + 100 + 30 = 327 ; favoris ; records, §4 D3) : elle ne couvre pas les réglages.

### REC-012 (P3) — Portrait : l'invite « Tourne ton téléphone » recouvre tout

- Mesuré (`sonde`) : en portrait, après `playBuiltin`, l'état de la session est « paused », la fenêtre de pause est affichée et l'invite est en `display: flex` ; après rotation en paysage, **l'état reste « paused »** et la pause reste affichée (il faut « Reprendre »). L'**éditeur** est aussi recouvert, avec « Tourne ton téléphone en mode paysage pour jouer. » (capture vue : l'éditeur en filigrane sous le texte ; les boutons ⚙, ☰ sont recouverts : « #editor [data-ed="params"] est recouvert par div#rotate-hint »). Peut être voulu ; signalé parce qu'un joueur en portrait ne peut pas quitter une course sans pivoter.

### REC-013 (P3) — Cibles tactiles de moins de 32 px

- Mesure géométrique sur les écrans tactiles : cases à cocher de 13×13 (âge et règles) à 20×20 (réglages), curseurs de 16 px de haut (barre du Theater 658×16), liens légaux de 16 à 17 px, 73 boutons « 🏆 » de 35×21 dans la carrière, « J'ai perdu mon mot de passe » 172×17, liens et boutons du pied de menu de 17 à 22 px, boutons de la fiche (« Mon record », « 🏍 Départ en moto »…) de 27 px de haut. La règle WCAG 2.2 (2.5.8) fixe 24 px : les cases de 13 px y sont sous le seuil. Indicatif : aucun test d'accessibilité formel.

### REC-014 (P3) — Finition

- **Clavier, capture vue (leçon 1)** : la bannière « Objectif : Finir sans toucher de muret… » (`#hud-msg`, de x = 161 à 1119) commence 19 px à l'intérieur de la mini-carte (qui finit à x = 180). La pastille « ◆ 0 / 3 » passe en partie sous la mini-carte (844×390, capture vue). Pendant le Theater, le bandeau du haut dit « Pas encore de record » alors qu'on regarde « Mon record 48.225 » (clavier) et « Cette course 48.158 » (paysage) (captures vues). Un conseil de l'arrivée dit « vitesse maxi 236 km/h contre 236 » (captures vues, clavier et paysage). Le toast « Niveau 2 ! » chevauche « Voir ces passages dans le Replay Theater » (clavier, capture vue).
- Volet documentation : `docs/TESTS.md` est maintenant d'accord avec les commandes (136 + 5, 206) : **corrigé**.

### REC-016 (P3) — Sauvegarde cloud : à 1 000 caractères de place, la connexion réussit mais le profil affiché est vide

- **Reproduction** : `node tools/recette/quota.mjs` (faux Supabase, appareil limité à 1 000 caractères, compte de 777 ◆ et 120 records au cloud) : `signIn` « account », statut « error », message « … Libère de la place sur l'appareil… », **`profile().coins` = 0 et 0 record local** ; le cloud garde 777 ◆ et 120 records, rien n'est envoyé. À 5 000 caractères : 777 ◆ affichés, 17 records locaux.
- Le même résultat sort du code de la première passe (`4dbeb35`) : **ce n'est pas nouveau dans le code**, c'est une phrase de la première passe (« la progression (777 ◆) s'affiche toujours ») qui était inexacte pour cette ligne. Le message d'erreur est clair ; le défaut possible est l'affichage d'un profil vide à un joueur dont le cloud est intact. Cas extrême (appareil presque plein) ; script Node, pas d'interface.

### REC-017 (P3) — Téléphone paysage : la bannière d'objectif d'une leçon est plus large que l'écran

- **Reproduction** : 844×390 tactile, Académie › leçon 1 (ou le tutoriel › « Première course guidée »), `sonde` : `#hud-msg` mesure de x = −57 à 901 (958 px pour un écran de 844) ; en anglais de −78 à 922 (« Goal: Finish without touching a barrier. Stay on the road, g… »). **Capture vue** : « …ectif : Finir sans toucher de muret. Reste sur la route, passe le portique puis l'arri… », coupé aux deux bords ; la pastille « ◆ 0 / 1 » passe sous la mini-carte. Au clavier la bannière tient en largeur (REC-014).

### REC-018 (P3) — Éditeur sur téléphone en paysage : le tiroir de pièces se referme après chaque choix

- **Reproduction** : 844×390 tactile, Créer › Éditeur de circuits (guidé) ; toucher l'outil « Pistes » (tiroir ouvert : x de 58 à 368), toucher la tuile « Départ » : le tiroir est replié (x de −310 à 0) et le bouton « ➜ Prolonger » (dans le tiroir) est à x = −184. Même chose après chaque tuile ; français et anglais identiques. Un novice qui veut « Prolonger » quatre fois doit rouvrir le tiroir avant chaque pose. Peut être voulu (libérer la scène) ; signalé comme friction, non comme défaut.

### Constats écartés ou non confirmés (vérifiés, pas des défauts)

- « Bouton « Refermer le panneau » recouvert par l'étiquette « Ligne droite » » (audit, éditeur, téléphone paysage, après « Tout afficher », FR et EN) : une sonde a mesuré le bouton à (317, 56)–(357, 96) et `elementFromPoint` au centre rend le bouton lui-même : **non confirmé**, probablement dû au défilement du panneau pendant l'audit ; non retenu.
- « L'objectif de la leçon 1 reste affiché dans la course suivante » : le texte reste dans l'élément du HUD mais est invisible ; non retenu (première passe).
- « Aucune course hors ligne » : c'était un tutoriel qui s'ouvrait et mettait la course en pause (TECH-017) ; la course démarre hors ligne (§2.3).
- « Aucune confirmation en quittant l'éditeur avec une modification non enregistrée » : la modification est gardée à la sortie, rien n'est perdu (première passe, sonde à part).
- Liens « ouvrir une demande » signalés « recouverts » dans la fenêtre Confidentialité en portrait (FR et EN) : lien sur deux lignes dont le centre tombe entre elles ; faux positif de l'audit.
- Leçons 2 et 3 de l'Académie « Pas tout à fait… » avec le pilote automatique : attendu (le pilote ne fait pas de mini-turbo), pas un défaut.
- « Hors ligne : une course démarre — non » en portrait : la course est en pause sous l'invite (REC-012), pas une panne hors ligne.

## 6. Ce que seul le propriétaire peut vérifier (impossible ici)

- **Vraie manette** : capture d'une liaison (TECH-006), A tenu à l'ouverture de la pause (TECH-005), navigation des menus, vibrations.
- **Vrai téléphone** : maintien tactile réel des pédales, multitouch, retour haptique, plein écran, orientation réelle, barre d'adresse mobile, zones de sécurité, verrouillage de l'écran, onglet masqué par le système, mémoire et chaleur sur des courses longues.
- **Son** : musique, effets, klaxons, suspension à l'arrière-plan.
- **Ressenti de conduite**, lisibilité à 60 images/s, sensations (le rendu logiciel de cette recette est à quelques images par seconde).
- **Supabase réel** : Auth (inscription, connexion, code de secours), limites de débit, `service_role`, `check-deployed` contre la production, publication et classements réels, saisons, duels, tournois ; les contrôles SQL tournent sur un PostgreSQL local avec un faux schéma `auth`. Aussi : **quelle version est réellement déployée** sous le nom de cache actuel de `sw.js` (REC-015).
- **Realtime et WebRTC entre machines** : présence réelle, délai de retrait d'une connexion morte, coupures Wi-Fi, NAT, relais TURN, latence ; la recette n'a vu que deux onglets d'un même navigateur.
- **Firefox et Safari** : `test-browser-moteurs` ne tourne ici que sur Chromium.
- **Lecture humaine de l'anglais** : l'audit signale ce qui ressemble à du français ; il ne juge pas la qualité des traductions.

## 7. Non testé dans cette recette (possible ailleurs)

- Académie : réussite par un humain des leçons 2 et 3 et de l'exercice 3 (mini-turbo) ; Académie en portrait (seul le menu a été ouvert) ; modes : jeu d'un mode et bilan (couverts par `test-browser`, vert).
- Compétition : duels et tournois (serveur) ; amis (compte) ; abonnements ; commentaires et playlists de la communauté (serveur simulé couvert par `test-browser`).
- Création d'un compte réussie, connexion, changement de mot de passe, code de secours, synchronisation réelle : couverts par `test-browser-recuperation` (9 vérifications vertes), pas rejoués ici.
- Export vidéo, fantôme rival, lien de défi `#g=`, import d'un code : couverts par `test-browser`, non rejoués.
- Salons à deux onglets en portrait ; salons à trois onglets, hôte qui recharge, imposteur, championnat (couverts par `test-browser`, vert).
- Un second passage de `test:browser`, `test:deno` et `test:sql` (aucun échec à départager) ; Firefox / WebKit.
- L'annonce visible faite au joueur quand un nouveau record ne peut pas s'écrire (stockage plein, §4 D4).
- Achats du garage (le joueur neuf a 0 ◆).
- Le texte réel du message de la salle au premier « Lancer » sans circuit choisi (mesure non concluante, §2.3).

## 8. Fichiers et reproduction

Scripts (commités) : `tools/recette/` — `journey.mjs`, `journey2.mjs`, `editeur.mjs`, `salons.mjs`, `horsligne.mjs`, `longue.mjs`, `interactions.mjs`, `quota.mjs`, `synthese.mjs`, `lib.mjs`, `README.md`, et, ajoutés par cette passe, `rec001.mjs` (REC-001), `defilement.mjs` (REC-002, 003, 005), `academie.mjs` (Académie). Les captures et les JSON de sortie restent dans `RECETTE_OUT` (par défaut `/tmp/recette`), **hors du dépôt**. Ils ne cassent pas `npm run lint` (vérifié : 0 erreur).

```bash
# parcours : une configuration à la fois (langue fr|en, entrée kb|land|port)
RECETTE_OUT=/tmp/recette node tools/recette/journey.mjs fr kb
RECETTE_OUT=/tmp/recette node tools/recette/editeur.mjs en land
RECETTE_OUT=/tmp/recette node tools/recette/rec001.mjs fr kb
RECETTE_OUT=/tmp/recette node tools/recette/defilement.mjs fr land
RECETTE_OUT=/tmp/recette node tools/recette/academie.mjs en kb
RECETTE_OUT=/tmp/recette node tools/recette/horsligne.mjs en land
RECETTE_OUT=/tmp/recette node tools/recette/salons.mjs en land
RECETTE_OUT=/tmp/recette node tools/recette/longue.mjs circuits
RECETTE_OUT=/tmp/recette node tools/recette/interactions.mjs tout
node tools/recette/quota.mjs
```

Quelques sondes jetables (position du bouton « Prolonger » et du tiroir, bannière `#hud-msg`, état en portrait, bouton « Refermer le panneau ») n'ont pas été gardées : leur contenu est décrit dans les fiches REC-012, REC-017, REC-018 et dans « Constats écartés ».
