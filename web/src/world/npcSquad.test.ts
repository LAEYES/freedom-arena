import { describe, expect, it } from 'vitest';
import { electNpcSquadLeader, formationAnchor, shouldRefreshNpcFormation } from './npcSquad';

describe('NPC squad coordination primitives', () => {
  it('elects the same leader regardless of input order', () => {
    const candidates = [
      { id: 'zone:npc:2', position: { i: 4, j: 4 }, state: 'ALERT' as const },
      { id: 'zone:npc:0', position: { i: 2, j: 2 }, state: 'PATROL' as const },
      { id: 'zone:npc:1', position: { i: 3, j: 3 }, state: 'CHASE' as const },
    ];
    expect(electNpcSquadLeader(candidates)?.id).toBe('zone:npc:0');
    expect(electNpcSquadLeader([...candidates].reverse())?.id).toBe('zone:npc:0');
  });

  it('returns null when there are no eligible squad members', () => {
    expect(electNpcSquadLeader([
      { id: 'idle', position: { i: 1, j: 1 }, state: 'IDLE' },
    ])).toBeNull();
  });

  it('requires both meaningful leader displacement and refresh cooldown', () => {
    const anchor = { i: 10, j: 10 };
    expect(shouldRefreshNpcFormation(anchor, { i: 11, j: 11 }, 2000)).toBe(false);
    expect(shouldRefreshNpcFormation(anchor, { i: 12, j: 10 }, 500)).toBe(false);
    expect(shouldRefreshNpcFormation(anchor, { i: 12, j: 10 }, 900)).toBe(true);
  });

  it('uses integer anchors for interpolated leader poses', () => {
    expect(formationAnchor({ x: 4.49, y: 7.51 })).toEqual({ i: 4, j: 8 });
  });

  it('treats invalid elapsed time as zero and supports custom thresholds', () => {
    expect(shouldRefreshNpcFormation(
      { i: 0, j: 0 }, { i: 3, j: 0 }, Number.NaN,
    )).toBe(false);
    expect(shouldRefreshNpcFormation(
      { i: 0, j: 0 }, { i: 3, j: 0 }, 300,
      { displacementTiles: 3, cooldownMs: 300 },
    )).toBe(true);
  });
});
