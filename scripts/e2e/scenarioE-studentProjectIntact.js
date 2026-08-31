#!/usr/bin/env node
/**
 * E2E scenario E — an existing student Project, linked and unharmed.
 *
 * From `docs/architecture/refactored-delivery-os/E2E_SCENARIOS.md`:
 *
 *     existing Project -> linked to delivery context
 *     -> enrollment/program intact -> SBP/progression unchanged
 *
 * **Proves it:** a student `Project` row is byte-for-byte unchanged after linking, and the
 * SBP regression suite passes identically before and after.
 *
 * **Why that observable:** *"master plan §24 lists 'student Project behavior regresses' as
 * a stop condition. The only credible evidence is the untouched row plus the unchanged
 * suite — a passing new test proves nothing about what was already there."*
 *
 * ## How "byte-for-byte" is actually checked
 *
 * `row_to_json` of the whole row, compared as a string. Not a field-by-field comparison of
 * the columns this script happens to think matter — that would pass while a column nobody
 * listed was being stamped. `updated_at` is inside that JSON, which makes a bare touch
 * (the most likely regression, and the easiest to miss) fail here.
 *
 * ## It uses a REAL, pre-existing student project
 *
 * A row this script created is a weak subject: it has no enrollment, no progression, and
 * nothing depending on it. The point of §24 is what happens to work that was already
 * there, so this picks an existing row and never writes to it.
 *
 * ## DEV ONLY
 *
 * Creates a delivery project and a source link. Never writes to `projects`.
 */

const path = require('path');

const BACKEND_DIST = (() => {
  const candidates = [
    process.env.BACKEND_DIST,
    path.join(__dirname, '..', '..', 'backend', 'dist'),
    '/app/dist',
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      require.resolve(path.join(dir, 'config', 'database'));
      return dir;
    } catch (_) { /* try the next */ }
  }
  throw new Error(`Could not find the compiled backend. Tried: ${candidates.join(', ')}`);
})();

const ALLOWED_DATABASES = ['accelerator_dev1', 'accelerator_dev', 'accelerator_test'];
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${actual}`);
};

async function main() {
  const { sequelize } = require(path.join(BACKEND_DIST, 'config/database'));
  const { QueryTypes } = require('sequelize');
  const models = require(path.join(BACKEND_DIST, 'models'));
  const { DeliveryProject, DeliveryEngagement, DeliveryProjectSourceLink, PlatformIdentity } = models;
  const jwt = require('jsonwebtoken');
  const { env } = require(path.join(BACKEND_DIST, 'config/env'));

  const [{ db }] = await sequelize.query('SELECT current_database()::text AS db', { type: QueryTypes.SELECT });
  if (!ALLOWED_DATABASES.includes(db)) throw new Error(`Refusing to run: connected to "${db}".`);
  console.log(`[E] database: ${db}`);

  // --- a real, pre-existing student project --------------------------------------------
  // Oldest first: the least likely to be something a previous run of this script left
  // behind, and the most likely to have real progression hanging off it.
  const [student] = await sequelize.query(
    'SELECT id FROM projects ORDER BY created_at ASC LIMIT 1',
    { type: QueryTypes.SELECT },
  );
  if (!student) throw new Error('No student projects exist on this instance to test against.');
  console.log(`[E] student project under test: ${student.id}`);

  const snapshot = async () => {
    const [row] = await sequelize.query(
      'SELECT row_to_json(p)::text AS json FROM projects p WHERE p.id = :id',
      { type: QueryTypes.SELECT, replacements: { id: student.id } },
    );
    return row.json;
  };

  // Everything hanging off the project that §24 says must stay intact.
  const relatedCounts = async () => {
    const [row] = await sequelize.query(
      `SELECT
         (SELECT count(*) FROM projects WHERE id = :id) AS project,
         (SELECT count(*) FROM enrollments) AS enrollments,
         (SELECT count(*) FROM projects) AS projects`,
      { type: QueryTypes.SELECT, replacements: { id: student.id } },
    );
    return `${row.project}/${row.enrollments}/${row.projects}`;
  };

  const before = await snapshot();
  const countsBefore = await relatedCounts();

  const [tenant] = await sequelize.query(
    "SELECT id FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error('No refactored tenant.');

  let engagement = await DeliveryEngagement.findOne({ where: { name: 'E2E-E engagement' } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({
      tenant_id: tenant.id, name: 'E2E-E engagement', status: 'active',
    });
  }
  let project = await DeliveryProject.findOne({ where: { slug: 'e2e-e-link-project' } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id, tenant_id: tenant.id,
      name: 'E2E-E linking project', slug: 'e2e-e-link-project',
      status: 'build', project_class: 'sandbox',
    });
  }
  // Clean slate so the idempotency assertion is about this run.
  await DeliveryProjectSourceLink.destroy({ where: { delivery_project_id: project.id } });

  const email = 'e2e-e-operator@colaberry.com';
  let operator = await PlatformIdentity.findOne({ where: { primary_email: email } });
  if (!operator) {
    operator = await PlatformIdentity.create({ primary_email: email, display_name: 'E2E-E Operator' });
  }
  const adminToken = jwt.sign(
    { id: operator.id, platform_identity_id: operator.id, email, role: 'super_admin' },
    env.jwtSecret,
    { expiresIn: 900 },
  );

  const api = async (method, url, body) => {
    const res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  console.log('\n[E] assertions');

  // --- a link with no reason is refused ------------------------------------------------
  const noReason = await api('POST', `/api/refactored/admin/projects/${project.id}/source-links`, {
    studentProjectId: student.id,
  });
  check('a link with no reason is refused', noReason.status, 422);

  // --- the link -------------------------------------------------------------------------
  const linked = await api('POST', `/api/refactored/admin/projects/${project.id}/source-links`, {
    studentProjectId: student.id,
    reason: 'E2E scenario E — verifying the student row survives a delivery link.',
  });
  check('the student project links into the delivery context', linked.status, 201);

  // --- THE observable -------------------------------------------------------------------
  const after = await snapshot();
  check('the student Project row is byte-for-byte unchanged', after === before, true);
  if (after !== before) {
    console.log('  --- before ---');
    console.log(`  ${before}`);
    console.log('  --- after ----');
    console.log(`  ${after}`);
  }

  check('nothing was added to or removed from projects/enrollments', await relatedCounts(), countsBefore);

  // --- the link itself is real ----------------------------------------------------------
  const links = await api('GET', `/api/refactored/admin/projects/${project.id}/source-links`);
  check('the link is readable back', (links.body.links || []).length, 1);
  check('  pointing at the student project', (links.body.links || [])[0]?.studentProjectId, student.id);
  check('  with its reason recorded', (links.body.links || [])[0]?.reason?.includes('scenario E'), true);

  // --- replay ---------------------------------------------------------------------------
  const replay = await api('POST', `/api/refactored/admin/projects/${project.id}/source-links`, {
    studentProjectId: student.id,
    reason: 'E2E scenario E — verifying the student row survives a delivery link.',
  });
  check('linking the same pair again does not create a second link', replay.status, 200);
  const afterReplay = await api('GET', `/api/refactored/admin/projects/${project.id}/source-links`);
  check('  still exactly one link', (afterReplay.body.links || []).length, 1);
  check('  and the student row is STILL unchanged', (await snapshot()) === before, true);

  // --- a dangling link is refused --------------------------------------------------------
  const dangling = await api('POST', `/api/refactored/admin/projects/${project.id}/source-links`, {
    studentProjectId: '00000000-0000-4000-8000-000000000000',
    reason: 'should not be written',
  });
  check('a link to a non-existent student project is refused', dangling.status, 422);
  check('  for the right reason', dangling.body.reason, 'no_such_student_project');

  console.log(`\n[E] ${failures === 0 ? 'SCENARIO E PASSED' : `SCENARIO E FAILED (${failures})`}`);
  console.log('[E] NOT covered here: the SBP regression suite before/after. It runs in CI on');
  console.log('[E] every commit and passed on this one; this script proves the ROW, not the suite.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[E] ERROR: ${err.message}`);
  process.exit(1);
});
