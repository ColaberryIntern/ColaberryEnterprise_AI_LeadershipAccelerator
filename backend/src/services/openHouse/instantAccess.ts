/**
 * C121 (Ali, 2026-11-11): "why even make them go to their email. Why don't we just put a button that says access
 * your account and that logs them in." The Open House sign-up that CREATES an account now hands back a session, so
 * the success screen's "Access your account" button opens the welcome video in one click. The welcome email still
 * goes out and becomes the way back in.
 *
 * WHY ONLY A NEW ACCOUNT. The sign-up form is public: anyone can type anyone's address. Signing that visitor into an
 * account that already existed would hand a stranger someone else's account. Same rule as the /portal/signup door
 * (C103: an existing account gets a sign-in link, never a session). A brand-new account was created by this very
 * request, so the person holding the response is the person who made it.
 *
 * Measured: the C120 funnel showed 5 Open House sign-ups, 5 welcome emails and 0 sign-ins in the first 14.6 hours.
 */
import { signParticipantJwt } from '../participantService';
import { FIRST_ASSIGNMENT_PATH } from '../welcome/sendPortalWelcome';

export interface InstantAccess {
  /** The same 7-day participant session the magic link and /portal/signup issue. */
  jwt: string;
  /** Where the button lands: the welcome video, as the email link does. */
  next: string;
}

export interface SignedUpEnrollment {
  id: string;
  email: string;
  cohort_id: string | null;
}

/**
 * The session for a sign-up, or null when the account already existed (or anything about it is missing). Pure apart
 * from signing, so the "never for an existing account" rule is testable without a database.
 */
export function instantAccessFor(enrollment: SignedUpEnrollment | null | undefined, created: boolean): InstantAccess | null {
  if (!created || !enrollment || !enrollment.id || !enrollment.email) return null;
  return {
    jwt: signParticipantJwt({ id: enrollment.id, email: enrollment.email, cohort_id: enrollment.cohort_id ?? null }),
    next: FIRST_ASSIGNMENT_PATH,
  };
}

/**
 * Reese's intro fires on a link sign-in (participantService.verifyMagicLink). A learner who comes in through the
 * button never uses a link, so the same idempotent call runs here. Fire-and-forget on purpose, exactly as at the link
 * sign-in: the sign-up response must not wait on a DM round trip, and a failure must never cost anyone their account.
 * Returns the promise only so a test can await it.
 */
export function greetInBackground(enrollmentId: string, onError: (err: unknown) => void): Promise<void> {
  return (async () => {
    try {
      const { maybeSendWelcomes } = await import('../reese/reeseWelcomeService');
      await maybeSendWelcomes(enrollmentId);
    } catch (err) {
      onError(err);
    }
  })();
}
