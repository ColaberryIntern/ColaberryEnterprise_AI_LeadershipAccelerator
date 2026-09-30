import { randomUUID } from 'crypto';
import type { MetricComputation, MetricDefinition } from '../metricDefinition';

/**
 * Persisting a computed metric and its run record. `METRIC_PROVENANCE_PIPELINE.md`
 * §3.3, and the mandatory test set named in §9 for Stage 1.
 *
 * NO DATABASE. The models are replaced with in-memory doubles, which is the
 * established idiom for this directory. The metric double enforces
 * `UNIQUE (case_study_id, metric_key)` — the index Stage 0 added — because a
 * fake that permits what the database forbids proves the opposite of what it
 * looks like it proves.
 */

type Row = Record<string, any>;

class FakeMetricRow {
  constructor(private readonly table: FakeMetricTable, readonly data: Row) {}
  get id(): string { return this.data.id; }
  get publishable(): boolean { return this.data.publishable === true; }
  get numeric_value(): number | string | null { return this.data.numeric_value ?? null; }

  async update(values: Row): Promise<FakeMetricRow> {
    this.table.updates += 1;
    Object.assign(this.data, values);
    return this;
  }
}

class FakeMetricTable {
  rows: Row[] = [];
  creates = 0;
  updates = 0;

  reset(): void { this.rows = []; this.creates = 0; this.updates = 0; }

  /** Enforces `UNIQUE(case_study_id, metric_key)` exactly as the Stage 0 index does. */
  seed(values: Row): FakeMetricRow {
    const clash = this.rows.some(
      (r) => r.case_study_id === values.case_study_id && r.metric_key === values.metric_key
    );
    if (clash) {
      const err: any = new Error(
        'duplicate key value violates unique constraint "cs_metrics_unique_case_key"'
      );
      err.name = 'SequelizeUniqueConstraintError';
      throw err;
    }
    const row: Row = { id: randomUUID(), publishable: false, ...values };
    this.rows.push(row);
    return new FakeMetricRow(this, row);
  }

  async findOne(opts: any): Promise<FakeMetricRow | null> {
    const where = opts?.where ?? {};
    const row = this.rows.find((r) => Object.keys(where).every((k) => r[k] === where[k]));
    return row ? new FakeMetricRow(this, row) : null;
  }

  async create(values: Row): Promise<FakeMetricRow> {
    const created = this.seed(values);
    this.creates += 1;
    return created;
  }
}

class FakeEvidenceTable {
  rows: Row[] = [];
  creates = 0;
  reset(): void { this.rows = []; this.creates = 0; }
  async create(values: Row): Promise<Row> {
    this.creates += 1;
    this.rows.push({ ...values });
    return values;
  }
  /** The table has no `updated_at` and no delete path; the double has neither either. */
  get last(): Row { return this.rows[this.rows.length - 1]; }
}

const metrics = new FakeMetricTable();
const evidence = new FakeEvidenceTable();

jest.mock('../../../../models/CaseStudyMetric', () => ({
  __esModule: true,
  default: {
    findOne: (o: any) => metrics.findOne(o),
    create: (v: any) => metrics.create(v),
  },
}));

jest.mock('../../../../models/CaseStudyEvidence', () => ({
  __esModule: true,
  default: { create: (v: any) => evidence.create(v) },
}));

import { writeMetricRun } from '../metricRunStore';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const AT = '2026-08-28T12:00:00Z';

const definition: MetricDefinition = {
  key: 'delivery_elapsed_days',
  version: 1,
  label: 'Delivery elapsed time',
  metricType: 'delivery',
  verificationMethod: 'repo',
  compute: () => { throw new Error('not used — this suite writes a computation, it does not make one'); },
};

function computation(over: Partial<MetricComputation> = {}): MetricComputation {
  return {
    numericValue: 11,
    valueDisplay: '11 days',
    unit: 'days',
    sample: '2 of 3 attached repositories.',
    methodology: 'Calendar days from the earliest repository creation to the pinned commit.',
    baseline: null,
    limitations: ['Repository creation is not project start.'],
    inputs: { analysable_repo_count: 2 },
    ...over,
  };
}

const write = (over: Partial<Parameters<typeof writeMetricRun>[0]> = {}) =>
  writeMetricRun({
    caseStudyId: CASE_ID,
    definition,
    computation: computation(),
    pinnedCommitSha: SHA,
    correlationId: 'cid-run',
    computedAt: AT,
    ...over,
  });

beforeEach(() => { metrics.reset(); evidence.reset(); });

describe('writeMetricRun', () => {
  describe('the happy path', () => {
    it('creates one metric row and one evidence row', async () => {
      const outcome = await write();
      expect(outcome.status).toBe('written');
      if (outcome.status !== 'written') throw new Error('unreachable');
      expect(outcome.created).toBe(true);
      expect(metrics.rows).toHaveLength(1);
      expect(evidence.rows).toHaveLength(1);
    });

    it('writes the metric as PENDING and NOT publishable, and promotes nothing', async () => {
      await write();
      const row = metrics.rows[0];
      expect(row.verification_class).toBe('pending');
      expect(row.publishable).toBe(false);
      // A producer that could stamp these would make the audit columns
      // decoration. Promotion is a human act and the act records who performed it.
      expect(row.verified_by).toBeUndefined();
      expect(row.verified_at).toBeUndefined();
      expect(row.is_headline).toBeUndefined();
    });

    it('carries the definition contract onto the row', async () => {
      await write();
      const row = metrics.rows[0];
      expect(row.metric_key).toBe('delivery_elapsed_days');
      expect(row.metric_type).toBe('delivery');
      expect(row.verification_method).toBe('repo');
      expect(row.numeric_value).toBe(11);
      expect(row.value_display).toBe('11 days');
    });

    it('stores the generated prose rather than leaving it for a human', async () => {
      await write();
      const row = metrics.rows[0];
      expect(row.methodology).toContain('Calendar days');
      expect(row.sample).toContain('2 of 3');
      expect(row.limitations).toEqual(['Repository creation is not project start.']);
      expect(row.baseline).toBeNull();
    });

    it('links the metric to the evidence row, and the evidence back to the metric', async () => {
      const outcome = await write();
      if (outcome.status !== 'written') throw new Error('unreachable');
      expect(metrics.rows[0].evidence_id).toBe(outcome.evidenceId);
      expect(evidence.last.metric_id).toBe(outcome.metricId);
      // Both ids exist before either write, which is what the bare-UUID design on
      // these tables is for.
      expect(outcome.metricId).toEqual(expect.any(String));
      expect(outcome.evidenceId).not.toBe(outcome.metricId);
    });
  });

  describe('the run record', () => {
    it('uses `internal_measurement`, a real member of the evidence source union', async () => {
      await write();
      // NOT 'repo' and NOT 'platform'. The scope document said those only because
      // it was written from a doc comment listing four values the union does not
      // contain.
      expect(evidence.last.source_type).toBe('internal_measurement');
    });

    it('records the definition, its version, the inputs and the correlation id', async () => {
      const outcome = await write();
      if (outcome.status !== 'written') throw new Error('unreachable');
      expect(evidence.last.metadata).toEqual({
        definition_key: 'delivery_elapsed_days',
        definition_version: 1,
        inputs: { analysable_repo_count: 2 },
        computed_at: AT,
        correlation_id: 'cid-run',
      });
      expect(evidence.last.source_ref).toBe(outcome.runId);
    });

    it('pins the commit the snapshot named, so the figure stays checkable', async () => {
      await write();
      expect(evidence.last.source_commit_sha).toBe(SHA);
    });

    it('is not publicly openable by default', async () => {
      await write();
      // Public exposure is opt-in on this table, never inherited.
      expect(evidence.last.is_publicly_openable).toBe(false);
      expect(evidence.last.verification_class).toBe('pending');
    });
  });

  describe('running twice — the idempotency requirement', () => {
    it('leaves ONE metric row whose end state matches the first run', async () => {
      const first = await write();
      const second = await write();
      if (first.status !== 'written' || second.status !== 'written') throw new Error('unreachable');

      expect(metrics.rows).toHaveLength(1);
      expect(second.created).toBe(false);
      expect(second.metricId).toBe(first.metricId);
      expect(metrics.creates).toBe(1);
      expect(metrics.updates).toBe(1);
    });

    it('produces a metric row identical except for the evidence it points at', async () => {
      await write();
      const afterFirst = { ...metrics.rows[0] };
      await write();
      const afterSecond = metrics.rows[0];

      const ignore = (row: Row) => { const { evidence_id, ...rest } = row; return rest; };
      expect(ignore(afterSecond)).toEqual(ignore(afterFirst));
      // The metric is a current value; the evidence is a LOG of the runs behind
      // it. A second run therefore appends rather than overwriting.
      expect(afterSecond.evidence_id).not.toBe(afterFirst.evidence_id);
    });

    it('appends a second run record rather than mutating the first', async () => {
      await write();
      const firstRun = { ...evidence.rows[0] };
      await write();
      expect(evidence.rows).toHaveLength(2);
      // Append-only by construction: the table has no `updated_at` and no delete
      // path anywhere in the Case Study services.
      expect(evidence.rows[0]).toEqual(firstRun);
    });

    it('does not resurrect publishable when a later run follows a pending one', async () => {
      await write();
      await write({ computation: computation({ numericValue: 12, valueDisplay: '12 days' }) });
      expect(metrics.rows[0].publishable).toBe(false);
      expect(metrics.rows[0].numeric_value).toBe(12);
    });
  });

  describe('running against a PROMOTED row — the refusal', () => {
    beforeEach(() => {
      metrics.seed({
        case_study_id: CASE_ID,
        metric_key: 'delivery_elapsed_days',
        numeric_value: 11,
        publishable: true,
        verification_class: 'verified',
        verified_by: 'ali@colaberry.com',
      });
      metrics.creates = 0;
      metrics.updates = 0;
    });

    it('writes NOTHING — not the metric, and not a run record', async () => {
      const outcome = await write();
      expect(outcome.status).toBe('refused');
      expect(metrics.updates).toBe(0);
      expect(metrics.creates).toBe(0);
      // Not even the evidence row: a refused run did not measure anything into
      // the record, and logging it as though it had would misrepresent the log.
      expect(evidence.creates).toBe(0);
    });

    it('leaves the published figure and its human attribution untouched', async () => {
      await write({ computation: computation({ numericValue: 40 }) });
      const row = metrics.rows[0];
      expect(row.numeric_value).toBe(11);
      expect(row.publishable).toBe(true);
      expect(row.verification_class).toBe('verified');
      expect(row.verified_by).toBe('ali@colaberry.com');
    });

    it('reports the divergence with BOTH numbers, not just a refusal', async () => {
      const outcome = await write({ computation: computation({ numericValue: 40 }) });
      if (outcome.status !== 'refused') throw new Error('expected a refusal');
      expect(outcome.reason).toBe('published_row');
      expect(outcome.diverged).toBe(true);
      expect(outcome.publishedValue).toBe(11);
      expect(outcome.computedValue).toBe(40);
      // "The number moved" and "the number moved and nobody knows why" are
      // different situations. The refusal exists to keep this one the first.
      expect(outcome.message).toContain('11');
      expect(outcome.message).toContain('40');
    });

    it('reports no divergence when the recomputation agrees', async () => {
      const outcome = await write();
      if (outcome.status !== 'refused') throw new Error('expected a refusal');
      expect(outcome.diverged).toBe(false);
      expect(outcome.message).toContain('changed nothing');
    });

    it('compares a NUMERIC that arrives as a string, not the driver that returned it', async () => {
      // Postgres NUMERIC comes back as a string through some drivers and a number
      // through others. A divergence report decided by that detail would be noise.
      metrics.rows[0].numeric_value = '11';
      const outcome = await write();
      if (outcome.status !== 'refused') throw new Error('expected a refusal');
      expect(outcome.diverged).toBe(false);
    });
  });

  describe('the write ORDER, when the second write fails', () => {
    it('leaves an evidence row nothing points at, never a metric claiming absent evidence', async () => {
      // The order is deliberate and this is the test that holds it. A partial
      // failure should survive as a record of a run whose metric did not land —
      // harmless and true. The other order leaves a metric whose `evidence_id`
      // names a row that does not exist: a metric that LOOKS evidenced and is
      // not, which is the one thing publish gate rule 7 is meant to prevent.
      const boom = new Error('metric insert failed');
      const realCreate = metrics.create.bind(metrics);
      metrics.create = async () => { throw boom; };
      try {
        await expect(write()).rejects.toThrow('metric insert failed');
      } finally {
        metrics.create = realCreate;
      }
      expect(evidence.rows).toHaveLength(1);
      expect(metrics.rows).toHaveLength(0);
    });
  });

  describe('a metric that could not be computed', () => {
    it('persists the null and the reason rather than a zero', async () => {
      await write({
        computation: computation({
          numericValue: null,
          valueDisplay: 'Not computed',
          methodology: 'No analysable repository reported a creation date, so there is no start date.',
          unit: undefined,
        }),
      });
      const row = metrics.rows[0];
      // A row saying 0 would claim the work took no time. The null plus the
      // reason is the honest record, and it is still not publishable.
      expect(row.numeric_value).toBeNull();
      expect(row.numeric_value).not.toBe(0);
      expect(row.value_display).toBe('Not computed');
      expect(row.methodology).toContain('no start date');
      expect(row.publishable).toBe(false);
      expect(row.unit).toBeNull();
    });
  });
});
