# Essais humains : protocole (COMPLETE-001)

Ce document est le protocole d'une campagne d'essais avec de vrais joueurs. Il se suit **sans l'aide de son auteur** : qui, quoi jouer, quoi demander, quoi mesurer, ce qui est
permis ou non avec les données, et quoi faire des résultats. Sa fiche à imprimer est [FICHE-ESSAI.md](FICHE-ESSAI.md), **générée** par `node tools/fiche-essai.mjs` (ne pas la
modifier à la main) ; les nombres du protocole sont dans `tools/essais-protocole.mjs`, que la fiche et le rapport lisent (`tools/test-essais.mjs` vérifie que ce document, la
fiche et le code disent la même chose).

## Ce qu'on cherche, et ce qu'on ne cherche pas

Deux réglages portent tout le reste du jeu (carrière, saisons, classements) et n'ont jamais été vérifiés par des joueurs depuis les lois de conduite mesurées
([LOIS-PHYSIQUE.md](LOIS-PHYSIQUE.md)) :

- **Les médailles.** Tant qu'un circuit ne porte pas `medalsBy: 'humain'` dans `js/tracks.js`, ses médailles sont celles du pilote automatique (Or = son temps, cristal ×0,95,
  argent ×1,15, bronze ×1,35). L'outil qui les cale sur des testeurs existe (`tools/essais.mjs`, modèle « niveau du testeur × difficulté du circuit ») ; la ligne « Physique » de
  la fiche générée dit où on en est. Les premières statistiques de jeu montraient que presque toutes les arrivées décrochaient le cristal : les humains vont plus vite que le pilote.
- **Le ressenti.** Accélération, freinage, volant, dérapage, chocs contre les murs, contrôle en l'air, caméra, difficulté, avec chaque type de commandes. Il n'a été vérifié que par
  machine ([ARCHITECTURE.md](ARCHITECTURE.md), « Limites connues »).
- **Les blocages.** Où l'on bute : premières minutes, tutoriel, un circuit précis, l'ouverture des chapitres (4 médailles par chapitre), le multijoueur.

Ce que la campagne **ne fait pas** : elle ne change **rien** à la physique (voir « Après les essais »), n'invente aucune conclusion que les données ne soutiennent pas, et ne
garde aucune donnée personnelle dans le dépôt.

## Avant de lancer (liste de contrôle)

1. **Le jeu à tester est figé.** Noter dans le journal d'essai la `VERSION` et le `PHYS_VER` de `js/version.js` : les temps sont filtrés par `PHYS_VER` (`--pv`), et tout changement de
   physique pendant la campagne rend les temps non comparables. Pas de livraison de physique pendant les essais ; une correction sans effet sur la course (texte, interface) peut passer, en le notant.
2. **Le serveur reçoit.** Étape SQL 6 (`supabase/etape6-telemetrie.sql`, statistiques) et étape 19 (`supabase/etape19-avis.sql`, avis) appliquées : sans la première rien n'arrive,
   sans la seconde le formulaire répond « Envoi impossible » ([supabase/MIGRATIONS.md](../supabase/MIGRATIONS.md), `supabase/verify-prod.sql`). Version en ligne : le bas de l'accueil affiche la version notée.
3. **Faire le parcours soi-même une fois**, sur un appareil neuf (navigation privée acceptée pour ce seul essai), en vérifiant qu'une ligne arrive dans `run_stats` et un avis dans `feedback`
   (`node tools/surveillance.mjs` compte les lignes des dernières 24 h).
4. **Noter la date de début** : elle sert à ne garder que les temps des essais (`--depuis`). Créer le dossier `essais-donnees/` (ignoré par git, voir « Consentement et vie privée »).
5. Imprimer la fiche (ou la partager en lecture seule hors du dépôt), préparer un chronomètre pour les observateurs.

## Les testeurs

Il faut **au moins 8 testeurs qui comptent**, de profils variés, pas tous habitués aux jeux de course. Un testeur « compte » quand il a **fini 12 circuits différents** (les deux premiers
chapitres) en **30 courses au moins** (arrivées et abandons), sur la version figée. Un testeur qui joue sur deux appareils compte comme deux (chaque appareil a son identifiant aléatoire).

| Profil | Minimum (testeurs qui comptent) |
| --- | ---: |
| Testeurs qui comptent | 8 |
| Joueurs qui jouent **rarement** aux jeux de course (débutants) | 3 |
| Joueurs qui jouent **souvent** aux jeux de course (habitués) | 3 |
| Commandes : **clavier** | 3 |
| Commandes : **écran tactile** (téléphone ou tablette) | 2 |
| Commandes : **manette** | 1 |

Les deux lignes de profil se recoupent (un testeur est un débutant **et** au clavier) : 8 testeurs suffisent, par exemple 3 débutants (clavier, tactile, clavier) et 5 habitués (clavier,
tablette, manette, clavier, téléphone). Le rapport lit le profil dans l'avis du testeur (formulaire du jeu : expérience, commandes, appareil). **Deux exigences ne se mesurent pas** et se
déclarent à la main dans le journal d'essai :

- au moins **2 testeurs sous Firefox ou Safari** (le reste sous Chrome ou Edge) : le formulaire ne demande pas le navigateur ;
- au moins **2 personnes** pour le multijoueur, sur deux appareils (il n'y a pas de statistiques de multijoueur).

Comment définir « débutant » et « habitué » : c'est la réponse du testeur à la question du formulaire (« Je joue rarement aux jeux de course » / « Je joue souvent aux jeux de course »), jamais un
jugement de l'organisateur. Recruter de préférence des personnes qui n'ont jamais vu le jeu et qui ne connaissent pas ses circuits.

**Limite assumée : 8 testeurs, c'est peu.** Avec quelques temps par circuit, chaque circuit n'a pas de centiles à lui : le modèle commun (« Comment les médailles sont calées », ci-dessous) les
déduit de tous les circuits à la fois. Les moyennes par profil (3 débutants, 1 manette…) sont des **ordres de grandeur**, pas des mesures ; la décision écrite le dit.

## Le parcours imposé

Chaque testeur fait le parcours dans cet ordre (détail, rôles et cases dans la fiche) ; **tous les circuits du parcours doivent avoir été essayés par 6 testeurs qui comptent au moins**
(arrivée **ou** abandon : ne pas finir le circuit le plus dur est une mesure, pas un échec).

| Étape | Circuit | Pourquoi |
| --- | --- | --- |
| 0 | Premières minutes | de l'ouverture du jeu à la première arrivée, sans aide, l'observateur ne parle pas |
| 1 | Premiers Éclats (n° 1, ◆1) | le premier circuit de la carrière |
| 2 | Tremplins du Crépuscule (n° 3, ◆2) | circuit à **plaques** |
| 3 | Lac Gelé (n° 5, ◆3) | glace et virages serrés : la glisse |
| 4 | Racines Boueuses (n° 11, ◆3) | circuit à **gravité** retournée |
| 5 | Temple (n° 12, ◆4) | technique |
| 6 | Grand Archipel (n° 18, ◆5) | vitesse, le plus dur du parcours (chapitre 3) |
| 7 | Multijoueur | deux personnes, deux appareils : salle, départ commun, revanche, championnat de deux circuits |

Le parcours couvre les cinq profils de circuit et les difficultés de 1 à 5 ; `tools/test-essais.mjs` vérifie sur le code des circuits que « Racines » inverse bien la gravité et que « Tremplins »
a des plaques (si un circuit change, le test dit lequel remplacer dans `tools/essais-protocole.mjs`). Le reste est libre : le testeur joue la **carrière depuis le début**, au moins les deux
premiers chapitres (12 circuits), comme chez lui, aides à la conduite coupées (les courses assistées ne comptent pas pour les médailles) et rejoue autant qu'il veut.

## Déroulé

**Séance accompagnée** (au moins **4 testeurs**, dont 2 débutants, 2 habitués, 1 tactile, et la paire du multijoueur) : 75 minutes au plus, l'observateur note sur la fiche sans intervenir.

1. Accueil (5 min) : lire à voix haute le consentement (ci-dessous) ; remplir « Le testeur » (code, profil) ; **ne rien expliquer du jeu**.
2. Premières minutes (10 à 15 min) : ouverture, pseudo, fenêtre des statistiques, tutoriel, première course ; l'observateur ne parle pas et chronomètre.
3. Parcours (étapes 1 à 6, 40 min environ), sans aide ; une question posée par le testeur reçoit « qu'est-ce que tu ferais si j'étais absent ? ».
4. Multijoueur (étape 7, 10 min) : avec un autre testeur.
5. Questions de ressenti (10 min), puis « Donner mon avis » dans le jeu (2 min).

**Essai à distance** (les autres testeurs) : le message ci-dessous, ensuite rien. Ils jouent chez eux en une ou plusieurs fois, sans observateur ; leur seule trace est la télémétrie et l'avis.

### Le message à envoyer (à copier)

> Salut ! Je prépare la version 1.0 de mon jeu de course, Trackigami, et j'ai besoin de ton avis : https://lucjules.github.io/Copytrack/
>
> Ça se joue dans le navigateur (ordinateur, téléphone ou tablette), sans rien installer. Compte 1 heure, en une ou plusieurs fois.
>
> 1. Au premier lancement, choisis un pseudo **qui ne te nomme pas** et, si tu veux bien, **accepte les statistiques anonymes** (la fenêtre « Aider à équilibrer les circuits ? »).
>    C'est ce qui me donne tes temps, sans ton nom. Tu peux les couper quand tu veux : Paramètres › Jeu. N'utilise pas la navigation privée et ne vide pas les données du site (sinon tu comptes pour
>    un nouveau testeur à chaque fois).
> 2. Joue la **carrière depuis le début**, comme tu le ferais chez toi, sans demander d'aide : au moins les deux premiers chapitres (12 circuits), avec **au moins 30 courses** en tout (rejouer
>    un circuit pour améliorer son temps compte). Puis essaie ces circuits : Premiers Éclats, Tremplins du Crépuscule, Lac Gelé, Racines Boueuses, Temple, Grand Archipel.
> 3. Laisse les **aides à la conduite** coupées (les courses assistées ne comptent pas pour les médailles).
> 4. À la fin, **« Donner mon avis »** (Paramètres › Donner mon avis, ou le lien en bas de l'accueil ; le jeu te le propose aussi après quelques courses). Deux minutes, et sois franc :
>    « trop dur », « ennuyeux », « je n'ai rien compris », tout m'aide. N'y mets pas ton nom ; ton pseudo n'est joint que si tu coches la case.
> 5. Si on te propose un essai à deux (multijoueur), accepte : c'est la partie que je connais le moins.
>
> Si tu vois un bug, envoie-moi une capture d'écran **sans** ton nom ni ton adresse. Merci !

## Consentement et vie privée

Ce que le jeu envoie, et seulement si le testeur a **accepté** (réglage « Statistiques de jeu anonymes », demandé une fois au menu, retirable dans Paramètres › Jeu, ce qui vide la file locale) :
l'identifiant d'installation (16 caractères aléatoires, créé sur l'appareil, **jamais lié au pseudo, au compte ni à l'adresse**), le circuit intégré, l'issue (arrivée ou abandon), le temps, la progression
à l'abandon, le numéro d'essai, les retours au checkpoint, la médaille, la version de la physique ; et les **erreurs du jeu** s'il en survient (même accord). Rien d'autre : ni nom, ni position, ni commandes
enregistrées (détail : [supabase/TELEMETRIE.md](../supabase/TELEMETRIE.md), page Confidentialité du jeu). L'avis (« Donner mon avis ») part **uniquement quand le testeur l'envoie** ; il porte le
même identifiant, le profil, les notes et deux textes courts, et le **pseudo seulement si la case est cochée**. Conservation : 12 mois au plus, puis purge automatique.

À dire au testeur, sans détour :

- ce qui part et à quoi ça sert ; qu'il peut refuser (dans ce cas ses temps n'arrivent pas, il peut quand même jouer et envoyer son avis) ou retirer son accord à tout moment ;
- qu'il **ne voit pas son identifiant d'installation** : l'organisateur ne peut donc pas retrouver ses lignes à sa demande ; elles sont anonymes et purgées automatiquement ;
- que ses records vont aux classements en ligne sous son pseudo par défaut (réglage « Envoyer mes records aux classements en ligne », Paramètres › Jeu) : choisir un pseudo qui ne le nomme pas, ou décocher.

Règles pour l'organisateur :

- **Aucune donnée personnelle dans le dépôt** : pas de nom, d'adresse, de téléphone, de pseudo de testeur, d'identifiant d'installation, de capture d'écran avec un nom. Les exports bruts vont dans
  `essais-donnees/` (dossier **ignoré par git**), les fiches papier ne portent qu'un code (A, B, C…).
- Le rapport (`tools/essais.mjs`) appelle les testeurs **T01, T02…** et n'écrit aucun pseudo sauf avec `--pseudos` (à ne pas utiliser pour un document du dépôt). Les textes libres des avis y figurent : les
  **relire** (un testeur peut avoir écrit un nom) avant de garder le rapport dans le dépôt, et retirer ce qui identifie quelqu'un.
- L'export des avis se fait **sans la colonne `pseudo`** (voir la requête ci-dessous).

## Ce qu'on mesure, et d'où ça vient

| Mesure | Source | Où on la lit |
| --- | --- | --- |
| Taux d'arrivée par circuit | `run_stats` (télémétrie) | `tools/telemetry-report.mjs` (« Finissent ») |
| Essais avant la première arrivée | `run_stats.attempt` | `telemetry-report` (« Essais (méd.) ») |
| Abandons, et où dans le circuit | `run_stats` (`quit`, `progress`) | `telemetry-report` (« Abandons », alerte « mur vers N % ») |
| Réapparitions (retours au checkpoint) | `run_stats.respawns` | `telemetry-report` (« Réapparitions par arrivée / par abandon ») ; `essais.mjs` (« Par profil ») |
| Temps par rapport aux seuils de médailles | `run_stats.time` | `telemetry-report` (« B / A / O / C atteints ») ; `essais.mjs` (« Atteint (actuelles / proposées) ») |
| Niveau d'un testeur rapporté au pilote | `run_stats` + `golden-temps.json` | `essais.mjs` (« Testeurs », « Par profil ») |
| Profil (expérience, commandes, appareil) | `feedback` | `essais.mjs` (« Le protocole est-il rempli ? », « Par profil », « Avis ») |
| Ressenti (plaisir, dérapage, murs, air, difficulté, caméra) | `feedback` | `essais.mjs` (« Avis », par expérience, appareil **et commandes**) |
| Ressenti hors formulaire (accélération, freinage, volant…) | fiche, observateur | notes du journal d'essai, rapportées comme réponses de testeurs |
| Premières minutes, hésitations, abandons à voix haute | observateur | fiche, « Premières minutes » |
| Navigateur, multijoueur | déclaré | journal d'essai |

Le multijoueur n'est **pas** suivi par la télémétrie : il ne se juge que par les notes de l'observateur et la question dédiée.

## Calendrier

Durée conseillée : **deux semaines**, jours comptés à partir du lancement (J0).

| Quand | Quoi |
| --- | --- |
| J−7 à J−1 | recruter (profils ci-dessus), figer la version, liste de contrôle « Avant de lancer », parcours d'essai de l'organisateur |
| J0 | message envoyé, premières séances accompagnées, date de début notée |
| J2 à J7 | séances accompagnées (au moins 4) et multijoueur ; surveiller le serveur (`node tools/surveillance.mjs`) |
| J5 | **point d'étape** : exporter, lancer le rapport (« Le protocole est-il rempli ? » dit qui manque : relancer ceux-là, recruter le profil qui manque) |
| J10 à J14 | derniers essais ; relances ; **clôture** : la date de fin est notée, plus aucun temps n'est ajouté |
| J15 | export final, rapport, relecture des textes libres |
| J16 à J18 | décision écrite (gabarit ci-dessous) ; recalage des médailles s'il est justifié |

## Après les essais

### 1. Exporter (lecture seule)

Par le connecteur Supabase ou le tableau de bord (SQL Editor, puis « Download CSV »), dans `essais-donnees/` ; remplacer la date de début et le `phys_ver` noté :

```sql
select install, track, outcome, time, progress, respawns, attempt, phys_ver, medal, created_at
from public.run_stats where phys_ver = 39 and created_at >= '2026-12-01' order by created_at;

select install, created_at, version, phys_ver, device, controls, experience, fun, camera, drift, walls, air, difficulty, tracks_note, comment
from public.feedback where created_at >= '2026-12-01' order by created_at;
```

### 2. Rapports

```sh
node tools/essais.mjs --temps essais-donnees/runs.csv --avis essais-donnees/feedback.csv --pv 39 --depuis 2026-12-01 --md essais-donnees/rapport.md
node tools/telemetry-report.mjs essais-donnees/runs.csv --pv 39 --md essais-donnees/telemetrie.md
```

`essais.mjs` répond d'abord à « le protocole est-il rempli ? » (testeurs par profil, parcours imposé, qui manque), donne le niveau par profil, les médailles proposées pour les 72 circuits et
résume les avis (tous, débutants, habitués, appareil, commandes, textes). `telemetry-report.mjs` donne, circuit par circuit : joueurs, taux d'arrivée, abandons et leur endroit, réapparitions, part
des finisseurs qui atteignent chaque médaille actuelle, alertes (trop dur, trop facile, Or hors de portée, mur).

### 3. Médailles (Mode B : seulement si le protocole est rempli)

Cibles du recalage : **bronze atteint par environ 90 % des testeurs** (il ouvre les chapitres), **argent environ la moitié, or environ 15 %, cristal rarement** (3 %). Elles sont
écrites dans les définitions des circuits **seulement** (champs `medals`, `medalsBy`, et l'objectif « moins de t s »), jamais dans le code du circuit : **les médailles ne font pas partie de
`encode()`, donc ne changent aucune des 72 clés `b-<id>-<empreinte>`** (`tools/test-essais.mjs` le prouve avant tout recalage, `tools/essais.mjs --verifier-cles` le reprouve après).

```sh
node tools/essais.mjs --temps essais-donnees/runs.csv --avis essais-donnees/feedback.csv --pv 39 --depuis 2026-12-01 --ecrire
```

`--ecrire` **refuse** (sans `--forcer`) : sans les avis, quand le protocole n'est pas rempli, avec moins de 5 testeurs et 40 temps, quand la physique des temps n'est pas celle du jeu, ou si des médailles
proposées ne sont pas ordonnées (cristal ≤ or ≤ argent ≤ bronze). Après l'écriture il relit les 72 clés dans un autre processus et échoue si l'une a changé. Puis :

```sh
node tools/medals.mjs --check
node tools/golden.mjs
node tools/contract.mjs --builtin
node tools/fiche-essai.mjs
npm run sw
npm run build:function
npm test
```

`--forcer` n'est pour **aucun** cas courant : si on y recourt, la décision écrite dit quelle exigence n'était pas remplie et pourquoi on passe outre. La fonction `submit-score` embarque les circuits
(donc les médailles) : à redéployer. Les médailles déjà gagnées par les joueurs restent acquises. Le **circuit du jour** a ses propres médailles, calculées sur le pilote chaque jour (`js/daily.js`) :
le rapport donne les facteurs humains à y reporter.

### 4. Ressenti : la décision écrite

Les avis **ne changent pas la physique**. Si les essais montrent un problème de ressenti, on écrit une décision (modèle : [LOIS-PHYSIQUE.md](LOIS-PHYSIQUE.md)) et on **propose une phase séparée** : tout
changement de physique change `PHYS_VER` (empreinte, records, fantômes, classements, fonction serveur : [ARCHITECTURE.md](ARCHITECTURE.md), « Changer la physique »). Règle de lecture, pour ne pas
conclure plus que les données ne disent :

- un **signal** du rapport (moyenne d'une échelle à ±0,5 ou plus, avec au moins 3 réponses) n'est qu'une piste ;
- il devient une **raison de proposer un changement** seulement s'il est **confirmé** : par au moins deux profils différents (par exemple débutants et habitués, ou deux types de commandes), **et** par
  les notes de l'observateur ou les textes libres ;
- un signal d'un seul profil, ou d'un testeur, va dans « reste à investiguer », avec la taille du groupe ;
- jamais de conclusion sur un type de commandes avec un seul testeur (la manette en a un : « un testeur, à confirmer »).

Gabarit de la décision (un document `docs/DECISION-ESSAIS.md`, daté, sans donnée personnelle) :

1. **Échantillon** : nombre de testeurs qui comptent, par profil ; version et physique ; dates ; ce que le rapport « protocole » a dit ; ce qui manquait.
2. **Limites** : taille, recrutement, navigateurs non mesurés, multijoueur non mesuré, réponses déclaratives, un seul testeur pour certaines commandes.
3. **Ce que les essais disent** : chiffres (avec leur effectif) et citations de textes libres, sans interprétation au-delà.
4. **Médailles** : tableau avant / après des seuils par circuit, taux visés / observés, circuits extrapolés, circuits à regarder (raccourcis possibles), preuve des 72 clés inchangées.
5. **Ressenti, ce qui est maintenu** : réglages de [LOIS-PHYSIQUE.md](LOIS-PHYSIQUE.md) que rien ne contredit (et pourquoi : « aucun signal », pas « validé »).
6. **Ressenti, ce qui reste à investiguer** : signaux non confirmés, avec ce qu'il faudrait de plus (testeurs, profil, mesure).
7. **Proposition de phase séparée**, s'il y a lieu : le réglage visé, la mesure à faire avant, l'effet sur `PHYS_VER`.

### 5. Gel

Pas de changement de `PHYS_VER` entre la clôture et la décision (les records et les fantômes restent comparables). La décision écrite dit si une phase de physique est proposée et à quelle date.

## Comment les médailles sont calées sur 8 testeurs

Avec 8 testeurs, chaque circuit n'a que quelques temps : impossible de prendre des centiles circuit par circuit (il en faut une vingtaine, `tools/telemetry-report.mjs`, pour quand le jeu aura beaucoup de
joueurs). Mais chaque temps se compare au temps du pilote automatique sur le **même** circuit :

> ln(meilleur temps du testeur / temps du pilote) = niveau moyen + niveau du testeur + difficulté propre du circuit + hasard

Le niveau de chaque testeur se mesure sur **tous** ses circuits à la fois ; la difficulté propre d'un circuit (« plus dur pour un humain que pour le pilote ») n'est retenue que si plusieurs testeurs la
confirment (elle est tirée vers zéro tant qu'il y a peu de temps). Les médailles visent :

| Médaille | Atteinte par |
| --- | --- |
| Cristal | les 3 % meilleurs temps des testeurs |
| Or | 15 % |
| Argent | la moitié |
| Bronze | 90 % : le bronze ouvre les chapitres, presque tout le monde doit l'avoir |

Chaque testeur compte autant, qu'il ait joué 12 circuits ou 72. Un circuit que personne n'a fini reçoit la difficulté moyenne (« extrapolé » : le rapport le dit, et c'est le plus fragile). Il faut au moins
5 testeurs ayant fini 3 circuits et 40 temps pour que l'outil accepte d'écrire (et, en plus, le protocole rempli).

Deux filtres protègent le Cristal d'un temps qui ne dit rien du circuit, et le rapport nomme chaque circuit touché (**raccourci possible : à regarder**) :

- les temps plus de 40 % plus rapides que le pilote (raccourci, client modifié) sont écartés (`--seuil 0.6`). Dans les statistiques de la physique 36, les vrais temps humains allaient de 61 à 94 % du pilote ;
  une installation faisait 38 % dès son premier essai sur cinq circuits ;
- un temps isolé au moins 20 % plus rapide que ce que prévoient le niveau du testeur et la difficulté du circuit (un raccourci trouvé par un seul testeur) est retiré avant le calcul. Un temps lent n'est jamais retiré.
