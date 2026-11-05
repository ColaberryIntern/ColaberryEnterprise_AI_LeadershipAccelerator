/**
 * govOpportunitySweep: the gov pursuit DAILY SWEEP. Once a day it hides what didn't survive, then sends the ONE morning
 * email, built from the same buildDiscoveryBoard the board route uses, so the two can't disagree. It NEVER approves or
 * assigns, and never hides a row a person restored or has already moved forward.
 *
 * Failure design: Opportunity Pulse failures don't throw. The client quietly returns an old snapshot, so this checks
 * `source === 'live'` and does nothing otherwise: no hide and no email from stale rows. An empty live feed is treated the
 * same, because "Nothing needs you today" must never be a broken feed talking. Saved state is read BEFORE the once-per-day
 * slot is claimed, so a read that throws doesn't burn the day. If a read fails softly, rowsToHide hides nothing and the
 * email says the list may be incomplete.
 *
 * Not retried: a failed send, because a retry can double-send. It's logged and that morning's email is lost. Tomorrow's
 * email carries the current to-do list, but not the itemized hides from the lost morning; those stay on the board's Hidden
 * list, which every email links to with its total. Hides reuse the reversible dismissals table, and one failed hide doesn't
 * stop the rest.
 */
import { FLAGS } from '../../../config/featureFlags';
import { buildDiscoveryBoard, rowsToHide, type BoardFacts, type DiscoveryBoard, type HideDecision } from './govDiscoveryBoard';
import type { GovOpportunity } from './govOpportunity';
import { govPursuitSubject, renderGovPursuitEmail } from './govPursuitEmail';

const RUN_LOG_KEY = 'gov_opp_sweep_run_log';
const SWEEP_ACTOR = 'gov-opp-sweep';

export interface SweepResult { skipped?: string; hidden: number; emailed: boolean; counts?: DiscoveryBoard['counts'] }

function log(event: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>, errorClass?: string): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, outcome,
    ...(errorClass ? { error_class: errorClass } : {}), context,
  }));
}

/** Today in Central, as YYYY-MM-DD, matching the 7:30 AM Central schedule. */
export const centralToday = (now: Date = new Date()): string => now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

/** PURE. The facts with today's hides applied, so the email shows the board exactly as it will look after them. */
export function afterHides(facts: BoardFacts, hidden: readonly HideDecision[]): BoardFacts {
  return { ...facts, dismissed: new Set([...facts.dismissed, ...hidden.map((h) => h.opportunity.uuid)]) };
}

export async function runGovOpportunitySweep(): Promise<SweepResult> {
  const nil: SweepResult = { hidden: 0, emailed: false };
  if (!FLAGS.govOpportunitySweep) return { ...nil, skipped: 'disabled' };

  const { fetchBestFitOpportunities } = await import('./oppPulseClient');
  const feedResult = await fetchBestFitOpportunities();
  if (feedResult.source !== 'live') {
    log('gov_opp_sweep_feed_not_live', 'partial', { reason: feedResult.snapshotReason ?? null });
    return { ...nil, skipped: 'feed_not_live' };
  }
  const feed: GovOpportunity[] = feedResult.opportunities.filter((o) => o && o.uuid);
  if (feed.length === 0) {
    log('gov_opp_sweep_feed_empty', 'partial', {});
    return { ...nil, skipped: 'feed_empty' };
  }

  const { lookupGovContractsContainer } = await import('../../../scripts/lib/factoryDemoContainer');
  const container: any = await lookupGovContractsContainer();
  if (!container) return { ...nil, skipped: 'no_container' };
  const tenantId = container.tenant.id;

  const { loadBoardFacts } = await import('./govDiscoveryBoardFacts');
  const facts = await loadBoardFacts(tenantId);

  const { claimDailySlot } = await import('./govDailySlot');
  if (!(await claimDailySlot(RUN_LOG_KEY))) return { ...nil, skipped: 'already_ran_today' };

  const { dismissOpportunity } = await import('./govOpportunityDismissals');
  const hidden: HideDecision[] = [];
  for (const h of rowsToHide(feed, facts)) {
    try {
      await dismissOpportunity({
        tenantId, organizationId: container.org.id, opportunityKey: h.opportunity.uuid,
        title: h.opportunity.title, agency: h.opportunity.agency, reason: h.reason, dismissedBy: SWEEP_ACTOR,
      });
      hidden.push(h);
    } catch (err: any) {
      log('gov_opp_sweep_hide_failed', 'failure', { uuid: h.opportunity.uuid, message: err?.message }, err?.constructor?.name);
    }
  }

  const today = centralToday();
  const board = buildDiscoveryBoard(feed, afterHides(facts, hidden), today);
  const { sendGovOpportunitySweepEmail } = await import('../../emailService');
  try {
    await sendGovOpportunitySweepEmail({ subject: govPursuitSubject(board), html: renderGovPursuitEmail(board, hidden, today) });
  } catch (err: any) {
    log('gov_opp_sweep_send_failed', 'failure', { hidden: hidden.length, message: err?.message }, err?.constructor?.name);
    return { hidden: hidden.length, emailed: false, counts: board.counts };
  }
  log('gov_opp_sweep_sent', 'success', { hidden: hidden.length, counts: board.counts, incomplete: board.incomplete });
  return { hidden: hidden.length, emailed: true, counts: board.counts };
}
