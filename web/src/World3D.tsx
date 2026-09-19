import { useEffect, useRef } from 'react';

type Props = {
  player: { x: number; y: number };
  threat: number;
  weather: string;
  cycle: string;
  enabled: boolean;
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

function addGround(out:number[]) {
  out.push(-8,0,-8,8,0,-8,8,0,8,-8,0,-8,8,0,8,-8,0,8);
}

export function World3D({ player, threat, weather, cycle, enabled }: Props) {
  const ref=useRef<HTMLCanvasElement>(null);

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
      varying vec3 v_position;
      void main(){
        vec3 p=a_position;
        p.x-=u_player_x;
        p.z-=u_player_y;
        p.y+=sin(u_time*1.5+p.x*0.8+p.z*0.6)*0.012;
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
        vec3 base=vec3(0.025,0.07,0.13);
        base+=vec3(0.025,0.06,0.09)*(1.0-night);
        base+=vec3(0.15,0.025,0.035)*threatGlow;
        base+=vec3(0.08,0.13,0.22)*(grid+pulse+storm);
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

    const data:number[]=[];addGround(data);
    const buildings=[
      [-5,-4,1.6,1.1,1.5],[-2.5,-3,1.2,1.8,1.1],[1,-4,2,1.2,1.4],
      [4,-2.5,1.4,2.2,1.2],[-4,1.5,2.1,0.9,1.7],[-1,3,1.4,1.5,1.3],
      [2.5,2,2.2,1.0,1.5],[5,4,1.3,1.9,1.3]
    ];
    buildings.forEach(b=>addCube(data,...b as [number,number,number,number,number]));
    // Landmark towers around the tactical arena.
    addCube(data,0,0,0.45,2.8,0.45);
    addCube(data,-0.9,0,0.22,1.8,0.22);
    addCube(data,0.9,0,0.22,1.8,0.22);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
    // Lightweight tactical actors: player beacon, POI beacons and faction markers.
    addCube(data,0,0,0.28,0.55,0.28);
    addCube(data,-3,2,0.18,0.38,0.18);
    addCube(data,3,-1,0.18,0.48,0.18);
    const matrixLoc=gl.getUniformLocation(program,'u_matrix'),timeLoc=gl.getUniformLocation(program,'u_time');
    const pxLoc=gl.getUniformLocation(program,'u_player_x'),pyLoc=gl.getUniformLocation(program,'u_player_y');
    const threatLoc=gl.getUniformLocation(program,'u_threat'),weatherLoc=gl.getUniformLocation(program,'u_weather'),cycleLoc=gl.getUniformLocation(program,'u_cycle');

    let raf=0;
    const draw=(time:number)=>{
      const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
      canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));
      gl.viewport(0,0,canvas.width,canvas.height);gl.enable(gl.DEPTH_TEST);
      gl.clearColor(.01,.02,.05,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const aspect=canvas.width/Math.max(1,canvas.height);
      const s=0.105/Math.max(.7,aspect);
      const matrix=new Float32Array([
        s,0,0,0, 0,s*1.35,0,0, 0,0,s,0,
        0,-0.16,0,1
      ]);
      gl.uniformMatrix4fv(matrixLoc,false,matrix);
      gl.uniform1f(timeLoc,time/1000);gl.uniform1f(pxLoc,player.x%12);gl.uniform1f(pyLoc,player.y%12);
      gl.uniform1f(threatLoc,threat);
      gl.uniform1f(weatherLoc,weather==='storm'?1:weather==='mist'?.5:weather==='frost'?.25:0);
      gl.uniform1f(cycleLoc,cycle==='night'?1:cycle==='dusk'?.6:cycle==='dawn'?.3:0);
      // Additive pulse makes beacons readable without expensive particle systems.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES,0,data.length/3);
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs)};
  },[enabled,player.x,player.y,threat,weather,cycle]);

  return <canvas ref={ref} className="world-3d-canvas" aria-label="3D tactical world"/>;
}
