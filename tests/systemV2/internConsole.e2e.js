/**
 * internConsole.e2e.js — the Intern Console, through the real request path.
 *
 * Unit tests cover every rule in isolation with mocked rows. This proves the whole chain against a
 * live server and the real database: admin auth, route, six batched loaders, the state machine, the
 * email ledger. It is the only check in the set that would notice a query that passes every unit
 * test and throws against real Postgres.
 *
 * WHAT IT ASSERTS, beyond "a 200 came back":
 *
 *   - the roster population is `cohort_memberships`, not `enrollments.cohort_id` — the wrong one
 *     returns nobody, and an empty console reads as "no interns" rather than as a broken query;
 *   - **no attendance anywhere in either payload**, which is a product decision measured against
 *     production (7 join rows across 2 interns, and no denominator anywhere);
 *   - no aggregate cert score, for the same reason: sittings are scored on sets of 1, 10, 15 and 60
 *     items and a "best" across them is not a fact;
 *   - every day carries all five activity categories, so a reader never meets `undefined`;
 *   - the detail endpoint 404s for an enrollment that is not an active intern, which is what makes
 *     the roster's own predicate the authority on who can be opened.
 *
 * WHAT IT WRITES, and what it refuses to write:
 *
 *   - **Only `pause` then `resume`, and only on a test identity.** Those are the two transitions the
 *     state machine gives a reverse edge; `complete`, `withdraw` and `remove` are terminal, so
 *     verifying production by performing one would leave a record that cannot be reopened. The
 *     intern it acts on must look like a test account or the run aborts having written nothing.
 *   - **The nudge is exercised in DRY RUN only.** A live send would email a real person to prove a
 *     test passed.
 *   - It restores the original state in a `finally`, and fails if the restore did not take.
 *
 * WHY IT RUNS INSIDE THE BACKEND CONTAINER: it needs the server's own JWT secret to mint an admin
 * token, and the database to read back what it wrote. Neither should leave the container.
 *
 * Usage, from the repo root:
 *   docker cp tests/systemV2/internConsole.e2e.js accelerator-backend:/tmp/
 *   docker exec accelerator-backend node /tmp/internConsole.e2e.js
 *
 * Exit 0 = all checks pass · 1 = a check failed · 2 = could not run safely.
 */
const jwt = require('/app/node_modules/jsonwebtoken');
const { sequelize } = require('/app/dist/config/database');

const PORT = process.env.PORT || '3001';
const BASE = `http://127.0.0.1:${PORT}`;

/** Identities this test may change the status of. Anyone else is a real intern. */
const TEST_OWNER = /(^ali@colaberry\.com$)|(\+e2e)|(test)|(colaberry-test\.local$)/i;

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures += 1; }
};

const req = async (path, token, init = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* a non-JSON body is itself the finding */ }
  return { status: res.status, body };
};

(async () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) { console.error('[e2e] no JWT_SECRET in this container'); process.exit(2); }
  const token = jwt.sign(
    { sub: 'e2e-admin', email: 'e2e-admin@colaberry-test.local', role: 'admin' },
    secret, { expiresIn: '10m' },
  );

  let restore = null;   // { applicationId, state } captured before any write

  try {
    // ── 1. The gate ──────────────────────────────────────────────────────────────────
    const anon = await req('/api/admin/internship/console');
    check('unauthenticated roster is refused', anon.status === 401 || anon.status === 403, `got ${anon.status}`);

    // ── 2. The roster ────────────────────────────────────────────────────────────────
    const roster = await req('/api/admin/internship/console', token);
    check('roster answers 200', roster.status === 200, `got ${roster.status}`);
    const interns = (roster.body && roster.body.interns) || [];
    const counts = (roster.body && roster.body.counts) || {};
    check('roster returns interns', Array.isArray(interns) && interns.length > 0, `got ${interns.length}`);
    check('counts agree with the rows returned', counts.interns === interns.length,
      `counts.interns=${counts.interns} rows=${interns.length}`);
    check('stage list is served for the pipeline', Array.isArray(roster.body && roster.body.stages)
      && roster.body.stages.length > 0);

    // The population must match cohort_memberships, computed independently here.
    const [[expected]] = await sequelize.query(
      `SELECT count(*)::int AS n FROM cohort_memberships cm
         JOIN cohorts c ON c.id = cm.cohort_id
        WHERE cm.membership_type = 'internship' AND cm.status = 'active'
          AND c.cohort_type = 'ai_internship'`,
    );
    check('population matches cohort_memberships, not enrollments.cohort_id',
      interns.length === expected.n, `api=${interns.length} db=${expected.n}`);

    // ── 3. The absences, which are product decisions ─────────────────────────────────
    const rosterJson = JSON.stringify(roster.body).toLowerCase();
    check('no attendance anywhere in the roster payload', !rosterJson.includes('attend'),
      'an attendance key came back');
    check('no aggregate cert score on a roster row',
      interns.every((i) => i.cert && i.cert.best === undefined && i.cert.average === undefined));

    const row = interns[0];
    check('every day carries all five activity categories',
      (row.activity.days || []).every((d) => d.by_category
        && ['training', 'project', 'certification', 'community', 'other']
          .every((k) => typeof d.by_category[k] === 'number')));
    check('the activity window is 28 days', (row.activity.days || []).length === 28,
      `got ${(row.activity.days || []).length}`);
    check('an intern with no project reports null, not a zero-progress project',
      interns.every((i) => i.project === null || typeof i.project.tasks_pct === 'number'));

    // ── 4. The detail endpoint ───────────────────────────────────────────────────────
    const detail = await req(`/api/admin/internship/console/${row.enrollment_id}`, token);
    check('detail answers 200 for a real intern', detail.status === 200, `got ${detail.status}`);
    check('detail returns the roster row unchanged',
      detail.body && detail.body.intern && detail.body.intern.enrollment_id === row.enrollment_id);
    check('detail carries the cert series with its pass line',
      detail.body && detail.body.cert && typeof detail.body.cert.series.passing_scaled_score === 'number');
    check('every cert point carries its own item count',
      (detail.body.cert.series.attempts || []).every((a) => 'items' in a));
    check('no attendance anywhere in the detail payload',
      !JSON.stringify(detail.body).toLowerCase().includes('"attendance"'));

    const missing = await req('/api/admin/internship/console/00000000-0000-0000-0000-000000000000', token);
    check('detail 404s for an enrollment that is not an active intern', missing.status === 404,
      `got ${missing.status}`);

    // ── 5. The write path, on a test identity only ───────────────────────────────────
    const target = interns.find((i) => i.application_id && TEST_OWNER.test(String(i.email || '')));
    if (!target) {
      console.log('\n[e2e] no test identity on the roster — skipping the write checks rather than');
      console.log('[e2e] changing a real intern\'s status. Read-only checks above still count.');
    } else {
      const [[before]] = await sequelize.query(
        'SELECT state FROM internship_applications WHERE id = :id',
        { replacements: { id: target.application_id } },
      );
      restore = { applicationId: target.application_id, state: before.state };

      const oneWay = await req(`/api/admin/internship/applications/${target.application_id}/transition`,
        token, { method: 'POST', body: JSON.stringify({ action: 'remove' }) });
      check('a one-way action without confirmation is refused', oneWay.status === 400 && oneWay.body.one_way === true,
        `got ${oneWay.status}`);

      if (before.state === 'active') {
        const paused = await req(`/api/admin/internship/applications/${target.application_id}/transition`,
          token, { method: 'POST', body: JSON.stringify({ action: 'pause', reason: '[e2e] reversible check' }) });
        check('pause succeeds on a test identity', paused.status === 200 && paused.body.state === 'paused',
          `got ${paused.status} ${paused.body && paused.body.state}`);

        const [[mid]] = await sequelize.query(
          'SELECT state FROM internship_applications WHERE id = :id',
          { replacements: { id: target.application_id } },
        );
        check('the database actually changed', mid.state === 'paused', `db says ${mid.state}`);

        const resumed = await req(`/api/admin/internship/applications/${target.application_id}/transition`,
          token, { method: 'POST', body: JSON.stringify({ action: 'resume', reason: '[e2e] restoring' }) });
        check('resume puts them back', resumed.status === 200 && resumed.body.state === 'active',
          `got ${resumed.status}`);

        const [[events]] = await sequelize.query(
          `SELECT count(*)::int AS n FROM internship_status_events
            WHERE application_id = :id AND evidence_source = 'intern_console'`,
          { replacements: { id: target.application_id } },
        );
        check('both transitions wrote an audit event', events.n >= 2, `got ${events.n}`);
      } else {
        console.log(`  · skipped pause/resume: application is ${before.state}, not active`);
      }

      // ── 6. The nudge, DRY RUN ONLY ─────────────────────────────────────────────────
      const dry = await req(`/api/admin/internship/applications/${target.application_id}/nudge`,
        token, { method: 'POST', body: JSON.stringify({ template: 'quiet_check_in' }) });
      check('nudge previews without sending', dry.status === 200
        && (dry.body.outcome === 'dry_run' || dry.body.outcome === 'skipped'), `got ${JSON.stringify(dry.body)}`);
      check('the preview names the recipient it would use', dry.body.outcome !== 'dry_run' || !!dry.body.to);

      const badTemplate = await req(`/api/admin/internship/applications/${target.application_id}/nudge`,
        token, { method: 'POST', body: JSON.stringify({ template: 'anything_i_like' }) });
      check('an unknown nudge template is refused', badTemplate.status === 400, `got ${badTemplate.status}`);

      const freeText = await req(`/api/admin/internship/applications/${target.application_id}/nudge`,
        token, { method: 'POST', body: JSON.stringify({ template: 'quiet_check_in', subject: 'anything' }) });
      check('a body trying to supply its own subject is refused', freeText.status === 400, `got ${freeText.status}`);
    }
  } catch (err) {
    console.error(`  ✗ threw: ${err && err.message}`);
    failures += 1;
  } finally {
    if (restore) {
      const [[now]] = await sequelize.query(
        'SELECT state FROM internship_applications WHERE id = :id',
        { replacements: { id: restore.applicationId } },
      );
      if (now.state !== restore.state) {
        await sequelize.query(
          'UPDATE internship_applications SET state = :s WHERE id = :id',
          { replacements: { s: restore.state, id: restore.applicationId } },
        ).catch(() => {});
        const [[after]] = await sequelize.query(
          'SELECT state FROM internship_applications WHERE id = :id',
          { replacements: { id: restore.applicationId } },
        );
        if (after.state !== restore.state) {
          console.error(`[e2e] STATE NOT RESTORED — ${restore.applicationId} is ${after.state}, expected ${restore.state}`);
          failures += 1;
        } else {
          console.log(`\n[e2e] restored ${String(restore.applicationId).slice(0, 8)} to ${restore.state}`);
        }
      } else {
        console.log(`\n[e2e] ${String(restore.applicationId).slice(0, 8)} already back at ${restore.state}`);
      }
    }
  }

  console.log(failures === 0 ? '\n[e2e] PASS' : `\n[e2e] FAIL (${failures} failed check(s))`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('[e2e] FAILED', e && e.message); process.exit(1); });
