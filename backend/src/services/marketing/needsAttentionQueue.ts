/**
 * needsAttentionQueue — what an operator should look at next, and what we REFUSE to tell them.
 *
 * Pure. Takes counts already gathered and a trust oracle, returns the queue. No I/O, so the
 * one property that matters can be tested exhaustively: **a signal whose metric is not
 * `trusted` is EXCLUDED from the queue, never shown as zero.**
 *
 * WHY EXCLUSION AND NOT ZERO. "0 unmapped spend items" and "we cannot compute unmapped spend"
 * are opposite statements. The first says everything is fine. The second says we do not know.
 * A queue that renders the second as the first is worse than one that says nothing, because
 * an empty queue reads as an all-clear - and an all-clear built on a metric with no data source
 * is the exact failure the metric registry exists to prevent.
 *
 * So exclusion is also VISIBLE. The result carries an `excluded` list with the registry's own
 * reason for each, so the page can say "two signals are not shown because their data is not
 * trusted yet" rather than silently rendering a shorter list that looks complete.
 *
 * WHY THE ORACLE IS INJECTED. The registry's `mayComputeWith` is the production oracle, but a
 * test that imported it would only be able to assert the registry's current opinion. Injecting
 * it means the tests can prove the exclusion mechanism works for ANY untrusted key, including
 * ones that flip to trusted later.
 */

export type AttentionSeverity = 'action' | 'warning';

export interface AttentionItem {
  /** Stable machine key, also the registry metric it is computed from. */
  key: string;
  severity: AttentionSeverity;
  /** Plain language, as an operator would say it. Count is embedded. */
  title: string;
  count: number;
  /** Where to go to deal with it. */
  href: string;
}

export interface ExcludedSignal {
  key: string;
  /** What the queue WOULD have said, so the omission is explicable. */
  title: string;
  /** The registry's own statusReason - never invented here. */
  reason: string;
}

/**
 * Every count is `number | null`, and null means "could not be gathered" - never zero.
 *
 * Typed that way at the boundary rather than cast, because a gathering failure on a TRUSTED
 * metric must still surface as an exclusion. If these were plain numbers the service would
 * have to coerce a failed query to 0 to satisfy the type, and that coercion is precisely the
 * silent all-clear this module exists to prevent.
 */
export interface NeedsAttentionCounts {
  pendingApprovals: number | null;
  failedJobs: number | null;
  lateJobs: number | null;
  deadLetteredJobs: number | null;
  brokenLinks: number | null;
  /** No source exists for these yet; null until one does. */
  unmappedSpendItems: number | null;
  unattributedVisitorShare: number | null;
}

export interface TrustOracle {
  mayCompute(key: string): boolean;
  reasonFor(key: string): string;
}

export interface NeedsAttentionQueue {
  items: AttentionItem[];
  excluded: ExcludedSignal[];
}

/** A candidate signal: how to turn a count into an item, and which metric it depends on. */
interface Candidate {
  key: string;
  metricKey: string;
  severity: AttentionSeverity;
  href: string;
  value: (c: NeedsAttentionCounts) => number | null;
  /** Only raise when the threshold is met. A count of zero is fine and yields NO item. */
  raise: (v: number) => boolean;
  title: (v: number) => string;
  /** What the excluded entry says, so the operator knows what they are not seeing. */
  hiddenTitle: string;
}

/** Share of visitors above which "unattributed traffic" becomes a signal, not noise. */
export const UNATTRIBUTED_SHARE_THRESHOLD = 0.4;

const CANDIDATES: readonly Candidate[] = [
  {
    key: 'pending_approvals',
    metricKey: 'marketing.pending_approvals',
    severity: 'action',
    href: '/admin/marketing/content',
    value: (c) => c.pendingApprovals,
    raise: (v) => v > 0,
    title: (v) => `${v} content item${v === 1 ? '' : 's'} awaiting approval`,
    hiddenTitle: 'Content awaiting approval',
  },
  {
    key: 'failed_jobs',
    metricKey: 'marketing.failed_publishing_jobs',
    severity: 'action',
    href: '/admin/marketing/publishing',
    // Null if EITHER half is null: summing a failed count with a real one would report a
    // partial figure as if it were complete.
    value: (c) => (c.failedJobs === null || c.deadLetteredJobs === null ? null : c.failedJobs + c.deadLetteredJobs),
    raise: (v) => v > 0,
    title: (v) => `${v} publishing job${v === 1 ? '' : 's'} failed`,
    hiddenTitle: 'Failed publishing jobs',
  },
  {
    key: 'late_jobs',
    metricKey: 'marketing.failed_publishing_jobs',
    severity: 'warning',
    href: '/admin/marketing/publishing',
    value: (c) => c.lateJobs,
    raise: (v) => v > 0,
    title: (v) => `${v} scheduled post${v === 1 ? ' is' : 's are'} overdue and unpublished`,
    hiddenTitle: 'Overdue scheduled posts',
  },
  {
    key: 'broken_links',
    metricKey: 'marketing.broken_tracked_links',
    severity: 'action',
    href: '/admin/marketing',
    value: (c) => c.brokenLinks,
    raise: (v) => v > 0,
    title: (v) => `${v} active tracking link${v === 1 ? '' : 's'} point${v === 1 ? 's' : ''} at a destination that is no longer allowed`,
    hiddenTitle: 'Broken tracking links',
  },
  {
    key: 'unmapped_spend',
    metricKey: 'marketing.ad_spend',
    severity: 'warning',
    href: '/admin/marketing/ads',
    value: (c) => c.unmappedSpendItems,
    raise: (v) => v > 0,
    title: (v) => `${v} spend line${v === 1 ? '' : 's'} not mapped to a campaign`,
    hiddenTitle: 'Spend without a campaign mapping',
  },
  {
    key: 'unattributed_traffic',
    metricKey: 'growth.source_attribution',
    severity: 'warning',
    href: '/admin/marketing/attribution',
    value: (c) => c.unattributedVisitorShare,
    raise: (v) => v >= UNATTRIBUTED_SHARE_THRESHOLD,
    title: (v) => `${Math.round(v * 100)}% of visitors have no attributed source`,
    hiddenTitle: 'High unattributed traffic',
  },
];

/**
 * Build the queue.
 *
 * Three outcomes per candidate, and they must stay distinct:
 *   - metric NOT trusted       -> EXCLUDED, with the registry's reason (never an item)
 *   - trusted, below threshold -> nothing (a zero is fine; it is not attention-worthy)
 *   - trusted, at threshold    -> an item
 *
 * Collapsing the first into the second is the defect. Collapsing it into the third would
 * be an alarm about a number we do not have.
 */
export function buildNeedsAttentionQueue(
  counts: NeedsAttentionCounts,
  oracle: TrustOracle,
): NeedsAttentionQueue {
  const items: AttentionItem[] = [];
  const excluded: ExcludedSignal[] = [];
  // One exclusion per METRIC, not per candidate: two candidates sharing a metric would
  // otherwise report the same reason twice.
  const excludedMetrics = new Set<string>();

  for (const c of CANDIDATES) {
    if (!oracle.mayCompute(c.metricKey)) {
      if (!excludedMetrics.has(c.metricKey)) {
        excludedMetrics.add(c.metricKey);
        excluded.push({ key: c.key, title: c.hiddenTitle, reason: oracle.reasonFor(c.metricKey) });
      }
      continue;
    }

    const v = c.value(counts);
    // A trusted metric with a null input is a gathering failure, not a zero. Treat it as
    // excluded rather than silently skipping it, so it cannot masquerade as "nothing to do".
    if (v === null || v === undefined || Number.isNaN(v)) {
      excluded.push({ key: c.key, title: c.hiddenTitle, reason: 'The count could not be gathered for this request.' });
      continue;
    }

    if (!c.raise(v)) continue;
    items.push({ key: c.key, severity: c.severity, title: c.title(v), count: v, href: c.href });
  }

  // Actions before warnings; larger counts first within a severity.
  items.sort((a, b) =>
    a.severity === b.severity ? b.count - a.count : a.severity === 'action' ? -1 : 1,
  );

  return { items, excluded };
}
