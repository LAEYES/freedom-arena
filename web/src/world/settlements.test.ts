import { describe, expect, it } from 'vitest';
import { generateTerrainMap } from './terrain';
import { generateSettlementDistrict, getSettlementInteraction } from './settlements';

describe('procedural settlement districts', () => {
  it('creates deterministic lots with five distinct interaction types', () => {
    const map = generateTerrainMap({ seed: 20261128 });
    const first = generateSettlementDistrict(map, 'test-village', 'Test Village', { i: 32, j: 32 }, 91);
    const second = generateSettlementDistrict(map, 'test-village', 'Test Village', { i: 32, j: 32 }, 91);
    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(first!.structures.length).toBeGreaterThan(0);
    expect(first!.structures.length).toBeLessThanOrEqual(5);
    expect(new Set(first!.structures.map(item => item.tile.i + ':' + item.tile.j)).size).toBe(first!.structures.length);
    expect(first!.structures.every(item => item.tile.walkable)).toBe(true);
    expect(first!.structures.map(item => item.interaction)).toEqual(
      first!.structures.map(item => item.interaction),
    );
  });

  it('resolves interaction only on a structure tile', () => {
    const map = generateTerrainMap({ seed: 17 });
    const district = generateSettlementDistrict(map, 'v', 'Village', { i: 32, j: 32 });
    expect(district).not.toBeNull();
    const structure = district!.structures[0];
    expect(getSettlementInteraction(district!, { i: structure.tile.i, j: structure.tile.j })?.id).toBe(structure.id);
    expect(getSettlementInteraction(district!, { i: 63, j: 63 })).toBeNull();
  });

  it('validates settlement identity and integer anchors', () => {
    const map = generateTerrainMap();
    expect(() => generateSettlementDistrict(map, '', 'Village', { i: 2, j: 2 })).toThrow(RangeError);
    expect(() => generateSettlementDistrict(map, 'v', 'Village', { i: 2.5, j: 2 })).toThrow(RangeError);
  });
});
