# FA-WORLD-030 — Visual regression and performance telemetry

Status: implemented and CI validated

## 1. Runtime frame-time telemetry

- Added `FrameTimeMonitor`, a bounded rolling sample monitor (default 120 frames).
- Computes mean, median, p95 and p99 frame time plus derived mean FPS.
- Rejects non-finite and non-positive samples.
- Renderer HUD updates approximately once per second and reports rounded FPS and mean frame time in milliseconds.
- The monitor does not assume or claim a target device's performance. Values are measured only while the WebGL2 scene is running in a real browser/device.

## 2. Geometry regression signatures

- Added `geometryFingerprint(Float32Array)`.
- Quantizes each XYZ/RGB float channel to 1e-5, hashes the four bytes of each quantized value using FNV-1a, and returns an eight-character hexadecimal signature.
- Rejects non-finite vertices.
- Unit fixtures cover a known signature, quantization stability, meaningful geometry changes and invalid data.
- Terrain and landmark mesh tests compare deterministic signatures across repeated generation.

This is a geometry-data regression check, not a screenshot/pixel-level browser visual test. Screenshot-based visual regression remains deferred until a deterministic browser harness and reference render environment are configured.

## 3. Benchmark protocol

For any performance report, record:
- device CPU, GPU, driver and browser version;
- OS, viewport dimensions, device pixel ratio and quality settings;
- world seed, camera mode, player tile and visible chunk count;
- actor/POI count and weather/day-night state;
- warm-up duration and sample duration;
- mean, median, p95 and p99 frame time, derived FPS;
- GPU memory / buffer bytes when available through a supported profiling path.

Recommended minimum: 30 seconds warm-up + 120 seconds capture, repeated three times on the same scene seed. Compare distributions, not a single peak FPS.

## 4. Delivered files

- `web/src/world/worldPerformance.ts`
- `web/src/world/worldPerformance.test.ts`
- `web/src/world/worldRegression.ts`
- `web/src/world/worldRegression.test.ts`
- `web/src/world/World3DCanvas.tsx`
- `web/src/world/worldRenderer.test.ts`

## 5. CI validation

- GitHub Actions Web build run 468 on commit `a6c640330eec24b989a7f5046c1b986f76869037` passed.
- 24 test files passed; 165 tests passed.
- TypeScript project build and Vite production build passed.
- Hostinger workflow build passed; FTP upload was skipped because the event was a pull request.

## 6. Limits

- No real-device benchmark has been executed in CI.
- No measured FPS target is claimed.
- Pixel-perfect screenshot comparison is not implemented.
- GPU timer queries and GPU-memory telemetry are not yet implemented.
- Current runtime HUD FPS is an average derived from rolling RAF frame deltas, not a GPU-only frame-time measurement.

## 7. Next

FA-WORLD-031: move vegetation, landmarks and roads into chunk-local static buffers; add instancing and LOD tiers; profile geometry and GPU buffer sizes.
