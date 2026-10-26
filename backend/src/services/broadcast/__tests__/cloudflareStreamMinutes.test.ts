/**
 * Delivered minutes from the Cloudflare account (C8.10 AC2).
 *
 * THE CASE THIS FILE EXISTS FOR is the one production is in right now: the token is valid,
 * Cloudflare answers HTTP 200, and the body carries a GraphQL authorization error. A reader
 * that checked `res.ok` would take that for success and read zero minutes out of an empty
 * payload - publishing "Colaberry Live cost nothing to deliver" as a measurement. Every
 * test below is ultimately about keeping that specific zero from ever being produced.
 */
import {
  MINUTES_DATASET,
  assertFailureNeverCarriesMinutes,
  buildMinutesQuery,
  readDeliveredMinutes,
  readMinutesConfig,
} from '../cloudflareStreamMinutes';

const ENV = { CLOUDFLARE_ACCOUNT_ID: 'acct-1', CLOUDFLARE_STREAM_TOKEN: 'tok-secret' };

const jsonRes = (body: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
} as Response);

describe('config', () => {
  it('needs only the two credentials an analytics read uses', () => {
    // Deliberately NOT the five the playback provider demands: a missing signing key must
    // not take the cost figure down with it.
    expect(readMinutesConfig(ENV)).toEqual({ accountId: 'acct-1', apiToken: 'tok-secret' });
  });

  it('is null when either is missing', () => {
    expect(readMinutesConfig({ CLOUDFLARE_ACCOUNT_ID: 'a' })).toBeNull();
    expect(readMinutesConfig({ CLOUDFLARE_STREAM_TOKEN: 't' })).toBeNull();
    expect(readMinutesConfig({})).toBeNull();
  });
});

describe('the query', () => {
  it('asks the dataset that actually carries delivered minutes', () => {
    const q = buildMinutesQuery('acct-1', '2026-10-01', '2026-10-31');
    expect(q).toContain(MINUTES_DATASET);
    expect(q).toContain('minutesViewed');
    expect(q).toContain('date_geq: "2026-10-01"');
    expect(q).toContain('date_leq: "2026-10-31"');
  });
});

describe('failure modes', () => {
  it('says not_configured rather than zero when credentials are absent', async () => {
    const r = await readDeliveredMinutes('2026-10-01', '2026-10-31', { env: {} });
    expect(r).toEqual({ ok: false, reason: 'not_configured', detail: expect.any(String) });
    expect(r).not.toHaveProperty('minutes');
  });

  it('detects the authz error that arrives inside an HTTP 200 - the live case', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonRes({
      data: { viewer: { accounts: [] } },
      errors: [{
        message: 'not authorized for that account',
        extensions: { code: 'authz' },
      }],
    }));
    const r = await readDeliveredMinutes('2026-10-01', '2026-10-31', { env: ENV, fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('not_authorized');
    expect(r.detail).toMatch(/Account Analytics: Read/);
    expect(r).not.toHaveProperty('minutes');
  });

  it('classifies a 403 as not_authorized and a 500 as upstream_error', async () => {
    const forbidden = await readDeliveredMinutes('2026-10-01', '2026-10-31', {
      env: ENV, fetchImpl: jest.fn().mockResolvedValue(jsonRes({}, 403)),
    });
    expect(forbidden).toMatchObject({ ok: false, reason: 'not_authorized' });

    const broken = await readDeliveredMinutes('2026-10-01', '2026-10-31', {
      env: ENV, fetchImpl: jest.fn().mockResolvedValue(jsonRes({}, 500)),
    });
    expect(broken).toMatchObject({ ok: false, reason: 'upstream_error' });
  });

  it('classifies a timeout as a timeout', async () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    const r = await readDeliveredMinutes('2026-10-01', '2026-10-31', {
      env: ENV, fetchImpl: jest.fn().mockRejectedValue(err),
    });
    expect(r).toMatchObject({ ok: false, reason: 'upstream_timeout' });
  });

  it('never leaks the token into a failure detail', async () => {
    const err = new Error('connect ECONNREFUSED using Bearer tok-secret');
    const r = await readDeliveredMinutes('2026-10-01', '2026-10-31', {
      env: ENV, fetchImpl: jest.fn().mockRejectedValue(err),
    });
    expect(JSON.stringify(r)).not.toContain('tok-secret');
  });

  it('treats a missing account as unauthorized, not as zero minutes', async () => {
    const r = await readDeliveredMinutes('2026-10-01', '2026-10-31', {
      env: ENV,
      fetchImpl: jest.fn().mockResolvedValue(jsonRes({ data: { viewer: { accounts: [] } } })),
    });
    expect(r).toMatchObject({ ok: false, reason: 'not_authorized' });
    expect(r).not.toHaveProperty('minutes');
  });
});

describe('the success path', () => {
  it('sums minutes across days', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonRes({
      data: {
        viewer: {
          accounts: [{
            [MINUTES_DATASET]: [
              { sum: { minutesViewed: 120 }, dimensions: { date: '2026-11-03' } },
              { sum: { minutesViewed: 45.5 }, dimensions: { date: '2026-11-10' } },
            ],
          }],
        },
      },
    }));
    const r = await readDeliveredMinutes('2026-11-01', '2026-11-30', { env: ENV, fetchImpl });
    expect(r).toEqual({
      ok: true, minutes: 165.5, days: 2, from: '2026-11-01', to: '2026-11-30',
    });
  });

  it('reports a genuine zero as a measurement, because that one IS real', async () => {
    // The authorized-but-nothing-delivered case. Distinguishable from every failure above
    // by `ok: true`, which is the whole point of the discriminated union.
    const fetchImpl = jest.fn().mockResolvedValue(jsonRes({
      data: { viewer: { accounts: [{ [MINUTES_DATASET]: [] }] } },
    }));
    const r = await readDeliveredMinutes('2026-11-01', '2026-11-30', { env: ENV, fetchImpl });
    expect(r).toMatchObject({ ok: true, minutes: 0, days: 0 });
  });

  it('sends the token as a bearer header and not in the body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonRes({
      data: { viewer: { accounts: [{ [MINUTES_DATASET]: [] }] } },
    }));
    await readDeliveredMinutes('2026-11-01', '2026-11-30', { env: ENV, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok-secret');
    expect(init.body).not.toContain('tok-secret');
  });
});

describe('the guard', () => {
  it('passes a well-formed result of either shape', () => {
    expect(() => assertFailureNeverCarriesMinutes({
      ok: false, reason: 'not_authorized', detail: 'x',
    })).not.toThrow();
    expect(() => assertFailureNeverCarriesMinutes({
      ok: true, minutes: 5, days: 1, from: 'a', to: 'b',
    })).not.toThrow();
  });

  it('catches the convenience that would publish a zero cost', () => {
    // The regression it exists for: someone adds `minutes: 0` to the failure branch so
    // callers do not have to narrow the union.
    expect(() => assertFailureNeverCarriesMinutes({
      ok: false, reason: 'not_authorized', detail: 'x', minutes: 0,
    } as never)).toThrow(/carried a minutes value/);
  });
});
