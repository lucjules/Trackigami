# Espacement des checkpoints : rapport (GAME-007)

Généré par `node tools/checkpoints-espacement.mjs --rapport` (environ une minute et demie). **Aucun circuit officiel n'est modifié** : l'analyse « et si » remplace un jeton `S` du script par un checkpoint dans une COPIE du circuit, en mémoire, et mesure ; on ne l'applique pas (décision D-5 : on ne modifie pas un circuit officiel ici).

**Mesure** : course du pilote automatique de chaque circuit ; points de retour = départ, checkpoints, passages de ligne d'un tour ; écart = temps entre deux points de retour consécutifs (le dernier : l'arrivée). **Règle pour les nouveaux circuits : 30 s au plus** (`tools/contract.mjs`, exceptions figées dans `tools/checkpoints-exceptions.json`).

**Résultat** : 72 circuits, médiane des écarts maximaux **28.5 s** ; **26** dépassent 30 s (exceptions figées). À checkpoints seuls (la mesure de l'audit) : médiane 28.7 s, 28 au-dessus ; la différence vient des deux circuits à deux tours, dont la ligne est aussi un point de retour.

## Les huit pires circuits

| circuit | écart max | entre… | checkpoints | temps pilote | candidate : jeton remplacé | écart max après |
| --- | --- | --- | --- | --- | --- | --- |
| helice | 52.0 s | checkpoint 1 (18.3 s) → arrivée (70.3 s) | 1 | 70.3 s | n° 24 (`S` → `C*1`) | 26.7 s |
| cheminee | 41.7 s | checkpoint 1 (8.5 s) → arrivée (50.2 s) | 1 | 50.2 s | n° 28 (`S` → `C*1`) | 22.4 s |
| recif | 41.1 s | départ (0.0 s) → checkpoint 1 (41.1 s) | 3 | 62.9 s | n° 24 (`S` → `C*1`) | 26.6 s |
| viaduc | 41.0 s | checkpoint 1 (13.1 s) → arrivée (54.0 s) | 1 | 54.0 s | n° 38 (`S` → `C*1`) | 21.4 s |
| epave | 40.2 s | checkpoint 1 (6.9 s) → arrivée (47.2 s) | 1 | 47.2 s | n° 23 (`S` → `C*1`) | 22.3 s |
| montgolfieres | 39.2 s | checkpoint 1 (10.2 s) → arrivée (49.4 s) | 1 | 49.4 s | n° 24 (`S` → `C*1`) | 22.1 s |
| rafales | 37.4 s | checkpoint 1 (13.6 s) → checkpoint 2 (51.0 s) | 2 | 62.1 s | n° 30 (`S` → `C*3`) | 19.3 s |
| engrenages | 36.9 s | checkpoint 1 (12.1 s) → arrivée (49.0 s) | 1 | 49.0 s | n° 17 (`S` → `C*1`) | 22.0 s |

## Ce que coûterait un correctif (le même pour chaque circuit)

Ajouter un checkpoint change le code du circuit, donc **sa clé de classement `b-<id>-<empreinte>`**. Il faudrait :

1. une entrée d'alias ancienne clé → nouvelle clé dans `BUILTIN_KEY_ALIASES` (`js/builtinKeys.js`) : records, médaille, verrous de chapitre, dernières courses, objectif et maîtrise suivent alors **sur l'appareil** ;
2. `node tools/builtin-keys.mjs --update` (fichier doré des clés) et `node tools/compat-gen.mjs --update` (corpus de compatibilité), puis l'annoncer au CHANGELOG ;
3. `npm run build:function` et le **redéploiement de la fonction serveur** (les circuits sont dans la fermeture de `js/verify.js`) AVANT le site : sans cela le serveur refuse les temps du circuit (« Version du circuit différente ») ;
4. **perdu, non migrable** : le classement mondial de l'ancienne clé (il reste figé sur le serveur ; la nouvelle clé en commence un neuf), les saisons, duels et tournois en cours sur ce circuit (leur clé change), les fantômes importés, et les temps de saison déjà envoyés si le circuit est dans la saison de la semaine ;
5. `PHYS_VER` : voir « empreinte de physique » ci-dessous, mesurée pour chaque candidate. Les temps du pilote, donc les médailles et `tools/golden-temps.json`, ne bougent pas quand le temps est « inchangé ».

## Où un checkpoint aiderait

Chaque droite simple (`S`) du script est essayée comme checkpoint (`C`, avec le style de portique des autres checkpoints du circuit). On garde la candidate qui ramène l'écart maximal le plus bas parmi celles qui laissent le pilote finir sans réapparition ET permettent de repartir à l'arrêt du checkpoint (exigence du contrat). Le numéro du jeton compte à partir de 1 (le jeton 1 est le départ). Ce sont des candidates MESURÉES AU PILOTE AUTOMATIQUE : le choix final de l'emplacement, et l'essai à la main, reviennent à la conception du circuit.

### helice : 52.0 s sans point de retour (checkpoint 1 18.3 s → arrivée 70.3 s)

- **Où** : jeton n° 24 du script, entre 18.3 s et 70.3 s de la course du pilote : « … WI W WO **`C*1`** [tr01s] S3< [tr10s] … ». Écarts après : 18.3 / 26.7 / 25.3 s (maximum **26.7 s**, la règle de 30 s est respectée). 1 candidate(s) sur 11 respectent la règle.
- **Temps du pilote** : 70.3 s → 70.3 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-helice-n6q93d` → `b-helice-16mseuq`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

### cheminee : 41.7 s sans point de retour (checkpoint 1 8.5 s → arrivée 50.2 s)

- **Où** : jeton n° 28 du script, entre 8.5 s et 50.2 s de la course du pilote : « … [tr02s] S3> [tr20s] **`C*1`** B2 LPL2 S … ». Écarts après : 8.5 / 19.4 / 22.4 s (maximum **22.4 s**, la règle de 30 s est respectée). 5 candidate(s) sur 9 respectent la règle.
- **Temps du pilote** : 50.2 s → 50.2 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-cheminee-fx5grz` → `b-cheminee-j4w9t5`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

### recif : 41.1 s sans point de retour (départ 0.0 s → checkpoint 1 41.1 s)

- **Où** : jeton n° 24 du script, entre 0.0 s et 41.1 s de la course du pilote : « … N2 NO L **`C*1`** L B S3 … ». Écarts après : 26.6 / 14.5 / 2.8 / 9.1 / 9.8 s (maximum **26.6 s**, la règle de 30 s est respectée). 2 candidate(s) sur 6 respectent la règle.
- **Temps du pilote** : 62.9 s → 62.9 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-recif-1kv1fis` → `b-recif-v78ar3`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

### viaduc : 41.0 s sans point de retour (checkpoint 1 13.1 s → arrivée 54.0 s)

- **Où** : jeton n° 38 du script, entre 13.1 s et 54.0 s de la course du pilote : « … [tr02s] S3> [tr20s] **`C*1`** B2 LPL2 S … ». Écarts après : 13.1 / 21.4 / 19.6 s (maximum **21.4 s**, la règle de 30 s est respectée). 4 candidate(s) sur 7 respectent la règle.
- **Temps du pilote** : 54.0 s → 54.0 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-viaduc-1bmmabo` → `b-viaduc-ee16o`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

### epave : 40.2 s sans point de retour (checkpoint 1 6.9 s → arrivée 47.2 s)

- **Où** : jeton n° 23 du script, entre 6.9 s et 47.2 s de la course du pilote : « … WI W WO **`C*1`** ZL3 S2 TI … ». Écarts après : 6.9 / 22.3 / 17.9 s (maximum **22.3 s**, la règle de 30 s est respectée). 2 candidate(s) sur 5 respectent la règle.
- **Temps du pilote** : 47.2 s → 47.2 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-epave-1tl1gjb` → `b-epave-4ofcz2`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

### montgolfieres : 39.2 s sans point de retour (checkpoint 1 10.2 s → arrivée 49.4 s)

- **Où** : jeton n° 24 du script, entre 10.2 s et 49.4 s de la course du pilote : « … WI W WO **`C*1`** ZL3 S TI … ». Écarts après : 10.2 / 22.1 / 17.1 s (maximum **22.1 s**, la règle de 30 s est respectée). 4 candidate(s) sur 7 respectent la règle.
- **Temps du pilote** : 49.4 s → 49.4 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-montgolfieres-eovlyq` → `b-montgolfieres-vmucas`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

### rafales : 37.4 s sans point de retour (checkpoint 1 13.6 s → checkpoint 2 51.0 s)

- **Où** : jeton n° 30 du script, entre 13.6 s et 51.0 s de la course du pilote : « … L B ZR **`C*3`** ZL B S … ». Écarts après : 13.6 / 19.3 / 18.1 / 11.1 s (maximum **19.3 s**, la règle de 30 s est respectée). 4 candidate(s) sur 12 respectent la règle.
- **Temps du pilote** : 62.1 s → 62.1 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-rafales-n58bvc` → `b-rafales-1sfbeig`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

### engrenages : 36.9 s sans point de retour (checkpoint 1 12.1 s → arrivée 49.0 s)

- **Où** : jeton n° 17 du script, entre 12.1 s et 49.0 s de la course du pilote : « … [tr01s] S3< [tr10s] **`C*1`** [tr02s] S3> [tr20s] … ». Écarts après : 12.1 / 14.8 / 22.0 s (maximum **22.0 s**, la règle de 30 s est respectée). 2 candidate(s) sur 5 respectent la règle.
- **Temps du pilote** : 49.0 s → 49.0 s (inchangé). Repartir à l'arrêt du nouveau checkpoint : oui.
- **Nouvelle clé** : `b-engrenages-5shifu` → `b-engrenages-4mdg68`.
- **Empreinte de physique** (`tools/phys-fingerprint.json`) : inchangée (mesuré en mémoire) : pas de changement de `PHYS_VER`.

