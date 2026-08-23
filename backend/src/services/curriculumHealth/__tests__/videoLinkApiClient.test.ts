/**
 * The I/O boundary's contract, which is mostly a contract about what the client
 * REFUSES to do:
 *
 *  - it never turns a failure into an empty result, because an empty result reads
 *    downstream as "every video in this batch is gone";
 *  - it never invents a default for a field the API did not send, because
 *    defaulting `embeddable` to true would mark the entire curriculum healthy in
 *    one line;
 *  - it never hands back a bare list of what it found, because the caller's real
 *    question is which of the ids it ASKED for came back.
 */
import {
  MAX_IDS_PER_CALL,
  createVideoApiClient,
  readApiVideo,
} from '../videoLinkApiClient';
import { CONTROL_ID, TEST_KEY, apiItem, requestedIds } from './helpers/videoLinkFixtures';

const savedKey = process.env.YOUTUBE_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.YOUTUBE_API_KEY = TEST_KEY;
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = savedKey;
});

/** A videos.list responder that omits whichever ids the test says are gone. */
const respond = (absent: string[] = [], extra: Record<string, unknown> = {}) =>
  jest.fn(async (url: string) => ({
    status: 200,
    ok: true,
    json: async () => ({
      items: requestedIds(String(url)).filter((id) => !absent.includes(id)).map((id) => apiItem(id)),
      ...extra,
    }),
  })) as never;

describe('readApiVideo - absent is absent, never a default', () => {
  it('returns null embeddable when status.embeddable is missing', () => {
    const v = readApiVideo({ id: 'a', status: { privacyStatus: 'public' } });
    expect(v?.embeddable).toBeNull();
  });

  it('does not coerce a missing embeddable to true, which would clear the whole corpus', () => {
    expect(readApiVideo({ id: 'a', status: {} })?.embeddable).not.toBe(true);
  });

  it('reads the fields the check actually decides on', () => {
    const v = readApiVideo(
      apiItem('a', { embeddable: false, privacyStatus: 'unlisted', regionBlocked: ['US'] }) as Record<string, unknown>,
    );
    expect(v).toMatchObject({
      id: 'a',
      privacyStatus: 'unlisted',
      uploadStatus: 'processed',
      embeddable: false,
      regionBlocked: ['US'],
    });
  });

  it('rejects an item with no id rather than storing it under undefined', () => {
    expect(readApiVideo({ status: { privacyStatus: 'public' } })).toBeNull();
  });
});

describe('lookup - the request is the question, the response is only part of the answer', () => {
  it('THE HEADLINE: 47 items back from 50 ids means three are missing, not that all 50 passed', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `vid${String(i).padStart(6, '0')}`);
    const gone = [ids[7], ids[19], ids[44]];
    (global as any).fetch = respond(gone);

    const res = await createVideoApiClient().lookup(ids);

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.found.size).toBe(47);
    expect(res.requested).toHaveLength(50);
    // The caller can name exactly which ids the API declined to return.
    expect(res.requested.filter((id) => !res.found.has(id))).toEqual(gone);
  });

  it('reports the request it made, so absence is computable without re-deriving it', async () => {
    (global as any).fetch = respond();
    const res = await createVideoApiClient().lookup(['a', 'b']);
    expect(res.ok && res.requested).toEqual(['a', 'b']);
  });

  it('costs one quota unit per call, whatever the batch size', async () => {
    (global as any).fetch = respond();
    const client = createVideoApiClient();
    await client.lookup(Array.from({ length: 50 }, (_, i) => `v${i}`));
    expect(client.quotaUnits()).toBe(1);
    await client.lookup(['x']);
    expect(client.quotaUnits()).toBe(2);
  });

  it('refuses more than the API ceiling rather than being silently truncated', async () => {
    (global as any).fetch = respond();
    const res = await createVideoApiClient().lookup(Array.from({ length: MAX_IDS_PER_CALL + 1 }, (_, i) => `v${i}`));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errorClass).toBe('ContractViolation');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('marks a paginated response incomplete, because absence from one page proves nothing', async () => {
    (global as any).fetch = respond(['b'], { nextPageToken: 'CAUQAA' });
    const res = await createVideoApiClient().lookup(['a', 'b']);
    expect(res.ok && res.complete).toBe(false);
  });

  it('never puts the API key in the request result', async () => {
    (global as any).fetch = respond();
    const res = await createVideoApiClient().lookup(['a']);
    expect(JSON.stringify(res.ok ? res.requested : res)).not.toContain(TEST_KEY);
  });
});

describe('lookup - failures degrade to "could not see", never to an empty result', () => {
  it('returns NotConfigured without calling fetch when the key is missing', async () => {
    delete process.env.YOUTUBE_API_KEY;
    (global as any).fetch = jest.fn();

    const res = await createVideoApiClient().lookup(['a']);

    expect(res.ok).toBe(false);
    expect(!res.ok && res.errorClass).toBe('NotConfigured');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('classifies a quota rejection as QuotaExceeded and does not retry into the wall', async () => {
    (global as any).fetch = jest.fn(async () => ({
      status: 403,
      ok: false,
      json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }),
    })) as never;

    const res = await createVideoApiClient().lookup(['a']);

    expect(!res.ok && res.errorClass).toBe('QuotaExceeded');
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('classifies an IP restriction as AuthError - the failure mode this host actually has', async () => {
    (global as any).fetch = jest.fn(async () => ({
      status: 403,
      ok: false,
      json: async () => ({ error: { errors: [{ reason: 'ipRefererBlocked' }] } }),
    })) as never;

    const res = await createVideoApiClient().lookup(['a']);
    expect(!res.ok && res.errorClass).toBe('AuthError');
  });

  it('an unshaped 200 is a ContractViolation, NOT an empty result', async () => {
    (global as any).fetch = jest.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ kind: 'youtube#videoListResponse' }),
    })) as never;

    const res = await createVideoApiClient().lookup(['a', 'b']);

    // If this ever returned ok:true with an empty map, the caller would report
    // both videos dead. That is the whole reason this branch exists.
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errorClass).toBe('ContractViolation');
  });

  it('retries a 5xx and succeeds when the upstream comes back', async () => {
    let n = 0;
    (global as any).fetch = jest.fn(async (url: string) => {
      if (++n === 1) return { status: 503, ok: false, json: async () => ({}) } as never;
      return {
        status: 200,
        ok: true,
        json: async () => ({ items: requestedIds(String(url)).map((id) => apiItem(id)) }),
      } as never;
    });

    const res = await createVideoApiClient().lookup(['a']);

    expect(res.ok).toBe(true);
    expect(res.ok && res.found.size).toBe(1);
  }, 20_000);

  it('gives up after the capped ladder rather than retrying forever', async () => {
    (global as any).fetch = jest.fn(async () => ({ status: 503, ok: false, json: async () => ({}) })) as never;

    const res = await createVideoApiClient().lookup(['a']);

    expect(res.ok).toBe(false);
    expect(!res.ok && res.errorClass).toBe('UpstreamUnavailable');
    expect((global.fetch as jest.Mock).mock.calls.length).toBeLessThanOrEqual(3);
  }, 20_000);

  it('a network throw is UpstreamUnavailable, not an empty response', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw Object.assign(new Error('boom'), { name: 'TypeError' });
    });

    const res = await createVideoApiClient().lookup([CONTROL_ID]);

    expect(res.ok).toBe(false);
    expect(!res.ok && res.errorClass).toBe('UpstreamUnavailable');
  }, 20_000);

  it('never leaks the key into an error detail, even when Google echoes it back at us', async () => {
    // No `errors` array, so the client falls back to `error.message` - upstream
    // text we do not control, which is exactly why it gets redacted.
    (global as any).fetch = jest.fn(async () => ({
      status: 403,
      ok: false,
      json: async () => ({ error: { message: `API key not valid: ${TEST_KEY}` } }),
    })) as never;

    const res = await createVideoApiClient().lookup(['a']);

    expect(res.ok).toBe(false);
    expect(!res.ok && res.detail).not.toContain(TEST_KEY);
    expect(!res.ok && res.detail).toContain('<redacted>');
  });
});
