import { findTerrainPath, tileKey } from './navigation';
import type { TileCoordinate } from './coordinates';
import type { TerrainMap } from './terrain';

export type NpcBehaviorState = 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'RETURN';
export type NpcBehaviorConfig = {
  alertRadius?: number;
  chaseRadius?: number;
  disengageRadius?: number;
  maxChaseTiles?: number;
};
export type NpcBehaviorAgent = {
  id: string;
  home: TileCoordinate;
  position: TileCoordinate;
  state: NpcBehaviorState;
  path: TileCoordinate[];
  pathIndex: number;
  targetKey: string | null;
  stateElapsedMs: number;
};
export type PlayerTile = TileCoordinate;

const distance = (a: TileCoordinate, b: TileCoordinate) =>
  Math.abs(a.i - b.i) + Math.abs(a.j - b.j);

const key = (tile: TileCoordinate) => tileKey(tile.i, tile.j);

export function createNpcBehaviorAgent(id: string, home: TileCoordinate): NpcBehaviorAgent {
  const spawn = { ...home };
  return {
    id, home: spawn, position: { ...spawn }, state: 'PATROL',
    path: [spawn], pathIndex: 0, targetKey: null, stateElapsedMs: 0,
  };
}

/** Deterministic local perception and route selection. Does not mutate game state. */
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
  const range = distance(agent.position, player);

  let state = agent.state;
  if (state === 'IDLE') state = 'PATROL';
  if (state === 'PATROL' && range <= alertRadius) state = 'ALERT';
  else if (state === 'ALERT' && range <= chaseRadius) state = 'CHASE';
  else if (state === 'ALERT' && range > disengageRadius) state = 'PATROL';
  else if (state === 'CHASE' && (range > disengageRadius || distance(agent.home, player) > maxChaseTiles)) state = 'RETURN';
  else if (state === 'RETURN' && distance(agent.position, agent.home) <= 1) state = 'PATROL';

  const target = state === 'CHASE' || state === 'ALERT' ? player
    : state === 'RETURN' ? agent.home : null;
  const targetKey = target ? key(target) : null;
  const needsPath = targetKey !== agent.targetKey || state !== agent.state;
  let path = agent.path;
  let pathIndex = agent.pathIndex;
  let nextTargetKey = agent.targetKey;

  if (needsPath) {
    if (target) {
      const candidate = findTerrainPath(map, agent.position, target, {
        allowDiagonal: false,
        maxExpandedNodes: 4096,
      });
      path = candidate.length ? candidate : [agent.position];
      pathIndex = Math.min(1, path.length - 1);
      nextTargetKey = targetKey;
    } else {
      path = [agent.position];
      pathIndex = 0;
      nextTargetKey = null;
    }
  } else if (pathIndex < path.length - 1 && safeDelta >= 80) {
    pathIndex += 1;
  }

  const nextPosition = path[pathIndex] ?? agent.position;
  const tile = map.tiles.find(candidate => candidate.i === nextPosition.i && candidate.j === nextPosition.j);
  const position = tile?.walkable ? { i: nextPosition.i, j: nextPosition.j } : agent.position;
  if (state === 'RETURN' && position.i === agent.home.i && position.j === agent.home.j) state = 'PATROL';

  return {
    ...agent,
    position,
    state,
    path,
    pathIndex,
    targetKey: nextTargetKey,
    stateElapsedMs: state === agent.state ? agent.stateElapsedMs + safeDelta : 0,
  };
}
