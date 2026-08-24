import { runGovernorBatch } from '../services/explorerGrowth/governor/runGovernor';

/**
 * Explorer Growth OS — operator-invoked Governor run. EPIC 4 T005.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CRON: the cron is flag-gated and stays
 * dark. But the shadow review (T009) needs a full set of decisions for all 153
 * Explorers WHILE the flags remain off, so a human can read what the Governor
 * would do before anything is enabled. A person running this deliberately is
 * its own authorisation — the same pattern as EPIC 1's backfill and EPIC 3's
 * recompute script.
 *
 * IT DECIDES AND RECORDS ONLY. Rows are written with `executed: false`; nothing
 * is enqueued and nothing is sent.
 *
 * Usage:
 *   node dist/scripts/runExplorerGovernor.js --dry-run
 *   node dist/scripts/runExplorerGovernor.js --limit 5
 *   node dist/scripts/runExplorerGovernor.js --confirm-production
 */

interface Args {
  dryRun: boolean;
  limit?: number;
  confirmProduction: boolean;
  asOf?: Date;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, confirmProduction: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm-production') out.confirmProduction = true;
    else if (a === '--limit') {
      const n = Number(argv[i + 1]);
      // Per-flag minimum rather than a shared `> 0` guard: `--limit 0` is
      // meaningless and must be rejected, but a legitimate small limit stands.
      if (!Number.isInteger(n) || n < 1) throw new Error('--limit requires a positive integer');
      out.limit = n;
      i += 1;
    } else if (a === '--as-of') {
      const d = new Date(argv[i + 1]);
      if (Number.isNaN(d.getTime())) throw new Error('--as-of requires an ISO date');
      // A FUTURE --as-of would make every profile look freshly scored and
      // silently disable the staleness gate. Rejected here as well as in the
      // gate itself, so the mistake is caught at the point it is made.
      if (d.getTime() > Date.now() + 60_000) {
        throw new Error('--as-of must not be in the future');
      }
      out.asOf = d;
      i += 1;
    }
  }
  return out;
}

/** No production writes without an explicit flag (CLAUDE.md). Dry runs are always safe. */
function assertSafeTarget(args: Args): void {
  if (args.dryRun) return;
  const url = process.env.DATABASE_URL ?? '';
  const looksProd = /accelerator_prod|prod/i.test(url) && !/dev|local|test/i.test(url);
  if (looksProd && !args.confirmProduction) {
    throw new Error(
      'Refusing to write to what looks like production without --confirm-production. ' +
        'Re-run with --dry-run to preview, or pass --confirm-production deliberately.',
    );
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  assertSafeTarget(args);

  const started = Date.now();
  const result = await runGovernorBatch({
    dryRun: args.dryRun,
    limit: args.limit,
    asOf: args.asOf,
  });

  console.log(
    JSON.stringify(
      {
        event: 'governor.run_complete',
        service: 'explorer-growth',
        level: 'info',
        outcome: result.failed === 0 ? 'success' : 'partial',
        dry_run: args.dryRun,
        duration_ms: Date.now() - started,
        ...result,
        // Truncated so one broken learner cannot flood the log — but the counts
        // above are always complete. A silent cap reads as "all fine".
        errors: result.errors.slice(0, 10),
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) process.exitCode = 1;
}

/**
 * Close the pool so the process can exit.
 *
 * EPIC 3's recompute script did its work in 219ms, printed its summary, and
 * then HUNG FOREVER on Sequelize's pooled sockets. An operator saw no
 * completion and no error. Not repeating that.
 */
async function shutdown(): Promise<void> {
  try {
    const { sequelize } = await import('../config/database');
    await sequelize.close();
  } catch {
    // The work is done and reported; a close failure must not turn a successful
    // run into a failed one.
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`[runExplorerGovernor] ${err?.message ?? err}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await shutdown();
      process.exit(process.exitCode ?? 0);
    });
}
