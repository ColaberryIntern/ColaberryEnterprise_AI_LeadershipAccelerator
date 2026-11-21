/**
 * Publish, open, revoke, open again - against ONE shared row, with both real routers mounted.
 *
 * ## Why this file exists separately from the other two
 *
 * `demoShareRoutes.test.ts` mocks the service wholesale, so it proves the HTTP contract.
 * `connectedDemoShareService.test.ts` mocks the model wholesale, so it proves the authorization.
 * `demoRoutes.test.ts` stubs `findOne` per case, so it proves the public route's where-clause.
 *
 * Each of those is one half of a sentence. An independent verifier pointed out that the sentence
 * itself - "after enabling, the public route serves 200; after disabling, 404; and the project's
 * PORTFOLIO link is unaffected" - was asserted nowhere, although it is the acceptance criterion
 * the whole publish control was built to satisfy. Two halves that each pass against their own
 * mock can still disagree about the column they share.
 *
 * So here the `Project` model is ONE in-memory store that both routers read through, `findOne`
 * really filters on the where-clause it is given, and the producer writes where the real one
 * writes: into the store, out of the instance's sight.
 *
 * ## The decoupling, and why it is worth a test rather than a comment
 *
 * `projects` carries two independent public links: `share_token`/`share_enabled` for the
 * portfolio, and `demo_share_token`/`demo_share_enabled` for the demo. They are adjacent columns
 * with near-identical names, written by two services, and a single mistyped key in either would
 * publish or revoke the wrong one. A student revoking a demo must not silently take their
 * portfolio offline, and nothing in the type system notices the difference.
 */
jest.mock('../../middlewares/authFailureLog', () => ({
  logAuthFailure: jest.fn(),
  describeCaller: () => ({ forwarded_for: null, user_agent: null }),
}));

import { Op } from 'sequelize';

type Loose = Record<string, unknown>;

const DEMO_TOKEN = 'demo-token-for-tests-only-not-a-real-secret';
const PORTFOLIO_TOKEN = 'portfolio-token-for-tests-only-not-a-secret';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const ENROLLMENT = 'enr-owner-1';

/**
 * THE DATABASE. One object, shared by both routers.
 *
 * Kept outside the mock factory so the test body can read and write it directly, which is what
 * makes "the portfolio columns are byte-identical before and after" assertable at all.
 */
const db: Loose = {};

function resetDb(over: Loose = {}): void {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    id: PROJECT,
    enrollment_id: ENROLLMENT,
    archived_at: null,
    name: 'Dispatch console',
    // The portfolio link: live, and nothing in this file should ever change it.
    share_token: PORTFOLIO_TOKEN,
    share_enabled: true,
    // The demo link: generated but NOT published, which is the state the producer leaves.
    demo_share_token: null,
    demo_share_enabled: false,
    demo_spec: null,
  }, over);
}

/**
 * An instance over the store, the way Sequelize behaves: `update` writes through to both, and
 * `reload` is the only thing that brings a raw SQL write back into the object.
 */
function instance(): Loose {
  const row: Loose = { ...db };
  row.update = async (patch: Loose) => { Object.assign(db, patch); Object.assign(row, patch); return row; };
  row.reload = async () => { Object.assign(row, db); return row; };
  row.get = () => ({ ...db });
  return row;
}

/** `findOne` that really filters, so a dropped clause in the route changes the answer. */
function matches(where: Loose): boolean {
  for (const [key, want] of Object.entries(where)) {
    const have = db[key];
    if (want !== null && typeof want === 'object') {
      /*
       * The `{ [Op.ne]: null }` clause on `demo_spec`. `Op.ne` is a SYMBOL, so the first version
       * of this helper reached for `Object.values()`, got an empty array, and rejected every row
       * - which looked exactly like the publish having failed. Read the symbol by name.
       */
      const ne = (want as Record<symbol, unknown>)[Op.ne as unknown as symbol];
      if (ne === null && Object.getOwnPropertySymbols(want).length === 1) {
        if (have == null) return false;
        continue;
      }
      return false;
    }
    if (have !== want) return false;
  }
  return true;
}

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: async (id: string) => (db.id === id ? instance() : null),
    findOne: async (opts: { where: Loose }) => (matches(opts.where) ? instance() : null),
  },
}));

/** The producer, writing where the real one writes: raw SQL into the row, not into the instance. */
const generateConnectedDemo = jest.fn(async () => {
  db.demo_spec = SPEC;
  db.demo_share_token = db.demo_share_token ?? DEMO_TOKEN;
  return { shareToken: DEMO_TOKEN, shareEnabled: false, spec: SPEC, eventCount: 1 };
});
jest.mock('../../services/sbp/connectedDemoStore', () => ({
  __esModule: true,
  generateConnectedDemo: (...a: unknown[]) => generateConnectedDemo(...(a as [])),
}));

jest.mock('../../services/sbp/planStore', () => ({
  __esModule: true,
  getPublishedPlan: async () => ({
    plan: { project_name: 'Dispatch console', descriptor: 'd', requirements: [], releases: [], stories: [] },
    plan_sha256: 'abc123def456',
    version: 3,
  }),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['demo', 'end', 'to', 'end'].join('-');
process.env.JWT_SECRET = SECRET;

/* eslint-disable @typescript-eslint/no-var-requires */
import demoRoutes, { NOT_FOUND_HTML } from '../demoRoutes';

const SHARE_URL = '/api/portal/project/demo/share';
const auth = `Bearer ${jwt.sign({ sub: ENROLLMENT, cohort_id: 'coh-1', role: 'participant' }, SECRET)}`;

const SPEC = {
  schema_version: 2,
  environment: 'demo',
  app: { name: 'Dispatch console', descriptor: 'd', persona: { name: 'Sam Rivera', role: 'Ops lead' } },
  events: [{
    event_id: 'EV-1',
    occurred_at: '2026-11-21T14:32:00Z',
    work_id: 'W1',
    trace_id: 'T1',
    parent_event_id: null,
    actor: { type: 'agent', id: 'agent.one', label: 'Agent One', verified: false },
    human_owner_id: 'owner.ops',
    action: 'Did a thing',
    status: 'succeeded',
    risk_level: 'low',
    autonomy_tier: 'A2',
    reason_summary: 'Because the rules allowed it.',
    evidence_refs: ['e/1'],
    policy_refs: ['p/1'],
    approval: { required: false, status: 'not_required', assigned_to: null },
    side_effects: [],
    reversible: true,
    recovery_ref: null,
    environment: 'demo',
  }],
  screens: {},
  entities: {},
  nav: [],
};

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(require('../projectRoutes').default);
  a.use(demoRoutes);
  return a;
}

/** The portfolio half of the row, for the before-and-after comparison. */
const portfolio = () => JSON.stringify({ share_token: db.share_token, share_enabled: db.share_enabled });

beforeEach(() => {
  resetDb();
  generateConnectedDemo.mockClear();
});

describe('the whole round trip, over one row', () => {
  it('publishes, serves, revokes, and stops serving', async () => {
    const portfolioBefore = portfolio();

    // ── 1. Nothing is published yet, so the token does not exist and nothing is served.
    expect((await request(app()).get(`/api/public/demo/${DEMO_TOKEN}`)).status).toBe(404);

    // ── 2. PUBLISH. The route generates (the row has no spec) and then enables.
    const published = await request(app()).post(SHARE_URL).set('Authorization', auth)
      .send({ project_id: PROJECT, enabled: true, data_model: { app_name: 'Dispatch console' } });
    expect(published.status).toBe(200);
    expect(generateConnectedDemo).toHaveBeenCalledTimes(1);
    // The link the student is handed, built by the service and not by this test.
    expect(published.body.url).toBe(`/api/public/demo/${DEMO_TOKEN}`);
    expect(published.body).toMatchObject({ enabled: true, has_spec: true, event_count: 1 });

    // ── 3. OPEN IT, at the URL the response gave, not at one assembled here.
    const open = await request(app()).get(published.body.url as string);
    expect(open.status).toBe(200);
    expect(open.text).toContain('Simulated, not live');
    expect(open.text).toContain('Dispatch console');

    // ── 4. REVOKE.
    const revoked = await request(app()).post(SHARE_URL).set('Authorization', auth)
      .send({ project_id: PROJECT, enabled: false });
    expect(revoked.status).toBe(200);
    expect(revoked.body).toMatchObject({ enabled: false, url: null, has_spec: true });

    // ── 5. The same link is now a 404, byte-identical to the one an unknown token gets.
    const afterRevoke = await request(app()).get(`/api/public/demo/${DEMO_TOKEN}`);
    expect(afterRevoke.status).toBe(404);
    expect(afterRevoke.text).toBe(NOT_FOUND_HTML);
    expect((await request(app()).get('/api/public/demo/never-existed')).text).toBe(NOT_FOUND_HTML);

    // ── 6. THE DECOUPLING. The portfolio link is untouched by all of it.
    expect(portfolio()).toBe(portfolioBefore);
    expect(db.share_enabled).toBe(true);
    expect(db.share_token).toBe(PORTFOLIO_TOKEN);

    // And the spec survived revocation, so re-publishing is not a regeneration.
    expect(db.demo_spec).toEqual(SPEC);
  });

  it('re-publishes without minting a second token or regenerating', async () => {
    // Idempotency across the whole round trip, which is where a second token would actually hurt:
    // a link somebody already shared would stop working.
    await request(app()).post(SHARE_URL).set('Authorization', auth)
      .send({ project_id: PROJECT, enabled: true, data_model: { app_name: 'x' } });
    await request(app()).post(SHARE_URL).set('Authorization', auth)
      .send({ project_id: PROJECT, enabled: false });
    const again = await request(app()).post(SHARE_URL).set('Authorization', auth)
      .send({ project_id: PROJECT, enabled: true });

    expect(again.body.url).toBe(`/api/public/demo/${DEMO_TOKEN}`);
    expect(generateConnectedDemo).toHaveBeenCalledTimes(1);
    expect((await request(app()).get(`/api/public/demo/${DEMO_TOKEN}`)).status).toBe(200);
  });

  it('a stranger cannot publish it, and the row is unchanged afterwards', async () => {
    // The authorization check, asserted against the SHARED row rather than a mock's return value:
    // a 403 that performed the write is not a 403.
    const before = JSON.stringify(db);
    const strangerAuth = `Bearer ${jwt.sign({ sub: 'enr-stranger', cohort_id: 'c', role: 'participant' }, SECRET)}`;
    const res = await request(app()).post(SHARE_URL).set('Authorization', strangerAuth)
      .send({ project_id: PROJECT, enabled: true, data_model: { app_name: 'x' } });

    expect(res.status).toBe(403);
    expect(JSON.stringify(db)).toBe(before);
    expect(generateConnectedDemo).not.toHaveBeenCalled();
    expect((await request(app()).get(`/api/public/demo/${DEMO_TOKEN}`)).status).toBe(404);
  });

  it('an archived project cannot be published, so archive is not a bypass', async () => {
    resetDb({ archived_at: new Date() });
    const res = await request(app()).post(SHARE_URL).set('Authorization', auth)
      .send({ project_id: PROJECT, enabled: true, data_model: { app_name: 'x' } });
    expect(res.status).toBe(404);
    expect(db.demo_share_enabled).toBe(false);
  });

  it('the public route really filters: a row whose spec was cleared stops serving', async () => {
    // The documented rollback is `UPDATE projects SET demo_spec = NULL`, which leaves the row
    // ENABLED. The where-clause is what makes that safe, and this proves it over the real store
    // rather than over a per-case `findOne` stub.
    await request(app()).post(SHARE_URL).set('Authorization', auth)
      .send({ project_id: PROJECT, enabled: true, data_model: { app_name: 'x' } });
    expect((await request(app()).get(`/api/public/demo/${DEMO_TOKEN}`)).status).toBe(200);

    db.demo_spec = null;
    expect(db.demo_share_enabled).toBe(true); // still published, deliberately
    expect((await request(app()).get(`/api/public/demo/${DEMO_TOKEN}`)).status).toBe(404);
  });

  it('the harness itself filters, proved against a token that is one character off', () => {
    // The control. A `matches` that returned true for everything would make several assertions
    // above pass for the wrong reason.
    db.demo_share_token = DEMO_TOKEN;
    db.demo_share_enabled = true;
    db.demo_spec = SPEC;
    expect(matches({ demo_share_token: DEMO_TOKEN, demo_share_enabled: true, archived_at: null })).toBe(true);
    expect(matches({ demo_share_token: `${DEMO_TOKEN}x` })).toBe(false);
    expect(matches({ demo_share_enabled: false })).toBe(false);
    // The symbol branch, both ways. This is the clause whose first implementation silently
    // rejected every row, so it gets its own direct assertion rather than only being exercised.
    expect(matches({ demo_spec: { [Op.ne]: null } })).toBe(true);
    db.demo_spec = null;
    expect(matches({ demo_spec: { [Op.ne]: null } })).toBe(false);
  });
});
