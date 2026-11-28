import { useEffect, useRef, useState } from 'react';
import { drawCharacterSprite, type CharacterFaction, type CharacterPose, type CharacterRole } from './characterFactory';

export function CharacterStudio() {
  const [faction,setFaction]=useState<CharacterFaction>('Aegis');
  const [pose,setPose]=useState<CharacterPose>('idle');
  const [role,setRole]=useState<CharacterRole>('vanguard');
  const [frame,setFrame]=useState(0);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    canvas.width=192;canvas.height=192;
    ctx.clearRect(0,0,192,192);
    ctx.fillStyle='#0b1424';ctx.fillRect(0,0,192,192);
    ctx.strokeStyle='#263a59';ctx.lineWidth=1;
    for(let p=0;p<=192;p+=24){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,192);ctx.stroke();ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(192,p);ctx.stroke();}
    drawCharacterSprite(ctx,96,112,96,{faction,pose,role,frame});
  },[faction,pose,role,frame]);
  const exportPng=()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    canvas.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`freedom-arena-${faction.toLowerCase()}-${role}-${pose}.png`;
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    },'image/png');
  };
  return <section className="panel character-studio">
    <div className="graphics-heading"><div><span className="eyebrow">FA CHARACTER STUDIO · SPRITE FACTORY</span><h2>Atelier de personnages</h2><p>Silhouettes procédurales par faction, rôle et pose</p></div><span className="graphics-version">SPRITES v1</span></div>
    <div className="character-workspace">
      <div className="character-preview"><canvas ref={canvasRef} aria-label="Aperçu du personnage procédural"/><span>{faction} · {role} · {pose.toUpperCase()} · frame {frame}</span></div>
      <div className="graphics-controls">
        <label>Faction<select value={faction} onChange={e=>setFaction(e.target.value as CharacterFaction)}>{(['Aegis','Nomads','Eclipse','Neutral'] as CharacterFaction[]).map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Archétype<select value={role} onChange={e=>setRole(e.target.value as CharacterRole)}>{(['vanguard','scout','mystic'] as CharacterRole[]).map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Pose<select value={pose} onChange={e=>setPose(e.target.value as CharacterPose)}>{(['idle','walk','attack'] as CharacterPose[]).map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Image d'animation · {frame}<input type="range" min="0" max="3" step="1" value={frame} onChange={e=>setFrame(Number(e.target.value))}/></label>
        <button type="button" onClick={exportPng}>Exporter le sprite PNG</button>
      </div>
    </div>
    <p className="graphics-note">Prototype sprite 2D stylisé. Les frames sont des états de pose procéduraux, pas encore une animation squelettique ni un rig 3D.</p>
  </section>;
}
