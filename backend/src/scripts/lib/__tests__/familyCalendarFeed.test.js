const { buildWeek, eventDay, eventTime, whoOf } = require('../familyCalendarFeed');
const { validateBeforeSend } = require('../mandrillPreflight');
const { renderFamilyDashboardEmail, renderFamilyDashboardEmailText } = require('../renderFamilyDashboardEmail');

const TODAY = '2026-11-16';

describe('Central-time placement', () => {
  test('an 8 PM Central event (02:00 UTC next day) stays on its Central day', () => {
    expect(eventDay('2026-11-17T02:00:00Z')).toBe('2026-11-16');
    expect(eventTime('2026-11-17T02:00:00Z')).toBe('8:00 PM');
  });
  test('all-day events keep their date and read "All day"', () => {
    expect(eventDay('2026-11-21')).toBe('2026-11-21');
    expect(eventTime('2026-11-21')).toBe('All day');
  });
});

test('whoOf tags each kid by name and everything else as Family', () => {
  expect(whoOf('Creed Performance Training')).toBe('Creed');
  expect(whoOf('Addison PreSeason VB Tourney')).toBe('Addison');
  expect(whoOf('Host friends giving for Jayce')).toBe('Jayce');
  expect(whoOf('Trash Day')).toBe('Family');
});

describe('buildWeek', () => {
  const events = [
    { summary: 'Addison Thanksgiving lunch', start: '2026-11-18T18:00:00Z' },
    { summary: 'Coach Taylor practice', start: '2026-11-17T12:00:00Z' },
    { summary: 'Last week', start: '2026-11-10T12:00:00Z' },
    { summary: 'Too far out', start: '2026-11-30T12:00:00Z' },
  ];
  const school = [{ child: 'Addison', date: '2026-11-18', title: 'Thanksgiving lunch form due' }, { child: 'Creed', date: '2026-11-19', title: 'Balloon project due' }];
  const week = buildWeek(events, school, TODAY);

  test('always 7 days starting today, empty days kept', () => {
    expect(week.map((d) => d.ymd)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(week[0].isToday).toBe(true);
    expect(week[0].items).toEqual([]);
  });
  test('events outside the 7 days are dropped', () => {
    expect(week.flatMap((d) => d.items).map((i) => i.title)).not.toEqual(expect.arrayContaining(['Last week', 'Too far out']));
  });
  test('school dates land on their day, first, and a day with both is a busy day', () => {
    const wed = week[2];
    expect(wed.items[0]).toMatchObject({ source: 'school', who: 'Addison' });
    expect(wed.items[1]).toMatchObject({ source: 'calendar', title: 'Addison Thanksgiving lunch' });
    expect(wed.busy).toBe(true);
    expect(week[3].busy).toBe(false); // school only
  });
});

test('the rendered week passes the Mandrill preflight and is absent when the feed failed', () => {
  const base = {
    generatedAt: '2026-11-16T12:00:00Z',
    kpis: { dueThisWeek: 0, overdue: 0, newSinceYesterday: 0, moneyPendingTotal: 0, sourcesConnected: 1, sourcesTotal: 1 },
    weekLoad: [], basecampHealth: [], newSinceYesterday: [], moneyItems: [], sources: [], risks: [], photos: [], school: null,
  };
  const data = { ...base, week: { days: buildWeek([{ summary: 'Cecil funeral — service', start: '2026-11-20T19:00:00Z' }], [], TODAY), eventCount: 1 } };
  const html = renderFamilyDashboardEmail(data);
  expect(html).toContain('The next 7 days');
  expect(html).toContain('Cecil funeral, service');
  expect(() => validateBeforeSend(html, renderFamilyDashboardEmailText(data))).not.toThrow();
  expect(renderFamilyDashboardEmail({ ...base, week: null })).not.toContain('The next 7 days');
});
