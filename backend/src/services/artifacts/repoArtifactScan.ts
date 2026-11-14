/**
 * repoArtifactScan — PURE. Which files in a student's repository are deliverables,
 * and which are the machinery around them.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * `artifactRepoSync` runs one way only: a student uploads on the platform, and we
 * mirror the file into their repo. Nothing has ever read a repository and noticed
 * that work was already in it.
 *
 * Measured on 14 Nov 2026, that cost one intern her entire document set. Omolola's
 * Saratoga Springs repository held two infographics, seven engineering documents and
 * a 50KB project overview, every one of them committed and synced daily, and the
 * internship report showed `artifacts_real_count: 0`. She was being asked to produce
 * artifacts she had already produced, because the only path into the platform was an
 * upload form nobody had told her to use.
 *
 * ── THE RULE IS NOT "ALLOWED EXTENSION" ──────────────────────────────────────
 * That was the first thing tried and it is badly wrong. Her repository has 35 files
 * with a document or image extension, and only ten of them are hers to show:
 *
 *   8  app/*.html              the application's own screens, which are source code
 *   1  index.html              the Command Center shell
 *  14  docs/stories/STORY-*.md the plan, which WE generated into her repo
 *   1  CLAUDE.md               configuration
 *   1  .colaberry/connect.txt  our plumbing
 *  ---
 *  10  the actual deliverables
 *
 * Ingesting the other 25 would bury the real work under our own output, which is the
 * exact failure `portfolioReport/artifacts.ts` already documents for the generated
 * case studies: "a report that shows those is telling Ali about his own platform's
 * output, not about the intern".
 *
 * ── SO THE RULE IS ABOUT PLACE, NOT JUST TYPE ────────────────────────────────
 * A binary document or image is a deliverable wherever it sits: nobody commits a PDF
 * or a 4MB infographic as part of a build. A text-shaped file (markdown, HTML, CSV,
 * plain text) is a deliverable only inside a documents directory, because at the repo
 * root that is where README, LICENSE and CLAUDE.md live, and under `app/` it is the
 * program itself.
 *
 * That makes the rule teachable, which matters more than making it clever: "put
 * deliverables in docs/" is a sentence a student can act on. A rule they cannot
 * predict produces a repo they have to guess at.
 *
 * PURE. No I/O, no ORM, no clock, no network.
 */

/** What we will take out of a repository, and what we will call it. */
export interface IngestibleType {
  /** Matches `ArtifactFileType` in portfolioReport/artifacts.ts. */
  fileType: 'pdf' | 'word' | 'slides' | 'spreadsheet' | 'html' | 'image' | 'markdown' | 'text';
  mimetype: string;
  /**
   * `true` when the file is a document in its own right regardless of where it sits.
   * `false` when it only counts inside a documents directory — see the header.
   */
  standalone: boolean;
}

export const INGESTIBLE: ReadonlyMap<string, IngestibleType> = new Map<string, IngestibleType>([
  ['pdf', { fileType: 'pdf', mimetype: 'application/pdf', standalone: true }],
  ['docx', { fileType: 'word', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', standalone: true }],
  ['doc', { fileType: 'word', mimetype: 'application/msword', standalone: true }],
  ['pptx', { fileType: 'slides', mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', standalone: true }],
  ['ppt', { fileType: 'slides', mimetype: 'application/vnd.ms-powerpoint', standalone: true }],
  ['xlsx', { fileType: 'spreadsheet', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', standalone: true }],
  ['xls', { fileType: 'spreadsheet', mimetype: 'application/vnd.ms-excel', standalone: true }],
  ['png', { fileType: 'image', mimetype: 'image/png', standalone: true }],
  ['jpg', { fileType: 'image', mimetype: 'image/jpeg', standalone: true }],
  ['jpeg', { fileType: 'image', mimetype: 'image/jpeg', standalone: true }],
  ['gif', { fileType: 'image', mimetype: 'image/gif', standalone: true }],
  ['webp', { fileType: 'image', mimetype: 'image/webp', standalone: true }],
  // Text-shaped. Only inside a documents directory.
  ['html', { fileType: 'html', mimetype: 'text/html', standalone: false }],
  ['htm', { fileType: 'html', mimetype: 'text/html', standalone: false }],
  ['md', { fileType: 'markdown', mimetype: 'text/markdown', standalone: false }],
  ['markdown', { fileType: 'markdown', mimetype: 'text/markdown', standalone: false }],
  ['csv', { fileType: 'spreadsheet', mimetype: 'text/csv', standalone: false }],
  ['txt', { fileType: 'text', mimetype: 'text/plain', standalone: false }],
  // Deliberately NOT here: svg. It is overwhelmingly an icon or a build asset in these
  // repos, and the one thing worse than missing an artifact is drowning the real ones.
]);

/** Where a student is told to put deliverables. The first entry is the one we tell them. */
export const DOCUMENT_DIRS: readonly string[] = ['docs/', 'doc/', 'documents/', 'deliverables/', 'reports/'];

/**
 * Paths that are ours, not theirs.
 *
 * `artifacts/` is the most important entry and the least obvious: that is where
 * `artifactRepoSync` writes uploaded artifacts INTO the repo. Scanning it would
 * re-import our own mirror as if the student had authored it there, double counting
 * every uploaded artifact and growing the set a little on every run.
 *
 * `docs/stories/` is the SBP's generated story documents. They live under a documents
 * directory and are markdown, so nothing else here would exclude them, and there are
 * usually more of them than there are real deliverables.
 */
export const EXCLUDED_PREFIXES: readonly string[] = [
  'artifacts/',          // our own mirror, written by artifactRepoSync
  'docs/stories/',       // story documents the SBP generated
  'docs/sessions/',      // Claude Code session logs, a working record not a deliverable
  'node_modules/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  'vendor/',
  'venv/',
  '__pycache__/',
  'site-packages/',
];

/**
 * Directory names that hold machine output rather than deliverables, at any depth.
 *
 * ── THE RUN THAT PUT THIS HERE ───────────────────────────────────────────────
 * The first dry run across all 23 connected repositories wanted to record **1,254**
 * artifacts, and **946 of them belonged to one intern**: per-screen walkthrough
 * screenshots under `.alveara/gates/B/evidence/walkthroughs-desktop/...`, generated by
 * his own test gates. Every one passed the type, place and size rules honestly. They
 * are simply not deliverables, and recording them would have buried the other 22
 * interns under one person's test output.
 *
 * A screenshot a student took to show their work and a screenshot a test harness
 * emitted are the same bytes. The only thing that tells them apart is where they live.
 */
export const MACHINE_OUTPUT_DIRS: readonly string[] = [
  'evidence', 'walkthroughs', 'screenshots', 'screenshot', 'snapshots', '__snapshots__',
  'test-results', 'test-output', 'playwright-report', 'allure-results', 'cypress',
  'baseline', 'baselines', 'diffs', 'gates',
];

/**
 * A dot-directory is tooling. All of them, at any depth.
 *
 * Replaces the individual `.github/`, `.git/`, `.venv/`, `.colaberry/` entries this
 * list used to carry, and is what would have caught `.alveara/` before it produced 946
 * rows. Enumerating tool directories one at a time is a list that is always one new
 * tool out of date.
 */
export function hasDotDirectory(path: string): boolean {
  return path.split('/').slice(0, -1).some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..');
}

export function hasMachineOutputDirectory(path: string): boolean {
  const segs = path.toLowerCase().split('/').slice(0, -1);
  return segs.some((seg) => MACHINE_OUTPUT_DIRS.includes(seg));
}

/**
 * More than this from one repository is a pattern we did not anticipate, not a
 * productive intern.
 *
 * It REFUSES rather than truncating. Silently keeping the first 60 of 946 would record
 * an arbitrary slice of someone's test output as their portfolio, and nobody would
 * ever find out which 60. A repo that trips this is reported for a person to look at.
 */
export const MAX_CANDIDATES_PER_REPO = 60;

/** Files that are configuration or boilerplate wherever they appear. */
export const EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  'claude.md', 'readme.md', 'license', 'license.md', 'license.txt', 'contributing.md',
  'code_of_conduct.md', 'changelog.md', 'notice.md', 'authors.md', 'index.html',
  'requirements.txt', 'requirements-dev.txt', 'robots.txt', '.nojekyll',
]);

/**
 * The documents the SBP writes INTO a student's repository when their plan publishes.
 *
 * Found by dry-running this scan across every connected repo on 14 Nov 2026: the same
 * four filenames came back for five different interns, which is not what five people
 * independently choosing names looks like. `services/sbp/docsBundle.ts` and
 * `planDocSections.ts` confirm it; `BUNDLE_NOTICE_PATH` is literally
 * `docs/CONNECT-YOUR-REPO.md`.
 *
 * Counting these as the intern's artifacts would repeat the mistake
 * `portfolioReport/artifacts.ts` was written to end: a report full of our own output,
 * described as theirs. The student may well have edited them heavily, and that work
 * is real, but it belongs to the story it documents rather than standing as a
 * deliverable of its own.
 */
export const PLATFORM_GENERATED_DOCS: ReadonlySet<string> = new Set([
  'docs/connect-your-repo.md',
  'docs/requirements.md',
  'docs/stories.md',
  'docs/traceability.md',
  'docs/data_contract.md',
  'docs/command_center_data_contract.md',
]);

/**
 * Image filenames that are furniture whatever their size.
 *
 * `MIN_IMAGE_BYTES` alone was not enough: a 25KB `colaberry-logo.png` cleared it on
 * the first real run, and brand furniture in a report about someone's work is noise.
 */
const FURNITURE_IMAGE = /(^|[-_])(logo|favicon|icon|sprite|banner|avatar|placeholder|background|bg)([-_]|$)/i;

/**
 * An image below this is furniture: a favicon, a logo, a UI sprite.
 *
 * 20KB, because a screenshot of a real screen at any reasonable width clears it
 * comfortably (Omolola's infographics are 4MB, Harpreet's login screenshot 513KB)
 * while icons do not.
 */
export const MIN_IMAGE_BYTES = 20 * 1024;

/** Below this, a document is a stub rather than a deliverable. */
export const MIN_DOCUMENT_BYTES = 512;

/** Above this we do not ingest: it is a dataset or a video, not a document to read. */
export const MAX_ARTIFACT_BYTES = 40 * 1024 * 1024;

/** One entry of a git tree, as `github_connections.file_tree_json` stores it. */
export interface TreeEntry {
  path: string;
  type: string;
  size?: number;
  sha?: string;
}

export type SkipReason =
  | 'not_a_blob' | 'no_extension' | 'type_not_ingestible' | 'excluded_path'
  | 'excluded_name' | 'not_in_a_documents_directory' | 'too_small' | 'too_large'
  | 'platform_generated' | 'image_is_furniture' | 'dot_directory' | 'machine_output';

export interface ArtifactCandidate {
  repoPath: string;
  filename: string;
  extension: string;
  type: IngestibleType;
  sizeBytes: number;
  blobSha: string | null;
  /** Markdown and plain text are real work in the wrong format. See WRONG_FORMAT. */
  wrongFormat: boolean;
}

export interface SkippedFile {
  repoPath: string;
  reason: SkipReason;
}

const lower = (s: string): string => s.toLowerCase();

/**
 * The final extension, or null.
 *
 * A LEADING DOT IS NOT AN EXTENSION. `.gitignore` is a dotfile whose whole name is
 * "gitignore", and reading that as an extension is how `.nojekyll` and `.env` end up
 * being classified as file types. The name must have at least one character before
 * the dot.
 */
export function fileExtension(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const m = /[^.]\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : null;
}

export function isInDocumentDirectory(path: string): boolean {
  const p = lower(path);
  return DOCUMENT_DIRS.some((d) => p.startsWith(d) || p.includes(`/${d}`));
}

/**
 * One file's verdict, with the reason when it is no.
 *
 * Returns the reason rather than a bare boolean so the operational script can show a
 * student WHY their file was not picked up. "We did not find it" is not an
 * instruction; "that only counts inside docs/" is.
 */
export function classifyRepoFile(entry: TreeEntry): ArtifactCandidate | SkippedFile {
  const repoPath = String(entry.path ?? '');
  const skip = (reason: SkipReason): SkippedFile => ({ repoPath, reason });

  if (entry.type !== 'blob') return skip('not_a_blob');

  const p = lower(repoPath);
  if (hasDotDirectory(repoPath)) return skip('dot_directory');
  if (hasMachineOutputDirectory(repoPath)) return skip('machine_output');
  if (EXCLUDED_PREFIXES.some((pre) => p === pre.slice(0, -1) || p.startsWith(pre) || p.includes(`/${pre}`))) {
    return skip('excluded_path');
  }

  const filename = repoPath.slice(repoPath.lastIndexOf('/') + 1);
  if (EXCLUDED_NAMES.has(lower(filename))) return skip('excluded_name');
  if (PLATFORM_GENERATED_DOCS.has(p)) return skip('platform_generated');

  const extension = fileExtension(repoPath);
  if (!extension) return skip('no_extension');

  const type = INGESTIBLE.get(extension);
  if (!type) return skip('type_not_ingestible');

  if (!type.standalone && !isInDocumentDirectory(repoPath)) return skip('not_in_a_documents_directory');

  // Matched against the STEM, not the filename: in `colaberry-logo.png` the word is
  // followed by a dot, so testing the whole filename silently never matches.
  if (type.fileType === 'image' && FURNITURE_IMAGE.test(filename.replace(/\.[A-Za-z0-9]+$/, ''))) {
    return skip('image_is_furniture');
  }

  const sizeBytes = Number(entry.size ?? 0);
  const floor = type.fileType === 'image' ? MIN_IMAGE_BYTES : MIN_DOCUMENT_BYTES;
  if (sizeBytes < floor) return skip('too_small');
  if (sizeBytes > MAX_ARTIFACT_BYTES) return skip('too_large');

  return {
    repoPath,
    filename,
    extension,
    type,
    sizeBytes,
    blobSha: entry.sha ? String(entry.sha) : null,
    // Ali, 10 Nov 2026: markdown and text ARE real work, listed and flagged rather than
    // hidden, which is what drives the existing `format_correction` ask.
    wrongFormat: type.fileType === 'markdown' || type.fileType === 'text',
  };
}

export interface ScanResult {
  candidates: ArtifactCandidate[];
  skipped: SkippedFile[];
}

/** Every deliverable in a tree, in a stable order (never by tree order, which is not stable). */
export function scanTreeForArtifacts(tree: readonly TreeEntry[] | null | undefined): ScanResult {
  const candidates: ArtifactCandidate[] = [];
  const skipped: SkippedFile[] = [];
  for (const entry of tree ?? []) {
    const verdict = classifyRepoFile(entry);
    if ('reason' in verdict) skipped.push(verdict);
    else candidates.push(verdict);
  }
  // BY CODE UNIT, never localeCompare. Locale collation is case-insensitive at the
  // primary level and varies with the runtime's ICU build, so the same repository
  // could order differently on two machines. `artifactRepoFiles` sorts the same way
  // for the same reason.
  candidates.sort((a, b) => (a.repoPath < b.repoPath ? -1 : a.repoPath > b.repoPath ? 1 : 0));
  return { candidates, skipped };
}

/**
 * A readable title from a filename.
 *
 * `Municipal_Software_Project_Briefing.png` becomes "Municipal Software Project
 * Briefing", and `TEST-REPORT.md` becomes "TEST REPORT". Deliberately dumb: the
 * student named the file, and inventing a better name than theirs is how the
 * generated case studies ended up describing work nobody did.
 */
export function titleFromFilename(filename: string): string {
  const stem = filename.replace(/\.[A-Za-z0-9]+$/, '');
  const words = stem.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.length > 0 ? words.slice(0, 180) : filename.slice(0, 180);
}

export interface IngestPlan {
  toCreate: ArtifactCandidate[];
  alreadyPresent: ArtifactCandidate[];
  skipped: SkippedFile[];
  /**
   * Set when the repository produced more candidates than `MAX_CANDIDATES_PER_REPO`.
   * `toCreate` is EMPTY in that case: see the constant for why it refuses rather than
   * truncating.
   */
  tooMany?: { found: number; limit: number };
}

/**
 * What to write, given what is already recorded.
 *
 * IDEMPOTENT BY `repo_path`, not by content. A student who edits a document in place
 * must not get a second artifact row for it: the artifact is the document, and its
 * current version is whatever the repository holds. Re-running this after every repo
 * sync is therefore safe and produces nothing on an unchanged repository, which is
 * the only way it can be allowed to run on a schedule.
 */
export function planRepoArtifactIngest(
  scan: ScanResult,
  existingRepoPaths: Iterable<string>,
): IngestPlan {
  const have = new Set<string>();
  for (const p of existingRepoPaths) have.add(lower(String(p)));
  const toCreate: ArtifactCandidate[] = [];
  const alreadyPresent: ArtifactCandidate[] = [];
  for (const c of scan.candidates) {
    if (have.has(lower(c.repoPath))) alreadyPresent.push(c);
    else toCreate.push(c);
  }
  // Judged on everything found, not on what is left after dedupe, so a repo cannot
  // creep past the limit a few files at a time across successive runs.
  if (scan.candidates.length > MAX_CANDIDATES_PER_REPO) {
    return {
      toCreate: [], alreadyPresent, skipped: scan.skipped,
      tooMany: { found: scan.candidates.length, limit: MAX_CANDIDATES_PER_REPO },
    };
  }
  return { toCreate, alreadyPresent, skipped: scan.skipped };
}
