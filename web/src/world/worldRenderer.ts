import type { ScreenPosition, WorldPosition } from './coordinates';
import type { IsometricCamera } from './isometricCamera';
import { projectWorldToScreen } from './isometricCamera';
import type { TerrainTile } from './terrain';
import { STYLIZED_TERRAIN_PALETTE } from './worldStyle';
import type { RGB as WorldRGB } from './worldStyle';
import { getBiomeStyle, worldPlacementSample } from './worldStyle';

export type RGB = WorldRGB;

export const TERRAIN_PALETTE: Readonly<Record<TerrainTile['kind'], RGB>> = STYLIZED_TERRAIN_PALETTE;

const TERRAIN_HEIGHT_SCALE = 0.12;
const TILE_INSET = 0.035;
const TILE_BASE_DEPTH = 0.10;

export function terrainWorldHeight(tile: Pick<TerrainTile, 'elevation'>): number {
  return tile.elevation * TERRAIN_HEIGHT_SCALE;
}

function shade(color: RGB, factor: number): RGB {
  return [
    Math.max(0, Math.min(1, color[0] * factor)),
    Math.max(0, Math.min(1, color[1] * factor)),
    Math.max(0, Math.min(1, color[2] * factor)),
  ];
}

function pushTriangle(
  output: number[],
  a: WorldPosition,
  b: WorldPosition,
  c: WorldPosition,
  color: RGB,
): void {
  for (const point of [a, b, c]) output.push(point.x, point.y, point.z, color[0], color[1], color[2]);
}

function pushQuad(
  output: number[],
  a: WorldPosition,
  b: WorldPosition,
  c: WorldPosition,
  d: WorldPosition,
  color: RGB,
): void {
  pushTriangle(output, a, b, c, color);
  pushTriangle(output, a, c, d, color);
}

/** Create top faces and four shallow vertical sides for every terrain tile. */
export function buildTerrainMesh(tiles: readonly TerrainTile[]): Float32Array {
  const output: number[] = [];
  for (const tile of tiles) {
    const left = tile.i + TILE_INSET;
    const right = tile.i + 1 - TILE_INSET;
    const front = tile.j + TILE_INSET;
    const back = tile.j + 1 - TILE_INSET;
    const topZ = terrainWorldHeight(tile);
    const bottomZ = topZ - TILE_BASE_DEPTH;
    const a = { x: left, y: front, z: topZ };
    const b = { x: right, y: front, z: topZ };
    const c = { x: right, y: back, z: topZ };
    const d = { x: left, y: back, z: topZ };
    const a0 = { ...a, z: bottomZ };
    const b0 = { ...b, z: bottomZ };
    const c0 = { ...c, z: bottomZ };
    const d0 = { ...d, z: bottomZ };
    const base = TERRAIN_PALETTE[tile.kind];

    pushQuad(output, a, b, c, d, base);
    pushQuad(output, a0, a, d, d0, shade(base, 0.48));
    pushQuad(output, b0, b, a, a0, shade(base, 0.58));
    pushQuad(output, c0, c, b, b0, shade(base, 0.68));
    pushQuad(output, d0, d, c, c0, shade(base, 0.54));
  }
  return new Float32Array(output);
}

function pushBox(
  output: number[],
  center: WorldPosition,
  size: { width: number; depth: number; height: number },
  color: RGB,
): void {
  const x0 = center.x - size.width / 2;
  const x1 = center.x + size.width / 2;
  const y0 = center.y - size.depth / 2;
  const y1 = center.y + size.depth / 2;
  const z0 = center.z - size.height / 2;
  const z1 = center.z + size.height / 2;
  const a = { x: x0, y: y0, z: z0 };
  const b = { x: x1, y: y0, z: z0 };
  const c = { x: x1, y: y1, z: z0 };
  const d = { x: x0, y: y1, z: z0 };
  const e = { x: x0, y: y0, z: z1 };
  const f = { x: x1, y: y0, z: z1 };
  const g = { x: x1, y: y1, z: z1 };
  const h = { x: x0, y: y1, z: z1 };
  pushQuad(output, e, f, g, h, color);
  pushQuad(output, a, b, f, e, shade(color, 0.72));
  pushQuad(output, b, c, g, f, shade(color, 0.58));
  pushQuad(output, c, d, h, g, shade(color, 0.66));
  pushQuad(output, d, a, e, h, shade(color, 0.82));
  pushQuad(output, d, c, b, a, shade(color, 0.42));
}

export type AvatarAnimation = {
  /** World-space center coordinates; defaults to the center of the supplied tile. */
  x?: number;
  y?: number;
  /** Ground elevation in world units; defaults to the supplied tile elevation. */
  groundZ?: number;
  /** Gait phase in radians. */
  phase?: number;
  /** Blend from idle (0) to full locomotion (1). */
  walkAmount?: number;
};

/** Low-poly humanoid with deterministic procedural arm/leg swing and body bob. */
export function buildAvatarMesh(tile: TerrainTile, animation: AvatarAnimation = {}): Float32Array {
  const output: number[] = [];
  const x = animation.x ?? tile.i + 0.5;
  const y = animation.y ?? tile.j + 0.5;
  const ground = (animation.groundZ ?? terrainWorldHeight(tile)) + 0.015;
  const walk = Math.max(0, Math.min(1, animation.walkAmount ?? 0));
  const phase = animation.phase ?? 0;
  const swing = Math.sin(phase) * 0.13 * walk;
  const oppositeSwing = -swing;
  const bob = Math.abs(Math.sin(phase * 2)) * 0.035 * walk;
  pushBox(output, { x, y, z: ground + 0.58 + bob }, { width: 0.34, depth: 0.28, height: 0.48 }, [0.24, 0.62, 0.96]);
  pushBox(output, { x, y, z: ground + 0.96 + bob }, { width: 0.27, depth: 0.27, height: 0.27 }, [0.91, 0.78, 0.62]);
  pushBox(output, { x: x - 0.23, y: y + oppositeSwing, z: ground + 0.59 + bob }, { width: 0.12, depth: 0.14, height: 0.42 }, [0.18, 0.43, 0.77]);
  pushBox(output, { x: x + 0.23, y: y + swing, z: ground + 0.59 + bob }, { width: 0.12, depth: 0.14, height: 0.42 }, [0.18, 0.43, 0.77]);
  pushBox(output, { x: x - 0.10, y: y + swing, z: ground + 0.20 + bob * 0.35 }, { width: 0.13, depth: 0.17, height: 0.34 }, [0.13, 0.19, 0.29]);
  pushBox(output, { x: x + 0.10, y: y + oppositeSwing, z: ground + 0.20 + bob * 0.35 }, { width: 0.13, depth: 0.17, height: 0.34 }, [0.13, 0.19, 0.29]);
  return new Float32Array(output);
}

export function pickNearestTerrainTile(
  screen: ScreenPosition,
  tiles: readonly TerrainTile[],
  camera: IsometricCamera,
  maxDistancePixels = 18,
): TerrainTile | null {
  let nearest: TerrainTile | null = null;
  let nearestDistance = maxDistancePixels;
  for (const tile of tiles) {
    const center: WorldPosition = {
      x: tile.i + 0.5,
      y: tile.j + 0.5,
      z: terrainWorldHeight(tile) + 0.015,
    };
    const projected = projectWorldToScreen(center, camera);
    const distance = Math.hypot(projected.x - screen.x, projected.y - screen.y);
    if (distance < nearestDistance) {
      nearest = tile;
      nearestDistance = distance;
    }
  }
  return nearest;
}


export type WorldActorVisual = {
  id: string;
  x: number;
  y: number;
  faction: 'Aegis' | 'Nomads' | 'Eclipse' | 'Neutral';
  role?: 'guard' | 'scout' | 'mystic' | 'merchant';
  activity?: string;
};

const FACTION_COLORS: Record<WorldActorVisual['faction'], RGB> = {
  Aegis: [0.25, 0.68, 0.96],
  Nomads: [0.88, 0.62, 0.27],
  Eclipse: [0.67, 0.40, 0.92],
  Neutral: [0.70, 0.76, 0.82],
};

/** Stable per-actor phase offset; independent of render order and frame rate. */
export function npcAnimationPhase(actorId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < actorId.length; index++) {
    hash ^= actorId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

export type NpcAnimation = { phase?: number; amount?: number; x?: number; y?: number; groundZ?: number };

/** Build a compact humanoid faction NPC with faction-coded armor and procedural idle/patrol gait. */
export function buildNpcMesh(actor: WorldActorVisual, groundTile: TerrainTile, animation: NpcAnimation = {}): Float32Array {
  const output: number[] = [];
  const x = (animation.x ?? actor.x) + 0.5;
  const y = (animation.y ?? actor.y) + 0.5;
  const z = (animation.groundZ ?? terrainWorldHeight(groundTile)) + 0.015;
  const armor = FACTION_COLORS[actor.faction];
  const cloth: RGB = actor.role === 'mystic' ? [0.24, 0.16, 0.42] : [0.15, 0.20, 0.28];
  const amount = Math.max(0, Math.min(1, animation.amount ?? 0));
  const swing = Math.sin(animation.phase ?? 0) * 0.11 * amount;
  const bob = Math.abs(Math.sin((animation.phase ?? 0) * 2)) * 0.025 * amount;
  pushBox(output, { x, y, z: z + 0.52 + bob }, { width: 0.28, depth: 0.24, height: 0.43 }, armor);
  pushBox(output, { x, y, z: z + 0.88 + bob }, { width: 0.23, depth: 0.23, height: 0.22 }, [0.82, 0.68, 0.53]);
  pushBox(output, { x: x - 0.19, y: y - swing, z: z + 0.52 + bob }, { width: 0.10, depth: 0.12, height: 0.36 }, shade(armor, 0.78));
  pushBox(output, { x: x + 0.19, y: y + swing, z: z + 0.52 + bob }, { width: 0.10, depth: 0.12, height: 0.36 }, shade(armor, 0.78));
  pushBox(output, { x: x - 0.085, y: y + swing, z: z + 0.18 + bob * 0.3 }, { width: 0.11, depth: 0.13, height: 0.28 }, cloth);
  pushBox(output, { x: x + 0.085, y: y - swing, z: z + 0.18 + bob * 0.3 }, { width: 0.11, depth: 0.13, height: 0.28 }, cloth);
  return new Float32Array(output);
}

/** Low-poly POI structure: platform, walls and a roof/canopy. */
export function buildPoiBuildingMesh(tile: TerrainTile, variant = 0): Float32Array {
  const output: number[] = [];
  const x = tile.i + 0.5;
  const y = tile.j + 0.5;
  const z = terrainWorldHeight(tile) + 0.02;
  const wall: RGB = variant % 2 === 0 ? [0.42, 0.48, 0.56] : [0.48, 0.38, 0.27];
  const roof: RGB = variant % 2 === 0 ? [0.24, 0.36, 0.54] : [0.58, 0.30, 0.20];
  pushBox(output, { x, y, z: z + 0.08 }, { width: 1.25, depth: 1.05, height: 0.16 }, [0.30, 0.34, 0.39]);
  pushBox(output, { x, y, z: z + 0.48 }, { width: 0.88, depth: 0.78, height: 0.68 }, wall);
  pushBox(output, { x, y, z: z + 0.91 }, { width: 1.08, depth: 0.94, height: 0.16 }, roof);
  pushBox(output, { x: x + 0.23, y: y - 0.40, z: z + 0.62 }, { width: 0.12, depth: 0.10, height: 0.35 }, [0.80, 0.69, 0.43]);
  return new Float32Array(output);
}

/** Visible event marker; high-intensity events receive a larger beacon. */
export function buildEventBeaconMesh(tile: TerrainTile, intensity: number): Float32Array {
  const output: number[] = [];
  const x = tile.i + 0.5;
  const y = tile.j + 0.5;
  const z = terrainWorldHeight(tile) + 0.04;
  const scale = intensity >= 4 ? 1.35 : 1;
  const color: RGB = intensity >= 4 ? [0.98, 0.24, 0.20] : [0.96, 0.67, 0.22];
  pushBox(output, { x, y, z: z + 0.10 }, { width: 0.72, depth: 0.72, height: 0.16 }, shade(color, 0.55));
  pushBox(output, { x, y, z: z + 0.52 * scale }, { width: 0.22 * scale, depth: 0.22 * scale, height: 0.72 * scale }, color);
  pushBox(output, { x, y, z: z + 0.96 * scale }, { width: 0.42 * scale, depth: 0.42 * scale, height: 0.14 }, [1, 0.86, 0.48]);
  return new Float32Array(output);
}

/** Boss marker uses a larger dark sentinel silhouette and a red crest. */
export function buildBossMesh(tile: TerrainTile): Float32Array {
  const output: number[] = [];
  const x = tile.i + 0.5;
  const y = tile.j + 0.5;
  const z = terrainWorldHeight(tile) + 0.02;
  const armor: RGB = [0.28, 0.12, 0.19];
  pushBox(output, { x, y, z: z + 0.82 }, { width: 0.66, depth: 0.52, height: 0.88 }, armor);
  pushBox(output, { x, y, z: z + 1.47 }, { width: 0.44, depth: 0.42, height: 0.38 }, [0.55, 0.18, 0.20]);
  pushBox(output, { x: x - 0.43, y, z: z + 0.82 }, { width: 0.20, depth: 0.22, height: 0.76 }, [0.42, 0.18, 0.24]);
  pushBox(output, { x: x + 0.43, y, z: z + 0.82 }, { width: 0.20, depth: 0.22, height: 0.76 }, [0.42, 0.18, 0.24]);
  pushBox(output, { x: x - 0.19, y, z: z + 0.25 }, { width: 0.20, depth: 0.24, height: 0.48 }, [0.16, 0.16, 0.22]);
  pushBox(output, { x: x + 0.19, y, z: z + 0.25 }, { width: 0.20, depth: 0.24, height: 0.48 }, [0.16, 0.16, 0.22]);
  pushBox(output, { x, y: y - 0.03, z: z + 1.78 }, { width: 0.18, depth: 0.18, height: 0.48 }, [0.96, 0.18, 0.16]);
  return new Float32Array(output);
}

/** Deterministic weather particles; callers animate their offset over time. */
export function buildWeatherParticleMesh(
  seed: number,
  kind: 'mist' | 'storm' | 'frost',
  count = 72,
): Float32Array {
  const output: number[] = [];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const color: RGB = kind === 'storm' ? [0.36, 0.56, 0.78]
    : kind === 'frost' ? [0.76, 0.87, 0.98] : [0.52, 0.68, 0.78];
  for (let index = 0; index < count; index++) {
    const x = random() * 64;
    const y = random() * 64;
    const z = 1.5 + random() * 4;
    const size = kind === 'storm' ? 0.035 : kind === 'frost' ? 0.075 : 0.12;
    pushBox(output, { x, y, z }, {
      width: kind === 'storm' ? size : size * 1.2,
      depth: kind === 'storm' ? size * 3.8 : size * 1.2,
      height: kind === 'storm' ? size * 0.55 : size * 1.2,
    }, color);
  }
  return new Float32Array(output);
}


export type VegetationVariant = 'broadleaf' | 'conifer' | 'shrub';

function pushPyramid(
  output: number[],
  center: WorldPosition,
  radius: number,
  baseZ: number,
  height: number,
  color: RGB,
): void {
  const a = { x: center.x - radius, y: center.y - radius, z: baseZ };
  const b = { x: center.x + radius, y: center.y - radius, z: baseZ };
  const c = { x: center.x + radius, y: center.y + radius, z: baseZ };
  const d = { x: center.x - radius, y: center.y + radius, z: baseZ };
  const apex = { x: center.x, y: center.y, z: baseZ + height };
  pushTriangle(output, a, b, apex, shade(color, 0.92));
  pushTriangle(output, b, c, apex, shade(color, 0.72));
  pushTriangle(output, c, d, apex, shade(color, 0.84));
  pushTriangle(output, d, a, apex, color);
}

function vegetationBiome(tile: TerrainTile): 'temperate_grassland' | 'temperate_forest' | 'arid' | 'alpine' {
  if (tile.kind === 'forest') return 'temperate_forest';
  if (tile.kind === 'sand') return 'arid';
  if (tile.kind === 'snow') return 'alpine';
  return 'temperate_grassland';
}

/** Procedural low-poly vegetation; placement is stable for seed + absolute tile + family. */
export function buildVegetationMesh(
  tile: TerrainTile,
  variant: VegetationVariant = 'broadleaf',
  seed = 0,
): Float32Array {
  const output: number[] = [];
  const x = tile.i + 0.25 + worldPlacementSample(seed, tile.i, tile.j, 'vegetation-x') * 0.5;
  const y = tile.j + 0.25 + worldPlacementSample(seed, tile.i, tile.j, 'vegetation-y') * 0.5;
  const ground = terrainWorldHeight(tile) + 0.02;
  const style = getBiomeStyle(vegetationBiome(tile));

  if (variant === 'shrub') {
    pushPyramid(output, { x, y, z: ground }, 0.24, ground, 0.58, style.foliage);
  } else {
    pushBox(output, { x, y, z: ground + 0.42 }, {
      width: 0.13, depth: 0.13, height: 0.84,
    }, [0.35, 0.22, 0.13]);
    if (variant === 'conifer') {
      pushPyramid(output, { x, y, z: ground }, 0.48, ground + 0.35, 0.95, style.foliage);
      pushPyramid(output, { x, y, z: ground }, 0.36, ground + 0.88, 0.82, style.foliageShadow);
      pushPyramid(output, { x, y, z: ground }, 0.22, ground + 1.34, 0.66, style.foliage);
    } else {
      pushPyramid(output, { x, y, z: ground }, 0.52, ground + 0.55, 1.15, style.foliage);
      pushPyramid(output, { x: x + 0.08, y: y - 0.04, z: ground }, 0.32, ground + 1.05, 0.72, style.foliageShadow);
    }
  }
  return new Float32Array(output);
}

/** Deterministic, biome-aware decorative geometry for a sector. */
export function buildWorldDressingMesh(tiles: readonly TerrainTile[], seed: number): Float32Array {
  const output: number[] = [];
  for (const tile of tiles) {
    const density = worldPlacementSample(seed, tile.i, tile.j, 'world-dressing-density');
    const variantSample = worldPlacementSample(seed, tile.i, tile.j, 'world-dressing-variant');
    let variant: VegetationVariant | null = null;
    if (tile.kind === 'forest' && density < 0.34) {
      variant = variantSample < 0.64 ? 'broadleaf' : 'conifer';
    } else if (tile.kind === 'grass' && density < 0.075) {
      variant = variantSample < 0.72 ? 'shrub' : 'broadleaf';
    } else if (tile.kind === 'snow' && density < 0.055) {
      variant = 'conifer';
    } else if (tile.kind === 'sand' && density < 0.025) {
      variant = 'shrub';
    }

    if (variant) {
      const mesh = buildVegetationMesh(tile, variant, seed);
      for (const value of mesh) output.push(value);
    } else if (tile.kind === 'rock' && density < 0.12) {
      const x = tile.i + 0.5;
      const y = tile.j + 0.5;
      const z = terrainWorldHeight(tile) + 0.04;
      const scale = 0.65 + variantSample * 0.5;
      pushPyramid(output, { x, y, z }, 0.25 * scale, z, 0.42 * scale, [0.47, 0.49, 0.51]);
    }
  }
  return new Float32Array(output);
}
