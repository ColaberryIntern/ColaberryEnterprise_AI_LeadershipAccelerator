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

export interface TriageResult {
  verdict: TriageVerdict;
  severity: TriageSeverity | null;
  concerns: TriageConcern[];
  /** Set when the verdict is `error`, so a failure is countable by class. */
  errorClass?: string | null;
}

/** The prompt is the load-bearing part of this process, so it is versioned. */
export const TRIAGE_PROMPT_VERSION = 'v1-adversarial';

/** The reviewer. A different model family from the author, which is the point. */
export const TRIAGE_MODEL = 'gpt-4o-mini';

/** Verdicts that put an item in front of a human. */
export function needsHuman(verdict: TriageVerdict): boolean {
  // An `error` is NOT quietly dropped. A question the reviewer could not read is
  // a question nobody has looked at, and silently treating that as "fine" would
  // be the exact failure this whole process is built to avoid.
  return verdict === 'needs_human' || verdict === 'error';
}
