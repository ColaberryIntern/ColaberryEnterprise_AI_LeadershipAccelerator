import { Request, Response, NextFunction } from 'express';
import {
  listCurrentSkillDefinitions, getSkillDefinitionHistory, updateSkillDefinition,
} from '../services/cape/capeSkillDefinitionsService';
import { getCurrentWeightsRow, getWeightsHistory, updateWeights } from '../services/cape/capeEvidenceBandWeightsService';
import { resolveMappingForCard, createOrVersionMapping, assertCardExists } from '../services/cape/capeCurriculumSkillMapService';
import { updateSkillDefinitionSchema, updateEvidenceBandWeightsSchema, curriculumSkillMapCreateSchema } from '../schemas/capeSchema';

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

/**
 * CAPE Phase 3 (design doc §7, §12 "Timeline editor" card-level override) — the
 * backend contract for a card's resolved skill mapping. `GET` answers "what does
 * this card resolve to right now, and from which tier" (design doc §17 AC 5); `PUT`
 * creates a card-scoped override, always going through the same versioned write
 * path (`createOrVersionMapping`) every other scope uses.
 */

/** GET /api/admin/cape/curriculum-skill-maps/card/:cardId */
export async function handleGetCardSkillMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await resolveMappingForCard(String(req.params.cardId));
    res.json({ ok: true, ...result });
  } catch (e) { fail(res, e, next); }
}

/** PUT /api/admin/cape/curriculum-skill-maps/card/:cardId */
export async function handleUpsertCardSkillMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const cardId = String(req.params.cardId);
    // scope_type/card_id come from the URL, never the body — a card override can
    // only ever target the card the caller is looking at.
    const parsed = curriculumSkillMapCreateSchema.safeParse({
      ...(req.body || {}),
      scope_type: 'card',
      card_id: cardId,
      type_slug: null,
      week_number: null,
      created_by: adminId(req) ?? null,
    });
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    await assertCardExists(cardId);
    const result = await createOrVersionMapping(parsed.data);
    res.json({ ok: true, id: result.id, version: result.version, source: 'card_override' });
  } catch (e) { fail(res, e, next); }
}
