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
  factionStates?: unknown[]; quests?: unknown[]; cards?: unknown[];
};

const normalize = (p: PlayerPayload) => ({
  name: String(p.name ?? "Arena Player").slice(0, 24),
  level: Math.max(1, Number(p.level ?? 1)),
  xp: Math.max(0, Number(p.xp ?? 0)),
  faction: String(p.faction ?? "Aegis"),
  victories: Math.max(0, Number(p.victories ?? 0)),
  zone_id: String(p.zoneId ?? "outpost"),
  exploration_count: Math.max(0, Number(p.explorationCount ?? 0)),
  last_discovery: String(p.lastDiscovery ?? ""),
  arena_wins: Math.max(0, Number(p.arenaWins ?? 0)),
  equipped_card_id: p.equippedCardId ?? null,
  fusion_materials: Math.max(0, Number(p.fusionMaterials ?? 0)),
  world_threat: Math.max(1, Number(p.worldThreat ?? 1)),
  world_resources: Math.max(0, Number(p.worldResources ?? 0)),
  world_tile: JSON.stringify(p.worldTile ?? { x: 0, y: 0 }),
  visited_poi_ids: JSON.stringify(p.visitedPoiIds ?? []),
  faction_states: JSON.stringify(p.factionStates ?? []),
  quests: JSON.stringify(p.quests ?? []),
  cards: JSON.stringify(p.cards ?? []),
});

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
  worldTile: JSON.parse(String(row.world_tile ?? '{"x":0,"y":0}')),
  visitedPoiIds: JSON.parse(String(row.visited_poi_ids ?? "[]")),
  factionStates: JSON.parse(String(row.faction_states ?? "[]")),
  quests: JSON.parse(String(row.quests ?? "[]")),
  cards: JSON.parse(String(row.cards ?? "[]")),
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
      const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
      return json({ player: row ? fromRow(row as Record<string, unknown>) : null });
    }

    if (url.pathname === "/player" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { id?: string; player?: PlayerPayload } | null;
      const id = body?.id?.trim();
      if (!id || !body?.player) return json({ error: "invalid payload" }, 400);

      const p = normalize(body.player);
      await env.DB.prepare(`INSERT INTO players (
        id,name,level,xp,faction,victories,zone_id,exploration_count,last_discovery,
        arena_wins,equipped_card_id,fusion_materials,world_threat,world_resources,
        world_tile,visited_poi_ids,faction_states,quests,cards,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,level=excluded.level,xp=excluded.xp,faction=excluded.faction,
        victories=excluded.victories,zone_id=excluded.zone_id,exploration_count=excluded.exploration_count,
        last_discovery=excluded.last_discovery,arena_wins=excluded.arena_wins,
        equipped_card_id=excluded.equipped_card_id,fusion_materials=excluded.fusion_materials,
        world_threat=excluded.world_threat,world_resources=excluded.world_resources,
        world_tile=excluded.world_tile,visited_poi_ids=excluded.visited_poi_ids,
        faction_states=excluded.faction_states,quests=excluded.quests,cards=excluded.cards,
        updated_at=CURRENT_TIMESTAMP`).bind(
        id,p.name,p.level,p.xp,p.faction,p.victories,p.zone_id,p.exploration_count,
        p.last_discovery,p.arena_wins,p.equipped_card_id,p.fusion_materials,p.world_threat,
        p.world_resources,p.world_tile,p.visited_poi_ids,p.faction_states,p.quests,p.cards
      ).run();

      const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
      return json({ player: row ? fromRow(row as Record<string, unknown>) : null });
    }

    return json({ error: "not_found" }, 404);
  },
};
