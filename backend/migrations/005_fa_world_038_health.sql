-- FA-WORLD-038: persistent health and idempotent rest actions.
ALTER TABLE players ADD COLUMN current_hp INTEGER;
CREATE TABLE IF NOT EXISTS world_rest_log (
  command_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  hp_restored INTEGER NOT NULL,
  resources_spent INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_world_rest_player_created
  ON world_rest_log(player_id, created_at);
