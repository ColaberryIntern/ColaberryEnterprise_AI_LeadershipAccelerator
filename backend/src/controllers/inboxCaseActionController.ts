import { Request, Response } from 'express';
import InboxCase from '../models/InboxCase';
import InboxCaseQuestion from '../models/InboxCaseQuestion';
import { caseQuestionParamSchema, caseIdParamSchema, caseActionParamSchema, answerQuestionSchema, approveActionSchema, rejectActionSchema, approveLowRiskSchema, closeCaseSchema, reopenCaseSchema, overrideActionsSchema } from '../schemas/inboxCaseSchema';
import { overrideProposedActions } from '../services/inboxCase/caseActionOverrideService';
import { runAutoSync } from '../services/inboxCase/caseAutoSyncService';
import { logCaseEvent } from '../services/inboxCase/caseEventLog';
import { reopenCase, maybeAdvanceFromNeedsAli } from '../services/inboxCase/caseRepository';
import { generatePlan } from '../services/inboxCase/caseActionPlanner';
import { approveAction, rejectAction, approveLowRiskActions } from '../services/inboxCase/caseApprovalService';
import { executeApprovedActions } from '../services/inboxCase/caseExecutionService';
import { verifyCase } from '../services/inboxCase/caseVerificationService';
import { closeCase } from '../services/inboxCase/caseClosureService';
import { learnFromAnsweredQuestion } from '../services/inboxCase/caseKnowledgeService';

// Plan/Approve/Execute/Verify/Close/Reopen handlers for the Inbox Intel —
// Case Resolution Engine. All handlers are now implemented (Phases 3-5).

export async function handleAnswerQuestion(req: Request, res: Response) {
  const paramsParsed = caseQuestionParamSchema.safeParse(req.params);
  if (!paramsParsed.success) return res.status(400).json({ error: 'ValidationError', details: paramsParsed.error.issues });
  const bodyParsed = answerQuestionSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  const { caseId, questionId } = paramsParsed.data;
  const question = await InboxCaseQuestion.findOne({ where: { id: questionId, case_id: caseId } });
  if (!question) return res.status(404).json({ error: 'QuestionNotFoundError' });
  if (question.status === 'ANSWERED') {
    return res.status(409).json({ error: 'QuestionAlreadyAnsweredError', answer: question.answer });
  }

  const answer = bodyParsed.data.accept_recommended ? question.recommended_answer : bodyParsed.data.answer;
  if (!answer) return res.status(400).json({ error: 'ValidationError', message: 'No recommended_answer to accept and no answer provided' });

  await question.update({
    status: 'ANSWERED',
    answer,
    answered_by: bodyParsed.data.answered_by,
    answered_at: new Date(),
  });

  const caseRow = await InboxCase.findByPk(caseId);
  await logCaseEvent({
    case_id: caseId,
    event_type: 'question_answered',
    actor_type: 'admin',
    actor_id: bodyParsed.data.answered_by,
    details: { question_id: questionId, answer, blocks_action_ids: question.blocks_action_ids },
    correlation_id: caseRow?.correlation_id || questionId,
  });

  // The learning loop: feed this answered question back into the knowledge
  // base (always inactive — a human reviews before it can affect Cora's live
  // replies) so the next similar case doesn't have to ask again. Best-effort
  // and never blocks the response — a KB-write failure must not make
  // answering a question fail.
  try {
    const learned = await learnFromAnsweredQuestion({
      caseId,
      question: question.question,
      answer,
      whyRequired: question.why_required,
      answeredBy: bodyParsed.data.answered_by,
    });
    if (learned.created) {
      await logCaseEvent({
        case_id: caseId,
        event_type: 'knowledge_base_entry_proposed',
        actor_type: 'system',
        actor_id: 'case_knowledge_service',
        details: { question_id: questionId, kb_entry_id: learned.entryId },
        correlation_id: caseRow?.correlation_id || questionId,
      });
    }
  } catch (err: any) {
    console.error(`[InboxCase] Knowledge-base learning step failed for question ${questionId}: ${err?.message}`);
  }

  // Answering an individual question never itself decides case state — this
  // is the ONLY place that re-checks "were there other open questions?" and
  // advances the case out of NEEDS_ALI once the answer just given was the
  // last one blocking it. Without this, a case sits in NEEDS_ALI forever
  // after its last question is answered: no Plan step ever appears, and any
  // Close attempt fails with a checklist that doesn't explain why nothing
  // is progressing.
  try {
    await maybeAdvanceFromNeedsAli(caseId, bodyParsed.data.answered_by);
  } catch (err: any) {
    console.error(`[InboxCase] Failed to advance case ${caseId} after answering question ${questionId}: ${err?.message}`);
  }

  res.json({ question: question.toJSON() });
}

export async function handleGeneratePlan(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });

  try {
    const result = await generatePlan(parsed.data.caseId, (req as any).admin?.email || 'admin');
    res.json({ actions_created: result.actionsCreated, action_ids: result.actionIds });
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    if (err?.name === 'InvalidCaseTransitionError') return res.status(409).json({ error: err.name, message: err.message });
    console.error('[InboxCase] GeneratePlan error:', err?.message);
    res.status(500).json({ error: 'PlanGenerationFailedError', message: err?.message });
  }
}

export async function handleApproveAction(req: Request, res: Response) {
  const parsed = caseActionParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = approveActionSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const action = await approveAction(parsed.data.caseId, parsed.data.actionId, bodyParsed.data.approved_by, bodyParsed.data.edited_payload);
    res.json({ action: action.toJSON() });
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    if (err?.name === 'InvalidActionTransitionError') return res.status(409).json({ error: err.name, message: err.message });
    console.error('[InboxCase] ApproveAction error:', err?.message);
    res.status(500).json({ error: 'InternalError', message: err?.message });
  }
}

export async function handleRejectAction(req: Request, res: Response) {
  const parsed = caseActionParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = rejectActionSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const action = await rejectAction(parsed.data.caseId, parsed.data.actionId, bodyParsed.data.rejected_by, bodyParsed.data.reason);
    res.json({ action: action.toJSON() });
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    if (err?.name === 'InvalidActionTransitionError') return res.status(409).json({ error: err.name, message: err.message });
    console.error('[InboxCase] RejectAction error:', err?.message);
    res.status(500).json({ error: 'InternalError', message: err?.message });
  }
}

export async function handleOverrideActions(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = overrideActionsSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const result = await overrideProposedActions(parsed.data.caseId, bodyParsed.data.instruction, (req as any).admin?.email || 'admin');
    res.json(result);
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    console.error('[InboxCase] OverrideActions error:', err?.message);
    res.status(500).json({ error: 'OverrideFailedError', message: err?.message });
  }
}

export async function handleApproveLowRiskActions(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = approveLowRiskSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const result = await approveLowRiskActions(parsed.data.caseId, bodyParsed.data.approved_by);
    res.json({ approved: result.approved, skipped_high_risk_or_individual: result.skippedHighRiskOrIndividual });
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    console.error('[InboxCase] ApproveLowRiskActions error:', err?.message);
    res.status(500).json({ error: 'InternalError', message: err?.message });
  }
}

export async function handleExecuteCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });

  try {
    const result = await executeApprovedActions(parsed.data.caseId, (req as any).admin?.email || 'admin');
    res.json(result);
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    if (err?.name === 'InvalidCaseTransitionError') return res.status(409).json({ error: err.name, message: err.message });
    if (err?.name === 'MaxRetriesExceededError') return res.status(409).json({ error: err.name, message: err.message });
    console.error('[InboxCase] ExecuteCase error:', err?.message);
    res.status(500).json({ error: 'ExecutionFailedError', message: err?.message });
  }
}

export async function handleVerifyCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });

  try {
    const result = await verifyCase(parsed.data.caseId, (req as any).admin?.email || 'admin');
    res.json(result);
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    if (err?.name === 'InvalidCaseTransitionError') return res.status(409).json({ error: err.name, message: err.message });
    console.error('[InboxCase] VerifyCase error:', err?.message);
    res.status(500).json({ error: 'VerificationFailedError', message: err?.message });
  }
}

export async function handleCloseCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = closeCaseSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const result = await closeCase(parsed.data.caseId, bodyParsed.data.closed_by);
    if (!result.closed) {
      return res.status(409).json({ error: 'ClosureBlockedError', blockers: result.blockers });
    }
    res.json({ closed: true });
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    console.error('[InboxCase] CloseCase error:', err?.message);
    res.status(500).json({ error: 'InternalError', message: err?.message });
  }
}

export async function handleSyncNow(req: Request, res: Response) {
  try {
    const result = await runAutoSync('admin', (req as any).admin?.email || 'admin');
    res.json(result);
  } catch (err: any) {
    console.error('[InboxCase] SyncNow error:', err?.message);
    res.status(500).json({ error: 'AutoSyncFailedError', message: err?.message });
  }
}

export async function handleReopenCase(req: Request, res: Response) {
  const paramsParsed = caseIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) return res.status(400).json({ error: 'ValidationError', details: paramsParsed.error.issues });
  const bodyParsed = reopenCaseSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const reopened = await reopenCase(paramsParsed.data.caseId, {
      actor_type: 'admin',
      actor_id: bodyParsed.data.reopened_by,
      event_type: 'case_reopened',
      reason: bodyParsed.data.reason,
    });
    res.json({ case: reopened.toJSON() });
  } catch (err: any) {
    if (err?.name === 'InvalidCaseTransitionError') {
      return res.status(409).json({ error: err.name, message: err.message });
    }
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    console.error('[InboxCase] ReopenCase error:', err?.message);
    res.status(500).json({ error: 'InternalError', message: err?.message });
  }
}
