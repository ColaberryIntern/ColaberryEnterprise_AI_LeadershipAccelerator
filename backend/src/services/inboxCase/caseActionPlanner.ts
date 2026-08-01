import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseQuestion from '../../models/InboxCaseQuestion';
import { ActionRiskLevel, ActionType, ALWAYS_INDIVIDUAL_APPROVAL, CaseAssessment } from '../../types/inboxCase';
import { computeIdempotencyKey } from './textNormalization';
import { getCaseOrThrow, transitionCase } from './caseRepository';
import { logCaseEvent } from './caseEventLog';
import { postCaseProgressNote } from './caseTicketService';
import { redactSecretLikePatterns } from './promptSafety';
import { redactSensitive } from '../../utils/piiRedaction';

// Plan (root directive section 6/11): turns a completed assessment into a
// concrete, previewable bundle of proposed InboxCaseAction rows. Rule-based
// by design — the assessment (Phase 3, one AI call already spent per case)
// supplies the content (recommended decision, commitments, owners);
// planning itself is deterministic so the same assessment always proposes
// the same action set, and re-running Plan is idempotent (dedup on
// idempotency_key, never a duplicate proposal for the same target).
//
// Archive-last ordering is enforced structurally here, not just at execute
// time: every EMAIL_ARCHIVE action's depends_on_action_ids includes every
// OTHER action proposed in the same plan, so the executor (Phase 5) can
// trust the dependency graph alone rather than re-deriving "is this an
// archive action" logic.

// Exported: reused by caseQuickResolveService.ts and
// caseActionOverrideService.ts, which both need to create a single
// InboxCaseAction with the same idempotency-dedup and sanitization
// guarantees the full-case planner already relies on, rather than
// duplicating that logic a second and third time.
export interface ProposedAction {
  action_type: ActionType;
  item_id: string | null;
  target_source: string;
  target_id: string | null;
  preview: string;
  payload: Record<string, unknown>;
  risk_level: ActionRiskLevel;
  idempotencyParts: string[];
}

// `assessment` and `teaching_brief` are two separate InboxCase columns; the
// planner wants the two recommendation fields it needs alongside the rest
// of the assessment, so this local type flattens them onto one object
// rather than threading two parameters through every builder function.
interface PlannerAssessment extends CaseAssessment {
  teaching_brief_recommended_decision: string;
  recommendation_rationale: string;
}

const DEFAULT_FOLLOWUP_DAYS = 3;

function requiresIndividualApproval(actionType: ActionType, risk: ActionRiskLevel): boolean {
  return ALWAYS_INDIVIDUAL_APPROVAL.includes(actionType) || risk === 'HIGH';
}

function buildReplyAction(
  caseRow: InboxCase,
  assessment: PlannerAssessment,
  replyTargetItem: InboxCaseItem | null,
  answeredQaText: string
): ProposedAction | null {
  if (!replyTargetItem) return null;
  // A reply is worth drafting if the assessment itself recommended next
  // actions, OR if Ali answered a blocking question since the assessment ran
  // — that answer IS the content the customer is waiting on (e.g. "what's
  // the payment schedule"), even when the original assessment had nothing
  // concrete to recommend because the answer didn't exist yet.
  if (!assessment.recommended_next_actions?.length && !answeredQaText) return null;

  const body = [assessment.teaching_brief_recommended_decision, assessment.recommendation_rationale, answeredQaText]
    .filter(Boolean)
    .join('\n\n');
  const draftBody = body || (assessment.recommended_next_actions || []).join('\n') || answeredQaText;

  return {
    action_type: 'EMAIL_SEND',
    item_id: replyTargetItem.id,
    target_source: replyTargetItem.provider,
    target_id: replyTargetItem.source_id,
    preview: `Reply to "${replyTargetItem.title}":\n\n${draftBody}`,
    payload: { subject: `Re: ${replyTargetItem.title}`, body: draftBody, reply_to_item_id: replyTargetItem.id },
    risk_level: 'MEDIUM',
    idempotencyParts: [caseRow.id, 'EMAIL_SEND', replyTargetItem.id],
  };
}

function buildWaitingActions(caseRow: InboxCase, assessment: CaseAssessment): ProposedAction[] {
  const actions: ProposedAction[] = [];
  for (const commitment of assessment.commitments_made || []) {
    const owner = (commitment.owner || '').trim();
    if (!owner || /^ali(\s|$)/i.test(owner)) continue; // Ali's own commitments aren't "waiting on someone else"
    const followUpDate = new Date(Date.now() + DEFAULT_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    actions.push({
      action_type: 'MARK_WAITING',
      item_id: null,
      target_source: 'case',
      target_id: null,
      preview: `Mark case WAITING on ${owner}: "${commitment.statement}" (follow up ${followUpDate})`,
      payload: { owner, follow_up_date: followUpDate, statement: commitment.statement },
      risk_level: 'LOW',
      idempotencyParts: [caseRow.id, 'MARK_WAITING', owner, commitment.statement.slice(0, 80)],
    });
  }
  return actions;
}

interface BasecampCommentPair {
  comment: ProposedAction;
  item: InboxCaseItem;
}

// Returns the comment proposal PAIRED with its source item (not just the
// flat proposal) so generatePlan() can check item.basecamp_close_recommended
// afterward and, if true, propose a linked BASECAMP_COMPLETE_TODO action
// depending on the comment — the checkbox this run adds on the frontend
// binds to exactly that pairing.
function buildBasecampCommentActions(caseRow: InboxCase, assessment: PlannerAssessment, basecampItems: InboxCaseItem[]): BasecampCommentPair[] {
  if (!assessment.recommended_next_actions?.length) return [];
  const decision = assessment.teaching_brief_recommended_decision || assessment.recommended_next_actions[0];

  return basecampItems
    .filter((item) => item.disposition === null && item.inclusion_status !== 'EXCLUDED')
    .map((item) => ({
      item,
      comment: {
        action_type: 'BASECAMP_COMMENT' as ActionType,
        item_id: item.id,
        target_source: 'basecamp',
        target_id: item.source_id,
        preview: `Comment on Basecamp item "${item.title}": ${decision}`,
        payload: { project_id: (item.snapshot as any)?.project_id ?? null, comment: decision },
        risk_level: 'MEDIUM' as ActionRiskLevel,
        idempotencyParts: [caseRow.id, 'BASECAMP_COMMENT', item.id],
      },
    }));
}

// The linked "also close this" action a Basecamp comment can carry, per
// item.basecamp_close_recommended (set by caseAssessmentService.ts's
// "deeper look", advisory only). risk_level/requires_individual_approval
// are computed the normal way — no special-casing — because
// BASECAMP_COMPLETE_TODO is already in ALWAYS_INDIVIDUAL_APPROVAL, so this
// can never be bulk-approved regardless.
function buildLinkedCloseAction(caseRow: InboxCase, item: InboxCaseItem): ProposedAction {
  return {
    action_type: 'BASECAMP_COMPLETE_TODO',
    item_id: item.id,
    target_source: 'basecamp',
    target_id: item.source_id,
    preview: `Close Basecamp item "${item.title}" after the comment above`,
    payload: { project_id: (item.snapshot as any)?.project_id ?? null },
    risk_level: 'LOW',
    idempotencyParts: [caseRow.id, 'BASECAMP_COMPLETE_TODO', item.id],
  };
}

function buildArchiveActions(caseRow: InboxCase, emailItems: InboxCaseItem[]): ProposedAction[] {
  return emailItems
    .filter((item) => item.source_type === 'email' && item.inclusion_status !== 'EXCLUDED')
    .map((item) => {
      const isProtected = item.disposition === 'PROTECTED';
      return {
        action_type: (item.provider === 'hotmail' ? 'EMAIL_ARCHIVE' : 'EMAIL_LABEL') as ActionType,
        item_id: item.id,
        target_source: item.provider,
        target_id: item.source_id,
        preview: `Archive "${item.title}" (${item.provider})${isProtected ? ' — PROTECTED, requires individual review' : ''}`,
        payload: { source_id: item.source_id, provider: item.provider, label: 'Inbox Intel/Resolved' },
        risk_level: (isProtected ? 'HIGH' : 'LOW') as ActionRiskLevel,
        idempotencyParts: [caseRow.id, 'ARCHIVE', item.id],
      };
    });
}

export interface GeneratePlanResult {
  actionsCreated: number;
  actionIds: string[];
}

export async function generatePlan(caseId: string, requestedBy: string): Promise<GeneratePlanResult> {
  const caseRow = await getCaseOrThrow(caseId);
  const items = await InboxCaseItem.findAll({ where: { case_id: caseId } });
  const answeredQuestions = await InboxCaseQuestion.findAll({ where: { case_id: caseId, status: 'ANSWERED' } });
  const answeredQaText = answeredQuestions.map((q) => `${q.question}\nAnswer: ${q.answer}`).join('\n\n');
  const assessment = (caseRow.assessment || {}) as any;

  // Flatten a couple of nested teaching_brief/recommendation fields onto the
  // assessment object for the builder functions above, since `assessment`
  // (persisted) and `teaching_brief` (persisted separately) are two columns
  // on InboxCase but the planner wants them together.
  const flatAssessment: PlannerAssessment = {
    ...assessment,
    teaching_brief_recommended_decision: caseRow.teaching_brief?.recommended_decision || caseRow.recommendation || '',
    recommendation_rationale: caseRow.teaching_brief?.rationale || '',
  };

  const emailItems = items.filter((i) => i.source_type === 'email');
  const basecampItems = items.filter((i) => i.source_type.startsWith('basecamp_'));

  // Reply target: prefer an INCLUDED inbound email (its `from_address` is the
  // customer we reply to). Some cases end up with ONLY sent_email evidence —
  // e.g. a customer's original inbound message never matched the discovery
  // query well enough to be included, but Ali's own reply/forward to them
  // did. Fall back to the highest-scoring INCLUDED sent_email item that
  // actually has a recorded recipient, so a case isn't stranded with zero
  // actions just because its evidence happens to be all-outbound. See
  // executeEmailSend in caseActionExecutors.ts, which resolves the real
  // send-to address differently for sent_email items (to_addresses, not
  // from_address) to match this.
  const includedInboundEmail = emailItems
    .filter((i) => i.inclusion_status === 'INCLUDED')
    .sort((a, b) => Number(b.match_score) - Number(a.match_score));
  const includedSentEmailWithRecipient = items
    .filter((i) => i.source_type === 'sent_email' && i.inclusion_status === 'INCLUDED' && (i.snapshot as any)?.to_addresses?.length)
    .sort((a, b) => Number(b.match_score) - Number(a.match_score));
  const replyTarget = includedInboundEmail[0] || includedSentEmailWithRecipient[0] || null;

  const replyAction = buildReplyAction(caseRow, flatAssessment, replyTarget, answeredQaText);
  const nonArchiveProposals: ProposedAction[] = [
    ...(replyAction ? [replyAction] : []),
    ...buildWaitingActions(caseRow, flatAssessment),
  ];
  const basecampCommentPairs = buildBasecampCommentActions(caseRow, flatAssessment, basecampItems);

  const correlationId = randomUUID();
  const createdIds: string[] = [];

  for (const proposal of nonArchiveProposals) {
    const idempotency_key = computeIdempotencyKey(proposal.idempotencyParts);
    const created = await createActionIfNew(caseRow, correlationId, requestedBy, proposal, idempotency_key, []);
    if (created) createdIds.push(created);
  }

  // Basecamp comment + optional linked "also close this" action: create the
  // comment first, then — only when the assessment's "deeper look"
  // recommended closing this item — propose a BASECAMP_COMPLETE_TODO that
  // depends on the comment's real id (new this run, or already-existing
  // from a prior plan run on a re-plan), so it can never execute before or
  // instead of the comment.
  for (const { comment, item } of basecampCommentPairs) {
    const commentIdempotencyKey = computeIdempotencyKey(comment.idempotencyParts);
    const createdCommentId = await createActionIfNew(caseRow, correlationId, requestedBy, comment, commentIdempotencyKey, []);
    if (createdCommentId) createdIds.push(createdCommentId);

    if (item.basecamp_close_recommended === true) {
      const commentActionId = createdCommentId || (await InboxCaseAction.findOne({ where: { idempotency_key: commentIdempotencyKey } }))?.id;
      if (commentActionId) {
        const closeProposal = buildLinkedCloseAction(caseRow, item);
        const closeIdempotencyKey = computeIdempotencyKey(closeProposal.idempotencyParts);
        const createdCloseId = await createActionIfNew(caseRow, correlationId, requestedBy, closeProposal, closeIdempotencyKey, [commentActionId]);
        if (createdCloseId) createdIds.push(createdCloseId);
      }
    }
  }

  // Archive actions depend on every non-archive action proposed in THIS
  // plan, per root directive section 12 ("Run email archive actions last").
  const archiveProposals = buildArchiveActions(caseRow, emailItems);
  for (const proposal of archiveProposals) {
    const idempotency_key = computeIdempotencyKey(proposal.idempotencyParts);
    const created = await createActionIfNew(caseRow, correlationId, requestedBy, proposal, idempotency_key, createdIds);
    if (created) createdIds.push(created);
  }

  // Zero-action plans are a dead end if left as-is: the case would sit in
  // AWAITING_APPROVAL with nothing to approve, and Close Case would still
  // block on the "every item has a disposition" closure condition since no
  // action ever touched the items. Auto-mark untouched, non-excluded items
  // NO_ACTION so the very next thing Ali does (Close Case) actually
  // succeeds instead of surfacing another opaque blocker.
  if (createdIds.length === 0) {
    await InboxCaseItem.update(
      { disposition: 'NO_ACTION', disposition_reason: 'Auto-set: plan produced no actions for this item.' },
      { where: { case_id: caseId, disposition: null, inclusion_status: { [Op.ne]: 'EXCLUDED' } } }
    );
  }

  await transitionCase(caseId, 'AWAITING_APPROVAL', {
    actor_type: 'system',
    actor_id: 'case_action_planner',
    event_type: 'plan_generated',
    details: { requested_by: requestedBy, actions_created: createdIds.length },
  });

  await postCaseProgressNote(
    caseId,
    createdIds.length > 0
      ? `Plan generated: ${createdIds.length} action(s) proposed (${archiveProposals.length} archive, ${createdIds.length - archiveProposals.length} other). Awaiting your approval.`
      : `Plan generated: no actions were needed for this case. Items auto-marked NO_ACTION — ready to close.`
  );

  return { actionsCreated: createdIds.length, actionIds: createdIds };
}

// Defense-in-depth: every proposed action's human-readable preview and any
// string payload field passes through the same redaction used for AI input,
// plus a secret-label pattern check, before it is ever persisted — so an
// approver reviewing the preview, and any downstream executor, never sees
// or sends a labeled secret that made it into an assessment's recommended
// wording. See promptSafety.ts::redactSecretLikePatterns for why this is
// necessary in addition to (not instead of) the assessment-time redaction.
function sanitizeText(text: string): string {
  return redactSecretLikePatterns(redactSensitive(text));
}

function sanitizeProposal(proposal: ProposedAction): ProposedAction {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(proposal.payload)) {
    payload[key] = typeof value === 'string' ? sanitizeText(value) : value;
  }
  return { ...proposal, preview: sanitizeText(proposal.preview), payload };
}

export async function createActionIfNew(
  caseRow: InboxCase,
  correlationId: string,
  requestedBy: string,
  rawProposal: ProposedAction,
  idempotency_key: string,
  dependsOn: string[]
): Promise<string | null> {
  const existing = await InboxCaseAction.findOne({ where: { idempotency_key } });
  if (existing) return null; // re-planning is idempotent — never a duplicate proposal

  const proposal = sanitizeProposal(rawProposal);

  try {
    const created = await InboxCaseAction.create({
      case_id: caseRow.id,
      item_id: proposal.item_id,
      action_type: proposal.action_type,
      target_source: proposal.target_source,
      target_id: proposal.target_id,
      preview: proposal.preview,
      payload: proposal.payload,
      risk_level: proposal.risk_level,
      requires_individual_approval: requiresIndividualApproval(proposal.action_type, proposal.risk_level),
      status: 'PROPOSED',
      depends_on_action_ids: dependsOn,
      idempotency_key,
      attempt_count: 0,
      acting_admin: requestedBy,
      correlation_id: correlationId,
    } as any);

    await logCaseEvent({
      case_id: caseRow.id,
      action_id: created.id,
      event_type: 'action_proposed',
      actor_type: 'system',
      actor_id: 'case_action_planner',
      details: { action_type: proposal.action_type, risk_level: proposal.risk_level },
      correlation_id: correlationId,
    });

    return created.id;
  } catch (err: any) {
    if (err?.name !== 'SequelizeUniqueConstraintError') {
      console.error(`[InboxCase] Failed to persist proposed action: ${err?.message}`);
    }
    return null;
  }
}
