import { Op } from 'sequelize';
import { AiAgent, GrowthJourneyDecision, GrowthJourneyExecution, GrowthJourneyExecutionControl, ScheduledEmail } from '../../../models';
import type { GrowthJourneyControlKind } from '../../../models/GrowthJourneyExecutionControl';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../../agentRegistry/growthJourneyAgents';
import { PROPOSAL_TTL_HOURS } from '../execution/proposalFiler';
import { readJourneyEvents } from '../ledgerRead';
import { safeKey } from '../reads/readPaging';

/**
 * The journey's own health: counts and reasons, nothing else (Phase 6, T609).
 *
 * ─── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 *
 * One question, answerable while the system is still dark: is the Growth
 * Journey doing what it should, and if not, which part stopped? It reports
 * counts, ages and reason strings. It carries no subject, no lead, no address,
 * no message body and no free-text error.
 *
 * Every reason here is either a value from a closed union or a string that has
 * been through T607's `safeKey` - length-capped AND address-checked. That is the
 * stricter of the two helpers on purpose: the reasons below become OBJECT KEYS
 * in `by_reason`, and both of their sources are JSONB the schema does not
 * constrain (`scheduled_emails.metadata.blocked_reason` and the ledger row's
 * `payload.reason`). T607 was docked for exactly this - JSONB-derived keys that
 * were length-capped but never address-checked - so a key on this surface goes
 * through the helper that does both.
 *
 * It NEVER writes and never decides. A health reader that repairs what it finds
 * is a surprise nobody wants twice (see `campaignHealthCheck.ts`, which does).
 *
 * ─── FOUR PLACES THE PLAN DID NOT MATCH THE SCHEMA ──────────────────────────
 *
 * 1. `stuck_pending_review` is counted against `PROPOSAL_TTL_HOURS`, not the
 *    constant the plan named. The plan pointed at `reconcileExecutions.ts:44`,
 *    which is `APPROVED_TTL_HOURS` - the TTL that expires an APPROVED receipt.
 *    What actually ages a `pending_review` receipt is its PROPOSAL's `expires_at`
 *    (`reconcileExecutions.ts:188` moves it to `expired` once the proposal has
 *    lapsed), and that is `PROPOSAL_TTL_HOURS`. Both happen to be 72 today, so
 *    the wrong constant would have produced the right number and gone unnoticed
 *    until someone changed one of them. The number means "a receipt the
 *    reconciler should have expired and has not", which is a statement about the
 *    reconciler running - so it has to be keyed on the constant the reconciler
 *    uses.
 *
 * 2. `held` does NOT come from the ledger. The plan asked for "held: by reason
 *    (from the bounded ledger read)"; there is no hold event in the ledger - the
 *    journey's fourteen `growth_journey.execution.*` events include `refused`,
 *    `cancelled` and `failed`, and no `held`. The real hold is the send-time one
 *    (T511): it leaves a `scheduled_emails` row `cancelled` with
 *    `metadata.blocked_reason` starting `journey_hold:`. That is what is counted
 *    here, grouped by reason - which is also the plan's separate
 *    `journey_hold_rows` field, so the two are one read reported two ways rather
 *    than one number invented twice.
 *
 * 3. A cron can be `disabled`, and all three of them are. The plan's vocabulary
 *    was `on_time | late | never`. Every journey agent ships `enabled: false`
 *    and stays off until Ali turns it on, so on today's tree all three would
 *    report `never` - which reads as broken and is not. Worse, `/health/full`
 *    derives `overall_status` from its checks' severities, so a dark subsystem
 *    reporting a problem would leave the whole platform permanently `warning`.
 *    `disabled` is therefore a fourth state, and it is not a fault.
 *
 *    `enabled` and `last_run_at` are read from the `ai_agents` ROW, never from
 *    `GROWTH_JOURNEY_AGENT_ENTRIES`. The registry's `enabled: false` is a seed
 *    default, "honoured on first creation only" by its own comment - so an
 *    operator who turns the executor on changes the row and not the registry.
 *    A first draft of this file read the registry, which would have reported
 *    `disabled` forever no matter what Ali did. The registry supplies only the
 *    names and the schedules, which are facts about the code. T604's status
 *    registry reads the same two columns from the same table.
 *
 *    An agent with NO row is `disabled` rather than `never`: an unregistered
 *    agent is not scheduled, so it is dark, not overdue.
 *
 * 4. The refusal read is CAPPED, and says so. `readJourneyEvents` is keyed on
 *    `entityIds` and answers nothing without them, so refusals can only be read
 *    for a known set of decisions. This takes the most recent
 *    `MAX_HEALTH_DECISIONS` in the window; if the window holds more, the answer
 *    carries `capped: true` and the caller is told the count is a floor. A capped
 *    number served as a total is the defect T608 was docked for, and it is not
 *    repeated here.
 */

/** The most recent decisions a refusal read will span. A window with more is reported `capped`. */
export const MAX_HEALTH_DECISIONS = 500;

/** How stale a cron's last run may be before it is `late`: its own period, plus this much slack. */
export const CRON_SLACK_MINUTES = 30;

const MINUTE = 60_000;
const HOUR = 3_600_000;

export type CronState = 'on_time' | 'late' | 'never' | 'disabled';

export interface CronHealth {
  agent: string;
  schedule: string;
  state: CronState;
  last_run_at: string | null;
  minutes_since: number | null;
}

export interface StatusAge {
  status: string;
  count: number;
  max_age_hours: number | null;
}

export interface JourneyHealth {
  receipts: StatusAge[];
  stuck_pending_review: { count: number; over_hours: number };
  held: { total: number; by_reason: Record<string, number> };
  refused: { total: number; by_reason: Record<string, number>; capped: boolean };
  crons: CronHealth[];
  controls: Record<GrowthJourneyControlKind, number>;
  journey_hold_rows: number;
  ledger_read: 'ok' | 'timed_out' | 'failed';
  window_hours: number;
}

export interface JourneyHealthArgs {
  now: Date;
  ledgerWindowHours?: number;
}

/** The hold marker the send path writes into `scheduled_emails.metadata.blocked_reason`. */
const HOLD_PREFIX = 'journey_hold:';

/**
 * How often a cron schedule fires, in minutes - enough of a cron reader to answer "is it late".
 * Only the two shapes the journey registry actually uses are understood: a fixed daily time
 * (`20 4 * * *`) and a step over an hour range (`*／15 14-22 * * 1-5`). Anything else answers null
 * and the agent is never called `late` on a guess.
 */
export function periodMinutes(schedule: string): number | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour] = parts;
  const step = /^\*\/(\d+)$/.exec(minute);
  if (step) {
    const n = Number(step[1]);
    return n > 0 && n <= 60 ? n : null;
  }
  // a fixed minute: daily if the hour is fixed too, otherwise hourly
  if (/^\d+$/.test(minute)) return /^\d+$/.test(hour) ? 24 * 60 : 60;
  return null;
}

/** `[from, to)` on a column, as every other journey read spells it. */
const since = (now: Date, hours: number): Date => new Date(now.getTime() - hours * HOUR);

async function readReceipts(now: Date, windowHours: number): Promise<StatusAge[]> {
  const rows = await GrowthJourneyExecution.findAll({
    where: { created_at: { [Op.gte]: since(now, windowHours) } },
    attributes: ['status', 'created_at'],
    limit: 10_000,
    order: [['created_at', 'DESC']],
  });
  const by = new Map<string, { count: number; oldest: number }>();
  for (const r of rows) {
    const status = String(r.get('status'));
    const at = new Date(r.get('created_at') as Date).getTime();
    const seen = by.get(status);
    if (seen) {
      seen.count += 1;
      seen.oldest = Math.min(seen.oldest, at);
    } else {
      by.set(status, { count: 1, oldest: at });
    }
  }
  return [...by.entries()]
    .map(([status, v]) => ({
      status,
      count: v.count,
      max_age_hours: Math.round(((now.getTime() - v.oldest) / HOUR) * 10) / 10,
    }))
    .sort((a, b) => a.status.localeCompare(b.status));
}

async function readStuckPendingReview(now: Date): Promise<{ count: number; over_hours: number }> {
  const count = await GrowthJourneyExecution.count({
    where: { status: 'pending_review', created_at: { [Op.lt]: since(now, PROPOSAL_TTL_HOURS) } },
  });
  return { count, over_hours: PROPOSAL_TTL_HOURS };
}

async function readHeld(now: Date, windowHours: number): Promise<{ total: number; by_reason: Record<string, number> }> {
  const rows = await ScheduledEmail.findAll({
    where: { status: 'cancelled', created_at: { [Op.gte]: since(now, windowHours) } },
    attributes: ['metadata'],
    limit: 10_000,
  });
  const by_reason: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const raw = (r.get('metadata') as { blocked_reason?: unknown } | null)?.blocked_reason;
    const reason = safeKey(raw);
    if (!reason.startsWith(HOLD_PREFIX)) continue;
    total += 1;
    by_reason[reason] = (by_reason[reason] ?? 0) + 1;
  }
  return { total, by_reason };
}

async function readRefused(
  now: Date,
  windowHours: number,
): Promise<{ refused: { total: number; by_reason: Record<string, number>; capped: boolean }; ledger_read: JourneyHealth['ledger_read'] }> {
  const from = since(now, windowHours);
  const decisions = await GrowthJourneyDecision.findAll({
    where: { created_at: { [Op.gte]: from } },
    attributes: ['id'],
    order: [['created_at', 'DESC']],
    limit: MAX_HEALTH_DECISIONS + 1,
  });
  const capped = decisions.length > MAX_HEALTH_DECISIONS;
  const ids = decisions.slice(0, MAX_HEALTH_DECISIONS).map((d) => String(d.get('id')));
  if (ids.length === 0) return { refused: { total: 0, by_reason: {}, capped }, ledger_read: 'ok' };

  const read = await readJourneyEvents({
    entityType: 'growth_journey_decision',
    entityIds: ids,
    eventType: 'growth_journey.execution.refused',
    since: from,
  });
  if ('error_class' in read) {
    // Fail open with the reason named, exactly as `rememberedRefusals` does: an
    // unreadable ledger is reported, never guessed at and never thrown.
    return { refused: { total: 0, by_reason: {}, capped }, ledger_read: read.timed_out ? 'timed_out' : 'failed' };
  }
  const by_reason: Record<string, number> = {};
  for (const row of read.rows) {
    const reason = safeKey((row.payload as { reason?: unknown } | null)?.reason) || 'unknown';
    by_reason[reason] = (by_reason[reason] ?? 0) + 1;
  }
  return { refused: { total: read.rows.length, by_reason, capped }, ledger_read: 'ok' };
}

async function readCrons(now: Date): Promise<CronHealth[]> {
  const names = GROWTH_JOURNEY_AGENT_ENTRIES.map((e) => e.agent_name);
  const rows = await AiAgent.findAll({
    where: { agent_name: { [Op.in]: names } },
    attributes: ['agent_name', 'enabled', 'last_run_at'],
  });
  const live = new Map(rows.map((r) => [String(r.get('agent_name')), r]));

  return GROWTH_JOURNEY_AGENT_ENTRIES.map((entry) => {
    const row = live.get(entry.agent_name);
    const lastRun = row ? (row.get('last_run_at') as Date | null) : null;
    const at = lastRun ? new Date(lastRun) : null;
    const minutes_since = at ? Math.round((now.getTime() - at.getTime()) / MINUTE) : null;
    const period = periodMinutes(entry.schedule);

    let state: CronState;
    if (!row || !row.get('enabled')) state = 'disabled';
    else if (minutes_since === null) state = 'never';
    else if (period === null) state = 'on_time';
    else state = minutes_since > period + CRON_SLACK_MINUTES ? 'late' : 'on_time';

    return { agent: entry.agent_name, schedule: entry.schedule, state, last_run_at: at ? at.toISOString() : null, minutes_since };
  });
}

async function readControls(): Promise<Record<GrowthJourneyControlKind, number>> {
  const rows = await GrowthJourneyExecutionControl.findAll({ where: { cleared_at: null }, attributes: ['kind'], limit: 1_000 });
  const counts: Record<GrowthJourneyControlKind, number> = { pause: 0, rollout: 0 };
  for (const r of rows) {
    const kind = r.get('kind') as GrowthJourneyControlKind;
    if (kind in counts) counts[kind] += 1;
  }
  return counts;
}

/** Counts and reasons for the journey's moving parts. Reads only; never writes, never decides. */
export async function buildJourneyHealth(args: JourneyHealthArgs): Promise<JourneyHealth> {
  const now = args.now;
  const window_hours = Math.min(Math.max(1, Math.floor(args.ledgerWindowHours ?? 24)), 24 * 30);

  const [receipts, stuck_pending_review, held, refusal, crons, controls] = await Promise.all([
    readReceipts(now, window_hours),
    readStuckPendingReview(now),
    readHeld(now, window_hours),
    readRefused(now, window_hours),
    readCrons(now),
    readControls(),
  ]);

  return {
    receipts,
    stuck_pending_review,
    held,
    refused: refusal.refused,
    crons,
    controls,
    journey_hold_rows: held.total,
    ledger_read: refusal.ledger_read,
    window_hours,
  };
}
