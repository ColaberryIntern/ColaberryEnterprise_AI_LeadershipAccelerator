/**
 * AL1 send rules (Ali, 2026-11-23): nobody with an invalid placement date; one send every 5 minutes,
 * 6 AM to 11 PM CT, weekdays only; all ten emails before the end of the year; payers removed;
 * nobody moved anywhere when they finish.
 */
jest.mock('../../llmCallWrapper', () => ({ getOpenAI: jest.fn() }));

import { hasValidPlacementDate } from '../alumniPersonalOpening';
import { AL1_SLOT_RULES, AL1_FIRST_SEND, sendSlots, planSends, stepStarts, isWeekday } from '../alumniSendSlots';
import { DA_ALUMNI_STEPS } from '../daAlumniHolidayCopy';
import { AL1_SETTINGS_PATCH, settingsNeedPatch } from '../../../scripts/ensureDaAlumniHolidayCampaign';
import { readOnComplete } from '../../campaignMembership';

const NOW = new Date('2026-11-23T12:00:00Z');
const HOUR = 3_600_000;
const ct = (t: number) => new Date(t).toLocaleString('sv-SE', { timeZone: 'America/Chicago' });
const ctDay = (t: number) => ct(t).slice(0, 10);
const ctMinutes = (t: number) => { const [h, m] = ct(t).slice(11, 16).split(':').map(Number); return h * 60 + m; };

describe('placement dates (Ali: "don\'t put anyone in with invalid placement dates")', () => {
  it('a real past placement on or after registration is valid', () => {
    expect(hasValidPlacementDate({ hired_date: '2021-03-15', register_date: '2020-07-11' }, NOW)).toBe(true);
    expect(hasValidPlacementDate({ hired_date: '2021-03-15T00:00:00.000Z' }, NOW)).toBe(true);
  });
  it('missing, the 1/1/1900 placeholder, an impossible day, the future, or before registering: invalid', () => {
    expect(hasValidPlacementDate({}, NOW)).toBe(false);
    expect(hasValidPlacementDate(null, NOW)).toBe(false);
    expect(hasValidPlacementDate({ hired_date: '1900-01-01' }, NOW)).toBe(false);
    expect(hasValidPlacementDate({ hired_date: '1899-12-31' }, NOW)).toBe(false);
    expect(hasValidPlacementDate({ hired_date: '2021-02-30' }, NOW)).toBe(false);
    expect(hasValidPlacementDate({ hired_date: 'n/a' }, NOW)).toBe(false);
    expect(hasValidPlacementDate({ hired_date: '2027-01-05' }, NOW)).toBe(false);
    expect(hasValidPlacementDate({ hired_date: '2019-01-01', register_date: '2020-07-11' }, NOW)).toBe(false);
  });
});

describe('send slots: 6 AM to 11 PM CT, Mon-Fri, 5 minutes apart', () => {
  const slots = sendSlots(AL1_SLOT_RULES, AL1_FIRST_SEND.getTime());
  it('only weekdays, only inside the window, exactly 5 minutes apart within a day', () => {
    expect(slots.length).toBeGreaterThan(5640);
    for (let i = 0; i < slots.length; i++) {
      const t = slots[i];
      expect(isWeekday(ctDay(t))).toBe(true);
      expect(ctMinutes(t)).toBeGreaterThanOrEqual(6 * 60);
      expect(ctMinutes(t)).toBeLessThan(23 * 60);
      if (i && ctDay(t) === ctDay(slots[i - 1])) expect(t - slots[i - 1]).toBe(5 * 60_000);
    }
    expect(ct(slots[0]).slice(0, 16)).toBe('2026-11-24 10:00');
    expect(ctDay(slots[slots.length - 1])).toBe('2026-12-31');
  });
  it('Thanksgiving and weekends follow the rules too: Sat Nov 28 has no slot', () => {
    expect(slots.some((t) => ctDay(t) === '2026-11-28')).toBe(false);
    expect(slots.some((t) => ctDay(t) === '2026-11-29')).toBe(false);
  });
});

describe('the plan for 564 alumni', () => {
  const slots = sendSlots(AL1_SLOT_RULES, NOW.getTime());
  const starts = stepStarts(DA_ALUMNI_STEPS.map((s) => s.date), NOW.getTime());
  const plan = planSends(564, starts, slots, new Set(), AL1_SLOT_RULES.minPersonGapHours * HOUR);
  const all = plan.flatMap((p) => p || []);

  it('everyone gets all ten before the end of the year, and no two sends share a slot', () => {
    expect(plan.every((p) => p && p.length === 10)).toBe(true);
    expect(all.length).toBe(5640);
    expect(new Set(all).size).toBe(5640);
    expect(Math.max(...all)).toBeLessThan(new Date('2027-01-01T06:00:00Z').getTime());
    expect(Math.min(...all)).toBe(AL1_FIRST_SEND.getTime());
  });
  it('a person\'s emails go in order, at least a day apart, none before its own first day', () => {
    for (const p of plan as number[][]) {
      for (let k = 0; k < 10; k++) {
        expect(p[k]).toBeGreaterThanOrEqual(starts[k]);
        if (k) expect(p[k] - p[k - 1]).toBeGreaterThanOrEqual(24 * HOUR);
      }
    }
  });
  it('the holiday emails land where their words fit', () => {
    for (const p of plan as number[][]) {
      expect(ctDay(p[1]) >= '2026-11-27').toBe(true);   // "I hope you had a good Thanksgiving"
      expect(ctDay(p[9]) >= '2026-12-28').toBe(true);   // "Happy New Year"
    }
  });
  it('the same inputs always give the same plan', () => {
    expect(planSends(564, starts, slots, new Set(), AL1_SLOT_RULES.minPersonGapHours * HOUR)).toEqual(plan);
  });
});

describe('booking more later, and running out of room', () => {
  const slots = sendSlots(AL1_SLOT_RULES, NOW.getTime());
  const starts = stepStarts(DA_ALUMNI_STEPS.map((s) => s.date), NOW.getTime());
  const gap = AL1_SLOT_RULES.minPersonGapHours * HOUR;
  it('a re-run never reuses a slot an earlier booking holds', () => {
    const first = planSends(10, starts, slots, new Set(), gap).flatMap((p) => p || []);
    const second = planSends(10, starts, slots, new Set(first), gap).flatMap((p) => p || []);
    expect(second.filter((t) => first.includes(t))).toEqual([]);
  });
  it('someone who cannot get all ten by Dec 31 is not booked at all, and frees what they held', () => {
    const plan = planSends(700, starts, slots, new Set(), gap);
    const left = plan.filter((p) => p === null).length;
    expect(left).toBeGreaterThan(0);
    expect(plan.filter(Boolean).every((p) => p!.length === 10)).toBe(true);
    const used = plan.flatMap((p) => p || []);
    expect(new Set(used).size).toBe(used.length);
  });
  it('nobody is booked into the past', () => {
    const late = new Date('2026-12-01T18:00:00Z').getTime();
    const p = planSends(5, stepStarts(DA_ALUMNI_STEPS.map((s) => s.date), late), sendSlots(AL1_SLOT_RULES, late), new Set(), gap);
    for (const x of p) if (x) expect(Math.min(...x)).toBeGreaterThanOrEqual(late);
  });
});

describe('campaign settings', () => {
  it('window and days match the slots; payers removed; nobody moved on', () => {
    expect(AL1_SETTINGS_PATCH).toMatchObject({ send_time_start: '06:00', send_time_end: '23:00', send_active_days: [1, 2, 3, 4, 5],
      min_send_gap_minutes: 5, remove_if_paid: true, send_timezone: 'America/Chicago' });
    expect(readOnComplete(AL1_SETTINGS_PATCH)).toEqual({ action: 'remove' });
  });
  it('a campaign missing any rule needs the patch; one that has them all does not', () => {
    expect(settingsNeedPatch({ send_time_start: '08:00' })).toBe(true);
    expect(settingsNeedPatch(null)).toBe(true);
    expect(settingsNeedPatch({ other: 1, ...AL1_SETTINGS_PATCH })).toBe(false);
  });
});
