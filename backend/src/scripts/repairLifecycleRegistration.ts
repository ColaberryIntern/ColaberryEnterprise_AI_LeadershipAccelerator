/**
 * L7.6 blocker B3 - the operator entry point for the LC-01 repair path.
 *
 * `services/lifecycle/lifecycleRegistrationRepair` holds the contract and the reasoning. This file
 * is only the runner: flags, a ledger, and output an operator can read.
 *
 * DRY RUN IS THE DEFAULT, as in `backfillExplorerEnteredAt` and `backfillFreeAccountCoherence`.
 * The script derives its own population from the LC-01 detectors, so the default call has to be
 * the harmless one.
 *
 * WHY A LEDGER. The repair writes rows to a governance table. Without a ledger the only undo is a
 * hand-written DELETE against production, so the forward run records exactly which lifecycle ids
 * it created and `--invert` hands them back. The delete is guarded by `entry_point` inside the
 * service, so a wrong ledger cannot remove a hook-registered lifecycle.
 *
 * Usage:
 *   docker exec accelerator-backend node dist/scripts/repairLifecycleRegistration.js
 *   docker exec accelerator-backend node dist/scripts/repairLifecycleRegistration.js \
 *     --confirm-production --ledger /tmp/b3-ledger.json
 *   docker exec accelerator-backend node dist/scripts/repairLifecycleRegistration.js \
 *     --invert /tmp/b3-ledger.json --confirm-production
 */
import * as fs from 'fs';
import { sequelize } from '../config/database';
import {
  REPAIR_ENTRY_POINT, repairUnregisteredLifecycles, revertRepairedLifecycles,
  type RepairReport,
} from '../services/lifecycle/lifecycleRegistrationRepair';

const TAG = '[repairLifecycleRegistration]';

/** What `--invert` reads back. Only the lifecycle ids are load-bearing; the rest is for a human. */
interface Ledger {
  ran_at: string;
  entry_point: string;
  created: Array<{ lifecycle_id: string; project_id: string; side: string }>;
}

function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  return at !== -1 && argv[at + 1] ? argv[at + 1] : null;
}

function printReport(report: RepairReport): void {
  console.log(`${TAG} candidates=${report.candidates.length} dryRun=${report.dryRun}`);
  for (const c of report.candidates) {
    console.log(`${TAG}   ${c.side} ${c.id} created=${new Date(c.createdAt).toISOString()} `
      + `tenant=${c.tenantId ?? 'NONE'}`);
  }
  for (const r of report.results) {
    console.log(`${TAG}   -> ${r.id} ${r.outcome}`
      + (r.lifecycleId ? ` lifecycle=${r.lifecycleId}` : '')
      + (r.errorClass ? ` error_class=${r.errorClass}` : ''));
  }
  if (report.remainingAfter !== null) {
    // The detector re-run, not a subtraction. Non-zero is a partial fix, and it says so.
    console.log(`${TAG} REMEASURED AFTER THE RUN: ${report.remainingAfter} still unregistered`);
  }
}

async function runForward(confirm: boolean, ledgerPath: string | null): Promise<void> {
  const report = await repairUnregisteredLifecycles({ dryRun: !confirm });
  printReport(report);

  if (!confirm) {
    console.log(`${TAG} DRY RUN. Nothing was written. Re-run with --confirm-production to repair.`);
    return;
  }

  const created = report.results
    .filter((r) => r.outcome === 'registered' && r.lifecycleId)
    .map((r) => ({ lifecycle_id: r.lifecycleId as string, project_id: r.id, side: r.side }));

  if (ledgerPath) {
    const ledger: Ledger = {
      ran_at: new Date().toISOString(), entry_point: REPAIR_ENTRY_POINT, created,
    };
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(`${TAG} ledger written: ${ledgerPath} (${created.length} row(s))`);
  } else if (created.length > 0) {
    // Not a silent omission. Without a ledger the run is still correct and is harder to undo.
    console.log(`${TAG} NO LEDGER PATH GIVEN. ${created.length} row(s) written; `
      + `to undo them, pass their ids from the log above.`);
  }
}

async function runInverse(ledgerPath: string, confirm: boolean): Promise<void> {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as Ledger;
  const ids = (ledger.created ?? []).map((c) => c.lifecycle_id).filter(Boolean);
  console.log(`${TAG} ledger ${ledgerPath}: ${ids.length} lifecycle row(s) to remove`);

  const result = await revertRepairedLifecycles(ids, { dryRun: !confirm });
  if (!confirm) {
    console.log(`${TAG} DRY RUN. Nothing was deleted. Re-run with --confirm-production.`);
    return;
  }
  console.log(`${TAG} deleted ${result.deleted.length} of ${result.requested} requested`);
  if (result.deleted.length !== result.requested) {
    // The service's guard only removes rows whose entry_point is the repair's. A shortfall means
    // the ledger named something this path did not create, which is the guard working.
    console.log(`${TAG} ${result.requested - result.deleted.length} id(s) were NOT repair rows `
      + `and were left alone.`);
  }
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const confirm = argv.includes('--confirm-production');
  const invert = flagValue(argv, '--invert');
  if (invert) await runInverse(invert, confirm);
  else await runForward(confirm, flagValue(argv, '--ledger'));
  await sequelize.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`${TAG} failed`, {
      error_class: err instanceof Error ? err.constructor.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
