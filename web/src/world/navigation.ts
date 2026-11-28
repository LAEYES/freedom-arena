import type { TileCoordinate } from './coordinates';
import { getTerrainTile, type TerrainMap, type TerrainTile } from './terrain';

export type NavigationOptions = {
  allowDiagonal: boolean;
  blockedTiles: ReadonlySet<string>;
  maxExpandedNodes: number;
  /** Water tiles explicitly made traversable by validated bridge links. */
  bridgeTiles: ReadonlySet<string>;
};

export const DEFAULT_NAVIGATION_OPTIONS: Readonly<NavigationOptions> = Object.freeze({
  allowDiagonal: true,
  blockedTiles: new Set<string>(),
  maxExpandedNodes: 8192,
  bridgeTiles: new Set<string>(),
});

type QueueEntry = { i: number; j: number; g: number; f: number; order: number };

class MinHeap {
  private values: QueueEntry[] = [];

  get size(): number { return this.values.length; }

  push(value: QueueEntry): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): QueueEntry | undefined {
    if (!this.values.length) return undefined;
    const first = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.values.length) break;
        let child = left;
        if (right < this.values.length && this.compare(this.values[right], this.values[left]) < 0) child = right;
        if (this.compare(last, this.values[child]) <= 0) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = last;
    }
    return first;
  }

  private compare(a: QueueEntry, b: QueueEntry): number {
    return a.f - b.f || a.g - b.g || a.order - b.order;
  }
}

export function tileKey(i: number, j: number): string {
  return i + ':' + j;
}

export function isTileBlocked(
  map: TerrainMap,
  i: number,
  j: number,
  blockedTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.blockedTiles,
  bridgeTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.bridgeTiles,
): boolean {
  const tile = getTerrainTile(map, i, j);
  const key = tileKey(i, j);
  return !tile || (!tile.walkable && !bridgeTiles.has(key)) || blockedTiles.has(key);
}

function neighbors(allowDiagonal: boolean): Array<{ di: number; dj: number; cost: number }> {
  const cardinal = [
    { di: 1, dj: 0, cost: 1 },
    { di: -1, dj: 0, cost: 1 },
    { di: 0, dj: 1, cost: 1 },
    { di: 0, dj: -1, cost: 1 },
  ];
  if (!allowDiagonal) return cardinal;
  const diagonal = Math.SQRT2;
  return cardinal.concat([
    { di: 1, dj: 1, cost: diagonal },
    { di: 1, dj: -1, cost: diagonal },
    { di: -1, dj: 1, cost: diagonal },
    { di: -1, dj: -1, cost: diagonal },
  ]);
}

function octileDistance(i: number, j: number, targetI: number, targetJ: number): number {
  const dx = Math.abs(targetI - i);
  const dy = Math.abs(targetJ - j);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function stepCost(
  destination: TerrainTile,
  geometricCost: number,
  bridgeTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.bridgeTiles,
): number {
  const movementCost = bridgeTiles.has(tileKey(destination.i, destination.j)) ? 2.25 : destination.movementCost;
  return movementCost * geometricCost;
}

export function canStep(
  map: TerrainMap,
  from: Pick<TileCoordinate, 'i' | 'j'>,
  to: Pick<TileCoordinate, 'i' | 'j'>,
  blockedTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.blockedTiles,
  bridgeTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.bridgeTiles,
): boolean {
  const di = to.i - from.i;
  const dj = to.j - from.j;
  if (!Number.isInteger(from.i) || !Number.isInteger(from.j) || !Number.isInteger(to.i) || !Number.isInteger(to.j)) return false;
  if (Math.max(Math.abs(di), Math.abs(dj)) !== 1) return false;
  if (isTileBlocked(map, to.i, to.j, blockedTiles, bridgeTiles)) return false;

  // Prevent diagonal corner cutting through two blocked orthogonal cells.
  if (di !== 0 && dj !== 0) {
    if (isTileBlocked(map, from.i + di, from.j, blockedTiles, bridgeTiles)) return false;
    if (isTileBlocked(map, from.i, from.j + dj, blockedTiles, bridgeTiles)) return false;
  }
  return !isTileBlocked(map, from.i, from.j, blockedTiles, bridgeTiles);
}

export function resolveMovementStep(
  map: TerrainMap,
  from: TileCoordinate,
  to: TileCoordinate,
  blockedTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.blockedTiles,
  bridgeTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.bridgeTiles,
): TileCoordinate | null {
  if (!canStep(map, from, to, blockedTiles, bridgeTiles)) return null;
  const destination = getTerrainTile(map, to.i, to.j);
  return destination ? { i: destination.i, j: destination.j, elevation: destination.elevation } : null;
}

export function findTerrainPath(
  map: TerrainMap,
  start: TileCoordinate,
  target: TileCoordinate,
  options: Partial<NavigationOptions> = {},
): TileCoordinate[] {
  const config = { ...DEFAULT_NAVIGATION_OPTIONS, ...options };
  if (!Number.isInteger(config.maxExpandedNodes) || config.maxExpandedNodes < 1) {
    throw new RangeError('maxExpandedNodes must be a positive integer');
  }
  if (!Number.isInteger(start.i) || !Number.isInteger(start.j)
    || !Number.isInteger(target.i) || !Number.isInteger(target.j)) return [];
  if (isTileBlocked(map, start.i, start.j, config.blockedTiles, config.bridgeTiles)
    || isTileBlocked(map, target.i, target.j, config.blockedTiles, config.bridgeTiles)) return [];

  if (start.i === target.i && start.j === target.j) {
    const tile = getTerrainTile(map, start.i, start.j)!;
    return [{ i: tile.i, j: tile.j, elevation: tile.elevation }];
  }

  const open = new MinHeap();
  const startKey = tileKey(start.i, start.j);
  const targetKey = tileKey(target.i, target.j);
  const bestCost = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const positionByKey = new Map<string, { i: number; j: number }>([[startKey, { i: start.i, j: start.j }]]);
  const directions = neighbors(config.allowDiagonal);
  let order = 0;
  let expanded = 0;
  open.push({ i: start.i, j: start.j, g: 0, f: octileDistance(start.i, start.j, target.i, target.j), order: order++ });

  while (open.size && expanded < config.maxExpandedNodes) {
    const current = open.pop()!;
    const currentKey = tileKey(current.i, current.j);
    if (current.g > (bestCost.get(currentKey) ?? Infinity)) continue;
    expanded++;

    if (currentKey === targetKey) {
      const keys = [targetKey];
      let cursor = targetKey;
      while (cursor !== startKey) {
        const parent = previous.get(cursor);
        if (!parent) return [];
        keys.unshift(parent);
        cursor = parent;
      }
      return keys.map(key => {
        const position = positionByKey.get(key)!;
        const tile = getTerrainTile(map, position.i, position.j)!;
        return { i: tile.i, j: tile.j, elevation: tile.elevation };
      });
    }

    for (const direction of directions) {
      const nextI = current.i + direction.di;
      const nextJ = current.j + direction.dj;
      if (isTileBlocked(map, nextI, nextJ, config.blockedTiles, config.bridgeTiles)) continue;
      if (direction.di !== 0 && direction.dj !== 0) {
        if (isTileBlocked(map, current.i + direction.di, current.j, config.blockedTiles, config.bridgeTiles)
          || isTileBlocked(map, current.i, current.j + direction.dj, config.blockedTiles, config.bridgeTiles)) continue;
      }

      const nextTile = getTerrainTile(map, nextI, nextJ)!;
      const nextKey = tileKey(nextI, nextJ);
      const candidate = current.g + stepCost(nextTile, direction.cost, config.bridgeTiles);
      if (candidate >= (bestCost.get(nextKey) ?? Infinity)) continue;

      bestCost.set(nextKey, candidate);
      previous.set(nextKey, currentKey);
      positionByKey.set(nextKey, { i: nextI, j: nextJ });
      open.push({
        i: nextI,
        j: nextJ,
        g: candidate,
        f: candidate + octileDistance(nextI, nextJ, target.i, target.j),
        order: order++,
      });
    }
  }
  return [];
}

export function calculateTerrainPathCost(
  map: TerrainMap,
  path: TileCoordinate[],
  bridgeTiles: ReadonlySet<string> = DEFAULT_NAVIGATION_OPTIONS.bridgeTiles,
): number {
  if (path.length <= 1) return 0;
  let total = 0;
  for (let index = 1; index < path.length; index++) {
    const previous = path[index - 1];
    const current = path[index];
    const di = Math.abs(current.i - previous.i);
    const dj = Math.abs(current.j - previous.j);
    if (Math.max(di, dj) !== 1) return Infinity;
    const tile = getTerrainTile(map, current.i, current.j);
    if (!tile || (!tile.walkable && !bridgeTiles.has(tileKey(current.i, current.j)))) return Infinity;
    if (di === 1 && dj === 1) {
      if (isTileBlocked(map, previous.i + (current.i - previous.i), previous.j, DEFAULT_NAVIGATION_OPTIONS.blockedTiles, bridgeTiles)
        || isTileBlocked(map, previous.i, previous.j + (current.j - previous.j), DEFAULT_NAVIGATION_OPTIONS.blockedTiles, bridgeTiles)) return Infinity;
    }
    total += stepCost(tile, di === 1 && dj === 1 ? Math.SQRT2 : 1, bridgeTiles);
  }
  return total;
}
