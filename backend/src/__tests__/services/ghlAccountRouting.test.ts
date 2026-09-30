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

  it('treats malformed or empty input as no routes', () => {
    for (const bad of [null, undefined, '', 'not json', '[]', 42]) {
      expect(parseRoutes(bad as unknown)).toEqual({});
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

  it('falls back to the default account when the routes map is corrupt', async () => {
    // A broken map must not withhold every lead in the system; unrouted is the
    // pre-existing behaviour and is safe because the default key is real.
    settings({ [ROUTES_SETTING]: 'not json at all', ghl_api_key: 'default-key' });
    const r = await resolveGhlAccountForSource('open_house');
    expect(r).toMatchObject({ status: 'ready', account: { accountKey: DEFAULT_ACCOUNT } });
  });

  it('handles a null source without throwing', async () => {
    settings({ [ROUTES_SETTING]: {}, ghl_api_key: 'default-key' });
    expect((await resolveGhlAccountForSource(null)).status).toBe('ready');
    expect((await resolveGhlAccountForSource(undefined)).status).toBe('ready');
  });
});
