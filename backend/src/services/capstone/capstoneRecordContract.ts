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

/**
 * Band 3b — what they BUILT IN THEIR OWN REPO, read from the committed file tree.
 *
 * The artifact band only ever showed UPLOADED artifacts the platform mirrored, and the
 * mirror handles `.md`, `.txt` and `.csv` alone. The rebuilt labs have students build in
 * their own repo and commit it themselves, so a student could do everything right and
 * still see a nearly empty page. This band is that work.
 *
 * THREE DISTINCTIONS THIS BAND MUST KEEP, because collapsing any one of them turns the
 * page into a claim the evidence does not support:
 *
 *   count    a COLLECTION counts distinct immediate children, not files. A skills
 *            directory of 32 entries is a handful of skills, not 32 — and a floor of 3
 *            would otherwise be met by one skill split across three files.
 *   proven   a service EXISTING is not a service DEMONSTRATED. `proven` requires an
 *            actual recording; the reader once scored an MCP server as proven off a
 *            spreadsheet upload. Claiming a demo that never happened is worse than
 *            claiming nothing.
 *   on_sample built against the provided sample rather than their own system. Week 3
 *            permits it explicitly, so the page says so plainly rather than implying
 *            work on a real system — the same line `built_on_sample` already draws.
 */
export interface RecordCapability {
  id: string;
  label: string;
  /** Distinct immediate children for a collection; 1 for a single artefact. */
  count: number;
  /** A service whose run has been evidenced. Absent for shapes that cannot be run. */
  proven?: boolean;
  /** Built against the sample rather than their own project. */
  on_sample?: boolean;
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
  /**
   * Optional so every record compiled before this band existed stays valid, and so a
   * student with no connected repo simply has no band rather than an empty heading.
   */
  capabilities?: RecordCapability[];
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

/** What a public request for a record is allowed to get. */
export type PublicViewDecision = 'serve_indexable' | 'serve_noindex' | 'not_found';

/**
 * May an anonymous request see this record, and may a crawler keep it? PURE.
 *
 * Status and visibility are separate axes and BOTH have to pass. Folding them
 * is how "published" quietly comes to mean "public": a student who published so
 * they could send one link to one hiring manager would find their work indexed
 * under their real name, next to their real employer, permanently.
 *
 * `unlisted` is the default and serves with noindex. That pairing is the whole
 * point — the slug is readable by design, so it is guessable by design, and
 * search indexing is the difference between a link a student handed out and a
 * page that finds them. Guessing an unlisted slug gets you a page its owner
 * deliberately published; a crawler indexing it gets them found by people they
 * never sent it to.
 *
 * Everything else is `not_found`, and the route must not distinguish it from a
 * slug that never existed — "this exists but you may not see it" confirms a
 * student is enrolled, which is not a fact an anonymous request has earned.
 */
export function publicViewDecision(
  status: RecordStatus | string | null | undefined,
  visibility: RecordVisibility | string | null | undefined,
): PublicViewDecision {
  if (status !== 'published') return 'not_found';
  if (visibility === 'public') return 'serve_indexable';
  if (visibility === 'unlisted') return 'serve_noindex';
  return 'not_found';
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
