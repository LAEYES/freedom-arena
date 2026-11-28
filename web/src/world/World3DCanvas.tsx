import { useEffect, useMemo, useRef, useState } from 'react';
import { createIsometricCamera, type IsometricCamera } from './isometricCamera';
import { ChunkManager, isChunkVisibleInCamera } from './chunks';
import { FrameTimeMonitor } from './worldPerformance';
import { selectWorldLod } from './worldLod';
import { AdaptiveWorldLod } from './adaptiveWorldLod';
import { adaptiveLodQuality, adaptiveRenderScale } from './graphicsQuality';
import { getNpcRenderDistance, shouldRenderNpc } from './renderBudget';
import { getShadowBudget } from './vfxBudget';
import { mergeWorldMeshes } from './meshBatch';
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
  buildGroundShadowMesh,
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
    out float vWorldHeight;
    void main() {
      vec3 animatedPosition = aPosition;
      float phase = uTime * 1.35 + aPosition.x * 0.17 + aPosition.y * 0.13;
      animatedPosition.x += sin(phase) * 0.035 * uWeatherMotion;
      animatedPosition.y += cos(phase * 0.73) * 0.022 * uWeatherMotion;
      animatedPosition.z += sin(phase * 0.91) * 0.018 * uWeatherMotion;
      gl_Position = uViewProjection * vec4(animatedPosition, 1.0);
      vColor = aColor;
      vWorldHeight = animatedPosition.z;
    }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec3 vColor;
    in float vWorldHeight;
    uniform vec3 uTint;
    uniform vec3 uLightColor;
    uniform float uAmbientStrength;
    uniform vec3 uFogColor;
    uniform float uFogAmount;
    out vec4 outColor;
    void main() {
      float depthFog = smoothstep(0.20, 0.98, gl_FragCoord.z) * uFogAmount;
      float heightLight = clamp(0.94 + vWorldHeight * 0.035, 0.82, 1.08);
      vec3 daylight = mix(vec3(uAmbientStrength), uLightColor, 0.42);
      vec3 litColor = vColor * uTint * daylight * heightLight;
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


function createVegetationProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec3 aPosition;
    in vec3 aColor;
    in vec3 aInstanceOffset;
    in float aInstanceScale;
    in vec3 aInstanceTint;
    uniform mat4 uViewProjection;
    uniform float uTime;
    uniform float uWindStrength;
    out vec3 vColor;
    void main() {
      vec3 worldPosition = aPosition * aInstanceScale + aInstanceOffset;
      float windPhase = uTime * 1.4 + aInstanceOffset.x * 0.31 + aInstanceOffset.y * 0.27;
      worldPosition.x += sin(windPhase) * uWindStrength * aInstanceScale * 0.045;
      worldPosition.y += cos(windPhase * 0.8) * uWindStrength * aInstanceScale * 0.025;
      gl_Position = uViewProjection * vec4(worldPosition, 1.0);
      vColor = aColor * aInstanceTint;
    }
  `);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec3 vColor;
    uniform vec3 uFogColor;
    uniform float uFogAmount;
    uniform vec3 uLightColor;
    uniform float uAmbientStrength;
    out vec4 outColor;
    void main() {
      float depthFog = smoothstep(0.20, 0.98, gl_FragCoord.z) * uFogAmount;
      vec3 litColor = vColor * mix(vec3(uAmbientStrength), uLightColor, 0.34);
      outColor = vec4(mix(litColor, uFogColor, depthFog), 1.0);
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
  const [graphicsQuality, setGraphicsQuality] = useState<'performance' | 'balanced' | 'quality'>('balanced');
  const graphicsQualityRef = useRef<'performance' | 'balanced' | 'quality'>('balanced');
  graphicsQualityRef.current = graphicsQuality;
  const [zoom, setZoom] = useState(1);
  const [azimuth, setAzimuth] = useState(Math.PI / 4);
  const [cameraMode, setCameraMode] = useState<'isometric' | 'thirdPerson'>('isometric');
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
    fps: 0,
    frameMs: 0,
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
    let vegetationBufferSignature = '';
    let vegetationMatrixLocation: WebGLUniformLocation | null = null;
    let vegetationFogColorLocation: WebGLUniformLocation | null = null;
    let vegetationFogAmountLocation: WebGLUniformLocation | null = null;
    let vegetationTimeLocation: WebGLUniformLocation | null = null;
    let vegetationWindLocation: WebGLUniformLocation | null = null;
    let vegetationLightColorLocation: WebGLUniformLocation | null = null;
    let vegetationAmbientLocation: WebGLUniformLocation | null = null;
    const terrainBatchBuffers = new Map<string, { buffer: WebGLBuffer; vertexCount: number }>();
    const sceneBatchBuffers = new Map<string, { buffer: WebGLBuffer; vertexCount: number }>();
    let activeTerrainBatchKey = '';
    let activeSceneBatchKey = '';
    const adaptiveLod = new AdaptiveWorldLod(0.12);
    let avatarBuffer: WebGLBuffer | null = null;
    let sceneBuffer: WebGLBuffer | null = null;
    let npcBuffer: WebGLBuffer | null = null;
    let npcVertexStaging = new Float32Array(0);
    let weatherBuffer: WebGLBuffer | null = null;
    let frameId = 0;
    let previousTime = 0;
    let p95FrameMs = 0;
    let positionLocation = -1;
    let colorLocation = -1;
    let matrixLocation: WebGLUniformLocation | null = null;
    let tintLocation: WebGLUniformLocation | null = null;
    let fogColorLocation: WebGLUniformLocation | null = null;
    let fogAmountLocation: WebGLUniformLocation | null = null;
    let lightColorLocation: WebGLUniformLocation | null = null;
    let ambientStrengthLocation: WebGLUniformLocation | null = null;
    let timeLocation: WebGLUniformLocation | null = null;
    let weatherMotionLocation: WebGLUniformLocation | null = null;
    let disposed = false;
    const frameTimeMonitor = new FrameTimeMonitor(120);
    let lastPerformanceUpdate = 0;

    try {
      gl = canvas.getContext('webgl2', {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL2 indisponible sur cet appareil. Utilisez le mode Canvas 2D.');
      program = createProgram(gl);
      vegetationProgram = createVegetationProgram(gl);
      positionLocation = gl.getAttribLocation(program, 'aPosition');
      colorLocation = gl.getAttribLocation(program, 'aColor');
      matrixLocation = gl.getUniformLocation(program, 'uViewProjection');
      tintLocation = gl.getUniformLocation(program, 'uTint');
      fogColorLocation = gl.getUniformLocation(program, 'uFogColor');
      fogAmountLocation = gl.getUniformLocation(program, 'uFogAmount');
      lightColorLocation = gl.getUniformLocation(program, 'uLightColor');
      ambientStrengthLocation = gl.getUniformLocation(program, 'uAmbientStrength');
      timeLocation = gl.getUniformLocation(program, 'uTime');
      weatherMotionLocation = gl.getUniformLocation(program, 'uWeatherMotion');
      if (positionLocation < 0 || colorLocation < 0 || !matrixLocation || !tintLocation || !fogColorLocation || !fogAmountLocation || !lightColorLocation || !ambientStrengthLocation || !timeLocation || !weatherMotionLocation) {
        throw new Error('Attributs ou uniformes WebGL2 introuvables.');
      }

      const initialChunks = chunkManager.loadAround(positionRef.current, 4);
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
      vegetationTimeLocation = gl.getUniformLocation(vegetationProgram, 'uTime');
      vegetationWindLocation = gl.getUniformLocation(vegetationProgram, 'uWindStrength');
      vegetationLightColorLocation = gl.getUniformLocation(vegetationProgram, 'uLightColor');
      vegetationAmbientLocation = gl.getUniformLocation(vegetationProgram, 'uAmbientStrength');
      if (!vegetationMatrixLocation || !vegetationFogColorLocation || !vegetationFogAmountLocation || !vegetationTimeLocation || !vegetationWindLocation || !vegetationLightColorLocation || !vegetationAmbientLocation) {
        throw new Error('Uniformes du programme de végétation instanciée introuvables.');
      }

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0.018, 0.030, 0.055, 1);

      setHud(current => ({
        ...current,
        chunks: initialChunks.length,
        tileCount: terrainTiles.length,
        actors: sceneNpcs.length,
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
        if (disposed || !gl || !program || !avatarBuffer) return;
        const delta = previousTime ? Math.min(50, time - previousTime) : 16.67;
        previousTime = time;
        if (delta > 0) frameTimeMonitor.add(delta);
        if (time - lastPerformanceUpdate >= 1000) {
          const performance = frameTimeMonitor.summary();
          p95FrameMs = performance.p95Ms;
          setHud(current => current.fps === Math.round(performance.fps) && Math.abs(current.frameMs - performance.meanMs) < 0.05
            ? current
            : { ...current, fps: Math.round(performance.fps), frameMs: performance.meanMs });
          lastPerformanceUpdate = time;
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
          frameId = window.requestAnimationFrame(draw);
          return;
        }
        // Explicit quality tiers cap render-target resolution without changing simulation or world coordinates.
        const qualityScale = adaptiveRenderScale(graphicsQualityRef.current, p95FrameMs);
        const dpr = Math.min(window.devicePixelRatio || 1, qualityScale);
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
        gl.useProgram(program);
        gl.uniformMatrix4fv(matrixLocation, false, new Float32Array(camera.viewProjectionMatrix));
        const ambient = environment.cycle === 'night' ? [0.62, 0.70, 0.96]
          : environment.cycle === 'dawn' ? [1.0, 0.78, 0.62]
          : environment.cycle === 'dusk' ? [0.96, 0.70, 0.58] : [1.0, 1.0, 1.0];
        const fog = environment.weather === 'frost' ? [0.58, 0.70, 0.82]
          : environment.weather === 'storm' ? [0.16, 0.22, 0.34]
          : environment.cycle === 'night' ? [0.055, 0.085, 0.15] : [0.30, 0.40, 0.52];
        const night = environment.cycle === 'night';
        const storm = environment.weather === 'storm';
        const lightColor = night ? [0.56, 0.68, 1.0]
          : environment.cycle === 'dawn' ? [1.0, 0.76, 0.56]
          : environment.cycle === 'dusk' ? [1.0, 0.62, 0.43] : [1.0, 0.96, 0.84];
        const ambientStrength = night ? 0.56 : storm ? 0.72 : 0.88;
        gl.uniform3fv(tintLocation, ambient);
        gl.uniform3fv(lightColorLocation, lightColor);
        gl.uniform1f(ambientStrengthLocation, ambientStrength);
        gl.uniform3fv(fogColorLocation, fog);
        gl.uniform1f(fogAmountLocation, environment.weather === 'clear' ? (night ? 0.12 : 0.04) : storm ? 0.42 : 0.24);
        gl.uniform1f(timeLocation, time * 0.001);
        gl.uniform1f(weatherMotionLocation, 0);

        const chunkCenter = activeCameraMode === 'thirdPerson'
          ? positionRef.current
          : { i: 32, j: 32 };
        const candidateChunks = chunkManager.loadAround(chunkCenter, activeCameraMode === 'thirdPerson' ? 1 : 4);
        const visibleChunks = candidateChunks.filter(chunk => isChunkVisibleInCamera(chunk, camera));
        // One static GPU batch for the complete visible terrain set.
        const terrainBatchKey = visibleChunks.map(chunk => chunk.key).join('|');
        if (terrainBatchKey !== activeTerrainBatchKey) {
          activeTerrainBatchKey = terrainBatchKey;
          let batch = terrainBatchBuffers.get(terrainBatchKey);
          if (!batch) {
            const merged = mergeWorldMeshes(visibleChunks.map(chunk => buildTerrainMesh(chunk.tiles)));
            const buffer = gl.createBuffer();
            if (!buffer) throw new Error('Impossible de créer le buffer terrain groupé.');
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, merged, gl.STATIC_DRAW);
            batch = { buffer, vertexCount: merged.length / 6 };
            terrainBatchBuffers.set(terrainBatchKey, batch);
          }
          while (terrainBatchBuffers.size > 4) {
            const oldestKey = terrainBatchBuffers.keys().next().value as string | undefined;
            if (!oldestKey || oldestKey === terrainBatchKey) break;
            const oldest = terrainBatchBuffers.get(oldestKey);
            if (oldest) gl.deleteBuffer(oldest.buffer);
            terrainBatchBuffers.delete(oldestKey);
          }
        }
        const terrainBatch = terrainBatchBuffers.get(activeTerrainBatchKey);
        if (terrainBatch && terrainBatch.vertexCount > 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, terrainBatch.buffer);
          bindVertexLayout();
          gl.drawArrays(gl.TRIANGLES, 0, terrainBatch.vertexCount);
        }
        const visibleTileCount = visibleChunks.reduce((sum, chunk) => sum + chunk.tiles.length, 0);
        setHud(current => current.chunks === visibleChunks.length && current.tileCount === visibleTileCount
          ? current
          : { ...current, chunks: visibleChunks.length, tileCount: visibleTileCount });

        const sceneLodKeys: string[] = [];
        const sceneGeometries: Float32Array[] = [];
        const lodQuality = adaptiveLodQuality(graphicsQualityRef.current, p95FrameMs);
        for (const chunk of visibleChunks) {
          const reference = activeCameraMode === 'thirdPerson' ? positionRef.current : { i: 32, j: 32 };
          const distance = Math.hypot(
            chunk.originI + chunk.width / 2 - reference.i,
            chunk.originJ + chunk.height / 2 - reference.j,
          );
          const lod = adaptiveLod.update(chunk.key, distance, lodQuality);
          const geometry = sceneChunkMeshes.get(chunk.key)?.[lod];
          if (!geometry?.length) continue;
          sceneLodKeys.push(chunk.key + ':' + lod);
          sceneGeometries.push(geometry);
        }
        adaptiveLod.retain(visibleChunks.map(chunk => chunk.key));
        const sceneBatchKey = sceneLodKeys.join('|');
        if (sceneBatchKey !== activeSceneBatchKey) {
          activeSceneBatchKey = sceneBatchKey;
          let batch = sceneBatchBuffers.get(sceneBatchKey);
          if (!batch) {
            const merged = mergeWorldMeshes(sceneGeometries);
            const buffer = gl.createBuffer();
            if (!buffer) throw new Error('Impossible de créer le buffer décor groupé.');
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, merged, gl.STATIC_DRAW);
            batch = { buffer, vertexCount: merged.length / 6 };
            sceneBatchBuffers.set(sceneBatchKey, batch);
          }
          while (sceneBatchBuffers.size > 4) {
            const oldestKey = sceneBatchBuffers.keys().next().value as string | undefined;
            if (!oldestKey || oldestKey === sceneBatchKey) break;
            const oldest = sceneBatchBuffers.get(oldestKey);
            if (oldest) gl.deleteBuffer(oldest.buffer);
            sceneBatchBuffers.delete(oldestKey);
          }
        }
        const sceneBatch = sceneBatchBuffers.get(activeSceneBatchKey);
        if (sceneBatch && sceneBatch.vertexCount > 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, sceneBatch.buffer);
          bindVertexLayout();
          gl.drawArrays(gl.TRIANGLES, 0, sceneBatch.vertexCount);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
        bindVertexLayout();
        gl.drawArrays(gl.TRIANGLES, 0, sceneVertices.length / 6);

        const vegetationParts: Float32Array[] = [];
        const vegetationKeys: string[] = [];
        for (const chunk of visibleChunks) {
          const reference = activeCameraMode === 'thirdPerson'
            ? positionRef.current
            : { i: 32, j: 32 };
          const distance = Math.hypot(
            chunk.originI + chunk.width / 2 - reference.i,
            chunk.originJ + chunk.height / 2 - reference.j,
          );
          const lod = selectWorldLod(distance, adaptiveLodQuality(graphicsQualityRef.current, p95FrameMs));
          const instances = vegetationChunkInstances.get(chunk.key)?.[lod];
          if (instances?.length) {
            vegetationParts.push(instances);
            vegetationKeys.push(chunk.key + ':' + lod);
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
          vegetationBufferSignature = nextVegetationSignature;
        }
        if (vegetationInstanceCount > 0 && vegetationProgram && vegetationTemplateBuffer && vegetationInstanceBuffer) {
          gl.useProgram(vegetationProgram);
          gl.uniformMatrix4fv(vegetationMatrixLocation, false, new Float32Array(camera.viewProjectionMatrix));
          gl.uniform3fv(vegetationFogColorLocation, fog);
          gl.uniform1f(vegetationFogAmountLocation, environment.weather === 'clear' ? (night ? 0.12 : 0.04) : storm ? 0.42 : 0.24);
          gl.uniform3fv(vegetationLightColorLocation, lightColor);
          gl.uniform1f(vegetationAmbientLocation, ambientStrength);
          gl.uniform1f(vegetationTimeLocation, time * 0.001);
          gl.uniform1f(vegetationWindLocation, environment.weather === 'storm' ? 1.0 : environment.weather === 'clear' ? 0.22 : 0.58);
          gl.bindBuffer(gl.ARRAY_BUFFER, vegetationTemplateBuffer);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
          gl.vertexAttribDivisor(0, 0);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
          gl.vertexAttribDivisor(1, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, vegetationInstanceBuffer);
          gl.enableVertexAttribArray(2);
          gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 0);
          gl.vertexAttribDivisor(2, 1);
          gl.enableVertexAttribArray(3);
          gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 12);
          gl.vertexAttribDivisor(3, 1);
          gl.enableVertexAttribArray(4);
          gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 28, 16);
          gl.vertexAttribDivisor(4, 1);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, vegetationVertexCount, vegetationInstanceCount);
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
          const phase = time * (actor.activity === 'patrol' ? 0.0048 : 0.0022) + npcAnimationPhase(actor.id);
          // Rendering culling only: behavior, perception and movement above still run for every NPC.
          const renderDistance = getNpcRenderDistance(adaptiveLodQuality(graphicsQualityRef.current, p95FrameMs));
          if (!shouldRenderNpc({ x: pose.x, y: pose.y }, playerTile, renderDistance)) continue;
          const shadowBudget = getShadowBudget(adaptiveLodQuality(graphicsQualityRef.current, p95FrameMs), p95FrameMs);
          if (index < shadowBudget) {
            const shadow = buildGroundShadowMesh(pose.x + 0.5, pose.y + 0.5, groundZ + 0.012, 0.30, 0.20);
            for (const value of shadow) npcOutput.push(value);
          }
          const mesh = buildNpcMesh(actor, tile, { phase, amount: activityAmount, x: pose.x, y: pose.y, groundZ });
          for (const value of mesh) npcOutput.push(value);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, npcBuffer);
        if (npcOutput.length > npcVertexStaging.length) {
          const capacity = Math.max(npcOutput.length, Math.ceil(Math.max(256, npcVertexStaging.length) * 1.5));
          npcVertexStaging = new Float32Array(capacity);
          gl.bufferData(gl.ARRAY_BUFFER, capacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
        }
        npcVertexStaging.set(npcOutput);
        if (npcOutput.length) gl.bufferSubData(gl.ARRAY_BUFFER, 0, npcVertexStaging.subarray(0, npcOutput.length));
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
        const avatarMesh = buildAvatarMesh(currentTile, {
          x: avatarX,
          y: avatarY,
          groundZ,
          phase: time * 0.012,
          walkAmount: movementPose && nextPosition ? 1 : 0,
        });
        const avatarShadow = buildGroundShadowMesh(avatarX, avatarY, groundZ + 0.012, 0.34, 0.24);
        const avatarVertices = new Float32Array([...avatarShadow, ...avatarMesh]);
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
            chunkManager.loadAround(positionRef.current, 3);
            setHud(current => ({
              ...current,
              x: next.i,
              y: next.j,
              status: 'Déplacement A* · terrain validé',
            }));
            if (active.index >= active.path.length) movementRef.current = null;
          }
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
          for (const entry of terrainBatchBuffers.values()) gl.deleteBuffer(entry.buffer);
          terrainBatchBuffers.clear();
          for (const entry of sceneBatchBuffers.values()) gl.deleteBuffer(entry.buffer);
          sceneBatchBuffers.clear();
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
        for (const entry of terrainBatchBuffers.values()) gl.deleteBuffer(entry.buffer);
        terrainBatchBuffers.clear();
        for (const entry of sceneBatchBuffers.values()) gl.deleteBuffer(entry.buffer);
        sceneBatchBuffers.clear();
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
        <button type="button" title={`Qualité graphique : ${graphicsQuality}. Cliquer pour changer`} aria-label={`Qualité graphique ${graphicsQuality}`} onClick={() => setGraphicsQuality(value => value === 'performance' ? 'balanced' : value === 'balanced' ? 'quality' : 'performance')}>GFX · {graphicsQuality === 'performance' ? 'ÉCO' : graphicsQuality === 'quality' ? 'MAX' : 'ÉQ'}</button>
        <button type="button" title="Réinitialiser la caméra" onClick={() => { setZoom(1); setAzimuth(Math.PI / 4); setCameraMode('isometric'); }}>⌂</button>
      </div>
      <div className="world3d-hud">
        <strong>FA-WORLD · WEBGL2</strong>
        <span>Joueur {hud.x}, {hud.y} · {hud.tileCount.toLocaleString('fr-FR')} cellules · {hud.chunks} chunks</span>
        <span>{hud.actors} PNJ · {hud.pois} POI · {hud.weather} · {hud.cycle}</span>
        <span>{hud.fps} FPS · {hud.frameMs.toFixed(1)} ms moyen · rendu {graphicsQuality === 'performance' ? 'économie' : graphicsQuality === 'quality' ? 'qualité' : 'équilibré'}</span>
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
