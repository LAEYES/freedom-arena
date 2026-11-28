import { describe, expect, it } from 'vitest';
import { createNpcBehaviorAgent, getNpcBehaviorPose, updateNpcBehavior } from './npcBehavior';
import { tileKey } from './navigation';
import { generateTerrainMap } from './terrain';

const map = generateTerrainMap({ width: 32, height: 32, seed: 77, spawnI: 16, spawnJ: 16, spawnSafeRadius: 15 });

describe('local NPC tactical behavior', () => {
  it('transitions from patrol to alert and chase using Manhattan radii', () => {
    let agent = createNpcBehaviorAgent('npc-a', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 16, j: 10 }, 16);
    expect(agent.state).toBe('ALERT');
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    expect(agent.state).toBe('CHASE');
    expect(agent.path.length).toBeGreaterThan(1);
  });

  it('holds a received group alert briefly when the player is outside local range', () => {
    const alerted = {
      ...createNpcBehaviorAgent('npc-alert-hold', { i: 10, j: 10 }),
      state: 'ALERT' as const,
      stateElapsedMs: 0,
    };
    const held = updateNpcBehavior(map, alerted, { i: 28, j: 28 }, 1000, { alertHoldMs: 1800 });
    expect(held.state).toBe('ALERT');
    const expired = updateNpcBehavior(map, held, { i: 28, j: 28 }, 900, { alertHoldMs: 1800 });
    expect(expired.state).toBe('PATROL');
  });

  it('does not acquire a player behind the NPC facing direction', () => {
    const agent = createNpcBehaviorAgent('npc-behind', { i: 10, j: 10 });
    const result = updateNpcBehavior(map, agent, { i: 6, j: 10 }, 16);
    expect(result.state).toBe('PATROL');
  });

  it('updates facing direction when the NPC advances along its route', () => {
    let agent = createNpcBehaviorAgent('npc-facing', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 100, { stepDurationMs: 100 });
    expect(agent.facing).toEqual({ i: 1, j: 0 });
  });

  it('interpolates a chase step without teleporting', () => {
    let agent = createNpcBehaviorAgent('npc-b', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 50, { stepDurationMs: 100 });
    const pose = getNpcBehaviorPose(agent);
    expect(pose.x).toBeGreaterThan(10);
    expect(pose.x).toBeLessThan(11);
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 50, { stepDurationMs: 100 });
    expect(Math.abs(agent.position.i - 10) + Math.abs(agent.position.j - 10)).toBe(1);
  });

  it('replans deterministically when the player target changes', () => {
    const initial = createNpcBehaviorAgent('npc-c', { i: 10, j: 10 });
    const first = updateNpcBehavior(map, initial, { i: 13, j: 10 }, 16);
    const second = updateNpcBehavior(map, first, { i: 13, j: 11 }, 16);
    const replay = updateNpcBehavior(map, first, { i: 13, j: 11 }, 16);
    expect(second).toEqual(replay);
    expect(second.targetKey).toContain('13:11>');
  });

  it('reuses a stable chase route while the player remains on the same tile', () => {
    let agent = createNpcBehaviorAgent('npc-route-cache', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    const route = agent.path;
    const next = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    expect(next.path).toBe(route);
  });

  it('stops pursuit on a walkable tile adjacent to the player', () => {
    let agent = createNpcBehaviorAgent('npc-adjacent', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 100);
    expect(agent.state).toBe('CHASE');
    const endpoint = agent.path[agent.path.length - 1];
    expect(endpoint.i === 13 && endpoint.j === 10).toBe(false);
    expect(Math.abs(endpoint.i - 13) + Math.abs(endpoint.j - 10)).toBe(1);
  });

  it('avoids dynamically occupied tiles and replans around a blocked next step', () => {
    let agent = createNpcBehaviorAgent('npc-d', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 0);
    const occupied = new Set([tileKey(11, 10)]);
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 100, { blockedTiles: occupied });
    expect(agent.path.slice(1).some(tile => occupied.has(tileKey(tile.i, tile.j)))).toBe(false);
  });

  it('returns home when the player exceeds the disengagement leash', () => {
    let agent = createNpcBehaviorAgent('npc-e', { i: 10, j: 10 });
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 16);
    agent = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 100, { stepDurationMs: 100 });
    expect(agent.state).toBe('CHASE');
    agent = updateNpcBehavior(map, agent, { i: 25, j: 25 }, 16, { stepDurationMs: 100 });
    expect(agent.state).toBe('RETURN');
  });

  it('never advances onto blocked terrain and bounds frame delta', () => {
    const agent = createNpcBehaviorAgent('npc-f', { i: 10, j: 10 });
    const result = updateNpcBehavior(map, agent, { i: 13, j: 10 }, 100000);
    const tile = map.tiles.find(candidate => candidate.i === result.position.i && candidate.j === result.position.j);
    expect(tile?.walkable).toBe(true);
    expect(result.stateElapsedMs).toBeLessThanOrEqual(100);
  });

  it('recovers IDLE to PATROL deterministically', () => {
    const agent = { ...createNpcBehaviorAgent('npc-g', { i: 10, j: 10 }), state: 'IDLE' as const };
    expect(updateNpcBehavior(map, agent, { i: 30, j: 30 }, 16).state).toBe('PATROL');
  });
});
