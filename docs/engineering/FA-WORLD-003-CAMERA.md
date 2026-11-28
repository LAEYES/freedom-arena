# FA-WORLD-003 — Prototype caméra isométrique 3D

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendance : FA-WORLD-002
- Statut : prototype mathématique ajouté ; CI en attente.

## Modèle caméra

Caméra orthographique 3D définie par :
- cible monde X/Y/Z,
- azimut,
- élévation,
- distance,
- hauteur orthographique,
- viewport,
- plans de clipping near/far.

Valeurs de départ :
- azimut : 45°,
- élévation : atan(1/√2) ≈ 35,264°,
- hauteur orthographique : 48 unités monde,
- distance : 100 unités,
- viewport de test : 1280 × 720.

## Architecture

Le module calcule une base caméra orthonormée (right/up/forward), une matrice view, une matrice de projection orthographique et leur produit en ordre column-major compatible OpenGL/WebGL.

Fonctions :
- `createIsometricCamera`
- `projectWorldToScreen`
- `unprojectScreenToElevation`

Le dé-projection intersecte le rayon caméra avec un plan horizontal d'altitude connue. L'altitude est nécessaire pour lever l'ambiguïté de la projection.

## Limites de cette tranche

Ce lot fournit la caméra mathématique et les matrices, pas encore le renderer WebGL, les meshes de terrain, les textures ou le composant React intégré. Ces éléments restent séparés pour conserver le renderer Canvas existant comme fallback.

## Qualification

Tests ajoutés :
- centrage de la cible,
- variation écran avec altitude,
- round-trip projection/déprojection à plusieurs coordonnées,
- matrices 4×4 finies,
- rejet des configurations invalides.

La validation complète est conditionnée à GitHub Actions.
