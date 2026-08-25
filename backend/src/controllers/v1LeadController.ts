import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { v1LeadSchema } from '../schemas/v1LeadSchema';
import { ingestExternalLead } from '../services/externalLeadIngestService';
import { captureSignupConsent, SIGNUP_CONSENT_TEXT } from '../services/consent/captureSignupConsent';

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

    // Marketing consent, if they ticked the box on training.colaberry.com.
    //
    // Recorded before the response rather than fire-and-forget after it: this is
    // a legal record, so it should be durable by the time the caller is told the
    // lead landed.
    //
    // Guarded HERE as well as inside the helper. captureSignupConsent is
    // swallow-safe, but a call site is not automatically so - an unguarded
    // `req.get('user-agent')` threw at exactly this spot in enrollmentController
    // and the outer catch turned it into a request that never answered. Consent
    // capture must never be able to break a signup, so its failure is logged and
    // dropped here.
    try {
      await captureSignupConsent({
        email: payload.email,
        // Absent or false records NOTHING. It is not a revocation: writing
        // `revoked` for someone who simply did not tick would suppress a person
        // we are currently permitted to email, which is worse than silence.
        marketingOptIn: payload.marketing_opt_in,
        source: `training_site:${payload.source}`.slice(0, 120),
        consentText: payload.marketing_consent_text ?? SIGNUP_CONSENT_TEXT,
        // NOT req.ip / req.get(): this route is service-to-service, so those
        // describe the training site's server, not the person who ticked.
        // Evidence comes from the forwarded values or stays null.
        ipAddress: payload.ip_address ?? null,
        userAgent: payload.user_agent ?? null,
      });
    } catch (consentErr) {
      log('error', 'consent_capture_failed', 'failure', {
        correlation_id,
        error_class: consentErr instanceof Error ? consentErr.constructor.name : 'UnknownError',
        message: consentErr instanceof Error ? consentErr.message : String(consentErr),
      });
    }

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
        issues: err.issues.map(e => ({ path: e.path, message: e.message })),
        duration_ms: Date.now() - start,
      });
      res.status(400).json({ error: 'Validation failed', details: err.issues });
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
