import type { GraphicsQuality } from './graphicsQuality';

/** Maximum NPC mesh distance in world tiles; simulation remains unaffected. */
export function getNpcRenderDistance(quality: GraphicsQuality): number {
  return quality === 'performance' ? 18 : quality === 'quality' ? 42 : 30;
}

/** Squared-distance test avoids a square root in the per-NPC render loop. */
export function shouldRenderNpc(
  position: { x: number; y: number },
  reference: { i: number; j: number },
  maxDistance: number,
): boolean {
  if (![position.x, position.y, reference.i, reference.j, maxDistance].every(Number.isFinite) || maxDistance < 0) {
    throw new RangeError('NPC render coordinates and distance must be finite; distance must be non-negative');
  }
  const dx = position.x - (reference.i + 0.5);
  const dy = position.y - (reference.j + 0.5);
  return dx * dx + dy * dy <= maxDistance * maxDistance;
}
