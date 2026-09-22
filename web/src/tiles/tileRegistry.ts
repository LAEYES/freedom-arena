/**
 * Freedom Arena — 32×32 asset registry
 *
 * Source: visual asset catalogues supplied for the project.
 * The catalogues are presentation sheets, not raw spritesheets, so `src`
 * paths intentionally remain optional until the original PNG files are added.
 */

export const TILE_SIZE = 32 as const;

export type TileCategory =
  | 'GROUND' | 'PATHS' | 'BORDERS' | 'TRANSITIONS' | 'WALLS'
  | 'PLATFORMS' | 'NATURE' | 'WATER' | 'LAVA_ENERGY' | 'SNOW_ICE'
  | 'DESERT' | 'DUNGEON' | 'TECH' | 'BUILDINGS' | 'DECORATIONS'
  | 'OBSTACLES' | 'SPAWN' | 'INTERACTIVES' | 'COMBAT' | 'TELEPORTERS'
  | 'OBJECTIVES' | 'ITEMS' | 'UI_ICONS' | 'CHARACTERS_NPC';

export type TileDefinition = {
  id: string;
  category: TileCategory;
  index: number;
  size: 32;
  src?: string;
  label: string;
  paintable: boolean;
};

type CategorySpec = {
  code: string;
  category: TileCategory;
  count: number;
  label: string;
  paintable: boolean;
};

/** Canonical catalogue recovered from the supplied preview sheets. */
export const TILE_CATEGORIES: readonly CategorySpec[] = [
  { code: '01', category: 'GROUND', count: 16, label: 'Ground', paintable: true },
  { code: '02', category: 'PATHS', count: 16, label: 'Paths', paintable: true },
  { code: '03', category: 'BORDERS', count: 16, label: 'Borders', paintable: true },
  { code: '04', category: 'TRANSITIONS', count: 16, label: 'Transitions', paintable: true },
  { code: '05', category: 'WALLS', count: 16, label: 'Walls', paintable: true },
  { code: '06', category: 'PLATFORMS', count: 16, label: 'Platforms', paintable: true },
  { code: '07', category: 'NATURE', count: 16, label: 'Nature', paintable: false },
  { code: '08', category: 'WATER', count: 16, label: 'Water', paintable: true },
  { code: '09', category: 'LAVA_ENERGY', count: 16, label: 'Lava / Energy', paintable: true },
  { code: '10', category: 'SNOW_ICE', count: 16, label: 'Snow / Ice', paintable: true },
  { code: '11', category: 'DESERT', count: 16, label: 'Desert', paintable: true },
  { code: '12', category: 'DUNGEON', count: 16, label: 'Dungeon', paintable: true },
  { code: '13', category: 'TECH', count: 16, label: 'Tech', paintable: false },
  { code: '14', category: 'BUILDINGS', count: 16, label: 'Buildings', paintable: false },
  { code: '15', category: 'DECORATIONS', count: 16, label: 'Decorations', paintable: false },
  { code: '16', category: 'OBSTACLES', count: 16, label: 'Obstacles', paintable: false },
  { code: '17', category: 'SPAWN', count: 16, label: 'Spawn', paintable: false },
  { code: '18', category: 'INTERACTIVES', count: 16, label: 'Interactives', paintable: false },
  { code: '19', category: 'COMBAT', count: 16, label: 'Combat', paintable: false },
  { code: '20', category: 'TELEPORTERS', count: 16, label: 'Teleporters', paintable: false },
  { code: '21', category: 'OBJECTIVES', count: 16, label: 'Objectives', paintable: false },
  { code: '22', category: 'ITEMS', count: 16, label: 'Items', paintable: false },
  { code: '23', category: 'UI_ICONS', count: 16, label: 'UI Icons', paintable: false },
  { code: '24', category: 'CHARACTERS_NPC', count: 16, label: 'Characters / NPC', paintable: false },
] as const;

function makeTiles(spec: CategorySpec): TileDefinition[] {
  return Array.from({ length: spec.count }, (_, index) => {
    const suffix = String(index).padStart(2, '0');
    return {
      id: `${spec.code}_${suffix}`,
      category: spec.category,
      index,
      size: TILE_SIZE,
      src: `/assets/tiles/${spec.code}_${suffix}.png`,
      label: `${spec.label} ${suffix}`,
      paintable: spec.paintable,
    };
  });
}

export const TILE_REGISTRY: readonly TileDefinition[] = TILE_CATEGORIES.flatMap(makeTiles);

export const TILE_BY_ID: Readonly<Record<string, TileDefinition>> = Object.fromEntries(
  TILE_REGISTRY.map((tile) => [tile.id, tile]),
);

// Object.fromEntries loses the key union at the type level. Build the map
// explicitly so strict TypeScript can prove every TileCategory is present.
const tilesByCategory = {} as Record<TileCategory, TileDefinition[]>;
for (const spec of TILE_CATEGORIES) {
  tilesByCategory[spec.category] = TILE_REGISTRY.filter((tile) => tile.category === spec.category);
}

export const TILES_BY_CATEGORY: Readonly<Record<TileCategory, readonly TileDefinition[]>> = tilesByCategory;

export function getTileDefinition(id: string): TileDefinition | undefined {
  return TILE_BY_ID[id];
}

export function getCategoryTiles(category: TileCategory): readonly TileDefinition[] {
  return TILES_BY_CATEGORY[category];
}

export function getPaintableTiles(): readonly TileDefinition[] {
  return TILE_REGISTRY.filter((tile) => tile.paintable);
}

export const TILE_REGISTRY_STATS = {
  categories: TILE_CATEGORIES.length,
  tiles: TILE_REGISTRY.length,
  tileSize: TILE_SIZE,
} as const;
