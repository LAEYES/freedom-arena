import { describe, expect, it } from 'vitest';
import { isValidWorldSyncPosition } from './worldSync';

describe('world sync position contract', () => {
  it('accepts integer coordinates inside the 64 by 64 sector', () => {
    expect(isValidWorldSyncPosition({ x: 0, y: 0 })).toBe(true);
    expect(isValidWorldSyncPosition({ x: 63, y: 63 })).toBe(true);
  });

  it('rejects coordinates outside the sector and non-integer values', () => {
    for (const value of [
      { x: -1, y: 0 },
      { x: 64, y: 0 },
      { x: 0, y: 64 },
      { x: 1.5, y: 2 },
      { x: Number.NaN, y: 2 },
      null,
      '32:32',
    ]) {
      expect(isValidWorldSyncPosition(value)).toBe(false);
    }
  });
});
