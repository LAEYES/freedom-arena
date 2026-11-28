import { describe, expect, it } from 'vitest';
import { detectBridgeLinks, getBridgeTileKeys } from './bridges';
import type { TerrainMap, TerrainTile } from './terrain';

function crossing(axis: 'east-west' | 'north-south'): TerrainMap {
  const tiles: TerrainTile[] = axis === 'east-west'
    ? [
      { i: 0, j: 0, kind: 'grass', elevation: 0, walkable: true, movementCost: 1 },
      { i: 1, j: 0, kind: 'water', elevation: 0, walkable: false, movementCost: Infinity },
      { i: 2, j: 0, kind: 'grass', elevation: 0, walkable: true, movementCost: 1 },
    ]
    : [
      { i: 0, j: 0, kind: 'grass', elevation: 0, walkable: true, movementCost: 1 },
      { i: 0, j: 1, kind: 'water', elevation: 0, walkable: false, movementCost: Infinity },
      { i: 0, j: 2, kind: 'grass', elevation: 0, walkable: true, movementCost: 1 },
    ];
  return { width: axis === 'east-west' ? 3 : 1, height: axis === 'east-west' ? 1 : 3, seed: 4, tiles };
}

describe('bridge link detection', () => {
  it('detects cardinal crossings with opposing walkable banks', () => {
    for (const axis of ['east-west', 'north-south'] as const) {
      const links = detectBridgeLinks(crossing(axis));
      expect(links).toHaveLength(1);
      expect(links[0].axis).toBe(axis);
      expect([...getBridgeTileKeys(links)]).toEqual([axis === 'north-south' ? '0:1' : '1:0']);
    }
  });

  it('rejects water without two opposing walkable banks', () => {
    const map = crossing('east-west');
    map.tiles[2] = { ...map.tiles[2], walkable: false, kind: 'rock', movementCost: Infinity };
    expect(detectBridgeLinks(map)).toEqual([]);
  });
});
