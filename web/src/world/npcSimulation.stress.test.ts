import { describe, expect, it } from 'vitest';
import { advanceNpcAgents, type NpcAgent } from './npcSimulation';

function makeAgents(count: number): NpcAgent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: 'stress:' + index,
    path: [
      { i: index % 64, j: Math.floor(index / 64) },
      { i: index % 64 + 1, j: Math.floor(index / 64) },
      { i: index % 64 + 2, j: Math.floor(index / 64) },
    ],
    fromIndex: 0,
    toIndex: 1,
    direction: 1,
    elapsedMs: 0,
    stepDurationMs: 420 + (index % 5) * 20,
  }));
}

describe('NPC simulation population stress', () => {
  it.each([50, 100, 250])('advances %i agents deterministically for 120 bounded frames', count => {
    let agents = makeAgents(count);
    for (let frame = 0; frame < 120; frame++) agents = advanceNpcAgents(agents, 16.667);
    expect(agents).toHaveLength(count);
    for (const agent of agents) {
      expect(Number.isFinite(agent.elapsedMs)).toBe(true);
      expect(agent.fromIndex).toBeGreaterThanOrEqual(0);
      expect(agent.toIndex).toBeGreaterThanOrEqual(0);
      expect(agent.toIndex).toBeLessThan(agent.path.length);
    }
    const replay = makeAgents(count);
    let replayed = replay;
    for (let frame = 0; frame < 120; frame++) replayed = advanceNpcAgents(replayed, 16.667);
    expect(agents).toEqual(replayed);
  });
});
