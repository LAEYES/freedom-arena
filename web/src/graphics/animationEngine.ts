import type { CharacterPose } from './characterFactory';

export type Easing = 'linear' | 'ease-in-out';
export interface AnimationTransform { x:number; y:number; rotation:number; scale:number; opacity:number }
export interface AnimationKeyframe { frame:number; x?:number; y?:number; rotation?:number; scale?:number; opacity?:number; easing?:Easing }
export interface AnimationClip { id:string; pose:CharacterPose; fps:number; duration:number; loop:boolean; keyframes:AnimationKeyframe[] }
export interface EvaluatedAnimation extends AnimationTransform { frame:number; pose:CharacterPose }
const IDENTITY:AnimationTransform={x:0,y:0,rotation:0,scale:1,opacity:1};
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const finite=(value:number,fallback:number)=>Number.isFinite(value)?value:fallback;
function ease(t:number,easing:Easing='linear'){const v=clamp(t,0,1);return easing==='ease-in-out'?v*v*(3-2*v):v;}
export function evaluateAnimation(clip:AnimationClip, requestedFrame:number):EvaluatedAnimation {
  const duration=Math.max(1,Math.floor(finite(clip.duration,1)));
  const raw=finite(requestedFrame,0);
  const frame=clip.loop?((raw%duration)+duration)%duration:clamp(raw,0,duration);
  const keys=[...clip.keyframes].filter(k=>Number.isFinite(k.frame)).sort((a,b)=>a.frame-b.frame);
  if(!keys.length)return {...IDENTITY,frame,pose:clip.pose};
  const sample=(key:AnimationKeyframe)=>({...IDENTITY,x:finite(key.x??0,0),y:finite(key.y??0,0),rotation:finite(key.rotation??0,0),scale:Math.max(.01,finite(key.scale??1,1)),opacity:clamp(finite(key.opacity??1,1),0,1)});
  let left=keys[0],right=keys[keys.length-1];
  if(frame<=left.frame)return {...sample(left),frame,pose:clip.pose};
  if(frame>=right.frame)return {...sample(right),frame,pose:clip.pose};
  for(let i=1;i<keys.length;i++){if(frame<=keys[i].frame){left=keys[i-1];right=keys[i];break;}}
  const span=Math.max(Number.EPSILON,right.frame-left.frame);
  const t=ease((frame-left.frame)/span,left.easing??'linear');
  const a=sample(left),b=sample(right);
  const mix=(v:number,w:number)=>v+(w-v)*t;
  return {x:mix(a.x,b.x),y:mix(a.y,b.y),rotation:mix(a.rotation,b.rotation),scale:mix(a.scale,b.scale),opacity:mix(a.opacity,b.opacity),frame,pose:clip.pose};
}
export const CHARACTER_ANIMATION_CLIPS:Record<CharacterPose,AnimationClip>={
 idle:{id:'idle-v1',pose:'idle',fps:8,duration:32,loop:true,keyframes:[{frame:0,y:0,scale:1},{frame:16,y:-1,scale:1.015,easing:'ease-in-out'},{frame:32,y:0,scale:1}]},
 walk:{id:'walk-v1',pose:'walk',fps:12,duration:16,loop:true,keyframes:[{frame:0,y:0,rotation:-2},{frame:4,y:-2,rotation:1,easing:'ease-in-out'},{frame:8,y:0,rotation:2},{frame:12,y:-2,rotation:-1,easing:'ease-in-out'},{frame:16,y:0,rotation:-2}]},
 attack:{id:'attack-v1',pose:'attack',fps:12,duration:12,loop:false,keyframes:[{frame:0,x:0,rotation:0,scale:1},{frame:3,x:3,rotation:-18,scale:1.04,easing:'ease-in-out'},{frame:7,x:-2,rotation:24,scale:1.02},{frame:12,x:0,rotation:0,scale:1}]}
};
export function serializeAnimationClip(clip:AnimationClip):string{return JSON.stringify({schema:'freedom-arena.animation',version:1,...clip},null,2);}
