import { describe, expect, it } from 'vitest';
import { getNpcFormationSlot, getNpcTacticalProfile } from './npcTactics';

describe('NPC tactical roles and formation geometry', () => {
  it('maps known activity metadata to stable tactical profiles', () => {
    expect(getNpcTacticalProfile('patrol').role).toBe('SCOUT');
    expect(getNpcTacticalProfile('defend').role).toBe('GUARD');
    expect(getNpcTacticalProfile('observe').role).toBe('SUPPORT');
    expect(getNpcTacticalProfile(undefined)).toEqual(getNpcTacticalProfile('observe'));
  });

  it('gives scouts a wider detection and pursuit envelope than guards', () => {
    const scout = getNpcTacticalProfile('patrol');
    const guard = getNpcTacticalProfile('defend');
    expect(scout.alertRadius).toBeGreaterThan(guard.alertRadius);
    expect(scout.maxChaseTiles).toBeGreaterThan(guard.maxChaseTiles);
    expect(scout.stepDurationMs).toBeLessThan(guard.stepDurationMs);
  });

  it('produces deterministic, distinct left/right rear slots', () => {
    const leader = { i: 20, j: 20 };
    const left = getNpcFormationSlot(leader, 0, { i: 1, j: 0 });
    const right = getNpcFormationSlot(leader, 1, { i: 1, j: 0 });
    expect(left).toEqual({ i: 18, j: 18 });
    expect(right).toEqual({ i: 18, j: 22 });
    expect(getNpcFormationSlot(leader, 0, { i: 1, j: 0 })).toEqual(left);
  });

  it('normalizes facing and clamps invalid spacing and member index', () => {
    expect(getNpcFormationSlot({ i: 4, j: 4 }, -3, { i: 0, j: 0 }, Number.NaN))
      .toEqual({ i: 3, j: 3 });
  });
});
