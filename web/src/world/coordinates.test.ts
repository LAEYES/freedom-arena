import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORLD_BOUNDS,
  DEFAULT_WORLD_GRID_CONFIG,
  gridToWorld,
  isTileInBounds,
  screenToWorld,
  worldToGrid,
  worldToScreen,
  worldToTile,
  type WorldGridConfig,
} from './coordinates';

describe('world coordinate system', () => {
  it('maps the origin and cardinal grid coordinates into world units', () => {
    expect(gridToWorld({ i: 0, j: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    expect(gridToWorld({ i: 1, j: 0 })).toEqual({ x: 1, y: 0, z: 0 });
    expect(gridToWorld({ i: 0, j: 1 })).toEqual({ x: 0, y: 1, z: 0 });
    expect(gridToWorld({ i: 12, j: 7, elevation: 3 })).toEqual({ x: 12, y: 7, z: 3 });
  });

  it('supports configurable non-unit cell dimensions', () => {
    const config: WorldGridConfig = {
      ...DEFAULT_WORLD_GRID_CONFIG,
      cellWidth: 2,
      cellDepth: 3,
      elevationUnit: 0.5,
    };
    expect(gridToWorld({ i: 4, j: 5, elevation: 2 }, config))
      .toEqual({ x: 8, y: 15, z: 1 });
  });

  it('round-trips world coordinates through grid coordinates', () => {
    const config: WorldGridConfig = {
      ...DEFAULT_WORLD_GRID_CONFIG,
      cellWidth: 1.25,
      cellDepth: 0.75,
      elevationUnit: 0.5,
    };
    const world = { x: 18.75, y: 9, z: 2 };
    const grid = worldToGrid(world, config);
    expect(grid.i).toBeCloseTo(15, 12);
    expect(grid.j).toBeCloseTo(12, 12);
    expect(grid.elevation).toBeCloseTo(4, 12);
  });

  it('projects and unprojects isometric positions including elevation', () => {
    const world = { x: 12, y: 7, z: 2 };
    const screen = worldToScreen(world);
    expect(screen).toEqual({ x: 160, y: 272 });
    const restored = screenToWorld(screen, world.z);
    expect(restored.x).toBeCloseTo(world.x, 12);
    expect(restored.y).toBeCloseTo(world.y, 12);
    expect(restored.z).toBe(world.z);
  });

  it('uses the configured screen origin and tile dimensions', () => {
    const config = {
      ...DEFAULT_WORLD_GRID_CONFIG,
      originX: 100,
      originY: 50,
      screenTileWidth: 80,
      screenTileHeight: 40,
      elevationPixels: 10,
    };
    const screen = worldToScreen({ x: 2, y: 1, z: 3 }, config);
    expect(screen).toEqual({ x: 140, y: 80 });
    expect(screenToWorld(screen, 3, config)).toEqual({ x: 2, y: 1, z: 3 });
  });

  it('snaps fractional positions to the nearest tile', () => {
    expect(worldToTile({ x: 2.49, y: 5.51, z: 1.2 }))
      .toEqual({ i: 2, j: 6, elevation: 1 });
  });

  it('defines a 64 by 64 default world boundary', () => {
    expect(DEFAULT_WORLD_BOUNDS).toEqual({ width: 64, height: 64 });
    expect(isTileInBounds({ i: 0, j: 0 })).toBe(true);
    expect(isTileInBounds({ i: 63, j: 63 })).toBe(true);
    expect(isTileInBounds({ i: 64, j: 63 })).toBe(false);
    expect(isTileInBounds({ i: -1, j: 0 })).toBe(false);
    expect(isTileInBounds({ i: 1.5, j: 2 })).toBe(false);
  });

  it('rejects invalid configuration and non-finite coordinates', () => {
    expect(() => gridToWorld({ i: 1, j: 1 }, {
      ...DEFAULT_WORLD_GRID_CONFIG,
      cellWidth: 0,
    })).toThrow(RangeError);
    expect(() => worldToScreen({ x: Number.NaN, y: 0, z: 0 })).toThrow(RangeError);
    expect(() => screenToWorld({ x: 0, y: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});
