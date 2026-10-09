/**
 * Reports REPLAY DRIFT in approval_requests: rows stamped `replayed_at` whose
 * `action` the replay executor cannot actually perform. Each one is a row the
 * governance ledger files as done that was never done at all.
 *
 * WHY THIS EXISTS. Until 2026-10-07, approvalRequestReplayService.ts claimed the
 * row (`UPDATE ... SET replayed_at = now() WHERE replayed_at IS NULL`) BEFORE it
 * checked whether the action was one it knew how to perform. Because the claim
 * predicate is `replayed_at IS NULL`, a row that then fell through to the
 * unrecognized-action branch was claimed permanently and could never be retried.
 * The reorder has closed that: `replayed_at` is now set if and only if the send
 * was about to be attempted, so this report can only ever shrink from here. What
 * it reports is the backlog the old order already mis-filed.
 *
 * READ-ONLY, AND THERE IS NO WRITE MODE. This script issues SELECTs and nothing
 * else. It prints the SQL that would correct the record; it never runs it. See
 * "THE RECORD CORRECTION" below for why the correction is a status transition and
 * not a reset of `replayed_at`, and why `--apply` is deliberately not implemented.
 *
 * It does NOT make held actions execute, and must never be extended to. Every
 * drifted row was approved by `system:auto_approve_timeout` with no human in the
 * loop, at risk tier R3; performing them would turn a silent hold into a silent
 * send to a real student.
 *
 * Run (read-only, safe against production):
 *   npx ts-node src/scripts/auditApprovalReplayDrift.ts
 *
 * Against production, where DATABASE_URL lives, from the prod host:
 *   docker exec accelerator-backend npx ts-node src/scripts/auditApprovalReplayDrift.ts
 *
 * Exit code: 0 only when there is nothing to report — no drift AND no unperformable
 * approved backlog. 1 when either exists, so this can be wired as a tripwire rather
 * than a report nobody opens. 2 if --apply is passed (see below).
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { REPLAYABLE_ACTIONS } from '../services/workLedger/approvalRequestReplayService';

// Asks the replay service what it can perform rather than keeping a second copy
// of the list. A hard-coded list here would quietly stop matching the code that
// does the work the first time a handler is added, and this report would then
// under-count the drift — the exact class of silence it exists to break.
const REPLAYABLE: readonly string[] = REPLAYABLE_ACTIONS;

interface DriftRow {
  action: string;
  status: string;
  row_count: number;
  tickets: number;
  deciders: number;
  with_payload: number;
  first_seen: string;
  last_seen: string;
}

interface Totals {
  replayed_total: number;
  replayed_replayable: number;
  replayed_drift: number;
  unclaimed_total: number;
  /** Every approved row with no claim, whatever the reason it could not be performed. */
  held_unperformable: number;
  /**
   * The subset of the above whose action IS replayable but whose payload was unusable. Broken
   * out because the two have different fixes: an unreplayable action needs a policy decision,
   * a malformed payload needs the producer fixed.
   */
  held_replayable_but_unusable: number;
}

async function readTotals(): Promise<Totals> {
  // `replayed_replayable` is the positive control. If it is 0 while
  // `replayed_drift` is large, the query is not mis-reading the column — it is
  // reporting that nothing legitimate has ever been replayed.
  //
  // `held_unperformable` is the FORWARD-LOOKING number, and the reason this
  // script is not a one-off. Before the reorder, an unperformable row was filed
  // as replayed and landed in `replayed_drift`. After it, the same row stays
  // unclaimed and lands here instead. Without this count the report would show
  // a frozen historical total while a fresh backlog accumulated unseen — the
  // honest record would have replaced one silence with another.
  const [row] = (await sequelize.query(
    `SELECT
       COUNT(*) FILTER (WHERE replayed_at IS NOT NULL)::int AS replayed_total,
       COUNT(*) FILTER (WHERE replayed_at IS NOT NULL AND action IN (:replayable))::int AS replayed_replayable,
       COUNT(*) FILTER (WHERE replayed_at IS NOT NULL AND action NOT IN (:replayable))::int AS replayed_drift,
       COUNT(*) FILTER (WHERE replayed_at IS NULL)::int AS unclaimed_total,
       -- NOT "action NOT IN (:replayable)". Leaving a malformed payload unclaimed created a
       -- SECOND unclaimed category: a replayable action whose prepared_action is unusable. That
       -- row is approved, unclaimed and will never be performed, but the action-based filter
       -- excludes it, so this script would have printed "no drift" and exited 0 over a dropped
       -- send. That is the same silence the reorder exists to break, arriving through the fix
       -- for it. Any approved row with no claim is unperformable, whatever the reason.
       COUNT(*) FILTER (
         WHERE replayed_at IS NULL AND status = 'approved'
       )::int AS held_unperformable,
       COUNT(*) FILTER (
         WHERE replayed_at IS NULL AND status = 'approved' AND action IN (:replayable)
       )::int AS held_replayable_but_unusable
     FROM approval_requests`,
    { type: QueryTypes.SELECT, replacements: { replayable: REPLAYABLE } },
  )) as Totals[];
  return row;
}

async function readDrift(): Promise<DriftRow[]> {
  return (await sequelize.query(
    `SELECT
       action,
       status,
       COUNT(*)::int AS row_count,
       COUNT(DISTINCT ticket_id)::int AS tickets,
       COUNT(DISTINCT decided_by)::int AS deciders,
       COUNT(*) FILTER (WHERE prepared_action IS NOT NULL)::int AS with_payload,
       MIN(created_at)::text AS first_seen,
       MAX(created_at)::text AS last_seen
     FROM approval_requests
     WHERE replayed_at IS NOT NULL
       AND action NOT IN (:replayable)
     GROUP BY action, status
     ORDER BY row_count DESC, action ASC`,
    { type: QueryTypes.SELECT, replacements: { replayable: REPLAYABLE } },
  )) as DriftRow[];
}

async function readDeciders(): Promise<Array<{ decided_by: string | null; row_count: number }>> {
  return (await sequelize.query(
    `SELECT COALESCE(decided_by, '(null)') AS decided_by, COUNT(*)::int AS row_count
     FROM approval_requests
     WHERE replayed_at IS NOT NULL AND action NOT IN (:replayable)
     GROUP BY 1 ORDER BY 2 DESC`,
    { type: QueryTypes.SELECT, replacements: { replayable: REPLAYABLE } },
  )) as Array<{ decided_by: string | null; row_count: number }>;
}

/**
 * THE RECORD CORRECTION — what to change, and the argument for changing anything.
 *
 * AGAINST mutating historical rows at all. ApprovalRequest.ts calls this table
 * "a durable, append-mostly record of one authorization decision". A governance
 * ledger you edit is not a governance ledger, and the 106 rows are now evidence
 * in an incident. There is a real case for leaving every one of them exactly as
 * it sits and carrying the correction in a separate record.
 *
 * FOR, within one narrow line. "Append-mostly" is not "append-only", and this
 * table's own design has a lifecycle column: `status` moves shadow_logged →
 * pending → approved/rejected/expired, and approveApprovalRequest() rewrites it
 * on every single approval. One more terminal transition is therefore INSIDE the
 * table's existing contract. `replayed_at`, by contrast, is documented in the
 * model as "set exactly once" — a write-once column. So the line is:
 *
 *     correct the lifecycle column; never touch the write-once column.
 *
 * That is also why this script does NOT propose `replayed_at = NULL`, which looks
 * like the tidier fix and is the more dangerous one. Clearing it would re-open all
 * 106 rows as claimable, which is inert today (nothing re-sweeps an approved row)
 * but arms every one of them to fire the moment any handler for those five action
 * types lands. Making the record honest must not load the gun. Leaving
 * `replayed_at` stamped keeps them un-replayable by construction.
 *
 * WHICH STATUS VALUE. ApprovalStatus is 'shadow_logged' | 'pending' | 'approved' |
 * 'rejected' | 'expired' and has no value for "approved, then dropped, never
 * performed". Of the five:
 *   - 'rejected' is a lie — nobody rejected these.
 *   - 'expired' is the closest existing value and still false: these did not lapse
 *     undecided, they were decided (by a timer) and then dropped. It also reads as
 *     "the window closed", which hides that an approval was issued.
 *   - leaving 'approved' is the status quo, which is the lie this script exists
 *     to surface.
 * So the recommendation is to ADD 'abandoned' to ApprovalStatus rather than
 * misuse an existing value. It costs no migration: `status` is VARCHAR(20) with
 * no CHECK constraint (verified in ensureApprovalRequestsSchema.ts and against
 * the production catalog — pg_constraint has no contype='c' row for this table),
 * so 'abandoned' is already storable and only the TypeScript union needs the
 * value. That type lives in backend/src/models/ApprovalRequest.ts and is NOT
 * this change's to edit, which is the second reason the write is not implemented
 * here: the prerequisite does not exist yet.
 *
 * Note what survives either way: `decided_by`, `decided_at` and `decision_channel`
 * are untouched, so the most damning fact in the incident — that a timer approved
 * 106 student-facing R3 actions and no human ever decided one — stays on the row.
 */
function printProposedCorrection(drift: DriftRow[]): void {
  const approved = drift.filter((d) => d.status === 'approved');
  const other = drift.filter((d) => d.status !== 'approved');
  const affected = approved.reduce((n, d) => n + d.row_count, 0);

  console.log('=== PROPOSED RECORD CORRECTION (NOT RUN — printed only) ===');
  console.log('Prerequisite: add \'abandoned\' to ApprovalStatus in backend/src/models/ApprovalRequest.ts.');
  console.log('No schema migration needed: status is VARCHAR(20) with no CHECK constraint.');
  console.log(`Scope: ${affected} row(s) currently status='approved'. replayed_at is NOT touched (write-once).`);
  console.log("Re-runnable: an already-abandoned row no longer matches status='approved', so a second run is a no-op.");
  console.log('');
  console.log('  BEGIN;');
  console.log('  -- expect the row count below to equal the scope line above before COMMIT');
  console.log('  UPDATE approval_requests');
  console.log("     SET status = 'abandoned'");
  console.log('   WHERE replayed_at IS NOT NULL');
  console.log(`     AND action NOT IN (${REPLAYABLE.map((a) => `'${a}'`).join(', ')})`);
  console.log("     AND status = 'approved';");
  console.log('  COMMIT;');
  console.log('');

  if (other.length > 0) {
    console.log('REPORTED BUT NOT PROPOSED FOR UPDATE — a drifted row in a non-approved status is a');
    console.log('different defect (claimed without ever being approved) and needs its own look:');
    for (const d of other) {
      console.log(`  ${d.action.padEnd(32)} status=${d.status.padEnd(14)} ${d.row_count} row(s)`);
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--apply')) {
    // Refused rather than silently ignored, so an operator who reaches for it
    // learns why instead of wondering whether the flag was typed correctly.
    console.error('--apply is not implemented, on purpose. Two reasons:');
    console.error("  1. ApprovalStatus has no 'abandoned' value yet (see the SQL this script prints).");
    console.error('  2. Editing a governance ledger should be a deliberate, reviewed act by an');
    console.error('     operator running the printed SQL inside a transaction, not a script flag.');
    process.exit(2);
  }

  const totals = await readTotals();
  const drift = await readDrift();
  const deciders = await readDeciders();

  console.log('=== APPROVAL REPLAY DRIFT REPORT ===');
  console.log(`replayable actions      : ${REPLAYABLE.join(', ') || '(none)'}`);
  console.log(`rows never claimed      : ${totals.unclaimed_total}`);
  console.log(`rows stamped replayed_at: ${totals.replayed_total}`);
  console.log(`  of those, replayable  : ${totals.replayed_replayable}   <- legitimately performed`);
  console.log(`  of those, DRIFT       : ${totals.replayed_drift}   <- claimed and dropped, recorded as done`);
  console.log('approved, unclaimed,');
  console.log(`  still unperformable   : ${totals.held_unperformable}   <- honestly held: approved, never performed`);
  console.log(`  of those, BAD PAYLOAD : ${totals.held_replayable_but_unusable}   <- action IS replayable; the prepared_action was unusable`);
  console.log('');

  if (totals.replayed_drift === 0) {
    console.log('No drift: every claimed row is of an action the replay service can perform.');
    if (totals.held_replayable_but_unusable > 0) {
      console.log('');
      console.log(`${totals.held_replayable_but_unusable} approved row(s) carry a REPLAYABLE action with an unusable prepared_action.`);
      console.log('That is not a policy question, it is a producer bug: something wrote an approval request');
      console.log('whose payload cannot be acted on. Find the writer, not the replay service.');
      process.exit(1);
    }
    if (totals.held_unperformable > 0) {
      console.log('');
      console.log(`But ${totals.held_unperformable} approved row(s) are held with no handler to perform them. The record is`);
      console.log('honest and nothing is lost silently — the open question is the policy one: these were');
      console.log('approved by a timer, so deciding to perform them is deciding that a timeout counts as');
      console.log('a human in the loop. Not a decision this script can make.');
      process.exit(1);
    }
    process.exit(0);
  }

  console.log('drift by action (rows / distinct tickets / distinct deciders / with payload):');
  for (const d of drift) {
    console.log(
      `  ${d.action.padEnd(32)} status=${d.status.padEnd(12)} ${String(d.row_count).padStart(4)} rows  ` +
        `${String(d.tickets).padStart(3)} tickets  ${String(d.deciders).padStart(2)} deciders  ` +
        `${String(d.with_payload).padStart(4)} with payload  ${d.first_seen.slice(0, 10)} .. ${d.last_seen.slice(0, 10)}`,
    );
  }
  console.log('');
  console.log('who decided the dropped rows:');
  for (const d of deciders) {
    console.log(`  ${String(d.decided_by).padEnd(34)} ${String(d.row_count).padStart(4)} rows`);
  }
  console.log('');
  console.log('A deciders count of 1 on a system: value means no human ever decided one of these.');
  console.log('A non-zero "with payload" count means the work was fully prepared, then discarded.');
  console.log('');

  printProposedCorrection(drift);
  // Non-zero: drift is a defect in the record, and a report that exits 0 on a
  // defect is a report that gets ignored by whatever runs it.
  process.exit(1);
}

// Guarded, never on import. 81 scripts in this folder do this, and the nearest sibling
// (auditAgentRegistryStatus.ts) spells out why: an unconditional main() means importing the
// module runs its queries against the configured DATABASE_URL and then calls process.exit(),
// which kills the jest worker. So an unguarded script cannot be tested at all - and this one
// exists to break a silence, which makes "untestable" the wrong property for it to have.
if (require.main === module) {
  main().catch((e) => {
    console.error('audit failed:', e);
    process.exit(1);
  });
}

export { main, readTotals };
