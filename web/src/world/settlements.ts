import { getTerrainTile, type TerrainMap, type TerrainTile } from './terrain';

export type SettlementStructureKind = 'hall' | 'market' | 'workshop' | 'residence' | 'watchpost';
export type SettlementInteractionKind = 'governance' | 'trade' | 'craft' | 'rest' | 'defense';

export type SettlementStructure = {
  id: string;
  settlementId: string;
  kind: SettlementStructureKind;
  interaction: SettlementInteractionKind;
  name: string;
  tile: TerrainTile;
};

export type SettlementDistrict = {
  id: string;
  name: string;
  center: TerrainTile;
  structures: SettlementStructure[];
};

const STRUCTURES: ReadonlyArray<{
  kind: SettlementStructureKind;
  interaction: SettlementInteractionKind;
  name: string;
}> = [
  { kind: 'hall', interaction: 'governance', name: 'Maison commune' },
  { kind: 'market', interaction: 'trade', name: 'Marché' },
  { kind: 'workshop', interaction: 'craft', name: 'Atelier' },
  { kind: 'residence', interaction: 'rest', name: 'Habitation' },
  { kind: 'watchpost', interaction: 'defense', name: 'Poste de garde' },
];

function stableSample(seed: number, x: number, y: number): number {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y - seed, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

function findWalkableCenter(map: TerrainMap, i: number, j: number, radius: number): TerrainTile | null {
  const candidates: TerrainTile[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      const tile = getTerrainTile(map, i + dx, j + dy);
      if (tile?.walkable) candidates.push(tile);
    }
  }
  candidates.sort((a, b) => {
    const distanceA = Math.abs(a.i - i) + Math.abs(a.j - j);
    const distanceB = Math.abs(b.i - i) + Math.abs(b.j - j);
    return distanceA - distanceB || a.j - b.j || a.i - b.i;
  });
  return candidates[0] ?? null;
}

/** Generates a reproducible five-lot district around the nearest walkable anchor. */
export function generateSettlementDistrict(
  map: TerrainMap,
  settlementId: string,
  name: string,
  anchor: { i: number; j: number },
  seed = map.seed,
): SettlementDistrict | null {
  if (!settlementId.trim() || !name.trim()) throw new RangeError('settlement id and name are required');
  if (!Number.isInteger(anchor.i) || !Number.isInteger(anchor.j)) throw new RangeError('settlement anchor must use integer tile coordinates');
  const center = findWalkableCenter(map, anchor.i, anchor.j, 6);
  if (!center) return null;

  const candidates: TerrainTile[] = [];
  for ( (let j = Math.max(0, center.j - 4); j <= Math.min(map.height - 1, center.j + 4); j++) {
    for (let i = Math.max(0, center.i - 4); i <= Math.min(map.width - 1, center.i + 4); i++) {
      if (Math.max(Math.abs(i - center.i), Math.abs(j - center.j)) < 2) continue;
      const tile = getTerrainTile(map, i, j);
      if (tile?.walkable) candidates.push(tile);
    }
  }
  candidates.sort((a, b) => stableSample(seed, a.i, a.j) - stableSample(seed, b.i, b.j)
    || a.j - b.j || a.i - b.i);

  const occupied = new Set<string>();
  const structures: SettlementStructure[] = [];
  for (let index = 0; index < STRUCTURES.length; index++) {
    const definition = STRUCTURES[index];
    const tile = candidates.find(candidate => !occupied.has(candidate.i + ':' + candidate.j));
    if (!tile) break;
    occupied.add(tile.i + ':' + tile.j);
    structures.push({
      id: settlementId + ':' + definition.kind,
      settlementId,
      ...definition,
      tile,
    });
    candidates.splice(candidates.indexOf(tile), 1);
  }
  return { id: settlementId, name, center, structures };
}

export function getSettlementInteraction(
  district: SettlementDistrict,
  tile: { i: number; j: number },
): SettlementStructure | null {
  return district.structures.find(structure => structure.tile.i === tile.i && structure.tile.j === tile.j) ?? null;
}
