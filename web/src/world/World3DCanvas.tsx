import { useEffect, useMemo, useRef, useState } from 'react';
import { createIsometricCamera, type IsometricCamera } from './isometricCamera';
import { ChunkManager, ChunkStreamScheduler, isChunkVisibleInCamera } from './chunks';
import { AdaptiveRenderScale, FrameTimeMonitor } from './worldPerformance';
import { sampleActorAnimation, selectActorAnimationLod } from './actorAnimation';
import { resolveWorldLighting } from './worldLighting';
import { selectWorldLod } from './worldLod';
import { findTerrainPath, tileKey } from './navigation';
import { advanceNpcAgents, createNpcAgents, getNpcAgentPose, type NpcAgent } from './npcSimulation';
import { createNpcBehaviorAgent, getNpcBehaviorPose, updateNpcBehavior, type NpcBehaviorAgent } from './npcBehavior';
import { canNpcPerceivePlayer } from './npcPerception';
import { receiveNpcAlertSignal, resolveNpcAlertRecipients } from './npcCoordination';
import { assignNpcDynamicRoles, getNpcTacticalProfile } from './npcTactics';
import { planNpcDirectionalCoverRoute } from './npcCover';
import { electNpcSquadLeader, formationAnchor, partitionNpcSquads, prepareNpcSquadRegroup, resolveNpcSquadLeaderHandoff, shouldRefreshNpcFormation, shouldRegroupNpcSquad } from './npcSquad';
import { advanceNpcFormationMotion, createNpcFormationMotion, getNpcFormationPose, planNpcFormation, type NpcFormationMotion } from './npcFormation';
import { generateTerrainMap, getTerrainTile } from './terrain';
import { detectBridgeLinks, getBridgeTileKeys } from './bridges';
import { generateSettlementDistrict, getSettlementInteraction } from './settlements';
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
  buildTerrainCliffMesh,
  buildRoadMesh,
  buildBridgeMesh,
  buildSettlementStructureMesh,
  pickNearestTerrainTile,
  terrainWorldHeight,
  buildNpcMesh,
  npcAnimationPhase,
  buildLandmarkMesh,
  buildEventBeaconMesh,
  buildBossMesh,
  buildWeatherParticleMesh,
  buildWorldDressingMesh,
  buildVegetationInstances,
  buildVegetationInstanceTemplate,
} from './worldRenderer';

type PlayerTile = { x: number; y: number };

type World3DCanvasProps = {
  zoneId: string;
  worldTile: PlayerTile;
  worldThreat: number;
  worldResources: number;
  explorationCount: number;
  worldEvent: WorldEvent;
  onTileMove: (tileX: number, tileY: number, viaBridge?: boolean) => boolean;
  onSignalSelect: (signal: { type: 'poi' | 'npc' | 'event' | 'settlement'; name: string; x: number; y: number }) => void;
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
    uniform float uTime;
    uniform float uWeatherMotion;
    out vec3 vColor;
    out vec3 vWorldPosition;
    void main() {
      vec3 animatedPosition = aPosition;
      float phase = uTime * 1.35 + aPosition.x * 0.17 + aPosition.y * 0.13;
      animatedPosition.x += sin(phase) * 0.035 * uWeatherMotion;
      animatedPosition.y += cos(phase * 0.73) * 0.022 * uWeatherMotion;
      animatedPosition.z += sin(phase * 0.91) * 0.018 * uWeatherMotion;
      gl_Position = uViewProjection * vec4(animatedPosition, 1.0);
      vWorldPosition = animatedPosition;
      vColor = aColor;
    }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec3 vColor;
    in vec3 vWorldPosition;
    uniform vec3 uTint;
    uniform vec3 uLightDirection;
    uniform float uAmbient;
    uniform float uDirect;
    uniform float uRimStrength;
    uniform vec3 uFogColor;
    uniform float uFogAmount;
    uniform float uChunkOpacity;
    out vec4 outColor;
    void main() {
      vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
      if (!gl_FrontFacing) normal = -normal;
      vec3 viewDirection = normalize(vec3(0.0, 0.0, 1.0) - vWorldPosition * 0.002);
      float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);
      float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.2) * uRimStrength;
      float luminance = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
      float materialResponse = mix(0.92, 1.04, smoothstep(0.18, 0.78, luminance));
      vec3 lighting = vec3(uAmbient + diffuse * uDirect) * uTint;
      vec3 litColor = vColor * lighting * materialResponse + vec3(rim);
      float depthFog = smoothstep(0.20, 0.98, gl_FragCoord.z) * uFogAmount;
      vec3 transitioned = mix(uFogColor, litColor, uChunkOpacity);
      outColor = vec4(mix(transitioned, uFogColor, depthFog), 1.0);
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


function createVegetationProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec3 aPosition;
    in vec3 aColor;
    in vec3 aInstanceOffset;
    in float aInstanceScale;
    in vec3 aInstanceTint;
    uniform mat4 uViewProjection;
    out vec3 vColor;
    out vec3 vWorldPosition;
    void main() {
      vec3 worldPosition = aPosition * aInstanceScale + aInstanceOffset;
      gl_Position = uViewProjection * vec4(worldPosition, 1.0);
      vWorldPosition = worldPosition;
      vColor = aColor * aInstanceTint;
    }
  `);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec3 vColor;
    in vec3 vWorldPosition;
    uniform vec3 uLightDirection;
    uniform float uAmbient;
    uniform float uDirect;
    uniform float uRimStrength;
    uniform vec3 uFogColor;
    uniform float uFogAmount;
    uniform float uChunkOpacity;
    out vec4 outColor;
    void main() {
      vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
      if (!gl_FrontFacing) normal = -normal;
      float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);
      float rim = pow(1.0 - abs(normal.z), 2.0) * uRimStrength;
      vec3 litVegetation = vColor * (uAmbient + diffuse * uDirect) + vec3(rim);
      float depthFog = smoothstep(0.20, 0.98, gl_FragCoord.z) * uFogAmount;
      vec3 transitioned = mix(uFogColor, litVegetation, uChunkOpacity);
      outColor = vec4(mix(transitioned, uFogColor, depthFog), 1.0);
    }
  `);
  const program = gl.createProgram();
  if (!program) throw new Error('Impossible de créer le programme de végétation instanciée.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.bindAttribLocation(program, 1, 'aColor');
  gl.bindAttribLocation(program, 2, 'aInstanceOffset');
  gl.bindAttribLocation(program, 3, 'aInstanceScale');
  gl.bindAttribLocation(program, 4, 'aInstanceTint');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Erreur de liaison du programme de végétation instanciée.';
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
  onSignalSelect,
  onSwitchTo2D,
}: World3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionRef = useRef({ i: worldTile.x, j: worldTile.y });
  const movementRef = useRef<MovementState | null>(null);
  const npcAgentsRef = useRef<NpcAgent[]>([]);
  const npcBehaviorAgentsRef = useRef<Array<NpcBehaviorAgent | null>>([]);
  const npcFormationMotionsRef = useRef<Map<string, NpcFormationMotion>>(new Map());
  const squadFormationStatesRef = useRef<Map<string, { leaderId: string; anchor: { i: number; j: number }; elapsedMs: number; memberIds: string[] }>>(new Map());
  const npcSquadMembershipRef = useRef<Map<string, string>>(new Map());
  const cameraRef = useRef<IsometricCamera | null>(null);
  const onTileMoveRef = useRef(onTileMove);
  const onSignalSelectRef = useRef(onSignalSelect);
  const zoomRef = useRef(1);
  const azimuthRef = useRef(Math.PI / 4);
  const cameraModeRef = useRef<'isometric' | 'thirdPerson'>('isometric');
  const [zoom, setZoom] = useState(1);
  const [azimuth, setAzimuth] = useState(Math.PI / 4);
  const [cameraMode, setCameraMode] = useState<'isometric' | 'thirdPerson'>('isometric');
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [hud, setHud] = useState({
    x: worldTile.x,
    y: worldTile.y,
    chunks: 0,
    pendingChunks: 0,
    streamTotal: 0,
    tileCount: 0,
    actors: 0,
    pois: 0,
    weather: 'mist',
    cycle: 'day',
    fps: 0,
    frameMs: 0,
    frameP95Ms: 0,
    cpuMs: 0,
    gpuMs: 0,
    gpuSupported: false,
    renderScale: 1,
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
  const chunkStreamer = useMemo(() => new ChunkStreamScheduler(chunkManager, terrainMap, {
    chunkSize: 16,
    transitionDurationMs: 220,
  }), [chunkManager, terrainMap]);

  const zone = getZone(zoneId);
  const environment = getZoneEnvironment(zone, worldThreat, worldResources, explorationCount);
  const sceneNpcs = useMemo(
    () => getZoneNpcs(zone, worldThreat, worldResources, explorationCount),
    [zoneId, worldThreat, worldResources, explorationCount],
  );
  const bridgeLinks = useMemo(() => detectBridgeLinks(terrainMap), [terrainMap]);
  const bridgeTileKeys = useMemo(() => getBridgeTileKeys(bridgeLinks), [bridgeLinks]);
  const settlementDistricts = useMemo(() => zone.pointsOfInterest.map((name, index) => {
    const anchor = getPoiPosition(zone, index);
    return generateSettlementDistrict(terrainMap, zone.id + ':settlement:' + index, name + ' District', { i: anchor.x, j: anchor.y }, terrainMap.seed + index * 104729);
  }).filter((district): district is NonNullable<typeof district> => district !== null), [terrainMap, zoneId]);
  const initialNpcAgents = useMemo(() => createNpcAgents(terrainMap, sceneNpcs), [terrainMap, sceneNpcs]);
  useEffect(() => {
    npcAgentsRef.current = initialNpcAgents;
    npcBehaviorAgentsRef.current = sceneNpcs.map(() => null);
    npcFormationMotionsRef.current.clear();
    squadFormationStatesRef.current.clear();
    npcSquadMembershipRef.current.clear();
  }, [initialNpcAgents, sceneNpcs]);
  const sceneVertices = useMemo(() => {
    const output: number[] = [];
    const append = (mesh: Float32Array) => { for (const value of mesh) output.push(value); };
    append(buildTerrainCliffMesh(terrainMap.tiles));
    for (const bridge of bridgeLinks) append(buildBridgeMesh(bridge.bankA, bridge.water, bridge.bankB));
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
  }, [terrainMap, bridgeLinks, worldEvent.id, worldEvent.intensity]);

  const sceneChunkMeshes = useMemo(() => {
    const chunkTiles = new Map<string, typeof terrainMap.tiles>();
    for (const tile of terrainMap.tiles) {
      const key = Math.floor(tile.i / 16) + ':' + Math.floor(tile.j / 16);
      const group = chunkTiles.get(key) ?? [];
      group.push(tile);
      chunkTiles.set(key, group);
    }
    const roadSegments = new Map<string, Array<Array<{ i: number; j: number }>>>();
    const landmarkByChunk = new Map<string, Array<{ tile: typeof terrainMap.tiles[number]; kind: 'watchtower' | 'shrine' | 'ruins' | 'gate' }>>();
    const settlementByChunk = new Map<string, Array<{ tile: typeof terrainMap.tiles[number]; kind: 'hall' | 'market' | 'workshop' | 'residence' | 'watchpost' }>>();
    const roadOrigin = getTerrainTile(terrainMap, 32, 32);
    zone.pointsOfInterest.forEach((_, index) => {
      const position = getPoiPosition(zone, index);
      const tile = getTerrainTile(terrainMap, position.x, position.y);
      if (!tile?.walkable) return;
      const key = Math.floor(tile.i / 16) + ':' + Math.floor(tile.j / 16);
      const landmarks = landmarkByChunk.get(key) ?? [];
      landmarks.push({ tile, kind: (['watchtower', 'shrine', 'ruins', 'gate'] as const)[index % 4] });
      landmarkByChunk.set(key, landmarks);
      if (!roadOrigin?.walkable) return;
      const route = findTerrainPath(
        terrainMap,
        { i: roadOrigin.i, j: roadOrigin.j, elevation: roadOrigin.elevation },
        { i: tile.i, j: tile.j, elevation: tile.elevation },
        { allowDiagonal: false, maxExpandedNodes: 8192, bridgeTiles: bridgeTileKeys },
      );
      if (route.length === 1) {
        const routeKey = Math.floor(route[0].i / 16) + ':' + Math.floor(route[0].j / 16);
        const segments = roadSegments.get(routeKey) ?? [];
        segments.push(route);
        roadSegments.set(routeKey, segments);
      }
      for (let routeIndex = 0; routeIndex < route.length - 1; routeIndex++) {
        const segment = [route[routeIndex], route[routeIndex + 1]];
        const routeKey = Math.floor(segment[0].i / 16) + ':' + Math.floor(segment[0].j / 16);
        const segments = roadSegments.get(routeKey) ?? [];
        segments.push(segment);
        roadSegments.set(routeKey, segments);
      }
    });

    for (const district of settlementDistricts) {
      for (const structure of district.structures) {
        const key = Math.floor(structure.tile.i / 16) + ':' + Math.floor(structure.tile.j / 16);
        const structures = settlementByChunk.get(key) ?? [];
        structures.push({ tile: structure.tile, kind: structure.kind });
        settlementByChunk.set(key, structures);
      }
    }

    const result = new Map<string, { high: Float32Array; medium: Float32Array; low: Float32Array }>();
    for (const [key, tiles] of chunkTiles) {
      const landmarks = landmarkByChunk.get(key) ?? [];
      const roads = roadSegments.get(key) ?? [];
      const settlementStructures = settlementByChunk.get(key) ?? [];
      const buildLod = (lod: 'high' | 'medium' | 'low') => {
        const output: number[] = [];
        const append = (mesh: Float32Array) => { for (const value of mesh) output.push(value); };
        append(buildWorldDressingMesh(tiles, terrainMap.seed, { lod, includeVegetation: false }));
        for (const landmark of landmarks) append(buildLandmarkMesh(landmark.tile, landmark.kind));
        for (const structure of settlementStructures) append(buildSettlementStructureMesh(structure.tile, structure.kind));
        for (const route of roads) append(buildRoadMesh(terrainMap.tiles, route));
        return new Float32Array(output);
      };
      result.set(key, { high: buildLod('high'), medium: buildLod('medium'), low: buildLod('low') });
    }
    return result;
  }, [terrainMap, zoneId, bridgeTileKeys, settlementDistricts]);
  const vegetationChunkInstances = useMemo(() => {
    const chunkTiles = new Map<string, typeof terrainMap.tiles>();
    for (const tile of terrainMap.tiles) {
      const key = Math.floor(tile.i / 16) + ':' + Math.floor(tile.j / 16);
      const group = chunkTiles.get(key) ?? [];
      group.push(tile);
      chunkTiles.set(key, group);
    }
    const result = new Map<string, { high: Float32Array; medium: Float32Array; low: Float32Array }>();
    for (const [key, tiles] of chunkTiles) {
      result.set(key, {
        high: buildVegetationInstances(tiles, terrainMap.seed, { lod: 'high' }),
        medium: buildVegetationInstances(tiles, terrainMap.seed, { lod: 'medium' }),
        low: buildVegetationInstances(tiles, terrainMap.seed, { lod: 'low' }),
      });
    }
    return result;
  }, [terrainMap]);

  const weatherVertices = useMemo(() => {
    if (environment.weather === 'clear') return new Float32Array();
    return buildWeatherParticleMesh(zoneSeed(zoneId) + explorationCount * 7919,
      environment.weather === 'storm' ? 'storm' : environment.weather === 'frost' ? 'frost' : 'mist',
      environment.weather === 'storm' ? 110 : 72);
  }, [zoneId, explorationCount, environment.weather, environment.cycle]);

  useEffect(() => { onTileMoveRef.current = onTileMove; }, [onTileMove]);
  useEffect(() => { onSignalSelectRef.current = onSignalSelect; }, [onSignalSelect]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { azimuthRef.current = azimuth; }, [azimuth]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);

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
    let vegetationProgram: WebGLProgram | null = null;
    let vegetationTemplateBuffer: WebGLBuffer | null = null;
    let vegetationInstanceBuffer: WebGLBuffer | null = null;
    let vegetationVertexCount = 0;
    let vegetationInstanceCount = 0;
    let vegetationDrawRanges: Array<{ key: string; offset: number; count: number }> = [];
    let vegetationBufferSignature = '';
    let vegetationMatrixLocation: WebGLUniformLocation | null = null;
    let vegetationFogColorLocation: WebGLUniformLocation | null = null;
    let vegetationFogAmountLocation: WebGLUniformLocation | null = null;
    let vegetationLightDirectionLocation: WebGLUniformLocation | null = null;
    let vegetationAmbientLocation: WebGLUniformLocation | null = null;
    let vegetationDirectLocation: WebGLUniformLocation | null = null;
    let vegetationRimLocation: WebGLUniformLocation | null = null;
    const terrainChunkBuffers = new Map<string, { buffer: WebGLBuffer; vertexCount: number }>();
    const sceneChunkBuffers = new Map<string, { buffer: WebGLBuffer; vertexCount: number }>();
    let avatarBuffer: WebGLBuffer | null = null;
    let sceneBuffer: WebGLBuffer | null = null;
    let npcBuffer: WebGLBuffer | null = null;
    let weatherBuffer: WebGLBuffer | null = null;
    let frameId = 0;
    let previousTime = 0;
    let positionLocation = -1;
    let colorLocation = -1;
    let matrixLocation: WebGLUniformLocation | null = null;
    let tintLocation: WebGLUniformLocation | null = null;
    let lightDirectionLocation: WebGLUniformLocation | null = null;
    let ambientLocation: WebGLUniformLocation | null = null;
    let directLocation: WebGLUniformLocation | null = null;
    let rimLocation: WebGLUniformLocation | null = null;
    let fogColorLocation: WebGLUniformLocation | null = null;
    let fogAmountLocation: WebGLUniformLocation | null = null;
    let timeLocation: WebGLUniformLocation | null = null;
    let weatherMotionLocation: WebGLUniformLocation | null = null;
    let chunkOpacityLocation: WebGLUniformLocation | null = null;
    let vegetationChunkOpacityLocation: WebGLUniformLocation | null = null;
    let disposed = false;
    const frameTimeMonitor = new FrameTimeMonitor(120);
    const cpuFrameMonitor = new FrameTimeMonitor(120);
    const gpuFrameMonitor = new FrameTimeMonitor(90);
    const adaptiveRenderScale = new AdaptiveRenderScale();
    const renderScaleRef = { current: 1 };
    const pendingGpuQueries: WebGLQuery[] = [];
    let activeGpuQuery: WebGLQuery | null = null;
    let lastPerformanceUpdate = 0;

    try {
      gl = canvas.getContext('webgl2', {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL2 indisponible sur cet appareil. Utilisez le mode Canvas 2D.');
      const gpuTimerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
        TIME_ELAPSED_EXT: number;
        GPU_DISJOINT_EXT: number;
      } | null;
      program = createProgram(gl);
      vegetationProgram = createVegetationProgram(gl);
      positionLocation = gl.getAttribLocation(program, 'aPosition');
      colorLocation = gl.getAttribLocation(program, 'aColor');
      matrixLocation = gl.getUniformLocation(program, 'uViewProjection');
      tintLocation = gl.getUniformLocation(program, 'uTint');
      lightDirectionLocation = gl.getUniformLocation(program, 'uLightDirection');
      ambientLocation = gl.getUniformLocation(program, 'uAmbient');
      directLocation = gl.getUniformLocation(program, 'uDirect');
      rimLocation = gl.getUniformLocation(program, 'uRimStrength');
      fogColorLocation = gl.getUniformLocation(program, 'uFogColor');
      fogAmountLocation = gl.getUniformLocation(program, 'uFogAmount');
      timeLocation = gl.getUniformLocation(program, 'uTime');
      weatherMotionLocation = gl.getUniformLocation(program, 'uWeatherMotion');
      chunkOpacityLocation = gl.getUniformLocation(program, 'uChunkOpacity');
      if (positionLocation < 0 || colorLocation < 0 || !matrixLocation || !tintLocation || !lightDirectionLocation || !ambientLocation || !directLocation || !rimLocation || !fogColorLocation || !fogAmountLocation || !timeLocation || !weatherMotionLocation || !chunkOpacityLocation) {
        throw new Error('Attributs ou uniformes WebGL2 introuvables.');
      }

      chunkStreamer.requestAround(positionRef.current, 4);
      const initialStream = chunkStreamer.tick(16.67, 4);
      const initialChunks = initialStream.chunks;
      const terrainTiles = initialChunks.flatMap(chunk => chunk.tiles);
      avatarBuffer = gl.createBuffer();
      sceneBuffer = gl.createBuffer();
      npcBuffer = gl.createBuffer();
      weatherBuffer = gl.createBuffer();
      vegetationTemplateBuffer = gl.createBuffer();
      vegetationInstanceBuffer = gl.createBuffer();
      if (!avatarBuffer || !sceneBuffer || !npcBuffer || !weatherBuffer || !vegetationTemplateBuffer || !vegetationInstanceBuffer || !vegetationProgram) throw new Error('Impossible de créer les buffers GPU.');
      gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, sceneVertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, npcBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, weatherBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, weatherVertices, gl.STATIC_DRAW);
      const vegetationTemplate = buildVegetationInstanceTemplate();
      vegetationVertexCount = vegetationTemplate.length / 6;
      gl.bindBuffer(gl.ARRAY_BUFFER, vegetationTemplateBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vegetationTemplate, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, vegetationInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
      vegetationMatrixLocation = gl.getUniformLocation(vegetationProgram, 'uViewProjection');
      vegetationFogColorLocation = gl.getUniformLocation(vegetationProgram, 'uFogColor');
      vegetationFogAmountLocation = gl.getUniformLocation(vegetationProgram, 'uFogAmount');
      vegetationLightDirectionLocation = gl.getUniformLocation(vegetationProgram, 'uLightDirection');
      vegetationAmbientLocation = gl.getUniformLocation(vegetationProgram, 'uAmbient');
      vegetationDirectLocation = gl.getUniformLocation(vegetationProgram, 'uDirect');
      vegetationRimLocation = gl.getUniformLocation(vegetationProgram, 'uRimStrength');
      vegetationChunkOpacityLocation = gl.getUniformLocation(vegetationProgram, 'uChunkOpacity');
      if (!vegetationMatrixLocation || !vegetationFogColorLocation || !vegetationFogAmountLocation || !vegetationLightDirectionLocation || !vegetationAmbientLocation || !vegetationDirectLocation || !vegetationRimLocation || !vegetationChunkOpacityLocation) {
        throw new Error('Uniformes du programme de végétation instanciée introuvables.');
      }

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0.018, 0.030, 0.055, 1);

      setHud(current => ({
        ...current,
        chunks: initialChunks.length,
        pendingChunks: initialStream.pending,
        streamTotal: initialStream.requested,
        tileCount: terrainTiles.length,
        actors: sceneNpcs.length,
        pois: zone.pointsOfInterest.length,
        weather: environment.weather,
        cycle: environment.cycle,
        gpuSupported: Boolean(gpuTimerExtension),
        status: 'WebGL2 actif · profilage CPU/GPU',
      }));
      setRendererError(null);

      const bindVertexLayout = () => {
        gl!.enableVertexAttribArray(positionLocation);
        gl!.vertexAttribPointer(positionLocation, 3, gl!.FLOAT, false, 24, 0);
        gl!.enableVertexAttribArray(colorLocation);
        gl!.vertexAttribPointer(colorLocation, 3, gl!.FLOAT, false, 24, 12);
      };

      const draw = (time: number) => {
        if (disposed || !gl || !program || !avatarBuffer) return;
        const cpuFrameStart = performance.now();
        const delta = previousTime ? Math.min(50, time - previousTime) : 16.67;
        previousTime = time;
        if (delta > 0) frameTimeMonitor.add(delta);
        if (gpuTimerExtension) {
          const disjoint = Boolean(gl.getParameter(gpuTimerExtension.GPU_DISJOINT_EXT));
          if (disjoint) {
            for (const query of pendingGpuQueries) gl.deleteQuery(query);
            pendingGpuQueries.length = 0;
            gpuFrameMonitor.reset();
          } else {
            const stillPending: WebGLQuery[] = [];
            for (const query of pendingGpuQueries) {
              if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
                const elapsedNs = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
                const elapsedMs = elapsedNs / 1_000_000;
                if (Number.isFinite(elapsedMs) && elapsedMs > 0) gpuFrameMonitor.add(elapsedMs);
                gl.deleteQuery(query);
              } else {
                stillPending.push(query);
              }
            }
            pendingGpuQueries.splice(0, pendingGpuQueries.length, ...stillPending);
          }
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
          frameId = window.requestAnimationFrame(draw);
          return;
        }
        const dpr = Math.min((window.devicePixelRatio || 1) * renderScaleRef.current, 1.75);
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        const aspect = rect.width / rect.height;
        const fitHeight = Math.max(64, 92 / aspect);
        const activeCameraMode = cameraModeRef.current;
        const followedTile = getTerrainTile(terrainMap, positionRef.current.i, positionRef.current.j);
        const cameraTarget = activeCameraMode === 'thirdPerson'
          ? {
            x: positionRef.current.i + 0.5,
            y: positionRef.current.j + 0.5,
            z: terrainWorldHeight(followedTile ?? { elevation: 0 }) + 1.15,
          }
          : { x: 32, y: 32, z: 0.45 };
        const camera = createIsometricCamera({
          target: cameraTarget,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          azimuthRadians: azimuthRef.current,
          elevationRadians: activeCameraMode === 'thirdPerson' ? 0.34 : ELEVATION_ANGLE,
          distance: activeCameraMode === 'thirdPerson' ? 10.5 * zoomRef.current : 100,
          orthographicHeight: fitHeight * zoomRef.current,
          near: activeCameraMode === 'thirdPerson' ? 0.05 : 0.1,
          far: activeCameraMode === 'thirdPerson' ? 240 : 500,
          projectionMode: activeCameraMode === 'thirdPerson' ? 'perspective' : 'orthographic',
          fovRadians: Math.PI / 3,
        });
        cameraRef.current = camera;

        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (gpuTimerExtension && pendingGpuQueries.length < 3) {
          activeGpuQuery = gl.createQuery();
          if (activeGpuQuery) gl.beginQuery(gpuTimerExtension.TIME_ELAPSED_EXT, activeGpuQuery);
        }
        gl.useProgram(program);
        gl.uniformMatrix4fv(matrixLocation, false, new Float32Array(camera.viewProjectionMatrix));
        const lighting = resolveWorldLighting(environment.cycle, environment.weather);
        gl.uniform3fv(tintLocation, lighting.tint);
        gl.uniform3fv(lightDirectionLocation, lighting.lightDirection);
        gl.uniform1f(ambientLocation, lighting.ambient);
        gl.uniform1f(directLocation, lighting.direct);
        gl.uniform1f(rimLocation, lighting.rim);
        gl.uniform3fv(fogColorLocation, lighting.fogColor);
        gl.uniform1f(fogAmountLocation, lighting.fogAmount);
        gl.uniform1f(timeLocation, time * 0.001);
        gl.uniform1f(weatherMotionLocation, 0);
        gl.uniform1f(chunkOpacityLocation, 1);

        const chunkCenter = activeCameraMode === 'thirdPerson'
          ? positionRef.current
          : { i: 32, j: 32 };
        chunkStreamer.requestAround(chunkCenter, activeCameraMode === 'thirdPerson' ? 1 : 4);
        const streamFrame = chunkStreamer.tick(delta, 2);
        const candidateChunks = streamFrame.chunks;
        const visibleChunks = candidateChunks.filter(chunk => isChunkVisibleInCamera(chunk, camera));
        const visibleChunkKeys = new Set(visibleChunks.map(chunk => chunk.key));
        for (const chunk of visibleChunks) {
          let cached = terrainChunkBuffers.get(chunk.key);
          if (!cached) {
            const buffer = gl.createBuffer();
            if (!buffer) throw new Error('Impossible de créer le buffer GPU du chunk ' + chunk.key);
            const vertices = buildTerrainMesh(chunk.tiles);
            cached = { buffer, vertexCount: vertices.length / 6 };
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
          } else {
            terrainChunkBuffers.delete(chunk.key);
          }
          terrainChunkBuffers.set(chunk.key, cached);
        }
        while (terrainChunkBuffers.size > 32) {
          const oldestKey = terrainChunkBuffers.keys().next().value as string | undefined;
          if (!oldestKey || visibleChunkKeys.has(oldestKey)) break;
          const oldest = terrainChunkBuffers.get(oldestKey);
          if (oldest) gl.deleteBuffer(oldest.buffer);
          terrainChunkBuffers.delete(oldestKey);
        }
        for (const chunk of visibleChunks) {
          const cached = terrainChunkBuffers.get(chunk.key);
          if (!cached) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer);
          bindVertexLayout();
          gl.uniform1f(chunkOpacityLocation, chunkStreamer.getOpacity(chunk.key));
          gl.drawArrays(gl.TRIANGLES, 0, cached.vertexCount);
        }
        gl.uniform1f(chunkOpacityLocation, 1);
        const visibleTileCount = visibleChunks.reduce((sum, chunk) => sum + chunk.tiles.length, 0);
        setHud(current => current.chunks === visibleChunks.length
          && current.pendingChunks === streamFrame.pending && current.streamTotal === streamFrame.requested
          && current.tileCount === visibleTileCount
          ? current
          : { ...current, chunks: visibleChunks.length, pendingChunks: streamFrame.pending, streamTotal: streamFrame.requested, tileCount: visibleTileCount });

        const sceneLodKeys = new Set<string>();
        for (const chunk of visibleChunks) {
          const reference = activeCameraMode === 'thirdPerson'
            ? positionRef.current
            : { i: 32, j: 32 };
          const distance = Math.hypot(
            chunk.originI + chunk.width / 2 - reference.i,
            chunk.originJ + chunk.height / 2 - reference.j,
          );
          const lod = selectWorldLod(distance);
          const geometry = sceneChunkMeshes.get(chunk.key)?.[lod];
          if (!geometry || geometry.length === 0) continue;
          const cacheKey = chunk.key + ':' + lod;
          sceneLodKeys.add(cacheKey);
          let cached = sceneChunkBuffers.get(cacheKey);
          if (!cached) {
            const buffer = gl.createBuffer();
            if (!buffer) throw new Error('Impossible de créer le buffer GPU de décor ' + cacheKey);
            cached = { buffer, vertexCount: geometry.length / 6 };
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
          } else {
            sceneChunkBuffers.delete(cacheKey);
          }
          sceneChunkBuffers.set(cacheKey, cached);
        }
        for (const cacheKey of sceneLodKeys) {
          const cached = sceneChunkBuffers.get(cacheKey);
          if (!cached) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER, cached.buffer);
          bindVertexLayout();
          const chunkKeyForFade = cacheKey.split(':').slice(0, 2).join(':');
          gl.uniform1f(chunkOpacityLocation, chunkStreamer.getOpacity(chunkKeyForFade));
          gl.drawArrays(gl.TRIANGLES, 0, cached.vertexCount);
        }
        gl.uniform1f(chunkOpacityLocation, 1);
        while (sceneChunkBuffers.size > 32) {
          const oldestKey = sceneChunkBuffers.keys().next().value as string | undefined;
          if (!oldestKey || sceneLodKeys.has(oldestKey)) break;
          const oldest = sceneChunkBuffers.get(oldestKey);
          if (oldest) gl.deleteBuffer(oldest.buffer);
          sceneChunkBuffers.delete(oldestKey);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, sceneVertices.length / 6);

        const vegetationParts: Float32Array[] = [];
        const vegetationKeys: string[] = [];
        const nextVegetationRanges: Array<{ key: string; offset: number; count: number }> = [];
        let nextVegetationOffset = 0;
        for (const chunk of visibleChunks) {
          const reference = activeCameraMode === 'thirdPerson'
            ? positionRef.current
            : { i: 32, j: 32 };
          const distance = Math.hypot(
            chunk.originI + chunk.width / 2 - reference.i,
            chunk.originJ + chunk.height / 2 - reference.j,
          );
          const lod = selectWorldLod(distance);
          const instances = vegetationChunkInstances.get(chunk.key)?.[lod];
          if (instances?.length) {
            vegetationParts.push(instances);
            vegetationKeys.push(chunk.key + ':' + lod);
            const count = instances.length / 7;
            nextVegetationRanges.push({ key: chunk.key, offset: nextVegetationOffset, count });
            nextVegetationOffset += count;
          }
        }
        const nextVegetationSignature = vegetationKeys.join('|');
        if (nextVegetationSignature !== vegetationBufferSignature) {
          const totalLength = vegetationParts.reduce((sum, part) => sum + part.length, 0);
          const combined = new Float32Array(totalLength);
          let offset = 0;
          for (const part of vegetationParts) {
            combined.set(part, offset);
            offset += part.length;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, vegetationInstanceBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, combined, gl.DYNAMIC_DRAW);
          vegetationInstanceCount = combined.length / 7;
          vegetationDrawRanges = nextVegetationRanges;
          vegetationBufferSignature = nextVegetationSignature;
        }
        if (vegetationInstanceCount > 0 && vegetationProgram && vegetationTemplateBuffer && vegetationInstanceBuffer) {
          gl.useProgram(vegetationProgram);
          gl.uniformMatrix4fv(vegetationMatrixLocation, false, new Float32Array(camera.viewProjectionMatrix));
          gl.uniform3fv(vegetationFogColorLocation, lighting.fogColor);
          gl.uniform1f(vegetationFogAmountLocation, lighting.fogAmount);
          gl.uniform3fv(vegetationLightDirectionLocation, lighting.lightDirection);
          gl.uniform1f(vegetationAmbientLocation, lighting.ambient);
          gl.uniform1f(vegetationDirectLocation, lighting.direct);
          gl.uniform1f(vegetationRimLocation, lighting.rim);
          gl.bindBuffer(gl.ARRAY_BUFFER, vegetationTemplateBuffer);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
          gl.vertexAttribDivisor(0, 0);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
          gl.vertexAttribDivisor(1, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, vegetationInstanceBuffer);
          gl.enableVertexAttribArray(2);
          gl.vertexAttribDivisor(2, 1);
          gl.enableVertexAttribArray(3);
          gl.vertexAttribDivisor(3, 1);
          gl.enableVertexAttribArray(4);
          gl.vertexAttribDivisor(4, 1);
          for (const range of vegetationDrawRanges) {
            const byteOffset = range.offset * 28;
            gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, byteOffset);
            gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, byteOffset + 12);
            gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 28, byteOffset + 16);
            gl.uniform1f(vegetationChunkOpacityLocation, chunkStreamer.getOpacity(range.key));
            gl.drawArraysInstanced(gl.TRIANGLES, 0, vegetationVertexCount, range.count);
          }
          gl.uniform1f(vegetationChunkOpacityLocation, 1);
          for (const attribute of [2, 3, 4]) {
            gl.vertexAttribDivisor(attribute, 0);
            gl.disableVertexAttribArray(attribute);
          }
          gl.useProgram(program);
        }

        npcAgentsRef.current = advanceNpcAgents(npcAgentsRef.current, delta);
        for (const squadState of squadFormationStatesRef.current.values()) squadState.elapsedMs += Number.isFinite(delta) ? Math.max(0, Math.min(100, delta)) : 0;
        const npcOutput: number[] = [];
        const playerTile = { i: positionRef.current.i, j: positionRef.current.j };
        const patrolPoses = npcAgentsRef.current.map(getNpcAgentPose);
        for (let index = 0; index < sceneNpcs.length; index++) {
          const actor = sceneNpcs[index];
          const patrolAgent = npcAgentsRef.current[index];
          if (!patrolAgent) continue;
          const patrolPose = patrolPoses[index];
          let behaviorAgent = npcBehaviorAgentsRef.current[index];
          if (!behaviorAgent) {
            const patrolTile = { i: Math.round(patrolPose.x), j: Math.round(patrolPose.y) };
            const patrolFrom = patrolAgent.path[patrolAgent.fromIndex];
            const patrolTo = patrolAgent.path[patrolAgent.toIndex] ?? patrolFrom;
            const patrolFacing = { i: patrolTo.i - patrolFrom.i, j: patrolTo.j - patrolFrom.j };
            if (canNpcPerceivePlayer(terrainMap, patrolTile, patrolFacing, playerTile, { radius: 7, halfAngleDegrees: 60 })) {
              const home = { i: actor.x, j: actor.y };
              const created = createNpcBehaviorAgent(actor.id, home);
              behaviorAgent = {
                ...created, position: patrolTile, previousPosition: patrolTile,
                facing: patrolFacing,
              };
            }
          }

          let pose = patrolPose;
          let groundZ: number;
          if (behaviorAgent) {
            const blockedTiles = new Set<string>();
            for (let otherIndex = 0; otherIndex < sceneNpcs.length; otherIndex++) {
              if (otherIndex === index) continue;
              const otherBehavior = npcBehaviorAgentsRef.current[otherIndex];
              const otherPose = otherBehavior
                ? getNpcBehaviorPose(otherBehavior)
                : patrolPoses[otherIndex];
              if (otherPose) blockedTiles.add(tileKey(Math.round(otherPose.x), Math.round(otherPose.y)));
            }
            const previousBehaviorState = behaviorAgent.state;
            const tacticalProfile = getNpcTacticalProfile(actor.activity);
            behaviorAgent = updateNpcBehavior(terrainMap, behaviorAgent, playerTile, delta, {
              blockedTiles,
              alertRadius: tacticalProfile.alertRadius,
              chaseRadius: tacticalProfile.chaseRadius,
              disengageRadius: tacticalProfile.disengageRadius,
              maxChaseTiles: tacticalProfile.maxChaseTiles,
              stepDurationMs: tacticalProfile.stepDurationMs,
              alertHoldMs: 6000,
            });
            const squadId = npcSquadMembershipRef.current.get(actor.id);
            const currentSquad = squadId ? squadFormationStatesRef.current.get(squadId) : undefined;
            if (currentSquad && shouldRegroupNpcSquad(actor.id, currentSquad.memberIds, previousBehaviorState, behaviorAgent.state)) {
              for (let memberIndex = 0; memberIndex < sceneNpcs.length; memberIndex++) {
                const member = sceneNpcs[memberIndex];
                if (!currentSquad.memberIds.includes(member.id)) continue;
                const memberAgent: NpcBehaviorAgent | null = memberIndex === index ? behaviorAgent : npcBehaviorAgentsRef.current[memberIndex];
                if (!memberAgent || (memberAgent.state !== 'CHASE' && memberAgent.state !== 'RETURN')) continue;
                const regroupedAgent: NpcBehaviorAgent = prepareNpcSquadRegroup(memberAgent);
                npcBehaviorAgentsRef.current[memberIndex] = regroupedAgent;
                if (memberIndex === index) behaviorAgent = regroupedAgent;
                npcFormationMotionsRef.current.delete(member.id);
              }
            }
            if (!behaviorAgent) continue;
            npcBehaviorAgentsRef.current[index] = behaviorAgent;
            if (previousBehaviorState !== 'ALERT' && behaviorAgent.state === 'ALERT') {
              const sourceTile = behaviorAgent.position;
              const candidates = sceneNpcs.map((candidate, candidateIndex) => {
                const active = npcBehaviorAgentsRef.current[candidateIndex];
                const patrol = patrolPoses[candidateIndex];
                return {
                  id: candidate.id,
                  position: active?.position ?? {
                    i: Math.round(patrol?.x ?? candidate.x),
                    j: Math.round(patrol?.y ?? candidate.y),
                  },
                };
              });
              const recipients = new Set(resolveNpcAlertRecipients(
                terrainMap, { id: actor.id, position: sourceTile, radius: 6 }, candidates,
              ));
              for (let recipientIndex = 0; recipientIndex < sceneNpcs.length; recipientIndex++) {
                if (recipientIndex === index || !recipients.has(sceneNpcs[recipientIndex].id)) continue;
                const recipientActor = sceneNpcs[recipientIndex];
                const recipientPatrol = patrolPoses[recipientIndex];
                const recipientTile = {
                  i: Math.round(recipientPatrol?.x ?? recipientActor.x),
                  j: Math.round(recipientPatrol?.y ?? recipientActor.y),
                };
                const recipientAgent = npcBehaviorAgentsRef.current[recipientIndex]
                  ?? {
                    ...createNpcBehaviorAgent(recipientActor.id, { i: recipientActor.x, j: recipientActor.y }),
                    position: recipientTile,
                    previousPosition: recipientTile,
                  };
                npcBehaviorAgentsRef.current[recipientIndex] = receiveNpcAlertSignal(recipientAgent, sourceTile);
              }
              const squadCandidates = sceneNpcs.flatMap((member, memberIndex) => {
                const active = npcBehaviorAgentsRef.current[memberIndex];
                if (!active || active.state !== 'ALERT') return [];
                return [{ id: member.id, position: active.position, state: active.state }];
              });
              const localSquads = partitionNpcSquads(terrainMap, squadCandidates, 6);
              for (const squad of localSquads) {
                const squadLeader = electNpcSquadLeader(squad);
                if (!squadLeader) continue;
                const leaderIndex = sceneNpcs.findIndex(member => member.id === squadLeader.id);
                const leaderAgent = npcBehaviorAgentsRef.current[leaderIndex];
                if (!leaderAgent) continue;
                const memberIds = squad.map(member => member.id);
                const groupMembers = squad.filter(member => member.id !== squadLeader.id).flatMap(member => {
                  const memberIndex = sceneNpcs.findIndex(candidate => candidate.id === member.id);
                  const memberAgent = npcBehaviorAgentsRef.current[memberIndex];
                  if (!memberAgent) return [];
                  return [{ id: member.id, role: getNpcTacticalProfile(sceneNpcs[memberIndex].activity).role, position: memberAgent.position }];
                });
                const occupied = new Set<string>([tileKey(squadLeader.position.i, squadLeader.position.j)]);
                for (const member of groupMembers) occupied.add(tileKey(member.position.i, member.position.j));
                const dynamicRoles = new Map(assignNpcDynamicRoles(groupMembers.map(member => ({ id: member.id, position: member.position })), playerTile)
                  .map(assignment => [assignment.id, assignment.role]));
                const formationMembers = groupMembers.map(member => ({ ...member, role: dynamicRoles.get(member.id) ?? member.role }));
                const formationPlans = planNpcFormation(terrainMap, squadLeader.position, leaderAgent.facing, formationMembers, occupied);
                for (const plan of formationPlans) {
                  const member = groupMembers.find(candidate => candidate.id === plan.id);
                  let selectedPlan = plan;
                  if (plan.role === 'GUARD' && member) {
                    const coverBlocked = new Set(occupied);
                    coverBlocked.delete(tileKey(member.position.i, member.position.j));
                    const coverRoute = planNpcDirectionalCoverRoute(terrainMap, member.position, playerTile, 8, coverBlocked);
                    if (coverRoute) selectedPlan = { ...plan, slot: coverRoute.position, path: coverRoute.path };
                  }
                  npcFormationMotionsRef.current.set(plan.id, createNpcFormationMotion(selectedPlan, 460));
                }
                for (const memberId of memberIds) npcSquadMembershipRef.current.set(memberId, squadLeader.id);
                squadFormationStatesRef.current.set(squadLeader.id, {
                  leaderId: squadLeader.id, anchor: { i: squadLeader.position.i, j: squadLeader.position.j },
                  elapsedMs: 0, memberIds,
                });
              }
            }
            const memberSquadId = npcSquadMembershipRef.current.get(actor.id);
            const squadState = memberSquadId ? squadFormationStatesRef.current.get(memberSquadId) : undefined;
            if (squadState) {
              const activeSquad = squadState.memberIds.flatMap(memberId => {
                const memberIndex = sceneNpcs.findIndex(member => member.id === memberId);
                const active = npcBehaviorAgentsRef.current[memberIndex];
                if (!active || active.state === 'IDLE' || active.state === 'PATROL') return [];
                return [{ id: memberId, position: active.position, state: active.state }];
              });
              const electedLeader = electNpcSquadLeader(activeSquad);
              const handoff = resolveNpcSquadLeaderHandoff(squadState.leaderId, activeSquad);
              if (handoff) {
                squadFormationStatesRef.current.delete(squadState.leaderId);
                squadState.leaderId = handoff.id;
                squadState.anchor = { i: handoff.position.i, j: handoff.position.j };
                squadState.elapsedMs = 0;
                squadFormationStatesRef.current.set(handoff.id, squadState);
                for (const memberId of squadState.memberIds) npcSquadMembershipRef.current.set(memberId, handoff.id);
              }
              if (electedLeader?.id === actor.id && squadState.leaderId === actor.id
                && shouldRefreshNpcFormation(squadState.anchor, behaviorAgent.position, squadState.elapsedMs, { displacementTiles: 2, cooldownMs: 900 })) {
                const leaderTile = behaviorAgent.position;
                const members = squadState.memberIds.flatMap(memberId => {
                  if (memberId === actor.id) return [];
                  const memberIndex = sceneNpcs.findIndex(member => member.id === memberId);
                  const memberAgent = npcBehaviorAgentsRef.current[memberIndex];
                  if (!memberAgent || memberAgent.state !== 'ALERT') return [];
                  const existingMotion = npcFormationMotionsRef.current.get(memberId);
                  const existingPose = existingMotion ? getNpcFormationPose(existingMotion) : null;
                  const current = existingPose ? { i: Math.round(existingPose.x), j: Math.round(existingPose.y) } : memberAgent.position;
                  return [{ actor: sceneNpcs[memberIndex], index: memberIndex, agent: memberAgent, position: current }];
                });
                const occupied = new Set<string>([tileKey(leaderTile.i, leaderTile.j)]);
                for (const member of members) occupied.add(tileKey(member.position.i, member.position.j));
                const roleAssignments = new Map(assignNpcDynamicRoles(members.map(member => ({ id: member.actor.id, position: member.position })), playerTile)
                  .map(assignment => [assignment.id, assignment.role]));
                const plans = planNpcFormation(terrainMap, leaderTile, behaviorAgent.facing,
                  members.map(member => ({ id: member.actor.id, role: roleAssignments.get(member.actor.id) ?? getNpcTacticalProfile(member.actor.activity).role, position: member.position })), occupied);
                for (const member of members) {
                  npcFormationMotionsRef.current.delete(member.actor.id);
                  npcBehaviorAgentsRef.current[member.index] = {
                    ...member.agent, position: member.position, previousPosition: member.position,
                    path: [member.position], pathIndex: 0, stepElapsedMs: 0, targetKey: null,
                  };
                }
                for (const plan of plans) {
                  const member = members.find(candidate => candidate.actor.id === plan.id);
                  let selectedPlan = plan;
                  if (plan.role === 'GUARD' && member) {
                    const coverBlocked = new Set(occupied);
                    coverBlocked.delete(tileKey(member.position.i, member.position.j));
                    const coverRoute = planNpcDirectionalCoverRoute(terrainMap, member.position, playerTile, 8, coverBlocked);
                    if (coverRoute) selectedPlan = { ...plan, slot: coverRoute.position, path: coverRoute.path };
                  }
                  npcFormationMotionsRef.current.set(plan.id, createNpcFormationMotion(selectedPlan, 460));
                }
                squadState.anchor = formationAnchor({ x: leaderTile.i, y: leaderTile.j });
                squadState.elapsedMs = 0;
              }
            }
            pose = getNpcBehaviorPose(behaviorAgent);
            const formationMotion = npcFormationMotionsRef.current.get(actor.id);
            const formationActive = !!formationMotion && behaviorAgent.state === 'ALERT';
            if (formationMotion && behaviorAgent.state === 'ALERT') {
              const advancedMotion = advanceNpcFormationMotion(formationMotion, delta);
              const formationPose = getNpcFormationPose(advancedMotion);
              pose = formationPose;
              const arrived = advancedMotion.segmentIndex >= advancedMotion.path.length - 1;
              if (arrived) {
                const slot = advancedMotion.path[advancedMotion.path.length - 1];
                behaviorAgent = {
                  ...behaviorAgent,
                  position: slot,
                  previousPosition: slot,
                  path: [slot],
                  pathIndex: 0,
                  stepElapsedMs: 0,
                  targetKey: null,
                };
                npcBehaviorAgentsRef.current[index] = behaviorAgent;
                npcFormationMotionsRef.current.delete(actor.id);
              } else {
                npcFormationMotionsRef.current.set(actor.id, advancedMotion);
              }
            } else if (formationMotion) {
              npcFormationMotionsRef.current.delete(actor.id);
            }
            const fromTile = getTerrainTile(terrainMap, behaviorAgent.position.i, behaviorAgent.position.j);
            const toTile = getTerrainTile(terrainMap, behaviorAgent.path[behaviorAgent.pathIndex + 1]?.i ?? behaviorAgent.position.i,
              behaviorAgent.path[behaviorAgent.pathIndex + 1]?.j ?? behaviorAgent.position.j);
            const tile = getTerrainTile(terrainMap, Math.round(pose.x), Math.round(pose.y));
            if (!fromTile || !toTile || !tile?.walkable) continue;
            groundZ = formationActive
              ? terrainWorldHeight(tile)
              : terrainWorldHeight(fromTile) + (terrainWorldHeight(toTile) - terrainWorldHeight(fromTile)) * pose.progress;
          } else {
            const fromTile = getTerrainTile(terrainMap, patrolAgent.path[patrolAgent.fromIndex].i, patrolAgent.path[patrolAgent.fromIndex].j);
            const toTile = getTerrainTile(terrainMap, patrolAgent.path[patrolAgent.toIndex].i, patrolAgent.path[patrolAgent.toIndex].j);
            const tile = getTerrainTile(terrainMap, Math.round(pose.x), Math.round(pose.y));
            if (!fromTile || !toTile || !tile?.walkable) continue;
            groundZ = terrainWorldHeight(fromTile) + (terrainWorldHeight(toTile) - terrainWorldHeight(fromTile)) * pose.progress;
          }
          const tile = getTerrainTile(terrainMap, Math.round(pose.x), Math.round(pose.y));
          if (!tile?.walkable) continue;
          const activityAmount = actor.activity === 'patrol' ? 0.72 : actor.activity === 'defend' ? 0.42 : 0.24;
          const actorDistance = Math.hypot(pose.x - playerTile.i, pose.y - playerTile.j);
          const animationLod = selectActorAnimationLod(actorDistance);
          const behaviorState = npcBehaviorAgentsRef.current[index]?.state;
          const action = behaviorState === 'CHASE' ? 'attack'
            : behaviorState === 'ALERT' ? 'block'
            : (pose.progress > 0.015 ? 'walk' : 'idle');
          const lodAmount = animationLod === 'static' ? 0 : animationLod === 'reduced' ? activityAmount * 0.45 : activityAmount;
          const animation = sampleActorAnimation(action, time, npcAnimationPhase(actor.id), lodAmount);
          const mesh = buildNpcMesh(actor, tile, {
            phase: animation.phase, amount: animation.locomotion, armSwing: animation.armSwing,
            action, x: pose.x, y: pose.y, groundZ,
          });
          for (const value of mesh) npcOutput.push(value);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, npcBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(npcOutput), gl.DYNAMIC_DRAW);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, npcOutput.length / 6);

        gl.bindBuffer(gl.ARRAY_BUFFER, weatherBuffer);
        gl.uniform1f(weatherMotionLocation, 1);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, weatherVertices.length / 6);
        gl.uniform1f(weatherMotionLocation, 0);

        const currentPosition = positionRef.current;
        const currentTile = getTerrainTile(terrainMap, currentPosition.i, currentPosition.j)
          ?? terrainMap.tiles[0];
        const movementPose = movementRef.current;
        const nextPosition = movementPose?.path[movementPose.index];
        const progress = movementPose && nextPosition
          ? clamp(movementPose.elapsed / 145, 0, 1)
          : 0;
        const nextTile = nextPosition
          ? getTerrainTile(terrainMap, nextPosition.i, nextPosition.j)
          : null;
        const avatarX = currentPosition.i + 0.5 + (nextPosition ? (nextPosition.i - currentPosition.i) * progress : 0);
        const avatarY = currentPosition.j + 0.5 + (nextPosition ? (nextPosition.j - currentPosition.j) * progress : 0);
        const groundZ = nextTile
          ? terrainWorldHeight(currentTile) + (terrainWorldHeight(nextTile) - terrainWorldHeight(currentTile)) * progress
          : terrainWorldHeight(currentTile);
        const avatarAction = movementPose && nextPosition ? 'walk' : 'idle';
        const avatarAnimation = sampleActorAnimation(avatarAction, time, 0, movementPose && nextPosition ? 1 : 0);
        const avatarVertices = buildAvatarMesh(currentTile, {
          x: avatarX,
          y: avatarY,
          groundZ,
          phase: avatarAnimation.phase,
          walkAmount: avatarAnimation.locomotion,
          action: avatarAction,
          armSwing: avatarAnimation.armSwing,
          bodyLean: avatarAnimation.bodyLean,
        });
        gl.bindBuffer(gl.ARRAY_BUFFER, avatarBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, avatarVertices, gl.DYNAMIC_DRAW);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, avatarVertices.length / 6);

        if (movementPose) {
          movementPose.elapsed += delta;
          while (movementPose.elapsed >= 145 && movementRef.current) {
            movementPose.elapsed -= 145;
            const active = movementRef.current;
            const next = active.path[active.index];
            if (!next) {
              movementRef.current = null;
              break;
            }
            const accepted = onTileMoveRef.current(next.i, next.j, bridgeTileKeys.has(next.i + ':' + next.j));
            if (!accepted) {
              movementRef.current = null;
              setHud(current => ({ ...current, status: 'Déplacement bloqué par les règles du monde existant' }));
              break;
            }
            positionRef.current = { i: next.i, j: next.j };
            active.index += 1;
            chunkStreamer.requestAround(positionRef.current, 3);
            setHud(current => ({
              ...current,
              x: next.i,
              y: next.j,
              status: 'Déplacement A* · terrain validé',
            }));
            if (active.index >= active.path.length) movementRef.current = null;
          }
        }

        if (activeGpuQuery && gpuTimerExtension) {
          gl.endQuery(gpuTimerExtension.TIME_ELAPSED_EXT);
          pendingGpuQueries.push(activeGpuQuery);
          activeGpuQuery = null;
        }
        const cpuElapsedMs = Math.max(0.001, performance.now() - cpuFrameStart);
        cpuFrameMonitor.add(cpuElapsedMs);
        const gpuSummary = gpuFrameMonitor.summary();
        if (gpuTimerExtension && gpuSummary.samples >= 8) {
          renderScaleRef.current = adaptiveRenderScale.update(gpuSummary.p95Ms, delta);
        }
        if (time - lastPerformanceUpdate >= 1000) {
          const frameSummary = frameTimeMonitor.summary();
          const cpuSummary = cpuFrameMonitor.summary();
          setHud(current => ({
            ...current,
            fps: Math.round(frameSummary.fps),
            frameMs: frameSummary.meanMs,
            frameP95Ms: frameSummary.p95Ms,
            cpuMs: cpuSummary.meanMs,
            gpuMs: gpuSummary.samples ? gpuSummary.meanMs : 0,
            gpuSupported: Boolean(gpuTimerExtension),
            renderScale: renderScaleRef.current,
          }));
          lastPerformanceUpdate = time;
        }
        frameId = window.requestAnimationFrame(draw);
      };

      frameId = window.requestAnimationFrame(draw);

      const startMovement = (targetI: number, targetJ: number) => {
        const current = positionRef.current;
        if (targetI < 0 || targetJ < 0 || targetI >= terrainMap.width || targetJ >= terrainMap.height) return;
        const path = findTerrainPath(
          terrainMap,
          { i: current.i, j: current.j },
          { i: targetI, j: targetJ },
          { allowDiagonal: false, maxExpandedNodes: 8192, bridgeTiles: bridgeTileKeys },
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
        if (tile) {
          const npcIndex = sceneNpcs.findIndex((actor, index) => {
            const behavior = npcBehaviorAgentsRef.current[index];
            const patrol = npcAgentsRef.current[index];
            const pose = behavior ? getNpcBehaviorPose(behavior) : patrol ? getNpcAgentPose(patrol) : null;
            return pose && Math.round(pose.x) === tile.i && Math.round(pose.y) === tile.j;
          });
          const npc = npcIndex >= 0 ? sceneNpcs[npcIndex] : undefined;
          const settlementStructure = settlementDistricts
            .map(district => getSettlementInteraction(district, { i: tile.i, j: tile.j }))
            .find(structure => structure !== null);
          const poiIndex = zone.pointsOfInterest.findIndex((_, index) => {
            const point = getPoiPosition(zone, index);
            return point.x === tile.i && point.y === tile.j;
          });
          const eventPoint = getWorldEventPoint(worldEvent);
          if (npc) {
            onSignalSelectRef.current({ type: 'npc', name: npc.name, x: npc.x, y: npc.y });
          } else if (settlementStructure) {
            onSignalSelectRef.current({ type: 'settlement', name: settlementStructure.name + ' · ' + settlementStructure.interaction, x: tile.i, y: tile.j });
          } else if (poiIndex >= 0) {
            onSignalSelectRef.current({ type: 'poi', name: zone.pointsOfInterest[poiIndex], x: tile.i, y: tile.j });
          } else if (eventPoint.x === tile.i && eventPoint.y === tile.j) {
            onSignalSelectRef.current({ type: 'event', name: worldEvent.title, x: tile.i, y: tile.j });
          } else if (tile.walkable || bridgeTileKeys.has(tile.i + ':' + tile.j)) {
            startMovement(tile.i, tile.j);
          }
        }
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
          for (const entry of terrainChunkBuffers.values()) gl.deleteBuffer(entry.buffer);
          terrainChunkBuffers.clear();
          for (const entry of sceneChunkBuffers.values()) gl.deleteBuffer(entry.buffer);
          sceneChunkBuffers.clear();
          if (avatarBuffer) gl.deleteBuffer(avatarBuffer);
          if (sceneBuffer) gl.deleteBuffer(sceneBuffer);
          if (npcBuffer) gl.deleteBuffer(npcBuffer);
          if (weatherBuffer) gl.deleteBuffer(weatherBuffer);
          if (vegetationTemplateBuffer) gl.deleteBuffer(vegetationTemplateBuffer);
          if (vegetationInstanceBuffer) gl.deleteBuffer(vegetationInstanceBuffer);
          if (vegetationProgram) gl.deleteProgram(vegetationProgram);
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
        if (activeGpuQuery) gl.deleteQuery(activeGpuQuery);
        for (const query of pendingGpuQueries) gl.deleteQuery(query);
        for (const entry of terrainChunkBuffers.values()) gl.deleteBuffer(entry.buffer);
        terrainChunkBuffers.clear();
        for (const entry of sceneChunkBuffers.values()) gl.deleteBuffer(entry.buffer);
        sceneChunkBuffers.clear();
        if (avatarBuffer) gl.deleteBuffer(avatarBuffer);
        if (sceneBuffer) gl.deleteBuffer(sceneBuffer);
        if (npcBuffer) gl.deleteBuffer(npcBuffer);
        if (weatherBuffer) gl.deleteBuffer(weatherBuffer);
        if (vegetationTemplateBuffer) gl.deleteBuffer(vegetationTemplateBuffer);
        if (vegetationInstanceBuffer) gl.deleteBuffer(vegetationInstanceBuffer);
        if (vegetationProgram) gl.deleteProgram(vegetationProgram);
        if (program) gl.deleteProgram(program);
      }
    };
  }, [terrainMap, chunkManager, sceneVertices, sceneChunkMeshes, vegetationChunkInstances, sceneNpcs, weatherVertices, bridgeTileKeys]);

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
        aria-label="Monde 3D hybride Freedom Arena. Cliquez une tuile ou utilisez les flèches du clavier pour déplacer le personnage."
        tabIndex={0}
      />
      <div className="world3d-toolbar" aria-label="Commandes de la caméra 3D">
        <button type="button" title="Zoom avant" onClick={() => setZoom(value => clamp(value * 0.88, 0.52, 2.2))}>＋</button>
        <button type="button" title="Zoom arrière" onClick={() => setZoom(value => clamp(value * 1.12, 0.52, 2.2))}>－</button>
        <button type="button" title="Rotation gauche" onClick={() => rotate(-Math.PI / 12)}>↶</button>
        <button type="button" title={cameraMode === 'isometric' ? 'Passer en troisième personne' : 'Passer en caméra isométrique'} onClick={() => setCameraMode(value => value === 'isometric' ? 'thirdPerson' : 'isometric')}>{cameraMode === 'isometric' ? '3P' : 'ISO'}</button>
        <button type="button" title="Rotation droite" onClick={() => rotate(Math.PI / 12)}>↷</button>
        <button type="button" title="Réinitialiser la caméra" onClick={() => { setZoom(1); setAzimuth(Math.PI / 4); setCameraMode('isometric'); }}>⌂</button>
      </div>
      <div className="world3d-hud">
        <strong>FA-WORLD · WEBGL2</strong>
        <span>Joueur {hud.x}, {hud.y} · {hud.tileCount.toLocaleString('fr-FR')} cellules · {hud.chunks} chunks · {hud.pendingChunks} en attente</span>
        <span>{hud.actors} PNJ · {hud.pois} POI · {hud.weather} · {hud.cycle}</span>
        <span>{hud.fps} FPS · p95 {hud.frameP95Ms.toFixed(1)} ms · CPU {hud.cpuMs.toFixed(1)} ms</span>
        <span>GPU {hud.gpuSupported ? (hud.gpuMs > 0 ? hud.gpuMs.toFixed(1) + ' ms' : 'mesure…') : 'timer indisponible'} · résolution {Math.round(hud.renderScale * 100)}%</span>
        <div className="world3d-stream-progress" role="progressbar" aria-label="Chargement progressif des chunks" aria-valuemin={0} aria-valuemax={hud.streamTotal} aria-valuenow={hud.streamTotal - hud.pendingChunks}>
          <span style={{ width: (hud.streamTotal > 0 ? ((hud.streamTotal - hud.pendingChunks) / hud.streamTotal) * 100 : 100) + '%' }} />
        </div>
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
