const getOutreachMock = jest.fn();
jest.mock('../../services/explorerGrowth/explorerCampusService', () => ({
  getOutreach: (...a: unknown[]) => getOutreachMock(...a),
}));

import * as fs from 'fs';
import * as path from 'path';
import {
  getOutreachFeed,
  snapshotOf,
  toPublicRow,
  V1_OUTREACH_FIELDS,
} from '../v1OutreachController';

/**
 * The Explorer call queue, as Cora sees it.
 *
 * The suite is built around the one claim that matters: NO PERSONAL DATA CROSSES THIS
 * BOUNDARY. A test that only checked `email` is absent would pass against a payload that had
 * started exporting a phone number, so the emitted key set is pinned as a whole, and a control
 * proves the SOURCE row really does carry the fields being withheld.
 */

/** Shaped like a real row: the full admin payload, email and name included. */
const sourceRow = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 'd6a4b017-6716-4673-96b5-ab3074b70191',
  email: 'learner@real.example',
  name: 'A Real Person',
  primary_state: 'ENGAGED_LEARNER',
  overlays: ['EVENT_READY'],
  e_score: 46, i_score: 0, cards: 22, rsvps: 0, calls: 0,
  next_call: null, tour_furthest: null, tour_total: null, tour_finished: false,
  last_seen: '2026-11-05T11:33:20.186Z', last_contacted_at: null,
  score: 54, reasons: ['Completed 22 assignments', 'Active today'],
  lead_id: 23929, ghl_url: 'https://app.gohighlevel.com/v2/location/LOC/contacts/detail/C1',
  ...over,
});

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return res as typeof res & { status: (c: number) => typeof res; json: (p: unknown) => typeof res };
}

const run = async (query: Record<string, unknown> = {}) => {
  const res = mockRes();
  const next = jest.fn();
  await getOutreachFeed({ query } as never, res as never, next as never);
  return { res, next };
};

beforeEach(() => {
  getOutreachMock.mockReset();
  getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows: [sourceRow()], total: 1, offset: 0 });
});

describe('no personal data crosses the boundary', () => {
  it('CONTROL: the SOURCE row really does carry an email and a name', () => {
    // Without this, "email is absent from the output" would also pass if the fixture never
    // had one, and the test would be asserting nothing.
    const src = sourceRow();
    expect(src.email).toBe('learner@real.example');
    expect(src.name).toBe('A Real Person');
  });

  it('emits EXACTLY the allowlisted keys, no more', async () => {
    const { res } = await run();
    const rows = (res.body as { rows: Record<string, unknown>[] }).rows;
    // Pinned as a whole set. A new field added to the ranking shows up here as a failure
    // rather than as a silent export to an external system.
    expect(Object.keys(rows[0]).sort()).toEqual([...V1_OUTREACH_FIELDS].sort());
  });

  it('withholds email and name specifically', async () => {
    const { res } = await run();
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('learner@real.example');
    expect(serialized).not.toContain('A Real Person');
    expect(serialized).not.toContain('@');
  });

  it('an UNKNOWN field on the source row is not forwarded', async () => {
    // The allowlist's whole purpose: tomorrow's column does not export itself.
    getOutreachMock.mockResolvedValue({
      view: 'reach_out', tracked_since: '2026-10-26',
      rows: [sourceRow({ phone: '+1-214-555-0188', home_address: '1 Main St' })],
    });
    const { res } = await run();
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('555-0188');
    expect(serialized).not.toContain('Main St');
  });

  it('keeps the fields the consumer actually needs', async () => {
    const { res } = await run();
    const row = (res.body as { rows: Record<string, unknown>[] }).rows[0];
    expect(row.ghl_url).toContain('/contacts/detail/C1');
    expect(row.score).toBe(54);
    expect(row.primary_state).toBe('ENGAGED_LEARNER');
    expect(row.reasons).toEqual(['Completed 22 assignments', 'Active today']);
  });

  it('a missing field becomes null rather than disappearing', async () => {
    // An absent key and a null read differently to a consumer. Null says "we looked".
    const row = toPublicRow({ enrollment_id: 'x' });
    expect(Object.keys(row).sort()).toEqual([...V1_OUTREACH_FIELDS].sort());
    expect(row.ghl_url).toBeNull();
  });
});

describe('the query contract is the admin one, not a second copy', () => {
  it('defaults to reach_out, 25 and offset 0', async () => {
    await run();
    expect(getOutreachMock).toHaveBeenCalledWith('reach_out', 25, { offset: 0 });
  });

  it('passes a requested view and limit through', async () => {
    await run({ view: 'engaged', limit: '50' });
    expect(getOutreachMock).toHaveBeenCalledWith('engaged', 50, { offset: 0 });
  });

  it('400s an over-cap limit rather than silently clamping', async () => {
    const { res } = await run({ limit: '5000' });
    expect(res.statusCode).toBe(400);
    expect(getOutreachMock).not.toHaveBeenCalled();
  });

  it('400s an unknown parameter, because the shared schema is strict', async () => {
    // `offset` used to be this test's example of an unknown parameter. It is a REAL parameter
    // now, so the example had to move to one that is still genuinely unknown, or the test
    // would have gone on passing while asserting nothing about strictness.
    const { res } = await run({ cursor: 'abc' });
    expect(res.statusCode).toBe(400);
    expect(getOutreachMock).not.toHaveBeenCalled();
  });

  it('400s an unknown view', async () => {
    expect((await run({ view: 'everyone' })).res.statusCode).toBe(400);
  });
});

describe('paging', () => {
  it('passes a requested offset through', async () => {
    await run({ limit: '200', offset: '200' });
    expect(getOutreachMock).toHaveBeenCalledWith('reach_out', 200, { offset: 200 });
  });

  it('offset 0 is explicitly allowed, not read as absent', async () => {
    // numericParam is a string regex, so a literal "0" must survive validation rather than
    // being rejected as falsy somewhere along the way.
    const { res } = await run({ offset: '0' });
    expect(res.statusCode).toBe(200);
    expect(getOutreachMock).toHaveBeenCalledWith('reach_out', 25, { offset: 0 });
  });

  it('400s a negative offset', async () => {
    const { res } = await run({ offset: '-1' });
    expect(res.statusCode).toBe(400);
    expect(getOutreachMock).not.toHaveBeenCalled();
  });

  it('400s a non-numeric offset', async () => {
    expect((await run({ offset: 'abc' })).res.statusCode).toBe(400);
    expect(getOutreachMock).not.toHaveBeenCalled();
  });

  it('reports total and offset so a consumer can tell a full page from the whole queue', async () => {
    getOutreachMock.mockResolvedValue({
      view: 'reach_out', tracked_since: '2026-10-26', rows: [sourceRow()], total: 847, offset: 200,
    });
    const { res } = await run({ limit: '200', offset: '200' });
    expect(res.body).toMatchObject({ count: 1, total: 847, offset: 200 });
  });

  it('THE BUG THIS FIXES: a full page no longer looks like the whole queue', async () => {
    // Before total existed, count === limit was the only signal available, and it could not
    // distinguish "that is everyone" from "that is the first 200 of more". Cora read it as
    // the whole queue and therefore could not safely tag anyone out.
    const rows = Array.from({ length: 200 }, (_, i) => sourceRow({ enrollment_id: `id-${i}` }));
    getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows, total: 847, offset: 0 });
    const { res } = await run({ limit: '200' });
    const body = res.body as { count: number; total: number; offset: number };
    expect(body.count).toBe(200);
    expect(body.offset + body.count).toBeLessThan(body.total); // "there is more", stated rather than inferred
  });

  it('an offset past the end is an empty page, not an error', async () => {
    getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows: [], total: 847, offset: 9000 });
    const { res } = await run({ offset: '9000' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ count: 0, total: 847, offset: 9000, rows: [] });
  });
});

describe('the snapshot', () => {
  const idsOf = (n: number) => Array.from({ length: n }, (_, i) => sourceRow({ enrollment_id: `id-${i}` }));
  const bodyOf = async (rows: Record<string, unknown>[]) => {
    getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows, total: rows.length, offset: 0 });
    return (await run()).res.body as { snapshot: string };
  };

  it('is identical for the same rows in the same order', async () => {
    const a = await bodyOf(idsOf(5));
    const b = await bodyOf(idsOf(5));
    expect(a.snapshot).toBe(b.snapshot);
    expect(a.snapshot).toHaveLength(16);
  });

  it('differs when the ORDER changes, even with the same people', async () => {
    // A consumer works the list top down, so a reordered page is not the same page.
    const a = await bodyOf(idsOf(5));
    const b = await bodyOf(idsOf(5).reverse());
    expect(a.snapshot).not.toBe(b.snapshot);
  });

  it('differs when a single id changes', async () => {
    const a = await bodyOf(idsOf(5));
    const rows = idsOf(5);
    rows[2] = sourceRow({ enrollment_id: 'someone-else' });
    const b = await bodyOf(rows);
    expect(a.snapshot).not.toBe(b.snapshot);
  });

  it('cannot be fooled by concatenation', async () => {
    // Ids are newline delimited, so ["ab","c"] and ["a","bc"] must not hash alike.
    const a = await bodyOf([sourceRow({ enrollment_id: 'ab' }), sourceRow({ enrollment_id: 'c' })]);
    const b = await bodyOf([sourceRow({ enrollment_id: 'a' }), sourceRow({ enrollment_id: 'bc' })]);
    expect(a.snapshot).not.toBe(b.snapshot);
  });

  it('an empty page still carries a snapshot', async () => {
    const body = await bodyOf([]);
    expect(typeof body.snapshot).toBe('string');
    expect(body.snapshot).toHaveLength(16);
  });

  it('snapshotOf is pure: the same input twice gives the same answer', () => {
    const rows = [toPublicRow({ enrollment_id: 'a' }), toPublicRow({ enrollment_id: 'b' })];
    expect(snapshotOf(rows)).toBe(snapshotOf(rows));
  });
});

describe('the envelope', () => {
  it('carries the view, the tracked_since date and a count', async () => {
    const { res } = await run();
    expect(res.body).toMatchObject({ view: 'reach_out', tracked_since: '2026-10-26', count: 1 });
  });

  it('carries every documented envelope key, pinned as a set', async () => {
    // Pinned whole, for the same reason the row keys are: a field added to this envelope is a
    // decision, and a field quietly dropped would break a consumer reading it.
    const { res } = await run();
    expect(Object.keys(res.body as object).sort())
      .toEqual(['count', 'offset', 'rows', 'snapshot', 'total', 'tracked_since', 'view']);
  });

  it('an empty queue is a 200 with count 0, not a 404', async () => {
    // "Nobody to call today" is an answer. A 404 would read as "the feed is broken".
    getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows: [], total: 0, offset: 0 });
    const { res } = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ count: 0, total: 0, rows: [] });
  });

  it('an empty page of a NON-empty pool reads differently from an empty pool', async () => {
    // Both have count 0. Only total separates "nobody to call" from "you paged past the end".
    getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows: [], total: 847, offset: 9000 });
    const { res } = await run({ offset: '9000' });
    expect(res.body).toMatchObject({ count: 0, total: 847 });
  });

  it('hands a real failure to the error handler instead of answering 200', async () => {
    getOutreachMock.mockRejectedValue(new Error('database is on fire'));
    const { res, next } = await run();
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });
});

describe('the route is guarded, and reads only', () => {
  const ROUTES = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'v1Routes.ts'), 'utf8');

  it('is registered with the rate limiter and a guard scoped to cora ALONE', () => {
    expect(ROUTES).toContain(
      "router.get('/api/v1/explorer-growth/outreach', v1RateLimiter, requireServiceClient('cora'), getOutreachFeed);",
    );
  });

  it('does NOT accept the shared enterprise_crm credential, which opens the v1 writes', () => {
    // The point of scoping this route. If someone widens it to keep an old integration
    // working, that is a decision worth making on purpose, and this test makes them make it.
    const line = ROUTES.split('\n').find((l) => l.includes("router.get('/api/v1/explorer-growth/outreach'")) ?? '';
    expect(line).not.toContain('enterprise_crm');
    // Control: the credential name really does appear in this file, on the write routes, so
    // the assertion above is not passing because the string is absent everywhere.
    expect(ROUTES).toContain("requireServiceClient('enterprise_crm')");
  });

  it('CONTROL: the file really is being read, so the match above means something', () => {
    expect(ROUTES).toContain("router.post('/api/v1/leads'");
  });

  it('registers no mutating verb for this path', () => {
    for (const verb of ['post', 'put', 'patch', 'delete']) {
      expect(ROUTES).not.toContain(`router.${verb}('/api/v1/explorer-growth`);
    }
  });

  it('the controller names no mailer and writes nothing', () => {
    const SRC = fs.readFileSync(path.join(__dirname, '..', 'v1OutreachController.ts'), 'utf8');
    for (const forbidden of ['mandrill', 'nodemailer', 'emailService', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(SRC).not.toContain(forbidden);
    }
  });
});

describe('the joinable count, which is how we watch lead linkage', () => {
  /** The structured log line this handler emits, parsed back out of stdout. */
  const logLine = async (query: Record<string, unknown> = {}) => {
    const writes: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(((c: unknown) => { writes.push(String(c)); return true; }) as never);
    try {
      await run(query);
    } finally {
      spy.mockRestore();
    }
    const parsed = writes.map((w) => { try { return JSON.parse(w) as Record<string, unknown>; } catch { return null; } });
    return parsed.find((o) => o && o.event === 'outreach_feed') as Record<string, unknown>;
  };

  it('CONTROL: the log line is actually being captured', async () => {
    // If the spy missed, every assertion below would read undefined and pass vacuously.
    const line = await logLine();
    expect(line).toBeDefined();
    expect(line.outcome).toBe('success');
  });

  it('counts a real link', async () => {
    expect((await logLine()).joinable).toBe(1);
  });

  it('does NOT count an empty-string ghl_url as a link', async () => {
    // This was a live defect: the count used `!== null`, so an empty string read as a working
    // link and the number overstated how many rows the consumer could actually act on. An
    // empty url is exactly as unjoinable as a missing one.
    getOutreachMock.mockResolvedValue({
      view: 'reach_out', tracked_since: '2026-10-26', total: 3, offset: 0,
      rows: [
        sourceRow(),
        sourceRow({ enrollment_id: 'b', ghl_url: '' }),
        sourceRow({ enrollment_id: 'c', ghl_url: null }),
      ],
    });
    const line = await logLine();
    expect(line.rows).toBe(3);
    expect(line.joinable).toBe(1);
  });

  it('carries the paging context, so a short page in the logs is explainable', async () => {
    getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows: [sourceRow()], total: 847, offset: 200 });
    const line = await logLine({ limit: '200', offset: '200' });
    expect(line).toMatchObject({ limit: 200, offset: 200, total: 847, rows: 1 });
    expect(typeof line.snapshot).toBe('string');
  });
});
