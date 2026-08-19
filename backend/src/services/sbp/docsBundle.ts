/**
 * docsBundle — the same rendered document set, as a file the student downloads.
 *
 * ## Why this exists
 *
 * A student who has not connected a repo yet still needs `docs/REQUIREMENTS.md`
 * and `docs/stories/STORY-nnn.md` on disk, because every prompt the pipeline
 * generates opens by telling Claude Code to read them. Without the files, the
 * prompt cites paths that resolve to nothing — the exact defect the whole
 * document pipeline was built to close. Today, a student with no repo gets
 * `status: awaiting_repo` and an empty folder.
 *
 * So: the same `renderDocs` output, zipped, unzipped straight into the folder
 * they are already working in.
 *
 * ## It is a nudge, not a second path
 *
 * This is deliberately NOT a parallel way to work. Verification reads a repo —
 * `.colaberry/progress.json` plus a commit that names the story — so a student
 * on the download path earns no verified stories and no points. That is stated
 * in the bundle itself (`docs/CONNECT-YOUR-REPO.md`, first file in the archive),
 * in the response headers, and in the UI. It is written as "here is what
 * connecting gets you", not as a scolding.
 *
 * The PLATFORM-OWNED set is byte-identical to what a connected repo receives,
 * from the same pure renderer. If the two ever drift, the download becomes a
 * lie, and a student who later connects would see a confusing diff on their
 * first sync.
 *
 * ## What this archive deliberately does NOT contain
 *
 * `.colaberry/progress.json` and `.colaberry/profile.json` are not in it at
 * their live paths, and that is the whole point of this file's shape.
 *
 * `renderDocs` is pure: it always renders progress with every criterion
 * `passed: false`, and profile as a virgin seed. Every repo-write path launders
 * that through `repoWriter`, which MERGES progress field by field and seeds a
 * profile once and never again. This module used to skip both guards — it
 * shipped the raw render to a human under the instruction "unzip it into your
 * repo", and the student's `unzip` performed exactly the wholesale replace
 * `repoWriter` exists to prevent. A student who followed our own written
 * instruction destroyed the record of their verified progress.
 *
 * The fix is structural, not editorial. A warning in the copy is not enough:
 * people skim, and this one costs them their points. So the archive simply
 * cannot carry a destructive file. Ownership is asked of `fileOwnership`, the
 * two student files travel as `*.seed.json` siblings, and extracting the whole
 * thing over a working repo is a no-op against anything the student wrote.
 */
import { getPublishedPlan, getPlan } from './planStore';
import { renderDocs, RenderedFile } from './renderDocs';
import { createZip } from './zipArchive';
import { BuildPlan } from './planContract';
import { RepoConnectError } from './repoConnect/connectErrors';
import { CONNECT_FILE_PATH } from './repoConnect/connectChallenge';
import { isSafeToOverwrite, seedPathFor } from './fileOwnership';

export const BUNDLE_NOTICE_PATH = 'docs/CONNECT-YOUR-REPO.md';

export interface DocsBundle {
  filename: string;
  bytes: Buffer;
  /** Paths inside the archive, for logging and for the test that proves parity. */
  paths: string[];
  planVersion: number;
  /** True when the plan behind these documents is published rather than a draft. */
  published: boolean;
}

/**
 * The one file in the bundle that is not in the repo document set.
 *
 * It is a repo-shaped file (`docs/**`, inside the platform write allowlist), so
 * a student who later connects does not end up with a stray root-level file
 * nothing owns.
 */
export function renderBundleNotice(projectName: string, projectId: string): string {
  return [
    `# ${projectName} — connect this folder`,
    '',
    'You are holding the offline copy of your build documents. Everything Claude Code',
    'needs to start is here: `docs/REQUIREMENTS.md`, `docs/STORIES.md`, one file per',
    'story under `docs/stories/`, and a `CLAUDE.md` block with the conventions for',
    'this build.',
    '',
    '## What this copy cannot do',
    '',
    'The platform reads your progress out of a **repo**, not out of your hard drive.',
    'Until this folder is connected to GitHub:',
    '',
    '- no story can reach **verified**, because verification needs a commit that names it',
    '- **no points are awarded** for build work',
    '- your Command Center and the portal will keep showing these stories as not started',
    '- a republished plan will not reach you — you would be downloading this again',
    '',
    'None of that is a penalty. Verification is literally a read of your repo: it looks',
    'for the ticked criteria in `.colaberry/progress.json` and a commit whose message',
    'names the story. With no repo there is nothing to read.',
    '',
    '## Connecting takes about a minute',
    '',
    'Open your build in the portal and use **Connect your repo**. You keep your own',
    'repo, under your own account — the platform stores a pointer to it and the record',
    'of what you finished, never your code. If you already have a GitHub repo for this',
    'folder, paste its address; if you do not, the portal will make you an empty private',
    'one and give you the two commands that point this folder at it. Either way your',
    'files and your history stay exactly as they are.',
    '',
    'The platform only ever writes `CLAUDE.md` (inside a marked block it owns),',
    `\`docs/**\` and \`.colaberry/**\`. Your source code is never touched, and your own`,
    'CLAUDE.md content is spliced around, never replaced.',
    '',
    '## Unzipping this on top of your folder',
    '',
    'This archive cannot overwrite anything you wrote. It carries no file at',
    '`.colaberry/progress.json` or `.colaberry/profile.json` — those two are yours, so they',
    'travel as `.colaberry/progress.seed.json` and `.colaberry/profile.seed.json` instead and',
    'land beside your versions rather than on them.',
    '',
    'The documents themselves ARE a fresh render and will replace what is at their paths, so',
    'if you have edited `docs/REQUIREMENTS.md` by hand, take a copy first.',
    '',
    '### If you do not have a progress file yet',
    '',
    'Copy `.colaberry/progress.seed.json` to `.colaberry/progress.json` yourself — once, and',
    'only if there is nothing there already. It lists every story and every criterion with',
    '`passed: false`, which is the starting point your agent ticks as work genuinely passes.',
    '',
    '**If you already have `.colaberry/progress.json`, do not copy over it.** It holds the',
    'ticks you have earned and the seed does not — the seed is blank by construction.',
    '',
    '---',
    '',
    `Build ${projectId}. Generated by the Colaberry Student Build Pipeline.`,
    `Once connected, \`${CONNECT_FILE_PATH}\` in your repo is how the platform knows this`,
    'folder is the one to read.',
    '',
  ].join('\n');
}

/**
 * Build the downloadable document set for a project.
 *
 * Prefers the PUBLISHED plan. Falls back to the latest draft so a student mid-
 * flow is not stonewalled — the response says which one they got, because a
 * draft can still change under them.
 *
 * @throws RepoConnectError('NoPublishedPlan') when there is no plan at all.
 */
export async function buildDocsBundle(projectId: string, opts: { generatedAt?: Date } = {}): Promise<DocsBundle> {
  const published = await getPublishedPlan(projectId);
  const stored = published ?? await getPlan(projectId);
  if (!stored) {
    throw new RepoConnectError(
      'NoPublishedPlan',
      'This build has no plan yet, so there are no documents to download. Finish the build wizard first.',
    );
  }

  const plan = stored.plan as BuildPlan;
  const generatedAt = opts.generatedAt ?? new Date();

  // Same renderer, same context shape as a repo write. `repoUrl` is null on
  // purpose: with no repo, prompts must not cite a clone URL that does not
  // exist (FR-031).
  const files: RenderedFile[] = renderDocs(plan, {
    repoUrl: null,
    generatedAt: generatedAt.toISOString(),
    planVersion: stored.version,
    planSha256: stored.plan_sha256,
    correlationId: stored.correlation_id ?? undefined,
  });

  const notice = { path: BUNDLE_NOTICE_PATH, content: renderBundleNotice(plan.project_name, projectId) };

  // THE SAFETY PROPERTY, ENFORCED HERE RATHER THAN DESCRIBED IN THE COPY.
  //
  // Anything the student owns or co-owns is moved off its live path onto a
  // `.seed.json` sibling. Nothing is dropped — a student with no repo still
  // needs the seed to start from — but nothing in this archive can now land on
  // top of a file the student wrote. Extraction is non-destructive BY
  // CONSTRUCTION, so the instruction on screen cannot be followed into a loss.
  const deliverable = files.map((f) => (
    isSafeToOverwrite(f.path) ? f : { path: seedPathFor(f.path), content: f.content }
  ));

  const slug = plan.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'build';
  return {
    // The notice leads so it is the first thing in any archive listing.
    filename: `${slug}-build-docs-v${stored.version}.zip`,
    bytes: createZip([notice, ...deliverable], { modifiedAt: generatedAt }),
    paths: [notice.path, ...deliverable.map((f) => f.path)],
    planVersion: stored.version,
    published: Boolean(published),
  };
}
