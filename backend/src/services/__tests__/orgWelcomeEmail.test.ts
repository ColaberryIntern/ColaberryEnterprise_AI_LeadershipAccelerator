import { registerManager } from '../orgService';
import { Organization, OrgMember, Lead } from '../../models';
import { createFreeAccount } from '../freeSignupService';
import { sendOrgWelcomeEmail } from '../emailService';

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../../models', () => ({
  Organization: { findOrCreate: jest.fn(), findByPk: jest.fn() },
  OrgMember: { findOrCreate: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
  Enrollment: { findByPk: jest.fn() },
  Lead: { findOne: jest.fn() },
}));

jest.mock('../freeSignupService', () => ({ createFreeAccount: jest.fn() }));
jest.mock('../emailService', () => ({
  sendOrgWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendOrgInviteEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../middlewares/orgAuth', () => ({ assertMemberInOrg: jest.fn() }));

const mockOrg = (over: Record<string, unknown> = {}) => ({
  id: 'org-1',
  name: 'Acme Co',
  owner_enrollment_id: 'enr-1',
  lead_id: null,
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (createFreeAccount as jest.Mock).mockResolvedValue({
    jwt: 'jwt-token',
    enrollment: { id: 'enr-1', full_name: 'Dana Reyes', email: 'dana@acme.test', tier: 'guest' },
  });
  (OrgMember.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'm-1' }, true]);
  (Lead.findOne as jest.Mock).mockResolvedValue(null);
});

/**
 * Registration used to send NO email at all — a company signed up on the public
 * site and heard only silence, while their invited teammates did get one.
 *
 * The load-bearing property is IDEMPOTENCY. `registerManager` is find-or-create
 * and is called again on every repeat submit (the signup page can be
 * re-submitted, and the endpoint is deliberately replay-safe), so the welcome
 * must fire exactly once per business account, not once per request.
 */
describe('registerManager — welcome email', () => {
  it('sends exactly one welcome when the organization is created', async () => {
    (Organization.findOrCreate as jest.Mock).mockResolvedValue([mockOrg(), true]);

    await registerManager({ name: 'Dana Reyes', email: 'dana@acme.test', company: 'Acme Co' });

    expect(sendOrgWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(sendOrgWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dana@acme.test',
        fullName: 'Dana Reyes',
        orgName: 'Acme Co',
        hasRealCompanyName: true,
      }),
    );
  });

  it('sends NOTHING when the organization already existed', async () => {
    // findOrCreate returns created:false on a replay. This is the guard that
    // stops a repeat submit from mailing the same person twice.
    (Organization.findOrCreate as jest.Mock).mockResolvedValue([mockOrg(), false]);

    await registerManager({ name: 'Dana Reyes', email: 'dana@acme.test', company: 'Acme Co' });

    expect(sendOrgWelcomeEmail).not.toHaveBeenCalled();
  });

  it('registering twice produces exactly one email across both calls', async () => {
    (Organization.findOrCreate as jest.Mock)
      .mockResolvedValueOnce([mockOrg(), true])
      .mockResolvedValueOnce([mockOrg(), false]);

    const input = { name: 'Dana Reyes', email: 'dana@acme.test', company: 'Acme Co' };
    await registerManager(input);
    await registerManager(input);

    expect(sendOrgWelcomeEmail).toHaveBeenCalledTimes(1);
  });
});

describe('registerManager — the welcome never breaks registration', () => {
  it('still returns a session when the mailer throws', async () => {
    // The account, its roster and the JWT are the load-bearing outcomes. A
    // courtesy email failing must not cost someone their account.
    (Organization.findOrCreate as jest.Mock).mockResolvedValue([mockOrg(), true]);
    (sendOrgWelcomeEmail as jest.Mock).mockRejectedValue(new Error('SMTP unavailable'));

    const result = await registerManager({
      name: 'Dana Reyes',
      email: 'dana@acme.test',
      company: 'Acme Co',
    });

    expect(result.jwt).toBe('jwt-token');
    expect(result.organization.id).toBe('org-1');
  });

  it('logs a structured failure rather than swallowing it', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (Organization.findOrCreate as jest.Mock).mockResolvedValue([mockOrg(), true]);
    (sendOrgWelcomeEmail as jest.Mock).mockRejectedValue(new Error('SMTP unavailable'));

    await registerManager({ name: 'Dana Reyes', email: 'dana@acme.test', company: 'Acme Co' });

    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('org_welcome_email_failed');
    expect(logged).toContain('SMTP unavailable');
    spy.mockRestore();
  });
});

describe('registerManager — "did they supply a company" is about the INPUT', () => {
  it('flags a real company name when one was typed', async () => {
    (Organization.findOrCreate as jest.Mock).mockResolvedValue([mockOrg(), true]);

    await registerManager({ name: 'Dana Reyes', email: 'dana@acme.test', company: 'Acme Co' });

    expect(sendOrgWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ hasRealCompanyName: true }),
    );
  });

  it('flags NO real company when the field was blank, even though the org has a name', async () => {
    // registerManager falls back to the person's own name, so the stored org
    // name is non-empty either way. Asking "is the name set?" would always say
    // yes and address the email to "Welcome to Dana Reyes".
    (Organization.findOrCreate as jest.Mock).mockResolvedValue([
      mockOrg({ name: 'Dana Reyes' }),
      true,
    ]);

    await registerManager({ name: 'Dana Reyes', email: 'dana@acme.test', company: '   ' });

    expect(sendOrgWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orgName: 'Dana Reyes', hasRealCompanyName: false }),
    );
  });

  it('treats a missing company field the same as a blank one', async () => {
    (Organization.findOrCreate as jest.Mock).mockResolvedValue([
      mockOrg({ name: 'Dana Reyes' }),
      true,
    ]);

    await registerManager({ name: 'Dana Reyes', email: 'dana@acme.test' });

    expect(sendOrgWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ hasRealCompanyName: false }),
    );
  });
});
