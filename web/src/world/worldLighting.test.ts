import { describe, expect, it } from 'vitest';
import { resolveWorldLighting } from './worldLighting';

describe('resolveWorldLighting', () => {
  it('returns stable normalized lighting values for identical environment inputs', () => {
    expect(resolveWorldLighting('night', 'storm')).toEqual(resolveWorldLighting('night', 'storm'));
  });

  it('keeps night lighting cooler and less intense than daylight', () => {
    const night = resolveWorldLighting('night', 'clear');
    const day = resolveWorldLighting('day', 'clear');
    expect(night.tint[2]).toBeGreaterThan(night.tint[0]);
    expect(night.ambient + night.direct).toBeLessThan(day.ambient + day.direct);
  });

  it('attenuates direct and ambient light during storms and increases fog', () => {
    const clear = resolveWorldLighting('day', 'clear');
    const storm = resolveWorldLighting('day', 'storm');
    expect(storm.ambient + storm.direct).toBeLessThan(clear.ambient + clear.direct);
    expect(storm.fogAmount).toBeGreaterThan(clear.fogAmount);
  });

  it('keeps all shader controls in the normalized range', () => {
    for (const cycle of ['day', 'dawn', 'dusk', 'night']) {
      for (const weather of ['clear', 'mist', 'frost', 'storm']) {
        const profile = resolveWorldLighting(cycle, weather);
        expect([...profile.tint, ...profile.lightDirection, profile.ambient, profile.direct, profile.rim, ...profile.fogColor, profile.fogAmount].every(Number.isFinite)).toBe(true);
        expect(profile.ambient).toBeGreaterThanOrEqual(0);
        expect(profile.ambient).toBeLessThanOrEqual(1);
        expect(profile.direct).toBeGreaterThanOrEqual(0);
        expect(profile.direct).toBeLessThanOrEqual(1);
        expect(profile.fogAmount).toBeGreaterThanOrEqual(0);
        expect(profile.fogAmount).toBeLessThanOrEqual(1);
      }
    }
  });
});
