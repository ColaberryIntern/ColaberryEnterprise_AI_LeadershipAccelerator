/**
 * resolveEmailRecipient under test mode — the WIRING, not the clock.
 *
 * testModeWindow.test.ts proves the staleness rule in isolation. That is not
 * enough on its own: the rule only protects anybody if `resolveTestRedirect`
 * actually consults it, and a pure test stays green while the call is deleted.
 * That is exactly how the original defect survived, so it is tested here
 * through the public function every sender goes through.
 */
const mockGetTestOverrides = jest.fn();
const mockGetSettingUpdatedAt = jest.fn();

jest.mock('../../settingsService', () => ({
  getTestOverrides: (...a: unknown[]) => mockGetTestOverrides(...a),
  getSettingUpdatedAt: (...a: unknown[]) => mockGetSettingUpdatedAt(...a),
  getSetting: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { resolveEmailRecipient, resolveDeliveryAddress } from '../../emailService';

const STUDENT = 'student@example.com';
const SINK = 'ali@colaberry.com';
const SUBJECT = '[Accelerator] Your Community Digest';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

beforeEach(() => {
  mockGetTestOverrides.mockReset();
  mockGetSettingUpdatedAt.mockReset();
  mockGetTestOverrides.mockResolvedValue({ enabled: true, email: SINK, phone: '' });
});

describe('test mode redirect', () => {
  it('redirects while the flag is FRESH, which is what test mode is for', async () => {
    mockGetSettingUpdatedAt.mockResolvedValue(hoursAgo(1));
    const r = await resolveEmailRecipient(STUDENT, SUBJECT);
    expect(r.to).toBe(SINK);
    expect(r.subject).toContain(STUDENT);
  });

  it('STOPS redirecting once the flag is stale, even though it is still true', async () => {
    // The incident: enabled 29 hours earlier and never switched back.
    mockGetSettingUpdatedAt.mockResolvedValue(hoursAgo(29));
    const r = await resolveEmailRecipient(STUDENT, SUBJECT);
    expect(r.to).toBe(STUDENT);
    expect(r.subject).toBe(SUBJECT);
    // The flag itself was never consulted as "off" - it is still enabled.
    expect(mockGetTestOverrides).toHaveBeenCalled();
  });

  it('does not redirect when the flag has no timestamp at all', async () => {
    mockGetSettingUpdatedAt.mockResolvedValue(null);
    expect((await resolveEmailRecipient(STUDENT, SUBJECT)).to).toBe(STUDENT);
  });

  it('leaves the recipient alone when test mode is simply off', async () => {
    mockGetTestOverrides.mockResolvedValue({ enabled: false, email: '', phone: '' });
    const r = await resolveEmailRecipient(STUDENT, SUBJECT);
    expect(r.to).toBe(STUDENT);
    expect(mockGetSettingUpdatedAt).not.toHaveBeenCalled();
  });

  it('never redirects a credential email, even with a FRESH flag', async () => {
    mockGetSettingUpdatedAt.mockResolvedValue(hoursAgo(1));
    const r = await resolveEmailRecipient(STUDENT, 'Your Portal Access Link', {
      neverRedirect: true,
    });
    expect(r.to).toBe(STUDENT);
    expect(r.subject).toBe('Your Portal Access Link');
    // Short-circuits before the settings are read at all.
    expect(mockGetTestOverrides).not.toHaveBeenCalled();
  });

  it('keeps resolveDeliveryAddress in step, so dedup keys cannot diverge', async () => {
    mockGetSettingUpdatedAt.mockResolvedValue(hoursAgo(29));
    expect(await resolveDeliveryAddress(STUDENT)).toBe(STUDENT);
    mockGetSettingUpdatedAt.mockResolvedValue(hoursAgo(1));
    expect(await resolveDeliveryAddress(STUDENT)).toBe(SINK);
  });

  it('falls back to no redirect when the settings lookup throws', async () => {
    mockGetTestOverrides.mockRejectedValue(new Error('settings db down'));
    expect((await resolveEmailRecipient(STUDENT, SUBJECT)).to).toBe(STUDENT);
  });
});
