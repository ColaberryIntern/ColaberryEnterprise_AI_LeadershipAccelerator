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
/** Every SQL string the reader used to fetch events, for the cap assertions. */
const sqlSeenForEvents: string[] = [];
/** The bind array for each of those, so the cap can be checked as a parameter. */
const eventBinds: unknown[][] = [];
/** Every SQL string the reader used to fetch TRUE totals, which is a separate query. */
const sqlSeenForTotals: string[] = [];

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
  /**
   * The TRUE per-visitor total. Its own query since the LATERAL rewrite, and it
   * is matched FIRST because both event queries read `FROM page_events` and the
   * capped branch below would otherwise swallow it.
   *
   * It deliberately counts the WHOLE fixture per visitor, never the capped
   * slice. That is what makes the truncation test below able to fail: if the
   * reader ever derives `page_event_count` from the rows it returned, it gets
   * the cap, and the expected total will not match.
   */
  if (/COUNT\(\*\)/i.test(sql) && /FROM\s+page_events/i.test(sql)) {
    const [ids] = (opts?.bind ?? []) as [string[]];
    sqlSeenForTotals.push(sql);
    const mine = pageEventRows.filter((r) => ids.includes(String(r.visitor_id)));
    // GROUP BY: a visitor with no events is simply absent, exactly as Postgres
    // returns it, so the caller's default-to-0 path is what the test exercises.
    return [...new Set(mine.map((r) => String(r.visitor_id)))].map((id) => ({
      visitor_id: id,
      total: mine.filter((r) => String(r.visitor_id) === id).length,
    }));
  }
  /**
   * The capped event read. This emulates what Postgres does with the LATERAL
   * rather than returning the fixture, because the cap IS the SQL: a correlated
   * `ORDER BY timestamp DESC LIMIT cap` per visitor. A mock that ignored it
   * would let a reader that dropped the cap pass.
   *
   * CROSS JOIN LATERAL, so a visitor with no events contributes no rows at all
   * rather than one null row. Emulated here, because that is the behaviour the
   * caller's grouping depends on.
   */
  if (/FROM\s+page_events/i.test(sql)) {
    const [ids, cap] = (opts?.bind ?? []) as [string[], number];
    sqlSeenForEvents.push(sql);
    eventBinds.push([ids, cap]);
    const mine = pageEventRows.filter((r) => ids.includes(String(r.visitor_id)));
    const out: Array<Record<string, unknown>> = [];
    for (const id of new Set(mine.map((r) => String(r.visitor_id)))) {
      const forVisitor = mine
        .filter((r) => String(r.visitor_id) === id)
        .sort((x, y) => Number(new Date(String(y.timestamp))) - Number(new Date(String(x.timestamp))));
      // No `total` on these rows any more: it cannot ride along on a query that
      // stops at `cap`. If the reader still reads one here it gets undefined.
      for (const r of forVisitor.slice(0, cap)) out.push({ ...r });
    }
    return out;
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
  sqlSeenForEvents.length = 0;
  sqlSeenForTotals.length = 0;
  eventBinds.length = 0;
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

  it('attaches each visitor\'s own page events, newest first, and never another visitor\'s', async () => {
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    const [a, b] = res.body.visitors;
    expect(a.page_events).toHaveLength(2);
    // Newest first, which is what `ORDER BY timestamp DESC` has always done and
    // what the `eventsPerVisitor` cap means: keep the most recent N. The older
    // version of this test asserted the opposite order and passed only because
    // the mock returned the fixture in insertion order and ignored the ORDER BY.
    expect(a.page_events[0].timestamp).toBe('2026-11-08T10:02:00.000Z');
    expect(a.page_events[1]).toEqual({
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
    expect(sqlSeenForEvents).toHaveLength(1);
    // Scoped through the BOUND visitor list, which since the LATERAL rewrite is
    // `unnest($1::uuid[])` driving the join rather than `= ANY` in a WHERE. The
    // spelling changed; the property asserted has not. Written against both so a
    // future shape change fails loudly here instead of silently widening the read.
    expect(sqlSeenForEvents[0]).toMatch(/unnest\(\$1::uuid\[\]\)|visitor_id\s*=\s*ANY/i);
    // the per-visitor correlation is what keeps it scoped inside the LATERAL
    expect(sqlSeenForEvents[0]).toMatch(/p\.visitor_id\s*=\s*v\.visitor_id/i);
    // and the totals query is scoped the same way, by the same bound list
    expect(sqlSeenForTotals[0]).toMatch(/WHERE\s+p\.visitor_id\s*=\s*ANY/i);
  });

  /**
   * The regression guard. This is the defect Kalkidan Bezabeh found on 11 Nov
   * 2026: the cap bounded what was KEPT, never what was FETCHED, so a call at
   * limit=100 pulled 683,444 rows out of production to keep 20,000.
   *
   * The previous version of the test above asserted only that the query was
   * SCOPED, and scoping was never the problem. A scoped query that returns
   * every event a hundred visitors ever generated is still the whole table.
   * So this asserts the CAP reaches the database, in both the places it has to:
   * the per-visitor window in the SQL, and the cap value in the bind.
   */
  it('caps events per visitor in the database, not in memory afterwards', async () => {
    await request(app()).get(`${URL}?limit=2&events_per_visitor=1`)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);

    const sql = sqlSeenForEvents[0];
    // PER VISITOR, not a flat LIMIT. A flat limit would let one heavy visitor
    // consume the whole budget and leave later visitors with zero events, which
    // is why the LIMIT has to sit inside a correlated LATERAL rather than on the
    // outer query.
    expect(sql).toMatch(/CROSS\s+JOIN\s+LATERAL/i);
    expect(sql).toMatch(/WHERE\s+p\.visitor_id\s*=\s*v\.visitor_id/i);
    // The ordering is load-bearing, not cosmetic: it is what lets the index be
    // walked and stopped at `cap`. Without it the plan sorts every matching row
    // first, which is the 2,059ms-versus-18ms difference this rewrite exists for.
    expect(sql).toMatch(/ORDER BY\s+p\."timestamp"\s+DESC\s*\n?\s*LIMIT/i);
    // and the shape it replaced must not come back
    expect(sql).not.toMatch(/ROW_NUMBER\(\)/i);

    const bind = eventBinds[0] as [string[], number];
    expect(bind[1]).toBe(1); // the cap is a bound parameter, not interpolated
    expect(bind[0]).toEqual([VISITOR_A, VISITOR_B]);

    // and the unbounded model fetch is gone entirely
    expect(findAllEvents).not.toHaveBeenCalled();
  });

  it('keeps page_event_count the visitor\'s TRUE total when the cap truncates', async () => {
    // Capping the rows must not quietly redefine this field as "the cap". That
    // would be a worse defect than the one being fixed: a wrong number that
    // reads as a right one.
    //
    // This is the assertion the LATERAL rewrite put most at risk. The total used
    // to ride along on every capped row via COUNT(*) OVER; it cannot ride along
    // on a query that stops at `cap`, by construction. So it moved to its own
    // query, and this test is what proves the move did not quietly turn the
    // field into the cap: with a cap of 1 and two events, it must still say 2.
    const res = await request(app()).get(`${URL}?limit=2&events_per_visitor=1`)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    const a = res.body.visitors[0];
    expect(a.page_events).toHaveLength(1);
    expect(a.page_event_count).toBe(2);
  });

  it('asks for the true total in a SEPARATE query, which is the only place it can come from', async () => {
    // The structural half of the test above. That one would also pass if a
    // future edit went back to deriving the total from the capped rows AND the
    // cap happened not to truncate in the fixture. This pins where the number
    // comes from: an aggregate over the unbounded set, scoped to these visitors.
    await request(app()).get(`${URL}?limit=2&events_per_visitor=1`)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);

    expect(sqlSeenForTotals).toHaveLength(1);
    const sql = sqlSeenForTotals[0];
    expect(sql).toMatch(/COUNT\(\*\)/i);
    expect(sql).toMatch(/GROUP BY\s+p\.visitor_id/i);
    // scoped, so it is an aggregate over these visitors and not the whole table
    expect(sql).toMatch(/WHERE\s+p\.visitor_id\s*=\s*ANY/i);
    // and it must NOT carry the cap: a capped count is not a total
    expect(sql).not.toMatch(/LIMIT/i);
  });

  it('reports a missing page title as null, never as an empty string', async () => {
    // The capability is measured on "zero fabricated page titles". '' would be
    // a fabricated title that reads as a real one.
    const res = await request(app()).get(URL)
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`);
    // index 0: the newest event is the untitled one, per newest-first ordering
    expect(res.body.visitors[0].page_events[0].page_title).toBeNull();
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
