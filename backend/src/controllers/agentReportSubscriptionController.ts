import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createReportSubscriptionInputSchema,
  updateReportSubscriptionInputSchema,
} from '../schemas/agentReportSubscriptionSchema';
import {
  createReportSubscription,
  listReportSubscriptions,
  updateReportSubscription,
  AgentNotFoundError,
  ReportSubscriptionNotFoundError,
} from '../services/agentReportSubscriptionService';

// AI Workforce Management, Checkpoint D — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentGoalController.ts / agentDetailController.ts.

function agentIdParam(req: Request): string | null {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return id || null;
}

export async function handleListReportSubscriptions(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const subscriptions = await listReportSubscriptions(id);
    if (!subscriptions) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agentId: id, subscriptions });
  } catch (err: any) {
    console.error('[AgentReportSubscription] Error:', err.message);
    res.status(500).json({ error: 'Failed to load report subscriptions' });
  }
}

export async function handleCreateReportSubscription(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const input = createReportSubscriptionInputSchema.parse(req.body || {});
    const subscription = await createReportSubscription(
      id,
      req.agentManagerOrgMemberId ?? null,
      req.admin!.email,
      input.contentScope,
      input.cadence,
      input.deliveryHourLocal,
      input.timezone,
    );
    res.status(201).json(subscription);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof AgentNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentReportSubscription] Error:', err.message);
    res.status(500).json({ error: 'Failed to create report subscription' });
  }
}

export async function handleUpdateReportSubscription(req: Request, res: Response) {
  try {
    const subscriptionIdParam = req.params.subscriptionId;
    const subscriptionId = Array.isArray(subscriptionIdParam) ? subscriptionIdParam[0] : subscriptionIdParam;
    if (!subscriptionId) {
      res.status(400).json({ error: 'Report subscription id is required' });
      return;
    }
    const input = updateReportSubscriptionInputSchema.parse(req.body || {});
    const subscription = await updateReportSubscription(subscriptionId, input);
    res.json(subscription);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof ReportSubscriptionNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentReportSubscription] Error:', err.message);
    res.status(500).json({ error: 'Failed to update report subscription' });
  }
}
