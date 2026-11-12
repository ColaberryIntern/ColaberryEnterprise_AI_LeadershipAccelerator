import { decide, summarize, unreviewedBody, STALLED_DAYS, type CadenceDecision } from '../cadence';
import type { EngagementState } from '../engagement';
import type { HoldDecision } from '../hold';
import type { NudgeBrief } from '../types';

/**
 * The cadence worker's decision: who hears from us when nobody is driving.
 *
 * Ali, 2026-11-11: communication at least every 48 hours if he detaches, once across a weekend,
 * "strategic and not just based on time", and the goal is that nobody slides through the cracks.
 *
 * The thing these tests are really protecting is the ORDER. A timer that fires first would make
 * every message a timer message, which is the sameness problem wearing a schedule. The floor is
 * last, and it only catches the person no real reason found.
 */

const brief = (over: Partial<NudgeBrief> = {}): NudgeBrief => ({
  enrollmentId: 'e1',
  name: 'Quincy Nkwain Ninying',
  firstName: 'Quincy',
  tier: 'quiet',
  openQuestions: [],
  promises: [],
  deadline: null,
  signals: { daysSinceBuildWork: 1 },
  body: 'Quincy,\n\nDeterministic body.',
  ...over,
} as unknown as NudgeBrief);

const engagement = (over: Partial<EngagementState> = {}): EngagementState => ({
  lastContactAt: '2026-11-10T14:21:00.000Z',
  daysSinceContact: 1,
  engagedSinceContact: false,
  engagedBy: null,
  overdue: false,
  reason: 'We wrote 1 day ago and nothing has come back yet, but the floor has not passed.',
  ...over,
});

const hold = (detail: string): HoldDecision => ({ reason: 'paused', detail });

describe('a reason to write beats the clock', () => {
  it('answers first when their mail is waiting on us', () => {
    const d = decide({ brief: brief({ tier: 'blocked_waiting_on_ali' }), engagement: engagement({ overdue: true }), hold: null });
    expect(d.send).toBe(true);
    expect(d.trigger).toBe('answer_owed');
    expect(d.reason).toMatch(/waiting on a reply/);
  });

  it('counts an unanswered question as a reason even when the floor has not passed', () => {
    const d = decide({
      brief: brief({ openQuestions: [{ receivedAt: 'x', subject: 's', text: 't' }] as never }),
      engagement: engagement(),
      hold: null,
    });
    expect(d.send).toBe(true);
    expect(d.trigger).toBe('answer_owed');
  });

  it('chases an open promise, quoting what we actually said', () => {
    const d = decide({
      brief: brief({ promises: [{ quote: 'On the six: you will have them before Friday.', sentAt: 'x', subject: null }] as never }),
      engagement: engagement(),
      hold: null,
    });
    expect(d.trigger).toBe('promise_open');
    expect(d.reason).toContain('before Friday');
  });

  /** They did something after our message, so the promise is no longer the live thread. */
  it('drops the promise trigger once they have engaged since', () => {
    const d = decide({
      brief: brief({ promises: [{ quote: 'You will have them before Friday.', sentAt: 'x', subject: null }] as never }),
      engagement: engagement({ engagedSinceContact: true, engagedBy: 'commit' }),
      hold: null,
    });
    expect(d.trigger).not.toBe('promise_open');
  });

  it('raises a near deadline that still has work against it', () => {
    const d = decide({
      brief: brief({ deadline: { dueOn: '2026-11-12', daysLeft: 1, outstanding: ['the case study'] } as never }),
      engagement: engagement(),
      hold: null,
    });
    expect(d.trigger).toBe('deadline_near');
    expect(d.reason).toBe('1 day to 2026-11-12 with 1 still outstanding.');
  });

  it('ignores a near deadline with nothing outstanding', () => {
    const d = decide({
      brief: brief({ deadline: { dueOn: '2026-11-12', daysLeft: 1, outstanding: [] } as never }),
      engagement: engagement(),
      hold: null,
    });
    expect(d.send).toBe(false);
  });

  it(`calls a build stalled at ${STALLED_DAYS} quiet days`, () => {
    const d = decide({ brief: brief({ signals: { daysSinceBuildWork: STALLED_DAYS } as never }), engagement: engagement(), hold: null });
    expect(d.trigger).toBe('build_stalled');
  });
});

describe('the floor only catches who nothing else found', () => {
  it('fires when no reason applies and contact is overdue', () => {
    const d = decide({ brief: brief(), engagement: engagement({ overdue: true, reason: '3 days since we last wrote, and the floor is 2.' }), hold: null });
    expect(d.send).toBe(true);
    expect(d.trigger).toBe('contact_floor');
    expect(d.reason).toBe('3 days since we last wrote, and the floor is 2.');
  });

  it('stays quiet when nothing applies and the floor has not passed', () => {
    const d = decide({ brief: brief(), engagement: engagement(), hold: null });
    expect(d.send).toBe(false);
    expect(d.trigger).toBeNull();
  });

  /**
   * The ordering test that matters most. Somebody both overdue AND waiting on an answer must be
   * sent the answer, not the backstop, or every message becomes a timer message.
   */
  it('prefers the real reason over the floor when both apply', () => {
    const d = decide({ brief: brief({ tier: 'blocked_waiting_on_ali' }), engagement: engagement({ overdue: true }), hold: null });
    expect(d.trigger).toBe('answer_owed');
  });
});

describe('a hold is reported, never swallowed', () => {
  /**
   * "Nobody slides through the cracks" is only true if the reason somebody got nothing is visible.
   * An intern with no address on file is not covered because the worker declined to crash.
   */
  it('withholds but still records what the trigger WAS', () => {
    const d = decide({
      brief: brief({ tier: 'blocked_waiting_on_ali' }),
      engagement: engagement({ overdue: true }),
      hold: hold('Their internship is paused.'),
    });
    expect(d.send).toBe(false);
    expect(d.trigger).toBe('answer_owed');
    expect(d.withheld).toBe('Their internship is paused.');
  });

  it('separates withheld from quiet in the summary', () => {
    const decisions: CadenceDecision[] = [
      decide({ brief: brief({ tier: 'blocked_waiting_on_ali' }), engagement: engagement(), hold: null }),
      decide({ brief: brief(), engagement: engagement({ overdue: true }), hold: null }),
      decide({ brief: brief({ tier: 'blocked_waiting_on_ali' }), engagement: engagement(), hold: hold('No address on file.') }),
      decide({ brief: brief(), engagement: engagement(), hold: null }),
    ];
    const s = summarize(decisions);
    expect(s).toMatchObject({ total: 4, sending: 2, withheld: 1, quiet: 1 });
    expect(s.byTrigger).toEqual({ answer_owed: 1, contact_floor: 1 });
  });
});

describe('what an unattended send actually puts in the email', () => {
  /** Ali's rule: unreviewed means deterministic. One function so that stays one decision. */
  it('uses the deterministic body', () => {
    expect(unreviewedBody(brief({ body: 'Quincy,\n\nThe deterministic one.' }))).toBe('Quincy,\n\nThe deterministic one.');
  });
});
