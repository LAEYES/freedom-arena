import { describe, expect, it } from 'vitest';
import { createAsset, seededRandom, tileableCellValue, GRAPHICS_PIPELINE } from './assetFactory';

describe('Freedom Arena graphics asset factory', () => {
  it('creates stable versioned asset descriptors', () => {
    const a = createAsset('ground','temperate',42,64);
    const b = createAsset('ground','temperate',42,64);
    expect(a).toEqual(b);
    expect(a.id).toBe('fa:temperate:ground:42');
    expect(a.version).toBe(1);
  });

  it('produces reproducible pseudo-random sequences for a seed', () => {
    const first = seededRandom(1234);
    const second = seededRandom(1234);
    expect(Array.from({length:8},first)).toEqual(Array.from({length:8},second));
  });

  it('supports all declared biomes and material combinations', () => {
    const biomes = ['temperate','arid','frozen','volcanic','coastal'] as const;
    const materials = ['ground','water','rock','wall','sand','snow','lava'] as const;
    for (const biome of biomes) for (const material of materials) {
      expect(createAsset(material,biome,7).palette.base).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('uses identical edge-cell values for repeatable texture tiling', () => {\n    for (let index = 0; index < 16; index++) {\n      expect(tileableCellValue(99, 0, index)).toBe(tileableCellValue(99, 15, index));\n      expect(tileableCellValue(99, index, 0)).toBe(tileableCellValue(99, index, 15));\n    }\n  });\n\n  it('keeps the 64px logical tile contract and export formats explicit', () => {
    expect(GRAPHICS_PIPELINE.logicalGrid).toBe(64);
    expect(GRAPHICS_PIPELINE.formats).toContain('png');
    expect(GRAPHICS_PIPELINE.supportedTileSizes).toEqual([64,128,256]);
  });
});
