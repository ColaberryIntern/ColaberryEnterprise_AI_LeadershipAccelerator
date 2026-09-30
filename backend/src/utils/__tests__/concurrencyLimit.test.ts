import { mapWithConcurrency } from '../concurrencyLimit';

function deferred<T>(value: T, delayMs: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
}

describe('mapWithConcurrency', () => {
  it('happy path: maps all items and preserves input order even when later items resolve first', async () => {
    const items = [1, 2, 3, 4, 5];
    // Item 0 is the slowest, item 4 the fastest — proves order is preserved by
    // input position, not by resolution/completion order.
    const results = await mapWithConcurrency(items, 3, (n) => deferred(n * 10, (6 - n) * 10));
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('boundary: empty array returns [] without calling fn', async () => {
    const fn = jest.fn();
    const results = await mapWithConcurrency([], 5, fn);
    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('boundary: limit >= items.length behaves like Promise.all (every item starts immediately)', async () => {
    const items = [1, 2, 3];
    const started: number[] = [];
    const results = await mapWithConcurrency(items, 100, async (n) => {
      started.push(n);
      return n * 2;
    });
    expect(results).toEqual([2, 4, 6]);
    expect(started.sort()).toEqual([1, 2, 3]);
  });

  it('boundary: limit of 1 behaves like fully sequential execution', async () => {
    const items = [1, 2, 3];
    const order: number[] = [];
    const results = await mapWithConcurrency(items, 1, async (n) => {
      order.push(n);
      await deferred(null, 5);
      return n * 2;
    });
    // With concurrency 1, item N cannot start until item N-1's fn has returned —
    // so the start order must exactly match input order.
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([2, 4, 6]);
  });

  it('respects the concurrency cap: never more than `limit` calls in flight at once', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency(items, 3, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await deferred(null, 10);
      inFlight -= 1;
      return n;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // proves it's genuinely concurrent, not accidentally sequential
  });

  it('failure path: the first rejection propagates, is never silently swallowed', async () => {
    const items = [1, 2, 3];
    await expect(
      mapWithConcurrency(items, 3, async (n) => {
        if (n === 2) throw new Error('boom on 2');
        return n;
      }),
    ).rejects.toThrow('boom on 2');
  });

  it('failure path: no NEW work starts once an error has been observed', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const executed: number[] = [];
    await expect(
      mapWithConcurrency(items, 1, async (n) => {
        executed.push(n);
        if (n === 2) throw new Error('boom on 2');
        return n;
      }),
    ).rejects.toThrow('boom on 2');
    // Sequential (limit 1): must stop at 2, never reach 3-6.
    expect(executed).toEqual([1, 2]);
  });

  it('idempotency: calling twice with the same inputs is pure and produces the same output', async () => {
    const items = [1, 2, 3];
    const fn = (n: number) => Promise.resolve(n * n);
    const first = await mapWithConcurrency(items, 2, fn);
    const second = await mapWithConcurrency(items, 2, fn);
    expect(first).toEqual(second);
    expect(first).toEqual([1, 4, 9]);
  });
});
