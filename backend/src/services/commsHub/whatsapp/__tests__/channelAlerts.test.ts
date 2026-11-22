const mockClaim = jest.fn();
jest.mock('../sendState', () => ({ sendStateStore: { claimAlert: (...a: unknown[]) => mockClaim(...a) } }));
const mockActivity = jest.fn();
jest.mock('../../activityLog', () => ({ WORKER_ACTOR: { id: null, label: 'Scheduled sender' }, logActivity: (...a: unknown[]) => mockActivity(...a) }));
const mockEmit = jest.fn();
jest.mock('../../../alertService', () => ({ emitAlert: (...a: unknown[]) => mockEmit(...a) }));
const mockEmail = jest.fn();
jest.mock('../../../emailService', () => ({ sendAlertEmail: (...a: unknown[]) => mockEmail(...a) }));
let mockRecipients: unknown[] = ['ops@colaberry.com', 'jackie@colaberry.com'];
jest.mock('../../../../models/CommsHubSettings', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => ({ alert_recipients: mockRecipients })) } }));
const mockEnv = { mandrillApiKey: 'set', smtpUser: '', smtpPass: '' };
jest.mock('../../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../alerts/failureAlerts', () => ({ mailSafe: (s: string) => s.replace(/[<>]/g, '') }));

import { raiseChannelAlert } from '../channelAlerts';

/** CH10.4 the WhatsApp channel alert: once per key, to every recipient, and it never throws. */
const A = { key: 'breaker:2026-12-03T18:00:00.000Z', title: 'WhatsApp paused the hub number for 48 hours', description: 'Other channels keep sending.' };
let err: jest.SpyInstance; let out: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks(); for (const f of [mockClaim, mockActivity, mockEmit, mockEmail]) f.mockReset(); mockRecipients = ['ops@colaberry.com', 'jackie@colaberry.com']; mockEnv.mandrillApiKey = 'set';
  mockClaim.mockResolvedValue(true);
  err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  out = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { err.mockRestore(); out.mockRestore(); });
const logged = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => JSON.parse(String(c[0])));

it('the first time for a key: one activity row, one admin alert, one email per recipient', async () => {
  await raiseChannelAlert(A);
  expect(mockClaim).toHaveBeenCalledWith(A.key);
  expect(mockActivity).toHaveBeenCalledTimes(1);
  expect(mockActivity.mock.calls[0][1]).toBe('whatsapp.alert');
  expect(mockEmit).toHaveBeenCalledTimes(1);
  expect(mockEmit.mock.calls[0][0]).toMatchObject({ title: A.title, impactArea: 'communications', metadata: { key: A.key } });
  expect(mockEmail.mock.calls.map((c) => c[0])).toEqual(['ops@colaberry.com', 'jackie@colaberry.com']);
});

it('a key already alerted sends nothing at all (a re-run, or a second worker)', async () => {
  mockClaim.mockResolvedValue(false);
  await raiseChannelAlert(A);
  await raiseChannelAlert(A);
  expect([mockActivity, mockEmit, mockEmail].map((f) => f.mock.calls.length)).toEqual([0, 0, 0]);
});

it('a second breaker opening is a new key and alerts again', async () => {
  const seen = new Set<string>();
  mockClaim.mockImplementation(async (k: string) => (seen.has(k) ? false : (seen.add(k), true)));
  await raiseChannelAlert(A);
  await raiseChannelAlert(A);
  await raiseChannelAlert({ ...A, key: 'breaker:2026-12-05T18:00:00.000Z' });
  expect(mockEmit).toHaveBeenCalledTimes(2);
});

it.each([
  ['the admin alert', () => mockEmit.mockRejectedValue(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' })), 'SequelizeConnectionError'],
  ['the email', () => mockEmail.mockRejectedValue(Object.assign(new Error('smtp 421'), { name: 'SmtpError' })), 'SmtpError'],
  ['the key claim', () => mockClaim.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), 'TimeoutError'],
])('%s failing never throws; it is logged with its error class', async (_n, arrange, cls) => {
  arrange();
  await expect(raiseChannelAlert(A)).resolves.toBeUndefined();
  expect(logged(err).find((l) => l.event === 'comms_hub_whatsapp_alert_failed')).toMatchObject({ error_class: cls, outcome: 'failure', context: { key: A.key } });
});

it('no mail transport: the admin alert still goes, no email is attempted, and it says why', async () => {
  mockEnv.mandrillApiKey = '';
  await raiseChannelAlert(A);
  expect(mockEmit).toHaveBeenCalledTimes(1);
  expect(mockEmail).not.toHaveBeenCalled();
  expect(logged(err).find((l) => l.event === 'comms_hub_whatsapp_alert_no_mail')).toMatchObject({ error_class: 'SmtpNotConfigured' });
});

it('only real addresses get an email', async () => {
  mockRecipients = ['ops@colaberry.com', 'not-an-address', 42, null];
  await raiseChannelAlert(A);
  expect(mockEmail.mock.calls.map((c) => c[0])).toEqual(['ops@colaberry.com']);
});
