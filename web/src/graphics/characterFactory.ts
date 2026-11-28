export type CharacterFaction = 'Aegis' | 'Nomads' | 'Eclipse' | 'Neutral';
export type CharacterPose = 'idle' | 'walk' | 'attack';
export type CharacterRole = 'vanguard' | 'scout' | 'mystic';
export interface CharacterSpriteOptions {
  faction: CharacterFaction;
  pose: CharacterPose;
  role: CharacterRole;
  frame: number;
  hostile?: boolean;
  facing?: 1 | -1;
}
const FACTION_PALETTES: Record<CharacterFaction,{armor:string;light:string;dark:string;glow:string}> = {
  Aegis:{armor:'#344e79',light:'#9bb8e8',dark:'#17253e',glow:'#b8d7ff'},
  Nomads:{armor:'#806039',light:'#e0bd78',dark:'#392a20',glow:'#ffe0a0'},
  Eclipse:{armor:'#633b79',light:'#c49be7',dark:'#261a3c',glow:'#e5c6ff'},
  Neutral:{armor:'#53616b',light:'#b5c0c7',dark:'#222c35',glow:'#d8e4eb'}
};

export interface CharacterLayerProfile {
  armorTrim: string;
  energy: string;
  weapon: 'blade' | 'staff';
}
export function getCharacterLayerProfile(faction: CharacterFaction, role: CharacterRole): CharacterLayerProfile {
  const palette = FACTION_PALETTES[faction];
  return { armorTrim: palette.light, energy: palette.glow, weapon: role === 'mystic' ? 'staff' : 'blade' };
}
export interface CharacterEffectOptions {
  faction: CharacterFaction;
  pose: CharacterPose;
  role: CharacterRole;
  frame: number;
  size: number;
}
export function drawCharacterEffects(ctx: CanvasRenderingContext2D, x: number, y: number, options: CharacterEffectOptions): void {
  if (options.pose !== 'attack') return;
  const profile = getCharacterLayerProfile(options.faction, options.role);
  const phase = ((Math.floor(options.frame) % 12) + 12) % 12;
  const strength = Math.max(0, 1 - Math.abs(phase - 5) / 7);
  if (strength <= 0) return;
  const radius = Math.max(5, options.size * (0.34 + strength * 0.18));
  ctx.save();
  ctx.globalAlpha = 0.12 + strength * 0.42;
  ctx.strokeStyle = profile.energy;
  ctx.lineWidth = Math.max(1, options.size / 18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (profile.weapon === 'staff') {
    ctx.arc(x, y - options.size * 0.12, radius * 0.7, -Math.PI * 0.8, Math.PI * 0.8);
  } else {
    ctx.arc(x, y, radius, -Math.PI * 0.78, Math.PI * 0.12);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.08 + strength * 0.16;
  ctx.fillStyle = profile.energy;
  ctx.beginPath();
  ctx.arc(x, y - options.size * 0.1, Math.max(2, options.size * 0.07), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function getCharacterFrameOffset(pose: CharacterPose, frame: number): number {
  const index = ((Math.floor(frame) % 4) + 4) % 4;
  if (pose === 'walk') return [0, 2, 0, -2][index];
  if (pose === 'attack') return [0, 1, 3, 1][index];
  return [0, 0, 0, 0][index];
}
export function drawCharacterSprite(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, options: CharacterSpriteOptions): void {
  const palette = FACTION_PALETTES[options.faction];
  const unit = Math.max(1, Math.floor(size / 20));
  const step = getCharacterFrameOffset(options.pose, options.frame) * unit;
  const hostile = options.hostile ?? options.faction === 'Eclipse';
  const armor = hostile ? '#632d38' : palette.armor;
  const dark = hostile ? '#291722' : palette.dark;
  const light = hostile ? '#d47c78' : palette.light;
  const centerX = Math.round(x), centerY = Math.round(y);
  const rect = (color:string, dx:number, dy:number, width:number, height:number) => {
    ctx.fillStyle=color;
    ctx.fillRect(centerX+dx*unit,centerY+dy*unit,width*unit,height*unit);
  };
  ctx.save();
  const facing = options.facing === -1 ? -1 : 1;
  ctx.translate(centerX, centerY);
  ctx.scale(facing, 1);
  ctx.translate(-centerX, -centerY);
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='rgba(0,0,0,.34)';
  ctx.beginPath();ctx.ellipse(centerX,centerY+8*unit,7*unit,2*unit,0,0,Math.PI*2);ctx.fill();
  // Legs and boots: walking frames alternate the stride.
  rect(dark,-4,2+step,3,5);rect(dark,1,2-step,3,5);
  rect('#111722',-5,6+step,4,2);rect('#111722',1,6-step,4,2);
  // Torso, shoulder guards and faction chest plate.
  rect(dark,-5,-5,10,9);rect(armor,-4,-5,8,7);
  rect(light,-2,-4,4,2);rect(palette.glow,-1,-3,2,1);
  rect(armor,-7,-5,3,4);rect(armor,4,-5,3,4);
  rect(dark,-5,3,10,2);
  // Modular armor detail layer: faction trim, belt clasp and chest insignia.
  const layers = getCharacterLayerProfile(options.faction, options.role);
  rect(layers.armorTrim,-4,2,8,1);
  rect(layers.energy,-1,-2,2,2);
  rect(dark,-1,3,2,1);
  // Arms and hands.
  rect(dark,-8,-3,3,6);rect(light,-8,1,3,2);
  rect(dark,5,-3,3,6);rect(light,5,1,3,2);
  // Head, hair/helmet and visor.
  rect('#c99d7b',-3,-11,6,6);
  rect(dark,-4,-12,8,3);
  rect(armor,-4,-13,8,2);
  rect(palette.glow,-2,-9,4,1);
  if(options.role==='scout'){rect(light,-6,-12,2,2);rect(light,4,-12,2,2);}
  if(options.role==='mystic'){rect(palette.glow,-1,-15,2,2);rect(light,-5,-4,2,2);rect(light,3,-4,2,2);}
  // Weapon silhouette and pose-dependent swing.
  ctx.save();
  const weaponX=centerX+6*unit, weaponY=centerY-7*unit;
  ctx.translate(weaponX,weaponY);
  const angle = options.pose === 'attack' ? (-0.75 + (options.frame % 4) * 0.42) : options.role === 'mystic' ? 0.18 : -0.12;
  ctx.rotate(angle);
  ctx.fillStyle=layers.weapon==='staff'?palette.glow:'#dce6f2';
  ctx.fillRect(-unit,-2*unit,2*unit,layers.weapon==='staff'?12*unit:10*unit);
  if(layers.weapon==='staff'){ctx.fillStyle=palette.light;ctx.fillRect(-2*unit,-3*unit,4*unit,2*unit);}
  ctx.fillStyle=dark;ctx.fillRect(-3*unit,2*unit,6*unit,unit);
  ctx.restore();
  if(options.role==='vanguard'){rect(light,-6,-1,2,4);rect(light,4,-1,2,4);}
  ctx.restore();
}
