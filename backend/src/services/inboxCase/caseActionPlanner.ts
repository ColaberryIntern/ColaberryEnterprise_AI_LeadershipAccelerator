import { randomUUID } from 'crypto';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCaseAction from '../../models/InboxCaseAction';
import { ActionRiskLevel, ActionType, ALWAYS_INDIVIDUAL_APPROVAL, CaseAssessment } from '../../types/inboxCase';
import { computeIdempotencyKey } from './textNormalization';
import { getCaseOrThrow, transitionCase } from './caseRepository';
import { logCaseEvent } from './caseEventLog';

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

interface ProposedAction {
  action_type: ActionType;
  item_id: string | null;
  target_source: string;
  target_id: string | null;
  preview: string;
  payload: Record<string, unknown>;
  risk_level: ActionRiskLevel;
  idempotencyParts: string[];
}

const DEFAULT_FOLLOWUP_DAYS = 3;

function requiresIndividualApproval(actionType: ActionType, risk: ActionRiskLevel): boolean {
  return ALWAYS_INDIVIDUAL_APPROVAL.includes(actionType) || risk === 'HIGH';
}

function buildReplyAction(caseRow: InboxCase, assessment: CaseAssessment, replyTargetItem: InboxCaseItem | null): ProposedAction | null {
  if (!replyTargetItem) return null;
  if (!assessment.recommended_next_actions?.length) return null;

  const body = [assessment.teaching_brief_recommended_decision, assessment.recommendation_rationale]
    .filter(Boolean)
    .join('\n\n');
  const draftBody = body || assessment.recommended_next_actions.join('\n');

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

function buildBasecampCommentActions(caseRow: InboxCase, assessment: CaseAssessment, basecampItems: InboxCaseItem[]): ProposedAction[] {
  if (!assessment.recommended_next_actions?.length) return [];
  const decision = assessment.teaching_brief_recommended_decision || assessment.recommended_next_actions[0];

  return basecampItems
    .filter((item) => item.disposition === null && item.inclusion_status !== 'EXCLUDED')
    .map((item) => ({
      action_type: 'BASECAMP_COMMENT' as ActionType,
      item_id: item.id,
      target_source: 'basecamp',
      target_id: item.source_id,
      preview: `Comment on Basecamp item "${item.title}": ${decision}`,
      payload: { project_id: (item.snapshot as any)?.project_id ?? null, comment: decision },
      risk_level: 'MEDIUM' as ActionRiskLevel,
      idempotencyParts: [caseRow.id, 'BASECAMP_COMMENT', item.id],
    }));
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
  const assessment = (caseRow.assessment || {}) as any;

  // Flatten a couple of nested teaching_brief/recommendation fields onto the
  // assessment object for the builder functions above, since `assessment`
  // (persisted) and `teaching_brief` (persisted separately) are two columns
  // on InboxCase but the planner wants them together.
  const flatAssessment: CaseAssessment & Record<string, any> = {
    ...assessment,
    teaching_brief_recommended_decision: caseRow.teaching_brief?.recommended_decision || caseRow.recommendation || '',
    recommendation_rationale: caseRow.teaching_brief?.rationale || '',
  };

  const emailItems = items.filter((i) => i.source_type === 'email');
  const basecampItems = items.filter((i) => i.source_type.startsWith('basecamp_'));
  const replyTarget = emailItems.filter((i) => i.inclusion_status === 'INCLUDED').sort((a, b) => Number(b.match_score) - Number(a.match_score))[0] || null;

  const replyAction = buildReplyAction(caseRow, flatAssessment, replyTarget);
  const nonArchiveProposals: ProposedAction[] = [
    ...(replyAction ? [replyAction] : []),
    ...buildWaitingActions(caseRow, flatAssessment),
    ...buildBasecampCommentActions(caseRow, flatAssessment, basecampItems),
  ];

  const correlationId = randomUUID();
  const createdIds: string[] = [];

  for (const proposal of nonArchiveProposals) {
    const idempotency_key = computeIdempotencyKey(proposal.idempotencyParts);
    const created = await createActionIfNew(caseRow, correlationId, requestedBy, proposal, idempotency_key, []);
    if (created) createdIds.push(created);
  }

  // Archive actions depend on every non-archive action proposed in THIS
  // plan, per root directive section 12 ("Run email archive actions last").
  const archiveProposals = buildArchiveActions(caseRow, emailItems);
  for (const proposal of archiveProposals) {
    const idempotency_key = computeIdempotencyKey(proposal.idempotencyParts);
    const created = await createActionIfNew(caseRow, correlationId, requestedBy, proposal, idempotency_key, createdIds);
    if (created) createdIds.push(created);
  }

  await transitionCase(caseId, 'AWAITING_APPROVAL', {
    actor_type: 'system',
    actor_id: 'case_action_planner',
    event_type: 'plan_generated',
    details: { requested_by: requestedBy, actions_created: createdIds.length },
  });

  return { actionsCreated: createdIds.length, actionIds: createdIds };
}

async function createActionIfNew(
  caseRow: InboxCase,
  correlationId: string,
  requestedBy: string,
  proposal: ProposedAction,
  idempotency_key: string,
  dependsOn: string[]
): Promise<string | null> {
  const existing = await InboxCaseAction.findOne({ where: { idempotency_key } });
  if (existing) return null; // re-planning is idempotent — never a duplicate proposal

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
