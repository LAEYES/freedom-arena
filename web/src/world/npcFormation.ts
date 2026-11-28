import { findTerrainPath, isTileBlocked, tileKey } from './navigation';
import type { TileCoordinate } from './coordinates';
import { getNpcFormationSlot, type NpcTacticalRole } from './npcTactics';
import type { TerrainMap } from './terrain';

export type NpcFormationMember = { id: string; role: NpcTacticalRole };
export type NpcFormationPlan = {
  id: string;
  role: NpcTacticalRole;
  slot: TileCoordinate;
  path: TileCoordinate[];
};

const CARDINAL = [
  { i: 0, j: -1 }, { i: 1, j: 0 }, { i: 0, j: 1 }, { i: -1, j: 0 },
];

/** Deterministic slot planner with terrain validation and bounded fallback search. */
export function planNpcFormation(
  map: TerrainMap,
  leader: TileCoordinate,
  facing: Pick<TileCoordinate, 'i' | 'j'>,
  members: readonly NpcFormationMember[],
  occupiedTiles: ReadonlySet<string> = new Set(),
): NpcFormationPlan[] {
  const reservations = new Set(occupiedTiles);
  reservations.add(tileKey(leader.i, leader.j));
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  const plans: NpcFormationPlan[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const member = sorted[index];
    const ideal = getNpcFormationSlot(leader, index, facing, member.role === 'GUARD' ? 1 : 2);
    const candidates: TileCoordinate[] = [ideal];
    for (let radius = 1; radius <= 3; radius++) {
      for (const direction of CARDINAL) {
        candidates.push({ i: ideal.i + direction.i * radius, j: ideal.j + direction.j * radius });
      }
    }

    let chosen: TileCoordinate | null = null;
    let path: TileCoordinate[] = [];
    for (const candidate of candidates) {
      if (isTileBlocked(map, candidate.i, candidate.j, reservations)) continue;
      const route = findTerrainPath(map, leader, candidate, {
        allowDiagonal: false, blockedTiles: reservations, maxExpandedNodes: 2048,
      });
      if (route.length > 1) {
        chosen = candidate;
        path = route;
        break;
      }
    }
    if (!chosen) continue;
    reservations.add(tileKey(chosen.i, chosen.j));
    plans.push({ id: member.id, role: member.role, slot: chosen, path });
  }
  return plans;
}

export type NpcFormationMotion = {
  path: TileCoordinate[];
  segmentIndex: number;
  elapsedMs: number;
  stepDurationMs: number;
};

export function createNpcFormationMotion(
  plan: NpcFormationPlan,
  stepDurationMs = 420,
): NpcFormationMotion {
  return {
    path: plan.path,
    segmentIndex: 0,
    elapsedMs: 0,
    stepDurationMs: Math.max(100, Number.isFinite(stepDurationMs) ? stepDurationMs : 420),
  };
}

/** Advances a formation member along its reserved path with bounded frame time. */
export function advanceNpcFormationMotion(
  motion: NpcFormationMotion,
  deltaMs: number,
): NpcFormationMotion {
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, Math.min(100, deltaMs)) : 0;
  if (motion.path.length < 2 || safeDelta === 0) return motion;
  let segmentIndex = motion.segmentIndex;
  let elapsedMs = motion.elapsedMs + safeDelta;
  let guard = 0;
  while (elapsedMs >= motion.stepDurationMs && guard++ < 4
    && segmentIndex < motion.path.length - 1) {
    elapsedMs -= motion.stepDurationMs;
    segmentIndex++;
  }
  if (segmentIndex >= motion.path.length - 1) {
    return { ...motion, segmentIndex: motion.path.length - 1, elapsedMs: 0 };
  }
  return { ...motion, segmentIndex, elapsedMs };
}

export function getNpcFormationPose(motion: NpcFormationMotion): { x: number; y: number; progress: number } {
  const current = motion.path[motion.segmentIndex] ?? motion.path[0];
  const next = motion.path[Math.min(motion.segmentIndex + 1, motion.path.length - 1)] ?? current;
  const progress = motion.segmentIndex >= motion.path.length - 1
    ? 0 : Math.max(0, Math.min(1, motion.elapsedMs / motion.stepDurationMs));
  return {
    x: current.i + (next.i - current.i) * progress,
    y: current.j + (next.j - current.j) * progress,
    progress,
  };
}
