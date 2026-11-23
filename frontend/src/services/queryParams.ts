/**
 * A query string from a sparse bag, skipping what was never set.
 *
 * ─── WHY IT MOVED OUT OF `growthJourneyInspectApi` (2026-11-22) ─────────────
 *
 * It was declared and exported there, and three sibling clients imported it
 * from there. That coupling is invisible until a test mocks the module: the
 * Growth Journey page suite mocks `growthJourneyInspectApi` wholesale, so
 * `params` became `undefined` and EVERY cell in that suite failed with
 * "params is not a function" - including the switched-off state, which has
 * nothing to do with any of these clients.
 *
 * A utility that lives inside one client makes every consumer of that utility a
 * hostage to how that client is mocked. So it lives here, imports nothing, and
 * `growthJourneyInspectApi` re-exports it so no existing importer changes.
 *
 * ─── WHY `''` AND `undefined` ARE SKIPPED AND `false` IS NOT ────────────────
 *
 * An untouched filter must be ABSENT rather than sent empty, because several of
 * these endpoints answer a malformed value with a 400 rather than an empty list
 * - so `status=` is a visible error, not a no-op.
 *
 * `false` is a VALUE and is sent. `explorerGrowthSchema` makes the same point in
 * its own words: a dropped `false` makes the filter silently invert itself,
 * which is a wrong answer that looks entirely correct.
 */
export function params<T extends object>(q: T): string {
  const sp = new URLSearchParams();
  // Generic over the object rather than typed `Record<string, …>`: TypeScript gives
  // a type ALIAS an implicit index signature but not an INTERFACE, so every query
  // interface in these clients was rejected by a `Record` parameter. Widening here
  // keeps the call-site types precise, which is where the precision is worth
  // having - the alternative was a type alias per query and a looser contract.
  (Object.entries(q) as [string, string | number | boolean | undefined][]).forEach(([k, v]) => {
    if (v === undefined || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}
