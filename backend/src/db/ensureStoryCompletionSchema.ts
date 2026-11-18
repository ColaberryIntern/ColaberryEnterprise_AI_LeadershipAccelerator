import { sequelize } from '../config/database';

/**
 * Story completion celebrations (phase A3): one row the FIRST time a story's artifact contract is
 * satisfied, and never again.
 *
 * ----------------------------------------------------------------------------
 * KEYED PER STORY, NOT PER COMMIT, AND THAT IS THE WHOLE GUARANTEE
 * ----------------------------------------------------------------------------
 * A2's `story_artifact_verifications` is UNIQUE on (project, story, key, commit): an audit trail,
 * which SHOULD gain a row when the same artifact is seen again at a new commit, because "handed
 * over at which commit" is the question it answers.
 *
 * This table is the opposite. It is UNIQUE on (project_id, story_id) with no commit in the key, so
 * a story can produce exactly one celebration for the life of the system. That is what makes
 * "fires on the first satisfying sync and never again" a property of the schema rather than a
 * promise in a function: a re-sync, a force-push, a sweep tick and a page refresh all collide on
 * the same index and insert nothing.
 *
 * ----------------------------------------------------------------------------
 * IT STORES THE SENTENCE, NOT JUST THE IDS
 * ----------------------------------------------------------------------------
 * `headline` is the text as it read AT THE MOMENT it fired, kept rather than rebuilt on read. A
 * contract can be edited afterwards, and re-deriving the sentence later would quietly rewrite
 * what somebody was told. The keys and names are stored beside it so a link can still be built.
 *
 * Additive and idempotent, like every other ensure here, and it probes itself at the end rather
 * than printing that it succeeded: `storyCompletionsReady()` is what the writer checks, so a
 * missing table degrades to recording nothing instead of throwing inside a push webhook.
 */

const TABLE = 'story_completion_events';

let ready = false;

/** True only once the table has been probed and found usable in this process. */
export function storyCompletionsReady(): boolean {
  return ready;
}

export const STORY_COMPLETION_TABLE = TABLE;

export async function ensureStoryCompletionSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
       story_id VARCHAR(120) NOT NULL,
       /* The commit the artifacts were seen at, for provenance. NOT part of the key: see above. */
       commit_sha VARCHAR(64),
       artifact_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
       artifact_names JSONB NOT NULL DEFAULT '[]'::jsonb,
       /* The sentence as it read when it fired, kept rather than rebuilt on read. */
       headline TEXT NOT NULL,
       caveat TEXT,
       plan_version INTEGER,
       /* Whether a person has seen it. The portal sets this; nothing here reads it. */
       seen_at TIMESTAMPTZ,
       fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    /* ONCE, EVER. No commit in the key, unlike the A2 audit table. */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_story_completion_once
       ON ${TABLE} (project_id, story_id)`,
    `CREATE INDEX IF NOT EXISTS idx_story_completion_project ON ${TABLE} (project_id, fired_at DESC)`,
  ];

  const failures: string[] = [];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      failures.push(err?.message || String(err));
    }
  }

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
    console.error(`[DB] ${TABLE} NOT usable; story celebrations will record nothing. `
      + `Reasons: ${failures.join(' | ')}`);
  }
}
