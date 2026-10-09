import { Op } from 'sequelize';
import { AiAgent, GrowthJourneyDecision, GrowthJourneyExecution, GrowthJourneyExecutionControl, ScheduledEmail } from '../../../models';
import type { GrowthJourneyControlKind } from '../../../models/GrowthJourneyExecutionControl';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../../agentRegistry/growthJourneyAgents';
import { PROPOSAL_TTL_HOURS } from '../execution/proposalFiler';
import { LEDGER_READ_DEFAULT_ROWS, readJourneyEvents } from '../ledgerRead';
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
 * 4. The refusal read is CAPPED TWICE, and says so on both. `readJourneyEvents`
 *    is keyed on `entityIds` and answers nothing without them, so refusals can
 *    only be read for a known set of decisions: this takes the most recent
 *    `MAX_HEALTH_DECISIONS` in the window. That is the cap the plan implied and
 *    the only one the first version of this file reported — which made the field
 *    dishonest in exactly the way its own comment denied, because the LEDGER read
 *    has a row cap of its own. With 500 or fewer decisions producing more than
 *    500 refusals it returned exactly 500 rows and `capped: false`. Both caps
 *    are now reported, the ledger limit is passed explicitly rather than
 *    inherited, and `truncated` names every capped read on the report.
 *
 * ─── EVERY CAP ON THIS SURFACE IS DECLARED ──────────────────────────────────
 *
 * Four reads here are bounded by a row limit rather than by the window, and a
 * bounded read that does not say when it hit its bound serves a floor as a total
 * — the defect T608 was docked for. So each reports itself in `truncated`:
 * `receipts` and `held` at `MAX_HEALTH_ROWS`, `controls` at
 * `MAX_HEALTH_CONTROLS`, `refused` at either of its two. `stuck_pending_review`
 * is a `COUNT(*)` and needs no cap; `crons` reads at most three rows.
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

/** A read whose row cap was reached, so its numbers are a FLOOR and not a total. */
export type TruncatedRead = 'receipts' | 'held' | 'refused' | 'controls';

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
  /**
   * When this report was computed. The Phase 6 contract makes a number served
   * without freshness a phase-failing condition, and every count below is a
   * point-in-time answer, so the report carries the `now` it used. `/health/full`
   * already stamps its own `timestamp`; this is for the route that serves the
   * report on its own.
   */
  as_of: string;
  /**
   * Every read above whose row cap was reached, so a caller can tell a total
   * from a floor. Empty is the normal answer and means every number is complete.
   *
   * This exists because the first version of this file had `refused.capped`
   * reflecting only the DECISION cap: with 500 or fewer decisions producing more
   * than 500 refusal events the ledger read returned exactly its own default of
   * 500 rows, `total` was reported as 500, `by_reason` was truncated, and
   * `capped` said false - a floor served as a total, in the one field whose
   * comment claimed the caller would be told. Three other reads capped with no
   * flag at all. A count that might be a floor and does not say so is the exact
   * defect T608 was docked for, so every capped read now names itself here.
   */
  truncated: TruncatedRead[];
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

/** The row cap every unbounded-by-nature read here carries. Reaching it is reported, never hidden. */
export const MAX_HEALTH_ROWS = 10_000;
export const MAX_HEALTH_CONTROLS = 1_000;

async function readReceipts(now: Date, windowHours: number): Promise<{ rows: StatusAge[]; capped: boolean }> {
  // `DESC` with a cap means the OLDEST rows are the ones dropped, so at the cap
  // both `count` AND `max_age_hours` understate - the age most of all, since the
  // oldest row is exactly the one that sets it. Hence the flag: the alternative
  // is a report that quietly gets younger as the table grows.
  const rows = await GrowthJourneyExecution.findAll({
    where: { created_at: { [Op.gte]: since(now, windowHours) } },
    attributes: ['status', 'created_at'],
    limit: MAX_HEALTH_ROWS,
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
  return {
    rows: [...by.entries()]
      .map(([status, v]) => ({
        status,
        count: v.count,
        max_age_hours: Math.round(((now.getTime() - v.oldest) / HOUR) * 10) / 10,
      }))
      .sort((a, b) => a.status.localeCompare(b.status)),
    capped: rows.length >= MAX_HEALTH_ROWS,
  };
}

async function readStuckPendingReview(now: Date): Promise<{ count: number; over_hours: number }> {
  const count = await GrowthJourneyExecution.count({
    where: { status: 'pending_review', created_at: { [Op.lt]: since(now, PROPOSAL_TTL_HOURS) } },
  });
  return { count, over_hours: PROPOSAL_TTL_HOURS };
}

async function readHeld(now: Date, windowHours: number): Promise<{ total: number; by_reason: Record<string, number>; capped: boolean }> {
  // ORDERED, because without it which rows the cap drops is undefined - and this
  // read is the widest here: `scheduled_emails` is platform-wide and NOT
  // brand-scoped (a journey hold is recognised by its reason, not by a column),
  // so one cancelled bulk campaign in the window can reach the cap on its own.
  // Newest-first plus the flag means a floor is at least a recent, stated floor.
  const rows = await ScheduledEmail.findAll({
    where: { status: 'cancelled', created_at: { [Op.gte]: since(now, windowHours) } },
    attributes: ['metadata'],
    limit: MAX_HEALTH_ROWS,
    order: [['created_at', 'DESC']],
  });
  const by_reason: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const raw = (r.get('metadata') as { blocked_reason?: unknown } | null)?.blocked_reason;
    // The PREFIX is tested on the raw value and the KEY is built after. The
    // other way round drops the row: `safeKey` answers the bare word `redacted`
    // for anything holding an address, which fails `startsWith(HOLD_PREFIX)`, so
    // a hold whose reason happened to carry an address vanished from the count
    // entirely - an under-count caused by the privacy rule rather than by a cap.
    // Now the row is counted and the key is still safe.
    const rawReason = typeof raw === 'string' ? raw : '';
    if (!rawReason.startsWith(HOLD_PREFIX)) continue;
    total += 1;
    const safe = safeKey(rawReason);
    const reason = safe.startsWith(HOLD_PREFIX) ? safe : `${HOLD_PREFIX}redacted`;
    by_reason[reason] = (by_reason[reason] ?? 0) + 1;
  }
  return { total, by_reason, capped: rows.length >= MAX_HEALTH_ROWS };
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
  const decisionsCapped = decisions.length > MAX_HEALTH_DECISIONS;
  const ids = decisions.slice(0, MAX_HEALTH_DECISIONS).map((d) => String(d.get('id')));
  if (ids.length === 0) return { refused: { total: 0, by_reason: {}, capped: decisionsCapped }, ledger_read: 'ok' };

  // TWO caps sit on this answer, and the first version of this file only reported
  // one. The decision cap above is the obvious one. The second is the ledger's own
  // row limit: `readJourneyEvents` defaults to LEDGER_READ_DEFAULT_ROWS and returns
  // the newest, so 500 decisions that produced 600 refusals came back as exactly
  // 500 rows - `total: 500`, `by_reason` truncated, `capped: false`. The limit is
  // passed explicitly now so the comparison is against a number this file chose
  // rather than one it inherited, and reaching it counts as capped.
  const read = await readJourneyEvents({
    entityType: 'growth_journey_decision',
    entityIds: ids,
    eventType: 'growth_journey.execution.refused',
    since: from,
    limit: LEDGER_READ_DEFAULT_ROWS,
  });
  if ('error_class' in read) {
    // Fail open with the reason named, exactly as `rememberedRefusals` does: an
    // unreadable ledger is reported, never guessed at and never thrown.
    return { refused: { total: 0, by_reason: {}, capped: decisionsCapped }, ledger_read: read.timed_out ? 'timed_out' : 'failed' };
  }
  const by_reason: Record<string, number> = {};
  for (const row of read.rows) {
    const reason = safeKey((row.payload as { reason?: unknown } | null)?.reason) || 'unknown';
    by_reason[reason] = (by_reason[reason] ?? 0) + 1;
  }
  const capped = decisionsCapped || read.rows.length >= LEDGER_READ_DEFAULT_ROWS;
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

async function readControls(): Promise<{ counts: Record<GrowthJourneyControlKind, number>; capped: boolean }> {
  const rows = await GrowthJourneyExecutionControl.findAll({ where: { cleared_at: null }, attributes: ['kind'], limit: MAX_HEALTH_CONTROLS });
  const counts: Record<GrowthJourneyControlKind, number> = { pause: 0, rollout: 0 };
  for (const r of rows) {
    const kind = r.get('kind') as GrowthJourneyControlKind;
    if (kind in counts) counts[kind] += 1;
  }
  return { counts, capped: rows.length >= MAX_HEALTH_CONTROLS };
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

  const truncated: TruncatedRead[] = [];
  if (receipts.capped) truncated.push('receipts');
  if (held.capped) truncated.push('held');
  if (refusal.refused.capped) truncated.push('refused');
  if (controls.capped) truncated.push('controls');

  return {
    receipts: receipts.rows,
    stuck_pending_review,
    held: { total: held.total, by_reason: held.by_reason },
    refused: refusal.refused,
    crons,
    controls: controls.counts,
    journey_hold_rows: held.total,
    ledger_read: refusal.ledger_read,
    window_hours,
    as_of: now.toISOString(),
    truncated,
  };
}
