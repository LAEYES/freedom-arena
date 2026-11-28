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
  -- A player may have historical rows in many matches; active exclusivity is enforced separately.
);
