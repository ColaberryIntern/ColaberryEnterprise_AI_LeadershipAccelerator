import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createReportSubscriptionInputSchema,
  updateReportSubscriptionInputSchema,
  reportPreviewQuerySchema,
} from '../schemas/agentReportSubscriptionSchema';
import {
  createReportSubscription,
  listReportSubscriptions,
  updateReportSubscription,
  AgentNotFoundError,
  ReportSubscriptionNotFoundError,
} from '../services/agentReportSubscriptionService';
import { listReportRunsForAgent, renderReportContent } from '../services/agentReportRunService';

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

/** GET /api/admin/agents/:id/report-runs — real delivery history + an
 * honestly-computed success rate. AI Agent Dashboard redesign, Checkpoint C,
 * Reports slice (2026-09-02) — see agentReportRunService.ts's own header
 * comment for why this endpoint didn't exist until now. */
export async function handleListReportRuns(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const history = await listReportRunsForAgent(id);
    if (!history) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(history);
  } catch (err: any) {
    console.error('[AgentReportRun] Error:', err.message);
    res.status(500).json({ error: 'Failed to load report delivery history' });
  }
}

/** GET /api/admin/agents/:id/report-preview?contentScope=cost,activity —
 * real, on-demand report generation with no side effect: no AgentReportRun
 * row written, no email sent. Checkpoint G (2026-09-10) — Ali: "you can
 * schedule a report but have no idea what it even looks like." Wraps
 * renderReportContent() wholesale, the exact same function the real cron
 * delivery path (dispatchDueReportRuns()) calls — a preview and the report
 * that actually gets sent can never drift apart, because they're the same
 * code path. Callable for ANY contentScope combination, including one that
 * hasn't been saved as a subscription yet — this is what lets the create
 * form preview what the manager is about to subscribe to, before they
 * commit to it. */
export async function handleReportPreview(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const query = reportPreviewQuerySchema.parse(req.query);
    const rendered = await renderReportContent(id, query.contentScope);
    if (!rendered) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ subject: rendered.subject, html: rendered.html, text: rendered.text });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    console.error('[AgentReportRun] Error:', err.message);
    res.status(500).json({ error: 'Failed to render report preview' });
  }
}
