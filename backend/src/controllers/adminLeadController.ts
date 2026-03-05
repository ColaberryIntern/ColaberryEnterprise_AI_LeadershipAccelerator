import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { updateLeadSchema, leadFilterSchema } from '../schemas/leadAdminSchema';
import {
  listLeads,
  getLeadDetail,
  updateLead,
  getLeadStats,
  generateLeadCsv,
  getPipelineStats,
  createLeadAdmin,
  batchUpdateLeads,
} from '../services/leadService';
import { logStageChange } from '../services/activityService';
import { getTemperatureHistory, classifyLeadManual } from '../services/leadClassificationService';
import StrategyCall from '../models/StrategyCall';
import StrategyCallIntelligence from '../models/StrategyCallIntelligence';
import Lead from '../models/Lead';
import { CampaignLead, Activity } from '../models';

export async function handleAdminListLeads(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filters = leadFilterSchema.parse(req.query);
    const result = await listLeads(filters);
    res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'Invalid query parameters' });
      return;
    }
    next(error);
  }
}

export async function handleAdminGetLeadStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getLeadStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

export async function handleAdminGetLead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }
    const result = await getLeadDetail(id);
    if (!result) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    let visitorData = null;
    if (result.lead.visitor_id) {
      try {
        const { Visitor, VisitorSession, IntentScore, BehavioralSignal } = require('../models');
        const visitor = await Visitor.findByPk(result.lead.visitor_id);
        if (visitor) {
          const [recentSessions, intentScore, recentSignals] = await Promise.all([
            VisitorSession.findAll({
              where: { visitor_id: visitor.id },
              order: [['started_at', 'DESC']],
              limit: 10,
            }),
            IntentScore.findOne({ where: { visitor_id: visitor.id } }),
            BehavioralSignal.findAll({
              where: { visitor_id: visitor.id },
              order: [['detected_at', 'DESC']],
              limit: 15,
              attributes: ['id', 'signal_type', 'signal_strength', 'detected_at'],
            }),
          ]);
          visitorData = {
            id: visitor.id,
            total_sessions: visitor.total_sessions,
            total_pageviews: visitor.total_pageviews,
            first_seen_at: visitor.first_seen_at,
            last_seen_at: visitor.last_seen_at,
            device_type: visitor.device_type,
            city: visitor.city,
            country: visitor.country,
            referrer_domain: visitor.referrer_domain,
            recent_sessions: recentSessions,
            intent_score: intentScore?.score ?? null,
            intent_level: intentScore?.intent_level ?? null,
            signals: recentSignals,
          };
        }
      } catch (err) {
        console.error('[AdminLead] Failed to load visitor data:', err);
      }
    }

    res.json({ ...result, visitor: visitorData });
  } catch (error) {
    next(error);
  }
}

export async function handleAdminUpdateLead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }
    const data = updateLeadSchema.parse(req.body);
    const lead = await updateLead(id, data);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json({ lead });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    next(error);
  }
}

const VALID_PIPELINE_STAGES = [
  'new_lead', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled', 'lost',
];

export async function handleAdminUpdatePipelineStage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const { pipeline_stage } = req.body;
    if (!pipeline_stage || !VALID_PIPELINE_STAGES.includes(pipeline_stage)) {
      res.status(400).json({ error: 'Invalid pipeline stage' });
      return;
    }

    const lead = await updateLead(id, { pipeline_stage });
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const adminUserId = req.admin?.sub || null;
    const oldStage = req.body.from_stage || 'unknown';
    if (adminUserId) {
      await logStageChange(id, adminUserId, oldStage, pipeline_stage);
    }

    res.json({ lead });
  } catch (error) {
    next(error);
  }
}

export async function handleAdminGetPipelineStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getPipelineStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

export async function handleAdminExportLeads(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const csv = await generateLeadCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

export async function handleAdminCreateLead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, company, title, phone, role, source, notes } = req.body;

    if (!name || !email) {
      res.status(400).json({ error: 'Name and email are required' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }

    const result = await createLeadAdmin({ name, email, company, title, phone, role, source, notes });

    if (result.isDuplicate) {
      const field = (result as any).duplicateField === 'phone' ? 'phone number' : 'email';
      res.status(409).json({ error: `A lead with this ${field} already exists`, lead: result.lead });
      return;
    }

    res.status(201).json({ lead: result.lead });
  } catch (error) {
    next(error);
  }
}

const VALID_STATUSES = ['new', 'contacted', 'qualified', 'enrolled', 'lost'];

export async function handleAdminBatchUpdate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ids, pipeline_stage, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }

    if (ids.length > 100) {
      res.status(400).json({ error: 'Maximum 100 leads per batch update' });
      return;
    }

    if (pipeline_stage && !VALID_PIPELINE_STAGES.includes(pipeline_stage)) {
      res.status(400).json({ error: 'Invalid pipeline stage' });
      return;
    }

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    if (!pipeline_stage && !status) {
      res.status(400).json({ error: 'At least one update field (pipeline_stage or status) is required' });
      return;
    }

    const result = await batchUpdateLeads(ids, { pipeline_stage, status });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ── Lead Temperature ────────────────────────────────────────────────

export async function handleGetTemperatureHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }
    const history = await getTemperatureHistory(id);
    res.json({ history });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateTemperature(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }
    const { temperature } = req.body;
    const validTemps = ['cold', 'cool', 'warm', 'hot', 'qualified'];
    if (!temperature || !validTemps.includes(temperature)) {
      res.status(400).json({ error: `temperature must be one of: ${validTemps.join(', ')}` });
      return;
    }
    const adminId = req.admin?.sub;
    const result = await classifyLeadManual(id, temperature, adminId);
    res.json(result);
  } catch (error: any) {
    if (error.message === 'Lead not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

// ── Strategy Prep Intelligence ─────────────────────────────────────

export async function handleGetLeadStrategyPrep(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const calls = await StrategyCall.findAll({
      where: { lead_id: id },
      include: [{ model: StrategyCallIntelligence, as: 'intelligence' }],
      order: [['created_at', 'DESC']],
    });

    res.json({ strategyCalls: calls });
  } catch (error) {
    next(error);
  }
}

// ── Delete Lead ─────────────────────────────────────────────────────

export async function handleDeleteLead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const lead = await Lead.findByPk(id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    // Cascade: remove related records
    await CampaignLead.destroy({ where: { lead_id: id } });
    await Activity.destroy({ where: { lead_id: id } });
    await lead.destroy();

    console.log(`[Admin] Lead ${id} (${lead.name}) deleted by admin`);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
