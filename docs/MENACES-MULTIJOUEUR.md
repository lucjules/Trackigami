# Multijoueur : modèle de menaces (identité, rôle d'hôte, vie privée)

Écrit AVANT la correction de `TECH-010`, `TECH-040` et `TECH-051` (audit LOT-8d, `TRANS-05`, `TRANS-06`, `TRANS-16`), pour fixer ce que le jeu peut garantir et ce
qu'il ne peut pas garantir. Décision D-3 : secret de reprise, membres seuls, autorité d'hôte non déclarable ; canaux privés et relais côté serveur hors périmètre.
Le fonctionnement est décrit dans [supabase/MULTI.md](../supabase/MULTI.md).

## Ce qui est en jeu

- **La place d'un joueur** : son identifiant dans la salle, ses arrivées et ses points, sa place gardée 20 s quand il est coupé.
- **Le rôle d'hôte** : choisir le circuit et les règles, donner les départs, clore les manches, arrêter un championnat.
- **Les adresses réseau des joueurs** : leur adresse IP publique (et celle du relais TURN s'il sert), contenues dans les offres WebRTC et les candidats ICE.

## Qui attaque, avec quoi

| Adversaire | Ce qu'il peut faire |
| --- | --- |
| **Client modifié** qui connaît le code (salle privée : code partagé ; salle publique : code listé) | rejoindre le canal Realtime avec N'IMPORTE QUELLE clé de présence et n'importe quelles métadonnées (`host: true` compris) ; diffuser des messages de signalisation avec n'importe quel `from` ; ouvrir des liaisons WebRTC ; envoyer n'importe quel message de contrôle sur ses liaisons. Le serveur Realtime ne vérifie rien de tout cela (canal public, clé publique du jeu). |
| **Observateur silencieux** | s'abonner au canal sans apparaître dans la présence (comme la liste des salons publics) et lire tout ce qui y est diffusé. |
| **Membre malveillant** (une vraie place, sa propre identité) | mentir sur ses propres temps, sur ce qu'il a vu, à un arrivant. |
| Hors modèle | l'exploitant de Supabase ; un attaquant sur le réseau (TLS protège la WebSocket, DTLS les liaisons) ; un navigateur de joueur compromis. |

## Menaces et parades

| # | Menace | Parade (phase 17) | Garanti ? |
| --- | --- | --- | --- |
| M1 | **Prendre la place d'un joueur coupé** (son identifiant pendant ses 20 s) et faire compter ses arrivées ; le vrai joueur ne retrouve plus sa place | chaque joueur tire à son arrivée un **secret** : une clé ECDSA P-256 (Web Crypto), qui ne quitte jamais son navigateur ; il ne publie qu'un **engagement** : l'empreinte SHA-256 de sa clé publique. Une place n'est rendue (et une liaison n'est crue) qu'à qui **prouve** posséder ce secret. | oui, pour les membres qui ont déjà vu ce joueur |
| M2 | **Se déclarer hôte** (`host: true` dans la présence, plus petit identifiant) et faire accepter ses `start`, `rend`, `cupstop`… | l'autorité d'hôte ne vient plus de la présence : elle suit l'**ordre d'arrivée** tenu par l'hôte (liste des membres et de leurs engagements) et une **passation** (`hostover`) que chaque membre recalcule (premier présent de l'ordre ; un ordre n'est cru que de l'hôte connu et s'il ne devance personne dont la place est gardée) ; le drapeau de présence n'est plus qu'une indication pour les arrivants. | oui, pour les membres |
| M3 | **Rejouer une preuve** (copier le `hello` d'une liaison sur une autre liaison, dans une autre salle, plus tard) | la preuve est une signature sur : le code de la salle, les deux identifiants, les **deux empreintes DTLS de cette liaison**, et un **défi aléatoire** tiré par celui qui vérifie. | oui |
| M4 | **S'interposer** entre deux joueurs (offres injectées au nom de l'un, relais des messages) | les empreintes DTLS signées : celui qui relaie a d'autres empreintes que celles que voit chacun des deux joueurs, la preuve échoue. | oui |
| M5 | **Observateur silencieux** : il recueille les adresses IP de tous les joueurs (offres et candidats diffusés à tout le canal, filtrés par destinataire chez le client) | **aucune parade dans cette phase**. Chiffrer la signalisation avec le code de la salle est **sans objet** : le nom du canal EST le code, donc quiconque peut s'y abonner connaît la clé, et le code d'une salle publique est listé. Un chiffrement par paire (clés publiées par chaque joueur) cacherait les adresses à un observateur silencieux, mais pas à un membre (WebRTC les lui donne de toute façon) : l'observateur n'aurait qu'à entrer dans la salle, et y serait visible. Exposition **documentée** dans la page Confidentialité et dans `supabase/MULTI.md`. | **non** |
| M6 | **Membre malveillant** : faux temps, mensonges | hors parade : chaque joueur est seul juge de son temps (limite assumée, `supabase/MULTI.md`) ; rien d'autre n'en dépend (ni records, ni pièces, ni classements en ligne). | non |
| M7 | **Tromper un arrivant** (un membre lui ment sur l'ordre des membres ou sur l'engagement d'un joueur qu'il ne connaît pas encore) | l'arrivant croit la **majorité** des membres vérifiés ; il ne peut rien vérifier par lui-même avant d'avoir vu les joueurs. Dans une salle à deux dont l'un ment, rien ne le protège. | partiellement |
| M8 | Onglet dupliqué (le `sessionStorage`, donc le secret, est copié) | les deux onglets portent la même identité, comme avant ; non traité (hors périmètre). | non |

## Ce qu'un client pair à pair peut garantir, et ce qu'il ne peut pas

**Peut** : un message reçu sur une liaison vérifiée vient de celui qui détient la clé de cette identité (DTLS + preuve) ; une place et le rôle d'hôte ne peuvent pas être pris
par quelqu'un qui n'a jamais détenu la clé ; la présence (que le serveur ne vérifie pas) ne peut plus imposer une identité ni un hôte à un membre qui les connaît déjà.

**Ne peut pas** : cacher l'adresse IP d'un joueur aux autres joueurs, ni (sans canal privé) aux abonnés du canal ; empêcher un membre de mentir sur ce qui le concerne ; donner le
même avis à tous quand le réseau se coupe en deux (deux joueurs peuvent alors se croire hôte un moment : les résultats de manche, fusionnés depuis 0.16.15, finissent par converger) ;
protéger un arrivant d'une majorité de menteurs ; empêcher un client modifié de déranger (entrées et sorties répétées, messages refusés en nombre).

## Vérifié par

`tools/test-net.mjs` (banc simulé) : client modifié annonçant `host: true`, ordre d'arrivée usurpé, preuve de remplacement sans secret, place rendue seulement avec le secret, preuve rejouée
sur une autre liaison, une seconde fois ou dans une autre salle, descriptions WebRTC signées, arrivant trompé par un menteur, hôte coupé ou rechargé, deux salons simultanés ;
`tools/test-identite-salle.mjs` (la preuve elle-même) ; `tools/test-manche.mjs` (hôte qui recharge en pleine manche) ; `tools/test-legal.mjs` (page Confidentialité) ; `tools/test-browser.mjs`
(Chromium, trois onglets, vrai WebRTC et vrai Web Crypto : intérim, imposteur refusé, hôte revenu avec son secret). Des mutations (ordre cru de tous, premier avis cru, drapeau de présence
décisif, grâce de présence infinie) font échouer ces tests. Vérifications à faire en réel : `supabase/MULTI.md`.
