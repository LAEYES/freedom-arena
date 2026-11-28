import type { TerrainKind, TerrainMap, TerrainTile } from './terrain';

export type TerrainSpawn = { i: number; j: number; safeRadius?: number };

export type TerrainAuditOptions = {
  spawn?: TerrainSpawn;
  requireAllWalkableReachable?: boolean;
};

export type TerrainAuditIssueCode =
  | 'invalid-dimensions'
  | 'tile-count-mismatch'
  | 'tile-index-mismatch'
  | 'invalid-terrain-kind'
  | 'invalid-elevation'
  | 'invalid-movement-rule'
  | 'spawn-out-of-bounds'
  | 'spawn-not-walkable'
  | 'spawn-safety-violation'
  | 'unreachable-walkable-tiles';

export type TerrainAuditIssue = {
  code: TerrainAuditIssueCode;
  message: string;
  tileIndex?: number;
};

export type TerrainAuditReport = {
  valid: boolean;
  dimensions: { width: number; height: number };
  expectedTileCount: number;
  actualTileCount: number;
  walkableTiles: number;
  walkableRatio: number;
  reachableWalkableTiles: number;
  unreachableWalkableTiles: number;
  terrainCounts: Record<TerrainKind, number>;
  issues: TerrainAuditIssue[];
};

const TERRAIN_KINDS = new Set<TerrainKind>(['grass', 'forest', 'water', 'rock', 'sand', 'snow']);

function isInside(map: TerrainMap, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < map.width && j < map.height;
}

function collectReachableTiles(map: TerrainMap, startIndex: number): Set<number> {
  const reached = new Set<number>();
  if (!map.tiles[startIndex]?.walkable) return reached;

  const queue = [startIndex];
  reached.add(startIndex);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const i = index % map.width;
    const j = Math.floor(index / map.width);
    const neighbors = [
      [i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1],
    ];
    for (const [nextI, nextJ] of neighbors) {
      if (!isInside(map, nextI, nextJ)) continue;
      const nextIndex = nextJ * map.width + nextI;
      if (reached.has(nextIndex) || !map.tiles[nextIndex]?.walkable) continue;
      reached.add(nextIndex);
      queue.push(nextIndex);
    }
  }
  return reached;
}

/**
 * Audits generated terrain before rendering or publishing it.
 * Connectivity is measured with cardinal movement, matching the conservative
 * navigation contract; diagonal corner-cutting is intentionally excluded.
 */
export function auditTerrainMap(
  map: TerrainMap,
  options: TerrainAuditOptions = {},
): TerrainAuditReport {
  const issues: TerrainAuditIssue[] = [];
  const widthValid = Number.isInteger(map.width) && map.width > 0;
  const heightValid = Number.isInteger(map.height) && map.height > 0;
  const expectedTileCount = widthValid && heightValid ? map.width * map.height : 0;
  const terrainCounts: Record<TerrainKind, number> = {
    grass: 0, forest: 0, water: 0, rock: 0, sand: 0, snow: 0,
  };

  if (!widthValid || !heightValid) {
    issues.push({ code: 'invalid-dimensions', message: 'Map width and height must be positive integers.' });
  }
  if (map.tiles.length !== expectedTileCount) {
    issues.push({
      code: 'tile-count-mismatch',
      message: 'Expected ' + expectedTileCount + ' tiles but received ' + map.tiles.length + '.',
    });
  }

  let walkableTiles = 0;
  for (let index = 0; index < map.tiles.length; index++) {
    const tile = map.tiles[index] as TerrainTile | undefined;
    if (!tile) {
      issues.push({ code: 'tile-index-mismatch', message: 'Missing tile at row-major index ' + index + '.', tileIndex: index });
      continue;
    }
    const expectedI = index % Math.max(1, map.width);
    const expectedJ = Math.floor(index / Math.max(1, map.width));
    if (tile.i !== expectedI || tile.j !== expectedJ) {
      issues.push({ code: 'tile-index-mismatch', message: 'Tile coordinates do not match row-major index ' + index + '.', tileIndex: index });
    }
    if (!TERRAIN_KINDS.has(tile.kind)) {
      issues.push({ code: 'invalid-terrain-kind', message: 'Unknown terrain kind at index ' + index + '.', tileIndex: index });
    } else {
      terrainCounts[tile.kind]++;
    }
    if (!Number.isFinite(tile.elevation) || tile.elevation < 0) {
      issues.push({ code: 'invalid-elevation', message: 'Elevation must be finite and non-negative.', tileIndex: index });
    }
    if (tile.walkable) {
      walkableTiles++;
      if (!Number.isFinite(tile.movementCost) || tile.movementCost <= 0) {
        issues.push({ code: 'invalid-movement-rule', message: 'Walkable tiles require a finite positive movement cost.', tileIndex: index });
      }
    } else if (tile.movementCost !== Infinity) {
      issues.push({ code: 'invalid-movement-rule', message: 'Blocked tiles must have infinite movement cost.', tileIndex: index });
    }
  }

  let reachableWalkableTiles = 0;
  let unreachableWalkableTiles = 0;
  const spawn = options.spawn;
  if (spawn && widthValid && heightValid && map.tiles.length === expectedTileCount) {
    const radius = spawn.safeRadius ?? 0;
    if (!Number.isInteger(spawn.i) || !Number.isInteger(spawn.j)
      || !Number.isInteger(radius) || radius < 0 || !isInside(map, spawn.i, spawn.j)) {
      issues.push({ code: 'spawn-out-of-bounds', message: 'Spawn coordinates and safe radius must be valid and inside the map.' });
    } else {
      const spawnIndex = spawn.j * map.width + spawn.i;
      if (!map.tiles[spawnIndex]?.walkable) {
        issues.push({ code: 'spawn-not-walkable', message: 'Spawn tile must be walkable.', tileIndex: spawnIndex });
      } else {
        const reached = collectReachableTiles(map, spawnIndex);
        reachableWalkableTiles = reached.size;
        unreachableWalkableTiles = walkableTiles - reachableWalkableTiles;
      }
      for (let j = Math.max(0, spawn.j - radius); j <= Math.min(map.height - 1, spawn.j + radius); j++) {
        for (let i = Math.max(0, spawn.i - radius); i <= Math.min(map.width - 1, spawn.i + radius); i++) {
          if (Math.hypot(i - spawn.i, j - spawn.j) > radius) continue;
          const index = j * map.width + i;
          if (!map.tiles[index]?.walkable) {
            issues.push({ code: 'spawn-safety-violation', message: 'Blocked terrain occurs inside the spawn safety radius.', tileIndex: index });
          }
        }
      }
    }
  }

  if (options.requireAllWalkableReachable && unreachableWalkableTiles > 0) {
    issues.push({
      code: 'unreachable-walkable-tiles',
      message: unreachableWalkableTiles + ' walkable tiles are disconnected from the spawn region.',
    });
  }

  return {
    valid: issues.length === 0,
    dimensions: { width: map.width, height: map.height },
    expectedTileCount,
    actualTileCount: map.tiles.length,
    walkableTiles,
    walkableRatio: expectedTileCount > 0 ? walkableTiles / expectedTileCount : 0,
    reachableWalkableTiles,
    unreachableWalkableTiles,
    terrainCounts,
    issues,
  };
}
