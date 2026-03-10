import { Request, Response } from 'express';
import { runCampaignTest } from '../services/testing/campaignTestHarness';
import * as campaignTestService from '../services/testing/campaignTestService';

export async function handleRunCampaignTest(req: Request, res: Response) {
  try {
    const run = await runCampaignTest(String(req.params.id), 'manual');
    res.json(run);
  } catch (err: any) {
    const status = err.message === 'Campaign not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}

export async function handleGetTestRuns(req: Request, res: Response) {
  try {
    const runs = await campaignTestService.getTestRuns(String(req.params.id));
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetTestRunDetail(req: Request, res: Response) {
  try {
    const run = await campaignTestService.getTestRunDetail(String(req.params.runId));
    res.json(run);
  } catch (err: any) {
    const status = err.message === 'Test run not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}

export async function handleGetQASummary(req: Request, res: Response) {
  try {
    const summary = await campaignTestService.getQASummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
