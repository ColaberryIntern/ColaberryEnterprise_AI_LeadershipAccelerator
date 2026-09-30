import { deterministicStanding } from '../internshipProjectReview';

// deterministicStanding is a pure function of the facts the review computes from
// the project + its stories. No database is touched; each case sets only the
// counts the classifier reads. This is the standing a manager sees when the model
// is unavailable, so it must stay defensible on its own.
type Facts = Parameters<typeof deterministicStanding>[0];
function facts(over: Partial<Facts>): Facts {
  return {
    stage: null,
    requirements_pct: null,
    total_stories: 0,
    verified_stories: 0,
    by_status: {},
    ...over,
  };
}

describe('deterministicStanding', () => {
  it('is not_started when there are no stories at all', () => {
    expect(deterministicStanding(facts({ total_stories: 0 }))).toBe('not_started');
  });

  it('is on_track once a verified majority (>=60%) is reached', () => {
    expect(deterministicStanding(facts({
      total_stories: 10, verified_stories: 6, by_status: { verified: 6, in_progress: 4 },
    }))).toBe('on_track');
  });

  it('stays below on_track just under the 60% verified line', () => {
    expect(deterministicStanding(facts({
      total_stories: 10, verified_stories: 5, by_status: { verified: 5, in_progress: 5 },
    }))).toBe('needs_attention');
  });

  it('flags needs_attention whenever a story is blocked, even with some verified', () => {
    expect(deterministicStanding(facts({
      total_stories: 5, verified_stories: 2, by_status: { verified: 2, blocked: 1, in_progress: 2 },
    }))).toBe('needs_attention');
  });

  it('is stalled when nothing is verified and nothing is moving', () => {
    expect(deterministicStanding(facts({
      total_stories: 4, verified_stories: 0, by_status: { not_started: 4 },
    }))).toBe('stalled');
  });

  it('is needs_attention when work is in flight but nothing is verified yet', () => {
    expect(deterministicStanding(facts({
      total_stories: 4, verified_stories: 0, by_status: { in_progress: 3, complete: 1 },
    }))).toBe('needs_attention');
  });
});
