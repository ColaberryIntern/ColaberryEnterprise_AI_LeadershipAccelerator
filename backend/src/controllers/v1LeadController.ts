import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { v1LeadSchema } from '../schemas/v1LeadSchema';
import { ingestExternalLead } from '../services/externalLeadIngestService';

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-lead-ingest', event, outcome, ...context }) + '\n'
  );
}

export async function createExternalLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();

  log('info', 'lead_ingest_start', 'partial', { correlation_id, source: req.body?.source });

  try {
    const payload = v1LeadSchema.parse(req.body);
    const result = await ingestExternalLead(payload, correlation_id);

    const duration_ms = Date.now() - start;
    // 201 on first create, 200 on idempotent duplicate — lets callers distinguish
    // new records from retries without guessing.
    const status = result.was_duplicate ? 200 : 201;
    log('info', 'lead_ingest_end', 'success', { correlation_id, status, was_duplicate: result.was_duplicate, duration_ms });

    res.status(status).json({
      id: String(result.id),
      created_at: result.created_at.toISOString(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'lead_ingest_validation_failure', 'failure', {
        correlation_id,
        error_class: 'ValidationError',
        issues: err.errors.map(e => ({ path: e.path, message: e.message })),
        duration_ms: Date.now() - start,
      });
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    log('error', 'lead_ingest_unhandled_error', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
    next(err);
  }
}
