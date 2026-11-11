import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { openHouseRegisterSchema, openHousePublicSignupSchema } from '../schemas/openHouseSchema';
import { createExplorerEnrollment } from '../services/enrollmentService';
import { getCurrentOpenHouseEvent, OpenHouseEventInfo } from '../services/openHouseEventService';
import { recordOpenHouseRegistration } from '../services/openHouseRegistrationStore';
import { captureSignupConsent, SIGNUP_CONSENT_TEXT } from '../services/consent/captureSignupConsent';
import { instantAccessFor, greetInBackground } from '../services/openHouse/instantAccess';

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
        // The request this consent came from, so the row is traceable.
        correlationId: correlation_id,
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

    // OH-2: put them on OUR attendee list too, so a registration taken through
    // the training site is visible here rather than only in Eventbrite.
    const attached = await attachToCurrentOpenHouse({
      email: payload.email, name: payload.name, enrollmentId: enrollment.id,
      source: 'training_site', correlation_id,
    });

    const status = created ? 201 : 200;
    log('info', 'open_house_register_end', 'success', {
      correlation_id, status, created, registered: attached.registered, duration_ms: Date.now() - start,
    });

    res.status(status).json({
      ok: true,
      created,
      enrollment_id: enrollment.id,
      event_id: attached.event?.event_id ?? null,
      registered: attached.registered,
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

/**
 * Put someone on our own attendee list for whichever Open House is next.
 *
 * DEGRADES RATHER THAN FAILS, in both directions. If CCPP is unreachable or no
 * Open House is announced, the person still has their account and their login
 * link - we simply have no event to attach them to, and say so, instead of
 * refusing a signup over a schedule we could not read. If the attendee row
 * itself cannot be written, that is logged and reported as `registered: false`
 * rather than thrown: the account and the welcome email have already happened by
 * the time this runs, so throwing here would answer a successful signup with a
 * 500 and invite the visitor to sign up again.
 *
 * The honest consequence is that `registered: false` means "not on the list",
 * from either cause, and the caller must not render it as "you have a seat".
 */
async function attachToCurrentOpenHouse(args: {
  email: string;
  name: string;
  enrollmentId: string;
  source: string;
  correlation_id: string;
}): Promise<{ event: OpenHouseEventInfo | null; registered: boolean }> {
  let event: OpenHouseEventInfo | null = null;
  try {
    const found = await getCurrentOpenHouseEvent();
    event = found.announced ? found : null;
  } catch (err) {
    log('error', 'open_house_event_unavailable_at_signup', 'partial', {
      correlation_id: args.correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    return { event: null, registered: false };
  }

  if (!event?.event_id) {
    log('warn', 'open_house_signup_without_announced_event', 'partial', {
      correlation_id: args.correlation_id,
    });
    return { event: null, registered: false };
  }

  try {
    const { created } = await recordOpenHouseRegistration({
      eventId: event.event_id,
      email: args.email,
      name: args.name,
      enrollmentId: args.enrollmentId,
      source: args.source,
    });
    log('info', 'open_house_registration_recorded', 'success', {
      correlation_id: args.correlation_id,
      event_id: event.event_id,
      // False means they were already on the list, which is the normal answer
      // for a repeat signup and not a failure.
      first_time: created,
    });
    return { event, registered: true };
  } catch (err) {
    log('error', 'open_house_registration_write_failed', 'failure', {
      correlation_id: args.correlation_id,
      event_id: event.event_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    return { event, registered: false };
  }
}

/**
 * What the success screen says. Copy stays clear of the word barred by 40 TAC 807.172(d) for a licensed career school;
 * "$0" is the approved phrasing.
 *
 * - New account with a session (C121): start now; the email is the way back.
 * - New account without one (should not happen; the email went out): check your email, as before.
 * - Existing account: sign in. `createExplorerEnrollment` sends an existing account NO email, and the old copy told
 *   these people to wait for one that never came (found in C121).
 */
export function signupMessage(created: boolean, hasAccess: boolean, registered: boolean): string {
  const later = registered ? '' : ' We will confirm the Open House date separately.';
  if (created && hasAccess) {
    return `${registered ? 'You are signed up, and your $0 account is ready.' : 'Your $0 account is ready.'} Start now: we also emailed you a link to come back any time.${later}`;
  }
  if (created) {
    return registered
      ? 'You are signed up. Check your email for your login link and start learning for $0.'
      : 'Your account is ready - check your email for your login link. We will confirm the Open House date separately.';
  }
  return `${registered ? 'You are signed up. ' : ''}You already have an account with this email, so sign in to pick up where you left off.${later}`;
}

// POST /api/v1/open-house/signup
//
// THE PUBLIC DOOR (OH-2). A stranger arrives from an ad, gives a name and an
// email, and gets three things in one request: a place on our Open House
// attendee list, an Explorer account, and an email with a passwordless login
// link. Ali, 2026-11-10: "When they sign up for Open House, we can automatically
// create them a free account and then send them an email of it."
//
// Eventbrite is deliberately not written to, because it cannot be: its API has
// no endpoint that creates a registration. Ali chose to own the list here rather
// than ask an ad visitor to sign up twice.
//
// Unauthenticated by necessity and rate limited in the router because of it.
// Every write it performs is idempotent on the email address - the enrollment
// through `createExplorerEnrollment`, the welcome email through its
// CommunicationLog guard, and the attendee row through a unique index - so a
// double-tapped button costs one account, one email and one row.
export async function handlePublicOpenHouseSignup(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();
  log('info', 'open_house_public_signup_start', 'partial', { correlation_id });

  try {
    const payload = openHousePublicSignupSchema.parse(req.body);

    const { enrollment, created } = await createExplorerEnrollment({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      // Defaulted, not required: the landing page should say where it came from,
      // but a signup that forgot to is still a signup, and 'open_house_signup'
      // is a truthful source where an empty string would silently become an
      // untagged lead in the acquisition report.
      utm_source: payload.utm_source || 'open_house_signup',
      utm_campaign: payload.utm_campaign || 'open_house',
      page_url: payload.page_url,
      source: 'Open House signup (public)',
    });

    const attached = await attachToCurrentOpenHouse({
      email: payload.email, name: payload.name, enrollmentId: enrollment.id,
      source: 'landing_page', correlation_id,
    });

    // Consent, if they ticked the box. Guarded at the call site as well as
    // inside the helper, for the reason given on the service route above: the
    // person must get their account whatever happens to the consent write.
    //
    // `req.ip` and the request's own user agent, NOT values from the body. This
    // route is talking to the actual person, and the schema rejects a body that
    // tries to supply either.
    try {
      await captureSignupConsent({
        email: payload.email,
        marketingOptIn: payload.marketing_opt_in,
        source: 'landing_page:open_house_signup',
        correlationId: correlation_id,
        consentText: SIGNUP_CONSENT_TEXT,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });
    } catch (consentErr) {
      log('error', 'consent_capture_failed', 'failure', {
        correlation_id,
        error_class: consentErr instanceof Error ? consentErr.constructor.name : 'UnknownError',
        message: consentErr instanceof Error ? consentErr.message : String(consentErr),
      });
    }

    // C121: a brand-new account is signed in on the spot ("Access your account"); an existing one never is, because
    // this form is public. See services/openHouse/instantAccess.ts.
    const access = instantAccessFor(enrollment, created);
    if (access) {
      void greetInBackground(enrollment.id, (err) => log('warn', 'open_house_instant_access_greeting_failed', 'failure', {
        correlation_id,
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        message: err instanceof Error ? err.message : String(err),
      }));
    }

    const status = created ? 201 : 200;
    log('info', 'open_house_public_signup_end', 'success', {
      correlation_id, status, created, registered: attached.registered, instant_access: !!access, duration_ms: Date.now() - start,
    });

    res.status(status).json({
      ok: true,
      created,
      registered: attached.registered,
      // Echoed so the page can confirm WHICH Open House they just joined rather
      // than repeating whatever date it rendered a moment ago.
      event: attached.event
        ? {
            event_id: attached.event.event_id,
            date_label: attached.event.date_label,
            time_label: attached.event.time_label,
            format_label: attached.event.format_label,
            seats_remaining: attached.event.seats_remaining,
          }
        : null,
      // C121: the session for "Access your account". Null for an existing account, which must sign in instead.
      access,
      message: signupMessage(created, !!access, attached.registered),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'open_house_public_signup_validation_failure', 'failure', {
        correlation_id,
        error_class: 'ValidationError',
        issues: err.issues.map(e => ({ path: e.path, message: e.message })),
        duration_ms: Date.now() - start,
      });
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    log('error', 'open_house_public_signup_unhandled_error', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
    next(err);
  }
}
