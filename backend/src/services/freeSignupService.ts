import { Enrollment } from '../models';
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
