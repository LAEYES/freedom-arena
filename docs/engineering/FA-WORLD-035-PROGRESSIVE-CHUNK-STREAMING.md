# FA-WORLD-035 — Progressive chunk streaming and visual reveal

Status: implemented on `feat/fa-world-engine-p0`; CI qualification pending.
Scope: incremental client-side chunk preparation, bounded per-frame work, retained chunk cache and synchronized terrain/prop/vegetation reveal.

## Runtime architecture

- `ChunkStreamScheduler` computes a deterministic desired chunk window around the active camera/player anchor.
- Pending chunks are prioritized by Manhattan distance, then stable row/column ordering.
- At most two chunks are prepared per animation frame in the normal render loop; initial bootstrap prepares four.
- Existing loaded chunks remain available while the desired window changes; the bounded `ChunkManager` cache evicts non-visible least-recently-used entries.
- Chunk reveal uses a 220 ms fog-to-world interpolation. Terrain, static chunk decoration and instanced vegetation use the same per-chunk opacity.
- Instanced vegetation remains in a single dynamic GPU buffer, but draw ranges are retained per chunk so the transition does not require one GPU buffer per foliage group.
- HUD reports visible chunks, pending chunks and a live progress bar. Reduced-motion preference disables the progress-bar transition.

## Determinism and budgets

- Chunk request ordering is stable for a given center/radius.
- LOD, terrain, navigation and world seed are unchanged.
- Scheduler validates center coordinates, radius, frame delta, load budget and transition duration.
- Default chunk size remains 16×16; GPU cache remains bounded at 32 buffers/chunks under the current 64×64 sector contract.

## Tests

- Nearest-first incremental loading and per-frame budget.
- Queue reprioritization after crossing chunk boundaries.
- Fade progression and saturation.
- Invalid coordinates, budgets, delta and transition duration.

## Scope limits

- Current world remains a finite 64×64 generated sector. This is progressive streaming within the existing sector, not infinite-world generation.
- Chunk source remains deterministic in-memory terrain; no remote asset/CDN fetch, persistent disk cache, cross-session world persistence or server zone paging is claimed.
- GPU frame-time profiling on physical devices remains a separate qualification task.
- No D1 migration, Worker deployment, PR merge or production deployment was performed.
