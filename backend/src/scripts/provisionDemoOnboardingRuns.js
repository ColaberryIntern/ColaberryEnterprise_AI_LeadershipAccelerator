/**
 * provisionDemoOnboardingRuns — 2026-05-20.
 *
 * Provisions (or resets) three fresh demo enrollments used to drive the
 * portal requirements-builder first-run flow end-to-end three times, each
 * producing a genuinely different project. One project per enrollment is a
 * DB constraint (projects.enrollment_id is UNIQUE), so three independent
 * runs require three enrollments rather than reusing one.
 *
 * Why three enrollments instead of resetting one: non-destructive. We never
 * DELETE pre-existing customer data; we only touch rows owned by the three
 * demo emails below. Re-running is safe (idempotent upsert on email).
 *
 * Runs INSIDE the production backend container, where DATABASE_URL lives:
 *   ssh root@95.216.199.47 'docker exec -i -w /app accelerator-backend node' < backend/src/scripts/provisionDemoOnboardingRuns.js
 *   ... and append ' --reset' by piping with an env flag (see RESET below).
 *
 * Modes:
 *   default        provision (upsert) the 3 enrollments, mint fresh 90-day
 *                  portal tokens, print RESULT_JSON line for the local driver.
 *   RESET=1        delete projects/requirements_maps/capabilities/features
 *                  owned by the 3 demo enrollments (FK-safe order), putting
 *                  each back into 'needs_requirements' first-run state, then
 *                  re-mint tokens.
 *
 * Output: a single line `RESULT_JSON:[...]` on stdout that the local
 * Playwright driver captures to scripts/.demo_onboarding_runs.json.
 *
 * Idempotency: upsert keyed on email; reset is delete-then-recreate-safe.
 */
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');

// Inherit the demo cohort so these enrollments are valid program members.
const COHORT_ID = process.env.DEMO_COHORT_ID || '79e9785d-4426-4ecd-9500-92dc1ea0a344';
const TOKEN_TTL_DAYS = 90;
const RESET = process.env.RESET === '1' || process.argv.includes('--reset');

const RUNS = [
  { run: 1, email: 'ali+demo-run1@colaberry.com', full_name: 'Demo Run 1 (Reqs E2E)' },
  { run: 2, email: 'ali+demo-run2@colaberry.com', full_name: 'Demo Run 2 (Reqs E2E)' },
  { run: 3, email: 'ali+demo-run3@colaberry.com', full_name: 'Demo Run 3 (Reqs E2E)' },
];

function tokenExpiry() {
  return new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * FK-safe teardown of all project-side data for one enrollment, leaving the
 * enrollment row intact so the next save re-creates a clean project.
 */
async function resetEnrollmentProjectData(s, enrollmentId) {
  // features -> capabilities -> requirements_maps -> projects
  await s.query(
    `DELETE FROM features WHERE capability_id IN (
       SELECT c.id FROM capabilities c
       JOIN projects p ON p.id = c.project_id
       WHERE p.enrollment_id = :eid)`,
    { replacements: { eid: enrollmentId } }
  );
  await s.query(
    `DELETE FROM capabilities WHERE project_id IN (
       SELECT id FROM projects WHERE enrollment_id = :eid)`,
    { replacements: { eid: enrollmentId } }
  );
  await s.query(
    `DELETE FROM requirements_maps WHERE project_id IN (
       SELECT id FROM projects WHERE enrollment_id = :eid)`,
    { replacements: { eid: enrollmentId } }
  );
  await s.query(`DELETE FROM projects WHERE enrollment_id = :eid`, {
    replacements: { eid: enrollmentId },
  });
}

async function upsertEnrollment(s, spec) {
  const token = crypto.randomUUID();
  const expires = tokenExpiry();

  const existing = await s.query(
    `SELECT id FROM enrollments WHERE email = :email AND cohort_id = :cohort LIMIT 1`,
    { replacements: { email: spec.email, cohort: COHORT_ID }, type: QueryTypes.SELECT }
  );

  let enrollmentId;
  if (existing.length > 0) {
    enrollmentId = existing[0].id;
    if (RESET) await resetEnrollmentProjectData(s, enrollmentId);
    await s.query(
      `UPDATE enrollments
         SET portal_token = :token,
             portal_token_expires_at = :expires,
             portal_enabled = true,
             intake_completed = false,
             status = 'active'
       WHERE id = :id`,
      { replacements: { token, expires, id: enrollmentId } }
    );
  } else {
    enrollmentId = crypto.randomUUID();
    await s.query(
      `INSERT INTO enrollments
         (id, full_name, email, company, cohort_id, status,
          payment_status, payment_method, portal_enabled, portal_token,
          portal_token_expires_at, intake_completed, created_at)
       VALUES
         (:id, :full_name, :email, :company, :cohort, 'active',
          'paid', 'invoice', true, :token,
          :expires, false, now())`,
      {
        replacements: {
          id: enrollmentId,
          full_name: spec.full_name,
          email: spec.email,
          company: 'Colaberry Demo',
          cohort: COHORT_ID,
          token,
          expires,
        },
      }
    );
  }

  return {
    run: spec.run,
    email: spec.email,
    enrollment_id: enrollmentId,
    portal_token: token,
    portal_token_expires_at: expires.toISOString(),
    portal_url: `https://enterprise.colaberry.ai/portal/verify?token=${token}`,
    reset: RESET && existing.length > 0,
    created: existing.length === 0,
  };
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set — this script must run inside the backend container.');
    process.exit(1);
  }
  const s = new Sequelize(url, { logging: false });
  try {
    await s.authenticate();
    const results = [];
    for (const spec of RUNS) {
      results.push(await upsertEnrollment(s, spec));
    }
    // Human-readable summary on stderr, machine-readable on stdout.
    for (const r of results) {
      console.error(
        `[provision] run${r.run} ${r.email} -> enrollment ${r.enrollment_id} ` +
          `(${r.created ? 'created' : r.reset ? 'reset+token' : 'token-refresh'})`
      );
    }
    console.log('RESULT_JSON:' + JSON.stringify(results));
  } catch (err) {
    console.error('[provision] FATAL', err.message);
    process.exit(1);
  } finally {
    await s.close();
  }
})();
