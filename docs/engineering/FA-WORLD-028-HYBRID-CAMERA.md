# FA-WORLD-028 — Hybrid isometric / third-person camera

Status: implemented and CI validated
Parent: FA-WORLD-023 camera contract
Renderer: shared WebGL2 world scene; logical world coordinates remain authoritative.

## 1. Camera modes

### Isometric
- Orthographic projection.
- Fixed world overview target at the sector center.
- Existing azimuth rotation, zoom, tile picking and world rendering retained.
- Default mode on initial load and reset.

### Third person
- Perspective projection with 60-degree vertical field of view.
- Camera follows the authoritative player tile center and terrain elevation.
- Target is offset 1.15 world units above the player tile's ground plane.
- Camera distance is 10.5 world units multiplied by the existing zoom control.
- Camera elevation is 0.34 radians; near/far planes are 0.05 / 240.
- Same scene buffers, player state, terrain, NPCs and POIs; no actor teleport or world-state conversion.

## 2. Projection and picking

- The camera builder supports orthographic and perspective OpenGL projection matrices.
- World-to-screen projection uses the view-projection matrix and perspective divide.
- Screen-to-elevation picking constructs the correct perspective ray or orthographic parallel ray, then intersects the requested horizontal plane.
- Invalid field of view, degenerate viewport and invalid clipping planes are rejected.
- Points behind the perspective camera are reported as non-projectable (NaN screen coordinates).

## 3. User interface

- Added a 3P / ISO toggle to the existing camera toolbar.
- Existing zoom and azimuth rotation controls remain active in both modes.
- Reset returns to isometric mode, default azimuth and unit zoom.
- HUD identifies the current projection mode.

## 4. Validation

- Camera tests cover orthographic behavior, perspective target centering and perspective ray round-trip to elevation planes.
- GitHub Actions Web build run 442 on commit `624951a351260042ace741e70753f5b0ee2099a6`.
- 22 test files passed; 156 tests passed.
- TypeScript project build and Vite production build passed.
- FA-WORLD-027B road/cliff/bridge geometry passed separately: 22 files, 154 tests, TypeScript and Vite build.
- Hostinger FTP upload is skipped for pull-request events; no production deployment is claimed.

## 5. Deferred camera improvements

- Collision-aware camera boom and occlusion avoidance.
- Camera interpolation / damping and shoulder offset.
- Third-person mouse/touch look controller and input sensitivity settings.
- Adaptive FOV and device-specific camera quality.
- True third-person character animation blending and interaction targeting validation.
