/**
 * Stable geometry signature for deterministic visual-regression fixtures.
 * Coordinates and RGB channels are quantized to 1e-5 before hashing.
 */
export function geometryFingerprint(vertices: Float32Array): string {
  let hash = 2166136261;
  for (const vertex of vertices) {
    if (!Number.isFinite(vertex)) throw new RangeError('geometry vertices must be finite');
    const quantized = Math.round(vertex * 100000) >>> 0;
    for (const shift of [0, 8, 16, 24]) {
      hash ^= (quantized >>> shift) & 0xff;
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
