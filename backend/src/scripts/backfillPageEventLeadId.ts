/**
 * Backfill page_events.lead_id from visitor_sessions.lead_id (D1, part 3).
 *
 * resolveIdentity() populates the column going forward; this fills in history.
 * The link already exists — resolveIdentity has always backfilled
 * visitor_sessions.lead_id — so this derives from that authoritative column via
 * page_events.session_id rather than re-deriving identity from scratch.
 *
 * WHY BATCHED: this runs against the production Postgres that also serves the
 * live app, and page_events is one of its largest tables. That instance has
 * OOM'd under concurrent load before (see PROGRESS.md), so a single unbounded
 * UPDATE is not an option. Each batch is a separate transaction with a pause
 * between, so the job can be killed at any point and resumed without loss.
 *
 * Idempotent: only ever touches rows where lead_id IS NULL, so re-running after
 * completion updates 0 rows. Safe to run repeatedly.
 *
 * Usage:
 *   node dist/scripts/backfillPageEventLeadId.js --dry-run
 *   node dist/scripts/backfillPageEventLeadId.js --batch-size 5000 --max-batches 50
 */
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

export interface BackfillOptions {
  dryRun: boolean;
  batchSize: number;
  maxBatches: number;
  pauseMs: number;
}

export interface BackfillResult {
  candidatesBefore: number;
  updated: number;
  batches: number;
  remaining: number;
  stoppedBecause: 'complete' | 'max_batches' | 'dry_run' | 'stalled';
}

export const DEFAULTS: BackfillOptions = {
  dryRun: false,
  batchSize: 5000,
  maxBatches: 1000,
  pauseMs: 500,
};

/** Rows that could be attributed but are not yet. */
const COUNT_SQL = `
  SELECT COUNT(*)::int AS n
  FROM page_events pe
  JOIN visitor_sessions vs ON vs.id = pe.session_id
  WHERE pe.lead_id IS NULL AND vs.lead_id IS NOT NULL`;

/**
 * One batch. The subquery picks a bounded id set first so the UPDATE never takes
 * a lock proportional to the whole table.
 */
const UPDATE_SQL = `
  UPDATE page_events pe
  SET lead_id = src.lead_id
  FROM (
    SELECT pe2.id, vs.lead_id
    FROM page_events pe2
    JOIN visitor_sessions vs ON vs.id = pe2.session_id
    WHERE pe2.lead_id IS NULL AND vs.lead_id IS NOT NULL
    LIMIT :batchSize
  ) AS src
  WHERE pe.id = src.id`;

export function parseArgs(argv: string[]): BackfillOptions {
  const opts = { ...DEFAULTS };
  opts.dryRun = argv.includes('--dry-run');

  /**
   * `min` differs per flag on purpose. A batchSize or maxBatches of 0 is
   * pathological — the first would make every batch a no-op and the second
   * would disable the runaway backstop — so those fall back to the default.
   * A pauseMs of 0 is a legitimate "don't pause" and must be honoured.
   */
  const num = (flag: string, current: number, min: number): number => {
    const i = argv.indexOf(flag);
    if (i === -1) return current;
    const parsed = Number(argv[i + 1]);
    return Number.isFinite(parsed) && parsed >= min ? Math.floor(parsed) : current;
  };

  opts.batchSize = num('--batch-size', opts.batchSize, 1);
  opts.maxBatches = num('--max-batches', opts.maxBatches, 1);
  opts.pauseMs = num('--pause-ms', opts.pauseMs, 0);
  return opts;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Rows affected by an UPDATE, across the shapes Sequelize actually returns.
 *
 * FOUND IN PRODUCTION, NOT IN TEST. The original implementation did
 * `const [, affected] = result; typeof affected === 'number' ? affected : 0`,
 * which is wrong for Postgres: `sequelize.query()` resolves to
 * `[results, metadata]` where metadata is the **pg Result object**, not a row
 * count. So it always evaluated to 0.
 *
 * That was not merely cosmetic under-reporting. The batch loop terminates on
 * `rows === 0`, so it stopped after ONE batch while still reporting
 * `outcome: 'complete'`. The first production run happened to have 65
 * attributable rows — under one batch — so it finished correctly by luck. With
 * more than `batchSize` rows it would have silently left the remainder
 * unattributed.
 *
 * The unit test missed it because it mocked the resolved value as `[[], rows]`,
 * i.e. it asserted my assumption about the driver rather than the driver's
 * actual behaviour. Handled here defensively across shapes so a Sequelize or
 * dialect change cannot silently reintroduce it.
 */
export function extractRowCount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  const candidates: unknown[] = Array.isArray(raw) ? [raw[1], raw[0]] : [raw];
  for (const c of candidates) {
    if (typeof c === 'number') return c;
    if (c && typeof c === 'object' && typeof (c as { rowCount?: unknown }).rowCount === 'number') {
      return (c as { rowCount: number }).rowCount;
    }
    if (c && typeof c === 'object' && typeof (c as { affectedRows?: unknown }).affectedRows === 'number') {
      return (c as { affectedRows: number }).affectedRows;
    }
  }
  return 0;
}

async function countCandidates(): Promise<number> {
  const rows = await sequelize.query<{ n: number }>(COUNT_SQL, { type: QueryTypes.SELECT });
  return rows[0]?.n ?? 0;
}

export async function backfillPageEventLeadId(
  options: Partial<BackfillOptions> = {},
): Promise<BackfillResult> {
  const opts: BackfillOptions = { ...DEFAULTS, ...options };
  const candidatesBefore = await countCandidates();

  console.log(
    JSON.stringify({
      event: 'backfill_page_event_lead_id.start',
      service: 'backfill',
      candidates: candidatesBefore,
      dry_run: opts.dryRun,
      batch_size: opts.batchSize,
      max_batches: opts.maxBatches,
    }),
  );

  if (opts.dryRun) {
    // Report and write nothing. This is the mode that gets run against prod first.
    return {
      candidatesBefore,
      updated: 0,
      batches: 0,
      remaining: candidatesBefore,
      stoppedBecause: 'dry_run',
    };
  }

  let updated = 0;
  let batches = 0;
  let stoppedBecause: BackfillResult['stoppedBecause'] = 'complete';

  while (batches < opts.maxBatches) {
    const raw = await sequelize.query(UPDATE_SQL, {
      replacements: { batchSize: opts.batchSize },
    });

    const rows = extractRowCount(raw);
    batches++;
    updated += rows;

    console.log(
      JSON.stringify({
        event: 'backfill_page_event_lead_id.batch',
        service: 'backfill',
        batch: batches,
        rows,
        updated_total: updated,
      }),
    );

    // Zero rows normally means there is nothing left to attribute. But that is
    // exactly the signal the row-count bug faked, so it is no longer trusted on
    // its own: confirm against a fresh candidate count before declaring victory.
    // If rows are still attributable while the UPDATE claims it changed nothing,
    // something is wrong with the driver contract and the run must say so
    // loudly rather than exit reporting 'complete'.
    if (rows === 0) {
      const stillOutstanding = await countCandidates();
      if (stillOutstanding > 0) {
        stoppedBecause = 'stalled';
        console.warn(
          JSON.stringify({
            event: 'backfill_page_event_lead_id.stalled',
            service: 'backfill',
            level: 'warn',
            outcome: 'failure',
            error_class: 'BackfillStalled',
            rows_reported: 0,
            still_attributable: stillOutstanding,
            detail: 'UPDATE reported 0 rows while candidates remain — row-count extraction may be wrong for this dialect',
          }),
        );
      }
      break;
    }
    if (batches >= opts.maxBatches) {
      stoppedBecause = 'max_batches';
      break;
    }
    if (opts.pauseMs > 0) await sleep(opts.pauseMs);
  }

  const remaining = await countCandidates();
  console.log(
    JSON.stringify({
      event: 'backfill_page_event_lead_id.done',
      service: 'backfill',
      updated,
      batches,
      remaining,
      outcome: stoppedBecause,
    }),
  );

  return { candidatesBefore, updated, batches, remaining, stoppedBecause };
}

/* istanbul ignore next — CLI entry point, exercised operationally not in unit tests */
if (require.main === module) {
  backfillPageEventLeadId(parseArgs(process.argv.slice(2)))
    .then((r) => {
      console.log(`[Backfill] updated=${r.updated} remaining=${r.remaining} (${r.stoppedBecause})`);
      process.exit(0);
    })
    .catch((err: any) => {
      console.error('[Backfill] failed:', err?.message);
      process.exit(1);
    });
}
