import { UniqueConstraintError, Op } from 'sequelize';
import AiAgent from '../models/AiAgent';
import AgentReportSubscription, { AgentReportCadence, AgentReportContentSection } from '../models/AgentReportSubscription';
import AgentReportRun, { AgentReportRunStatus } from '../models/AgentReportRun';
import OrgMember from '../models/OrgMember';
import { getAgentDetail } from './reese/agentDetailService';
import { sendRawEmail } from './emailService';
import { env } from '../config/env';
import {
  resolveAgentIdentity, getOpenTicketBreakdownByType, getTicketFollowUpCounts,
  getTopAuthorizationReasons, getTokensAndModel, getErrorCount, resolveRecipientDisplayName,
} from './agentReportStatsService';
import { renderReportHtml, renderReportText, ReportData } from './agentReportTemplateService';

// AI Workforce Management, Checkpoint D — the report-generation/delivery
// worker that AgentReportSubscription's own PR explicitly deferred.
// Reuses reese/agentDetailService.ts's getAgentDetail() as the single real
// data source for every content section (cost/activity/trust/tickets) —
// the exact same numbers AgentDetailPage's Overview tab already shows,
// never a second, drifting calculation. Send path bypasses
// communicationSafetyService.evaluateSend() deliberately (it requires a
// leadId and every check resolves against lead-facing tables — the wrong
// tool for an internal manager notification), matching the existing
// incident-subscriber precedent per REPORTING_MAP.md.

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24, // h23 can report '24' for midnight on some ICU builds
    weekday: get('weekday'),
  };
}

/** The subscriber's current local hour, 0-23, in their own real timezone —
 * never the server's own clock. */
export function computeLocalHour(now: Date, timezone: string): number {
  return localDateParts(now, timezone).hour;
}

/**
 * The real idempotency key for a delivery period (see AgentReportRun.ts's
 * own header comment): 'YYYY-MM-DD' for daily, or the Monday of the
 * current calendar week (also 'YYYY-MM-DD') for weekly — deliberately not
 * an ISO week number, to avoid year-boundary ISO-week edge cases. Computed
 * from pure calendar-date arithmetic once the local Y/M/D is already
 * known, at UTC noon, so no DST transition can shift the date.
 */
export function computePeriodKey(cadence: AgentReportCadence, now: Date, timezone: string): string {
  const { year, month, day, weekday } = localDateParts(now, timezone);
  if (cadence === 'daily') return `${year}-${pad2(month)}-${pad2(day)}`;

  const mondayAnchor = new Date(Date.UTC(year, month - 1, day, 12));
  const daysSinceMonday = (WEEKDAY_INDEX[weekday] + 6) % 7; // Mon=0 ... Sun=6
  mondayAnchor.setUTCDate(mondayAnchor.getUTCDate() - daysSinceMonday);
  return `${mondayAnchor.getUTCFullYear()}-${pad2(mondayAnchor.getUTCMonth() + 1)}-${pad2(mondayAnchor.getUTCDate())}`;
}

interface RenderedReport {
  subject: string;
  agentName: string;
  html: string;
  text: string;
  snapshot: Record<string, unknown>;
}

export interface RenderReportOptions {
  /** Real, committed subscription's id — threaded through so "since last
   * report" can diff against the prior real AgentReportRun. Omitted by
   * handleReportPreview() (previewing a subscription that may not even be
   * saved yet, per this function's own real callers) — the delta is then
   * honestly omitted, never fabricated as "+0". */
  subscriptionId?: string;
  cadence?: AgentReportCadence;
  timezone?: string;
  recipientEmail?: string;
}

const DEFAULT_CADENCE: AgentReportCadence = 'daily';
const DEFAULT_TIMEZONE = 'America/Chicago';
const STATS_WINDOW_DAYS = 30;

/**
 * Builds the real report content for exactly the requested sections, from
 * a single getAgentDetail() call plus a handful of report-specific queries
 * (agentReportStatsService.ts) for stats getAgentDetail() doesn't already
 * compute. `null` when the agent no longer exists (the subscription
 * outlived its agent) — the caller records this as a failed run, never a
 * silently-skipped one. Delegates all HTML/text rendering to
 * agentReportTemplateService.ts (pure, no I/O, independently testable).
 */
export async function renderReportContent(
  agentId: string, contentScope: AgentReportContentSection[], options: RenderReportOptions = {},
): Promise<RenderedReport | null> {
  const detail = await getAgentDetail(agentId);
  if (!detail) return null;

  const identity = await resolveAgentIdentity(agentId);
  const agentName = detail.agent.agent_name;
  const now = new Date();

  let openTicketBreakdown: Awaited<ReturnType<typeof getOpenTicketBreakdownByType>> = [];
  let followUpCounts = { needsReply: 0, pastDue: 0 };
  if (contentScope.includes('tickets') && identity?.adminUser) {
    [openTicketBreakdown, followUpCounts] = await Promise.all([
      getOpenTicketBreakdownByType(identity.adminUser.id, identity.agent),
      getTicketFollowUpCounts(identity.adminUser.id, identity.agent),
    ]);
  }

  let topReasons: Awaited<ReturnType<typeof getTopAuthorizationReasons>> = [];
  if (contentScope.includes('trust')) {
    topReasons = await getTopAuthorizationReasons(detail.agent.id, agentName, detail.authorization_summary.window_days);
  }

  let tokensAndModel: Awaited<ReturnType<typeof getTokensAndModel>> | null = null;
  if (contentScope.includes('cost')) {
    tokensAndModel = await getTokensAndModel(detail.agent.id, agentName, STATS_WINDOW_DAYS);
  }

  let errorCount30d: number | null = null;
  if (contentScope.includes('activity')) {
    errorCount30d = await getErrorCount(detail.agent.id, agentName, STATS_WINDOW_DAYS);
  }

  // "Since last report" — only when this is a real, committed subscription
  // (never fabricated for a preview of one that doesn't exist yet).
  let openTicketDelta: number | null = null;
  if (options.subscriptionId) {
    const priorRun = await AgentReportRun.findOne({
      where: { subscription_id: options.subscriptionId, delivery_status: 'sent' },
      order: [['generated_at', 'DESC']],
    });
    const priorOpenCount = (priorRun?.content_snapshot as any)?.tickets?.openTicketCount;
    if (typeof priorOpenCount === 'number') openTicketDelta = detail.open_ticket_count - priorOpenCount;
  }

  const recipient = options.recipientEmail
    ? { displayName: await resolveRecipientDisplayName(options.recipientEmail), email: options.recipientEmail }
    : null;

  const scheduledOn = detail.related_tasks.filter((t) => t.enabled).length;
  const scheduledOff = detail.related_tasks.filter((t) => !t.enabled).length;

  const reportData: ReportData = {
    agentId,
    agentName,
    cadenceLabel: (options.cadence ?? DEFAULT_CADENCE).toUpperCase() as 'DAILY' | 'WEEKLY',
    generatedAt: now,
    timezone: options.timezone ?? DEFAULT_TIMEZONE,
    triggerTypeLabel: detail.trust_contract.trigger_type ?? 'unknown',
    abacMode: detail.agent.abac_effective_mode,
    sections: contentScope,

    openTicketCount: detail.open_ticket_count,
    openTicketDelta,
    completedTicketCount30d: detail.completed_ticket_count_30d,
    allTimeTicketBreakdown: detail.ticket_breakdown,
    openTicketBreakdown,
    needsReplyCount: followUpCounts.needsReply,
    pastDueCount: followUpCounts.pastDue,
    verifiedResolutionCount: detail.verified_resolution_count,
    ownedTicketCountAllTime: detail.owned_ticket_count_all_time,
    oldestOpenTicketAgeDays: detail.oldest_open_ticket_age_days,
    lastTicketActivityAt: detail.trust_contract.last_activity_at,

    authSummary: contentScope.includes('trust') ? {
      windowDays: detail.authorization_summary.window_days,
      total: detail.authorization_summary.total,
      allow: detail.authorization_summary.allow,
      approval: detail.authorization_summary.approval,
      block: detail.authorization_summary.block,
      enforcedCount: detail.authorization_summary.enforced_count,
    } : null,
    topReasons,

    // Honest null, same as before this redesign: cost_summary is null when
    // nothing has been tracked yet, never fabricated as a real-looking $0.
    costUsd: contentScope.includes('cost') ? (detail.cost_summary?.cost_usd ?? null) : null,
    costRuns: contentScope.includes('cost') ? (detail.cost_summary?.runs ?? null) : null,
    totalTokens: tokensAndModel?.totalTokens ?? null,
    topModel: tokensAndModel?.topModel ?? null,
    errorCount30d,

    scheduledTasksOn: scheduledOn,
    scheduledTasksOff: scheduledOff,

    recipient,
    agentPageUrl: `${env.frontendUrl}/admin/agents/${agentId}`,
  };

  const html = renderReportHtml(reportData);
  const text = renderReportText(reportData);
  const subject = `Agent report: ${agentName}`;
  const snapshot: Record<string, unknown> = {
    agentName,
    generatedAt: now.toISOString(),
    tickets: { openTicketCount: detail.open_ticket_count, breakdown: detail.ticket_breakdown },
    trust: contentScope.includes('trust') ? detail.authorization_summary : undefined,
    cost: contentScope.includes('cost') ? detail.cost_summary : undefined,
    activity: contentScope.includes('activity') ? {
      runCount: detail.trust_contract.run_count,
      errorCount: detail.trust_contract.error_count,
      lastRunAt: detail.trust_contract.last_run_at,
      avgDurationMs: detail.trust_contract.avg_duration_ms,
      lastActivityAt: detail.trust_contract.last_activity_at,
    } : undefined,
  };

  return { subject, agentName, html, text, snapshot };
}

async function resolveRecipientEmail(subscription: AgentReportSubscription): Promise<string> {
  if (subscription.subscriber_org_member_id) {
    const member = await OrgMember.findByPk(subscription.subscriber_org_member_id);
    if (member?.email) return member.email;
  }
  return subscription.created_by_email;
}

export interface DispatchResult {
  dispatched: number;
  skipped: number;
  failed: number;
}

/**
 * The cron-tick entry point. For every enabled subscription whose current
 * local hour matches its configured delivery hour, tries to claim this
 * period's run via the DB-unique-constrained insert — a concurrent or
 * retried tick that loses that race is a real, expected `skipped`, not an
 * error. `now` is injectable for deterministic tests; production callers
 * omit it and get the real clock.
 */
export async function dispatchDueReportRuns(now: Date = new Date()): Promise<DispatchResult> {
  const subscriptions = await AgentReportSubscription.findAll({ where: { enabled: true } });
  const result: DispatchResult = { dispatched: 0, skipped: 0, failed: 0 };

  for (const subscription of subscriptions) {
    if (computeLocalHour(now, subscription.timezone) !== subscription.delivery_hour_local) {
      result.skipped++;
      continue;
    }

    const periodKey = computePeriodKey(subscription.cadence, now, subscription.timezone);

    let run: AgentReportRun;
    try {
      run = await AgentReportRun.create({ subscription_id: subscription.id, period_key: periodKey, delivery_status: 'pending' });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        result.skipped++;
        continue;
      }
      throw err;
    }

    try {
      const recipientEmail = await resolveRecipientEmail(subscription);
      const rendered = await renderReportContent(subscription.agent_id, subscription.content_scope, {
        subscriptionId: subscription.id,
        cadence: subscription.cadence,
        timezone: subscription.timezone,
        recipientEmail,
      });
      if (!rendered) {
        await run.update({ delivery_status: 'failed', error_message: 'Agent no longer exists' });
        result.failed++;
        continue;
      }

      // Report redesign (2026-10-02) — real, found-while-redesigning bug fix:
      // this send never passed fromName, so every agent's report arrived
      // "From: Cory - AI Operations" regardless of which agent it was about
      // (sendRawEmail()'s own documented default). Now attributed honestly.
      const sendResult = await sendRawEmail({
        to: [recipientEmail],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        fromName: `${rendered.agentName} - Agent Reports`,
        tag: 'agent_report_subscription',
      });

      if (sendResult.ok) {
        await run.update({ delivery_status: 'sent', delivered_at: new Date(), content_snapshot: rendered.snapshot });
        result.dispatched++;
      } else {
        await run.update({ delivery_status: 'failed', error_message: sendResult.error?.slice(0, 500) || 'Unknown send failure' });
        result.failed++;
      }
    } catch (err: any) {
      await run.update({ delivery_status: 'failed', error_message: String(err?.message || err).slice(0, 500) });
      result.failed++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Delivery history — AI Agent Dashboard redesign, Checkpoint C, Reports slice
// (2026-09-02). Confirmed genuinely absent in the Checkpoint A integration
// matrix: AgentReportRun and its DB-enforced idempotency have existed since
// Checkpoint D, but nothing ever read the rows back. Two real risks flagged
// at that same discovery are guarded against directly here: a naive
// `sent / total` query would silently count a stuck `pending` row as a
// success-adjacent non-failure (this reports `pending` as its own explicit
// count, never folded into either side of the ratio), and `ratePct` is
// `null` — not a fabricated 100% or 0% — whenever there is no real
// sent-or-failed evidence to compute a rate from.
// ---------------------------------------------------------------------------

const HISTORY_WINDOW_DAYS = 30;

export interface ReportRunView {
  id: string;
  subscriptionId: string;
  periodKey: string;
  generatedAt: Date;
  deliveredAt: Date | null;
  deliveryStatus: AgentReportRunStatus;
  errorMessage: string | null;
}

export interface ReportRunHistoryView {
  windowDays: number;
  runs: ReportRunView[];
  sent: number;
  failed: number;
  pending: number;
  /** `sent / (sent + failed)` as a percentage rounded to 1 decimal place —
   * `null`, never a fabricated number, when `sent + failed === 0`. */
  successRatePct: number | null;
}

function toRunView(row: AgentReportRun): ReportRunView {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    periodKey: row.period_key,
    generatedAt: row.generated_at,
    deliveredAt: row.delivered_at,
    deliveryStatus: row.delivery_status,
    errorMessage: row.error_message,
  };
}

/** `null` return means the agent itself doesn't exist. A real agent with no
 * subscriptions (or subscriptions that have never had a run yet) returns
 * real empty/zero values, never an error and never a fabricated rate. */
export async function listReportRunsForAgent(agentId: string): Promise<ReportRunHistoryView | null> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) return null;

  const subscriptions = await AgentReportSubscription.findAll({ where: { agent_id: agentId }, attributes: ['id'] });
  if (subscriptions.length === 0) {
    return { windowDays: HISTORY_WINDOW_DAYS, runs: [], sent: 0, failed: 0, pending: 0, successRatePct: null };
  }

  const windowStart = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await AgentReportRun.findAll({
    where: {
      subscription_id: { [Op.in]: subscriptions.map((s) => s.id) },
      generated_at: { [Op.gte]: windowStart },
    },
    order: [['generated_at', 'DESC']],
  });

  const sent = rows.filter((r) => r.delivery_status === 'sent').length;
  const failed = rows.filter((r) => r.delivery_status === 'failed').length;
  const pending = rows.filter((r) => r.delivery_status === 'pending').length;
  const denominator = sent + failed;
  const successRatePct = denominator > 0 ? Math.round((sent / denominator) * 1000) / 10 : null;

  return { windowDays: HISTORY_WINDOW_DAYS, runs: rows.map(toRunView), sent, failed, pending, successRatePct };
}
