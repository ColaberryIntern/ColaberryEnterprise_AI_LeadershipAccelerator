import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logAuthFailure } from './authFailureLog';
import type { AuthPayload } from './authMiddleware';
import { reviewerKind } from '../services/career/careerMentorScopeService';

/**
 * requireCareerReviewer — the gate on the portfolio review surface.
 *
 * Wider than `requireAdmin` (mentors get in) and NARROWER in effect, because passing
 * this middleware does not decide WHOSE portfolios you see. That is
 * careerMentorScopeService's job, applied per query inside the controller.
 *
 * Deliberately its own middleware rather than a flag on requireAdmin: this is the only
 * surface where a non-admin staff role can read another person's career evidence, and
 * that deserves to be visible in the route definition rather than buried in a boolean.
 *
 * Clients/employers never reach here at all. They have no admin token, so they fall at
 * the first check, and the only career surface they can touch is the public frozen
 * snapshot at /api/public/talent/:slug.
 */
export function requireCareerReviewer(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(authHeader.split(' ')[1], env.jwtSecret) as AuthPayload;
    const kind = reviewerKind({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      mgmt_role: payload.mgmt_role,
      enrollmentId: (payload as any).enrollment_id ?? null,
    });

    if (kind === 'none') {
      res.status(403).json({ error: 'Portfolio review access required' });
      return;
    }

    req.admin = payload;
    next();
  } catch (err) {
    logAuthFailure('career_reviewer_auth_failed', err, 'admin', req.ip, req);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export default requireCareerReviewer;
