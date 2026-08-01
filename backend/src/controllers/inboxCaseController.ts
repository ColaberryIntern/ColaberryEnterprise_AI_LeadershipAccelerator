import { Request, Response } from 'express';
import { Op } from 'sequelize';
import InboxCase from '../models/InboxCase';
import InboxCaseEvent from '../models/InboxCaseEvent';
import { discoverCaseSchema, listCasesQuerySchema, caseIdParamSchema, caseItemParamSchema, updateCaseItemSchema, assessCaseSchema, quickResolveItemSchema } from '../schemas/inboxCaseSchema';
import { discoverCases } from '../services/inboxCase/caseDiscoveryService';
import { getCaseWithChildren } from '../services/inboxCase/caseRepository';
import { getCaseTicketId } from '../services/inboxCase/caseTicketService';
import { runAssessment } from '../services/inboxCase/caseAssessmentService';
import { quickResolveItem } from '../services/inboxCase/caseQuickResolveService';
import InboxCaseItem from '../models/InboxCaseItem';
import { logCaseEvent } from '../services/inboxCase/caseEventLog';
import { randomUUID } from 'crypto';

// Discovery, case listing/detail, and case-item disposition handlers for the
// Inbox Intel — Case Resolution Engine. Thin: validate with Zod, delegate to
// services, return typed JSON. Assess/Ask/Plan/Approve/Execute/Close live in
// sibling controllers (inboxCaseAssessController.ts, inboxCaseActionController.ts)
// so this file stays under the modular-composition size ceiling.

export async function handleDiscoverCase(req: Request, res: Response) {
  const parsed = discoverCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  }
  try {
    const summaries = await discoverCases({
      mode: parsed.data.mode,
      query: parsed.data.query,
      window: parsed.data.window as any,
      providers: parsed.data.providers as any,
      openedBy: (req as any).admin?.email || 'admin',
    });
    res.status(201).json({ cases: summaries });
  } catch (err: any) {
    console.error('[InboxCase] Discover error:', err?.message);
    res.status(500).json({ error: 'DiscoveryFailedError', message: err?.message });
  }
}

export async function handleListCases(req: Request, res: Response) {
  const parsed = listCasesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  }
  const { state, mode, page, limit, include_resolved } = parsed.data;
  const where: Record<string, unknown> = {};
  if (state) {
    where.state = state;
  } else if (!include_resolved) {
    // Default view hides RESOLVED cases so they don't clutter the active
    // list — still reachable via state=RESOLVED or include_resolved=true.
    // An explicit `state` filter above is completely unaffected by this.
    where.state = { [Op.ne]: 'RESOLVED' };
  }
  if (mode) where.mode = mode;

  const { count, rows } = await InboxCase.findAndCountAll({
    where,
    order: [['opened_at', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  res.json({ total: count, page, limit, cases: rows.map((r) => r.toJSON()) });
}

export async function handleGetCase(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });

  try {
    const { case: found, items, questions, actions } = await getCaseWithChildren(parsed.data.caseId);
    const ticketId = await getCaseTicketId(parsed.data.caseId);
    res.json({
      case: found.toJSON(),
      items: items.map((i) => i.toJSON()),
      questions: questions.map((q) => q.toJSON()),
      actions: actions.map((a) => a.toJSON()),
      ticket_id: ticketId,
    });
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    console.error('[InboxCase] GetCase error:', err?.message);
    res.status(500).json({ error: 'InternalError', message: err?.message });
  }
}

export async function handleUpdateCaseItem(req: Request, res: Response) {
  const paramsParsed = caseItemParamSchema.safeParse(req.params);
  if (!paramsParsed.success) return res.status(400).json({ error: 'ValidationError', details: paramsParsed.error.issues });
  const bodyParsed = updateCaseItemSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  const { caseId, itemId } = paramsParsed.data;
  const item = await InboxCaseItem.findOne({ where: { id: itemId, case_id: caseId } });
  if (!item) return res.status(404).json({ error: 'CaseItemNotFoundError' });

  const before = { inclusion_status: item.inclusion_status, disposition: item.disposition };
  await item.update({ ...bodyParsed.data, updated_at: new Date() });

  const caseRow = await InboxCase.findByPk(caseId);
  await logCaseEvent({
    case_id: caseId,
    item_id: itemId,
    event_type: bodyParsed.data.disposition ? 'item_disposition_changed' : 'candidate_manually_adjusted',
    actor_type: 'admin',
    actor_id: (req as any).admin?.email || 'admin',
    details: { before, after: bodyParsed.data },
    correlation_id: caseRow?.correlation_id || randomUUID(),
  });

  res.json({ item: item.toJSON() });
}

export async function handleQuickResolveItem(req: Request, res: Response) {
  const paramsParsed = caseItemParamSchema.safeParse(req.params);
  if (!paramsParsed.success) return res.status(400).json({ error: 'ValidationError', details: paramsParsed.error.issues });
  const bodyParsed = quickResolveItemSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const result = await quickResolveItem(
      paramsParsed.data.caseId,
      paramsParsed.data.itemId,
      bodyParsed.data.resolution,
      (req as any).admin?.email || 'admin'
    );
    res.json(result);
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    console.error('[InboxCase] QuickResolveItem error:', err?.message);
    res.status(500).json({ error: 'QuickResolveFailedError', message: err?.message });
  }
}

export async function handleAssessCase(req: Request, res: Response) {
  const paramsParsed = caseIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) return res.status(400).json({ error: 'ValidationError', details: paramsParsed.error.issues });
  const bodyParsed = assessCaseSchema.safeParse(req.body || {});
  if (!bodyParsed.success) return res.status(400).json({ error: 'ValidationError', details: bodyParsed.error.issues });

  try {
    const result = await runAssessment(paramsParsed.data.caseId, bodyParsed.data.requested_by);
    res.json({
      assessment: result.assessment,
      teaching_brief: result.teachingBrief,
      questions_created: result.questionsCreated,
      used_fallback: result.usedFallback,
    });
  } catch (err: any) {
    if (err?.statusCode === 404) return res.status(404).json({ error: err.error_class, message: err.message });
    if (err?.name === 'InvalidCaseTransitionError') return res.status(409).json({ error: err.name, message: err.message });
    console.error('[InboxCase] AssessCase error:', err?.message);
    res.status(500).json({ error: 'AssessmentFailedError', message: err?.message });
  }
}

export async function handleGetCaseAudit(req: Request, res: Response) {
  const parsed = caseIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });

  const events = await InboxCaseEvent.findAll({
    where: { case_id: parsed.data.caseId },
    order: [['created_at', 'ASC']],
  });
  res.json({ events: events.map((e) => e.toJSON()) });
}

export async function handleCaseStats(_req: Request, res: Response) {
  const [stateBreakdown] = (await InboxCase.sequelize!.query(`
    SELECT state, COUNT(*)::int as count FROM inbox_cases GROUP BY state
  `)) as [any[], unknown];

  const total = await InboxCase.count();
  const resolved = await InboxCase.count({ where: { state: 'RESOLVED' } });
  const needsAli = await InboxCase.count({ where: { state: 'NEEDS_ALI' } });
  const waiting = await InboxCase.count({ where: { state: 'WAITING' } });
  const failed = await InboxCase.count({ where: { state: 'FAILED' } });

  res.json({ total, resolved, needs_ali: needsAli, waiting, failed, state_breakdown: stateBreakdown });
}
