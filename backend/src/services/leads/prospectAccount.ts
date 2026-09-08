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

import { Op } from 'sequelize';
import { Cohort, Enrollment } from '../../models';
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

/**
 * The cohort a new enquiry lands in.
 *
 *     "All new accounts from AI Flotation get assigned to Explore - Prospects course."
 *     (Ali, 2026-09-08)
 *
 * Resolved BY NAME, not by id. The id is a production UUID; hardcoding it would leave every
 * dev box and preview stack silently assigning nobody, which is the kind of environment
 * difference that only shows up when somebody is demonstrating.
 *
 * `PROSPECT_COHORT_ID` overrides it where an operator wants a specific one.
 */
export const PROSPECT_COHORT_NAME = 'Explorer — Prospects';

/** Em dash, en dash and hyphen all read the same to a person typing the name. */
const COHORT_NAME_VARIANTS = [
  PROSPECT_COHORT_NAME,
  PROSPECT_COHORT_NAME.replace('—', '–'),
  PROSPECT_COHORT_NAME.replace('—', '-'),
];

export interface ProspectAccountResult {
  created: boolean;
  cohort_assigned?: boolean;
  reason?: 'source_not_eligible' | 'no_email' | 'failed';
}

/**
 * Put a brand-new prospect in the prospects cohort, and nobody else.
 *
 * Two guards, both load-bearing:
 *
 *   - Only when the enrolment has NO cohort. `createFreeAccount` is idempotent by email and
 *     returns an existing enrolment, so without this a paying student in a real cohort who
 *     later sends an enquiry would be quietly moved out of the programme they are paying for.
 *   - Only guest tier, for the same reason from the other direction.
 *
 * Best-effort. A missing cohort is logged and the account still stands: an account in no
 * cohort is worth far more than no account.
 */
async function assignToProspectCohort(enrollmentId: string): Promise<boolean> {
  const enrollment: any = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return false;
  if (enrollment.cohort_id) return false;
  if (enrollment.tier !== 'guest') return false;

  const configured = (process.env.PROSPECT_COHORT_ID || '').trim();
  const cohort: any = configured
    ? await Cohort.findByPk(configured)
    : await Cohort.findOne({ where: { name: { [Op.in]: COHORT_NAME_VARIANTS } } });

  if (!cohort) {
    console.warn(`[prospectAccount] no cohort named "${PROSPECT_COHORT_NAME}" — the account stands without one`);
    return false;
  }

  await enrollment.update({ cohort_id: cohort.id });
  return true;
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

    // Separate try: a cohort problem must not lose the account that already exists.
    let cohort_assigned = false;
    try {
      cohort_assigned = await assignToProspectCohort(result.enrollment.id);
    } catch (error) {
      console.error('[prospectAccount] could not assign the prospects cohort', {
        error_class: error instanceof Error ? error.constructor.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return { created: result.created, cohort_assigned };
  } catch (error) {
    console.error('[prospectAccount] could not create the free account', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      source: params.sourceSlug,
    });
    return { created: false, reason: 'failed' };
  }
}
