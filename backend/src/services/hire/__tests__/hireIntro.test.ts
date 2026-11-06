/**
 * POST /api/public/hire/intro's service: validation, the reachability check, the
 * once-a-day idempotency key, and the release of that key when ingest fails.
 *
 * The ingest service and the database are mocked at their boundaries: no lead is written
 * and no notification is sent by this suite.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../leadIngestionService', () => ({ handleIngest: jest.fn() }));
jest.mock('../hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));

import { sequelize } from '../../../config/database';
import { handleIngest } from '../../leadIngestionService';
import { loadHireIndex } from '../hireTalentIndex';
import { centralDay, introIdempotencyKey, requestHireIntro } from '../hireIntro';

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockIngest = handleIngest as unknown as jest.Mock;
const mockIndex = loadHireIndex as unknown as jest.Mock;

const NOW = new Date('2026-11-06T18:00:00Z');
const body = (over: Record<string, unknown> = {}) => ({
  talentSlug: 'ann-lee', name: 'Jane Doe', email: 'jane@acme.com', company: 'Acme', role: 'FDE', message: 'Claims work', ...over,
});
const ctx = { headers: {}, remoteIp: '1.2.3.4', now: NOW };
const claimed = () => mockQuery.mockResolvedValueOnce([[{ idempotency_key: 'k' }]]);
const alreadyClaimed = () => mockQuery.mockResolvedValueOnce([[]]);

beforeEach(() => {
  mockQuery.mockReset();
  mockIngest.mockReset().mockResolvedValue({ success: true, httpStatus: 200, leadId: 7 });
  mockIndex.mockReset().mockResolvedValue([{ page: { slug: 'ann-lee' }, facts: {}, cases: [] }]);
});

describe('validation', () => {
  it('rejects unknown fields, a bad email, and a missing company', async () => {
    expect((await requestHireIntro(body({ phone: '555' }), ctx)).status).toBe('invalid');
    expect((await requestHireIntro(body({ email: 'not-an-email' }), ctx)).status).toBe('invalid');
    expect((await requestHireIntro(body({ company: '' }), ctx)).status).toBe('invalid');
    expect((await requestHireIntro(body({ message: 'x'.repeat(2001) }), ctx)).status).toBe('invalid');
    expect(mockIngest).not.toHaveBeenCalled();
  });
});

describe('reachability', () => {
  it('answers not_found for a person not reachable on Hire, and writes nothing', async () => {
    mockIndex.mockResolvedValue([]);
    expect(await requestHireIntro(body(), ctx)).toEqual({ status: 'not_found', http: 404 });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockIngest).not.toHaveBeenCalled();
    expect(mockIndex).toHaveBeenCalledWith(['public', 'unlisted'], 'ann-lee');
  });
});

describe('once a day', () => {
  it('ingests the first request as a canonical lead under the hire-refactored source', async () => {
    claimed();
    expect(await requestHireIntro(body(), ctx)).toEqual({ status: 'created', http: 201 });
    const call = mockIngest.mock.calls[0][0];
    expect(call.sourceSlug).toBe('hire-refactored');
    expect(call.entrySlug).toBe('intro_request');
    expect(call.rawBody).toMatchObject({ email: 'jane@acme.com', talent_slug: 'ann-lee', company: 'Acme' });
    expect(call.rawBody.idempotency_key).toBe(introIdempotencyKey('jane@acme.com', 'ann-lee', NOW));
  });

  it('answers duplicate, and fires nothing, for the same request the same day', async () => {
    alreadyClaimed();
    expect(await requestHireIntro(body(), ctx)).toEqual({ status: 'duplicate', http: 200 });
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it('keys on email (case-insensitive), person and the CENTRAL day', () => {
    expect(introIdempotencyKey('Jane@Acme.com', 'ann-lee', NOW)).toBe(introIdempotencyKey('jane@acme.com', 'ann-lee', NOW));
    expect(introIdempotencyKey('jane@acme.com', 'bo', NOW)).not.toBe(introIdempotencyKey('jane@acme.com', 'ann-lee', NOW));
    // 04:30 UTC on the 7th is still the 6th in Chicago.
    expect(centralDay(new Date('2026-11-07T04:30:00Z'))).toBe('2026-11-06');
    expect(centralDay(new Date('2026-11-07T07:30:00Z'))).toBe('2026-11-07');
  });

  it('claims with INSERT ... ON CONFLICT DO NOTHING, by bind', async () => {
    claimed();
    await requestHireIntro(body(), ctx);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO hire_intro_requests[\s\S]*ON CONFLICT \(idempotency_key\) DO NOTHING RETURNING/);
    expect(opts.bind[1]).toBe('ann-lee');
    expect(opts.bind[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('failure path', () => {
  it('releases the key and answers failed when ingest fails, so the employer can retry', async () => {
    claimed();
    mockQuery.mockResolvedValueOnce([[]]); // the DELETE
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockIngest.mockResolvedValue({ success: false, httpStatus: 500, error: 'down' });
    expect(await requestHireIntro(body(), ctx)).toEqual({ status: 'failed', http: 502 });
    expect(mockQuery.mock.calls[1][0]).toMatch(/DELETE FROM hire_intro_requests WHERE idempotency_key = \$1/);
    expect(JSON.parse(String(err.mock.calls[0][0])).event).toBe('hire_intro_ingest_failed');
    err.mockRestore();
  });

  it('treats an ingest that throws the same way', async () => {
    claimed();
    mockQuery.mockResolvedValueOnce([[]]);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockIngest.mockRejectedValue(new Error('boom'));
    expect((await requestHireIntro(body(), ctx)).status).toBe('failed');
  });

  it('never returns anything about the candidate', async () => {
    claimed();
    const out = await requestHireIntro(body(), ctx);
    expect(Object.keys(out).sort()).toEqual(['http', 'status']);
  });
});
