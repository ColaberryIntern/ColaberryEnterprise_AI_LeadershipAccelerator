import { ASSESSMENT_STATUSES, AssembledEvidence, LlmAssessmentJudgment, ROOT_CAUSES } from './types';
import { StudentAssessmentRootCause, StudentAssessmentStatus } from '../../models/StudentAssessment';

const MAX_UNANSWERED_QUESTIONS = 5;
const MAX_INTERVENTION_LENGTH = 600;

/**
 * The LLM is shown ONLY the pre-vetted 'known' evidence (never excluded/
 * quarantined data) and asked to interpret it against a fixed enum, never
 * to author new facts. It cites which of the categories it was given
 * support/contradict its conclusion — code maps those category keys back to
 * the real, deterministically-built EvidenceCitation objects (see index.ts),
 * so no evidence text in the stored record is ever LLM-authored.
 */
export function buildAssessmentSystemPrompt(): string {
  return `You are assisting an AI mentor's student health assessment. You will be given a student's real, verified evidence (never invented). Your job is to interpret it, not to add facts.

Rules (non-negotiable):
- Use ONLY the evidence provided. Never reference anything not listed.
- If the evidence is genuinely mixed or you cannot support a specific status, return "unknown" rather than guessing.
- primaryRootCause/secondaryRootCause must come only from the given enum, or be null.
- supportingCategories/contradictingCategories must be category keys taken only from the list you were given.
- Respond with STRICT JSON only, matching this exact shape:
{
  "status": "on_track" | "watch" | "at_risk" | "critical" | "unknown",
  "primaryRootCause": string | null,
  "secondaryRootCause": string | null,
  "supportingCategories": string[],
  "contradictingCategories": string[],
  "unansweredQuestions": string[],
  "recommendedIntervention": string | null,
  "requiresHumanReview": boolean
}

Valid root causes: ${ROOT_CAUSES.join(', ')}.`;
}

export function buildAssessmentUserPrompt(evidence: AssembledEvidence): string {
  const lines = evidence.usable.map((e) => `- ${e.category}: ${e.summary}`);
  const excludedLines = evidence.excluded.map((e) => `- ${e.category}: excluded (${e.status}${e.reliabilityReason ? `: ${e.reliabilityReason}` : ''})`);
  return [
    'Known, usable evidence for this student:',
    ...lines,
    '',
    'Evidence NOT available (excluded — do not reference, do not assume the opposite):',
    ...excludedLines,
    '',
    `Positive momentum already confirmed: ${evidence.positiveMomentumSignals.length ? evidence.positiveMomentumSignals.join(', ') : 'none confirmed'}.`,
  ].join('\n');
}

function isValidRootCause(v: unknown): v is StudentAssessmentRootCause {
  return typeof v === 'string' && (ROOT_CAUSES as string[]).includes(v);
}

function isValidStatus(v: unknown): v is StudentAssessmentStatus {
  return typeof v === 'string' && (ASSESSMENT_STATUSES as string[]).includes(v);
}

/**
 * Defensive parsing — chatJson() itself already collapses any unparseable
 * LLM output to `{}` (see runtimeAi.ts), so `{}` and a genuinely malformed
 * shape are indistinguishable here; both must degrade to a safe 'unknown'
 * judgment, never a fabricated status. Every field is independently
 * validated against the real enums/category list — a hallucinated or
 * out-of-contract value is dropped, not trusted.
 */
export function parseAssessmentResponse(parsed: any, evidence: AssembledEvidence): LlmAssessmentJudgment {
  const knownCategories = new Set(evidence.usable.map((e) => e.category));
  const fallback: LlmAssessmentJudgment = {
    status: 'unknown', primaryRootCause: null, secondaryRootCause: null,
    supportingCategories: [], contradictingCategories: [],
    unansweredQuestions: ['Assessment generation did not return a usable result.'],
    recommendedIntervention: null, requiresHumanReview: true,
  };

  if (!parsed || typeof parsed !== 'object' || !isValidStatus(parsed.status)) {
    return fallback;
  }

  const supportingCategories = Array.isArray(parsed.supportingCategories)
    ? parsed.supportingCategories.filter((c: unknown) => typeof c === 'string' && knownCategories.has(c as any))
    : [];
  const contradictingCategories = Array.isArray(parsed.contradictingCategories)
    ? parsed.contradictingCategories.filter((c: unknown) => typeof c === 'string' && knownCategories.has(c as any))
    : [];
  const unansweredQuestions = Array.isArray(parsed.unansweredQuestions)
    ? parsed.unansweredQuestions.filter((q: unknown) => typeof q === 'string' && q.trim().length > 0).slice(0, MAX_UNANSWERED_QUESTIONS)
    : [];
  const recommendedIntervention = typeof parsed.recommendedIntervention === 'string' && parsed.recommendedIntervention.trim()
    ? parsed.recommendedIntervention.trim().slice(0, MAX_INTERVENTION_LENGTH)
    : null;

  // Deterministic safety net: a critical/at_risk call always requires human
  // review, regardless of what the model itself claims — never let the LLM
  // silently wave off a high-severity case.
  const requiresHumanReview = parsed.status === 'critical' || parsed.status === 'at_risk'
    ? true
    : typeof parsed.requiresHumanReview === 'boolean' ? parsed.requiresHumanReview : false;

  return {
    status: parsed.status,
    primaryRootCause: isValidRootCause(parsed.primaryRootCause) ? parsed.primaryRootCause : null,
    secondaryRootCause: isValidRootCause(parsed.secondaryRootCause) ? parsed.secondaryRootCause : null,
    supportingCategories,
    contradictingCategories,
    unansweredQuestions,
    recommendedIntervention,
    requiresHumanReview,
  };
}

