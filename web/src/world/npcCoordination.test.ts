import { describe, expect, it } from 'vitest';
import { receiveNpcAlertSignal, resolveNpcAlertRecipients } from './npcCoordination';
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
