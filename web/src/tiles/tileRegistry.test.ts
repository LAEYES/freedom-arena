import { describe, expect, it } from 'vitest';
import {
  TILE_REGISTRY_STATS,
  TILE_REGISTRY,
  getCategoryTiles,
  getPaintableTiles,
  getTileDefinition,
} from './tileRegistry';

describe('Freedom Arena tile registry', () => {
  it('contains the 24 canonical categories', () => {
    expect(TILE_REGISTRY_STATS.categories).toBe(24);
  });

  it('generates stable 32x32 asset ids', () => {
    expect(TILE_REGISTRY_STATS.tileSize).toBe(32);
    expect(TILE_REGISTRY_STATS.tiles).toBe(384);
    expect(getTileDefinition('07_00')?.src).toBe('/assets/tiles/07_00.png');
    expect(getTileDefinition('24_15')?.category).toBe('CHARACTERS_NPC');
  });

  it('groups assets by category and exposes terrain paint assets', () => {
    expect(getCategoryTiles('GROUND')).toHaveLength(16);
    expect(getCategoryTiles('WATER')).toHaveLength(16);
    expect(getPaintableTiles().length).toBeGreaterThan(0);
    expect(TILE_REGISTRY.every((tile) => tile.size === 32)).toBe(true);
  });
});
