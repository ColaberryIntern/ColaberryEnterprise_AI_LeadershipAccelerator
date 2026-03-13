import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AlumniPayload {
  sub: string;
  email: string;
  role: 'alumni';
}

declare global {
  namespace Express {
    interface Request {
      alumni?: AlumniPayload;
    }
  }
}

export function requireAlumni(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AlumniPayload;
    if (payload.role !== 'alumni') {
      res.status(403).json({ error: 'Alumni access required' });
      return;
    }
    req.alumni = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
