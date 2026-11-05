const getOutreachMock = jest.fn();
jest.mock('../../services/explorerGrowth/explorerCampusService', () => ({
  getOutreach: (...a: unknown[]) => getOutreachMock(...a),
}));

import * as fs from 'fs';
import * as path from 'path';
import {
  getOutreachFeed,
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
  getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows: [sourceRow()] });
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
  it('defaults to reach_out and 25', async () => {
    await run();
    expect(getOutreachMock).toHaveBeenCalledWith('reach_out', 25);
  });

  it('passes a requested view and limit through', async () => {
    await run({ view: 'engaged', limit: '50' });
    expect(getOutreachMock).toHaveBeenCalledWith('engaged', 50);
  });

  it('400s an over-cap limit rather than silently clamping', async () => {
    const { res } = await run({ limit: '5000' });
    expect(res.statusCode).toBe(400);
    expect(getOutreachMock).not.toHaveBeenCalled();
  });

  it('400s an unknown parameter, because the shared schema is strict', async () => {
    const { res } = await run({ offset: '10' });
    expect(res.statusCode).toBe(400);
    expect(getOutreachMock).not.toHaveBeenCalled();
  });

  it('400s an unknown view', async () => {
    expect((await run({ view: 'everyone' })).res.statusCode).toBe(400);
  });
});

describe('the envelope', () => {
  it('carries the view, the tracked_since date and a count', async () => {
    const { res } = await run();
    expect(res.body).toMatchObject({ view: 'reach_out', tracked_since: '2026-10-26', count: 1 });
  });

  it('an empty queue is a 200 with count 0, not a 404', async () => {
    // "Nobody to call today" is an answer. A 404 would read as "the feed is broken".
    getOutreachMock.mockResolvedValue({ view: 'reach_out', tracked_since: '2026-10-26', rows: [] });
    const { res } = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ count: 0, rows: [] });
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

  it('is registered with requireServiceToken and the rate limiter', () => {
    expect(ROUTES).toContain(
      "router.get('/api/v1/explorer-growth/outreach', v1RateLimiter, requireServiceToken, getOutreachFeed);",
    );
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
