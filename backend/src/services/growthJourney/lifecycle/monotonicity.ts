/**
 * The one monotonicity rule, shared by every journey lifecycle (Phase 3 T308).
 *
 * ─── WHY THIS IS EXTRACTED RATHER THAN COPIED ───────────────────────────────
 *
 * T307 argued that a learner's progress and a buyer's progress are the same
 * problem in different vocabularies, and that a second discipline would mean two
 * places to get monotonicity wrong. T308 adds a third vocabulary — nine AI
 * Flotation states — so that argument now has to be honoured in code rather than
 * in a comment: both machines call this, and there is one ladder rule in the
 * codebase instead of two that agree today.
 *
 * Explorer's own `applyMonotonicity` stays where it is. It predates this phase,
 * its tests pin it byte-for-byte, and rewriting it to call this would be a
 * refactor of a live learner path for a tidiness gain — exactly the kind of
 * change this run is not allowed to make.
 *
 * ─── THE THREE GROUPS, AND THE FLOOR ────────────────────────────────────────
 *
 *   * `ladder` — knowledge. Never steps down. Index position is the rule.
 *   * `commercial` — a deal. May regress, but never below `floor`, because the
 *     deal cooling does not un-learn what was learned about the buyer.
 *   * `terminal` — nothing demotes it, and nothing overrides arriving at it.
 *
 * ─── A PREVIOUS STATE THIS MACHINE DOES NOT OWN ─────────────────────────────
 *
 * `growth_journey_profiles.state` is one column shared by every programme, so a
 * mis-routed subject really can arrive carrying another programme's state, and a
 * hand-edited row can carry anything at all. Such a state is in no group here,
 * so it CANNOT be held: the answer falls through to what the current evidence
 * supports. Holding an unrecognised state would write a value from one
 * programme's vocabulary into another's projection and freeze the subject there.
 *
 * T307's verifier found this behaviour correct and unpinned. It is pinned now,
 * once, for every machine that uses this.
 *
 * `foreignPrevious` means exactly what the field says and nothing wider: the
 * previous state is in NO group this machine knows. It is a fact about the
 * previous state alone, so it is computed once rather than per branch, and it
 * holds in both directions - a state the machine owns is never reported foreign
 * whatever the candidate, and a state it does not own is always reported so.
 *
 * Both halves were learned the hard way, by two independent reviews of the same
 * function. The first draft reported a knowledge rung as foreign whenever the
 * candidate left the ladder - the commonest transition there is - writing a false
 * sentence about a programme boundary into the audit trail. The fix for that
 * still left the terminal-candidate return hard-coding `false`, so a subject
 * promoted straight to the terminal lost the fact entirely. Both times the
 * projected state was correct, which is exactly why a passing suite did not see
 * it: `state` is what tests assert on, and `evidence` is what a human reads.
 */

export interface MonotonicityRule<S extends string> {
  /** Weakest to strongest. Index position IS the rule. */
  ladder: readonly S[];
  /** May regress, never below `floor`. */
  commercial: readonly S[];
  /** Nothing demotes this, and arriving at it overrides everything. */
  terminal: S;
  /** The rung a regressing commercial state cannot fall below. */
  floor: S;
}

export interface MonotonicityResult<S extends string> {
  state: S;
  /** True when the previous state was kept because the candidate was weaker. */
  held: boolean;
  /** Set when the previous state belongs to no group this machine knows. */
  foreignPrevious: boolean;
}

export function applyLadderMonotonicity<S extends string>(
  candidate: S,
  previous: string | null | undefined,
  rule: MonotonicityRule<S>,
): MonotonicityResult<S> {
  if (!previous) return { state: candidate, held: false, foreignPrevious: false };

  const prevRung = rule.ladder.indexOf(previous as S);
  const candRung = rule.ladder.indexOf(candidate);

  // `foreignPrevious` is a fact about PREVIOUS ALONE, so it is settled here, once,
  // before any branch looks at the candidate. Deciding it per branch is what let
  // two branches disagree with the rest: the first draft reported a rung this
  // machine owns as foreign whenever the candidate left the ladder, and the fix
  // for that still left the terminal-candidate return hard-coding `false`, so a
  // subject promoted straight to the terminal carried no trace that its previous
  // value came from another programme. Computed once, the branch structure below
  // decides only `state` and `held`, and neither mistake can be expressed.
  const foreignPrevious =
    prevRung === -1 && previous !== rule.terminal && !rule.commercial.includes(previous as S);

  if (previous === rule.terminal) {
    return { state: rule.terminal, held: candidate !== rule.terminal, foreignPrevious };
  }
  if (candidate === rule.terminal) {
    return { state: rule.terminal, held: false, foreignPrevious };
  }

  if (prevRung !== -1 && candRung !== -1) {
    return candRung >= prevRung
      ? { state: candidate, held: false, foreignPrevious }
      : { state: previous as S, held: true, foreignPrevious };
  }

  if (rule.commercial.includes(previous as S)) {
    // A commercial state may fall, but not below the knowledge already earned.
    if (candRung !== -1) {
      const floorRung = rule.ladder.indexOf(rule.floor);
      return candRung >= floorRung
        ? { state: candidate, held: false, foreignPrevious }
        : { state: rule.floor, held: true, foreignPrevious };
    }
    return { state: candidate, held: false, foreignPrevious };
  }

  // What is left is a previous state on this machine's ladder with a candidate
  // that has left it - the ordinary move into a commercial state - or a value
  // this machine does not recognise at all. Either way the answer is the current
  // evidence rather than freezing the subject in a state it cannot reason about,
  // and `foreignPrevious` already says which of the two happened.
  return { state: candidate, held: false, foreignPrevious };
}

/**
 * `state_entered_at` moves ONLY on a real change.
 *
 * Every duration rule reads it, so a re-run that reaches the same state must not
 * reset the clock — otherwise a stalled subject looks fresh every night and no
 * duration-based overlay ever fires.
 */
export function settleEnteredAt(
  state: string,
  previous: { state: string | null; state_entered_at: Date | null },
  asOf: Date,
): Date {
  const unchanged = previous.state === state && previous.state_entered_at !== null;
  return unchanged ? (previous.state_entered_at as Date) : asOf;
}
