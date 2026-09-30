import { randomUUID } from 'crypto';

/**
 * Promoting a measured figure, and listing the figures a panel has never been
 * able to see.
 *
 * NO DATABASE. The model is replaced with an in-memory double, the established
 * idiom for this directory.
 *
 * The rules under test are not arbitrary: two of them already exist in
 * `caseStudyPublishRules.ts` and are enforced here as well, so an operator is
 * refused at the moment of the decision rather than weeks later at publish.
 */

type Row = Record<string, any>;

/**
 * A Sequelize instance exposes EVERY attribute as a property. An earlier version
 * of this double exposed four hand-picked getters, and three tests failed
 * against correct code because the fake was less capable than the thing it
 * stands in for. It proxies the row now, so a field added to the query is
 * readable here without the fake having to be taught about it.
 */
function fakeRow(data: Row): Row {
  return new Proxy(data, {
    get(target, prop) {
      if (prop === 'update') {
        return async (values: Row) => { Object.assign(target, values); return fakeRow(target); };
      }
      return target[prop as string];
    },
  });
}

class FakeMetricTable {
  rows: Row[] = [];
  reset(): void { this.rows = []; }
  seed(values: Row): Row {
    const row: Row = {
      id: randomUUID(), metric_key: 'delivery_elapsed_days', label: 'Delivery elapsed time',
      value_display: '181 days', numeric_value: 181, unit: 'days', metric_type: 'delivery',
      verification_class: 'pending', verification_method: 'repo',
      publishable: false, is_headline: false, verified_by: null, verified_at: null,
      evidence_id: randomUUID(), sample: '1 of 1 attached repositories.',
      methodology: 'Calendar days from...', baseline: null,
      limitations: ['Repository creation is not project start.'],
      ...values,
    };
    this.rows.push(row);
    return row;
  }
  async findOne(opts: any): Promise<Row | null> {
    const where = opts?.where ?? {};
    const row = this.rows.find((r) => Object.keys(where).every((k) => r[k] === where[k]));
    return row ? fakeRow(row) : null;
  }
  async findAll(opts: any): Promise<Row[]> {
    const where = opts?.where ?? {};
    return this.rows
      .filter((r) => Object.keys(where).every((k) => r[k] === where[k]))
      .sort((a, b) => String(a.metric_key).localeCompare(String(b.metric_key)))
      .map((r) => fakeRow(r));
  }
}

const metrics = new FakeMetricTable();

jest.mock('../../../../models/CaseStudyMetric', () => ({
  __esModule: true,
  default: {
    findOne: (o: any) => metrics.findOne(o),
    findAll: (o: any) => metrics.findAll(o),
  },
}));

import { listMeasuredMetrics, MetricPromotionError, promoteMetric } from '../metricPromotion';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-08-31T10:00:00Z';
const ACTOR = 'ali@colaberry.com';

const promote = (over: Partial<Parameters<typeof promoteMetric>[0]> = {}) =>
  promoteMetric({
    caseStudyId: CASE_ID,
    metricKey: 'delivery_elapsed_days',
    verificationClass: 'verified',
    publishable: true,
    isHeadline: false,
    actor: ACTOR,
    decidedAt: AT,
    ...over,
  });

beforeEach(() => { metrics.reset(); });

describe('promoteMetric', () => {
  describe('the promotion a person makes', () => {
    beforeEach(() => { metrics.seed({ case_study_id: CASE_ID }); });

    it('records the class, the flags, and WHO decided', async () => {
      const result = await promote();
      const row = metrics.rows[0];
      expect(row.verification_class).toBe('verified');
      expect(row.publishable).toBe(true);
      // The whole point of Stage 2: a name and a time go on the decision.
      expect(row.verified_by).toBe(ACTOR);
      expect(row.verified_at).toEqual(new Date(AT));
      expect(result.verifiedBy).toBe(ACTOR);
    });

    it('can mark a figure the headline once it is publishable', async () => {
      await promote({ isHeadline: true });
      expect(metrics.rows[0].is_headline).toBe(true);
    });

    it('refuses an empty actor rather than promoting anonymously', async () => {
      // `verified_by` is the reason this service exists. A promotion nobody is
      // named on is the state Stage 1 already produces for free.
      await expect(promote({ actor: '   ' })).rejects.toThrow(MetricPromotionError);
      expect(metrics.rows[0].verification_class).toBe('pending');
    });

    it('refuses a metric that has never been measured', async () => {
      await expect(promote({ metricKey: 'not_measured_yet' })).rejects.toMatchObject({
        error_class: 'MetricNotFound',
        http_status: 404,
      });
    });
  });

  describe('the two rules the publish gate already enforces', () => {
    it('refuses verified + self — a self-report is not third-party verification', async () => {
      metrics.seed({ case_study_id: CASE_ID, verification_method: 'self' });
      await expect(promote()).rejects.toMatchObject({ error_class: 'SelfVerification' });
      // Nothing moved: refusing at the decision beats refusing at publish, weeks
      // later, when the person who chose it is no longer looking.
      expect(metrics.rows[0].verification_class).toBe('pending');
      expect(metrics.rows[0].verified_by).toBeNull();
    });

    it('refuses verified with no evidence — an assertion, not proof', async () => {
      metrics.seed({ case_study_id: CASE_ID, evidence_id: null });
      await expect(promote()).rejects.toMatchObject({ error_class: 'EvidenceMissing' });
      expect(metrics.rows[0].publishable).toBe(false);
    });

    it('allows a non-verified class on a self-reported metric', async () => {
      // The rule is about the WORD verified, not about self-reporting being
      // unusable. `illustrative` + `self` is honest and publishable.
      metrics.seed({ case_study_id: CASE_ID, verification_method: 'self' });
      await promote({ verificationClass: 'illustrative' });
      expect(metrics.rows[0].verification_class).toBe('illustrative');
      expect(metrics.rows[0].publishable).toBe(true);
    });
  });

  describe('states that would put an unverified number on a page', () => {
    beforeEach(() => { metrics.seed({ case_study_id: CASE_ID }); });

    it('refuses publishable while still pending', async () => {
      // The two axes are separate and the gate reads both. Publishable + pending
      // is an unverified figure on a public surface, which is the one thing this
      // whole model exists to prevent.
      await expect(promote({ verificationClass: 'pending', publishable: true }))
        .rejects.toMatchObject({ error_class: 'ValidationError' });
      expect(metrics.rows[0].publishable).toBe(false);
    });

    it('refuses a headline that is not publishable', async () => {
      // The headline is the figure a reader sees first; an unpublishable one
      // leaves the most prominent slot on the page empty.
      await expect(promote({ publishable: false, isHeadline: true }))
        .rejects.toMatchObject({ error_class: 'ValidationError' });
    });
  });

  describe('demotion', () => {
    it('clears the attribution when a figure goes back to pending', async () => {
      metrics.seed({
        case_study_id: CASE_ID, verification_class: 'verified', publishable: true,
        is_headline: true, verified_by: 'someone@colaberry.com', verified_at: new Date(AT),
      });
      const result = await promote({
        verificationClass: 'pending', publishable: false, isHeadline: false,
      });
      // Nobody currently vouches for it, so leaving a name on it would credit a
      // person with a decision that has been withdrawn.
      expect(metrics.rows[0].verified_by).toBeNull();
      expect(metrics.rows[0].verified_at).toBeNull();
      expect(result.verifiedBy).toBeNull();
      expect(metrics.rows[0].publishable).toBe(false);
    });
  });
});

describe('listMeasuredMetrics', () => {
  it('returns the rows the admin panel has never been able to see', async () => {
    // The panel reads snapshot content; `resolveChart` reads this table. Nothing
    // has ever listed it, which is why a measured metric was invisible.
    metrics.seed({ case_study_id: CASE_ID });
    const list = await listMeasuredMetrics(CASE_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      metricKey: 'delivery_elapsed_days',
      valueDisplay: '181 days',
      numericValue: 181,
      verificationClass: 'pending',
      verificationMethod: 'repo',
      publishable: false,
      hasEvidence: true,
    });
  });

  it('carries the generated prose, which is what makes a figure judgeable', async () => {
    metrics.seed({ case_study_id: CASE_ID });
    const [m] = await listMeasuredMetrics(CASE_ID);
    // Someone deciding whether to publish a number needs the methodology and the
    // limitations in front of them, not just the number.
    expect(m.methodology).toContain('Calendar days');
    expect(m.limitations).toEqual(['Repository creation is not project start.']);
    expect(m.sample).toContain('1 of 1');
  });

  it('coerces a NUMERIC that arrives as a string', async () => {
    metrics.seed({ case_study_id: CASE_ID, numeric_value: '181' });
    const [m] = await listMeasuredMetrics(CASE_ID);
    expect(m.numericValue).toBe(181);
  });

  it('scopes to the case study, never leaking another record\'s figures', async () => {
    metrics.seed({ case_study_id: CASE_ID });
    metrics.seed({ case_study_id: '99999999-9999-4999-8999-999999999999', metric_key: 'other_metric' });
    const list = await listMeasuredMetrics(CASE_ID);
    expect(list.map((m) => m.metricKey)).toEqual(['delivery_elapsed_days']);
  });

  it('returns an empty list for a record with nothing measured', async () => {
    expect(await listMeasuredMetrics(CASE_ID)).toEqual([]);
  });
});
