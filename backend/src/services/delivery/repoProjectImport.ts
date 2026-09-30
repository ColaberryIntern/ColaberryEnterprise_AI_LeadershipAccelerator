import { startBuild } from '../sbp/sbpOrchestrator';
import { resolveProjectForNewBuild } from '../projectService';

/**
 * Import a project that was never built here, from its repository.
 *
 *     "Also allow me to add projects that aren't connected to the system, but I
 *      can give you the repo to read and upload the project."  (Ali, 2026-09-29)
 *
 * Asked what reading a repo should produce, he chose the full thing: releases,
 * stories and requirements, so an imported project behaves like every other one
 * — same board, same case-study score, same drill-down.
 *
 * ── IT IS A DOOR, NOT A SECOND PIPELINE ────────────────────────────────────
 *
 * The repository becomes a BRIEF, and the brief goes through `startBuild`. That
 * is the same decomposer, gate, repair and materialisation every other project
 * gets, which is what `buildFromUnderstanding`'s header means by "ONE pipeline
 * and three ways in". Nothing here decomposes anything itself.
 *
 * Held for review, like the other admin-initiated door: a plan assembled from
 * somebody's README is exactly the kind that wants a human read before it lands
 * on their Projects page.
 *
 * ── WHAT IT READS, AND WHY SO LITTLE ───────────────────────────────────────
 *
 * The README, then a handful of docs. Not the source. A decomposer fed a code
 * dump writes requirements about the code that exists rather than about the
 * problem the project solves, which is backwards: the plan is meant to describe
 * what should be true, and the repo is the evidence of what is. The README is
 * the closest thing a repository has to a brief, and when it is thin the honest
 * outcome is a thin plan a human then sharpens — not an invented one.
 */

/** A GitHub repository, as the API addresses it. */
export interface RepoRef { owner: string; repo: string }

export class RepoImportError extends Error {
  status: number;
  error_class: string;
  constructor(message: string, status = 400, errorClass = 'RepoImportError') {
    super(message);
    this.status = status;
    this.error_class = errorClass;
  }
}

/**
 * Accept the forms a person actually pastes.
 *
 * A browser URL, a clone URL, an SSH remote, or plain `owner/repo`. Anything
 * else is refused by name rather than guessed at: importing the wrong
 * repository would produce a confident, wholly fictional plan.
 */
export function parseRepoRef(input: string): RepoRef {
  const raw = (input ?? '').trim();
  if (!raw) throw new RepoImportError('Give me the repository to read.');

  // git@github.com:owner/repo(.git)
  const ssh = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  // https://github.com/owner/repo(/anything)(.git)
  const url = raw.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (url) return { owner: url[1], repo: url[2] };

  // owner/repo
  const bare = raw.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/);
  if (bare) return { owner: bare[1], repo: bare[2] };

  throw new RepoImportError(
    `That does not look like a GitHub repository: "${raw.slice(0, 80)}". `
    + 'Paste the repo URL, or owner/repo.',
  );
}

/** One file read out of the repository. */
export interface RepoDoc { path: string; content: string }

/**
 * The files worth reading, in the order they are tried.
 *
 * README first because it is the brief. The rest are the documents a project
 * keeps when it has any; absent ones are skipped, never faked.
 */
export const IMPORT_DOC_PATHS = [
  'README.md',
  'readme.md',
  'docs/README.md',
  'docs/REQUIREMENTS.md',
  'REQUIREMENTS.md',
  'docs/ARCHITECTURE.md',
  'ARCHITECTURE.md',
  'CLAUDE.md',
] as const;

/** Per-document ceiling. A 200k README is a book, and the decomposer's own
 *  prompt clips at 200k anyway; cutting here keeps the brief readable. */
export const DOC_MAX_CHARS = 40_000;

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/**
 * Turn what was read into the brief the decomposer receives.
 *
 * PURE, and the reason this is separable: what a repository says is the whole
 * input to the plan, so it is worth being able to see and test the exact text
 * that will be decomposed rather than inferring it from a plan afterwards.
 */
export function briefFromRepo(ref: RepoRef, docs: RepoDoc[]): string {
  if (!docs.length) {
    throw new RepoImportError(
      `Nothing readable in ${ref.owner}/${ref.repo}: no README or docs. `
      + 'A plan built from an empty repository would be invention, so describe the project instead.',
      422,
      'EmptyRepository',
    );
  }
  const parts = [
    `This project already exists. Its repository is ${ref.owner}/${ref.repo}.`,
    'What follows is its own documentation, verbatim. Build the plan from what it says the'
    + ' project does and must do. Where the documentation is silent, leave the requirement out'
    + ' rather than inventing one.',
  ];
  for (const d of docs) {
    parts.push(`\n--- ${d.path} ---\n${clip(d.content, DOC_MAX_CHARS)}`);
  }
  return parts.join('\n');
}

/** Injected so the fetch is testable and the service stays free of a client. */
export type FetchDoc = (ref: RepoRef, path: string) => Promise<string | null>;

/**
 * Read a file from a public or token-visible repository.
 *
 * Absent and unreadable both answer `null`: a missing ARCHITECTURE.md is the
 * normal case, not an error, and the caller decides what an empty set means.
 */
export const fetchRepoDoc: FetchDoc = async (ref, path) => {
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(path)}`,
      {
        headers: {
          Accept: 'application/vnd.github.raw',
          'User-Agent': 'Colaberry RepoImport',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
};

export interface ImportedProject {
  project_id: string;
  enrollment_id: string;
  correlation_id: string;
  status: string;
  repo: string;
  docs_read: string[];
  /**
   * True when this landed on an existing empty project rather than a new one.
   * Reported because "I imported it and got someone's existing project" is a
   * question worth being able to answer from the response.
   */
  reused_project: boolean;
}

/**
 * Read the repository, then build from it — held for review.
 *
 * `resolveProjectForNewBuild` rather than "always create": it reuses an active
 * project only while it has no build content and mints a new one once a build
 * exists, which is the behaviour that stops a second import quietly writing
 * over the first person's plan.
 */
export async function importProjectFromRepo(params: {
  repoUrl: string;
  enrollmentId: string;
  name?: string | null;
  size?: string | null;
  fetchDoc?: FetchDoc;
}): Promise<ImportedProject> {
  const ref = parseRepoRef(params.repoUrl);
  const read = params.fetchDoc ?? fetchRepoDoc;

  const docs: RepoDoc[] = [];
  const seen = new Set<string>();
  for (const path of IMPORT_DOC_PATHS) {
    const content = await read(ref, path);
    if (!content || !content.trim()) continue;
    // README.md and readme.md are the same document on a case-insensitive
    // checkout; reading both would feed the decomposer the file twice.
    const key = content.trim().slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ path, content });
  }

  const brief = briefFromRepo(ref, docs);
  const { project, reused } = await resolveProjectForNewBuild(params.enrollmentId);
  const name = (params.name ?? '').trim() || ref.repo;

  const started = await startBuild({
    projectId: project.id,
    enrollmentId: params.enrollmentId,
    idea: brief,
    name,
    size: params.size ?? 'project',
    // Assembled from someone's README: exactly the kind of plan that wants a
    // human read before it reaches their Projects page.
    holdForReview: true,
  });

  return {
    project_id: project.id,
    enrollment_id: params.enrollmentId,
    correlation_id: started.correlationId,
    status: started.status,
    repo: `${ref.owner}/${ref.repo}`,
    docs_read: docs.map((d) => d.path),
    reused_project: reused,
  };
}
