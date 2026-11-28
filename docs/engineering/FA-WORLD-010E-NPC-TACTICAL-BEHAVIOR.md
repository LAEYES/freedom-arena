# FA-WORLD-010E — Local NPC tactical behavior

## Scope
This increment introduces a deterministic, pure TypeScript behavior controller for local NPC perception and route selection. It is a simulation primitive, not server-authoritative AI.

## State model
- IDLE: initialization/recovery state; transitions to PATROL.
- PATROL: default ambient behavior; enters ALERT inside the configured Manhattan alert radius.
- ALERT: awareness state; enters CHASE inside the chase radius or returns to PATROL after disengagement.
- CHASE: computes an orthogonal A* route toward the player; exits to RETURN when disengagement or leash limits are exceeded.
- RETURN: routes toward the NPC home tile and resumes PATROL at home.

## Safety and determinism
- A* uses the existing terrain navigation implementation.
- Diagonal movement is disabled.
- Frame deltas are finite-checked and clamped to 100 ms.
- Candidate positions are accepted only when the corresponding terrain tile is walkable.
- Replanning occurs when the target tile or behavior state changes.
- No authoritative player/NPC state, combat, inventory, or interaction callback is modified.

## Current integration boundary
The controller and deterministic unit tests are introduced as an isolated simulation layer. The existing 010D patrol renderer remains the active visual runtime until a subsequent integration increment wires tactical poses into the GPU render loop and validates behavior in-browser.

## Validation targets
Unit coverage: state transitions, target-change replanning, deterministic replay, bounded delta, and walkable-tile guard. Browser/mobile performance and visual behavior remain pending.
