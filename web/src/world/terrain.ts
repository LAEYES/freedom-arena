import type { WorldBounds } from './coordinates';

export type TerrainKind = 'grass' | 'forest' | 'water' | 'rock' | 'sand' | 'snow';

export type TerrainTile = {
  i: number;
  j: number;
  kind: TerrainKind;
  elevation: number;
  walkable: boolean;
  movementCost: number;
};

export type TerrainGenerationOptions = {
  width: number;
  height: number;
  seed: number;
  spawnI: number;
  spawnJ: number;
  spawnSafeRadius: number;
};

export type TerrainMap = {
  width: number;
  height: number;
  seed: number;
  tiles: TerrainTile[];
};

export const DEFAULT_TERRAIN_OPTIONS: Readonly<TerrainGenerationOptions> = Object.freeze({
  width: 64,
  height: 64,
  seed: 20261128,
  spawnI: 32,
  spawnJ: 32,
  spawnSafeRadius: 4,
});

const TERRAIN_RULES: Record<TerrainKind, { walkable: boolean; movementCost: number }> = {
  grass: { walkable: true, movementCost: 1 },
  forest: { walkable: true, movementCost: 1.5 },
  water: { walkable: false, movementCost: Infinity },
  rock: { walkable: false, movementCost: Infinity },
  sand: { walkable: true, movementCost: 1.25 },
  snow: { walkable: true, movementCost: 1.4 },
};

function assertInteger(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(label + ' must be an integer >= ' + minimum);
  }
}

function hash2D(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = lerp(hash2D(x0, y0, seed), hash2D(x0 + 1, y0, seed), tx);
  const b = lerp(hash2D(x0, y0 + 1, seed), hash2D(x0 + 1, y0 + 1, seed), tx);
  return lerp(a, b, ty);
}

function fractalNoise(i: number, j: number, seed: number, baseScale: number): number {
  const large = valueNoise(i / baseScale, j / baseScale, seed);
  const medium = valueNoise(i / (baseScale / 2), j / (baseScale / 2), seed + 1013);
  const fine = valueNoise(i / (baseScale / 4), j / (baseScale / 4), seed + 2027);
  return large * 0.55 + medium * 0.30 + fine * 0.15;
}

function classifyTerrain(elevation: number, moisture: number): TerrainKind {
  if (elevation < 0.31) return 'water';
  if (elevation > 0.76) return 'rock';
  if (elevation > 0.68 && moisture < 0.48) return 'snow';
  if (moisture > 0.67) return 'forest';
  if (moisture < 0.27) return 'sand';
  return 'grass';
}

function createTile(i: number, j: number, kind: TerrainKind, elevation: number): TerrainTile {
  const rules = TERRAIN_RULES[kind];
  return { i, j, kind, elevation, walkable: rules.walkable, movementCost: rules.movementCost };
}

export function generateTerrainMap(
  options: Partial<TerrainGenerationOptions> = {},
): TerrainMap {
  const config = { ...DEFAULT_TERRAIN_OPTIONS, ...options };
  assertInteger(config.width, 'width', 1);
  assertInteger(config.height, 'height', 1);
  assertInteger(config.seed, 'seed', 0);
  assertInteger(config.spawnI, 'spawnI', 0);
  assertInteger(config.spawnJ, 'spawnJ', 0);
  assertInteger(config.spawnSafeRadius, 'spawnSafeRadius', 0);
  if (config.spawnI >= config.width || config.spawnJ >= config.height) {
    throw new RangeError('spawn position must be inside the terrain map');
  }

  const tiles: TerrainTile[] = [];
  for (let j = 0; j < config.height; j++) {
    for (let i = 0; i < config.width; i++) {
      const distanceToSpawn = Math.hypot(i - config.spawnI, j - config.spawnJ);
      if (distanceToSpawn <= config.spawnSafeRadius) {
        tiles.push(createTile(i, j, 'grass', 0.52));
        continue;
      }

      const elevationNoise = fractalNoise(i, j, config.seed, 28);
      const moistureNoise = fractalNoise(i + 137, j - 91, config.seed + 7919, 20);
      const kind = classifyTerrain(elevationNoise, moistureNoise);
      const elevation = Math.max(0, Math.min(12, Math.round((elevationNoise - 0.25) * 24)));
      tiles.push(createTile(i, j, kind, elevation));
    }
  }

  return { width: config.width, height: config.height, seed: config.seed, tiles };
}

export function getTerrainTile(map: TerrainMap, i: number, j: number): TerrainTile | null {
  if (!Number.isInteger(i) || !Number.isInteger(j)) return null;
  if (i < 0 || j < 0 || i >= map.width || j >= map.height) return null;
  return map.tiles[j * map.width + i] ?? null;
}

export function isTerrainWalkable(map: TerrainMap, i: number, j: number): boolean {
  return getTerrainTile(map, i, j)?.walkable ?? false;
}

export function getTerrainMovementCost(map: TerrainMap, i: number, j: number): number {
  return getTerrainTile(map, i, j)?.movementCost ?? Infinity;
}

export function getTerrainBounds(map: TerrainMap): WorldBounds {
  return { width: map.width, height: map.height };
}

export function countTerrainKinds(map: TerrainMap): Record<TerrainKind, number> {
  const counts: Record<TerrainKind, number> = {
    grass: 0, forest: 0, water: 0, rock: 0, sand: 0, snow: 0,
  };
  for (const tile of map.tiles) counts[tile.kind]++;
  return counts;
}
