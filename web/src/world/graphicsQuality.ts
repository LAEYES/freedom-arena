export type GraphicsQuality = 'performance' | 'balanced' | 'quality';

/** GPU render-target scale with conservative frame-time safeguards. */
export function adaptiveRenderScale(quality: GraphicsQuality, p95FrameMs: number): number {
  if (!Number.isFinite(p95FrameMs) || p95FrameMs < 0) throw new RangeError('p95FrameMs must be finite and non-negative');
  const cap = quality === 'performance' ? 1 : quality === 'quality' ? 1.75 : 1.35;
  if (p95FrameMs >= 28) return Math.min(cap, 0.75);
  if (p95FrameMs >= 20) return Math.min(cap, 0.9);
  return cap;
}

/** Reduce distant geometry detail under sustained frame-time pressure. */
export function adaptiveLodQuality(quality: GraphicsQuality, p95FrameMs: number): GraphicsQuality {
  if (!Number.isFinite(p95FrameMs) || p95FrameMs < 0) throw new RangeError('p95FrameMs must be finite and non-negative');
  if (p95FrameMs >= 28) return 'performance';
  if (p95FrameMs >= 20 && quality === 'quality') return 'balanced';
  return quality;
}

export function graphicsQualityLabel(quality: GraphicsQuality): string {
  return quality === 'performance' ? 'économie' : quality === 'quality' ? 'qualité' : 'équilibré';
}
