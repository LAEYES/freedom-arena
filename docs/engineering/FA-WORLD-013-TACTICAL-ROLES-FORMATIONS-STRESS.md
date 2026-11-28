# FA-WORLD-013 — Tactical roles, formation geometry and population stress

## Tactical roles
The renderer now maps existing actor activity metadata to deterministic tactical profiles:
- SCOUT (`activity=patrol`): alert radius 9, chase radius 5, disengagement radius 12, chase leash 14, step duration 360 ms.
- GUARD (`activity=defend`): alert radius 7, chase radius 3, disengagement radius 8, chase leash 8, step duration 520 ms.
- SUPPORT (other or missing activity): alert radius 6, chase radius 3, disengagement radius 9, chase leash 10, step duration 460 ms.

These values configure the existing local NPC behavior controller. They do not add actor schema fields or authoritative combat capabilities.

## Formation geometry
`getNpcFormationSlot` calculates deterministic rear-echelon left/right slots relative to a leader and normalized facing. It provides tactical intent coordinates only. The current renderer does not yet command NPCs to occupy these slots: walkability, occupancy arbitration and formation path-following must be implemented before formations can be represented as active movement behavior.

## Population stress coverage
A deterministic CPU simulation stress suite advances synthetic patrol agents at populations of 50, 100 and 250 over 120 bounded frames. It verifies stable replay, finite clocks and valid path indices.

This is a functional scalability regression test, not a wall-clock benchmark, browser profiling session, GPU load test or full A* stress measurement. It does not establish a target FPS or a performance guarantee.

## Explicitly deferred
- Active formation following and obstacle-aware slot assignment.
- Tactical cover: terrain currently exposes walkability, movement cost and elevation, but no cover metadata.
- Health-based retreat: actor state currently provides no authoritative health input.
- Server-authoritative squads, combat and network synchronization.
- Browser/mobile visual QA and real GPU profiling.
