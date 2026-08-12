import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logAuthFailure } from './authFailureLog';

export interface ParticipantPayload {
  sub: string;
  email: string;
  cohort_id: string;
  role: 'participant';
  // Read-only impersonation ("View as member"): when true, an admin is viewing
  // this participant's portal and MUST NOT be able to mutate anything. Enforced
  // centrally below (all non-GET blocked) + the few GET-that-write endpoints
  // no-op their write when req.participant.read_only is set.
  read_only?: boolean;
  impersonated_by?: string; // admin sub/email that minted the read-only token (audit)
  // NOT a JWT claim — populated per-request by Community Rooms'
  // attachCommunityStaffContext middleware (community_members.role === 'staff'),
  // so downstream handlers can read "is this participant staff" synchronously.
  isStaff?: boolean;
}

// Safe (non-mutating) HTTP methods — the only ones a read-only viewer may use.
const READ_ONLY_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

declare global {
  namespace Express {
    interface Request {
      participant?: ParticipantPayload;
    }
  }
}

export function requireParticipant(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret) as ParticipantPayload;
    if (payload.role !== 'participant') {
      res.status(403).json({ error: 'Participant access required' });
      return;
    }
    // Read-only impersonation: block every mutating request at the single choke
    // point that guards all participant routes. This covers ~300 write endpoints
    // (posts, submissions, progression, presence, billing, recordings, …) with
    // one rule; the handful of GET-that-write endpoints additionally no-op their
    // write when they see req.participant.read_only.
    if (payload.read_only && !READ_ONLY_SAFE_METHODS.has(req.method)) {
      res.status(403).json({ error: 'Read-only view — actions are disabled while viewing as this member.' });
      return;
    }
    req.participant = payload;
    next();
  } catch (err) {
    logAuthFailure('participant_auth_failed', err, 'participant', req.ip);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
