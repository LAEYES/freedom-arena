-- FA-WORLD-045: persistent ratings, exactly-once rating events and timeout audit
CREATE TABLE IF NOT EXISTS pvp_ratings (
  player_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 1000 CHECK(rating BETWEEN 100 AND 4000),
  matches_played INTEGER NOT NULL DEFAULT 0 CHECK(matches_played >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK(wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK(losses >= 0),
  draws INTEGER NOT NULL DEFAULT 0 CHECK(draws >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO pvp_ratings(player_id,rating)
SELECT player_id,MAX(100,MIN(4000,rating)) FROM pvp_queue;

CREATE TABLE IF NOT EXISTS pvp_rating_events (
  match_id TEXT NOT NULL REFERENCES pvp_matches(match_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  rating_after INTEGER NOT NULL CHECK(rating_after BETWEEN 100 AND 4000),
  result TEXT NOT NULL CHECK(result IN ('win','loss','draw')),
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(match_id,player_id)
);
CREATE INDEX IF NOT EXISTS idx_pvp_rating_events_pending ON pvp_rating_events(applied_at,created_at);

CREATE TABLE IF NOT EXISTS pvp_timeout_log (
  match_id TEXT PRIMARY KEY REFERENCES pvp_matches(match_id) ON DELETE CASCADE,
  timed_out_player_id TEXT NOT NULL,
  winner_id TEXT NOT NULL,
  adjudicated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
