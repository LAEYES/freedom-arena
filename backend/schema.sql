CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  faction TEXT NOT NULL DEFAULT 'Aegis',
  victories INTEGER NOT NULL DEFAULT 0,
  zone_id TEXT NOT NULL DEFAULT 'outpost',
  exploration_count INTEGER NOT NULL DEFAULT 0,
  last_discovery TEXT NOT NULL DEFAULT '',
  arena_wins INTEGER NOT NULL DEFAULT 0,
  equipped_card_id TEXT,
  fusion_materials INTEGER NOT NULL DEFAULT 0,
  world_threat INTEGER NOT NULL DEFAULT 1,
  world_resources INTEGER NOT NULL DEFAULT 0,
  world_tile TEXT NOT NULL DEFAULT '{"x":0,"y":0}',
  visited_poi_ids TEXT NOT NULL DEFAULT '[]',
  faction_states TEXT NOT NULL DEFAULT '[]',
  npc_memories TEXT NOT NULL DEFAULT '[]',
  quests TEXT NOT NULL DEFAULT '[]',
  cards TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_players_updated_at ON players(updated_at);
