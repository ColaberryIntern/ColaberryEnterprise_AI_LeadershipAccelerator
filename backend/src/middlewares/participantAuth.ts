import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logAuthFailure } from './authFailureLog';

export interface ParticipantPayload {
  sub: string;
  email: string;
  cohort_id: string;
  role: 'participant';
}

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
    req.participant = payload;
    next();
  } catch (err) {
    logAuthFailure('participant_auth_failed', err, 'participant', req.ip);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
