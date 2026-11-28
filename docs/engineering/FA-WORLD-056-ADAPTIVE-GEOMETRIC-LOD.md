# FA-WORLD-056 — LOD adaptatif et stabilité visuelle

Statut : implémentation intégrée au renderer WebGL2 ; qualification CI en attente.  
Branche : `feat/fa-world-056-adaptive-geometric-lod`

## Modifications
- Ajout de `AdaptiveWorldLod`, un sélecteur de niveau de détail par chunk avec hystérésis.
- Seuils cohérents avec les profils performance, équilibré et qualité existants.
- Hystérésis par défaut de 12 % : les seuils de dégradation et de remontée du détail sont distincts afin de limiter les oscillations visuelles.
- Nettoyage des états des chunks sortis de la fenêtre visible pour borner la mémoire.
- Branchement dans `World3DCanvas` : les lots de géométrie décorative utilisent désormais le niveau de détail stabilisé par chunk.
- La densité de végétation instanciée conserve ses niveaux high/medium/low déjà présents ; le nouveau tracker stabilise également leur sélection indirectement lorsque le batch de scène est choisi.

## Invariants
- Aucun changement des coordonnées, de la navigation, des collisions ou de la simulation des NPC.
- Aucun changement des données de terrain.
- Le LOD ne concerne que la représentation graphique.
- Les seuils de distance initiaux restent la référence au premier affichage d'un chunk.

## Tests
Tests unitaires couvrant sélection initiale, hystérésis, profils de qualité, purge mémoire et entrées invalides. Le résultat final dépend de l'exécution CI.

## Limites restantes
Ce lot ne réalise pas encore de simplification topologique des maillages de terrain : le terrain conserve sa géométrie actuelle. L'optimisation géométrique du sol et les mesures GPU comparatives seront qualifiées séparément. Aucun déploiement ni fusion vers `main`.
