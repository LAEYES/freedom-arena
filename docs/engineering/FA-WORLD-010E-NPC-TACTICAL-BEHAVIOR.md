# FA-WORLD-010E — Local NPC tactical behavior

## Scope
This increment adds and integrates a deterministic local NPC behavior controller into the WebGL2 renderer. It remains a client-side simulation primitive, not server-authoritative AI.

## State model
- IDLE: initialization/recovery state; transitions to PATROL.
- PATROL: existing A* patrol route remains active until a player enters the configured alert radius.
- ALERT: NPC becomes aware of the player and pauses its patrol; it enters CHASE when the player enters the closer chase radius.
- CHASE: computes an orthogonal A* route toward the player's current tile and replans when the target changes or the next route tile becomes occupied.
- RETURN: routes toward the NPC's original home tile after disengagement or leash-limit breach; resumes a stationary PATROL state on arrival.

## Runtime integration
- `World3DCanvas.tsx` owns one optional behavior agent per rendered NPC.
- NPCs without an active behavior agent continue using the 010D patrol simulation.
- On proximity detection, the tactical agent is initialized at the NPC's current interpolated patrol tile.
- Tactical poses are interpolated in the GPU render loop and are used for pointer selection.
- Other NPC positions are supplied as dynamic blocked tiles to A*. The current player's tile is allowed as the chase destination.
- The pre-existing player movement validation callback remains the authority for player movement. NPC behavior does not trigger combat or interaction callbacks.

## Safety and determinism
- A* uses the existing terrain navigation implementation; diagonal movement is disabled.
- Frame deltas are finite-checked and clamped to 100 ms.
- NPC movement accepts only walkable, unoccupied route tiles.
- Replanning occurs when the target tile or behavior state changes, or when the next route tile becomes dynamically blocked.
- The controller does not mutate authoritative game state, combat, inventory, or remote player state.

## Validation targets
Unit tests cover perception radii, state transitions, interpolated chase movement, deterministic target replanning, dynamic obstacle avoidance, return leash, bounded delta and walkability. Full CI and browser/mobile visual QA are required before production use.
