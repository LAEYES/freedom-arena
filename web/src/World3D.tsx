import { useEffect, useRef, type PointerEvent, type WheelEvent, type KeyboardEvent } from 'react';
import { cameraModeIndex, clampCameraZoom, normalizeCameraRotation, type CameraMode, type CameraState } from './camera';
import { generateWorldChunk } from './worldgen';

type Props = {
  player: { x: number; y: number };
  threat: number;
  weather: string;
  cycle: string;
  enabled: boolean;
  cameraMode?: CameraMode;
  cameraRotation?: number;
  zoom?: number;
  onCameraChange?: (patch: Partial<CameraState>) => void;
};

type V3 = [number, number, number];

function cubeVertices(x: number, z: number, w: number, h: number, d: number) {
  const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2;
  return [
    [x0,0,z0],[x1,0,z0],[x1,h,z0],[x0,h,z0],
    [x0,0,z1],[x1,0,z1],[x1,h,z1],[x0,h,z1],
  ] as V3[];
}

function addCube(out:number[], x:number,z:number,w:number,h:number,d:number) {
  const v=cubeVertices(x,z,w,h,d);
  const faces=[[0,1,2,0,2,3],[1,5,6,1,6,2],[5,4,7,5,7,6],[4,0,3,4,3,7],[3,2,6,3,6,7],[4,5,1,4,1,0]];
  for(const f of faces) for(const i of f) out.push(...v[i]);
}

function addTerrain(out:number[]) {
  const chunk = generateWorldChunk(0, 0, 2046);
  const tileSize = 0.25;
  for (const tile of chunk.tiles) {
    const x0 = tile.x * tileSize - 8;
    const x1 = x0 + tileSize;
    const z0 = tile.y * tileSize - 8;
    const z1 = z0 + tileSize;
    const y = tile.elevation * 0.018;
    out.push(x0,y,z0, x1,y,z0, x1,y,z1, x0,y,z0, x1,y,z1, x0,y,z1);
  }
}

export function World3D({ player, threat, weather, cycle, enabled, cameraMode = 'isometric', cameraRotation = Math.PI / 4, zoom = 1, onCameraChange }: Props) {
  const ref=useRef<HTMLCanvasElement>(null);
  const renderStateRef=useRef({player,threat,weather,cycle,cameraMode,cameraRotation,zoom});
  renderStateRef.current={player,threat,weather,cycle,cameraMode,cameraRotation,zoom};
  const pointerRef=useRef<{id:number;x:number}|null>(null);
  const onPointerDown=(event:PointerEvent<HTMLCanvasElement>)=>{pointerRef.current={id:event.pointerId,x:event.clientX};event.currentTarget.setPointerCapture(event.pointerId);};
  const onPointerMove=(event:React.PointerEvent<HTMLCanvasElement>)=>{const pointer=pointerRef.current;if(!pointer||pointer.id!==event.pointerId)return;const delta=event.clientX-pointer.x;pointer.x=event.clientX;if(Math.abs(delta)>0)onCameraChange?.({rotation:cameraRotation+delta*0.008});};
  const onPointerUp=(event:React.PointerEvent<HTMLCanvasElement>)=>{if(pointerRef.current?.id===event.pointerId)pointerRef.current=null;};
  const onWheel=(event:WheelEvent<HTMLCanvasElement>)=>{event.preventDefault();onCameraChange?.({zoom:zoom+(event.deltaY<0?0.08:-0.08)});};
  const onKeyDown=(event:KeyboardEvent<HTMLCanvasElement>)=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();onCameraChange?.({rotation:cameraRotation+(event.key==='ArrowLeft'?-1:1)*Math.PI/12});}else if(event.key==='+'||event.key==='='){event.preventDefault();onCameraChange?.({zoom:zoom+0.1});}else if(event.key==='-'){event.preventDefault();onCameraChange?.({zoom:zoom-0.1});}};

  useEffect(()=>{
    if(!enabled)return;
    const canvas=ref.current;if(!canvas)return;
    const gl=canvas.getContext('webgl',{antialias:true,alpha:true});
    if(!gl)return;

    const vertex=`
      attribute vec3 a_position;
      uniform mat4 u_matrix;
      uniform float u_time;
      uniform float u_player_x;
      uniform float u_player_y;
      uniform float u_camera_rotation;
      uniform float u_camera_zoom;
      uniform float u_camera_mode;
      varying vec3 v_position;
      void main(){
        vec3 p=a_position;
        p.x-=u_player_x;
        p.z-=u_player_y;
        float cameraCos=cos(u_camera_rotation);
        float cameraSin=sin(u_camera_rotation);
        float rotatedX=p.x*cameraCos-p.z*cameraSin;
        float rotatedZ=p.x*cameraSin+p.z*cameraCos;
        float elevation=u_camera_mode<0.5?0.615:(u_camera_mode<1.5?0.30:0.82);
        vec3 cameraPoint=vec3(rotatedX,p.y*cos(elevation)-rotatedZ*sin(elevation),p.y*sin(elevation)+rotatedZ*cos(elevation));
        float perspectiveScale=u_camera_mode>0.5&&u_camera_mode<1.5?1.0/max(0.65,1.0+cameraPoint.z*0.035):1.0;
        p=cameraPoint*perspectiveScale*u_camera_zoom;
        float walk=sin(u_time*5.0+u_player_x*0.8+u_player_y*0.6);
        p.y+=sin(u_time*1.5+p.x*0.8+p.z*0.6)*0.012;
        // Subtle procedural walk/idle motion across the tactical scene.
        p.y+=walk*0.018*(1.0-step(0.01,abs(p.y)));
        p.x+=sin(u_time*2.5+p.z)*0.006;
        v_position=p;
        gl_Position=u_matrix*vec4(p,1.0);
      }`;
    const fragment=`
      precision mediump float;
      uniform float u_threat;
      uniform float u_time;
      uniform float u_weather;
      uniform float u_cycle;
      varying vec3 v_position;
      void main(){
        float gridX=step(0.94,abs(fract(v_position.x)-0.5)*2.0);
        float gridZ=step(0.94,abs(fract(v_position.z)-0.5)*2.0);
        float grid=min(1.0,gridX+gridZ);
        float pulse=0.05+0.04*sin(u_time*2.0+v_position.x+v_position.z);
        float storm=u_weather*0.10;
        float night=u_cycle*0.18;
        float threatGlow=min(u_threat/10.0,1.0);
        // Procedural atmosphere: mist bands, rain/storm streaks and threat pulses.
        float mist=0.045*u_weather*(0.5+0.5*sin(u_time*0.7+v_position.z*1.7));
        float rain=step(0.92,fract(v_position.x*8.0+u_time*3.0))*u_weather*0.12;
        float threatPulse=threatGlow*(0.025+0.025*sin(u_time*4.0+length(v_position.xz)*3.0));
        float impact=exp(-abs(sin(u_time*2.8+length(v_position.xz)*2.0))*7.0)*(0.04+0.05*threatGlow);
        float projectile=step(0.975,fract(u_time*1.8+v_position.x*0.17-v_position.z*0.11))*0.09;
        vec3 base=vec3(0.025,0.07,0.13);
        base+=vec3(0.025,0.06,0.09)*(1.0-night);
        base+=vec3(0.15,0.025,0.035)*threatGlow;
        base+=vec3(0.08,0.13,0.22)*(grid+pulse+storm);
        base+=vec3(0.10,0.14,0.18)*(mist+rain);
        base+=vec3(0.18,0.025,0.02)*threatPulse;
        base+=vec3(0.18,0.08,0.025)*impact;
        base+=vec3(0.04,0.18,0.28)*projectile;
        float muzzle=step(0.985,fract(u_time*3.4+v_position.x*0.31+v_position.z*0.17))*0.14;
        base+=vec3(0.25,0.12,0.025)*muzzle;
        gl_FragColor=vec4(base,0.97);
      }`;

    const compile=(type:number,src:string)=>{
      const s=gl.createShader(type);if(!s)throw new Error('shader allocation failed');
      gl.shaderSource(s,src);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(info||'shader compilation failed')}
      return s;
    };
    const program=gl.createProgram();if(!program)return;
    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;
    gl.useProgram(program);

    const data:number[]=[];addTerrain(data);

    // Stylized low-poly tactical characters: torso, head and animated beacon limbs.
    const addActor=(x:number,z:number,scale:number)=>{
      addCube(data,x,z,0.34*scale,0.42*scale,0.22*scale);
      addCube(data,x,z,0.68*scale,0.20*scale,0.20*scale);
      addCube(data,x-0.16*scale,z,0.16*scale,0.34*scale,0.16*scale);
      addCube(data,x+0.16*scale,z,0.16*scale,0.34*scale,0.16*scale);
    };
    addActor(0,0,1.0);
    addActor(-3,2,0.72);
    addActor(3,-1,0.82);

    const buildings=[
      [-5,-4,1.6,1.1,1.5],[-2.5,-3,1.2,1.8,1.1],[1,-4,2,1.2,1.4],
      [4,-2.5,1.4,2.2,1.2],[-4,1.5,2.1,0.9,1.7],[-1,3,1.4,1.5,1.3],
      [2.5,2,2.2,1.0,1.5],[5,4,1.3,1.9,1.3]
    ];
    buildings.forEach(b=>addCube(data,...b as [number,number,number,number,number]));
    // Tactical FX geometry: central energy core, impact rings and threat beacons.
    addCube(data,0,0,0.08,0.9,0.08);
    addCube(data,0,0,0.12,0.08,0.9);
    addCube(data,-2.2,-1.2,0.08,0.55,0.08);
    addCube(data,2.2,1.2,0.08,0.55,0.08);

    // Landmark towers around the tactical arena.
    addCube(data,0,0,0.45,2.8,0.45);
    addCube(data,-0.9,0,0.22,1.8,0.22);
    addCube(data,0.9,0,0.22,1.8,0.22);
    // Lightweight tactical actors: player beacon, POI beacons and faction markers.
    addCube(data,0,0,0.28,0.55,0.28);
    addCube(data,-3,2,0.18,0.38,0.18);
    addCube(data,3,-1,0.18,0.48,0.18);

    // Upload only after all scene geometry has been assembled.
    const buffer=gl.createBuffer();if(!buffer)return;
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(program,'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
    const matrixLoc=gl.getUniformLocation(program,'u_matrix'),timeLoc=gl.getUniformLocation(program,'u_time');
    const pxLoc=gl.getUniformLocation(program,'u_player_x'),pyLoc=gl.getUniformLocation(program,'u_player_y');
    const threatLoc=gl.getUniformLocation(program,'u_threat'),weatherLoc=gl.getUniformLocation(program,'u_weather'),cycleLoc=gl.getUniformLocation(program,'u_cycle');
    const cameraRotationLoc=gl.getUniformLocation(program,'u_camera_rotation');
    const cameraZoomLoc=gl.getUniformLocation(program,'u_camera_zoom');
    const cameraModeLoc=gl.getUniformLocation(program,'u_camera_mode');

    let raf=0;
    let lastWidth=0,lastHeight=0;
    const draw=(time:number)=>{
      const current=renderStateRef.current;
      const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
      const width=Math.max(1,Math.floor(r.width*dpr));
      const height=Math.max(1,Math.floor(r.height*dpr));
      if(width!==lastWidth||height!==lastHeight){
        canvas.width=width;canvas.height=height;
        lastWidth=width;lastHeight=height;
      }
      gl.viewport(0,0,canvas.width,canvas.height);gl.enable(gl.DEPTH_TEST);
      gl.clearColor(.01,.02,.05,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const aspect=canvas.width/Math.max(1,canvas.height);
      const s=0.105/Math.max(.7,aspect);
      const boundedZoom=clampCameraZoom(current.zoom);
      // Orthographic projection after camera-space rotation and elevation in the vertex shader.
      const matrix=new Float32Array([
        s,0,0,0, 0,s*1.35,0,0, 0,0,s,0,
        0,-0.16,0,1
      ]);
      gl.uniformMatrix4fv(matrixLoc,false,matrix);
      gl.uniform1f(timeLoc,time/1000);gl.uniform1f(pxLoc,current.player.x%12);gl.uniform1f(pyLoc,current.player.y%12);
      gl.uniform1f(cameraRotationLoc,normalizeCameraRotation(current.cameraRotation));
      gl.uniform1f(cameraZoomLoc,boundedZoom);
      gl.uniform1f(cameraModeLoc,cameraModeIndex(current.cameraMode));
      gl.uniform1f(threatLoc,current.threat);
      gl.uniform1f(weatherLoc,current.weather==='storm'?1:current.weather==='mist'?.5:current.weather==='frost'?.25:0);
      gl.uniform1f(cycleLoc,current.cycle==='night'?1:current.cycle==='dusk'?.6:current.cycle==='dawn'?.3:0);
      // Additive pulse makes beacons readable without expensive particle systems.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES,0,data.length/3);
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs)};
  },[enabled]);

  return <canvas ref={ref} className="world-3d-canvas" aria-label="3D tactical world" tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} onKeyDown={onKeyDown}/>;
}
