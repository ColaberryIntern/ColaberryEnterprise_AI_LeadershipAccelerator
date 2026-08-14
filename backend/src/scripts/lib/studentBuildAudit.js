// studentBuildAudit.js
//
// Gathers one row of build state per active enrollment, straight from Postgres,
// and hands each row to studentBuildVerdict.deriveVerdict. This half is all I/O
// and no judgement; the judgement lives next door in a pure function so it can
// be tested without a database.
//
// STRICTLY READ-ONLY. Every statement here is a SELECT, and the session is
// opened READ ONLY so a future edit cannot quietly turn it into a write. The
// audit runs against production; that guarantee is the whole reason a human
// will trust running it.
//
// ONE ROW PER ENROLLMENT, NOT PER PROJECT
// A student can own more than one project. The row reports the one the portal
// will actually open on: the enrollment active_project_id when it is set,
// otherwise the most recently updated project, with extraProjects recording how
// many others were set aside. Auditing the project the student cannot see would
// produce a green row for a red experience.

const { Client } = require('pg');
const { deriveVerdict } = require('./studentBuildVerdict');

// One statement. Doing this per-enrollment would be 337 round trips against a
// production database for a report someone runs while waiting.
//
// The lateral picks the reported project; the aggregates then hang off that one
// project id. build_plans is read twice on purpose: the latest row of any status
// (what state is the plan in) and the existence of a published row (did anything
// ever reach the student), which are different questions once a draft has been
// stacked on top of a published plan.
const AUDIT_SQL = `
SELECT
  e.id                             AS enrollment_id,
  e.email                          AS email,
  e.full_name                      AS full_name,
  e.active_project_id              AS active_project_id,
  e.enrollment_type                AS enrollment_type,
  e.tier                           AS tier,
  c.id                             AS cohort_id,
  c.name                           AS cohort_name,
  to_char(c.start_date, 'YYYY-MM-DD') AS cohort_start_date,
  p.id                             AS project_id,
  COALESCE(NULLIF(p.name, ''), NULLIF(p.organization_name, '')) AS project_name,
  p.project_stage                  AS project_stage,
  pc.n_projects                    AS n_projects,
  bi.status                        AS intake_status,
  lp.status                        AS plan_status,
  lp.gate_ok                       AS plan_gate_ok,
  lp.version                       AS plan_version,
  lp.gate_violations               AS gate_violations,
  (pub.id IS NOT NULL)             AS has_published_plan,
  COALESCE(t.n_tasks, 0)           AS task_count,
  COALESCE(t.n_dated, 0)           AS dated_task_count,
  COALESCE(t.has_story_000, false) AS has_story_000,
  COALESCE(t.n_verified, 0)        AS verified_task_count,
  COALESCE(t.n_complete_unverified, 0) AS complete_unverified_count,
  COALESCE(il.n_import_lists, 0)   AS browser_imported_lists
FROM enrollments e
LEFT JOIN cohorts c ON c.id = e.cohort_id
LEFT JOIN LATERAL (
  SELECT count(*)::int AS n_projects FROM projects x WHERE x.enrollment_id = e.id
) pc ON true
LEFT JOIN LATERAL (
  SELECT x.* FROM projects x
   WHERE x.enrollment_id = e.id
   ORDER BY (x.id = e.active_project_id) DESC, x.updated_at DESC NULLS LAST
   LIMIT 1
) p ON true
LEFT JOIN LATERAL (
  SELECT x.status FROM build_intake x WHERE x.project_id = p.id ORDER BY x.updated_at DESC LIMIT 1
) bi ON true
LEFT JOIN LATERAL (
  SELECT x.status, x.gate_ok, x.version, x.gate_violations
    FROM build_plans x WHERE x.project_id = p.id ORDER BY x.version DESC LIMIT 1
) lp ON true
LEFT JOIN LATERAL (
  SELECT x.id FROM build_plans x WHERE x.project_id = p.id AND x.status = 'published' LIMIT 1
) pub ON true
LEFT JOIN LATERAL (
  -- n_verified / n_complete_unverified are read from verified_at and status
  -- ONLY, deliberately not from the verification_json added by PR #1463. This
  -- script is a read-only diagnostic run by hand against production, and a
  -- SELECT naming a column an un-migrated database does not have fails the
  -- whole sweep for every enrollment. verified_at has existed since PR #1456;
  -- verification_json depends on an ALTER that ensureSbpSchema is documented to
  -- swallow on failure, which is precisely the case this tool gets run to
  -- diagnose. Reporting slightly less, always, beats reporting nothing exactly
  -- when the schema is the problem.
  SELECT count(*)::int AS n_tasks,
         count(x.due_on)::int AS n_dated,
         bool_or(x.story_id = 'STORY-000') AS has_story_000,
         count(x.verified_at)::int AS n_verified,
         count(*) FILTER (WHERE x.status = 'complete' AND x.verified_at IS NULL)::int
           AS n_complete_unverified
    FROM student_tasks x WHERE x.project_id = p.id
) t ON true
LEFT JOIN LATERAL (
  -- Publish materializes clusters named r0..rN and prep. Anything else was
  -- written by the browser's localStorage import path, which is the fingerprint
  -- of a stale tab having overwritten a real build.
  SELECT count(*)::int AS n_import_lists
    FROM student_task_lists x
   WHERE x.project_id = p.id AND x.cluster !~ '^(r[0-9]+|prep)$'
) il ON true
WHERE e.status = 'active'
  AND ($1::uuid IS NULL OR e.cohort_id = $1::uuid)
ORDER BY c.start_date NULLS LAST, e.email
`;

// gate_violations is a jsonb array of { rule, message, subject }. Only the rule
// names travel into the verdict: the messages quote the student's own
// requirement text, and this report gets pasted into chat and tickets.
function rulesOf(gateViolations) {
  if (!Array.isArray(gateViolations)) return [];
  return gateViolations.map((v) => (v && v.rule) || '').filter(Boolean);
}

function toSnapshot(r) {
  return {
    hasProject: !!r.project_id,
    intakeStatus: r.intake_status || null,
    planStatus: r.plan_status || null,
    planGateOk: r.plan_gate_ok === null || r.plan_gate_ok === undefined ? null : !!r.plan_gate_ok,
    gateViolationRules: rulesOf(r.gate_violations),
    hasPublishedPlan: !!r.has_published_plan,
    taskCount: Number(r.task_count || 0),
    datedTaskCount: Number(r.dated_task_count || 0),
    hasStory000: !!r.has_story_000,
    isActiveProject: !!r.project_id && r.project_id === r.active_project_id,
    cohortStartDate: r.cohort_start_date || null,
    browserImportedLists: Number(r.browser_imported_lists || 0),
    verifiedTaskCount: Number(r.verified_task_count || 0),
    completeUnverifiedCount: Number(r.complete_unverified_count || 0),
  };
}

/**
 * Resolve a cohort by exact id or by a case-insensitive fragment of its name.
 * Ambiguity throws rather than guessing, because the wrong cohort here means
 * the wrong people get audited and, downstream, mailed.
 *
 * @returns {Promise<{id: string, name: string, start_date: string|null}|null>}
 */
async function resolveCohort(db, needle) {
  if (!needle) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(needle);
  const { rows } = await db.query(
    isUuid
      ? `SELECT id, name, to_char(start_date,'YYYY-MM-DD') start_date FROM cohorts WHERE id = $1`
      : `SELECT id, name, to_char(start_date,'YYYY-MM-DD') start_date FROM cohorts WHERE name ILIKE '%' || $1 || '%'`,
    [needle],
  );
  if (!rows.length) {
    const err = new Error(`no cohort matches "${needle}"`);
    err.error_class = 'ValidationError';
    throw err;
  }
  if (rows.length > 1) {
    const err = new Error(`"${needle}" matches ${rows.length} cohorts: ${rows.map((r) => r.name).join(' | ')}`);
    err.error_class = 'ValidationError';
    throw err;
  }
  return rows[0];
}

/**
 * Run the audit.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.cohort]        cohort id or name fragment; null audits every active enrollment
 * @param {string} [opts.connectionString]   defaults to DATABASE_URL
 * @returns {Promise<{generatedAt: string, cohort: object|null, rows: object[], summary: object}>}
 */
async function runAudit(opts = {}) {
  const connectionString = opts.connectionString || process.env.DATABASE_URL;
  if (!connectionString) {
    const err = new Error('DATABASE_URL is not set. Run this inside the backend container.');
    err.error_class = 'ConfigError';
    throw err;
  }

  const db = new Client({ connectionString, statement_timeout: 30000 });
  await db.connect();
  try {
    // Belt and braces on the read-only promise: Postgres itself will now reject
    // any write in this session, including one added by a careless future edit.
    //
    // It has to be SESSION CHARACTERISTICS, not `SET TRANSACTION READ ONLY`.
    // node-postgres sends each query as its own implicit transaction, so a bare
    // SET TRANSACTION applies to the statement that carries it and nothing
    // after, which looks identical in the code and enforces nothing.
    await db.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    const cohort = await resolveCohort(db, opts.cohort);
    const { rows } = await db.query(AUDIT_SQL, [cohort ? cohort.id : null]);

    const out = rows.map((r) => {
      const snap = toSnapshot(r);
      const v = deriveVerdict(snap);
      return {
        email: r.email,
        fullName: r.full_name,
        enrollmentId: r.enrollment_id,
        enrollmentType: r.enrollment_type,
        tier: r.tier,
        cohortName: r.cohort_name,
        cohortStartDate: r.cohort_start_date,
        projectId: r.project_id,
        projectName: r.project_name,
        projectStage: r.project_stage,
        extraProjects: Math.max(0, Number(r.n_projects || 0) - (r.project_id ? 1 : 0)),
        intakeStatus: snap.intakeStatus,
        planStatus: snap.planStatus,
        planVersion: r.plan_version,
        planGateOk: snap.planGateOk,
        hasPublishedPlan: snap.hasPublishedPlan,
        gateViolationRules: snap.gateViolationRules,
        taskCount: snap.taskCount,
        datedTaskCount: snap.datedTaskCount,
        hasStory000: snap.hasStory000,
        browserImportedLists: snap.browserImportedLists,
        isActiveProject: snap.isActiveProject,
        verdict: v.verdict,
        stage: v.stage,
        reason: v.reason,
        notes: v.notes,
      };
    });

    const byStage = {};
    for (const r of out) byStage[r.stage] = (byStage[r.stage] || 0) + 1;

    return {
      generatedAt: new Date().toISOString(),
      cohort: cohort ? { id: cohort.id, name: cohort.name, startDate: cohort.start_date } : null,
      rows: out,
      summary: {
        enrollments: out.length,
        withProject: out.filter((r) => r.projectId).length,
        ready: out.filter((r) => r.verdict === 'READY').length,
        notReady: out.filter((r) => r.verdict === 'NOT_READY').length,
        byStage,
      },
    };
  } finally {
    await db.end();
  }
}

module.exports = { runAudit, resolveCohort, toSnapshot, rulesOf, AUDIT_SQL };
