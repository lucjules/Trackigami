# Recette de stabilisation (phase 21)

Date : 2026-11-25. Code recetté : branche `claude/magical-darwin-8jrpii`, base `1b4614e`, **version 0.16.18**, `PHYS_VER` 39. **Aucun fichier du jeu n'est modifié** (`git status` : seulement `tools/recette/` et ce rapport). La version n'est pas changée.

Référence : `docs/audit/AUDIT_COMPLET.md`, annexe 1 et annexe 4 §4.3 (« parcours d'interface à refaire en priorité »), §4.4 (scénarios 1, 4, 5).

Trois mots, partout dans ce document :

- **constaté** : observé dans cette recette, avec reproduction ou capture décrite ;
- **non testé** : possible, mais pas fait ici (la raison est dite) ;
- **impossible ici** : demande du matériel ou un service que ce conteneur n'a pas (vraie manette, vrai téléphone, son, ressenti de conduite, Supabase réel, Realtime, vrai réseau WebRTC).

## 0. Verdict

1. **La stabilisation est terminée pour ce qui s'automatise et se mesure** : lint, `npm test` (141 fichiers, 2 168 vérifications), les neuf scripts `test:browser`, Deno, PostgreSQL et l'empreinte de la physique passent sans un échec ; aucune régression par rapport à la référence du début du chantier ; courses en direct = rejeu du serveur au bit près sur trois circuits ; 12 circuits × 2 courses et 10 minutes de course sans erreur ni fuite mesurée. **Aucun P1.**
2. **Une régression à corriger (P2), introduite par la phase « éditeur » (0.16.8)** : après un essai ou une vérification, « Rétablir » saute à un état faux, et après les deux de suite l'historique d'annulation est perdu (REC-001). Le reste (13 constats P3) tient à l'interface sur téléphone en paysage, à l'anglais (textes français restants, tous antérieurs au chantier), à un Échap sans effet dans deux fenêtres à champ de texte, et aux réglages écrasés entre deux onglets.
3. **Ce qui reste, hors de portée d'un conteneur** : manette, vrai téléphone, son, ressenti, Supabase / Realtime réels, WebRTC entre machines (§6). Les 31 écrans et fonctions listés ont tous été visités dans les deux langues et les trois modes d'écran (clavier, téléphone paysage, téléphone portrait) sauf les exceptions notées « non testé » (§2).

### Régressions signalées en tête

| Constat | Phase probable | Preuve |
| --- | --- | --- |
| **REC-001** (P2) : « Rétablir » après un retour d'essai ou de vérification de l'éditeur redonne un état faux (1 pièce au lieu de 5) ; après un essai puis une vérification, l'historique est vide | **phase éditeur, 0.16.8** : le commit `f8a93bb` (« états gardés au mauvais moment », TECH-054) a ajouté à `js/editor.js` ligne 139 `this.history[this.hIndex] = this.history[0]` après la restauration ; en 0.16.7 (conservation de l'historique, TECH-034) la ligne n'existait pas (`git show 9a2bf51:js/editor.js`) | reproduit cinq fois, témoin sans essai correct (§5) |

Aucune autre régression par rapport à une phase n'a été constatée : les autres constats existent dans le code d'avant le chantier (dates des lignes vérifiées par `git log -S` / `git blame` quand c'était utile) ou portent sur des cas que les phases n'ont pas traités (REC-006 : arbitre d'entrées ; REC-011 : fusion des onglets limitée au profil).

## 1. Régression globale : les commandes

Machine : Linux, 4 cœurs, 16 Go ; Node 22.23.5 ; Chromium de Playwright 1.63.0 (WebGL logiciel SwiftShader) ; Deno 2.9.6 (`npx`) ; PostgreSQL 16.15 jetable monté selon `docs/TESTS.md` (« PostgreSQL jetable »).

| Commande | Résultat réel | Durée | Référence du début du chantier |
| --- | --- | --- | --- |
| `npm run lint` | 0 erreur (ESLint 10.1.0, `tools/recette/` compris) | 7,3 s | — |
| `npm test` | **141 fichiers, 2 168 vérifications, 0 échec** (136 `test-*.mjs` + 5 contrôles : `check-generated`, `audit-pieces`, `phys-fingerprint`, `check-docs`, `sim`) | 150,1 s | 124 fichiers, 1 776 vérifications, 0 échec → **+17 fichiers, +392 vérifications** |
| `npm run test:browser` (9 scripts, voir ci-dessous) | **tout vert** : 157 vérifications, 0 échec | 897 s cumulés | 57 tests, 0 échec (le seul `test-browser.mjs` en compte maintenant 75) |
| `npm run test:deno` | `dmath` et empreinte de la physique sous Deno : 0 échec | 12,6 s | — |
| `npm run test:sql` | **exit 0, 270 vérifications `ok`** (étapes 1 à 21, concurrence réelle) sur PostgreSQL 16.15 | 42 s | — |
| `node tools/phys-fingerprint.mjs` | identique : `PHYS_VER` 39, **206 scénarios** | 11,1 s | — |
| `node tools/test-browser-moteurs.mjs` (Chromium seulement ; hors `npm run test:browser`) | 12 étapes ok, aucune erreur JavaScript | 21,8 s | — |
| `node tools/check-deployed.mjs` (production) | **impossible ici** (aucun accès à la production) | — | — |

Détail de `test:browser` : `test-browser` 75 ok (541 s) · `test-browser-i18n` 9 (42 s) · `test-browser-audit` 8 (69 s) · `test-browser-camera` 6 (28 s) · `test-browser-editeur` 23 (105 s) · `test-browser-boot` 5 (6 s) · `test-live-replay` 9 (15 s) · `test-browser-entrees` 13 (62 s) · `test-browser-recuperation` 9 (29 s).

Aucun échec : il n'y avait donc rien à reproduire pour distinguer un test instable d'un défaut réel. `npm test` a été relancé une seconde fois après l'ajout des scripts et de ce rapport : même résultat (141 fichiers, 2 168 vérifications, 0 échec, 154,4 s) ; les autres commandes n'ont tourné qu'une fois.

Écart constaté, hors jeu : `docs/TESTS.md` dit « 127 fichiers de test » et « 193 scénarios » ; les commandes donnent 136 (+5 contrôles) et 206 (REC-014).

## 2. Parcours d'interface

### 2.1 Méthode

Scripts : `tools/recette/` (voir son `README.md`). Une exécution par configuration, profil neuf à chaque fois : **langue** français / anglais × **entrée** clavier + souris (1280×720), téléphone simulé en **paysage** (844×390, écran et événements tactiles) et en **portrait** (390×844). Six configurations × trois scripts de parcours (nouveau joueur 893 étapes, joueur installé 204, éditeur novice 174) = **1 271 étapes**, chacune suivie d'un audit dans la page (bouton dont le centre est recouvert, bouton hors écran même après défilement, `NaN` / `undefined` / `[object` dans le texte, texte français en anglais, page qui défile en largeur) et d'une capture à `deviceScaleFactor` 1. Les clics sont de vrais clics souris ou de vrais touchers au centre du bouton, **après vérification que le point visé lui appartient** ; la vérification échoue en disant ce qui recouvre.

Limites de la méthode, dites une fois : (a) tenir une pédale au toucher n'est pas simulable : les boutons ▲ / ▼ sont pilotés par événements `pointerdown` / `pointerup` ; (b) l'arrivée d'une course est obtenue par le **pilote automatique** (le vrai écran d'arrivée s'affiche ensuite par la vraie boucle) ; (c) rendu logiciel : en tactile, qualité `ultrapotato` ; (d) 1 124 captures prises, **35 regardées une à une** (listées en §2.4) ; les autres n'ont été jugées que par l'audit automatique, qui ne voit pas un texte coupé ou un chevauchement partiel : ce qui n'a pas été regardé n'est pas affirmé ; (e) l'audit « non traduit » a un angle mort (un mot isolé comme « nouveau », une phrase mêlant les deux langues) : il a été renforcé en cours de route par une liste de mots français, et les premières exécutions anglaises ont été refaites.

Aucune erreur console du jeu pendant tous les parcours (hors erreurs réseau attendues vers Supabase et les polices, filtrées comme le fait `tools/test-browser.mjs`, et hors les deux exceptions que le parcours 2 injecte volontairement dans la boucle de course).

### 2.2 Tableau écran par écran

✔ vu sans défaut · ⚠ défaut (REC-nnn) · ○ non testé. Colonnes : FR / EN × clavier (K), téléphone paysage (P), téléphone portrait (V).

| Écran ou fonction | FR K | EN K | FR P | EN P | FR V | EN V |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Accueil : invité, Connexion, Créer un compte, messages d'erreur hors ligne, bascule de langue | ✔ | ✔ | ⚠ 002 | ⚠ 002 | ✔ | ✔ |
| 2. Tutoriel (3 pages, Précédent / Suivant / Passer) | ✔ | ✔ | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 3. Première course guidée (leçon 1 : consignes, roulage, pause, quitter) | ✔ | ✔ | ✔ | ✔ | ✔ (après rotation, 012) | ✔ (idem) |
| 4. Menu principal, 6 panneaux, 28 entrées, chaque « ← Retour » | ⚠ 006 | ⚠ 006, 008 | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 5. Carrière : 72 cartes, défilement jusqu'au dernier chapitre | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 6. Fiche de circuit : carte, zoom, favori, onglets, Jouer | ✔ | ⚠ 007 | ⚠ 003 | ⚠ 003, 007 | ✔ | ⚠ 007 |
| 7. Défi du jour : fiche, course | ✔ | ⚠ 007, 008, 010 | ⚠ 003 | ⚠ 003, 007, 008 | ✔ | ⚠ 007, 008 |
| 8. Modes (menu, fiche d'un mode) | ✔ | ⚠ 008 | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 9. Académie (menu des 6 leçons, consignes de la leçon 1, retour) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 10. Course : décompte, HUD, boutons tactiles, mini-carte | ✔ (014) | ✔ | ✔ (014) | ✔ | ✔ (012) | ✔ |
| 11. Pause : Reprendre, Retour au checkpoint, Recommencer, Caméra, Commandes, curseurs, Quitter ; au clavier Échap, R, Entrée | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 12. Arrivée : Rejouer, Classement, Partager mon fantôme, Revoir la course, Fiche du circuit | ✔ (014) | ⚠ 007 | ⚠ 005 | ⚠ 005, 007 | ⚠ 005 | ⚠ 005, 007 |
| 13. Replay (barre, pause, quitter) | ✔ | ✔ | ⚠ 004 | ⚠ 004 | ⚠ 004 | ⚠ 004 |
| 14. Replay Theater (record comparé, panneau, quitter) | ✔ (014) | ✔ | ⚠ 004 | ⚠ 004 | ⚠ 004 | ⚠ 004 |
| 15. Garage : 4 familles, 14 onglets, choix d'un élément, moto | ✔ | ⚠ 008 | ✔ | ⚠ 008 | ✔ | ⚠ 008 |
| 16. Profil : Compte, Amis, Sauvegardes (invité) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 17. Progression : Records, Niveau, Statistiques, Déblocages | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 18. Réglages : 6 onglets | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 19. Commandes : réassigner « accélérer » à I, courir, rétablir | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 20. Créer : Mes circuits, Importer un code, Wiki (lien) | ⚠ 006 | ⚠ 006 | ✔ | ✔ | ✔ | ✔ |
| 21. Éditeur en joueur novice (poser, tester, vérifier, quitter, revenir, annuler, enregistrer) | ⚠ 001 | ⚠ 001, 009 | ⚠ 001 | ⚠ 001, 009 | ⚠ 012, 001 | ⚠ 012, 001, 009 |
| 22. Communauté : réseau coupé, puis serveur simulé (liste, cartes, fiche) | ✔ | ⚠ 007, 008 | ⚠ 003 | ⚠ 003, 007, 008 | ✔ | ⚠ 007, 008 |
| 23. Multijoueur : menu des salons (fenêtre) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 23 bis. Salons à deux onglets : créer, rejoindre par lien, prêt, course commune, un joueur part (§2.3) | ✔ | ⚠ 008 | ○ | ○ | ○ | ○ |
| 24. Compétition (ouverture) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 25. Confidentialité, Crédits, Mentions, Donner mon avis (ouverture, fermeture) | ✔ (013) | ✔ | ✔ (013) | ✔ | ✔ (013) | ✔ |
| 26. Écrans d'erreur et hors ligne (§2.3) | ✔ | ⚠ 007 | ○ | ○ | ○ | ○ |
| 27. Changement de langue en cours de route (menus, garage, course, pause, arrivée, éditeur, aller et retour) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| 28. Erreur de course : exception unique, puis exceptions répétées | ✔ | ⚠ 007 | ✔ | ⚠ 007 | ✔ | ⚠ 007 |
| 29. États de synchronisation du compte (invité seulement ; Node : §4, D4) | ✔ (invité) | ✔ (invité) | ○ | ○ | ○ | ○ |
| 30. Académie leçons 2 à 6, exercices évalués, duels, tournois, export vidéo, fantôme rival | ○ | ○ | ○ | ○ | ○ | ○ |

« ⚠ 006 » (lignes 4 et 20) ne concerne que le clavier : sur téléphone il n'y a pas de touche Échap (le parcours en a tapé une et a refermé la fenêtre par son bouton). « Tous les boutons répondent » : chaque entrée de menu, chaque onglet, chaque bouton de la pause, de l'arrivée, du garage (4 familles, 14 onglets) et de l'éditeur (§2.3) a été activé par un clic ou un toucher réel et a ouvert ce qu'il annonce. **Non manipulés un par un** : les cases à cocher et curseurs des réglages (hors langue, commandes et curseurs de la pause), les boutons d'export et d'import de la fenêtre Sauvegardes, les achats du garage (le joueur neuf a 0 ◆).

### 2.3 Fonctions des phases récentes et écrans particuliers

- **Éditeur novice, ce qui a été observé de bout en bout** (clavier FR, EN, paysage, portrait après rotation ; `editeur.mjs`) : le mode guidé n'offre que Ligne droite, Virage, Départ, Arrivée ; Départ posé d'un clic ; « Prolonger » raccorde les pièces ; l'indicateur de problèmes (⚠ n) disparaît quand le circuit est complet ; ↶ ×2 / ↷ ×2 corrects avant tout essai ; « Tester » lance la course, « Quitter » rend le même circuit (même nombre de pièces) ; « Vérifier et publier » fait courir, la fenêtre « Circuit vérifié ✔ » propose Publier / Retour à l'éditeur / Refaire un meilleur temps ; « Publier » sans réseau ouvre le formulaire de publication ; « Fichier › Nouveau circuit » demande confirmation (Annuler / Nouveau) ; Fichier › Enregistrer : « Mes circuits » le liste et « Éditer » le rouvre avec le même nombre de pièces, vérifié ; sur téléphone la bibliothèque est repliée : on l'ouvre par l'outil « Pistes » ; défaut : REC-001.
- **Arbitre d'entrées** (0.16.1) : `test-browser-entrees` passe (13). Dans les parcours : Échap, R, Entrée à la pause et à l'arrivée sans double déclenchement ; une touche réassignée est la seule à accélérer et la course l'utilise ; « Rétablir par défaut » la rend. Un cas non traité : REC-006.
- **Erreurs de course** (0.16.2) : une exception unique dans la boucle de course → « Incident : retour au dernier checkpoint. », la course continue (état `racing`) ; des exceptions répétées → « Une erreur est survenue : la course a été interrompue. », retour au menu, plus de session de course. Constaté sur les six configurations ; les deux messages restent en français en anglais (REC-007).
- **Hors ligne, vrai service worker** (script `horsligne.mjs`, FR et EN, clavier) : première visite, 240 entrées en cache ; réseau coupé, rechargement : la page d'accueil s'affiche, le menu s'atteint, **une course démarre**, la communauté et le classement d'une fiche affichent « indisponible » avec un texte clair (en anglais : REC-007). Navigateur sans WebGL 2 : message traduit, sans pseudo demandé. Module du jeu injoignable : « Le jeu n'a pas pu démarrer : une mise à jour est peut-être en cours… Réessayer » (traduit). Réseau coupé en cours de jeu : communauté et salons ouverts sans erreur.
- **Salons à deux onglets** (`salons.mjs`, signalisation locale `?net=local`, vrai WebRTC sur la machine, clavier seulement) : créer la salle, l'invitée rejoint par le lien, liaison ouverte dans les deux sens, cartes, « Prêt », choix du circuit, course à départ commun (voiture distante vue, opaque), une joueuse ferme son onglet en pleine course : l'autre continue ; « Quitter » ramène au salon. Aucune erreur console. **Impossible ici** : Supabase Realtime réel, latence, coupures Wi-Fi.
- **États de synchronisation** : l'onglet Compte d'un invité dit « Mode invité · Progression locale. Un compte la suit partout. » Les états réels (« ok », « erreur », « copie allégée ») n'ont été vus que côté Node (§4, D4) ; création de compte réussie, synchronisation : **non testé** dans les parcours (couvert par `test-browser-recuperation`, vert).

### 2.4 Captures regardées une à une

Clavier FR : accueil, tutoriel 1/3, leçon 1 en roulant, pause, carrière, fiche, arrivée, fenêtre « Classement », fenêtre « Partager mon fantôme », Theater, garage, onglet Compte, onglet Commandes. Clavier EN : panneau Jouer, Réglages › Accessibilité, Réglages › Audio, fiche du défi, communauté hors ligne, Académie, éditeur (fenêtre « Track verified », formulaire de publication). Téléphone paysage FR : accueil (Connexion, Créer un compte), fiche, HUD de course, arrivée, replay ; EN : tutoriel. Portrait FR : invite de rotation, menu avec tutoriel, fiche. Éditeur : clavier, paysage (palette repliée), portrait (invite). Hors ligne FR : communauté.

Description de ce qui a été vu : l'accueil est une carte centrée (« Qui joue ? », trois onglets, champ Pseudo, bouton « Jouer en invité », liens légaux) ; le menu a six tuiles inclinées et le tutoriel s'ouvre dessus ; la pause est une carte avec trois gros boutons, une rangée Caméra / Commandes, quatre curseurs et Quitter ; l'arrivée montre le temps, le médaillon, les pièces, l'expérience, l'objectif bonus, la ligne de classement (en rouge « Serveur injoignable ») et les conseils ; la carrière est une grille de cartes par chapitre avec bandeau de progression ; la fiche a la carte du tracé à gauche, les options de départ, « Jouer », le classement et les records à droite ; le Theater est une barre de temps avec les contrôles de lecture ; le garage est un panneau à droite avec quatre familles et des sous-onglets ; en éditeur, le mode guidé montre Pistes / Sélection / Inspecter / Gomme et les tuiles Ligne droite, Virage, Départ, Arrivée.

## 3. Sessions longues

Script `longue.mjs` (Chromium avec `--expose-gc` et mémoire précise ; mesures : enfants de la scène, objets de la scène, nœuds du DOM, géométries et programmes de three.js, tas JavaScript après ramassage forcé).

**12 circuits × 2 courses** (Premiers Éclats, Lianes Néon, Lagon Turquoise, Néons Express, Aurore Naissante, Braises, Quai d'Amarrage, Courant Chaud, Chaîne de Montage, Premier Envol, Galerie de Cristal, Garde-Fous ; « Rejouer » pour la seconde, puis retour au menu une fois sur deux et au garage l'autre fois) : **les 24 courses vont à l'arrivée** (les deux temps d'un même circuit sont voisins, écart de 0,00 à 0,15 s : 48,44 / 48,35 s, 48,91 / 48,92 s, 46,91 / 46,76 s, 35,57 / 35,56 s ; le pilote automatique n'est pas rejoué à l'identique ici), aucune erreur console.

| | départ (menu) | fin (menu) | plage sur les 12 circuits |
| --- | --- | --- | --- |
| enfants de la scène | 11 | 11 | 11 |
| objets de la scène (menu) | 249 | 248 | 245 à 262 |
| nœuds du DOM (menu) | 925 | 2 340 | 2 280 à 2 349 après la première arrivée |
| géométries de three.js (menu) | 49 | 30 | 28 à 39 |
| programmes (menu) | 6 | 9 | 8 à 9 |
| tas JavaScript (menu) | 18,2 Mo | 26,5 Mo | 22,6 à 33,0 Mo |

Le DOM passe de 925 à ~2 300 nœuds à la première arrivée (écrans de l'arrivée et du garage construits une fois) puis **reste stable** (± 35), le tas oscille sans tendance, la scène retrouve ses 11 enfants. Pas de fuite visible sur cette mesure (la mémoire réelle d'un téléphone est **impossible ici**).

**Course de 10 minutes, page visible, voiture tenue à fond** : aucune erreur, DOM 2 341 → 2 341, objets de la scène 346 → 346, tas 30,8 → 27,1 Mo. Un second passage échantillonné toutes les 30 s pendant 8 minutes (`longue.mjs echant`, 17 relevés) : DOM 934 constant, objets de la scène 346 constants, programmes 8 constants, géométries 51 puis 72 dès le deuxième relevé et 72 ensuite, tas de 21,3 à 22,1 Mo après le premier relevé (26,5 Mo) : **aucune tendance à la hausse**. (Deux relevés isolés du premier passage, 64 puis 89 géométries, avaient pu faire croire à une croissance : la série ne la confirme pas.)

**Onglet masqué, 10 minutes** : Chromium sans écran ne masque jamais une page (`document.visibilityState` reste « visible » même quand une autre page prend le premier plan : **impossible ici** de masquer pour de vrai). Ce qui a été fait à la place (`longue.mjs gele`) : course en cours, `visibilityState` forcé à « hidden » avec l'événement `visibilitychange` (ce que le jeu écoute), puis **page gelée par le navigateur** (`Page.setWebLifecycleState`) pendant 10 minutes, dégel, retour à « visible ». Constaté : la course passe en pause dès l'événement (fenêtre de pause affichée) ; après 10 minutes, même pas de course (321), même chrono (2,675 s), même DOM (934), mêmes objets de scène (346) ; « Reprendre » relance normalement (743 pas après 3 s de conduite). Aucune erreur. **Non testé / impossible ici** : téléphone verrouillé, onglet masqué par le système, contexte WebGL perdu par un vrai pilote (le cas est couvert par `test-browser-moteurs`, vert).

## 4. Interactions entre les corrections

**D1. Course en direct avec retours au checkpoint, puis chemin du serveur** (`interactions.mjs d1`, session « tenue » comme `tools/test-live-replay.mjs`, pilote automatique bruité à graine fixe, **vraie touche R**, puis `replayRun`, `GhostRunner` pas à pas et `verifyRun` dans Node, un autre moteur que la page) : **constaté** sur trois circuits, tous identiques au bit près (écart de position 0 m à chaque pas) et acceptés par `verifyRun` :

| Circuit | Graine | Pas | Temps | Retours par R (pas) | Rejeu | `verifyRun` |
| --- | --- | --- | --- | --- | --- | --- |
| Premiers Éclats (circuit du test de la phase 1) | 11 | 7 407 | 58,125 s | 3 (0, 1 334, 4 428) | identique | accepté |
| Hyperboucle | 11 | 7 701 | 60,625 s | 2 (0, 3 222 ; le plan en prévoyait 3, le troisième palier n'a pas été atteint) | identique | accepté |
| Récif | 11 | 8 696 | 68,867 s | 3 (0, 5 356, 5 808) | identique | accepté |

(`test-live-replay` dans `test:browser` : 9 vérifications vertes, dont les retours automatiques et l'exception injectée.)

**D2. Circuit publié → modifié → vérifié** (`interactions.mjs d2`, éditeur aux vrais boutons ; seul le serveur de publication est simulé) : **constaté, conforme**. Circuit de 10 pièces : course de vérification (9,33 s), fenêtre « Circuit vérifié ✔ », « Publier » : le serveur simulé reçoit un circuit vérifié avec preuve et signature `1es0vc2`. Retour à l'éditeur, gomme cliquée sur l'arrivée : 9 pièces, **plus vérifié**, signature `1bwl1lw` ; « Partager » dit « ⚠ Non vérifié : … Ce circuit avait été vérifié, mais il a changé depuis… une course de vérification suffit » ; `publishTrack` est refusé (message « Vérifie d'abord ton circuit… », rien envoyé) ; l'arrivée reposée, nouvelle vérification (9,33 s), nouvelle publication acceptée. Le circuit rétabli à l'identique reprend la même signature (`1es0vc2`) : normal. Le même parcours par un novice (§2.2, ligne 21) : le circuit enregistré se rouvre avec ses 9 pièces et reste « vérifié ».

**D3. Deux onglets qui modifient le profil** (`interactions.mjs d3`, deux pages d'un même navigateur, même pseudo invité) :

| | Constat |
| --- | --- |
| pièces : A +100, B +30 sans rechargement | **130 ◆** dans les deux onglets, puis après rechargement (aucune perte) |
| favoris posés dans chaque onglet (API `toggleFavorite`) | les deux présents après rechargement |
| records de deux circuits différents, un par onglet | les deux présents (33,3 s et 44,4 s) |
| **réglages** : A change `fovAdd`, B change `volume` (sans attendre, puis 2 s plus tard) | **REC-011** : seul le réglage du dernier onglet à enregistrer survit |

**D4. Sauvegarde cloud simulée sous quota serré** (`quota.mjs`, faux Supabase en Node, temps virtuel ; un compte dont le cloud pèse 552 501 caractères : 120 records, 777 ◆) : sur des appareils limités à 2 000 000, 600 000, 300 000, 150 000, 60 000, 20 000, 5 000 et 1 000 caractères :
- la connexion aboutit toujours ; la progression (777 ◆) s'affiche toujours ; aucune valeur écrite n'est du JSON tronqué ; une requête de lecture et une d'écriture par synchronisation, aucune relance, aucune minuterie en attente ;
- sous 600 000 : note visible « Espace insuffisant sur cet appareil : copie du compte allégée (… records sans fantôme ni commandes ; le cloud les garde en entier) » ; à 5 000 : « 103 records du compte n'y sont pas écrits (le cloud les garde en entier) » ;
- à 1 000 : statut « erreur » avec le message « … Libère de la place sur l'appareil, puis « Synchroniser maintenant » », **rien n'est envoyé** au cloud (il garde 777 ◆ et 120 records) ;
- une modification locale (+10 ◆) est envoyée au cloud tant que le profil tient (787 ◆) ; à 5 000, **un nouveau record local n'est écrit ni sur l'appareil ni au cloud** (`saveRecord` ne lève pas d'exception) : l'annonce faite au joueur dans ce cas n'a pas été observée (script Node, pas d'interface) ;
- un second appareil sans limite relit le cloud intact.

## 5. Constats

Gravité : P1 bloquant ou perte de données ; P2 défaut réel d'une fonction centrale ; P3 gêne, finition, cas limite. Chaque constat est reproductible d'après sa fiche ; « K / P / V » = clavier / téléphone paysage / téléphone portrait.

| Id | Gravité | Système | Constat | Audit | Phase probable |
| --- | --- | --- | --- | --- | --- |
| REC-001 | **P2** | éditeur | Rétablir après un retour d'essai ou de vérification : état faux ; historique perdu après les deux | TECH-034, TECH-054 | **0.16.8 (éditeur)** — régression |
| REC-002 | P3 | accueil | téléphone paysage : sélecteur de langue inaccessible (Connexion, Créer un compte) | — (le test « cinq tailles » ne couvre que l'onglet Invité) | antérieur au chantier |
| REC-003 | P3 | fiche de circuit | téléphone paysage : classement, records et options sous la carte plein écran, défilement seulement par une marge de 17 px | — | 0.15.0 (parcours du joueur), antérieur au chantier |
| REC-004 | P3 | replay, Theater | commandes tactiles de conduite affichées sous le Theater, en partie recouvertes | TECH-068, TECH-069 (voisins) | antérieur au chantier |
| REC-005 | P3 | arrivée | téléphone paysage : la carte déborde, second rang de boutons sous le pli, toast sur du texte | TECH-064 (voisin) | antérieur au chantier |
| REC-006 | P3 | entrées | Échap ne ferme pas une fenêtre dont un champ de texte a le focus | TRANS-03, TECH-017 | arbitre d'entrées (0.16.1) n'a pas traité ce cas ; ligne antérieure au chantier |
| REC-007 | P3 | i18n | anglais : messages d'erreur réseau et de course en français | TECH-071 (même famille) | antérieur au chantier |
| REC-008 | P3 | i18n | anglais : libellés d'écran restés en français | TECH-071 (même famille) | antérieur au chantier |
| REC-009 | P3 | i18n, éditeur | anglais : publication et messages de l'éditeur en français | — | antérieur au chantier |
| REC-010 | P3 | i18n | anglais : date et décimale au format français | — | antérieur au chantier |
| REC-011 | P3 | persistance | deux onglets : les réglages d'un onglet écrasent ceux de l'autre | TRANS-07, TECH-027 | 0.16.10 (fusion du profil, pas des réglages) |
| REC-012 | P3 | interface mobile | portrait : l'invite de rotation recouvre aussi l'éditeur et la pause | — | antérieur au chantier (peut être voulu) |
| REC-013 | P3 | accessibilité | cibles tactiles de moins de 32 px, nombreuses | — | antérieur au chantier |
| REC-014 | P3 | finition + doc | petits chevauchements, un bandeau périmé, un conseil absurde ; `docs/TESTS.md` périmé | — | antérieur au chantier |

### REC-001 (P2) — Éditeur : « Rétablir » après un essai ou une vérification saute à un état faux ; l'historique disparaît après les deux

- **Reproduction** (clavier FR ou EN, 1280×720, profil neuf, tutoriel passé par « Passer » : l'éditeur est guidé) : Créer › Éditeur de circuits ; tuile **Départ**, un clic sur la scène ; tuile **Ligne droite**, bouton **➜ Prolonger** trois fois ; tuile **Arrivée**, **Prolonger** (5 pièces) ; **▶ Tester** ; **Échap** puis **Quitter** (retour à l'éditeur, 5 pièces) ; **↶ ×3** : 4, 3, 2 pièces ; **↷ ×3** : 3, 4, puis **1** pièce (attendu : 5).
- **Témoin** : exactement la même suite sans l'essai : ↶ ×3 donne 4, 3, 2 ; ↷ ×3 donne 3, 4, 5. Reproduit cinq fois (scripts de sonde ; la suite est dans `tools/recette/editeur.mjs` pour la partie annuler/rétablir avant essai).
- Après le faux rétablissement : ↶ donne 4, 3 ; ↷ redonne 4 : l'état « 5 pièces » n'est plus joignable par l'historique (la pièce Arrivée est à reposer). Rien n'est perdu sur disque ; c'est la pile « rétablir » qui est infidèle.
- **Même défaut au retour d'une vérification** (sans essai avant) : 5 pièces, **Vérifier et publier**, course, « Retour à l'éditeur » ; ↶ ×3 : 4, 3, 2 ; ↷ ×3 : 3, 4, puis **1**.
- **Après deux allers-retours** (Tester, Quitter, puis Vérifier et publier, « Retour à l'éditeur ») : **l'historique est vide** (`hIndex` 0, une seule entrée) : ↶ et ↷ n'ont plus aucun effet. C'est ce que fait un novice qui « pose, teste, vérifie, revient, annule » (`editeur.mjs`, les six configurations : « annuler » après la vérification laisse 9 pièces et le circuit « vérifié »).
- Lieu probable : la restauration de l'historique au retour d'essai, `js/editor.js` lignes 138-139 (le pas courant est remplacé par `history[0]` après que l'historique a été restauré ; au retour suivant, l'état quitté ne correspond plus à celui qu'on rouvre et l'historique est jeté). Écrit en 0.16.8 (`git blame` : commit `f8a93bb`).
- Pourquoi les tests passent : `test-browser-editeur` (TECH-034) vérifie que l'historique, le presse-papiers et les calques reviennent ; il n'enchaîne pas « annuler plusieurs fois puis rétablir jusqu'au bout après un essai ».

### REC-002 (P3) — Accueil, téléphone paysage : le sélecteur de langue est inaccessible sur « Connexion » et « Créer un compte »

- **Reproduction** : contexte tactile 844×390, ouvrir le jeu, toucher « Créer un compte » (ou « Connexion »).
- **Mesure** : `#welcome` est `position: fixed; display: flex; align-items: center; overflow: auto` ; la carte fait 628 px de haut pour 390 d'écran, son haut est à −120 px ; `scrollHeight` du conteneur 526, `scrollTop` 0 : le haut (boutons Français / English, logo, « Qui joue ? ») est au-dessus de l'écran et **aucun défilement n'y mène** (molette vers le haut : sans effet). Le bas est atteignable. L'onglet Invité tient (le sélecteur est visible).
- **Capture vue** : le haut de la carte coupé, « Qui joue ? » collé au bord supérieur.

### REC-003 (P3) — Fiche de circuit, téléphone paysage : le classement est sous la carte et seule une marge de 17 px fait défiler

- **Reproduction** : 844×390 tactile, Jouer › Carrière › premier circuit.
- **Mesure** : la carte (`touch-action: none`) et la barre « ▶ Jouer » occupent l'écran ; le classement (onglets Mondial / Secteurs / Personnel) est à y = 963 pour un écran de 390 ; les options de départ (Mon record, Fantôme or, catégories) et les records sont dessous. `#race-hub` défile (hauteur 1 431) mais **un glisser sur la carte ne le fait pas défiler** (zoom 1, `scrollTop` 0) ni un glisser sur « Jouer » ; seul un glisser sur la marge gauche de 17 px l'a fait (`scrollTop` 185). La molette sur la carte zoome.
- **Capture vue** : la légende (Départ, Arrivée, Checkpoints) passe sous la barre « Jouer ». Le portrait est conforme (colonne unique).
- Le même défaut sur la fiche du défi du jour et sur la fiche d'un circuit de la communauté (serveur simulé).

### REC-004 (P3) — Replay et Theater au tactile : les boutons de conduite restent affichés dessous

- **Reproduction** : 844×390 tactile, finir une course, « Revoir la course » (ou « Regarder » depuis la fiche).
- **Constaté** : ⟲, ↺, ❚❚ et ◀ ▶ ▼ ▲ restent visibles, **recouverts en partie par la barre du Theater** (`document.elementFromPoint` rend `div#theater`) et inutiles en lecture. Sur la capture, le bouton plein écran se superpose à la pastille « REPLAY ».

### REC-005 (P3) — Arrivée, téléphone paysage : le second rang de boutons est sous l'écran

- **Reproduction** : 844×390 tactile, profil neuf, première arrivée d'un circuit (niveau gagné, objectif bonus, conseils).
- **Mesure** : la carte d'arrivée fait 510 px pour 376 visibles et défile en interne ; « Revoir la course », « Partager mon fantôme », « Classement » et « Fiche du circuit » sont à y = 417 à 505 (écran 390). La molette les amène. Le toast « Niveau 2 ! » chevauche « Médaille obtenue : Or » (capture vue). `test-browser` annonce « toute la fenêtre tient sans défiler » pour 844×390 : il ne couvre pas ce cas chargé.

### REC-006 (P3) — Échap ne ferme pas « Importer un circuit » ni la fenêtre des salons

- **Reproduction** (clavier) : Créer › Importer un code (ou Multijoueur › Salons), le champ de texte a le focus, **Échap** : la fenêtre reste ouverte. Les fenêtres sans champ (Modes, Académie, Compétition, Avis) se ferment.
- **Cause lue** : `js/input.js` ignore tout `keydown` dont la cible est `INPUT`, `TEXTAREA` ou `SELECT`, y compris Échap (ligne de 49a39d7, avant le chantier). Reproduit dans les six configurations.

### REC-007 (P3) — Anglais : messages d'erreur réseau et de course restés en français

- Textes vus (capture ou lecture de la page) : « Leaderboard unavailable: **Serveur injoignable (connexion internet ?).** » (fiche, défi du jour, arrivée « 🌍 **Classement** : Serveur injoignable… ») ; « Community unavailable: **Pas de connexion internet.** » ; toasts « **Incident : retour au dernier checkpoint.** » et « **Une erreur est survenue : la course a été interrompue.** ». Le dictionnaire a une entrée pour « Serveur injoignable (connexion internet ?). » (`js/i18n/en/online.js` l. 424) mais le message est inséré dans une phrase composée et n'est pas traduit par morceaux.
- **Reproduction** : langue English, réseau coupé (ou jeu servi sans Supabase), ouvrir une fiche ou finir une course ; pour les toasts, lever une exception dans `session.update` pendant une course. Les deux toasts sont dans le code depuis 0.9.55 (`git log -S`, commit `697c4f8`) : défaut antérieur au chantier.

### REC-008 (P3) — Anglais : libellés d'écran restés en français

Vus en anglais : tuile « Défi du jour » avec le sous-titre « **nouveau** » (`js/app/screens.js` l. 46, `js/main.js` l. 390 ; **capture vue**) ; panneau Garage : « Sauvegardes — **code joueur, import, export** » ; Modes : « 🎯 Finir sans réapparition », « 🎯 Finir sans toucher de muret », « 🎯 Franchir l'arrivée en moto », « 🎯 1 réception parfaite » ; objectif bonus « ★ Finir en moins de 50.5 s » ; tutoriel sur téléphone, page 1 (**capture vue**) : « **Boutons ▲ / ▼ à droite**: accelerate / brake », « **Boutons ◀ ▶ à gauche : tourner** » ; garage : « 🔒 Terminer 10 mutations du day » (mélange), noms de préréglages et de collections (« Noël », « Été », « Bonnet de Père Noël · Sapins… »), outils de l'atelier « + Sphère », « + Cône » ; multijoueur : « ● connecté · 2 ms », « Manche 1/1 · … » ; carte communautaire « non vérifié » ; aide : touche « Échap / P ». Les noms de circuits français restent (contenu, voulu).

### REC-009 (P3) — Anglais : publication et messages de l'éditeur

Vus (captures) : boutons « **🌐 Publier** » dans « Track verified ✔ » et dans « Publish to the community » ; zone de description « **Ce qui rend ton circuit unique (200 caractères au plus)** » ; « Estimated difficulty: ◆◇◇◇◇ **Très facile** » ; titre « **Nouveau circuit ?** » (Fichier › Nouveau) ; messages « **Arrivée posée** », « **Ligne droite posée** », « **Aucune pièce où prolonger : pose d'abord le départ.** » ; aide : « Touches modifiables : Paramètres › Commandes. ». Le nom par défaut « Mon circuit » reste en français dans la phrase « …medal of “Mon circuit” », alors que l'en-tête dit « My track ».

### REC-010 (P3) — Anglais : format régional

La fiche du défi du jour (anglais) dit « Challenge of **25/11/2026** » (jour/mois/année) et « Race distance **1,7 km** » (virgule décimale). Les séparateurs sont mêlés même en français : la fiche dit « 2,9 km » et le conseil de l'arrivée « 0.23 s perdues ». Captures vues.

### REC-011 (P3) — Deux onglets : les réglages d'un onglet écrasent ceux de l'autre

- **Reproduction** : deux pages d'un même navigateur, même pseudo invité, toutes deux au menu ; page A : `settings.fovAdd = 7` puis `saveSettings()` ; page B (sans recharger, ou 2 s plus tard) : `settings.volume = 0.31` puis `saveSettings()` ; recharger A : `volume` 0,31, `fovAdd` 0. Même résultat avec 2 s d'écart (`fovAdd` 9 perdu, `volume` 0,22 gardé).
- Ce que la fusion de 0.16.10 couvre fonctionne (pièces +100 / +30 donnent 130 ; favoris ; records, §4 D3) : elle ne couvre pas les réglages.

### REC-012 (P3) — Portrait : l'invite « Tourne ton téléphone » recouvre tout

- En portrait, toute course démarre en pause sous « Tourne ton téléphone en mode paysage pour jouer. » ; les boutons Reprendre / Quitter de la pause sont dessous (capture vue : le menu de pause apparaît en filigrane sous le texte) ; l'**éditeur** est aussi recouvert, avec le même texte (« pour jouer »). Pour continuer, il faut pivoter (les parcours l'ont fait). Peut être voulu ; signalé parce qu'un joueur en portrait ne peut pas quitter une course sans pivoter.

### REC-013 (P3) — Cibles tactiles de moins de 32 px

- Mesure géométrique sur les écrans tactiles : cases à cocher de 13×13 (âge et règles, avis) à 20×20 (réglages), curseurs de 16 px de haut, liens légaux de 16 à 17 px, 73 boutons « 🏆 » de 35×21 dans la carrière, liens et boutons du pied de menu de 17 à 22 px. La règle WCAG 2.2 (2.5.8) fixe 24 px : les cases de 13 px y sont sous le seuil. Indicatif : aucun test d'accessibilité formel.

### REC-014 (P3) — Finition et documentation

- La bannière « Objectif : Finir sans toucher de muret… » de la leçon 1 déborde d'environ 18 px sur la mini-carte (1280×720, capture vue) ; la pastille « ◆ 0 / 3 » passe en partie sous la mini-carte (844×390, capture vue) ; pendant le Theater, le bandeau du haut dit « Pas encore de record » alors qu'on regarde « Mon record 48.292 » (capture vue) ; un conseil de l'arrivée dit « vitesse maxi 236 km/h contre 236 ».
- `docs/TESTS.md` dit « 127 fichiers de test » et « 193 scénarios » (réels : 136 + 5 contrôles ; 206).

### Constats écartés (vérifiés, pas des défauts)

- « L'objectif de la leçon 1 reste affiché dans la course suivante » : le texte reste dans l'élément du HUD mais est invisible (capture vue après la leçon) ; non retenu.
- « Aucune course hors ligne » : c'était un tutoriel qui s'ouvrait et mettait la course en pause (TECH-017) ; la course démarre hors ligne (§2.3).
- « Aucune confirmation en quittant l'éditeur avec une modification non enregistrée » : sonde menée à part (clavier FR) : après « Enregistrer » puis ↶ (la pastille passe à « Modifications non enregistrées (Ctrl + S) »), Fichier › Retour au menu ramène au menu sans fenêtre ; « Mes circuits » montre « 4 pièces · modifié le 25/11/2026 » et « Éditer » rouvre 4 pièces : la modification est gardée à la sortie, rien n'est perdu.
- Premier essai de D2 (« la modification n'invalide pas ») et premier essai de D3 (favoris, `fov`) : erreurs de mes scripts (annuler sans historique, favoris en chaînes, réglage inexistant), corrigées avant de conclure.
- Liens « ouvrir une demande » signalés « recouverts » dans la fenêtre Confidentialité en portrait : lien sur deux lignes dont le centre tombe entre elles ; faux positif de l'audit.

## 6. Ce que seul le propriétaire peut vérifier (impossible ici)

- **Vraie manette** : capture d'une liaison (TECH-006), A tenu à l'ouverture de la pause (TECH-005), navigation des menus, vibrations.
- **Vrai téléphone** : maintien tactile réel des pédales, multitouch, retour haptique, plein écran, orientation réelle, barre d'adresse mobile, zones de sécurité, verrouillage de l'écran, onglet masqué par le système, mémoire et chaleur sur des courses longues.
- **Son** : musique, effets, klaxons, suspension à l'arrière-plan.
- **Ressenti de conduite**, lisibilité à 60 images/s, sensations (le rendu logiciel de cette recette est à quelques images par seconde).
- **Supabase réel** : Auth (inscription, connexion, code de secours), limites de débit, `service_role`, `check-deployed` contre la production, publication et classements réels, saisons, duels, tournois ; les 270 contrôles SQL tournent sur un PostgreSQL local avec un faux schéma `auth`.
- **Realtime et WebRTC entre machines** : présence réelle, délai de retrait d'une connexion morte, coupures Wi-Fi, NAT, relais TURN, latence ; la recette n'a vu que deux onglets d'un même navigateur.
- **Firefox et Safari** : le script `test-browser-moteurs` ne tourne ici que sur Chromium.
- **Lecture humaine de l'anglais** : l'audit signale ce qui ressemble à du français ; il ne juge pas la qualité des traductions.

## 7. Non testé dans cette recette (possible ailleurs)

- Académie : leçons 2 à 6 et exercices évalués jouées (seuls le menu et les consignes de la leçon 1 ont été parcourus) ; modes : jeu d'un mode et bilan (couverts par `test-browser`, vert).
- Compétition : duels et tournois (serveur) ; amis (compte) ; abonnements ; commentaires et playlists de la communauté (serveur simulé couvert par `test-browser`).
- Création d'un compte réussie, connexion, changement de mot de passe, code de secours, synchronisation réelle : couverts par `test-browser-recuperation` (9 vérifications vertes), pas rejoués ici.
- Export vidéo, fantôme rival, lien de défi `#g=`, import d'un code : couverts par `test-browser`, non rejoués.
- Hors ligne, erreur de chargement, sans WebGL 2 : seulement au clavier (pas en téléphone paysage ni portrait) ; salons à deux onglets : seulement au clavier.
- Un second passage de `test:browser`, `test:deno` et `test:sql` (aucun échec à départager) ; Firefox / WebKit.
- L'annonce visible faite au joueur quand un nouveau record ne peut pas s'écrire (stockage plein, §4 D4).
- Achats du garage (le joueur neuf a 0 ◆).

## 8. Fichiers et reproduction

Scripts (commités) : `tools/recette/` — `journey.mjs`, `journey2.mjs`, `editeur.mjs`, `salons.mjs`, `horsligne.mjs`, `longue.mjs`, `interactions.mjs`, `quota.mjs`, `synthese.mjs`, `lib.mjs`, `README.md`. Les captures et les JSON de sortie restent dans `RECETTE_OUT` (par défaut `/tmp/recette`), **hors du dépôt**. Ils ne cassent pas `npm run lint` (vérifié).

```bash
# parcours : une configuration à la fois (langue fr|en, entrée kb|land|port)
RECETTE_OUT=/tmp/recette node tools/recette/journey.mjs fr kb
RECETTE_OUT=/tmp/recette node tools/recette/editeur.mjs en land
RECETTE_OUT=/tmp/recette node tools/recette/longue.mjs circuits
RECETTE_OUT=/tmp/recette node tools/recette/interactions.mjs d1
node tools/recette/quota.mjs
```

Les scripts de sonde ponctuels (REC-001 : annuler / rétablir autour d'un essai ; REC-002, REC-003, REC-005 : mesures de défilement sur téléphone) sont décrits dans les fiches ci-dessus ; leurs étapes de pose et d'annulation sont dans `editeur.mjs`.
