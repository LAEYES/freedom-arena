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
