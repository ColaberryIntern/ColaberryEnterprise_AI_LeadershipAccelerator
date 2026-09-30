/**
 * One-off cleanup for the specific test/demo enrollments that were polluting
 * /admin/revenue's "Other" and "Explorer" buckets (Ali's own `+N` test
 * personas and the closed Timeline Demo Cohort's leftover student), found by
 * a read-only investigation 2026-07-31. An explicit id list, not a
 * pattern-matching bulk update — deliberately excludes every OTHER
 * `+N@colaberry.com` row in the system (12 more exist) because those are
 * `enrollment_type='standard'` with `payment_status='pending'`: invisible to
 * the revenue dashboard already, so touching them would be scope creep
 * beyond the bug this script exists to fix.
 *
 * Sets `status='withdrawn'` (never a hard delete, matching this codebase's
 * existing convention — see duplicateAccountSweepService.ts). Idempotent:
 * re-running only touches rows still `status='active'`, so a second run is a
 * safe no-op on rows already withdrawn.
 *
 * Runs inside the backend container:
 *   docker exec accelerator-backend node dist/scripts/withdrawTestDemoRevenueAccounts.js --dry
 *   docker exec accelerator-backend node dist/scripts/withdrawTestDemoRevenueAccounts.js
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Enrollment } from '../models';

const DRY = process.argv.includes('--dry');

// enrollment_id -> why (for the log; not stored anywhere).
const TARGET_IDS: Record<string, string> = {
  'e136276a-905e-40b4-bfc7-47cd32f1a49f': 'aleem+1@colaberry.com — test explorer signup',
  'f641b818-874f-4c94-9414-e0bf0850c5b3': 'ali+9@colaberry.com — test explorer signup',
  '4c757d5e-cd4b-449e-a2e7-8d9184403f3a': 'ali+10@colaberry.com — test explorer signup',
  '6cee6d5e-361d-45b5-b008-14d711dabbe4': 'ali+11@colaberry.com — test explorer signup',
  '2422e5ed-ca75-4d77-807c-60e764365e08': 'ali+12@colaberry.com — test explorer signup',
  'a4006fec-8394-46c1-b799-5175e8c262aa': 'ali+15@colaberry.com — test explorer signup',
  'a33a7c4f-2f97-4eb2-b2b8-06cb25f9ea8b': 'ram+1@colaberry.com — test explorer signup',
  '750b8448-5823-4c2b-b511-06c74347771d': 'ali+business@colaberry.com — test paid enrollment ("Other" bucket)',
  'ab2aa3be-53bd-4730-884d-103f060196ec': 'demo+timeline@colaberry.com — Timeline Demo Cohort leftover ("Other" bucket)',
};

interface Row {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
}

async function main(): Promise<void> {
  await sequelize.authenticate();

  const ids = Object.keys(TARGET_IDS);
  const before = (await sequelize.query(
    `SELECT id, full_name, email, status FROM enrollments WHERE id IN (:ids)`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  )) as Row[];

  const missing = ids.filter((id) => !before.some((r) => r.id === id));
  if (missing.length > 0) {
    console.error(JSON.stringify({ event: 'withdraw_test_demo_accounts', outcome: 'failure', error_class: 'ContractViolation', missing_ids: missing }));
    process.exit(1);
  }

  const alreadyWithdrawn = before.filter((r) => r.status !== 'active');
  const toWithdraw = before.filter((r) => r.status === 'active');

  console.log(
    JSON.stringify({
      event: 'withdraw_test_demo_accounts',
      dry_run: DRY,
      total_targeted: ids.length,
      already_withdrawn: alreadyWithdrawn.map((r) => ({ id: r.id, email: r.email, status: r.status })),
      would_withdraw: toWithdraw.map((r) => ({ id: r.id, email: r.email, reason: TARGET_IDS[r.id] })),
    })
  );

  if (DRY || toWithdraw.length === 0) {
    return;
  }

  const [rowsUpdated] = await Enrollment.update(
    { status: 'withdrawn' } as any,
    { where: { id: toWithdraw.map((r) => r.id) } as any }
  );

  console.log(JSON.stringify({ event: 'withdraw_test_demo_accounts', outcome: 'success', rows_updated: rowsUpdated }));
}

main()
  .then(async () => { await sequelize.close(); process.exit(0); })
  .catch(async (err: unknown) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    try { await sequelize.close(); } catch { /* connection may already be gone */ }
    process.exit(1);
  });
