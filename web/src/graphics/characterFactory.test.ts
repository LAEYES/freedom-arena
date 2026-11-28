import { describe, expect, it } from 'vitest';
import { getCharacterEquipmentVisual, getCharacterFrameOffset, getCharacterLayerProfile, getEquipmentMotion } from './characterFactory';

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
    expect(getCharacterEquipmentVisual('Rare','head')).toMatchObject({ tier: 1, accent: '#75c9dc', material: 'alloy' });
    expect(getCharacterEquipmentVisual('Epic','chest')).toMatchObject({ tier: 2, accent: '#c49be7', material: 'crystal' });
    expect(getCharacterEquipmentVisual('Legendary','accessory')).toMatchObject({ tier: 3, accent: '#f4c96b', material: 'obsidian' });
  });
  it('animates each equipment slot deterministically and by pose', () => {
    expect(getEquipmentMotion('weapon','attack',2,3).rotation).not.toBe(getEquipmentMotion('weapon','idle',2,3).rotation);
    expect(getEquipmentMotion('head','walk',2,2).bob).toBeGreaterThan(0);
    expect(getEquipmentMotion('chest','idle',2,1).pulse).toBeGreaterThan(0);
    expect(getEquipmentMotion('accessory','idle',1,3)).toEqual(getEquipmentMotion('accessory','idle',9,3));
  });
  it('normalizes negative and large frame indices', () => {
    expect(getCharacterFrameOffset('walk',-1)).toBe(-2);
    expect(getCharacterFrameOffset('walk',5)).toBe(2);
  });
});
