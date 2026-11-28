import type { ScreenPosition, WorldPosition } from './coordinates';
import type { IsometricCamera } from './isometricCamera';
import { projectWorldToScreen } from './isometricCamera';
import type { TerrainTile } from './terrain';
import type { SettlementStructureKind } from './settlements';
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

/** Stylized low-poly adventurer: layered faction armor, readable equipment and deterministic gait. */
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
  const armor: RGB = [0.19, 0.43, 0.70];
  const armorLight: RGB = [0.36, 0.64, 0.91];
  const armorDark: RGB = [0.10, 0.23, 0.39];
  const metal: RGB = [0.77, 0.70, 0.48];

  // Core silhouette and helmet.
  pushBox(output, { x, y, z: ground + 0.59 + bob }, { width: 0.35, depth: 0.29, height: 0.47 }, armor);
  pushBox(output, { x, y, z: ground + 0.98 + bob }, { width: 0.27, depth: 0.27, height: 0.27 }, [0.83, 0.72, 0.57]);
  pushBox(output, { x, y: y - 0.025, z: ground + 1.115 + bob }, { width: 0.30, depth: 0.29, height: 0.075 }, armorDark);
  pushBox(output, { x, y: y - 0.17, z: ground + 1.015 + bob }, { width: 0.17, depth: 0.035, height: 0.045 }, metal);

  // Shoulder plates, articulated arms and faction chest plate.
  pushBox(output, { x: x - 0.245, y, z: ground + 0.76 + bob }, { width: 0.19, depth: 0.30, height: 0.20 }, armorLight);
  pushBox(output, { x: x + 0.245, y, z: ground + 0.76 + bob }, { width: 0.19, depth: 0.30, height: 0.20 }, armorLight);
  pushBox(output, { x: x - 0.25, y: y + oppositeSwing, z: ground + 0.55 + bob }, { width: 0.115, depth: 0.14, height: 0.34 }, armorDark);
  pushBox(output, { x: x + 0.25, y: y + swing, z: ground + 0.55 + bob }, { width: 0.115, depth: 0.14, height: 0.34 }, armorDark);
  pushBox(output, { x, y: y - 0.155, z: ground + 0.62 + bob }, { width: 0.19, depth: 0.045, height: 0.25 }, armorLight);
  pushBox(output, { x, y: y - 0.185, z: ground + 0.62 + bob }, { width: 0.055, depth: 0.025, height: 0.16 }, metal);

  // Waist, greaves and boots retain the alternating gait phase.
  pushBox(output, { x, y, z: ground + 0.34 + bob * 0.35 }, { width: 0.32, depth: 0.27, height: 0.10 }, metal);
  pushBox(output, { x: x - 0.10, y: y + swing, z: ground + 0.17 + bob * 0.35 }, { width: 0.14, depth: 0.18, height: 0.30 }, armorDark);
  pushBox(output, { x: x + 0.10, y: y + oppositeSwing, z: ground + 0.17 + bob * 0.35 }, { width: 0.14, depth: 0.18, height: 0.30 }, armorDark);
  pushBox(output, { x: x - 0.10, y: y + swing - 0.025, z: ground + 0.055 }, { width: 0.16, depth: 0.25, height: 0.10 }, [0.12, 0.15, 0.20]);
  pushBox(output, { x: x + 0.10, y: y + oppositeSwing - 0.025, z: ground + 0.055 }, { width: 0.16, depth: 0.25, height: 0.10 }, [0.12, 0.15, 0.20]);
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

export type WorldDressingLod = 'high' | 'medium' | 'low';

/** Deterministic, biome-aware chunk decoration with distance-scaled density and geometry. */
export function buildWorldDressingMesh(
  tiles: readonly TerrainTile[],
  seed: number,
  options: { lod?: WorldDressingLod; includeVegetation?: boolean } = {},
): Float32Array {
  const output: number[] = [];
  const lod = options.lod ?? 'high';
  const densityScale = lod === 'high' ? 1 : lod === 'medium' ? 0.58 : 0.24;
  for (const tile of tiles) {
    const density = worldPlacementSample(seed, tile.i, tile.j, 'world-dressing-density');
    const variantSample = worldPlacementSample(seed, tile.i, tile.j, 'world-dressing-variant');
    let variant: VegetationVariant | null = null;
    if (tile.kind === 'forest' && density < 0.34 * densityScale) {
      variant = variantSample < 0.64 ? 'broadleaf' : 'conifer';
    } else if (tile.kind === 'grass' && density < 0.075 * densityScale) {
      variant = variantSample < 0.72 ? 'shrub' : 'broadleaf';
    } else if (tile.kind === 'snow' && density < 0.055 * densityScale) {
      variant = 'conifer';
    } else if (tile.kind === 'sand' && density < 0.025 * densityScale) {
      variant = 'shrub';
    }

    if (variant && options.includeVegetation !== false) {
      const simplifiedVariant = lod === 'low' ? 'shrub' : variant;
      const mesh = buildVegetationMesh(tile, simplifiedVariant, seed);
      for (const value of mesh) output.push(value);
    } else if (tile.kind === 'rock' && density < 0.12 * densityScale) {
      const x = tile.i + 0.5;
      const y = tile.j + 0.5;
      const z = terrainWorldHeight(tile) + 0.04;
      const scale = (0.65 + variantSample * 0.5) * (lod === 'low' ? 0.72 : 1);
      pushPyramid(output, { x, y, z }, 0.25 * scale, z, 0.42 * scale, [0.47, 0.49, 0.51]);
    }
  }
  return new Float32Array(output);
}


/**
 * Compact per-instance records: world position XYZ, uniform scale, RGB tint.
 * The GPU expands each record from one shared low-poly foliage template.
 */
export function buildVegetationInstances(
  tiles: readonly TerrainTile[],
  seed: number,
  options: { lod?: WorldDressingLod } = {},
): Float32Array {
  const lod = options.lod ?? 'high';
  const densityScale = lod === 'high' ? 1 : lod === 'medium' ? 0.58 : 0.24;
  const output: number[] = [];
  for (const tile of tiles) {
    const density = worldPlacementSample(seed, tile.i, tile.j, 'world-dressing-density');
    let tree = false;
    let shrub = false;
    if (tile.kind === 'forest' && density < 0.34 * densityScale) tree = true;
    else if (tile.kind === 'grass' && density < 0.075 * densityScale) {
      shrub = worldPlacementSample(seed, tile.i, tile.j, 'world-dressing-variant') < 0.72;
      tree = !shrub;
    } else if (tile.kind === 'snow' && density < 0.055 * densityScale) tree = true;
    else if (tile.kind === 'sand' && density < 0.025 * densityScale) shrub = true;
    if (!tree && !shrub) continue;

    const x = tile.i + 0.25 + worldPlacementSample(seed, tile.i, tile.j, 'vegetation-x') * 0.5;
    const y = tile.j + 0.25 + worldPlacementSample(seed, tile.i, tile.j, 'vegetation-y') * 0.5;
    const z = terrainWorldHeight(tile) + 0.02;
    const style = getBiomeStyle(vegetationBiome(tile));
    const lodScale = lod === 'low' ? 0.62 : lod === 'medium' ? 0.86 : 1;
    const scale = lodScale * (shrub ? 0.62 : 1);
    output.push(x, y, z, scale, style.foliage[0], style.foliage[1], style.foliage[2]);
  }
  return new Float32Array(output);
}

/** Shared local-space low-poly foliage template; each instance applies XYZ translation and scale. */
export function buildVegetationInstanceTemplate(): Float32Array {
  const output: number[] = [];
  const center = { x: 0, y: 0, z: 0 };
  pushPyramid(output, center, 0.48, 0, 0.78, [1, 1, 1]);
  pushPyramid(output, center, 0.34, 0.48, 0.72, [0.82, 0.92, 0.82]);
  return new Float32Array(output);
}



/** Compact settlement lot mesh; gameplay identity remains in settlements.ts. */
export function buildSettlementStructureMesh(
  tile: TerrainTile,
  kind: SettlementStructureKind,
): Float32Array {
  const output: number[] = [];
  const x = tile.i + 0.5;
  const y = tile.j + 0.5;
  const z = terrainWorldHeight(tile) + 0.025;
  const wall: RGB = kind === 'hall' ? [0.62, 0.55, 0.40]
    : kind === 'market' ? [0.66, 0.43, 0.24]
    : kind === 'workshop' ? [0.43, 0.48, 0.52]
    : kind === 'watchpost' ? [0.39, 0.48, 0.43]
    : [0.58, 0.49, 0.39];
  const roof: RGB = kind === 'hall' ? [0.34, 0.42, 0.53]
    : kind === 'market' ? [0.68, 0.31, 0.19]
    : kind === 'workshop' ? [0.28, 0.33, 0.37]
    : kind === 'watchpost' ? [0.29, 0.37, 0.32]
    : [0.43, 0.30, 0.23];
  pushBox(output, { x, y, z: z + 0.08 }, { width: 0.94, depth: 0.88, height: 0.16 }, [0.30, 0.31, 0.30]);
  const bodyHeight = kind === 'watchpost' ? 0.92 : kind === 'hall' ? 0.78 : 0.62;
  pushBox(output, { x, y, z: z + 0.16 + bodyHeight / 2 }, {
    width: kind === 'hall' ? 0.72 : 0.68,
    depth: kind === 'workshop' ? 0.62 : 0.68,
    height: bodyHeight,
  }, wall);
  if (kind === 'watchpost') {
    pushBox(output, { x, y, z: z + 0.16 + bodyHeight + 0.10 }, { width: 0.92, depth: 0.92, height: 0.20 }, roof);
    pushPyramid(output, { x, y, z: z + 1.18 }, 0.50, z + 1.18, 0.42, roof);
  } else {
    pushPyramid(output, { x, y, z: z + 0.16 + bodyHeight }, 0.49, z + 0.16 + bodyHeight, 0.46, roof);
  }
  const doorColor: RGB = [0.20, 0.16, 0.12];
  pushBox(output, { x, y: y - 0.345, z: z + 0.28 }, { width: 0.20, depth: 0.035, height: 0.40 }, doorColor);
  if (kind === 'market') {
    pushBox(output, { x: x + 0.43, y, z: z + 0.35 }, { width: 0.22, depth: 0.52, height: 0.08 }, [0.76, 0.63, 0.34]);
  } else if (kind === 'workshop') {
    pushBox(output, { x: x + 0.40, y: y + 0.12, z: z + 0.28 }, { width: 0.16, depth: 0.18, height: 0.28 }, [0.25, 0.29, 0.32]);
  }
  return new Float32Array(output);
}

export type LandmarkKind = 'watchtower' | 'shrine' | 'ruins' | 'gate';

/** Modular low-poly landmark kits; visual-only geometry, never changes navigation. */
export function buildLandmarkMesh(tile: TerrainTile, kind: LandmarkKind): Float32Array {
  const output: number[] = [];
  const x = tile.i + 0.5;
  const y = tile.j + 0.5;
  const z = terrainWorldHeight(tile) + 0.025;
  const stone: RGB = [0.49, 0.50, 0.48];
  const darkStone: RGB = [0.31, 0.34, 0.35];
  const accent: RGB = kind === 'shrine' ? [0.72, 0.48, 0.24]
    : kind === 'gate' ? [0.31, 0.48, 0.62] : [0.58, 0.34, 0.25];

  if (kind === 'watchtower') {
    pushBox(output, { x, y, z: z + 0.08 }, { width: 1.25, depth: 1.20, height: 0.16 }, darkStone);
    pushBox(output, { x, y, z: z + 0.92 }, { width: 0.76, depth: 0.76, height: 1.52 }, stone);
    pushBox(output, { x, y, z: z + 1.73 }, { width: 1.02, depth: 1.02, height: 0.18 }, accent);
    pushPyramid(output, { x, y, z: z + 1.82 }, 0.56, z + 1.82, 0.76, darkStone);
  } else if (kind === 'shrine') {
    pushBox(output, { x, y, z: z + 0.09 }, { width: 1.34, depth: 1.20, height: 0.18 }, darkStone);
    pushBox(output, { x, y: y + 0.04, z: z + 0.55 }, { width: 0.70, depth: 0.62, height: 0.88 }, stone);
    pushBox(output, { x: x - 0.42, y, z: z + 0.48 }, { width: 0.12, depth: 0.76, height: 0.82 }, accent);
    pushBox(output, { x: x + 0.42, y, z: z + 0.48 }, { width: 0.12, depth: 0.76, height: 0.82 }, accent);
    pushPyramid(output, { x, y, z: z + 1.00 }, 0.56, z + 1.00, 0.58, darkStone);
  } else if (kind === 'ruins') {
    pushBox(output, { x, y, z: z + 0.07 }, { width: 1.32, depth: 1.18, height: 0.14 }, darkStone);
    pushBox(output, { x: x - 0.39, y, z: z + 0.46 }, { width: 0.22, depth: 0.92, height: 0.78 }, stone);
    pushBox(output, { x: x + 0.39, y: y + 0.08, z: z + 0.34 }, { width: 0.22, depth: 0.72, height: 0.54 }, stone);
    pushBox(output, { x: x - 0.08, y: y - 0.40, z: z + 0.83 }, { width: 0.86, depth: 0.18, height: 0.16 }, accent);
  } else {
    pushBox(output, { x, y, z: z + 0.07 }, { width: 1.42, depth: 1.08, height: 0.14 }, darkStone);
    pushBox(output, { x: x - 0.43, y, z: z + 0.66 }, { width: 0.22, depth: 0.30, height: 1.18 }, stone);
    pushBox(output, { x: x + 0.43, y, z: z + 0.66 }, { width: 0.22, depth: 0.30, height: 1.18 }, stone);
    pushBox(output, { x, y, z: z + 1.27 }, { width: 1.12, depth: 0.36, height: 0.20 }, accent);
  }
  return new Float32Array(output);
}



export type RoadCoordinate = { i: number; j: number };

/** Low-profile stylized road strips for a cardinal navigation path. Visual only. */
export function buildRoadMesh(
  tiles: readonly TerrainTile[],
  route: readonly RoadCoordinate[],
): Float32Array {
  const output: number[] = [];
  const byKey = new Map(tiles.map(tile => [tile.i + ':' + tile.j, tile]));
  const roadColors: Partial<Record<TerrainTile['kind'], RGB>> = {
    grass: [0.48, 0.39, 0.27],
    forest: [0.35, 0.29, 0.22],
    sand: [0.69, 0.54, 0.34],
    snow: [0.62, 0.67, 0.69],
  };
  const valid = route.map(point => byKey.get(point.i + ':' + point.j) ?? null);
  for (let index = 0; index < route.length; index++) {
    const point = route[index];
    const tile = valid[index];
    if (!tile?.walkable) continue;
    const ground = terrainWorldHeight(tile) + 0.026;
    const color = roadColors[tile.kind] ?? [0.42, 0.34, 0.25];
    pushBox(output, { x: point.i + 0.5, y: point.j + 0.5, z: ground }, {
      width: 0.42, depth: 0.42, height: 0.035,
    }, color);

    const nextPoint = route[index + 1];
    const nextTile = valid[index + 1];
    if (!nextPoint || !nextTile?.walkable) continue;
    const di = nextPoint.i - point.i;
    const dj = nextPoint.j - point.j;
    if (Math.abs(di) + Math.abs(dj) !== 1) continue;
    if (Math.abs(tile.elevation - nextTile.elevation) > 1) continue;
    const nextGround = terrainWorldHeight(nextTile) + 0.026;
    const midpointZ = (ground + nextGround) / 2;
    pushBox(output, {
      x: point.i + 0.5 + di * 0.5,
      y: point.j + 0.5 + dj * 0.5,
      z: midpointZ,
    }, {
      width: di !== 0 ? 1.04 : 0.42,
      depth: dj !== 0 ? 1.04 : 0.42,
      height: 0.035,
    }, color);
  }
  return new Float32Array(output);
}

/** Vertical exposed faces where a tile is higher than its cardinal neighbor. */
export function buildTerrainCliffMesh(tiles: readonly TerrainTile[]): Float32Array {
  const output: number[] = [];
  const byKey = new Map(tiles.map(tile => [tile.i + ':' + tile.j, tile]));
  const directions = [
    { di: 0, dj: -1, edge: 'north' },
    { di: 1, dj: 0, edge: 'east' },
    { di: 0, dj: 1, edge: 'south' },
    { di: -1, dj: 0, edge: 'west' },
  ] as const;

  for (const tile of tiles) {
    const highZ = terrainWorldHeight(tile);
    for (const direction of directions) {
      const neighbor = byKey.get((tile.i + direction.di) + ':' + (tile.j + direction.dj));
      if (!neighbor || tile.elevation <= neighbor.elevation) continue;
      const lowZ = terrainWorldHeight(neighbor);
      const color = shade(TERRAIN_PALETTE[tile.kind], 0.50);
      let a: WorldPosition;
      let b: WorldPosition;
      if (direction.edge === 'north') {
        a = { x: tile.i, y: tile.j, z: lowZ };
        b = { x: tile.i + 1, y: tile.j, z: lowZ };
      } else if (direction.edge === 'east') {
        a = { x: tile.i + 1, y: tile.j, z: lowZ };
        b = { x: tile.i + 1, y: tile.j + 1, z: lowZ };
      } else if (direction.edge === 'south') {
        a = { x: tile.i + 1, y: tile.j + 1, z: lowZ };
        b = { x: tile.i, y: tile.j + 1, z: lowZ };
      } else {
        a = { x: tile.i, y: tile.j + 1, z: lowZ };
        b = { x: tile.i, y: tile.j, z: lowZ };
      }
      const topA = { ...a, z: highZ };
      const topB = { ...b, z: highZ };
      pushQuad(output, a, b, topB, topA, color);
    }
  }
  return new Float32Array(output);
}

/**
 * One-cell visual bridge span between two walkable banks with one water tile between.
 * This mesh is intentionally visual-only: navigation/collision must be implemented separately.
 */
export function buildBridgeMesh(
  start: TerrainTile,
  water: TerrainTile,
  end: TerrainTile,
): Float32Array {
  const output: number[] = [];
  const dx = end.i - start.i;
  const dy = end.j - start.j;
  const straightSpan = (Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0);
  if (!straightSpan || water.kind !== 'water' || !start.walkable || !end.walkable) return new Float32Array();
  const sameRow = dy === 0;
  const aligned = sameRow
    ? water.j === start.j && water.j === end.j && water.i === (start.i + end.i) / 2
    : water.i === start.i && water.i === end.i && water.j === (start.j + end.j) / 2;
  if (!aligned) return new Float32Array();
  const deckZ = Math.max(terrainWorldHeight(start), terrainWorldHeight(end)) + 0.12;
  const center = { x: water.i + 0.5, y: water.j + 0.5, z: deckZ };
  pushBox(output, center, {
    width: sameRow ? 2.02 : 0.56,
    depth: sameRow ? 0.56 : 2.02,
    height: 0.12,
  }, [0.43, 0.32, 0.22]);
  for (const side of [-1, 1]) {
    pushBox(output, {
      x: center.x + (sameRow ? 0 : side * 0.25),
      y: center.y + (sameRow ? side * 0.25 : 0),
      z: deckZ + 0.18,
    }, {
      width: sameRow ? 2.02 : 0.07,
      depth: sameRow ? 0.07 : 2.02,
      height: 0.36,
    }, [0.31, 0.34, 0.35]);
  }
  for (const bank of [start, end]) {
    pushBox(output, {
      x: bank.i + 0.5, y: bank.j + 0.5, z: (terrainWorldHeight(bank) + deckZ) / 2,
    }, { width: 0.12, depth: 0.12, height: Math.max(0.12, deckZ - terrainWorldHeight(bank)) }, [0.36, 0.37, 0.37]);
  }
  return new Float32Array(output);
}
