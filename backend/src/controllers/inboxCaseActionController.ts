import { Request, Response } from 'express';
import InboxCase from '../models/InboxCase';
import InboxCaseQuestion from '../models/InboxCaseQuestion';
import { caseQuestionParamSchema, caseIdParamSchema, caseActionParamSchema, answerQuestionSchema, approveActionSchema, rejectActionSchema, approveLowRiskSchema, closeCaseSchema, reopenCaseSchema } from '../schemas/inboxCaseSchema';
import { logCaseEvent } from '../services/inboxCase/caseEventLog';
import { reopenCase } from '../services/inboxCase/caseRepository';

// Plan/Approve/Execute/Verify/Close/Reopen handlers for the Inbox Intel —
// Case Resolution Engine. handleAnswerQuestion is fully implemented (Phase
// 3 lands the question-generation side that populates rows this consumes).
// The remaining handlers are implemented incrementally as their backing
// services land (action planner: Phase 4, executor/closure guard: Phase 5)
// — each currently returns 501 with an explicit "not yet implemented" body
// rather than a silent no-op, so a caller can never mistake "not built" for
// "succeeded with nothing to do."

const NOT_YET_IMPLEMENTED = (phase: string) => ({ error: 'NotYetImplemented', message: `This endpoint lands in ${phase} of the Inbox Intel build.` });

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

  res.json({ question: question.toJSON() });
}

export async function handleGeneratePlan(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  res.status(501).json(NOT_YET_IMPLEMENTED('Phase 4 (action planner)'));
}

export async function handleApproveAction(req: Request, res: Response) {
  const parsed = caseActionParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = approveActionSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });
  res.status(501).json(NOT_YET_IMPLEMENTED('Phase 4 (approval controls)'));
}

export async function handleRejectAction(req: Request, res: Response) {
  const parsed = caseActionParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = rejectActionSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });
  res.status(501).json(NOT_YET_IMPLEMENTED('Phase 4 (approval controls)'));
}

export async function handleApproveLowRiskActions(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = approveLowRiskSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });
  res.status(501).json(NOT_YET_IMPLEMENTED('Phase 4 (approval controls)'));
}

export async function handleExecuteCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  res.status(501).json(NOT_YET_IMPLEMENTED('Phase 5 (action executor)'));
}

export async function handleVerifyCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  res.status(501).json(NOT_YET_IMPLEMENTED('Phase 5 (verification)'));
}

export async function handleCloseCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  const bodyParsed = closeCaseSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });
  res.status(501).json(NOT_YET_IMPLEMENTED('Phase 5 (closure guard)'));
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
