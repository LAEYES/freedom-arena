import { describe, expect, it } from 'vitest';
import { createIsometricCamera, projectWorldToScreen } from './isometricCamera';
import {
  buildAvatarMesh,
  buildTerrainMesh,
  pickNearestTerrainTile,
  TERRAIN_PALETTE,
  terrainWorldHeight,
} from './worldRenderer';
import type { TerrainTile } from './terrain';

const grass: TerrainTile = {
  i: 4, j: 7, kind: 'grass', elevation: 2, walkable: true, movementCost: 1,
};

const camera = createIsometricCamera({
  target: { x: 32, y: 32, z: 0.5 },
  viewportWidth: 900,
  viewportHeight: 520,
  azimuthRadians: Math.PI / 4,
  elevationRadians: Math.atan(1 / Math.SQRT2),
  distance: 100,
  orthographicHeight: 64,
  near: 0.1,
  far: 500,
});

describe('WebGL world mesh and picking', () => {
  it('builds five terrain faces per tile with six floats per vertex', () => {
    const mesh = buildTerrainMesh([grass]);
    expect(mesh.length).toBe(30 * 6);
    expect(mesh.every(Number.isFinite)).toBe(true);
  });

  it('builds a low-poly avatar from six box primitives', () => {
    const mesh = buildAvatarMesh(grass);
    expect(mesh.length).toBe(6 * 36 * 6);
    expect(mesh.every(Number.isFinite)).toBe(true);
  });

  it('maps terrain kinds to normalized RGB colors', () => {
    expect(Object.keys(TERRAIN_PALETTE)).toEqual(['grass', 'forest', 'water', 'rock', 'sand', 'snow']);
    for (const color of Object.values(TERRAIN_PALETTE)) {
      expect(color.every(channel => channel >= 0 && channel <= 1)).toBe(true);
    }
  });

  it('converts tile elevation into world-space height', () => {
    expect(terrainWorldHeight(grass)).toBeCloseTo(0.24, 10);
  });

  it('picks the nearest projected terrain tile', () => {
    const tiles = [
      grass,
      { ...grass, i: 5, j: 7 },
      { ...grass, i: 4, j: 8 },
    ];
    const screen = {
      x: camera.config.viewportWidth / 2,
      y: camera.config.viewportHeight / 2,
    };
    const center = {
      x: 5.5,
      y: 7.5,
      z: terrainWorldHeight(tiles[1]) + 0.015,
    };
    const actual = {
      x: camera.config.viewportWidth / 2,
      y: camera.config.viewportHeight / 2,
    };
    // The exact projection is used here rather than assuming screen axes.
    const point = projectWorldToScreen(center, camera);
    expect(pickNearestTerrainTile(point, tiles, camera, 2)?.i).toBe(5);
    expect(pickNearestTerrainTile(actual, [], camera)).toBeNull();
  });
});
