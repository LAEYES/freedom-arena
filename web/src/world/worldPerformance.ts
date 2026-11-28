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


export type AdaptiveRenderScaleOptions = {
  initial?: number;
  minimum?: number;
  maximum?: number;
  downshiftAfterMs?: number;
  upshiftAfterMs?: number;
  highGpuMs?: number;
  lowGpuMs?: number;
  downshiftStep?: number;
  upshiftStep?: number;
};

/** Conservative GPU-time-driven backing-resolution controller with hysteresis. */
export class AdaptiveRenderScale {
  private readonly minimum: number;
  private readonly maximum: number;
  private readonly downshiftAfterMs: number;
  private readonly upshiftAfterMs: number;
  private readonly highGpuMs: number;
  private readonly lowGpuMs: number;
  private readonly downshiftStep: number;
  private readonly upshiftStep: number;
  private current: number;
  private overloadedMs = 0;
  private headroomMs = 0;

  constructor(options: AdaptiveRenderScaleOptions = {}) {
    this.minimum = options.minimum ?? 0.65;
    this.maximum = options.maximum ?? 1.25;
    this.current = options.initial ?? 1;
    this.downshiftAfterMs = options.downshiftAfterMs ?? 1800;
    this.upshiftAfterMs = options.upshiftAfterMs ?? 7000;
    this.highGpuMs = options.highGpuMs ?? 18;
    this.lowGpuMs = options.lowGpuMs ?? 11.5;
    this.downshiftStep = options.downshiftStep ?? 0.10;
    this.upshiftStep = options.upshiftStep ?? 0.05;
    const values = [this.minimum, this.maximum, this.current, this.downshiftAfterMs, this.upshiftAfterMs,
      this.highGpuMs, this.lowGpuMs, this.downshiftStep, this.upshiftStep];
    if (values.some(value => !Number.isFinite(value)) || this.minimum <= 0 || this.maximum < this.minimum
      || this.current < this.minimum || this.current > this.maximum || this.downshiftAfterMs <= 0
      || this.upshiftAfterMs <= 0 || this.highGpuMs <= this.lowGpuMs || this.lowGpuMs < 0
      || this.downshiftStep <= 0 || this.upshiftStep <= 0) {
      throw new RangeError('Invalid adaptive render scale configuration');
    }
  }

  get value(): number {
    return this.current;
  }

  update(gpuP95Ms: number, elapsedMs: number): number {
    if (!Number.isFinite(gpuP95Ms) || gpuP95Ms < 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new RangeError('GPU time and elapsed time must be finite and non-negative');
    }
    if (elapsedMs === 0 || gpuP95Ms === 0) return this.current;
    if (gpuP95Ms >= this.highGpuMs) {
      this.overloadedMs += elapsedMs;
      this.headroomMs = 0;
      if (this.overloadedMs >= this.downshiftAfterMs) {
        this.current = Math.max(this.minimum, Math.round((this.current - this.downshiftStep) * 100) / 100);
        this.overloadedMs = 0;
      }
    } else if (gpuP95Ms <= this.lowGpuMs) {
      this.headroomMs += elapsedMs;
      this.overloadedMs = 0;
      if (this.headroomMs >= this.upshiftAfterMs) {
        this.current = Math.min(this.maximum, Math.round((this.current + this.upshiftStep) * 100) / 100);
        this.headroomMs = 0;
      }
    } else {
      this.overloadedMs = 0;
      this.headroomMs = 0;
    }
    return this.current;
  }

  reset(): void {
    this.overloadedMs = 0;
    this.headroomMs = 0;
  }
}
