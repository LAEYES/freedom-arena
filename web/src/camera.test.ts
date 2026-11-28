import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, cameraModeIndex, clampCameraZoom, normalizeCameraRotation, projectIsometric, updateCamera } from './camera';

describe('hybrid camera math', () => {
  it('keeps zoom inside the supported range', () => {
    expect(clampCameraZoom(0.1)).toBe(0.65);
    expect(clampCameraZoom(4)).toBe(1.8);
    expect(clampCameraZoom(Number.NaN)).toBe(1);
  });

  it('normalizes rotation into one full turn', () => {
    expect(normalizeCameraRotation(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5);
    expect(normalizeCameraRotation(Math.PI * 4)).toBeCloseTo(0);
  });

  it('maps all supported camera modes to stable indices', () => {
    expect(cameraModeIndex('isometric')).toBe(0);
    expect(cameraModeIndex('free')).toBe(1);
    expect(cameraModeIndex('tactical')).toBe(2);
  });

  it('updates one camera dimension without losing the others', () => {
    const next = updateCamera({ ...DEFAULT_CAMERA }, { zoom: 1.4 });
    expect(next.mode).toBe('isometric');
    expect(next.rotation).toBe(DEFAULT_CAMERA.rotation);
    expect(next.zoom).toBe(1.4);
  });

  it('projects the origin to the origin and preserves finite coordinates', () => {
    expect(projectIsometric({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, depth: 0 });
    const projected = projectIsometric({ x: 3, y: 2, z: -4 });
    expect(Number.isFinite(projected.x)).toBe(true);
    expect(Number.isFinite(projected.y)).toBe(true);
    expect(Number.isFinite(projected.depth)).toBe(true);
  });
});
