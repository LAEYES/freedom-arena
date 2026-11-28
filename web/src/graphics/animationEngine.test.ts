import { describe, expect, it } from 'vitest';
import { CHARACTER_ANIMATION_CLIPS, evaluateAnimation, type AnimationClip } from './animationEngine';
describe('animation engine',()=>{
 const clip:AnimationClip={id:'test',pose:'walk',fps:10,duration:10,loop:false,keyframes:[{frame:0,x:0,opacity:1},{frame:10,x:10,opacity:0}]};
 it('interpolates deterministically',()=>{expect(evaluateAnimation(clip,5).x).toBe(5);expect(evaluateAnimation(clip,5).opacity).toBe(.5);});
 it('clamps non-looping clips',()=>{expect(evaluateAnimation(clip,99).x).toBe(10);expect(evaluateAnimation(clip,-5).x).toBe(0);});
 it('wraps looping clips',()=>{expect(evaluateAnimation({...clip,loop:true},12).x).toBe(2);});
 it('applies ease-in-out',()=>{const eased=evaluateAnimation({...clip,keyframes:[{frame:0,x:0},{frame:10,x:10,easing:'ease-in-out'}]},2.5);expect(eased.x).toBeCloseTo(1.5625);});
 it('provides all character pose presets',()=>{expect(Object.keys(CHARACTER_ANIMATION_CLIPS)).toEqual(['idle','walk','attack']);expect(evaluateAnimation(CHARACTER_ANIMATION_CLIPS.attack,99).frame).toBe(12);});
 it('guards invalid frames and transforms',()=>{expect(evaluateAnimation({...clip,keyframes:[{frame:0,x:NaN,scale:-4,opacity:3}]},0)).toMatchObject({x:0,scale:.01,opacity:1});});
});
