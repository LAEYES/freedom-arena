import { useEffect, useMemo, useRef, useState } from 'react';
import { createIsometricCamera, type IsometricCamera } from './isometricCamera';
import { ChunkManager } from './chunks';
import { findTerrainPath } from './navigation';
import { generateTerrainMap, getTerrainTile } from './terrain';
import {
  getZone,
  getZoneEnvironment,
  getZoneNpcs,
  getPoiPosition,
  getWorldEventPoint,
  type WorldEvent,
} from '../world';
import {
  buildAvatarMesh,
  buildTerrainMesh,
  pickNearestTerrainTile,
  terrainWorldHeight,
  buildNpcMesh,
  buildPoiBuildingMesh,
  buildEventBeaconMesh,
  buildBossMesh,
  buildWeatherParticleMesh,
} from './worldRenderer';

type PlayerTile = { x: number; y: number };

type World3DCanvasProps = {
  zoneId: string;
  worldTile: PlayerTile;
  worldThreat: number;
  worldResources: number;
  explorationCount: number;
  worldEvent: WorldEvent;
  onTileMove: (tileX: number, tileY: number) => boolean;
  onSwitchTo2D: () => void;
};

type MovementState = {
  path: Array<{ i: number; j: number }>;
  index: number;
  elapsed: number;
};

const ELEVATION_ANGLE = Math.atan(1 / Math.SQRT2);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function zoneSeed(zoneId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < zoneId.length; index++) {
    hash ^= zoneId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Impossible de créer un shader WebGL2.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Erreur de compilation shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexSource = `#version 300 es
    in vec3 aPosition;
    in vec3 aColor;
    uniform mat4 uViewProjection;
    out vec3 vColor;
    void main() {
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
      vColor = aColor;
    }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec3 vColor;
    uniform vec3 uTint;
    uniform vec3 uFogColor;
    uniform float uFogAmount;
    out vec4 outColor;
    void main() {
      float depthFog = smoothstep(0.20, 0.98, gl_FragCoord.z) * uFogAmount;
      vec3 litColor = vColor * uTint;
      outColor = vec4(mix(litColor, uFogColor, depthFog), 1.0);
    }
  `;
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Impossible de créer le programme WebGL2.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Erreur de liaison du programme WebGL2.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export function World3DCanvas({
  zoneId,
  worldTile,
  worldThreat,
  worldResources,
  explorationCount,
  worldEvent,
  onTileMove,
  onSwitchTo2D,
}: World3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionRef = useRef({ i: worldTile.x, j: worldTile.y });
  const movementRef = useRef<MovementState | null>(null);
  const cameraRef = useRef<IsometricCamera | null>(null);
  const onTileMoveRef = useRef(onTileMove);
  const zoomRef = useRef(1);
  const azimuthRef = useRef(Math.PI / 4);
  const [zoom, setZoom] = useState(1);
  const [azimuth, setAzimuth] = useState(Math.PI / 4);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [hud, setHud] = useState({
    x: worldTile.x,
    y: worldTile.y,
    chunks: 0,
    tileCount: 0,
    actors: 0,
    pois: 0,
    weather: 'mist',
    cycle: 'day',
    status: 'Initialisation WebGL2',
  });

  const terrainMap = useMemo(() => generateTerrainMap({
    width: 64,
    height: 64,
    seed: zoneSeed(zoneId),
    spawnI: clamp(worldTile.x, 0, 63),
    spawnJ: clamp(worldTile.y, 0, 63),
    spawnSafeRadius: 5,
  }), [zoneId]);
  const chunkManager = useMemo(() => new ChunkManager(terrainMap, {
    chunkSize: 16,
    maxCachedChunks: 32,
  }), [terrainMap]);

  const zone = getZone(zoneId);
  const environment = getZoneEnvironment(zone, worldThreat, worldResources, explorationCount);
  const sceneVertices = useMemo(() => {
    const output: number[] = [];
    const append = (mesh: Float32Array) => { for (const value of mesh) output.push(value); };
    const actors = getZoneNpcs(zone, worldThreat, worldResources, explorationCount);
    for (const actor of actors) {
      const tile = getTerrainTile(terrainMap, actor.x, actor.y);
      if (tile?.walkable) append(buildNpcMesh(actor, tile));
    }
    zone.pointsOfInterest.forEach((_, index) => {
      const position = getPoiPosition(zone, index);
      const tile = getTerrainTile(terrainMap, position.x, position.y);
      if (tile?.walkable) append(buildPoiBuildingMesh(tile, index));
    });
    const eventPosition = getWorldEventPoint(worldEvent);
    const eventTile = getTerrainTile(terrainMap, eventPosition.x, eventPosition.y);
    if (eventTile?.walkable) {
      append(buildEventBeaconMesh(eventTile, worldEvent.intensity));
      if (worldEvent.intensity >= 4) {
        const bossTile = getTerrainTile(terrainMap, Math.min(59, eventPosition.x + 2), eventPosition.y);
        if (bossTile?.walkable) append(buildBossMesh(bossTile));
      }
    }
    return new Float32Array(output);
  }, [terrainMap, zoneId, worldThreat, worldResources, explorationCount, worldEvent.id, worldEvent.intensity]);
  const weatherVertices = useMemo(() => {
    if (environment.weather === 'clear') return new Float32Array();
    return buildWeatherParticleMesh(zoneSeed(zoneId) + explorationCount * 7919,
      environment.weather === 'storm' ? 'storm' : environment.weather === 'frost' ? 'frost' : 'mist',
      environment.weather === 'storm' ? 110 : 72);
  }, [zoneId, explorationCount, environment.weather]);

  useEffect(() => { onTileMoveRef.current = onTileMove; }, [onTileMove]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { azimuthRef.current = azimuth; }, [azimuth]);

  useEffect(() => {
    if (positionRef.current.i !== worldTile.x || positionRef.current.j !== worldTile.y) {
      positionRef.current = { i: worldTile.x, j: worldTile.y };
      movementRef.current = null;
      setHud(current => ({ ...current, x: worldTile.x, y: worldTile.y }));
    }
  }, [worldTile.x, worldTile.y]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gl: WebGL2RenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let terrainBuffer: WebGLBuffer | null = null;
    let avatarBuffer: WebGLBuffer | null = null;
    let sceneBuffer: WebGLBuffer | null = null;
    let weatherBuffer: WebGLBuffer | null = null;
    let frameId = 0;
    let previousTime = 0;
    let elapsedSinceMove = 0;
    let terrainVertexCount = 0;
    let positionLocation = -1;
    let colorLocation = -1;
    let matrixLocation: WebGLUniformLocation | null = null;
    let tintLocation: WebGLUniformLocation | null = null;
    let fogColorLocation: WebGLUniformLocation | null = null;
    let fogAmountLocation: WebGLUniformLocation | null = null;
    let disposed = false;

    try {
      gl = canvas.getContext('webgl2', {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL2 indisponible sur cet appareil. Utilisez le mode Canvas 2D.');
      program = createProgram(gl);
      positionLocation = gl.getAttribLocation(program, 'aPosition');
      colorLocation = gl.getAttribLocation(program, 'aColor');
      matrixLocation = gl.getUniformLocation(program, 'uViewProjection');
      tintLocation = gl.getUniformLocation(program, 'uTint');
      fogColorLocation = gl.getUniformLocation(program, 'uFogColor');
      fogAmountLocation = gl.getUniformLocation(program, 'uFogAmount');
      if (positionLocation < 0 || colorLocation < 0 || !matrixLocation || !tintLocation || !fogColorLocation || !fogAmountLocation) {
        throw new Error('Attributs ou uniformes WebGL2 introuvables.');
      }

      const initialChunks = chunkManager.loadAround(positionRef.current, 3);
      const terrainTiles = initialChunks.flatMap(chunk => chunk.tiles);
      const terrainVertices = buildTerrainMesh(terrainTiles);
      terrainVertexCount = terrainVertices.length / 6;
      terrainBuffer = gl.createBuffer();
      avatarBuffer = gl.createBuffer();
      sceneBuffer = gl.createBuffer();
      weatherBuffer = gl.createBuffer();
      if (!terrainBuffer || !avatarBuffer || !sceneBuffer || !weatherBuffer) throw new Error('Impossible de créer les buffers GPU.');
      gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, sceneVertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, weatherBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, weatherVertices, gl.STATIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, terrainBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, terrainVertices, gl.STATIC_DRAW);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0.018, 0.030, 0.055, 1);

      setHud(current => ({
        ...current,
        chunks: initialChunks.length,
        tileCount: terrainTiles.length,
        actors: getZoneNpcs(zone, worldThreat, worldResources, explorationCount).length,
        pois: zone.pointsOfInterest.length,
        weather: environment.weather,
        cycle: environment.cycle,
        status: 'WebGL2 actif · entités 3D chargées',
      }));
      setRendererError(null);

      const bindVertexLayout = () => {
        gl!.enableVertexAttribArray(positionLocation);
        gl!.vertexAttribPointer(positionLocation, 3, gl!.FLOAT, false, 24, 0);
        gl!.enableVertexAttribArray(colorLocation);
        gl!.vertexAttribPointer(colorLocation, 3, gl!.FLOAT, false, 24, 12);
      };

      const draw = (time: number) => {
        if (disposed || !gl || !program || !terrainBuffer || !avatarBuffer) return;
        const delta = previousTime ? Math.min(50, time - previousTime) : 16.67;
        previousTime = time;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
          frameId = window.requestAnimationFrame(draw);
          return;
        }
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        const aspect = rect.width / rect.height;
        const fitHeight = Math.max(64, 92 / aspect);
        const camera = createIsometricCamera({
          target: { x: 32, y: 32, z: 0.45 },
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          azimuthRadians: azimuthRef.current,
          elevationRadians: ELEVATION_ANGLE,
          distance: 100,
          orthographicHeight: fitHeight * zoomRef.current,
          near: 0.1,
          far: 500,
        });
        cameraRef.current = camera;

        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniformMatrix4fv(matrixLocation, false, new Float32Array(camera.viewProjectionMatrix));
        const ambient = environment.cycle === 'night' ? [0.58, 0.66, 0.88]
          : environment.cycle === 'dawn' ? [1.0, 0.78, 0.62]
          : environment.cycle === 'dusk' ? [0.94, 0.70, 0.60] : [1.0, 1.0, 1.0];
        const fog = environment.weather === 'frost' ? [0.58, 0.70, 0.82]
          : environment.weather === 'storm' ? [0.16, 0.22, 0.34]
          : [0.30, 0.40, 0.52];
        gl.uniform3fv(tintLocation, ambient);
        gl.uniform3fv(fogColorLocation, fog);
        gl.uniform1f(fogAmountLocation, environment.weather === 'clear' ? 0.04 : environment.weather === 'storm' ? 0.34 : 0.20);

        gl.bindBuffer(gl.ARRAY_BUFFER, terrainBuffer);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, terrainVertexCount);

        gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, sceneVertices.length / 6);

        gl.bindBuffer(gl.ARRAY_BUFFER, weatherBuffer);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, weatherVertices.length / 6);

        const currentPosition = positionRef.current;
        const currentTile = getTerrainTile(terrainMap, currentPosition.i, currentPosition.j)
          ?? terrainMap.tiles[0];
        const avatarVertices = buildAvatarMesh(currentTile);
        gl.bindBuffer(gl.ARRAY_BUFFER, avatarBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, avatarVertices, gl.DYNAMIC_DRAW);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, avatarVertices.length / 6);

        const movement = movementRef.current;
        if (movement) {
          elapsedSinceMove += delta;
          while (elapsedSinceMove >= 145 && movementRef.current) {
            elapsedSinceMove -= 145;
            const active = movementRef.current;
            const next = active.path[active.index];
            if (!next) {
              movementRef.current = null;
              break;
            }
            const accepted = onTileMoveRef.current(next.i, next.j);
            if (!accepted) {
              movementRef.current = null;
              setHud(current => ({ ...current, status: 'Déplacement bloqué par les règles du monde existant' }));
              break;
            }
            positionRef.current = { i: next.i, j: next.j };
            active.index += 1;
            chunkManager.loadAround(positionRef.current, 3);
            setHud(current => ({
              ...current,
              x: next.i,
              y: next.j,
              status: 'Déplacement A* · terrain validé',
            }));
            if (active.index >= active.path.length) movementRef.current = null;
          }
        } else {
          elapsedSinceMove = 0;
        }

        frameId = window.requestAnimationFrame(draw);
      };

      frameId = window.requestAnimationFrame(draw);

      const startMovement = (targetI: number, targetJ: number) => {
        const current = positionRef.current;
        if (targetI < 0 || targetJ < 0 || targetI >= 60 || targetJ >= 40) return;
        const path = findTerrainPath(
          terrainMap,
          { i: current.i, j: current.j },
          { i: targetI, j: targetJ },
          { allowDiagonal: false, maxExpandedNodes: 8192 },
        );
        if (!path.length) {
          setHud(value => ({ ...value, status: 'Destination inaccessible' }));
          return;
        }
        movementRef.current = path.length > 1
          ? { path, index: 1, elapsed: 0 }
          : null;
        setHud(value => ({ ...value, status: path.length > 1 ? 'Calcul A* · déplacement' : 'Position actuelle' }));
      };

      const onPointerDown = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const camera = cameraRef.current;
        if (!camera) return;
        const tile = pickNearestTerrainTile(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          terrainMap.tiles,
          camera,
          17,
        );
        if (tile?.walkable) startMovement(tile.i, tile.j);
        canvas.focus();
      };

      const onKeyDown = (event: KeyboardEvent) => {
        const directions: Record<string, { i: number; j: number }> = {
          ArrowUp: { i: 0, j: -1 }, w: { i: 0, j: -1 }, z: { i: 0, j: -1 },
          ArrowDown: { i: 0, j: 1 }, s: { i: 0, j: 1 },
          ArrowLeft: { i: -1, j: 0 }, a: { i: -1, j: 0 }, q: { i: -1, j: 0 },
          ArrowRight: { i: 1, j: 0 }, d: { i: 1, j: 0 },
        };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        startMovement(positionRef.current.i + direction.i, positionRef.current.j + direction.j);
      };

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('keydown', onKeyDown);
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        setRendererError('Contexte graphique perdu. Rechargez le prototype ou revenez au Canvas 2D.');
      });

      return () => {
        disposed = true;
        window.cancelAnimationFrame(frameId);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('keydown', onKeyDown);
        if (gl) {
          if (terrainBuffer) gl.deleteBuffer(terrainBuffer);
          if (avatarBuffer) gl.deleteBuffer(avatarBuffer);
          if (sceneBuffer) gl.deleteBuffer(sceneBuffer);
          if (weatherBuffer) gl.deleteBuffer(weatherBuffer);
          if (program) gl.deleteProgram(program);
        }
      };
    } catch (error) {
      setRendererError(error instanceof Error ? error.message : 'Erreur initialisation WebGL2.');
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      if (gl) {
        if (terrainBuffer) gl.deleteBuffer(terrainBuffer);
        if (avatarBuffer) gl.deleteBuffer(avatarBuffer);
        if (sceneBuffer) gl.deleteBuffer(sceneBuffer);
        if (weatherBuffer) gl.deleteBuffer(weatherBuffer);
        if (program) gl.deleteProgram(program);
      }
    };
  }, [terrainMap, chunkManager, sceneVertices, weatherVertices]);

  const rotate = (delta: number) => {
    setAzimuth(current => {
      const next = (current + delta + Math.PI * 2) % (Math.PI * 2);
      return next;
    });
  };

  return (
    <div className="world3d-stage">
      <canvas
        ref={canvasRef}
        className="world3d-canvas"
        aria-label="Monde 3D isométrique Freedom Arena. Cliquez une tuile ou utilisez les flèches du clavier pour déplacer le personnage."
        tabIndex={0}
      />
      <div className="world3d-toolbar" aria-label="Commandes de la caméra 3D">
        <button type="button" title="Zoom avant" onClick={() => setZoom(value => clamp(value * 0.88, 0.52, 2.2))}>＋</button>
        <button type="button" title="Zoom arrière" onClick={() => setZoom(value => clamp(value * 1.12, 0.52, 2.2))}>－</button>
        <button type="button" title="Rotation gauche" onClick={() => rotate(-Math.PI / 12)}>↶</button>
        <button type="button" title="Rotation droite" onClick={() => rotate(Math.PI / 12)}>↷</button>
        <button type="button" title="Réinitialiser la caméra" onClick={() => { setZoom(1); setAzimuth(Math.PI / 4); }}>⌂</button>
      </div>
      <div className="world3d-hud">
        <strong>FA-WORLD · WEBGL2</strong>
        <span>Joueur {hud.x}, {hud.y} · {hud.tileCount.toLocaleString('fr-FR')} cellules · {hud.chunks} chunks</span>
        <span>{hud.actors} PNJ · {hud.pois} POI · {hud.weather} · {hud.cycle}</span>
        <span>{hud.status}</span>
      </div>
      {rendererError && (
        <div className="world3d-error" role="alert">
          <strong>Renderer 3D indisponible</strong>
          <span>{rendererError}</span>
          <button type="button" onClick={onSwitchTo2D}>Revenir au Canvas 2D</button>
        </div>
      )}
    </div>
  );
}
