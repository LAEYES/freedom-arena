export type FrameTimeSummary = {
  samples: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  fps: number;
};

/** Bounded rolling frame-time monitor. Input is the RAF delta in milliseconds. */
export class FrameTimeMonitor {
  private readonly capacity: number;
  private readonly values: number[] = [];

  constructor(capacity = 120) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.capacity = capacity;
  }

  add(frameTimeMs: number): void {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) {
      throw new RangeError('frameTimeMs must be finite and greater than zero');
    }
    this.values.push(frameTimeMs);
    if (this.values.length > this.capacity) this.values.shift();
  }

  reset(): void {
    this.values.length = 0;
  }

  summary(): FrameTimeSummary {
    if (this.values.length === 0) {
      return { samples: 0, meanMs: 0, medianMs: 0, p95Ms: 0, p99Ms: 0, fps: 0 };
    }
    const sorted = [...this.values].sort((a, b) => a - b);
    const meanMs = this.values.reduce((sum, value) => sum + value, 0) / this.values.length;
    const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
    return {
      samples: sorted.length,
      meanMs,
      medianMs: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      fps: meanMs > 0 ? 1000 / meanMs : 0,
    };
  }
}
