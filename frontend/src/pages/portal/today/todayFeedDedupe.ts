/**
 * todayFeedDedupe — CAPE Phase 5 (design doc §10, §16 Phase 5) defense-in-
 * depth filter so a ref already shown in the finite Today Plan never ALSO
 * appears in the infinite "Explore more" feed's rendered rows. Pure, no
 * React, no I/O — per frontend/CLAUDE.md's `utils/` convention.
 *
 * This is defense-in-depth, not the primary fix — the primary fix is gating
 * TodayFeedV2's MOUNT itself on `excludeRefs` being known (see
 * TodayShell.tsx's `planRefs` state + effect), so TodayFeedV2's initial fetch
 * never even fires with a stale/empty exclude set. This filter additionally
 * covers a later `loadMore` page that might coincidentally reintroduce a
 * plan ref through composer reordering.
 */
export function filterExcluded<T extends { ref: string }>(items: T[], excludeRefs?: Set<string>): T[] {
  if (!excludeRefs || excludeRefs.size === 0) return items;
  return items.filter((item) => !excludeRefs.has(item.ref));
}
