import { describe, expect, it } from 'vitest';
import { planMultiSquadInterceptions, rankNpcThreats, receiveNpcAlertSignal, resolveNpcAlertRecipients, scheduleNpcTrajectories } from './npcCoordination';
import { tileKey } from './navigation';
import { createNpcBehaviorAgent } from './npcBehavior';
import { generateTerrainMap } from './terrain';

const map = generateTerrainMap({ width: 24, height: 24, seed: 9, spawnI: 12, spawnJ: 12, spawnSafeRadius: 11 });

describe('NPC group alert coordination', () => {
  it('broadcasts to nearby visible allies in stable input order', () => {
    const source = { id: 'leader', position: { i: 10, j: 10 }, radius: 6 };
    const candidates = [
      { id: 'ally-b', position: { i: 12, j: 10 } },
      { id: 'far', position: { i: 20, j: 10 } },
      { id: 'leader', position: { i: 10, j: 10 } },
      { id: 'ally-a', position: { i: 10, j: 13 } },
    ];
    expect(resolveNpcAlertRecipients(map, source, candidates)).toEqual(['ally-b', 'ally-a']);
  });

  it('does not transmit through blocked terrain', () => {
    const blocked = { ...map, tiles: map.tiles.map(tile =>
      tile.i === 12 && tile.j === 10 ? { ...tile, walkable: false } : tile,
    ) };
    expect(resolveNpcAlertRecipients(blocked,
      { id: 'leader', position: { i: 10, j: 10 }, radius: 6 },
      [{ id: 'ally', position: { i: 14, j: 10 } }],
    )).toEqual([]);
  });

  it('promotes a passive agent and turns it toward the signal source', () => {
    const agent = createNpcBehaviorAgent('ally', { i: 12, j: 10 });
    const alerted = receiveNpcAlertSignal(agent, { i: 10, j: 10 });
    expect(alerted.state).toBe('ALERT');
    expect(alerted.facing.i).toBeLessThan(0);
    expect(alerted.facing.j).toBe(0);
    expect(alerted.targetKey).toBeNull();
  });

  it('does not override an NPC already chasing or returning', () => {
    const agent = { ...createNpcBehaviorAgent('busy', { i: 12, j: 10 }), state: 'CHASE' as const };
    expect(receiveNpcAlertSignal(agent, { i: 10, j: 10 })).toBe(agent);
  });

  it('treats invalid signal radius as zero', () => {
    expect(resolveNpcAlertRecipients(map,
      { id: 'leader', position: { i: 10, j: 10 }, radius: Number.NaN },
      [{ id: 'ally', position: { i: 11, j: 10 } }],
    )).toEqual([]);
  });
});

describe('multi-squad tactical coordination', () => {
  it('ranks explicit priority and urgency before distance with stable ID ties', () => {
    const ranked = rankNpcThreats({ i: 10, j: 10 }, [
      { id: 'far-low', position: { i: 20, j: 20 }, priority: 1 },
      { id: 'near-high', position: { i: 11, j: 10 }, priority: 8, urgency: 2 },
      { id: 'near-tie-b', position: { i: 12, j: 10 }, priority: 5, urgency: 1 },
      { id: 'near-tie-a', position: { i: 12, j: 10 }, priority: 5, urgency: 1 },
    ]);
    expect(ranked.map(item => item.id)).toEqual(['near-high', 'near-tie-a', 'near-tie-b', 'far-low']);
  });

  it('allocates unique reachable staging cells across independent squads', () => {
    const squads = [
      { id: 'squad-b', members: [{ id: 'npc-c', position: { i: 20, j: 24 } }, { id: 'npc-d', position: { i: 24, j: 20 } }] },
      { id: 'squad-a', members: [{ id: 'npc-a', position: { i: 28, j: 24 } }, { id: 'npc-b', position: { i: 24, j: 28 } }] },
    ];
    const plans = planMultiSquadInterceptions(map, { i: 24, j: 24 }, squads, new Set(), 3);
    expect(plans).toHaveLength(4);
    expect(new Set(plans.map(plan => tileKey(plan.slot.i, plan.slot.j))).size).toBe(4);
    expect(plans.map(plan => plan.memberId)).toEqual(['npc-a', 'npc-b', 'npc-c', 'npc-d']);
    for (const plan of plans) {
      expect(plan.path[0]).toMatchObject(squads.flatMap(squad => squad.members).find(member => member.id === plan.memberId)!.position);
      expect(plan.path[plan.path.length - 1]).toMatchObject(plan.slot);
    }
  });

  it('schedules crossing trajectories without vertex overlap or edge swaps', () => {
    const schedule = scheduleNpcTrajectories([
      { id: 'a', path: [{ i: 1, j: 1 }, { i: 2, j: 1 }, { i: 3, j: 1 }] },
      { id: 'b', path: [{ i: 2, j: 1 }, { i: 1, j: 1 }, { i: 0, j: 1 }] },
    ], 8);
    expect(schedule.completed).toEqual([]);
    expect(schedule.blocked).toEqual(['a', 'b']);
    for (const frame of schedule.frames) {
      const positions = Object.values(frame.positions).map(position => tileKey(position.i, position.j));
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  it('resolves shared-destination conflicts deterministically without overlap', () => {
    const schedule = scheduleNpcTrajectories([
      { id: 'b', path: [{ i: 2, j: 2 }, { i: 2, j: 3 }] },
      { id: 'a', path: [{ i: 1, j: 3 }, { i: 2, j: 3 }] },
    ], 4);
    expect(schedule.frames[0].positions.a).toMatchObject({ i: 1, j: 3 });
    expect(schedule.frames[0].positions.b).toMatchObject({ i: 2, j: 2 });
  });

  it('handles deterministic priority ranking at 500 candidate threats', () => {
    const threats = Array.from({ length: 500 }, (_, index) => ({
      id: 'threat-' + index,
      position: { i: index % 48, j: Math.floor(index / 48) },
      priority: index % 11, urgency: index % 4, visible: index % 2 === 0,
    }));
    const first = rankNpcThreats({ i: 24, j: 24 }, threats);
    const second = rankNpcThreats({ i: 24, j: 24 }, threats);
    expect(first).toEqual(second);
    expect(first).toHaveLength(500);
  });
});
