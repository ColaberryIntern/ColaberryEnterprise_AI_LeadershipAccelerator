/**
 * Words and numbers for the ad profitability card. Pure, so the rules are tested directly.
 *
 * A null is never printed as 0. CAC is null until someone pays, ROAS until something was spent,
 * payback until there is MRR to pay it back with: "$0 CAC" or "0 months" would each claim a
 * result that has not happened.
 */
import type { AdProfitability, ProfitRow, ProfitTotals, Verdict } from '../../../../services/adSpendApi';
import { EM_DASH, formatCount, sourceLabel } from './performanceMetrics';

export function usd(n: number | null | undefined, cents = false): string {
  if (n == null || !Number.isFinite(n)) return EM_DASH;
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return n < 0 ? `−$${abs}` : `$${abs}`;
}

export function signedUsd(n: number): string {
  if (Math.round(n) === 0) return '$0';
  return n > 0 ? `+${usd(n)}` : usd(n);
}

/** ROAS as a multiple: 1.6×. */
export function roasLabel(roas: number | null): string {
  return roas == null || !Number.isFinite(roas) ? EM_DASH : `${roas.toFixed(roas < 10 ? 2 : 1)}×`;
}

export function monthsLabel(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return EM_DASH;
  if (m === 0) return 'Paid back';
  return m < 1 ? '< 1 mo' : `${m.toFixed(m < 10 ? 1 : 0)} mo`;
}

export type Tone = 'ok' | 'warn' | 'bad' | 'muted';

export function verdictLabel(r: Pick<ProfitRow, 'verdict' | 'paybackMonths'>): { text: string; tone: Tone; hint: string } {
  const months = monthsLabel(r.paybackMonths);
  const map: Record<Verdict, { text: string; tone: Tone; hint: string }> = {
    profitable: { text: 'Paid back', tone: 'ok', hint: 'Cash collected from these signups already covers the spend.' },
    paying_back: { text: `Paying back · ${months}`, tone: 'ok', hint: 'Not yet covered, but current MRR covers the rest within the target.' },
    slow: { text: `Slow · ${months}`, tone: 'warn', hint: 'At current MRR, paying back takes longer than the target.' },
    no_payers: { text: 'No payers yet', tone: 'bad', hint: 'Signups, but nobody from this campaign is paying today.' },
    no_signups: { text: 'Spend, no signups', tone: 'bad', hint: 'No signup carries this campaign in utm_campaign. Check the campaign id or the ad URL.' },
    no_spend: { text: 'No spend recorded', tone: 'muted', hint: 'Organic, untagged, or spend not entered yet.' },
  };
  return map[r.verdict];
}

export function campaignTitle(r: ProfitRow): string {
  if (r.verdict === 'no_spend' && !r.campaignRef) return 'Untagged / organic';
  return r.campaignName || r.campaignRef || 'Untagged';
}

export function splitLabel(utmSource: string | null): string {
  return sourceLabel(utmSource);
}

/** The sentence at the top of the card. Names the answer, then the biggest caveat. */
export function profitTakeaway(d: AdProfitability): string {
  const t: ProfitTotals = d.totals;
  if (t.spend <= 0) return 'No ad spend is recorded for this window, so there is nothing to set the return against yet.';
  const parts = [
    `${usd(t.spend)} of ad spend brought ${formatCount(t.signups)} signups (${usd(t.costPerSignup, true)} each)`
      + (t.payers > 0 ? ` and ${formatCount(t.payers)} paying members (${usd(t.cac)} each).` : ', and none of them is paying yet.'),
  ];
  if (t.collected > 0 || t.payers > 0) {
    parts.push(t.profit >= 0
      ? `They have paid ${usd(t.collected)}, so the ads are ${usd(t.profit)} ahead (${roasLabel(t.roas)} return).`
      : `They have paid ${usd(t.collected)} so far, ${usd(-t.profit)} short of the spend`
        + (t.paybackMonths != null ? `; at ${usd(t.mrr)} a month that closes in ${monthsLabel(t.paybackMonths)}.` : '.'));
  }
  if (t.unmatchedSpend > 0) parts.push(`${usd(t.unmatchedSpend)} of spend matches no signups' campaign tag.`);
  return parts.join(' ');
}

/** Warnings that change how much to trust the numbers, most serious first. */
export function coverageWarnings(d: AdProfitability): string[] {
  const out: string[] = [];
  const c = d.coverage;
  if (c.lastDayRecorded && c.staleDays != null && c.staleDays > 1) {
    out.push(`Spend is recorded only through ${c.lastDayRecorded}. The ${c.staleDays} days since have no spend, so cost is understated and return overstated.`);
  }
  if (c.daysCovered > 0 && c.daysCovered < c.windowDays - (c.staleDays ?? 0) - 1) {
    out.push(`Spend covers ${c.daysCovered} of ${c.windowDays} days in this window. Days with ads running and nothing recorded make the ads look cheaper than they were.`);
  }
  if (d.windowDays < 60 && d.totals.spend > 0) {
    out.push('Explorers take weeks to start paying, so a short window understates the return. Judge a campaign on 90 days.');
  }
  return out;
}
