import { confirmationKeys, findQuestion, orderedQuestions } from './internshipQuestionBank';

/**
 * The AI recommendation — a reading of the application for a human, and nothing more.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * It is not a decision, not a score, and not a ranking. `internshipStateMachine`
 * makes that structural: `approved` / `rejected` / `waitlisted` are reachable only
 * by the `reviewer` actor, and this module's output is a value object that no
 * transition accepts. Nothing here can admit or reject anyone even if a future
 * caller wanted it to.
 *
 * The design follows `ScholarshipInterview`'s precedent in this repo, whose header
 * says it plainly: it "carries no score, no rank and no eligibility field", because
 * "a reviewer reading six scored attributes starts ranking people against criteria
 * nobody has agreed yet."
 *
 * ── SO WHAT DOES IT PRODUCE? ───────────────────────────────────────────────
 *
 * Three things a reviewer can check for themselves:
 *
 *   1. **Completeness** — what is missing or unresolved. Mechanical, not a judgement.
 *   2. **Contradictions** — where the applicant's own answers disagree with the
 *      stated requirements, each quoting the answer that triggered it. A reviewer
 *      can overrule any of these, and several are legitimately overruleable.
 *   3. **A suggested next action**, with every factor listed. Never a verdict.
 *
 * ── NO INFERRED TRAITS, AND UNRELIABLE DATA IS EXCLUDED ────────────────────
 *
 * "Do not show a hidden personality score or infer protected traits." Nothing here
 * reads tone, sentiment, confidence or personality. And per the contract's
 * reliability rule, a signal whose source is unknown is EXCLUDED from the
 * recommendation rather than treated as zero — an applicant is never penalised for
 * a metric we failed to collect.
 */

export type SuggestedAction =
  | 'ready_for_review'
  | 'needs_more_information'
  | 'human_follow_up_suggested';

export interface RecommendationFactor {
  /** Stable code so the UI can group and the reviewer can recognise repeats. */
  code: string;
  /** One plain sentence a reviewer reads. Never model prose about the person. */
  detail: string;
  severity: 'blocking' | 'attention' | 'note';
  /** The question this came from, when it came from one. */
  question_key?: string;
  /** The applicant's own words, quoted rather than paraphrased. */
  evidence?: string;
}

export interface Recommendation {
  suggested_action: SuggestedAction;
  factors: RecommendationFactor[];
  completeness: {
    total: number;
    resolved: number;
    unresolved_keys: string[];
  };
  /** Sources deliberately left out because they were unreliable or absent. */
  excluded_signals: Array<{ signal: string; reason: string }>;
  /** Always true. Present so a consumer cannot forget. */
  requires_human_decision: true;
}

export interface AnswerView {
  question_key: string;
  answer_text?: string | null;
  answer_value?: unknown;
  state: string;
}

export interface RecommendationInput {
  answers: AnswerView[];
  /** From the application row — collected in Group A, not the interview. */
  attests_not_employed_fulltime: boolean;
  commitment_acknowledged: boolean;
  /**
   * Signals whose reliability we could not establish. Passed in rather than read,
   * so the caller owns the reliability judgement (MetricReliabilityRecord) and this
   * module simply honours it.
   */
  unreliable_signals?: Array<{ signal: string; reason: string }>;
}

const RESOLVED = new Set(['answered', 'confirmed']);

/** Trim an answer to something quotable without dumping a paragraph into a list. */
function quote(text: string | null | undefined, max = 180): string | undefined {
  const t = (text || '').trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * The confirmations that, when answered "no", mean the applicant has told us they
 * cannot meet a stated requirement.
 *
 * These are `blocking` — they must be resolved before a decision — but they are NOT
 * automatic rejections. Someone who says they cannot do 25 hours may be a
 * candidate for a later cohort, and that is a human's call to make.
 */
const REQUIREMENT_CONFIRMATIONS: Record<string, string> = {
  weekly_hours_commitment: 'cannot commit the required 25 hours a week',
  can_attend_meetings: 'cannot attend the required meetings',
  will_notify_absence: 'will not commit to notifying the team before missing a meeting',
  accountable_for_kpis: 'is not prepared to be accountable for project KPIs',
  two_active_projects: 'is not prepared to carry two active projects',
  tools_required_ack: 'does not accept that Claude Code and API usage are required',
  tools_ready_or_will_obtain: 'does not have, and will not obtain, their own Claude Code account and API key',
  tools_secrets_ack: 'has not confirmed they understand never to share credentials',
  costs_understood: 'does not accept the membership and tool costs',
  agrees_to_expectations: 'does not agree to the stated expectations',
};

/**
 * Build the recommendation.
 *
 * Pure. Same input, same output — so what a reviewer was shown is reproducible from
 * the stored answers rather than from a model that may have been re-prompted since.
 */
export function buildRecommendation(input: RecommendationInput): Recommendation {
  const byKey = new Map(input.answers.map((a) => [a.question_key, a]));
  const all = orderedQuestions();
  const factors: RecommendationFactor[] = [];

  // 1. Completeness. Mechanical.
  const unresolved = all
    .filter((q) => {
      const a = byKey.get(q.question_key);
      return !a || !RESOLVED.has(a.state);
    })
    .map((q) => q.question_key);

  for (const key of unresolved) {
    const q = findQuestion(key);
    const a = byKey.get(key);
    factors.push({
      code: a?.state === 'needs_followup' ? 'answer_needs_confirmation' : 'answer_missing',
      detail: a?.state === 'needs_followup'
        ? `"${q?.prompt_form ?? key}" was captured from the call but the applicant has not confirmed it yet.`
        : `"${q?.prompt_form ?? key}" has not been answered.`,
      severity: 'blocking',
      question_key: key,
      evidence: quote(a?.answer_text),
    });
  }

  // 2. Contradictions against stated requirements.
  for (const key of confirmationKeys()) {
    const a = byKey.get(key);
    if (!a || !RESOLVED.has(a.state)) continue;      // covered by completeness
    if (a.answer_value !== false) continue;

    factors.push({
      code: 'requirement_not_met',
      detail: `The applicant says they ${REQUIREMENT_CONFIRMATIONS[key] ?? `answered no to "${key}"`}.`,
      severity: 'blocking',
      question_key: key,
      evidence: quote(a.answer_text),
    });
  }

  // 3. The eligibility gate, cross-checked against what they said in the interview.
  //
  // AI_INTERNSHIP_SPEC.md makes "not currently employed full-time" a hard
  // eligibility gate; the interview asks employment status as an open question. When
  // the two disagree, that is exactly the kind of thing a human must look at, and
  // exactly the kind of thing that must never auto-reject.
  const employment = byKey.get('employment_status');
  if (employment && RESOLVED.has(employment.state) && employment.answer_value === 'full_time') {
    factors.push({
      code: 'employed_full_time',
      detail: 'The applicant says they are employed full time. The programme requires that they are not.',
      severity: 'blocking',
      question_key: 'employment_status',
      evidence: quote(employment.answer_text),
    });
  }
  if (employment?.answer_value === 'full_time' && input.attests_not_employed_fulltime) {
    factors.push({
      code: 'attestation_conflicts_with_interview',
      detail: 'The form attestation says they are not employed full time, but the interview answer says they are. These disagree.',
      severity: 'blocking',
      question_key: 'employment_status',
    });
  }

  if (!input.attests_not_employed_fulltime) {
    factors.push({
      code: 'attestation_missing',
      detail: 'The applicant has not attested that they are not employed full time.',
      severity: 'blocking',
    });
  }
  if (!input.commitment_acknowledged) {
    factors.push({
      code: 'commitment_not_acknowledged',
      detail: 'The applicant has not acknowledged the time and attendance commitment.',
      severity: 'attention',
    });
  }

  // 4. Answers that are present but thin. `note` only — brevity is not a defect,
  // and a reviewer may well read a short answer and be satisfied.
  for (const q of all) {
    if (q.answer_type !== 'long_text') continue;
    const a = byKey.get(q.question_key);
    if (!a || !RESOLVED.has(a.state)) continue;
    const len = (a.answer_text || '').trim().length;
    if (len > 0 && len < 40) {
      factors.push({
        code: 'brief_answer',
        detail: `"${q.prompt_form}" was answered very briefly.`,
        severity: 'note',
        question_key: q.question_key,
        evidence: quote(a.answer_text),
      });
    }
  }

  const blocking = factors.filter((f) => f.severity === 'blocking');
  const suggested_action: SuggestedAction = unresolved.length > 0
    ? 'needs_more_information'
    : blocking.length > 0
      ? 'human_follow_up_suggested'
      : 'ready_for_review';

  return {
    suggested_action,
    factors,
    completeness: {
      total: all.length,
      resolved: all.length - unresolved.length,
      unresolved_keys: unresolved,
    },
    excluded_signals: input.unreliable_signals ?? [],
    requires_human_decision: true,
  };
}
