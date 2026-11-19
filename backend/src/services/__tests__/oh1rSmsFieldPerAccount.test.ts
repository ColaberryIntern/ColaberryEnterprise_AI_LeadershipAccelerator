/**
 * OH1r (Nov 19, the afternoon of the Open House): the School account's send-SMS workflow
 * ("AI Agent - Send SMS") fires on `support_issue_ticket_4`, not `cory_sms_composed`, so every
 * text the scheduler wrote there was saved on the contact and never sent. Pinned here: each
 * account's text field comes from `ghl_sms_field_<account>`, absent means the historical field,
 * an unreadable value means no target (never a guess), and sendSmsViaGhl writes the field given.
 */
const settings: Record<string, unknown> = {};
jest.mock('../settingsService', () => ({ getSetting: jest.fn(async (k: string) => settings[k]) }));

import { ghlSmsTargetForSource, parseSmsField, DEFAULT_SMS_FIELD } from '../leads/ghlAccountRouting';

describe('ghlSmsTargetForSource', () => {
  beforeEach(() => {
    for (const k of Object.keys(settings)) delete settings[k];
    settings.ghl_api_key = 'default-key';
    settings.ghl_api_key_school_of_data_analytics = 'school-key';
    settings.ghl_account_routes = JSON.stringify({ open_house: 'school_of_data_analytics' });
    settings.ghl_sms_field_school_of_data_analytics = 'support_issue_ticket_4';
  });

  it("gives an open house lead the School key and the School workflow's field", async () => {
    expect(await ghlSmsTargetForSource('open_house')).toEqual({
      apiKey: 'school-key', accountKey: 'school_of_data_analytics', smsField: 'support_issue_ticket_4',
    });
  });

  it('keeps the default account on cory_sms_composed when no field is configured', async () => {
    expect(await ghlSmsTargetForSource('apollo')).toEqual({
      apiKey: 'default-key', accountKey: 'default', smsField: 'cory_sms_composed',
    });
  });

  it('gives no target when the configured field is unreadable (never guesses)', async () => {
    settings.ghl_sms_field_school_of_data_analytics = 'support issue ticket #4';
    expect(await ghlSmsTargetForSource('open_house')).toBeNull();
  });

  it('gives no target when the account itself is unroutable', async () => {
    settings.ghl_account_routes = '{not json';
    expect(await ghlSmsTargetForSource('open_house')).toBeNull();
  });
});

describe('parseSmsField', () => {
  it('reads absent as the historical field and accepts a contact.-prefixed key', () => {
    expect(parseSmsField(undefined)).toBe(DEFAULT_SMS_FIELD);
    expect(parseSmsField('')).toBe(DEFAULT_SMS_FIELD);
    expect(parseSmsField('contact.support_issue_ticket_4')).toBe('support_issue_ticket_4');
  });
  it('rejects anything that is not a plain field key', () => {
    expect(parseSmsField('Support issue Ticket #4')).toBeNull();
    expect(parseSmsField(42)).toBeNull();
  });
});

describe('sendSmsViaGhl', () => {
  const fetchMock = jest.fn(async (..._args: any[]) => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }));
  beforeAll(() => { (global as any).fetch = fetchMock; settings.ghl_api_key = 'default-key'; });

  it('writes the field it is given, with the key it is given', async () => {
    const { sendSmsViaGhl } = await import('../ghlService');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sendSmsViaGhl('contact-1', 'Hi, the Open House starts at 6:30 PM today.', 'school-key', 'support_issue_ticket_4');
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, any];
    expect(url).toContain('/contacts/contact-1');
    expect(JSON.stringify(init.headers)).toContain('school-key');
    expect(init.body).toContain('support_issue_ticket_4');
    expect(init.body).not.toContain('cory_sms_composed');
  });
});
