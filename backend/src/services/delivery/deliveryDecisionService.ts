/**
 * deliveryDecisionService — the decision ledger.
 *
 * SUPERSESSION, NEVER MUTATION. A decision that changes gets a *successor row* and a
 * back-pointer; the original keeps its rationale, its decider and its timestamp forever.
 *
 * Master plan §24 lists "design approval can be silently overwritten" as a stop
 * condition, and an UPDATE on an approved decision is exactly how that happens — the
 * record would afterwards claim the client approved something they never saw. The only
 * mutation this module performs on a decided row is setting `superseded_by_decision_id`,
 * which is a link, not a rewrite of what was decided.
 *
 * `affected_nodes` is what makes an impact-aware change request possible (master plan
 * §Gate 3): it records which requirements, design decisions, stories and agents a
 * decision touches, so "what would this change break?" is a query rather than a meeting.
 */

import DeliveryDecision, {
  type DecisionStatus,
  type DecisionType,
} from '../../models/DeliveryDecision';

export class DecisionError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`delivery decision: ${reason}`);
    this.name = 'DecisionError';
    this.reason = reason;
  }
}

/** Statuses past which a decision is a matter of record and may only be superseded. */
const SETTLED: readonly DecisionStatus[] = ['decided', 'approved'];

export function isSettled(status: DecisionStatus): boolean {
  return SETTLED.includes(status);
}

export interface RecordDecisionInput {
  deliveryProjectId: string;
  decisionType: DecisionType;
  question: string;
  options?: Record<string, any> | null;
  recommendation?: string | null;
  affectedNodes?: Record<string, any> | null;
}

/** Open a question. Recording the question before the answer is the point of a ledger. */
export async function openDecision(input: RecordDecisionInput): Promise<DeliveryDecision> {
  if (!input.question?.trim()) throw new DecisionError('question_required');

  return DeliveryDecision.create({
    delivery_project_id: input.deliveryProjectId,
    decision_type: input.decisionType,
    question: input.question.trim(),
    options: input.options ?? null,
    recommendation: input.recommendation ?? null,
    affected_nodes: input.affectedNodes ?? null,
    status: input.recommendation ? 'recommended' : 'open',
  } as any);
}

export interface DecideInput {
  decisionId: string;
  finalDecision: string;
  rationale?: string | null;
  decidedByIdentityId: string;
  /** Set when this decision also carries a second-party approval. */
  approvedByIdentityId?: string | null;
}

/**
 * Answer an open decision.
 *
 * Refuses on an already-settled decision. The caller must supersede instead — which is
 * not pedantry: the difference between "we changed our mind" and "we never said that" is
 * the whole value of the ledger, and an in-place edit erases it.
 */
export async function decide(input: DecideInput): Promise<DeliveryDecision> {
  const decision = await DeliveryDecision.findByPk(input.decisionId);
  if (!decision) throw new DecisionError('not_found');

  if (isSettled(decision.status)) {
    throw new DecisionError('already_settled_supersede_instead');
  }
  if (decision.status === 'superseded') {
    throw new DecisionError('cannot_decide_superseded');
  }
  if (!input.finalDecision?.trim()) throw new DecisionError('final_decision_required');

  await decision.update({
    final_decision: input.finalDecision.trim(),
    rationale: input.rationale ?? null,
    decided_by_identity_id: input.decidedByIdentityId,
    approved_by_identity_id: input.approvedByIdentityId ?? null,
    decided_at: new Date(),
    status: input.approvedByIdentityId ? 'approved' : 'decided',
  });

  return decision;
}

export interface SupersedeInput {
  priorDecisionId: string;
  question?: string;
  finalDecision: string;
  rationale?: string | null;
  decidedByIdentityId: string;
  approvedByIdentityId?: string | null;
  affectedNodes?: Record<string, any> | null;
}

/**
 * Replace a settled decision with a new one, preserving both.
 *
 * The successor is created first and only then is the prior row linked. If the link write
 * fails, the worst outcome is an orphaned successor that is visibly missing its
 * `supersedes` pointer — recoverable. Doing it the other way round could mark the prior
 * decision superseded by a row that was never created, leaving the project with no
 * current decision at all.
 */
export async function supersedeDecision(input: SupersedeInput): Promise<{
  prior: DeliveryDecision;
  successor: DeliveryDecision;
}> {
  const prior = await DeliveryDecision.findByPk(input.priorDecisionId);
  if (!prior) throw new DecisionError('not_found');
  if (prior.status === 'superseded') throw new DecisionError('already_superseded');
  if (!isSettled(prior.status)) throw new DecisionError('only_settled_decisions_are_superseded');
  if (!input.finalDecision?.trim()) throw new DecisionError('final_decision_required');

  const successor = await DeliveryDecision.create({
    delivery_project_id: prior.delivery_project_id,
    decision_type: prior.decision_type,
    question: input.question?.trim() || prior.question,
    recommendation: null,
    final_decision: input.finalDecision.trim(),
    rationale: input.rationale ?? null,
    affected_nodes: input.affectedNodes ?? prior.affected_nodes,
    decided_by_identity_id: input.decidedByIdentityId,
    approved_by_identity_id: input.approvedByIdentityId ?? null,
    decided_at: new Date(),
    status: input.approvedByIdentityId ? 'approved' : 'decided',
    supersedes_decision_id: prior.id,
  } as any);

  // The ONLY mutation performed on a settled row: a link, not a rewrite. The question,
  // the answer, the rationale, the decider and the timestamp are all untouched.
  await prior.update({
    status: 'superseded',
    superseded_by_decision_id: successor.id,
  });

  return { prior, successor };
}

/** Decisions that currently govern — settled and not superseded. */
export async function getGoverningDecisions(
  deliveryProjectId: string,
  decisionType?: DecisionType,
): Promise<DeliveryDecision[]> {
  return DeliveryDecision.findAll({
    where: {
      delivery_project_id: deliveryProjectId,
      status: ['decided', 'approved'],
      ...(decisionType ? { decision_type: decisionType } : {}),
    },
    order: [['decided_at', 'DESC']],
  });
}

/** Everything still awaiting a human — the attention queue for master plan §10. */
export async function getOpenDecisions(
  deliveryProjectId: string,
): Promise<DeliveryDecision[]> {
  return DeliveryDecision.findAll({
    where: { delivery_project_id: deliveryProjectId, status: ['open', 'recommended'] },
    order: [['created_at', 'ASC']],
  });
}

/**
 * Walk a decision's supersession chain, oldest first.
 *
 * Bounded at 50 hops. A cycle should be impossible — supersession only ever points
 * backwards to an existing row — but "should be impossible" is not a reason to write a
 * loop that hangs the request if it ever is.
 */
export async function getDecisionHistory(decisionId: string): Promise<DeliveryDecision[]> {
  const chain: DeliveryDecision[] = [];
  const seen = new Set<string>();
  let current = await DeliveryDecision.findByPk(decisionId);

  while (current && !seen.has(current.id) && chain.length < 50) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.supersedes_decision_id
      ? await DeliveryDecision.findByPk(current.supersedes_decision_id)
      : null;
  }

  return chain;
}
