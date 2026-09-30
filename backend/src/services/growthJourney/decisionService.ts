import { GrowthJourneyClassification, GrowthJourneyDecision } from '../../models';
import type { GrowthJourneyDecisionAttributes } from '../../models/GrowthJourneyDecision';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import type { ExplorerGrowthFlags } from '../../config/explorerGrowthFlags';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { isUniqueViolation } from '../../utils/uniqueViolation';
import { computeIdempotencyKey } from '../inboxCase/textNormalization';
import { stableJson } from './classificationService';
import { recordJourneyEvent } from './ledger';
import { loadDecisionContext, type LoadedDecisionContext } from './decision/loadDecisionContext';
import { resolveDecisionExecutionMode, withExecutionMode } from './decision/executionModeStamp';
import { evaluateFreshness } from '../explorerGrowth/governor/freshness';
import { decideForSubject } from './governor/decideForSubject';
import type { DecideDeps, JourneyCandidate, JourneyDecision, JourneySubjectContext } from './governor/types';
import { resolveJourneyContent } from './journeyContent';
import { assertOfferAllowed, resolveOfferEligibility } from './offerEligibility';
import { upsertProfile, type UpsertProfileResult } from './profileService';
import { materializeHandoffs, type MaterializeResult } from './handoffs/handoffService';
import type { DecisionRowView } from './handoffs/types';
import type { SubjectAnchor, UnresolvedReason } from './subjectResolver';

/**
 * The shadow decision writer (§7.3, §8 Layer 0; Phase 3 T311).
 *
 * ─── ONE ROW, ONCE, AND NOTHING ELSE ────────────────────────────────────────
 *
 * `decideForSubjectAndRecord` loads the context (read-only), writes the
 * profile projection (T307's one mutable write), runs T303's pipeline with the
 * brand's strategy, and writes ONE `growth_journey_decisions` row keyed on
 * `[subject_ref, brand_id, trigger, input_hash, ruleset_version,
 * model_version]`. The same subject with the same inputs lands on the existing
 * row (`replayed: true`); a changed input is a new row and the old one is
 * untouched, because the table is append-only and nothing here updates it.
 *
 * `mode` is `'shadow'`, `executed` is `false`, `execution_receipt` is `null`
 * — for every row this phase writes. This module imports no mailer, no queue,
 * no campaign engine and no model client; the no-send scanner walks it.
 *
 * ─── THE GATE IS THE FIRST LINE ─────────────────────────────────────────────
 *
 * `journeyDecisions` off — or the master off — returns `disabled` before a
 * single query. The pipeline checks the same flag again, which is cheap and
 * deliberate: a caller that reached the pipeline by another route still cannot
 * decide with the flag off.
 *
 * ─── EVERY §7.3 FIELD IS ON THE ROW, OR IS EXPLICITLY NULL / UNKNOWN ────────
 *
 * All candidates; eligibility and policy results (the winner's eligibility
 * decision, the programme's status, and every generator that declined and
 * why); score and state evidence; content and brand eligibility (the gaps, the
 * selected content); recent contacts and cooldowns (the whole contact
 * evidence); human conversation and sales capacity (`'unknown'`, honestly);
 * the selected action; every suppressed action with its reason; the ruleset
 * and model versions; whether AI participated (never, this phase); and the
 * execution receipt (null). A test asserts the row's keys by set equality.
 *
 * ─── THE INPUT HASH IS OVER DISCRETE FACTS ──────────────────────────────────
 *
 * State, overlays, the classification, the scores' values and gaps, each
 * channel's eligibility and reason, the contact count, the two unknowns, the
 * stops, the learner facts — AND the pipeline's own step-1 verdict: the
 * freshness result (fresh, or its named reason) and which lookups were
 * unavailable. NOT `hours_since_last_contact`, which changes every minute and
 * would make every run a "changed input". A new contact IS a change (the count
 * moves); the clock alone is not.
 *
 * The verdict and the unavailable list were missing from the first draft, and
 * T311's verifier showed what that does: a subject refused `freshness:stale`
 * on night one, rescored upstream with unchanged facts, gets the SAME key on
 * night two — the unique index refuses the insert and the writer hands back
 * the stale refusal as a replay. A refusal whose reason has since cleared is a
 * different decision, and it gets its own row.
 */

export type DecisionTrigger = 'nightly' | 'reply' | 'form' | 'manual' | 'replay' | 'dry_run';

export interface DecideAndRecordArgs {
  anchor: SubjectAnchor;
  brandId: string;
  trigger: DecisionTrigger;
  flags: GrowthJourneyFlags;
  /** T507: the Explorer flag family T504's ladder also reads. Defaults to the process's own. */
  explorerFlags?: ExplorerGrowthFlags;
  asOf?: Date;
  /** T414: `'ranked_pass'` leaves the handoffs for the caller's pass over the whole queue (the batch runner's mode). */
  handoffAssignment?: 'now' | 'ranked_pass';
}

export type DecideAndRecordResult =
  | { status: 'disabled' }
  | { status: 'unresolved'; reason: UnresolvedReason }
  | { status: 'no_brand' | 'no_program'; brandId: string }
  | {
      status: 'recorded';
      row: GrowthJourneyDecision;
      replayed: boolean;
      decision: JourneyDecision;
      profile: UpsertProfileResult | null;
      unavailable: string[];
      /** T404: what the handoff writer did with the row - `disabled` while the flag is off. */
      handoffs: MaterializeResult;
    };

export const SHADOW_MODE = 'shadow' as const;
/** No model participates in a Phase 3 decision. Recorded on every row so the field is never silently absent. */
export const MODEL_VERSION: string | null = null;

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields })));
}

/** The pipeline's production dependencies: the real offer gate, T304's evidence re-shaped for the contact policy, T305's content gate. */
export function productionDeps(): DecideDeps {
  return {
    assertOfferAllowed: (args) => assertOfferAllowed(args),
    contactPolicyFor: (candidate: JourneyCandidate, ctx: JourneySubjectContext) => {
      const ch = candidate.channel === 'none' ? null : ctx.contact.channels[candidate.channel];
      return {
        channelEligible: ch?.eligible === true,
        channelReason: ch?.reason,
        consent: {
          verdict: ch?.eligible === true ? 'allow' : 'block',
          reason: ch?.reason ?? 'no_channel',
          // A record backed the verdict only when the consent evaluator answered it.
          hasRecord: ch?.evaluator === 'consent',
        },
        recentContactCount: ctx.contact.recent_contact_count,
        hoursSinceLastContact: ctx.contact.hours_since_last_contact,
      };
    },
    resolveContent: (candidate, ctx) => resolveJourneyContent(candidate, ctx),
  };
}

/**
 * The discrete facts a decision rests on. Same facts, same hash, same row.
 *
 * `unavailable` is the loader's list of lookups that failed: a decision made
 * without the lead row is a different decision from one made with it, and must
 * not shadow it once the row can be read again.
 */
export function decisionInputHash(ctx: JourneySubjectContext, unavailable: readonly string[] = []): string {
  const channels = Object.fromEntries(
    Object.entries(ctx.contact.channels).map(([k, v]) => [k, { eligible: v.eligible, reason: v.reason }]),
  );
  // Five discrete values and no clock: the verdict, not the timestamps.
  const freshness = evaluateFreshness(ctx.freshness, ctx.asOf);
  return stableJson({
    freshness: freshness.fresh ? 'fresh' : freshness.reason,
    unavailable: [...unavailable].sort(),
    state: ctx.state,
    overlays: [...ctx.overlays].sort(),
    classification: ctx.classification,
    scores: { summary: ctx.scores.summary, gaps: ctx.scores.gaps, values: ctx.scores.dimensions.map((d) => [d.key, d.value]) },
    contact: {
      channels,
      recent_contact_count: ctx.contact.recent_contact_count,
      human_conversation: ctx.contact.human_conversation,
      sales_capacity: ctx.contact.sales_capacity,
      failed_closed: ctx.contact.failed_closed,
    },
    hardStop: ctx.hardStop,
    program_status: ctx.program_status,
    learner: ctx.learner
      ? { primary_state: ctx.learner.primary_state, overlays: [...ctx.learner.overlays].sort(), scores: ctx.learner.scores }
      : null,
    // T506: a human's approval of a Layer 2 flow is a fact the decision rests on - the WAIT decided before Ali
    // approved the flow must not shadow the SEND decided after it. Present only when a flow IS approved, so every
    // key computed without one (all of them, today) is unchanged.
    ...(ctx.approvedFlows?.length ? { approved_flows: [...ctx.approvedFlows].sort() } : {}),
  });
}

/** UTC day key, as Explorer's decisions use. */
export const decisionDate = (d: Date): string => d.toISOString().slice(0, 10);

/** The row for one decided outcome. Pure, so the shape is testable without a database. */
export function decisionRow(
  loaded: LoadedDecisionContext,
  decision: JourneyDecision,
  trigger: DecisionTrigger,
  notEmitted: unknown[],
): GrowthJourneyDecisionAttributes {
  const { ctx } = loaded;
  return {
    tenant_id: ctx.tenant_id,
    brand_id: ctx.brand_id,
    program_id: ctx.program_id,
    subject_ref: ctx.subject_ref,
    lead_id: ctx.lead_id,
    enrollment_id: ctx.enrollment_id,
    classification_id: ctx.classification?.classification_id ?? null,
    trigger,
    decision_date: decisionDate(ctx.asOf),
    mode: SHADOW_MODE,
    selected_action: decision.selected_action,
    selected_path: decision.selected_path,
    selected_channel: decision.selected_channel,
    selected_content: decision.selected_content,
    candidates: decision.candidates,
    suppressed: decision.suppressed,
    deferred_actions: decision.deferred_actions,
    eligibility: {
      program_status: ctx.program_status,
      program_active: ctx.program_status === 'active',
      offer: decision.eligibility,
      not_emitted: notEmitted,
      inputs_unavailable: loaded.unavailable,
    },
    scores: { dimensions: ctx.scores.dimensions, summary: ctx.scores.summary, available: ctx.scores.available, computed_at: ctx.scores.computed_at },
    score_gaps: ctx.scores.gaps,
    state_at_decision: ctx.state,
    overlays_at_decision: ctx.overlays,
    contact_evidence: ctx.contact as unknown as Record<string, unknown>,
    human_conversation: ctx.contact.human_conversation,
    sales_capacity: ctx.contact.sales_capacity,
    content_gaps: decision.content_gaps,
    reason: decision.reason,
    requires_human_review: decision.requires_human_review,
    ai_involved: decision.ai_involved,
    model_version: decision.model_version ?? MODEL_VERSION,
    ruleset_version: decision.ruleset_version,
    executed: false,
    execution_receipt: null,
    decided_by: `governor:${decision.ruleset_version}`,
    idempotency_key: computeIdempotencyKey([
      ctx.subject_ref,
      ctx.brand_id,
      trigger,
      decisionInputHash(ctx, loaded.unavailable),
      decision.ruleset_version,
      decision.model_version ?? MODEL_VERSION ?? 'none',
    ]),
  };
}

/** Append the row; a replay of the same key lands on the existing row. Never an update. */
async function persistDecision(row: GrowthJourneyDecisionAttributes): Promise<{ row: GrowthJourneyDecision; replayed: boolean }> {
  try {
    const created = await GrowthJourneyDecision.create(row);
    // T410: one ledger row per decision written - the summary (what was chosen and why), never the candidate blob.
    await recordJourneyEvent('growth_journey.decision.recorded', 'growth_journey_decision', created.id, { tenant_id: row.tenant_id, brand_id: row.brand_id }, {
      subject_ref: row.subject_ref, lead_id: row.lead_id, enrollment_id: row.enrollment_id, program_id: row.program_id, classification_id: row.classification_id,
      trigger: row.trigger, decision_date: row.decision_date, mode: row.mode, selected_action: row.selected_action, selected_path: row.selected_path, selected_channel: row.selected_channel,
      state_at_decision: row.state_at_decision, requires_human_review: row.requires_human_review, ai_involved: row.ai_involved, executed: row.executed,
    }, row.decided_by);
    return { row: created, replayed: false };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await GrowthJourneyDecision.findOne({ where: { idempotency_key: row.idempotency_key } });
    if (!existing) throw err;
    return { row: existing, replayed: true };
  }
}

/**
 * T404: hand the PERSISTED row to the handoff writer as plain data. The writer
 * never imports the decision model (it updates the mutable handoff row and the
 * append-only guard would refuse the pair), so the view is built here. Gated on
 * `journeyHandoffs` inside the writer; a failure is logged, never fatal - the
 * decision is already recorded and a handoff that did not materialise is a
 * replay away.
 */
/**
 * T414: the packet's path is a family the BRAND may offer, or nothing. The selected path passed the
 * pipeline's offer gate with its candidate; the classification's family, the fallback, had not - an AI
 * Flotation subject whose classification named business_training (a data defect, or an override)
 * reached the solution architect with business-training talking points in its packet. The same gate
 * the pipeline asks decides here; a refused family becomes a named gap, never the path.
 */
async function packetPathFor(row: GrowthJourneyDecision, loaded: LoadedDecisionContext, asOf: Date): Promise<{ path: string | null; path_refused: string | null }> {
  if (row.selected_path) return { path: row.selected_path, path_refused: null };
  const family = loaded.ctx.classification?.primary_path ?? null;
  if (!family) return { path: null, path_refused: null };
  const gate = await resolveOfferEligibility({ brandId: loaded.ctx.brand_id, offerFamily: family, at: asOf });
  return gate.allowed ? { path: family, path_refused: null } : { path: null, path_refused: `${family}:${gate.reason}` };
}

async function handoffsFor(row: GrowthJourneyDecision, loaded: LoadedDecisionContext, flags: GrowthJourneyFlags, asOf: Date, assignment?: 'now' | 'ranked_pass'): Promise<MaterializeResult> {
  const view: DecisionRowView = {
    id: row.id, tenant_id: row.tenant_id, brand_id: row.brand_id, program_id: row.program_id, subject_ref: row.subject_ref,
    lead_id: row.lead_id, enrollment_id: row.enrollment_id, classification_id: row.classification_id, decision_date: row.decision_date,
    selected_action: row.selected_action, selected_path: row.selected_path, state_at_decision: row.state_at_decision,
    overlays_at_decision: row.overlays_at_decision ?? [], scores: row.scores, score_gaps: row.score_gaps ?? [],
    contact_evidence: row.contact_evidence, human_conversation: row.human_conversation, sales_capacity: row.sales_capacity,
    deferred_actions: row.deferred_actions ?? [], requires_human_review: row.requires_human_review, reason: row.reason,
    ruleset_version: row.ruleset_version, created_at: row.created_at,
  };
  const refs = {
    tenant_id: loaded.ctx.tenant_id, brand_id: loaded.ctx.brand_id, brand_slug: loaded.ctx.brand_slug,
    program: loaded.ctx.program_id ? { id: loaded.ctx.program_id, slug: loaded.ctx.program_slug ?? '', kind: loaded.ctx.program_kind } : null,
    subject_ref: loaded.ctx.subject_ref, lead_id: loaded.ctx.lead_id, enrollment_id: loaded.ctx.enrollment_id,
  };
  try {
    // The gate is asked only when a handoff will actually be written. If this predicate ever misses a
    // trigger the writer knows, the packet goes out with NO path - the safe side, never a refused family.
    const asks = view.requires_human_review || view.deferred_actions.some((d) => (d as { would?: unknown }).would === 'create_handoff');
    const { path, path_refused } = asks && isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags) ? await packetPathFor(row, loaded, asOf) : { path: null, path_refused: null };
    return await materializeHandoffs({ decision: view, refs: { ...refs, path, path_refused }, flags, asOf, assignment });
  } catch (err: unknown) {
    log('growth_journey.handoff.materialize_failed', { decision_id: row.id, subject_ref: row.subject_ref, brand_id: row.brand_id, error_class: classifyError(err) });
    return { status: 'none', reason: `materialize_failed:${classifyError(err)}` };
  }
}

/** What each generator declined to propose, and why - the strategies that report it expose `generateWithReport`. */
function notEmittedOf(loaded: LoadedDecisionContext): unknown[] {
  const s = loaded.strategy as { generateWithReport?: (ctx: JourneySubjectContext) => { not_emitted: unknown[] } };
  if (typeof s.generateWithReport !== 'function') return [];
  try {
    return s.generateWithReport(loaded.ctx).not_emitted;
  } catch (err: unknown) {
    // The decision itself did not depend on this; an absent report is recorded
    // as absent - and logged, because a swallowed failure is the one thing a
    // reviewer of the row cannot see.
    log('growth_journey.decision.not_emitted_report_failed', { subject_ref: loaded.ctx.subject_ref, brand_id: loaded.ctx.brand_id, error_class: classifyError(err) });
    return [];
  }
}

export async function decideForSubjectAndRecord(args: DecideAndRecordArgs): Promise<DecideAndRecordResult> {
  if (!isGrowthJourneyCapabilityEnabled('journeyDecisions', args.flags)) return { status: 'disabled' };
  const asOf = args.asOf ?? new Date();

  const loaded = await loadDecisionContext({ anchor: args.anchor, brandId: args.brandId, asOf });
  if (loaded.status !== 'loaded') return loaded;

  // T307's one mutable write, only where a growth-journey lifecycle actually ran.
  let profile: UpsertProfileResult | null = null;
  if (loaded.lifecycle.projected) {
    profile = await upsertProfile({
      tenantId: loaded.ctx.tenant_id,
      brandId: loaded.ctx.brand_id,
      programId: loaded.ctx.program_id,
      subjectRef: loaded.ctx.subject_ref,
      leadId: loaded.ctx.lead_id,
      enrollmentId: loaded.ctx.enrollment_id,
      state: loaded.lifecycle.state,
      stateEnteredAt: loaded.lifecycle.stateEnteredAt,
      overlays: loaded.lifecycle.overlays,
      scores: loaded.ctx.scores,
      evidence: loaded.lifecycle.evidence,
      source: `decision:${args.trigger}`,
      asOf,
    });
  }

  const outcome = await decideForSubject(loaded.ctx, loaded.strategy, productionDeps(), args.flags);
  if (outcome.status === 'disabled') return { status: 'disabled' };

  // T507: may this decision execute? T504's ladder answers for the selected action's channel; the answer is
  // stamped on the row and, ONLY when it is live, into the row's key - every shadow key stays what it was.
  const stamp = await resolveDecisionExecutionMode({ ctx: loaded.ctx, decision: outcome.decision, flags: args.flags, explorerFlags: args.explorerFlags });
  const row = withExecutionMode(decisionRow(loaded, outcome.decision, args.trigger, notEmittedOf(loaded)), stamp);
  const persisted = await persistDecision(row);
  const handoffs = await handoffsFor(persisted.row, loaded, args.flags, asOf, args.handoffAssignment);
  return { status: 'recorded', row: persisted.row, replayed: persisted.replayed, decision: outcome.decision, profile, unavailable: loaded.unavailable, handoffs };
}

/* ── the batch runner ──────────────────────────────────────────────────────── */

export interface RunShadowDecisionsArgs {
  brandId: string;
  trigger: DecisionTrigger;
  flags: GrowthJourneyFlags;
  /** T507: handed to every decision's mode stamp; the nightly passes the process's Explorer flags. */
  explorerFlags?: ExplorerGrowthFlags;
  asOf?: Date;
  /** Cap on subjects per run. A nightly batch over a brand is bounded on purpose. */
  limit?: number;
}

export interface RunShadowDecisionsResult {
  status: 'disabled' | 'ran';
  subjects: number;
  recorded: number;
  replayed: number;
  skipped: Array<{ subject_ref: string; status: string }>;
  errors: Array<{ subject_ref: string; error_class: string }>;
  /**
   * T408: what T404's writer did with the recorded decisions, as counts - disabled (flag off), none (no
   * trigger), rows materialised, and of those assigned / left queued. Since T414 the batch leaves every
   * row for the caller's ranked pass, so `assigned` is 0 here by construction and `queued` counts every
   * row it materialised; the nightly's `assignment` block reports what the pass assigned.
   */
  handoffs: { disabled: number; none: number; materialized: number; assigned: number; queued: number };
}

/** `lead:<id>` / `enrollment:<id>` back to an anchor. Null for a ref this runner cannot decide for. */
export function anchorFromSubjectRef(ref: string): SubjectAnchor | null {
  const [kind, id] = ref.split(':');
  if (kind === 'lead' && /^\d+$/.test(id ?? '')) return { leadId: Number(id) };
  if (kind === 'enrollment' && id) return { enrollmentId: id };
  return null;
}

/**
 * Decide for every subject Phase 2 has classified under the brand — the
 * honest population: a subject with no classification has nothing a strategy
 * could ground a candidate in, and is not silently defaulted into one.
 */
export async function runShadowDecisions(args: RunShadowDecisionsArgs): Promise<RunShadowDecisionsResult> {
  if (!isGrowthJourneyCapabilityEnabled('journeyDecisions', args.flags)) {
    return { status: 'disabled', subjects: 0, recorded: 0, replayed: 0, skipped: [], errors: [], handoffs: { disabled: 0, none: 0, materialized: 0, assigned: 0, queued: 0 } };
  }
  const limit = args.limit ?? 500;
  const rows = await GrowthJourneyClassification.findAll({
    where: { brand_id: args.brandId },
    attributes: ['subject_ref'],
    group: ['subject_ref'],
    limit,
  });
  const result: RunShadowDecisionsResult = { status: 'ran', subjects: rows.length, recorded: 0, replayed: 0, skipped: [], errors: [], handoffs: { disabled: 0, none: 0, materialized: 0, assigned: 0, queued: 0 } };
  for (const r of rows) {
    const ref = String(r.get('subject_ref'));
    const anchor = anchorFromSubjectRef(ref);
    if (!anchor) {
      result.skipped.push({ subject_ref: ref, status: 'unanchored_ref' });
      continue;
    }
    try {
      // A batch never assigns first-come: its handoffs wait for the caller's ranked pass over the whole
      // queue (the nightly runs it after every subject of the brand), so a one-slot queue goes to the
      // subject the ranking puts first - urgent, then value - not the one this loop reached first (T414).
      const out = await decideForSubjectAndRecord({ anchor, brandId: args.brandId, trigger: args.trigger, flags: args.flags, explorerFlags: args.explorerFlags, asOf: args.asOf, handoffAssignment: 'ranked_pass' });
      if (out.status === 'recorded') {
        if (out.replayed) result.replayed += 1;
        else result.recorded += 1;
        const h = out.handoffs;
        if (h.status === 'disabled') result.handoffs.disabled += 1;
        else if (h.status === 'none') result.handoffs.none += 1;
        else {
          result.handoffs.materialized += h.handoffs.length;
          for (const x of h.handoffs) {
            if (x.assignment.status === 'assigned') result.handoffs.assigned += 1;
            else result.handoffs.queued += 1;
          }
        }
      } else {
        result.skipped.push({ subject_ref: ref, status: out.status });
      }
    } catch (err: unknown) {
      const error_class = classifyError(err);
      result.errors.push({ subject_ref: ref, error_class });
      log('growth_journey.decision.subject_failed', { brand_id: args.brandId, subject_ref: ref, error_class });
    }
  }
  return result;
}
