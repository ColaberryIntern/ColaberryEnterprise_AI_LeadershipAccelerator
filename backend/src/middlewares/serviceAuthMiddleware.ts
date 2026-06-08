import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// Service-to-service Bearer token auth for external integrations.
// Used by POST /api/v1/leads (training.colaberry.com → enterprise.colaberry.ai).
// Token is a static shared secret set via ENTERPRISE_CRM_TOKEN env var — not a JWT.
// Ali generates it once with `openssl rand -hex 32` and provides it to both:
//   - this backend (container env: ENTERPRISE_CRM_TOKEN)
//   - Sai's Cloud Run (ENTERPRISE_CRM_TOKEN env var)
export function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Service token required' });
    return;
  }

  const token = authHeader.slice(7);
  if (!env.enterpriseCrmToken || token !== env.enterpriseCrmToken) {
    res.status(401).json({ error: 'Invalid service token' });
    return;
  }

  next();
}
