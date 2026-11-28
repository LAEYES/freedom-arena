import { describe, expect, it } from 'vitest';
import { evaluateNpcEngagement, planNpcInterceptionSlots } from './npcCombat';
import { generateTerrainMap } from './terrain';
import { tileKey } from './navigation';

const base = generateTerrainMap({ width: 32, height: 32, seed: 77, spawnI: 16, spawnJ: 16, spawnSafeRadius: 15 });

describe('geometric NPC engagement', () => {
  it('accepts a target inside range, terrain visibility and facing arc', () => {
    const result = evaluateNpcEngagement(base, {
      origin: { i: 10, j: 10 }, target: { i: 13, j: 10 },
      facing: { i: 1, j: 0 }, range: 4, halfAngleDegrees: 45,
    });
    expect(result.status).toBe('READY');
    expect(result.hasLineOfSight).toBe(true);
    expect(result.insideFacingArc).toBe(true);
    expect(result.distance).toBe(3);
  });

  it('reports range, facing and cooldown gates independently', () => {
    expect(evaluateNpcEngagement(base, {
      origin: { i: 10, j: 10 }, target: { i: 15, j: 10 },
      facing: { i: 1, j: 0 }, range: 3,
    }).status).toBe('OUT_OF_RANGE');
    expect(evaluateNpcEngagement(base, {
      origin: { i: 10, j: 10 }, target: { i: 10, j: 13 },
      facing: { i: 1, j: 0 }, range: 4,
    }).status).toBe('OUT_OF_ARC');
    expect(evaluateNpcEngagement(base, {
      origin: { i: 10, j: 10 }, target: { i: 12, j: 10 },
      facing: { i: 1, j: 0 }, range: 4, cooldownRemainingMs: 120,
    }).status).toBe('COOLDOWN');
  });

  it('reports terrain occlusion before permitting engagement', () => {
    const blockedMap = {
      ...base,
      tiles: base.tiles.map(tile => tile.i === 12 && tile.j === 10
        ? { ...tile, kind: 'rock' as const, walkable: false } : tile),
    };
    expect(evaluateNpcEngagement(blockedMap, {
      origin: { i: 10, j: 10 }, target: { i: 14, j: 10 },
      facing: { i: 1, j: 0 }, range: 6,
    }).status).toBe('OCCLUDED');
  });

  it('uses deterministic unique reachable cardinal staging slots', () => {
    const target = { i: 16, j: 16 };
    const members = [
      { id: 'npc-c', position: { i: 12, j: 16 } },
      { id: 'npc-a', position: { i: 16, j: 12 } },
      { id: 'npc-b', position: { i: 20, j: 16 } },
    ];
    const occupied = new Set(members.map(member => tileKey(member.position.i, member.position.j)));
    const plans = planNpcInterceptionSlots(base, target, members, occupied);
    expect(plans.map(plan => plan.id)).toEqual(['npc-a', 'npc-b', 'npc-c']);
    expect(new Set(plans.map(plan => tileKey(plan.slot.i, plan.slot.j))).size).toBe(plans.length);
    for (const plan of plans) {
      expect(plan.path[0]).toMatchObject(members.find(member => member.id === plan.id)!.position);
      expect(plan.path[plan.path.length - 1]).toMatchObject(plan.slot);
      expect(Math.abs(plan.slot.i - target.i) + Math.abs(plan.slot.j - target.j)).toBe(1);
    }
  });
});
