import type { ScreenPosition, WorldPosition } from './coordinates';

export type Vector3 = { x: number; y: number; z: number };

export type CameraProjectionMode = 'orthographic' | 'perspective';

export type IsometricCameraConfig = {
  target: WorldPosition;
  viewportWidth: number;
  viewportHeight: number;
  azimuthRadians: number;
  elevationRadians: number;
  distance: number;
  orthographicHeight: number;
  near: number;
  far: number;
  projectionMode?: CameraProjectionMode;
  fovRadians?: number;
};

export type IsometricCamera = {
  config: IsometricCameraConfig;
  eye: Vector3;
  right: Vector3;
  up: Vector3;
  forward: Vector3;
  viewMatrix: number[];
  projectionMatrix: number[];
  viewProjectionMatrix: number[];
  pixelsPerWorldUnit: number;
};

export const DEFAULT_ISOMETRIC_CAMERA: Readonly<Omit<IsometricCameraConfig, 'target' | 'viewportWidth' | 'viewportHeight'>> = Object.freeze({
  azimuthRadians: Math.PI / 4,
  elevationRadians: Math.atan(1 / Math.SQRT2),
  distance: 100,
  orthographicHeight: 48,
  near: 0.1,
  far: 1000,
});

const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const add = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v: Vector3, amount: number): Vector3 => ({ x: v.x * amount, y: v.y * amount, z: v.z * amount });
const subtract = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function normalize(v: Vector3): Vector3 {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(length) || length <= 1e-12) throw new RangeError('camera basis vector is degenerate');
  return scale(v, 1 / length);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(label + ' must be finite');
}

function multiplyMat4(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
  }
  return out;
}

export function createIsometricCamera(config: IsometricCameraConfig): IsometricCamera {
  const { target, viewportWidth, viewportHeight, azimuthRadians, elevationRadians, distance, orthographicHeight, near, far } = config;
  const projectionMode = config.projectionMode ?? 'orthographic';
  const fovRadians = config.fovRadians ?? Math.PI / 3;
  for (const [label, value] of Object.entries({
    targetX: target.x, targetY: target.y, targetZ: target.z,
    viewportWidth, viewportHeight, azimuthRadians, elevationRadians,
    distance, orthographicHeight, near, far, fovRadians,
  })) assertFinite(value, label);

  if (viewportWidth <= 0 || viewportHeight <= 0) throw new RangeError('viewport dimensions must be positive');
  if (distance <= 0 || orthographicHeight <= 0 || near <= 0 || far <= near) {
    throw new RangeError('camera distance, orthographic height and clipping planes are invalid');
  }
  if (projectionMode !== 'orthographic' && projectionMode !== 'perspective') throw new RangeError('unknown camera projection mode');
  if (fovRadians <= 0 || fovRadians >= Math.PI) throw new RangeError('fovRadians must be between 0 and PI');
  if (elevationRadians <= 0 || elevationRadians >= Math.PI / 2) {
    throw new RangeError('elevationRadians must be between 0 and PI/2');
  }

  const horizontal = Math.cos(elevationRadians);
  const backward = normalize({
    x: horizontal * Math.cos(azimuthRadians),
    y: horizontal * Math.sin(azimuthRadians),
    z: Math.sin(elevationRadians),
  });
  const forward = scale(backward, -1);
  const eye = add(target, scale(backward, distance));
  const worldUp = { x: 0, y: 0, z: 1 };
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));

  // Column-major OpenGL-compatible look-at matrix.
  const viewMatrix = [
    right.x, up.x, backward.x, 0,
    right.y, up.y, backward.y, 0,
    right.z, up.z, backward.z, 0,
    -dot(right, eye), -dot(up, eye), -dot(backward, eye), 1,
  ];

  const halfHeight = orthographicHeight / 2;
  const halfWidth = halfHeight * viewportWidth / viewportHeight;
  const projectionMatrix = projectionMode === 'perspective'
    ? (() => {
      const focal = 1 / Math.tan(fovRadians / 2);
      return [
        focal / (viewportWidth / viewportHeight), 0, 0, 0,
        0, focal, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0,
      ];
    })()
    : [
      1 / halfWidth, 0, 0, 0,
      0, 1 / halfHeight, 0, 0,
      0, 0, -2 / (far - near), 0,
      0, 0, -(far + near) / (far - near), 1,
    ];

  return {
    config,
    eye,
    right,
    up,
    forward,
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix),
    pixelsPerWorldUnit: projectionMode === 'perspective'\n      ? viewportHeight / (2 * Math.tan(fovRadians / 2) * distance)\n      : viewportHeight / orthographicHeight,
  };
}

export function projectWorldToScreen(world: WorldPosition, camera: IsometricCamera): ScreenPosition {
  assertFinite(world.x, 'world.x');
  assertFinite(world.y, 'world.y');
  assertFinite(world.z, 'world.z');
  const matrix = camera.viewProjectionMatrix;
  const clipX = matrix[0] * world.x + matrix[4] * world.y + matrix[8] * world.z + matrix[12];
  const clipY = matrix[1] * world.x + matrix[5] * world.y + matrix[9] * world.z + matrix[13];
  const clipW = matrix[3] * world.x + matrix[7] * world.y + matrix[11] * world.z + matrix[15];
  if (clipW <= 1e-12) return { x: Number.NaN, y: Number.NaN };
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return {
    x: (ndcX * 0.5 + 0.5) * camera.config.viewportWidth,
    y: (0.5 - ndcY * 0.5) * camera.config.viewportHeight,
  };
}

/** Intersect the camera ray through a screen pixel with a horizontal z plane. */
export function unprojectScreenToElevation(
  screen: ScreenPosition,
  elevation: number,
  camera: IsometricCamera,
): WorldPosition {
  assertFinite(screen.x, 'screen.x');
  assertFinite(screen.y, 'screen.y');
  assertFinite(elevation, 'elevation');
  if (Math.abs(camera.forward.z) <= 1e-12) {
    throw new RangeError('camera ray is parallel to the requested elevation plane');
  }

  let rayOrigin: Vector3;
  let rayDirection: Vector3;
  if (camera.config.projectionMode === 'perspective') {
    const ndcX = (screen.x / camera.config.viewportWidth) * 2 - 1;
    const ndcY = 1 - (screen.y / camera.config.viewportHeight) * 2;
    const fov = camera.config.fovRadians ?? Math.PI / 3;
    const tangent = Math.tan(fov / 2);
    const aspect = camera.config.viewportWidth / camera.config.viewportHeight;
    rayOrigin = camera.eye;
    rayDirection = normalize(add(
      add(camera.forward, scale(camera.right, ndcX * tangent * aspect)),
      scale(camera.up, ndcY * tangent),
    ));
  } else {
    const offsetX = (screen.x - camera.config.viewportWidth / 2) / camera.pixelsPerWorldUnit;
    const offsetY = (camera.config.viewportHeight / 2 - screen.y) / camera.pixelsPerWorldUnit;
    rayOrigin = add(add(camera.eye, scale(camera.right, offsetX)), scale(camera.up, offsetY));
    rayDirection = camera.forward;
  }
  if (Math.abs(rayDirection.z) <= 1e-12) throw new RangeError('camera ray is parallel to the requested elevation plane');
  const distance = (elevation - rayOrigin.z) / rayDirection.z;
  if (distance < 0) throw new RangeError('requested elevation plane is behind the camera');
  return add(rayOrigin, scale(rayDirection, distance));
}
