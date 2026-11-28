# FA-WORLD-022 — Multi-squad coordination and collision-safe trajectories

## Threat prioritization
`rankNpcThreats` computes a deterministic score from explicit caller-supplied fields:
- priority, clamped to 0–100 and weighted by 100;
- urgency, clamped to 0–10 and weighted by 10;
- visibility bonus of 25;
- Euclidean distance penalty.

Stable tie-breaks use distance then actor ID. These inputs are tactical metadata supplied by the caller; the function does not infer hostility, health, damage or objective importance.

## Multi-squad interception
`planMultiSquadInterceptions` plans unique staging cells for several local squads around one target:
- squads are ordered by average Manhattan distance to the target, then squad ID;
- members are ordered by actor ID;
- starting cells of all participating actors and the target are reserved;
- candidate positions are generated on bounded Manhattan rings;
- each route uses orthogonal A* and respects all previously reserved cells;
- the first ring with reachable candidates is considered; route length and coordinates break ties;
- unreachable members are omitted instead of being teleported.

This creates globally unique destinations across squads, unlike independent per-squad planning.

## Simultaneous trajectory scheduler
`scheduleNpcTrajectories` advances one grid step per tick and resolves simultaneous intents:
- destination-cell conflicts cause all claimants to wait;
- entering an occupied cell is allowed only if its occupant successfully vacates during that tick;
- opposing edge swaps are rejected;
- no actor is moved by teleportation;
- bounded tick count returns completed and blocked actor IDs.

The policy is intentionally conservative. It does not perform deadlock recovery, priority arbitration, diagonal movement, continuous collision detection, or physical trajectory integration. A blocked schedule is reported rather than silently forcing movement.

## Validation
Tests cover deterministic threat ranking, 500 threat candidates, cross-squad unique reachable staging cells, shared-destination conflicts, edge swaps, and per-frame non-overlap.

## Limits
These are deterministic client-side planning primitives. They are not connected to authoritative server combat, attack execution, damage, health, projectile physics, multiplayer synchronization, or a persistent squad registry. No measured FPS/GPU benchmark is claimed.
