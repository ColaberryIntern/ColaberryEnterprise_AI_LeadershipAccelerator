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
 * ── AND THEN IT FETCHES THE BYTES ────────────────────────────────────────────
 * Discovery alone produces a row nobody can open. The artifact viewers build their file
 * pane from `content.stored_path` and nothing else, so the first 137 rows this recorded
 * rendered as a GitHub link next to an empty viewer. `repoArtifactStore` fetches each
 * file and writes it into the uploads volume exactly where a student's own upload lands,
 * which is all the existing viewers — PDF, CSV, image, text, and Word and PowerPoint
 * through `officeToHtml` — ever needed to render it.
 *
 * Storing is best-effort by design: a row whose bytes could not be fetched is still
 * recorded, with its GitHub URL, rather than lost. `store_failure` on the content says
 * which files are in that state so a later run can heal them.
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
import { type StoreResult, storeRepoFile } from './repoArtifactStore';

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export type IngestOutcome =
  | 'written'        // new artifacts were recorded, or existing ones gained their file
  | 'unchanged'      // every deliverable was already recorded and already openable
  | 'nothing_found'  // a repo with no deliverables in it yet
  | 'no_repo'        // no connected repository. Normal in weeks 1-3, not a fault.
  | 'no_tree'        // connected, but the repo sync has not stored a tree yet
  | 'too_many'       // an unanticipated shape. Nothing written; a person should look.
  | 'failed';

export interface IngestResult {
  enrollmentId: string;
  outcome: IngestOutcome;
  created: Array<{ repoPath: string; title: string; sizeBytes: number; wrongFormat: boolean; stored: boolean }>;
  /** Rows that already existed and have now been given their file, so they open. */
  healed: Array<{ repoPath: string; title: string }>;
  alreadyPresent: number;
  /** Counts by reason, so an operator can see what was passed over and why. */
  skipped: Record<string, number>;
  /** Counts by failure, so an operator can see which files have no bytes yet and why. */
  storeFailures: Record<string, number>;
  repoUrl?: string;
  reason?: string;
}

interface ConnectionRow {
  repo_url: string | null;
  file_tree_json: { tree?: TreeEntry[] } | null;
  last_sync_at: Date | null;
}

/** An artifact row this intern already has that came from a repository scan. */
interface ExistingRow {
  id: string;
  repo_path: string;
  /** False when the row has no bytes on disk, which is what makes it unopenable. */
  stored: boolean;
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

async function existingRows(enrollmentId: string): Promise<ExistingRow[]> {
  const [rows] = await (await db()).query(
    `SELECT id,
            NULLIF(content->>'repo_path', '') AS repo_path,
            COALESCE(NULLIF(content->>'stored_path', ''), '') <> '' AS stored
       FROM runtime_portfolio_artifacts
      WHERE enrollment_id = :eid AND NULLIF(content->>'repo_path', '') IS NOT NULL`,
    { replacements: { eid: enrollmentId } },
  ) as [ExistingRow[], unknown];
  return rows ?? [];
}

/** The GitHub blob URL for a file, which opens it where it actually lives. */
function blobUrl(repoUrl: string | null, repoPath: string): string | null {
  if (!repoUrl) return null;
  const base = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
  return `${base}/blob/HEAD/${repoPath.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Fetch one candidate's bytes into the uploads volume.
 *
 * Returns the fields that go on `content`. A failure contributes `store_failure` instead
 * of `stored_path`, which keeps the row honest: it says the file is known and not yet
 * readable, rather than pointing a viewer at a path that is not there.
 */
async function storeFor(
  candidate: ArtifactCandidate,
  repoUrl: string | null,
): Promise<{ fields: Record<string, unknown>; stored: boolean; failure?: string }> {
  const result: StoreResult = await storeRepoFile({
    repoUrl,
    repoPath: candidate.repoPath,
    filename: candidate.filename,
    blobSha: candidate.blobSha,
    sizeBytes: candidate.sizeBytes,
  });
  if (result.ok) {
    return {
      stored: true,
      fields: {
        stored_path: result.storedPath,
        stored_name: result.storedName,
        size_bytes: result.sizeBytes,
        store_failure: null,
        stored_at: new Date().toISOString(),
      },
    };
  }
  return {
    stored: false,
    failure: result.failure,
    fields: { store_failure: result.failure },
  };
}

async function insertArtifact(
  enrollmentId: string,
  candidate: ArtifactCandidate,
  sha: string | null,
  repoUrl: string | null,
  storeFields: Record<string, unknown>,
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
    // Opens the file where it actually lives, and remains the fallback for a file whose
    // bytes could not be fetched.
    artifact_url: blobUrl(repoUrl, candidate.repoPath),
    discovered_at: new Date().toISOString(),
    ...storeFields,
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

/**
 * Give an already-recorded row its file.
 *
 * `||` merges into the existing jsonb rather than replacing it, so a row keeps every
 * field an earlier run wrote. Nothing else about the artifact is touched: this exists to
 * make a row openable, not to re-describe someone's work.
 */
async function healArtifact(id: string, storeFields: Record<string, unknown>): Promise<void> {
  await (await db()).query(
    `UPDATE runtime_portfolio_artifacts
        SET content = content || CAST(:patch AS jsonb)
      WHERE id = :id`,
    { replacements: { id, patch: JSON.stringify(storeFields) } },
  );
}

export interface IngestOptions {
  /** Report what would be written, write nothing and fetch nothing. */
  dryRun?: boolean;
  /** The repo's head commit, when the caller already knows it. */
  headSha?: string | null;
  /** Skip fetching bytes. Discovery only, which is what the first version of this did. */
  skipStore?: boolean;
}

/**
 * Record every deliverable already sitting in one intern's repository, and make each one
 * openable in the viewer the platform already has.
 *
 * Safe to run repeatedly: `planRepoArtifactIngest` is keyed on `repo_path` and the stored
 * file is content-addressed, so an unchanged repository produces `unchanged`, zero writes
 * and zero downloads.
 */
export async function ingestRepoArtifacts(
  enrollmentId: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const base: IngestResult = {
    enrollmentId, outcome: 'failed', created: [], healed: [], alreadyPresent: 0, skipped: {}, storeFailures: {},
  };
  try {
    const conn = await readConnection(enrollmentId);
    if (!conn || !conn.repo_url) return { ...base, outcome: 'no_repo' };

    const tree = conn.file_tree_json?.tree;
    if (!Array.isArray(tree) || tree.length === 0) {
      return { ...base, outcome: 'no_tree', repoUrl: conn.repo_url,
        reason: 'the repo sync has not stored a file tree for this repository yet' };
    }

    const existing = await existingRows(enrollmentId);
    const plan = planRepoArtifactIngest(scanTreeForArtifacts(tree), existing.map((r) => r.repo_path));
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

    // Rows recorded by an earlier run that still have no bytes on disk. Matched
    // case-insensitively on repo_path, the same key the plan deduplicates on.
    const unstored = new Map(existing.filter((r) => !r.stored).map((r) => [r.repo_path.toLowerCase(), r.id]));
    const toHeal = opts.skipStore
      ? []
      : plan.alreadyPresent
        .map((c) => ({ candidate: c, id: unstored.get(c.repoPath.toLowerCase()) }))
        .filter((x): x is { candidate: ArtifactCandidate; id: string } => Boolean(x.id));

    if (plan.toCreate.length === 0 && toHeal.length === 0) {
      const outcome: IngestOutcome = plan.alreadyPresent.length > 0 ? 'unchanged' : 'nothing_found';
      return { ...base, outcome, alreadyPresent: plan.alreadyPresent.length, skipped, repoUrl: conn.repo_url };
    }

    const storeFailures: Record<string, number> = {};
    const noteFailure = (failure?: string): void => {
      if (failure) storeFailures[failure] = (storeFailures[failure] ?? 0) + 1;
    };

    const created: IngestResult['created'] = [];
    for (const c of plan.toCreate) {
      let stored = false;
      let fields: Record<string, unknown> = {};
      if (!opts.dryRun && !opts.skipStore) {
        const s = await storeFor(c, conn.repo_url);
        stored = s.stored;
        fields = s.fields;
        noteFailure(s.failure);
      }
      if (!opts.dryRun) {
        await insertArtifact(enrollmentId, c, provenanceSha(c, opts.headSha ?? null), conn.repo_url, fields);
      }
      created.push({ repoPath: c.repoPath, title: titleFromFilename(c.filename), sizeBytes: c.sizeBytes, wrongFormat: c.wrongFormat, stored });
    }

    const healed: IngestResult['healed'] = [];
    for (const h of toHeal) {
      if (opts.dryRun) {
        healed.push({ repoPath: h.candidate.repoPath, title: titleFromFilename(h.candidate.filename) });
        continue;
      }
      const s = await storeFor(h.candidate, conn.repo_url);
      noteFailure(s.failure);
      await healArtifact(h.id, s.fields);
      if (s.stored) healed.push({ repoPath: h.candidate.repoPath, title: titleFromFilename(h.candidate.filename) });
    }

    logEvent('repo_artifacts_ingested', 'info', {
      enrollment_id: enrollmentId, repo: conn.repo_url, created: created.length, healed: healed.length,
      stored: created.filter((c) => c.stored).length + healed.length,
      already_present: plan.alreadyPresent.length, wrong_format: created.filter((c) => c.wrongFormat).length,
      store_failures: storeFailures, dry_run: Boolean(opts.dryRun),
    });

    return {
      ...base,
      outcome: created.length > 0 || healed.length > 0 ? 'written' : 'unchanged',
      created, healed, alreadyPresent: plan.alreadyPresent.length, skipped, storeFailures, repoUrl: conn.repo_url,
    };
  } catch (err: unknown) {
    const e = err as { constructor?: { name?: string }; message?: string };
    logEvent('repo_artifact_ingest_failed', 'error', {
      enrollment_id: enrollmentId, error_class: e?.constructor?.name ?? 'Error',
      message: String(e?.message ?? '').slice(0, 300),
    });
    return { ...base, outcome: 'failed', reason: String(e?.message ?? 'unknown').slice(0, 300) };
  }
}
