# FA-WORLD-023 — Stylized open-world visual and technical specification

Status: proposed implementation baseline
Branch: `feat/fa-world-engine-p0`
Scope: visual direction, world composition, camera contract, asset constraints and acceptance criteria.
Compatibility: preserve the existing Canvas 2D renderer and the independent WebGL2 renderer.

## 1. Approved direction

- Art style: stylized fantasy, readable silhouettes, deliberately simplified forms and hand-authored color groupings.
- Camera: hybrid orthographic/isometric exploration plus third-person view. Both modes observe the same authoritative world coordinates and actor state.
- Priority: world-first. Terrain, biome identity, traversal readability, landmarks and settlements precede character-detail work.
- Simulation: retain the logical 64 x 64 tile grid per sector and world X/Y/Z coordinates. Rendering must never become the source of gameplay truth.

## 2. Visual language

### Shape grammar
- Terrain: broad readable masses, stepped cliffs, softened bevels and clear elevation transitions.
- Vegetation: grouped canopy silhouettes and varied height tiers; avoid noisy individual foliage at distance.
- Architecture: modular foundations, wall segments, roof families, gates and landmark silhouettes.
- Props: low-to-medium geometric complexity with consistent scale and collision proxies.
- Actors: strong faction color accents and silhouette separation from terrain.

### Color and lighting
- Use biome-specific palettes with controlled saturation and luminance separation.
- Reserve high-contrast accent colors for interactive objects, threats and navigation cues.
- Use a consistent key-light direction; ambient contribution must preserve readability in shadow.
- Weather and day/night modify lighting and atmosphere without changing terrain/gameplay state.
- Avoid relying on color alone for interaction state; combine shape, iconography or outline.

## 3. World composition order

1. Terrain base: grass, forest floor, sand, rock, snow and water.
2. Elevation: slopes, cliffs, plateaus, banks and traversability boundaries.
3. Biome dressing: trees, shrubs, stones, ground cover and biome-specific details.
4. Water systems: shorelines, shallow/deep water, rivers and crossings.
5. Navigation landmarks: roads, bridges, towers, ruins and gates.
6. Settlements: modular buildings, districts, walls and POI anchors.
7. Dynamic layers: weather, day/night, ambient particles and local events.

Procedural placement must be deterministic from world seed + sector coordinates + asset family. Hand-authored overrides must remain possible.

## 4. Coordinate and camera contract

- Logical tile coordinates remain integer (i, j); elevation is represented independently.
- World positions use X/Y horizontal axes and Z elevation.
- Isometric mode uses an orthographic projection and supports pan, zoom and bounded rotation.
- Third-person mode uses a perspective camera with collision-aware follow behavior.
- Camera switching changes only view/controller state; it must not teleport actors, alter pathfinding or change sector identity.
- Picking, navigation and interaction resolve against the logical world, not screen-space mesh approximations.
- Camera transitions must preserve the selected actor and current target where possible.

## 5. Asset pipeline contract

- Preferred interchange: glTF 2.0 binary (.glb), with explicit scale, origin and naming conventions.
- Materials: PBR metallic-roughness; avoid unnecessary material variants.
- Textures: power-of-two dimensions where practical; atlas repeated small props; mipmaps required for minified textures.
- Geometry: separate render mesh from simplified collision/navigation proxy.
- Each asset record declares stable ID, category, biome tags, dimensions, pivot, LOD policy, collision class, material set, source/license and version.
- Procedural placeholders remain valid during development; no external asset may be treated as licensed until its provenance is recorded.

## 6. Performance strategy

- Retain the existing 16 x 16 chunk streaming model.
- Frustum culling and distance-based LOD are required before high-density decoration.
- Batch compatible static geometry by chunk/material; keep dynamic actors separately updateable.
- Use instancing for repeated vegetation and props where supported by the current WebGL2 abstraction.
- Bound particle counts and update rates by quality tier.
- No FPS claim is accepted without a reproducible benchmark: device/GPU, resolution, scene seed, visible chunks, actor count, median and 1% low frame time.

Initial engineering budgets (targets to measure, not current claims):
- 60 FPS target on reference desktop at 1920 x 1080; frame budget 16.67 ms.
- 30 FPS minimum target on agreed low-tier reference hardware; frame budget 33.33 ms.
- No unbounded growth in GPU buffers, chunk cache or actor render lists.

## 7. Accessibility and readability

- Maintain visual distinction between traversable and blocked terrain.
- Critical POIs remain readable at isometric zoom-out.
- Avoid flashing effects; provide reduced-particle and reduced-motion settings.
- UI indicators remain screen-space overlays and are not baked into world textures.

## 8. Compatibility constraints

- Do not remove or rewrite the Canvas 2D renderer.
- Do not duplicate gameplay state between 2D and 3D.
- Keep pathfinding, terrain classification, POI identity and actor state independent of rendering.
- Existing weather, day/night, NPC, formation and tactical planning systems remain consumers of shared world data.
- Server authority, multiplayer synchronization and persistence are separate scopes and must not be implied by a client renderer.

## 9. Acceptance criteria

- [ ] Both camera modes render the same sector and actor coordinates.
- [ ] Switching camera does not change actor tile, path, target or world seed.
- [ ] Terrain and biome palette mapping is deterministic.
- [ ] Chunk load/unload does not create duplicate entities or persistent GPU allocations.
- [ ] LOD transitions do not alter collision or navigation.
- [ ] Interactive POIs remain pickable in both camera modes.
- [ ] Canvas 2D fallback remains functional.
- [ ] Build, type-check and unit tests pass.
- [ ] Performance report records the reference machine and reproducible scene parameters.

## 10. Implementation sequence

FA-WORLD-023: approve this visual/technical baseline.
FA-WORLD-024: asset taxonomy, manifest schema and placeholder inventory.
FA-WORLD-025: biome/terrain palettes and deterministic placement primitives.
FA-WORLD-026: procedural low-poly biome dressing integrated into the WebGL2 scene buffer.
FA-WORLD-027A: modular low-poly POI landmark kits (watchtower, shrine, ruins, gate).
FA-WORLD-027B: A*-aligned POI roads, exposed cliff faces and a visual-only one-tile bridge primitive; bridge traversal and settlement districts remain deferred.
FA-WORLD-028: orthographic/perspective hybrid camera modes and third-person player follow.
FA-WORLD-029: per-chunk terrain GPU buffers, frustum culling, bounded LRU cache and GPU buffer disposal (first pass).
FA-WORLD-030: rolling frame-time telemetry, FPS HUD, deterministic geometry fingerprints and benchmark protocol; screenshot/pixel regression remains deferred.
FA-WORLD-031: chunk-local decoration meshes, shared-template instanced vegetation and distance-based high/medium/low LOD tiers; GPU profiling remains pending.
FA-WORLD-032: validated one-cell cardinal bridge links integrated with A* and the 3D movement adapter; deterministic five-role settlement districts, chunk-local building meshes and typed building interactions. Multi-cell bridges and building collision footprints remain deferred.
FA-WORLD-033: D1 world presence, revisioned zone snapshots, movement CAS/event log and serialized browser sync; terrain/bridge authority, authentication and rate limiting remain pending.
FA-WORLD-034: authenticated server authority, terrain/bridge validation, zone-state schemas, rate limiting and remote snapshot reconciliation.

No merge or deployment is authorized by completion of these tasks.