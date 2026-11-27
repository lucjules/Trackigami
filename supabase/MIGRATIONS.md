# Migrations et déploiements : ordre, dépendances, vérification, retour arrière

Ce document ne dit **pas** ce qui est appliqué en production : seul le projet Supabase le sait. Il dit dans quel ordre appliquer, comment **le prouver**, et comment revenir en arrière.
Tant qu'une vérification ci-dessous n'a pas été faite et lue par quelqu'un, une migration n'est **pas** « appliquée » et une fonction n'est **pas** « déployée ».

## État de la production (constaté le 19 novembre 2026)

Constat en **lecture seule** par le connecteur Supabase (`verify-prod.sql` et requêtes de contrôle) : les étapes **1 à 17, 15b comprise, sont
appliquées** (aucune ligne `MANQUE` ni `ÉCART`) ; `submit-score` déployée en `PHYS_VER` 38, son build identique au dépôt de la 0.12.3.
Étape **18** (`etape18-maintenance.sql`) : **appliquée le 19 novembre 2026** avec l'accord de l'éditeur (connecteur Supabase, migration
`etape18_maintenance`). Vérifié aussitôt : lignes « étape 18 » conformes (search_path 5/5, fonctions de déclencheur fermées, aucune clé étrangère
sans index, aucune règle RLS qui évalue `auth.uid()` par ligne, aucune table sans clé primaire, fonctions ouvertes sans session = la liste attendue),
tâche `virelo-purge` active ; conseils Supabase : plus de `search_path` mutable, d'index manquant, d'`auth_rls_initplan` ni de table sans clé ;
première purge à la main (4 compteurs anti-abus périmés effacés, rien d'autre) ; lectures publiques du jeu inchangées ; `tools/surveillance.mjs` sans alerte.
Reste signalé par Supabase, voulu : fonctions `security definer` appelables (c'est l'API du jeu), sessions anonymes (le mode invité), tables sans
règle RLS (fermées à tous) ; à faire par l'éditeur : la protection contre les mots de passe divulgués.
Les paragraphes historiques plus bas (« rien n'a été exécuté sur la production ») datent d'avant ce constat.

**À faire, versions 0.16.4 et 0.16.5 (`PHYS_VER` 39)** : la fonction `submit-score` régénérée dans le dépôt (`npm run build:function`) n'est **pas** déployée ; celle en ligne rejoue `PHYS_VER` 38 et refusera les temps de ces versions. La 0.16.5 change encore la physique sous le même `PHYS_VER` 39 (réception sur ruban, GAME-004), ce qui n'est permis que parce que la 0.16.4 n'a jamais été en ligne : déployer la fonction de la **0.16.5** (ou d'une version plus récente), jamais celle de la 0.16.4 seule. Ordre fonction → site (`docs/DEPLOIEMENT.md`), puis `node tools/check-deployed.mjs` (empreinte de build identique, `physVer` 39). Aucune étape SQL.

## Procédure de mise à jour complète (production)

**Rien de ce document n'a été exécuté sur la production par l'auteur de ce dépôt** : l'environnement de développement n'y accède pas. L'audit indépendant a constaté sur le projet réel : `submit-score` en version 23 avec `PHYS_VER` 31 (le jeu est en 33), `ice` en version 3 ; absents : `rate_hits`, `rate_check`, `track_binds`, `submit_best`, `publish_track`, `author_verified` ; présents : `submit_rate`, `submit_rate_check` (verrou par joueur seulement, pas de limite globale exacte), `scores_limit` (simple `COUNT`). Ce n'était PAS tout à fait l'état « étapes 1 à 14 » : la lecture de la base réelle (phase 8, comparaison objet par objet, corps de fonction par corps de fonction, droits et politiques, à une base de référence montée avec les étapes 1 à 14) a montré que **les étapes 7 (fantômes) et 8 (titres, circuits de la semaine) n'avaient jamais été jouées** (`scores.ghost`, `ghost_veh`, `has_ghost`, `players.title`, `get_ghost`, `set_title`, `trending_tracks` absents) et que `track_comments_list` était une **ancienne édition** de l'étape 13 (sans le titre de l'auteur). Tout le reste (130 objets, 65 fonctions, droits, politiques, contraintes, index, déclencheurs) était identique. Or `submit_best` (étape 15) écrit dans `scores.ghost` : lancer l'étape 15 seule aurait donné une fonction créée mais en échec à chaque temps soumis. Ne jamais supposer qu'une étape est appliquée parce que son fichier existe : `verify-prod.sql` contrôle maintenant aussi les étapes 7, 8 et 13.

Chaque étape ci-dessous a une **vérification** : tant qu'elle n'a pas été lue, l'étape n'est pas faite. Aucune étape ne supprime de donnée. En cas de doute, s'arrêter et revenir en arrière (section « Retour arrière »).

| Étape | Action | Vérification (à lire) | Si la vérification échoue |
|---|---|---|---|
| 0 | **État des lieux** : coller `supabase/verify-prod.sql` dans le SQL Editor ; lancer `node tools/check-deployed.mjs` | Les lignes `MANQUE` / `ÉCART` doivent être celles attendues AVANT l'étape 15 (liste ci-dessus). Une autre différence = la base n'est pas dans l'état supposé : **ne rien appliquer** | Comprendre l'écart d'abord |
| 1 | **Sauvegarde** : Supabase > Database > Backups (ou `pg_dump` des tables `scores`, `tracks`, `players`) | Une sauvegarde datée existe et se télécharge | Ne pas continuer |
| 1b | **Rattrapage, seulement si `verify-prod.sql` montre `MANQUE` sur les lignes des étapes 7 / 8 / 13** : dans l'ordre `etape7-fantomes.sql`, `etape8-decouverte.sql`, `etape13-communaute.sql` (elle remplace `track_comments_list`), `etape14-securite.sql` (elle pose les droits de `players.title`) : chacune relançable, aucune ne supprime de donnée | Relancer `verify-prod.sql` : plus aucun `MANQUE` sur ces lignes ; les droits sont ceux de la base de référence (voir `tools/test-accounts-sql.sh`) | Elles ne s'annulent pas (colonnes et fonctions ajoutées, sans effet tant que personne ne s'en sert) ; s'arrêter et comprendre |
| 2 | `etape15-backend.sql` (SQL Editor) : relançable, ne supprime rien ; **compatible avec l'ancienne fonction serveur** ; **suppose les étapes 7 et 8 jouées** (`submit_best` écrit `ghost`) | Relancer `verify-prod.sql` : plus aucun `MANQUE` ; seules les lignes « APRÈS 15b » et « info » restent | `etape15-retour.sql` |
| 3 | Redéployer **`submit-score`** (`npm run build:function`, puis `supabase/functions/submit-score/index.ts`) | `node tools/check-deployed.mjs` : `physVer` = 33 (= `js/version.js`), actions `submit` + `publish-track` | Redéployer l'ancien fichier (historique Git) |
| 4 | Redéployer **`ice`** (`supabase/functions/ice/index.ts`) ; secrets TURN inchangés | `check-deployed.mjs` : `ice` répond 401 sans session ; avec une session de test : 200 et `ttl` 3600 | Redéployer l'ancien fichier |
| 5 | **Essai de bout en bout** avec un compte de test : une course validée (record enregistré, rang renvoyé) et une publication de circuit (circuit créé, `author_verified` vrai) | La ligne apparaît dans `scores` / `tracks` ; `submit-score` journalise sans erreur | Retour arrière (étapes 3-4), pas encore 15b |
| 6 | Mettre en ligne le jeu **0.9.58 ou plus** (PHYS_VER 33) | Un joueur peut publier et courir | Remettre le jeu précédent |
| 7 | `etape15b-publication-verifiee.sql` | `verify-prod.sql` : la ligne « APRÈS 15b » passe à `ok` ; essai : une publication par l'ancienne voie (insertion directe) est refusée | `grant insert on public.tracks to authenticated;` |
| 8 | **Vérification finale** | `verify-prod.sql` : **aucune** ligne `MANQUE` ni `ÉCART` ; `check-deployed.mjs` : « aucun écart constaté » | Corriger avant d'annoncer quoi que ce soit |

### Compatibilité avec les anciennes versions du jeu

| Version du jeu | Après les étapes 2 à 6 | Après 15b (étape 7) |
|---|---|---|
| ≤ 0.9.57 (PHYS_VER ≤ 32) | **Ne peut plus enregistrer de temps** : la nouvelle `submit-score` refuse une autre version de physique (422, « recharge le jeu ») ; ses records locaux et ses fantômes restent | Idem ; **ne peut plus publier** de circuit (plus d'insertion directe) |
| 0.9.58 ou plus (PHYS_VER 33) | Tout fonctionne | Tout fonctionne |
| Records déjà en base avec `phys_ver` 31 | Conservés ; un temps de physique 33 les remplace (même plus lent), un temps d'une physique plus ancienne ne remplace jamais un record plus récent ; les classements n'affichent qu'une version de physique à la fois | — |
| Circuits publiés avant l'étape 15 | Conservés ; leur temps auteur reste **non vérifié** (`author_verified` faux) jusqu'à ce que leur auteur les republie | — |

Avant l'étape 6, laisser un temps de cohabitation n'est pas possible pour les temps : une seule version de physique est vérifiée à la fois par `submit-score` (c'est voulu : une course ne se rejoue que sur la physique qui l'a produite).

## Ordre

| # | Quoi | Où | Dépend de | Compatible avec l'ancienne fonction serveur ? |
|---|---|---|---|---|
| 1 | `etape1` … `etape14` (une fois chacune, dans l'ordre) | SQL Editor | rien | — |
| 2 | **`etape15-backend.sql`** | SQL Editor | étapes 1 à 14 | **oui** : à lancer AVANT de redéployer `submit-score` |
| 3 | Redéployer **`submit-score`** (`supabase/functions/submit-score/index.ts`) | Edge Functions | étape 15 | — (la nouvelle fonction refuse de travailler sans l'étape 15 : 503) |
| 4 | Redéployer **`ice`** (`supabase/functions/ice/index.ts`) | Edge Functions | étape 15 | — (idem : 503 sans l'étape 15 ; 500 si `SUPABASE_URL` / clé de service manquent) |
| 5 | Mettre en ligne le jeu **0.9.54** ou plus | hébergement du site | 3 | — |
| 6 | **`etape15b-publication-verifiee.sql`** | SQL Editor | 2, 3 **et** 5 | **non** : les anciens clients ne peuvent plus publier |

Ne jamais lancer 6 avant 3 et 5. Les étapes 2 et 6 sont **relançables sans danger** (idempotentes) et ne **suppriment aucune donnée**.

Puis, **dans l'ordre**, les étapes **16** (`etape16-durcissement.sql`, droits : voir « Audit 0.9.59 »), **17**, **18**, **19**, **20**, **21**, **22** et **23** (une section chacune ci-dessous, de la plus récente à la plus ancienne) : chacune est relançable et ne supprime aucune donnée en s'appliquant ; la 17 suppose les étapes 1 à 15 (la 16 recommandée), la 18 les étapes 1 à 17, la 19 la 18, la 20 les étapes 1 à 19, la 21 les étapes 1 à 20, la 22 les étapes 1 à 21 et la 23 les étapes 1 à 22. En tout, `supabase/` contient 25 fichiers `etape*.sql` : les étapes 1 à 23, plus `etape15b-publication-verifiee.sql` et `etape15-retour.sql` (retour arrière de l'étape 15).

### 0.24.0 (chapitre d'une traite, COMPLETE-014) : AUCUNE étape SQL, mais la fonction `submit-score` est À REDÉPLOYER

Nouvelle action `submit-chain` (contrat : `docs/CHAPITRE-D-UNE-TRAITE.md`). Elle écrit par `submit_best` **inchangée** dans `scores` (clé `ch-…` ≤ 80 caractères, temps < 3 600 s, commandes ≤ 400 000 caractères, 6 temps intermédiaires : tout tient déjà dans les contraintes de la table) et compte sa cadence par `rate_check` (étape 15) sous le nom `chain` : aucune table, colonne, fonction ni droit à ajouter. **Seul le redéploiement de la fonction** (`npm run build:function` déjà fait dans le dépôt ; le workflow de déploiement, puis `node tools/check-deployed.mjs`) est nécessaire ; tant qu'il n'est pas fait, l'ancienne fonction répond « Action inconnue. » et le jeu le dit (« le serveur n'accepte pas encore les enchaînements ») en gardant le record sur l'appareil. Retour arrière : redéployer la fonction précédente ; les lignes `ch-…` déjà écrites restent inertes (aucune autre fonction ne les lit autrement qu'un classement).

### Étape 23 (amorces officielles, rival juste devant, boîte de réception, 0.23.0, COMPLETE-010, COMPLETE-015) : `etape23-amorces.sql`

**À appliquer À LA MAIN par le propriétaire du projet** (SQL Editor) : **rien n'a été exécuté sur la production** par l'auteur de ce dépôt ; elle n'est donc **pas** « appliquée » tant que le propriétaire n'a pas lancé `verify-prod.sql` ET lu ses lignes « étape 23 ». **Les amorces ne sont pas non plus en base** : il faut les produire et les envoyer avec l'outil `tools/seed-officiels.mjs` et la clé de service (ci-dessous).
Pré-requis : étapes 1 à 22 (elle lit `scores`, `players`, `duels` (12), `seasons` / `division_history` (11), `follows` (10), `tracks`). **Relançable ; ne supprime ni ne modifie aucune donnée en s'appliquant** (une table, un index, deux règles, trois fonctions ; `tools/test-etape23-sql.sh` compare l'empreinte de huit tables avant et après). **Compatible avec le jeu actuel** : le jeu d'avant ne lit rien de tout cela ; le jeu 0.23.0 marche SANS elle (pas d'amorce, pas de rival en ligne, boîte de réception « indisponible », sans fausse donnée). **Aucun redéploiement de fonction serveur** : `submit-score` n'est pas touchée (le build du dépôt est identique).

**Principe** : les amorces sont dans une table **séparée** de `scores`. Aucune fonction de classement, de saison, de duel, de tournoi ni de rang ne la lit (`verify-prod.sql` le contrôle, ligne « étape 23 : aucune fonction de la base ne lit official_runs ») : places, points, divisions et Elo des joueurs ne la voient pas. Le jeu les affiche étiquetées « Officiel · automatique » (ou « Officiel · testeur »), sans numéro de place.

| Objet | Rôle | Droits |
|---|---|---|
| `official_runs` | une ligne par circuit de la carrière (clé `b-…` sans variante), version de physique, source (`auto` : pilote automatique ; `testeur`) et niveau (`bronze`, `argent`, `or`, `cristal` ; un identifiant pour un testeur) : temps, commandes, fantôme, temps intermédiaires, version de l'outil | RLS activée ; **lecture publique de toutes les colonnes SAUF `inputs`** (les commandes) ; écriture : **`service_role` seulement** (règle explicite) ; aucun droit d'écriture pour `anon` ni `authenticated` |
| `rival_ahead(k, pv, t)` | le record vérifié le plus proche **strictement** devant le temps `t` (un ex æquo n'est pas devant), dont le fantôme existe ; jamais l'appelant ; renvoie place, pseudo, temps, fantôme | `anon` et `authenticated` (lecture publique : afficher ne crée aucun joueur, TECH-031) ; ajoutée à `PUBLIC_RPC` (`js/online.js`) |
| `inbox_summary(depuis)` | en **une** requête, au plus **20** éléments concernant **l'appelant** depuis `depuis` (borné à 30 jours) : battu sur un circuit (jamais sous la clé d'un duel en cours), duels qui l'attendent et réglés, nouvelle saison, fin d'une saison où il a couru, circuits des auteurs suivis (non masqués) | `authenticated` seulement (jamais `anon`) |

**Ordre d'application** (jamais l'inverse) : 1. `verify-prod.sql` (état avant : lignes « étape 23 » en `MANQUE` ; **`MANQUE`/`ÉCART` ailleurs = s'arrêter**) ; 2. sauvegarde (Database › Backups) ; 3. `etape23-amorces.sql` ; 4. `verify-prod.sql` : **toutes** les lignes « étape 23 » à `ok` (la ligne d'info dit « aucune amorce ») ; 5. publier le jeu 0.23.0 ; 6. **produire les amorces, sur sa machine** : `node tools/seed-officiels.mjs --out amorces.json` (hors ligne, environ 25 s ; déterministe : deux calculs donnent le même fichier ; il dit les niveaux écartés, par exemple un bronze que le pilote automatique ne sait pas tenir) ; 7. **les envoyer avec la clé de service** : `SUPABASE_URL=https://… SUPABASE_SERVICE_ROLE_KEY=… node tools/seed-officiels.mjs --send amorces.json --dry` (vérifie sans rien envoyer), puis la même commande sans `--dry` (chaque course est revérifiée par `verifyRun` avant l'envoi ; « upsert » : relancer remplace) ; 8. `verify-prod.sql` : la ligne d'info donne le nombre d'amorces (333 sur 84 circuits attendues en `PHYS_VER` 39) ; 9. vérifier dans le jeu (ci-dessous). **Après un changement de `PHYS_VER`** : refaire 6 et 7 (le jeu ne lit que les amorces de sa physique ; les anciennes restent sans gêner, ou se suppriment par `delete from official_runs where phys_ver < …;`). **Testeurs** (plus tard) : avec leur **accord écrit** (leur pseudo devient public, étiqueté « Officiel · testeur »), ajouter `--testeurs codes.txt` (leurs codes de fantôme « SHG1: », un par ligne) à l'étape 6.

**Vérifications de production attendues** (à lire par le propriétaire ; rien de ceci n'a été constaté) :

| Vérification | Attendu |
|---|---|
| `verify-prod.sql`, lignes « étape 23 » | `ok` ×3 (table et droits, fonctions et droits, aucune fonction qui lit les amorces) ; la ligne d'info donne les amorces par version de physique |
| `select has_table_privilege('authenticated', 'public.official_runs', 'insert'), has_column_privilege('anon', 'public.official_runs', 'inputs', 'select'), has_column_privilege('anon', 'public.official_runs', 'ghost', 'select'), has_function_privilege('anon', 'public.inbox_summary(timestamp with time zone)', 'execute'), has_function_privilege('anon', 'public.rival_ahead(text,integer,double precision)', 'execute');` | `f, f, t, f, t` |
| `verify-prod.sql`, « fonctions appelables SANS session hors liste » | `ok` (`rival_ahead` est dans la liste attendue) |
| Dans le jeu, sans être connecté, fiche d'un circuit de la carrière | les lignes « Officiel · automatique (…) » sont dans le classement mondial, sans numéro, « hors classement » ; les places des joueurs ne bougent pas ; dans l'onglet réseau, aucune requête `/auth/v1/signup` |
| Une saison close après l'étape | `select * from division_history where season = …` : identique à ce qu'aurait donné la base sans amorces (aucune fonction ne les lit ; démontré par `tools/test-etape23-sql.sh` sur deux bases) |
| Boîte de réception avec un compte | le bouton « 📬 » du menu montre le nombre de nouveautés ; une seule requête `inbox_summary` à l'arrivée au menu, aucune sans session |

**Retour arrière** (aucune donnée de joueur n'est touchée) : fermer les lectures : `revoke select on public.official_runs from anon, authenticated;` (le jeu n'affiche alors plus d'amorce), `revoke execute on function public.rival_ahead(text,int,double precision) from anon, authenticated;` (plus de rival en ligne : le jeu se rabat sur les amorces, ou rien), `revoke execute on function public.inbox_summary(timestamptz) from authenticated;` (la boîte dit « indisponible ») ; les amorces peuvent être effacées sans conséquence pour les joueurs (`delete from official_runs;` : elles ne servent à aucun calcul). Test : `tools/test-etape23-sql.sh` (`npm run test:sql`, PostgreSQL 16 requis).

### Étape 22 (outils de modération dans le jeu, 0.22.0, COMPLETE-004) : `etape22-moderation.sql`

**À appliquer À LA MAIN par le propriétaire du projet** (SQL Editor) : **rien n'a été exécuté sur la production** par l'auteur de ce dépôt ; elle n'est donc **pas** « appliquée » tant que le propriétaire n'a pas lancé `verify-prod.sql` ET lu ses lignes « étape 22 ».
Pré-requis : étapes 1 à 21 (elle utilise `moderators` et `is_moderator` de l'étape 13, les signalements des étapes 1, 13 et 17). **Relançable ; ne supprime ni ne modifie aucune donnée en s'appliquant** (deux tables, une colonne `comment_reports.created_at` laissée à `NULL` pour l'existant, trois index, quatorze fonctions, six déclencheurs ; `tools/test-etape22-sql.sh` compare l'empreinte de dix tables avant et après). **Compatible avec le jeu actuel** : le jeu d'avant ne connaît pas l'écran de modération et marche comme avant ; le jeu 0.22.0 marche SANS l'étape (l'écran de modération n'apparaît alors pour personne). Elle **redéfinit `mod_hide`** (étape 13), à l'identique pour l'appelant mais journalisée : **relancer `etape13-communaute.sql` APRÈS l'étape 22 remet l'ancienne `mod_hide`, sans journal** (relancer alors l'étape 22).

**Principe** : la sécurité est dans la base. Chaque fonction `mod_*` commence par `if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.'`, avant toute lecture ou écriture ; l'écran du jeu n'est qu'une commodité.

| Objet | Rôle | Droits |
|---|---|---|
| `mod_status()` | « suis-je modérateur ? » pour l'appelant, jamais pour un autre identifiant (vrai / faux) : le jeu n'affiche l'écran que si la base répond vrai | `authenticated` seulement |
| `mod_queue(k, st, lim, off)` | la file : circuits et commentaires signalés ou masqués, avec compteurs, 100 lignes au plus par appel ; « à examiner » = signalé depuis la dernière décision d'un modérateur | `authenticated` ; refuse tout non-modérateur |
| `mod_detail(k, tid)`, `mod_reports(k, tid)` | la fiche d'un contenu (texte public, compteurs, auteur, suspension en cours, décisions déjà prises) ; ses signalements : date et « compté » ou non, **jamais qui a signalé** | idem |
| `mod_set_track_hidden(t, hide, why)`, `mod_set_comment_hidden(c, hide, why)` | masquer / rétablir, **motif de 3 à 300 caractères obligatoire**, journalisé ; ne supprime rien | idem |
| `mod_suspend(u, why, until_at)`, `mod_unsuspend(u, why)`, `mod_suspensions(active_only, lim, off)` | suspendre (fin facultative : sinon jusqu'à réactivation, 10 ans au plus) / réactiver / lister ; pas soi-même, pas un modérateur | idem |
| `mod_log(k, tid, lim, off)` | le journal : qui, quoi, sur quoi, quand, pourquoi | idem |
| `mod_hide(kind, target, hide)` | l'ancienne fonction de l'étape 13 (circuits, commentaires, modes), même signature, désormais journalisée (motif générique) | idem |
| `moderation_apply_hide`, `moderation_active_suspension`, `moderation_suspension_guard` | fonctions internes (écriture commune, état d'une suspension, déclencheur) | **aucun** rôle de l'API |
| `moderation_log` | une ligne par décision ; ne référence les personnes que par `actor` et `target_user`, mis à `NULL` à la suppression du compte | RLS activée, aucun droit pour `anon` ni `authenticated`, aucune règle |
| `account_suspensions` | une ligne par suspension (motif, début, fin, levée par qui et pourquoi) | idem |

**Ce que fait une suspension** : un déclencheur refuse, pour un compte suspendu, **publier** un circuit (par la fonction serveur comme par toute autre voie), un mode ou une playlist, **modifier le nom ou la description** d'un circuit, et **commenter**. Elle **ne touche pas** aux temps (un nouveau temps s'enregistre), aux classements, aux fantômes, à la sauvegarde, aux amis, aux duels, ni aux contenus déjà publiés (les masquer est une autre décision). Une suspension échue ne bloque plus sans que personne n'ait à la lever. Le pseudo, lui, se change toujours (écriture directe de `players.name` : hors du périmètre).

**Ordre d'application** (jamais l'inverse) : 1. `verify-prod.sql` (état avant : lignes « étape 22 » en `MANQUE` ; **`MANQUE`/`ÉCART` ailleurs = s'arrêter**) ; 2. sauvegarde (Database › Backups) ; 3. `etape22-moderation.sql` ; 4. `verify-prod.sql` : **toutes** les lignes « étape 22 » à `ok` ; 5. **ajouter un modérateur** (`supabase/COMPTES.md`, « Ajouter un modérateur ») et vérifier avec son compte que le bouton « 🛡 Modération » apparaît dans la Communauté, et **pas** avec un autre compte ; 6. facultatif : redéployer `submit-score` (`npm run build:function`) pour qu'un compte suspendu qui publie reçoive son message au lieu de « Enregistrement impossible. » (sans cela, la publication est refusée tout de même, le joueur voit le message générique).

**Vérifications de production attendues** (à lire par le propriétaire ; rien de ceci n'a été constaté) :

| Vérification | Attendu |
|---|---|
| `verify-prod.sql`, lignes « étape 22 » | `ok` ×4 (tables fermées, droits des 11 + 3 fonctions, contrôle de modérateur en tête de chaque fonction, garde de suspension branchée) ; la ligne d'info donne le nombre de modérateurs, de suspensions en cours et de décisions au journal |
| `select has_function_privilege('anon', 'public.mod_queue(text,text,integer,integer)', 'execute'), has_function_privilege('authenticated', 'public.mod_queue(text,text,integer,integer)', 'execute'), has_table_privilege('authenticated', 'public.moderation_log', 'select'), has_function_privilege('authenticated', 'public.moderation_apply_hide(text,text,boolean,text,boolean)', 'execute');` | `f, t, f, f` |
| `verify-prod.sql`, « fonctions appelables SANS session hors liste » | `ok` (aucune fonction `mod_*` pour `anon`) |
| Avec un compte qui n'est PAS modérateur : Communauté | pas de bouton « 🛡 Modération » ; dans l'onglet réseau, une seule requête `mod_status` (réponse `false`) |
| Avec un compte modérateur : masquer un circuit signalé (motif écrit), puis `select * from moderation_log order by id desc limit 5;` (clé de service ou SQL Editor) | la ligne y est (qui, quoi, motif) ; le circuit n'apparaît plus dans la liste publique mais existe toujours dans `tracks` (`hidden` vrai) |
| Suspendre un compte de test, puis essayer de commenter avec lui | refus « Compte suspendu : publier et commenter est impossible jusqu'au … » ; son temps d'un circuit officiel s'enregistre toujours ; réactivé, il commente |
| Conseils Supabase (*Advisors*) | seulement les fonctions `security definer` appelables (c'est l'API du jeu : les `mod_*` refusent les non-modérateurs) |

**Retour arrière** (aucune donnée n'est touchée ; le journal et les suspensions déjà écrits restent dans leurs tables) : lever le blocage des suspensions par `drop trigger moderation_suspension_guard on public.tracks, public.track_comments, public.community_modes, public.playlists` (un `drop trigger ... on` par table) et `drop trigger moderation_suspension_guard_upd on public.tracks` / `... on public.playlists` ; fermer l'écran : `revoke execute on function public.mod_status() from authenticated;` (le jeu cache alors le bouton) ; retrouver l'ancienne `mod_hide` sans journal en relançant `etape13-communaute.sql` puis `etape17-securite.sql`. Test : `tools/test-etape22-sql.sh` (`npm run test:sql`, PostgreSQL 16 requis).

### Étape 21 (code de secours : récupérer un compte sans courriel, 0.16.13, COMPLETE-003) : `etape21-recuperation.sql`

**À appliquer À LA MAIN par le propriétaire du projet** (SQL Editor) : **rien n'a été exécuté sur la production** par l'auteur de ce dépôt ; elle n'est donc **pas** « appliquée » tant que le propriétaire n'a pas lancé `verify-prod.sql` ET lu ses lignes « étape 21 ».
Pré-requis : étapes 1 à 20 ; extension pgcrypto (schéma `extensions`, présente par défaut sur Supabase ; l'étape la crée sinon). **Relançable ; ne supprime ni ne modifie aucune donnée en s'appliquant** (trois tables et six fonctions ajoutées ; `tools/test-etape21-sql.sh` compare l'empreinte de chaque table avant et après). **Compatible avec le jeu et les fonctions actuels** : à lancer **avant** de déployer `account-recovery` et de publier le jeu 0.16.13. Le jeu 0.16.13 fonctionne AVEC ou SANS elle (sans elle, le code de secours est absent et rien n'est proposé).

| Objet | Rôle | Droits |
|---|---|---|
| `recovery_codes` | un haché `bcrypt(SHA-256(code))` par compte (contrainte : seul un haché bcrypt entre), date, réservation en cours | RLS activée, aucun droit pour `anon` ni `authenticated` |
| `recovery_throttle` | compteurs d'échecs et verrous, clés = empreintes (pseudo saisi, adresse) ou `global` | idem |
| `recovery_log` | journal minimal : date, compte s'il existe, issue (jamais de code, d'empreinte, d'adresse ni de pseudo inconnu) ; 30 jours | idem |
| `recovery_code_new()` | crée / remplace le code (renvoyé UNE fois) ; exige une authentification par mot de passe de moins de 10 min (`amr`) | comptes connectés seulement |
| `recovery_status()` | `{ account, has_code, created_at, used_at }` de SON compte, jamais le haché | comptes connectés seulement |
| `recovery_begin / finish / abort / purge` | essai de récupération, consommation + révocation des sessions, levée d'une réservation, nettoyage | `service_role` seulement (fonction `account-recovery`) |

**Ordre d'application** (jamais l'inverse) : 1. `verify-prod.sql` (état avant : lignes « étape 21 » en `MANQUE` ; **`MANQUE`/`ÉCART` ailleurs = s'arrêter**) ; 2. sauvegarde (Database › Backups) ; 3. `etape21-recuperation.sql` ; 4. `verify-prod.sql` : **toutes** les lignes « étape 21 » à `ok` ; 5. déployer `account-recovery` (workflow `deploiement.yml`, ou `npm run build:function` puis `supabase/functions/account-recovery/index.ts`) ; 6. `node tools/check-deployed.mjs` : « account-recovery : empreinte de build identique » ; 7. publier le jeu 0.16.13 ; 8. essai de bout en bout et vérifications de `COMPTES.md` (« À vérifier sur un VRAI projet »).

**Vérifications de production attendues** (à lire par le propriétaire ; rien de ceci n'a été constaté) :

| Vérification | Attendu |
|---|---|
| `verify-prod.sql`, lignes « étape 21 » | `ok` ×3 (tables fermées, droits des fonctions, pgcrypto) ; la ligne d'info donne le nombre de comptes sans code (tous, juste après l'étape) |
| `select has_table_privilege('anon', 'public.recovery_codes', 'select'), has_table_privilege('authenticated', 'public.recovery_codes', 'select'), has_function_privilege('anon', 'public.recovery_code_new()', 'execute'), has_function_privilege('authenticated', 'public.recovery_begin(text,text,text)', 'execute');` | `f, f, f, f` |
| `verify-prod.sql`, « fonctions appelables SANS session hors liste » | `ok` (aucune fonction `recovery_*` pour `anon`) |
| Conseils Supabase (*Advisors*) | seulement les fonctions `security definer` appelables (c'est l'API du jeu : `recovery_code_new`, `recovery_status`) |
| `select count(*) from recovery_codes where code_hash is not null and code_hash !~ '^\$2'` | `0` (aucun code en clair) |

**Retour arrière** (aucune donnée de joueur n'est touchée) : `revoke execute on function public.recovery_code_new(), public.recovery_status() from authenticated;` ferme la création et l'affichage de l'état ; la fonction `account-recovery` répondrait encore, retirer aussi `revoke execute on function public.recovery_begin(text,text,text) from service_role;` (elle répond alors `503`) ; les tables et leurs lignes peuvent rester (fermées à tous). Rien n'est à défaire côté jeu : sans les fonctions, le code de secours disparaît des écrans. Test : `tools/test-etape21-sql.sh` (`npm run test:sql`) et `tools/test-securite-sql.sh` (elle rejoue les attaques sur la base après l'étape 21).

### Étape 20 (droits suivis, règles du jeu et de la base alignées, 0.16.12) : `etape20-droits-et-regles.sql`

**À appliquer À LA MAIN par le propriétaire du projet** (SQL Editor) : **rien n'a été exécuté sur la production** par l'auteur de ce dépôt ; elle n'est donc **pas** « appliquée » tant que le propriétaire n'a pas lancé `verify-prod.sql` ET lu ses lignes « étape 20 » et « lisibilité ».
Pré-requis : étapes 1 à 19. **Relançable ; ne supprime ni ne modifie aucune donnée en s'appliquant** (un grant et deux fonctions remplacées : `tools/test-etape20-sql.sh` compare l'empreinte de chaque table avant et après). **Compatible avec le jeu et la fonction serveur actuels** : à lancer **avant** de redéployer `submit-score` et de publier le jeu 0.16.12. Elle ne suppose aucun redéploiement : le jeu 0.16.12 fonctionne AVEC ou SANS elle (classement sans fantômes ni véhicule tant qu'elle manque), et la fonction `submit-score` actuelle fonctionne avec la nouvelle base.

Ce qu'elle fait (justification de chaque droit, dans l'en-tête du fichier) :

| Identifiant | Changement | Moindre privilège |
|---|---|---|
| `TECH-021` | `grant select (ghost_veh) on scores to anon, authenticated` : le classement mondial demande cette colonne depuis l'étape 7, aucune étape ne l'accordait (l'étape 5 ne liste que les colonnes d'origine) | UNE colonne, en lecture ; `scores.inputs` (les commandes) et `scores.ghost` restent illisibles ; rien de nouveau n'est exposé (`get_ghost`, ouverte à `anon`, renvoie déjà `ghost_veh` d'un classement public) |
| `TECH-076` | `close_season` clôt après la **fin de la saison + 600 s** (`SEASON_GRACE_MS` de `js/seasons.js`) au lieu de la fin | aucun droit changé (toujours réservée au serveur, via `close_due_seasons`) ; une saison déjà close le reste |
| `TECH-081` | `submit_best` lie l'empreinte forte d'un circuit de joueur à la clé de **base** (avant « ~ ») : les variantes d'une clé liée le sont avec elle | aucun droit changé (toujours réservée au serveur) ; les anciennes lignes de variantes de `track_binds` restent, sans effet |

**Ordre d'application** (jamais l'inverse) : 1. `verify-prod.sql` (état avant : lignes « étape 20 » et « lisibilité » en `ÉCART`, **`MANQUE`/`ÉCART` ailleurs = s'arrêter**) ; 2. sauvegarde (Database › Backups) ; 3. `etape20-droits-et-regles.sql` ; 4. `verify-prod.sql` : **toutes** les lignes « étape 20 » et « lisibilité (TECH-021) » à `ok`, la ligne d'info « squat de variante » lue ; 5. redéployer `submit-score` (`npm run build:function` puis `supabase/functions/submit-score/index.ts`, ou le workflow de déploiement) : **requis pour TECH-079** (dates de défi du jour) ; 6. publier le jeu 0.16.12 ; 7. si le workflow `verification-base.yml` est activé : vider `ECARTS_ATTENDUS` (il tolérait l'écart de `ghost_veh`).

**Vérifications de production attendues** (à lire par le propriétaire ; rien de ceci n'a été constaté) :

| Vérification | Attendu |
|---|---|
| `verify-prod.sql`, 6 lignes « lisibilité (TECH-021) » | `ok` (avant l'étape : `ILLISIBLES : ghost_veh` sur `scores`, pour `authenticated` et `anon`) ; `scores.inputs` et `scores.ghost` « aucune lisible » |
| `verify-prod.sql`, lignes « étape 20 » | `close_season` « grâce de 600 s » ; `submit_best` « clé de base » ; le décompte des squats de variante est une **info** (voir ci-dessous) |
| `verify-prod.sql`, « fonctions appelables SANS session hors liste » | `ok` (l'étape 20 ne crée aucune fonction) |
| `select has_column_privilege('anon', 'public.scores', 'ghost_veh', 'select'), has_column_privilege('authenticated', 'public.scores', 'ghost_veh', 'select'), has_column_privilege('anon', 'public.scores', 'inputs', 'select');` | `t, t, f` |
| Dans le jeu 0.16.12, classement d'un circuit joué : | boutons 👻, titres et véhicule affichés ; la requête du haut du classement réussit **du premier coup** dans l'onglet réseau du navigateur (avant : une requête refusée en 403, puis une relecture plus pauvre) |
| Dans le jeu, ouvrir Classement puis Communauté **sans** avoir jamais joué en ligne (navigation privée) | aucune requête `/auth/v1/signup` ; **Authentication › Users** : aucun nouvel utilisateur anonyme créé par la seule lecture |
| Fin de saison (lundi 00:00 UTC) | une course finie à 00:05 compte dans les points ; `select * from seasons` : la saison n'est close qu'à partir de 00:10 ; `division_history` la contient |
| Export des données (Profil › Sauvegardes) | la table `scores` est un tableau (plus une erreur), `track_likes` présente, `server.omitted` liste ce qui n'est pas exporté |

**Squats de variante déjà présents** (`TECH-081`) : avant l'étape 20, quelqu'un qui disposait d'une collision de la signature de 32 bits pouvait lier une clé de variante (`u-…~v1.veh-moto`) à une autre empreinte que celle de sa base. L'étape 20 empêche tout NOUVEAU cas mais **ne supprime rien** : la ligne d'info de `verify-prod.sql` compte les variantes de `track_binds` dont l'empreinte diffère de celle de leur base (attendu : 0 ; sur la production, jamais constaté ici). S'il y en a, le propriétaire décide (modération, hors périmètre) ; leurs temps éventuels restent dans `scores`.

**Retour arrière** (aucune donnée n'est touchée dans aucun sens) : `revoke select (ghost_veh) on public.scores from anon, authenticated;` rétablit la lecture d'avant (le jeu retombe sur le repli) ; relancer `etape11-saisons.sql` remet `close_season` d'avant (clôture à l'heure) ; relancer `etape17-securite.sql` remet `submit_best` d'avant (liaison par variante). **Relancer l'étape 11 ou 17 APRÈS la 20 annule la correction correspondante** (relancer alors l'étape 20). Test : `tools/test-etape20-sql.sh` (`npm run test:sql`) et `tools/test-securite-sql.sh` (elle rejoue les attaques après l'étape 20, exécute pour de bon sous les rôles du jeu les lectures publiques, l'export et le classement).

### Étape 19 (avis des testeurs, 0.13.0) : `etape19-avis.sql`

Pré-requis : étape 18 (elle redéfinit `purge_expired` et `health_report` en y ajoutant les avis). **Relançable ; ne supprime aucune donnée en
s'appliquant.** Ce qu'elle fait : table `feedback` (RLS activée, fermée à tous : seul le tableau de bord ou le connecteur la lit), fonction
`submit_feedback(jsonb)` ouverte sans session (valeurs bornées comme le formulaire, adresses web retirées des textes, 5 avis par installation et par
jour, 300 par heure en tout : au-delà, elle renvoie 0 sans erreur), avis de plus de 12 mois dans la purge nocturne, `feedback_24h` dans
`health_report`. Test : `tools/test-etape19-sql.sh` (`npm run test:sql`) ; les attaques de `test-securite-sql.sh` sont rejouées après elle.

| Étape | Action | Vérification (à lire) | Si elle échoue |
|---|---|---|---|
| 19.0 | `verify-prod.sql` | La ligne « étape 19 » dit `MANQUE` (avant) ; rien d'autre | Comprendre l'écart d'abord |
| 19.1 | `etape19-avis.sql` (SQL Editor, ou le connecteur Supabase) | `verify-prod.sql` : ligne « étape 19 » à `ok`, « fonctions appelables SANS session hors liste » à `ok` ; conseils Supabase : rien de nouveau hors `submit_feedback` (security definer appelable, voulu) | Retour arrière ci-dessous |
| 19.2 | Mettre en ligne le jeu 0.13.0 (formulaire « Donner mon avis ») | Un avis envoyé depuis le jeu apparaît dans `feedback` ; `node tools/surveillance.mjs` affiche « 1 avis de testeurs sur 24 h » | Remettre le jeu précédent (le formulaire disparaît, la table reste) |

**Retour arrière** : `revoke execute on function public.submit_feedback(jsonb) from anon, authenticated;` ferme l'envoi ; la table et ses avis
peuvent rester (fermés à tous, purgés à 12 mois). Relancer `etape18-maintenance.sql` remet la purge et la santé de l'étape 18 (sans les avis).

### Étape 18 (maintenance avant la 1.0, 0.12.5) : `etape18-maintenance.sql`

Pré-requis : étapes 1 à 17. **Relançable ; ne supprime aucune donnée en s'appliquant** (les purges ne tournent qu'à l'heure dite). Ce qu'elle fait :
`search_path` fixé sur 5 fonctions, fonctions de déclencheur fermées à l'API (elles se déclenchent toujours), un index par clé étrangère, 16 règles
RLS réécrites avec `(select auth.uid())` (mêmes conditions), clé primaire sur `rate_hits` et `submit_rate`, tables `client_errors`,
`maintenance_log` et `scores_archive`, fonctions `log_errors` et `health_report` (ouvertes), `purge_expired` et `archive_old_scores` (réservées
au serveur), extension `pg_cron` activée et purge planifiée chaque nuit (tâche `virelo-purge`). Détail : en-tête du fichier ; exploitation :
[docs/EXPLOITATION.md](../docs/EXPLOITATION.md). Test : `tools/test-etape18-sql.sh` (`npm run test:sql`, 33 contrôles, et les 73 attaques de
`test-securite-sql.sh` rejouées après elle).

| Étape | Action | Vérification (à lire) | Si elle échoue |
|---|---|---|---|
| 18.0 | `verify-prod.sql` | Les lignes « étape 18 » disent `ÉCART` / `MANQUE` (avant) ; rien d'autre | Comprendre l'écart d'abord |
| 18.1 | `etape18-maintenance.sql` (SQL Editor, ou le connecteur Supabase) | `verify-prod.sql` : lignes « étape 18 » à `ok`, la ligne « purge nocturne » montre `virelo-purge 17 3 * * *` ; conseils Supabase (*Advisors*) : plus de `search_path` mutable, d'index de clé étrangère manquant, de règle `auth_rls_initplan`, de table sans clé primaire | Voir « retour arrière » |
| 18.2 | `select public.purge_expired();` une fois à la main | Renvoie les nombres effacés ; une ligne dans `maintenance_log` | Lire l'erreur, ne pas relancer en boucle |
| 18.3 | Mettre en ligne le jeu 0.12.5 (remontée des erreurs) | `node tools/surveillance.mjs` : `health_report` lu, aucune alerte | Remettre le jeu précédent (rien ne dépend du jeu côté base) |

**Retour arrière** (aucune donnée de joueur n'est touchée) : `select cron.unschedule('virelo-purge');` arrête la purge ; les tables et fonctions
ajoutées peuvent rester (inertes sans le jeu 0.12.5). Les index, clés primaires et règles réécrites n'ont pas à être défaits (mêmes conditions).

### Étape 17 (sécurité, phase 5) : `etape17-securite.sql`

**Rien de ceci n'a été exécuté sur la production** (voir `docs/AUDIT-PHASE5-SECURITE.md`). Pré-requis : étapes 1 à 15 (la 16 est recommandée, voir plus bas) ; 15b indifférente. **Aucune donnée supprimée**, aucune signature de fonction changée : **compatible avec le jeu et la fonction serveur actuels**, donc à lancer **avant** de redéployer `submit-score` (qui, lui, n'exige pas l'étape 17).

| Étape | Action | Vérification (à lire) | Si elle échoue |
|---|---|---|---|
| 17.0 | `supabase/verify-prod.sql` (lecture seule) | Les lignes « étape 17 » doivent dire `MANQUE` (avant) ; aucune autre différence inattendue | Comprendre l'écart d'abord |
| 17.1 | **Sauvegarde** (Database › Backups, ou `pg_dump` des tables `scores`, `tracks`, `players`, `cloud_saves`) | Une sauvegarde datée existe | Ne pas continuer |
| 17.2 | **Étape 16** si `verify-prod.sql` ne la voit pas appliquée (ligne « anon sans aucune écriture directe » en `ÉCART`) : `etape16-durcissement.sql` (uniquement des `REVOKE`) | La ligne passe à `ok` | `grant` correspondants (en-tête du fichier) |
| 17.3 | `etape17-securite.sql` (SQL Editor) | `verify-prod.sql` : toutes les lignes « étape 17 » à `ok` ; lignes « fonctions appelables SANS session hors liste », « anon sans écriture », « RLS partout » à `ok` | Retour arrière ci-dessous |
| 17.4 | Redéployer **`submit-score`** puis **`ice`** (`npm run build:function`, puis `supabase/functions/<nom>/index.ts`) | `node tools/check-deployed.mjs` : `physVer` 35, actions `submit` + `publish-track` | Redéployer l'ancien fichier (historique Git) |
| 17.5 | Mettre en ligne le jeu 0.9.64 (CSP) | Un joueur se connecte, joue, voit les classements et la police | Remettre le jeu précédent |

Ce que corrige l'étape 17 (détail, preuves et gravité : `docs/AUDIT-PHASE5-SECURITE.md`) : `report_track` ne rétablit plus un circuit masqué par la modération (et ne compte que les comptes, jamais l'auteur) ; `mode_played` une partie par pilote et par heure (table `mode_plays`) ; `is_moderator` / `is_account` fermées au jeu ; `log_runs` plafonds horaire (20 000) et quotidien (100 000) ; 100 circuits publiés par auteur au plus ; budget de 40 Mo de fantômes par pilote (le record est toujours écrit) ; compteurs exacts sous concurrence (`toggle_like`, signalements) ; `settle_due`, `close_due_seasons`, `in_tournament` réservées aux sessions ; `random_track` borné.

**Retour arrière de l'étape 17** (aucune donnée n'est touchée ; `mode_plays` reste) : relancer, dans l'ordre, les fichiers qui définissaient ces objets avant (tous relançables) : `etape1-communaute.sql` (`tracks_rate_limit`, `toggle_like`), `etape5-securite.sql` (`report_track`), `etape11-saisons.sql` (`close_due_seasons`), `etape12-competition.sql` (`settle_due`, `in_tournament`), `etape13-communaute.sql` (`mode_played`, `is_moderator`, `is_account`, `random_track`, `comment_report`, `mode_report`), `etape14-securite.sql` (`log_runs`), `etape15-backend.sql` (`submit_best`). **Relancer l'un d'eux APRÈS l'étape 17 annule la correction correspondante** (relancer alors l'étape 17).

**Réglages à vérifier dans le tableau de bord Supabase** (aucun n'est dans le dépôt) : longueur minimale du mot de passe 8 (Authentication › Policies) ; CAPTCHA sur les connexions anonymes et les inscriptions ; *Allow anonymous sign-ins* activé ; *Confirm email* désactivé (voulu) ; schémas exposés par l'API : `public` seulement ; variables des fonctions : `ALLOWED_ORIGIN` (adresse du jeu), `TURN_*` pour `ice`. Jeton d'accès personnel du 10 novembre : à révoquer.

**Tests** : `npm run test:sql` (PostgreSQL requis : `tools/test-securite-sql.sh` rejoue les attaques sous les rôles du jeu avec les droits par défaut de Supabase ; `AVANT=1` les rejoue sans l'étape 17 et doit y voir les failles) ; `node tools/test-submit-handler.mjs`, `node tools/test-ice.mjs`, `node tools/test-securite-client.mjs` (inclus dans `npm test`).

### Ce que fait l'étape 15 (`etape15-backend.sql`)

- `rate_hits` + `rate_check(...)` : limitation de cadence **persistante** (en base), **partagée** entre les instances, **atomique** (verrou par type de limite : le compte du pilote et le compte global sont exacts même avec des appels simultanés), avec un plafond global et un sous-plafond pour les sessions anonymes. `submit_rate_check` (étape 14) devient une enveloppe de `rate_check` : l'ancienne fonction serveur continue de fonctionner.
- `scores_limit` : verrou par pilote (2 insertions simultanées à 1 999 lignes ne donnent plus 2 001) et **ne bloque plus l'amélioration d'un temps existant** à 2 000 lignes.
- `submit_best(...)` : écriture **atomique** du meilleur temps (un temps moins bon, ou d'une physique plus ancienne, ne remplace jamais le record, même avec deux soumissions simultanées) ; le fantôme et les temps intermédiaires sont ceux de la course retenue. Elle lie aussi un circuit de joueur (`u-…`) à une **empreinte SHA-256** (`track_binds`) : la signature du jeu n'a que 32 bits, on pouvait fabriquer un autre circuit de même clé.
- `tracks` : insertion directe limitée par colonnes (plus de `created_at`, `picked_at`, `plays`, `likes`, `reports`, `hidden`, `author_verified`) ; colonne `author_verified` ; `publish_track(...)` (réservée à la fonction serveur) : seule voie qui pose un temps d'auteur **rejoué**.

### Ce que fait l'étape 15b

`revoke insert on public.tracks from authenticated` : plus aucun circuit n'entre dans la base sans passer par le rejeu de la course de l'auteur.

## Déploiement automatique : base → fonction → site

Depuis la 0.16.3, les fonctions se déploient par `.github/workflows/deploiement.yml` (procédure, secret et réglages : [docs/DEPLOIEMENT.md](../docs/DEPLOIEMENT.md)). **Ordre : 1. étape SQL (à la main, SQL Editor, compatible avec l'ancienne fonction) ; 2. fonctions `ice`, `submit-score` puis `account-recovery` (0.16.13) ; 3. barrière `tools/check-deployed.mjs` ; 4. site.** Le site n'est publié que si la barrière passe. **Fenêtre résiduelle inévitable** : les pages déjà ouvertes gardent l'ancien code jusqu'au rechargement ; si `PHYS_VER` change, leurs temps sont refusés (message : « ton jeu n'est plus à jour, recharge la page »). Un site publié AVANT sa fonction (publication par branche, ou fonction pas encore à jour) affiche « le serveur est en cours de mise à jour, réessaie dans quelques minutes ».
Cette automatisation n'a jamais tourné sur GitHub ni sur Supabase : tant qu'un déploiement n'a pas été lu et vérifié par le propriétaire, la procédure manuelle ci-dessous reste valable.

### Contrôle des droits de lecture (TECH-021)

`verify-prod.sql` contient des lignes « lisibilité (TECH-021) » : `has_column_privilege` sur les colonnes que le jeu lit (`scores` : track_key, player, time, phys_ver, track_name, updated_at, has_ghost, ghost_veh, splits ; `players` : name, title), pour `authenticated` et `anon`, et sur celles qu'il ne doit pas lire (`scores.inputs`, `scores.ghost`).
Elles contrôlent les **droits**, pas l'existence : une colonne présente mais illisible est ce qui dégradait le classement mondial. **Un ÉCART « ILLISIBLES : ghost_veh » sur `scores` signifie que l'étape 20 n'est pas appliquée** : le jeu 0.16.12 fonctionne quand même (repli sans cette colonne, une requête de plus la première fois), mais sans véhicule dans le classement. Ne pas le « corriger » par un `grant` improvisé : lancer `etape20-droits-et-regles.sql`. La tâche optionnelle `verification-base.yml` (désactivée par défaut) tolère cet écart tant que `ECARTS_ATTENDUS` n'est pas vidé ; le vider quand l'étape 20 est appliquée et lue.
Les tests (`tools/test-securite-sql.sh`) exécutent les mêmes lectures pour de bon sous les rôles `anon` et `authenticated` ; ils échouent si une colonne que le jeu demande n'est pas lisible.

## Déployer les fonctions (à la main, si le workflow n'est pas en service)

```bash
npm run build:function
```

Colle ensuite le contenu de `supabase/functions/submit-score/index.ts`, de `supabase/functions/ice/index.ts` et (0.16.13) de `supabase/functions/account-recovery/index.ts` dans les fonctions du même nom (Supabase > Edge Functions ; `account-recovery` exige l'étape SQL 21). `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies par Supabase ; `ice` en a besoin (elle **refuse** de répondre sans elles). Réglage facultatif : `ALLOWED_ORIGIN` (restreint les appels navigateur au site du jeu).

## Preuves observables (à lancer par toi, résultat à lire)

Le plus simple : `supabase/verify-prod.sql` (lecture seule, une ligne par vérification, statut `ok` / `MANQUE` / `ÉCART` / `info`) et `node tools/check-deployed.mjs`. Les requêtes ci-dessous détaillent les mêmes contrôles à la main.

**1. Étape 15 appliquée.** Dans le SQL Editor :

```sql
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('rate_check', 'submit_best', 'publish_track', 'submit_rate_check', 'scores_limit') order by 1;
-- attendu : les 5 lignes
select prosrc like '%pg_advisory_xact_lock%' as plafond_verrouille from pg_proc where proname = 'scores_limit';
-- attendu : t
select has_table_privilege('authenticated', 'public.rate_hits', 'select') as lisible_par_le_jeu;
-- attendu : f
```

**2. Étape 15b appliquée (ou non).**

```sql
select has_table_privilege('authenticated', 'public.tracks', 'insert') as insertion_directe;
-- avant 15b : t ; après 15b : f
select has_column_privilege('authenticated', 'public.tracks', 'created_at', 'insert') as created_at_libre;
-- après 15 : f
```

**3. Version de physique réellement déployée dans `submit-score`** (sans authentification, rien de secret) :

```bash
curl -s "https://<projet>.supabase.co/functions/v1/submit-score" -H "apikey: <clé publique>"
```

Attendu : `{"ok":true,"service":"submit-score","physVer":34,… (33 tant que la fonction de la 0.9.58 est en ligne),"actions":["submit","publish-track"]}`. `physVer` doit être égal à `PHYS_VER` de `js/version.js` ; l'absence de `actions` signifie que l'**ancienne** fonction est encore en ligne.

**4. `ice` refuse sans session** (la clé publique seule ne donne plus de relais) :

```bash
curl -s -X POST "https://<projet>.supabase.co/functions/v1/ice" -H "apikey: <clé publique>" -H "Authorization: Bearer <clé publique>"
```

Attendu : `401` `{"error":"Non connecté."}`.

## Retour arrière

1. `supabase/etape15-retour.sql` (relançable) : rétablit le déclencheur de l'étape 5, `submit_rate_check` de l'étape 14 et l'insertion directe des circuits (annule aussi l'étape 15b), et retire `submit_best`, `publish_track`, `rate_check`. **Aucune donnée supprimée** : `rate_hits`, `track_binds` et `tracks.author_verified` restent ; leur suppression éventuelle est en commentaire à la fin du fichier, à décider à part.
2. Redéployer l'ancienne fonction `submit-score` (la version d'avant, depuis l'historique Git) : la nouvelle ne fonctionne plus sans l'étape 15.
3. Remettre en ligne l'ancien jeu (il publie par insertion directe, rétablie à l'étape 1).

L'ancienne fonction `ice` ne demande rien à l'étape 15 : elle peut rester.

## Journal des opérations réellement faites sur la production

**10 novembre 2026** (accès : API de gestion Supabase avec un jeton d'accès personnel, fourni par le propriétaire du projet pour cette opération ; **à révoquer** sur supabase.com/dashboard/account/tokens). Chaque étape a été vérifiée avant la suivante ; tout SQL a d'abord été rejoué sur une copie locale reproduisant la production (identique à la photo de la base réelle, avec ses 187 temps réels) :

| # | Opération | Preuve |
|---|---|---|
| 0 | Lecture seule : `verify-prod.sql`, audit des étapes 1 à 14 objet par objet, corps de fonction par corps de fonction, droits, politiques, contraintes | Seules les étapes 7 et 8 et l'édition de `track_comments_list` différaient de la référence |
| 1 | Sauvegarde logique des tables `players`, `scores`, `tracks`, `submit_rate` et photo des droits, politiques, déclencheurs et fonctions (aucune sauvegarde automatique : plan sans) | 11 / 187 / 14 / 2 lignes, **conservée hors dépôt** (données de joueurs) |
| 2 | Étapes 7, 8, 13 (corrigée), 14 | Photo de la production = photo de la base de référence « étapes 1 à 14 » : aucune différence |
| 3 | Étape 15 | Photo = référence « étapes 1 à 15 » : aucune différence ; `verify-prod.sql` : plus aucun `MANQUE` ni `ÉCART` |
| 4 | Déploiement de `ice` (v3 → v4) puis `submit-score` (v23 → v24), `verify_jwt` conservé | `check-deployed.mjs` : `physVer` 33, actions `submit` et `publish-track`, limites annoncées ; `ice` 401 sans session |
| 5 | Essai de bout en bout (session invité jetable, vraie course rejouée, publication) : **a trouvé le défaut du profil (403)** | Corrigé (étape 15 relancée) ; second essai : 20 vérifications sur 21 ; la 21e (`ice` avec session) répond 501 « Aucun relais TURN configuré » : **attendu**, aucun relais n'est paramétré (le jeu garde son STUN) |
| 6 | Retrait des lignes de test, par identifiant exact | Retour à 11 joueurs / 187 temps / 14 circuits, 0 session de test restante |

**Pas encore fait** : l'étape 15b (voir l'ordre : après la mise en ligne du jeu 0.9.58) ; les circuits publiés avant l'étape 15 (14 sur 14) gardent un temps auteur **non vérifié** jusqu'à ce que leur auteur les republie.

## Audit 0.9.59 (11 novembre 2026) : lecture seule de la production, étape 16 proposée

Accès : API de gestion Supabase en **lecture seule** (`read_only: true`, rôle `supabase_read_only_user`, transaction en lecture seule) : aucune écriture, aucune migration, aucun déploiement.

- `verify-prod.sql` : 35 lignes, aucun `MANQUE` ni `ÉCART` ; étape 15b **toujours non appliquée** (publication directe encore possible sur 8 colonnes : un temps auteur peut être affirmé sans rejeu) ; 14 circuits sur 14 au temps auteur non vérifié ; temps par version de physique : 24 : 48 · 25 : 25 · 26 : 101 · 27 : 9 · 28 : 2 · 31 : 2 · 33 : 2.
- Sécurité au niveau des lignes active sur les **27** tables ; 24 politiques, aucune écriture ouverte au rôle `anon`. `scores` : le jeu ne lit que `track_key, player, time, phys_ver, track_name, updated_at, splits, has_ghost` (ni `inputs` ni `ghost`) ; `get_ghost` renvoie des poses, jamais des commandes : on ne peut pas rejouer la course d'un autre sous son nom.
- **Droits de table par défaut de Supabase encore présents** (tout accordé à `anon` et `authenticated`) sur `accounts`, `cloud_saves`, `track_likes`, `track_plays`, `track_reports`, et en écriture pour `anon` sur `players` et `tracks`. Rien n'est exposé (RLS le refuse), mais c'est une seule barrière. → `supabase/etape16-durcissement.sql` (**proposée, non appliquée** ; uniquement des `revoke` ; `npm run test:sql` vérifie les droits obtenus et 14 parcours du jeu identiques avant et après).
- Réglages Auth relevés : longueur minimale du mot de passe **6** côté serveur (le jeu en exige 8 : à aligner dans Authentication › Policies), confirmation d'e-mail automatique (voulu : pas d'e-mail), sessions anonymes actives (30 par heure et par adresse), pas de captcha.
- Fonctions : `submit-score` v24 et `ice` v4, `verify_jwt` actif, `physVer` 33.
- **`PHYS_VER` 34 (jeu 0.9.59)** : après la mise en ligne du jeu, redéployer `submit-score` (`npm run build:function`, puis coller `supabase/functions/submit-score/index.ts`). Tant que ce n'est pas fait, le serveur répond « Version du jeu différente » : les records restent sur l'appareil et pourront être envoyés ensuite depuis le classement.

## Ce qui n'est pas vérifié ici

Le SQL est testé sur un PostgreSQL local (`npm run test:sql`, dont des **sessions simultanées** réelles), les fonctions contre un faux Supabase avec la vraie vérification de course : ces tests ne voient PAS les droits effectifs du rôle `authenticated` à travers PostgREST (c'est ce qui a laissé passer le défaut du profil, voir le journal). Ce qui a été éprouvé sur le projet réel le 10 novembre 2026 : la chaîne session invité → profil → course rejouée → record → fantôme, la publication à temps auteur vérifié, et les refus des écritures directes (journal ci-dessus). **Non éprouvé** : la tenue sous charge réelle (limites de débit de la plateforme, instances multiples de la fonction), l'étape 15b, un compte avec e-mail (sauvegarde cloud), le multijoueur avec relais TURN. L'état de la production n'est connu que par les preuves ci-dessus.
