# FA-WORLD-019 — Multi-squad tactical coordination primitives

## Delivered

### Deterministic local squad partitioning
`partitionNpcSquads` builds connected components from active tactical actors. An edge exists when two actors are within a configurable Manhattan radius and have terrain-grid line of sight. Input ordering does not affect component/member ordering. IDLE agents are excluded.

This is a local spatial partitioning primitive, not a persistent squad registry or multiplayer group system.

### Threat-relative role assignment
`assignNpcDynamicRoles` assigns GUARD to the nearest member, SCOUT to the farthest member and SUPPORT to intermediate members. Equal-distance ties are resolved by actor ID. The renderer applies these assignments when initially planning and refreshing a formation, so role-dependent formation spacing responds to current threat geometry.

### Directional terrain cover
`findNpcDirectionalCoverPositions` ranks candidate cover using terrain-grid line of sight to a specified threat. Positions blocking the threat ray rank ahead of exposed positions; hard cover, exposure and deterministic coordinate tie-breaks refine the order.

This is geometric terrain occlusion only. It is not ballistic simulation, projectile collision, armor, suppression, or guarantee of protection from attacks.

## Tests
- Deterministic squad components and order independence.
- Connected-component behavior for chains of nearby actors.
- Dynamic role assignment and stable tie-breaking.
- Directional cover ranking when a rock tile blocks the ray.
- Existing formation, perception, navigation and NPC behavior regression suites.

## Boundaries
- The renderer still owns one active local squad formation state at a time. The partition helper supports identifying multiple local groups, but simultaneous independent formation controllers are not yet connected.
- Directional cover is implemented and tested as a planner, but cover-seeking movement is not yet issued by the renderer.
- No server authority, persistent squad IDs, remote actor coordination, combat targeting/damage, ballistic physics, health-based retreat, or measured GPU/FPS profiling.
- Stress tests remain deterministic CPU regression tests, not a benchmark report.
