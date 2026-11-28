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

CREATE TABLE IF NOT EXISTS world_player_presence (
  player_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  tile_x INTEGER NOT NULL CHECK (tile_x >= 0 AND tile_x < 64),
  tile_y INTEGER NOT NULL CHECK (tile_y >= 0 AND tile_y < 64),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_world_presence_zone_updated
  ON world_player_presence(zone_id, updated_at);

CREATE TABLE IF NOT EXISTS world_zone_state (
  zone_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS world_event_log (
  event_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_world_events_zone_created
  ON world_event_log(zone_id, created_at);
