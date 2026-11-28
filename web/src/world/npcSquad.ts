import type { TileCoordinate } from './coordinates';
import { hasTerrainLineOfSight } from './npcPerception';
import type { TerrainMap } from './terrain';

export type NpcSquadCandidate = {
  id: string;
  position: TileCoordinate;
  state: 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'RETURN';
};

/** Stable leader selection independent of array/render order. */
export function electNpcSquadLeader(
  candidates: readonly NpcSquadCandidate[],
): NpcSquadCandidate | null {
  const eligible = candidates
    .filter(candidate => candidate.state !== 'IDLE')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  return eligible[0] ?? null;
}

/**
 * Replan only after a meaningful leader displacement or a cooldown expiry.
 * Chebyshev distance avoids overreacting to diagonal one-tile motion.
 */
export function shouldRefreshNpcFormation(
  anchor: TileCoordinate,
  leader: TileCoordinate,
  elapsedSinceRefreshMs: number,
  options: { displacementTiles?: number; cooldownMs?: number } = {},
): boolean {
  const threshold = Math.max(1, options.displacementTiles ?? 2);
  const cooldown = Math.max(0, options.cooldownMs ?? 900);
  const elapsed = Number.isFinite(elapsedSinceRefreshMs)
    ? Math.max(0, elapsedSinceRefreshMs) : 0;
  const displacement = Math.max(
    Math.abs(leader.i - anchor.i),
    Math.abs(leader.j - anchor.j),
  );
  return displacement >= threshold && elapsed >= cooldown;
}

/** Returns an integer tile anchor to prevent sub-tile animation noise triggering replans. */
export function formationAnchor(position: { x: number; y: number }): TileCoordinate {
  return { i: Math.round(position.x), j: Math.round(position.y) };
}

/** A member that breaks off pursuit requests a squad-wide regroup instead of
 * returning independently and losing its local squad context. */
export function shouldRegroupNpcSquad(
  memberId: string,
  memberIds: readonly string[],
  previousState: 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'RETURN',
  nextState: 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'RETURN',
): boolean {
  return memberIds.includes(memberId) && previousState === 'CHASE' && nextState === 'RETURN';
}

/** Reset a tactical agent's route at its current tile while regrouping. */
export function prepareNpcSquadRegroup<T extends {
  position: TileCoordinate;
  previousPosition: TileCoordinate;
  state: 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'RETURN';
  path: TileCoordinate[];
  pathIndex: number;
  targetKey: string | null;
  stateElapsedMs: number;
  stepElapsedMs: number;
}> (agent: T): T {
  const position = { ...agent.position };
  return {
    ...agent,
    position,
    previousPosition: position,
    state: 'ALERT',
    path: [position],
    pathIndex: 0,
    targetKey: null,
    stateElapsedMs: 0,
    stepElapsedMs: 0,
  };
}

/**
 * Partitions active tactical actors into deterministic local groups.
 * Membership uses connected components of the proximity + terrain-LOS graph;
 * it does not create persistent squad identities or server-side groups.
 */
export function partitionNpcSquads(
  map: TerrainMap,
  candidates: readonly NpcSquadCandidate[],
  linkRadius = 6,
): NpcSquadCandidate[][] {
  const radius = Number.isFinite(linkRadius) ? Math.max(0, linkRadius) : 6;
  const ordered = candidates
    .filter(candidate => candidate.state !== 'IDLE')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const remaining = new Map(ordered.map(candidate => [candidate.id, candidate]));
  const groups: NpcSquadCandidate[][] = [];

  while (remaining.size > 0) {
    const first = remaining.values().next().value as NpcSquadCandidate;
    remaining.delete(first.id);
    const group: NpcSquadCandidate[] = [first];
    const queue = [first];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const candidate of [...remaining.values()]) {
        const distance = Math.abs(candidate.position.i - current.position.i)
          + Math.abs(candidate.position.j - current.position.j);
        if (distance > radius || !hasTerrainLineOfSight(map, current.position, candidate.position)) continue;
        remaining.delete(candidate.id);
        group.push(candidate);
        queue.push(candidate);
      }
    }
    group.sort((a, b) => a.id.localeCompare(b.id));
    groups.push(group);
  }
  return groups.sort((a, b) => a[0].id.localeCompare(b[0].id));
}

/** Returns a replacement leader only when the current leader is no longer elected. */
export function resolveNpcSquadLeaderHandoff(
  currentLeaderId: string,
  candidates: readonly NpcSquadCandidate[],
): NpcSquadCandidate | null {
  const elected = electNpcSquadLeader(candidates);
  return elected && elected.id !== currentLeaderId ? elected : null;
}
