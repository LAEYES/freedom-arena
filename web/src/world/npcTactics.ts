import type { TileCoordinate } from './coordinates';

export type NpcTacticalRole = 'SCOUT' | 'GUARD' | 'SUPPORT';

export type NpcTacticalProfile = {
  role: NpcTacticalRole;
  alertRadius: number;
  chaseRadius: number;
  disengageRadius: number;
  maxChaseTiles: number;
  stepDurationMs: number;
};

/** Maps existing actor activity metadata to a deterministic tactical role. */
export function getNpcTacticalProfile(activity: string | undefined): NpcTacticalProfile {
  if (activity === 'patrol') {
    return {
      role: 'SCOUT', alertRadius: 9, chaseRadius: 5,
      disengageRadius: 12, maxChaseTiles: 14, stepDurationMs: 360,
    };
  }
  if (activity === 'defend') {
    return {
      role: 'GUARD', alertRadius: 7, chaseRadius: 3,
      disengageRadius: 8, maxChaseTiles: 8, stepDurationMs: 520,
    };
  }
  return {
    role: 'SUPPORT', alertRadius: 6, chaseRadius: 3,
    disengageRadius: 9, maxChaseTiles: 10, stepDurationMs: 460,
  };
}

/**
 * Returns a stable slot around a leader. Slot coordinates are tactical intent,
 * not a movement command: callers must validate walkability and occupancy.
 */
export function getNpcFormationSlot(
  leader: TileCoordinate,
  memberIndex: number,
  facing: Pick<TileCoordinate, 'i' | 'j'>,
  spacing = 2,
): TileCoordinate {
  const safeIndex = Number.isInteger(memberIndex) ? Math.max(0, memberIndex) : 0;
  const safeSpacing = Number.isFinite(spacing) ? Math.max(1, spacing) : 2;
  const length = Math.hypot(facing.i, facing.j) || 1;
  const forwardI = facing.i / length;
  const forwardJ = facing.j / length;
  const sideI = -forwardJ;
  const sideJ = forwardI;
  const rank = Math.floor(safeIndex / 2) + 1;
  const side = safeIndex % 2 === 0 ? -1 : 1;
  return {
    i: Math.round(leader.i - forwardI * rank * safeSpacing + sideI * side * safeSpacing),
    j: Math.round(leader.j - forwardJ * rank * safeSpacing + sideJ * side * safeSpacing),
  };
}
