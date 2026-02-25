import { Request, Response, NextFunction } from 'express';
import {
  createCampaign,
  listCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  activateCampaign,
  pauseCampaign,
  completeCampaign,
  enrollLeadsInCampaign,
  removeLeadFromCampaign,
  getMatchingLeads,
  getCampaignStats,
  getCampaignLeads,
} from '../services/campaignService';
import {
  searchPeople,
  enrichPerson,
  importApolloResults,
  getApolloQuota,
} from '../services/apolloService';
import { generatePreview } from '../services/aiMessageService';
import { getCampaignAnalytics } from '../services/campaignAnalyticsService';

// ── Campaign CRUD ────────────────────────────────────────────────────

export async function handleListCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, status, page, limit } = req.query;
    const result = await listCampaigns({
      type: type as any,
      status: status as any,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleCreateCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description, type, sequence_id, targeting_criteria, channel_config, budget_total, ai_system_prompt } = req.body;

    if (!name || !type) {
      res.status(400).json({ error: 'name and type are required' });
      return;
    }

    const validTypes = ['warm_nurture', 'cold_outbound', 're_engagement'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: 'Invalid campaign type' });
      return;
    }

    const adminId = req.admin?.sub;
    if (!adminId) {
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }

    const campaign = await createCampaign({
      name,
      description,
      type,
      sequence_id,
      targeting_criteria,
      channel_config,
      budget_total,
      ai_system_prompt,
      created_by: adminId,
    });

    res.status(201).json({ campaign });
  } catch (error) {
    next(error);
  }
}

export async function handleGetCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getCampaignById(req.params.id as string);
    if (!result) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaign = await updateCampaign(req.params.id as string, req.body);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ campaign });
  } catch (error) {
    next(error);
  }
}

export async function handleDeleteCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deleted = await deleteCampaign(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

// ── Campaign Lifecycle ───────────────────────────────────────────────

export async function handleActivateCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaign = await activateCampaign(req.params.id as string);
    res.json({ campaign });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('Cannot activate')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handlePauseCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaign = await pauseCampaign(req.params.id as string);
    res.json({ campaign });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('not active')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleCompleteCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaign = await completeCampaign(req.params.id as string);
    res.json({ campaign });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

// ── Lead Enrollment ──────────────────────────────────────────────────

export async function handleEnrollLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { lead_ids } = req.body;
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      res.status(400).json({ error: 'lead_ids must be a non-empty array' });
      return;
    }
    const results = await enrollLeadsInCampaign(req.params.id as string, lead_ids);
    res.json({ results });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('no sequence')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleRemoveLeadFromCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leadId = parseInt(req.params.leadId as string, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }
    const result = await removeLeadFromCampaign(req.params.id as string, leadId);
    res.json({ result });
  } catch (error: any) {
    if (error.message.includes('not enrolled')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleGetMatchingLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leads = await getMatchingLeads(req.params.id as string);
    res.json({ leads, count: leads.length });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleGetCampaignStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await getCampaignStats(req.params.id as string);
    res.json({ stats });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleGetCampaignLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, page, limit } = req.query;
    const result = await getCampaignLeads(req.params.id as string, {
      status: status as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ── Apollo Integration ───────────────────────────────────────────────

export async function handleApolloSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await searchPeople(req.body);
    res.json(result);
  } catch (error: any) {
    if (error.message.includes('not configured')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleApolloImport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { people } = req.body;
    if (!Array.isArray(people) || people.length === 0) {
      res.status(400).json({ error: 'people must be a non-empty array' });
      return;
    }
    const result = await importApolloResults(people);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleApolloEnrich(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    const person = await enrichPerson(email);
    res.json({ person });
  } catch (error: any) {
    if (error.message.includes('not configured')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleApolloQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const quota = await getApolloQuota();
    res.json(quota);
  } catch (error) {
    next(error);
  }
}

// ── Campaign Analytics ──────────────────────────────────────────────

export async function handleGetCampaignAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const analytics = await getCampaignAnalytics(req.params.id as string, days);
    res.json({ analytics });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

// ── AI Preview ───────────────────────────────────────────────────────

export async function handleAIPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channel, ai_instructions, tone, system_prompt } = req.body;
    if (!channel || !ai_instructions) {
      res.status(400).json({ error: 'channel and ai_instructions are required' });
      return;
    }
    const result = await generatePreview(channel, ai_instructions, tone, system_prompt);
    res.json(result);
  } catch (error: any) {
    if (error.message.includes('not configured')) {
      res.status(400).json({ error: 'OpenAI API key not configured' });
      return;
    }
    next(error);
  }
}
