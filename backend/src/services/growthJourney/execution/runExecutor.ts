import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { env } from '../../../config/env';
import type { ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { EventLedger, GrowthJourneyExecution, JourneyProgram } from '../../../models';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import { executionChannelOf, LIVE_MODES } from '../decision/executionModeStamp';
import type { JourneyProgramKind } from '../governor/types';
import { readLiveDecisionViews } from './decisionReads';
import { executeApproved, type ExecuteApprovedResult } from './enrollmentAdapter';
import { MAX_DECISION_AGE_HOURS, type ExecutionDecisionView } from './planChecks';
import { planExecution } from './planExecution';
import { APPROVED_TTL_HOURS, reconcileExecutions, type ReconcileSummary } from './reconcileExecutions';
import { resolveExecutionHold, resolveExecutionMode, type ExecutionChannel } from './resolveExecutionMode';

/**
 * The executor batch: `GrowthJourneyExecutor` (Phase 5 T513), shipped PAUSED.
 *
 * ─── WHAT ONE RUN DOES ──────────────────────────────────────────────────────
 *
 * Three stages, each bounded, each its own failure domain, in this order:
 *
 *   plan       for every ACTIVE programme, the brand's `live` decisions of the
 *              last MAX_DECISION_AGE_HOURS that have no receipt yet, oldest
 *              first, at most EXECUTOR_LIMITS.plan across the run, each through
 *              T508's planner (exactly once by `decision_id`; a refusal is a
 *              count by reason, never an error). Two things are settled BEFORE
 *              the planner is called, so a decision that cannot be released is
 *              not fed to it every quarter hour: T504's ladder is asked per
 *              candidate (a `not_live` answer - no rollout, not in the cohort,
 *              a pause - is a count and nothing else, and clears the moment an
 *              operator's control changes), and the planner's own refusals are
 *              remembered for the window by reading the refusal rows it wrote,
 *              bounded to this run's candidates. That memory fails OPEN: if the
 *              ledger cannot be read the decision is planned again, and the
 *              receipt's unique index still says exactly once;
 *   execute    at most EXECUTOR_LIMITS.execute `approved` receipts on the
 *              channels this batch may enrol, approved inside the TTL (an older
 *              one is the reconciler's to expire, never this stage's to fire),
 *              oldest approval first. T504's hold
 *              (flags, kill switch, pauses) is asked BEFORE the claim, so a held
 *              receipt is skipped in place instead of being claimed, returned and
 *              claimed again every quarter hour; a clean one goes through T510's
 *              adapter, the one file that enrols;
 *   reconcile  T512's pass over at most EXECUTOR_LIMITS.reconcile open receipts.
 *
 * A stage that throws is one line with its error class and one entry in the
 * summary; the next stage still runs. Nothing loops: a run is three bounded
 * passes and a return, and the next run is the cron's.
 *
 * ─── THREE GATES BEFORE A SINGLE READ ───────────────────────────────────────
 *
 * The registry row is `enabled: false` (`instrumentCronJob` skips it), the
 * master flag is off, and `journeyExecution` is off; this function checks the
 * last two itself and answers `skipped` before any model read. Ali outreach is
 * REVIEW-only and executes through its own path (T516); its receipts are never
 * claimed here. SMS and voice have no receipts to claim.
 *
 * The summary is counts and reason strings - no subject ref, no address. Its
 * `context` goes through `redactForLogs` like every other line in this tree;
 * the envelope (the event, the correlation id, the timing) does not, because
 * the redactor's phone pattern rewrites the digits of one v4 UUID in sixty and
 * a run line without its correlation id is a run that cannot be traced.
 */

export const EXECUTOR_AGENT = 'GrowthJourneyExecutor';
/** Every 15 minutes, 14:00-22:59 UTC, Monday to Friday: business hours Central, when a human is there to read the review queue. */
export const EXECUTOR_SCHEDULE = '*/15 14-22 * * 1-5';
export const EXECUTOR_LIMITS = Object.freeze({ plan: 200, execute: 50, reconcile: 500 });
/** The channels this batch enrols; Ali outreach is REVIEW-only and never claimed here. */
export const EXECUTOR_CHANNELS: readonly ExecutionChannel[] = ['email', 'in_app'];
/** The most `live` decisions read per brand for one run's window; a window this deep is logged, not looped. */
export const PLAN_WINDOW_CAP = 2000;
const HOUR = 3_600_000;

export interface RunExecutorArgs {
  asOf?: Date;
  flags?: GrowthJourneyFlags;
  explorerFlags?: ExplorerGrowthFlags;
  limits?: Partial<typeof EXECUTOR_LIMITS>;
}

export interface ExecutorStageError {
  stage: 'plan' | 'execute' | 'reconcile';
  error_class: string;
}

export interface ExecutorSummary {
  status: 'skipped' | 'ran';
  reason?: string;
  correlation_id: string;
  plan: { programs: number; candidates: number; planned: number; replayed: number; refused: Record<string, number>; not_live: Record<string, number>; remembered: number; errors: number; window_capped: number };
  execute: { candidates: number; held: Record<string, number>; enrolled: number; not_claimed: number; blocked: number; cancelled: number; failed: number; errors: number };
  reconcile: ReconcileSummary | null;
  stage_errors: ExecutorStageError[];
}

interface ProgramRow { id: string; brand_id: string; kind: JourneyProgramKind }
interface ReceiptView { id: string; tenant_id: string; brand_id: string; program_id: string | null; channel: ExecutionChannel; subject_ref: string; lead_id: number | null }

const bump = (m: Record<string, number>, k: string): void => { m[k] = (m[k] ?? 0) + 1; };
type Envelope = { correlation_id: string; outcome: 'success' | 'failure' | 'partial'; error_class?: string; duration_ms?: number };
/** The envelope is written as-is; only `context` is redacted, so a correlation id is never rewritten by the redactor. */
const log = (level: 'info' | 'warn' | 'error', event: string, envelope: Envelope, context: Record<string, unknown>): void => {
  const head = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'growth-journey', event, ...envelope });
  const line = `${head.slice(0, -1)},"context":${redactForLogs(JSON.stringify(context))}}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
};

function emptySummary(correlation_id: string): ExecutorSummary {
  return {
    status: 'ran', correlation_id,
    plan: { programs: 0, candidates: 0, planned: 0, replayed: 0, refused: {}, not_live: {}, remembered: 0, errors: 0, window_capped: 0 },
    execute: { candidates: 0, held: {}, enrolled: 0, not_claimed: 0, blocked: 0, cancelled: 0, failed: 0, errors: 0 },
    reconcile: null,
    stage_errors: [],
  };
}

async function activePrograms(): Promise<ProgramRow[]> {
  const rows = await JourneyProgram.findAll({ where: { status: 'active' }, attributes: ['id', 'brand_id', 'kind', 'slug'], order: [['slug', 'ASC']] });
  return rows.map((p) => ({ id: String(p.get('id')), brand_id: String(p.get('brand_id')), kind: p.get('kind') as JourneyProgramKind }));
}

/** The decision ids the planner refused inside the window, among `ids`; on a read error, none (fail open, logged). */
async function rememberedRefusals(ids: string[], since: Date, correlation_id: string): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const rows = await EventLedger.findAll({
      where: { event_type: 'growth_journey.execution.refused', entity_type: 'growth_journey_decision', entity_id: { [Op.in]: ids }, created_at: { [Op.gte]: since } },
      attributes: ['entity_id'],
    });
    return new Set(rows.map((r) => String(r.get('entity_id'))));
  } catch (err: unknown) {
    log('warn', 'growth_journey.executor.refusal_memory_unavailable', { correlation_id, outcome: 'partial', error_class: classifyError(err) }, { candidates: ids.length });
    return new Set();
  }
}

type Candidate = { decision: ExecutionDecisionView; program: ProgramRow };

/** The ladder's answer for one decision, asked before the planner: only a live answer is worth a planner call. */
async function ladderReleases(decision: ExecutionDecisionView, asOf: Date, flags: GrowthJourneyFlags, explorerFlags: ExplorerGrowthFlags): Promise<string | null> {
  // The planner names these refusals itself; they are not the ladder's.
  if (!decision.selected_action || !decision.program_id) return null;
  const target = executionChannelOf({ selected_action: decision.selected_action, selected_channel: decision.selected_channel as never });
  if (!target.channel) return null;
  const mode = await resolveExecutionMode({ tenantId: decision.tenant_id, brandId: decision.brand_id, programId: decision.program_id, channel: target.channel, subjectRef: decision.subject_ref, leadId: decision.lead_id, asOf, flags, explorerFlags });
  return LIVE_MODES.includes(mode.mode) ? null : mode.reason;
}

async function planStage(programs: ProgramRow[], asOf: Date, flags: GrowthJourneyFlags, explorerFlags: ExplorerGrowthFlags, limit: number, s: ExecutorSummary): Promise<void> {
  const since = new Date(asOf.getTime() - MAX_DECISION_AGE_HOURS * HOUR);
  // A receipt is born after its decision, so every receipt for a decision in the window is in the window too.
  const receipts = await GrowthJourneyExecution.findAll({ where: { created_at: { [Op.gte]: since } }, attributes: ['decision_id'] });
  const planned = new Set(receipts.map((r) => String(r.get('decision_id'))));
  // 1. The candidates: unplanned, released by the ladder, at most `limit` across the run, oldest first per programme.
  const candidates: Candidate[] = [];
  for (const program of programs) {
    if (candidates.length >= limit) break;
    const decisions = await readLiveDecisionViews({ brandId: program.brand_id, since, limit: PLAN_WINDOW_CAP });
    if (decisions.length >= PLAN_WINDOW_CAP) s.plan.window_capped += 1;
    for (const decision of decisions) {
      if (candidates.length >= limit) break;
      if (planned.has(decision.id)) continue;
      const notLive = await ladderReleases(decision, asOf, flags, explorerFlags);
      if (notLive) {
        bump(s.plan.not_live, notLive);
        continue;
      }
      candidates.push({ decision, program });
    }
  }
  // 2. The planner's own refusals in the window are remembered; a refused decision is not fed to it again.
  const remembered = await rememberedRefusals(candidates.map((c) => c.decision.id), since, s.correlation_id);
  // 3. The planner, exactly once per decision.
  for (const { decision, program } of candidates) {
    if (remembered.has(decision.id)) {
      s.plan.remembered += 1;
      continue;
    }
    s.plan.candidates += 1;
    try {
      const r = await planExecution({ decision, flags, explorerFlags, asOf, programKind: program.kind });
      if (r.status === 'planned') s.plan.planned += 1;
      else if (r.status === 'replayed') s.plan.replayed += 1;
      else bump(s.plan.refused, r.reason);
    } catch (err: unknown) {
      s.plan.errors += 1;
      log('error', 'growth_journey.executor.plan_failed', { correlation_id: s.correlation_id, outcome: 'failure', error_class: classifyError(err) }, { decision_id: decision.id, brand_id: program.brand_id });
    }
  }
}

async function executeStage(programs: ProgramRow[], asOf: Date, flags: GrowthJourneyFlags, explorerFlags: ExplorerGrowthFlags, limit: number, s: ExecutorSummary): Promise<void> {
  const kindOf = new Map(programs.map((p) => [p.id, p.kind]));
  const rows = await GrowthJourneyExecution.findAll({
    where: { status: 'approved', channel: { [Op.in]: [...EXECUTOR_CHANNELS] }, approved_at: { [Op.gte]: new Date(asOf.getTime() - APPROVED_TTL_HOURS * HOUR) } },
    order: [['approved_at', 'ASC']],
    limit,
  });
  s.execute.candidates = rows.length;
  for (const row of rows) {
    const r: ReceiptView = {
      id: String(row.get('id')), tenant_id: String(row.get('tenant_id')), brand_id: String(row.get('brand_id')), program_id: (row.get('program_id') as string | null) ?? null,
      channel: row.get('channel') as ExecutionChannel, subject_ref: String(row.get('subject_ref')), lead_id: (row.get('lead_id') as number | null) ?? null,
    };
    try {
      if (r.program_id) {
        const hold = await resolveExecutionHold({ tenantId: r.tenant_id, brandId: r.brand_id, programId: r.program_id, channel: r.channel, subjectRef: r.subject_ref, leadId: r.lead_id, asOf, flags, explorerFlags });
        if (hold.held) {
          bump(s.execute.held, hold.reason ?? 'held');
          continue;
        }
      }
      const result: ExecuteApprovedResult = await executeApproved({ receiptId: r.id, flags, explorerFlags, asOf, programKind: r.program_id ? kindOf.get(r.program_id) : undefined });
      s.execute[result.status] += 1;
    } catch (err: unknown) {
      s.execute.errors += 1;
      log('error', 'growth_journey.executor.execute_failed', { correlation_id: s.correlation_id, outcome: 'failure', error_class: classifyError(err) }, { execution_id: r.id, channel: r.channel });
    }
  }
}

export async function runExecutor(args: RunExecutorArgs = {}): Promise<ExecutorSummary> {
  const correlation_id = randomUUID();
  const flags = args.flags ?? env.growthJourney;
  const explorerFlags = args.explorerFlags ?? env.explorerGrowth;
  if (!isGrowthJourneyCapabilityEnabled('journeyExecution', flags)) {
    const reason = flags.growthJourneyEnabled ? 'journeyExecution_off' : 'growthJourney_off';
    log('info', 'growth_journey_executor_skipped', { correlation_id, outcome: 'success' }, { reason });
    return { ...emptySummary(correlation_id), status: 'skipped', reason };
  }
  const asOf = args.asOf ?? new Date();
  const limits = { ...EXECUTOR_LIMITS, ...(args.limits ?? {}) };
  const started = Date.now();
  const s = emptySummary(correlation_id);

  let programs: ProgramRow[] = [];
  const stage = async (name: ExecutorStageError['stage'], body: () => Promise<void>): Promise<void> => {
    try {
      await body();
    } catch (err: unknown) {
      const error_class = classifyError(err);
      s.stage_errors.push({ stage: name, error_class });
      log('error', 'growth_journey.executor.stage_failed', { correlation_id, outcome: 'failure', error_class }, { stage: name });
    }
  };
  await stage('plan', async () => {
    programs = await activePrograms();
    s.plan.programs = programs.length;
    await planStage(programs, asOf, flags, explorerFlags, limits.plan, s);
  });
  await stage('execute', () => executeStage(programs, asOf, flags, explorerFlags, limits.execute, s));
  await stage('reconcile', async () => {
    s.reconcile = await reconcileExecutions({ asOf, limit: limits.reconcile });
  });

  log(s.stage_errors.length ? 'warn' : 'info', 'growth_journey.executor.run', { correlation_id, duration_ms: Date.now() - started, outcome: s.stage_errors.length ? 'partial' : 'success' }, {
    plan: s.plan, execute: s.execute, reconcile: s.reconcile, stage_errors: s.stage_errors,
  });
  return s;
}
