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
  const length = Math.hypot(facing.i, facing.j);
  const forwardI = length > 0 ? facing.i / length : 1;
  const forwardJ = length > 0 ? facing.j / length : 0;
  const sideI = -forwardJ;
  const sideJ = forwardI;
  const rank = Math.floor(safeIndex / 2) + 1;
  const side = safeIndex % 2 === 0 ? -1 : 1;
  return {
    i: Math.round(leader.i - forwardI * rank * safeSpacing + sideI * side * safeSpacing),
    j: Math.round(leader.j - forwardJ * rank * safeSpacing + sideJ * side * safeSpacing),
  };
}

export type NpcRoleAssignmentInput = { id: string; position: TileCoordinate };
export type NpcRoleAssignment = { id: string; role: NpcTacticalRole };

/**
 * Assigns tactical responsibilities relative to the current threat:
 * nearest actor screens as GUARD, farthest actor scouts, remaining actors support.
 * Stable ID tie-breaks make the result independent of input/render order.
 */
export function assignNpcDynamicRoles(
  members: readonly NpcRoleAssignmentInput[],
  threat: TileCoordinate,
): NpcRoleAssignment[] {
  const ranked = [...members].sort((a, b) => {
    const da = Math.abs(a.position.i - threat.i) + Math.abs(a.position.j - threat.j);
    const db = Math.abs(b.position.i - threat.i) + Math.abs(b.position.j - threat.j);
    return da - db || a.id.localeCompare(b.id);
  });
  return ranked.map((member, index) => ({
    id: member.id,
    role: ranked.length === 1 || index === 0
      ? 'GUARD'
      : index === ranked.length - 1 ? 'SCOUT' : 'SUPPORT',
  }));
}
