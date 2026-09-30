/**
 * capeGovernanceController — CAPE Phase 6 Feed Control governance board (design
 * doc §12, §16 Phase 6). Same error-handling/adminId/response-shape conventions
 * as `capeAdminController.ts` (the Phase 0-1 admin panel's controller) — this is
 * a sibling surface, not a competing pattern.
 */
import { Request, Response, NextFunction } from 'express';
import {
  getCurrentGovernancePolicyRow, getGovernancePolicyHistory, updateGovernancePolicy,
} from '../services/cape/capeGovernancePolicyService';
import {
  listCurrentLifecycleModePolicies, getLifecycleModePolicyHistory, updateLifecycleModeMix,
} from '../services/cape/capeLifecycleModePolicyService';
import { getSkillCoverageHeatmap } from '../services/cape/capeSkillCoverageHeatmapService';
import { listPersonas, lookupEnrollment } from '../services/cape/capeGovernancePersonaService';
import { updateGovernancePolicySchema, updateLifecycleModeMixSchema } from '../schemas/capeSchema';
import type { LifecycleMode } from '../services/cape/capeLifecycleModeService';
import { ALL_LIFECYCLE_MODES } from '../services/cape/capeLifecycleModePolicyService';

// AuthPayload carries `.sub`, not `.id` — matches capeAdminController.ts's own convention.
const adminId = (req: Request): string | undefined => (req as any).admin?.sub || (req as any).user?.sub;

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) { res.status(e.status).json({ ok: false, error: e.message }); return; }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'cape_governance_controller_error', error_class: e?.name || 'Error', outcome: 'failure',
    context: { message: e?.message },
  }));
  next(e);
}

function isValidMode(mode: string): mode is LifecycleMode {
  return (ALL_LIFECYCLE_MODES as string[]).includes(mode);
}

/** GET /api/admin/cape/governance/policy */
export async function handleGetGovernancePolicy(_req: Request, res: Response, next: NextFunction) {
  try {
    const current = await getCurrentGovernancePolicyRow();
    res.json({ ok: true, policy: current });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/governance/policy/history */
export async function handleGetGovernancePolicyHistory(_req: Request, res: Response, next: NextFunction) {
  try {
    const history = await getGovernancePolicyHistory();
    res.json({ ok: true, history });
  } catch (e) { fail(res, e, next); }
}

/** PUT /api/admin/cape/governance/policy */
export async function handleUpdateGovernancePolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateGovernancePolicySchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const result = await updateGovernancePolicy(parsed.data, adminId(req));
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/governance/lifecycle-modes */
export async function handleListLifecycleModePolicies(_req: Request, res: Response, next: NextFunction) {
  try {
    const modes = await listCurrentLifecycleModePolicies();
    res.json({ ok: true, modes });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/governance/lifecycle-modes/:mode/history */
export async function handleGetLifecycleModePolicyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const mode = String(req.params.mode);
    if (!isValidMode(mode)) {
      // 404, not 400: an unknown :mode is a missing URL resource (like an
      // unknown :cardId), not a malformed request body — matches plan.md's
      // stated intent ("400 on validation error, 404 on unknown mode").
      res.status(404).json({ ok: false, error: `unknown lifecycle mode "${mode}"` });
      return;
    }
    const history = await getLifecycleModePolicyHistory(mode);
    res.json({ ok: true, history });
  } catch (e) { fail(res, e, next); }
}

/** PUT /api/admin/cape/governance/lifecycle-modes/:mode */
export async function handleUpdateLifecycleModePolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const mode = String(req.params.mode);
    if (!isValidMode(mode)) {
      // 404, not 400: an unknown :mode is a missing URL resource (like an
      // unknown :cardId), not a malformed request body — matches plan.md's
      // stated intent ("400 on validation error, 404 on unknown mode").
      res.status(404).json({ ok: false, error: `unknown lifecycle mode "${mode}"` });
      return;
    }
    const parsed = updateLifecycleModeMixSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const result = await updateLifecycleModeMix(mode, parsed.data, adminId(req));
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/governance/heatmap */
export async function handleGetSkillCoverageHeatmap(_req: Request, res: Response, next: NextFunction) {
  try {
    const heatmap = await getSkillCoverageHeatmap();
    res.json({ ok: true, ...heatmap });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/governance/personas */
export async function handleListPersonas(_req: Request, res: Response, next: NextFunction) {
  try {
    const personas = await listPersonas();
    res.json({ ok: true, personas });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/governance/lookup?query= */
export async function handleLookupEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const query = String(req.query.query || '');
    if (!query.trim()) {
      res.status(400).json({ ok: false, error: 'query is required' });
      return;
    }
    const result = await lookupEnrollment(query);
    if (!result) {
      res.status(404).json({ ok: false, error: 'no enrollment matches that email or id' });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}
