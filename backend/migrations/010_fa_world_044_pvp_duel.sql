-- FA-WORLD-044: authoritative PvP turn state, idempotent action ledger and rating settlement
ALTER TABLE pvp_matches ADD COLUMN turn_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pvp_matches ADD COLUMN state_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE pvp_matches ADD COLUMN turn_deadline TEXT;
ALTER TABLE pvp_matches ADD COLUMN settled_at TEXT;
ALTER TABLE pvp_matches ADD COLUMN action_count INTEGER NOT NULL DEFAULT 0;
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

-- One active match per player, while allowing unlimited historical matches.
CREATE TABLE IF NOT EXISTS pvp_active_players (
  player_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE REFERENCES pvp_matches(match_id) ON DELETE CASCADE
);
