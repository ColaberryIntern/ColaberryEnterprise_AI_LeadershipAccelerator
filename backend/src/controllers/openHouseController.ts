import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { openHouseRegisterSchema } from '../schemas/openHouseSchema';
import { createExplorerEnrollment } from '../services/enrollmentService';
import { getCurrentOpenHouseEvent } from '../services/openHouseEventService';
import { captureSignupConsent, SIGNUP_CONSENT_TEXT } from '../services/consent/captureSignupConsent';

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'open-house-register', event, outcome, ...context }) + '\n'
  );
}

// POST /api/v1/open-house/register
// Service-authed (training.colaberry.com). Creates a light "Explorer" account
// under the current cohort and emails a passwordless login link. Idempotent on
// email: repeat calls return the existing account without duplicating or re-sending.
export async function handleOpenHouseRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();
  log('info', 'open_house_register_start', 'partial', { correlation_id });

  try {
    const payload = openHouseRegisterSchema.parse(req.body);
    const { enrollment, created } = await createExplorerEnrollment(payload);

    // Marketing consent, if they ticked the box. Recorded on repeat registrations
    // too (created === false): someone who did not tick the first time and does
    // tick now is giving consent now, and ConsentRecord is append-only anyway.
    //
    // Guarded HERE as well as inside the helper. captureSignupConsent is
    // swallow-safe, but a call site is not automatically so - an unguarded
    // `req.get('user-agent')` threw at exactly this spot in enrollmentController
    // and the outer catch turned it into a request that never answered. The
    // person must get their account whatever happens to the consent write.
    try {
      await captureSignupConsent({
        email: payload.email,
        // Absent or false records NOTHING. It is not a revocation: writing
        // `revoked` for someone who simply did not tick would suppress a person
        // we are currently permitted to email, which is worse than silence.
        marketingOptIn: payload.marketing_opt_in,
        source: 'training_site:open_house_register',
        consentText: payload.marketing_consent_text ?? SIGNUP_CONSENT_TEXT,
        // NOT req.ip / req.get(): this route is service-to-service, so those
        // describe the training site's server, not the person who ticked.
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

    const status = created ? 201 : 200;
    log('info', 'open_house_register_end', 'success', {
      correlation_id, status, created, duration_ms: Date.now() - start,
    });

    res.status(status).json({
      ok: true,
      created,
      enrollment_id: enrollment.id,
      message: created
        ? 'Explorer account created; a login link was emailed.'
        : 'Already registered; a login link was previously emailed.',
    });
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'open_house_register_validation_failure', 'failure', {
        correlation_id,
        error_class: 'ValidationError',
        issues: err.issues.map(e => ({ path: e.path, message: e.message })),
        duration_ms: Date.now() - start,
      });
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    log('error', 'open_house_register_unhandled_error', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
    next(err);
  }
}

// GET /api/v1/open-house/event
// Public, cached. Returns the current Open House details (date/time/format/price/
// seats/RSVP url) for the marketing site card, or { announced: false } when none
// is live. Never throws — a CCPP hiccup degrades to "not announced" so the page
// never breaks.
export async function handleGetOpenHouseEvent(_req: Request, res: Response): Promise<void> {
  try {
    const event = await getCurrentOpenHouseEvent();
    res.json(event);
  } catch (err) {
    log('error', 'open_house_event_fetch_failure', 'failure', {
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    res.json({ announced: false });
  }
}
