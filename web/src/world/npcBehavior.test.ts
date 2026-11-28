import { describe, expect, it } from 'vitest';
import { createNpcBehaviorAgent, updateNpcBehavior } from './npcBehavior';
import { generateTerrainMap } from './terrain';

const map = generateTerrainMap({ width: 32, height: 32, seed: 77, spawnI: 16, spawnJ: 16, spawnSafeRadius: 15 });

describe('local NPC tactical behavior', () => {
  it('transitions from patrol to alert and chase using Manhattan radii', () => {
    let agent = createNpcBehaviorAgent('npc-a', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 16, j: 10 }, 16);
    expect(agent.state).toBe('ALERT');
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    expect(agent.state).toBe('CHASE');
    expect(agent.path.length).toBeGreaterThan(0);
  });

  it('returns when the player exceeds disengagement or chase leash', () => {
    let agent = createNpcBehaviorAgent('npc-b', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    expect(agent.state).toBe('ALERT');
    agent = updateNpcBehavior(map, agent, { i: 25, j: 25 }, 16);
    expect(['PATROL', 'RETURN']).toContain(agent.state);
  });

  it('replans deterministically when the player target changes', () => {
    const initial = createNpcBehaviorAgent('npc-c', { i: 10, j: 10 });
    const first = updateNpcBehavior(map, initial, { i: 13, j: 10 }, 16);
    const second = updateNpcBehavior(map, first, { i: 13, j: 11 }, 16);
    const replay = updateNpcBehavior(map, first, { i: 13, j: 11 }, 16);
    expect(second).toEqual(replay);
    expect(second.targetKey).toBe('13:11');
  });

  it('never advances onto a blocked tile and bounds frame delta', () => {
    const agent = createNpcBehaviorAgent('npc-d', { i: 10, j: 10 });
    const result = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 100000);
    const tile = map.tiles.find(candidate => candidate.i === result.position.i && candidate.j === result.position.j);
    expect(tile?.walkable).toBe(true);
    expect(result.stateElapsedMs).toBeLessThanOrEqual(100);
  });

  it('recovers IDLE to PATROL and keeps state transitions deterministic', () => {
    const agent = { ...createNpcBehaviorAgent('npc-e', { i: 10, j: 10 }), state: 'IDLE' as const };
    expect(updateNpcBehavior(map, agent, { i: 30, j: 30 }, 16).state).toBe('PATROL');
  });
});
