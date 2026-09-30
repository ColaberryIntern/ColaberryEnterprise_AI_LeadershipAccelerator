import { sequelize } from '../config/database';

/**
 * story_truth_enrichments - every enrichment event a story's repo produced,
 * what the merge did with it, and the key that makes a replay a no-op.
 * Additive only: one new table and two indexes.
 *
 * THE UNIQUE INDEX IS THE IDEMPOTENCY KEY. The key is a hash of the event's
 * content (see storyEnrichmentContract.enrichmentIdempotencyKey), so the same
 * file pushed twice, or the same webhook delivery retried, inserts once. The
 * merge itself is content-idempotent as well, so a race between two
 * deliveries costs at most one redundant merge that changes nothing; the
 * ledger row is still written exactly once.
 *
 * REFUSED AND EMPTY EVENTS ARE ROWS TOO. "The story wrote a file that changed
 * nothing" and "the story wrote a file the contract refused" are facts about
 * that story, and the only way to see the protocol working (or not) across a
 * cohort is to have kept them.
 *
 * `event` holds the parsed file, including the demonstration evidence and
 * measurement events the merge does not turn into truth. They are kept here
 * for the day approved measurement definitions exist, rather than dropped.
 */
export async function ensureStoryEnrichmentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS story_truth_enrichments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL REFERENCES projects(id),
       story_id VARCHAR(16) NOT NULL,
       idempotency_key VARCHAR(64) NOT NULL,
       source_commit_sha VARCHAR(40),
       base_revision INTEGER NOT NULL DEFAULT 0,
       merged_revision INTEGER,
       outcome VARCHAR(24) NOT NULL,
       counts JSONB NOT NULL DEFAULT '{}'::jsonb,
       refused JSONB NOT NULL DEFAULT '[]'::jsonb,
       event JSONB NOT NULL,
       correlation_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_story_truth_enrichments_key
       ON story_truth_enrichments (idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_story_truth_enrichments_project
       ON story_truth_enrichments (project_id, created_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] story_truth_enrichments schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Story enrichment schema ensured');
}
