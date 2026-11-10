/**
 * Who should NOT get a message today.
 *
 * Each case here is a way the queue could cost something real:
 *
 *   1. **The duplicate.** On 10 Nov 2026 all thirteen interns were written to at 8:21 CST. A
 *      prepare-the-day button that listed all thirteen again at noon is thirteen duplicate sends
 *      away from a person's judgement, every day, forever.
 *   2. **The buried reply.** Three of those thirteen answered during the morning. If "already
 *      messaged today" is applied without asking whether they wrote back, the most urgent people on
 *      the list are the ones it hides.
 *   3. **The send that was always going to be refused.** Two of thirteen briefs carried an angle
 *      bracket from a breadcrumb in the report text. The sender rejects those, so offering them as
 *      sendable spends a manager's attention on a message that cannot leave.
 *   4. **Midnight.** "Today" is the manager's day in Central, not a UTC instant.
 */
import { holdFor, centralDay, HOLD_LABEL } from '../hold';
import type { NudgeBrief } from '../types';

const brief = (over: Partial<NudgeBrief> = {}): NudgeBrief => ({
  enrollmentId: 'e1', name: 'Omolola Makinde', firstName: 'Omolola', email: 'o@example.test',
  tier: 'overdue_backlog', tierReason: 'six overdue', trackLabel: 'Saratoga', projectName: 'Saratoga',
  signals: {
    day: 50, percentBuilt: 40, storiesVerified: 4, storiesTotal: 10, overdueTasks: 6,
    daysSinceBuildWork: 2, artifacts: 0, trainingWeeksCompleted: 3, trainingWeeksTotal: 10,
    gateCleared: true, openQuestions: 0, hasRepo: true,
  },
  lastOutbound: null,
  inboundSince: null,
  deadline: null,
  promises: [],
  subject: 'Two days to your case study package',
  body: 'Omolola,\n\nTwo days. Your case study package is due on November 12.',
  attachment: null,
  warnings: [],
  generatedAt: '2026-11-10T18:00:00.000Z',
  ...over,
}) as NudgeBrief;

/** 10 Nov 2026, 12:00 CST, which is 18:00 UTC. */
const NOON_CST = new Date('2026-11-10T18:00:00.000Z');

describe('nothing is held without a reason', () => {
  it('a clean brief with an address and no message today is sent', () => {
    expect(holdFor({ brief: brief(), now: NOON_CST })).toBeNull();
  });

  it('every reason has a label, so no chip can render blank', () => {
    const reasons = ['no_email', 'unsendable_text', 'paused', 'messaged_today'] as const;
    for (const r of reasons) expect(HOLD_LABEL[r]).toBeTruthy();
  });
});

describe('the duplicate', () => {
  it('holds someone written to earlier the same Central day', () => {
    const d = holdFor({
      brief: brief({ lastOutbound: { sentAt: '2026-11-10T14:21:00.000Z', subject: 'Two days' } }),
      now: NOON_CST,
    });
    expect(d?.reason).toBe('messaged_today');
    expect(d?.detail).toContain('Two days');
  });

  it('does NOT hold someone written to yesterday', () => {
    expect(holdFor({
      brief: brief({ lastOutbound: { sentAt: '2026-11-09T14:21:00.000Z', subject: null } }),
      now: NOON_CST,
    })).toBeNull();
  });

  /**
   * 11pm Central on the 9th is 05:00 UTC on the 10th. Comparing UTC dates would call that "today"
   * and hold someone who has heard nothing since the previous evening.
   */
  it('uses the Central day, not the UTC day', () => {
    expect(centralDay('2026-11-10T05:00:00.000Z')).toBe('2026-11-09');
    expect(holdFor({
      brief: brief({ lastOutbound: { sentAt: '2026-11-10T05:00:00.000Z', subject: null } }),
      now: NOON_CST,
    })).toBeNull();
  });
});

describe('the buried reply', () => {
  /** The whole reason the reply check sits in front of the same-day check. */
  it('does NOT hold someone who answered after our message, even on the same day', () => {
    expect(holdFor({
      brief: brief({
        lastOutbound: { sentAt: '2026-11-10T14:21:00.000Z', subject: 'Two days' },
        inboundSince: '2026-11-10T15:50:00.000Z',
      }),
      now: NOON_CST,
    })).toBeNull();
  });
});

describe('the send that could never have left', () => {
  it('holds a body carrying an angle bracket, and says it is our defect', () => {
    const d = holdFor({
      brief: brief({ body: 'Harpreet,\n\nNo project. Start one from Internship > Projects.' }),
      now: NOON_CST,
    });
    expect(d?.reason).toBe('unsendable_text');
    expect(d?.detail).toContain('angle bracket');
    expect(d?.detail).toContain('not in them');
  });

  it('judges the EDITED text when one is supplied, not the generated body', () => {
    const d = holdFor({ brief: brief(), body: 'Omolola,\n\nTwo days — and counting.', now: NOON_CST });
    expect(d?.reason).toBe('unsendable_text');
    expect(d?.detail).toContain('em or en dash');
  });
});

describe('ordering, hardest reason first', () => {
  it('reports the missing address rather than the duplicate when both are true', () => {
    const d = holdFor({
      brief: brief({ email: null, lastOutbound: { sentAt: '2026-11-10T14:21:00.000Z', subject: null } }),
      now: NOON_CST,
    });
    expect(d?.reason).toBe('no_email');
  });

  it('holds a paused intern', () => {
    expect(holdFor({ brief: brief(), applicationState: 'paused', now: NOON_CST })?.reason).toBe('paused');
  });

  it('does not hold an active one for being active', () => {
    expect(holdFor({ brief: brief(), applicationState: 'active', now: NOON_CST })).toBeNull();
  });
});
