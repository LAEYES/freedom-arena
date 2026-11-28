import { describe, expect, it } from 'vitest';
import {
  getServerTerrainTile,
  isServerBridgeTile,
  isServerTraversable,
  validateServerMove,
} from '../../../backend/worldRules';
import { detectBridgeLinks, getBridgeTileKeys } from './bridges';
import { generateTerrainMap, getTerrainTile } from './terrain';

describe('server-authoritative world rules parity', () => {
  const map = generateTerrainMap();

  it('matches the canonical client terrain for every cell in the 64x64 sector', () => {
    for (let j = 0; j < 64; j += 1) {
      for (let i = 0; i < 64; i += 1) {
        const client = getTerrainTile(map, i, j)!;
        const server = getServerTerrainTile(i, j)!;
        expect(server.kind).toBe(client.kind);
        expect(server.walkable).toBe(client.walkable);
      }
    }
  });

  it('matches all canonical one-cell bridge links', () => {
    const bridgeKeys = getBridgeTileKeys(detectBridgeLinks(map));
    for (let j = 0; j < 64; j += 1) {
      for (let i = 0; i < 64; i += 1) {
        expect(isServerBridgeTile(i, j)).toBe(bridgeKeys.has(i + ':' + j));
      }
    }
  });

  it('rejects blocked terrain and accepts only valid cardinal traversable steps', () => {
    const start = { x: 32, y: 32 };
    const walkableNeighbor = [{ x: 31, y: 32 }, { x: 33, y: 32 }, { x: 32, y: 31 }, { x: 32, y: 33 }]
      .find(point => isServerTraversable(point.x, point.y));
    expect(walkableNeighbor).toBeDefined();
    expect(validateServerMove(start, walkableNeighbor!)).toBe('ok');
    expect(validateServerMove(start, { x: 33, y: 33 })).toBe('invalid_step');
    expect(validateServerMove(start, { x: 64, y: 32 })).toBe('invalid_step');
  });

  it('rejects out-of-bounds and non-integer terrain coordinates', () => {
    expect(getServerTerrainTile(-1, 0)).toBeNull();
    expect(getServerTerrainTile(64, 0)).toBeNull();
    expect(getServerTerrainTile(1.25, 2)).toBeNull();
  });
});
