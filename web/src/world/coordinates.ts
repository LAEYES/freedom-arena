/**
 * Freedom Arena — canonical world coordinate transforms.
 *
 * Grid coordinates are tile indices. World coordinates are expressed in
 * configurable world units. Screen coordinates are renderer-only values.
 * No rendering or browser dependency is required by this module.
 */

export type TileCoordinate = {
  i: number;
  j: number;
  elevation?: number;
};

export type WorldPosition = {
  x: number;
  y: number;
  z: number;
};

export type ScreenPosition = {
  x: number;
  y: number;
};

export type WorldBounds = {
  width: number;
  height: number;
};

export type WorldGridConfig = {
  /** World units per logical tile along the i axis. */
  cellWidth: number;
  /** World units per logical tile along the j axis. */
  cellDepth: number;
  /** World units per elevation level. */
  elevationUnit: number;
  /** Horizontal pixel width of one isometric tile. */
  screenTileWidth: number;
  /** Vertical pixel height of one isometric tile. */
  screenTileHeight: number;
  /** Vertical pixels per world elevation unit. */
  elevationPixels: number;
  /** Screen-space origin of the isometric projection. */
  originX: number;
  originY: number;
};

export const DEFAULT_WORLD_GRID_CONFIG: Readonly<WorldGridConfig> = Object.freeze({
  cellWidth: 1,
  cellDepth: 1,
  elevationUnit: 1,
  screenTileWidth: 64,
  screenTileHeight: 32,
  elevationPixels: 16,
  originX: 0,
  originY: 0,
});

export const DEFAULT_WORLD_BOUNDS: Readonly<WorldBounds> = Object.freeze({
  width: 64,
  height: 64,
});

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(label + ' must be a finite number');
  }
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0) throw new RangeError(label + ' must be greater than zero');
}

export function validateWorldGridConfig(config: WorldGridConfig): void {
  assertPositive(config.cellWidth, 'cellWidth');
  assertPositive(config.cellDepth, 'cellDepth');
  assertPositive(config.elevationUnit, 'elevationUnit');
  assertPositive(config.screenTileWidth, 'screenTileWidth');
  assertPositive(config.screenTileHeight, 'screenTileHeight');
  assertFinite(config.elevationPixels, 'elevationPixels');
  assertFinite(config.originX, 'originX');
  assertFinite(config.originY, 'originY');
}

export function gridToWorld(
  tile: TileCoordinate,
  config: WorldGridConfig = DEFAULT_WORLD_GRID_CONFIG,
): WorldPosition {
  validateWorldGridConfig(config);
  assertFinite(tile.i, 'tile.i');
  assertFinite(tile.j, 'tile.j');
  const elevation = tile.elevation ?? 0;
  assertFinite(elevation, 'tile.elevation');

  return {
    x: tile.i * config.cellWidth,
    y: tile.j * config.cellDepth,
    z: elevation * config.elevationUnit,
  };
}

/** Convert continuous world coordinates to continuous tile-grid coordinates. */
export function worldToGrid(
  world: WorldPosition,
  config: WorldGridConfig = DEFAULT_WORLD_GRID_CONFIG,
): { i: number; j: number; elevation: number } {
  validateWorldGridConfig(config);
  assertFinite(world.x, 'world.x');
  assertFinite(world.y, 'world.y');
  assertFinite(world.z, 'world.z');

  return {
    i: world.x / config.cellWidth,
    j: world.y / config.cellDepth,
    elevation: world.z / config.elevationUnit,
  };
}

/** Snap a world position to the nearest logical tile. */
export function worldToTile(
  world: WorldPosition,
  config: WorldGridConfig = DEFAULT_WORLD_GRID_CONFIG,
): TileCoordinate {
  const grid = worldToGrid(world, config);
  return {
    i: Math.round(grid.i),
    j: Math.round(grid.j),
    elevation: Math.round(grid.elevation),
  };
}

/** Project world coordinates to a diamond/isometric screen plane. */
export function worldToScreen(
  world: WorldPosition,
  config: WorldGridConfig = DEFAULT_WORLD_GRID_CONFIG,
): ScreenPosition {
  validateWorldGridConfig(config);
  assertFinite(world.x, 'world.x');
  assertFinite(world.y, 'world.y');
  assertFinite(world.z, 'world.z');

  const i = world.x / config.cellWidth;
  const j = world.y / config.cellDepth;
  return {
    x: config.originX + (i - j) * (config.screenTileWidth / 2),
    y: config.originY
      + (i + j) * (config.screenTileHeight / 2)
      - world.z * config.elevationPixels,
  };
}

/**
 * Inverse projection. The world elevation is required because a 2D screen
 * point alone cannot distinguish a planar position from a raised tile.
 */
export function screenToWorld(
  screen: ScreenPosition,
  elevation = 0,
  config: WorldGridConfig = DEFAULT_WORLD_GRID_CONFIG,
): WorldPosition {
  validateWorldGridConfig(config);
  assertFinite(screen.x, 'screen.x');
  assertFinite(screen.y, 'screen.y');
  assertFinite(elevation, 'elevation');

  const horizontal = (screen.x - config.originX) * 2 / config.screenTileWidth;
  const vertical = (screen.y - config.originY + elevation * config.elevationPixels)
    * 2 / config.screenTileHeight;
  const i = (horizontal + vertical) / 2;
  const j = (vertical - horizontal) / 2;

  return {
    x: i * config.cellWidth,
    y: j * config.cellDepth,
    z: elevation,
  };
}

export function isTileInBounds(
  tile: Pick<TileCoordinate, 'i' | 'j'>,
  bounds: WorldBounds = DEFAULT_WORLD_BOUNDS,
): boolean {
  assertFinite(tile.i, 'tile.i');
  assertFinite(tile.j, 'tile.j');
  assertPositive(bounds.width, 'bounds.width');
  assertPositive(bounds.height, 'bounds.height');
  return Number.isInteger(tile.i)
    && Number.isInteger(tile.j)
    && tile.i >= 0
    && tile.j >= 0
    && tile.i < bounds.width
    && tile.j < bounds.height;
}
