import type { Server } from 'http';
import express from 'express';
import request from 'supertest';
import {
  GROWTH_JOURNEY_RATE_MAX,
  GROWTH_JOURNEY_RATE_WINDOW_MS,
  callerKey,
  makeGrowthJourneyLimiter,
} from '../growthJourneyRateLimit';

/**
 * The Growth Journey rate limit (Phase 6, T612), tested as BEHAVIOUR.
 *
 * Every cell here drives a real express app through the real middleware the
 * factory builds. Nothing imports a route module: `growthJourneyRoutes` reaches
 * `config/database` through its controllers, and pulling that into a limiter
 * suite is how T611 took four unrelated suites down. That the four routers
 * actually MOUNT this limiter, path-scoped, is a separate property and is
 * asserted on their source in `admin/__tests__/growthJourneyRoutes.source.test.ts`
 * - a scan there, because it is about where a line sits in a file.
 */

const MAX = GROWTH_JOURNEY_RATE_MAX;

/**
 * ONE SERVER PER CELL, NOT ONE PER REQUEST.
 *
 * `request(app)` binds a fresh ephemeral port for every call, and these cells make 121
 * of them. That was fast enough in isolation and flaky under real load: during a
 * thirteen-mutant run the budget cell failed in ten blocks, including mutants to
 * `healthRoutes` and `REVIEW_ONLY_CHANNELS` that cannot touch a limiter. The cause was
 * wall-clock - 121 binds on a loaded box can outlast the 60-second window, the counter
 * resets, and the 121st request is legitimately allowed. Listening once removes the
 * per-request bind and the race with it.
 *
 * A test that fails for a reason unrelated to its subject is worse than no test: it
 * teaches everyone to ignore the suite.
 */
const servers: Server[] = [];

function serverWith(prefix: string, bucket = 'spec'): Server {
  const app = express();
  const router = express.Router();
  router.use(prefix, makeGrowthJourneyLimiter(bucket));
  router.get(`${prefix}/thing`, (_req, res) => res.status(200).json({ ok: true }));
  router.get('/elsewhere/thing', (_req, res) => res.status(200).json({ ok: true }));
  app.use(router);
  const s = app.listen(0);
  servers.push(s);
  return s;
}

const listen = (app: express.Express): Server => {
  const s = app.listen(0);
  servers.push(s);
  return s;
};

afterAll(() => {
  for (const s of servers) s.close();
});

/** Fire n requests in series and return the statuses. Series, not parallel: the
 *  counter is the thing under test and concurrency would make the boundary fuzzy. */
async function fire(target: Server, path: string, n: number, headers: Record<string, string> = {}): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const res = await request(target).get(path).set(headers);
    out.push(res.status);
  }
  return out;
}

describe('the budget', () => {
  it(`allows exactly ${MAX} requests and refuses the ${MAX + 1}st with a 429`, async () => {
    const app = serverWith('/api/admin/growth-journey');
    const statuses = await fire(app, '/api/admin/growth-journey/thing', MAX + 1);
    expect(statuses.slice(0, MAX)).toEqual(Array(MAX).fill(200));
    expect(statuses[MAX]).toBe(429);
  });

  it('the window and the ceiling are the numbers the rest of the repo already uses', () => {
    expect(GROWTH_JOURNEY_RATE_WINDOW_MS).toBe(60 * 1000);
    expect(MAX).toBe(120);
  });

  it('advertises the standard headers, and the draft-legacy ones are absent', async () => {
    const app = serverWith('/api/admin/growth-journey');
    const res = await request(app).get('/api/admin/growth-journey/thing');
    expect(res.headers['ratelimit-limit']).toBe(String(MAX));
    expect(res.headers['ratelimit-policy']).toBe(`${MAX};w=60`);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('path scoping: the limiter must never gate what it was not mounted over', () => {
  // The rule this repo learned twice in production: sub-routers mount with no path
  // prefix, so a bare `router.use(limiter)` bills unrelated traffic.
  it('a route outside the prefix is untouched after the budget is exhausted', async () => {
    const app = serverWith('/api/admin/growth-journey');
    const inside = await fire(app, '/api/admin/growth-journey/thing', MAX + 1);
    expect(inside[MAX]).toBe(429);
    // Same app, same client, same instant - a different prefix.
    const outside = await request(app).get('/elsewhere/thing');
    expect(outside.status).toBe(200);
    expect(outside.headers['ratelimit-limit']).toBeUndefined();
  });
});

describe('one request is counted ONCE, however many routers it passes through', () => {
  // Why this exists: `router.use(prefix, mw)` runs for any path under `prefix` and then
  // calls next(), so a request for the journey router's route passes through the read
  // router's limiter first. With separate instances that is two counts for one request
  // and the effective ceiling silently halves.
  it('the same instance mounted at two overlapping prefixes still refuses on the 121st', async () => {
    const app = express();
    const router = express.Router();
    const shared = makeGrowthJourneyLimiter('overlap');
    router.use('/api/admin/growth-journey', shared);
    router.use('/api/admin/growth-journey/performance', shared);
    router.get('/api/admin/growth-journey/performance/thing', (_req, res) => res.status(200).json({ ok: true }));
    app.use(router);
    const server = listen(app);

    const statuses = await fire(server, '/api/admin/growth-journey/performance/thing', MAX + 1);
    // If the re-entry mark were missing this would refuse at 61, not 121.
    expect(statuses.filter((s) => s === 200)).toHaveLength(MAX);
    expect(statuses[MAX]).toBe(429);
  });

  it('two DIFFERENT buckets do not share a budget - the portal router is not billed to the admin one', async () => {
    const app = express();
    const router = express.Router();
    router.use('/a', makeGrowthJourneyLimiter('bucket-a'));
    router.use('/b', makeGrowthJourneyLimiter('bucket-b'));
    router.get('/a/thing', (_req, res) => res.status(200).json({ ok: true }));
    router.get('/b/thing', (_req, res) => res.status(200).json({ ok: true }));
    app.use(router);
    const server = listen(app);

    expect((await fire(server, '/a/thing', MAX + 1))[MAX]).toBe(429);
    // /b has not been touched, so it still has its whole budget.
    expect((await request(server).get('/b/thing')).status).toBe(200);
  });
});

describe('the key: who is being limited, and what must never be in it', () => {
  it('an authenticated admin is keyed by `sub`', () => {
    const req = { admin: { sub: 'staff-1', email: 'staff@colaberry.com', role: 'admin' }, ip: '203.0.113.7' };
    expect(callerKey(req as never)).toBe('admin:staff-1');
  });

  it('NO ADDRESS EVER REACHES THE KEY, though the same payload carries one', () => {
    // A rate-limit key reaches the store and the library's own error paths. The
    // AuthPayload beside `sub` carries `email`, so keying on the wrong field would
    // put an address somewhere this phase's rules say it may never go.
    const req = { admin: { sub: 'staff-1', email: 'someone@example.com', role: 'admin' }, ip: '203.0.113.7' };
    const key = callerKey(req as never);
    expect(key).not.toContain('@');
    expect(key).not.toContain('someone');
    expect(key).not.toContain('example.com');
  });

  it('an unauthenticated caller falls back to the IP, through the library helper', () => {
    // Not a bare req.ip: a custom key generator returning one trips v8's
    // ERR_ERL_KEY_GEN_IPV6, because one IPv6 address is one of trillions a client holds.
    expect(callerKey({ ip: '203.0.113.7' } as never)).toBe('203.0.113.7');
    const v6 = callerKey({ ip: '2001:db8::1' } as never);
    expect(v6).toContain('/');
    expect(v6).not.toBe('2001:db8::1');
  });

  it('a missing ip does not throw and does not produce an empty key', () => {
    expect(callerKey({} as never)).toBeTruthy();
  });

  it('two admins have separate budgets, so one cannot exhaust the other', async () => {
    // Keyed per admin rather than per IP: two staff behind one office NAT must not
    // share 120 requests a minute between them.
    const app = express();
    const router = express.Router();
    router.use('/x', (req, _res, next) => {
      const sub = req.headers['x-spec-admin'];
      if (typeof sub === 'string') req.admin = { sub, email: `${sub}@example.com`, role: 'admin' };
      next();
    });
    router.use('/x', makeGrowthJourneyLimiter('per-admin'));
    router.get('/x/thing', (_req, res) => res.status(200).json({ ok: true }));
    app.use(router);
    const server = listen(app);

    const first = await fire(server, '/x/thing', MAX + 1, { 'x-spec-admin': 'staff-1' });
    expect(first[MAX]).toBe(429);
    const second = await request(server).get('/x/thing').set('x-spec-admin', 'staff-2');
    expect(second.status).toBe(200);
  });
});
