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
  getAgentRoster,
  getAgentDetail,
} from '../services/trustMetricsService';
import { runDirectorBySlug } from '../services/workforce/directorActions';
import { getAiValue } from '../services/aiValueService';
import { getRetentionReport } from '../services/retentionReportService';
import { enforceRetention } from '../services/retentionEnforcementService';

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

export async function handleGetRetention(req: Request, res: Response): Promise<void> {
  try {
    // Single optional numeric query param; the service clamps to [1,120]. Read-only (dry-run).
    const raw = req.query.ttlMonths;
    const ttlMonths = raw != null ? Number(raw) : undefined;
    res.json(await getRetentionReport(Number.isFinite(ttlMonths) ? ttlMonths : undefined));
  } catch (err) {
    fail(res, 'trust_retention', err);
  }
}

/** LIVE enforcement — deletes/anonymizes rows. Admin-gated POST, deliberate action, no scheduled auto-trigger yet. */
export async function handleEnforceRetention(req: Request, res: Response): Promise<void> {
  try {
    const raw = req.query.ttlMonths;
    const ttlMonths = raw != null ? Number(raw) : undefined;
    res.json(await enforceRetention(Number.isFinite(ttlMonths) ? ttlMonths : undefined));
  } catch (err) {
    fail(res, 'trust_retention_enforce', err);
  }
}

export async function handleGetAgentRoster(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getAgentRoster());
  } catch (err) {
    fail(res, 'trust_agent_roster', err);
  }
}

export async function handleGetAgentDetail(req: Request, res: Response): Promise<void> {
  try {
    // `slug` is matched against a fixed director-slug whitelist (WORKFORCE_AGENT_NAME); unknown
    // slugs return null (404). No injection surface — never interpolated into SQL.
    const detail = await getAgentDetail(String(req.params.slug || ''));
    if (!detail) {
      res.status(404).json({ error: 'Unknown AI Workforce director' });
      return;
    }
    res.json(detail);
  } catch (err) {
    fail(res, 'trust_agent_detail', err);
  }
}

/** Manual "run now" — same gate (kill switch / safe mode / enabled) as the cron path;
 *  this endpoint does not bypass anything, it just triggers the same runner on demand. */
export async function handleRunAgent(req: Request, res: Response): Promise<void> {
  try {
    const result = await runDirectorBySlug(String(req.params.slug || ''));
    if (!result) {
      res.status(404).json({ error: 'Unknown AI Workforce director' });
      return;
    }
    res.json(result);
  } catch (err) {
    fail(res, 'trust_agent_run', err);
  }
}
