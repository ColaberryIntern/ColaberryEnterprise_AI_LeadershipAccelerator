import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * The privacy property, swept over EVERY read route (Phase 6, T612).
 *
 * Each route family already has an access suite that drives it with adversarial
 * fixtures and refuses `@` in the response. What none of them can prove is
 * COMPLETENESS: that no route is missing such a cell. A route added next month with a
 * `metadata` column passed straight through would leave every existing suite green.
 *
 * So the route list here is DERIVED FROM THE ROUTER SOURCE rather than typed out. Add a
 * `router.get` to any of the three files and it joins this sweep on the next run,
 * without anyone remembering to add it. The first draft of this suite tried to match
 * routes to the suites that cover them by searching the test tree for each route's path,
 * and it reported fourteen routes uncovered - every one a false negative, because suites
 * build concrete paths (`/people/4711/chain`) and the router declares patterns
 * (`/people/:leadId/chain`). Driving the routes needs no such mapping, which is the
 * whole reason this is a behaviour sweep and not a scan.
 *
 * ─── THE ADVERSARIAL WORLD ──────────────────────────────────────────────────
 *
 * Every model read answers rows whose every string-ish column is an address, including
 * the free-text ones the phase's rules say must never be echoed - `metadata`,
 * `evidence`, `reason`, `detail`, `notes`. Nothing here asserts a particular body: the
 * property is that whatever comes back, at whatever status, carries no `@`.
 *
 * ─── WHAT A PASS HERE DOES AND DOES NOT MEAN ────────────────────────────────
 *
 * A 500 with an empty body also has no `@`, so this sweep would pass vacuously if the
 * whole surface errored. The cell at the end refuses that: a floor of routes must have
 * answered 200, and the floor is asserted against the DERIVED route count, so it cannot
 * quietly drift down as routes are added.
 */

const J = '/api/admin/growth-journey';
const ADDR = 'someone@example.com';

const growthJourney = {
  growthJourneyEnabled: true, journeySignalIngest: true, journeyClassification: true,
  journeyDecisions: true, journeyHandoffs: true, journeyExecution: true,
};
jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney, explorerGrowth: {} },
}));

/** Every column an address, so anything echoed shows up. */
const poison: Record<string, unknown> = {
  id: '30000000-0000-4000-8000-000000000001',
  lead_id: 4711,
  tenant_id: 't-cola',
  brand_id: 'b-ent',
  program_id: 'p-1',
  subject_ref: 'lead:4711',
  // The free-text columns the phase's rules say are never echoed.
  metadata: { note: `write to ${ADDR}` },
  evidence: [`override_reason: ${ADDR}`],
  contact_evidence: { email: ADDR },
  candidates: [{ action_type: 'SEND_EMAIL', to: ADDR }],
  reason: `budget confirmed, follow up with ${ADDR}`,
  detail: `see ${ADDR}`,
  notes: ADDR,
  disposition_reason: `ask ${ADDR}`,
  status_reason: `blocked: ${ADDR}`,
  talking_points: [`email ${ADDR}`],
  email: ADDR,
  created_at: new Date('2026-09-20T10:00:00Z'),
  updated_at: new Date('2026-09-20T10:00:00Z'),
};

/**
 * THE MOCK RESPECTS `attributes`, AND THAT IS THE POINT.
 *
 * The first version answered every poison column whatever the query asked for, and nine
 * routes "leaked". That was the mock lying: the phase's actual defence against echoing a
 * free-text column is to NOT SELECT IT, so a stub that ignores `attributes` defeats the
 * very mechanism under test and manufactures failures. A real database returns the
 * projection it was given, so this does too - and a route that genuinely selects
 * `metadata` and passes it on still fails, which is the signal worth having.
 */
function project(options?: { attributes?: unknown; raw?: boolean }): Record<string, unknown> {
  const attrs = options?.attributes;
  if (!Array.isArray(attrs) || attrs.length === 0) return poison;
  const out: Record<string, unknown> = {};
  for (const a of attrs) {
    // `[fn, alias]` pairs (COUNT(*) etc.) alias to a number, as an aggregate would.
    if (Array.isArray(a)) {
      const alias = String(a[1] ?? 'value');
      out[alias] = 1;
      continue;
    }
    const key = String(a);
    if (key in poison) out[key] = poison[key];
  }
  return out;
}

const instance = (options?: Parameters<typeof project>[0]) => {
  const row = project(options);
  return { ...row, get: (k?: string) => (k === undefined ? row : row[k]), toJSON: () => row };
};

/**
 * One stand-in for every model. `findAll` answers a row, `count` answers 1, and a
 * `findAndCountAll` answers both - so a list route has something to render rather than
 * an empty page, which is what makes the sweep meaningful.
 */
/**
 * Every row read, WITH THE MODEL NAME. `mock`-prefixed for the hoisted factory.
 *
 * The first version handed one shared stand-in to every model, which made the bounded-read
 * findings useless: "a row read with no limit" on a route that reads six tables does not
 * say which one, so it can be neither fixed nor allowlisted. The Proxy now mints a
 * named model per property.
 */
const mockReadLog: { model: string; method: string; limit: unknown }[] = [];

jest.mock('../../../models', () => {
  const cache = new Map<string, unknown>();
  const build = (name: string) => ({
    findAll: async (o?: { attributes?: unknown; limit?: unknown }) => {
      mockReadLog.push({ model: name, method: 'findAll', limit: o?.limit });
      return [instance(o)];
    },
    findAndCountAll: async (o?: { attributes?: unknown; limit?: unknown }) => {
      mockReadLog.push({ model: name, method: 'findAndCountAll', limit: o?.limit });
      return { rows: [instance(o)], count: 1 };
    },
    findOne: async (o?: { attributes?: unknown }) => instance(o),
    findByPk: async (_id?: unknown, o?: { attributes?: unknown }) => instance(o),
    // Counts return a number, not rows: they are bounded by definition.
    count: async () => 1,
    max: async () => new Date('2026-09-20T10:00:00Z'),
    sum: async () => 1,
    create: async () => instance(),
    update: async () => [1],
  });
  // A Proxy so a model this suite has never heard of still answers, and a route added
  // against a new table does not fail for the wrong reason.
  return new Proxy({}, {
    get: (_t, prop) => {
      const name = String(prop);
      if (!cache.has(name)) cache.set(name, build(name));
      return cache.get(name);
    },
  });
});

/**
 * A REAL Sequelize, never connected, with `query` stubbed.
 *
 * A plain object does not work here: several model files are imported DIRECTLY rather
 * than through the barrel (`settingsService` -> `models/SystemSetting` is the one that
 * took four suites down in T611), and `Model.init` needs a genuine Sequelize to attach
 * to - a stub fails with "Cannot read properties of undefined (reading 'define')"
 * before any test runs. Constructing one opens no socket; only a query would, and that
 * is replaced below.
 */
jest.mock('../../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://u:p@127.0.0.1:5432/x', { logging: false });
  sequelize.query = jest.fn(async () => [[poison], {}]);
  return { sequelize };
});

jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/ledgerService', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
  readEvents: jest.fn().mockResolvedValue({ rows: [poison], total: 1 }),
}));

/** Every membership the caller could want, so scope never turns a route into a 403. */
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  contextFromAdminRequest: jest.fn(async () => ({
    tenantId: 't-cola', brandId: null, authorizedTenantIds: ['t-cola'],
    authorizedBrandIds: null, isPlatformSuperAdmin: true, identityId: 'staff-1',
  })),
}));
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../modules/tenancy/leadContextService', () => ({
  getAuthorizedLeadContexts: jest.fn(async () => [poison]),
  getLeadContexts: jest.fn(async () => [poison]),
}));

import statusRoutes from '../../../routes/admin/growthJourneyStatusRoutes';
import readRoutes from '../../../routes/admin/growthJourneyReadRoutes';
import journeyRoutes from '../../../routes/admin/growthJourneyRoutes';

const ROUTERS = path.join(__dirname, '..', '..', '..', 'routes', 'admin');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The GET routes each router declares, with the template prefixes resolved. */
function getRoutesOf(file: string, subs: Record<string, string>): string[] {
  const src = stripComments(fs.readFileSync(path.join(ROUTERS, file), 'utf8'));
  return Array.from(src.matchAll(/router\.get\(\s*[`']([^`']+)[`']/g)).map(([, p]) =>
    Object.entries(subs).reduce((acc, [k, v]) => acc.replace(`\${${k}}`, v), p),
  );
}

const DECLARED = [
  ...getRoutesOf('growthJourneyStatusRoutes.ts', { BASE: `${J}/status` }),
  ...getRoutesOf('growthJourneyReadRoutes.ts', { BASE: `${J}/performance`, JOURNEY: J }),
  ...getRoutesOf('growthJourneyRoutes.ts', { BASE: J }),
];

/** A pattern becomes a concrete path. Ids are UUIDs, lead ids are integers. */
const concrete = (pattern: string): string =>
  pattern
    .replace(':leadId', '4711')
    .replace(/:[A-Za-z]+/g, '30000000-0000-4000-8000-000000000001');

const app = () => {
  const a = express();
  a.use(express.json());
  a.use(statusRoutes);
  a.use(readRoutes);
  a.use(journeyRoutes);
  return a;
};

const token = () => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role: 'super_admin' }, 'test-secret');

describe('the read surface never echoes an address', () => {
  it('the route list is derived from the routers and is not empty', () => {
    // The vacuity control for the DERIVATION: a broken regex yields zero routes, and a
    // sweep over zero routes passes.
    expect(DECLARED.length).toBeGreaterThanOrEqual(20);
    expect(DECLARED.every((p) => p.startsWith(J))).toBe(true);
  });

  const results: { route: string; status: number; text: string }[] = [];

  /**
   * ROUTES THAT ECHO A FREE-TEXT COLUMN TODAY. This is a finding, not a waiver.
   *
   * Each of these answers whole model rows - `findAndCountAll({ where, limit, offset })`
   * with no `attributes`, then `res.json({ rows })` - and every column named beside it
   * is a REAL column on the table, not an invention of this fixture. So if a production
   * row carries an address in one of them, these routes serve it. The repo's own suites
   * model exactly that: their fixtures seed `contact_evidence: { email: ... }` and
   * `evidence: { contact: ... }`, because that is what those columns are for.
   *
   * They are listed rather than fixed because scrubbing them changes an admin API's
   * payload shape, which is a contract change with its own consumers to check - not
   * something a testing sweep should do quietly. It is Ali's call, and it is in the
   * packet.
   *
   * THE ALLOWLIST CANNOT ROT. Each entry is asserted to STILL LEAK below, so the day a
   * route is scrubbed its entry fails and has to be deleted. An allowlist that only ever
   * grants permission would outlive the problem it describes and hide the next one.
   */
  const KNOWN_UNSCRUBBED: Record<string, string> = {
    [`${J}/participations`]: 'echoes growth_journey_enrollments.metadata (JSONB)',
    [`${J}/participations/:id`]: 'echoes growth_journey_enrollments.metadata (JSONB)',
    [`${J}/classifications`]: 'echoes growth_journey_classifications.evidence (JSONB)',
    [`${J}/classifications/:id/why`]: 'passes evidence through - the existing "@" cell for this route passes only because ITS fixture has no address in evidence',
    [`${J}/decisions`]: 'echoes candidates, contact_evidence and reason',
    [`${J}/decisions/:id/why`]: 'echoes reason and contact_evidence',
    [`${J}/handoffs`]: 'echoes reason, evidence, talking_points, disposition_reason',
    [`${J}/handoffs/:id`]: 'echoes reason, evidence, talking_points, disposition_reason',
    [`${J}/execution/controls`]: 'echoes the control row whole, reason included',
  };

  it.each(DECLARED)('%s carries no `@`', async (pattern) => {
    const res = await request(app()).get(concrete(pattern)).set('Authorization', `Bearer ${token()}`);
    const text = res.text ?? '';
    results.push({ route: pattern, status: res.status, text });
    if (pattern in KNOWN_UNSCRUBBED) {
      // Inverted on purpose: this entry retires itself the moment the route is fixed.
      expect(text).toContain('@');
      return;
    }
    // Whatever the status. A 403 body, a 500 body and a 200 page are all responses.
    expect(text).not.toContain('@');
  });

  it('the allowlist is exactly the routes that leak - no more, and no fewer', () => {
    const leaking = results.filter((r) => r.text.includes('@')).map((r) => r.route).sort();
    expect(leaking).toEqual(Object.keys(KNOWN_UNSCRUBBED).sort());
  });

  it('and every route NOT on the allowlist is genuinely clean, not merely untested', () => {
    const clean = results.filter((r) => !(r.route in KNOWN_UNSCRUBBED));
    expect(clean.length).toBeGreaterThanOrEqual(DECLARED.length - Object.keys(KNOWN_UNSCRUBBED).length);
    expect(clean.every((r) => !r.text.includes('@'))).toBe(true);
  });

  it('and the sweep was not vacuous: the surface really answered', () => {
    // Without this, a surface that 500'd everywhere would read as perfect privacy.
    expect(results).toHaveLength(DECLARED.length);
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(Math.ceil(DECLARED.length / 2));
  });

  it('every read is BOUNDED: a list route makes few queries, and each one carries a limit', async () => {
    // Lives in this file rather than its own because it needs the same adversarial app,
    // and a second copy of that harness is how the two sweeps would drift apart.
    //
    // Two properties per collection route: a bounded NUMBER of reads (an N+1 over a page
    // of rows is how a list route takes the database down), and a `limit` on each row
    // read (an unbounded findAll is how it takes the process down). `count` is exempt -
    // it returns a number, not rows.
    const collections = DECLARED.filter((p) => !p.includes(':'));
    expect(collections.length).toBeGreaterThanOrEqual(15);

    /**
     * Reads that are bounded by their DOMAIN rather than by a `limit`, with the reason.
     *
     * A blanket "every row read needs a numeric limit" is the wrong rule: a table whose
     * cardinality is fixed by configuration - the brand registry, the agent registry,
     * the queue policies - is already bounded, and a limit on it would be decoration.
     * The rule that matters is that reads over tables which GROW PER LEAD or PER EVENT
     * are limited. So the growing tables are required to carry a limit, and the fixed
     * ones are listed here by name so the exemption is a decision someone can read.
     */
    const BOUNDED_BY_DOMAIN = new Set([
      // Configuration: one row per brand, path, programme or agent, written by a human.
      'Brand', 'Tenant', 'AiAgent', 'JourneyProgram', 'JourneyPath',
      'GrowthJourneyPolicy', 'GrowthJourneyQueuePolicy', 'GrowthJourneyOfferPolicy',
      'GrowthJourneyContentRule', 'GrowthJourneyExperiment', 'SystemSetting',
      // Controls are opened and cleared by an admin; there is no per-lead growth.
      'GrowthJourneyExecutionControl', 'GrowthJourneyOwnership',
    ]);

    /**
     * The read BUDGET, and why two routes have a different one.
     *
     * Three is right for a collection route: it renders one table, so more than a page
     * read plus a count plus one lookup means an N+1 over the page. `/status/health` and
     * `/status/readiness` are not collections - they are diagnostics whose entire job is
     * to touch one table per subsystem, each read individually capped (the MAX_HEALTH_*
     * ceilings). Holding them to three would force them to report less, which is the
     * opposite of what they exist for. Eight still catches an N+1.
     */
    const SUMMARY_BUDGET: Record<string, number> = {
      [`${J}/status/health`]: 8,
      [`${J}/status/readiness`]: 8,
      [`${J}/status/registry`]: 8,
    };

    const offenders: string[] = [];
    for (const pattern of collections) {
      mockReadLog.length = 0;
      const res = await request(app()).get(concrete(pattern)).set('Authorization', `Bearer ${token()}`);
      if (res.status !== 200) continue;
      const reads = [...mockReadLog];
      const budget = SUMMARY_BUDGET[pattern] ?? 3;
      if (reads.length > budget) {
        offenders.push(`${pattern}: ${reads.length} row reads > ${budget} (${reads.map((r) => r.model).join(', ')})`);
      }
      for (const r of reads) {
        if (typeof r.limit !== 'number' && !BOUNDED_BY_DOMAIN.has(r.model)) {
          offenders.push(`${pattern}: ${r.model}.${r.method} with no limit`);
        }
      }
    }
    // Named, not counted: a bare "3 offenders" would send the next reader hunting.
    expect(offenders).toEqual([]);
  });

  it('the poison fixture really does contain addresses - the needle exists', () => {
    // The positive control for the FIXTURE: if `poison` stopped carrying an address,
    // every cell above would pass while testing nothing.
    expect(JSON.stringify(poison)).toContain('@');
    expect(JSON.stringify(poison).match(/@/g)!.length).toBeGreaterThanOrEqual(8);
  });
});
