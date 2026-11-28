# FA-WORLD-032 — Bridge traversal and settlement districts

Status: implementation committed; CI validation pending.

## 1. Bridge links and navigation

- `detectBridgeLinks` scans the generated terrain deterministically.
- A bridge candidate is one water tile with two opposing walkable cardinal banks (east/west or north/south).
- The terrain tile remains `kind: water`, `walkable: false`; bridge traversal is an explicit navigation capability, not a mutation of base terrain rules.
- `NavigationOptions.bridgeTiles` permits only validated bridge water cells.
- A* cardinal movement cost for a bridge deck is 2.25; ordinary grass remains 1.0.
- Diagonal corner-cut prevention continues to apply.
- 3D click-to-move and keyboard pathing pass the bridge tile set.
- The movement adapter receives a `viaBridge` flag for bridge deck steps, allowing the 3D path to persist player coordinates without changing legacy 2D tile rules.
- Bridge geometry is emitted from the validated link banks and water tile.

## 2. Settlement districts

- One deterministic district is generated around each POI anchor.
- If the POI anchor is not walkable, the generator searches a Manhattan radius of six tiles for a walkable center.
- Five structure roles are defined: hall, market, workshop, residence and watchpost.
- Lot selection is deterministic from world seed and absolute tile coordinates; lots are unique and walkable.
- Structures are partitioned into the existing 16×16 chunk-local scene meshes.
- Each building tile resolves to a typed interaction: governance, trade, craft, rest or defense.
- Interaction action mapping reuses existing reward semantics: governance/rest → explore; trade/craft → loot; defense → encounter.
- A selected structure can set an auto-navigation waypoint; the action resolves when the player reaches its tile.

## 3. Tests

- Bridge detection: east/west and north/south crossings; reject missing opposing banks.
- Navigation: bridge-only water traversal, path continuity, explicit bridge movement cost and step resolution.
- Settlement generation: deterministic output, unique walkable lots, five interaction roles, lookup and input validation.
- Rendering: finite deterministic geometry for all five structure silhouettes.

## 4. Limits

- Bridges are currently one water tile wide and cardinal only.
- No multi-cell spans, diagonal bridges, bridge damage or ownership state.
- Settlement buildings are visual and interaction anchors; collision footprints and interior spaces are not implemented.
- Lot selection is deterministic but not yet constrained by road frontage, slope, parcel zoning or settlement population.
- The parent 2D movement model is not changed; the bridge-aware movement adapter is used by the 3D renderer only.
- No MMO authority or persistence is introduced by this lot.

## 5. Next

FA-WORLD-033: server-authoritative world state, chunk/zone synchronization, persistence and conflict-safe player movement.
