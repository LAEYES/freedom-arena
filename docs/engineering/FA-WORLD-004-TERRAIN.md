# FA-WORLD-004 — Terrain Engine et tiles 64 × 64

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendances : FA-WORLD-002, FA-WORLD-003
- Statut : implémentation et tests ajoutés ; CI en attente.

## Modèle de terrain

Chaque cellule est une donnée indépendante du renderer :
- coordonnées logiques `i, j`,
- type de terrain,
- altitude entière,
- indicateur de franchissabilité,
- coût de déplacement.

Types : grass, forest, water, rock, sand, snow.

## Génération déterministe

La génération utilise un bruit de valeur interpolé et plusieurs échelles spatiales. Un seed entier permet de reproduire la même carte. Le biome est dérivé de l'altitude et de l'humidité calculées.

La zone de départ est protégée par un rayon configurable et forcée en herbe praticable.

## Paramètres par défaut

- Dimensions : 64 × 64.
- Cellules : 4 096.
- Seed : 20261128.
- Point de départ : (32, 32).
- Rayon sûr : 4 cellules.

## API

- `generateTerrainMap`
- `getTerrainTile`
- `isTerrainWalkable`
- `getTerrainMovementCost`
- `getTerrainBounds`
- `countTerrainKinds`

Module : `web/src/world/terrain.ts`.

## Séparation des responsabilités

Ce lot fournit le modèle de données terrain et sa génération. Il ne dessine pas les tiles, ne modifie pas le Canvas 2D existant et n'intègre pas encore les données au déplacement du joueur. L'intégration navigation/collisions relève de FA-WORLD-005 ; le rendu des meshes et textures relève du renderer ultérieur.

## Qualification

Tests ajoutés pour :
- dimensions et indexation row-major,
- déterminisme du seed,
- variation entre seeds,
- zone de spawn protégée,
- bornes et coordonnées invalides,
- coûts de déplacement et franchissabilité,
- diversité des biomes,
- validation des paramètres,
- dimensions configurables.

La validation finale dépend de GitHub Actions.
