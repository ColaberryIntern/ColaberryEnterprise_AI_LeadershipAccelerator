/**
 * `rejected_claims` reaching a human.
 *
 * The signal has existed since the loop shipped: `decideStory` records every
 * tick whose text matches no criterion in the published plan. It is persisted to
 * `student_tasks.verification_json`, serialised through `projectTreeDto` and
 * declared on the frontend DTO — and read by nothing, rendered by nothing,
 * alerted on by nothing. A student can sit at `submitted` indefinitely because
 * their agent reworded a sentence, and the only trace is a JSONB column nobody
 * queries.
 *
 * PROPORTIONALITY. This fires on WORDING DRIFT, not fraud — an agent that
 * retyped a criterion, a plan republished with new text, a student who wrote
 * their own criteria. The response is therefore a structured log event on the
 * existing `sbp-verification` stream, at `warn`, carrying enough to diagnose it
 * and nothing that identifies a person. It is not an email, not a page, and not
 * a new admin surface: a build that fires this is not an incident, it is a
 * sentence that needs looking at.
 *
 * PURE — the summariser has no I/O, so the rule is testable from a literal.
 */
import { summariseRejectedClaims } from '../rejectedClaimsSignal';
import { StoryVerdict } from '../verifyDecision';

const verdict = (over: Partial<StoryVerdict>): StoryVerdict => ({
  story_id: 'STORY-001',
  state: 'submitted',
  criteria_total: 3,
  criteria_passed: 1,
  outstanding: [],
  criteria: [],
  commit_sha: null,
  commit_at: null,
  reasons: [],
  rejected_claims: [],
  ...over,
});

describe('summariseRejectedClaims', () => {
  it('reports nothing when no claim was rejected', () => {
    expect(summariseRejectedClaims([verdict({}), verdict({ story_id: 'STORY-002' })])).toBeNull();
  });

  it('reports nothing for an empty build', () => {
    expect(summariseRejectedClaims([])).toBeNull();
  });

  it('reports a build where one story has an unmatched claim', () => {
    const s = summariseRejectedClaims([
      verdict({ rejected_claims: ['Given whatever, then it passes.'] }),
    ]);
    expect(s).not.toBeNull();
    expect(s!.claims_total).toBe(1);
    expect(s!.stories_affected).toEqual(['STORY-001']);
  });

  it('counts across stories and lists each affected story once, sorted', () => {
    const s = summariseRejectedClaims([
      verdict({ story_id: 'STORY-002', rejected_claims: ['a', 'b'] }),
      verdict({ story_id: 'STORY-001', rejected_claims: ['c'] }),
      verdict({ story_id: 'STORY-003', rejected_claims: [] }),
    ]);
    expect(s!.claims_total).toBe(3);
    expect(s!.stories_affected).toEqual(['STORY-001', 'STORY-002']);
  });

  it('carries the unmatched text, so the drift can actually be diagnosed', () => {
    const s = summariseRejectedClaims([verdict({ rejected_claims: ['Given the thing, then wrong wording.'] })]);
    expect(s!.samples).toContain('Given the thing, then wrong wording.');
  });

  it('caps the sample list so one broken file cannot flood a log line', () => {
    const many = Array.from({ length: 50 }, (_, i) => `claim number ${i}`);
    const s = summariseRejectedClaims([verdict({ rejected_claims: many })]);
    expect(s!.claims_total).toBe(50);
    expect(s!.samples.length).toBeLessThanOrEqual(5);
  });

  it('truncates a long claim rather than emitting an essay into the log', () => {
    const s = summariseRejectedClaims([verdict({ rejected_claims: ['x'.repeat(1000)] })]);
    expect(s!.samples[0].length).toBeLessThanOrEqual(200);
  });

  it('flags the case worth a human eye: a story blocked ONLY by unmatched claims', () => {
    // Nothing outstanding that the student can see as work, yet not verified —
    // this is the shape that leaves somebody stuck with no actionable message.
    const s = summariseRejectedClaims([
      verdict({ state: 'submitted', rejected_claims: ['reworded'], criteria_passed: 2, criteria_total: 3 }),
    ]);
    expect(s!.likely_wording_drift).toBe(true);
  });

  it('does not flag a verified story that happened to carry an extra invented claim', () => {
    const s = summariseRejectedClaims([
      verdict({ state: 'verified', criteria_passed: 3, criteria_total: 3, rejected_claims: ['extra'] }),
    ]);
    expect(s!.likely_wording_drift).toBe(false);
  });
});
