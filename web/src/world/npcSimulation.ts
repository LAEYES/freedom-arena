import { findTerrainPath, tileKey } from './navigation';
import type { TileCoordinate } from './coordinates';
import type { TerrainMap } from './terrain';

export type NpcRouteSeed = { id: string; x: number; y: number; activity?: string };
export type NpcAgent = {
  id: string;
  path: TileCoordinate[];
  fromIndex: number;
  toIndex: number;
  direction: 1 | -1;
  elapsedMs: number;
  stepDurationMs: number;
};
export type NpcAgentPose = { x: number; y: number; progress: number };

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Creates deterministic closed A* patrol routes without changing authoritative game state. */
export function createNpcAgents(map: TerrainMap, actors: readonly NpcRouteSeed[]): NpcAgent[] {
  const occupied = new Set(actors.map(actor => tileKey(actor.x, actor.y)));
  return actors.map(actor => {
    const blockedTiles = new Set(occupied);
    blockedTiles.delete(tileKey(actor.x, actor.y));
    const offsets = [
      { x: 7, y: 0 }, { x: 0, y: 6 }, { x: -7, y: 0 }, { x: 0, y: -6 },
      { x: 5, y: 4 }, { x: -5, y: 4 }, { x: 5, y: -4 }, { x: -5, y: -4 },
    ];
    const offsetStart = stableHash(actor.id) % offsets.length;
    let route: TileCoordinate[] = [];
    for (let attempt = 0; attempt < offsets.length; attempt++) {
      const offset = offsets[(offsetStart + attempt) % offsets.length];
      const target = {
        i: Math.max(0, Math.min(map.width - 1, actor.x + offset.x)),
        j: Math.max(0, Math.min(map.height - 1, actor.y + offset.y)),
      };
      if (target.i === actor.x && target.j === actor.y) continue;
      const candidate = findTerrainPath(map, { i: actor.x, j: actor.y }, target, {
        allowDiagonal: false, blockedTiles, maxExpandedNodes: 4096,
      });
      if (candidate.length > 1) {
        route = candidate.concat(candidate.slice(1, -1).reverse());
        break;
      }
    }
    if (!route.length) route = [{ i: actor.x, j: actor.y }];
    const speedFactor = 0.9 + (stableHash(actor.id + ':speed') % 31) / 100;
    const activityFactor = actor.activity === 'patrol' ? 1 : actor.activity === 'defend' ? 0.72 : 0.55;
    const moving = route.length > 1;
    return {
      id: actor.id, path: route, fromIndex: 0, toIndex: moving ? 1 : 0,
      direction: 1, elapsedMs: 0, stepDurationMs: 1000 / (speedFactor * activityFactor),
    };
  });
}

/** Advances each independent route clock using a bounded frame delta. */
export function advanceNpcAgents(agents: readonly NpcAgent[], deltaMs: number): NpcAgent[] {
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, Math.min(100, deltaMs)) : 0;
  return agents.map(agent => {
    if (agent.path.length < 2 || safeDelta === 0) return agent;
    let fromIndex = agent.fromIndex;
    let toIndex = agent.toIndex;
    let direction = agent.direction;
    let elapsedMs = agent.elapsedMs + safeDelta;
    let guard = 0;
    while (elapsedMs >= agent.stepDurationMs && guard++ < 4) {
      elapsedMs -= agent.stepDurationMs;
      fromIndex = toIndex;
      if (fromIndex === agent.path.length - 1) direction = -1;
      else if (fromIndex === 0) direction = 1;
      toIndex = fromIndex + direction;
    }
    return { ...agent, fromIndex, toIndex, direction, elapsedMs };
  });
}

export function getNpcAgentPose(agent: NpcAgent): NpcAgentPose {
  const from = agent.path[agent.fromIndex];
  const to = agent.path[agent.toIndex] ?? from;
  const progress = agent.path.length < 2 ? 0 : Math.max(0, Math.min(1, agent.elapsedMs / agent.stepDurationMs));
  return { x: from.i + (to.i - from.i) * progress, y: from.j + (to.j - from.j) * progress, progress };
}
