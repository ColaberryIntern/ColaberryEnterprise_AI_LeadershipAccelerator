import { Request, Response } from 'express';
import * as aiOpsService from '../services/aiOpsService';
import { scanAllCampaigns, scanCampaign } from '../services/campaignHealthScanner';
import { runRepairAgent, runContentOptimization, runConversationOptimization } from '../services/aiOrchestrator';
import AiAgent from '../models/AiAgent';
import Campaign from '../models/Campaign';

// --- Overview ---

export async function handleGetOverview(req: Request, res: Response) {
  try {
    const overview = await aiOpsService.getOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Agents ---

export async function handleGetAgents(req: Request, res: Response) {
  try {
    const agents = await aiOpsService.getAgents();
    res.json(agents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateAgent(req: Request, res: Response) {
  try {
    const agent = await aiOpsService.updateAgent(String(req.params.id), req.body);
    res.json(agent);
  } catch (err: any) {
    res.status(err.message === 'Agent not found' ? 404 : 500).json({ error: err.message });
  }
}

export async function handleRunAgent(req: Request, res: Response) {
  try {
    const agent = await AiAgent.findByPk(String(req.params.id));
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    let result;
    switch (agent.agent_type) {
      case 'repair':
        result = await runRepairAgent();
        break;
      case 'content_optimization':
        result = await runContentOptimization();
        break;
      case 'conversation_optimization':
        result = await runConversationOptimization();
        break;
      default:
        return res.status(400).json({ error: `Unknown agent type: ${agent.agent_type}` });
    }

    res.json(result || { message: 'Agent is paused or not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Activity Log ---

export async function handleGetActivity(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getActivityLog({
      agent_id: req.query.agent_id as string,
      campaign_id: req.query.campaign_id as string,
      action: req.query.action as string,
      result: req.query.result as string,
      from: req.query.from as string,
      to: req.query.to as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Health ---

export async function handleGetHealth(req: Request, res: Response) {
  try {
    const records = await aiOpsService.getHealthRecords();
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleTriggerScan(req: Request, res: Response) {
  try {
    const results = await scanAllCampaigns();
    res.json({ scanned: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleTriggerCampaignScan(req: Request, res: Response) {
  try {
    const campaign = await Campaign.findByPk(String(req.params.campaignId));
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const result = await scanCampaign(campaign);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Errors ---

export async function handleGetErrors(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getErrors({
      campaign_id: req.query.campaign_id as string,
      component: req.query.component as string,
      severity: req.query.severity as string,
      resolved: req.query.resolved as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleResolveError(req: Request, res: Response) {
  try {
    const error = await aiOpsService.resolveError(String(req.params.id));
    res.json(error);
  } catch (err: any) {
    res.status(err.message === 'Error not found' ? 404 : 500).json({ error: err.message });
  }
}

// --- Events ---

export async function handleGetEvents(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getEvents({
      source: req.query.source as string,
      event_type: req.query.event_type as string,
      from: req.query.from as string,
      to: req.query.to as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Agent Registry ---

export async function handleGetAgentRegistry(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getAgentRegistry({
      category: req.query.category as string,
      status: req.query.status as string,
      enabled: req.query.enabled as string,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetAgentDetail(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getAgentDetail(String(req.params.id));
    res.json(result);
  } catch (err: any) {
    res.status(err.message === 'Agent not found' ? 404 : 500).json({ error: err.message });
  }
}

export async function handleControlAgent(req: Request, res: Response) {
  try {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });
    const result = await aiOpsService.controlAgent(String(req.params.id), action);
    res.json(result);
  } catch (err: any) {
    res.status(err.message === 'Agent not found' ? 404 : 500).json({ error: err.message });
  }
}

// --- Execution Trace ---

export async function handleGetExecutionTrace(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getExecutionTrace(String(req.params.traceId));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Activity Detail ---

export async function handleGetActivityDetail(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getActivityDetail(String(req.params.id));
    res.json(result);
  } catch (err: any) {
    res.status(err.message === 'Activity not found' ? 404 : 500).json({ error: err.message });
  }
}

// --- Error Detail ---

export async function handleGetErrorDetail(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getErrorDetail(String(req.params.id));
    res.json(result);
  } catch (err: any) {
    res.status(err.message === 'Error not found' ? 404 : 500).json({ error: err.message });
  }
}

// --- Campaign Timeline ---

export async function handleGetCampaignTimeline(req: Request, res: Response) {
  try {
    const result = await aiOpsService.getCampaignTimeline(String(req.params.id));
    res.json(result);
  } catch (err: any) {
    res.status(err.message === 'Campaign not found' ? 404 : 500).json({ error: err.message });
  }
}

// --- Campaign Restart ---

export async function handleRestartCampaign(req: Request, res: Response) {
  try {
    const result = await aiOpsService.restartCampaignActions(String(req.params.id));
    res.json(result);
  } catch (err: any) {
    res.status(err.message === 'Campaign not found' ? 404 : 500).json({ error: err.message });
  }
}
