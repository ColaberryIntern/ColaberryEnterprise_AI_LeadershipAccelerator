/**
 * capstoneRecordContract — the shape of a student's Capstone Record.
 *
 * The Record is the outer shell: one shareable page holding the system they
 * built, the twelve weeks of artifacts behind it, what they can prove they
 * know, and their own words along the way. It is what a student sends to a
 * hiring manager, and what the Architect Expo exhibits.
 *
 * ── IT IS A SNAPSHOT, NOT A LIVE JOIN ───────────────────────────────────────
 *
 * The compiled record is stored whole. A shared link renders what was
 * published, not whatever five tables happen to hold when someone opens it six
 * months later. This is the shape Repo2Reputation arrived at independently
 * (`portfolios.content_json` + a `portfolio_versions` table), and it is worth
 * copying rather than re-learning: a portfolio that silently changes under a
 * link you already sent is worse than one that is slightly stale.
 *
 * ── EVERY CLAIM CARRIES ITS EVIDENCE ────────────────────────────────────────
 *
 * Each artifact row carries the commit SHA it was written in, and links are
 * pinned to that SHA rather than to a branch. A reader following a link two
 * years later sees the file as it was when the claim was made, even though the
 * student kept building. A portfolio whose links rot into 404s is worse than
 * no portfolio, and pinning is the only thing that prevents it.
 *
 * PURE: this file is types and guards only. The compiler that fills it lives in
 * capstoneRecordCompiler.ts and is itself pure; the I/O sits above both.
 */

/** Publication state. Separate from visibility, exactly as R2R separates them. */
export type RecordStatus = 'draft' | 'published' | 'archived';

/**
 * Who can read it. `unlisted` is the default and the important one: a student
 * shares a link with a hiring manager long before they want to be indexed.
 */
export type RecordVisibility = 'private' | 'unlisted' | 'public';

/** Band 0 — who this is and the three things a reader does next. */
export interface RecordIdentity {
  full_name: string;
  /** e.g. "AI Systems Architect". Never invented — from their own manifesto post. */
  headline: string | null;
  cohort_name: string | null;
  repo_url: string | null;
  demo_url: string | null;
  /** Set only when the external gate was actually passed. */
  certification: string | null;
}

/** Band 1 — what they built and what it replaced. */
export interface RecordSystem {
  project_name: string | null;
  /** The plan's own descriptor. Their words, not a generated summary. */
  descriptor: string | null;
  /** Mermaid source, rendered client-side. Null when they never built one. */
  architecture_mermaid: string | null;
  /** Hours reclaimed, from the ledger. Null when never measured — never guessed. */
  hours_reclaimed: number | null;
}

/** One week's row in Band 2. */
export interface RecordArtifact {
  week: number;
  title: string;
  filename: string;
  /** Repo-relative. Combined with `commit_sha` to build a permalink. */
  path: string;
  /** The commit this artifact was written in. Null ⇒ render unlinked, never to a branch. */
  commit_sha: string | null;
  built_on: string;
  is_sample: boolean;
  /** 'verified' | 'submitted' | null — the platform's conclusion, not a claim. */
  verification: string | null;
}

/** Band 3 — what they can prove, each item tied to its evidence count. */
export interface RecordCompetency {
  domain: string;
  label: string;
  /** How many distinct pieces of evidence support this. Zero ⇒ omitted entirely. */
  evidence_count: number;
}

/** Band 4 — their own words, in week order. */
export interface RecordPost {
  week: number;
  ritual: string;
  headline: string;
  body: string | null;
  /** Per-post consent. Absent or false ⇒ never rendered publicly. */
  shared: boolean;
}

export interface CapstoneRecord {
  schema_version: 1;
  identity: RecordIdentity;
  system: RecordSystem;
  artifacts: RecordArtifact[];
  competencies: RecordCompetency[];
  posts: RecordPost[];
  /**
   * The bookend. Week 1's Roll Call asks what they want AI to take off their
   * plate; week 12's Manifesto asks who they have become. Placed side by side
   * they are the whole arc, and both are rows the student already wrote — no
   * new field, no prompt, no generation.
   */
  bookend: { opening: string | null; closing: string | null };
}

/** Why a record is not yet shareable. Empty ⇒ it is. */
export type RecordGap = 'no_system' | 'no_artifacts' | 'no_demo' | 'too_few_weeks';

/**
 * Is this worth sending to a hiring manager yet?
 *
 * An empty record is worse than no record: a page with nine blank weeks reads
 * as abandonment rather than as work in progress. So a record is always
 * compiled and always visible to its owner, and the SHARE action is what waits
 * for a bar to be cleared.
 *
 * PURE, and deliberately conservative — three weeks of evidence is the floor,
 * not a target.
 */
export function recordGaps(record: CapstoneRecord): RecordGap[] {
  const gaps: RecordGap[] = [];
  if (!record.system.project_name || !record.system.descriptor) gaps.push('no_system');
  if (record.artifacts.length === 0) gaps.push('no_artifacts');
  else if (new Set(record.artifacts.map((a) => a.week)).size < 3) gaps.push('too_few_weeks');
  if (!record.identity.demo_url) gaps.push('no_demo');
  return gaps;
}

export function isShareable(record: CapstoneRecord): boolean {
  return recordGaps(record).length === 0;
}

/**
 * A GitHub permalink pinned to the commit. Returns null rather than falling
 * back to a branch: a link that silently points at a moving target is the exact
 * failure this design exists to prevent.
 */
export function artifactPermalink(repoUrl: string | null, artifact: RecordArtifact): string | null {
  if (!repoUrl || !artifact.commit_sha) return null;
  const base = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
  return `${base}/blob/${artifact.commit_sha}/${artifact.path}`;
}
