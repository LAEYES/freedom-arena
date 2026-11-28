/** Merge compatible position+RGB triangle streams (6 Float32 values per vertex). */
export function mergeWorldMeshes(parts: readonly Float32Array[]): Float32Array {
  let totalLength = 0;
  for (const part of parts) {
    if (part.length % 6 !== 0) throw new RangeError('World mesh data must contain complete 6-float vertices');
    totalLength += part.length;
  }
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}
