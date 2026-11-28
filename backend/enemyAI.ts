export type EnemyArchetype = "bruiser" | "skirmisher" | "sentinel" | "arcanist";
export type TacticalAction = "advance" | "retreat" | "hold" | "strike" | "heavy_strike" | "guard" | "skill";
export type GridPoint = { x: number; y: number };
export type TacticalDecision = { archetype: EnemyArchetype; action: TacticalAction; next: GridPoint; reason: string };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(n) ? n : min)));
const key = (p: GridPoint) => p.y * 64 + p.x;
const valid = (p: GridPoint) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 64 && p.y >= 0 && p.y < 64;
const distance = (a: GridPoint, b: GridPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function chooseEnemyArchetype(roll: number): EnemyArchetype {
  const r = Math.max(0, Math.min(0.999999, Number.isFinite(roll) ? roll : 0.5));
  return r < 0.25 ? "bruiser" : r < 0.5 ? "skirmisher" : r < 0.75 ? "sentinel" : "arcanist";
}

export function findNextStep(start: GridPoint, goal: GridPoint, blocked: ReadonlySet<number>): GridPoint {
  if (!valid(start) || !valid(goal) || (start.x === goal.x && start.y === goal.y)) return start;
  const queue: GridPoint[] = [start];
  const parent = new Map<number, number>();
  const visited = new Set<number>([key(start)]);
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  let found = false;
  for (let head = 0; head < queue.length && head < 4096; head++) {
    const current = queue[head];
    if (current.x === goal.x && current.y === goal.y) { found = true; break; }
    for (const d of dirs) {
      const next = {x:current.x+d.x,y:current.y+d.y};
      if (!valid(next)) continue;
      const id = key(next);
      if (visited.has(id) || (blocked.has(id) && !(next.x === goal.x && next.y === goal.y))) continue;
      visited.add(id); parent.set(id,key(current)); queue.push(next);
    }
  }
  if (!found) return start;
  let cursor = key(goal);
  while (parent.get(cursor) !== key(start)) {
    const previous = parent.get(cursor);
    if (previous === undefined) return start;
    cursor = previous;
  }
  return { x: cursor % 64, y: Math.floor(cursor / 64) };
}

export function decideEnemyTactics(input: {
  archetype: EnemyArchetype; enemy: GridPoint; player: GridPoint; enemyHp: number; enemyMaxHp: number;
  turn: number; roll: number; blocked?: ReadonlySet<number>;
}): TacticalDecision {
  const { archetype, enemy, player } = input;
  if (!valid(enemy) || !valid(player)) return { archetype, action: "hold", next: enemy, reason: "invalid_position" };
  const hpRatio = clamp(input.enemyHp, 0, Math.max(1,input.enemyMaxHp)) / Math.max(1,input.enemyMaxHp);
  const d = distance(enemy, player);
  const roll = Math.max(0,Math.min(0.999999,Number.isFinite(input.roll)?input.roll:0.5));
  const blocked = input.blocked ?? new Set<number>();
  if (archetype === "sentinel" && hpRatio < 0.35 && roll > 0.25)
    return { archetype, action: "guard", next: enemy, reason: "defensive_low_health" };
  if (archetype === "arcanist" && d > 1)
    return { archetype, action: "skill", next: enemy, reason: "ranged_skill_in_reach" };
  if (archetype === "skirmisher" && d <= 1 && hpRatio < 0.55)
    return { archetype, action: "retreat", next: findNextStep(enemy, {x:clamp(enemy.x+(enemy.x-player.x),0,63),y:clamp(enemy.y+(enemy.y-player.y),0,63)}, blocked), reason: "disengage_when_wounded" };
  if (d > 1) return { archetype, action: "advance", next: findNextStep(enemy, player, blocked), reason: "close_distance" };
  if (archetype === "bruiser" && roll > 0.35) return { archetype, action: "heavy_strike", next: enemy, reason: "high_pressure_melee" };
  if (archetype === "arcanist" && input.turn % 3 === 0) return { archetype, action: "skill", next: enemy, reason: "periodic_spell" };
  if (archetype === "sentinel" && input.turn % 4 === 0) return { archetype, action: "guard", next: enemy, reason: "guard_rotation" };
  return { archetype, action: "strike", next: enemy, reason: "standard_attack" };
}
