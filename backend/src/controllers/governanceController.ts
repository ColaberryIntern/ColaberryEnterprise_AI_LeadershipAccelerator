import { Request, Response } from 'express';
import {
  getGovernanceOverview,
  getGovernanceAgents,
  getGovernanceAlerts,
  checkAndRaiseAlerts,
} from '../services/governanceService';
import { AiAgent } from '../models';
import { getSetting, setSetting } from '../services/settingsService';

export async function handleGetOverview(req: Request, res: Response): Promise<void> {
  try {
    await checkAndRaiseAlerts();
    const overview = await getGovernanceOverview();
    const autonomyMode = await getSetting('ai_autonomy_mode');
    res.json({ ...overview, autonomy_mode: autonomyMode || 'full' });
  } catch (error: any) {
    console.error('[Governance] Overview failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch governance overview' });
  }
}

export async function handleGetAgents(req: Request, res: Response): Promise<void> {
  try {
    const agents = await getGovernanceAgents();
    res.json({ agents });
  } catch (error: any) {
    console.error('[Governance] Agents list failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
}

export async function handleGetAlerts(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const alerts = await getGovernanceAlerts(limit);
    res.json({ alerts });
  } catch (error: any) {
    console.error('[Governance] Alerts failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

export async function handleGetConfig(req: Request, res: Response): Promise<void> {
  try {
    const autonomyMode = await getSetting('ai_autonomy_mode');
    res.json({ ai_autonomy_mode: autonomyMode || 'full' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
}

export async function handleUpdateAgentToggle(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const { enabled } = req.body;
    const agent = await AiAgent.findByPk(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    await agent.update({ enabled: !!enabled });
    res.json({ agent });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update agent' });
  }
}

export async function handleUpdateConfig(req: Request, res: Response): Promise<void> {
  try {
    const { ai_autonomy_mode } = req.body;
    if (ai_autonomy_mode && ['full', 'safe', 'manual'].includes(ai_autonomy_mode)) {
      await setSetting('ai_autonomy_mode', ai_autonomy_mode, (req as any).admin?.sub);
    }
    res.json({ ai_autonomy_mode: ai_autonomy_mode || 'full' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update config' });
  }
}
