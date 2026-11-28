import { describe, expect, it } from 'vitest';
import { getCombatParticleBudget, getShadowBudget } from './vfxBudget';

describe('adaptive visual-effects budgets', () => {
  it('bounds ground shadows by quality and frame-time pressure', () => {
    expect(getShadowBudget('performance', 12)).toBe(8);
    expect(getShadowBudget('balanced', 16)).toBe(20);
    expect(getShadowBudget('quality', 16)).toBe(48);
    expect(getShadowBudget('quality', 29)).toBe(8);
  });

  it('reduces future combat particle capacity under load', () => {
    expect(getCombatParticleBudget('performance', 12)).toBe(24);
    expect(getCombatParticleBudget('balanced', 16)).toBe(64);
    expect(getCombatParticleBudget('quality', 16)).toBe(128);
    expect(getCombatParticleBudget('quality', 22)).toBe(64);
  });

  it('rejects invalid frame-time measurements', () => {
    expect(() => getShadowBudget('balanced', Number.NaN)).toThrow(RangeError);
    expect(() => getCombatParticleBudget('quality', -1)).toThrow(RangeError);
  });
});
