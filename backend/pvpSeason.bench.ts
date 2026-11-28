import { performance } from "node:perf_hooks";
import { compareSeasonRanks } from "./pvpSeasons.ts";

type Entry = { playerId: string; rating: number; matchesPlayed: number };
const sizes = [100, 500, 1000, 5000];
const iterations = 40;
const results: Array<{ players: number; iterations: number; p50Ms: number; p95Ms: number; p99Ms: number; opsPerSecond: number }> = [];

for (const size of sizes) {
  const entries: Entry[] = Array.from({ length: size }, (_, i) => ({
    playerId: "player-" + String(i).padStart(6, "0"),
    rating: 100 + ((i * 7919) % 3901),
    matchesPlayed: (i * 37) % 500,
  }));
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const shuffled = [...entries].reverse();
    const start = performance.now();
    shuffled.sort(compareSeasonRanks);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const percentile = (p: number) => samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)];
  const totalMs = samples.reduce((sum, value) => sum + value, 0);
  results.push({
    players: size,
    iterations,
    p50Ms: Number(percentile(0.50).toFixed(4)),
    p95Ms: Number(percentile(0.95).toFixed(4)),
    p99Ms: Number(percentile(0.99).toFixed(4)),
    opsPerSecond: Number((iterations / (totalMs / 1000)).toFixed(2)),
  });
}
process.stdout.write(JSON.stringify({
  benchmark: "synthetic-in-memory-season-leaderboard-sort",
  runtime: process.version,
  note: "Not a D1/network/Worker capacity benchmark.",
  results,
}, null, 2) + "\n");
