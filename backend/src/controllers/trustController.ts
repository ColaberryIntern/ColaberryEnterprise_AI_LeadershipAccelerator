/**
 * trustController — thin handlers for the Trust Command Center (/admin/trust).
 * Read-only. Validates nothing (no inputs); calls trustMetricsService and returns typed JSON.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
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
  getRegistryHealth,
  getCompositeBreakdown,
  getActivityDetail,
  getActivityDetailForDay,
  getBlockedWrites,
  getAgentRegistryDetail,
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

/** Full 211+-row ai_agents registry, bucketed by real status per the 2026-07-31 audit — not just the 10 Workforce directors getAgentRoster covers. */
export async function handleGetRegistryHealth(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getRegistryHealth());
  } catch (err) {
    fail(res, 'trust_registry_health', err);
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

// ---------------------------------------------------------------------------
// Phase B — Trust 90+ drill-down (T008-T013). See trustMetricsService.ts for the
// PII-scoping rule and the T012 extend-vs-sibling-route decision.
// ---------------------------------------------------------------------------

/** T008: drill-down for the composite-score tile. */
export async function handleGetCompositeBreakdown(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getCompositeBreakdown());
  } catch (err) {
    fail(res, 'trust_composite_breakdown', err);
  }
}

const activityKindSchema = z.enum(['conversations', 'generations', 'agent-runs', 'errors']);

/** T009: drill-down for one 24h StatCard (Conversations/Generations/Agent runs/Errors).
 *  `kind` is Zod-validated against a fixed enum; an invalid kind is a 400, not a 500. */
export async function handleGetActivityDetail(req: Request, res: Response): Promise<void> {
  try {
    const kind = activityKindSchema.parse(req.params.kind);
    res.json(await getActivityDetail(kind));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid activity kind — expected one of: conversations, generations, agent-runs, errors' });
      return;
    }
    fail(res, 'trust_activity_detail', err);
  }
}

const activityDayDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid calendar date');

/** T011: drill-down for one day of the 7-day activity trend chart. `date` is Zod-validated
 *  as a YYYY-MM-DD calendar date; anything else is a 400, not a 500. */
export async function handleGetActivityDetailForDay(req: Request, res: Response): Promise<void> {
  try {
    const date = activityDayDateSchema.parse(req.params.date);
    res.json(await getActivityDetailForDay(date));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' });
      return;
    }
    fail(res, 'trust_activity_detail_day', err);
  }
}

/** T010: drill-down for Governance's "Blocked agent writes 24h" tile. */
export async function handleGetBlockedWrites(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getBlockedWrites());
  } catch (err) {
    fail(res, 'trust_blocked_writes', err);
  }
}

/** T012: drill-down for any row in the full ai_agents registry (not just the 10 Workforce
 *  directors handleGetAgentDetail covers). Unknown names return 404, matching that handler's
 *  existing convention. `name` is never interpolated into SQL — see getAgentRegistryDetail. */
export async function handleGetAgentRegistryDetail(req: Request, res: Response): Promise<void> {
  try {
    const detail = await getAgentRegistryDetail(String(req.params.name || ''));
    if (!detail) {
      res.status(404).json({ error: 'Unknown agent' });
      return;
    }
    res.json(detail);
  } catch (err) {
    fail(res, 'trust_agent_registry_detail', err);
  }
}
