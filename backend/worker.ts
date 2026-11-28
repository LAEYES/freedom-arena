import { isServerTraversable, validateServerMove } from './worldRules';
import { verifySupabaseBearer, type AuthEnv } from './auth';
import { resolveCombatEncounter, type StoredCard } from './combatEngine';

export interface Env extends AuthEnv {
  DB: D1Database;
}

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

type PlayerPayload = {
  name?: string; level?: number; xp?: number; faction?: string;
  victories?: number; zoneId?: string; explorationCount?: number;
  lastDiscovery?: string; arenaWins?: number; equippedCardId?: string | null;
  fusionMaterials?: number; worldThreat?: number; worldResources?: number;
  worldTile?: { x: number; y: number }; visitedPoiIds?: string[];
  factionStates?: unknown[]; npcMemories?: unknown[]; quests?: unknown[]; cards?: unknown[];
};

const finiteNumber = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalize = (p: PlayerPayload) => ({
  name: String(p.name ?? "Arena Player").slice(0, 24),
  level: Math.max(1, Math.floor(finiteNumber(p.level, 1))),
  xp: Math.max(0, Math.floor(finiteNumber(p.xp, 0))),
  faction: String(p.faction ?? "Aegis"),
  victories: Math.max(0, Math.floor(finiteNumber(p.victories, 0))),
  zone_id: String(p.zoneId ?? "outpost"),
  exploration_count: Math.max(0, Math.floor(finiteNumber(p.explorationCount, 0))),
  last_discovery: String(p.lastDiscovery ?? "").slice(0, 120),
  arena_wins: Math.max(0, Math.floor(finiteNumber(p.arenaWins, 0))),
  equipped_card_id: p.equippedCardId ?? null,
  fusion_materials: Math.max(0, Math.floor(finiteNumber(p.fusionMaterials, 0))),
  world_threat: Math.max(1, Math.floor(finiteNumber(p.worldThreat, 1))),
  world_resources: Math.max(0, Math.floor(finiteNumber(p.worldResources, 0))),
  world_tile: JSON.stringify(p.worldTile ?? { x: 0, y: 0 }),
  visited_poi_ids: JSON.stringify(Array.isArray(p.visitedPoiIds) ? p.visitedPoiIds : []),
  faction_states: JSON.stringify(Array.isArray(p.factionStates) ? p.factionStates : []),
  npc_memories: JSON.stringify(Array.isArray(p.npcMemories) ? p.npcMemories : []),
  quests: JSON.stringify(Array.isArray(p.quests) ? p.quests : []),
  cards: JSON.stringify(Array.isArray(p.cards) ? p.cards : []),
});



type WorldPosition = { x: number; y: number };
type WorldPresenceRow = {
  player_id: string; zone_id: string; tile_x: number; tile_y: number;
  revision: number; updated_at: string;
};

const isWorldPosition = (value: unknown): value is WorldPosition => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<WorldPosition>;
  return Number.isInteger(point.x) && Number.isInteger(point.y)
    && (point.x as number) >= 0 && (point.x as number) < 64
    && (point.y as number) >= 0 && (point.y as number) < 64;
};

const parseObject = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value ?? '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const validPlayerId = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9:_-]+$/.test(value);

const presencePayload = (row: WorldPresenceRow) => ({
  playerId: row.player_id,
  zoneId: row.zone_id,
  worldTile: { x: row.tile_x, y: row.tile_y },
  revision: row.revision,
  updatedAt: row.updated_at,
});


async function enforceRateLimit(db: D1Database, subject: string, routeKey: string): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 60_000);
  try {
    const row = await db.prepare(`INSERT INTO api_rate_limits(subject,route_key,window_start,request_count)
      VALUES(?,?,?,1)
      ON CONFLICT(subject,route_key,window_start) DO UPDATE SET request_count=request_count+1
      RETURNING request_count`).bind(subject, routeKey, windowStart).first<{ request_count: number }>();
    if (windowStart % 10 === 0) {
      await db.prepare('DELETE FROM api_rate_limits WHERE window_start < ?').bind(windowStart - 10).run();
    }
    return Number(row?.request_count ?? 0) <= 60;
  } catch {
    // Fail closed: a missing migration or D1 error must not silently disable throttling.
    return false;
  }
}

const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
};

const fromRow = (row: Record<string, unknown>) => ({
  name: row.name,
  level: row.level,
  xp: row.xp,
  faction: row.faction,
  victories: row.victories,
  zoneId: row.zone_id,
  explorationCount: row.exploration_count,
  lastDiscovery: row.last_discovery,
  arenaWins: row.arena_wins,
  equippedCardId: row.equipped_card_id,
  fusionMaterials: row.fusion_materials,
  worldThreat: row.world_threat,
  worldResources: row.world_resources,
  worldTile: parseJson(row.world_tile, { x: 0, y: 0 }),
  visitedPoiIds: parseJson(row.visited_poi_ids, []),
  factionStates: parseJson(row.faction_states, []),
  npcMemories: parseJson(row.npc_memories, []),
  quests: parseJson(row.quests, []),
  cards: parseJson(row.cards, []),
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "freedom-arena-api", worldSync: "v1" });
    }

    const identity = await verifySupabaseBearer(request, env);
    if (!identity) {
      const configured = Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_JWT_ISSUER?.trim());
      return json({ error: configured ? "unauthorized" : "auth_not_configured" }, configured ? 401 : 503);
    }
    const routeFamily = url.pathname.startsWith('/world/') ? 'world' : url.pathname === '/player' ? 'player' : 'other';
    if (!await enforceRateLimit(env.DB, identity.subject, routeFamily)) {
      return json({ error: "rate_limited_or_security_migration_missing" }, 429);
    }

    const worldRoute = url.pathname.match(/^\/world\/([a-z0-9-]{1,48})\/(snapshot|join|move|heartbeat|state|command)$/);
    if (worldRoute) {
      const zoneId = worldRoute[1];
      const action = worldRoute[2];

      if (request.method === "GET" && action === "snapshot") {
        try {
          const [zoneState, presence, events] = await Promise.all([
            env.DB.prepare("SELECT revision,state_json,updated_at FROM world_zone_state WHERE zone_id = ?").bind(zoneId).first<Record<string, unknown>>(),
            env.DB.prepare("SELECT player_id,zone_id,tile_x,tile_y,revision,updated_at FROM world_player_presence WHERE zone_id = ? AND updated_at >= datetime('now','-90 seconds') ORDER BY updated_at DESC LIMIT 100").bind(zoneId).all<WorldPresenceRow>(),
            env.DB.prepare("SELECT event_id,player_id,event_type,payload_json,created_at FROM world_event_log WHERE zone_id = ? ORDER BY created_at DESC LIMIT 50").bind(zoneId).all<Record<string, unknown>>(),
          ]);
          return json({
            zoneId,
            state: zoneState ? { revision: zoneState.revision, value: parseObject(zoneState.state_json), updatedAt: zoneState.updated_at } : { revision: 0, value: {}, updatedAt: null },
            players: presence.results.map(presencePayload),
            events: events.results.map(event => ({
              id: event.event_id, playerId: event.player_id, type: event.event_type,
              payload: parseObject(event.payload_json), createdAt: event.created_at,
            })),
          });
        } catch {
          return json({ error: "world_snapshot_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "join") {
        const body = await request.json().catch(() => null) as { playerId?: unknown; worldTile?: unknown } | null;
        if (!validPlayerId(body?.playerId) || body?.playerId !== identity.subject || !isWorldPosition(body?.worldTile)) {
          return json({ error: "invalid_world_join" }, 400);
        }
        if (!isServerTraversable(body.worldTile.x, body.worldTile.y)) {
          return json({ error: "world_spawn_blocked" }, 422);
        }
        try {
          const row = await env.DB.prepare(`INSERT INTO world_player_presence
            (player_id,zone_id,tile_x,tile_y,revision,updated_at)
            VALUES(?,?,?,?,0,CURRENT_TIMESTAMP)
            ON CONFLICT(player_id) DO UPDATE SET
              tile_x=CASE WHEN world_player_presence.zone_id=excluded.zone_id THEN world_player_presence.tile_x ELSE excluded.tile_x END,
              tile_y=CASE WHEN world_player_presence.zone_id=excluded.zone_id THEN world_player_presence.tile_y ELSE excluded.tile_y END,
              revision=CASE WHEN world_player_presence.zone_id=excluded.zone_id THEN world_player_presence.revision ELSE world_player_presence.revision+1 END,
              zone_id=excluded.zone_id,updated_at=CURRENT_TIMESTAMP
            RETURNING player_id,zone_id,tile_x,tile_y,revision,updated_at`)
            .bind(body.playerId, zoneId, body.worldTile.x, body.worldTile.y)
            .first<WorldPresenceRow>();
          return json({ presence: row ? presencePayload(row) : null });
        } catch {
          return json({ error: "world_join_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "move") {
        const body = await request.json().catch(() => null) as {
          playerId?: unknown; from?: unknown; to?: unknown; expectedRevision?: unknown;
        } | null;
        if (!body || !validPlayerId(body.playerId) || body.playerId !== identity.subject || !isWorldPosition(body.from) || !isWorldPosition(body.to)
          || !Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) {
          return json({ error: "invalid_world_move" }, 400);
        }
        const movementValidation = validateServerMove(body.from, body.to);
        if (movementValidation === 'invalid_step') {
          return json({ error: "movement_must_be_cardinal_adjacent" }, 422);
        }
        if (movementValidation === 'terrain_blocked') {
          return json({ error: "movement_terrain_blocked" }, 422);
        }
        const expectedRevision = body.expectedRevision as number;
        const eventId = body.playerId + ':' + (expectedRevision + 1);
        try {
          const results = await env.DB.batch([
            env.DB.prepare(`UPDATE world_player_presence SET
              tile_x=?,tile_y=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
              WHERE player_id=? AND zone_id=? AND tile_x=? AND tile_y=? AND revision=?`)
              .bind(body.to.x, body.to.y, body.playerId, zoneId, body.from.x, body.from.y, expectedRevision),
            env.DB.prepare(`INSERT OR IGNORE INTO world_event_log
              (event_id,zone_id,player_id,event_type,payload_json,created_at)
              SELECT ?,?,?, 'player_moved',?,CURRENT_TIMESTAMP
              WHERE EXISTS (SELECT 1 FROM world_player_presence
                WHERE player_id=? AND zone_id=? AND tile_x=? AND tile_y=? AND revision=?)`)
              .bind(eventId, zoneId, body.playerId, JSON.stringify({ from: body.from, to: body.to, revision: expectedRevision + 1 }),
                body.playerId, zoneId, body.to.x, body.to.y, expectedRevision + 1),
          ]);
          const changes = Number(results[0]?.meta?.changes ?? 0);
          if (changes !== 1) {
            const current = await env.DB.prepare("SELECT player_id,zone_id,tile_x,tile_y,revision,updated_at FROM world_player_presence WHERE player_id = ?")
              .bind(body.playerId).first<WorldPresenceRow>();
            return json({ error: "movement_conflict", current: current ? presencePayload(current) : null }, 409);
          }
          const current = await env.DB.prepare("SELECT player_id,zone_id,tile_x,tile_y,revision,updated_at FROM world_player_presence WHERE player_id = ?")
            .bind(body.playerId).first<WorldPresenceRow>();
          return json({ presence: current ? presencePayload(current) : null });
        } catch {
          return json({ error: "world_move_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "heartbeat") {
        const body = await request.json().catch(() => null) as { playerId?: unknown } | null;
        if (!validPlayerId(body?.playerId) || body?.playerId !== identity.subject) return json({ error: "invalid_player_id" }, 400);
        try {
          const row = await env.DB.prepare(`UPDATE world_player_presence SET updated_at=CURRENT_TIMESTAMP
            WHERE player_id=? AND zone_id=?
            RETURNING player_id,zone_id,tile_x,tile_y,revision,updated_at`)
            .bind(body.playerId, zoneId).first<WorldPresenceRow>();
          return row ? json({ presence: presencePayload(row) }) : json({ error: "presence_not_found" }, 404);
        } catch {
          return json({ error: "world_heartbeat_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "command") {
        const body = await request.json().catch(() => null) as { commandId?: unknown; type?: unknown } | null;
        if (!body || typeof body.commandId !== 'string'
          || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.commandId) || body.type !== 'combat') {
          return json({ error: "invalid_world_command" }, 400);
        }

        try {
          const prior = await env.DB.prepare(
            "SELECT outcome_json FROM world_command_log WHERE command_id=? AND player_id=?"
          ).bind(body.commandId, identity.subject).first<{ outcome_json: string }>();
          if (prior) return json({ outcome: parseObject(prior.outcome_json), replayed: true });

          const player = await env.DB.prepare(
            "SELECT level,xp,victories,world_resources,world_threat,cards,equipped_card_id FROM players WHERE id=?"
          ).bind(identity.subject).first<{
            level: number; xp: number; victories: number; world_resources: number; world_threat: number;
            cards: string; equipped_card_id: string | null;
          }>();
          if (!player) return json({ error: "player_not_initialized" }, 409);

          const presence = await env.DB.prepare(
            "SELECT 1 AS present FROM world_player_presence WHERE player_id=? AND zone_id=?"
          ).bind(identity.subject, zoneId).first<{ present: number }>();
          if (!presence) return json({ error: "player_not_in_zone" }, 403);

          const storedCards = parseJson<StoredCard[]>(player.cards, []);
          const safeCards = Array.isArray(storedCards) ? storedCards.slice(0, 500) : [];
          const randomBytes = new Uint32Array(40);
          crypto.getRandomValues(randomBytes);
          const rolls = Array.from(randomBytes, value => value / 4294967296);
          const outcome = resolveCombatEncounter(
            player.level, player.world_threat, safeCards, player.equipped_card_id, rolls,
          );
          const nextXp = player.xp + outcome.xpAwarded;
          const nextLevel = 1 + Math.floor(nextXp / 100);
          const resultJson = JSON.stringify(outcome);

          const results = await env.DB.batch([
            env.DB.prepare(`UPDATE players SET xp=?,level=?,victories=victories+?,
              world_resources=world_resources+?,world_threat=MAX(1,world_threat+?),updated_at=CURRENT_TIMESTAMP
              WHERE id=? AND EXISTS(SELECT 1 FROM world_player_presence WHERE player_id=? AND zone_id=?)
              AND NOT EXISTS(SELECT 1 FROM world_command_log WHERE command_id=?)`)
              .bind(nextXp, nextLevel, outcome.victory ? 1 : 0, outcome.resourcesAwarded,
                outcome.threatDelta, identity.subject, identity.subject, zoneId, body.commandId),
            env.DB.prepare(`INSERT INTO world_command_log(command_id,player_id,zone_id,command_type,outcome_json)
              SELECT ?,?,?, 'combat',? WHERE changes()=1`)
              .bind(body.commandId, identity.subject, zoneId, resultJson),
          ]);
          if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
            const duplicate = await env.DB.prepare(
              "SELECT outcome_json FROM world_command_log WHERE command_id=? AND player_id=?"
            ).bind(body.commandId, identity.subject).first<{ outcome_json: string }>();
            if (duplicate) return json({ outcome: parseObject(duplicate.outcome_json), replayed: true });
            return json({ error: "world_command_conflict" }, 409);
          }
          return json({ outcome, replayed: false });
        } catch {
          return json({ error: "world_command_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "state") {
        return json({ error: "client_zone_state_writes_disabled" }, 403);
        const body = await request.json().catch(() => null) as { expectedRevision?: unknown; state?: unknown } | null;
        if (!body || !Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0
          || !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
          return json({ error: "invalid_world_state" }, 400);
        }
        const stateJson = JSON.stringify(body.state);
        if (stateJson.length > 32768) return json({ error: "world_state_too_large" }, 413);
        const expectedRevision = body.expectedRevision as number;
        try {
          const result = await env.DB.prepare(`INSERT INTO world_zone_state(zone_id,revision,state_json,updated_at)
            SELECT ?,1,?,CURRENT_TIMESTAMP
            WHERE ?=0 OR EXISTS(SELECT 1 FROM world_zone_state WHERE zone_id=?)
            ON CONFLICT(zone_id) DO UPDATE SET
              revision=world_zone_state.revision+1,state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP
            WHERE world_zone_state.revision=?`)
            .bind(zoneId, stateJson, expectedRevision, zoneId, expectedRevision).run();
          if (Number(result.meta.changes ?? 0) !== 1) {
            const current = await env.DB.prepare("SELECT revision,state_json,updated_at FROM world_zone_state WHERE zone_id=?")
              .bind(zoneId).first<Record<string, unknown>>();
            return json({ error: "world_state_conflict", current: current ? {
              revision: current.revision, value: parseObject(current.state_json), updatedAt: current.updated_at,
            } : { revision: 0, value: {}, updatedAt: null } }, 409);
          }
          return json({ revision: expectedRevision + 1, value: body.state });
        } catch {
          return json({ error: "world_state_write_failed" }, 500);
        }
      }

      return json({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname === "/player" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "missing id" }, 400);
      if (id !== identity.subject) return json({ error: "forbidden_player_id" }, 403);
      try {
        const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
        return json({ player: row ? fromRow(row as Record<string, unknown>) : null });
      } catch {
        return json({ error: "database_read_failed" }, 500);
      }
    }

    if (url.pathname === "/player" && request.method === "POST") {
      return json({ error: "client_player_state_writes_disabled" }, 403);
      const body = await request.json().catch(() => null) as { id?: string; player?: PlayerPayload } | null;
      const id = body?.id?.trim();
      if (!id || !body?.player) return json({ error: "invalid payload" }, 400);

      const p = normalize(body.player);
      try {
        await env.DB.prepare(`INSERT INTO players (
          id,name,level,xp,faction,victories,zone_id,exploration_count,last_discovery,
          arena_wins,equipped_card_id,fusion_materials,world_threat,world_resources,
          world_tile,visited_poi_ids,faction_states,npc_memories,quests,cards,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,level=excluded.level,xp=excluded.xp,faction=excluded.faction,
          victories=excluded.victories,zone_id=excluded.zone_id,exploration_count=excluded.exploration_count,
          last_discovery=excluded.last_discovery,arena_wins=excluded.arena_wins,
          equipped_card_id=excluded.equipped_card_id,fusion_materials=excluded.fusion_materials,
          world_threat=excluded.world_threat,world_resources=excluded.world_resources,
          world_tile=excluded.world_tile,visited_poi_ids=excluded.visited_poi_ids,
          faction_states=excluded.faction_states,npc_memories=excluded.npc_memories,
          quests=excluded.quests,cards=excluded.cards,updated_at=CURRENT_TIMESTAMP`).bind(
          id,p.name,p.level,p.xp,p.faction,p.victories,p.zone_id,p.exploration_count,
          p.last_discovery,p.arena_wins,p.equipped_card_id,p.fusion_materials,p.world_threat,
          p.world_resources,p.world_tile,p.visited_poi_ids,p.faction_states,p.npc_memories,p.quests,p.cards
        ).run();

        const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
        return json({ player: row ? fromRow(row as Record<string, unknown>) : null });
      } catch {
        return json({ error: "database_write_failed" }, 500);
      }
    }

    return json({ error: "not_found" }, 404);
  },
};
