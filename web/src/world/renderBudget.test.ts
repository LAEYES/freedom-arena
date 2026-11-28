import { describe, expect, it } from 'vitest';
import { getNpcRenderDistance, shouldRenderNpc } from './renderBudget';

describe('NPC render budget', () => {
  it('uses progressively larger visual radii by graphics profile', () => {
    expect(getNpcRenderDistance('performance')).toBe(18);
    expect(getNpcRenderDistance('balanced')).toBe(30);
    expect(getNpcRenderDistance('quality')).toBe(42);
  });

  it('keeps nearby NPCs and culls distant meshes', () => {
    expect(shouldRenderNpc({ x: 10.5, y: 10.5 }, { i: 10, j: 10 }, 18)).toBe(true);
    expect(shouldRenderNpc({ x: 40.5, y: 10.5 }, { i: 10, j: 10 }, 18)).toBe(false);
    expect(shouldRenderNpc({ x: 28.5, y: 10.5 }, { i: 10, j: 10 }, 18)).toBe(true);
  });

  it('validates invalid budgets and coordinates', () => {
    expect(() => shouldRenderNpc({ x: Number.NaN, y: 0 }, { i: 0, j: 0 }, 10)).toThrow(RangeError);
    expect(() => shouldRenderNpc({ x: 0, y: 0 }, { i: 0, j: 0 }, -1)).toThrow(RangeError);
  });
});
