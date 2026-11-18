import { sequelize } from '../config/database';

/**
 * Story artifact verifications (phase A2): one row per declared artifact key that the repository
 * verification sync found actually handed over, keyed to the commit it was seen at.
 *
 * ----------------------------------------------------------------------------
 * WHY A NEW TABLE RATHER THAN GENERALIZING `gov_build_artifacts`
 * ----------------------------------------------------------------------------
 * The plan for this phase said to generalize that table. Measured, it does not fit, and
 * changing it would alter a table under the running Proposal Studio:
 *
 *   - it is UNIQUE on (story_id, commit_sha), so it physically cannot hold more than ONE
 *     artifact per story per commit, and a contract routinely declares several;
 *   - its `delivery_project_id` is a NOT NULL FK to `delivery_projects`, and the stories this
 *     phase verifies belong to `projects`, which is a different table;
 *   - it means something else: a screenshot captured from a verified gov build demo, for
 *     insertion into a proposal as a numbered figure.
 *
 * So what carries over from it is the SHAPE, which was right: key on the story and the commit,
 * store the path and a content identity, and make the insert idempotent per key. Decided with
 * Ali on 2026-11-17, with converging the two left as its own ticket rather than assumed.
 *
 * Additive and idempotent, like every other ensure in this directory. No existing table is
 * altered and no existing index is dropped.
 *
 * ----------------------------------------------------------------------------
 * THIS ONE VERIFIES ITSELF, RATHER THAN PRINTING "ensured"
 * ----------------------------------------------------------------------------
 * The house pattern swallows each statement's error with a warning and then prints that the
 * schema is ensured, which is the same sentence whether every statement ran or every statement
 * failed. A table this one's writer depends on cannot be reported on that basis, so the end of
 * this function PROBES the table and says plainly whether it is usable. `storyArtifactsReady()`
 * is what the writer checks, so a missing table degrades to "record nothing" instead of
 * throwing on every push webhook.
 */

const TABLE = 'story_artifact_verifications';

let ready = false;

/** True only once the table has been probed and found usable in this process. */
export function storyArtifactsReady(): boolean {
  return ready;
}

export async function ensureStoryArtifactSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
       story_id VARCHAR(120) NOT NULL,
       artifact_key VARCHAR(32) NOT NULL,
       commit_sha VARCHAR(64) NOT NULL,
       verdict VARCHAR(32) NOT NULL,
       repo_path TEXT,
       blob_sha VARCHAR(64),
       size_bytes BIGINT,
       /* 'report_only' for the first weekly cycle, 'enforcing' after. Recorded per ROW so the
          first cycle's measurements stay distinguishable from rows that actually gated a story,
          rather than being inferred later from a date. */
       mode VARCHAR(16) NOT NULL DEFAULT 'report_only',
       plan_version INTEGER,
       verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    /* The idempotency the whole phase rests on: a re-sync over the same commit writes nothing.
       Keyed on the ARTIFACT too, unlike the gov table, because a story hands over several. */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_story_artifact_key_commit
       ON ${TABLE} (project_id, story_id, artifact_key, commit_sha)`,
    `CREATE INDEX IF NOT EXISTS idx_story_artifact_project ON ${TABLE} (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_story_artifact_story ON ${TABLE} (project_id, story_id)`,
  ];

  const failures: string[] = [];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      failures.push(err?.message || String(err));
    }
  }

  // The probe. "Ensured" is only worth printing if a read actually works.
  try {
    await sequelize.query(`SELECT 1 FROM ${TABLE} LIMIT 0`);
    ready = true;
  } catch (err: any) {
    ready = false;
    failures.push(`probe failed: ${err?.message || String(err)}`);
  }

  if (ready) {
    console.log(`[DB] ${TABLE} ready`
      + (failures.length ? ` (with ${failures.length} skipped statement(s), table usable)` : ''));
  } else {
    console.error(`[DB] ${TABLE} NOT usable; story artifact verification will record nothing. `
      + `Reasons: ${failures.join(' | ')}`);
  }
}

/** The table name, for the writer and for the tests, so neither restates the string. */
export const STORY_ARTIFACT_TABLE = TABLE;
