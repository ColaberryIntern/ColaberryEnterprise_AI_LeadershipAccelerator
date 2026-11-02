/**
 * Are the ads paying for themselves? Spend per campaign set against what that campaign's signups
 * have paid and are paying.
 *
 * ── THE MATCH, AS A GRAPH ──
 *
 * Signups carry `utm_campaign`, set in the ad URL as either {{campaign.id}} or {{campaign.name}}.
 * Spend carries every id and name its campaign was recorded under (spendAllocation `aliases`).
 * A spend campaign and a signup group are linked when the group's utm_campaign is one of those
 * aliases, and each connected set becomes ONE row. So:
 *   - a campaign whose ads used the id in some URLs and the name in others: one row, both groups;
 *   - two campaigns that share a name used in utm_campaign: one row with both spends, because the
 *     signups cannot be told apart, and splitting them would be invented;
 *   - Meta and Google spend under the same utm_campaign: one row, spend added.
 * Spend linked to no signups is NOT dropped: it stays in the total and is listed, so a mistyped id
 * is visible instead of quietly making the ads look cheaper.
 *
 * ── WHAT EACH NUMBER MEANS ──
 *
 *  cost per signup  spend / signups
 *  CAC              spend / signups paying today          (null until someone pays)
 *  collected        cash these signups have paid so far, net of refunds
 *  ROAS             collected / spend                      (cash to date, not projected value)
 *  profit           collected - spend
 *  payback months   (spend - collected) / their MRR        (0 once covered; null with no MRR)
 *
 * "Paid back" needs someone paying: a refundable $50 deposit covering a $40 test is not a
 * profitable campaign. The ad TOTAL credits only rows that spent: an organic payer is not a
 * return on ad spend.
 *
 * Pure: cents in, dollars out, no database, no clock.
 */
import { CampaignSpend, normaliseRef } from './spendAllocation';

export interface CohortRow {
  utmSource: string | null;
  utmCampaign: string | null;
  signups: number;
  payers: number;
  mrr: number;
  collectedCents: number;
}

export type Verdict = 'profitable' | 'paying_back' | 'slow' | 'no_payers' | 'no_signups' | 'no_spend';

export interface SourceSplit {
  utmSource: string | null;
  signups: number;
  payers: number;
  mrr: number;
  collected: number;
  /** Spend on the matching placement, only when ALL of the row's spend was broken down by placement. */
  spend: number | null;
  costPerSignup: number | null;
}

export interface ProfitRow {
  key: string;
  campaignRef: string | null;
  campaignName: string | null;
  platform: string | null;
  spend: number;
  signups: number;
  payers: number;
  mrr: number;
  collected: number;
  costPerSignup: number | null;
  cac: number | null;
  roas: number | null;
  profit: number;
  paybackMonths: number | null;
  verdict: Verdict;
  bySource: SourceSplit[];
  daysWithSpend: number;
  spendSources: string[];
}

export interface ProfitTotals {
  spend: number;
  unmatchedSpend: number;
  signups: number;
  payers: number;
  mrr: number;
  collected: number;
  costPerSignup: number | null;
  cac: number | null;
  roas: number | null;
  profit: number;
  paybackMonths: number | null;
  verdict: Verdict;
}

export const PAYBACK_TARGET_MONTHS = 12;

const PLACEMENT_FOR_SOURCE: Record<string, string> = {
  fb: 'facebook', facebook: 'facebook', ig: 'instagram', instagram: 'instagram',
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (n: number, d: number, dp = 2) => (d > 0 ? Math.round((n / d) * 10 ** dp) / 10 ** dp : null);

export function judge(spend: number, signups: number, payers: number, collected: number, mrr: number) {
  let paybackMonths: number | null = null;
  if (spend > 0 && payers > 0 && collected >= spend) paybackMonths = 0;
  else if (mrr > 0) paybackMonths = Math.round(((spend - collected) / mrr) * 10) / 10;

  let verdict: Verdict;
  if (spend <= 0) verdict = 'no_spend';
  else if (signups === 0) verdict = 'no_signups';
  else if (payers === 0) verdict = 'no_payers';
  else if (collected >= spend) verdict = 'profitable';
  else if (paybackMonths !== null && paybackMonths <= PAYBACK_TARGET_MONTHS) verdict = 'paying_back';
  else verdict = 'slow';

  return {
    profit: r2(collected - spend),
    paybackMonths,
    verdict,
    costPerSignup: spend > 0 ? ratio(spend, signups) : null,
    cac: spend > 0 ? ratio(spend, payers) : null,
    roas: ratio(collected, spend),
  };
}

/** Union-find over string ids. */
function makeSets() {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) { p = find(p); parent.set(x, p); }
    return p;
  };
  const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  return { find, union, add: (x: string) => { if (!parent.has(x)) parent.set(x, x); } };
}

export function buildProfitability(spend: CampaignSpend[], cohorts: CohortRow[]): { rows: ProfitRow[]; totals: ProfitTotals } {
  const groups = new Map<string, CohortRow[]>();
  for (const c of cohorts) {
    const key = c.utmCampaign ? normaliseRef(c.utmCampaign) : '';
    const list = groups.get(key);
    if (list) list.push(c); else groups.set(key, [c]);
  }

  const sets = makeSets();
  groups.forEach((_l, g) => sets.add(`g:${g}`));
  for (const s of spend) {
    sets.add(`s:${s.key}`);
    for (const alias of s.aliases) {
      // The untagged group ('') is never joined to spend: no alias is empty.
      if (alias && groups.has(alias)) sets.union(`s:${s.key}`, `g:${alias}`);
    }
  }

  const components = new Map<string, { groups: string[]; spends: CampaignSpend[] }>();
  const comp = (id: string) => {
    const root = sets.find(id);
    const c = components.get(root) ?? { groups: [], spends: [] };
    components.set(root, c);
    return c;
  };
  groups.forEach((_l, g) => comp(`g:${g}`).groups.push(g));
  for (const s of spend) comp(`s:${s.key}`).spends.push(s);

  const rows: ProfitRow[] = [];
  components.forEach(({ groups: gs, spends }) => {
    const list = gs.flatMap((g) => groups.get(g) ?? []);
    const spendCents = spends.reduce((t, s) => t + s.spendCents, 0);
    const spendD = r2(spendCents / 100);
    const signups = list.reduce((t, c) => t + c.signups, 0);
    const payers = list.reduce((t, c) => t + c.payers, 0);
    const mrr = r2(list.reduce((t, c) => t + c.mrr, 0));
    const collected = r2(list.reduce((t, c) => t + c.collectedCents, 0) / 100);

    // Per-placement spend is only honest when every cent of the row's spend was broken down.
    const placementCents: Record<string, number> = {};
    for (const s of spends) for (const [p, c] of Object.entries(s.byPlacementCents)) placementCents[p] = (placementCents[p] ?? 0) + c;
    const fullyPlaced = spendCents > 0 && !placementCents[''];

    const bySourceMap = new Map<string, SourceSplit>();
    for (const c of list) {
      const k = (c.utmSource ?? '').toLowerCase();
      const cur = bySourceMap.get(k) ?? { utmSource: c.utmSource, signups: 0, payers: 0, mrr: 0, collected: 0, spend: null, costPerSignup: null };
      cur.signups += c.signups; cur.payers += c.payers; cur.mrr = r2(cur.mrr + c.mrr); cur.collected = r2(cur.collected + c.collectedCents / 100);
      bySourceMap.set(k, cur);
    }
    const bySource = Array.from(bySourceMap.values()).map((b) => {
      const placement = b.utmSource ? PLACEMENT_FOR_SOURCE[b.utmSource.toLowerCase()] : undefined;
      const placed = fullyPlaced && placement ? r2((placementCents[placement] ?? 0) / 100) : null;
      return { ...b, spend: placed, costPerSignup: placed !== null && placed > 0 ? ratio(placed, b.signups) : null };
    }).sort((a, b) => b.signups - a.signups);

    const primary = spends[0] ?? null;
    const names = Array.from(new Set(spends.map((s) => s.campaignName).filter((n): n is string => !!n)));
    rows.push({
      key: primary ? spends.map((s) => s.key).sort().join('+') : `utm:${gs.join('+')}`,
      campaignRef: primary ? spends.map((s) => s.campaignRef).join(', ') : (list[0]?.utmCampaign || null),
      campaignName: names.length ? names.join(' / ') : null,
      platform: primary ? Array.from(new Set(spends.map((s) => s.platform))).join(', ') : null,
      spend: spendD, signups, payers, mrr, collected,
      ...judge(spendD, signups, payers, collected, mrr),
      bySource,
      daysWithSpend: spends.reduce((t, s) => Math.max(t, s.daysWithSpend), 0),
      spendSources: Array.from(new Set(spends.flatMap((s) => s.sources))),
    });
  });

  rows.sort((a, b) => b.spend - a.spend || b.signups - a.signups);

  const spent = rows.filter((r) => r.spend > 0);
  const t = {
    spend: r2(spent.reduce((x, r) => x + r.spend, 0)),
    unmatchedSpend: r2(spent.filter((r) => r.verdict === 'no_signups').reduce((x, r) => x + r.spend, 0)),
    signups: spent.reduce((x, r) => x + r.signups, 0),
    payers: spent.reduce((x, r) => x + r.payers, 0),
    mrr: r2(spent.reduce((x, r) => x + r.mrr, 0)),
    collected: r2(spent.reduce((x, r) => x + r.collected, 0)),
  };
  return { rows, totals: { ...t, ...judge(t.spend, t.signups, t.payers, t.collected, t.mrr) } };
}
