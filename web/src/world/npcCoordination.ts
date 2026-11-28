import type { TileCoordinate } from './coordinates';
import { hasTerrainLineOfSight } from './npcPerception';
import { findTerrainPath, tileKey } from './navigation';
import type { TerrainMap } from './terrain';
import type { NpcBehaviorAgent } from './npcBehavior';

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
export function receiveNpcAlertSignal(
  agent: NpcBehaviorAgent,
  source: TileCoordinate,
): NpcBehaviorAgent {
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

export type NpcThreatCandidate = {
  id: string;
  position: TileCoordinate;
  priority: number;
  urgency?: number;
  visible?: boolean;
};

export type RankedNpcThreat = NpcThreatCandidate & { score: number; distance: number };

/** Stable threat ordering: priority, urgency and visibility dominate distance. */
export function rankNpcThreats(
  origin: TileCoordinate,
  threats: readonly NpcThreatCandidate[],
): RankedNpcThreat[] {
  return threats.map(threat => {
    const distance = Math.hypot(threat.position.i - origin.i, threat.position.j - origin.j);
    const priority = Number.isFinite(threat.priority) ? Math.max(0, Math.min(100, threat.priority)) : 0;
    const urgency = Number.isFinite(threat.urgency) ? Math.max(0, Math.min(10, threat.urgency ?? 0)) : 0;
    return { ...threat, distance, score: priority * 100 + urgency * 10 + (threat.visible ? 25 : 0) - distance };
  }).sort((a, b) => b.score - a.score || a.distance - b.distance || a.id.localeCompare(b.id));
}

export type NpcInterceptionSquad = {
  id: string;
  members: readonly { id: string; position: TileCoordinate }[];
};
export type NpcCoordinatedInterceptionPlan = {
  squadId: string;
  memberId: string;
  slot: TileCoordinate;
  path: TileCoordinate[];
  pathCost: number;
  ring: number;
};

/** Allocates globally unique, reachable staging cells around a target across multiple squads. */
export function planMultiSquadInterceptions(
  map: TerrainMap,
  target: TileCoordinate,
  squads: readonly NpcInterceptionSquad[],
  occupied: ReadonlySet<string> = new Set(),
  maxRing = 4,
): NpcCoordinatedInterceptionPlan[] {
  const safeRing = Number.isFinite(maxRing) ? Math.max(1, Math.min(8, Math.floor(maxRing))) : 4;
  const reserved = new Set(occupied);
  reserved.add(tileKey(target.i, target.j));
  for (const squad of squads) for (const member of squad.members) {
    reserved.add(tileKey(member.position.i, member.position.j));
  }
  const plans: NpcCoordinatedInterceptionPlan[] = [];
  const orderedSquads = [...squads].sort((a, b) => {
    const centroid = (squad: NpcInterceptionSquad) => squad.members.length
      ? squad.members.reduce((sum, member) => sum + Math.abs(member.position.i - target.i) + Math.abs(member.position.j - target.j), 0) / squad.members.length
      : Infinity;
    return centroid(a) - centroid(b) || a.id.localeCompare(b.id);
  });
  for (const squad of orderedSquads) {
    for (const member of [...squad.members].sort((a, b) => a.id.localeCompare(b.id))) {
      const memberBlocked = new Set(reserved);
      memberBlocked.delete(tileKey(member.position.i, member.position.j));
      const candidates: Array<{ slot: TileCoordinate; ring: number; path: TileCoordinate[]; pathCost: number }> = [];
      for (let ring = 1; ring <= safeRing; ring++) {
        for (let di = -ring; di <= ring; di++) {
          const dj = ring - Math.abs(di);
          const slots = dj === 0
            ? [{ i: target.i + di, j: target.j }]
            : [{ i: target.i + di, j: target.j - dj }, { i: target.i + di, j: target.j + dj }];
          for (const slot of slots) {
            if (reserved.has(tileKey(slot.i, slot.j))) continue;
            const path = findTerrainPath(map, member.position, slot, {
              allowDiagonal: false, blockedTiles: memberBlocked, maxExpandedNodes: 2048,
            });
            if (path.length > 1) candidates.push({ slot, ring, path, pathCost: path.length - 1 });
          }
        }
        if (candidates.length) break;
      }
      candidates.sort((a, b) => a.pathCost - b.pathCost || a.ring - b.ring
        || a.slot.j - b.slot.j || a.slot.i - b.slot.i);
      const selected = candidates[0];
      if (!selected) continue;
      reserved.add(tileKey(selected.slot.i, selected.slot.j));
      plans.push({ squadId: squad.id, memberId: member.id, ...selected });
    }
  }
  return plans;
}

export type NpcTrajectoryPlan = { id: string; path: readonly TileCoordinate[] };
export type NpcTrajectoryFrame = { tick: number; positions: Readonly<Record<string, TileCoordinate>> };
export type NpcTrajectorySchedule = { frames: NpcTrajectoryFrame[]; completed: string[]; blocked: string[] };

/**
 * Schedules simultaneous one-tile intents with vertex and edge-swap reservations.
 * Units wait rather than overlap or teleport. Conservative occupancy avoids entering
 * a cell unless its current occupant successfully vacates during the same tick.
 */
export function scheduleNpcTrajectories(
  plans: readonly NpcTrajectoryPlan[],
  maxTicks = 256,
): NpcTrajectorySchedule {
  const ordered = [...plans].sort((a, b) => a.id.localeCompare(b.id)).filter(plan => plan.path.length > 0);
  const positions = new Map(ordered.map(plan => [plan.id, { ...plan.path[0] }]));
  const indices = new Map(ordered.map(plan => [plan.id, 0]));
  const paths = new Map(ordered.map(plan => [plan.id, plan.path]));
  const frames: NpcTrajectoryFrame[] = [];
  const limit = Number.isFinite(maxTicks) ? Math.max(0, Math.min(2048, Math.floor(maxTicks))) : 256;

  for (let tick = 1; tick <= limit; tick++) {
    const intents = new Map<string, TileCoordinate>();
    for (const plan of ordered) {
      const index = indices.get(plan.id) ?? 0;
      if (index < plan.path.length - 1) intents.set(plan.id, plan.path[index + 1]);
    }
    if (!intents.size) break;
    const winners = new Set(intents.keys());
    let changed = true;
    while (changed) {
      changed = false;
      const byDestination = new Map<string, string[]>();
      for (const id of winners) {
        const next = intents.get(id)!;
        const key = tileKey(next.i, next.j);
        const ids = byDestination.get(key) ?? [];
        ids.push(id);
        byDestination.set(key, ids);
      }
      for (const ids of byDestination.values()) {
        if (ids.length > 1) for (const id of ids) if (winners.delete(id)) changed = true;
      }
      for (const id of [...winners]) {
        const next = intents.get(id)!;
        const occupant = [...positions.entries()].find(([, pos]) => tileKey(pos.i, pos.j) === tileKey(next.i, next.j))?.[0];
        if (occupant && occupant !== id && !winners.has(occupant)) {
          winners.delete(id);
          changed = true;
          continue;
        }
        if (occupant && occupant !== id) {
          const occupantNext = intents.get(occupant);
          const current = positions.get(id)!;
          if (occupantNext && tileKey(occupantNext.i, occupantNext.j) === tileKey(current.i, current.j)) {
            winners.delete(id);
            winners.delete(occupant);
            changed = true;
          }
        }
      }
    }
    for (const id of winners) {
      positions.set(id, intents.get(id)!);
      indices.set(id, (indices.get(id) ?? 0) + 1);
    }
    const snapshot: Record<string, TileCoordinate> = {};
    for (const [id, position] of positions) snapshot[id] = { ...position };
    frames.push({ tick, positions: snapshot });
    if (ordered.every(plan => (indices.get(plan.id) ?? 0) >= plan.path.length - 1)) break;
  }
  const completed = ordered.filter(plan => (indices.get(plan.id) ?? 0) >= plan.path.length - 1).map(plan => plan.id).sort();
  const blocked = ordered.filter(plan => !completed.includes(plan.id)).map(plan => plan.id).sort();
  return { frames, completed, blocked };
}
