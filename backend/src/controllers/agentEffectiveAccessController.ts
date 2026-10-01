/**
 * agentEffectiveAccessController — Reese manager-growth mission, Phase 3
 * (T09/T10). Thin HTTP layer over agentEffectiveAccessService.ts's
 * read-only resolver and drift report. No writes: T11's admin tool
 * registration/assignment surface is explicitly out of scope this phase
 * (see execution-contract.md's "Explicitly out of scope").
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { resolveEffectiveAccess, buildInventoryDriftReport, buildToolCatalog } from '../services/workforce/agentEffectiveAccessService';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

/** GET /api/admin/tools — fleet-wide drift report (T09's own "inventory
 * drift" ask). Query params reserved for future filtering; none required
 * today, but still Zod-validated per this repo's Contract Enforcement
 * Layer — an unrecognized param 400s rather than being silently ignored. */
const listToolsQuerySchema = z.object({}).strict();

export async function handleListTools(req: Request, res: Response, next: NextFunction) {
  try {
    listToolsQuerySchema.parse(req.query);
    const [catalog, drift] = await Promise.all([buildToolCatalog(), buildInventoryDriftReport()]);
    res.json({ generatedAt: catalog.generatedAt, tools: catalog.tools, driftFindings: drift.findings });
  } catch (err) {
    fail(res, err, next);
  }
}

/** GET /api/admin/agents/:id/effective-access — one agent's full resolved
 * report. 404 (not 200-with-null) when the agent id doesn't resolve —
 * matches this repo's existing agent-detail route convention. */
export async function handleGetAgentEffectiveAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const report = await resolveEffectiveAccess(id);
    if (!report) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(report);
  } catch (err) {
    fail(res, err, next);
  }
}
