/**
 * claudeStudioService — submission and evidence for the Claude Studio type.
 *
 * A student does the work in THEIR OWN Claude.ai account (conversations,
 * Projects, Artifacts) and comes back with: the Artifact's shared link, an
 * optional Project-setup proof link, an acknowledgement of the four stages, the
 * reflection self-checks, and a written reflection. This service validates that
 * submission, stores it as a PortfolioArtifact, and completes the card.
 *
 * PRIVACY (non-negotiable, Part 3H of the brief): we never receive, request, or
 * store the contents of a student's Claude conversations, their prompts, or
 * their Project sources. What is stored is what they chose to submit — links
 * they own plus their own written reflection. `assertNoConversationDump` is the
 * backstop for a student pasting a transcript into the reflection box by
 * mistake; it rejects rather than silently retaining it.
 *
 * URL SAFETY: submitted URLs are checked for FORMAT and for obviously-unsafe
 * shapes (non-https schemes, credentials in the URL, loopback and private
 * addresses that would make the link useless to a reviewer anyway). We do NOT
 * fetch them, and nothing in the stored record or the UI claims the linked
 * content was inspected — `verification: 'unverified_link'` says so explicitly.
 *
 * IDEMPOTENCY: exactly one PortfolioArtifact per (enrollment, card). A
 * resubmission REVISES that same record — attempt number increments, the
 * original first_submitted_at is preserved — and completion runs through the
 * idempotent progression path, so points are awarded once no matter how many
 * times a student revises. This is what stops point farming by resubmission.
 */
import TimelineCard from '../../models/TimelineCard';
import PortfolioArtifact from '../../models/PortfolioArtifact';
import { isCardServable } from '../timeline/curriculumScope';
import { onCardCompleted } from '../progression/progressionService';
import { STAGE_ORDER, StageKey } from '../../data/claudeStudios/types';

export const CLAUDE_STUDIO_KIND = 'claude_studio';
export const CLAUDE_STUDIO_TYPE = 'claude_studio';

/** Field caps. Generous for real reflection, small enough to reject a transcript. */
const MAX_URL = 2048;
const MAX_REFLECTION = 8000;
const MIN_REFLECTION = 120;

/** Hosts that make a "shared link" meaningless to a reviewer. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export interface ClaudeStudioSubmission {
  artifact_url: string;
  project_proof_url?: string | null;
  /** Stage keys the student acknowledges completing. All four are required. */
  stages_completed: string[];
  /** Indices of the reflection self-checks the student confirmed. */
  checks_confirmed: number[];
  /** How many self-checks the card presented, so partial confirmation is detectable. */
  checks_total: number;
  reflection: string;
  /** The student's own account of how they used AI on this studio. */
  ai_disclosure?: string | null;
}

export interface ClaudeStudioStatus {
  submitted: boolean;
  attempt: number;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  artifact_url: string | null;
  project_proof_url: string | null;
  stages_completed: StageKey[];
  reflection: string | null;
  verification: string | null;
  review_state: string | null;
}

const err = (message: string, status = 400) => Object.assign(new Error(message), { status });

/**
 * PURE — validate a submitted URL for format and obvious unsafety. Returns the
 * normalized URL. Throws a student-readable error otherwise.
 *
 * Deliberately NOT a fetch: we never claim to have inspected the destination.
 */
export function validateSubmittedUrl(raw: string, label: string): string {
  const value = String(raw ?? '').trim();
  if (!value) throw err(`${label} is required.`);
  if (value.length > MAX_URL) throw err(`${label} is too long to be a real link.`);

  let url: URL;
  try { url = new URL(value); } catch { throw err(`${label} is not a valid URL. Paste the full link, including https://`); }

  if (url.protocol !== 'https:') {
    throw err(`${label} must be an https:// link. A ${url.protocol.replace(':', '')} link cannot be opened safely by a reviewer.`);
  }
  if (url.username || url.password) {
    throw err(`${label} contains credentials in the URL. Paste the plain shared link instead.`);
  }
  const host = url.hostname.toLowerCase();
  if (LOOPBACK.has(host)) {
    throw err(`${label} points at your own machine, so nobody else could open it. Paste the shared link.`);
  }
  // Private ranges — same reasoning: a reviewer cannot reach them.
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /\.local$/.test(host)) {
    throw err(`${label} points at a private network address that a reviewer could not open. Paste the shared link.`);
  }
  return url.toString();
}

/**
 * PURE — reject a reflection that looks like a pasted Claude conversation
 * rather than the student's own writing. We do not want conversation contents
 * in our database, and a transcript is also not a reflection.
 */
export function assertNoConversationDump(reflection: string): void {
  const turnMarkers = (reflection.match(/^\s*(human|assistant|user|claude)\s*:/gim) || []).length;
  if (turnMarkers >= 4) {
    throw err('That looks like a pasted conversation transcript. Write your own reflection instead — we do not store your Claude conversations.');
  }
}

/** PURE — validate the whole submission payload. Throws on the first real problem. */
export function validateSubmission(input: ClaudeStudioSubmission): {
  artifact_url: string;
  project_proof_url: string | null;
  stages_completed: StageKey[];
  reflection: string;
  ai_disclosure: string | null;
} {
  const artifact_url = validateSubmittedUrl(input.artifact_url, 'The Artifact link');
  const project_proof_url = input.project_proof_url
    ? validateSubmittedUrl(input.project_proof_url, 'The Project proof link')
    : null;

  const stages = Array.from(new Set((input.stages_completed || []).map(String))) as StageKey[];
  const missing = STAGE_ORDER.filter((s) => !stages.includes(s));
  if (missing.length) {
    throw err(`Complete all four stages before submitting. Still outstanding: ${missing.join(', ')}.`);
  }

  const total = Number(input.checks_total);
  const confirmed = Array.isArray(input.checks_confirmed) ? new Set(input.checks_confirmed.map(Number)) : new Set<number>();
  if (Number.isFinite(total) && total > 0 && confirmed.size < total) {
    throw err(`Confirm all ${total} reflection checks before submitting. ${confirmed.size} of ${total} are ticked.`);
  }

  const reflection = String(input.reflection ?? '').trim();
  if (reflection.length < MIN_REFLECTION) {
    throw err(`Your reflection is too short. Write at least a couple of sentences that answer the question — this is the part a reviewer reads.`);
  }
  if (reflection.length > MAX_REFLECTION) {
    throw err('Your reflection is longer than this box accepts. Trim it to the substance.');
  }
  assertNoConversationDump(reflection);

  const ai_disclosure = input.ai_disclosure ? String(input.ai_disclosure).trim().slice(0, 2000) : null;

  return { artifact_url, project_proof_url, stages_completed: STAGE_ORDER.slice(), reflection, ai_disclosure };
}

/** Read-only status of a student's Claude Studio submission for a card. */
export async function getClaudeStudioStatus(enrollmentId: string, cardId: string): Promise<ClaudeStudioStatus> {
  const row: any = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  const c = row && row.content;
  if (!c || c.kind !== CLAUDE_STUDIO_KIND) {
    return {
      submitted: false, attempt: 0, first_submitted_at: null, last_submitted_at: null,
      artifact_url: null, project_proof_url: null, stages_completed: [], reflection: null,
      verification: null, review_state: null,
    };
  }
  return {
    submitted: true,
    attempt: Number(c.attempt) || 1,
    first_submitted_at: c.first_submitted_at || null,
    last_submitted_at: c.last_submitted_at || null,
    artifact_url: c.artifact_url || null,
    project_proof_url: c.project_proof_url || null,
    stages_completed: Array.isArray(c.stages_completed) ? c.stages_completed : [],
    reflection: c.reflection || null,
    verification: c.verification || null,
    review_state: c.review_state || null,
  };
}

/**
 * Store a Claude Studio submission and complete the card.
 *
 * Returns the resulting status plus `first_submission`, which the UI uses to
 * tell the student honestly that revisions do not add points.
 */
export async function submitClaudeStudio(
  enrollmentId: string,
  cardId: string,
  input: ClaudeStudioSubmission,
) {
  const card: any = await TimelineCard.findByPk(cardId);
  if (!card || !isCardServable(card.visibility)) throw err('Card not available', 404);
  if (card.type !== CLAUDE_STUDIO_TYPE) throw err('This activity does not accept a Claude Studio submission.', 400);

  const clean = validateSubmission(input);
  const now = new Date().toISOString();

  const existing: any = await PortfolioArtifact.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId } });
  const prior = existing && existing.content && existing.content.kind === CLAUDE_STUDIO_KIND ? existing.content : null;
  const attempt = prior ? (Number(prior.attempt) || 1) + 1 : 1;
  const competencies = Array.isArray(card.competencies) ? card.competencies.map((x: any) => x.domain_id || x) : [];

  const content = {
    kind: CLAUDE_STUDIO_KIND,
    week: card.week ?? null,
    studio_title: card.title,
    artifact_url: clean.artifact_url,
    project_proof_url: clean.project_proof_url,
    stages_completed: clean.stages_completed,
    reflection: clean.reflection,
    ai_disclosure: clean.ai_disclosure,
    attempt,
    first_submitted_at: prior?.first_submitted_at || now,
    last_submitted_at: now,
    // Honest about what we did and did not check: the URL's SHAPE was validated,
    // the destination was never fetched. Nothing downstream may upgrade this.
    verification: 'unverified_link',
    // Rubric evaluation is an instructor/assessment workflow; until it runs the
    // state says so rather than implying the work was assessed.
    review_state: 'pending_review',
    competencies,
  };

  const title = `${card.title} — ${new URL(clean.artifact_url).hostname}`.slice(0, 400);
  const summary = `Claude Studio submission for "${card.title}": an Artifact the student built in their own Claude account, with their written reflection. The link was format-checked, not inspected.`;

  let artifact: any;
  if (existing) {
    await existing.update({ kind: CLAUDE_STUDIO_KIND, title, summary, content, competencies });
    artifact = existing;
  } else {
    artifact = await PortfolioArtifact.create({
      enrollment_id: enrollmentId, card_id: cardId, kind: CLAUDE_STUDIO_KIND, title, summary, content, competencies,
    });
  }

  // Completion + points. `onCardCompleted` is idempotent, so a revision runs it
  // again harmlessly and awards nothing further — this is the point-farming
  // guard, and it lives in the progression layer rather than being re-derived here.
  const outcome = await onCardCompleted(enrollmentId, cardId);

  console.log(JSON.stringify({
    timestamp: now, level: 'info', service: 'claude_studio', event: 'studio_submitted',
    outcome: 'success',
    context: { card_id: cardId, week: card.week ?? null, attempt, first_submission: attempt === 1 },
  }));

  return {
    submitted: true,
    attempt,
    first_submission: attempt === 1,
    verification: content.verification,
    review_state: content.review_state,
    artifact: { id: artifact.id, kind: CLAUDE_STUDIO_KIND, title },
    outcome,
  };
}
