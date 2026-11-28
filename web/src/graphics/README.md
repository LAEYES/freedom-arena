# Freedom Arena Graphics Pipeline — foundation

## Scope
A rendering-independent asset factory for deterministic biome materials. It is designed to feed the existing Canvas2D world renderer first, while keeping the data contract usable by a later WebGL/Three.js renderer.

## Current implementation
- Five biome palettes: temperate, arid, frozen, volcanic, coastal.
- Seven material classes: ground, water, rock, wall, sand, snow, lava.
- Seeded deterministic texture generation.
- 64/128/256 px tile outputs.
- Stable asset IDs and versioned descriptors.

## Integration contract
1. Create a descriptor with `createAsset(kind, biome, seed, size)`.
2. Draw it to an existing CanvasRenderingContext2D with `paintProceduralTile(ctx, asset, x, y)`.
3. Cache generated tiles by descriptor ID; invalidate cache when descriptor version or seed changes.
4. Keep simulation coordinates and collision rules in `world.ts`; graphics must never mutate gameplay state.

## Next implementation slice
- Add a Graphics Studio panel to the React UI (palette controls, seed, tile-size selector, live preview).
- Add atlas packing/export and asset metadata validation.
- Add sprite animation tracks and actor/POI asset slots.
- Evaluate WebGL renderer only after profiling the current Canvas2D path; avoid introducing a 3D dependency before the visual/editor contract is stable.
