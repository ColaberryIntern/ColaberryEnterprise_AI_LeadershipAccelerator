/**
 * todayFeedShuffle — pure helpers that give the Today feed a fresh lineup each
 * visit without breaking pagination.
 *
 * The feed is materialised append-only (stable positions), which is why every
 * visit shows the same thing in the same order. To reshuffle per visit we sort by
 * a per-(seed, ref) hash: a STABLE permutation that depends only on the seed and
 * the item's ref, never on the set size or its neighbours. That matters because
 * the feed grows as the student scrolls (more impressions are appended) — a
 * size-independent order means appending never reshuffles what was already served
 * (and the client also dedups by ref, so the odd re-emit is harmless).
 *
 * A light de-clump pass then pulls apart runs of the same card type so the lineup
 * reads as "strategically picked" rather than three podcasts in a row.
 *
 * Pure and dependency-free so it is fully unit-testable; the composer is the thin
 * I/O shell that calls orderForVisit().
 */

export interface Orderable {
  ref: string;   // stable per-item id (`card:<id>` | `<provider>:<mediaId>`)
  type: string;  // curriculum type slug — de-clump key
}

/** FNV-1a 32-bit hash — deterministic, fast, no deps. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Stable per-visit ordering: sort by hash(`<seed>:<ref>`), ties broken by ref so
 * the result is fully deterministic for a given (seed, set). Does not mutate input.
 */
export function seededSort<T extends Orderable>(items: T[], seed: number): T[] {
  return items
    .map((it) => ({ it, k: hash32(`${seed}:${it.ref}`) }))
    .sort((a, b) => (a.k - b.k) || (a.it.ref < b.it.ref ? -1 : a.it.ref > b.it.ref ? 1 : 0))
    .map((x) => x.it);
}

/**
 * Single forward pass: when item i shares a type with i-1, pull the next
 * differing-type item forward into slot i. Deterministic; returns a new array.
 * Best-effort — a tail that is all one type simply stays clumped.
 */
export function declump<T extends Orderable>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = 1; i < out.length; i++) {
    if (out[i].type !== out[i - 1].type) continue;
    let j = i + 1;
    while (j < out.length && out[j].type === out[i - 1].type) j++;
    if (j < out.length) {
      const [moved] = out.splice(j, 1);
      out.splice(i, 0, moved);
    }
  }
  return out;
}

/** Reorder a materialised feed for one visit: seeded shuffle + de-clump. */
export function orderForVisit<T extends Orderable>(items: T[], seed: number): T[] {
  return declump(seededSort(items, seed));
}
