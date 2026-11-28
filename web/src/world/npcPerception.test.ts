import { describe, expect, it } from 'vitest';
import { canNpcPerceivePlayer, hasTerrainLineOfSight } from './npcPerception';
import { generateTerrainMap } from './terrain';

const map = generateTerrainMap({ width: 24, height: 24, seed: 9, spawnI: 12, spawnJ: 12, spawnSafeRadius: 11 });

describe('NPC directional perception', () => {
  it('detects a target inside the forward field of view', () => {
    expect(canNpcPerceivePlayer(map, { i: 10, j: 10 }, { i: 1, j: 0 }, { i: 14, j: 10 }, { radius: 7 })).toBe(true);
  });

  it('does not acquire targets behind or outside the field of view', () => {
    expect(canNpcPerceivePlayer(map, { i: 10, j: 10 }, { i: 1, j: 0 }, { i: 6, j: 10 }, { radius: 7 })).toBe(false);
    expect(canNpcPerceivePlayer(map, { i: 10, j: 10 }, { i: 1, j: 0 }, { i: 10, j: 14 }, { radius: 7 })).toBe(false);
  });

  it('rejects targets outside the perception radius', () => {
    expect(canNpcPerceivePlayer(map, { i: 10, j: 10 }, { i: 1, j: 0 }, { i: 18, j: 10 }, { radius: 7 })).toBe(false);
  });

  it('blocks line of sight through non-walkable intermediate terrain', () => {
    const blocked = { ...map, tiles: map.tiles.map(tile =>
      tile.i === 12 && tile.j === 10 ? { ...tile, walkable: false } : tile,
    ) };
    expect(hasTerrainLineOfSight(blocked, { i: 10, j: 10 }, { i: 14, j: 10 })).toBe(false);
    expect(canNpcPerceivePlayer(blocked, { i: 10, j: 10 }, { i: 1, j: 0 }, { i: 14, j: 10 }, { radius: 7 })).toBe(false);
  });

  it('allows a clear ray and rejects a zero-length facing vector', () => {
    expect(hasTerrainLineOfSight(map, { i: 10, j: 10 }, { i: 14, j: 10 })).toBe(true);
    expect(canNpcPerceivePlayer(map, { i: 10, j: 10 }, { i: 0, j: 0 }, { i: 14, j: 10 }, { radius: 7 })).toBe(false);
  });
});
