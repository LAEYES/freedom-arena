# FA-WORLD-011 — Directional perception and terrain line of sight

## Objective
Upgrade NPC target acquisition from proximity-only to a deterministic directional field of view with grid-based terrain occlusion.

## Perception model
- Circular Euclidean acquisition radius, default 7 tiles.
- Forward field of view with a 120-degree full cone (60-degree half-angle).
- Facing vector is derived from the current patrol segment when the tactical controller is activated.
- Dot-product cone test avoids trigonometric angle calculations per target.
- Integer grid ray traversal checks intermediate terrain cells; non-walkable cells occlude vision.
- Origin and target cells are excluded from intermediate occlusion checks.

## Runtime integration
- NPCs continue their existing 010D patrol simulation until a player is within the forward perception cone and has clear terrain line of sight.
- On acquisition, the local tactical controller is initialized at the interpolated patrol tile and inherits patrol heading.
- The behavior controller maintains facing direction as it moves.
- Once acquired, existing ALERT/CHASE/RETURN state logic and A* pursuit behavior continue to apply.
- No combat, player state mutation, remote AI or server authority is introduced.

## Validation
Unit tests cover forward acquisition, rear and lateral rejection, radius limits, blocked and clear line of sight, zero heading, patrol acquisition and facing updates.

## Limits
This is grid/terrain occlusion only. It does not yet model vision through dynamic doors, smoke density, elevation-aware occlusion, faction-specific detection modifiers, sound propagation or server-side perception.
