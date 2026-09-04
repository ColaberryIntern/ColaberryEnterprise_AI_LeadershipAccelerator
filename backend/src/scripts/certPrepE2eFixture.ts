/**
 * certPrepE2eFixture — the two students an end-to-end run needs, and a way to
 * remove them again.
 *
 * Cert Prep's whole design turns on a date: the fence opens in Week 7, and the
 * interesting behaviour is on BOTH sides of it. Proving that in production means
 * two enrollments whose cohorts start at known distances in the past, which no
 * real student can provide on demand.
 *
 * WHAT IT TOUCHES, EXACTLY: one cohort and one enrollment per side, all named
 * with a `certprep-e2e` marker and `@colaberry.test` addresses, plus whatever
 * Cert Prep rows the run itself writes for those two enrollments. Nothing else
 * in the database is read or written, and `--cleanup` removes precisely the rows
 * this script created, matched by that marker rather than by "recently created".
 *
 * `@colaberry.test` is deliberate: `.test` is reserved by RFC 2606 and can never
 * be a real address, so no fixture here can ever receive mail, and anything that
 * mistakes one for a customer is visibly wrong at a glance.
 *
 * Usage (inside the backend container, so it uses the app's own JWT secret):
 *   node dist/scripts/certPrepE2eFixture.js            # create + print tokens
 *   node dist/scripts/certPrepE2eFixture.js --cleanup  # remove everything
 */
import jwt from 'jsonwebtoken';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';

const MARKER = 'certprep-e2e';
const OPEN_EMAIL = 'certprep-e2e-open@colaberry.test';
const LOCKED_EMAIL = 'certprep-e2e-locked@colaberry.test';

/** Weeks back for each cohort start: past the Week 7 fence, and short of it. */
const OPEN_WEEKS_AGO = 10;
const LOCKED_WEEKS_AGO = 3;

const cleanup = process.argv.includes('--cleanup');

function isoWeeksAgo(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

async function one<T extends object>(sql: string, replacements: Record<string, any> = {}): Promise<T | null> {
  const rows = await sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
  return rows[0] ?? null;
}

async function ensureCohort(name: string, startDate: string): Promise<string> {
  const existing = await one<{ id: string }>(
    'SELECT id FROM cohorts WHERE name = :name LIMIT 1', { name },
  );
  if (existing) {
    await sequelize.query('UPDATE cohorts SET start_date = :startDate WHERE id = :id',
      { replacements: { startDate, id: existing.id }, type: QueryTypes.UPDATE });
    return existing.id;
  }
  /**
   * core_day and core_time are NOT NULL in production and were not in the
   * development database this script was written against. The first production
   * run failed on exactly that: `null value in column "core_day"`. They are
   * supplied here rather than made nullable, because a cohort genuinely has a
   * meeting day and the drift is in the dev schema, not the prod one.
   */
  const created = await one<{ id: string }>(
    `INSERT INTO cohorts (id, name, start_date, core_day, core_time, created_at)
     VALUES (gen_random_uuid(), :name, :startDate, 'Monday', '18:00', NOW()) RETURNING id`,
    { name, startDate },
  );
  return created!.id;
}

/**
 * A portal token as well as the id, so a human can open the fixture's portal in
 * their own browser rather than having to be handed a JWT. This is the same
 * magic-link mechanism the real login uses: `verifyMagicLink` matches on
 * `portal_token`, an unexpired `portal_token_expires_at`, and `status='active'`.
 * Short-lived on purpose — a fixture account that stays reachable for a month is
 * a standing invitation.
 */
async function ensureEnrollment(
  email: string, fullName: string, cohortId: string,
): Promise<{ id: string; portalToken: string }> {
  /**
   * A UUID, not a hex string. `enrollments.portal_token` is typed `uuid` in
   * production, and the first run there failed with
   * `invalid input syntax for type uuid`. Generated in Postgres so the column's
   * own type decides the format rather than this file guessing at it.
   */
  const [{ portal_token: portalToken }] = await sequelize.query<{ portal_token: string }>(
    'SELECT gen_random_uuid()::text AS portal_token', { type: QueryTypes.SELECT },
  );
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  const existing = await one<{ id: string }>(
    'SELECT id FROM enrollments WHERE email = :email LIMIT 1', { email },
  );
  if (existing) {
    await sequelize.query(
      `UPDATE enrollments
          SET cohort_id = :cohortId, portal_token = :portalToken,
              portal_token_expires_at = :expires, status = 'active'
        WHERE id = :id`,
      { replacements: { cohortId, id: existing.id, portalToken, expires }, type: QueryTypes.UPDATE });
    return { id: existing.id, portalToken };
  }
  const created = await one<{ id: string }>(
    `INSERT INTO enrollments
       (id, full_name, email, company, cohort_id, status, portal_token, portal_token_expires_at, enrolled_at, created_at)
     VALUES (gen_random_uuid(), :fullName, :email, 'Colaberry E2E', :cohortId, 'active', :portalToken, :expires, NOW(), NOW())
     RETURNING id`,
    { fullName, email, cohortId, portalToken, expires },
  );
  return { id: created!.id, portalToken };
}

/** The same token shape the real portal login mints — role, sub, cohort. */
function participantToken(enrollmentId: string, email: string, cohortId: string): string {
  return jwt.sign(
    { sub: enrollmentId, email, cohort_id: cohortId, role: 'participant' },
    env.jwtSecret,
    { expiresIn: '6h' },
  );
}

async function removeFixtures(): Promise<void> {
  const rows = await sequelize.query<{ id: string; email: string }>(
    'SELECT id, email FROM enrollments WHERE email IN (:emails)',
    { replacements: { emails: [OPEN_EMAIL, LOCKED_EMAIL] }, type: QueryTypes.SELECT },
  );
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    // Cert Prep rows first: three of these tables reference the enrollment.
    for (const table of ['cert_responses']) {
      await sequelize.query(
        `DELETE FROM ${table} WHERE session_id IN (SELECT id FROM cert_sessions WHERE enrollment_id IN (:ids))`,
        { replacements: { ids }, type: QueryTypes.DELETE },
      );
    }
    for (const table of ['cert_sessions', 'cert_readiness_snapshots', 'cert_evidence_mappings', 'student_points_events']) {
      await sequelize.query(`DELETE FROM ${table} WHERE enrollment_id IN (:ids)`,
        { replacements: { ids }, type: QueryTypes.DELETE });
    }
    await sequelize.query('DELETE FROM enrollments WHERE id IN (:ids)',
      { replacements: { ids }, type: QueryTypes.DELETE });
  }
  await sequelize.query('DELETE FROM cohorts WHERE name LIKE :like',
    { replacements: { like: `%${MARKER}%` }, type: QueryTypes.DELETE });
  console.log(`removed ${ids.length} fixture enrollment(s) and their cohorts`);
}

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>('SELECT current_database() AS db', { type: QueryTypes.SELECT });
  console.log(`database: ${db}`);

  if (cleanup) {
    await removeFixtures();
    return;
  }

  const openCohort = await ensureCohort(`Cert Prep ${MARKER} open`, isoWeeksAgo(OPEN_WEEKS_AGO));
  const lockedCohort = await ensureCohort(`Cert Prep ${MARKER} locked`, isoWeeksAgo(LOCKED_WEEKS_AGO));
  const open = await ensureEnrollment(OPEN_EMAIL, 'Cert Prep E2E (open)', openCohort);
  const locked = await ensureEnrollment(LOCKED_EMAIL, 'Cert Prep E2E (locked)', lockedCohort);
  const site = process.env.PORTAL_BASE_URL ?? 'https://enterprise.colaberry.ai';
  const link = (t: string) => `${site}/portal/verify?token=${t}&next=/portal/cert-prep`;

  const out = {
    open: {
      enrollment_id: open.id,
      cohort_id: openCohort,
      email: OPEN_EMAIL,
      weeks_ago: OPEN_WEEKS_AGO,
      token: participantToken(open.id, OPEN_EMAIL, openCohort),
      portal_link: link(open.portalToken),
    },
    locked: {
      enrollment_id: locked.id,
      cohort_id: lockedCohort,
      email: LOCKED_EMAIL,
      weeks_ago: LOCKED_WEEKS_AGO,
      token: participantToken(locked.id, LOCKED_EMAIL, lockedCohort),
      portal_link: link(locked.portalToken),
    },
  };
  console.log('FIXTURES_JSON_BEGIN');
  console.log(JSON.stringify(out));
  console.log('FIXTURES_JSON_END');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('FAILED:', err?.message ?? err); process.exit(1); })
  .finally(() => { void sequelize.close().catch(() => undefined); });
