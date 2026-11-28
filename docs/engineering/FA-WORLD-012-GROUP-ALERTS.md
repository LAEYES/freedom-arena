# FA-WORLD-012 — Group alert coordination

## Objective
Coordinate nearby NPCs when one member visually acquires the player, without changing authoritative player state or adding combat.

## Signal model
- A tactical NPC transitioning into ALERT emits a one-hop group alert.
- The signal has a configurable Manhattan range (renderer default: 6 tiles).
- The grid ray is rejected when an intermediate non-walkable terrain cell blocks propagation.
- Recipients are deterministic and retain scene actor order.
- Duplicate IDs and the source actor are excluded.
- Only passive PATROL/IDLE agents are promoted; CHASE, ALERT and RETURN states are not overwritten.
- A recipient faces the source and enters ALERT. Existing local behavior then decides whether to chase or remain alert.

## Runtime integration
- World3DCanvas detects the first PATROL-to-ALERT transition.
- It resolves recipient IDs from current interpolated patrol/tactical positions.
- Passive recipients receive a tactical agent initialized at their current tile.
- The existing movement and A* controller remains responsible for subsequent navigation.
- Alert sharing is local/client-side and one-hop; no recursive relay, network synchronization or combat action is performed.

## Validation
Tests cover stable recipient order, source exclusion, range filtering, terrain occlusion, passive-state promotion, facing update, and protection of active tactical states.

## Limits / next qualification
This first increment uses a simple grid-distance signal with terrain-ray occlusion; it is not a calibrated acoustic model. No attenuation by material, elevation, weather or closed doors is modeled. Group formations, role-based tactics and server authority remain future work.
