/**
 * trustController — thin handlers for the Trust Command Center (/admin/trust).
 * Read-only. Validates nothing (no inputs); calls trustMetricsService and returns typed JSON.
 */
import { Request, Response } from 'express';
import {
  getTrustOverview,
  getActivityMetrics,
  getGovernanceStatus,
  getObservabilityStatus,
  getDimensionDetail,
  getTrustActions,
  getCostBreakdown,
} from '../services/trustMetricsService';
import { getAiValue } from '../services/aiValueService';

function fail(res: Response, event: string, err: unknown): void {
  const errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
  process.stderr.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'trust-controller',
      event,
      outcome: 'failure',
      error_class: errorClass,
    }) + '\n'
  );
  res.status(500).json({ error: 'Failed to load trust metrics' });
}

export async function handleGetOverview(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getTrustOverview());
  } catch (err) {
    fail(res, 'trust_overview', err);
  }
}

export async function handleGetActivity(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getActivityMetrics());
  } catch (err) {
    fail(res, 'trust_activity', err);
  }
}

export async function handleGetGovernance(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getGovernanceStatus());
  } catch (err) {
    fail(res, 'trust_governance', err);
  }
}

export async function handleGetObservability(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getObservabilityStatus());
  } catch (err) {
    fail(res, 'trust_observability', err);
  }
}

export async function handleGetDimension(req: Request, res: Response): Promise<void> {
  try {
    // `key` is matched against a fixed rubric whitelist; unknown keys return null (404). No injection surface.
    const detail = await getDimensionDetail(String(req.params.key || ''));
    if (!detail) {
      res.status(404).json({ error: 'Unknown trust dimension' });
      return;
    }
    res.json(detail);
  } catch (err) {
    fail(res, 'trust_dimension', err);
  }
}

export async function handleGetActions(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getTrustActions());
  } catch (err) {
    fail(res, 'trust_actions', err);
  }
}

export async function handleGetCostBreakdown(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getCostBreakdown());
  } catch (err) {
    fail(res, 'trust_cost_breakdown', err);
  }
}

export async function handleGetValue(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getAiValue());
  } catch (err) {
    fail(res, 'trust_value', err);
  }
}
