import type { TileCoordinate } from './coordinates';
import { getTerrainTile, type TerrainMap } from './terrain';
import { tileKey } from './navigation';
import { hasTerrainLineOfSight } from './npcPerception';

export type NpcCoverCandidate = {
  position: TileCoordinate;
  cover: 'LIGHT' | 'HARD';
  exposure: number;
};

const CARDINAL = [
  { i: 0, j: -1 }, { i: 1, j: 0 }, { i: 0, j: 1 }, { i: -1, j: 0 },
];

/**
 * Finds walkable defensive positions. Forest cells provide light concealment;
 * walkable cells adjacent to rock provide hard terrain obstruction.
 */
export function findNpcCoverPositions(
  map: TerrainMap,
  origin: TileCoordinate,
  radius = 5,
  occupied: ReadonlySet<string> = new Set(),
): NpcCoverCandidate[] {
  const safeRadius = Number.isFinite(radius) ? Math.max(0, Math.min(12, radius)) : 5;
  const candidates: NpcCoverCandidate[] = [];
  for (let j = Math.max(0, origin.j - safeRadius); j <= Math.min(map.height - 1, origin.j + safeRadius); j++) {
    for (let i = Math.max(0, origin.i - safeRadius); i <= Math.min(map.width - 1, origin.i + safeRadius); i++) {
      const tile = getTerrainTile(map, i, j);
      if (!tile?.walkable || occupied.has(tileKey(i, j))) continue;
      const distance = Math.abs(i - origin.i) + Math.abs(j - origin.j);
      if (distance > safeRadius || distance === 0) continue;
      const hard = CARDINAL.some(direction =>
        getTerrainTile(map, i + direction.i, j + direction.j)?.kind === 'rock',
      );
      const light = tile.kind === 'forest';
      if (!hard && !light) continue;
      candidates.push({
        position: { i, j, elevation: tile.elevation },
        cover: hard ? 'HARD' : 'LIGHT',
        exposure: distance + (hard ? 0 : 2),
      });
    }
  }
  return candidates.sort((a, b) =>
    (a.cover === 'HARD' ? 0 : 1) - (b.cover === 'HARD' ? 0 : 1)
    || a.exposure - b.exposure
    || a.position.j - b.position.j
    || a.position.i - b.position.i,
  );
}

export type NpcDirectionalCoverCandidate = NpcCoverCandidate & {
  blocksThreatLineOfSight: boolean;
  threatDistance: number;
};

/**
 * Ranks terrain cover relative to a specific threat. A position is considered
 * directionally protected only when the terrain grid blocks the ray to the threat.
 * This is geometric LOS, not ballistic or projectile simulation.
 */
export function findNpcDirectionalCoverPositions(
  map: TerrainMap,
  origin: TileCoordinate,
  threat: TileCoordinate,
  radius = 8,
  occupied: ReadonlySet<string> = new Set(),
): NpcDirectionalCoverCandidate[] {
  return findNpcCoverPositions(map, origin, radius, occupied)
    .map(candidate => ({
      ...candidate,
      blocksThreatLineOfSight: !hasTerrainLineOfSight(map, candidate.position, threat),
      threatDistance: Math.abs(candidate.position.i - threat.i)
        + Math.abs(candidate.position.j - threat.j),
    }))
    .sort((a, b) =>
      Number(b.blocksThreatLineOfSight) - Number(a.blocksThreatLineOfSight)
      || (a.cover === 'HARD' ? 0 : 1) - (b.cover === 'HARD' ? 0 : 1)
      || a.exposure - b.exposure
      || b.threatDistance - a.threatDistance
      || a.position.j - b.position.j
      || a.position.i - b.position.i,
    );
}
