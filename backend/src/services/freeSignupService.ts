import { Enrollment, Lead } from '../models';
import { signParticipantJwt } from './participantService';

export interface FreeSignupInput {
  full_name: string;
  email: string;
}

export interface FreeSignupResult {
  jwt: string;
  enrollment: { id: string; full_name: string; email: string; tier: string };
  created: boolean;
}

/** Normalize inbound signup identity (pure — email lowercased/trimmed, name trimmed). */
export function normalizeSignupInput(input: FreeSignupInput): { full_name: string; email: string } {
  return {
    full_name: (input.full_name || '').trim(),
    email: (input.email || '').toLowerCase().trim(),
  };
}

/** The attributes a brand-new free/guest enrollment is created with (pure). */
export function guestEnrollmentDefaults(clean: { full_name: string; email: string }) {
  return {
    full_name: clean.full_name,
    email: clean.email,
    company: '',                          // guests have no company yet (NOT NULL column)
    cohort_id: null,                      // guests are not in a cohort
    tier: 'guest' as const,
    status: 'active' as const,
    payment_status: 'pending' as const,   // not meaningful for guests; `tier` is the source of truth
    payment_method: 'credit_card' as const,
    portal_enabled: true,                 // free accounts get immediate portal access
    maturity_level: 0,
    intake_completed: false,
  };
}

/**
 * Record a free signup as a Lead, so the student has an acquisition history.
 *
 * WHY THIS EXISTS. This service created an Enrollment and nothing else, so every
 * guest account was a student who had never been a lead. Measured on production
 * 2026-09-05: of 42 guest-tier enrolments, 37 (88%) matched no lead by any rule
 * — not by email, not by phone (none of them carry one), not by name. They were
 * not a matching failure; the acquisition record was never written.
 *
 * The effect on the funnel is visible and worsening. Enrolments traceable to a
 * lead ran at 98% in July, 66% in August and 56% in September, tracking the
 * introduction of this tier on 2026-07-19.
 *
 * The paid path already does this (enrollmentService captures open-house and
 * payment-readiness signups the same way). This mirrors it rather than inventing
 * a second pattern.
 *
 * Best-effort and idempotent, exactly like the paid path: findOrCreate keyed on
 * email means a returning guest never gets a second lead, and the try/catch means
 * a CRM problem can never block someone from signing up. Signup succeeding
 * matters more than the record being perfect.
 *
 * `source: 'free_signup'` is deliberately distinctive so these are identifiable
 * and excludable in campaign segments — a free guest is not a prospect to
 * nurture like an inbound enquiry, and they should not silently join those
 * lists.
 */
async function captureGuestAsLead(clean: { full_name: string; email: string }): Promise<void> {
  try {
    await Lead.findOrCreate({
      where: { email: clean.email },
      defaults: {
        name: clean.full_name,
        email: clean.email,
        source: 'free_signup',
        form_type: 'free_signup',
        status: 'engaged',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
      } as any,
    });
  } catch (error) {
    // Never allowed to affect signup. Logged with a class so the failure is
    // traceable rather than swallowed — a silent catch here would recreate the
    // very gap this function closes.
    console.error('[freeSignup] lead capture failed', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Create (or reuse) a free self-serve "guest" account and issue a participant
 * session JWT so the visitor lands straight in the platform preview.
 *
 * Idempotent by email: an existing enrollment (guest OR member) is returned and
 * logged in as-is — we never duplicate it, and never downgrade a member to guest.
 */
export async function createFreeAccount(input: FreeSignupInput): Promise<FreeSignupResult> {
  const clean = normalizeSignupInput(input);
  if (!clean.email || !clean.full_name) {
    throw new Error('full_name and email are required');
  }

  const existing = await Enrollment.findOne({ where: { email: clean.email } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
  const enrollment: any = existing || (await Enrollment.create(guestEnrollmentDefaults(clean) as any));

  // Reese's intros. Self-serve signup is the other
  // way a student reaches the portal for the first time, so it gets the same
  // greeting as the magic-link path. Fire-and-forget: signup must not wait on a
  // DM, and maybeSendWelcomes is idempotent, so a returning guest whose account
  // is merely being reused is short-circuited rather than greeted twice.
  void (async () => {
    try {
      const { maybeSendWelcomes } = await import('./reese/reeseWelcomeService');
      await maybeSendWelcomes(enrollment.id);
    } catch { /* never allowed to affect signup */ }
  })();

  await captureGuestAsLead(clean);

  return {
    jwt: signParticipantJwt(enrollment),
    enrollment: {
      id: enrollment.id,
      full_name: enrollment.full_name,
      email: enrollment.email,
      tier: enrollment.tier || 'member',
    },
    created: !existing,
  };
}
