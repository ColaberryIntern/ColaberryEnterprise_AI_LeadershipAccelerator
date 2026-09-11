import { Op } from 'sequelize';
import { ContentApprovalRequest, PublishingJob, TrackedLink } from '../../models';
import { getMetric, mayComputeWith } from '../adminOs/metricRegistry';
import { getLinkableHostnames } from '../journeyLinkRewriter';
import { validateDestination } from './trackedLinkDestination';
import {
  buildNeedsAttentionQueue,
  type NeedsAttentionCounts,
  type NeedsAttentionQueue,
  type TrustOracle,
} from './needsAttentionQueue';

/**
 * needsAttentionService — gathers the counts, then defers every judgement to the pure builder.
 *
 * This file does I/O and nothing else. It knows how to COUNT things; it does not decide whether
 * a count is worth raising or whether the metric behind it can be trusted. Those decisions live
 * in `needsAttentionQueue.ts`, where they are tested without a database, against an injected
 * oracle. Keeping them apart is what lets the honesty property - untrusted means excluded,
 * never zero - be proven rather than hoped.
 *
 * The production oracle IS the metric registry. This is the second real consumer of
 * `mayComputeWith()` and the first that uses it to make a DECISION rather than to build a list
 * of caveats: an untrusted metric here changes what the operator is told to do next.
 */

/** A scheduled job this far past its publish time and still unpublished counts as overdue. */
const LATE_GRACE_MS = 15 * 60 * 1000;

export interface NeedsAttentionScope {
  tenantIds: string[] | null; // null = unscoped (migration ramp or superadmin)
  brandId?: string | null;
}

const REGISTRY_ORACLE: TrustOracle = {
  mayCompute: (key) => mayComputeWith(key),
  reasonFor: (key) => getMetric(key)?.statusReason ?? 'Not registered in the metric registry.',
};

function scopeWhere(scope: NeedsAttentionScope): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (scope.tenantIds) where.tenant_id = scope.tenantIds;
  if (scope.brandId) where.brand_id = scope.brandId;
  return where;
}

/**
 * Count each signal independently, and let each fail independently.
 *
 * A single failed query must not blank the whole queue: a broken publishing-jobs count should
 * exclude the jobs signal with a "could not be gathered" reason and leave the approvals signal
 * intact. So each count is wrapped, and a failure yields `null` - which the builder treats as
 * an exclusion, never as zero.
 */
async function countOrNull(label: string, fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch (err: any) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'marketing',
        event: 'needs_attention_count_failed',
        outcome: 'partial',
        error_class: err?.name ?? 'Error',
        context: { signal: label, message: String(err?.message ?? err).slice(0, 200) },
      }),
    );
    return null;
  }
}

/**
 * Broken links: active links whose stored destination would be REFUSED by the redirect today.
 *
 * Re-validated against the current allowlist rather than trusting the status column, because
 * "active" describes the link's lifecycle, not whether its destination is still permitted. A
 * domain removed from the allowlist after the link was created leaves the row active and the
 * redirect returning 410 - which is exactly the case an operator needs to hear about.
 */
async function countBrokenLinks(scope: NeedsAttentionScope): Promise<number> {
  const allowed = await getLinkableHostnames();
  const links = await TrackedLink.findAll({
    where: { ...scopeWhere(scope), status: 'active' },
    attributes: ['id', 'destination_url'],
  });
  let broken = 0;
  for (const link of links) {
    if (!validateDestination(link.destination_url, allowed).ok) broken += 1;
  }
  return broken;
}

export async function gatherNeedsAttentionCounts(scope: NeedsAttentionScope): Promise<NeedsAttentionCounts> {
  const where = scopeWhere(scope);
  const lateCutoff = new Date(Date.now() - LATE_GRACE_MS);

  const [pendingApprovals, failedJobs, deadLetteredJobs, lateJobs, brokenLinks] = await Promise.all([
    countOrNull('pending_approvals', () =>
      ContentApprovalRequest.count({ where: { ...where, status: 'pending' } })),
    countOrNull('failed_jobs', () =>
      PublishingJob.count({ where: { ...where, state: 'failed' } })),
    countOrNull('dead_lettered_jobs', () =>
      PublishingJob.count({ where: { ...where, state: 'dead_lettered' } })),
    countOrNull('late_jobs', () =>
      PublishingJob.count({
        where: { ...where, state: ['pending', 'retrying'], publish_at: { [Op.lt]: lateCutoff } },
      })),
    countOrNull('broken_links', () => countBrokenLinks(scope)),
  ]);

  return {
    // null = "could not be gathered", and it stays null all the way to the builder, which
    // turns it into a visible exclusion. Nothing here coerces a failed query to 0.
    pendingApprovals,
    failedJobs,
    deadLetteredJobs,
    lateJobs,
    brokenLinks,
    // No source exists for either of these yet. They are null - not 0 - and the registry
    // marks their metrics untrusted, so the builder excludes them with the reason attached.
    unmappedSpendItems: null,
    unattributedVisitorShare: null,
  };
}

export async function getNeedsAttentionQueue(scope: NeedsAttentionScope): Promise<NeedsAttentionQueue> {
  const counts = await gatherNeedsAttentionCounts(scope);
  return buildNeedsAttentionQueue(counts, REGISTRY_ORACLE);
}
