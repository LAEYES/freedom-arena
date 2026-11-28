# FA-WORLD-031 — Chunk-local dressing, instancing and LOD

Status: implemented and CI validated
Parent: FA-WORLD-029 chunk GPU terrain buffers and FA-WORLD-030 performance telemetry.

## 1. Chunk-local static decoration

- World decoration is partitioned by the existing 16 × 16 logical terrain chunks.
- Each chunk owns separate high, medium and low static decoration meshes.
- Landmark meshes and A* road segments are assigned to the chunk containing their anchor tile / first segment tile.
- Cliff faces, event beacon and boss marker remain in the sector-level static scene buffer for this iteration.
- Decoration buffers are uploaded lazily when a visible chunk/LOD combination is first drawn.
- GPU cache is bounded to 32 chunk/LOD buffers; evicted buffers are deleted.
- Renderer cleanup deletes all cached decoration buffers.

## 2. Vegetation instancing

- Added a shared local-space low-poly foliage template.
- Each vegetation instance is a compact seven-float record: world XYZ, uniform scale, RGB tint.
- World placement remains deterministic from world seed, absolute tile coordinates and placement channel.
- The renderer aggregates visible chunk instance records and uploads them only when the visible chunk/LOD signature changes.
- One `drawArraysInstanced` call renders the foliage set for the current visible window, instead of a separate mesh draw per plant.
- Instanced vertex attributes use divisor 1; regular geometry attributes are restored after the instanced pass.
- Instance and template buffers/program are released in both renderer cleanup paths.

## 3. LOD tiers

| Tier | Distance | Vegetation density | Geometry |
|---|---:|---:|---|
| High | 0–14 world units | 100% | Full low-poly foliage |
| Medium | >14–30 | 58% | Reduced placement density and 86% scale |
| Low | >30 | 24% | Reduced placement density, 62% scale, simplified vegetation |

- The same distance thresholds are used for static chunk dressing and vegetation instances.
- LOD selection is deterministic for a given reference tile and chunk center.
- Frustum culling from FA-WORLD-029 still filters candidate chunks before draw submission.

## 4. Tests and validation

- `worldLod.test.ts`: threshold boundaries and invalid input.
- `worldRenderer.test.ts`: deterministic instance records, compact stride, template geometry and reduced LOD density.
- Existing geometry fingerprint tests continue to cover deterministic static mesh generation.
- CI validation pending.

## 5. CI validation

- GitHub Actions Web build run 492 on commit `7a9c189c2ea2407da016c1a4ea5e56120b6a9bba` passed.
- 25 test files passed; 169 tests passed.
- TypeScript project build and Vite production build passed.
- Hostinger workflow build passed; FTP upload was skipped because the event was a pull request.

## 6. Limits

- Vegetation uses one shared stylized foliage template; broadleaf/conifer silhouettes are not yet distinct in the instanced pass.
- The renderer aggregates visible instance records into one dynamic buffer when the visible chunk/LOD signature changes; it is not a persistent per-chunk instance-buffer cache yet.
- Roads are split into two-tile cardinal segments and anchored to the first tile's chunk; a segment can geometrically extend across a chunk edge.
- Cliffs, event beacon and boss marker remain sector-level geometry.
- No screenshot pixel regression, GPU timer query, GPU-memory telemetry or real-device benchmark is claimed.
- LOD thresholds are initial engineering defaults, not calibrated from hardware profiling.

## 7. Next

FA-WORLD-032: bridge traversal/navigation links, modular settlement districts and interaction parity. Follow with world streaming and MMO persistence architecture.
