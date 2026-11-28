import {useEffect,useRef,useState,type PointerEvent,type ChangeEvent} from 'react';
import {BUILDING_CATALOG,canPlaceBuilding,createBuilding,drawBuilding,getBuildingFootprint,type BuildingFaction,type BuildingKind,type BuildingRotation} from './buildingFactory';
import {createBuildingDocument,parseBuildingDocument,serializeBuildingDocument,type BuildingDocument} from './buildingDocument';
const TILE=32;
export function BuildingStudio(){
 const [document,setDocument]=useState<BuildingDocument>(()=>createBuildingDocument());
 const [kind,setKind]=useState<BuildingKind>('house');
 const [faction,setFaction]=useState<BuildingFaction>('Aegis');
 const [rotation,setRotation]=useState<BuildingRotation>(0);
 const [variant,setVariant]=useState(0);
 const [erase,setErase]=useState(false);
 const [history,setHistory]=useState<BuildingDocument[]>([]);
 const [message,setMessage]=useState('Placement local · empreintes et collisions vérifiées.');
 const canvasRef=useRef<HTMLCanvasElement>(null),fileRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
  canvas.width=document.width*TILE;canvas.height=document.height*TILE;
  ctx.fillStyle='#182438';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(220,235,255,.2)';ctx.lineWidth=1;
  for(let x=0;x<=document.width;x++){ctx.beginPath();ctx.moveTo(x*TILE+.5,0);ctx.lineTo(x*TILE+.5,canvas.height);ctx.stroke();}
  for(let y=0;y<=document.height;y++){ctx.beginPath();ctx.moveTo(0,y*TILE+.5);ctx.lineTo(canvas.width,y*TILE+.5);ctx.stroke();}
  document.buildings.forEach(building=>drawBuilding(ctx,building,building.x*TILE,building.y*TILE,TILE));
 },[document]);
 const remember=()=>setHistory(items=>[...items.slice(-19),document]);
 const handlePlace=(event:PointerEvent<HTMLCanvasElement>)=>{
  const rect=event.currentTarget.getBoundingClientRect();
  const x=Math.floor((event.clientX-rect.left)/rect.width*document.width),y=Math.floor((event.clientY-rect.top)/rect.height*document.height);
  if(x<0||y<0||x>=document.width||y>=document.height)return;
  if(erase){
   const target=document.buildings.find(b=>{const fp=getBuildingFootprint(b.kind,b.rotation);return x>=b.x&&x<b.x+fp.width&&y>=b.y&&y<b.y+fp.height;});
   if(!target){setMessage('Aucun bâtiment sous le curseur.');return;}
   remember();setDocument(d=>({...d,buildings:d.buildings.filter(b=>b.id!==target.id)}));setMessage('Bâtiment supprimé.');return;
  }
  const building=createBuilding(kind,faction,x,y,rotation,variant);
  if(!canPlaceBuilding(document.buildings,building,document.width,document.height)){setMessage('Placement refusé : empreinte hors limites ou chevauchement.');return;}
  remember();setDocument(d=>({...d,buildings:[...d.buildings,building]}));setMessage('Bâtiment placé · '+building.kind+' · '+building.id);
 };
 const undo=()=>{const prev=history[history.length-1];if(!prev)return;setDocument(prev);setHistory(items=>items.slice(0,-1));setMessage('Dernière opération annulée.');};
 const exportJson=()=>{const blob=new Blob([serializeBuildingDocument(document)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=window.document.createElement('a');link.href=url;link.download='freedom-arena-buildings-v1.json';link.click();URL.revokeObjectURL(url);setMessage('Catalogue de bâtiments exporté en JSON v1.');};
 const importJson=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;try{const next=parseBuildingDocument(await file.text());setHistory(items=>[...items.slice(-19),document]);setDocument(next);setMessage('Document importé · '+next.buildings.length+' bâtiments validés.');}catch(error){setMessage(error instanceof Error?error.message:'Import impossible.');}event.target.value='';};
 return <section className="panel building-studio">
  <div className="graphics-heading"><div><span className="eyebrow">WORLD TOOLS · BUILDING STUDIO</span><h2>Atelier de bâtiments</h2><p>Catalogue procédural · empreintes · orientation · ancrage de porte · placement validé</p></div><span className="graphics-version">BUILDINGS v1</span></div>
  <div className="building-layout">
   <div className="building-preview"><div className="graphics-preview-top"><strong>PLAN DE CONSTRUCTION · {document.width} × {document.height}</strong><span>{document.buildings.length} structures</span></div><div className="building-canvas-wrap"><canvas ref={canvasRef} aria-label="Plan de placement des bâtiments" onPointerDown={handlePlace}/></div></div>
   <div className="graphics-controls">
    <label>Structure<select value={kind} onChange={e=>setKind(e.target.value as BuildingKind)}>{BUILDING_CATALOG.map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Faction<select value={faction} onChange={e=>setFaction(e.target.value as BuildingFaction)}>{(['Aegis','Nomads','Eclipse','Neutral'] as BuildingFaction[]).map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Orientation<select value={rotation} onChange={e=>setRotation(Number(e.target.value) as BuildingRotation)}>{([0,90,180,270] as BuildingRotation[]).map(v=><option key={v} value={v}>{v}°</option>)}</select></label>
    <label>Variante visuelle · {variant}<input type="range" min="0" max="3" value={variant} onChange={e=>setVariant(Number(e.target.value))}/></label>
    <label className="graphics-check"><input type="checkbox" checked={erase} onChange={e=>setErase(e.target.checked)}/> Mode suppression</label>
    <p className="graphics-note">Empreinte : {getBuildingFootprint(kind,rotation).width} × {getBuildingFootprint(kind,rotation).height} cellules · ancrage porte</p>
    <div className="graphics-actions"><button type="button" onClick={()=>setRotation(r=>((r+90)%360) as BuildingRotation)}>Tourner 90°</button><button type="button" onClick={undo} disabled={!history.length}>Annuler</button><button type="button" onClick={exportJson}>Exporter JSON</button><button type="button" onClick={()=>fileRef.current?.click()}>Importer JSON</button></div>
    <input ref={fileRef} type="file" accept="application/json,.json" onChange={importJson} hidden/>
    <p className="graphics-note" role="status">{message}</p>
    <p className="graphics-note">Les structures sont des prototypes graphiques 2D. Le document n'est pas encore injecté dans le monde jouable.</p>
   </div>
  </div>
 </section>;
}
