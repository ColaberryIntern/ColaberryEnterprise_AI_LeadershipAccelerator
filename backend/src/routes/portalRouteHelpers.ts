import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env';

/**
 * The three things every portal project route does identically.
 *
 * Extracted when `projectsPortalRoutes.ts` crossed the 500-line ceiling and the
 * Presentation Studio routes moved into their own router. Copying these into the
 * second file instead would have been the cheaper edit and the worse one: `gate`
 * decides whether a whole API surface exists, and two drifting copies of that is
 * how one router ends up still serving a feature the other has turned off.
 */

/** The caller's enrollment id. Identity comes from the token, never the body. */
export const eid = (req: Request): string => req.participant!.sub;

/**
 * The projects API flag, plus `no-store`.
 *
 * A flagged-off surface 404s rather than 403s, so probing it cannot distinguish
 * "exists but you may not" from "does not exist".
 */
export function gate(res: Response): boolean {
  if (!env.projectApiEnabled) {
    res.status(404).json({ error: 'Projects API not enabled' });
    return false;
  }
  res.set('Cache-Control', 'no-store');
  return true;
}

/**
 * Turns a thrown error into the right status.
 *
 * A Zod failure is the client's problem (400 with the issues). Anything carrying a
 * numeric `status` was deliberately tagged by a service and is reported as tagged.
 * Everything else goes to the error handler rather than being guessed at — an
 * unexpected error reported as a 400 tells the caller to fix a body that was fine.
 */
export function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}
