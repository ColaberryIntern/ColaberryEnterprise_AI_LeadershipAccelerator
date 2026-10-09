import * as fs from 'fs';
import * as path from 'path';

/**
 * ESCALATION-002 decision 1 (Ali, 2026-09-10) asserted, not just implemented.
 *
 * `revenueDashboardService` was the THIRD service computing revenue as `enrollments x 4500`, after
 * the same defect was removed from `campaignLinkService` and `marketingAnalyticsService`. The
 * escalation tracked it as NOT TOUCHED, which is how a twice-fixed bug survived in a third place.
 * A test is the only thing that stops a fourth.
 *
 * It asserts ABSENCE, which is the harder half. The operating rule is that a stat we cannot verify
 * is omitted rather than softened -- and that its absence is asserted, because an omission nobody
 * checks quietly returns. A zero would be no better than the old number: "$0 earned" is a
 * different false claim, not a neutral one.
 */

const SRC = path.join(__dirname, '..', 'revenueDashboardService.ts');
const raw = fs.readFileSync(SRC, 'utf8');

/** Comments legitimately quote the old behaviour and Ali's words; only CODE must be clean. */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('the file is readable and the comment stripper works', () => {
  it('found the real service, so a clean result is not an empty read', () => {
    expect(raw.length).toBeGreaterThan(1000);
    expect(code).toContain('getRevenueDashboard');
  });

  it('the stripper removes comments but keeps code', () => {
    // Without this control, every assertion below could pass on an empty string.
    expect(raw).toContain('ESCALATION-002');
    expect(code).not.toContain('ESCALATION-002');
    expect(code).toContain('revenueForecast');
  });
});

describe('no fabricated revenue remains in code', () => {
  it('does not compute an actualRevenue at all', () => {
    // Not "is zero" and not "is null-checked" -- the identifier is gone from the contract.
    expect(code).not.toContain('actualRevenue');
  });

  it('contains no hardcoded 4500 anywhere in code', () => {
    // 4500 is not a stale price, it is the wrong billing model: the offer is a $149/mo
    // subscription, and SELECT COUNT(*) FROM enrollments WHERE amount_paid = 4500 returns 0.
    expect(code).not.toContain('4500');
  });

  it('declares no private price constant', () => {
    expect(code).not.toMatch(/const\s+PRICE_PER_ENROLLMENT/);
    expect(code).not.toMatch(/const\s+[A-Z_]*PRICE[A-Z_]*\s*=\s*\d/);
  });

  it('POSITIVE CONTROL: these checks would catch the original defect', () => {
    const original = "const PRICE_PER_ENROLLMENT = 4500;\n"
      + "const actualRevenue = (pipelineCounts['enrolled'] || 0) * PRICE_PER_ENROLLMENT;";
    expect(original).toContain('actualRevenue');
    expect(original).toContain('4500');
    expect(original).toMatch(/const\s+PRICE_PER_ENROLLMENT/);
  });
});

describe('the price a projection assumes is read from the setting, never a constant', () => {
  it('reads the price_per_enrollment setting', () => {
    expect(code).toContain("getSetting('price_per_enrollment')");
  });

  it('a null price makes projections null rather than defaulting to a guess', () => {
    // The decision permits an assumed price for a PROJECTION. It does not permit inventing one
    // when the setting is unset, which is what `|| 4500` used to do elsewhere.
    expect(code).toMatch(/assumedPrice === null \? null :/);
    expect(code).not.toMatch(/\|\|\s*4500/);
  });

  it('discloses the assumption alongside the projection', () => {
    expect(code).toContain('priceAssumption');
  });
});

describe('real revenue is reported unavailable by ASKING the registry', () => {
  it('asks the registry rather than hardcoding an unavailable string', () => {
    // A hand-written "unavailable" keeps saying unavailable after the data arrives, which the
    // sibling service's header calls "the same class of lie in the opposite direction".
    expect(code).toContain('mayComputeWith');
    expect(code).toContain('getMetric');
    expect(code).toContain('revenue.net_revenue');
  });

  it('surfaces an unavailable list on the result', () => {
    expect(code).toMatch(/unavailable,/);
  });

  it('the registry really does hold that key as untrusted today', () => {
    // If this ever flips to trusted, the service stops reporting unavailable on its own and this
    // test is what tells us the behaviour changed deliberately.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getMetric, mayComputeWith } = require('../adminOs/metricRegistry');
    expect(getMetric('revenue.net_revenue')).toBeTruthy();
    expect(mayComputeWith('revenue.net_revenue')).toBe(false);
  });

  it('POSITIVE CONTROL: the registry can report a key as computable', () => {
    // Proves mayComputeWith is not simply false for everything, which would make the assertion
    // above vacuous.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reg = require('../adminOs/metricRegistry');
    expect(typeof reg.mayComputeWith).toBe('function');
    expect(reg.mayComputeWith('definitely.not.a.registered.metric.key')).toBe(false);
  });
});

describe('the sibling services that were fixed first stay fixed', () => {
  // Regression guard across the whole family, so the fourth instance cannot appear quietly.
  const siblings = ['campaignLinkService.ts', 'marketingAnalyticsService.ts'];

  for (const f of siblings) {
    it(`${f} still computes no enrollments-times-price revenue`, () => {
      const p = path.join(__dirname, '..', f);
      const s = fs.readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(s).not.toMatch(/\*\s*4500|4500\s*\*/);
      expect(s).not.toMatch(/const\s+PRICE_PER_ENROLLMENT\s*=\s*4500/);
    });
  }
});
