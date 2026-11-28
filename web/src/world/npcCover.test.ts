import { describe, expect, it } from 'vitest';
import { findNpcCoverPositions, findNpcDirectionalCoverPositions } from './npcCover';
import { generateTerrainMap } from './terrain';

const baseMap = generateTerrainMap({ width: 32, height: 32, seed: 77, spawnI: 16, spawnJ: 16, spawnSafeRadius: 15 });
const map = {
  ...baseMap,
  tiles: baseMap.tiles.map(tile =>
    tile.i === 17 && tile.j === 16 ? { ...tile, kind: 'forest' as const, walkable: true }
      : tile.i === 16 && tile.j === 17 ? { ...tile, kind: 'forest' as const, walkable: true }
        : tile.i === 18 && tile.j === 16 ? { ...tile, kind: 'rock' as const, walkable: false }
          : tile,
  ),
};

describe('NPC defensive terrain positions', () => {
  it('returns only walkable, unoccupied positions with explicit cover semantics', () => {
    const occupied = new Set<string>();
    const positions = findNpcCoverPositions(map, { i: 16, j: 16 }, 12, occupied);
    expect(positions.length).toBeGreaterThan(0);
    for (const candidate of positions) {
      expect(map.tiles.find(tile => tile.i === candidate.position.i && tile.j === candidate.position.j)?.walkable).toBe(true);
      expect(candidate.cover === 'LIGHT' || candidate.cover === 'HARD').toBe(true);
      expect(candidate.exposure).toBeGreaterThan(0);
    }
  });

  it('filters occupied positions and sorts hard cover ahead of light cover', () => {
    const baseline = findNpcCoverPositions(map, { i: 16, j: 16 }, 12);
    const occupied = new Set(baseline.slice(0, 3).map(item => item.position.i + ':' + item.position.j));
    const filtered = findNpcCoverPositions(map, { i: 16, j: 16 }, 12, occupied);
    expect(filtered.every(item => !occupied.has(item.position.i + ':' + item.position.j))).toBe(true);
    for (let index = 1; index < filtered.length; index++) {
      if (filtered[index - 1].cover === 'LIGHT' && filtered[index].cover === 'HARD') {
        throw new Error('hard cover must sort before light cover');
      }
    }
  });

  it('clamps invalid and excessive radius', () => {
    expect(findNpcCoverPositions(map, { i: 16, j: 16 }, Number.NaN).length)
      .toBe(findNpcCoverPositions(map, { i: 16, j: 16 }, 5).length);
    expect(findNpcCoverPositions(map, { i: 16, j: 16 }, 100).length)
      .toBe(findNpcCoverPositions(map, { i: 16, j: 16 }, 12).length);
  });
});

  it('ranks hard cover that blocks the threat line ahead of exposed positions', () => {
    const ranked = findNpcDirectionalCoverPositions(map, { i: 16, j: 16 }, { i: 20, j: 16 }, 12);
    expect(ranked.length).toBeGreaterThan(0);
    const protectedPosition = ranked.find(item =>
      item.position.i === 17 && item.position.j === 16,
    );
    expect(protectedPosition?.blocksThreatLineOfSight).toBe(true);
    expect(ranked[0].blocksThreatLineOfSight).toBe(true);
  });
