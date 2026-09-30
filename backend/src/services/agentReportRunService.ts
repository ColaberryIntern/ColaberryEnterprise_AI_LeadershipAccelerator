import { UniqueConstraintError, Op } from 'sequelize';
import AiAgent from '../models/AiAgent';
import AgentReportSubscription, { AgentReportCadence, AgentReportContentSection } from '../models/AgentReportSubscription';
import AgentReportRun, { AgentReportRunStatus } from '../models/AgentReportRun';
import OrgMember from '../models/OrgMember';
import { getAgentDetail } from './reese/agentDetailService';
import { sendRawEmail } from './emailService';

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
  html: string;
  text: string;
  snapshot: Record<string, unknown>;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Builds the real report content for exactly the requested sections, from
 * a single getAgentDetail() call. `null` when the agent no longer exists
 * (the subscription outlived its agent) — the caller records this as a
 * failed run, never a silently-skipped one.
 */
export async function renderReportContent(agentId: string, contentScope: AgentReportContentSection[]): Promise<RenderedReport | null> {
  const detail = await getAgentDetail(agentId);
  if (!detail) return null;

  const snapshot: Record<string, unknown> = {};
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  if (contentScope.includes('cost')) {
    const cost = detail.cost_summary;
    snapshot.cost = cost;
    const line = cost ? `$${cost.cost_usd.toFixed(4)} over ${cost.runs} run(s), last 30 days` : 'No tracked cost in the last 30 days';
    htmlParts.push(`<h3>Cost</h3><p>${escapeHtml(line)}</p>`);
    textParts.push(`Cost: ${line}`);
  }

  if (contentScope.includes('activity')) {
    const tc = detail.trust_contract;
    snapshot.activity = {
      runCount: tc.run_count,
      errorCount: tc.error_count,
      lastRunAt: tc.last_run_at,
      avgDurationMs: tc.avg_duration_ms,
      lastActivityAt: tc.last_activity_at,
    };
    const line = `${tc.run_count} run(s), ${tc.error_count} error(s). Last run: ${tc.last_run_at ? tc.last_run_at.toISOString() : 'never (event-driven agent)'}.`;
    htmlParts.push(`<h3>Activity</h3><p>${escapeHtml(line)}</p>`);
    textParts.push(`Activity: ${line}`);
  }

  if (contentScope.includes('trust')) {
    const auth = detail.authorization_summary;
    snapshot.trust = auth;
    const line = `${auth.allow}/${auth.total} allowed, ${auth.approval}/${auth.total} required approval, ${auth.block}/${auth.total} would block (${auth.enforced_count} under real enforce mode), last ${auth.window_days} days.`;
    htmlParts.push(`<h3>Trust</h3><p>${escapeHtml(line)}</p>`);
    textParts.push(`Trust: ${line}`);
  }

  if (contentScope.includes('tickets')) {
    const breakdown = detail.ticket_breakdown;
    snapshot.tickets = { openTicketCount: detail.open_ticket_count, breakdown };
    const line = `${detail.open_ticket_count} open ticket(s). ${breakdown.map((b) => `${b.type}: ${b.count}`).join(', ') || 'no ticket history'}.`;
    htmlParts.push(`<h3>Tickets</h3><p>${escapeHtml(line)}</p>`);
    textParts.push(`Tickets: ${line}`);
  }

  const agentName = detail.agent.agent_name;
  const subject = `Agent report: ${agentName}`;
  const html = `<h2>${escapeHtml(agentName)}</h2>${htmlParts.join('')}`;
  const text = `${agentName}\n\n${textParts.join('\n')}`;
  snapshot.agentName = agentName;
  snapshot.generatedAt = new Date().toISOString();

  return { subject, html, text, snapshot };
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
      const rendered = await renderReportContent(subscription.agent_id, subscription.content_scope);
      if (!rendered) {
        await run.update({ delivery_status: 'failed', error_message: 'Agent no longer exists' });
        result.failed++;
        continue;
      }

      const recipientEmail = await resolveRecipientEmail(subscription);
      const sendResult = await sendRawEmail({
        to: [recipientEmail],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
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
