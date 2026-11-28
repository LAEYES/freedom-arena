# FA-WORLD-015 — Live squad formation integration

## Runtime behavior
- A visual acquisition followed by a group alert now triggers a formation plan for passive allies that accepted the alert.
- Each member's A* route begins at that member's current interpolated patrol/tactical tile, not at the leader's tile.
- The planner assigns deterministic role-aware slots, reserves destinations and validates walkability.
- The renderer advances member motion using bounded frame delta and interpolates terrain height at the current formation pose.
- On arrival, the tactical agent's local position is synchronized to its assigned slot and its temporary formation motion is released.
- If a member transitions to CHASE or another non-ALERT state, its formation motion is cancelled so the existing tactical controller regains control.
- Received alerts persist for a bounded 1.8-second coordination window when the player is outside the recipient's own perception radius. This gives the squad time to assemble without creating indefinite alert states.

## Authority and safety boundaries
All squad planning and movement remain client-local visual simulation. Player movement and authoritative game state are unchanged. The group is derived from the current zone's NPC actors; no persistent faction squad identity, server election, combat resolution or network synchronization is introduced.

## Validation
- Formation planner tests verify routes start at each member's own tile.
- Behavior tests verify bounded alert persistence.
- Existing formation tests cover deterministic slots, occupancy, terrain validation and bounded interpolation.

## Deferred
- Continuous moving-leader formation following and reassembly after chase.
- Explicit squad identity persisted across zone changes.
- Directional ballistic cover and line-of-fire.
- Health-based retreat, pending authoritative NPC health data.
- Browser/mobile visual QA and real CPU/GPU profiling.
