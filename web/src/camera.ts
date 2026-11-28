export type CameraMode = 'isometric' | 'free' | 'tactical';

export type CameraState = {
  mode: CameraMode;
  rotation: number;
  zoom: number;
};

export const DEFAULT_CAMERA: Readonly<CameraState> = {
  mode: 'isometric',
  rotation: Math.PI / 4,
  zoom: 1,
};

export function clampCameraZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(1.8, Math.max(0.65, zoom));
}

export function normalizeCameraRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  const fullTurn = Math.PI * 2;
  return ((rotation % fullTurn) + fullTurn) % fullTurn;
}

export function cameraModeIndex(mode: CameraMode): number {
  switch (mode) {
    case 'isometric': return 0;
    case 'free': return 1;
    case 'tactical': return 2;
  }
}

export function updateCamera(state: CameraState, patch: Partial<CameraState>): CameraState {
  return {
    mode: patch.mode ?? state.mode,
    rotation: normalizeCameraRotation(patch.rotation ?? state.rotation),
    zoom: clampCameraZoom(patch.zoom ?? state.zoom),
  };
}

/** Projects a world-space point onto an orthographic isometric screen plane. */
export function projectIsometric(
  point: { x: number; y: number; z: number },
  rotation = Math.PI / 4,
  elevation = Math.atan(1 / Math.SQRT2),
): { x: number; y: number; depth: number } {
  const angle = normalizeCameraRotation(rotation);
  const cosR = Math.cos(angle);
  const sinR = Math.sin(angle);
  const rotatedX = point.x * cosR - point.z * sinR;
  const rotatedZ = point.x * sinR + point.z * cosR;
  const cosE = Math.cos(elevation);
  const sinE = Math.sin(elevation);
  return {
    x: rotatedX,
    y: point.y * cosE - rotatedZ * sinE,
    depth: point.y * sinE + rotatedZ * cosE,
  };
}
