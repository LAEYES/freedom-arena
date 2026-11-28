import { findTerrainPath, isTileBlocked, tileKey } from './navigation';
import type { TileCoordinate } from './coordinates';
import type { TerrainMap } from './terrain';

export type NpcBehaviorState = 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'RETURN';
export type NpcBehaviorConfig = {
  alertRadius?: number;
  chaseRadius?: number;
  disengageRadius?: number;
  maxChaseTiles?: number;
  stepDurationMs?: number;
  blockedTiles?: ReadonlySet<string>;
};
export type NpcBehaviorAgent = {
  id: string;
  home: TileCoordinate;
  position: TileCoordinate;
  previousPosition: TileCoordinate;
  state: NpcBehaviorState;
  path: TileCoordinate[];
  pathIndex: number;
  targetKey: string | null;
  stateElapsedMs: number;
  stepElapsedMs: number;
  stepDurationMs: number;
};
export type PlayerTile = TileCoordinate;
export type NpcBehaviorPose = { x: number; y: number; progress: number };

const distance = (a: TileCoordinate, b: TileCoordinate) =>
  Math.abs(a.i - b.i) + Math.abs(a.j - b.j);
const key = (tile: TileCoordinate) => tileKey(tile.i, tile.j);

export function createNpcBehaviorAgent(id: string, home: TileCoordinate): NpcBehaviorAgent {
  const spawn = { ...home };
  return {
    id, home: spawn, position: { ...spawn }, previousPosition: { ...spawn },
    state: 'PATROL', path: [spawn], pathIndex: 0, targetKey: null,
    stateElapsedMs: 0, stepElapsedMs: 0, stepDurationMs: 420,
  };
}

/** Deterministic local perception, dynamic obstacle avoidance and route selection. */
export function updateNpcBehavior(
  map: TerrainMap,
  agent: NpcBehaviorAgent,
  player: PlayerTile,
  deltaMs: number,
  config: NpcBehaviorConfig = {},
): NpcBehaviorAgent {
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, Math.min(100, deltaMs)) : 0;
  const alertRadius = Math.max(1, config.alertRadius ?? 7);
  const chaseRadius = Math.max(1, Math.min(alertRadius, config.chaseRadius ?? 4));
  const disengageRadius = Math.max(alertRadius, config.disengageRadius ?? 10);
  const maxChaseTiles = Math.max(1, config.maxChaseTiles ?? 12);
  const stepDurationMs = Math.max(100, config.stepDurationMs ?? agent.stepDurationMs ?? 420);
  const range = distance(agent.position, player);

  let state = agent.state;
  if (state === 'IDLE') state = 'PATROL';
  if (state === 'PATROL' && range <= alertRadius) state = 'ALERT';
  else if (state === 'ALERT' && range <= chaseRadius) state = 'CHASE';
  else if (state === 'ALERT' && range > alertRadius) state = 'PATROL';
  else if (state === 'CHASE' && (range > disengageRadius || distance(agent.home, player) > maxChaseTiles)) state = 'RETURN';
  else if (state === 'RETURN' && distance(agent.position, agent.home) === 0) state = 'PATROL';

  const target = state === 'CHASE' ? player : state === 'RETURN' ? agent.home : null;
  const targetKey = target ? key(target) : null;
  const blockedTiles = new Set(config.blockedTiles ?? []);
  blockedTiles.delete(key(agent.position));
  if (target) blockedTiles.delete(key(target));

  const nextPathTile = agent.path[agent.pathIndex + 1];
  const pathBlocked = !!nextPathTile && isTileBlocked(map, nextPathTile.i, nextPathTile.j, blockedTiles);
  const needsPath = targetKey !== agent.targetKey || state !== agent.state || pathBlocked;
  let path = agent.path;
  let pathIndex = agent.pathIndex;
  let nextTargetKey = agent.targetKey;

  if (needsPath) {
    if (target) {
      const candidate = findTerrainPath(map, agent.position, target, {
        allowDiagonal: false, blockedTiles, maxExpandedNodes: 4096,
      });
      path = candidate.length ? candidate : [agent.position];
      pathIndex = 0;
      nextTargetKey = targetKey;
    } else {
      path = [agent.position];
      pathIndex = 0;
      nextTargetKey = null;
    }
  }

  let position = agent.position;
  let previousPosition = agent.previousPosition;
  let stepElapsedMs = agent.stepElapsedMs + safeDelta;
  if (target && path.length > 1 && pathIndex < path.length - 1 && stepElapsedMs >= stepDurationMs) {
    const next = path[pathIndex + 1];
    if (!isTileBlocked(map, next.i, next.j, blockedTiles)) {
      previousPosition = position;
      position = { i: next.i, j: next.j, elevation: next.elevation };
      pathIndex += 1;
    } else {
      nextTargetKey = null;
    }
    stepElapsedMs %= stepDurationMs;
  }

  if (state === 'RETURN' && position.i === agent.home.i && position.j === agent.home.j) {
    state = 'PATROL';
    path = [position];
    pathIndex = 0;
    nextTargetKey = null;
    stepElapsedMs = 0;
  }

  return {
    ...agent, position, previousPosition, state, path, pathIndex,
    targetKey: nextTargetKey,
    stateElapsedMs: state === agent.state ? agent.stateElapsedMs + safeDelta : 0,
    stepElapsedMs, stepDurationMs,
  };
}

export function getNpcBehaviorPose(agent: NpcBehaviorAgent): NpcBehaviorPose {
  const progress = agent.path.length > 1 && agent.pathIndex < agent.path.length - 1
    ? Math.max(0, Math.min(1, agent.stepElapsedMs / agent.stepDurationMs))
    : 0;
  const next = agent.path[agent.pathIndex + 1] ?? agent.position;
  return {
    x: agent.position.i + (next.i - agent.position.i) * progress,
    y: agent.position.j + (next.j - agent.position.j) * progress,
    progress,
  };
}
