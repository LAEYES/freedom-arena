import { describe, expect, it } from 'vitest';
import { ChunkStreamingScheduler } from './chunkStreaming';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe('progressive chunk streaming scheduler', () => {
  it('enforces the configured concurrency limit', async () => {
    const scheduler = new ChunkStreamingScheduler<number>(2);
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
    const first = scheduler.schedule({ key: 'a', priority: 1 }, () => gates[0].promise);
    const second = scheduler.schedule({ key: 'b', priority: 1 }, () => gates[1].promise);
    const third = scheduler.schedule({ key: 'c', priority: 1 }, () => gates[2].promise);
    await Promise.resolve();
    expect(scheduler.getStats()).toMatchObject({ active: 2, queued: 1 });
    gates[0].resolve(10);
    await expect(first).resolves.toBe(10);
    await Promise.resolve();
    expect(scheduler.getStats()).toMatchObject({ active: 2, queued: 0 });
    gates[1].resolve(20);
    gates[2].resolve(30);
    await expect(Promise.all([second, third])).resolves.toEqual([20, 30]);
  });

  it('loads higher priority requests first and preserves FIFO ties', async () => {
    const scheduler = new ChunkStreamingScheduler<string>(1);
    const gate = deferred<string>();
    const order: string[] = [];
    const first = scheduler.schedule({ key: 'first', priority: 0 }, () => {
      order.push('first'); return gate.promise;
    });
    const low = scheduler.schedule({ key: 'low', priority: 1 }, async () => {
      order.push('low'); return 'low';
    });
    const high = scheduler.schedule({ key: 'high', priority: 5 }, async () => {
      order.push('high'); return 'high';
    });
    const tied = scheduler.schedule({ key: 'tied', priority: 5 }, async () => {
      order.push('tied'); return 'tied';
    });
    gate.resolve('first');
    await Promise.all([first, low, high, tied]);
    expect(order).toEqual(['first', 'high', 'tied', 'low']);
  });

  it('deduplicates requests for the same queued or active key', async () => {
    const scheduler = new ChunkStreamingScheduler<number>(1);
    const gate = deferred<number>();
    let calls = 0;
    const load = () => { calls++; return gate.promise; };
    const a = scheduler.schedule({ key: 'same', priority: 1 }, load);
    const b = scheduler.schedule({ key: 'same', priority: 99 }, load);
    expect(a).toBe(b);
    gate.resolve(42);
    await expect(Promise.all([a, b])).resolves.toEqual([42, 42]);
    expect(calls).toBe(1);
  });

  it('rejects invalid input', () => {
    expect(() => new ChunkStreamingScheduler(0)).toThrow(RangeError);
    const scheduler = new ChunkStreamingScheduler();
    expect(() => scheduler.schedule({ key: ' ', priority: 0 }, async () => 1)).toThrow(RangeError);
    expect(() => scheduler.schedule({ key: 'x', priority: Infinity }, async () => 1)).toThrow(RangeError);
  });

  it('invalidates active work and ignores its late result', async () => {
    const scheduler = new ChunkStreamingScheduler<number>(1);
    const gate = deferred<number>();
    const stale = scheduler.schedule({ key: 'old', priority: 1 }, () => gate.promise);
    const rejected = expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    scheduler.cancelAll();
    await rejected;
    const fresh = scheduler.schedule({ key: 'new', priority: 1 }, async () => 7);
    gate.resolve(99);
    await expect(fresh).resolves.toBe(7);
    expect(scheduler.getStats().completed).toBe(1);
  });
});
