import type { TileCoordinate } from './coordinates';
import type { TerrainMap, TerrainTile } from './terrain';
import type { IsometricCamera } from './isometricCamera';
import { projectWorldToScreen } from './isometricCamera';

export type ChunkCoordinate = { chunkX: number; chunkY: number };

export type ChunkBounds = {
  originI: number;
  originJ: number;
  width: number;
  height: number;
};

export type WorldChunk = ChunkCoordinate & ChunkBounds & {
  key: string;
  tiles: TerrainTile[];
};

export type ChunkManagerOptions = {
  chunkSize: number;
  maxCachedChunks: number;
};

export const DEFAULT_CHUNK_MANAGER_OPTIONS: Readonly<ChunkManagerOptions> = Object.freeze({
  chunkSize: 16,
  maxCachedChunks: 32,
});

export function chunkKey(chunkX: number, chunkY: number): string {
  return chunkX + ':' + chunkY;
}

export function getChunkCoordinate(
  tile: Pick<TileCoordinate, 'i' | 'j'>,
  chunkSize = DEFAULT_CHUNK_MANAGER_OPTIONS.chunkSize,
): ChunkCoordinate {
  if (!Number.isInteger(tile.i) || !Number.isInteger(tile.j) || tile.i < 0 || tile.j < 0) {
    throw new RangeError('tile coordinates must be non-negative integers');
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError('chunkSize must be a positive integer');
  return { chunkX: Math.floor(tile.i / chunkSize), chunkY: Math.floor(tile.j / chunkSize) };
}

export function getChunkBounds(
  map: Pick<TerrainMap, 'width' | 'height'>,
  chunkX: number,
  chunkY: number,
  chunkSize = DEFAULT_CHUNK_MANAGER_OPTIONS.chunkSize,
): ChunkBounds | null {
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY) || chunkX < 0 || chunkY < 0) return null;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError('chunkSize must be a positive integer');
  const originI = chunkX * chunkSize;
  const originJ = chunkY * chunkSize;
  if (originI >= map.width || originJ >= map.height) return null;
  return {
    originI,
    originJ,
    width: Math.min(chunkSize, map.width - originI),
    height: Math.min(chunkSize, map.height - originJ),
  };
}

export function buildWorldChunk(
  map: TerrainMap,
  chunkX: number,
  chunkY: number,
  chunkSize = DEFAULT_CHUNK_MANAGER_OPTIONS.chunkSize,
): WorldChunk | null {
  const bounds = getChunkBounds(map, chunkX, chunkY, chunkSize);
  if (!bounds) return null;
  const tiles: TerrainTile[] = [];
  for (let j = bounds.originJ; j < bounds.originJ + bounds.height; j++) {
    for (let i = bounds.originI; i < bounds.originI + bounds.width; i++) {
      const tile = map.tiles[j * map.width + i];
      if (tile) tiles.push(tile);
    }
  }
  return {
    chunkX,
    chunkY,
    key: chunkKey(chunkX, chunkY),
    ...bounds,
    tiles,
  };
}

/**
 * Synchronous in-memory chunk cache. The source map is deterministic and
 * immutable by convention; a network-backed ChunkSource can replace it later.
 */
export class ChunkManager {
  private readonly map: TerrainMap;
  private readonly options: ChunkManagerOptions;
  private readonly cache = new Map<string, { chunk: WorldChunk; lastAccess: number }>();
  private visibleKeys = new Set<string>();
  private accessCounter = 0;

  constructor(map: TerrainMap, options: Partial<ChunkManagerOptions> = {}) {
    this.map = map;
    this.options = { ...DEFAULT_CHUNK_MANAGER_OPTIONS, ...options };
    if (!Number.isInteger(this.options.chunkSize) || this.options.chunkSize < 1) {
      throw new RangeError('chunkSize must be a positive integer');
    }
    if (!Number.isInteger(this.options.maxCachedChunks) || this.options.maxCachedChunks < 1) {
      throw new RangeError('maxCachedChunks must be a positive integer');
    }
  }

  getChunkAtTile(tile: Pick<TileCoordinate, 'i' | 'j'>): WorldChunk | null {
    if (tile.i >= this.map.width || tile.j >= this.map.height) return null;
    const coordinate = getChunkCoordinate(tile, this.options.chunkSize);
    return this.loadChunk(coordinate.chunkX, coordinate.chunkY);
  }

  loadChunk(chunkX: number, chunkY: number): WorldChunk | null {
    const key = chunkKey(chunkX, chunkY);
    const existing = this.cache.get(key);
    if (existing) {
      existing.lastAccess = ++this.accessCounter;
      return existing.chunk;
    }

    const chunk = buildWorldChunk(this.map, chunkX, chunkY, this.options.chunkSize);
    if (!chunk) return null;
    this.cache.set(key, { chunk, lastAccess: ++this.accessCounter });
    this.evictLeastRecentlyUsed();
    return chunk;
  }

  loadAround(
    center: Pick<TileCoordinate, 'i' | 'j'>,
    radiusChunks = 1,
  ): WorldChunk[] {
    if (!Number.isInteger(center.i) || !Number.isInteger(center.j)
      || center.i < 0 || center.j < 0 || center.i >= this.map.width || center.j >= this.map.height) {
      throw new RangeError('center tile must be inside the terrain map');
    }
    if (!Number.isInteger(radiusChunks) || radiusChunks < 0) {
      throw new RangeError('radiusChunks must be a non-negative integer');
    }

    const centerChunk = getChunkCoordinate(center, this.options.chunkSize);
    const nextVisible = new Set<string>();
    const loaded: WorldChunk[] = [];

    for (let chunkY = centerChunk.chunkY - radiusChunks; chunkY <= centerChunk.chunkY + radiusChunks; chunkY++) {
      for (let chunkX = centerChunk.chunkX - radiusChunks; chunkX <= centerChunk.chunkX + radiusChunks; chunkX++) {
        const bounds = getChunkBounds(this.map, chunkX, chunkY, this.options.chunkSize);
        if (!bounds) continue;
        const key = chunkKey(chunkX, chunkY);
        nextVisible.add(key);
        // Mark each requested chunk visible before loading it so LRU eviction
        // cannot discard an earlier member of the same visible window.
        this.visibleKeys = nextVisible;
        const chunk = this.loadChunk(chunkX, chunkY);
        if (chunk) loaded.push(chunk);
      }
    }

    this.visibleKeys = nextVisible;
    this.evictLeastRecentlyUsed();
    return loaded;
  }

  getLoadedChunk(key: string): WorldChunk | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    entry.lastAccess = ++this.accessCounter;
    return entry.chunk;
  }

  getVisibleChunkKeys(): string[] {
    return [...this.visibleKeys].sort();
  }

  getLoadedChunkCount(): number {
    return this.cache.size;
  }

  getCacheStats(): { loaded: number; visible: number; capacity: number } {
    return {
      loaded: this.cache.size,
      visible: this.visibleKeys.size,
      capacity: this.options.maxCachedChunks,
    };
  }

  unloadChunk(key: string): boolean {
    this.visibleKeys.delete(key);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.visibleKeys.clear();
  }

  private evictLeastRecentlyUsed(): void {
    while (this.cache.size > this.options.maxCachedChunks) {
      let candidateKey: string | null = null;
      let oldestAccess = Infinity;
      for (const [key, entry] of this.cache) {
        if (this.visibleKeys.has(key)) continue;
        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          candidateKey = key;
        }
      }
      // A visible window may exceed the configured cache capacity. Never evict
      // a chunk currently required for rendering; trim only after it leaves view.
      if (candidateKey === null) break;
      this.cache.delete(candidateKey);
    }
  }
}


/** Conservative screen-space frustum test for a terrain chunk's 3D bounds. */
export function isChunkVisibleInCamera(
  chunk: WorldChunk,
  camera: IsometricCamera,
  marginPixels = 48,
): boolean {
  if (!Number.isFinite(marginPixels) || marginPixels < 0) {
    throw new RangeError('marginPixels must be finite and non-negative');
  }
  if (chunk.tiles.length === 0) return false;
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (const tile of chunk.tiles) {
    minElevation = Math.min(minElevation, tile.elevation);
    maxElevation = Math.max(maxElevation, tile.elevation);
  }
  const minZ = minElevation * 0.12 - 0.15;
  const maxZ = maxElevation * 0.12 + 3.5;
  const xs = [chunk.originI, chunk.originI + chunk.width];
  const ys = [chunk.originJ, chunk.originJ + chunk.height];
  const projected = [];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of [minZ, maxZ]) {
        const point = projectWorldToScreen({ x, y, z }, camera);
        if (Number.isFinite(point.x) && Number.isFinite(point.y)) projected.push(point);
      }
    }
  }
  if (projected.length === 0) return false;
  const left = Math.min(...projected.map(point => point.x));
  const right = Math.max(...projected.map(point => point.x));
  const top = Math.min(...projected.map(point => point.y));
  const bottom = Math.max(...projected.map(point => point.y));
  return right >= -marginPixels
    && left <= camera.config.viewportWidth + marginPixels
    && bottom >= -marginPixels
    && top <= camera.config.viewportHeight + marginPixels;
}
