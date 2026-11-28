import { describe, expect, it } from 'vitest';
import { generateTerrainMap, type TerrainMap, type TerrainTile } from './terrain';
import { auditTerrainMap } from './terrainAudit';

function flatMap(width = 8, height = 8): TerrainMap {
  const tiles: TerrainTile[] = [];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      tiles.push({ i, j, kind: 'grass', elevation: 0, walkable: true, movementCost: 1 });
    }
  }
  return { width, height, seed: 1, tiles };
}

describe('terrain generation qualification', () => {
  it('accepts a complete, row-major, connected terrain map', () => {
    const report = auditTerrainMap(flatMap(), { spawn: { i: 4, j: 4, safeRadius: 2 }, requireAllWalkableReachable: true });
    expect(report.valid).toBe(true);
    expect(report.expectedTileCount).toBe(64);
    expect(report.walkableRatio).toBe(1);
    expect(report.reachableWalkableTiles).toBe(64);
    expect(report.issues).toEqual([]);
  });

  it('qualifies the deterministic default 64 by 64 generator output', () => {
    const map = generateTerrainMap();
    const report = auditTerrainMap(map, {
      spawn: { i: 32, j: 32, safeRadius: 4 },
    });
    expect(report.valid).toBe(true);
    expect(report.actualTileCount).toBe(4096);
    expect(report.terrainCounts.grass).toBeGreaterThan(0);
    expect(report.walkableRatio).toBeGreaterThan(0);
  });

  it('detects missing tiles and row-major coordinate corruption', () => {
    const map = flatMap();
    map.tiles.pop();
    map.tiles[0] = { ...map.tiles[0], i: 7 };
    const report = auditTerrainMap(map);
    expect(report.issues.map(issue => issue.code)).toContain('tile-count-mismatch');
    expect(report.issues.map(issue => issue.code)).toContain('tile-index-mismatch');
  });

  it('detects invalid movement costs and elevations', () => {
    const map = flatMap();
    map.tiles[3] = { ...map.tiles[3], movementCost: Infinity, elevation: Number.NaN };
    const report = auditTerrainMap(map);
    expect(report.issues.map(issue => issue.code)).toContain('invalid-movement-rule');
    expect(report.issues.map(issue => issue.code)).toContain('invalid-elevation');
  });

  it('detects blocked cells inside the spawn safety radius', () => {
    const map = flatMap();
    map.tiles[4 * map.width + 5] = {
      ...map.tiles[4 * map.width + 5], kind: 'rock', walkable: false, movementCost: Infinity,
    };
    const report = auditTerrainMap(map, { spawn: { i: 4, j: 4, safeRadius: 2 } });
    expect(report.issues.map(issue => issue.code)).toContain('spawn-safety-violation');
  });

  it('reports disconnected walkable regions without rejecting intentional islands by default', () => {
    const map = flatMap();
    for (let j = 0; j < map.height; j++) {
      map.tiles[j * map.width + 3] = {
        ...map.tiles[j * map.width + 3], kind: 'water', walkable: false, movementCost: Infinity,
      };
    }
    const report = auditTerrainMap(map, { spawn: { i: 1, j: 1 } });
    expect(report.unreachableWalkableTiles).toBeGreaterThan(0);
    expect(report.valid).toBe(true);
    expect(auditTerrainMap(map, {
      spawn: { i: 1, j: 1 },
      requireAllWalkableReachable: true,
    }).issues.map(issue => issue.code)).toContain('unreachable-walkable-tiles');
  });

  it('rejects invalid dimensions and spawn coordinates', () => {
    const map = { ...flatMap(), width: 0 };
    const report = auditTerrainMap(map, { spawn: { i: 0, j: 0 } });
    expect(report.issues.map(issue => issue.code)).toContain('invalid-dimensions');
    expect(report.issues.map(issue => issue.code)).toContain('tile-count-mismatch');
  });
});
