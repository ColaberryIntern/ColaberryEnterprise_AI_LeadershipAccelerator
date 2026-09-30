const findOrCreate = jest.fn();
const enrollmentFindOne = jest.fn();
const enrollmentCreate = jest.fn();

jest.mock('../../models', () => ({
  Enrollment: {
    findOne: (...args: unknown[]) => enrollmentFindOne(...args),
    create: (...args: unknown[]) => enrollmentCreate(...args),
  },
  Lead: {
    findOrCreate: (...args: unknown[]) => findOrCreate(...args),
  },
}));

jest.mock('../../services/participantService', () => ({
  signParticipantJwt: () => 'test.jwt.token',
}));

jest.mock('../../services/reese/reeseWelcomeService', () => ({
  maybeSendWelcomes: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

import { createFreeAccount, normalizeSignupInput } from '../../services/freeSignupService';

/**
 * Free signup must leave an acquisition record.
 *
 * This service created an Enrollment and nothing else, so every guest account
 * was a student who had never been a lead. Measured on production 2026-09-05:
 * 37 of 42 guest-tier enrolments (88%) matched no lead by any available rule,
 * and enrolments traceable to a lead fell from 98% in July to 56% in September
 * as this tier scaled.
 */
describe('free signup captures a lead', () => {
  const enrollment = {
    id: 'enr-1',
    full_name: 'Test Person',
    email: 'test@example.com',
    tier: 'guest',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    enrollmentFindOne.mockResolvedValue(null);
    enrollmentCreate.mockResolvedValue(enrollment);
    findOrCreate.mockResolvedValue([{ id: 1 }, true]);
  });

  it('writes a lead for a brand-new guest', () => {
    return createFreeAccount({ full_name: 'Test Person', email: 'test@example.com' }).then(() => {
      expect(findOrCreate).toHaveBeenCalledTimes(1);
      const call = findOrCreate.mock.calls[0][0] as {
        where: { email: string }; defaults: Record<string, unknown>;
      };
      expect(call.where.email).toBe('test@example.com');
      expect(call.defaults.name).toBe('Test Person');
    });
  });

  it('keys the lead on email so a returning guest never gets a second one', async () => {
    // findOrCreate, not create. The signup path is explicitly idempotent by
    // email for the enrolment; the lead must not be the one thing that
    // duplicates on a repeat visit.
    await createFreeAccount({ full_name: 'Test Person', email: 'test@example.com' });
    const call = findOrCreate.mock.calls[0][0] as { where: { email: string } };
    expect(call.where).toEqual({ email: 'test@example.com' });
  });

  it('captures a lead even when the enrolment already existed', async () => {
    // The 37 guests already on production have enrolments but no leads. Someone
    // signing in again is exactly the case that repairs them, so capture must
    // not be skipped just because the account is being reused.
    enrollmentFindOne.mockResolvedValue(enrollment);
    await createFreeAccount({ full_name: 'Test Person', email: 'test@example.com' });
    expect(findOrCreate).toHaveBeenCalledTimes(1);
    expect(enrollmentCreate).not.toHaveBeenCalled();
  });

  it('normalises the email the same way the identity matcher does', async () => {
    // If these disagreed, the lead would be written under a different key than
    // the enrolment and the join would still fail — the bug would look fixed
    // while staying broken.
    await createFreeAccount({ full_name: '  Test Person  ', email: '  TEST@Example.COM ' });
    const call = findOrCreate.mock.calls[0][0] as { where: { email: string } };
    expect(call.where.email).toBe('test@example.com');
    expect(normalizeSignupInput({ full_name: ' A ', email: ' B@C.COM ' })).toEqual({
      full_name: 'A',
      email: 'b@c.com',
    });
  });

  it('marks the lead with a distinctive source', async () => {
    // A free guest is not an inbound prospect to nurture. The source makes them
    // identifiable and excludable in campaign segments rather than silently
    // swept into one.
    await createFreeAccount({ full_name: 'Test Person', email: 'test@example.com' });
    const call = findOrCreate.mock.calls[0][0] as { defaults: Record<string, unknown> };
    expect(call.defaults.source).toBe('free_signup');
  });

  // ── The property that matters most ────────────────────────────────────────

  it('still signs the user in when lead capture fails', async () => {
    // Best-effort, exactly like the paid path. A CRM problem must never stop
    // someone getting into the product.
    findOrCreate.mockRejectedValue(new Error('database unavailable'));
    const result = await createFreeAccount({
      full_name: 'Test Person',
      email: 'test@example.com',
    });
    expect(result.jwt).toBe('test.jwt.token');
    expect(result.enrollment.id).toBe('enr-1');
  });

  it('logs a failed capture rather than swallowing it', async () => {
    // A silent catch would recreate the exact gap this change closes: no lead,
    // and no signal that there should have been one.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    findOrCreate.mockRejectedValue(new Error('database unavailable'));
    await createFreeAccount({ full_name: 'Test Person', email: 'test@example.com' });
    expect(spy).toHaveBeenCalled();
    const [, context] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(context.error_class).toBe('Error');
    spy.mockRestore();
  });

  it('rejects a signup with no email before touching either table', async () => {
    await expect(
      createFreeAccount({ full_name: 'Test Person', email: '' }),
    ).rejects.toThrow(/required/);
    expect(findOrCreate).not.toHaveBeenCalled();
    expect(enrollmentCreate).not.toHaveBeenCalled();
  });
});
