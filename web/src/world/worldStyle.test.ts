import { describe, expect, it } from 'vitest';
import {
  BIOME_STYLE_PRESETS,
  STYLIZED_TERRAIN_PALETTE,
  getBiomeStyle,
  hashWorldPlacement,
  worldPlacementSample,
} from './worldStyle';

describe('stylized world visual system', () => {
  it('defines normalized colors for every logical terrain kind', () => {
    expect(Object.keys(STYLIZED_TERRAIN_PALETTE).sort()).toEqual([
      'forest', 'grass', 'rock', 'sand', 'snow', 'water',
    ]);
    for (const color of Object.values(STYLIZED_TERRAIN_PALETTE)) {
      expect(color).toHaveLength(3);
      expect(color.every(channel => channel >= 0 && channel <= 1)).toBe(true);
    }
  });

  it('provides complete biome presets with normalized color channels', () => {
    expect(Object.keys(BIOME_STYLE_PRESETS).sort()).toEqual([
      'alpine', 'arid', 'temperate_forest', 'temperate_grassland', 'wetlands',
    ]);
    for (const preset of Object.values(BIOME_STYLE_PRESETS)) {
      for (const color of Object.values(preset)) {
        expect(color).toHaveLength(3);
        expect(color.every(channel => channel >= 0 && channel <= 1)).toBe(true);
      }
    }
    expect(getBiomeStyle('arid')).toEqual(BIOME_STYLE_PRESETS.arid);
  });

  it('produces stable placement values for identical world coordinates and channels', () => {
    const first = hashWorldPlacement(20261128, 17, 42, 'vegetation');
    expect(hashWorldPlacement(20261128, 17, 42, 'vegetation')).toBe(first);
    expect(worldPlacementSample(20261128, 17, 42, 'vegetation')).toBe(first / 4294967296);
  });

  it('separates neighboring tiles, seeds and asset channels', () => {
    const base = hashWorldPlacement(7, 12, 19, 'tree');
    expect(hashWorldPlacement(7, 13, 19, 'tree')).not.toBe(base);
    expect(hashWorldPlacement(8, 12, 19, 'tree')).not.toBe(base);
    expect(hashWorldPlacement(7, 12, 19, 'rock')).not.toBe(base);
  });

  it('rejects non-integer seed and tile coordinates', () => {
    expect(() => hashWorldPlacement(1.5, 0, 0, 'tree')).toThrow(RangeError);
    expect(() => hashWorldPlacement(1, 0, 2.2, 'tree')).toThrow(RangeError);
  });
});
