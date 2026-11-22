/**
 * The public demo route: one 404, four ways to earn it, and nothing of the project on the wire.
 *
 * Two properties carry this file.
 *
 * 1. The four negative cases return BYTE-IDENTICAL bodies. If they differ by so much as a word,
 *    the route is an oracle: a guesser with a revoked token learns it was once real, which is the
 *    fact revocation exists to remove.
 * 2. The RESPONSE SENTINEL. Every non-allowlisted column of `projects` is seeded with a unique
 *    value and none may appear in the served bytes. The column list is read out of the model, so
 *    a column added later is seeded automatically and this test fails until somebody decides,
 *    deliberately, whether it belongs on the allow-list.
 */
import path from 'path';
import { projectColumns } from '../../models/__tests__/helpers/projectColumns';
import express from 'express';
import request from 'supertest';
import { Op } from 'sequelize';

const findOne = jest.fn();
jest.mock('../../models/Project', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => findOne(...a) } }));

/* eslint-disable @typescript-eslint/no-var-requires */
import demoRoutes, { NOT_FOUND_HTML, publicDemoUrl } from '../demoRoutes';
import { DEMO_PUBLIC_COLUMNS, demoPublicProjection } from '../../services/sbp/demoPublicProjection';

type Loose = Record<string, unknown>;

const app = express();
app.use(demoRoutes);

// Shaped like a real token (base64url, no padding) but obviously not one: the repo's secret
// scanner reads a high-entropy 44-character literal as a credential, and it is right to.
const TOKEN = 'demo-token-for-tests-only-not-a-real-secret';

function event(over: Loose = {}): Loose {
  return {
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
    ...over,
  };
}

const SPEC = {
  schema_version: 2,
  environment: 'demo',
  app: { name: 'Dispatch console', descriptor: 'd', persona: { name: 'Sam Rivera', role: 'Ops lead' } },
  events: [event()],
  screens: {},
  entities: {},
  nav: [],
};

/** A Sequelize-ish row: only `get({plain:true})` is used by the route. */
const rowOf = (plain: Loose) => ({ get: () => plain });

beforeEach(() => findOne.mockReset());

describe('a served demo', () => {
  it('returns 200 with the simulated banner in the document', async () => {
    findOne.mockResolvedValue(rowOf({ demo_spec: SPEC }));
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Simulated, not live');
    expect(res.text).toContain('id="demo-spec"');
  });

  it('carries X-Robots-Tag, so a pasted link does not become a search result', async () => {
    findOne.mockResolvedValue(rowOf({ demo_spec: SPEC }));
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('is never cached, because a cached link is not a revocable one', async () => {
    findOne.mockResolvedValue(rowOf({ demo_spec: SPEC }));
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('serves HTML, not JSON', async () => {
    findOne.mockResolvedValue(rowOf({ demo_spec: SPEC }));
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.headers['content-type']).toContain('text/html');
  });

  /**
   * The short path is NOT registered, and this asserts the absence on purpose.
   *
   * It used to assert the opposite - that `/demo/:token` answered 200 "for the day nginx routes
   * it". That shipped a public prefix with no `location` block, which is precisely the shape of
   * the `/m/` incident: a correct handler the edge never reaches. `nginxFilenameRouteLocations`
   * caught it, and the fix was to not register the prefix until the `nginx/` change is approved.
   *
   * Asserting the absence rather than deleting the test is what makes the decision survive. If
   * somebody re-adds the route without classifying the prefix, this fails and names the reason,
   * instead of the suite going quiet about a choice that was made deliberately.
   */
  it('does NOT answer the short /demo/:token path, because nginx does not route it yet', async () => {
    findOne.mockResolvedValue(rowOf({ demo_spec: SPEC }));
    expect((await request(app).get(`/demo/${TOKEN}`)).status).toBe(404);
    // And the 404 is Express's own, not ours: the handler was never reached at all.
    expect(findOne).not.toHaveBeenCalled();
  });

  it('and the canonical link never names the short path', () => {
    // The other half. Removing the route would be pointless if the link we publish pointed at it.
    expect(publicDemoUrl(TOKEN)).toBe(`/api/public/demo/${TOKEN}`);
    expect(publicDemoUrl(TOKEN, 'https://portal.colaberry.com'))
      .toBe(`https://portal.colaberry.com/api/public/demo/${TOKEN}`);
  });

  it('queries on all four conditions, not just the token', async () => {
    findOne.mockResolvedValue(rowOf({ demo_spec: SPEC }));
    await request(app).get(`/api/public/demo/${TOKEN}`);
    const where = (findOne.mock.calls[0][0] as { where: Loose }).where;
    expect(where.demo_share_token).toBe(TOKEN);
    expect(where.demo_share_enabled).toBe(true);
    expect(where.archived_at).toBeNull();
    // The clause the documented rollback makes necessary: `UPDATE ... SET demo_spec = NULL`
    // leaves an ENABLED row with nothing to render.
    // Asserted as the actual operator, not as "something is defined here": `{ demo_spec: null }`
    // would also be truthy-ish to a sloppy check and would mean the exact opposite.
    expect(where.demo_spec).toEqual({ [Op.ne]: null });
  });

  it('asks the database for the allow-listed columns ONLY', async () => {
    findOne.mockResolvedValue(rowOf({ demo_spec: SPEC }));
    await request(app).get(`/api/public/demo/${TOKEN}`);
    const attributes = (findOne.mock.calls[0][0] as { attributes: string[] }).attributes;
    expect(attributes).toEqual([...DEMO_PUBLIC_COLUMNS]);
    expect(attributes).toEqual(['demo_spec']);
  });
});

describe('ONE 404, and it is byte-identical however you earn it', () => {
  const cases: Array<[string, () => void]> = [
    ['an unknown token', () => findOne.mockResolvedValue(null)],
    ['a disabled demo', () => findOne.mockResolvedValue(null)],
    ['an archived project', () => findOne.mockResolvedValue(null)],
    // Reachable by the rollback the plan itself prescribes, so it is a specified state.
    ['an enabled row whose spec is NULL', () => findOne.mockResolvedValue(rowOf({ demo_spec: null }))],
  ];

  it.each(cases)('404s for %s', async (_label, arrange) => {
    arrange();
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns the SAME bytes for all four, so the route is not an oracle', async () => {
    const bodies: string[] = [];
    for (const [, arrange] of cases) {
      findOne.mockReset();
      arrange();
      bodies.push((await request(app).get(`/api/public/demo/${TOKEN}`)).text);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toBe(NOT_FOUND_HTML);
  });

  it('says nothing about tokens, projects or students in that body', async () => {
    findOne.mockResolvedValue(null);
    const body = (await request(app).get(`/api/public/demo/${TOKEN}`)).text;
    expect(body).not.toContain(TOKEN);
    for (const leak of ['disabled', 'revoked', 'archived', 'expired', 'project', 'student']) {
      expect(body.toLowerCase()).not.toContain(leak);
    }
  });

  it('404s a malformed token without touching the database at all', async () => {
    for (const bad of ['../../etc/passwd', 'has spaces', 'a'.repeat(200), '%00']) {
      findOne.mockReset();
      const res = await request(app).get(`/api/public/demo/${encodeURIComponent(bad)}`);
      expect(res.status).toBe(404);
      expect(findOne).not.toHaveBeenCalled();
    }
  });

  it('404s rather than 500s when the spec no longer passes its contract', async () => {
    // Our bug, not a missing resource. It still answers 404: a 500 would confirm the token is
    // real, which is the one thing this route must never tell anyone.
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    findOne.mockResolvedValue(rowOf({ demo_spec: { schema_version: 2, events: 'not an array' } }));
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.text).toBe(NOT_FOUND_HTML);
    quiet.mockRestore();
  });

  it('404s when the database itself fails, and logs the class', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    findOne.mockRejectedValue(Object.assign(new Error('connection refused'), { error_class: 'UpstreamUnavailable' }));
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.status).toBe(404);
    const logged = String(quiet.mock.calls[0]?.[0] || '');
    expect(logged).toContain('UpstreamUnavailable');
    // The token must never reach a log line this many people can read.
    expect(logged).not.toContain(TOKEN);
    quiet.mockRestore();
  });

  it('and the 404 body is still noindex, so a wrong link is not indexed either', async () => {
    findOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
});

describe('RESPONSE SENTINEL: no column of projects reaches the wire', () => {
  /**
   * The column list, from the shared helper.
   *
   * This file used to carry its own copy of the parse, reading only `Project.init(...)`. A
   * verifier showed that copy missed four columns added to `projects` by DDL alone plus the two
   * Sequelize-managed timestamps - and because the parse was duplicated, fixing the write-side
   * sweep left this one still blind. One helper now, so a fix lands in both.
   */
  const allColumns = () =>
    projectColumns(
      path.resolve(__dirname, '../../models'),
      path.resolve(__dirname, '../../db'),
      expect as never,
    );

  it('seeds every non-allowlisted column and finds none of them in the served bytes', async () => {
    const columns = allColumns().filter((c) => !(DEMO_PUBLIC_COLUMNS as readonly string[]).includes(c));
    const sentinels = new Map(columns.map((c, i) => [c, `WIRE-${i}-${c.toUpperCase()}-QQ7`]));

    // The row carries a sentinel in EVERY column, as if `attributes` had been ignored. The route
    // must still serve only what the projection names.
    const plain: Loose = { demo_spec: SPEC };
    for (const [c, v] of sentinels) plain[c] = v;
    findOne.mockResolvedValue(rowOf(plain));

    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.status).toBe(200);
    for (const [column, sentinel] of sentinels) {
      expect({ column, onTheWire: res.text.includes(sentinel) }).toEqual({ column, onTheWire: false });
    }
  });

  it('and a sentinel inside demo_spec DOES reach the wire, so the sweep is not vacuous', async () => {
    // The control. `demo_spec` is the one allow-listed field, and it is rendered: if nothing at
    // all came through, the test above would pass on an empty page.
    findOne.mockResolvedValue(rowOf({
      demo_spec: { ...SPEC, app: { ...SPEC.app, name: 'CANARY-QQ7' } },
    }));
    const res = await request(app).get(`/api/public/demo/${TOKEN}`);
    expect(res.text).toContain('CANARY-QQ7');
  });

  it('the projection NAMES its fields rather than filtering a row', async () => {
    // Handed a whole project row, it returns one field. A deny-list would return the rest.
    const projected = demoPublicProjection({
      demo_spec: SPEC,
      organization_name: 'Acme Health',
      share_token: 'portfolio-token',
      id: 'p1',
    });
    expect(Object.keys(projected || {})).toEqual(['demo_spec']);
  });

  it('returns null for a null row rather than an object with undefined fields', () => {
    expect(demoPublicProjection(null)).toBeNull();
    expect(demoPublicProjection(undefined)).toBeNull();
  });
});

describe('publicDemoUrl', () => {
  it('emits the path nginx already routes, so the link is not dead on arrival', () => {
    expect(publicDemoUrl('abc')).toBe('/api/public/demo/abc');
  });

  it('takes an origin for an absolute link, and escapes the token', () => {
    expect(publicDemoUrl('a/b', 'https://example.test')).toBe('https://example.test/api/public/demo/a%2Fb');
  });
});
