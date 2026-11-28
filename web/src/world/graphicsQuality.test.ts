import { describe, expect, it } from 'vitest';
import { adaptiveLodQuality, adaptiveRenderScale, graphicsQualityLabel } from './graphicsQuality';

describe('adaptive graphics budget', () => {
  it('keeps requested resolution below the profile cap', () => {
    expect(adaptiveRenderScale('performance', 10)).toBe(1);
    expect(adaptiveRenderScale('balanced', 10)).toBe(1.35);
    expect(adaptiveRenderScale('quality', 10)).toBe(1.75);
  });

  it('reduces render scale when frame-time p95 rises', () => {
    expect(adaptiveRenderScale('quality', 22)).toBe(0.9);
    expect(adaptiveRenderScale('quality', 30)).toBe(0.75);
    expect(adaptiveRenderScale('performance', 30)).toBe(0.75);
  });

  it('reduces geometry detail under sustained frame-time pressure', () => {
    expect(adaptiveLodQuality('quality', 12)).toBe('quality');
    expect(adaptiveLodQuality('quality', 22)).toBe('balanced');
    expect(adaptiveLodQuality('balanced', 30)).toBe('performance');
    expect(adaptiveLodQuality('performance', 12)).toBe('performance');
  });

  it('provides stable French HUD labels and rejects invalid measurements', () => {
    expect(graphicsQualityLabel('balanced')).toBe('équilibré');
    expect(() => adaptiveRenderScale('quality', Number.NaN)).toThrow(RangeError);
    expect(() => adaptiveLodQuality('balanced', -1)).toThrow(RangeError);
  });
});
