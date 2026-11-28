import { describe, expect, it } from 'vitest';
import { findTerrainPath, canStep, calculateTerrainPathCost, isTileBlocked, resolveMovementStep } from './navigation';
import type { TerrainMap, TerrainTile } from './terrain';

function makeMap(width = 7, height = 7): TerrainMap {
  const tiles: TerrainTile[] = [];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      tiles.push({ i, j, kind: 'grass', elevation: 0, walkable: true, movementCost: 1 });
    }
  }
  return { width, height, seed: 1, tiles };
}

function setBlocked(map: TerrainMap, i: number, j: number, kind: 'water' | 'rock' = 'rock') {
  const tile = map.tiles[j * map.width + i];
  map.tiles[j * map.width + i] = { ...tile, kind, walkable: false, movementCost: Infinity };
}

describe('terrain navigation and collision', () => {
  it('finds a shortest path on open ground using diagonal movement', () => {
    const map = makeMap();
    const path = findTerrainPath(map, { i: 0, j: 0 }, { i: 6, j: 6 });
    expect(path[0]).toMatchObject({ i: 0, j: 0 });
    expect(path[path.length - 1]).toMatchObject({ i: 6, j: 6 });
    expect(path).toHaveLength(7);
    expect(calculateTerrainPathCost(map, path)).toBeCloseTo(6 * Math.SQRT2, 10);
  });

  it('routes around water and rock obstacles', () => {
    const map = makeMap();
    for (let j = 0; j < 6; j++) setBlocked(map, 3, j, j % 2 ? 'rock' : 'water');
    const path = findTerrainPath(map, { i: 1, j: 2 }, { i: 5, j: 2 }, { allowDiagonal: false });
    expect(path.length).toBeGreaterThan(0);
    expect(path.every(point => !(point.i === 3 && point.j < 6))).toBe(true);
  });

  it('crosses only explicit bridge links and charges bridge movement cost', () => {
    const map = makeMap(3, 1);
    setBlocked(map, 1, 0, 'water');
    const bridgeTiles = new Set(['1:0']);
    expect(findTerrainPath(map, { i: 0, j: 0 }, { i: 2, j: 0 }, { allowDiagonal: false })).toEqual([]);
    const path = findTerrainPath(map, { i: 0, j: 0 }, { i: 2, j: 0 }, {
      allowDiagonal: false,
      bridgeTiles,
    });
    expect(path.map(point => point.i + ':' + point.j)).toEqual(['0:0', '1:0', '2:0']);
    expect(calculateTerrainPathCost(map, path, bridgeTiles)).toBeCloseTo(3.25, 10);
    expect(canStep(map, { i: 0, j: 0 }, { i: 1, j: 0 }, new Set(), bridgeTiles)).toBe(true);
    expect(resolveMovementStep(map, { i: 0, j: 0 }, { i: 1, j: 0 }, new Set(), bridgeTiles))
      .toMatchObject({ i: 1, j: 0 });
  });

  it('does not allow diagonal corner cutting', () => {
    const map = makeMap(3, 3);
    setBlocked(map, 1, 0);
    setBlocked(map, 0, 1);
    expect(canStep(map, { i: 0, j: 0 }, { i: 1, j: 1 })).toBe(false);
    expect(findTerrainPath(map, { i: 0, j: 0 }, { i: 1, j: 1 })).toEqual([]);
  });

  it('rejects blocked destinations and dynamic occupied tiles', () => {
    const map = makeMap();
    setBlocked(map, 2, 2, 'water');
    expect(isTileBlocked(map, 2, 2)).toBe(true);
    expect(findTerrainPath(map, { i: 1, j: 1 }, { i: 2, j: 2 })).toEqual([]);
    const dynamic = new Set(['3:3']);
    expect(isTileBlocked(map, 3, 3, dynamic)).toBe(true);
    expect(findTerrainPath(map, { i: 1, j: 1 }, { i: 5, j: 5 }, { blockedTiles: dynamic }).some(p => p.i === 3 && p.j === 3)).toBe(false);
  });

  it('resolves only adjacent legal movement steps', () => {
    const map = makeMap();
    expect(resolveMovementStep(map, { i: 1, j: 1 }, { i: 2, j: 1 })).toMatchObject({ i: 2, j: 1 });
    expect(resolveMovementStep(map, { i: 1, j: 1 }, { i: 4, j: 4 })).toBeNull();
    setBlocked(map, 2, 1);
    expect(resolveMovementStep(map, { i: 1, j: 1 }, { i: 2, j: 1 })).toBeNull();
  });

  it('returns the start cell for a zero-distance path', () => {
    const map = makeMap();
    expect(findTerrainPath(map, { i: 2, j: 2 }, { i: 2, j: 2 })).toHaveLength(1);
  });

  it('returns no path when the target is unreachable', () => {
    const map = makeMap(5, 5);
    for (let j = 0; j < 5; j++) setBlocked(map, 2, j);
    expect(findTerrainPath(map, { i: 0, j: 2 }, { i: 4, j: 2 })).toEqual([]);
  });

  it('rejects invalid step and search limits', () => {
    const map = makeMap();
    expect(canStep(map, { i: 1, j: 1 }, { i: 3, j: 1 })).toBe(false);
    expect(() => findTerrainPath(map, { i: 0, j: 0 }, { i: 2, j: 2 }, { maxExpandedNodes: 0 })).toThrow(RangeError);
  });

  it('returns infinite cost for a discontinuous path', () => {
    const map = makeMap();
    expect(calculateTerrainPathCost(map, [{ i: 0, j: 0 }, { i: 3, j: 3 }])).toBe(Infinity);
  });
});
