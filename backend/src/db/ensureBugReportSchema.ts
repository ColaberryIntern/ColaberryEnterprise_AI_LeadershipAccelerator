import { sequelize } from '../config/database';

/**
 * BUG-5: a bug report that fails to send loses its content, because reports persist nowhere.
 *
 * WHAT THIS COSTS US ALREADY. Sohail filed three reports on 2026-11-11. All three returned 201
 * and logged success; Mandrill discarded all three for having no envelope sender. Because nothing
 * was written down, the content is gone - we cannot read what he reported and we cannot replay the
 * sends. BUG-1 fixed the sender and made the route read the relay result, so that exact failure
 * will not repeat silently. Any OTHER send failure - an outage, a rate limit, a bad recipient
 * setting - still destroys the report. This table is what stops that.
 *
 * SCHEMA CHANGE, APPROVED. BUG-5 recorded that a new table is a schema change and therefore Ali's
 * decision, offering the alternative of accepting the loss and closing the ticket. Ali chose to
 * persist, 2026-11-15. One additive table, created lazily and memoized like
 * ensureColaberryTvSchema (server.ts is over the 500-line ceiling). IF NOT EXISTS throughout, no
 * DROP or ALTER, so rolling the feature back leaves the table unused and harmless.
 *
 * WHAT IS DELIBERATELY NOT STORED. The screenshot is written only when delivery FAILS. On a
 * successful send the bytes are already in the delivered email, so keeping a second copy would
 * duplicate the largest object in the system for no recovery value; on a failure they are the
 * difference between a report that can be retried and one that cannot. The cap is the same 6MB
 * the route enforces, so a row cannot exceed what the endpoint already accepted.
 */
export const BUG_REPORT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS marketing_bug_reports (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     summary TEXT NOT NULL,
     what_happened TEXT NOT NULL,
     what_expected TEXT,
     steps_to_reproduce TEXT,
     page_url TEXT NOT NULL,
     route_path TEXT NOT NULL,
     brand_label TEXT,
     reported_at_central TEXT NOT NULL,
     browser TEXT NOT NULL,
     viewport TEXT NOT NULL,
     errors JSONB NOT NULL DEFAULT '[]'::jsonb,
     failed_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
     has_screenshot BOOLEAN NOT NULL DEFAULT FALSE,
     reporter_email TEXT NOT NULL,
     recipients TEXT[] NOT NULL DEFAULT '{}',
     delivery_status TEXT NOT NULL DEFAULT 'pending'
       CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
     delivery_detail TEXT,
     screenshot BYTEA,
     screenshot_filename TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     settled_at TIMESTAMPTZ
   )`,
  // The two reads this table exists for: "what is still unsent?" and "what did they report?".
  `CREATE INDEX IF NOT EXISTS marketing_bug_reports_status_idx
     ON marketing_bug_reports (delivery_status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS marketing_bug_reports_created_idx
     ON marketing_bug_reports (created_at DESC)`,
];

type Runner = (sql: string, replacements?: Record<string, unknown>) => Promise<unknown>;
const defaultRunner: Runner = (sql, replacements) => sequelize.query(sql, replacements ? { replacements } : undefined);

let inflight: Promise<void> | null = null;

export function ensureBugReportSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => {
      for (const s of BUG_REPORT_STATEMENTS) await run(s);
    })().catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetBugReportSchemaForTests(): void { inflight = null; }
