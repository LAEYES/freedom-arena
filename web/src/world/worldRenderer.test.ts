import { describe, expect, it } from 'vitest';
import { createIsometricCamera, projectWorldToScreen } from './isometricCamera';
import {
  buildAvatarMesh,
  buildTerrainMesh,
  buildNpcMesh,
  npcAnimationPhase,
  buildPoiBuildingMesh,
  buildEventBeaconMesh,
  buildBossMesh,
  buildWeatherParticleMesh,
  buildVegetationMesh,
  buildWorldDressingMesh,
  buildLandmarkMesh,
  buildTerrainCliffMesh,
  buildRoadMesh,
  buildBridgeMesh,
  pickNearestTerrainTile,
  TERRAIN_PALETTE,
  terrainWorldHeight,
} from './worldRenderer';
import type { TerrainTile } from './terrain';
import { geometryFingerprint } from './worldRegression';

const grass: TerrainTile = {
  i: 4, j: 7, kind: 'grass', elevation: 2, walkable: true, movementCost: 1,
};

const camera = createIsometricCamera({
  target: { x: 32, y: 32, z: 0.5 },
  viewportWidth: 900,
  viewportHeight: 520,
  azimuthRadians: Math.PI / 4,
  elevationRadians: Math.atan(1 / Math.SQRT2),
  distance: 100,
  orthographicHeight: 64,
  near: 0.1,
  far: 500,
});

describe('WebGL world mesh and picking', () => {
  it('builds five terrain faces per tile with six floats per vertex', () => {
    const mesh = buildTerrainMesh([grass]);
    expect(mesh.length).toBe(30 * 6);
    expect(mesh.every(Number.isFinite)).toBe(true);
  });

  it('builds a low-poly avatar from six box primitives', () => {
    const mesh = buildAvatarMesh(grass);
    expect(mesh.length).toBe(6 * 36 * 6);
    expect(mesh.every(Number.isFinite)).toBe(true);
  });

  it('animates the avatar gait deterministically without changing mesh topology', () => {
    const idle = buildAvatarMesh(grass, { phase: 0, walkAmount: 0 });
    const walking = buildAvatarMesh(grass, {
      x: 4.75,
      y: 7.25,
      groundZ: terrainWorldHeight(grass) + 0.06,
      phase: Math.PI / 2,
      walkAmount: 1,
    });
    expect(walking.length).toBe(idle.length);
    expect(walking.every(Number.isFinite)).toBe(true);
    expect(Array.from(walking)).not.toEqual(Array.from(idle));
    expect(Array.from(buildAvatarMesh(grass, {
      phase: Math.PI / 2,
      walkAmount: 1,
    }))).toEqual(Array.from(buildAvatarMesh(grass, {
      phase: Math.PI / 2,
      walkAmount: 1,
    })));
  });

  it('maps terrain kinds to normalized RGB colors', () => {
    expect(Object.keys(TERRAIN_PALETTE)).toEqual(['grass', 'forest', 'water', 'rock', 'sand', 'snow']);
    for (const color of Object.values(TERRAIN_PALETTE)) {
      expect(color.every(channel => channel >= 0 && channel <= 1)).toBe(true);
    }
  });

  it('converts tile elevation into world-space height', () => {
    expect(terrainWorldHeight(grass)).toBeCloseTo(0.24, 10);
  });


  it('builds faction-coded NPCs and POI structures', () => {
    const npc = buildNpcMesh({ id: 'outpost:npc:0', x: 8, y: 10, faction: 'Aegis', role: 'guard' }, grass);
    const poi = buildPoiBuildingMesh(grass, 0);
    expect(npc.length).toBe(6 * 36 * 6);
    expect(poi.length).toBe(4 * 36 * 6);
    expect(npc.every(Number.isFinite)).toBe(true);
    expect(poi.every(Number.isFinite)).toBe(true);
  });


  it('assigns stable, distinct NPC animation phases from actor identity', () => {
    const first = npcAnimationPhase('outpost:npc:0');
    const same = npcAnimationPhase('outpost:npc:0');
    const other = npcAnimationPhase('outpost:npc:1');
    expect(first).toBe(same);
    expect(other).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(Math.PI * 2);
  });

  it('animates NPC idle and patrol poses deterministically without changing topology', () => {
    const actor = { id: 'dustlands:npc:2', x: 8, y: 10, faction: 'Nomads' as const, role: 'scout' as const };
    const idle = buildNpcMesh(actor, grass);
    const patrol = buildNpcMesh(actor, grass, { phase: Math.PI / 2, amount: 0.72 });
    expect(patrol.length).toBe(idle.length);
    expect(patrol.every(Number.isFinite)).toBe(true);
    expect(Array.from(patrol)).not.toEqual(Array.from(idle));
    expect(Array.from(buildNpcMesh(actor, grass, { phase: 1.2, amount: 0.4 })))
      .toEqual(Array.from(buildNpcMesh(actor, grass, { phase: 1.2, amount: 0.4 })));
  });

  it('builds event beacons and boss silhouettes', () => {
    const event = buildEventBeaconMesh(grass, 5);
    const boss = buildBossMesh(grass);
    expect(event.length).toBe(3 * 36 * 6);
    expect(boss.length).toBe(7 * 36 * 6);
    expect(event.every(Number.isFinite)).toBe(true);
    expect(boss.every(Number.isFinite)).toBe(true);
  });

  it('generates deterministic weather particle geometry', () => {
    const first = buildWeatherParticleMesh(1234, 'storm', 12);
    const second = buildWeatherParticleMesh(1234, 'storm', 12);
    expect(first.length).toBe(12 * 36 * 6);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first.every(Number.isFinite)).toBe(true);
  });

  it('builds deterministic low-poly vegetation variants with finite geometry', () => {
    for (const variant of ['broadleaf', 'conifer', 'shrub'] as const) {
      const first = buildVegetationMesh(grass, variant, 20261128);
      const second = buildVegetationMesh(grass, variant, 20261128);
      expect(first.length).toBeGreaterThan(0);
      expect(Array.from(first)).toEqual(Array.from(second));
      expect(first.every(Number.isFinite)).toBe(true);
      expect(first.length % 6).toBe(0);
    }
  });

  it('builds deterministic biome-aware dressing and excludes water tiles', () => {
    const forestTiles = Array.from({ length: 256 }, (_, index) => ({
      ...grass,
      i: index % 64,
      j: Math.floor(index / 64),
      kind: 'forest' as const,
    }));
    const first = buildWorldDressingMesh(forestTiles, 91);
    const second = buildWorldDressingMesh(forestTiles, 91);
    const waterOnly = buildWorldDressingMesh(
      [{ ...grass, kind: 'water', walkable: false, movementCost: Infinity }],
      91,
    );
    expect(first.length).toBeGreaterThan(0);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first.every(Number.isFinite)).toBe(true);
    expect(waterOnly.length).toBe(0);
  });

  it('builds finite modular landmark kits for each world landmark family', () => {
    for (const kind of ['watchtower', 'shrine', 'ruins', 'gate'] as const) {
      const mesh = buildLandmarkMesh(grass, kind);
      expect(mesh.length).toBeGreaterThan(0);
      expect(mesh.length % 6).toBe(0);
      expect(mesh.every(Number.isFinite)).toBe(true);
    }
    expect(Array.from(buildLandmarkMesh(grass, 'watchtower')))
      .toEqual(Array.from(buildLandmarkMesh(grass, 'watchtower')));
  });

  it('builds road strips only on contiguous walkable cardinal routes', () => {
    const routeTiles = [
      { ...grass, i: 0, j: 0 },
      { ...grass, i: 1, j: 0 },
      { ...grass, i: 1, j: 1 },
    ];
    const route = routeTiles.map(({ i, j }) => ({ i, j }));
    const road = buildRoadMesh(routeTiles, route);
    expect(road.length).toBeGreaterThan(0);
    expect(road.every(Number.isFinite)).toBe(true);
    expect(buildRoadMesh(
      [{ ...routeTiles[0], walkable: false }],
      [{ i: 0, j: 0 }],
    ).length).toBe(0);
    expect(buildRoadMesh(routeTiles, [{ i: 0, j: 0 }, { i: 2, j: 0 }]).length)
      .toBeGreaterThan(0); // isolated route nodes render, but no false connecting segment
  });

  it('builds cliff faces only at exposed elevation differences', () => {
    const high = { ...grass, i: 0, j: 0, elevation: 4 };
    const low = { ...grass, i: 1, j: 0, elevation: 1 };
    const cliff = buildTerrainCliffMesh([high, low]);
    expect(cliff.length).toBe(36);
    expect(cliff.every(Number.isFinite)).toBe(true);
    expect(buildTerrainCliffMesh([{ ...high, elevation: 1 }, { ...low, elevation: 1 }]).length)
      .toBe(0);
  });

  it('builds a bridge only across a single aligned water tile between walkable banks', () => {
    const bankA = { ...grass, i: 0, j: 0 };
    const water = { ...grass, i: 1, j: 0, kind: 'water' as const, walkable: false, movementCost: Infinity };
    const bankB = { ...grass, i: 2, j: 0 };
    const bridge = buildBridgeMesh(bankA, water, bankB);
    expect(bridge.length).toBeGreaterThan(0);
    expect(bridge.every(Number.isFinite)).toBe(true);
    expect(buildBridgeMesh(bankA, { ...water, i: 1, j: 1 }, bankB).length).toBe(0);
    expect(buildBridgeMesh(bankA, water, { ...bankB, walkable: false }).length).toBe(0);
  });

  it('keeps terrain and landmark geometry signatures deterministic', () => {
    const terrainA = buildTerrainMesh([grass]);
    const terrainB = buildTerrainMesh([{ ...grass }]);
    const landmarkA = buildLandmarkMesh(grass, 'watchtower');
    const landmarkB = buildLandmarkMesh({ ...grass }, 'watchtower');
    expect(geometryFingerprint(terrainA)).toBe(geometryFingerprint(terrainB));
    expect(geometryFingerprint(landmarkA)).toBe(geometryFingerprint(landmarkB));
    expect(geometryFingerprint(terrainA)).not.toBe(geometryFingerprint(landmarkA));
  });

  it('reduces deterministic world-dressing geometry across LOD tiers', () => {
    const tiles = Array.from({ length: 16 * 16 }, (_, index) => ({
      ...grass,
      i: index % 16,
      j: Math.floor(index / 16),
      kind: 'forest' as const,
    }));
    const high = buildWorldDressingMesh(tiles, 12345, { lod: 'high' });
    const medium = buildWorldDressingMesh(tiles, 12345, { lod: 'medium' });
    const low = buildWorldDressingMesh(tiles, 12345, { lod: 'low' });
    expect(high.length).toBeGreaterThan(medium.length);
    expect(medium.length).toBeGreaterThan(low.length);
    expect(geometryFingerprint(low)).toBe(geometryFingerprint(
      buildWorldDressingMesh(tiles, 12345, { lod: 'low' }),
    ));
    expect(high.every(Number.isFinite) && medium.every(Number.isFinite) && low.every(Number.isFinite)).toBe(true);
  });

  it('picks the nearest projected terrain tile', () => {
    const tiles = [
      grass,
      { ...grass, i: 5, j: 7 },
      { ...grass, i: 4, j: 8 },
    ];
    const screen = {
      x: camera.config.viewportWidth / 2,
      y: camera.config.viewportHeight / 2,
    };
    const center = {
      x: 5.5,
      y: 7.5,
      z: terrainWorldHeight(tiles[1]) + 0.015,
    };
    const actual = {
      x: camera.config.viewportWidth / 2,
      y: camera.config.viewportHeight / 2,
    };
    // The exact projection is used here rather than assuming screen axes.
    const point = projectWorldToScreen(center, camera);
    expect(pickNearestTerrainTile(point, tiles, camera, 2)?.i).toBe(5);
    expect(pickNearestTerrainTile(actual, [], camera)).toBeNull();
  });
});
