import { baseUrlAllowed, readWhatsAppConfig, DEFAULT_WHAPI_BASE_URL } from '../config';
import { stateFromHealth, whatsappStatus } from '../whatsappStatus';
import { RateLimitedError, NotConnectedError, type WhatsAppProvider } from '../provider';

/** CH10.1 Configuration (W2: off by default, the base-URL rule) and the card's status. */
const ON = { COMMS_HUB_WHATSAPP_ENABLED: 'true', WHAPI_TOKEN: 'tok_SECRET', NODE_ENV: 'test' } as NodeJS.ProcessEnv;

function fakeProvider(health: WhatsAppProvider['health']): WhatsAppProvider & { health: jest.Mock } {
  const no = jest.fn(() => { throw new Error('not used'); });
  return { health: jest.fn(health), listGroups: no, getGroup: no, sendText: no, sendImage: no, listSentSince: no } as never;
}

describe('readWhatsAppConfig', () => {
  it('is off by default, and off means no token is handed out', () => {
    const c = readWhatsAppConfig({ WHAPI_TOKEN: 'tok' } as NodeJS.ProcessEnv);
    expect([c.enabled, c.token, c.notConfigured, c.baseUrl, c.dailyCap]).toEqual([false, null, 'switched_off', DEFAULT_WHAPI_BASE_URL, 40]);
  });
  it('on without a token is not configured', () => {
    expect(readWhatsAppConfig({ ...ON, WHAPI_TOKEN: '  ' }).notConfigured).toBe('no_token');
  });
  it('on with a token is configured, and the daily cap reads within bounds', () => {
    const c = readWhatsAppConfig({ ...ON, COMMS_HUB_WHATSAPP_DAILY_CAP: '25' });
    expect([c.notConfigured, c.token, c.dailyCap]).toEqual([null, 'tok_SECRET', 25]);
    expect(readWhatsAppConfig({ ...ON, COMMS_HUB_WHATSAPP_DAILY_CAP: '9999' }).dailyCap).toBe(40);
    expect(readWhatsAppConfig({ ...ON, COMMS_HUB_WHATSAPP_DAILY_CAP: 'abc' }).dailyCap).toBe(40);
  });
  it('production refuses any base URL but Whapi\'s own, so the token cannot be sent elsewhere', () => {
    const prod = { ...ON, NODE_ENV: 'production' };
    expect(readWhatsAppConfig(prod).notConfigured).toBeNull();
    expect(readWhatsAppConfig({ ...prod, WHAPI_BASE_URL: 'https://gate.whapi.cloud/' }).notConfigured).toBeNull();
    for (const url of ['https://evil.example.com', 'http://127.0.0.1:3299', 'https://gate.whapi.cloud.evil.com']) {
      const c = readWhatsAppConfig({ ...prod, WHAPI_BASE_URL: url });
      expect([url, c.notConfigured, c.token]).toEqual([url, 'base_url_not_allowed', null]);
    }
  });
  it('the window test seam works outside production only', () => {
    expect(readWhatsAppConfig({ ...ON, COMMS_HUB_WHATSAPP_ALWAYS_OPEN: 'true' }).windowAlwaysOpen).toBe(true);
    expect(readWhatsAppConfig({ ...ON, NODE_ENV: 'production', COMMS_HUB_WHATSAPP_ALWAYS_OPEN: 'true' }).windowAlwaysOpen).toBe(false);
    expect(readWhatsAppConfig(ON).windowAlwaysOpen).toBe(false);
  });
  it('outside production: https or localhost http only', () => {
    expect(baseUrlAllowed('http://127.0.0.1:3299', 'test')).toBe(true);
    expect(baseUrlAllowed('http://localhost:3299', 'development')).toBe(true);
    expect(baseUrlAllowed('https://sandbox.example.com', 'development')).toBe(true);
    expect(baseUrlAllowed('http://10.0.0.5:3299', 'development')).toBe(false);
    expect(baseUrlAllowed('not a url', 'development')).toBe(false);
  });
});

describe('stateFromHealth', () => {
  it.each([
    ['AUTH', 'connected'], ['QR', 'waiting_for_qr'], ['NOT_INIT', 'disconnected'], ['INIT', 'disconnected'],
    ['LAUNCH', 'disconnected'], ['ERROR', 'disconnected'], ['SYNC_ERROR', 'disconnected'], ['SOMETHING_NEW', 'disconnected'],
  ])('%s reads as %s', (raw, state) => {
    const r = stateFromHealth(raw);
    expect(r.state).toBe(state);
    expect(r.reason === null).toBe(state === 'connected');
  });
});

describe('whatsappStatus', () => {
  it('not configured makes no provider call at all', async () => {
    const p = fakeProvider(async () => ({ state: 'AUTH', number: '15551234567' }));
    const s = await whatsappStatus({ config: readWhatsAppConfig({} as NodeJS.ProcessEnv), provider: p });
    expect(s).toEqual({ configured: false, enabled: false, state: 'not_configured', number_last4: null, reason: 'WhatsApp is switched off for the hub.' });
    expect(p.health).not.toHaveBeenCalled();
    const prod = await whatsappStatus({ config: readWhatsAppConfig({ ...ON, NODE_ENV: 'production', WHAPI_BASE_URL: 'https://evil.example.com' }), provider: p });
    expect([prod.state, prod.reason]).toEqual(['not_configured', 'The WhatsApp service address is not allowed, so nothing is sent.']);
    expect(p.health).not.toHaveBeenCalled();
  });
  it('connected shows only the last 4 digits; the token and full number never appear in the answer', async () => {
    const s = await whatsappStatus({ config: readWhatsAppConfig(ON), provider: fakeProvider(async () => ({ state: 'AUTH', number: '15551234567' })) });
    expect(s).toEqual({ configured: true, enabled: true, state: 'connected', number_last4: '4567', reason: null });
    const body = JSON.stringify(s);
    expect(body).not.toContain('tok_SECRET');
    expect(body).not.toContain('5551234567');
  });
  it('waiting for the QR scan says what to do; a provider failure reads as disconnected with a reason', async () => {
    const qr = await whatsappStatus({ config: readWhatsAppConfig(ON), provider: fakeProvider(async () => ({ state: 'QR', number: null })) });
    expect([qr.state, qr.number_last4]).toEqual(['waiting_for_qr', null]);
    const refused = await whatsappStatus({ config: readWhatsAppConfig(ON), provider: fakeProvider(async () => { throw new NotConnectedError(); }) });
    expect([refused.state, refused.reason]).toEqual(['disconnected', 'The WhatsApp token was refused. Check the token on the channel.']);
    const limited = await whatsappStatus({ config: readWhatsAppConfig(ON), provider: fakeProvider(async () => { throw new RateLimitedError(); }) });
    expect([limited.state, limited.reason]).toEqual(['disconnected', 'WhatsApp is limiting this number.']);
    const odd = await whatsappStatus({ config: readWhatsAppConfig(ON), provider: fakeProvider(async () => { throw new TypeError('x'); }) });
    expect(odd.reason).toBe('The WhatsApp status could not be read.');
  });
  it('is a pure read: asking twice asks the provider twice and changes nothing', async () => {
    const p = fakeProvider(async () => ({ state: 'AUTH', number: '15551234567' }));
    const a = await whatsappStatus({ config: readWhatsAppConfig(ON), provider: p });
    const b = await whatsappStatus({ config: readWhatsAppConfig(ON), provider: p });
    expect(a).toEqual(b);
    expect(p.health).toHaveBeenCalledTimes(2);
  });
});
