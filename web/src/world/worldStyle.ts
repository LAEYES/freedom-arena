import type { TerrainKind } from './terrain';

export type RGB = readonly [number, number, number];

export type BiomeId =
  | 'temperate_grassland'
  | 'temperate_forest'
  | 'arid'
  | 'alpine'
  | 'wetlands';

export type BiomeStyle = {
  groundAccent: RGB;
  foliage: RGB;
  foliageShadow: RGB;
  rockAccent: RGB;
  waterAccent: RGB;
  fog: RGB;
};

export const STYLIZED_TERRAIN_PALETTE: Readonly<Record<TerrainKind, RGB>> = Object.freeze({
  grass: [0.34, 0.62, 0.29],
  forest: [0.16, 0.40, 0.25],
  water: [0.12, 0.43, 0.66],
  rock: [0.43, 0.45, 0.49],
  sand: [0.78, 0.61, 0.34],
  snow: [0.82, 0.89, 0.94],
});

export const BIOME_STYLE_PRESETS: Readonly<Record<BiomeId, BiomeStyle>> = Object.freeze({
  temperate_grassland: {
    groundAccent: [0.55, 0.70, 0.34],
    foliage: [0.25, 0.53, 0.25],
    foliageShadow: [0.13, 0.34, 0.20],
    rockAccent: [0.49, 0.48, 0.43],
    waterAccent: [0.18, 0.53, 0.70],
    fog: [0.67, 0.77, 0.76],
  },
  temperate_forest: {
    groundAccent: [0.31, 0.49, 0.29],
    foliage: [0.12, 0.39, 0.24],
    foliageShadow: [0.07, 0.23, 0.17],
    rockAccent: [0.39, 0.43, 0.41],
    waterAccent: [0.12, 0.40, 0.57],
    fog: [0.48, 0.62, 0.59],
  },
  arid: {
    groundAccent: [0.83, 0.66, 0.39],
    foliage: [0.46, 0.49, 0.23],
    foliageShadow: [0.29, 0.33, 0.17],
    rockAccent: [0.66, 0.43, 0.29],
    waterAccent: [0.19, 0.50, 0.66],
    fog: [0.83, 0.72, 0.55],
  },
  alpine: {
    groundAccent: [0.67, 0.75, 0.77],
    foliage: [0.20, 0.37, 0.34],
    foliageShadow: [0.11, 0.25, 0.26],
    rockAccent: [0.48, 0.53, 0.58],
    waterAccent: [0.24, 0.55, 0.73],
    fog: [0.72, 0.82, 0.88],
  },
  wetlands: {
    groundAccent: [0.39, 0.53, 0.38],
    foliage: [0.21, 0.43, 0.30],
    foliageShadow: [0.10, 0.29, 0.23],
    rockAccent: [0.40, 0.45, 0.42],
    waterAccent: [0.12, 0.39, 0.49],
    fog: [0.56, 0.69, 0.65],
  },
});

export function getBiomeStyle(biome: BiomeId): BiomeStyle {
  return BIOME_STYLE_PRESETS[biome];
}

/** Stable unsigned hash for world-seeded placement; independent of render order. */
export function hashWorldPlacement(seed: number, i: number, j: number, channel: string): number {
  if (!Number.isInteger(seed) || !Number.isInteger(i) || !Number.isInteger(j)) {
    throw new RangeError('seed and tile coordinates must be integers');
  }
  let hash = 2166136261;
  const input = seed + ':' + i + ':' + j + ':' + channel;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic [0, 1) sample for one asset family at one absolute world tile. */
export function worldPlacementSample(seed: number, i: number, j: number, channel: string): number {
  return hashWorldPlacement(seed, i, j, channel) / 4294967296;
}
