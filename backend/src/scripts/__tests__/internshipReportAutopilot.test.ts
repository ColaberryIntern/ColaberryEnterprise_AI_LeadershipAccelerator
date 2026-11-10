/**
 * The internship report on autopilot: when it fires, and how a test copy is kept away from the
 * real daily send.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const registry = require('../lib/reportingRegistry') as {
  REPORTS: Array<{ name: string; sendCT?: string | string[]; sendHourUTC?: number; cadence: unknown; scriptPath: string }>;
  ctSlotDue: (sendCT: unknown, nowCTMin: number) => boolean;
  shouldFireToday: (r: unknown, now?: Date) => boolean;
};
import { sendPlanFor, testSubject } from '../../services/internship/portfolioReport/sendPlan';

const at = (h: number, m: number): number => h * 60 + m;
const entry = registry.REPORTS.find((r) => r.name === 'Internship Portfolio Report')!;

describe('internship report: every morning at 8:00 Central, retry at 9:00', () => {
  it('is registered on the Central-time path, not the UTC-hour stagger', () => {
    expect(entry.sendCT).toEqual(['08:00', '09:00']);
    expect(entry.sendHourUTC).toBeUndefined();
    expect(entry.scriptPath).toBe('backend/src/scripts/runInternshipPortfolioReport.js');
  });

  it('fires every day of the week, weekends included', () => {
    for (let d = 8; d <= 14; d += 1) expect(registry.shouldFireToday(entry, new Date(`2026-11-${d}T14:00:00Z`))).toBe(true);
  });

  it('is due in the 10 minutes after 8:00 and after 9:00, and not otherwise', () => {
    expect(registry.ctSlotDue(entry.sendCT, at(8, 0))).toBe(true);
    expect(registry.ctSlotDue(entry.sendCT, at(8, 9))).toBe(true);
    expect(registry.ctSlotDue(entry.sendCT, at(8, 10))).toBe(false);
    expect(registry.ctSlotDue(entry.sendCT, at(9, 1))).toBe(true);
    expect(registry.ctSlotDue(entry.sendCT, at(7, 59))).toBe(false);
    expect(registry.ctSlotDue(entry.sendCT, at(5, 30))).toBe(false);
  });

  it('single-slot reports keep working, and junk never matches', () => {
    expect(registry.ctSlotDue('05:30', at(5, 30))).toBe(true);
    expect(registry.ctSlotDue('05:30', at(5, 40))).toBe(false);
    expect(registry.ctSlotDue(undefined, at(8, 0))).toBe(false);
    expect(registry.ctSlotDue(['nonsense'], at(8, 0))).toBe(false);
  });
});

describe('internship report: a test copy never touches the real send', () => {
  const now = new Date('2026-11-10T13:05:00Z');

  it('the real send goes to the report list under the per-day key', () => {
    const p = sendPlanFor(now, null);
    expect(p.businessEventId).toBe('internship-report-2026-11-10');
    expect(p.to).toBe('ali@colaberry.com');
  });

  it('--test-to goes to that address only, no CC, under its own per-minute key', () => {
    const p = sendPlanFor(now, 'ali@colaberry.com');
    expect(p).toEqual({ to: 'ali@colaberry.com', cc: [], businessEventId: 'internship-report-test-2026-11-10T13:05' });
    expect(p.businessEventId).not.toBe(sendPlanFor(now, null).businessEventId);
  });

  it('the test subject is marked and still starts "Ali, here\'s" so the inbox manager keeps it', () => {
    const s = testSubject("Ali, here's your Internship Report for Tue, Nov 10, 2026");
    expect(s).toBe("Ali, here's your Internship Report (TEST) for Tue, Nov 10, 2026");
    expect(s.startsWith("Ali, here's")).toBe(true);
  });
});
