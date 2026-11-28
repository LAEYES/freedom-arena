# FA-WORLD-003 — Prototype caméra isométrique 3D

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendance : FA-WORLD-002
- Statut : VALIDATED — CI réussie.

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

Résultats GitHub Actions — Web build, run #145 : **success**. Les étapes `npm install --no-package-lock`, `npm run test` et `npm run build` ont toutes réussi. Le workflow Hostinger Deploy, run #80, a réussi la compilation ; l'étape `Upload dist to Hostinger` a été **skipped** car l'événement était une pull request.

**FA-WORLD-003 : VALIDATED.** Le prototype caméra mathématique et ses tests sont validés. Le renderer WebGL/visuel et son intégration React restent hors périmètre de ce lot.
