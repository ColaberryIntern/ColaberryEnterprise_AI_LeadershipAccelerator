import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * WHERE THE LIMITER ACTUALLY RUNS, for every route, as BEHAVIOUR (Phase 6, T612).
 *
 * This suite exists because a scan could not see either of the two defects that shipped.
 *
 * `growthJourneyRoutes.source.test.ts` compares the string index of the limiter against
 * the string index of `requireAdmin` INSIDE ONE FILE. That is blind to the two things
 * that decided the real behaviour:
 *
 *   1. PREFIX SCOPE. `growthJourneyReadRoutes` mounted one limiter over the whole
 *      `/api/admin/growth-journey` prefix - broader than every guard in that file - so
 *      requests for `growthJourneyRoutes`' own paths hit it first with NO guard ahead
 *      and were keyed to the Cloudflare edge node. Worse, the shared instance's
 *      re-entry mark then made the journey router's correctly-placed limiter SKIP them,
 *      so `edge:` was not a fallback on those twelve routes - it was the only key.
 *   2. REGISTRATION ORDER. Moving that limiter below the guard groups also moved it
 *      below the five `/performance/*` `router.get` calls. Express matches layers in
 *      registration order, so those five had no rate limit at all.
 *
 * Both are properties of a REQUEST, not of a line's position, so they are asserted by
 * making requests. The routers are mounted in `adminRoutes.ts`' own order, because that
 * order is what decides which router sees a request first.
 *
 * TWO PROPERTIES PER ROUTE:
 *   - the limiter RAN (the response carries `ratelimit-limit`) - this catches (2);
 *   - it keyed on the CALLER, proved by two different admin `sub`s each seeing a full
 *     budget on their first request - this catches (1), because one shared edge bucket
 *     decrements across both.
 */

const J = '/api/admin/growth-journey';

const growthJourney = {
  growthJourneyEnabled: true, journeySignalIngest: true, journeyClassification: true,
  journeyDecisions: true, journeyHandoffs: true, journeyExecution: true,
};
jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney, explorerGrowth: {} },
}));

const row: Record<string, unknown> = {
  id: '30000000-0000-4000-8000-000000000001', lead_id: 4711, tenant_id: 't-cola',
  brand_id: 'b-ent', program_id: 'p-1', subject_ref: 'lead:4711', status: 'queued',
  created_at: new Date('2026-09-20T10:00:00Z'), updated_at: new Date('2026-09-20T10:00:00Z'),
};
const inst = () => ({ ...row, get: (k?: string) => (k === undefined ? row : row[k]), toJSON: () => row });

jest.mock('../../../models', () => {
  const model = {
    findAll: async () => [inst()], findOne: async () => inst(), findByPk: async () => inst(),
    count: async () => 1, findAndCountAll: async () => ({ rows: [inst()], count: 1 }),
    max: async () => new Date('2026-09-20T10:00:00Z'), sum: async () => 1,
    create: async () => inst(), update: async () => [1], destroy: async () => 1,
  };
  return new Proxy({}, { get: () => model });
});
jest.mock('../../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://u:p@127.0.0.1:5432/x', { logging: false });
  sequelize.query = jest.fn(async () => [[row], {}]);
  return { sequelize };
});
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
  readEvents: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../modules/tenancy/leadContextService', () => ({
  getAuthorizedLeadContexts: jest.fn(async () => [row]),
  getLeadContexts: jest.fn(async () => [row]),
}));
/** Echoes back whichever admin the token named, so per-caller keying is observable. */
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  contextFromAdminRequest: jest.fn(async (req: { admin?: { sub?: string } }) => ({
    tenantId: 't-cola', brandId: null, authorizedTenantIds: ['t-cola'],
    authorizedBrandIds: null, isPlatformSuperAdmin: true, identityId: req.admin?.sub ?? 'unknown',
  })),
}));

import statusRoutes from '../growthJourneyStatusRoutes';
import readRoutes from '../growthJourneyReadRoutes';
import journeyRoutes from '../growthJourneyRoutes';

const HERE = path.join(__dirname, '..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every route the three routers declare, verbs included, prefixes resolved. */
function routesOf(file: string, subs: Record<string, string>): { verb: string; pattern: string }[] {
  const src = stripComments(fs.readFileSync(path.join(HERE, file), 'utf8'));
  return Array.from(src.matchAll(/router\.(get|post|patch|put)\(\s*[`']([^`']+)[`']/g)).map(([, verb, p]) => ({
    verb,
    pattern: Object.entries(subs).reduce((acc, [k, v]) => acc.replace(`\${${k}}`, v), p),
  }));
}

const DECLARED = [
  ...routesOf('growthJourneyStatusRoutes.ts', { BASE: `${J}/status` }),
  ...routesOf('growthJourneyReadRoutes.ts', { BASE: `${J}/performance`, JOURNEY: J }),
  ...routesOf('growthJourneyRoutes.ts', { BASE: J }),
];

const concrete = (p: string) =>
  p.replace(':leadId', '4711').replace(/:[A-Za-z]+/g, '30000000-0000-4000-8000-000000000001');

/** Mounted in `adminRoutes.ts` order - status, read, journey. That order decides which
 *  router sees a request first, which is exactly what defect (1) turned on. */
const app = () => {
  const a = express();
  a.use(express.json());
  a.use(statusRoutes);
  a.use(readRoutes);
  a.use(journeyRoutes);
  return a;
};

const tokenFor = (sub: string) => jwt.sign({ sub, email: `${sub}@colaberry.com`, role: 'super_admin' }, 'test-secret');

type Verb = 'get' | 'post' | 'patch' | 'put';

async function hit(verb: string, route: string, sub: string) {
  const agent = request(app());
  const res = await agent[verb as Verb](route).set('Authorization', `Bearer ${tokenFor(sub)}`).send({});
  return { status: res.status, limit: res.headers['ratelimit-limit'], remaining: res.headers['ratelimit-remaining'] };
}

/**
 * A caller nobody else in this file uses.
 *
 * The limiter instance is module scope, so a `sub` reused across cells carries its
 * spent budget with it - the first draft of the keying cells below asserted a full
 * budget and saw 118, 117, 116 as the file progressed. That was the test's fault, not
 * the limiter's, and a unique caller per cell is what makes "a full budget on a first
 * request" mean what it says.
 */
let callerSeq = 0;
const freshCaller = () => `spec-${(callerSeq += 1)}`;

/** The files every source scanner in this area reads. */
const SCANNED = [
  'growthJourneyRoutes.ts', 'growthJourneyStatusRoutes.ts', 'growthJourneyReadRoutes.ts',
  path.join('..', 'journeyNudgeRoutes.ts'), path.join('..', 'growthJourneyRateLimit.ts'),
];

describe('the derivation is real', () => {
  it('enumerates EXACTLY the routes the three routers declare, verbs included', () => {
    // `toBe`, not `toBeGreaterThanOrEqual`. The loose `>= 33` pin TOLERATED two routes
    // vanishing from this matrix without a word. No route ever actually did - the count was
    // 35 before the fix and 35 after - so this pin is a guard against a future loss, not a
    // record of a past one.
    //
    // WHICH CELL CATCHES WHAT. These are not interchangeable, and the distinction was
    // measured rather than reasoned about - build the hazard below, register a live route
    // inside the window it swallows, and run this suite:
    //
    //   - a route that DISAPPEARS from the derivation       -> this cell
    //   - a route HIDDEN from the derivation by the stripper -> the two cells below
    //     (`no scanned file hides code from the stripper`, `every mount this suite
    //      depends on is visible to the stripper`)
    //
    // With a route hidden, THIS CELL IS GREEN, and it has to be: a swallowed route never
    // reaches `DECLARED`, so the count is unchanged and an exact pin is satisfied. Only the
    // stripper cells fire. Delete a real route instead and the reverse holds - this cell
    // fires alone. Two earlier versions of this comment got that wrong in opposite
    // directions: one claimed routes "did" drop out, the next credited this pin with
    // catching the swallowed-route hazard.
    //
    // NO TOTALS ARE QUOTED HERE ON PURPOSE. An earlier draft named a pass/fail count for
    // that run, and no check reads it - add one cell to this suite or one route to any of
    // the three routers and the comment is false with nothing red. That is the same
    // stale-figure defect this paragraph exists to describe, merely relocated from a log
    // into a comment. The CELL NAMES above are drift-proof; a tally is not.
    expect(DECLARED.length).toBe(35);
    expect(DECLARED.filter((r) => r.verb === 'post').length).toBe(8);
    expect(DECLARED.every((r) => r.pattern.startsWith(J))).toBe(true);
  });

  it('no scanned file hides code from the stripper - a `//` comment never contains a block-open', () => {
    // THE DEFECT THIS EXISTS FOR. `stripComments` removes /* ... */ before // lines, so a
    // block-open inside a line comment pairs with the next block-close further down the
    // file and everything between vanishes. `/people/` + `*` in a `//` comment swallowed
    // twelve lines of growthJourneyReadRoutes.ts, hiding the limiter mount from the cell
    // written to watch it. A live route registered in that window WOULD BE invisible to
    // this matrix and to the privacy sweep, with nothing red - stated as the property it
    // is, because no such route ever shipped and the past tense would assert an event
    // that did not happen.
    const offenders: string[] = [];
    for (const rel of SCANNED) {
      const src = fs.readFileSync(path.join(HERE, rel), 'utf8');
      src.split(/\r?\n/).forEach((line, i) => {
        const c = line.indexOf('//');
        if (c !== -1 && line.slice(c).includes('/*')) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('...and that check can fail - the stripper really does swallow code in that shape', () => {
    // The positive control. Without it the cell above passes on an empty offender list
    // whether or not the hazard is real.
    const LF = String.fromCharCode(10);
    const hazard = ['// a comment mentioning /people/*', 'router.use(BASE, theLimiter);', '/** next doc */'].join(LF);
    expect(stripComments(hazard)).not.toContain('router.use(BASE, theLimiter)');
    const safe = ['// a comment mentioning /people/:id', 'router.use(BASE, theLimiter);', '/** next doc */'].join(LF);
    expect(stripComments(safe)).toContain('router.use(BASE, theLimiter)');
  });

  it('every mount this suite depends on is visible to the stripper', () => {
    // Stated positively: the lines under test must survive comment-stripping, or the
    // ordering cell in growthJourneyRoutes.source.test.ts is asserting about nothing.
    const read = stripComments(fs.readFileSync(path.join(HERE, 'growthJourneyReadRoutes.ts'), 'utf8'));
    expect(read).toContain('router.use(BASE, growthJourneyAdminLimiter)');
    expect(read).toContain('router.use(prefix, growthJourneyAdminLimiter)');
  });
});

describe('the limiter RUNS on every route - the defect a scan cannot see', () => {
  // A route registered ABOVE its router's limiter layer is served before the limiter is
  // reached and carries no rate-limit header at all. That is how the five
  // /performance/* routes silently lost their limit.
  it.each(DECLARED.map((r) => [`${r.verb.toUpperCase()} ${r.pattern}`, r]))('the limiter runs on %s', async (_name, r) => {
    const { verb, pattern } = r as { verb: string; pattern: string };
    const { limit } = await hit(verb, concrete(pattern), freshCaller());
    // Absent means the route was served before the limiter layer was reached.
    expect(limit).toBe('120');
  });
});

describe('the limiter keys on the CALLER, never on one shared bucket', () => {
  // Two different admins, each on their FIRST request to the route. Per-caller keying
  // gives both a full budget; one shared `edge:<PoP>` bucket decrements across them,
  // which is what twelve routes did while a positional scan said they were fixed.
  it.each(DECLARED.map((r) => [`${r.verb.toUpperCase()} ${r.pattern}`, r]))('two admins each get a full budget on %s', async (_name, r) => {
    const { verb, pattern } = r as { verb: string; pattern: string };
    const route = concrete(pattern);
    const a = await hit(verb, route, freshCaller());
    const b = await hit(verb, route, freshCaller());
    expect([a.remaining, b.remaining]).toEqual(['119', '119']);
  });
});

describe('and the shared instance still counts one request once', () => {
  it('a route whose prefix two routers both cover is billed a single time', async () => {
    // The re-entry mark's purpose. `/decisions/snapshots` is the read router's, and the
    // journey router's limiter also covers the prefix; the caller must be charged once.
    const route = `${J}/decisions/snapshots`;
    const caller = freshCaller();
    const first = await hit('get', route, caller);
    const second = await hit('get', route, caller);
    expect(first.remaining).toBe('119');
    expect(second.remaining).toBe('118');
  });
});
