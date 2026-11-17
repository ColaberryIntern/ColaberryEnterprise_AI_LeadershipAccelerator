import { sequelize } from '../config/database';

/**
 * R18 — `enrollments.lead_id`: the one missing edge in the attribution chain.
 *
 * Ensured with idempotent raw SQL rather than `sequelize.sync({ alter: true })`, matching every
 * other `ensure*Schema` module (see ensureLiveSessionSchema.ts for why prod never alter-syncs).
 * ADDITIVE ONLY: `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, nothing NOT NULL,
 * no default, no backfill. Every existing row reads NULL, which means "not linked yet".
 *
 * ── WHAT WAS ACTUALLY BROKEN ─────────────────────────────────────────────────────────
 *
 * The acquisition chain was complete on the marketing side and complete on the revenue side,
 * and the two never touched:
 *
 *   visitor_sessions -> visitors.lead_id -> leads -> ??? -> enrollments -> subscriptions
 *
 * `visitor_sessions` carries utm_source/campaign/content/term plus fbclid/gclid/msclkid/ttclid
 * (ensureMarketingAttributionSchema). `utmBackfill` copies those tags onto `leads`
 * (ensureLeadAttributionColumns). `campaignAttributionService` runs four attribution models over
 * them. And then revenue sat on the far side of a gap: `enrollments` carried no `lead_id` and no
 * UTM columns at all — only `referral_channel`, a free-text VARCHAR(50).
 *
 * So the question "which campaign produced the members who pay us" had no join path. Measured
 * against production on 2026-11-17: all 26 paying members were attributable only by lowercasing
 * their email and matching it against `leads` by hand, which is what every previous audit did.
 *
 * ── WHY A SNAPSHOT OF THE UTM TAGS IS *NOT* COPIED HERE ──────────────────────────────
 *
 * The obvious-looking design is to denormalize utm_source/campaign/medium/content/term onto
 * `enrollments` too, so revenue attribution is stable at the moment of purchase. That was the
 * first draft of this file, and reading `utmBackfill.ts` killed it: `utmBackfillUpdates` never
 * overwrites a tag already present on the lead ("a tag already on the lead is never overwritten
 * ... that is also what makes this safe to run twice"). The lead's tags are therefore write-once,
 * so joining through `lead_id` yields the same values forever, and a snapshot would be five more
 * columns that can only ever disagree with their source. One edge, not six columns.
 *
 * ── WHY NO FOREIGN KEY ───────────────────────────────────────────────────────────────
 *
 * This is a CROSS-DOMAIN reference (revenue -> marketing), not an edge to an immediate parent.
 * ensureMarketingTrackingSchema.ts states the repo's convention in full: the edge to the
 * immediate parent is constrained, and cross-domain references are left bare. `PageEvent.ts:72`
 * says it per-column for this very column name ("No `references` here on purpose" for
 * `lead_id`), and `ensurePageEventLeadId.ts` adds exactly this column, as a bare INTEGER with a
 * partial index, to `page_events`. This file is that file's analogue for `enrollments` and makes
 * the same choices deliberately rather than by copy.
 *
 * INTEGER, not UUID or BIGINT: `leads.id` is `integer` in production, verified 2026-11-17.
 *
 * ── THE INDEX IS PARTIAL ─────────────────────────────────────────────────────────────
 *
 * On the day this lands every row is NULL, and "which enrollment belongs to this lead" never
 * selects a NULL. 100 of the 1,436 enrollment emails in production have no `leads` row at all
 * and never will, so a share of rows stays NULL permanently. Indexing them buys nothing, which
 * is the same reasoning `ensurePageEventLeadId.ts` applies to its second index.
 *
 * ── FAILURE PATH ─────────────────────────────────────────────────────────────────────
 *
 * Each statement is wrapped independently, so a statement that loses a race with another boot or
 * is already satisfied warns and never stops the server coming up. The post-condition check then
 * emits a classified SchemaInvariantViolation if the column is still absent, because the model
 * declares `lead_id` and Sequelize puts every declared attribute in every SELECT — a silently
 * failed ALTER would break every enrollment read in the product, not merely this feature. That
 * blast radius is why this verifies rather than trusting the warning loop, exactly as
 * ensureMarketingAttributionSchema.ts does.
 */
export const ENROLLMENT_LEAD_ID_STATEMENTS: readonly string[] = [
  'ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS lead_id INTEGER',
  `CREATE INDEX IF NOT EXISTS idx_enrollments_lead_id
     ON enrollments (lead_id)
     WHERE lead_id IS NOT NULL`,
];

export interface EnrollmentLeadIdSchemaResult {
  ok: boolean;
  missing: string[];
}

export async function ensureEnrollmentLeadIdSchema(): Promise<EnrollmentLeadIdSchemaResult> {
  for (const sql of ENROLLMENT_LEAD_ID_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'ensure_enrollment_lead_id_statement_failed',
        outcome: 'partial',
        error_class: 'SchemaEnsureWarning',
        context: { statement: sql.slice(0, 80), message: err?.message?.split('\n')[0] },
      }));
    }
  }

  let missing: string[] = [];
  try {
    const [rows]: any = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'enrollments'`,
    );
    const present = new Set((rows || []).map((r: any) => r.column_name));
    missing = ['lead_id'].filter((c) => !present.has(c));
    if (missing.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'SchemaInvariantViolation',
        outcome: 'failure',
        error_class: 'SchemaInvariantViolation',
        context: {
          table: 'enrollments',
          missing_columns: missing,
          impact:
            'the model declares lead_id, so Sequelize emits it in every enrollment SELECT; '
            + 'every enrollment read in the product fails at the database until the column lands',
        },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] enrollment lead_id schema verification failed:', err?.message);
  }

  console.log('[DB] enrollments.lead_id ensured');
  return { ok: missing.length === 0, missing };
}
