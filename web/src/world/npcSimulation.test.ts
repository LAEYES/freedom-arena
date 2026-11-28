import { describe, expect, it } from 'vitest';
import { createNpcAgents, advanceNpcAgents, getNpcAgentPose } from './npcSimulation';
import { generateTerrainMap } from './terrain';

const map = generateTerrainMap({ width: 32, height: 32, seed: 77, spawnI: 16, spawnJ: 16, spawnSafeRadius: 15 });
const actors = [
  { id: 'outpost:npc:0', x: 13, y: 15, activity: 'patrol' },
  { id: 'outpost:npc:1', x: 17, y: 15, activity: 'observe' },
];

describe('independent NPC route simulation', () => {
  it('creates deterministic, valid A* routes for each NPC', () => {
    const first = createNpcAgents(map, actors);
    expect(first).toEqual(createNpcAgents(map, actors));
    expect(first).toHaveLength(2);
    for (const agent of first) {
      expect(agent.path.length).toBeGreaterThan(1);
      const seed = actors.find(actor => actor.id === agent.id)!;
      expect(agent.path[0].i).toBe(seed.x);
      expect(agent.path[0].j).toBe(seed.y);
      for (let index = 1; index < agent.path.length; index++) {
        const previous = agent.path[index - 1];
        const current = agent.path[index];
        expect(Math.abs(previous.i - current.i) + Math.abs(previous.j - current.j)).toBe(1);
      }
    }
    const routeTiles = first.map(agent => new Set(agent.path.map(point => point.i + ':' + point.j)));
    const shared = [...routeTiles[0]].filter(key => routeTiles[1].has(key));
    expect(shared).toEqual([]);
  });

  it('interpolates continuously and reverses at patrol endpoints', () => {
    const [agent] = createNpcAgents(map, actors);
    const initial = getNpcAgentPose(agent);
    expect(initial.progress).toBe(0);
    let moving = agent;
    let remaining = agent.stepDurationMs / 2;
    while (remaining > 0) {
      const delta = Math.min(100, remaining);
      moving = advanceNpcAgents([moving], delta)[0];
      remaining -= delta;
    }
    expect(getNpcAgentPose(moving).progress).toBeCloseTo(0.5, 5);
    expect(getNpcAgentPose(moving).x).not.toBe(initial.x);
    let completed = agent;
    const ticks = Math.ceil((agent.path.length + 2) * agent.stepDurationMs / 100);
    for (let index = 0; index < ticks; index++) {
      completed = advanceNpcAgents([completed], 100)[0];
    }
    expect(completed.direction).toBe(-1);
    expect(getNpcAgentPose(completed).x).toBeGreaterThanOrEqual(0);
  });

  it('ignores invalid and excessive frame deltas safely', () => {
    const [agent] = createNpcAgents(map, actors);
    expect(advanceNpcAgents([agent], Number.NaN)[0]).toEqual(agent);
    expect(advanceNpcAgents([agent], 100000)[0].elapsedMs).toBeLessThan(agent.stepDurationMs);
  });
});
