import type { PlayerState } from '../game';

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const localIdKey = 'freedom-arena-player-id';

function playerId() {
  const existing = localStorage.getItem(localIdKey);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(localIdKey, id);
  return id;
}

export const isBackendConfigured = Boolean(apiUrl);

export async function syncPlayerRemote(player: PlayerState) {
  if (!apiUrl) return { player: null, error: null };
  try {
    const response = await fetch(apiUrl + '/player', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: playerId(), player }),
    });
    if (!response.ok) throw new Error('Backend HTTP ' + response.status);
    const data = await response.json() as { player?: PlayerState };
    return { player: data.player ?? null, error: null };
  } catch (error) {
    return { player: null, error: error instanceof Error ? error : new Error('Backend unavailable') };
  }
}

export async function loadOrCreatePlayerRemote(localPlayer: PlayerState) {
  if (!apiUrl) return { player: null, error: null };
  try {
    const id = playerId();
    const response = await fetch(apiUrl + '/player?id=' + encodeURIComponent(id));
    if (!response.ok) throw new Error('Backend HTTP ' + response.status);
    const data = await response.json() as { player?: PlayerState | null };
    if (data.player) return { player: data.player, error: null };
    return await syncPlayerRemote(localPlayer);
  } catch (error) {
    return { player: null, error: error instanceof Error ? error : new Error('Backend unavailable') };
  }
}
