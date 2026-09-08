/**
 * prospectAccount — an enquiry becomes someone with a way back in.
 *
 * ## The gap this closes
 *
 *     "I don't see this as a new lead - they should also be a prospect in the accelerator
 *      and should get a free account."  (Ali, 2026-09-07)
 *
 * An AI Flotation enquiry wrote exactly one row: a `Lead`. The Accelerator's Participants
 * screen reads `Enrollment`, a different table, so somebody who had just described their
 * project, answered eleven interview questions and been shown a scoped build appeared
 * nowhere in the programme and had no account to come back to.
 *
 * `createFreeAccount` already builds precisely the right thing — `tier: 'guest'`,
 * `portal_enabled: true`, idempotent by email — and it had exactly one caller, the
 * self-serve signup route. This is the missing call, not a new mechanism.
 *
 * ## Which sources, and why not all of them
 *
 * An explicit list, because "every lead gets a portal account" is a different and much
 * larger decision than the one being made here. A person who described a project and sat
 * through an interview has asked for something; a scraped contact or a newsletter signup
 * has not, and minting accounts for those would fill the Participants screen with people
 * who never asked to be there.
 *
 * ## What it deliberately does NOT do
 *
 * It does not touch the lead's `source`. `createFreeAccount` records its own lead with
 * `source: 'free_signup'`, which campaign segments deliberately exclude — a free guest is
 * not nurtured like an inbound enquiry. Because it uses `findOrCreate` keyed on email and
 * the enquiry's lead already exists, the existing `ai-flotation` source survives and the
 * person stays in the nurture segments they belong in.
 */

import { createFreeAccount } from '../freeSignupService';

/**
 * Sources whose leads asked for something, and so get a way back in.
 *
 * Add to this deliberately. Each entry mints a portal account for every submission from
 * that form, and an account nobody asked for is worse than no account.
 */
export const PROSPECT_ACCOUNT_SOURCES: readonly string[] = ['ai-flotation'];

export function wantsProspectAccount(sourceSlug: string): boolean {
  return PROSPECT_ACCOUNT_SOURCES.includes((sourceSlug || '').toLowerCase().trim());
}

export interface ProspectAccountResult {
  created: boolean;
  reason?: 'source_not_eligible' | 'no_email' | 'failed';
}

/**
 * Give an enquiry a free account, if its source is one that should have one.
 *
 * Best-effort and never blocking, exactly like the lead capture on the free-signup path it
 * mirrors: a person who has just described their project must not lose the submission
 * because the Accelerator side of the house had a bad minute. The failure is logged with a
 * class so it is traceable rather than swallowed.
 */
export async function ensureProspectAccount(params: {
  sourceSlug: string;
  email?: string | null;
  name?: string | null;
}): Promise<ProspectAccountResult> {
  if (!wantsProspectAccount(params.sourceSlug)) return { created: false, reason: 'source_not_eligible' };

  const email = (params.email || '').trim();
  if (!email) return { created: false, reason: 'no_email' };

  try {
    const result = await createFreeAccount({
      full_name: (params.name || '').trim() || email.split('@')[0],
      email,
    });
    return { created: result.created };
  } catch (error) {
    console.error('[prospectAccount] could not create the free account', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      source: params.sourceSlug,
    });
    return { created: false, reason: 'failed' };
  }
}
