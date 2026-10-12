import { Enrollment } from '../models';
import { pickBestEnrollment } from './enrollmentPick';

/**
 * The one place a free account's two semantic columns are decided.
 *
 * WHY THIS EXISTS. Two public implementations created free accounts and each
 * wrote one of the two columns that describe such an account:
 *
 *   - `enrollmentService.createExplorerEnrollment` (the `/enroll` page) set
 *     `enrollment_type: 'explorer'` and left `tier` at its 'member' default.
 *   - `freeSignupService.createFreeAccount` (the portal signup) set
 *     `tier: 'guest'` and left `enrollment_type` at its 'standard' default.
 *
 * Explorer Growth finds its population by `enrollment_type = 'explorer'`
 * (`explorerIdentityBridge.loadActiveExplorers`), so every account that arrived
 * through the second path was a real free AI learner that the growth engine
 * could not see. The two columns are not duplicates and neither is redundant:
 *
 *   `tier`            = ACCESS LEVEL.  'guest' = free, 'member' = paid access.
 *   `enrollment_type` = PROGRAMME.     'explorer' = the free AI learner course.
 *
 * Both are needed because the cross product is real and populated. An org
 * teammate invited by their employer is `tier: 'guest'` + 'standard': free
 * access, not a learner. A paid student is 'member' + 'standard'. A free AI
 * learner is 'guest' + 'explorer'. Collapsing them into one column is what
 * put the AI Flotation consulting registrations onto learner rosters, which is
 * the mistake `orgService` carries a comment about.
 *
 * The programme is therefore a REQUIRED argument rather than a default. A
 * default would silently reclassify whichever caller forgot to pass it, and the
 * first draft of this change defaulted to 'learner' — which would have made
 * every org owner and every invited corporate teammate an Explorer, put them on
 * learner rosters and into the nurture the growth engine runs.
 */
export type FreeAccountProgramme = 'learner' | 'standard';

export interface FreeAccountIdentity {
  full_name: string;
  email: string;
}

export interface ResolveFreeAccountArgs extends FreeAccountIdentity {
  /** REQUIRED. 'learner' = the free AI course (Explorer). 'standard' = free access, no programme. */
  programme: FreeAccountProgramme;
}

export type FreeAccountDisposition = 'created' | 'reused' | 'upgraded';

export interface ResolveFreeAccountResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize instance, shaped by the caller
  enrollment: any;
  disposition: FreeAccountDisposition;
}

/** Normalize inbound identity (pure — email lowercased/trimmed, name trimmed). */
export function normalizeIdentity(input: FreeAccountIdentity): FreeAccountIdentity {
  return {
    full_name: (input.full_name || '').trim(),
    email: (input.email || '').toLowerCase().trim(),
  };
}

/**
 * The attributes a brand-new free enrollment is created with (pure).
 *
 * `tier: 'guest'` on every programme — this function only ever makes FREE
 * accounts, so access level is not a variable. `enrollment_type` is the
 * programme, and it is the only field the argument changes.
 */
export function freeEnrollmentDefaults(
  clean: FreeAccountIdentity,
  programme: FreeAccountProgramme,
) {
  return {
    full_name: clean.full_name,
    email: clean.email,
    company: '',                          // not known at signup (NOT NULL column)
    cohort_id: null,                       // free accounts are not in a cohort
    tier: 'guest' as const,
    enrollment_type: programme === 'learner' ? ('explorer' as const) : ('standard' as const),
    // T205: the moment the Explorer journey was entered, for a learner only. A
    // non-learner has not entered one, so NULL is the honest value rather than a
    // timestamp that would make an org teammate look like a journey participant.
    explorer_entered_at: programme === 'learner' ? new Date() : null,
    status: 'active' as const,
    payment_status: 'pending' as const,
    payment_method: 'credit_card' as const,
    portal_enabled: true,                  // free accounts get immediate portal access
    maturity_level: 0,
    intake_completed: false,
  };
}

/**
 * Does an existing row need the learner programme added to it?
 *
 * Pure, and separated out because it is the subtle half of this service.
 *
 * `pickBestEnrollment` ranks `[mgmt_role, non-explorer, paid, newest]` — note
 * that 'explorer' ranks WORSE than a non-learner row, deliberately, so that a
 * stray free row can never capture the login of someone holding a real seat.
 * The consequence here runs the other way: an org teammate (`tier: 'guest'`,
 * `enrollment_type: 'standard'`, never paid) who later signs up for the free AI
 * course is handed their existing org row. Without this branch they would never
 * gain the learner programme and would stay invisible to Explorer Growth — the
 * same outcome this whole service exists to make impossible, reached by a
 * different route.
 *
 * So the learner programme is added IN PLACE. It is an upgrade, not a
 * conscription: it happens only when the person themselves asked for the
 * learner programme (`programme: 'learner'`), never when org provisioning
 * creates an account for them.
 *
 * TWO rows are protected, and the second was missed on the first pass.
 *
 * A PAID row is never touched, because flipping a paying student onto the free
 * course would gate them to Week 0.
 *
 * And **only a `tier: 'guest'` row is eligible at all**, because `tier` is the
 * access level and a free programme can only be joined by a free account. An
 * unpaid `tier: 'member'` row is not a free account — it is someone who enrolled
 * in a cohort and has not paid yet. Upgrading them would gate their curriculum to
 * Week 0 and drop them out of `paidEnrollments`/`pendingInvoice` on the admin
 * dashboard, for the crime of visiting the free-course page. `pickBestEnrollment`
 * ranks non-explorer ABOVE explorer for exactly this population, so widening the
 * rule here would have fought a protection the repo already had.
 */
export function needsProgrammeUpgrade(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize instance
  existing: any,
  programme: FreeAccountProgramme,
): boolean {
  if (programme !== 'learner') return false;
  if (!existing) return false;
  if (existing.payment_status === 'paid') return false;
  if (existing.tier !== 'guest') return false;
  return existing.enrollment_type !== 'explorer';
}

/**
 * Create, reuse, or upgrade the one free enrollment for this email.
 *
 * Idempotency is STATUS-AWARE, and that is the point of this function rather
 * than an incidental detail. The portal path previously matched on
 * `Enrollment.findOne({ where: { email } })` with no status filter, while
 * `enrollmentService.retireRedundantExplorerAccounts` deliberately leaves
 * `status: 'withdrawn'` rows in place and both `explorerIdentityBridge` and
 * `explorerRosterService` require `status = 'active'`. The combination meant a
 * returning person whose email carried a withdrawn row was logged in against
 * that dead row, never received a learner-programme row, and stayed invisible
 * to Explorer Growth permanently.
 *
 * Failure-first: this function performs no send, enrols nobody in a campaign,
 * and writes nothing but the enrollment row. Lead capture, welcome messages and
 * the Explorer profile bridge stay with the callers that already own them, so
 * this stays a pure account decision that a test can drive without mocking a
 * mailer.
 */
export async function resolveFreeAccount(
  args: ResolveFreeAccountArgs,
): Promise<ResolveFreeAccountResult> {
  const clean = normalizeIdentity(args);
  if (!clean.email || !clean.full_name) {
    throw new Error('full_name and email are required');
  }

  // Only ACTIVE rows are candidates. A withdrawn or completed row is history,
  // not an account to log into.
  const active = await Enrollment.findAll({
    where: { email: clean.email, status: 'active' },
  });

  const existing = pickBestEnrollment(active as any[]);

  if (!existing) {
    const created = await Enrollment.create(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
      freeEnrollmentDefaults(clean, args.programme) as any,
    );
    return { enrollment: created, disposition: 'created' };
  }

  if (needsProgrammeUpgrade(existing, args.programme)) {
    // T205: an upgrade IS an entry — this is the moment the org teammate joined the
    // learner programme, which is months after `created_at`. Written only when it is
    // still null, so the column is set once and a repeat visit cannot move it.
    const patch: Record<string, unknown> = { enrollment_type: 'explorer' };
    if (!(existing as any).explorer_entered_at) patch.explorer_entered_at = new Date();
    await (existing as any).update(patch);
    return { enrollment: existing, disposition: 'upgraded' };
  }

  return { enrollment: existing, disposition: 'reused' };
}
