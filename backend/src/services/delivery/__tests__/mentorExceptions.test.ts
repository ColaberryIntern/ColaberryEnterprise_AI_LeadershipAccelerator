import {
  mentorExceptionsFor,
  prioritizeExceptions,
  DEFAULT_THRESHOLDS,
  MENTOR_EXCEPTION_KINDS,
  EXCEPTION_NATURE,
  type BuilderState,
} from '../mentorExceptions';

/**
 * Gate 11 shipped with **no test of any kind** — the only file referencing it was itself.
 *
 * These assert the decisions the module's own comments make, because those comments are
 * the design and nothing was checking that the code still agreed with them.
 */

const base = (over: Partial<BuilderState> = {}): BuilderState => ({
  builderIdentityId: 'identity-builder',
  concurrentStories: 0,
  completedStories: 0,
  reworkedStories: 0,
  hasClientReviewExperience: true,
  clientReviewPending: false,
  trustOrSecurityGateFailing: false,
  architectureConcernRaised: false,
  releaseAwaitingApproval: false,
  ...over,
});

describe('the rework noise floor', () => {
  it('stays SILENT at 100% rework when too few stories have completed', () => {
    // The module's stated reason: reporting "100% rework" for someone who has completed
    // one story and had it returned burns mentor attention on a meaningless statistic, and
    // lands it on the person least able to absorb it.
    const out = mentorExceptionsFor(base({ completedStories: 1, reworkedStories: 1 }));
    expect(out.map((e) => e.kind)).not.toContain('high_rework');
  });

  it('fires once there are enough completed stories for the rate to mean something', () => {
    const out = mentorExceptionsFor(
      base({ completedStories: 10, reworkedStories: 5 }),
    );
    const rework = out.find((e) => e.kind === 'high_rework');
    expect(rework).toBeDefined();
    // The detail is what the mentor reads without opening anything, so it carries both the
    // rate and the raw counts behind it.
    expect(rework!.detail).toContain('50%');
    expect(rework!.detail).toContain('5 of 10');
  });

  it('does not fire exactly AT the threshold, only above it', () => {
    // 30% of 10 is exactly the threshold. An off-by-one here would make the documented
    // threshold mean something different from what it says.
    const out = mentorExceptionsFor(base({ completedStories: 10, reworkedStories: 3 }));
    expect(out.map((e) => e.kind)).not.toContain('high_rework');
  });
});

describe('first client review fires BEFORE, not after', () => {
  it('fires for an inexperienced builder with a review pending', () => {
    const out = mentorExceptionsFor(
      base({ clientReviewPending: true, hasClientReviewExperience: false }),
    );
    expect(out.map((e) => e.kind)).toContain('first_client_review');
  });

  it('stays silent once the builder has been through one', () => {
    // A mentor arriving after the first review has missed the moment they mattered, and
    // firing every time would make the exception meaningless.
    const out = mentorExceptionsFor(
      base({ clientReviewPending: true, hasClientReviewExperience: true }),
    );
    expect(out.map((e) => e.kind)).not.toContain('first_client_review');
  });
});

describe('opportunities are not failures', () => {
  it('classifies the two good events as opportunities, and they can still be urgent', () => {
    // A mentor system that only surfaces failure trains people to hide things. Severity is
    // separate from urgency, and this is the assertion that keeps them separate.
    const out = mentorExceptionsFor(
      base({
        clientReviewPending: true,
        hasClientReviewExperience: false,
        releaseAwaitingApproval: true,
      }),
    );
    const opportunities = out.filter((e) => e.nature === 'opportunity');
    expect(opportunities.map((e) => e.kind).sort()).toEqual([
      'first_client_review',
      'release_ready',
    ]);
    expect(opportunities.every((e) => e.urgent)).toBe(true);
  });

  it('keeps EXCEPTION_NATURE complete for every kind', () => {
    // A kind added without a nature would produce an exception with `nature: undefined`,
    // which sorts unpredictably and renders as nothing.
    for (const kind of MENTOR_EXCEPTION_KINDS) {
      expect(EXCEPTION_NATURE[kind]).toMatch(/^(problem|opportunity)$/);
    }
  });
});

describe('prioritizeExceptions', () => {
  it('orders urgent first, then problems before opportunities', () => {
    const out = prioritizeExceptions(
      mentorExceptionsFor(
        base({
          trustOrSecurityGateFailing: true,
          releaseAwaitingApproval: true,
          concurrentStories: 9,
          architectureConcernRaised: true,
        }),
      ),
    );
    const urgentCount = out.filter((e) => e.urgent).length;
    // All urgent items precede all non-urgent ones.
    expect(out.slice(0, urgentCount).every((e) => e.urgent)).toBe(true);
    expect(out.slice(urgentCount).some((e) => e.urgent)).toBe(false);
    // Within urgent, the problem comes before the opportunity.
    expect(out[0].kind).toBe('failed_trust_or_security_gate');
  });

  it('is STABLE — the same input does not reshuffle between calls', () => {
    // The module's own reason: a queue that moves under someone is a queue they stop
    // trusting. An unstable sort would only show up intermittently in production.
    const state = base({
      trustOrSecurityGateFailing: true,
      concurrentStories: 9,
      architectureConcernRaised: true,
      completedStories: 10,
      reworkedStories: 8,
    });
    const first = prioritizeExceptions(mentorExceptionsFor(state)).map((e) => e.kind);
    for (let i = 0; i < 5; i += 1) {
      expect(prioritizeExceptions(mentorExceptionsFor(state)).map((e) => e.kind)).toEqual(first);
    }
  });

  it('does not mutate the array it is given', () => {
    // It sorts a copy. Sorting in place would reorder the caller's array as a side effect
    // of reading it.
    const input = mentorExceptionsFor(
      base({ trustOrSecurityGateFailing: true, concurrentStories: 9 }),
    );
    const before = input.map((e) => e.kind);
    prioritizeExceptions(input);
    expect(input.map((e) => e.kind)).toEqual(before);
  });
});

describe('a clean builder produces an empty queue', () => {
  it('returns nothing at all when nothing applies', () => {
    // The whole premise: a mentor shown everything sees nothing. Silence has to be
    // reachable or the list stops meaning anything.
    expect(mentorExceptionsFor(base())).toEqual([]);
  });

  it('is silent at exactly the overload threshold', () => {
    expect(
      mentorExceptionsFor(base({ concurrentStories: DEFAULT_THRESHOLDS.maxConcurrentStories })),
    ).toEqual([]);
  });
});
