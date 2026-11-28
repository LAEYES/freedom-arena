import type { TileCoordinate } from './coordinates';
import { getTerrainTile, type TerrainMap } from './terrain';

export type NpcPerceptionOptions = {
  radius: number;
  halfAngleDegrees?: number;
};

/** Grid ray test: intermediate cells must be walkable; endpoints are excluded. */
export function hasTerrainLineOfSight(
  map: TerrainMap,
  origin: TileCoordinate,
  target: TileCoordinate,
): boolean {
  let x = origin.i;
  let y = origin.j;
  const dx = Math.abs(target.i - origin.i);
  const dy = Math.abs(target.j - origin.j);
  const sx = origin.i < target.i ? 1 : -1;
  const sy = origin.j < target.j ? 1 : -1;
  let error = dx - dy;

  while (!(x === target.i && y === target.j)) {
    const twiceError = 2 * error;
    if (twiceError > -dy) { error -= dy; x += sx; }
    if (twiceError < dx) { error += dx; y += sy; }
    if (x === target.i && y === target.j) return true;
    const tile = getTerrainTile(map, x, y);
    if (!tile?.walkable) return false;
  }
  return true;
}

/** Directional field-of-view check using a normalized dot product. */
export function canNpcPerceivePlayer(
  map: TerrainMap,
  origin: TileCoordinate,
  facing: Pick<TileCoordinate, 'i' | 'j'>,
  target: TileCoordinate,
  options: NpcPerceptionOptions,
): boolean {
  const dx = target.i - origin.i;
  const dy = target.j - origin.j;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared === 0 || distanceSquared > options.radius * options.radius) return false;

  const facingLength = Math.hypot(facing.i, facing.j);
  if (facingLength === 0) return false;
  const targetLength = Math.sqrt(distanceSquared);
  const cosine = (facing.i * dx + facing.j * dy) / (facingLength * targetLength);
  const halfAngle = Math.max(1, Math.min(179, options.halfAngleDegrees ?? 60)) * Math.PI / 180;
  if (cosine < Math.cos(halfAngle)) return false;
  return hasTerrainLineOfSight(map, origin, target);
}
