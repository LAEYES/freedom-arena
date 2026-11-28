# FA-WORLD-021 — Geometric engagement and interception planning

## Objective
Introduce deterministic, testable tactical geometry for engagement and approach coordination without inventing combat authority or damage semantics absent from the current game model.

## Geometric engagement gate
`evaluateNpcEngagement` evaluates:
- Euclidean distance against a bounded range;
- terrain-grid line of sight;
- facing arc using a normalized dot product and configurable half-angle;
- optional remaining cooldown.

The returned status is one of `READY`, `OUT_OF_RANGE`, `OCCLUDED`, `OUT_OF_ARC`, or `COOLDOWN`. Gate precedence is deterministic: range, visibility, facing, cooldown. The evaluator is pure and does not mutate game state.

## Multi-agent interception slots
`planNpcInterceptionSlots` assigns distinct cardinal staging cells adjacent to a target:
- stable member ordering by actor ID;
- candidate routes computed with orthogonal A*;
- occupied positions reserved, while each member's own start tile is allowed as its route origin;
- unique target-adjacent slots reserved after assignment;
- deterministic tie-breaking by route length and coordinates;
- unreachable members are omitted rather than teleported.

This is an approach/staging planner. It does not initiate attacks or resolve hits.

## Tests
Coverage includes valid geometry, out-of-range, out-of-arc, cooldown, terrain occlusion, deterministic slot assignment, unique staging cells, occupied start handling and route endpoint correctness.

## Explicit limits
- These primitives are not yet wired to authoritative combat execution or a renderer attack animation.
- No weapon model, projectile simulation, hit probability, damage, health, armor, faction hostility, server authority or multiplayer synchronization is added.
- Cooldown is an input to the pure evaluator; no persistent cooldown store is created.
- Interception staging is geometric path planning, not collision-resolved multi-agent trajectory simulation.
