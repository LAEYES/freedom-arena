import { getTerrainTile, type TerrainMap, type TerrainTile } from './terrain';

export type BridgeLink = {
  id: string;
  axis: 'east-west' | 'north-south';
  water: TerrainTile;
  bankA: TerrainTile;
  bankB: TerrainTile;
};

/**
 * Finds deterministic one-cell water crossings with walkable opposing banks.
 * The water tile remains non-walkable in terrain data; navigation opts into
 * the returned bridge set explicitly.
 */
export function detectBridgeLinks(map: TerrainMap): BridgeLink[] {
  const links: BridgeLink[] = [];
  for (const water of map.tiles) {
    if (water.kind !== 'water') continue;
    const west = getTerrainTile(map, water.i - 1, water.j);
    const east = getTerrainTile(map, water.i + 1, water.j);
    const north = getTerrainTile(map, water.i, water.j - 1);
    const south = getTerrainTile(map, water.i, water.j + 1);
    if (west?.walkable && east?.walkable) {
      links.push({
        id: 'bridge:' + water.i + ':' + water.j + ':ew',
        axis: 'east-west',
        water,
        bankA: west,
        bankB: east,
      });
    } else if (north?.walkable && south?.walkable) {
      links.push({
        id: 'bridge:' + water.i + ':' + water.j + ':ns',
        axis: 'north-south',
        water,
        bankA: north,
        bankB: south,
      });
    }
  }
  return links;
}

export function getBridgeTileKeys(links: readonly BridgeLink[]): ReadonlySet<string> {
  return new Set(links.map(link => link.water.i + ':' + link.water.j));
}
