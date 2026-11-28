import { describe, expect, it } from 'vitest';
import { ChunkManager, ChunkStreamScheduler, buildWorldChunk, getChunkBounds, getChunkCoordinate, isChunkVisibleInCamera } from './chunks';
import { createIsometricCamera } from './isometricCamera';
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

  it('culls chunks behind a perspective third-person camera', () => {
    const map = generateTerrainMap();
    const nearChunk = buildWorldChunk(map, 2, 2)!;
    const rearChunk = buildWorldChunk(map, 3, 3)!;
    const camera = createIsometricCamera({
      target: { x: 32, y: 32, z: 1.2 },
      viewportWidth: 1280,
      viewportHeight: 720,
      azimuthRadians: Math.PI / 4,
      elevationRadians: 0.34,
      distance: 10,
      orthographicHeight: 48,
      near: 0.05,
      far: 240,
      projectionMode: 'perspective',
      fovRadians: Math.PI / 3,
    });
    expect(isChunkVisibleInCamera(nearChunk, camera)).toBe(true);
    expect(isChunkVisibleInCamera(rearChunk, camera)).toBe(false);
    expect(() => isChunkVisibleInCamera(nearChunk, camera, -1)).toThrow(RangeError);
  });

  it('streams nearest chunks incrementally within the per-frame load budget', () => {
    const map = generateTerrainMap();
    const manager = new ChunkManager(map);
    const streamer = new ChunkStreamScheduler(manager, map);
    streamer.requestAround({ i: 32, j: 32 }, 1);

    const first = streamer.tick(16, 2);
    expect(first.loadedThisFrame).toBe(2);
    expect(first.pending).toBe(7);
    expect(first.chunks).toHaveLength(2);
    expect(first.chunks[0].key).toBe('2:1');
    expect(first.chunks[1].key).toBe('2:2');

    const second = streamer.tick(16, 2);
    expect(second.loadedThisFrame).toBe(2);
    expect(second.chunks).toHaveLength(4);
    expect(streamer.getOpacity('2:2')).toBeCloseTo(16 / 220);
  });

  it('reprioritizes pending chunks when the player crosses into another chunk', () => {
    const map = generateTerrainMap();
    const manager = new ChunkManager(map);
    const streamer = new ChunkStreamScheduler(manager, map);
    streamer.requestAround({ i: 8, j: 8 }, 1);
    streamer.tick(16, 1);
    streamer.requestAround({ i: 40, j: 40 }, 0);
    const frame = streamer.tick(16, 1);
    expect(frame.pending).toBe(0);
    expect(frame.chunks.map(chunk => chunk.key)).toEqual(['2:2']);
    expect(streamer.getOpacity('0:0')).toBe(0);
  });

  it('keeps loaded chunks visible during the fade and reaches full opacity', () => {
    const map = generateTerrainMap();
    const streamer = new ChunkStreamScheduler(new ChunkManager(map), map, { transitionDurationMs: 100 });
    streamer.requestAround({ i: 4, j: 4 }, 0);
    expect(streamer.tick(0, 1).chunks).toHaveLength(1);
    expect(streamer.getOpacity('0:0')).toBe(0);
    streamer.tick(50, 0);
    expect(streamer.getOpacity('0:0')).toBeCloseTo(0.5);
    streamer.tick(80, 0);
    expect(streamer.getOpacity('0:0')).toBe(1);
  });

  it('rejects invalid streaming budgets and transition durations', () => {
    const map = generateTerrainMap();
    expect(() => new ChunkStreamScheduler(new ChunkManager(map), map, { transitionDurationMs: 0 })).toThrow(RangeError);
    const streamer = new ChunkStreamScheduler(new ChunkManager(map), map);
    expect(() => streamer.requestAround({ i: -1, j: 0 }, 1)).toThrow(RangeError);
    expect(() => streamer.tick(16, -1)).toThrow(RangeError);
    expect(() => streamer.tick(Number.NaN, 1)).toThrow(RangeError);
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
