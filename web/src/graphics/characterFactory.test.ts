import { describe, expect, it } from 'vitest';
import { getCharacterFrameOffset } from './characterFactory';

describe('Freedom Arena character sprite factory', () => {
  it('cycles through deterministic walk offsets', () => {
    expect([0,1,2,3].map(frame=>getCharacterFrameOffset('walk',frame))).toEqual([0,2,0,-2]);
  });
  it('keeps idle pose stable and attack pose distinct', () => {
    expect(getCharacterFrameOffset('idle',3)).toBe(0);
    expect(getCharacterFrameOffset('attack',2)).toBe(3);
  });
  it('normalizes negative and large frame indices', () => {
    expect(getCharacterFrameOffset('walk',-1)).toBe(-2);
    expect(getCharacterFrameOffset('walk',5)).toBe(2);
  });
});
