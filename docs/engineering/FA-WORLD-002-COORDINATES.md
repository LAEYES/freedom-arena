# FA-WORLD-002 — Coordonnées mondiales et projection isométrique

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendance : FA-WORLD-001
- Statut : VALIDATED — CI réussie.

## Référentiel

- Grille logique : indices entiers `(i, j)`.
- Monde : coordonnées `(x, y, z)` en unités de jeu.
- Écran : coordonnées pixels `(x, y)`, strictement réservées au renderer.
- Taille de monde initiale : 64 × 64 cellules.
- Dimensions logiques, dimensions d'assets et dimensions écran restent indépendantes.

## Configuration par défaut

| Paramètre | Valeur |
|---|---:|
| cellWidth | 1 unité |
| cellDepth | 1 unité |
| elevationUnit | 1 unité |
| screenTileWidth | 64 px |
| screenTileHeight | 32 px |
| elevationPixels | 16 px |
| originX / originY | 0 / 0 |

## Transformations

Grille vers monde :
`x = i × cellWidth`, `y = j × cellDepth`, `z = elevation × elevationUnit`.

Monde vers écran :
`sx = originX + (i - j) × screenTileWidth / 2`
`sy = originY + (i + j) × screenTileHeight / 2 - z × elevationPixels`.

L'inversion écran vers monde exige l'altitude `z`, car une projection 2D seule ne permet pas de retrouver une élévation inconnue.

## API ajoutée

- `gridToWorld`
- `worldToGrid`
- `worldToTile`
- `worldToScreen`
- `screenToWorld`
- `isTileInBounds`
- `validateWorldGridConfig`

Module : `web/src/world/coordinates.ts`.

## Compatibilité

Aucune sauvegarde existante n'est migrée dans cette tâche. Le type historique `WorldTilePosition { x, y }` reste inchangé. L'intégration aux joueurs et au renderer sera effectuée dans une tâche ultérieure après qualification de cette API indépendante.

## Tests et résultats

- 8 groupes de tests Vitest ajoutés.
- GitHub Actions — Web build, run #139 : **success**.
- Étape `npm run test` : **success**.
- Étape `npm run build` : **success**.
- GitHub Actions — Hostinger Deploy, run #77 : build **success**, étape `Upload dist to Hostinger` **skipped**.
- Validation arithmétique indépendante locale : 8 groupes de contrôles exécutés avec Node.js 22.16.0, tous réussis.
- Aucun déploiement Hostinger n'a été exécuté par ce workflow.

## Décision

**FA-WORLD-002 : VALIDATED.**

Les conversions grille/monde/écran sont isolées, paramétrables, réversibles avec altitude connue et couvertes par CI. Le schéma historique de sauvegarde reste intact.
