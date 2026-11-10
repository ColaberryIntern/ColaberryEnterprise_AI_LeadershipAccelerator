import {
  TIER_ORDER, TIER_ICON, HOLD_ICON, deadlineTone, headline, holdCounts,
  initials, metricChips, sinceLabel, tierSlices,
} from '../nudgeFormat';
import type { NudgeBrief } from '../../../../services/internNudgeApi';

/**
 * The Nudges view's presentation rules.
 *
 * These are here rather than in the component test because they are the parts that are worth
 * asserting precisely and a DOM assertion cannot do it: whether the legend is a full scale, whether
 * a threshold moved, whether the headline counts people or percentages.
 */

const brief = (over: Partial<NudgeBrief> = {}): NudgeBrief => ({
  enrollmentId: 'e1', name: 'Omolola Makinde', firstName: 'Omolola', email: 'o@example.test',
  tier: 'quiet', tierReason: 'no commit in nine days', trackLabel: 'Saratoga', projectName: 'Saratoga',
  signals: {
    day: 50, percentBuilt: 40, storiesVerified: 4, storiesTotal: 10, overdueTasks: 0,
    daysSinceBuildWork: 2, artifacts: 1, trainingWeeksCompleted: 3, trainingWeeksTotal: 10,
    gateCleared: true, openQuestions: 0, hasRepo: true,
  },
  lastOutbound: null, inboundSince: null, deadline: null, promises: [],
  subject: 's', body: 'b', attachment: null, warnings: [], generatedAt: '2026-11-10T18:00:00.000Z',
  ...over,
}) as NudgeBrief;

describe('the tier scale', () => {
  it('covers all six tiers, in the order the day should be worked', () => {
    expect(TIER_ORDER).toHaveLength(6);
    expect(TIER_ORDER[0]).toBe('blocked_waiting_on_ali');
    expect(TIER_ORDER[5]).toBe('on_track');
  });

  /** Colour is never the only signal, so every tier must have an icon to pair with its word. */
  it('gives every tier an icon and every hold reason an icon', () => {
    for (const t of TIER_ORDER) expect(TIER_ICON[t]).toMatch(/^ri-/);
    for (const r of ['no_email', 'unsendable_text', 'paused', 'messaged_today'] as const) {
      expect(HOLD_ICON[r]).toMatch(/^ri-/);
    }
  });
});

describe('the distribution bar', () => {
  /** A legend that silently drops an empty band teaches the reader that the band cannot happen. */
  it('returns all six tiers even when most are empty, so the legend is a full scale', () => {
    const slices = tierSlices([brief(), brief({ tier: 'on_track' })]);
    expect(slices).toHaveLength(6);
    expect(slices.find((s) => s.tier === 'quiet')?.n).toBe(1);
    expect(slices.find((s) => s.tier === 'never_started_building')?.n).toBe(0);
  });

  /** A NaN width renders as a full bar, which would read as "everyone is in this tier". */
  it('is 0% and not NaN when there is nothing to divide by', () => {
    for (const s of tierSlices([])) expect(s.pct).toBe(0);
  });

  it('sums to 100% across the slices that have anyone in them', () => {
    const total = tierSlices([brief(), brief({ tier: 'on_track' }), brief({ tier: 'on_track' })])
      .reduce((n, s) => n + s.pct, 0);
    expect(Math.round(total)).toBe(100);
  });
});

describe('the headline', () => {
  /** People, never percentages: "77% actionable" rounds away the person it is about. */
  it('counts people out of people', () => {
    expect(headline(3, 10, 0)).toBe('3 of 13 interns need a message, 10 held.');
    expect(headline(1, 12, 0)).toBe('1 of 13 interns needs a message, 12 held.');
  });

  it('says so plainly when nobody needs one', () => {
    expect(headline(0, 13, 0)).toBe('Nobody needs a message right now, 13 held.');
  });

  it('singular when it is one person', () => {
    expect(headline(1, 0, 0)).toBe('1 of 1 intern needs a message.');
  });

  it('never hides a row that failed to generate', () => {
    expect(headline(2, 1, 1)).toContain('1 could not be generated');
  });

  it('handles an empty roster without dividing by it', () => {
    expect(headline(0, 0, 0)).toBe('No interns on the roster to write to.');
  });
});

describe('hold chips', () => {
  it('counts each reason once, commonest first, and omits reasons nobody has', () => {
    expect(holdCounts(['messaged_today', 'no_email', 'messaged_today'])).toEqual([
      { reason: 'messaged_today', n: 2 },
      { reason: 'no_email', n: 1 },
    ]);
  });
});

describe('small formatters', () => {
  it('takes initials from the first and last word, never the middle', () => {
    expect(initials('Omolola Makinde')).toBe('OM');
    expect(initials('OBI, ANAMELECHI. K')).toBe('OK');
    expect(initials('Megan')).toBe('M');
    expect(initials('   ')).toBe('?');
  });

  /** "Today" is the manager's day in Central. 05:00 UTC is still the previous evening here. */
  it('reads the day in Central, not UTC', () => {
    const now = new Date('2026-11-10T18:00:00.000Z');
    expect(sinceLabel('2026-11-10T14:21:00.000Z', now)).toBe('today');
    expect(sinceLabel('2026-11-10T05:00:00.000Z', now)).toBe('yesterday');
    expect(sinceLabel('2026-11-07T14:00:00.000Z', now)).toBe('3 days ago');
    expect(sinceLabel(null, now)).toBe('never');
  });

  it('bands a deadline by how much room is left, not by a gradient', () => {
    expect(deadlineTone(-1)).toBe('alert');
    expect(deadlineTone(2)).toBe('alert');
    expect(deadlineTone(3)).toBe('alert');
    expect(deadlineTone(7)).toBe('warn');
    expect(deadlineTone(14)).toBe('ok');
  });
});

describe('the evidence chips', () => {
  const find = (b: NudgeBrief, label: string) => metricChips(b).find((c) => c.label === label);

  it('shows the numbers the message was written from', () => {
    const chips = metricChips(brief());
    expect(chips.map((c) => c.label)).toEqual(
      expect.arrayContaining(['day', 'built', 'last build', 'artifacts', 'training']),
    );
  });

  /** "No artifacts" and "we never counted" are different facts, and only one is a zero. */
  it('says "never" rather than 0 when no build work has ever been seen', () => {
    const c = find(brief({ signals: { ...brief().signals, daysSinceBuildWork: null } }), 'last build');
    expect(c?.value).toBe('never');
    expect(c?.tone).toBe('alert');
  });

  it('omits the build chip entirely for someone with no project to build on', () => {
    const b = brief({ projectName: null, signals: { ...brief().signals, daysSinceBuildWork: null } });
    expect(find(b, 'last build')).toBeUndefined();
  });

  it('escalates the quiet chip with the number of days, not by eye', () => {
    const at = (d: number) => find(brief({ signals: { ...brief().signals, daysSinceBuildWork: d } }), 'last build')?.tone;
    expect(at(0)).toBe('ok');
    expect(at(3)).toBe('ok');
    expect(at(4)).toBe('warn');
    expect(at(9)).toBe('warn');
    expect(at(10)).toBe('alert');
  });

  it('does not render an overdue chip when nothing is overdue', () => {
    expect(find(brief(), 'overdue')).toBeUndefined();
    expect(find(brief({ signals: { ...brief().signals, overdueTasks: 6 } }), 'overdue')?.tone).toBe('alert');
  });

  it('flags their unanswered questions as the thing waiting on us', () => {
    const c = find(brief({ signals: { ...brief().signals, openQuestions: 2 } }), 'waiting on you');
    expect(c?.value).toBe('2');
    expect(c?.tone).toBe('alert');
  });
});
