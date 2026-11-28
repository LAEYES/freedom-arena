import type { TileCoordinate } from './coordinates';

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
