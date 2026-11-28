-- FA-WORLD-035: authenticated subject rate-limit buckets.
-- One row per subject + endpoint + UTC minute; old buckets are pruned opportunistically.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  subject TEXT NOT NULL,
  route_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, route_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(window_start);
