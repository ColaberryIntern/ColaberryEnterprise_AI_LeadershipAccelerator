/**
 * Per-source GHL sub-account routing.
 *
 * Kes, 2026-08-25: open-house and training-site leads never reached the
 * "Colaberry School of Data Analytics" GHL account. Two causes. The sync was
 * never called on those paths, and the single stored `ghl_api_key` is scoped to
 * the **Agent Cory AI** sub-account, so even a wired-up sync would have written
 * 490 leads to the wrong CRM in front of an outbound dialer.
 *
 * The property these tests exist to protect is the withholding rule: a source
 * routed to an account with no key on file must resolve to something the caller
 * refuses to sync, NOT fall back to the default account. If someone later
 * "simplifies" that fallback back in, this suite is what should stop them.
 */
const mockGetSetting = jest.fn();

jest.mock('../../services/settingsService', () => ({
  getSetting: (k: string) => mockGetSetting(k),
}));

import {
  resolveGhlAccountForSource,
  parseRoutes,
  apiKeySettingFor,
  DEFAULT_ACCOUNT,
  ROUTES_SETTING,
} from '../../services/leads/ghlAccountRouting';

/** Drives getSetting from a plain settings map. */
function settings(map: Record<string, unknown>) {
  mockGetSetting.mockImplementation((k: string) => Promise.resolve(map[k]));
}

beforeEach(() => mockGetSetting.mockReset());

describe('apiKeySettingFor', () => {
  it('keeps the historical key name for the default account', () => {
    // Renaming this would orphan the credential already in production.
    expect(apiKeySettingFor(DEFAULT_ACCOUNT)).toBe('ghl_api_key');
  });

  it('namespaces every other account', () => {
    expect(apiKeySettingFor('school_of_data_analytics')).toBe(
      'ghl_api_key_school_of_data_analytics'
    );
  });
});

describe('parseRoutes', () => {
  it('accepts an object or a JSON string', () => {
    expect(parseRoutes({ open_house: 'school' })).toEqual({ open_house: 'school' });
    expect(parseRoutes('{"open_house":"school"}')).toEqual({ open_house: 'school' });
  });

  it('treats an ABSENT setting as no routes — the legitimate pre-existing state', () => {
    for (const absent of [null, undefined, '']) {
      expect(parseRoutes(absent as unknown)).toEqual({});
    }
  });

  it('returns null for a setting that is PRESENT but unreadable', () => {
    // T214. These used to return {} as well, which then routed every lead to the
    // default account. An unreadable map is not "no routes" — it is "we do not
    // know", and those must not be the same answer.
    for (const corrupt of ['not json', '[]', 42, '[1,2]', 'null{']) {
      expect(parseRoutes(corrupt as unknown)).toBeNull();
    }
  });

  it('drops entries that are not non-empty strings', () => {
    expect(parseRoutes({ a: '', b: '  ', c: 5, d: null, e: 'ok' })).toEqual({ e: 'ok' });
  });
});

describe('resolveGhlAccountForSource', () => {
  it('uses the default account for an unrouted source', async () => {
    // Every source behaved this way before routing existed; unrouted must not change.
    settings({ [ROUTES_SETTING]: {}, ghl_api_key: 'default-key' });

    const r = await resolveGhlAccountForSource('apollo');

    expect(r).toEqual({
      status: 'ready',
      account: { apiKey: 'default-key', accountKey: DEFAULT_ACCOUNT },
    });
  });

  it('WITHHOLDS a routed source whose account has no key yet', async () => {
    // The whole point. open_house is routed to School of Data Analytics, whose
    // key is not provisioned. Falling back to the default here would write the
    // lead into Agent Cory AI.
    settings({
      [ROUTES_SETTING]: { open_house: 'school_of_data_analytics' },
      ghl_api_key: 'default-key-for-agent-cory',
      ghl_api_key_school_of_data_analytics: '',
    });

    const r = await resolveGhlAccountForSource('open_house');

    expect(r.status).toBe('unconfigured');
    expect(r).toMatchObject({
      accountKey: 'school_of_data_analytics',
      settingKey: 'ghl_api_key_school_of_data_analytics',
    });
    expect(JSON.stringify(r)).not.toContain('default-key-for-agent-cory');
  });

  it('routes to the sub-account once its key is provisioned', async () => {
    settings({
      [ROUTES_SETTING]: { open_house: 'school_of_data_analytics' },
      ghl_api_key: 'default-key',
      ghl_api_key_school_of_data_analytics: 'school-key',
    });

    const r = await resolveGhlAccountForSource('open_house');

    expect(r).toEqual({
      status: 'ready',
      account: { apiKey: 'school-key', accountKey: 'school_of_data_analytics' },
    });
  });

  it('folds every spelling of the training site onto one route', async () => {
    // leads.source is free text and training.colaberry.com has three spellings.
    // Routing on the group key rather than the raw source is what makes that safe.
    settings({
      [ROUTES_SETTING]: { training_colaberry: 'school_of_data_analytics' },
      ghl_api_key: 'default-key',
      ghl_api_key_school_of_data_analytics: 'school-key',
    });

    for (const raw of [
      'training.colaberry.com',
      'training.colaberry.com/thank-you',
      'popup',
    ]) {
      const r = await resolveGhlAccountForSource(raw);
      expect(r).toMatchObject({
        status: 'ready',
        account: { accountKey: 'school_of_data_analytics' },
      });
    }
  });

  it('reports no_credentials when even the default key is missing', async () => {
    settings({ [ROUTES_SETTING]: {}, ghl_api_key: '' });
    expect(await resolveGhlAccountForSource('apollo')).toEqual({ status: 'no_credentials' });
  });

  it('trims a padded key rather than sending whitespace as a bearer token', async () => {
    settings({ [ROUTES_SETTING]: {}, ghl_api_key: '  padded-key  ' });
    const r = await resolveGhlAccountForSource('apollo');
    expect(r).toMatchObject({ status: 'ready', account: { apiKey: 'padded-key' } });
  });

  it('withholds rather than defaulting when a key is only whitespace', async () => {
    settings({
      [ROUTES_SETTING]: { open_house: 'school_of_data_analytics' },
      ghl_api_key: 'default-key',
      ghl_api_key_school_of_data_analytics: '   ',
    });
    expect((await resolveGhlAccountForSource('open_house')).status).toBe('unconfigured');
  });

  it('WITHHOLDS when the routes map is corrupt, even though the default key is usable', async () => {
    // T214 — THE FAIL-OPEN SUB-CASE, CLOSED. This test previously asserted the
    // opposite: that a corrupt map falls back to the default account, on the
    // reasoning that a broken map must not withhold every lead and the default key
    // is real. That argument has force, but the default account is Agent Cory AI,
    // the wrong CRM, in front of an outbound dialer — and a corrupt map means we
    // do not KNOW where the lead belongs, so choosing the dialer is a decision
    // made on no evidence. It also contradicted this module's own header and the
    // standing requirement that multi-account routing stay fail-closed.
    //
    // The objection is answered rather than ignored: the withholding is logged
    // per lead and writes a `status: 'withheld'` activity row, so a typo in the
    // setting surfaces instead of silently stopping every sync.
    settings({ [ROUTES_SETTING]: 'not json at all', ghl_api_key: 'default-key' });
    const r = await resolveGhlAccountForSource('open_house');
    expect(r).toEqual({ status: 'routes_unreadable', settingKey: ROUTES_SETTING });
  });

  it('still uses the default account when NO routes are configured', async () => {
    // The control that keeps the fix from becoming "withhold everything": an
    // absent map is not a corrupt one, and every source still syncs.
    settings({ [ROUTES_SETTING]: '', ghl_api_key: 'default-key' });
    const r = await resolveGhlAccountForSource('open_house');
    expect(r).toMatchObject({ status: 'ready', account: { accountKey: DEFAULT_ACCOUNT } });
  });

  it('handles a null source without throwing', async () => {
    settings({ [ROUTES_SETTING]: {}, ghl_api_key: 'default-key' });
    expect((await resolveGhlAccountForSource(null)).status).toBe('ready');
    expect((await resolveGhlAccountForSource(undefined)).status).toBe('ready');
  });
});
