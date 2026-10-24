import { sequelize } from '../config/database';

/**
 * ensureAccountArtifactLinkSchema — C8.5, one link table and nothing else.
 *
 * THE TABLE HOLDS NO ARTIFACT. The artifact stays in its canonical home, which for this
 * initiative is a single upload in the Basecamp vault under the C0.3 standard. A row here
 * carries only a POINTER plus the account-specific metadata: which account, what kind of
 * document, and who linked it. The named failure mode on C8.5 is "copying artifacts into
 * the app and creating a second canonical location", so there is deliberately no column
 * on this table that could hold a document, and `__tests__` asserts that structurally
 * rather than trusting the next person to notice.
 *
 * The pattern is copied from `models/CertEvidenceMapping.ts`, which solved the same
 * problem for certification evidence and says it in its own header: "THIS TABLE HOLDS NO
 * ARTIFACT... Copying artifacts in here would create a second source of truth that
 * silently rots the moment the original changes."
 *
 * WHY A TABLE RATHER THAN `organizations.attributes`
 * ---------------------------------------------------
 * C6.1 says to default strongly to reuse, and C8.3 already put a nullable JSONB
 * `attributes` column on `organizations`, so a list of links could live there with no DDL
 * at all. That was the first design and it was rejected for one reason:
 *
 *   C8.5's success metric is "nobody re-sends a document an account already has."
 *
 * That is a uniqueness guarantee, and a JSONB array cannot provide one. Appending to it
 * is read-modify-write, so two people linking at the same moment silently lose a row, and
 * nothing stops the same document being added twice. A unique index gives the guarantee
 * directly and makes the link operation idempotent, which this repo treats as
 * non-negotiable rather than as a nicety. Per-link rows also mean an unlink is a delete
 * rather than a rewrite of the whole column.
 *
 * Everything else about the account still lives on `organizations`, so this adds a
 * relationship table, not a second account universe.
 */

/** The one new table. Named so the test can assert there is exactly one. */
export const NEW_TABLES: ReadonlyArray<string> = ['account_artifact_links'];

/**
 * The document kinds C8.5 names. Deliberately a plain VARCHAR with this list enforced in
 * the service rather than a Postgres enum: the set will grow as the motion runs, and an
 * enum makes that a migration instead of a one-line change.
 */
export const ARTIFACT_KINDS = [
  'deck', 'research', 'account_brief', 'proposal',
  'contract', 'pilot_outcome', 'case_study',
] as const;

/** Where the canonical copy lives. Unconstrained on purpose, per CertEvidenceMapping. */
export const SOURCE_TYPES = ['basecamp_vault', 'repo', 'external'] as const;

/**
 * Column names that would mean the artifact had been copied in rather than pointed at.
 * The test refuses any of these, so "links only" survives the next edit.
 */
export const FORBIDDEN_CONTENT_COLUMNS: ReadonlyArray<string> = [
  'content', 'body', 'blob', 'bytes', 'file_data', 'payload',
  'base64', 'document', 'attachment', 'binary', 'raw',
];

export function accountArtifactLinkStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS account_artifact_links (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       organization_id UUID NOT NULL,
       artifact_kind VARCHAR(40) NOT NULL,
       title VARCHAR(300) NOT NULL,
       canonical_url TEXT NOT NULL,
       source_type VARCHAR(40) NOT NULL DEFAULT 'basecamp_vault',
       source_id VARCHAR(64),
       linked_by_identity_id VARCHAR(255),
       notes TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // THE "nobody re-sends a document an account already has" GUARANTEE, and the reason
    // this is a table rather than a JSONB array. The service normalizes the URL before
    // insert so a trailing slash cannot defeat it.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_account_artifact_links_account_url
       ON account_artifact_links (organization_id, canonical_url)`,
    `CREATE INDEX IF NOT EXISTS idx_account_artifact_links_account
       ON account_artifact_links (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_account_artifact_links_kind
       ON account_artifact_links (artifact_kind)`,
    // Deleting an account must not strand its links. Dropped-then-added so the pair is
    // re-runnable; the house idiom from ensureStrategicAccountSchema.
    `ALTER TABLE account_artifact_links DROP CONSTRAINT IF EXISTS fk_account_artifact_links_org`,
    `ALTER TABLE account_artifact_links
       ADD CONSTRAINT fk_account_artifact_links_org
       FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE`,
  ];
}

export async function ensureAccountArtifactLinkSchema(): Promise<void> {
  for (const sql of accountArtifactLinkStatements()) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Self-healing by design: every statement is independently idempotent, and a
      // failure here must never stop the server coming up over a link table.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({
        level: 'warn',
        service: 'backend',
        event: 'ensure_account_artifact_link_schema_statement_failed',
        outcome: 'partial',
        error_class: 'SchemaEnsureWarning',
        context: { statement: sql.slice(0, 80), message },
      }));
    }
  }
}
