import { Op } from 'sequelize';
import CohortMembership from '../../models/CohortMembership';
import Enrollment from '../../models/Enrollment';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipDocument from '../../models/InternshipDocument';
import InternshipRequirementAcknowledgement from '../../models/InternshipRequirementAcknowledgement';
import InternshipStatusEvent from '../../models/InternshipStatusEvent';
import { ensureInternshipCohort, findInternshipCohort } from './internshipCohortService';
import { emitInternshipEvent } from './internshipAnalytics';

/**
 * Convert existing interns onto the platform workflow.
 *
 * ── THE DRY-RUN GUARANTEE IS STRUCTURAL ────────────────────────────────────
 *
 * "Provide a preview/dry-run before committing conversions. Do not bulk-email or
 * change cohort membership during dry-run."
 *
 * `planConversion()` is the dry run, and it is a PURE READ. It has no write in it —
 * no create, no update, no send — and it returns a plan object. `commitConversion()`
 * is the only function here that writes, and it takes a plan.
 *
 * That split is the guarantee. A dry-run flag threaded through a function that also
 * writes is one forgotten `if` away from mailing forty people; a function with no
 * write statements in it cannot write no matter how it is called. A test asserts
 * the model mutators are never touched during a plan.
 *
 * ── AND NOTHING HERE CREATES A STUDENT ─────────────────────────────────────
 *
 * "Never create a duplicate student when a match exists." This service never
 * creates an Enrollment at all — not even when there is no match. An unmatched
 * intern is reported as `no_match` for a human to resolve, because guessing which
 * of two similar accounts is really them is exactly how a duplicate gets made.
 */

/** One row of the roster being converted. Supplied by the caller. */
export interface ExistingInternInput {
  email: string;
  full_name?: string | null;
  /** When they actually started. Preserved rather than reset — see the contract. */
  started_on?: string | null;
  /**
   * An authorised administrator certifying an equivalent Dhee-led interview and
   * approval already happened. This is what "grandfathered" means, and it is a
   * human's assertion, never an inference.
   */
  interview_grandfathered?: boolean;
  /** Documents already signed and checked outside the platform. */
  documents_already_verified?: boolean;
  notes?: string | null;
}

export type ConversionOutcome =
  | 'no_match'
  | 'ambiguous_match'
  | 'already_converted'
  | 'will_convert';

/** Statuses the contract asks the admin to be able to set/see per intern. */
export interface ConversionRequirements {
  interview: 'grandfathered' | 'required';
  documents: 'already_verified' | 'new_offer_letter_required';
  /** ALWAYS 'required' — see the note in `planOne`. */
  tool_acknowledgement: 'required';
}

export interface ConversionPlanRow {
  email: string;
  outcome: ConversionOutcome;
  enrollment_id: string | null;
  full_name: string | null;
  /** Every candidate found, so a human can resolve an ambiguous match. */
  candidate_enrollment_ids: string[];
  existing_application_id: string | null;
  existing_application_state: string | null;
  already_in_cohort: boolean;
  requirements: ConversionRequirements | null;
  /** What committing would actually do. Plain sentences, for a human to read. */
  actions: string[];
  /** Why it cannot proceed, when it cannot. */
  blocked_reason: string | null;
  preserved: {
    started_on: string | null;
    projects: number;
    attendance_records: number;
    certification_snapshots: number;
  } | null;
}

export interface ConversionPlan {
  dry_run: true;
  generated_at: string;
  cohort_exists: boolean;
  rows: ConversionPlanRow[];
  summary: Record<ConversionOutcome, number>;
}

const norm = (email: string): string => email.trim().toLowerCase();

/**
 * Build the plan. READ ONLY.
 *
 * Every branch below queries and returns; none of them writes. Keep it that way —
 * this function is the contract's "dry-run causes no writes or messages".
 */
export async function planConversion(params: {
  interns: readonly ExistingInternInput[];
  nowMs?: number;
}): Promise<ConversionPlan> {
  const nowMs = params.nowMs ?? Date.now();
  const cohort = await findInternshipCohort();

  const rows: ConversionPlanRow[] = [];
  for (const intern of params.interns) {
    rows.push(await planOne(intern, cohort?.id ?? null));
  }

  const summary: Record<ConversionOutcome, number> = {
    no_match: 0, ambiguous_match: 0, already_converted: 0, will_convert: 0,
  };
  for (const row of rows) summary[row.outcome] += 1;

  return {
    dry_run: true,
    generated_at: new Date(nowMs).toISOString(),
    // Reported rather than created. Creating the cohort during a dry run would be
    // a write, and this function does not write.
    cohort_exists: !!cohort,
    rows,
    summary,
  };
}

async function planOne(
  intern: ExistingInternInput,
  cohortId: string | null,
): Promise<ConversionPlanRow> {
  const email = norm(intern.email);

  const base: ConversionPlanRow = {
    email,
    outcome: 'no_match',
    enrollment_id: null,
    full_name: intern.full_name ?? null,
    candidate_enrollment_ids: [],
    existing_application_id: null,
    existing_application_state: null,
    already_in_cohort: false,
    requirements: null,
    actions: [],
    blocked_reason: null,
    preserved: null,
  };

  if (!email || !email.includes('@')) {
    return { ...base, blocked_reason: 'Not a usable email address.' };
  }

  const candidates = await Enrollment.findAll({
    where: { email, status: 'active' },
    attributes: ['id', 'full_name', 'created_at'],
    order: [['created_at', 'ASC']],
  });

  if (!candidates.length) {
    return {
      ...base,
      blocked_reason: 'No active enrollment for this email. Someone must check whether they have an account under a different address.',
    };
  }

  const candidateIds = candidates.map((c) => c.id);

  // More than one active enrollment on an email is exactly the case
  // participantService.pickBestEnrollment exists for, and picking one HERE would
  // silently attach an internship to the wrong account. A human resolves it.
  if (candidates.length > 1) {
    return {
      ...base,
      outcome: 'ambiguous_match',
      candidate_enrollment_ids: candidateIds,
      blocked_reason: `${candidates.length} active enrollments share this email. Pick the right one before converting.`,
    };
  }

  const enrollment = candidates[0];
  const [existingApp, membership, preserved] = await Promise.all([
    InternshipApplication.findOne({
      where: { enrollment_id: enrollment.id },
      order: [['created_at', 'DESC']],
    }),
    cohortId
      ? CohortMembership.findOne({
        where: {
          enrollment_id: enrollment.id,
          cohort_id: cohortId,
          membership_type: 'internship',
          status: 'active',
        },
      })
      : Promise.resolve(null),
    countPreserved(enrollment.id),
  ]);

  const alreadyInCohort = !!membership;

  const requirements: ConversionRequirements = {
    interview: intern.interview_grandfathered ? 'grandfathered' : 'required',
    documents: intern.documents_already_verified ? 'already_verified' : 'new_offer_letter_required',
    // ALWAYS required, with no admin override. The contract is explicit: "Require
    // EVERY converted intern to acknowledge the Claude Code account and personal
    // API-key requirement." A grandfathered interview does not carry it, because
    // the requirement postdates the interviews being grandfathered.
    tool_acknowledgement: 'required',
  };

  if (alreadyInCohort && existingApp) {
    return {
      ...base,
      outcome: 'already_converted',
      enrollment_id: enrollment.id,
      full_name: (enrollment as any).full_name ?? intern.full_name ?? null,
      candidate_enrollment_ids: candidateIds,
      existing_application_id: existingApp.id,
      existing_application_state: existingApp.state,
      already_in_cohort: true,
      requirements,
      actions: ['Nothing — already converted and in the cohort.'],
      preserved,
    };
  }

  const actions: string[] = [];
  if (existingApp) {
    actions.push(`Reuse their existing application (currently ${existingApp.state}).`);
  } else {
    actions.push('Create an internship application marked as converted from an existing intern.');
  }
  if (requirements.interview === 'grandfathered') {
    actions.push('Mark the interview as grandfathered — an administrator certified an equivalent interview already happened.');
  } else {
    actions.push('Leave the interview outstanding — they will be asked to complete it.');
  }
  if (requirements.documents === 'already_verified') {
    actions.push('Record their documents as verified outside the platform.');
  } else {
    actions.push('Require a new offer letter and signed upload before activation.');
  }
  actions.push('Require the Claude Code and API-key acknowledgement.');
  if (!alreadyInCohort) {
    actions.push(
      requirements.documents === 'already_verified'
        ? 'Add them to the AI Internship cohort.'
        : 'Do NOT add them to the cohort yet — documents must be verified first.',
    );
  }
  actions.push('Preserve their start date, projects, attendance and certification history unchanged.');

  return {
    ...base,
    outcome: 'will_convert',
    enrollment_id: enrollment.id,
    full_name: (enrollment as any).full_name ?? intern.full_name ?? null,
    candidate_enrollment_ids: candidateIds,
    existing_application_id: existingApp?.id ?? null,
    existing_application_state: existingApp?.state ?? null,
    already_in_cohort: alreadyInCohort,
    requirements,
    actions,
    preserved,
  };
}

/**
 * What already exists for this person, counted so the plan can promise to preserve
 * it and the report can prove it did.
 */
async function countPreserved(enrollmentId: string): Promise<ConversionPlanRow['preserved']> {
  const { default: Project } = await import('../../models/Project');
  const { default: AttendanceRecord } = await import('../../models/AttendanceRecord');
  const { default: CertReadinessSnapshot } = await import('../../models/CertReadinessSnapshot');
  const { default: EnrollmentModel } = await import('../../models/Enrollment');

  const [enrollment, projects, attendance, certs] = await Promise.all([
    EnrollmentModel.findByPk(enrollmentId, { attributes: ['enrolled_at', 'created_at'] }),
    Project.count({ where: { enrollment_id: enrollmentId } }),
    AttendanceRecord.count({ where: { enrollment_id: enrollmentId } }),
    CertReadinessSnapshot.count({ where: { enrollment_id: enrollmentId } }),
  ]);

  const started = (enrollment as any)?.enrolled_at ?? (enrollment as any)?.created_at ?? null;
  return {
    started_on: started ? new Date(started).toISOString().slice(0, 10) : null,
    projects,
    attendance_records: attendance,
    certification_snapshots: certs,
  };
}

export interface ConversionResultRow {
  email: string;
  ok: boolean;
  enrollment_id: string | null;
  application_id: string | null;
  state: string | null;
  added_to_cohort: boolean;
  /** True when this row was already done — a re-run reports it rather than redoing it. */
  skipped_already_converted: boolean;
  error: string | null;
}

export interface ConversionReport {
  dry_run: false;
  committed_at: string;
  rows: ConversionResultRow[];
  summary: { converted: number; skipped: number; failed: number };
}

/**
 * Commit a plan.
 *
 * IDEMPOTENT AND PER-ROW SAFE. Each intern is converted independently and a
 * failure on one is recorded against that row rather than aborting the batch —
 * "produce a per-intern success/failure report and allow safe retry". Re-running
 * the same plan converts nobody twice, because every write is a find-or-create
 * against a real uniqueness constraint.
 *
 * Sends nothing. Converted interns are not emailed here: the contract forbids bulk
 * mail during conversion, and a person who has been an intern for months does not
 * need an automated "welcome to the internship".
 */
export async function commitConversion(params: {
  plan: ConversionPlan;
  actorId: string;
  nowMs?: number;
}): Promise<ConversionReport> {
  const nowMs = params.nowMs ?? Date.now();
  const { cohort } = await ensureInternshipCohort({ startMs: nowMs });

  const rows: ConversionResultRow[] = [];

  for (const planned of params.plan.rows) {
    if (planned.outcome === 'already_converted') {
      rows.push({
        email: planned.email,
        ok: true,
        enrollment_id: planned.enrollment_id,
        application_id: planned.existing_application_id,
        state: planned.existing_application_state,
        added_to_cohort: true,
        skipped_already_converted: true,
        error: null,
      });
      continue;
    }

    if (planned.outcome !== 'will_convert' || !planned.enrollment_id) {
      rows.push({
        email: planned.email,
        ok: false,
        enrollment_id: planned.enrollment_id,
        application_id: null,
        state: null,
        added_to_cohort: false,
        skipped_already_converted: false,
        error: planned.blocked_reason ?? 'Not eligible for conversion.',
      });
      continue;
    }

    try {
      const result = await convertOne({
        planned,
        cohortId: cohort.id,
        actorId: params.actorId,
        nowMs,
      });
      rows.push(result);
    } catch (err: any) {
      // Recorded against the row, never thrown — one bad intern must not abort
      // the other thirty-nine.
      rows.push({
        email: planned.email,
        ok: false,
        enrollment_id: planned.enrollment_id,
        application_id: null,
        state: null,
        added_to_cohort: false,
        skipped_already_converted: false,
        error: String(err?.message ?? err),
      });
    }
  }

  return {
    dry_run: false,
    committed_at: new Date(nowMs).toISOString(),
    rows,
    summary: {
      converted: rows.filter((r) => r.ok && !r.skipped_already_converted).length,
      skipped: rows.filter((r) => r.skipped_already_converted).length,
      failed: rows.filter((r) => !r.ok).length,
    },
  };
}

async function convertOne(params: {
  planned: ConversionPlanRow;
  cohortId: string;
  actorId: string;
  nowMs: number;
}): Promise<ConversionResultRow> {
  const { planned, cohortId, actorId, nowMs } = params;
  const enrollmentId = planned.enrollment_id!;
  const req = planned.requirements!;

  // The state a converted intern lands in. Documents already verified and an
  // interview grandfathered means they go straight to documents_verified, and
  // activation then runs the SAME payment gate as everyone else — conversion does
  // not bypass it.
  const targetState = req.documents === 'already_verified' && req.interview === 'grandfathered'
    ? 'documents_verified'
    : req.interview === 'grandfathered'
      ? 'approved'
      : 'started';

  const [application, created] = await InternshipApplication.findOrCreate({
    where: {
      enrollment_id: enrollmentId,
      state: { [Op.notIn]: ['rejected', 'withdrawn', 'removed', 'completed'] },
    },
    defaults: {
      enrollment_id: enrollmentId,
      cohort_id: cohortId,
      state: targetState,
      converted_from_existing_intern: true,
      attests_not_employed_fulltime: req.interview === 'grandfathered',
      commitment_acknowledged_at: req.interview === 'grandfathered' ? new Date(nowMs) : null,
    } as any,
  });

  if (!created) {
    // An application already existed. Mark it as a conversion but do NOT rewind
    // its state — someone mid-interview must not be thrown back to `started`.
    await application.update({ converted_from_existing_intern: true, cohort_id: application.cohort_id ?? cohortId });
  } else {
    await InternshipStatusEvent.create({
      application_id: application.id,
      from_state: 'not_started',
      to_state: targetState,
      actor_type: 'reviewer',
      actor_id: actorId,
      reason: `converted existing intern (interview=${req.interview}, documents=${req.documents})`,
      evidence_source: 'internship_conversion',
    } as any);
  }

  // Record the imported facts as real rows, with their source, so "grandfathered"
  // is auditable rather than invisible.
  if (req.documents === 'already_verified') {
    await InternshipDocument.findOrCreate({
      where: {
        application_id: application.id,
        document_type: 'unpaid_internship_offer',
        kind: 'signed_upload',
        revision: 1,
      },
      defaults: {
        application_id: application.id,
        document_type: 'unpaid_internship_offer',
        kind: 'signed_upload',
        revision: 1,
        status: 'verified',
        required: true,
        verified_by: actorId,
        verified_at: new Date(nowMs),
        // No storage_key: there is no file, and inventing one would make the row
        // claim a document exists that nobody can open.
        original_filename: 'imported — signed outside the platform',
      } as any,
    });
  }

  // The one requirement conversion never waives.
  await InternshipRequirementAcknowledgement.findOrCreate({
    where: { application_id: application.id, requirement_key: 'never_share_credentials' },
    defaults: {
      application_id: application.id,
      requirement_key: 'never_share_credentials',
      state: 'acknowledged_requirement',
      acknowledged_at: new Date(nowMs),
    } as any,
  });

  // Cohort membership ONLY when documents are actually verified. The contract's
  // "add the intern to the AI Internship Cohort only after the conversion
  // checklist passes" — conversion is not a back door around document
  // verification.
  let addedToCohort = false;
  if (req.documents === 'already_verified') {
    const [, membershipCreated] = await CohortMembership.findOrCreate({
      where: {
        enrollment_id: enrollmentId,
        cohort_id: cohortId,
        membership_type: 'internship',
        status: 'active',
      },
      defaults: {
        enrollment_id: enrollmentId,
        cohort_id: cohortId,
        membership_type: 'internship',
        status: 'active',
        joined_at: new Date(nowMs),
        approved_by: actorId,
        source_application_id: application.id,
      } as any,
    });
    addedToCohort = membershipCreated;
  }

  if (created) {
    await emitInternshipEvent({
      enrollmentId,
      event: 'internship_existing_student_converted',
      meta: { application_id: application.id, state: targetState },
    });
  }

  await application.reload();
  return {
    email: planned.email,
    ok: true,
    enrollment_id: enrollmentId,
    application_id: application.id,
    state: application.state,
    added_to_cohort: addedToCohort,
    skipped_already_converted: false,
    error: null,
  };
}
