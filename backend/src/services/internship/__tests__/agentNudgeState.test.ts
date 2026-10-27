/* eslint-disable */
// Tests for the agent-nudge state loader and the seven-only guard.
//
// The guard is the load-bearing one. Ali granted a narrow exception to a standing rule that bulk
// mail to students is forbidden: the seven agent builders, nobody else. That has to be a property
// of the code, not a note in a docblock, so it is a throw and it is tested with a real student
// address that must not get through.

import {
  loadAgentNudgeStates, assertAgentBuilder, agentNudgeEventId, clipSubject, AGENT_NUDGE_SQL,
  AGENT_NAMES, OWED_WINDOW_DAYS,
} from '../agentNudgeState';

const NOW = '2026-10-23 15:00:00+00';

const row = (over: any = {}) => ({
  domain: 'marketing',
  builder: 'Robin Vasquez',
  email: 'RobinV83@Example-Mail.test',
  commits: [
    { date: '2026-10-20T17:28:52Z', author: 'Robin', message: 'Add project description to README' },
  ],
  stories: 70,
  verified: 0,
  overdue: 5,
  gradeable: 70,
  next_story: {
    storyId: 'marketing.RESEARCH-1-SYSTEM-CLASSES', title: 'Compare the five system classes',
    dueOn: '2026-10-20', gradeable: true,
  },
  last_verified: null,
  last_wrote: '2026-10-20 18:50:35+00',
  last_we_wrote: '2026-10-21 18:00:35+00',
  prior_nudges: 0,
  ...over,
});

const load = (rows: any[]) => loadAgentNudgeStates({ query: async () => rows, now: NOW });

describe('only the seven, enforced as a refusal', () => {
  it('throws on an address that is not an agent builder', async () => {
    const states = await load([row()]);
    expect(() => assertAgentBuilder('some.student@example.com', states))
      .toThrow(/not one of the agent builders/);
  });

  it('throws rather than returning false, so forgetting to check cannot send', async () => {
    const states = await load([row()]);
    expect(() => assertAgentBuilder('', states)).toThrow();
  });

  it('accepts a builder regardless of the casing the caller used', async () => {
    const states = await load([row()]);
    expect(assertAgentBuilder('ROBINV83@Example-Mail.test', states).domain).toBe('marketing');
  });

  it('the query itself only returns rows with an intended builder and an address', () => {
    expect(AGENT_NUDGE_SQL).toMatch(/d\.intended_builder IS NOT NULL/);
    expect(AGENT_NUDGE_SQL).toMatch(/e\.email IS NOT NULL/);
  });
});

describe('shaping', () => {
  it('lowercases the address and takes the first name only', async () => {
    const [s] = await load([row()]);
    expect(s.email).toBe('robinv83@example-mail.test');
    expect(s.firstName).toBe('Robin');
  });

  it('bands on the intern\'s own last commit', async () => {
    const [s] = await load([row()]);
    expect(s.daysSinceCommit).toBe(2);
    expect(s.band).toBe('yellow');
  });

  it('ignores platform commits when banding, so the provisioner cannot look like work', async () => {
    const [s] = await load([row({
      commits: [
        { date: '2026-10-23T14:00:00Z', author: 'Colaberry Build Bot', message: 'chore(colaberry): sync' },
        { date: '2026-10-20T17:28:52Z', author: 'Robin', message: 'README' },
      ],
    })]);
    expect(s.daysSinceCommit).toBe(2);
    expect(s.recentCommitSubjects).toEqual([]);
  });

  it('carries the agent name the intern chose', async () => {
    const [s] = await load([row()]);
    expect(s.agent).toBe('Ava');
    expect(AGENT_NAMES.platform).toBe('Ellis');
  });

  it('reads unknown rather than zero when there is no commit at all', async () => {
    const [s] = await load([row({ commits: null })]);
    expect(s.daysSinceCommit).toBeNull();
    expect(s.band).toBe('unknown');
  });
});

describe('are we still owed them a reply', () => {
  // Answered from the database, because every outbound BCCs Ali and that copy is ingested with
  // its to_addresses. Two earlier versions got this wrong against production in opposite
  // directions: the send ledger misses hand-sent replies, and Gmail misses Mandrill entirely.

  it('is false when our reply is newer than their message', async () => {
    // The real pair: Robin wrote 20 Oct 18:50, was answered 21 Oct 18:00.
    const [s] = await load([row()]);
    expect(s.awaitingOurReply).toBe(false);
  });

  it('is true when their message is newer than our last reply', async () => {
    const [s] = await load([row({ last_we_wrote: '2026-10-19 09:00:00+00' })]);
    expect(s.awaitingOurReply).toBe(true);
  });

  it('is true when we have never written to them at all', async () => {
    const [s] = await load([row({ last_we_wrote: null })]);
    expect(s.awaitingOurReply).toBe(true);
  });

  it('is false when THEY have never written, because nothing is owed', async () => {
    const [s] = await load([row({ last_wrote: null, last_we_wrote: null })]);
    expect(s.awaitingOurReply).toBe(false);
  });

  it('stops counting an ancient unanswered message, which would mute them forever', async () => {
    // One builder read as owed a reply because of an email sent 79 days earlier. Real, never
    // answered, and not a conversation anyone is waiting on. The fix for a months-old miss is a
    // reply, not permanent silence.
    const old = new Date(Date.parse('2026-10-23T15:00:00Z') - (OWED_WINDOW_DAYS + 2) * 86400000);
    const [s] = await load([row({ last_wrote: old.toISOString(), last_we_wrote: null })]);
    expect(s.awaitingOurReply).toBe(false);
  });

  it('still counts one inside the window', async () => {
    const recent = new Date(Date.parse('2026-10-23T15:00:00Z') - 86400000);
    const [s] = await load([row({ last_wrote: recent.toISOString(), last_we_wrote: null })]);
    expect(s.awaitingOurReply).toBe(true);
  });

  it('counts an answer from any colleague as an answer', () => {
    // dhee@colaberry.com answered Tashima on 22 Oct. Any colaberry.com sender closes the loop.
    expect(AGENT_NUDGE_SQL).toMatch(/LIKE '%@colaberry\.com'/);
    expect(AGENT_NUDGE_SQL).toMatch(/to_addresses::text ILIKE/);
  });
});

describe('peers who finished the same story', () => {
  it('counts other domains that verified the same story suffix', async () => {
    const states = await load([
      row({ domain: 'marketing', last_verified: null }),
      row({
        domain: 'platform', email: 'q@example.com', builder: 'Jordan P',
        last_verified: 'platform.RESEARCH-1-SYSTEM-CLASSES',
      }),
      row({
        domain: 'curriculum', email: 'r@example.com', builder: 'Noor S',
        last_verified: 'curriculum.RESEARCH-1-SYSTEM-CLASSES',
      }),
    ]);
    expect(states[0].peersDoneWithNextStory).toBe(2);
  });

  it('does not count a builder against themselves', async () => {
    const states = await load([
      row({ domain: 'marketing', last_verified: 'marketing.RESEARCH-1-SYSTEM-CLASSES' }),
    ]);
    expect(states[0].peersDoneWithNextStory).toBe(0);
  });
});

describe('commit subjects are cut on a word boundary', () => {
  it('does not leave three letters of a word, which the daily report shipped once', () => {
    const out = clipSubject(
      'platform.RESEARCH-3-ROLE-AND-DA-TRANSITION: document the role and which bits move',
    );
    expect(out.endsWith('...')).toBe(true);
    expect(out).not.toMatch(/\srol\.\.\.$/);
  });

  it('leaves a short subject completely alone', () => {
    expect(clipSubject('Add discovery notes')).toBe('Add discovery notes');
  });

  it('survives a null', () => {
    expect(clipSubject(null)).toBe('');
  });
});

describe('one nudge per builder per day', () => {
  it('keys on the domain and the date, not on the variant', () => {
    const id = agentNudgeEventId('marketing', new Date('2026-10-23T15:00:00Z'));
    expect(id).toBe('agent-nudge-marketing-2026-10-23');
  });

  it('gives a different id tomorrow, because tomorrow is a different nudge', () => {
    expect(agentNudgeEventId('marketing', new Date('2026-10-24T01:00:00Z')))
      .not.toBe(agentNudgeEventId('marketing', new Date('2026-10-23T23:00:00Z')));
  });

  it('counts prior sends so the angle rotates', async () => {
    const [s] = await load([row({ prior_nudges: 3 })]);
    expect(s.priorNudgeCount).toBe(3);
  });
});
