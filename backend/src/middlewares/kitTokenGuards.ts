import type { NextFunction, Request, Response } from 'express';
import { verifyDeckToken, verifyKitToken } from '../services/classKit/kitToken';
import { requireAdmin, requireFullAdmin } from './authMiddleware';

const tokenOf = (req: Request): string | undefined => (typeof req.query.t === 'string' ? req.query.t : undefined);

/** Class controls: a token for this session (deck or presenter page), or any staff login. Mentors run classes. */
export function kitTokenOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (verifyKitToken(tokenOf(req), req.params.id as string)) { next(); return; }
  requireAdmin(req, res, next);
}

/** The half-price offer: the deck's own token, or a full administrator (Ali, 2026-11-25). */
export function deckTokenOrFullAdmin(req: Request, res: Response, next: NextFunction): void {
  if (verifyDeckToken(tokenOf(req), req.params.id as string)) { next(); return; }
  requireFullAdmin(req, res, next);
}
