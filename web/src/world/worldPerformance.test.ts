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
