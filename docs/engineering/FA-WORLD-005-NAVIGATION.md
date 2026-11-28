# FA-WORLD-005 — Navigation A* et collisions

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendance : FA-WORLD-004
- Statut : VALIDATED — CI réussie.

## Mécanique de navigation

Recherche A* sur la grille de terrain, avec :
- déplacements cardinaux et diagonaux,
- coût de déplacement pondéré par le terrain,
- heuristique octile admissible,
- tas binaire min-heap,
- limite configurable de nœuds développés,
- obstacles statiques et occupation dynamique.

Le déplacement diagonal interdit le passage en diagonale entre deux cellules orthogonales bloquées (corner cutting).

## Coûts

Coût d'un pas :
- cardinal : coût de terrain destination × 1,
- diagonal : coût de terrain destination × √2.

Le coût des terrains praticables est au moins égal à 1 ; l'heuristique octile reste donc admissible.

## API

- `tileKey`
- `isTileBlocked`
- `canStep`
- `resolveMovementStep`
- `findTerrainPath`
- `calculateTerrainPathCost`

Module : `web/src/world/navigation.ts`.

## Compatibilité

Le moteur de navigation est indépendant des anciennes fonctions `findTilePath` et `moveTile` de `world.ts`. Il ne remplace pas encore le déplacement du joueur dans l'interface. L'intégration sera effectuée après qualification, sans changer le format de sauvegarde historique.

## Tests

- chemin optimal sur terrain libre,
- contournement de l'eau et des rochers,
- prévention du corner cutting,
- obstacles dynamiques,
- validation d'un pas de déplacement,
- origine = destination,
- destination inaccessible,
- paramètres invalides,
- validation du coût d'un chemin.

## Résultats de qualification

- GitHub Actions — Web build, run #160 : **success**.
- Vitest : **53/53 tests réussis**, 8 fichiers de test.
- TypeScript : **success**.
- Vite production build : **success**, 69 modules transformés.
- Hostinger Deploy, run #90 : build réussi ; étape `Upload dist to Hostinger` **skipped** car pull request.

**FA-WORLD-005 : VALIDATED.** A* pondéré, collisions statiques/dynamiques et règles anti-corner-cutting sont validés.
