import { describe, expect, it } from 'vitest';
import { geometryFingerprint } from './worldRegression';

describe('world geometry regression signatures', () => {
  it('produces a stable quantized signature for a known vertex fixture', () => {
    expect(geometryFingerprint(new Float32Array([0, 1, -1, 0.5, 2.25]))).toBe('4c344342');
  });

  it('ignores sub-quantization noise but detects meaningful geometry changes', () => {
    const base = new Float32Array([1, 2, 3, 0.2, 0.4, 0.6]);
    const tinyNoise = new Float32Array([1.000001, 2, 3, 0.2, 0.4, 0.6]);
    const changed = new Float32Array([1.001, 2, 3, 0.2, 0.4, 0.6]);
    expect(geometryFingerprint(tinyNoise)).toBe(geometryFingerprint(base));
    expect(geometryFingerprint(changed)).not.toBe(geometryFingerprint(base));
  });

  it('rejects non-finite vertex values', () => {
    expect(() => geometryFingerprint(new Float32Array([0, Number.NaN]))).toThrow(RangeError);
  });
});
