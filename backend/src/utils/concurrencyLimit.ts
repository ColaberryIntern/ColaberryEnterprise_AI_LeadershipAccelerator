/**
 * mapWithConcurrency — a small, dependency-free bounded-concurrency mapper.
 * Built for the Workforce OS perf fix (2026-08-18, session CC-20260818-wf9k):
 * schoolSignals.ts's gatherSignals() was doing `for (const e of enrollments) {
 * await studentSignals(e.id); }` — a fully sequential N+1 that measured 3.4s in
 * production for ~200 students. A bare `Promise.all(items.map(fn))` would remove
 * the sequential-await bottleneck but let every item's queries fire at once,
 * competing for the same Postgres connection pool (`max: 20`, see
 * config/database.ts) alongside whatever else is running concurrently on the
 * same request. This caps how many `fn` calls are in flight at once instead.
 *
 * No new npm dependency added (CLAUDE.md requires a deliberate add for new
 * dependencies; this is ~20 lines and a well-understood pattern, not worth one).
 *
 * Contract:
 *  - Output array is in the SAME ORDER as `items`, regardless of resolution order.
 *  - Fails fast: the first rejection rejects the whole call (matches Promise.all's
 *    existing semantics elsewhere in this codebase — no silent swallow, per
 *    CLAUDE.md's Failure-First Design). In-flight calls are not cancelled (this
 *    runtime has no cooperative cancellation for arbitrary async work), but no
 *    further NEW calls are started once a rejection has been observed.
 *  - Pure: no shared mutable state across calls: safe to call repeatedly/
 *    concurrently from different callers.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const boundedLimit = Math.max(1, Math.min(limit, items.length));

  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  let hasError = false;

  async function worker(): Promise<void> {
    while (!hasError) {
      const currentIndex = nextIndex;
      if (currentIndex >= items.length) return;
      nextIndex += 1;
      try {
        results[currentIndex] = await fn(items[currentIndex], currentIndex);
      } catch (err) {
        if (!hasError) {
          hasError = true;
          firstError = err;
        }
        return;
      }
    }
  }

  const workers = Array.from({ length: boundedLimit }, () => worker());
  await Promise.all(workers);

  if (hasError) throw firstError;
  return results;
}
