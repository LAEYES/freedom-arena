-- FA-WORLD-046: immutable combat snapshots and PvP security event audit
-- FA-WORLD-046 immutable PvP combat loadout snapshots and security audit
CREATE TABLE IF NOT EXISTS pvp_match_loadouts (
  match_id TEXT NOT NULL REFERENCES pvp_matches(match_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  player_level INTEGER NOT NULL CHECK(player_level BETWEEN 1 AND 100),
  equipment_revision INTEGER NOT NULL CHECK(equipment_revision >= 0),
  loadout_json TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(match_id,player_id)
);
CREATE TRIGGER IF NOT EXISTS trg_pvp_match_loadouts_no_update
BEFORE UPDATE ON pvp_match_loadouts BEGIN SELECT RAISE(ABORT,'pvp_loadout_snapshot_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_pvp_match_loadouts_no_delete
BEFORE DELETE ON pvp_match_loadouts BEGIN SELECT RAISE(ABORT,'pvp_loadout_snapshot_immutable'); END;

CREATE TABLE IF NOT EXISTS pvp_security_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  match_id TEXT REFERENCES pvp_matches(match_id),
  event_type TEXT NOT NULL CHECK(event_type IN ('command_id_reuse','out_of_turn_action')),
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pvp_security_events_player ON pvp_security_events(player_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_security_events_match ON pvp_security_events(match_id,created_at DESC);

