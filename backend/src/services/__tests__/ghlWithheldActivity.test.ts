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

const lead = { id: 'lead-1', source: 'open_house', email: 'a@example.test' };

beforeEach(() => {
  getSetting.mockReset();
  getTestOverrides.mockReset();
  resolveRoute.mockReset();
  logActivity.mockReset();
  getSetting.mockResolvedValue(true);          // ghl_enabled
  getTestOverrides.mockResolvedValue({ enabled: false });
  logActivity.mockResolvedValue(undefined);
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
    // The fetch beyond this point is not stubbed; we only care that the withheld
    // row is not written before it, so a throw past this line is acceptable.
    await syncLeadToGhl(lead as never).catch(() => undefined);
    const withheld = logActivity.mock.calls.filter(
      (c) => (c[0] as { subject?: string }).subject === 'GHL Sync Withheld',
    );
    expect(withheld).toEqual([]);
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
