import type { PlayerState } from '../game';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || 'https://freedom-arena-api.aymericlecloitrematernat.workers.dev';

const PLAYER_ID_KEY = 'freedomarena:player:id';

function getPlayerId(): string {
  const existing = window.localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

export async function loadPlayerApi(): Promise<{ player: PlayerState | null; error: Error | null }> {
  try {
    const id = getPlayerId();
    const response = await fetch(`${API_URL}/player?id=${encodeURIComponent(id)}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Player API GET failed: ${response.status}`);
    const body = await response.json() as { player?: PlayerState | null };
    return { player: body.player ?? null, error: null };
  } catch (error) {
    return { player: null, error: error instanceof Error ? error : new Error('Player API unavailable') };
  }
}

export async function savePlayerApi(player: PlayerState): Promise<{ player: PlayerState | null; error: Error | null }> {
  try {
    const id = getPlayerId();
    const response = await fetch(`${API_URL}/player`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ id, player }),
    });
    if (!response.ok) throw new Error(`Player API POST failed: ${response.status}`);
    const body = await response.json() as { player?: PlayerState | null };
    return { player: body.player ?? null, error: null };
  } catch (error) {
    return { player: null, error: error instanceof Error ? error : new Error('Player API unavailable') };
  }
}
