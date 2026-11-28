# FA-WORLD-027B — Roads, cliffs and bridge geometry

Status: implementation committed; CI validation pending
Scope: connect world landmarks to navigable paths, render exposed elevation faces, and provide a constrained bridge mesh primitive.

## 1. Delivered

### Terrain cliffs
- Cardinal-neighbor comparison over the sector tile set.
- A vertical face is emitted only when the current tile elevation exceeds its neighbor.
- Face base and top heights use the shared terrain elevation conversion.
- No face is inferred across a missing neighbor, avoiding false walls at streaming/sector boundaries.

### POI roads
- A* route is computed from the current sector's safe central spawn tile to each walkable POI.
- Diagonal movement is disabled for road geometry so each segment is axis-aligned.
- Road mesh is emitted only over walkable tiles and between adjacent cardinal route nodes.
- A one-level elevation step is tolerated; larger discontinuities do not receive a connecting road segment.
- Road geometry is decorative and does not mutate movement cost, walkability, pathfinding or persistence.

### Bridge primitive
- Added a low-poly one-water-tile span with deck, rails and bank supports.
- Validates two walkable banks, a water tile, straight alignment and exactly one intervening tile.
- Bridge primitive is not integrated into the world scene yet: current navigation does not model bridge ownership, collision or traversal permissions. Rendering it before those semantics exist would falsely imply a traversable crossing.

## 2. Code

- `web/src/world/worldRenderer.ts`: `buildRoadMesh`, `buildTerrainCliffMesh`, `buildBridgeMesh`.
- `web/src/world/worldRenderer.test.ts`: route, walkability, cliff and bridge geometry tests.
- `web/src/world/World3DCanvas.tsx`: integrates cliff faces and A*-aligned roads to POIs.

## 3. Validation gates

- [ ] Road geometry is deterministic for a fixed terrain map and route.
- [ ] No road segment crosses blocked terrain or non-adjacent route nodes.
- [ ] Cliff faces appear only at higher-to-lower cardinal boundaries.
- [ ] Bridge geometry rejects diagonal, misaligned, blocked-bank and non-water spans.
- [ ] All vertex data is finite and follows the six-float XYZ/RGB layout.
- [ ] TypeScript, unit tests and production build pass.

## 4. Deferred

- Bridge traversal and collision require a dedicated navigation surface / edge-link model, pathfinding cost rules, actor locomotion support and interaction state. Until those exist, bridges remain uninstantiated visual primitives.
- Multi-tile bridges, riverside embankments, road decals and settlement districts remain future work.
- Sector-boundary cliffs need neighbor-sector data before they can be rendered without seams.
