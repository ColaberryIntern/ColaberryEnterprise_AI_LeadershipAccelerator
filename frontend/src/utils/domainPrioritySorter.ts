/**
 * domainPrioritySorter — orders the domain stack on the System BPs
 * surface so the most operationally-relevant areas surface first.
 *
 * Operational Priority Topology Sprint, 2026-05-15.
 *
 * Sort priority (highest first):
 *   1. Cory's current-priority domain
 *   2. Operator's focus domain (memory.lastBpDomain), if different
 *   3. Leverage score (downstreamCount × maturityHeadroom) descending
 *   4. Canonical orderIndex (stable tiebreaker)
 *
 * Pure function. Deterministic given the same inputs — same state
 * always produces the same order, so navigation isn't randomly shifty
 * between renders within a visit.
 */
import { lifecycleMaturityIndex, MAX_MATURITY_INDEX, type DomainBucket, type DomainKey } from './bpDomainClassifier';

export interface SortOptions {
  coryPriorityDomain?: DomainKey | null;
  focusDomain?: DomainKey | null;
}

export function sortByOperationalPriority(
  buckets: DomainBucket[],
  opts: SortOptions = {},
): DomainBucket[] {
  const { coryPriorityDomain, focusDomain } = opts;

  const score = (b: DomainBucket): { tier: number; lev: number; orderIndex: number } => {
    let tier = 3;
    if (coryPriorityDomain && b.key === coryPriorityDomain) tier = 0;
    else if (focusDomain && b.key === focusDomain) tier = 1;
    const headroom = MAX_MATURITY_INDEX - lifecycleMaturityIndex(b.lifecycleState);
    const lev = b.downstreamCount * headroom;
    return { tier, lev, orderIndex: b.orderIndex };
  };

  return [...buckets].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa.tier !== sb.tier) return sa.tier - sb.tier;       // lower tier wins
    if (sa.lev !== sb.lev) return sb.lev - sa.lev;           // higher leverage wins
    return sa.orderIndex - sb.orderIndex;                    // stable canonical tiebreak
  });
}

/**
 * Returns the set of domain keys that the given source domain influences
 * downstream (feeds + supports). Used to apply a subtle border accent on
 * dependent domain rows when the source is highlighted.
 */
export function downstreamKeysOf(
  sourceKey: DomainKey | null | undefined,
  buckets: DomainBucket[],
): Set<DomainKey> {
  const out = new Set<DomainKey>();
  if (!sourceKey) return out;
  const source = buckets.find(b => b.key === sourceKey);
  if (!source) return out;
  for (const r of source.relationships) {
    if (r.verb === 'feeds' || r.verb === 'supports') out.add(r.targetKey);
  }
  return out;
}
