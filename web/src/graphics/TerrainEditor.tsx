import { useEffect, useRef, useState } from 'react';
import { createAsset, paintProceduralTile, type Biome, type MaterialKind } from './assetFactory';
import { createTerrainDocument, paintTerrainCell, parseTerrainDocument, serializeTerrainDocument, type TerrainDocument } from './terrainDocument';

const BIOMES: Biome[] = ['temperate','arid','frozen','volcanic','coastal'];
const MATERIALS: MaterialKind[] = ['ground','water','rock','wall','sand','snow','lava'];
const CELL_PIXELS = 32;

export function TerrainEditor() {
  const [document, setDocument] = useState<TerrainDocument>(() => createTerrainDocument());
  const [biome, setBiome] = useState<Biome>('temperate');
  const [kind, setKind] = useState<MaterialKind>('ground');
  const [brushSize, setBrushSize] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [history, setHistory] = useState<TerrainDocument[]>([]);
  const [message, setMessage] = useState('Édition locale · couche isolée de la simulation.');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const paintingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = document.width * CELL_PIXELS;
    canvas.height = document.height * CELL_PIXELS;
    ctx.imageSmoothingEnabled = false;
    document.cells.forEach((cell, index) => {
      const x = (index % document.width) * CELL_PIXELS;
      const y = Math.floor(index / document.width) * CELL_PIXELS;
      const asset = createAsset(cell.kind, cell.biome, cell.seed, 64);
      const tile = document.createElement('canvas');
      tile.width = 64; tile.height = 64;
      const tileCtx = tile.getContext('2d');
      if (tileCtx) paintProceduralTile(tileCtx, asset, 0, 0);
      if (tileCtx) ctx.drawImage(tile, x, y, CELL_PIXELS, CELL_PIXELS);
    });
    if (showGrid) {
      ctx.strokeStyle = 'rgba(235,243,255,.22)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= document.width; x++) { ctx.beginPath(); ctx.moveTo(x * CELL_PIXELS + .5, 0); ctx.lineTo(x * CELL_PIXELS + .5, canvas.height); ctx.stroke(); }
      for (let y = 0; y <= document.height; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL_PIXELS + .5); ctx.lineTo(canvas.width, y * CELL_PIXELS + .5); ctx.stroke(); }
    }
  }, [document, showGrid]);

  const paintAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * document.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * document.height);
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) return;
    setHistory(previous => [...previous.slice(-19), document]);
    setDocument(previous => paintTerrainCell(previous, x, y, {biome, kind, seed: (42064 + x * 193 + y * 389) >>> 0}, brushSize));
  };
  const exportJson = () => {
    const blob = new Blob([serializeTerrainDocument(document)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url; link.download = 'freedom-arena-terrain-v1.json'; link.click();
    URL.revokeObjectURL(url);
    setMessage('Layout terrain exporté au format JSON v1.');
  };
  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = parseTerrainDocument(await file.text());
      setHistory(previous => [...previous.slice(-19), document]);
      setDocument(next);
      setMessage('Layout importé et validé · ' + next.width + ' × ' + next.height + ' cellules.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import impossible.');
    }
    event.target.value = '';
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setDocument(previous);
    setHistory(items => items.slice(0, -1));
    setMessage('Dernière opération annulée.');
  };
  const reset = () => {
    setHistory(items => [...items.slice(-19), document]);
    setDocument(createTerrainDocument());
    setMessage('Grille réinitialisée.');
  };

  return <section className="panel terrain-editor">
    <div className="graphics-heading"><div><span className="eyebrow">WORLD TOOLS · TERRAIN EDITOR</span><h2>Éditeur de terrain</h2><p>Peinture sur grille · matériaux procéduraux · document versionné</p></div><span className="graphics-version">EDITOR v1.0</span></div>
    <div className="terrain-editor-layout">
      <div className="terrain-editor-preview"><div className="graphics-preview-top"><strong>GRILLE {document.width} × {document.height}</strong><span>Tuile logique 64 × 64</span></div><div className="terrain-canvas-wrap"><canvas ref={canvasRef} aria-label="Grille terrain éditable" onPointerDown={event => {paintingRef.current=true;event.currentTarget.setPointerCapture(event.pointerId);paintAt(event);}} onPointerMove={event => {if(paintingRef.current && (event.buttons & 1)) paintAt(event);}} onPointerUp={() => {paintingRef.current=false;}} onPointerCancel={() => {paintingRef.current=false;}} /></div></div>
      <div className="graphics-controls terrain-controls">
        <label>Biome<select value={biome} onChange={event=>setBiome(event.target.value as Biome)}>{BIOMES.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Matériau<select value={kind} onChange={event=>setKind(event.target.value as MaterialKind)}>{MATERIALS.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Taille du pinceau · {brushSize} cellule(s)<input type="range" min="1" max="8" value={brushSize} onChange={event=>setBrushSize(Number(event.target.value))}/></label>
        <label className="graphics-check"><input type="checkbox" checked={showGrid} onChange={event=>setShowGrid(event.target.checked)}/> Afficher la grille</label>
        <div className="graphics-actions"><button type="button" onClick={undo} disabled={!history.length}>Annuler</button><button type="button" onClick={reset}>Réinitialiser</button><button type="button" onClick={exportJson}>Exporter JSON</button><button type="button" onClick={()=>fileRef.current?.click()}>Importer JSON</button></div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={importJson} hidden/>
        <p className="graphics-note" role="status">{message}</p>
        <p className="graphics-note">Les modifications restent dans ce studio. Elles ne remplacent pas encore les tuiles du monde jouable.</p>
      </div>
    </div>
  </section>;
}
