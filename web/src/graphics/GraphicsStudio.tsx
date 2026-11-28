import { useEffect, useMemo, useRef, useState } from 'react';
import { createAsset, paintProceduralTile, type Biome, type MaterialKind } from './assetFactory';

const BIOMES: Biome[] = ['temperate','arid','frozen','volcanic','coastal'];
const MATERIALS: MaterialKind[] = ['ground','water','rock','wall','sand','snow','lava'];
const SIZES = [64,128,256] as const;

export function GraphicsStudio() {
  const [biome,setBiome] = useState<Biome>('temperate');
  const [material,setMaterial] = useState<MaterialKind>('ground');
  const [seed,setSeed] = useState(42064);
  const [size,setSize] = useState<64|128|256>(64);
  const [repeat,setRepeat] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asset = useMemo(()=>createAsset(material,biome,seed,size),[material,biome,seed,size]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const count=repeat?3:1;
    canvas.width=size*count; canvas.height=size*count;
    ctx.imageSmoothingEnabled=false;
    for(let y=0;y<count;y++)for(let x=0;x<count;x++){
      paintProceduralTile(ctx,asset,x*size,y*size);
    }
    ctx.strokeStyle='rgba(255,255,255,.24)';
    ctx.lineWidth=Math.max(1,size/128);
    if(count>1){for(let i=1;i<count;i++){ctx.beginPath();ctx.moveTo(i*size,0);ctx.lineTo(i*size,canvas.height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*size);ctx.lineTo(canvas.width,i*size);ctx.stroke();}}
  },[asset,biome,material,seed,size,repeat]);

  const downloadFile=(blob:Blob,fileName:string)=>{\n    const url=URL.createObjectURL(blob);\n    const link=document.createElement('a');\n    link.href=url;link.download=fileName;link.click();\n    window.setTimeout(()=>URL.revokeObjectURL(url),1000);\n  };\n\n  const exportJson=()=>{\n    const data={...asset,exportedAt:new Date().toISOString(),format:'freedom-arena-asset-v1'};\n    downloadFile(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),\`\${asset.id.replaceAll(':','-')}.json\`);\n  };\n\n  const exportPng=()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    canvas.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download=`freedom-arena-${biome}-${material}-${seed}.png`;
      link.click();URL.revokeObjectURL(url);
    },'image/png');
  };

  return <section className="panel graphics-studio">
    <div className="graphics-heading"><div><span className="eyebrow">FA GRAPHICS STUDIO · ASSET FACTORY</span><h2>Atelier de création graphique</h2><p>Génération procédurale déterministe · aperçu local · export PNG</p></div><span className="graphics-version">PIPELINE v1</span></div>
    <div className="graphics-workspace">
      <div className="graphics-preview">
        <div className="graphics-preview-top"><strong>PRÉVISUALISATION</strong><span>{size} × {size} px · {repeat?'Mosaïque 3 × 3':'Tuile unique'}</span></div>
        <div className="graphics-canvas-wrap"><canvas ref={canvasRef} aria-label="Aperçu de texture procédurale"/></div>
        <div className="graphics-asset-id"><span>ASSET ID</span><code>{asset.id}</code></div>
      </div>
      <div className="graphics-controls">
        <label>Biome<select value={biome} onChange={e=>setBiome(e.target.value as Biome)}>{BIOMES.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>Matériau<select value={material} onChange={e=>setMaterial(e.target.value as MaterialKind)}>{MATERIALS.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>Résolution<select value={size} onChange={e=>setSize(Number(e.target.value) as 64|128|256)}>{SIZES.map(v=><option key={v} value={v}>{v} × {v}</option>)}</select></label>
        <label>Graine procédurale<input type="number" min="0" max="4294967295" value={seed} onChange={e=>setSeed(Math.max(0,Math.min(4294967295,Number(e.target.value)||0)))} /></label>
        <label className="graphics-check"><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/> Aperçu mosaïque 3 × 3</label>
        <div className="graphics-actions"><button type="button" onClick={()=>setSeed(Math.floor(Math.random()*4294967296))}>Nouvelle graine</button><button type="button" onClick={exportPng}>Exporter PNG</button><button type="button" onClick={exportJson}>Exporter JSON</button></div>
        <div className="graphics-palette"><span>PALETTE ACTIVE</span><div>{[asset.palette.base,...asset.palette.shades,asset.palette.accent].map((color,i)=><i key={i} title={color} style={{backgroundColor:color}}/>)}</div></div>
      </div>
    </div>
    <p className="graphics-note">La génération graphique ne modifie ni les coordonnées, ni les collisions, ni les règles de simulation du monde.</p>
  </section>;
}
