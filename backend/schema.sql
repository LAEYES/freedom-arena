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
  current_hp INTEGER,
  status_effects TEXT NOT NULL DEFAULT '[]',
  equipment_json TEXT NOT NULL DEFAULT '{}',
  equipment_revision INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS world_rest_log (
  command_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  hp_restored INTEGER NOT NULL,
  resources_spent INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_world_rest_player_created ON world_rest_log(player_id, created_at);

CREATE TABLE IF NOT EXISTS world_equipment_log (
  command_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK(slot IN ('weapon','armor','accessory1','accessory2')),
  card_id TEXT,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_world_equipment_player_created
  ON world_equipment_log(player_id, created_at);

CREATE TABLE IF NOT EXISTS world_inventory (
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0 AND quantity <= 999),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(player_id,item_id)
);
CREATE INDEX IF NOT EXISTS idx_world_inventory_player_quantity
  ON world_inventory(player_id,quantity);

CREATE TABLE IF NOT EXISTS world_inventory_log (
  command_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0 AND quantity <= 999),
  reason TEXT NOT NULL CHECK(reason IN ('combat_loot','admin_adjustment','crafting','trade')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_world_inventory_log_player_created
  ON world_inventory_log(player_id,created_at);
