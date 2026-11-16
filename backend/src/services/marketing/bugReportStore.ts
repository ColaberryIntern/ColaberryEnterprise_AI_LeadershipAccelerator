import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureBugReportSchema } from '../../db/ensureBugReportSchema';

/**
 * BUG-5: write the report down BEFORE trying to send it, so a failed send loses nothing.
 *
 * THE ORDER IS THE WHOLE POINT. Today the route validates, renders and sends; the email is both
 * the transport and the only storage, so any transport failure is permanent data loss. Here the
 * row lands first, the send happens, and the outcome is recorded against the row. A report that
 * never left can then be read or replayed.
 *
 * PERSISTENCE IS BEST-EFFORT AND NEVER BLOCKS THE SEND. If the insert fails, we log loudly and
 * still try to deliver. Making the write fatal would mean a database blip stops bug reports
 * entirely, which is worse than today rather than better - the point is to add a safety net under
 * the send, not a second way for it to fail.
 */

export interface BugReportInput {
  summary: string;
  whatHappened: string;
  whatExpected?: string;
  stepsToReproduce?: string;
  pageUrl: string;
  routePath: string;
  brandLabel?: string | null;
  reportedAtCentral: string;
  browser: string;
  viewport: string;
  errors?: unknown[];
  failedRequests?: unknown[];
  hasScreenshot: boolean;
  reporterEmail: string;
  recipients: string[];
}

type Query = (sql: string, replacements?: Record<string, unknown>) => Promise<unknown[]>;

const defaultQuery: Query = (sql, replacements) => sequelize.query(sql, {
  replacements, type: QueryTypes.SELECT,
}) as Promise<unknown[]>;

export interface StoreDeps {
  query?: Query;
  ensure?: () => Promise<void>;
  log?: (line: string) => void;
}

/**
 * Read an `id` out of a returned row.
 *
 * This database hands SELECT rows back as ARRAYS in some cases and objects in others - observed
 * directly on production while reconciling the ad-spend ledger. Reading `row.id` alone therefore
 * silently yields undefined some of the time, which here would look like "the insert did nothing".
 */
function readId(rows: unknown[]): string | null {
  const row = rows[0];
  if (!row) return null;
  if (Array.isArray(row)) return row[0] == null ? null : String(row[0]);
  const v = (row as Record<string, unknown>).id;
  return v == null ? null : String(v);
}

function emit(log: ((line: string) => void) | undefined, level: string, event: string,
  outcome: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'marketing-bug-report', event, outcome, context,
  });
  if (log) log(line); else if (level === 'error') console.error(line); else console.log(line);
}

/**
 * Insert the report and return its id, or null if it could not be written.
 *
 * IDEMPOTENT WITHIN A FIVE MINUTE WINDOW. A double-submit - an impatient second click, a retried
 * request - must not create two rows describing one problem. The insert refuses when the same
 * reporter has already filed the same summary and body in the last five minutes, and the existing
 * id is returned instead, so the caller still has a row to record the outcome against. The window
 * is short on purpose: the same person hitting the same bug again an hour later is a real second
 * report and should be recorded as one.
 */
export async function recordBugReport(input: BugReportInput, deps: StoreDeps = {}): Promise<string | null> {
  const query = deps.query ?? defaultQuery;
  const ensure = deps.ensure ?? ensureBugReportSchema;
  try {
    await ensure();
    const replacements = {
      summary: input.summary,
      whatHappened: input.whatHappened,
      whatExpected: input.whatExpected ?? null,
      stepsToReproduce: input.stepsToReproduce ?? null,
      pageUrl: input.pageUrl,
      routePath: input.routePath,
      brandLabel: input.brandLabel ?? null,
      reportedAtCentral: input.reportedAtCentral,
      browser: input.browser,
      viewport: input.viewport,
      errors: JSON.stringify(input.errors ?? []),
      failedRequests: JSON.stringify(input.failedRequests ?? []),
      hasScreenshot: input.hasScreenshot,
      reporterEmail: input.reporterEmail,
      // As JSON rather than a bound array: sequelize renders an empty array as `ARRAY[]`,
      // which is a Postgres syntax error. Going through jsonb_array_elements_text yields a
      // proper empty text[] instead of blowing up on the one input nobody tests.
      recipientsJson: JSON.stringify(input.recipients ?? []),
    };

    const inserted = await query(
      `INSERT INTO marketing_bug_reports (
         summary, what_happened, what_expected, steps_to_reproduce, page_url, route_path,
         brand_label, reported_at_central, browser, viewport, errors, failed_requests,
         has_screenshot, reporter_email, recipients
       )
       SELECT :summary, :whatHappened, :whatExpected, :stepsToReproduce, :pageUrl, :routePath,
              :brandLabel, :reportedAtCentral, :browser, :viewport,
              CAST(:errors AS jsonb), CAST(:failedRequests AS jsonb),
              :hasScreenshot, :reporterEmail,
              ARRAY(SELECT jsonb_array_elements_text(CAST(:recipientsJson AS jsonb)))
       WHERE NOT EXISTS (
         SELECT 1 FROM marketing_bug_reports
          WHERE reporter_email = :reporterEmail
            AND summary = :summary
            AND what_happened = :whatHappened
            AND created_at > NOW() - INTERVAL '5 minutes'
       )
       RETURNING id`,
      replacements,
    );

    const id = readId(inserted);
    if (id) return id;

    // Nothing inserted: a duplicate inside the window. Return the row it collided with, so the
    // caller still records the delivery outcome somewhere rather than losing it.
    const existing = await query(
      `SELECT id FROM marketing_bug_reports
        WHERE reporter_email = :reporterEmail AND summary = :summary AND what_happened = :whatHappened
          AND created_at > NOW() - INTERVAL '5 minutes'
        ORDER BY created_at DESC LIMIT 1`,
      replacements,
    );
    const existingId = readId(existing);
    emit(deps.log, 'info', 'bug_report_duplicate_suppressed', 'success',
      { route: input.routePath, matched_existing: Boolean(existingId) });
    return existingId;
  } catch (err) {
    // Loud, and then out of the way: the send must still be attempted.
    emit(deps.log, 'error', 'bug_report_persist_failed', 'failure', {
      route: input.routePath,
      error_class: 'BugReportPersistFailed',
      message: String((err as Error)?.message ?? err).slice(0, 300),
    });
    return null;
  }
}

/** Mark a stored report delivered. A no-op when the row was never written. */
export async function markBugReportDelivered(id: string | null, deps: StoreDeps = {}): Promise<void> {
  if (!id) return;
  const query = deps.query ?? defaultQuery;
  try {
    await query(
      `UPDATE marketing_bug_reports
          SET delivery_status = 'delivered', delivery_detail = NULL, settled_at = NOW()
        WHERE id = CAST(:id AS uuid)`,
      { id },
    );
  } catch (err) {
    emit(deps.log, 'error', 'bug_report_outcome_write_failed', 'failure',
      { id, message: String((err as Error)?.message ?? err).slice(0, 300) });
  }
}

/**
 * Mark a stored report failed, keeping the screenshot so the report can be replayed.
 *
 * The screenshot is stored HERE and not at insert time: on a successful send the bytes are
 * already in the delivered email, and on a failure they are the difference between a report that
 * can be retried and one that cannot.
 */
export async function markBugReportFailed(
  id: string | null,
  reason: string,
  screenshot?: { buffer: Buffer; filename: string } | null,
  deps: StoreDeps = {},
): Promise<void> {
  if (!id) return;
  const query = deps.query ?? defaultQuery;
  try {
    await query(
      `UPDATE marketing_bug_reports
          SET delivery_status = 'failed',
              delivery_detail = :reason,
              settled_at = NOW(),
              screenshot = COALESCE(:screenshot, screenshot),
              screenshot_filename = COALESCE(:filename, screenshot_filename)
        WHERE id = CAST(:id AS uuid)`,
      {
        id,
        reason: String(reason ?? '').slice(0, 1000),
        screenshot: screenshot?.buffer ?? null,
        filename: screenshot?.filename ?? null,
      },
    );
  } catch (err) {
    emit(deps.log, 'error', 'bug_report_outcome_write_failed', 'failure',
      { id, message: String((err as Error)?.message ?? err).slice(0, 300) });
  }
}
