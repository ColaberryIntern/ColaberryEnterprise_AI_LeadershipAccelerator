/* eslint-disable */
// Unit tests for the AF10.3 agent-ticket digest.
//
// The load-bearing tests are about HONESTY and IDEMPOTENCY, which are the two things the ticket
// itself names:
//
//   "A sync that posts 'story complete' when a story was ticked rather than verified" makes every
//   number on every ticket untrustworthy. So verified and ticked must never be added together.
//
//   "Re-running changes nothing the second time." The fingerprint is what delivers that, so it
//   must be stable across irrelevant change (a sync timestamp moving) and must move on relevant
//   change (a new commit, a new verification).

const {
  buildDigest, fingerprintOf, dueDateShiftDays, FINGERPRINT_TAG,
} = require('../agentTicketDigest');

function state(over: any = {}) {
  return {
    agent: 'Ellis',
    intern: 'Quincy Nkwain Ninying',
    stories: 54,
    verified: 4,
    tickedNotVerified: 0,
    withVerdict: 54,
    dated: 6,
    repoUrl: 'https://github.com/qninying/platform-reliability-agent',
    fileCount: 87,
    ticketDueOn: '2026-10-24',
    commits: [
      { sha: '69f1e98abc', date: '2026-10-22T15:58:56Z', author: 'QNinying', message: 'STORY-000: build the Command Center' },
    ],
    verifiedStories: [
      { storyId: 'platform.RESEARCH-1-SYSTEM-CLASSES', passed: 3, total: 3, sha: 'a6ee5057ec30' },
    ],
    ...over,
  };
}

describe('verified and ticked are never conflated', () => {
  it('reports a tick-without-verification separately and says what it is', () => {
    const { html } = buildDigest(state({ verified: 4, tickedNotVerified: 2 }));
    expect(html).toMatch(/2 marked complete but NOT verified/);
    expect(html).toMatch(/intern's own tick/);
    // The VERIFIED row must still report 4, not 4+2. Asserted on the bolded figure rather
    // than a loose "6 of 54", which collides with the unrelated due-date count and made the
    // first version of this test fail against correct code.
    expect(html).toContain('<strong>4 of 54</strong>');
    expect(html).not.toContain('<strong>6 of 54</strong>');
  });

  it('says nothing about ticks when there are none, rather than printing a zero', () => {
    const { html } = buildDigest(state({ tickedNotVerified: 0 }));
    expect(html).not.toMatch(/marked complete but NOT verified/);
  });

  it('states what "verified" actually requires, so the number cannot be misread', () => {
    const { html } = buildDigest(state());
    expect(html).toMatch(/every criterion passed AND a commit named the story/);
  });
});

describe('every claim names its source', () => {
  it('cites the column behind each figure', () => {
    const { html } = buildDigest(state());
    for (const src of [
      'student_tasks.verified_at',
      'student_tasks.verification_json',
      'github_connections.repo_url',
      'student_tasks.due_on',
      'github_connections.commit_summary_json',
    ]) {
      expect(html).toContain(src);
    }
  });

  it('labels a platform commit so it is not read as the intern working', () => {
    const { html } = buildDigest(state({
      commits: [{ sha: 'd34db33f', date: '2026-10-22T13:20:59Z', author: 'Colaberry Build Bot', message: 'chore(colaberry): sync build plan' }],
    }));
    expect(html).toMatch(/platform, not the intern/);
  });

  it('does not label the intern\'s own commit as a bot', () => {
    const { html } = buildDigest(state());
    expect(html).not.toMatch(/platform, not the intern/);
  });
});

describe('the fingerprint makes re-running a no-op', () => {
  it('is stable for identical state', () => {
    expect(buildDigest(state()).fingerprint).toBe(buildDigest(state()).fingerprint);
  });

  it('ignores a sync timestamp, which moves every half hour regardless', () => {
    const a = buildDigest(state({ lastSyncAt: '2026-10-22T12:00:00Z' })).fingerprint;
    const b = buildDigest(state({ lastSyncAt: '2026-10-22T12:30:00Z' })).fingerprint;
    expect(a).toBe(b);
  });

  it('MOVES when a story is verified', () => {
    expect(buildDigest(state({ verified: 5 })).fingerprint)
      .not.toBe(buildDigest(state({ verified: 4 })).fingerprint);
  });

  it('MOVES when a new commit lands', () => {
    const more = state().commits.concat({ sha: 'newsha01', date: '2026-10-22T16:00:00Z', author: 'QNinying', message: 'another' });
    expect(buildDigest(state({ commits: more })).fingerprint)
      .not.toBe(buildDigest(state()).fingerprint);
  });

  it('MOVES when the ticket due date moves, which is what drives the shift', () => {
    expect(buildDigest(state({ ticketDueOn: '2026-10-22' })).fingerprint)
      .not.toBe(buildDigest(state({ ticketDueOn: '2026-10-24' })).fingerprint);
  });

  it('embeds the fingerprint so the runner can read it back off the ticket', () => {
    const { html, fingerprint } = buildDigest(state());
    expect(html).toContain(`${FINGERPRINT_TAG}:${fingerprint}`);
  });
});

describe('the headline is honest about what has happened', () => {
  it('leads with verifications when there are any', () => {
    expect(buildDigest(state({ verified: 4 })).headline).toMatch(/4 of 54 stories verified/);
  });

  it('says nothing is verified yet when commits exist but nothing passed', () => {
    const h = buildDigest(state({ verified: 0 })).headline;
    expect(h).toMatch(/nothing verified yet/);
  });

  it('says plainly when there are no commits at all', () => {
    const h = buildDigest(state({ verified: 0, commits: [] })).headline;
    expect(h).toMatch(/No commits/);
  });
});

describe('due dates SHIFT rather than being stamped over', () => {
  // Stamping one date across a project would flatten the sequencing the programme already set
  // across its dated stories. A delta preserves the order.
  it('moves earlier by the right number of days', () => {
    expect(dueDateShiftDays('2026-10-24', '2026-10-22')).toBe(-2);
  });

  it('moves later by the right number of days', () => {
    expect(dueDateShiftDays('2026-10-22', '2026-10-29')).toBe(7);
  });

  it('is zero when the date has not moved, so nothing is written without a reason', () => {
    expect(dueDateShiftDays('2026-10-24', '2026-10-24')).toBe(0);
  });

  it('is zero when either date is missing, rather than guessing', () => {
    expect(dueDateShiftDays(null, '2026-10-24')).toBe(0);
    expect(dueDateShiftDays('2026-10-24', null)).toBe(0);
    expect(dueDateShiftDays(undefined, undefined)).toBe(0);
  });

  it('is zero on an unparseable date rather than producing NaN days', () => {
    expect(dueDateShiftDays('not-a-date', '2026-10-24')).toBe(0);
    expect(dueDateShiftDays('2026-10-24', 'nonsense')).toBe(0);
  });

  it('crosses a month boundary correctly', () => {
    expect(dueDateShiftDays('2026-10-30', '2026-11-02')).toBe(3);
  });
});

describe('it escapes what it is given', () => {
  it('does not let a commit message inject markup', () => {
    const { html } = buildDigest(state({
      commits: [{ sha: 'x', date: '2026-10-22T00:00:00Z', author: 'a', message: '<script>alert(1)</script>' }],
    }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
