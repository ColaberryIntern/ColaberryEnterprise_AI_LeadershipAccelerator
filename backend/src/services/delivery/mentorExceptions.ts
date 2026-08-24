/**
 * mentorExceptions — what pulls a mentor in. PURE, no I/O.
 *
 * Master plan §Gate 11: *"Mentor sees exceptions."* Six of them:
 *
 *   failed trust/security gate · first client review · builder overloaded ·
 *   high rework · architecture concern · release ready
 *
 * ## Exceptions, not a dashboard
 *
 * A mentor who is shown everything sees nothing. The list above is short on purpose, and
 * each entry is a moment where a person's attention changes the outcome — not a metric
 * that happens to be interesting. This module computes those moments from state rather
 * than requiring anyone to notice them.
 *
 * ## Two of these are opportunities, not problems
 *
 * `first_client_review` and `release_ready` fire on *good* events. A mentor system that
 * only surfaces failure trains people to hide things, and it also misses the two moments
 * where a mentor is most useful: before someone's first exposure to a client, and at the
 * point where shipping becomes irreversible. Severity is therefore separate from urgency —
 * an opportunity can be urgent without anything being wrong.
 */

export type MentorExceptionKind =
  | 'failed_trust_or_security_gate'
  | 'first_client_review'
  | 'builder_overloaded'
  | 'high_rework'
  | 'architecture_concern'
  | 'release_ready';

export const MENTOR_EXCEPTION_KINDS: readonly MentorExceptionKind[] = [
  'failed_trust_or_security_gate',
  'first_client_review',
  'builder_overloaded',
  'high_rework',
  'architecture_concern',
  'release_ready',
];

/** Whether the exception is a problem or an opportunity. Both can be urgent. */
export type MentorExceptionNature = 'problem' | 'opportunity';

export const EXCEPTION_NATURE: Record<MentorExceptionKind, MentorExceptionNature> = {
  failed_trust_or_security_gate: 'problem',
  first_client_review: 'opportunity',
  builder_overloaded: 'problem',
  high_rework: 'problem',
  architecture_concern: 'problem',
  release_ready: 'opportunity',
};

export interface MentorException {
  kind: MentorExceptionKind;
  nature: MentorExceptionNature;
  /** Said to the mentor, in one line, without them having to open anything. */
  detail: string;
  urgent: boolean;
}

/**
 * Thresholds, named and in one place.
 *
 * Kept as constants rather than inlined so the values are arguable in review. Each is a
 * starting point chosen to be defensible, not measured — no delivery has run yet, so
 * claiming these are tuned would be a fabrication. They are expected to move once there is
 * data, and `DEFAULT_THRESHOLDS` being overridable per call is how that happens without a
 * code change.
 */
export interface MentorThresholds {
  /** Concurrent in-flight stories above which a builder is considered overloaded. */
  maxConcurrentStories: number;
  /** Share of stories returned for rework above which rework is "high". */
  reworkRateThreshold: number;
  /** Minimum completed stories before a rework rate means anything at all. */
  minStoriesForReworkSignal: number;
}

export const DEFAULT_THRESHOLDS: MentorThresholds = {
  maxConcurrentStories: 4,
  reworkRateThreshold: 0.3,
  minStoriesForReworkSignal: 5,
};

export interface BuilderState {
  builderIdentityId: string;
  /** Stories currently assigned and not finished. */
  concurrentStories: number;
  /** Stories completed by this builder, ever. */
  completedStories: number;
  /** Of those, how many were sent back for rework. */
  reworkedStories: number;
  /** True when this builder has never been in a client review before. */
  hasClientReviewExperience: boolean;
  /** A client review is scheduled or has just opened. */
  clientReviewPending: boolean;
  /** Trust gate or security scan currently failing on their work. */
  trustOrSecurityGateFailing: boolean;
  /** An architecture decision of theirs is flagged, or drift was detected. */
  architectureConcernRaised: boolean;
  /** A release they directed has passed its quality gate and awaits approval. */
  releaseAwaitingApproval: boolean;
}

/**
 * Compute the exceptions a mentor should see for one builder.
 *
 * Returns every exception that applies rather than the most important one. A mentor
 * deciding where to spend an hour needs the whole picture; ranking it down to one item
 * here would make that decision on their behalf with less context than they have.
 */
export function mentorExceptionsFor(
  state: BuilderState,
  thresholds: MentorThresholds = DEFAULT_THRESHOLDS,
): MentorException[] {
  const exceptions: MentorException[] = [];
  const add = (kind: MentorExceptionKind, detail: string, urgent: boolean) =>
    exceptions.push({ kind, nature: EXCEPTION_NATURE[kind], detail, urgent });

  if (state.trustOrSecurityGateFailing) {
    add(
      'failed_trust_or_security_gate',
      'A trust or security gate is failing on their work.',
      true,
    );
  }

  // Before, not after. A mentor arriving after a builder's first client review has missed
  // the moment where they could have changed how it went.
  if (state.clientReviewPending && !state.hasClientReviewExperience) {
    add('first_client_review', 'Their first client review is coming up.', true);
  }

  if (state.concurrentStories > thresholds.maxConcurrentStories) {
    add(
      'builder_overloaded',
      `Carrying ${state.concurrentStories} concurrent stories ` +
        `(threshold ${thresholds.maxConcurrentStories}).`,
      false,
    );
  }

  // A rework rate over a handful of stories is noise. Reporting "100% rework" for someone
  // who has completed one story and had it returned would burn mentor attention on a
  // statistic that means nothing, and would land on the person least able to absorb it.
  if (state.completedStories >= thresholds.minStoriesForReworkSignal) {
    const rate = state.reworkedStories / state.completedStories;
    if (rate > thresholds.reworkRateThreshold) {
      add(
        'high_rework',
        `${Math.round(rate * 100)}% of their completed stories came back for rework ` +
          `(${state.reworkedStories} of ${state.completedStories}).`,
        false,
      );
    }
  }

  if (state.architectureConcernRaised) {
    add('architecture_concern', 'An architecture concern was raised on their work.', false);
  }

  if (state.releaseAwaitingApproval) {
    add('release_ready', 'A release they directed is ready and awaiting approval.', true);
  }

  return exceptions;
}

/**
 * Order exceptions for a mentor's queue.
 *
 * Urgent first, then problems before opportunities, then stable by declaration order. The
 * last clause matters more than it looks: an unstable sort would reshuffle a mentor's
 * queue between refreshes, and a list that moves under someone is a list they stop
 * trusting.
 */
export function prioritizeExceptions(
  exceptions: readonly MentorException[],
): MentorException[] {
  const kindOrder = new Map(MENTOR_EXCEPTION_KINDS.map((k, i) => [k, i]));
  return [...exceptions].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (a.nature !== b.nature) return a.nature === 'problem' ? -1 : 1;
    return (kindOrder.get(a.kind) ?? 0) - (kindOrder.get(b.kind) ?? 0);
  });
}
