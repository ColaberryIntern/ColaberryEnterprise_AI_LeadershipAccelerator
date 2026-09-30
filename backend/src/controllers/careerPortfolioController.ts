/**
 * careerPortfolioController — HTTP boundary for the private Career Studio.
 * Follows capePortalController's established shape: resolve the subject from the
 * verified session ONLY, validate the response contract in non-production, emit
 * a structured error log, delegate everything else to `next(err)`.
 */
import { Request, Response, NextFunction } from 'express';
import { getCareerProfile } from '../services/career/careerProfileService';
import { careerProfileResponseSchema } from '../schemas/careerPortfolioSchema';
import { checkResponseContract } from '../utils/responseContract';

/**
 * The subject is ALWAYS the caller. No route in this file accepts an enrollment
 * id, slug or user id as a parameter, so cross-tenant read is unrepresentable in
 * the URL space rather than merely blocked by a check that could regress.
 * See MULTITENANCY_PRIVACY_MAP.md.
 */
const eid = (req: Request) => req.participant!.sub;

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) { res.status(e.status).json({ error: e.message || 'error' }); return; }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'career_portfolio_controller_error', error_class: e?.error_class || e?.name || 'Error',
    outcome: 'failure', context: { message: e?.message },
  }));
  next(e);
}

/**
 * GET /api/portal/career/profile — the whole private Career Studio payload.
 *
 * Returns `state: 'needs_resume'` with NO career evidence for a paid learner who
 * has not uploaded a resume (build plan §6.2, §39). That branch is decided in the
 * service, before any evidence is read.
 */
export async function handleGetCareerProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getCareerProfile(eid(req));
    checkResponseContract('career_profile_contract_violation', careerProfileResponseSchema, profile);
    res.json(profile);
  } catch (e) { fail(res, e, next); }
}
