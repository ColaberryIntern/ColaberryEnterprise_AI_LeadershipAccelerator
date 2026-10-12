/**
 * T214 — the withheld activity row, which is the ENTIRE justification for
 * failing closed.
 *
 * Closing the corrupt-route-map fail-open means a typo in one setting stops all
 * GHL syncing. The argument that this is the right trade rests wholly on the
 * withholding being OBSERVABLE: a warning per lead plus a `status: 'withheld'`
 * activity row naming the reason. A verifier pointed out that argument was
 * asserted in prose only — `syncLeadToGhl`'s withheld branch had no test at all.
 * Untested observability is not observability.
 */
const getSetting = jest.fn();
const getTestOverrides = jest.fn();
const resolveRoute = jest.fn();
const logActivity = jest.fn();

jest.mock('../settingsService', () => ({
  getSetting: (...a: unknown[]) => getSetting(...a),
  getTestOverrides: (...a: unknown[]) => getTestOverrides(...a),
}));
jest.mock('../leads/ghlAccountRouting', () => ({
  resolveGhlAccountForSource: (...a: unknown[]) => resolveRoute(...a),
  ROUTES_SETTING: 'ghl_account_routes',
}));
jest.mock('../activityService', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const { syncLeadToGhl } = require('../ghlService');

/**
 * Generous timeout for IMPORT COST, not for I/O — and the distinction matters.
 *
 * `require('../ghlService')` pulls the models index -> database -> env graph
 * synchronously, which jest attributes to the first test that runs. Measured
 * between 3.5s and 12.3s on this machine purely from load variance, against
 * jest's 5s default. That made the suite flake.
 *
 * This is NOT a way to tolerate a slow network call: the HTTP boundary is
 * stubbed above, and `reaches no network on ANY withheld reason` asserts `fetch`
 * is never called on the withheld paths. Raising the timeout while a live call
 * remained would have hidden the real defect; here the call is already gone and
 * what is left is module loading.
 */
jest.setTimeout(60000);

const lead = { id: 'lead-1', source: 'open_house', email: 'a@example.test' };

/**
 * THE HTTP BOUNDARY IS STUBBED, AND THAT IS NOT AN OPTIMISATION.
 *
 * The first version of this file mocked the settings, routing and activity
 * modules but NOT `fetch`. On the ready path it therefore drove the real
 * `syncLeadToGhl` into `ghlFetch` and sent **live authenticated requests to
 * GoHighLevel's production API** — including a contact-CREATE POST — from every
 * run, on any machine, and in CI. A verifier caught it in the response bodies:
 * `[GHL] API error 401: { msg: 'Api key is invalid.' }`.
 *
 * That is a breach of the standing "nothing sends" constraint, which covers test
 * runs explicitly, and it was a production-write hazard rather than merely a
 * slow test: had that key ever been valid anywhere, a test run would have
 * written a row into a live CRM. It also made the suite non-deterministic — a
 * 15s AbortSignal racing jest's 5s timeout, red in 3 of 4 runs.
 *
 * So `fetch` is stubbed, and the tests below ASSERT IT WAS NEVER CALLED on the
 * withheld paths. The hazard becomes a guarantee.
 */
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  getSetting.mockReset();
  getTestOverrides.mockReset();
  resolveRoute.mockReset();
  logActivity.mockReset();
  getSetting.mockResolvedValue(true);          // ghl_enabled
  getTestOverrides.mockResolvedValue({ enabled: false });
  logActivity.mockResolvedValue(undefined);
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
    ok: false,
    status: 401,
    text: async () => '{"msg":"stubbed, no network"}',
    json: async () => ({ msg: 'stubbed, no network' }),
  }) as never);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('T214 — an unreadable route map is withheld, and SAYS SO', () => {
  it('writes a withheld activity row naming routes_unreadable as the reason', async () => {
    resolveRoute.mockResolvedValue({ status: 'routes_unreadable', settingKey: 'ghl_account_routes' });

    const result = await syncLeadToGhl(lead as never);

    expect(result.contactId).toBeNull();
    expect(logActivity).toHaveBeenCalledTimes(1);
    const row = logActivity.mock.calls[0][0] as {
      lead_id: string; subject: string; metadata: Record<string, unknown>;
    };
    expect(row.lead_id).toBe('lead-1');
    expect(row.subject).toBe('GHL Sync Withheld');
    expect(row.metadata).toMatchObject({
      action: 'ghl_sync', status: 'withheld', reason: 'routes_unreadable', source: 'open_house',
    });
    // NOTHING SENDS: withholding means no request leaves the process at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('explains WHY in the returned error, so the operator is not left guessing', async () => {
    resolveRoute.mockResolvedValue({ status: 'routes_unreadable', settingKey: 'ghl_account_routes' });
    const result = await syncLeadToGhl(lead as never);
    expect(result.error).toContain('ghl_account_routes');
    expect(result.error).toContain('unreadable');
  });

  it('writes no activity row at all on the READY path, so the row means something', async () => {
    // The control. Without it, "a row is written" would also hold for a run that
    // logs a withheld row on every sync, which would make the signal useless.
    resolveRoute.mockResolvedValue({
      status: 'ready', account: { apiKey: 'k', accountKey: 'default' },
    });
    await syncLeadToGhl(lead as never).catch(() => undefined);
    const withheld = logActivity.mock.calls.filter(
      (c) => (c[0] as { subject?: string }).subject === 'GHL Sync Withheld',
    );
    expect(withheld).toEqual([]);
    // The ready path DOES reach the HTTP boundary — which is exactly why that
    // boundary is stubbed. Asserting the stub absorbed it is what proves no
    // request left the machine; before the stub, this line was two live calls to
    // a production CRM, one of them a contact-CREATE POST.
    expect(fetchSpy).toHaveBeenCalled();
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).toContain('rest.gohighlevel.com');
    }
  });

  it('reaches no network on ANY withheld reason — the nothing-sends guarantee', async () => {
    for (const route of [
      { status: 'routes_unreadable', settingKey: 'ghl_account_routes' },
      { status: 'unconfigured', accountKey: 'x', settingKey: 'ghl_api_key_x' },
      { status: 'no_credentials' },
    ]) {
      fetchSpy.mockClear();
      resolveRoute.mockResolvedValue(route);
      await syncLeadToGhl(lead as never);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  });

  it('still distinguishes the OTHER two withhold reasons', async () => {
    // routes_unreadable must not swallow the pre-existing cases.
    resolveRoute.mockResolvedValue({
      status: 'unconfigured', accountKey: 'school_of_data_analytics', settingKey: 'ghl_api_key_school_of_data_analytics',
    });
    await syncLeadToGhl(lead as never);
    expect((logActivity.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata)
      .toMatchObject({ reason: 'unconfigured', account: 'school_of_data_analytics' });

    logActivity.mockClear();
    resolveRoute.mockResolvedValue({ status: 'no_credentials' });
    await syncLeadToGhl(lead as never);
    expect((logActivity.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata)
      .toMatchObject({ reason: 'no_credentials', account: null });
  });
});
