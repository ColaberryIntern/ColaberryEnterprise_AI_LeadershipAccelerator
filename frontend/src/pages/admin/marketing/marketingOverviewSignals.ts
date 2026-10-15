import { presentHealth } from './overviewFormat';
import type { OverviewAccount, UpcomingPost } from '../../../services/marketingOpsApi';

/**
 * What the Overview should actually be shouting about.
 *
 * WHY THIS EXISTS. On 2026-10-15 the page showed, side by side: three posts scheduled, and a
 * LinkedIn account whose token had expired two days earlier. Those two facts were in different
 * cards, in different columns, and nothing on the page connected them - so a post scheduled to a
 * dead channel read as "scheduled", and the dead channel read as a status badge rather than as
 * work. The operator had to do the join in their head, every time, and would only find out it
 * had failed after it failed.
 *
 * A dashboard earns its place by doing that join. These functions are that join, kept pure so
 * they can be tested without rendering anything.
 *
 * ── THE HAND-POSTED EXCEPTION, WHICH IS THE EASY THING TO GET WRONG ──
 *
 * Some networks have no API connection at all and are posted by hand - the overview returns them
 * as `handoff_providers`. A post scheduled to one of those is NOT at risk: it was never going to
 * publish automatically, and flagging it would cry wolf on every Instagram post forever. Treating
 * "no usable account" as "broken" without checking the hand-off list is the bug that would make
 * this whole feature untrustworthy within a day.
 */

export type ChannelIssueKind = 'expired' | 'expiring' | 'blocked';

export interface ChannelIssue {
  accountId: string;
  provider: string;
  displayName: string;
  brandName: string | null;
  kind: ChannelIssueKind;
  /** The human phrase already used elsewhere, e.g. "Token expired". */
  label: string;
  daysLeft: number | null;
  /** How many already-scheduled posts go to this channel. Zero is common and still an issue. */
  scheduledHere: number;
}

/** Severity order. Expired beats expiring; within a kind, sooner and busier comes first. */
const KIND_RANK: Record<ChannelIssueKind, number> = { expired: 0, blocked: 1, expiring: 2 };

/**
 * Channels that need a person, worst first.
 *
 * `expiring` is included even though the account still works: the entire point of surfacing it
 * is to be early. An account that expires in four days is a Tuesday problem, and the page that
 * only reports it on Saturday has reported a failure rather than prevented one.
 */
export function channelIssues(
  accounts: readonly OverviewAccount[],
  upcoming: readonly UpcomingPost[],
): ChannelIssue[] {
  const scheduledPerProvider = new Map<string, number>();
  for (const post of upcoming) {
    for (const provider of post.providers) {
      scheduledPerProvider.set(provider, (scheduledPerProvider.get(provider) ?? 0) + 1);
    }
  }

  const issues: ChannelIssue[] = [];
  for (const account of accounts) {
    const { label, tone, usable } = presentHealth(account.health);
    // `revoked` is a decision someone made, not a fault, so it is not work. Everything else that
    // is unusable, plus the still-working-but-expiring case, is.
    if (account.health === 'revoked') continue;
    if (usable && account.health !== 'expiring') continue;

    const kind: ChannelIssueKind = account.health === 'expired'
      ? 'expired'
      : account.health === 'expiring' ? 'expiring' : 'blocked';

    issues.push({
      accountId: account.id,
      provider: account.provider,
      displayName: account.display_name,
      brandName: account.brand_name,
      kind,
      label,
      daysLeft: account.expires_in_days,
      scheduledHere: scheduledPerProvider.get(account.provider) ?? 0,
      // `tone` is deliberately not carried: the caller decides how to paint, and a presentation
      // value travelling through a logic module is how the two drift apart.
    });
    void tone;
  }

  return issues.sort((a, b) => {
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    // Sooner first; a null expiry sorts last among its kind rather than first.
    const da = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
    const db = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return b.scheduledHere - a.scheduledHere;
  });
}

/**
 * The providers a scheduled post cannot actually reach.
 *
 * Returns [] when the post is fine, so a caller can test truthiness of the length. A provider
 * counts as reachable if ANY account for it can publish - one brand's dead token does not
 * condemn another brand's working one.
 */
export function blockedProvidersFor(
  post: UpcomingPost,
  accounts: readonly OverviewAccount[],
  handoffProviders: readonly string[],
): string[] {
  const handoff = new Set(handoffProviders);
  const usableProviders = new Set(
    accounts.filter((a) => presentHealth(a.health).usable).map((a) => a.provider),
  );

  return post.providers.filter((p) => {
    // Hand-posted networks are not broken; they were never automatic. See the header.
    if (handoff.has(p)) return false;
    return !usableProviders.has(p);
  });
}

/** How many of the upcoming posts have at least one unreachable channel. */
export function countPostsAtRisk(
  upcoming: readonly UpcomingPost[],
  accounts: readonly OverviewAccount[],
  handoffProviders: readonly string[],
): number {
  return upcoming.filter((p) => blockedProvidersFor(p, accounts, handoffProviders).length > 0).length;
}
