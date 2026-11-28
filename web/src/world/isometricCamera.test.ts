import { describe, expect, it } from 'vitest';
import {
  createIsometricCamera,
  projectWorldToScreen,
  unprojectScreenToElevation,
} from './isometricCamera';

const makeCamera = () => createIsometricCamera({
  target: { x: 32, y: 32, z: 0 },
  viewportWidth: 1280,
  viewportHeight: 720,
  azimuthRadians: Math.PI / 4,
  elevationRadians: Math.atan(1 / Math.SQRT2),
  distance: 100,
  orthographicHeight: 48,
  near: 0.1,
  far: 1000,
});

describe('isometric 3D camera', () => {
  it('centres the camera target in the viewport', () => {
    const camera = makeCamera();
    expect(projectWorldToScreen(camera.config.target, camera)).toEqual({ x: 640, y: 360 });
  });

  it('projects elevated points above their ground-plane projection', () => {
    const camera = makeCamera();
    const ground = projectWorldToScreen({ x: 34, y: 30, z: 0 }, camera);
    const elevated = projectWorldToScreen({ x: 34, y: 30, z: 4 }, camera);
    expect(elevated.y).toBeLessThan(ground.y);
  });

  it('round-trips screen points to a known elevation plane', () => {
    const camera = makeCamera();
    const samples = [
      { x: 32, y: 32, z: 0 },
      { x: 10, y: 48, z: 0 },
      { x: 50, y: 12, z: 3.5 },
      { x: 63, y: 63, z: 8 },
    ];
    for (const world of samples) {
      const screen = projectWorldToScreen(world, camera);
      const restored = unprojectScreenToElevation(screen, world.z, camera);
      expect(restored.x).toBeCloseTo(world.x, 9);
      expect(restored.y).toBeCloseTo(world.y, 9);
      expect(restored.z).toBeCloseTo(world.z, 9);
    }
  });

  it('exposes finite OpenGL-compatible view and projection matrices', () => {
    const camera = makeCamera();
    for (const matrix of [camera.viewMatrix, camera.projectionMatrix, camera.viewProjectionMatrix]) {
      expect(matrix).toHaveLength(16);
      expect(matrix.every(Number.isFinite)).toBe(true);
    }
  });

  it('rejects invalid viewport and clipping configuration', () => {
    expect(() => createIsometricCamera({
      ...makeCamera().config,
      viewportWidth: 0,
    })).toThrow(RangeError);
    expect(() => createIsometricCamera({
      ...makeCamera().config,
      far: 0.05,
    })).toThrow(RangeError);
  });
});
