import { describe, expect, it } from 'vitest';
import { ChunkManager, buildWorldChunk, getChunkBounds, getChunkCoordinate } from './chunks';
import { generateTerrainMap } from './terrain';

describe('world chunk manager', () => {
  it('splits a 64x64 map into sixteen 16x16 chunks', () => {
    const map = generateTerrainMap();
    const chunks = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) chunks.push(buildWorldChunk(map, x, y));
    }
    expect(chunks).toHaveLength(16);
    expect(chunks.every(chunk => chunk?.tiles.length === 256)).toBe(true);
    expect(chunks[15]).toMatchObject({ originI: 48, originJ: 48, width: 16, height: 16 });
  });

  it('maps tile coordinates to the expected chunk coordinates', () => {
    expect(getChunkCoordinate({ i: 0, j: 0 })).toEqual({ chunkX: 0, chunkY: 0 });
    expect(getChunkCoordinate({ i: 16, j: 31 })).toEqual({ chunkX: 1, chunkY: 1 });
    expect(getChunkCoordinate({ i: 63, j: 63 })).toEqual({ chunkX: 3, chunkY: 3 });
  });

  it('clips edge chunks for maps not divisible by the chunk size', () => {
    const map = generateTerrainMap({ width: 20, height: 18, spawnI: 10, spawnJ: 9 });
    expect(getChunkBounds(map, 1, 1)).toEqual({ originI: 16, originJ: 16, width: 4, height: 2 });
    expect(buildWorldChunk(map, 1, 1)?.tiles).toHaveLength(8);
    expect(getChunkBounds(map, 2, 0)).toBeNull();
  });

  it('loads the visible 3x3 chunk window around the centre', () => {
    const manager = new ChunkManager(generateTerrainMap());
    const visible = manager.loadAround({ i: 32, j: 32 }, 1);
    expect(visible).toHaveLength(9);
    expect(manager.getCacheStats()).toMatchObject({ loaded: 9, visible: 9, capacity: 32 });
    expect(manager.getVisibleChunkKeys()).toContain('2:2');
  });

  it('keeps visible chunks when the requested window exceeds cache capacity', () => {
    const manager = new ChunkManager(generateTerrainMap(), { maxCachedChunks: 4 });
    const visible = manager.loadAround({ i: 32, j: 32 }, 1);
    expect(visible).toHaveLength(9);
    expect(manager.getLoadedChunkCount()).toBe(9);
  });

  it('evicts the least recently used non-visible chunk', () => {
    const manager = new ChunkManager(generateTerrainMap(), { maxCachedChunks: 2 });
    manager.loadAround({ i: 1, j: 1 }, 0);
    manager.loadAround({ i: 17, j: 1 }, 0);
    manager.loadAround({ i: 33, j: 1 }, 0);
    expect(manager.getLoadedChunkCount()).toBe(2);
    expect(manager.getLoadedChunk('0:0')).toBeNull();
    expect(manager.getLoadedChunk('1:0')).not.toBeNull();
    expect(manager.getLoadedChunk('2:0')).not.toBeNull();
  });

  it('loads the chunk containing a requested tile', () => {
    const manager = new ChunkManager(generateTerrainMap());
    expect(manager.getChunkAtTile({ i: 49, j: 8 })).toMatchObject({ key: '3:0', originI: 48 });
    expect(manager.getChunkAtTile({ i: 64, j: 0 })).toBeNull();
  });

  it('unloads chunks and clears the cache', () => {
    const manager = new ChunkManager(generateTerrainMap());
    manager.loadAround({ i: 32, j: 32 }, 1);
    expect(manager.unloadChunk('2:2')).toBe(true);
    expect(manager.getLoadedChunk('2:2')).toBeNull();
    manager.clear();
    expect(manager.getCacheStats()).toMatchObject({ loaded: 0, visible: 0 });
  });

  it('rejects invalid chunk sizes, centres and radii', () => {
    const map = generateTerrainMap();
    expect(() => new ChunkManager(map, { chunkSize: 0 })).toThrow(RangeError);
    expect(() => new ChunkManager(map, { maxCachedChunks: 0 })).toThrow(RangeError);
    const manager = new ChunkManager(map);
    expect(() => manager.loadAround({ i: -1, j: 0 })).toThrow(RangeError);
    expect(() => manager.loadAround({ i: 1, j: 1 }, -1)).toThrow(RangeError);
    expect(() => getChunkCoordinate({ i: -1, j: 0 })).toThrow(RangeError);
  });
});
