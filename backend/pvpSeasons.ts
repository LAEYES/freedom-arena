export function normalizeLeaderboardLimit(value: unknown, fallback = 20): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export function compareSeasonRanks(
  a: { rating: number; matchesPlayed: number; playerId: string },
  b: { rating: number; matchesPlayed: number; playerId: string },
): number {
  return b.rating - a.rating || b.matchesPlayed - a.matchesPlayed || a.playerId.localeCompare(b.playerId);
}

export function isSeasonWindowValid(startsAt: string, endsAt: string | null, now = Date.now()): boolean {
  const start = Date.parse(startsAt);
  const end = endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(endsAt);
  return Number.isFinite(start) && (endsAt === null || Number.isFinite(end)) && start <= now && now < end;
}
