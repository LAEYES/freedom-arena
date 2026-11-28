# FA-WORLD-036 — Stylized dynamic lighting and atmosphere

Status: implemented on `feat/fa-world-engine-p0`; pending CI validation.
Scope: low-cost shader lighting for terrain, chunk props, actors and instanced vegetation.

## Implementation
- Derive a deterministic lighting profile from the existing day/night cycle and weather state.
- Add flat-face diffuse response from screen-space derivatives of world position; this preserves the existing six-float vertex format (position + RGB) and avoids a mesh rebuild or extra vertex bandwidth.
- Add restrained rim response for silhouette separation, with a luminance response curve for stylized material readability.
- Apply the same key light, ambient intensity and rim controls to instanced vegetation.
- Weather attenuates direct and ambient light and selects fog color/density; dawn, day, dusk and night use distinct color temperatures.
- Reuse the existing WebGL2 programs and buffers. No extra draw calls, textures, render targets or per-frame geometry allocations are introduced.

## Limits
- This is stylized diffuse lighting, not a physically based metallic-roughness pipeline.
- No shadow map, screen-space ambient occlusion, volumetric fog or GPU timer-query benchmark is claimed.
- Lighting affects the WebGL2 path; the existing Canvas 2D fallback remains untouched.
- Shader compilation and runtime visual validation still require the CI/build and a real WebGL2 device.

## Acceptance checks
- Unit tests cover deterministic profiles, day/night contrast, storm attenuation and bounded controls.
- Existing WebGL2 and Canvas 2D paths remain intact.
- Build/test CI must pass before this lot is marked validated.
