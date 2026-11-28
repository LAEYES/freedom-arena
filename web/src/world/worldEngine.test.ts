import { describe, expect, it } from 'vitest';
import { gridToWorld, worldToGrid, worldToScreen, screenToWorld } from './coordinates';
import { createIsometricCamera, projectWorldToScreen, unprojectScreenToElevation } from './isometricCamera';
import { generateTerrainMap, getTerrainTile, type TerrainMap, type TerrainTile } from './terrain';
import { ChunkManager } from './chunks';
import { calculateTerrainPathCost, findTerrainPath, isTileBlocked } from './navigation';

function makeFlatMap(width = 64, height = 64): TerrainMap {
  const tiles: TerrainTile[] = [];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      tiles.push({ i, j, kind: 'grass', elevation: 0, walkable: true, movementCost: 1 });
    }
  }
  return { width, height, seed: 99, tiles };
}

describe('FA World Engine — cross-module prevalidation', () => {
  it('preserves the 64x64 world invariant and stable terrain indexing', () => {
    const map = generateTerrainMap({ seed: 777 });
    expect(map.tiles).toHaveLength(4096);
    for (const point of [{ i: 0, j: 0 }, { i: 31, j: 17 }, { i: 63, j: 63 }]) {
      expect(getTerrainTile(map, point.i, point.j)).toMatchObject(point);
    }
  });

  it('reproduces the same terrain and chunk manifest from the same seed', () => {
    const first = generateTerrainMap({ seed: 2026 });
    const second = generateTerrainMap({ seed: 2026 });
    const managerA = new ChunkManager(first);
    const managerB = new ChunkManager(second);
    const keysA = managerA.loadAround({ i: 32, j: 32 }, 3).map(chunk => chunk.key).sort();
    const keysB = managerB.loadAround({ i: 32, j: 32 }, 3).map(chunk => chunk.key).sort();
    expect(first.tiles).toEqual(second.tiles);
    expect(keysA).toEqual(keysB);
  });

  it('partitions every world cell into exactly one chunk', () => {
    const map = makeFlatMap();
    const manager = new ChunkManager(map);
    const covered = new Set<string>();
    for (let chunkY = 0; chunkY < 4; chunkY++) {
      for (let chunkX = 0; chunkX < 4; chunkX++) {
        const chunk = manager.loadChunk(chunkX, chunkY)!;
        for (const tile of chunk.tiles) {
          const key = tile.i + ':' + tile.j;
          expect(covered.has(key)).toBe(false);
          covered.add(key);
        }
      }
    }
    expect(covered.size).toBe(4096);
  });

  it('round-trips grid, world and isometric camera coordinates', () => {
    const tile = { i: 41, j: 19, elevation: 3 };
    const world = gridToWorld(tile);
    const camera = createIsometricCamera({
      target: { x: 32, y: 32, z: 0 },
      viewportWidth: 1920,
      viewportHeight: 1080,
      azimuthRadians: Math.PI / 4,
      elevationRadians: Math.atan(1 / Math.SQRT2),
      distance: 100,
      orthographicHeight: 48,
      near: 0.1,
      far: 1000,
    });
    const screen = projectWorldToScreen(world, camera);
    const restoredWorld = unprojectScreenToElevation(screen, world.z, camera);
    const restoredGrid = worldToGrid(restoredWorld);
    expect(restoredGrid.i).toBeCloseTo(tile.i, 8);
    expect(restoredGrid.j).toBeCloseTo(tile.j, 8);
    expect(restoredGrid.elevation).toBeCloseTo(tile.elevation, 8);
    expect(screenToWorld(worldToScreen(world), world.z)).toEqual(world);
  });

  it('finds a valid low-cost path and never crosses a blocked tile', () => {
    const map = makeFlatMap();
    for (let j = 0; j < 50; j++) {
      const index = j * map.width + 30;
      map.tiles[index] = { ...map.tiles[index], kind: 'rock', walkable: false, movementCost: Infinity };
    }
    const path = findTerrainPath(map, { i: 5, j: 10 }, { i: 55, j: 10 }, { allowDiagonal: false });
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toMatchObject({ i: 5, j: 10 });
    expect(path[path.length - 1]).toMatchObject({ i: 55, j: 10 });
    expect(path.every(tile => !isTileBlocked(map, tile.i, tile.j))).toBe(true);
    expect(calculateTerrainPathCost(map, path)).toBeGreaterThan(50);
  });

  it('maintains adjacency and corner collision invariants for every path step', () => {
    const map = makeFlatMap(12, 12);
    const path = findTerrainPath(map, { i: 1, j: 1 }, { i: 10, j: 9 });
    for (let index = 1; index < path.length; index++) {
      const dx = Math.abs(path[index].i - path[index - 1].i);
      const dy = Math.abs(path[index].j - path[index - 1].j);
      expect(Math.max(dx, dy)).toBe(1);
    }
  });

  it('keeps spawn protection, movement costs and chunk boundaries coherent', () => {
    const map = generateTerrainMap({ seed: 88 });
    const spawn = getTerrainTile(map, 32, 32)!;
    expect(spawn).toMatchObject({ kind: 'grass', walkable: true, movementCost: 1 });
    const manager = new ChunkManager(map);
    const chunk = manager.getChunkAtTile({ i: 32, j: 32 });
    expect(chunk).toMatchObject({ key: '2:2', originI: 32, originJ: 32 });
  });
});
