import { formatEventWhen, truncateBlurb, groupByMonth } from '../EventsPage';
import type { OpenHouseView } from '../../../../services/onboardingApi';

/**
 * Pure display helpers for the Events page. These carry the formatting the
 * legacy training-site cards showed, so they are worth testing away from React.
 */

const ev = (id: string, title: string, starts: string): OpenHouseView => ({
  id, title, description: null, starts_at: starts, ends_at: null,
  timezone: 'America/Chicago', registration_url: null, meeting_link: null, image_url: null,
  signup_count: null, is_registered: false,
});

describe('formatEventWhen', () => {
  it('renders a Central date and start time', () => {
    // 15:00Z on Sep 1 is 10:00 AM CDT — the internship event's real slot.
    expect(formatEventWhen('2026-09-01T15:00:00Z', null))
      .toBe('Tue, Sep 1, 2026 10:00 AM');
  });

  it('renders a range when the end is after the start', () => {
    expect(formatEventWhen('2026-09-01T15:00:00Z', '2026-09-01T17:00:00Z'))
      .toBe('Tue, Sep 1, 2026 10:00 AM - 12:00 PM');
  });

  it('drops a degenerate end that equals or precedes the start', () => {
    // CCPP has rows shaped like this; "10:00 AM - 10:00 AM" reads as a bug.
    expect(formatEventWhen('2026-09-01T15:00:00Z', '2026-09-01T15:00:00Z'))
      .toBe('Tue, Sep 1, 2026 10:00 AM');
    expect(formatEventWhen('2026-09-01T15:00:00Z', '2026-09-01T14:00:00Z'))
      .toBe('Tue, Sep 1, 2026 10:00 AM');
  });

  it('stays in Central across the DST boundary', () => {
    // Nov 24 is CST (UTC-6), so 16:00Z is 10:00 AM — not 11:00.
    expect(formatEventWhen('2026-11-24T16:00:00Z', null))
      .toBe('Tue, Nov 24, 2026 10:00 AM');
  });

  it('returns empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatEventWhen('not-a-date', null)).toBe('');
  });
});

describe('truncateBlurb', () => {
  it('leaves short copy whole and unmarked', () => {
    const r = truncateBlurb('See the next generation of AI professionals in Action.');
    expect(r.cut).toBe(false);
    expect(r.text).toBe('See the next generation of AI professionals in Action.');
  });

  it('cuts long copy at a word boundary and flags it', () => {
    const r = truncateBlurb('x'.repeat(40) + ' ' + 'word '.repeat(40), 60);
    expect(r.cut).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(60);
    expect(r.text.endsWith(' ')).toBe(false);
  });

  it('collapses whitespace and handles null', () => {
    expect(truncateBlurb('  a\n\n  b  ').text).toBe('a b');
    expect(truncateBlurb(null)).toEqual({ text: '', cut: false });
  });

  it('still truncates when there is no usable early space', () => {
    const r = truncateBlurb('y'.repeat(200), 50);
    expect(r.cut).toBe(true);
    expect(r.text).toHaveLength(50);
  });
});

describe('groupByMonth', () => {
  it('groups consecutive events under one month heading, in order', () => {
    const groups = groupByMonth([
      ev('1', 'A', '2026-09-01T15:00:00Z'),
      ev('2', 'B', '2026-09-29T15:00:00Z'),
      ev('3', 'C', '2026-10-06T15:00:00Z'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['September 2026', 'October 2026']);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it('buckets by Central month, not UTC', () => {
    // 2026-10-01T02:00Z is Sep 30, 9:00 PM CDT — September, not October.
    expect(groupByMonth([ev('1', 'A', '2026-10-01T02:00:00Z')])[0].label).toBe('September 2026');
  });

  it('skips unparseable dates instead of emitting an "Invalid Date" heading', () => {
    expect(groupByMonth([ev('1', 'A', 'nope')])).toEqual([]);
  });

  it('returns an empty list for no events', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
