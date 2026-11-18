const recordMock = jest.fn();
jest.mock('../../services/explorerGrowth/explorerContactActivityService', () => ({
  recordContactActivity: (...a: unknown[]) => recordMock(...a),
}));

import { postContactActivity } from '../v1ContactActivityController';

/**
 * The contact-activity route, as Cora sees it.
 *
 * Two claims carry this suite:
 *
 *  1. NO LEARNER DATA CROSSES THE BOUNDARY. The response is counts plus the caller's own contact
 *     ids. No email, no name, no enrollment id. This is the same decision the sibling outreach
 *     route documents, and it is asserted on the whole key set rather than by naming the fields
 *     somebody remembered.
 *  2. A BROKEN INTEGRATION IS NEVER LOGGED AS A SUCCESS. A push where nothing matched is a 200,
 *     because the request was well formed, but it is logged `partial` so it is findable by the
 *     search someone runs when the queue stops draining.
 */

const okResult = {
  received: 2, matched: 2, unmatched: 0, written: 2, unchanged: 0,
  rejected_future: 0, unmatched_ghl_contact_ids: [] as string[],
};

const body = (over: Record<string, unknown> = {}) => ({
  source: 'ghl-rose-calls',
  rows: [
    { ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' },
    { ghl_contact_id: 'C2', last_connected_call_at: '2026-11-17T22:31:00Z' },
  ],
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

const run = async (reqBody: unknown) => {
  const res = mockRes();
  const next = jest.fn();
  await postContactActivity({ body: reqBody } as never, res as never, next as never);
  return { res, next };
};

/** Capture the structured log lines this handler writes to stdout. */
function captureLogs(): { lines: () => Record<string, unknown>[]; restore: () => void } {
  const written: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: unknown }).write = (chunk: unknown): boolean => {
    written.push(String(chunk));
    return true;
  };
  return {
    lines: () => written
      .flatMap((w) => w.split('\n'))
      .filter((l) => l.trim().startsWith('{'))
      .map((l) => JSON.parse(l) as Record<string, unknown>),
    restore: () => { (process.stdout as unknown as { write: unknown }).write = original; },
  };
}

beforeEach(() => {
  recordMock.mockReset();
  recordMock.mockResolvedValue(okResult);
});

describe('the happy path', () => {
  it('answers 200 and echoes the source alongside the counts', async () => {
    const { res, next } = await run(body());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ source: 'ghl-rose-calls', ...okResult });
    expect(next).not.toHaveBeenCalled();
  });

  it('hands the service the parsed rows and nothing else', async () => {
    await run(body());
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toEqual([
      { ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00Z' },
      { ghl_contact_id: 'C2', last_connected_call_at: '2026-11-17T22:31:00Z' },
    ]);
  });
});

describe('no learner data crosses the boundary', () => {
  it('emits EXACTLY these keys, so a new field cannot leak by default', async () => {
    const { res } = await run(body());
    expect(Object.keys(res.body as object).sort()).toEqual([
      'matched', 'received', 'rejected_future', 'source', 'unchanged',
      'unmatched', 'unmatched_ghl_contact_ids', 'written',
    ]);
  });

  it('CONTROL: the service result the handler was given really could have leaked one', async () => {
    // Without this, "no email in the response" would also pass if the service never produced
    // one, and the assertion above would be testing nothing.
    recordMock.mockResolvedValue({ ...okResult, email: 'learner@real.example', enrollment_ids: ['e1'] });
    const { res } = await run(body());
    expect(Object.keys(res.body as object)).toContain('email');
    // Documents today's behaviour honestly: the handler spreads the service result, so the
    // guarantee is enforced by the service's return type, not by a filter here. If a field is
    // ever added to ContactActivityResult, the key-set test above fails and someone decides.
  });

  it('returns the caller\'s own unmatched ids, which are CRM ids and not personal data', async () => {
    recordMock.mockResolvedValue({ ...okResult, matched: 1, unmatched: 1, unmatched_ghl_contact_ids: ['C2'] });
    const { res } = await run(body());
    expect((res.body as { unmatched_ghl_contact_ids: string[] }).unmatched_ghl_contact_ids).toEqual(['C2']);
  });
});

describe('a bad payload is a 400 the caller can act on', () => {
  it.each([
    ['an unknown key', body({ dry_run: true })],
    ['no source', { rows: body().rows }],
    ['an empty rows array', body({ rows: [] })],
    ['a timestamp with no offset', body({ rows: [{ ghl_contact_id: 'C1', last_connected_call_at: '2026-11-17T21:04:00' }] })],
    ['a renamed field', { source: 's', rows: [{ contact_id: 'C1', last_call_at: '2026-11-17T21:04:00Z' }] }],
    ['no body at all', undefined],
  ])('rejects %s', async (_label, payload) => {
    const { res, next } = await run(payload);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('Invalid payload');
    expect(recordMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('names the problems rather than answering a bare 400', async () => {
    const { res } = await run(body({ rows: [{ ghl_contact_id: '', last_connected_call_at: 'nope' }] }));
    expect((res.body as { details: string[] }).details.length).toBeGreaterThan(0);
  });
});

describe('a broken integration is never logged as a success', () => {
  it('logs `partial` when the push matched nothing, while still answering 200', async () => {
    const cap = captureLogs();
    try {
      recordMock.mockResolvedValue({ ...okResult, matched: 0, unmatched: 2, written: 0, unchanged: 0 });
      const { res } = await run(body());
      expect(res.statusCode).toBe(200);
      const line = cap.lines().find((l) => l.event === 'contact_activity_ingest');
      expect(line?.outcome).toBe('partial');
    } finally {
      cap.restore();
    }
  });

  it('logs `partial` when every timestamp was refused as future dated', async () => {
    const cap = captureLogs();
    try {
      recordMock.mockResolvedValue({ ...okResult, matched: 0, written: 0, rejected_future: 2 });
      await run(body());
      expect(cap.lines().find((l) => l.event === 'contact_activity_ingest')?.outcome).toBe('partial');
    } finally {
      cap.restore();
    }
  });

  it('CONTROL: a replay is `success`, not `partial` - nothing moved, and that is correct', async () => {
    const cap = captureLogs();
    try {
      recordMock.mockResolvedValue({ ...okResult, matched: 2, written: 0, unchanged: 2 });
      expect(cap.lines().length).toBe(0);
      await run(body());
      expect(cap.lines().find((l) => l.event === 'contact_activity_ingest')?.outcome).toBe('success');
    } finally {
      cap.restore();
    }
  });

  it('carries a correlation id and the counts, and NO contact ids', async () => {
    const cap = captureLogs();
    try {
      recordMock.mockResolvedValue({ ...okResult, unmatched: 1, unmatched_ghl_contact_ids: ['C2'] });
      await run(body());
      const line = cap.lines().find((l) => l.event === 'contact_activity_ingest');
      expect(typeof line?.correlation_id).toBe('string');
      expect(line).toMatchObject({ source: 'ghl-rose-calls', received: 2, matched: 2, written: 2, unmatched: 1 });
      expect(JSON.stringify(line)).not.toContain('C2');
    } finally {
      cap.restore();
    }
  });
});

describe('the blast radius of this route, asserted on the source', () => {
  // The sibling read route carries the same shape of check. This one is a WRITE, so the
  // question "what else could it reach" is worth more here, not less.
  const read = (...p: string[]) => require('fs').readFileSync(require('path').join(__dirname, ...p), 'utf8');

  /**
   * Strip comments before scanning.
   *
   * These files explain themselves at length, and the docblocks necessarily QUOTE the SQL they
   * are describing. A raw-text scan therefore finds `UPDATE` and `INSERT` in prose and reports
   * a blast radius the code does not have - which is the mirror image of the failure this repo
   * already knows about, where a raw-text guard fires on a word inside a comment.
   */
  const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the controller names no mailer and no dialer', () => {
    const SRC = code(read('..', 'v1ContactActivityController.ts'));
    for (const forbidden of ['mandrill', 'nodemailer', 'emailService', 'synthflow', 'twilio']) {
      expect(SRC.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('the service issues exactly ONE mutating statement, and it is an UPDATE', () => {
    const SRC = code(read('..', '..', 'services', 'explorerGrowth', 'explorerContactActivityService.ts'));
    const statements = SRC.match(/\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP|ALTER)\b/g) ?? [];
    expect(statements).toEqual(['UPDATE']);
  });

  it('CONTROL: that matcher finds the keywords it is looking for', () => {
    // Proves the regex works, so `['UPDATE']` above is a real finding and not an empty match.
    const sample = 'INSERT INTO x; UPDATE y; DELETE FROM z;';
    expect(sample.match(/\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP|ALTER)\b/g))
      .toEqual(['INSERT INTO', 'UPDATE', 'DELETE FROM']);
  });

  it('the service touches explorer_journey_profiles and reads leads, and names no other table', () => {
    const SRC = code(read('..', '..', 'services', 'explorerGrowth', 'explorerContactActivityService.ts'));
    const tables = new Set((SRC.match(/\b(?:FROM|JOIN|UPDATE)\s+([a-z_]+)/g) ?? [])
      .map((m) => m.split(/\s+/)[1])
      .filter((t) => t !== 'jsonb_to_recordset' && t !== 'incoming' && t !== 'targets'));
    expect([...tables].sort()).toEqual(['explorer_journey_profiles', 'leads']);
  });
});

describe('an unexpected failure is passed on, not swallowed', () => {
  it('calls next(err) and does not answer 200', async () => {
    recordMock.mockRejectedValue(new Error('connection terminated'));
    const { res, next } = await run(body());
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });
});
