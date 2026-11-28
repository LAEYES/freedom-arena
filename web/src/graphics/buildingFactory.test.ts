import {describe,expect,it} from 'vitest';
import {canPlaceBuilding,createBuilding,getBuildingFootprint} from './buildingFactory';
describe('Building factory',()=>{
 it('computes rotated footprints',()=>{expect(getBuildingFootprint('outpost',0)).toEqual({width:3,height:2});expect(getBuildingFootprint('outpost',90)).toEqual({width:2,height:3});});
 it('rejects out-of-bounds and overlapping structures',()=>{const a=createBuilding('house','Aegis',1,1);expect(canPlaceBuilding([],a,16,16)).toBe(true);expect(canPlaceBuilding([a],createBuilding('tower','Nomads',2,2),16,16)).toBe(false);expect(canPlaceBuilding([],createBuilding('fortress','Aegis',14,14),16,16)).toBe(false);});
 it('allows adjacent structures without overlap',()=>{const a=createBuilding('house','Aegis',0,0);expect(canPlaceBuilding([a],createBuilding('house','Aegis',2,0),16,16)).toBe(true);});
});
