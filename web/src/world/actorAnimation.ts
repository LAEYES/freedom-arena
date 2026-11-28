export type ActorAction = 'idle' | 'walk' | 'run' | 'attack' | 'block' | 'hit' | 'death';
export type ActorAnimationLod = 'full' | 'reduced' | 'static';
export type ActorAnimationSample = {
  action: ActorAction;
  locomotion: number;
  actionWeight: number;
  phase: number;
  armSwing: number;
  bodyLean: number;
  bob: number;
};

/** Deterministic state-to-pose mapping. It is visual-only and never mutates gameplay state. */
export function sampleActorAnimation(
  action: ActorAction,
  timeMs: number,
  seedPhase = 0,
  locomotion = 0,
): ActorAnimationSample {
  if (!Number.isFinite(timeMs) || !Number.isFinite(seedPhase) || !Number.isFinite(locomotion)) {
    throw new RangeError('animation inputs must be finite');
  }
  const move = clamp(locomotion, 0, 1);
  const phase = timeMs * (action === 'run' ? 0.018 : 0.011) + seedPhase;
  const gait = Math.sin(phase);
  const actionWeight = action === 'attack' || action === 'hit' || action === 'block' || action === 'death' ? 1 : 0;
  const armSwing = action === 'attack' ? 0.58 + Math.sin(phase * 2.4) * 0.12
    : action === 'block' ? -0.28
    : action === 'hit' ? -0.42
    : action === 'death' ? -0.7
    : gait * (action === 'run' ? 0.24 : 0.14) * move;
  const bodyLean = action === 'run' ? 0.13 : action === 'attack' ? 0.09
    : action === 'hit' ? -0.12 : action === 'death' ? -0.3 : action === 'block' ? 0.04 : move * 0.025;
  const bob = action === 'death' ? -0.12 : action === 'hit' ? 0.025
    : Math.abs(Math.sin(phase * 2)) * (action === 'run' ? 0.075 : 0.035) * move;
  return { action, locomotion: move, actionWeight, phase, armSwing, bodyLean, bob };
}

/** Hysteretic distance tiers prevent distant actors from spending near-camera animation cost. */
export function selectActorAnimationLod(distanceTiles: number): ActorAnimationLod {
  if (!Number.isFinite(distanceTiles) || distanceTiles < 0) throw new RangeError('distanceTiles must be finite and non-negative');
  if (distanceTiles <= 12) return 'full';
  if (distanceTiles <= 28) return 'reduced';
  return 'static';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
