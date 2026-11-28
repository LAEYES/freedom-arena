export type WorldLodLevel = 'high' | 'medium' | 'low';

/** Selects a deterministic detail tier from horizontal world-space distance. */
export function selectWorldLod(distanceWorldUnits: number): WorldLodLevel {
  if (!Number.isFinite(distanceWorldUnits) || distanceWorldUnits < 0) {
    throw new RangeError('distanceWorldUnits must be finite and non-negative');
  }
  if (distanceWorldUnits <= 14) return 'high';
  if (distanceWorldUnits <= 30) return 'medium';
  return 'low';
}
