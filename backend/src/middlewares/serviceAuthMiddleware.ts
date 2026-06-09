import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// Service-to-service Bearer token auth for external integrations.
// Used by POST /api/v1/leads (training.colaberry.com → enterprise.colaberry.ai).
// Token is a static shared secret set via ENTERPRISE_CRM_TOKEN env var — not a JWT.
// Ali generates it once with `openssl rand -hex 32` and provides it to both:
//   - this backend (container env: ENTERPRISE_CRM_TOKEN)
//   - Sai's Cloud Run (ENTERPRISE_CRM_TOKEN env var)

function log(level: 'warn' | 'error', event: string, context: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-lead-ingest', event, outcome: 'failure', ...context }) + '\n'
  );
}

// Hash both tokens to fixed-length SHA-256 buffers before comparing so that
// neither string length nor individual character positions leak via timing.
function timingSafeTokenEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log('warn', 'auth_missing_header', { error_class: 'AuthError', ip: req.ip });
    res.status(401).json({ error: 'Service token required' });
    return;
  }

  const token = authHeader.slice(7);
  if (!env.enterpriseCrmToken || !timingSafeTokenEqual(token, env.enterpriseCrmToken)) {
    log('warn', 'auth_invalid_token', { error_class: 'AuthError', ip: req.ip });
    res.status(401).json({ error: 'Invalid service token' });
    return;
  }

  next();
}
