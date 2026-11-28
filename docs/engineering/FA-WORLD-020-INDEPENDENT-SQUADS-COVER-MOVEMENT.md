# FA-WORLD-020 — Independent squad controllers and directional cover movement

## Independent local squad controllers
- The WebGL2 renderer now partitions alerted NPCs into proximity/terrain-visibility connected components.
- Each component receives its own state record keyed by elected leader ID: member IDs, leader anchor and elapsed refresh time.
- An actor-to-squad membership map scopes formation refresh and coordinated regrouping to the correct component.
- Each squad elects its leader independently; if the current leader becomes ineligible, deterministic handoff migrates the controller key and all member references to the replacement.
- Leader movement refreshes only that squad's formation, preserving the existing displacement threshold (2 tiles) and cooldown (900 ms).
- Squad regroup after CHASE → RETURN is scoped to the affected squad; unrelated local groups are not reset.

## Guard movement to directional cover
- GUARD members receive an A* route to the best reachable directional cover position during initial assembly and leader-triggered refresh.
- Candidate ranking prefers terrain cells that block the terrain-grid line of sight to the current player threat, then hard cover, exposure and stable coordinate tie-breaks.
- Occupied tiles are reserved; a guard's own start tile is removed from the obstacle set so the route can leave its current position.
- If no reachable cover route exists, the guard retains its ordinary formation slot route.

## Validation scope
- Added deterministic leader-handoff tests.
- Added route tests verifying A* starts at the actor position and ends at a cover tile that blocks the threat ray.
- Existing deterministic partition, dynamic role, formation, perception and NPC behavior suites remain applicable.

## Limits
- Squad identities and controllers are client-local to the active zone. No server persistence, network synchronization or cross-client coordination.
- Squads are assembled from actors in ALERT at the time of the alert propagation event; this is not a global persistent squad registry.
- Cover selection is terrain-grid occlusion, not ballistic/projectile physics or guaranteed damage avoidance.
- GUARD cover routes are recalculated at formation assembly/refresh, not continuously every frame.
- No combat targeting/damage, health-based retreat, measured FPS/GPU benchmark, or browser/mobile visual QA is claimed.
