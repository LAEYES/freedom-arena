import {canPlaceBuilding,type BuildingDefinition} from './buildingFactory';
export const BUILDING_DOCUMENT_FORMAT='freedom-arena-buildings-v1' as const;
export interface BuildingDocument {format:typeof BUILDING_DOCUMENT_FORMAT;version:1;width:number;height:number;tileSize:64;buildings:BuildingDefinition[];}
export function createBuildingDocument(width=16,height=16):BuildingDocument{return {format:BUILDING_DOCUMENT_FORMAT,version:1,width,height,tileSize:64,buildings:[]};}
export function validateBuildingDocument(value:unknown):value is BuildingDocument{
 if(!value||typeof value!=='object')return false;
 const d=value as Partial<BuildingDocument>;
 if(d.format!==BUILDING_DOCUMENT_FORMAT||d.version!==1||d.tileSize!==64||!Number.isInteger(d.width)||!Number.isInteger(d.height)||!d.width||!d.height||d.width!<1||d.height!<1||d.width!>64||d.height!>64||!Array.isArray(d.buildings))return false;
 const ids=new Set<string>();
 for(const b of d.buildings){
  if(!b||typeof b.id!=='string'||!['house','outpost','tower','shrine','workshop','fortress'].includes(b.kind)||!['Aegis','Nomads','Eclipse','Neutral'].includes(b.faction)||![0,90,180,270].includes(b.rotation)||!Number.isInteger(b.x)||!Number.isInteger(b.y)||!Number.isInteger(b.variant)||b.variant<0||b.variant>3||b.anchor!=='door'||ids.has(b.id))return false;
  ids.add(b.id);
 }
 for(let i=0;i<d.buildings.length;i++)if(!canPlaceBuilding(d.buildings.slice(0,i),d.buildings[i],d.width!,d.height!))return false;
 return true;
}
export function serializeBuildingDocument(document:BuildingDocument):string{return JSON.stringify(document,null,2);}
export function parseBuildingDocument(source:string):BuildingDocument{const value:unknown=JSON.parse(source);if(!validateBuildingDocument(value))throw new Error('Document bâtiments invalide : format, empreintes ou chevauchements incorrects.');return value;}
