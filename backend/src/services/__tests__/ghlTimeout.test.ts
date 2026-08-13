/**
 * ghlService — outbound request timeout regression (BC #10099862873).
 *
 * The GHL API call had no explicit timeout even after this ticket added
 * failure-classification/alerting around it — a hang would never throw, so
 * the new alerting could never fire for the single most likely real-world
 * failure mode. Verifies the request now carries an abort signal.
 */
jest.mock('../settingsService', () => ({
  getSetting: jest.fn().mockResolvedValue('test-ghl-key'),
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }),
}));
jest.mock('../activityService', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { findContactByEmail } from '../ghlService';

describe('ghlFetch (via findContactByEmail) — request timeout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('happy path: the outbound request carries an AbortSignal', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contacts: [] }),
    });
    global.fetch = mockFetch as any;

    await findContactByEmail('someone@example.com');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const options = mockFetch.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('failure path: an aborted (hung) request resolves as a classified failure, not an unhandled hang', async () => {
    const abortError = new Error('This operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as any;

    const result = await findContactByEmail('someone@example.com');

    expect(result).toBeNull();
  });
});
