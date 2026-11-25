# Multijoueur en direct : installation et fonctionnement

Jusqu'à 8 joueurs, trois modes au choix de l'hôte :
- **Course libre** : le même circuit, chacun à son rythme, vus en **voitures fantômes** (aucune collision), chacun avec son chrono (voir « Boucle de jeu asynchrone » plus bas) ;
- **Championnat** : plusieurs circuits à la suite, départ commun sur une grille, points par place, classement général, collisions douces en option (voir « Championnat ») ;
- **Course** : un championnat d'une seule manche (départ commun, classement à l'arrivée, revanche).

Menu principal > *Multijoueur* : *Créer une salle* (code de 6 caractères), *Rejoindre* par code, ou *Salons publics* (liste, sans code).

## Réseau en deux temps

1. **Supabase Realtime : annuaire et signalisation seulement.** Le code de salle est le nom d'un canal
   (`copytrack-room-CODE`). Il sert à voir qui est là (présence) et à échanger quelques messages (offres WebRTC, candidats
   ICE) : de l'ordre de 10 messages par paire de joueurs, une seule fois. Aucune table, aucun script SQL.
2. **WebRTC pair à pair : tout le jeu.** Chaque joueur ouvre une liaison directe vers chacun des autres (maillage).
   Deux canaux par liaison : `state` (non fiable, 20 paquets de 40 octets par seconde) et `ctl` (fiable : circuit, départ,
   arrivée, ping, championnat). Le détail de la négociation est commenté en tête de `js/net/transport.js`.

Trafic : environ 0,8 Ko/s par liaison, rien sur Supabase pendant la course.

## Politique de sécurité de la page (0.16.18)

La signalisation ouvre un WebSocket `wss://<projet>.supabase.co/realtime/v1/websocket`. La balise `Content-Security-Policy` d'`index.html` doit donc citer le projet
**en `https://` et en `wss://`** dans `connect-src` : une source `https://` n'autorise pas `wss://` (constaté sous Chrome 158, ordinateur et Android). Jusqu'en 0.16.17 elle ne citait
que `https://` : « Créer une salle » et « Rejoindre » échouaient **toujours**, sur tous les appareils, avec « Connexion au serveur de salons impossible. » (le WebSocket est refusé
avant de partir : rien n'apparaît dans les journaux Realtime de Supabase). Les essais à plusieurs onglets (`?net=local`) ne passent pas par Supabase et ne l'avaient pas vu ;
`tools/test-browser.mjs` vérifie maintenant la vraie signalisation sous la vraie politique, et `tools/test-securite-client.mjs` exige les deux origines.

## À vérifier dans Supabase (une fois)

- *Realtime > Settings* : laisser **« Allow public access »** activé (les canaux de salle sont publics). Si vous le
  désactivez, il faudra des canaux privés avec une politique d'autorisation (non prévu ici).
- Limites de votre offre (connexions simultanées, messages par seconde) : à ce rythme elles ne sont pas un souci.

## Réseaux qui bloquent le pair à pair (relais TURN)

Les serveurs STUN publics (`iceServers` de `js/config.js`) suffisent pour la plupart des box. Un réseau d'entreprise, ou certaines connexions
mobiles (NAT symétrique : 10 à 20 % des paires), empêche la liaison directe : la salle affiche alors « ✕ liaison impossible » pour cet adversaire.
Il faut pour cela un **relais TURN**. Le jeu l'obtient auprès de la fonction serveur `ice`, qui fabrique des identifiants
**à durée limitée** (1 h par défaut, 2 h au plus) : aucun secret durable n'est lisible dans le jeu. Depuis 0.16.14 (TECH-050), les serveurs sont redemandés **à chaque connexion
neuve** (arrivant tardif, liaison refaite après une coupure) et **avant chaque relance ICE** ; le chargeur ne refait la requête qu'aux 3/4 de leur durée (sinon il rend
ceux qu'il a). Sans la fonction (ou en cas de panne), le jeu retombe sur le STUN seul, sans attendre plus de 2,5 s.

Déploiement (une fois, Supabase > Edge Functions) :
1. Nouvelle fonction **`ice`**, code = `supabase/functions/ice/index.ts` (généré : `npm run build:function`). Laisser « Verify JWT » activé (le jeu envoie sa clé publique) : la fonction exige en plus une **session Supabase valide** (invité ou compte) et **refuse** de répondre si `SUPABASE_URL` / la clé de service lui manquent. Prérequis : `supabase/etape15-backend.sql` (limitation en base).
2. Secrets de la fonction, **l'un ou l'autre** :
   - **Cloudflare Realtime TURN** (gratuit jusqu'à un quota généreux) : `TURN_KEY_ID` et `TURN_KEY_API_TOKEN` (créés dans le tableau de bord Cloudflare > Realtime > TURN) ;
   - **coturn auto-hébergé** : `TURN_URLS` (séparées par des virgules, ex. `turn:turn.exemple.fr:3478?transport=udp,turns:turn.exemple.fr:5349`) et `TURN_SECRET`
     (la valeur de `static-auth-secret` de coturn, avec `use-auth-secret` activé).
   Facultatifs : `STUN_URLS`, `ICE_TTL_S` (durée de vie en secondes, 600 à 7 200 ; 3 600 par défaut), `ALLOWED_ORIGIN`.
3. Rien à changer dans le jeu : `iceUrl` (`js/config.js`) vise déjà `<projet>/functions/v1/ice` ; `iceUrl: ''` désactive l'appel.

Sans secret configuré, la fonction répond 501 et le jeu n'insiste pas avant 10 minutes. Elle limite à 10 demandes par minute et par **pilote**, 300 par minute pour tous (dont 200 au plus pour les sessions anonymes), **en base** : la limite survit aux redémarrages et vaut pour toutes les instances. Si la base de limitation ne répond pas, la fonction répond 503 (jamais d'identifiants distribués sans limite fiable).

## Coupures et reconnexion (0.9.38, protocole `NET_VER` 4)

Une coupure (Wi-Fi qui saute, passage en 4G, onglet rechargé) ne fait plus sortir de la salle (`js/net/resume.js`) :
- **le joueur coupé** garde sa salle ouverte et sa course continue ; il retente de rejoindre le canal avec le **même identifiant** (après 0,8, 1,5, 2,5, 4 et 6 s,
  puis toutes les 6 s tant qu'une de ses liaisons de jeu est ouverte ; sans aucune, il abandonne au-delà de 20 s) ;
  un onglet rechargé reprend sa place s'il revient dans les 20 s (identifiant et **secret de reprise** gardés en `sessionStorage` ; voir « Identité, rôle d'hôte et vie privée ») ;
- **les autres** continuent de jouer avec lui tant que leur liaison WebRTC marche (0.16.14, TECH-046 : une coupure de la seule signalisation ne fige plus rien) ;
  quand sa liaison tombe aussi, ils lui gardent sa place **20 s** (« ⏳ reconnexion » dans la liste) : il reste sur la grille, la manche ne se clôt pas sans lui (dans la
  limite des délais habituels), et son arrivée compte s'il finit ; au-delà, sa place est rendue ;
- **à son retour**, chacun lui envoie `hello`, l'hôte lui renvoie l'état complet (règles, circuit ou championnat **avec les arrivées de la manche en cours**) et
  lui renvoie l'arrivée qu'il aurait annoncée pendant la coupure ;
- **un départ volontaire** (« Quitter la salle ») envoie `bye` : sa place n'est pas gardée ;
- **hôte absent** (0.16.16) : le suivant dans l'**ordre d'arrivée** fait l'intérim dès que la liaison de l'hôte est tombée (6 s), se **marque** hôte (`hostover`) et clôt les
  manches ; l'hôte qui revient dans les 20 s **avec son secret** reprend la main après avoir reçu l'état de la salle ; au-delà, sa place est rendue.

## Signalisation et liaisons (0.16.14, audit LOT-8b, `TRANS-06`)

Ce qui est fait côté client (`js/net/signaling.js`, `transport.js`, `room.js`, `directory.js`), **sans changer aucun format de message** (`NET_VER` reste 4) :

- **Présence par connexion** (TECH-011) : comme le client Phoenix officiel, une entrée par connexion (`phx_ref`) ; un joueur est présent tant qu'il lui reste une
  entrée ; un départ (`leaves`) ne retire que son entrée. Reconnexion avant que le serveur ait fermé l'ancienne connexion, ou onglet dupliqué : aucun faux départ.
  Repli : une entrée sans `phx_ref` vaut pour toute la clé.
- **Pertes** (TECH-012) : `phx_close`, `phx_error`, un message `system` d'erreur (jeton expiré ou refusé) et un **battement sans réponse au bout de 10 s** ferment la
  connexion et déclenchent la reconnexion. Le **jeton du canal** est renouvelé par un message `access_token` dans sa dernière minute et demie (lu dans le JWT) ;
  après l'échéance, le serveur ferme le canal et la reconnexion prend un jeton neuf. Aucun jeton n'est écrit dans un journal.
- **Tentatives abandonnées** (TECH-044, TECH-082) : délai, refus, fermeture ou départ pendant la jonction : la connexion est fermée (au revoir si le canal était
  rejoint), une réponse tardive ne publie plus rien. Même règle pour l'annuaire ; décocher « Salon public » pendant l'annonce n'annonce rien et n'affiche aucune erreur.
- **Signalisation des seuls membres** (TECH-045) : un message d'un identifiant absent de l'annuaire (inventé, ou joueur parti dont un candidat ICE arrive en retard)
  n'ouvre aucune liaison ; une liaison sans membre est fermée.
- **Liaisons découplées** (TECH-046) : la signalisation peut tomber, les liaisons WebRTC ouvertes continuent. Une liaison n'est refaite (connexion neuve) que si elle
  tombe vraiment : canal fermé, ou **silence de 10 s malgré 3 pings** ; au retour de la signalisation, les liaisons qui n'étaient pas ouvertes sont refaites.
  Les arrivées de course libre qu'un joueur n'a pas reçues (liaison fermée, ou envoyées depuis sa dernière réponse) lui sont **renvoyées** à la réouverture.
  L'hôte conduit la manche tant qu'il a des liaisons ouvertes, même sans signalisation.
- **Capacité** (TECH-086) : 8 joueurs **places gardées comprises**. L'arrivant ne voit que l'annuaire (les absents n'y sont pas) : ce sont les membres qui
  refusent un 9e (aucune liaison, pas de place sur la grille) et l'admettent dès qu'une place est rendue. **Limite** : le 9e n'est pas prévenu par un message
  (il faudrait un nouveau message de protocole, non prévu en 0.16.15) ; il voit les joueurs en « connexion… ».

### À vérifier sur le vrai Realtime (rien de cela n'a été observé : le banc `tools/fake-realtime.mjs` est une modélisation)

Sur un projet de test, deux navigateurs (ou deux profils), la console ouverte. Pour observer les messages **sans jamais afficher de jeton** :
`const s = copytrack.room.signaling, log = []; const on = s.ws.onmessage; s.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (/presence|phx_|system/.test(m.event)) log.push({ t: Date.now(), e: m.event, p: JSON.stringify(m.payload).replace(/"access_token":"[^"]+"/, '"access_token":"…"') }); on(e); };`

1. **Deux connexions de la même clé** (TECH-011). Dans l'onglet de Bea : `const S = s.constructor, s2 = new S({ code: s.code, selfId: s.selfId, getToken: s.getToken }); await s2.join(s.meta);`
   Chez Ana : `copytrack.room.signaling._pres.get('<id de Bea>').length` doit valoir 2 ; le `presence_diff` reçu ne contient que la nouvelle entrée (`phx_ref` distinct).
   Puis `s2.leave()` : chez Ana, une entrée, `peers.has('<id de Bea>')` reste vrai, aucun « ⏳ ». Noter : `phx_ref` toujours présent dans `leaves` ? `phx_ref_prev` sur une mise à
   jour (`setReady`) ? Si `leaves` arrive sans `phx_ref`, le repli s'applique (comportement d'avant).
2. **Reconnexion avant la fermeture de l'ancienne** : chez Bea, DevTools › Réseau › « Hors ligne » 5 s (la WebSocket tombe ; le WebRTC n'est en principe pas
   concerné par ce réglage : à confirmer). Mesurer chez Ana le délai avant le `leaves` de l'ancienne connexion, et si la nouvelle arrive avant. Attendu : Bea reste
   reliée chez Ana (liste sans « ⏳ »), sa voiture continue d'avancer, `copytrack.room.reconnecting` repasse à faux chez Bea.
3. **Expiration du jeton** (TECH-012). Réduire la durée des JWT du projet de test (Auth › JWT expiry, par exemple 300 s), jouer 15 min. Compter chez Bea les envois :
   `const send = s.ws.send.bind(s.ws); let n = 0; s.ws.send = (t) => { if (JSON.parse(t).event === 'access_token') n++; send(t); };` → `n` augmente toutes les ~5 min, aucun
   `system` d'erreur ni `phx_close` dans `log`, la présence reste. Puis couper le renouvellement (`s.getToken = null; clearTimeout(s._tokTimer)`) et attendre l'échéance :
   relever le message exact du serveur (`system` avec `status: 'error'` ? suivi de `phx_close` ?) et vérifier que `reconnecting` passe à vrai puis à faux.
4. **Battements** : relever qu'une réponse `phx_reply` (sujet `phoenix`) suit chaque battement en moins de 10 s, y compris sur mobile en 4G ; sinon, augmenter `HEARTBEAT_TIMEOUT`.
5. **Réponse tardive** (TECH-044) : difficile à provoquer ; à défaut, vérifier qu'après un échec de jonction (code de salle refusé, réseau coupé) aucune connexion ne
   reste ouverte (DevTools › Réseau › WS : toutes fermées sauf la connexion active).
6. **Salon public retiré pendant l'annonce** (TECH-082) : cocher puis décocher « Salon public » aussitôt ; *Salons publics* (autre navigateur) : rien n'apparaît.
7. **Serveurs ICE** (TECH-050) : fonction `ice` déployée avec `ICE_TTL_S=600` ; salle ouverte plus de 8 min, puis un arrivant derrière un réseau qui exige le relais : liaison
   ouverte ; `copytrack.room.mesh.links.get('<id>').pc.getConfiguration().iceServers` porte un nom d'utilisateur récent (horodaté).
8. **Capacité** (TECH-086) : 8 joueurs, l'un passe hors ligne (place « ⏳ ») ; un 9e rejoint : il n'apparaît chez aucun des 7 ; au retour de l'absent, celui-ci retrouve sa place ;
   s'il ne revient pas, le 9e est admis 20 s plus tard.

**Collisions unifiées** : la voiture de l'autre est affichée avec ~100 ms d'interpolation et une demi-latence de retard. Pour les collisions douces, elle est
ramenée **au même instant** que la sienne (position + vitesse × retard, plafonné à 0,25 s) : les deux joueurs voient le même contact au même moment, au lieu
d'un choc contre une voiture fantôme d'un côté et d'un passage au travers de l'autre.

**Relais TURN** : le code est prêt depuis 0.9.21 (fonction `ice`, plus haut). Sa **mise en service** demande un compte TURN (Cloudflare Realtime ou coturn) et
ses secrets dans Supabase : sans eux, 10 à 20 % des paires de joueurs (NAT symétrique) ne peuvent pas se relier.

## Championnat (manches)

L'hôte choisit *Championnat* dans le salon : nombre de manches (2 à 6), sélection de circuits (tous, faciles, moyens, difficiles, un thème), collisions douces.
Les circuits sont tirés au sort **sans doublon et du plus facile au plus dur** (circuits intégrés ou de la communauté ; pas de code de circuit envoyé).

- **Départ commun** : l'hôte annonce la manche (`round`) avec la liste des joueurs prêts, dans l'ordre de la grille (classement général ; première manche : ordre d'arrivée dans la salle) ;
  chacun démarre au même « GO » (compensé de la moitié de son aller-retour) sur sa place : quatre de front, rangées de 6 m.
- **Points** : 10, 8, 6, 5, 4, 3, 2, 1 par place, rien sans arrivée. **Classement général** (0.16.15, TECH-085) : seulement les joueurs qui ont été sur la grille d'au moins une manche classée
  (un membre qui n'a jamais couru n'y figure pas). Égalité : plus de victoires de manche, puis meilleure **moyenne** des places (une manche sans arrivée vaut la place après le dernier de
  cette manche), puis identifiant. La moyenne, et non la somme : la somme avantageait celui qui avait joué moins de manches.
- **Clôture d'une manche** (décidée par l'hôte, message `rend` avec le temps de chacun) : tous ont fini ou quitté, ou 30 s après la première arrivée, ou 10 minutes après le « GO ».
  Ceux qui roulent encore s'arrêtent, sans temps. Résultats + classement général pendant 12 s, puis manche suivante ; après la dernière, podium et retour au salon.
- **Pas de nouvel essai** en manche (`R` = retour au checkpoint, le chrono continue). Quitter la manche = quitter la salle (les autres continuent sans toi).
- **Classement en direct** : chaque paquet d'état porte l'avancement (0 à 1) de la voiture sur la ligne centrale du circuit (`js/net/progress.js` ; sans ligne centrale : checkpoints franchis).
- **Collisions douces** (option) : `js/net/collide.js`. Chaque voiture est un disque de 1,15 m de rayon ; chaque joueur applique SA moitié du choc à SA voiture d'après la position affichée de l'autre
  (rien en looping, rien 2 s après un retour au checkpoint, rien contre une voiture arrivée, ni contre une voiture dont les paquets n'arrivent plus depuis 0,5 s, dont le lien n'est pas
  ouvert ou dont le joueur est revenu au salon). Pas de physique rejouable : aucun record n'en dépend. **Plafonds réels** (0.16.17, TECH-041) : la variation de vitesse due aux
  collisions est d'au plus **2,5 m/s par pas** de 1/120 s, **toutes voitures confondues** (300 m/s², ≈ 31 g) ; la poussée de séparation (chevauchement) d'au plus 0,32 m/s par pas
  (≈ 4 g) ; l'impulsion d'un contact d'au plus 30 m/s. L'impulsion est calculée **une fois par contact** (vitesse d'approche du début du contact, restitution 0,35) en supposant
  que l'autre reçoit la même en sens contraire tant que sa réaction n'est pas visible (l'affichage a ~100 ms de retard) : l'échange n'est plus doublé (rattrapage 40 → 30 m/s :
  33,2 / 36,8 ; face-à-face 2 × 20 m/s : rebond de ± 7 m/s). Au-delà de ≈ 2 × 30 m/s d'approche (face-à-face à pleine vitesse), le plafond par pas ne suffit pas à arrêter les
  voitures dans le chevauchement : elles se traversent en perdant chacune la même vitesse. Une vitesse annoncée au-delà de 150 m/s, ou sans rapport (plus de 40 m/s d'écart)
  avec le déplacement depuis le paquet précédent (ou invérifiable : premier paquet, premier après une téléportation ou un trou de plus de 0,3 s), n'est pas crue : la voiture est
  hors des collisions tant que ce paquet est affiché.
  *Avant 0.16.17*, ce document annonçait une poussée limitée à environ 4 g : seule la poussée de séparation l'était ; le terme de choc ajoutait jusqu'à 8 m/s par pas et par voiture.
- **Hôte parti ou absent** : le suivant dans l'ordre d'arrivée (voir « Identité, rôle d'hôte et vie privée ») devient hôte et reprend la clôture et les départs (l'état du championnat est copié chez tous). Un joueur qui arrive en cours de route
  reçoit le championnat (`cup`), voit le circuit et « Manche en cours : tu joueras la suivante » (GAME-008), suit la manche sans la courir et part à la suivante. Un `rend` manqué est
  rattrapé par le résultat joint au `round` suivant, ou par l'état que l'hôte renvoie quand la liaison se rouvre : le joueur revenu après la clôture voit les résultats de SA manche,
  sa course s'arrête (TECH-047).
- **Migration d'hôte après une clôture manquée** (TECH-048) : chaque manche rangée ne fait que **s'enrichir** (union des arrivées : un temps connu n'est jamais remplacé, un résultat
  plus pauvre n'écrase jamais un plus riche) ; un joueur qui en sait plus que l'hôte (nouvel hôte, ou second `rend` plus pauvre) lui envoie son état (`cupsync`), l'hôte reprend
  l'état le plus complet et le renvoie à tous : tous les classements convergent, arrivants compris.

Messages fiables : `cup` (le championnat et l'état de la manche), `round` (départ de la manche n : joueurs, noms, délai, résultat précédent), `finish` avec `rn` (mon temps pour la manche n),
`rend` (manche close : temps de tous, délai avant la suivante), `cupstop` (l'hôte arrête), `cupsync` (un joueur → l'hôte : son état, voir plus haut). Tous portent l'**époque** du
championnat (voir « Époque de lancement »). **Seuls les messages de l'hôte** (`cup`, `round`, `rend`, `cupstop`) sont pris en compte, `cupsync` seulement par l'hôte et seulement pour
enrichir ; tout est borné et vérifié à la réception.

## Époque de lancement et état de la salle (0.16.15, protocole `NET_VER` 5, audit LOT-8a, `TRANS-05`)

**Avant** : les messages de course ne portaient ni numéro de lancement ni circuit ; « une course a été lancée » était un état mémorisé (`started`) jamais remis à zéro, envoyé avec
chaque choix de circuit : un invité resté au salon était relancé chaque fois que l'hôte parcourait la liste des circuits (TECH-008), une arrivée en vol était créditée au circuit
suivant (TECH-042), une arrivée en attente était rejouée dans un nouveau championnat (TECH-084).

**Époque** `e` : un entier, propre à la salle, incrémenté par l'hôte à **chaque lancement** (course libre, championnat, « Course », revanche). Chacun suit l'époque des messages de
l'hôte ; un nouvel hôte numérote au-delà du plus grand numéro vu (`hello` le porte aussi). Une manche est identifiée par (`e`, `n`).

| Message | Envoyé par | Contenu (NET_VER 5) | Reçu |
| --- | --- | --- | --- |
| `track` | hôte | `e`, circuit choisi (`id`, `name`, `sig`) | met à jour le circuit affiché au salon ; **ne lance jamais** ; ignoré si `e` est périmé |
| `start` | hôte | `e`, circuit, délai | lance la course libre si `e` est NOUVEAU ; un même lancement ne relance pas |
| `live` | hôte | `e`, `on`, circuit | la course libre que l'hôte **court réellement** (on : vrai), ou sa fin (hôte au salon) |
| `finish` (libre) | chacun | `e`, circuit `t`, temps, `sync` | compte pour SON lancement et SON circuit ; plus ancien : ignoré ; à venir : gardé de côté |
| `cup` | hôte | `e`, championnat, état de la manche (phase, `n`, grille, arrivées, délais) | nouveau championnat si `e` est nouveau ; sinon fusion (phase qui n'avance que vers l'avant) |
| `round`, `rend`, `cupstop`, `finish` (`rn`) | hôte / chacun | `e` + manche `n` | seulement pour l'époque courante |
| `cupsync` | joueur → hôte | `e`, son championnat et son état | l'hôte fusionne (union) et renvoie `cup` à tous si quelque chose a changé |

**État de la salle dérivé de l'hôte** (plus aucun état mémorisé qui relance) :

```
salon ──start(e nouveau)──► course libre e ──retour au salon──► salon        (track : ne fait que changer le circuit affiché)
  │                              ▲   └─ R : nouvel essai (même e)
  │      live(e, on) et e jamais couru (arrivant) : départ dans 1,5 s ; déjà couru (revenu au salon) : bouton « Rejoindre la course »
  │      live(on : faux) (hôte au salon) : personne n'est lancé
  └──cup(e nouveau)──► manche n (grille) ──rend(e, n)──► résultats ──(12 s)──► manche n+1 … ──► podium ──► salon
                         └─ pas sur la grille (arrivant) : « Manche en cours : tu joueras la suivante » ; cupstop(e) : retour au salon
```

- **Course en cours** : un arrivant la déduit du message `live` (l'hôte la court en ce moment) : s'il ne l'a jamais courue, il y entre (décompte de 1,5 s) ; quand l'hôte est au salon,
  personne n'est lancé. Un joueur revenu au salon n'y est plus jamais renvoyé par un choix de circuit ou une liaison qui se rouvre ; il peut la rejoindre (« Rejoindre la course »).
- **Arrivées** : la course garde l'époque de son lancement ; une course d'un lancement précédent (encore à l'écran pendant le chargement du suivant) ne compte plus. Un arrivant garde les
  meilleurs temps reçus avant d'apprendre le lancement en cours. L'arrivée en attente d'un championnat (renvoyée à l'hôte après une coupure) est liée à son époque et à sa manche,
  effacée à l'arrêt, à « Relancer » et à tout nouveau lancement (TECH-084).
- **Deux départs rapprochés** (circuit de la communauté lent à télécharger, puis un intégré) : seul le dernier demandé est lancé (TECH-049).
- **Versions** : un joueur d'un autre `NET_VER` (ou `PHYS_VER`) est refusé à l'entrée (« Version du jeu différente de celle de l'hôte : recharge la page. ») et marqué « autre version »
  dans la liste ; il ne peut ni courir ni envoyer de message de course.

**À vérifier sur de vraies machines** (le banc et les trois onglets d'un même navigateur ne remplacent pas un vrai réseau) : trois appareils sur des réseaux différents ; (1) course libre,
retour au salon, l'hôte parcourt la liste des circuits : personne n'est lancé ; (2) un 4e joueur rejoint pendant que l'hôte court : il part ; pendant que l'hôte est au salon : il reste
au salon ; (3) relancer sur un autre circuit pendant qu'un invité franchit l'arrivée : son temps reste sur l'ancien tableau ; (4) championnat : couper le Wi-Fi d'un invité 25 s pendant la
clôture, le rétablir : il voit les résultats de sa manche ; (5) migration : l'hôte part juste après une clôture qu'un invité a manquée (Wi-Fi coupé quelques secondes) : les trois
classements finaux sont identiques ; (6) un circuit de la communauté puis, aussitôt, un circuit intégré : l'invité court l'intégré.

Limite assumée : il n'y a pas de serveur de jeu, **chacun est seul juge de son temps**. Un tricheur peut annoncer un faux temps ; rien d'autre n'en dépend (ni record, ni pièces, ni classement en ligne).

## Identité, rôle d'hôte et vie privée (0.16.16, audit LOT-8d, `TECH-010`, `TECH-040`, `TECH-051`, `TRANS-05`, `TRANS-06`, `TRANS-16`)

Modèle de menaces, écrit avant le code : [docs/MENACES-MULTIJOUEUR.md](../docs/MENACES-MULTIJOUEUR.md) (ce qu'un client modifié, un observateur silencieux ou un membre malveillant
peut faire, ce qui est paré, ce qui ne l'est pas). **Décision D-3** : secret de reprise, membres seuls, autorité d'hôte non déclarable ; **canaux privés et relais côté serveur : hors
périmètre**. Rien de ce qui suit n'est inviolable : un pair à pair n'a pas d'arbitre ; chaque garantie dit pour qui elle vaut.

**Pourquoi** : le canal Realtime est public et la présence est déclarée par le client (clé et métadonnées non vérifiées) : n'importe qui qui connaît le code pouvait annoncer `host: true`,
reprendre l'identifiant d'un joueur coupé, ou recevoir une salle « introuvable » parce que l'hôte rechargeait sa page.

### Identité (`js/net/identity.js`, Web Crypto seulement : ECDSA P-256, SHA-256 ; aucune dépendance)

- **Secret de reprise** : à son arrivée, chaque joueur tire une paire de clés ECDSA P-256. La clé privée **ne quitte jamais le navigateur** (ni présence, ni message, ni journal, ni DOM) ; elle est
  gardée en `sessionStorage` (propre à l'onglet, 20 s de validité renouvelées toutes les 5 s) pour retrouver sa place après un rechargement. **Engagement** : l'empreinte SHA-256 de la clé
  publique (43 signes, `meta.c` dans la présence) : c'est la seule chose publiée.
- **Poignée de main sur chaque liaison ouverte** : la liaison passe `connecting → proving → open`. Chacun envoie un défi aléatoire (`hi {n}`, 16 octets) ; l'autre répond `hello {pub, sig, e}` : une
  **signature** (jamais le secret, qu'un membre pourrait rejouer) sur le code de la salle, les deux identifiants, **les deux empreintes DTLS de cette liaison** et le défi. Elle ne se rejoue donc ni sur
  une autre liaison, ni dans une autre salle, ni plus tard, et celui qui relaierait les messages (autres empreintes DTLS de chaque côté) ne peut pas la produire. Elle est vérifiée contre l'engagement
  attendu (déjà prouvé, sinon celui de la présence), comparé **à temps constant**. Avant la preuve : paquets d'état ignorés, messages de contrôle gardés (64 au plus) et traités après, jetés si elle est refusée.
- **Engagement épinglé** à la première preuve, pour toute la vie de la salle : une connexion de l'annuaire qui annonce un identifiant connu avec un autre engagement est ignorée.
- **Offres, réponses et candidats ICE WebRTC signés** (`seal` / `vet`, `sealIce` / `vetIce`, `transport.js`) : une offre ou une réponse porte la signature de son empreinte DTLS (et,
  pour une réponse, de celle de l'offre), un candidat celle de son texte et de l'empreinte de la connexion de son auteur ; ce qui ne vient pas de l'identité attendue est écarté avant
  de rien ouvrir. Les candidats comptent : non signés, ceux d'un imposteur suffisaient (constaté en essai, Chromium) à bloquer la liaison du vrai joueur.
- **Place d'un absent** : elle n'est rendue qu'à celui qui prouve le secret. Un client modifié qui prend l'identifiant d'un joueur coupé n'obtient ni liaison, ni arrivées comptées.
- Une page non sécurisée (sans Web Crypto, hors https) ne peut pas jouer en ligne : message clair, traduit.

### Rôle d'hôte : ordre d'arrivée, intérim, retour

- **Plus jamais déclaré par la présence.** Le drapeau `host` n'est qu'une indication (pour dire à un arrivant quelle version la salle joue) ; il ne donne aucun droit.
- **Ordre d'arrivée** : `[[identifiant, engagement]…]`, le créateur d'abord, puis chaque joueur au rang où l'hôte l'a vu apparaître (une fois son identité prouvée), tenu par l'hôte et envoyé à
  chacun (`order`, et dans `hostover`). **L'hôte est le premier présent de l'ordre** : présent = liaison ouverte (ou tombée depuis moins de 6 s), ni absent, ni revenu sans preuve, ni d'une autre version.
  Chaque membre le recalcule seul ; `_checkHost` tourne à chaque changement (arrivée, absence, retour, départ, ordre reçu).
- **Un ordre n'est cru que de celui que je tiens pour l'hôte**, et seulement s'il ne passe pas devant un joueur dont je garde encore la place : un membre qui se met en tête, ou qui parle au nom de
  l'hôte, n'évince personne. Un **arrivant** (ou un joueur revenu d'une longue coupure) croit la **majorité** des membres vérifiés, pas le premier avis ; une salle à deux ne peut pas s'en défendre (limite).
- **Intérim** (hôte coupé ou onglet fermé, moins de 20 s) : dès que sa liaison est tombée depuis 6 s (la présence d'une connexion morte peut rester 30 s côté serveur), le suivant devient hôte, se
  marque dans la présence, annonce `hostover` et sa course libre en cours, et **clôt les manches à temps** ; chacun lui renvoie l'état de son championnat et son arrivée en attente (`cupsync`,
  comme en 0.16.15). La salle reste **rejoignable** : elle existe tant que quelqu'un y est, même sans drapeau.
- **Retour de l'hôte avec son secret** : il rejoint (même identifiant), reçoit l'état de la salle de celui qui l'a tenue (règles, circuit ou championnat, ordre), **puis** reprend le rôle (4 s au plus
  d'attente) ; l'intérimaire retire son drapeau. Le délai d'absence n'est **pas remis à zéro** par un retour qui ne s'est pas relié (preuve non faite) : une place gardée 20 s est rendue 20 s après la coupure.
  Sans son secret (autre onglet, rechargement après 20 s), il n'a plus de place : il rejoint comme un arrivant, en dernier de l'ordre.
- **Après la séparation du réseau** deux joueurs peuvent un moment se croire hôtes (aucun arbitre) ; les résultats de manche, fusionnés depuis 0.16.15, convergent (voir « Époque de lancement »).

| Message (NET_VER 5) | Envoyé par | Contenu | Reçu |
| --- | --- | --- | --- |
| `hi` | chacun, à l'ouverture d'une liaison | `n` : défi de 16 octets | l'autre signe et répond |
| `hello` | chacun | `pub`, `sig`, `e` (époque vue) | vérifié contre l'engagement attendu ; vrai : la liaison est « ouverte » |
| `order` | hôte | `o` : ordre d'arrivée avec les engagements | cru seulement de l'hôte que je connais, si l'ordre ne devance personne dont je garde la place |
| `orderq` | joueur revenu d'une longue coupure | — | l'ordre lui est renvoyé |
| `hostover` | nouvel hôte | `o` | comme `order` ; chacun lui donne son état de championnat |

**`NET_VER` reste 5** : le changement de protocole de cette phase (poignée de main, ordre, descriptions signées) s'ajoute à celui de la 0.16.15 (époque de lancement), qui n'a pas été publié
(branche de travail, aucune version diffusée) ; selon la règle commune, on ne le réincrémente pas. **À réincrémenter avant toute publication qui laisserait en jeu des joueurs de la 0.16.15** : ils
ne répondent pas à `hi` et seraient refusés (« en connexion… »), sans message d'erreur plus précis.

**Limite constatée en essai : le déni de service d'un abonné du canal.** La signalisation est diffusée à tous les abonnés (le filtrage par destinataire se fait chez le client) : un abonné lit
les offres destinées à un joueur, et son navigateur peut y **répondre** (en usurpant l'expéditeur : rien ne le vérifie côté serveur). La réponse est écartée (signature), mais son navigateur
connaît alors les identifiants ICE de l'offre et peut sonder directement l'autre joueur : l'établissement de la liaison du vrai joueur peut échouer tant que l'abonné continue (essayé : avec un
imposteur qui garde l'identifiant d'un absent, la liaison du vrai joueur restait bloquée dans environ deux essais sur trois avant la signature des candidats, un sur cinq après ;
quand l'imposteur est parti, elle s'ouvre à chaque fois). Il ne peut **ni prendre la place, ni le rôle, ni faire compter un temps** ; il peut empêcher une liaison de s'ouvrir. Seul un chiffrement de
la signalisation vers la clé de chaque joueur (clés publiées dans la présence, ECDH et AES-GCM de Web Crypto) le préviendrait, et cacherait aussi les adresses aux abonnés qui ne jouent pas :
**non fait** (hors périmètre de cette phase, qui borne le travail à D-3) ; à décider avant un jeu ouvert à des salons publics nombreux.

### Ce qui reste exposé (TECH-051) : les adresses IP

Les offres WebRTC et les candidats ICE (adresse IP publique du joueur, celle du relais TURN s'il sert) passent par le canal Realtime `copytrack-room-CODE`, **public** : la clé du projet est dans le jeu,
tout abonné reçoit tout ce qui y est diffusé (le filtrage par destinataire se fait chez le client), et il peut s'y abonner **sans figurer dans la présence** (comme la liste des salons publics). Le code
d'un **salon public** est affiché dans la liste. Conséquences :

| Qui | Voit | Parade |
| --- | --- | --- |
| Les autres joueurs de la salle | adresse IP, pseudo, apparence de la voiture | aucune : c'est le principe du pair à pair (un relais TURN cacherait l'adresse, pas l'existence de la liaison) |
| Un abonné du canal qui ne joue pas (code connu) | les adresses des joueurs, au moment où elles sont échangées | **aucune dans cette phase** (canal privé : hors périmètre, D-3) |
| Les serveurs STUN (Google) et le relais | adresse IP le temps de la partie | déjà dit |

**Chiffrer la signalisation avec le code de la salle serait sans objet** : le code est le nom du canal, donc quiconque peut s'abonner le connaît ; et celui d'un salon public est listé. Un chiffrement
par paire (clés publiées par chaque joueur) cacherait les adresses à un observateur silencieux, mais pas à un membre (WebRTC les lui donne de toute façon) : il lui suffirait d'entrer dans la salle, où il serait visible ; non fait.
La page **Confidentialité** (français et anglais, `js/legal.js`) le dit sans promettre de chiffrement ni de salle privée, et conseille de ne donner le code qu'à des personnes de confiance.

### À vérifier sur de vraies machines (rien de cela n'a été observé hors du banc et de Chromium sur une seule machine)

Sur le vrai Realtime, deux à trois appareils sur des réseaux différents :
1. **Hôte coupé < 20 s** : l'hôte coupe son Wi-Fi 15 s en pleine manche ; relever la durée avant que l'invitée voie « tu es maintenant l'hôte » (attendu : 6 à 16 s, selon que la liaison tombe ou s'éteint
   en silence) et que la manche se clôt ; au retour du Wi-Fi, l'hôte reprend la main sans refaire partir personne. Noter si la présence morte d'Ana reste dans l'annuaire (jusqu'à ~30 s) sans gêner.
2. **Hôte qui recharge** (F5) pendant un championnat : l'invitée devient hôte, Ana revient, retrouve son nom et son rôle ; vérifier `copytrack.room.ident.commit` identique avant et après (jamais le secret).
3. **Imposteur** : dans la console d'un troisième navigateur, `const { Room, defaultSignaling } = await import('/js/net/room.js'); await Room.join('CODE', { name: 'X', selfId: '<id d\'un absent>', makeSignaling: (o) => defaultSignaling(o, null) })`
   pendant que le joueur est coupé : aucune liaison ne s'ouvre, le joueur retrouve sa place à son retour ; et `copytrack.room.meta.host = true; copytrack.room.signaling.track(copytrack.room.meta)` depuis un
   invité (en désactivant `copytrack.room._checkHost`) ne le fait pas hôte pour les autres.
4. **Observateur silencieux** (exposition, pas une parade) : s'abonner au canal sans rejoindre (`copytrack.room.signaling` d'un autre onglet avec `observe: true`) et relever les `signal` reçus : on y lit les
   offres et les candidats (donc les adresses) destinés à d'autres.
5. **Deux salons en même temps** sur le même projet : aucune interférence (hôtes, ordres, identités distincts).
6. **Page en http** (hors localhost) : le multijoueur refuse avec le message dédié ; en https, tout marche.

## Salons publics

Cocher *Salon public* dans le salon (créateur seulement) publie une fiche (code, pseudo de l'hôte, circuit, nombre de joueurs, mode) dans un canal Realtime commun (`copytrack-room-LOBBY`, 5 lettres :
aucun vrai salon n'en a autant). *Multijoueur > Salons publics* s'y abonne **sans s'y inscrire** et liste les fiches ; un clic rejoint le salon. La fiche disparaît quand l'hôte part ou décoche.
Le canal est public : n'importe qui peut y publier une fausse fiche, qui ne mène qu'à « Salle introuvable » (les fiches sont validées, bornées à 40, et seules celles d'une version compatible sont affichées).
Aucune table, aucun script SQL.

## Boucle de jeu asynchrone

- **Personne n'attend personne.** Chacun a son propre chrono et fait ses essais à son rythme sur le même circuit. Un joueur qui arrive
  pendant que l'hôte court démarre tout de suite (décompte de 1,5 s) ; quand l'hôte est au salon, il attend le prochain « Lancer » (0.16.15).
- **Après l'arrivée : `R` (ou `T`) = nouvel essai immédiat**, sans décompte, sans menu ni salon. `T` fonctionne aussi en cours de course
  pour abandonner un essai. Les autres voient la voiture « apparaître » au départ (même mécanisme que la téléportation).
- **Retour au checkpoint (`R` en course) : le chrono continue de tourner** ; le temps perdu est la pénalité.
- Chaque arrivée est annoncée à la salle : un tableau (meilleur temps de chacun, nombre d'essais) reste affiché sans jamais bloquer le jeu.
  Un nouvel arrivant reçoit les meilleurs temps déjà réalisés.
- Échap : proposer de quitter la course (retour au salon, les autres continuent). L'hôte peut choisir un autre circuit et « Relancer
  pour tous » : chacun repart sur le nouveau circuit. Choisir un circuit ne lance personne : seul « Lancer » / « Relancer » le fait.
- Pas de records, pièces, médailles ni classement en ligne en multijoueur. Classement de la salle **provisoire** : chaque temps est annoncé par son joueur.

## Circuits

Choisis par l'hôte dans le salon :
- **Intégrés** : les 72 circuits du jeu (66 + le chapitre bonus de l'Atelier).
- **Communauté** : par **ID** (le `id` d'un circuit publié ; colle-le dans le champ du salon) ou « Parcourir la communauté ». Les autres joueurs
  téléchargent le circuit eux-mêmes ; sa signature est vérifiée (tout le monde doit avoir exactement le même).
- **Code de circuit** (`SHW…` ou lien de partage) ou **Mes circuits** : l'hôte envoie le code à chacun par le canal fiable, en morceaux de
  12 Ko (jusqu'à 400 000 caractères). Attention : la publication dans la communauté est limitée à 100 000 caractères et 5000 pièces. Les morceaux sont assemblés puis vérifiés avec la signature.

## Rendu des adversaires

- Tampon de 100 ms : chaque adversaire est affiché tel qu'il était il y a 100 ms, interpolé (position : Hermite avec les
  vitesses, orientation : slerp). Paquets perdus : interpolation linéaire, puis arrêt sur place après 0,25 s. Le tampon est purgé à chaque paquet reçu
  (1,5 s gardées, 64 paquets au plus) : un onglet masqué, qui ne dessine rien, ne le fait plus grossir (0.16.17, TECH-087).
- **Cycle de vie d'une voiture distante** (0.16.17, TECH-009, TECH-043, `js/race/net.js`) : elle naît à l'arrivée d'un membre en course (relié) ou à son premier
  paquet, et renaît après un départ suivi d'un retour (même identifiant) : un arrivant en pleine course libre est vu de tous. Elle n'est **montrée** (et n'entre
  dans les collisions) que si un paquet est arrivé depuis moins de **0,5 s**, que son lien est ouvert et que sa présence dit qu'il court ; elle est **retirée** quand
  il est revenu au salon (présence `racing: false`) et que ses paquets ont cessé ; un paquet d'avant ce retour, arrivé en retard, ne la recrée pas. Pendant le
  **décompte** d'un départ commun, chacun envoie déjà son état : la grille est visible avant le GO (TECH-089 b). La règle « voitures identiques » vaut aussi pour
  elles (TECH-088). Une course prête moins de 1 s avant le GO prévu (circuit long à charger) a quand même un décompte de 3 s (TECH-089 d).
- Retour au checkpoint d'un adversaire : un compteur de téléportation voyage dans chaque paquet ; la voiture reste sur
  place puis **apparaît** à son nouvel emplacement, sans jamais glisser (même si le paquet de la téléportation est perdu). Un paquet envoyé au même pas que le
  paquet périodique le remplace s'il est plus récent (numéro de séquence) au lieu d'être jeté comme doublon (TECH-089 a).
- Classement en direct sur un circuit **sans ligne centrale** (circuit de joueur) : checkpoints franchis, plus la part faite du tronçon en cours (du dernier point de
  passage au checkpoint restant le plus proche, ou à l'arrivée) : plus de 0 % jusqu'à l'arrivée sur un circuit sans checkpoint (TECH-089 c).
- Débits : 80 paquets d'état par seconde et par joueur au plus ; messages fiables : 120 d'un coup puis 40 par seconde (TECH-089 e). La signalisation d'un joueur qui
  n'est pas encore membre (sa présence arrive après son offre) est gardée 5 s sans rien ouvrir, puis rejouée quand il le devient (TECH-089 f : sinon la liaison
  attendait la renégociation, 12 s).
- Plus un adversaire est loin de votre caméra (30 m à 260 m), plus sa voiture et son nom s'assombrissent.

### À vérifier sur de vraies machines (voitures distantes et collisions, 0.16.17 ; observé seulement sur le banc et dans deux onglets d'un même Chromium)

1. **Ressenti des collisions** à trois ou quatre machines sur des réseaux différents (latences de 30 à 150 ms) : rattrapages, contacts latéraux, voitures serrées au départ.
   Le plafond de 2,5 m/s par pas (≈ 31 g) et la restitution de 0,35 sont des choix : trop durs ou trop mous ? Un face-à-face à pleine vitesse traverse (voir « Collisions
   douces ») : acceptable en jeu ?
2. **Seuil de 0,5 s** : sur un Wi-Fi qui saute, la voiture d'un adversaire clignote-t-elle (masquée puis revue) ? Relever la plus longue pause entre deux paquets
   (`copytrack.session.remote`, `buffer.lastRecvMs`) ; augmenter `STALE_MS` (`js/net/interp.js`) si c'est fréquent.
3. **Arrivant en pleine course libre** (troisième machine) : vu de tous dès son départ, avec sa couleur ; son nom au classement en direct.
4. **Retour au salon** d'un joueur en course libre : sa voiture disparaît chez les autres en moins d'une seconde, sans réapparaître.
5. **Grille au décompte** : les voitures de la grille visibles chez chacun avant le GO ; **chargement lent** (circuit de la communauté sur un réseau lent) : décompte de 3 s.
6. **Vitesse annoncée crédible** : sur des circuits à tremplins, loopings et boosts, la voiture d'un adversaire ne sort pas des collisions à tort (une vitesse annoncée
   qui s'écarte de plus de 40 m/s de son déplacement entre deux paquets la fait ignorer pendant ce paquet).

## Tests

- `npm test` : paquets, interpolation, téléportation, assombrissement, protocole Phoenix (faux WebSocket), négociation WebRTC
  (faux RTCPeerConnection), salon, et le **banc simulé** (horloge virtuelle, faux Realtime à présence par connexion et pannes, faux WebRTC : `tools/fake-realtime.mjs`)
  pour la présence, les pertes, le jeton, les tentatives abandonnées, les liaisons découplées, les serveurs ICE et la capacité (`tools/test-net.mjs`) ; championnat, avancement, grille, collisions, annuaire (`tools/test-manche.mjs`) ; serveurs ICE et fonction `ice` (`tools/test-ice.mjs`).
  Époque de lancement (0.16.15) : `test-manche` (aucun départ sur un choix de circuit après un retour au salon, un arrêt de championnat ou une course unique ; arrivant pendant une vraie
  course ou au salon ; arrivée en vol ; temps synchronisés gardés ; joueur revenu après une clôture ; migration d'hôte après une clôture manquée, avec ou sans réponse perdue ; arrivée
  en attente jamais rejouée ; classement sans les joueurs qui n'ont pas couru, départage par moyenne ; arrivant pendant une « Course ») ; `test-net` (course d'un lancement précédent,
  deux départs rapprochés) ; `test-browser` (trois onglets).
  Identité, hôte, vie privée (0.16.16) : `test-identite-salle` (la preuve : refusée si la salle, un identifiant, une empreinte DTLS ou le défi changent, ou si elle est renvoyée à son auteur ; engagement ; sauvegarde
  de l'onglet ; le secret n'est dans rien de ce qui part) ; `test-net` (hôte coupé < 20 s, avec ou sans présence fantôme : manche close, drapeau republié, salle rejoignable ; hôte qui recharge avec son
  secret ; retour non relié sans remise à zéro du délai ; successeur sans drapeau ; client modifié annonçant `host: true` ; preuve de remplacement sans secret ; preuve rejouée sur une autre liaison, une
  seconde fois, dans une autre salle ; descriptions et candidats signés ; ordre usurpé ; majorité de l'arrivant ; deux salons simultanés) ; `test-manche` (hôte qui recharge en pleine manche) ; `test-legal` (page
  Confidentialité) ; `test-browser` (trois onglets, vrai WebRTC et vrai Web Crypto : intérim, imposteur refusé, hôte revenu avec son secret). Chaque défaut a d'abord été reproduit (`bugConnu`).
  Voitures distantes et collisions (0.16.17) : `test-net` (arrivant en pleine course libre vu de part et d'autre ; joueur parti puis revenu ; lien mort : masquée et hors des collisions
  à 0,6 s ; retour au salon ; lien non ouvert ; face-à-face 2 × 50 et 2 × 20 m/s, rattrapages 40 → 30 et 60 → 30 avec 0, 0,1 et 0,25 s de retard ; sept voitures ; paquets forgés ;
  tampon borné onglet masqué ; voitures identiques ; téléportation au même pas ; avancement sans ligne centrale ; flot de messages fiables ; offre avant la présence) ;
  `test-browser` (écouteurs du salon stables sur 10 ouvertures ; deux onglets : grille visible au décompte, décompte après un chargement trop long, retour au salon).
- Essai à deux ou trois onglets sans serveur : `?net=local` dans l'URL (signalisation par BroadcastChannel ; le WebRTC est réel).

## Limites de l'architecture actuelle (à lire avant d'attendre plus)

- **Le rollback n'est PAS utilisé.** `js/net/rollback.js` est un prototype mesuré (docs/ROLLBACK.md), branché sur aucun écran. Les collisions de manche sont des
  **collisions douces** (`js/net/collide.js`) : chaque joueur applique SA moitié d'un choc à sa voiture, à partir de la position interpolée de l'autre. Elles
  ne sont ni rejouables ni vérifiées, et deux joueurs peuvent voir le même contact à quelques centimètres et quelques dizaines de millisecondes près.
- **Aucun arbitre** : chaque joueur simule sa propre voiture ; les temps de manche sont ANNONCÉS par leur joueur (jamais vérifiés par le serveur). Un joueur
  qui triche ne fausse que le classement de sa salle, jamais les classements en ligne (ni records, ni pièces, ni médailles en multijoueur).
- **Obstacles et pièces mobiles** : ils dépendent du chrono de course de chaque joueur (pas de 1/120 s depuis son départ). Les départs étant synchronisés à
  quelques dizaines de millisecondes, deux joueurs voient les mêmes obstacles à ce décalage près ; ce n'est pas un état partagé.
- **Horloge des paquets** : le tampon d'interpolation (`js/net/interp.js`) ignore un paquet isolé à l'horloge fausse (corrompu ou malveillant) et ne croit à un
  vrai changement d'horloge (chrono remis à zéro, longue coupure) qu'après 3 paquets consécutifs ; avant, une voiture distante dont l'émetteur remettait son
  chrono à zéro restait figée.
- **La fonction `ice`** (identifiants TURN à durée limitée) exige maintenant une session Supabase ; sa cadence se compte par pilote, en mémoire de l'instance
  (pas partagée entre instances : les identifiants expirent seuls, c'est un frein, pas un quota).
