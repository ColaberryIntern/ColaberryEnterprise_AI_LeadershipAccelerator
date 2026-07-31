/**
 * ghlService — retry/backoff hardening (alumni win-back GHL sync gap).
 *
 * ghlFetch previously made a single attempt at every GHL call: a transient
 * 429/5xx from GHL's API silently killed the sync with no retry, same as a
 * permanent 4xx. Verifies transient statuses now retry with bounded backoff,
 * permanent 4xx statuses fail immediately with no retry, and persistent
 * failures still terminate (no infinite retry loop).
 */
jest.mock('../settingsService', () => ({
  getSetting: jest.fn().mockResolvedValue('test-ghl-key'),
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }),
}));
jest.mock('../activityService', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { findContactByEmail } from '../ghlService';

function mockResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('ghlFetch (via findContactByEmail) — retry/backoff', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('happy path: retries a transient 429 and succeeds on the second attempt', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(mockResponse(429, { message: 'rate limited' }))
      .mockResolvedValueOnce(mockResponse(200, { contacts: [] }));
    global.fetch = mockFetch as any;

    const result = await findContactByEmail('someone@example.com');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toBeNull(); // empty contacts list, but the call itself succeeded
  }, 10000);

  it('failure path: a permanent 404 fails immediately with no retry', async () => {
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(404, { message: 'not found' }));
    global.fetch = mockFetch as any;

    const result = await findContactByEmail('someone@example.com');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('boundary: persistent 500s exhaust retries and terminate (no infinite loop)', async () => {
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(500, { message: 'server error' }));
    global.fetch = mockFetch as any;

    const result = await findContactByEmail('someone@example.com');

    // GHL_RETRY_MAX = 2 extra attempts -> 3 total calls, then a clean failure.
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toBeNull();
  }, 10000);
});
