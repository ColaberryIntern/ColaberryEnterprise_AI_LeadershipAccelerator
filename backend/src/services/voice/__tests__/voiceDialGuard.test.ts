/**
 * OH1 security audit (2026-11-17): the last brake on every outbound AI call.
 */
const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../../../config/env', () => ({ env: { adminAlertPhone: '+12025550123' } }));
jest.mock('../../settingsService', () => ({ getSetting: jest.fn(async () => '"+12145550100"') }));

import { withinDialHours, dialVerdict, checkDialGuard, MAX_DIALS_PER_NUMBER_PER_DAY } from '../voiceDialGuard';
import { logToken, safeRecordingUrl, webhookTokenOk } from '../synthflowWebhookAuth';

// Thursday Nov 19 2026, Central = UTC-6.
const ct = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 19, h + 6, m));

describe('withinDialHours: 10 AM - 8 PM Central (TCPA 8-9 in every continental zone)', () => {
  it.each([
    [9, 59, false], [10, 0, true], [12, 0, true], [19, 59, true], [20, 0, false], [23, 0, false], [3, 0, false],
  ])('%i:%i CT -> %s', (h, m, ok) => {
    expect(withinDialHours(ct(h as number, m as number))).toBe(ok);
  });
});

describe('dialVerdict', () => {
  it('allows inside hours under the cap', () => {
    expect(dialVerdict({ exempt: false, inHours: true, dialsLast24h: 0 })).toEqual({ ok: true });
  });
  it('refuses outside hours', () => {
    expect(dialVerdict({ exempt: false, inHours: false, dialsLast24h: 0 })).toEqual({ ok: false, reason: 'outside_call_hours' });
  });
  it(`refuses the ${MAX_DIALS_PER_NUMBER_PER_DAY + 1}th dial to one number in 24h`, () => {
    expect(dialVerdict({ exempt: false, inHours: true, dialsLast24h: MAX_DIALS_PER_NUMBER_PER_DAY })).toEqual({ ok: false, reason: 'number_dialed_recently' });
  });
  it('fails closed when the dial record cannot be read', () => {
    expect(dialVerdict({ exempt: false, inHours: true, dialsLast24h: null })).toEqual({ ok: false, reason: 'dial_guard_unavailable' });
  });
  it('lets staff alert numbers through at any hour', () => {
    expect(dialVerdict({ exempt: true, inHours: false, dialsLast24h: null })).toEqual({ ok: true });
  });
});

describe('checkDialGuard (with the database)', () => {
  beforeEach(() => query.mockReset());
  it('counts dials to the number and refuses once the cap is reached', async () => {
    query.mockImplementation(async (sql: string) => (/COUNT/.test(sql) ? [{ n: '2' }] : []));
    expect(await checkDialGuard('+15125550123', ct(12))).toEqual({ ok: false, reason: 'number_dialed_recently' });
  });
  it('allows a first call at noon', async () => {
    query.mockImplementation(async (sql: string) => (/COUNT/.test(sql) ? [{ n: '0' }] : []));
    expect(await checkDialGuard('+15125550123', ct(12))).toEqual({ ok: true });
  });
  it('refuses when the database errors (fail closed)', async () => {
    query.mockRejectedValue(new Error('db down'));
    expect(await checkDialGuard('+15125550123', ct(12))).toEqual({ ok: false, reason: 'dial_guard_unavailable' });
  });
  it('exempts ADMIN_ALERT_PHONE and the executive phone setting, even at night', async () => {
    query.mockRejectedValue(new Error('db down'));
    expect(await checkDialGuard('+12025550123', ct(23))).toEqual({ ok: true });
    expect(await checkDialGuard('+12145550100', ct(23))).toEqual({ ok: true });
  });
});

describe('webhookTokenOk (Synthflow call-complete)', () => {
  it('VS4.2: with no token configured, production refuses everything; elsewhere it is open', () => {
    expect(webhookTokenOk('', undefined, true)).toBe(false);
    expect(webhookTokenOk('', '', true)).toBe(false);
    expect(webhookTokenOk('', 'guess', true)).toBe(false);
    expect(webhookTokenOk('', undefined, false)).toBe(true);
  });
  it('VS4.2: production is the default when NODE_ENV says so', () => {
    const was = process.env.NODE_ENV;
    try { process.env.NODE_ENV = 'production'; expect(webhookTokenOk('', undefined)).toBe(false); } finally { process.env.NODE_ENV = was; }
  });
  it.each(['javascript:alert(1)', 'http://a.example/x', 'data:text/html,x', 'https://u:p@a.example/', 'nope', 7, null])('VS4.2: recording link %p is dropped', (v) => {
    expect(safeRecordingUrl(v)).toBe('');
  });
  it('VS4.2: an https recording link is kept; log values stay on one line', () => {
    expect(safeRecordingUrl('https://rec.example/a.mp3')).toBe('https://rec.example/a.mp3');
    expect(logToken('done\n{"level":"error"}')).not.toMatch(/[\n{"]/);
  });
  it('requires the exact token once one is configured', () => {
    expect(webhookTokenOk('s3cret-token', 's3cret-token')).toBe(true);
    expect(webhookTokenOk('s3cret-token', 's3cret-tokeX')).toBe(false);
    expect(webhookTokenOk('s3cret-token', undefined)).toBe(false);
    expect(webhookTokenOk('s3cret-token', 's3cret')).toBe(false);
  });
});
