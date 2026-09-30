/**
 * The vocabulary of a triage verdict, in one place so the service, the runner,
 * the report and the tests cannot drift apart on what a word means.
 *
 * A LEAF MODULE. It imports nothing. The whole point of this feature is that a
 * machine opinion never becomes an approval, and the cheapest way to keep that
 * true is for the module defining the opinion to have no access to anything that
 * could act on it.
 *
 * ── WHY THERE IS NO `pass` OR `approved` MEMBER ──────────────────────────────
 * The verdicts below are deliberately not a grade. `no_concerns` is the strongest
 * thing this process can say and it means only "the reviewer raised no
 * objection". That is a fact about the reviewer, not about the question, and the
 * words were chosen so that nobody reading a database row, a log line or an
 * email can mistake one for the other. A member called `pass` would have been
 * read as clearance within a week.
 */

/** What the reviewer concluded. Not a grade. */
export type TriageVerdict =
  /** The reviewer raised no objection. NOT "checked by a person". */
  | 'no_concerns'
  /** The reviewer found something a human should adjudicate. */
  | 'needs_human'
  /** The reviewer could not answer: timeout, refusal, unparseable response. */
  | 'error';

/** How much of a human's limited attention this item deserves first. */
export type TriageSeverity = 'low' | 'medium' | 'high';

/**
 * One thing the reviewer thinks is wrong, in the reviewer's own words.
 *
 * `option` names the option the concern is about when there is one, which is
 * what makes a concern actionable: "B is also defensible" can be adjudicated,
 * "this question seems weak" cannot.
 */
export interface TriageConcern {
  kind:
    | 'defensible_distractor'   // a wrong option is arguably right
    | 'ambiguous_stem'          // the question can be read two ways
    | 'factual_error'           // something asserted is untrue
    | 'answer_disputed'         // the reviewer thinks the key is wrong
    | 'outdated'                // true once, not now
    | 'other';
  option: string | null;
  detail: string;
}

/**
 * What a reader who has NOT seen the key chose. Independent evidence, unlike
 * an argument constructed after seeing the answer.
 */
export interface BlindRead {
  answer: string;
  confidence: 'sure' | 'close' | 'guess';
  runner_up: string | null;
  why: string;
  /** Whether `answer` is one of the marked correct keys. */
  agrees: boolean;
}

export interface TriageResult {
  verdict: TriageVerdict;
  severity: TriageSeverity | null;
  concerns: TriageConcern[];
  /** Set when the verdict is `error`, so a failure is countable by class. */
  errorClass?: string | null;
  /** The blind read, when the review ran one; null when that call failed. */
  blind?: BlindRead | null;
}

/**
 * The prompt is the load-bearing part of this process, so it is versioned — and
 * this is the version that proved why.
 *
 * v1-adversarial asked the reviewer to argue against every answer and then
 * decide. It flagged 3 of the first 3 questions on production, with concerns
 * that conceded the author's point and objected anyway. An objection can be
 * constructed against any question ever written, so a reviewer that reports its
 * argument instead of its judgement flags everything, and a report that flags
 * everything is indistinguishable from no triage.
 *
 * v2-argument-wins separates the two: state the argument, then judge whether it
 * DEFEATS the answer, and only flag when it does. Because this constant is part
 * of the triage table's unique key, a v2 run is a new opinion rather than a
 * duplicate suppressed against v1's rows — which is the reason that column is in
 * the key at all.
 *
 * v3-blind-then-argue. On 2026-09-14, v2 over a bank that passed every shape
 * check flagged 53 of 100 items, every one medium, every one
 * `defensible_distractor`, every one phrased "could be seen as" or "a valid
 * alternative" — the hedged form the prompt says LOSES. A reviewer asked to
 * judge its own argument is not independent of it. So the review now starts
 * with a different kind of evidence: the reviewer ANSWERS THE QUESTION without
 * seeing the key. A reader who picks a different option is a finding on its
 * own (high, `answer_disputed`). Only when the blind read agrees does the
 * argue-against step run, and an argument the blind read did not share is
 * recorded at LOW - on the record, not on the reading list. The reading list
 * is what a person would actually get wrong.
 */
export const TRIAGE_PROMPT_VERSION = 'v3-blind-then-argue';

/**
 * The blind read wants the strongest reader available, because it stands in
 * for a competent candidate; a weak reader would dispute hard items it simply
 * could not answer. The argue-against step keeps the cheaper model - its job
 * is to construct an objection, which does not need the stronger one.
 */
export const BLIND_MODEL = 'gpt-4o';

/** The reviewer. A different model family from the author, which is the point. */
export const TRIAGE_MODEL = 'gpt-4o-mini';

/** Verdicts that put an item in front of a human. */
export function needsHuman(verdict: TriageVerdict): boolean {
  // An `error` is NOT quietly dropped. A question the reviewer could not read is
  // a question nobody has looked at, and silently treating that as "fine" would
  // be the exact failure this whole process is built to avoid.
  return verdict === 'needs_human' || verdict === 'error';
}
