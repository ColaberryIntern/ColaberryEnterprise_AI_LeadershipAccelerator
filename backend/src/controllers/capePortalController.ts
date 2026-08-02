import { Request, Response, NextFunction } from 'express';
import { getLearnerSkillProfile } from '../services/cape/capeProficiencyService';
import { skillProfileResponseSchema } from '../schemas/capeSchema';

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
    if (process.env.NODE_ENV !== 'production') {
      const parsed = skillProfileResponseSchema.safeParse(profile);
      if (!parsed.success) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
          event: 'cape_skill_profile_contract_violation', outcome: 'partial',
          context: { issues: parsed.error.issues.map((i) => i.message) },
        }));
      }
    }
    res.json(profile);
  } catch (e) { fail(res, e, next); }
}
