-- FA-WORLD-040: bounded equipment loadout and optimistic concurrency.
ALTER TABLE players ADD COLUMN equipment_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE players ADD COLUMN equipment_revision INTEGER NOT NULL DEFAULT 0;
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
