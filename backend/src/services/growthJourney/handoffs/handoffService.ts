import { Op } from 'sequelize';
import { GrowthJourneyHandoff, GrowthJourneyPolicy } from '../../../models';
import {
  OPEN_HANDOFF_STATUSES,
  OWNER_QUEUES,
  type GrowthJourneyHandoffAttributes,
  type GrowthJourneyOwnerQueue,
} from '../../../models/GrowthJourneyHandoff';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { isUniqueViolation } from '../../../utils/uniqueViolation';
import { computeIdempotencyKey } from '../../inboxCase/textNormalization';
import { recordJourneyEvent } from '../ledger';
import { assignHandoff, type AssignResult } from './assignment';
import { assertPacketCarriesNoAddress, buildEvidencePacket } from './evidencePacket';
import { computeExpectedValue, priorityFor, rankHandoffs } from './expectedValue';
import { loadStoredSignals } from './handoffSignals';
import type { DecisionRowView, HandoffTrigger, SubjectRefs } from './types';

/**
 * The handoff writer and the queue (§9, §11; Phase 4 T404).
 *
 * ─── FROM A DEFERRAL TO A ROW A HUMAN READS ─────────────────────────────────
 *
 * A persisted decision whose `deferred_actions` carry `create_handoff` (the
 * B2B strategies' commercial states and human-review overlay; the learner
 * strategy's enrolment-ready / friction cases), or whose
 * `requires_human_review` is set, becomes ONE `growth_journey_handoffs` row:
 * ranked (`expected_value`, `urgent`, `priority`), evidence-complete (§9's
 * packet, built from stored rows only — `evidencePacket.ts`), in the owner
 * queue the trigger named. The reply hook and the routing action produce the
 * same row shape from their own triggers. One open handoff per subject per
 * brand: T401's partial unique makes a replay land on the existing row.
 *
 * ─── ASSIGNMENT IS THE ONLY WRITE OUTSIDE THIS RUN'S TABLES (`./assignment`) ───
 *
 * A `tickets` row through `ticketService.createTicket` — the existing task
 * system, never a second one — and only when every gate holds, in order: the
 * `journeyHandoffs` flag, the kill switch, a `queue_assignee` policy row,
 * the queue's capacity (`unknown` blocks: an unset number is not permission),
 * and the creator identity (`GrowthJourneyHandoffs`, an `ai_staff` admin user
 * whose agent reports through AI Leadership, so `enforceReportsToGate` passes).
 * Any gate failing leaves the row `queued` with `assignment_blocked_reason`
 * on it, never a throw. NOTHING NOTIFIES ANYONE: a ticket is a row on a board.
 *
 * ─── WHAT THIS FILE NEVER IMPORTS ───────────────────────────────────────────
 *
 * The decision model. This file updates the mutable handoff row, and the
 * append-only guard fails any growthJourney file that names an append-only
 * model beside an update call; the decision arrives as `DecisionRowView`.
 */

const ACTOR = 'growth_journey';
const ENTITY = 'growth_journey_handoff';

/** The gated tickets write lives in `./assignment`; re-exported here because the agent registry names it as this module's. */
export { assignHandoff };
export type { AssignResult };

/* ── triggers ──────────────────────────────────────────────────────────────── */

const isQueue = (v: unknown): v is GrowthJourneyOwnerQueue => typeof v === 'string' && (OWNER_QUEUES as readonly string[]).includes(v);

/** The handoffs a persisted decision asks for, in the order the strategy named them. */
export function handoffTriggersOf(decision: DecisionRowView): HandoffTrigger[] {
  const out: HandoffTrigger[] = [];
  for (const d of decision.deferred_actions) {
    const x = d as { would?: unknown; reason?: unknown; payload?: { owner?: unknown } };
    if (x.would !== 'create_handoff' || !isQueue(x.payload?.owner)) continue;
    out.push({ source: 'decision_deferral', owner_queue: x.payload.owner, reason: typeof x.reason === 'string' ? x.reason : 'create_handoff' });
  }
  if (decision.requires_human_review && !out.some((t) => t.owner_queue === 'human_review')) {
    out.push({ source: 'human_review', owner_queue: 'human_review', reason: `requires_human_review:${decision.reason}` });
  }
  return out;
}

/* ── the row ───────────────────────────────────────────────────────────────── */

export interface CreateHandoffArgs {
  refs: SubjectRefs;
  trigger: HandoffTrigger;
  decision: DecisionRowView | null;
  asOf: Date;
}

export interface CreateHandoffResult {
  row: GrowthJourneyHandoff;
  replayed: boolean;
}

const scoreSummaryOf = (decision: DecisionRowView | null): number | null => {
  const s = decision?.scores?.summary;
  return typeof s === 'number' ? s : null;
};

export async function createHandoff(args: CreateHandoffArgs): Promise<CreateHandoffResult> {
  const { refs, trigger, decision, asOf } = args;
  const signals = await loadStoredSignals({ leadId: refs.lead_id, tenantId: refs.tenant_id, brandId: refs.brand_id, ownerQueue: trigger.owner_queue, asOf });
  const urgent = signals.explicit_request.present || trigger.urgent_hint === true;
  const expected = computeExpectedValue({ program_kind: refs.program?.kind ?? null, state: decision?.state_at_decision ?? null, path: refs.path, score_summary: scoreSummaryOf(decision) });
  const priority = priorityFor(expected.value, urgent);
  const sla_due_at = signals.sla_hours ? new Date(asOf.getTime() + signals.sla_hours * 3_600_000) : null;
  const packet = buildEvidencePacket({ trigger, refs, decision, signals, urgent, expected_value: expected, priority, sla_due_at, built_at: asOf });
  assertPacketCarriesNoAddress(packet);

  const consent = packet.consent && typeof packet.consent === 'object' && !('available' in (packet.consent as object)) ? 'contact_evidence' : null;
  const row: GrowthJourneyHandoffAttributes = {
    tenant_id: refs.tenant_id,
    brand_id: refs.brand_id,
    program_id: refs.program?.id ?? null,
    subject_ref: refs.subject_ref,
    lead_id: refs.lead_id,
    enrollment_id: refs.enrollment_id,
    decision_id: decision?.id ?? null,
    organization_id: signals.context?.organization_id ?? null,
    owner_queue: trigger.owner_queue,
    priority,
    expected_value: expected.value,
    urgent,
    reason: trigger.reason,
    evidence: packet,
    qualification_gaps: (packet.qualification_gaps as string[]) ?? [],
    talking_points: (packet.talking_points as string[]) ?? [],
    best_channel: (packet.best_permitted_channel as string | null) ?? null,
    consent_basis: consent,
    sla_due_at,
    status: 'queued',
    source: trigger.source,
    // Keyed on the DECISION for a deferral, and on the EVENT (a provider message id, a
    // rule firing) for a decision-less trigger: the idempotency index is full, not
    // partial, so a constant key would land a second NEEDS_ALI reply after the first
    // handoff was dispositioned on the closed row and nobody would see it. The
    // one-open-per-subject-per-brand index still holds while a row is open.
    idempotency_key: computeIdempotencyKey([refs.subject_ref, refs.brand_id, trigger.source, decision?.id ?? trigger.event_ref ?? trigger.reason]),
  };

  try {
    const created = await GrowthJourneyHandoff.create(row);
    await recordJourneyEvent('growth_journey.handoff.created', ENTITY, created.id, { tenant_id: refs.tenant_id, brand_id: refs.brand_id }, {
      handoff_id: created.id, decision_id: row.decision_id, subject_ref: refs.subject_ref, lead_id: refs.lead_id,
      owner_queue: trigger.owner_queue, source: trigger.source, reason: trigger.reason, urgent, expected_value: expected.value, priority,
    }, ACTOR);
    return { row: created, replayed: false };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err;
    // The idempotency key, or the one-open-per-subject-per-brand index: either way the row that holds it is the answer.
    const existing = await GrowthJourneyHandoff.findOne({
      where: { brand_id: refs.brand_id, [Op.or]: [{ idempotency_key: row.idempotency_key }, { subject_ref: refs.subject_ref, status: { [Op.in]: [...OPEN_HANDOFF_STATUSES] } }] },
      order: [['created_at', 'DESC']],
    });
    if (!existing) throw err;
    return { row: existing, replayed: true };
  }
}

/* ── the queue ─────────────────────────────────────────────────────────────── */

export interface RankQueueArgs {
  brandId: string;
  ownerQueue?: GrowthJourneyOwnerQueue;
  statuses?: readonly string[];
  limit?: number;
}

/** The open handoffs of a brand (optionally one queue), ranked: urgent first, then value, then age. */
export async function rankQueue(args: RankQueueArgs): Promise<GrowthJourneyHandoff[]> {
  const rows = await GrowthJourneyHandoff.findAll({
    where: {
      brand_id: args.brandId,
      status: { [Op.in]: [...(args.statuses ?? OPEN_HANDOFF_STATUSES)] },
      ...(args.ownerQueue ? { owner_queue: args.ownerQueue } : {}),
    },
    limit: args.limit ?? 500,
  });
  return rankHandoffs(rows);
}

/**
 * The queue's assignment pass: every `queued` handoff of a brand × queue, in
 * rank order (urgent first, then value, then age), each through the gates.
 * Capacity is re-read per row, so the pass stops assigning exactly when the
 * queue fills and the rest are left `queued` with `capacity_full` on them.
 * This is why the higher-value subject wins a one-slot queue: rows are
 * created first and assigned by rank, never first-come.
 */
export async function assignRankedQueue(args: { brandId: string; ownerQueue: GrowthJourneyOwnerQueue; flags: GrowthJourneyFlags; asOf: Date }): Promise<Array<{ handoff_id: string; assignment: AssignResult }>> {
  const queued = await rankQueue({ brandId: args.brandId, ownerQueue: args.ownerQueue, statuses: ['queued'] });
  const out: Array<{ handoff_id: string; assignment: AssignResult }> = [];
  for (const row of queued) out.push({ handoff_id: row.id, assignment: await assignHandoff(row, args.flags, args.asOf) });
  return out;
}

/* ── from a decision ───────────────────────────────────────────────────────── */

export interface MaterializeArgs {
  decision: DecisionRowView;
  refs: SubjectRefs;
  flags: GrowthJourneyFlags;
  asOf: Date;
  /**
   * `'now'` (the default): the queue's ranked pass runs right after the rows are created - right for
   * one subject. `'ranked_pass'`: the rows are created and left `queued` for the CALLER's pass over the
   * whole queue. A batch that assigned subject by subject gave a one-slot queue to whichever subject it
   * happened to decide first, not to the one the ranking puts first (T414, §16 I).
   */
  assignment?: 'now' | 'ranked_pass';
}

/** The assignment answer for a row the caller's ranked pass will take: not blocked, just not yet offered. */
export const AWAITING_RANKED_PASS = 'awaiting_ranked_pass';

export type MaterializeResult =
  | { status: 'disabled' }
  | { status: 'none'; reason: string }
  | { status: 'materialized'; handoffs: Array<{ trigger: HandoffTrigger; handoff_id: string; replayed: boolean; assignment: AssignResult }> };

/**
 * The persisted decision's handoffs, created and then assigned by the queue's
 * ranked pass (so a higher-value row already waiting is served before this
 * one). The first trigger creates the row; a second trigger for the same
 * subject replays onto it (one open handoff per subject per brand). The
 * caller (the decision writer) catches: the decision is already recorded and
 * a handoff failing to materialise is logged, not fatal to the decision.
 */
export async function materializeHandoffs(args: MaterializeArgs): Promise<MaterializeResult> {
  if (!isGrowthJourneyCapabilityEnabled('journeyHandoffs', args.flags)) return { status: 'disabled' };
  const triggers = handoffTriggersOf(args.decision);
  if (triggers.length === 0) return { status: 'none', reason: 'no_handoff_trigger' };

  const created: Array<{ trigger: HandoffTrigger; row: GrowthJourneyHandoff; replayed: boolean }> = [];
  for (const trigger of triggers) {
    const { row, replayed } = await createHandoff({ refs: args.refs, trigger, decision: args.decision, asOf: args.asOf });
    created.push({ trigger, row, replayed });
  }
  if (args.assignment === 'ranked_pass') {
    return {
      status: 'materialized',
      handoffs: created.map((c) => ({
        trigger: c.trigger,
        handoff_id: c.row.id,
        replayed: c.replayed,
        assignment: c.row.status === 'queued' ? { status: 'queued' as const, reason: AWAITING_RANKED_PASS } : { status: 'not_queued' as const, current: c.row.status },
      })),
    };
  }
  const passes = new Map<string, AssignResult>();
  for (const queue of new Set(created.map((c) => c.row.owner_queue))) {
    for (const r of await assignRankedQueue({ brandId: args.refs.brand_id, ownerQueue: queue, flags: args.flags, asOf: args.asOf })) passes.set(r.handoff_id, r.assignment);
  }
  const handoffs = created.map((c) => ({
    trigger: c.trigger,
    handoff_id: c.row.id,
    replayed: c.replayed,
    assignment: passes.get(c.row.id) ?? ({ status: 'not_queued', current: c.row.status } as AssignResult),
  }));
  return { status: 'materialized', handoffs };
}
