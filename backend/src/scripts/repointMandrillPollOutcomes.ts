/**
 * Repoint historical Mandrill-poll outcomes to the email Mandrill actually saw.
 *
 * Companion to services/mandrillEngagementPoll.ts. That module fixes the poll
 * going forward; this fills in history. The poll used to pin every open and
 * click to "the most recent sent email to this lead" and store the real
 * subject in `metadata.subject`. So the truth is on every row already — the
 * FK is the guess — and the correction is mechanical:
 *
 *   recorded subject matches a SENT email of this lead  -> repoint the FK to it
 *   recorded subject matches nothing we sent            -> detach (FK -> NULL)
 *
 * Measured on production 2026-09-11 before writing this: 11,243 poll rows,
 * 4,467 on an email whose subject disagrees — 2,066 repointable, 2,401 to
 * detach (portal-access links, class reminders, school-system mail sharing the
 * Mandrill account).
 *
 * IDEMPOTENT: only rows where the pinned email's subject disagrees with the
 * recorded one are candidates, and every row this touches gets
 * `metadata.repointed_at`, which excludes it from the candidate set. Re-running
 * after completion updates 0 rows. The previous FK is kept in
 * `metadata.previous_scheduled_email_id` so the change is reversible.
 *
 * BATCHED: this runs against the Postgres that serves the live app. Each batch
 * is its own statement over a bounded id set with a pause between, so the job
 * can be killed at any point and resumed without loss.
 *
 * DRY-RUN BY DEFAULT. Nothing is written without `--apply`.
 *
 * Usage (inside the backend container):
 *   node dist/scripts/repointMandrillPollOutcomes.js               # counts only
 *   node dist/scripts/repointMandrillPollOutcomes.js --apply
 *   node dist/scripts/repointMandrillPollOutcomes.js --apply --batch-size 200 --max-batches 5
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export interface RepointOptions {
  apply: boolean;
  batchSize: number;
  maxBatches: number;
  pauseMs: number;
}

export interface RepointResult {
  candidatesBefore: { repointable: number; detachable: number };
  repointed: number;
  detached: number;
  batches: number;
  remaining: { repointable: number; detachable: number };
  stoppedBecause: 'complete' | 'max_batches' | 'dry_run' | 'stalled';
}

export const DEFAULTS: RepointOptions = { apply: false, batchSize: 500, maxBatches: 200, pauseMs: 300 };

/**
 * Candidate rows: from the poll, still pinned, subject recorded, and the pinned
 * email's subject disagrees. `repointed_at` absent so a corrected row is never
 * a candidate again.
 */
const CANDIDATE_FROM = `
  FROM interaction_outcomes io
  JOIN scheduled_emails se ON se.id = io.scheduled_email_id
  WHERE io.metadata->>'source' = 'mandrill_poll'
    AND io.metadata->>'repointed_at' IS NULL
    AND btrim(coalesce(io.metadata->>'subject', '')) <> ''
    AND lower(btrim(io.metadata->>'subject')) <> lower(btrim(se.subject))`;

/** The sent email the recorded subject describes, newest first. Same rule as the poll. */
const MATCH_EXISTS = `
  EXISTS (
    SELECT 1 FROM scheduled_emails s2
    WHERE s2.lead_id = io.lead_id AND s2.status = 'sent'
      AND lower(btrim(s2.subject)) = lower(btrim(io.metadata->>'subject'))
  )`;

const COUNT_SQL = `
  SELECT
    count(*) FILTER (WHERE ${MATCH_EXISTS})::int AS repointable,
    count(*) FILTER (WHERE NOT ${MATCH_EXISTS})::int AS detachable
  ${CANDIDATE_FROM}`;

/** Repoint one batch to the newest sent email carrying the recorded subject. */
const REPOINT_SQL = `
  WITH batch AS (
    SELECT io.id
    ${CANDIDATE_FROM}
      AND ${MATCH_EXISTS}
    LIMIT :batchSize
  ),
  target AS (
    SELECT b.id AS outcome_id, s2.id AS sent_id, s2.campaign_id, s2.step_index
    FROM batch b
    JOIN interaction_outcomes io ON io.id = b.id
    JOIN LATERAL (
      SELECT s.id, s.campaign_id, s.step_index
      FROM scheduled_emails s
      WHERE s.lead_id = io.lead_id AND s.status = 'sent'
        AND lower(btrim(s.subject)) = lower(btrim(io.metadata->>'subject'))
      ORDER BY s.sent_at DESC NULLS LAST
      LIMIT 1
    ) s2 ON true
  )
  UPDATE interaction_outcomes io
  SET scheduled_email_id = t.sent_id,
      campaign_id = t.campaign_id,
      step_index = coalesce(t.step_index, 0),
      metadata = coalesce(io.metadata, '{}'::jsonb) || jsonb_build_object(
        'attribution', 'subject_match',
        'repointed_at', :now::text,
        'previous_scheduled_email_id', io.scheduled_email_id::text,
        'previous_campaign_id', io.campaign_id::text
      )
  FROM target t
  WHERE io.id = t.outcome_id`;

/** Detach one batch: nothing we sent carries this subject. */
const DETACH_SQL = `
  WITH batch AS (
    SELECT io.id
    ${CANDIDATE_FROM}
      AND NOT ${MATCH_EXISTS}
    LIMIT :batchSize
  )
  UPDATE interaction_outcomes io
  SET scheduled_email_id = NULL,
      campaign_id = NULL,
      step_index = 0,
      metadata = coalesce(io.metadata, '{}'::jsonb) || jsonb_build_object(
        'attribution', 'no_matching_send',
        'repointed_at', :now::text,
        'previous_scheduled_email_id', io.scheduled_email_id::text,
        'previous_campaign_id', io.campaign_id::text
      )
  FROM batch b
  WHERE io.id = b.id`;

export function parseArgs(argv: string[]): RepointOptions {
  const opts = { ...DEFAULTS };
  opts.apply = argv.includes('--apply');
  const num = (flag: string, current: number, min: number): number => {
    const i = argv.indexOf(flag);
    if (i === -1 || i + 1 >= argv.length) return current;
    const n = Number(argv[i + 1]);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : current;
  };
  // 0 batches or a 0-row batch would disable the work or the backstop; 0ms pause is legitimate.
  opts.batchSize = num('--batch-size', opts.batchSize, 1);
  opts.maxBatches = num('--max-batches', opts.maxBatches, 1);
  opts.pauseMs = num('--pause-ms', opts.pauseMs, 0);
  return opts;
}

async function countCandidates(): Promise<{ repointable: number; detachable: number }> {
  const [row] = await sequelize.query<{ repointable: number; detachable: number }>(COUNT_SQL, { type: QueryTypes.SELECT });
  return { repointable: row?.repointable ?? 0, detachable: row?.detachable ?? 0 };
}

/** Rows affected by an UPDATE, as pg reports it through Sequelize. */
function affected(result: unknown): number {
  if (Array.isArray(result)) {
    const meta = result[1] as { rowCount?: number } | number | undefined;
    if (typeof meta === 'number') return meta;
    if (meta && typeof meta.rowCount === 'number') return meta.rowCount;
  }
  return 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function run(opts: RepointOptions, log: Pick<Console, 'log'> = console): Promise<RepointResult> {
  const candidatesBefore = await countCandidates();
  log.log(JSON.stringify({ event: 'repoint_start', apply: opts.apply, candidates: candidatesBefore, batchSize: opts.batchSize }));

  const result: RepointResult = {
    candidatesBefore, repointed: 0, detached: 0, batches: 0,
    remaining: candidatesBefore, stoppedBecause: 'dry_run',
  };
  if (!opts.apply) return result;

  for (const [label, sql] of [['repointed', REPOINT_SQL], ['detached', DETACH_SQL]] as const) {
    while (result.batches < opts.maxBatches) {
      const n = affected(await sequelize.query(sql, {
        replacements: { batchSize: opts.batchSize, now: new Date().toISOString() },
      }));
      result.batches++;
      result[label] += n;
      log.log(JSON.stringify({ event: 'repoint_batch', kind: label, batch: result.batches, rows: n }));
      // A batch smaller than asked for is the last one. Every touched row
      // leaves the candidate set, so a full batch is always progress.
      if (n < opts.batchSize) break;
      if (opts.pauseMs) await sleep(opts.pauseMs);
    }
  }

  result.remaining = await countCandidates();
  const nothingLeft = result.remaining.repointable === 0 && result.remaining.detachable === 0;
  result.stoppedBecause = nothingLeft ? 'complete' : result.batches >= opts.maxBatches ? 'max_batches' : 'stalled';
  log.log(JSON.stringify({ event: 'repoint_done', ...result }));
  return result;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2)))
    .then((r) => { process.exitCode = r.stoppedBecause === 'stalled' ? 2 : 0; })
    .catch((err: Error) => {
      console.error(JSON.stringify({ event: 'repoint_failed', error_class: err.name, message: err.message }));
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
