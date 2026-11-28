-- FA-WORLD-047: seasonal PvP rankings and exactly-once season settlement
CREATE TABLE IF NOT EXISTS pvp_seasons (
  season_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('scheduled','active','completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_one_active_season ON pvp_seasons(status) WHERE status='active';

CREATE TABLE IF NOT EXISTS pvp_season_ratings (
  season_id TEXT NOT NULL REFERENCES pvp_seasons(season_id),
  player_id TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000 CHECK(rating BETWEEN 100 AND 4000),
  matches_played INTEGER NOT NULL DEFAULT 0 CHECK(matches_played >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK(wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK(losses >= 0),
  draws INTEGER NOT NULL DEFAULT 0 CHECK(draws >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(season_id,player_id)
);
CREATE INDEX IF NOT EXISTS idx_pvp_season_leaderboard ON pvp_season_ratings(season_id,rating DESC,matches_played DESC);

CREATE TABLE IF NOT EXISTS pvp_season_events (
  season_id TEXT NOT NULL REFERENCES pvp_seasons(season_id),
  match_id TEXT NOT NULL REFERENCES pvp_matches(match_id),
  player_id TEXT NOT NULL,
  rating_after INTEGER NOT NULL CHECK(rating_after BETWEEN 100 AND 4000),
  result TEXT NOT NULL CHECK(result IN ('win','loss','draw')),
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(season_id,match_id,player_id)
);
CREATE INDEX IF NOT EXISTS idx_pvp_season_events_pending ON pvp_season_events(applied_at,created_at);
