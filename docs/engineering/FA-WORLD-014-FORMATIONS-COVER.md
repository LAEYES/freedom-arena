# FA-WORLD-014 — Formation path planning and terrain cover

## 014-A — Formation planner
- Stable member ordering by actor ID.
- Role-aware rear-echelon slot spacing (GUARD closer than SCOUT/SUPPORT).
- Terrain walkability validation and bounded cardinal fallback search.
- A* path generation to each allocated slot.
- Leader origin is allowed as the route start while remaining unavailable as a member slot.
- Slot reservations prevent two members from receiving the same destination.
- Bounded frame-delta path interpolation for a planned member.

The planner is a deterministic, testable subsystem. It is not yet connected to the live renderer's patrol lifecycle: group identity, leader election, formation reassembly after combat, and live occupancy handoff must be wired before actors visibly move in formation.

## 014-B — Defensive terrain positions
The current terrain model has no explicit cover metadata. This increment derives candidate defensive positions from existing terrain:
- LIGHT: walkable forest tiles.
- HARD: walkable tiles cardinally adjacent to non-walkable rock tiles.
- Candidates must be walkable, unoccupied and within a bounded Manhattan radius.
- Results are deterministically ranked, with hard cover preferred and distance used as exposure proxy.

This is terrain-derived cover selection, not a ballistic or line-of-fire simulation. It does not account for projectile height, direction, weapon penetration, destructible cover or animation.

## Deferred
- Live formation leader and member group binding in World3DCanvas.
- Continuous formation following while leader patrols.
- Tactical movement from alert/chase into cover and retreat.
- Health-based retreat; no authoritative NPC health field exists.
- A* benchmark and browser/GPU profiling at 250 NPCs.
