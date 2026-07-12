import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { v1CallbackSchema } from '../schemas/v1CallbackSchema';
import { requestInstantCallback, CallbackStatus } from '../services/callbackRequestService';

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-request-callback', event, outcome, ...context }) + '\n',
  );
}

// Map the service outcome to an HTTP status.
//   202 — call handed to Synthflow
//   200 — understood, no call placed (idempotent replay, safety block, or no-op)
//   502 — Synthflow upstream failed; the caller may retry
function statusToHttp(status: CallbackStatus): number {
  switch (status) {
    case 'call_initiated':
      return 202;
    case 'deduplicated':
    case 'blocked':
    case 'skipped':
      return 200;
    case 'failed':
      return 502;
  }
}

/**
 * POST /api/v1/request-callback
 * training.colaberry.com -> enterprise.colaberry.ai. Service-token auth.
 * Triggers an outbound Synthflow "call me now" callback for a training-site visitor.
 */
export async function requestCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();

  log('info', 'callback_request_start', 'partial', { correlation_id, source: req.body?.source });

  try {
    const payload = v1CallbackSchema.parse(req.body);
    const result = await requestInstantCallback(payload, correlation_id);

    const http = statusToHttp(result.status);
    const duration_ms = Date.now() - start;
    log('info', 'callback_request_end', result.status === 'failed' ? 'failure' : 'success', {
      correlation_id,
      status: result.status,
      http,
      lead_id: result.lead_id,
      call_id: result.call_id,
      duration_ms,
    });

    res.status(http).json({
      status: result.status,
      lead_id: String(result.lead_id),
      call_id: result.call_id,
      deduped: result.deduped,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'callback_validation_failure', 'failure', {
        correlation_id,
        error_class: 'ValidationError',
        issues: err.issues.map((e) => ({ path: e.path, message: e.message })),
        duration_ms: Date.now() - start,
      });
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    log('error', 'callback_unhandled_error', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
    next(err);
  }
}
