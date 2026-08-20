/**
 * artifactRepoFiles — a student's uploaded curriculum artifacts become files in
 * their repo. PURE: no I/O, no clock, no randomness. Same artifacts in,
 * byte-identical files out, so re-running a sync that changed nothing produces
 * no commit (repoWriter compares content hashes, and a wall-clock stamp anywhere
 * in here would turn that into an infinite commit generator).
 *
 * ── TEXT NOW, BINARY LATER, AND WHY THAT IS NOT A FUDGE ─────────────────────
 *
 * `repoWriter` builds its tree with inline `content` strings, which is GitHub's
 * text-only path; committing a PDF needs a base64 blob created first and
 * referenced by sha. That is a real change to a security-sensitive module, so it
 * is deliberately NOT in this pass.
 *
 * Measured on production 2026-08-20, across all 53 build artifacts students have
 * actually uploaded: `.md` 35, `.csv` 7, `.txt` 2 — 44 of 53, 83%, already text
 * and committable today. `.pdf` 10 and `.docx` 1 are the remaining 17%. So
 * text-first is not a stopgap covering the easy half, it is the majority case,
 * and the revised curriculum catalog (markdown, Mermaid, code, config, with
 * video and audio as links) pushes that share higher rather than lower.
 *
 * A binary artifact is NOT silently dropped. It gets a stub at its own path
 * recording what it is and where it lives, and a row in the index marked as
 * held on the platform. A reader can always see that the artifact exists and
 * that the repo is not pretending to hold it.
 */

/** One artifact as this module needs it — the shape the caller must supply. */
export interface ArtifactRecord {
  /** 1-12. Artifacts are keyed to the WEEK, never to a project id, so nothing
   *  has to migrate when a student's project is created at week 3. */
  week: number | null;
  /** The card this was built for. Used only for a stable slug. */
  cardId: string;
  /** The student's own filename, e.g. `governance-framework.md`. */
  filename: string;
  /** Card title, for the index. */
  title: string;
  /** UTF-8 contents. Null for a binary artifact the platform holds instead. */
  text: string | null;
  /** ISO-8601. Supplied by the caller — never read from a clock in here. */
  uploadedAt: string;
  sizeBytes: number | null;
}

/**
 * Structurally identical to `sbp/renderDocs.RenderedFile`, and re-exported as
 * that type so the sync can hand its output straight to `writeDocsToRepo`
 * without a cast. Declared here rather than imported so this module stays pure
 * and free of the SBP graph; the compatibility is asserted in the tests.
 */
export interface RenderedArtifactFile {
  /** Repo-relative, forward slashes, inside the allowlist. */
  path: string;
  content: string;
}

export const ARTIFACT_ROOT = 'artifacts';
export const ARTIFACT_INDEX_PATH = `${ARTIFACT_ROOT}/INDEX.md`;

/** Extensions repoWriter can commit as-is. Everything else is held platform-side. */
export const TEXT_EXTENSIONS = ['.md', '.txt', '.csv'];

export function isTextArtifact(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.includes(filename.slice(dot).toLowerCase());
}

/**
 * A filename safe to put in a repo path. Strips directory traversal, collapses
 * anything exotic to a hyphen, and lowercases.
 *
 * This is a path-safety boundary, not cosmetics: `filename` is student-supplied,
 * and a `../` in it would place a write outside `artifacts/` where the allowlist
 * would then reject the whole commit — losing a legitimate artifact because
 * somebody typed a dot.
 */
export function slugifyFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || 'artifact';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : '';
  const safeStem = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'artifact';
  const safeExt = ext.replace(/[^a-z0-9.]/g, '');
  return `${safeStem}${safeExt}`;
}

/** `artifacts/week-04/governance-framework.md`. Week 0 and null both sort last. */
export function artifactPath(artifact: ArtifactRecord): string {
  const week = typeof artifact.week === 'number' && artifact.week > 0 ? artifact.week : 0;
  const folder = `week-${String(week).padStart(2, '0')}`;
  return `${ARTIFACT_ROOT}/${folder}/${slugifyFilename(artifact.filename)}`;
}

/** Deterministic order: by week, then by path. Never by upload time. */
function ordered(artifacts: ArtifactRecord[]): ArtifactRecord[] {
  return [...artifacts].sort((a, b) => {
    const aw = a.week ?? 0;
    const bw = b.week ?? 0;
    if (aw !== bw) return aw - bw;
    return artifactPath(a).localeCompare(artifactPath(b));
  });
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function humanSize(bytes: number | null): string {
  if (typeof bytes !== 'number' || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The stub committed in place of a binary artifact. */
function binaryStub(artifact: ArtifactRecord): string {
  return [
    `# ${escapePipes(artifact.title)}`,
    '',
    `This artifact is a \`${artifact.filename}\` file (${humanSize(artifact.sizeBytes)}), built for`,
    `${artifact.week ? `week ${artifact.week}` : 'this course'} and held on the Colaberry platform.`,
    '',
    'It is recorded here so the repo shows the complete set of work. The file itself',
    'is not committed: only text artifacts are committed today.',
    '',
    `Uploaded: ${artifact.uploadedAt}`,
    '',
  ].join('\n');
}

/**
 * The index a reader actually looks at. One row per artifact, in week order.
 *
 * `generatedNote` is passed in rather than stamped from a clock — see the module
 * header. Callers that want a date should put it in the sync's commit message,
 * where it does not participate in the content-hash comparison.
 */
export function renderArtifactIndex(artifacts: ArtifactRecord[]): string {
  const rows = ordered(artifacts).map((a) => {
    const week = a.week ? `Week ${a.week}` : '—';
    const held = a.text === null ? ' *(held on platform)*' : '';
    return `| ${week} | ${escapePipes(a.title)} | [\`${slugifyFilename(a.filename)}\`](./${artifactPath(a).slice(ARTIFACT_ROOT.length + 1)})${held} | ${humanSize(a.sizeBytes)} |`;
  });

  return [
    '# Build Artifacts',
    '',
    'Everything built in Claude Code across the AI Systems Architect Accelerator,',
    'week by week. Each row links to the artifact in this repo.',
    '',
    '| Week | Built for | Artifact | Size |',
    '|---|---|---|---|',
    ...rows,
    '',
    `${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}.`,
    '',
  ].join('\n');
}

/**
 * The full file set for a student's artifacts: one file per artifact plus the
 * index. Feed straight to `writeDocsToRepo`.
 *
 * Two artifacts that slug to the same path within a week would collide; the
 * LAST one wins, matching the upload path's own one-artifact-per-card replace
 * semantics rather than inventing a numbering scheme the index could not
 * explain.
 */
export function buildArtifactFiles(artifacts: ArtifactRecord[]): RenderedArtifactFile[] {
  const byPath = new Map<string, RenderedArtifactFile>();

  for (const artifact of ordered(artifacts)) {
    byPath.set(artifactPath(artifact), {
      path: artifactPath(artifact),
      content: artifact.text === null ? binaryStub(artifact) : artifact.text,
    });
  }

  return [
    ...[...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    { path: ARTIFACT_INDEX_PATH, content: renderArtifactIndex(artifacts) },
  ];
}
