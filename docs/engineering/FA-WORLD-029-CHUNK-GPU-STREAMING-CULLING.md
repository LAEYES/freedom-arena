# FA-WORLD-029 — Chunk GPU streaming and frustum culling

Status: implementation committed; CI validation pending
Parent: FA-WORLD-023 world architecture and FA-WORLD-028 camera projections.
Chunk size: 16 × 16 tiles. Sector baseline: 64 × 64 tiles.

## 1. Delivered

- Added a conservative screen-space frustum test for chunk bounds, including terrain elevation and a vegetation-height margin.
- The WebGL2 renderer requests a 3 × 3 chunk neighborhood in third-person mode and the existing broad sector neighborhood in isometric mode.
- Candidate chunks are filtered against the active camera projection before GPU terrain buffers are created or drawn.
- Terrain geometry is uploaded per chunk into independent static GPU buffers.
- GPU buffers are cached by stable chunk key and retained in a bounded 32-entry LRU map.
- Buffers are deleted when evicted and all remaining buffers are disposed when the renderer is torn down.
- HUD chunk and tile counts now reflect currently visible terrain chunks.

## 2. Compatibility

- Logical terrain map, tile coordinates, walkability, pathfinding and actor simulation are unchanged.
- The Canvas 2D renderer is unchanged.
- Scene dressing and NPC/avatar buffers remain separate from terrain chunk buffers in this first pass.
- Camera projection uses the same isometric/perspective view-projection matrix used by rendering.

## 3. Known limitations

- The current sector is still a finite 64 × 64 map; this is GPU chunk buffering and visibility culling, not infinite-world streaming.
- Static vegetation, POIs, roads and cliff meshes remain in the sector-level scene buffer and are not yet chunk-local.
- No measured FPS or GPU-memory benchmark is claimed.
- Isometric mode can still request the whole sector neighborhood due to its wide overview; frustum filtering prevents off-screen chunk draws.
- LOD levels, instancing, material batching and GPU timer profiling remain future work.

## 4. Validation gates

- [ ] Frustum helper passes orthographic and perspective tests.
- [ ] WebGL2 chunk buffers are created once per cached chunk and reused while resident.
- [ ] LRU eviction deletes old GPU buffers and stays bounded at 32 entries.
- [ ] Renderer teardown deletes all remaining terrain chunk buffers.
- [ ] TypeScript, unit tests and production build pass.
- [ ] No changes to logical tile/pathfinding behavior.

## 5. Next

FA-WORLD-030 adds reproducible visual regression and performance instrumentation. Then FA-WORLD-031 will split static world dressing into chunk-local buffers and introduce actual LOD tiers / instancing.
