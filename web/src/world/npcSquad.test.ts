import { describe, expect, it } from 'vitest';
import { electNpcSquadLeader, formationAnchor, partitionNpcSquads, prepareNpcSquadRegroup, resolveNpcSquadLeaderHandoff, shouldRefreshNpcFormation, shouldRegroupNpcSquad } from './npcSquad';
import { generateTerrainMap } from './terrain';

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

describe('persistent squad pursuit and regrouping', () => {
  const members = ['npc-a', 'npc-b', 'npc-c'];

  it('requests a regroup only when a known squad member disengages from CHASE', () => {
    expect(shouldRegroupNpcSquad('npc-b', members, 'CHASE', 'RETURN')).toBe(true);
    expect(shouldRegroupNpcSquad('npc-x', members, 'CHASE', 'RETURN')).toBe(false);
    expect(shouldRegroupNpcSquad('npc-b', members, 'ALERT', 'RETURN')).toBe(false);
    expect(shouldRegroupNpcSquad('npc-b', members, 'CHASE', 'ALERT')).toBe(false);
  });

  it('resets a returning member route at its current position and retains squad agent data', () => {
    const agent = {
      id: 'npc-a',
      home: { i: 2, j: 2 },
      position: { i: 9, j: 8 },
      previousPosition: { i: 9, j: 7 },
      facing: { i: 0, j: 1 },
      state: 'RETURN' as const,
      path: [{ i: 9, j: 8 }, { i: 8, j: 8 }, { i: 7, j: 8 }],
      pathIndex: 0,
      targetKey: '2:2',
      stateElapsedMs: 300,
      stepElapsedMs: 80,
      stepDurationMs: 420,
    };
    const regrouped = prepareNpcSquadRegroup(agent);
    expect(regrouped).toMatchObject({
      id: 'npc-a',
      home: { i: 2, j: 2 },
      position: { i: 9, j: 8 },
      previousPosition: { i: 9, j: 8 },
      state: 'ALERT',
      path: [{ i: 9, j: 8 }],
      pathIndex: 0,
      targetKey: null,
      stateElapsedMs: 0,
      stepElapsedMs: 0,
    });
    expect(regrouped.facing).toEqual(agent.facing);
  });
});

describe('local multi-squad partitioning', () => {
  const map = generateTerrainMap({ width: 32, height: 32, seed: 77, spawnI: 16, spawnJ: 16, spawnSafeRadius: 15 });

  it('builds deterministic proximity groups and excludes IDLE agents', () => {
    const actors = [
      { id: 'b', position: { i: 13, j: 10 }, state: 'ALERT' as const },
      { id: 'a', position: { i: 10, j: 10 }, state: 'CHASE' as const },
      { id: 'idle', position: { i: 11, j: 10 }, state: 'IDLE' as const },
      { id: 'z', position: { i: 27, j: 27 }, state: 'RETURN' as const },
    ];
    const groups = partitionNpcSquads(map, actors, 5);
    expect(groups.map(group => group.map(actor => actor.id))).toEqual([['a', 'b'], ['z']]);
    expect(partitionNpcSquads(map, [...actors].reverse(), 5)).toEqual(groups);
  });

  it('uses connected components so a chain of nearby actors remains one squad', () => {
    const actors = [
      { id: 'a', position: { i: 5, j: 5 }, state: 'ALERT' as const },
      { id: 'b', position: { i: 10, j: 5 }, state: 'ALERT' as const },
      { id: 'c', position: { i: 15, j: 5 }, state: 'ALERT' as const },
    ];
    expect(partitionNpcSquads(map, actors, 5)).toHaveLength(1);
  });
});

describe('squad leader handoff', () => {
  it('selects a deterministic replacement when the current leader is no longer eligible', () => {
    const candidates = [
      { id: 'npc-b', position: { i: 8, j: 8 }, state: 'ALERT' as const },
      { id: 'npc-c', position: { i: 9, j: 8 }, state: 'CHASE' as const },
    ];
    expect(resolveNpcSquadLeaderHandoff('npc-a', candidates)?.id).toBe('npc-b');
    expect(resolveNpcSquadLeaderHandoff('npc-b', candidates)).toBeNull();
    expect(resolveNpcSquadLeaderHandoff('npc-a', [])).toBeNull();
  });
});
