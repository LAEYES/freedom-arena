export type ChunkLoadRequest = {
  key: string;
  priority: number;
};

type QueueEntry<T> = ChunkLoadRequest & {
  sequence: number;
  epoch: number;
  load: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
};

export type ChunkStreamingStats = {
  queued: number;
  active: number;
  completed: number;
  maxConcurrent: number;
};

/**
 * Bounded asynchronous chunk loader.
 * Higher priority values run first; equal priorities preserve FIFO order.
 * Duplicate keys share one promise while queued or loading.
 */
export class ChunkStreamingScheduler<T> {
  private readonly maxConcurrent: number;
  private queue: QueueEntry<T>[] = [];
  private readonly active = new Map<string, QueueEntry<T>>();
  private readonly pendingByKey = new Map<string, Promise<T>>();
  private sequence = 0;
  private epoch = 0;
  private completed = 0;

  constructor(maxConcurrent = 2) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new RangeError('maxConcurrent must be a positive integer');
    }
    this.maxConcurrent = maxConcurrent;
  }

  schedule(request: ChunkLoadRequest, load: () => Promise<T>): Promise<T> {
    if (!request.key.trim()) throw new RangeError('chunk key must not be empty');
    if (!Number.isFinite(request.priority)) throw new RangeError('priority must be finite');
    const existing = this.pendingByKey.get(request.key);
    if (existing) return existing;

    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    const entry: QueueEntry<T> = {
      ...request,
      sequence: this.sequence++,
      epoch: this.epoch,
      load,
      resolve,
      reject,
    };
    this.pendingByKey.set(request.key, promise);
    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
    this.drain();
    return promise;
  }

  /** Invalidates queued and in-flight work; late completions are discarded. */
  cancelAll(reason = 'Chunk loading cancelled'): void {
    this.epoch++;
    const error = new Error(reason);
    error.name = 'AbortError';
    for (const entry of this.queue) {
      this.pendingByKey.delete(entry.key);
      entry.reject(error);
    }
    this.queue = [];
    for (const entry of this.active.values()) {
      this.pendingByKey.delete(entry.key);
      entry.reject(error);
    }
    this.active.clear();
  }

  getStats(): ChunkStreamingStats {
    return {
      queued: this.queue.length,
      active: this.active.size,
      completed: this.completed,
      maxConcurrent: this.maxConcurrent,
    };
  }

  private drain(): void {
    while (this.active.size < this.maxConcurrent && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      if (entry.epoch !== this.epoch) continue;
      this.active.set(entry.key, entry);
      Promise.resolve()
        .then(entry.load)
        .then(value => {
          if (entry.epoch !== this.epoch) return;
          this.completed++;
          entry.resolve(value);
        })
        .catch(error => {
          if (entry.epoch !== this.epoch) return;
          entry.reject(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => {
          if (this.active.get(entry.key) === entry) this.active.delete(entry.key);
          if (this.pendingByKey.get(entry.key)) this.pendingByKey.delete(entry.key);
          this.drain();
        });
    }
  }
}
