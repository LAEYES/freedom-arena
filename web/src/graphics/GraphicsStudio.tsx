import { useEffect, useMemo, useRef, useState } from 'react';
import { createAsset, paintProceduralTile, type AssetDescriptor, type Biome, type MaterialKind } from './assetFactory';

const BIOMES: Biome[] = ['temperate','arid','frozen','volcanic','coastal'];
const MATERIALS: MaterialKind[] = ['ground','water','rock','wall','sand','snow','lava'];
const SIZES = [64,128,256] as const;
const CATALOG_KEY = 'freedom-arena.graphics.catalog.v1';

function readCatalog(): AssetDescriptor[] {
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is AssetDescriptor =>
      !!item && typeof item === 'object' && typeof item.id === 'string' &&
      BIOMES.includes((item as AssetDescriptor).biome) &&
      MATERIALS.includes((item as AssetDescriptor).kind) &&
      [64,128,256].includes((item as AssetDescriptor).tileSize)
    ).slice(0,60) : [];
  } catch { return []; }
}

export function GraphicsStudio() {
  const [biome,setBiome] = useState<Biome>('temperate');
  const [material,setMaterial] = useState<MaterialKind>('ground');
  const [seed,setSeed] = useState(42064);
  const [size,setSize] = useState<64|128|256>(64);
  const [repeat,setRepeat] = useState(true);
  const [format,setFormat] = useState<'png'|'webp'>('png');
  const [quality,setQuality] = useState(0.9);
  const [catalog,setCatalog] = useState<AssetDescriptor[]>(readCatalog);
  const [catalogMessage,setCatalogMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asset = useMemo(()=>createAsset(material,biome,seed,size),[material,biome,seed,size]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const count=repeat?3:1;
    canvas.width=size*count; canvas.height=size*count;
    ctx.imageSmoothingEnabled=false;
    for(let y=0;y<count;y++)for(let x=0;x<count;x++) paintProceduralTile(ctx,asset,x*size,y*size);
    ctx.strokeStyle='rgba(255,255,255,.24)';
    ctx.lineWidth=Math.max(1,size/128);
    if(count>1)for(let i=1;i<count;i++){
      ctx.beginPath();ctx.moveTo(i*size,0);ctx.lineTo(i*size,canvas.height);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,i*size);ctx.lineTo(canvas.width,i*size);ctx.stroke();
    }
  },[asset,repeat,size]);

  const downloadFile=(blob:Blob,fileName:string)=>{
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=fileName;link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const exportJson=()=>{
    const data={...asset,exportedAt:new Date().toISOString(),format:'freedom-arena-asset-v1'};
    downloadFile(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${asset.id.replaceAll(':','-')}.json`);
  };
  const exportImage=()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const mime=format==='webp'?'image/webp':'image/png';
    canvas.toBlob(blob=>{
      if(!blob)return;
      const actualFormat=blob.type==='image/webp'?'webp':'png';
      downloadFile(blob,`freedom-arena-${biome}-${material}-${seed}.${actualFormat}`);
    },mime,quality);
  };
  const savePreset=()=>{
    const next=[asset,...catalog.filter(item=>item.id!==asset.id)].slice(0,60);
    setCatalog(next);
    try { window.localStorage.setItem(CATALOG_KEY,JSON.stringify(next)); setCatalogMessage('Ressource enregistrée dans le catalogue local.'); }
    catch { setCatalogMessage('Stockage local indisponible : exportez le JSON pour conserver cette ressource.'); }
  };
  const loadPreset=(id:string)=>{
    const selected=catalog.find(item=>item.id===id);
    if(!selected)return;
    setBiome(selected.biome);setMaterial(selected.kind);setSeed(selected.seed);setSize(selected.tileSize);
    setCatalogMessage('Ressource chargée.');
  };
  const removePreset=(id:string)=>{
    const next=catalog.filter(item=>item.id!==id);
    setCatalog(next);
    try { window.localStorage.setItem(CATALOG_KEY,JSON.stringify(next)); } catch { /* catalog remains available in memory */ }
    setCatalogMessage('Ressource retirée du catalogue local.');
  };

  return <section className="panel graphics-studio">
    <div className="graphics-heading"><div><span className="eyebrow">FA GRAPHICS STUDIO · ASSET FACTORY</span><h2>Atelier de création graphique</h2><p>Génération procédurale déterministe · catalogue local · export PNG / WebP / JSON</p></div><span className="graphics-version">PIPELINE v1.1</span></div>
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
        <label>Graine procédurale<input type="number" min="0" max="4294967295" value={seed} onChange={e=>setSeed(Math.max(0,Math.min(4294967295,Number(e.target.value)||0)))}/></label>
        <label className="graphics-check"><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/> Aperçu mosaïque 3 × 3</label>
        <label>Format image<select value={format} onChange={e=>setFormat(e.target.value as 'png'|'webp')}><option value="png">PNG sans perte</option><option value="webp">WebP compressé</option></select></label>
        {format==='webp'&&<label>Qualité WebP · {Math.round(quality*100)} %<input type="range" min="0.5" max="1" step="0.05" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></label>}
        <div className="graphics-actions"><button type="button" onClick={()=>setSeed(Math.floor(Math.random()*4294967296))}>Nouvelle graine</button><button type="button" onClick={exportImage}>Exporter {format.toUpperCase()}</button><button type="button" onClick={exportJson}>Exporter JSON</button><button type="button" onClick={savePreset}>Enregistrer</button></div>
        <div className="graphics-palette"><span>PALETTE ACTIVE</span><div>{[asset.palette.base,...asset.palette.shades,asset.palette.accent].map((color,i)=><i key={i} title={color} style={{backgroundColor:color}}/>)}</div></div>
      </div>
    </div>
    <div className="graphics-catalog"><div className="graphics-catalog-heading"><strong>CATALOGUE LOCAL</strong><span>{catalog.length}/60 ressources</span></div>
      {catalog.length===0?<p>Aucune ressource sauvegardée. Enregistrez une texture pour la retrouver lors de votre prochaine session.</p>:<div className="graphics-catalog-list">{catalog.map(item=><div className="graphics-catalog-item" key={item.id}><span><b>{item.kind}</b> · {item.biome} · {item.tileSize}px · #{item.seed}</span><button type="button" onClick={()=>loadPreset(item.id)}>Charger</button><button type="button" onClick={()=>removePreset(item.id)} aria-label={`Supprimer ${item.id}`}>×</button></div>)}</div>}
      {catalogMessage&&<p className="graphics-catalog-message" role="status">{catalogMessage}</p>}
    </div>
    <p className="graphics-note">Le catalogue est stocké sur cet appareil. Exportez les fichiers JSON/PNG/WebP pour transférer les ressources vers le dépôt ou un autre poste.</p>
  </section>;
}
