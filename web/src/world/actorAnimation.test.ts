import { describe, expect, it } from 'vitest';
import { sampleActorAnimation, selectActorAnimationLod } from './actorAnimation';

describe('actor animation controller', () => {
  it('produces deterministic finite poses for every visual action', () => {
    const actions = ['idle', 'walk', 'run', 'attack', 'block', 'hit', 'death'] as const;
    for (const action of actions) {
      const first = sampleActorAnimation(action, 1250, 0.7, 0.8);
      expect(first).toEqual(sampleActorAnimation(action, 1250, 0.7, 0.8));
      expect(Object.values(first).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
    }
  });

  it('clamps locomotion and separates action weight from movement weight', () => {
    expect(sampleActorAnimation('walk', 100, 0, 2).locomotion).toBe(1);
    expect(sampleActorAnimation('attack', 100, 0, 0).actionWeight).toBe(1);
    expect(sampleActorAnimation('idle', 100).actionWeight).toBe(0);
  });

  it('selects bounded distance-based animation detail', () => {
    expect(selectActorAnimationLod(0)).toBe('full');
    expect(selectActorAnimationLod(12)).toBe('full');
    expect(selectActorAnimationLod(12.01)).toBe('reduced');
    expect(selectActorAnimationLod(28)).toBe('reduced');
    expect(selectActorAnimationLod(28.01)).toBe('static');
    expect(() => selectActorAnimationLod(-1)).toThrow(RangeError);
  });

  it('rejects non-finite animation inputs', () => {
    expect(() => sampleActorAnimation('walk', Number.NaN)).toThrow(RangeError);
  });
});
