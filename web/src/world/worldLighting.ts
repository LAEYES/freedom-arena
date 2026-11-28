export type WorldLightingProfile = {
  tint: [number, number, number];
  lightDirection: [number, number, number];
  ambient: number;
  direct: number;
  rim: number;
  fogColor: [number, number, number];
  fogAmount: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Deterministic, low-cost stylized lighting profile; no per-frame allocations in the shader path. */
export function resolveWorldLighting(cycle: string, weather: string): WorldLightingProfile {
  const timeOfDay = cycle === 'night'
    ? { tint: [0.58, 0.68, 0.94] as [number, number, number], ambient: 0.42, direct: 0.30, rim: 0.035 }
    : cycle === 'dawn'
      ? { tint: [1.0, 0.79, 0.66] as [number, number, number], ambient: 0.56, direct: 0.52, rim: 0.045 }
      : cycle === 'dusk'
        ? { tint: [0.98, 0.72, 0.62] as [number, number, number], ambient: 0.52, direct: 0.48, rim: 0.04 }
        : { tint: [1.0, 1.0, 1.0] as [number, number, number], ambient: 0.66, direct: 0.58, rim: 0.025 };

  const atmosphere = weather === 'storm'
    ? { fogColor: [0.16, 0.22, 0.34] as [number, number, number], fogAmount: 0.34, attenuation: 0.76 }
    : weather === 'frost'
      ? { fogColor: [0.58, 0.70, 0.82] as [number, number, number], fogAmount: 0.22, attenuation: 0.94 }
      : weather === 'mist'
        ? { fogColor: [0.30, 0.40, 0.52] as [number, number, number], fogAmount: 0.20, attenuation: 0.90 }
        : { fogColor: [0.30, 0.40, 0.52] as [number, number, number], fogAmount: 0.04, attenuation: 1.0 };

  return {
    tint: timeOfDay.tint,
    lightDirection: [-0.42, -0.34, 0.84],
    ambient: clamp01(timeOfDay.ambient * atmosphere.attenuation),
    direct: clamp01(timeOfDay.direct * atmosphere.attenuation),
    rim: timeOfDay.rim,
    fogColor: atmosphere.fogColor,
    fogAmount: clamp01(atmosphere.fogAmount),
  };
}
