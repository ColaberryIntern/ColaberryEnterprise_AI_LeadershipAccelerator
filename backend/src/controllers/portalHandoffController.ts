import { Request, Response, NextFunction } from 'express';
import { createHandoff, exchangeHandoff, sqlHandoffStore } from '../services/portalHandoffService';
import { getPortalFlags } from '../services/portalFlagsService';

/**
 * POST /api/portal/handoff — authed: mint a QR to open Today on the phone.
 * From a read-only View-as session (C125) the code is marked with the admin, so the
 * phone gets the SAME read-only view. requireParticipant lets only this one write
 * through for read-only sessions.
 */
export async function handleCreateHandoff(req: Request, res: Response, next: NextFunction) {
  try {
    const p = req.participant!;
    const impersonatedBy = p.read_only ? (p.impersonated_by || 'admin') : null;
    const out = await createHandoff(p.sub, sqlHandoffStore, { impersonatedBy });
    res.json(out);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/portal/handoff/exchange?token=... — public: the phone trades the
 * one-time code for a session JWT. Failures return a friendly, non-leaky 401.
 */
export async function handleExchangeHandoff(req: Request, res: Response, next: NextFunction) {
  try {
    const token = String((req.query.token ?? (req.body && req.body.token)) || '');
    const result = await exchangeHandoff(token);
    if (!result.ok) {
      return res.status(401).json({
        error: 'This code has expired. Open a fresh one on your computer and scan again.',
        reason: result.reason,
      });
    }
    res.json({ jwt: result.jwt });
  } catch (err) {
    next(err);
  }
}

/** GET /api/portal/flags — public: portal feature flags for the frontend shell. */
export function handleGetPortalFlags(_req: Request, res: Response) {
  res.json(getPortalFlags());
}
