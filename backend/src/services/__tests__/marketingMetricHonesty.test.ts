import fs from 'fs';
import path from 'path';
import { METRICS, mayComputeWith, getMetric, metricsForDomain } from '../adminOs/metricRegistry';

/**
 * The marketing surface must not report numbers it cannot compute.
 *
 * WHAT THIS GUARDS. Before this suite, the marketing read paths produced money figures out of a
 * hardcoded constant:
 *
 *     const PRICE_PER_ENROLLMENT = 4500;
 *     const totalRevenue = enrollments * PRICE_PER_ENROLLMENT;
 *
 * That number was rendered on a tab labelled "Revenue Intelligence" and in a success-green
 * "Total Revenue" KPI card. It was wrong three ways at once: 4,500 is not the price (the current
 * offer is $149/mo), an enrollment is not a payment, and revenue in this business means
 * app-originated checkout only. A campaign with ten enrollments and no collected money reported
 * $45,000. Nothing failed, so nothing surfaced it.
 *
 * The same services divided `campaigns.budget_spent` to get cost-per-lead. The ONLY write to
 * that column anywhere in the codebase is the literal `0` set at campaign creation, so every
 * cost-per-lead was `0 / leads = 0` — rendered as currency, asserting that leads are free.
 *
 * Two kinds of test below, and the distinction is deliberate:
 *   - REGISTRY tests assert the contract: these metrics are not computable, and the gate says so.
 *   - SOURCE tests are regression guards. They read the service files as text and assert the
 *     specific removed constructs have not come back. Coarse, but they pin the exact defect,
 *     and the alternative (booting a DB) tests something else entirely.
 */

const SERVICES = path.join(__dirname, '..');

/**
 * Strip comments before scanning.
 *
 * Learned the hard way: the first version of this suite failed against a correct
 * implementation, because the block comment explaining the removal of `NULL AS platform` and
 * the hardcoded 4500 contains those exact strings. A source-level guard that scans prose
 * asserts that the defect is undocumented, not that it is absent — precisely backwards, since
 * it punishes explaining the fix.
 *
 * Line comments are only stripped when they START the line, so a trailing `//` inside a string
 * (a URL, say) is left alone. That can only leave MORE text in the haystack, never less, so it
 * cannot turn a real failure into a pass.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const readSource = (f: string) => stripComments(fs.readFileSync(path.join(SERVICES, f), 'utf8'));

const MONEY_KEYS = [
  'marketing.roas',
  'marketing.ad_spend',
  'marketing.cost_per_lead',
  'marketing.cost_per_click',
  'marketing.impressions',
] as const;

describe('the marketing metrics are registered', () => {
  it('every marketing metric carries a reason when it is not trusted', () => {
    const marketing = metricsForDomain('marketing');
    expect(marketing.length).toBeGreaterThan(0);
    for (const def of marketing) {
      if (def.status === 'trusted') continue;
      expect(typeof def.statusReason).toBe('string');
      // A one-word reason is not a reason. The operator reading the drill-down has to be able
      // to tell whether the gap is permanent, in flight, or their own configuration problem.
      expect((def.statusReason ?? '').length).toBeGreaterThan(40);
    }
  });

  it('no money metric may be computed with', () => {
    // This is the load-bearing assertion. `mayComputeWith` is what keeps an uncomputable figure
    // out of a health score, an executive summary and an AI narrative.
    for (const key of MONEY_KEYS) {
      expect(getMetric(key)).toBeDefined();
      expect(mayComputeWith(key)).toBe(false);
    }
  });

  it('states that ad spend has no source at all, rather than reporting zero spend', () => {
    const spend = METRICS['marketing.ad_spend'];
    expect(spend.status).toBe('unavailable');
    expect(spend.statusReason).toMatch(/budget_spent/);
  });

  it('records the visitors denominator as invalid rather than silently correcting it', () => {
    // GREATEST(site visitors, email clickers) is not a count of any real population. It is
    // registered as invalid and LEFT ALONE, because changing it changes numbers people have
    // been reading for months - that is a decision, not a side effect of a marketing build.
    const v = METRICS['marketing.campaign_visitors'];
    expect(v.status).toBe('invalid');
    expect(v.statusReason).toMatch(/GREATEST/);
    expect(mayComputeWith('marketing.campaign_visitors')).toBe(false);
  });
});

describe('the marketing read paths no longer fabricate money', () => {
  const analytics = readSource('marketingAnalyticsService.ts');
  const links = readSource('campaignLinkService.ts');

  it('neither service contains a hardcoded enrollment price', () => {
    // THREE other services still declare `const PRICE_PER_ENROLLMENT = 4500` -
    // revenueDashboardService.ts:11, opportunityScoringService.ts:18 and
    // strategic-intelligence/scenarioSimulationEngine.ts:25 - and each derives money from it.
    //
    // Stated precisely because two earlier versions of this comment were wrong in opposite
    // directions. The first said FOUR and named the strategic-intelligence metricCollector,
    // which contains no such constant. The second said "the literal 4500 remains in three
    // services", which undercounts: the bare literal also appears in governanceService.ts:212,
    // paysimpleService.ts:399, settingsService.ts and admissionsKnowledgeSeed.ts:93. What is
    // claimed here is the PATTERN - a hardcoded price constant a service computes revenue from -
    // not every occurrence of the digits.
    //
    // Two of those other occurrences matter more than this test does and are escalated in
    // docs/marketing/ESCALATION-002-fabricated-metrics.md: `price_per_enrollment` is a real
    // configurable setting that these services ignore, and paysimpleService defaults an INVOICE
    // AMOUNT to it.
    // Those are escalated separately and deliberately NOT touched here; this
    // assertion is scoped to the two files this change owns so it stays honest about what
    // was actually fixed.
    expect(analytics).not.toMatch(/PRICE_PER_ENROLLMENT/);
    expect(links).not.toMatch(/PRICE_PER_ENROLLMENT/);
    expect(analytics).not.toMatch(/\b4500\b/);
    expect(links).not.toMatch(/\b4500\b/);
  });

  it('the campaign query no longer selects dimensions it cannot populate', () => {
    // `NULL AS platform, NULL AS creative` gave every row a null platform, so any consumer
    // grouping by platform got one bucket containing everything, presented as a finding.
    expect(analytics).not.toMatch(/NULL\s+AS\s+platform/i);
    expect(analytics).not.toMatch(/NULL\s+AS\s+creative/i);
  });

  it('both services ask the registry instead of hard-coding what is unavailable', () => {
    // A hand-written list would keep claiming "unavailable" after a spend connector landed -
    // the same class of lie in the opposite direction.
    for (const src of [analytics, links]) {
      expect(src).toMatch(/mayComputeWith/);
      expect(src).toMatch(/getMetric/);
    }
  });

  it('cost-per-lead is guarded on spend, not just on lead count', () => {
    // `leads > 0 ? spent / leads : 0` returns 0 whenever spend is 0, which is always.
    // The guard has to include the numerator.
    expect(links).toMatch(/budgetSpent > 0 && leads > 0/);
    expect(links).toMatch(/budgetSpent > 0 && enrollments > 0/);
  });

  it('returns null for unknowable money, never a zero', () => {
    expect(links).toMatch(/revenue: null/);
    expect(links).toMatch(/total_revenue: null/);
    expect(links).toMatch(/roi: null/);
  });
});
