import { describe, expect, it } from 'vitest';
import {
  countTerrainKinds,
  generateTerrainMap,
  getTerrainBounds,
  getTerrainMovementCost,
  getTerrainTile,
  isTerrainWalkable,
} from './terrain';

describe('64x64 terrain generation', () => {
  it('generates exactly 4096 cells with a stable row-major index', () => {
    const map = generateTerrainMap();
    expect(map.width).toBe(64);
    expect(map.height).toBe(64);
    expect(map.tiles).toHaveLength(4096);
    expect(getTerrainTile(map, 0, 0)?.i).toBe(0);
    expect(getTerrainTile(map, 0, 1)?.j).toBe(1);
    expect(getTerrainTile(map, 63, 63)?.i).toBe(63);
  });

  it('is deterministic for a fixed seed', () => {
    const first = generateTerrainMap({ seed: 12345 });
    const second = generateTerrainMap({ seed: 12345 });
    expect(first.tiles).toEqual(second.tiles);
  });

  it('changes terrain distribution when the seed changes', () => {
    const first = generateTerrainMap({ seed: 12345 });
    const second = generateTerrainMap({ seed: 54321 });
    expect(first.tiles).not.toEqual(second.tiles);
  });

  it('protects the configured spawn area with walkable grass', () => {
    const map = generateTerrainMap({ spawnI: 10, spawnJ: 12, spawnSafeRadius: 3 });
    for (let j = 9; j <= 15; j++) {
      for (let i = 7; i <= 13; i++) {
        if (Math.hypot(i - 10, j - 12) <= 3) {
          expect(getTerrainTile(map, i, j)).toMatchObject({ kind: 'grass', walkable: true });
        }
      }
    }
  });

  it('returns null outside the map and rejects non-integer tile positions', () => {
    const map = generateTerrainMap();
    expect(getTerrainTile(map, -1, 0)).toBeNull();
    expect(getTerrainTile(map, 64, 0)).toBeNull();
    expect(getTerrainTile(map, 0, 64)).toBeNull();
    expect(getTerrainTile(map, 1.5, 2)).toBeNull();
  });

  it('exposes walkability and movement costs by terrain type', () => {
    const map = generateTerrainMap();
    expect(isTerrainWalkable(map, 32, 32)).toBe(true);
    expect(getTerrainMovementCost(map, 32, 32)).toBe(1);
    const water = map.tiles.find(tile => tile.kind === 'water');
    expect(water).toBeDefined();
    expect(isTerrainWalkable(map, water!.i, water!.j)).toBe(false);
    expect(getTerrainMovementCost(map, water!.i, water!.j)).toBe(Infinity);
  });

  it('produces more than one terrain type for the default seed', () => {
    const counts = countTerrainKinds(generateTerrainMap());
    expect(Object.values(counts).filter(count => count > 0).length).toBeGreaterThan(1);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(4096);
  });

  it('validates dimensions and spawn coordinates', () => {
    expect(() => generateTerrainMap({ width: 0 })).toThrow(RangeError);
    expect(() => generateTerrainMap({ width: 64, spawnI: 64 })).toThrow(RangeError);
    expect(() => generateTerrainMap({ seed: -1 })).toThrow(RangeError);
  });

  it('exposes world bounds without mutating the map', () => {
    const map = generateTerrainMap({ width: 32, height: 48, spawnI: 16, spawnJ: 24 });
    expect(getTerrainBounds(map)).toEqual({ width: 32, height: 48 });
    expect(map.tiles).toHaveLength(1536);
  });
});
