/**
 * One-off, idempotent data migration for the Admin Accelerator cohort cleanup:
 *   1. Deletes 3 internal/test cohorts (Timeline Demo Cohort, Ali — Business,
 *      Ram — Business) — safe because every dependent enrollment row is
 *      confirmed internal/test (see getCohortDependents' unsafe-enrollment
 *      check; this script never passes force=true, so a real student would
 *      block the run rather than being silently cascade-deleted).
 *   2. Creates "Cohort - November 2026" (start_date 2026-11-12) if it doesn't
 *      already exist.
 *   3. Moves Kepha Ohanga's active July enrollment to the November cohort and
 *      sets access_starts_at so full-course access defers to the class start
 *      date (free-tier/Timeline access is unaffected — see contentEntitlement.ts).
 *   4. Grants a $199 AccountCredit carrying forward his July payment (on top of
 *      his existing, untouched $50 Open House deposit credit).
 *
 * Every step is idempotent: re-running this script after a partial or full
 * previous run is always safe and never double-applies a change.
 *
 * Usage:
 *   npx ts-node cohortCleanupAndNovemberSetup.ts             (dry run — default, no writes)
 *   npx ts-node cohortCleanupAndNovemberSetup.ts --execute    (applies the changes)
 *
 * PRECONDITION for --execute: a pg_dump snapshot of accelerator_prod must
 * already exist (this script does not take one itself — that is the
 * operator's responsibility, since the cohort-delete step is irreversible):
 *   pg_dump -F c accelerator_prod -f accelerator_prod_pre_cohort_cleanup_<date>.dump
 */

import { Cohort, Enrollment, AccountCredit } from '../models';
import { deleteCohort, createCohort, getCohortDependents } from '../services/cohortService';

export const JUNK_COHORTS = [
  { id: 'cc3709de-c51e-471c-9abc-1e3c94148dfe', name: 'Timeline Demo Cohort' },
  { id: 'fb5e7405-3614-4d26-974e-c2e0e701a8c2', name: 'Ali — Business' },
  { id: '39ebba64-7d56-49ec-8682-5f0cf4188c5a', name: 'Ram — Business' },
] as const;

export const NOVEMBER_COHORT_NAME = 'Cohort - November 2026';
export const NOVEMBER_START_DATE = '2026-11-12';
export const CANONICAL_PROGRAM_ID = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

export const KEPHA_ENROLLMENT_ID = '0a3590a2-f76f-4618-b36d-3f01477c5b15';
export const KEPHA_CREDIT_SOURCE_EVENT_ID = 'cohort-postponement-199-kepha-0a3590a2';
export const KEPHA_CREDIT_AMOUNT_CENTS = 19900;

export interface PlannedChange {
  step: string;
  detail: string;
}

export async function planCohortCleanup(execute: boolean): Promise<PlannedChange[]> {
  const changes: PlannedChange[] = [];
  for (const junk of JUNK_COHORTS) {
    const cohort = await Cohort.findByPk(junk.id);
    if (!cohort) {
      changes.push({ step: 'cohort-delete-skip', detail: `${junk.name} (${junk.id}) already removed` });
      continue;
    }
    const dependents = await getCohortDependents(junk.id);
    if (dependents.unsafeEnrollmentCount > 0) {
      changes.push({
        step: 'cohort-delete-BLOCKED',
        detail: `${junk.name} has ${dependents.unsafeEnrollmentCount} real (non-withdrawn, paid) enrollment(s) — refusing; this script never forces a delete`,
      });
      continue;
    }
    changes.push({
      step: 'cohort-delete',
      detail: `${junk.name} (${junk.id}) — ${dependents.enrollmentCount} enrollment(s), ${dependents.liveSessionCount} session(s), all safe to cascade-delete`,
    });
    if (execute) {
      const result = await deleteCohort(junk.id);
      if (!result.deleted) {
        throw new Error(`Unexpected block deleting ${junk.name} during --execute (dependents changed mid-run?)`);
      }
    }
  }
  return changes;
}

export async function planNovemberCohort(
  execute: boolean
): Promise<{ changes: PlannedChange[]; cohortId: string | null }> {
  const changes: PlannedChange[] = [];
  const existing = await Cohort.findOne({ where: { name: NOVEMBER_COHORT_NAME } });
  if (existing) {
    changes.push({ step: 'november-cohort-skip', detail: `${NOVEMBER_COHORT_NAME} already exists (${existing.id})` });
    return { changes, cohortId: existing.id };
  }

  changes.push({
    step: 'november-cohort-create',
    detail: `Create ${NOVEMBER_COHORT_NAME}, start_date=${NOVEMBER_START_DATE}, program_id=${CANONICAL_PROGRAM_ID}`,
  });
  if (!execute) return { changes, cohortId: null };

  const created = await createCohort({
    name: NOVEMBER_COHORT_NAME,
    start_date: NOVEMBER_START_DATE,
    core_day: 'Thursday',
    core_time: 'Evening',
    max_seats: 50,
    status: 'open',
    cohort_type: 'accelerator',
    program_id: CANONICAL_PROGRAM_ID,
  } as any);
  return { changes, cohortId: (created as any).id };
}

export async function planKephaMove(execute: boolean, novemberCohortId: string | null): Promise<PlannedChange[]> {
  const changes: PlannedChange[] = [];

  const enrollment = await Enrollment.findByPk(KEPHA_ENROLLMENT_ID);
  if (!enrollment) {
    changes.push({ step: 'kepha-move-ERROR', detail: `Enrollment ${KEPHA_ENROLLMENT_ID} not found` });
  } else {
    const alreadyMoved =
      !!novemberCohortId &&
      enrollment.cohort_id === novemberCohortId &&
      String(enrollment.access_starts_at) === NOVEMBER_START_DATE;
    if (alreadyMoved) {
      changes.push({ step: 'kepha-move-skip', detail: 'Already moved to the November cohort with access_starts_at set' });
    } else {
      changes.push({
        step: 'kepha-move',
        detail: `Move enrollment ${KEPHA_ENROLLMENT_ID} to cohort ${novemberCohortId || '<november-cohort-id, not yet resolved>'}, set access_starts_at=${NOVEMBER_START_DATE}`,
      });
      if (execute) {
        if (!novemberCohortId) throw new Error('November cohort id not resolved — cannot move Kepha');
        await enrollment.update({ cohort_id: novemberCohortId, access_starts_at: NOVEMBER_START_DATE });
      }
    }
  }

  const existingCredit = await AccountCredit.findOne({ where: { source_event_id: KEPHA_CREDIT_SOURCE_EVENT_ID } });
  if (existingCredit) {
    changes.push({ step: 'kepha-credit-skip', detail: `Credit ${KEPHA_CREDIT_SOURCE_EVENT_ID} already granted` });
  } else {
    changes.push({
      step: 'kepha-credit',
      detail: `Grant $${(KEPHA_CREDIT_AMOUNT_CENTS / 100).toFixed(2)} credit (reason=cohort_postponement_credit, source_event_id=${KEPHA_CREDIT_SOURCE_EVENT_ID})`,
    });
    if (execute) {
      await AccountCredit.create({
        enrollment_id: KEPHA_ENROLLMENT_ID,
        amount_cents: KEPHA_CREDIT_AMOUNT_CENTS,
        reason: 'cohort_postponement_credit',
        source_event_id: KEPHA_CREDIT_SOURCE_EVENT_ID,
        status: 'available',
        granted_by: 'cohortCleanupAndNovemberSetup.ts',
        note:
          'Postponed from July 2026 cohort to Nov 2026 cohort per student request; carries forward the ' +
          '$199 already paid for July (separate from, and in addition to, his existing $50 Open House ' +
          'deposit credit, which is untouched).',
      } as any);
    }
  }

  return changes;
}

export async function run(execute: boolean): Promise<{ changes: PlannedChange[]; blocked: boolean }> {
  const cleanupChanges = await planCohortCleanup(execute);
  const { changes: novemberChanges, cohortId: novemberCohortId } = await planNovemberCohort(execute);
  const kephaChanges = await planKephaMove(execute, novemberCohortId);
  const changes = [...cleanupChanges, ...novemberChanges, ...kephaChanges];
  const blocked = changes.some((c) => c.step.includes('BLOCKED') || c.step.includes('ERROR'));
  return { changes, blocked };
}

async function main() {
  const execute = process.argv.includes('--execute');
  if (!execute) {
    console.log('DRY RUN (pass --execute to apply). No writes will be made.\n');
  } else {
    console.log('EXECUTE MODE.');
    console.log('PRECONDITION: a pg_dump snapshot of accelerator_prod MUST already exist before this runs.');
    console.log('  e.g. pg_dump -F c accelerator_prod -f accelerator_prod_pre_cohort_cleanup_$(date +%Y%m%d).dump');
    console.log("This script does NOT take that snapshot itself — it is the operator's responsibility.\n");
  }

  const { changes, blocked } = await run(execute);

  console.log('=== Plan ===');
  for (const c of changes) console.log(`[${c.step}] ${c.detail}`);
  console.log(`\n${execute ? 'Applied' : 'Would apply'} ${changes.length} step(s).`);

  if (blocked) {
    console.error('\nOne or more steps blocked/errored — see above. No partial changes were left inconsistent (each step is independently idempotent).');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((err) => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}
