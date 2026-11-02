import { coverageWarnings, monthsLabel, profitTakeaway, roasLabel, usd, verdictLabel } from '../adProfitabilityFormat';
import type { AdProfitability, ProfitTotals } from '../../../../../services/adSpendApi';

const totals = (over: Partial<ProfitTotals> = {}): ProfitTotals => ({
  spend: 2000, unmatchedSpend: 0, signups: 371, payers: 4, mrr: 696, collected: 3199,
  costPerSignup: 5.39, cac: 500, roas: 1.6, profit: 1199, paybackMonths: 0, verdict: 'profitable', ...over,
});
const report = (over: Partial<AdProfitability> = {}): AdProfitability => ({
  windowDays: 90, windowStart: '2026-08-05', windowEnd: '2026-11-02', rows: [], totals: totals(), unspentSignups: 0, existingCustomers: 0,
  coverage: { daysCovered: 90, windowDays: 90, lastDayRecorded: '2026-11-01', staleDays: 0 },
  paybackTargetMonths: 12, sync: { meta: { configured: false, accountId: null, reason: 'x' }, lastSync: null }, ...over,
});

describe('ad profitability wording', () => {
  it('never prints a missing number as zero', () => {
    expect(usd(null)).toBe('—');
    expect(roasLabel(null)).toBe('—');
    expect(monthsLabel(null)).toBe('—');
    expect(monthsLabel(0)).toBe('Paid back');
    expect(roasLabel(1.6)).toBe('1.60×');
  });

  it('says plainly when the ads are ahead', () => {
    const t = profitTakeaway(report());
    expect(t).toContain('$2,000 of ad spend brought 371 signups ($5.39 each) and 4 paying members ($500 each).');
    expect(t).toContain('$1,199 ahead (1.60× return)');
  });

  it('says how far behind, and when it closes, when they are not', () => {
    const t = profitTakeaway(report({ totals: totals({ collected: 398, profit: -1602, roas: 0.2, paybackMonths: 2.3 }) }));
    expect(t).toContain('$1,602 short of the spend; at $696 a month that closes in 2.3 mo.');
  });

  it('names spend that matched no signups', () => {
    expect(profitTakeaway(report({ totals: totals({ unmatchedSpend: 250 }) }))).toContain('$250 of spend matches no signups');
  });

  it('warns when spend stops short of yesterday, or a window is too short to judge', () => {
    const w = coverageWarnings(report({ windowDays: 30, coverage: { daysCovered: 20, windowDays: 30, lastDayRecorded: '2026-10-25', staleDays: 7 } }));
    expect(w[0]).toMatch(/recorded only through 2026-10-25/);
    expect(w.some((x) => /Judge a campaign on 90 days/.test(x))).toBe(true);
    expect(coverageWarnings(report())).toEqual([]);
  });

  it('tells a mistyped campaign id apart from a campaign nobody paid for', () => {
    expect(verdictLabel({ verdict: 'no_signups', paybackMonths: null }).hint).toMatch(/Check the campaign id/);
    expect(verdictLabel({ verdict: 'paying_back', paybackMonths: 4.2 }).text).toBe('Paying back · 4.2 mo');
  });
});
