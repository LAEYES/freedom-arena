import test from "node:test";
import assert from "node:assert/strict";
import { compareSeasonRanks, isSeasonWindowValid, normalizeLeaderboardLimit } from "./pvpSeasons.ts";

test("leaderboard limit is bounded and integer", () => {
  assert.equal(normalizeLeaderboardLimit("12.9"),12);
  assert.equal(normalizeLeaderboardLimit(-5),1);
  assert.equal(normalizeLeaderboardLimit(500),50);
  assert.equal(normalizeLeaderboardLimit("invalid"),20);
});

test("season ranking uses rating, then activity, then stable player id", () => {
  const rows=[
    {rating:1400,matchesPlayed:8,playerId:"c"},
    {rating:1400,matchesPlayed:12,playerId:"b"},
    {rating:1400,matchesPlayed:12,playerId:"a"},
    {rating:1399,matchesPlayed:99,playerId:"z"},
  ];
  assert.deepEqual([...rows].sort(compareSeasonRanks).map(row=>row.playerId),["a","b","c","z"]);
});

test("season time window is start-inclusive and end-exclusive", () => {
  const start=Date.parse("2026-11-01T00:00:00Z");
  const end=Date.parse("2026-12-01T00:00:00Z");
  assert.equal(isSeasonWindowValid("2026-11-01T00:00:00Z","2026-12-01T00:00:00Z",start),true);
  assert.equal(isSeasonWindowValid("2026-11-01T00:00:00Z","2026-12-01T00:00:00Z",end),false);
  assert.equal(isSeasonWindowValid("bad-date",null,start),false);
});
