/**
 * Deterministic logical world generation.
 *
 * Coordinates are global tile coordinates. Chunks are 64x64 views over that
 * coordinate space, so adjacent chunks share the same border-generation rules.
 * This module intentionally has no renderer, browser, or game-state dependency.
 */
export const WORLD_CHUNK_SIZE = 64;

export type Biome = 'grassland' | 'desert' | 'wetland' | 'highland';
export type TerrainKind = 'grass' | 'sand' | 'shallow-water' | 'deep-water' | 'rock' | 'cliff';

export type WorldTile = {
  x: number;
  y: number;
  biome: Biome;
  terrain: TerrainKind;
  elevation: number;
  walkable: boolean;
  variant: number;
};

export type WorldChunk = {
  chunkX: number;
  chunkY: number;
  seed: number;
  width: 64;
  height: 64;
  tiles: WorldTile[];
};

function hash2D(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function biomeAt(x: number, y: number, seed: number): Biome {
  // Macro cells make biome regions coherent instead of alternating per tile.
  const regionX = Math.floor(x / 16);
  const regionY = Math.floor(y / 16);
  const sample = hash2D(regionX, regionY, seed ^ 0x51f15e);
  if (sample < 0.38) return 'grassland';
  if (sample < 0.62) return 'desert';
  if (sample < 0.82) return 'wetland';
  return 'highland';
}

export function generateWorldTile(x: number, y: number, seed = 1): WorldTile {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new RangeError('World tile coordinates must be integers');
  }
  const biome = biomeAt(x, y, seed);
  const detail = hash2D(x, y, seed);
  const broad = hash2D(Math.floor(x / 4), Math.floor(y / 4), seed ^ 0x2c9277);
  const elevation = Math.max(0, Math.min(5, Math.floor(broad * 6)));
  let terrain: TerrainKind = 'grass';

  if (biome === 'desert') terrain = 'sand';
  if (biome === 'wetland') terrain = detail < 0.16 ? 'deep-water' : detail < 0.34 ? 'shallow-water' : 'grass';
  if (biome === 'highland') terrain = elevation >= 4 ? 'rock' : elevation >= 3 && detail < 0.38 ? 'cliff' : 'grass';
  if (biome === 'grassland' && detail < 0.035) terrain = 'rock';

  const walkable = terrain !== 'deep-water' && terrain !== 'cliff';
  return {
    x,
    y,
    biome,
    terrain,
    elevation,
    walkable,
    variant: Math.floor(hash2D(x, y, seed ^ 0x7f4a7c) * 4),
  };
}

export function generateWorldChunk(chunkX: number, chunkY: number, seed = 1): WorldChunk {
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
    throw new RangeError('Chunk coordinates must be integers');
  }
  const originX = chunkX * WORLD_CHUNK_SIZE;
  const originY = chunkY * WORLD_CHUNK_SIZE;
  const tiles: WorldTile[] = [];
  for (let localY = 0; localY < WORLD_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX < WORLD_CHUNK_SIZE; localX += 1) {
      tiles.push(generateWorldTile(originX + localX, originY + localY, seed));
    }
  }
  return { chunkX, chunkY, seed, width: WORLD_CHUNK_SIZE, height: WORLD_CHUNK_SIZE, tiles };
}

export function getChunkTile(chunk: WorldChunk, localX: number, localY: number): WorldTile | null {
  if (!Number.isInteger(localX) || !Number.isInteger(localY)
    || localX < 0 || localY < 0 || localX >= chunk.width || localY >= chunk.height) return null;
  return chunk.tiles[localY * chunk.width + localX] ?? null;
}
