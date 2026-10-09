import { bucket } from '../../explorerGrowth/explorerExperimentService';
import { HUMAN_IN_THE_LOOP_ACTIONS, NON_SEND_ACTIONS } from '../governor/actionVocabulary';
import type { JourneyCandidate } from '../governor/types';

/**
 * Which journey candidate may be held back, and which arm a subject is in
 * (Phase 6, T608).
 *
 * ─── THE ELIGIBILITY LIST IS CODE, NOT CONFIGURATION ────────────────────────
 *
 * Explorer's experiment service states the rule this module inherits, and
 * enforces it the same way: "No learner is ever withheld from a message that
 * helps them with a problem they are actually having. Withholding a
 * payment-failure recovery to measure lift is not an experiment, it is
 * negligence. Only PROMOTIONAL interventions are eligible." Its allowlist is
 * deliberate, and its comment says why: "A denylist would mean the failure mode
 * of forgetting is 'silently experiment on it'."
 *
 * The plan for this task put journey eligibility in the policy row's
 * `settings.candidate_types` - operator-authored data. That inverts the rule:
 * an operator could name the enrolment-blocked notice, or a clarification
 * question, and the journey would withhold it. So the allowlist lives HERE, in
 * code, and `candidate_types` may only NARROW it - the same "may narrow, never
 * widen" shape T607 used for the shadow-runs agent filter. A journey action
 * type that nobody has deliberately made eligible cannot be withheld, and the
 * cost of forgetting is a lost experiment rather than a person left without
 * something they needed.
 *
 * ─── AND IT KEYS ON WHAT THE MESSAGE IS ABOUT, NOT ITS CHANNEL ──────────────
 *
 * The journey reuses Explorer's `Candidate` verbatim, so its action types are
 * `SEND_EMAIL`, `SHOW_IN_APP_NUDGE`, `RECOMMEND_LESSON`, `CREATE_HUMAN_TASK`,
 * `SEND_ALI_OUTREACH`, `WAIT` and `SUPPRESS_CONTACT`. `SEND_EMAIL` alone says
 * nothing about whether a message is promotional: the same action type carries
 * a case study and a clarification question. So eligibility is decided by the
 * candidate's declared content purpose (`required_assets[].asset_type`), which
 * is what the message is ABOUT:
 *
 *   - `capability_education` and `case_study` are promotional content. Eligible.
 *   - `clarification_question` is the AI asking the person something. Withholding
 *     it strands them mid-conversation, so it is NOT eligible, even though it is
 *     the same action type as a case study.
 *   - A candidate that declares NO asset (a flow email keyed by campaign only)
 *     has no stated purpose, so it fails closed.
 *   - Every declared purpose must be eligible. A mixed-purpose candidate fails
 *     closed rather than being judged on its first asset.
 *
 * `CREATE_HUMAN_TASK` and `SEND_ALI_OUTREACH` are excluded outright: a handoff
 * to a human is help, not promotion. `WAIT` and `SUPPRESS_CONTACT` are excluded
 * because there is nothing to withhold.
 *
 * ─── THE BUCKET IS IMPORTED, NEVER COPIED ───────────────────────────────────
 *
 * `bucket(experimentKey, subjectRef)` is Explorer's FNV-1a, imported above. Its
 * own comment is the reason it must not be re-implemented: the key is part of
 * the hash so a subject's position is independent per experiment, and it is
 * "NOT `Math.random()`, and not derived from a clock" - "a learner who lands in
 * control on Monday and treatment on Tuesday is in both arms, which does not
 * merely add noise". The journey passes `subject_ref` where Explorer passes an
 * enrolment id; both are stable identifiers for the life of an experiment.
 */

export type JourneyArm = 'treatment' | 'control';

/** The content purposes that may be withheld. Code-authored allowlist; see the header. */
export const JOURNEY_HOLDOUT_PURPOSES = ['capability_education', 'case_study'] as const;

export interface ArmInput {
  experimentKey: string;
  subjectRef: string;
  /** Must be in `(0, 0.5]`. Validated by the policy schema AND re-checked here - see `assignJourneyArm`. */
  controlShare: number;
  candidate: JourneyCandidate;
  /** The policy's optional narrowing of the code allowlist. Absent means "the whole allowlist". */
  candidateTypes?: readonly string[];
}

/**
 * Can this candidate be withheld at all? Fail-closed at every branch.
 *
 * Exported because the governor records WHY a candidate was not experimented on,
 * and because a test that could only ask "is it eligible" through a full
 * decision would not be able to enumerate the branches.
 */
export function isJourneyHoldoutEligible(candidate: JourneyCandidate, candidateTypes?: readonly string[]): boolean {
  const action = candidate.action_type;
  if (HUMAN_IN_THE_LOOP_ACTIONS.has(action) || NON_SEND_ACTIONS.has(action)) return false;
  // The policy may narrow the allowlist by action type, never widen it.
  if (candidateTypes && !candidateTypes.includes(action)) return false;
  const purposes = candidate.required_assets.map((q) => String((q as { asset_type?: unknown }).asset_type ?? ''));
  if (purposes.length === 0) return false;
  return purposes.every((p) => (JOURNEY_HOLDOUT_PURPOSES as readonly string[]).includes(p));
}

/**
 * The arm, or `null` when this candidate may not be experimented on at all.
 *
 * `null` is not "treatment": a caller that treated it as one would put every
 * ineligible candidate in the measured arm and compare it against a control
 * that never contained any. The governor branches on the arm being exactly
 * `'control'`, so `null` leaves the decision untouched.
 */
export function assignJourneyArm(input: ArmInput): JourneyArm | null {
  if (!isJourneyHoldoutEligible(input.candidate, input.candidateTypes)) return null;
  // The bound is re-checked HERE, not just trusted from the policy schema, for the reason Explorer's
  // own `assignArm` gives for doing the same: "the caller's judgment is exercised at 3am by a cron".
  // `control_share` is the one parameter that decides how many people get withheld, and a share
  // outside `(0, 0.5]` - from a hand-edited JSONB, a future caller, a refactor that drops the schema -
  // must not be able to hold anyone back. Out of bounds means TREATMENT: nobody is withheld.
  const share = input.controlShare;
  if (!Number.isFinite(share) || share <= 0 || share > 0.5) return 'treatment';
  return bucket(input.experimentKey, input.subjectRef) < share ? 'control' : 'treatment';
}
