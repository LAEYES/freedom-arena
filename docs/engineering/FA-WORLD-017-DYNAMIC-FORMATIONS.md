# FA-WORLD-017 — Dynamic leader-following formations

## Runtime integration
- The elected local squad leader is tracked in the WebGL2 animation loop.
- Formation refresh is triggered after at least two leader tiles of Chebyshev displacement and a 900 ms minimum cooldown.
- Refresh is evaluated only by the currently elected leader, avoiding per-follower duplicate A* replanning.
- Followers in ALERT are replanned atomically from their current interpolated formation pose (rounded to a valid tile anchor); stale formation motions are replaced.
- Their tactical position/path state is synchronized to the replan origin before new motions are installed.
- Existing slot reservation, terrain walkability checks and A* route generation remain in force.
- The leader's own tactical controller remains authoritative for its local movement; formation motion is visual/local and does not change player movement or server state.

## Validation scope
- Existing pure tests cover deterministic leader election, displacement/cooldown gating, integer anchors, formation path origins, unique slots and bounded motion interpolation.
- CI must validate TypeScript, unit tests and Vite production build for the integration commit.

## Known limitations
- The squad roster is still derived from the active NPCs in the current scene; no persistent squad identifier or server authority exists.
- Followers only participate while their local behavior state is ALERT. Long pursuits can outlast the alert hold window; full reassembly after CHASE/RETURN requires persistent squad membership and is not claimed here.
- This is leader-following by periodic tactical slot refresh, not continuous rigid formation physics. Members may trail between refreshes.
- Encirclement, directional ballistic cover, health-based retreat, browser/mobile QA and measured CPU/GPU profiling remain future work.
