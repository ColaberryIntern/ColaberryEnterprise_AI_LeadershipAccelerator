import { Request, Response, NextFunction } from 'express';
import {
  listCurrentSkillDefinitions, getSkillDefinitionHistory, updateSkillDefinition,
} from '../services/cape/capeSkillDefinitionsService';
import { getCurrentWeightsRow, getWeightsHistory, updateWeights } from '../services/cape/capeEvidenceBandWeightsService';
import { updateSkillDefinitionSchema, updateEvidenceBandWeightsSchema } from '../schemas/capeSchema';

// AuthPayload (backend/src/middlewares/authMiddleware.ts) carries `.sub`, not `.id` —
// matches the convention in adminLeadController.ts/adminSettingsController.ts/etc.
const adminId = (req: Request): string | undefined => (req as any).admin?.sub || (req as any).user?.sub;

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) { res.status(e.status).json({ ok: false, error: e.message }); return; }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'cape_admin_controller_error', error_class: e?.name || 'Error', outcome: 'failure',
    context: { message: e?.message },
  }));
  next(e);
}

/** GET /api/admin/cape/skill-definitions */
export async function handleListSkillDefinitions(_req: Request, res: Response, next: NextFunction) {
  try {
    const defs = await listCurrentSkillDefinitions();
    res.json({ ok: true, skills: defs });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/skill-definitions/:skillId/history */
export async function handleGetSkillDefinitionHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await getSkillDefinitionHistory(String(req.params.skillId));
    res.json({ ok: true, history });
  } catch (e) { fail(res, e, next); }
}

/** PUT /api/admin/cape/skill-definitions/:skillId */
export async function handleUpdateSkillDefinition(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateSkillDefinitionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const result = await updateSkillDefinition(String(req.params.skillId), parsed.data, adminId(req));
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}

/** GET /api/admin/cape/evidence-band-weights */
export async function handleGetEvidenceBandWeights(_req: Request, res: Response, next: NextFunction) {
  try {
    const [current, history] = await Promise.all([getCurrentWeightsRow(), getWeightsHistory()]);
    res.json({ ok: true, current, history });
  } catch (e) { fail(res, e, next); }
}

/** PUT /api/admin/cape/evidence-band-weights */
export async function handleUpdateEvidenceBandWeights(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateEvidenceBandWeightsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const result = await updateWeights(parsed.data, adminId(req));
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}
