# Écoute : musique par décor et sons de véhicule (0.21.0, COMPLETE-006 et COMPLETE-017)

**Ce que les tests ne peuvent pas dire.** Le rendu hors ligne (`tools/test-browser-audio.mjs`) prouve que chaque variante et chaque timbre produit un signal non nul, sans écrêtage, mesurablement distinct des autres, qui monte avec la vitesse, sans fuite de nœud. Il ne dit **rien** de ce qui s'entend : si une mélodie est juste, si un mélange est équilibré, si un timbre évoque le bon véhicule, si on s'en lasse. Ce fichier est la grille que **une personne** remplit en écoutant. Les colonnes « mesure » sont celles des tests (reproductibles) ; les colonnes d'écoute sont **vides** : l'auteur de ce travail n'a rien écouté et ne les a pas remplies.

## Comment écouter

1. `npm start`, ouvrir le jeu, entrer un nom, cliquer une fois dans la page (le navigateur ne laisse le son démarrer qu'après un geste).
2. Réglages › Options : musique à 45 % (valeur par défaut), effets à 70 %. Casque, puis petites enceintes d'ordinateur (la basse de plusieurs variantes est grave).
3. Une variante : jouer le premier circuit du décor (carrière), ou dans la console du navigateur : `copytrack.audio.music.play('game', 'polar')` (identifiants de décor : `desert polar jungle city isles volcano orbit caves sky reef factory atelier`) puis `copytrack.audio.music.setSpeed(0.1)`, `0.5`, `1`, `1.2` (le dernier ajoute la couche du boost). `copytrack.audio.music.play('menu')` revient au menu, `copytrack.audio.music.play('game', '')` au chill d'origine, pour comparer.
4. Un véhicule : jouer des circuits avec plaques de transformation (chapitres « Mécanismes », « Éléments », Académie : leçons « eau et bateau » et « deltaplane ») ; la moto : une plaque moto, ou la règle de départ `veh0`.
5. Profils de qualité : refaire les écoutes 2 et 3 en Potato et Ultra Potato (Profil › Options › Qualité) : la musique y est volontairement allégée.
6. Onglet masqué : lancer une course, changer d'onglet : la musique doit se taire et rien ne doit repartir tout seul ; au retour elle reprend.

Notation suggérée : **0** non, **1** moyen, **2** oui. Laisser vide ce qui n'a pas été écouté.

## Les douze musiques

Mesure : niveau (RMS) et centroïde spectral (Hz, plus haut = plus brillant) rendus hors ligne à vitesse 0,6, volume maximal du réglage ; intensité : énergie au-dessus de 1 kHz à vitesse 0,1 → 1,0 (`×` = rapport). Les nombres viennent de `node tools/test-browser-audio.mjs`.

| Décor | Tempo (BPM, à l'arrêt → pleine vitesse) | Tonalité | Voix (nappe / basse / mélodie) | Mesure (RMS, centroïde) | Intensité (×) | Reconnaissable à l'aveugle ? | L'intensité suit la vitesse ? | Lassant après 10 min ? | Équilibre kick / basse / mélodie ? | Commentaire |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Désert crépuscule (`desert`) | 98 → 104 | ré, phrygienne dominante | douce / ronde / luth (`oud`) | 0,067 · 267 Hz | ×62 | | | | | |
| Nuit polaire (`polar`) | 78 → 84 | la, mineure | verre / sub / cloche | 0,060 · 392 Hz | ×28 | | | | | |
| Jungle néon (`jungle`) | 112 → 120 | mi, dorienne | douce / pincée / marimba | 0,061 · 261 Hz | ×74 | | | | | |
| Ville futuriste (`city`) | 118 → 124 | fa dièse, mineure | dents de scie / carrée / dent de scie | 0,079 · 216 Hz | ×20 | | | | | |
| Archipel tropical (`isles`) | 104 → 110 | sol, majeure | douce / ronde / pan d'acier | 0,067 · 359 Hz | ×72 | | | | | |
| Volcan (`volcano`) | 88 → 96 | do, phrygienne | bourdon / dent de scie / dent de scie | 0,086 · 124 Hz | ×31 | | | | | |
| Station orbitale (`orbit`) | 72 → 78 | mi, lydienne | verre / sub / boîte à musique | 0,047 · 495 Hz | ×30 | | | | | |
| Canyon de cristal (`caves`) | 84 → 90 | si bémol, lydienne | aérienne / sub / cloche | 0,054 · 546 Hz | ×93 | | | | | |
| Ville dans les nuages (`sky`) | 108 → 114 | la bémol, majeure | aérienne / ronde / flûte | 0,064 · 447 Hz | ×38 | | | | | |
| Fonds marins (`reef`) | 90 → 96 | ré, mixolydienne | douce / sub / bulle | 0,066 · 247 Hz | ×61 | | | | | |
| Usine mécanique (`factory`) | 112 → 120 | si, mineure harmonique | aucune / dent de scie / carrée | 0,076 · 184 Hz | ×61 | | | | | |
| Atelier des mécanismes (`atelier`) | 100 → 108 | fa, mixolydienne | très douce / pincée / boîte à musique | 0,047 · 399 Hz | ×85 | | | | | |

À juger en particulier (points que la mesure ne tranche pas) :

- **Volcan** : c'est la variante dont la brillance monte le moins avec la vitesse (centroïde 112 → 126 Hz de 0,1 à 1,0) : la vitesse s'entend-elle quand même ?
- **Désert et fonds marins**, **ville et usine** sont les paires les plus proches à la mesure (2,8 et 3,3 dB d'écart d'empreinte) : se distinguent-elles à l'oreille ?
- **Station orbitale** et **canyon de cristal** : très lentes, presque sans percussion : sont-elles trop creuses en course, à basse vitesse ?
- **Boost** (vitesse > 1) : la couche d'arpège est-elle gênante ou bienvenue ?
- **Fondu** entre deux circuits de décors différents (450 ms de coupure) : trop sec ? Entre deux circuits du même décor : rien ne doit redémarrer.
- **Menu** : doit être exactement celui d'avant (rien n'a été changé ; la mesure le confirme à 1 % près).

## Les trois timbres de véhicule

Mesure à 40 m/s, gaz ouverts, hors ligne : niveau, crête, centroïde. Les distances spectrales entre les quatre timbres vont de 10,0 à 16,8 dB.

| Véhicule | Mesure (RMS · crête · centroïde) | Se reconnaît les yeux fermés ? | Plaisant à entendre longtemps ? | Transformation (vers / depuis la voiture) douce ? | Commentaire |
| --- | --- | --- | --- | --- | --- |
| Voiture (inchangée) | 0,082 · 0,265 · 374 Hz | | | | |
| Moto (plus aiguë, modulée au rythme des explosions) | 0,055 · 0,198 · 613 Hz | | | | |
| Bateau (moteur étouffé, sillage, clapot) | 0,066 · 0,213 · 297 Hz | | | | |
| Deltaplane (souffle en rafales, sifflement des haubans) | 0,034 · 0,162 · 1 946 Hz | | | | |

À juger en particulier :

- **Moto** : la modulation (37 Hz au ralenti) évoque-t-elle une moto ou un défaut de son ?
- **Bateau à l'arrêt** : le clapotis seul (niveau 0,033) est-il agréable, ou fatigue-t-il pendant un décompte ?
- **Deltaplane** : le souffle monte de 0,004 (2 m/s) à 0,066 (60 m/s) : assez fort pour sentir la vitesse sans masquer la musique ? Le sifflement fin est-il aigu au point de gêner ?
- **Transformation** : le moteur plonge puis revient en ≈ 0,3 s ; aucun clic n'est mesuré, mais un creux de 0,10× à 0,38× du niveau précédent s'entend-il comme un défaut ou comme un changement de machine ?
- **Voix choisie dans le garage** : une forme d'onde choisie (carrée, triangle, sinus) prime sur le timbre de la moto, du bateau et du deltaplane ; une hauteur choisie les multiplie toujours.

## Mélange musique / effets / moteur

| Vérification | 0 / 1 / 2 | Commentaire |
| --- | --- | --- |
| La musique reste audible et ne couvre pas le moteur, aux réglages par défaut | | |
| Baisser « effets » à 0 ne touche pas la musique ; baisser « musique » à 0 la coupe | | |
| Aucun pic gênant (kick + choc + boost en même temps) | | |
| Potato / Ultra Potato : la musique allégée reste cohérente (pas de trous qui sonnent comme une erreur) | | |
