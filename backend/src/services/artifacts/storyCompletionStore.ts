/**
 * storyCompletionStore - the I/O for A3's celebration. One row the first time a story's artifact
 * contract is satisfied, and never again.
 *
 * NEVER THROWS, and only ever INSERTs. It is called from inside the verification pass, which runs
 * behind a push webhook and a button a student presses, and a failure to record a celebration must
 * not be able to fail the verification that earned it. Nothing here updates or deletes, so a later
 * sync that could not read the tree can never erase a celebration already fired.
 *
 * FIRING ONCE IS THE UNIQUE INDEX, NOT A PRE-READ. `ON CONFLICT DO NOTHING` against the index on
 * (project_id, story_id), which carries no commit, so a re-sync, a force-push, a sweep tick and
 * two concurrent syncs of the same push all collide and insert nothing. A check-then-insert would
 * race exactly the shape that happens here: the webhook fires while the student is pressing Sync.
 *
 * `inserted` is read from what Postgres actually returned, never from what we intended to write,
 * so "the celebration fired" and "we meant to fire it" cannot be confused.
 */

import { QueryTypes } from 'sequelize';

import { sequelize } from '../../config/database';
import { STORY_COMPLETION_TABLE, storyCompletionsReady } from '../../db/ensureStoryCompletionSchema';
import type { Celebration } from './storyCelebration';

export interface RecordCelebrationInput {
  projectId: string;
  storyId: string;
  commitSha: string | null;
  planVersion: number | null;
  celebration: Celebration;
}

export interface RecordCelebrationOutcome {
  /** 1 when this is genuinely the first time, 0 when it had already fired. */
  inserted: number;
  /** Set when nothing was attempted. Never an exception. */
  skipped: null | 'table_not_ready' | 'nothing_to_say' | 'write_failed';
  reason: string | null;
}

export async function recordStoryCelebration(
  input: RecordCelebrationInput,
): Promise<RecordCelebrationOutcome> {
  if (!storyCompletionsReady()) {
    return {
      inserted: 0,
      skipped: 'table_not_ready',
      reason: `${STORY_COMPLETION_TABLE} is not usable in this process, so nothing was recorded. `
        + 'The completion itself stands.',
    };
  }
  if (!input.celebration || !input.celebration.headline) {
    return { inserted: 0, skipped: 'nothing_to_say', reason: null };
  }

  try {
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO ${STORY_COMPLETION_TABLE}
         (project_id, story_id, commit_sha, artifact_keys, artifact_names, headline, caveat,
          plan_version)
       VALUES (:projectId, :storyId, :commitSha, CAST(:keys AS jsonb), CAST(:names AS jsonb),
               :headline, :caveat, :planVersion)
       ON CONFLICT (project_id, story_id) DO NOTHING
       RETURNING id`,
      {
        replacements: {
          projectId: input.projectId,
          storyId: input.storyId,
          commitSha: input.commitSha,
          keys: JSON.stringify(input.celebration.artifacts.map((a) => a.key)),
          names: JSON.stringify(input.celebration.artifacts.map((a) => a.name)),
          headline: input.celebration.headline,
          caveat: input.celebration.caveat,
          planVersion: input.planVersion,
        },
        type: QueryTypes.SELECT,
      },
    );
    return { inserted: rows.length, skipped: null, reason: null };
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'story-completion-store',
      event: 'story_celebration_record_failed',
      outcome: 'failure',
      context: {
        project_id: input.projectId,
        story_id: input.storyId,
        error: err?.message || String(err),
        reason: 'the completion stands; the celebration is not retried, because it fires once',
      },
    }));
    return { inserted: 0, skipped: 'write_failed', reason: err?.message || String(err) };
  }
}

export interface StoryCelebrationRow {
  story_id: string;
  commit_sha: string | null;
  artifact_keys: string[];
  artifact_names: string[];
  headline: string;
  caveat: string | null;
  seen_at: string | null;
  fired_at: string;
}

/** Celebrations for one project, newest first, for the portal to render. */
export async function listStoryCelebrations(
  projectId: string,
): Promise<StoryCelebrationRow[]> {
  if (!storyCompletionsReady()) return [];
  try {
    return await sequelize.query<StoryCelebrationRow>(
      `SELECT story_id, commit_sha, artifact_keys, artifact_names, headline, caveat, seen_at,
              fired_at
         FROM ${STORY_COMPLETION_TABLE}
        WHERE project_id = :projectId
        ORDER BY fired_at DESC`,
      { replacements: { projectId }, type: QueryTypes.SELECT },
    );
  } catch (err: any) {
    console.error(`[story-completion-store] list failed: ${err?.message || String(err)}`);
    return [];
  }
}
