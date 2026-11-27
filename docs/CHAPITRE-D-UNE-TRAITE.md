# Chapitre d'une traite (COMPLETE-014) — design validé

Statut : **validé par le propriétaire (choix recommandés : contrat tel quel, chapitres seulement, manches neutres et « recommencer » = tout l’enchaînement)**. C'est un changement de contrat serveur : nouvelle action de la fonction `submit-score`, nouvelle famille
de clés de classement, nouvelles limites. Validé avant tout code.

## 1. Le jeu

- Depuis la carrière, sur un chapitre **ouvert**, bouton « ⏱ D'une traite » : les **6 circuits du chapitre, dans l'ordre de la carrière**, à la suite.
- Chaque circuit est une **manche** ; le chrono est le **temps cumulé** des 6 manches (somme des temps de course, en pas de simulation).
- Entre deux manches : un écran d'entracte (temps de la manche, temps cumulé, écart avec le meilleur enchaînement à la même manche),
  « Manche suivante » ou « Abandonner ». Le chrono ne tourne pas pendant l'entracte, la pause est permise comme dans une course normale :
  chaque manche est rejouée **depuis son départ**, donc ni l'entracte ni la pause n'ont d'effet sur le temps ou sur la vérification.
- **« Recommencer » (T par défaut ; R est le retour au checkpoint) reprend tout l'enchaînement à la manche 1** : sinon on referait chaque manche jusqu'à la perfection et l'épreuve serait la
  somme des meilleurs temps, pas « d'une traite ». Le retour au checkpoint reste permis (il fait partie de la course enregistrée).
- Quitter en cours de route : l'enchaînement est abandonné, rien n'est enregistré.
- Les manches ne sont **pas** des courses ordinaires : pas de record par circuit, pas de médaille, pas de pièces, pas d'objectif bonus, pas d'envoi
  au classement du circuit (comme les modes de jeu). Seul l'enchaînement complet donne un résultat : record local et classement dédié.
  Raison : six envois et six écrans d'arrivée par enchaînement, et une récompense en double pour une même course.
- Séquencement : **la classe `Championship`** (`js/net/championship.js`) sert telle quelle pour les manches (`rounds`, `nextRound`, `scoreRound`,
  `finished`), avec un seul pilote ; le temps cumulé et les commandes de chaque manche sont gardés à côté.

### Pourquoi pas la carrière entière

Mesuré : la carrière compte 84 circuits ; la somme des temps « bronze » fait **5 904 s**. La table `scores` refuse un temps ≥ 3 600 s, ses commandes
sont limitées à 400 000 caractères (une carrière en ferait ≈ 1 Mo) et le rejeu prendrait ≈ 5 s de processeur. Il faudrait une autre table et un
autre protocole (envoi par morceaux) : **hors périmètre**, seulement les chapitres (14, bonus compris).

## 2. Clé de classement

```
ch-<chapitre>-<empreinte>[~v1.as-1]
  chapitre   clé du chapitre (themes.js : CHAPTER_KEYS, ex. desert, manoeuvres)
  empreinte  hashString des 6 clés b-… du chapitre, dans l'ordre, jointes par « | »
ex. ch-desert-1k2f9az      ch-manoeuvres-0x7d3kq~v1.as-1
```

- **Composée** : l'empreinte change dès qu'un des 6 circuits change (leurs clés `b-<id>-<hash>` dépendent de tout leur code) : comme pour un circuit,
  un enchaînement modifié ouvre un nouveau classement, sans migration (même règle que RISK-001). **Aucune clé de circuit officiel ne change.**
- Le serveur **recalcule** la liste à partir de ses propres circuits (`BUILTIN_TRACKS`, même ordre que la carrière) et exige la même clé : le client
  n'envoie jamais la liste des circuits, une collision de l'empreinte 32 bits ne permet donc rien.
- 29 caractères au plus (≤ 80, conforme à `TRACK_KEY_RE` et à `scores.track_key`).
- **Catégories de record** (`variants.js`) : seule l'étiquette `as-1` (aides à la conduite) est acceptée, comme pour une course seule (`aidedKey`
  la pose ; pas de médailles). Les autres variantes (moto, gravité…) sont **refusées** sur un enchaînement en v1 : une variante qui ne s'applique pas
  à un des 6 circuits (tours sur un circuit ouvert…) demanderait des règles par manche.
- `trackForKey` (course seule) **ne connaît pas** `ch-…` : une clé d'enchaînement envoyée par l'action ordinaire est refusée, et inversement.

## 3. Format de soumission

`POST submit-score`, nouvelle action :

```json
{ "action": "submit-chain", "trackKey": "ch-desert-1k2f9az", "legs": ["<commandes base64 manche 1>", "…", "… manche 6"],
  "times": [48.108, 47.575, 58.908, 72.85, 83.4, 82.583], "time": 393.425, "physVer": 39 }
```

Le serveur, dans l'ordre (refus au premier échec, **avant** tout rejeu pour les contrôles de forme) :
1. forme : `legs` et `times` de longueur 6 exactement ; chaque commande base64 non vide ; **somme des longueurs + 5 ≤ 400 000** ; chaque temps fini,
   > 0, ≤ 600 s ; `time` ≤ 1 200 s et égal à la somme des `times` (0,003 s près) ;
2. cadence : la soumission compte comme une course (`rate_check` « submit », comme aujourd'hui) **et** dans un second compteur « chain » (la fonction
   SQL existante accepte un nom quelconque) : 3 par 10 minutes et par pilote, 600 par 10 minutes au total (60 par minute), 400 pour les sessions anonymes ;
3. rejeu : `verifyChain` (nouveau, `js/chain.js`, dans la fermeture de `verify.js`) rejoue les 6 manches **sans fantôme**, chacune sur son circuit ;
   chaque manche doit atteindre l'arrivée et redonner son temps (0,5 ms près) ; le temps retenu est **celui du rejeu** (somme des pas × DT) ;
4. écriture : `submit_best` **inchangée** : `tk` = clé d'enchaînement, `t` = temps rejoué, `inp` = les 6 commandes jointes par « , » (caractère absent
   du base64), `sp` = les fins de manche en pas cumulés (6 valeurs : classement par manche possible avec les fonctions de secteurs existantes),
   `gh` = null (pas de fantôme en v1), `strong` = null (circuits officiels), `tname` = « <chapitre> · d'une traite ».
5. réponse identique à `submit` (`improved`, `best`, `rank`, `total`). Le `GET` de la fonction liste `submit-chain` dans `actions` : le jeu sait
   dire « serveur pas encore à jour » au lieu d'un refus incompréhensible.

## 4. Limites (contrat serveur)

| Limite | Valeur | Justification |
|---|---|---|
| Nombre de manches | 6 exactement | taille d'un chapitre (`CHAPTER_SIZE`) |
| Taille des commandes | Σ + 5 ≤ 400 000 caractères | colonne `scores.inputs` ; mesuré 53 000 à 92 000 pour un chapitre (pilote automatique) |
| Taille du corps | inchangée (`MAX_BODY_CHARS` ≈ 804 Ko) | pas de code de circuit dans un enchaînement |
| Durée d'une manche | ≤ 600 s | `MAX_RUN_SECONDS`, comme une course seule |
| Durée totale | ≤ 1 200 s | 2,3 × la plus grande somme des temps bronze d'un chapitre (530 s) ; reste < 3 600 s de `scores.time` |
| Processeur | ≈ 0,9 ms par seconde de course (mesuré sous Node, 206 à 347 ms pour un chapitre) → ≤ ≈ 1,1 s au pire | à confirmer sur la plateforme : la limite processeur des fonctions Supabase (de l'ordre de 2 s) n'est pas mesurable d'ici |
| Cadence | 3 / 10 min / pilote ; 600 / 10 min au total ; 400 / 10 min anonymes | un enchaînement se joue en 4 minutes au moins ; chaque envoi vaut 6 rejeux |

## 5. Étape SQL

**Aucune étape SQL n'est nécessaire** : `scores` accepte déjà ces clés (≤ 80), ces temps (< 3 600 s), ces commandes (≤ 400 000) et 6 temps
intermédiaires (≤ 400) ; `submit_best` et `rate_check` sont génériques ; l'archivage au changement de physique (`archive_old_scores`) les traite comme
les autres ; la boîte de réception (« ton temps a été battu ») les voit avec leur titre. `npm run test:sql` ne sera donc pas touché.
**La fonction serveur doit être reconstruite (`npm run build:function`) et redéployée à la main** (la fermeture de `verify.js` change) ; d'ici là,
le jeu dit que le serveur n'est pas à jour et garde le record sur l'appareil.

## 6. Le reste

- **PHYS_VER ne change pas** (aucune physique touchée). Équité : les mêmes circuits, la même physique, le temps du serveur ; aides → catégorie à part.
- Record local `rec3.ch-…` : `{ time, splits (fins de manche, en pas cumulés), inputs (les 6 commandes jointes par « , »), chain: true, pv, date, name }` (mise en œuvre : `validRecord` accepte jusqu'à 1 200 s quand `chain: true`, une course seule reste à 600 s) (synchronisé comme les autres `rec3.*`) ; pas de
  « Revoir la course » ni de partage de fantôme pour un enchaînement en v1.
- Tests prévus : `tools/test-chain.mjs` (clé, liste recalculée, refus : mauvais nombre, ordre, manche truquée, temps faux, limites, variantes, clé
  croisée ; rejeu accepté sur un chapitre réel avec le pilote automatique ; budget processeur mesuré), `test-submit-handler.mjs` (action, cadence,
  écriture), non-régression des catégories (`test-variants`, `check-categories`, clés officielles inchangées), test navigateur (enchaînement de bout en
  bout avec des manches courtes), textes traduits (`test-i18n`, `i18n-scan`).

## 7. Mise en œuvre (0.24.0)

`js/chain.js` (clé, liste, limites, forme), `verifyChain` dans `js/verify.js`, action `submit-chain` dans `supabase/functions/submit-score/handler.js`,
`js/chainRun.js` (séquencement par `Championship`), `js/app/chain.js` (écrans), `js/race.js` / `js/race/finish.js` (manche neutre, « recommencer »).
Mesure du test `tools/test-chain.mjs` : 124 ms pour les 232 s du chapitre 14 (0,53 ms par seconde de course), soit ≈ 640 ms estimées pour 1 200 s.
Écart avec la proposition : la cadence est exprimée sur la fenêtre de 10 minutes de `rate_check` (600 au total, 400 anonymes : le même débit que 60 et 40 par minute).
