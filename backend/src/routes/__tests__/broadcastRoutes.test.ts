/**
 * broadcastRoutes — the ROUTER, not its handlers.
 *
 * `broadcastController.test.ts` already covers what the two handlers decide. Nothing
 * covered the wiring around them, which is where this repo's route bugs actually live. Four
 * properties, each one a lesson already paid for in production:
 *
 *  1. THE FLAG GATE RUNS BEFORE AUTH. With BROADCAST_ENABLED off, an anonymous request must
 *     get a clean 404 — not the 401 that looks like a broken login. Both tests are here,
 *     because "404 when off" passes trivially if the gate is last and auth answers first.
 *
 *  2. MOUNT ORDER. Below `adminRoutes` every broadcast request 401s, which is the bug `/r/`,
 *     `/i/` and `/m/` each hit live. Both orders are built and asserted.
 *
 *  3. NO UNSCOPED GUARD. `explorerSignalRoutes.ts` records that `router.use(guard)` in a
 *     sub-router mounted without a path prefix caused two outages: it gates every route
 *     registered after it. An unrelated path mounted after this router is asserted
 *     untouched, by both the auth guard and the limiters.
 *
 *  4. THE RULE THE ROUTER DELIBERATELY DOES NOT DUPLICATE. The router's header says it does
 *     not re-check read-only impersonation because participantAuth already blocks non-safe
 *     methods. That is only a safe omission if it is true here, so it is asserted here.
 */

// The handlers are replaced with markers: this file is about what reaches them.
jest.mock('../../controllers/broadcastController', () => ({
  postProducerCommand: (req: { participant?: { isStaff?: boolean } }, res: { json: (b: unknown) => void }) =>
    res.json({ reached: 'command', isStaff: req.participant?.isStaff ?? null }),
  postPlaybackGrant: (req: { participant?: { isStaff?: boolean } }, res: { json: (b: unknown) => void }) =>
    res.json({ reached: 'playback', isStaff: req.participant?.isStaff ?? null }),
  // Added when the discovery route landed. Omitting it is not a soft failure: Express throws
  // "Route.get() requires a callback function but got [object Undefined]" at module load, and
  // every test in this file fails at once. Nineteen of them did.
  getActiveBroadcasts: (req: { participant?: { isStaff?: boolean } }, res: { json: (b: unknown) => void }) =>
    res.json({ reached: 'discovery', isStaff: req.participant?.isStaff ?? null }),
  // L4.6's measurement pair. Same trap as the note above, and it caught this change too:
  // leaving either out fails every test in this file at module load, not just its own.
  postPlaybackHeartbeat: (req: { participant?: { isStaff?: boolean } }, res: { json: (b: unknown) => void }) =>
    res.json({ reached: 'heartbeat', isStaff: req.participant?.isStaff ?? null }),
  getLiveAudience: (req: { participant?: { isStaff?: boolean } }, res: { json: (b: unknown) => void }) =>
    res.json({ reached: 'audience', isStaff: req.participant?.isStaff ?? null }),
  // L8.3's replay list. Third time the trap above has caught a change to this router, and
  // it caught this one too: every test in this file failed at module load until it was added.
  getReplayBroadcasts: (req: { participant?: { isStaff?: boolean } }, res: { json: (b: unknown) => void }) =>
    res.json({ reached: 'replays', isStaff: req.participant?.isStaff ?? null }),
}));

// participantAuth calls logAuthFailure on every rejected token, which reaches
// emitAiEvent -> AiEvent.create() -> a real database. With no DATABASE_URL that attempt
// just logs and resolves, but it is unmocked I/O inside a route test: it made
// "401s a token signed with the wrong secret" take ~1.9s alone and time out once under a
// parallel 82-suite run. Mocked, so this suite tests routing and nothing else.
jest.mock('../../middlewares/authFailureLog', () => ({
  logAuthFailure: jest.fn(),
  describeCaller: () => ({ forwarded_for: null, user_agent: null }),
}));

// The real one reads community_members from the database. What matters to the router is
// that it runs on these two routes and nowhere else.
jest.mock('../../middlewares/communityRoomsStaffContext', () => ({
  attachCommunityStaffContext: async (
    req: { participant?: { isStaff?: boolean } },
    _res: unknown,
    next: () => void,
  ) => {
    if (req.participant) req.participant.isStaff = true;
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
// Type-only, and load-bearing: `req.participant` is a global augmentation declared in
// participantAuth.ts, and tsc only applies it when that file is in the program.
import type { ParticipantPayload } from '../../middlewares/participantAuth';

// Set before any isolateModules() require, so every freshly-loaded config/env sees it.
// config/env is deliberately NOT imported at the top of this file: it would capture the
// secret and the flag once, and both have to vary per test.
const SECRET = ['broadcast', 'router', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;

const OCC = '11111111-2222-4333-8444-555555555555';
const COMMAND = `/api/portal/broadcasts/${OCC}/command`;
const PLAYBACK = `/api/portal/broadcasts/${OCC}/playback`;
const DISCOVERY = '/api/portal/broadcasts/active';

function token(extra: Record<string, unknown> = {}): string {
  return jwt.sign(
    { sub: 'enr-1', email: 'learner@example.com', cohort_id: 'c1', role: 'participant', ...extra },
    SECRET,
  );
}

function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

/**
 * A fresh module registry per app, for two reasons: config/env reads BROADCAST_ENABLED at
 * eval time, and the rate limiters hold their counters at module scope, so a shared router
 * would make one test's traffic another test's 429.
 */
function buildApp(opts: { flag?: string; belowAdmin?: boolean; withUnrelated?: boolean } = {}): express.Express {
  const prev = process.env.BROADCAST_ENABLED;
  if (opts.flag === undefined) delete process.env.BROADCAST_ENABLED;
  else process.env.BROADCAST_ENABLED = opts.flag;

  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../broadcastRoutes').default as express.Router; });

  if (prev === undefined) delete process.env.BROADCAST_ENABLED;
  else process.env.BROADCAST_ENABLED = prev;

  const app = express();
  app.use(express.json());
  if (opts.belowAdmin) app.use(adminRoutesShaped());
  app.use(router);
  if (opts.withUnrelated) {
    // Registered AFTER the broadcast router, which is exactly where an unscoped
    // router.use(guard) or router.use(limiter) would reach.
    app.get('/api/portal/unrelated/thing', (req, res) => {
      const attached: ParticipantPayload | undefined = req.participant;
      res.json({ ok: true, sawParticipant: attached !== undefined });
    });
  }
  if (!opts.belowAdmin) app.use(adminRoutesShaped());
  return app;
}

describe('the flag gate runs before auth', () => {
  it('404s an ANONYMOUS request when the feature is off — not the 401 that looks like a broken login', async () => {
    const res = await request(buildApp({ flag: undefined })).post(COMMAND).send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('404s an AUTHENTICATED request when the feature is off', async () => {
    const res = await request(buildApp({ flag: undefined }))
      .post(PLAYBACK).set('Authorization', `Bearer ${token()}`).send({});
    expect(res.status).toBe(404);
  });

  it('401s an anonymous request once the feature is ON — the positive control for the test above', async () => {
    // Without this, "404 when off" would also pass with the gate mounted LAST, because auth
    // would answer first and the 404 would never be the gate's doing.
    const res = await request(buildApp({ flag: 'true' })).post(COMMAND).send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });

  it('gates EVERY route, not just the first one declared', async () => {
    const app = buildApp({ flag: undefined });
    expect((await request(app).post(COMMAND).send({})).status).toBe(404);
    expect((await request(app).post(PLAYBACK).send({})).status).toBe(404);
    // Added with the discovery route. A new route that forgets the gate is exactly the
    // omission this test exists to catch, so it has to enumerate all of them.
    expect((await request(app).get(DISCOVERY)).status).toBe(404);
  });
});

describe('mount order', () => {
  it('reaches the handler when mounted ABOVE adminRoutes', async () => {
    const res = await request(buildApp({ flag: 'true' }))
      .post(COMMAND).set('Authorization', `Bearer ${token()}`).send({ command: 'go_live', expected_version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe('command');
  });

  it('401s every request when mounted BELOW adminRoutes — the bug /r/, /i/ and /m/ each hit live', async () => {
    const res = await request(buildApp({ flag: 'true', belowAdmin: true }))
      .post(COMMAND).set('Authorization', `Bearer ${token()}`).send({ command: 'go_live', expected_version: 1 });
    expect(res.status).toBe(401);
    expect(res.body.reached).toBeUndefined();
  });

  it('401s even the flag-off 404 when mounted below — so the clean 404 depends on the mount too', async () => {
    const res = await request(buildApp({ flag: undefined, belowAdmin: true })).post(COMMAND).send({});
    expect(res.status).toBe(401);
  });
});

describe('staff context is attached on these routes', () => {
  it('reaches the handler with isStaff resolved, not read from the body', async () => {
    const res = await request(buildApp({ flag: 'true' }))
      .post(PLAYBACK).set('Authorization', `Bearer ${token()}`).send({ asset: 'master.m3u8', is_producer: false });
    expect(res.status).toBe(200);
    // The middleware ran: the handler saw a resolved flag rather than undefined.
    expect(res.body).toMatchObject({ reached: 'playback', isStaff: true });
  });
});

describe('no unscoped guard — the two-outage lesson', () => {
  it('leaves an unrelated path registered AFTER this router completely alone', async () => {
    const res = await request(buildApp({ flag: 'true', withUnrelated: true })).get('/api/portal/unrelated/thing');
    expect(res.status).toBe(200);
    // No auth guard reached it, so no participant was attached by this router's chain.
    expect(res.body).toEqual({ ok: true, sawParticipant: false });
  });

  it('does not rate-limit an unrelated path, even under traffic that would exhaust both limiters', async () => {
    const app = buildApp({ flag: 'true', withUnrelated: true });
    const results = await Promise.all(
      Array.from({ length: 100 }, () => request(app).get('/api/portal/unrelated/thing')),
    );
    expect(results.map((r) => r.status).filter((s) => s !== 200)).toEqual([]);
  });

  it('still answers the flag-off 404 for an unrelated path it does not own — it 404s nothing it did not route', async () => {
    // The gate is per route, so an unrelated path falls through to whatever is mounted next
    // (here, the adminRoutes stand-in) rather than being swallowed by the broadcast gate.
    const res = await request(buildApp({ flag: undefined })).get('/api/portal/something-else');
    expect(res.status).toBe(401);          // the stand-in, i.e. it fell through
    expect(res.body).toEqual({ error: 'Authentication required' });
  });
});

describe('the read-only rule the router deliberately does not duplicate', () => {
  it('403s a read-only impersonation token on a producer command', async () => {
    const res = await request(buildApp({ flag: 'true' }))
      .post(COMMAND)
      .set('Authorization', `Bearer ${token({ read_only: true, impersonated_by: 'admin@colaberry.com' })}`)
      .send({ command: 'go_live', expected_version: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/read-only/i);
    expect(res.body.reached).toBeUndefined();
  });

  it('403s a token whose role is not participant', async () => {
    const res = await request(buildApp({ flag: 'true' }))
      .post(PLAYBACK).set('Authorization', `Bearer ${token({ role: 'admin' })}`).send({ asset: 'master.m3u8' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Participant access required' });
  });

  it('401s a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: 'enr-1', email: 'x@y.z', cohort_id: 'c1', role: 'participant' }, 'not-the-secret');
    const res = await request(buildApp({ flag: 'true' }))
      .post(PLAYBACK).set('Authorization', `Bearer ${forged}`).send({ asset: 'master.m3u8' });
    expect(res.status).toBe(401);
  });
});

describe('rate limits', () => {
  const auth = () => `Bearer ${token()}`;

  it('allows 60 playback grants in the window and 429s the 61st', async () => {
    const app = buildApp({ flag: 'true' });
    const burst = await Promise.all(
      Array.from({ length: 60 }, () => request(app).post(PLAYBACK).set('Authorization', auth()).send({ asset: 'a.m3u8' })),
    );
    expect(burst.filter((r) => r.status === 429)).toHaveLength(0);

    const over = await request(app).post(PLAYBACK).set('Authorization', auth()).send({ asset: 'a.m3u8' });
    expect(over.status).toBe(429);
    // A real 429, not a silent 204: a throttled player has to be able to tell.
    expect(over.body).toEqual({ error: 'RateLimited', reason: 'too_many_playback_requests' });
  });

  it('allows 30 producer commands and 429s the 31st, with its own reason', async () => {
    const app = buildApp({ flag: 'true' });
    const burst = await Promise.all(
      Array.from({ length: 30 }, () => request(app).post(COMMAND).set('Authorization', auth()).send({ command: 'end', expected_version: 1 })),
    );
    expect(burst.filter((r) => r.status === 429)).toHaveLength(0);

    const over = await request(app).post(COMMAND).set('Authorization', auth()).send({ command: 'end', expected_version: 1 });
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ error: 'RateLimited', reason: 'too_many_commands' });
  });

  it('keeps the two limiters SEPARATE — a scraped playback endpoint must not lock out the producer', async () => {
    const app = buildApp({ flag: 'true' });
    await Promise.all(
      Array.from({ length: 61 }, () => request(app).post(PLAYBACK).set('Authorization', auth()).send({ asset: 'a.m3u8' })),
    );
    const command = await request(app).post(COMMAND).set('Authorization', auth()).send({ command: 'end', expected_version: 1 });
    expect(command.status).toBe(200);
    expect(command.body.reached).toBe('command');
  });

  it('counts an UNAUTHENTICATED flood too — the limiter sits in front of the auth check', async () => {
    const app = buildApp({ flag: 'true' });
    // 30, the command limiter's own ceiling — not 60. The first draft of this test used 60
    // and failed, which is the limiters being genuinely separate rather than a bug.
    const burst = await Promise.all(Array.from({ length: 30 }, () => request(app).post(COMMAND).send({})));
    // All rejected by auth, and all counted anyway.
    expect(burst.every((r) => r.status === 401)).toBe(true);
    const over = await request(app).post(COMMAND).send({});
    expect(over.status).toBe(429);
  });

  it('advertises the standard RateLimit headers and none of the legacy ones', async () => {
    const res = await request(buildApp({ flag: 'true' }))
      .post(PLAYBACK).set('Authorization', auth()).send({ asset: 'a.m3u8' });
    expect(res.headers['ratelimit-limit'] ?? res.headers['ratelimit']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});


describe('the discovery route carries the same chain as the rest', () => {
  it('404s an anonymous request when the feature is off, like its siblings', async () => {
    const res = await request(buildApp({ flag: undefined })).get(DISCOVERY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('401s an anonymous request once the feature is on', async () => {
    const res = await request(buildApp({ flag: 'true' })).get(DISCOVERY);
    expect(res.status).toBe(401);
  });

  it('reaches the handler with staff context resolved', async () => {
    const res = await request(buildApp({ flag: 'true' }))
      .get(DISCOVERY).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reached: 'discovery', isStaff: true });
  });

  it('401s when mounted BELOW adminRoutes', async () => {
    const res = await request(buildApp({ flag: 'true', belowAdmin: true }))
      .get(DISCOVERY).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(401);
  });

  it('SHARES the playback limiter, because a ticker polls like a renewing player', async () => {
    // A deliberate choice rather than an accident of copy-paste: discovery traffic has the
    // shape of playback traffic, not of a producer action. Pinned so the next person sees it
    // was decided.
    const app = buildApp({ flag: 'true' });
    const auth = `Bearer ${token()}`;
    await Promise.all(
      Array.from({ length: 60 }, () => request(app).post(PLAYBACK).set('Authorization', auth).send({ asset: 'a.m3u8' })),
    );

    const over = await request(app).get(DISCOVERY).set('Authorization', auth);
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ error: 'RateLimited', reason: 'too_many_playback_requests' });
  });

  it('does not consume the COMMAND budget', async () => {
    const app = buildApp({ flag: 'true' });
    const auth = `Bearer ${token()}`;
    await Promise.all(
      Array.from({ length: 30 }, () => request(app).get(DISCOVERY).set('Authorization', auth)),
    );
    const command = await request(app).post(COMMAND).set('Authorization', auth).send({ command: 'end', expected_version: 1 });
    expect(command.status).toBe(200);
  });
});
