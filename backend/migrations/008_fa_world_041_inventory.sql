-- FA-WORLD-041: normalized item inventory and immutable transaction ledger.
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
