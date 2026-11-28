import type { ScreenPosition, WorldPosition } from './coordinates';
import type { IsometricCamera } from './isometricCamera';
import { projectWorldToScreen } from './isometricCamera';
import type { TerrainTile } from './terrain';

export type RGB = readonly [number, number, number];

export const TERRAIN_PALETTE: Record<TerrainTile['kind'], RGB> = {
  grass: [0.20, 0.48, 0.27],
  forest: [0.10, 0.31, 0.19],
  water: [0.10, 0.34, 0.57],
  rock: [0.39, 0.42, 0.48],
  sand: [0.66, 0.52, 0.29],
  snow: [0.72, 0.82, 0.88],
};

const TERRAIN_HEIGHT_SCALE = 0.12;
const TILE_INSET = 0.035;
const TILE_BASE_DEPTH = 0.10;

export function terrainWorldHeight(tile: Pick<TerrainTile, 'elevation'>): number {
  return tile.elevation * TERRAIN_HEIGHT_SCALE;
}

function shade(color: RGB, factor: number): RGB {
  return [
    Math.max(0, Math.min(1, color[0] * factor)),
    Math.max(0, Math.min(1, color[1] * factor)),
    Math.max(0, Math.min(1, color[2] * factor)),
  ];
}

function pushTriangle(
  output: number[],
  a: WorldPosition,
  b: WorldPosition,
  c: WorldPosition,
  color: RGB,
): void {
  for (const point of [a, b, c]) output.push(point.x, point.y, point.z, color[0], color[1], color[2]);
}

function pushQuad(
  output: number[],
  a: WorldPosition,
  b: WorldPosition,
  c: WorldPosition,
  d: WorldPosition,
  color: RGB,
): void {
  pushTriangle(output, a, b, c, color);
  pushTriangle(output, a, c, d, color);
}

/** Create top faces and four shallow vertical sides for every terrain tile. */
export function buildTerrainMesh(tiles: readonly TerrainTile[]): Float32Array {
  const output: number[] = [];
  for (const tile of tiles) {
    const left = tile.i + TILE_INSET;
    const right = tile.i + 1 - TILE_INSET;
    const front = tile.j + TILE_INSET;
    const back = tile.j + 1 - TILE_INSET;
    const topZ = terrainWorldHeight(tile);
    const bottomZ = topZ - TILE_BASE_DEPTH;
    const a = { x: left, y: front, z: topZ };
    const b = { x: right, y: front, z: topZ };
    const c = { x: right, y: back, z: topZ };
    const d = { x: left, y: back, z: topZ };
    const a0 = { ...a, z: bottomZ };
    const b0 = { ...b, z: bottomZ };
    const c0 = { ...c, z: bottomZ };
    const d0 = { ...d, z: bottomZ };
    const base = TERRAIN_PALETTE[tile.kind];

    pushQuad(output, a, b, c, d, base);
    pushQuad(output, a0, a, d, d0, shade(base, 0.48));
    pushQuad(output, b0, b, a, a0, shade(base, 0.58));
    pushQuad(output, c0, c, b, b0, shade(base, 0.68));
    pushQuad(output, d0, d, c, c0, shade(base, 0.54));
  }
  return new Float32Array(output);
}

function pushBox(
  output: number[],
  center: WorldPosition,
  size: { width: number; depth: number; height: number },
  color: RGB,
): void {
  const x0 = center.x - size.width / 2;
  const x1 = center.x + size.width / 2;
  const y0 = center.y - size.depth / 2;
  const y1 = center.y + size.depth / 2;
  const z0 = center.z - size.height / 2;
  const z1 = center.z + size.height / 2;
  const a = { x: x0, y: y0, z: z0 };
  const b = { x: x1, y: y0, z: z0 };
  const c = { x: x1, y: y1, z: z0 };
  const d = { x: x0, y: y1, z: z0 };
  const e = { x: x0, y: y0, z: z1 };
  const f = { x: x1, y: y0, z: z1 };
  const g = { x: x1, y: y1, z: z1 };
  const h = { x: x0, y: y1, z: z1 };
  pushQuad(output, e, f, g, h, color);
  pushQuad(output, a, b, f, e, shade(color, 0.72));
  pushQuad(output, b, c, g, f, shade(color, 0.58));
  pushQuad(output, c, d, h, g, shade(color, 0.66));
  pushQuad(output, d, a, e, h, shade(color, 0.82));
  pushQuad(output, d, c, b, a, shade(color, 0.42));
}

/** Low-poly humanoid assembled from a torso, head, arms and legs. */
export function buildAvatarMesh(tile: TerrainTile): Float32Array {
  const output: number[] = [];
  const x = tile.i + 0.5;
  const y = tile.j + 0.5;
  const ground = terrainWorldHeight(tile) + 0.015;
  pushBox(output, { x, y, z: ground + 0.58 }, { width: 0.34, depth: 0.28, height: 0.48 }, [0.24, 0.62, 0.96]);
  pushBox(output, { x, y, z: ground + 0.96 }, { width: 0.27, depth: 0.27, height: 0.27 }, [0.91, 0.78, 0.62]);
  pushBox(output, { x: x - 0.23, y, z: ground + 0.59 }, { width: 0.12, depth: 0.14, height: 0.42 }, [0.18, 0.43, 0.77]);
  pushBox(output, { x: x + 0.23, y, z: ground + 0.59 }, { width: 0.12, depth: 0.14, height: 0.42 }, [0.18, 0.43, 0.77]);
  pushBox(output, { x: x - 0.10, y, z: ground + 0.20 }, { width: 0.13, depth: 0.17, height: 0.34 }, [0.13, 0.19, 0.29]);
  pushBox(output, { x: x + 0.10, y, z: ground + 0.20 }, { width: 0.13, depth: 0.17, height: 0.34 }, [0.13, 0.19, 0.29]);
  return new Float32Array(output);
}

export function pickNearestTerrainTile(
  screen: ScreenPosition,
  tiles: readonly TerrainTile[],
  camera: IsometricCamera,
  maxDistancePixels = 18,
): TerrainTile | null {
  let nearest: TerrainTile | null = null;
  let nearestDistance = maxDistancePixels;
  for (const tile of tiles) {
    const center: WorldPosition = {
      x: tile.i + 0.5,
      y: tile.j + 0.5,
      z: terrainWorldHeight(tile) + 0.015,
    };
    const projected = projectWorldToScreen(center, camera);
    const distance = Math.hypot(projected.x - screen.x, projected.y - screen.y);
    if (distance < nearestDistance) {
      nearest = tile;
      nearestDistance = distance;
    }
  }
  return nearest;
}
