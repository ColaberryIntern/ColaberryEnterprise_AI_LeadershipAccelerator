import { recomputeAllExplorers } from '../services/explorerGrowth/explorerProfileService';

/**
 * Explorer Growth OS — operator-invoked profile recompute. EPIC 3 T006.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CRON: the cron is flag-gated and stays
 * dark until both Explorer Growth flags are on. But production verification
 * needs all ~153 Explorers to carry a computed profile WHILE the flags remain
 * off. A human running this deliberately is its own authorisation — the same
 * pattern as EPIC 1's backfillPageEventLeadId.
 *
 * It writes profiles and snapshots only. It sends nothing.
 *
 * Usage:
 *   node dist/scripts/recomputeExplorerProfiles.js --dry-run
 *   node dist/scripts/recomputeExplorerProfiles.js --limit 5
 *   node dist/scripts/recomputeExplorerProfiles.js --confirm-production
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
      // Per-flag minimum rather than a shared `> 0` guard: `--limit 0` should be
      // rejected as meaningless, but a legitimate small limit must be accepted.
      if (!Number.isInteger(n) || n < 1) {
        throw new Error('--limit requires a positive integer');
      }
      out.limit = n;
      i += 1;
    } else if (a === '--as-of') {
      const d = new Date(argv[i + 1]);
      if (Number.isNaN(d.getTime())) throw new Error('--as-of requires an ISO date');
      out.asOf = d;
      i += 1;
    }
  }
  return out;
}

/**
 * Refuses to touch production without an explicit flag (CLAUDE.md: no
 * production writes without an explicit environment check). A dry run is
 * always allowed, because reading and reporting is safe anywhere.
 */
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
  const result = await recomputeAllExplorers({
    dryRun: args.dryRun,
    limit: args.limit,
    asOf: args.asOf,
  });

  console.log(
    JSON.stringify(
      {
        event: 'explorer.recompute_complete',
        service: 'explorer-growth',
        level: 'info',
        outcome: result.failed === 0 ? 'success' : 'partial',
        dry_run: args.dryRun,
        duration_ms: Date.now() - started,
        ...result,
        // Truncated so one broken learner cannot flood the log, but the count
        // above is always complete — a silent cap would read as "all fine".
        errors: result.errors.slice(0, 10),
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[recomputeExplorerProfiles] ${err?.message ?? err}`);
    process.exit(1);
  });
}
