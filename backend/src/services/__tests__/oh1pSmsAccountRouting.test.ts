/**
 * OH1p (Nov 18, the night before the Open House): the countdown text would have failed for every
 * consented registrant. Their GHL contacts live in the School of Data Analytics sub-account, and
 * sendSmsViaGhl wrote `cory_sms_composed` with the default (Agent Cory AI) key, which cannot see
 * them. Pinned here: the key follows the lead's source, an unroutable source yields no key, and
 * sendSmsViaGhl passes the key it is given to the contact update.
 */
const settings: Record<string, unknown> = {};
jest.mock('../settingsService', () => ({ getSetting: jest.fn(async (k: string) => settings[k]) }));

import { ghlApiKeyForSource } from '../leads/ghlAccountRouting';

describe('ghlApiKeyForSource', () => {
  beforeEach(() => {
    for (const k of Object.keys(settings)) delete settings[k];
    settings.ghl_api_key = 'default-key';
    settings.ghl_api_key_school_of_data_analytics = 'school-key';
    settings.ghl_account_routes = JSON.stringify({ open_house: 'school_of_data_analytics' });
  });

  it('gives an open house lead the School account key, not the default', async () => {
    expect(await ghlApiKeyForSource('open_house')).toBe('school-key');
  });

  it('gives an unrouted source the default key', async () => {
    expect(await ghlApiKeyForSource('apollo')).toBe('default-key');
  });

  it('gives no key when the route map is unreadable (never guesses the default)', async () => {
    settings.ghl_account_routes = '{not json';
    expect(await ghlApiKeyForSource('open_house')).toBeNull();
  });

  it('gives no key when the routed account has no key on file', async () => {
    delete settings.ghl_api_key_school_of_data_analytics;
    expect(await ghlApiKeyForSource('open_house')).toBeNull();
  });
});

describe('sendSmsViaGhl', () => {
  const fetchMock = jest.fn(async (..._args: any[]) => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }));
  beforeAll(() => { (global as any).fetch = fetchMock; settings.ghl_api_key = 'default-key'; });

  it('authenticates the contact update with the key it is given', async () => {
    const { sendSmsViaGhl } = await import('../ghlService');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sendSmsViaGhl('contact-1', 'Hi, the Open House starts at 6:30 PM today.', 'school-key');
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, any];
    expect(url).toContain('/contacts/contact-1');
    expect(JSON.stringify(init.headers)).toContain('school-key');
    expect(JSON.stringify(init.headers)).not.toContain('default-key');
    expect(init.body).toContain('cory_sms_composed');
  });
});
