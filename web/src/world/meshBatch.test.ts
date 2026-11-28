import { describe, expect, it } from 'vitest';
import { mergeWorldMeshes } from './meshBatch';

describe('static world mesh batching', () => {
  it('merges vertex streams without changing vertex order or values', () => {
    const a = new Float32Array([0, 1, 2, 0.1, 0.2, 0.3]);
    const b = new Float32Array([3, 4, 5, 0.4, 0.5, 0.6, 6, 7, 8, 0.7, 0.8, 0.9]);
    expect(Array.from(mergeWorldMeshes([a, b]))).toEqual([...a, ...b]);
  });

  it('supports empty batches and rejects malformed vertices', () => {
    expect(mergeWorldMeshes([]).length).toBe(0);
    expect(mergeWorldMeshes([new Float32Array()]).length).toBe(0);
    expect(() => mergeWorldMeshes([new Float32Array([1, 2, 3])])).toThrow(RangeError);
  });
});
