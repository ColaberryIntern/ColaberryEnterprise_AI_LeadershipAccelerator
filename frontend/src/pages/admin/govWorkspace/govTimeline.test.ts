import { buildTimeline, localTodayIso, timelineTone, humanDelta, type DossierDateLike } from './govTimeline';

const today = '2026-10-23';

const kd = (date: string | null, text = '', extra: Partial<DossierDateLike> = {}): DossierDateLike => ({
  date, text, sourceDocument: 'RFP.pdf', ...extra,
});

describe('buildTimeline — chronology + today placement', () => {
  it('sorts dated lines ascending and classifies past / today / upcoming relative to today', () => {
    const t = buildTimeline(
      [kd('October 29, 2026', 'Pre-bid meeting')],
      [kd('September 1, 2027', 'Period of performance'), kd('October 29, 2026', 'Questions due'), kd('October 1, 2026', 'RFP issued'), kd('October 23, 2026', 'Something today')],
      today,
    );
    // ascending by iso
    expect(t.dated.map((d) => d.iso)).toEqual(['2026-10-01', '2026-10-23', '2026-10-29', '2026-10-29', '2027-09-01']);
    // one date strictly before today -> the Today marker sits after exactly 1 item
    expect(t.pastCount).toBe(1);
    expect(t.dated[0].state).toBe('past');
    expect(t.dated[1].state).toBe('today');
    expect(t.dated[1].daysFromToday).toBe(0);
    expect(t.dated[2].state).toBe('upcoming');
    // first item on/after today is the "today" one at index 1
    expect(t.nextUpcomingIndex).toBe(1);
  });

  it('computes signed whole-day deltas across a month boundary (no DST drift)', () => {
    const t = buildTimeline([], [kd('October 1, 2026'), kd('November 6, 2026')], today);
    const byIso = Object.fromEntries(t.dated.map((d) => [d.iso, d.daysFromToday]));
    expect(byIso['2026-10-01']).toBe(-22);
    expect(byIso['2026-11-06']).toBe(14);
  });

  it('keeps undated lines separate instead of dropping them', () => {
    const t = buildTimeline([], [kd(null, 'TBD site visit'), kd('October 29, 2026', 'Questions due')], today);
    expect(t.dated).toHaveLength(1);
    expect(t.undated).toHaveLength(1);
    expect(t.undated[0].text).toBe('TBD site visit');
    expect(t.undated[0].iso).toBeNull();
  });

  it('parses ordinals and abbreviated months via toIsoDate', () => {
    const t = buildTimeline([], [kd('Nov. 6th, 2026', 'Proposals due')], today);
    expect(t.dated[0].iso).toBe('2026-11-06');
  });

  it('when every date is in the past, the Today marker lands at the end (all missed)', () => {
    const t = buildTimeline([], [kd('October 1, 2026'), kd('October 10, 2026')], today);
    expect(t.pastCount).toBe(2);
    expect(t.nextUpcomingIndex).toBeNull();
  });

  it('handles empty / null inputs without throwing', () => {
    const t = buildTimeline(null, undefined, today);
    expect(t.dated).toHaveLength(0);
    expect(t.undated).toHaveLength(0);
    expect(t.pastCount).toBe(0);
    expect(t.nextUpcomingIndex).toBeNull();
  });
});

describe('timelineTone — urgency by proximity', () => {
  it('mutes the past, accents today, and warms up as an upcoming date nears', () => {
    const t = buildTimeline(
      [],
      [kd('October 1, 2026'), kd('October 23, 2026'), kd('October 25, 2026'), kd('October 29, 2026'), kd('December 1, 2026')],
      today,
    );
    const toneByIso = Object.fromEntries(t.dated.map((d) => [d.iso, timelineTone(d)]));
    expect(toneByIso['2026-10-01']).toBe('secondary'); // past
    expect(toneByIso['2026-10-23']).toBe('primary');   // today
    expect(toneByIso['2026-10-25']).toBe('danger');    // in 2 days
    expect(toneByIso['2026-10-29']).toBe('warning');   // in 6 days
    expect(toneByIso['2026-12-01']).toBe('success');   // comfortably out
  });
});

describe('humanDelta / localTodayIso', () => {
  it('phrases the relative distance in plain words', () => {
    expect(humanDelta(0)).toBe('today');
    expect(humanDelta(1)).toBe('in 1 day');
    expect(humanDelta(6)).toBe('in 6 days');
    expect(humanDelta(-1)).toBe('1 day ago');
    expect(humanDelta(-22)).toBe('22 days ago');
  });

  it('formats local today as YYYY-MM-DD', () => {
    expect(localTodayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localTodayIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
