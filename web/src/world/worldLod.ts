export type WorldLodLevel = 'high' | 'medium' | 'low';

/** Selects a deterministic detail tier from horizontal world-space distance. */
export function selectWorldLod(distanceWorldUnits: number, quality: 'performance' | 'balanced' | 'quality' = 'balanced'): WorldLodLevel {
  if (!Number.isFinite(distanceWorldUnits) || distanceWorldUnits < 0) {
    throw new RangeError('distanceWorldUnits must be finite and non-negative');
  }
  const thresholds = quality === 'performance' ? [8, 20] : quality === 'quality' ? [20, 42] : [14, 30];
  if (distanceWorldUnits <= thresholds[0]) return 'high';
  if (distanceWorldUnits <= thresholds[1]) return 'medium';
  return 'low';
}
