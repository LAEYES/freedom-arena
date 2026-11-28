import type { GraphicsQuality } from './graphicsQuality';

/** Maximum number of actor ground shadows submitted per frame. */
export function getShadowBudget(quality: GraphicsQuality, p95FrameMs: number): number {
  if (!Number.isFinite(p95FrameMs) || p95FrameMs < 0) throw new RangeError('p95FrameMs must be finite and non-negative');
  if (p95FrameMs >= 28 || quality === 'performance') return 8;
  if (p95FrameMs >= 20 || quality === 'balanced') return 20;
  return 48;
}

/** Bounded visual particle capacity for future event-driven combat VFX. */
export function getCombatParticleBudget(quality: GraphicsQuality, p95FrameMs: number): number {
  if (!Number.isFinite(p95FrameMs) || p95FrameMs < 0) throw new RangeError('p95FrameMs must be finite and non-negative');
  if (p95FrameMs >= 28 || quality === 'performance') return 24;
  if (p95FrameMs >= 20 || quality === 'balanced') return 64;
  return 128;
}
