# FA-WORLD-010 — Animation météo GPU

Version : 1.0  
Statut : implémentation committée, validation CI à effectuer  
Branche : `feat/fa-world-engine-p0`

## Objectif

Faire passer les particules météo du statut de géométrie statique à celui d'effets animés en temps réel, sans introduire de dépendance graphique supplémentaire ni modifier les règles de simulation du monde.

## Implémentation

Fichier principal : `web/src/world/World3DCanvas.tsx`

Le vertex shader WebGL2 reçoit deux uniformes :
- `uTime` : temps écoulé en secondes, dérivé de l'horodatage fourni par `requestAnimationFrame`.
- `uWeatherMotion` : interrupteur d'animation activé uniquement pendant le rendu du buffer météo.

Pour chaque sommet météo, le shader applique un déplacement périodique :
- dérive horizontale X : amplitude maximale 0,035 unité monde ;
- dérive horizontale Y : amplitude maximale 0,022 unité monde ;
- oscillation verticale Z : amplitude maximale 0,018 unité monde.

Les positions sont déformées dans le shader ; le buffer météo n'est pas réécrit à chaque image. Le coût CPU et les transferts mémoire restent donc constants après l'initialisation.

## Séparation des passes

1. Terrain : animation désactivée.
2. Structures, PNJ, balise et boss : animation météo désactivée.
3. Particules météo : animation activée uniquement pour cette passe.
4. Avatar : animation météo désactivée.

Les conditions météo existantes conservent le contrôle du nombre de particules, de leur palette et du brouillard. La météo claire conserve un buffer vide.

## Contraintes et limites

- Les particules restent déterministes à génération identique ; seule leur position apparente évolue dans le temps.
- Cette étape ne simule pas encore la gravité, la collision au sol, les rafales physiques ou la direction météorologique issue d'un modèle climatique.
- Les animations de squelette des avatars et PNJ, les comportements autonomes des PNJ et les avatars distants restent hors périmètre de cette livraison.
- La validation visuelle sur navigateur et appareil mobile demeure nécessaire en complément de la CI.

## Critères de validation

- Compilation TypeScript sans erreur.
- Build Vite de production réussi.
- Suite Vitest complète réussie.
- Aucune modification de la logique A*, des collisions ou de l'autorité `onTileMove`.
- Aucune écriture de buffer météo par frame.

## Suite proposée

FA-WORLD-010B : animation locomotrice procédurale de l'avatar (balancement des bras et jambes piloté par le temps et l'état de déplacement), en conservant le déplacement par cases et la validation existante.
