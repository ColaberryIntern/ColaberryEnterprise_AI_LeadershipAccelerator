/**
 * certPrepDevLifecycle — proves the whole Cert Prep loop against a real database.
 *
 * The schema and blueprint were proved by certPrepDevProof. This goes further: it
 * loads the authored items, approves them, and then drives an actual sitting —
 * start, answer, complete, score, readiness, points — through the real services.
 * Unit tests mocked every model; this is the first time the services run against
 * Postgres with real rows underneath them.
 *
 * SAFETY: same database-name allow-list as certPrepDevProof, read from the live
 * connection. The local server hosts a database named `accelerator_prod` with
 * real enrollments, so a guard on NODE_ENV or a hostname would protect nothing.
 *
 * THE APPROVALS THIS SCRIPT WRITES ARE DEV FIXTURES, NOT REVIEW. It stamps
 * `dev-fixture@colaberry.test` as the reviewer precisely so nobody can mistake
 * them for a second reader having actually read the items. Real approval needs a
 * real human; these rows exist only so the serving path has something to serve.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureCertPrepSchema } from '../db/ensureCertPrepSchema';
import { seedBlueprint } from '../services/certPrep/certBlueprintService';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../data/certBlueprints/ccarFoundations';
import { CCAR_F_SAMPLE_ITEMS } from '../data/certBlueprints/ccarFoundationsItems';
import {
  createDraftRevision, validateRevision, setReviewStatus, loadServableRevisions,
} from '../services/certPrep/certQuestionBankService';
import {
  startSession, submitResponse, completeSession,
} from '../services/certPrep/certSessionService';
import { getCertAvailability } from '../services/certPrep/certAvailabilityService';
import { computeReadiness, recordReadinessSnapshot } from '../services/certPrep/certReadinessService';
import CertQuestionRevision from '../models/CertQuestionRevision';

const ALLOWED_DATABASES = ['accelerator_cert_dev', 'accelerator_test', 'accelerator_scratch'];
const FIXTURE_REVIEWER = 'dev-fixture@colaberry.test';

const log = (m: string) => console.log(`[life] ${m}`);

async function assertSafeDatabase(): Promise<string> {
  const rows = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  const db = String(rows[0]?.db ?? '');
  if (!ALLOWED_DATABASES.includes(db)) {
    throw new Error(`REFUSING TO RUN against "${db}". Allowed: ${ALLOWED_DATABASES.join(', ')}.`);
  }
  return db;
}

/** A cohort far enough back that its enrollment sits past the Week 7 fence. */
async function makeFixtureEnrollment(): Promise<string> {
  const start = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10); // ~week 11
  const [cohort] = await sequelize.query<{ id: string }>(
    `INSERT INTO cohorts (name, start_date) VALUES ('Cert Dev Cohort', :start)
     RETURNING id`,
    { replacements: { start }, type: QueryTypes.SELECT },
  );
  const [enrollment] = await sequelize.query<{ id: string }>(
    `INSERT INTO enrollments (full_name, email, cohort_id)
     VALUES ('Cert Dev Student', 'cert-dev@colaberry.test', :cohort) RETURNING id`,
    { replacements: { cohort: cohort.id }, type: QueryTypes.SELECT },
  );
  log(`fixture cohort started ${start}, enrollment ${enrollment.id}`);
  return enrollment.id;
}

async function main(): Promise<void> {
  const db = await assertSafeDatabase();
  log(`connected to "${db}" — proceeding\n`);

  await ensureCertPrepSchema();
  await seedBlueprint(CCAR_FOUNDATIONS_BLUEPRINT);

  // ── 1. validate before writing ────────────────────────────────────────────
  log('1. validating all authored items…');
  const problems = CCAR_F_SAMPLE_ITEMS.flatMap((i) =>
    validateRevision(i).map((p) => `${i.question_key}: ${p}`));
  if (problems.length > 0) {
    problems.forEach((p) => log(`   PROBLEM ${p}`));
    throw new Error(`${problems.length} authoring problems — nothing written`);
  }
  log(`   ${CCAR_F_SAMPLE_ITEMS.length} items valid`);

  // ── 2. load as drafts ─────────────────────────────────────────────────────
  log('2. loading as drafts…');
  for (const input of CCAR_F_SAMPLE_ITEMS) await createDraftRevision(input);
  const draftCount = await CertQuestionRevision.count({ where: { review_status: 'draft' } });
  log(`   ${draftCount} drafts in the bank`);

  // ── 3. a draft must NOT be servable ───────────────────────────────────────
  log('3. checking drafts are unservable…');
  const keys = CCAR_F_SAMPLE_ITEMS.map((i) => i.question_key);
  const servableBefore = await loadServableRevisions(keys);
  if (servableBefore.size !== 0) throw new Error(`${servableBefore.size} drafts were servable — the approval gate leaks`);
  log('   0 servable — gate holds');

  // ── 4. approve (dev fixture, NOT review) ──────────────────────────────────
  log(`4. approving as ${FIXTURE_REVIEWER} (a fixture, not a second reader)…`);
  try {
    await setReviewStatus(keys[0], 1, 'approved', '');
    throw new Error('approval without a reviewer was ACCEPTED — the guard is broken');
  } catch (err: any) {
    if (err.code !== 'CERT_APPROVAL_NEEDS_REVIEWER') throw err;
    log('   unattributed approval correctly refused');
  }
  for (const key of keys) await setReviewStatus(key, 1, 'approved', FIXTURE_REVIEWER);
  const servable = await loadServableRevisions(keys);
  log(`   ${servable.size} now servable`);
  if (servable.size !== keys.length) throw new Error(`expected ${keys.length} servable, got ${servable.size}`);

  // ── 5. the fence, against a real enrollment ───────────────────────────────
  log('5. checking availability for a real enrollment…');
  const enrollmentId = await makeFixtureEnrollment();
  const availability = await getCertAvailability(enrollmentId);
  log(`   week ${availability.programWeek}, start week ${availability.startWeek}, available=${availability.available}`);
  if (!availability.available) throw new Error(`fence closed unexpectedly: ${availability.reason}`);

  // ── 6. a real sitting ─────────────────────────────────────────────────────
  log('6. running a practice sitting…');
  const view = await startSession({ enrollmentId, mode: 'practice', itemCount: 10 });
  log(`   session ${view.session.id}, ${view.items.length} items served`);

  // answer-protection, checked on the actual payload
  const wire = JSON.stringify(view.items);
  for (const bad of ['correct_keys', 'rationale', 'distractor_rationales']) {
    if (wire.includes(bad)) throw new Error(`served payload leaked "${bad}"`);
  }
  log('   served payload carries no answer data');

  // Answer everything correctly except one, so the score is a known quantity.
  let answered = 0;
  for (const [i, servedItem] of view.items.entries()) {
    const revision = await CertQuestionRevision.findOne({
      where: { question_key: servedItem.question_key, revision: servedItem.revision },
    });
    const key = (revision!.correct_keys as string[]);
    const selection = i === 0 ? ['Z'] : key;  // first one deliberately wrong
    const revealed = await submitResponse(view.session.id, enrollmentId, servedItem.question_key, selection);
    if (i === 0 && revealed.is_correct) throw new Error('a wrong answer scored as correct');
    if (i > 0 && !revealed.is_correct) throw new Error(`a correct answer scored as wrong on ${servedItem.question_key}`);
    answered += 1;
  }
  log(`   ${answered} answered — scoring is server-authoritative`);

  // duplicate submit must not double-record
  const first = view.items[1];
  const rev = await CertQuestionRevision.findOne({ where: { question_key: first.question_key, revision: first.revision } });
  await submitResponse(view.session.id, enrollmentId, first.question_key, rev!.correct_keys as string[]);
  const [{ n }] = await sequelize.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM cert_responses WHERE session_id = :s',
    { replacements: { s: view.session.id }, type: QueryTypes.SELECT },
  );
  if (Number(n) !== view.items.length) throw new Error(`duplicate submit created rows: ${n} for ${view.items.length} items`);
  log(`   duplicate submit updated in place — ${n} response rows`);

  // ── 7. complete and score ─────────────────────────────────────────────────
  log('7. completing…');
  const done = await completeSession(view.session.id, enrollmentId);
  log(`   ${done.correct_count}/${done.total_count} correct, scaled ${done.scaled_score}`);
  log(`   domains: ${JSON.stringify(done.domain_results)}`);

  const again = await completeSession(view.session.id, enrollmentId);
  if (again.scaled_score !== done.scaled_score) throw new Error('completing twice rescored');
  log('   completing twice returned the same score — idempotent');

  // ── 8. readiness ──────────────────────────────────────────────────────────
  log('8. computing readiness…');
  const readiness = await computeReadiness(enrollmentId);
  log(`   state=${readiness!.overall_state} overall=${readiness!.overall_scaled} knowledge=${readiness!.knowledge_scaled}`);
  log(`   confidence=${readiness!.sample_confidence} evidence=${readiness!.evidence_coverage_pct}% answered=${readiness!.answered_total}`);
  if (readiness!.overall_state === 'sustained') {
    throw new Error('one short practice set produced "sustained" — the badge gate is too weak');
  }
  log('   one short set did NOT reach sustained — gate holds');

  const snap = await recordReadinessSnapshot(enrollmentId);
  log(`   snapshot written, policy ${snap!.snapshot.readiness_policy_version}`);

  log('\nALL LIFECYCLE CHECKS PASSED\n');
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(`\n[life] FAILED: ${err.message}\n`);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
