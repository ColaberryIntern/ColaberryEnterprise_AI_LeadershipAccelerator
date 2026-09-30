/**
 * Grant portal login access to every active student in one cohort.
 *
 * Backfill for the QR check-in failure found after the 2026-07-23 Orientation:
 * enrollments created through the admin "add student" path were written with
 * portal_enabled = false, so those students hit "Your enrollment is pending
 * admin approval for portal access" at the login screen and could never scan
 * their way into class. The default is fixed in enrollmentService, but rows
 * already in the database need this one-shot repair.
 *
 * Read-only unless --apply is passed. Idempotent: rows already enabled are
 * skipped, so re-running produces the same end state with no extra writes.
 * Does NOT email anyone — it only flips access. Sending sign-in links is a
 * separate operation on purpose.
 *
 * Run: `npx ts-node backend/src/scripts/enablePortalForCohort.ts --cohort="<uuid or exact cohort name>" [--apply]`
 *
 * Output: a per-student table plus a summary line, to stdout.
 */

import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Cohort, Enrollment } from '../models';

interface Args {
  cohort: string;
  apply: boolean;
}

/** Pure: parse argv into the script's typed inputs. Exported for testing. */
export function parseArgs(argv: string[]): Args | { error: string } {
  const cohortArg = argv.find((a) => a.startsWith('--cohort='));
  const cohort = cohortArg ? cohortArg.slice('--cohort='.length).trim() : '';
  if (!cohort) {
    return { error: 'Missing --cohort=<uuid or exact cohort name>' };
  }
  return { cohort, apply: argv.includes('--apply') };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve the cohort by id when the arg looks like a UUID, else by exact name. */
async function findCohort(idOrName: string) {
  if (UUID_RE.test(idOrName)) return Cohort.findByPk(idOrName);
  return Cohort.findOne({ where: { name: idOrName } });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(`FATAL: ${parsed.error}`);
    process.exit(1);
  }
  const { cohort: cohortRef, apply } = parsed;

  await sequelize.authenticate();

  const cohort = await findCohort(cohortRef);
  if (!cohort) {
    console.error(`FATAL: no cohort matched "${cohortRef}"`);
    process.exit(1);
  }

  // Only active students. A withdrawn or suspended enrollment must stay locked
  // out — this repairs an accidental default, it does not widen access.
  const blocked = await Enrollment.findAll({
    where: {
      cohort_id: cohort.id,
      status: 'active',
      portal_enabled: { [Op.not]: true },
    },
    order: [['created_at', 'ASC']],
  });

  const alreadyEnabled = await Enrollment.count({
    where: { cohort_id: cohort.id, status: 'active', portal_enabled: true },
  });

  console.log(`Cohort: ${cohort.name} (${cohort.id})`);
  console.log(`Active + already enabled: ${alreadyEnabled}`);
  console.log(`Active + blocked from login: ${blocked.length}`);
  console.log('');

  for (const e of blocked) {
    console.log(`  ${apply ? 'ENABLE' : 'would enable'}  ${e.email}  (${e.full_name})`);
  }

  if (!apply) {
    console.log('');
    console.log(`DRY RUN — nothing written. Re-run with --apply to enable ${blocked.length} student(s).`);
    return;
  }

  // Single statement rather than a per-row loop: one write, no partial-commit
  // window if the process dies midway.
  const [affected] = await Enrollment.update(
    { portal_enabled: true },
    {
      where: {
        cohort_id: cohort.id,
        status: 'active',
        portal_enabled: { [Op.not]: true },
      },
    },
  );

  console.log('');
  console.log(`APPLIED — ${affected} enrollment(s) can now request a sign-in link.`);
}

main()
  .then(async () => { await sequelize.close(); process.exit(0); })
  .catch(async (err: unknown) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    try { await sequelize.close(); } catch { /* connection may already be gone */ }
    process.exit(1);
  });
