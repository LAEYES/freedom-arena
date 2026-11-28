export type WorldSyncPosition = { x: number; y: number };
export type WorldSyncPresence = {
  playerId: string;
  zoneId: string;
  worldTile: WorldSyncPosition;
  revision: number;
  updatedAt: string;
};
export type WorldSyncResult = {
  ok: boolean;
  conflict?: boolean;
  presence?: WorldSyncPresence | null;
  error?: string;
};

export function isValidWorldSyncPosition(value: unknown): value is WorldSyncPosition {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<WorldSyncPosition>;
  return Number.isInteger(point.x) && Number.isInteger(point.y)
    && (point.x as number) >= 0 && (point.x as number) < 64
    && (point.y as number) >= 0 && (point.y as number) < 64;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || 'https://freedom-arena-api.aymericlecloitrematernat.workers.dev';
const ENABLED = import.meta.env.VITE_WORLD_SYNC_ENABLED === 'true';

type WorldSyncClient = {
  syncPosition(zoneId: string, position: WorldSyncPosition): Promise<WorldSyncResult>;
  heartbeat(): Promise<WorldSyncResult>;
  dispose(): void;
};

/**
 * Serializes world movement requests so a player's optimistic UI steps do not
 * race each other. Revision conflicts are surfaced; the client never retries
 * a rejected movement by overwriting the server position.
 */
export function createWorldSyncClient(
  playerId: string,
  onConflict?: (presence: WorldSyncPresence | null) => void,
): WorldSyncClient {
  let queue: Promise<unknown> = Promise.resolve();
  let activeZone: string | null = null;
  let currentPosition: WorldSyncPosition | null = null;
  let revision = 0;
  let disposed = false;
  let conflicted = false;

  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };

  const request = async (zoneId: string, action: string, body: unknown): Promise<Response> => {
    return fetch(API_URL + '/world/' + encodeURIComponent(zoneId) + '/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const join = async (zoneId: string, position: WorldSyncPosition): Promise<WorldSyncResult> => {
    if (!ENABLED) {
      activeZone = zoneId;
      currentPosition = position;
      return { ok: true };
    }
    const response = await request(zoneId, 'join', { playerId, worldTile: position });
    const body = await response.json() as { presence?: WorldSyncPresence | null; error?: string };
    if (!response.ok || !body.presence) return { ok: false, error: body.error ?? 'world_join_failed' };
    activeZone = zoneId;
    currentPosition = body.presence.worldTile;
    revision = body.presence.revision;
    conflicted = false;
    return { ok: true, presence: body.presence };
  };

  return {
    syncPosition(zoneId, position) {
      return enqueue(async () => {
        if (disposed) return { ok: false, error: 'world_sync_disposed' };
        if (!isValidWorldSyncPosition(position)) return { ok: false, error: 'invalid_world_position' };
        if (!ENABLED) {
          activeZone = zoneId;
          currentPosition = position;
          return { ok: true };
        }
        if (activeZone !== zoneId || currentPosition === null) return join(zoneId, position);
        if (currentPosition.x === position.x && currentPosition.y === position.y) return { ok: true };
        if (conflicted) return { ok: false, conflict: true, error: 'world_sync_requires_rejoin' };
        const from = currentPosition;
        const distance = Math.abs(position.x - from.x) + Math.abs(position.y - from.y);
        if (distance !== 1) return { ok: false, error: 'movement_must_be_cardinal_adjacent' };
        try {
          const response = await request(zoneId, 'move', {
            playerId, from, to: position, expectedRevision: revision,
          });
          const body = await response.json() as {
            presence?: WorldSyncPresence | null;
            current?: WorldSyncPresence | null;
            error?: string;
          };
          if (response.status === 409) {
            conflicted = true;
            const current = body.current ?? null;
            onConflict?.(current);
            return { ok: false, conflict: true, presence: current, error: body.error };
          }
          if (!response.ok || !body.presence) return { ok: false, error: body.error ?? 'world_move_failed' };
          currentPosition = body.presence.worldTile;
          revision = body.presence.revision;
          return { ok: true, presence: body.presence };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'world_sync_unavailable' };
        }
      });
    },
    heartbeat() {
      return enqueue(async () => {
        if (disposed || !ENABLED || !activeZone) return { ok: !disposed };
        try {
          const response = await request(activeZone, 'heartbeat', { playerId });
          const body = await response.json() as { presence?: WorldSyncPresence | null; error?: string };
          if (!response.ok || !body.presence) return { ok: false, error: body.error ?? 'world_heartbeat_failed' };
          return { ok: true, presence: body.presence };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'world_sync_unavailable' };
        }
      });
    },
    dispose() {
      disposed = true;
    },
  };
}
