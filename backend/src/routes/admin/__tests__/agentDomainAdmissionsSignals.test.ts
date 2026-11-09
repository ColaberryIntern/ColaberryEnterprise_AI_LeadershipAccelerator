/**
 * The admissions domain's anonymised visitor signals, for its own builder.
 *
 * ## The report
 *
 * Kalkidan Bezabeh, 9 Nov 2026, starting
 * `admissions.CAP.page_event_admissions_enrichment` — "20 sampled visitor
 * summaries match the underlying page events with zero fabricated page titles".
 * The interest tags live in `admissions_memory.interests` and no admin route
 * returned that column for any role; the visitor routes are `requireAdmin`,
 * map to the `campaigns` section, and return whole model rows including IP
 * address, user agent and a `lead` include carrying a real name.
 *
 * ## What is actually under test
 *
 * Two things, and the second is the one that would be easy to ship broken:
 *
 * 1. OWNERSHIP. The route is gated on `dashboard`, which every mgmt role except
 *    `support` holds, so the section is not what protects it. Every test below
 *    uses a SCOPED, NON-ADMIN token — an admin token would pass whether or not
 *    the scoping works at all.
 * 2. NON-DISCLOSURE. The whole reason this route exists instead of a wider
 *    grant is that it must not leak the fields the admin surface leaks. So the
 *    response is asserted against the raw rows it was built from: every
 *    excluded field must be absent, and the visitor id must not appear in any
 *    form. A test that only checked the fields it DOES return would pass while
 *    the route emitted an IP address beside them.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const KALKIDAN = 'kalkidankin@gmail.com';
const SOMEONE_ELSE = 'mihretnetsereab@gmail.com';

const VISITOR_A = '11111111-1111-4111-8111-111111111111';
const VISITOR_B = '22222222-2222-4222-8222-222222222222';

const identityRows: Array<{ id: string }> = [];
let domainRows: Array<Record<string, unknown>> = [];

const mockQuery = jest.fn(async (sql: string, opts?: { bind?: unknown[] }) => {
  if (/FROM\s+org_members/i.test(sql)) return identityRows;
  if (/FROM\s+community_members/i.test(sql)) {
    const email = String((opts?.bind ?? [])[0] ?? '');
    return email.toLowerCase() === KALKIDAN ? [{ display_name: 'Kalkidan Bezabeh' }] : [];
  }
  if (/FROM\s+agent_domain_projects/i.test(sql)) {
    const bind = (opts?.bind ?? [])[0];
    if (Array.isArray(bind)) {
      return domainRows.filter((r) => (bind as string[]).includes(String(r.manager_identity_id)));
    }
    if (typeof bind === 'string') {
      return domainRows.filter((r) => String(r.intended_builder ?? '') === bind);
    }
    return domainRows;
  }
  return [];
});

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...(a as [string, { bind?: unknown[] }])) },
}));

/**
 * The model rows carry every sensitive column the real tables carry, deliberately.
 * If the reader ever spreads a row instead of naming its fields, these values are
 * what leak, and the non-disclosure test below is what catches it.
 */
const memoryRows: Array<Record<string, unknown>> = [];
const pageEventRows: Array<Record<string, unknown>> = [];

const findAllMemory = jest.fn(async (opts: Record<string, unknown>) => {
  const limit = typeof opts?.limit === 'number' ? opts.limit : memoryRows.length;
  return memoryRows.slice(0, limit);
});
const findAllEvents = jest.fn(async (_opts: Record<string, unknown>) => pageEventRows);

jest.mock('../../../models', () => ({
  AdmissionsMemory: {
    findAll: (o: Record<string, unknown>) => findAllMemory(o),
    count: async () => memoryRows.length,
  },
  PageEvent: { findAll: (o: Record<string, unknown>) => findAllEvents(o) },
}));

import agentDomainRoutes from '../agentDomainRoutes';
import { env } from '../../../config/env';

function scopedToken(email: string, mgmtRole = 'lead_intake'): string {
  return jwt.sign({ id: 't', email, role: 'staff', mgmt_role: mgmtRole },
    env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(agentDomainRoutes);
  return a;
}

const URL = '/api/admin/agent-domains-mine/admissions/admissions-signals';

beforeEach(() => {
  identityRows.length = 0;
  memoryRows.length = 0;
  pageEventRows.length = 0;
  findAllMemory.mockClear();
  findAllEvents.mockClear();

  // Kalkidan manages nothing and is the recorded intended BUILDER of admissions.
  domainRows = [{
    domain_key: 'admissions',
    manager_identity_id: 'someone-else',
    intended_builder: 'Kalkidan Bezabeh',
  }];

  memoryRows.push({
    visitor_id: VISITOR_A,
    interests: ['data-engineering', 'cohort-dates', 42, null],
    visitor_type: 'high_intent',
    // everything below MUST NOT reach the response
    lead_id: 9001,
    questions_asked: ['is there a payment plan'],
    conversation_summaries: [{ text: 'asked about financing' }],
    personality_notes: 'anxious about cost',
  });
  memoryRows.push({
    visitor_id: VISITOR_B,
    interests: [],
    visitor_type: 'new',
    lead_id: null,
  });

  pageEventRows.push({
    visitor_id: VISITOR_A,
    event_type: 'page_view',
    page_path: '/programs/ai-leadership',
    page_title: 'AI Leadership Accelerator',
    timestamp: new Date('2026-11-08T10:00:00Z'),
    page_url: 'https://colaberry.com/programs?email=someone@example.com',
    event_data: { referrer: 'x' },
    lead_id: 9001,
  });
  pageEventRows.push({
    visitor_id: VISITOR_A,
    event_type: 'scroll',
    page_path: '/pricing',
    page_title: null, // a real row with no recorded title
    timestamp: new Date('2026-11-08T10:02:00Z'),
    page_url: 'https://colaberry.com/pricing',
  });
});

describe('GET .../agent-domains-mine/admissions/admissions-signals', () => {
  it('answers 200 for the builder who owns admissions', async () => {
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    expect(res.status).toBe(200);
    expect(res.body.domain_key).toBe('admissions');
    expect(res.body.returned).toBe(2);
    expect(res.body.visitors).toHaveLength(2);
  });

  it('returns the interest tags, which no other route exposed', async () => {
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    // non-string entries are dropped rather than coerced
    expect(res.body.visitors[0].interests).toEqual(['data-engineering', 'cohort-dates']);
    expect(res.body.visitors[1].interests).toEqual([]);
  });

  it('attaches each visitor\'s own page events, and never another visitor\'s', async () => {
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    const [a, b] = res.body.visitors;
    expect(a.page_events).toHaveLength(2);
    expect(a.page_events[0]).toEqual({
      event_type: 'page_view',
      page_path: '/programs/ai-leadership',
      page_title: 'AI Leadership Accelerator',
      timestamp: '2026-11-08T10:00:00.000Z',
    });
    expect(b.page_events).toHaveLength(0);
  });

  it('scopes the event query in SQL, rather than reading the table and filtering', async () => {
    // Every assertion above passes just as well with an unscoped query, because
    // the grouping happens in Node afterwards. What it would not survive is
    // production: page_events is the largest table in this schema.
    await request(app()).get(URL).set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    const opts = findAllEvents.mock.calls[0][0] as Record<string, unknown>;
    const where = opts.where as Record<string, unknown>;
    expect(Object.keys(where)).toEqual(['visitor_id']);
  });

  it('reports a missing page title as null, never as an empty string', async () => {
    // The capability is measured on "zero fabricated page titles". '' would be
    // a fabricated title that reads as a real one.
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    expect(res.body.visitors[0].page_events[1].page_title).toBeNull();
  });

  it('leaks none of the fields the admin visitor surface returns', async () => {
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    const body = JSON.stringify(res.body.visitors);
    // the raw visitor id must not appear in ANY form
    expect(body).not.toContain(VISITOR_A);
    expect(body).not.toContain(VISITOR_B);
    for (const leak of [
      'lead_id', '9001', 'page_url', 'event_data', 'questions_asked',
      'payment plan', 'conversation_summaries', 'personality_notes',
      'anxious about cost', 'someone@example.com',
    ]) {
      expect(body).not.toContain(leak);
    }
  });

  it('gives a stable, non-reversible anon id that groups a visitor\'s rows', async () => {
    const first = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    const second = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    const a1 = first.body.visitors[0].anon_id;
    expect(a1).toMatch(/^[0-9a-f]{16}$/);
    expect(second.body.visitors[0].anon_id).toBe(a1); // stable
    expect(a1).not.toBe(first.body.visitors[1].anon_id); // distinct per visitor
  });

  it('honours limit and events_per_visitor', async () => {
    const res = await request(app()).get(`${URL}?limit=1&events_per_visitor=1`)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    expect(res.body.visitors).toHaveLength(1);
    expect(res.body.visitors[0].page_events).toHaveLength(1);
    // the cap must not rewrite the true count
    expect(res.body.visitors[0].page_event_count).toBe(2);
    expect(res.body.matching).toBe(2);
  });

  it('refuses a builder who does not own admissions', async () => {
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(SOMEONE_ELSE)}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('domain_not_yours');
    // and it did not touch the data on the way to refusing
    expect(findAllMemory).not.toHaveBeenCalled();
  });

  it('is 400, not 403 or 500, for a domain that is not admissions', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-mine/curriculum/admissions-signals')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    expect(res.status).toBe(400);
  });

  it('is 400 for a malformed limit', async () => {
    const res = await request(app()).get(`${URL}?limit=0`)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    expect(res.status).toBe(400);
  });

  it('is 401 with no token', async () => {
    const res = await request(app()).get(URL);
    expect(res.status).toBe(401);
  });

  it('is 403 for support, the one role without dashboard, with no ownership code', async () => {
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN, 'support')}`);
    expect(res.status).toBe(403);
    // a section refusal must never read as an ownership refusal
    expect(res.body.code).toBeUndefined();
  });

  it('returns an empty page rather than failing when admissions has no memory rows', async () => {
    memoryRows.length = 0;
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    expect(res.status).toBe(200);
    expect(res.body.visitors).toEqual([]);
    expect(res.body.returned).toBe(0);
  });
});
