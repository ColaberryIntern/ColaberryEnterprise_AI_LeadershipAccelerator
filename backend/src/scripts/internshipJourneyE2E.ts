/* eslint-disable no-console */
/**
 * AI Internship — end-to-end journey check.
 *
 * Walks ONE applicant through the entire process against a REAL database, using
 * the real services, and asserts the state at every step. This is the contract's
 * Definition of Done expressed as a runnable script rather than a claim:
 *
 *   sign up → see the card → apply → intake → choose a channel → interview →
 *   review and submit → human decision → offer letter → sign and upload →
 *   verify → payment gate → activate → active intern
 *
 * plus the two invariants the whole architecture rests on:
 *
 *   - the training cohort is UNCHANGED after activation
 *   - a second activation creates no second cohort membership
 *
 * ── HOW TO RUN ─────────────────────────────────────────────────────────────
 *
 *   docker run -d --name internship-e2e-pg -e POSTGRES_USER=e2e \
 *     -e POSTGRES_PASSWORD=e2e -e POSTGRES_DB=internship_e2e \
 *     -p 55433:5432 pgvector/pgvector:pg15
 *
 *   DATABASE_URL=postgres://e2e:e2e@localhost:55433/internship_e2e \
 *   INTERNSHIP_ENABLED=true \
 *   npx ts-node src/scripts/internshipJourneyE2E.ts
 *
 * Point it at a THROWAWAY database. It creates a cohort, an enrollment and an
 * application, and it is not written to clean up after itself — a fresh container
 * is the cleanup.
 *
 * ── WHY IT CANNOT SEND MAIL ────────────────────────────────────────────────
 *
 * No MANDRILL_API_KEY and no SMTP credentials means `emailService`'s transporter
 * is null, so nothing can leave. The decision step asserts the LEDGER outcome
 * rather than a delivery, which is the honest thing to check here anyway.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${label}${detail ? `  (${detail})` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`);
  }
}

function step(n: number, title: string): void {
  console.log(`\n── ${n}. ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
}

/**
 * Databases this script must NEVER touch.
 *
 * It calls `sequelize.sync()` and creates a fake student, a comp subscription and
 * a cohort. Against a production database that is not a test, it is damage — and
 * an ungated sync on this model graph is its own documented failure mode.
 *
 * The guard is a NAME check because the realistic mistake is running it with the
 * ambient DATABASE_URL still pointing at prod: `docker exec accelerator-backend
 * node dist/scripts/...` inherits the container's env, and the container's env is
 * prod. An opt-in flag would not have helped, because the person making that
 * mistake believes they already opted in.
 */
const FORBIDDEN_DATABASES = ['accelerator_prod', 'accelerator_dev1'];

function assertSafeDatabase(url: string): void {
  const name = (url.split('/').pop() || '').split('?')[0];
  if (FORBIDDEN_DATABASES.includes(name)) {
    console.error(`REFUSING TO RUN against "${name}".`);
    console.error('This script calls sequelize.sync() and creates test data.');
    console.error('Point DATABASE_URL at a throwaway database and run it again.');
    process.exit(2);
  }
  if (!name) {
    console.error('REFUSING TO RUN: no database name in DATABASE_URL.');
    process.exit(2);
  }
}

async function main(): Promise<void> {
  console.log('AI Internship — end-to-end journey');
  const dbUrl = process.env.DATABASE_URL || '';
  assertSafeDatabase(dbUrl);
  console.log(`database: ${dbUrl.replace(/:[^:@]*@/, ':***@')}`);

  // Import AFTER the env is in place so config/database reads the right URL.
  const { default: Cohort } = await import('../models/Cohort');
  const { default: Enrollment } = await import('../models/Enrollment');
  const { default: CohortMembership } = await import('../models/CohortMembership');
  const { default: InternshipApplication } = await import('../models/InternshipApplication');
  const { default: InternshipDocument } = await import('../models/InternshipDocument');
  const { default: InternshipStatusEvent } = await import('../models/InternshipStatusEvent');
  const { ensureInternshipSchema } = await import('../db/ensureInternshipSchema');

  const appSvc = await import('../services/internship/internshipApplicationService');
  const interviewSvc = await import('../services/internship/internshipInterviewService');
  const bank = await import('../services/internship/internshipQuestionBank');
  const decisionSvc = await import('../services/internship/internshipDecisionService');
  const docSvc = await import('../services/internship/internshipDocumentService');
  const activationSvc = await import('../services/internship/internshipActivationService');
  const cohortSvc = await import('../services/internship/internshipCohortService');
  const trackingSvc = await import('../services/internship/internshipTrackingService');
  const conversionSvc = await import('../services/internship/internshipConversionService');
  const eligibility = await import('../services/internship/internshipEligibility');

  step(0, 'Schema');
  // ORDER MATTERS, AND GETTING IT WRONG HID A PRODUCTION BUG.
  //
  // ensureInternshipSchema() runs FIRST so the internship tables come from the
  // real DDL — exactly as they do at boot, where no global sync() runs at all.
  // sequelize.sync() then uses CREATE TABLE IF NOT EXISTS, so it fills in the
  // core model tables and leaves the internship ones untouched.
  //
  // The original order was reversed. sync() built the internship tables from the
  // MODELS, ensureInternshipSchema's CREATE TABLE IF NOT EXISTS then did nothing,
  // and the journey tested a schema production does not have. It passed 57/57
  // while prod could not insert a single interview session, because the DDL had
  // question_set_id NOT NULL and the model had it nullable.
  await ensureInternshipSchema();
  await sequelize.sync();
  // QueryTypes.SELECT, NOT the bare `[rows] = await query()` destructure. On these
  // catalog queries Sequelize returns the ROWS at the outer level, so destructuring
  // hands back the FIRST ROW and `.length` becomes the column count. That read as
  // "1 table" against a database holding 13 — and it made the index check below
  // pass for the wrong reason, since one row of one column is also length 1.
  const tables = await sequelize.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND (table_name LIKE 'internship%' OR table_name = 'cohort_memberships')`,
    { type: QueryTypes.SELECT },
  );
  check('internship tables created', tables.length >= 12, `${tables.length} tables`);

  const idx = await sequelize.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE indexname='uq_cohort_memberships_active' AND indexdef ILIKE 'CREATE UNIQUE%'`,
    { type: QueryTypes.SELECT },
  );
  check('duplicate-membership index is UNIQUE', idx.length === 1, `${idx.length} matching index`);

  step(1, 'A student with a training cohort');
  const trainingCohort = await Cohort.create({
    name: 'July Accelerator', description: 'training class', start_date: '2026-07-06',
    core_day: 'Wednesday', core_time: '6:00 PM', max_seats: 20, seats_taken: 0,
    status: 'open', cohort_type: 'accelerator',
  } as any);
  const enrollment = await Enrollment.create({
    full_name: 'Ada Lovelace', email: 'ada.e2e@example.com', company: 'Analytical Engines',
    cohort_id: trainingCohort.id, payment_status: 'paid', status: 'active',
    enrollment_type: 'standard', tier: 'standard',
  } as any);
  check('student enrolled in a training class', !!enrollment.id, `cohort ${trainingCohort.id.slice(0, 8)}`);
  const trainingCohortBefore = enrollment.cohort_id;

  step(2, 'Today shows the opportunity card');
  let status = await appSvc.getStatus({ enrollmentId: enrollment.id, flagEnabled: true });
  check('card state is eligible', status.card_state === 'eligible', status.card_state);
  check('card renders', status.render === true);
  check('card may pulse (student can act)', status.may_pulse === true);
  check('no card when the flag is off',
    (await appSvc.getStatus({ enrollmentId: enrollment.id, flagEnabled: false })).render === false);

  step(3, 'They apply');
  const started = await appSvc.startApplication({ enrollmentId: enrollment.id });
  const application = started.application;
  check('application created', started.created === true, application.state);
  const again = await appSvc.startApplication({ enrollmentId: enrollment.id });
  check('applying twice does NOT create a second application',
    again.created === false && again.application.id === application.id);

  step(4, 'Administrative intake (Group A only)');
  await appSvc.saveAdministrativeIntake({
    application, enrollmentId: enrollment.id,
    values: {
      legal_name: 'Ada Lovelace', preferred_name: 'Ada', phone: '+1 555 0100',
      time_zone: 'America/Chicago', country: 'US', work_auth_category: 'none',
      permission_to_call: true, permission_ai_interviewer: true, consent_recording: false,
    },
    attestsNotEmployedFulltime: true, commitmentAcknowledged: true, completes: true,
  });
  await application.reload();
  check('intake complete', application.state === 'administrative_intake_complete', application.state);
  check('attestation recorded', application.attests_not_employed_fulltime === true);

  step(5, 'They choose a channel, then answer the interview');
  await appSvc.selectInterviewChannel({ application, enrollmentId: enrollment.id, channel: 'form' });
  await application.reload();
  check('channel selected', application.state === 'interview_channel_selected', application.state);

  const session = await interviewSvc.openSession({ applicationId: application.id, channel: 'form' });
  await interviewSvc.markInterviewStarted({ application, enrollmentId: enrollment.id, channel: 'form' });
  await application.reload();

  const questions = bank.orderedQuestions();
  check('the canonical bank has 21 questions', questions.length === 21, String(questions.length));

  // Answer all but the last, to prove a partial interview cannot complete.
  const answers = questions.slice(0, questions.length - 1).map((q) => ({
    question_key: q.question_key,
    answer_text: q.answer_type === 'text' || q.answer_type === 'long_text'
      ? 'A considered answer from the applicant, in their own words.' : null,
    answer_value: q.answer_type === 'yes_no' ? true
      : q.answer_type === 'choice' ? 'not_employed' : null,
    state: 'answered' as const,
  }));
  const saved = await interviewSvc.saveAnswers({ application, session, answers });
  check('answers accepted', saved.rejected.length === 0, `${saved.saved.length} saved`);

  const rejected = await interviewSvc.saveAnswers({
    application, session,
    answers: [{ question_key: 'not_a_real_question', answer_text: 'x', state: 'answered' }],
  });
  check('an invented question is REJECTED', rejected.rejected.length === 1);

  const partial = await interviewSvc.completeInterviewIfDone({ application, enrollmentId: enrollment.id, session });
  check('a partial interview does NOT complete', partial === false);

  const remaining = await interviewSvc.remainingQuestions(application.id);
  check('exactly one question remains', remaining.length === 1, remaining[0]?.question_key);

  // The cross-channel resume: finish the last one as if by phone.
  const phoneSession = await interviewSvc.openSession({ applicationId: application.id, channel: 'phone' });
  await interviewSvc.saveAnswers({
    application, session: phoneSession,
    answers: [{ question_key: remaining[0].question_key, answer_value: true, state: 'answered' }],
  });
  const done = await interviewSvc.completeInterviewIfDone({ application, enrollmentId: enrollment.id, session: phoneSession });
  await application.reload();
  check('interview completes once every question is answered', done === true);
  check('state is interview_complete', application.state === 'interview_complete', application.state);

  const summary = await interviewSvc.buildSummary(application.id);
  const viaPhone = summary.filter((l) => l.answered_via === 'phone').length;
  check('the channel that captured each answer is preserved', viaPhone === 1, `${viaPhone} via phone`);

  step(6, 'They submit');
  await appSvc.transition(application.id, 'under_review', {
    actor: 'applicant', actorId: enrollment.id, evidenceSource: 'portal',
  });
  await application.reload();
  check('submitted for review', application.state === 'under_review', application.state);

  step(7, 'The human gate');
  let blocked = false;
  try {
    await appSvc.transition(application.id, 'approved', { actor: 'system', actorId: 'ai' });
  } catch { blocked = true; }
  check('an AI/system actor CANNOT approve', blocked === true);

  const badReject = await decisionSvc.decide({
    application, decision: 'reject', reasonCode: 'other_see_message',
    decidedBy: 'dhee@colaberry.com',
  });
  check('a rejection with no student message is REFUSED',
    badReject.ok === false, badReject.ok === false ? badReject.error : '');

  const approved = await decisionSvc.decide({
    application, decision: 'approve', reasonCode: 'other_see_message',
    studentMessage: 'Strong build history and clear availability.',
    reviewerNotes: 'INTERNAL: spoke to Dhee, fine.',
    decidedBy: 'dhee@colaberry.com',
  });
  await application.reload();
  check('a reviewer CAN approve', approved.ok === true, application.state);
  check('email was attempted and reported honestly',
    approved.ok === true && approved.email.attempted === true,
    approved.ok === true ? String(approved.email.outcome) : '');

  step(8, 'Offer letter');
  const pack = await docSvc.generatePackage({
    application, actor: 'system', actorId: 'e2e',
  });
  await application.reload();
  check('package generated', pack.created >= 3, `${pack.created} documents`);
  check('state is offer_letter_ready', application.state === 'offer_letter_ready', application.state);

  const regenerated = await docSvc.generatePackage({ application, actor: 'system', actorId: 'e2e' });
  check('regenerating creates NO second copy', regenerated.created === 0);

  const offer = pack.documents.find((d) => d.document_type === 'unpaid_internship_offer')!;
  const download = await docSvc.readGeneratedDocument({
    applicationId: application.id, documentId: offer.id,
  });
  check('the letter downloads and passes its checksum', download.ok === true,
    download.ok ? `${offer.byte_size} bytes` : (download as any).reason);
  check('it is a real PDF',
    download.ok === true && download.buffer.subarray(0, 5).toString('latin1') === '%PDF-');

  step(9, 'They sign and upload; a reviewer verifies');
  for (const doc of pack.documents.filter((d) => d.requires_signature)) {
    await docSvc.recordSignedUpload({
      application, enrollmentId: enrollment.id,
      documentType: doc.document_type,
      storageKey: `e2e-${doc.document_type}.pdf`,
      originalFilename: 'signed.pdf', mimeType: 'application/pdf', byteSize: 1024,
    });
  }
  await application.reload();
  check('state is signed_documents_uploaded', application.state === 'signed_documents_uploaded', application.state);

  const blockedActivation = await activationSvc.activate({ application, actor: 'reviewer', actorId: 'dhee' });
  // Refused as `wrong_state`: an application still sitting in
  // signed_documents_uploaded has not reached the states activate() accepts. The
  // refusal is what matters; the reason it gives is a detail, and an earlier
  // version of this check demanded `blocked` specifically and failed on correct
  // behaviour.
  check('activation is REFUSED while documents are unverified',
    blockedActivation.ok === false,
    blockedActivation.ok === false ? blockedActivation.reason : 'NOT REFUSED');

  const uploads = await InternshipDocument.findAll({
    where: { application_id: application.id, kind: 'signed_upload' },
  });
  for (const up of uploads) {
    await docSvc.verifyDocument({
      application, documentId: up.id, accept: true, reviewerId: 'dhee@colaberry.com',
    });
  }
  await application.reload();
  check('state is documents_verified', application.state === 'documents_verified', application.state);

  step(10, 'The payment gate');
  const advanced = await activationSvc.advanceAfterDocumentsVerified({ application, actorId: 'e2e' });
  check('an unpaid applicant lands in payment_pending',
    advanced.state === 'payment_pending', advanced.state);
  check('the gate reports WHY', advanced.membership.requires_subscription === true
    && advanced.membership.has_active_subscription === false);

  const stillBlocked = await activationSvc.activate({ application, actor: 'reviewer', actorId: 'dhee' });
  check('activation is BLOCKED on the membership',
    stillBlocked.ok === false && stillBlocked.reason === 'blocked'
    && stillBlocked.blockers.some((b) => b.key === 'membership_active'));

  // Comp them through the REAL admin path — `grantFreeAccess` is what Dhee
  // actually calls for a Ram referral. Hand-writing a Subscription row here
  // would test my fixture rather than the product (and the first attempt did
  // exactly that, failing on a NOT NULL the real path fills in).
  const { grantFreeAccess } = await import('../services/subscriptionService');
  await grantFreeAccess(enrollment.id);
  const comped = await activationSvc.checkMembership({
    enrollmentId: enrollment.id, requiresSubscription: true,
  });
  check('a comp satisfies the gate and is recorded AS a comp',
    comped.ok === true && comped.has_active_comp === true && comped.has_active_subscription === false);

  step(11, 'Activation');
  const activated = await activationSvc.activate({ application, actor: 'reviewer', actorId: 'dhee@colaberry.com' });
  await application.reload();
  check('activated', activated.ok === true && application.state === 'active', application.state);

  const again2 = await activationSvc.activate({ application, actor: 'reviewer', actorId: 'dhee@colaberry.com' });
  const memberships = await CohortMembership.count({
    where: { enrollment_id: enrollment.id, membership_type: 'internship', status: 'active' },
  });
  check('activating twice creates NO second membership', memberships === 1, `${memberships} membership`);
  check('re-activating an already-active intern is refused, not repeated',
    again2.ok === false,
    again2.ok === false ? again2.reason : 'NOT REFUSED');

  step(12, 'THE INVARIANT: the training cohort survived');
  await enrollment.reload();
  check('enrollments.cohort_id is UNCHANGED',
    enrollment.cohort_id === trainingCohortBefore,
    `${String(enrollment.cohort_id).slice(0, 8)} === ${String(trainingCohortBefore).slice(0, 8)}`);
  const internCohort = await cohortSvc.findInternshipCohort();
  check('the internship cohort is a DIFFERENT cohort',
    !!internCohort && internCohort.id !== trainingCohortBefore);

  step(13, 'The card becomes the command card');
  status = await appSvc.getStatus({ enrollmentId: enrollment.id, flagEnabled: true });
  check('card state is active', status.card_state === 'active', status.card_state);
  check('the active card does not pulse', eligibility.mayPulse('active') === false);

  step(14, 'The profile section reports honestly');
  const profile = await trackingSvc.internshipProfileSection(enrollment.id);
  check('profile has the internship', profile.has_internship === true);
  check('it shows the training cohort beside the membership',
    profile.membership?.training_cohort_id === trainingCohortBefore);
  const attendance = profile.metrics.find((m) => m.key === 'attendance_rate')!;
  check('attendance with no rows is UNKNOWN, not 0%',
    attendance.reliability === 'unknown' && attendance.value === null, String(attendance.value));
  check('unknown signals are excluded from assessment',
    profile.excluded_from_assessment.some((e) => e.signal === 'attendance_rate'));

  step(15, 'The audit trail');
  const events = await InternshipStatusEvent.findAll({
    where: { application_id: application.id }, order: [['created_at', 'ASC']],
  });
  check('every transition is recorded', events.length >= 8, `${events.length} events`);
  check('the approval names a human',
    events.some((e) => e.to_state === 'approved' && e.actor_type === 'reviewer'));
  check('no admission decision is attributed to a system actor',
    !events.some((e) => ['approved', 'rejected', 'waitlisted'].includes(e.to_state) && e.actor_type === 'system'));

  step(16, 'Existing-intern conversion — dry run writes nothing');
  const appsBefore = await InternshipApplication.count();
  const membersBefore = await CohortMembership.count();
  const plan = await conversionSvc.planConversion({
    interns: [
      { email: 'ada.e2e@example.com' },
      { email: 'stranger@example.com' },
    ],
  });
  const appsAfter = await InternshipApplication.count();
  const membersAfter = await CohortMembership.count();
  check('dry run wrote no applications', appsAfter === appsBefore, `${appsBefore} -> ${appsAfter}`);
  check('dry run wrote no memberships', membersAfter === membersBefore);
  check('an already-converted intern is recognised',
    plan.rows[0].outcome === 'already_converted', plan.rows[0].outcome);
  check('an unmatched intern is reported, not invented',
    plan.rows[1].outcome === 'no_match', plan.rows[1].outcome);

  const report = await conversionSvc.commitConversion({ plan, actorId: 'dhee@colaberry.com' });
  check('commit skips the already-converted rather than duplicating',
    report.summary.skipped === 1 && report.summary.converted === 0);
  check('still exactly one membership after a commit',
    (await CohortMembership.count({
      where: { enrollment_id: enrollment.id, membership_type: 'internship', status: 'active' },
    })) === 1);

  console.log(`\n${'═'.repeat(64)}`);
  console.log(`${checks - failures}/${checks} checks passed${failures ? `  —  ${failures} FAILED` : ''}`);
  console.log('═'.repeat(64));

  await sequelize.close();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nJOURNEY ABORTED');
  console.error(err);
  try { await sequelize.close(); } catch { /* closing is best-effort */ }
  process.exit(1);
});
