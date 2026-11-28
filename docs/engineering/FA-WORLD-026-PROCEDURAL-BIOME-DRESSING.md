# FA-WORLD-026 — Procedural biome dressing

Status: implemented and CI validated
Parent: FA-WORLD-023 visual baseline; FA-WORLD-024 asset contract; FA-WORLD-025 palette/hash utilities.
Renderer: WebGL2 scene buffer. Logical terrain and navigation remain authoritative.

## 1. Delivered

- Stylized low-poly broadleaf, conifer and shrub mesh generators.
- Shared pyramid primitive with face shading.
- Biome-aware foliage colors using the five established biome style presets.
- Stable sub-tile offsets derived from world seed, absolute tile coordinates and placement channel.
- Sector dressing mesh generator integrated into `World3DCanvas` scene geometry.
- Rock accents generated on selected rock tiles.
- Water tiles are excluded from vegetation placement.

## 2. Placement policy

| Terrain kind | Density threshold | Decoration |
|---|---:|---|
| forest | 0.34 | Broadleaf / conifer |
| grass | 0.075 | Shrub / broadleaf |
| snow | 0.055 | Conifer |
| sand | 0.025 | Shrub |
| rock | 0.12 | Rock accent |
| water | 0 | None |

The density and variant samples are deterministic and independent of render order. Sub-tile offsets use separate channels. Repeating the same world seed and tile coordinates yields byte-identical mesh geometry.

## 3. Geometry contract

- Vertex layout remains six float values: world position XYZ + RGB.
- Geometry is emitted as triangles compatible with the existing WebGL2 vertex layout.
- Terrain height is sampled through the shared `terrainWorldHeight` function.
- Decoration does not modify terrain walkability, movement cost, pathfinding or tile identity.
- No external model files or third-party licenses are introduced by this procedural placeholder set.

## 4. Integration

`World3DCanvas` appends the sector dressing mesh to the existing static scene buffer before POI and event geometry. The current scene buffer is uploaded once per scene initialization. Dynamic actors and weather continue to use their independent buffers.

This first pass intentionally uses bounded per-sector geometry and does not yet implement camera-frustum culling, chunk-local decoration buffers or runtime GLB loading. Those are separate optimization and asset-pipeline tasks.

## 5. Validation

- Unit tests cover all three vegetation variants, deterministic output, finite vertex values, non-empty forest dressing and water exclusion.
- GitHub Actions Web build: run 414, commit `91e2b7f511b4a0e6f2e71c02316448e26f7db28e`.
- 22 test files passed; 150 tests passed.
- `tsc -b` passed.
- Vite production build passed.
- Hostinger workflow build passed; FTP upload was skipped because the pull request remains Draft.

## 6. Remaining work

- Add chunk-local decoration buffers and frustum/distance culling.
- Replace or complement procedural placeholders with provenance-approved GLB assets.
- Add modular terrain edges, water shoreline transitions and settlement kits.
- Add hybrid third-person/isometric camera controller parity.
- Profile GPU memory, vertex counts, frame time and scene density on reference devices.

No measured FPS or production deployment is claimed.