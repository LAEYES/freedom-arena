import type { TileCoordinate } from './coordinates';
import { findTerrainPath, tileKey } from './navigation';
import { hasTerrainLineOfSight } from './npcPerception';
import type { TerrainMap } from './terrain';

export type NpcEngagementStatus = 'READY' | 'OUT_OF_RANGE' | 'OCCLUDED' | 'OUT_OF_ARC' | 'COOLDOWN';
export type NpcEngagementInput = {
  origin: TileCoordinate;
  target: TileCoordinate;
  facing: Pick<TileCoordinate, 'i' | 'j'>;
  range: number;
  halfAngleDegrees?: number;
  cooldownRemainingMs?: number;
};
export type NpcEngagementEvaluation = {
  status: NpcEngagementStatus;
  distance: number;
  hasLineOfSight: boolean;
  insideFacingArc: boolean;
};

/** Pure geometric engagement gate; deliberately does not resolve hit, damage or health. */
export function evaluateNpcEngagement(
  map: TerrainMap,
  input: NpcEngagementInput,
): NpcEngagementEvaluation {
  const dx = input.target.i - input.origin.i;
  const dy = input.target.j - input.origin.j;
  const distance = Math.hypot(dx, dy);
  const range = Number.isFinite(input.range) ? Math.max(0, input.range) : 0;
  const halfAngle = Number.isFinite(input.halfAngleDegrees)
    ? Math.max(0, Math.min(180, input.halfAngleDegrees ?? 45)) : 45;
  const facingLength = Math.hypot(input.facing.i, input.facing.j);
  const targetLength = Math.hypot(dx, dy);
  const dot = facingLength > 0 && targetLength > 0
    ? (input.facing.i * dx + input.facing.j * dy) / (facingLength * targetLength)
    : 1;
  const insideFacingArc = targetLength === 0 || dot >= Math.cos(halfAngle * Math.PI / 180);
  const hasLineOfSight = hasTerrainLineOfSight(map, input.origin, input.target);
  let status: NpcEngagementStatus = 'READY';
  if (distance > range) status = 'OUT_OF_RANGE';
  else if (!hasLineOfSight) status = 'OCCLUDED';
  else if (!insideFacingArc) status = 'OUT_OF_ARC';
  else if (Number.isFinite(input.cooldownRemainingMs) && (input.cooldownRemainingMs ?? 0) > 0) status = 'COOLDOWN';
  return { status, distance, hasLineOfSight, insideFacingArc };
}

export type NpcInterceptionPlan = {
  id: string;
  slot: TileCoordinate;
  path: TileCoordinate[];
  pathCost: number;
};

/**
 * Allocates unique reachable cardinal staging tiles around a target.
 * This is path-planning only: it does not execute an attack or claim hit probability.
 */
export function planNpcInterceptionSlots(
  map: TerrainMap,
  target: TileCoordinate,
  members: readonly { id: string; position: TileCoordinate }[],
  occupied: ReadonlySet<string> = new Set(),
): NpcInterceptionPlan[] {
  const slots = [
    { i: target.i - 1, j: target.j },
    { i: target.i + 1, j: target.j },
    { i: target.i, j: target.j - 1 },
    { i: target.i, j: target.j + 1 },
  ];
  const reserved = new Set(occupied);
  reserved.add(tileKey(target.i, target.j));
  const plans: NpcInterceptionPlan[] = [];
  const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
  for (const member of ordered) {
    const memberBlocked = new Set(reserved);
    memberBlocked.delete(tileKey(member.position.i, member.position.j));
    const options = slots.flatMap(slot => {
      if (reserved.has(tileKey(slot.i, slot.j))) return [];
      const path = findTerrainPath(map, member.position, slot, {
        allowDiagonal: false,
        blockedTiles: memberBlocked,
        maxExpandedNodes: 2048,
      });
      if (path.length < 2) return [];
      return [{ slot, path, pathCost: path.length - 1 }];
    }).sort((a, b) =>
      a.pathCost - b.pathCost
      || a.slot.j - b.slot.j
      || a.slot.i - b.slot.i,
    );
    const selected = options[0];
    if (!selected) continue;
    reserved.add(tileKey(selected.slot.i, selected.slot.j));
    plans.push({ id: member.id, ...selected });
  }
  return plans;
}
