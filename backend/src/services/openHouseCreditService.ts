import { Op } from 'sequelize';
import { Enrollment, Cohort } from '../models';
import { grantCredit } from './accountCreditService';
import { isNonPayingCohortName } from './subscriptionService';

/**
 * openHouseCreditService — reconcile the Open House "$50 hold your spot"
 * deposits into the platform: grant each payer a $50 account credit (applied to
 * their next subscription payment) AND make sure they are enrolled in the paid
 * cohort. Kept separate from accountCreditService so it can pull cohort naming
 * from subscriptionService without a circular import.
 *
 * Idempotent end to end:
 *  - the credit is keyed on the PaySimple deposit ref (source_event_id) → re-run
 *    never double-credits;
 *  - the enrollment is matched/created by email → re-run reuses the same row;
 *  - the cohort is only set when the student has no real paid cohort yet.
 *
 * Enrolling ≠ paying: a deposit holder is placed in the July cohort (so they're
 * "enrolled" and their seat is reserved) but stays Explorer-tier until they pay
 * the subscription, at which point the $50 credit reduces that first charge.
 */

export const OPEN_HOUSE_DEPOSIT_CENTS = 5000;
export const OPEN_HOUSE_CREDIT_REASON = 'open_house_deposit';

export interface OpenHousePayer {
  email: string;
  name?: string;
  sourceEventId: string;       // the PaySimple deposit external_id (OH716-...) — idempotency key
  amountCents?: number;        // defaults to $50
}

export interface GrantOutcome {
  email: string;
  matched: 'existing' | 'created' | 'skipped';
  enrollmentId: string | null;
  cohortSet: boolean;
  creditGranted: boolean;
  creditAlreadyPresent: boolean;
  note?: string;
}

export interface GrantSummary {
  total: number;
  matched_existing: number;
  created: number;
  skipped: number;
  cohorts_set: number;
  credits_granted: number;
  credits_already_present: number;
  credited_cents: number;      // sum of NEWLY granted credit
  apply: boolean;
  outcomes: GrantOutcome[];
}

/** The paid July cohort deposits reserve a seat in. Env override, else by the
 *  canonical name, else the soonest open real (non-Explorer/demo) cohort. */
export async function resolveDepositCohort(): Promise<Cohort | null> {
  const override = process.env.SUBSCRIPTION_TARGET_COHORT_ID;
  if (override) {
    const c = await Cohort.findByPk(override);
    if (c) return c;
  }
  const byName = await Cohort.findOne({ where: { name: 'Cohort - July 2026' } });
  if (byName) return byName;
  const open = (await Cohort.findAll({ where: { status: 'open' }, order: [['start_date', 'ASC']] })) || [];
  return open.find((c: any) => !isNonPayingCohortName(c.name)) || null;
}

/** Does this enrollment still need to be placed in the paid cohort? True when it
 *  has no cohort or is sitting in the Explorer/prospect/demo bucket. */
async function needsCohortPlacement(enrollment: Enrollment): Promise<boolean> {
  if (!enrollment.cohort_id) return true;
  const current = await Cohort.findByPk(enrollment.cohort_id);
  if (!current) return false;                       // unknown cohort → leave it alone
  return isNonPayingCohortName((current as any).name);
}

/**
 * Reconcile a single Open House deposit payer. `apply=false` is a dry run: it
 * still reports what WOULD happen (matched/created/cohort/credit) but writes
 * nothing.
 */
export async function reconcileOpenHousePayer(
  payer: OpenHousePayer,
  opts: { cohort: Cohort | null; grantedBy: string; apply: boolean; nowMs?: number },
): Promise<GrantOutcome> {
  const email = (payer.email || '').trim().toLowerCase();
  const amountCents = payer.amountCents ?? OPEN_HOUSE_DEPOSIT_CENTS;
  const out: GrantOutcome = {
    email: payer.email,
    matched: 'skipped',
    enrollmentId: null,
    cohortSet: false,
    creditGranted: false,
    creditAlreadyPresent: false,
  };
  if (!email) { out.note = 'no email — cannot match an account'; return out; }
  if (!payer.sourceEventId) { out.note = 'no sourceEventId — cannot grant idempotently'; return out; }

  // A payer may have several enrollments (stale April/November rows alongside the
  // July one). The $50 held a JULY seat, so the credit must land on the enrollment
  // in the target cohort — prefer it, else the most-recently-created match. Using
  // findOne here would attach the credit to an arbitrary (possibly wrong) row.
  const matches = await Enrollment.findAll({ where: { email: { [Op.iLike]: email } }, order: [['created_at', 'DESC']] });
  let enrollment: Enrollment | null = matches.length
    ? ((opts.cohort && matches.find((m) => m.cohort_id === opts.cohort!.id)) || matches[0])
    : null;
  if (matches.length > 1 && enrollment) {
    out.note = `${matches.length} enrollments matched — credited ${enrollment.id.slice(0, 8)}${opts.cohort && enrollment.cohort_id === opts.cohort.id ? ' (target cohort)' : ''}`;
  }

  if (!enrollment) {
    out.matched = 'created';
    if (opts.apply) {
      enrollment = await Enrollment.create({
        full_name: (payer.name || email).slice(0, 255),
        email,
        company: '',
        cohort_id: opts.cohort ? opts.cohort.id : null,
        enrollment_type: 'explorer',   // deposit ≠ subscription; stays Explorer until they pay
        tier: 'guest',
        payment_status: 'pending',
        status: 'active',
        portal_enabled: true,
        enrolled_at: new Date(opts.nowMs ?? Date.now()),
        notes: `Open House $50 seat deposit (${payer.sourceEventId})`,
      } as any);
      out.cohortSet = !!opts.cohort;
    } else {
      // Dry run: report the cohort we WOULD set.
      out.cohortSet = !!opts.cohort;
    }
  } else {
    out.matched = 'existing';
    if (await needsCohortPlacement(enrollment)) {
      if (opts.apply && opts.cohort) await enrollment.update({ cohort_id: opts.cohort.id });
      out.cohortSet = !!opts.cohort;
    }
  }

  out.enrollmentId = enrollment ? enrollment.id : null;

  // Grant the credit (idempotent on sourceEventId). On a dry run, report whether
  // a credit for this deposit already exists so the preview is accurate.
  if (opts.apply && enrollment) {
    const { granted } = await grantCredit({
      enrollmentId: enrollment.id,
      amountCents,
      reason: OPEN_HOUSE_CREDIT_REASON,
      sourceEventId: payer.sourceEventId,
      grantedBy: opts.grantedBy,
      note: `$50 Open House seat deposit${payer.name ? ` — ${payer.name}` : ''}`,
    });
    out.creditGranted = granted;
    out.creditAlreadyPresent = !granted;
  } else {
    // Dry run: check existence via the model without writing.
    const { AccountCredit } = await import('../models');
    const existing = await AccountCredit.findOne({ where: { source_event_id: payer.sourceEventId } });
    out.creditAlreadyPresent = !!existing;
    out.creditGranted = !existing; // would grant
  }

  return out;
}

/** Reconcile a batch of Open House payers; returns per-payer outcomes + a summary. */
export async function grantOpenHouseCreditsBatch(
  payers: OpenHousePayer[],
  opts: { grantedBy: string; apply: boolean; nowMs?: number },
): Promise<GrantSummary> {
  const cohort = await resolveDepositCohort();
  const outcomes: GrantOutcome[] = [];
  for (const payer of payers) {
    // Sequential (not parallel): keeps DB load gentle and outcomes deterministic.
    outcomes.push(await reconcileOpenHousePayer(payer, { cohort, grantedBy: opts.grantedBy, apply: opts.apply, nowMs: opts.nowMs }));
  }
  const summary: GrantSummary = {
    total: outcomes.length,
    matched_existing: outcomes.filter((o) => o.matched === 'existing').length,
    created: outcomes.filter((o) => o.matched === 'created').length,
    skipped: outcomes.filter((o) => o.matched === 'skipped').length,
    cohorts_set: outcomes.filter((o) => o.cohortSet).length,
    credits_granted: outcomes.filter((o) => o.creditGranted).length,
    credits_already_present: outcomes.filter((o) => o.creditAlreadyPresent).length,
    credited_cents: outcomes.filter((o) => o.creditGranted).length * OPEN_HOUSE_DEPOSIT_CENTS,
    apply: opts.apply,
    outcomes,
  };
  return summary;
}
