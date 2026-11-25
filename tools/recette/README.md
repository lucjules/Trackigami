# Recette de stabilisation (phase 21)

Scripts de **constat** : ils pilotent le jeu dans un vrai Chromium (Playwright, WebGL logiciel) et écrivent ce qu'ils voient. Ils ne font pas partie de `npm test` / `npm run test:browser`, ne corrigent rien et ne modifient aucun fichier du jeu. Ils respectent les règles ESLint du dépôt (`npm run lint` les parcourt).

Les captures et les JSON restent **hors du dépôt** : `RECETTE_OUT` (par défaut `/tmp/recette`).

| Script | Ce qu'il fait |
| --- | --- |
| `journey.mjs <fr\|en> <kb\|land\|port>` | parcours d'un nouveau joueur : accueil, tutoriel, première course guidée, chaque entrée de menu, onglets du profil / de la progression / des réglages, carrière, fiche de circuit, course, pause (toutes les entrées), arrivée, replay, Theater, garage (chaque famille) |
| `journey2.mjs <langue> <entrée>` | joueur installé : réassigner une touche puis courir, modes, Académie, défi du jour, communauté (réseau coupé puis serveur simulé), changement de langue en cours de route, erreur de course, compte invité |
| `editeur.mjs <langue> <entrée>` | l'éditeur par un joueur novice : poser un circuit complet, annuler / rétablir, tester, vérifier, modifier, enregistrer, quitter, revenir par « Mes circuits », publier sans réseau |
| `salons.mjs <fr\|en>` | salons multijoueur à deux onglets (`?net=local`) |
| `horsligne.mjs <fr\|en>` | vrai service worker puis réseau coupé, navigateur sans WebGL 2, module du jeu injoignable |
| `longue.mjs circuits\|echant\|gele\|masque\|tout` | sessions longues : 12 circuits × 2 courses avec retours au menu et au garage ; course échantillonnée ; onglet « masqué » puis page gelée 10 minutes |
| `interactions.mjs d1\|d2\|d3\|tout` | course en direct avec retours au checkpoint puis chemin du serveur (3 circuits) ; circuit publié → modifié → vérifié ; deux onglets sur le même profil |
| `quota.mjs` | sauvegarde cloud simulée (faux Supabase en Node) sous quota de stockage serré |
| `synthese.mjs [dossier]` | regroupe les JSON des parcours |

`lib.mjs` : audit d'un écran dans la page (boutons recouverts ou hors écran, texte brut `NaN` / `undefined`, texte français en anglais, cibles tactiles), gestes (clic souris réel ou toucher réel après vérification du point visé), fin de course par le pilote automatique.

Entrées : `kb` = clavier + souris (1280×720), `land` = téléphone simulé en paysage (844×390), `port` = téléphone simulé en portrait (390×844 ; le script tourne l'écran en paysage pour courir ou éditer, comme le fait le joueur devant l'invite « Tourne ton téléphone »).

Limites : l'audit « non traduit » repose sur l'heuristique du jeu (`looksFrench`) plus une liste de mots français ; il peut manquer un mot isolé ou signaler un nom de contenu (circuit, objet) : chaque constat du rapport a été confirmé à la lecture du code ou sur une capture. Aucune vraie manette, aucun vrai téléphone, aucun son.
