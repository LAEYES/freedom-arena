# FA-WORLD-027A — Modular low-poly landmark kits

Status: implemented; CI validation pending
Scope: replace generic POI blocks with distinct procedural landmark silhouettes.
Renderer: WebGL2 static scene buffer.

## Delivered asset families

- WATCHTOWER: stone plinth, tower shaft, upper platform and tapered roof.
- SHRINE: stepped plinth, central chamber, paired side pillars and roof.
- RUINS: broken wall segments, offset wall fragment and lintel.
- GATE: paired vertical piers and horizontal crossbeam.

POI order deterministically selects a landmark family. Each structure is positioned from its existing logical POI tile and terrain elevation.

## Technical constraints

- Geometry uses the shared six-float vertex contract (XYZ + RGB).
- Meshes are procedural placeholders; no external model dependency or license claim.
- POI tile identity, interaction and selection remain unchanged.
- The meshes are visual-only: no collision or navigation changes.
- Existing 2D renderer and logical terrain state remain untouched.

## Validation

- Unit tests assert non-empty finite geometry for all four families and stable output.
- CI is required to validate the latest branch head before marking this task complete.

## Deferred

Road surfaces, bridge crossings, terrain-edge transitions and full modular settlement districts are not part of this subtask. A bridge must not visually imply traversability until its logical navigation/collision semantics are implemented.