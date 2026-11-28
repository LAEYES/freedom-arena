import { describe, expect, it } from 'vitest';
import { AdaptiveWorldLod } from './adaptiveWorldLod';

describe('adaptive per-chunk LOD', () => {
  it('uses the existing deterministic distance tiers on first observation', () => {
    const lod = new AdaptiveWorldLod();
    expect(lod.update('0:0', 10)).toBe('high');
    expect(lod.update('1:0', 20)).toBe('medium');
    expect(lod.update('2:0', 40)).toBe('low');
  });

  it('applies hysteresis when moving away from and back toward a chunk', () => {
    const lod = new AdaptiveWorldLod(0.1);
    expect(lod.update('0:0', 13.9)).toBe('high');
    expect(lod.update('0:0', 14.5)).toBe('high');
    expect(lod.update('0:0', 15.5)).toBe('medium');
    expect(lod.update('0:0', 13.0)).toBe('medium');
    expect(lod.update('0:0', 12.5)).toBe('high');
  });

  it('uses quality-specific thresholds and resets stale profile state', () => {
    const lod = new AdaptiveWorldLod();
    expect(lod.update('chunk', 18, 'quality')).toBe('high');
    expect(lod.update('chunk', 18, 'performance')).toBe('medium');
  });

  it('bounds retained state and supports clearing', () => {
    const lod = new AdaptiveWorldLod();
    lod.update('a', 1);
    lod.update('b', 1);
    lod.update('c', 1);
    lod.retain(['a', 'c']);
    expect(lod.getTrackedCount()).toBe(2);
    lod.clear();
    expect(lod.getTrackedCount()).toBe(0);
  });

  it('rejects invalid hysteresis, keys and distances', () => {
    expect(() => new AdaptiveWorldLod(-0.1)).toThrow(RangeError);
    expect(() => new AdaptiveWorldLod(0.5)).toThrow(RangeError);
    const lod = new AdaptiveWorldLod();
    expect(() => lod.update('', 1)).toThrow(RangeError);
    expect(() => lod.update('x', Number.NaN)).toThrow(RangeError);
  });
});
