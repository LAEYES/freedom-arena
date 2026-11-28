import { selectWorldLod, type WorldLodLevel } from './worldLod';
import type { GraphicsQuality } from './graphicsQuality';

const LEVELS: readonly WorldLodLevel[] = ['high', 'medium', 'low'];
const THRESHOLDS: Record<GraphicsQuality, readonly [number, number]> = {
  performance: [8, 20],
  balanced: [14, 30],
  quality: [20, 42],
};

/**
 * Per-chunk LOD state with a distance hysteresis band to prevent visual
 * popping when a camera or actor oscillates around a detail threshold.
 */
export class AdaptiveWorldLod {
  private readonly previous = new Map<string, WorldLodLevel>();
  private readonly hysteresis: number;
  private quality: GraphicsQuality | null = null;

  constructor(hysteresis = 0.12) {
    if (!Number.isFinite(hysteresis) || hysteresis < 0 || hysteresis >= 0.5) {
      throw new RangeError('hysteresis must be finite and in [0, 0.5)');
    }
    this.hysteresis = hysteresis;
  }

  update(key: string, distance: number, quality: GraphicsQuality = 'balanced'): WorldLodLevel {
    if (!key.trim()) throw new RangeError('chunk key must not be empty');
    if (!Number.isFinite(distance) || distance < 0) {
      throw new RangeError('distance must be finite and non-negative');
    }
    if (this.quality !== quality) {
      this.previous.clear();
      this.quality = quality;
    }

    const prior = this.previous.get(key);
    if (!prior) {
      const initial = selectWorldLod(distance, quality);
      this.previous.set(key, initial);
      return initial;
    }

    const thresholds = THRESHOLDS[quality];
    let index = LEVELS.indexOf(prior);
    while (index < 2 && distance > thresholds[index] * (1 + this.hysteresis)) index++;
    while (index > 0 && distance < thresholds[index - 1] * (1 - this.hysteresis)) index--;
    const next = LEVELS[index];
    this.previous.set(key, next);
    return next;
  }

  /** Drop state for chunks no longer resident, bounding memory over long sessions. */
  retain(keys: readonly string[]): void {
    const retained = new Set(keys);
    for (const key of this.previous.keys()) {
      if (!retained.has(key)) this.previous.delete(key);
    }
  }

  clear(): void {
    this.previous.clear();
    this.quality = null;
  }

  getTrackedCount(): number {
    return this.previous.size;
  }
}
