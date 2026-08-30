import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

/**
 * The metric-run routes: authorization, validation, and outcome mapping.
 *
 * WHY THE AUTHORIZATION HALF EXISTS. The sibling Story Studio router carried
 * `requireAdmin` on all sixteen of its routes and always had — and nothing could
 * have noticed if one stopped. Its guard suite imported only its own sibling,
 * and the CI backstop `scripts/lint-route-auth.js` tests
 * `src.includes('requireAdmin')` at FILE granularity, so one surviving
 * occurrence in a whole file satisfies it. A property that is true, unproven and
 * undefended is what CLAUDE.md calls incomplete. This file is written with that
 * in mind: every route is asserted to refuse an unauthenticated caller BEFORE
 * doing any work.
 */

const runMetric = jest.fn();
const promoteMetric = jest.fn();
const listMeasuredMetrics = jest.fn();

jest.mock('../../../services/caseStudy/metrics/metricRunner', () => ({
  __esModule: true,
  runMetric: (...a: any[]) => runMetric(...a),
}));

jest.mock('../../../services/caseStudy/metrics/metricPromotion', () => {
  const actual = jest.requireActual('../../../services/caseStudy/metrics/metricPromotion');
  return {
    __esModule: true,
    // The real error class, so the route's `instanceof` check is exercised
    // rather than bypassed by a stand-in that only looks like it.
    MetricPromotionError: actual.MetricPromotionError,
    promoteMetric: (...a: any[]) => promoteMetric(...a),
    listMeasuredMetrics: (...a: any[]) => listMeasuredMetrics(...a),
  };
});

let allowAdmin = true;
jest.mock('../../../middlewares/authMiddleware', () => ({
  __esModule: true,
  requireAdmin: (req: any, res: any, next: any) => {
    if (!allowAdmin) { res.status(401).json({ error: 'Unauthorized' }); return; }
    req.admin = { sub: 'admin-1', email: 'ali@colaberry.com', role: 'admin' };
    next();
  },
}));

// Resolves through the mock above, which re-exports the REAL class — so the
// route's `instanceof` check is exercised rather than bypassed by a stand-in.
import { MetricPromotionError } from '../../../services/caseStudy/metrics/metricPromotion';
import caseStudyMetricRoutes from '../caseStudyMetricRoutes';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const SNAP_ID = '22222222-2222-4222-8222-222222222222';
const RUN_PATH = `/api/admin/case-studies/${CASE_ID}/metrics/run`;

function app() {
  const a = express();
  a.use(express.json());
  a.use(caseStudyMetricRoutes);
  return a;
}

const written = {
  status: 'written',
  write: { status: 'written', metricId: 'm1', evidenceId: 'e1', runId: 'r1', created: true },
  repoStats: { attempted: 1, analysed: 1, unreadable: 0, pinnedDatesFetched: 0, issues: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  allowAdmin = true;
  runMetric.mockResolvedValue(written);
});

describe('authorization', () => {
  // Every route in the file, by method and path. A route added without a guard
  // must fail here, which is the whole reason the list is explicit rather than
  // derived from the router.
  const ROUTES: ReadonlyArray<[string, string]> = [
    ['post', RUN_PATH],
    ['get', '/api/admin/case-studies/metrics/definitions'],
    ['get', `/api/admin/case-studies/${CASE_ID}/metrics`],
    ['post', `/api/admin/case-studies/${CASE_ID}/metrics/delivery_elapsed_days/promote`],
  ];

  it.each(ROUTES)('%s %s refuses an unauthenticated caller', async (method, path) => {
    allowAdmin = false;
    const res = await (request(app()) as any)[method](path).send({ definitionKey: 'delivery_elapsed_days' });
    expect(res.status).toBe(401);
  });

  it('refuses BEFORE doing any work', async () => {
    allowAdmin = false;
    await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    // The guard must run before the service, not merely be present. A run spends
    // GitHub quota; an unauthenticated caller must not be able to spend it.
    expect(runMetric).not.toHaveBeenCalled();
  });

  it('declares NO unscoped middleware, which is the outage pattern', () => {
    // The one hazard the request-level tests above cannot see. `router.use(guard)`
    // would still guard this router's own routes, so every assertion in this file
    // would pass — while the guard also applied to every request reaching
    // adminRoutes AFTER this router is mounted. That is what caused a production
    // outage in this repo, and it turns a later sibling's 404 into a 401.
    //
    // A layer with a `route` is a route. A layer without one is `router.use`.
    const unscoped = (caseStudyMetricRoutes as any).stack.filter((l: any) => !l.route);
    expect(unscoped).toEqual([]);
  });

  it('covers every route the router actually declares', async () => {
    // Non-vacuity for the list above: if a route is added and not listed, this
    // count moves and the omission is visible rather than silently unguarded.
    const declared = (caseStudyMetricRoutes as any).stack.filter((l: any) => l.route).length;
    expect(declared).toBe(ROUTES.length);
  });
});

describe('validation', () => {
  it('refuses a definition key no definition implements', async () => {
    const res = await request(app()).post(RUN_PATH).send({ definitionKey: 'made_up_metric' });
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    // Refused at the schema, so the runner is never reached.
    expect(runMetric).not.toHaveBeenCalled();
  });

  it('refuses an unknown field rather than ignoring it', async () => {
    // `.strict()`: a caller who misspells `snapshotId` should be told, not
    // silently given a run against the wrong snapshot.
    const res = await request(app())
      .post(RUN_PATH)
      .send({ definitionKey: 'delivery_elapsed_days', snapshot_id: SNAP_ID });
    expect(res.status).toBe(400);
    expect(runMetric).not.toHaveBeenCalled();
  });

  it('refuses a case study id that is not a uuid', async () => {
    const res = await request(app())
      .post('/api/admin/case-studies/not-a-uuid/metrics/run')
      .send({ definitionKey: 'delivery_elapsed_days' });
    expect(res.status).toBe(400);
    expect(runMetric).not.toHaveBeenCalled();
  });

  it('passes a valid snapshot id through to the runner', async () => {
    await request(app())
      .post(RUN_PATH)
      .send({ definitionKey: 'delivery_elapsed_days', snapshotId: SNAP_ID });
    expect(runMetric.mock.calls[0][0].snapshotId).toBe(SNAP_ID);
  });

  it('omits snapshotId entirely when it was not sent', async () => {
    await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    expect('snapshotId' in runMetric.mock.calls[0][0]).toBe(false);
  });
});

describe('outcome mapping', () => {
  it('returns 200 with the write on success', async () => {
    const res = await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('written');
    expect(res.body.repoStats.attempted).toBe(1);
  });

  it('returns 200 — NOT an error — when the run refused to touch a published figure', async () => {
    runMetric.mockResolvedValue({
      status: 'refused',
      write: { status: 'refused', reason: 'published_row', metricId: 'm1', publishedValue: 11, computedValue: 40, diverged: true, message: 'published at 11' },
      repoStats: { attempted: 1, analysed: 1, unreadable: 0, pinnedDatesFetched: 0, issues: [] },
    });
    const res = await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    // The run did exactly what it should. A 4xx would train an operator to read
    // "the published number is being protected" as a fault, and the divergence
    // needs rendering rather than throwing.
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('refused');
    expect(res.body.write.diverged).toBe(true);
    expect(res.body.write.publishedValue).toBe(11);
  });

  it('maps a missing approved snapshot to 409 with the reason', async () => {
    runMetric.mockResolvedValue({
      status: 'blocked', reason: 'no_approved_snapshot', message: 'Approve a snapshot first.',
    });
    const res = await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    // 409, not 400: the request was well formed and the operator did nothing
    // wrong — the RECORD is not in a state where this is possible.
    expect(res.status).toBe(409);
    expect(res.body.error_class).toBe('no_approved_snapshot');
    expect(res.body.error).toContain('Approve a snapshot first');
  });

  it('maps no attached repositories to 409', async () => {
    runMetric.mockResolvedValue({
      status: 'blocked', reason: 'no_repositories', message: 'Nothing to measure.',
    });
    const res = await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    expect(res.status).toBe(409);
  });

  it('maps a thrown error to 500 without leaking its message', async () => {
    runMetric.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 as user cs_admin'));
    const res = await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('InternalError');
    // The upstream message can carry a host, a port and a database user.
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('cs_admin');
  });
});

describe('the definitions listing', () => {
  it('returns the registered keys', async () => {
    const res = await request(app()).get('/api/admin/case-studies/metrics/definitions');
    expect(res.status).toBe(200);
    expect(res.body.definitionKeys).toContain('delivery_elapsed_days');
  });
});

describe('listing the measured figures', () => {
  const LIST_PATH = `/api/admin/case-studies/${CASE_ID}/metrics`;

  it('returns what the panel has never been able to see', async () => {
    listMeasuredMetrics.mockResolvedValue([
      { metricKey: 'delivery_elapsed_days', valueDisplay: '181 days', publishable: false },
    ]);
    const res = await request(app()).get(LIST_PATH);
    expect(res.status).toBe(200);
    expect(res.body.metrics[0].metricKey).toBe('delivery_elapsed_days');
    expect(listMeasuredMetrics).toHaveBeenCalledWith(CASE_ID);
  });

  it('refuses a case study id that is not a uuid', async () => {
    const res = await request(app()).get('/api/admin/case-studies/nope/metrics');
    expect(res.status).toBe(400);
    expect(listMeasuredMetrics).not.toHaveBeenCalled();
  });
});

describe('promoting a figure', () => {
  const PROMOTE_PATH = `/api/admin/case-studies/${CASE_ID}/metrics/delivery_elapsed_days/promote`;
  const body = { verificationClass: 'verified', publishable: true, isHeadline: false };

  beforeEach(() => {
    promoteMetric.mockResolvedValue({
      metricKey: 'delivery_elapsed_days', verificationClass: 'verified',
      verificationMethod: 'repo', publishable: true, isHeadline: false,
      verifiedBy: 'ali@colaberry.com', verifiedAt: '2026-08-31T10:00:00Z',
    });
  });

  it('passes the session identity as the actor', async () => {
    const res = await request(app()).post(PROMOTE_PATH).send(body);
    expect(res.status).toBe(200);
    // Taken from the session, never from the request body: a caller must not be
    // able to promote a figure in somebody else's name.
    expect(promoteMetric.mock.calls[0][0].actor).toBe('ali@colaberry.com');
    expect(res.body.metric.verifiedBy).toBe('ali@colaberry.com');
  });

  it('will not let the request body choose who is credited', async () => {
    await request(app()).post(PROMOTE_PATH).send({ ...body, actor: 'someone.else@example.com' });
    // `.strict()` refuses the field outright, so there is no path where a
    // supplied name reaches the service.
    expect(promoteMetric).not.toHaveBeenCalled();
  });

  it('never reads the actor from the request body, independent of the schema', () => {
    // A REQUEST-LEVEL TEST CANNOT SEE THIS. `.strict()` refuses an `actor` field,
    // so a handler reading `req.body.actor` behaves identically to one reading
    // the session — every assertion above passes either way, which a mutation
    // confirmed. The hole only opens if BOTH the schema and this line change, so
    // the second defence is pinned here against the source rather than the
    // response.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'caseStudyMetricRoutes.ts'), 'utf8'
    );
    const handler = src.slice(src.indexOf('/metrics/:metricKey/promote'));
    expect(handler).toContain("req.admin?.email || req.admin?.sub");
    expect(handler).not.toMatch(/req\.body[^\n]*actor/);
    // Non-vacuity: the slice really is the promote handler.
    expect(handler).toContain('promoteMetric(');
  });

  it('refuses an unknown verification class', async () => {
    const res = await request(app()).post(PROMOTE_PATH).send({ ...body, verificationClass: 'trustworthy' });
    expect(res.status).toBe(400);
    expect(promoteMetric).not.toHaveBeenCalled();
  });

  it('surfaces a self-verification refusal as a 400 with its class', async () => {
    promoteMetric.mockRejectedValue(
      new MetricPromotionError('SelfVerification', 'A self-report is not third-party verification.')
    );
    const res = await request(app()).post(PROMOTE_PATH).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('SelfVerification');
    // The operator needs to know WHICH rule stopped them, while they can still
    // change the choice.
    expect(res.body.error).toContain('third-party verification');
  });

  it('surfaces an unmeasured metric as a 404', async () => {
    promoteMetric.mockRejectedValue(
      new MetricPromotionError('MetricNotFound', 'Run it first.', { metricKey: 'x' })
    );
    const res = await request(app()).post(PROMOTE_PATH).send(body);
    expect(res.status).toBe(404);
    expect(res.body.error_class).toBe('MetricNotFound');
  });

  it('maps an unexpected failure to 500 without leaking its message', async () => {
    promoteMetric.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 as cs_admin'));
    const res = await request(app()).post(PROMOTE_PATH).send(body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('cs_admin');
  });
});

describe('the clock is read at the boundary', () => {
  it('hands the runner an ISO timestamp it did not have to invent', async () => {
    await request(app()).post(RUN_PATH).send({ definitionKey: 'delivery_elapsed_days' });
    const computedAt = runMetric.mock.calls[0][0].computedAt;
    expect(computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    // Read once, here, so the runner and the writer both take it as input and a
    // run stays reproducible.
    expect(Number.isNaN(Date.parse(computedAt))).toBe(false);
  });
});
