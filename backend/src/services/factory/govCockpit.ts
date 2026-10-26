/**
 * govCockpit — the PURE read-model helpers behind the intern Build Cockpit's task board and commit feed.
 *
 * The cockpit turns the gov delivery project into a 4-stage board (Not started → In build → Commit matched →
 * Verified) plus a feed of build-repo pushes that matched a story. These helpers derive the stage of a task and
 * shape the feed from state the projection already loads (assignments + evidence) — they are pure + total so they
 * can be unit-tested without a DB, and they encode the ONE honesty rail that matters here:
 *
 *   A COMMIT NEVER VERIFIES. A matched commit moves a story to `matched` (a CLAIM awaiting review), never to
 *   `done`. Only a reviewer-verified evidence row (status `verified`) makes a story `done`. So `deriveBuildStoryStage`
 *   reads `verified` from the evidence, never from the mere presence of a commit.
 *
 * Nothing here is student-unsafe: a stage is a lifecycle label, the commit feed carries public commit facts (sha,
 * message, when, which key it cited, whether a reviewer has verified it) and NO identity. The projection remains the
 * trust boundary; this module only shapes already-safe data.
 */
import type { EvidenceView } from './govBuildEvidence';

/** The 4 board columns a BUILD story moves through. A commit can only reach `matched`; `done` needs a reviewer. */
export type BuildStage = 'todo' | 'build' | 'matched' | 'done';
/** A PROPOSAL task has no commit path — it closes by reviewer approval, so it never enters `matched`. */
export type ProposalStage = 'todo' | 'build' | 'done';

/**
 * The board stage of a build story from its PERSISTED state. Evidence wins over assignment, and a verified row wins
 * over a merely-submitted one:
 *   verified evidence → done · any (submitted) evidence → matched · assigned, no evidence → build · else → todo.
 * Pure + total. The `matched` rung is a claim: a commit (or a manual hand-in) proposes completion; only a reviewer's
 * `verified` moves it to `done`.
 */
export function deriveBuildStoryStage(input: { assigned: boolean; evidence: Array<{ status?: string | null }> }): BuildStage {
  const evidence = Array.isArray(input?.evidence) ? input.evidence : [];
  if (evidence.some((e) => e && e.status === 'verified')) return 'done';
  if (evidence.length > 0) return 'matched';
  if (input?.assigned) return 'build';
  return 'todo';
}

/**
 * The board stage of a PROPOSAL checklist item from its lifecycle. A proposal response closes by approval, never by
 * a commit, so there is no `matched`: approved (no open gap) → done · unanswered → todo · anything in between → build.
 * Pure + total.
 */
export function deriveProposalStage(input: { status?: string | null; approved?: boolean }): ProposalStage {
  if (input?.approved === true) return 'done';
  const status = String(input?.status ?? 'unanswered').trim().toLowerCase();
  if (!status || status === 'unanswered') return 'todo';
  return 'build';
}

/** One row of the project's build-repo commit feed — public commit facts, NO identity. */
export interface CommitFeedItem {
  /** The matched commit's SHA (short display is the frontend's job). */
  sha: string;
  /** The commit's first message line (the evidence description). */
  message: string;
  /** The requirement key the commit cited (the story's canonical_req_id). */
  storyKey: string;
  /** When the evidence was filed (ISO), or null. */
  at: string | null;
  /** True once a reviewer has verified this commit's evidence — a commit alone is never verified. */
  verified: boolean;
}

/**
 * The commit feed for a project: every `github_push` evidence row that carried a commit SHA, newest first, as public
 * commit facts. Manual student hand-ins (source `student`) are NOT pushes and are excluded. Pure + total — input is
 * the same EvidenceView[] the projection already loads (already ordered newest-first; we preserve that order).
 */
export function toCommitFeed(evidence: EvidenceView[] | null | undefined): CommitFeedItem[] {
  return (Array.isArray(evidence) ? evidence : [])
    .filter((e) => e && e.source === 'github_push' && e.commitSha)
    .map((e) => ({
      sha: String(e.commitSha),
      message: String(e.description ?? ''),
      storyKey: String(e.canonicalReqId ?? ''),
      at: e.submittedAt ?? null,
      verified: e.status === 'verified',
    }));
}

/** The cockpit's overall completion: verified build stories + accepted proposal documents, each item weighted
 *  equally. This is the number the project bar shows and that only ADVANCES as a reviewer verifies a story or
 *  accepts a document — never from a draft or a commit alone. */
export interface GovOverallProgress {
  buildVerified: number; buildTotal: number;
  docsAccepted: number; docsTotal: number;
  /** Combined percent across build stories + proposal documents (0 when there is nothing yet). */
  pct: number;
}

/** PURE + total: combine build-story verification and document acceptance into one honest completion percent. */
export function computeOverallProgress(input: { buildVerified: number; buildTotal: number; docsAccepted: number; docsTotal: number }): GovOverallProgress {
  const buildTotal = Math.max(0, Number(input?.buildTotal) || 0);
  const buildVerified = Math.min(buildTotal, Math.max(0, Number(input?.buildVerified) || 0));
  const docsTotal = Math.max(0, Number(input?.docsTotal) || 0);
  const docsAccepted = Math.min(docsTotal, Math.max(0, Number(input?.docsAccepted) || 0));
  const total = buildTotal + docsTotal;
  const done = buildVerified + docsAccepted;
  return { buildVerified, buildTotal, docsAccepted, docsTotal, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** The two public solicitation facts the cockpit's project bar shows: the agency, and the detected key dates the
 *  frontend's existing govDeadline helper turns into a "closes in N days" countdown. Both live in the qualification's
 *  `requirements_json` (provenance + dossier), not in any admin-only field. */
export interface GovProvenanceFacts {
  agency: string | null;
  /** Detected key-date lines (date + the text they were found on) — public, and the countdown's only input. */
  keyDates: Array<{ date: string | null; text: string | null }>;
}

/**
 * Read the agency + detected key dates from a qualification's `requirements_json`. Defensive + total: the dossier is
 * AI-extracted free-form JSON, so every access is guarded and a missing/garbage shape yields empty facts (the cockpit
 * then shows no agency and an empty countdown, exactly as the admin view degrades). Carries ONLY these public facts —
 * never the dossier's contacts (which can include anti-phishing tax addresses) or any evaluation/compliance internals.
 */
export function readGovProvenanceFacts(requirementsJson: any): GovProvenanceFacts {
  const rj = requirementsJson && typeof requirementsJson === 'object' ? requirementsJson : {};
  const provenance = rj.provenance && typeof rj.provenance === 'object' ? rj.provenance : {};
  const dossier = rj.dossier && typeof rj.dossier === 'object' ? rj.dossier : {};
  const rawAgency = provenance.agency ?? (dossier.opportunity && dossier.opportunity.agency) ?? null;
  const agency = rawAgency != null && String(rawAgency).trim() ? String(rawAgency).trim() : null;
  const keyDates = (Array.isArray(dossier.keyDates) ? dossier.keyDates : [])
    .filter((k: any) => k && (k.date != null || k.text != null))
    .map((k: any) => ({ date: k.date != null ? String(k.date) : null, text: k.text != null ? String(k.text) : null }));
  return { agency, keyDates };
}
