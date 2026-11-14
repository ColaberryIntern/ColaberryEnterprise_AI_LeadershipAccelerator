/**
 * repoArtifactIngest — read a student's repository and record the deliverables already
 * in it as artifacts, so work they have done counts without them having to upload it
 * a second time.
 *
 * The missing half of `artifactRepoSync`, which has only ever run platform-to-repo.
 * `repoArtifactScan` holds every rule about WHICH files; this holds the I/O.
 *
 * ── IT READS THE TREE WE ALREADY HAVE ────────────────────────────────────────
 * `github_connections.file_tree_json` is a full recursive git tree, refreshed by the
 * existing repo sync (every connected repo in production had synced the same day this
 * was written). So discovery costs no GitHub call at all, and the ingest cannot be the
 * thing that exhausts a rate limit during a class.
 *
 * The consequence to be honest about: this is only as fresh as the last repo sync. A
 * file committed ten minutes ago is not here yet. That is the correct trade, because
 * the alternative is a recursive tree fetch per intern per run, and a document that
 * arrives a few hours late is not a problem anyone has.
 *
 * ── NEVER THROWS ─────────────────────────────────────────────────────────────
 * Same contract as `artifactRepoSync`, for the same reason: this runs behind a report
 * and a cron, and a student whose repository happens to be unreachable must not take
 * the run down for everyone else. Every path returns a classified outcome.
 *
 * ── IT WRITES NOTHING THE REPORT WOULD DISOWN ────────────────────────────────
 * Rows are written with `repo_path` AND `commit_sha`, which is exactly what
 * `portfolioReport/collect.ts` requires before it will show an artifact as the
 * intern's own, and what `artifactSource()` reads to answer 'repo'. No summary is
 * invented and no LLM is involved: the title comes from the filename the student
 * chose. Writing prose about their work is the thing that got 610 rows excluded from
 * the report in the first place.
 */
import { randomUUID } from 'crypto';
import {
  type ArtifactCandidate,
  type IngestPlan,
  type TreeEntry,
  planRepoArtifactIngest,
  scanTreeForArtifacts,
  titleFromFilename,
} from './repoArtifactScan';

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export type IngestOutcome =
  | 'written'        // new artifacts were recorded
  | 'unchanged'      // every deliverable was already recorded
  | 'nothing_found'  // a repo with no deliverables in it yet
  | 'no_repo'        // no connected repository. Normal in weeks 1-3, not a fault.
  | 'no_tree'        // connected, but the repo sync has not stored a tree yet
  | 'too_many'       // an unanticipated shape. Nothing written; a person should look.
  | 'failed';

export interface IngestResult {
  enrollmentId: string;
  outcome: IngestOutcome;
  created: Array<{ repoPath: string; title: string; sizeBytes: number; wrongFormat: boolean }>;
  alreadyPresent: number;
  /** Counts by reason, so an operator can see what was passed over and why. */
  skipped: Record<string, number>;
  repoUrl?: string;
  reason?: string;
}

interface ConnectionRow {
  repo_url: string | null;
  file_tree_json: { tree?: TreeEntry[] } | null;
  last_sync_at: Date | null;
}

function tally(plan: IngestPlan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of plan.skipped) out[s.reason] = (out[s.reason] ?? 0) + 1;
  return out;
}

function logEvent(event: string, level: 'info' | 'warn' | 'error', context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'error' ? 'failure' : 'success', context,
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/**
 * The commit the tree belongs to.
 *
 * A git TREE sha is not a COMMIT sha, and `commit_sha` is read by humans through
 * `artifactProvenance` as "the commit that put it there". Writing a tree sha into a
 * column named commit_sha would be a lie that nobody could detect later, so when the
 * head commit cannot be resolved the field falls back to the file's own BLOB sha,
 * which is a true and even more precise identity for that exact file version.
 */
function provenanceSha(candidate: ArtifactCandidate, headSha: string | null): string | null {
  return headSha ?? candidate.blobSha;
}

async function readConnection(enrollmentId: string): Promise<ConnectionRow | null> {
  const [rows] = await (await db()).query(
    `SELECT repo_url, file_tree_json, last_sync_at
       FROM github_connections
      WHERE enrollment_id = :eid
      ORDER BY last_sync_at DESC NULLS LAST
      LIMIT 1`,
    { replacements: { eid: enrollmentId } },
  ) as [ConnectionRow[], unknown];
  return rows?.[0] ?? null;
}

async function existingRepoPaths(enrollmentId: string): Promise<string[]> {
  const [rows] = await (await db()).query(
    `SELECT NULLIF(content->>'repo_path', '') AS repo_path
       FROM runtime_portfolio_artifacts
      WHERE enrollment_id = :eid AND NULLIF(content->>'repo_path', '') IS NOT NULL`,
    { replacements: { eid: enrollmentId } },
  ) as [Array<{ repo_path: string }>, unknown];
  return (rows ?? []).map((r) => r.repo_path);
}

async function insertArtifact(
  enrollmentId: string,
  candidate: ArtifactCandidate,
  sha: string | null,
  repoUrl: string | null,
): Promise<void> {
  const content = {
    kind: 'build_artifact',
    source: 'repo_scan',
    filename: candidate.filename,
    mimetype: candidate.type.mimetype,
    repo_path: candidate.repoPath,
    commit_sha: sha,
    blob_sha: candidate.blobSha,
    size_bytes: candidate.sizeBytes,
    wrong_format: candidate.wrongFormat,
    // Opens the file where it actually lives. No viewer page is needed for something
    // that already has a canonical home.
    artifact_url: repoUrl
      ? `${repoUrl.replace(/\.git$/, '').replace(/\/$/, '')}/blob/HEAD/${candidate.repoPath.split('/').map(encodeURIComponent).join('/')}`
      : null,
    discovered_at: new Date().toISOString(),
  };
  await (await db()).query(
    `INSERT INTO runtime_portfolio_artifacts (id, enrollment_id, card_id, kind, title, summary, content, competencies, created_at)
     VALUES (:id, :eid, NULL, 'build_artifact', :title, NULL, CAST(:content AS jsonb), '[]'::jsonb, NOW())`,
    {
      replacements: {
        id: randomUUID(),
        eid: enrollmentId,
        title: titleFromFilename(candidate.filename),
        content: JSON.stringify(content),
      },
    },
  );
}

export interface IngestOptions {
  /** Report what would be written, write nothing. */
  dryRun?: boolean;
  /** The repo's head commit, when the caller already knows it. */
  headSha?: string | null;
}

/**
 * Record every deliverable already sitting in one intern's repository.
 *
 * Safe to run repeatedly: `planRepoArtifactIngest` is keyed on `repo_path`, so an
 * unchanged repository produces `unchanged` and zero writes.
 */
export async function ingestRepoArtifacts(
  enrollmentId: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const base: IngestResult = {
    enrollmentId, outcome: 'failed', created: [], alreadyPresent: 0, skipped: {},
  };
  try {
    const conn = await readConnection(enrollmentId);
    if (!conn || !conn.repo_url) return { ...base, outcome: 'no_repo' };

    const tree = conn.file_tree_json?.tree;
    if (!Array.isArray(tree) || tree.length === 0) {
      return { ...base, outcome: 'no_tree', repoUrl: conn.repo_url,
        reason: 'the repo sync has not stored a file tree for this repository yet' };
    }

    const plan = planRepoArtifactIngest(scanTreeForArtifacts(tree), await existingRepoPaths(enrollmentId));
    const skipped = tally(plan);

    if (plan.tooMany) {
      logEvent('repo_artifact_ingest_refused_too_many', 'warn', {
        enrollment_id: enrollmentId, repo: conn.repo_url, found: plan.tooMany.found, limit: plan.tooMany.limit,
      });
      return {
        ...base, outcome: 'too_many', alreadyPresent: plan.alreadyPresent.length, skipped, repoUrl: conn.repo_url,
        reason: `found ${plan.tooMany.found} candidates, over the limit of ${plan.tooMany.limit}; nothing recorded, this repo needs a look`,
      };
    }

    if (plan.toCreate.length === 0) {
      const outcome: IngestOutcome = plan.alreadyPresent.length > 0 ? 'unchanged' : 'nothing_found';
      return { ...base, outcome, alreadyPresent: plan.alreadyPresent.length, skipped, repoUrl: conn.repo_url };
    }

    const created: IngestResult['created'] = [];
    for (const c of plan.toCreate) {
      if (!opts.dryRun) {
        await insertArtifact(enrollmentId, c, provenanceSha(c, opts.headSha ?? null), conn.repo_url);
      }
      created.push({ repoPath: c.repoPath, title: titleFromFilename(c.filename), sizeBytes: c.sizeBytes, wrongFormat: c.wrongFormat });
    }

    logEvent('repo_artifacts_ingested', 'info', {
      enrollment_id: enrollmentId, repo: conn.repo_url, created: created.length,
      already_present: plan.alreadyPresent.length, wrong_format: created.filter((c) => c.wrongFormat).length,
      dry_run: Boolean(opts.dryRun),
    });

    return { ...base, outcome: 'written', created, alreadyPresent: plan.alreadyPresent.length, skipped, repoUrl: conn.repo_url };
  } catch (err: unknown) {
    const e = err as { constructor?: { name?: string }; message?: string };
    logEvent('repo_artifact_ingest_failed', 'error', {
      enrollment_id: enrollmentId, error_class: e?.constructor?.name ?? 'Error',
      message: String(e?.message ?? '').slice(0, 300),
    });
    return { ...base, outcome: 'failed', reason: String(e?.message ?? 'unknown').slice(0, 300) };
  }
}
