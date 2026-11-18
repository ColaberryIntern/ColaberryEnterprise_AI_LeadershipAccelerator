/**
 * storyArtifactVerificationStore - the I/O for A2. One row per declared artifact key that the
 * repository sync found handed over, keyed to the commit it was seen at.
 *
 * ----------------------------------------------------------------------------
 * IT NEVER THROWS, AND IT NEVER REVOKES
 * ----------------------------------------------------------------------------
 * This is called from `verifyBuildFromRepo`, which runs behind a GitHub push webhook and behind
 * a Sync button a student presses. That service's own contract is that every EXPECTED condition
 * is a classified result rather than an exception, because a 500 tells a student nothing. A
 * failure to record an artifact must not be able to fail the verification that found it: the
 * verdict stands, and the row can be written by the next sync.
 *
 * It also only ever INSERTs. Nothing here deletes or updates a row, so a later sync that could
 * not read the tree can never erase the evidence an earlier one recorded.
 *
 * ----------------------------------------------------------------------------
 * IDEMPOTENCY IS THE UNIQUE INDEX, NOT A PRE-READ
 * ----------------------------------------------------------------------------
 * `ON CONFLICT DO NOTHING` against the unique index on
 * (project_id, story_id, artifact_key, commit_sha). A check-then-insert would race two
 * concurrent syncs of the same push, which is a real shape here: the webhook fires while a
 * student is pressing Sync. The index decides, and the returned count is the number of rows
 * that were genuinely new, read from what Postgres actually inserted rather than from what we
 * intended to insert.
 *
 * Raw parameterized SQL rather than a Sequelize model: a bulk insert through the ORM in this
 * repository has produced a malformed array literal in production before, and the shape here is
 * a simple multi-row VALUES list that reads better as SQL than as a model call.
 */

import { QueryTypes } from 'sequelize';

import { sequelize } from '../../config/database';
import { STORY_ARTIFACT_TABLE, storyArtifactsReady } from '../../db/ensureStoryArtifactSchema';
import type { ArtifactMatch } from './storyArtifactMatch';
import { SATISFYING_VERDICTS } from './storyArtifactMatch';

/** Whether a row gated anything. Recorded per row, so the first cycle stays distinguishable. */
export type StoryArtifactMode = 'report_only' | 'enforcing';

export interface StoryArtifactRecordInput {
  projectId: string;
  storyId: string;
  commitSha: string;
  planVersion: number | null;
  mode: StoryArtifactMode;
  matches: ReadonlyArray<ArtifactMatch>;
}

export interface StoryArtifactRecordOutcome {
  /** Rows Postgres actually inserted. Zero on a re-sync of the same commit, by design. */
  inserted: number;
  /** Rows offered to the insert, i.e. the satisfying matches. */
  offered: number;
  /** Set when nothing was attempted, with the reason. Never an exception. */
  skipped: null | 'table_not_ready' | 'no_commit' | 'nothing_satisfying' | 'write_failed';
  reason: string | null;
}

/**
 * Record the satisfying matches for one story at one commit.
 *
 * ONLY the satisfying verdicts are recorded. An outstanding key is deliberately NOT a row: the
 * absence of a row is what "not handed over yet" means, and writing a `missing` row per sync
 * would turn one unfinished artifact into a row per push, which reads as activity and measures
 * nothing. The verdict the student sees comes from the live match, not from this table; the
 * table is the audit trail of what WAS there, and at which commit.
 */
export async function recordStoryArtifacts(
  input: StoryArtifactRecordInput,
): Promise<StoryArtifactRecordOutcome> {
  const satisfying = (input.matches || []).filter(
    (m) => SATISFYING_VERDICTS.indexOf(m.verdict) !== -1,
  );
  const offered = satisfying.length;

  if (!storyArtifactsReady()) {
    return {
      inserted: 0,
      offered,
      skipped: 'table_not_ready',
      reason: `${STORY_ARTIFACT_TABLE} is not usable in this process, so nothing was recorded. `
        + 'The verification verdict stands.',
    };
  }
  if (!input.commitSha) {
    // A row keyed to no commit could never be matched by the unique index, so every sync would
    // insert another one. Refusing is the only honest option.
    return {
      inserted: 0,
      offered,
      skipped: 'no_commit',
      reason: 'No commit sha was available for this sync, and a row that names no commit cannot '
        + 'be idempotent.',
    };
  }
  if (!offered) {
    return { inserted: 0, offered: 0, skipped: 'nothing_satisfying', reason: null };
  }

  const rows: Record<string, unknown> = {
    projectId: input.projectId,
    storyId: input.storyId,
    commitSha: input.commitSha,
    planVersion: input.planVersion,
    mode: input.mode,
  };
  const values = satisfying.map((m, i) => {
    rows[`k${i}`] = m.key;
    rows[`v${i}`] = m.verdict;
    rows[`p${i}`] = m.repo_path;
    rows[`b${i}`] = m.blob_sha;
    rows[`s${i}`] = m.size_bytes;
    return `(:projectId, :storyId, :k${i}, :commitSha, :v${i}, :p${i}, :b${i}, :s${i}, :mode, :planVersion)`;
  }).join(', ');

  try {
    const inserted = await sequelize.query<{ id: string }>(
      `INSERT INTO ${STORY_ARTIFACT_TABLE}
         (project_id, story_id, artifact_key, commit_sha, verdict, repo_path, blob_sha, size_bytes, mode, plan_version)
       VALUES ${values}
       ON CONFLICT (project_id, story_id, artifact_key, commit_sha) DO NOTHING
       RETURNING id`,
      { replacements: rows, type: QueryTypes.SELECT },
    );
    return { inserted: inserted.length, offered, skipped: null, reason: null };
  } catch (err: any) {
    // Expected conditions only reach here as defects in this module's own SQL, but a push
    // webhook is not the place to surface them by failing the verification.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'story-artifact-store',
      event: 'story_artifact_record_failed',
      outcome: 'failure',
      context: {
        project_id: input.projectId,
        story_id: input.storyId,
        commit_sha: input.commitSha,
        offered,
        error: err?.message || String(err),
        reason: 'verification stands; the next sync will try again',
      },
    }));
    return {
      inserted: 0,
      offered,
      skipped: 'write_failed',
      reason: err?.message || String(err),
    };
  }
}

export interface StoryArtifactRow {
  story_id: string;
  artifact_key: string;
  commit_sha: string;
  verdict: string;
  repo_path: string | null;
  blob_sha: string | null;
  size_bytes: string | number | null;
  mode: string;
  verified_at: string;
}

/**
 * Every artifact row recorded for a project, newest first.
 *
 * `IN (:ids)` rather than `= ANY(:ids)`: an array replacement through this ORM has produced a
 * malformed array literal in production and crash-looped the service.
 */
export async function listStoryArtifacts(
  projectId: string,
  storyIds?: ReadonlyArray<string>,
): Promise<StoryArtifactRow[]> {
  if (!storyArtifactsReady()) return [];
  if (storyIds && storyIds.length === 0) return [];
  const where = storyIds ? 'AND story_id IN (:storyIds)' : '';
  try {
    return await sequelize.query<StoryArtifactRow>(
      `SELECT story_id, artifact_key, commit_sha, verdict, repo_path, blob_sha, size_bytes, mode,
              verified_at
         FROM ${STORY_ARTIFACT_TABLE}
        WHERE project_id = :projectId ${where}
        ORDER BY verified_at DESC, story_id ASC, artifact_key ASC`,
      {
        replacements: storyIds ? { projectId, storyIds: [...storyIds] } : { projectId },
        type: QueryTypes.SELECT,
      },
    );
  } catch (err: any) {
    console.error(`[story-artifact-store] list failed: ${err?.message || String(err)}`);
    return [];
  }
}
