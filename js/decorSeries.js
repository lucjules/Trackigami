// Séries de décor du garage (COMPLETE-018 : un débouché aux pièces ◆ une fois le garage entier acquis). Données pures (aucun import) : une série par décor de la carrière
// (themes.js), 100 % VISUELLE comme tout le catalogue (tools/test-cosmetics-physics.mjs le prouve : la physique n'importe aucun module de personnalisation, et chaque
// élément construit donne la même course). Chaque série apporte quatre éléments payants, de quatre catégories différentes, qui ne demandent aucun modèle 3D neuf :
//   led     une couleur de LED            trail   une couleur de traînée
//   decal   un dessin (polygones : carModel.js, DECAL_ART)      wheels  une couleur de jante (carModel.js : RIM)
// plus une palette, deux préréglages, et une collection de ces quatre éléments (rewards.js : COLLECTIONS ; 100 ◆ de prime, bien moins que les 360 ◆ qu'elle coûte).
// Le même identifiant (celui du décor) sert aux quatre éléments : une catégorie ne le répète pas. cosmetics.js les range dans son catalogue avec `theme: 'decor-<décor>'`.
export const DECOR_COST = { led: 60, trail: 120, decal: 80, wheels: 100 };

// palette : [peinture, secondaire, dessins]. rim : [couleur, rugosité, métal] de la jante. bodies : les deux carrosseries (existantes) des deux préréglages.
export const DECOR_SERIES = [
  { decor: 'desert', icon: '🏜️', label: 'Désert crépuscule', palette: ['#e8a45a', '#5b2a86', '#ffe3a3'], bodies: ['pickup', 'jeep'],
    led: ['Dune', '#ff9a4d'], trail: ['Sable chaud', '#e8c27a'], decal: 'Dunes', wheels: ['Jantes de grès', ['#d9a066', 0.6, 0.2]] },
  { decor: 'jungle', icon: '🌴', label: 'Jungle néon', palette: ['#0f5c3a', '#2dffb0', '#c8ff5a'], bodies: ['jeep', 'buggy'],
    led: ['Liane', '#35ff9c'], trail: ['Spores', '#7dff6b'], decal: 'Lianes', wheels: ['Jantes de mousse', ['#3fd37f', 0.7, 0.1]] },
  { decor: 'isles', icon: '🏝️', label: 'Archipel tropical', palette: ['#19c7d8', '#ffd66b', '#ffffff'], bodies: ['cabrio', 'kart'],
    led: ['Lagon', '#2fe0d0'], trail: ['Embruns', '#bff6ff'], decal: 'Hibiscus', wheels: ['Jantes de corail', ['#ff8f7a', 0.5, 0.2]] },
  { decor: 'city', icon: '🌆', label: 'Ville futuriste', palette: ['#14121f', '#ff3d8a', '#36e9ff'], bodies: ['coupe', 'sport'],
    led: ['Enseigne', '#ff3d8a'], trail: ['Néon urbain', '#36e9ff'], decal: 'Gratte-ciel', wheels: ['Jantes holographiques', ['#b6f2ff', 0.1, 0.9]] },
  { decor: 'polar', icon: '🌌', label: 'Nuit polaire', palette: ['#0c2a4a', '#7fe9ff', '#a8ffd8'], bodies: ['wedge', 'limo'],
    led: ['Banquise', '#7fe9ff'], trail: ['Voile boréal', '#7dffc4'], decal: 'Aurores', wheels: ['Jantes de glace', ['#d8f6ff', 0.15, 0.5]] },
  { decor: 'volcano', icon: '🌋', label: 'Volcan', palette: ['#2a0f0a', '#ff5a2a', '#ffb347'], bodies: ['muscle', 'hotrod'],
    led: ['Lave', '#ff5a2a'], trail: ['Cendres ardentes', '#ff8a3a'], decal: 'Éruptions', wheels: ['Jantes de basalte', ['#4a3a38', 0.8, 0.3]] },
  { decor: 'orbit', icon: '🛰️', label: 'Station orbitale', palette: ['#1b1740', '#b9a6ff', '#f4f1ea'], bodies: ['formula', 'wedge'],
    led: ['Hublot', '#b9a6ff'], trail: ['Poussière d’étoiles', '#e5dcff'], decal: 'Constellations', wheels: ['Jantes d’alliage', ['#cfd2e8', 0.2, 0.9]] },
  { decor: 'reef', icon: '🐠', label: 'Fonds marins', palette: ['#0a5a6b', '#2fd3b5', '#ffd1a8'], bodies: ['bubble', 'van'],
    led: ['Abysse', '#2fd3b5'], trail: ['Plancton', '#9ffff0'], decal: 'Bulles marines', wheels: ['Jantes de nacre', ['#ffe3ee', 0.2, 0.5]] },
  { decor: 'factory', icon: '🏭', label: 'Usine mécanique', palette: ['#6b4a2e', '#ffb070', '#f4f1ea'], bodies: ['van', 'pickup'],
    led: ['Étincelle d’atelier', '#ffb070'], trail: ['Limaille', '#ffcf99'], decal: 'Engrenages', wheels: ['Jantes d’acier brut', ['#9aa0ad', 0.45, 0.9]] },
  { decor: 'sky', icon: '☁️', label: 'Ville dans les nuages', palette: ['#9fd8ff', '#ffffff', '#ffb3d1'], bodies: ['bubble', 'hatch'],
    led: ['Cumulus', '#bfe6ff'], trail: ['Brume', '#ffffff'], decal: 'Nuages', wheels: ['Jantes de nuée', ['#f4f9ff', 0.6, 0.1]] },
  { decor: 'caves', icon: '💎', label: 'Canyon de cristal', palette: ['#3a1d6e', '#b48cff', '#7cf0ff'], bodies: ['coupe', 'limo'],
    led: ['Géode', '#b48cff'], trail: ['Éclats de cristal', '#d6b8ff'], decal: 'Cristaux', wheels: ['Jantes d’améthyste', ['#9a6bff', 0.2, 0.6]] },
  { decor: 'atelier', icon: '🔧', label: 'Atelier des mécanismes', palette: ['#ffd23e', '#2f3247', '#ffffff'], bodies: ['kart', 'buggy'],
    led: ['Voyant', '#ffd23e'], trail: ['Huile chaude', '#ffe27a'], decal: 'Boulons', wheels: ['Jantes de laiton', ['#e0b24a', 0.35, 0.8]] },
];

export const decorThemeId = (decor) => `decor-${decor}`;

// Couleurs de jante des séries (carModel.js) : { identifiant de jante : [couleur, rugosité, métal] }.
export const DECOR_RIMS = Object.fromEntries(DECOR_SERIES.map((s) => [s.decor, s.wheels[1]]));
