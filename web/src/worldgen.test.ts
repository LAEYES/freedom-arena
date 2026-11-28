import { describe, expect, it } from 'vitest';
import {
  WORLD_CHUNK_SIZE,
  generateWorldChunk,
  generateWorldTile,
  getChunkTile,
} from './worldgen';

describe('deterministic 64x64 world generation', () => {
  it('creates exactly 4096 tiles with stable global coordinates', () => {
    const chunk = generateWorldChunk(2, -1, 42);
    expect(chunk.tiles).toHaveLength(WORLD_CHUNK_SIZE * WORLD_CHUNK_SIZE);
    expect(chunk.width).toBe(64);
    expect(chunk.height).toBe(64);
    expect(getChunkTile(chunk, 0, 0)?.x).toBe(128);
    expect(getChunkTile(chunk, 0, 0)?.y).toBe(-64);
    expect(getChunkTile(chunk, 63, 63)?.x).toBe(191);
    expect(getChunkTile(chunk, 63, 63)?.y).toBe(-1);
  });

  it('returns identical tile data for identical coordinates and seed', () => {
    expect(generateWorldTile(17, 29, 1234)).toEqual(generateWorldTile(17, 29, 1234));
    expect(generateWorldChunk(0, 0, 1234)).toEqual(generateWorldChunk(0, 0, 1234));
  });

  it('changes generated terrain when the world seed changes', () => {
    const first = generateWorldChunk(0, 0, 10);
    const second = generateWorldChunk(0, 0, 11);
    expect(first.tiles).not.toEqual(second.tiles);
  });

  it('keeps neighboring chunk borders continuous in global coordinates', () => {
    const left = generateWorldChunk(0, 0, 77);
    const right = generateWorldChunk(1, 0, 77);
    for (let y = 0; y < WORLD_CHUNK_SIZE; y += 1) {
      expect(getChunkTile(left, 63, y)).toEqual(generateWorldTile(63, y, 77));
      expect(getChunkTile(right, 0, y)).toEqual(generateWorldTile(64, y, 77));
    }
  });

  it('keeps terrain metadata within its declared invariants', () => {
    const chunk = generateWorldChunk(-1, 1, 9);
    for (const tile of chunk.tiles) {
      expect(tile.elevation).toBeGreaterThanOrEqual(0);
      expect(tile.elevation).toBeLessThanOrEqual(5);
      expect(tile.variant).toBeGreaterThanOrEqual(0);
      expect(tile.variant).toBeLessThanOrEqual(3);
      expect(tile.walkable).toBe(tile.terrain !== 'deep-water' && tile.terrain !== 'cliff');
    }
  });

  it('rejects fractional coordinates and safely handles out-of-range local lookup', () => {
    expect(() => generateWorldTile(1.5, 2, 1)).toThrow(RangeError);
    expect(() => generateWorldChunk(0, 0.5, 1)).toThrow(RangeError);
    expect(getChunkTile(generateWorldChunk(0, 0), -1, 0)).toBeNull();
    expect(getChunkTile(generateWorldChunk(0, 0), 64, 0)).toBeNull();
  });
});
