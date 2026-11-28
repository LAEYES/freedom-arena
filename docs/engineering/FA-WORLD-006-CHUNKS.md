# FA-WORLD-006 — Chunk Manager et chargement spatial

- Version : 1.0
- Date : 2026-11-28
- Branche : feat/fa-world-engine-p0
- Dépendance : FA-WORLD-004
- Statut : VALIDATED — CI réussie.

## Découpage

- Taille nominale : 16 × 16 cellules.
- Carte 64 × 64 : 4 × 4 chunks, soit 16 chunks.
- Index de chunk : `(chunkX, chunkY)`.
- Clé stable : `chunkX:chunkY`.
- Chunks de bord : largeur/hauteur tronquées pour les mondes non multiples de 16.

## Gestionnaire

`ChunkManager` assure :
- chargement d'un chunk,
- chargement de la fenêtre visible,
- suivi des chunks visibles,
- cache LRU,
- éviction des chunks non visibles les moins récemment utilisés,
- déchargement explicite et remise à zéro.

Un chunk visible n'est jamais évincé. Si la fenêtre visible dépasse la capacité configurée, le cache peut temporairement dépasser sa capacité plutôt que supprimer une zone nécessaire à l'affichage.

## API

- `chunkKey`
- `getChunkCoordinate`
- `getChunkBounds`
- `buildWorldChunk`
- `ChunkManager.loadChunk`
- `ChunkManager.loadAround`
- `ChunkManager.getLoadedChunk`
- `ChunkManager.unloadChunk`
- `ChunkManager.clear`
- `ChunkManager.getCacheStats`

Module : `web/src/world/chunks.ts`.

## Limites

Le chargement est synchrone depuis la carte générée en mémoire. Le contrat est prêt pour une source distante ultérieure, mais aucun téléchargement réseau, worker, stockage persistant ou intégration renderer n'est ajouté dans ce lot.

## Tests

- découpage complet 64 × 64,
- coordonnées de chunk,
- chunks de bord partiels,
- fenêtre visible 3 × 3,
- conservation de tous les chunks visibles,
- éviction LRU,
- chargement par tuile,
- déchargement et clear,
- paramètres invalides.

## Résultats de qualification

- GitHub Actions — Web build, run #168 : **success**.
- Vitest : **62/62 tests réussis**, 9 fichiers de test.
- TypeScript : **success**.
- Vite production build : **success**, 69 modules transformés.
- Hostinger Deploy, run #95 : build réussi ; étape `Upload dist to Hostinger` **skipped** car pull request.

**FA-WORLD-006 : VALIDATED.** Le découpage 16 × 16, la fenêtre visible et le cache LRU sont validés. Le cache conserve tous les chunks visibles même lorsque la fenêtre dépasse temporairement la capacité nominale.
