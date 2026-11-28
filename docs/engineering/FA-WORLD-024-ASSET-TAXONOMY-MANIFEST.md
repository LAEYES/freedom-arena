# FA-WORLD-024 — Stylized world asset taxonomy and manifest

Status: asset contract / inventory baseline
Parent: FA-WORLD-023
Target renderer: WebGL2, with Canvas 2D compatibility
Logical unit: one terrain tile = 1 x 1 world unit

## 1. Asset taxonomy

| ID prefix | Family | Initial world-first inventory |
|---|---|---|
| TER | Terrain | grassland, forest floor, sand, rock, snow, shallow water, deep water |
| ELEV | Elevation | slope, cliff face, ledge, plateau, bank, ramp |
| VEG | Vegetation | small shrub, broadleaf tree, conifer, dead tree, reeds, grass clump |
| WAT | Water | river segment, pond edge, waterfall proxy, bridge crossing |
| NAV | Navigation | dirt path, stone road, bridge, stairs, gate, signpost |
| ARC | Architecture | foundation, wall, corner, doorway, roof, tower, ruin, outpost |
| PRP | Props | rock cluster, crate, barrel, campfire, banner, lamp, resource node |
| POI | Landmarks | watchtower, shrine, dungeon entrance, market, boss arena marker |
| FX | Environment FX | mist, rain, snow, dust, leaf drift, water ripple |

## 2. Stable identifier convention

`fa.world.<family>.<biome>.<asset>.<variant>`

Examples:
- `fa.world.ter.temperate.grassland.base`
- `fa.world.veg.temperate.broadleaf.small`
- `fa.world.arc.frontier.outpost.watchtower`

IDs are immutable once referenced by saved world data. Visual revisions increment the asset version; they do not rename the stable ID.

## 3. Manifest record

Every production asset must provide:
- `id`: stable identifier;
- `version`: semantic version;
- `family`: taxonomy prefix;
- `biomes`: supported biome tags;
- `dimensions`: width/depth/height in world units;
- `pivot`: normalized origin/pivot definition;
- `render`: GLB URI, material IDs, LOD levels and shadow policy;
- `collision`: none / box / capsule / custom proxy;
- `navigation`: walkable / blocked / costly / decorative;
- `placement`: allowed terrain, slope/elevation range, spacing and deterministic seed channel;
- `provenance`: author/source, license, source URI and approval state.

Example record (illustrative; no external model is implied):
```json
{
  "id": "fa.world.veg.temperate.broadleaf.small",
  "version": "0.1.0",
  "family": "VEG",
  "biomes": ["temperate_forest", "temperate_grassland"],
  "dimensions": { "width": 1.4, "depth": 1.2, "height": 2.8 },
  "pivot": "ground_center",
  "render": {
    "format": "glb",
    "uri": null,
    "materials": ["mat.vegetation.leaf_a", "mat.vegetation.bark_a"],
    "lod": ["LOD0", "LOD1", "impostor"],
    "castShadow": true
  },
  "collision": { "type": "box", "radius": 0.28, "height": 2.4 },
  "navigation": "blocked",
  "placement": {
    "terrain": ["grass", "forest"],
    "maxSlope": 0.35,
    "minSpacing": 1.8,
    "seedChannel": "vegetation"
  },
  "provenance": {
    "source": "procedural_placeholder",
    "license": "project-generated",
    "approval": "placeholder"
  }
}
```

## 4. Initial placeholder inventory

The current WebGL2 renderer already provides procedural geometry for terrain, avatar, NPC, POI building, event beacon, boss and weather particles. These are valid greybox placeholders, not production art assets.

| Priority | Asset set | Required variants | Completion condition |
|---|---|---:|---|
| P0 | Terrain surface/material families | 6 | Distinct palette, stable tile mapping |
| P0 | Elevation edges and cliffs | 4 | No visible gaps at adjacent height levels |
| P0 | Vegetation silhouettes | 6 | Three distance tiers, deterministic placement |
| P0 | Water and shoreline | 4 | Clear walkability boundary and visual depth |
| P1 | Paths, bridges and crossings | 6 | Logical navigation parity |
| P1 | Frontier settlement kit | 10 | Modular placement and readable POIs |
| P1 | Ruins and dungeon entrances | 5 | Distinct landmark silhouettes |
| P2 | Small props and ambient dressing | 12 | Chunk batching and density controls |
| P2 | Weather and biome particles | 5 | Quality-tier particle limits |

## 5. LOD policy

- LOD0: near camera, full silhouette and material detail.
- LOD1: reduced geometry and material count.
- LOD2: simplified silhouette or instanced impostor where visually valid.
- Cull beyond the configured visibility range; do not remove gameplay collision/navigation data.
- LOD changes must not alter world coordinates, actor state, POI identity or pathfinding.

## 6. Deterministic placement

Placement key = world seed + absolute tile coordinates + family ID + stable asset ID.
Do not seed from render order, frame number, random global state or chunk load order.
Chunk boundaries must use absolute world coordinates so adjacent chunks produce matching results.
Hand-authored overrides take precedence over procedural placement and must be serializable.

## 7. Validation gates

- [ ] All asset IDs unique and immutable.
- [ ] All dimensions and pivots finite and positive/valid.
- [ ] All GLB references have provenance and license status.
- [ ] Every collidable asset has a simplified collision proxy.
- [ ] Decorative assets cannot change logical walkability.
- [ ] Placement is deterministic across repeated runs and chunk load order.
- [ ] Chunk edge placement produces no duplicates or gaps.
- [ ] LOD changes preserve navigation and interaction.
- [ ] Asset manifest parser rejects malformed records and unknown families.

## 8. Delivery rule

Do not import unlicensed third-party models. Until approved source assets exist, use procedural placeholders and record their status explicitly. The manifest is a contract and inventory; runtime loading is introduced in a later implementation task.