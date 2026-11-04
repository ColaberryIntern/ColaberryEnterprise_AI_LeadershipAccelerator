import { sequelize } from '../config/database';

/**
 * ensureEvidenceLinkSchema — R3, the evidence spine. One join table and nothing else.
 *
 * WHAT IT IS FOR. Ali's ask for the Revenue Room: "Everything should pull in the documents
 * that have been created in route to this KPI card or hypothesis of revenue." Every surface
 * above this reads one table, so a Basecamp todo, an email thread, a proposal document, a
 * meeting and a pull request all reach an initiative's timeline through the same join
 * rather than through five bespoke queries. R4 through R9 all depend on it, which is why it
 * is P0 and why it is deliberately boring.
 *
 * THE TABLE HOLDS NO EVIDENCE, ONLY A POINTER TO IT. Copied from
 * `ensureAccountArtifactLinkSchema` and, before that, `models/CertEvidenceMapping.ts`,
 * which says it plainest: copying artifacts in "would create a second source of truth that
 * silently rots the moment the original changes." A Basecamp comment belongs in Basecamp.
 * There is deliberately no column here that could hold a body, and `__tests__` asserts that
 * structurally rather than trusting the next person to notice.
 *
 * ── `observed_at` IS NOT `created_at`, AND THE DIFFERENCE IS THE WHOLE POINT ──────────────
 *
 * `observed_at` is when the evidence HAPPENED. `created_at` is when we noticed and linked
 * it. A timeline built on the second is a history of our own ingestion runs, which is a
 * fact about us rather than about the deal.
 *
 * This is not a theoretical concern on this ladder. The R2 diagnosis on 2026-11-03 reported
 * an explorer-to-paid conversion rate that turned out to be counting backwards: all 13
 * "conversions" had a paid enrollment row created BEFORE their explorer row. Conflating
 * when-recorded with when-happened produced a number that was not merely imprecise but
 * pointed the wrong way down the funnel. So the two timestamps are separate columns here,
 * `observed_at` is NOT NULL, and nothing is allowed to default it to now().
 *
 * ── WHY THE VOCABULARIES GENERATE THEIR OWN CHECK CONSTRAINTS ────────────────────────────
 *
 * The same diagnosis found `revenueOpportunityService` filtering
 * `pipeline_stage IN ('qualified','proposal','negotiation')` when the column's real
 * vocabulary is `new_lead, contacted, enrolled, meeting_scheduled, negotiation,
 * proposal_sent`. Two of the three literals had never been values of that column, so the
 * scan could not match a row no matter how the data moved, and nothing failed loudly enough
 * to say so. 1,100 high-intent leads were invisible to it.
 *
 * That bug is a hardcoded list drifting from the column it describes. Here the CHECK
 * constraints are GENERATED from the exported `as const` arrays below, so the database and
 * the TypeScript union cannot disagree: changing one changes the other, and a test asserts
 * the generated SQL still contains exactly the declared values. This costs a few lines and
 * removes a whole class of silent-mismatch failure.
 *
 * ── WHY THERE IS NO FOREIGN KEY ON `initiative_key` ──────────────────────────────────────
 *
 * Initiatives are heterogeneous by design. A hypothesis key is a string constant from the
 * C0.1 register (`hypothesis_paid_accelerator`); a government bid key is a
 * `delivery_project_id` UUID; a membership key names a product line. A foreign key would
 * force all of them into one table, which would mean inventing an initiative registry table
 * whose only purpose is to satisfy the constraint. `(initiative_type, initiative_key)` is a
 * tagged pointer, exactly as `source_id` is left unconstrained in the sibling link table
 * because the canonical copy lives in the Basecamp vault.
 *
 * The cost is real and worth stating: a typo in an `initiative_key` produces a link to an
 * initiative nobody can see rather than an error. `evidenceLinkService` validates the key
 * against the known initiatives before insert, and that is where the guarantee lives.
 */

/** The one new table. Named so the test can assert there is exactly one. */
export const NEW_TABLES: ReadonlyArray<string> = ['evidence_links'];

/**
 * Where a piece of evidence lives. Each value names a system this repo can already read,
 * so none of these is aspirational:
 *   - `basecamp_todo` / `basecamp_comment` — mirrored by `bcSyncService` into `ops_bc_todos`
 *   - `basecamp_vault` — upload exists in script-land; the backend read is R5's work
 *   - `email_thread` — `inbox_emails`, fed by three live transports
 *   - `gov_proposal_document` / `gov_submission` — the government proposal subsystem
 *   - `interaction_outcome` — the table the commercial funnel already counts
 *   - `calendar_event` — R7
 *   - `pull_request` / `session_log` — what the build itself produces
 */
export const SOURCE_SYSTEMS = [
  'basecamp_todo', 'basecamp_comment', 'basecamp_vault',
  'email_thread', 'gov_proposal_document', 'gov_submission',
  'interaction_outcome', 'calendar_event', 'pull_request', 'session_log',
] as const;

/** The kinds of thing evidence can belong to. Matches the Revenue Room's card kinds. */
export const INITIATIVE_TYPES = [
  'hypothesis', 'gov_bid', 'membership', 'account',
] as const;

/**
 * How the evidence relates to the initiative. Kept deliberately small: a vocabulary nobody
 * can hold in their head gets used inconsistently, and an inconsistent one is worse than a
 * coarse one because it looks precise.
 */
export const RELATIONS = [
  'produced',     // a document or artifact came out of this initiative
  'discussed',    // a conversation about it happened
  'decided',      // a decision was recorded
  'submitted',    // it was sent to the other side
  'met',          // a meeting took place
  'corresponded', // email went back and forth
] as const;

/**
 * Whether a human or a job made the link. This is not bookkeeping: automated re-ingestion
 * must never overturn a human's judgment, and that rule needs to know which is which.
 */
export const LINK_METHODS = ['human', 'automatic'] as const;

/**
 * Column names that would mean the evidence had been copied in rather than pointed at.
 * The test refuses any of these, so "pointers only" survives the next edit.
 */
export const FORBIDDEN_CONTENT_COLUMNS: ReadonlyArray<string> = [
  'content', 'body', 'blob', 'bytes', 'file_data', 'payload',
  'base64', 'document', 'attachment', 'binary', 'raw', 'html',
];

/**
 * Render a vocabulary as a SQL value list.
 *
 * These values are compile-time literals from the arrays above and can never come from a
 * request, which is the only thing that makes interpolation acceptable here. Rather than
 * ask a reviewer to take that on trust, the guard below re-checks each value and throws, so
 * a future edit that pastes in something quoted or spaced fails at boot instead of
 * producing SQL nobody read.
 */
function valueList(values: ReadonlyArray<string>): string {
  for (const v of values) {
    if (!/^[a-z][a-z0-9_]*$/.test(v)) {
      throw new Error(
        `evidence_links vocabulary value ${JSON.stringify(v)} is not a bare identifier. `
        + 'These values are interpolated into DDL, so only [a-z0-9_] is allowed.',
      );
    }
  }
  return values.map((v) => `'${v}'`).join(', ');
}

export function evidenceLinkStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS evidence_links (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

       source_system VARCHAR(40) NOT NULL,
       source_id VARCHAR(255) NOT NULL,
       source_url TEXT,
       title TEXT,

       initiative_type VARCHAR(40) NOT NULL,
       initiative_key VARCHAR(255) NOT NULL,

       relation VARCHAR(40) NOT NULL,

       observed_at TIMESTAMPTZ NOT NULL,

       linked_by VARCHAR(255) NOT NULL,
       link_method VARCHAR(20) NOT NULL,
       confidence NUMERIC(3,2),
       notes TEXT,

       unlinked_at TIMESTAMPTZ,
       unlinked_by VARCHAR(255),
       unlink_reason TEXT,

       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,

    // ── THE IDEMPOTENCY GUARANTEE ────────────────────────────────────────────────────────
    // R5 and R8 are SCHEDULED ingestion. Running a job twice must not double a timeline,
    // and this repo treats that as non-negotiable rather than as a nicety. `relation` is
    // deliberately NOT part of the key: if a classifier changes its mind about how a
    // document relates to an initiative, the right outcome is one row that gets corrected,
    // not two rows that both claim to be the same document.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_links_source_initiative
       ON evidence_links (source_system, source_id, initiative_type, initiative_key)`,

    // The drill-down timeline query: everything for one initiative, newest first. Ordered
    // on observed_at because that is the question a reader is asking ("what happened, and
    // when"), not created_at, which would answer "when did we find out".
    `CREATE INDEX IF NOT EXISTS idx_evidence_links_initiative_observed
       ON evidence_links (initiative_type, initiative_key, observed_at DESC)`,

    // The reverse lookup: "what is this document already linked to?", which is what stops
    // a human linking the same thing twice by hand.
    `CREATE INDEX IF NOT EXISTS idx_evidence_links_source
       ON evidence_links (source_system, source_id)`,

    // Live links only, which is every read the Room performs. A partial index keeps the
    // unlinked rows out of the hot path without deleting the audit trail.
    `CREATE INDEX IF NOT EXISTS idx_evidence_links_live
       ON evidence_links (initiative_type, initiative_key, observed_at DESC)
       WHERE unlinked_at IS NULL`,

    // ── THE VOCABULARY CONSTRAINTS, GENERATED FROM THE EXPORTED ARRAYS ───────────────────
    // Dropped-then-added so the pair is re-runnable; the house idiom from
    // ensureStrategicAccountSchema. Kept as VARCHAR + CHECK rather than a Postgres enum
    // because the sets will grow as the motion runs, and an enum makes that a migration
    // instead of a one-line change.
    `ALTER TABLE evidence_links DROP CONSTRAINT IF EXISTS ck_evidence_links_source_system`,
    `ALTER TABLE evidence_links ADD CONSTRAINT ck_evidence_links_source_system
       CHECK (source_system IN (${valueList(SOURCE_SYSTEMS)}))`,

    `ALTER TABLE evidence_links DROP CONSTRAINT IF EXISTS ck_evidence_links_initiative_type`,
    `ALTER TABLE evidence_links ADD CONSTRAINT ck_evidence_links_initiative_type
       CHECK (initiative_type IN (${valueList(INITIATIVE_TYPES)}))`,

    `ALTER TABLE evidence_links DROP CONSTRAINT IF EXISTS ck_evidence_links_relation`,
    `ALTER TABLE evidence_links ADD CONSTRAINT ck_evidence_links_relation
       CHECK (relation IN (${valueList(RELATIONS)}))`,

    `ALTER TABLE evidence_links DROP CONSTRAINT IF EXISTS ck_evidence_links_link_method`,
    `ALTER TABLE evidence_links ADD CONSTRAINT ck_evidence_links_link_method
       CHECK (link_method IN (${valueList(LINK_METHODS)}))`,

    // A confidence score only means something for a machine-made link, and a human link
    // carrying 0.72 would invite someone to average the two. Enforced here because the
    // alternative is a comment nobody reads.
    `ALTER TABLE evidence_links DROP CONSTRAINT IF EXISTS ck_evidence_links_confidence`,
    `ALTER TABLE evidence_links ADD CONSTRAINT ck_evidence_links_confidence
       CHECK (
         (link_method = 'human' AND confidence IS NULL)
         OR (link_method = 'automatic' AND confidence IS NOT NULL
             AND confidence >= 0 AND confidence <= 1)
       )`,

    // An unlink must say who did it. A row that fell out of the timeline with nobody's name
    // on it is the kind of thing that gets argued about later.
    `ALTER TABLE evidence_links DROP CONSTRAINT IF EXISTS ck_evidence_links_unlink_attributed`,
    `ALTER TABLE evidence_links ADD CONSTRAINT ck_evidence_links_unlink_attributed
       CHECK (unlinked_at IS NULL OR unlinked_by IS NOT NULL)`,
  ];
}

export async function ensureEvidenceLinkSchema(): Promise<void> {
  for (const sql of evidenceLinkStatements()) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Self-healing by design: every statement is independently idempotent, and a failure
      // here must never stop the server coming up over a link table.
      //
      // The consequence is NOT hidden, which matters more for this table than for most.
      // Everything in the Revenue Room reads it, so if the CREATE failed the page must say
      // "not yet measurable" rather than render an empty timeline that looks like a quiet
      // month. `evidenceLinkService` checks the table exists before reading and reports a
      // missing table distinctly from an empty one.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({
        level: 'warn',
        service: 'backend',
        event: 'ensure_evidence_link_schema_statement_failed',
        outcome: 'partial',
        error_class: 'SchemaEnsureWarning',
        context: { statement: sql.slice(0, 80), message },
      }));
    }
  }
}
