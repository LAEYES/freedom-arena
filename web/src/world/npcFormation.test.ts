import { describe, expect, it } from 'vitest';
import { advanceNpcFormationMotion, createNpcFormationMotion, getNpcFormationPose, planNpcFormation } from './npcFormation';
import { generateTerrainMap } from './terrain';

const map = generateTerrainMap({ width: 32, height: 32, seed: 77, spawnI: 16, spawnJ: 16, spawnSafeRadius: 15 });

describe('terrain-aware NPC formation planning', () => {
  it('assigns deterministic distinct walkable slots and paths', () => {
    const members = [
      { id: 'c', role: 'SUPPORT' as const },
      { id: 'a', role: 'SCOUT' as const },
      { id: 'b', role: 'GUARD' as const },
    ];
    const plans = planNpcFormation(map, { i: 16, j: 16 }, { i: 1, j: 0 }, members);
    expect(plans).toEqual(planNpcFormation(map, { i: 16, j: 16 }, { i: 1, j: 0 }, members));
    expect(new Set(plans.map(plan => plan.id)).size).toBe(plans.length);
    expect(new Set(plans.map(plan => plan.slot.i + ':' + plan.slot.j)).size).toBe(plans.length);
    for (const plan of plans) {
      expect(plan.path.length).toBeGreaterThan(1);
      expect(plan.path[plan.path.length - 1]).toMatchObject(plan.slot);
      expect(map.tiles.find(tile => tile.i === plan.slot.i && tile.j === plan.slot.j)?.walkable).toBe(true);
    }
  });

  it('does not allocate occupied slots', () => {
    const occupied = new Set(['14:14', '14:18']);
    const plans = planNpcFormation(map, { i: 16, j: 16 }, { i: 1, j: 0 },
      [{ id: 'a', role: 'SCOUT' }, { id: 'b', role: 'SCOUT' }], occupied);
    expect(plans.every(plan => !occupied.has(plan.slot.i + ':' + plan.slot.j))).toBe(true);
  });

  it('interpolates formation movement and stops at the final slot', () => {
    const plan = planNpcFormation(map, { i: 16, j: 16 }, { i: 1, j: 0 },
      [{ id: 'member', role: 'GUARD' }])[0];
    let motion = createNpcFormationMotion(plan, 100);
    motion = advanceNpcFormationMotion(motion, 50);
    expect(getNpcFormationPose(motion).progress).toBeCloseTo(0.5);
    for (let index = 0; index < 100; index++) motion = advanceNpcFormationMotion(motion, 100);
    expect(motion.segmentIndex).toBe(plan.path.length - 1);
    expect(getNpcFormationPose(motion)).toMatchObject({ x: plan.slot.i, y: plan.slot.j, progress: 0 });
  });

  it('bounds frame delta and handles invalid time', () => {
    const plan = planNpcFormation(map, { i: 16, j: 16 }, { i: 1, j: 0 },
      [{ id: 'member', role: 'GUARD' }])[0];
    const motion = createNpcFormationMotion(plan, 100);
    expect(advanceNpcFormationMotion(motion, Number.NaN)).toEqual(motion);
    expect(advanceNpcFormationMotion(motion, 100000).elapsedMs).toBeLessThan(100);
  });
});
