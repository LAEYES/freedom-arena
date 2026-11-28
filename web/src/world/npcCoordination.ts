import type { TileCoordinate } from './coordinates';
import { hasTerrainLineOfSight } from './npcPerception';
import { tileKey } from './navigation';
import type { TerrainMap } from './terrain';

export type NpcAlertSource = {
  id: string;
  position: TileCoordinate;
  radius: number;
};

export type NpcAlertCandidate = {
  id: string;
  position: TileCoordinate;
};

/**
 * Resolves a one-hop audible alert. Manhattan distance is used as a conservative
 * grid metric; terrain blocks the signal only when the straight grid ray crosses
 * non-walkable intermediate cells. Output order follows the supplied actor order.
 */
export function resolveNpcAlertRecipients(
  map: TerrainMap,
  source: NpcAlertSource,
  candidates: readonly NpcAlertCandidate[],
): string[] {
  const radius = Number.isFinite(source.radius) ? Math.max(0, source.radius) : 0;
  const sourceKey = tileKey(source.position.i, source.position.j);
  const recipients: string[] = [];
  const seen = new Set<string>([source.id]);

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const distance = Math.abs(candidate.position.i - source.position.i)
      + Math.abs(candidate.position.j - source.position.j);
    if (distance > radius) continue;
    if (!hasTerrainLineOfSight(map, source.position, candidate.position)) continue;
    if (tileKey(candidate.position.i, candidate.position.j) === sourceKey) continue;
    recipients.push(candidate.id);
  }
  return recipients;
}

/** Promote a passive local agent to ALERT after receiving a valid group signal. */
export function receiveNpcAlertSignal<T extends {
  id: string;
  position: TileCoordinate;
  facing: { i: number; j: number };
  state: string;
  path: TileCoordinate[];
  pathIndex: number;
  targetKey: string | null;
  stateElapsedMs: number;
}>(agent: T, source: TileCoordinate): T {
  if (agent.state !== 'PATROL' && agent.state !== 'IDLE') return agent;
  const di = source.i - agent.position.i;
  const dj = source.j - agent.position.j;
  const length = Math.hypot(di, dj) || 1;
  return {
    ...agent,
    facing: { i: di / length, j: dj / length },
    state: 'ALERT',
    path: [agent.position],
    pathIndex: 0,
    targetKey: null,
    stateElapsedMs: 0,
  };
}
