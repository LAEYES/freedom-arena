import { useEffect, useRef } from 'react';

type Props = {
  player: { x: number; y: number };
  threat: number;
  weather: string;
  cycle: string;
  enabled: boolean;
};

export function World3D({ player, threat, weather, cycle, enabled }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) return;

    const vertex = `
      attribute vec3 a_position;
      uniform mat4 u_matrix;
      varying vec3 v_position;
      void main() {
        v_position = a_position;
        gl_Position = u_matrix * vec4(a_position, 1.0);
      }
    `;
    const fragment = `
      precision mediump float;
      uniform float u_threat;
      uniform float u_time;
      uniform float u_weather;
      uniform float u_cycle;
      varying vec3 v_position;
      void main() {
        float grid = step(0.94, abs(fract(v_position.x * 2.0) - 0.5) * 2.0)
                   + step(0.94, abs(fract(v_position.z * 2.0) - 0.5) * 2.0);
        float pulse = 0.08 + 0.05 * sin(u_time * 1.5 + v_position.x * 2.0);
        float storm = u_weather * 0.06;
        float night = u_cycle * 0.12;
        vec3 base = vec3(0.025, 0.07, 0.13);
        base += vec3(0.03, 0.08, 0.12) * (1.0 - night);
        base += vec3(0.15, 0.03, 0.04) * min(u_threat / 10.0, 1.0);
        base += vec3(0.10, 0.16, 0.24) * (grid + pulse + storm);
        gl_FragColor = vec4(base, 0.96);
      }
    `;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('WebGL shader allocation failed');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(info || 'WebGL shader compilation failed');
      }
      return shader;
    };

    const program = gl.createProgram();
    if (!program) return;
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const vertices = new Float32Array([
      -1,0,-1,  1,0,-1,  1,0,1,
      -1,0,-1,  1,0,1, -1,0,1,
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    const matrixLocation = gl.getUniformLocation(program, 'u_matrix');
    const threatLocation = gl.getUniformLocation(program, 'u_threat');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const weatherLocation = gl.getUniformLocation(program, 'u_weather');
    const cycleLocation = gl.getUniformLocation(program, 'u_cycle');

    let raf = 0;
    const draw = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.01, 0.02, 0.05, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const aspect = canvas.width / Math.max(1, canvas.height);
      const tilt = 0.82;
      const sx = 1.1 / aspect;
      const sy = 0.72;
      const ox = ((player.x % 12) / 12 - 0.5) * 0.12;
      const oy = ((player.y % 12) / 12 - 0.5) * 0.08;
      const matrix = new Float32Array([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, 1, 0,
        ox, oy - 0.05, 0, 1
      ]);
      gl.uniformMatrix4fv(matrixLocation, false, matrix);
      gl.uniform1f(threatLocation, threat);
      gl.uniform1f(timeLocation, time / 1000);
      gl.uniform1f(weatherLocation, weather === 'storm' ? 1 : weather === 'mist' ? 0.5 : weather === 'frost' ? 0.25 : 0);
      gl.uniform1f(cycleLocation, cycle === 'night' ? 1 : cycle === 'dusk' ? 0.6 : cycle === 'dawn' ? 0.3 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [enabled, player.x, player.y, threat, weather, cycle]);

  return <canvas ref={ref} className="world-3d-canvas" aria-label="3D world preview" />;
}
