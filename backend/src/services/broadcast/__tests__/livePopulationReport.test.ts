/**
 * The monthly Colaberry Live report (C8.10 AC3).
 *
 * Two halves that must fail independently - a Cloudflare outage must not suppress the
 * learner count, and a blind telemetry month must not suppress the cost figure - plus the
 * assembly-level guards, which exist because a correct policy can still be undone by a
 * headline that quotes a number the policy refused to publish.
 */
jest.mock('../broadcastPopulationService', () => ({
  ...jest.requireActual('../broadcastPopulationService'),
  readMonthlyPopulation: jest.fn(),
}));
jest.mock('../cloudflareStreamMinutes', () => ({
  ...jest.requireActual('../cloudflareStreamMinutes'),
  readDeliveredMinutes: jest.fn(),
}));

import { readMonthlyPopulation } from '../broadcastPopulationService';
import { readDeliveredMinutes } from '../cloudflareStreamMinutes';
import {
  BREAK_EVEN,
  assertReportNeverQuotesAnUnmeasuredCount,
  assertUnavailableMinutesAreNotZero,
  buildLivePopulationReport,
  currentReportMonth,
  lastDayOf,
} from '../livePopulationReport';

const pop = readMonthlyPopulation as jest.Mock;
const minutes = readDeliveredMinutes as jest.Mock;

const observed = (over: Record<string, unknown> = {}) => ({
  window: { from: '2026-11-01', to: '2026-12-01' },
  coverage: 'clean',
  airings: 2,
  learners: 40,
  deliberate: 25,
  auto: 15,
  watchSeconds: 7200,
  ...over,
});

beforeEach(() => {
  pop.mockReset();
  minutes.mockReset();
  minutes.mockResolvedValue({ ok: false, reason: 'not_authorized', detail: 'scope' });
});

describe('lastDayOf', () => {
  it('converts a closed-open end into the inclusive day Cloudflare wants', () => {
    // Off-by-one lives here, in one place, with a test on it.
    expect(lastDayOf('2026-12-01')).toBe('2026-11-30');
    expect(lastDayOf('2027-01-01')).toBe('2026-12-31');
    expect(lastDayOf('2026-03-01')).toBe('2026-02-28');
  });
});

describe('currentReportMonth', () => {
  it('uses the house timezone, not the container clock', () => {
    // 1 November 2026, 02:00 UTC is still 31 October in Texas. A UTC read would roll the
    // default report into an empty November while October was still running.
    const m = currentReportMonth(Date.parse('2026-11-01T02:00:00Z'));
    expect(m).toEqual({ year: 2026, month: 10 });
  });

  it('agrees with UTC in the middle of a day', () => {
    expect(currentReportMonth(Date.parse('2026-11-15T18:00:00Z')))
      .toEqual({ year: 2026, month: 11 });
  });
});

describe('a measured month', () => {
  it('publishes the count, the watch minutes and the break-even comparison', async () => {
    pop.mockResolvedValue(observed());
    const r = await buildLivePopulationReport(2026, 11);

    expect(r.population.state).toBe('measured');
    expect(r.population.learners).toBe(40);
    expect(r.watchMinutes).toBe(120);
    expect(r.headline).toMatch(/40 learner\(s\) shared Colaberry Live in November 2026/);
    expect(r.breakEvenProgress).toMatch(/40 of the 881/);
  });

  it('says plainly that the break-even target is not a population claim', async () => {
    pop.mockResolvedValue(observed());
    const r = await buildLivePopulationReport(2026, 11);
    // The ticket's premise treats 881 as a figure about Colaberry Live's audience. It is
    // a licence break-even from C1.5r. Reporting it without that correction would import
    // an error the source never made.
    expect(BREAK_EVEN.isNotA).toMatch(/count of people who watch/);
    expect(r.breakEvenProgress).toMatch(/requirement, not a previously claimed population/);
  });

  it('reports a genuine measured zero as a finding', async () => {
    pop.mockResolvedValue(observed({ learners: 0, deliberate: 0, auto: 0, watchSeconds: 0 }));
    const r = await buildLivePopulationReport(2026, 11);
    expect(r.population.state).toBe('measured');
    expect(r.headline).toMatch(/no learner watched.*measured zero/s);
  });
});

describe('a month the instrument could not see', () => {
  it('refuses the count, the watch minutes and the break-even line together', async () => {
    pop.mockResolvedValue(observed({ coverage: 'partially_blind', learners: 3 }));
    const r = await buildLivePopulationReport(2026, 10);

    expect(r.population.state).toBe('unmeasurable');
    expect(r.population.learners).toBeNull();
    // Watch minutes would restate the same fabrication in a second unit.
    expect(r.watchMinutes).toBeNull();
    expect(r.breakEvenProgress).toBeNull();
    expect(r.headline).toMatch(/unknown, not zero/);
  });

  it('still exposes the raw rows, so an operator can see what WAS captured', async () => {
    pop.mockResolvedValue(observed({ coverage: 'fully_blind', learners: 3 }));
    const r = await buildLivePopulationReport(2026, 10);
    // The refusal is about what may be PUBLISHED as a measurement, not about hiding data.
    expect(r.observed.learners).toBe(3);
    expect(r.population.learners).toBeNull();
  });
});

describe('a month with nothing on', () => {
  it('does not call an empty schedule an audience of zero', async () => {
    pop.mockResolvedValue(observed({ airings: 0, learners: 0, deliberate: 0, auto: 0 }));
    const r = await buildLivePopulationReport(2026, 11);
    expect(r.population.state).toBe('no_airings');
    expect(r.headline).toBe('Colaberry Live did not air in November 2026.');
    expect(r.watchMinutes).toBeNull();
  });
});

describe('the two halves fail independently', () => {
  it('keeps the learner count when Cloudflare is unreadable', async () => {
    pop.mockResolvedValue(observed());
    minutes.mockResolvedValue({ ok: false, reason: 'not_authorized', detail: 'scope' });
    const r = await buildLivePopulationReport(2026, 11);
    expect(r.population.learners).toBe(40);
    expect(r.deliveredMinutes.ok).toBe(false);
  });

  it('keeps the cost figure when the audience is unmeasurable', async () => {
    pop.mockResolvedValue(observed({ coverage: 'fully_blind' }));
    minutes.mockResolvedValue({
      ok: true, minutes: 500, days: 3, from: '2026-10-01', to: '2026-10-31',
    });
    const r = await buildLivePopulationReport(2026, 10);
    expect(r.population.learners).toBeNull();
    expect(r.deliveredMinutes).toMatchObject({ ok: true, minutes: 500 });
  });
});

describe('the assembly guards', () => {
  it('pass on a well-formed report', async () => {
    pop.mockResolvedValue(observed());
    const r = await buildLivePopulationReport(2026, 11);
    expect(() => assertReportNeverQuotesAnUnmeasuredCount(r)).not.toThrow();
    expect(() => assertUnavailableMinutesAreNotZero(r)).not.toThrow();
  });

  it('catch a headline that quotes a count the verdict withheld', async () => {
    pop.mockResolvedValue(observed({ coverage: 'fully_blind' }));
    const r = await buildLivePopulationReport(2026, 10);
    const tampered = { ...r, headline: '40 learner(s) shared Colaberry Live in October 2026.' };
    expect(() => assertReportNeverQuotesAnUnmeasuredCount(tampered))
      .toThrow(/quotes a count the verdict refused/);
  });

  it('catch watch minutes published without a measured population', async () => {
    pop.mockResolvedValue(observed({ coverage: 'fully_blind' }));
    const r = await buildLivePopulationReport(2026, 10);
    expect(() => assertReportNeverQuotesAnUnmeasuredCount({ ...r, watchMinutes: 120 }))
      .toThrow(/without a measured population/);
  });

  it('catch an unavailable cost dressed up as a number', async () => {
    pop.mockResolvedValue(observed());
    const r = await buildLivePopulationReport(2026, 11);
    const tampered = {
      ...r,
      deliveredMinutes: { ok: false as const, reason: 'not_authorized' as const, detail: 'x', minutes: 0 },
    };
    expect(() => assertUnavailableMinutesAreNotZero(tampered as never))
      .toThrow(/carried a number/);
  });
});
