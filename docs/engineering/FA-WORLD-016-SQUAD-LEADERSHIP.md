# FA-WORLD-016 — Squad leadership and formation refresh policy

## Implemented
- Stable squad leader election from active local NPCs, sorted by actor ID rather than render-array order.
- Live WebGL alert formation now elects the leader from the alert recipients before assigning slots; the elected leader remains the anchor and is excluded from follower allocation.
- Added a deterministic formation refresh policy primitive: replan only after a configurable leader displacement and cooldown, with integer tile anchors to suppress sub-tile animation noise.
- Added tests for order-independent election, empty eligibility, displacement/cooldown thresholds, invalid time and anchor rounding.

## Current runtime boundary
The stable leader election is connected to alert-triggered formation planning. The refresh policy is implemented and tested as a pure primitive, but continuous leader-following/replanning is not yet connected to the animation loop. Existing formation paths therefore remain fixed after initial alert assembly.
No persistent squad ID, network synchronization, server authority or combat authority is introduced.

## Deferred
- Connect the refresh policy to live leader movement and replan all followers atomically.
- Reassemble after chase/return and retain squad membership across state transitions.
- Offensive encirclement, directional ballistic cover and health-based retreat.
- Browser/mobile visual QA and measured CPU/GPU profiling.
