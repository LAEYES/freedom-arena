import { describe, expect, it } from 'vitest';
import { selectWorldLod } from './worldLod';

describe('distance-based world LOD', () => {
  it('selects high, medium and low tiers at stable world-distance thresholds', () => {
    expect(selectWorldLod(0)).toBe('high');
    expect(selectWorldLod(14)).toBe('high');
    expect(selectWorldLod(14.001)).toBe('medium');
    expect(selectWorldLod(30)).toBe('medium');
    expect(selectWorldLod(30.001)).toBe('low');
    expect(selectWorldLod(100)).toBe('low');
  });

  it('rejects negative and non-finite distances', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => selectWorldLod(value)).toThrow(RangeError);
    }
  });
});
