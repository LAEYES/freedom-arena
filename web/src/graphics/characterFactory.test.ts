import { describe, expect, it } from 'vitest';
import { getCharacterEquipmentVisual, getCharacterFrameOffset, getCharacterLayerProfile } from './characterFactory';

describe('Freedom Arena character sprite factory', () => {
  it('cycles through deterministic walk offsets', () => {
    expect([0,1,2,3].map(frame=>getCharacterFrameOffset('walk',frame))).toEqual([0,2,0,-2]);
  });
  it('keeps idle pose stable and attack pose distinct', () => {
    expect(getCharacterFrameOffset('idle',3)).toBe(0);
    expect(getCharacterFrameOffset('attack',2)).toBe(3);
  });
  it('selects modular weapon and faction trim layers', () => {
    expect(getCharacterLayerProfile('Nomads','scout')).toMatchObject({ weapon: 'blade', armorTrim: '#e0bd78' });
    expect(getCharacterLayerProfile('Eclipse','mystic')).toMatchObject({ weapon: 'staff', energy: '#e5c6ff' });
  });
  it('maps equipped card rarity to deterministic cosmetic armor tiers', () => {
    expect(getCharacterEquipmentVisual('Common','weapon')).toBeUndefined();
    expect(getCharacterEquipmentVisual('Rare','head')).toEqual({ tier: 1, accent: '#75c9dc' });
    expect(getCharacterEquipmentVisual('Epic','chest')).toEqual({ tier: 2, accent: '#c49be7' });
    expect(getCharacterEquipmentVisual('Legendary','accessory')).toEqual({ tier: 3, accent: '#f4c96b' });
  });
  it('normalizes negative and large frame indices', () => {
    expect(getCharacterFrameOffset('walk',-1)).toBe(-2);
    expect(getCharacterFrameOffset('walk',5)).toBe(2);
  });
});
