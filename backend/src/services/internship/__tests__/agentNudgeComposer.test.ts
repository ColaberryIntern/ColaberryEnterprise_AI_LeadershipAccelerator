/* eslint-disable */
// Tests for the agent-builder nudge composer.
//
// Three things Ali asked for, each pinned here because each is easy to lose later:
//
//   1. "They need to be different each time" - five weekdays running must produce five different
//      messages, not one message five times.
//   2. "We can send them out if they aren't sending me issues and I don't detect movement" - the
//      suppression is the feature, not a safety net bolted on after.
//   3. "Actually looking at what they are doing" - every message names something measured: their
//      next story, what they last finished, how many dates have passed.
//
// Plus the rule this repo keeps relearning: a zero is a claim about somebody's work. If nothing
// in their plan can be graded, the message must not read as "you have done nothing".

import {
  decideNudge, composeNudge, nudgeRotation, MOVED_RECENTLY_DAYS,
  type AgentNudgeState,
} from '../agentNudgeComposer';

const state = (over: Partial<AgentNudgeState> = {}): AgentNudgeState => ({
  domain: 'marketing',
  agent: 'Ava',
  firstName: 'Robin',
  email: 'builder@example.com',
  band: 'yellow',
  daysSinceCommit: 3,
  verified: 2,
  stories: 70,
  overdue: 5,
  gradeableStories: 70,
  nextStory: {
    storyId: 'RESEARCH-1-SYSTEM-CLASSES',
    title: 'Compare the five system classes and place this domain',
    dueOn: '2026-10-24',
    gradeable: true,
  },
  lastVerifiedStoryId: 'RESEARCH-0-SETUP',
  recentCommitSubjects: [],
  daysSinceTheyWrote: null,
  awaitingOurReply: false,
  peersDoneWithNextStory: 3,
  priorNudgeCount: 0,
  ...over,
});

describe('whether to send at all', () => {
  it('sends to someone quiet who has not written in', () => {
    expect(decideNudge(state())).toEqual({ send: true, reason: 'quiet_and_silent' });
  });

  it('does NOT send to someone still owed an answer', () => {
    expect(decideNudge(state({ awaitingOurReply: true })))
      .toEqual({ send: false, reason: 'awaiting_our_reply' });
  });

  it('DOES send to someone who wrote, was answered, and then went silent', () => {
    // The case that broke the first version against production. One builder wrote on the 20th, was
    // answered on the 21st, and did nothing after. "Wrote within two days" read her as
    // mid-conversation when the ball was already back in her court, and held back the nudge from
    // the one person who most needed it.
    const d = decideNudge(state({ daysSinceTheyWrote: 2, awaitingOurReply: false }));
    expect(d).toEqual({ send: true, reason: 'quiet_and_silent' });
  });

  it('does NOT send to someone who just moved', () => {
    expect(decideNudge(state({ daysSinceCommit: MOVED_RECENTLY_DAYS })).send).toBe(false);
    expect(decideNudge(state({ recentCommitSubjects: ['RESEARCH-1: first pass'] })))
      .toEqual({ send: false, reason: 'moved_recently' });
  });

  it('puts "we owe them an answer" AHEAD of "they moved", which is the load-bearing order', () => {
    // Someone who reported a blocker and then committed a workaround is still owed a reply.
    // Nudging them would be the second time we failed to read it.
    const d = decideNudge(state({ awaitingOurReply: true, recentCommitSubjects: ['a commit'] }));
    expect(d.reason).toBe('awaiting_our_reply');
  });

  it('separates never-started from quiet, because the words and the urgency differ', () => {
    expect(decideNudge(state({ verified: 0, daysSinceCommit: null })))
      .toEqual({ send: true, reason: 'never_started' });
  });

  it('refuses with no recipient rather than composing into the void', () => {
    expect(decideNudge(state({ email: '' }))).toEqual({ send: false, reason: 'no_recipient' });
  });
});

describe('five weekdays produce five different messages', () => {
  it('rotates the angle instead of repeating one', () => {
    const five = nudgeRotation(state(), 5);
    const subjects = new Set(five.map((n) => n.subject));
    const bodies = new Set(five.map((n) => n.text));
    expect(subjects.size).toBeGreaterThanOrEqual(4);
    expect(bodies.size).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic, so the same day always produces the same words', () => {
    expect(composeNudge(state({ priorNudgeCount: 3 })).text)
      .toBe(composeNudge(state({ priorNudgeCount: 3 })).text);
  });

  it('wraps around rather than running out of things to say', () => {
    const many = nudgeRotation(state(), 12);
    expect(many.every((n) => n.text.length > 80)).toBe(true);
  });

  it('survives a negative or absurd prior count without throwing', () => {
    expect(composeNudge(state({ priorNudgeCount: -7 })).subject).toBeTruthy();
    expect(composeNudge(state({ priorNudgeCount: 10000 })).subject).toBeTruthy();
  });
});

describe('every message names something measured', () => {
  it('names the next story and its due date', () => {
    const n = composeNudge(state({ priorNudgeCount: 0 }));
    expect(n.text).toContain('RESEARCH-1-SYSTEM-CLASSES');
    expect(n.text).toContain('2026-10-24');
  });

  it('names what they last finished', () => {
    const rot = nudgeRotation(state(), 5);
    expect(rot.some((n) => n.text.includes('RESEARCH-0-SETUP'))).toBe(true);
  });

  it('names the number of dates that have passed', () => {
    const rot = nudgeRotation(state({ overdue: 5 }), 5);
    expect(rot.some((n) => n.text.includes('5 of your 70 stories are past'))).toBe(true);
  });

  it('offers a worked example only when peers actually finished it', () => {
    const withPeers = nudgeRotation(state({ peersDoneWithNextStory: 3 }), 6);
    expect(withPeers.some((n) => n.text.includes('3 of the other builders'))).toBe(true);
    const alone = nudgeRotation(state({ peersDoneWithNextStory: 0 }), 6);
    expect(alone.some((n) => n.text.includes('other builders have already finished'))).toBe(false);
  });

  it('warns before they start a story that cannot be graded', () => {
    const n = composeNudge(state({
      nextStory: { ...state().nextStory!, gradeable: false }, priorNudgeCount: 0,
    }));
    expect(n.text).toMatch(/no acceptance criteria yet/);
    expect(n.text).toMatch(/ours to fix rather than yours/);
  });
});

describe('green is congratulated, and told what it did', () => {
  const g = state({
    band: 'green', verified: 5, daysSinceCommit: 0,
    recentCommitSubjects: ['LEGACY-MIGRATION-PLAN: plan the migration', 'STORY-000: build the Command Center'],
  });

  it('names the count and what it actually means', () => {
    const n = composeNudge(g);
    expect(n.variant).toBe('congratulate');
    expect(n.text).toContain('5 of your 70 stories are verified');
    expect(n.text).toMatch(/every criterion on it passed/);
  });

  it('cites their own recent commits back to them', () => {
    expect(composeNudge(g).text).toContain('STORY-000: build the Command Center');
  });

  it('asks for nothing', () => {
    expect(composeNudge(g).text).toMatch(/Nothing needed from you here/);
  });

  it('is still not auto-sent, because green means they moved', () => {
    expect(decideNudge(g).send).toBe(false);
  });
});

describe('a zero that is not their fault is never read back as theirs', () => {
  const ungradeable = state({ verified: 0, gradeableStories: 0, stories: 70, daysSinceCommit: 4 });

  it('says the gap is ours', () => {
    const n = composeNudge(ungradeable);
    expect(n.variant).toBe('ungradeable');
    expect(n.text).toMatch(/That is our gap/);
    expect(n.text).toMatch(/Do not treat the number as a measure of your work/);
  });

  it('never tells them they have verified nothing', () => {
    for (const n of nudgeRotation(ungradeable, 5)) {
      expect(n.text).not.toMatch(/you have (not|verified 0)/i);
    }
  });

  it('does not fire for someone whose stories CAN be graded', () => {
    expect(composeNudge(state({ verified: 0, daysSinceCommit: null })).variant)
      .not.toBe('ungradeable');
  });
});

describe('never started', () => {
  const fresh = state({
    verified: 0, daysSinceCommit: null, lastVerifiedStoryId: null, overdue: 0, band: 'unknown',
  });

  it('asks whether they need help getting started, in those words', () => {
    const rot = nudgeRotation(fresh, 3);
    expect(rot.some((n) => n.text.includes('Do you need help getting started'))).toBe(true);
  });

  it('makes the first action small rather than demanding the story be finished', () => {
    expect(composeNudge(fresh).text).toMatch(/You do not need to finish it today/);
  });

  it('carries no blame in ANY variant', () => {
    // Asserting the absence of blame, not the presence of a particular comforting phrase. The
    // first version of this test demanded one of three specific sentences and failed the
    // worked-example variant, which blames nobody and simply does not use those words. A test
    // that insists on wording rather than on the property blocks a message for being different.
    const blaming = /you (have )?(not|failed|still have ?n[o']t)|fallen behind|no excuse|why have you/i;
    for (const n of nudgeRotation(fresh, 3)) {
      expect(n.text).not.toMatch(blaming);
      expect(n.subject).not.toMatch(blaming);
    }
  });

  it('offers help explicitly somewhere in the rotation', () => {
    const rot = nudgeRotation(fresh, 3);
    expect(rot.some((n) => /need help|I will walk through|reply and I will/i.test(n.text))).toBe(true);
  });
});

describe('outbound copy rules', () => {
  const everything = [
    ...nudgeRotation(state(), 6),
    ...nudgeRotation(state({ band: 'green', verified: 5, daysSinceCommit: 0 }), 2),
    ...nudgeRotation(state({ verified: 0, daysSinceCommit: null }), 3),
    ...nudgeRotation(state({ gradeableStories: 0 }), 2),
  ];

  it('has no em or en dashes anywhere', () => {
    for (const n of everything) {
      expect(n.text).not.toMatch(/[–—]/);
      expect(n.subject).not.toMatch(/[–—]/);
    }
  });

  it('never signs off, because the sender adds the signature', () => {
    for (const n of everything) {
      expect(n.text).not.toMatch(/\n\s*(best|thanks|regards|sincerely)[,!]?\s*$/i);
    }
  });

  it('escapes a name that contains markup', () => {
    const n = composeNudge(state({ firstName: '<script>x</script>' }));
    expect(n.html).toContain('&lt;script&gt;');
    expect(n.html).not.toContain('<script>');
  });

  it('falls back to a greeting rather than addressing an empty name', () => {
    expect(composeNudge(state({ firstName: '' })).text).toMatch(/^Hi there,/);
  });
});
