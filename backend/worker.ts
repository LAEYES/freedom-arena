export interface Env {
  DB: D1Database;
}

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
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
      return json({ ok: true, service: "freedom-arena-api" });
    }

    if (url.pathname === "/player" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "missing id" }, 400);
      try {
        const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
        return json({ player: row ? fromRow(row as Record<string, unknown>) : null });
      } catch {
        return json({ error: "database_read_failed" }, 500);
      }
    }

    if (url.pathname === "/player" && request.method === "POST") {
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
