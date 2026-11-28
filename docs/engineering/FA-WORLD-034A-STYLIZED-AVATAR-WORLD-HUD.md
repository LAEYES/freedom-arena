# FA-WORLD-034A — Integrated stylized avatar and world HUD

Status: implemented on `feat/fa-world-engine-p0`
Scope: visual integration increment; no gameplay authority or production rollout changes.

## Changes

- Reworked `buildAvatarMesh` into a 15-primitive low-poly adventurer.
- Added layered helmet, visor, shoulder plates, articulated arms, chest plate, metal insignia, waist plate, greaves and boots.
- Preserved world-space tile/elevation contract and deterministic gait phase.
- Preserved identical mesh topology between idle and walking states.
- Updated renderer geometry tests to assert 15 primitives and deterministic animation.
- Refined the WebGL2 stage frame, toolbar, HUD hierarchy, tabular telemetry and small-screen layout.
- Added focus-visible styling and reduced-motion-safe transitions.

## Compatibility

- No change to A* navigation, movement rules, world seed, terrain generation, NPC simulation or server sync.
- Canvas 2D fallback remains unchanged.
- World synchronization remains opt-in and disabled by default.
- No D1 migration, Worker deployment, PR merge or production deployment was performed.

## Validation

Automated CI must confirm TypeScript, Vite build and Vitest after this increment. No hardware GPU benchmark or screenshot/pixel regression is claimed.
