import type { ExplorerGrowthFlags } from '../../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import { clearTestOverrideCache, evaluateSend } from '../../../communicationSafetyService';
import { resolveDecisionExecutionMode, withExecutionMode } from '../../decision/executionModeStamp';
import { loadDecisionContext } from '../../decision/loadDecisionContext';
import { decideForSubjectAndRecord, decisionRow, productionDeps, type DecideAndRecordArgs } from '../../decisionService';
import { applyExecutionApproval, type ReviewerIdentity } from '../../execution/approvalApply';
import { decisionViewOf } from '../../execution/decisionReads';
import { executeApproved, type ExecuteApprovedResult } from '../../execution/enrollmentAdapter';
import { planExecution, type PlanExecutionResult } from '../../execution/planExecution';
import { reconcileExecutions, type ReconcileSummary } from '../../execution/reconcileExecutions';
import { runExecutor, type ExecutorSummary } from '../../execution/runExecutor';
import { decideForSubject } from '../../governor/decideForSubject';
import type { JourneyCandidate, JourneyStrategy } from '../../governor/types';
import { brandRow } from './phase3Fixtures';
import type { HandoffFixture } from './phase4Fixtures';
import { anchorOf4 } from './phase4Harness';
import { clock, type Row } from './phase4Tables';
import { explorerFlags5, flags5, m3, m5, T5x, world } from './phase5Harness';

/**
 * T519 — the drivers: each step of the chain, called on the REAL module. This
 * file imports production modules, so a suite imports it AFTER its jest.mock
 * stanza (the models factory requires `phase5Harness`, which imports none).
 */

type DecisionRow = Row & { id: string; mode: string; selected_action: string | null; selected_channel: string | null; eligibility: { execution_mode: { mode: string; reason: string } } };

export interface DecideOptions {
  flags?: GrowthJourneyFlags;
  explorerFlags?: ExplorerGrowthFlags;
  asOf?: Date;
  trigger?: DecideAndRecordArgs['trigger'];
}

/** The real pipeline, end to end, for one fixture; throws unless a row was recorded. */
export async function decide(f: HandoffFixture, opts: DecideOptions = {}): Promise<{ row: DecisionRow; replayed: boolean }> {
  const r = await decideForSubjectAndRecord({
    anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: opts.trigger ?? 'nightly',
    flags: opts.flags ?? flags5(), explorerFlags: opts.explorerFlags ?? explorerFlags5(), asOf: opts.asOf ?? clock.now,
  });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  return { row: r.row as unknown as DecisionRow, replayed: r.replayed };
}

/** The pipeline, expecting a LIVE row: the ladder must have answered review or limited for the selected action's channel. */
export async function decideLive(f: HandoffFixture, opts: DecideOptions = {}): Promise<DecisionRow> {
  const { row } = await decide(f, opts);
  if (row.mode !== 'live') throw new Error(`${f.key}: decided ${row.mode} (${row.eligibility.execution_mode.reason}), selected ${row.selected_action}`);
  return row;
}

/**
 * The pipeline's own steps with the strategy's candidate list widened - the
 * loader, the governor (every gate, THE arbitration), the T507 stamp, the row,
 * the persist - so a subject "eligible for an email, an Ali outreach and a
 * handoff" (§16 I) is decided by the real arbiter over the real context, even
 * though no shipped strategy proposes Ali's note itself yet.
 */
export async function decideWithCandidates(f: HandoffFixture, extra: (ctxBrandId: string) => JourneyCandidate[], opts: DecideOptions = {}): Promise<{ row: DecisionRow; replayed: boolean; suppressed: Array<{ action_type: string; reason: string }> }> {
  const asOf = opts.asOf ?? clock.now;
  const flags = opts.flags ?? flags5();
  const loaded = await loadDecisionContext({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, asOf });
  if (loaded.status !== 'loaded') throw new Error(`${f.key}: ${loaded.status}`);
  const real = loaded.strategy;
  const widened: JourneyStrategy = { ...real, generate: (ctx) => [...real.generate(ctx), ...extra(ctx.brand_id)] };
  const outcome = await decideForSubject(loaded.ctx, widened, productionDeps(), flags);
  if (outcome.status === 'disabled') throw new Error('disabled');
  const stamp = await resolveDecisionExecutionMode({ ctx: loaded.ctx, decision: outcome.decision, flags, explorerFlags: opts.explorerFlags ?? explorerFlags5() });
  const attrs = withExecutionMode(decisionRow(loaded, outcome.decision, opts.trigger ?? 'nightly', []), stamp);
  let row: Row;
  let replayed = false;
  try {
    row = (await m3.decisionCreate(attrs)) as Row;
  } catch (err: unknown) {
    if ((err as { name?: string }).name !== 'SequelizeUniqueConstraintError') throw err;
    row = (await m3.decisionFindOne({ where: { idempotency_key: attrs.idempotency_key } })) as Row;
    replayed = true;
  }
  return { row: row as DecisionRow, replayed, suppressed: outcome.decision.suppressed.map((s) => ({ action_type: s.action_type, reason: s.reason })) };
}

export interface PlanOptions {
  flags?: GrowthJourneyFlags;
  explorerFlags?: ExplorerGrowthFlags;
  asOf?: Date;
}

/** T508's planner on one recorded decision row. */
export async function plan(row: Row, opts: PlanOptions = {}): Promise<PlanExecutionResult> {
  return planExecution({ decision: decisionViewOf(row as never), flags: opts.flags ?? flags5(), explorerFlags: opts.explorerFlags ?? explorerFlags5(), asOf: opts.asOf ?? clock.now, programKind: 'business' });
}

export const REVIEWER: ReviewerIdentity = { id: 'staff-1', email: 'staff@colaberry.com', role: 'admin' };

/** T509's approval with a reviewer whose scope the bridge grants for the receipt's tenant (a member of it, every brand). */
export async function approve(receiptId: string, admin: ReviewerIdentity | undefined = REVIEWER) {
  return applyExecutionApproval(receiptId, admin);
}

/** T510's adapter on one approved receipt, directly - the enrolment step. */
export async function enrol(receiptId: string, opts: PlanOptions = {}): Promise<ExecuteApprovedResult> {
  return executeApproved({ receiptId, flags: opts.flags ?? flags5(), explorerFlags: opts.explorerFlags ?? explorerFlags5(), asOf: opts.asOf ?? clock.now, programKind: 'business' });
}

/** T513's batch: plan, execute, reconcile. */
export async function run(opts: PlanOptions = {}): Promise<ExecutorSummary> {
  return runExecutor({ asOf: opts.asOf ?? clock.now, flags: opts.flags ?? flags5(), explorerFlags: opts.explorerFlags ?? explorerFlags5() });
}

/** T512's reconciler alone. */
export async function reconcile(asOf: Date = clock.now): Promise<ReconcileSummary> {
  return reconcileExecutions({ asOf });
}

export interface SendStepResult {
  sent: string[];
  blocked: Array<{ id: string; reason: string }>;
}

export interface SendStepOptions {
  /** Which pending rows this pass takes (the scheduler's own due-time filter, stood in for); default every pending row. */
  only?: (row: Row) => boolean;
}

/**
 * The scheduler's send step, as `schedulerService` performs it for each pending
 * row: the REAL `evaluateSend` (T511's hold inside it), then the MOCKED
 * transport, and the row's status as the scheduler writes it - `sent` with
 * `sent_at`, or `cancelled` with `metadata.blocked_reason`.
 */
export async function sendStep(asOf: Date = clock.now, opts: SendStepOptions = {}): Promise<SendStepResult> {
  clearTestOverrideCache();
  const out: SendStepResult = { sent: [], blocked: [] };
  const pending = (await T5x.scheduled.findAll({ where: { status: 'pending' }, order: [['created_at', 'ASC']] })).filter((r) => (opts.only ? opts.only(r) : true));
  for (const row of pending) {
    const leadId = Number(row.lead_id);
    const lead = world.leads.get(leadId);
    const decision = await evaluateSend({ leadId, campaignId: String(row.campaign_id), channel: 'email', toEmail: typeof lead?.email === 'string' ? lead.email : undefined, source: 'scheduler' });
    if (!decision.allowed) {
      await T5x.scheduled.update({ status: 'cancelled', metadata: { ...((row.metadata as Record<string, unknown> | null) ?? {}), blocked_reason: decision.blockedReason } }, { where: { id: row.id } });
      out.blocked.push({ id: String(row.id), reason: String(decision.blockedReason) });
      continue;
    }
    await m5.sendMail({ to: decision.redirect?.email ?? lead?.email, campaignId: row.campaign_id, scheduledEmailId: row.id });
    await T5x.scheduled.update({ status: 'sent', sent_at: asOf }, { where: { id: row.id } });
    out.sent.push(String(row.id));
  }
  return out;
}
