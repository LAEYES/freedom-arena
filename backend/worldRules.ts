/**
 * Server-authoritative terrain rules for the current 64x64 prototype sector.
 *
 * Keep the noise constants and classification thresholds in sync with
 * web/src/world/terrain.ts. The server deliberately recomputes a tile from
 * coordinates; it never trusts walkability supplied by a browser client.
 */
export type ServerTerrainKind = 'grass' | 'forest' | 'water' | 'rock' | 'sand' | 'snow';
export type ServerTile = { i: number; j: number; kind: ServerTerrainKind; walkable: boolean };

export const SERVER_WORLD_SIZE = 64;
export const SERVER_WORLD_SEED = 20261128;
const SPAWN_I = 32;
const SPAWN_J = 32;
const SPAWN_SAFE_RADIUS = 4;

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

function classifyTerrain(elevation: number, moisture: number): ServerTerrainKind {
  if (elevation < 0.31) return 'water';
  if (elevation > 0.76) return 'rock';
  if (elevation > 0.68 && moisture < 0.48) return 'snow';
  if (moisture > 0.67) return 'forest';
  if (moisture < 0.27) return 'sand';
  return 'grass';
}

export function getServerTerrainTile(i: number, j: number): ServerTile | null {
  if (!Number.isInteger(i) || !Number.isInteger(j)
    || i < 0 || j < 0 || i >= SERVER_WORLD_SIZE || j >= SERVER_WORLD_SIZE) return null;

  const distanceToSpawn = Math.hypot(i - SPAWN_I, j - SPAWN_J);
  const kind = distanceToSpawn <= SPAWN_SAFE_RADIUS
    ? 'grass'
    : classifyTerrain(
      fractalNoise(i, j, SERVER_WORLD_SEED, 28),
      fractalNoise(i + 137, j - 91, SERVER_WORLD_SEED + 7919, 20),
    );

  return { i, j, kind, walkable: kind !== 'water' && kind !== 'rock' };
}

/** Same one-cell bridge rule as web/src/world/bridges.ts. */
export function isServerBridgeTile(i: number, j: number): boolean {
  const tile = getServerTerrainTile(i, j);
  if (!tile || tile.kind !== 'water') return false;
  const west = getServerTerrainTile(i - 1, j);
  const east = getServerTerrainTile(i + 1, j);
  if (west?.walkable && east?.walkable) return true;
  const north = getServerTerrainTile(i, j - 1);
  const south = getServerTerrainTile(i, j + 1);
  return Boolean(north?.walkable && south?.walkable);
}

export function isServerTraversable(i: number, j: number): boolean {
  const tile = getServerTerrainTile(i, j);
  return Boolean(tile && (tile.walkable || isServerBridgeTile(i, j)));
}

export function validateServerMove(
  from: { x: number; y: number },
  to: { x: number; y: number },
): 'ok' | 'terrain_blocked' | 'invalid_step' {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx + dy !== 1) return 'invalid_step';
  if (!isServerTraversable(from.x, from.y) || !isServerTraversable(to.x, to.y)) {
    return 'terrain_blocked';
  }
  return 'ok';
}
