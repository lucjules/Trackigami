# Déployer : la procédure du propriétaire (une page)

Ordre imposé : **tests → base (SQL, à la main, si besoin) → fonctions `submit-score` et `ice` → contrôle d'empreinte (barrière) → site.**
Le workflow `.github/workflows/deploiement.yml` fait tout, sauf le SQL. **Constat du 22 novembre 2026** (liste des workflows du dépôt, lecture seule) : le site est publié
**depuis une branche** (workflow GitHub « pages-build-deployment »), donc **aujourd'hui le site et la fonction ne sont pas ordonnés** ; ce qui suit est à faire une fois.
Rien de ce document n'a été exécuté sur GitHub ni sur Supabase par l'auteur : chaque vérification ci-dessous est à lire par vous.

## À faire une fois (dans cet ordre)

1. **Secret** : Supabase › Account › Access Tokens › créer un jeton nommé « trackigami-deploiement ». Un jeton personnel Supabase donne, à ma connaissance, les droits de son compte
   (pas de portée par projet) : l'idéal est un compte Supabase dédié, membre de l'organisation avec le rôle le plus bas qui permet de déployer des fonctions (à vérifier dans le tableau de bord).
2. **Environnement** : GitHub › Settings › Environments › *New environment* `production` ; cocher **Required reviewers** (vous) ; restreindre aux branches `main` ;
   y ajouter le secret **`SUPABASE_ACCESS_TOKEN`** (Environment secrets, pas Repository secrets : seul un déploiement approuvé le lit).
3. **Essai à blanc** : Actions › *déploiement* › Run workflow, « à blanc » coché (défaut), branche `main`. Approuver. Attendu : tests verts, jeton accepté (liste des fonctions), constat de l'écart avec la production, « À BLANC : rien n'a été déployé ».
4. **Premier vrai déploiement** (Pages encore « depuis une branche ») : Run workflow, « à blanc » décoché. Le site n'est pas encore publié par ce workflow : l'étape `site` échouera tant que l'étape 5 n'est pas faite, c'est sans danger (les fonctions sont déjà déployées et vérifiées).
5. **Ordonner le site** : Settings › Pages › *Build and deployment* › Source **GitHub Actions** (au lieu de « Deploy from a branch »). Aussitôt après, relancer le workflow (étape 4) pour publier le site par Actions (je n'ai pas pu vérifier si l'ancien contenu reste en ligne entre les deux : relancer sans attendre).
6. **Protection de branche** (recommandé) : exiger la tâche `gate` de *tests*, comme l'indique `test.yml`.
7. Facultatif : variable `VERIFIER_BASE` = `oui` (Settings › Secrets and variables › Actions › Variables) pour la vérification hebdomadaire de la base (secret `SUPABASE_DB_URL`, le même que `sauvegarde.yml`). Sans la variable, rien ne tourne ; à la main : Actions › *vérification de la base*.

## Ensuite, à chaque version

Fusionner sur `main` → le workflow démarre → **approuver** l'environnement `production` → fonctions déployées → barrière → site. Durée : celle des tests (~20 min) + quelques minutes.

## À lire au premier vrai déploiement

- Tâche `serveur` : « jeton accepté » (liste des fonctions) ; les deux `functions deploy` terminent sans erreur ; la CLI peut exiger un `supabase/config.toml` : si elle échoue pour cette raison, rien n'est publié, ajouter un fichier minimal (`project_id`).
- **Barrière** : « Barrière franchie » avec l'empreinte du résumé du travail. Contrôle indépendant : `node tools/check-deployed.mjs` en local (« empreinte de build identique »).
- Tableau de bord Supabase › Edge Functions : `submit-score` et `ice` ont une nouvelle version, **Verify JWT toujours activé** (le workflow ne passe jamais `--no-verify-jwt`).
- `ice` n'a pas d'empreinte : seule la réussite du déploiement (et sa version dans le tableau de bord) le prouve.
- Un temps envoyé depuis le site publié est accepté (classement mondial).

## Si la barrière échoue

Le site n'est **pas** publié : les joueurs gardent l'ancien site, dont la physique est celle de l'ancienne fonction si elle est restée. Lire les lignes `ÉCART`, relancer le workflow (relançable sans danger). Retour arrière : redéployer l'ancien `index.ts` (historique Git) et relancer.

## Fenêtre résiduelle (inévitable)

Les pages déjà ouvertes gardent l'ancien code jusqu'au rechargement (le service worker récupère la mise à jour au prochain chargement) : après un changement de `PHYS_VER`, leurs temps sont refusés (« ton jeu n'est plus à jour, recharge la page »). Dans l'autre sens, un site déjà publié avant sa fonction affiche « le serveur est en cours de mise à jour, réessaie dans quelques minutes » ; le record reste sur l'appareil. Avec ce workflow la seconde fenêtre disparaît pour le site publié par Actions ; la première demeure.
