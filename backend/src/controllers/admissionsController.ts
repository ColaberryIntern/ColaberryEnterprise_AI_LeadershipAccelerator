import { Request, Response, NextFunction } from 'express';
import { Op, fn, col } from 'sequelize';
import { ChatConversation, Lead, Visitor } from '../models';
import AdmissionsMemory from '../models/AdmissionsMemory';
import AdmissionsKnowledgeEntry from '../models/AdmissionsKnowledgeEntry';
import AdmissionsActionLog from '../models/AdmissionsActionLog';
import CallContactLog from '../models/CallContactLog';
import CallbackRequest from '../models/CallbackRequest';
import DocumentDeliveryLog from '../models/DocumentDeliveryLog';

/**
 * GET /api/admin/admissions/stats
 */
export async function handleGetAdmissionsStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      conversationsToday,
      conversationsWeek,
      activeConversations,
      totalMemories,
      returningCount,
      highIntentCount,
      enterpriseCount,
      ceoCount,
      visitorTypeDistribution,
    ] = await Promise.all([
      ChatConversation.count({ where: { started_at: { [Op.gte]: todayStart } } }),
      ChatConversation.count({ where: { started_at: { [Op.gte]: weekAgo } } }),
      ChatConversation.count({ where: { status: 'active' } }),
      AdmissionsMemory.count(),
      AdmissionsMemory.count({ where: { visitor_type: 'returning' } }),
      AdmissionsMemory.count({ where: { visitor_type: 'high_intent' } }),
      AdmissionsMemory.count({ where: { visitor_type: 'enterprise' } }),
      AdmissionsMemory.count({ where: { visitor_type: 'ceo' } }),
      AdmissionsMemory.findAll({
        attributes: ['visitor_type', [fn('COUNT', col('id')), 'count']],
        group: ['visitor_type'],
        raw: true,
      }) as any,
    ]);

    res.json({
      conversations_today: conversationsToday,
      conversations_week: conversationsWeek,
      active_conversations: activeConversations,
      total_known_visitors: totalMemories,
      returning_visitors: returningCount,
      high_intent_visitors: highIntentCount,
      enterprise_prospects: enterpriseCount,
      ceo_visits: ceoCount,
      visitor_type_distribution: (visitorTypeDistribution || []).reduce(
        (acc: any, r: any) => ({ ...acc, [r.visitor_type]: parseInt(r.count, 10) }), {}
      ),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/admissions/conversations
 */
export async function handleGetAdmissionsConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit = '25', offset = '0' } = req.query;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { rows, count } = await ChatConversation.findAndCountAll({
      where: { started_at: { [Op.gte]: weekAgo } },
      include: [
        {
          model: Visitor,
          as: 'visitor',
          include: [
            { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'company'], required: false },
          ],
        },
      ],
      order: [['started_at', 'DESC']],
      limit: Math.min(parseInt(limit as string, 10), 100),
      offset: parseInt(offset as string, 10),
    });

    // Enrich with visitor type from memory
    const enriched = await Promise.all(
      rows.map(async (conv: any) => {
        const memory = await AdmissionsMemory.findOne({ where: { visitor_id: conv.visitor_id } });
        return {
          id: conv.id,
          visitor_id: conv.visitor_id,
          visitor_type: memory?.visitor_type || 'new',
          page_category: conv.page_category,
          status: conv.status,
          message_count: conv.message_count,
          visitor_message_count: conv.visitor_message_count,
          summary: conv.summary,
          started_at: conv.started_at,
          ended_at: conv.ended_at,
          lead: conv.visitor?.lead || null,
        };
      })
    );

    res.json({ conversations: enriched, total: count });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/admissions/knowledge
 */
export async function handleGetKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { category } = req.query;
    const where: any = {};
    if (category) where.category = category;

    const entries = await AdmissionsKnowledgeEntry.findAll({
      where,
      order: [['category', 'ASC'], ['priority', 'DESC']],
    });

    res.json({ entries });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/admissions/knowledge
 */
export async function handleCreateKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { category, title, content, keywords, priority, active } = req.body;

    if (!category || !title || !content) {
      res.status(400).json({ error: 'category, title, and content are required' });
      return;
    }

    const entry = await AdmissionsKnowledgeEntry.create({
      category,
      title,
      content,
      keywords: keywords || [],
      priority: priority || 5,
      active: active !== false,
    });

    res.json(entry);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/admissions/knowledge/:id
 */
export async function handleUpdateKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const entry = await AdmissionsKnowledgeEntry.findByPk(req.params.id as string);
    if (!entry) {
      res.status(404).json({ error: 'Knowledge entry not found' });
      return;
    }

    const { category, title, content, keywords, priority, active } = req.body;
    await entry.update({
      ...(category !== undefined && { category }),
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(keywords !== undefined && { keywords }),
      ...(priority !== undefined && { priority }),
      ...(active !== undefined && { active }),
      updated_at: new Date(),
    });

    res.json(entry);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/admissions/operations
 */
export async function handleGetOperationsStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      documentsSentToday,
      callsScheduledToday,
      callbacksPending,
      emailsSentToday,
      smsSentToday,
      governanceDenialsToday,
      pendingActions,
    ] = await Promise.all([
      DocumentDeliveryLog.count({ where: { created_at: { [Op.gte]: todayStart } } }),
      CallContactLog.count({ where: { call_timestamp: { [Op.gte]: todayStart } } }),
      CallbackRequest.count({ where: { callback_status: 'pending' } }),
      AdmissionsActionLog.count({ where: { action_type: 'send_email', created_at: { [Op.gte]: todayStart }, status: 'completed' } }),
      AdmissionsActionLog.count({ where: { action_type: 'send_sms', created_at: { [Op.gte]: todayStart }, status: 'completed' } }),
      CallContactLog.count({ where: { call_status: 'denied', call_timestamp: { [Op.gte]: todayStart } } }),
      AdmissionsActionLog.count({ where: { status: 'pending' } }),
    ]);

    res.json({
      documents_sent_today: documentsSentToday,
      calls_scheduled_today: callsScheduledToday,
      callbacks_pending: callbacksPending,
      emails_sent_today: emailsSentToday,
      sms_sent_today: smsSentToday,
      governance_denials_today: governanceDenialsToday,
      pending_actions: pendingActions,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/admissions/callbacks
 */
export async function handleGetCallbacks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit = '25', offset = '0', status } = req.query;
    const where: any = {};
    if (status) where.callback_status = status;

    const { rows, count } = await CallbackRequest.findAndCountAll({
      where,
      order: [['request_timestamp', 'DESC']],
      limit: Math.min(parseInt(limit as string, 10), 100),
      offset: parseInt(offset as string, 10),
    });

    res.json({ callbacks: rows, total: count });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/admissions/call-log
 */
export async function handleGetCallLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit = '25', offset = '0' } = req.query;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { rows, count } = await CallContactLog.findAndCountAll({
      where: { call_timestamp: { [Op.gte]: weekAgo } },
      order: [['call_timestamp', 'DESC']],
      limit: Math.min(parseInt(limit as string, 10), 100),
      offset: parseInt(offset as string, 10),
    });

    res.json({ calls: rows, total: count });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/admissions/documents
 */
export async function handleGetDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit = '25', offset = '0' } = req.query;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { rows, count } = await DocumentDeliveryLog.findAndCountAll({
      where: { created_at: { [Op.gte]: weekAgo } },
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(limit as string, 10), 100),
      offset: parseInt(offset as string, 10),
    });

    res.json({ documents: rows, total: count });
  } catch (err) {
    next(err);
  }
}
