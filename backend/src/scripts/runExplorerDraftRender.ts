import {
  DEFAULT_MAX_GENERATIONS,
  runDraftRenderBatch,
} from '../services/explorerGrowth/drafts/runDraftRender';

/**
 * Explorer Growth OS — operator-invoked draft render. Phase 1 of
 * `docs/EXPLORER_MESSAGING_PLAN.html`.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CRON: the cron is flag-gated and stays
 * dark. But the whole point of Phase 1 is for a human to READ the messages the
 * Governor's shadow decisions would have sent, which has to be possible while
 * the flags are still off. A person running this deliberately is its own
 * authorisation — the same pattern as `runExplorerGovernor.ts`.
 *
 * IT RENDERS ONLY. Drafts are written with a status the sender never claims, so
 * nothing this script produces can be picked up and sent. Approving a draft is
 * a separate act, and approval does not send either.
 *
 * START WITH --dry-run. It resolves eligibility for every decision and reports
 * the real distribution — how many would be drafted and precisely which wall
 * the rest hit — for a handful of cheap reads and ZERO model calls. The default
 * is a dry run for exactly that reason: the live path spends money per row.
 *
 * Usage:
 *   node dist/scripts/runExplorerDraftRender.js                      (dry run)
 *   node dist/scripts/runExplorerDraftRender.js --date 2026-10-27
 *   node dist/scripts/runExplorerDraftRender.js --live --limit 5
 *   node dist/scripts/runExplorerDraftRender.js --live --confirm-production
 */

interface Args {
  dryRun: boolean;
  decisionDate?: string;
  limit?: number;
  maxGenerations: number;
  confirmProduction: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv: string[]): Args {
  // DRY BY DEFAULT, and `--live` is the opt-in. The inverse convention would
  // make a bare invocation generate ~150 messages against a paid API, which is
  // the wrong thing to have happen when somebody is just trying the script out.
  const out: Args = { dryRun: true, maxGenerations: DEFAULT_MAX_GENERATIONS, confirmProduction: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--live') out.dryRun = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm-production') out.confirmProduction = true;
    else if (a === '--date') {
      const d = argv[i + 1];
      // Validated as a literal `YYYY-MM-DD` rather than parsed as a Date:
      // `decision_date` is a DATE column and `new Date('2026-10-27')` would
      // drag a timezone into a comparison that has no time in it.
      if (!d || !ISO_DATE.test(d)) throw new Error('--date requires YYYY-MM-DD');
      out.decisionDate = d;
      i += 1;
    } else if (a === '--limit') {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--limit requires a positive integer');
      out.limit = n;
      i += 1;
    } else if (a === '--max-generations') {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error('--max-generations requires a positive integer');
      }
      out.maxGenerations = n;
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
        'Re-run without --live to preview, or pass --confirm-production deliberately.',
    );
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  assertSafeTarget(args);

  const started = Date.now();
  const result = await runDraftRenderBatch({
    decisionDate: args.decisionDate,
    dryRun: args.dryRun,
    limit: args.limit,
    maxGenerations: args.maxGenerations,
  });

  console.log(
    JSON.stringify(
      {
        event: 'draft_render.run_complete',
        service: 'explorer-growth',
        level: 'info',
        outcome: result.failed === 0 ? 'success' : 'partial',
        dry_run: args.dryRun,
        decision_date: args.decisionDate ?? 'today',
        duration_ms: Date.now() - started,
        attempted: result.attempted,
        drafted: result.drafted,
        rejected: result.rejected,
        skipped: result.skipped,
        failed: result.failed,
        by_reason: result.by_reason,
        // Truncated so one broken learner cannot flood the log. The counts and
        // the reason tally above are always complete — a silent cap on those
        // would read as "all fine".
        sample: result.outcomes
          .filter((o) => o.status === 'rejected' || o.status === 'failed')
          .slice(0, 10),
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
 * then hung forever on Sequelize's pooled sockets. Not repeating that.
 */
async function shutdown(): Promise<void> {
  try {
    const { sequelize } = await import('../config/database');
    await sequelize.close();
  } catch {
    // The work is done and reported; a close failure must not turn a
    // successful run into a failed one.
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`[runExplorerDraftRender] ${err?.message ?? err}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await shutdown();
      process.exit(process.exitCode ?? 0);
    });
}
