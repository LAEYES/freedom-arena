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

-- FA-WORLD-043 PvP matchmaking
-- FA-WORLD-043: authoritative PvP matchmaking records
CREATE TABLE IF NOT EXISTS pvp_queue (
  player_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000 CHECK(rating BETWEEN 100 AND 4000),
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','matched','cancelled')),
  match_id TEXT,
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pvp_queue_search ON pvp_queue(status, zone_id, rating, queued_at);
CREATE TABLE IF NOT EXISTS pvp_matches (
  match_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  player_a TEXT NOT NULL,
  player_b TEXT NOT NULL,
  rating_a INTEGER NOT NULL,
  rating_b INTEGER NOT NULL,
  level_a INTEGER NOT NULL,
  level_b INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','active','completed','cancelled')),
  winner_id TEXT,
  turn_number INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL DEFAULT '{}',
  turn_deadline TEXT,
  settled_at TEXT,
  action_count INTEGER NOT NULL DEFAULT 0,
  outcome_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(player_a <> player_b)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_active_player_a ON pvp_matches(player_a) WHERE status IN ('ready','active');
CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_active_player_b ON pvp_matches(player_b) WHERE status IN ('ready','active');
CREATE INDEX IF NOT EXISTS idx_pvp_match_players ON pvp_matches(player_a, player_b, status);

CREATE TABLE IF NOT EXISTS pvp_match_participants (
  match_id TEXT NOT NULL REFERENCES pvp_matches(match_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  PRIMARY KEY(match_id, player_id)
);

-- FA-WORLD-044 authoritative PvP duel state
CREATE TABLE IF NOT EXISTS pvp_turns (
  command_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES pvp_matches(match_id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('strike','guard','skill')),
  damage INTEGER NOT NULL DEFAULT 0 CHECK(damage BETWEEN 0 AND 250),
  target_hp INTEGER NOT NULL CHECK(target_hp BETWEEN 0 AND 2000),
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id,turn_number)
);
CREATE INDEX IF NOT EXISTS idx_pvp_turns_match ON pvp_turns(match_id,turn_number);
CREATE TABLE IF NOT EXISTS pvp_rating_log (
  match_id TEXT PRIMARY KEY REFERENCES pvp_matches(match_id),
  player_a TEXT NOT NULL,
  player_b TEXT NOT NULL,
  before_a INTEGER NOT NULL,
  before_b INTEGER NOT NULL,
  after_a INTEGER NOT NULL,
  after_b INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pvp_active_players (
  player_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE REFERENCES pvp_matches(match_id) ON DELETE CASCADE
);
