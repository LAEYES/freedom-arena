import { StrictMode, useEffet, useRef, useState } from 'react';
import { loadOrCreatePlayerRemote, syncPlayerRemote } from './lib/supabase';
import { loadPlayerApi, savePlayerApi } from './lib/api';
import { joinZonePresence, updateZonePresence, type ZonePresence } from './lib/realtime';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { canEnterZone, canWalkTile,  findTilePath, getNearestPoi, interactWithPoi, interactWithNpc, getReachableZones, getZone, getZoneStatus, generateScenario, generateWorldEvent, getZoneDynamicModifiers, getZoneEnvironment, getZoneNpcs, getZoneFactionPressure, getFactionPressureLabel, getWorldEventProgress, getWorldEventPhase, getWorldEventPoint, getTile, moveTile, zones } from './world';
import { createRencontre, getCombatReward, getCombatSummary, playerAttaquer, playerGarde, playerHeavyStrike, type CombatState } from './combat';
import { getTileDefinition } from './tiles/tileRegistry';
import { paintTacticalTile } from './tiles/tilePainter';
import { equipCard, factions, fuseCards, getCardFusionCost, getÉquiperpedCard, grantArenaReward, applyPoiReward, applyScenarioChoice, applyCombatOutcome, applyWorldEventState, applyNpcInteraction, explore, loadPlayer, savePlayer, upgradeCard, type Faction } from './game';

function isFreshRemotePresence(entry: ZonePresence) { return Date.now() - entry.updatedAt <= 15000; }

function WorldCanvas({ zoneId, waypoint, worldTile, worldMenace, worldResources, explorationCount, factionInfluence, worldEvent, worldEventAge, remotePlayers, onTileMove, onSignalSelect }: { zoneId: string; waypoint: {x:number;y:number}|null; worldCase : {x:number;y:number}; worldMenace: number; worldResources: number; explorationCount: number; factionInfluence: number; worldEvent: import('./world').WorldEvent; worldEventAge: number; remotePlayers: ZonePresence[]; onTileMove: (tileX: number, tileY: number) => void; onSignalSelect: (signal: {type:'poi'|'npc'|'event'; name:string; x:number; y:number}) => void }) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const dynamicRef = useRef<HTMLCanvasElement>(null);
  const position = useRef({ x: 0, y: 0 });
  const remoteVisuals = useRef<Record<string, { x: number; y: number; trail: Array<{ x: number; y: number; age: number }> }>>({});
  const remotePlayersRef = useRef(remotePlayers);
  const pathCache = useRef<{ key: string; path: { x: number; y: number }[] }>({ key: '', path: [] });
  const fxTime = useRef(0);
  const worldEventAgeRef = useRef(worldEventAge);
  const ambientWeatherRef = useRef<ReturnType<typeof getZoneEnvironment>['weather']>(getZoneEnvironment(getZone(zoneId), worldMenace, worldResources, explorationCount).weather);
  useEffet(() => { remotePlayersRef.current = remotePlayers; }, [remotePlayers]);
  useEffet(() => { worldEventAgeRef.current = worldEventAge; }, [worldEventAge]);
  useEffet(() => {
    ambientWeatherRef.current = getZoneEnvironment(getZone(zoneId), worldMenace, worldResources, explorationCount).weather;
  }, [zoneId, worldMenace, worldResources, explorationCount]);
  useEffet(() => {
    position.current = { x: 0, y: 0 };
  }, [zoneId]);
  useEffet(() => {
    position.current = { x: worldTile.x, y: worldTile.y };
  }, [worldTile.x, worldTile.y]);
  useEffet(() => {
    const canvas = baseRef.current;
    if (!canvas) return;
    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const tile = 32;
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      const cols = Math.ceil(rect.width / tile);
      const rows = Math.ceil(rect.height / tile);
      const cameraX = Math.max(0, Math.min(59 - cols, position.current.x - Math.floor(cols / 2)));
      const cameraY = Math.max(0, Math.min(39 - rows, position.current.y - Math.floor(rows / 2)));
      const zone = getZone(zoneId);
      const npcs = getZoneNpcs(zone, worldMenace, worldResources, explorationCount);
      const eventPoint = getWorldEventPoint(worldEvent);
      const eventDistance = Math.abs(position.current.x - eventPoint.x) + Math.abs(position.current.y - eventPoint.y);
      const signals: Array<{type:'poi'|'npc'|'event';name:string;x:number;y:number;sx:number;sy:number}> = [];
      zone.pointsOfInterest.forEach((name,index) => {
        const x = Math.floor((index + 1) * 60 / (zone.pointsOfInterest.length + 1));
        const y = 5 + index * 8;
        signals.push({type:'poi',name,x,y,sx:(x-cameraX)*tile+tile/2,sy:(y-cameraY)*tile+tile/2});
      });
      npcs.forEach(npc => signals.push({type:'npc',name:npc.name,x:npc.x,y:npc.y,sx:(npc.x-cameraX)*tile+tile/2,sy:(npc.y-cameraY)*tile+tile/2}));
      if (eventDistance <= 8) signals.push({type:'event',name:worldEvent.title,x:eventPoint.x,y:eventPoint.y,sx:(eventPoint.x-cameraX)*tile+tile/2,sy:(eventPoint.y-cameraY)*tile+tile/2});
      const hit = signals.find(signal => Math.hypot(clickX-signal.sx, clickY-signal.sy) <= 14);
      if (hit) {
        onSignalSelect({type:hit.type,name:hit.name,x:hit.x,y:hit.y});
        return;
      }
      const tileX = Math.floor(clickX / tile) + cameraX;
      const tileY = Math.floor(clickY / tile) + cameraY;
      onTileMove(tileX, tileY);
    };
    canvas.addEventListener('pointerdown', onPointer);
    return () => canvas.removeEventListener('pointerdown', onPointer);
  }, [onTileMove, onSignalSelect, zoneId, worldMenace, worldResources, explorationCount, worldEvent]);
  useEffet(() => {
    const canvas = baseRef.current;
    const dynamicCanvas = dynamicRef.current;
    if (!canvas || !dynamicCanvas) return;
    const ctx = canvas.getContext('2d');
    const dynamicCtx = dynamicCanvas.getContext('2d');
    if (!ctx || !dynamicCtx) return;
    const staticCanvas = document.createElement('canvas');
    const staticCtx = staticCanvas.getContext('2d');
    const sceneCanvas = document.createElement('canvas');
    const sceneCtx = sceneCanvas.getContext('2d');
    if (!staticCtx || !sceneCtx) return;
    let staticKey = '';
    let sceneKey = '';
    const draw = (deltaMs = 16.67) => {
      fxTime.current += deltaMs;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        dynamicCanvas.width = pixelWidth;
        dynamicCanvas.height = pixelHeight;
        staticCanvas.width = pixelWidth;
        staticCanvas.height = pixelHeight;
        sceneCanvas.width = pixelWidth;
        sceneCanvas.height = pixelHeight;
        staticKey = '';
        sceneKey = '';
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tile = 32, cols = Math.ceil(rect.width / tile), rows = Math.ceil(rect.height / tile);
      const cameraX = Math.max(0, Math.min(59 - cols, position.current.x - Math.floor(cols / 2)));
      const cameraY = Math.max(0, Math.min(39 - rows, position.current.y - Math.floor(rows / 2)));
      const terrainKey = [rect.width, rect.height, cameraX, cameraY].join(':');
      if (staticKey !== terrainKey) {
        staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        staticCtx.clearRect(0, 0, rect.width, rect.height);
        for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
          const worldX = x + cameraX, worldY = y + cameraY;
          const terrain = getTile(worldX, worldY);
          const biome = Math.floor((worldX + worldY) / 12) % 4;
          const terrainCategory = terrain.kind === 'water' ? 'WATER' : terrain.kind === 'rock' ? 'OBSTACLES' : terrain.kind === 'wall' ? 'WALLS' : biome === 1 ? 'NATURE' : biome === 2 ? 'DESERT' : biome === 3 ? 'DUNGEON' : 'GROUND';
          const tileId = terrain.kind === 'water' ? '08_00' : terrain.kind === 'rock' ? '16_00' : terrain.kind === 'wall' ? '05_00' : terrainCategory === 'NATURE' ? '07_00' : terrainCategory === 'DESERT' ? '11_00' : terrainCategory === 'DUNGEON' ? '12_00' : '01_00';
          const atlasTile = getTileDefinition(tileId);
          if (atlasTile) paintTacticalTile(staticCtx, atlasTile, terrain.kind, x, y, worldX * 61 + worldY * 17);
          else { staticCtx.fillStyle = '#101b30'; staticCtx.fillRect(x*tile,y*tile,tile,tile); }
        }
        staticKey = terrainKey;
      }
      const zone=getZone(zoneId);
      const sceneCacheKey = [terrainKey, zoneId, worldMenace, worldResources, explorationCount, factionInfluence, worldEvent.title, worldEvent.effect, worldEvent.intensity, worldEvent.faction, waypoint?.x ?? '', waypoint?.y ?? ''].join(':');
      if (sceneKey !== sceneCacheKey) {
        sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sceneCtx.clearRect(0, 0, rect.width, rect.height);
        sceneCtx.drawImage(staticCanvas, 0, 0, rect.width, rect.height);
        const environment=getZoneEnvironment(zone,worldMenace,worldResources,explorationCount);
        const npcs=getZoneNpcs(zone,worldMenace,worldResources,explorationCount);
        const cycleAlpha={dawn:.10,day:0,dusk:.13,night:.24}[environment.cycle];
        if(cycleAlpha){sceneCtx.fillStyle='rgba(12,20,48,'+cycleAlpha+')';sceneCtx.fillRect(0,0,rect.width,rect.height);}
        if(environment.weather==='mist'){sceneCtx.fillStyle='rgba(190,210,225,.07)';sceneCtx.fillRect(0,0,rect.width,rect.height);}
        if(environment.weather==='storm'){sceneCtx.fillStyle='rgba(80,90,130,'+Math.min(.16,.05+environment.atmosphere*.02)+')';sceneCtx.fillRect(0,0,rect.width,rect.height);}
        if(environment.weather==='frost'){sceneCtx.fillStyle='rgba(180,215,255,.08)';sceneCtx.fillRect(0,0,rect.width,rect.height);}
        if(worldMenace>=4){sceneCtx.fillStyle='rgba(150,30,40,'+Math.min(.18,(worldMenace-3)*.03)+')';sceneCtx.fillRect(0,0,rect.width,rect.height);}
        sceneCtx.strokeStyle='#3b5684';sceneCtx.lineWidth=2;sceneCtx.strokeRect(12,12,rect.width-24,rect.height-24);
        sceneCtx.fillStyle='#dce7ff';sceneCtx.font='600 14px Inter,sans-serif';sceneCtx.fillText(zone.name,24,38);
        const mapPoi=zone.pointsOfInterest.map((name,index)=>({name,x:Math.floor((index+1)*60/(zone.pointsOfInterest.length+1)),y:5+index*8}));
        mapPoi.forEach((poi)=>{const sx=(poi.x-cameraX)*tile+tile/2,sy=(poi.y-cameraY)*tile+tile/2;if(sx<0||sy<0||sx>rect.width||sy>rect.height)return;sceneCtx.fillStyle='#d8b56a';sceneCtx.beginPath();sceneCtx.arc(sx,sy,6,0,Math.PI*2);sceneCtx.fill();sceneCtx.fillStyle='#ead9ad';sceneCtx.font='10px Inter,sans-serif';sceneCtx.fillText(poi.name,sx+9,sy+3);});
        zone.pointsOfInterest.forEach((name,index)=>{const x=24+((index+1)*(rect.width-48))/(zone.pointsOfInterest.length+1),y=rect.height*(index%2===0?.42:.68);sceneCtx.fillStyle='#9db4e8';sceneCtx.beginPath();sceneCtx.arc(x,y,7,0,Math.PI*2);sceneCtx.fill();sceneCtx.fillStyle='#c9d7f5';sceneCtx.font='11px Inter,sans-serif';sceneCtx.fillText(name,x+10,y+4);});
        npcs.forEach((npc)=>{const sx=(npc.x-cameraX)*tile+tile/2,sy=(npc.y-cameraY)*tile+tile/2;if(sx<0||sy<0||sx>rect.width||sy>rect.height)return;sceneCtx.fillStyle=npc.faction==='Aegis'?'#8fa9e8':npc.faction==='Nomads'?'#d8b56a':'#ad8ee8';sceneCtx.beginPath();sceneCtx.arc(sx,sy,6,0,Math.PI*2);sceneCtx.fill();sceneCtx.fillStyle='#e5ebfa';sceneCtx.font='9px Inter,sans-serif';sceneCtx.fillText(npc.activity.toUpperCase(),sx+8,sy+3);});
        const pressure=getZoneFactionPressure(zone,factionInfluence);
        const pressureColor=pressure.status==='dominant'?'rgba(120,180,255,.75)':pressure.status==='contested'?'rgba(220,190,110,.75)':pressure.status==='weak'?'rgba(230,110,130,.8)':'rgba(160,180,210,.65)';
        sceneCtx.strokeStyle=pressureColor;sceneCtx.lineWidth=2;sceneCtx.setLineDash([6,4]);sceneCtx.strokeRect(8,8,rect.width-16,rect.height-16);sceneCtx.setLineDash([]);
        const eventPoint=getWorldEventPoint(worldEvent);
        if(waypoint){
          const pathKey=position.current.x+','+position.current.y+'>'+waypoint.x+','+waypoint.y;
          if(pathCache.current.key!==pathKey){pathCache.current={key:pathKey,path:findTilePath(position.current,waypoint)};}
          const path=pathCache.current.path;
          if(path.length>1){sceneCtx.strokeStyle='#d8b56a';sceneCtx.lineWidth=3;sceneCtx.setLineDash([4,4]);sceneCtx.beginPath();path.forEach((p,i)=>{const sx=(p.x-cameraX)*tile+tile/2,sy=(p.y-cameraY)*tile+tile/2;if(i===0)sceneCtx.moveTo(sx,sy);else sceneCtx.lineTo(sx,sy);});sceneCtx.stroke();sceneCtx.setLineDash([]);}
        }
        sceneKey=sceneCacheKey;
      }
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(sceneCanvas, 0, 0, rect.width, rect.height);
      dynamicCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dynamicCtx.clearRect(0, 0, rect.width, rect.height);
      const currentRemotePlayers = remotePlayersRef.current.filter(isFreshRemotePresence);
      const eventPhase=getWorldEventPhase(worldEvent,worldEventAgeRef.current).toUpperCase();
      const eventPoint=getWorldEventPoint(worldEvent);
      const ex=(eventPoint.x-cameraX)*tile+tile/2,ey=(eventPoint.y-cameraY)*tile+tile/2;
      if(ex>=-40&&ey>=-40&&ex<=rect.width+40&&ey<=rect.height+40){
        const sparkPhase = fxTime.current / 520;
        dynamicCtx.save();
        const sparkCount = Math.max(4, Math.min(10, 4 + worldEvent.intensity * 2));
        const sparkSpeed = 0.7 + worldEvent.intensity * 0.06;
        const sparkColor = worldEvent.effect === 'threat' ? '#ef7777' : '#d8b56a';
        for(let i=0;i<sparkCount;i++){
          const angle = sparkPhase * (sparkSpeed + i * 0.06) + i * Math.PI * 2 / sparkCount;
          const radius = 14 + ((sparkPhase * (7 + worldEvent.intensity) + i * 11) % 22);
          const sparkX = ex + Math.cos(angle) * radius;
          const sparkY = ey + Math.sin(angle) * radius;
          const sparkAlpha = 0.14 + worldEvent.intensity * 0.025 + 0.18 * (0.5 + 0.5 * Math.sin(sparkPhase * 2 + i));
          dynamicCtx.globalAlpha = Math.min(0.72, sparkAlpha);
          dynamicCtx.fillStyle = sparkColor;
          const sparkSize = 1.5 + worldEvent.intensity * 0.12;
          dynamicCtx.fillRect(sparkX, sparkY, sparkSize, sparkSize);
        }
        dynamicCtx.restore();
        const pulse=0.5+0.5*Math.sin(fxTime.current/320);
        const eventColor=eventPhase==='EXPIRING'?'#ef7777':eventPhase==='URGENT'?'#e5b26d':'#8fbfda';
        dynamicCtx.save();dynamicCtx.globalAlpha=0.18+pulse*0.16;dynamicCtx.strokeStyle=eventColor;dynamicCtx.lineWidth=2;
        dynamicCtx.beginPath();dynamicCtx.arc(ex,ey,9+pulse*8,0,Math.PI*2);dynamicCtx.stroke();
        dynamicCtx.globalAlpha=0.9;dynamicCtx.fillStyle=eventColor;dynamicCtx.beginPath();dynamicCtx.arc(ex,ey,4+pulse*2,0,Math.PI*2);dynamicCtx.fill();
        dynamicCtx.globalAlpha=0.95;dynamicCtx.fillStyle='#f0d9d0';dynamicCtx.font='600 9px Inter,sans-serif';dynamicCtx.fillText(eventPhase+' · EVENT',ex-30,ey-14);dynamicCtx.restore();
      }
      if(waypoint){
        const wx=(waypoint.x-cameraX)*tile+tile/2,wy=(waypoint.y-cameraY)*tile+tile/2;
        if(wx>=-30&&wy>=-30&&wx<=rect.width+30&&wy<=rect.height+30){
          const pulse=0.5+0.5*Math.sin(fxTime.current/220);
          dynamicCtx.save();dynamicCtx.globalAlpha=0.28+pulse*0.18;dynamicCtx.strokeStyle='#d8b56a';dynamicCtx.lineWidth=2;
          dynamicCtx.beginPath();dynamicCtx.arc(wx,wy,10+pulse*5,0,Math.PI*2);dynamicCtx.stroke();
          const trailPhase = fxTime.current / 260;
          dynamicCtx.save();
          for(let i=0;i<4;i++){
            const trailT=(trailPhase*0.55+i/4)%1;
            const trailAlpha=(1-trailT)*0.24;
            dynamicCtx.globalAlpha=trailAlpha;
            dynamicCtx.fillStyle='#ead9ad';
            dynamicCtx.beginPath();
            dynamicCtx.arc(wx,wy+18+trailT*26,2.5-trailT*1.2,0,Math.PI*2);
            dynamicCtx.fill();
          }
          dynamicCtx.globalAlpha=0.9;dynamicCtx.fillStyle='#ead9ad';dynamicCtx.font='600 10px Inter,sans-serif';dynamicCtx.fillText('WAYPOINT',wx-27,wy-15);
          dynamicCtx.restore();
        }
      }
      const activeIds = new Set(currentRemotePlayers.map(remote => remote.playerId));
      Object.keys(remoteVisuals.current).forEach(id => { if (!activeIds.has(id)) delete remoteVisuals.current[id]; });
      const smoothing = 1 - Math.exp(-10 * Math.min(50, Math.max(0, deltaMs)) / 1000);
      currentRemotePlayers.forEach(remote=>{
        const visual = remoteVisuals.current[remote.playerId] ?? (remoteVisuals.current[remote.playerId] = { x: remote.worldTile.x, y: remote.worldTile.y, trail: [] });
        const previousX = visual.x;
        const previousY = visual.y;
        visual.x += (remote.worldTile.x - visual.x) * smoothing;
        visual.y += (remote.worldTile.y - visual.y) * smoothing;
        const movementDistance = Math.hypot(visual.x - previousX, visual.y - previousY);
        if (movementDistance > 0.01) visual.trail.unshift({ x: visual.x, y: visual.y, age: 0 });
        visual.trail.forEach(point => { point.age += deltaMs; });
        visual.trail = visual.trail.filter(point => point.age < 360).slice(0, 4);
        const sx=(visual.x-cameraX)*tile+tile/2,sy=(visual.y-cameraY)*tile+tile/2;
        if(sx<-20||sy<-20||sx>rect.width+20||sy>rect.height+20)return;
        const remoteFactionColor = remote.faction === 'Aegis' ? '#8fa9e8' : remote.faction === 'Nomads' ? '#d8b56a' : remote.faction === 'Syndicate' ? '#ad8ee8' : '#8fbfda';
        const remotePulse = 0.5 + 0.5 * Math.sin(fxTime.current / 360 + remote.playerId.length);
        dynamicCtx.save();
        for (let i = visual.trail.length - 1; i >= 0; i--) {
          const trail = visual.trail[i];
          const trailX = (trail.x-cameraX)*tile+tile/2;
          const trailY = (trail.y-cameraY)*tile+tile/2;
          if (trailX < -12 || trailY < -12 || trailX > rect.width+12 || trailY > rect.height+12) continue;
          const trailAlpha = (1 - trail.age / 360) * 0.18;
          dynamicCtx.globalAlpha = Math.max(0, trailAlpha);
          dynamicCtx.fillStyle = remoteFactionColor;
          dynamicCtx.beginPath();
          dynamicCtx.arc(trailX, trailY, 2.5 - trail.age / 240, 0, Math.PI * 2);
          dynamicCtx.fill();
        }
        dynamicCtx.globalAlpha = 0.12 + remotePulse * 0.10;
        dynamicCtx.strokeStyle = remoteFactionColor;
        dynamicCtx.lineWidth = 1.5;
        dynamicCtx.beginPath();
        dynamicCtx.arc(sx, sy, 10 + remotePulse * 4, 0, Math.PI * 2);
        dynamicCtx.stroke();
        dynamicCtx.globalAlpha = 1;
        dynamicCtx.fillStyle=remoteFactionColor;dynamicCtx.beginPath();dynamicCtx.arc(sx,sy,7,0,Math.PI*2);dynamicCtx.fill();
        dynamicCtx.restore();
        dynamicCtx.strokeStyle='rgba(255,255,255,.5)';dynamicCtx.lineWidth=1;dynamicCtx.stroke();
        dynamicCtx.fillStyle='#dce7ff';dynamicCtx.font='600 9px Inter,sans-serif';dynamicCtx.fillText(remote.name+' · '+remote.faction,sx+9,sy+3);
      });
      const ambientPhase = fxTime.current / 1800;
      const ambientWeather = ambientWeatherRef.current;
      const ambientCount = ambientWeather === 'storm' ? 16 : ambientWeather === 'mist' ? 13 : ambientWeather === 'frost' ? 12 : 10;
      for(let i=0;i<ambientCount;i++){
        const ax=((i*83 + Math.floor(ambientPhase*12)*17)%(rect.width+80))-40;
        const ay=((i*47 + Math.floor(ambientPhase*8)*29)%(rect.height+80))-40;
        const shimmer=0.16+0.10*Math.sin(ambientPhase*2+i);
        dynamicCtx.globalAlpha=Math.max(0,shimmer);
        dynamicCtx.fillStyle='#b8c9e8';
        dynamicCtx.fillRect(ax,ay,1.5,1.5);
      }
      dynamicCtx.globalAlpha=1;
      const px=(position.current.x-cameraX)*tile+tile/2, py=(position.current.y-cameraY)*tile+tile/2;
      const pulse = 0.5 + 0.5 * Math.sin(fxTime.current / 260);
      dynamicCtx.save();
      dynamicCtx.globalAlpha = 0.22 + pulse * 0.12;
      dynamicCtx.strokeStyle = '#9db4e8'; dynamicCtx.lineWidth = 2;
      dynamicCtx.beginPath(); dynamicCtx.arc(px, py, 13 + pulse * 5, 0, Math.PI * 2); dynamicCtx.stroke();
      dynamicCtx.globalAlpha = 0.7;
      dynamicCtx.fillStyle = '#d8e5ff'; dynamicCtx.beginPath(); dynamicCtx.arc(px, py, 2 + pulse * 1.5, 0, Math.PI * 2); dynamicCtx.fill();
      dynamicCtx.restore();
      dynamicCtx.fillStyle='#fff'; dynamicCtx.beginPath(); dynamicCtx.arc(px,py,9,0,Math.PI*2); dynamicCtx.fill();
      dynamicCtx.strokeStyle='#9db4e8'; dynamicCtx.stroke(); dynamicCtx.fillStyle='#c9d7f5'; dynamicCtx.font='600 11px Inter,sans-serif'; dynamicCtx.fillText('JOUEUR',px-22,py+24);
    };
    let frame = 0;
    let lastFrame = performance.now();
    const animate = (now: number) => {
      const deltaMs = Math.min(50, Math.max(0, now - lastFrame));
      lastFrame = now;
      draw(deltaMs);
      frame = window.requestAnimationFrame(animate);
    };
    animate(lastFrame);
    const onResize = () => draw(16.67);
    window.addEventListener('resize', onResize);
    return()=>{ window.cancelAnimationFrame(frame); window.removeEventListener('resize',onResize); };
  },[zoneId,waypoint,worldTile.x,worldTile.y,worldMenace,worldResources,explorationCount,factionInfluence,worldEvent]);
  return <div className="world-canvas-layer">
    <canvas ref={baseRef} className="tile-canvas tile-canvas-base" aria-label={`Tile map of ${getZone(zoneId).name}`} />
    <canvas ref={dynamicRef} className="tile-canvas tile-canvas-dynamic" aria-hidden="true" />
  </div>;
}

function App() {
  const [player, setPlayer] = useState(loadPlayer);
  const [name, setName] = useState(player.name === 'Joueur de l'Arène' ? '' : player.name);
  const [creating, setCreating] = useState(player.name === 'Joueur de l'Arène');
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [lastCardXp, setLastCardXp] = useState(0);
  const [fusionSourceId, setFusionSourceId] = useState<string | null>(null);
  const [worldTile, setWorldTile] = useState(player.worldTile);
  const [worldMessage, setWorldMessage] = useState('Select a tile to move.');
  const [waypoint, setWaypoint] = useState<{x:number;y:number}|null>(null);
  const [pathLength, setPathLength] = useState(0);
  const [selectedSignal, setSelectedSignal] = useState<{type:'poi'|'npc'|'event'; name:string; x:number; y:number} | null>(null);
  const [worldEvent, setWorldEvent] = useState(generateWorldEvent(getZone(player.zoneId),player.worldMenace,player.worldResources,player.explorationCount,player.factionStates.find(f=>f.faction===getZone(player.zoneId).faction)?.influence??100));
  const [worldEventAge, setWorldEventAge] = useState(0);
  const [scenario, setScenario] = useState(generateScenario(getZone(player.zoneId), player.level, player.explorationCount));
  const [poiMessage, setPoiMessage] = useState('');
  const [poiAction, setPoiAction] = useState('');
  const [autoMove, setAutoMove] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState<ZonePresence[]>([]);
  const presenceChannelRef = useRef<import('@supabase/supabase-js').RealtimeChannel | null>(null);
  const presencePlayerIdRef = useRef<string>('');
  const currentZone = getZone(player.zoneId);
  const environment = getZoneEnvironment(currentZone, player.worldMenace, player.worldResources, player.explorationCount);
  const zoneNpcs = getZoneNpcs(currentZone, player.worldMenace, player.worldResources, player.explorationCount);
  const localFaction = currentZone.faction === 'Neutral' ? null : player.factionStates.find(f => f.faction === currentZone.faction);
  const factionPressure = getZoneFactionPressure(currentZone, localFaction?.influence ?? 100);
  const activeFactionInfluence = currentZone.faction === 'Neutral' ? 100 : (localFaction?.influence ?? 100);
  const zoneModifiers = getZoneDynamicModifiers(currentZone, player.worldMenace, player.worldResources, player.factionStates.find(f=>f.faction===player.faction)?.influence??100);
  const environmentLabels = { dawn: 'Aube', day: 'Jour', dusk: 'Crépuscule', night: 'Nuit' } as const;
  const weatherLabels = { clear: 'Clair', mist: 'Brume', storm: 'Tempête', frost: 'Gel' } as const;
  const equipped = getÉquiperpedCard(player);  const nearestPoi = getNearestPoi(currentZone, worldTile);
  const getNpcMemory = (npcId:string) => player.npcMemories.find(memory => memory.npcId === npcId);
  const nearestNpc = zoneNpcs.reduce((nearest,npc)=>{const distance=Math.abs(npc.x-worldTile.x)+Math.abs(npc.y-worldTile.y);return distance<nearest.distance?{npc,distance}:nearest;},{npc:zoneNpcs[0],distance:Number.POSITIVE_INFINITY});
  const playerRef = useRef(player);
  useEffet(() => { playerRef.current = player; }, [player]);
  const update = (next: typeof player) => { setPlayer(next); playerRef.current = next; savePlayer(next); void savePlayerApi(next); void syncPlayerRemote(next); };
  const persistMovement = (tile: typeof worldTile) => {
    const next = { ...playerRef.current, worldCase : tile };
    playerRef.current = next;
    setPlayer(next);
    savePlayer(next);
  };
  const upsertRemotePlayer = (entry: ZonePresence) => {
    const id = presencePlayerIdRef.current;
    if (!id || entry.playerId === id || !isFreshRemotePresence(entry)) return;
    setRemotePlayers(current => {
      const index = current.findIndex(player => player.playerId === entry.playerId);
      if (index < 0) return [...current, entry];
      const next = current.slice();
      next[index] = entry;
      return next;
    });
  };

  useEffet(() => {
    const existing = window.localStorage.getItem('freedomarena:presence:id');
    const id = existing ?? crypto.randomUUID();
    if (!existing) window.localStorage.setItem('freedomarena:presence:id', id);
    presencePlayerIdRef.current = id;
    let stopped = false;
    let stopPresence: (() => Promise<void>) | null = null;
    const join = async () => {
      const result = await joinZonePresence(player.zoneId, { playerId: id, name: player.name, zoneId: player.zoneId, worldCase : player.worldTile, faction: player.faction, updatedAt: Date.now() }, { onSync: players => { if (!stopped) setRemotePlayers(players.filter(entry => entry.playerId !== id && isFreshRemotePresence(entry))); }, onJoin: entry => { if (!stopped) upsertRemotePlayer(entry); }, onLeave: playerId => setRemotePlayers(current => current.filter(entry => entry.playerId !== playerId)) });
      if (stopped) { await result.stop(); return; }
      presenceChannelRef.current = result.channel;
      stopPresence = result.stop;
    };
    void join();
    return () => { stopped = true; setRemotePlayers([]); presenceChannelRef.current = null; if (stopPresence) void stopPresence(); };
  }, [player.zoneId]);

  useEffet(() => {
    const id = presencePlayerIdRef.current;
    if (!id) return;
    void updateZonePresence(presenceChannelRef.current, { playerId: id, name: player.name, zoneId: player.zoneId, worldCase : player.worldTile, faction: player.faction, updatedAt: Date.now() });
  }, [player.name, player.zoneId, player.worldTile.x, player.worldTile.y, player.faction]);
  const worldEventFactionInfluence = player.factionStates.find(f => f.faction === currentZone.faction)?.influence ?? 100;
  useEffet(() => {
    const timer = window.setInterval(() => {
      setWorldEventAge(age => {
        if (age + 1 < worldEvent.duration) return age + 1;
        const zone = getZone(player.zoneId);
        const nextEvent = generateWorldEvent(zone, player.worldMenace, player.worldResources, player.explorationCount, worldEventFactionInfluence);
        setWorldEvent(nextEvent);
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [player.zoneId, player.worldMenace, player.worldResources, player.explorationCount, worldEventFactionInfluence, worldEvent.duration]);

  useEffet(() => {
    if (!autoMove || !waypoint) return;
    const path = findTilePath(worldTile, waypoint);
    if (path.length <= 1) {
      setAutoMove(false);
      setPathLength(0);
      const eventPoint = getWorldEventPoint(worldEvent);
      const currentPlayer = playerRef.current;
      if (worldTile.x === eventPoint.x && worldTile.y === eventPoint.y) {
        const next = applyWorldEventState(currentPlayer, worldEvent.effect, worldEvent.intensity, worldEvent.faction);
        update(next);
        setWorldMessage('Territorial event triggered: ' + worldEvent.title);
        setWorldEvent(generateWorldEvent(currentZone, next.worldMenace, next.worldResources, next.explorationCount, next.factionStates.find(f => f.faction === currentZone.faction)?.influence ?? 100));
        setWaypoint(null);
        setSelectedSignal(null);
        return;
      }
      const poi = getNearestPoi(currentZone, worldTile);
      const npc = zoneNpcs.find(candidate => candidate.x === worldTile.x && candidate.y === worldTile.y);
      if (poi && poi.distance === 0) {
        const interaction = interactWithPoi(currentZone, poi.index);
        if (interaction) {
          setPoiMessage('POI reached: ' + interaction.name);
          setPoiAction(interaction.action);
          const modifiers = getZoneDynamicModifiers(currentZone, currentPlayer.worldMenace, currentPlayer.worldResources, currentPlayer.factionStates.find(f => f.faction === player.faction)?.influence ?? 100);
          const next = applyPoiReward(currentPlayer, interaction.action, { resourceRendement: modifiers.resourceRendement, encounterChance: modifiers.encounterChance }, currentZone.id + ':' + poi.index);
          update(next);
          setScenario(generateScenario(currentZone, next.level, next.explorationCount));
          setWorldEvent(generateWorldEvent(currentZone, next.worldMenace, next.worldResources, next.explorationCount));
          setWorldMessage('POI interaction resolved: ' + interaction.action);
        }
      } else if (npc) {
        const interaction = interactWithNpc(npc, currentPlayer.worldMenace, currentPlayer.worldResources);
        const next = applyNpcInteraction(currentPlayer, npc.faction as Faction, interaction.action, npc.id);
        update(next);
        setWorldMessage('NPC interaction resolved: ' + interaction.message);
        setScenario(generateScenario(currentZone, next.level, next.explorationCount));
        setWorldEvent(generateWorldEvent(currentZone, next.worldMenace, next.worldResources, next.explorationCount));
      }
      setWaypoint(null);      setSelectedSignal(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setWorldTile(path[1]);
      persistMovement(path[1]);
      setPathLength(path.length - 2);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [autoMove, waypoint, worldTile, currentZone, zoneNpcs, worldEvent]);

  useEffet(() => {
    let cancelled = false;
    void (async () => {
      const api = await loadPlayerApi();
      if (cancelled) return;
      if (api.player) {
        savePlayer(api.player);
        setPlayer(api.player);
        setWorldTile(api.player.worldTile);
        return;
      }
      const remote = await loadOrCreatePlayerRemote(player);
      if (cancelled) return;
      if (remote.player) {
        savePlayer(remote.player);
        setPlayer(remote.player);
        setWorldTile(remote.player.worldTile);
        void savePlayerApi(remote.player);
        return;
      }
      void savePlayerApi(player);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const chooseFaction = (faction: Faction) => update({ ...player, faction });
  const moveTo = (zoneId: string) => { const zone=getZone(zoneId); if(canEnterZone(player.level,zone)) { const next={...player,zoneId:zone.id,lastDécouverte :`Arrived at ${zone.name}`,worldCase :{x:0,y:0}}; setWorldTile(next.worldTile); setWaypoint(null); setAutoMove(false); setPathLength(0); update(next); } };
  const doExplore = () => update(explore(player));
  const startCombat = () => { const faction=currentZone.faction==='Neutral'?player.faction:currentZone.faction; const modifiers=getZoneDynamicModifiers(currentZone,player.worldMenace,player.worldResources,player.factionStates.find(f=>f.faction===player.faction)?.influence??100); setCombat(createRencontre(player.level,currentZone.level,{...(equipped??{}),threat:player.worldMenace,faction,encounterChance:modifiers.encounterChance})); };
  const attack = () => {
    if(!combat)return;
    const next=playerAttaquer(combat); setCombat(next);
    if(next.status==='victory'){
      let reward=applyCombatOutcome(grantArenaReward(player),true,next.enemy.level);
      if(equipped){ reward={...reward,cards:reward.cards.map(c=>c.id===equipped.id?upgradeCard(c,getCombatReward(next)):c)}; }
      setLastCardXp(equipped?getCombatReward(next):0); update(reward);
    }
  };

  if(creating)return <main className="shell"><header className="header"><div><span className="eyebrow">FREEDOM ARENA × RPGQG</span><h1>Arène tactique</h1></div><span className="status">Fondation jouable</span></header><section className="hero"><div><span className="eyebrow">CRÉATION DU JOUEUR</span><h2>Entrer dans l'Arène</h2><p>Crée ton joueur avant de choisir une faction et d'explorer le monde.</p></div><form onSubmit={e=>{e.preventDefault();const n=name.trim();if(!n)return;update({...player,name:n});setCreating(false);}}><label htmlFor="player-name">Nom du joueur</label><input id="player-name" value={name} onChange={e=>setName(e.target.value)} maxLength={24} autoFocus placeholder="Joueur de l'Arène"/><button type="submit" disabled={!name.trim()}>Créer le joueur</button></form></section></main>;

  return <main className="shell"><header className="header"><div><span className="eyebrow">FREEDOM ARENA × RPGQG</span><h1>Arène tactique</h1></div><span className="status">Progression RPGQG</span></header>
  <section className="hero"><div><span className="eyebrow">JOUEUR</span><h2>{player.name}</h2><p>Niveau {player.level} · {player.xp} XP · {player.victories} victoires · {player.arenaWins} victoires d'arène · {player.fusionMaterials} matériaux de fusion</p></div>{equipped&&<div className="equipped"><span className="eyebrow">CARTE ÉQUIPÉE</span><strong>{equipped.name}</strong><span>{equipped.rarity} · Lv {equipped.level}</span>{lastCardXp>0&&<small>+{lastCardXp} card XP on last victory</small>}</div>}</section>
  <section className="panel"><div><span className="eyebrow">MONDE / EXPLORATION</span><h2>{currentZone.name}</h2><p>{currentZone.description}</p><div className="world-layout"><div className="world-map"><WorldCanvas zoneId={player.zoneId} waypoint={waypoint} worldTile={worldTile} worldMenace={player.worldMenace} worldResources={player.worldResources} explorationCount={player.explorationCount} factionInfluence={activeFactionInfluence} worldEvent={worldEvent} worldEventAge={worldEventAge} remotePlayers={remotePlayers} onSignalSelect={setSelectedSignal} onTileMove={(x,y)=>{const next=moveTile(worldTile,{x,y});setWorldTile(next);update({...player,worldCase :next});setWorldMessage(next.x===x&&next.y===y?`Moved to tile ${x}, ${y}.`:`Blocked path: ${getTile(x,y).kind} tile.`)}} />{zones.map(zone=><button key={zone.id} className={zone.id===player.zoneId?'zone-node active':'zone-node'} disabled={getZoneStatus(player.level,zone,player.zoneId)==='locked'} onClick={()=>moveTo(zone.id)}><strong>{zone.name}</strong><span>Lv {zone.level} · {zone.faction}</span></button>)}<div className="world-legend" aria-label="Map signal legend"><span><i className="legend-dot legend-poi"/>POI</span><span><i className="legend-dot legend-npc"/>NPC</span><span><i className="legend-dot legend-event"/>EVENT</span><span><i className="legend-line"/>WAYPOINT</span></div></div><div className="zone-info"><p><strong>Case :</strong> {worldTile.x}, {worldTile.y} · <strong>Monde :</strong> {worldMessage}</p>{waypoint&&<p><strong>Point de route :</strong> {waypoint.x}, {waypoint.y} · <strong>Chemin :</strong> {pathLength} steps</p>}{nearestPoi&&<p><strong>POI proche :</strong> {nearestPoi.name} · distance {nearestPoi.distance}</p>}{selectedSignal&&<p><strong>Signal :</strong> {selectedSignal.name} · {selectedSignal.type.toUpperCase()} · {selectedSignal.x}, {selectedSignal.y}</p>}{nearestNpc.npc&&<p><strong>PNJ de faction proche :</strong> {nearestNpc.npc.name} · {nearestNpc.npc.activity} · distance {nearestNpc.distance}{getNpcMemory(nearestNpc.npc.id)&&<> · Confiance {getNpcMemory(nearestNpc.npc.id)!.trust} · {getNpcMemory(nearestNpc.npc.id)!.affinity}</>}</p>}{selectedSignal&&<div className="signal-actions"><button type="button" onClick={()=>{setWaypoint({x:selectedSignal.x,y:selectedSignal.y});setAutoMove(true);setWorldMessage('Waypoint set: '+selectedSignal.name);}}>Naviguer vers le signal</button>{selectedSignal.type==='npc'&&<button type="button" disabled={Math.abs(selectedSignal.x-worldTile.x)+Math.abs(selectedSignal.y-worldTile.y)>2} onClick={()=>{const npc=zoneNpcs.find(n=>n.x===selectedSignal.x&&n.y===selectedSignal.y);if(!npc)return;const result=interactWithNpc(npc,player.worldMenace,player.worldResources);const next=applyNpcInteraction(player,npc.faction as Faction,result.action,npc.id);update(next);setWorldMessage(result.message);setSelectedSignal(null);}}>{Math.abs(selectedSignal.x-worldTile.x)+Math.abs(selectedSignal.y-worldTile.y)<=2?'Résoudre l'action du PNJ':'Se rapprocher'}</button>}{selectedSignal.type==='event'&&<button type="button" disabled={Math.abs(selectedSignal.x-worldTile.x)+Math.abs(selectedSignal.y-worldTile.y)>0} onClick={()=>{const next=applyWorldEventState(player,worldEvent.effect,worldEvent.intensity,worldEvent.faction);update(next);setWorldEvent(generateWorldEvent(currentZone,next.worldMenace,next.worldResources,next.explorationCount,activeFactionInfluence));setWorldMessage('World event resolved: '+worldEvent.title);setWorldEventAge(0);setWaypoint(null);setAutoMove(false);setSelectedSignal(null);}}>Résoudre l'événement</button>}{selectedSignal.type==='poi'&&<button type="button" disabled={Math.abs(selectedSignal.x-worldTile.x)+Math.abs(selectedSignal.y-worldTile.y)>0} onClick={()=>{const poiIndex=currentZone.pointsOfInterest.findIndex(name=>name===selectedSignal.name);if(poiIndex<0)return;const interaction=interactWithPoi(currentZone,poiIndex);if(!interaction)return;const modifiers=getZoneDynamicModifiers(currentZone,player.worldMenace,player.worldResources,player.factionStates.find(f=>f.faction===player.faction)?.influence??100);const next=applyPoiReward(player,interaction.action,{resourceRendement:modifiers.resourceRendement,encounterChance:modifiers.encounterChance},currentZone.id+':'+poiIndex);update(next);setPoiMessage('POI resolved: '+interaction.name);setPoiAction(interaction.action);setSelectedSignal(null);setWorldMessage('POI action resolved: '+interaction.action);}}>{worldTile.x===selectedSignal.x&&worldTile.y===selectedSignal.y?'Résoudre le POI':'Aller au POI'}</button>}</div>}{nearestNpc.npc&&<button type="button" disabled={nearestNpc.distance>2} onClick={()=>{const result=interactWithNpc(nearestNpc.npc,player.worldMenace,player.worldResources);update(applyNpcInteraction(player,nearestNpc.npc.faction as Faction,result.action,nearestNpc.npc.id));setWorldMessage(result.message);}}>{nearestNpc.distance<=2?'Interagir avec le PNJ':'Se rapprocher to interact'}</button>}{poiMessage&&<p><strong>Découverte :</strong> {poiMessage} · <strong>Action :</strong> {poiAction}</p>}<p><strong>Faction :</strong> {currentZone.faction} · <strong>Niveau requis :</strong> {currentZone.level}</p><p><strong>Points d'intérêt :</strong> {currentZone.pointsOfInterest.join(' · ')}</p><div className="actions"><button onClick={doExplore}>Explorer cette zone</button><button onClick={startCombat} disabled={combat?.status==='active'}>Entrer en combat</button></div>{player.lastDiscovery&&<p><strong>Dernière découverte :</strong> {player.lastDiscovery}</p>}</div></div></div></section>
  <section className="panel"><div><span className="eyebrow">ARÈNE / COMBAT</span><h2>{combat?combat.enemy.name:'Aucune rencontre active'}</h2>{!combat&&<p>Lance une rencontre d'arène depuis cette zone.</p>}{combat&&<><p><strong>Toi :</strong> {combat.player.hp}/{combat.player.maxHp} HP · ATK {combat.player.attack} · DEF {combat.player.defense}</p><p className="combat-telemetry"><strong>ÉLAN :</strong> {combat.momentum}/3 · <strong>ÉTAT :</strong> {combat.enemyStunned?'SONNÉ · ':''}{(combat.enemyEffets.bleed??0)>0?`SAIGNEMENT ${combat.enemyEffets.bleed} · `:''}{(combat.enemyEffets.weakened??0)>0?`AFFAIBLI ${combat.enemyEffets.weakened}`:'STABLE'}</p><p><strong>Ennemi :</strong> {combat.enemy.hp}/{combat.enemy.maxHp} HP · ATK {combat.enemy.attack} · DEF {combat.enemy.defense}</p><div className="actions">{combat.status==='active'&&<><button onClick={attack} disabled={combat.turn!=='player'}>Attaquer</button><button onClick={()=>{if(combat)setCombat(playerGarde(combat));}} disabled={combat.turn!=='player'}>Garde</button><button onClick={()=>{if(combat)setCombat(playerHeavyStrike(combat));}} disabled={combat.turn!=='player'||combat.heavyCooldown>0}>Frappe lourde{combat.heavyCooldown>0?` · ${combat.heavyCooldown}`:''}</button></>}{combat.status!=='active'&&<button onClick={()=>setCombat(null)}>Quitter le combat</button>}</div><p>{combat.log.slice(-3).join(' · ')}</p>{combat.status==='victory'&&<><p><strong>Récompense RPGQG :</strong> +{getCombatReward(combat)} XP + 1 card.</p><p><strong>Bilan du combat :</strong> {getCombatSummary(combat).tours} tours · {getCombatSummary(combat).damageDealt} dégâts infligés · {getCombatSummary(combat).damageTaken} dégâts reçus.</p></>}{combat.status==='defeat'&&<p><strong>Défaite.</strong> Aucune carte gagnée.</p>}</>}</div></section>
  <section className="panel"><div><span className="eyebrow">VOYAGE</span><h2>Zones accessibles</h2></div><div className="actions">{getReachableZones(player.zoneId).map(zone=><button key={zone.id} disabled={!canEnterZone(player.level,zone)} onClick={()=>moveTo(zone.id)}>{zone.name} · Lv {zone.level}</button>)}</div><p>Zones du monde : {zones.length}</p></section>
  <section className="panel"><div><span className="eyebrow">FACTION</span><h2>Choisis ton allégeance</h2></div><div className="actions">{factions.map(f=><button className={player.faction===f?'selected':''} key={f} onClick={()=>chooseFaction(f)}>{f}</button>)}</div><p>Faction actuelle : <strong>{player.faction}</strong></p></section>
        <section className="panel hud-layer"><div><span className="eyebrow">HUD TACTIQUE · CALQUE / PRÊT POUR LA 3D</span><h2>{environmentLabels[environment.cycle]} · {weatherLabels[environment.weather]}</h2><div className="hud-strip"><div className="hud-chip"><b>ZONE</b><span>{currentZone.name}</span></div><div className="hud-chip"><b>FACTION</b><span>{factionPressure.status}</span></div><div className="hud-chip"><b>MENACE</b><span>{player.worldMenace}</span></div><div className="hud-chip"><b>PRESSION</b><span>{factionPressure.pressure}</span></div></div><div className="environment-grid"><article><strong>Cycle</strong><span>{environmentLabels[environment.cycle]}</span></article><article><strong>Météo</strong><span>{weatherLabels[environment.weather]}</span></article><article><strong>Contrôle</strong><span>{getFactionPressureLabel(factionPressure)}</span></article><article><strong>Rencontres</strong><span>{zoneModifiers.encounterChance}%</span></article></div><div className="hud-radar"><span className="radar-ring ring-a"/><span className="radar-ring ring-b"/><span className="radar-core"/><span className="radar-label">WORLD SYNC</span><i className="radar-sweep"/></div><p>HUD superposé : environnement, contrôle territorial, menace et pression alimentent la même couche de simulation pour les futurs VFX et scènes 3D.</p></div></section>
  <section className="panel"><div><span className="eyebrow">RELATIONS PNJ</span><h2>Contacts de faction</h2><p>La confiance et l'affinité sont conservées dans la sauvegarde.</p></div><div className="faction-grid">{zoneNpcs.map(npc=>{const memory=getNpcMemory(npc.id);return <article className="faction-state" key={npc.id}><strong>{npc.name}</strong><span>{npc.role} · {npc.activity}</span><span>Confiance {memory?.trust??0} · {memory?.affinity??'neutral'}</span><span>Rencontres {memory?.encounters??0}</span></article>;})}</div></section>
<section className="panel"><div><span className="eyebrow">ÉTAT DU MONDE · CALQUES</span><h2>Simulation persistante</h2><p>Menace {player.worldMenace} · Resources {player.worldResources}</p><div className="faction-grid">{player.factionStates.map(f=><article className="faction-state" key={f.faction}><strong>{f.faction}</strong><span>Influence {f.influence}</span><span>Réputation {f.reputation}</span></article>)}</div></div></section>
  <section className="panel"><div><span className="eyebrow">ÉVÉNEMENT MONDIAL ÉMERGENT</span><h2>{worldEvent.title}</h2><p>{worldEvent.description}</p><small>{worldEvent.faction} · Intensité {worldEvent.intensity} · Effet {worldEvent.effect} · Phase {getWorldEventPhase(worldEvent,worldEventAge).toUpperCase()} · Durée {worldEventAge}/{worldEvent.duration}</small><div className="quest-progress"><i style={{width:""+getWorldEventProgress(worldEvent,worldEventAge)+"%"}} /></div><div className="actions"><button type="button" onClick={()=>{const eventPoint = getWorldEventPoint(worldEvent);setWaypoint(eventPoint);setAutoMove(true);setWorldMessage('Route to event: '+worldEvent.title);}}>Naviguer vers l'événement</button><button type="button" onClick={()=>{const next=applyWorldEventState(player,worldEvent.effect,worldEvent.intensity,worldEvent.faction);update(next);setWorldEvent(generateWorldEvent(currentZone,next.worldMenace,next.worldResources,next.explorationCount,activeFactionInfluence));setWorldMessage('World event resolved: '+worldEvent.title);setWorldEventAge(0);}}>Résoudre maintenant</button></div><p className="event-signal">◈ SIGNAL D'ÉVÉNEMENT · intensité {worldEvent.intensity}</p></div></section>
<section className="panel"><div><span className="eyebrow">SCÉNARIO DYNAMIQUE</span><h2>{scenario.title}</h2><p>{scenario.description}</p><small>Menace {zoneModifiers.threat} · Rendement {zoneModifiers.resourceRendement} · Rencontre {zoneModifiers.encounterChance}%</small><div className="scenario-choices">{scenario.choices.map((choice,index)=><button key={choice} type="button" onClick={()=>{const next=applyScenarioChoice(player,index);update(next);setWorldMessage('Scenario choice: '+choice);setScenario(generateScenario(currentZone,next.level,next.explorationCount,index+1));}}>{choice}</button>)}</div></div></section>
<section className="panel"><div><span className="eyebrow">JOURNAL DES QUÊTES</span><h2>Objectifs de la frontière</h2></div><div className="quests">{player.quests.map(quest=><article className={quest.completed?'quest completed':'quest'} key={quest.id}><strong>{quest.title}</strong><span>{quest.description}</span><div className="quest-progress"><i style={{width:`${Math.min(100,Math.round((quest.progress/quest.target)*100))}%`}} /></div><small>{quest.progress}/{quest.target} · {quest.completed?'Terminé':'En cours'}</small></article>)}</div></section>
<section className="panel"><div><span className="eyebrow">CARTES RPGQG · ÉQUIPEMENT / FUSION</span><h2>Collection</h2></div>{player.cards.length===0?<p>Aucune carte pour le moment. Gagne un combat d'arène.</p>:<div className="cards">{player.cards.map(card=><article className={card.id===player.equippedCardId?'card-equipped':''} key={card.id}><strong>{card.name}</strong><span>{card.rarity} · Lv {card.level}</span><div className="card-stats"><span>⚔ Puissance <b>{card.power}</b></span><span>🛡 Défense <b>{card.defense}</b></span><span>❤ Vitalité <b>{card.vitality}</b></span><span>★ XP <b>{card.xp}/100</b></span></div><div className="actions"><button onClick={()=>update(equipCard(player,card.id===player.equippedCardId?null:card.id))}>{card.id===player.equippedCardId?'Déséquiper':'Équiper'}</button>{fusionSourceId===null?<button disabled={!player.cards.some(other=>other.id!==card.id&&other.rarity===card.rarity)} onClick={()=>setFusionSourceId(card.id)}>Fusionner</button>:fusionSourceId===card.id?<button onClick={()=>setFusionSourceId(null)}>Annuler la fusion</button>:<button disabled={card.rarity==='Legendary'||player.cards.find(other=>other.id===fusionSourceId)?.rarity!==card.rarity||player.fusionMaterials<getCardFusionCost(card.rarity)} onClick={()=>{const next=fuseCards(player,fusionSourceId,card.id);if(next!==player){update(next);setFusionSourceId(null);}}}>Fusionner with this ({getCardFusionCost(card.rarity)} materials)</button>}</div></article>)}</div>}</section></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
document.documentElement.dataset.freedomArenaBooted = 'true';