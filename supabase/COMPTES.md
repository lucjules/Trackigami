# Comptes et sauvegarde cloud : installation et fonctionnement

Le jeu propose deux façons de jouer, choisies sur l'écran d'accueil (le menu n'apparaît qu'après) :

- **Invité** : un pseudo pour la session ; la progression reste dans le navigateur de l'appareil.
- **Compte** : pseudo + mot de passe ; progression, circuits créés et records sont sauvegardés dans le cloud et se
  retrouvent depuis n'importe quel appareil en se connectant. Les « Player » et « Pilote » par défaut n'existent plus.

## Installation (5 minutes, une seule fois)

1. **SQL** : Supabase > *SQL Editor* > *New query*, coller `supabase/etape4-comptes.sql`, *Run* (après les étapes 1 à 3).
2. **Auth** : *Authentication > Sign In / Providers > Email* : activer Email, **désactiver « Confirm email »**
   (les adresses sont techniques, aucun e-mail n'est envoyé). Garder *Allow anonymous sign-ins* activé (les invités
   s'en servent déjà pour la communauté). *Minimum password length* : 8.
3. **Test** : lancer le jeu, *Créer un compte*, puis se connecter avec le même pseudo depuis un autre navigateur.

### Si la création de compte répond « le serveur refuse les comptes… »

Les comptes utilisent des adresses techniques `pseudo@accounts.copytrack.invalid`. Certains projets Supabase refusent
les domaines qui ne peuvent pas recevoir de courrier (erreur `email_address_invalid`). Dans ce cas, choisir un domaine
accepté par votre projet (par exemple un domaine à vous) et le changer **aux deux endroits** :
`ACCOUNT_EMAIL_DOMAIN` dans `js/account.js` et la valeur `'accounts.copytrack.invalid'` dans la fonction
`handle_new_account()` de `etape4-comptes.sql` (puis relancer le script). Configurer un SMTP personnalisé dans
Supabase lève aussi cette vérification. Aucun e-mail n'est jamais envoyé à ce domaine.

## Sécurité

- **Mots de passe** : jamais stockés par le jeu ni dans les tables du projet. Ils transitent en HTTPS vers Supabase Auth,
  qui ne garde qu'un **hachage bcrypt salé** (`auth.users.encrypted_password`, un sel aléatoire par mot de passe).
  Réimplémenter un hachage maison serait moins sûr : c'est volontairement délégué à Auth.
- **Pseudo unique** sans tenir compte de la casse, créé par un déclencheur à l'inscription (on ne peut pas s'inscrire
  avec un pseudo et en réserver un autre). Un invité ne peut pas prendre le pseudo d'un compte.
- **Sauvegarde** (`cloud_saves`) : lisible et modifiable par son seul propriétaire (RLS). Chaque écriture porte un numéro
  de version : le jeu ne peut pas écraser une version qu'il n'a pas lue (deux appareils : lecture, fusion, nouvel essai).
- La clé `service_role` ne doit jamais figurer dans le jeu. Le jeu n'utilise que la clé publique.
- **Pas d'e-mail** : la récupération par courriel de Supabase Auth est impossible (le pseudo n'est pas une adresse). Depuis 0.16.13 (COMPLETE-003),
  un compte se récupère avec son **code de secours** (section « Changer et récupérer son mot de passe » plus bas) ; sans ce code, un mot de passe
  perdu reste un compte inaccessible.
- Limites d'essais : celles de Supabase Auth (page *Authentication > Rate Limits*). Rien de plus n'est ajouté ici.
- **Phase 5 (0.9.64)** : les droits réels de chaque table et fonction sont éprouvés par attaque (`tools/test-securite-sql.sh` : un joueur ne lit, ne modifie ni ne supprime les données d'un autre, y compris
  en visant leur identifiant) ; réglages à vérifier côté Supabase (longueur minimale du mot de passe **8**, **CAPTCHA** sur les connexions anonymes et les inscriptions, *Allow anonymous sign-ins* activé,
  *Confirm email* désactivé) : `docs/AUDIT-PHASE5-SECURITE.md`, §7. Une session anonyme est gratuite : tout plafond « par pilote » se contourne en changeant de session, d'où des plafonds globaux en base.

## Fonctionnement des données

- Stockage local : un invité écrit dans `shardway.*` (les anciennes sauvegardes restent valables) ; chaque compte dans
  `shardwayacct.<id du compte>.*`. Les deux ne se mélangent jamais sur un même navigateur.
- Synchronisation : à la connexion, puis quelques secondes après chaque enregistrement (record, circuit, achat), au retour
  du réseau et au bouton *Synchroniser maintenant* (écran Profil). Hors ligne, le jeu continue normalement.
- Elle **fusionne** au lieu d'écraser : meilleur temps par circuit, circuits réunis (les suppressions suivent), objets et
  médailles réunis, statistiques au maximum ; les pièces ne sont jamais inventées (l'achat fait sur un autre appareil est déduit).
- Ne sont pas synchronisés : réglages de l'appareil (volume, touches, qualité), brouillon de l'éditeur.
- Création d'un compte depuis un appareil qui a déjà de la progression « invité » : case *Reprendre la progression de cet
  appareil* (cochée par défaut). La progression est **déplacée** (0.16.11) : copiée dans le compte, relue, et seulement ensuite effacée de
  l'invité ; bibliothèques comprises (prefabs, pièces perso, modes, brouillon, preuves de vérification). Si elle ne tient pas dans le
  stockage, l'invité garde tout et le joueur le sait. Les réglages de l'appareil restent à l'invité.
- Suppression : *Profil > Supprimer le compte* efface le compte, la sauvegarde, les circuits publiés et les temps en ligne.

## Tests

- `npm test` : client (pseudos, mots de passe, comptes, fusion, hors ligne, session expirée) avec un Supabase simulé.
- `npm run test:sql` : le script SQL sur un vrai PostgreSQL local (variables `PGHOST`, `PGPORT`, `PGUSER`), avec un faux schéma `auth`.

## Invité, code joueur, restauration (phase 4)

- **Identité en ligne de l'invité** : une session anonyme Supabase, stockée sur l'appareil (clé `online.session`). C'est ce qui lui donne ses scores et ses
  circuits publiés. **Elle ne quitte jamais l'appareil** : le *code joueur* (Profil > Exporter) n'en contient ni la session ni le profil en ligne, et importer un
  code ne les remplace jamais (les anciens codes, qui la contenaient, sont filtrés à l'import : sans cela, importer un code revenait à *devenir* le pilote qui
  l'avait exporté). Un invité ne se récupère donc pas sur un autre appareil : pour retrouver ses données ailleurs, il crée un compte (*Reprendre la progression
  de cet appareil*), ou exporte/importe son code joueur, qui transporte la **progression** (records, circuits, objets, médailles) mais pas l'identité en ligne.
- **Panne du serveur ≠ session expirée** : seul un jeton de renouvellement REFUSÉ par le serveur (400, 401, 403) déconnecte un compte ou donne une nouvelle identité
  anonyme à un invité. Réseau coupé, erreur 5xx ou trop d'essais (429) gardent la session et réessaient plus tard.
- **Restaurer une ancienne sauvegarde** (Profil > Importer, fusion ou remplacement) est un geste volontaire, plus récent que les suppressions déjà synchronisées :
  les circuits qu'elle rend (absents ou supprimés ici) sont datés de la restauration et battent leur pierre tombale ; les records qu'elle apporte sont marqués
  `rt` et survivent à une remise à zéro des records faite avant. Ce qui existait déjà garde ses dates (le plus récent gagne) ; une remise à zéro volontaire reste
  valable pour tout ce qui n'a PAS été restauré après.
- **Meilleur temps de toutes les physiques** (`bt`) : les médailles et déblocages ne redescendent pas quand une mise à jour de la physique remplace le record.

## Ce que `submit-score` vérifie (dans l'ordre)

Méthode (GET : état du service et version de physique déployée) · configuration · taille annoncée (413) · session Supabase valide (401) · cadence en mémoire de l'instance
puis **cadence persistante, partagée et atomique en base** (429 ; `etape15` : plafond par pilote, global, et sous-plafond des sessions anonymes ; **base indisponible : 503**, jamais « ouvert ») ·
corps lu **par morceaux avec une limite stricte en octets** · forme des champs (clé de circuit, commandes en base64, temps de 0 à 600 s, version de physique : 400) · profil du pilote ·
rejeu COMPLET de la course avec le vrai code du jeu (**version de physique exactement égale** à celle du serveur — plus ancienne ou plus récente : 422 `versionMismatch` avec `serverPhysVer` —,
circuit reconnu et de la bonne version, **tous les checkpoints franchis** pour que l'arrivée compte, temps égal à 0,5 ms près : 422) · compétition (participants et fenêtre, en base) ·
**écriture atomique** (`submit_best`) : le temps enregistré est celui du REJEU, jamais celui annoncé ; un temps moins bon ne remplace jamais le record, même avec des soumissions simultanées ;
un circuit de joueur est lié à une empreinte SHA-256 de son contenu (une autre carte de même clé 32 bits : 409) ; plafond de 2 000 temps par pilote (422).
**Publication** (`action: "publish-track"`) : le code du circuit et la course de vérification de l'auteur sont envoyés ; le serveur rejoue cette course sur ce code ; le temps de l'auteur
publié (`author_time`, `author_verified = true`) est celui du REJEU et doit égaler le temps inscrit dans le code à la milliseconde près. **Un temps d'auteur n'est jamais accepté parce que le client l'annonce.**
Les circuits publiés avant l'étape 15 gardent un temps `author_verified = false` : le jeu l'affiche « non vérifié » et n'en déduit aucune médaille, jusqu'à ce que leur auteur les republie.

**Limites connues** : une session anonyme est gratuite, donc la limite par pilote se contourne en changeant de session (le plafond global en base borne le total de
rejeux) ; `ALLOWED_ORIGIN` est `*` tant qu'il n'est pas réglé (la session Supabase est exigée de toute façon) ; le temps de l'auteur d'un circuit de joueur
(`author_time`, qui donne les médailles de ce circuit) est vérifié par le jeu à la publication mais pas rejoué par la base.

## Modèle d'identité (0.16.11 : TECH-024, TECH-025, TECH-026 ; schéma aussi en tête de `js/online.js`)

```
première action en ligne        inscription                                          déconnexion
──────────────────────► INVITÉ (uid A) ──── conversion (serveur prêt) ─────► COMPTE uid A ──────► INVITÉ NEUF (rien d'orphelin)
  session anonyme                     │     MÊME utilisateur, même uid
  (POST /auth/v1/signup)              └──── sinon (annoncé au joueur) ─────► COMPTE uid B ──────► INVITÉ uid A retrouvé
connexion à un compte existant : l'invité A reste tel quel sur l'appareil ; la déconnexion le retrouve.
```

- **Un compte converti EST l'ancien invité** : ses temps, circuits publiés, « j'aime », amis gardent le même identifiant ; sa ligne `players` prend le
  pseudo du compte (une seule ligne). À la conversion, la session d'invité quitte la portée de l'invité (sinon, déconnecté, l'invité serait encore
  le compte) ; la déconnexion ouvre donc un invité neuf, qui ne crée une session anonyme qu'au premier besoin.
- **La session d'un invité n'est jamais détruite sans raison** : la déconnexion la retrouve (avant 0.16.11, elle l'effaçait : données orphelines,
  un anonyme de plus à chaque cycle) ; seule une conversion la retire. Un jeton REFUSÉ par le serveur (révoqué) donne une nouvelle identité
  d'invité, et le joueur en est prévenu.
- **Lire n'est pas agir** (0.16.12, TECH-031) : afficher un classement, la communauté, les tendances, un fantôme ou une saison **ne crée plus de joueur anonyme** : ces lectures publiques
  se font avec la clé publique seule, ou avec la session de l'appareil si elle existe (« ma place » au classement, mes « j'aime »). Une session anonyme n'est créée que par une **action**
  (envoyer un temps, publier, aimer, commenter, s'inscrire…). Avant, chaque lecture en créait une : derrière une adresse partagée (école), la limite d'inscriptions anonymes de Supabase
  (par adresse IP ; valeur exacte à vérifier dans Authentication › Rate Limits, non constatée ici) pouvait refuser les classements. Les fonctions lues sans session sont listées dans
  `PUBLIC_RPC` (`js/online.js`) ; `tools/test-securite-sql.sh` vérifie qu'`anon` peut les appeler et que tout le reste exige une session.
- **Deux onglets** : avant de renouveler, le jeu relit la session enregistrée (un autre onglet a pu consommer le jeton, à usage unique) ; le
  renouvellement se fait sous un verrou entre onglets (`navigator.locks`) ; sans lui (navigateurs anciens), un bail dans le stockage
  (`copytrack.authLease`, non atomique : il rend la course très improbable, pas impossible) et, sur un refus, une attente qu'un autre onglet ait
  enregistré sa session. L'évènement `storage` fait suivre la session dans les autres onglets.
- **Aucun jeton n'est écrit dans un journal** (tools/test-identite.mjs le vérifie sur ses scénarios).

### Prérequis serveur de la conversion (à installer par une étape SQL dédiée : rien n'est appliqué par cette version)

Le jeu ne tente la conversion que si le serveur l'annonce. Tant que ce n'est pas le cas, l'inscription crée un nouvel utilisateur (comme avant), garde
intacte l'identité d'invité de l'appareil et le dit au joueur : rien n'est jamais converti à moitié.

1. Une fonction `public.account_conversion_ready()` (sans paramètre, `returns boolean`, exécutable par `anon` et `authenticated`) qui renvoie `true`.
   Absente (projet actuel) : le jeu ne convertit pas.
2. La ligne `accounts` doit être créée quand un utilisateur ANONYME devient un compte : aujourd'hui, `handle_new_account()` n'est appelée qu'à
   l'INSERTION dans `auth.users` (`etape4-comptes.sql`), or une conversion est une MISE À JOUR (adresse posée, `is_anonymous` qui passe à faux,
   `raw_user_meta_data.username`). Mêmes contrôles qu'à l'inscription : domaine technique, pseudo = partie locale de l'adresse, unicité.
   Sans cette ligne, la sauvegarde cloud du compte est refusée (règle d'insertion de `cloud_saves`) : le jeu le détecte après la conversion et
   affiche un échec explicite (le joueur reste invité, sa progression intacte), mais la conversion côté Auth ne s'annule pas : ne publier la
   fonction du point 1 qu'avec le point 2.
3. *Confirm email* désactivé (ci-dessus) : le jeu le lit dans `/auth/v1/settings` (`mailer_autoconfirm`) avant d'essayer ; activé, il n'essaie pas.
4. Le domaine technique `accounts.copytrack.invalid` (même remarque que plus haut si le projet le refuse : `email_address_invalid`).
5. Le déploiement peut couper la conversion sans toucher au serveur : `accounts: { convertAnonymous: false }` dans `js/config.js`.

### Vérification sur un VRAI projet (ce dépôt ne peut pas l'éprouver : les tests utilisent un faux Supabase)

Ne jamais copier un jeton dans un ticket, une capture ou un journal.

1. **Réglages Auth** : `GET /auth/v1/settings` (clé publique) → `mailer_autoconfirm: true`, `external.anonymous_users: true`.
2. **Conversion côté Auth** : session anonyme (`POST /auth/v1/signup` avec `{}`), puis `PUT /auth/v1/user` avec son jeton et
   `{ email: "essai@accounts.copytrack.invalid", password, data: { username: "essai" } }` → 200, `is_anonymous: false`, `email` posé (pas de `new_email`
   en attente), **même** `id`. GoTrue accepte-t-il le mot de passe dans la même requête qu'une adresse pour un anonyme ? À constater. Puis
   `POST /auth/v1/token?grant_type=password` avec l'adresse : même `id`. Après renouvellement, le jeton ne porte plus `is_anonymous: true`.
3. **Base** : une fois l'étape SQL des prérequis installée : ligne `accounts` pour cet `id`, `account_conversion_ready()` vrai ; dans le jeu :
   invité → publier un circuit et envoyer un temps → créer un compte → une seule ligne `players` à ce pseudo, republier le circuit réussit ;
   déconnexion, reconnexion : temps, circuit et « j'aime » toujours là.
4. **Réutilisation d'un jeton de renouvellement** : renouveler avec le jeton A (→ B), puis réutiliser A tout de suite, puis au-delà de
   l'intervalle de réutilisation du projet (*Refresh token reuse interval*, 10 s par défaut d'après la documentation de Supabase, à confirmer) :
   noter la réponse, et si B est encore utilisable (révocation de la famille : *Detect and revoke potentially compromised refresh tokens*).
5. **Deux onglets** : ouvrir le jeu dans deux onglets, forcer l'expiration (outils du navigateur : `expires_at` à 1 dans `shardway.online.session`
   ou `copytrack.account`), agir dans les deux : même identifiant d'invité, aucun « Session expirée » ; recommencer dans un navigateur sans
   `navigator.locks` si possible (repli).
6. **Limite d'inscriptions anonymes** (*Authentication › Rate limits*, 30 par heure et par adresse relevé en 0.9.59) : un cycle invité →
   compte → déconnexion → reconnexion ne doit plus consommer d'inscription anonyme (compter les `auth.users` anonymes créés pendant l'essai).

### Données orphelines laissées par l'ancien comportement (avant 0.16.11)

Rien n'est modifié automatiquement : on ne peut pas prouver, côté serveur, qu'un utilisateur anonyme et un compte sont la même personne.
- Les repérer en lecture seule : lignes `players` de même `lower(name)` dont l'une appartient à un utilisateur anonyme et l'autre à un compte ;
  circuits publiés par des anonymes inactifs. Les anonymes inactifs 12 mois sont déjà purgés par `purge_expired()` (étape 18, si appliquée).
- Un joueur qui s'est inscrit avec une ancienne version SANS se déconnecter depuis a encore la session de son ancien invité sur son appareil
  (seule la déconnexion l'effaçait) : un rattachement futur pourrait s'appuyer sur cette preuve de possession (fonction serveur à concevoir,
  hors de cette version). Pour un joueur déjà déconnecté, l'ancienne session est perdue : aucune action automatique n'est possible.


## Changer et récupérer son mot de passe (COMPLETE-003, décision D-6 : pas de courriel)

### Modèle de menaces (écrit avant le code ; chaque ligne est vérifiée par un test)

Ce qu'on protège : l'accès au compte (sauvegarde cloud, circuits publiés, temps). Ce qui permet de le reprendre sans le mot de passe : le **code de secours**
(16 caractères tirés par `gen_random_bytes` de pgcrypto, alphabet de 32 signes : 80 bits d'aléa), remis UNE fois à l'inscription, régénérable.

| # | Menace | Défense | Vérifié par |
|---|---|---|---|
| M1 | **Énumération de pseudos** : la récupération répond autrement (texte, statut, en-têtes, durée) quand le pseudo n'existe pas, n'a pas de code, ou est verrouillé | Une seule réponse d'échec (même statut, même corps, mêmes en-têtes) ; durée plancher identique pour toute réponse ; la base calcule un bcrypt AUSSI pour un pseudo inconnu, sans code ou verrouillé ; le compteur d'échecs est tenu pour le pseudo SAISI, qu'il existe ou non (un pseudo inconnu se verrouille pareil) | `tools/test-recovery-handler.mjs` (réponses octet pour octet, durées), `tools/test-etape21-sql.sh` (même résultat, même ligne de limitation, bcrypt dans tous les cas) |
| M2 | **Force brute du code** | 80 bits d'aléa ; bcrypt (coût 10) ; **5 échecs par pseudo → verrou de 15 min** ; **20 échecs par adresse et par heure → 1 h** ; **300 essais par 10 min au total** ; compteurs EN BASE (un rechargement de page, un autre onglet ou une autre instance de la fonction ne les remettent pas à zéro) ; essais simultanés sur un même pseudo SÉRIALISÉS (verrou de ligne : pas de « 5 essais en parallèle comptés comme 1 ») ; frein en mémoire de la fonction en plus | SQL : verrou après 5 échecs (même le bon code est alors refusé), adresse, plafond global, sessions simultanées ; fonction : verrouillage après N échecs |
| M3 | **Rejeu** : réutiliser un code déjà servi, deux requêtes simultanées avec le bon code, sessions d'un voleur qui restent ouvertes | Code à **usage unique** (son haché est effacé quand le nouveau mot de passe est posé) ; **réservation à jeton** pendant la pose (une seule des requêtes simultanées passe) ; un nouveau code **invalide l'ancien** ; les **sessions existantes sont révoquées** (`auth.sessions`, jetons de renouvellement) | SQL : second usage refusé, régénération, deux sessions simultanées, sessions supprimées ; fonction : second usage refusé |
| M4 | **Fuite** (base, journaux, messages d'erreur) | La base ne garde que `bcrypt(SHA-256(code))` (contrainte : seul un haché bcrypt est accepté) ; le code n'est JAMAIS un paramètre SQL (la fonction serveur en calcule l'empreinte SHA-256 avant d'appeler la base) ; adresse IP gardée sous forme d'empreinte SHA-256 ; journal minimal (date, compte s'il existe, issue) ; la fonction ne journalise ni corps, ni code, ni mot de passe ; erreurs génériques ; aucun code dans le stockage du navigateur (affiché une fois, en mémoire seulement) | SQL : recherche du code en clair et de son empreinte dans toutes les tables ; fonction : journaux capturés ; client : stockage local après affichage |
| M5 | **Session volée → code régénéré** (prise de contrôle durable) | Créer ou régénérer un code exige une authentification PAR MOT DE PASSE de moins de 10 min (revendication `amr` du jeton, posée par Supabase Auth) ; le jeu redemande le mot de passe | SQL : refus sans `amr` récent, avec un `amr` ancien, pour un invité, sans session |
| M6 | **Blocage ciblé** (verrouiller la récupération d'un autre en essayant son pseudo) | Verrou temporaire seulement (15 min) ; il ne touche ni la connexion normale ni le jeu | (risque accepté, documenté) |
| M7 | **Abus de la fonction** (taille, cadence, processeur) | Corps ≤ 2 Ko lu par morceaux ; frein par adresse en mémoire ; plafond global en base (borne les bcrypt) ; base indisponible → 503 (jamais « ouvert ») | fonction : 413, 429, 503 |

**Risques résiduels (non couverts)** : un jeton d'ACCÈS déjà émis reste valable jusqu'à son expiration (1 h par défaut de Supabase) : seuls les jetons de
renouvellement et les sessions sont révoqués ; l'adresse vient de `x-forwarded-for` (première valeur), que la plateforme renseigne mais qu'on ne peut
pas prouver ici infalsifiable : la limite par pseudo et le plafond global tiennent sans elle ; quelqu'un qui a le code ET le pseudo prend le compte
(c'est la définition du code : à garder comme un mot de passe).

### Fonctionnement (0.16.13)

- **Changer son mot de passe** (Garage › Compte › *Changer le mot de passe*) : le mot de passe ACTUEL est redemandé (re-authentification : une connexion neuve par mot de passe, jugée par Supabase Auth ;
  le jeu ne compare rien lui-même) ; le nouveau suit les règles de l'inscription (8 caractères au moins, 72 octets au plus, pas le pseudo : `js/accountRules.js`, partagées avec la fonction serveur) ;
  puis `PUT /auth/v1/user` et `POST /auth/v1/logout?scope=others` : les autres appareils connectés au compte se reconnectent avec le nouveau mot de passe, celui-ci reste connecté.
- **Code de secours** : créé à l'inscription (montré UNE fois sur l'écran d'accueil, case « J'ai noté mon code » exigée avant d'entrer ; fermer l'onglet avant demande une confirmation), régénérable
  (Garage › Compte › *Régénérer mon code* : mot de passe redemandé, l'ancien code ne vaut plus rien). Format `XXXX-XXXX-XXXX-XXXX` (16 signes, 80 bits). Il n'est écrit nulle part : ni stockage de l'appareil,
  ni journal ; la base n'en garde qu'un haché. Détail et défenses : modèle de menaces ci-dessus.
- **Récupération** (accueil › Connexion › *J'ai perdu mon mot de passe*) : pseudo + code + nouveau mot de passe, SANS session. La fonction serveur `account-recovery` (`supabase/functions/account-recovery`)
  transmet à la base le pseudo et l'EMPREINTE SHA-256 du code (jamais le code), obtient une réservation de deux minutes, pose le mot de passe par l'API d'administration d'Auth (c'est Auth qui le hache),
  puis consomme le code et révoque les sessions du compte. On est ensuite connecté, et un NOUVEAU code est remis. Tout échec lié au pseudo ou au code (inconnu, mauvais code, sans code, verrouillé, mal formé)
  donne la MÊME réponse (`400`, même corps, mêmes en-têtes) après la même durée plancher (1,5 s) ; seuls « trop d'essais pour cette adresse » (`429`) et « service indisponible » (`503`) diffèrent, et
  ne dépendent pas du pseudo. Limites : 5 échecs par pseudo → verrou de 15 min ; 20 échecs par adresse et par heure → 1 h ; 300 essais par 10 minutes en tout ; 10 requêtes par minute et par adresse en mémoire.
- **Comptes existants** : l'écran Garage › Compte regarde (`recovery_status`) si le compte a un code valable ; sinon il le propose (bloc « Pas de code de secours », bouton *Créer mon code de secours*, mot de passe
  redemandé), à chaque passage tant qu'il manque, sans fenêtre forcée ni blocage du jeu. Serveur sans l'étape 21, ou hors ligne : rien n'est proposé. Un code servi (récupération) est remplacé tout de suite.

### Installation du code de secours (dans cet ordre : SQL, fonction, site)

1. **SQL, À LA MAIN** (Supabase › SQL Editor) : `supabase/etape21-recuperation.sql`, après les étapes 1 à 20 (pgcrypto doit être installé dans le schéma `extensions`, ce que fait Supabase par défaut ; l'étape le crée sinon).
   Relançable, ne supprime rien. Puis `supabase/verify-prod.sql` : les lignes « étape 21 » à `ok` (la ligne d'info dit combien de comptes n'ont pas encore de code).
2. **Fonction** `account-recovery` : `npm run build:function` puis `supabase/functions/account-recovery/index.ts` collé dans Edge Functions, ou le workflow `deploiement.yml` (qui la déploie après `submit-score`,
   avant la barrière). Aucun secret à ajouter : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par Supabase (la clé de service ne quitte jamais cette fonction) ; `ALLOWED_ORIGIN` est facultatif.
   Déployée AVANT l'étape SQL, elle répond `503` à tout (jamais « ouvert ») : le jeu dit « service momentanément indisponible ».
3. **Site** : publier le jeu 0.16.13. Sans les étapes 1 et 2, il fonctionne comme avant (le code de secours est simplement absent, rien n'est proposé).

### À vérifier sur un VRAI projet (ce dépôt ne peut pas l'éprouver : rien de ceci n'a été constaté)

Ne jamais copier un jeton ni un code dans un ticket, une capture ou un journal.

1. **Revendication `amr`** : après une connexion par mot de passe, le jeton d'accès porte `amr: [{ method: "password", timestamp: <secondes> }]` (c'est ce que lit `recovery_code_new`). Sans elle, la création
   du code est refusée à tous (« Mot de passe à confirmer ») : l'échec est sûr (fermé), mais la fonction est inutilisable. À constater : décoder la partie centrale d'un jeton obtenu par `POST /auth/v1/token?grant_type=password`.
2. **Passerelle des fonctions** : `account-recovery` est appelée SANS session, avec la clé publique du jeu. Le workflow garde « Verify JWT » activé (un test l'exige) ; si la passerelle refuse la clé publique
   (réponse `401 Invalid JWT` : le jeu dit « Le serveur a refusé la demande de récupération »), désactiver « Verify JWT » **pour cette seule fonction** dans le tableau de bord (Edge Functions › account-recovery),
   ce qui ne retire aucune protection (la clé publique est dans la page ; la défense est le code et les limites) — ne pas passer `--no-verify-jwt` au workflow.
3. **API d'administration** : `PUT /auth/v1/admin/users/{id}` avec `{ "password": … }` change bien le mot de passe ; un mot de passe refusé par Auth (faible, déjà divulgué) renvoie `422` (le jeu demande d’en choisir un autre,
   le code reste valable).
4. **Sessions révoquées** : après une récupération, le jeton de renouvellement d'une session ouverte AVANT est refusé (`recovery_finish` supprime `auth.sessions` ; si le rôle de la base n'a pas ce droit, la réponse
   le journalise « ALERTE : sessions non révoquées » et le mot de passe est tout de même changé). Un jeton d'ACCÈS déjà émis reste valable jusqu'à son expiration (1 h par défaut).
5. **`/auth/v1/logout?scope=others`** (changement de mot de passe) : l'autre appareil doit être déconnecté ; si le projet ne le gère pas, le mot de passe est quand même changé (l'erreur est ignorée).
6. **Limites d'Auth** : chaque création / régénération de code et chaque changement de mot de passe fait une connexion de preuve (`/auth/v1/token`) : elle compte dans *Authentication › Rate Limits*.
7. **`x-forwarded-for`** : la plateforme le renseigne-t-elle (une adresse par appel, la première étant celle du client) ? Sinon toutes les requêtes partagent le seau « inconnue » : la limite par adresse devient globale.
8. **Essai de bout en bout** avec un compte de test : inscription (code montré), connexion ailleurs, changement de mot de passe, récupération avec le code (connecté, nouveau code montré), second usage du même code refusé,
   6 mauvais essais : verrou ; puis supprimer le compte de test (*Supprimer le compte* ; son code part avec lui).

