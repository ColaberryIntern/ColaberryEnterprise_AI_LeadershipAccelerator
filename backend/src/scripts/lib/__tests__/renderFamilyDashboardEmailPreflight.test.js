/**
 * The Family Dashboard must clear mandrillPreflight on a realistic morning.
 *
 * From 6 Oct to 10 Nov 2026 every weekday send failed with
 * "named em-dash entity (&mdash;)" and Ali and Addie got nothing. Two sources:
 *   1. dayCell rendered `&mdash;` as the placeholder for a day with zero tickets, which is
 *      nearly every week, so the failure was permanent rather than data-dependent.
 *   2. Free text (Basecamp todo titles, source details) can carry a literal U+2014, which
 *      fails the same gate the first time someone types one into a title.
 *
 * Each case runs the REAL gate (validateBeforeSend), not a regex copy of it.
 */
const { renderFamilyDashboardEmail, renderFamilyDashboardEmailText } = require('../renderFamilyDashboardEmail');
const { validateBeforeSend } = require('../mandrillPreflight');

function fixture(overrides = {}) {
  return {
    generatedAt: '2026-11-10T11:00:00Z',
    kpis: { dueThisWeek: 0, overdue: 0, newSinceYesterday: 0, moneyPendingTotal: 0, sourcesConnected: 2, sourcesTotal: 4 },
    weekLoad: ['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13', 'Sat 14', 'Sun 15'].map((date, i) => ({ dow: date.split(' ')[0], date, due: 0, today: i === 1 })),
    basecampHealth: [],
    newSinceYesterday: [],
    moneyItems: [],
    sources: [{ name: 'Basecamp API', status: 'live', detail: 'Tickets, due dates, lists' }],
    risks: [],
    ...overrides,
  };
}

describe('Family Dashboard email vs mandrillPreflight', () => {
  test('happy path: an empty week (every day zero) passes the gate', () => {
    const data = fixture();
    expect(() => validateBeforeSend(renderFamilyDashboardEmail(data), renderFamilyDashboardEmailText(data))).not.toThrow();
  });

  test('regression: the zero-ticket day placeholder is not an em-dash entity', () => {
    expect(renderFamilyDashboardEmail(fixture())).not.toMatch(/&mdash;|&#0*8212|&#x0*2014/i);
  });

  test('free text with a literal em-dash is normalised, not shipped', () => {
    const title = 'Scope term life insurance pricing — get coverage to match';
    const data = fixture({
      moneyItems: [{ title, amount: '$14.07', listName: 'Insurance', url: 'https://example.test/t/1' }],
      newSinceYesterday: [{ title, meta: 'Insurance', url: 'https://example.test/t/1' }],
      sources: [{ name: 'Basecamp API', status: 'live', detail: 'Tickets, due dates, lists — fully wired' }],
      risks: [{ title, detail: 'Connected — reachable' }],
      kpis: { dueThisWeek: 1, overdue: 1, newSinceYesterday: 1, moneyPendingTotal: 14.07, sourcesConnected: 2, sourcesTotal: 4 },
    });
    const html = renderFamilyDashboardEmail(data);
    const text = renderFamilyDashboardEmailText(data);
    expect(html).not.toContain('—');
    expect(text).not.toContain('—');
    expect(html).toContain('Scope term life insurance pricing - get coverage');
    expect(() => validateBeforeSend(html, text)).not.toThrow();
  });

  test('control: the gate still fires on a raw entity, so the passes above mean something', () => {
    expect(() => validateBeforeSend('<div>a &mdash; b</div>', 'a b')).toThrow(/em-dash/i);
  });

  test('idempotent: rendering the same data twice yields identical HTML', () => {
    const data = fixture();
    expect(renderFamilyDashboardEmail(data)).toBe(renderFamilyDashboardEmail(data));
  });
});
