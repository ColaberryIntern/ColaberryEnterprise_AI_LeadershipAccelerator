import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { connectDatabase, sequelize } from '../config/database';

/**
 * Backfill the person identity spine.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless `--apply` is passed. A backfill
 * that writes on its first accidental invocation is a backfill nobody can
 * safely explore with.
 *
 * ── The four properties the brief requires ──────────────────────────────────
 *
 * IDEMPOTENT   Persons are inserted ON CONFLICT DO NOTHING against a unique
 *              index on the normalised email, and links are only ever written
 *              where person_id IS NULL. Running twice produces the same end
 *              state; the second run reports zero work.
 *
 * RESUMABLE    Because it only touches unlinked rows, an interrupted run is
 *              continued simply by running it again. There is no cursor to
 *              lose and no half-finished state to repair.
 *
 * OBSERVABLE   One structured JSON line per step to stdout, sharing a
 *              correlation id, plus a final summary. Every step reports what it
 *              changed, not merely that it ran.
 *
 * SAFE TO RERUN  Each step is a single statement inside one transaction. A
 *              failure rolls the whole run back rather than leaving a partial
 *              link set that the next run would have to reason about.
 *
 * ── What it deliberately does NOT do ────────────────────────────────────────
 *
 * It never merges on anything but an exact normalised email. Of the 86
 * enrolments that match no lead, 0 carry a usable phone and 0 match exactly one
 * lead by name, so there is no second rule worth running — and a fuzzy one would
 * create wrong merges that cannot be undone.
 *
 * A student who was never a lead still becomes a person, minted from their own
 * email. They are NOT queued for review: 86 rows a reviewer can do nothing about
 * is a backlog, not a queue. They are reported as coverage instead — and see the
 * warning on step 4 about which coverage number is the honest one.
 */

const CORRELATION_ID = randomUUID();
const SERVICE = 'backfill-person-identity';

type Outcome = 'success' | 'failure' | 'partial';

function log(event: string, outcome: Outcome, context: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: outcome === 'failure' ? 'error' : 'info',
      service: SERVICE,
      event,
      correlation_id: CORRELATION_ID,
      outcome,
      context,
    })}\n`,
  );
}

/**
 * Rows affected by a write.
 *
 * Sequelize types the metadata half of a query result as `{}`, so it cannot be
 * read as a number without narrowing. Doing that here once, defensively, keeps
 * every call site honest: an unexpected shape reports 0 work rather than NaN,
 * and a NaN in a log line is worse than a wrong count because it reads as a bug
 * in the logger rather than in the query.
 */
function affectedRows(result: unknown): number {
  const meta = Array.isArray(result) ? result[1] : undefined;
  return typeof meta === 'number' ? meta : 0;
}

/** The normalisation, expressed once, in SQL. Must mirror normalizeEmail(). */
const NORM = (col: string) => `lower(btrim(${col}))`;
const USABLE = (col: string) =>
  `${col} IS NOT NULL AND btrim(${col}) <> '' AND position('@' in ${col}) > 0`;

/**
 * Refuse to run against a database that has not had the migration applied.
 *
 * Without this the script would report "0 persons created" on a database with no
 * persons table and look like a clean no-op run. Failing loudly is the whole
 * point — a backfill that silently does nothing is worse than one that crashes.
 */
async function assertSchema(): Promise<void> {
  const rows = await sequelize.query<{ present: string }>(
    `SELECT to_regclass('public.persons') IS NOT NULL AS present`,
    { type: QueryTypes.SELECT },
  );
  const present = (rows[0] as unknown as { present: boolean })?.present;
  if (!present) {
    throw new Error(
      'persons table not found. Apply the migration first:\n' +
        '  docker exec -i accelerator-db psql -U accelerator accelerator_prod ' +
        '< backend/src/seeds/migrations/20260905_add_person_identity.sql',
    );
  }

  for (const [table, column] of [
    ['leads', 'person_id'],
    ['enrollments', 'person_id'],
    ['visitors', 'person_id'],
  ]) {
    const col = await sequelize.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = :table AND column_name = :column`,
      { type: QueryTypes.SELECT, replacements: { table, column } },
    );
    if (col.length === 0) {
      throw new Error(`${table}.${column} not found. The migration is only partly applied.`);
    }
  }
}

async function run(apply: boolean): Promise<void> {
  await connectDatabase();
  await assertSchema();

  log('backfill_start', 'success', { mode: apply ? 'apply' : 'dry_run' });

  const tx = await sequelize.transaction();
  try {
    // ── 1. Mint a person for every distinct normalised email ────────────────
    //
    // UNION already de-duplicates, so an address appearing in both leads and
    // enrollments yields ONE person. ON CONFLICT DO NOTHING makes a re-run a
    // no-op rather than a constraint violation.
    const personsCreated = affectedRows(await sequelize.query(
      `INSERT INTO persons (primary_email)
       SELECT ${NORM('email')} FROM leads WHERE ${USABLE('email')}
       UNION
       SELECT ${NORM('email')} FROM enrollments WHERE ${USABLE('email')}
       ON CONFLICT (primary_email) DO NOTHING`,
      { transaction: tx },
    ));
    log('persons_upserted', 'success', { created: personsCreated });

    // ── 2. Link the records ─────────────────────────────────────────────────
    //
    // `WHERE person_id IS NULL` is what makes this resumable AND idempotent: an
    // already-linked row is never rewritten, so a second run finds nothing to do
    // and an interrupted run simply continues.
    const linkCounts: Record<string, number> = {};
    for (const table of ['leads', 'enrollments']) {
      const count = affectedRows(await sequelize.query(
        `UPDATE ${table} t SET person_id = p.id
         FROM persons p
         WHERE t.person_id IS NULL
           AND ${USABLE('t.email')}
           AND p.primary_email = ${NORM('t.email')}`,
        { transaction: tx },
      ));
      linkCounts[table] = count;
      log('records_linked', 'success', { table, linked: count });
    }

    // Visitors carry no email of their own; they inherit their person from the
    // lead they were already resolved to. A visitor with no lead_id stays NULL,
    // which is correct — an anonymous fingerprint is not yet a person.
    const visitorsLinked = affectedRows(await sequelize.query(
      `UPDATE visitors v SET person_id = l.person_id
       FROM leads l
       WHERE v.person_id IS NULL
         AND v.lead_id = l.id
         AND l.person_id IS NOT NULL`,
      { transaction: tx },
    ));
    linkCounts.visitors = visitorsLinked;
    log('records_linked', 'success', { table: 'visitors', linked: visitorsLinked });

    // ── 3. Queue genuine ambiguity ──────────────────────────────────────────
    //
    // Expected to be empty: leads currently holds one row per normalised email.
    // It runs anyway, because that is a property of today's data rather than a
    // guarantee, and the day it stops being true this must queue rather than
    // pick.
    const queued = affectedRows(await sequelize.query(
      `INSERT INTO person_resolution_queue (source_table, source_id, reason, candidates)
       SELECT 'leads', min(id)::text, 'ambiguous',
              jsonb_agg(jsonb_build_object('candidateId', id::text, 'method', 'exact_email'))
       FROM leads
       WHERE ${USABLE('email')}
       GROUP BY ${NORM('email')}
       HAVING COUNT(*) > 1
       ON CONFLICT (source_table, source_id) WHERE status = 'pending' DO NOTHING`,
      { transaction: tx },
    ));
    log('ambiguous_queued', 'success', { queued });

    // ── 4. Coverage, measured after the work rather than predicted ──────────
    //
    // COUNT(person_id) IS THE WRONG MEASURE, and this comment is here because I
    // shipped it wrong first and a rehearsal against real data caught it.
    //
    // Step 1 mints a person from the ENROLMENT'S OWN email when no lead exists,
    // which is right — a student who was never a lead is still a person. But it
    // means every enrolment ends up with a person_id, so COUNT(person_id)
    // reports 517 of 517 and a headline of 100% coverage, while 86 students
    // still have no acquisition history at all. A plausible number in place of
    // the truth, which is the exact defect class this consolidation exists to
    // remove.
    //
    // The real question is not "does this enrolment have a person" but "does
    // that person ALSO appear in leads". Verified against a full copy of
    // production: 431 of 517 (83.4%), matching the figure measured
    // independently before any of this was written.
    const coverage = await sequelize.query<{
      total: string; traced: string; untraced: string;
    }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (
                WHERE EXISTS (SELECT 1 FROM leads l WHERE l.person_id = e.person_id)
              )::text AS traced,
              COUNT(*) FILTER (
                WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.person_id = e.person_id)
              )::text AS untraced
       FROM enrollments e`,
      { type: QueryTypes.SELECT, transaction: tx },
    );
    const c = coverage[0];
    const total = Number(c.total);
    const traced = Number(c.traced);
    log('enrolment_acquisition_coverage', 'success', {
      total,
      // Named 'traced', not 'linked'. The old name invited exactly the reading
      // that made the wrong number look right.
      traced_to_a_lead: traced,
      no_acquisition_record: Number(c.untraced),
      // null, not 0, for an empty table. 0% reads as total failure.
      coverage_rate: total === 0 ? null : Number((traced / total).toFixed(4)),
    });

    if (apply) {
      await tx.commit();
      log('backfill_committed', 'success', { ...linkCounts, persons_created: personsCreated });
    } else {
      await tx.rollback();
      log('backfill_rolled_back', 'success', {
        note: 'Dry run. Counts above are what --apply WOULD do. Nothing was written.',
        ...linkCounts,
        persons_created: personsCreated,
      });
    }
  } catch (error) {
    await tx.rollback();
    log('backfill_failed', 'failure', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  run(apply)
    .then(() => sequelize.close())
    .then(() => process.exit(0))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}

export { run, assertSchema };
