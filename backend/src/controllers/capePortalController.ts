import { Request, Response, NextFunction } from 'express';
import { getLearnerSkillProfile } from '../services/cape/capeProficiencyService';
import { getSkillEvidenceHistory } from '../services/cape/capeSkillEvidenceHistoryService';
import { skillProfileResponseSchema, architectureSkillIdSchema, skillEvidenceHistoryResponseSchema } from '../schemas/capeSchema';
import { checkResponseContract } from '../utils/responseContract';

const eid = (req: Request) => req.participant!.sub;

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) { res.status(e.status).json({ error: e.message || 'error' }); return; }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'cape_portal_controller_error', error_class: e?.name || 'Error', outcome: 'failure',
    context: { message: e?.message },
  }));
  next(e);
}

/**
 * GET /api/portal/cape/skill-profile — the single backend learner-skill profile
 * that replaces the in-browser SkillMeter radar math and the hardcoded Readiness
 * ring (design doc §2, §11, §17 AC 10). Response shape validated against the Zod
 * contract in dev (backend/CLAUDE.md: "validate the actual response against the
 * shape and fail loud if it diverges").
 */
export async function handleGetSkillProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getLearnerSkillProfile(eid(req));
    checkResponseContract('cape_skill_profile_contract_violation', skillProfileResponseSchema, profile);
    res.json(profile);
  } catch (e) { fail(res, e, next); }
}

/**
 * GET /api/portal/cape/skill-profile/:skillId/evidence — CAPE Phase 5 skill-
 * detail drawer (design doc §11 radar click-through, §16 Phase 5): current
 * placement/verified level, evidence history, next recommended proof.
 */
export async function handleGetSkillEvidenceHistory(req: Request, res: Response, next: NextFunction) {
  const parsedSkill = architectureSkillIdSchema.safeParse(req.params.skillId);
  if (!parsedSkill.success) {
    res.status(400).json({ ok: false, error: `unknown skill_id: ${req.params.skillId}` });
    return;
  }
  try {
    const history = await getSkillEvidenceHistory(eid(req), parsedSkill.data);
    checkResponseContract('cape_skill_evidence_history_contract_violation', skillEvidenceHistoryResponseSchema, history);
    res.json(history);
  } catch (e) { fail(res, e, next); }
}
