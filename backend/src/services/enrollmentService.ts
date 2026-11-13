import { Cohort, Enrollment, Lead, Campaign } from '../models';
import { AppError } from '../utils/AppError';
import { CreateInvoiceInput, CreateInvoiceRequestInput } from '../schemas/enrollmentSchema';
import { pickBestEnrollment } from './participantService';
import { bridgeExplorerProfileAtRegistration } from './explorerGrowth/explorerProfileAtRegistration';
import {
  enrollInPaymentCampaignIfUnpaid,
  exitPaymentCampaign,
} from './readinessCampaignService';
import { redactForLogs } from '../utils/piiRedaction';
import { resolvePaidBatchPlacement } from './batch/batchPlacementService';

// Lazy import (the convention ghlService itself uses for aiEventService): a
// top-level import pulls settingsService -> SystemSetting -> config/database and
// constructs Sequelize at module load, which breaks any consumer that does not
// have a DATABASE_URL - including this service's own unit tests.
async function pushLeadToGhl(lead: unknown): Promise<void> {
  const { syncNewLeadToGhl } = await import('./ghlService');
  await syncNewLeadToGhl(lead as never);
}


export async function validateCohortAvailability(cohortId: string): Promise<Cohort> {
  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) {
    throw new AppError('Cohort not found', 404);
  }
  if (cohort.status !== 'open') {
    throw new AppError('Cohort enrollment is closed', 400);
  }
  if (cohort.seats_taken >= cohort.max_seats) {
    throw new AppError('Cohort is full', 400);
  }
  return cohort;
}

export async function createPendingEnrollment(
  data: CreateInvoiceInput,
  invoiceId: string,
  customerId: string,
  externalId: string,
  mode: 'test' | 'live'
): Promise<Enrollment> {
  const enrollment = await Enrollment.create({
    full_name: data.full_name,
    email: data.email,
    company: data.company,
    title: data.title || undefined,
    phone: data.phone || undefined,
    company_size: data.company_size || undefined,
    cohort_id: data.cohort_id,
    paysimple_invoice_id: invoiceId,
    paysimple_customer_id: customerId,
    paysimple_external_id: externalId,
    payment_status: 'pending',
    payment_method: 'credit_card',
    payment_mode: mode,
  });

  // Auto-create project (non-blocking)
  import('./projectService').then(ps =>
    ps.createProjectForEnrollment(enrollment.id)
  ).catch(err => console.error('[Project] Auto-create failed:', err.message));

  // Auto-enroll in payment readiness campaign (non-blocking)
  enrollInPaymentCampaignIfUnpaid(enrollment)
    .catch(err => console.error('[Payment Campaign] Auto-enroll failed:', err.message));

  return enrollment;
}

export async function createInvoiceEnrollment(
  data: CreateInvoiceRequestInput
): Promise<Enrollment> {
  await validateCohortAvailability(data.cohort_id);

  const enrollment = await Enrollment.create({
    full_name: data.full_name,
    email: data.email,
    company: data.company,
    title: data.title || undefined,
    phone: data.phone || undefined,
    company_size: data.company_size || undefined,
    cohort_id: data.cohort_id,
    payment_status: 'pending_invoice',
    payment_method: 'invoice',
  });

  // Auto-create project (non-blocking)
  import('./projectService').then(ps =>
    ps.createProjectForEnrollment(enrollment.id)
  ).catch(err => console.error('[Project] Auto-create failed:', err.message));

  // Reserve seat immediately for invoice requests
  await Cohort.increment('seats_taken', {
    by: 1,
    where: { id: data.cohort_id },
  });

  // Auto-enroll in payment readiness campaign (non-blocking)
  enrollInPaymentCampaignIfUnpaid(enrollment)
    .catch(err => console.error('[Payment Campaign] Auto-enroll failed:', err.message));

  return enrollment;
}

export async function markEnrollmentPaid(
  externalId: string,
  paymentDetails?: { paymentId: number; amount: number }
): Promise<Enrollment | null> {
  // Look up by external ID (CB-{customerId}-{timestamp}) — this is what PaySimple sends in webhooks
  const enrollment = await Enrollment.findOne({
    where: { paysimple_external_id: externalId },
  });

  if (!enrollment) return null;

  // Idempotent: if already paid, return without incrementing seats again
  if (enrollment.payment_status === 'paid') return enrollment;

  enrollment.payment_status = 'paid';
  // T206, NARROWED BY C10.17 PHASE 2 to `tier` alone. This is the plan's "legacy webhook" path -
  // `webhookController` calls it on a PaySimple payment_created - and it is the one writer
  // the first pass of T206 MISSED, because it writes by PROPERTY ASSIGNMENT followed by
  // `.save()` rather than through an object literal or raw SQL. Two syntaxes were considered
  // and there are three.
  //
  // Latent rather than live today: this matches on `paysimple_external_id`, which only
  // `createPendingEnrollment` writes, and those rows inherit the column default
  // `tier: 'member'`. So no paid-but-guest row can exist through here right now. It is fixed
  // for the same reason `convertExplorerToStandard` was - a latent trap is still a trap, and
  // the coherence must not depend on a column default nobody states at the call site.
  enrollment.tier = 'member';
  // C10.17 PHASE 2: `enrollment.enrollment_type = 'standard'` STOOD HERE AND IS GONE.
  // `enrollment_type` is origin, not current state, so a payment must not rewrite it; `tier`
  // above is the access grant and is what `isEnrolledMember` and the other student predicates
  // read. Note the write syntax, because it is why this site was missed once already: property
  // assignment plus `.save()`, which a scanner looking for `.update({...})` or raw SQL cannot
  // see. The origin-immutability guard in `writerPairTripwires.test.ts` is derived over all
  // three syntaxes for exactly this reason.
  // Confirmed payment is the self-serve grant condition — without this, requestMagicLink
  // (participantService) keeps rejecting the paid student with "pending admin approval"
  // forever, since it gates strictly on portal_enabled, not payment_status.
  enrollment.portal_enabled = true;
  if (paymentDetails) {
    enrollment.paysimple_payment_id = String(paymentDetails.paymentId);
    enrollment.amount_paid = paymentDetails.amount;
    enrollment.enrolled_at = new Date();
  }

  // C10.13 — place them in the batch of the month they paid in, BEFORE the save and
  // before the seat increment below.
  //
  // The ordering is the whole trick, and it is why this needs no seat arithmetic of its
  // own: the increment that follows reads `enrollment.cohort_id`, so assigning the batch
  // first makes that existing increment land on the correct batch. Reversed, the seat
  // would be spent on whatever cohort they arrived in - which for a paying ex-Explorer is
  // the Explorer bucket, a cohort that is not supposed to hold paid seats at all.
  //
  // `alreadyPaid` is hardcoded false rather than read from the row: the idempotency guard
  // forty lines above already returned for any row that was paid, so reaching here IS the
  // unpaid -> paid transition. Passing the field would read it after the assignment above
  // set it to 'paid' and so would disable placement entirely.
  const placedCohortId = await resolvePaidBatchPlacement({
    currentCohortId: enrollment.cohort_id,
    alreadyPaid: false,
    paidAt: new Date(),
  });
  if (placedCohortId) enrollment.cohort_id = placedCohortId;

  await enrollment.save();

  // Increment seats on confirmed payment
  await Cohort.increment('seats_taken', {
    by: 1,
    where: { id: enrollment.cohort_id },
  });

  // Auto-exit from payment readiness campaign (non-blocking)
  exitPaymentCampaign(enrollment.email)
    .catch(err => console.error('[Payment Campaign] Auto-exit failed:', err.message));

  // A paying student may still hold a lingering free "Explorer" account from an
  // earlier Open House visit (a separate row in the Explorer cohort). Now that
  // they've paid, retire that redundant free row so they appear once — as a paid
  // student — and not also as an active free prospect. Best-effort + idempotent;
  // never touches the paid row, seats, or money. This is the observable
  // "moved out of the free class once you pay and activate".
  retireRedundantExplorerAccounts(enrollment.email, enrollment.id)
    .catch(err => console.error('[Enrollment] Explorer reconcile failed (non-fatal):', err.message));

  return enrollment;
}

/**
 * When someone becomes a paid student, withdraw any OTHER still-active Explorer
 * (free Open House) enrollment they hold, so the same person is not counted as
 * both a paid student and a free prospect. Idempotent: withdrawn rows are skipped
 * on re-run, and the paid enrollment itself is never touched. enrollment_type is
 * left as 'explorer' because that is the row's origin and always was; what removes
 * it from the active free-prospect view is `status='withdrawn'`.
 *
 * The second clause used to read "so dashboards keep excluding it", which named the
 * wrong mechanism. The dashboard counts no longer exclude on origin at all - C10.17
 * Phase 1 changed them to ask about payment, because the origin term was dropping
 * every paying ex-Explorer off the admin dashboard and out of MRR at the same time.
 * `status` is what this function relies on, and it is what it has always written.
 */
export async function retireRedundantExplorerAccounts(email: string, paidEnrollmentId: string): Promise<void> {
  const strays = await Enrollment.findAll({
    where: {
      email: email.toLowerCase().trim(),
      enrollment_type: 'explorer',
      status: 'active',
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  for (const stray of strays) {
    if (stray.id === paidEnrollmentId) continue;
    // Never withdraw a row that has PAID, whatever its origin. Until now the only thing
    // standing between this sweep and a paying customer was the caller passing the right
    // `paidEnrollmentId` — and the query selects on `enrollment_type='explorer'`, which
    // after the origin change will match paying ex-Explorers too. Defense in depth: a
    // stale, null or sibling id from any future caller can no longer withdraw a paid seat.
    //
    // It WAS a no-op when written in Phase 1, because no paid row could carry 'explorer'.
    // Phase 2 stops the payment writers, so from this commit it is live: every paying
    // ex-Explorer now matches the query above, and this line is the thing that stops the
    // sweep withdrawing the very row that holds their access.
    if (stray.payment_status === 'paid') continue;
    await stray.update({
      status: 'withdrawn',
      notes: `${stray.notes ? stray.notes + ' | ' : ''}Retired ${today}: superseded by paid enrollment ${paidEnrollmentId}`,
    });
    console.log(`[Enrollment] Retired redundant Explorer ${stray.id} (${redactForLogs(email)}) — now a paid student`);
  }
}

export async function markEnrollmentFailed(externalId: string): Promise<Enrollment | null> {
  const enrollment = await Enrollment.findOne({
    where: { paysimple_external_id: externalId },
  });
  if (!enrollment) return null;
  if (enrollment.payment_status === 'paid') return enrollment; // Don't override paid
  enrollment.payment_status = 'failed';
  await enrollment.save();
  console.log(`[Enrollment] Marked ${enrollment.id} as failed (external: ${externalId})`);
  return enrollment;
}

export async function getEnrollmentByInvoiceId(invoiceId: string) {
  // Search by external ID first (webhook flow), then fall back to payment link ID
  return Enrollment.findOne({
    where: { paysimple_external_id: invoiceId },
    include: [{ model: Cohort, as: 'cohort' }],
  }) || Enrollment.findOne({
    where: { paysimple_invoice_id: invoiceId },
    include: [{ model: Cohort, as: 'cohort' }],
  });
}

export async function createAdminEnrollment(data: {
  full_name: string;
  email: string;
  company: string;
  title?: string;
  phone?: string;
  company_size?: string;
  cohort_id: string;
  notes?: string;
}): Promise<Enrollment> {
  const existing = await Enrollment.findOne({
    where: { email: data.email.toLowerCase().trim(), cohort_id: data.cohort_id },
  });
  if (existing) {
    throw new AppError('An enrollment already exists for this email in this cohort', 400);
  }

  const cohort = await Cohort.findByPk(data.cohort_id);
  if (!cohort) throw new AppError('Cohort not found', 404);

  const enrollment = await Enrollment.create({
    full_name: data.full_name,
    email: data.email.toLowerCase().trim(),
    company: data.company,
    title: data.title || undefined,
    phone: data.phone || undefined,
    company_size: data.company_size || undefined,
    cohort_id: data.cohort_id,
    payment_status: 'paid',
    payment_method: 'invoice',
    status: 'active',
    // Portal access ON at creation. This was `false`, which meant every student
    // an admin rostered manually hit "Your enrollment is pending admin approval
    // for portal access" on the login screen and could not get in — only the
    // /quick-add-student route flipped it on afterwards. Found live when the
    // 2026-07-23 Orientation cohort could not check in via the class QR, and
    // independently confirmed 2026-07-30 when 9 real paying Open House seat-hold
    // depositors turned out silently locked out the same way for two weeks.
    // An admin who wants a rostered-but-locked-out student can still revoke via
    // setPortalAccess(); the safe default is the one that matches the admin's
    // intent when they add a paid student to a cohort.
    portal_enabled: true,
    notes: data.notes || 'Manually added by admin',
  });

  await Cohort.increment('seats_taken', { by: 1, where: { id: data.cohort_id } });

  // Auto-create project (non-blocking)
  import('./projectService').then(ps =>
    ps.createProjectForEnrollment(enrollment.id)
  ).catch(err => console.error('[Project] Auto-create failed:', err.message));

  return enrollment;
}

/* ------------------------------------------------------------------ */
/*  Explorer (Open House) enrollments                                  */
/* ------------------------------------------------------------------ */

// An "Explorer" is an Open House visitor who can log into the portal and explore
// the app but has NOT paid or joined a class. They are placed in the dedicated
// Explorer cohort (a "free class of its own"), flagged enrollment_type='explorer',
// and — critically — do NOT consume a paid seat and are excluded from student
// metrics. Placement is deterministic (the explorer cohort), NOT start_date-based:
// the old getLatestOpenCohort() routing filed prospects into whichever cohort
// started soonest, which dumped real signups into a demo cohort.
export async function createExplorerEnrollment(input: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  title?: string;
  company_size?: string;
  order_id?: string;
  source?: string;
  utm_source?: string;
  utm_campaign?: string;
  page_url?: string;
}): Promise<{ enrollment: Enrollment; created: boolean; cohort_id: string }> {
  const email = input.email.toLowerCase().trim();
  if (!email) throw new AppError('email is required', 400);

  const { getOrCreateExplorerCohort } = await import('./cohortService');
  const cohort = await getOrCreateExplorerCohort();
  if (!cohort) throw new AppError('No cohort available to place the Explorer under', 409);

  // Idempotent: reuse any existing ACTIVE enrollment for this email across
  // EVERY cohort, not just the Explorer one -- including a real paid student
  // -- so we never duplicate or downgrade anyone. This used to check only
  // `cohort_id: cohort.id` (the Explorer cohort itself), which meant anyone
  // who already had a real seat in a *different* cohort got a brand-new
  // duplicate Explorer row every time this ran (a repeat Open House RSVP
  // through the live registration endpoint, or a resynced Eventbrite batch
  // row) -- the query never even looked at their real enrollment. That
  // duplicate then silently shadowed the student's real points/attendance
  // (`pickBestEnrollment`'s recency tiebreak could make the new, empty
  // duplicate outrank their real account at login) or, if the duplicate
  // landed in a different cohort than the one their live sessions belong to,
  // caused live-session check-in to fail outright with no useful error.
  // Found live 2026-07-31 across 8+ real students (Sonya Parker, Britiana
  // Akhile, Martin Mungai, Marcus Zeno, and others) before being traced back
  // to this exact query scope -- every one of those was a symptom, this is
  // the actual source. `pickBestEnrollment` picks the same canonical account
  // the real login flow would, so a caller who already has multiple active
  // rows (a pre-existing duplicate from before this fix) still gets routed
  // to their real one, not an arbitrary match.
  const existingCandidates = await Enrollment.findAll({ where: { email, status: 'active' } });
  const existing = pickBestEnrollment(existingCandidates);
  if (existing) {
    // FILL IN A PHONE NUMBER WE DID NOT HAVE, and only that.
    //
    // The Open House form now requires a phone number (Ali, 2026-11-11), but this
    // early return meant a returning visitor typed one and we threw it away - so the
    // field would be mandatory for them and still leave us with nothing. Every
    // Explorer account created before today has an empty phone, which is most of
    // them, so this is the common path rather than an edge case.
    //
    // Narrow on purpose: it fills a BLANK only. It never overwrites a number already
    // on the account, because a stranger who types someone else's email must not be
    // able to rewrite that person's contact details. Nothing else about the
    // enrollment is touched, and a failure here is logged rather than thrown - the
    // signup itself has already succeeded by any measure that matters to the visitor.
    const incoming = (input.phone || "").trim();
    if (incoming && !(existing.phone || "").trim()) {
      try {
        await existing.update({ phone: incoming });
      } catch (err: any) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "warn", service: "backend", event: "enrollment.phone_backfill_failed",
          outcome: "partial", error_class: err?.constructor?.name || "UnknownError",
          context: { enrollment_id: existing.id },
        }));
      }
    }
    return { enrollment: existing, created: false, cohort_id: existing.cohort_id };
  }

  const source = input.source || 'Open House Explorer';
  const enrollment = await Enrollment.create({
    full_name: input.name.trim() || 'Open House Guest',
    email,
    company: input.company?.trim() || '',
    title: input.title?.trim() || undefined,
    company_size: input.company_size?.trim() || undefined,
    phone: input.phone || undefined,
    cohort_id: cohort.id,
    enrollment_type: 'explorer',
    // `tier: 'guest'` — the other half of what describes a free account, and it
    // was missing here. `enrollment_type` is the PROGRAMME (the free AI course);
    // `tier` is the ACCESS LEVEL. Leaving `tier` at its 'member' default meant a
    // free Explorer read as a paid-access member to everything that keys on
    // access rather than programme, and two of those are user-visible:
    // `v1EnrollmentLookupController` reports them ENROLLED to the partner app,
    // and `reeseWelcomeService` greets them with the student intro rather than
    // the account intro. See docs/growth-os-reset/FREE_ACCOUNT_CONSUMERS.md.
    tier: 'guest',
    // T205: the moment this person entered the Explorer journey. Set once here, at
    // registration; nothing rewrites it later.
    explorer_entered_at: new Date(),
    payment_status: 'pending',
    payment_method: 'credit_card',
    status: 'active',
    portal_enabled: true,
    notes: `${source}${input.order_id ? ` | eventbrite_order:${input.order_id}` : ''}`,
  });
  // NOTE: intentionally does NOT increment cohort.seats_taken — Explorers are not
  // paying students and must never consume a paid seat.

  // Capture as a Lead for CRM visibility (best-effort — never block the account).
  let leadId: number | null = null;
  try {
    const [lead] = await Lead.findOrCreate({
      where: { email },
      defaults: {
        name: enrollment.full_name,
        email,
        phone: input.phone || '',
        source: 'open_house',
        form_type: 'open_house',
        status: 'new',
        utm_source: input.utm_source,
        utm_campaign: input.utm_campaign,
        page_url: input.page_url,
      } as any,
    });
    leadId = (lead as any)?.id ?? null;

    // Push to GHL so admissions and Cora Voice can actually reach them. This
    // path captured leads for months without ever calling the sync, which is
    // why 490 open-house leads had no GHL contact (Kes, 2026-08-25).
    // Fire-and-forget, matching every other sync call site: lead capture is
    // already best-effort here and a CRM hiccup must not fail the signup.
    // ghlAccountRouting withholds the push while the School of Data Analytics
    // key is unprovisioned, so this cannot write to the wrong account.
    if (lead) {
      pushLeadToGhl(lead).catch((e: any) =>
        console.error('[OpenHouse] GHL sync error:', e?.message)
      );
    }
  } catch (err: any) {
    console.error('[OpenHouse] Lead capture failed (non-fatal):', err.message);
  }

  // T205: the Explorer journey profile, at registration rather than overnight. After
  // lead capture, because the bridge resolves `lead_id` by normalized email. Never
  // throws — a bridge failure must not fail an enrollment, and the nightly repair
  // remains the recovery path for whatever this misses.
  await bridgeExplorerProfileAtRegistration(enrollment.id, 'enroll_explorer');

  // Send the branded welcome with a one-click portal magic link, targeting THIS
  // specific new enrollment. We generate the token on `enrollment` directly rather
  // than doing an email-keyed lookup, which previously (via requestMagicLink) could
  // land the token on a stale enrollment when a person has several. Best-effort so
  // an email hiccup never loses the account, but the outcome is recorded to
  // CommunicationLog and any failure is surfaced — never silently swallowed. Only
  // fires on first creation, so re-running onboarding never double-sends.
  {
    // MIGRATED onto the shared `sendPortalWelcome` on 2026-10-24.
    //
    // This used to be its own ~45-line copy of token-minting, sending and logging,
    // and the copy had NO IDEMPOTENCY GUARD. The comment above claimed "Only fires
    // on first creation, so re-running onboarding never double-sends" - true of
    // this call site, and not true of the ADDRESS, which is what the recipient
    // experiences. Measured on production: four addresses carry two
    // `open_house_welcome` rows each, two of them as recently as 2026-10-16 and
    // 2026-10-22. A person with two enrollments is welcomed twice.
    //
    // The shared module keys on a `sent` CommunicationLog row for the address under
    // ANY welcome event name, so this door and the portal door can no longer
    // welcome the same person once each either.
    //
    // The EVENT NAME is deliberately unchanged, so this door's log history stays
    // one coherent series across the migration.
    //
    // Two incidental fixes come with it. The old block logged the subject
    // "Welcome to Colaberry — your AI journey starts now" while `sendTrainingWelcome`
    // actually sends one with a colon, so every row this door wrote recorded a
    // subject that was never sent. And the token is still minted on THIS enrollment
    // rather than by an email-keyed lookup, which the module preserves and documents.
    const { sendPortalWelcome } = await import('./welcome/sendPortalWelcome');
    const welcome = await sendPortalWelcome({
      enrollment: enrollment as unknown as import('./welcome/sendPortalWelcome').WelcomeEnrollment,
      leadId,
      event: 'open_house_welcome',
      // This door's reader has not enrolled in anything. They clicked an ad about
      // an Open House, gave an email, and now have an account they did not ask
      // for in so many words - so they get the Explorer welcome, which opens on
      // the two-minute video rather than on "your seat is reserved" and "what to
      // expect week one". Ali, 2026-11-10, on the standard one rendered for this
      // path: "This is not the right message."
      //
      // No subjectOverride: the template carries its own.
      template: 'explorer',
    });
    // Preserved verbatim from the old block: a genuine failure still names the
    // enrollment and the redacted address. A SKIP is not a failure - it means the
    // person already has their link - so it is deliberately not logged as one.
    if (!welcome.sent && !welcome.skipped) {
      console.error(`[OpenHouse] Welcome email NOT sent for enrollment ${enrollment.id} (${redactForLogs(email)}): ${welcome.reason}`);
    }
  }

  return { enrollment, created: true, cohort_id: cohort.id };
}

/*
 * `convertExplorerToStandard` WAS HERE AND IS DELETED, C10.17 Phase 2.
 *
 * It took an enrollment id and did one thing: `update({ enrollment_type: 'standard', tier:
 * 'member' })`. Admin "Convert to enrolled", moving an Explorer onto a standard enrollment.
 *
 * It is removed rather than narrowed because once `enrollment_type` is origin, every
 * possible version of this function is wrong:
 *
 *   - Keep writing `enrollment_type` and it reintroduces exactly the rewrite this phase
 *     exists to delete, on the one path where no payment even justifies it.
 *   - Write `tier: 'member'` alone and the row rests at explorer + member + UNPAID. The
 *     Phase 1 paywall gates on `isExplorer && !paid`, so an admin would "convert" somebody
 *     and leave them locked out of weeks 1-12 - a latent trap, which is what this function
 *     already was once before.
 *   - Teach the paywall to honour `tier === 'member'` as well, and the gate changes for
 *     rows that exist in production TODAY (explorer + non-guest tier is `freeAccountCohe
 *     renceBackfill`'s "Shape A"). That is a live, customer-visible access change and a
 *     decision for Ali, not a side effect of a bookkeeping fix.
 *
 * Deleting is the only option that leaves no wrong answer in the tree, and it costs
 * nothing: the function had NO callers. Verified across backend/src, frontend/src,
 * /scripts and /tests - the only references were its own definition and its own tests.
 * The live admin "Convert to enrolled" buttons (`routes/admin/acceleratorRoutes.ts:93`,
 * `routes/admin/communityMemberRoutes.ts:65`) call `grantFreeAccess`, which grants
 * `tier: 'member'` AND `payment_status: 'paid'` through `grantMembership` and records a
 * comp subscription. That path was always the right one and is unaffected.
 *
 * Delegating to it instead of deleting was considered and rejected: enrollmentService
 * cannot import subscriptionService, because `grantMembership` already calls
 * `retireRedundantExplorerAccounts` from this file, and CLAUDE.md forbids the circular
 * dependency that would create.
 */
