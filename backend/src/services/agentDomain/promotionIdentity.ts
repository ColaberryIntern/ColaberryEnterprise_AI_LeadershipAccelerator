/**
 * Who counts as a human, for promotion purposes.
 *
 * ## Why this is its own module
 *
 * `promotionCriteria.ts` was 515 lines against CLAUDE.md's 500-line hard ceiling, with
 * `evaluatePromotion` at 150 against the 100-line one, so the rule is that the next change splits
 * before adding. The identity question is the natural seam: it is one concern, it was spread
 * across a frozen regex, two helpers and three inline checks, and pulling it out is what finally
 * gives the THRESHOLD check access to the allowlist.
 *
 * ## The hole this module exists to close
 *
 * `isThresholdAccepted` was a standalone pure function over a single threshold. It had no access
 * to the attempt, so it could only ever consult the DENYLIST -- and a denylist cannot establish
 * that an identity is a person. The allowlist (`recorded_human_approvers`) was applied to the
 * approver and to evidence evaluators, and never to the acceptor of the quality threshold the
 * whole promotion rests on.
 *
 * An independent verifier walked straight through it. With the human gate fully ON and every other
 * field legitimate, varying only `thresholds[0].accepted_by`:
 *
 *     refused    "system:auto_approve_timeout"   (prefix matched)
 *     refused    "auto-approve"                  (literal matched)
 *     PROMOTED   "auto-approval"                 <- ONE LETTER off the production identity
 *     PROMOTED   "approval_timer"
 *     PROMOTED   "4-hour timer"
 *     PROMOTED   "timeout handler"
 *     PROMOTED   "the scheduler"
 *     PROMOTED   "nightly cron"
 *     PROMOTED   "approvalTimeoutWorker"
 *     PROMOTED   "robot"
 *     PROMOTED   "daemon"
 *     PROMOTED   "Mallory"
 *
 * `Mallory` is the one that settles it: the suite already asserts Mallory is refused AS AN
 * APPROVER because a denylist cannot establish humanity. The same unrecorded identity was a
 * perfectly valid acceptor of the threshold one field over. The regex was never going to be the
 * answer -- enumerating machine names is the losing half of this problem.
 *
 * ## Absence is not acceptance
 *
 * This is the FOURTH instance of that mistake in this subsystem: an empty `signals` array, an
 * empty `thresholds` list, an omitted `proposed_by`, and now an omitted `recorded_human_approvers`
 * degrading every allowlist check back to the denylist. `humanityCheck` therefore reports whether
 * it HAS a roster, so callers can refuse the no-roster case explicitly instead of silently
 * falling back to the weaker test.
 */

/**
 * Identities that are definitely not people.
 *
 * Kept as the FIRST of two gates, not the only one. It catches the obvious machine shapes early
 * and gives a specific refusal reason; the allowlist is what actually establishes humanity.
 */
export const NON_HUMAN_APPROVER =
  /^(system|agent|bot|cron|scheduler|service|automation|ai|llm):|auto[_ -]?approve|timeout$|^(claude|gpt|gemini|copilot|assistant|autonomous|the agent|automation)\b/i;

/**
 * Normalise for comparison: a trailing space is not a different signal.
 *
 * Zero-width characters are stripped FIRST, because \`\s` does not match them and a verifier
 * defeated `self_evaluated` with a U+200B inside an otherwise-identical name. An invisible
 * character is the cheapest way to make two equal strings compare unequal.
 *
 * NOTE: the character class below is written as ESCAPE SEQUENCES on purpose. An earlier draft of
 * this file was produced by a tool that decoded them into RAW zero-width bytes -- which still
 * matched, but was invisible in the source and in every diff.
 */
export function norm(v: unknown): string {
  return String(v ?? '')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Does this identity fail to stand as a human approval?
 *
 * Semantics preserved EXACTLY from the original in-module version: an EMPTY identity is
 * non-human (absence is not approval), and the regex is tested against the RAW trimmed value
 * rather than the normalised one. Switching to norm() here would have changed behaviour for
 * whitespace-collapsed inputs while moving code that was supposed to move unchanged.
 */
export function isNonHumanIdentity(identity: unknown): boolean {
  const v = String(identity ?? '').trim();
  return v.length === 0 || NON_HUMAN_APPROVER.test(v);
}

export interface HumanityCheck {
  /** False when no recorded set was supplied. Callers must refuse rather than fall back. */
  readonly hasRoster: boolean;
  /** True when the identity is a known machine OR is not on the recorded roster. */
  isNotHuman(identity: unknown): boolean;
}

/**
 * Build the humanity predicate for one promotion attempt.
 *
 * The denylist and the allowlist answer different questions and both are needed: the denylist
 * gives a precise reason for an obvious machine, the allowlist is the only thing that can
 * establish that an identity belongs to a recorded person.
 */
export function humanityCheck(
  recorded: ReadonlyArray<string> | undefined | null,
): HumanityCheck {
  const roster = (recorded ?? []).map(norm).filter((x) => x.length > 0);
  return {
    hasRoster: roster.length > 0,
    isNotHuman(identity: unknown): boolean {
      if (isNonHumanIdentity(identity)) return true;
      // With no roster this cannot answer the question, so it reports "not established".
      // The caller refuses on `hasRoster === false` rather than treating absence as a pass.
      if (roster.length === 0) return false;
      return !roster.includes(norm(identity));
    },
  };
}

/** The minimum shape `isThresholdAccepted` needs, so this module does not import back. */
export interface AcceptedThresholdShape {
  readonly state: string;
  readonly accepted_by?: string | null;
  readonly accepted_at?: string | null;
}

/**
 * Is this threshold's acceptance well-formed and not obviously a machine?
 *
 * SHAPE AND DENYLIST ONLY. This deliberately does NOT answer "is the acceptor a recorded human" --
 * it has no roster, and pretending otherwise is what made the hole above. `evaluatePromotion`
 * applies the allowlist, because only it holds the attempt.
 */
export function isThresholdAccepted(t: AcceptedThresholdShape): boolean {
  return t.state === 'accepted'
    && typeof t.accepted_by === 'string' && t.accepted_by.trim().length > 0
    && typeof t.accepted_at === 'string' && t.accepted_at.trim().length > 0
    && !isNonHumanIdentity(t.accepted_by);
}
