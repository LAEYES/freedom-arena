export type BuildingKind = 'house' | 'outpost' | 'tower' | 'shrine' | 'workshop' | 'fortress';
export type BuildingFaction = 'Aegis' | 'Nomads' | 'Eclipse' | 'Neutral';
export type BuildingRotation = 0 | 90 | 180 | 270;
export interface BuildingDefinition {
  id: string;
  kind: BuildingKind;
  faction: BuildingFaction;
  x: number;
  y: number;
  rotation: BuildingRotation;
  variant: number;
  anchor: 'door';
}
export interface Footprint { width: number; height: number; }
export const BUILDING_FOOTPRINTS: Record<BuildingKind, Footprint> = {
  house: {width:2,height:2}, outpost:{width:3,height:2}, tower:{width:2,height:2},
  shrine:{width:2,height:2}, workshop:{width:3,height:2}, fortress:{width:4,height:3}
};
export const BUILDING_PALETTES: Record<BuildingFaction, {base:string; roof:string; accent:string}> = {
  Aegis:{base:'#8795a7',roof:'#42658e',accent:'#d6b875'},
  Nomads:{base:'#b38a59',roof:'#8c5e38',accent:'#e2c78e'},
  Eclipse:{base:'#625777',roof:'#302a49',accent:'#b79ae8'},
  Neutral:{base:'#8b8172',roof:'#55545a',accent:'#c6b99d'}
};
export function createBuilding(kind: BuildingKind, faction: BuildingFaction, x: number, y: number, rotation: BuildingRotation = 0, variant = 0): BuildingDefinition {
  return {id:`bld:${kind}:${faction.toLowerCase()}:${x}:${y}:${rotation}:${variant}`,kind,faction,x,y,rotation,variant:Math.max(0,Math.min(3,Math.floor(variant))),anchor:'door'};
}
export function getBuildingFootprint(kind: BuildingKind, rotation: BuildingRotation): Footprint {
  const base = BUILDING_FOOTPRINTS[kind];
  return rotation === 90 || rotation === 270 ? {width:base.height,height:base.width} : base;
}
export function canPlaceBuilding(buildings: readonly BuildingDefinition[], candidate: BuildingDefinition, width: number, height: number): boolean {
  const size = getBuildingFootprint(candidate.kind,candidate.rotation);
  if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y) || candidate.x < 0 || candidate.y < 0 || candidate.x + size.width > width || candidate.y + size.height > height) return false;
  return !buildings.some(existing => {
    const a=getBuildingFootprint(existing.kind,existing.rotation), b=size;
    return candidate.x < existing.x+a.width && candidate.x+b.width > existing.x &&
      candidate.y < existing.y+a.height && candidate.y+b.height > existing.y;
  });
}
export function drawBuilding(ctx: CanvasRenderingContext2D, building: BuildingDefinition, x: number, y: number, tileSize: number): void {
  const size=getBuildingFootprint(building.kind,building.rotation), base=BUILDING_FOOTPRINTS[building.kind], palette=BUILDING_PALETTES[building.faction];
  const w=base.width*tileSize,h=base.height*tileSize;
  ctx.save();
  ctx.translate(x+size.width*tileSize/2,y+size.height*tileSize/2);ctx.rotate(building.rotation*Math.PI/180);
  ctx.translate(-w/2,-h/2);
  ctx.fillStyle='rgba(0,0,0,.34)';ctx.fillRect(5,h-9,w-1,10);
  ctx.fillStyle=palette.base;ctx.fillRect(3,Math.floor(h*.35),w-6,Math.floor(h*.58));
  ctx.fillStyle=palette.roof;
  if(building.kind==='tower'){
    ctx.fillRect(w*.22,h*.12,w*.56,h*.5);
    ctx.fillRect(w*.12,h*.08,w*.76,h*.12);
  } else {
    ctx.beginPath();ctx.moveTo(0,h*.4);ctx.lineTo(w/2,0);ctx.lineTo(w,h*.4);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle=palette.accent;
  if(building.kind==='shrine'){ctx.fillRect(w*.43,h*.22,w*.14,h*.42);ctx.fillRect(w*.32,h*.32,w*.36,h*.08);}
  else {ctx.fillRect(w*.43,h*.58,w*.14,h*.35);ctx.fillRect(w*.14,h*.48,w*.18,h*.16);ctx.fillRect(w*.68,h*.48,w*.18,h*.16);}
  if(building.kind==='fortress'){ctx.fillStyle=palette.base;ctx.fillRect(0,h*.22,w*.18,h*.5);ctx.fillRect(w*.82,h*.22,w*.18,h*.5);}
  if(building.variant>0){ctx.strokeStyle=palette.accent;ctx.lineWidth=Math.max(1,tileSize/32);ctx.strokeRect(4,4,w-8,h-8);}
  ctx.restore();
}
export const BUILDING_CATALOG: readonly BuildingKind[] = ['house','outpost','tower','shrine','workshop','fortress'];
