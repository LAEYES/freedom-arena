import { describe, expect, it } from 'vitest';
import { FrameTimeMonitor } from './worldPerformance';

describe('bounded frame-time telemetry', () => {
  it('summarizes mean, median, p95, p99 and derived FPS', () => {
    const monitor = new FrameTimeMonitor(8);
    [10, 20, 30, 40, 50].forEach(value => monitor.add(value));
    expect(monitor.summary()).toEqual({
      samples: 5,
      meanMs: 30,
      medianMs: 30,
      p95Ms: 50,
      p99Ms: 50,
      fps: 1000 / 30,
    });
  });

  it('keeps only the most recent samples within its fixed capacity', () => {
    const monitor = new FrameTimeMonitor(3);
    [10, 20, 30, 40].forEach(value => monitor.add(value));
    expect(monitor.summary()).toMatchObject({
      samples: 3,
      meanMs: 30,
      medianMs: 30,
      p95Ms: 40,
      p99Ms: 40,
    });
  });

  it('returns a zero summary before the first sample and after reset', () => {
    const monitor = new FrameTimeMonitor();
    expect(monitor.summary()).toMatchObject({ samples: 0, fps: 0, meanMs: 0 });
    monitor.add(16.67);
    monitor.reset();
    expect(monitor.summary()).toMatchObject({ samples: 0, fps: 0, meanMs: 0 });
  });

  it('rejects invalid capacity and frame-time samples', () => {
    expect(() => new FrameTimeMonitor(0)).toThrow(RangeError);
    const monitor = new FrameTimeMonitor();
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => monitor.add(invalid)).toThrow(RangeError);
    }
  });
});


describe('adaptive render scale', () => {
  it('reduces resolution only after sustained GPU overload', () => {
    const scale = new AdaptiveRenderScale();
    expect(scale.update(22, 900)).toBe(1);
    expect(scale.update(22, 950)).toBe(0.9);
  });

  it('recovers gradually after sustained GPU headroom', () => {
    const scale = new AdaptiveRenderScale({ initial: 0.85 });
    expect(scale.update(8, 4000)).toBe(0.85);
    expect(scale.update(8, 3000)).toBe(0.9);
  });

  it('does not oscillate inside the hysteresis band', () => {
    const scale = new AdaptiveRenderScale();
    scale.update(20, 900);
    expect(scale.update(15, 5000)).toBe(1);
    expect(scale.update(20, 900)).toBe(1);
  });

  it('clamps at configured bounds and rejects invalid samples', () => {
    const scale = new AdaptiveRenderScale({ initial: 0.7, minimum: 0.7, maximum: 0.8 });
    expect(scale.update(30, 5000)).toBe(0.7);
    expect(scale.update(5, 30000)).toBe(0.75);
    expect(() => scale.update(Number.NaN, 16)).toThrow(RangeError);
    expect(() => new AdaptiveRenderScale({ minimum: 2, maximum: 1 })).toThrow(RangeError);
  });
});
