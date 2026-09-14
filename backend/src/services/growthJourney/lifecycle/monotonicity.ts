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

  if (previous === rule.terminal) {
    return { state: rule.terminal, held: candidate !== rule.terminal, foreignPrevious: false };
  }
  if (candidate === rule.terminal) {
    return { state: rule.terminal, held: false, foreignPrevious: false };
  }

  const prevRung = rule.ladder.indexOf(previous as S);
  const candRung = rule.ladder.indexOf(candidate);

  if (prevRung !== -1 && candRung !== -1) {
    return candRung >= prevRung
      ? { state: candidate, held: false, foreignPrevious: false }
      : { state: previous as S, held: true, foreignPrevious: false };
  }

  if (rule.commercial.includes(previous as S)) {
    // A commercial state may fall, but not below the knowledge already earned.
    if (candRung !== -1) {
      const floorRung = rule.ladder.indexOf(rule.floor);
      return candRung >= floorRung
        ? { state: candidate, held: false, foreignPrevious: false }
        : { state: rule.floor, held: true, foreignPrevious: false };
    }
    return { state: candidate, held: false, foreignPrevious: false };
  }

  // Previous belongs to no group here: another programme's vocabulary, a legacy
  // value, or a hand edit. Trust the evidence rather than freeze the subject in
  // a state this machine cannot reason about.
  return { state: candidate, held: false, foreignPrevious: true };
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
