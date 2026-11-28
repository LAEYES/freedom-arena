# FA-WORLD-037 — CPU/GPU profiling and adaptive render budget

Status: implemented on `feat/fa-world-engine-p0`; CI validation pending.
Scope: instrument the existing WebGL2 frame loop and adapt backing resolution only when a reliable GPU timer is available.

## Instrumentation
- Keep the bounded RAF frame-time monitor and expose FPS, mean and p95 frame time.
- Measure CPU frame-loop duration separately using the browser monotonic performance clock.
- Use `EXT_disjoint_timer_query_webgl2` when available; poll results asynchronously and ignore disjoint measurements.
- Bound outstanding GPU queries to three; delete consumed, invalidated and teardown queries.
- Report GPU timing as unavailable when the extension is not supported; do not infer GPU time from CPU timing.

## Adaptive quality
- GPU p95 above 18 ms for 1.8 s reduces backing resolution by 10%.
- GPU p95 below 11.5 ms for 7 s restores resolution by 5%.
- Resolution factor is clamped to 0.65–1.25 and physical backing DPR remains capped at 1.75.
- A hysteresis band prevents rapid quality oscillation. Adaptation is disabled without valid GPU timer samples.
- Logical world coordinates, simulation, navigation, chunk selection and gameplay are unaffected.

## Limits / validation
- Browser timer-query support varies; some mobile GPUs expose no usable timer.
- CPU time is JavaScript frame-loop duration, not a complete browser main-thread profile.
- No device-specific FPS guarantee or cross-platform benchmark result is claimed.
- Automated tests cover scale thresholds, hysteresis, bounds and invalid inputs; physical-device profiling remains a manual acceptance step.
