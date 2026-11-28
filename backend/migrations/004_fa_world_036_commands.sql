-- FA-WORLD-036: idempotent server-issued game commands.
CREATE TABLE IF NOT EXISTS world_command_log (
  command_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('combat')),
  outcome_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_world_command_player_created
  ON world_command_log(player_id, created_at);
