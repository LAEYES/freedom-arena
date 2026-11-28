# FA-WORLD-018 — Persistent squad membership and coordinated regrouping

## Implemented behavior
- The renderer retains the member IDs of the locally assembled squad across tactical state changes.
- A known squad member transitioning from CHASE to RETURN requests a squad regroup.
- Active squad members in CHASE or RETURN have their individual pursuit/return route cancelled and are reset to ALERT at their current tile.
- The existing stable leader election then chooses the regroup anchor; the normal terrain-aware formation planner assigns reserved slots and A* routes.
- Formation motion is cleared before new routes are installed. Members are not teleported: each new route starts at the member's current position.
- Squad state is reset when the zone's NPC scene is reinitialized.

## Tests
- The regroup trigger is restricted to known squad members and the CHASE -> RETURN transition.
- Regroup reset preserves identity, home tile and facing while resetting path, interpolation and target state.
- Existing formation, leader-election, refresh and NPC behavior tests remain in force.

## Boundaries
- Squad membership is local to the active zone renderer; it is not persisted to a server or shared between clients.
- Regroup is triggered by pursuit disengagement, not by a server-authoritative command.
- Members in PATROL are not forcibly pulled into a regroup unless they receive the existing local alert propagation.
- This does not implement combat resolution, target assignment, damage, health-based retreat, persistent squad IDs, multiplayer synchronization, or ballistic cover.
- No browser/mobile visual QA or wall-clock performance profiling is implied by unit tests.
